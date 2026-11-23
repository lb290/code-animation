# 云上茶席 · The Tea Pavilion (round 10)

OWNER: agent "tea" · file: `src/tea-pavilion.js` · check: `tools/tea-check.mjs`
Anchor (layout.js, untouched): `L.tea = { x: -240, y: 128, z: -268, rot: 0 }`.
The module pushes that translation and builds everything in local metres:
deck top = local y 0, x/z around 0, city bearing = atan2(268, 240) ≈ 48.1°.

## What is in it (local frame)
- Floating island: irregular grass/moss cap (rim radius 21.8–27.5, with a promontory
  toward the mirror pool), ten stone strata with a flared lip per band, a torn keel to
  y −45.5, hanging vines, boulders, shrubs and flower tufts; a cloud ring + four layers
  of cloud wisp + a keel-tip cloud knot + a far cloud bank (all billboards).
- Marble checkerboard terrace r 15 (polar checker, deep indigo vs ivory, gold inlay
  rings, ten playing cards on the floor), stone balustrade with a city-facing opening
  and two steps down to the grass (0 → −0.31 → −0.62), gold nosings, newel posts.
- Mirror pool d 8.7 on the city-side promontory: dark-blue high-gloss water, gold rim,
  stone apron, lilies and roses drifting on it.
- Pavilion: 8 fluted gilded columns on a 13 m circle (h 7.2), brass entablature + eave,
  shallow ribbed glass dome (16 panes / 8 gold ribs), apex lantern finial, scalloped silk
  valance in every bay, side drapes on the three far bays, four hanging lamps, a
  big tilted rabbit pocket watch hanging in the city-opposite bay, rose vines on three
  columns.
- 12 m tea table (top 0.80 m, 1.7 m wide) with gold edge/apron, six turned legs,
  two benches and two end chairs; on it: 3 brass pots (one rabbit-shaped), 12 cup
  settings (one tipped, one upside down), a three-tier macaron/cake stand, a gramophone,
  an hourglass, three candlesticks, two trays, a rose bowl, cutlery, scattered cards;
  11 pieces of crockery + 6 roses + petals floating above it.
- Three gilded memory-bottle cabinets (nebula violet / mint / amber) with label plates.
- White-rabbit statue by the steps (marble, waistcoat, pocket watch, one flopped ear).
- 6 point lights: over the table, finial lantern, two eave lamps, the cabinets, and a
  cool under-island bounce. Night reads as "lamps just left burning".

## Numbers (tools/tea-check.mjs, deterministic, seed 0x7eae11)
- static triangles 38,319 · verts 105,133 · bbox local y −45.5 … +14.32
- point lights 6 (max 6) · billboards 101 (shape 2 clouds, shape 1 glow motes)
- matrix stack balanced, no NaN / far verts / bad colours / bad materials.

## Known issues
1. Night: the warm point lights and the lamp glass read a bit dim from the wide view —
   the pavilion goes blue before it goes amber. Cheap fix: raise the lamp-sphere
   emissive (M_GLOW) to ~0.95 and add 2× size to the four eave-lamp glow billboards.
2. Silk drapes are single-layer, and the engine does not flip normals on back faces:
   seen from inside a draped bay, the silk back faces read as flat grey cards.
   Fix: duplicate each drape with reversed winding, or give M_SILK a little emissive
   (~0.10) so the shadow side stays warm.
3. The polar checkerboard reads as a whirl/spiral rather than a square grid from high
   above — deliberate for the Alice flavour, but it is a stylistic call.
4. The floating props use the static "staggered + tilted" look; a ctx.dyn model actor
   for them was left out on purpose (no GL dependency in the geometry check).
