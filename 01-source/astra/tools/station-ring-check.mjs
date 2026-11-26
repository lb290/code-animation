// Geometry-only checks for the round-15 ASTRA habitat band (no GL / no browser).
//   node tools/station-ring-check.mjs
//
// The frozen contract is src/layout.js (ST) plus what the module hands over in
// ctx.props.ring (dock dimensions, rib angles, window counts).
// This tool builds the module for real and asserts:
//   1. triangle budget 30,000 .. 220,000 (the floor stops a placeholder passing)
//   2. world envelope: ring + sails + masts.  Design: the sails reach r = 646+205
//      = 851, so the radial envelope is 540..870 (+-6 m slack); the disc is the
//      ring plane, so |y| <= 120 for masts / radiator fins / guide towers (+6).
//   3. hygiene: no NaN, no far vertices, material range, min emissive >= 0.015
//      (no dead-black faces in space), matrix stack balanced
//   4. the dock is a REAL hole: five rays through the mouth (and one from the hub
//      side out) cross the whole band with ZERO triangle hits, while rays that
//      miss the mouth must hit the shell (Moller-Trumbore over the real soup)
//   5. the hub cavity r < 420 is empty (that volume belongs to the core module)
//   6. portholes: >= 200 lit, unlit <= 15 % of all windows; <= 8 point lights,
//      range 150..400 m; static billboards legal
//   7. determinism: two builds are float-for-float identical (FNV hash)
//   8. (bonus) the twelve ribs sit every 30 deg +-2 deg, including the dock frame
import { B, mulberry32 } from '../src/engine.js';
import { buildStationRing } from '../src/station-ring.js';
import { ST } from '../src/layout.js';

const R_OUT = ST.ringR + ST.ringW / 2;      // 646
const R_IN = ST.ringR - ST.ringW / 2;       // 554
const DOCK_A = ST.dockAngle * Math.PI / 180;

// envelope (see the header comment; +-6 m slack on every bound)
const ENV = { rMin: 540, rMax: 875, rMid: 120, tol: 6 };
const TRI_MIN = 30000, TRI_MAX = 220000;

function buildOne() {
  const b = new B();
  const ctx = { points: [], lanterns: [], props: {}, failures: [] };
  buildStationRing(b, ctx);
  return { b, ctx };
}

function stats(b) {
  const v = b.v;
  let nan = 0, far = 0, badMat = 0, dark = 0, rMax = 0, rMin = 1e9, rMid = 0;
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let i = 0; i < v.length; i += 11) {
    for (let k = 0; k < 3; k++) {
      const x = v[i + k];
      if (!Number.isFinite(x)) nan++;
      if (x < mn[k]) mn[k] = x;
      if (x > mx[k]) mx[k] = x;
    }
    if (Math.abs(v[i]) > 3000 || Math.abs(v[i + 1]) > 3000 || Math.abs(v[i + 2]) > 3000) far++;
    const e = v[i + 9], g = v[i + 10];
    if (!Number.isFinite(e) || !Number.isFinite(g) || e < 0 || e > 1.2 || g < 0 || g > 1) badMat++;
    else if (e < 0.015) dark++;
    const r = Math.hypot(v[i], v[i + 2]);
    if (Number.isFinite(r)) {
      if (r > rMax) rMax = r;
      if (r < rMin) rMin = r;
    }
    if (Math.abs(v[i + 1]) > rMid) rMid = Math.abs(v[i + 1]);
  }
  let h = 2166136261;
  for (let i = 0; i < v.length; i += 7) h = Math.imul(h ^ Math.round(v[i] * 1024), 16777619) >>> 0;
  return {
    tris: b.i.length / 3, verts: v.length / 11, nan, far, badMat, dark,
    rMax: +rMax.toFixed(2), rMin: +rMin.toFixed(2), yMax: +rMid.toFixed(2),
    bbox: { min: mn.map((x) => +x.toFixed(2)), max: mx.map((x) => +x.toFixed(2)) },
    hash: h, stack: b.stack.length, bad: b.bad || 0, badColor: b.badColor || 0, badNormal: b.badNormal || 0,
  };
}

// ---------------------------------------------------------------- ray / triangle
// Moller-Trumbore over the real soup with an AABB prefilter.  Endpoints are
// excluded so a ray that starts or ends on a surface is not counted as a hit.
function rayHits(b, p0, p1, eps = 2e-4) {
  const lo = [Math.min(p0[0], p1[0]), Math.min(p0[1], p1[1]), Math.min(p0[2], p1[2])];
  const hi = [Math.max(p0[0], p1[0]), Math.max(p0[1], p1[1]), Math.max(p0[2], p1[2])];
  const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const v = b.v, idx = b.i;
  const ts = [];
  for (let t = 0; t < idx.length; t += 3) {
    const ia = idx[t] * 11, ib = idx[t + 1] * 11, ic = idx[t + 2] * 11;
    const a0 = v[ia], a1 = v[ia + 1], a2 = v[ia + 2];
    const b0 = v[ib], b1 = v[ib + 1], b2 = v[ib + 2];
    const c0 = v[ic], c1 = v[ic + 1], c2 = v[ic + 2];
    if (Math.max(a0, b0, c0) < lo[0] || Math.min(a0, b0, c0) > hi[0]) continue;
    if (Math.max(a1, b1, c1) < lo[1] || Math.min(a1, b1, c1) > hi[1]) continue;
    if (Math.max(a2, b2, c2) < lo[2] || Math.min(a2, b2, c2) > hi[2]) continue;
    const e1 = [b0 - a0, b1 - a1, b2 - a2];
    const e2 = [c0 - a0, c1 - a1, c2 - a2];
    const pv = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
    const det = e1[0] * pv[0] + e1[1] * pv[1] + e1[2] * pv[2];
    if (Math.abs(det) < 1e-9) continue;
    const inv = 1 / det;
    const tv = [p0[0] - a0, p0[1] - a1, p0[2] - a2];
    const u = (tv[0] * pv[0] + tv[1] * pv[1] + tv[2] * pv[2]) * inv;
    if (u < -1e-6 || u > 1 + 1e-6) continue;
    const qv = [tv[1] * e1[2] - tv[2] * e1[1], tv[2] * e1[0] - tv[0] * e1[2], tv[0] * e1[1] - tv[1] * e1[0]];
    const vv = (d[0] * qv[0] + d[1] * qv[1] + d[2] * qv[2]) * inv;
    if (vv < -1e-6 || u + vv > 1 + 1e-6) continue;
    const tt = (e2[0] * qv[0] + e2[1] * qv[1] + e2[2] * qv[2]) * inv;
    if (tt > eps && tt < 1 - eps) ts.push(tt);
  }
  return ts;
}

const fails = [];
const ok = (cond, msg) => { console.log((cond ? '  PASS ' : '  FAIL ') + msg); if (!cond) fails.push(msg); };

// ---------------------------------------------------------------- build twice
const a = buildOne();
const b2 = buildOne();
const s = stats(a.b);
const s2 = stats(b2.b);
const props = a.ctx.props.ring;
const fmt = (n) => Math.round(n).toLocaleString();

console.log('\n== station-ring / 环带外壳 ==\n');
console.log('triangle log', JSON.stringify(props.triLog));

// ---------------------------------------------------------------- 1. budget
console.log('\n[1] triangle budget');
ok(props && props.sectors === 12, 'ctx.props.ring.sectors === 12');
ok(s.tris >= TRI_MIN, 'triangles ' + fmt(s.tris) + ' >= ' + fmt(TRI_MIN) + ' (placeholder floor)');
ok(s.tris <= TRI_MAX, 'triangles ' + fmt(s.tris) + ' <= ' + fmt(TRI_MAX) + ' (module budget)');
ok(props.triLog.total === s.tris, 'triLog total ' + fmt(props.triLog.total) + ' matches the built soup ' + fmt(s.tris));
ok(s.tris > 90000, 'reads as a built station, not a stub: ' + fmt(s.tris) + ' > 90,000');

// ---------------------------------------------------------------- 2. envelope
console.log('\n[2] world envelope');
ok(s.rMax <= ENV.rMax, 'max radius ' + s.rMax + ' <= ' + ENV.rMax + ' (sails/masts inside the world)');
ok(s.rMax >= 820, 'sails reach out: max radius ' + s.rMax + ' >= 820');
ok(s.rMin >= ENV.rMin, 'min radius ' + s.rMin + ' >= ' + ENV.rMin + ' (nothing pokes into the hub)');
ok(s.yMax <= ENV.rMid, '|y| ' + s.yMax + ' <= ' + ENV.rMid + ' (radiators / masts / towers)');
ok(s.yMax >= 55, 'vertical silhouette present: |y| ' + s.yMax + ' >= 55');
console.log('  bbox', JSON.stringify(s.bbox));

// ---------------------------------------------------------------- 3. hygiene
console.log('\n[3] hygiene');
ok(s.nan === 0, 'no non-finite vertices');
ok(s.far === 0, 'no vertex beyond +-3000 m');
ok(s.dark === 0, 'no dead-black face: every emissive >= 0.015');
ok(s.badMat === 0, 'material [emissive,gloss] ranges legal');
ok(s.bad === 0 && s.badColor === 0 && s.badNormal === 0, 'no NaN vertex / bad colour / degenerate normal');
ok(s.stack === 1, 'matrix stack balanced (1 frame left)');

// ---------------------------------------------------------------- 4. the dock is a real hole
console.log('\n[4] docking port is a real opening');
const D = props.dock;
const mouthZ = D.mouthZ;                 // -646
const zFar = mouthZ - 220, zDeep = -470; // outside approach .. hub side
const innerHalfW = R_IN * Math.sin(D.halfAngleDeg * Math.PI / 180);
const through = [
  ['centre', 0, 0],
  ['left   ', -Math.min(22, innerHalfW - 4), 0],
  ['right  ', Math.min(22, innerHalfW - 4), 0],
  ['high   ', 0, 16],
  ['low    ', 0, -16],
];
let throughHits = 0;
const throughRes = [];
for (const [name, x, y] of through) {
  const h = rayHits(a.b, [x, y, zFar], [x, y, zDeep]).length;
  throughHits += h;
  throughRes.push(name.trim() + ':' + h);
}
ok(throughHits === 0, '5 rays straight through the mouth cross the band with 0 hits (' + throughRes.join(' ') + ')');
// a ray from the hub side out through the port: the tunnel is open end to end
const outHits = rayHits(a.b, [0, 0, zDeep], [0, 0, zFar]).length;
ok(outHits === 0, 'the tunnel is open from the hub side out too (' + outHits + ' hits)');
// rays that miss the mouth must hit the shell
const offsets = [
  ['+x flank', D.portalHalfW + 17, 0],
  ['-x flank', -(D.portalHalfW + 17), 0],
  ['above   ', 0, D.portalHalfH + 10],
  ['below   ', 0, -(D.portalHalfH + 10)],
];
let missHits = 0;
const missRes = [];
for (const [name, x, y] of offsets) {
  const h = rayHits(a.b, [x, y, zFar], [x, y, zDeep - 60]).length;
  if (h > 0) missHits++;
  missRes.push(name.trim() + ':' + h);
}
ok(missHits === offsets.length, 'rays missing the mouth all hit the shell (' + missRes.join(' ') + ')');
ok(Math.abs(D.portalHalfW - 35.2) < 1.5 && Math.abs(D.portalHalfH - 26) < 1.5, 'portal is about 70 m x 52 m (' + D.portalHalfW + ' x ' + (2 * D.portalHalfH) + ')');
ok(Math.abs(D.mouthZ + R_OUT) < 0.5, 'mouth plane sits on the outer shell (z=' + D.mouthZ + ')');
ok(D.tongueEndZ < mouthZ - 120, '150 m tongue reaches out (end z=' + D.tongueEndZ + ')');

// ---------------------------------------------------------------- 5. hub cavity
console.log('\n[5] hub cavity is empty');
const HUB_R = 420;
let hubVerts = 0;
for (let i = 0; i < a.b.v.length; i += 11) {
  const r = Math.hypot(a.b.v[i], a.b.v[i + 2]);
  if (r < HUB_R) hubVerts++;
}
ok(hubVerts === 0, 'no vertex inside r < ' + HUB_R + ' m (' + hubVerts + ' found) — the core owns that volume');

// ---------------------------------------------------------------- 6. windows / lights
console.log('\n[6] portholes and lights');
const W = props.windows;
ok(W.lit >= 200, 'lit portholes ' + fmt(W.lit) + ' >= 200');
ok(W.total > 0 && W.unlit / W.total <= 0.15, 'unlit portholes ' + (100 * W.unlit / W.total).toFixed(1) + '% <= 15% (' + W.unlit + '/' + W.total + ')');
ok(W.lit === W.warm + W.cyan, 'window bookkeeping adds up (' + W.warm + ' warm + ' + W.cyan + ' cyan)');
// count the lit glass geometrically: every window is one quad = 6 vertices of mat [0.85,0.10]
let glassVerts = 0, offVerts = 0;
const v = a.b.v;
for (let i = 0; i < v.length; i += 11) {
  if (v[i + 9] === 0.85 && v[i + 10] === 0.10) glassVerts++;
  if (v[i + 9] === 0.10 && v[i + 10] === 0.14) offVerts++;
}
ok(glassVerts / 6 === W.lit, 'lit window quads in the soup (' + (glassVerts / 6) + ') match the bookkeeping (' + W.lit + ')');
ok(offVerts / 6 === W.unlit, 'unlit window quads in the soup (' + (offVerts / 6) + ') match the bookkeeping (' + W.unlit + ')');
ok(a.ctx.points.length <= 8, 'point lights ' + a.ctx.points.length + ' <= 8');
let badLight = 0;
for (const q of a.ctx.points) {
  if (!q.p.every(Number.isFinite) || !q.col.every(Number.isFinite)) badLight++;
  else if (!(q.range >= 150 && q.range <= 400)) badLight++;
  else if (!(q.int > 0 && q.int <= 2)) badLight++;
}
ok(badLight === 0, 'point lights legal (range 150..400 m, 0 < int <= 2)');
ok(a.ctx.points.length >= 4, 'the dock / beacons really light the station (' + a.ctx.points.length + ' lights)');
let badLan = 0;
for (const l of a.ctx.lanterns) {
  if (!l.p.every(Number.isFinite) || !Number.isFinite(l.size)) badLan++;
  else if (!(l.size > 0 && l.size < 400) || !(l.shape >= 0 && l.shape <= 6)) badLan++;
}
ok(badLan === 0, 'static halos legal (' + a.ctx.lanterns.length + ' billboards)');

// ---------------------------------------------------------------- 7. determinism
console.log('\n[7] determinism');
let floatDiff = 0;
if (a.b.v.length !== b2.b.v.length) floatDiff = -1;
else for (let i = 0; i < a.b.v.length; i++) if (a.b.v[i] !== b2.b.v[i]) { floatDiff++; break; }
ok(a.b.v.length === b2.b.v.length, 'vertex count deterministic (' + (a.b.v.length / 11) + ')');
ok(floatDiff === 0, 'every vertex float identical across two builds');
ok(s.hash === s2.hash, 'FNV vertex hash identical (' + s.hash + ')');
ok(s.tris === s2.tris && JSON.stringify(s.bbox) === JSON.stringify(s2.bbox), 'tri count + bbox deterministic');

// ---------------------------------------------------------------- 8. ribs
console.log('\n[8] twelve ribs every 30 deg');
const ribs = props.ribs;
ok(Array.isArray(ribs) && ribs.length === 12, '12 ribs reported (' + (ribs ? ribs.length : 0) + ')');
let badRib = 0, dockFrames = 0;
if (ribs) {
  const degs = ribs.map((r) => ((r.angleDeg % 360) + 360) % 360).sort((x, y) => x - y);
  for (let k = 0; k < 12; k++) {
    const want = k * 30;
    const found = degs.some((d) => Math.abs(d - want) <= 2 || Math.abs(d - want + 360) <= 2 || Math.abs(d - want - 360) <= 2);
    if (!found) badRib++;
    if (degs.some((d) => (k === 9 ? d === 270 : false) && ribs.find((r) => r.angleDeg === 270 && r.kind === 'dock'))) dockFrames++;
  }
  void dockFrames;
}
ok(badRib === 0, 'rib angles are 30 deg apart (+-2 deg)');
const dockRib = ribs && ribs.find((r) => r.kind === 'dock');
ok(!!dockRib && Math.abs(((dockRib.angleDeg % 360) + 360) % 360 - 270) < 0.01, 'the rib at the dock is the monumental portal frame (270 deg)');

// ---------------------------------------------------------------- report
console.log('\nreport', JSON.stringify({
  tris: s.tris, verts: s.verts,
  triLog: props.triLog,
  bbox: s.bbox, radius: { min: s.rMin, max: s.rMax }, yMax: s.yMax,
  dock: props.dock,
  windows: props.windows,
  lights: a.ctx.points.length,
  lanterns: a.ctx.lanterns.length,
  deterministic: s.hash === s2.hash && floatDiff === 0,
}, null, 1));

if (fails.length) {
  console.log('\nFAIL\n - ' + fails.join('\n - '));
  process.exit(1);
}
console.log('\nPASS  station-ring: ' + fmt(s.tris) + ' tris, max radius ' + s.rMax + ' m, ' +
  fmt(W.lit) + ' lit portholes, dock open (5/5 through rays clear, 4/4 flank rays hit), ' +
  a.ctx.points.length + ' point lights, deterministic');
