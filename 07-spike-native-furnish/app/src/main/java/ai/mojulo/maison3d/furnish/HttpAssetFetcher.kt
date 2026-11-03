package ai.mojulo.maison3d.furnish

import android.net.Uri
import android.util.Log
import com.meta.spatial.runtime.AssetFetcher
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * Downloads a model the SDK asked for (a `Mesh` with an http URL) into the file it caches it in. Stands in for the
 * SDK's own OkHttpAssetFetcher, which crashed on a Quest 3S: it needs com.meta.okhttp3compat, a class the published
 * 0.14.0 packages do not include (NoClassDefFoundError on the first download, spike 07).
 */
class HttpAssetFetcher : AssetFetcher {
  private val io = Executors.newFixedThreadPool(2)

  override fun fetchAsset(uri: Uri, file: File, onSuccess: () -> Unit, onError: (Exception) -> Unit) {
    io.execute {
      try {
        val conn = (URL(uri.toString()).openConnection() as HttpURLConnection).apply {
          connectTimeout = 5000
          readTimeout = 60000
          setRequestProperty("connection", "close")
        }
        val code = conn.responseCode
        if (code != 200) throw java.io.IOException("$uri: server said $code")
        file.parentFile?.mkdirs()
        val part = File(file.parentFile, file.name + ".part")
        conn.inputStream.use { input -> part.outputStream().use { input.copyTo(it) } }
        conn.disconnect()
        if (!part.renameTo(file)) throw java.io.IOException("could not move the download into $file")
        Log.i("Maison3DFurnish", "downloaded $uri (${file.length() / 1024} KB)")
        onSuccess()
      } catch (e: Exception) {
        Log.e("Maison3DFurnish", "download of $uri failed", e)
        onError(e)
      }
    }
  }
}
