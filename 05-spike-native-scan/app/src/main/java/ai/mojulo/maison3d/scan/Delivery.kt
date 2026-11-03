package ai.mojulo.maison3d.scan

import android.content.Context
import android.util.Log
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant
import java.util.concurrent.Executors
import org.json.JSONObject

/**
 * Where scans go: always a file on the headset (pull it with adb), and also spike 00's laptop server when it is
 * reachable. By default that is http://localhost:8080 over `adb reverse tcp:8080 tcp:8080`; launch the app with
 * `--es send http://<laptop>:8080` to use another address.
 */
class Delivery(private val context: Context, private val sendBase: String?) {
  private val io = Executors.newSingleThreadExecutor()

  /**
   * Writes `scan` (plus MRUK's own serialisation of the scene, when given) off the main thread and reports each
   * outcome as a line of text.
   */
  fun deliver(scan: JSONObject, mrukJson: String?, report: (String) -> Unit) {
    io.execute {
      try {
        if (mrukJson != null) {
          // MRUK's format, in its own (Unity) coordinates: everything it knows, including the global mesh
          scan.put("mruk", runCatching { JSONObject(mrukJson) }.getOrElse { mrukJson })
        }
        val body = scan.toString()
        val file = save(scan.optString("reason", "scan"), body)
        report("saved ${file.name} (${body.length / 1024} KB)")
        if (sendBase != null) report(send(body))
      } catch (e: Exception) {
        Log.e(TAG, "delivery failed", e)
        report("save failed: ${e.message}")
      }
    }
  }

  fun dir(): File = File(context.getExternalFilesDir(null), "scans").apply { mkdirs() }

  private fun save(reason: String, body: String): File {
    val stamp = Instant.now().toString().replace(Regex("[:.]"), "-")
    val file = File(dir(), "scan-$stamp-native-$reason.json")
    file.writeText(body)
    Log.i(TAG, "saved ${file.absolutePath}")
    return file
  }

  private fun send(body: String): String {
    val url = URL(sendBase!!.trimEnd('/') + "/api/scan")
    return try {
      val conn = url.openConnection() as HttpURLConnection
      conn.requestMethod = "POST"
      conn.connectTimeout = 3000
      conn.readTimeout = 15000
      conn.doOutput = true
      conn.setRequestProperty("content-type", "application/json")
      conn.outputStream.use { it.write(body.toByteArray()) }
      val code = conn.responseCode
      val text = (if (code < 400) conn.inputStream else conn.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
      conn.disconnect()
      if (code < 400) {
        val file = runCatching { JSONObject(text).optString("file") }.getOrDefault("")
        "sent to laptop: $file"
      } else {
        "laptop said $code: ${text.take(120)}"
      }
    } catch (e: Exception) {
      Log.w(TAG, "send to $url failed", e)
      "not sent to $sendBase (${e.javaClass.simpleName}); the file is on the headset"
    }
  }

  companion object {
    private const val TAG = "Maison3DScan"
  }
}
