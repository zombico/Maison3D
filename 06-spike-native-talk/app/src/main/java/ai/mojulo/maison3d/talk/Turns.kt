package ai.mojulo.maison3d.talk

import android.util.Base64
import android.util.Log
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import org.json.JSONObject

/**
 * One turn: what you said (as audio), what you pointed at, the room and the cube go to the laptop server, which
 * transcribes, asks the model, and answers with the words it heard, a reply and the cube's new state. The server
 * holds the API key; the headset only ever talks to it, over `adb reverse`.
 */
class Turns(private val base: String) {
  private val io = Executors.newSingleThreadExecutor()

  fun send(wav: ByteArray, pointing: JSONObject?, room: JSONObject, cube: JSONObject, voice: Boolean, done: (Result<JSONObject>) -> Unit) {
    io.execute {
      done(
          runCatching {
            val body =
                JSONObject()
                    .put("audio", Base64.encodeToString(wav, Base64.NO_WRAP))
                    .put("mime", "audio/wav")
                    .put("pointing", pointing ?: JSONObject.NULL)
                    .put("room", room)
                    .put("cube", cube)
                    .put("voice", voice) // the reply as audio too, when the headset cannot speak it
            post("/api/turn", body)
          },
      )
    }
  }

  fun health(done: (Result<JSONObject>) -> Unit) {
    io.execute { done(runCatching { get("/api/health") }) }
  }

  /** Retried once on a dropped connection: a fresh one is opened for the second try. */
  private fun post(path: String, body: JSONObject): JSONObject =
      try {
        postOnce(path, body)
      } catch (e: java.io.IOException) {
        Log.w("Maison3DTalk", "turn failed (${e.message}), retrying on a new connection")
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
      Log.w("Maison3DTalk", "server said $code: $text")
      throw IllegalStateException(json.optString("error", "server said $code"))
    }
    return json
  }
}
