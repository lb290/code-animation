// Geometry-only checks for the enterable palace shell (no GL / no browser).
//   node tools/palace-check.mjs
import { mulberry32 } from '../src/math.js';
import { B } from '../src/geo.js';
import { buildPalace, palaceParts } from '../src/palace.js';

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

// triangle soup query: does the segment p0->p1 hit any triangle? (Moller-Trumbore, with AABB prefilter)
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

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

const ctx = { points: [] };
const b = new B();
buildPalace(b, ctx, mulberry32(SEED));
const s = stats(b);

// 1. budget + stack
// round 6: the two wing halls (palace-rooms.js) are built inside buildPalace, so the total
// now contains them. The 60k..130k palace budget is asserted on the SHELL below (all parts
// except libraryR / banquetL) and the rooms have their own 100k..220k budget.
ok(s.tris >= 60000, 'under the 60k triangle budget: ' + s.tris);
ok(s.tris <= 370000, 'over the 370k total triangle budget: ' + s.tris);
ok(s.stack === 1, 'matrix stack depth ' + s.stack + ' (expected 1)');
// 2. clean geometry
ok(s.nan === 0, 'non-finite vertices: ' + s.nan);
ok(s.far === 0, 'far vertices: ' + s.far);
ok(s.bad === 0, 'bad (NaN) verts: ' + s.bad);
ok(s.badColor === 0, 'bad colours: ' + s.badColor);
ok(s.badMat === 0, 'bad material arrays: ' + s.badMat);
ok(s.badNormal <= 0, 'degenerate (zero-area) normals: ' + s.badNormal);
// 3. bounding box
ok(s.bbox.min[0] >= -57 && s.bbox.max[0] <= 57, 'x out of [-57,57]: ' + JSON.stringify(s.bbox));
ok(s.bbox.min[1] >= -1 && s.bbox.max[1] <= 84, 'y out of [-1,84]: ' + JSON.stringify(s.bbox));
ok(s.bbox.min[2] >= 94 && s.bbox.max[2] <= 184, 'z out of [94,184]: ' + JSON.stringify(s.bbox));
ok(s.bbox.max[1] > 74, 'dome does not rise above the body: ymax=' + s.bbox.max[1]);
ok(s.bbox.max[1] < 79.5, 'something pokes above the dome: ymax=' + s.bbox.max[1]);
// 4a. legacy clearance box of the portal
let portalHits = 0;
for (let i = 0; i < b.v.length; i += 11) {
  const x = b.v[i], y = b.v[i + 1], z = b.v[i + 2];
  if (Math.abs(x) < 3.9 && y > 30.3 && y < 47.6 && z > 124.2 && z < 128.8) portalHits++;
}
ok(portalHits === 0, 'portal passage blocked: ' + portalHits + ' vertices inside the clearance box');
// 4b. the walk-through corridor below the arch springing (43.5) is completely clear.
// NOTE: a real barrel vault necessarily has its shoulders below y=46 once |x| > 3.9
// (the semicircle through x=4.4 sits at y=44.84), so the vertex test covers the volume
// a visitor can occupy; the centre-line fly-through is additionally ray-tested below.
let passageHits = 0;
for (let i = 0; i < b.v.length; i += 11) {
  const x = b.v[i], y = b.v[i + 1], z = b.v[i + 2];
  if (Math.abs(x) < 3.8 && y > 30.5 && y < 43.4 && z > 124.2 && z < 130.6) passageHits++;
}
ok(passageHits === 0, 'entrance passage blocked: ' + passageHits + ' vertices in x+-3.8 / y 30.5..43.4 / z 124.2..130.6');
// 4c. a straight flight through the door and across the hall hits nothing
const flyIn = segHits(b, [0, 32, 118], [0, 33, 140]);
ok(flyIn === 0, 'a camera flying (0,32,118)->(0,33,140) hits ' + flyIn + ' faces');
const throughHall = segHits(b, [0, 33.5, 130], [0, 36, 158.5]);
ok(throughHall === 0, 'crossing the hall (0,33.5,130)->(0,36,158.5) hits ' + throughHall + ' faces');
// 4d. the rear apse opening + the tall arched rear window are real openings
const apseOpen = segHits(b, [0, 40, 150], [0, 40, 164.3]);
ok(apseOpen === 0, 'apse opening blocked: ' + apseOpen + ' faces on the sight line');
const rearWin = segHits(b, [0, 40, 164.4], [0, 40, 166.5]);
ok(rearWin === 1, 'rear window should be one glowing pane behind the shell, got ' + rearWin + ' faces');
const rearWall = segHits(b, [0, 50, 160], [0, 50, 166]);
ok(rearWall >= 1, 'rear wall above the window is missing (the window hole is too tall)');
// 5. rotunda is hollow (no geometry inside r=11 of the room centre)
let hallHits = 0;
for (let i = 0; i < b.v.length; i += 11) {
  const dx = b.v[i] - 0, dy = b.v[i + 1] - 44, dz = b.v[i + 2] - 144;
  if (dx * dx + dy * dy + dz * dz < 11 * 11) hallHits++;
}
ok(hallHits === 0, 'hall cavity invaded: ' + hallHits + ' vertices inside r=11 of (0,44,144)');
// 6. every part must be present and clean
const partTris = {};
let sum = 0;
for (const [name, fn] of palaceParts) {
  const pb = new B();
  fn(pb, { points: [] }, mulberry32(SEED));
  const ps = stats(pb);
  partTris[name] = ps.tris;
  sum += ps.tris;
  ok(ps.stack === 1, 'part ' + name + ' leaks the matrix stack: ' + ps.stack);
  ok(ps.nan === 0, 'part ' + name + ' has non-finite vertices');
  ok(ps.badColor === 0, 'part ' + name + ' has bad colours');
}
ok(sum === s.tris, 'part triangles (' + sum + ') do not add up to the whole (' + s.tris + ')');
// round 6: split the two budgets -- shell (palace.js proper) vs the two wing halls
const roomTris = (partTris.libraryR || 0) + (partTris.banquetL || 0);
const shellTris = sum - roomTris;
ok(shellTris >= 60000 && shellTris <= 130000, 'palace shell out of the 60k..130k budget: ' + shellTris);
ok(roomTris >= 100000 && roomTris <= 220000, 'palace rooms out of the 100k..220k budget: ' + roomTris);
// 7. deterministic with the same seed
const b2 = new B();
buildPalace(b2, { points: [] }, mulberry32(SEED));
const s2 = stats(b2);
ok(s2.tris === s.tris, 'non-deterministic triangle count: ' + s.tris + ' vs ' + s2.tris);
ok(s2.hash === s.hash, 'non-deterministic vertex hash');
ok(JSON.stringify(s2.bbox) === JSON.stringify(s.bbox), 'non-deterministic bbox');
const b3 = new B();
buildPalace(b3, { points: [] }, mulberry32(7));
const s3 = stats(b3);
ok(s3.nan === 0 && s3.stack === 1 && s3.tris > 0 && s3.badColor === 0, 'second seed build invalid');
// 8. lighting
// round 6: the two wing halls (library / banqueting hall) add their own warm fill lights
ok(ctx.points.length >= 6 && ctx.points.length <= 24, 'expected 6-24 warm lights (facade + two wing halls), got ' + ctx.points.length);
ok(ctx.points.every((p) => p.p.every(Number.isFinite) && p.col.every(Number.isFinite) && p.range > 0 && p.int > 0 && p.int <= 1), 'bad point light');

const report = {
  tris_total: s.tris, verts: s.verts, tris_shell: shellTris, tris_rooms: roomTris,
  parts: partTris,
  bbox: s.bbox,
  stack: s.stack, bad: s.bad, badColor: s.badColor, badNormal: s.badNormal, farVerts: s.far,
  portalBoxHits: portalHits, passageBoxHits: passageHits,
  flyThroughHits: flyIn, hallCrossHits: throughHall, rearWindowHits: rearWin,
  hallCavityHits: hallHits,
  deterministic: s2.tris === s.tris && s2.hash === s.hash,
  lights: ctx.points.length,
};
console.log(JSON.stringify(report, null, 2));
if (fails.length) { console.log('FAIL\n - ' + fails.join('\n - ')); process.exit(1); }
console.log('PASS  palace: ' + s.tris + ' tris (shell ' + shellTris + ' + wings ' + roomTris + '), bbox ' + JSON.stringify(s.bbox) + ', door passable, hall hollow, rear window open, stack 1, deterministic');
