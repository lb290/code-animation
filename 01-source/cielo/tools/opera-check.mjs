// Geometry-only checks for the round-8 opera house (no GL / no browser).
//   node tools/opera-check.mjs
// Proves: tri budget, envelope, no NaN / bad colour / bad material / degenerate
// normal, matrix-stack hygiene, determinism, the walk-in fly-through path
// (steps -> doors -> vestibule -> foyer -> auditorium axis), headroom / clear
// width in the public rooms, the tier-box and stage clearances, that the shell
// encloses every visitable room, and the interior albedo/emissive discipline.
import { mulberry32 } from '../src/math.js';
import { B } from '../src/geo.js';
import { buildOpera } from '../src/opera.js';
import { L } from '../src/layout.js';

const SEED = 0x3a71e5d9;
const A = L.opera;
// local (facade frame) -> world
const w = (lx, ly, lz) => [A.x - lz, ly, A.z + lx];
// local constants (mirror of src/opera.js - the contract under test)
const POD = 3.6, RISER = 0.36, PORCH = 32.2, STEP_FRONT = 36.8;
const AXH = 17.0, AZ0 = -13.5, AZ1 = 6.0;
const TIER = [8.6, 12.3, 16.0], BAND_T = 0.55;
const FY = POD;
const ENV = { x0: 67.0, x1: 131.0, z0: -94.0, z1: -22.0, y0: -0.1, y1: 70.0 };
const ROOMS = {
  vestibule: [-13, 13, FY, 14.4, 21.0, 25.2],
  foyer: [-26, 26, FY, 21.4, 6.0, 20.4],
  auditorium: [-17, 17, FY, 26.7, -13.5, 6.0],
  stage: [-14, 14, FY, 26.0, -21.0, -14.5],
  backstage: [-11, 11, FY, 10.0, -24.0, -21.0],
  salonE: [26.7, 32.8, FY, 12.4, 8.0, 20.0],
  salonW: [-32.8, -26.7, FY, 12.4, 8.0, 20.0],
};

function stats(b) {
  const v = b.v;
  let nan = 0, far = 0, badMat = 0, below = 0;
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let i = 0; i < v.length; i += 11) {
    for (let k = 0; k < 3; k++) {
      const x = v[i + k];
      if (!Number.isFinite(x)) nan++;
      mn[k] = Math.min(mn[k], x); mx[k] = Math.max(mx[k], x);
    }
    if (Math.abs(v[i]) > 3000 || Math.abs(v[i + 1]) > 3000 || Math.abs(v[i + 2]) > 3000) far++;
    if (v[i + 1] < -0.1) below++;
    const e = v[i + 9], g = v[i + 10];
    if (!Number.isFinite(e) || !Number.isFinite(g) || e < 0 || e > 1.2 || g < 0 || g > 1) badMat++;
  }
  let h = 2166136261;
  for (let i = 0; i < v.length; i += 7) h = Math.imul(h ^ Math.round(v[i] * 1024), 16777619) >>> 0;
  return {
    tris: b.i.length / 3, verts: v.length / 11, nan, far, badMat, below, hash: h,
    stack: b.stack.length, bad: b.bad || 0, badColor: b.badColor || 0, badNormal: b.badNormal || 0,
    bbox: { min: mn.map((x) => +x.toFixed(3)), max: mx.map((x) => +x.toFixed(3)) },
  };
}

// triangle-soup segment query (Moller-Trumbore with an AABB prefilter)
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
    if (tt > 2e-4 && tt < 1 - 2e-4) hits++;
  }
  return hits;
}
const pathHits = (b, pts) => {
  let n = 0;
  for (let i = 0; i < pts.length - 1; i++) n += segHits(b, pts[i], pts[i + 1]);
  return n;
};

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

// ---------------------------------------------------------------- build once
const ctx = { points: [], lanterns: [] };
const b = new B();
buildOpera(b, ctx, mulberry32(SEED));
const s = stats(b);
const bb = s.bbox;

ok(s.tris >= 40000, 'opera under the 40k triangle floor: ' + s.tris);
ok(s.tris <= 150000, 'opera over the 150k triangle budget: ' + s.tris);
ok(s.stack === 1, 'matrix stack leaked: ' + s.stack);
ok(s.nan === 0, 'non-finite vertices: ' + s.nan);
ok(s.far === 0, 'far vertices: ' + s.far);
ok(s.below === 0, 'vertices below the ground plane: ' + s.below);
ok(s.bad === 0, 'NaN vertices: ' + s.bad);
ok(s.badColor === 0, 'bad colours: ' + s.badColor);
ok(s.badNormal === 0, 'degenerate normals: ' + s.badNormal);
ok(s.badMat === 0, 'bad material arrays: ' + s.badMat);

// ---------------------------------------------------------------- envelope
ok(bb.min[0] >= ENV.x0 - 1e-3 && bb.max[0] <= ENV.x1 + 1e-3, 'world x out of the envelope: ' + JSON.stringify(bb));
ok(bb.min[2] >= ENV.z0 - 1e-3 && bb.max[2] <= ENV.z1 + 1e-3, 'world z out of the envelope: ' + JSON.stringify(bb));
ok(bb.min[1] >= ENV.y0 - 1e-3 && bb.max[1] <= ENV.y1 + 1e-3, 'height out of the envelope: ' + JSON.stringify(bb));

// ---------------------------------------------------------------- fly-in path
// up the 10 steps, over the porch, through the centre door, the vestibule, the
// foyer and down the auditorium axis.  Eye 1.6 m above the tread / floor.
const fly = [];
const run = (STEP_FRONT - PORCH) / 10;
fly.push(w(0, 1.3, STEP_FRONT + 5.0));
for (let k = 0; k < 10; k++) fly.push(w(0, (k + 1) * RISER + 1.6, STEP_FRONT - (k + 0.5) * run));
fly.push(w(0, FY + 1.6, PORCH - 1.0));
fly.push(w(0, FY + 1.6, 24.0));
fly.push(w(0, FY + 1.6, 18.0));
fly.push(w(0, FY + 1.6, 8.0));
fly.push(w(0, FY + 1.6, 0.0));
fly.push(w(0, FY + 1.6, AZ0 + 1.6));
const flyHits = pathHits(b, fly);
ok(flyHits === 0, 'the walk-in path is blocked: ' + flyHits + ' faces over ' + (fly.length - 1) + ' segments');
// lateral partners (2.4 m clear width) through doors / portals
let latHits = 0, latRays = 0;
for (const dx of [-2.4, -1.2, 1.2, 2.4]) {
  for (const z of [24.0, 20.7, 12.0, 2.0, -8.0]) {
    latHits += segHits(b, w(dx, FY + 1.6, z + 1.6), w(dx, FY + 1.6, z - 1.6)); latRays++;
  }
}
ok(latHits === 0, 'off-axis public circulation is blocked: ' + latHits + ' / ' + latRays);

// ---------------------------------------------------------------- headroom / clear width
const headPts = [
  [0, 24.0], [0, 19.0], [0, 12.8], [0, 8.0], [-5.5, 15.0], [5.5, 15.0],
  [0, 1.0], [0, -5.0], [0, -11.0], [-6, -3.0], [6, -3.0],
  [0, 6.6], [-5.0, 6.6], [5.0, 6.6], [-23.4, 12.0], [23.4, 12.0],
];
let headHits = 0;
for (const [x, z] of headPts) headHits += segHits(b, w(x, FY + 0.1, z), w(x, FY + 2.5, z));
ok(headHits === 0, 'headroom < 2.4 m at ' + headHits + ' points');
// clear width >= 2.4 m across the centre aisle and the doors
let widthHits = 0;
for (const z of [26.0, 20.7, 14.0, 8.0, 2.0, -6.0]) {
  widthHits += segHits(b, w(-1.5, FY + 1.7, z), w(1.5, FY + 1.7, z));
}
ok(widthHits === 0, 'centre aisle narrower than 2.4 m: ' + widthHits);

// ---------------------------------------------------------------- tier boxes + stage
// in front of each tier's balcony fronts (the auditorium void over the stalls)
let boxHits = 0;
for (let t = 0; t < 3; t++) {
  const y = TIER[t] + 0.55;
  for (const z of [AZ0 + 1.5, -9.0, -5.0, -1.0, 1.4]) {
    boxHits += segHits(b, w(-7.0, y, z), w(7.0, y, z));
  }
}
ok(boxHits === 0, 'tier balcony clearance blocked: ' + boxHits);
// the balconies ARE solid: a ray upward from the stalls hits the tier-1 slab overhead
const tierSolid = segHits(b, w(0, TIER[0] - BAND_T - 0.30, 4.6), w(0, TIER[0] - BAND_T + 0.30, 4.6));
ok(tierSolid > 0, 'tier 1 has no slab over the rear stalls');
// stage: clear volume above the stage floor + through the proscenium centre
let stageUp = 0;
for (const q of [[-6.0, -19.4], [0, -19.4], [6.0, -19.4], [-9.0, -17.0], [9.0, -17.0]]) {
  stageUp += segHits(b, w(q[0], FY + 0.2, q[1]), w(q[0], FY + 19.0, q[1]));
}
ok(stageUp === 0, 'stage fly volume is blocked: ' + stageUp);
const stageWide = segHits(b, w(-12.0, FY + 9.0, -17.0), w(12.0, FY + 9.0, -17.0));
ok(stageWide === 0, 'stage cross-clearance blocked: ' + stageWide);
let archHits = 0;
for (const y of [FY + 4.0, FY + 7.0, FY + 10.0]) {
  for (const x of [-2.0, 2.0]) archHits += segHits(b, w(x, y, AZ0 + 2.0), w(x, y, AZ0 - 3.0));
}
ok(archHits === 0, 'proscenium centre is blocked: ' + archHits);

// ---------------------------------------------------------------- enclosed shell
let openRays = 0, openAt = '';
const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const samples = [
  ['vestibule', 0, 13.2, 23], ['vestibule', 5, 13.2, 23], ['vestibule', -5, 12.6, 23],
  ['foyer', 0, 8, 13], ['foyer', 20, 10, 13], ['foyer', 0, 18, 13], ['foyer', -20, 6, 17],
  ['auditorium', 0, 8, -3], ['auditorium', 13, 10, -3], ['auditorium', 0, 18, 3], ['auditorium', -8, 6, -9],
  ['stage', 0, 10, -18], ['backstage', 0, 6, -22.5],
  ['salonE', 29.5, 7, 14], ['salonW', -29.5, 7, 14],
];
for (const smp of samples) {
  for (const d of dirs) {
    // the vestibule and foyer legitimately see daylight through the entrance doors
    if (d[0] === -1 && (smp[0] === 'vestibule' || smp[0] === 'foyer' || smp[0] === 'auditorium')) continue;
    const p0 = w(smp[1], smp[2], smp[3]);
    const p1 = [p0[0] + d[0] * 95, p0[1] + d[1] * 95, p0[2] + d[2] * 95];
    if (segHits(b, p0, p1) === 0) { openRays++; if (!openAt) openAt = smp[0] + ' dir ' + d.join(','); }
  }
}
ok(openRays === 0, 'the shell leaks to the sky: ' + openRays + ' open rays, first at ' + openAt);

// ---------------------------------------------------------------- interior palette discipline
const lums = [];
let emissiveBad = 0, maxEm = 0;
for (let i = 0; i < b.v.length; i += 11) {
  const lx = b.v[i + 2] - A.z, ly = b.v[i + 1], lz = A.x - b.v[i];
  let inside = false;
  for (const k in ROOMS) {
    const r = ROOMS[k];
    if (lx > r[0] - 0.02 && lx < r[1] + 0.02 && ly > r[2] - 0.02 && ly < r[3] + 0.02 && lz > r[4] - 0.02 && lz < r[5] + 0.02) { inside = true; break; }
  }
  if (!inside) continue;
  lums.push(0.2126 * b.v[i + 6] + 0.7152 * b.v[i + 7] + 0.0722 * b.v[i + 8]);
  const em = b.v[i + 9];
  if (em < 0 || em > 0.15) emissiveBad++;
  maxEm = Math.max(maxEm, em);
}
lums.sort((a, c) => a - c);
const N = lums.length;
const qtl = (t) => lums[Math.max(0, Math.min(N - 1, Math.floor(t * (N - 1))))];
const median = qtl(0.5), p95 = qtl(0.95), p10 = qtl(0.10);
const inBand = lums.filter((v) => v >= 0.20 && v <= 0.75).length / N;
ok(N > 20000, 'suspiciously little interior geometry: ' + N + ' vertices');
ok(median >= 0.42 && median <= 0.62, 'interior median albedo outside 0.42..0.62: ' + median.toFixed(3));
ok(p95 <= 0.68, 'interior p95 albedo too bright (emissive discipline broken): ' + p95.toFixed(3));
ok(p10 >= 0.08, 'interior p10 albedo suspiciously dark: ' + p10.toFixed(3));
ok(inBand >= 0.75, 'interior albedo far outside the 0.42..0.62 band for too many vertices: ' + (100 * inBand).toFixed(1) + '%');
ok(emissiveBad === 0, 'interior emissive outside 0..0.15 on ' + emissiveBad + ' vertices (max ' + maxEm.toFixed(2) + ')');

// ---------------------------------------------------------------- lights
ok(ctx.points.length > 0 && ctx.points.length <= 40, 'point light count: ' + ctx.points.length);
ok(ctx.points.every((q) => q.p.every(Number.isFinite) && q.col.every(Number.isFinite) && q.range > 0 && q.int > 0 && q.int <= 1), 'bad point light');
ok(ctx.points.every((q) => q.p[0] > ENV.x0 - 1 && q.p[0] < ENV.x1 + 1 && q.p[2] > ENV.z0 - 1 && q.p[2] < ENV.z1 + 1 && q.p[1] < ENV.y1), 'point light outside the opera');
ok(ctx.lanterns.length >= 40 && ctx.lanterns.length <= 400, 'lantern count ' + ctx.lanterns.length + ' (expected 40..400)');

// ---------------------------------------------------------------- determinism
const b2 = new B();
buildOpera(b2, { points: [], lanterns: [] }, mulberry32(7));
const s2 = stats(b2);
ok(s2.tris === s.tris, 'triangle count is not deterministic: ' + s.tris + ' vs ' + s2.tris);
ok(s2.hash === s.hash, 'vertex hash is not deterministic');
ok(JSON.stringify(s2.bbox) === JSON.stringify(bb), 'bbox is not deterministic');

const report = {
  tris: s.tris, verts: s.verts, bbox: bb,
  envelope: ENV,
  flyin: { segments: fly.length - 1, hits: flyHits },
  lateral: { rays: latRays, hits: latHits },
  headroom_hits: headHits, clear_width_hits: widthHits,
  tier_clearance: boxHits, tier_slab_hits: tierSolid,
  stage: { up: stageUp, wide: stageWide, arch: archHits },
  shell_open_rays: openRays,
  interior: {
    vertices: N, median_lum: +median.toFixed(3), p10: +p10.toFixed(3), p95: +p95.toFixed(3),
    pct_in_0_20_0_75: +(100 * inBand).toFixed(1), max_emissive: +maxEm.toFixed(3),
  },
  lights: ctx.points.length, lanterns: ctx.lanterns.length,
  deterministic: s2.tris === s.tris && s2.hash === s.hash,
};
console.log(JSON.stringify(report, null, 2));
if (fails.length) { console.log('FAIL\n - ' + fails.join('\n - ')); process.exit(1); }
console.log('PASS  opera: ' + s.tris + ' tris, bbox ' + JSON.stringify(bb) + ', walk-in path clear, shell enclosed, deterministic');
