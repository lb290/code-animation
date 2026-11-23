// Building geometry audit: builds every machiya LOD level and reports triangle
// counts, bounds, degenerate normals and registered billboards.
// usage: node tools/buildings-check.mjs
import { B } from '../src/geo.js';
import { buildMachiya } from '../src/buildings.js';
import { mulberry32 } from '../src/math.js';

const CASES = [
  { detail: 2, floors: 1, w: 5.2, d: 4.6 },
  { detail: 2, floors: 2, w: 6.2, d: 5.2 },
  { detail: 2, floors: 3, w: 7.0, d: 5.6 },
  { detail: 1, floors: 2, w: 5.6, d: 4.8 },
  { detail: 0, floors: 2, w: 5.0, d: 4.4 },
];
let fail = 0;
for (const c of CASES) {
  const b = new B();
  const ctx = { lanterns: [], points: [], additive: [], beams: [], falls: [] };
  const info = buildMachiya(b, ctx, mulberry32(7 + c.w), c);
  let nonFinite = 0, zeroN = 0, minY = 1e9, maxY = -1e9, minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (let i = 0; i < b.v.length; i += 11) {
    const x = b.v[i], y = b.v[i + 1], z = b.v[i + 2];
    if (!isFinite(x) || !isFinite(y) || !isFinite(z)) nonFinite++;
    if (Math.hypot(b.v[i + 3], b.v[i + 4], b.v[i + 5]) < 1e-5) zeroN++;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  const ok = nonFinite === 0 && zeroN === 0 && b.triCount > 0 && isFinite(info.h);
  if (!ok) fail++;
  console.log(
    (ok ? 'PASS' : 'FAIL'),
    'detail', c.detail, 'floors', info.floors, 'tris', String(b.triCount).padStart(5),
    'lanterns', String(ctx.lanterns.length).padStart(2), 'points', ctx.points.length,
    'x', minX.toFixed(1), maxX.toFixed(1), 'y', minY.toFixed(2), maxY.toFixed(2), 'z', minZ.toFixed(1), maxZ.toFixed(1),
    'nonFinite', nonFinite, 'zeroN', zeroN
  );
}
// LOD budget guard (03-notes/building-spec.md §5.2; a 3-storey hero is ~4.7k)
const budgets = { 2: 5200, 1: 1600, 0: 400 };
for (const c of CASES) {
  const b = new B();
  const ctx = { lanterns: [], points: [], additive: [], beams: [], falls: [] };
  buildMachiya(b, ctx, mulberry32(11), c);
  if (b.triCount > budgets[c.detail]) { fail++; console.log('FAIL budget detail', c.detail, b.triCount, '>', budgets[c.detail]); }
}
console.log(fail ? 'FAILURES: ' + fail : 'PASS — all building geometry checks green');
process.exit(fail ? 1 : 0);
