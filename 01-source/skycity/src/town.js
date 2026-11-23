// The lantern town: machiya packed along the ring road, plus the street-level
// festival dressing (delegated to street.js). Everything here is procedural and
// deterministic for a given rng.
import { buildMachiya } from './buildings.js';
import { buildStreetFestival } from './street.js';
import { box, cylinder, rgb, mixc, mulc, ribbon, catenary } from './geo.js';
import { C } from './palette.js';
import { m4, mulberry32, TAU, lerp } from './math.js';
import { mainIslandY } from './terrain.js';

// Ring road geometry (lower terrace of the main island).
export const TOWN = {
  roadR: 45.5,      // street centre line
  faceIn: 43.0,     // inner row facade radius
  faceOut: 47.9,    // outer row facade radius
  y: 0.2,           // ground level of the lower terrace
  a0: 0.12,         // street arc start angle
  a1: 2.78,         // street arc end angle
};

// Place one machiya at polar (a, centreRadius), front facing outward (+1) or
// inward (-1). Returns the building info.
function place(b, ctx, rng, a, centerR, dir, opts) {
  const theta = dir > 0 ? Math.PI / 2 - a : -Math.PI / 2 - a;
  const px = Math.cos(a) * centerR, pz = Math.sin(a) * centerR;
  // sit on the island's noisy top surface (the island sags toward the rim)
  const ground = TOWN.y + mainIslandY(px, pz);
  b.push(m4.translate([px, ground, pz]));
  b.push(m4.rotY(theta));
  const info = buildMachiya(b, ctx, rng, opts);
  b.pop();
  b.pop();
  return info;
}

// Pack a row of buildings along an arc of the street.
function packRow(b, ctx, rng, placed, o) {
  // o: { rf, dir, a0, a1, gap, wMin, wMax, dMin, dMax, detail, floors }
  let a = o.a0;
  let guard = 0;
  while (guard++ < 200) {
    const w = o.wMin + rng() * (o.wMax - o.wMin);
    const d = o.dMin + rng() * (o.dMax - o.dMin);
    const gap = o.gap + rng() * 0.5;
    const step = (w + gap) / o.rf;
    const ac = a + step * 0.5;
    if (ac - step * 0.5 > o.a1) break;
    // slight setback so the frontage is not perfectly flat
    const setback = rng() < 0.32 ? (rng() * 0.85) : 0;
    const rf = o.rf - o.dir * setback;
    const centerR = rf - o.dir * d / 2;
    const floors = o.floors ?? (rng() < 0.2 ? 1 : rng() < 0.86 ? 2 : 3);
    const detail = o.detailFn ? o.detailFn(ac) : (o.detail ?? 2);
    place(b, ctx, rng, ac, centerR, o.dir, {
      w, d, floors, bays: Math.max(2, Math.min(4, Math.round(w / 2.15))), detail,
    });
    placed.push({ a: ac, r: centerR, w, d, dir: o.dir, detail, floors });
    a += step;
  }
}

export function buildTown(b, ctx, rng, o = {}) {
  const startTris = b.triCount;
  const startVerts = b.v.length;
  const placed = [];
  b.note('town');

  // Hero arc: the stretch of street the main camera views look down. Only these
  // buildings are built at full detail; the rest of the street is mid detail and
  // the back row is a cheap silhouette (everything is one static mesh, so LOD is
  // a build-time budget, not a runtime switch).
  const detailFn = (a) => (a > 0.42 && a < 2.08 ? 2 : 1);

  // ---- inner row (facade faces outward, toward the ring road)
  packRow(b, ctx, rng, placed, {
    rf: TOWN.faceIn, dir: 1, a0: TOWN.a0 + 0.05, a1: TOWN.a1 - 0.05,
    gap: 0.7, wMin: 4.8, wMax: 7.0, dMin: 4.4, dMax: 5.6, detailFn,
  });
  // ---- outer row (facade faces inward)
  packRow(b, ctx, rng, placed, {
    rf: TOWN.faceOut, dir: -1, a0: TOWN.a0, a1: TOWN.a1,
    gap: 0.75, wMin: 4.8, wMax: 7.2, dMin: 4.5, dMax: 5.8, detailFn,
  });

  // ---- back row: silhouette filler behind the outer row, cheap geometry
  packRow(b, ctx, rng, placed, {
    rf: TOWN.faceOut + 7.2, dir: 1, a0: TOWN.a0 + 0.1, a1: TOWN.a1 - 0.1,
    gap: 2.4, wMin: 4.2, wMax: 6.4, dMin: 3.8, dMax: 4.8, detail: 0,
  });

  // ---- sparse far row around the rest of the ring: the dressed street ends at
  // TOWN.a1, so without this the town would stop dead mid-circle when seen from
  // outside. Cheap silhouettes only (~250 tris each).
  packRow(b, ctx, rng, placed, {
    rf: TOWN.faceOut + 1.4, dir: -1, a0: TOWN.a1 + 0.16, a1: TOWN.a0 + TAU - 0.16,
    gap: 4.4, wMin: 4.6, wMax: 6.4, dMin: 4.0, dMax: 5.2, detail: 0,
  });

  // ---- corner buildings capping both ends of the street (taller, hero detail)
  for (const [a, dir] of [[TOWN.a0 - 0.06, 1], [TOWN.a1 + 0.06, -1]]) {
    const rf = dir > 0 ? TOWN.faceIn : TOWN.faceOut;
    const d = 5.6;
    place(b, ctx, rng, a, rf - dir * d / 2, dir, { w: 7.6, d, floors: 3, bays: 3, detail: 2 });
    placed.push({ a, r: rf - dir * d / 2, w: 7.6, d, dir, detail: 2, floors: 3, corner: true });
  }

  // ---- paved ring street: stone band + gutters, following the island surface
  {
    const up = [0, 1, 0];
    const r0 = TOWN.faceIn - 0.32, r1 = TOWN.faceOut + 0.32;
    const P = (a, r) => {
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      return [x, TOWN.y + mainIslandY(x, z) + 0.16, z];
    };
    const n = 48;
    for (let i = 0; i < n; i++) {
      const a0 = TOWN.a0 + (i / n) * (TOWN.a1 - TOWN.a0);
      const a1 = TOWN.a0 + ((i + 1) / n) * (TOWN.a1 - TOWN.a0);
      const c = mixc(C.stone, C.stoneDark, 0.3 + (i % 4) * 0.06);
      b.quad(P(a0, r0), P(a0, r1), P(a1, r1), P(a1, r0), c, [0, 0.1], up);
      b.quad(P(a0, r0), P(a1, r0), P(a1, r0 + 0.3), P(a0, r0 + 0.3), mulc(C.stoneDark, 0.62), [0, 0.07], up);
      b.quad(P(a0, r1), P(a1, r1), P(a1, r1 - 0.3), P(a0, r1 - 0.3), mulc(C.stoneDark, 0.62), [0, 0.07], up);
    }
  }

  // world-space bounds of everything the town added (diagnostics: catches a
  // transform-stack leak or a misplaced row immediately)
  let bx0 = 1e9, bx1 = -1e9, by0 = 1e9, by1 = -1e9, bz0 = 1e9, bz1 = -1e9;
  for (let i = startVerts; i < b.v.length; i += 11) {
    const x = b.v[i], y = b.v[i + 1], z = b.v[i + 2];
    if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
    if (y < by0) by0 = y; if (y > by1) by1 = y;
    if (z < bz0) bz0 = z; if (z > bz1) bz1 = z;
  }
  const stats = { count: placed.length, tris: b.triCount - startTris, placed, bounds: [bx0, bx1, by0, by1, bz0, bz1].map((v) => +v.toFixed(1)) };

  // ---- street dressing (stalls, strings, banners, lanterns); see street.js
  if (o.noStreet !== true) {
    try {
      const dressed = buildStreetFestival(b, ctx, rng, {
        a0: TOWN.a0, a1: TOWN.a1, roadR: TOWN.roadR, faceIn: TOWN.faceIn, faceOut: TOWN.faceOut, y: TOWN.y,
        groundAt: (x, z) => TOWN.y + mainIslandY(x, z),
      });
      if (dressed) stats.street = dressed;
    } catch (e) {
      console.warn('[town] street dressing failed:', e && e.message);
    }
  }

  return stats;
}
