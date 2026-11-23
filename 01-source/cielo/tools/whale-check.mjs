// Geometry-only checks for the whale + its back city (no GL needed).
//   node tools/whale-check.mjs
import { mulberry32 } from '../src/math.js';
import { buildWhale } from '../src/whale.js';

const ctx = { gl: null, dyn: [], bbDyn: [], points: [], lanterns: [] };
const rng = mulberry32(20261121);
const r = buildWhale(null, ctx, rng);
const b = r.wb;
const v = b.v;

let nan = 0, far = 0;
let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
for (let i = 0; i < v.length; i += 11) {
  const p = [v[i], v[i + 1], v[i + 2]];
  for (let k = 0; k < 3; k++) {
    if (!Number.isFinite(p[k])) nan++;
    mn[k] = Math.min(mn[k], p[k]);
    mx[k] = Math.max(mx[k], p[k]);
  }
  if (Math.abs(p[0]) > 3000 || Math.abs(p[1]) > 3000 || Math.abs(p[2]) > 3000) far++;
}
const stack = b.stack.length;
console.log(JSON.stringify({
  tris: r.tris,
  verts: v.length / 11,
  badNonFinite: nan,
  farVerts: far,
  stackDepth: stack,
  bbox: { min: mn.map((x) => +x.toFixed(2)), max: mx.map((x) => +x.toFixed(2)) },
  zeroNormals: b.badNormal || 0,
}, null, 2));

// deterministic re-build
const r2 = buildWhale(null, ctx, mulberry32(20261121));
console.log('deterministic:', r2.tris === r.tris);
