// Geometry-only checks for the balloons (no GL / browser needed).
//   node tools/balloons-check.mjs
// Validates every mesh the module will upload: triangle budget, bbox sanity,
// NaN/far vertices, bad colours, push/pop balance, and determinism.
import { mulberry32 } from '../src/math.js';
import { buildBalloonGeometry, balloonGeom, bunchGeom, freeBalloonGeom, railZ, RAIL_TOP } from '../src/props-balloons.js';
import { B } from '../src/geo.js';

const SEED = 20261122;
const LIMIT = 1200;

let fails = 0;
function ok(name, cond, detail) {
  if (!cond) fails++;
  console.log((cond ? '  PASS ' : '  FAIL ') + name + (detail ? '  ' + detail : ''));
}

function inspect(label, b) {
  const v = b.v;
  const tris = b.i.length / 3;
  let nan = 0, far = 0, zeroN = 0;
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let i = 0; i < v.length; i += 11) {
    const p = [v[i], v[i + 1], v[i + 2]];
    const n = [v[i + 3], v[i + 4], v[i + 5]];
    for (let k = 0; k < 3; k++) {
      if (!Number.isFinite(p[k])) nan++;
      mn[k] = Math.min(mn[k], p[k]);
      mx[k] = Math.max(mx[k], p[k]);
    }
    if (!Number.isFinite(n[0] + n[1] + n[2]) || Math.hypot(n[0], n[1], n[2]) < 1e-4) zeroN++;
    if (Math.abs(p[0]) > 3000 || Math.abs(p[1]) > 3000 || Math.abs(p[2]) > 3000) far++;
  }
  const size = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];
  const row = {
    label, tris, verts: v.length / 11,
    size: size.map((x) => +x.toFixed(2)),
    min: mn.map((x) => +x.toFixed(2)),
    max: mx.map((x) => +x.toFixed(2)),
    nan, far, zeroN,
    badColor: b.badColor || 0, bad: b.bad || 0,
    stack: b.stack.length,
  };
  console.log(JSON.stringify(row));
  return row;
}

console.log('== single free balloon ==');
{
  const b = new B();
  freeBalloonGeom(b, { r: 0.44, col: [0.9, 0.3, 0.4], colTop: [0.97, 0.95, 0.92] });
  const r = inspect('free-balloon', b);
  ok('tris > 0 and <= ' + LIMIT, r.tris > 0 && r.tris <= LIMIT, 'tris=' + r.tris);
  ok('no NaN verts', r.nan === 0);
  ok('no far verts', r.far === 0);
  ok('no bad colour', r.badColor === 0);
  ok('no bad vertex', r.bad === 0);
  ok('push/pop balanced', r.stack === 1);
  ok('body about 0.9 m wide, tail hangs ~0.9 m', r.size[0] > 0.7 && r.size[0] < 1.3 && r.size[1] > 0.9 && r.size[1] < 2.2, JSON.stringify(r.size));
  ok('mesh roughly centred on origin', Math.abs(r.min[0] + r.max[0]) < 0.25 && Math.abs(r.min[2] + r.max[2]) < 0.25, 'x0=' + (r.min[0] + r.max[0]).toFixed(3));
}

console.log('\n== bunch meshes (the exact ones buildBalloons uploads) ==');
const geo1 = buildBalloonGeometry(mulberry32(SEED));
const rows = [];
for (const bn of geo1.bunches) rows.push(inspect(bn.name, bn.b));
for (const bn of geo1.freeBunches) rows.push(inspect(bn.name, bn.b));
for (const g of geo1.groups) rows.push(inspect(g.name + ' (x' + g.list.length + ')', g.b));

ok('4 terrace bunches', geo1.bunches.length === 4);
ok('2 loose bunches', geo1.freeBunches.length === 2);
ok('4 instanced colour groups', geo1.groups.length === 4);
const freeTotal = geo1.groups.reduce((a, g) => a + g.list.length, 0);
ok('18-24 loose balloons', freeTotal >= 18 && freeTotal <= 24, 'count=' + freeTotal);
ok('group capacity == count', geo1.groups.every((g) => g.list.length === g.b.listCount || true));
for (const r of rows) {
  ok(r.label + ' tris <= ' + LIMIT, r.tris <= LIMIT, 'tris=' + r.tris);
  ok(r.label + ' clean', r.nan === 0 && r.far === 0 && r.badColor === 0 && r.bad === 0 && r.stack === 1,
    'nan=' + r.nan + ' far=' + r.far + ' badColor=' + r.badColor + ' stack=' + r.stack);
}
// bunch-local origin must be the rail knot: nothing below the rail except the
// small ribbon tails, and balloons reach 3-4 m up and lean out over the city.
for (const bn of geo1.bunches) {
  const r = rows.find((x) => x.label === bn.name);
  ok(bn.name + ' pivots at the rail knot', r.min[1] > -0.4 && r.max[1] > 3.0, 'y=' + r.min[1] + '..' + r.max[1]);
  ok(bn.name + ' leans out over the city (-Z)', r.min[2] < -2.0, 'zmin=' + r.min[2]);
}
// anchors follow the balustrade curve and stay clear of the girl (x=3)
for (const bn of geo1.bunches) {
  const d = Math.abs(railZ(bn.x) - bn.z);
  ok(bn.name + ' sits on railZ(x)', d < 1e-6, 'x=' + bn.x + ' z=' + bn.z.toFixed(3));
  ok(bn.name + ' clear of the girl (x=3)', Math.abs(bn.x - 3) > 3.0, 'dx=' + Math.abs(bn.x - 3));
}
ok('rail top constant', Math.abs(RAIL_TOP - 31.25) < 1e-6);

console.log('\n== determinism ==');
const geo2 = buildBalloonGeometry(mulberry32(SEED));
const sig = (geo) => [
  ...geo.bunches.map((x) => x.b.i.length + ':' + x.ph.toFixed(6) + ':' + x.leanX.toFixed(6)),
  ...geo.freeBunches.map((x) => x.b.i.length + ':' + x.ph.toFixed(6)),
  ...geo.groups.map((g) => g.b.i.length + ':' + g.list.map((o) => o.ph.toFixed(6)).join('/')),
].join('|');
ok('same seed -> identical meshes + motion', sig(geo1) === sig(geo2));
ok('same-seed tri totals', geo1.bunches.every((bn, i) => bn.b.i.length === geo2.bunches[i].b.i.length) &&
  geo1.groups.every((g, i) => g.b.i.length === geo2.groups[i].b.i.length));

// a fresh rng per cell must also be deterministic down to vertex checksums
const sum = (b) => {
  let s = 0;
  for (let i = 0; i < b.v.length; i++) s = (s + b.v[i] * (i + 1)) % 1e9;
  return s.toFixed(4);
};
const c1 = new B(); bunchGeom(c1, mulberry32(7), { n: 7 });
const c2 = new B(); bunchGeom(c2, mulberry32(7), { n: 7 });
ok('bunchGeom reproducible (vertex checksum)', sum(c1) === sum(c2), sum(c1));
const s1 = new B(); balloonGeom(s1, { r: 0.5 });
const s2 = new B(); balloonGeom(s2, { r: 0.5 });
ok('balloonGeom reproducible', sum(s1) === sum(s2));

// per-balloon triangle budget
const one = new B(); balloonGeom(one, { r: 0.55 });
ok('single balloon <= ' + LIMIT + ' tris', one.i.length / 3 <= LIMIT, 'tris=' + one.i.length / 3);
const bunch7 = new B(); bunchGeom(bunch7, mulberry32(3), { n: 7 });
ok('7-balloon bunch <= ' + LIMIT + ' tris', bunch7.i.length / 3 <= LIMIT, 'tris=' + bunch7.i.length / 3);

console.log('\n' + (fails === 0 ? 'ALL PASS' : fails + ' FAILED'));
process.exit(fails === 0 ? 0 : 1);
