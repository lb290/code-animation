// Geometry self-test for src/street.js. Run from 01-source/skycity:
//   node tools/street-check.mjs [seed] [--dump out.json [--with-town]]
//
// Checks: finite vertices, triangle budget, billboard / point-light budgets,
// walkable-corridor obstruction (r in [44.7, 46.3], y below the 2.6 m passage
// line, outside the stairway + torii exemption), lanterns hanging in the
// corridor, determinism for a fixed seed, and per-category placement extents.
// --dump writes the street triangles (and optionally the whole town) as JSON for
// offline plan / elevation previews.
import { B } from '../src/geo.js';
import { buildStreetFestival } from '../src/street.js';
import { mulberry32 } from '../src/math.js';

const O = { a0: 0.12, a1: 2.78, roadR: 45.5, faceIn: 43.0, faceOut: 47.9, y: 0.2 };
const SEED = Number(process.argv[2] ?? 7);

const TRI_BUDGET = 30000;
const LANTERN_BUDGET = 120;
const POINT_BUDGET = 4;
const CALL_LINE = O.y + 2.4;      // 2.6 world y
const BAND_IN = 44.7, BAND_OUT = 46.3;
const EXEMPT = 2.0;               // stairway / torii keep-out radius

// Distance (xz) from p to the stairway line (0,47)->(0,34).
function distStairs(x, z) {
  const z0 = 34, z1 = 47;
  const zc = Math.max(z0, Math.min(z1, z));
  return Math.hypot(x, z - zc);
}
// Distance (xz) to the torii at (0, 0, 46).
function distTorii(x, z) {
  return Math.hypot(x, z - 46);
}

function run(seed) {
  const b = new B();
  const ctx = { lanterns: [], points: [], additive: [], beams: [], falls: [] };
  const res = buildStreetFestival(b, ctx, mulberry32(seed), O);
  return { b, ctx, res };
}

function hashFloats(arr) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < arr.length; i++) {
    const v = Math.round(arr[i] * 1e6) | 0;
    h ^= v;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

const fail = [];
const ok = (cond, msg) => { if (!cond) fail.push(msg); };

// ---------------------------------------------------------------- run once
const { b, ctx, res } = run(SEED);

// 1. finite vertices (pos / normal / colour / mat)
let nonFinite = 0;
let zeroNormal = 0;
const badAt = [];
for (let i = 0; i < b.v.length; i += 11) {
  let bad = false;
  for (let k = 0; k < 11; k++) if (!Number.isFinite(b.v[i + k])) bad = true;
  if (bad) { nonFinite++; if (badAt.length < 4) badAt.push(i / 11); }
  const nl = Math.hypot(b.v[i + 3], b.v[i + 4], b.v[i + 5]);
  if (!(nl > 1e-5)) zeroNormal++;
}
ok(nonFinite === 0, 'non-finite vertices: ' + nonFinite + ' (first verts ' + badAt.join(',') + ')');
ok(zeroNormal === 0, 'degenerate normals: ' + zeroNormal);
ok((b.bad || 0) === 0, 'B.vert rejected ' + (b.bad || 0) + ' vertices');

// 1b. builder transform stack must be balanced (street.js asserts per item; this
// catches a leak after the last item)
ok(b.stack.length === 1, 'transform stack leaked: depth ' + b.stack.length);

// 2. triangle budget
const tris = b.triCount;
ok(tris <= TRI_BUDGET, 'triangles ' + tris + ' > ' + TRI_BUDGET);

// 3. billboard / point-light budgets
ok(ctx.lanterns.length <= LANTERN_BUDGET, 'lanterns ' + ctx.lanterns.length + ' > ' + LANTERN_BUDGET);
ok(ctx.points.length <= POINT_BUDGET, 'point lights ' + ctx.points.length + ' > ' + POINT_BUDGET);
let badLanterns = 0;
for (const l of ctx.lanterns) {
  if (!(l.p[0] === l.p[0] && l.p[1] === l.p[1] && l.p[2] === l.p[2])) badLanterns++;
  if (!(l.size > 0) || !Array.isArray(l.col) || !Number.isFinite(l.alpha ?? 1)) badLanterns++;
}
ok(badLanterns === 0, 'malformed lanterns: ' + badLanterns);

// 4. walkable corridor: nothing solid below the passage line inside the centre band
const idx = b.i;
let blockedTris = 0;
const blockedSpots = [];
for (let t = 0; t < idx.length; t += 3) {
  for (let k = 0; k < 3; k++) {
    const v = idx[t + k];
    const x = b.v[v * 11], y = b.v[v * 11 + 1], z = b.v[v * 11 + 2];
    const r = Math.hypot(x, z);
    if (r >= BAND_IN && r <= BAND_OUT && y < CALL_LINE) {
      if (distStairs(x, z) > EXEMPT && distTorii(x, z) > EXEMPT) {
        blockedTris++;
        if (blockedSpots.length < 6) blockedSpots.push({ x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2), r: +r.toFixed(2) });
        break;
      }
    }
  }
}
ok(blockedTris === 0, 'corridor blocked by ' + blockedTris + ' triangle vertices: ' + JSON.stringify(blockedSpots));

// 4b. lantern billboards: anything below the passage line must hang in a gutter
let badHanging = 0;
for (const l of ctx.lanterns) {
  const r = Math.hypot(l.p[0], l.p[2]);
  if (l.p[1] < CALL_LINE && r > BAND_IN && r < BAND_OUT) badHanging++;
}
ok(badHanging === 0, badHanging + ' lantern billboards hang inside the corridor below y=' + CALL_LINE.toFixed(2));

// 5. per-category extents + where each category is allowed to live
const cats = Object.keys(res.marks || {});
const catRows = [];
for (const c of cats) {
  let rMin = Infinity, rMax = -Infinity, yMin = Infinity, yMax = -Infinity, vCount = 0;
  for (const [v0, v1] of res.marks[c]) {
    for (let n = v0; n < v1; n++) {
      const x = b.v[n * 11], y = b.v[n * 11 + 1], z = b.v[n * 11 + 2];
      const r = Math.hypot(x, z);
      rMin = Math.min(rMin, r); rMax = Math.max(rMax, r);
      yMin = Math.min(yMin, y); yMax = Math.max(yMax, y);
      vCount++;
    }
  }
  catRows.push({ cat: c, tris: res.trisBy[c] || 0, verts: vCount, r: [rMin, rMax], y: [yMin, yMax] });
}

// 6. determinism: same seed must reproduce the exact same buffers
const a = run(SEED);
const c2 = run(SEED);
const h1 = hashFloats(a.b.v) + ':' + hashFloats(Float32Array.from(a.b.i));
const h2 = hashFloats(c2.b.v) + ':' + hashFloats(Float32Array.from(c2.b.i));
ok(h1 === h2, 'two runs with seed ' + SEED + ' differ (' + h1 + ' vs ' + h2 + ')');
const hLan = a.ctx.lanterns.map((l) => l.p.join(',') + '/' + l.size).join(';');
const hLan2 = c2.ctx.lanterns.map((l) => l.p.join(',') + '/' + l.size).join(';');
ok(hLan === hLan2, 'lantern placement differs between runs');
const hPts = JSON.stringify(a.ctx.points);
ok(hPts === JSON.stringify(c2.ctx.points), 'point light placement differs between runs');

// optional: dump triangles for offline previews (plan / unrolled elevation)
const dumpArg = process.argv.indexOf('--dump');
if (dumpArg > 0 && process.argv[dumpArg + 1]) {
  const catOf = new Array(b.n).fill('misc');
  for (const c of Object.keys(res.marks || {})) {
    for (const [v0, v1] of res.marks[c]) for (let n = v0; n < v1; n++) catOf[n] = c;
  }
  const verts = [];
  for (let n = 0; n < b.n; n++) verts.push([+b.v[n * 11].toFixed(4), +b.v[n * 11 + 1].toFixed(4), +b.v[n * 11 + 2].toFixed(4)]);
  const tris2 = [];
  for (let t = 0; t < b.i.length; t += 3) tris2.push([b.i[t], b.i[t + 1], b.i[t + 2], catOf[b.i[t]]]);
  const lanterns = ctx.lanterns.map((l) => ({ p: l.p.map((v) => +v.toFixed(3)), size: +l.size.toFixed(3) }));
  const points = ctx.points.map((l) => ({ p: l.p.map((v) => +v.toFixed(3)), range: l.range, int: l.int }));
  const fsp = await import('node:fs/promises');
  await fsp.writeFile(process.argv[dumpArg + 1], JSON.stringify({ o: O, verts, tris: tris2, lanterns, points }));
  console.log('dumped street geometry to ' + process.argv[dumpArg + 1]);
  if (process.argv.includes('--with-town')) {
    const { buildTown } = await import('../src/town.js');
    const tb = new B();
    const tctx = { lanterns: [], points: [], additive: [], beams: [], falls: [] };
    buildTown(tb, tctx, mulberry32(SEED));
    const tv = [];
    for (let n = 0; n < tb.n; n++) tv.push([tb.v[n * 11], tb.v[n * 11 + 1], tb.v[n * 11 + 2]]);
    await fsp.writeFile(process.argv[dumpArg + 1] + '.town.json', JSON.stringify({
      verts: tv, tris: Array.from(tb.i),
    }));
    console.log('dumped town geometry (' + (tb.i.length / 3) + ' tris)');
  }
}

// ---------------------------------------------------------------- report
const pad = (s, n) => String(s).padEnd(n);
const padS = (s, n) => String(s).padStart(n);
console.log('\n=== street.js geometry check (seed ' + SEED + ') ===\n');
console.log(pad('category', 14) + padS('count', 7) + padS('tris', 8) + padS('verts', 8) + padS('r min', 9) + padS('r max', 9) + padS('y min', 8) + padS('y max', 8));
const labels = {
  stalls: 'stalls', strings: 'lantern strings', banners: 'banners', signs: 'vertical signs',
  awnings: 'cloth awnings', clutter: 'clutter',
};
for (const row of catRows) {
  console.log(
    pad(labels[row.cat] || row.cat, 14) +
    padS(res.counts[row.cat] ?? '', 7) +
    padS(row.tris, 8) +
    padS(row.verts, 8) +
    padS(row.r[0].toFixed(2), 9) +
    padS(row.r[1].toFixed(2), 9) +
    padS(row.y[0].toFixed(2), 8) +
    padS(row.y[1].toFixed(2), 8)
  );
}
console.log('');
console.log('items            ' + res.items + '  (stalls ' + res.counts.stalls + ', strings ' + res.counts.strings +
  ', banners ' + res.counts.banners + ', signs ' + res.counts.signs + ', awnings ' + res.counts.awnings +
  ', clutter ' + res.counts.clutter + ')');
console.log('triangles        ' + tris + ' / ' + TRI_BUDGET);
console.log('vertices         ' + b.v.length / 11);
console.log('lanterns         ' + ctx.lanterns.length + ' / ' + LANTERN_BUDGET);
console.log('point lights     ' + ctx.points.length + ' / ' + POINT_BUDGET);
console.log('non-finite verts ' + nonFinite + ', degenerate normals ' + zeroNormal);
console.log('corridor blocks  ' + blockedTris);
console.log('deterministic    ' + (h1 === h2 ? 'yes' : 'NO') + ' (' + h1 + ')');

// corridor bounds at ground level, per side, for the integration note
let innerMax = -Infinity, outerMin = Infinity;
for (let i = 0; i < b.v.length; i += 11) {
  const x = b.v[i], y = b.v[i + 1], z = b.v[i + 2];
  if (y >= CALL_LINE) continue;
  const r = Math.hypot(x, z);
  if (Math.abs(x) < 1e-6 && Math.abs(z) < 1e-6) continue;
  if (r < 45.5) innerMax = Math.max(innerMax, r);
  else outerMin = Math.min(outerMin, r);
}
console.log('street gutter    inner max r=' + innerMax.toFixed(2) + ' (must stay < ' + BAND_IN + '), outer min r=' + outerMin.toFixed(2) + ' (must stay > ' + BAND_OUT + ')');

if (fail.length) {
  console.log('\nFAIL');
  for (const f of fail) console.log('  - ' + f);
  process.exitCode = 1;
} else {
  console.log('\nPASS — all checks green');
}
