package ai.mojulo.maison3d.furnish

import android.Manifest
import android.media.AudioManager
import android.media.ToneGenerator
import android.content.pm.PackageManager
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
import com.meta.spatial.mruk.MRUKFeature
import com.meta.spatial.mruk.MRUKLoadDeviceResult
import com.meta.spatial.runtime.ButtonBits
import com.meta.spatial.runtime.LayerConfig
import com.meta.spatial.runtime.ReferenceSpace
import com.meta.spatial.toolkit.AppSystemActivity
import com.meta.spatial.toolkit.AvatarBody
import com.meta.spatial.toolkit.Box
import com.meta.spatial.toolkit.Controller
import com.meta.spatial.toolkit.Grabbable
import com.meta.spatial.toolkit.GrabbableType
import com.meta.spatial.toolkit.Material
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
 * Spike 07: design a room by voice, in VR. The room stands around you (built by the laptop server as one model): by
 * default a dictated one ("make it 4 by 5 metres, a door behind me"), with you in its middle facing its front wall;
 * or the room you scanned, empty, 1:1 over the real one, its real furniture as outlines. The right thumbstick moves you:
 * push it forward to aim at the floor and let go to step there, left or right to turn. Every turn is heard first (a
 * chime and the words over the controller) and then acted on. Hold A and speak, let go: the words (as audio), what the right controller
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
  // this launch: the server stands the dictated room round you again when it sees a new one
  private val session = java.util.UUID.randomUUID().toString()

  // the bubble over the right controller: listening, heard, thinking, the reply
  @Volatile private var bubble: Entity? = null
  @Volatile private var bubbleView: TextView? = null
  @Volatile private var bubbleUntilNs = 0L
  private var bubbleShown = false
  private val tones = runCatching { ToneGenerator(AudioManager.STREAM_MUSIC, 70) }.getOrNull()

  // moving: where the play space stands in the world (the head moves within it), the floor to aim at
  private var originX = 0f
  private var originZ = 0f
  private var originYaw = 0f
  @Volatile private var floorY = 0f
  private var aiming = false
  private var aimAt: Vector3? = null
  private var marker: Entity? = null
  @Volatile private var pendingTeleport: Pair<Vector3, Vector3?>? = null

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
    bubble = Entity.create(listOf(Panel(R.layout.furnish_bubble), Transform(), Visible(false)))
    // where a teleport will land: a flat bright square on the floor
    marker =
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")).apply { hittable = MeshCollision.NoCollision },
                Box(Vector3(-0.2f, 0f, -0.2f), Vector3(0.2f, 0.01f, 0.2f)),
                Material().apply {
                  baseColor = Color4(0.5f, 0.85f, 1f, 1f)
                  unlit = true
                },
                Transform(),
                Visible(false),
            ),
        )
    scene.setViewOrigin(0f, 0f, 0f, 0f)
    // what the server already holds, if it was furnishing before this launch
    turns.scene { r -> r.onSuccess { runCatching { incoming.set(parseScene(it)); it.optJSONObject("room")?.let(incomingRoom::set) } } }
  }

  override fun onSpatialShutdown() {
    speaker.stop()
    tones?.release()
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
          PanelRegistration(R.layout.furnish_bubble) {
            config {
              width = 0.3f
              height = 0.1f
              fractionOfScreen = 1f
              layoutDpi = 500
              layerConfig = LayerConfig()
              enableTransparent = true
            }
            panel { bubbleView = requireNotNull(rootView).findViewById(R.id.bubble_text) }
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
      log("no spatial data permission: designing in a dictated room only")
      sendRoom()
      return
    }
    mruk.loadSceneFromDevice().whenComplete { result: MRUKLoadDeviceResult?, error: Throwable? ->
      when {
        error != null -> log("no scan of the room (${error.message}): a dictated room only")
        result == MRUKLoadDeviceResult.SUCCESS -> {
          val d = room.describe()
          log("scan: ${d.optJSONArray("items")?.length() ?: 0} things")
        }
        else -> log("no scan of the room ($result): a dictated room only")
      }
      sendRoom()
    }
  }

  /** The server stands the design's room around you: dictated, or the scan (when there is one), emptied. */
  private fun sendRoom() {
    turns.room(room.describe(), session) { r ->
      r.onSuccess { incoming.set(parseScene(it)); it.optJSONObject("room")?.let(incomingRoom::set) }
      r.onFailure { log("server not reachable for the room: ${it.message}") }
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
    if (recorder.start()) {
      tones?.startTone(ToneGenerator.TONE_PROP_BEEP, 60)
      setSaid("listening…")
      showBubble("● listening…", 0L)
    } else log("the microphone did not start")
  }

  /** Let go of A: first the words (heard, a chime, shown), then Muse acts on them and answers. */
  private fun stopTalking(controller: Pose?) {
    val wav = recorder.stop()
    if (wav == null) {
      setSaid("")
      showBubble("", 1L)
      return
    }
    val pointing = controller?.let { room.pointAt(it.t, it.q.times(Vector3(0f, 0f, 1f)).normalize()) }
    val described = room.describe().put("viewer", headPose?.let(::viewerJson) ?: JSONObject.NULL)
    busy = true
    setSaid("…")
    showBubble("hearing…", 0L)
    turns.hear(wav, described) { heard ->
      val words = heard.getOrNull()?.optString("said", "")?.trim().orEmpty()
      if (heard.isFailure || words.isEmpty()) {
        busy = false
        tones?.startTone(ToneGenerator.TONE_PROP_NACK, 200)
        setSaid(if (heard.isFailure) "" else "(nothing heard)")
        showBubble(if (heard.isFailure) "the server did not answer" else "didn't catch that: hold A and try again", 4_000L)
        heard.exceptionOrNull()?.let { log("hearing failed: ${it.message}") }
        return@hear
      }
      tones?.startTone(ToneGenerator.TONE_PROP_ACK, 150)
      setSaid(words)
      showBubble("“$words”\nthinking…", 0L)
      turns.act(words, pointing, described, speaker.needsServerVoice) { r ->
        busy = false
        r.onSuccess { answer ->
          val text = answer.optString("reply", "")
          setReply(text)
          showBubble(text.ifEmpty { "done" }, 8_000L)
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
            actions?.optJSONObject(i)?.optJSONObject("teleport")?.let { t ->
              pendingTeleport = vec3(t.getJSONArray("position")) to t.optJSONArray("facing")?.let(::vec3)
            }
            when (actions?.optString(i)) {
              "rescan" -> runOnUiThread { rescan() }
              "real" -> pendingView = true
              "design" -> pendingView = false
            }
          }
        }
        r.onFailure {
          tones?.startTone(ToneGenerator.TONE_PROP_NACK, 200)
          showBubble("that went wrong: ${it.message?.take(60)}", 5_000L)
          log("turn failed: ${it.message}")
        }
      }
    }
  }

  /** The bubble's words; `forMs` 0 keeps it up until the next change, else it goes after that long. */
  private fun showBubble(text: String, forMs: Long) {
    bubbleUntilNs = if (text.isEmpty()) 0L else if (forMs == 0L) Long.MAX_VALUE else System.nanoTime() + forMs * 1_000_000L
    runOnUiThread { bubbleView?.text = text }
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
    floorY = j.optDouble("floorY", 0.0).toFloat()
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

      // moving: thumbstick forward aims at the floor, letting go steps there; left or right turns 45 degrees
      body.rightHand.tryGetComponent<Controller>()?.let { c ->
        if (head != null && right != null) {
          if ((c.buttonState and ButtonBits.ButtonThumbRU) != 0) {
            aiming = true
            aimAt = floorHit(right)
            marker?.setComponents(listOf(Transform(Pose(aimAt ?: Vector3(0f, -100f, 0f))), Visible(aimAt != null)))
          } else if (aiming) {
            aiming = false
            marker?.setComponent(Visible(false))
            aimAt?.let { teleport(head, it, null) }
          }
          if (pressed(c, ButtonBits.ButtonThumbRL)) turnBy(head, 45f)
          if (pressed(c, ButtonBits.ButtonThumbRR)) turnBy(head, -45f)
        }
      }
      pendingTeleport?.let { (to, facing) ->
        if (head != null) {
          pendingTeleport = null
          teleport(head, to, facing)
        }
      }

      // the bubble rides over the right controller, turned to you
      val b = bubble
      val showing = now < bubbleUntilNs
      if (b != null && head != null && right != null && showing) {
        val at = right.t.plus(Vector3(0f, 0.14f, 0f))
        val away = at.minus(head.t)
        b.setComponents(listOf(Transform(Pose(at, Quaternion.lookRotation(Vector3(away.x, 0f, away.z).normalize()))), Visible(true)))
        bubbleShown = true
      } else if (b != null && bubbleShown && !showing) {
        b.setComponent(Visible(false))
        bubbleShown = false
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

  /** Where the controller's ray meets the floor, within 8 m, or null. */
  private fun floorHit(hand: Pose): Vector3? {
    val d = hand.q.times(Vector3(0f, 0f, 1f))
    if (d.y > -0.05f) return null
    val t = (floorY - hand.t.y) / d.y
    if (t <= 0f || t > 8f) return null
    return Vector3(hand.t.x + d.x * t, floorY, hand.t.z + d.z * t)
  }

  private fun yawOf(v: Vector3) = Math.toDegrees(kotlin.math.atan2(v.x.toDouble(), v.z.toDouble())).toFloat()

  /**
   * Moves the play space so your head lands over `to` (and, with `facing`, turns you to face that way): the room
   * stays put in the world and you move through it. The play space turns about your head, so a turn does not move you.
   */
  private fun teleport(head: Pose, to: Vector3, facing: Vector3?) {
    val headFwd = head.q.times(Vector3(0f, 0f, 1f))
    val turn = facing?.let { yawOf(it) - yawOf(Vector3(headFwd.x, 0f, headFwd.z)) } ?: 0f
    val rel = Quaternion(0f, turn, 0f).times(Vector3(originX - head.t.x, 0f, originZ - head.t.z))
    originX = head.t.x + rel.x + (to.x - head.t.x)
    originZ = head.t.z + rel.z + (to.z - head.t.z)
    originYaw += turn
    scene.setViewOrigin(originX, 0f, originZ, originYaw)
    Log.i(TAG, "moved to ${to} turned ${turn}: origin ($originX, $originZ) yaw $originYaw")
  }

  private fun turnBy(head: Pose, degrees: Float) {
    val headFwd = head.q.times(Vector3(0f, 0f, 1f))
    val f = Quaternion(0f, degrees, 0f).times(Vector3(headFwd.x, 0f, headFwd.z))
    teleport(head, head.t, f)
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

