// Geometry-only checks for the two wing halls carved out of the palace wings (round 6).
//   node tools/palace-rooms-check.mjs
//
// Asserts:
//   - triangle budget of src/palace-rooms.js (100k..220k) and clean geometry (no NaN/stack leak)
//   - each hall's bbox stays inside its wing envelope (x +-20..53, y 30..46, z 124..158)
//   - the shell carved by palace.js leaves the two room cavities empty (no leftover vertices)
//   - the new entrances are real openings: a ray from 6 m outside each door reaches the hall
//     centre, and a fly-through box through each doorway is empty
//   - per-hall point-light count <= 8, lantern count <= 20
//   - determinism (same hash twice) and rng discipline (buildPalace draws 0 shared rng values,
//     palace-rooms does not touch a shared rng either)
import { mulberry32 } from '../src/math.js';
import { B } from '../src/geo.js';
import { buildPalace, palaceParts } from '../src/palace.js';
import { buildWingRooms, ROOM } from '../src/palace-rooms.js';

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

// triangle soup segment query (Moller-Trumbore with AABB prefilter), same as palace-check.mjs
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

// count vertices inside an axis-aligned box
function vertsInBox(v, x0, x1, y0, y1, z0, z1) {
  let n = 0;
  for (let i = 0; i < v.length; i += 11) {
    const x = v[i], y = v[i + 1], z = v[i + 2];
    if (x > x0 && x < x1 && y > y0 && y < y1 && z > z0 && z < z1) n++;
  }
  return n;
}

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

// world-space room boxes (mirrored by side: +1 east library, -1 west banqueting hall)
const CX = ROOM.cx, CZ = ROOM.cz, HW = ROOM.hx;
function sideBox(s, lx0, lx1, y0, y1, lz0, lz1) {
  const xa = s * (CX + lx0), xb = s * (CX + lx1);
  const za = CZ + lz0, zb = CZ + lz1;
  return [Math.min(xa, xb), Math.max(xa, xb), y0, y1, Math.min(za, zb), Math.max(za, zb)];
}

// ------------------------------------------------------------------ 1. the rooms module
const roomStats = [];
const roomCtx = { points: [], lanterns: [] };
for (const s of [1, -1]) {
  const b = new B();
  const p0 = roomCtx.points.length, l0 = roomCtx.lanterns.length;
  buildWingRooms(b, roomCtx, s);
  const st = stats(b);
  st.side = s;
  st.points = roomCtx.points.length - p0;
  st.lanterns = roomCtx.lanterns.length - l0;
  roomStats.push(st);
  ok(st.stack === 1, 'side ' + s + ': matrix stack leaks (' + st.stack + ')');
  ok(st.nan === 0 && st.bad === 0, 'side ' + s + ': non-finite vertices (' + (st.nan + st.bad) + ')');
  ok(st.badColor === 0, 'side ' + s + ': bad colours (' + st.badColor + ')');
  ok(st.badMat === 0, 'side ' + s + ': bad material arrays (' + st.badMat + ')');
  ok(st.badNormal === 0, 'side ' + s + ': degenerate normals (' + st.badNormal + ')');
  ok(st.far === 0, 'side ' + s + ': far vertices (' + st.far + ')');
  ok(st.tris > 30000, 'side ' + s + ': only ' + st.tris + ' tris (hall looks unfinished)');
  // bbox inside the wing / room envelope
  const tol = 0.75;
  const xmin = Math.min(s * 20.0, s * 39.5), xmax = Math.max(s * 20.0, s * 39.5);
  ok(st.bbox.min[0] > xmin - tol && st.bbox.max[0] < xmax + tol, 'side ' + s + ': x out of the wing envelope: ' + JSON.stringify(st.bbox));
  ok(st.bbox.min[1] > ROOM.floorY - tol && st.bbox.max[1] < ROOM.ceilY + tol, 'side ' + s + ': y out of the room envelope: ' + JSON.stringify(st.bbox));
  ok(st.bbox.min[2] > 124.0 && st.bbox.max[2] < 158.0, 'side ' + s + ': z out of the wing envelope: ' + JSON.stringify(st.bbox));
  // nothing may poke into the flight corridor through the doorway (world x +-3.2 around the door)
  const doorC = s * ROOM.door.cx;
  const dx0 = doorC - 3.2, dx1 = doorC + 3.2;
  const doorHits = vertsInBox(b.v, Math.min(dx0, dx1), Math.max(dx0, dx1), 31.2, 36.2, 123.4, 125.2);
  ok(doorHits === 0, 'side ' + s + ': doorway corridor blocked by ' + doorHits + ' room vertices');
  // lighting budget per hall
  ok(st.points >= 4 && st.points <= 8, 'side ' + s + ': ' + st.points + ' point lights (want 4..8)');
  ok(st.lanterns <= 20, 'side ' + s + ': ' + st.lanterns + ' lantern billboards (want <= 20)');
}
const roomTris = roomStats.reduce((a, s) => a + s.tris, 0);
ok(roomTris >= 100000, 'palace-rooms under the 100k triangle budget: ' + roomTris);
ok(roomTris <= 220000, 'palace-rooms over the 220k triangle budget: ' + roomTris);

// determinism of the rooms module
{
  const h = [];
  for (let k = 0; k < 2; k++) {
    const b = new B();
    buildWingRooms(b, { points: [], lanterns: [] }, 1);
    buildWingRooms(b, { points: [], lanterns: [] }, -1);
    h.push(stats(b).hash);
  }
  ok(h[0] === h[1], 'palace-rooms is not deterministic: ' + h[0] + ' vs ' + h[1]);
}

// rng discipline: palace-rooms must not draw from a shared rng
{
  const before = [];
  const p0 = mulberry32(4242);
  for (let k = 0; k < 3; k++) before.push(p0());
  const p1 = mulberry32(4242);
  const b = new B();
  buildWingRooms(b, { points: [], lanterns: [] }, 1);
  buildWingRooms(b, { points: [], lanterns: [] }, -1);
  const after = [];
  for (let k = 0; k < 3; k++) after.push(p1());
  ok(after[0] === before[0] && after[1] === before[1] && after[2] === before[2], 'palace-rooms consumed the shared rng sequence');
}

// ------------------------------------------------------------------ 2. palace.js shell + full build
const ctx = { points: [], lanterns: [] };
const bFull = new B();
buildPalace(bFull, ctx, mulberry32(SEED));
const full = stats(bFull);
ok(full.badColor === 0 && full.bad === 0, 'full palace build has bad geometry');

// shell only: every part except the two hall parts -> must leave both cavities empty
const shell = new B();
const partTris = {};
for (const [name, fn] of palaceParts) {
  const pb = new B();
  fn(pb, { points: [], lanterns: [] }, mulberry32(SEED));
  partTris[name] = pb.i.length / 3;
  if (name === 'libraryR' || name === 'banquetL') continue;
  // concatenate the shell parts (no spread: the buffers are hundreds of thousands of floats)
  for (let k = 0; k < pb.v.length; k++) shell.v.push(pb.v[k]);
  for (let k = 0; k < pb.i.length; k++) shell.i.push(pb.i[k] + shell.n);
  shell.n += pb.v.length / 11;
}
ok(partTris.libraryR > 0 && partTris.banquetL > 0, 'the two hall parts are missing from palaceParts');
const shellTris = Object.entries(partTris).filter(([k]) => k !== 'libraryR' && k !== 'banquetL').reduce((a, [, v]) => a + v, 0);
ok(shellTris >= 60000 && shellTris <= 130000, 'palace shell out of the 60k..130k budget: ' + shellTris);
const litTris = partTris.libraryR + partTris.banquetL;
ok(litTris === roomTris, 'palaceParts hall count (' + litTris + ') != rooms module (' + roomTris + ')');

// cavity emptiness: the carved shell must not leave anything inside either hall
const cavStats = [];
for (const s of [1, -1]) {
  // x 21.4..38.1 / y 31.0..43.4 / z 125.6..156.4 in hall-local coordinates
  const box = sideBox(s, -HW + 0.7, HW - 0.7, 31.0, 43.4, -15.4, 15.4);
  const hits = vertsInBox(shell.v, box[0], box[1], box[2], box[3], box[4], box[5]);
  cavStats.push(hits);
  ok(hits === 0, 'side ' + s + ': ' + hits + ' leftover shell vertices inside the hall cavity');
}

// ------------------------------------------------------------------ 3. entrances are real openings
const fly = {};
for (const s of [1, -1]) {
  const dc = s * ROOM.door.cx;
  const zOut = ROOM.door.z0 - 6.0;             // 6 m in front of the facade (z = 118)
  const zc = ROOM.cz;
  const centre = segHits(bFull, [dc, 32.6, zOut], [dc, 33.0, zc]);
  const wide1 = segHits(bFull, [dc - 2.2 * s, 32.6, zOut], [dc - 2.2 * s, 33.0, zc]);
  const wide2 = segHits(bFull, [dc + 2.2 * s, 32.6, zOut], [dc + 2.2 * s, 33.0, zc]);
  const high = segHits(bFull, [dc, 35.6, zOut], [dc, 35.6, 132]);
  fly[s] = { centre, wide1, wide2, high };
  ok(centre === 0, 'side ' + s + ': flying in from 6 m outside hits ' + centre + ' faces on the way to the hall centre');
  ok(wide1 === 0 && wide2 === 0, 'side ' + s + ': the 7.6 m entrance is not fully open (' + wide1 + '/' + wide2 + ' hits)');
  ok(high === 0, 'side ' + s + ': the upper part of the arch head is blocked (' + high + ' hits)');
}

// doorway clearance box (full build): world coordinates
let doorBoxHits = 0;
for (const s of [1, -1]) {
  const dc = s * ROOM.door.cx;
  const x0 = Math.min(dc - 3.2, dc + 3.2), x1 = Math.max(dc - 3.2, dc + 3.2);
  const n = vertsInBox(bFull.v, x0, x1, 30.7, 36.2, 123.1, 125.6);
  doorBoxHits += n;
}
ok(doorBoxHits === 0, 'doorway clearance box blocked: ' + doorBoxHits + ' vertices in x dc+-3.2 / y 30.7..36.2 / z 123.1..125.6');

// ------------------------------------------------------------------ 4. rng discipline of palace.js
const rngA = mulberry32(97531);
const want = [rngA(), rngA()];
const rngB = mulberry32(97531);
const bR = new B();
buildPalace(bR, { points: [] }, rngB);
const got = [rngB(), rngB()];
ok(got[0] === want[0] && got[1] === want[1], 'palace.js consumed shared rng draws (' + got + ' vs ' + want + ')');

// ------------------------------------------------------------------ 5. determinism of the full build
{
  const b2 = new B();
  buildPalace(b2, { points: [] }, mulberry32(SEED));
  const s2 = stats(b2);
  ok(s2.tris === full.tris, 'non-deterministic palace triangle count: ' + full.tris + ' vs ' + s2.tris);
  ok(s2.hash === full.hash, 'non-deterministic palace vertex hash');
  ok(JSON.stringify(s2.bbox) === JSON.stringify(full.bbox), 'non-deterministic palace bbox');
}

const report = {
  room_tris: roomTris,
  room_tris_each: { libraryR: roomStats[0].tris, banquetL: roomStats[1].tris },
  room_bbox: { libraryR: roomStats[0].bbox, banquetL: roomStats[1].bbox },
  hall_lights: { library: roomStats[0].points, banquet: roomStats[1].points },
  hall_lanterns: { library: roomStats[0].lanterns, banquet: roomStats[1].lanterns },
  shell_tris: shellTris,
  palace_tris: full.tris,
  cavity_leftovers: cavStats,
  entrance_rays: fly,
  doorway_box_hits: doorBoxHits,
  deterministic: true,
};
console.log(JSON.stringify(report, null, 2));
if (fails.length) { console.log('FAIL\n - ' + fails.join('\n - ')); process.exit(1); }
console.log('PASS  palace-rooms: ' + roomTris + ' tris in two halls (library ' + roomStats[0].tris +
  ', banquet ' + roomStats[1].tris + '), cavities empty, both entrances flyable, deterministic');
