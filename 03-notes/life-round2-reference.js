// LIFE — everything that makes the city breathe: flying koi, doves, giraffes,
// balloon clusters, falling petals, the airship, butterflies, hanging vines.
// OWNER: agent "life".
//
//   buildLife(b, ctx, rng) -> void
//
// Static pieces go into b; moving pieces are registered in ctx.dyn:
//   - koi: 3 schools of 9-14 fish, instanced (kind:'inst' + InstActor.fill),
//     swimming slow circles at 18-60 m altitude around the city; colours from
//     C.koiRed/C.koiGold/C.koiWhite/C.koiBlue.
//   - doves: 2 flocks of 18, instanced, orbiting the cathedral + glass palace.
//   - giraffes: 2 on the boulevard, walking slowly (kind:'model', 6-8 m tall,
//     pale rose-tan with darker blotches) — the reference has one in the street.
//   - balloon clusters tied to the terrace rail (static billboards shape 4) and a
//     few drifting free; a hot-air balloon and a small vintage biplane in the sky.
//   - confetti petals: ~500 slow-falling quad billboards near the terrace.
//   - ferris wheel is owned by landmark.js — do not build it.
import { C } from './palette.js';
import { MT, ellipsoid, tubePath } from './lib3d.js';
import { B, mixc, mulc, cylinder } from './geo.js';
import { mesh } from './gl.js';
import { trs } from './actor.js';
import { L } from './layout.js';
import { TAU, clamp, noise2, smoothstep } from './math.js';

// ---------------------------------------------------------------- helpers
const localMesh = (gl, fn) => {
  const nb = new B();
  fn(nb);
  const r = nb.build(gl);
  return mesh(gl, r.verts, r.indices);
};

// translate-only local frame
const at = (b, x, y, z, fn) => {
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
  fn();
  b.pop();
};

// translate + yaw + uniform scale local frame
const atRS = (b, x, y, z, yaw, s, fn) => {
  const c = Math.cos(yaw) * s, sn = Math.sin(yaw) * s;
  b.push([c, 0, -sn, 0, 0, s, 0, 0, sn, 0, c, 0, x, y, z, 1]);
  fn();
  b.pop();
};

const PETAL_COLS = [C.bloomPink, C.bloomYellow, C.bloomBlue, C.bloomWhite, C.ballMint, C.ballPink];
const BALLOON_COLS = [C.ballPink, C.ballCream, C.ballSky, C.ballLilac, C.ballMint, C.ballCoral];

// The terrace balustrade is a belvedere bow that projects 9 m over the boulevard
// (stage owns the marble itself). Same plan curve, so balloons tie to the rail
// and vines spill over the outer face instead of floating inside the deck.
const RAIL_EDGE = 93.0, RAIL_HALF = 34, RAIL_BOW = 9.0, RAIL_TOP = 31.25;
function railZ(x) {
  const ax = Math.abs(x);
  if (ax >= RAIL_HALF) return RAIL_EDGE;
  return RAIL_EDGE - RAIL_BOW * Math.pow(Math.cos((Math.PI * 0.5 * ax) / RAIL_HALF), 1.3);
}

// ================================================================ KOI
// Fish geometry is authored forward = +Z, nose at +Z, tail at -Z.
function koiBodyCol(back, belly, p, ry, z) {
  const up = clamp(0.5 + p[1] / (2 * ry), 0, 1);
  let c = mixc(belly, back, smoothstep(0.22, 0.70, up));
  const patch = noise2(z * 2.4 + 4.7, (p[0] * 2.2 + p[1]) * 3.0);
  c = mixc(c, belly, smoothstep(0.60, 0.85, patch) * 0.9);
  return c;
}

function koiGeom(nb, back, belly) {
  const seg = 8;
  const prof = [
    [-1.16, 0.03, 0.05], [-0.98, 0.10, 0.19], [-0.67, 0.17, 0.30],
    [-0.28, 0.23, 0.37], [0.14, 0.235, 0.38], [0.52, 0.185, 0.31],
    [0.82, 0.11, 0.19], [1.04, 0.025, 0.05],
  ];
  const slopeAt = (k, which) => {
    const a = prof[Math.max(0, k - 1)], c = prof[Math.min(prof.length - 1, k + 1)];
    const d = (c[0] - a[0]) || 1e-3;
    return (c[which] - a[which]) / d;
  };
  const rings = prof.map(([z, rx, ry], k) => {
    const row = [];
    const nx = rx, ny = ry;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * TAU;
      const p = [Math.cos(a) * nx, Math.sin(a) * ny, z];
      const n = [Math.cos(a) / Math.max(nx, 1e-3), Math.sin(a) / Math.max(ny, 1e-3), -slopeAt(k, 2)];
      const l = Math.hypot(n[0], n[1], n[2]) || 1;
      row.push({ p, n: [n[0] / l, n[1] / l, n[2] / l], ry, z });
    }
    return row;
  });
  const V = (p, n, c) => nb.vert(nb.tp(p), nb.tn(n), c, MT.cloth);
  for (let k = 0; k < prof.length - 1; k++) {
    for (let i = 0; i < seg; i++) {
      const a = rings[k][i], b2 = rings[k][i + 1], c = rings[k + 1][i + 1], d = rings[k + 1][i];
      const ca = koiBodyCol(back, belly, a.p, a.ry, a.z);
      const cb = koiBodyCol(back, belly, b2.p, b2.ry, b2.z);
      const cc = koiBodyCol(back, belly, c.p, c.ry, c.z);
      const cd = koiBodyCol(back, belly, d.p, d.ry, d.z);
      const ia = V(a.p, a.n, ca), ib = V(b2.p, b2.n, cb), ic = V(c.p, c.n, cc), id = V(d.p, d.n, cd);
      nb.i.push(ia, ib, ic, ia, ic, id);
    }
  }
  // dorsal fin, a vertical plate along the spine
  const ryAt = (z) => {
    for (let k = 0; k < prof.length - 1; k++) {
      const z0 = prof[k][0], z1 = prof[k + 1][0];
      if ((z >= z0 && z <= z1) || (z <= z0 && z >= z1)) {
        const t = (z - z0) / ((z1 - z0) || 1e-3);
        return prof[k][2] + (prof[k + 1][2] - prof[k][2]) * t;
      }
    }
    return 0.1;
  };
  const dcol = mulc(back, 0.94);
  for (const nx of [1, -1]) {
    const N = [nx, 0, 0];
    for (let i = 0; i < 4; i++) {
      const z0 = -0.66 + i * 0.28, z1 = z0 + 0.28;
      const b0 = ryAt(z0) * 0.88, b1 = ryAt(z1) * 0.88;
      const t0 = b0 + 0.15 - i * 0.025, t1 = b1 + 0.15 - (i + 1) * 0.025;
      nb.quad([0, b0, z0], [0, b0, z1], [0, t1, z1], [0, t0, z0], dcol, MT.cloth, N);
    }
  }
  // caudal (tail) fin: two lobes, notched
  const fcol = mulc(back, 1.05);
  for (const nx of [1, -1]) {
    const N = [nx, 0, 0];
    nb.quad([0, 0.09, -1.08], [0, 0.44, -1.50], [0, 0.30, -1.62], [0, 0.015, -1.30], fcol, MT.cloth, N);
    nb.quad([0, -0.09, -1.08], [0, -0.015, -1.30], [0, -0.30, -1.62], [0, -0.44, -1.52], fcol, MT.cloth, N);
  }
  // pectoral fins: little horizontal blades
  const pcol = mulc(back, 0.9);
  for (const s of [1, -1]) {
    const up = [0, 1, 0], dn = [0, -1, 0];
    nb.quad([s * 0.15, -0.04, 0.32], [s * 0.52, -0.14, 0.02], [s * 0.42, -0.14, -0.14], [s * 0.13, -0.04, 0.02], pcol, MT.cloth, up);
    nb.quad([s * 0.15, -0.04, 0.32], [s * 0.52, -0.14, 0.02], [s * 0.42, -0.14, -0.14], [s * 0.13, -0.04, 0.02], mulc(pcol, 0.82), MT.cloth, dn);
  }
  // eyes
  const eye = C.catBlack;
  for (const s of [1, -1]) {
    const x = s * 0.20, y = 0.03, z = 0.66;
    nb.quad([x, y - 0.05, z - 0.04], [x, y - 0.05, z + 0.04], [x, y + 0.05, z + 0.04], [x, y + 0.05, z - 0.04], eye, MT.gloss, [s, 0, 0]);
  }
}

// ================================================================ DOVE
// Authored forward = +Z, wings spread along X so the instanced sway term flaps
// the tips (it displaces along the normal, scaled by |x|).
function doveGeom(nb, body, shade) {
  // body
  ellipsoid(nb, 0.110, 0.125, 0.30, 6, 5, body, MT.cloth, {
    colFn: (v) => mixc(shade, body, smoothstep(0.30, 0.78, v)),
  });
  // head + neck
  at(nb, 0, 0.085, 0.29, () => ellipsoid(nb, 0.080, 0.086, 0.095, 5, 4, body, MT.cloth));
  // beak
  const be = C.brass;
  nb.tri([0, 0.095, 0.36], [0.040, 0.060, 0.36], [0, 0.050, 0.49], be, MT.matte);
  nb.tri([0, 0.095, 0.36], [0, 0.050, 0.49], [-0.040, 0.060, 0.36], be, MT.matte);
  // wings: swept three-panel wing, feathered tip, doubled so it reads from below
  for (const s of [1, -1]) {
    const P = (x, y, z) => [s * x, y, z];
    const rootF = P(0.05, 0.025, 0.15), rootB = P(0.05, 0.015, -0.10);
    const midF = P(0.26, 0.060, 0.17), midB = P(0.26, 0.035, -0.16);
    const outF = P(0.50, 0.085, 0.06), outB = P(0.50, 0.055, -0.20);
    const tipF = P(0.64, 0.088, -0.04), tipB = P(0.60, 0.070, -0.23);
    const wIn = body, wOut = mulc(body, 0.96), wTip = mulc(body, 0.92);
    for (const N of [[0, 1, 0], [0, -1, 0]]) {
      const dn = N[1] < 0;
      const cA = dn ? mulc(shade, 0.92) : wIn;
      const cB = dn ? mulc(shade, 0.88) : wOut;
      const cC = dn ? mulc(shade, 0.84) : wTip;
      nb.quad(rootF, midF, midB, rootB, cA, MT.cloth, N);
      nb.quad(midF, outF, outB, midB, cB, MT.cloth, N);
      nb.tri(outF, tipF, outB, cC, MT.cloth, N, N, N);
      nb.tri(tipF, tipB, outB, cC, MT.cloth, N, N, N);
    }
    // shoulder covert, a little darker so the wing root reads
    nb.quad(P(0.03, 0.045, 0.12), P(0.16, 0.062, 0.13), P(0.16, 0.050, -0.12), P(0.03, 0.035, -0.10), mulc(body, 0.90), MT.cloth, [0, 1, 0]);
  }
  // tail fan
  for (const s of [1, -1]) {
    for (const N of [[0, 1, 0], [0, -1, 0]]) {
      const c = N[1] < 0 ? mulc(shade, 0.94) : mulc(body, 0.97);
      nb.quad([0, 0.025, -0.27], [s * 0.14, 0.035, -0.43], [s * 0.11, 0.025, -0.58], [0, 0.015, -0.50], c, MT.cloth, N);
    }
  }
}

// ================================================================ GIRAFFE
function giraffeCols() {
  return {
    hide: mixc(mixc(C.giraffe, C.giraffeCream, 0.35), C.bloomPink, 0.26),
    spot: mixc(mixc(C.giraffeSpot, C.giraffe, 0.35), C.bloomPink, 0.24),
    cream: mixc(C.giraffeCream, C.dove, 0.22),
  };
}

function giraffeBodyGeom(nb) {
  const { hide, spot, cream } = giraffeCols();
  const blotch = (u, v) => {
    const n = noise2(Math.cos(u * TAU) * 3.4 + 0.7, Math.sin(u * TAU) * 3.4 + v * 5.2);
    return smoothstep(0.60, 0.73, n);
  };
  // barrel
  const HIDE_MAT = [0.09, 0.10];
  at(nb, 0, 4.35, -0.18, () => {
    ellipsoid(nb, 0.90, 1.00, 1.58, 9, 7, hide, HIDE_MAT, {
      colFn: (v, u) => {
        let c = mixc(hide, cream, smoothstep(0.55, 0.92, v) * 0.45);
        c = mixc(c, spot, blotch(u, v) * 0.8);
        return c;
      },
    });
  });
  // shoulder / chest mass
  at(nb, 0, 4.75, 1.05, () => {
    ellipsoid(nb, 0.68, 0.80, 0.70, 7, 5, hide, HIDE_MAT, {
      colFn: (v, u) => mixc(hide, spot, blotch(u, v) * 0.75),
    });
  });
  // neck: sweeps up and forward
  const neck = [];
  for (let i = 0; i <= 6; i++) {
    const u = i / 6;
    neck.push([0, 4.95 + u * 1.95, 1.05 + u * 0.72 - u * u * 0.16]);
  }
  tubePath(nb, neck, (u) => 0.42 - u * 0.19, 6, hide, HIDE_MAT, {
    caps: false,
    colFn: (t, a) => {
      const u = a;
      return mixc(hide, spot, blotch(u, t) * 0.45);
    },
  });
  // mane: dark strip down the back of the neck
  const mane = mulc(spot, 0.82);
  for (let i = 0; i < 6; i++) {
    const u0 = i / 6, u1 = (i + 1) / 6;
    const y0 = 4.95 + u0 * 1.95, z0 = 1.05 + u0 * 0.72 - u0 * u0 * 0.16;
    const y1 = 4.95 + u1 * 1.95, z1 = 1.05 + u1 * 0.72 - u1 * u1 * 0.16;
    const r0 = 0.42 - u0 * 0.19, r1 = 0.42 - u1 * 0.19;
    nb.quad([0, y0, z0 - r0], [0, y1, z1 - r1], [0, y1 + 0.02, z1 - r1 - 0.13], [0, y0 + 0.02, z0 - r0 - 0.13], mane, MT.cloth, [1, 0, 0]);
    nb.quad([0, y0, z0 - r0], [0, y1, z1 - r1], [0, y1 + 0.02, z1 - r1 - 0.13], [0, y0 + 0.02, z0 - r0 - 0.13], mulc(mane, 0.8), MT.cloth, [-1, 0, 0]);
  }
  // head + muzzle
  at(nb, 0, 6.95, 1.80, () => ellipsoid(nb, 0.27, 0.33, 0.46, 7, 5, hide, HIDE_MAT, {
    colFn: (v, u) => mixc(hide, spot, blotch(u, v) * 0.32),
  }));
  at(nb, 0, 6.74, 2.24, () => ellipsoid(nb, 0.18, 0.17, 0.26, 6, 4, cream, MT.cloth));
  // ears
  for (const s of [1, -1]) {
    nb.quad([s * 0.22, 7.05, 1.72], [s * 0.36, 7.16, 1.56], [s * 0.30, 7.25, 1.48], [s * 0.18, 7.12, 1.62], cream, MT.cloth, [0, 0.4, -1]);
  }
  // ossicones (little horn knobs)
  for (const s of [1, -1]) {
    at(nb, s * 0.12, 7.26, 1.78, () => {
      cylinder(nb, 5, 0.045, 0.05, 0.30, C.giraffeSpot, MT.cloth, { y0: 0 });
      at(nb, 0, 0.34, 0, () => ellipsoid(nb, 0.07, 0.07, 0.07, 5, 3, mulc(C.giraffeSpot, 0.9), MT.cloth));
    });
  }
  // eyes
  for (const s of [1, -1]) {
    nb.quad([s * 0.20, 7.00, 1.94], [s * 0.20, 6.97, 2.04], [s * 0.20, 7.04, 2.04], [s * 0.20, 7.05, 1.94], C.catBlack, MT.gloss, [s, 0, 0]);
  }
  // tail
  const tail = [[0, 4.72, -1.68], [0.02, 4.15, -1.80], [0.05, 3.55, -1.86], [0.06, 3.15, -1.86]];
  tubePath(nb, tail, (u) => 0.065 - u * 0.03, 4, cream, MT.cloth, { caps: false });
  at(nb, 0.06, 3.10, -1.86, () => ellipsoid(nb, 0.10, 0.16, 0.10, 5, 3, mane, MT.cloth));
}

// legs are a separate mesh so they can swing; pivot sits at the body centre.
function giraffeLegGeom(nb, diag) {
  const { hide, cream } = giraffeCols();
  const HIDE_MAT = [0.08, 0.10];
  const legs = diag ? [[0.46, 1.02], [-0.46, -1.06]] : [[-0.46, 1.02], [0.46, -1.06]];
  for (const [lx, lz] of legs) {
    at(nb, lx, 0, lz, () => {
      cylinder(nb, 5, 0.15, 0.26, 1.95, hide, HIDE_MAT, { y0: -1.95 });
    });
    at(nb, lx, 0, lz, () => {
      cylinder(nb, 5, 0.10, 0.15, 1.85, cream, [0.08, 0.08], { y0: -3.72 });
    });
    at(nb, lx, -3.72, lz, () => {
      nb.quad([-0.10, 0.10, -0.14], [0.10, 0.10, -0.14], [0.10, -0.06, 0.14], [-0.10, -0.06, 0.14], mulc(C.giraffeSpot, 0.8), MT.matte, [0, 1, 0]);
      nb.quad([-0.10, -0.06, 0.14], [0.10, -0.06, 0.14], [0.10, -0.12, 0.12], [-0.10, -0.12, 0.12], mulc(C.giraffeSpot, 0.6), MT.matte, [0, -1, 0]);
    });
  }
}

// ================================================================ BALLOON (small)
// Round pastel party balloon in unit space (radius 1, knot at -1.04). Built as
// real geometry rather than a sprite so it reads glossy and 3D up close.
function balloonGeom(nb, col, hi) {
  ellipsoid(nb, 1.0, 1.05, 1.0, 8, 6, col, MT.polish, {
    colFn: (v, u) => {
      const up = smoothstep(0.30, 0.95, v);
      let c = mixc(mulc(col, 0.86), hi, up * 0.8);
      const st = noise2(Math.cos(u * TAU) * 2.0 + 1.3, Math.sin(u * TAU) * 2.0 + v * 2.6);
      return mixc(c, mulc(hi, 1.04), smoothstep(0.62, 0.88, st) * 0.30);
    },
  });
  at(nb, 0, -1.03, 0, () => ellipsoid(nb, 0.16, 0.13, 0.16, 5, 3, mulc(col, 0.82), MT.polish));
}

// ================================================================ HOT-AIR BALLOON
function envelopeGeom(nb) {
  const prof = [
    [0.0, 2.2], [1.5, 4.4], [3.4, 6.3], [5.8, 7.6], [8.4, 8.2],
    [11.0, 8.1], [13.6, 7.2], [15.8, 5.6], [17.4, 3.6], [18.4, 1.2],
  ];
  const seg = 12;
  const stripes = [C.ballCream, C.ballCoral, C.ballCream, C.ballSky, C.ballCream, C.ballLilac];
  const ringNorm = (k, a) => {
    const a0 = prof[Math.max(0, k - 1)], a1 = prof[Math.min(prof.length - 1, k + 1)];
    const dr = a1[1] - a0[1], dy = a1[0] - a0[0];
    const l = Math.hypot(dy, dr) || 1;
    return [Math.cos(a) * dy / l, -dr / l, Math.sin(a) * dy / l];
  };
  for (let k = 0; k < prof.length - 1; k++) {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
      const [y0, r0] = prof[k], [y1, r1] = prof[k + 1];
      const p00 = [Math.cos(a0) * r0, y0, Math.sin(a0) * r0];
      const p10 = [Math.cos(a1) * r0, y0, Math.sin(a1) * r0];
      const p11 = [Math.cos(a1) * r1, y1, Math.sin(a1) * r1];
      const p01 = [Math.cos(a0) * r1, y1, Math.sin(a0) * r1];
      const cc = mulc(stripes[Math.floor(i / 2) % stripes.length], 0.94 + 0.10 * ((k % 3) / 2));
      const n00 = ringNorm(k, a0), n10 = ringNorm(k, a1), n11 = ringNorm(k + 1, a1), n01 = ringNorm(k + 1, a0);
      nb.tri(p00, p10, p11, cc, MT.cloth, n00, n10, n11);
      nb.tri(p00, p11, p01, cc, MT.cloth, n00, n11, n01);
    }
  }
  // basket
  at(nb, 0, -3.3, 0, () => {
    nb.quad([-1.15, 0.9, -1.15], [1.15, 0.9, -1.15], [1.15, 0.9, 1.15], [-1.15, 0.9, 1.15], C.bronze, MT.cloth, [0, 1, 0]);
  });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const top = [sx * 1.25, 0.0, sz * 1.25];
      tubePath(nb, [[sx * 1.0, -2.9, sz * 1.0], [sx * 1.15, -1.6, sz * 1.15], top], 0.045, 3, C.brass, MT.metal, { caps: false });
    }
  }
  return { bottom: -4.2, top: 18.6 };
}

// ================================================================ BIPLANE
function biplaneGeom(nb) {
  const body = C.dressWhite, red = C.trainRed, brass = C.brass;
  const prof = [
    [-3.4, 0.10, 0.12], [-2.6, 0.24, 0.26], [-1.2, 0.40, 0.38],
    [0.6, 0.44, 0.40], [1.9, 0.32, 0.32], [2.7, 0.16, 0.18],
  ];
  const seg = 6;
  for (let k = 0; k < prof.length - 1; k++) {
    const [z0, rx0, ry0] = prof[k], [z1, rx1, ry1] = prof[k + 1];
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
      const P = (a, z, rx, ry) => [Math.cos(a) * rx, Math.sin(a) * ry, z];
      const cc = k < 2 ? mulc(red, 0.9) : body;
      nb.quad(P(a0, z0, rx0, ry0), P(a1, z0, rx0, ry0), P(a1, z1, rx1, ry1), P(a0, z1, rx1, ry1), cc, MT.cloth);
    }
  }
  // wings
  at(nb, 0, 0.86, 0.35, () => nb.quad([-6, 0, -1.0], [6, 0, -1.0], [6, 0.06, 1.0], [-6, 0.06, 1.0], red, MT.cloth, [0, 1, 0]));
  at(nb, 0, 0.86, 0.35, () => nb.quad([-6, 0, -1.0], [6, 0, -1.0], [6, 0.06, 1.0], [-6, 0.06, 1.0], mulc(body, 0.9), MT.cloth, [0, -1, 0]));
  at(nb, 0, -0.52, 0.30, () => nb.quad([-5, 0, -0.9], [5, 0, -0.9], [5, 0.05, 0.9], [-5, 0.05, 0.9], red, MT.cloth, [0, 1, 0]));
  for (const s of [-1, 1]) {
    at(nb, s * 3.4, 0.2, 0.3, () => {
      nb.quad([-0.06, 0.0, -0.06], [0.06, 0.0, -0.06], [0.06, 1.3, -0.06], [-0.06, 1.3, -0.06], brass, MT.metal, [0, 0, -1]);
      nb.quad([-0.06, 0.0, 0.06], [0.06, 0.0, 0.06], [0.06, 1.3, 0.06], [-0.06, 1.3, 0.06], brass, MT.metal, [0, 0, 1]);
    });
  }
  // tailplane + fin
  at(nb, 0, 0.1, -2.9, () => nb.quad([-1.9, 0, -0.55], [1.9, 0, -0.55], [1.9, 0.04, 0.55], [-1.9, 0.04, 0.55], body, MT.cloth, [0, 1, 0]));
  at(nb, 0, 0.4, -3.0, () => nb.quad([0, 0, -0.4], [0, 1.05, -0.4], [0, 0.85, 0.5], [0, 0, 0.5], red, MT.cloth, [1, 0, 0]));
  // propeller: a flat X so it reads as a blur disc
  for (let i = 0; i < 2; i++) {
    const a = i * Math.PI / 2;
    const c = Math.cos(a) * 1.3, s = Math.sin(a) * 1.3;
    nb.quad([-c, -s, 2.85], [c, s, 2.85], [c, s, 2.78], [-c, -s, 2.78], mulc(C.stonePale, 0.9), MT.cloth, [0, 0, 1]);
  }
}

// ================================================================ static: vines
function buildVines(b, ctx, rng) {
  const n = 34;
  for (let i = 0; i < n; i++) {
    const x = -45 + (i / (n - 1)) * 90 + (rng() - 0.5) * 3.0;
    const z = railZ(x) - 0.55 + (rng() - 0.5) * 0.7;
    const topY = 30.9 + (rng() - 0.5) * 0.5;
    const len = 3.5 + rng() * 6.5;
    const sway = 0.5 + rng() * 1.4;
    const ph = rng() * TAU;
    const pts = [];
    for (let k = 0; k <= 6; k++) {
      const u = k / 6;
      pts.push([
        x + Math.sin(u * 3.0 + ph) * sway * u,
        topY - u * len,
        z + Math.cos(u * 2.3 + ph * 1.7) * sway * 0.55 * u,
      ]);
    }
    tubePath(b, pts, (u) => 0.11 - u * 0.055, 3, C.vine, MT.leaf, { caps: false });
    for (let k = 1; k <= 6; k++) {
      const p = pts[k];
      const lx = p[0] + (rng() - 0.5) * 1.0, ly = p[1] - rng() * 0.3, lz = p[2] + (rng() - 0.5) * 1.0;
      const s = 0.11 + rng() * 0.16;
      const lc = rng() < 0.5 ? C.leafLight : C.leaf;
      b.quad([lx - s, ly, lz - s * 0.6], [lx + s, ly, lz - s * 0.6], [lx + s * 0.7, ly + 0.07, lz + s], [lx - s, ly + 0.07, lz + s], lc, MT.leaf, [0, 1, 0]);
    }
    // a small leafy tuft spilling over the rail at the root of the strand
    if (i % 2 === 0) {
      for (let k = 0; k < 3; k++) {
        const s = 0.28 + rng() * 0.3;
        at(b, x + (rng() - 0.5) * 0.8, topY - 0.75 - rng() * 0.5, z - 0.35 - rng() * 0.4, () => {
          ellipsoid(b, s, s * 0.72, s, 6, 4, rng() < 0.5 ? C.leaf : C.leafLight, MT.leaf, {
            colFn: (v, u) => mixc(C.leafDark, C.leafLight, smoothstep(0.2, 0.95, v)),
          });
        });
      }
    }
  }
}

// ================================================================ static: terrace balloons
// Clusters are tied to the balustrade and lean out over the boulevard, like the
// reference's pastel bunch beside the girl. Real geometry: glossy low-poly spheres.
function buildBalloonClusters(b, ctx, rng) {
  // Four bunches tied to the rail and leaning out over the city, placed off the
  // camera axis so they frame the opening shot instead of blocking it.
  const clusters = [
    { ax: 11, bx: 11.5, by: 34.2, bz: 80.0, n: 6, spread: 1.4 },
    { ax: 17, bx: 15.5, by: 34.5, bz: 76.5, n: 5, spread: 1.2 },
    { ax: -4, bx: -4.5, by: 33.9, bz: 80.5, n: 5, spread: 1.3 },
    { ax: -10, bx: -9.5, by: 34.3, bz: 77.5, n: 4, spread: 1.1 },
  ];
  for (const cl of clusters) {
    const az = railZ(cl.ax) + 0.1;
    for (let i = 0; i < cl.n; i++) {
      const size = 0.36 + rng() * 0.28;   // radius: diameter 0.7-1.3 m
      const bx = cl.bx + (rng() - 0.5) * cl.spread * 1.6;
      const by = cl.by + (rng() - 0.5) * 1.3;
      const bz = cl.bz + (rng() - 0.5) * 1.4;
      const col = BALLOON_COLS[(rng() * BALLOON_COLS.length) | 0];
      atRS(b, bx, by, bz, rng() * TAU, size, () => balloonGeom(b, col, mixc(col, C.cloudLit, 0.55)));
      // string from the balloon neck back down to the rail
      const pts = [];
      for (let k = 0; k <= 4; k++) {
        const u = k / 4;
        const sag = Math.sin(u * Math.PI) * 0.3;
        pts.push([
          cl.ax + (bx - cl.ax) * u + Math.sin(u * 2.1 + i * 1.7) * 0.15 * u,
          RAIL_TOP + (by - size * 1.05 - RAIL_TOP) * u - sag,
          az + (bz - az) * u,
        ]);
      }
      tubePath(b, pts, 0.008, 3, C.dressWhite, MT.cloth, { caps: false });
    }
  }
}

// a few doves perched on the terrace edge
function buildPerchedDoves(b, ctx, rng) {
  const spots = [[-26, 1.2], [-13, 2.3], [19, 0.4], [31, 2.8], [7, -1.4]];
  for (const [x, yaw] of spots) {
    const s = 1.45 + rng() * 0.4;
    atRS(b, x, RAIL_TOP, railZ(x) + 0.1, yaw, s, () => doveGeom(b, C.dove, C.doveShade));
  }
}

// ================================================================ dynamic: koi
// Each school is a tight shoal: every fish sits a little behind / beside the
// shoal leader along one shared arc, so the group reads as one animal.
function buildKoi(ctx, rng) {
  const gl = ctx.gl;
  const schools = [
    { name: 'koi-terrace', back: C.koiBlue, n: 12, cx: 0, cy: 37, cz: 44, rx: 46, rz: 22, spd: 0.14, dir: 1, sc: 1.35 },
    { name: 'koi-red', back: C.koiRed, n: 11, cx: -62, cy: 52, cz: -42, rx: 112, rz: 76, spd: 0.075, dir: -1, sc: 2.3 },
    { name: 'koi-gold', back: C.koiGold, n: 9, cx: 62, cy: 62, cz: 18, rx: 152, rz: 104, spd: 0.052, dir: 1, sc: 3.0 },
    { name: 'koi-fg', back: C.koiBlue, n: 5, cx: 16, cy: 38, cz: 72, rx: 16, rz: 9, spd: 0.10, dir: -1, sc: 0.95 },
  ];
  for (const s of schools) {
    const m = localMesh(gl, (nb) => koiGeom(nb, s.back, C.koiWhite));
    // fish swim in loose shoals of 3-5 (the reference never has a queue)
    const fish = [];
    let rem = s.n;
    while (rem > 0) {
      const gs = Math.min(rem, 3 + ((rng() * 3) | 0));
      rem -= gs;
      const gBase = rng() * TAU;
      const gRad = 0.84 + rng() * 0.24;
      for (let i = 0; i < gs; i++) {
        fish.push({
          a0: gBase + (rng() - 0.5) * 0.13,
          rj: gRad * (0.90 + rng() * 0.20),
          dr: (rng() - 0.5) * 7.0,
          h: (rng() - 0.5) * 7.0,
          sc: s.sc * (0.62 + rng() * 0.80),
          ph: rng() * TAU,
          w: 0.55 + rng() * 0.90,
        });
      }
    }
    ctx.dyn.push({
      name: s.name, kind: 'inst', mesh: m, capacity: s.n,
      fill(t, act) {
        let k = 0;
        for (const f of fish) {
          const a = f.a0 + s.dir * s.spd * t * (0.94 + f.w * 0.10) + Math.sin(t * 0.26 + f.ph) * 0.16;
          const px = s.cx + Math.cos(a) * (s.rx + f.dr);
          const pz = s.cz + Math.sin(a) * (s.rz + f.dr * 0.6);
          const py = s.cy + f.h + Math.sin(t * 0.5 + f.ph) * 1.1;
          const vx = -Math.sin(a) * s.rx * s.dir;
          const vz = Math.cos(a) * s.rz * s.dir;
          const yaw = Math.atan2(vx, vz) + Math.sin(t * 2.4 + f.ph) * 0.08;
          const pitch = Math.sin(t * 1.15 + f.ph) * 0.08;
          const roll = -0.28 * s.dir + Math.sin(t * 1.7 + f.ph) * 0.06;
          act.set(k, trs([px, py, pz], yaw, f.sc, pitch, roll), f.ph, 0.10, 1);
          k++;
        }
        return k;
      },
    });
  }
}

// ================================================================ dynamic: doves
function buildDoves(ctx, rng) {
  const gl = ctx.gl;
  const flocks = [
    { name: 'doves-cathedral', n: 18, cx: L.cathedral.x, cy: 84, cz: L.cathedral.z, r0: 30, dir: 1, spd: 0.19, sc: 1.7 },
    { name: 'doves-palace', n: 18, cx: L.glassPalace.x, cy: 78, cz: L.glassPalace.z, r0: 38, dir: -1, spd: 0.15, sc: 1.8 },
    { name: 'doves-terrace', n: 9, cx: 2, cy: 40, cz: 90, r0: 18, dir: 1, spd: 0.28, sc: 2.0 },
  ];
  for (const s of flocks) {
    // every flock needs its own mesh: main.js binds the instance buffer into the
    // mesh VAO, so a shared mesh would make the flocks fight over one buffer.
    const m = localMesh(gl, (nb) => doveGeom(nb, C.dove, C.doveShade));
    const doves = [];
    for (let i = 0; i < s.n; i++) {
      doves.push({
        a0: (i / s.n) * TAU + rng() * 0.3,
        r: s.r0 * (0.72 + rng() * 0.6),
        h: (rng() - 0.5) * 18,
        ph: rng() * TAU,
        sway: 0.28 + rng() * 0.30,
        sc: s.sc * (0.82 + rng() * 0.32),
      });
    }
    ctx.dyn.push({
      name: s.name, kind: 'inst', mesh: m, capacity: s.n,
      fill(t, act) {
        let k = 0;
        for (const f of doves) {
          const a = f.a0 + s.dir * s.spd * t + 0.10 * Math.sin(t * 0.5 + f.ph);
          const px = s.cx + Math.cos(a) * f.r;
          const pz = s.cz + Math.sin(a) * f.r;
          const py = s.cy + f.h + Math.sin(t * 0.64 + f.ph) * 3.4;
          const vx = -Math.sin(a) * s.dir, vz = Math.cos(a) * s.dir;
          const yaw = Math.atan2(vx, vz) + Math.sin(t * 2.2 + f.ph) * 0.10;
          const pitch = Math.sin(t * 1.5 + f.ph) * 0.12;
          const roll = -0.34 * s.dir + Math.sin(t * 1.1 + f.ph) * 0.08;
          act.set(k, trs([px, py, pz], yaw, f.sc, pitch, roll), f.ph, f.sway, 1);
          k++;
        }
        return k;
      },
    });
  }
}

// ================================================================ dynamic: giraffes
function buildGiraffes(ctx, rng) {
  const gl = ctx.gl;
  const bodyM = localMesh(gl, (nb) => giraffeBodyGeom(nb));
  const legAM = localMesh(gl, (nb) => giraffeLegGeom(nb, true));
  const legBM = localMesh(gl, (nb) => giraffeLegGeom(nb, false));
  const HIP = 3.72;
  // z oscillates slowly between the terrace foot and the plaza rim; the heading
  // eases through the turn so the animal pivots in place instead of snapping.
  const gs = [
    { name: 'giraffe-0', x: -10.6, mid: 30, amp: 52, w: 0.027, ph: 0.4 },
    { name: 'giraffe-1', x: 10.4, mid: 30, amp: 52, w: 0.025, ph: 3.6 },
  ];
  const state = (g, t) => {
    const a = g.w * t + g.ph;
    const z = g.mid + g.amp * Math.sin(a);
    const c = Math.cos(a);
    const yaw = (Math.PI * 0.5) * (1 - Math.tanh(c / 0.20));
    const ph = z * 1.5;
    return { z, ph, yaw, bob: 0.035 * Math.sin(ph * 2.0) };
  };
  for (const g of gs) {
    ctx.dyn.push({
      name: g.name + '-body', kind: 'model', mesh: bodyM,
      model: (t) => {
        const st = state(g, t);
        return trs([g.x, st.bob, st.z], st.yaw, 1);
      },
    });
    for (const [pair, legs] of [[0, legAM], [1, legBM]]) {
      ctx.dyn.push({
        name: g.name + '-legs' + pair, kind: 'model', mesh: legs,
        model: (t) => {
          const st = state(g, t);
          const swing = 0.20 * Math.sin(st.ph + pair * Math.PI);
          return trs([g.x, HIP + st.bob, st.z], st.yaw, 1, swing);
        },
      });
    }
  }
}

// ================================================================ dynamic billboards: petals
function buildPetalFall(ctx, rng) {
  const petals = [];
  for (let i = 0; i < 620; i++) {
    petals.push({
      x: -58 + rng() * 116,
      z: 52 + rng() * 86,
      y0: 26 + rng() * 42,
      spd: 1.1 + rng() * 1.8,
      ph: rng() * TAU,
      sway: 0.5 + rng() * 1.8,
      sz: 0.12 + rng() * 0.13,
      rot: rng() * TAU,
      spin: (rng() - 0.5) * 3.0,
      col: PETAL_COLS[(rng() * PETAL_COLS.length) | 0],
    });
  }
  ctx.bbDyn.push({
    up: false,
    fill(t, bb) {
      for (const q of petals) {
        const y = 68 - ((t * q.spd + q.ph * 8.0) % 42);
        if (y < 25) continue;
        const x = q.x + Math.sin(t * 0.55 + q.ph) * q.sway;
        const z = q.z + Math.cos(t * 0.42 + q.ph * 1.3) * q.sway * 0.7;
        bb.add(x, y, z, q.sz, q.rot + t * q.spin, 0.92, 3, q.col);
      }
    },
  });
}

// ================================================================ dynamic: free balloons
// Loose balloons drifting up over the city, three colour runs of real geometry.
function buildFreeBalloons(ctx, rng) {
  const gl = ctx.gl;
  const groups = [
    { key: 'pink', col: C.ballPink },
    { key: 'sky', col: C.ballSky },
    { key: 'mint', col: C.ballMint },
  ].map((g) => ({ ...g, hi: mixc(g.col, C.cloudLit, 0.55), items: [] }));
  for (let i = 0; i < 16; i++) {
    const g = groups[i % groups.length];
    const a = rng() * TAU;
    const r = 130 + rng() * 250;
    g.items.push({
      cx: Math.cos(a) * r,
      cz: Math.sin(a) * r - 70,
      y0: rng() * 130,
      spd: 1.4 + rng() * 1.8,
      sc: 1.5 + rng() * 1.4,
      ph: rng() * TAU,
    });
  }
  for (const g of groups) {
    if (!g.items.length) continue;
    const m = localMesh(gl, (nb) => balloonGeom(nb, g.col, g.hi));
    ctx.dyn.push({
      name: 'balloons-free-' + g.key, kind: 'inst', mesh: m, capacity: g.items.length,
      fill(t, act) {
        let k = 0;
        for (const b of g.items) {
          const y = 38 + ((b.y0 + t * b.spd) % 140);
          const x = b.cx + Math.sin(t * 0.16 + b.ph) * 9;
          const z = b.cz + Math.cos(t * 0.13 + b.ph) * 9;
          const yaw = Math.sin(t * 0.2 + b.ph) * 0.5;
          act.set(k, trs([x, y, z], yaw, b.sc), 0, 0, 1);
          k++;
        }
        return k;
      },
    });
  }
}

// ================================================================ dynamic: air balloon
function buildAirBalloon(ctx, rng) {
  const gl = ctx.gl;
  const m = localMesh(gl, (nb) => envelopeGeom(nb));
  const ph = rng() * TAU;
  ctx.dyn.push({
    name: 'air-balloon', kind: 'model', mesh: m,
    model: (t) => {
      const a = 0.045 * t + 1.15 + ph * 0.05;
      const R = 245;
      const x = 20 + Math.cos(a) * R;
      const z = -50 + Math.sin(a) * R * 0.82;
      const y = 116 + Math.sin(t * 0.16 + ph) * 7;
      const yaw = Math.atan2(-Math.sin(a) * R, Math.cos(a) * R * 0.82);
      return trs([x, y, z], yaw, 1, 0, Math.sin(t * 0.21 + ph) * 0.04);
    },
  });
}

// ================================================================ dynamic: biplane
function buildBiplane(ctx, rng) {
  const gl = ctx.gl;
  const m = localMesh(gl, (nb) => biplaneGeom(nb));
  const ph = rng() * TAU;
  ctx.dyn.push({
    name: 'biplane', kind: 'model', mesh: m,
    model: (t) => {
      const a = -0.085 * t + 0.6 + ph * 0.02;
      const R = 300;
      const x = 10 + Math.cos(a) * R;
      const z = -80 + Math.sin(a) * R;
      const y = 152 + Math.sin(t * 0.33 + ph) * 9;
      const yaw = Math.atan2(-Math.sin(a) * R, Math.cos(a) * R);
      return trs([x, y, z], yaw, 1, 0.06, -0.52);
    },
  });
}

// ================================================================ entry
export function buildLife(b, ctx, rng) {
  buildVines(b, ctx, rng);
  buildBalloonClusters(b, ctx, rng);
  buildPerchedDoves(b, ctx, rng);
  buildKoi(ctx, rng);
  buildDoves(ctx, rng);
  buildGiraffes(ctx, rng);
  buildPetalFall(ctx, rng);
  buildFreeBalloons(ctx, rng);
  buildAirBalloon(ctx, rng);
  buildBiplane(ctx, rng);
}
