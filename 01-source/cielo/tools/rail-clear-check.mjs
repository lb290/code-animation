// rail-clear-check.mjs — proves the elevated railway never runs through a building.
//
//   node tools/rail-clear-check.mjs
//
// Builds the city head-lessly (city.js is pure JS), reads the recorded building
// footprints from arch.js, then measures the distance from the REAL rail curve
// (rail-path.js, Catmull-Rom, 1500 samples) to every footprint and to the fixed
// landmarks. Exits non-zero when anything is closer than its clearance budget.
import { buildCity } from '../src/city.js';
import { B } from '../src/geo.js';
import { mulberry32 } from '../src/math.js';
import { L } from '../src/layout.js';
import { railSamples, railPiers } from '../src/rail-path.js';

const b = new B();
const ctx = { points: [], lanterns: [], dyn: [], bbDyn: [], props: {}, triLog: {}, footprints: [] };
const rng = mulberry32(20261121);
const t0 = Date.now();
buildCity(b, ctx, rng);
const ms = Date.now() - t0;

const curve = railSamples();

// point -> oriented box distance (footprint local frame, rot = yaw)
function obbDist(px, pz, f) {
  const c = Math.cos(f.rot), s = Math.sin(f.rot);
  const dx = px - f.x, dz = pz - f.z;
  const lx = c * dx - s * dz;   // rotate world delta into the box frame
  const lz = s * dx + c * dz;
  const ox = Math.max(Math.abs(lx) - f.w / 2, 0);
  const oz = Math.max(Math.abs(lz) - f.d / 2, 0);
  return Math.hypot(ox, oz);
}

function clearance(f) {
  let best = 1e9;
  for (const p of curve) {
    const d = obbDist(p[0], p[2], f);
    if (d < best) { best = d; if (best < 0.001) return 0; }
  }
  return best;
}

const rows = [];
let worstCity = 1e9;
for (const f of ctx.footprints) {
  const d = clearance(f);
  rows.push({ ...f, dist: d });
  if (d < worstCity) worstCity = d;
}
rows.sort((a, b2) => a.dist - b2.dist);

// fixed landmarks: [name, cx, cz, w, d, need] — station is handled separately
// (the track is supposed to run through it).
const LM = [
  ['cathedral', L.cathedral.x, L.cathedral.z - 37.5, 60, 103, 10],
  ['glassPalace', L.glassPalace.x, L.glassPalace.z - 23, 78, 54, 10],
  ['terrace+palace', 0, 140, 122, 96, 10],
  ['plaza', L.plaza.x, L.plaza.z, 92, 92, 10],
  ['canal', 0, -232, 900, 24, 8],
  ['lowerTerrace', 0, 74.5, 18, 10, 2],
  ['opera', L.opera.x, L.opera.z, 58, 76, 10],
  // round 8: the palace's 1-floor rear suite is a hollow podium — keep the viaduct
  // well clear of the podium's inland wall plane (z = 182).
  ['palaceRearWall', 0, 182, 110, 1.4, 10],
];
const lmRows = [];
let lmFail = 0;
// the ferris wheel is a vertical disc in the world XY plane at z = L.ferris.z, so its
// plan footprint is the segment x cx+-40; the A-frames are two small boxes at the hub.
{
  const cx = L.ferris.x, cz = L.ferris.z;
  const seg = { x: cx, z: cz, w: 84, d: 1.6, rot: 0 };
  let best = 1e9;
  for (const p of curve) best = Math.min(best, obbDist(p[0], p[2], seg));
  lmRows.push({ name: 'ferris(wheel)', d: best, need: 4 });
  if (best < 4) lmFail++;
  for (const sx of [-1, 1]) {
    const box = { x: cx + sx * 7.2, z: cz, w: 6, d: 46, rot: 0 };
    let bb = 1e9;
    for (const p of curve) bb = Math.min(bb, obbDist(p[0], p[2], box));
    lmRows.push({ name: 'ferris(A-frame)', d: bb, need: 3 });
    if (bb < 3) lmFail++;
  }
}
for (const [name, cx, cz, w, d, need] of LM) {
  const f = { x: cx, z: cz, w, d, rot: 0 };
  let best = 1e9;
  for (const p of curve) { const dd = obbDist(p[0], p[2], f); if (dd < best) best = dd; }
  lmRows.push({ name, d: best, need });
  if (best < need) lmFail++;
}

// the station: the track must cross it dead straight (so the train sits at a platform)
const SX0 = L.station.x - 36, SX1 = L.station.x + 36, SZ = L.station.z;
let straightErr = 0;
for (const p of curve) {
  if (p[0] >= SX0 && p[0] <= SX1 && Math.abs(p[2] - SZ) < 6) straightErr = Math.max(straightErr, Math.abs(p[2] - SZ));
}
const inStation = curve.filter((p) => p[0] >= SX0 && p[0] <= SX1 && Math.abs(p[2] - SZ) < 6).length;

// piers are what actually hits the ground
const piers = railPiers();
let worstPier = 1e9;
for (const [px, pz] of piers) {
  for (const f of ctx.footprints) {
    const d = obbDist(px, pz, f);
    if (d < worstPier) worstPier = d;
  }
}

console.log('[rail-clear] city build', ms + 'ms,', ctx.footprints.length, 'buildings,', curve.length, 'curve samples,', piers.length, 'piers');
console.log('[rail-clear] worst city building clearance:', worstCity.toFixed(2), 'm');
for (const r of rows.slice(0, 8)) console.log('   ', r.dist.toFixed(2).padStart(6), 'm  building', r.w.toFixed(0) + 'x' + r.d.toFixed(0), 'at', r.x.toFixed(0) + ',' + r.z.toFixed(0), 'rot', r.rot.toFixed(2));
console.log('[rail-clear] landmarks:');
for (const r of lmRows) console.log('   ', r.name.padEnd(16), r.d.toFixed(2).padStart(7), 'm  (need >=', r.need + ')', r.d < r.need ? 'FAIL' : 'ok');
console.log('[rail-clear] worst pier clearance:', worstPier.toFixed(2), 'm');

// no city building may sit inside a landmark footprint (city.js reserves these rects)
const LMB = [
  ['cathedral', -96, -61.5, 60, 103],
  ['glassPalace', 104, 21, 78, 54],
  ['terrace+palace', 0, 140, 122, 96],
  ['station+forecourt', 58, -134, 80, 70],
];
let overlap = 0;
for (const f of ctx.footprints) {
  if (Math.hypot(f.x, f.z) > 258) continue;   // distant skyline silhouettes, not city blocks
  const c = Math.abs(Math.cos(f.rot)), s = Math.abs(Math.sin(f.rot));
  const hx = (c * f.w + s * f.d) / 2, hz = (s * f.w + c * f.d) / 2;
  const bw2 = f.wBody ?? f.w, bd2 = f.dBody ?? f.d;
  const hx2 = (Math.abs(Math.cos(f.rot)) * bw2 + Math.abs(Math.sin(f.rot)) * bd2) / 2;
  const hz2 = (Math.abs(Math.sin(f.rot)) * bw2 + Math.abs(Math.cos(f.rot)) * bd2) / 2;
  for (const [name, cx, cz, w, d] of LMB) {
    if (Math.abs(f.x - cx) < w / 2 + hx2 && Math.abs(f.z - cz) < d / 2 + hz2) {
      overlap++;
      if (overlap <= 6) console.log('    OVERLAP', name, 'building at', f.x.toFixed(0) + ',' + f.z.toFixed(0), f.w.toFixed(0) + 'x' + f.d.toFixed(0));
    }
  }
  // landmark circles are reserved on the BODY footprint (freeSpace never sees the
  // +2 m plinth), so test the body size here too
  for (const [cx, cz, r] of [[L.glassPalace.x, L.glassPalace.z, 72], [L.ferris.x, L.ferris.z, 57], [L.plaza.x, L.plaza.z, 47]]) {
    // exact rotated-box vs circle, same test city.js freeSpace uses
    const cf = Math.cos(f.rot), sf = Math.sin(f.rot);
    const bw = f.wBody ?? f.w, bd = f.dBody ?? f.d;
    const dx = cx - f.x, dz = cz - f.z;
    const lx = cf * dx - sf * dz, lz = sf * dx + cf * dz;
    const qx = Math.max(-bw / 2, Math.min(bw / 2, lx));
    const qz = Math.max(-bd / 2, Math.min(bd / 2, lz));
    if (Math.hypot(lx - qx, lz - qz) < r - 0.01) { overlap++; if (overlap <= 6) console.log('    circle overlap at', f.x.toFixed(0) + ',' + f.z.toFixed(0), 'r', r); }
  }
}
console.log('[rail-clear] city buildings inside landmark reserves:', overlap);

console.log('[rail-clear] station stretch: samples', inStation, ' straightness error', straightErr.toFixed(3), 'm');

// ---- round 8: the user's routing brief, asserted geometrically -----------------
// (1) the ring must no longer cross the belvedere's sight-line: no sample may sit in
//     the band z 50..92 between the old chord's end walls (|x| < 130).
let inViewBand = 0;
for (const p of curve) if (p[2] > 50 && p[2] < 92 && Math.abs(p[0]) < 130) inViewBand++;
// (2) it must pass BEHIND the palace podium (z > 188) for a long stretch.
let behind = 0;
for (const p of curve) if (p[2] > 188 && Math.abs(p[0]) < 120) behind++;
// (3) the ring must enclose the terrace/palace complex: for each of eight directions
//     there must be a sample on the far side of the palace (ray-cast from its centre).
let enclosed = 0;
for (let k = 0; k < 8; k++) {
  const a = (k / 8) * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
  let hit = false;
  for (let t = 30; t < 400 && !hit; t += 1.5) {
    const x = dx * t, z = 140 + dz * t;
    for (const p of curve) if (Math.hypot(p[0] - x, p[2] - z) < 9) { hit = true; break; }
  }
  if (hit) enclosed++;
}
console.log('[rail-clear] view band (z 50..92, |x|<130) samples:', inViewBand, '(must be 0)');
console.log('[rail-clear] samples behind the palace (z>188):', behind, '(need >= 60)');
console.log('[rail-clear] ring encloses the palace:', enclosed + '/8 rays');

const cityOk = worstCity >= 5.6;   // deck half 3.3 + >2 m of air
const pierOk = worstPier >= 1.6;
const stationOk = inStation > 40 && straightErr < 0.05;
const bandOk = inViewBand === 0;
const behindOk = behind >= 60;
const enclOk = enclosed === 8;
const ok = cityOk && lmFail === 0 && pierOk && stationOk && overlap === 0 && bandOk && behindOk && enclOk;
console.log('[rail-clear]', ok ? 'PASS' : 'FAIL',
  '| city>=5.6m:', cityOk, '| landmarks:', lmFail === 0, '| piers>=1.6m:', pierOk, '| station straight:', stationOk, '| landmark overlap:', overlap === 0,
  '| view band clear:', bandOk, '| behind palace:', behindOk, '| encloses palace:', enclOk);
process.exit(ok ? 0 : 1);