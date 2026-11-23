// HERO — the girl on the belvedere with her armful of flowers, and the black cat.
// OWNER: agent "girl" (round 3: "精细少女")
//
//   buildHero(b, ctx, rng) -> void          // world entry point (world.js)
//   girlGeom(b, rng) / catGeom(b, rng)      // exported for tools/hero-check.mjs
//
// A stylised anime figure ~1.62 m tall (6.6 heads incl. hair), standing on the
// belvedere at (3, deck 30, railZ(3)+2 ~ 86.1) facing -Z (the city), holding a
// huge bouquet in both hands in front of her chest. Local frame: y=0 is the
// deck, +Z is her front, +X is her left. Nothing here uses Math.random.
//
// The round-3 rebuild replaces the old "sphere head + blob hair + candy bouquet"
// with: a parametric head (surface of revolution with a jaw/chin profile) and
// thin surface-conforming face decals (almond eye + iris + pupil + highlights +
// lash + brow + mouth + blush), layered tapered-strand hair (scalp shell, long
// wavy back curtain, pointed locks, side locks, bangs, ahoge, ribbon bow),
// a four-tier ruffled dress with a blue sash/bow, and 25 layered-petal flowers.
import { C } from './palette.js';
import { MT } from './lib3d.js';
import { mulc, mixc, box } from './geo.js';
import { TAU, clamp, lerp, smoothstep, norm, sub, cross, dot } from './math.js';
import { L } from './layout.js';

// ---------------------------------------------------------------- anchors
const DECK_Y = L.terrace.y;                 // 30
const EDGE = 93.0, BOWH = 34, BOW = 9.0;
function railZ(x) {
  const ax = Math.abs(x);
  if (ax >= BOWH) return EDGE;
  return EDGE - BOW * Math.pow(Math.cos((Math.PI * 0.5 * ax) / BOWH), 1.3);
}
const GIRL_X = 3.0;
const GIRL_Z = railZ(GIRL_X) + 2.0;         // ~86.10
const GIRL_YAW = Math.PI + 0.44;            // ~9 deg off dead-on to the view-8 camera
const RAIL_TOP = DECK_Y + 1.203;
export const HERO_ANCHOR = {
  x: GIRL_X, y: DECK_Y, z: GIRL_Z, yaw: GIRL_YAW, railTop: RAIL_TOP,
  catX: GIRL_X + 1.22,
};

// ---------------------------------------------------------------- palette
const SKIN = mixc(C.skin, C.bloomPink, 0.055);
const SKIN_SH = mulc(mixc(C.skin, C.bloomPink, 0.30), 0.93);
const SKIN_MAT = [0.020, 0.16];
const FACE_MAT = [0.040, 0.15];
const HAIR = mixc(C.hairBlonde, C.goldBright, 0.22);
const HAIR_LT = mixc(C.hairBlonde, C.sunGlow, 0.52);
const HAIR_SH = mixc(C.hairBlondeShade, C.goldBright, 0.10);
const HAIR_DK = mulc(C.hairBlondeShade, 0.70);
const HAIR_MAT = [0.0, 0.26];
const LASH = mulc(mixc(C.hairBlondeShade, C.catBlack, 0.66), 0.92);
const BROW = mulc(mixc(C.hairBlondeShade, C.catBlack, 0.42), 0.95);
const DRESS = mixc(C.dressWhite, C.stonePale, 0.10);
const DRESS_W = C.dressWhite;
const LACE = mixc(C.dressWhite, C.cloudLit, 0.30);
const PINK = mixc(C.dressPink, C.bloomPink, 0.22);
const PINK_LT = mixc(C.dressPink, C.cloudLit, 0.42);
const RIB = C.ribbonBlue;
const RIB_LT = mixc(C.ribbonBlue, C.cloudLit, 0.30);
const RIB_DK = mulc(C.ribbonBlue, 0.58);
const EYE = C.eyeBlue;
const EYE_LT = mixc(C.eyeBlue, C.horizon, 0.42);
const EYE_DK = mulc(C.eyeBlue, 0.32);
const SCLERA = mixc(C.cloudLit, C.moon, 0.35);
const WHITE = mixc(C.cloudLit, C.dressWhite, 0.5);
const MOUTH = mixc(C.bloomRed, C.bloomPink, 0.55);
const BLUSH = mixc(SKIN, C.bloomPink, 0.46);
const SHOE = mulc(mixc(C.ribbonBlue, C.slateDark, 0.55), 0.80);
const SHOE_LT = mulc(SHOE, 1.35);
const STOCK = mixc(C.dressWhite, C.sunGlow, 0.16);
const CAT = mixc(C.catBlack, C.slateDark, 0.22);
const CAT_LT = mixc(C.catBlack, C.stoneCool, 0.52);
const CAT_EYE = mixc(C.goldBright, C.leafLight, 0.34);
const FLOWER_COLS = [
  mixc(C.bloomPink, C.dressPink, 0.25), mixc(C.bloomRed, C.bloomPink, 0.20),
  mixc(C.bloomYellow, C.sunGlow, 0.25), mixc(C.bloomBlue, C.horizon, 0.28),
  mixc(C.bloomPink, C.bloomWhite, 0.35), mixc(C.bloomRed, C.bloomYellow, 0.22),
  C.bloomWhite, mixc(C.bloomBlue, C.bloomPink, 0.45),
];

// ================================================================ transforms
// column-major 4x4, R = Ry * Rx * Rz, translation in the last column.
function xf(p, yaw = 0, pitch = 0, roll = 0, s = 1) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const cr = Math.cos(roll), sr = Math.sin(roll);
  const m00 = cy * cr + sy * sp * sr, m01 = cp * sr, m02 = -sy * cr + cy * sp * sr;
  const m10 = -cy * sr + sy * sp * cr, m11 = cp * cr, m12 = sy * sr + cy * sp * cr;
  const m20 = sy * cp, m21 = -sp, m22 = cy * cp;
  const sx = Array.isArray(s) ? s[0] : s, syy = Array.isArray(s) ? s[1] : s, sz = Array.isArray(s) ? s[2] : s;
  return [m00 * sx, m01 * sx, m02 * sx, 0, m10 * syy, m11 * syy, m12 * syy, 0,
    m20 * sz, m21 * sz, m22 * sz, 0, p[0], p[1], p[2], 1];
}
function at(b, p, yaw, fn, pitch = 0, roll = 0, s = 1) {
  b.push(xf(p, yaw, pitch, roll, s));
  fn();
  b.pop();
}
const mulv = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
// local +Y is aimed along dir
function axisAt(b, p, dir, fn, s = 1) {
  const d = norm(dir);
  const cp = clamp(d[1], -1, 1);
  const pitch = Math.acos(cp);
  const sp = Math.sqrt(Math.max(1e-9, 1 - cp * cp));
  const yaw = Math.atan2(d[0] / sp, d[2] / sp);
  b.push(xf(p, yaw, pitch, 0, s));
  fn();
  b.pop();
}

// ================================================================ surface / strand
// Parametric surface with finite-difference normals oriented away from center.
//   fn(u,v) -> [x,y,z];  u wraps around (0..1), v runs 0..1.
export function surf(b, fn, nu, nv, colFn, mat, opts = {}) {
  const closedU = opts.closedU !== false;
  const center = opts.center || null;
  const eu = opts.epsU ?? 1 / (nu * 3), ev = opts.epsV ?? 1 / (nv * 3);
  const ring = (u, v) => fn(u, v);
  const nrm = (u, v) => {
    const a = ring(u + eu, v), c = ring(u - eu, v);
    const d = ring(u, v + ev), e = ring(u, v - ev);
    let n = cross(sub(a, c), sub(d, e));
    if (!(Math.hypot(n[0], n[1], n[2]) > 1e-9)) return [0, 1, 0];
    n = norm(n);
    if (center) {
      const cp = typeof center === 'function' ? center(u, v) : center;
      if (dot(n, sub(ring(u, v), cp)) < 0) n = [-n[0], -n[1], -n[2]];
    }
    if (opts.flip) n = [-n[0], -n[1], -n[2]];
    return n;
  };
  const rows = [];
  for (let j = 0; j <= nv; j++) {
    const row = [];
    for (let i = 0; i <= nu; i++) {
      const u = closedU ? (i % nu) / nu : i / nu;
      const v = j / nv;
      row.push(b.vert(b.tp(ring(u, v)), b.tn(nrm(u, v)), colFn(u, v), mat));
    }
    rows.push(row);
  }
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      b.i.push(rows[j][i], rows[j][i + 1], rows[j + 1][i + 1]);
      b.i.push(rows[j][i], rows[j + 1][i + 1], rows[j + 1][i]);
    }
  }
}

// Swept elliptical strand (hair locks, ribbon tails, stems, whiskers).
//   wid/thk: number | array[i] | fn(t in 0..1) — full width / thickness.
export function strand(b, pts, wid, thk, seg, colFn, mat, opts = {}) {
  const n = pts.length;
  if (n < 2) return;
  const W = typeof wid === 'function' ? wid : (i) => (Array.isArray(wid) ? wid[i] : wid);
  const T = typeof thk === 'function' ? thk : (i) => (Array.isArray(thk) ? thk[i] : thk);
  const tan = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], c = pts[Math.min(n - 1, i + 1)];
    tan.push(norm(sub(c, a)));
  }
  let ref = opts.ref || (Math.abs(dot(tan[0], [0, 1, 0])) > 0.85 ? [0, 0, 1] : [0, 1, 0]);
  let S = norm(cross(tan[0], ref));
  const idx = [];
  for (let i = 0; i < n; i++) {
    S = norm(sub(S, mulv(tan[i], dot(S, tan[i]))));
    const B = norm(cross(tan[i], S));
    const w = Math.max(1e-4, 0.5 * W(i / (n - 1))), t = Math.max(1e-4, 0.5 * T(i / (n - 1)));
    const row = [];
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * TAU;
      const ca = Math.cos(a), sa = Math.sin(a);
      const p = [
        pts[i][0] + S[0] * ca * w + B[0] * sa * t,
        pts[i][1] + S[1] * ca * w + B[1] * sa * t,
        pts[i][2] + S[2] * ca * w + B[2] * sa * t,
      ];
      const nn = norm([S[0] * ca * t + B[0] * sa * w, S[1] * ca * t + B[1] * sa * w, S[2] * ca * t + B[2] * sa * w]);
      row.push(b.vert(b.tp(p), b.tn(nn), colFn(i / (n - 1), k / seg), mat));
    }
    idx.push(row);
  }
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < seg; k++) {
      b.i.push(idx[i][k], idx[i][k + 1], idx[i + 1][k + 1]);
      b.i.push(idx[i][k], idx[i + 1][k + 1], idx[i + 1][k]);
    }
  }
  const caps = opts.caps === undefined ? 'both' : opts.caps;
  if (caps === 'both' || caps === 'start') {
    const p0 = pts[0], N = mulv(tan[0], -1), c = colFn(0, 0);
    const ic = b.vert(b.tp([p0[0], p0[1], p0[2]]), b.tn(N), c, mat);
    for (let k = 0; k < seg; k++) b.i.push(ic, idx[0][k], idx[0][k + 1]);
  }
  if (caps === 'both' || caps === 'end') {
    const p1 = pts[n - 1], N = tan[n - 1], c = colFn(1, 0);
    const tip = [p1[0] + N[0] * 0.004, p1[1] + N[1] * 0.004, p1[2] + N[2] * 0.004];
    const ic = b.vert(b.tp(tip), b.tn(N), c, mat);
    for (let k = 0; k < seg; k++) b.i.push(ic, idx[n - 1][k + 1], idx[n - 1][k]);
  }
}

// ================================================================ HEAD
const HEAD_CHIN = 1.365, HEAD_H = 0.235;
const HEAD_PROF = [
  [0.00, 0.030, 0.040, 0.018],
  [0.05, 0.042, 0.052, 0.016],
  [0.12, 0.057, 0.064, 0.013],
  [0.22, 0.069, 0.074, 0.009],
  [0.32, 0.076, 0.080, 0.005],
  [0.42, 0.083, 0.086, 0.002],
  [0.52, 0.087, 0.088, 0.000],
  [0.62, 0.088, 0.087, -0.001],
  [0.72, 0.083, 0.082, -0.002],
  [0.82, 0.072, 0.072, -0.003],
  [0.90, 0.056, 0.058, -0.004],
  [0.96, 0.034, 0.036, -0.004],
  [1.00, 0.011, 0.012, -0.003],
];
function hprof(v) {
  const t = clamp(v, 0, 1);
  let i = 0;
  while (i < HEAD_PROF.length - 2 && HEAD_PROF[i + 1][0] < t) i++;
  const a = HEAD_PROF[i], c = HEAD_PROF[i + 1];
  const k = clamp((t - a[0]) / (c[0] - a[0]), 0, 1);
  return [lerp(a[1], c[1], k), lerp(a[2], c[2], k), lerp(a[3], c[3], k)];
}
// theta 0 = front (+Z), v 0 = chin .. 1 = crown
function headPt(th, v) {
  const p = hprof(v);
  return [Math.sin(th) * p[0], HEAD_CHIN + HEAD_H * v, Math.cos(th) * p[1] + p[2]];
}
function headN(th, v) {
  const e = 0.02;
  const a = headPt(th + e, v), c = headPt(th - e, v);
  const d = headPt(th, clamp(v + e, 0, 1)), f = headPt(th, clamp(v - e, 0, 1));
  let n = cross(sub(a, c), sub(d, f));
  if (!(Math.hypot(n[0], n[1], n[2]) > 1e-9)) return [0, 1, 0];
  n = norm(n);
  const p = headPt(th, v);
  if (dot(n, [p[0], p[1] - HEAD_CHIN - HEAD_H * 0.5, p[2]]) < 0) n = [-n[0], -n[1], -n[2]];
  return n;
}
function facePt(th, v, off) {
  const p = headPt(th, v), n = headN(th, v);
  return [p[0] + n[0] * off, p[1] + n[1] * off, p[2] + n[2] * off];
}
// ---- eye frame (thin decals that follow the face surface)
const EYE_T = 0.445, EYE_V = 0.432, EYE_HT = 0.330, EYE_HV = 0.098;
function eyePt(sx, a, bb, off) {
  const th = sx * (EYE_T + a * EYE_HT);
  const v = EYE_V + bb * EYE_HV;
  return { p: facePt(th, v, off), n: headN(th, v) };
}
const eyeTop = (t) => [-1 + 2 * t, lerp(-0.14, 0.26, t) + 0.98 * Math.pow(Math.sin(Math.PI * t), 0.80)];
const eyeBot = (t) => [-1 + 2 * t, lerp(-0.14, 0.26, t) - 0.68 * Math.pow(Math.sin(Math.PI * t), 1.05)];
function eyeOutline() {
  const pts = [];
  for (let i = 0; i <= 6; i++) pts.push(eyeTop(i / 6));
  for (let i = 5; i >= 1; i--) pts.push(eyeBot(i / 6));
  return pts;
}
function circle2(cx, cy, rx, ry, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return out;
}
function decalFan(b, sx, pts2, off, col, mat, center2 = [0, 0.05]) {
  const c = eyePt(sx, center2[0], center2[1], off);
  const ic = b.vert(b.tp(c.p), b.tn(c.n), col, mat);
  for (let i = 0; i < pts2.length; i++) {
    const A = eyePt(sx, pts2[i][0], pts2[i][1], off);
    const B2 = eyePt(sx, pts2[(i + 1) % pts2.length][0], pts2[(i + 1) % pts2.length][1], off);
    b.i.push(ic, b.vert(b.tp(A.p), b.tn(A.n), col, mat), b.vert(b.tp(B2.p), b.tn(B2.n), col, mat));
  }
}
function decalStrip(b, sx, n, fnA, fnB, off, colFn, mat) {
  let prevA = null, prevB = null;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a0 = fnA(t), b0 = fnB(t);
    const A = eyePt(sx, a0[0], a0[1], off), B2 = eyePt(sx, b0[0], b0[1], off);
    if (prevA) {
      const col = colFn(t);
      const i0 = b.vert(b.tp(prevA.p), b.tn(prevA.n), col, mat);
      const i1 = b.vert(b.tp(A.p), b.tn(A.n), col, mat);
      const i2 = b.vert(b.tp(B2.p), b.tn(B2.n), col, mat);
      const i3 = b.vert(b.tp(prevB.p), b.tn(prevB.n), col, mat);
      b.i.push(i0, i1, i2, i0, i2, i3);
    }
    prevA = A; prevB = B2;
  }
}

function head(b, rng) {
  surf(b, (u, v) => headPt(u * TAU, v), 18, 16, (u, v) => {
    const front = Math.max(0, Math.cos(u * TAU));
    return mixc(SKIN, SKIN_SH, 0.10 * (1 - v) + 0.10 * (1 - front));
  }, FACE_MAT, { center: (u, v) => [0, HEAD_CHIN + HEAD_H * v, 0] });
  const cBot = headPt(0, 0);
  const iB = b.vert(b.tp([0, cBot[1] - 0.002, 0]), b.tn([0, -1, 0]), SKIN_SH, SKIN_MAT);
  const bot = [];
  for (let i = 0; i < 18; i++) bot.push(b.vert(b.tp(headPt((i / 18) * TAU, 0.004)), b.tn([0, -1, 0]), SKIN_SH, SKIN_MAT));
  for (let i = 0; i < 18; i++) b.i.push(iB, bot[(i + 1) % 18], bot[i]);
  const cTop = headPt(0, 1);
  const iT = b.vert(b.tp([0, cTop[1] + 0.006, 0]), b.tn([0, 1, 0]), SKIN, SKIN_MAT);
  const top = [];
  for (let i = 0; i < 18; i++) top.push(b.vert(b.tp(headPt((i / 18) * TAU, 0.995)), b.tn([0, 1, 0]), SKIN, SKIN_MAT));
  for (let i = 0; i < 18; i++) b.i.push(iT, top[i], top[(i + 1) % 18]);
  // ears (mostly hidden by hair, but read from a 3/4 angle)
  for (const sx of [-1, 1]) {
    at(b, [sx * 0.086, 1.446, -0.004], sx * 0.35, () => {
      surf(b, (u, v) => {
        const th = u * TAU;
        const ry = 0.026 * Math.sin(Math.PI * (0.08 + 0.92 * v)) + 0.002;
        const rx = 0.011 * Math.sin(Math.PI * (0.08 + 0.92 * v)) + 0.002;
        return [Math.sin(th) * rx, (v - 0.5) * ry * 2.2, Math.cos(th) * rx * 0.9];
      }, 8, 4, () => mixc(SKIN, SKIN_SH, 0.15), SKIN_MAT, { center: [0, 0, -0.02] });
      at(b, [0.002, 0.0, 0.004], 0, () => {
        surf(b, (u, v) => {
          const th = u * TAU;
          const ry = 0.017 * Math.sin(Math.PI * (0.1 + 0.9 * v)) + 0.001;
          const rx = 0.006 * Math.sin(Math.PI * (0.1 + 0.9 * v)) + 0.001;
          return [Math.sin(th) * rx, (v - 0.5) * ry * 2.2, Math.cos(th) * rx * 0.8];
        }, 6, 3, () => mixc(SKIN_SH, C.bloomPink, 0.30), SKIN_MAT, { center: [0, 0, -0.01] });
      });
    });
  }
}

function face(b) {
  for (const sx of [-1, 1]) {
    decalFan(b, sx, eyeOutline(), 0.0014, SCLERA, [0.02, 0.30]);
    decalFan(b, sx, circle2(0.02, 0.04, 0.72, 0.86, 12), 0.0024, EYE, [0.05, 0.62]);
    decalFan(b, sx, circle2(0.02, 0.46, 0.68, 0.40, 10), 0.0029, EYE_DK, [0.03, 0.62]);
    decalFan(b, sx, circle2(0.02, -0.34, 0.34, 0.20, 8), 0.0029, EYE_LT, [0.10, 0.70]);
    decalFan(b, sx, circle2(0.02, 0.06, 0.29, 0.50, 10), 0.0033, mulc(EYE_DK, 0.30), [0.0, 0.80]);
    decalFan(b, sx, circle2(-0.20, 0.34, 0.17, 0.20, 8), 0.0039, WHITE, [0.55, 0.95]);
    decalFan(b, sx, circle2(0.26, -0.20, 0.09, 0.10, 6), 0.0039, mixc(WHITE, C.horizon, 0.3), [0.4, 0.8]);
    decalStrip(b, sx, 10,
      (t) => { const a = -1.06 + 2.30 * t; return [a, eyeTop(clamp((a + 1) / 2, 0, 1))[1] + 0.02]; },
      (t) => { const a = -1.06 + 2.30 * t; return [a, eyeTop(clamp((a + 1) / 2, 0, 1))[1] + 0.02 + 0.16 + 0.38 * smoothstep(0, 1, t)]; },
      0.0034, (t) => mixc(LASH, mulc(LASH, 1.6), t), [0.0, 0.30]);
    decalStrip(b, sx, 6,
      (t) => { const a = -0.15 + 1.25 * t; return [a, eyeBot(clamp((a + 1) / 2, 0, 1))[1] - 0.01]; },
      (t) => { const a = -0.15 + 1.25 * t; return [a, eyeBot(clamp((a + 1) / 2, 0, 1))[1] - 0.055 - 0.03 * t]; },
      0.0028, () => mulc(LASH, 1.25), [0.0, 0.22]);
    decalStrip(b, sx, 7,
      (t) => { const a = -0.82 + 1.80 * t; return [a, 1.56 + 0.16 * t + 0.10 * Math.sin(Math.PI * t)]; },
      (t) => {
        const a = -0.82 + 1.80 * t;
        const th = 0.20 * Math.pow(Math.sin(Math.PI * clamp(t, 0.04, 0.96)), 0.55);
        return [a, 1.56 + 0.16 * t + 0.10 * Math.sin(Math.PI * t) - th];
      }, 0.0022, (t) => mixc(BROW, mulc(BROW, 0.85), Math.sin(Math.PI * t)), [0.0, 0.20]);
    decalFan(b, sx, circle2(0.02, -0.10, 0.46, 0.17, 10), 0.0007, BLUSH, [0.0, 0.08]);
  }
  // nose: tiny shadow wedge
  const nz = facePt(0, 0.262, 0.0022), nl = facePt(-0.10, 0.238, 0.0012), nr = facePt(0.10, 0.238, 0.0012);
  b.tri(nz, nl, nr, mixc(SKIN_SH, C.bloomPink, 0.20), FACE_MAT, headN(0, 0.262), headN(-0.10, 0.238), headN(0.10, 0.238));
  // mouth: small closed smile
  const mU = [], mL = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6, a = (t - 0.5) * 0.26;
    const y = 0.156 + 0.028 * Math.pow(a / 0.13, 2) - 0.010 * Math.sin(Math.PI * t);
    mU.push([a, y]);
    mL.push([a, y - 0.020 - 0.008 * Math.sin(Math.PI * t)]);
  }
  const rowsU = mU.map(([a, y]) => b.vert(b.tp(facePt(a, y, 0.0018)), b.tn(headN(a, y)), MOUTH, [0.02, 0.22]));
  const rowsL = mL.map(([a, y]) => b.vert(b.tp(facePt(a, y, 0.0016)), b.tn(headN(a, y)), mixc(MOUTH, C.bloomRed, 0.35), [0.02, 0.22]));
  for (let i = 0; i < 6; i++) {
    b.i.push(rowsU[i], rowsU[i + 1], rowsL[i + 1]);
    b.i.push(rowsU[i], rowsL[i + 1], rowsL[i]);
  }
}

// ================================================================ HAIR
function hairEdgeV(th) {
  const c = Math.cos(th);
  return c > 0 ? 0.62 + 0.13 * c * c : 0.62 - 0.16 * Math.pow(-c, 0.9);
}
function scalp(b, rng) {
  surf(b, (u, v) => {
    const th = u * TAU;
    const vv = lerp(hairEdgeV(th), 1, v);
    const off = 0.012 + 0.020 * smoothstep(0.62, 1.0, vv);
    return facePt(th, vv, off);
  }, 18, 8, (u, v) => {
    const th = u * TAU;
    const front = Math.max(0, Math.cos(th));
    const base = mixc(HAIR_SH, HAIR, 0.55 + 0.35 * Math.max(0, Math.cos(th - 0.7)));
    return mixc(base, HAIR_LT, 0.30 * smoothstep(0.55, 1.0, v) * (0.4 + 0.6 * front));
  }, HAIR_MAT, { center: (u, v) => [0, HEAD_CHIN + HEAD_H * lerp(hairEdgeV(u * TAU), 1, v), 0] });
  const cTop = facePt(0, 1, 0.032);
  const iT = b.vert(b.tp([0, cTop[1] + 0.004, -0.004]), b.tn([0, 1, 0]), HAIR_LT, HAIR_MAT);
  const ring = [];
  for (let i = 0; i < 18; i++) {
    const th = (i / 18) * TAU;
    ring.push(b.vert(b.tp(facePt(th, 1, 0.032)), b.tn(headN(th, 1)), HAIR, HAIR_MAT));
  }
  for (let i = 0; i < 18; i++) b.i.push(iT, ring[i], ring[(i + 1) % 18]);
}

// long wavy hair down the back: a curtain surface + pointed locks over it
function backHair(b, rng) {
  const TH0 = 1.40, TH1 = TAU - 1.40;
  const yTopAt = HEAD_CHIN + HEAD_H * 0.66;
  const yBotAt = (th) => {
    const mid = Math.max(0, Math.cos(th - Math.PI));
    const lobes = 0.026 * Math.cos(7.0 * th + 0.6);
    return 1.010 + 0.095 * (1 - mid) + lobes;
  };
  surf(b, (u, v) => {
    const th = lerp(TH0, TH1, u);
    const t = 1 - v;
    const y = lerp(yBotAt(th), yTopAt, Math.pow(v, 0.95));
    const wave = 0.010 * Math.sin(3.0 * th + 5.2 * t + 0.7);
    const edge = Math.min(u, 1 - u) / 0.16;            // taper the two front edges inward
    const r = (0.094 + 0.064 * Math.pow(1 - v, 1.5) + wave * (0.30 + 0.70 * t)) * (0.72 + 0.28 * clamp(edge, 0, 1));
    return [Math.sin(th) * r * 1.03, y, Math.cos(th) * r * 0.99];
  }, 24, 11, (u, v) => {
    const th = lerp(TH0, TH1, u);
    const t = 1 - v;
    const base = mixc(HAIR_SH, HAIR, 0.30 + 0.70 * Math.cos((th - Math.PI) * 0.42));
    return mixc(base, HAIR_LT, 0.26 * smoothstep(0.15, 0.95, v) + 0.20 * Math.max(0, Math.cos(th - Math.PI - 0.5)) * t);
  }, HAIR_MAT, { center: (u, v) => {
    const th = lerp(TH0, TH1, u);
    return [Math.sin(th) * 0.055, HEAD_CHIN + 0.16, Math.cos(th) * 0.055];
  } });
  // pointed locks laid over the curtain, tips below the hem
  const N = 9;
  for (let i = 0; i < N; i++) {
    const u = (i + 0.5) / N;
    const th = lerp(TH0 + 0.06, TH1 - 0.06, u);
    const mid = Math.max(0, Math.cos(th - Math.PI));
    const yTop = HEAD_CHIN + HEAD_H * 0.86 - 0.03 * mid;
    const yEnd = yBotAt(th) - 0.030 - 0.070 * Math.max(0, Math.cos(th - Math.PI - 0.30)) - 0.02 * (i % 2);
    const rEnd = 0.140 + 0.012 * Math.sin(i * 2.1);
    const pts = [];
    for (let k = 0; k < 6; k++) {
      const t = k / 5;
      const y = lerp(yTop, yEnd, t);
      const r = lerp(0.086, rEnd, Math.pow(t, 0.62)) + 0.010 * Math.sin(t * 4.6 + i * 1.7);
      const th2 = th + 0.030 * Math.sin(t * 3.4 + i * 2.3) * t;
      pts.push([Math.sin(th2) * r * 1.03, y, Math.cos(th2) * r * 0.99]);
    }
    const col = i % 3 === 0 ? HAIR_LT : (i % 3 === 1 ? HAIR : HAIR_SH);
    strand(b, pts, (t) => lerp(0.044, 0.005, Math.pow(t, 0.8)), (t) => lerp(0.018, 0.004, t), 5,
      (t) => mixc(mixc(HAIR_SH, col, 0.4 + 0.6 * Math.min(1, t * 1.6)), HAIR_LT, 0.22 * smoothstep(0.45, 1, t)), HAIR_MAT, { caps: 'end' });
  }
  // two longer centre-back locks that break the hem line
  for (const off of [-0.16, 0.16]) {
    const th = Math.PI + off;
    const pts = [];
    for (let k = 0; k < 5; k++) {
      const t = k / 4;
      pts.push([Math.sin(th) * (0.090 + 0.045 * t) * 1.03, HEAD_CHIN + 0.20 - 0.28 * t, Math.cos(th) * (0.090 + 0.045 * t)]);
    }
    strand(b, pts, (t) => lerp(0.048, 0.006, t), (t) => lerp(0.016, 0.004, t), 5,
      (t) => mixc(HAIR, HAIR_LT, 0.25 + 0.45 * t), HAIR_MAT, { caps: 'end' });
  }
}

function sideLocks(b, rng) {
  for (const sx of [-1, 1]) {
    const mk = (th0, v0, off, len, spread, tail, phase, n = 6) => {
      const p0 = facePt(sx * th0, v0, off);
      const pts = [];
      for (let k = 0; k < n; k++) {
        const t = k / (n - 1);
        pts.push([
          p0[0] + sx * (spread * Math.pow(t, 1.5) + 0.011 * Math.sin(t * 5.4 + phase)),
          p0[1] - len * t,
          p0[2] + tail * t + 0.013 * Math.sin(t * 3.6 + phase),
        ]);
      }
      return pts;
    };
    // a layered cluster of thin locks from the temple down past the shoulder
    const spec = [
      [1.22, 0.56, 0.016, 0.44, 0.026, 0.030, 0.6, 0.022],
      [1.14, 0.60, 0.014, 0.38, 0.020, 0.022, 2.1, 0.020],
      [1.06, 0.63, 0.012, 0.31, 0.015, 0.015, 4.0, 0.018],
      [0.99, 0.655, 0.011, 0.24, 0.011, 0.008, 5.2, 0.016],
      [1.36, 0.50, 0.024, 0.36, 0.038, -0.014, 1.2, 0.026],
      [1.48, 0.46, 0.030, 0.30, 0.046, -0.026, 3.3, 0.028],
    ];
    for (let i = 0; i < spec.length; i++) {
      const [th0, v0, off, len, spread, tail, phase, w0] = spec[i];
      const col = i % 3 === 0 ? HAIR_LT : (i % 3 === 1 ? HAIR : mixc(HAIR, HAIR_SH, 0.4));
      strand(b, mk(th0, v0, off, len, spread, tail, phase), (t) => lerp(w0, 0.004, Math.pow(t, 0.72)),
        (t) => lerp(0.012, 0.003, t), 5,
        (t) => mixc(mixc(HAIR_SH, col, 0.45 + 0.55 * Math.min(1, t * 1.5)), HAIR_LT, 0.18 * t), HAIR_MAT,
        { caps: 'end', ref: [sx, 0, 0] });
    }
  }
}

function bangs(b, rng) {
  // smooth fringe backing: gaps between the locks show hair, not forehead
  surf(b, (u, v) => {
    const th = (u - 0.5) * 2.16;
    const vv = lerp(0.655, 0.985, v);
    return facePt(th, vv, 0.027 + 0.005 * v);
  }, 16, 3, (u, v) => mixc(HAIR_SH, HAIR, 0.35 + 0.45 * v), HAIR_MAT,
    { closedU: false, center: (u, v) => [0, HEAD_CHIN + HEAD_H * 0.42, -0.03] });
  // 13 pointed locks with slightly different lengths / angles
  const N = 16;
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) / N;
    const a = (t - 0.5) * 2;
    const th = a * 1.06;
    const baseV = 0.955 - 0.055 * a * a;
    const tipV = 0.605 + 0.050 * Math.cos(a * 2.3) - 0.030 * (i % 3 === 0) + 0.012 * (i % 2);
    const tipTh = th * 0.90 + 0.05 * Math.sin(i * 2.7);
    const pts = [];
    for (let k = 0; k < 4; k++) {
      const tt = k / 3;
      const off = lerp(0.018, 0.028, tt) + 0.006 * Math.sin(Math.PI * tt);
      pts.push(facePt(lerp(th, tipTh, tt), lerp(baseV, tipV, tt), off));
    }
    pts[0] = [pts[0][0], pts[0][1] + 0.014, pts[0][2] - 0.006];
    const col = i % 4 === 0 ? HAIR_LT : (i % 3 === 0 ? mixc(HAIR, HAIR_LT, 0.5) : HAIR);
    const w0 = 0.032 + 0.008 * Math.abs(a);
    strand(b, pts, (t2) => lerp(w0, 0.006, Math.pow(t2, 0.68)), (t2) => lerp(0.016, 0.003, t2), 4,
      (t2) => mixc(mixc(HAIR_SH, col, 0.4 + 0.6 * Math.min(1, t2 * 1.6)), HAIR_LT, 0.25 * t2), HAIR_MAT, { caps: 'end' });
  }
  // two long sweeping strands at the temples, curling to the cheek
  for (const sx of [-1, 1]) {
    const pts = [];
    for (let k = 0; k < 5; k++) {
      const t = k / 4;
      const p = facePt(sx * (1.10 - 0.10 * t), 0.88 - 0.34 * t, 0.020 + 0.008 * t);
      pts.push([p[0] + sx * 0.008 * t, p[1] - 0.02 * t, p[2] + 0.004 * t]);
    }
    strand(b, pts, (t) => lerp(0.026, 0.004, Math.pow(t, 0.7)), (t) => lerp(0.012, 0.003, t), 5,
      (t) => mixc(HAIR_SH, HAIR_LT, 0.25 + 0.6 * t), HAIR_MAT, { caps: 'end', ref: [sx, 0, 0] });
  }
}

function ahoge(b) {
  const p = [0.004, HEAD_CHIN + HEAD_H + 0.012, -0.010];
  const pts = [p, [0.020, p[1] + 0.026, p[2] + 0.006], [0.046, p[1] + 0.034, p[2] - 0.012], [0.060, p[1] + 0.018, p[2] - 0.030]];
  strand(b, pts, (t) => lerp(0.015, 0.003, t), (t) => lerp(0.012, 0.002, t), 4,
    (t) => mixc(HAIR, HAIR_LT, 0.5 + 0.5 * t), HAIR_MAT, { caps: 'end' });
}

function hairBow(b) {
  const pos = [0.0, HEAD_CHIN + HEAD_H * 0.52, -0.140];
  at(b, pos, 0.0, () => {
    for (const s of [-1, 1]) {
      at(b, [s * 0.046, 0.012, -0.004], s * 0.42, () => {
        surf(b, (u, v) => {
          const th = u * TAU;
          const rx = 0.042 * (0.55 + 0.45 * Math.cos(v * 1.4));
          const ry = 0.026 * Math.sin(Math.PI * clamp(0.1 + 0.9 * v, 0, 1));
          return [Math.sin(th) * rx, (v - 0.5) * 0.040 + Math.sin(th) * ry * 0.5, Math.cos(th) * rx * 0.22];
        }, 8, 4, () => (s > 0 ? PINK : mixc(PINK, PINK_LT, 0.35)), MT.cloth, { center: [0, 0, -0.02] });
        surf(b, (u, v) => {
          const th = u * TAU;
          const rx = 0.030;
          return [Math.sin(th) * rx, (v - 0.5) * 0.026, Math.cos(th) * rx * 0.10 - 0.006];
        }, 6, 2, () => mixc(PINK, PINK_LT, 0.55), MT.cloth, { center: [0, 0, -0.02] });
      });
    }
    surf(b, (u, v) => {
      const th = u * TAU;
      const r = 0.018 * Math.sin(Math.PI * (0.1 + 0.9 * v)) + 0.002;
      return [Math.sin(th) * r, (v - 0.5) * 0.034, Math.cos(th) * r];
    }, 8, 4, () => mulc(PINK, 0.92), MT.cloth, { center: [0, 0, -0.02] });
    for (const s of [-1, 1]) {
      const pts = [
        [s * 0.012, -0.014, -0.004],
        [s * 0.036, -0.070, -0.010],
        [s * 0.030, -0.128, -0.004],
        [s * 0.050, -0.176, -0.014],
      ];
      strand(b, pts, (t) => lerp(0.038, 0.026, t), (t) => lerp(0.009, 0.004, t), 4,
        (t) => mixc(PINK, PINK_LT, 0.3 + 0.4 * t), MT.cloth, { caps: 'end' });
    }
  });
}

function hair(b, rng) {
  scalp(b, rng);
  backHair(b, rng);
  sideLocks(b, rng);
  bangs(b, rng);
  ahoge(b);
  hairBow(b);
  for (let i = 0; i < 5; i++) {
    const th = -0.55 + i * 0.28;
    const pts = [];
    for (let k = 0; k < 4; k++) {
      pts.push(facePt(th + 0.10 * Math.sin(k * 2.1 + i), lerp(0.70, 1.0, k / 3), 0.034 + 0.004 * Math.sin(k * 1.7)));
    }
    strand(b, pts, (t) => 0.011 * Math.sin(Math.PI * (0.15 + 0.85 * t)), 0.003, 3,
      () => HAIR_LT, HAIR_MAT, { caps: 'none' });
  }
}

// ================================================================ BODY
const Y = {
  sole: 0, ankle: 0.078, knee: 0.455, hip: 0.875, waist: 1.000,
  bust: 1.12, shoulder: 1.272, neck: 1.335, chin: 1.365,
};
function neck(b) {
  surf(b, (u, v) => {
    const th = u * TAU;
    const r = lerp(0.044, 0.0385, v) + 0.002 * Math.sin(Math.PI * v);
    return [Math.sin(th) * r * 1.05, lerp(1.268, 1.392, v), Math.cos(th) * r * 0.92 + 0.003];
  }, 9, 3, () => mixc(SKIN, SKIN_SH, 0.12), SKIN_MAT, { center: (u, v) => [0, lerp(1.268, 1.392, v), 0] });
  // upper chest, so the scoop neckline never shows a hole
  surf(b, (u, v) => {
    const th = u * TAU;
    const k = 1 - 0.30 * (v * v);
    return [Math.sin(th) * 0.086 * k * (1 + 0.02 * Math.cos(th * 3)), lerp(1.185, 1.290, v), Math.cos(th) * 0.062 * k];
  }, 12, 4, () => mixc(SKIN, SKIN_SH, 0.10), SKIN_MAT, { center: (u, v) => [0, lerp(1.185, 1.290, v), 0] });
}
function hands(b) {
  for (const sx of [-1, 1]) {
    const pos = [sx * 0.096, 1.036, 0.212];
    at(b, pos, sx * 0.55, () => {
      surf(b, (u, v) => {
        const th = u * TAU;
        const rx = 0.024 * Math.sin(Math.PI * (0.15 + 0.85 * v)) + 0.003;
        const rz = 0.017 * Math.sin(Math.PI * (0.15 + 0.85 * v)) + 0.002;
        return [Math.sin(th) * rz, (v - 0.5) * 0.062, Math.cos(th) * rx];
      }, 6, 3, () => mixc(SKIN, C.bloomPink, 0.06), SKIN_MAT, { center: [0, 0, -0.02] });
      for (let f = 0; f < 4; f++) {
        const t = (f + 0.5) / 4;
        const pts = [
          [0.006 - 0.012 * t, 0.030 - 0.004 * t, 0.004],
          [0.004 - 0.012 * t, 0.006 - 0.006 * t, 0.026],
          [-0.002 - 0.010 * t, -0.008 - 0.006 * t, 0.044],
        ];
        strand(b, pts, (tt) => lerp(0.016, 0.011, tt), (tt) => lerp(0.014, 0.010, tt), 3,
          () => mixc(SKIN, SKIN_SH, 0.10), SKIN_MAT, { caps: 'end' });
      }
      const tp = [[-0.016, 0.020, 0.006], [-0.026, 0.010, 0.024], [-0.024, -0.002, 0.038]];
      strand(b, tp, (tt) => lerp(0.019, 0.013, tt), (tt) => lerp(0.017, 0.011, tt), 3,
        () => mixc(SKIN, SKIN_SH, 0.12), SKIN_MAT, { caps: 'end' });
    });
  }
}
function arms(b) {
  // asymmetric idle pose: her left arm a touch higher around the bouquet
  for (const sx of [-1, 1]) {
    const sh = [sx * 0.112, 1.262, 0.004];
    const el = [sx * 0.170, 1.142 + (sx > 0 ? 0.008 : 0), 0.096];
    const wr = [sx * 0.104, 1.062 + (sx > 0 ? 0.006 : 0), 0.232];
    const mid = (a, c, t) => [lerp(a[0], c[0], t), lerp(a[1], c[1], t), lerp(a[2], c[2], t)];
    strand(b, [sh, mid(sh, el, 0.55), el], (t) => lerp(0.086, 0.064, t), (t) => lerp(0.080, 0.060, t), 6,
      (t) => mixc(mixc(SKIN, SKIN_SH, 0.05), mixc(SKIN, SKIN_SH, 0.25), t), SKIN_MAT, { caps: 'start' });
    at(b, el, 0, () => {
      surf(b, (u, v) => {
        const th = u * TAU;
        const rr = 0.031 * Math.sin(Math.PI * (0.1 + 0.9 * v)) + 0.004;
        return [Math.sin(th) * rr, (v - 0.5) * 0.05, Math.cos(th) * rr];
      }, 5, 3, () => mixc(SKIN, SKIN_SH, 0.08), SKIN_MAT, { center: [0, 0, -0.02] });
    });
    strand(b, [el, mid(el, wr, 0.5), wr], (t) => lerp(0.061, 0.045, t), (t) => lerp(0.056, 0.041, t), 6,
      (t) => mixc(mixc(SKIN, SKIN_SH, 0.10), mixc(SKIN, SKIN_SH, 0.30), t), SKIN_MAT, { caps: 'none' });
  }
}
function legs(b) {
  // weight on her right leg (-X side); her left leg is relaxed and turned out
  for (const sx of [-1, 1]) {
    const w = sx < 0;
    const hip = [sx * 0.062 + 0.006, Y.hip, -0.004];
    const knee = [sx * 0.058 + (w ? 0.004 : 0.020), Y.knee + (w ? 0 : 0.012), w ? 0.012 : 0.048];
    const ankle = [sx * 0.052 + (w ? 0.002 : 0.026), Y.ankle + (w ? 0.0 : 0.006), w ? -0.004 : 0.086];
    strand(b, [hip, [hip[0], lerp(hip[1], knee[1], 0.5), 0.004], knee,
      [lerp(knee[0], ankle[0], 0.55), lerp(knee[1], ankle[1], 0.55), lerp(knee[2], ankle[2], 0.55)], ankle],
      (t) => lerp(0.132, 0.074, Math.pow(t, 0.85)), (t) => lerp(0.124, 0.070, Math.pow(t, 0.85)), 7,
      (t) => mixc(STOCK, mixc(STOCK, C.stoneCool, 0.35), t * 0.6), [0.035, 0.14], { caps: 'both' });
    at(b, knee, 0, () => {
      surf(b, (u, v) => {
        const th = u * TAU;
        const rr = 0.050 * Math.sin(Math.PI * (0.12 + 0.88 * v)) + 0.006;
        return [Math.sin(th) * rr, (v - 0.5) * 0.07, Math.cos(th) * rr];
      }, 6, 3, () => mixc(STOCK, C.stoneCool, 0.18), [0.035, 0.14], { center: [0, 0, -0.02] });
    });
    // lace garter just under the hem
    surf(b, (u, v) => {
      const th = u * TAU;
      const rr = lerp(0.048, 0.043, v) + 0.004 * Math.cos(th * 9) * Math.sin(Math.PI * v);
      return [knee[0] + Math.sin(th) * rr, knee[1] + 0.150 + (v - 0.5) * 0.030, knee[2] + Math.cos(th) * rr];
    }, 12, 2, () => LACE, [0.0, 0.10], { center: (u, v) => [knee[0], knee[1] + 0.15, knee[2]] });
    // Mary-Jane shoe
    at(b, [ankle[0], 0.048, ankle[2] + 0.014], sx * (w ? 0.10 : 0.30), () => {
      surf(b, (u, v) => {
        const th = u * TAU;
        const rx = 0.040 * Math.sin(Math.PI * (0.10 + 0.90 * v)) + 0.006;
        const rz = 0.030 * Math.sin(Math.PI * (0.10 + 0.90 * v)) + 0.004;
        return [Math.sin(th) * rx, (v - 0.5) * 0.050 - 0.004, Math.cos(th) * (rz + 0.030 * v) + 0.018 * v];
      }, 8, 4, (u, v) => mixc(SHOE, SHOE_LT, 0.15 + 0.25 * v), [0.0, 0.42], { center: [0, 0, -0.02] });
      surf(b, (u, v) => {
        const th = u * TAU;
        const rr = 0.024 * Math.sin(Math.PI * (0.1 + 0.9 * v)) + 0.003;
        return [Math.sin(th) * rr * 1.15, (v - 0.5) * 0.024 - 0.018, Math.cos(th) * rr + 0.052];
      }, 6, 3, () => mulc(SHOE, 1.1), [0.0, 0.5], { center: [0, 0, 0.02] });
      surf(b, (u, v) => {
        const th = u * TAU;
        return [Math.sin(th) * 0.033, Math.sin(th * 2) * 0.004 + 0.014, Math.cos(th) * 0.021 + 0.012 * v];
      }, 10, 1, () => SHOE_LT, [0.0, 0.45], { center: [0, 0.008, 0] });
      box(b, 0.030, 0.016, 0.022, SHOE, [0.0, 0.4]);
    });
  }
}

// ================================================================ DRESS
function bodice(b) {
  const RX = (v) => lerp(0.081, 0.096, Math.pow(v, 0.75));
  const RZ = (v) => lerp(0.064, 0.076, Math.pow(v, 0.75));
  const yTop = (th) => 1.286 - 0.052 * Math.pow(Math.max(0, Math.cos(th)), 1.5) - 0.016 * Math.pow(Math.max(0, -Math.cos(th)), 2.0);
  surf(b, (u, v) => {
    const th = u * TAU;
    const bust = 0.011 * Math.pow(Math.max(0, Math.cos(th)), 3.0) * Math.sin(Math.PI * clamp(v * 0.95 + 0.05, 0, 1));
    const pleat = 0.0018 * Math.cos(th * 14 + 0.4) * (1 - v);
    const rx = RX(v) + pleat, rz = RZ(v) + bust + pleat;
    return [Math.sin(th) * rx, lerp(Y.waist - 0.010, yTop(th), v), Math.cos(th) * rz];
  }, 16, 8, (u, v) => {
    const th = u * TAU;
    return mulc(DRESS, 0.90 + 0.10 * Math.max(0, Math.cos(th - 0.6)) + 0.06 * v);
  }, MT.cloth, { center: (u, v) => [0, lerp(Y.waist, 1.28, v), 0] });
  // lace yoke band along the neckline
  surf(b, (u, v) => {
    const th = u * TAU;
    return [Math.sin(th) * (RX(1) + 0.0022), yTop(th) - 0.014 + v * 0.026, Math.cos(th) * (RZ(1) + 0.0022)];
  }, 16, 1, (u, v) => mixc(LACE, DRESS_W, 0.4 + 0.4 * Math.sin(u * TAU * 8)), MT.cloth, { center: (u, v) => [0, 1.28, 0] });
  // scalloped lace collar edging at the neck
  surf(b, (u, v) => {
    const th = u * TAU;
    const scallop = 0.005 * Math.pow(Math.max(0, Math.cos(th * 10)), 2);
    const r = 0.0455 + 0.003 * v;
    return [Math.sin(th) * r * 1.02, 1.308 + (v - 0.5) * 0.022 - scallop * v, Math.cos(th) * r * 0.95];
  }, 20, 2, () => LACE, MT.cloth, { center: (u, v) => [0, 1.30, 0] });
  // puff sleeves + lace cuffs
  for (const sx of [-1, 1]) {
    at(b, [sx * 0.126, 1.252, 0.002], sx * 0.30, () => {
      surf(b, (u, v) => {
        const th = u * TAU;
        const rr = 0.058 * Math.sin(Math.PI * (0.06 + 0.88 * v)) + 0.004;
        return [Math.sin(th) * rr * 1.02, (v - 0.5) * 0.125, Math.cos(th) * rr * 0.92];
      }, 9, 5, (u, v) => mulc(DRESS, 0.92 + 0.10 * Math.max(0, Math.cos(u * TAU - 0.5)) + 0.06 * v),
        MT.cloth, { center: [0, 0, -0.02] });
    });
    at(b, [sx * 0.158, 1.186, 0.052], sx * 0.55, () => {
      surf(b, (u, v) => {
        const th = u * TAU;
        const scallop = 0.006 * Math.pow(Math.max(0, Math.cos(th * 8)), 2);
        const r = 0.041 + 0.006 * v;
        return [Math.sin(th) * r, (v - 0.5) * 0.038 - scallop * (1 - v), Math.cos(th) * r];
      }, 12, 2, () => LACE, MT.cloth, { center: (u, v) => [0, 0, 0] });
    });
  }
}
function sash(b) {
  surf(b, (u, v) => {
    const th = u * TAU;
    return [Math.sin(th) * (0.084 + 0.004 * v), lerp(0.972, 1.056, v), Math.cos(th) * (0.068 + 0.004 * v)];
  }, 14, 2, (u, v) => mixc(RIB, RIB_LT, 0.25 + 0.35 * v + 0.15 * Math.max(0, Math.cos(u * TAU))),
    MT.cloth, { center: (u, v) => [0, 1.01, 0] });
  at(b, [0.004, 1.012, -0.082], 0.0, () => {
    for (const s of [-1, 1]) {
      at(b, [s * 0.052, 0.014, -0.006], s * 0.52, () => {
        surf(b, (u, v) => {
          const th = u * TAU;
          const rx = 0.056 * (0.55 + 0.45 * Math.cos(v * 1.2));
          const ry = 0.030 * Math.sin(Math.PI * clamp(0.08 + 0.92 * v, 0, 1));
          return [Math.sin(th) * rx, (v - 0.5) * 0.048 + Math.sin(th) * ry * 0.4, Math.cos(th) * rx * 0.20];
        }, 9, 4, (u, v) => mixc(s > 0 ? RIB : RIB_DK, RIB_LT, 0.20 + 0.45 * v), MT.cloth, { center: [0, 0, -0.02] });
        surf(b, (u, v) => {
          const th = u * TAU;
          return [Math.sin(th) * 0.034, (v - 0.5) * 0.040, Math.cos(th) * 0.034 * 0.09 - 0.008];
        }, 7, 2, () => mulc(RIB, 0.82), MT.cloth, { center: [0, 0, -0.02] });
      });
    }
    surf(b, (u, v) => {
      const th = u * TAU;
      const r = 0.020 * Math.sin(Math.PI * (0.1 + 0.9 * v)) + 0.002;
      return [Math.sin(th) * r * 1.15, (v - 0.5) * 0.046, Math.cos(th) * r];
    }, 8, 4, () => mulc(RIB, 1.05), MT.cloth, { center: [0, 0, -0.02] });
    for (const s of [-1, 1]) {
      const pts = [
        [s * 0.010, -0.020, -0.010], [s * 0.046, -0.090, -0.022], [s * 0.060, -0.170, -0.012],
        [s * 0.086, -0.250, -0.028], [s * 0.098, -0.312, -0.010],
      ];
      strand(b, pts, (t) => lerp(0.068, 0.076, t), (t) => lerp(0.010, 0.005, t), 4,
        (t) => mixc(mixc(RIB, RIB_DK, 0.15 + 0.25 * s), RIB_LT, 0.25 * t), MT.cloth, { caps: 'both' });
      at(b, [s * 0.098, -0.322, -0.010], s * 0.3, () => {
        b.tri([-0.020, 0.010, 0], [0.020, 0.010, 0], [0.0, -0.026, 0], mulc(RIB, 0.9), MT.cloth, [0, 0, 1]);
      });
    }
  });
}
function skirtTier(b, yTop, yBot, rTop, rBot, lobes, hemAmp, colFn, opts = {}) {
  const zs = opts.zScale ?? 0.94;
  const pleats = opts.pleats ?? 14;
  const pleatAmp = opts.pleatAmp ?? 0.0035;
  surf(b, (u, v) => {
    const th = u * TAU;
    const r = lerp(rBot, rTop, Math.pow(v, 0.92));
    const ruf = hemAmp * Math.pow(1 - v, 2.2) * Math.cos(lobes * th);
    const pleat = pleatAmp * Math.cos(pleats * th + 0.5) * (0.25 + 0.75 * (1 - v));
    const y = lerp(yBot, yTop, v) + hemAmp * 0.55 * Math.pow(1 - v, 3.0) * Math.cos(lobes * th + 0.4);
    return [Math.sin(th) * (r + ruf + pleat), y, Math.cos(th) * (r + ruf + pleat) * zs];
  }, 26, 4, (u, v) => colFn(u, v), MT.cloth, { center: (u, v) => [0, lerp(yBot, yTop, v), 0] });
}
// tier shading: a lit bottom edge, and the top of each tier falls into the
// shadow of the tier above — that is what makes the layers read.
function tierColFn(base, edge) {
  return (u, v) => {
    const c = mulc(base, 1.06 - 0.30 * v);
    return v < 0.10 ? mixc(c, edge, 0.55) : c;
  };
}
function skirt(b) {
  const tiers = [
    { yT: 0.964, yB: 0.888, rT: 0.128, rB: 0.168, lobes: 10, amp: 0.010, c: tierColFn(DRESS, LACE) },
    { yT: 0.902, yB: 0.812, rT: 0.172, rB: 0.216, lobes: 12, amp: 0.012, c: tierColFn(mixc(DRESS, LACE, 0.22), DRESS_W) },
    { yT: 0.824, yB: 0.738, rT: 0.220, rB: 0.264, lobes: 12, amp: 0.012, c: tierColFn(mixc(DRESS, LACE, 0.40), DRESS_W) },
    { yT: 0.744, yB: 0.664, rT: 0.268, rB: 0.314, lobes: 14, amp: 0.014, c: tierColFn(DRESS, LACE) },
  ];
  for (const t of tiers) skirtTier(b, t.yT, t.yB, t.rT, t.rB, t.lobes, t.amp, t.c);
  skirtTier(b, 0.714, 0.638, 0.302, 0.326, 16, 0.013, tierColFn(mixc(LACE, DRESS_W, 0.5), DRESS_W),
    { zScale: 0.95, pleats: 18, pleatAmp: 0.002 });
  surf(b, (u, v) => {
    const th = u * TAU;
    const r = lerp(0.086, 0.128, v);
    return [Math.sin(th) * r, lerp(1.000, 0.960, v), Math.cos(th) * r * 0.95];
  }, 16, 2, (u, v) => mulc(DRESS, 0.90 + 0.10 * v), MT.cloth, { center: (u, v) => [0, lerp(1.0, 0.96, v), 0] });
}

// ================================================================ BOUQUET
function petal(b, len, wid, cup, col, mat, seg = 2) {
  surf(b, (u, v) => {
    const wv = wid * Math.pow(Math.sin(Math.PI * clamp(0.10 + 0.90 * v, 0, 1)), 0.62);
    return [(u - 0.5) * wv, len * v, cup * v * v];
  }, seg, 2, () => col, mat, { closedU: false, center: [0, len * 0.35, -0.05] });
}
function leaf(b, len, wid, cup, col, mat) {
  surf(b, (u, v) => {
    const wv = wid * Math.pow(Math.sin(Math.PI * clamp(0.06 + 0.94 * v, 0, 1)), 0.72);
    return [(u - 0.5) * wv, len * v, cup * (v - 0.5) * (v - 0.5)];
  }, 2, 2, () => col, mat, { closedU: false, center: [0, len * 0.4, -0.05] });
}
function flowerCore(b, R, y0, col) {
  surf(b, (u, v) => {
    const th = u * TAU;
    const rr = R * Math.sin(Math.PI * (0.1 + 0.9 * v)) + 0.001;
    return [Math.sin(th) * rr, y0 + (v - 0.5) * R * 0.34, Math.cos(th) * rr];
  }, 6, 3, () => col, [0.02, 0.22], { center: [0, y0, -0.01] });
}
function rose(b, R, col, rng) {
  const rings = [[6, 0.72, 66], [5, 0.52, 46], [4, 0.32, 28], [3, 0.15, 12]];
  for (let ri = 0; ri < rings.length; ri++) {
    const [n, rr, tilt] = rings[ri];
    const ph = rng() * 0.6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + ph + ri * 0.7;
      const tl = (tilt * Math.PI) / 180;
      const d = [Math.sin(a) * Math.sin(tl), Math.cos(tl), Math.cos(a) * Math.sin(tl)];
      axisAt(b, [Math.sin(a) * R * rr * 0.55, R * 0.10 * (ri + 1) * 0.6, Math.cos(a) * R * rr * 0.55], d, () => {
        petal(b, R * (0.66 - 0.10 * ri), R * 0.50, R * 0.24, mixc(col, mulc(col, 1.18), 0.22 * ri), [0.02, 0.20]);
      });
    }
  }
  flowerCore(b, R * 0.22, R * 0.26, mixc(col, mulc(col, 0.8), 0.3));
}
function tulip(b, R, col, rng) {
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + rng() * 0.2;
    const tl = (22 * Math.PI) / 180;
    const d = [Math.sin(a) * Math.sin(tl), Math.cos(tl), Math.cos(a) * Math.sin(tl)];
    axisAt(b, [Math.sin(a) * R * 0.18, 0, Math.cos(a) * R * 0.18], d, () => {
      petal(b, R * 0.82, R * 0.50, R * 0.30, mixc(col, mulc(col, 1.08), 0.35), [0.02, 0.24]);
    });
  }
  flowerCore(b, R * 0.16, R * 0.14, mulc(col, 0.72));
}
function daisy(b, R, col, rng) {
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rng() * 0.3;
    const tl = (30 * Math.PI) / 180;
    const d = [Math.sin(a) * Math.sin(tl), Math.cos(tl), Math.cos(a) * Math.sin(tl)];
    axisAt(b, [Math.sin(a) * R * 0.24, 0.0, Math.cos(a) * R * 0.24], d, () => {
      petal(b, R * 0.78, R * 0.30, R * 0.06, col, [0.02, 0.18], 1);
    });
  }
  flowerCore(b, R * 0.24, R * 0.08, mixc(C.bloomYellow, C.goldBright, 0.4));
}
function bud(b, R, col) {
  surf(b, (u, v) => {
    const th = u * TAU;
    const rr = R * Math.sin(Math.PI * (0.15 + 0.85 * v)) + 0.001;
    return [Math.sin(th) * rr, (v - 0.35) * R * 1.5, Math.cos(th) * rr];
  }, 4, 2, () => col, [0.03, 0.25], { center: [0, 0, -0.01] });
}
function bouquet(b, rng) {
  at(b, [0.0, 1.155, 0.225], 0.0, () => {
    // small dark-green core: it should only be glimpsed through the flowers
    surf(b, (u, v) => {
      const th = u * TAU;
      const rr = 0.045 * Math.sin(Math.PI * (0.08 + 0.92 * v)) + 0.004;
      return [Math.sin(th) * rr * 1.10, (v - 0.5) * 0.16, Math.cos(th) * rr * 0.90 - 0.035];
    }, 10, 5, () => mixc(C.leafDark, C.catBlack, 0.35), MT.leaf, { center: [0, 0, -0.04] });
    const axis = norm([0, 0.34, 1.0]);
    const e1 = norm(cross(axis, [0, 1, 0]));
    const e2 = norm(cross(axis, e1));
    const sph = (phi, ct) => {
      const st = Math.sqrt(Math.max(0, 1 - ct * ct));
      return [axis[0] * ct + (e1[0] * Math.cos(phi) + e2[0] * Math.sin(phi)) * st,
        axis[1] * ct + (e1[1] * Math.cos(phi) + e2[1] * Math.sin(phi)) * st,
        axis[2] * ct + (e1[2] * Math.cos(phi) + e2[2] * Math.sin(phi)) * st];
    };
    // ---- the flowers: 32 blooms on a dome, roses dominant
    const N = 32;
    for (let i = 0; i < N; i++) {
      const u = (i + 0.5) / N;
      const phi = i * 2.39996;
      const ct = -0.22 + 1.22 * Math.pow(u, 0.86);
      const dir = sph(phi, ct);
      const rad = 0.152 * (0.84 + 0.18 * Math.sqrt(u));
      const pos = [dir[0] * rad * 1.12, dir[1] * rad * 0.82 + 0.006, dir[2] * rad * 0.86];
      const col = FLOWER_COLS[(i * 3 + (i % 5)) % FLOWER_COLS.length];
      const R0 = 0.045 + 0.006 * ((i * 7) % 3);
      const kind = i % 8;
      if (kind === 2) axisAt(b, pos, dir, () => tulip(b, R0 * 1.05, col, rng));
      else if (kind === 5) axisAt(b, pos, dir, () => daisy(b, R0 * 1.0, col, rng));
      else axisAt(b, pos, dir, () => rose(b, R0 * (kind === 0 ? 1.22 : 1.0), col, rng));
    }
    // ---- inner layer: blooms pushed forward so the middle of the dome is petals
    for (let i = 0; i < 8; i++) {
      const phi = i * 2.39996 + 0.35;
      const ct = 0.74 + 0.13 * (i % 3);
      const dir = sph(phi, ct);
      const rad = 0.112;
      const pos = [dir[0] * rad * 1.12, dir[1] * rad * 0.86 + 0.006, dir[2] * rad * 0.92];
      const col = FLOWER_COLS[(i * 5 + 2) % FLOWER_COLS.length];
      axisAt(b, pos, dir, () => rose(b, (i % 2 ? 0.045 : 0.052), col, rng));
    }
    // ---- five extra blooms closing the lower-front gap of the dome
    const lowDirs = [[-0.34, -0.52, 0.78], [0.30, -0.60, 0.74], [0.0, -0.72, 0.60], [-0.10, -0.38, 0.92], [0.12, -0.20, 0.97],
      [-0.22, -0.30, 0.93], [0.24, -0.34, 0.91], [0.0, -0.42, 0.91]];
    for (let i = 0; i < lowDirs.length; i++) {
      const dir = norm(lowDirs[i]);
      const rad = 0.140;
      const pos = [dir[0] * rad * 1.12, dir[1] * rad * 0.92 + 0.004, dir[2] * rad * 0.88];
      const col = FLOWER_COLS[(i * 2 + 1) % FLOWER_COLS.length];
      axisAt(b, pos, dir, () => rose(b, 0.048, col, rng));
    }
    // ---- tiny filler buds tucked between the blooms
    for (let i = 0; i < 14; i++) {
      const phi = i * 2.39996 + 0.9;
      const ct = -0.15 + 0.95 * ((i % 7) / 6);
      const dir = sph(phi, ct);
      const rad = 0.140 + 0.014 * ((i % 3) / 2);
      const pos = [dir[0] * rad * 1.10, dir[1] * rad * 0.90, dir[2] * rad * 0.90];
      const bc = i % 4 === 0 ? C.bloomWhite : mixc(FLOWER_COLS[i % 3], WHITE, 0.45);
      axisAt(b, pos, dir, () => bud(b, 0.010 + 0.003 * (i % 2), bc));
    }
    // ---- leaves: only around the rim, peeking out of the flowers
    for (let i = 0; i < 12; i++) {
      const phi = i * 2.39996 + 1.7;
      const ct = -0.30 + 0.75 * ((i % 6) / 5);
      const dir = sph(phi, ct);
      const rad = 0.158 + 0.010 * (i % 3);
      const pos = [dir[0] * rad * 1.08, dir[1] * rad * 0.92, dir[2] * rad * 0.90];
      axisAt(b, pos, [dir[0] * 1.6, dir[1] * 1.4 - 0.55, dir[2] * 1.3], () => {
        leaf(b, 0.055 + 0.014 * (i % 3), 0.032, 0.014, i % 2 ? C.leaf : C.leafLight, MT.leaf);
      });
    }
    // ---- stems below the mass
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.4;
      const pts = [[Math.sin(a) * 0.050, -0.080, Math.cos(a) * 0.036],
        [Math.sin(a) * 0.058, -0.150, Math.cos(a) * 0.042 + 0.008],
        [Math.sin(a) * 0.062, -0.215, Math.cos(a) * 0.045]];
      strand(b, pts, 0.009, 0.009, 4, (t) => mixc(C.leafDark, C.bronze, 0.25 + 0.15 * t), MT.leaf, { caps: 'both' });
    }
    // ---- ribbon tie around the stems, with two tails
    surf(b, (u, v) => {
      const th = u * TAU;
      const r = 0.040 + 0.004 * v;
      return [Math.sin(th) * r, lerp(-0.132, -0.088, v), Math.cos(th) * r];
    }, 10, 2, (u, v) => mixc(RIB, RIB_LT, 0.2 + 0.4 * v), MT.cloth, { center: (u, v) => [0, -0.12, 0] });
    for (const s of [-1, 1]) {
      const pts = [[s * 0.018, -0.150, 0.026], [s * 0.045, -0.220, 0.024], [s * 0.030, -0.290, 0.010], [s * 0.055, -0.340, 0.016]];
      strand(b, pts, (t) => lerp(0.046, 0.034, t), (t) => lerp(0.007, 0.005, t), 4,
        (t) => mixc(RIB, RIB_LT, 0.2 + 0.3 * t), MT.cloth, { caps: 'end' });
    }
  });
}

// ================================================================ THE GIRL
export function girlGeom(b, rng) {
  // subtle contrapposto: the whole figure leans a hair, hips shifted
  b.push(xf([0.004, 0, 0], 0, 0, -0.012, 1));
  legs(b);
  skirt(b);
  bodice(b);
  sash(b);
  neck(b);
  arms(b);
  hands(b);
  bouquet(b, rng);
  // head group: slight tilt + turn, so she is not a mannequin
  b.push(xf([0, 1.352, 0.004], -0.055, 0.020, 0.052, 1));
  b.push(xf([0, -1.352, 0], 0, 0, 0, 1));
  head(b, rng);
  face(b);
  hair(b, rng);
  b.pop();
  b.pop();
  b.pop();
}

// ================================================================ THE CAT
export function catGeom(b, rng) {
  const C0 = CAT, C1 = CAT_LT;
  const fur = (u, v) => mixc(C0, C1, 0.10 + 0.30 * Math.max(0, Math.cos(u * TAU - 0.7)) * (0.4 + 0.6 * v));
  // haunch
  surf(b, (u, v) => {
    const th = u * TAU;
    const rr = Math.sin(Math.PI * (0.06 + 0.88 * v)) + 0.02;
    return [Math.sin(th) * 0.078 * rr, 0.012 + v * 0.155, Math.cos(th) * 0.098 * rr - 0.012];
  }, 10, 6, (u, v) => fur(u, v), [0.0, 0.13], { center: (u, v) => [0, 0.012 + v * 0.155, -0.02] });
  // chest / shoulders
  surf(b, (u, v) => {
    const th = u * TAU;
    const rr = Math.sin(Math.PI * (0.05 + 0.9 * v)) * 0.9 + 0.06;
    return [Math.sin(th) * 0.058 * rr, 0.085 + v * 0.155, Math.cos(th) * 0.058 * rr + 0.030];
  }, 10, 5, (u, v) => mixc(C0, C1, 0.12 + 0.34 * Math.max(0, Math.cos(u * TAU)) * (0.3 + 0.7 * v)),
    [0.0, 0.13], { center: (u, v) => [0, 0.085 + v * 0.155, 0.0] });
  // head, in cat-absolute coordinates (head centre at y=0.268, z=0.038)
  surf(b, (u, v) => {
    const th = u * TAU;
    const rr = Math.sin(Math.PI * (0.10 + 0.86 * v)) + 0.02;
    const squash = 1 - 0.15 * Math.max(0, -Math.cos(th));
    return [Math.sin(th) * 0.066 * rr, 0.268 + (v - 0.42) * 0.135, 0.038 + Math.cos(th) * 0.062 * rr * squash];
  }, 12, 7, (u, v) => fur(u, v), [0.0, 0.16], { center: (u, v) => [0, 0.268 + (v - 0.42) * 0.135, 0.028] });
  // muzzle
  surf(b, (u, v) => {
    const th = u * TAU;
    const rr = Math.sin(Math.PI * (0.12 + 0.82 * v)) + 0.02;
    return [Math.sin(th) * 0.030 * rr, 0.246 + (v - 0.5) * 0.052, 0.058 + v * 0.030 + Math.cos(th) * 0.022 * rr];
  }, 8, 4, () => mixc(C1, C0, 0.35), [0.0, 0.20], { center: [0, 0.246, 0.05] });
  // eyes: almond, gold-green, vertical slit
  for (const sx of [-1, 1]) {
    at(b, [sx * 0.030, 0.288, 0.046], sx * 0.30, () => {
      surf(b, (u, v) => {
        const th = u * TAU;
        return [Math.sin(th) * 0.020, (v - 0.5) * 0.026 * (1 - 0.25 * Math.abs(Math.sin(th))), 0.004 + Math.cos(th) * 0.004];
      }, 8, 2, () => CAT_EYE, [0.25, 0.6], { center: [0, 0, -0.03] });
      surf(b, (u, v) => {
        const th = u * TAU;
        return [Math.sin(th) * 0.0035, (v - 0.5) * 0.019, 0.008 + Math.cos(th) * 0.002];
      }, 5, 1, () => mulc(C.catBlack, 0.7), [0.0, 0.7], { center: [0, 0, 0] });
    });
  }
  // ears
  for (const sx of [-1, 1]) {
    at(b, [sx * 0.042, 0.315, 0.020], sx * 0.26, () => {
      surf(b, (u, v) => {
        const th = u * TAU;
        const w = 0.030 * (1 - v) + 0.002;
        const d = 0.020 * (1 - v) + 0.002;
        return [Math.sin(th) * w, v * 0.070, Math.cos(th) * d];
      }, 6, 3, () => C0, [0.0, 0.10], { center: [0, 0.02, -0.02] });
      surf(b, (u, v) => {
        const th = u * TAU;
        const w = 0.016 * (1 - v) + 0.001;
        return [Math.sin(th) * w, v * 0.048, Math.cos(th) * (0.010 * (1 - v) + 0.001) + 0.004];
      }, 5, 2, () => mixc(C.bloomPink, C.catBlack, 0.62), [0.0, 0.1], { center: [0, 0.02, -0.01] });
    });
  }
  // nose
  b.tri([-0.009, 0.256, 0.096], [0.009, 0.256, 0.096], [0, 0.246, 0.099], mixc(C.bloomPink, C.catBlack, 0.45), [0.0, 0.25], [0, 0.3, 1]);
  // front legs + paws
  for (const sx of [-1, 1]) {
    const pts = [[sx * 0.032, 0.150, 0.058], [sx * 0.034, 0.090, 0.078], [sx * 0.032, 0.026, 0.088], [sx * 0.030, 0.006, 0.100]];
    strand(b, pts, (t) => lerp(0.050, 0.038, t), (t) => lerp(0.046, 0.035, t), 5,
      (t) => mixc(C0, C1, 0.15 + 0.25 * t), [0.0, 0.12], { caps: 'both' });
    at(b, [sx * 0.030, 0.010, 0.108], 0, () => {
      surf(b, (u, v) => {
        const th = u * TAU;
        const rr = Math.sin(Math.PI * (0.1 + 0.9 * v)) + 0.02;
        return [Math.sin(th) * 0.021 * rr, (v - 0.5) * 0.026, Math.cos(th) * 0.030 * rr];
      }, 6, 3, () => mixc(C1, C0, 0.4), [0.0, 0.15], { center: [0, 0, -0.01] });
    });
  }
  // tail curling around the base
  const tail = [];
  for (let k = 0; k < 8; k++) {
    const t = k / 7;
    const a = Math.PI * 0.85 + t * 2.5;
    tail.push([Math.sin(a) * (0.085 + 0.03 * t), 0.020 + 0.045 * Math.sin(t * 2.6), Math.cos(a) * (0.085 + 0.03 * t) - 0.01]);
  }
  strand(b, tail, (t) => lerp(0.050, 0.028, t), (t) => lerp(0.046, 0.026, t), 5,
    (t) => mixc(C0, C1, 0.12 + 0.22 * t), [0.0, 0.14], { caps: 'end' });
  // whiskers
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const base = [sx * 0.026, 0.250 + 0.008 * (1 - i), 0.088];
      const tip = [sx * 0.085, 0.258 + 0.020 * (1 - i), 0.072 + 0.010 * i];
      strand(b, [base, [lerp(base[0], tip[0], 0.5), lerp(base[1], tip[1], 0.5) + 0.004, lerp(base[2], tip[2], 0.5)], tip],
        0.0045, 0.0045, 3, () => mixc(C1, C.cloudLit, 0.5), [0.0, 0.3], { caps: 'none' });
    }
  }
}

// ================================================================ ENTRY POINT
// Local-space helper: convert a girl-local offset to world, honouring GIRL_YAW.
function girlWorld(lx0, ly0, lz0) {
  return [
    GIRL_X + Math.sin(GIRL_YAW) * lz0 + Math.cos(GIRL_YAW) * lx0,
    DECK_Y + ly0,
    GIRL_Z + Math.cos(GIRL_YAW) * lz0 - Math.sin(GIRL_YAW) * lx0,
  ];
}
export function buildHero(b, ctx, rng) {
  b.note && b.note('hero');
  // the girl: at the balustrade facing the city / the view-8 camera
  b.push(xf([GIRL_X, DECK_Y, GIRL_Z], GIRL_YAW, 0, 0, 1));
  girlGeom(b, rng);
  b.pop();
  // the black cat on the handrail beside her, looking back at her
  const cx = HERO_ANCHOR.catX;
  const cz = railZ(cx) + 0.02;
  const toGirl = Math.atan2(GIRL_X - cx, GIRL_Z - cz);
  b.push(xf([cx, RAIL_TOP - 0.004, cz], toGirl, 0, 0, 1));
  catGeom(b, rng);
  b.pop();
  // She stands on the shaded side of the city: the sun rakes her back, so add a
  // warm front fill (face/chest/bouquet) and a cool kicker from her left.
  if (ctx && ctx.points) {
    ctx.points.push({ p: girlWorld(0.30, 1.46, 1.15), col: mixc(C.sunGlow, C.dressWhite, 0.50), range: 4.8, int: 0.92 });
    ctx.points.push({ p: girlWorld(-0.55, 1.05, 0.85), col: mixc(C.rim, C.horizon, 0.30), range: 3.2, int: 0.50 });
    ctx.points.push({ p: girlWorld(0.02, 1.14, 0.72), col: mixc(C.sunGlow, C.bloomPink, 0.30), range: 2.2, int: 0.42 });
    ctx.points.push({ p: girlWorld(-0.10, 0.42, 0.72), col: mixc(C.groundAmb, C.stonePale, 0.35), range: 2.6, int: 0.55 });
  }
}
