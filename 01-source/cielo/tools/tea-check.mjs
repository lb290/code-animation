// Geometry-only checks for the round-10 tea pavilion (no GL / no browser).
//   node tools/tea-check.mjs
// Checks the module on its own: tri budget, local bbox, matrix-stack balance, determinism,
// point lights, billboards, and a few "must be there" height samples.
import { mulberry32 } from '../src/math.js';
import { B } from '../src/geo.js';
import { buildTeaPavilion } from '../src/tea-pavilion.js';
import { L } from '../src/layout.js';

const SEED = 20261124;
const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

function stats(b) {
  const v = b.v;
  let nan = 0, far = 0, badMat = 0, zeroN = 0;
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
    if (!Number.isFinite(v[i + 3]) || !Number.isFinite(v[i + 4]) || !Number.isFinite(v[i + 5])) zeroN++;
  }
  let h = 2166136261;
  for (let i = 0; i < v.length; i += 7) h = Math.imul(h ^ Math.round(v[i] * 1024), 16777619) >>> 0;
  return { tris: b.i.length / 3, verts: v.length / 11, nan, far, badMat, zeroN, hash: h,
    stack: b.stack.length, bad: b.bad || 0, badColor: b.badColor || 0, badNormal: b.badNormal || 0,
    bbox: { min: mn.map((x) => +x.toFixed(3)), max: mx.map((x) => +x.toFixed(3)) } };
}

const ctx = { points: [], lanterns: [] };
const b = new B();
buildTeaPavilion(b, ctx, mulberry32(SEED));
const s = stats(b);

ok(s.tris >= 8000, 'module is suspiciously light: ' + s.tris + ' tris');
ok(s.tris <= 55000, 'over the 55k static triangle budget: ' + s.tris);
ok(s.stack === 1, 'leaks the matrix stack: ' + s.stack);
ok(s.nan === 0, 'non-finite vertices: ' + s.nan);
ok(s.zeroN === 0, 'non-finite normals: ' + s.zeroN);
ok(s.far === 0, 'far vertices: ' + s.far);
ok(s.bad === 0, 'NaN verts: ' + s.bad);
ok(s.badColor === 0, 'bad colours: ' + s.badColor);
ok(s.badNormal === 0, 'degenerate normals: ' + s.badNormal);
ok(s.badMat === 0, 'bad material arrays: ' + s.badMat);

// local bbox (the module pushes L.tea, so subtract it back out)
const A = L.tea;
const lmn = [1e9, 1e9, 1e9], lmx = [-1e9, -1e9, -1e9];
for (let i = 0; i < b.v.length; i += 11) {
  const p = [b.v[i] - A.x, b.v[i + 1] - A.y, b.v[i + 2] - A.z];
  for (let k = 0; k < 3; k++) { lmn[k] = Math.min(lmn[k], p[k]); lmx[k] = Math.max(lmx[k], p[k]); }
}
const lbb = { min: lmn.map((x) => +x.toFixed(2)), max: lmx.map((x) => +x.toFixed(2)) };
console.log('local bbox', JSON.stringify(lbb));
ok(lmx[0] < 32 && lmn[0] > -32, 'x span suspicious: ' + JSON.stringify(lbb));
ok(lbb.max[1] <= 16 && lbb.max[1] >= 12, 'finial top should be ~14-15 m: ' + lbb.max[1]);
ok(lbb.min[1] <= -35 && lbb.min[1] >= -52, 'island keel should hang to -40..-48: ' + lbb.min[1]);
ok(lbb.min[2] > -32 && lbb.max[2] < 32, 'z span suspicious: ' + JSON.stringify(lbb));

// determinism (the seed passed in must be ignored: the module owns its rng)
const b2 = new B();
buildTeaPavilion(b2, { points: [], lanterns: [] }, mulberry32(7));
const s2 = stats(b2);
ok(s2.tris === s.tris, 'triangle count is not deterministic: ' + s.tris + ' vs ' + s2.tris);
ok(s2.hash === s.hash, 'vertex hash is not deterministic');
ok(JSON.stringify(s2.bbox) === JSON.stringify(s.bbox), 'bbox is not deterministic');

// lights
ok(ctx.points.length <= 6, 'pushes ' + ctx.points.length + ' point lights (max 6)');
ok(ctx.points.every((p) => p.p.every(Number.isFinite) && p.col.every(Number.isFinite) && p.range > 0 && p.int > 0 && p.int <= 1.2), 'bad point light');
ok(ctx.points.every((p) => {
  const l = [p.p[0] - A.x, p.p[1] - A.y, p.p[2] - A.z];
  return Math.hypot(l[0], l[2]) < 30 && l[1] > -36 && l[1] < 16;
}), 'point light outside the pavilion');

// billboards
ok(ctx.lanterns.length >= 40 && ctx.lanterns.length <= 400, 'billboard count ' + ctx.lanterns.length + ' (expected 40..400)');
ok(ctx.lanterns.every((l) => l.p.every(Number.isFinite) && l.col && l.col.length === 3 && l.size > 0 && l.alpha > 0 && l.alpha <= 1), 'bad billboard');
ok(ctx.lanterns.every((l) => l.shape === 1 || l.shape === 2), 'billboard shape must be 1 or 2');
const big = ctx.lanterns.filter((l) => l.size > 38).length;
ok(big === 0, 'billboards bigger than 38 m near the island: ' + big);

// contents sanity: verts exist at the deck, on the table plane and up at the finial
const has = (pred) => {
  for (let i = 0; i < b.v.length; i += 11) if (pred(b.v[i] - A.x, b.v[i + 1] - A.y, b.v[i + 2] - A.z, b.v[i + 9])) return true;
  return false;
};
ok(has((x, y) => Math.abs(y) < 0.02 && Math.hypot(x, 0) < 14.6), 'no terrace deck at y~0');
ok(has((x, y) => y > 0.95 && y < 1.1 && Math.abs(x) > 4.5 && Math.abs(x) < 6.2), 'no tea table top');
ok(has((x, y) => y > 12.5 && Math.abs(x) < 0.6), 'no finial lantern');
ok(has((x, y, z) => y < -30 && Math.hypot(x, z) < 3), 'no island keel');
ok(has((x, y, z, em) => em > 0.7 && y > 1 && y < 6), 'no strong emissive lamp in the pavilion');

console.log('tris ' + s.tris + '  verts ' + s.verts);
console.log('lights ' + ctx.points.length + '  billboards ' + ctx.lanterns.length);
if (fails.length) {
  console.log('\nFAIL (' + fails.length + ')');
  for (const f of fails) console.log('  - ' + f);
  process.exit(1);
}
console.log('\nall tea-pavilion checks passed');
