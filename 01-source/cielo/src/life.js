// LIFE — flying vines, falling petals, the airship and the biplane.
// Creature / balloon modules live in their own files (round 3 split):
//   creatures-fish.js     airborne fish schools
//   creatures-doves.js    pigeons / doves
//   creatures-giraffe.js  giraffes
//   props-balloons.js     terrace balloon bunches + free balloons
// They all follow the same contract: (b, ctx, rng) and append static geometry
// to b / dynamic actors to ctx.dyn / dynamic billboards to ctx.bbDyn.
import { C } from './palette.js';
import { MT, ellipsoid, tubePath } from './lib3d.js';
import { B, mulc } from './geo.js';
import { mesh } from './gl.js';
import { trs } from './actor.js';
import { TAU } from './math.js';
import { buildFish } from './creatures-fish.js';
import { buildDoves } from './creatures-doves.js';
import { buildGiraffes } from './creatures-giraffe.js';
import { buildBalloons } from './props-balloons.js';

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

const PETAL_COLS = [C.bloomPink, C.bloomYellow, C.bloomBlue, C.bloomWhite, C.ballMint, C.ballPink];

// The terrace balustrade is a belvedere bow that projects 9 m over the boulevard
// (stage owns the marble itself). Same plan curve, so vines spill over the outer
// face instead of floating inside the deck.
const RAIL_EDGE = 93.0, RAIL_HALF = 34, RAIL_BOW = 9.0;
function railZ(x) {
  const ax = Math.abs(x);
  if (ax >= RAIL_HALF) return RAIL_EDGE;
  return RAIL_EDGE - RAIL_BOW * Math.pow(Math.cos((Math.PI * 0.5 * ax) / RAIL_HALF), 1.3);
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
            colFn: (v, u) => mixLeaf(v),
          });
        });
      }
    }
  }
}
const mixLeaf = (v) => {
  // deterministic vertical leaf gradient (was an inline mixc before the split)
  return [C.leafDark[0] + (C.leafLight[0] - C.leafDark[0]) * v,
          C.leafDark[1] + (C.leafLight[1] - C.leafDark[1]) * v,
          C.leafDark[2] + (C.leafLight[2] - C.leafDark[2]) * v];
};

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

// ================================================================ dynamic billboards: petals
function buildPetalFall(ctx, rng) {
  const petals = [];
  for (let i = 0; i < 620; i++) {
    petals.push({
      x: -58 + rng() * 116,
      z: 52 + rng() * 70,          // stop at z=122: nothing should drift inside the palace
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
  buildFish(b, ctx, rng);
  buildDoves(b, ctx, rng);
  buildGiraffes(b, ctx, rng);
  buildBalloons(b, ctx, rng);
  buildPetalFall(ctx, rng);
  buildAirBalloon(ctx, rng);
  buildBiplane(ctx, rng);
}