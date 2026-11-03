package ai.mojulo.maison3d.talk

import android.annotation.SuppressLint
import android.content.Context
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.util.Log
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.Locale

/**
 * Hold to talk: 16 kHz mono 16-bit PCM from the headset's microphones, handed over as a WAV when you let go.
 * The words are worked out on the laptop server (Meta's speech-to-text), so the app needs no recogniser of its own.
 */
class Recorder {
  private var record: AudioRecord? = null
  private var thread: Thread? = null
  private val pcm = ByteArrayOutputStream()
  @Volatile private var running = false

  val isRecording: Boolean
    get() = running

  @SuppressLint("MissingPermission") // checked by the activity before start()
  fun start(): Boolean {
    if (running) return true
    val min = AudioRecord.getMinBufferSize(RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
    val r =
        try {
          AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, maxOf(min, RATE))
        } catch (e: Exception) {
          Log.e(TAG, "no microphone", e)
          return false
        }
    if (r.state != AudioRecord.STATE_INITIALIZED) {
      r.release()
      return false
    }
    synchronized(pcm) { pcm.reset() }
    record = r
    running = true
    r.startRecording()
    thread =
        Thread {
              val buf = ByteArray(3200) // 100 ms
              while (running) {
                val n = r.read(buf, 0, buf.size)
                if (n > 0) synchronized(pcm) { if (pcm.size() < MAX_BYTES) pcm.write(buf, 0, n) }
              }
            }
            .apply { start() }
    return true
  }

  /** Stops and returns what was said as a WAV file, or null when it was too short to be speech. */
  fun stop(): ByteArray? {
    if (!running) return null
    running = false
    thread?.join(500)
    record?.run {
      runCatching { stop() }
      release()
    }
    record = null
    val data = synchronized(pcm) { pcm.toByteArray() }
    return if (data.size < RATE * 2 / 4) null else wav(data) // under a quarter of a second
  }

  private fun wav(data: ByteArray): ByteArray {
    val h = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
    h.put("RIFF".toByteArray()).putInt(36 + data.size).put("WAVE".toByteArray())
    h.put("fmt ".toByteArray()).putInt(16).putShort(1).putShort(1).putInt(RATE).putInt(RATE * 2).putShort(2).putShort(16)
    h.put("data".toByteArray()).putInt(data.size)
    return h.array() + data
  }

  companion object {
    const val RATE = 16000
    private const val MAX_BYTES = RATE * 2 * 30 // 30 s
    private const val TAG = "Maison3DTalk"
  }
}

/** Reads answers aloud with the headset's text-to-speech engine, when it has one; otherwise they stay on the panel. */
class Speaker(context: Context, private val report: (String) -> Unit) {
  @Volatile private var ready = false
  private lateinit var tts: TextToSpeech

  init {
    tts =
        TextToSpeech(context) { status ->
          if (status == TextToSpeech.SUCCESS) {
            val lang = tts.setLanguage(Locale.US)
            ready = lang != TextToSpeech.LANG_MISSING_DATA && lang != TextToSpeech.LANG_NOT_SUPPORTED
            report(if (ready) "speech out: ${tts.defaultEngine ?: "default engine"}" else "speech out: engine has no English voice")
          } else {
            report("speech out: no text-to-speech engine on this headset; answers show on the panel")
          }
        }
  }

  fun say(text: String) {
    if (ready) tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "reply")
  }

  fun stop() {
    tts.stop()
    tts.shutdown()
  }
}

/** What the headset offers for speech recognition of its own, reported once for the record. */
fun recognizerReport(context: Context): String =
    "on-device recognizer: " + if (SpeechRecognizer.isRecognitionAvailable(context)) "available" else "none"
