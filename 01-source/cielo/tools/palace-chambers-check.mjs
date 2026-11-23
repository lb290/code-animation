// Geometry-only checks for the palace's rear suite (no GL / no browser).
//   node tools/palace-chambers-check.mjs
// Asserts: triangle budget, envelope, matrix stack, no NaN / bad colour / bad
// material, every room's centre column is hollow, every room is enclosed by
// inward-facing walls, the hall centre can see every room centre through the
// three doorways (0 hits against the hall *and* the suite), the lighting budget,
// and determinism (the module owns its local RNG).
import { B } from '../src/geo.js';
import { mulberry32 } from '../src/math.js';
import { buildPalaceBase, BASE_METRICS as MB } from '../src/palace-base.js';
import { buildPalaceChambers, CHAMBER_METRICS as MC } from '../src/palace-chambers.js';
import { buildPalace } from '../src/palace.js';

const SEED = 20261123;
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

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
// Moller-Trumbore, returns the list of hits with the triangle normal
function rayHits(b, p0, p1, wantFirst) {
  const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const lo = [Math.min(p0[0], p1[0]), Math.min(p0[1], p1[1]), Math.min(p0[2], p1[2])];
  const hi = [Math.max(p0[0], p1[0]), Math.max(p0[1], p1[1]), Math.max(p0[2], p1[2])];
  const V = b.v;
  let n = 0, best = null;
  for (let t = 0; t < b.i.length; t += 3) {
    const ia = b.i[t] * 11, ib = b.i[t + 1] * 11, ic = b.i[t + 2] * 11;
    const ax = V[ia], ay = V[ia + 1], az = V[ia + 2];
    const bx = V[ib], by = V[ib + 1], bz = V[ib + 2];
    const cx = V[ic], cy = V[ic + 1], cz = V[ic + 2];
    if (Math.max(ax, bx, cx) < lo[0] || Math.min(ax, bx, cx) > hi[0]) continue;
    if (Math.max(ay, by, cy) < lo[1] || Math.min(ay, by, cy) > hi[1]) continue;
    if (Math.max(az, bz, cz) < lo[2] || Math.min(az, bz, cz) > hi[2]) continue;
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-9) continue;
    const inv = 1 / det;
    const tvx = p0[0] - ax, tvy = p0[1] - ay, tvz = p0[2] - az;
    const u = (tvx * px + tvy * py + tvz * pz) * inv;
    if (u < -1e-6 || u > 1 + 1e-6) continue;
    const qx = tvy * e1z - tvz * e1y, qy = tvz * e1x - tvx * e1z, qz = tvx * e1y - tvy * e1x;
    const vv = (d[0] * qx + d[1] * qy + d[2] * qz) * inv;
    if (vv < -1e-6 || u + vv > 1 + 1e-6) continue;
    const tt = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (tt <= 2e-4 || tt >= 1 - 2e-4) continue;
    n++;
    if (wantFirst) {
      const nn = Math.hypot(V[ia + 3], V[ia + 4], V[ia + 5]) || 1;
      const N = [V[ia + 3] / nn, V[ia + 4] / nn, V[ia + 5] / nn];
      if (!best || tt < best.t) best = { t: tt, N, p: [p0[0] + d[0] * tt, p0[1] + d[1] * tt, p0[2] + d[2] * tt] };
    }
  }
  return wantFirst ? { n, first: best } : n;
}
function vertsIn(b, x0, x1, y0, y1, z0, z1) {
  let n = 0;
  for (let i = 0; i < b.v.length; i += 11) {
    const x = b.v[i], y = b.v[i + 1], z = b.v[i + 2];
    if (x > x0 && x < x1 && y > y0 && y < y1 && z > z0 && z < z1) n++;
  }
  return n;
}
// combined ray test: the hall (base) + the suite
const cy = { points: [], lanterns: [] };
const cb = new B();
buildPalaceChambers(cb, cy, mulberry32(SEED));
const s = stats(cb);
const M = MC;

// 1. budget + stack + clean geometry
ok(s.tris >= 30000, 'under the 30k triangle floor: ' + s.tris);
// round 9: 音乐沙龙彩色宇宙顶 + 宇宙收藏展墙（+14k），模块上限随之上调
ok(s.tris <= 175000, 'over the 175k triangle budget: ' + s.tris);
ok(s.stack === 1, 'matrix stack depth ' + s.stack + ' (expected 1)');
ok(s.nan === 0, 'non-finite vertices: ' + s.nan);
ok(s.far === 0, 'far vertices: ' + s.far);
ok(s.bad === 0, 'bad (NaN) verts: ' + s.bad);
ok(s.badColor === 0, 'bad colours: ' + s.badColor);
ok(s.badMat === 0, 'bad material arrays: ' + s.badMat);
ok(s.badNormal === 0, 'degenerate (zero-area) normals: ' + s.badNormal);

// 2. envelope: inside the podium, outside the hall void, roof left on top
ok(s.bbox.min[0] >= -44 && s.bbox.max[0] <= 44, 'x out of [-44,44]: ' + JSON.stringify(s.bbox));
ok(s.bbox.min[1] >= -0.6 && s.bbox.max[1] <= 28, 'y out of [-0.6,28]: ' + JSON.stringify(s.bbox));
ok(s.bbox.min[2] >= 122.1 && s.bbox.max[2] <= 181.5, 'z out of [122.1,181.5]: ' + JSON.stringify(s.bbox));
// nothing pokes into the round-5 hall void (z < 122.2)
ok(vertsIn(cb, -60, 60, -1, 30, 90, 122.19) === 0, 'geometry intrudes into the entrance hall void');

// 3. every room: the centre column above 1.2 m is hollow, the centre point is clear
for (const [name, c] of M.centres) {
  const n = vertsIn(cb, c[0] - 3.4, c[0] + 3.4, 1.2, 8.0, c[2] - 3.4, c[2] + 3.4);
  ok(n === 0, name + ': centre column is not hollow (' + n + ' vertices)');
}

// 4. each room is enclosed: from 1 m inside every face a ray reaches a surface
//    within 2.6 m whose normal faces back at the room (inward normals).
//    The probe position along each wall is chosen to sit on a solid pier.
// probe x positions sit on a solid pier of the wall they test
const ENCL = {
  gallery: { zA: -12.5, zB: -30.5, wallY: 4.6 },
  stair: { zA: 8.6, zB: 8.5, wallY: 14.5 },
  garden: { zA: 8.5, zB: 0.0, wallY: 4.6 },
  study: { zA: -30.5, zB: -20.0, wallY: 4.6 },
  salon: { zA: 30.5, zB: 20.0, wallY: 4.6 },
};
for (const [name, c] of M.centres) {
  const R = M.rooms[name];
  const E = ENCL[name];
  const midZ = (R.z0 + R.z1) / 2, midX = (R.x0 + R.x1) / 2;
  const probes = [
    ['floor', [c[0] + 0.9, MC.floorY + 1.0, midZ + 0.9], [0, -1, 0]],
    ['floor', [c[0] - 0.9, MC.floorY + 1.0, midZ - 0.9], [0, -1, 0]],
    ['ceiling', [c[0] + 0.9, R.ceil - 1.0, midZ + 0.9], [0, 1, 0]],
    ['ceiling', [c[0] - 0.9, R.ceil - 1.0, midZ - 0.9], [0, 1, 0]],
    ['wall -X', [R.x0 + 1.0, E.wallY, midZ], [-1, 0, 0]],
    ['wall -X', [R.x0 + 1.0, E.wallY, midZ + (R.z1 - R.z0) * 0.3], [-1, 0, 0]],
    ['wall +X', [R.x1 - 1.0, E.wallY, midZ], [1, 0, 0]],
    ['wall +X', [R.x1 - 1.0, E.wallY, midZ - (R.z1 - R.z0) * 0.3], [1, 0, 0]],
    ['wall -Z', [E.zA, E.wallY, R.z0 + 1.0], [0, 0, -1]],
    ['wall +Z', [E.zB, E.wallY, R.z1 - 1.0], [0, 0, 1]],
  ];
  for (const [label, p, dir] of probes) {
    const far = [p[0] + dir[0] * 3.0, p[1] + dir[1] * 3.0, p[2] + dir[2] * 3.0];
    const hit = rayHits(cb, p, far, true);
    if (!hit.first) { fails.push(name + ' ' + label + ': no surface within 3 m from ' + JSON.stringify(p.map((v) => +v.toFixed(2)))); continue; }
    const d = -(hit.first.N[0] * dir[0] + hit.first.N[1] * dir[1] + hit.first.N[2] * dir[2]);
    ok(d > 0.3, name + ' ' + label + ': surface normal faces away from the room (normal ' +
      hit.first.N.map((v) => v.toFixed(2)) + ' vs ray ' + dir + ')');
    const dist = Math.hypot(hit.first.p[0] - p[0], hit.first.p[1] - p[1], hit.first.p[2] - p[2]);
    ok(dist < (label === 'floor' || label === 'ceiling' ? 2.2 : 2.6), name + ' ' + label + ': surface too far (' + dist.toFixed(2) + ' m)');
  }
}

// 5. the hall centre sees every room centre through the three doorways.
//    The test runs against the hall (palace-base) + the suite together.
const hb = new B();
const hctx = { points: [], lanterns: [] };
buildPalaceBase(hb, hctx, mulberry32(20261122));
for (const [name, c] of M.centres) {
  const n1 = rayHits(hb, M.hallCentre, c, false);
  const n2 = rayHits(cb, M.hallCentre, c, false);
  ok(n1 + n2 === 0, 'sight line hall -> ' + name + ' blocked (' + n1 + ' hall + ' + n2 + ' suite faces)');
}

// 6. the carved podium must not wall the three doorways: fly in through each
const doorPts = [
  [M.doors.grand.x, 4.0, 122.2], [M.doors.sides[0].x, 3.6, 122.2], [M.doors.sides[1].x, 3.6, 122.2],
];
const pb = new B();
buildPalace(pb, { points: [], lanterns: [] }, mulberry32(7));
for (const p of doorPts) {
  const a = [p[0], p[1], 120.0], c2 = [p[0], p[1], 126.2];
  ok(rayHits(pb, a, c2, false) === 0, 'the podium (palace.js) blocks the doorway at x=' + p[0]);
}

// 7. lighting budget + validity
ok(cy.points.length >= 10 && cy.points.length <= 18, 'point lights out of 10..18: ' + cy.points.length);
ok(cy.points.every((p) => p.p.every(Number.isFinite) && p.col.every(Number.isFinite) &&
  p.range > 0 && p.int > 0 && p.int <= 1), 'bad point light');
ok(cy.lanterns.length >= 6, 'expected some candle billboards, got ' + cy.lanterns.length);
ok(cy.lanterns.every((l) => l.p.every(Number.isFinite) && l.size > 0 && l.alpha > 0 && l.col.every(Number.isFinite)), 'bad lantern');

// 8. determinism (a different shared seed must not change anything)
const cb2 = new B();
buildPalaceChambers(cb2, { points: [], lanterns: [] }, mulberry32(SEED));
const s2 = stats(cb2);
ok(s2.tris === s.tris, 'non-deterministic triangle count: ' + s.tris + ' vs ' + s2.tris);
ok(s2.hash === s.hash, 'non-deterministic vertex hash');
ok(JSON.stringify(s2.bbox) === JSON.stringify(s.bbox), 'non-deterministic bbox');
const cb3 = new B();
buildPalaceChambers(cb3, { points: [], lanterns: [] }, mulberry32(7));
ok(stats(cb3).hash === s.hash, 'the module draws from the shared rng (hash changed with a different seed)');

// 9. per-zone triangle report
const zoneTris = {};
for (const [name, R] of Object.entries(M.rooms)) {
  let n = 0;
  for (let t = 0; t < cb.i.length; t += 3) {
    let k = 0;
    for (const vv of [0, 1, 2]) {
      const o = cb.i[t + vv] * 11;
      const x = cb.v[o], y = cb.v[o + 1], z = cb.v[o + 2];
      if (x >= R.x0 - 2.0 && x <= R.x1 + 2.0 && z >= R.z0 - 2.0 && z <= R.z1 + 2.0 && y > R.z0 * 0 - 1) k++;
    }
    if (k === 3) n++;
  }
  zoneTris[name] = n;
}

const report = {
  tris_total: s.tris, verts: s.verts, zones: zoneTris, bbox: s.bbox,
  stack: s.stack, nan: s.nan, far: s.far, bad: s.bad, badColor: s.badColor, badNormal: s.badNormal, badMat: s.badMat,
  hallLights: hctx.points.length, lights: cy.points.length, lanterns: cy.lanterns.length,
  deterministic: s2.hash === s.hash && stats(cb3).hash === s.hash,
};
console.log(JSON.stringify(report, null, 2));
if (fails.length) { console.log('FAIL\n - ' + fails.join('\n - ')); process.exit(1); }
console.log('PASS  palace-chambers: ' + s.tris + ' tris, bbox ' + JSON.stringify(s.bbox) +
  ', 5 rooms hollow + enclosed, sight lines clear, stack 1, deterministic');
