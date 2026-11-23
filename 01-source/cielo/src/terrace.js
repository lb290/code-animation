// TERRACE — the marble balcony the visitor stands on, and the gardens around it.
// OWNER: agent "stage".
//
//   buildTerrace(b, ctx, rng) -> void
//
// The terrace plane already exists as simple massing in world.js (buildTerraceMassing);
// this module adds the real thing: the curved carved balustrade with arched panels
// (the reference's foreground), the wide stair down to the boulevard, urns, topiary,
// climbing vines, potted flowers, two lamp standards, and the gold-trimmed railing.
// The balustrade runs along L.terrace at y = L.terrace.y, facing -Z (the city).
import { C } from './palette.js';
import { MT, ellipsoid, tubePath, disc } from './lib3d.js';
import { box, cylinder, lathe, mulc, mixc } from './geo.js';
import { L } from './layout.js';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------- anchors
const TER = L.terrace;
const Y0 = TER.y;          // deck level (30)
const HALF = 47;           // the balustrade runs x = -47 .. 47
const EDGE = 93.0;         // world slab's city-facing edge (the deck ends here)
const BOWH = 34;           // the belvedere bow spans x = -34 .. 34
const BOW = 9.0;           // ... and projects 9 m over the boulevard
const FACADE_Z = 124.0;    // palace frontage behind the terrace
const MOD = 2.1;           // balustrade module (pier pitch)

// ---------------------------------------------------------------- palette
const MARBLE = mulc(mixc(C.marble, C.stoneCool, 0.34), 0.94);
const MARBLE_HI = mulc(mixc(C.marble, C.stoneCool, 0.10), 0.92);
const MARBLE_SH = mulc(mixc(C.marbleShade, C.stoneCool, 0.42), 0.94);
const MARBLE_DK = mulc(mixc(C.stoneCool, C.slateLight, 0.22), 0.92);
const STONE = mulc(mixc(C.stone, C.stonePale, 0.24), 0.98);
const STONE_SH = mulc(mixc(C.stoneWarm, C.stoneCool, 0.36), 0.94);
const MASS = [0.135, 0.07];  // stone that holds a little bounce in the shade
const MM = [0.105, 0.16];    // marble: a touch of self-light so shadowed stone stays pale
const MMR = [0.105, 0.24];   // polished marble (handrail, deck)
const GOLD = C.gold;
const GOLD_B = C.goldBright;
const IRON = mixc(C.iron, C.slateDark, 0.25);
const GLASS = mixc(C.glass, C.cloudLit, 0.12);
const GLASS_D = C.glassDeep;
const LEAF = C.leaf, LEAF_L = C.leafLight, LEAF_D = C.leafDark;

// ---------------------------------------------------------------- helpers
// column-major TRS: local +X = ( cos yaw, 0, sin yaw ), local +Z = ( -sin yaw, 0, cos yaw )
function mtr(x, y, z, yaw = 0, s = 1) {
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  return [c * s, 0, sn * s, 0, 0, s, 0, 0, -sn * s, 0, c * s, 0, x, y, z, 1];
}
function at(b, x, y, z, yaw, fn) {
  b.push(mtr(x, y, z, yaw));
  fn();
  b.pop();
}

// ---- the belvedere bow: z of the balustrade centre-line for a given x --------
function railZ(x) {
  const ax = Math.abs(x);
  if (ax >= BOWH) return EDGE;
  const k = Math.cos((Math.PI * 0.5 * ax) / BOWH);
  return EDGE - BOW * Math.pow(k, 1.3);
}
function railSlope(x) {
  const d = 0.12;
  return (railZ(x + d) - railZ(x - d)) / (2 * d);
}
function railYaw(x) {
  return Math.atan2(railSlope(x), 1);
}
// outward (city-side) normal of the plan curve
function railN(x) {
  const m = railSlope(x), l = Math.hypot(m, 1);
  return [m / l, 0, -1 / l];
}

// arc-length table so panels sit at exact module pitch along the curve
function railTable() {
  const sx = [], sz = [], ss = [];
  let s = 0, px = -HALF, pz = railZ(-HALF);
  for (let x = -HALF; x <= HALF + 1e-6; x += 0.25) {
    const z = railZ(x);
    s += Math.hypot(x - px, z - pz);
    sx.push(x); sz.push(z); ss.push(s);
    px = x; pz = z;
  }
  return { sx, sz, ss, total: s };
}
function atArc(R, s) {
  const { sx, sz, ss } = R;
  if (s <= 0) return { x: sx[0], z: sz[0], yaw: railYaw(sx[0]) };
  if (s >= R.total) { const l = sx.length - 1; return { x: sx[l], z: sz[l], yaw: railYaw(sx[l]) }; }
  let lo = 0, hi = ss.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ss[mid] <= s) lo = mid; else hi = mid;
  }
  const t = (s - ss[lo]) / Math.max(1e-6, ss[hi] - ss[lo]);
  const x = sx[lo] + (sx[hi] - sx[lo]) * t;
  const z = sz[lo] + (sz[hi] - sz[lo]) * t;
  return { x, z, yaw: railYaw(x) };
}

// a round boss facing -Z (local), for plinth rosettes
function bossZ(b, cy, cz, r, seg, col, mat, dir = -1) {
  const N = [0, 0, -dir];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const o0 = [c0 * r * 1.45, cy + s0 * r * 1.45, cz];
    const o1 = [c1 * r * 1.45, cy + s1 * r * 1.45, cz];
    const i0 = [c0 * r * 0.92, cy + s0 * r * 0.92, cz + dir * 0.03];
    const i1 = [c1 * r * 0.92, cy + s1 * r * 0.92, cz + dir * 0.03];
    b.quad(o0, o1, i1, i0, mulc(col, 0.94), mat, N);
    // dome of the boss
    const t0 = [c0 * r * 0.42, cy + s0 * r * 0.42, cz + dir * 0.085];
    const t1 = [c1 * r * 0.42, cy + s1 * r * 0.42, cz + dir * 0.085];
    b.tri(i0, i1, t1, col, mat, [c0 * 0.5, s0 * 0.5, dir], [c1 * 0.5, s1 * 0.5, dir], [c0 * 0.2, s0 * 0.2, dir]);
    b.tri(i0, t1, t0, col, mat, [c0 * 0.5, s0 * 0.5, dir], [c1 * 0.2, s1 * 0.2, dir], [c0 * 0.2, s0 * 0.2, dir]);
    b.tri([0, cy, cz + dir * 0.105], t0, t1, GOLD_B, MT.gold, [0, 0, dir], [0, 0, dir], [0, 0, dir]);
  }
}

// sweep a closed 2-D profile (dz, dy) along samples — for handrails and mouldings
function sweepProfile(b, samples, prof, yBase, col, mat, opt = {}) {
  const n = samples.length, m = prof.length;
  let cz = 0, cy = 0;
  for (const p of prof) { cz += p[0]; cy += p[1]; }
  cz /= m; cy /= m;
  const pn = prof.map((p, i) => {
    const a = prof[(i - 1 + m) % m], c2 = prof[(i + 1) % m];
    let nx = c2[1] - a[1], ny = -(c2[0] - a[0]);
    const l = Math.hypot(nx, ny) || 1;
    nx /= l; ny /= l;
    if ((p[0] - cz) * nx + (p[1] - cy) * ny < 0) { nx = -nx; ny = -ny; }
    return [nx, ny];
  });
  const shade = 0.80 + 0.34 * (opt.shade ?? 1);
  for (let i = 0; i < n - 1; i++) {
    const A = samples[i], B = samples[i + 1];
    const ca = Math.cos(A.yaw), sa = Math.sin(A.yaw), cb = Math.cos(B.yaw), sb = Math.sin(B.yaw);
    for (let j = 0; j < m; j++) {
      const j2 = (j + 1) % m;
      const p0 = prof[j], p1 = prof[j2], n0 = pn[j], n1 = pn[j2];
      const P = (x, z, c, s, p) => [x - s * p[0], yBase + p[1], z + c * p[0]];
      const NN = (c, s, nn) => {
        const v = [-s * nn[0], nn[1], c * nn[0]];
        const l = Math.hypot(v[0], v[1], v[2]) || 1;
        return [v[0] / l, v[1] / l, v[2] / l];
      };
      const a0 = P(A.x, A.z, ca, sa, p0), a1 = P(A.x, A.z, ca, sa, p1);
      const b0 = P(B.x, B.z, cb, sb, p0), b1 = P(B.x, B.z, cb, sb, p1);
      const na = NN(ca, sa, n0), nb = NN(ca, sa, n1), nc = NN(cb, sb, n0), nd = NN(cb, sb, n1);
      const cc = mulc(col, shade * (0.86 + 0.14 * Math.max(0, n0[1])));
      b.tri(a0, a1, b1, cc, mat, na, nb, nd);
      b.tri(a0, b1, b0, cc, mat, na, nd, nc);
    }
  }
  // end caps
  if (opt.caps !== false && n >= 2) {
    for (const [idx, dir] of [[0, -1], [n - 1, 1]]) {
      const A = samples[idx], c = Math.cos(A.yaw), s = Math.sin(A.yaw);
      const N = [s * dir, 0, -c * dir];
      const P = (p) => [A.x - s * p[0], yBase + p[1], A.z + c * p[0]];
      const ctr = P([cz, cy]);
      for (let j = 0; j < m; j++) {
        b.tri(ctr, P(prof[j]), P(prof[(j + 1) % m]), mulc(col, 0.9), mat, N, N, N);
      }
    }
  }
}

// ---------------------------------------------------------------- balustrade panel
const PW = MOD / 2;         // half module
const TH = 0.56;            // panel thickness
const OZ = -TH / 2;         // outer (city) face
const IZ = TH / 2;          // inner (deck) face
const BASE_H = 0.22;
const WALL_TOP = 1.00;
const OPEN_R = 0.70;
const SPRING = 0.26;
const RAIL_Y = 1.04;        // handrail seat (rail crown ends up at y = 1.20)

function baluster(b) {
  // vase-shaped colonnette under each arch — the reference's signature
  const prof = [
    [0.095, 0.300], [0.072, 0.345], [0.050, 0.430], [0.068, 0.545],
    [0.044, 0.690], [0.058, 0.800], [0.080, 0.862], [0.082, 0.920],
  ];
  lathe(b, prof, 6, mixc(MARBLE, C.stonePale, 0.4), MT.marble, { smooth: true });
}

function panel(b) {
  const hw = PW;
  // ---- plinth -------------------------------------------------------------
  at(b, 0, BASE_H * 0.5, 0, 0, () => box(b, hw * 2, BASE_H, TH + 0.20, MARBLE_SH, MT.marble, { topCol: MARBLE }));
  at(b, 0, BASE_H - 0.018, 0, 0, () => box(b, hw * 2, 0.05, TH + 0.30, MARBLE, MT.marble, { topCol: MARBLE_HI }));
  // recessed panel + rosette on the city face
  at(b, 0, BASE_H * 0.52, OZ - 0.10, 0, () => box(b, hw * 1.5, BASE_H * 0.50, 0.05, mulc(MARBLE_SH, 0.84), MT.stone));
  {
    const zf = OZ - 0.125;
    bossZ(b, 0.115, zf, 0.070, 6, MARBLE, MT.marble, -1);
  }
  // ---- arcade wall --------------------------------------------------------
  const colF = MARBLE, colB = MARBLE_SH;
  // piers: only on the +x side; the neighbouring panel supplies the other side
  b.quad([OPEN_R, BASE_H, OZ], [hw, BASE_H, OZ], [hw, WALL_TOP, OZ], [OPEN_R, WALL_TOP, OZ], colF, MM, [0, 0, -1]);
  b.quad([hw, BASE_H, IZ], [OPEN_R, BASE_H, IZ], [OPEN_R, WALL_TOP, IZ], [hw, WALL_TOP, IZ], colB, MM, [0, 0, 1]);
  // outer face of the pier's outer side
  b.quad([hw, BASE_H, OZ], [hw, BASE_H, IZ], [hw, WALL_TOP, IZ], [hw, WALL_TOP, OZ], mulc(colF, 0.94), MT.marble, [1, 0, 0]);
  // arch spandrel: fan from the semicircle up to the wall top, front and back
  const SEG = 7;
  for (let i = 0; i < SEG; i++) {
    const a0 = (i / SEG) * Math.PI, a1 = ((i + 1) / SEG) * Math.PI;
    const x0 = Math.cos(a0) * OPEN_R, x1 = Math.cos(a1) * OPEN_R;
    const y0 = SPRING + Math.sin(a0) * OPEN_R, y1 = SPRING + Math.sin(a1) * OPEN_R;
    b.quad([x0, y0, OZ], [x1, y1, OZ], [x1, WALL_TOP, OZ], [x0, WALL_TOP, OZ], colF, MM, [0, 0, -1]);
    b.quad([x1, y1, IZ], [x0, y0, IZ], [x0, WALL_TOP, IZ], [x1, WALL_TOP, IZ], colB, MM, [0, 0, 1]);
    // intrados: the arch soffit between front and back arcs
    const am = (a0 + a1) * 0.5;
    const ns = [-Math.cos(am), -Math.sin(am), 0];
    b.quad([x0, y0, OZ], [x0, y0, IZ], [x1, y1, IZ], [x1, y1, OZ], mulc(MARBLE, 0.82), MM, ns);
  }
  // sill across the opening + reveals at the springing
  b.quad([-OPEN_R, SPRING, OZ], [OPEN_R, SPRING, OZ], [OPEN_R, SPRING, IZ], [-OPEN_R, SPRING, IZ], mulc(MARBLE_HI, 0.9), MT.marble, [0, 1, 0]);
  for (const sx of [-1, 1]) {
    b.quad([sx * OPEN_R, BASE_H, OZ], [sx * OPEN_R, BASE_H, IZ], [sx * OPEN_R, SPRING, IZ], [sx * OPEN_R, SPRING, OZ], mulc(MARBLE_DK, 0.9), MT.marble, [-sx, 0, 0]);
  }
  // pier capital: a small projecting abacus under the cap (Beaux-Arts pilaster head)
  at(b, 0.875, WALL_TOP - 0.075, 0, 0, () => box(b, 0.44, 0.085, TH + 0.20, MARBLE_HI, MT.marble));
  at(b, 0.875, BASE_H + 0.055, 0, 0, () => box(b, 0.38, 0.055, TH + 0.14, MARBLE, MT.marble));
  // ---- cap moulding + handrail seat --------------------------------------
  at(b, 0, WALL_TOP + 0.038, 0, 0, () => box(b, hw * 2, 0.078, TH + 0.20, MARBLE, MM, { topCol: MARBLE_HI }));
  // wall top face under the moulding
  b.quad([-hw, WALL_TOP, OZ], [hw, WALL_TOP, OZ], [hw, WALL_TOP, IZ], [-hw, WALL_TOP, IZ], MARBLE_SH, MT.marble, [0, 1, 0]);
  // colonnette
  b.push(mtr(0, 0, 0, 0));
  baluster(b);
  b.pop();
  // small gold bead on the pier face (reference's gilded trim)
  b.push(mtr(0.84, 0.62, OZ - 0.03, 0));
  ellipsoid(b, 0.045, 0.09, 0.03, 5, 3, GOLD_B, MT.gold);
  b.pop();
}

// ---------------------------------------------------------------- balustrade run
function balustrade(b) {
  const R = railTable();
  // panels, skipping where the lamps stand
  const N = Math.round((R.total - MOD) / MOD);
  for (let i = 0; i < N; i++) {
    const s = MOD * 0.5 + i * MOD;
    if (s > R.total - MOD * 0.5) break;
    const p = atArc(R, s);
    b.push(mtr(p.x, Y0, p.z, p.yaw));
    panel(b);
    b.pop();
  }
  // ---- handrail: a moulded marble rail swept along the whole curve --------
  const railProf = [
    [-0.34, 0.000], [-0.34, 0.055], [-0.28, 0.105], [-0.20, 0.140],
    [-0.10, 0.158], [0.00, 0.163], [0.10, 0.158], [0.20, 0.140],
    [0.28, 0.105], [0.34, 0.055], [0.34, 0.000], [0.26, -0.030],
    [-0.26, -0.030],
  ];
  const rs = [];
  for (let s = 0; s <= R.total + 1e-6; s += 1.1) rs.push(atArc(R, s));
  if (rs[rs.length - 1] !== undefined) {
    const last = atArc(R, R.total);
    if (Math.abs(rs[rs.length - 1].x - last.x) > 0.05) rs.push(last);
  }
  sweepProfile(b, rs, railProf, Y0 + RAIL_Y, MARBLE_HI, MMR, { caps: true });
  // gold fillet under the rail
  const filProf = [[-0.10, -0.055], [0.10, -0.055], [0.10, -0.098], [-0.10, -0.098]];
  sweepProfile(b, rs, filProf, Y0 + RAIL_Y, GOLD, MT.gold, { caps: true });
}

// ---------------------------------------------------------------- deck / belvedere
function buildDeck(b) {
  const xs = [];
  for (let x = -HALF; x <= HALF + 1e-6; x += 0.7) xs.push(x);
  const n = xs.length;
  const outZ = xs.map((x) => railZ(x) - 0.40);
  const innZ = xs.map(() => EDGE);
  const FASCIA = 0.95;
  // deck top (flush with the world slab, which ends exactly at z = EDGE)
  for (let i = 0; i < n - 1; i++) {
    const a = [xs[i], Y0, innZ[i]], b2 = [xs[i + 1], Y0, innZ[i + 1]];
    const c = [xs[i + 1], Y0, outZ[i + 1]], d = [xs[i], Y0, outZ[i]];
    const sh = 0.94 + 0.06 * ((i % 3) / 2);
    b.quad(a, b2, c, d, mulc(MARBLE, sh), MMR, [0, 1, 0]);
  }
  // outer fascia + stepped soffit
  for (let i = 0; i < n - 1; i++) {
    const nrm = railN(xs[i]);
    const nrm2 = railN(xs[i + 1]);
    const NN = [(nrm[0] + nrm2[0]) / 2, 0, (nrm[2] + nrm2[2]) / 2];
    const p0 = [xs[i], Y0 - 0.06, outZ[i]], p1 = [xs[i + 1], Y0 - 0.06, outZ[i + 1]];
    const p2 = [xs[i + 1], Y0 - FASCIA, outZ[i + 1]], p3 = [xs[i], Y0 - FASCIA, outZ[i]];
    b.quad(p0, p1, p2, p3, MARBLE_SH, MT.marble, NN);
    // soffit rising back to the wall
    const q0 = p3, q1 = p2;
    const r0 = [xs[i], Y0 - 3.4, EDGE - 0.2], r1 = [xs[i + 1], Y0 - 3.4, EDGE - 0.2];
    const SN = [0, -0.9, -0.42];
    const sl = Math.hypot(SN[1], SN[2]);
    b.quad(q0, q1, r1, r0, mulc(STONE_SH, 0.92), MT.stone, [0, SN[1] / sl, SN[2] / sl]);
    // thin moulding band at the fascia's foot
    b.quad([xs[i], Y0 - FASCIA, outZ[i] + 0.02], [xs[i + 1], Y0 - FASCIA, outZ[i + 1] + 0.02],
      [xs[i + 1], Y0 - FASCIA - 0.12, outZ[i + 1] + 0.12], [xs[i], Y0 - FASCIA - 0.12, outZ[i] + 0.12],
      MARBLE, MT.marble, NN);
  }
  // ---- deck surface: our cut-marble overlay over the world's terrace slab --
  // (the massing slab's top face reads muddy from above, and the apron and the
  // slab should read as one continuous white marble floor)
  const yIn = Y0 + 0.012;
  const yP = Y0 + 0.028;
  const OZ0 = EDGE + 0.30, OZ1 = FACADE_Z - 1.4;
  const NX = 9, NZ = 5;
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      const x0 = -HALF + 0.55 + (i / NX) * (HALF * 2 - 1.1);
      const x1 = -HALF + 0.55 + ((i + 1) / NX) * (HALF * 2 - 1.1);
      const z0 = OZ0 + (j / NZ) * (OZ1 - OZ0);
      const z1 = OZ0 + ((j + 1) / NZ) * (OZ1 - OZ0);
      const sh = 0.95 + 0.06 * (((i * 3 + j * 5) % 4) / 3);
      b.quad([x0, yIn, z0], [x1, yIn, z0], [x1, yIn, z1], [x0, yIn, z1], mulc(MARBLE, sh), MMR, [0, 1, 0]);
    }
  }
  // ---- deck inlay: border band, radial joints, central compass ----------
  const yPav = Y0 + 0.024;
  for (let i = 0; i < n - 1; i++) {
    const z0a = railZ(xs[i]) - 1.05, z0b = railZ(xs[i + 1]) - 1.05;
    const z1a = railZ(xs[i]) - 1.55, z1b = railZ(xs[i + 1]) - 1.55;
    b.quad([xs[i], yPav, z0a], [xs[i + 1], yPav, z0b], [xs[i + 1], yPav, z1b], [xs[i], yPav, z1a],
      mulc(MARBLE_SH, 0.90), MT.polish, [0, 1, 0]);
  }
  for (let k = 0; k < 21; k++) {
    const x = -42 + k * 4.2;
    if (Math.abs(x) > HALF - 1) continue;
    const za = railZ(x) - 1.6, zb = FACADE_Z - 1.7;
    b.quad([x - 0.05, yP, za], [x + 0.05, yP, za], [x + 0.05, yP, zb], [x - 0.05, yP, zb],
      mulc(MARBLE_DK, 0.95), MT.polish, [0, 1, 0]);
  }
  // central compass medallion (on the apron inside the bow)
  const mz = 88.4, mr = 2.1;
  at(b, 0, Y0 + 0.011, mz, 0, () => {
    disc(b, mr, 16, mulc(MARBLE_SH, 0.94), MT.polish, { y: 0 });
    disc(b, mr * 0.72, 16, mulc(MARBLE_DK, 0.96), MT.polish, { inner: mr * 0.58, y: 0.006 });
    disc(b, mr * 0.44, 12, GOLD, MT.gold, { y: 0.012 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      const p0 = [Math.cos(a) * 0.30, 0.013, Math.sin(a) * 0.30];
      const p1 = [Math.cos(a) * mr * 0.60, 0.013, Math.sin(a) * mr * 0.60];
      const w = 0.24;
      b.quad([p0[0] - Math.sin(a) * w, p0[1], p0[2] + Math.cos(a) * w],
        [p0[0] + Math.sin(a) * w, p0[1], p0[2] - Math.cos(a) * w],
        [p1[0] + Math.sin(a) * w * 0.2, p1[1], p1[2] - Math.cos(a) * w * 0.2],
        [p1[0] - Math.sin(a) * w * 0.2, p1[1], p1[2] + Math.cos(a) * w * 0.2],
        mixc(MARBLE, GOLD, 0.6), MT.polish, [0, 1, 0]);
      const p2 = [Math.cos(a) * 0.42, 1.001, Math.sin(a) * 0.42];
      void p2;
    }
  });
  // ---- paving joints over the whole deck (reads as cut stone, kills the blank) --
  for (let k = -6; k <= 6; k++) {
    const x = k * 7.4;
    if (Math.abs(x) > HALF - 0.6) continue;
    const za = Math.min(railZ(x) - 0.55, EDGE - 0.0);
    b.quad([x - 0.05, yP, za], [x + 0.05, yP, za], [x + 0.05, yP, FACADE_Z - 1.7], [x - 0.05, yP, FACADE_Z - 1.7],
      mulc(MARBLE_DK, 0.94), MT.matte, [0, 1, 0]);
  }
  for (let k = 0; k < 4; k++) {
    const z = 96 + k * 7.4;
    if (z > FACADE_Z - 2.0) break;
    b.quad([-HALF + 0.5, yP, z - 0.05], [HALF - 0.5, yP, z - 0.05], [HALF - 0.5, yP, z + 0.05], [-HALF + 0.5, yP, z + 0.05],
      mulc(MARBLE_DK, 0.94), MT.matte, [0, 1, 0]);
  }
  // border band around the deck perimeter
  b.quad([-HALF + 0.5, yP, EDGE + 0.5], [HALF - 0.5, yP, EDGE + 0.5], [HALF - 0.5, yP, EDGE + 1.1], [-HALF + 0.5, yP, EDGE + 1.1],
    mulc(MARBLE_SH, 0.9), MT.polish, [0, 1, 0]);
}

// ---------------------------------------------------------------- support wall
// The belvedere is a 30 m belvedere over the head of the boulevard: a rusticated
// stone mass pierced by one great carriage arch, carrying the balcony above.
function buildSupport(b) {
  const zf = EDGE - 0.4, zb = EDGE + 2.6;     // 92.6 .. 95.6
  const yTop = Y0 - 3.4;                      // 26.6
  const AR = 12.2, AS = 4.6;                  // carriage arch: radius, springing
  // solid flanks either side of the arch
  for (const [x0, x1] of [[-HALF, -AR], [AR, HALF]]) {
    at(b, (x0 + x1) / 2, yTop / 2, (zf + zb) / 2, 0,
      () => box(b, x1 - x0, yTop, zb - zf, STONE, MASS, { topCol: mulc(STONE, 1.05) }));
  }
  // arch spandrels (front + back) and the vault soffit
  const SEG = 10;
  for (let i = 0; i < SEG; i++) {
    const a0 = (i / SEG) * Math.PI, a1 = ((i + 1) / SEG) * Math.PI;
    const x0 = Math.cos(a0) * AR, x1 = Math.cos(a1) * AR;
    const y0 = AS + Math.sin(a0) * AR, y1 = AS + Math.sin(a1) * AR;
    b.quad([x0, y0, zf], [x1, y1, zf], [x1, yTop, zf], [x0, yTop, zf], STONE, MASS, [0, 0, -1]);
    b.quad([x1, y1, zb], [x0, y0, zb], [x0, yTop, zb], [x1, yTop, zb], mulc(STONE, 0.86), MASS, [0, 0, 1]);
    const am = (a0 + a1) * 0.5;
    b.quad([x0, y0, zf], [x0, y0, zb], [x1, y1, zb], [x1, y1, zf],
      mulc(STONE_SH, 0.78), MT.stone, [-Math.cos(am), -Math.sin(am), 0]);
  }
  // inner jambs below the springing
  for (const sx of [-1, 1]) {
    b.quad([sx * AR, 0, zf], [sx * AR, 0, zb], [sx * AR, AS, zb], [sx * AR, AS, zf],
      mulc(STONE, 0.9), MT.stone, [-sx, 0, 0]);
  }
  // rusticated courses + pilasters on the city face
  for (let k = 0; k < 5; k++) {
    const y = 2.8 + k * 5.0;
    at(b, 0, y, zf - 0.17, 0, () => box(b, HALF * 2, 0.26, 0.38, mulc(STONE, k % 2 ? 0.92 : 1.04), MT.stone));
    at(b, 0, y + 0.30, zf - 0.07, 0, () => box(b, HALF * 2, 0.07, 0.22, mulc(STONE, 1.10), MT.marble));
  }
  for (const px of [-44, -32, -20, 20, 32, 44]) {
    at(b, px, yTop * 0.5, zf - 0.32, 0, () => box(b, 1.8, yTop, 0.72, mulc(STONE, 1.0), MT.stone));
  }
  // crowning cornices + base course
  at(b, 0, yTop - 0.44, zf - 0.32, 0, () => box(b, HALF * 2, 0.44, 0.80, MARBLE, MT.marble));
  at(b, 0, yTop - 1.12, zf - 0.19, 0, () => box(b, HALF * 2, 0.34, 0.52, MARBLE_SH, MT.marble));
  at(b, 0, 0.62, zf - 0.22, 0, () => box(b, HALF * 2 + 1, 1.24, 0.64, mulc(STONE, 0.95), MT.stone));
}


// ---------------------------------------------------------------- props
function lampStandard(b, ctx, x, z) {
  b.push(mtr(x, Y0, z, 0));
  cylinder(b, 8, 0.46, 0.36, 0.26, MARBLE_SH, MT.marble, { y0: 0 });
  cylinder(b, 8, 0.32, 0.24, 0.46, MARBLE, MT.marble, { y0: 0.26 });
  cylinder(b, 8, 0.19, 0.13, 3.10, mixc(C.stoneCool, C.cloudLit, 0.22), MT.marble, { y0: 0.72 });
  cylinder(b, 8, 0.22, 0.22, 0.14, GOLD, MT.gold, { y0: 3.72 });
  // lantern
  cylinder(b, 6, 0.30, 0.24, 0.66, GLASS, MT.glass, { y0: 3.86 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    b.push(mtr(Math.cos(a) * 0.27, 3.86, Math.sin(a) * 0.27, -a));
    box(b, 0.05, 0.68, 0.05, GOLD, MT.gold);
    b.pop();
  }
  cylinder(b, 6, 0.30, 0.30, 0.10, GOLD, MT.gold, { y0: 4.52 });
  cylinder(b, 6, 0.26, 0.05, 0.42, mixc(C.copper, C.gold, 0.45), MT.metal, { y0: 4.62 });
  b.push(mtr(0, 5.12, 0, 0));
  ellipsoid(b, 0.075, 0.10, 0.075, 6, 4, GOLD_B, MT.gold);
  b.pop();
  b.pop();
  ctx.points.push({ p: [x, Y0 + 4.2, z], col: mixc(C.sunGlow, C.goldBright, 0.45), range: 24, int: 0.85 });
  ctx.lanterns.push({ p: [x, Y0 + 4.18, z], size: 2.6, rot: 0, alpha: 0.45, shape: 1, col: mixc(C.sunGlow, C.goldBright, 0.5) });
}

function flowerCluster(b, cx, cy, cz, spread, count, rng, yScale = 1) {
  const cols = [C.bloomPink, C.bloomRed, C.bloomYellow, C.bloomBlue, C.bloomWhite, C.bloomPink, C.bloomRed];
  for (let i = 0; i < count; i++) {
    const a = rng() * TAU, r = Math.sqrt(rng()) * spread;
    const px = cx + Math.cos(a) * r, pz = cz + Math.sin(a) * r * 0.9;
    const py = cy + (0.35 - r / Math.max(spread, 0.001) * 0.30) * spread * yScale + rng() * 0.05;
    const rr = 0.055 + rng() * 0.045;
    b.push(mtr(px, py, pz, rng() * TAU));
    ellipsoid(b, rr, rr * 0.85, rr, 5, 3, cols[(i * 3 + 1) % cols.length], MT.cloth);
    b.pop();
  }
  for (let i = 0; i < Math.max(3, count * 0.3); i++) {
    const a = rng() * TAU, r = spread * (0.55 + rng() * 0.55);
    b.push(mtr(cx + Math.cos(a) * r, cy + 0.02 + rng() * 0.1, cz + Math.sin(a) * r * 0.9, rng() * TAU));
    ellipsoid(b, 0.075, 0.03, 0.05, 4, 2, rng() < 0.5 ? LEAF : LEAF_L, MT.leaf);
    b.pop();
  }
}

function urn(b, rng, x, z) {
  b.push(mtr(x, Y0, z, 0));
  b.push(mtr(0, 0.18, 0, 0));
  box(b, 1.05, 0.36, 1.05, MARBLE_SH, MT.marble);
  b.pop();
  b.push(mtr(0, 0.40, 0, 0));
  box(b, 0.86, 0.10, 0.86, MARBLE, MT.marble);
  b.pop();
  const prof = [[0.10, 0.02], [0.30, 0.06], [0.40, 0.20], [0.44, 0.36], [0.40, 0.50], [0.30, 0.58], [0.34, 0.64]];
  lathe(b, prof, 8, MARBLE, MT.marble, { smooth: true });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    b.push(mtr(Math.cos(a) * 0.40, 0.47, Math.sin(a) * 0.40, -a));
    box(b, 0.12, 0.10, 0.08, GOLD, MT.gold);
    b.pop();
  }
  b.push(mtr(0, 0.60, 0, 0));
  cylinder(b, 8, 0.34, 0.30, 0.10, mulc(STONE, 0.6), MT.matte, { y0: 0 });
  b.pop();
  flowerCluster(b, 0, 0.78, 0, 0.34, 9, rng, 1.0);
  b.pop();
}

function topiary(b, rng, x, z) {
  b.push(mtr(x, Y0, z, 0));
  b.push(mtr(0, 0.3, 0, 0));
  box(b, 1.5, 0.6, 1.5, MARBLE_SH, MT.marble);
  b.pop();
  b.push(mtr(0, 0.62, 0, 0));
  box(b, 1.34, 0.08, 1.34, MARBLE, MT.marble);
  b.pop();
  cylinder(b, 6, 0.13, 0.10, 0.9, mixc(C.bronze, C.leafDark, 0.5), MT.matte, { y0: 0.62 });
  const blobs = [[0, 1.75, 0, 0.62], [0.22, 1.55, 0.18, 0.44], [-0.24, 1.62, -0.16, 0.40], [0.05, 2.12, -0.04, 0.40]];
  for (const [bx, by, bz, r] of blobs) {
    b.push(mtr(bx, by, bz, rng() * TAU));
    ellipsoid(b, r, r * 0.9, r, 6, 4, rng() < 0.45 ? LEAF : LEAF_L, MT.leaf);
    b.pop();
  }
  for (let i = 0; i < 8; i++) {
    const a = rng() * TAU, r = 0.35 + rng() * 0.4, y = 1.4 + rng() * 0.85;
    b.push(mtr(Math.cos(a) * r, y, Math.sin(a) * r, rng() * TAU));
    ellipsoid(b, 0.17, 0.13, 0.17, 5, 3, rng() < 0.5 ? LEAF_D : LEAF, MT.leaf);
    b.pop();
  }
  b.pop();
}

function vine(b, ctx, rng, x0, dir, len) {
  // a stem climbs the outer face of the balustrade and spills over the rail
  const pts = [];
  for (let i = 0; i <= 5; i++) {
    const s = i / 5;
    const x = x0 + dir * len * s;
    const z = railZ(x) - 0.44 + Math.sin(s * 3.1 + x0) * 0.12 - s * 0.55;
    const y = Y0 + 0.2 + s * 1.15 + Math.sin(s * 2.2 + x0 * 0.4) * 0.18;
    pts.push([x, y, z]);
  }
  tubePath(b, pts, 0.045, 5, LEAF_D, MT.leaf, { caps: false });
  for (let i = 0; i < 16; i++) {
    const s = rng();
    const x = x0 + dir * len * s + (rng() - 0.5) * 0.9;
    const z = railZ(x) - 0.3 - rng() * 0.9;
    const y = Y0 + 0.15 + s * 1.25 + (rng() - 0.5) * 0.55;
    ctx.lanterns.push({
      p: [x, y, z], size: 0.42 + rng() * 0.42, rot: rng() * TAU,
      alpha: 0.92, shape: 5, col: rng() < 0.5 ? LEAF : LEAF_L,
    });
  }
}

function hedge(b, rng, x, z0, z1) {
  b.push(mtr(x, Y0, (z0 + z1) / 2, 0));
  box(b, 1.3, 0.55, z1 - z0, MARBLE_SH, MT.marble);
  b.pop();
  const n = Math.max(3, Math.round((z1 - z0) / 1.3));
  for (let i = 0; i < n; i++) {
    const z = z0 + (z1 - z0) * ((i + 0.5) / n);
    b.push(mtr(x + (rng() - 0.5) * 0.2, Y0 + 0.95, z, rng() * TAU));
    ellipsoid(b, 0.72, 0.62 + rng() * 0.2, 0.72, 6, 4, rng() < 0.5 ? LEAF : LEAF_D, MT.leaf);
    b.pop();
  }
}

// ---------------------------------------------------------------- the grand stair
// A wide flight drops from the belvedere centre to a lower semicircular terrace
// that hangs over the boulevard — the reference's "stair down to the city".
function buildLowerTerrace(b) {
  const LZ = 78.6;         // the lower terrace's centre
  const LY = Y0 - 3.2;     // lower deck level
  const LR = 8.4;          // its radius
  const steps = 8;
  const run = 0.86, rise = 0.40;
  // the flight: from the apron (z = 84.1) out over the void (toward -Z)
  for (let i = 0; i < steps; i++) {
    const zc = 84.1 - i * run;
    const y = Y0 - i * rise;
    b.push(mtr(0, y - 0.18, zc - run / 2, 0));
    box(b, 9.6, 0.36, run + 0.06, MARBLE, MT.marble);
    b.pop();
    b.push(mtr(0, y - 0.02 - 0.30 * 0.5, zc - run + 0.06, 0));
    b.pop();
    // riser face
    b.quad([-4.8, y - rise, zc - run], [4.8, y - rise, zc - run], [4.8, y, zc - run], [-4.8, y, zc - run], MARBLE_SH, MT.marble, [0, 0, -1]);
  }
  const yTop = Y0 - steps * rise;
  // lower semicircular platform
  const cy = yTop;
  const cz = LZ;
  // deck plate
  for (let i = 0; i <= 14; i++) {
    const a0 = Math.PI * (i / 14), a1 = Math.PI * ((i + 1) / 14);
    const p0 = [Math.cos(a0) * LR, cy, cz - Math.sin(a0) * LR * 0.9];
    const p1 = [Math.cos(a1) * LR, cy, cz - Math.sin(a1) * LR * 0.9];
    b.tri([0, cy, cz], p0, p1, MARBLE, MT.marble, [0, 1, 0], [0, 1, 0], [0, 1, 0]);
    // fascia below the rim, on the outer arc
    b.quad([p0[0], cy, p0[2]], [p1[0], cy, p1[2]], [p1[0], cy - 0.7, p1[2]], [p0[0], cy - 0.7, p0[2]],
      MARBLE_SH, MT.marble, [Math.cos((a0 + a1) / 2), 0, -Math.sin((a0 + a1) / 2)]);
    // balustrade: a simplified arcade of arches at the rim
    const mid = (a0 + a1) / 2;
    const isPost = i % 2 === 0;
    const bx = Math.cos(mid) * LR, bz = cz - Math.sin(mid) * LR * 0.9;
    if (!isPost) {
      b.push(mtr(bx, cy, bz, -mid + Math.PI / 2));
      b.push(mtr(0, 0.02, 0, 0));
      box(b, 0.34, 0.90, 0.42, MARBLE, MT.marble);
      b.pop();
      b.push(mtr(-0.01, 0.95, 0, 0));
      ellipsoid(b, 0.12, 0.16, 0.12, 5, 3, GOLD, MT.gold);
      b.pop();
      b.pop();
    } else {
      b.push(mtr(bx, cy, bz, -mid + Math.PI / 2));
      b.push(mtr(0, 0.55, 0, 0));
      box(b, 0.5, 1.10, 0.5, MARBLE_HI, MT.marble);
      b.pop();
      b.pop();
    }
  }
  // support: a corbelled stone bowl under the lower terrace (stepped rings, not a cone)
  const rings = [
    [LR * 0.92, cy - 0.70], [LR * 0.80, cy - 1.55], [LR * 0.62, cy - 2.40],
    [LR * 0.40, cy - 3.20], [LR * 0.18, cy - 3.75],
  ];
  for (let k = 0; k < rings.length - 1; k++) {
    const r0 = rings[k][0], y0 = rings[k][1], r1 = rings[k + 1][0], y1 = rings[k + 1][1];
    for (let i = 0; i < 10; i++) {
      const a0 = Math.PI * (i / 10), a1 = Math.PI * ((i + 1) / 10);
      const P = (r, y, a) => [Math.cos(a) * r, y, cz - Math.sin(a) * r * 0.90];
      const sh = 0.86 + 0.14 * Math.cos((a0 + a1) * 0.5 - Math.PI * 0.25);
      b.quad(P(r0, y0, a0), P(r0, y0, a1), P(r1, y1, a1), P(r1, y1, a0), mulc(STONE_SH, sh), MT.stone, null);
    }
  }
  // closing boss under the bowl
  const rr = rings[rings.length - 1][0], ry = rings[rings.length - 1][1];
  for (let i = 0; i < 10; i++) {
    const a0 = Math.PI * (i / 10), a1 = Math.PI * ((i + 1) / 10);
    b.tri([0, ry - 0.35, cz], [Math.cos(a0) * rr, ry, cz - Math.sin(a0) * rr * 0.9],
      [Math.cos(a1) * rr, ry, cz - Math.sin(a1) * rr * 0.9], mulc(STONE_SH, 0.8), MT.stone,
      [0, -1, 0], [0, -0.9, 0.2], [0, -0.9, 0.2]);
  }
  // flight cheek walls
  for (const sx of [-1, 1]) {
    b.push(mtr(sx * 5.0, 0, 0, 0));
    for (let i = 0; i < steps; i++) {
      const zc = 84.1 - i * run;
      const y = Y0 - i * rise;
      b.push(mtr(0, y - rise / 2, zc - run / 2, 0));
      box(b, 0.42, rise + 0.82, run + 0.02, MARBLE, MT.marble);
      b.pop();
    }
    b.pop();
  }
}

// ---------------------------------------------------------------- entry point
export function buildTerrace(b, ctx, rng) {
  b.note && b.note('terrace');
  balustrade(b);
  buildDeck(b);
  buildSupport(b);
  // the old flat palace frontage is replaced by the enterable palace (src/palace.js)
  buildLowerTerrace(b);
  // lamps flanking the flight
  lampStandard(b, ctx, -20.0, railZ(-20.0) - 1.15);
  lampStandard(b, ctx, 20.0, railZ(20.0) - 1.15);
  lampStandard(b, ctx, -38.4, EDGE - 1.4);
  lampStandard(b, ctx, 38.4, EDGE - 1.4);
  // urns
  urn(b, rng, -12.6, 86.6);
  urn(b, rng, 12.6, 86.6);
  urn(b, rng, -28.5, 88.2);
  urn(b, rng, 28.5, 88.2);
  // topiary + hedges (the garden)
  topiary(b, rng, -42.4, 97.5);
  topiary(b, rng, 42.4, 97.5);
  hedge(b, rng, -45.6, 96.0, 123.0);
  hedge(b, rng, 45.6, 96.0, 123.0);
  // climbing vines spilling over the balustrade (reference foreground)
  vine(b, ctx, rng, -30.0, -1, 7.5);
  vine(b, ctx, rng, 23.0, 1, 8.5);
  vine(b, ctx, rng, 36.0, -1, 6.5);
  vine(b, ctx, rng, -38.0, 1, 5.5);
  // flower pots along the deck edge
  for (const [px, pz] of [[-33.5, 90.8], [33.5, 90.8], [-16.5, 91.4], [16.5, 91.4]]) {
    b.push(mtr(px, Y0, pz, 0));
    b.push(mtr(0, 0.30, 0, 0));
    cylinder(b, 6, 0.52, 0.62, 0.60, mixc(C.stoneWarm, C.copper, 0.25), MT.stone, { y0: 0 });
    b.pop();
    flowerCluster(b, 0, 0.90, 0, 0.42, 7, rng, 1.1);
    b.pop();
  }
}