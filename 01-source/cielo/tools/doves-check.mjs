// Geometry-only checks for the doves (no GL needed).
//   node tools/doves-check.mjs
import { B } from '../src/geo.js';
import { mulberry32 } from '../src/math.js';
import { buildDoves, doveFlightGeom, dovePerchGeom } from '../src/creatures-doves.js';

const fakeGL = new Proxy({}, {
  get(t, k) {
    if (k === 'TRIANGLES') return 4;
    if (k === 'FLOAT') return 5126;
    if (k === 'STATIC_DRAW') return 35044;
    if (k === 'ARRAY_BUFFER') return 34962;
    if (k === 'ELEMENT_ARRAY_BUFFER') return 34963;
    return () => ({});
  },
});

const fails = [];
const ok = (cond, msg, extra) => {
  if (!cond) fails.push(msg + (extra !== undefined ? ' (' + extra + ')' : ''));
  return cond;
};

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
  return {
    tris: b.i.length / 3,
    verts: v.length / 11,
    nan, far,
    badColor: b.badColor || 0,
    bad: b.bad || 0,
    badNormal: b.badNormal || 0,
    stack: b.stack.length,
    bbox: { min: mn.map((x) => +x.toFixed(3)), max: mx.map((x) => +x.toFixed(3)) },
  };
}

function build(fn, label, budget) {
  const b = new B();
  fn(b);
  const s = stats(b);
  console.log(label + ': ' + JSON.stringify(s));
  ok(s.tris > 0, label + ' empty');
  ok(s.tris <= budget, label + ' over triangle budget', s.tris + ' > ' + budget);
  ok(s.nan === 0, label + ' has non-finite vertices', s.nan);
  ok(s.far === 0, label + ' has far vertices', s.far);
  ok(s.badColor === 0, label + ' badColor', s.badColor);
  ok(s.bad === 0, label + ' bad vertex', s.bad);
  ok(s.stack === 1, label + ' push/pop unbalanced', s.stack);
  // wingspan / body size sanity
  return s;
}

const fly = build(doveFlightGeom, 'flying dove', 4000);
const perch = build(dovePerchGeom, 'perched dove', 2500);
ok(Math.abs(fly.bbox.max[0] - fly.bbox.min[0] - 1.05) < 0.12, 'flying span not ~1.05', (fly.bbox.max[0] - fly.bbox.min[0]).toFixed(3));
ok(Math.abs(fly.bbox.max[0] + fly.bbox.min[0]) < 0.02, 'wings not symmetric in x', (fly.bbox.max[0] + fly.bbox.min[0]).toFixed(3));
ok(fly.bbox.max[2] - fly.bbox.min[2] > 0.6, 'flying body not long enough');
ok(fly.bbox.max[1] - fly.bbox.min[1] < 0.9, 'flying too tall');
ok(perch.bbox.min[1] > -0.03 && perch.bbox.min[1] < 0.03, 'perched feet not on y=0', perch.bbox.min[1]);
ok(perch.bbox.max[0] - perch.bbox.min[0] < 0.35, 'perched too wide', (perch.bbox.max[0] - perch.bbox.min[0]).toFixed(3));

// determinism: same geometry twice
for (const [fn, label] of [[doveFlightGeom, 'flying'], [dovePerchGeom, 'perched']]) {
  const a = new B(); fn(a);
  const c = new B(); fn(c);
  ok(a.i.length === c.i.length && a.v.length === c.v.length, label + ' not deterministic');
}

// ---- whole module (flocks + perches) with a stub ctx
const ctx = { gl: fakeGL, dyn: [], bbDyn: [], points: [], lanterns: [] };
const b = new B();
const rng = mulberry32(20261121);
buildDoves(b, ctx, rng);
const s = stats(b);
console.log('perched block: ' + JSON.stringify(s));
ok(s.stack === 1, 'module push/pop unbalanced', s.stack);
ok(s.badColor === 0, 'module badColor', s.badColor);
ok(s.bad === 0, 'module bad vertex');
ok(s.nan === 0, 'module NaN');
ok(ctx.dyn.length === 3, 'expected 3 inst actors', ctx.dyn.length);
ok(s.tris >= 7 * perch.tris * 0.98, 'perched geometry missing', s.tris);

// ---- flock fill: matrices valid, mode 0, sway in band, deterministic
const flockReport = [];
for (const d of ctx.dyn) {
  ok(d.kind === 'inst', d.name + ' not inst');
  ok(!!d.mesh, d.name + ' no mesh');
  ok(d.capacity >= 1, d.name + ' bad capacity');
  let maxN = 0, bad = 0, mode = 0, swayMin = 9, swayMax = -9;
  const seen = new Set();
  for (const t of [0, 3, 7.5, 21.3]) {
    const act = { data: new Float32Array(d.capacity * 20) };
    act.set = (i, mt, phase, sway, alpha, md) => {
      if (i >= d.capacity) bad++;
      if (mt.length !== 16) bad++;
      for (let k = 0; k < 16; k++) if (!Number.isFinite(mt[k])) bad++;
      if (md !== 0) mode++;
      swayMin = Math.min(swayMin, sway); swayMax = Math.max(swayMax, sway);
      act.data.set(mt, i * 20);
    };
    const n = d.fill(t, act);
    maxN = Math.max(maxN, n);
    // positions
    const pos = [];
    for (let i = 0; i < n; i++) pos.push([+act.data[i * 20 + 12].toFixed(1), +act.data[i * 20 + 13].toFixed(1), +act.data[i * 20 + 14].toFixed(1)]);
    if (t === 3) {
      let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
      for (const p of pos) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]); }
      flockReport.push({ name: d.name, n, bbox3d: { min: mn, max: mx } });
    }
    seen.add(n);
  }
  ok(maxN <= d.capacity, d.name + ' fill exceeds capacity', maxN);
  ok(bad === 0, d.name + ' bad instance data', bad);
  ok(mode === 0, d.name + ' not using mode 0', mode);
  ok(swayMin >= 0.3 && swayMax <= 0.95, d.name + ' sway out of band', swayMin + '..' + swayMax);
  ok(seen.size === 1, d.name + ' fill count not stable');
}

// near flock must sit in front of the terrace and be the biggest birds
const near = flockReport.find((f) => f.name === 'doves-near');
ok(near, 'no near flock');
if (near) {
  ok(near.bbox3d.min[2] < 92 && near.bbox3d.max[2] > 66, 'near flock not in view-12 space', JSON.stringify(near.bbox3d));
  ok(near.bbox3d.min[1] > 33 && near.bbox3d.max[1] < 48, 'near flock height off', JSON.stringify(near.bbox3d));
}
console.log('flocks: ' + JSON.stringify(flockReport));

// near flock must stay clear of the girl portrait camera (0.9,31.5,83)
{
  const nearActor = ctx.dyn.find((d) => d.name === 'doves-near');
  const PCAM = [0.9, 31.5, 83];
  let minD = 1e9, minT = 0;
  for (let ti = 0; ti <= 40; ti += 0.5) {
    const act = { data: new Float32Array(nearActor.capacity * 20) };
    act.set = (i, mt) => act.data.set(mt, i * 20);
    const n = nearActor.fill(ti, act);
    for (let i = 0; i < n; i++) {
      const p = [act.data[i * 20 + 12], act.data[i * 20 + 13], act.data[i * 20 + 14]];
      const dd = Math.hypot(p[0] - PCAM[0], p[1] - PCAM[1], p[2] - PCAM[2]);
      if (dd < minD) { minD = dd; minT = ti; }
    }
  }
  console.log('near-flock min distance to portrait cam: ' + minD.toFixed(2) + ' m at t=' + minT);
  ok(minD >= 6, 'near flock comes closer than 6 m to the portrait camera', minD.toFixed(2));
}

// perched pigeons: right size on the rail, and clear of the girl
{
  const h = (perch.bbox.max[1] - perch.bbox.min[1]) * 1.04;
  ok(h >= 0.28 && h <= 0.34, 'perched pigeon height not 0.28-0.34 m', h.toFixed(3));
  ok(Math.abs(perch.bbox.min[1] * 1.04) < 0.02, 'perched feet not on the rail top', perch.bbox.min[1]);
  for (const px of [-25.4, -18.6, -11.2, -5.4, 11.8, 19.4, 27.8]) ok(Math.abs(px - 3) >= 7, 'perch too close to the girl', px);
}

// determinism of the whole module with the same seed
const ctx2 = { gl: fakeGL, dyn: [], bbDyn: [], points: [], lanterns: [] };
const b2 = new B();
buildDoves(b2, ctx2, mulberry32(20261121));
ok(b2.i.length === b.i.length, 'module not deterministic');
ok(ctx2.dyn.length === ctx.dyn.length, 'actor count not deterministic');

console.log('');
if (fails.length) {
  console.log('FAIL (' + fails.length + ')');
  for (const f of fails) console.log('  - ' + f);
  process.exit(1);
}
console.log('PASS  flying=' + fly.tris + ' tris  perched=' + perch.tris + ' tris  module=' + s.tris + ' tris (static)  actors=' + ctx.dyn.length);