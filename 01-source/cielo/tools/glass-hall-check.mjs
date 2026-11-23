// Geometry-only checks for the glass palace round-5 interior (no GL / no browser).
//   node tools/glass-hall-check.mjs
// Checks the hall module on its own (tri budget, bbox, determinism, lights) and together
// with the landmark shell (doorway clearance, fly-through, skylight sightline, hollow
// podium, unchanged exterior silhouette).
import { mulberry32 } from '../src/math.js';
import { B } from '../src/geo.js';
import { buildLandmarks } from '../src/landmark.js';
import { buildGlassHall } from '../src/glass-hall.js';
import { L } from '../src/layout.js';

const SEED = 20261122;
const A = L.glassPalace;
const ca = Math.cos(A.rot), sa = Math.sin(A.rot);
// glass palace local frame (matches lib3d inFrame: local X -> (cos,0,sin), local Z -> (-sin,0,cos))
const toW = (lx, ly, lz) => [A.x + ca * lx - sa * lz, ly, A.z + sa * lx + ca * lz];
const toL = (wx, wy, wz) => [ca * (wx - A.x) + sa * (wz - A.z), wy, -sa * (wx - A.x) + ca * (wz - A.z)];

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

// triangle soup ray query (Moller-Trumbore, AABB prefilter)
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

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

// ---------------------------------------------------------------- the hall alone
const ch = { points: [], lanterns: [] };
const hb = new B();
buildGlassHall(hb, ch, mulberry32(SEED));
const hs = stats(hb);

ok(hs.tris >= 80000, 'hall under the 80k triangle budget: ' + hs.tris);
ok(hs.tris <= 260000, 'hall over the 260k triangle budget: ' + hs.tris);
ok(hs.stack === 1, 'hall leaks the matrix stack: ' + hs.stack);
ok(hs.nan === 0, 'hall non-finite vertices: ' + hs.nan);
ok(hs.far === 0, 'hall far vertices: ' + hs.far);
ok(hs.bad === 0, 'hall NaN verts: ' + hs.bad);
ok(hs.badColor === 0, 'hall bad colours: ' + hs.badColor);
ok(hs.badMat === 0, 'hall bad material arrays: ' + hs.badMat);

// hall bbox in palace-local coordinates
let lmn = [1e9, 1e9, 1e9], lmx = [-1e9, -1e9, -1e9];
for (let i = 0; i < hb.v.length; i += 11) {
  const p = toL(hb.v[i], hb.v[i + 1], hb.v[i + 2]);
  for (let k = 0; k < 3; k++) { lmn[k] = Math.min(lmn[k], p[k]); lmx[k] = Math.max(lmx[k], p[k]); }
}
const lbb = { min: lmn.map((x) => +x.toFixed(2)), max: lmx.map((x) => +x.toFixed(2)) };
ok(lbb.min[0] >= -35.9 && lbb.max[0] <= 35.9, 'hall x out of the +-35 cavity: ' + JSON.stringify(lbb));
ok(lbb.min[1] >= 1.6 && lbb.max[1] <= 18.6, 'hall y out of 1.6..18.6: ' + JSON.stringify(lbb));
ok(lbb.min[2] >= -48.6 && lbb.max[2] <= -1.0, 'hall z out of -48.6..-1.0: ' + JSON.stringify(lbb));

// determinism (the seed argument must be ignored: the module owns a local rng)
const hb2 = new B();
buildGlassHall(hb2, { points: [], lanterns: [] }, mulberry32(7));
const hs2 = stats(hb2);
ok(hs2.tris === hs.tris, 'hall triangle count is not deterministic: ' + hs.tris + ' vs ' + hs2.tris);
ok(hs2.hash === hs.hash, 'hall vertex hash is not deterministic');
ok(JSON.stringify(hs2.bbox) === JSON.stringify(hs.bbox), 'hall bbox is not deterministic');

// lights: <= 10, all finite, inside the hall
ok(ch.points.length <= 10, 'hall pushes ' + ch.points.length + ' point lights (max 10)');
ok(ch.points.every((p) => p.p.every(Number.isFinite) && p.col.every(Number.isFinite) && p.range > 0 && p.int > 0 && p.int <= 1), 'bad point light');
ok(ch.points.every((p) => { const l = toL(p.p[0], p.p[1], p.p[2]); return Math.abs(l[0]) < 36 && l[1] > 2.5 && l[1] < 18 && l[2] > -49 && l[2] < -1; }), 'point light outside the hall');
ok(ch.lanterns.length >= 40 && ch.lanterns.length <= 400, 'lantern count ' + ch.lanterns.length + ' (expected 40..400)');

// ---------------------------------------------------------------- the shell
const lc = { points: [], lanterns: [] };
const lb = new B();
buildLandmarks(lb, lc, mulberry32(SEED));

// podium exterior silhouette: filter palace-local vertices and check the envelope
let pmn = [1e9, 1e9, 1e9], pmx = [-1e9, -1e9, -1e9];
let cav = 0, door = 0;
for (let i = 0; i < lb.v.length; i += 11) {
  const p = toL(lb.v[i], lb.v[i + 1], lb.v[i + 2]);
  if (Math.abs(p[0]) < 70 && p[2] > -56 && p[2] < 6 && p[1] < 130) {
    for (let k = 0; k < 3; k++) { pmn[k] = Math.min(pmn[k], p[k]); pmx[k] = Math.max(pmx[k], p[k]); }
  }
  // hollow podium: nothing inside the cavity volume
  const swing = Math.abs(p[0]) > 3.9 && p[2] > -7.5;   // the open door leaves swing inside
  if (!swing && Math.abs(p[0]) < 34.5 && p[1] > 2.8 && p[1] < 18.2 && p[2] > -47.5 && p[2] < -2.5) cav++;
  // doorway clearance volume
  if (Math.abs(p[0]) < 4.25 && p[1] > 2.8 && p[1] < 8.4 && p[2] > -2.7 && p[2] < 0.5) door++;
}
const pbb = { min: pmn.map((x) => +x.toFixed(2)), max: pmx.map((x) => +x.toFixed(2)) };
ok(pbb.min[0] <= -60.5 && pbb.max[0] >= 60.5, 'glass palace lost its side wings: ' + JSON.stringify(pbb));
ok(pbb.min[2] <= -51.0 && pbb.max[2] >= 1.0, 'glass palace depth changed: ' + JSON.stringify(pbb));
ok(pbb.max[1] > 124 && pbb.max[1] < 129, 'dome/finial height changed: ' + JSON.stringify(pbb));
ok(cav === 0, 'podium is still solid: ' + cav + ' vertices inside the hall cavity');
ok(door === 0, 'doorway blocked: ' + door + ' vertices in the door clearance box');

// ---------------------------------------------------------------- fly-through
const all = new B();
buildLandmarks(all, { points: [], lanterns: [] }, mulberry32(SEED));
buildGlassHall(all, { points: [], lanterns: [] }, mulberry32(SEED));
const W = (l) => toW(l[0], l[1], l[2]);
const flyA = segHits(all, W([0, 3, 6]), W([0, 4, -10]));
const flyB = segHits(all, W([0, 4, -10]), W([0, 5, -30]));
const skylight = segHits(all, W([0, 6, -26]), W([0, 20, -26]));
const lookBack = segHits(all, W([0, 4, -30]), W([0, 6, -46]));
ok(flyA === 0, 'flying in (0,3,6)->(0,4,-10) hits ' + flyA + ' faces');
ok(flyB === 0, 'flying down the nave (0,4,-10)->(0,5,-30) hits ' + flyB + ' faces');
ok(skylight === 0, 'looking up at the skylight (0,6,-26)->(0,20,-26) hits ' + skylight + ' faces');
ok(lookBack === 0, 'sight line to the garden arch hits ' + lookBack + ' faces');

const report = {
  hall: { tris: hs.tris, verts: hs.verts, bbox_world: hs.bbox, bbox_local: lbb, lanterns: ch.lanterns.length, lights: ch.points.length },
  shell: { tris_landmarks: lb.i.length / 3, palace_local_bbox: pbb, cavity_verts: cav, door_box_verts: door, lights: lc.points.length },
  combined_tris: all.i.length / 3,
  fly_in_hits: flyA, nave_hits: flyB, skylight_hits: skylight, garden_arch_hits: lookBack,
  deterministic: hs2.tris === hs.tris && hs2.hash === hs.hash,
};
console.log(JSON.stringify(report, null, 2));
if (fails.length) { console.log('FAIL\n - ' + fails.join('\n - ')); process.exit(1); }
console.log('PASS  glass hall: ' + hs.tris + ' tris, local bbox ' + JSON.stringify(lbb) + ', enterable, skylight open, deterministic');
