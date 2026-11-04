package ai.mojulo.maison3d.furnish

import android.util.Base64
import android.util.Log
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import org.json.JSONObject

/**
 * One turn: what you said (as audio), what you pointed at and the room go to the laptop server, which transcribes,
 * asks the model, and answers with the words it heard, a reply and the furnished scene. The server holds the API key
 * and the scene; the headset only ever talks to it, over `adb reverse`.
 */
class Turns(private val base: String) {
  private val io = Executors.newSingleThreadExecutor()

  /** The first half of a turn: only the words, back as soon as the server has heard them: { said }. */
  fun hear(wav: ByteArray, room: JSONObject, done: (Result<JSONObject>) -> Unit) {
    io.execute {
      done(runCatching { post("/api/hear", JSONObject().put("audio", Base64.encodeToString(wav, Base64.NO_WRAP)).put("mime", "audio/wav").put("room", room)) })
    }
  }

  /** The second half: those words, what was pointed at and the room, to Muse; answers with the reply, scene and room. */
  fun act(said: String, pointing: JSONObject?, room: JSONObject, voice: Boolean, done: (Result<JSONObject>) -> Unit) {
    io.execute {
      done(
          runCatching {
            val body =
                JSONObject()
                    .put("text", said)
                    .put("pointing", pointing ?: JSONObject.NULL)
                    .put("room", room)
                    .put("voice", voice) // the reply as audio too, when the headset cannot speak it
            post("/api/turn", body)
          },
      )
    }
  }

  /** The furnished scene the server holds: { scene: [ { id, item, at, facing } ] }. */
  fun scene(done: (Result<JSONObject>) -> Unit) {
    io.execute { done(runCatching { get("/api/scene") }) }
  }

  /** The room the headset just read; answers with the scene and the empty room to stand in VR. */
  fun room(room: JSONObject, session: String, done: (Result<JSONObject>) -> Unit) {
    io.execute { done(runCatching { post("/api/room", JSONObject().put("room", room).put("session", session)) }) }
  }

  /** A piece the person moved with the laser: where they let go of it; answers with where it ended up, and why. */
  fun move(id: String, at: org.json.JSONArray, facing: org.json.JSONArray, done: (Result<JSONObject>) -> Unit) {
    io.execute { done(runCatching { post("/api/move", JSONObject().put("id", id).put("at", at).put("facing", facing)) }) }
  }

  /** Takes every piece away; answers with the (empty) scene. */
  fun clear(done: (Result<JSONObject>) -> Unit) {
    io.execute { done(runCatching { post("/api/clear", JSONObject()) }) }
  }

  fun health(done: (Result<JSONObject>) -> Unit) {
    io.execute { done(runCatching { get("/api/health") }) }
  }

  /** Retried once on a dropped connection: a fresh one is opened for the second try. */
  private fun post(path: String, body: JSONObject): JSONObject =
      try {
        postOnce(path, body)
      } catch (e: java.io.IOException) {
        Log.w("Maison3DFurnish", "turn failed (${e.message}), retrying on a new connection")
        postOnce(path, body)
      }

  private fun postOnce(path: String, body: JSONObject): JSONObject {
    val conn = open(path)
    conn.requestMethod = "POST"
    conn.doOutput = true
    conn.setRequestProperty("content-type", "application/json")
    conn.outputStream.use { it.write(body.toString().toByteArray()) }
    return read(conn)
  }

  private fun get(path: String): JSONObject = read(open(path))

  private fun open(path: String): HttpURLConnection =
      (URL(base.trimEnd('/') + path).openConnection() as HttpURLConnection).apply {
        connectTimeout = 3000
        readTimeout = 60000
        // no pooled connections: the laptop server closes idle ones, and a turn sent on one fails
        setRequestProperty("connection", "close")
      }

  private fun read(conn: HttpURLConnection): JSONObject {
    val code = conn.responseCode
    val text = (if (code < 400) conn.inputStream else conn.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
    conn.disconnect()
    val json = runCatching { JSONObject(text) }.getOrElse { JSONObject().put("error", text.take(200)) }
    if (code >= 400) {
      Log.w("Maison3DFurnish", "server said $code: $text")
      throw IllegalStateException(json.optString("error", "server said $code"))
    }
    return json
  }
}
