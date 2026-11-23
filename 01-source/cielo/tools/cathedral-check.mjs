// Geometry-only checks for the round-7 cathedral (no GL / no browser).
//   node tools/cathedral-check.mjs
// The cathedral module is built in world coordinates (anchor rot = 0), so every
// assertion below is in world space: world = A + local, A = (-96, -24).
import { mulberry32 } from '../src/math.js';
import { B } from '../src/geo.js';
import { buildCathedral } from '../src/cathedral.js';
import { L } from '../src/layout.js';

const SEED = 20261122;
const A = L.cathedral;
const W = (lx, ly, lz) => [A.x + lx, ly, A.z + lz];   // local -> world

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

// triangle soup segment query (Moller-Trumbore, AABB prefilter)
function segHits(b, p0, p1) {
  const lo = [Math.min(p0[0], p1[0]), Math.min(p0[1], p1[1]), Math.min(p0[2], p1[2])];
  const hi = [Math.max(p0[0], p1[0]), Math.max(p0[1], p1[1]), Math.max(p0[2], p1[2])];
  const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  let hits = 0;
  const P = (i) => [b.v[i], b.v[i + 1], b.v[i + 2]];
  for (let t = 0; t < b.i.length; t += 3) {
    const A2 = P(b.i[t] * 11), Bv = P(b.i[t + 1] * 11), C2 = P(b.i[t + 2] * 11);
    if (Math.max(A2[0], Bv[0], C2[0]) < lo[0] || Math.min(A2[0], Bv[0], C2[0]) > hi[0]) continue;
    if (Math.max(A2[1], Bv[1], C2[1]) < lo[1] || Math.min(A2[1], Bv[1], C2[1]) > hi[1]) continue;
    if (Math.max(A2[2], Bv[2], C2[2]) < lo[2] || Math.min(A2[2], Bv[2], C2[2]) > hi[2]) continue;
    const e1 = [Bv[0] - A2[0], Bv[1] - A2[1], Bv[2] - A2[2]];
    const e2 = [C2[0] - A2[0], C2[1] - A2[1], C2[2] - A2[2]];
    const pv = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
    const det = e1[0] * pv[0] + e1[1] * pv[1] + e1[2] * pv[2];
    if (Math.abs(det) < 1e-9) continue;
    const inv = 1 / det;
    const tv = [p0[0] - A2[0], p0[1] - A2[1], p0[2] - A2[2]];
    const u = (tv[0] * pv[0] + tv[1] * pv[1] + tv[2] * pv[2]) * inv;
    if (u < -1e-6 || u > 1 + 1e-6) continue;
    const qv = [tv[1] * e1[2] - tv[2] * e1[1], tv[2] * e1[0] - tv[0] * e1[2], tv[0] * e1[1] - tv[1] * e1[0]];
    const vv = (d[0] * qv[0] + d[1] * qv[1] + d[2] * qv[2]) * inv;
    if (vv < -1e-6 || u + vv > 1 + 1e-6) continue;
    const tt = (e2[0] * qv[0] + e2[1] * qv[1] + e2[2] * qv[2]) * inv;
    if (tt > 1e-5 && tt < 1 - 1e-5) hits++;
  }
  return hits;
}
// count vertices inside an axis-aligned world box
function vertsInBox(b, lo, hi) {
  let n = 0;
  for (let i = 0; i < b.v.length; i += 11) {
    if (b.v[i] > lo[0] && b.v[i] < hi[0] && b.v[i + 1] > lo[1] && b.v[i + 1] < hi[1] && b.v[i + 2] > lo[2] && b.v[i + 2] < hi[2]) n++;
  }
  return n;
}

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

// ---------------------------------------------------------------- the module alone
const c = { points: [], lanterns: [] };
const b = new B();
buildCathedral(b, c, mulberry32(SEED));
const s = stats(b);

ok(s.tris >= 120000, 'under the 120k triangle floor: ' + s.tris);
ok(s.tris <= 220000, 'over the 220k triangle ceiling: ' + s.tris);
ok(s.stack === 1, 'matrix stack leaks: ' + s.stack);
ok(s.nan === 0, 'non-finite vertices: ' + s.nan);
ok(s.far === 0, 'far vertices: ' + s.far);
ok(s.bad === 0, 'NaN verts: ' + s.bad);
ok(s.badColor === 0, 'bad colours: ' + s.badColor);
ok(s.badNormal === 0, 'degenerate normals: ' + s.badNormal);
ok(s.badMat === 0, 'bad material arrays: ' + s.badMat);
ok(s.verts < 400000, 'vertex count too high: ' + s.verts);

// world footprint + silhouette height
const bb = s.bbox;
ok(bb.min[0] >= -125.01 && bb.max[0] <= -66.99, 'footprint x out of [-125,-67]: ' + JSON.stringify(bb));
ok(bb.min[2] >= -112.01 && bb.max[2] <= -10.99, 'footprint z out of [-112,-11]: ' + JSON.stringify(bb));
ok(bb.min[1] >= -0.01, 'sinks below the ground: ' + bb.min[1]);
ok(bb.max[1] > 118 && bb.max[1] < 126, 'spire / finial height changed: ' + bb.max[1]);

// determinism: the rng argument must be ignored (module owns a local mulberry32)
const b2 = new B();
buildCathedral(b2, { points: [], lanterns: [] }, mulberry32(7));
const s2 = stats(b2);
ok(s2.tris === s.tris, 'triangle count not deterministic: ' + s.tris + ' vs ' + s2.tris);
ok(s2.hash === s.hash, 'vertex hash not deterministic');
ok(JSON.stringify(s2.bbox) === JSON.stringify(bb), 'bbox not deterministic');

// lights
ok(c.points.length <= 8, 'pushes ' + c.points.length + ' point lights (max 8)');
ok(c.points.every((p) => p.p.every(Number.isFinite) && p.col.every(Number.isFinite) && p.range >= 18 && p.range <= 46 && p.int >= 0.3 && p.int <= 1.0), 'bad point light (range 18..46, int 0.3..1)');
ok(c.points.every((p) => {
  const lx = p.p[0] - A.x, lz = p.p[2] - A.z;
  return lx > -25 && lx < 25 && p.p[1] > 1 && p.p[1] < 48 && lz > -86 && lz < 2;
}), 'point light outside the cathedral');
ok(c.lanterns.length >= 60 && c.lanterns.length <= 300, 'lantern count ' + c.lanterns.length + ' (expected 60..300)');
ok(c.lanterns.every((l) => l.p.every(Number.isFinite) && l.size >= 0.5 && l.size <= 12 && l.alpha > 0 && l.alpha <= 0.8), 'bad lantern');

// ---------------------------------------------------------------- doors: fly in from +Z
// west portal: 9.4 x 11.2 clear at local z 0 (world z -24)
const doorRays = [];
for (const lx of [-3.6, 0, 3.6]) for (const ly of [3, 4.5, 6, 7.5, 9]) {
  doorRays.push([W(lx, ly, 18), W(lx, ly, -20)]);
}
// side portals: 5.6 x 11.2 at local x +-14.3
for (const sx of [-1, 1]) for (const lx2 of [-2.0, 0, 2.0]) for (const ly of [3, 6]) {
  doorRays.push([W(sx * 14.3 + lx2, ly, 18), W(sx * 14.3 + lx2, ly, -20)]);
}
for (const sx of [-1, 1]) doorRays.push([W(sx * 14.3, 9, 18), W(sx * 14.3, 9, -20)]);
let doorHits = 0;
for (const [p0, p1] of doorRays) doorHits += segHits(b, p0, p1);
ok(doorHits === 0, 'flying in through a door hits ' + doorHits + ' faces');

// doorway clearance volumes must be empty (door leaves are flat on the tunnel walls)
const mainDoorBox = vertsInBox(b, W(-4.0, 1.0, -8.6), W(4.0, 9.4, -0.4));
ok(mainDoorBox === 0, 'west portal clearance volume is blocked: ' + mainDoorBox + ' verts');
for (const sx of [-1, 1]) {
  const sideBox = vertsInBox(b, W(sx * 14.3 - 2.2, 1.0, -1.55), W(sx * 14.3 + 2.2, 8.8, 0.3));
  ok(sideBox === 0, 'side portal clearance volume is blocked (x ' + (sx * 14.3) + '): ' + sideBox + ' verts');
}

// ---------------------------------------------------------------- interior clearance
const naveRays = [
  [W(0, 4, -11), W(0, 4, -71)],
  [W(0, 12, -11), W(0, 12, -71)],
  [W(0, 20, -14), W(0, 20, -71)],
  [W(0, 40, -14), W(0, 40, -71)],
  [W(0, 2, -30), W(0, 44, -30)],
  [W(0, 2, -14), W(0, 44, -14)],
];
let naveHits = 0;
for (const [p0, p1] of naveRays) naveHits += segHits(b, p0, p1);
ok(naveHits === 0, 'nave centre line hits ' + naveHits + ' faces');

const aisleRays = [];
for (const sx of [-1, 1]) for (const ly of [4, 12, 21]) {
  aisleRays.push([W(sx * 16, ly, -11), W(sx * 16, ly, -71)]);
}
let aisleHits = 0;
for (const [p0, p1] of aisleRays) aisleHits += segHits(b, p0, p1);
ok(aisleHits === 0, 'aisle centre line hits ' + aisleHits + ' faces');

// hollow nave (above the arcade, below the vault, on the axis) and hollow aisle
const naveCav = vertsInBox(b, W(-1.8, 26, -68), W(1.8, 31, -14));
ok(naveCav === 0, 'nave is not hollow: ' + naveCav + ' verts in the upper nave box');
for (const sx of [-1, 1]) {
  const cav = vertsInBox(b, W(sx > 0 ? 13.6 : -18.4, 3, -68), W(sx > 0 ? 18.4 : -13.6, 18, -14));
  ok(cav === 0, 'aisle is not hollow (x ' + (sx * 16) + '): ' + cav + ' verts');
}

// ---------------------------------------------------------------- apse + rose window sight lines
const apseA = segHits(b, W(0, 4, -55), W(0, 6, -83.4));
ok(apseA === 0, 'sight line down the nave into the apse hits ' + apseA + ' faces');
const apseB = segHits(b, W(0, 5, -58), W(-9.8, 10, -77.0));
ok(apseB === 0, 'sight line to the apse side windows hits ' + apseB + ' faces');
const apseC = segHits(b, W(0, 20, -60), W(0, 40, -81));
ok(apseC === 0, 'sight line up into the apse semi-dome hits ' + apseC + ' faces');
const roseA = segHits(b, W(0, 4, -50), W(0, 30.4, -11.0));
ok(roseA === 0, 'rose window sight line hits ' + roseA + ' faces');
const roseB = segHits(b, W(-6, 5, -44), W(-6, 28.6, -11.0));
ok(roseB === 0, 'off-axis rose window sight line hits ' + roseB + ' faces');
// the west portal axis from deep inside the nave back out through the door
const outRay = segHits(b, W(0, 5, -40), W(0, 5, 14));
ok(outRay === 0, 'looking back out of the west door hits ' + outRay + ' faces');
// nave vault overhead is closed (a ray up the axis hits it, i.e. the sky is not visible)
const upRay = segHits(b, W(0, 44.5, -30), W(0, 60, -30));
ok(upRay > 0, 'the nave vault/roof is open overhead');

// ---------------------------------------------------------------- report
const report = {
  tris: s.tris, verts: s.verts, bbox_world: bb,
  bbox_local: { min: [bb.min[0] - A.x, bb.min[1], bb.min[2] - A.z], max: [bb.max[0] - A.x, bb.max[1], bb.max[2] - A.z] },
  lights: c.points.length, lanterns: c.lanterns.length,
  door_rays: doorRays.length, door_hits: doorHits, nave_hits: naveHits, aisle_hits: aisleHits,
  nave_cavity_verts: naveCav, main_door_box: mainDoorBox,
  apse_hits: apseA + apseB, rose_hits: roseA + roseB, look_back_hits: outRay,
  deterministic: s2.tris === s.tris && s2.hash === s.hash,
};
console.log(JSON.stringify(report, null, 2));
if (fails.length) { console.log('FAIL\n - ' + fails.join('\n - ')); process.exit(1); }
console.log('PASS  cathedral: ' + s.tris + ' tris, bbox ' + JSON.stringify(bb) + ', doors open, nave/aisles/apse hollow, deterministic');
