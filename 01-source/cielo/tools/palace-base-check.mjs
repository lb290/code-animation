// Geometry-only checks for the palace's ground floor (no GL / no browser).
//   node tools/palace-base-check.mjs
// Asserts: triangle budget, bbox, matrix stack, no NaN / bad colour / bad material,
// the city-side facade stays in front of the old wall, the entrance is flyable,
// the hall cavity is hollow, lighting budget, determinism.
import { mulberry32 } from '../src/math.js';
import { B } from '../src/geo.js';
import { buildPalaceBase, BASE_METRICS as MB } from '../src/palace-base.js';

const SEED = 20261122;

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
// does the segment p0->p1 hit any triangle? (Moller-Trumbore + AABB prefilter)
function segHits(b, p0, p1) {
  const lo = [Math.min(p0[0], p1[0]), Math.min(p0[1], p1[1]), Math.min(p0[2], p1[2])];
  const hi = [Math.max(p0[0], p1[0]), Math.max(p0[1], p1[1]), Math.max(p0[2], p1[2])];
  const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  let hits = 0;
  const P = (i) => [b.v[i], b.v[i + 1], b.v[i + 2]];
  for (let t = 0; t < b.i.length; t += 3) {
    const A = P(b.i[t] * 11), Bv = P(b.i[t + 1] * 11), C = P(b.i[t + 2] * 11);
    if (Math.max(A[0], Bv[0], C[0]) < lo[0] || Math.min(A[0], Bv[0], C[0]) > hi[0]) continue;
    if (Math.max(A[1], Bv[1], C[1]) < lo[1] || Math.min(A[1], Bv[1], C[1]) > hi[1]) continue;
    if (Math.max(A[2], Bv[2], C[2]) < lo[2] || Math.min(A[2], Bv[2], C[2]) > hi[2]) continue;
    const e1 = [Bv[0] - A[0], Bv[1] - A[1], Bv[2] - A[2]];
    const e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const pv = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
    const det = e1[0] * pv[0] + e1[1] * pv[1] + e1[2] * pv[2];
    if (Math.abs(det) < 1e-9) continue;
    const inv = 1 / det;
    const tv = [p0[0] - A[0], p0[1] - A[1], p0[2] - A[2]];
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
function vertsIn(b, x0, x1, y0, y1, z0, z1) {
  let n = 0;
  for (let i = 0; i < b.v.length; i += 11) {
    const x = b.v[i], y = b.v[i + 1], z = b.v[i + 2];
    if (x > x0 && x < x1 && y > y0 && y < y1 && z > z0 && z < z1) n++;
  }
  return n;
}

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

const ctx = { points: [], lanterns: [] };
const b = new B();
buildPalaceBase(b, ctx, mulberry32(SEED));
const s = stats(b);
const M = MB;

// 1. budget + stack
ok(s.tris >= 40000, 'under the 40k triangle budget: ' + s.tris);
ok(s.tris <= 160000, 'over the 160k triangle budget: ' + s.tris);
ok(s.stack === 1, 'matrix stack depth ' + s.stack + ' (expected 1)');
// 2. clean geometry
ok(s.nan === 0, 'non-finite vertices: ' + s.nan);
ok(s.far === 0, 'far vertices: ' + s.far);
ok(s.bad === 0, 'bad (NaN) verts: ' + s.bad);
ok(s.badColor === 0, 'bad colours: ' + s.badColor);
ok(s.badMat === 0, 'bad material arrays: ' + s.badMat);
ok(s.badNormal === 0, 'degenerate (zero-area) normals: ' + s.badNormal);
// 3. bounding box: the module owns y 0..26.5 at the front and the hall interior
ok(s.bbox.min[0] >= -57 && s.bbox.max[0] <= 57, 'x out of [-57,57]: ' + JSON.stringify(s.bbox));
ok(s.bbox.min[1] >= -1.0 && s.bbox.max[1] <= 27.0, 'y out of [-1,27]: ' + JSON.stringify(s.bbox));
ok(s.bbox.min[2] >= 86.0 && s.bbox.max[2] <= 124.0, 'z out of [86,124]: ' + JSON.stringify(s.bbox));
// 4. nothing of the city-side work sits at or behind the old wall plane; the only
// geometry allowed past z=92.3 is inside the arch opening (tunnel lining, y<17.2, |x|<12.6)
{
  let behind = 0;
  for (let i = 0; i < b.v.length; i += 11) {
    const x = b.v[i], y = b.v[i + 1], z = b.v[i + 2];
    if (z >= 92.30 && z < 96.30 && Math.abs(x) >= 12.60) behind++;
  }
  ok(behind === 0, behind + ' vertices of the city-side work sit at/behind the old wall plane (z>=92.30)');
  let inSoffit = 0;
  for (let i = 0; i < b.v.length; i += 11) {
    const x = b.v[i], y = b.v[i + 1], z = b.v[i + 2];
    if (z > 92.62 && z < 95.6 && Math.abs(x) < 12.4 && y > 5.0 && y < 16.0) {
      const r = Math.hypot(x, y - 4.6);
      if (r > 12.15) inSoffit++;
    }
  }
  ok(inSoffit === 0, inSoffit + ' tunnel vertices poke through the existing vault soffit');
}
// 5. entrance clearance: nothing blocks the centre of the portal below the vault
ok(vertsIn(b, -9.0, 9.0, 1.2, 8.2, 87.5, 96.2) === 0,
  'entrance clearance box x+-9 / y 1.2..8.2 / z 87.5..96.2 is not empty: ' + vertsIn(b, -9.0, 9.0, 1.2, 8.2, 87.5, 96.2));
// 6. you can fly in from the boulevard, through the arch, into the hall
for (const [a, c, label] of [
  [[0, 2, 60], [0, 3, 96], 'approach (0,2,60)->(0,3,96)'],
  [[0, 2, 90], [0, 4, 101], 'through the arch (0,2,90)->(0,4,101)'],
  [[0, 3, 96], [0, 4, 104], 'into the hall (0,3,96)->(0,4,104)'],
  [[0, 5, 105], [0, 8, 118], 'to the fountain back (0,5,105)->(0,8,118)'],
]) {
  const hits = segHits(b, a, c);
  ok(hits === 0, label + ' hits ' + hits + ' faces');
}
// 7. the hall cavity is hollow: the central flight corridor is completely clear
ok(vertsIn(b, -8.0, 8.0, 4.0, 10.5, 97.0, 116.5) === 0,
  'hall flight corridor invaded: ' + vertsIn(b, -8.0, 8.0, 4.0, 10.5, 97.0, 116.5) + ' vertices');
// 7b. between the two arcade lines the room is open above the furniture
ok(vertsIn(b, -17.0, 17.0, 11.5, 15.5, 99.0, 116.0) === 0,
  'nave airspace invaded above the furniture: ' + vertsIn(b, -17.0, 17.0, 11.5, 15.5, 99.0, 116.0));
// 8. looking up from the axis you see the skylight (an empty shaft above the nave)
ok(segHits(b, [0, 3, 109.4], [0, 23.4, 109.4]) === 0, 'skylight shaft blocked from the axis');
ok(segHits(b, [0, 3, 109.4], [0, 24.5, 109.4]) >= 1, 'no glowing skylight panel above the axis');
// 9. looking back from the hall you see the entrance opening (not a wall)
ok(segHits(b, [0, 6, 116], [0, 7, 90]) === 0, 'the entrance opening is walled off from inside');
// 10. lighting budget (the renderer keeps the 8 nearest; each room must stay <= 10)
const hallPts = ctx.points.filter((p) => p.p[2] > 96.4).length;
const cityPts = ctx.points.length - hallPts;
ok(hallPts >= 5 && hallPts <= 10, 'hall point lights out of 5..10: ' + hallPts);
ok(cityPts >= 2 && cityPts <= 8, 'city-side point lights out of 2..8: ' + cityPts);
ok(ctx.points.length >= 6 && ctx.points.length <= 18, 'expected 6-18 point lights, got ' + ctx.points.length);
ok(ctx.points.every((p) => p.p.every(Number.isFinite) && p.col.every(Number.isFinite) && p.range > 0 && p.int > 0 && p.int <= 1),
  'bad point light');
ok(ctx.lanterns.length >= 12, 'expected some candle billboards, got ' + ctx.lanterns.length);
ok(ctx.lanterns.every((l) => l.p.every(Number.isFinite) && l.size > 0 && l.alpha > 0 && l.col.every(Number.isFinite)), 'bad lantern');
// 11. determinism (same seed twice; a different seed must not change the result either,
//     because the module owns its own local RNG)
const b2 = new B();
buildPalaceBase(b2, { points: [], lanterns: [] }, mulberry32(SEED));
const s2 = stats(b2);
ok(s2.tris === s.tris, 'non-deterministic triangle count: ' + s.tris + ' vs ' + s2.tris);
ok(s2.hash === s.hash, 'non-deterministic vertex hash');
ok(JSON.stringify(s2.bbox) === JSON.stringify(s.bbox), 'non-deterministic bbox');
const b3 = new B();
buildPalaceBase(b3, { points: [], lanterns: [] }, mulberry32(7));
const s3 = stats(b3);
ok(s3.hash === s.hash, 'the module draws from the shared rng (hash changed with a different seed)');

// ---- zone triangle report
const zones = {
  facade: [0, 27, 86, 92.5],
  tunnel: [0, 27, 92.5, 96.5],
  hall: [0, 27, 96.5, 124],
};
const zoneTris = {};
for (const [name, [y0, y1, z0, z1]] of Object.entries(zones)) {
  let n = 0;
  for (let t = 0; t < b.i.length; t += 3) {
    let inz = 0;
    for (const k of [t, t + 1, t + 2]) {
      const y = b.v[b.i[k] * 11 + 1], z = b.v[b.i[k] * 11 + 2];
      if (y >= y0 && y <= y1 && z >= z0 && z <= z1) inz++;
    }
    if (inz >= 2) n++;
  }
  zoneTris[name] = n;
}

const report = {
  tris_total: s.tris, verts: s.verts, zones: zoneTris,
  bbox: s.bbox, stack: s.stack, nan: s.nan, far: s.far, bad: s.bad,
  badColor: s.badColor, badNormal: s.badNormal, badMat: s.badMat,
  facadeBehindWall: 0,
  entranceClearBox: 0,
  hallCavityHits: 0,
  lights: ctx.points.length, lanterns: ctx.lanterns.length,
  deterministic: s2.hash === s.hash && s3.hash === s.hash,
};
console.log(JSON.stringify(report, null, 2));
if (fails.length) { console.log('FAIL\n - ' + fails.join('\n - ')); process.exit(1); }
console.log('PASS  palace-base: ' + s.tris + ' tris, bbox ' + JSON.stringify(s.bbox) + ', portal flyable, hall hollow, stack 1, deterministic');
