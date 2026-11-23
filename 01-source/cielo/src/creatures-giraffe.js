// creatures-giraffe.js — detailed giraffes strolling the central boulevard.
// Contract: export function buildGiraffes(b, ctx, rng)
//
// Two giraffes (x = -3.20 / +2.85) pace up and down the middle of the grand
// boulevard; z = 30 - 52*cos(phi) keeps them inside the requested -22..82 band.
// Every animated part is its own 'model' actor; both animals share one geometry
// per part kind (left/right legs reuse one mesh) so the cost stays small.
//
// AUTHORING FRAME: giraffe-local space, origin on the ground between the hooves,
// +Z forward, +Y up.  Each part mesh is built directly in its own hinge frame
// (legs around the hip, neck around the neck base, head around the neck top,
// tail around the tail root), so the actor matrix is simply
//   world = T(worldPos) * R(yaw,scale,...) * T(joint) * R(swing)   for limbs
// and the body uses the root matrix unchanged.
// All animation is a pure function of t (main.js calls model() twice per frame:
// once for the sun shadow map, once for the colour pass).
import { B, mulc, mixc, box } from './geo.js';
import { MT, ellipsoid } from './lib3d.js';
import { mesh } from './gl.js';
import { trs } from './actor.js';
import { m4, TAU, add, sub, cross, dot, scale as vs, norm, mulberry32, noise2, clamp, lerp, smoothstep } from './math.js';
import { C } from './palette.js';

// ---------------------------------------------------------------- coat colours
const HIDE = mixc(mixc(C.giraffe, C.stonePale, 0.56), C.bloomPink, 0.06);  // pale rose-tan
const SPOT = mixc(mixc(C.giraffeSpot, C.stonePale, 0.22), C.bloomPink, 0.06);  // muted rose-brown
const CREAM = C.giraffeCream;
const GAPCOL = mixc(C.giraffeCream, HIDE, 0.22);         // pale seam between patches
const SOCK = mixc(C.giraffeCream, [1, 1, 1], 0.62);      // white lower-leg socks
const OCHRE = mixc(C.giraffeSpot, C.stonePale, 0.16);
const DARKCOL = mulc(OCHRE, 0.45);                       // mane / tail tuft
const HOOFCOL = mulc(mixc(C.giraffeSpot, C.stonePale, 0.10), 0.34);   // hooves
const LIPCOL = mixc(C.giraffeSpot, C.giraffeCream, 0.46);
const NOSECOL = mulc(OCHRE, 0.55);
const HMAT = MT.cloth;                                   // hide: matte, no hot specular
const EYECOL = [0.020, 0.013, 0.010];
const HILITE = [0.92, 0.94, 0.98];

// ---------------------------------------------------------------- rig anchors (giraffe space)
export const RIG = {
  height: 8.20,
  neckPivot: [0, 4.30, 0.72],
  headPivot: [0, 7.80, 1.44],
  hipFront: [0.330, 3.62, 0.80],
  hipHind: [0.345, 3.40, -1.02],
  tailPivot: [0, 4.02, -1.40],
  headTilt: 0.17,
};

const SEG_BODY = 56, SEG_HEAD = 32, SEG_NECK = 30, SEG_LEG = 16;

// ---------------------------------------------------------------- tiny helpers
function addVert(b, p, n, c, mat) {
  return b.vert(b.tp(p), b.tn(n), c, mat);
}

// Smooth-shaded lofted surface.  rings: [{ c:[x,y,z], pts:[...S+1] }]
// Normals come from finite differences across the ring grid and are flipped to
// face away from the ring centre, so no winding assumptions are needed.
function loftSurface(b, rings, mat, opts = {}) {
  const R = rings.length, S = rings[0].pts.length - 1;
  const colFn = opts.colFn;
  const cols = [], nrms = [];
  for (let i = 0; i < R; i++) {
    const crow = [], nrow = [];
    const i0 = i > 0 ? i - 1 : i, i1 = i < R - 1 ? i + 1 : i;
    for (let j = 0; j <= S; j++) {
      const p = rings[i].pts[j];
      crow.push(colFn(i, j, p));
      const jm = j === 0 ? S - 1 : j - 1, jp = j === S ? 1 : j + 1;
      const du = sub(rings[i1].pts[j], rings[i0].pts[j]);
      const dv = sub(rings[i].pts[jp], rings[i].pts[jm]);
      let n = cross(dv, du);
      if (dot(n, sub(p, rings[i].c)) < 0) n = vs(n, -1);
      const L = Math.hypot(n[0], n[1], n[2]);
      nrow.push(L > 1e-9 ? [n[0] / L, n[1] / L, n[2] / L] : [0, 1, 0]);
    }
    cols.push(crow); nrms.push(nrow);
  }
  for (let i = 0; i < R - 1; i++) {
    for (let j = 0; j < S; j++) {
      const p00 = rings[i].pts[j], p10 = rings[i].pts[j + 1];
      const p01 = rings[i + 1].pts[j], p11 = rings[i + 1].pts[j + 1];
      const a = addVert(b, p00, nrms[i][j], cols[i][j], mat);
      const bb = addVert(b, p10, nrms[i][j + 1], cols[i][j + 1], mat);
      const cc = addVert(b, p11, nrms[i + 1][j + 1], cols[i + 1][j + 1], mat);
      const dd = addVert(b, p01, nrms[i + 1][j], cols[i + 1][j], mat);
      b.i.push(a, bb, cc, a, cc, dd);
    }
  }
  const cap = (i, dir) => {
    const c = rings[i].c;
    const N = vs(dir, 1);
    for (let j = 0; j < S; j++) {
      const a = addVert(b, rings[i].pts[j], N, cols[i][j], mat);
      const bb = addVert(b, rings[i].pts[j + 1], N, cols[i][j + 1], mat);
      const cc = addVert(b, c, N, cols[i][0], mat);
      b.i.push(a, bb, cc);
    }
  };
  if (opts.cap0) cap(0, opts.cap0);
  if (opts.cap1) cap(R - 1, opts.cap1);
}

// ring in the XY plane with independent upper / lower radius (barrel bodies)
function barrelRing(along, cy, hTop, hBot, rx, S, shape = 1) {
  const pts = [];
  for (let j = 0; j <= S; j++) {
    const a = (j / S) * TAU, cs = Math.cos(a), sn = Math.sin(a);
    const ex = Math.sign(cs) * Math.pow(Math.abs(cs), shape);
    const ey = Math.sign(sn) * Math.pow(Math.abs(sn), shape);
    const ry = sn >= 0 ? hTop : hBot;
    pts.push([ex * rx, cy + ey * ry, along]);
  }
  return { c: [0, cy, along], pts };
}

// ring perpendicular to a path frame
function tubeRing(centre, u, v, rx, ry, S) {
  const pts = [];
  for (let j = 0; j <= S; j++) {
    const a = (j / S) * TAU;
    const cs = Math.cos(a), sn = Math.sin(a);
    pts.push([
      centre[0] + u[0] * cs * rx + v[0] * sn * ry,
      centre[1] + u[1] * cs * rx + v[1] * sn * ry,
      centre[2] + u[2] * cs * rx + v[2] * sn * ry,
    ]);
  }
  return { c: centre, pts };
}

// parallel-transport frames along a polyline (u = local X, v = tangent x u)
function pathFrames(pts) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], c2 = pts[Math.min(n - 1, i + 1)];
    const t = norm(sub(c2, a));
    let u = [1, 0, 0];
    u = norm(sub(u, vs(t, dot(u, t))));
    if (Math.hypot(u[0], u[1], u[2]) < 0.2) u = [0, 0, 1];
    const v = norm(cross(t, u));
    out.push({ p: pts[i], t, u, v });
  }
  return out;
}

// Catmull-Rom resample of a control polyline (the control points stay authored)
function resample(pts, count) {
  const out = [];
  const n = pts.length - 1;
  for (let i = 0; i < count; i++) {
    const f = (i / (count - 1)) * n;
    const k = Math.min(n - 1, Math.floor(f));
    const t = f - k;
    const p0 = pts[Math.max(0, k - 1)], p1 = pts[k], p2 = pts[k + 1], p3 = pts[Math.min(n, k + 2)];
    const o = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
      o[c] = 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t +
        (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t * t +
        (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t * t * t);
    }
    out.push(o);
  }
  return out;
}

// ---------------------------------------------------------------- patch field
// Voronoi patches: seeds scattered just outside the surface; each cell is one
// rose-brown patch and neighbouring cells are separated by a pale seam.
function makeSpots(rng, n, sampler) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(sampler(rng));
  return out;
}

function nearest2(field, p) {
  let d1 = 1e9, d2 = 1e9, i1 = 0;
  for (let i = 0; i < field.length; i++) {
    const f = field[i];
    const dx = p[0] - f[0], dy = p[1] - f[1], dz = p[2] - f[2];
    const d = dx * dx + dy * dy + dz * dz;
    if (d < d1) { d2 = d1; d1 = d; i1 = i; }
    else if (d < d2) d2 = d;
  }
  return [Math.sqrt(d1), Math.sqrt(d2), i1];
}

function patchCol(field, p, gap) {
  const [d1, d2, i1] = nearest2(field, p);
  const t = smoothstep(0, gap, d2 - d1);
  const tone = 0.82 + 0.34 * (field[i1][3] ?? 0.5);
  return mixc(GAPCOL, mulc(SPOT, tone), t);
}

// ---------------------------------------------------------------- body
// [z, cy, hTop, hBot, rx, shape]
const BODY = [
  [-1.48, 3.52, 0.24, 0.20, 0.14, 1.00],
  [-1.40, 3.56, 0.42, 0.32, 0.32, 0.93],
  [-1.26, 3.60, 0.60, 0.42, 0.45, 0.90],
  [-1.08, 3.63, 0.72, 0.530, 0.545, 0.87],
  [-0.84, 3.65, 0.775, 0.588, 0.602, 0.86],
  [-0.56, 3.67, 0.790, 0.612, 0.626, 0.85],
  [-0.26, 3.69, 0.785, 0.624, 0.640, 0.85],
  [0.04, 3.71, 0.795, 0.628, 0.641, 0.85],
  [0.32, 3.73, 0.855, 0.622, 0.630, 0.85],
  [0.56, 3.75, 0.940, 0.608, 0.610, 0.86],
  [0.76, 3.77, 1.020, 0.588, 0.582, 0.88],
  [0.94, 3.79, 0.990, 0.552, 0.533, 0.90],
  [1.10, 3.81, 0.830, 0.500, 0.458, 0.92],
  [1.22, 3.83, 0.610, 0.430, 0.358, 0.96],
  [1.32, 3.85, 0.350, 0.285, 0.200, 1.00],
];

function bodyAt(z) {
  const Z = clamp(z, BODY[0][0], BODY[BODY.length - 1][0]);
  for (let i = 0; i < BODY.length - 1; i++) {
    const a = BODY[i], c = BODY[i + 1];
    if (Z >= a[0] && Z <= c[0]) {
      const t = (Z - a[0]) / Math.max(1e-6, c[0] - a[0]);
      return {
        cy: lerp(a[1], c[1], t), hTop: lerp(a[2], c[2], t),
        hBot: lerp(a[3], c[3], t), rx: lerp(a[4], c[4], t),
        shape: lerp(a[5], c[5], t),
      };
    }
  }
  const l = BODY[BODY.length - 1];
  return { cy: l[1], hTop: l[2], hBot: l[3], rx: l[4], shape: l[5] };
}

// evenly resample the authored body profile so the coat pattern has a finer grid
function bodyRingInfos(count) {
  const out = [];
  const z0 = BODY[0][0], z1 = BODY[BODY.length - 1][0];
  for (let i = 0; i < count; i++) {
    const z = lerp(z0, z1, i / (count - 1));
    const q = bodyAt(z);
    out.push({ z, cy: q.cy, hTop: q.hTop, hBot: q.hBot, rx: q.rx, shape: q.shape });
  }
  return out;
}

// linear resample of [x,y,z,r] limb paths
function lerpPath(path, count) {
  const out = [];
  const n = path.length - 1;
  for (let i = 0; i < count; i++) {
    const f = (i / (count - 1)) * n;
    const k = Math.min(n - 1, Math.floor(f)), t = f - k;
    const a = path[k], c2 = path[k + 1];
    out.push([lerp(a[0], c2[0], t), lerp(a[1], c2[1], t), lerp(a[2], c2[2], t), lerp(a[3], c2[3], t)]);
  }
  return out;
}

function bodySpots(rng, n) {
  return makeSpots(rng, n, (r) => {
    const z = lerp(-1.46, 1.31, r());
    const a = r() * TAU;
    const q = bodyAt(z);
    const ry = Math.sin(a) >= 0 ? q.hTop : q.hBot;
    const k = 1.12;
    return [
      Math.cos(a) * q.rx * k + (r() - 0.5) * 0.05,
      q.cy + Math.sin(a) * ry * k + (r() - 0.5) * 0.05,
      z + (r() - 0.5) * 0.09,
      r(),
    ];
  });
}

function buildBody(b, spots) {
  const info = bodyRingInfos(30);
  const rings = info.map((q) => barrelRing(q.z, q.cy, q.hTop, q.hBot, q.rx, SEG_BODY, q.shape));
  const colFn = (i, j, p) => {
    const rr = info[Math.min(i, info.length - 1)];
    const bot = rr.cy - rr.hBot;
    const lat = Math.abs(p[0]) / Math.max(0.01, rr.rx);
    // cream underside: belly + inside of the thighs
    let cream = smoothstep(bot + 0.36, bot + 0.06, p[1]) * (1 - smoothstep(0.40, 0.92, lat));
    cream *= 0.80 + 0.20 * noise2(p[2] * 2.3 + 1.7, lat * 3.1);
    const pc = patchCol(spots, p, 0.068);
    if (cream > 0.58) return mulc(CREAM, 0.93 + 0.10 * noise2(p[0] * 3.7, p[2] * 2.9));
    return mixc(pc, mulc(CREAM, 0.97), cream);
  };
  loftSurface(b, rings, HMAT, { colFn, cap0: [0, 0, -1], cap1: [0, 0, 1] });
}

// ---------------------------------------------------------------- neck
// 8-segment S-curve control polyline: strong forward sweep at the throat,
// near-vertical middle, then forward again into the head.
const NECK_CTRL = [
  [0, 4.30, 0.72],
  [0, 4.74, 1.00],
  [0, 5.18, 1.14],
  [0, 5.62, 1.17],
  [0, 6.06, 1.13],
  [0, 6.50, 1.09],
  [0, 6.94, 1.12],
  [0, 7.38, 1.24],
  [0, 7.80, 1.44],
];
const NECK_R = [0.343, 0.306, 0.275, 0.250, 0.228, 0.210, 0.191, 0.173, 0.152];
const NECK_DEPTH = 1.18;   // front-back radius / side radius

function neckFrames() {
  const pts = resample(NECK_CTRL, 26);
  const fr = [];
  for (let i = 0; i < pts.length; i++) {
    const u = i / (pts.length - 1);
    const fi = u * (NECK_R.length - 1);
    const k = Math.min(NECK_R.length - 2, Math.floor(fi));
    fr.push({ p: pts[i], r: lerp(NECK_R[k], NECK_R[k + 1], fi - k) });
  }
  const nf = pathFrames(fr.map((f) => f.p));
  for (let i = 0; i < fr.length; i++) { fr[i].u = nf[i].u; fr[i].v = nf[i].v; fr[i].t = nf[i].t; }
  return fr;
}

function neckSpots(rng, n) {
  const fr = neckFrames();
  return makeSpots(rng, n, (r) => {
    const f = fr[Math.min(fr.length - 1, Math.floor(r() * fr.length))];
    const a = r() * TAU;
    const k = 1.18;
    return [
      f.p[0] + Math.cos(a) * f.r * 0.82 * k + (r() - 0.5) * 0.04,
      f.p[1] + Math.sin(a) * f.r * NECK_DEPTH * k * 0.75 + (r() - 0.5) * 0.09,
      f.p[2] + Math.sin(a) * f.r * NECK_DEPTH * k * 0.55 + (r() - 0.5) * 0.10,
      r(),
    ];
  });
}

function buildNeck(b, spots) {
  const fr = neckFrames();
  const piv = RIG.neckPivot;
  const rings = fr.map((f) => {
    const c = sub(f.p, piv);
    return tubeRing(c, f.u, f.v, f.r * 0.82, f.r * NECK_DEPTH, SEG_NECK);
  });
  const colFn = (i, j, p) => {
    const pw = add(p, piv);
    const pc = patchCol(spots, pw, 0.060);
    const f = fr[Math.min(fr.length - 1, i)];
    const front = dot(sub(pw, f.p), [0, 0, 1]);
    const throat = smoothstep(0.02, 0.22, front) * 0.40;
    return mixc(mulc(pc, 0.98), mulc(CREAM, 0.96), throat);
  };
  loftSurface(b, rings, HMAT, { colFn });

  // mane: one small backward-swept tuft per ring plus midpoints, so the ridge
  // reads as hair rather than a dinosaur crest
  const backs = fr.map((f, i) => {
    const back = dot(f.v, [0, 0, 1]) <= 0 ? vs(f.v, 1) : vs(f.v, -1);
    const base = sub(add(f.p, vs(back, f.r * 1.09)), piv);
    const up = f.t;
    const p0 = add(base, vs(up, -0.052));
    const p1 = add(base, vs(up, 0.052));
    const tip = add(add(base, vs(back, 0.062)), vs(up, 0.012));
    const mid = add(base, vs(back, 0.026));
    b.tri(p0, p1, tip, mulc(DARKCOL, 0.94), MT.matte);
    b.tri(p0, mid, tip, DARKCOL, MT.matte);
    b.tri(p1, tip, mid, mulc(DARKCOL, 1.10), MT.matte);
    return { base, back, up };
  });
  for (let i = 0; i < backs.length - 1; i++) {
    const A = backs[i], B2 = backs[i + 1];
    const base = [ (A.base[0] + B2.base[0]) * 0.5, (A.base[1] + B2.base[1]) * 0.5, (A.base[2] + B2.base[2]) * 0.5 ];
    const up = norm(add(A.up, B2.up));
    const back = norm(add(A.back, B2.back));
    const tip = add(add(base, vs(back, 0.050)), vs(up, 0.012));
    b.tri(add(base, vs(up, -0.038)), add(base, vs(up, 0.038)), tip, mulc(DARKCOL, 0.88), MT.matte);
  }
  // mane continues over the withers
  for (let i = 0; i < 4; i++) {
    const z = 1.14 - i * 0.10;
    const q = bodyAt(z);
    const base = sub([0, q.cy + q.hTop * 0.965, z], piv);
    b.tri(add(base, [0, 0.015, 0.075]), add(base, [0, 0.015, -0.075]), add(base, [0, 0.105, 0.0]), DARKCOL, MT.matte);
  }
}

// ---------------------------------------------------------------- head
// [z, cy, hTop, hBot, rx, shape] — pivot at the neck top, muzzle toward +Z
const HEAD = [
  [-0.19, 0.015, 0.075, 0.072, 0.076, 1.00],
  [-0.13, 0.035, 0.142, 0.122, 0.116, 0.97],
  [-0.05, 0.048, 0.198, 0.162, 0.156, 0.94],
  [0.05, 0.050, 0.228, 0.178, 0.176, 0.92],
  [0.14, 0.042, 0.226, 0.180, 0.172, 0.92],
  [0.23, 0.022, 0.212, 0.176, 0.158, 0.92],
  [0.31, -0.004, 0.190, 0.166, 0.140, 0.93],
  [0.39, -0.022, 0.168, 0.154, 0.126, 0.95],
  [0.47, -0.038, 0.150, 0.144, 0.116, 0.97],
  [0.54, -0.050, 0.136, 0.134, 0.108, 1.00],
  [0.59, -0.056, 0.114, 0.114, 0.094, 1.00],
  [0.625, -0.056, 0.070, 0.070, 0.058, 1.00],
];

function headSpots(rng, n) {
  return makeSpots(rng, n, (r) => {
    const z = lerp(-0.19, 0.56, r());
    const a = r() * TAU;
    return [Math.cos(a) * 0.20 + (r() - 0.5) * 0.03, 0.02 + Math.sin(a) * 0.24 + (r() - 0.5) * 0.03, z, r()];
  });
}

function buildHead(b, spots) {
  const rings = HEAD.map((h) => barrelRing(h[0], h[1], h[2], h[3], h[4], SEG_HEAD, h[5]));
  const colFn = (i, j, p) => {
    const pc = patchCol(spots, p, 0.030);
    const pale = smoothstep(0.32, 0.60, p[2]) * 0.50 + smoothstep(-0.05, -0.14, p[1]) * 0.28;
    return mixc(pc, mulc(CREAM, 1.00), clamp(pale, 0, 0.90));
  };
  loftSurface(b, rings, HMAT, { colFn, cap0: [0, 0, -1], cap1: [0, 0, 1] });

  // ---- muzzle: upper + lower lip mass, mouth crease, nostrils
  b.push(trs([0, -0.106, 0.556], 0, 1, -0.10, 0));
  ellipsoid(b, 0.068, 0.046, 0.062, 12, 8, LIPCOL, HMAT);
  b.pop();
  b.push(trs([0, -0.144, 0.534], 0, 1, 0.14, 0));
  ellipsoid(b, 0.054, 0.034, 0.046, 12, 8, mulc(LIPCOL, 0.93), HMAT);
  b.pop();
  b.quad([-0.056, -0.120, 0.612], [0.056, -0.120, 0.612], [0.050, -0.122, 0.564], [-0.050, -0.122, 0.564], mulc(DARKCOL, 0.62), MT.matte, [0, -1, 0.25]);
  for (const s of [-1, 1]) {
    b.push(trs([s * 0.052, -0.040, 0.520], s * 0.5, 1, 0.25, 0));
    ellipsoid(b, 0.028, 0.019, 0.032, 8, 6, NOSECOL, MT.polish);
    b.pop();
  }
  // ---- eyes: dark globe + amber iris + specular dot + lashes
  for (const s of [-1, 1]) {
    b.push(trs([s * 0.154, 0.048, 0.232], s * 0.22, 1, 0.05, 0));
    ellipsoid(b, 0.038, 0.040, 0.036, 12, 8, EYECOL, MT.gloss);
    const od = norm([s * 0.62, 0.18, 0.76]);
    b.push(trs([od[0] * 0.024, od[1] * 0.024, od[2] * 0.024], 0, 1, -0.12, 0));
    ellipsoid(b, 0.022, 0.021, 0.017, 10, 6, [0.130, 0.078, 0.032], MT.gloss);
    b.pop();
    b.push(trs([od[0] * 0.035 + s * 0.007, od[1] * 0.035 + 0.012, od[2] * 0.035], 0, 1, 0, 0));
    ellipsoid(b, 0.009, 0.009, 0.008, HILITE, 8, 5, MT.gloss);
    b.pop();
    for (let k = 0; k < 6; k++) {
      const a = -0.55 + (k / 5) * 2.6;
      const rx = Math.cos(a) * 0.042, rz = 0.020 + Math.abs(Math.sin(a)) * 0.024;
      const root = [s * (0.030 + rx * 0.55), 0.052 + Math.sin(a) * 0.030, rz];
      const tip = add(root, [s * 0.028, 0.046 + Math.sin(a) * 0.016, 0.026]);
      b.tri(add(root, [0, -0.010, -0.006]), add(root, [0, 0.008, 0.008]), tip, DARKCOL, MT.matte);
    }
    b.pop();
  }
  // ---- ears: leaf blades swept out / back / slightly up
  for (const s of [-1, 1]) {
    const yaw = s > 0 ? 0.85 : Math.PI - 0.85;
    b.push(trs([s * 0.128, 0.128, -0.050], yaw, 1, 0, 0.34));
    const E = [
      [0.00, 0.000, 0.062, 0.022],
      [0.05, 0.004, 0.090, 0.020],
      [0.11, 0.010, 0.098, 0.016],
      [0.17, 0.016, 0.078, 0.012],
      [0.22, 0.020, 0.034, 0.007],
      [0.25, 0.022, 0.008, 0.004],
    ];
    const ear = E.map((e) => tubeRing([e[0], e[1] * 0.5, 0], [0, 1, 0], [0, 0, 1], e[2], e[3], 10));
    loftSurface(b, ear, HMAT, {
      colFn: (i, j, p) => (p[2] > 0.002 ? mixc(HIDE, LIPCOL, 0.72) : mulc(HIDE, 0.98)),
      cap0: [-1, 0, 0], cap1: [1, 0, 0],
    });
    b.pop();
  }
  // ---- ossicones: hide-covered stalks with dark hairy knobs
  for (const s of [-1, 1]) {
    b.push(trs([s * 0.074, 0.196, -0.028], 0, 1, 0.13, 0));
    const st = [];
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      st.push(tubeRing([0, t * 0.150, -t * 0.022], [1, 0, 0], [0, 0, 1], 0.046 - t * 0.007, 0.046 - t * 0.007, 10));
    }
    loftSurface(b, st, HMAT, { colFn: () => mixc(SPOT, HIDE, 0.42), cap1: [0, 1, 0] });
    b.push(trs([0, 0.156, -0.024], 0, 1, 0, 0));
    ellipsoid(b, 0.056, 0.050, 0.054, 12, 8, mulc(OCHRE, 0.62), HMAT);
    b.pop();
    b.pop();
  }
}

// ---------------------------------------------------------------- legs
const LEG_FRONT = [
  [0, 0, 0.02, 0.282],
  [0.0, -0.55, 0.045, 0.254],
  [0.008, -1.10, 0.055, 0.200],
  [0.010, -1.60, 0.042, 0.160],
  [0.004, -2.04, 0.020, 0.123],
  [0.0, -2.64, 0.006, 0.105],
  [0.0, -3.16, 0.0, 0.097],
  [0.0, -3.44, 0.0, 0.089],
];
const LEG_HIND = [
  [0, 0, 0.02, 0.336],
  [-0.012, -0.52, -0.055, 0.296],
  [-0.020, -1.04, -0.098, 0.228],
  [-0.012, -1.50, -0.070, 0.172],
  [0.0, -1.92, 0.004, 0.127],
  [0.0, -2.52, 0.020, 0.108],
  [0.0, -3.02, 0.010, 0.100],
  [0.0, -3.30, 0.0, 0.091],
];

const HIP_Y_FRONT = RIG.hipFront[1];
const HIP_Y_HIND = RIG.hipHind[1];

function legSpots(rng, n, pivotY) {
  return makeSpots(rng, n, (r) => {
    const y = lerp(-pivotY + 0.1, -0.15, r());
    const a = r() * TAU;
    return [Math.cos(a) * 0.30, y, Math.sin(a) * 0.30, r()];
  });
}

function buildLeg(b, kind, spots) {
  const path = lerpPath(kind === 'front' ? LEG_FRONT : LEG_HIND, 22);
  const pivotY = kind === 'front' ? HIP_Y_FRONT : HIP_Y_HIND;
  const rings = path.map((q) => tubeRing([q[0], q[1], q[2]], [1, 0, 0], [0, 0, 1], q[3] * 0.92, q[3] * 1.06, SEG_LEG));
  const sockY = -pivotY + 1.15;   // white sock on the lowest ~1.15 m
  const colFn = (i, j, p) => {
    const pc = patchCol(spots, p, 0.046);
    const wob = noise2(p[1] * 3.1 + 4.2, p[0] * 5.0) * 0.16 - 0.08;
    const sock = smoothstep(sockY + 0.20, sockY - 0.12 + wob, p[1]);
    return mixc(pc, mulc(SOCK, 0.96 + 0.07 * noise2(p[1] * 6.1, p[2] * 4.3)), sock);
  };
  loftSurface(b, rings, HMAT, { colFn, cap0: [0, 1, 0], cap1: [0, -1, 0] });

  // cloven hoof: two horn toes with a visible split
  const footY = -pivotY;
  for (const s of [-1, 1]) {
    b.push(trs([s * 0.048, footY + 0.082, -0.006], s * 0.05, 1, 0.02, 0));
    box(b, 0.082, 0.170, 0.180, HOOFCOL, MT.polish, { topCol: mulc(HOOFCOL, 1.24), bottomCol: mulc(HOOFCOL, 0.80) });
    b.pop();
  }
  // pale horn band just above the hoof makes the two toes read at distance
  b.push(trs([0, footY + 0.186, -0.004], 0, 1, 0, 0));
  box(b, 0.185, 0.028, 0.175, mulc(SOCK, 0.86), MT.cloth);
  b.pop();
}

// ---------------------------------------------------------------- tail
const TAIL_PATH = [
  [0, 0.0, 0.0, 0.105],
  [0, -0.30, -0.130, 0.086],
  [0, -0.80, -0.190, 0.068],
  [0, -1.24, -0.170, 0.054],
  [0, -1.54, -0.100, 0.045],
];

function buildTail(b, rng) {
  const pts = TAIL_PATH.map((q) => [q[0], q[1], q[2]]);
  const fr = pathFrames(pts);
  const rings = TAIL_PATH.map((q, i) => tubeRing(fr[i].p, fr[i].u, fr[i].v, q[3], q[3], 8));
  loftSurface(b, rings, HMAT, {
    colFn: (i, j, p) => {
      const t = clamp(-p[1] / 1.5, 0, 1);
      return mulc(mixc(SPOT, HIDE, 0.55 + 0.35 * t), 0.92 + 0.14 * noise2(p[1] * 3.4, p[2] * 5.1));
    },
    cap0: [0, 1, 0],
  });
  // big dark hair tuft: a cluster of tapered strands that reads in silhouette
  const root = [0, -1.54, -0.100];
  b.push(trs([0, root[1] - 0.055, root[2]], 0, 1, 0, 0));
  ellipsoid(b, 0.072, 0.105, 0.072, 10, 7, mulc(OCHRE, 0.36), MT.cloth);
  b.pop();
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * TAU + rng() * 0.3;
    const spread = 0.085 + rng() * 0.060;
    const c = [Math.cos(a), 0, Math.sin(a)];
    const px = [Math.cos(a + 1.57) * 0.050, 0, Math.sin(a + 1.57) * 0.050];
    const base = [root[0] + c[0] * spread * 0.45, root[1], root[2] + c[2] * spread * 0.45];
    const p0 = add(base, px), p1 = sub(base, px);
    const len = 0.48 + rng() * 0.22;
    const tip = [root[0] + c[0] * spread, root[1] - len, root[2] + c[2] * spread];
    const cc = mulc(OCHRE, 0.30 + 0.16 * rng());
    b.tri(p0, p1, tip, cc, MT.matte);
    b.tri(p1, p0, tip, mulc(cc, 0.88), MT.matte);
  }
}

// ---------------------------------------------------------------- assembly
export const PART_KEYS = ['body', 'neck', 'head', 'legFront', 'legHind', 'tail'];

export function makeGiraffe(seed) {
  const rng = mulberry32((seed >>> 0) + 0x9e3779b9);
  const parts = {};

  parts.body = new B();
  parts.body.note('giraffe-body');
  buildBody(parts.body, bodySpots(rng, 58));

  parts.neck = new B();
  parts.neck.note('giraffe-neck');
  buildNeck(parts.neck, neckSpots(rng, 44));

  parts.head = new B();
  parts.head.note('giraffe-head');
  buildHead(parts.head, headSpots(rng, 28));

  parts.legFront = new B();
  parts.legFront.note('giraffe-legFront');
  buildLeg(parts.legFront, 'front', legSpots(rng, 26, HIP_Y_FRONT));

  parts.legHind = new B();
  parts.legHind.note('giraffe-legHind');
  buildLeg(parts.legHind, 'hind', legSpots(rng, 26, HIP_Y_HIND));

  parts.tail = new B();
  parts.tail.note('giraffe-tail');
  buildTail(parts.tail, rng);

  const tri = {};
  let tris = 0;
  for (const k of PART_KEYS) { tri[k] = parts[k].i.length / 3; tris += tri[k]; }
  return { parts, tri, tris, seed };
}

// ================================================================ animation
const Z_MID = 30, Z_AMP = 52;         // z = 30 - 52 cos(phi)  ->  [-22, 82]
const CYCLE = 232;                   // seconds for one down-and-back leg
const STRIDE = 2.80;                 // metres of travel per complete gait cycle
const SWING = 0.205;                 // hip swing amplitude (rad)

// total (unsigned) distance travelled from phi = 0; monotone in phi
function travel(phi) {
  const cyc = Math.floor(phi / TAU);
  const r = phi - cyc * TAU;
  const g = r <= Math.PI ? 1 - Math.cos(r) : 3 + Math.cos(r);
  return Z_AMP * (g + 4 * cyc);
}

function animState(t, spec) {
  const w = TAU / CYCLE;
  const phi = spec.phase0 + w * t;
  const z = Z_MID - Z_AMP * Math.cos(phi);
  const yaw = 0.5 * Math.PI * (1 - Math.tanh(3.2 * Math.sin(phi)));
  const walk = (TAU * travel(phi)) / STRIDE;
  const bob = 0.030 * Math.sin(2 * walk + 0.5);
  const roll = 0.015 * Math.sin(walk);
  const yawSway = 0.016 * Math.sin(walk + 1.25);
  const pitch = 0.010 * Math.sin(2 * walk + 1.9);
  return { phi, z, yaw: yaw + yawSway, walk, bob, roll, pitch };
}

export function buildGiraffes(b, ctx, rng) {
  const gl = ctx.gl;
  const specs = [
    { lane: -3.20, seed: 4101, scale: 1.00, phase0: 2.18, tag: 'W' },
    { lane: 2.85, seed: 5207, scale: 0.958, phase0: 1.63, tag: 'E' },
  ];
  for (const spec of specs) {
    const g = makeGiraffe(spec.seed);
    const m = {};
    for (const k of PART_KEYS) {
      const r = g.parts[k].build(gl);
      m[k] = mesh(gl, r.verts, r.indices);
    }
    mountGiraffe(ctx, spec, m);
  }
}

function mountGiraffe(ctx, spec, m) {
  const root = new Float32Array(16);
  const tmpA = new Float32Array(16);
  const tmpB = new Float32Array(16);
  let cacheT = NaN;
  const st = { phi: 0, z: 0, yaw: 0, walk: 0, bob: 0, roll: 0, pitch: 0 };

  // root matrix, cached on t (the renderer asks for it twice per frame)
  const frame = (t) => {
    if (t === cacheT) return st;
    cacheT = t;
    const a = animState(t, spec);
    st.phi = a.phi; st.z = a.z; st.yaw = a.yaw; st.walk = a.walk;
    st.bob = a.bob; st.roll = a.roll; st.pitch = a.pitch;
    root.set(trs([spec.lane, a.bob, a.z], a.yaw, spec.scale, a.pitch, a.roll));
    return st;
  };

  const neckAngles = (s) => {
    const pitch = 0.028 * Math.sin(s.walk + 2.1) + 0.016 * Math.sin(s.phi * 0.37 + 1.1);
    const roll = 0.018 * Math.sin(s.walk * 0.5 + 0.4);
    return [pitch, roll];
  };

  const actor = (name, meshObj, fn) => {
    const out = new Float32Array(16);
    ctx.dyn.push({
      name, kind: 'model', mesh: meshObj,
      model: (t) => { frame(t); fn(st, out); return out; },
    });
  };

  // body = root
  actor('giraffe-body-' + spec.tag, m.body, (s, out) => out.set(root));

  // neck hinges at the neck base
  actor('giraffe-neck-' + spec.tag, m.neck, (s, out) => {
    const [pitch, roll] = neckAngles(s);
    m4.mul(root, trs(RIG.neckPivot, 0, 1, pitch, roll), tmpA);
    out.set(tmpA);
  });

  // head hinges at the top of the neck
  actor('giraffe-head-' + spec.tag, m.head, (s, out) => {
    const [pitch, roll] = neckAngles(s);
    const inNeck = sub(RIG.headPivot, RIG.neckPivot);
    const nod = RIG.headTilt + 0.040 * Math.sin(s.walk + 2.7) + 0.028 * Math.sin(s.phi * 0.29 + 0.6);
    m4.mul(root, trs(RIG.neckPivot, 0, 1, pitch, roll), tmpA);
    m4.mul(tmpA, trs(inNeck, 0, 1, nod, 0), tmpB);
    out.set(tmpB);
  });

  // four legs, diagonal gait (FL+HR, FR+HL)
  const legs = [
    { key: 'legFront', at: RIG.hipFront, s: 1, ph: 0, name: 'FL' },
    { key: 'legFront', at: RIG.hipFront, s: -1, ph: Math.PI, name: 'FR' },
    { key: 'legHind', at: RIG.hipHind, s: 1, ph: Math.PI + 0.16, name: 'HL' },
    { key: 'legHind', at: RIG.hipHind, s: -1, ph: 0.16, name: 'HR' },
  ];
  for (const L of legs) {
    actor('giraffe-leg' + L.name + '-' + spec.tag, m[L.key], (s, out) => {
      const sw = SWING * Math.sin(s.walk + L.ph);
      const hip = [L.s * L.at[0], L.at[1], L.at[2]];
      const roll = L.s * 0.014 * Math.sin(s.walk * 0.5);
      m4.mul(root, trs(hip, L.s * 0.02, 1, sw, roll), tmpA);
      out.set(tmpA);
    });
  }

  // tail
  actor('giraffe-tail-' + spec.tag, m.tail, (s, out) => {
    const swish = 0.34 * Math.sin(s.phi * 1.31 + 0.7) + 0.13 * Math.sin(s.phi * 2.53);
    const lift = -0.10 + 0.14 * Math.sin(s.phi * 1.11 + 2.0);
    m4.mul(root, trs(RIG.tailPivot, 0, 1, lift, swish), tmpA);
    out.set(tmpA);
  });
}