// TERRACE-SET — the painter's corner beside the girl: easel, bistro table + chairs, plants.
// OWNER: agent "terrace-set". Contract: src/palace-plan.js (PC / PM). Called from world.js
// as buildTerraceSet(b, ctx, rng) — the last module in the world build, so its rng draws
// cannot shift the city / girl / creatures.
//
// Everything stands on the belvedere deck (the terrace's marble paving tops out at y = 30.03)
// and every size is in metres in the palace-plan world frame (y up, -Z = the city).
//
//   easel      (-2.0, 88.9)   faces the girl at (3, 86.1); canvas 0.95 x 0.72
//   paint kit  beside the easel: open paint box, brushes in a jar, palette, loose sketches
//   table      (-6.6, 92.6)   r 0.82, top 0.76, three cast-iron chairs, tea for two
//   plants     one potted tree, three medium pots, a raised flower bed, four small pots
//              along the inner walk, two long stone planters on the palace front (x 22..33, z 122.3)
import { C } from './palette.js';
import { PC, PM } from './palace-plan.js';
import { box, cylinder, lathe, torus, mixc, mulc } from './geo.js';
import { MT, ellipsoid, tubePath } from './lib3d.js';

const TAU = Math.PI * 2;
const Y0 = 30.03;                     // deck paving top (terrace.js overlay is 30.012..30.03)

// ---------------------------------------------------------------- palette
const MARBLE = mixc(PC.marble, PC.marbleHi, 0.40);
const MARBLE_HI = PC.marbleHi;
const MARBLE_SH = mixc(PC.marbleSh, C.stoneCool, 0.30);
const STONE = mixc(PC.stone, C.stonePale, 0.30);
const GOLD = PC.gold;
const GOLD_HI = PC.goldHi;
const IRON = mixc(C.iron, C.slate, 0.34);                // dark blue-grey cast iron (never black)
const IRON_HI = mixc(C.ironLight, C.slate, 0.30);
const WOOD = mixc(C.stoneWarm, C.bronze, 0.46);          // honey beech / easel wood
const WOOD_L = mixc(WOOD, C.stonePale, 0.38);            // canvas stretcher / fresh cut
const WOOD_D = mulc(WOOD, 0.70);
const TERRA = mixc(C.stoneDark, C.bloomRed, 0.24);       // terracotta
const TERRA_L = mixc(TERRA, C.stonePale, 0.24);
const SOIL = mixc(C.bronze, C.leafDark, 0.22);
const SOIL_BED = mixc(C.stoneDark, C.bronze, 0.55);      // warm planting soil
const GRASS = mixc(C.lawn, C.leafLight, 0.35);
const LINEN = mixc(C.cloudLit, C.ballCream, 0.52);       // chair cushions / canvas ground
const GLASS = mixc(C.glass, C.cloudLit, 0.22);
const LEAF = C.leaf, LEAF_L = C.leafLight, LEAF_D = C.leafDark;
const BLOOMS = [C.bloomPink, C.bloomRed, C.bloomYellow, C.bloomBlue, C.bloomWhite, C.bloomPink, C.bloomRed];

// materials: [emissive, gloss]
const M_STONE = PM.stone, M_MARBLE = PM.marble, M_GOLD = PM.gold;
const M_IRON = [0.05, 0.58];
const M_WOOD = [0.10, 0.24];
const M_TERRA = [0.08, 0.14];
const M_SOIL = [0.03, 0.03];
const M_LEAF = [0.13, 0.12];        // self-lit lift: never muddy/black on the shade side (bright anime daylight)
const M_CLOTH = MT.cloth;
const M_GLASS = [0.10, 0.80];
const M_CANVAS = [0.16, 0.02];
// the painting is flat gouache blocks: a steady self-lit lift keeps it readable in shade
const P_SKY = [0.20, 0.00];
const P_CLOUD = [0.34, 0.00];
const P_SEA = [0.28, 0.00];
const P_SIL = [0.12, 0.02];
const P_SUN = [0.80, 0.00];

// ---------------------------------------------------------------- helpers
// column-major TRS: local +X = (cos yaw, 0, sin yaw), local +Z = (-sin yaw, 0, cos yaw)
function mtr(x, y, z, yaw = 0, s = 1) {
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  return [c * s, 0, sn * s, 0, 0, s, 0, 0, -sn * s, 0, c * s, 0, x, y, z, 1];
}
function at(b, x, y, z, yaw, fn) {
  b.push(mtr(x, y, z, yaw));
  fn();
  b.pop();
}
// rotation about local X (canvas lean-back)
function tiltX(b, a, fn) {
  const c = Math.cos(a), s = Math.sin(a);
  b.push([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
  fn();
  b.pop();
}
// taper tube between two points; caps optional (hidden ends can skip them)
function limb(b, p0, p1, r0, r1, seg, col, mat, caps = true) {
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2];
  const L = Math.hypot(dx, dy, dz);
  if (!(L > 1e-5)) return;
  const u = [dx / L, dy / L, dz / L];
  const ref = Math.abs(u[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  let e1 = [u[1] * ref[2] - u[2] * ref[1], u[2] * ref[0] - u[0] * ref[2], u[0] * ref[1] - u[1] * ref[0]];
  const l1 = Math.hypot(e1[0], e1[1], e1[2]) || 1;
  e1 = [e1[0] / l1, e1[1] / l1, e1[2] / l1];
  const e2 = [u[1] * e1[2] - u[2] * e1[1], u[2] * e1[0] - u[0] * e1[2], u[0] * e1[1] - u[1] * e1[0]];
  const slope = (r1 - r0) / L;
  const ring = (p, r) => {
    const out = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * TAU;
      const ca = Math.cos(a), sa = Math.sin(a);
      out.push([p[0] + (e1[0] * ca + e2[0] * sa) * r, p[1] + (e1[1] * ca + e2[1] * sa) * r, p[2] + (e1[2] * ca + e2[2] * sa) * r]);
    }
    return out;
  };
  const A = ring(p0, r0), Bq = ring(p1, r1);
  const nrm = (i) => {
    const a = (i / seg) * TAU, ca = Math.cos(a), sa = Math.sin(a);
    const n = [e1[0] * ca + e2[0] * sa - u[0] * slope, e1[1] * ca + e2[1] * sa - u[1] * slope, e1[2] * ca + e2[2] * sa - u[2] * slope];
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    return [n[0] / l, n[1] / l, n[2] / l];
  };
  for (let i = 0; i < seg; i++) {
    const n0 = nrm(i), n1 = nrm(i + 1);
    b.tri(A[i], A[i + 1], Bq[i + 1], col, mat, n0, n1, n1);
    b.tri(A[i], Bq[i + 1], Bq[i], col, mat, n0, n1, n0);
  }
  if (caps) {
    const nDown = [-u[0], -u[1], -u[2]];
    for (let i = 0; i < seg; i++) b.tri(p0, A[i + 1], A[i], mulc(col, 0.82), mat, nDown, nDown, nDown);
    for (let i = 0; i < seg; i++) b.tri(p1, Bq[i], Bq[i + 1], mulc(col, 1.02), mat, u, u, u);
  }
}
// horizontal disc facing +Y (lib3d's disc() degenerates at inner = 0, so keep our own)
function discUp(b, r, seg, col, mat, y = 0) {
  const N = [0, 1, 0];
  const P = (a) => [Math.cos(a) * r, y, Math.sin(a) * r];
  for (let i = 0; i < seg; i++) {
    b.tri([0, y, 0], P((i / seg) * TAU), P(((i + 1) / seg) * TAU), col, mat, N, N, N);
  }
}
// flat ellipse in the local XY plane facing +Z (painting / palette shapes)
function flatOval(b, cx, cy, rx, ry, seg, col, mat, z, rot = 0) {
  const N = [0, 0, 1];
  const cr = Math.cos(rot), sr = Math.sin(rot);
  const P = (a) => {
    const u = Math.cos(a) * rx, v = Math.sin(a) * ry;
    return [cx + u * cr - v * sr, cy + u * sr + v * cr, z];
  };
  for (let i = 0; i < seg; i++) {
    b.tri([cx, cy, z], P((i / seg) * TAU), P(((i + 1) / seg) * TAU), col, mat, N, N, N);
  }
}
function paintQuad(b, cx, cy, w, h, col, mat, z) {
  b.quad([cx - w / 2, cy - h / 2, z], [cx + w / 2, cy - h / 2, z], [cx + w / 2, cy + h / 2, z], [cx - w / 2, cy + h / 2, z], col, mat, [0, 0, 1]);
}
function paintGrad(b, cx, cy, w, h, cBot, cTop, mat, z) {
  b.quadc([cx - w / 2, cy - h / 2, z], [cx + w / 2, cy - h / 2, z], [cx + w / 2, cy + h / 2, z], [cx - w / 2, cy + h / 2, z], cBot, cBot, cTop, cTop, mat);
}
function paintTri(b, p0, p1, p2, col, mat, z) {
  b.tri([p0[0], p0[1], z], [p1[0], p1[1], z], [p2[0], p2[1], z], col, mat, [0, 0, 1], [0, 0, 1], [0, 0, 1]);
}
function bloom(b, rng, x, y, z, r, col) {
  at(b, x, y, z, rng() * TAU, () => ellipsoid(b, r, r * 0.80, r, 5, 3, col, MT.cloth));
}
function leafClump(b, rng, x, y, z, r) {
  at(b, x, y, z, rng() * TAU, () => ellipsoid(b, r, r * 0.55, r * 0.8, 5, 3, rng() < 0.45 ? LEAF : LEAF_L, M_LEAF));
}
// a low planted mound with flowers peeking out; spread is fitted to the container
function flowerPatch(b, rng, cx, cy, cz, sx, sz, count, rs = 1) {
  for (let i = 0; i < count; i++) {
    const a = rng() * TAU, rr = Math.sqrt(rng());
    const px = cx + Math.cos(a) * rr * sx, pz = cz + Math.sin(a) * rr * sz;
    const top = cy + 0.10 + (1 - rr) * 0.09 + rng() * 0.03;
    leafClump(b, rng, px, top - 0.05, pz, 0.055 + rng() * 0.03);
    limb(b, [px, top - 0.12, pz], [px, top, pz], 0.006, 0.005, 3, LEAF_D, M_LEAF, false);
    bloom(b, rng, px, top + 0.02, pz, (0.040 + rng() * 0.020) * rs, BLOOMS[(i * 3 + 1) % BLOOMS.length]);
  }
}

// ================================================================ EASEL
const GIRL = [3.0, 86.1];
const EASEL = { x: -2.0, z: 88.9 };

// canvas assembly, in easel-local space (origin on the deck, +Z toward the painter/girl)
function canvasAssembly(b, rng) {
  const W = 1.06, H = 0.86, T = 0.055, D = 0.05;
  const FX = WOOD_L, FD = mulc(FX, 0.86);
  // primed canvas front + its warm back
  b.quad([-W / 2 + T, -H / 2 + T, D / 2], [W / 2 - T, -H / 2 + T, D / 2], [W / 2 - T, H / 2 - T, D / 2], [-W / 2 + T, H / 2 - T, D / 2], LINEN, M_CANVAS, [0, 0, 1]);
  b.quad([-W / 2 + T, -H / 2 + T, -D / 2], [W / 2 - T, H / 2 - T, -D / 2], [W / 2 - T, -H / 2 + T, -D / 2], [-W / 2 + T, -H / 2 + T, -D / 2], mixc(LINEN, C.stoneWarm, 0.30), M_CANVAS, [0, 0, -1]);
  at(b, 0, H / 2 - T / 2, 0, 0, () => box(b, W, T, D, FX, M_WOOD, { topCol: mulc(FX, 1.05) }));
  at(b, 0, -H / 2 + T / 2, 0, 0, () => box(b, W, T, D, FD, M_WOOD));
  at(b, -W / 2 + T / 2, 0, 0, 0, () => box(b, T, H - 2 * T, D, FX, M_WOOD));
  at(b, W / 2 - T / 2, 0, 0, 0, () => box(b, T, H - 2 * T, D, mulc(FX, 0.96), M_WOOD));
  // back stretcher bars, so the easel reads from behind too
  at(b, 0, 0, -D / 2 - 0.014, 0, () => box(b, W - 2 * T, 0.038, 0.022, FD, M_WOOD));
  at(b, 0, 0, -D / 2 - 0.014, 0, () => box(b, 0.038, H - 2 * T, 0.022, FD, M_WOOD));
  // gold clamp at the top of the frame
  at(b, 0, H / 2 + 0.012, 0.01, 0, () => box(b, 0.15, 0.05, 0.075, GOLD, M_GOLD));
  paintCanvas(b, rng);
}

// the little gouache: cobalt sky, golden sun, puffy clouds, cloud sea, city spires, a whale
function paintCanvas(b, rng) {
  const W = 0.95;
  const z = 0.026;
  // --- sky, three soft bands
  paintGrad(b, 0, 0.245, W, 0.23, mixc(C.skyMid, C.zenith, 0.55), C.zenith, P_SKY, z + 0.0005);
  paintGrad(b, 0, 0.03, W, 0.20, mixc(C.horizon, C.cloudLit, 0.25), mixc(C.skyMid, C.zenith, 0.25), P_SKY, z + 0.0005);
  paintGrad(b, 0, -0.085, W, 0.03, C.horizon, mixc(C.horizon, C.cloudLit, 0.45), P_SKY, z + 0.0005);
  // --- golden sun + warm halo + short rays
  flatOval(b, 0.245, 0.195, 0.108, 0.108, 16, mixc(C.sunGlow, C.gold, 0.30), P_CLOUD, z + 0.0010);
  flatOval(b, 0.245, 0.195, 0.056, 0.056, 14, mixc(C.goldBright, C.bloomYellow, 0.42), P_SUN, z + 0.0017);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.2;
    const c0 = Math.cos(a), s0 = Math.sin(a), cq = Math.cos(a + 0.20), sq = Math.sin(a + 0.20);
    paintTri(b, [0.245 + c0 * 0.078, 0.195 + s0 * 0.078], [0.245 + cq * 0.078, 0.195 + sq * 0.078],
      [0.245 + c0 * 0.128, 0.195 + s0 * 0.128], mixc(C.sunGlow, C.goldBright, 0.35), P_CLOUD, z + 0.0011);
  }
  // --- clouds
  const cl = [[-0.30, 0.175, 0.052], [-0.235, 0.205, 0.040], [-0.355, 0.135, 0.038],
              [0.035, 0.255, 0.042], [0.10, 0.225, 0.052], [0.155, 0.245, 0.033],
              [-0.055, 0.115, 0.058], [0.015, 0.095, 0.046], [-0.12, 0.10, 0.040],
              [0.335, 0.075, 0.036], [0.29, 0.10, 0.028]];
  for (const [cx, cy, r] of cl) flatOval(b, cx, cy, r, r * 0.72, 9, C.cloudLit, P_CLOUD, z + 0.0012);
  for (const [cx, cy, r] of [[-0.235, 0.185, 0.024], [0.10, 0.205, 0.026], [-0.055, 0.095, 0.024]]) {
    flatOval(b, cx, cy, r, r * 0.5, 7, mixc(C.cloudShade, C.cloudLit, 0.35), P_SEA, z + 0.0013);
  }
  // --- city silhouette on the horizon (rises out of the cloud sea at y = -0.105)
  const sil = mixc(C.slateDark, C.glassDeep, 0.42);
  const sil2 = mixc(C.slateDark, C.skyMid, 0.18);
  const towers = [[-0.405, 0.045, 0.055], [-0.335, 0.038, 0.082], [-0.275, 0.058, 0.115],
                  [-0.205, 0.040, 0.070], [-0.145, 0.050, 0.135], [-0.085, 0.042, 0.098],
                  [0.075, 0.048, 0.112], [0.128, 0.040, 0.078], [0.178, 0.052, 0.128],
                  [0.240, 0.044, 0.088], [0.300, 0.050, 0.100], [0.365, 0.042, 0.072], [0.415, 0.038, 0.050]];
  for (let i = 0; i < towers.length; i++) {
    const [cx, w, h] = towers[i];
    const c = i % 3 === 1 ? sil2 : sil;
    paintQuad(b, cx, -0.105 + h / 2, w, h, c, P_SIL, z + 0.0020);
    if (h > 0.09) paintTri(b, [cx - w / 2, -0.105 + h], [cx + w / 2, -0.105 + h], [cx, -0.105 + h + w * 0.95], c, P_SIL, z + 0.0020);
    if (h > 0.11) flatOval(b, cx, -0.105 + h + w * 0.95 + 0.004, 0.012, 0.012, 6, GOLD_HI, P_SUN, z + 0.0021);
  }
  // the twin-spire cathedral at the centre
  for (const sx of [-1, 1]) {
    paintQuad(b, 0.028 * sx, -0.105 + 0.10, 0.022, 0.20, sil, P_SIL, z + 0.0022);
    paintTri(b, [0.028 * sx - 0.011, 0.095], [0.028 * sx + 0.011, 0.095], [0.028 * sx, 0.155], sil, P_SIL, z + 0.0022);
  }
  paintQuad(b, 0, -0.105 + 0.075, 0.055, 0.15, mixc(sil, C.skyMid, 0.12), P_SIL, z + 0.0021);
  paintTri(b, [-0.028, 0.045], [0.028, 0.045], [0, 0.095], mixc(sil, C.gold, 0.22), P_SIL, z + 0.0023);
  // --- the whale, gliding over the city
  const wx = 0.145, wy = 0.115;
  const wh = mixc(C.whaleBody, C.skyMid, 0.18), whb = C.whaleBelly;
  flatOval(b, wx, wy, 0.074, 0.023, 11, wh, P_SIL, z + 0.0028);
  flatOval(b, wx + 0.004, wy - 0.009, 0.052, 0.009, 8, whb, P_CLOUD, z + 0.0029);
  paintTri(b, [wx + 0.068, wy + 0.003], [wx + 0.107, wy + 0.030], [wx + 0.102, wy - 0.024], wh, P_SIL, z + 0.0028);
  paintTri(b, [wx + 0.005, wy - 0.020], [wx + 0.030, wy - 0.020], [wx + 0.020, wy - 0.038], wh, P_SIL, z + 0.0028);
  for (const [px, py, pr] of [[wx - 0.03, wy + 0.030, 0.008], [wx - 0.041, wy + 0.045, 0.006], [wx - 0.024, wy + 0.052, 0.0045]]) {
    flatOval(b, px, py, pr, pr, 6, C.cloudLit, P_CLOUD, z + 0.0030);
  }
  // --- cloud sea in front of the city
  paintQuad(b, 0, -0.225, W, 0.245, mixc(C.cloudLit, C.haze, 0.22), P_SEA, z + 0.0034);
  for (let i = 0; i < 13; i++) {
    const px = -0.44 + i * 0.073, py = -0.102 + (i % 2) * 0.012, pr = 0.036 + (i % 3) * 0.014;
    flatOval(b, px, py, pr, pr * 0.55, 8, C.cloudLit, P_SEA, z + 0.0036);
  }
  for (let i = 0; i < 10; i++) {
    const px = -0.42 + i * 0.093, py = -0.185 + (i % 2) * 0.020;
    flatOval(b, px, py, 0.062, 0.030, 8, mixc(C.cloudLit, C.cloudShade, 0.22), P_SEA, z + 0.0038);
    if (i % 2 === 0) flatOval(b, px + 0.02, py + 0.028, 0.040, 0.020, 7, mixc(C.cloudLit, C.haze, 0.10), P_SEA, z + 0.0039);
  }
  // warm sunlight running along the cloud tops
  for (let i = 0; i < 6; i++) {
    const px = -0.36 + i * 0.145, py = -0.088 - (i % 2) * 0.006;
    flatOval(b, px, py, 0.040, 0.016, 7, mixc(C.sunGlow, C.cloudLit, 0.40), P_SEA, z + 0.0040);
  }
}

function buildEasel(b, rng) {
  const nx = GIRL[0] - EASEL.x, nz = GIRL[1] - EASEL.z;
  const L = Math.hypot(nx, nz);
  const yaw = Math.atan2(-nx / L, nz / L);
  at(b, EASEL.x, Y0, EASEL.z, yaw, () => {
    // ---- three legs: two front, one rear mast
    for (const sx of [-1, 1]) {
      limb(b, [sx * 0.37, 0.02, 0.26], [sx * 0.05, 1.72, 0.02], 0.036, 0.027, 5, WOOD, M_WOOD, false);
      at(b, sx * 0.37, 0.03, 0.26, 0, () => cylinder(b, 5, 0.052, 0.045, 0.045, WOOD_D, M_WOOD, { y0: 0 }));
      at(b, sx * 0.37, 0.05, 0.26, 0, () => torus(b, 0.046, 0.009, 8, 3, GOLD, M_GOLD));
    }
    limb(b, [0, 0.02, -0.66], [0, 1.98, -0.03], 0.040, 0.028, 5, WOOD, M_WOOD, false);
    at(b, 0, 0.03, -0.66, 0, () => cylinder(b, 5, 0.056, 0.048, 0.045, WOOD_D, M_WOOD, { y0: 0 }));
    at(b, 0, 1.98, -0.03, 0, () => ellipsoid(b, 0.05, 0.045, 0.05, 6, 4, WOOD_D, M_WOOD));
    at(b, 0, 2.02, -0.03, 0, () => ellipsoid(b, 0.022, 0.03, 0.022, 5, 3, GOLD, M_GOLD));
    // ---- low crossbar + braces back to the mast
    limb(b, [-0.31, 0.34, 0.215], [0.31, 0.34, 0.215], 0.022, 0.022, 4, WOOD_D, M_WOOD);
    limb(b, [-0.267, 0.58, 0.167], [0, 0.58, -0.505], 0.013, 0.013, 4, WOOD_D, M_WOOD);
    limb(b, [0.267, 0.58, 0.167], [0, 0.58, -0.505], 0.013, 0.013, 4, WOOD_D, M_WOOD);
    // ---- canvas ledge + lip
    at(b, 0, 0.765, 0.16, 0, () => box(b, 1.12, 0.05, 0.22, WOOD_L, M_WOOD, { topCol: mulc(WOOD_L, 1.08) }));
    at(b, 0, 0.80, 0.268, 0, () => box(b, 1.12, 0.075, 0.032, WOOD_D, M_WOOD));
    at(b, -0.36, 0.80, 0.16, 0.25, () => box(b, 0.22, 0.018, 0.14, mixc(C.ballSky, C.cloudLit, 0.40), M_CLOTH));
    limb(b, [-0.5, 0.80, 0.10], [-0.30, 0.815, 0.30], 0.008, 0.006, 4, WOOD_D, M_WOOD, false);
    // ---- clamp linking the canvas top to the mast
    limb(b, [0, 1.62, -0.145], [0, 1.60, 0.035], 0.024, 0.020, 4, WOOD_D, M_WOOD);
    // ---- painting
    at(b, 0, 1.21, 0.155, 0, () => tiltX(b, -0.22, () => canvasAssembly(b, rng)));
  });
}

// ================================================================ PAINT KIT
function buildPaintKit(b, rng) {
  // ---- open paint box
  at(b, -3.35, Y0, 89.55, -2.35, () => {
    at(b, 0, 0.028, 0, 0, () => box(b, 0.52, 0.056, 0.34, WOOD, M_WOOD, { topCol: WOOD_D }));
    at(b, 0, 0.055, 0.155, 0, () => box(b, 0.52, 0.11, 0.028, WOOD_L, M_WOOD));
    at(b, 0, 0.055, -0.155, 0, () => box(b, 0.52, 0.11, 0.028, WOOD_L, M_WOOD));
    for (const sx of [-1, 1]) at(b, sx * 0.246, 0.055, 0, 0, () => box(b, 0.028, 0.11, 0.34, WOOD_L, M_WOOD));
    // lid hinged at the back, standing open (leaning 12 deg back, never below the deck)
    at(b, 0, 0.105, -0.165, 0, () => tiltX(b, -1.75, () => {
      at(b, 0, 0.014, 0.17, 0, () => box(b, 0.52, 0.028, 0.34, WOOD_L, M_WOOD, { topCol: mulc(WOOD_L, 1.06) }));
      at(b, 0, 0.030, 0.17, 0, () => box(b, 0.48, 0.006, 0.30, mixc(C.stonePale, C.cloudLit, 0.4), M_CANVAS));
    }));
    // brass corners
    for (const sx of [-1, 1]) at(b, sx * 0.24, 0.038, 0.155, 0, () => box(b, 0.05, 0.06, 0.012, GOLD, M_GOLD));
    // paint tubes lying in the box
    const tubeCols = [C.bloomRed, C.bloomYellow, C.bloomBlue, C.bloomWhite, C.bloomPink];
    for (let i = 0; i < 5; i++) {
      const tx = -0.18 + (i % 3) * 0.17, tz = -0.08 + Math.floor(i / 3) * 0.11;
      const a = 0.25 + i * 0.4;
      const p0 = [tx - Math.cos(a) * 0.062, 0.075, tz - Math.sin(a) * 0.062];
      const p1 = [tx + Math.cos(a) * 0.062, 0.078, tz + Math.sin(a) * 0.062];
      limb(b, p0, p1, 0.017, 0.017, 6, mixc(C.cloudLit, C.ironLight, 0.35), [0.03, 0.62], false);
      at(b, p1[0], p1[1] + 0.006, p1[2], 0, () => cylinder(b, 6, 0.018, 0.016, 0.022, tubeCols[i], M_CLOTH, { y0: 0 }));
      at(b, p0[0], p0[1] - 0.004, p0[2], 0, () => box(b, 0.022, 0.006, 0.03, mixc(C.ironLight, C.cloudLit, 0.2), [0.02, 0.7]));
    }
    // palette knife + a loose stick of yellow
    limb(b, [-0.19, 0.075, 0.10], [0.08, 0.075, 0.14], 0.006, 0.014, 4, mixc(C.ironLight, C.cloudLit, 0.4), [0.02, 0.8], false);
    at(b, 0.12, 0.075, 0.09, 0.7, () => box(b, 0.10, 0.026, 0.045, C.bloomYellow, M_CLOTH));
  });

  // ---- palette, lying nearly flat beside the box
  at(b, -4.12, Y0 + 0.02, 89.95, -1.10, () => {
    tiltX(b, -1.50, () => {
      flatOval(b, 0, 0, 0.215, 0.145, 14, mixc(C.stonePale, C.cloudLit, 0.30), M_CANVAS, 0.012);
      flatOval(b, 0, 0, 0.200, 0.132, 14, mixc(C.stoneWarm, C.cloudLit, 0.22), M_CANVAS, 0.016);
      for (let i = 0; i < 14; i++) {
        const a0 = (i / 14) * TAU, a1 = ((i + 1) / 14) * TAU;
        const p = (a, r) => [Math.cos(a) * r, Math.sin(a) * r, 0.010];
        b.quad(p(a0, 0.215), p(a1, 0.215), p(a1, 0.198), p(a0, 0.198), mixc(C.stoneWarm, C.bronze, 0.25), M_WOOD, [0, 0, 1]);
      }
      flatOval(b, -0.145, 0.0, 0.028, 0.022, 8, mulc(C.stoneWarm, 0.55), M_SOIL, 0.018);
      const daubs = [[0.07, 0.06, C.bloomRed], [0.125, 0.015, C.bloomYellow], [0.085, -0.045, C.bloomBlue],
                     [-0.02, -0.06, C.bloomWhite], [-0.055, 0.06, C.bloomPink], [0.16, -0.055, mixc(C.bloomBlue, C.bloomWhite, 0.4)]];
      for (const [dx, dy, col] of daubs) flatOval(b, dx, dy, 0.032, 0.022, 7, col, M_CLOTH, 0.019);
    });
  });

  // ---- brush jar with three brushes
  at(b, -1.35, Y0, 90.05, 0.5, () => {
    lathe(b, [[0.058, 0], [0.070, 0.012], [0.072, 0.10], [0.074, 0.145], [0.066, 0.150], [0.062, 0.138]], 9, GLASS, M_GLASS, { smooth: true });
    discUp(b, 0.062, 9, mixc(C.glass, C.cloudLit, 0.35), M_GLASS, 0.118);
    at(b, 0, 0.146, 0, 0, () => torus(b, 0.072, 0.008, 9, 3, mixc(C.cloudLit, C.glassDeep, 0.2), M_GLASS));
    for (let i = 0; i < 3; i++) {
      const a = 0.6 + i * 2.1;
      const tip = [Math.cos(a) * 0.045, 0.30 + i * 0.035, Math.sin(a) * 0.045];
      const base = [Math.cos(a) * 0.02, 0.13, Math.sin(a) * 0.02];
      limb(b, base, tip, 0.0065, 0.005, 4, WOOD_L, M_WOOD, false);
      limb(b, [tip[0] * 0.95, tip[1] - 0.045, tip[2] * 0.95], [tip[0], tip[1] + 0.005, tip[2]], 0.009, 0.010, 4, mixc(C.cloudLit, C.ironLight, 0.3), [0.03, 0.7], false);
      limb(b, [tip[0], tip[1] + 0.005, tip[2]], [tip[0] * 1.06, tip[1] + 0.052, tip[2] * 1.06], 0.010, 0.0022, 5, i === 0 ? C.bloomBlue : (i === 1 ? C.bloomRed : mixc(C.bloomYellow, C.bloomWhite, 0.3)), M_CLOTH, false);
    }
  });

  // ---- two loose sketch sheets pinned flat on the paving
  at(b, -4.62, Y0 + 0.002, 90.62, 0.42, () => {
    b.quad([-0.15, 0, -0.10], [-0.15, 0, 0.10], [0.15, 0, 0.10], [0.15, 0, -0.10], mixc(C.cloudLit, C.stonePale, 0.2), M_CANVAS, [0, 1, 0]);
    b.quad([-0.10, 0.002, -0.05], [-0.10, 0.002, 0.06], [0.10, 0.002, 0.06], [0.10, 0.002, -0.05], mulc(mixc(C.cloudLit, C.stonePale, 0.2), 0.96), M_CANVAS, [0, 1, 0]);
    limb(b, [-0.11, 0.006, -0.075], [0.10, 0.006, 0.085], 0.004, 0.004, 4, mixc(C.bloomYellow, C.bronze, 0.45), [0.03, 0.3], false);
    at(b, 0.16, 0.006, -0.02, 0, () => ellipsoid(b, 0.014, 0.008, 0.014, 6, 3, GOLD, M_GOLD));
  });
  at(b, -4.95, Y0 + 0.002, 91.15, -0.25, () => {
    b.quad([-0.14, 0, -0.095], [-0.14, 0, 0.095], [0.14, 0, 0.095], [0.14, 0, -0.095], mixc(C.cloudLit, C.stonePale, 0.28), M_CANVAS, [0, 1, 0]);
  });
  void rng;
}

// ================================================================ TABLE
const TABLE = { x: -6.6, z: 92.6, r: 0.82 };

function teaSet(b, rng) {
  // ---- crystal vase with a small bouquet at the centre
  lathe(b, [[0.058, 0], [0.078, 0.018], [0.066, 0.05], [0.042, 0.105], [0.040, 0.155], [0.052, 0.20], [0.046, 0.225]], 9, mixc(C.glass, C.cloudLit, 0.35), M_GLASS, { smooth: true });
  at(b, 0, 0.205, 0, 0, () => torus(b, 0.050, 0.007, 10, 3, GOLD, M_GOLD));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.35;
    const rr = 0.052 + (i % 2) * 0.042;
    const hx = Math.cos(a) * rr, hz = Math.sin(a) * rr, hy = 0.285 + rng() * 0.10;
    limb(b, [Math.cos(a) * 0.018, 0.215, Math.sin(a) * 0.018], [hx, hy - 0.012, hz], 0.006, 0.005, 4, LEAF_D, M_LEAF, false);
    bloom(b, rng, hx, hy, hz, 0.032 + rng() * 0.014, BLOOMS[i]);
    leafClump(b, rng, hx * 0.7, hy - 0.055, hz * 0.7, 0.035);
  }

  // ---- teapot (white porcelain, gold band, proper D handle + low spout)
  at(b, -0.30, 0.0, 0.18, 0.4, () => {
    lathe(b, [[0.055, 0], [0.085, 0.012], [0.108, 0.045], [0.112, 0.085], [0.094, 0.128], [0.062, 0.152], [0.044, 0.163]], 10, LINEN, M_CANVAS, { smooth: true });
    at(b, 0, 0.163, 0, 0, () => cylinder(b, 10, 0.048, 0.036, 0.02, mixc(LINEN, C.stoneWarm, 0.25), M_CANVAS, { y0: 0 }));
    at(b, 0, 0.19, 0, 0, () => ellipsoid(b, 0.017, 0.019, 0.017, 6, 4, GOLD, M_GOLD));
    at(b, 0, 0.118, 0, 0, () => torus(b, 0.104, 0.007, 12, 3, GOLD, M_GOLD));
    tubePath(b, [[0.085, 0.130, 0.0], [0.140, 0.162, 0.012], [0.178, 0.186, 0.020]], [0.026, 0.018, 0.012], 6, LINEN, M_CANVAS, { caps: false });
    // D handle on -X
    const hp = [];
    for (let i = 0; i <= 8; i++) {
      const a = -Math.PI / 2 + (i / 8) * Math.PI;
      hp.push([-0.100 - Math.cos(a) * 0.080, 0.105 + Math.sin(a) * 0.048, 0]);
    }
    tubePath(b, hp, 0.013, 4, LINEN, M_CANVAS, { caps: false });
    at(b, 0, 0.075, 0, 0, () => torus(b, 0.107, 0.006, 12, 3, C.bloomBlue, M_CLOTH));
  });

  // ---- two cups + saucers
  const cups = [[0.30, 0.20, 0.6], [0.18, -0.33, -2.2]];
  for (const [cx, cz, rot] of cups) {
    at(b, cx, 0.0, cz, rot, () => {
      lathe(b, [[0.052, 0], [0.098, 0.006], [0.102, 0.016], [0.088, 0.020]], 10, LINEN, M_CANVAS, { smooth: true });
      lathe(b, [[0.022, 0.018], [0.048, 0.026], [0.052, 0.062], [0.046, 0.074], [0.041, 0.068]], 9, LINEN, M_CANVAS, { smooth: true });
      discUp(b, 0.047, 9, mixc(C.gold, C.bronze, 0.58), [0.03, 0.3], 0.062);
      at(b, 0, 0.030, 0, 0, () => torus(b, 0.100, 0.006, 12, 3, GOLD, M_GOLD));
      at(b, 0, 0.068, 0, 0, () => torus(b, 0.048, 0.0035, 10, 3, C.bloomBlue, M_CLOTH));
      const hpp = [];
      for (let i = 0; i <= 5; i++) {
        const a = -0.6 + (i / 5) * Math.PI * 0.95;
        hpp.push([0.050 + Math.cos(a) * 0.030, 0.045 + Math.sin(a) * 0.024, 0]);
      }
      tubePath(b, hpp, 0.009, 4, LINEN, M_CANVAS, { caps: false });
    });
  }

  // ---- a sketchbook (echoes the easel) and a little brass candlestick
  at(b, 0.40, 0.0, -0.06, 0.55, () => {
    at(b, 0, 0.004, 0, 0, () => box(b, 0.260, 0.008, 0.195, mixc(C.ribbonBlue, C.trainNavy, 0.25), M_CANVAS));
    at(b, 0, 0.020, 0.006, 0, () => box(b, 0.245, 0.024, 0.185, mixc(C.cloudLit, C.stonePale, 0.25), M_CANVAS));
    at(b, 0, 0.036, 0, 0, () => box(b, 0.265, 0.010, 0.200, mixc(C.ribbonBlue, C.trainNavy, 0.15), M_CANVAS));
    at(b, -0.136, 0.020, 0, 0, () => box(b, 0.012, 0.036, 0.200, mixc(C.ribbonBlue, C.trainNavy, 0.35), M_CANVAS));
    at(b, 0.10, 0.021, 0.102, 0, () => box(b, 0.050, 0.008, 0.012, GOLD, M_GOLD));
    limb(b, [-0.06, 0.045, -0.055], [0.09, 0.045, 0.030], 0.005, 0.005, 4, mixc(C.bloomYellow, C.bronze, 0.5), [0.03, 0.3], false);
  });
  at(b, -0.42, 0.0, 0.38, 0, () => {
    lathe(b, [[0.055, 0], [0.050, 0.010], [0.028, 0.030], [0.020, 0.060], [0.030, 0.085], [0.042, 0.105], [0.040, 0.115]], 9, GOLD, M_GOLD, { smooth: true });
    at(b, 0, 0.115, 0, 0, () => cylinder(b, 9, 0.030, 0.030, 0.012, GOLD_HI, M_GOLD, { y0: 0 }));
    at(b, 0, 0.127, 0, 0, () => cylinder(b, 8, 0.017, 0.017, 0.112, mixc(C.cloudLit, C.ballCream, 0.45), M_CANVAS, { y0: 0 }));
    at(b, 0, 0.240, 0, 0, () => ellipsoid(b, 0.004, 0.012, 0.004, 4, 3, mixc(C.ironLight, C.bronze, 0.4), [0.02, 0.4]));
  });

  // ---- pastry plate with three little cakes
  at(b, -0.22, 0.0, -0.36, 0.2, () => {
    lathe(b, [[0.030, 0], [0.105, 0.004], [0.120, 0.014], [0.108, 0.020]], 12, mixc(C.cloudLit, C.stonePale, 0.2), M_CANVAS, { smooth: true });
    at(b, 0, 0.020, 0, 0, () => torus(b, 0.113, 0.005, 12, 3, GOLD, M_GOLD));
    const cakes = [[0.035, 0.035, C.bloomYellow], [-0.038, 0.022, mixc(C.cloudLit, C.ballCream, 0.4)], [0.005, -0.042, C.bloomRed]];
    for (const [dx, dz, col] of cakes) {
      at(b, dx, 0.028, dz, 0, () => cylinder(b, 8, 0.024, 0.020, 0.028, col, M_CLOTH, { y0: 0 }));
      at(b, dx, 0.060, dz, 0, () => ellipsoid(b, 0.010, 0.008, 0.010, 6, 3, C.bloomPink, M_CLOTH));
    }
  });
}

function buildTable(b, rng) {
  at(b, TABLE.x, Y0, TABLE.z, 0, () => {
    // ---- three cast-iron feet
    for (let i = 0; i < 3; i++) {
      const a = 0.55 + (i * TAU) / 3;
      const ca = Math.cos(a), sa = Math.sin(a);
      tubePath(b, [[ca * 0.02, 0.30, sa * 0.02], [ca * 0.20, 0.17, sa * 0.20], [ca * 0.40, 0.075, sa * 0.40], [ca * 0.545, 0.038, sa * 0.545]], [0.044, 0.038, 0.030, 0.023], 5, IRON, M_IRON, { caps: true });
      at(b, ca * 0.565, 0.036, sa * 0.565, a, () => ellipsoid(b, 0.085, 0.030, 0.050, 7, 4, IRON_HI, M_IRON));
      at(b, ca * 0.565, 0.066, sa * 0.565, a, () => ellipsoid(b, 0.042, 0.012, 0.030, 6, 3, GOLD, M_GOLD));
      at(b, ca * 0.10, 0.315, sa * 0.10, a, () => ellipsoid(b, 0.075, 0.03, 0.06, 6, 3, IRON_HI, M_IRON));
    }
    // ---- fluted column + gilded collars + lower ring
    lathe(b, [[0.135, 0.24], [0.105, 0.28], [0.062, 0.34], [0.055, 0.40], [0.072, 0.45], [0.060, 0.50], [0.085, 0.545], [0.098, 0.585], [0.128, 0.63], [0.128, 0.672]], 12, IRON, M_IRON, { smooth: true });
    at(b, 0, 0.615, 0, 0, () => torus(b, 0.132, 0.012, 12, 3, GOLD, M_GOLD));
    at(b, 0, 0.455, 0, 0, () => torus(b, 0.073, 0.010, 12, 3, GOLD, M_GOLD));
    at(b, 0, 0.525, 0, 0, () => torus(b, 0.44, 0.015, 16, 3, IRON_HI, M_IRON));
    for (let i = 0; i < 3; i++) {
      const a = 0.55 + (i * TAU) / 3;
      const ca = Math.cos(a), sa = Math.sin(a);
      limb(b, [ca * 0.085, 0.52, sa * 0.085], [ca * 0.44, 0.525, sa * 0.44], 0.014, 0.012, 4, IRON, M_IRON, false);
    }
    // ---- marble top: moulded edge, solid surface disc, slim gold rim
    lathe(b, [[0.795, 0.612], [0.812, 0.626], [0.820, 0.652], [0.820, 0.735], [0.808, 0.752], [0.780, 0.760]], 24, MARBLE, M_MARBLE, { smooth: true });
    discUp(b, 0.782, 24, MARBLE_HI, M_MARBLE, 0.760);
    at(b, 0, 0.745, 0, 0, () => torus(b, 0.813, 0.013, 24, 4, GOLD, M_GOLD));
    // ---- things on the table
    at(b, 0, 0.760, 0, 0, () => teaSet(b, rng));
  });
}

// ================================================================ CHAIRS
function chair(b, rng) {
  const SEAT = 0.455;
  for (const [lx, lz] of [[-0.19, 0.155], [0.19, 0.155], [-0.20, -0.17], [0.20, -0.17]]) {
    const bx = lx * 1.16, bz = lz * 1.16;
    limb(b, [bx, 0.018, bz], [lx, SEAT, lz], 0.024, 0.019, 5, IRON, M_IRON, false);
    at(b, bx, 0.026, bz, 0, () => ellipsoid(b, 0.030, 0.026, 0.030, 5, 3, GOLD, M_GOLD));
  }
  limb(b, [-0.19, 0.145, 0.155], [0.19, 0.145, 0.155], 0.013, 0.013, 4, IRON, M_IRON, false);
  limb(b, [-0.20, 0.145, -0.17], [0.20, 0.145, -0.17], 0.013, 0.013, 4, IRON, M_IRON, false);
  limb(b, [-0.196, 0.155, 0.145], [-0.204, 0.155, -0.16], 0.012, 0.012, 4, IRON, M_IRON, false);
  limb(b, [0.196, 0.155, 0.145], [0.204, 0.155, -0.16], 0.012, 0.012, 4, IRON, M_IRON, false);
  // seat frame ring + a thicker cushion + gold piping
  at(b, 0, 0.432, 0, 0, () => torus(b, 0.230, 0.019, 14, 3, IRON, M_IRON));
  at(b, 0, 0.478, 0, 0, () => ellipsoid(b, 0.242, 0.064, 0.232, 10, 4, LINEN, M_CLOTH));
  at(b, 0, 0.518, 0, 0, () => torus(b, 0.220, 0.012, 14, 3, mixc(GOLD, C.stonePale, 0.25), M_GOLD));
  at(b, 0, 0.536, 0, 0, () => ellipsoid(b, 0.014, 0.008, 0.014, 6, 3, GOLD, M_GOLD));
  // ---- oval back: two raked side posts, a bowed double hoop and vertical spindles
  const HC = [0, 0.745, -0.235], HRX = 0.215, HRY = 0.248, BOW = 0.050;
  const ovalPt = (a, rx, ry, dz) => {
    const c = Math.cos(a), s = Math.sin(a);
    return [c * rx, HC[1] + s * ry, HC[2] - BOW * c * c + dz];
  };
  const OUT = [], INN = [];
  for (let i = 0; i < 16; i++) {
    OUT.push(ovalPt((i / 16) * TAU, HRX, HRY, 0));
    INN.push(ovalPt((i / 16) * TAU, HRX * 0.70, HRY * 0.72, -0.038));
  }
  for (let i = 0; i < 16; i++) {
    limb(b, OUT[i], OUT[(i + 1) % 16], 0.017, 0.017, 4, IRON, M_IRON, false);
    limb(b, INN[i], INN[(i + 1) % 16], 0.012, 0.012, 4, IRON, M_IRON, false);
  }
  for (const i of [0, 4, 8, 12]) limb(b, OUT[i], INN[i], 0.010, 0.010, 4, IRON, M_IRON, false);
  for (const sx of [-1, 1]) {
    limb(b, [sx * 0.19, 0.435, -0.155], [sx * HRX, HC[1], HC[2] - BOW], 0.021, 0.018, 5, IRON, M_IRON, false);
    at(b, sx * HRX, HC[1], HC[2] - BOW, 0, () => ellipsoid(b, 0.018, 0.028, 0.018, 5, 3, GOLD, M_GOLD));
  }
  for (let k = -2; k <= 2; k++) {
    const x = k * 0.072, t = x / HRX;
    const yoff = HRY * Math.sqrt(Math.max(0, 1 - t * t));
    const zz = HC[2] - BOW * t * t - 0.014;
    limb(b, [x, HC[1] - yoff + 0.012, zz], [x, HC[1] + yoff - 0.012, zz], 0.0085, 0.0085, 4, IRON, M_IRON, false);
  }
  at(b, 0, HC[1] + HRY + 0.010, HC[2] - 0.012, 0, () => ellipsoid(b, 0.022, 0.028, 0.022, 6, 4, GOLD, M_GOLD));
  void rng;
}

// ================================================================ PLANTS
function stonePot(b, rng, x, z, r, h) {
  at(b, x, Y0, z, rng() * TAU, () => {
    // moulded foot + belly + rim band, warm cut stone
    cylinder(b, 12, r * 1.04, r * 0.90, 0.075, mulc(STONE, 0.95), M_STONE, { y0: 0 });
    lathe(b, [[r * 0.62, 0.06], [r * 0.72, 0.13], [r * 0.83, h * 0.46], [r * 0.93, h * 0.80], [r, h * 0.92], [r, h], [r * 0.90, h * 0.985]], 12, STONE, M_STONE, { smooth: true });
    at(b, 0, h * 0.55, 0, 0, () => torus(b, r * 0.90, 0.022, 12, 3, mixc(STONE, C.stonePale, 0.35), M_STONE));
    at(b, 0, h * 0.93, 0, 0, () => torus(b, r * 0.95, 0.028, 13, 3, mixc(STONE, C.stonePale, 0.5), M_STONE));
    discUp(b, r * 0.86, 12, SOIL, M_SOIL, h * 0.955);
  });
}

function tree(b, rng, x, z) {
  stonePot(b, rng, x, z, 0.55, 0.80);
  at(b, x, Y0 + 0.78, z, rng() * TAU, () => {
    const tp = [[0, 0, 0], [0.05, 0.55, 0.03], [-0.04, 1.15, 0.07], [0.04, 1.85, 0.02], [0.0, 2.55, 0.05], [-0.03, 2.68, 0.02]];
    tubePath(b, tp, [0.094, 0.080, 0.066, 0.053, 0.042, 0.033], 6, mixc(C.bronze, C.stoneWarm, 0.35), [0.05, 0.18], { caps: true });
    tubePath(b, [[0.02, 1.95, 0.03], [0.30, 2.30, 0.10], [0.42, 2.62, 0.06]], [0.030, 0.022, 0.014], 5, mixc(C.bronze, C.stoneWarm, 0.3), [0.05, 0.15], { caps: false });
    tubePath(b, [[0.0, 2.10, 0.02], [-0.30, 2.35, -0.10], [-0.46, 2.60, -0.12]], [0.028, 0.020, 0.013], 5, mixc(C.bronze, C.stoneWarm, 0.3), [0.05, 0.15], { caps: false });
    const blobs = [
      [0.02, 3.10, 0.02, 0.585, 0.477, 0.549],
      [0.40, 2.90, 0.11, 0.396, 0.342, 0.378],
      [-0.38, 2.96, -0.07, 0.423, 0.360, 0.396],
      [-0.05, 3.40, 0.08, 0.360, 0.306, 0.342],
      [0.18, 2.78, 0.32, 0.324, 0.261, 0.306],
    ];
    for (const [bx, by, bz, rx, ry, rz] of blobs) {
      at(b, bx, by, bz, rng() * TAU, () => ellipsoid(b, rx, ry, rz, 7, 5, rng() < 0.45 ? LEAF_L : mixc(LEAF, LEAF_L, 0.35), M_LEAF));
    }
    for (let i = 0; i < 6; i++) {
      const a = rng() * TAU, rr = 0.36 + rng() * 0.36;
      at(b, Math.cos(a) * rr, 3.0 + rng() * 0.48, Math.sin(a) * rr * 0.9, rng() * TAU, () => ellipsoid(b, 0.20, 0.145, 0.20, 5, 3, rng() < 0.6 ? LEAF_L : mixc(LEAF, LEAF_L, 0.55), M_LEAF));
    }
    for (let i = 0; i < 5; i++) {
      const a = rng() * TAU, rr = 0.45 + rng() * 0.32;
      at(b, Math.cos(a) * rr, 2.80 + rng() * 0.4, Math.sin(a) * rr * 0.9, 0, () => ellipsoid(b, 0.036, 0.036, 0.036, 5, 3, mixc(C.bloomYellow, C.goldBright, 0.35), M_CLOTH));
    }
  });
}

function mediumPot(b, rng, x, z, kind) {
  at(b, x, Y0, z, rng() * TAU, () => {
    if (kind === 'stone') {
      lathe(b, [[0.24, 0], [0.29, 0.04], [0.33, 0.16], [0.36, 0.30], [0.38, 0.36], [0.37, 0.385]], 10, STONE, M_STONE, { smooth: true });
      at(b, 0, 0.355, 0, 0, () => torus(b, 0.362, 0.018, 11, 3, mixc(STONE, C.stonePale, 0.4), M_STONE));
      discUp(b, 0.325, 10, SOIL, M_SOIL, 0.372);
    } else {
      lathe(b, [[0.22, 0], [0.27, 0.03], [0.32, 0.14], [0.34, 0.27], [0.33, 0.30], [0.29, 0.305]], 10, TERRA, M_TERRA, { smooth: true });
      at(b, 0, 0.275, 0, 0, () => torus(b, 0.335, 0.020, 11, 3, TERRA_L, M_TERRA));
      discUp(b, 0.30, 10, SOIL, M_SOIL, 0.290);
    }
    const top = kind === 'stone' ? 0.372 : 0.290;
    if (kind === 'topiary') {
      limb(b, [0, top, 0], [0, top + 1.05, 0], 0.045, 0.030, 4, mixc(C.bronze, C.leafDark, 0.6), [0.04, 0.14], false);
      at(b, 0, top + 1.12, 0, rng() * TAU, () => ellipsoid(b, 0.44, 0.40, 0.44, 7, 5, LEAF, M_LEAF));
      at(b, 0.10, top + 1.38, 0.06, rng() * TAU, () => ellipsoid(b, 0.30, 0.24, 0.30, 6, 4, LEAF_L, M_LEAF));
      for (let i = 0; i < 4; i++) {
        const a = rng() * TAU, rr = 0.30 + rng() * 0.22;
        at(b, Math.cos(a) * rr, top + 0.95 + rng() * 0.5, Math.sin(a) * rr, rng() * TAU, () => ellipsoid(b, 0.20, 0.15, 0.20, 5, 3, rng() < 0.35 ? LEAF_D : LEAF_L, M_LEAF));
      }
    } else if (kind === 'bush') {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU + 0.4, rr = i === 0 ? 0 : 0.16;
        at(b, Math.cos(a) * rr, top + 0.20 + (i === 0 ? 0.10 : 0), Math.sin(a) * rr, rng() * TAU, () => ellipsoid(b, 0.30 - i * 0.03, 0.24 - i * 0.02, 0.28, 6, 4, i === 0 ? LEAF : LEAF_L, M_LEAF));
      }
      flowerPatch(b, rng, 0, top + 0.10, 0, 0.24, 0.22, 7);
    } else {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU + rng();
        at(b, Math.cos(a) * 0.13, top + 0.16 + rng() * 0.14, Math.sin(a) * 0.13, rng() * TAU, () => ellipsoid(b, 0.24, 0.20, 0.22, 6, 4, rng() < 0.5 ? LEAF : LEAF_L, M_LEAF));
      }
      flowerPatch(b, rng, 0, top + 0.12, 0, 0.22, 0.20, 6, 1.2);
    }
  });
}

function flowerBed(b, rng) {
  const cx = -6.6, cz = 99.8, hw = 1.80, hd = 0.80;
  at(b, cx, Y0, cz, 0, () => {
    const K = mixc(STONE, C.stoneWarm, 0.30), KL = mixc(STONE, C.stonePale, 0.42);
    at(b, 0, 0.15, hd - 0.075, 0, () => box(b, hw * 2, 0.30, 0.15, K, M_STONE, { topCol: KL }));
    at(b, 0, 0.15, -hd + 0.075, 0, () => box(b, hw * 2, 0.30, 0.15, K, M_STONE, { topCol: KL }));
    at(b, -hw + 0.075, 0.15, 0, 0, () => box(b, 0.15, 0.30, hd * 2 - 0.30, K, M_STONE, { topCol: KL }));
    at(b, hw - 0.075, 0.15, 0, 0, () => box(b, 0.15, 0.30, hd * 2 - 0.30, K, M_STONE, { topCol: KL }));
    at(b, 0, 0.325, hd - 0.075, 0, () => box(b, hw * 2 + 0.10, 0.05, 0.24, KL, M_STONE));
    at(b, 0, 0.325, -hd + 0.075, 0, () => box(b, hw * 2 + 0.10, 0.05, 0.24, KL, M_STONE));
    at(b, -hw + 0.075, 0.325, 0, 0, () => box(b, 0.24, 0.05, hd * 2 - 0.20, KL, M_STONE));
    at(b, hw - 0.075, 0.325, 0, 0, () => box(b, 0.24, 0.05, hd * 2 - 0.20, KL, M_STONE));
    for (const sz of [-1, 1]) {
      at(b, 0, 0.235, sz * (hd - 0.008), 0, () => box(b, hw * 1.9, 0.022, 0.014, GOLD, M_GOLD));
      at(b, 0, 0.235, sz * (hd - 0.002), 0, () => box(b, hw * 1.9, 0.012, 0.008, GOLD_HI, M_GOLD));
    }
    // ---- one continuous soil/lawn surface (flat, so no gaps between cells)
    const NX = 8, NZ = 5;
    for (let j = 0; j < NZ; j++) {
      for (let i = 0; i < NX; i++) {
        const x0 = -hw + 0.15 + (i / NX) * (hw * 2 - 0.30), x1 = -hw + 0.15 + ((i + 1) / NX) * (hw * 2 - 0.30);
        const z0 = -hd + 0.15 + (j / NZ) * (hd * 2 - 0.30), z1 = -hd + 0.15 + ((j + 1) / NZ) * (hd * 2 - 0.30);
        // smooth pseudo-noise -> patches of lawn and patches of turned soil
        const n = 0.5 + 0.5 * Math.sin(i * 1.7 + j * 2.3 + 0.6);
        const cc = mixc(GRASS, SOIL_BED, 0.08 + 0.46 * n * n);
        b.quad([x0, 0.30, z0], [x1, 0.30, z0], [x1, 0.30, z1], [x0, 0.30, z1], cc, M_SOIL, [0, 1, 0]);
      }
    }
    // ---- three little shrubs + a lot of flowers
    const bushes = [[-1.10, 0.36, 0.18], [0.62, 0.34, -0.16], [1.22, 0.38, 0.20]];
    for (const [bx, by, bz] of bushes) {
      at(b, bx, by, bz, rng() * TAU, () => ellipsoid(b, 0.28, 0.22, 0.26, 6, 4, rng() < 0.5 ? LEAF : LEAF_L, M_LEAF));
      leafClump(b, rng, bx + 0.02, by + 0.14, bz, 0.14);
      leafClump(b, rng, bx - 0.10, by + 0.10, bz + 0.08, 0.11);
    }
    flowerPatch(b, rng, 0, 0.30, 0, 1.52, 0.56, 22, 1.45);
    for (let i = 0; i < 8; i++) {
      const gx = (rng() - 0.5) * 2 * (hw - 0.30), gz = (rng() - 0.5) * 2 * (hd - 0.30);
      at(b, gx, 0.31, gz, rng() * TAU, () => ellipsoid(b, 0.09, 0.06, 0.09, 4, 2, rng() < 0.5 ? GRASS : LEAF_L, M_LEAF));
    }
  });
}

function smallPot(b, rng, x, z) {
  at(b, x, Y0, z, rng() * TAU, () => {
    lathe(b, [[0.145, 0], [0.170, 0.02], [0.195, 0.10], [0.215, 0.22], [0.205, 0.235], [0.175, 0.238]], 9, TERRA, M_TERRA, { smooth: true });
    at(b, 0, 0.215, 0, 0, () => torus(b, 0.208, 0.014, 10, 3, TERRA_L, M_TERRA));
    discUp(b, 0.180, 9, SOIL, M_SOIL, 0.222);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + rng();
      at(b, Math.cos(a) * 0.06, 0.27 + rng() * 0.06, Math.sin(a) * 0.06, rng() * TAU, () => ellipsoid(b, 0.12, 0.10, 0.11, 5, 3, rng() < 0.5 ? LEAF : LEAF_L, M_LEAF));
    }
    flowerPatch(b, rng, 0, 0.30, 0, 0.13, 0.12, 4);
  });
}

function longPlanter(b, rng, cx, cz, len) {
  const hw = len / 2, hd = 0.575, h = 0.55;
  at(b, cx, Y0, cz, 0, () => {
    const K = mixc(STONE, C.stonePale, 0.22), KL = mixc(STONE, C.stonePale, 0.48);
    at(b, 0, h / 2, 0, 0, () => box(b, hw * 2, h, hd * 2, K, M_STONE, { topCol: mulc(K, 1.02) }));
    at(b, 0, h + 0.035, 0, 0, () => box(b, hw * 2 + 0.16, 0.07, hd * 2 + 0.16, KL, M_STONE, { topCol: mulc(KL, 1.03) }));
    at(b, 0, 0.10, 0, 0, () => box(b, hw * 2 + 0.06, 0.12, hd * 2 + 0.06, K, M_STONE));
    for (const sz of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        at(b, (k - 1) * (hw * 0.62), h * 0.52, sz * (hd + 0.004), 0, () => box(b, hw * 0.44, h * 0.42, 0.018, mulc(K, 0.94), M_STONE));
        at(b, (k - 1) * (hw * 0.62), h * 0.52, sz * (hd + 0.012), 0, () => box(b, hw * 0.34, h * 0.30, 0.012, mulc(K, 0.88), M_STONE));
      }
    }
    at(b, 0, 0.185, 0, 0, () => box(b, hw * 2 + 0.085, 0.026, hd * 2 + 0.085, GOLD, M_GOLD));
    at(b, 0, h + 0.048, 0, 0, () => box(b, hw * 2 - 0.10, 0.04, hd * 2 - 0.10, SOIL, M_SOIL, { topCol: mixc(SOIL, GRASS, 0.45) }));
    // ---- clipped hedge: overlapping blobs so it reads as one mass
    const n = 10;
    for (let i = 0; i < n; i++) {
      const hx = -hw + 0.42 + (i / (n - 1)) * (hw * 2 - 0.84);
      const g = i % 3 === 0 ? LEAF_L : (i % 3 === 1 ? mixc(LEAF, LEAF_L, 0.4) : mixc(LEAF, LEAF_L, 0.65));
      at(b, hx, h + 0.32, (i % 2) * 0.06 - 0.03, rng() * TAU, () => ellipsoid(b, 0.66, 0.34 + (i % 3) * 0.03, 0.47, 6, 4, g, M_LEAF));
      at(b, hx, h + 0.55, -0.02, rng() * TAU, () => ellipsoid(b, 0.40, 0.20, 0.29, 5, 3, rng() < 0.6 ? LEAF_L : mixc(LEAF, LEAF_L, 0.7), M_LEAF));
    }
    // ---- a bold flower border spilling over both long faces, below the coping
    for (const sz of [-1, 1]) {
      for (let i = 0; i < 15; i++) {
        const fx = -hw + 0.40 + (i / 14) * (hw * 2 - 0.80) + (rng() - 0.5) * 0.12;
        const fz = sz * (hd - 0.02);
        const fy = h * 0.50 + (i % 3) * 0.05 + (i % 2) * 0.04;
        leafClump(b, rng, fx, fy + 0.07, sz * (hd - 0.10), 0.11 + (i % 2) * 0.04);
        for (let q = 0; q < 2; q++) {
          const bx = fx + (rng() - 0.5) * 0.18;
          const by = fy + 0.13 + q * 0.075 + rng() * 0.04;
          const bz = fz + sz * 0.055;
          limb(b, [fx, fy + 0.05, sz * (hd - 0.10)], [bx, by - 0.03, bz], 0.006, 0.005, 3, LEAF_D, M_LEAF, false);
          leafClump(b, rng, bx, by - 0.045, bz - sz * 0.012, 0.05 + rng() * 0.025);
          bloom(b, rng, bx, by, bz, 0.062 + rng() * 0.034, BLOOMS[(i * 2 + q + (sz > 0 ? 3 : 0)) % BLOOMS.length]);
        }
      }
    }
    // a few blossoms tucked between the hedge blobs on top
    for (let i = 0; i < 6; i++) {
      const fx = -hw + 0.8 + i * ((hw * 2 - 1.6) / 5) + (rng() - 0.5) * 0.2;
      leafClump(b, rng, fx, h + 0.26, (i % 2) * 0.2 - 0.10, 0.10);
      bloom(b, rng, fx, h + 0.37 + rng() * 0.05, (i % 2) * 0.2 - 0.12, 0.045 + rng() * 0.015, BLOOMS[(i * 3 + 2) % BLOOMS.length]);
    }
  });
}

// ================================================================ ENTRY
export function buildTerraceSet(b, ctx, rng) {
  b.note && b.note('terrace-set');
  // ---- easel + kit (beside the girl but clear of her)
  buildEasel(b, rng);
  buildPaintKit(b, rng);
  // ---- tea table + three chairs
  buildTable(b, rng);
  const r = 1.32;
  for (const a of [-0.45, 1.75, 3.75]) {
    const cx = TABLE.x + Math.cos(a) * r;
    const cz = TABLE.z + Math.sin(a) * r;
    const yaw = Math.atan2(Math.cos(a), -Math.sin(a));   // local +Z faces the table
    at(b, cx, Y0, cz, yaw, () => chair(b, rng));
  }
  // ---- plants
  tree(b, rng, -9.85, 95.9);   // nudged 0.5 m off the given point so it frames, not blocks, the wide view
  mediumPot(b, rng, -4.1, 94.8, 'bush');
  mediumPot(b, rng, -10.5, 90.0, 'topiary');
  mediumPot(b, rng, -3.3, 100.6, 'flower');
  flowerBed(b, rng);
  smallPot(b, rng, -12.0, 104.2);
  smallPot(b, rng, -7.0, 106.3);
  smallPot(b, rng, -1.6, 108.6);
  smallPot(b, rng, 4.0, 111.0);
  // round 6: the palace wings now open their own doors at |x| 25.7..33.3 / z=124,
  // so the old 11 m palace-front planters are split into four shorter ones that
  // flank each doorway and leave its threshold/steps clear.
  longPlanter(b, rng, -22.9, 122.3, 3.8);
  longPlanter(b, rng, 22.9, 122.3, 3.8);
  void ctx;
}
