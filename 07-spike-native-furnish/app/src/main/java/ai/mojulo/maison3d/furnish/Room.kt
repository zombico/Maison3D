package ai.mojulo.maison3d.furnish

import com.meta.spatial.core.Pose
import com.meta.spatial.core.Vector3
import com.meta.spatial.mruk.MRUKAnchor
import com.meta.spatial.mruk.MRUKFeature
import com.meta.spatial.mruk.MRUKLabel
import com.meta.spatial.mruk.MRUKPlane
import com.meta.spatial.mruk.MRUKRoom
import com.meta.spatial.mruk.MRUKVolume
import com.meta.spatial.mruk.SurfaceType
import com.meta.spatial.mruk.getLabelsAsList
import com.meta.spatial.toolkit.Transform
import kotlin.math.round
import org.json.JSONArray
import org.json.JSONObject

/**
 * The room you are standing in, the way the agent needs it: each wall, frame and piece of furniture with a short id,
 * its label, centre, size and top, in the app's world space (y up, metres, -z forward at launch). Spike 05 showed that
 * the headset loads every room it knows, so only the current one is described, and that the floor is not at y = 0,
 * so the floor's own height is given.
 */
class Room(private val mruk: MRUKFeature) {

  fun current(): MRUKRoom? = mruk.getCurrentRoom() ?: mruk.rooms.firstOrNull()

  fun describe(): JSONObject {
    val room = current() ?: return JSONObject().put("loaded", false)
    val items = JSONArray()
    var floorY: Float? = null
    for (a in anchors(room)) {
      if (a.label == "floor") floorY = a.center.y
      if (a.label == "global mesh") continue
      val item = JSONObject().put("id", a.id).put("label", a.label).put("center", vec(a.center)).put("size", vec(a.size)).put("top", r(a.top))
      // walls, frames and other flat things: which way they face, so "against that wall" has an answer
      a.normal?.let { item.put("normal", vec(it)) }
      // real furniture: its own footprint, turned the way it stands (the room's axes need not match the world's)
      a.footprint?.let { item.put("footprint", it) }
      items.put(item)
    }
    return JSONObject().put("loaded", true).put("floorY", floorY?.let { r(it) } ?: JSONObject.NULL).put("items", items)
  }

  /** What the ray from `origin` along `direction` hits first in the current room: a wall, the floor, a table… */
  fun pointAt(origin: Vector3, direction: Vector3): JSONObject? {
    val room = current() ?: return null
    val hit = mruk.raycastRoom(room.anchor.uuid, origin, direction, 20f, SurfaceType.PLANE_VOLUME) ?: return null
    val anchor = anchors(room).firstOrNull { it.uuid == hit.sceneAnchorUuid.toString() }
    return JSONObject()
        .put("ray", JSONObject().put("origin", vec(origin)).put("direction", vec(direction)))
        .put("target", anchor?.label ?: "surface")
        .put("id", anchor?.id ?: JSONObject.NULL)
        .put("point", vec(hit.hitPosition))
        .put("normal", vec(hit.hitNormal))
        .put("distance", r(hit.hitDistance))
  }

  private class Anchor(
      val uuid: String,
      val id: String,
      val label: String,
      val center: Vector3,
      val size: Vector3,
      val top: Float,
      val normal: Vector3?,
      val footprint: JSONObject?,
  )

  private fun anchors(room: MRUKRoom): List<Anchor> {
    val roomPose = room.entity?.tryGetComponent<Transform>()?.transform ?: Pose()
    val counts = mutableMapOf<String, Int>()
    val out = mutableListOf<Anchor>()
    for (e in room.anchors) {
      val info = e.tryGetComponent<MRUKAnchor>() ?: continue
      val world = roomPose.times(e.tryGetComponent<Transform>()?.transform ?: Pose())
      val label = info.getLabelsAsList().firstOrNull()?.let(::labelName) ?: "other"
      val corners = mutableListOf<Vector3>()
      val volume = e.tryGetComponent<MRUKVolume>()
      val plane = e.tryGetComponent<MRUKPlane>()
      if (volume != null) {
        for (x in listOf(volume.min.x, volume.max.x)) for (y in listOf(volume.min.y, volume.max.y)) for (z in listOf(volume.min.z, volume.max.z)) {
          corners.add(world.times(Vector3(x, y, z)))
        }
      } else if (plane != null) {
        for (x in listOf(plane.min.x, plane.max.x)) for (y in listOf(plane.min.y, plane.max.y)) corners.add(world.times(Vector3(x, y, 0f)))
      } else {
        corners.add(world.t)
      }
      var min = corners[0]
      var max = corners[0]
      for (c in corners) {
        min = min.min(c)
        max = max.max(c)
      }
      // short ids the model can say back: table1, table2, wall3…
      val key = label.replace(" ", "")
      val n = (counts[key] ?: 0) + 1
      counts[key] = n
      // a plane lies in its anchor's x-y with its normal along +z (spike 05); a volume has no single facing
      val normal = if (volume == null && plane != null) world.q.times(Vector3(0f, 0f, 1f)).normalize() else null
      // a volume stands on its anchor's x-y with height along -z (spike 05): its level axes are the anchor's x and y
      val footprint =
          volume?.let { v ->
            val ax = world.q.times(Vector3(1f, 0f, 0f))
            val ay = world.q.times(Vector3(0f, 1f, 0f))
            val mid = world.times(v.min.plus(v.max).times(0.5f))
            JSONObject()
                .put("center", JSONArray(listOf(r(mid.x), r(mid.z))))
                .put("u", JSONArray(listOf(r(ax.x), r(ax.z))))
                .put("v", JSONArray(listOf(r(ay.x), r(ay.z))))
                .put("half", JSONArray(listOf(r((v.max.x - v.min.x) / 2), r((v.max.y - v.min.y) / 2))))
          }
      out.add(Anchor(info.uuid.toString(), "$key$n", label, min.plus(max).times(0.5f), max.minus(min), max.y, normal, footprint))
    }
    return out
  }

  private fun labelName(label: MRUKLabel): String =
      when (label) {
        MRUKLabel.WALL_FACE -> "wall"
        MRUKLabel.INVISIBLE_WALL_FACE -> "invisible wall"
        MRUKLabel.INNER_WALL_FACE -> "inner wall"
        MRUKLabel.DOOR_FRAME -> "door frame"
        MRUKLabel.WINDOW_FRAME -> "window frame"
        MRUKLabel.WALL_ART -> "wall art"
        MRUKLabel.GLOBAL_MESH -> "global mesh"
        else -> label.name.lowercase().replace('_', ' ')
      }

  companion object {
    fun r(v: Float): Double = round(v * 1000.0) / 1000.0

    fun vec(v: Vector3) = JSONArray(listOf(r(v.x), r(v.y), r(v.z)))
  }
}
