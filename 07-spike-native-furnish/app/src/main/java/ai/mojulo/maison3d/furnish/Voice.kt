package ai.mojulo.maison3d.furnish

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
    private const val TAG = "Maison3DFurnish"
  }
}

/**
 * Reads answers aloud. First choice is the headset's own text-to-speech with any English voice it has (spike 06 found
 * a Quest whose engine refused US English); otherwise `needsServerVoice` asks the laptop for the reply as audio,
 * which `play` then plays; failing both, answers stay on the panel.
 */
class Speaker(private val context: Context, private val report: (String) -> Unit) {
  @Volatile private var ready = false
  @Volatile var needsServerVoice = false
    private set
  private lateinit var tts: TextToSpeech
  private var player: android.media.MediaPlayer? = null

  init {
    tts =
        TextToSpeech(context) { status ->
          if (status != TextToSpeech.SUCCESS) {
            needsServerVoice = true
            report("speech out: no text-to-speech engine here; asking the laptop to speak")
          } else {
            ready = pickEnglish()
            needsServerVoice = !ready
            report(
                if (ready) "speech out: ${tts.defaultEngine ?: "engine"}, ${runCatching { tts.voice?.name }.getOrNull() ?: "English"}"
                else "speech out: ${tts.defaultEngine ?: "engine"} has no English voice " +
                    "(${runCatching { tts.voices?.size }.getOrNull() ?: 0} voices); asking the laptop to speak",
            )
          }
        }
  }

  private fun pickEnglish(): Boolean {
    for (locale in listOf(Locale.US, Locale.UK, Locale.ENGLISH, Locale.getDefault())) {
      val r = runCatching { tts.setLanguage(locale) }.getOrDefault(TextToSpeech.LANG_NOT_SUPPORTED)
      if (r != TextToSpeech.LANG_MISSING_DATA && r != TextToSpeech.LANG_NOT_SUPPORTED) return true
    }
    val voice = runCatching { tts.voices }.getOrNull()?.firstOrNull { it.locale.language == "en" && !it.isNetworkConnectionRequired }
    return voice != null && tts.setVoice(voice) == TextToSpeech.SUCCESS
  }

  fun say(text: String) {
    if (ready) tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "reply")
  }

  /** Plays a WAV the laptop rendered for the reply. */
  fun play(wav: ByteArray) {
    try {
      val file = java.io.File(context.cacheDir, "reply.wav").apply { writeBytes(wav) }
      player?.release()
      player =
          android.media.MediaPlayer().apply {
            setDataSource(file.absolutePath)
            setOnCompletionListener { it.release(); if (player === it) player = null }
            prepare()
            start()
          }
    } catch (e: Exception) {
      Log.w(TAG, "could not play the reply", e)
      report("speech out: could not play the laptop's voice (${e.message})")
    }
  }

  fun stop() {
    tts.stop()
    tts.shutdown()
    player?.release()
  }

  companion object {
    private const val TAG = "Maison3DFurnish"
  }
}

/** What the headset offers for speech recognition of its own, reported once for the record. */
fun recognizerReport(context: Context): String =
    "on-device recognizer: " + if (SpeechRecognizer.isRecognitionAvailable(context)) "available" else "none"
