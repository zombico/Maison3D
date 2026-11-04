package ai.mojulo.maison3d.furnish

import com.meta.spatial.core.Vector3
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/**
 * Where the laser from the right controller lands: the first of the room's walls, floor and ceiling (as the server
 * describes them) and the placed pieces (each its box: base centre `at`, facing, size w x h x d) along the ray. Plain
 * geometry, so the dot lands where the server will find the same thing.
 */
object Laser {
  data class Wall(val id: String, val cx: Float, val cz: Float, val nx: Float, val nz: Float, val ax: Float, val az: Float, val half: Float, val y0: Float, val y1: Float)
  data class Box(val id: String, val at: Vector3, val facing: Vector3, val size: Vector3)
  data class Hit(val kind: String, val id: String?, val point: Vector3, val normal: Vector3, val distance: Float)

  fun walls(a: JSONArray?): List<Wall> =
      (0 until (a?.length() ?: 0)).map { i ->
        val w = a!!.getJSONObject(i)
        val c = w.getJSONArray("c")
        val n = w.getJSONArray("n")
        val al = w.getJSONArray("along")
        Wall(w.getString("id"), f(c, 0), f(c, 1), f(n, 0), f(n, 1), f(al, 0), f(al, 1), w.getDouble("half").toFloat(), w.getDouble("y0").toFloat(), w.getDouble("y1").toFloat())
      }

  private fun f(a: JSONArray, i: Int) = a.getDouble(i).toFloat()

  /** The nearest hit along the ray from `o` in direction `d` (unit), within `far` metres. */
  fun cast(o: Vector3, d: Vector3, walls: List<Wall>, floorY: Float, ceilingY: Float, boxes: List<Box>, far: Float = 20f): Hit? {
    var best: Hit? = null
    fun take(h: Hit) {
      if (h.distance > 0.02f && h.distance < far && (best == null || h.distance < best!!.distance)) best = h
    }
    if (d.y < -1e-4f) { val t = (floorY - o.y) / d.y; take(Hit("floor", "floor", at(o, d, t), Vector3(0f, 1f, 0f), t)) }
    if (d.y > 1e-4f) { val t = (ceilingY - o.y) / d.y; take(Hit("ceiling", "ceiling", at(o, d, t), Vector3(0f, -1f, 0f), t)) }
    for (w in walls) {
      val den = d.x * w.nx + d.z * w.nz
      if (den > -1e-4f) continue // only a wall the ray meets from inside the room
      val t = ((w.cx - o.x) * w.nx + (w.cz - o.z) * w.nz) / den
      val p = at(o, d, t)
      val u = (p.x - w.cx) * w.ax + (p.z - w.cz) * w.az
      if (abs(u) <= w.half && p.y >= w.y0 && p.y <= w.y1) take(Hit("wall", w.id, p, Vector3(w.nx, 0f, w.nz), t))
    }
    for (b in boxes) boxHit(o, d, b)?.let(::take)
    return best
  }

  /** A ray against a piece's box, in the box's own frame (x right, y up from its base, z to its front). */
  fun boxHit(o: Vector3, d: Vector3, b: Box): Hit? {
    val fl = sqrt(b.facing.x * b.facing.x + b.facing.z * b.facing.z).takeIf { it > 1e-6f } ?: return null
    val fx = b.facing.x / fl
    val fz = b.facing.z / fl
    val rx = fz
    val rz = -fx
    val ox = o.x - b.at.x
    val oy = o.y - b.at.y
    val oz = o.z - b.at.z
    val lo = floatArrayOf(ox * rx + oz * rz, oy, ox * fx + oz * fz)
    val ld = floatArrayOf(d.x * rx + d.z * rz, d.y, d.x * fx + d.z * fz)
    val min = floatArrayOf(-b.size.x / 2, 0f, -b.size.z / 2)
    val max = floatArrayOf(b.size.x / 2, b.size.y, b.size.z / 2)
    var t0 = -Float.MAX_VALUE
    var t1 = Float.MAX_VALUE
    var axis = -1
    var sign = 0f
    for (k in 0..2) {
      if (abs(ld[k]) < 1e-6f) {
        if (lo[k] < min[k] || lo[k] > max[k]) return null
        continue
      }
      var a = (min[k] - lo[k]) / ld[k]
      var c = (max[k] - lo[k]) / ld[k]
      var s = -1f
      if (a > c) { val tmp = a; a = c; c = tmp; s = 1f }
      if (a > t0) { t0 = a; axis = k; sign = s }
      t1 = min(t1, c)
      if (t0 > t1) return null
    }
    if (t1 < 0f || axis < 0) return null
    val t = max(t0, 0f)
    // the face's normal back in the world
    val normal = when (axis) {
      0 -> Vector3(rx * sign, 0f, rz * sign)
      1 -> Vector3(0f, sign, 0f)
      else -> Vector3(fx * sign, 0f, fz * sign)
    }
    return Hit("piece", b.id, at(o, d, t), normal, t)
  }

  /** Where the ray meets the plane through `p` with normal `n`, or null when it runs along it or away. */
  fun onPlane(o: Vector3, d: Vector3, p: Vector3, n: Vector3): Vector3? {
    val den = d.x * n.x + d.y * n.y + d.z * n.z
    if (abs(den) < 1e-4f) return null
    val t = ((p.x - o.x) * n.x + (p.y - o.y) * n.y + (p.z - o.z) * n.z) / den
    return if (t > 0f && t < 30f) at(o, d, t) else null
  }

  fun at(o: Vector3, d: Vector3, t: Float) = Vector3(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t)

  /** A hit as the server reads what was pointed at: { ray, target, id, point, normal, distance }. */
  fun json(o: Vector3, d: Vector3, h: Hit?): JSONObject {
    val ray = JSONObject().put("origin", Room.vec(o)).put("direction", Room.vec(d))
    if (h == null) return JSONObject().put("ray", ray).put("target", "nothing")
    return JSONObject().put("ray", ray).put("target", h.kind).put("id", h.id ?: JSONObject.NULL).put("point", Room.vec(h.point)).put("normal", Room.vec(h.normal)).put("distance", Room.r(h.distance))
  }
}
