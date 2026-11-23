// Round 9 station stair-well check (geometry only, no GL / no browser).
//   node tools/station-stair-check.mjs
//
// WHY THE PLATFORM FURNITURE FLOATED: the two stair wells are holes cut in the platform slab,
// but every platform fixture was placed on arithmetic grids that ignored them —
//     canopy columns x = 30 + 8i,  benches x = 34 + 11i,  palms x = 38 + 14i,  luggage x + 4,
//     bench rows at z = -162.2 / -129.8 (inside the front/back walls).
// x = 38/46 (south platform) and x = 70/78 (north) therefore put four canopy columns, two
// benches, palms and luggage piles straight over the stair openings, all drawn at y = PLY with
// no slab under them. This tool asserts the fixed, well-aware plan (src/station.js platformPlan()
// is the single source of truth) and then ray-tests the *built* geometry: directly under every
// fixture footprint corner there has to be platform slab, and every well rim (except the stair's
// arrival mouth) has to carry a balustrade.
import { mulberry32 } from '../src/math.js';
import { B } from '../src/geo.js';
import { buildStation, platformPlan } from '../src/station.js';

const SEED = 20261123;
const PLY = 28.4, HX0 = 26.5, HX1 = 89.5;
const CHN = -150.02, CHS = -141.98, HZ0 = -161.5, HZ1 = -130.5;
const WELL_M = 0.6;
const BASELINE_TRIS = 102106;      // round-7/8 station-check count, before this fix
const TRI_BUDGET = 10000;          // round-9 allowance for this module

const ctx = { points: [], lanterns: [] };
const b = new B();
buildStation(b, ctx, mulberry32(SEED));

function stats(bb) {
  const v = bb.v;
  let nan = 0, far = 0, badMat = 0;
  for (let i = 0; i < v.length; i += 11) {
    for (let k = 0; k < 3; k++) if (!Number.isFinite(v[i + k])) nan++;
    if (Math.abs(v[i]) > 3000 || Math.abs(v[i + 1]) > 3000 || Math.abs(v[i + 2]) > 3000) far++;
    const e = v[i + 9], g = v[i + 10];
    if (!Number.isFinite(e) || !Number.isFinite(g) || e < 0 || e > 1.2 || g < 0 || g > 1) badMat++;
  }
  let h = 2166136261;
  for (let i = 0; i < v.length; i += 7) h = Math.imul(h ^ Math.round(v[i] * 1024), 16777619) >>> 0;
  return { tris: bb.i.length / 3, nan, far, badMat, hash: h, stack: bb.stack.length, bad: bb.bad || 0, badColor: bb.badColor || 0, badNormal: bb.badNormal || 0 };
}

// triangle-soup segment query (Moller-Trumbore + AABB prefilter)
const P = (bb, i) => [bb.v[i], bb.v[i + 1], bb.v[i + 2]];
function segHits(bb, p0, p1) {
  const lo = [Math.min(p0[0], p1[0]), Math.min(p0[1], p1[1]), Math.min(p0[2], p1[2])];
  const hi = [Math.max(p0[0], p1[0]), Math.max(p0[1], p1[1]), Math.max(p0[2], p1[2])];
  const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  let hits = 0;
  for (let t = 0; t < bb.i.length; t += 3) {
    const A = P(bb, bb.i[t] * 11), Bv = P(bb, bb.i[t + 1] * 11), C2 = P(bb, bb.i[t + 2] * 11);
    if (Math.max(A[0], Bv[0], C2[0]) < lo[0] || Math.min(A[0], Bv[0], C2[0]) > hi[0]) continue;
    if (Math.max(A[1], Bv[1], C2[1]) < lo[1] || Math.min(A[1], Bv[1], C2[1]) > hi[1]) continue;
    if (Math.max(A[2], Bv[2], C2[2]) < lo[2] || Math.min(A[2], Bv[2], C2[2]) > hi[2]) continue;
    const e1 = [Bv[0] - A[0], Bv[1] - A[1], Bv[2] - A[2]];
    const e2 = [C2[0] - A[0], C2[1] - A[1], C2[2] - A[2]];
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

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

// ---------------------------------------------------------------- build hygiene
const s = stats(b);
ok(s.tris >= 80000, 'station under the 80k triangle floor: ' + s.tris);
ok(s.tris <= 240000, 'station over the 240k triangle budget: ' + s.tris);
ok(s.tris - BASELINE_TRIS <= TRI_BUDGET, 'round-9 platform fix grew the station by more than ' + TRI_BUDGET + ' tris: ' + (s.tris - BASELINE_TRIS));
ok(s.stack === 1, 'matrix stack leak: ' + s.stack);
ok(s.nan === 0, 'non-finite vertices: ' + s.nan);
ok(s.far === 0, 'far vertices: ' + s.far);
ok(s.bad === 0, 'NaN verts: ' + s.bad);
ok(s.badColor === 0, 'bad colours: ' + s.badColor);
ok(s.badNormal === 0, 'degenerate normals: ' + s.badNormal);
ok(s.badMat === 0, 'bad material arrays: ' + s.badMat);

const plan = platformPlan();
ok(plan.platforms.length === 2, 'expected 2 platforms in the plan');

const overlap = (x, z, hx, hz, r, m = 0) => x + hx > r.x0 - m && x - hx < r.x1 + m && z + hz > r.z0 - m && z - hz < r.z1 + m;

let fixtures = 0, penetrated = 0, offSlab = 0, floating = 0, kerbBad = 0;
const kinds = {};
const byKind = {};
for (const pl of plan.platforms) {
  const w = pl.well;
  const zLo = Math.min(pl.z0, pl.z1), zHi = Math.max(pl.z0, pl.z1);
  // ---- columns: eight per platform, none over an opening
  const cols = pl.items.filter((it) => it.kind === 'column');
  ok(cols.length === 8, 'platform ' + pl.side + ' has ' + cols.length + ' canopy columns (expect 8)');
  for (const it of cols) {
    if (overlap(it.x, it.z, it.hx, it.hz, w, WELL_M)) penetrated++;
  }
  // ---- fixtures that stand on the slab must be on it
  for (const it of pl.items) {
    kinds[it.kind] = (kinds[it.kind] || 0) + 1;
    if (it.kind === 'sign') continue;                    // hangs from the canopy
    fixtures++;
    byKind[it.kind] = (byKind[it.kind] || 0) + 1;
    if (it.kind !== 'planter' && overlap(it.x, it.z, it.hx, it.hz, w, WELL_M)) penetrated++;
    // inside the slab rectangle (this is what keeps fixtures out of the front/back walls)
    if (it.x - it.hx < HX0 + 0.25 || it.x + it.hx > HX1 - 0.25) offSlab++;
    if (it.kind === 'planter') {
      // kerb planters stand on the solid 0.9 m kerb band, not on the slab proper
      const kz0 = pl.side < 0 ? CHN - 0.9 : CHS, kz1 = pl.side < 0 ? CHN : CHS + 0.9;
      if (it.z - it.hz < kz0 - 0.02 || it.z + it.hz > kz1 + 0.02) kerbBad++;
    } else if (it.z - it.hz < zLo + 0.04 || it.z + it.hz > zHi - 0.04) {
      offSlab++;
    }
    // bottom face really sits on its support (slab y = PLY, kerb planter on the kerb at +0.12)
    const wantY = it.kind === 'planter' ? PLY + 0.14 : PLY;
    if (Math.abs(it.y - wantY) > 1e-6) floating++;
    // ---- built-geometry proof: a short vertical probe under each footprint sample must hit
    //      the slab (or the kerb) - nothing but air over a stair opening
    const sx = [0, 0.7, -0.7, 0.7, -0.7], sz = [0, 0.7, -0.7, -0.7, 0.7];
    for (let k = 0; k < 5; k++) {
      const px = it.x + sx[k] * it.hx, pz = it.z + sz[k] * it.hz;
      const hits = segHits(b, [px, it.y + 0.02, pz], [px, PLY - 0.02, pz]);
      if (hits === 0) { floating++; break; }
    }
  }
  // ---- balustrade around the well rim: a downward probe on the rim line hits the rail
  const y = PLY + 0.12;
  const rimPoints = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(2, Math.ceil(len / 0.4));
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push([x0 + (x1 - x0) * t, z0 + (z1 - z0) * t]);
    }
    return pts;
  };
  const mouth = pl.mouth;
  const rails = [[w.x0, w.z0, w.x1, w.z0], [w.x0, w.z1, w.x1, w.z1]];
  if (mouth.edge === 'x0') rails.push([w.x1, w.z0, w.x1, w.z1], [w.x0, w.z0, w.x0, mouth.z0]);
  else rails.push([w.x0, w.z0, w.x0, w.z1], [w.x1, mouth.z1, w.x1, w.z1]);
  let railMiss = 0, railSamples = 0;
  for (const seg of rails) {
    for (const [px, pz] of rimPoints(...seg)) {
      railSamples++;
      if (segHits(b, [px, y + 1.9, pz], [px, y + 0.5, pz]) === 0) railMiss++;
    }
  }
  ok(railMiss === 0, 'platform ' + pl.side + ': ' + railMiss + '/' + railSamples + ' well-rim samples have no balustrade');
  // ---- the arrival mouth must stay open (no rail across it)
  let mouthHits = 0;
  // stay clear of the piers that terminate the rails on both sides of the mouth
  const mPts = rimPoints(mouth.x, mouth.z0 + 0.5, mouth.x, mouth.z1 - 0.5);
  for (const [px, pz] of mPts) {
    mouthHits += segHits(b, [px, y + 1.9, pz], [px, y + 0.5, pz]);
  }
  ok(mouthHits === 0, 'platform ' + pl.side + ': arrival mouth is fenced off (' + mouthHits + ' rail hits)');
  // ---- the arrival walk (top step -> platform) must be clear at knee height
  const dir = mouth.edge === 'x0' ? -1 : 1;
  const mid = (mouth.z0 + mouth.z1) / 2;
  ok(segHits(b, [mouth.x + dir * 2.2, PLY + 0.95, mid], [mouth.x - dir * 5.0, PLY + 0.95, mid]) === 0,
    'platform ' + pl.side + ': stair arrival walk is blocked');
  // ---- fixtures must not overlap each other
}
// pairwise overlap of solid fixtures (same build, so a clash would be visible)
let clashes = 0;
for (const pl of plan.platforms) {
  const list = pl.items.filter((it) => it.kind !== 'sign');
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], c = list[j];
      if (Math.abs(a.x - c.x) < a.hx + c.hx - 0.02 && Math.abs(a.z - c.z) < a.hz + c.hz - 0.02) {
        // benches/palms/luggage at different rows never touch; a hit here is a real clash
        clashes++;
      }
    }
  }
}
ok(clashes === 0, clashes + ' platform fixtures overlap each other');
ok(penetrated === 0, penetrated + ' platform fixtures stand over a stair well (0.6 m keep-clear)');
ok(offSlab === 0, offSlab + ' platform fixtures stick out of the slab / into the walls');
ok(kerbBad === 0, kerbBad + ' kerb planters are not on the kerb band');
ok(floating === 0, floating + ' fixture footprints have no slab under them (floating)');
ok((byKind.bench || 0) >= 12, 'too few benches placed: ' + (byKind.bench || 0));
ok((byKind.palm || 0) >= 4, 'too few palms placed: ' + (byKind.palm || 0));

// ---------------------------------------------------------------- determinism
const b2 = new B();
buildStation(b2, { points: [], lanterns: [] }, mulberry32(7));
const s2 = stats(b2);
ok(s2.tris === s.tris, 'triangle count is not deterministic: ' + s.tris + ' vs ' + s2.tris);
ok(s2.hash === s.hash, 'vertex hash is not deterministic');
ok(ctx.points.length <= 8, 'station pushes ' + ctx.points.length + ' point lights (max 8)');

const report = {
  tris: s.tris,
  tri_delta_vs_baseline: s.tris - BASELINE_TRIS,
  platforms: plan.platforms.map((pl) => ({
    side: pl.side,
    columns: pl.cols.map((v) => +v.toFixed(2)),
    bays: pl.bays.map((v) => +v.x.toFixed(2)),
    arrival_mouth: pl.mouth,
    transfer_girder: { x0: +pl.girder.x0.toFixed(2), x1: +pl.girder.x1.toFixed(2), z: pl.girder.z, top: +pl.girder.top.toFixed(2) },
    fixtures: pl.items.reduce((m, it) => (m[it.kind] = (m[it.kind] || 0) + 1, m), {}),
  })),
  fixtures_checked: fixtures,
  footprints_over_well: penetrated,
  footprints_off_slab: offSlab,
  footprints_floating: floating,
  fixture_clashes: clashes,
  deterministic: s2.tris === s.tris && s2.hash === s.hash,
  diagnosis: 'platform fixtures were laid out on arithmetic grids (columns 30+8i, benches 34+11i, palms 38+14i, luggage x+4, bench rows at z=-162.2/-129.8) that ignored the two stair-well openings and the front/back walls, so columns and benches/palms/luggage were drawn at y=PLY over the holes (no slab under them) and two bench rows sat inside the walls',
};
console.log(JSON.stringify(report, null, 2));
if (fails.length) { console.log('FAIL\n - ' + fails.join('\n - ')); process.exit(1); }
console.log('PASS  station-stair: ' + s.tris + ' tris (' + (s.tris - BASELINE_TRIS) + ' vs baseline), ' +
  fixtures + ' fixtures all on solid slab with a 0.6 m well keep-clear, both arrival mouths open, well rims fully railed, deterministic');
