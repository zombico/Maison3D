# Spike 08, step 1: mojulo furnishes the scanned room

`toMojulo.mjs` turns the headset's room (spike 05's sample: walls with normals, real furniture with turned
footprints, door frames) into a mojulo one-cell floor plan: the room's frame comes from its walls (north = the longest,
no mirroring), its size from the distances between opposite walls (3.08 x 2.95 m, 10.1 x 9.7 ft), the real furniture
becomes fixed `items` mojulo must furnish around, and the door frames become `doors` on the south edge.
`your-room.floorplan.json` is the manifest that was minted.

| brief (furnishScale share, furnishing constructed) | what mojulo placed |
| --- | --- |
| lounge, the room empty | media console, sofa, armchair, coffee table, rug, decor |
| lounge, with your real furniture as items | rug, decor on your tables |
| lounge, seed 3, with your furniture | the same |
| office, with your furniture | one bookcase |

`empty-vs-with-your-furniture.png`: the empty room furnished (left) and with your furniture in it (right), from above.

What this says:

- Reading mojulo's placements back works: every piece is a node named `asset:<id>` (parts `asset:<id>:<part>`) with
  bounds in plan feet, so position and size map back to the room exactly. Facing is not written out; it has to be
  read from the arrangement or the geometry.
- mojulo furnishes a room of this size well when it is empty, with its pieces sized to the floor.
- With the real furniture in, its arrangers give up on the main pieces. Its rules lay a set out against walls and
  around a focal piece, and a room whose walls are already taken leaves them no set to place. A real room nearly
  always has furniture in it, so this is the normal case, not an edge case.

Likely next move: a hybrid. mojulo decides what goes in and how big (its set and share sizing, its constructed pieces
as editable recipes, from the empty-room run), and spike 07's room-aware placement decides where, around the real
furniture. Worth one more try first: give mojulo only the free part of the room as the cell.
