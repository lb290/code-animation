// TEA PAVILION — round 10: 云上茶席, a floating sky island with an open tea pavilion.
// OWNER: agent "tea". Scaffold written by the lead: anchor + frame + a placeholder deck.
// The module builds in WORLD space around L.tea (a translated local frame is pushed here,
// so every child coordinate is local: x/z around 0, deck top at local y = 0).
//
// What it is: an irregular floating rock (grass / moss cap, ten stone strata with a torn
// keel wreathed in cloud) carrying a marble checkerboard terrace (r 15) with a low
// balustrade that opens toward the city (two steps down to the grass), a mirror pool on
// the city-side promontory, eight slender fluted gilded columns (r 13, h 7.2) under a
// brass cornice + shallow ribbed glass dome with a lantern finial, silk valances, a 12 m
// tea table with brass pots (one of them a rabbit), chairs and benches, a three-tier
// stand, a gramophone, cards, an hourglass and candlesticks, three gilded memory-bottle
// cabinets, a white-rabbit statue by the steps, a big tilted pocket watch hanging between
// two columns, rose vines climbing three columns, floating crockery over the table and
// warm lamps for the night.
//
// Determinism: the module owns a local rng (the passed rng is ignored) so its vertex
// stream never depends on how many draws earlier modules made.
import { mulberry32, TAU, m4, noise2 } from './math.js';
import { box, cylinder, torus, rgb, mulc, mixc, lathe, sphere, bar3, rockBlob } from './geo.js';
import { MT, tubePath, ellipsoid } from './lib3d.js';
import { C } from './palette.js';
import { L } from './layout.js';

const SEED = 0x7eae11;

// ---------------------------------------------------------------- dims (local metres)
const R_ISL = 23.2;          // nominal island cap radius (irregular, punched out at the pool)
const Y_GRASS = -0.62;       // grass cap height
const R_TER = 15.0;          // marble terrace radius
const R_COL = 13.0;          // column circle
const COL_H = 7.20;          // column height
const Y_TAB = 0.80;          // tea-table top
const DOME_R = 12.55, DOME_H = 4.55, Y_DOME = 7.40;
const CITY_A = Math.atan2(268, 240);            // bearing of the city centre seen from L.tea
const CX = Math.cos(CITY_A), CZ = Math.sin(CITY_A);
const POOL_A = 0.30, POOL_R = 19.5, POOL_PR = 4.35;   // mirror pool on the city-side promontory
const STEP_HALF = 0.105;                        // angular half width of the stair opening
const TABLE_YAW = -(CITY_A + Math.PI / 2);      // table long axis across the city bearing
const TCX = CX * 1.4, TCZ = CZ * 1.4;           // table centre, nudged toward the city
const Y_TOP = Y_TAB + 0.045;                     // things stand on this

// ---------------------------------------------------------------- palette
const IVORY = rgb('#e8dfc9'), IVORY_W = rgb('#f6efdd');
const STONE_P = rgb('#dcd1b7'), STONE_D = rgb('#c2b599');
const GOLD = rgb('#dcae62'), GOLD_B = rgb('#f7cf94'), GOLD_D = rgb('#9c7028');
const BRASS = rgb('#c99843'), BRASS_D = rgb('#8d6a2c');
const GLASS_C = rgb('#9ecbe4'), GLASS_D = rgb('#6fa8d4');
const DARK_F = rgb('#20253f'), DARK_F2 = rgb('#191d33');
const PINK_S = rgb('#efc3cf'), PINK = rgb('#e07fb4'), LILAC = rgb('#b09cdc');
const MINT = rgb('#9fdcb8'), LEMON = rgb('#eed694'), AMBER = rgb('#ffb03a');
const MOSS = rgb('#74835f'), MOSS_D = rgb('#55654b'), LAWN = rgb('#9dab88');
const ROCK_A = rgb('#cebb97'), ROCK_B = rgb('#bcaa89'), ROCK_C = rgb('#a89a82');
const ROCK_D = rgb('#958e80'), ROCK_E = rgb('#86898d'), ROCK_F = rgb('#777e88');
const WATER_D = rgb('#10305f'), LEAF = rgb('#4f9a4e'), LEAF_D = rgb('#39763c'), LEAF_L = C.leafLight;
const ROSE_P = rgb('#ef85a7'), ROSE_W = rgb('#fff0e2'), CARD_W = rgb('#f6eeda'),
  CARD_R = rgb('#b8322e'), CHAR = rgb('#3a3f58'), SILVER = rgb('#d6e0e8');

// ---------------------------------------------------------------- materials [emissive, gloss]
const M_MARBLE = [0.01, 0.18];
const M_DARKF = [0.02, 0.30];
const M_STONE = [0.00, 0.10];
const M_ROCK = [0.10, 0.05];        // a little self-glow so the keel never goes black
const M_GOLD = [0.04, 0.64];
const M_GOLD_B = [0.09, 0.58];
const M_BRASS = [0.03, 0.62];
const M_GLASS = [0.10, 0.72];
const M_WATER = [0.07, 0.72];
const M_SILK = [0.05, 0.10];
const M_MOSS = [0.02, 0.06];
const M_LEAF = [0.02, 0.14];
const M_GLOW = [0.86, 0.10];
const M_FLAME = [0.98, 0.00];
const M_CANDLE = [0.52, 0.06];
const M_METAL = [0.02, 0.62];
const M_SILVER = [0.03, 0.66];

// ---------------------------------------------------------------- frame helpers
const T = (x, y, z) => m4.translate([x, y, z]);
const S = (s) => m4.scale([s, s, s]);
const RY = (a) => m4.rotY(a);
const RX = (a) => m4.rotX(a);
const RZ = (a) => m4.rotZ(a);
function put(b, x, y, z, fn) { b.push(T(x, y, z)); fn(); b.pop(); }
function putR(b, x, y, z, yaw, fn) { b.push(T(x, y, z)); b.push(RY(yaw)); fn(); b.pop(); b.pop(); }
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ---------------------------------------------------------------- surfaces
// flat annulus / disc in the XZ plane at height y (own copy so we can pick the normal)
function annulus(b, cx, cz, r0, r1, y, seg, col, mat, ny = 1, a0 = 0, a1 = TAU) {
  const N = [0, ny, 0];
  const n = Math.max(3, Math.round((seg * (a1 - a0)) / TAU));
  for (let i = 0; i < n; i++) {
    const t0 = a0 + (a1 - a0) * (i / n), t1 = a0 + (a1 - a0) * ((i + 1) / n);
    const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
    const p0 = [cx + c0 * r0, y, cz + s0 * r0], p1 = [cx + c1 * r0, y, cz + s1 * r0];
    const p2 = [cx + c1 * r1, y, cz + s1 * r1], p3 = [cx + c0 * r1, y, cz + s0 * r1];
    if (r0 < 1e-4) b.tri([cx, y, cz], p1, p2, col, mat, N, N, N);
    else b.quad(p0, p1, p2, p3, col, mat, N);
  }
}
// flat disc in the XY plane at depth z (facing +-Z) — watch dials, signs
function discZ(b, r0, r1, z, seg, col, mat, nz = 1) {
  const N = [0, 0, nz];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    if (r0 < 1e-4) b.tri([0, 0, z], [Math.cos(a1) * r1, Math.sin(a1) * r1, z], [Math.cos(a0) * r1, Math.sin(a0) * r1, z], col, mat, N, N, N);
    else b.quad([Math.cos(a0) * r0, Math.sin(a0) * r0, z], [Math.cos(a1) * r0, Math.sin(a1) * r0, z],
      [Math.cos(a1) * r1, Math.sin(a1) * r1, z], [Math.cos(a0) * r1, Math.sin(a0) * r1, z], col, mat, N);
  }
}
// rectangular-section ring (four faces per segment) — rails, cornices, mouldings, rims
function bandRing(b, rIn, rOut, y0, y1, seg, col, mat, opts = {}) {
  const a0 = opts.a0 ?? 0, a1 = opts.a1 ?? TAU;
  const top = opts.topCol || mulc(col, 1.08);
  const bot = opts.botCol || mulc(col, 0.55);
  const n = Math.max(3, Math.round((seg * (a1 - a0)) / TAU));
  for (let i = 0; i < n; i++) {
    const t0 = a0 + (a1 - a0) * (i / n), t1 = a0 + (a1 - a0) * ((i + 1) / n);
    const am = (t0 + t1) / 2;
    if (opts.skip && opts.skip(am)) continue;
    const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
    const N = [Math.cos(am), 0, Math.sin(am)];
    const P = (c, s, r, y) => [c * r, y, s * r];
    b.quad(P(c0, s0, rIn, y1), P(c1, s1, rIn, y1), P(c1, s1, rOut, y1), P(c0, s0, rOut, y1), top, mat, [0, 1, 0]);
    b.quad(P(c0, s0, rIn, y0), P(c0, s0, rOut, y0), P(c1, s1, rOut, y0), P(c1, s1, rIn, y0), bot, mat, [0, -1, 0]);
    b.quad(P(c0, s0, rOut, y0), P(c1, s1, rOut, y0), P(c1, s1, rOut, y1), P(c0, s0, rOut, y1), mulc(col, 0.94), mat, N);
    b.quad(P(c1, s1, rIn, y0), P(c0, s0, rIn, y0), P(c0, s0, rIn, y1), P(c1, s1, rIn, y1), mulc(col, 0.76), mat, [-N[0], 0, -N[2]]);
  }
}
// vertical cylindrical face (normals outward)
function cylFace(b, r, y0, y1, seg, col, mat, opts = {}) {
  const a0 = opts.a0 ?? 0, a1 = opts.a1 ?? TAU;
  const n = Math.max(3, Math.round((seg * (a1 - a0)) / TAU));
  for (let i = 0; i < n; i++) {
    const t0 = a0 + (a1 - a0) * (i / n), t1 = a0 + (a1 - a0) * ((i + 1) / n);
    const am = (t0 + t1) / 2;
    const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
    b.quad([c0 * r, y0, s0 * r], [c1 * r, y0, s1 * r], [c1 * r, y1, s1 * r], [c0 * r, y1, s0 * r],
      mulc(col, 0.94), mat, [Math.cos(am), 0, Math.sin(am)]);
  }
}
// hanging silk sheet between two plan points, with a swagged top and a scalloped hem
function drape(b, ax, az, bx, bz, yTop, yBotF, colTop, colBot, opts = {}) {
  const nu = opts.nu ?? 6, nv = opts.nv ?? 4;
  const bow = opts.bow ?? 0.16, folds = opts.folds ?? 2.5, sag = opts.sag ?? 0.14;
  const P = (i, j) => {
    const t = i / nu;
    let x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    const rr = Math.hypot(x, z) || 1;
    const off = bow * Math.sin(t * Math.PI) + 0.10 * Math.sin(t * Math.PI * folds);
    x += (x / rr) * off; z += (z / rr) * off;
    const yt = yTop - sag * Math.sin(Math.PI * t);
    const yb = yBotF(t);
    return [x, yt + (yb - yt) * (j / nv), z];
  };
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const p00 = P(i, j), p10 = P(i + 1, j), p11 = P(i + 1, j + 1), p01 = P(i, j + 1);
      const cxp = (p00[0] + p10[0] + p11[0] + p01[0]) / 4, czp = (p00[2] + p10[2] + p11[2] + p01[2]) / 4;
      const l = Math.hypot(cxp, czp) || 1;
      b.quad(p00, p10, p11, p01, mixc(colTop, colBot, (j + 0.5) / nv), M_SILK, [cxp / l, 0, czp / l]);
    }
  }
}

// ---------------------------------------------------------------- small props
function rose(b, r0, colA, colB) {
  sphere(b, r0, colA, M_SILK, { rings: 3, seg: 6, jitter: 0.30, seed: 11 });
  put(b, 0, r0 * 0.34, 0, () => sphere(b, r0 * 0.68, colB, M_SILK, { rings: 2, seg: 5, jitter: 0.26, seed: 5 }));
  put(b, r0 * 0.92, -r0 * 0.18, r0 * 0.2, () => sphere(b, r0 * 0.34, LEAF, M_LEAF, { rings: 2, seg: 4, jitter: 0.3, seed: 3 }));
}
function cupSet(b, col) {
  annulus(b, 0, 0, 0, 0.105, -0.012, 12, IVORY, M_MARBLE, 1);
  bandRing(b, 0.105, 0.118, -0.040, -0.006, 12, IVORY, M_MARBLE);
  lathe(b, [[0.001, 0.004], [0.040, 0.008], [0.050, 0.030], [0.060, 0.078], [0.061, 0.094]], 8, col, [0.03, 0.5]);
  put(b, 0, 0.072, 0, () => annulus(b, 0, 0, 0, 0.049, 0, 8, mulc(AMBER, 0.42), [0.30, 0.9], 1));
}
function teapot(b, body, accent) {
  lathe(b, [[0.002, 0], [0.145, 0.012], [0.205, 0.070], [0.222, 0.170], [0.198, 0.290], [0.128, 0.352], [0.098, 0.372]],
    10, body, M_BRASS);
  put(b, 0, 0.372, 0, () => {
    cylinder(b, 10, 0.104, 0.104, 0.030, accent, M_GOLD_B, { caps: true, y0: 0 });
    put(b, 0, 0.030, 0, () => sphere(b, 0.055, accent, M_GOLD_B, { rings: 3, seg: 6, jitter: 0.04, seed: 2 }));
  });
  tubePath(b, [[0.190, 0.100, 0], [0.300, 0.200, 0.01], [0.358, 0.330, 0.02]], [0.055, 0.038, 0.024], 4, body, M_BRASS);
  put(b, -0.200, 0.215, 0, () => torus(b, 0.125, 0.026, 8, 3, body, M_BRASS, 'z'));
}
function rabbitPot(b) {
  // a little white rabbit that is also a teapot: body, head, two ears, gold spout + handle
  ellipsoid(b, 0.185, 0.215, 0.165, 9, 5, IVORY_W, [0.05, 0.42]);
  put(b, 0, 0.235, 0.02, () => {
    sphere(b, 0.135, IVORY_W, [0.05, 0.42], { rings: 4, seg: 8, jitter: 0.05, seed: 4 });
    put(b, 0.055, 0.115, -0.01, () => { b.push(RZ(-0.22)); ellipsoid(b, 0.042, 0.140, 0.030, 6, 4, IVORY_W, [0.05, 0.42]); b.pop(); });
    put(b, -0.055, 0.118, -0.01, () => { b.push(RZ(0.30)); ellipsoid(b, 0.042, 0.140, 0.030, 6, 4, IVORY_W, [0.05, 0.42]); b.pop(); });
    put(b, 0.055, 0.118, 0.012, () => { b.push(RZ(-0.22)); ellipsoid(b, 0.020, 0.095, 0.014, 5, 3, PINK_S, M_SILK); b.pop(); });
    put(b, 0, 0.050, 0.128, () => sphere(b, 0.030, PINK_S, M_SILK, { rings: 2, seg: 5, jitter: 0.1 }));
    for (const sx of [-1, 1]) put(b, sx * 0.062, 0.070, 0.108, () => sphere(b, 0.019, CHAR, [0.02, 0.7], { rings: 2, seg: 5, jitter: 0.05 }));
  });
  tubePath(b, [[0.150, 0.115, 0.02], [0.245, 0.190, 0.06], [0.300, 0.290, 0.08]], [0.042, 0.030, 0.020], 4, GOLD, M_GOLD);
  put(b, -0.160, 0.150, 0, () => torus(b, 0.105, 0.024, 8, 3, GOLD, M_GOLD, 'z'));
  put(b, 0, 0.070, -0.155, () => sphere(b, 0.055, IVORY_W, [0.05, 0.42], { rings: 2, seg: 5, jitter: 0.15 }));
}
function macaron(b, r0, colA, colB) {
  cylinder(b, 8, r0, r0 * 0.95, r0 * 0.42, colA, [0.04, 0.3], { caps: true, y0: 0 });
  put(b, 0, r0 * 0.20, 0, () => cylinder(b, 8, r0 * 1.02, r0 * 1.02, r0 * 0.12, colB, [0.04, 0.3], { caps: true, y0: 0 }));
}
function candleStick(b, h) {
  lathe(b, [[0.002, 0], [0.145, 0.008], [0.145, 0.032], [0.070, 0.055], [0.048, 0.160], [0.080, 0.215], [0.052, 0.245], [0.036, h]],
    8, GOLD, M_GOLD);
  put(b, 0, h, 0, () => {
    cylinder(b, 8, 0.030, 0.028, 0.24, IVORY_W, M_CANDLE, { caps: true, y0: 0 });
    put(b, 0, 0.24, 0, () => lathe(b, [[0.001, 0], [0.020, 0.02], [0.014, 0.055], [0.002, 0.095]], 6, rgb('#ffd27a'), M_FLAME));
  });
}
function hourglass(b) {
  for (const sy of [0, 1]) put(b, 0, sy ? 0.50 : 0, 0, () => cylinder(b, 10, 0.135, 0.135, 0.035, GOLD, M_GOLD, { caps: true, y0: 0 }));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    bar3(b, [Math.cos(a) * 0.115, 0.02, Math.sin(a) * 0.115], [Math.cos(a) * 0.115, 0.53, Math.sin(a) * 0.115], 0.022, 0.022, GOLD_B, M_GOLD_B);
  }
  lathe(b, [[0.001, 0.035], [0.085, 0.075], [0.055, 0.20], [0.012, 0.255]], 9, GLASS_C, M_GLASS);
  put(b, 0, 0.535, 0, () => { b.push(RX(Math.PI)); b.push(T(0, -0.535, 0)); lathe(b, [[0.001, 0.035], [0.085, 0.075], [0.055, 0.20], [0.012, 0.255]], 9, GLASS_C, M_GLASS); b.pop(); b.pop(); });
  put(b, 0, 0.055, 0, () => annulus(b, 0, 0, 0, 0.075, 0, 9, mulc(AMBER, 0.5), [0.3, 0.6], 1));
  put(b, 0, 0.49, 0, () => annulus(b, 0, 0, 0, 0.075, 0, 9, mulc(AMBER, 0.5), [0.3, 0.6], 1));
}
function gramophone(b) {
  put(b, 0, 0.10, 0, () => box(b, 0.44, 0.20, 0.44, rgb('#6b4a2c'), [0.02, 0.2]));
  put(b, 0, 0.215, 0, () => annulus(b, 0, 0, 0, 0.165, 0, 12, CHAR, [0.02, 0.8], 1));
  put(b, 0, 0.225, 0, () => cylinder(b, 10, 0.02, 0.02, 0.03, GOLD_B, M_GOLD_B, { caps: true, y0: 0 }));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    put(b, Math.cos(a) * 0.10, 0.235, Math.sin(a) * 0.10, () => box(b, 0.05, 0.01, 0.14, mulc(CARD_W, 0.9), [0.02, 0.2]));
  }
  b.push(T(0.02, 0.22, 0));
  b.push(RX(-0.62)); b.push(RZ(0.16));
  lathe(b, [[0.030, 0.08], [0.048, 0.22], [0.090, 0.40], [0.180, 0.55], [0.300, 0.66], [0.340, 0.70]], 12, GOLD, M_GOLD);
  b.pop(); b.pop(); b.pop();
  bar3(b, [-0.20, 0.24, 0.12], [0.02, 0.42, 0.06], 0.03, 0.03, GOLD_D, M_GOLD);
}
function tierStand(b, rnd) {
  cylinder(b, 8, 0.035, 0.035, 1.30, GOLD, M_GOLD, { caps: true, y0: 0 });
  put(b, 0, 0.02, 0, () => annulus(b, 0, 0, 0, 0.20, 0, 14, GOLD_B, M_GOLD_B, 1));
  const tiers = [[0.42, 0.54], [0.78, 0.45], [1.10, 0.35]];
  const cols = [[MINT, ROSE_P], [LILAC, LEMON], [ROSE_W, PINK]];
  for (let k = 0; k < 3; k++) {
    const [yy, rr] = tiers[k];
    put(b, 0, yy, 0, () => {
      annulus(b, 0, 0, 0, rr, 0, 16, IVORY_W, M_MARBLE, 1);
      bandRing(b, rr, rr + 0.024, -0.032, 0.004, 16, GOLD, M_GOLD);
    });
    const n = k === 0 ? 11 : 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + k * 0.6;
      const rd = rr * (0.56 + (i % 3) * 0.11);
      const cc = cols[k][i % 2];
      put(b, Math.cos(a) * rd, yy + 0.004, Math.sin(a) * rd, () => macaron(b, 0.075, cc, mulc(cc, 1.25)));
    }
    if (k === 2) put(b, 0, yy + 0.02, 0, () => {
      cylinder(b, 10, 0.11, 0.125, 0.10, rgb('#f3d9b0'), [0.02, 0.2], { caps: true, y0: 0 });
      put(b, 0, 0.10, 0, () => sphere(b, 0.115, ROSE_W, [0.04, 0.3], { rings: 3, seg: 6, jitter: 0.1 }));
      put(b, 0.02, 0.19, 0.01, () => sphere(b, 0.034, rgb('#c8323c'), [0.3, 0.5], { rings: 2, seg: 5, jitter: 0.1 }));
    });
  }
}
function card(b, w, h) {
  put(b, 0, 0, 0, () => box(b, w, 0.006, h, CARD_W, [0.03, 0.34]));
  put(b, 0, 0.004, 0, () => box(b, w * 0.42, 0.004, h * 0.34, CARD_R, [0.03, 0.34]));
}
function bottleNiche(b, glowCol) {
  put(b, 0, 0.40, 0, () => box(b, 1.00, 0.80, 0.80, STONE_P, M_MARBLE));
  put(b, 0, 0.82, 0, () => box(b, 1.08, 0.10, 0.88, GOLD, M_GOLD));
  put(b, 0, 0.06, 0, () => box(b, 1.10, 0.12, 0.90, GOLD_D, M_GOLD));
  put(b, 0, 0.66, 0.41, () => box(b, 0.62, 0.17, 0.03, GOLD_B, M_GOLD_B));
  put(b, 0, 0.66, 0.428, () => box(b, 0.54, 0.10, 0.012, mulc(GOLD_D, 0.55), [0.05, 0.3]));
  put(b, 0, 1.58, -0.30, () => box(b, 1.02, 1.44, 0.12, GOLD, M_GOLD));
  put(b, 0, 1.58, -0.228, () => box(b, 0.78, 1.12, 0.03, mulc(glowCol, 0.30), [0.30, 0.2]));
  for (const sx of [-1, 1]) put(b, sx * 0.45, 1.58, -0.04, () => box(b, 0.12, 1.44, 0.56, GOLD_B, M_GOLD_B));
  put(b, 0, 0.925, -0.02, () => box(b, 1.00, 0.09, 0.56, IVORY_W, M_MARBLE));
  put(b, 0, 2.35, -0.02, () => box(b, 1.08, 0.13, 0.62, GOLD, M_GOLD));
  put(b, 0, 2.415, -0.02, () => ellipsoid(b, 0.50, 0.36, 0.29, 10, 5, GOLD_B, M_GOLD_B, { v0: 0.5, v1: 0.99 }));
  put(b, 0, 2.80, -0.02, () => sphere(b, 0.065, GOLD_B, M_GOLD_B, { rings: 2, seg: 5, jitter: 0.05 }));
  put(b, 0, 0.97, -0.02, () => {
    lathe(b, [[0.002, 0], [0.135, 0.010], [0.155, 0.075], [0.150, 0.30], [0.085, 0.40], [0.042, 0.46], [0.042, 0.60], [0.062, 0.615]],
      10, GLASS_C, M_GLASS);
    put(b, 0, 0.20, 0, () => sphere(b, 0.082, glowCol, M_GLOW, { rings: 3, seg: 7, jitter: 0.25, seed: 13 }));
    put(b, 0, 0.33, 0, () => sphere(b, 0.040, mulc(glowCol, 1.3), M_GLOW, { rings: 2, seg: 5, jitter: 0.3, seed: 17 }));
    put(b, 0, 0.60, 0, () => cylinder(b, 8, 0.055, 0.048, 0.055, GOLD, M_GOLD, { caps: true, y0: 0 }));
  });
}
function rabbitStatue(b) {
  put(b, 0, 0.20, 0, () => box(b, 0.92, 0.40, 0.92, STONE_P, M_MARBLE));
  put(b, 0, 0.41, 0, () => box(b, 1.00, 0.05, 1.00, GOLD, M_GOLD));
  put(b, 0, 0.03, 0, () => box(b, 1.02, 0.08, 1.02, GOLD_D, M_GOLD));
  b.push(T(0, 0.44, 0));
  for (const sx of [-1, 1]) put(b, sx * 0.105, 0.11, 0.02, () => box(b, 0.14, 0.24, 0.20, IVORY_W, M_MARBLE));
  put(b, 0, 0.50, 0, () => ellipsoid(b, 0.255, 0.30, 0.215, 12, 7, IVORY_W, M_MARBLE));
  put(b, 0, 0.52, 0.012, () => ellipsoid(b, 0.268, 0.235, 0.232, 12, 5, rgb('#3b4a8c'), [0.03, 0.3], { v0: 0.34, v1: 0.74 }));
  put(b, 0, 0.56, 0.20, () => box(b, 0.16, 0.26, 0.06, IVORY_W, M_MARBLE));
  for (const sx of [-1, 1]) {
    tubePath(b, [[sx * 0.22, 0.68, 0.02], [sx * 0.24, 0.56, 0.14], [sx * 0.09, 0.50, 0.26]], [0.062, 0.052, 0.045], 4, IVORY_W, M_MARBLE);
    put(b, sx * 0.085, 0.50, 0.27, () => sphere(b, 0.052, IVORY_W, M_MARBLE, { rings: 2, seg: 5, jitter: 0.1 }));
  }
  put(b, 0, 0.47, 0.30, () => {
    b.push(RX(Math.PI / 2));
    cylinder(b, 10, 0.085, 0.085, 0.032, GOLD, M_GOLD, { caps: true, y0: -0.016 });
    put(b, 0, 0.017, 0, () => annulus(b, 0, 0, 0, 0.068, 0, 12, IVORY_W, [0.1, 0.6], 1));
    b.pop();
  });
  put(b, 0, 0.60, 0.26, () => { for (let i = 0; i < 4; i++) put(b, 0.02 + i * 0.005, i * 0.038, -0.01 - i * 0.004, () => sphere(b, 0.014, GOLD_B, M_GOLD_B, { rings: 2, seg: 4, jitter: 0.05 })); });
  put(b, 0, 0.93, 0.03, () => {
    sphere(b, 0.175, IVORY_W, M_MARBLE, { rings: 5, seg: 9, jitter: 0.05, seed: 21 });
    put(b, 0, -0.055, 0.135, () => ellipsoid(b, 0.105, 0.078, 0.085, 8, 4, IVORY_W, M_MARBLE));
    put(b, 0, -0.045, 0.215, () => sphere(b, 0.028, PINK_S, [0.06, 0.35], { rings: 2, seg: 5 }));
    for (const sx of [-1, 1]) put(b, sx * 0.075, 0.030, 0.132, () => sphere(b, 0.026, CHAR, [0.05, 0.7], { rings: 2, seg: 5, jitter: 0.05 }));
    put(b, 0.062, 0.14, -0.01, () => { b.push(RZ(-0.16)); b.push(RX(-0.10)); ellipsoid(b, 0.046, 0.185, 0.032, 6, 4, IVORY_W, M_MARBLE); b.pop(); b.pop(); });
    put(b, -0.070, 0.10, -0.02, () => { b.push(RZ(0.95)); ellipsoid(b, 0.046, 0.175, 0.032, 6, 4, IVORY_W, M_MARBLE); b.pop(); });
  });
  for (const sx of [-1, 1]) put(b, sx * 0.05, 0.80, 0.145, () => { b.push(RZ(sx * 0.4)); box(b, 0.09, 0.055, 0.03, rgb('#3b4a8c'), [0.03, 0.3]); b.pop(); });
  put(b, 0, 0.80, 0.15, () => sphere(b, 0.030, GOLD_B, M_GOLD_B, { rings: 2, seg: 5 }));
  put(b, 0, 0.42, -0.235, () => sphere(b, 0.085, IVORY_W, M_MARBLE, { rings: 2, seg: 5, jitter: 0.15 }));
  b.pop();
}
// a big tilted pocket watch hanging between two columns (Alice's rabbit's watch)
function bigPocketWatch(b) {
  const R = 0.95;
  put(b, 0, 0, 0, () => {
    b.push(RZ(-0.16)); b.push(RY(0.10));
    put(b, 0, 0, 0, () => torus(b, R, 0.115, 26, 5, GOLD, M_GOLD, 'z'));
    discZ(b, 0, R + 0.10, -0.02, 26, mulc(GOLD_D, 0.8), M_GOLD, -1);
    discZ(b, 0, R, 0.045, 26, rgb('#f8f6ee'), [0.14, 0.45], 1);
    discZ(b, R * 0.86, R * 0.93, 0.052, 26, GOLD_B, M_GOLD_B, 1);
    // roman-numeral ticks
    for (let i = 0; i < 12; i++) {
      const ph = -Math.PI / 2 + (i / 12) * TAU;
      put(b, Math.cos(ph) * R * 0.76, Math.sin(ph) * R * 0.76, 0.055, () => {
        b.push(RZ(ph + Math.PI / 2));
        box(b, 0.045, i % 3 === 0 ? 0.17 : 0.11, 0.014, CHAR, [0.02, 0.3]);
        b.pop();
      });
    }
    // hands
    put(b, 0, 0, 0.062, () => {
      b.push(RZ(0.5)); bar3(b, [0, -0.05, 0], [0, 0.50, 0], 0.045, 0.018, CHAR, [0.02, 0.4]); b.pop();
      b.push(RZ(-1.15)); bar3(b, [0, -0.05, 0], [0, 0.34, 0], 0.055, 0.02, CHAR, [0.02, 0.4]); b.pop();
      put(b, 0, 0, 0.01, () => sphere(b, 0.06, GOLD, M_GOLD, { rings: 3, seg: 7 }));
    });
    // crown + bow
    put(b, 0, R + 0.17, 0, () => {
      cylinder(b, 8, 0.075, 0.075, 0.10, GOLD_B, M_GOLD_B, { caps: true, y0: 0 });
      put(b, 0, 0.10, 0, () => torus(b, 0.10, 0.028, 10, 3, GOLD, M_GOLD, 'z'));
    });
    b.pop(); b.pop();
  });
}

// ---------------------------------------------------------------- the island
function rimR(a) {
  const base = R_ISL + 0.78 * Math.sin(a * 2.7 + 0.6) + 0.46 * Math.sin(a * 5.9 + 2.2) + 0.24 * Math.sin(a * 11.3 + 4.1);
  const d = wrapPi(a - POOL_A);
  return base + 2.8 * Math.exp(-(d * d) / (2 * 0.27 * 0.27));
}
const grassY = (a, t) => Y_GRASS + 0.13 * noise2(a * 2.9 + 1.7, t * 2.1) + 0.05 * t;

// the rock hangs in ten strata, each with a small overhang lip so it reads as layered stone
const LV = [
  { y: -0.95, s: 1.000 }, { y: -3.4, s: 0.998 }, { y: -6.6, s: 0.965 }, { y: -10.4, s: 0.905 },
  { y: -14.6, s: 0.830 }, { y: -19.4, s: 0.740 }, { y: -24.8, s: 0.628 }, { y: -30.4, s: 0.492 },
  { y: -36.0, s: 0.320 }, { y: -41.0, s: 0.100 },
];
const ROCKC = [ROCK_A, ROCK_B, ROCK_C, ROCK_D, ROCK_E, ROCK_F];
const wedgeT = (a, rr) => Math.min(1, Math.max(0, (rr - 14.45) / (rimR(a) - 14.45)));

function buildIsland(b, rnd) {
  const SEG = 64, ROWS = 6;
  const RP = (t, a, rad) => [Math.cos(a) * rad, grassY(a, t), Math.sin(a) * rad];
  // ---- moss / lawn cap from the terrace plinth out to the irregular rim
  for (let r = 0; r < ROWS; r++) {
    const t0 = r / ROWS, t1 = (r + 1) / ROWS;
    for (let i = 0; i < SEG; i++) {
      const a0 = (i / SEG) * TAU, a1 = ((i + 1) / SEG) * TAU;
      const r00 = 14.45 + (rimR(a0) - 14.45) * t0, r10 = 14.45 + (rimR(a1) - 14.45) * t0;
      const r01 = 14.45 + (rimR(a0) - 14.45) * t1, r11 = 14.45 + (rimR(a1) - 14.45) * t1;
      const n = noise2(i * 0.63 + 3.1, r * 1.9 + 7.7);
      const p = noise2(i * 0.27 + 9.4, r * 0.9 + 4.2);           // dry / worn patches
      const edge = Math.min(1, t1 * 1.45);
      let col = mixc(mulc(LAWN, 0.94 + 0.16 * n), mulc(MOSS, 0.88 + 0.2 * n), edge * (0.55 + 0.45 * n));
      col = mixc(col, mulc(rgb('#b6ad8b'), 0.92 + 0.12 * n), p * p * 0.42);
      col = mulc(col, 0.98 + 0.05 * Math.sin(i * 1.7 + r));
      b.quad(RP(t0, a0, r00), RP(t0, a1, r10), RP(t1, a1, r11), RP(t1, a0, r01), col, M_MOSS, [0, 1, 0]);
    }
  }
  // ---- rim lip: grass edge rolling over into the rock
  for (let i = 0; i < SEG; i++) {
    const a0 = (i / SEG) * TAU, a1 = ((i + 1) / SEG) * TAU;
    const p0 = [Math.cos(a0) * rimR(a0), grassY(a0, 1), Math.sin(a0) * rimR(a0)];
    const p1 = [Math.cos(a1) * rimR(a1), grassY(a1, 1), Math.sin(a1) * rimR(a1)];
    const q0 = [Math.cos(a0) * rimR(a0) * 1.004, -1.15, Math.sin(a0) * rimR(a0) * 1.004];
    const q1 = [Math.cos(a1) * rimR(a1) * 1.004, -1.15, Math.sin(a1) * rimR(a1) * 1.004];
    const am = (a0 + a1) / 2;
    b.quad(p0, p1, q1, q0, mulc(mixc(ROCK_B, MOSS_D, 0.45), 0.95 + 0.1 * Math.sin(i)), M_ROCK, [Math.cos(am), 0.25, Math.sin(am)]);
  }
  // ---- stone strata, tapering to a torn hanging point
  const VT = (i, lv) => {
    const a = (i / SEG) * TAU;
    // each stratum flares out a touch at its foot, so the cliff reads as stacked ledges
    const flare = 1 + (lv % 2 ? 0.048 : -0.006);
    const r = rimR(a) * LV[lv].s * flare * (1 + 0.022 * Math.sin(a * 7.3 + lv * 1.9));
    const y = LV[lv].y + Math.sin(a * 4.4 + lv * 2.3) * 0.55 * (0.35 + LV[lv].s);
    return [Math.cos(a) * r, y, Math.sin(a) * r];
  };
  for (let lv = 0; lv < LV.length - 1; lv++) {
    const t = lv / (LV.length - 2);
    const base = mixc(ROCK_A, ROCK_F, Math.pow(t, 0.80));
    const band = mulc(base, lv % 2 ? 1.18 : 0.85);
    const cA = mixc(band, ROCK_B, 0.25 * (1 - t));
    for (let i = 0; i < SEG; i++) {
      const i1 = (i + 1) % SEG;
      const a = VT(i, lv), bb = VT(i1, lv), cc = VT(i1, lv + 1), d = VT(i, lv + 1);
      const shade = 0.84 + 0.22 * Math.cos((i / SEG) * TAU - 0.7);
      b.quad(a, bb, cc, d, mulc(cA, shade), M_ROCK);
    }
  }
  // bottom cap
  {
    const tip = [0.6, -45.5, -0.4];
    for (let i = 0; i < SEG; i++) {
      const i1 = (i + 1) % SEG;
      b.tri(VT(i, LV.length - 1), VT(i1, LV.length - 1), tip, mulc(ROCK_F, 0.86), M_ROCK);
    }
  }
  // a few hanging spikes under the rim for a torn silhouette
  for (let s = 0; s < 6; s++) {
    const a = 0.7 + s * 1.04 + rnd() * 0.3;
    const r0 = rimR(a) * (0.55 + rnd() * 0.25);
    const yTop = -18 - rnd() * 8;
    const len = 5 + rnd() * 7;
    const cx = Math.cos(a) * r0, cz = Math.sin(a) * r0;
    const w = 1.3 + rnd() * 1.4;
    for (let k = 0; k < 5; k++) {
      const a0 = (k / 5) * TAU, a1 = ((k + 1) / 5) * TAU;
      b.tri([cx + Math.cos(a0) * w, yTop, cz + Math.sin(a0) * w],
        [cx + Math.cos(a1) * w, yTop, cz + Math.sin(a1) * w],
        [cx * 0.92, yTop - len, cz * 0.92], mulc(ROCK_F, 0.9), M_ROCK);
    }
  }
  // ---- boulders, shrubs and flower tufts on the grass ring
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + 0.4 + rnd() * 0.3;
    const rr = 16.6 + rnd() * 4.6;
    if (Math.abs(wrapPi(a - POOL_A)) < 0.55) continue;
    if (Math.abs(wrapPi(a - CITY_A)) < 0.34) continue;
    put(b, Math.cos(a) * rr, grassY(a, wedgeT(a, rr)), Math.sin(a) * rr, () => {
      const sc = 0.65 + rnd() * 0.9;
      b.push(m4.scale([sc, sc * 0.8, sc]));
      rockBlob(b, 1.5, 1.5, 7 + i * 13, ROCK_B, ROCK_D, { rings: 3, seg: 7, spikes: 0, power: 0.8 });
      b.pop();
    });
  }
  for (let i = 0; i < 14; i++) {
    const a = rnd() * TAU;
    const rr = 15.9 + rnd() * 6.4;
    if (Math.abs(wrapPi(a - POOL_A)) < 0.62) continue;
    if (Math.abs(wrapPi(a - CITY_A)) < 0.30) continue;
    const gy = grassY(a, wedgeT(a, rr));
    put(b, Math.cos(a) * rr, gy, Math.sin(a) * rr, () => {
      const s = 0.28 + rnd() * 0.34;
      sphere(b, s * 0.8, mixc(MOSS, LAWN, rnd()), M_LEAF, { rings: 2, seg: 5, jitter: 0.3, seed: 3 + i });
      if (i % 3 === 0) for (let k = 0; k < 3; k++) {
        const aa = rnd() * TAU;
        put(b, Math.cos(aa) * s * 0.8, s * 0.7, Math.sin(aa) * s * 0.8, () => sphere(b, 0.055, k === 1 ? ROSE_P : ROSE_W, [0.2, 0.4], { rings: 2, seg: 4, jitter: 0.2 }));
      }
    });
  }
  // hanging vines and moss beards spilling over the cliff lip
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU + rnd() * 0.18;
    const rr = rimR(a) * 0.996;
    const x0 = Math.cos(a) * rr, z0 = Math.sin(a) * rr;
    const len = 1.8 + rnd() * 3.8;
    const pts = [];
    for (let k = 0; k <= 4; k++) {
      const t = k / 4;
      const sway = Math.sin(t * 3.1 + i) * 0.30 * t;
      pts.push([x0 + Math.cos(a + 1.5708) * sway, -0.92 - t * len, z0 + Math.sin(a + 1.5708) * sway]);
    }
    tubePath(b, pts, 0.042, 3, i % 3 ? LEAF_D : MOSS_D, M_LEAF, { caps: false });
    put(b, pts[4][0], pts[4][1], pts[4][2], () => sphere(b, 0.10, i % 2 ? ROSE_P : LEAF, M_LEAF, { rings: 2, seg: 4, jitter: 0.3, seed: i }));
  }
  // rose petals scattered on the grass and the terrace edge
  for (let i = 0; i < 12; i++) {
    const a = rnd() * TAU, rr = 15.4 + rnd() * 3.2;
    put(b, Math.cos(a) * rr, grassY(a, wedgeT(a, rr)) + 0.02, Math.sin(a) * rr, () => {
      b.push(RY(rnd() * TAU)); b.push(RX(-Math.PI / 2 + rnd() * 0.2));
      box(b, 0.09 + rnd() * 0.05, 0.004, 0.07 + rnd() * 0.04, ROSE_P, M_SILK);
      b.pop(); b.pop();
    });
  }
}

// ---------------------------------------------------------------- terrace + balustrade
function buildTerrace(b) {
  const SEG = 56, ROWS = 9, RR = 14.55;
  for (let r = 0; r < ROWS; r++) {
    const r0 = (r / ROWS) * RR, r1 = ((r + 1) / ROWS) * RR;
    for (let i = 0; i < SEG; i++) {
      const a0 = (i / SEG) * TAU, a1 = ((i + 1) / SEG) * TAU;
      const dark = ((r + i) % 2) === 0;
      const n = noise2(i * 0.71 + 2.3, r * 1.37 + 5.1) * 0.05;
      const col = dark ? mulc(DARK_F, 0.9 + n) : mulc(IVORY, 0.94 + n);
      const mat = dark ? M_DARKF : M_MARBLE;
      const P = (rr2, aa) => [Math.cos(aa) * rr2, 0, Math.sin(aa) * rr2];
      b.quad(P(r0, a0), P(r0, a1), P(r1, a1), P(r1, a0), col, mat, [0, 1, 0]);
    }
  }
  annulus(b, 0, 0, RR, 15.0, 0.001, SEG, IVORY_W, M_MARBLE, 1);
  put(b, 0, 0.012, 0, () => torus(b, 14.76, 0.030, 44, 3, GOLD_B, M_GOLD_B, 'y'));
  put(b, 0, 0.008, 0, () => torus(b, 10.45, 0.035, 44, 3, GOLD, M_GOLD, 'y'));
  put(b, 0, 0.008, 0, () => torus(b, 6.25, 0.045, 40, 3, GOLD_B, M_GOLD_B, 'y'));
  cylFace(b, 15.02, -1.6, -0.02, SEG, STONE_P, M_STONE);
  bandRing(b, 14.84, 15.14, -0.20, -0.02, SEG, STONE_P, M_STONE, { topCol: IVORY_W });
  bandRing(b, 14.90, 15.10, -0.62, -0.44, SEG, STONE_D, M_STONE);
  bandRing(b, 14.96, 15.06, -1.30, -1.16, SEG, STONE_D, M_STONE);
  // ten cards left lying on the marble
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU * 2.3 + 0.7;
    const rr = 6.6 + (i % 5) * 1.55;
    put(b, Math.cos(a) * rr, 0.006, Math.sin(a) * rr, () => {
      b.push(RY(a * 3.1)); b.push(RX(-Math.PI / 2 + 0.02));
      card(b, 0.20, 0.28);
      b.pop(); b.pop();
    });
  }
}
function buildBalustrade(b) {
  const N = 44;
  const hole = (a) => Math.abs(wrapPi(a - CITY_A)) < STEP_HALF + 0.012;
  bandRing(b, 14.94, 15.16, 0.92, 1.03, 56, STONE_P, M_STONE, { skip: hole, topCol: IVORY_W });
  bandRing(b, 14.98, 15.12, 0.10, 0.20, 56, STONE_D, M_STONE, { skip: hole });
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU;
    if (hole(a)) continue;
    const x = Math.cos(a) * 15.05, z = Math.sin(a) * 15.05;
    put(b, x, 0, z, () => {
      cylinder(b, 6, 0.105, 0.088, 0.92, STONE_P, M_STONE, { caps: true, y0: 0.06 });
      put(b, 0, 0.92, 0, () => sphere(b, 0.115, STONE_P, M_STONE, { rings: 2, seg: 6, jitter: 0.04 }));
    });
  }
  bandRing(b, 15.0, 15.74, Y_GRASS, -0.31, 56, STONE_P, M_STONE, { a0: CITY_A - STEP_HALF, a1: CITY_A + STEP_HALF, topCol: IVORY_W });
  bandRing(b, 15.66, 15.76, -0.32, -0.30, 56, GOLD, M_GOLD, { a0: CITY_A - STEP_HALF, a1: CITY_A + STEP_HALF });
  for (const sx of [-1, 1]) {
    const a = CITY_A + sx * (STEP_HALF + 0.035);
    put(b, Math.cos(a) * 15.05, 0, Math.sin(a) * 15.05, () => {
      cylinder(b, 8, 0.16, 0.14, 1.16, STONE_P, M_STONE, { caps: true, y0: 0 });
      put(b, 0, 1.16, 0, () => sphere(b, 0.17, STONE_P, M_STONE, { rings: 3, seg: 6, jitter: 0.04 }));
      put(b, 0, 1.36, 0, () => sphere(b, 0.075, GOLD_B, M_GOLD_B, { rings: 2, seg: 5 }));
    });
  }
}

// ---------------------------------------------------------------- mirror pool
function buildPool(b) {
  const px = Math.cos(POOL_A) * POOL_R, pz = Math.sin(POOL_A) * POOL_R;
  put(b, px, Y_GRASS, pz, () => {
    cylFace(b, POOL_PR + 0.03, -0.85, -0.10, 40, STONE_D, M_STONE);
    annulus(b, 0, 0, 0, POOL_PR, -0.10, 40, mulc(WATER_D, 1.1), M_WATER, 1);
    annulus(b, 0, 0, POOL_PR * 0.55, POOL_PR, -0.098, 40, mulc(WATER_D, 0.72), M_WATER, 1);
    put(b, 0, -0.085, 0, () => torus(b, POOL_PR * 0.62, 0.028, 32, 3, mulc(GOLD_B, 0.8), M_GOLD_B, 'y'));
    bandRing(b, POOL_PR, POOL_PR + 0.26, -0.20, 0.055, 40, GOLD, M_GOLD, { topCol: GOLD_B });
    put(b, 0, 0.05, 0, () => torus(b, POOL_PR + 0.24, 0.055, 40, 4, GOLD_B, M_GOLD_B, 'y'));
    annulus(b, 0, 0, POOL_PR + 0.26, POOL_PR + 0.86, 0.02, 40, STONE_P, M_STONE, 1);
    put(b, 0, 0.03, 0, () => torus(b, POOL_PR + 0.84, 0.05, 40, 3, GOLD_D, M_GOLD, 'y'));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + 0.3, rr = 1.2 + (i % 3) * 0.9;
      put(b, Math.cos(a) * rr, -0.075, Math.sin(a) * rr, () => {
        annulus(b, 0, 0, 0, 0.19, 0, 7, LEAF, M_LEAF, 1);
        if (i % 2 === 0) put(b, 0, 0.03, 0, () => rose(b, 0.07, ROSE_P, ROSE_W));
      });
    }
    put(b, 0.5, -0.07, 1.5, () => {
      b.push(RY(0.5));
      ellipsoid(b, 0.28, 0.06, 0.11, 8, 3, IVORY_W, [0.03, 0.4]);
      b.pop();
    });
  });
}

// ---------------------------------------------------------------- pavilion
function buildPavilion(b, rnd) {
  bandRing(b, 12.10, 13.58, -0.02, 0.20, 56, IVORY, M_MARBLE, { topCol: IVORY_W });
  bandRing(b, 13.42, 13.62, 0.10, 0.22, 56, GOLD, M_GOLD);

  // ---- eight slender fluted gilded columns
  for (let i = 0; i < 8; i++) {
    const a = CITY_A + Math.PI / 8 + (i * Math.PI) / 4;
    put(b, Math.cos(a) * R_COL, 0.20, Math.sin(a) * R_COL, () => {
      lathe(b, [[0.002, 0], [0.36, 0.010], [0.36, 0.10], [0.30, 0.155], [0.285, 0.22]], 10, GOLD, M_GOLD);
      cylinder(b, 10, 0.235, 0.192, COL_H - 0.52, GOLD, M_GOLD, { caps: false, y0: 0.22 });
      // fluting: six slim ribs down the shaft
      for (let k = 0; k < 6; k++) {
        const fa = (k / 6) * TAU;
        bar3(b, [Math.cos(fa) * 0.228, 0.34, Math.sin(fa) * 0.228], [Math.cos(fa) * 0.196, COL_H - 0.34, Math.sin(fa) * 0.196],
          0.036, 0.026, GOLD_B, M_GOLD_B);
      }
      for (const yy of [1.95, 4.95]) put(b, 0, yy, 0, () => torus(b, 0.218, 0.030, 10, 3, GOLD_D, M_GOLD, 'y'));
      lathe(b, [[0.238, COL_H - 0.32], [0.30, COL_H - 0.25], [0.34, COL_H - 0.13], [0.42, COL_H - 0.07], [0.44, COL_H - 0.01]],
        10, GOLD_B, M_GOLD_B);
      put(b, 0, COL_H - 0.02, 0, () => torus(b, 0.44, 0.035, 12, 3, GOLD_D, M_GOLD, 'y'));
    });
  }

  // ---- brass entablature + eave
  bandRing(b, 12.80, 13.46, 6.84, 7.10, 56, mulc(GOLD, 0.92), M_GOLD);
  bandRing(b, 12.72, 13.64, 7.10, 7.26, 56, GOLD_B, M_GOLD_B);
  bandRing(b, 13.64, 14.06, 7.09, 7.20, 56, GOLD, M_GOLD, { topCol: GOLD_B });
  put(b, 0, 7.04, 0, () => torus(b, 14.00, 0.10, 44, 4, GOLD_B, M_GOLD_B, 'y'));
  put(b, 0, 6.85, 0, () => torus(b, 13.44, 0.07, 44, 3, GOLD_D, M_GOLD, 'y'));
  bandRing(b, 12.40, 13.08, 7.26, 7.46, 56, GOLD_B, M_GOLD_B, { topCol: GOLD_B });

  // ---- glass dome: ribbed fan of panes
  put(b, 0, Y_DOME, 0, () => {
    ellipsoid(b, DOME_R, DOME_H, DOME_R, 16, 6, GLASS_C, M_GLASS, {
      v0: 0.5, v1: 0.955,
      colFn: (v, u) => mixc(GLASS_C, GOLD_B, Math.floor(u * 8) % 2 ? 0.13 : 0.02),
    });
  });
  const PHI = 1.4299;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + Math.PI / 8;
    const pts = [];
    for (let k = 0; k <= 5; k++) {
      const ph = (k / 5) * PHI;
      pts.push([Math.cos(a) * DOME_R * Math.cos(ph), Y_DOME + DOME_H * Math.sin(ph), Math.sin(a) * DOME_R * Math.cos(ph)]);
    }
    tubePath(b, pts, 0.085, 3, GOLD_B, M_GOLD_B, { caps: false });
  }
  for (const ph of [0.565, 1.068]) {
    const rr = DOME_R * Math.cos(ph), yy = Y_DOME + DOME_H * Math.sin(ph);
    put(b, 0, yy, 0, () => torus(b, rr, 0.052, 32, 3, GOLD, M_GOLD, 'y'));
  }
  // apex plate + finial lantern
  put(b, 0, Y_DOME + 4.50, 0, () => annulus(b, 0, 0, 0, 1.80, 0, 20, GOLD, M_GOLD, 1));
  put(b, 0, Y_DOME + 4.50, 0, () => lathe(b, [[1.80, 0.02], [1.40, 0.16], [1.05, 0.26], [0.90, 0.30]], 16, GOLD_B, M_GOLD_B));
  const LY = Y_DOME + 4.82;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    bar3(b, [Math.cos(a) * 0.52, LY + 0.06, Math.sin(a) * 0.52], [Math.cos(a) * 0.40, LY + 0.86, Math.sin(a) * 0.40], 0.045, 0.045, GOLD_B, M_GOLD_B);
  }
  put(b, 0, LY + 0.02, 0, () => annulus(b, 0, 0, 0, 0.56, 0, 12, GOLD, M_GOLD, 1));
  put(b, 0, LY + 0.46, 0, () => sphere(b, 0.34, rgb('#fff0c8'), M_GLOW, { rings: 4, seg: 8, jitter: 0.03 }));
  put(b, 0, LY + 0.90, 0, () => annulus(b, 0, 0, 0, 0.44, 0, 12, GOLD, M_GOLD, 1));
  put(b, 0, LY + 0.90, 0, () => lathe(b, [[0.44, 0.02], [0.30, 0.20], [0.10, 0.42], [0.03, 0.55]], 12, GOLD_B, M_GOLD_B));
  put(b, 0, LY + 1.46, 0, () => sphere(b, 0.11, GOLD_B, M_GOLD_B, { rings: 3, seg: 6, jitter: 0.05 }));
  bar3(b, [0, LY + 1.56, 0], [0, LY + 2.10, 0], 0.035, 0.035, GOLD, M_GOLD);

  // ---- silk: a scalloped valance in every bay, side drapes on the three back bays
  const bays = (i) => {
    const a0 = CITY_A + Math.PI / 8 + (i * Math.PI) / 4;
    const a1 = a0 + Math.PI / 4;
    return [[Math.cos(a0) * 12.78, Math.sin(a0) * 12.78], [Math.cos(a1) * 12.78, Math.sin(a1) * 12.78]];
  };
  for (let i = 0; i < 8; i++) {
    const [A, B] = bays(i);
    drape(b, A[0], A[1], B[0], B[1], 7.24, (t) => 6.42 + 0.12 * Math.sin(t * Math.PI * 3), IVORY_W, mulc(PINK_S, 1.04),
      { nu: 6, nv: 2, bow: -0.22, folds: 3.0, sag: 0.08 });
  }
  for (const i of [2, 3, 4]) {
    const [A, B] = bays(i);
    const f = i === 3 ? 0.13 : 0.10;
    const hem = i === 3 ? 2.05 : 4.35;
    const eA = [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f];
    const sB = [B[0] + (A[0] - B[0]) * f, B[1] + (A[1] - B[1]) * f];
    const sA = [A[0] + (B[0] - A[0]) * 0.035, A[1] + (B[1] - A[1]) * 0.035];
    const eB = [B[0] + (A[0] - B[0]) * 0.035, B[1] + (A[1] - B[1]) * 0.035];
    for (const [p, q] of [[sA, eA], [sB, eB]]) {
      drape(b, p[0], p[1], q[0], q[1], 7.18, (t) => hem + 0.38 * Math.sin(t * Math.PI),
        mulc(PINK_S, 1.06), mulc(IVORY, 0.96), { nu: 4, nv: 6, bow: -0.16, folds: 1.6, sag: 0.05 });
      put(b, q[0], hem + 0.55, q[1], () => torus(b, 0.13, 0.028, 8, 3, GOLD_B, M_GOLD_B, 'y'));
    }
  }

  // ---- four hanging lamps under the eave
  for (let i = 0; i < 4; i++) {
    const a = CITY_A + Math.PI / 4 + (i * Math.PI) / 2;
    const x = Math.cos(a) * 11.9, z = Math.sin(a) * 11.9;
    bar3(b, [x, 7.0, z], [x, 6.42, z], 0.030, 0.030, GOLD_D, M_GOLD);
    put(b, x, 6.06, z, () => {
      lathe(b, [[0.30, 0.02], [0.30, 0.08], [0.22, 0.22], [0.10, 0.30]], 10, GOLD_B, M_GOLD_B);
      sphere(b, 0.20, rgb('#ffe0a8'), M_GLOW, { rings: 3, seg: 7, jitter: 0.02 });
      put(b, 0, 0.38, 0, () => lathe(b, [[0.34, 0], [0.30, -0.04], [0.06, 0.22], [0.01, 0.30]], 10, GOLD, M_GOLD));
    });
  }

  // ---- the big rabbit pocket watch, hanging in the bay opposite the city
  {
    const wa = CITY_A + Math.PI;
    const wx = Math.cos(wa) * 11.9, wz = Math.sin(wa) * 11.9;
    const wy = 4.55;
    const facing = Math.atan2(CX, CZ);   // local +z looks back at the city
    bar3(b, [wx, 7.02, wz], [wx, wy + 1.05, wz], 0.045, 0.045, GOLD_D, M_GOLD);
    for (let k = 0; k < 3; k++) put(b, wx, wy + 1.05 + k * 0.22, wz, () => sphere(b, 0.06, GOLD_B, M_GOLD_B, { rings: 2, seg: 5, jitter: 0.05 }));
    putR(b, wx, wy, wz, facing, () => bigPocketWatch(b));
  }

  // ---- rose vines climbing three columns
  for (const i of [1, 4, 6]) {
    const a = CITY_A + Math.PI / 8 + (i * Math.PI) / 4;
    const cx = Math.cos(a) * R_COL, cz = Math.sin(a) * R_COL;
    const pts = [];
    for (let k = 0; k <= 16; k++) {
      const t = k / 16;
      const ang = a + t * 4.4;
      const rr = 0.252 + 0.026 * Math.sin(t * 9.0);
      pts.push([cx + Math.cos(ang) * rr, 0.55 + t * 5.3, cz + Math.sin(ang) * rr]);
    }
    tubePath(b, pts, 0.036, 3, LEAF_D, M_LEAF, { caps: false });
    for (let k = 0; k < 10; k++) {
      const t = 0.06 + k * 0.095;
      const ang = a + t * 4.4 + 0.55;
      const rr = 0.30;
      put(b, cx + Math.cos(ang) * rr, 0.55 + t * 5.3, cz + Math.sin(ang) * rr, () => {
        b.push(RY(-ang)); b.push(RX(0.55));
        sphere(b, 0.105, k % 3 ? LEAF : LEAF_L, M_LEAF, { rings: 2, seg: 4, jitter: 0.32, seed: 5 + k });
        b.pop(); b.pop();
      });
      if (k % 2 === 1) put(b, cx + Math.cos(ang) * 0.33, 0.72 + t * 5.3, cz + Math.sin(ang) * 0.33, () => {
        b.push(RY(-ang)); b.push(RX(0.4));
        rose(b, 0.078, k % 4 === 1 ? ROSE_P : PINK, ROSE_W);
        b.pop(); b.pop();
      });
    }
  }
}

// ---------------------------------------------------------------- tea table + crockery
function buildTable(b) {
  b.push(T(TCX, 0, TCZ));
  b.push(RY(TABLE_YAW));
  // top: thin ivory slab, gold edge, carved gold apron
  put(b, 0, Y_TAB, 0, () => box(b, 12.0, 0.09, 1.70, IVORY, M_MARBLE));
  put(b, 0, Y_TAB - 0.070, 0, () => box(b, 12.05, 0.036, 1.75, GOLD, M_GOLD));
  put(b, 0, Y_TAB - 0.150, 0, () => box(b, 11.5, 0.13, 1.18, GOLD_B, M_GOLD_B));
  put(b, 0, Y_TAB - 0.225, 0, () => box(b, 11.4, 0.05, 1.06, GOLD_D, M_GOLD));
  put(b, 0, Y_TAB + 0.048, 0, () => box(b, 11.3, 0.010, 0.76, PINK_S, M_SILK));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      put(b, sx * 4.9, 0, sz * 0.58, () => {
        lathe(b, [[0.070, 0], [0.115, 0.02], [0.085, 0.10], [0.070, 0.24], [0.095, 0.38], [0.066, 0.52], [0.110, 0.63], [0.078, 0.71]],
          8, GOLD, M_GOLD);
      });
    }
  }
  // long benches along both sides + two chairs at the ends
  for (const sz of [-1, 1]) {
    put(b, 0, 0.44, sz * 1.66, () => box(b, 8.8, 0.09, 0.40, mulc(PINK_S, 1.0), M_SILK));
    put(b, 0, 0.395, sz * 1.66, () => box(b, 8.8, 0.10, 0.44, GOLD_B, M_GOLD_B));
    for (const sx of [-1, 1]) for (const szz of [-1, 1]) {
      put(b, sx * 3.9, 0.20, sz * 1.66 + szz * 0.15, () => box(b, 0.09, 0.40, 0.09, GOLD, M_GOLD));
    }
  }
  for (const sx of [-1, 1]) {
    putR(b, sx * 6.55, 0, 0, sx > 0 ? Math.PI / 2 : -Math.PI / 2, () => {
      box(b, 0.46, 0.06, 0.46, mulc(PINK_S, 1.02), M_SILK);
      for (const ax of [-1, 1]) for (const az of [-1, 1]) {
        put(b, ax * 0.18, -0.22, az * 0.18, () => box(b, 0.055, 0.44, 0.055, GOLD, M_GOLD));
      }
      box(b, 0.46, 0.62, 0.055, IVORY_W, M_MARBLE);
      put(b, 0, 0.31, 0, () => box(b, 0.44, 0.07, 0.09, GOLD_B, M_GOLD_B));
      put(b, 0, -0.06, 0, () => box(b, 0.40, 0.05, 0.09, GOLD_B, M_GOLD_B));
    });
  }

  // ---- the spread (props scaled up a touch so they read from the terrace)
  b.push(S(1.22));
  put(b, -4.30, Y_TOP / 1.22, 0.06, () => rabbitPot(b));
  put(b, 1.06, Y_TOP / 1.22, -0.10, () => teapot(b, BRASS, GOLD_B));
  put(b, 3.62, Y_TOP / 1.22, 0.20, () => teapot(b, GOLD, GOLD_B));
  b.pop();
  put(b, -2.55, Y_TOP, -0.04, () => tierStand(b));
  putR(b, 4.62, Y_TOP, -0.34, 1.0, () => gramophone(b));
  put(b, -0.30, Y_TOP, 0.42, () => hourglass(b));
  for (const [cx, cz] of [[-5.42, -0.36], [2.42, 0.40], [5.46, 0.32]]) put(b, cx, Y_TOP, cz, () => candleStick(b, 0.42));
  // 12 cups: eight place settings plus four loose ones
  const sp = [[-5.00, -0.48], [-4.95, 0.48], [-3.55, -0.48], [-3.55, 0.48], [-2.10, 0.48], [-0.95, -0.48],
    [0.40, 0.48], [1.80, -0.48], [3.05, 0.48], [4.35, -0.48], [2.55, -0.10], [-1.85, 0.10]];
  for (let i = 0; i < sp.length; i++) {
    const [x, z] = sp[i];
    put(b, x, Y_TOP, z, () => {
      annulus(b, 0, 0, 0, 0.24, 0.003, 12, IVORY_W, [0.06, 0.6], 1);
      bandRing(b, 0.24, 0.255, 0.0, 0.012, 12, GOLD_B, M_GOLD_B);
      b.push(RY(0.4 + i * 0.3)); b.push(T(0, 0.018, 0));
      box(b, 0.22, 0.018, 0.15, mulc(PINK_S, 1.02), M_SILK);
      b.pop(); b.pop();
      b.push(S(1.35));
      put(b, 0.02 / 1.35, 0.05 / 1.35, 0.02 / 1.35, () => {
        if (i === 2) { b.push(T(-0.13, 0.06, 0)); b.push(RZ(-1.32)); cupSet(b, IVORY_W); b.pop(); b.pop(); }
        else if (i === 7) { b.push(RX(Math.PI)); cupSet(b, IVORY_W); b.pop(); }
        else cupSet(b, IVORY_W);
      });
      b.pop();
    });
  }
  // two trays of pastries
  put(b, -1.05, Y_TOP, 0.16, () => {
    cylinder(b, 16, 0.44, 0.46, 0.035, GOLD_B, M_GOLD_B, { caps: true, y0: 0 });
    put(b, 0, 0.035, 0, () => torus(b, 0.43, 0.032, 18, 3, GOLD, M_GOLD, 'y'));
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU, rr = 0.26 + (k % 2) * 0.08;
      put(b, Math.cos(a) * rr, 0.04, Math.sin(a) * rr, () => macaron(b, 0.075, k % 2 ? LEMON : MINT, ROSE_W));
    }
  });
  put(b, 5.05, Y_TOP, -0.40, () => {
    cylinder(b, 16, 0.34, 0.36, 0.030, SILVER, M_SILVER, { caps: true, y0: 0 });
    put(b, 0, 0.030, 0, () => torus(b, 0.33, 0.028, 16, 3, SILVER, M_SILVER, 'y'));
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU;
      put(b, Math.cos(a) * 0.19, 0.035, Math.sin(a) * 0.19, () => {
        cylinder(b, 8, 0.075, 0.085, 0.09, rgb('#f3d9b0'), [0.02, 0.2], { caps: true, y0: 0 });
        put(b, 0, 0.09, 0, () => sphere(b, 0.075, ROSE_W, [0.04, 0.3], { rings: 2, seg: 5, jitter: 0.1 }));
      });
    }
  });
  // scattered playing cards
  const cards = [[2.95, 0.60, 0.4], [3.18, 0.66, 1.1], [0.42, 0.56, -0.5], [-1.55, 0.58, 2.2],
    [1.35, -0.60, 0.9], [-3.85, 0.60, -1.4], [4.05, 0.54, 2.6], [-0.75, -0.54, 1.8]];
  for (let i = 0; i < cards.length; i++) {
    const [cx, cz, yaw] = cards[i];
    put(b, cx, Y_TOP + 0.004, cz, () => {
      b.push(RY(yaw));
      if (i === 1) { b.push(RX(-0.5)); card(b, 0.10, 0.145); b.pop(); }
      else card(b, 0.10, 0.145);
      b.pop();
    });
  }
  // rose bowl, a small cake platter and cutlery
  put(b, -1.55, Y_TOP, -0.58, () => {
    lathe(b, [[0.002, 0], [0.14, 0.01], [0.15, 0.14], [0.10, 0.20], [0.115, 0.215]], 10, IVORY_W, [0.05, 0.5]);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      put(b, Math.cos(a) * 0.075, 0.24, Math.sin(a) * 0.075, () => rose(b, 0.088, i % 2 ? ROSE_P : PINK, ROSE_W));
    }
  });
  for (let i = 0; i < 6; i++) {
    const x = -4.2 + i * 1.7;
    put(b, x, Y_TOP + 0.012, -0.30 + (i % 2) * 0.62, () => {
      b.push(RY(i * 0.7));
      bar3(b, [-0.11, 0, 0], [0.11, 0, 0], 0.022, 0.012, SILVER, M_SILVER);
      b.pop();
    });
  }
  // ---- floating crockery above the table (static: staggered heights + tilts)
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * TAU * 1.7 + 0.9;
    const x = Math.cos(a) * (1.6 + (i % 4) * 1.1);
    const z = Math.sin(a * 1.3) * 0.72;
    const y = Y_TOP + 0.55 + ((i * 37) % 13) * 0.115;
    const tilt = 0.16 + ((i * 17) % 9) * 0.035;
    put(b, x, y, z, () => {
      b.push(RX(Math.sin(a) * tilt)); b.push(RZ(Math.cos(a * 1.7) * tilt));
      if (i % 3 === 0) { b.push(S(1.3)); cupSet(b, IVORY_W); b.pop(); }
      else { ellipsoid(b, 0.075, 0.09, 0.075, 7, 4, IVORY_W, [0.05, 0.5]); }
      b.pop(); b.pop();
    });
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.4;
    put(b, Math.cos(a) * (2.4 + (i % 3) * 1.2), Y_TOP + 1.75 + (i % 2) * 0.4, Math.sin(a) * 0.55, () => {
      b.push(RY(a)); b.push(RX(0.4));
      rose(b, 0.068, PINK_S, ROSE_W);
      b.pop(); b.pop();
    });
  }
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU * 2 + 0.2;
    put(b, Math.cos(a) * (1.4 + (i % 3) * 1.5), Y_TOP + 1.1 + (i % 4) * 0.5, Math.sin(a) * 0.6, () => {
      b.push(RY(a)); b.push(RX(Math.sin(a) * 0.8));
      box(b, 0.075, 0.004, 0.055, i % 2 ? ROSE_P : mulc(PINK, 1.1), M_SILK);
      b.pop(); b.pop();
    });
  }
  b.pop(); b.pop();
}

// ---------------------------------------------------------------- memory cabinets
function buildCabinets(b) {
  const items = [
    { a: CITY_A + Math.PI - 0.44, col: rgb('#a06cff') },
    { a: CITY_A + Math.PI, col: rgb('#5ff0c0') },
    { a: CITY_A + Math.PI + 0.44, col: rgb('#ffb03a') },
  ];
  for (const it of items) {
    const x = Math.cos(it.a) * 11.5, z = Math.sin(it.a) * 11.5;
    const facing = Math.atan2(-Math.cos(it.a), -Math.sin(it.a));
    putR(b, x, 0.20, z, facing, () => bottleNiche(b, it.col));
  }
}

// ---------------------------------------------------------------- rabbit statue
function buildRabbit(b) {
  const a = CITY_A + 0.15;
  const x = Math.cos(a) * 16.45, z = Math.sin(a) * 16.45;
  const yaw = Math.atan2(Math.cos(a), Math.sin(a));   // face outward, greeting the arrivals
  const gy = grassY(a, wedgeT(a, 16.45));
  putR(b, x, gy, z, yaw, () => rabbitStatue(b));
}

export function buildTeaPavilion(b, ctx, rng) {
  const rnd = mulberry32(SEED);   // own rng: never shifts another module's draw sequence

  b.push(T(L.tea.x, L.tea.y, L.tea.z));
  buildIsland(b, rnd);
  buildTerrace(b);
  buildBalustrade(b);
  buildPool(b);
  buildPavilion(b, rnd);
  buildTable(b);
  buildCabinets(b);
  buildRabbit(b);
  b.pop();

  // ---------------------------------------------------------------- lights (max 6)
  const WP = (x, y, z) => [L.tea.x + x, L.tea.y + y, L.tea.z + z];
  if (ctx.points) {
    const P = (x, y, z, col, range, int) => ctx.points.push({ p: WP(x, y, z), col, range, int });
    P(TCX, 4.10, TCZ, rgb('#ffcf8a'), 30, 1.00);                                  // over the tea table
    P(0, Y_DOME + 5.30, 0, rgb('#ffd9a0'), 40, 0.90);                             // finial lantern
    P(Math.cos(CITY_A + Math.PI / 4) * 11.9, 5.40, Math.sin(CITY_A + Math.PI / 4) * 11.9, rgb('#ffc07a'), 22, 0.70);
    P(Math.cos(CITY_A - Math.PI / 4) * 11.9, 5.40, Math.sin(CITY_A - Math.PI / 4) * 11.9, rgb('#ffc07a'), 22, 0.70);
    P(Math.cos(CITY_A + Math.PI) * 11.2, 3.60, Math.sin(CITY_A + Math.PI) * 11.2, rgb('#ffdcae'), 20, 0.72);
    P(0, -10.0, 0, rgb('#dfe6f4'), 50, 0.95);                                     // cool under-island bounce
  }

  // ---------------------------------------------------------------- soft billboards
  if (ctx.lanterns) {
    const W = (x, y, z) => [L.tea.x + x, L.tea.y + y, L.tea.z + z];
    const white = rgb('#ffffff'), pale = rgb('#e6f1fd'), blush = rgb('#ffe9f2');
    // a ring of cloud the island rides in
    for (let i = 0; i < 26; i++) {
      const a = rnd() * TAU;
      const rr = 13 + rnd() * 15;
      const y = -7 - rnd() * 20;
      ctx.lanterns.push({ p: W(Math.cos(a) * rr, y, Math.sin(a) * rr), size: 10 + rnd() * 13, rot: 0, alpha: 0.55 + rnd() * 0.35, shape: 2, col: rnd() > 0.45 ? white : pale });
    }
    // four layers of cloud wisp gathered around the keel so the rock melts into cloud
    for (let layer = 0; layer < 4; layer++) {
      const yy = -30 - layer * 6.2;
      const n = 9 - layer;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + layer * 0.7;
        const rr = 3.5 + layer * 3.4 + rnd() * 3.5;
        ctx.lanterns.push({ p: W(Math.cos(a) * rr, yy + (rnd() - 0.5) * 2.2, Math.sin(a) * rr), size: 11 + rnd() * 7, rot: 0, alpha: 0.70 + rnd() * 0.25, shape: 2, col: layer % 2 ? white : blush });
      }
    }
    // the cloud bank the island rides out of, on the far side from the city
    for (let i = 0; i < 9; i++) {
      const a = CITY_A + Math.PI + (rnd() - 0.5) * 2.0;
      const rr = 30 + rnd() * 24;
      const yy = -16 + rnd() * 10;
      ctx.lanterns.push({ p: W(Math.cos(a) * rr, yy, Math.sin(a) * rr), size: 15 + rnd() * 10, rot: 0, alpha: 0.68 + rnd() * 0.18, shape: 2, col: i % 4 ? white : blush });
    }
    // the keel dissolves into a knot of cloud right at its tip
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.4;
      const rr = 3.0 + rnd() * 4.0;
      ctx.lanterns.push({ p: W(Math.cos(a) * rr, -41 + (rnd() - 0.5) * 4.5, Math.sin(a) * rr), size: 12 + rnd() * 8, rot: 0, alpha: 0.80 + rnd() * 0.18, shape: 2, col: i % 3 ? white : blush });
    }
    // wisps licking the rim (kept low so they never hide the pavilion from the city)
    for (let i = 0; i < 9; i++) {
      const a = CITY_A + Math.PI + (rnd() - 0.5) * 2.2 + (i % 2 ? Math.PI : 0);
      const rr = 20 + rnd() * 9;
      ctx.lanterns.push({ p: W(Math.cos(a) * rr, -2.0 - rnd() * 4.5, Math.sin(a) * rr), size: 6 + rnd() * 7, rot: 0, alpha: 0.45 + rnd() * 0.3, shape: 2, col: i % 3 ? white : blush });
    }
    // glow motes over the tea table (the "someone just left" magic)
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU * 2.3;
      const rr = 1.2 + rnd() * 4.6;
      ctx.lanterns.push({ p: W(TCX + Math.cos(a) * rr, 2.1 + rnd() * 2.2, TCZ + Math.sin(a) * rr * 0.7), size: 0.30 + rnd() * 0.35, rot: 0, alpha: 0.5 + rnd() * 0.35, shape: 1, col: i % 3 ? rgb('#ffe3ad') : rgb('#ffd0e2') });
    }
    // little glints inside the three memory bottles
    for (const da of [-0.44, 0, 0.44]) {
      const a = CITY_A + Math.PI + da;
      for (let k = 0; k < 3; k++) {
        ctx.lanterns.push({ p: W(Math.cos(a) * 11.5 + (rnd() - 0.5) * 0.4, 1.45 + rnd() * 0.6, Math.sin(a) * 11.5 + (rnd() - 0.5) * 0.3), size: 0.22 + rnd() * 0.25, rot: 0, alpha: 0.55, shape: 1, col: k % 2 ? rgb('#d8b7ff') : rgb('#b8ffe8') });
      }
    }
  }
}
