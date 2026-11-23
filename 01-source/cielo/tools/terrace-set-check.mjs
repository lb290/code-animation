// Geometry-only checks for the painter's corner (easel + table/chairs + plants).
//   node tools/terrace-set-check.mjs
// No GL / no browser: a real B builder, a stub ctx and a fixed-seed mulberry32.
import { mulberry32 } from '../src/math.js';
import { B } from '../src/geo.js';
import { buildTerraceSet } from '../src/terrace-set.js';

const SEED = 20261121;

function makeCtx() {
  return { gl: null, points: [], lanterns: [], dyn: [], bbDyn: [], props: {}, triLog: {} };
}

function stats(b) {
  const v = b.v;
  let nan = 0, far = 0;
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let i = 0; i < v.length; i += 11) {
    for (let k = 0; k < 3; k++) {
      const x = v[i + k];
      if (!Number.isFinite(x)) nan++;
      if (x < mn[k]) mn[k] = x;
      if (x > mx[k]) mx[k] = x;
    }
    if (Math.abs(v[i]) > 3000 || Math.abs(v[i + 1]) > 3000 || Math.abs(v[i + 2]) > 3000) far++;
  }
  let badMat = 0;
  for (let i = 0; i < v.length; i += 11) {
    const e = v[i + 9], g = v[i + 10];
    if (!Number.isFinite(e) || !Number.isFinite(g) || e < 0 || e > 1.2 || g < 0 || g > 1) badMat++;
  }
  // raw vertex min horizontal distance to world points of interest
  const minXZ = (px, pz) => {
    let m = 1e9;
    for (let i = 0; i < v.length; i += 11) {
      const d = Math.hypot(v[i] - px, v[i + 2] - pz);
      if (d < m) m = d;
    }
    return m;
  };
  return {
    tris: b.i.length / 3, verts: v.length / 11, nan, far, badMat,
    stack: b.stack.length, bad: b.bad || 0, badColor: b.badColor || 0, badNormal: b.badNormal || 0,
    bbox: { min: mn.map((x) => +x.toFixed(3)), max: mx.map((x) => +x.toFixed(3)) },
    minXZ,
  };
}

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

// ---------------------------------------------------------------- build once
const ctx = makeCtx();
const b = new B();
buildTerraceSet(b, ctx, mulberry32(SEED));
const s = stats(b);

// 1. budget + non-empty
ok(s.tris > 0, 'no triangles');
ok(s.tris >= 8000, 'below the 8k floor: ' + s.tris);
ok(s.tris <= 30000, 'over the 30k budget: ' + s.tris);

// 2. found on the deck: all feet on y = 30 (deck paving tops at 30.03), nothing floating away
ok(s.bbox.min[1] > 29.99 && s.bbox.min[1] < 30.06, 'feet not on the deck: ymin=' + s.bbox.min[1]);
ok(s.bbox.max[1] > 33.5, 'nothing tall enough to read (tree missing?): ymax=' + s.bbox.max[1]);
// 3. bbox inside the agreed envelope
ok(s.bbox.min[0] >= -34 && s.bbox.max[0] <= 34, 'bbox x out of [-34,34]: ' + JSON.stringify(s.bbox));
ok(s.bbox.min[1] >= 29.9 && s.bbox.max[1] <= 35.2, 'bbox y out of [29.9,35.2]: ' + JSON.stringify(s.bbox));
ok(s.bbox.min[2] >= 87 && s.bbox.max[2] <= 124, 'bbox z out of [87,124]: ' + JSON.stringify(s.bbox));

// 4. no NaN / far / bad colour / bad material / degenerate normal / stack leak
ok(s.nan === 0, 'non-finite vertices: ' + s.nan);
ok(s.far === 0, 'far vertices: ' + s.far);
ok(s.badColor === 0, 'bad colours: ' + s.badColor);
ok(s.bad === 0, 'bad (NaN) verts: ' + s.bad);
ok(s.badMat === 0, 'bad material arrays: ' + s.badMat);
ok(s.badNormal === 0, 'degenerate normals: ' + s.badNormal);
ok(s.stack === 1, 'matrix stack depth ' + s.stack + ' (expected 1)');

// 5. keep clear of the girl (3,30,86.1 r 1.1) and the black cat (4.22,30,86.1 r 0.6)
const dGirl = s.minXZ(3.0, 86.1);
const dCat = s.minXZ(4.22, 86.1);
ok(dGirl > 1.6, 'a vertex is only ' + dGirl.toFixed(2) + ' m from the girl (min 1.6)');
ok(dCat > 1.2, 'a vertex is only ' + dCat.toFixed(2) + ' m from the cat (min 1.2)');
// 6. the existing terrace furniture and lamps stay clear
for (const [name, px, pz, rad] of [
  ['urn L', -12.6, 86.6, 0.9], ['urn R', 12.6, 86.6, 0.9],
  ['urn far L', -28.5, 88.2, 0.9], ['urn far R', 28.5, 88.2, 0.9],
  ['pot L', -33.5, 90.8, 0.9], ['pot R', 33.5, 90.8, 0.9],
  ['pot 2L', -16.5, 91.4, 0.9], ['pot 2R', 16.5, 91.4, 0.9],
  ['lamp L', -20.0, 87.2, 0.9], ['lamp R', 20.0, 87.2, 0.9],
]) {
  const d = s.minXZ(px, pz);
  ok(d > rad, 'overlaps the existing ' + name + ' (distance ' + d.toFixed(2) + ' < ' + rad + ')');
}
// 6b. the two palace-front planters (lead: x 22..33, z 122.3) must clear the portico
// columns at x = +/-16.9 (r 0.86) and stop before the corner pavilions at |x| = 39.
let frontMinAbsX = 1e9, frontMaxAbsX = -1, frontZmin = 1e9, frontZmax = -1e9, frontVerts = 0;
for (let i = 0; i < b.v.length; i += 11) {
  const x = b.v[i], y = b.v[i + 1], z = b.v[i + 2];
  if (z > 118 && y > 29.9) {
    frontVerts++;
    const ax = Math.abs(x);
    if (ax < frontMinAbsX) frontMinAbsX = ax;
    if (ax > frontMaxAbsX) frontMaxAbsX = ax;
    if (z < frontZmin) frontZmin = z;
    if (z > frontZmax) frontZmax = z;
  }
}
ok(frontVerts > 0, 'no palace-front planter geometry found');
ok(frontMinAbsX > 20.6, 'palace-front planter reaches into the portico columns (min |x|=' + frontMinAbsX.toFixed(2) + ')');
ok(frontMaxAbsX < 38.0, 'palace-front planter runs into the corner pavilion (max |x|=' + frontMaxAbsX.toFixed(2) + ')');
ok(frontZmin > 118.5 && frontZmax < 123.9, 'palace-front planter z out of range: ' + frontZmin.toFixed(2) + '..' + frontZmax.toFixed(2));

// 7. stay inland of the curved balustrade (the copy of terrace.js railZ)
function railZ(x) {
  const ax = Math.abs(x);
  if (ax >= 34) return 93.0;
  return 93.0 - 9.0 * Math.pow(Math.cos((Math.PI * 0.5 * ax) / 34), 1.3);
}
let railBad = 0, railMin = 1e9;
for (let i = 0; i < b.v.length; i += 11) {
  const x = b.v[i], z = b.v[i + 2];
  if (Math.abs(x) > 46) continue;
  const gap = z - railZ(x);
  if (gap < railMin) railMin = gap;
  if (gap < 0.6) railBad++;
}
ok(railBad === 0, railBad + ' verts inside/next to the balustrade (min gap ' + railMin.toFixed(2) + ' m)');

// 8. deterministic for the same seed
const b2 = new B();
buildTerraceSet(b2, makeCtx(), mulberry32(SEED));
const s2 = stats(b2);
ok(s2.tris === s.tris, 'non-deterministic triangle count: ' + s.tris + ' vs ' + s2.tris);
ok(s2.bbox.min[0] === s.bbox.min[0] && s2.bbox.max[1] === s.bbox.max[1] && s2.bbox.max[2] === s.bbox.max[2], 'non-deterministic bbox');
ok(s2.verts === s.verts, 'non-deterministic vertex count');

// 9. a different seed must still produce valid, stable geometry
const b3 = new B();
buildTerraceSet(b3, makeCtx(), mulberry32(7));
const s3 = stats(b3);
ok(s3.nan === 0 && s3.stack === 1 && s3.tris > 8000 && s3.badColor === 0 && s3.badNormal === 0, 'second seed build invalid');
ok(s3.bbox.min[1] > 29.99 && s3.bbox.min[1] < 30.06, 'second seed feet not on the deck');

// 10. the build must not need ctx (outdoor daylight set) and must leave ctx alone
ok(ctx.points.length === 0 && ctx.lanterns.length === 0, 'unexpected ctx side effects');

const report = {
  tris: s.tris, verts: s.verts,
  tris_per_m2: +(s.tris / ((28 - -28) * (124 - 87))).toFixed(2),
  bbox: s.bbox,
  deck_foot_ymin: s.bbox.min[1],
  stack: s.stack, bad: s.bad, badColor: s.badColor, badNormal: s.badNormal, badMat: s.badMat, farVerts: s.far, nan: s.nan,
  clear_girl_m: +dGirl.toFixed(2), clear_cat_m: +dCat.toFixed(2), rail_min_gap_m: +railMin.toFixed(2),
  palace_front_planter: { min_abs_x: +frontMinAbsX.toFixed(2), max_abs_x: +frontMaxAbsX.toFixed(2), z: [+frontZmin.toFixed(2), +frontZmax.toFixed(2)] },
  deterministic: s2.tris === s.tris,
  ctx: { points: ctx.points.length, lanterns: ctx.lanterns.length },
};
console.log(JSON.stringify(report, null, 2));
if (fails.length) {
  console.log('FAIL\n - ' + fails.join('\n - '));
  process.exit(1);
}
console.log('PASS  terrace-set: ' + s.tris + ' tris, bbox ' + JSON.stringify(s.bbox) + ', no NaN/badColor/badNormal, stack 1, deterministic, girl clear ' + dGirl.toFixed(2) + ' m');
