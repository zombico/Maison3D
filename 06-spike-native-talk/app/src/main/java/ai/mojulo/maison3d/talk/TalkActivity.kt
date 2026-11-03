package ai.mojulo.maison3d.talk

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.widget.TextView
import com.meta.spatial.core.Color4
import com.meta.spatial.core.Entity
import com.meta.spatial.core.Pose
import com.meta.spatial.core.Quaternion
import com.meta.spatial.core.Query
import com.meta.spatial.core.SpatialFeature
import com.meta.spatial.core.SystemBase
import com.meta.spatial.core.Vector3
import com.meta.spatial.mruk.AnchorProceduralMesh
import com.meta.spatial.mruk.AnchorProceduralMeshConfig
import com.meta.spatial.mruk.MRUKFeature
import com.meta.spatial.mruk.MRUKLabel
import com.meta.spatial.mruk.MRUKLoadDeviceResult
import com.meta.spatial.runtime.ButtonBits
import com.meta.spatial.runtime.LayerConfig
import com.meta.spatial.runtime.ReferenceSpace
import com.meta.spatial.toolkit.AppSystemActivity
import com.meta.spatial.toolkit.AvatarBody
import com.meta.spatial.toolkit.Box
import com.meta.spatial.toolkit.Controller
import com.meta.spatial.toolkit.Grabbable
import com.meta.spatial.toolkit.Material
import com.meta.spatial.toolkit.Mesh
import com.meta.spatial.toolkit.MeshCollision
import com.meta.spatial.toolkit.Panel
import com.meta.spatial.toolkit.PanelRegistration
import com.meta.spatial.toolkit.Scale
import com.meta.spatial.toolkit.Transform
import com.meta.spatial.toolkit.Visible
import com.meta.spatial.vr.LocomotionSystem
import com.meta.spatial.vr.VRFeature
import org.json.JSONObject

/**
 * Spike 06: talk to the room from inside it. Hold A and speak, let go: the words (as audio), what the right
 * controller pointed at, the room and the cube go to the laptop server, which transcribes them, asks Muse, and
 * answers with a reply and the cube's new state. The headset moves the cube and reads the reply aloud without
 * leaving passthrough. B reads the room again; X, Y or a right-thumbstick click brings the panel back in front of you.
 */
class TalkActivity : AppSystemActivity() {
  private lateinit var mruk: MRUKFeature
  private lateinit var room: Room
  private lateinit var turns: Turns
  private lateinit var speaker: Speaker
  private val recorder = Recorder()
  private var tint: AnchorProceduralMesh? = null

  @Volatile private var panel: Entity? = null
  @Volatile private var cubeEntity: Entity? = null
  @Volatile private var placePanel = true
  @Volatile private var busy = false
  @Volatile private var pendingReload = false

  // the cube, as the server sees it: colour, edge in metres, centre in world space, spinning or not
  private var cube = Cube("#e4b363", 0.2f, null, false)
  @Volatile private var cubeChanged = true

  private var saidView: TextView? = null
  private var replyView: TextView? = null
  private var statusView: TextView? = null
  private val status = ArrayDeque<String>()
  private var said = ""
  private var reply = ""

  data class Cube(val color: String, val size: Float, val at: Vector3?, val spin: Boolean)

  override fun registerFeatures(): List<SpatialFeature> {
    mruk = MRUKFeature(this, systemManager)
    return listOf(VRFeature(this), mruk)
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    room = Room(mruk)
    val server = intent?.getStringExtra("server") ?: DEFAULT_SERVER
    turns = Turns(server)
    speaker = Speaker(applicationContext, ::log)
    log("server: $server")
    log(recognizerReport(applicationContext))

    systemManager.findSystem<LocomotionSystem>().enableLocomotion(false)
    systemManager.registerSystem(TalkSystem())
    scene.enablePassthrough(true)
    tint = AnchorProceduralMesh(mruk, tintConfig())

    val missing = listOf(PERMISSION_USE_SCENE, Manifest.permission.RECORD_AUDIO).filter { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
    if (missing.isEmpty()) loadRoom() else requestPermissions(missing.toTypedArray(), REQUEST_PERMISSIONS)
    checkServer()
  }

  override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    if (requestCode != REQUEST_PERMISSIONS) return
    for ((i, p) in permissions.withIndex()) {
      if (grantResults.getOrNull(i) != PackageManager.PERMISSION_GRANTED) log("permission denied: ${p.substringAfterLast('.')}")
    }
    loadRoom()
  }

  override fun onSceneReady() {
    super.onSceneReady()
    scene.setReferenceSpace(ReferenceSpace.LOCAL_FLOOR)
    scene.setLightingEnvironment(
        ambientColor = Vector3(0.5f),
        sunColor = Vector3(1f, 1f, 1f),
        sunDirection = -Vector3(1f, 3f, -2f),
        environmentIntensity = 0.3f,
    )
    panel = Entity.create(listOf(Panel(R.layout.talk_panel), Transform(), Visible(false), Grabbable()))
    cubeEntity =
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")).apply { hittable = MeshCollision.NoCollision },
                Box(Vector3(-0.5f), Vector3(0.5f)),
                Material().apply { baseColor = color4(cube.color) },
                Transform(),
                Scale(Vector3(cube.size)),
                Visible(false),
            ),
        )
  }

  override fun onSpatialShutdown() {
    tint?.destroy()
    speaker.stop()
    super.onSpatialShutdown()
  }

  override fun registerPanels(): List<PanelRegistration> =
      listOf(
          PanelRegistration(R.layout.talk_panel) {
            config {
              width = 0.6f
              height = 0.4f
              fractionOfScreen = 1f
              layoutDpi = 500
              layerConfig = LayerConfig()
              enableTransparent = true
            }
            panel {
              val root = requireNotNull(rootView)
              saidView = root.findViewById(R.id.said)
              replyView = root.findViewById(R.id.reply)
              statusView = root.findViewById(R.id.status)
              render()
            }
          },
      )

  private fun loadRoom() {
    if (checkSelfPermission(PERMISSION_USE_SCENE) != PackageManager.PERMISSION_GRANTED) {
      log("no spatial data permission: the room cannot be read")
      return
    }
    mruk.loadSceneFromDevice().whenComplete { result: MRUKLoadDeviceResult?, error: Throwable? ->
      when {
        error != null -> log("loading the room failed: ${error.message}")
        result == MRUKLoadDeviceResult.SUCCESS -> {
          val d = room.describe()
          log("room: ${d.optJSONArray("items")?.length() ?: 0} things, floor at ${d.opt("floorY")}")
        }
        else -> log("loading the room: $result (run Space Setup in Settings > Physical space)")
      }
    }
  }

  private fun checkServer() {
    turns.health { r ->
      r.onSuccess { log("server ok: model ${it.optString("model")}, speech-to-text ${it.optString("stt")}") }
      r.onFailure { log("server not reachable: run npm run spike:talk and adb reverse tcp:$PORT tcp:$PORT") }
    }
  }

  // --- a turn ------------------------------------------------------------------------------------------------

  private fun startTalking() {
    if (busy) return
    if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
      log("no microphone permission")
      return
    }
    if (recorder.start()) setSaid("listening…") else log("the microphone did not start")
  }

  private fun stopTalking(controller: Pose?) {
    val wav = recorder.stop()
    if (wav == null) {
      setSaid("")
      return
    }
    val pointing = controller?.let { room.pointAt(it.t, it.q.times(Vector3(0f, 0f, 1f)).normalize()) }
    busy = true
    setSaid("…")
    turns.send(wav, pointing, room.describe(), cubeJson(), speaker.needsServerVoice) { r ->
      busy = false
      r.onSuccess { answer ->
        setSaid(answer.optString("said", "").ifEmpty { "(nothing heard)" })
        val text = answer.optString("reply", "")
        setReply(text)
        val voice = answer.optString("voice")
        if (voice.isNotEmpty()) speaker.play(android.util.Base64.decode(voice, android.util.Base64.DEFAULT))
        else if (text.isNotEmpty()) speaker.say(text)
        answer.optJSONObject("cube")?.let(::applyCube)
        answer.optString("note").takeIf { it.isNotEmpty() }?.let(::log)
      }
      r.onFailure {
        setSaid("")
        log("turn failed: ${it.message}")
      }
    }
  }

  private fun cubeJson(): JSONObject =
      JSONObject()
          .put("color", cube.color)
          .put("size", Room.r(cube.size))
          .put("at", cube.at?.let(Room::vec) ?: JSONObject.NULL)
          .put("spin", cube.spin)

  private fun applyCube(j: JSONObject) {
    val at = j.optJSONArray("at")?.let { a -> Vector3(a.getDouble(0).toFloat(), a.getDouble(1).toFloat(), a.getDouble(2).toFloat()) }
    cube = Cube(j.optString("color", cube.color), j.optDouble("size", cube.size.toDouble()).toFloat(), at ?: cube.at, j.optBoolean("spin", cube.spin))
    cubeChanged = true
  }

  // --- each frame --------------------------------------------------------------------------------------------

  private inner class TalkSystem : SystemBase() {
    private var angle = 0f
    private var last = System.nanoTime()

    override fun execute() {
      val now = System.nanoTime()
      val dt = (now - last) / 1e9f
      last = now

      clearTintHits()
      val body = localBody() ?: return
      val head = body.head.tryGetComponent<Transform>()?.transform?.takeIf { it != Pose() }
      val right = body.rightHand.tryGetComponent<Transform>()?.transform

      body.rightHand.tryGetComponent<Controller>()?.let { c ->
        if (pressed(c, ButtonBits.ButtonA)) startTalking()
        if (released(c, ButtonBits.ButtonA)) stopTalking(right)
        if (pressed(c, ButtonBits.ButtonB)) pendingReload = true
        if (pressed(c, ButtonBits.ButtonThumbRClick)) placePanel = true
      }
      body.leftHand.tryGetComponent<Controller>()?.let { c ->
        if (pressed(c, ButtonBits.ButtonX) || pressed(c, ButtonBits.ButtonY)) placePanel = true
      }
      if (pendingReload) {
        pendingReload = false
        loadRoom()
      }

      val p = panel
      if (placePanel && p != null && head != null) {
        placePanel = false
        p.setComponents(listOf(Transform(inView(head, 0.8f, -20f)), Visible(true)))
      }

      val e = cubeEntity ?: return
      if (cube.at == null && head != null) {
        // first appearance: a metre in front of you, at chest height
        val t = inView(head, 1.0f, 0f).t
        cube = cube.copy(at = Vector3(t.x, maxOf(t.y - 0.4f, 0.5f), t.z))
        cubeChanged = true
      }
      val at = cube.at ?: return
      if (cube.spin) angle = (angle + 45f * dt) % 360f
      if (cubeChanged || cube.spin) {
        e.setComponents(listOf(Transform(Pose(at, Quaternion(0f, angle, 0f))), Visible(true)))
      }
      if (cubeChanged) {
        cubeChanged = false
        e.setComponent(Scale(Vector3(cube.size)))
        e.setComponent(Material().apply { baseColor = color4(cube.color) })
      }
    }

    private fun localBody(): AvatarBody? =
        Query.where { has(AvatarBody.id) }
            .eval()
            .firstOrNull { it.isLocal() && it.getComponent<AvatarBody>().isPlayerControlled }
            ?.getComponent<AvatarBody>()

    private fun pressed(c: Controller, button: Int) = (c.buttonState and c.changedButtons and button) != 0

    private fun released(c: Controller, button: Int) = (c.buttonState and button) == 0 && (c.changedButtons and button) != 0

    /** MRUK's tint is hittable by default and would catch the pointer before the panel (spike 05). */
    private fun clearTintHits() {
      for (ent in Query.where { has(Mesh.id) }.eval()) {
        if (ent.hasComponent<Panel>()) continue
        val mesh = ent.getComponent<Mesh>()
        if (mesh.hittable == MeshCollision.NoCollision) continue
        mesh.hittable = MeshCollision.NoCollision
        ent.setComponent(mesh)
      }
    }
  }

  /** `distance` m in front of the head, level, pitched by `pitch` degrees (Meta's MRUK sample's recipe). */
  private fun inView(head: Pose, distance: Float, pitch: Float): Pose {
    val forward = head.q.times(Vector3(0f, 0f, 1f))
    forward.y = 0f
    val q = Quaternion.lookRotation(forward).times(Quaternion(-pitch, 0f, 0f))
    return Pose(head.t.plus(q.times(Vector3(0f, 0f, distance))), q)
  }

  private fun tintConfig(): Map<MRUKLabel, AnchorProceduralMeshConfig> {
    fun tint(r: Float, g: Float, b: Float, a: Float) =
        AnchorProceduralMeshConfig(
            Material().apply {
              baseColor = Color4(r, g, b, a)
              alphaMode = 1 // translucent
              unlit = true
            },
            false,
        )
    val furniture = tint(0.88f, 0.36f, 0.82f, 0.2f)
    return mapOf(
        MRUKLabel.TABLE to furniture,
        MRUKLabel.COUCH to furniture,
        MRUKLabel.BED to furniture,
        MRUKLabel.STORAGE to furniture,
        MRUKLabel.SCREEN to furniture,
        MRUKLabel.LAMP to furniture,
        MRUKLabel.PLANT to furniture,
        MRUKLabel.OTHER to furniture,
    )
  }

  private fun color4(css: String): Color4 {
    val c = runCatching { Color.parseColor(css) }.getOrDefault(Color.parseColor("#e4b363"))
    return Color4(Color.red(c) / 255f, Color.green(c) / 255f, Color.blue(c) / 255f, 1f)
  }

  // --- the panel ---------------------------------------------------------------------------------------------

  private fun setSaid(text: String) {
    said = text
    render()
  }

  private fun setReply(text: String) {
    reply = text
    render()
  }

  private fun log(line: String) {
    Log.i(TAG, line)
    synchronized(status) {
      status.addLast(line)
      while (status.size > 7) status.removeFirst()
    }
    render()
  }

  private fun render() {
    val s = synchronized(status) { status.joinToString("\n") }
    val heard = if (said.isEmpty()) "" else "you: $said"
    val answer = if (reply.isEmpty()) "" else "muse: $reply"
    runOnUiThread {
      saidView?.text = heard
      replyView?.text = answer
      statusView?.text = s
    }
  }

  companion object {
    private const val TAG = "Maison3DTalk"
    private const val PERMISSION_USE_SCENE = "com.oculus.permission.USE_SCENE"
    private const val REQUEST_PERMISSIONS = 1
    const val PORT = 8091
    private const val DEFAULT_SERVER = "http://localhost:$PORT"
  }
}

