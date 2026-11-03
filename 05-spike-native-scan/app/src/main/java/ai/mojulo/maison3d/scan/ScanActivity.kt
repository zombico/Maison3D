package ai.mojulo.maison3d.scan

import android.content.pm.PackageManager
import android.os.Bundle
import android.util.Log
import android.widget.Button
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
import com.meta.spatial.mruk.MRUKRoom
import com.meta.spatial.mruk.MRUKSceneEventListener
import com.meta.spatial.runtime.ButtonBits
import com.meta.spatial.runtime.LayerConfig
import com.meta.spatial.runtime.ReferenceSpace
import com.meta.spatial.toolkit.AppSystemActivity
import com.meta.spatial.toolkit.AvatarBody
import com.meta.spatial.toolkit.Controller
import com.meta.spatial.toolkit.Grabbable
import com.meta.spatial.toolkit.Material
import com.meta.spatial.toolkit.Panel
import com.meta.spatial.toolkit.PanelRegistration
import com.meta.spatial.toolkit.Transform
import com.meta.spatial.toolkit.Visible
import com.meta.spatial.vr.LocomotionSystem
import com.meta.spatial.vr.VRFeature

/**
 * Spike 05: the room as a native Quest app sees it. Passthrough on, Space Setup's room loaded through MR Utility
 * Kit and tinted over the real one, and a scan saved in spike 00's format: automatically once the room loads, then
 * with A or the panel's button. B or "Reload room" reads the room again; "Space Setup" asks the headset to rescan.
 * X, Y or a click of the right thumbstick brings the panel back in front of you.
 */
class ScanActivity : AppSystemActivity(), MRUKSceneEventListener {
  private lateinit var mruk: MRUKFeature
  private lateinit var delivery: Delivery
  private var tint: AnchorProceduralMesh? = null
  @Volatile private var panel: Entity? = null
  @Volatile private var placePanel = true

  private var statusView: TextView? = null
  private val status = ArrayDeque<String>()
  private var roomSummary = "Loading the room…"

  @Volatile private var pendingSave: String? = null
  @Volatile private var pendingReload = false
  private var sceneRequested = false

  override fun registerFeatures(): List<SpatialFeature> {
    mruk = MRUKFeature(this, systemManager)
    return listOf(VRFeature(this), mruk)
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val send = intent?.getStringExtra("send") ?: DEFAULT_SEND
    delivery = Delivery(applicationContext, send.takeUnless { it == "off" })
    log("scans: ${delivery.dir().absolutePath}")
    log(if (send == "off") "not sending to a laptop" else "sending to $send")

    systemManager.findSystem<LocomotionSystem>().enableLocomotion(false)
    systemManager.registerSystem(ScanSystem())
    scene.enablePassthrough(true)
    mruk.addSceneEventListener(this)
    tint = AnchorProceduralMesh(mruk, tintConfig())

    if (checkSelfPermission(PERMISSION_USE_SCENE) == PackageManager.PERMISSION_GRANTED) {
      loadRoom()
    } else {
      log("asking for spatial data permission")
      requestPermissions(arrayOf(PERMISSION_USE_SCENE), REQUEST_USE_SCENE)
    }
  }

  override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    if (requestCode != REQUEST_USE_SCENE) return
    if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
      loadRoom()
    } else {
      log("spatial data permission denied: the app cannot read the room (Settings > Apps > Maison3D Scan)")
    }
  }

  override fun onSceneReady() {
    super.onSceneReady()
    // y = 0 on the floor, like WebXR local-floor, so the scans line up with spike 00's
    scene.setReferenceSpace(ReferenceSpace.LOCAL_FLOOR)
    scene.setLightingEnvironment(
        ambientColor = Vector3(0.4f),
        sunColor = Vector3(1f, 1f, 1f),
        sunDirection = -Vector3(1f, 3f, -2f),
        environmentIntensity = 0.3f,
    )
    // a fresh entity, not a fixed id: MRUK's room and anchors are created first and could already hold any id
    panel = Entity.create(listOf(Panel(R.layout.scan_panel), Transform(), Visible(false), Grabbable()))
    placePanel = true
  }

  override fun onSpatialShutdown() {
    mruk.removeSceneEventListener(this)
    tint?.destroy()
    super.onSpatialShutdown()
  }

  override fun registerPanels(): List<PanelRegistration> =
      listOf(
          PanelRegistration(R.layout.scan_panel) {
            config {
              width = 0.6f
              height = 0.45f
              fractionOfScreen = 1f
              layoutDpi = 500
              layerConfig = LayerConfig()
              enableTransparent = true
            }
            panel {
              val root = requireNotNull(rootView)
              statusView = root.findViewById(R.id.status)
              root.findViewById<Button>(R.id.save).setOnClickListener { pendingSave = "button" }
              root.findViewById<Button>(R.id.reload).setOnClickListener { pendingReload = true }
              root.findViewById<Button>(R.id.capture).setOnClickListener { spaceSetup() }
              render()
            }
          },
      )

  // --- the room ----------------------------------------------------------------------------------------------

  private fun loadRoom() {
    sceneRequested = true
    log("reading the room from the headset")
    mruk.loadSceneFromDevice().whenComplete { result: MRUKLoadDeviceResult?, error: Throwable? ->
      when {
        error != null -> log("loading the room failed: ${error.message}")
        result == MRUKLoadDeviceResult.SUCCESS -> {
          log("room loaded: ${mruk.rooms.size} room(s)")
          pendingSave = pendingSave ?: "auto"
        }
        result == MRUKLoadDeviceResult.ERROR_NO_ROOMS_FOUND ->
            log("no room on this headset yet: press Space Setup (or Settings > Physical space)")
        else -> log("loading the room: $result")
      }
    }
  }

  private fun spaceSetup() {
    log("asking the headset to run Space Setup")
    mruk.requestSceneCapture().whenComplete { _, error ->
      if (error != null) log("Space Setup did not run: ${error.message}")
      loadRoom()
    }
  }

  override fun onRoomAdded(room: MRUKRoom) {
    log("room added: ${room.anchors.size} anchors")
  }

  override fun onRoomUpdated(room: MRUKRoom) {
    log("room updated: ${room.anchors.size} anchors")
  }

  /** The room tinted over passthrough: furniture strongest, walls and floor faint, the ceiling left alone. */
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
    val furniture = tint(0.88f, 0.36f, 0.82f, 0.35f)
    val frame = tint(1f, 0.6f, 0.24f, 0.45f)
    val wall = tint(0.31f, 0.55f, 1f, 0.12f)
    return mapOf(
        MRUKLabel.FLOOR to tint(0.36f, 0.82f, 0.42f, 0.18f),
        MRUKLabel.WALL_FACE to wall,
        MRUKLabel.INVISIBLE_WALL_FACE to wall,
        MRUKLabel.INNER_WALL_FACE to wall,
        MRUKLabel.DOOR_FRAME to frame,
        MRUKLabel.WINDOW_FRAME to frame,
        MRUKLabel.WALL_ART to frame,
        MRUKLabel.TABLE to furniture,
        MRUKLabel.COUCH to furniture,
        MRUKLabel.BED to furniture,
        MRUKLabel.STORAGE to furniture,
        MRUKLabel.SCREEN to furniture,
        MRUKLabel.LAMP to furniture,
        MRUKLabel.PLANT to furniture,
        MRUKLabel.OTHER to tint(0.95f, 0.84f, 0.27f, 0.35f),
    )
  }

  // --- each frame: place the panel, read the buttons, take pending scans -------------------------------------

  private inner class ScanSystem : SystemBase() {
    override fun execute() {
      val body = localBody() ?: return
      val head = body.head.tryGetComponent<Transform>()?.transform

      body.rightHand.tryGetComponent<Controller>()?.let { c ->
        if (pressed(c, ButtonBits.ButtonA)) pendingSave = "button"
        if (pressed(c, ButtonBits.ButtonB)) pendingReload = true
        if (pressed(c, ButtonBits.ButtonThumbRClick)) placePanel = true
      }
      body.leftHand.tryGetComponent<Controller>()?.let { c ->
        if (pressed(c, ButtonBits.ButtonY) || pressed(c, ButtonBits.ButtonX)) placePanel = true
      }

      // once the head is tracked, and again whenever asked: the panel in front of you
      val p = panel
      if (placePanel && p != null && head != null && head != Pose()) {
        placePanel = false
        placeInView(head, p)
      }

      if (pendingReload) {
        pendingReload = false
        loadRoom()
      }
      val reason = pendingSave ?: return
      pendingSave = null
      if (mruk.rooms.isEmpty()) {
        log(if (sceneRequested) "nothing to save: no room loaded" else "nothing to save yet")
        return
      }
      val scan = RoomSnapshot.capture(mruk, reason, head)
      roomSummary = RoomSnapshot.summary(scan)
      Log.i(TAG, "scan ($reason):\n$roomSummary")
      val mrukJson = runCatching { mruk.saveSceneToJsonString() }.getOrNull()
      render()
      delivery.deliver(scan, mrukJson, ::log)
    }

    private fun localBody(): AvatarBody? =
        Query.where { has(AvatarBody.id) }
            .eval()
            .firstOrNull { it.isLocal() && it.getComponent<AvatarBody>().isPlayerControlled }
            ?.getComponent<AvatarBody>()

    private fun pressed(c: Controller, button: Int) = (c.buttonState and c.changedButtons and button) != 0
  }

  /** Puts `element` 0.8 m in front of the head, level, tilted back a little (as Meta's MRUK sample does). */
  private fun placeInView(head: Pose, element: Entity) {
    val forward = head.q.times(Vector3(0f, 0f, 1f))
    forward.y = 0f
    var q = Quaternion.lookRotation(forward)
    q = q.times(Quaternion(20f, 0f, 0f))
    val t = head.t.plus(q.times(Vector3(0f, 0f, 0.8f)))
    element.setComponents(listOf(Transform(Pose(t, q)), Visible(true)))
    Log.i(TAG, "panel placed at $t (head at ${head.t})")
  }

  // --- the panel's text --------------------------------------------------------------------------------------

  private fun log(line: String) {
    Log.i(TAG, line)
    synchronized(status) {
      status.addLast(line)
      while (status.size > 8) status.removeFirst()
    }
    render()
  }

  private fun render() {
    val text = synchronized(status) { roomSummary + "\n" + status.joinToString("\n") }
    runOnUiThread { statusView?.text = text }
  }

  companion object {
    private const val TAG = "Maison3DScan"
    private const val PERMISSION_USE_SCENE = "com.oculus.permission.USE_SCENE"
    private const val REQUEST_USE_SCENE = 1
    private const val DEFAULT_SEND = "http://localhost:8080"
  }
}
