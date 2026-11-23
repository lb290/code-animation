// Geometry-only checks for the round-7 station (no GL / no browser).
//   node tools/station-check.mjs
// The ring line (built by rail.js) runs THROUGH the station: this tool proves the train
// envelope, both end portals and the concourse entry are clear, plus tri budget, bbox,
// determinism and NaN / stack hygiene.
import { mulberry32 } from '../src/math.js';
import { B } from '../src/geo.js';
import { buildStation } from '../src/station.js';
import { L } from '../src/layout.js';

const SEED = 20261122;
const A = L.station;
// ---- contract constants (kept in sync with src/station.js)
const X0 = 22, X1 = 94, ZB = -166, ZF = -126;
const ZC = -146;
const ENV = { z0: -150, z1: -142, y0: 27, y1: 35.5 };      // train envelope
const ARCH = { z0: -152, z1: -140, y0: 27.45, crown: 41.5 }; // 12 m wide, 14.05 m high
const FY = 0.2, PLY = 28.4;

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

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

// ---------------------------------------------------------------- build once
const ctx = { points: [], lanterns: [] };
const b = new B();
buildStation(b, ctx, mulberry32(SEED));
const s = stats(b);

ok(s.tris >= 80000, 'station under the 80k triangle floor: ' + s.tris);
ok(s.tris <= 240000, 'station over the 240k triangle budget: ' + s.tris);
ok(s.stack === 1, 'station leaks the matrix stack: ' + s.stack);
ok(s.nan === 0, 'station non-finite vertices: ' + s.nan);
ok(s.far === 0, 'station far vertices: ' + s.far);
ok(s.bad === 0, 'station NaN verts: ' + s.bad);
ok(s.badColor === 0, 'station bad colours: ' + s.badColor);
ok(s.badNormal === 0, 'station degenerate normals: ' + s.badNormal);
ok(s.badMat === 0, 'station bad material arrays: ' + s.badMat);

// ---------------------------------------------------------------- footprint / height
const bb = s.bbox;
ok(bb.max[1] <= 58.0, 'station total height > 58: ' + bb.max[1]);
ok(bb.min[1] >= -0.01, 'station dips below ground: ' + bb.min[1]);
// the ENCLOSED BUILDING must sit inside x[22,94] / z[-166,-126]; the raised forecourt is a
// site element inside the city's reserved station forecourt (city.js: x 18..98 / z -168..-100)
let bld = [1e9, 1e9, 1e9], bld2 = [-1e9, -1e9, -1e9];
for (let i = 0; i < b.v.length; i += 11) {
  const x = b.v[i], y = b.v[i + 1], z = b.v[i + 2];
  if (y > 2.3 && z < ZF - 0.01) {   // building shell above the terrace, behind the facade
    bld[0] = Math.min(bld[0], x); bld[1] = Math.min(bld[1], y); bld[2] = Math.min(bld[2], z);
    bld2[0] = Math.max(bld2[0], x); bld2[1] = Math.max(bld2[1], y); bld2[2] = Math.max(bld2[2], z);
  }
}
const BLD = { min: bld.map((v) => +v.toFixed(3)), max: bld2.map((v) => +v.toFixed(3)) };
ok(BLD.min[0] >= X0 - 1e-3 && BLD.max[0] <= X1 + 1e-3, 'building body x out of the footprint: ' + JSON.stringify(BLD));
ok(BLD.min[2] >= ZB - 1e-3 && BLD.max[2] <= ZF + 1e-3, 'building body z out of the footprint: ' + JSON.stringify(BLD));
ok(bb.min[2] >= -166.5 && bb.max[2] <= -104, 'station bbox z out of the forecourt reservation: ' + JSON.stringify(bb));
ok(bb.min[0] >= X0 - 1e-3 && bb.max[0] <= X1 + 1e-3, 'station bbox x out of the footprint: ' + JSON.stringify(bb));

// ---------------------------------------------------------------- train envelope
// (a) no station vertex may sit inside the envelope box
let envVerts = 0;
for (let i = 0; i < b.v.length; i += 11) {
  const x = b.v[i], y = b.v[i + 1], z = b.v[i + 2];
  if (z > ENV.z0 + 1e-3 && z < ENV.z1 - 1e-3 && y > ENV.y0 + 1e-3 && y < ENV.y1 - 1e-3 && x > X0 && x < X1) envVerts++;
}
ok(envVerts === 0, 'train envelope is intruded: ' + envVerts + ' station vertices inside z[-150,-142] y[27,35.5]');
// (b) sweeps along the track: x 22..94 at z=-146 and the envelope edges
let envHits = 0, envRays = 0;
for (const z of [-149.9, -146, -142.1]) {
  for (const y of [27.1, 29, 31, 33, 35.4]) {
    envHits += segHits(b, [X0 - 0.5, y, z], [X1 + 0.5, y, z]); envRays++;
  }
}
ok(envHits === 0, 'train envelope sweep hits ' + envHits + ' faces over ' + envRays + ' rays');
// (c) the two end portals: a >=12 m x >=14 m clear opening through each end wall
let archHits = 0, archRays = 0;
for (const y of [28, 30, 33, 35.4, 38, 41.0]) {
  const half = y <= 35.5 ? 5.9 : (Math.sqrt(Math.max(0, 36 - (y - 35.5) ** 2)) - 0.1) * 0.75;
  for (const z of [ZC - half, ZC, ZC + half]) {
    archHits += segHits(b, [X0 - 2, y, z], [X0 + 6, y, z]); archRays++;
    archHits += segHits(b, [X1 + 2, y, z], [X1 - 6, y, z]); archRays++;
  }
}
ok(archHits === 0, 'end portals are not clear: ' + archHits + ' faces over ' + archRays + ' through-rays');

// ---------------------------------------------------------------- concourse entry + access
// fly in from the plaza at y 3..6 through the three portals, reach the ticket hall
let flyHits = 0, flyRays = 0;
for (const x of [33, 58, 83]) {
  for (const y of [3.4, 4.6, 6.2]) { flyHits += segHits(b, [x, y, -104], [x, y, -160]); flyRays++; }
}
ok(flyHits === 0, 'concourse entry is blocked: ' + flyHits + ' faces over ' + flyRays + ' portal rays');
// the grand stair arrives on the south platform: clear walk from the top step onto the platform
const arrA = segHits(b, [34.2, PLY + 0.95, -133.5], [42.0, PLY + 0.95, -133.5]);
const arrB = segHits(b, [79.8, PLY + 0.95, -156.5], [86.0, PLY + 0.95, -156.5]);
ok(arrA === 0, 'south stair arrival is blocked: ' + arrA);
ok(arrB === 0, 'north stair arrival is blocked: ' + arrB);
// the stair wells are open from the concourse ceiling up to the platform
const wellA = segHits(b, [42.5, 17.6, -136.0], [42.5, 27.6, -136.0]);
const wellB = segHits(b, [73.5, 17.6, -156.0], [73.5, 27.6, -156.0]);
ok(wellA === 0, 'south stair well is closed: ' + wellA);
ok(wellB === 0, 'north stair well is closed: ' + wellB);
// the concourse is a real cavity: a point grid inside it must be empty of shell geometry
let cav = 0;
for (let i = 0; i < b.v.length; i += 11) {
  const x = b.v[i], y = b.v[i + 1], z = b.v[i + 2];
  if (x > 27.2 && x < 88.8 && y > 1.2 && y < 16.4 && z > -160.8 && z < -131.2) cav++;
}
// furniture / lamps / stairs legitimately live in the hall, so only flag a shell-sized blob
ok(cav < 120000, 'concourse looks solid: ' + cav + ' vertices inside the hall');

// ---------------------------------------------------------------- determinism
const b2 = new B();
buildStation(b2, { points: [], lanterns: [] }, mulberry32(7));
const s2 = stats(b2);
ok(s2.tris === s.tris, 'triangle count is not deterministic: ' + s.tris + ' vs ' + s2.tris);
ok(s2.hash === s.hash, 'vertex hash is not deterministic');
ok(JSON.stringify(s2.bbox) === JSON.stringify(s.bbox), 'bbox is not deterministic');

// ---------------------------------------------------------------- lights
ok(ctx.points.length > 0 && ctx.points.length <= 8, 'station pushes ' + ctx.points.length + ' point lights (max 8)');
ok(ctx.points.every((p) => p.p.every(Number.isFinite) && p.col.every(Number.isFinite) && p.range > 0 && p.int > 0 && p.int <= 1), 'bad point light');
ok(ctx.points.every((p) => p.p[0] > X0 && p.p[0] < X1 && p.p[2] > ZB && p.p[2] < -100), 'point light outside the station');
ok(ctx.lanterns.length >= 30 && ctx.lanterns.length <= 500, 'lantern count ' + ctx.lanterns.length + ' (expected 30..500)');

const report = {
  tris: s.tris, verts: s.verts, bbox: bb, building_bbox: BLD,
  envelope_rays: envRays, envelope_hits: envHits, envelope_verts: envVerts,
  portal_rays: archRays, portal_hits: archHits,
  concourse_entry_rays: flyRays, concourse_entry_hits: flyHits,
  stair_arrival_hits: [arrA, arrB], stair_well_hits: [wellA, wellB],
  hall_vertices: cav, lights: ctx.points.length, lanterns: ctx.lanterns.length,
  deterministic: s2.tris === s.tris && s2.hash === s.hash,
};
console.log(JSON.stringify(report, null, 2));
if (fails.length) { console.log('FAIL\n - ' + fails.join('\n - ')); process.exit(1); }
console.log('PASS  station: ' + s.tris + ' tris, bbox ' + JSON.stringify(bb) + ', train envelope clear, both portals open, concourse enterable, deterministic');
