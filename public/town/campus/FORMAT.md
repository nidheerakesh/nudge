# Campus geo format (v1)

File: `public/town/campus/kottayam.json`, made by `node scripts/campus-geo.mjs` from `test/fixtures/kottayam.json` (OpenStreetMap data, ODbL).

Units are metres. Origin is 132 m west and 55 m north of the north west corner of the place box (`boxOf(lat, lon)` in `src/town/places.js`), so the whole campus fits. `x` grows east, `z` grows south. The walkable area is 616 by 594. Network positions are metres / 11, which keeps them inside the protocol's 0 to 60 range.

```
{
  v: 1,
  osm: 'way/1077351803',
  name: 'IIIT Kottayam',
  w: 616, h: 594, m: 11,
  bld: [{ id, n, k, h, p, c, door }],
  roads: [{ k, w, p }],
  water: [ring],
  pitch: [ring],
  park: [{ k, p }],
  edge: ring or null,
  plots: [{ x, z, r }],
  spawn: [x, z]
}
```

- A ring is `[[x, z], ...]`, at least 3 points, the closing point is NOT repeated, winding is not fixed.
- `bld[i]`: `id` OSM way id, `n` name or null, `k` one of `academic hostel admin dining theatre house utility gym other`, `h` height in metres, `p` footprint ring, `c` centroid `[x, z]`, `door` `[x, z]` a point 2 m outside the footprint on the side nearest a road.
- `roads[i]`: `k` the OSM highway value, `w` width in metres, `p` open polyline `[[x, z], ...]`.
- `park[i]`: `k` is `parking` or `quarry`, `p` ring.
- `edge`: ring of the `amenity=university` boundary way, or null.
- `plots`: exactly 24 player house spots. `x, z` house centre, `r` yaw in radians, `r = atan2(roadX - x, roadZ - z)` so the house front faces the road.
- `spawn`: a free point on a road near the Admin Block.
- All numbers are rounded to 2 decimals.
