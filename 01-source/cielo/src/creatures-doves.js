// creatures-doves.js — pigeons / doves (OWNER: agent "doves").
// Contract: export function buildDoves(b, ctx, rng)
//   Static   : 7 perched pigeons gripping the terrace balustrade handrail, appended to b.
//   Dynamic  : 3 instanced flocks (2 high over the city + 1 right in front of the
//              terrace at (6,40,80)) driven by inst mode 0 (bird wing flap).
//
// Mesh local frame (flying):
//   +Z = forward (beak), +Y = up, wings spread along +-X, y = 0 on the body centre line.
//   Local wingspan ~1.05, beak-to-tail ~0.73.
//   The inst vertex shader lifts p.y by |x| in mode 0, so the wings MUST lie along +-X
//   and the body must stay near |x| ~ 0.09 so the flap cannot tear it apart.
//
// The flap is a pure vertical shear (dy = sin(t)*sway*|x|), i.e. the wing is hinged at
// the body and the tips travel furthest.  Two consequences shaped this mesh:
//   1. wing panels get a real dihedral + a raised hand, so the shear reads as a bend;
//   2. every feather group (primaries, secondaries, tail) is ONE continuous scalloped
//      sheet, not separate blades: separate blades would be pulled apart vertically by
//      the |x| shear and read as comb teeth.  Scallops + per-feather colour bands give
//      the individual-feather read without the gaps.
import { C } from './palette.js';
import { ellipsoid } from './lib3d.js';
import { B, mixc, mulc, rgb } from './geo.js';
import { mesh } from './gl.js';
import { trs } from './actor.js';
import { TAU } from './math.js';

// ---------------------------------------------------------------- palette
// Linear-space; deliberately a few stops below pure white so the bird keeps its
// modelling against the very bright sky, and grey-blue wings so the silhouette reads.
const DOVE_HI = mulc(C.dove, 0.96);
const DOVE_W = mixc(C.dove, C.doveShade, 0.20);
const DOVE_SOFT = mixc(C.dove, C.doveShade, 0.40);
// The scene's key light is ~1.4x, so a 0.7 albedo renders pure white.  These wing
// colours sit near 0.30-0.52 so the grey-blue actually reads in sunlight.
const MANTLE = mulc(mixc(C.dove, rgb('#a8bacf'), 0.46), 0.90);  // blue-grey back
const MANTLE_D = mixc(C.doveShade, rgb('#93a9c4'), 0.40);
const WING_TOP = mulc(mixc(C.dove, rgb('#93a9c4'), 0.52), 0.80);   // upper wing, inner
const WING_MID = mulc(mixc(C.doveShade, rgb('#7089a8'), 0.52), 0.80);
const WING_TIP = mulc(mixc(C.doveShade, rgb('#5f7896'), 0.60), 0.80);  // hand / primary tips
const WING_UNDER = mulc(mixc(DOVE_HI, C.doveShade, 0.26), 0.94);
const PRIM_1 = mulc(mixc(C.doveShade, rgb('#8098b4'), 0.55), 0.78);
const PRIM_2 = mulc(mixc(C.doveShade, rgb('#5e7a99'), 0.58), 0.78);
const NECK_G = mixc(C.doveShade, rgb('#7fbf9e'), 0.52);
const NECK_V = mixc(C.doveShade, rgb('#a894cc'), 0.40);
const BEAK_C = rgb('#e2955c');
const CERE_C = rgb('#e6dac8');
const FOOT_C = rgb('#d97f70');
const EYE_C = rgb('#241a18');
const EYE_HI = rgb('#fff6e8');
const MAT_FEATHER = [0.10, 0.09];   // a touch of self-light so the shaded underside stays pale
const MAT_BODY = [0.10, 0.13];
const MAT_EYE = [0.06, 0.85];
const MAT_BEAK = [0.02, 0.28];
const MAT_FOOT = [0.0, 0.16];

// ---------------------------------------------------------------- tiny vec helpers
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit3 = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const mix3 = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const centroid3 = (pts) => {
  let x = 0, y = 0, z = 0;
  for (const p of pts) { x += p[0]; y += p[1]; z += p[2]; }
  return [x / pts.length, y / pts.length, z / pts.length];
};
const xfP = (m, p) => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
];

// quad with per-vertex normals + per-vertex colours
function quadN(b, p0, p1, p2, p3, n0, n1, n2, n3, c0, c1, c2, c3, mat) {
  const a = b.vert(b.tp(p0), b.tn(n0), c0, mat);
  const d = b.vert(b.tp(p1), b.tn(n1), c1, mat);
  const e = b.vert(b.tp(p2), b.tn(n2), c2, mat);
  const f = b.vert(b.tp(p3), b.tn(n3), c3, mat);
  b.i.push(a, d, e, a, e, f);
}

function capRing(b, ring, dir, col, mat) {
  const c = centroid3(ring);
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i], q = ring[(i + 1) % ring.length];
    b.tri(c, p, q, col, mat, dir, dir, dir);
  }
}

// ---------------------------------------------------------------- scalloped feather sheet
// grid[r][j]: r = radial rows (0 = root, last = tip), j = columns across the fan.
// Odd columns are pulled in a little so the outer edge is scalloped into feathers.
// Emits a top and a bottom face (a real thin sheet, so it moves as one under the shear).
function featherSheet(b, grid, colFn, mat, thick) {
  const R = grid.length, C = grid[0].length;
  const nodes = grid.map((row, r) => row.map((p, j) => {
    const j0 = Math.max(0, j - 1), j1 = Math.min(C - 1, j + 1);
    const r0 = Math.max(0, r - 1), r1 = Math.min(R - 1, r + 1);
    const ta = sub3(grid[r][j1], grid[r][j0]);
    const tr = sub3(grid[r1][j], grid[r0][j]);
    let n = cross3(ta, tr);
    if (Math.hypot(n[0], n[1], n[2]) < 1e-9) n = [0, 1, 0];
    n = unit3(n);
    if (n[1] < 0) n = scl3(n, -1);
    return { p, n };
  }));
  for (let r = 0; r < R - 1; r++) {
    for (let j = 0; j < C - 1; j++) {
      const c = colFn(r / (R - 1), j / (C - 1), r, j);
      const a = nodes[r][j], bb = nodes[r][j + 1], cc = nodes[r + 1][j + 1], dd = nodes[r + 1][j];
      const ta = add3(a.p, scl3(a.n, thick * 0.5)), tb = add3(bb.p, scl3(bb.n, thick * 0.5));
      const tc = add3(cc.p, scl3(cc.n, thick * 0.5)), td = add3(dd.p, scl3(dd.n, thick * 0.5));
      const ba = sub3(a.p, scl3(a.n, thick * 0.5)), bbb = sub3(bb.p, scl3(bb.n, thick * 0.5));
      const bcc = sub3(cc.p, scl3(cc.n, thick * 0.5)), bdd = sub3(dd.p, scl3(dd.n, thick * 0.5));
      quadN(b, ta, tb, tc, td, a.n, bb.n, cc.n, dd.n, c, c, c, c, mat);
      const ina = scl3(a.n, -1), inb = scl3(bb.n, -1), inc = scl3(cc.n, -1), ind = scl3(dd.n, -1);
      quadN(b, ba, bdd, bcc, bbb, ina, ind, inc, inb, c, c, c, c, mat);
    }
  }
}

// ---------------------------------------------------------------- swept body along +Z
// prof: [[z, rx, ry, cy], ...]; smooth normals from the analytic ellipse gradient.
function sweepZ(b, prof, seg, colFn, mat, capStart, capEnd) {
  const K = prof.length;
  const P = (k, a) => [Math.cos(a) * prof[k][1], prof[k][3] + Math.sin(a) * prof[k][2], prof[k][0]];
  const N = (k, a) => {
    const p = prof[k];
    const k0 = Math.max(0, k - 1), k1 = Math.min(K - 1, k + 1);
    const dz = (prof[k1][0] - prof[k0][0]) || 1e-5;
    const drx = (prof[k1][1] - prof[k0][1]) / dz;
    const dry = (prof[k1][2] - prof[k0][2]) / dz;
    const dcy = (prof[k1][3] - prof[k0][3]) / dz;
    const ca = Math.cos(a), sa = Math.sin(a);
    return unit3([
      p[2] * ca,
      p[1] * sa,
      -(p[1] * dcy * sa + p[1] * dry * sa * sa + p[2] * drx * ca * ca),
    ]);
  };
  for (let k = 0; k < K - 1; k++) {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
      const p00 = P(k, a0), p10 = P(k, a1), p11 = P(k + 1, a1), p01 = P(k + 1, a0);
      const n00 = N(k, a0), n10 = N(k, a1), n11 = N(k + 1, a1), n01 = N(k + 1, a0);
      const c00 = colFn(k / (K - 1), a0), c10 = colFn(k / (K - 1), a1);
      const c11 = colFn((k + 1) / (K - 1), a1), c01 = colFn((k + 1) / (K - 1), a0);
      quadN(b, p00, p10, p11, p01, n00, n10, n11, n01, c00, c10, c11, c01, mat);
    }
  }
  if (capStart) {
    const ring = [];
    for (let i = 0; i < seg; i++) ring.push(P(0, (i / seg) * TAU));
    capRing(b, ring, [0, 0, -1], colFn(0, 0), mat);
  }
  if (capEnd) {
    const ring = [];
    for (let i = 0; i < seg; i++) ring.push(P(K - 1, (i / seg) * TAU));
    capRing(b, ring, [0, 0, 1], colFn(1, 0), mat);
  }
}

// ---------------------------------------------------------------- closed-ring loft
function loftRings(b, sections, colFn, mat, opts) {
  const o = opts || {};
  const rings = sections.map((pts) => {
    const c = centroid3(pts);
    return pts.map((p) => ({ p, ref: unit3(sub3(p, c)) }));
  });
  const K = rings.length, R = rings[0].length;
  const N = rings.map((row, k) => row.map((q, i) => {
    const k0 = Math.max(0, k - 1), k1 = Math.min(K - 1, k + 1);
    const i0 = (i - 1 + R) % R, i1 = (i + 1) % R;
    const tS = sub3(rings[k1][i].p, rings[k0][i].p);
    const tR = sub3(rings[k][i1].p, rings[k][i0].p);
    let n = cross3(tS, tR);
    if (Math.hypot(n[0], n[1], n[2]) < 1e-9) n = q.ref;
    n = unit3(n);
    if (n[0] * q.ref[0] + n[1] * q.ref[1] + n[2] * q.ref[2] < 0) n = scl3(n, -1);
    return n;
  }));
  for (let k = 0; k < K - 1; k++) {
    for (let i = 0; i < R; i++) {
      const i1 = (i + 1) % R;
      const p00 = rings[k][i].p, p10 = rings[k][i1].p;
      const p11 = rings[k + 1][i1].p, p01 = rings[k + 1][i].p;
      const n00 = N[k][i], n10 = N[k][i1], n11 = N[k + 1][i1], n01 = N[k + 1][i];
      const c0 = colFn(k / (K - 1), i / R, k, i);
      const c1 = colFn(k / (K - 1), (i + 1) / R, k, i);
      const c2 = colFn((k + 1) / (K - 1), (i + 1) / R, k, i);
      const c3 = colFn((k + 1) / (K - 1), i / R, k, i);
      quadN(b, p00, p10, p11, p01, n00, n10, n11, n01, c0, c1, c2, c3, mat);
    }
  }
  if (o.capA) capRing(b, rings[0].map((q) => q.p), o.capA, colFn(0, 0, 0, 0), mat);
  if (o.capB) capRing(b, rings[K - 1].map((q) => q.p), o.capB, colFn(1, 0, K - 1, 0), mat);
}

// ---------------------------------------------------------------- a single stiff feather
// (used for the folded primary tips of the perched bird, the alula and the tucked feet)
function feather(b, root, tip, up, wRoot, wTip, cRoot, cTip, mat, bow) {
  const d = unit3(sub3(tip, root));
  let perp = cross3(d, up);
  if (Math.hypot(perp[0], perp[1], perp[2]) < 1e-6) perp = [1, 0, 0];
  perp = unit3(perp);
  const mid = add3(root, scl3(sub3(tip, root), 0.54));
  if (bow) mid[1] += bow;
  const pts = [[root, wRoot], [mid, wRoot * 0.52 + wTip * 0.56], [tip, wTip]];
  const top = unit3(up), bot = scl3(top, -1);
  for (let s = 0; s < 2; s++) {
    const a = pts[s][0], wa = pts[s][1];
    const c = pts[s + 1][0], wc = pts[s + 1][1];
    const a1 = add3(a, scl3(perp, wa)), a2 = sub3(a, scl3(perp, wa));
    const c1 = add3(c, scl3(perp, wc)), c2 = sub3(c, scl3(perp, wc));
    b.quad(a1, c1, c2, a2, mix3(cRoot, cTip, s * 0.45), mat, top);
    b.quad(a1, a2, c2, c1, mix3(cRoot, cTip, (s + 1) * 0.45), mat, bot);
  }
}

// a straight little tube with radial normals (safe to mirror in x)
function tube3(b, pts, r0, r1, seg, col, mat) {
  const n = pts.length;
  const rings = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const r = r0 + (r1 - r0) * t;
    const tan = unit3(sub3(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]));
    let u = cross3(tan, [0, 1, 0]);
    if (Math.hypot(u[0], u[1], u[2]) < 1e-5) u = cross3(tan, [1, 0, 0]);
    u = unit3(u);
    const v = unit3(cross3(tan, u));
    const ring = [];
    for (let k = 0; k < seg; k++) {
      const a = (k / seg) * TAU;
      const dir = add3(scl3(u, Math.cos(a)), scl3(v, Math.sin(a)));
      ring.push({ p: add3(pts[i], scl3(dir, r)), n: dir });
    }
    rings.push(ring);
  }
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < seg; k++) {
      const k1 = (k + 1) % seg;
      const p00 = rings[i][k], p10 = rings[i][k1], p11 = rings[i + 1][k1], p01 = rings[i + 1][k];
      quadN(b, p00.p, p10.p, p11.p, p01.p, p00.n, p10.n, p11.n, p01.n, col, col, col, col, mat);
    }
  }
}

// ================================================================ body + neck + head
const BODY_PROF = [
  // z,     rx,    ry,    cy
  [-0.286, 0.009, 0.011, 0.004],
  [-0.254, 0.024, 0.031, 0.001],
  [-0.206, 0.043, 0.054, -0.004],
  [-0.148, 0.060, 0.077, -0.009],
  [-0.084, 0.072, 0.093, -0.014],
  [-0.018, 0.079, 0.102, -0.017],
  [0.044, 0.073, 0.096, -0.011],
  [0.094, 0.058, 0.079, 0.002],
  [0.130, 0.044, 0.059, 0.019],
  [0.158, 0.038, 0.047, 0.041],
  [0.178, 0.036, 0.043, 0.063],
];
const HEAD_PROF = [
  [0.160, 0.028, 0.030, 0.072],
  [0.184, 0.041, 0.044, 0.083],
  [0.212, 0.044, 0.047, 0.092],
  [0.238, 0.039, 0.041, 0.093],
  [0.254, 0.027, 0.028, 0.089],
];

function bodyCol(kn, a) {
  const up = Math.sin(a);
  let c;
  if (up > 0.30) c = mix3(MANTLE, DOVE_SOFT, 1 - up * 0.55);
  else if (up < -0.42) c = mix3(DOVE_SOFT, DOVE_HI, 1 + up * 0.6);
  else c = DOVE_W;
  if (kn > 0.34 && kn < 0.78 && up < -0.1) c = mix3(c, DOVE_HI, 0.35);
  if (kn > 0.80) {
    const t = (kn - 0.80) / 0.20;
    const band = Math.max(0, 1 - Math.abs(up - 0.20) * 1.35);
    c = mix3(c, kn > 0.90 ? NECK_V : NECK_G, band * t * 0.60);
  }
  return c;
}

function headCol(kn, a) {
  const up = Math.sin(a);
  let c = up > 0.4 ? mix3(DOVE_HI, DOVE_W, 0.5) : DOVE_HI;
  if (kn > 0.7) c = mix3(c, DOVE_W, 0.5);
  if (kn < 0.18) c = mix3(c, MANTLE, 0.40);
  return c;
}

function doveBodyHead(b) {
  b.note('doves-body');
  sweepZ(b, BODY_PROF, 15, bodyCol, MAT_BODY, true, false);
  sweepZ(b, HEAD_PROF, 13, headCol, MAT_BODY, true, true);

  // ---- beak: short, slightly down-curved, pale cere at the base
  const BEAK_PROF = [
    [0.246, 0.0165, 0.0140, 0.0885],
    [0.264, 0.0140, 0.0118, 0.0866],
    [0.280, 0.0100, 0.0086, 0.0842],
    [0.291, 0.0048, 0.0042, 0.0818],
    [0.297, 0.0016, 0.0015, 0.0802],
  ];
  sweepZ(b, BEAK_PROF, 8, () => BEAK_C, MAT_BEAK, false, true);
  b.push(trs([0, 0.0948, 0.249], 0, 1, 0, 0));
  ellipsoid(b, 0.0178, 0.0108, 0.0138, 6, 3, CERE_C, MAT_BEAK);
  b.pop();
  for (const s of [-1, 1]) {
    b.push(trs([s * 0.0074, 0.0955, 0.2565], 0, 1, 0, 0));
    ellipsoid(b, 0.0034, 0.0016, 0.0028, 4, 2, mulc(CERE_C, 0.5), MAT_BEAK);
    b.pop();
  }

  // ---- eyes
  for (const s of [-1, 1]) {
    b.push(trs([s * 0.0378, 0.0985, 0.2242], 0, 1, 0, 0));
    ellipsoid(b, 0.0110, 0.0120, 0.0104, 7, 4, EYE_C, MAT_EYE);
    b.pop();
    b.push(trs([s * 0.0418, 0.1036, 0.2284], 0, 1, 0, 0));
    ellipsoid(b, 0.0036, 0.0040, 0.0032, 5, 3, EYE_HI, MAT_EYE);
    b.pop();
  }
}

// ================================================================ tail: one scalloped sheet
function tailFan(b, spread, droop) {
  b.note('doves-tail');
  const O = [0, 0.004, -0.272];
  const N = 7;                 // feathers
  const C = N * 2 - 1;         // columns: even = feather tip, odd = notch
  const ang = 0.62 * spread;
  const grid = [];
  for (let r = 0; r < 3; r++) {
    const row = [];
    for (let j = 0; j < C; j++) {
      const t = j / (C - 1);
      const phi = -ang + 2 * ang * t;
      const tipCol = j % 2 === 0;
      const rIn = 0.024;
      const rTip = 0.170 + 0.012 * Math.sin(Math.PI * t) - (tipCol ? 0 : 0.020);
      const rr = r === 0 ? rIn : r === 1 ? rIn + (rTip - rIn) * 0.55 : rTip;
      const fall = Math.pow(rr / 0.17, 1.35);
      const y = O[1] + 0.002 - fall * (0.012 + droop * (0.075 + Math.abs(Math.sin(phi)) * 0.02));
      row.push([
        O[0] + Math.sin(phi) * rr,
        y + (r === 1 ? 0.004 : 0) + (tipCol ? 0 : 0.0015),
        O[2] - Math.cos(phi) * rr,
      ]);
    }
    grid.push(row);
  }
  featherSheet(b, grid, (rr, tt, ri, j) => {
    const tipCol = j % 2 === 0;
    const base = mix3(DOVE_HI, WING_TOP, 0.10 + rr * 0.30);
    const c = mix3(base, WING_TIP, rr * (tipCol ? 0.62 : 0.42) + (tipCol ? 0.06 : 0));
    return c;
  }, MAT_FEATHER, 0.006);
  // upper tail coverts: soft shell over the base of the fan
  for (let i = 0; i < 3; i++) {
    const f = i - 1;
    const root = [f * 0.011, 0.012 + Math.abs(f) * 0.003, -0.232];
    const tip = [f * 0.052 * spread, -0.002, -0.300 - Math.abs(f) * 0.012];
    feather(b, root, tip, [0, 1, 0], 0.021, 0.026, MANTLE, WING_TOP, MAT_FEATHER, 0.005);
  }
}

// ================================================================ flying wing
const WING_PROF = [
  // x,     y,     leZ,    teZ,    thick
  [0.044, 0.044, 0.090, -0.130, 0.030],
  [0.132, 0.050, 0.082, -0.176, 0.024],
  [0.232, 0.061, 0.070, -0.196, 0.020],
  [0.322, 0.075, 0.050, -0.186, 0.016],
  [0.396, 0.093, 0.024, -0.156, 0.012],
  [0.442, 0.109, -0.002, -0.122, 0.010],
];
const CT = [0.0, 0.22, 0.45, 0.68, 0.88, 1.0];
function wingAt(x) {
  const P = WING_PROF;
  let i = 0;
  while (i < P.length - 2 && x > P[i + 1][0]) i++;
  const t = Math.max(0, Math.min(1, (x - P[i][0]) / (P[i + 1][0] - P[i][0] || 1)));
  const L = (k) => P[i][k] + (P[i + 1][k] - P[i][k]) * t;
  return { y: L(1), le: L(2), te: L(3), th: L(4) };
}
function wingRing(st, s) {
  const x = st[0], y = st[1], le = st[2], te = st[3], th = st[4];
  const zAt = (ct) => le + (te - le) * ct;
  const upAt = (ct) => y + th * (0.30 + 0.95 * Math.sin(Math.PI * ct));
  const dnAt = (ct) => y - th * (0.22 + 0.50 * Math.sin(Math.PI * ct));
  const pts = [];
  for (let i = 0; i <= 4; i++) pts.push([x * s, upAt(CT[i]), zAt(CT[i])]);
  pts.push([x * s, y + 0.05 * th, zAt(1)]);
  for (let i = 4; i >= 1; i--) pts.push([x * s, dnAt(CT[i]), zAt(CT[i])]);
  return pts;
}
function wingCol(kn, ri) {
  if (ri >= 1 && ri <= 4) return mix3(WING_TOP, WING_MID, 0.06 + kn * 0.72);
  if (ri === 0) return mix3(WING_TOP, WING_TIP, 0.30 + kn * 0.62);
  if (ri === 5) return mix3(WING_MID, WING_TIP, 0.12 + kn * 0.72);
  return mix3(WING_UNDER, DOVE_HI, 0.28 + kn * 0.46);
}

// ---- primaries: ONE scalloped sheet fanned off the wrist (see header note)
function primaryFan(b, s) {
  const W = [0.372, 0.100, -0.062];
  const N = 9, C = N * 2 - 1;
  const th0 = -0.06, th1 = -1.52;
  const grid = [];
  for (let r = 0; r < 3; r++) {
    const row = [];
    for (let j = 0; j < C; j++) {
      const t = j / (C - 1);
      const th = th0 + (th1 - th0) * t;
      const tipCol = j % 2 === 0;
      const rIn = 0.030;
      const rTip = 0.150 + 0.054 * t * t - (tipCol ? 0 : 0.022);
      const rr = r === 0 ? rIn : r === 1 ? rIn + (rTip - rIn) * 0.58 : rTip;
      const y = 0.100 - 0.013 * t + (r === 1 ? 0.006 : 0) + (tipCol ? 0 : 0.0018);
      row.push([(W[0] + Math.cos(th) * rr) * s, y, W[2] + Math.sin(th) * rr]);
    }
    grid.push(row);
  }
  featherSheet(b, grid, (rr, tt, ri, j) => {
    const tipCol = j % 2 === 0;
    const c = mix3(mix3(DOVE_HI, WING_MID, 0.30 + rr * 0.55), PRIM_2, rr * 0.72);
    return mix3(c, tipCol ? PRIM_2 : PRIM_1, tipCol ? 0.18 : 0);
  }, MAT_FEATHER, 0.007);
}

// ---- secondaries: a second scalloped sheet tucked under the forearm's trailing edge
function secondaryFan(b, s) {
  const C = 13;
  const grid = [];
  for (let r = 0; r < 2; r++) {
    const row = [];
    for (let j = 0; j < C; j++) {
      const t = j / (C - 1);
      const x = 0.130 + (0.356 - 0.130) * t;
      const a = wingAt(x);
      const tipCol = j % 2 === 0;
      const len = 0.070 + 0.026 * t - (tipCol ? 0 : 0.017);
      const rr = r === 0 ? 0 : len;
      row.push([x * s, a.y - 0.005 - rr * 0.10 + (tipCol ? 0 : 0.0016), a.te + 0.012 - rr]);
    }
    grid.push(row);
  }
  featherSheet(b, grid, (rr, tt, ri, j) => {
    const tipCol = j % 2 === 0;
    const c = mix3(mix3(DOVE_HI, WING_MID, 0.22 + tt * 0.40), PRIM_1, rr * (tipCol ? 0.58 : 0.42));
    return c;
  }, MAT_FEATHER, 0.006);
}

function flightWing(b, s, detail) {
  b.note('doves-wing');
  const sections = WING_PROF.map((st) => wingRing(st, s));
  loftRings(b, sections, wingCol, MAT_FEATHER, { capB: [s, 0, 0] });
  secondaryFan(b, s);
  primaryFan(b, s);

  if (detail !== false) {
    // ---- upper coverts: three staggered rows of shingles over the arm
    for (let row = 0; row < 3; row++) {
      const n = 7 - row;
      for (let i = 0; i < n; i++) {
        const x = 0.070 + i * 0.047 + row * 0.016;
        const a = wingAt(Math.min(x, 0.42));
        const y = a.y + a.th * 0.72 + row * 0.0040;
        const back = 0.062 + row * 0.026 + (x / 0.44) * 0.024;
        const rootz = a.le - 0.005;
        // each shingle is wider than its pitch, so the row reads as one overlapping
        // feather band instead of a venetian blind
        const w = 0.031 + row * 0.004;
        const c = row === 0 ? mix3(DOVE_HI, WING_TOP, 0.06)
          : row === 1 ? mix3(WING_TOP, WING_MID, 0.22)
            : mix3(WING_MID, WING_TIP, 0.18);
        const A = [(x - w) * s, y, rootz], Bq = [(x + w) * s, y + 0.002, rootz - 0.016];
        const Cq = [(x + w * 0.82) * s, y + 0.001, rootz - back], Dq = [(x - w * 0.9) * s, y, rootz - back + 0.014];
        const upN = unit3([s * 0.22, 1, 0]);
        b.quad(A, Bq, Cq, Dq, c, MAT_FEATHER, upN);
        b.quad(A, Dq, Cq, Bq, c, MAT_FEATHER, scl3(upN, -1));
      }
    }
    // underwing coverts: a pale row so the underside is not a bare sheet
    for (let i = 0; i < 5; i++) {
      const x = 0.110 + i * 0.056;
      const a = wingAt(x);
      const y = a.y - a.th * 0.95;
      const uA = [x * s, y, a.le - 0.010], uB = [(x + 0.050) * s, y, a.le - 0.022];
      const uC = [(x + 0.044) * s, y + 0.002, a.te + 0.030], uD = [x * s, y + 0.002, a.te + 0.040];
      b.quad(uA, uB, uC, uD, mix3(DOVE_HI, WING_UNDER, 0.35), MAT_FEATHER, [0, -1, 0]);
      b.quad(uA, uD, uC, uB, mix3(DOVE_HI, WING_UNDER, 0.35), MAT_FEATHER, [0, 1, 0]);
    }
  }
  // ---- alula (thumb) tuft at the wrist
  feather(b, [0.396 * s, 0.100, 0.008], [0.452 * s, 0.111, -0.042], [s * 0.25, 1, 0],
    0.007, 0.010, DOVE_HI, WING_MID, MAT_FEATHER, 0.002);
}

// ================================================================ perched (folded) wing
const FOLD_STATIONS = [
  // z,     xin,   xout,  yTop,   yBot
  [0.116, 0.030, 0.052, 0.078, 0.012],
  [0.004, 0.038, 0.074, 0.064, -0.020],
  [-0.106, 0.035, 0.072, 0.034, -0.046],
  [-0.204, 0.027, 0.056, 0.002, -0.058],
  [-0.276, 0.018, 0.037, -0.018, -0.056],
];
function foldSection(st, s) {
  const z = st[0], xin = st[1], xout = st[2], yt = st[3], yb = st[4];
  const ym = (yt + yb) * 0.5;
  return [
    [xin * 0.35 * s, yt, z],
    [xout * 0.78 * s, yt * 0.82 + yb * 0.18, z],
    [xout * s, ym, z],
    [xout * 0.80 * s, yt * 0.16 + yb * 0.84, z],
    [xin * 0.35 * s, yb, z],
    [xin * 0.02 * s, ym - (yt - yb) * 0.10, z],
  ];
}
function perchWing(b, s) {
  const sections = FOLD_STATIONS.map((st) => foldSection(st, s));
  loftRings(b, sections, (kn, i) => {
    if (i === 0 || i === 5) return mix3(MANTLE, WING_TOP, 0.5);
    if (i === 2) return mix3(WING_TOP, WING_TIP, 0.10 + kn * 0.55);
    return mix3(DOVE_W, WING_TOP, 0.42 + kn * 0.2);
  }, MAT_FEATHER, { capA: [s, 0, 0], capB: [s, 0.25, -0.96] });
  // folded primaries: stiff slats stacked over the flank and crossing the tail
  for (let i = 0; i < 4; i++) {
    const t = i / 3;
    const root = [(0.052 - i * 0.008) * s, 0.032 - t * 0.032, -0.118 - i * 0.008];
    const tip = [(0.030 - i * 0.007) * s, -0.030 - t * 0.028, -0.300 - i * 0.016 + (i % 2) * 0.006];
    const c0 = mix3(WING_TOP, WING_MID, 0.10 + t * 0.35);
    const c1 = mix3(WING_MID, PRIM_2, 0.35 + t * 0.40);
    feather(b, root, tip, [s * 0.9, 0.35, 0], 0.011, 0.013, c0, c1, MAT_FEATHER, -0.004);
  }
  // shoulder covert shell
  feather(b, [0.048 * s, 0.064, 0.090], [0.040 * s, 0.014, -0.056], [s * 0.9, 0.4, 0],
    0.020, 0.024, DOVE_HI, WING_TOP, MAT_FEATHER, -0.006);
}

// ================================================================ legs
function perchLeg(b, hip) {
  const ankle = [hip[0] * 0.88, 0.030, hip[2] + 0.014];
  tube3(b, [hip, [hip[0] * 0.94, (hip[1] + 0.030) * 0.5, hip[2] + 0.007], ankle],
    0.0092, 0.0068, 5, FOOT_C, MAT_FOOT);
  const toes = [[-0.010, 0.052, 0.0042], [-0.030, -0.012, 0.0036], [0.026, -0.006, 0.0036]];
  for (let i = 0; i < toes.length; i++) {
    const dx = toes[i][0], dz = toes[i][1], w = toes[i][2];
    tube3(b, [[ankle[0], ankle[1] - 0.004, ankle[2]],
      [ankle[0] + dx * 0.55, 0.007, ankle[2] + dz * 0.6],
      [ankle[0] + dx, 0.0045, ankle[2] + dz]], w, w * 0.45, 4, FOOT_C, MAT_FOOT);
  }
  tube3(b, [[ankle[0], ankle[1] - 0.004, ankle[2]], [ankle[0], 0.008, ankle[2] - 0.020]],
    0.0034, 0.0022, 4, FOOT_C, MAT_FOOT);
}

// ================================================================ whole-bird geometry
export function doveFlightGeom(b) {
  doveBodyHead(b);
  tailFan(b, 1.0, 0);
  flightWing(b, 1, true);
  flightWing(b, -1, true);
  for (const s of [-1, 1]) {
    feather(b, [s * 0.0265, -0.083, 0.052], [s * 0.0205, -0.074, -0.096], [s * 1, 0.25, 0],
      0.0085, 0.0045, FOOT_C, mulc(FOOT_C, 0.86), MAT_FOOT, 0.002);
  }
}

export function dovePerchGeom(b) {
  const POSE = trs([0, 0.176, 0.006], 0, 1, 0.40, 0);
  const hipL = xfP(POSE, [0.0305, -0.078, 0.032]);
  const hipR = xfP(POSE, [-0.0305, -0.078, 0.032]);
  b.push(POSE);
  doveBodyHead(b);
  tailFan(b, 0.34, 1.0);
  perchWing(b, 1);
  perchWing(b, -1);
  b.pop();
  perchLeg(b, hipL);
  perchLeg(b, hipR);
}

// ================================================================ flocks
const RAIL = { EDGE: 93.0, BOWH: 34, BOW: 9.0, TOP: 31.203 };
function railZ(x) {
  const ax = Math.abs(x);
  if (ax >= RAIL.BOWH) return RAIL.EDGE;
  return RAIL.EDGE - RAIL.BOW * Math.pow(Math.cos((Math.PI * 0.5 * ax) / RAIL.BOWH), 1.3);
}

const FLOCKS = [
  {
    name: 'doves-high-cathedral',
    n: 17, cx: -96, cz: -24, jitter: 7,
    r0: 30, r1: 46, sq0: 0.78, sq1: 0.96,
    y0: 43, y1: 67, bob: 1.9, tilt: 1.5,
    s0: 1.45, s1: 1.95, sway0: 0.50, sway1: 0.72,
    om0: 0.085, om1: 0.155,
  },
  {
    name: 'doves-high-palace',
    n: 17, cx: 104, cz: 44, jitter: 6,
    r0: 24, r1: 38, sq0: 0.76, sq1: 0.98,
    y0: 48, y1: 70, bob: 1.7, tilt: 1.3,
    s0: 1.45, s1: 1.95, sway0: 0.50, sway1: 0.74,
    om0: 0.095, om1: 0.170,
  },
  {
    // straddles the belvedere bow: the near flock for view 12 ("白鸽")
    name: 'doves-near',
    n: 14, cx: 9, cz: 72, jitter: 2.6,
    r0: 9, r1: 15, sq0: 0.74, sq1: 0.94,
    y0: 38.5, y1: 43.5, bob: 1.25, tilt: 1.0,
    s0: 1.60, s1: 2.00, sway0: 0.55, sway1: 0.80,
    om0: 0.20, om1: 0.34,
  },
];

function makeFlock(rng, o) {
  const birds = [];
  for (let i = 0; i < o.n; i++) {
    const dir = i % 2 === 0 ? 1 : -1;
    birds.push({
      cx: o.cx + (rng() - 0.5) * 2 * o.jitter,
      cz: o.cz + (rng() - 0.5) * 2 * o.jitter,
      r: o.r0 + rng() * (o.r1 - o.r0),
      sq: o.sq0 + rng() * (o.sq1 - o.sq0),
      // evenly spread phases (golden angle) so the flock never clumps in one blob
      ph: ((i * 0.6180339887 + rng() * 0.10) % 1) * TAU,
      om: dir * (o.om0 + rng() * (o.om1 - o.om0)),
      y: o.y0 + rng() * (o.y1 - o.y0),
      bob: o.bob * (0.35 + rng() * 0.9),
      bs: 0.30 + rng() * 0.45,
      bph: rng() * TAU,
      tilt: o.tilt * (0.4 + rng() * 1.1),
      tph: rng() * TAU,
      sc: o.s0 + rng() * (o.s1 - o.s0),
      sway: o.sway0 + rng() * (o.sway1 - o.sway0),
      wph: 0.25 + rng() * 0.75,
      wom: 0.05 + rng() * 0.05,
    });
  }
  return birds;
}

function flockFill(birds) {
  return function fill(t, act) {
    for (let k = 0; k < birds.length; k++) {
      const q = birds[k];
      const a = q.ph + t * q.om;
      const wob = Math.sin(t * q.wom + q.ph * 1.7);
      const x = q.cx + Math.cos(a) * q.r + wob * 1.3;
      const z = q.cz + Math.sin(a) * q.r * q.sq + Math.cos(t * q.wom * 1.3 + q.ph) * 1.3;
      const y = q.y + Math.sin(t * q.bs + q.bph) * q.bob + Math.sin(a * 2 + q.tph) * q.tilt;
      const vx = -Math.sin(a) * q.r * q.om;
      const vz = Math.cos(a) * q.r * q.sq * q.om;
      const vy = Math.cos(t * q.bs + q.bph) * q.bob * q.bs;
      const h = Math.hypot(vx, vz) || 1e-4;
      const yaw = Math.atan2(-vx, vz);
      const pitch = Math.atan2(vy, h) * 0.85;
      // local +X is the bird's left wing and points outward from the orbit,
      // so a turn with omega > 0 needs a negative roll.
      const bank = (q.om > 0 ? -1 : 1) * Math.min(0.60, Math.abs(q.om) * 3.4 + 0.10);
      const roll = bank + Math.sin(t * 0.8 + q.tph) * 0.09;
      act.set(k, trs([x, y, z], yaw, q.sc, pitch, roll), q.ph, q.sway, 1, 0);
    }
    return birds.length;
  };
}

// ================================================================ perched pigeons
// Real scale on the handrail: the perched mesh is ~0.30 local units tall, so a
// scale of ~1.0 gives the 0.28-0.34 m pigeon the terrace needs.
const PERCH_SCALE = 1.04;
const PERCHES = [
  { x: -25.4, yaw: Math.PI * 0.42 },
  { x: -18.6, yaw: Math.PI * 1.10 },
  { x: -11.2, yaw: Math.PI * 0.58 },
  { x: -5.4, yaw: Math.PI * 0.90 },
  { x: 11.8, yaw: Math.PI * 1.18 },
  { x: 19.4, yaw: Math.PI * 0.50 },
  { x: 27.8, yaw: Math.PI * 1.04 },
];

function buildPerched(b, rng) {
  b.note('doves-perch');
  for (let i = 0; i < PERCHES.length; i++) {
    const p = PERCHES[i];
    const z = railZ(p.x);
    const wob = (rng() - 0.5) * 0.08;
    const lift = (rng() - 0.5) * 0.012;
    b.push(trs([p.x, RAIL.TOP + 0.002 + lift, z], p.yaw + wob, PERCH_SCALE, 0.02, 0.04 * (rng() - 0.5)));
    dovePerchGeom(b);
    b.pop();
  }
}

// ================================================================ entry
export function buildDoves(b, ctx, rng) {
  const gl = ctx.gl;
  const localMesh = (fn) => {
    const nb = new B();
    fn(nb);
    const r = nb.build(gl);
    return mesh(gl, r.verts, r.indices);
  };

  buildPerched(b, rng);

  for (let i = 0; i < FLOCKS.length; i++) {
    const spec = FLOCKS[i];
    const birds = makeFlock(rng, spec);
    const near = spec.name === 'doves-near';
    const m = near
      ? localMesh((nb) => doveFlightGeom(nb))
      : localMesh((nb) => {
        doveBodyHead(nb);
        tailFan(nb, 1.0, 0);
        flightWing(nb, 1, false);
        flightWing(nb, -1, false);
        for (const s of [-1, 1]) {
          feather(nb, [s * 0.0265, -0.083, 0.052], [s * 0.0205, -0.074, -0.096], [s * 1, 0.25, 0],
            0.0085, 0.0045, FOOT_C, mulc(FOOT_C, 0.86), MAT_FOOT, 0.002);
        }
      });
    ctx.dyn.push({
      name: spec.name,
      kind: 'inst',
      mesh: m,
      capacity: birds.length + 2,
      fill: flockFill(birds),
    });
  }
}