// Health check for the whale-back city module — runs on plain node, no GL.
//   node tools/backcity-check.mjs
// Builds the module twice with the same seed and validates the hard constraints:
// tri budget, push/pop balance, finite vertices/normals, bounds, determinism.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { B } from '../src/geo.js';
import { mulberry32 } from '../src/math.js';
import { buildBackCity } from '../src/whale-city.js';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const srcPath = path.join(here, '../src/whale-city.js');
const SEED = 20261121;
const fails = [];
const warns = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

function build(seed) {
  const b = new B();
  const rng = mulberry32(seed);
  // instrument the builder to prove every push is matched by a pop and no bad matrix
  let pushes = 0, pops = 0, badMat = 0, badColor = 0;
  const p0 = b.push.bind(b), pop0 = b.pop.bind(b), v0 = b.vert.bind(b);
  b.push = (m) => { pushes++; if (!m || m.length !== 16) badMat++; return p0(m); };
  b.pop = () => { pops++; return pop0(); };
  b.vert = (p, n, c, m) => { if (!Number.isFinite(c[0]) || !Number.isFinite(c[1]) || !Number.isFinite(c[2])) badColor++; return v0(p, n, c, m); };
  const t0 = performance.now();
  const info = buildBackCity(b, rng);
  const ms = performance.now() - t0;
  return { b, info, pushes, pops, badMat, badColor, ms };
}

// ---- build 1 -------------------------------------------------------------
const r1 = build(SEED);
const b = r1.b, info = r1.info;
const tris = b.triCount;

console.log('=== whale-city check ===');
console.log(`build time      ${r1.ms.toFixed(1)} ms`);
console.log(`triangles       ${tris}` + (tris <= 45000 ? '  (<= 45000 OK)' : '  (OVER BUDGET)'));
ok(tris <= 45000, `tri budget exceeded: ${tris} > 45000`);
if (tris > 42000) warns.push(`tri count ${tris} is inside budget but above the 42k comfort line`);
ok(tris >= 15000, `suspiciously low tri count: ${tris}`);

const groupMap = {
  '大教堂': ['cathedral'],
  '街区': ['blocks'],
  '城墙/正门': ['wall', 'gate'],
  '绿化': ['greenery'],
  '其他': ['terrain', 'underside', 'plaza', 'details'],
};
console.log('\n--- triangles by section ---------------------------------');
for (const s of info.sections) console.log(`  ${s.name.padEnd(10)} ${String(s.tris).padStart(6)}`);
const grouped = {};
for (const [g, names] of Object.entries(groupMap)) grouped[g] = info.sections.filter((s) => names.includes(s.name)).reduce((a, s) => a + s.tris, 0);
console.log('\n--- triangles by category --------------------------------');
for (const [g, v] of Object.entries(grouped)) console.log(`  ${g.padEnd(8)} ${String(v).padStart(6)}`);
let sum = 0;
for (const [g, v] of Object.entries(grouped)) sum += v;
console.log(`  ${'SUM'.padEnd(8)} ${String(sum).padStart(6)}  (b.triCount delta ${tris})`);

// ---- hard structure checks ----------------------------------------------
console.log('\n--- hard constraints ------------------------------------');
ok(b.stack.length === 1, `transform stack leaked: length ${b.stack.length} (must be 1)`);
console.log(`  stack.length    ${b.stack.length} ${b.stack.length === 1 ? 'OK' : 'FAIL'}`);
ok(r1.pushes === r1.pops, `push/pop mismatch: ${r1.pushes} pushes vs ${r1.pops} pops`);
console.log(`  push / pop      ${r1.pushes} / ${r1.pops} ${r1.pushes === r1.pops ? 'OK' : 'FAIL'}`);
ok(r1.badMat === 0, `push() got a matrix that was not 16 floats (${r1.badMat}x)`);
ok(r1.badColor === 0, `non-finite vertex colours: ${r1.badColor} (a material array landed in a colour slot)`);
console.log(`  bad colours     ${r1.badColor} ${r1.badColor === 0 ? 'OK' : 'FAIL'}`);
ok(info.issues.length === 0, `layout issues: ${info.issues.join('; ')}`);
console.log(`  layout issues   ${info.issues.length} ${info.issues.length === 0 ? 'OK' : 'FAIL ' + info.issues.join('; ')}`);

// vertices / normals / bounds
const S = 11;
let nonFinite = 0, zeroN = 0;
let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
for (let i = 0; i < b.v.length; i += S) {
  const x = b.v[i], y = b.v[i + 1], z = b.v[i + 2];
  const nx = b.v[i + 3], ny = b.v[i + 4], nz = b.v[i + 5];
  if (![x, y, z, nx, ny, nz].every(Number.isFinite)) nonFinite++;
  const nl = Math.hypot(nx, ny, nz);
  if (!(nl > 0.4 && nl < 1.6)) zeroN++;
  if (x < minX) minX = x; if (x > maxX) maxX = x;
  if (y < minY) minY = y; if (y > maxY) maxY = y;
  if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
}
const nVerts = b.v.length / S;
const nIdx = b.i.length;
console.log(`  vertices        ${nVerts}   indices ${nIdx} (${nIdx % 3 === 0 ? 'multiple of 3 OK' : 'BAD'})`);
ok(nIdx % 3 === 0, 'index count is not a multiple of 3');
ok(nIdx === tris * 3, 'triCount does not match index buffer');
let maxIdx = -1;
for (let i = 0; i < nIdx; i++) if (b.i[i] > maxIdx) maxIdx = b.i[i];
ok(maxIdx < nVerts, `index ${maxIdx} out of range (${nVerts} verts)`);

console.log(`  non-finite      ${nonFinite} ${nonFinite === 0 ? 'OK' : 'FAIL'}`);
ok(nonFinite === 0, `non-finite vertices: ${nonFinite}`);
console.log(`  bad normals     ${zeroN} ${zeroN === 0 ? 'OK' : 'FAIL'}`);
ok(zeroN === 0, `bad (zero/infinite) normals: ${zeroN}`);

const fmt = (v) => v.toFixed(2);
console.log(`  bbox x          [${fmt(minX)}, ${fmt(maxX)}]  (need |x| <= 64)`);
console.log(`  bbox y          [${fmt(minY)}, ${fmt(maxY)}]  (need -12 .. 88)`);
console.log(`  bbox z          [${fmt(minZ)}, ${fmt(maxZ)}]  (need -120 .. 120)`);
ok(minX >= -64 && maxX <= 64, 'x out of bounds');
ok(minZ >= -120 && maxZ <= 120, 'z out of bounds');
ok(minY >= -12 && maxY <= 88, 'y out of bounds');
ok(maxY <= 85.5, `tallest spire ${maxY.toFixed(2)} exceeds the 85 m limit`);

// ---- determinism ---------------------------------------------------------
console.log('\n--- determinism -----------------------------------------');
const r2 = build(SEED);
const b2 = r2.b;
ok(b2.triCount === tris, `second build tri count ${b2.triCount} != ${tris}`);
ok(b2.v.length === b.v.length && b2.i.length === b.i.length, 'second build vertex/index length differs');
let hashA = 2166136261, hashB = 2166136261;
for (let i = 0; i < b.v.length; i++) { hashA ^= Math.round(b.v[i] * 1e3) | 0; hashA = Math.imul(hashA, 16777619); }
for (let i = 0; i < b2.v.length; i++) { hashB ^= Math.round(b2.v[i] * 1e3) | 0; hashB = Math.imul(hashB, 16777619); }
ok(hashA === hashB, `vertex hash differs between builds (${hashA} vs ${hashB})`);
ok(b2.stack.length === 1, 'second build leaked the transform stack');
console.log(`  tri count       ${r2.b.triCount} vs ${tris} ${r2.b.triCount === tris ? 'OK' : 'FAIL'}`);
console.log(`  vertex hash     ${(hashA >>> 0).toString(16)} vs ${(hashB >>> 0).toString(16)} ${hashA === hashB ? 'OK' : 'FAIL'}`);

// ---- source hygiene ------------------------------------------------------
console.log('\n--- source hygiene --------------------------------------');
const src = fs.readFileSync(srcPath, 'utf8');
const lines = src.split('\n').length;
const kb = (Buffer.byteLength(src) / 1024).toFixed(1);
console.log(`  whale-city.js   ${lines} lines, ${kb} KB`);
ok(!/Math\.random\s*\(/.test(src), 'module uses Math.random');
ok(!/from\s+['"]\.\/(layout|world|main|whale)\.js['"]/.test(src), 'module imports a top-level scene module');
ok(!/(window\.|document\.|fetch\s*\(|XMLHttpRequest|localStorage|location\.)/.test(src), 'module touches DOM / URL / storage');
ok(!/\bgl\./.test(src), 'module contains raw GL calls');
if (Buffer.byteLength(src) > 32 * 1024) warns.push(`source is ${kb} KB (target ~30 KB)`);

// ---- summary -------------------------------------------------------------
console.log('\n=== result ===');
for (const w of warns) console.log('WARN ' + w);
if (fails.length) {
  for (const f of fails) console.log('FAIL ' + f);
  console.log(`${fails.length} check(s) FAILED`);
  process.exitCode = 1;
} else {
  console.log('ALL CHECKS PASSED');
  process.exitCode = 0;
}
