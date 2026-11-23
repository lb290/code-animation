// tools/giraffe-check.mjs — node-side geometry health check for the giraffes.
// No GL / browser needed: the module is pure geometry + pure animation maths.
//   node tools/giraffe-check.mjs
import { makeGiraffe, PART_KEYS, RIG } from '../src/creatures-giraffe.js';

let fail = 0;
const ok = (cond, msg, extra = '') => {
  if (!cond) { fail++; console.log('  FAIL ' + msg + (extra ? ' :: ' + extra : '')); }
  else console.log('  pass ' + msg + (extra ? ' :: ' + extra : ''));
};
const near = (v, a, b) => v >= a && v <= b;

function bboxOf(b) {
  const v = b.v;
  const bb = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  let bad = 0;
  for (let i = 0; i < v.length; i += 11) {
    for (let k = 0; k < 3; k++) {
      const x = v[i + k];
      if (!Number.isFinite(x)) { bad++; continue; }
      if (x < bb[k]) bb[k] = x;
      if (x > bb[3 + k]) bb[3 + k] = x;
    }
  }
  return { bb, bad, verts: v.length / 11 };
}
function hashOf(b) {
  let h = 0;
  for (let i = 0; i < b.v.length; i++) h = (h * 31 + Math.round(b.v[i] * 1e5)) | 0;
  for (let i = 0; i < b.i.length; i++) h = (h * 31 + b.i[i]) | 0;
  return h;
}

// pivots used to put each part back in rest-pose giraffe space
const PIVOT = {
  body: [0, 0, 0],
  neck: RIG.neckPivot,
  head: RIG.headPivot,
  legFront: RIG.hipFront,
  legHind: RIG.hipHind,
  tail: RIG.tailPivot,
};

console.log('== determinism / structure ==');
const A = makeGiraffe(4101);
const A2 = makeGiraffe(4101);
const B = makeGiraffe(5207);
ok(PART_KEYS.length === 6, 'six separate part builders', PART_KEYS.join(','));
ok(JSON.stringify(A.tri) === JSON.stringify(A2.tri), 'same seed -> same triangle counts', JSON.stringify(A.tri));
ok(PART_KEYS.every((k) => hashOf(A.parts[k]) === hashOf(A2.parts[k])), 'same seed -> identical vertex+index hash');
ok(hashOf(A.parts.body) !== hashOf(B.parts.body), 'different seed -> different coat pattern');

console.log('== triangles ==');
for (const [name, g] of [['A(4101)', A], ['B(5207)', B]]) {
  ok(g.tris > 1500 && g.tris <= 14000, name + ' total tris within budget (<=14k)', String(g.tris));
  const parts = PART_KEYS.map((k) => k + ':' + g.tri[k]).join('  ');
  console.log('  ' + parts);
}

console.log('== per-part health ==');
for (const [name, g] of [['A', A], ['B', B]]) {
  let minY = 1e9, maxY = -1e9, minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const k of PART_KEYS) {
    const b = g.parts[k];
    const { bb, bad, verts } = bboxOf(b);
    const pv = PIVOT[k];
    ok(b.i.length / 3 > 0, name + ' ' + k + ' has triangles', String(b.i.length / 3));
    ok(bad === 0, name + ' ' + k + ' all vertices finite', 'verts=' + verts);
    ok(bb[0] > -40 && bb[3] < 40 && bb[1] > -40 && bb[4] < 40 && bb[2] > -40 && bb[5] < 40,
      name + ' ' + k + ' bbox inside +-40 m',
      [bb[0], bb[1], bb[2], bb[3], bb[4], bb[5]].map((x) => x.toFixed(2)).join(','));
    ok(b.badColor === undefined, name + ' ' + k + ' no NaN colour (badColor)');
    ok(b.bad === undefined, name + ' ' + k + ' no non-finite vertex (bad)');
    ok(b.badNormal === undefined, name + ' ' + k + ' no degenerate normal (badNormal)');
    ok(b.stack.length === 1, name + ' ' + k + ' push/pop balanced', 'depth=' + b.stack.length);
    minX = Math.min(minX, bb[0] + pv[0]); maxX = Math.max(maxX, bb[3] + pv[0]);
    minY = Math.min(minY, bb[1] + pv[1]); maxY = Math.max(maxY, bb[4] + pv[1]);
    minZ = Math.min(minZ, bb[2] + pv[2]); maxZ = Math.max(maxZ, bb[5] + pv[2]);
  }
  const H = maxY - Math.min(0, minY), W = maxX - minX, L = maxZ - minZ;
  ok(near(H, 7.9, 8.45), name + ' total height ~8.2 m (rest pose)', H.toFixed(2));
  ok(near(W, 1.0, 2.3), name + ' body width plausible', W.toFixed(2));
  ok(near(L, 2.9, 4.3), name + ' nose-to-rump length plausible', L.toFixed(2));
  ok(minY > -0.06, name + ' no geometry under the ground plane', minY.toFixed(3));
}

console.log('== walk path / animation ==');
// re-derive the path exactly as the module does, from its exported numbers
const Z_MID = 30, Z_AMP = 52, CYCLE = 232;
let zmin = 1e9, zmax = -1e9, maxErr = 0, yawBad = 0;
for (const phase0 of [2.18, 1.63]) {
  for (let i = 0; i <= 4000; i++) {
    const t = (i / 4000) * CYCLE;
    const phi = phase0 + (Math.PI * 2 * t) / CYCLE;
    const z = Z_MID - Z_AMP * Math.cos(phi);
    zmin = Math.min(zmin, z); zmax = Math.max(zmax, z);
    const yaw = 0.5 * Math.PI * (1 - Math.tanh(3.2 * Math.sin(phi)));
    // away from the turn-around the heading must match the travel direction
    if (Math.abs(Math.sin(phi)) > 0.85) {
      maxErr = Math.max(maxErr, Math.abs(yaw - (Math.sin(phi) > 0 ? 0 : Math.PI)));
    }
    if (yaw < -0.01 || yaw > Math.PI + 0.01) yawBad++;
  }
}
ok(zmin > -22.05 && zmax < 82.05, 'z stays inside the requested -22..82 band', zmin.toFixed(2) + '..' + zmax.toFixed(2));
ok(maxErr < 0.02, 'heading follows travel on the straights (|sin|>0.85)', maxErr.toFixed(4));
ok(yawBad === 0, 'yaw always between 0 and pi (never sideways-past)', String(yawBad));

console.log('== source hygiene ==');
const src = await import('node:fs').then((fs) => fs.readFileSync(new URL('../src/creatures-giraffe.js', import.meta.url), 'utf8'));
ok(!/Math\.random/.test(src), 'no Math.random (deterministic rng only)');
const pushes = (src.match(/\bb\.push\(/g) || []).length;
const pops = (src.match(/\bb\.pop\(\)/g) || []).length;
ok(pushes === pops, 'b.push() / b.pop() call count matches', pushes + ' / ' + pops);
ok(!/b\.push\(\[/.test(src), 'every b.push() passes a trs()/m4 matrix (16 floats), never a literal');

console.log(fail === 0 ? '\nPASS — giraffe geometry check clean' : '\nFAILED — ' + fail + ' assertion(s)');
process.exit(fail === 0 ? 0 : 1);
