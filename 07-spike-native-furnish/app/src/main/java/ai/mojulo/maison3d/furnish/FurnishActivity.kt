package ai.mojulo.maison3d.furnish

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.widget.TextView
import com.meta.spatial.core.Entity
import com.meta.spatial.core.Pose
import com.meta.spatial.core.Quaternion
import com.meta.spatial.core.Query
import com.meta.spatial.core.SpatialFeature
import com.meta.spatial.core.SystemBase
import com.meta.spatial.core.Vector3
import com.meta.spatial.mruk.MRUKFeature
import com.meta.spatial.mruk.MRUKLoadDeviceResult
import com.meta.spatial.runtime.ButtonBits
import com.meta.spatial.runtime.LayerConfig
import com.meta.spatial.runtime.ReferenceSpace
import com.meta.spatial.toolkit.AppSystemActivity
import com.meta.spatial.toolkit.AvatarBody
import com.meta.spatial.toolkit.Controller
import com.meta.spatial.toolkit.Grabbable
import com.meta.spatial.toolkit.GrabbableType
import com.meta.spatial.toolkit.Mesh
import com.meta.spatial.toolkit.MeshCollision
import com.meta.spatial.toolkit.Panel
import com.meta.spatial.toolkit.PanelRegistration
import com.meta.spatial.toolkit.Transform
import com.meta.spatial.toolkit.Visible
import com.meta.spatial.vr.LocomotionSystem
import com.meta.spatial.vr.VRFeature
import org.json.JSONObject

/**
 * Spike 07: design your room by voice, in VR. The room you scanned stands around you empty, 1:1 over the real one
 * (its walls, doors, windows, floor and ceiling, built by the laptop server as one model), with your real furniture
 * as outlines so you do not walk into it. Hold A and speak, let go: the words (as audio), what the right controller
 * pointed at, where you stand and the room go to the server, which transcribes them, asks Muse to place, move, turn,
 * recolour or remove pieces from a mojulo catalogue or paint the room, and answers with a reply, the furnished scene
 * and the room. The panel's Real room button (or "show me the real room") turns passthrough back on, the design over
 * the real room. B reads the room again; X, Y or a right-thumbstick click brings the panel in front of you, and the
 * grip moves it.
 */
class FurnishActivity : AppSystemActivity() {
  private lateinit var mruk: MRUKFeature
  private lateinit var room: Room
  private lateinit var turns: Turns
  private lateinit var speaker: Speaker
  private val recorder = Recorder()

  @Volatile private var panel: Entity? = null
  @Volatile private var placePanel = true
  @Volatile private var headPose: Pose? = null
  // let go of A: keep listening a quarter of a second more, so the last word is not cut off, then send the turn
  // with where the controller pointed at the moment you let go (all on the frame loop, like every room query)
  private var stopAtNs = 0L
  private var stopPointer: Pose? = null
  @Volatile private var busy = false
  @Volatile private var pendingReload = false

  // the furnished scene, as the server holds it: each piece's id, catalogue item, base centre and facing.
  // A new scene arrives on a network thread and is applied on the frame loop.
  private lateinit var server: String
  private val incoming = java.util.concurrent.atomic.AtomicReference<List<Piece>?>(null)
  private val shown = mutableMapOf<String, Pair<String, Entity>>() // piece id -> (model path, entity)
  // the empty room and the real furniture's outlines, as the server built them: { shell, ghosts } model paths
  private val incomingRoom = java.util.concurrent.atomic.AtomicReference<JSONObject?>(null)
  private var shellShown: Pair<String, Entity>? = null
  private var ghostsShown: Pair<String, Entity>? = null
  // VR (the design) or passthrough (the real room, the design over it)
  @Volatile private var realView = false
  @Volatile private var pendingView: Boolean? = null
  @Volatile private var viewButton: android.widget.Button? = null
  // the panel waits for the head to be tracked for a moment, so it lands in front of you, not where the headset lay
  private var trackedFrames = 0

  private var saidView: TextView? = null
  private var replyView: TextView? = null
  private var statusView: TextView? = null
  private val status = ArrayDeque<String>()
  private var said = ""
  private var reply = ""

  /** One piece of furniture: `at` is the centre of its base, `facing` the way its front points (level). */
  /** `model`: the path the server serves it at, which names its colours when recoloured (a new path, a reload). */
  data class Piece(val id: String, val item: String, val at: Vector3, val facing: Vector3, val model: String)

  override fun registerFeatures(): List<SpatialFeature> {
    mruk = MRUKFeature(this, systemManager)
    return listOf(VRFeature(this), mruk)
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    room = Room(mruk)
    server = intent?.getStringExtra("server") ?: DEFAULT_SERVER
    turns = Turns(server)
    // the furniture's models come from the laptop server and are cached on the headset
    com.meta.spatial.runtime.NetworkedAssetLoader.init(java.io.File(applicationContext.cacheDir.canonicalPath), HttpAssetFetcher())
    speaker = Speaker(applicationContext, ::log)
    log("server: $server")
    log(recognizerReport(applicationContext))

    systemManager.findSystem<LocomotionSystem>().enableLocomotion(false)
    systemManager.registerSystem(FurnishSystem())
    scene.enablePassthrough(false) // the design starts in VR: the room drawn empty

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
    // grabbed with the grip (pointing at it), it stays upright and turns to face you
    panel = Entity.create(listOf(Panel(R.layout.furnish_panel), Transform(), Visible(false), Grabbable(true, GrabbableType.PIVOT_Y)))
    // what the server already holds, if it was furnishing before this launch
    turns.scene { r -> r.onSuccess { runCatching { incoming.set(parseScene(it)); it.optJSONObject("room")?.let(incomingRoom::set) } } }
  }

  override fun onSpatialShutdown() {
    speaker.stop()
    super.onSpatialShutdown()
  }

  override fun registerPanels(): List<PanelRegistration> =
      listOf(
          PanelRegistration(R.layout.furnish_panel) {
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
              root.findViewById<android.widget.Button>(R.id.rescan).setOnClickListener { rescan() }
              root.findViewById<android.widget.Button>(R.id.reload).setOnClickListener { pendingReload = true }
              viewButton = root.findViewById<android.widget.Button>(R.id.view).also { it.setOnClickListener { pendingView = !realView } }
              root.findViewById<android.widget.Button>(R.id.clear).setOnClickListener { clearScene() }
              render()
            }
          },
      )

  /**
   * Space Setup from inside the app: the headset rescans the room you are in (walls, furniture, the mesh), then the
   * app reads it again. The same as Settings > Physical space > Space Setup, without leaving.
   */
  private fun rescan() {
    log("rescanning the room: follow the headset's Space Setup")
    mruk.requestSceneCapture().whenComplete { _, error ->
      if (error != null) log("Space Setup did not run: ${error.message}")
      pendingReload = true
    }
  }

  private fun clearScene() {
    turns.clear { r ->
      r.onSuccess { incoming.set(parseScene(it)); it.optJSONObject("room")?.let(incomingRoom::set) }
      r.onFailure { log("clearing failed: ${it.message}") }
    }
  }

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
          // the server builds the empty room from it, to stand around you before anyone says anything
          turns.room(d) { r ->
            r.onSuccess { incoming.set(parseScene(it)); it.optJSONObject("room")?.let(incomingRoom::set) }
            r.onFailure { log("the server did not take the room: ${it.message}") }
          }
        }
        else -> log("loading the room: $result (run Space Setup in Settings > Physical space)")
      }
    }
  }

  private fun checkServer() {
    turns.health { r ->
      r.onSuccess { log("server ok: model ${it.optString("model")}, ${it.optJSONArray("catalog")?.length() ?: 0} pieces in the catalogue") }
      r.onFailure { log("server not reachable: run npm run spike:furnish and adb reverse tcp:$PORT tcp:$PORT") }
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
    turns.send(wav, pointing, room.describe().put("viewer", headPose?.let(::viewerJson) ?: JSONObject.NULL), speaker.needsServerVoice) { r ->
      busy = false
      r.onSuccess { answer ->
        setSaid(answer.optString("said", "").ifEmpty { "(nothing heard)" })
        val text = answer.optString("reply", "")
        setReply(text)
        val voice = answer.optString("voice")
        if (voice.isNotEmpty()) speaker.play(android.util.Base64.decode(voice, android.util.Base64.DEFAULT))
        else if (text.isNotEmpty()) speaker.say(text)
        try {
          answer.optJSONArray("scene")?.let { incoming.set(parseScene(JSONObject().put("scene", it))) }
          answer.optJSONObject("room")?.let(incomingRoom::set)
        } catch (e: Exception) {
          Log.e(TAG, "the scene did not parse", e)
          log("the scene did not parse: ${e.message}")
        }
        answer.optString("note").takeIf { it.isNotEmpty() }?.let(::log)
        // things the model asked the headset itself to do
        val actions = answer.optJSONArray("actions")
        for (i in 0 until (actions?.length() ?: 0)) {
          when (actions?.optString(i)) {
            "rescan" -> runOnUiThread { rescan() }
            "real" -> pendingView = true
            "design" -> pendingView = false
          }
        }
      }
      r.onFailure {
        setSaid("")
        log("turn failed: ${it.message}")
      }
    }
  }

  private fun parseScene(j: JSONObject): List<Piece> {
    val list = j.optJSONArray("scene") ?: return emptyList()
    return (0 until list.length()).map { i ->
      val p = list.getJSONObject(i)
      val item = p.getString("item")
      Piece(p.getString("id"), item, vec3(p.getJSONArray("at")), vec3(p.getJSONArray("facing")), p.optString("model", "/catalog/$item.glb"))
    }
  }

  private fun vec3(a: org.json.JSONArray) = Vector3(a.getDouble(0).toFloat(), a.getDouble(1).toFloat(), a.getDouble(2).toFloat())

  /** Makes the shown furniture match `scene`: new pieces loaded, moved ones moved, swapped, recoloured or removed ones redone or gone. */
  private fun applyScene(scene: List<Piece>) {
    val ids = scene.map { it.id }.toSet()
    for (id in shown.keys.toList().filter { it !in ids }) shown.remove(id)?.second?.destroy()
    for (p in scene) {
      Log.i(TAG, "piece ${p.id}: ${p.item} at ${p.at} facing ${p.facing}")
      val pose = Pose(p.at, Quaternion.lookRotation(p.facing))
      val have = shown[p.id]
      if (have != null && have.first == p.model) {
        have.second.setComponent(Transform(pose))
        continue
      }
      have?.second?.destroy()
      val url = server.trimEnd('/') + p.model
      Log.i(TAG, "loading $url")
      val e =
          Entity.create(
              listOf(
                  Mesh(Uri.parse(url)).apply { hittable = MeshCollision.NoCollision },
                  Transform(pose),
              ),
          )
      shown[p.id] = p.model to e
    }
    log("scene: " + scene.joinToString(", ") { it.id }.ifEmpty { "empty" })
  }

  /** Shows the empty room and the real furniture's outlines the server built; a new path is a new model. */
  private fun applyRoom(j: JSONObject) {
    val shell = if (j.isNull("shell")) null else j.optString("shell")
    val ghosts = if (j.isNull("ghosts")) null else j.optString("ghosts")
    if (shellShown?.first != shell) log(if (shell == null) "no room to show: rescan it" else "room: $shell")
    shellShown = showModel(shellShown, shell)
    ghostsShown = showModel(ghostsShown, ghosts)
  }

  private fun showModel(current: Pair<String, Entity>?, path: String?): Pair<String, Entity>? {
    if (current?.first == path) return current
    current?.second?.destroy()
    if (path == null) return null
    // in the world's own coordinates, like the room it was built from: it stands at the origin
    val e =
        Entity.create(
            listOf(
                Mesh(Uri.parse(server.trimEnd('/') + path)).apply { hittable = MeshCollision.NoCollision },
                Transform(Pose()),
                Visible(!realView),
            ),
        )
    return path to e
  }

  /** The real room (passthrough, the design over it) or the design in VR. */
  private fun setView(real: Boolean) {
    realView = real
    scene.enablePassthrough(real)
    for (e in listOfNotNull(shellShown?.second, ghostsShown?.second)) e.setComponent(Visible(!real))
    runOnUiThread { viewButton?.text = if (real) "Design" else "Real room" }
    log(if (real) "showing the real room, with the design over it" else "showing the design")
  }

  /** Where you are and which way you face, so "in front of me" has an answer. */
  private fun viewerJson(head: Pose): JSONObject {
    val f = head.q.times(Vector3(0f, 0f, 1f))
    return JSONObject().put("position", Room.vec(head.t)).put("forward", Room.vec(Vector3(f.x, 0f, f.z).normalize()))
  }

  // --- each frame --------------------------------------------------------------------------------------------

  private inner class FurnishSystem : SystemBase() {
    override fun execute() {
      val now = System.nanoTime()
      incomingRoom.getAndSet(null)?.let { r ->
        try {
          applyRoom(r)
        } catch (e: Exception) {
          Log.e(TAG, "showing the room failed", e)
          log("showing the room failed: ${e.javaClass.simpleName}: ${e.message}")
        }
      }
      pendingView?.let { real ->
        pendingView = null
        setView(real)
      }
      incoming.getAndSet(null)?.let { scene ->
        try {
          applyScene(scene)
        } catch (e: Exception) {
          Log.e(TAG, "showing the scene failed", e)
          log("showing the scene failed: ${e.javaClass.simpleName}: ${e.message}")
        }
      }

      clearTintHits()
      val body = localBody() ?: return
      val head = body.head.tryGetComponent<Transform>()?.transform?.takeIf { it != Pose() }
      val right = body.rightHand.tryGetComponent<Transform>()?.transform
      if (head != null) headPose = head

      body.rightHand.tryGetComponent<Controller>()?.let { c ->
        if (pressed(c, ButtonBits.ButtonA)) startTalking()
        if (released(c, ButtonBits.ButtonA) && recorder.isRecording) {
          stopAtNs = now + 250_000_000L
          stopPointer = right
        }
        if (pressed(c, ButtonBits.ButtonB)) pendingReload = true
        if (pressed(c, ButtonBits.ButtonThumbRClick)) placePanel = true
      }
      body.leftHand.tryGetComponent<Controller>()?.let { c ->
        if (pressed(c, ButtonBits.ButtonX) || pressed(c, ButtonBits.ButtonY)) placePanel = true
      }
      if (stopAtNs != 0L && now >= stopAtNs) {
        stopAtNs = 0L
        stopTalking(stopPointer)
      }
      if (pendingReload) {
        pendingReload = false
        loadRoom()
      }

      // in front of you at eye height, a little below the line of sight, once the head has been tracked a moment
      val p = panel
      if (head != null) trackedFrames++ else trackedFrames = 0
      if (placePanel && p != null && head != null && trackedFrames > 45) {
        placePanel = false
        p.setComponents(listOf(Transform(inView(head, 0.9f, -8f)), Visible(true)))
      }

    }

    private fun localBody(): AvatarBody? =
        Query.where { has(AvatarBody.id) }
            .eval()
            .firstOrNull { it.isLocal() && it.getComponent<AvatarBody>().isPlayerControlled }
            ?.getComponent<AvatarBody>()

    private fun pressed(c: Controller, button: Int) = (c.buttonState and c.changedButtons and button) != 0

    private fun released(c: Controller, button: Int) = (c.buttonState and button) == 0 && (c.changedButtons and button) != 0

    /** A mesh is hittable by default and would catch the pointer before the panel (spike 05). */
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
    private const val TAG = "Maison3DFurnish"
    private const val PERMISSION_USE_SCENE = "com.oculus.permission.USE_SCENE"
    private const val REQUEST_PERMISSIONS = 1
    const val PORT = 8091
    private const val DEFAULT_SERVER = "http://localhost:$PORT"
  }
}

