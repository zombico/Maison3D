package ai.mojulo.maison3d.scan

import android.os.Build
import com.meta.spatial.core.Pose
import com.meta.spatial.core.Vector3
import com.meta.spatial.mruk.MRUKAnchor
import com.meta.spatial.mruk.MRUKFeature
import com.meta.spatial.mruk.MRUKLabel
import com.meta.spatial.mruk.MRUKPlane
import com.meta.spatial.mruk.MRUKRoom
import com.meta.spatial.mruk.MRUKVolume
import com.meta.spatial.mruk.getBoundaryAsList
import com.meta.spatial.mruk.getLabelsAsList
import com.meta.spatial.toolkit.Transform
import java.time.Instant
import kotlin.math.abs
import kotlin.math.round
import org.json.JSONArray
import org.json.JSONObject

/**
 * What MRUK knows about the room, in the same shape as spike 00's WebXR scans so the same viewer draws both:
 * `planes` (floor, walls, ceiling, frames, table tops) with their outline in world space, and `meshes` (furniture
 * volumes, the global mesh) as an oriented box. World space here is the app's LOCAL_FLOOR: y up, metres, the floor
 * at y = 0, -z forward where the app started, the same convention as WebXR local-floor.
 *
 * Anchors are parented to their room entity, so an anchor's world pose is the room's pose times its own.
 */
object RoomSnapshot {

  /** MRUK's labels, written the way WebXR spells them so both scans compare directly. */
  fun labelName(label: MRUKLabel): String =
      when (label) {
        MRUKLabel.FLOOR -> "floor"
        MRUKLabel.CEILING -> "ceiling"
        MRUKLabel.WALL_FACE -> "wall"
        MRUKLabel.INVISIBLE_WALL_FACE -> "invisible wall"
        MRUKLabel.INNER_WALL_FACE -> "inner wall"
        MRUKLabel.DOOR_FRAME -> "door frame"
        MRUKLabel.WINDOW_FRAME -> "window frame"
        MRUKLabel.WALL_ART -> "wall art"
        MRUKLabel.GLOBAL_MESH -> "global mesh"
        MRUKLabel.INNER_TABLETOP -> "inner tabletop"
        MRUKLabel.INNER_SITTING_AREA -> "inner sitting area"
        MRUKLabel.INNER_SLEEPING_AREA -> "inner sleeping area"
        MRUKLabel.INNER_STORAGE_TOP -> "inner storage top"
        else -> label.name.lowercase()
      }

  fun capture(mruk: MRUKFeature, reason: String, viewer: Pose?): JSONObject {
    val planes = JSONArray()
    val meshes = JSONArray()
    val rooms = JSONArray()

    for (room in mruk.rooms) {
      val roomPose = room.entity?.tryGetComponent<Transform>()?.transform ?: Pose()
      rooms.put(roomJson(room, roomPose))
      for (anchor in room.anchors) {
        val info = anchor.tryGetComponent<MRUKAnchor>() ?: continue
        val local = anchor.tryGetComponent<Transform>()?.transform ?: Pose()
        val world = roomPose.times(local)
        val labels = info.getLabelsAsList()
        val label = labels.firstOrNull()?.let(::labelName)
        val id = info.uuid.toString()

        anchor.tryGetComponent<MRUKPlane>()?.let { planes.put(planeJson(id, label, labels, world, it)) }
        anchor.tryGetComponent<MRUKVolume>()?.let { meshes.put(volumeJson(id, label, labels, world, it)) }
        if (labels.contains(MRUKLabel.GLOBAL_MESH)) {
          room.globalMesh?.let { meshes.put(pointsJson(id, label, labels, world, it.positions, it.indices.size / 3)) }
        }
      }
    }

    return JSONObject()
        .put("version", 1)
        .put("source", "native: Meta Spatial SDK + MR Utility Kit")
        .put("reason", reason)
        .put("capturedAt", Instant.now().toString())
        .put("space", "spatial sdk LOCAL_FLOOR: y up, metres, -z forward at app start")
        .put("userAgent", "${Build.MANUFACTURER} ${Build.MODEL}; Android ${Build.VERSION.RELEASE}; ${Build.DISPLAY}")
        .put("enabledFeatures", JSONArray(listOf("mruk", "passthrough", "local-floor")))
        .put("roomCaptureAvailable", true)
        .put("viewer", viewer?.let(::poseJson) ?: JSONObject.NULL)
        .put("rooms", rooms)
        .put("planes", planes)
        .put("meshes", meshes)
  }

  /** A short text summary for the panel in the headset. */
  fun summary(scan: JSONObject): String {
    val planes = scan.getJSONArray("planes")
    val meshes = scan.getJSONArray("meshes")
    val sb = StringBuilder()
    sb.append("rooms ${scan.getJSONArray("rooms").length()}\n")
    sb.append("planes ${tally(planes)}\n")
    sb.append("volumes ${tally(meshes)}\n")
    for (i in 0 until planes.length()) {
      val p = planes.getJSONObject(i)
      if (p.optString("label") == "floor") sb.append("floor area ${p.optDouble("area")} m²\n")
    }
    return sb.toString()
  }

  private fun tally(items: JSONArray): String {
    val counts = sortedMapOf<String, Int>()
    for (i in 0 until items.length()) {
      val l = items.getJSONObject(i).optString("label", "(none)")
      counts[l] = (counts[l] ?: 0) + 1
    }
    return counts.entries.joinToString(", ") { "${it.key} ${it.value}" }
  }

  private fun roomJson(room: MRUKRoom, roomPose: Pose): JSONObject {
    val out = JSONObject().put("id", room.anchor.uuid.toString()).put("pose", poseJson(roomPose))
    out.put("anchorCount", room.anchors.size)
    room.roomBounds?.let { out.put("bounds", JSONObject().put("min", vec(it.min)).put("max", vec(it.max))) }
    // the watertight room mesh MRUK builds from the walls, floor and ceiling (room space)
    room.roomMesh?.let { mesh ->
      val faces = sortedMapOf<String, Int>()
      for (f in mesh.faces) faces[labelName(f.label)] = (faces[labelName(f.label)] ?: 0) + 1
      out.put("roomMesh", JSONObject().put("vertexCount", mesh.positions.size / 3).put("faces", JSONObject(faces)))
    }
    return out
  }

  private fun planeJson(id: String, label: String?, labels: List<MRUKLabel>, world: Pose, plane: MRUKPlane): JSONObject {
    // a plane lies in its anchor's x-y, its normal along +z
    val boundary = plane.getBoundaryAsList()
    val normal = world.q.times(Vector3(0f, 0f, 1f))
    return JSONObject()
        .put("id", id)
        .put("label", label ?: JSONObject.NULL)
        .put("labels", JSONArray(labels.map(::labelName)))
        .put("orientation", if (abs(normal.y) > 0.7f) "horizontal" else "vertical")
        .put("pose", poseJson(world))
        .put("extent", JSONObject().put("min", vec2(plane.min.x, plane.min.y)).put("max", vec2(plane.max.x, plane.max.y)))
        .put("polygon", JSONArray(boundary.map { vec2(it.x, it.y) })) // plane space x-y
        .put("world", JSONArray(boundary.map { vec(world.times(Vector3(it.x, it.y, 0f))) }))
        .put("area", r(shoelace(boundary.map { it.x to it.y }).toDouble()))
  }

  private fun volumeJson(id: String, label: String?, labels: List<MRUKLabel>, world: Pose, volume: MRUKVolume): JSONObject {
    val corners = mutableListOf<Vector3>()
    for (x in listOf(volume.min.x, volume.max.x)) for (y in listOf(volume.min.y, volume.max.y)) for (z in listOf(volume.min.z, volume.max.z)) {
      corners.add(world.times(Vector3(x, y, z)))
    }
    return JSONObject()
        .put("id", id)
        .put("label", label ?: JSONObject.NULL)
        .put("labels", JSONArray(labels.map(::labelName)))
        .put("pose", poseJson(world))
        .put("localBox", JSONObject().put("min", vec(volume.min)).put("max", vec(volume.max)))
        .put("worldBox", box(corners))
  }

  private fun pointsJson(id: String, label: String?, labels: List<MRUKLabel>, world: Pose, positions: FloatArray, triangles: Int): JSONObject {
    val local = mutableListOf<Vector3>()
    val worldPts = mutableListOf<Vector3>()
    for (i in positions.indices step 3) {
      val p = Vector3(positions[i], positions[i + 1], positions[i + 2])
      local.add(p)
      worldPts.add(world.times(p))
    }
    return JSONObject()
        .put("id", id)
        .put("label", label ?: JSONObject.NULL)
        .put("labels", JSONArray(labels.map(::labelName)))
        .put("pose", poseJson(world))
        .put("vertexCount", positions.size / 3)
        .put("triangleCount", triangles)
        .put("localBox", box(local))
        .put("worldBox", box(worldPts))
  }

  private fun box(points: List<Vector3>): JSONObject {
    if (points.isEmpty()) return JSONObject()
    var min = points[0]
    var max = points[0]
    for (p in points) {
      min = min.min(p)
      max = max.max(p)
    }
    return JSONObject().put("min", vec(min)).put("max", vec(max))
  }

  /**
   * position, orientation (x, y, z, w) and a column-major 4x4 matrix, as WebXR gives them. The matrix columns are
   * the rotated axes, computed with the SDK's own quaternion maths.
   */
  fun poseJson(p: Pose): JSONObject {
    val x = p.q.times(Vector3(1f, 0f, 0f))
    val y = p.q.times(Vector3(0f, 1f, 0f))
    val z = p.q.times(Vector3(0f, 0f, 1f))
    val m = listOf(x.x, x.y, x.z, 0f, y.x, y.y, y.z, 0f, z.x, z.y, z.z, 0f, p.t.x, p.t.y, p.t.z, 1f)
    return JSONObject()
        .put("position", vec(p.t))
        .put("orientation", JSONArray(listOf(p.q.x, p.q.y, p.q.z, p.q.w).map { q6(it) }))
        .put("matrix", JSONArray(m.map { q6(it) }))
  }

  private fun shoelace(points: List<Pair<Float, Float>>): Float {
    var a = 0f
    for (i in points.indices) {
      val (x1, y1) = points[i]
      val (x2, y2) = points[(i + 1) % points.size]
      a += x1 * y2 - x2 * y1
    }
    return abs(a) / 2f
  }

  private fun r(v: Double): Double = round(v * 1000.0) / 1000.0

  private fun q6(v: Float): Double = round(v * 1e6) / 1e6

  private fun vec(v: Vector3) = JSONArray(listOf(r(v.x.toDouble()), r(v.y.toDouble()), r(v.z.toDouble())))

  private fun vec2(x: Float, y: Float) = JSONArray(listOf(r(x.toDouble()), r(y.toDouble())))
}
