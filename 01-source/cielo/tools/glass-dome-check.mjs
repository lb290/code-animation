// Geometry-only checks for the round-6 glass palace (drum re-centred + palm house).
//   node tools/glass-dome-check.mjs
// Asserts: drum/dome centred on the podium, no overhang beyond a 2.5 m eave, the
// palm-house interior volume free of shell geometry, entrance / axis / well sight
// lines clear, tri budgets, determinism, no NaN.  No GL, no browser.
import { mulberry32 } from '../src/math.js';
import { B } from '../src/geo.js';
import { buildLandmarks } from '../src/landmark.js';
import { buildGlassGreenhouse, GH } from '../src/glass-greenhouse.js';
// round 9: the sky-observatory installation owns a few extra point lights
import { ORB_POINTS } from '../src/glass-orbital.js';
import { buildGlassHall } from '../src/glass-hall.js';
import { L } from '../src/layout.js';

const SEED = 20261122;
const A = L.glassPalace;
const ca = Math.cos(A.rot), sa = Math.sin(A.rot);
// lib3d inFrame convention: local +X -> (cos,0,sin), local +Z -> (-sin,0,cos)
const toW = (lx, ly, lz) => [A.x + ca * lx - sa * lz, ly, A.z + sa * lx + ca * lz];
const toL = (wx, wy, wz) => [ca * (wx - A.x) + sa * (wz - A.z), wy, -sa * (wx - A.x) + ca * (wz - A.z)];
const CZ = -25;                       // drum / dome centre (palace-local z)

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

// ---------------------------------------------------------------- palm house alone
const gc = { points: [], lanterns: [] };
const gb = new B();
buildGlassGreenhouse(gb, gc);
const gs = stats(gb);
ok(gs.tris >= 40000, 'palm house undersized: ' + gs.tris + ' tris');
ok(gs.tris <= 220000, 'palm house over budget: ' + gs.tris + ' tris');
ok(gs.stack === 1, 'palm house leaks the matrix stack: ' + gs.stack);
ok(gs.nan === 0, 'palm house non-finite vertices: ' + gs.nan);
ok(gs.far === 0, 'palm house far vertices: ' + gs.far);
ok(gs.bad === 0, 'palm house NaN verts: ' + gs.bad);
ok(gs.badColor === 0, 'palm house bad colours: ' + gs.badColor);
ok(gs.badMat === 0, 'palm house bad material arrays: ' + gs.badMat);

let lmn = [1e9, 1e9, 1e9], lmx = [-1e9, -1e9, -1e9];
for (let i = 0; i < gb.v.length; i += 11) {
  const p = [gb.v[i], gb.v[i + 1], gb.v[i + 2]];   // standalone build is already local
  for (let k = 0; k < 3; k++) { lmn[k] = Math.min(lmn[k], p[k]); lmx[k] = Math.max(lmx[k], p[k]); }
}
const gbb = { min: lmn.map((x) => +x.toFixed(2)), max: lmx.map((x) => +x.toFixed(2)) };
ok(gbb.min[0] >= -26.6 && gbb.max[0] <= 26.6, 'palm house x outside the drum: ' + JSON.stringify(gbb));
ok(gbb.min[1] >= GH.Y - 0.5 && gbb.max[1] <= 57.6, 'palm house y outside the drum: ' + JSON.stringify(gbb));
ok(gbb.min[2] >= CZ - 26.6 && gbb.max[2] <= CZ + 27.4, 'palm house z outside the drum: ' + JSON.stringify(gbb));

const gb2 = new B();
buildGlassGreenhouse(gb2, { points: [], lanterns: [] });
const gs2 = stats(gb2);
ok(gs2.tris === gs.tris && gs2.hash === gs.hash, 'palm house is not deterministic');

// lights: the palm house owns 5 soft points, all inside the drum above the floor
ok(gc.points.length === 5, 'palm house pushes ' + gc.points.length + ' point lights (expect 5)');
ok(gc.points.every((p) => p.p.every(Number.isFinite) && p.col.every(Number.isFinite) && p.range > 0 && p.int > 0 && p.int <= 1), 'bad palm-house point light');
ok(gc.points.every((p) => { const l = toL(p.p[0], p.p[1], p.p[2]); return Math.hypot(l[0], l[2] - CZ) < 25 && l[1] > 22 && l[1] < 30; }), 'palm-house light outside the drum');
ok(gc.lanterns.length >= 25 && gc.lanterns.length <= 220, 'palm-house lantern count ' + gc.lanterns.length);

// no floor ring covering the hall's skylight well
let overWell = 0;
for (let i = 0; i < gb.v.length; i += 11) {
  const p = toL(gb.v[i], gb.v[i + 1], gb.v[i + 2]);
  if (Math.abs(p[0]) < 8.8 && p[2] > -43.4 && p[2] < -12.6 && p[1] > GH.Y - 0.2 && p[1] < GH.Y + 1.9) overWell++;
}
ok(overWell === 0, 'palm house closes the skylight well: ' + overWell + ' vertices');

// ---------------------------------------------------------------- landmark shell
const lc = { points: [], lanterns: [] };
const lb = new B();
buildLandmarks(lb, lc, mulberry32(SEED));
const ls = stats(lb);
ok(ls.stack === 1, 'landmark leaks the matrix stack: ' + ls.stack);
ok(ls.nan === 0, 'landmark non-finite vertices: ' + ls.nan);
ok(ls.bad === 0 && ls.badColor === 0 && ls.badMat === 0, 'landmark bad vertices/colours/materials: ' + JSON.stringify([ls.bad, ls.badColor, ls.badMat]));

const lb2 = new B();
buildLandmarks(lb2, { points: [], lanterns: [] }, mulberry32(7));
const ls2 = stats(lb2);
ok(ls2.hash === ls.hash, 'landmark is not deterministic');
ok(ls2.tris === ls.tris, 'landmark tri count is not deterministic');

// landmark must not intrude into the palm-house interior volume
let intrude = 0;
const gh0 = (lc.ghV0 || 0) * 11, gh1 = (lc.ghV1 || 0) * 11;
for (let i = 0; i < lb.v.length; i += 11) {
  if (i >= gh0 && i < gh1) continue;                 // the palm house is expected here
  const p = toL(lb.v[i], lb.v[i + 1], lb.v[i + 2]);
  const r = Math.hypot(p[0], p[2] - CZ);
  // round 9: the sky-observatory installation now deliberately furnishes the upper drum
  // (y >= 46.5), so the "keep clear" band is reduced to the inhabited palm-house volume.
  if (r < 25.6 && p[1] > 23.0 && p[1] < 46.0) intrude++;   // the R5 glass ridge apex is expected
}
ok(intrude === 0, 'landmark geometry inside the palm-house interior: ' + intrude + ' vertices');

// drum centre: the glass wall vertices must average onto the podium centre
// (the front entrance bay removes a little wall geometry, so centre the wall by
//  its z extremes rather than by the vertex mean)
let zMinW = 1e9, zMaxW = -1e9, xMinW = 1e9, xMaxW = -1e9, nw = 0;
for (let i = 0; i < lb.v.length; i += 11) {
  const p = toL(lb.v[i], lb.v[i + 1], lb.v[i + 2]);
  const r = Math.hypot(p[0], p[2] - CZ);
  if (p[1] > 26 && p[1] < 56 && r > 26.3 && r < 27.0) {
    nw++; zMinW = Math.min(zMinW, p[2]); zMaxW = Math.max(zMaxW, p[2]);
    xMinW = Math.min(xMinW, p[0]); xMaxW = Math.max(xMaxW, p[0]);
  }
}
const meanZ = (zMinW + zMaxW) / 2;
ok(nw > 500, 'no drum wall vertices found: ' + nw);
ok(Math.abs(meanZ - CZ) < 0.35, 'drum wall is not centred on z=-25: wall z centre ' + meanZ.toFixed(3));
ok(Math.abs((xMinW + xMaxW) / 2) < 0.35, 'drum wall is not centred on x=0: ' + ((xMinW + xMaxW) / 2).toFixed(3));

// centre + overhang: drum shell must sit inside a 2.5 m eave around the podium,
// and the dome rim must stay centred over the podium centre.
let dzMinZ = 1e9, dzMaxZ = -1e9, dzMaxX = 0, topY = 0;
let envMinZ = 1e9, envMaxZ = -1e9, envMinX = 1e9, envMaxX = -1e9;
for (let i = 0; i < lb.v.length; i += 11) {
  const p = toL(lb.v[i], lb.v[i + 1], lb.v[i + 2]);
  const r = Math.hypot(p[0], p[2] - CZ);
  if (r > 26.2 && r < 27.5 && p[1] > 21.2 && p[1] < 30.0) {   // drum wall + structural base eave (urns sit on top)
    dzMinZ = Math.min(dzMinZ, p[2]); dzMaxZ = Math.max(dzMaxZ, p[2]); dzMaxX = Math.max(dzMaxX, Math.abs(p[0]));
  }
  if (r > 26 && r < 31 && p[1] > 23 && p[1] < 111) {
    envMinZ = Math.min(envMinZ, p[2]); envMaxZ = Math.max(envMaxZ, p[2]);
    envMinX = Math.min(envMinX, p[0]); envMaxX = Math.max(envMaxX, p[0]);
  }
  if (Math.abs(p[0]) < 70 && p[2] > -56 && p[2] < 12 && p[1] < 130) topY = Math.max(topY, p[1]);
}
ok(dzMaxZ <= 2.5, 'drum eave overhangs the podium front by ' + (dzMaxZ - 0).toFixed(2) + ' m (max 2.5)');
ok(dzMinZ >= -52.5, 'drum eave overhangs the podium rear by ' + (Math.abs(dzMinZ + 50)).toFixed(2) + ' m (max 2.5)');
ok(dzMaxX <= 39 + 2.5, 'drum overhangs the podium side: ' + dzMaxX.toFixed(2));
ok(dzMaxX > 26.0 && dzMinZ < -40, 'drum shell not found where expected');
ok(topY > 124 && topY < 129, 'finial height changed: ' + topY.toFixed(2));
// the dome rim (30 m radius) is wider than the podium depth; require it to be
// perfectly centred (symmetric front/rear) and to stay inside the entrance porch line
const rimC = (envMaxZ + envMinZ) / 2;
ok(Math.abs(rimC - CZ) < 0.6, 'dome/drum envelope not centred on z=-25: rim centre ' + rimC.toFixed(2));
ok(Math.abs(envMaxX + envMinX) < 1.0, 'dome/drum envelope not symmetric in x: ' + (envMaxX + envMinX).toFixed(2));
ok(envMaxZ <= 7.45, 'dome/drum envelope projects past the entrance porch: ' + envMaxZ.toFixed(2));

// ---------------------------------------------------------------- sight lines
const all = new B();
buildLandmarks(all, { points: [], lanterns: [] }, mulberry32(SEED));
buildGlassHall(all, { points: [], lanterns: [] }, mulberry32(SEED));
const W = (l) => toW(l[0], l[1], l[2]);
const ray = (a, b) => segHits(all, W(a), W(b));
const entryHigh = ray([0, 26.5, 12], [0, 26.5, -1]);
const entryLow = ray([0, 22.0, 12], [0, 22.0, -1]);
const axis = ray([0, 25.2, 1.0], [0, 25.2, -11.0]);
const acrossWell = ray([0, 25.6, -8.5], [0, 25.6, -40.0]);
const upDome = ray([0, 23.0, -24.0], [0, 46.0, -24.0]);   // round 9: only the palm-house shaft, the observatory starts above 46
ok(entryHigh === 0, 'porch -> drum entrance ray hits ' + entryHigh + ' faces');
ok(entryLow === 0, 'floor-level entrance ray hits ' + entryLow + ' faces');
ok(axis === 0, 'palm-house axis ray hits ' + axis + ' faces');
ok(acrossWell === 0, 'sight line across the skylight well hits ' + acrossWell + ' faces');
ok(upDome === 0, 'shaft to the dome interior hits ' + upDome + ' faces');

// point lights owned by the glass palace: 3 podium entrance + 5 palm house
ok(lc.glassPointCount === 8 + ORB_POINTS, 'glass palace pushes ' + lc.glassPointCount + ' point lights (expect 8 + ' + ORB_POINTS + ')');

const rep = {
  palmHouse: { tris: gs.tris, verts: gs.verts, bbox_local: gbb, lights: gc.points.length, lanterns: gc.lanterns.length },
  shell: { tris_landmarks: ls.tris, palace_local_topY: +topY.toFixed(2), drum_mean_z: +meanZ.toFixed(3), wall_samples: nw },
  overhang: { front_m: +(dzMaxZ - 0).toFixed(2), rear_m: +(Math.abs(dzMinZ + 50)).toFixed(2), side_max_x: +dzMaxX.toFixed(2), envelope_front: +envMaxZ.toFixed(2), envelope_rear: +envMinZ.toFixed(2) },
  rays: { entryHigh, entryLow, axis, acrossWell, upDome },
  lights_palace: lc.glassPointCount,
  deterministic: ls2.hash === ls.hash && gs2.hash === gs.hash,
};
console.log(JSON.stringify(rep, null, 2));
if (fails.length) { console.log('FAIL\n - ' + fails.join('\n - ')); process.exit(1); }
console.log('PASS  glass dome: centred on z=-25, overhang ' + rep.overhang.front_m + '/' + rep.overhang.rear_m +
  ' m, palm house ' + gs.tris + ' tris, enterable, deterministic');