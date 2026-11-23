// Geometry-only checks for the round-3 girl + bouquet + cat (no GL / no browser).
//   node tools/hero-check.mjs
import { mulberry32 } from '../src/math.js';
import { B } from '../src/geo.js';
import { buildHero, girlGeom, catGeom, HERO_ANCHOR } from '../src/hero.js';

function stats(b) {
  const v = b.v;
  let nan = 0, far = 0;
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let i = 0; i < v.length; i += 11) {
    for (let k = 0; k < 3; k++) {
      const x = v[i + k];
      if (!Number.isFinite(x)) nan++;
      mn[k] = Math.min(mn[k], x); mx[k] = Math.max(mx[k], x);
    }
    if (Math.abs(v[i]) > 3000 || Math.abs(v[i + 1]) > 3000 || Math.abs(v[i + 2]) > 3000) far++;
  }
  let badMat = 0;
  for (let i = 0; i < v.length; i += 11) {
    const e = v[i + 9], g = v[i + 10];
    if (!Number.isFinite(e) || !Number.isFinite(g) || e < 0 || e > 1.2 || g < 0 || g > 1) badMat++;
  }
  return {
    tris: b.i.length / 3, verts: v.length / 11, nan, far, badMat,
    stack: b.stack.length, bad: b.bad || 0, badColor: b.badColor || 0, badNormal: b.badNormal || 0,
    bbox: { min: mn.map((x) => +x.toFixed(3)), max: mx.map((x) => +x.toFixed(3)) },
  };
}

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

// ---- full build through the world entry point
const ctx = { points: [] };
const b = new B();
buildHero(b, ctx, mulberry32(20261121));
const s = stats(b);

// 1. budget + non-empty
ok(s.tris > 0, 'no triangles');
ok(s.tris <= 18000, 'over the 18k triangle budget: ' + s.tris);
// 2. bbox sane: girl is ~1.62 m tall, anchored on the deck at (3, 30, ~86.1)
// the girl's own height (the cat sits 1.2 m up on the rail, so use girlGeom for this)
const bgEarly = new B();
girlGeom(bgEarly, mulberry32(20261121));
const sgEarly = stats(bgEarly);
const height = sgEarly.bbox.max[1] - sgEarly.bbox.min[1];
ok(s.bbox.min[1] > 29.99 && s.bbox.min[1] < 30.05, 'feet not on the deck: ymin=' + s.bbox.min[1]);
ok(height > 1.52 && height < 1.68, 'girl height out of range: ' + height.toFixed(3));
ok(s.bbox.max[1] < 31.203 + 0.50, 'something floats above the rail top: ' + s.bbox.max[1]);
ok(Math.abs(3 - (s.bbox.min[0] + s.bbox.max[0]) / 2) < 1.4, 'x centroid too far from 3');
ok(Math.abs(86.1 - (s.bbox.min[2] + s.bbox.max[2]) / 2) < 1.2, 'z centroid too far from 86.1');
// 3. no NaN, no bad colours, no far verts, no zero-area normals
ok(s.nan === 0, 'non-finite vertices: ' + s.nan);
ok(s.far === 0, 'far vertices: ' + s.far);
ok(s.badColor === 0, 'bad colours: ' + s.badColor);
ok(s.bad === 0, 'bad (NaN) verts: ' + s.bad);
ok(s.badMat === 0, 'bad material arrays: ' + s.badMat);
ok(s.badNormal === 0, 'degenerate normals: ' + s.badNormal);
// 4. push / pop balanced
ok(s.stack === 1, 'matrix stack depth ' + s.stack + ' (expected 1)');
// 5. deterministic for the same seed
const b2 = new B();
buildHero(b2, { points: [] }, mulberry32(20261121));
const s2 = stats(b2);
ok(s2.tris === s.tris, 'non-deterministic triangle count: ' + s.tris + ' vs ' + s2.tris);
ok(s2.bbox.max[1] === s.bbox.max[1] && s2.bbox.min[0] === s.bbox.min[0], 'non-deterministic bbox');
// different seed must still be valid geometry (and not require Math.random)
const b3 = new B();
buildHero(b3, { points: [] }, mulberry32(7));
const s3 = stats(b3);
ok(s3.nan === 0 && s3.stack === 1 && s3.tris > 0, 'second seed build invalid');

// ---- sub-parts: girl and cat separately (each must be sane on its own)
const bg = new B();
girlGeom(bg, mulberry32(20261121));
const sg = stats(bg);
ok(sg.tris > 0 && sg.nan === 0 && sg.stack === 1 && sg.badColor === 0, 'girlGeom invalid');
ok(sg.bbox.max[1] - sg.bbox.min[1] > 1.5, 'girl shorter than 1.5 m');
const bc = new B();
catGeom(bc, mulberry32(20261121));
const sc = stats(bc);
ok(sc.tris > 0 && sc.nan === 0 && sc.stack === 1 && sc.badColor === 0, 'catGeom invalid');
ok(sc.bbox.max[1] < 0.55, 'cat taller than 0.55 m: ' + sc.bbox.max[1]);
// lighting hooks
ok(ctx.points.length >= 1 && ctx.points.every((p) => p.p.every(Number.isFinite) && p.col.every(Number.isFinite)), 'bad point light');

const report = {
  tris_total: s.tris, verts: s.verts,
  tris_girl: sg.tris, tris_cat: sc.tris, tris_lights: 0,
  height_m: +(height).toFixed(3),
  bbox: s.bbox,
  stack: s.stack, bad: s.bad, badColor: s.badColor, badNormal: s.badNormal, farVerts: s.far,
  deterministic: s2.tris === s.tris,
  lights: ctx.points.length,
  anchor: HERO_ANCHOR,
};
console.log(JSON.stringify(report, null, 2));
if (fails.length) { console.log('FAIL\n - ' + fails.join('\n - ')); process.exit(1); }
console.log('PASS  hero: ' + s.tris + ' tris (' + sg.tris + ' girl + ' + sc.tris + ' cat), height ' + height.toFixed(2) + ' m, no NaN/badColor/far verts, stack 1, deterministic');
