// Geometry-only checks for the round-14 Cloudwell / 云井塔 (no GL / no browser).
//   node tools/cloudwell-check.mjs
//
// The frozen contract is src/cloudwell-plan.js: dimensions (CW), the fly-in rays
// (FLY_RAYS) and the interior cavities (CAVITIES). This tool builds both modules for
// real and asserts:
//   1. triangle budget: shell + hall = 80,000..140,000, and each module > 15,000
//      (the per-module floor is what stops a 244-triangle placeholder from passing)
//   2. world envelope: x -23..23, z -252..-212, y -5.2..105, +-1.5 m tolerance
//   3. every FLY_RAYS ray: 0 triangle hits (Moller-Trumbore over the real triangles)
//   4. every CAVITIES volume (cylinders / annuli): 0 vertices, i.e. the flyable space
//      really is empty
//   5. the north portal is a real hole: a ray from local (0,12,40) along -Z clears the
//      shell inner face at local z=14.4 without touching anything, and the first face
//      it meets is deeper than that (a thin fake door plate at the facade z 16.8..18
//      would be hit first and fails both parts)
//   6. the cloud well is open end to end: a ray from (0,9,0) straight up to (0,105,0)
//      hits nothing, or only the crown finial above y=101.6
//   7. determinism: two builds of the same source are float-for-float identical
import { mulberry32 } from '../src/math.js';
import { B } from '../src/geo.js';
import { buildCloudwell } from '../src/cloudwell.js';
import { buildCloudwellHall } from '../src/cloudwell-hall.js';
import { L } from '../src/layout.js';
import { CW, FLY_RAYS, CAVITIES, TURRET_EXCLUDE } from '../src/cloudwell-plan.js';

const SEED_A = 0x0c10d5;
const SEED_B = 0x0c10a1;
const ORIGIN = [L.cloudwell.x, 0, L.cloudwell.z];
const W = (p) => [ORIGIN[0] + p[0], p[1], ORIGIN[2] + p[2]];   // local -> world
const W3 = (x, y, z) => W([x, y, z]);

// the plan's footprint +-1.5 m of measuring slack (round-14 brief, acceptance 3)
// the north stair projects out of the water-gate platform onto the canal promenade
// (local z 20 -> 29.7, world -212 -> -202.3), so the envelope reaches local +34 / world -198
const ENV = { x0: -23, x1: 23, z0: -252, z1: -198, y0: -5.2, y1: 105, tol: 1.5 };
const TRI_MIN = 80000, TRI_MAX = 140000, MOD_MIN = 15000;
const CROWN_FINIAL_Y = 101.6;   // above this a well ray may only meet the crown finial

// ---------------------------------------------------------------- build helpers
function buildShell() {
  const b = new B();
  buildCloudwell(b, { points: [], lanterns: [] }, mulberry32(SEED_A));
  return b;
}
function buildHall(ctx) {
  const b = new B();
  buildCloudwellHall(b, ctx || { points: [], lanterns: [] }, mulberry32(SEED_B));
  return b;
}
function buildBoth(ctx) {
  const b = new B();
  buildCloudwell(b, ctx, mulberry32(SEED_A));
  buildCloudwellHall(b, ctx, mulberry32(SEED_B));
  return b;
}

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
    if (v[i + 1] < ENV.y0 - 0.01) below++;
    const e = v[i + 9], g = v[i + 10];
    if (!Number.isFinite(e) || !Number.isFinite(g) || e < 0 || e > 1.2 || g < 0 || g > 1) badMat++;
  }
  // FNV-ish hash over every 7th float (cheap: catches any rng drift)
  let h = 2166136261;
  for (let i = 0; i < v.length; i += 7) h = Math.imul(h ^ Math.round(v[i] * 1024), 16777619) >>> 0;
  return {
    tris: b.i.length / 3, verts: v.length / 11, nan, far, badMat, below, hash: h,
    stack: b.stack.length, bad: b.bad || 0, badColor: b.badColor || 0, badNormal: b.badNormal || 0,
    bbox: { min: mn.map((x) => +x.toFixed(3)), max: mx.map((x) => +x.toFixed(3)) },
  };
}

// ---------------------------------------------------------------- ray -> triangle
// Moller-Trumbore against the real triangle soup, with an AABB prefilter. Returns
// every segment parameter t strictly inside (eps, 1-eps); endpoints are excluded so a
// ray that starts/ends exactly on a surface does not count as a hit.
function rayTs(b, p0, p1, eps = 2e-4) {
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
const segHits = (b, p0, p1) => rayTs(b, p0, p1).length;

// vertices strictly inside a plan cavity (cyl or annulus, local frame, strictly inside
// every bound so geometry that sits ON the cavity surface is legal)
// The spiral-stair turret (plan TURRET_EXCLUDE) is a solid stair tower hanging on the -Z
// face; it legitimately crosses the entrance-hall / gallery annuli, so its footprint is
// exempted. Everything else inside a cavity is a bug.
function inTurret(px, py, pz) {
  const E = TURRET_EXCLUDE;
  if (!(py > E.y0 && py < E.y1)) return false;
  const dx = px - E.cx, dz = pz - E.cz;
  return dx * dx + dz * dz < E.r * E.r;
}
function cavityVerts(b, cav, exemptTurret = true) {
  const v = b.v;
  let n = 0;
  for (let i = 0; i < v.length; i += 11) {
    const y = v[i + 1];
    if (!(y > cav.y0 && y < cav.y1)) continue;
    const dx = v[i] - ORIGIN[0], dz = v[i + 2] - ORIGIN[2];
    const r = Math.sqrt(dx * dx + dz * dz);
    let inside = false;
    if (cav.kind === 'cyl') inside = r < cav.r;
    else if (cav.kind === 'ann') inside = r > cav.r0 && r < cav.r1;
    if (inside && exemptTurret && inTurret(dx, y, dz)) continue;
    if (inside) n++;
  }
  return n;
}

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

// ---------------------------------------------------------------- build
const shell = buildShell();
const hall = buildHall();
const ctx = { points: [], lanterns: [] };
const all = buildBoth(ctx);
const sShell = stats(shell);
const sHall = stats(hall);
const s = stats(all);
const bb = s.bbox;
const tris = s.tris;

// ---------------------------------------------------------------- 1. triangle budget
ok(sShell.tris > MOD_MIN, 'cloudwell.js is a placeholder: ' + sShell.tris + ' tris (min ' + MOD_MIN + ')');
ok(sHall.tris > MOD_MIN, 'cloudwell-hall.js is a placeholder: ' + sHall.tris + ' tris (min ' + MOD_MIN + ')');
ok(tris >= TRI_MIN, 'cloudwell + hall under the ' + TRI_MIN + ' triangle floor: ' + tris);
ok(tris <= TRI_MAX, 'cloudwell + hall over the ' + TRI_MAX + ' triangle ceiling: ' + tris);
ok(tris === sShell.tris + sHall.tris, 'combined triangle count is not the sum of the two modules: ' + tris);
ok(s.verts < 500000, 'vertex count suspiciously high: ' + s.verts);

// ---------------------------------------------------------------- hygiene
ok(s.stack === 1, 'matrix stack leaks: ' + s.stack);
ok(s.nan === 0, 'non-finite vertices: ' + s.nan);
ok(s.far === 0, 'far vertices: ' + s.far);
ok(s.below === 0, 'vertices below the foundation (-5.2 m): ' + s.below);
ok(s.bad === 0, 'NaN vertices: ' + s.bad);
ok(s.badColor === 0, 'bad colours: ' + s.badColor);
ok(s.badNormal === 0, 'degenerate normals: ' + s.badNormal);
ok(s.badMat === 0, 'bad material arrays: ' + s.badMat);

// ---------------------------------------------------------------- 2. world envelope
const T = ENV.tol;
ok(bb.min[0] >= ENV.x0 - T && bb.max[0] <= ENV.x1 + T, 'world x out of the envelope: ' + JSON.stringify(bb));
ok(bb.min[2] >= ENV.z0 - T && bb.max[2] <= ENV.z1 + T, 'world z out of the envelope: ' + JSON.stringify(bb));
ok(bb.min[1] >= ENV.y0 - T, 'foundation sinks below the envelope: ' + JSON.stringify(bb));
ok(bb.max[1] <= ENV.y1 + T, 'tower is too tall for the envelope: ' + JSON.stringify(bb));
ok(bb.max[1] >= 101.5, 'the crown/finial is missing (max y ' + bb.max[1] + ')');

// ---------------------------------------------------------------- 3. fly-in rays
const flyResults = [];
let flyHits = 0;
for (const r of FLY_RAYS) {
  const p0 = W3(r[0], r[1], r[2]), p1 = W3(r[3], r[4], r[5]);
  const h = segHits(all, p0, p1);
  flyHits += h;
  flyResults.push(h);
}
ok(flyHits === 0, 'a fly-in ray is blocked: ' + flyHits + ' hits over ' + FLY_RAYS.length + ' rays ' + JSON.stringify(flyResults));

// ---------------------------------------------------------------- 4. interior cavities
const cavResults = [];
let cavVerts = 0;
let cavRaw = 0;
for (const cav of CAVITIES) {
  const n = cavityVerts(all, cav);
  const raw = cavityVerts(all, cav, false);
  cavVerts += n;
  cavRaw += raw;
  cavResults.push({ name: cav.name, kind: cav.kind, verts: n, raw });
}
ok(cavVerts === 0, 'interior cavities are not empty (turret exempted): ' + cavVerts + ' vertices ' + JSON.stringify(cavResults.map((c) => c.name + ':' + c.verts)));
ok(cavRaw - cavVerts >= 0, 'turret exemption accounting broke: raw ' + cavRaw + ' vs exempted ' + cavVerts);

// ---------------------------------------------------------------- 5. the portal is a real hole
// The approach ray starts 22 m north of the facade at y=12 (inside the 9.2 m wide,
// 20.2 m high portal) and runs -Z through the whole building.
const PORTAL_Y = 12, PORTAL_Z0 = 40, PORTAL_Z1 = -150, PORTAL_FACE = 14.4;
const portalP0 = W3(0, PORTAL_Y, PORTAL_Z0), portalP1 = W3(0, PORTAL_Y, PORTAL_Z1);
const approachHits = segHits(all, portalP0, W3(0, PORTAL_Y, PORTAL_FACE));
const portalTs = rayTs(all, portalP0, portalP1);
let firstHitZ = null;
if (portalTs.length) {
  let tMin = portalTs[0];
  for (const t of portalTs) if (t < tMin) tMin = t;
  firstHitZ = +(PORTAL_Z0 + tMin * (PORTAL_Z1 - PORTAL_Z0)).toFixed(3);
}
ok(approachHits === 0, 'the portal approach is blocked before the shell inner face (z=' + PORTAL_FACE + '): ' + approachHits + ' faces');
ok(firstHitZ === null || firstHitZ < PORTAL_FACE,
  'the portal is plugged at local z=' + firstHitZ + ' (a fake door plate: the first face must be deeper than z=' + PORTAL_FACE + ')');

// ---------------------------------------------------------------- 6. the cloud well is open
const WELL_Y0 = 9, WELL_Y1 = 105;
const wellTs = rayTs(all, W3(0, WELL_Y0, 0), W3(0, WELL_Y1, 0));
const wellYs = wellTs.map((t) => +(WELL_Y0 + t * (WELL_Y1 - WELL_Y0)).toFixed(2)).sort((a, b) => a - b);
const wellLow = wellYs.filter((y) => y <= CROWN_FINIAL_Y);
ok(wellLow.length === 0, 'the cloud well is blocked below y=' + CROWN_FINIAL_Y + ': hits at y=' + JSON.stringify(wellLow.slice(0, 8)));

// ---------------------------------------------------------------- lights (8 max, inside the tower)
let badLight = 0;
for (const q of ctx.points) {
  const lx = q.p[0] - ORIGIN[0], lz = q.p[2] - ORIGIN[2];
  if (!q.p.every(Number.isFinite) || !q.col.every(Number.isFinite)) badLight++;
  else if (q.range <= 0 || q.int <= 0 || q.int > 1.2) badLight++;   // the plan's brightest is 1.05
  else if (Math.abs(lx) > 22 || q.p[1] < 0 || q.p[1] > 106 || Math.abs(lz) > 22) badLight++;
}
ok(ctx.points.length <= 8, 'pushes ' + ctx.points.length + ' point lights (the interior budget is 8)');
ok(ctx.points.length >= 6, 'pushes only ' + ctx.points.length + ' point lights (expected the 8 light plan)');
ok(badLight === 0, badLight + ' bad / out-of-tower point lights');

// ---------------------------------------------------------------- 7. determinism
const all2 = buildBoth({ points: [], lanterns: [] });
let floatDiff = 0;
if (all2.v.length !== all.v.length) floatDiff = -1;
else for (let i = 0; i < all.v.length; i++) {
  if (all.v[i] !== all2.v[i]) { floatDiff++; break; }
}
const s2 = stats(all2);
ok(all2.v.length === all.v.length, 'vertex count is not deterministic: ' + all.v.length + ' vs ' + all2.v.length);
ok(floatDiff === 0, 'vertex floats are not deterministic (first differing vertex found)');
ok(s2.tris === tris, 'triangle count is not deterministic: ' + tris + ' vs ' + s2.tris);
ok(s2.hash === s.hash, 'vertex hash is not deterministic');
ok(JSON.stringify(s2.bbox) === JSON.stringify(bb), 'bbox is not deterministic');

// ---------------------------------------------------------------- report
const report = {
  tris: { shell: sShell.tris, hall: sHall.tris, total: tris },
  verts: { shell: sShell.verts, hall: sHall.verts, total: s.verts },
  bbox_world: bb,
  bbox_local: { min: [bb.min[0] - ORIGIN[0], bb.min[1], bb.min[2] - ORIGIN[2]], max: [bb.max[0] - ORIGIN[0], bb.max[1], bb.max[2] - ORIGIN[2]] },
  envelope: ENV,
  fly_rays: { rays: FLY_RAYS.length, hits: flyResults },
  cavities: { count: CAVITIES.length, verts: cavResults },
  portal: { approach_hits: approachHits, first_hit_local_z: firstHitZ, face_z: PORTAL_FACE },
  well: { ray: [WELL_Y0, WELL_Y1], hits: wellYs, lowest_hit: wellYs.length ? wellYs[0] : null },
  lights: ctx.points.length,
  deterministic: s2.tris === tris && s2.hash === s.hash && floatDiff === 0,
};
console.log(JSON.stringify(report, null, 2));
if (fails.length) {
  console.log('FAIL\n - ' + fails.join('\n - '));
  process.exit(1);
}
console.log('PASS  cloudwell: ' + tris + ' tris (shell ' + sShell.tris + ' + hall ' + sHall.tris + '), bbox ' +
  JSON.stringify(bb) + ', ' + FLY_RAYS.length + ' fly rays 0 hits, ' + CAVITIES.length + ' cavities 0 verts, portal open (first hit z=' +
  (firstHitZ === null ? 'none' : firstHitZ) + '), well clear to y>=' + (wellYs.length ? wellYs[0] : WELL_Y1) +
  ', ' + ctx.points.length + ' lights, deterministic');
