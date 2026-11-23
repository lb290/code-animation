// Fish lantern: a plump veil-tailed goldfish lantern.
//
// Everything is one mesh: a lofted paper body, six sculpted fin sheets, bead
// eyes with gold rims and a lip ring. Each vertex carries surface coordinates
// (part, u, v) and a tint block, so the lantern shader can grow stained-paper
// panels, kikkou scales, bamboo ribs and radiating fin veins procedurally
// instead of baking them into textures.
//
//   part 0  body paper        u = along body (0 peduncle .. 1 snout)
//                             v = around body (0 top .. 0.25 right side .. 0.5 belly)
//                             tint.y = belly weight (0 back .. 1 belly)
//   part 1  fin membrane      u = root .. rim
//                             v = across the fin
//                             tint = [ finId, warm/cool mix, hue seed ]
//   part 2  eye bead          tint = [ eyeId, 0, 0 ]
//   part 3  eye gold rim
//   part 4  lip ring
//   part 5  mouth cavity (dark)
//
// Body geometry occupies z in [-0.34, 0.62]; the caudal veil trails to z ~ -1.1.
import { TAU, lerp, clamp, norm, sub, cross, smoothstep as smoothstep01 } from './math.js';

export const FISH_STRIDE = 12; // pos(3) normal(3) param(3) tint(3)

class FB {
  constructor() {
    this.v = [];
    this.i = [];
    this.n = 0;
  }
  vert(p, n, param, tint) {
    this.v.push(p[0], p[1], p[2], n[0], n[1], n[2], param[0], param[1], param[2], tint[0], tint[1], tint[2]);
    return this.n++;
  }
}

// Build a parametric sheet: fn(u, v) -> [x, y, z]. Normals are analytic-ish
// (central differences) and oriented by refFn when given.
function sheet(fb, o) {
  const { nu, nv, fn, part, wrapV = false, tintFn, refFn } = o;
  const cols = nv + (wrapV ? 0 : 1);
  const P = [];
  for (let i = 0; i <= nu; i++) {
    const u = i / nu;
    const row = [];
    for (let j = 0; j < cols; j++) row.push(fn(u, j / cols));
    P.push(row);
  }
  const at = (i, j) => {
    const ii = clamp(i, 0, nu);
    const jj = wrapV ? ((j % cols) + cols) % cols : clamp(j, 0, cols - 1);
    return P[ii][jj];
  };
  const nrm = (i, j) => {
    const du = sub(at(i + 1, j), at(i - 1, j));
    const dv = sub(at(i, j + 1), at(i, j - 1));
    let n = cross(dv, du);
    const l = Math.hypot(n[0], n[1], n[2]);
    n = l > 1e-9 ? [n[0] / l, n[1] / l, n[2] / l] : [0, 1, 0];
    if (refFn) {
      const jj = wrapV ? ((j % cols) + cols) % cols : clamp(j, 0, cols - 1);
      // orient against the reference normal at this very vertex: a single global
      // reference flips the belly half and leaves a crease at the lateral line
      const rn = refFn(i / Math.max(1, nu), jj / cols);
      if (n[0] * rn[0] + n[1] * rn[1] + n[2] * rn[2] < -0.02) n = [-n[0], -n[1], -n[2]];
    }
    return n;
  };
  const tint = tintFn || (() => [0, 0, 0]);
  const idx = [];
  for (let i = 0; i <= nu; i++) {
    const row = [];
    for (let j = 0; j < cols; j++) row.push(-1);
    idx.push(row);
  }
  const vi = (i, j) => {
    const jj = ((j % cols) + cols) % cols;
    if (idx[i][jj] < 0) {
      const u = i / nu, v = jj / cols;
      idx[i][jj] = fb.vert(P[i][jj], nrm(i, jj), [part, u, v], tint(u, v));
    }
    return idx[i][jj];
  };
  const jmax = wrapV ? cols : cols - 1;
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < jmax; j++) {
      const a = vi(i, j), b = vi(i, j + 1), c = vi(i + 1, j + 1), d = vi(i + 1, j);
      fb.i.push(a, b, c, a, c, d);
    }
  }
}

// ---------------------------------------------------------------- body profile
// [s, halfWidth, halfHeight, yOffset] — a deep, plump goldfish body.
const PROFILE = [
  [0.000, 0.040, 0.050, -0.006],
  [0.050, 0.068, 0.088, -0.010],
  [0.120, 0.101, 0.138, -0.016],
  [0.200, 0.133, 0.190, -0.020],
  [0.300, 0.160, 0.236, -0.022],
  [0.400, 0.177, 0.265, -0.020],
  [0.500, 0.185, 0.275, -0.013],
  [0.580, 0.184, 0.271, -0.005],
  [0.660, 0.175, 0.252, 0.005],
  [0.740, 0.158, 0.221, 0.013],
  [0.810, 0.137, 0.183, 0.019],
  [0.870, 0.118, 0.151, 0.022],
  [0.925, 0.095, 0.121, 0.018],
  [0.965, 0.056, 0.073, 0.010],
  [0.988, 0.034, 0.045, 0.002],
  [1.000, 0.020, 0.026, -0.008],
];

function profile(s) {
  const t = clamp(s, 0, 1);
  let k = 0;
  while (k < PROFILE.length - 2 && PROFILE[k + 1][0] < t) k++;
  const a = PROFILE[k], b = PROFILE[k + 1];
  const u = (t - a[0]) / Math.max(1e-6, b[0] - a[0]);
  const e = u * u * (3 - 2 * u); // smooth between keys
  return [lerp(a[1], b[1], e), lerp(a[2], b[2], e), lerp(a[3], b[3], e)];
}

// Cross-section point: a = 0 top, 0.25 +X, 0.5 belly, 0.75 -X.
function bodyPt(s, a) {
  const [w, h, yo] = profile(s);
  const phi = a * TAU;
  const cy = Math.cos(phi), sx = Math.sin(phi);
  const e = 0.82; // a little boxy — paper stretched over a bamboo frame
  const px = w * Math.sign(sx) * Math.pow(Math.abs(sx), e);
  const baseY = h * Math.sign(cy) * Math.pow(Math.abs(cy), e);
  // flatter back, fuller belly
  let py = yo + baseY * (cy > 0 ? 0.90 : 1.06);
  // the belly sags between the gill and the vent
  const sag = clamp((s - 0.24) / 0.62, 0, 1);
  py -= cy < 0 ? 0.052 * Math.pow(-cy, 1.6) * Math.sin(Math.PI * sag) : 0;
  // operculum bump behind the eye
  const gill = Math.exp(-Math.pow((s - 0.795) / 0.045, 2));
  const gg = 1 + 0.035 * gill * (0.5 + 0.5 * Math.abs(sx));
  return [px * gg, py, -0.34 + s * 0.96];
}

function bodyRef(u, a) {
  const phi = a * TAU;
  return [Math.sin(phi), Math.cos(phi) * 0.9, 0];
}

// ---------------------------------------------------------------- fins
// level-of-detail multiplier, set by buildFish() before any sheet is built
let LODQ = 1;
const n = (x, m) => Math.max(m, Math.round(x * LODQ));

// A leaf-shaped sheet: root point r, length axis A, width axis B, plane normal N.
function leaf(fb, o) {
  const { r, A, B, N, len, wide, nu, nv, finId, curl, refBias } = o;
  const fn = (u, v) => {
    const t = (v - 0.5) * 2; // -1 .. 1 across the fin
    const L = len * (0.30 + 0.70 * Math.sin(Math.PI * Math.pow(v, 0.72)) * (1 - 0.35 * t * t));
    const w = wide * (0.35 + 0.65 * u * u) * (1 - 0.55 * t * t);
    const wave = Math.sin(u * 5.0 + v * 6.0 + finId * 1.7) * curl * u * u;
    return [
      r[0] + A[0] * u * L + B[0] * t * w + N[0] * wave,
      r[1] + A[1] * u * L + B[1] * t * w + N[1] * wave,
      r[2] + A[2] * u * L + B[2] * t * w + N[2] * wave,
    ];
  };
  sheet(fb, {
    nu, nv, fn, part: 1,
    tintFn: (u, v) => [finId, clamp(v * 0.9 + 0.05, 0, 1), finId * 0.37],
    refFn: refBias,
  });
}

// Veil tail: a big ruffled fan trailing off the caudal peduncle.
function caudalFin(fb) {
  const fn = (u, v) => {
    const th = (v - 0.5) * 1.92;
    const st = Math.sin(th), ct = Math.cos(th);
    // two long lobes with a soft fork between them
    const lobe = 0.66 + 0.34 * Math.pow(Math.abs(Math.sin(th * 1.18)), 1.4);
    // ruffled hem, plus a slow wavy outline so the edge is never a clean fan
    // the inner sheet stays smooth; only the hem ripples, like wet silk
    const hem = smoothstep01(0.30, 1.0, u);
    const ruff = 1 + (0.062 * Math.sin(v * Math.PI * 7.0 + 0.4)
                    + 0.036 * Math.sin(v * Math.PI * 17.0 + 1.7)
                    + 0.014 * Math.sin(v * Math.PI * 31.0)) * hem;
    const tip = 1 + 0.16 * Math.pow(Math.abs(Math.sin(th * 1.28)), 6.0);
    const L = 0.92 * lobe * ruff * tip;
    // lateral folds: the silk is gathered, not flat
    const fold = 0.090 * u * Math.sin(v * Math.PI * 3.0 + 0.55)
               + 0.035 * u * u * Math.sin(v * Math.PI * 7.0 + 1.9);
    // the two lobes twist apart in depth, so the veil is never one flat sheet
    const twist = 0.16 * u * u * Math.sin(th * 1.05);
    return [
      fold + twist,
      st * 0.062 + st * u * L - 0.16 * u * u * (0.72 + 0.28 * Math.sin(v * 5.0)),
      -0.285 - ct * u * L + 0.045 * u * u * Math.sin(v * 9.0 + 2.0),
    ];
  };
  sheet(fb, {
    nu: n(22, 8), nv: n(84, 24), fn, part: 1,
    tintFn: (u, v) => [0, clamp(Math.abs(v - 0.5) * 1.5 + 0.2, 0, 1), 0.13],
    refFn: (u, v) => [1, 0, 0],
  });
}

// Dorsal: a tall flowing sail on the spine.
function dorsalFin(fb) {
  const fn = (u, v) => {
    const sRoot = lerp(0.285, 0.715, v);
    const r = bodyPt(sRoot, 0.0);
    const h = (0.075 + 0.255 * Math.sin(Math.PI * Math.pow(v, 0.58)) * Math.pow(1.0 - 0.26 * v, 1.0))
            * (1.0 + 0.10 * Math.sin(v * Math.PI * 5.0 + 0.5));
    const fold = 0.055 * u * Math.sin(v * Math.PI * 2.6 + 0.9);
    return [
      r[0] + fold + 0.025 * u * u * Math.sin(v * 9.0),
      r[1] + u * h * 1.30 - 0.035 * u * u,
      r[2] - u * h * 0.55 + 0.045 * u * u * Math.sin(v * 6.4 + 1.2),
    ];
  };
  sheet(fb, {
    nu: n(14, 6), nv: n(40, 14), fn, part: 1,
    tintFn: (u, v) => [1, clamp(0.25 + v * 0.75, 0, 1), 0.51],
    refFn: (u, v) => [1, 0, 0],
  });
}

// Anal fin under the rear belly.
function analFin(fb) {
  const fn = (u, v) => {
    const sRoot = lerp(0.15, 0.36, v);
    const r = bodyPt(sRoot, 0.5);
    const h = 0.045 + 0.105 * Math.sin(Math.PI * Math.pow(v, 0.75));
    const wave = 0.04 * u * u * Math.sin(v * 9.0 + 2.1);
    return [r[0] + wave, r[1] - u * h * 1.05, r[2] - u * h * 0.72];
  };
  sheet(fb, {
    nu: n(10, 5), nv: n(28, 10), fn, part: 1,
    tintFn: (u, v) => [2, clamp(0.2 + v * 0.8, 0, 1), 0.9],
    refFn: (u, v) => [1, 0, 0],
  });
}

// Veil pectorals: long silk ribbons that trail back from the shoulders, the
// way the sleeve of a robe streams when the lantern swims. Narrow at the root,
// broad through the middle, tapering to a point, curling around their own axis.
function pectoralFin(fb, side) {
  const a = side > 0 ? 0.30 : 0.70;
  const r0 = bodyPt(0.60, a);
  const r = [r0[0] * 0.86, r0[1] * 0.92, r0[2] - 0.012];
  const A = norm([side * 0.44, -0.52, -0.68]); // hangs down and trails back
  let B = norm([side * 0.30, 0.14, -0.90]);
  const d = B[0] * A[0] + B[1] * A[1] + B[2] * A[2];
  B = norm([B[0] - A[0] * d, B[1] - A[1] * d, B[2] - A[2] * d]);
  const N = norm(cross(A, B));
  const fn = (u, v) => {
    const t = (v - 0.5) * 2;
    const L =
      0.68 *
      (0.48 + 0.52 * Math.sin(Math.PI * Math.pow(v, 0.78))) *
      (1 + 0.07 * Math.sin(v * Math.PI * 5.0 + side) * smoothstep01(0.35, 1.0, u));
    const w = 0.136 * (0.14 + 0.86 * Math.sin(Math.PI * Math.min(1, u * 1.08))) * (1 - 0.40 * t * t);
    // the ribbon curls around its own length axis as it trails away
    const tw = 0.85 * u + 0.30 * Math.sin(u * 2.4 + side);
    const curl = 0.22 * u * u;
    const wave = (0.05 * Math.sin(u * 7.0 + side * 1.7) + 0.035 * Math.sin(v * 6.0 + side)) * u;
    const bt = t * w, ct = Math.cos(tw), st = Math.sin(tw);
    return [
      r[0] + A[0] * u * L + B[0] * bt * ct + N[0] * (bt * st + curl * 0.55 + wave),
      r[1] + A[1] * u * L + B[1] * bt * ct + N[1] * (bt * st + curl * 0.55 + wave),
      r[2] + A[2] * u * L + B[2] * bt * ct + N[2] * (bt * st + curl * 0.55 + wave),
    ];
  };
  sheet(fb, {
    nu: n(18, 8), nv: n(32, 12), fn, part: 1,
    tintFn: (u, v) => [side > 0 ? 3 : 4, clamp(0.15 + v * 0.85, 0, 1), side > 0 ? 1.71 : 2.33],
    refFn: (u, v) => N,
  });
}

// Pelvics: small streamers under the chest.
function pelvicFin(fb, side) {
  const a = side > 0 ? 0.365 : 0.635;
  const r = bodyPt(0.47, a);
  const A = norm([side * 0.30, -0.86, -0.42]);
  let B = norm([side * 0.94, 0.12, 0.0]);
  const d = B[0] * A[0] + B[1] * A[1] + B[2] * A[2];
  B = norm([B[0] - A[0] * d, B[1] - A[1] * d, B[2] - A[2] * d]);
  const N = norm(cross(A, B));
  const fn = (u, v) => {
    const t = (v - 0.5) * 2;
    const L = 0.225 * (0.52 + 0.48 * Math.sin(Math.PI * Math.pow(v, 0.72)));
    const w = 0.042 * (0.34 + 0.66 * u) * (1 - 0.55 * t * t);
    const wave = 0.035 * u * u * Math.sin(v * 8.0 + side * 0.7);
    return [
      r[0] + A[0] * u * L + B[0] * t * w + N[0] * wave,
      r[1] + A[1] * u * L + B[1] * t * w + N[1] * wave,
      r[2] + A[2] * u * L + B[2] * t * w + N[2] * wave,
    ];
  };
  sheet(fb, {
    nu: n(9, 5), nv: n(26, 10), fn, part: 1,
    tintFn: (u, v) => [side > 0 ? 5 : 6, clamp(0.2 + v * 0.8, 0, 1), side > 0 ? 2.9 : 3.4],
    refFn: (u, v) => N,
  });
}

// A gold band that hugs the body cross-section (part 3 = gold trim material).
// Used for the two lacquered hoops that ring a festival lantern.
function goldBand(fb, s0, halfWidth) {
  sheet(fb, {
    nu: 2, nv: n(48, 16), part: 3, wrapV: true,
    fn: (u, v) => {
      const s = s0 + (u - 0.5) * halfWidth * 2;
      const b = bodyPt(s, v);
      const yo = profile(s)[2];
      const rx = b[0], ry = b[1] - yo;
      const rl = Math.hypot(rx, ry) || 1;
      const out = 0.0055;
      return [b[0] + (rx / rl) * out, b[1] + (ry / rl) * out, b[2]];
    },
    tintFn: () => [0, 0, 0],
    refFn: (u, v) => {
      const ph = v * TAU;
      return [Math.sin(ph), Math.cos(ph), 0];
    },
  });
}

// ---------------------------------------------------------------- eyes, lips
function bead(fb, c, r, part, tint, nu = 9, nv = 16) {
  sheet(fb, {
    nu, nv, part, wrapV: true,
    fn: (u, v) => {
      const th = u * Math.PI, ph = v * TAU;
      return [
        c[0] + r * Math.sin(th) * Math.cos(ph),
        c[1] + r * Math.cos(th),
        c[2] + r * Math.sin(th) * Math.sin(ph),
      ];
    },
    tintFn: () => tint,
    // true radial direction: with the old approximate reference a few rows near
    // the poles flipped and the black bead showed bright polygon cracks
    refFn: (u, v) => {
      const th = u * Math.PI, ph = v * TAU;
      return [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
    },
  });
}

// A ring in the plane whose normal is n (right-handed with t).
function ring(fb, c, n, R, tube, part, tint, nv = 26, nu = 7) {
  let t = norm(cross(n, Math.abs(n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]));
  const b = norm(cross(n, t));
  sheet(fb, {
    nu, nv, part, wrapV: true,
    fn: (u, v) => {
      const ph = v * TAU, th = u * TAU;
      const rr = R + tube * Math.cos(th);
      return [
        c[0] + t[0] * Math.cos(ph) * rr + b[0] * Math.sin(ph) * rr + n[0] * tube * Math.sin(th),
        c[1] + t[1] * Math.cos(ph) * rr + b[1] * Math.sin(ph) * rr + n[1] * tube * Math.sin(th),
        c[2] + t[2] * Math.cos(ph) * rr + b[2] * Math.sin(ph) * rr + n[2] * tube * Math.sin(th),
      ];
    },
    tintFn: () => tint,
    refFn: (u, v) => {
      const ph = v * TAU;
      return [t[0] * Math.cos(ph) + b[0] * Math.sin(ph), t[1] * Math.cos(ph) + b[1] * Math.sin(ph), t[2] * Math.cos(ph) + b[2] * Math.sin(ph)];
    },
  });
}

export function buildFish(seed = 3, lod = 'high') {
  LODQ = lod === 'tiny' ? 0.34 : lod === 'low' ? 0.5 : 1.0;
  const fb = new FB();
  // ---- body paper
  sheet(fb, {
    nu: n(60, 20), nv: n(48, 16), part: 0, wrapV: true,
    fn: (u, v) => bodyPt(u, v),
    tintFn: (u, v) => [0, clamp(0.5 - 0.5 * Math.cos(v * TAU) * 0.9, 0, 1), u],
    refFn: bodyRef,
  });

  // ---- close the body tube at both ends (otherwise the head reads as a hole)
  for (const cs of [0.0, 1.0]) {
    const ringN = 24;
    const c0 = bodyPt(cs, 0);
    const dot = [0, 0, cs > 0.5 ? 1 : -1];
    // a centre vertex plus a fan to the last ring
    const centre = sheet === null ? null : null;
    const cz = c0[2] + (cs > 0.5 ? 0.004 : -0.004);
    const midIdx = fb.vert([0, (bodyPt(cs, 0.0)[1] + bodyPt(cs, 0.5)[1]) * 0.5, cz], dot, [0, cs, 0], [0, 0.5, 0]);
    let prev = -1, first = -1;
    for (let i = 0; i <= ringN; i++) {
      const a = i / ringN;
      const p = bodyPt(cs, a);
      const idx = fb.vert([p[0], p[1], cz], dot, [0, cs, a], [0, clamp(0.5 - 0.5 * Math.cos(a * TAU), 0, 1), 0]);
      if (i === 0) first = idx;
      if (prev >= 0) fb.i.push(midIdx, prev, idx);
      prev = idx;
    }
  }

  // ---- eyes (bead just breaking the paper surface; the iris is painted on
  // the paper by the body shader)
  for (const side of [-1, 1]) {
    const a = side > 0 ? 0.225 : 0.775;
    const p = bodyPt(0.805, a);
    const rad = norm([Math.sin(a * TAU), Math.cos(a * TAU) * 0.8, 0.12]);
    const c = [p[0] - rad[0] * 0.032, p[1] - rad[1] * 0.032, p[2] - rad[2] * 0.032];
    bead(fb, c, 0.061, 2, [side > 0 ? 0 : 1, 0, 0], n(16, 8), n(28, 14));
  }

  // ---- gold hoops: one behind the eye, one at the peduncle
  goldBand(fb, 0.772, 0.0085);
  goldBand(fb, 0.212, 0.0065);

  // ---- lips
  const mouthC = [0, -0.010, 0.612];
  ring(fb, mouthC, [0, 0, 1], 0.0165, 0.0058, 4, [0, 0, 0], 20, 6);
  // dark cavity cup
  sheet(fb, {
    nu: 6, nv: 18, part: 5, wrapV: true,
    fn: (u, v) => {
      const ph = v * TAU, rr = 0.026 * (1 - u * 0.9);
      return [Math.cos(ph) * rr, -0.012 + Math.sin(ph) * rr * 0.85, 0.596 - u * 0.055];
    },
    tintFn: () => [0, 0, 0],
    refFn: (u, v) => [0, 0, 1],
  });

  // ---- fins
  caudalFin(fb);
  dorsalFin(fb);
  analFin(fb);
  for (const side of [-1, 1]) {
    pectoralFin(fb, side);
    pelvicFin(fb, side);
  }

  // Split the triangle list: paper body (part 0 and the eyes/lips) versus the
  // translucent fin sheets, which are drawn by a second, additive program.
  const verts = new Float32Array(fb.v);
  const bodyIdx = [];
  const finIdx = [];
  for (let t = 0; t < fb.i.length; t += 3) {
    const part = verts[fb.i[t] * FISH_STRIDE + 6];
    (part > 0.5 && part < 1.5 ? finIdx : bodyIdx).push(fb.i[t], fb.i[t + 1], fb.i[t + 2]);
  }
  return {
    verts,
    indices: new Uint32Array(fb.i),
    bodyIndices: new Uint32Array(bodyIdx),
    finIndices: new Uint32Array(finIdx),
    tris: fb.i.length / 3,
    bodyTris: bodyIdx.length / 3,
    finTris: finIdx.length / 3,
    vertCount: fb.n,
    lod,
  };
}
