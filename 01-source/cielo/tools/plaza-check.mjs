// Geometry-only checks for the round-9 central plaza (no GL / no browser).
//   node tools/plaza-check.mjs
// Proves, from the built triangle soup and from the layout the builder publishes:
//   - buildPlaza consumes EXACTLY 40 shared rng() draws (city stages after the plaza keep
//     their random sequence), and is deterministic / independent of the shared seed;
//   - the balustrade ring at R=44 is ONE continuous run, opened only at the real street
//     mouths (N-S boulevard + the z=-14 / z=-60 cross streets), with every opening clear;
//   - every plaza element (statue / pylon / post / lamp / bench / tree / topiary) is on
//     the ground, clear of the fountain, and exists as a mirror pair about x=0;
//   - the raised paving floor lies entirely ABOVE the 0.05 m street kerbs (the second
//     cause of the "stray white slivers on the plaza floor"), and covers every gate mouth;
//   - no NaN / bad colour / bad normal / leaked matrix stack;
//   - triangle budget: plaza stage <= 8020 (round-8 baseline) + 35k, whole city +35k.
import { B } from '../src/geo.js';
import { mulberry32 } from '../src/math.js';
import { buildCity, buildPlaza, plazaPaving, plazaSpec, plazaLast } from '../src/city.js';
import { L } from '../src/layout.js';

// ---- contract constants (kept in sync with src/city.js and the round-9 brief)
const SEED = 20261121;
const R = 44;                       // balustrade centre line
const PAVE_R = 46;                  // paved terrace radius
const BASELINE_PLAZA = 8020;        // round-8 plaza stage triangles
const BASELINE_CITY = 762419;       // round-8 buildCity triangles
const BASELINE_RNG = 6066;          // round-8 buildCity shared rng() draws
const BUDGET = 35000;
const GATE_EMPTY = 3.4 * Math.PI / 180;   // inside a gate: railing must be absent
const COVER_MARGIN = 4.6 * Math.PI / 180; // outside a gate by this much: railing must exist
const RAIL_BAND = { r0: 43.4, r1: 44.6, y0: 0.40, y1: 4.20 };

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

function stats(b) {
  const v = b.v;
  let nan = 0, far = 0, badMat = 0;
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let i = 0; i < v.length; i += 11) {
    for (let k = 0; k < 3; k++) {
      const x = v[i + k];
      if (!Number.isFinite(x)) nan++;
      mn[k] = Math.min(mn[k], x); mx[k] = Math.max(mx[k], x);
    }
    if (Math.abs(v[i]) > 3000 || Math.abs(v[i + 1]) > 3000 || Math.abs(v[i + 2]) > 3000) far++;
    const e = v[i + 9], g = v[i + 10];
    if (!Number.isFinite(e) || !Number.isFinite(g) || e < 0 || e > 1.2 || g < 0 || g > 1) badMat++;
  }
  let h = 2166136261;
  for (let i = 0; i < v.length; i += 7) h = Math.imul(h ^ Math.round(v[i] * 1024), 16777619) >>> 0;
  return {
    tris: b.i.length / 3, verts: v.length / 11, nan, far, badMat, hash: h,
    stack: b.stack.length, bad: b.bad || 0, badColor: b.badColor || 0, badNormal: b.badNormal || 0,
    bbox: { min: mn.map((x) => +x.toFixed(3)), max: mx.map((x) => +x.toFixed(3)) },
  };
}

const ctx = { points: [], lanterns: [] };

// ---------------------------------------------------------------- 1. build the plaza
let shared = 0;
const seedRng = mulberry32(SEED);
const b = new B();
buildPlaza(b, ctx, () => { shared++; return seedRng(); });
const s = stats(b);
const spec = plazaLast.spec;
const elements = plazaLast.elements.slice();

ok(shared === 40, 'buildPlaza consumed ' + shared + ' shared rng() draws (must be exactly 40)');
ok(!!spec, 'buildPlaza did not publish its layout spec');
ok(s.stack === 1, 'plaza leaks the matrix stack: ' + s.stack);
ok(s.nan === 0, 'plaza non-finite vertices: ' + s.nan);
ok(s.far === 0, 'plaza far vertices: ' + s.far);
ok(s.bad === 0, 'plaza NaN verts: ' + s.bad);
ok(s.badColor === 0, 'plaza bad colours: ' + s.badColor);
ok(s.badNormal === 0, 'plaza degenerate normals: ' + s.badNormal);
ok(s.badMat === 0, 'plaza bad material arrays: ' + s.badMat);
ok(ctx.points.length <= 4, 'plaza pushes ' + ctx.points.length + ' point lights (max 4)');
ok(ctx.lanterns.length >= 8 && ctx.lanterns.length <= 60, 'plaza lanterns ' + ctx.lanterns.length + ' (expected 8..60)');
ok(s.tris >= BASELINE_PLAZA, 'plaza got smaller than the round-8 baseline? ' + s.tris);
ok(s.tris <= BASELINE_PLAZA + BUDGET, 'plaza over budget: ' + s.tris + ' tris (max ' + (BASELINE_PLAZA + BUDGET) + ')');
ok(s.bbox.min[0] >= -PAVE_R - 0.6 && s.bbox.max[0] <= PAVE_R + 0.6, 'plaza x outside the reserved disc: ' + JSON.stringify(s.bbox));
ok(s.bbox.min[2] >= L.plaza.z - PAVE_R - 0.6 && s.bbox.max[2] <= L.plaza.z + PAVE_R + 0.6, 'plaza z outside the reserved disc: ' + JSON.stringify(s.bbox));
ok(s.bbox.min[1] >= -0.26 && s.bbox.min[1] < 0.3, 'plaza does not sit on the ground: ' + s.bbox.min[1] + ' (topiary/lamp plinth boxes of the shared props sink up to 0.25 m)');
ok(s.bbox.max[1] <= 14, 'plaza is too tall: ' + s.bbox.max[1]);

// ---------------------------------------------------------------- 2. determinism
const b2 = new B();
buildPlaza(b2, { points: [], lanterns: [] }, mulberry32(7));   // different shared seed
const s2 = stats(b2);
ok(s2.tris === s.tris && s2.hash === s.hash, 'plaza is not deterministic / still reads the shared rng');
ok(JSON.stringify(plazaLast.elements) === JSON.stringify(elements), 'plaza element list is not deterministic');

// ---------------------------------------------------------------- 3. gates (openings come from real streets)
const cx = L.plaza.x, cz = L.plaza.z;
const deg = (a) => (a * 180 / Math.PI + 360) % 360;
ok(spec.gaps.length === 6, 'expected 6 gate openings (N/S boulevard + 2 cross streets x2), got ' + spec.gaps.length);
ok(spec.R === R, 'balustrade radius drifted from ' + R);
// the N-S boulevard really runs through x=0 and the two cross streets really cross the ring
let blvGap = 0, streetGap = 0;
for (const g of spec.gaps) {
  const am = g.a0 + g.w / 2;
  const gx = cx + Math.cos(am) * R, gz = cz + Math.sin(am) * R;
  if (g.kind === 'boulevard') {
    blvGap++;
    ok(Math.abs(gx) <= 13.2, 'boulevard gate is not on the boulevard axis: x=' + gx.toFixed(2));
  } else {
    streetGap++;
    // the mouth must sit on one of the two cross streets that actually pierce the disc
    const near = [-14, -60].some((zs) => Math.abs(gz - zs) <= 9.2);
    ok(near, 'street gate at z=' + gz.toFixed(2) + ' is not on a real cross street (z=-14 / z=-60)');
  }
}
ok(blvGap === 2, 'boulevard gates: ' + blvGap + ' (expected 2)');
ok(streetGap === 4, 'cross-street gates: ' + streetGap + ' (expected 4)');

// ---------------------------------------------------------------- 4. continuous balustrade ring
// bin the ring at 1 deg and mark the bins the railing actually occupies (triangles whose
// centroid is on the R=44 line, between the balusters' base and the top rail)
const NB = 360;
const covered = new Array(NB).fill(false);
const P = (i) => [b.v[i], b.v[i + 1], b.v[i + 2]];
for (let t = 0; t < b.i.length; t += 3) {
  const A = P(b.i[t] * 11), Bv = P(b.i[t + 1] * 11), C = P(b.i[t + 2] * 11);
  const mx = (A[0] + Bv[0] + C[0]) / 3, my = (A[1] + Bv[1] + C[1]) / 3, mz = (A[2] + Bv[2] + C[2]) / 3;
  const rr = Math.hypot(mx - cx, mz - cz);
  if (rr < RAIL_BAND.r0 || rr > RAIL_BAND.r1) continue;
  if (my < RAIL_BAND.y0 || my > RAIL_BAND.y1) continue;
  let ang = [A, Bv, C].map((v) => deg(Math.atan2(v[2] - cz, v[0] - cx)));
  let lo = Math.min(...ang), hi = Math.max(...ang);
  if (hi - lo > 180) { ang = ang.map((a) => (a < 180 ? a + 360 : a)); lo = Math.min(...ang); hi = Math.max(...ang); }
  for (let k = Math.floor(lo); k <= Math.ceil(hi); k++) covered[((k % NB) + NB) % NB] = true;
}
const inGap = (a, g, shrink) => {
  const rel = ((a - deg(g.a0)) % 360 + 360) % 360;
  return rel > shrink && rel < g.w * 180 / Math.PI - shrink;
};
let railBins = 0, gateBins = 0, holes = [], intruders = [];
for (let i = 0; i < NB; i++) {
  const a = (i + 0.5) * Math.PI / 180;
  const emptyZone = spec.gaps.some((g) => inGap(deg(a), g, GATE_EMPTY * 180 / Math.PI));
  const mustCover = !spec.gaps.some((g) => inGap(deg(a), g, -COVER_MARGIN * 180 / Math.PI));
  if (emptyZone) { gateBins++; if (covered[i]) intruders.push((i + 0.5).toFixed(1)); }
  else if (mustCover) { railBins++; if (!covered[i]) holes.push((i + 0.5).toFixed(1)); }
}
ok(intruders.length === 0, 'railing intrudes into ' + intruders.length + ' gate bins near ' + JSON.stringify(intruders.slice(0, 8)));
ok(holes.length === 0, 'railing ring has ' + holes.length + ' uncovered 1-deg bins: ' + JSON.stringify(holes.slice(0, 12)));
ok(railBins >= 150, 'only ' + railBins + ' bins of continuous railing (expected >= 150 of 360)');

// ---------------------------------------------------------------- 5. elements: ground / fountain / mirror pairs
const FOUNTAIN_R = 16;
let minR = 1e9, maxR = 0;
for (const e of elements) {
  const r = Math.hypot(e.x - cx, e.z - cz);
  minR = Math.min(minR, r); maxR = Math.max(maxR, r);
  ok(r >= FOUNTAIN_R, e.kind + ' at r=' + r.toFixed(2) + ' invades the fountain_round point');
  ok(r <= 45.2, e.kind + ' at r=' + r.toFixed(2) + ' pokes outside the balustrade');
}
ok(elements.length >= 60, 'only ' + elements.length + ' plaza elements recorded (expected >= 60)');
// every element must exist as its mirror image about x=0 (tolerance 0.05 m)
let unpaired = [];
for (const e of elements) {
  if (Math.abs(e.x) < 0.05) continue;                       // on the axis: its own mirror
  const hit = elements.some((o) => o.kind === e.kind && Math.abs(o.x + e.x) < 0.05 && Math.abs(o.z - e.z) < 0.05);
  if (!hit) unpaired.push(e.kind + '@' + e.x.toFixed(2) + ',' + e.z.toFixed(2));
}
ok(unpaired.length === 0, unpaired.length + ' plaza elements have no mirror twin: ' + JSON.stringify(unpaired.slice(0, 8)));
const counts = {};
for (const e of elements) counts[e.kind] = (counts[e.kind] || 0) + 1;
ok((counts.statue || 0) === 4, 'statues on plinths: ' + (counts.statue || 0) + ' (expected 4)');
ok((counts.pylon || 0) === 4, 'boulevard pylons: ' + (counts.pylon || 0) + ' (expected 4)');
ok((counts.post || 0) === 8, 'gate posts: ' + (counts.post || 0) + ' (expected 8)');
ok((counts.lamp || 0) === 8, 'paired lamps: ' + (counts.lamp || 0) + ' (expected 8)');
ok((counts.bench || 0) === 16, 'benches: ' + (counts.bench || 0) + ' (expected 16)');
ok((counts.tree || 0) === 32, 'allee trees: ' + (counts.tree || 0) + ' (expected 32)');
// nothing may stand in the open gate fan (the aperture + the first approach metres)
let inMouth = [];
for (const e of elements) {
  const r = Math.hypot(e.x - cx, e.z - cz);
  if (r < 41) continue;
  const a = deg(Math.atan2(e.z - cz, e.x - cx));
  if (spec.gaps.some((g) => inGap(a, g, 1.4))) inMouth.push(e.kind + '@' + a.toFixed(1) + 'deg');
}
ok(inMouth.length === 0, inMouth.length + ' elements stand in a gate mouth: ' + JSON.stringify(inMouth.slice(0, 8)));

// ---------------------------------------------------------------- 6. raised paving (no kerbs poking through)
const pb = new B();
plazaPaving(pb);
const ps = stats(pb);
ok(ps.nan === 0 && ps.badColor === 0 && ps.badNormal === 0 && ps.stack === 1, 'paving stats dirty');
ok(ps.tris <= 4200, 'plaza paving is heavier than expected: ' + ps.tris + ' tris (max 4200)');
// the terrace edge curb starts at y=0 (it closes the 7.5 cm platform edge); every
// UPWARD-FACING paving surface must be above the 0.05 m street kerbs
let lowSurfaces = 0;
for (let i = 0; i < pb.v.length; i += 11) {
  if (pb.v[i + 4] > 0.9 && pb.v[i + 1] < 0.074) lowSurfaces++;
}
ok(lowSurfaces === 0, lowSurfaces + ' upward-facing paving vertices sit at/below the 0.05 m kerb height');
ok(ps.bbox.max[1] <= 0.20, 'plaza paving stands too proud: y=' + ps.bbox.max[1]);
// the terrace apron must be a CONTINUOUS ring (44.1..46 m): bin it at 1 deg and require
// every bin to contain an apron triangle, so no gate mouth can open a hole in the floor
const apron = new Array(360).fill(false);
for (let t = 0; t < pb.i.length; t += 3) {
  const Q = [0, 1, 2].map((k) => [pb.v[pb.i[t + k] * 11], pb.v[pb.i[t + k] * 11 + 1], pb.v[pb.i[t + k] * 11 + 2]]);
  if (!Q.every((v) => v[1] > 0.070 && v[1] < 0.081)) continue;         // the 0.075 apron ring only
  let ang = Q.map((v) => ((Math.atan2(v[2] - cz, v[0] - cx) * 180 / Math.PI) + 360) % 360);
  let lo = Math.min(...ang), hi = Math.max(...ang);
  if (hi - lo > 180) { ang = ang.map((v) => (v < 180 ? v + 360 : v)); lo = Math.min(...ang); hi = Math.max(...ang); }
  for (let k = Math.floor(lo); k <= Math.ceil(hi); k++) apron[((k % 360) + 360) % 360] = true;
}
const apronHoles = [];
for (let i = 0; i < 360; i++) if (!apron[i]) apronHoles.push((i + 0.5).toFixed(0));
ok(apronHoles.length === 0, 'terrace apron / gate mouths have ' + apronHoles.length + ' unpaved 1-deg bins at r=45.4: ' + JSON.stringify(apronHoles.slice(0, 12)));

// ---------------------------------------------------------------- 7. whole city: budget + rng sequence
let cityCalls = 0;
const cityRng = mulberry32(SEED);
const cb = new B();
buildCity(cb, { points: [], lanterns: [] }, () => { cityCalls++; return cityRng(); });
const cs = stats(cb);
ok(cityCalls === BASELINE_RNG, 'buildCity now draws ' + cityCalls + ' shared rng() (was ' + BASELINE_RNG + ') — a later stage would be re-rolled');
ok(cs.tris <= BASELINE_CITY + BUDGET, 'city over budget: ' + cs.tris + ' tris (max ' + (BASELINE_CITY + BUDGET) + ')');
ok(cs.tris > BASELINE_CITY, 'city triangles did not change at all? (plaza should add geometry)');
ok(cs.nan === 0 && (cs.badColor || 0) === 0, 'buildCity stats dirty (non-finite vertices / colours)');
const cb2 = new B();
buildCity(cb2, { points: [], lanterns: [] }, mulberry32(SEED));   // same seed, no counting wrapper
const cs2 = stats(cb2);
ok(cs2.tris === cs.tris && cs2.hash === cs.hash, 'buildCity is not deterministic');

// ---------------------------------------------------------------- report
const report = {
  plaza_tris: s.tris, plaza_delta: s.tris - BASELINE_PLAZA, plaza_bbox: s.bbox,
  paving_tris: ps.tris, paving_min_y: ps.bbox.min[1],
  city_tris: cs.tris, city_delta: cs.tris - BASELINE_CITY, city_rng: cityCalls,
  rng_burn: shared,
  gates: spec.gaps.map((g) => ({ kind: g.kind, from: +(g.a0 * 180 / Math.PI).toFixed(1), to: +((g.a0 + g.w) * 180 / Math.PI).toFixed(1) })),
  rail_bins: railBins, gate_bins: gateBins, rail_holes: holes.length, gate_intruders: intruders.length,
  elements: counts, element_radius: [+minR.toFixed(1), +maxR.toFixed(1)],
  lanterns: ctx.lanterns.length, point_lights: ctx.points.length,
  deterministic: s2.tris === s.tris && s2.hash === s.hash,
};
console.log(JSON.stringify(report, null, 2));
if (fails.length) { console.log('FAIL\n - ' + fails.join('\n - ')); process.exit(1); }
console.log('PASS  plaza: ' + s.tris + ' tris (+' + (s.tris - BASELINE_PLAZA) + '), one continuous balustrade at R=44 with 6 real street gates, ' +
  elements.length + ' mirror-symmetric elements, paving floor y>=' + ps.bbox.min[1] + ', city +' + (cs.tris - BASELINE_CITY) + ' tris, rng burn 40, deterministic');
