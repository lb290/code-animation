// tools/fish-check.mjs — headless geometry / animation check for creatures-fish.js
// No GL, no browser: builds the fish mesh with the plain B builder and validates
// budget, bounds, colour safety, transform-stack balance and determinism.
// usage: node tools/fish-check.mjs
import { B } from '../src/geo.js';
import { mulberry32 } from '../src/math.js';
import { trs } from '../src/actor.js';
import { fishGeom, fishSchools, fishPose, FISH_PALETTES } from '../src/creatures-fish.js';

let fails = 0;
const ok = (cond, label, detail = '') => {
  if (!cond) { fails++; console.log('  FAIL ' + label + (detail ? '  ' + detail : '')); }
  else console.log('  ok   ' + label + (detail ? '  ' + detail : ''));
};
const fmt = (n, d = 3) => Number(n).toFixed(d);

function bbox(b) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  let nonFinite = 0;
  for (let i = 0; i < b.v.length; i += 11) {
    for (let c = 0; c < 3; c++) {
      const x = b.v[i + c];
      if (!Number.isFinite(x)) nonFinite++;
      else { lo[c] = Math.min(lo[c], x); hi[c] = Math.max(hi[c], x); }
    }
  }
  return { lo, hi, span: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]], nonFinite };
}

console.log('== fish-check: geometry ==');
const BUDGET = 2200;
let triCount = 0;
for (const [name, pal] of Object.entries(FISH_PALETTES)) {
  const b = new B();
  fishGeom(b, pal);
  const tris = b.i.length / 3;
  if (name === 'cobalt') triCount = tris;
  const bb = bbox(b);
  console.log('\n[' + name + ']');
  ok(tris > 200 && tris <= BUDGET, 'triangles within budget', tris + ' tris (<= ' + BUDGET + ')');
  ok(bb.nonFinite === 0, 'all vertices finite', 'nonFinite=' + bb.nonFinite);
  ok(b.badColor === undefined, 'no bad colour', 'badColor=' + b.badColor);
  ok(b.bad === undefined, 'no non-finite vertex/normal', 'bad=' + b.bad);
  ok(b.stack.length === 1, 'push/pop balanced', 'stack=' + b.stack.length);
  ok(b.i.length % 3 === 0, 'index count is a triangle list', b.i.length + ' indices');
  let maxIndex = -1;
  for (let i = 0; i < b.i.length; i++) if (b.i[i] > maxIndex) maxIndex = b.i[i];
  ok(maxIndex === b.n - 1, 'indices cover every vertex 0..n-1', 'max=' + maxIndex + ' n=' + b.n);
  ok(bb.span[2] > 2.0 && bb.span[2] < 2.7, 'local length ~2.2 units', 'z span=' + fmt(bb.span[2]));
  ok(bb.span[0] < 1.0 && bb.span[1] < 1.2 && bb.span[1] > 0.7, 'width/height in fish proportion',
    'x=' + fmt(bb.span[0]) + ' y=' + fmt(bb.span[1]));
  ok(Math.max(Math.abs(bb.lo[0]), Math.abs(bb.hi[0]), Math.abs(bb.lo[1]), Math.abs(bb.hi[1]),
    Math.abs(bb.lo[2]), Math.abs(bb.hi[2])) < 3000, 'no far vertices');
  ok(bb.lo[2] > -1.35 && bb.hi[2] < 1.15, 'nose/tail within authored z range',
    'z=[' + fmt(bb.lo[2]) + ',' + fmt(bb.hi[2]) + ']');
  console.log('  bbox x[' + fmt(bb.lo[0], 2) + ',' + fmt(bb.hi[0], 2) + '] y[' + fmt(bb.lo[1], 2) + ',' +
    fmt(bb.hi[1], 2) + '] z[' + fmt(bb.lo[2], 2) + ',' + fmt(bb.hi[2], 2) + ']');
  // determinism: same inputs -> identical builder output
  const b2 = new B();
  fishGeom(b2, pal);
  ok(b2.i.length === b.i.length && b2.v.length === b.v.length, 'deterministic rebuild',
    'tris ' + b.i.length / 3 + ' -> ' + b2.i.length / 3);
  let same = true;
  for (let i = 0; i < b.v.length; i++) if (b.v[i] !== b2.v[i]) { same = false; break; }
  ok(same, 'deterministic vertices (bit-identical)');
}

console.log('\n== fish-check: schools + motion ==');
const schools = fishSchools(mulberry32(20261122));
ok(schools.length === 4, 'four schools (hero + blue/red/gold koi)', schools.length);
const expected = ['fish-hero', 'fish-koi-blue', 'fish-koi-red', 'fish-koi-gold'];
for (let i = 0; i < expected.length; i++) ok(schools[i].name === expected[i], 'school name ' + expected[i], schools[i].name);

const hero = schools[0];
ok(hero.fish.length >= 12 && hero.fish.length <= 14, 'hero school 12-14 fish', hero.fish.length + ' fish');
ok(Math.abs(hero.cx - 19.5) < 0.01 && Math.abs(hero.cy - 36.6) < 0.01 && Math.abs(hero.cz - 76.0) < 0.01,
  'hero school centre (19.5, 36.6, 76.0)', '(' + hero.cx + ',' + hero.cy + ',' + hero.cz + ')');
ok(Math.abs(hero.rx - 7.4) < 0.01 && Math.abs(hero.rz - 4.4) < 0.01, 'hero ellipse rx7.4 rz4.4', hero.rx + ' x ' + hero.rz);
const FISH_LEN = 2.28;
const heroLens = hero.fish.map((f) => f.sc * FISH_LEN);
ok(Math.min(...heroLens) >= 1.55 && Math.max(...heroLens) <= 2.4, 'hero body length 1.6-2.4 m',
  '[' + fmt(Math.min(...heroLens), 2) + ',' + fmt(Math.max(...heroLens), 2) + '] m');
for (const s of schools) {
  const lens = s.fish.map((f) => f.sc * FISH_LEN);
  if (s.name === 'fish-hero') continue;
  ok(Math.min(...lens) >= 3.0 && Math.max(...lens) <= 5.0, s.name + ' body length 3-5 m',
    '[' + fmt(Math.min(...lens), 2) + ',' + fmt(Math.max(...lens), 2) + '] m');
}

let totalFish = 0;
for (const s of schools) {
  totalFish += s.fish.length;
  const lo = s.name === 'fish-hero' ? 12 : 9, hi = s.name === 'fish-hero' ? 14 : 11;
  ok(s.fish.length >= lo && s.fish.length <= hi, s.name + ' fish count ' + lo + '-' + hi, s.fish.length + ' fish');
  ok(s.fish.every((f) => f.sway >= 0.18 && f.sway <= 0.30), s.name + ' tail sway 0.18-0.30',
    '[' + fmt(Math.min(...s.fish.map((f) => f.sway)), 2) + ',' + fmt(Math.max(...s.fish.map((f) => f.sway)), 2) + ']');
  ok(s.fish.every((f) => f.scale === undefined), s.name + ' legacy scale field unused');
  const hlo = Math.min(...s.fish.map((f) => f.h)), hhi = Math.max(...s.fish.map((f) => f.h));
  console.log('  ' + s.name + ': ' + s.fish.length + ' fish, scale [' +
    fmt(Math.min(...s.fish.map((f) => f.sc)), 2) + ',' + fmt(Math.max(...s.fish.map((f) => f.sc)), 2) +
    '], h [' + fmt(hlo, 2) + ',' + fmt(hhi, 2) + ']');
}
ok(totalFish === 43, 'fish total', totalFish + ' fish across 4 schools');
ok(schools[1].fish.every((f) => f.sc >= 1.35 && f.sc <= 1.62), 'blue koi scale 1.35-1.62');
ok(schools[2].fish.every((f) => f.sc >= 1.55 && f.sc <= 1.90), 'red koi scale 1.55-1.90');
ok(schools[3].fish.every((f) => f.sc >= 1.85 && f.sc <= 2.20), 'gold koi scale 1.85-2.20');

// deterministic population: same seed -> identical descriptors
const a1 = JSON.stringify(fishSchools(mulberry32(7)));
const a2 = JSON.stringify(fishSchools(mulberry32(7)));
ok(a1 === a2, 'deterministic populations (same rng seed)');

// motion sweep: every pose finite, matrices exactly 16 floats, hero bounds held
let worst = { y: [Infinity, -Infinity], x: [Infinity, -Infinity], z: [Infinity, -Infinity] };
let badPose = 0, badMat = 0;
for (const t of [0, 2.5, 3, 7, 31, 97.25]) {
  for (const s of schools) {
    for (const f of s.fish) {
      const p = fishPose(s, f, t);
      if (!p.pos.every(Number.isFinite) || !Number.isFinite(p.yaw) || !Number.isFinite(p.scale) ||
        !Number.isFinite(p.pitch) || !Number.isFinite(p.roll) || !Number.isFinite(p.sway)) badPose++;
      const m = trs(p.pos, p.yaw, p.scale, p.pitch, p.roll);
      if (!(m instanceof Float32Array) || m.length !== 16) badMat++;
      else for (let i = 0; i < 16; i++) if (!Number.isFinite(m[i])) { badMat++; break; }
      if (s.name === 'fish-hero') {
        worst.x[0] = Math.min(worst.x[0], p.pos[0]); worst.x[1] = Math.max(worst.x[1], p.pos[0]);
        worst.y[0] = Math.min(worst.y[0], p.pos[1]); worst.y[1] = Math.max(worst.y[1], p.pos[1]);
        worst.z[0] = Math.min(worst.z[0], p.pos[2]); worst.z[1] = Math.max(worst.z[1], p.pos[2]);
      }
    }
  }
}
ok(badPose === 0, 'all poses finite over t = 0..97', 'badPose=' + badPose);
ok(badMat === 0, 'every pose matrix is 16 finite floats', 'badMat=' + badMat);
ok(worst.y[0] > 34.0 && worst.y[1] < 40.0, 'hero altitude stays 34-40 m',
  'y[' + fmt(worst.y[0], 2) + ',' + fmt(worst.y[1], 2) + ']');
ok(worst.x[0] > 11 && worst.x[1] < 27.5 && worst.z[0] > 70.5 && worst.z[1] < 81.5,
  'hero school stays beside the balustrade', 'x[' + fmt(worst.x[0], 1) + ',' + fmt(worst.x[1], 1) +
  '] z[' + fmt(worst.z[0], 1) + ',' + fmt(worst.z[1], 1) + ']');

console.log('\n' + (fails === 0 ? 'PASS' : 'FAIL') + ' — ' + fails + ' failure(s)');
console.log('fish mesh: ' + triCount + ' tris (budget ' + BUDGET + '), 4 instanced meshes, ' + totalFish + ' fish');
if (fails) process.exit(1);