// CATHEDRAL — round 7 rebuild: hollow, enterable, axis aligned. OWNER: agent "cathedral".
//
//   buildCathedral(b, ctx, rng) -> void     called by world.js (tag 'cathedral')
//
// CONTRACT (lead, do not change without telling the lead):
//  * Anchor L.cathedral = { x: -96, z: -24, rot: 0 } — built in LOCAL coordinates that
//    equal world axes (rot = 0). Local z = 0 is the west facade plane (world z = -24);
//    the parvis runs local z 0 .. +12.6 (world -24 .. -11.4); nave local z -9 .. -73
//    (world -33 .. -97), apse centre local (0,-73).
//  * Footprint MUST stay inside world x [-125,-67], z [-112,-11].
//  * Round-4..6 silhouette kept: twin west towers (slate spires, gold finials to y~123),
//    facade gable, rose window r 8.2 @ y 33.4, crossing tower with four gold clock dials,
//    fleche to y~111, nave ridge y 57, flying buttresses, semicircular apse.
//    The old exterior code lived in _backup/2026-11-22_r7pre/cielo/src/landmark.js
//    (function buildCathedral); this module rebuilds it as a SHELL around a real interior.
//  * Doors are REAL openings, all open: west portal 9.4 x 11.2 m through the facade,
//    two side portals 5.6 x 11.2 m at x = +-14.3. Flying in from +Z at y 3..9 reaches
//    the nave without hitting a single face.
//  * Interior: floor y 0.8, nave clear to y 46 (vault apex), aisles to y 25 (aces 25),
//    apse r 12. Nave arcade of clustered piers + pointed arches, ribbed vault,
//    glowing clerestory, the rose window seen from inside, apse altar + gold reredos +
//    stained glass, choir stalls, pews, side chapels, organ loft, chandeliers/candles,
//    banners, statues, marble floor, a narthex and a baptismal font.
//  * Determinism: local mulberry32 only, never the shared rng argument.
//  * Budget 120k..220k tris. Check with tools/cathedral-check.mjs.
import { mulberry32, TAU, norm, m4 } from './math.js';
import { box, cylinder, torus, rgb, mulc, mixc, bar3, lathe, sphere } from './geo.js';
import { inFrame, star, extrudeXY } from './lib3d.js';
import { L } from './layout.js';
import { C } from './palette.js';

// ------------------------------------------------------------------ plan (local)
const A = L.cathedral;
const FL = 0.8;              // nave floor
const NX = 11;               // nave half width (interior)
const AW = 12.4;             // arcade wall: aisle-facing face
const AXO = 21.0;            // aisle outer wall, inner face
const AXE = 21.9;            // aisle outer wall, outer face
const ASC = 25.0;            // aisle ceiling
const VSP = 33.0;            // nave vault springline
const VAP = 46.0;            // nave vault apex
const ZO = 0.0;              // west facade plane (outer)
const ZF = -9.0;             // west block inner face = nave front
const ZB = -73.0;            // apse centre / nave east end
const PZ = [-9.0, -19.6667, -30.3333, -41.0, -51.6667, -62.3333, -73.0];
const BAY = 10.6667, ARHW = 5.3333, ARSP = 11.0, ARAP = 16.3333;
const TX = 17.8;             // tower centre x  (11 .. 24.6)
const TIX = 11.0, TOX = 24.6;
const TZ0 = 0.0, TZ1 = -9.0; // tower depth (same as the west block)
const TWT = 1.8;             // tower wall thickness
const ROSE_Y = 33.4, ROSE_R = 8.2;
const PAR_Z = 12.6;          // parvis front edge (world -11.4)
// portal
const PHW = 4.7, PSPR = 7.3, PAPEX = 12.0;
// side portals
const SHW = 2.8, SSPR = 9.2, SAPEX = 12.0, SPX = 14.3;
// apse
const ARI = 11.0, ARO = 12.2;

// ------------------------------------------------------------------ colour
const STONE = C.stonePale, STONE_W = C.stoneWarm, STONE_D = C.stoneDark;
const STONE_C = rgb('#b3a88e');          // interior stone (linear ~0.42-0.50)
const STONE_I = rgb('#c3b79b');          // interior stone, lighter
const MARBLE = C.marble, MARBLE_S = C.marbleShade;
const GOLD = C.gold, GOLD_B = C.goldBright, GOLD_D = rgb('#a5792f');
const SLATE = C.slate, SLATE_D = C.slateDark, SLATE_L = C.slateLight;
const GLASS_D = rgb('#40608c'), DOOR = rgb('#6d4a26'), DOOR_D = rgb('#4a3018');
const BLUE_D = rgb('#1b2552'), BLUE_M = rgb('#2c3f7c'), NAVY = rgb('#141b38');
const WOOD = rgb('#6d4a2a'), WOOD_D = rgb('#47301c'), WOOD_L = rgb('#8a6136');
const RED_C = rgb('#8c2b32'), RED_V = rgb('#a83840'), IVORY = rgb('#efe7d3');
const CANDLE = rgb('#f6e2b4'), FLAME = rgb('#ffd48a');
const SG = [rgb('#2f6fd0'), rgb('#c8442e'), rgb('#e8b45f'), rgb('#4a9a5e'), rgb('#8a55c0'), rgb('#3fa8c8'), rgb('#d8663a')];
const SG_W = [rgb('#f2c14e'), rgb('#c8442e'), rgb('#3f7fd0'), rgb('#4a9a5e')];

// ------------------------------------------------------------------ materials [emissive, gloss]
const M_EXT = [0.09, 0.10];
const M_EXT2 = [0.08, 0.20];
const M_IN = [0.105, 0.11];
const M_IN2 = [0.115, 0.24];
const M_GOLD = [0.10, 0.84];
const M_GOLDI = [0.24, 0.72];
const M_GOLDB = [0.36, 0.70];
const M_GLASS_E = [0.30, 0.70];
const M_GLASS_I = [0.62, 0.22];
const M_SLATE = [0.03, 0.30];
const M_WOOD = [0.15, 0.12];
const M_WOODD = [0.13, 0.10];
const M_CLOTH = [0.14, 0.05];
const M_CANDLE = [0.64, 0.06];
const M_FLAME = [0.88, 0.04];
const M_POLISH = [0.17, 0.36];
const M_DARKGL = [0.22, 0.72];
const M_PAINT = [0.115, 0.08];

// ------------------------------------------------------------------ tiny helpers
const T = (x, y, z) => m4.translate([x, y, z]);
const RY = (a) => m4.rotY(a);
const RZ = (a) => m4.rotZ(a);
function put(b, x, y, z, fn) { b.push(T(x, y, z)); fn(); b.pop(); }
function putR(b, x, y, z, yaw, fn) { b.push(T(x, y, z)); b.push(RY(yaw)); fn(); b.pop(); b.pop(); }
function putRZ(b, x, y, z, ang, fn) { b.push(T(x, y, z)); b.push(RZ(ang)); fn(); b.pop(); b.pop(); }

const W = (lx, ly, lz) => [A.x + lx, ly, A.z + lz];   // local -> world for lights

// pointed arch: rise above the spring at |x| from centre
function archY(hw, rise, x) {
  const rr = (hw * hw + rise * rise) / (2 * hw), a = rr - hw;
  const d = Math.abs(x) + a;
  return Math.sqrt(Math.max(0, rr * rr - d * d));
}
// pointed arch: half width at height y above the spring
function archHW(hw, rise, y) {
  const rr = (hw * hw + rise * rise) / (2 * hw), a = rr - hw;
  const q = rr * rr - y * y;
  return q <= 0 ? 0 : Math.max(0, -a + Math.sqrt(q));
}
const V_R = (NX * NX + (VAP - VSP) * (VAP - VSP)) / (2 * NX);
const V_A = V_R - NX;
function vaultY(x) { const d = Math.abs(x) + V_A; return VSP + Math.sqrt(Math.max(0, V_R * V_R - d * d)); }
function vaultN(x) {
  const d = Math.abs(x) + V_A, q = Math.max(1e-3, V_R * V_R - d * d);
  const dy = -(x < 0 ? -1 : 1) * d / Math.sqrt(q);
  return norm([dy, -1, 0]);
}

// flat annulus sector in the XY plane facing +Z
function ringZ(b, cx, cy, z, R, w, d, col, mat, seg = 12, a0 = 0, a1 = TAU) {
  const rI = Math.max(0.02, R - w / 2), rO = R + w / 2;
  const zf = z + d / 2, zb = z - d / 2;
  const NF = [0, 0, 1], NB = [0, 0, -1];
  for (let i = 0; i < seg; i++) {
    const t0 = a0 + (a1 - a0) * (i / seg), t1 = a0 + (a1 - a0) * ((i + 1) / seg);
    const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
    const o0 = [cx + c0 * rO, cy + s0 * rO], o1 = [cx + c1 * rO, cy + s1 * rO];
    const i0 = [cx + c0 * rI, cy + s0 * rI], i1 = [cx + c1 * rI, cy + s1 * rI];
    b.quad([i0[0], i0[1], zf], [o0[0], o0[1], zf], [o1[0], o1[1], zf], [i1[0], i1[1], zf], col, mat, NF);
    b.quad([i1[0], i1[1], zb], [o1[0], o1[1], zb], [o0[0], o0[1], zb], [i0[0], i0[1], zb], mulc(col, 0.84), mat, NB);
  }
}
function discZ(b, cx, cy, z, r, col, mat, seg = 16) {
  const N = [0, 0, 1];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    b.tri([cx, cy, z], [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, z],
      [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, z], col, mat, N, N, N);
  }
}
function discY(b, cx, cy, cz, r, col, mat, seg = 16, ny = 1) {
  const N = [0, ny, 0];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    b.tri([cx, cy, cz], [cx + Math.cos(a0) * r, cy, cz + Math.sin(a0) * r],
      [cx + Math.cos(a1) * r, cy, cz + Math.sin(a1) * r], col, mat, N, N, N);
  }
}
function ringY(b, cx, cy, cz, r0, r1, seg, col, mat, ny = 1) {
  const N = [0, ny, 0];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    b.quad([cx + Math.cos(a0) * r0, cy, cz + Math.sin(a0) * r0],
      [cx + Math.cos(a1) * r0, cy, cz + Math.sin(a1) * r0],
      [cx + Math.cos(a1) * r1, cy, cz + Math.sin(a1) * r1],
      [cx + Math.cos(a0) * r1, cy, cz + Math.sin(a0) * r1], col, mat, N);
  }
}
function cone(b, r, h, y0, col, mat, seg = 8) {
  put(b, 0, y0, 0, () => cylinder(b, seg, r, 0.10, h, col, mat, { caps: true, y0: 0 }));
}
// gold band around a cone at height y (r from the cone slope)
function coneBand(b, r0, h, y, w, col, mat, seg = 8) {
  const rr = r0 * (1 - y / h);
  b.push(T(0, y, 0));
  cylinder(b, seg, rr, rr, w, col, mat, { caps: false, y0: -w / 2 });
  b.pop();
}
// round column, base y=0
function columnRound(b, h, r, col, mat, seg = 8) {
  put(b, 0, 0.28, 0, () => box(b, r * 3.0, 0.56, r * 3.0, mulc(col, 0.95), mat));
  put(b, 0, 0.34, 0, () => cylinder(b, seg, r * 1.15, r, 0.34, mulc(col, 1.02), mat, { y0: 0 }));
  put(b, 0, 0.68, 0, () => cylinder(b, seg, r, r * 0.94, h - 1.05, col, mat, { y0: 0 }));
  put(b, 0, h - 0.37, 0, () => cylinder(b, seg, r * 1.05, r * 1.25, 0.37, mulc(col, 1.04), mat, { y0: 0 }));
  put(b, 0, h, 0, () => box(b, r * 2.8, 0.22, r * 2.8, mulc(col, 1.06), mat));
}
// big gold clock dial in the XY plane, centre at origin, facing +Z
function clockDial(b, R) {
  discZ(b, 0, 0, 0.06, R * 0.95, GLASS_D, [0.16, 0.6], 14);
  ringZ(b, 0, 0, 0.16, R, R * 0.20, 0.8, GOLD_B, M_GOLD, 14);
  ringZ(b, 0, 0, 0.10, R * 0.62, R * 0.05, 0.34, GOLD, M_GOLD, 10);
  const N = [0, 0, 1];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU, c = Math.cos(a), s = Math.sin(a), hl = R * 0.06;
    const r0 = R * 0.74, r1 = R * 0.87;
    b.quad([c * r0 - s * hl, s * r0 + c * hl, 0.28], [c * r0 + s * hl, s * r0 - c * hl, 0.28],
      [c * r1 + s * hl, s * r1 - c * hl, 0.28], [c * r1 - s * hl, s * r1 + c * hl, 0.28], GOLD_B, M_GOLD, N);
  }
  const hand = (ang, len, wd, zz) => {
    const c = Math.cos(ang), s = Math.sin(ang), hw = wd / 2;
    b.quad([-s * hw, c * hw, zz], [s * hw, -c * hw, zz], [c * len + s * hw, s * len - c * hw, zz],
      [c * len - s * hw, s * len + c * hw, zz], GOLD_B, M_GOLD, N);
  };
  hand(Math.PI * 0.72, R * 0.52, R * 0.10, 0.34);
  hand(Math.PI * 0.08, R * 0.78, R * 0.075, 0.38);
  discZ(b, 0, 0, 0.42, R * 0.11, GOLD_B, M_FLAME, 8);
}
// gold cross / finial
function finialCross(b, x, y, z, s, col = GOLD_B, mat = M_GOLDB) {
  put(b, x, y, z, () => {
    box(b, 0.30 * s, 3.0 * s, 0.30 * s, col, mat);
    box(b, 1.65 * s, 0.30 * s, 0.30 * s, col, mat);
    box(b, 0.55 * s, 0.22 * s, 0.55 * s, GOLD, M_GOLD);
    sphere(b, 0.36 * s, col, mat, { rings: 3, seg: 6, jitter: 0.02 });
  });
}
// voussoir ring (the stones that read as a gothic arch border) in the XY plane
function voussoirs(b, hw, rise, z, depth, bw, bh, col, mat, n = 13, yBase = 0) {
  const rr = (hw * hw + rise * rise) / (2 * hw), a = rr - hw, pa = Math.atan2(rise, a);
  for (let i = 0; i < n; i++) {
    for (const s of [-1, 1]) {
      const p = pa * ((i + 0.5) / n);
      const px = s * (-a + rr * Math.cos(p));
      const py = yBase + rr * Math.sin(p);
      putRZ(b, px, py, z, s * p - Math.PI / 2 * s, () => box(b, bw, bh, depth, col, mat));
    }
  }
}
// stone frame band following a pointed arch (annulus sector), in the XY plane facing +Z
function archFrame(b, hw, rise, z, fw, d, col, mat, seg = 12, yBase = 0) {
  const rr = (hw * hw + rise * rise) / (2 * hw), a = rr - hw, pa = Math.atan2(rise, a);
  const zf = z + d / 2, zb2 = z - d / 2;
  for (let i = 0; i < seg; i++) {
    const p0 = pa * (i / seg), p1 = pa * ((i + 1) / seg);
    for (const s of [-1, 1]) {
      const P = (p, rad) => [s * (-a + rad * Math.cos(p)), yBase + rad * Math.sin(p)];
      const i0 = P(p0, rr), i1 = P(p1, rr), o0 = P(p0, rr + fw), o1 = P(p1, rr + fw);
      b.quad([i0[0], i0[1], zf], [o0[0], o0[1], zf], [o1[0], o1[1], zf], [i1[0], i1[1], zf], col, mat, [0, 0, 1]);
      b.quad([i1[0], i1[1], zb2], [o1[0], o1[1], zb2], [o0[0], o0[1], zb2], [i0[0], i0[1], zb2], mulc(col, 0.84), mat, [0, 0, -1]);
      b.quad([i0[0], i0[1], zf], [i0[0], i0[1], zb2], [i1[0], i1[1], zb2], [i1[0], i1[1], zf], mulc(col, 0.9), mat);
      b.quad([o0[0], o0[1], zf], [o1[0], o1[1], zf], [o1[0], o1[1], zb2], [o0[0], o0[1], zb2], mulc(col, 0.7), mat);
    }
  }
}
// wall panel in the plane z, x0..x1, y0..y1, with a pointed-arch hole (bottom yBase)
// inside |x - xc| < hw. Builds the panel as vertical strips.
function archWallZ(b, x0, x1, y0, y1, xc, hw, rise, yBase, z, col, mat, N, seg = 22) {
  const yBaseC = Math.max(y0, yBase);
  for (let i = 0; i < seg; i++) {
    const xa = x0 + ((x1 - x0) * i) / seg, xb = x0 + ((x1 - x0) * (i + 1)) / seg;
    const xm = (xa + xb) / 2;
    let ya = y0, yb = y0;
    if (Math.abs(xm - xc) < hw) {
      ya = Math.max(y0, yBaseC + archY(hw, rise, xa - xc));
      yb = Math.max(y0, yBaseC + archY(hw, rise, xb - xc));
    }
    b.quad([xa, ya, z], [xb, yb, z], [xb, y1, z], [xa, y1, z], col, mat, N);
  }
}
// pointed window: bottom-centre at origin in the XY plane, facing +Z
function lancetWin(b, hw, yb, ys, ya, z, gmat, fmat, fw, fcol, pal, opts = {}) {
  const N = [0, 0, 1];
  const rows = opts.rows ?? 3, cols = Math.max(1, opts.cols ?? 2);
  const rise = ya - ys;
  for (let c = 0; c < cols; c++) {
    const x0 = -hw + (2 * hw * c) / cols, x1 = -hw + (2 * hw * (c + 1)) / cols;
    for (let r = 0; r < rows; r++) {
      const y0 = yb + ((ys - yb) * r) / rows, y1 = yb + ((ys - yb) * (r + 1)) / rows;
      b.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], pal[(c * 3 + r) % pal.length], gmat, N);
    }
  }
  const sg = 9;
  for (let i = 0; i < sg; i++) {
    const x0 = -hw + (2 * hw * i) / sg, x1 = -hw + (2 * hw * (i + 1)) / sg;
    const y0 = ys + archY(hw, rise, x0), y1 = ys + archY(hw, rise, x1);
    b.tri([0, ya, z], [x0, y0, z], [x1, y1, z], pal[i % pal.length], gmat, N, N, N);
  }
  if (opts.mullions !== false) {
    const mz = z + 0.04;
    for (let c = 1; c < cols; c++) {
      const x = -hw + (2 * hw * c) / cols;
      b.quad([x - 0.07, yb, mz], [x + 0.07, yb, mz], [x + 0.07, ys, mz], [x - 0.07, ys, mz], fcol, fmat, N);
    }
    for (let r = 1; r < rows; r++) {
      const y = yb + ((ys - yb) * r) / rows;
      b.quad([-hw, y - 0.06, mz], [hw, y - 0.06, mz], [hw, y + 0.06, mz], [-hw, y + 0.06, mz], fcol, fmat, N);
    }
  }
  // stone frame: jambs + arch band + sill
  b.quad([-hw - fw, yb, z], [-hw, yb, z], [-hw, ys, z], [-hw - fw, ys, z], fcol, fmat, N);
  b.quad([hw, yb, z], [hw + fw, yb, z], [hw + fw, ys, z], [hw, ys, z], fcol, fmat, N);
  archFrame(b, hw, rise, z, fw, 0.20, fcol, fmat, 9, ys);
  b.quad([-hw - fw, yb - 0.22, z], [hw + fw, yb - 0.22, z], [hw + fw, yb, z], [-hw - fw, yb, z], mulc(fcol, 1.06), fmat, N);
}
// small candle (stick + flame); returns nothing
function candle(b, x, y, z, h, s = 1) {
  put(b, x, y, z, () => {
    cylinder(b, 5, 0.075 * s, 0.07 * s, h, CANDLE, M_CANDLE, { caps: true, y0: 0 });
    cylinder(b, 4, 0.075 * s, 0.012 * s, 0.24 * s, FLAME, M_FLAME, { caps: true, y0: h });
  });
}
// a glowing lantern billboard + a real little flame
function flameAt(b, ctx, lx, ly, lz, size, alpha = 0.6, col = null) {
  if (ctx && ctx.lanterns) ctx.lanterns.push({ p: W(lx, ly, lz), size, rot: (lx * 1.7 + lz * 0.9) % 6.28, alpha, shape: 1, col: col || C.goldBright });
}

// ================================================================ parvis
function buildParvis(b, R) {
  const W0 = 26.0;
  // platform, then three steps down toward +Z
  put(b, 0, 0.40, 6.0, () => box(b, 2 * W0, 0.80, 12.0, STONE_W, M_EXT));
  put(b, 0, 0.27, 12.35, () => box(b, 2 * W0 + 0.6, 0.54, 0.75, STONE, M_EXT));
  put(b, 0, 0.13, 12.62, () => box(b, 2 * W0 + 1.2, 0.26, 0.58, STONE, M_EXT));
  // kerb + gold inlay line
  put(b, 0, 0.82, 6.3, () => box(b, 2 * W0 - 1.2, 0.06, 12.2, MARBLE, M_EXT2));
  for (const sx of [-1, 1]) {
    put(b, sx * (W0 - 1.6), 0.95, 6.3, () => box(b, 0.5, 0.34, 12.2, GOLD, M_GOLD));
  }
  // stepped plinth under the facade
  for (let i = 0; i < 3; i++) put(b, 0, FL - 0.1 - i * 0.1, -4.6, () => box(b, 2 * (TOX + 1.2 - i * 0.9), 0.2, 9.4 - i * 1.2, STONE, M_EXT));
  // parvis lamp posts
  for (const sx of [-1, 1]) for (const pz of [2.0, 9.4]) {
    const x = sx * (W0 - 2.6);
    put(b, x, 4.6, pz, () => {
      cylinder(b, 8, 0.34, 0.24, 0.7, STONE_D, M_EXT, { caps: true, y0: 0 });
      cylinder(b, 6, 0.14, 0.10, 4.2, C.iron, M_EXT2, { caps: true, y0: 0.7 });
      sphere(b, 0.36, GOLD_B, M_GOLDB, { rings: 3, seg: 6, jitter: 0.02 });
    });
  }
  void R;
}

// ================================================================ floor (interior)
function buildFloor(b, R) {
  const y = FL + 0.01;
  // nave: 0.75 m checkerboard marble with a red processional carpet down the axis
  const x0 = -NX + 0.2, x1 = NX - 0.2;
  const nx = 34, nz = 94;
  const dx = (x1 - x0) / nx, dz = (PZ[0] - ZB) / nz;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const xa = x0 + i * dx, xb = xa + dx, za = PZ[0] - j * dz, zb = za - dz;
      const dark = (i + j) % 2 === 0;
      const v = 0.92 + R() * 0.14;
      let col = mulc(dark ? rgb('#3a3a48') : rgb('#ddd6c4'), v);
      b.quad([xa, y, za], [xb, y, za], [xb, y, zb], [xa, y, zb], col, M_POLISH, [0, 1, 0]);
    }
  }
  // carpet
  const cy = y + 0.012;
  b.quad([-2.4, cy, PZ[0] - 1.0], [2.4, cy, PZ[0] - 1.0], [2.4, cy, -57.0], [-2.4, cy, -57.0], RED_C, M_CLOTH, [0, 1, 0]);
  for (const sx of [-1, 1]) b.quad([sx * 2.4, cy, PZ[0] - 1.0], [sx * 2.56, cy, PZ[0] - 1.0], [sx * 2.56, cy, -57.0], [sx * 2.4, cy, -57.0], GOLD, M_GOLD, [0, 1, 0]);
  for (let i = 0; i < 20; i++) {
    const zc = PZ[0] - 2.0 - i * 2.75;
    const N = [0, 1, 0];
    b.tri([0, cy + 0.008, zc - 0.55], [0.75, cy + 0.008, zc], [0, cy + 0.008, zc + 0.55], GOLD_B, M_GOLDB, N, N, N);
    b.tri([0, cy + 0.008, zc - 0.55], [0, cy + 0.008, zc + 0.55], [-0.75, cy + 0.008, zc], GOLD_B, M_GOLDB, N, N, N);
  }
  // aisles: larger marble slabs + mosaic border
  for (const sx of [-1, 1]) {
    const ax0 = sx > 0 ? AW + 0.1 : -AXO + 0.1, ax1 = sx > 0 ? AXO - 0.1 : -AW - 0.1;
    const na = 12, nb = 44;
    for (let j = 0; j < nb; j++) {
      for (let i = 0; i < na; i++) {
        const xa = ax0 + ((ax1 - ax0) * i) / na, xb = ax0 + ((ax1 - ax0) * (i + 1)) / na;
        const za = PZ[0] - ((PZ[0] - ZB) * j) / nb, zb = PZ[0] - ((PZ[0] - ZB) * (j + 1)) / nb;
        const dark = (i + j) % 2 === 0;
        b.quad([xa, y, za], [xb, y, za], [xb, y, zb], [xa, y, zb], mulc(dark ? rgb('#4a4453') : rgb('#cdc5b2'), 0.94 + R() * 0.12), M_POLISH, [0, 1, 0]);
      }
    }
    // mosaic strip along the aisle centre
    const mc = sx * (AW + AXO) * 0.5;
    b.quad([mc - 1.3, y + 0.02, PZ[0] - 1], [mc + 1.3, y + 0.02, PZ[0] - 1], [mc + 1.3, y + 0.02, ZB + 1], [mc - 1.3, y + 0.02, ZB + 1], BLUE_D, M_POLISH, [0, 1, 0]);
    for (let i = 0; i < 22; i++) {
      const zc = PZ[0] - 1.6 - i * 2.85;
      discY(b, mc, y + 0.028, zc, 0.5, 8, i % 2 ? GOLD_D : GOLD, M_GOLDB);
    }
    // gold kerb lines
    for (const off of [AW + 0.35, AXO - 0.45]) {
      b.quad([sx * off, y + 0.03, PZ[0] - 0.6], [sx * (off + 0.2), y + 0.03, PZ[0] - 0.6], [sx * (off + 0.2), y + 0.03, ZB + 0.6], [sx * off, y + 0.03, ZB + 0.6], GOLD, M_GOLD, [0, 1, 0]);
    }
  }
  // portal threshold + a rose medallion in the nave
  b.quad([-8.0, y, ZF + 9.0], [8.0, y, ZF + 9.0], [8.0, y, ZF - 0.2], [-8.0, y, ZF - 0.2], MARBLE, M_POLISH, [0, 1, 0]);
  ringY(b, 0, y + 0.02, PZ[0] - 5.5, 3.4, 4.0, 32, GOLD, M_GOLDB);
  ringY(b, 0, y + 0.02, PZ[0] - 5.5, 2.0, 2.6, 24, RED_C, M_CLOTH);
  discY(b, 0, y + 0.03, PZ[0] - 5.5, 2.0, 24, MARBLE, M_POLISH);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const N = [0, 1, 0];
    b.tri([0, y + 0.04, PZ[0] - 5.5], [Math.cos(a) * 1.85, y + 0.04, PZ[0] - 5.5 + Math.sin(a) * 1.85],
      [Math.cos(a + 0.16) * 0.4, y + 0.04, PZ[0] - 5.5 + Math.sin(a + 0.16) * 0.4], GOLD_B, M_GOLDB, N, N, N);
  }
  // apse floor: raised sanctuary platform
  put(b, 0, FL + 0.18, ZB - 4.0, () => cylinder(b, 24, 10.6, 10.6, 0.36, MARBLE, M_POLISH, { caps: true, y0: 0 }));
  discY(b, 0, FL + 0.37, ZB - 4.0, 10.2, 24, MARBLE, M_POLISH);
  ringY(b, 0, FL + 0.39, ZB - 4.0, 8.4, 9.0, 30, GOLD, M_GOLDB);
  // sanctuary mosaic stars
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    discY(b, Math.cos(a) * 6.6, FL + 0.4, ZB - 4.0 + Math.sin(a) * 6.6, 0.55, 6, i % 2 ? GOLD : RED_V, M_GOLDB);
  }
}

// ================================================================ west front (facade + portals)
function buildWestFront(b, R, ctx) {
  const zf = ZO, zb = ZF;
  const N0 = [0, 0, 1], NB = [0, 0, -1];
  const FAC_TOP = 42.0;
  // --- central bay solid faces beside the portal (x -11..-4.7 and 4.7..11)
  for (const sx of [-1, 1]) {
    const xa = sx * PHW, xb = sx * NX;
    // outer face
    b.quad([Math.min(xa, xb), FL, zf], [Math.max(xa, xb), FL, zf], [Math.max(xa, xb), FAC_TOP, zf], [Math.min(xa, xb), FAC_TOP, zf], STONE, M_EXT, N0);
    // inner face (nave west wall)
    b.quad([Math.max(xa, xb), FL, zb], [Math.min(xa, xb), FL, zb], [Math.min(xa, xb), FAC_TOP, zb], [Math.max(xa, xb), FAC_TOP, zb], STONE_C, M_IN, NB);
  }
  // --- outer face above the portal: strips following the arch
  archWallZ(b, -NX, NX, FL, FAC_TOP, 0, PHW, PAPEX - PSPR, PSPR, zf, STONE, M_EXT, N0, 26);
  // --- inner face above the portal, up to the vault profile
  for (let i = 0; i < 26; i++) {
    const xa = -NX + (2 * NX * i) / 26, xb = -NX + (2 * NX * (i + 1)) / 26;
    const xm = (xa + xb) / 2;
    const top = vaultY(xm);
    const yb0 = Math.abs(xm) < PHW ? PSPR + archY(PHW, PAPEX - PSPR, xm) : FL;
    b.quad([xb, yb0, zb], [xa, yb0, zb], [xa, top, zb], [xb, top, zb], STONE_C, M_IN, NB);
  }
  // --- the portal tunnel: side walls, arch soffit, floor, door leaves
  for (const sx of [-1, 1]) {
    const x = sx * PHW;
    b.quad([x, FL, zb], [x, FL, zf], [x, PSPR, zf], [x, PSPR, zb], mulc(STONE, 0.94), M_IN, [-sx, 0, 0]);
    // jambs outside (exterior)
    b.quad([x - sx * 0.0, FL, zf - 0.02], [x - sx * 0.9, FL, zf - 0.02], [x - sx * 0.9, PSPR + 1.2, zf - 0.02], [x, PSPR + 1.2, zf - 0.02], STONE, M_EXT2, N0);
    // open door leaf, flat against the tunnel wall
    put(b, x - sx * 0.22, FL + 4.8, (zf + zb) * 0.5, () => {
      box(b, 0.16, 9.6, 8.0, DOOR, M_WOOD);
      box(b, 0.06, 9.0, 7.4, DOOR_D, M_WOODD);
      for (let k = 0; k < 3; k++) box(b, 0.07, 1.4, 6.6, GOLD, M_GOLD);
      for (let k = 0; k < 2; k++) box(b, 0.07, 6.6, 0.5, GOLD, M_GOLD);
    });
  }
  const soffSeg = 14;
  for (let i = 0; i < soffSeg; i++) {
    const xa = -PHW + (2 * PHW * i) / soffSeg, xb = -PHW + (2 * PHW * (i + 1)) / soffSeg;
    const ya = PSPR + archY(PHW, PAPEX - PSPR, xa), yb0 = PSPR + archY(PHW, PAPEX - PSPR, xb);
    const N = norm([0, -1, 0]);
    b.quad([xa, ya, zf], [xb, yb0, zf], [xb, yb0, zb], [xa, ya, zb], mulc(STONE, 0.92), M_IN, N);
  }
  // --- portal surrounds (archivolts + voussoirs + flanking niches)
  archFrame(b, PHW, PAPEX - PSPR, zf + 0.10, 0.55, 0.5, STONE, M_EXT2, 13, PSPR);
  archFrame(b, PHW + 0.7, (PAPEX + 0.7) - PSPR, zf + 0.04, 0.6, 0.7, STONE_W, M_EXT2, 13, PSPR);
  voussoirs(b, PHW + 1.45, PAPEX + 1.45 - PSPR, zf + 0.02, 0.55, 0.55, 1.0, STONE, M_EXT2, 11, PSPR);
  // carved relief band ABOVE the portal arch (the opening itself stays clear)
  put(b, 0, PAPEX + 2.6, zf + 0.03, () => {
    b.quad([-4.4, -1.3, 0.01], [4.4, -1.3, 0.01], [4.4, 1.3, 0.01], [-4.4, 1.3, 0.01], mulc(STONE_W, 0.98), M_EXT2, N0);
    for (let i = 0; i < 5; i++) {
      put(b, -3.2 + i * 1.6, 0, 0.16, () => {
        box(b, 0.7, 1.9, 0.3, mulc(STONE_W, 1.04), M_EXT2);
        sphere(b, 0.3, IVORY, M_EXT2, { rings: 3, seg: 6, jitter: 0.03 });
      });
    }
    for (let i = 0; i < 12; i++) discZ(b, -3.6 + i * 0.65, 1.05, 0.14, 0.16, 6, GOLD, M_GOLDB);
  });
  // statue niches on the facade (4)
  for (const sx of [-1, 1]) for (const [yy, hh] of [[17.5, 3.2], [9.5, 3.0]]) {
    const x = sx * 7.9;
    put(b, x, yy, zf + 0.03, () => {
      b.quad([-1.1, -hh / 2 - 0.9, 0.01], [1.1, -hh / 2 - 0.9, 0.01], [1.1, hh / 2 - 0.9, 0.01], [-1.1, hh / 2 - 0.9, 0.01], NAVY, M_PAINT, N0);
      archFrame(b, 1.1, 1.1, 0.03, 0.30, 0.3, GOLD, M_GOLDB, 7, hh / 2 - 0.9);
      for (const s2 of [-1, 1]) put(b, s2 * 1.3, hh / 2 - 0.9, 0.06, () => box(b, 0.28, hh + 2.2, 0.34, STONE_W, M_EXT2));
      // statuette
      put(b, 0, -hh / 2 - 0.6, 0.3, () => {
        box(b, 0.85, 0.9, 0.85, STONE_D, M_EXT2);
        lathe(b, [[0.26, 0], [0.22, 1.1], [0.3, 2.0], [0.2, 2.4]], 8, IVORY, M_EXT2);
        sphere(b, 0.24, IVORY, M_EXT2, { rings: 3, seg: 6, jitter: 0.03 });
      });
    });
  }
  // --- kings' gallery: a blind arcade band across the facade
  for (let i = 0; i < 14; i++) {
    const x = -10.05 + i * 1.545;
    const y = 21.2;
    put(b, x, y, zf + 0.06, () => {
      b.quad([-0.62, -1.15, 0.01], [0.62, -1.15, 0.01], [0.62, 0.55, 0.01], [-0.62, 0.55, 0.01], NAVY, M_PAINT, N0);
      archFrame(b, 0.62, 0.62, 0.04, 0.16, 0.16, GOLD, M_GOLDB, 5, 0.55);
      // little figure
      put(b, 0, -1.05, 0.22, () => {
        lathe(b, [[0.18, 0], [0.15, 0.6], [0.2, 1.05], [0.14, 1.3]], 6, IVORY, M_EXT2);
        sphere(b, 0.15, IVORY, M_EXT2, { rings: 3, seg: 5, jitter: 0.02 });
      });
    });
  }
  for (const yy of [20.05, 23.6]) put(b, 0, yy, zf + 0.16, () => box(b, 22.2, 0.24, 0.32, GOLD, M_GOLD));
  // --- gable (42 -> 53.6) with crockets + cross
  const GZ = zf + 1.85;   // front face of the gable slab
  put(b, 0, 0, 0, () => {
    extrudeXY(b, [[-11.4, FAC_TOP], [11.4, FAC_TOP], [0, 53.6]], 3.2, STONE, M_EXT, { z0: zf - 1.4 });
    // raking gold bands
    bar3(b, [-11.4, FAC_TOP + 0.1, GZ], [0, 53.6, GZ], 0.55, 0.5, GOLD, M_GOLD);
    bar3(b, [11.4, FAC_TOP + 0.1, GZ], [0, 53.6, GZ], 0.55, 0.5, GOLD, M_GOLD);
    // crockets
    for (let i = 0; i < 9; i++) {
      const t = (i + 1) / 11;
      for (const sx of [-1, 1]) {
        const px = sx * 11.4 * (1 - t), py = FAC_TOP + (53.6 - FAC_TOP) * t;
        put(b, px, py + 0.5, GZ, () => {
          sphere(b, 0.34, GOLD, M_GOLDB, { rings: 3, seg: 6, jitter: 0.05 });
          box(b, 0.32, 0.8, 0.32, GOLD_D, M_GOLD);
        });
      }
    }
    // oculus in the gable
    discZ(b, 0, 46.8, GZ + 0.04, 2.5, BLUE_D, M_GLASS_E, 16);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU, c = Math.cos(a), s = Math.sin(a);
      b.quad([c * 0.4 - s * 0.1, 46.8 + s * 0.4 + c * 0.1, GZ + 0.1], [c * 0.4 + s * 0.1, 46.8 + s * 0.4 - c * 0.1, GZ + 0.1],
        [c * 2.5 + s * 0.1, 46.8 + s * 2.5 - c * 0.1, GZ + 0.1], [c * 2.5 - s * 0.1, 46.8 + s * 2.5 + c * 0.1, GZ + 0.1], GOLD, M_GOLDB, N0);
    }
    ringZ(b, 0, 46.8, GZ + 0.08, 2.7, 0.4, 0.4, GOLD_B, M_GOLDB, 16);
    finialCross(b, 0, 54.4, GZ, 1.5);
  });
  // --- rose window, exterior
  buildRose(b, zf + 0.05, false);
  // --- rose window, interior
  buildRose(b, zb - 0.30, true);
  // --- facade corner buttresses
  for (const sx of [-1, 1]) {
    put(b, sx * 10.6, FAC_TOP * 0.5, zf + 0.3, () => {
      box(b, 1.5, FAC_TOP, 0.8, STONE, M_EXT);
      for (const yy of [12.6, 26.6]) box(b, 2.0, 0.7, 1.0, MARBLE, M_EXT2);
      cone(b, 1.15, 4.2, FAC_TOP * 0.5 + 0, STONE, M_EXT, 4);
    });
    // statues on brackets flanking the portal
    put(b, sx * 5.9, 13.4, zf + 0.5, () => {
      box(b, 1.1, 0.5, 0.9, GOLD, M_GOLD);
      put(b, 0, 0.3, 0, () => {
        lathe(b, [[0.3, 0], [0.26, 1.4], [0.34, 2.4], [0.22, 2.9]], 8, IVORY, M_EXT2);
        sphere(b, 0.26, IVORY, M_EXT2, { rings: 3, seg: 6, jitter: 0.02 });
      });
    });
  }
  // --- interior west wall: gold wainscot + carved band
  put(b, 0, FL + 0.5, zb + 0.18, () => box(b, 2 * NX, 1.0, 0.3, STONE_D, M_IN2));
  put(b, 0, FL + 1.05, zb + 0.24, () => box(b, 2 * NX, 0.16, 0.36, GOLD, M_GOLDI));
  // door from the portal into the nave: gold arch band on the inner face
  archFrame(b, PHW, PAPEX - PSPR, zb + 0.2, 0.5, 0.4, GOLD, M_GOLDI, 12, PSPR);
  void R; void ctx;
}

// rose window (either the inner face of a nave wall at z, facing the nave, or the
// exterior face at z, facing +Z). Built in the world XY plane at constant z.
function buildRose(b, z, inner) {
  const s = inner ? -1 : 1;
  const N = [0, 0, s];
  const y = ROSE_Y, x = 0;
  const zz = (k) => z + s * k;
  // stone ring
  ringZ(b, x, y, zz(0.0), ROSE_R + 0.85, 2.0, 1.1, STONE, M_EXT2, 22);
  ringZ(b, x, y, zz(0.35), ROSE_R + 0.3, 1.1, 0.9, GOLD, M_GOLDI, 22);
  // glass field (drawn as a ring of tracery cells)
  const NR = 3;
  for (let k = 0; k < NR; k++) {
    const r0 = 1.2 + (ROSE_R - 1.2) * (k / NR), r1 = 1.2 + (ROSE_R - 1.2) * ((k + 1) / NR);
    const seg = 22;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
      const zm = zz(0.18 + k * 0.02);
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const col = SG[(i * 3 + k * 2) % SG.length];
      b.quad([x + c0 * r0, y + s0 * r0, zm], [x + c1 * r0, y + s1 * r0, zm],
        [x + c1 * r1, y + s1 * r1, zm], [x + c0 * r1, y + s0 * r1, zm], col, inner ? M_GLASS_I : M_GLASS_E, N);
    }
  }
  discZ(b, x, y, zz(0.24), 1.25, GOLD, M_GOLDI, 14);
  discZ(b, x, y, zz(0.34), 0.75, GOLD_B, M_FLAME, 10);
  // radiating tracery + outer petals
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU, c = Math.cos(a), sn = Math.sin(a);
    b.quad([x + c * 1.2 - sn * 0.11, y + sn * 1.2 + c * 0.11, zz(0.4)], [x + c * 1.2 + sn * 0.11, y + sn * 1.2 - c * 0.11, zz(0.4)],
      [x + c * (ROSE_R - 0.3) + sn * 0.11, y + sn * (ROSE_R - 0.3) - c * 0.11, zz(0.4)],
      [x + c * (ROSE_R - 0.3) - sn * 0.11, y + sn * (ROSE_R - 0.3) + c * 0.11, zz(0.4)], GOLD, M_GOLDI, N);
    const am = a + TAU / 24;
    discY(b, x + Math.cos(am) * (ROSE_R - 0.8), y + Math.sin(am) * (ROSE_R - 0.8), zz(0.42), 0.44, 6, GOLD_B, M_GOLDB);
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.3;
    ringZ(b, x + Math.cos(a) * 5.2, y + Math.sin(a) * 5.2, zz(0.42), 1.5, 0.22, 0.14, GOLD_B, M_GOLDB, 10);
  }
  ringZ(b, x, y, zz(0.5), ROSE_R - 0.25, 0.3, 0.2, GOLD, M_GOLDB, 24);
}

// ================================================================ towers
function buildTower(b, sx, R, ctx) {
  const cx = sx * TX, z0 = TZ0, z1 = TZ1;
  const x0 = sx > 0 ? TIX : -TOX, x1 = sx > 0 ? TOX : -TIX;
  const xa = Math.min(x0, x1), xb = Math.max(x0, x1);
  const NXf = [0, 0, 1], NZf = [0, 0, -1], NXo = [sx, 0, 0], NXi = [-sx, 0, 0];
  const SHAFT = 58.0, BELF = 76.0, CROWN = 86.0, SPIRE = 119.0;
  // --- shaft: outer + inner faces of a 13.6 x 9 hollow tube. The front and the
  // back faces are pierced by the side portal (5.6 x 11.2 through the front wall)
  // and by the arch that opens the tower chamber into the aisle.
  archWallZ(b, xa, xb, 0, SHAFT, sx * SPX, SHW, SAPEX - SSPR, SSPR, z0, STONE, M_EXT, NXf, 24);
  archWallZ(b, xa, xb, 0, SHAFT, sx * 16.7, 4.8, 4.8, 10.0, z1, STONE, M_EXT, NZf, 24);
  b.quad([x1, 0, z0], [x1, 0, z1], [x1, SHAFT, z1], [x1, SHAFT, z0], STONE, M_EXT, NXo);
  b.quad([x0, 0, z1], [x0, 0, z0], [x0, SHAFT, z0], [x0, SHAFT, z1], STONE, M_EXT, [-sx, 0, 0]);
  // inner faces of the hollow shaft (above the ground chamber ceiling at y=21)
  const ix0 = xa + TWT, ix1 = xb - TWT, iz0 = z0 - TWT, iz1 = z1 + TWT;
  b.quad([ix1, 21, iz0], [ix0, 21, iz0], [ix0, SHAFT, iz0], [ix1, SHAFT, iz0], mulc(STONE_C, 0.86), M_IN, [-0, 0, -1]);
  b.quad([ix0, 21, iz1], [ix1, 21, iz1], [ix1, SHAFT, iz1], [ix0, SHAFT, iz1], mulc(STONE_C, 0.86), M_IN, [0, 0, 1]);
  b.quad([ix0, 21, iz0], [ix0, 21, iz1], [ix0, SHAFT, iz1], [ix0, SHAFT, iz0], mulc(STONE_C, 0.8), M_IN, [-sx, 0, 0]);
  b.quad([ix1, 21, iz1], [ix1, 21, iz0], [ix1, SHAFT, iz0], [ix1, SHAFT, iz1], mulc(STONE_C, 0.8), M_IN, [sx, 0, 0]);
  // shaft top cap (annulus) so the hollow tube is closed
  const capY = SHAFT;
  b.quad([xa, capY, z0], [ix0, capY, iz0], [ix0, capY, iz1], [xa, capY, z1], mulc(STONE, 1.02), M_EXT, [0, 1, 0]);
  b.quad([ix1, capY, iz0], [xb, capY, z0], [xb, capY, z1], [ix1, capY, iz1], mulc(STONE, 1.02), M_EXT, [0, 1, 0]);
  b.quad([xa, capY, z0], [xb, capY, z0], [ix1, capY, iz0], [ix0, capY, iz0], mulc(STONE, 1.04), M_EXT, [0, 1, 0]);
  b.quad([xb, capY, z1], [xa, capY, z1], [ix0, capY, iz1], [ix1, capY, iz1], mulc(STONE, 1.04), M_EXT, [0, 1, 0]);
  // --- string courses + corner buttresses
  for (const yy of [20.4, 43.0]) {
    put(b, cx, yy, (z0 + z1) / 2, () => box(b, 14.3, 0.85, 9.7, MARBLE, M_EXT2));
  }
  for (const cx2 of [-1, 1]) for (const cz of [-1, 1]) {
    const bx = cx + cx2 * 6.4, bz = cz > 0 ? z0 - 0.35 : z1 + 0.35;
    put(b, bx, SHAFT * 0.5, bz, () => {
      box(b, 1.5, SHAFT, 1.1, STONE, M_EXT);
      box(b, 1.9, 0.6, 1.5, MARBLE, M_EXT2);
    });
    // pinnacle at the crown corner
    put(b, bx, CROWN, bz, () => {
      box(b, 2.0, 3.0, 1.8, STONE, M_EXT);
      cone(b, 1.25, 6.4, 3.0, STONE, M_EXT, 4);
      cone(b, 0.42, 2.0, 9.3, GOLD, M_GOLD, 4);
    });
  }
  // --- belfry stage (58..76): corner piers + louvres + lintel band
  put(b, cx, 0, (z0 + z1) / 2 - z0 + 0, () => {});
  for (const cx2 of [-1, 1]) for (const cz of [-1, 1]) {
    put(b, cx + cx2 * 6.2, (SHAFT + BELF) / 2, cz > 0 ? z0 - 0.3 : z1 + 0.3, () => box(b, 2.2, BELF - SHAFT, 1.9, STONE, M_EXT));
  }
  // louvre openings (dark glowing glass) on all four faces
  const ly0 = SHAFT + 1.2, ly1 = BELF - 2.2, lhw = 2.3;
  putR(b, cx, 0, z0 - 0.05, 0, () => lancetWin(b, lhw, ly0, ly1 - lhw, ly1, 0, M_DARKGL, M_EXT2, 0.3, STONE_W, [BLUE_M, NAVY], { cols: 2, rows: 3 }));
  putR(b, cx, 0, z1 + 0.05, Math.PI, () => lancetWin(b, lhw, ly0, ly1 - lhw, ly1, 0, M_DARKGL, M_EXT2, 0.3, STONE_W, [BLUE_M, NAVY], { cols: 2, rows: 3 }));
  for (const sx2 of [-1, 1]) {
    putR(b, sx2 > 0 ? xb - 0.05 : xa + 0.05, 0, (z0 + z1) / 2, sx2 > 0 ? Math.PI / 2 : -Math.PI / 2, () =>
      lancetWin(b, 1.9, ly0, ly1 - 1.9, ly1, 0, M_DARKGL, M_EXT2, 0.3, STONE_W, [BLUE_M, NAVY], { cols: 2, rows: 3 }));
  }
  // belfry cornice + parapet
  put(b, cx, BELF, (z0 + z1) / 2, () => {
    box(b, 14.6, 1.2, 9.9, MARBLE, M_EXT2);
    box(b, 14.0, 1.6, 9.3, STONE, M_EXT);
    for (let i = 0; i < 5; i++) {
      const px = -5.4 + i * 2.7;
      put(b, px, 1.9, 4.5, () => box(b, 1.3, 1.4, 0.45, STONE_W, M_EXT));
      put(b, px, 1.9, -4.5, () => box(b, 1.3, 1.4, 0.45, STONE_W, M_EXT));
    }
  });
  // --- openwork lantern (76..86): corner piers + glowing panels + roof
  for (const cx2 of [-1, 1]) for (const cz of [-1, 1]) {
    put(b, cx + cx2 * 4.6, BELF + 5.0, cz > 0 ? z0 - 1.4 : z1 + 1.4, () => box(b, 1.7, 10.0, 1.7, STONE_W, M_EXT));
  }
  put(b, cx, BELF + 5.0, (z0 + z1) / 2, () => {
    for (const sz of [-1, 1]) {
      const zo = sz * 4.6;
      put(b, 0, 0, zo, () => {
        box(b, 7.4, 8.4, 0.3, BLUE_D, M_DARKGL);
        for (let k = 1; k < 4; k++) box(b, 0.22, 8.4, 0.42, STONE_W, M_EXT2);
        for (let k = 1; k < 4; k++) box(b, 7.6, 0.22, 0.42, STONE_W, M_EXT2);
        for (let k = 1; k < 4; k++) put(b, -3.7 + k * 1.85, -4.2, 0.26, () => discZ(b, 0, 0, 0, 0.34, 8, GOLD, M_GOLDB));
      });
    }
  });
  for (const sx2 of [-1, 1]) {
    putR(b, sx2 * 5.6 + cx, BELF + 5.0, (z0 + z1) / 2, Math.PI / 2, () => {
      box(b, 6.2, 8.4, 0.3, BLUE_D, M_DARKGL);
      for (let k = 1; k < 4; k++) box(b, 0.22, 8.4, 0.42, STONE_W, M_EXT2);
      for (let k = 1; k < 4; k++) box(b, 6.4, 0.22, 0.42, STONE_W, M_EXT2);
    });
  }
  put(b, cx, BELF + 10.2, (z0 + z1) / 2, () => box(b, 13.2, 1.3, 9.0, GOLD, M_GOLD));
  // --- crown + slate spire
  put(b, cx, CROWN, (z0 + z1) / 2, () => cylinder(b, 8, 6.8, 7.3, 1.6, MARBLE, M_EXT2, { caps: true, y0: 0 }));
  put(b, cx, CROWN + 1.5, (z0 + z1) / 2, () => cylinder(b, 8, 6.4, 0.16, SPIRE - CROWN - 1.5, SLATE, M_SLATE, { caps: true, y0: 0 }));
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU + Math.PI / 8;
    bar3(b, [cx + Math.cos(a) * 6.3, CROWN + 1.5, (z0 + z1) / 2 + Math.sin(a) * 6.3], [cx, SPIRE, (z0 + z1) / 2], 0.26, 0.3, GOLD, M_GOLD);
    // crockets along the ribs
    for (let j = 1; j <= 8; j++) {
      const t = j / 9;
      put(b, cx + Math.cos(a) * 6.3 * (1 - t), CROWN + 1.5 + (SPIRE - CROWN - 1.5) * t, (z0 + z1) / 2 + Math.sin(a) * 6.3 * (1 - t), () =>
        box(b, 0.3, 0.42, 0.3, GOLD_D, M_GOLD));
    }
  }
  put(b, cx, CROWN + 1.5, (z0 + z1) / 2, () => {
    coneBand(b, 6.4, SPIRE - CROWN - 1.5, 8.0, 0.4, GOLD, M_GOLD, 8);
    coneBand(b, 6.4, SPIRE - CROWN - 1.5, 19.0, 0.36, GOLD, M_GOLD, 8);
  });
  put(b, cx, SPIRE, (z0 + z1) / 2, () => {
    cylinder(b, 8, 0.9, 0.4, 1.7, GOLD, M_GOLD, { caps: true, y0: 0 });
    finialCross(b, 0, 1.9, 0, 1.1);
  });
  // --- clock dials facing +Z at y 50 on each tower
  putR(b, cx, 50.0, z0 + 0.02, 0, () => clockDial(b, 5.6));
  if (ctx && ctx.lanterns) {
    ctx.lanterns.push({ p: W(cx, 50.0, z0 - 1.2), size: 9.0, rot: 0, alpha: 0.20, shape: 1, col: C.goldBright });
  }
  void R; void NXo; void NXi;
}

// ================================================================ ground chamber under the towers (narthex)
function buildNarthex(b, sx, R, ctx) {
  const cx = sx * TX;
  const PCX = sx * SPX;   // this tower's side portal centre
  const x0 = sx > 0 ? TIX : -TOX, x1 = sx > 0 ? TOX : -TIX;
  const xa = Math.min(x0, x1), xb = Math.max(x0, x1);
  // the chamber spans the tower plan so a 5.6 m side portal (x +-14.3) clears it
  const ix0 = sx > 0 ? TIX + 0.3 : -TOX + 0.4, ix1 = sx > 0 ? TOX - 0.4 : -TIX - 0.3;
  const iz0 = TZ0 - TWT, iz1 = TZ1 + TWT;
  const CEIL = 21.0, CEILB = 19.2;
  const ACX = sx * 16.7;   // aisle centre: the back arch opens into the aisle
  const N0 = [0, 0, 1];
  // The tower's outer shell (front / back faces with their arches) belongs to
  // buildTower; this build the chamber inside the tower walls.
  // --- floor + threshold through the portal
  put(b, cx, FL - 0.11, (iz0 + iz1) / 2, () => box(b, ix1 - ix0, 0.22, iz0 - iz1, MARBLE, M_POLISH));
  put(b, PCX, FL - 0.11, (TZ0 + iz0) / 2, () => box(b, 2 * SHW, 0.22, TZ0 - iz0, MARBLE, M_POLISH));
  put(b, ACX, FL - 0.11, (iz1 + TZ1) / 2, () => box(b, 9.2, 0.22, iz1 - TZ1, MARBLE, M_POLISH));
  // --- room walls (inward normals), each pierced where it must be open
  archWallZ(b, ix0, ix1, FL, CEIL, PCX, SHW, SAPEX - SSPR, SSPR, iz0, mulc(STONE_C, 0.94), M_IN, [0, 0, -1], 18);
  archWallZ(b, ix0, ix1, FL, CEIL, ACX, 4.8, 4.8, 10.0, iz1, mulc(STONE_C, 0.92), M_IN, [0, 0, 1], 20);
  b.quad([ix0, FL, iz0], [ix0, FL, iz1], [ix0, CEIL, iz1], [ix0, CEIL, iz0], mulc(STONE_C, 0.9), M_IN, [sx, 0, 0]);
  b.quad([ix1, FL, iz1], [ix1, FL, iz0], [ix1, CEIL, iz0], [ix1, CEIL, iz1], mulc(STONE_C, 0.9), M_IN, [-sx, 0, 0]);
  // --- portal tunnel: reveals through the outer wall + the room wall
  for (const s2 of [-1, 1]) {
    const x = PCX + s2 * SHW;
    b.quad([x, FL, TZ0], [x, FL, iz0], [x, SSPR, iz0], [x, SSPR, TZ0], mulc(STONE, 0.94), M_IN, [-s2, 0, 0]);
  }
  for (let i = 0; i < 10; i++) {
    const xa2 = PCX - SHW + (2 * SHW * i) / 10, xb2 = PCX - SHW + (2 * SHW * (i + 1)) / 10;
    const ya = SSPR + archY(SHW, SAPEX - SSPR, xa2 - PCX), yb2 = SSPR + archY(SHW, SAPEX - SSPR, xb2 - PCX);
    b.quad([xa2, ya, TZ0], [xb2, yb2, TZ0], [xb2, yb2, iz0], [xa2, ya, iz0], mulc(STONE, 0.9), M_IN, [0, -1, 0]);
  }
  put(b, PCX, 0, 0, () => {
    archFrame(b, SHW, SAPEX - SSPR, TZ0 + 0.1, 0.5, 0.5, STONE_W, M_EXT2, 10, SSPR);
    voussoirs(b, SHW + 1.1, SAPEX + 1.1 - SSPR, TZ0 + 0.02, 0.5, 0.45, 0.8, STONE, M_EXT2, 8, SSPR);
  });
  // open gold door leaves, flat on the tunnel side walls
  for (const s2 of [-1, 1]) {
    const x = PCX + s2 * (SHW - 0.17);
    put(b, x, FL + 4.6, TZ0 - 0.72, () => {
      box(b, 0.16, 8.8, 1.15, DOOR, M_WOOD);
      box(b, 0.05, 8.2, 0.9, DOOR_D, M_WOODD);
      box(b, 0.07, 0.3, 1.0, GOLD, M_GOLD);
    });
  }
  // --- the arch from the chamber into the aisle: reveals + gold orders
  for (const s2 of [-1, 1]) {
    const x = ACX + s2 * 4.8;
    b.quad([x, FL, iz1], [x, FL, TZ1], [x, 10.0, TZ1], [x, 10.0, iz1], mulc(STONE, 0.92), M_IN, [-s2, 0, 0]);
  }
  for (let i = 0; i < 14; i++) {
    const xa2 = ACX - 4.8 + (9.6 * i) / 14, xb2 = ACX - 4.8 + (9.6 * (i + 1)) / 14;
    const ya = 10.0 + archY(4.8, 4.8, xa2 - ACX), yb2 = 10.0 + archY(4.8, 4.8, xb2 - ACX);
    b.quad([xa2, ya, iz1], [xb2, yb2, iz1], [xb2, yb2, TZ1], [xa2, ya, TZ1], mulc(STONE, 0.88), M_IN, [0, -1, 0]);
  }
  put(b, ACX, 0, 0, () => {
    archFrame(b, 4.8, 4.8, TZ1 - 0.12, 0.4, 0.35, GOLD, M_GOLDI, 10, 10.0);
    voussoirs(b, 5.1, 5.1, TZ1 - 0.03, 0.45, 0.45, 0.8, STONE, M_EXT2, 9, 10.0);
    archFrame(b, 4.8, 4.8, iz1 + 0.1, 0.35, 0.3, GOLD, M_GOLDI, 10, 10.0);
  });
  // --- ceiling of the chamber: stone slab with gold ribs
  put(b, cx, CEIL - 0.25, (iz0 + iz1) / 2, () => box(b, ix1 - ix0, 0.5, iz0 - iz1, mulc(STONE_C, 0.86), M_IN));
  for (let i = 0; i < 4; i++) {
    const z = iz0 - (iz0 - iz1) * ((i + 0.5) / 4);
    put(b, cx, CEIL - 0.55, z, () => box(b, ix1 - ix0 - 0.2, 0.24, 0.34, GOLD, M_GOLDI));
  }
  // impost band + wainscot on the side walls
  put(b, cx, 11.6, (iz0 + iz1) / 2, () => box(b, ix1 - ix0 - 0.1, 0.5, iz0 - iz1 - 0.1, MARBLE, M_IN2));
  for (const s2 of [-1, 1]) {
    const x = s2 > 0 ? ix1 - 0.06 : ix0 + 0.06;
    b.quad([x, FL, iz0], [x, FL, iz1], [x, FL + 2.0, iz1], [x, FL + 2.0, iz0], STONE_D, M_IN2, [-s2, 0, 0]);
    b.quad([x, FL + 2.0, iz0], [x, FL + 2.0, iz1], [x, FL + 2.3, iz1], [x, FL + 2.3, iz0], GOLD, M_GOLDI, [-s2, 0, 0]);
  }
  // baptismal font + a statue
  put(b, sx * 20.2, FL, -6.4, () => {
    cylinder(b, 12, 1.05, 0.9, 0.35, STONE_D, M_IN2, { caps: true, y0: 0 });
    lathe(b, [[0.85, 0.35], [1.15, 1.0], [0.95, 1.5], [1.2, 1.85]], 12, MARBLE, M_IN2);
    discY(b, 0, 1.86, 0, 1.05, 12, C.water, [0.24, 0.9]);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      put(b, Math.cos(a) * 1.35, 1.9, Math.sin(a) * 1.35, () => box(b, 0.16, 0.5, 0.16, GOLD, M_GOLDI));
    }
  });
  candle(b, sx * 20.2, FL + 2.0, -6.4, 0.7, 0.9);
  flameAt(b, ctx, sx * 20.2, FL + 2.6, -6.4, 1.5, 0.55);
  void R; void CEILB; void cx;
}

// ================================================================ arcade
function buildArcade(b, R) {
  const rise = ARAP - ARSP;
  const Ni = [-1, 0, 0], Na = [1, 0, 0];
  const TOP = ARAP + 1.6;
  for (const sx of [-1, 1]) {
    const xi = sx * NX, xa = sx * AW;
    const nIn = [-sx, 0, 0], nOut = [sx, 0, 0];
    for (let bi = 0; bi < 6; bi++) {
      const z0 = PZ[bi], z1 = PZ[bi + 1], zc = (z0 + z1) / 2;
      const SEG = 26;
      for (let i = 0; i < SEG; i++) {
        const za = z0 + ((z1 - z0) * i) / SEG, zb = z0 + ((z1 - z0) * (i + 1)) / SEG;
        const aa = ARSP + archY(ARHW, rise, za - zc);
        const ab = ARSP + archY(ARHW, rise, zb - zc);
        // nave face spandrel
        b.quad([xi, aa, za], [xi, ab, zb], [xi, TOP, zb], [xi, TOP, za], STONE_C, M_IN, nIn);
        // aisle face spandrel
        b.quad([xa, ab, zb], [xa, aa, za], [xa, TOP, za], [xa, TOP, zb], mulc(STONE_C, 0.92), M_IN, nOut);
        // soffit (the reveal through the arcade wall)
        const dz = zb - za, dy = ab - aa;
        const ns = norm([0, -dz, dy]);
        b.quad([xi, aa, za], [xi, ab, zb], [xa, ab, zb], [xa, aa, za], mulc(STONE_C, 0.88), M_IN, [ns[0], -1, ns[2]]);
      }
      // arches: gold molding order on the nave side
      archFrame(b, ARHW + 0.2, rise, xi - sx * 0.16, 0.34, 0.3, GOLD, M_GOLDI, 14, ARSP);
      archFrame(b, ARHW + 0.75, rise, xi - sx * 0.1, 0.55, 0.24, mulc(STONE_C, 1.06), M_IN2, 14, ARSP);
      // aisle-side gold order
      archFrame(b, ARHW + 0.2, rise, xa + sx * 0.12, 0.30, 0.26, mulc(GOLD, 0.9), M_GOLDI, 12, ARSP);
      // wall rib in the middle of each bay (a shaft running up to the vault)
      const zm = zc;
      put(b, xi + sx * 0.28, FL + (TOP - FL) / 2, zm, () => {
        box(b, 0.5, TOP - FL, 0.62, STONE_C, M_IN);
        for (let k = 0; k < 4; k++) box(b, 0.34, 0.4, 0.46, GOLD, M_GOLDI);
      });
    }
    // piers at the bay boundaries
    for (let pi = 1; pi < 6; pi++) buildPier(b, R, sx * NX, PZ[pi]);
    // end responds
    buildPier(b, R, sx * NX, PZ[0] + 0.6, 0.8);
    buildPier(b, R, sx * NX, PZ[6] - 0.6, 0.8);
    void Ni; void Na; void nOut;
  }
  void R;
}
// clustered gothic pier: a core with 4 colonnettes, base and capital
function buildPier(b, R, x, z, scale = 1) {
  const s = scale;
  const h = ARSP + 1.1;
  put(b, x, FL, z, () => {
    box(b, 2.5 * s, 0.7 * s, 2.5 * s, STONE_D, M_IN2);
    box(b, 2.8 * s, 0.2 * s, 2.8 * s, GOLD, M_GOLDI);
    cylinder(b, 12, 0.92 * s, 0.86 * s, h - 1.6, mulc(STONE_C, 0.86), M_IN, { caps: true, y0: 0.55 * s });
    for (const yy of [3.2, 7.4]) {
      cylinder(b, 12, 0.94 * s, 0.94 * s, 0.16, GOLD, M_GOLDI, { caps: false, y0: yy });
    }
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU + Math.PI / 4;
      const px = Math.cos(a) * 0.82 * s, pz = Math.sin(a) * 0.82 * s;
      void px; void pz;
    }
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU + Math.PI / 4;
      put(b, Math.cos(a) * 0.82 * s, 0.9 * s, Math.sin(a) * 0.82 * s, () =>
        cylinder(b, 8, 0.30 * s, 0.27 * s, h - 1.9, mulc(STONE_C, 1.05), M_IN, { caps: true, y0: 0 }));
    }
    // capital
    cylinder(b, 12, 1.0 * s, 1.35 * s, 1.0 * s, mulc(STONE_C, 1.03), M_IN2, { caps: true, y0: h - 1.05 });
    box(b, 3.0 * s, 0.3 * s, 3.0 * s, GOLD, M_GOLDI);
    // crocket leaves
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU + Math.PI / 4;
      put(b, Math.cos(a) * 1.25 * s, h - 1.1, Math.sin(a) * 1.25 * s, () => sphere(b, 0.26 * s, GOLD, M_GOLDI, { rings: 3, seg: 5, jitter: 0.06 }));
    }
  });
  void R;
}

// ================================================================ clerestory walls + vault
function buildClerestory(b, R) {
  const TOP = VSP;
  for (const sx of [-1, 1]) {
    const xi = sx * NX;
    const nIn = [-sx, 0, 0];
    // interior wall from the arcade top to the vault spring
    b.quad([xi, ARAP + 1.6, ZF], [xi, ARAP + 1.6, ZB], [xi, TOP, ZB], [xi, TOP, ZF], STONE_C, M_IN, nIn);
    // triforium: blind arcading band on the wall (2 tiers)
    for (let bi = 0; bi < 6; bi++) {
      const z0 = PZ[bi], z1 = PZ[bi + 1];
      for (let k = 0; k < 3; k++) {
        const zc = z0 + ((z1 - z0) * (k + 0.5)) / 3;
        putR(b, xi - sx * 0.06, 0, zc, sx > 0 ? -Math.PI / 2 : Math.PI / 2, () => {
          for (const yy of [ARAP + 2.6, ARAP + 4.2]) {
            b.quad([-1.32, yy, 0.02], [1.32, yy, 0.02], [1.32, yy + 1.35, 0.02], [-1.32, yy + 1.35, 0.02], BLUE_D, M_PAINT, [0, 0, 1]);
            archFrame(b, 1.32, 1.32, 0.04, 0.2, 0.14, GOLD, M_GOLDI, 5, yy + 1.35 + 1.35);
            b.quad([-1.5, yy - 0.14, 0.06], [1.5, yy - 0.14, 0.06], [1.5, yy, 0.06], [-1.5, yy, 0.06], GOLD, M_GOLDI, [0, 0, 1]);
          }
        });
      }
      // clerestory windows (2 per bay)
      for (let k = 0; k < 2; k++) {
        const zc = z0 + ((z1 - z0) * (k + 0.5)) / 2;
        putR(b, xi - sx * 0.05, 0, zc, sx > 0 ? -Math.PI / 2 : Math.PI / 2, () =>
          lancetWin(b, 1.65, 23.6, 31.6, 33.2, 0.02, M_GLASS_I, M_IN2, 0.26, mulc(STONE_C, 1.05), SG, { cols: 2, rows: 3 }));
      }
      // gold string course above the triforium
      b.quad([xi - sx * 0.03, ARAP + 5.9, z1], [xi - sx * 0.03, ARAP + 5.9, z0], [xi - sx * 0.03, ARAP + 6.25, z0], [xi - sx * 0.03, ARAP + 6.25, z1], GOLD, M_GOLDI, nIn);
    }
    // vault springer band
    b.quad([xi, TOP - 0.7, ZF], [xi, TOP - 0.7, ZB], [xi, TOP, ZB], [xi, TOP, ZF], GOLD, M_GOLDI, nIn);
  }
  void R;
}
function buildVault(b, R) {
  const NS = 46, NR = 52;
  const z0 = ZF, z1 = ZB;
  const xs = [];
  for (let i = 0; i <= NS; i++) { const x = -NX + (2 * NX * i) / NS; xs.push([x, vaultY(x)]); }
  const starPts = [];
  for (let i = 0; i < 90; i++) starPts.push([-9 + R() * 18, z0 - 2 - R() * 58, 0.18 + R() * 0.3]);
  for (let r = 0; r < NR; r++) {
    const za = z0 + ((z1 - z0) * r) / NR, zb = z0 + ((z1 - z0) * (r + 1)) / NR;
    for (let i = 0; i < NS; i++) {
      const xa = xs[i][0], ya = xs[i][1], xb = xs[i + 1][0], yb = xs[i + 1][1];
      const xm = (xa + xb) / 2, ym = (ya + yb) / 2;
      let col = mixc(rgb('#b9a888'), rgb('#d3c3a2'), 0.15 + R() * 0.55);
      // painted panels: a warm rose tint near the apex
      const t = 1 - Math.abs(xm) / NX;
      col = mixc(col, rgb('#b99a76'), t * 0.5);
      const n = vaultN(xm);
      b.quad([xa, ya, za], [xb, yb, za], [xb, yb, zb], [xa, ya, zb], col, M_PAINT, n);
      // painted gold stars on the webs
      if (R() < 0.10) {
        const zm = (za + zb) / 2;
        const s = 0.22 + R() * 0.2;
        const nn = vaultN(xm);
        const t1 = norm([nn[1], -nn[0], 0]);
        const px = (a, b2) => [xm + t1[0] * a * s, ym + t1[1] * a * s, zm + b2 * s];
        b.quad(px(-1, 0), px(0, 1), px(1, 0), px(0, -1), GOLD_B, M_GOLDB, nn);
      }
    }
  }
  // transverse ribs at the bay boundaries
  for (const z of PZ) {
    for (let i = 0; i < NS; i++) {
      const xa = xs[i][0], ya = xs[i][1], xb = xs[i + 1][0], yb = xs[i + 1][1];
      const xm = (xa + xb) / 2, ym = (ya + yb) / 2;
      const n = vaultN(xm);
      const o = 0.16;
      b.quad([xa, ya - o, z - 0.52], [xb, yb - o, z - 0.52], [xb, yb - o, z + 0.52], [xa, ya - o, z + 0.52], rgb('#c79a4e'), M_GOLDI, n);
      b.quad([xa, ya - o - 0.1, z - 0.22], [xb, yb - o - 0.1, z - 0.22], [xb, yb - o - 0.1, z + 0.22], [xa, ya - o - 0.1, z + 0.22], GOLD_B, M_GOLDB, n);
    }
  }
  // ridge rib along the apex
  for (let r = 0; r < NR; r++) {
    const za = z0 + ((z1 - z0) * r) / NR, zb = z0 + ((z1 - z0) * (r + 1)) / NR;
    b.quad([-0.22, VAP - 0.16, za], [0.22, VAP - 0.16, za], [0.22, VAP - 0.16, zb], [-0.22, VAP - 0.16, zb], GOLD_B, M_GOLDB, [0, -1, 0]);
  }
  // diagonal ribs (two per bay) + bosses
  for (let bi = 0; bi < 6; bi++) {
    const za = PZ[bi], zb = PZ[bi + 1], zm = (za + zb) / 2;
    for (const sx of [-1, 1]) {
      const SEG = 14;
      for (let k = 0; k < SEG; k++) {
        const t0 = k / SEG, t1 = (k + 1) / SEG;
        const x0 = sx * NX * (1 - t0), x1 = sx * NX * (1 - t1);
        const zz0 = za + (zm - za) * t0, zz1 = za + (zm - za) * t1;
        const y0 = vaultY(x0) - 0.14, y1 = vaultY(x1) - 0.14;
        const w = 0.26;
        b.quad([x0 - w, y0, zz0], [x0 + w, y0, zz0], [x1 + w, y1, zz1], [x1 - w, y1, zz1], GOLD, M_GOLDI, vaultN((x0 + x1) / 2));
        const x2 = sx * NX * (1 - t0), x3 = sx * NX * (1 - t1);
        const yA = vaultY(x2) - 0.14, yB = vaultY(x3) - 0.14;
        b.quad([x2 + w, yA, za + (zb - za) * (1 - t0)], [x2 - w, yA, za + (zb - za) * (1 - t0)],
          [x3 - w, yB, za + (zb - za) * (1 - t1)], [x3 + w, yB, za + (zb - za) * (1 - t1)], GOLD, M_GOLDI, vaultN((x2 + x3) / 2));
      }
    }
    // boss at the crossing of the diagonals
    put(b, 0, VAP - 0.42, zm, () => {
      cylinder(b, 10, 0.75, 0.5, 0.5, GOLD, M_GOLDB, { caps: true, y0: 0 });
      sphere(b, 0.42, GOLD_B, M_GOLDB, { rings: 3, seg: 6, jitter: 0.04 });
    });
  }
  // painted sunburst at the west end of the vault
  putRZ(b, 0, VSP + 6.4, ZF + 0.4, 0, () => {});
  void starPts; void R;
  void z1;
}

// ================================================================ aisles
function buildAisles(b, R, ctx) {
  for (const sx of [-1, 1]) {
    const xo = sx * AXO, xe = sx * AXE;
    const nOut = [-sx, 0, 0];  // interior normal, pointing into the aisle
    // ceiling at ASC with gold coffers
    const xa = sx * AW, xb2 = sx * AXO;
    const lo = Math.min(xa, xb2), hi = Math.max(xa, xb2);
    for (let bi = 0; bi < 6; bi++) {
      const z0 = PZ[bi], z1 = PZ[bi + 1];
      const nb = 4, na = 5;
      for (let j = 0; j < nb; j++) {
        for (let i = 0; i < na; i++) {
          const x0 = lo + ((hi - lo) * i) / na, x1 = lo + ((hi - lo) * (i + 1)) / na;
          const za = z0 + ((z1 - z0) * j) / nb, zb = z0 + ((z1 - z0) * (j + 1)) / nb;
          b.quad([x0, ASC, za], [x1, ASC, za], [x1, ASC, zb], [x0, ASC, zb], mixc(STONE_C, BLUE_D, 0.16 + R() * 0.2), M_PAINT, [0, -1, 0]);
        }
      }
      // transverse ribs under the aisle ceiling
      b.quad([lo, ASC - 0.3, z0 - 0.25], [hi, ASC - 0.3, z0 - 0.25], [hi, ASC - 0.3, z0 + 0.25], [lo, ASC - 0.3, z0 + 0.25], GOLD, M_GOLDI, [0, -1, 0]);
      // gilded bosses
      for (let j = 0; j < 4; j++) {
        const zc = z0 + ((z1 - z0) * (j + 0.5)) / 4;
        discY(b, (lo + hi) / 2, ASC - 0.34, zc, 0.42, 8, GOLD, M_GOLDB, 1, -1);
      }
      // outer wall: window + chapel niche
      const zc = (z0 + z1) / 2;
      putR(b, xo - sx * 0.04, 0, zc, sx > 0 ? -Math.PI / 2 : Math.PI / 2, () =>
        lancetWin(b, 2.0, 4.0, 15.0, 17.6, 0.02, M_GLASS_I, M_IN2, 0.32, STONE_C, SG, { cols: 3, rows: 6 }));
      // chapel niche: a blind arch with an altar, a statue and candles
      buildChapel(b, R, ctx, sx, zc + 2.5);
    }
    // outer wall interior face segments (with the windows and niches applied on top)
    for (let bi = 0; bi < 6; bi++) {
      const z0 = PZ[bi], z1 = PZ[bi + 1];
      b.quad([xo, FL, z0], [xo, FL, z1], [xo, ASC, z1], [xo, ASC, z0], STONE_C, M_IN, nOut);
    }
    // outer wall exterior + aisle roof
    b.quad([xe, 0, ZF], [xe, 0, ZB], [xe, 28.6, ZB], [xe, 28.6, ZF], STONE, M_EXT, [sx, 0, 0]);
    // parapet
    put(b, xe - sx * 0.1, 29.2, (ZF + ZB) / 2, () => box(b, 0.9, 1.4, ZF - ZB, MARBLE, M_EXT2));
    // aisle roof slope (from the outer parapet up to the clerestory wall)
    const rz0 = 29.4, rz1 = VSP - 4.4;
    b.quad([xe - sx * 0.5, rz0, ZF], [xe - sx * 0.5, rz0, ZB], [sx * AW, rz1, ZB], [sx * AW, rz1, ZF], SLATE, M_SLATE, [sx * 0.55, 0.83, 0]);
    // tile ridges on the aisle roof
    for (let i = 0; i < 14; i++) {
      const t = (i + 0.5) / 14;
      const z = ZF + (ZB - ZF) * t;
      b.push(T(0, 0, 0));
      const xA = xe - sx * 0.5, yA = rz0, xB = sx * AW, yB = rz1;
      bar3(b, [xA, yA + 0.06, z], [xB, yB + 0.06, z], 0.16, 0.12, SLATE_L, M_SLATE);
      b.pop();
    }
    // flying buttress piers + flyers
    for (const z of [-21.0, -34.0, -47.0, -60.0]) buildButtress(b, sx, z);
    // wainscot
    b.quad([xo - sx * 0.02, FL, ZF], [xo - sx * 0.02, FL, ZB], [xo - sx * 0.02, FL + 2.2, ZB], [xo - sx * 0.02, FL + 2.2, ZF], STONE_D, M_IN2, nOut);
    b.quad([xo - sx * 0.02, FL + 2.2, ZF], [xo - sx * 0.02, FL + 2.2, ZB], [xo - sx * 0.02, FL + 2.5, ZB], [xo - sx * 0.02, FL + 2.5, ZF], GOLD, M_GOLDI, nOut);
    // aisle east end wall
    b.quad([lo, FL, ZB], [hi, FL, ZB], [hi, ASC, ZB], [lo, ASC, ZB], STONE_C, M_IN, [0, 0, 1]);
  }
}
function buildChapel(b, R, ctx, sx, z) {
  const xo = sx * AXO;
  putR(b, xo - sx * 0.02, 0, z, sx > 0 ? -Math.PI / 2 : Math.PI / 2, () => {
    const N = [0, 0, 1];
    // blind arch niche
    b.quad([-1.9, 2.4, 0.02], [1.9, 2.4, 0.02], [1.9, 8.2, 0.02], [-1.9, 8.2, 0.02], NAVY, M_PAINT, N);
    archFrame(b, 1.9, 1.9, 0.03, 0.3, 0.26, STONE_C, M_IN2, 9, 8.2 + 1.9);
    b.quad([-2.2, 2.2, 0.05], [2.2, 2.2, 0.05], [2.2, 2.45, 0.05], [-2.2, 2.45, 0.05], GOLD, M_GOLDI, N);
    // altar
    b.push(T(0, 2.05, 0.5));
    box(b, 2.6, 0.22, 1.0, MARBLE, M_IN2);
    b.pop();
    b.push(T(0, 2.27, 0.5));
    box(b, 2.2, 0.08, 0.8, GOLD, M_GOLDI);
    b.pop();
    // statue
    put(b, 0, 2.3, 0.35, () => {
      lathe(b, [[0.3, 0], [0.26, 1.3], [0.34, 2.1], [0.2, 2.5]], 8, IVORY, M_IN2);
      sphere(b, 0.24, IVORY, M_IN2, { rings: 3, seg: 6, jitter: 0.03 });
      box(b, 0.5, 0.14, 0.5, GOLD, M_GOLDI);
    });
    // candles
    for (const dx of [-0.85, -0.55, 0.55, 0.85]) candle(b, dx, 2.3, 0.75, 0.6 + R() * 0.3, 0.9);
    void N;
  });
  flameAt(b, ctx, xo - sx * 1.2, 3.6, z + 0.6, 1.35, 0.5);
}
function buildButtress(b, sx, z) {
  const x = sx * 24.6;
  const n = [sx, 0, 0];
  // pier
  put(b, x, 17.0, z, () => {
    box(b, 3.2, 34.0, 3.2, STONE, M_EXT);
    box(b, 3.8, 0.8, 3.8, MARBLE, M_EXT2);
    box(b, 3.8, 0.8, 3.8, MARBLE, M_EXT2);
    put(b, 0, 14.2, 0, () => {
      box(b, 3.8, 1.0, 3.8, MARBLE, M_EXT2);
      cone(b, 2.0, 6.2, 0.9, STONE, M_EXT, 4);
      cone(b, 0.4, 1.8, 6.9, GOLD, M_GOLD, 4);
    });
    put(b, 0, 21.0, 0, () => {
      box(b, 3.6, 1.0, 3.6, MARBLE, M_EXT2);
      cone(b, 1.9, 5.6, 0.8, STONE, M_EXT, 4);
      cone(b, 0.38, 1.6, 6.2, GOLD, M_GOLD, 4);
    });
  });
  // flyer: from the pier head up to the clerestory wall
  bar3(b, [sx * 23.4, 31.0, z], [sx * 12.1, 40.0, z], 1.7, 1.9, STONE, M_EXT);
  bar3(b, [sx * 23.2, 26.6, z], [sx * 12.1, 34.6, z], 1.0, 1.1, mulc(STONE, 0.95), M_EXT);
  // small colonnettes on the flyer
  for (let i = 1; i <= 3; i++) {
    const t = i / 4;
    const px = sx * (23.4 + (12.1 - 23.4) * t), py = 31.0 + (40.0 - 31.0) * t;
    put(b, px, py + 1.1, z, () => {
      cylinder(b, 6, 0.28, 0.26, 2.2, STONE_W, M_EXT, { caps: true, y0: 0 });
      cone(b, 0.3, 1.0, 2.2, GOLD, M_GOLD, 4);
    });
  }
  void n;
}

// ================================================================ apse
function buildApse(b, R, ctx) {
  const SEG = 26;
  const A0 = -Math.PI / 2, A1 = Math.PI / 2;
  const P = (ang, r, y) => [Math.sin(ang) * r, y, ZB - Math.cos(ang) * r];
  // interior wall (up to the vault spring)
  for (let i = 0; i < SEG; i++) {
    const a0 = A0 + ((A1 - A0) * i) / SEG, a1 = A0 + ((A1 - A0) * (i + 1)) / SEG;
    const p00 = P(a0, ARI, FL), p10 = P(a1, ARI, FL), p01 = P(a0, ARI, VSP), p11 = P(a1, ARI, VSP);
    const am = (a0 + a1) / 2;
    const n = norm([-Math.sin(am), 0, Math.cos(am)]);
    b.quad([p11[0], p11[1], p11[2]], [p10[0], p10[1], p10[2]], [p00[0], p00[1], p00[2]], [p01[0], p01[1], p01[2]], STONE_C, M_IN, n);
  }
  // five tall lancets
  for (const th of [-1.16, -0.58, 0, 0.58, 1.16]) {
    const pos = P(th, ARI - 0.05, 0);
    putR(b, pos[0], 0, pos[2], -th, () =>
      lancetWin(b, 1.75, 4.4, 17.4, 20.6, 0.02, M_GLASS_I, M_IN2, 0.3, STONE_C, SG, { cols: 2, rows: 5 }));
  }
  // gold entablature ring at the spring
  for (let i = 0; i < SEG; i++) {
    const a0 = A0 + ((A1 - A0) * i) / SEG, a1 = A0 + ((A1 - A0) * (i + 1)) / SEG;
    const p0 = P(a0, ARI - 0.02, VSP - 0.8), p1 = P(a1, ARI - 0.02, VSP - 0.8), p2 = P(a1, ARI - 0.02, VSP), p3 = P(a0, ARI - 0.02, VSP);
    b.quad([p3[0], p3[1], p3[2]], [p2[0], p2[1], p2[2]], [p1[0], p1[1], p1[2]], [p0[0], p0[1], p0[2]], GOLD, M_GOLDI, norm([-Math.sin((a0 + a1) / 2), 0, Math.cos((a0 + a1) / 2)]));
  }
  // semi-dome (painted deep blue with gold stars)
  const DU = 9, DS = 24;
  const RY = VAP - VSP;
  for (let s = 0; s < DS; s++) {
    const a0 = A0 + ((A1 - A0) * s) / DS, a1 = A0 + ((A1 - A0) * (s + 1)) / DS;
    for (let u = 0; u < DU; u++) {
      const u0 = u / DU, u1 = (u + 1) / DU;
      const pt = (ang, uu) => {
        const c = Math.cos(uu * Math.PI / 2), sn = Math.sin(uu * Math.PI / 2);
        return [Math.sin(ang) * ARI * c, VSP + RY * sn, ZB - Math.cos(ang) * ARI * c];
      };
      const q00 = pt(a0, u0), q10 = pt(a1, u0), q01 = pt(a0, u1), q11 = pt(a1, u1);
      const am = (a0 + a1) / 2, um = (u0 + u1) / 2;
      const nrm = norm([-Math.sin(am) * Math.cos(um * Math.PI / 2), -Math.sin(um * Math.PI / 2) - 0.25, Math.cos(am) * Math.cos(um * Math.PI / 2)]);
      const col = mixc(BLUE_D, NAVY, 0.25 + R() * 0.4);
      b.quad(q00, q10, q11, q01, col, M_PAINT, nrm);
      if (R() < 0.16) {
        const s2 = 0.26 + R() * 0.2;
        b.quad([q00[0], q00[1] - 0.06, q00[2]], [(q00[0] + q10[0]) / 2, (q00[1] + q10[1]) / 2 - 0.1, (q00[2] + q10[2]) / 2],
          [q00[0] + s2, q00[1] - 0.06, q00[2]], [q00[0] - s2, q00[1] - 0.06, q00[2]], GOLD_B, M_GOLDB, nrm);
      }
    }
  }
  // meridian ribs on the semi-dome
  for (const th of [-1.42, -0.95, -0.47, 0, 0.47, 0.95, 1.42]) {
    for (let u = 0; u < DU; u++) {
      const u0 = u / DU, u1 = (u + 1) / DU;
      const pt = (ang, uu) => {
        const c = Math.cos(uu * Math.PI / 2), sn = Math.sin(uu * Math.PI / 2);
        return [Math.sin(ang) * (ARI - 0.12) * c, VSP + RY * sn - 0.12, ZB - Math.cos(ang) * (ARI - 0.12) * c];
      };
      const q00 = pt(th, u0), q01 = pt(th, u1);
      const tang = [0, 1, 0];
      void tang;
      const perp = norm([Math.cos(th), 0, Math.sin(th)]);
      b.quad([q00[0] - perp[0] * 0.22, q00[1], q00[2] - perp[2] * 0.22], [q00[0] + perp[0] * 0.22, q00[1], q00[2] + perp[2] * 0.22],
        [q01[0] + perp[0] * 0.22, q01[1], q01[2] + perp[2] * 0.22], [q01[0] - perp[0] * 0.22, q01[1], q01[2] - perp[2] * 0.22], GOLD, M_GOLDI, norm([-Math.sin(th), -0.5, Math.cos(th)]));
    }
  }
  // gold ring at the crown
  put(b, 0, VAP - 0.1, ZB, () => {
    cylinder(b, 12, 1.1, 0.7, 0.35, GOLD, M_GOLDB, { caps: true, y0: 0 });
    sphere(b, 0.45, GOLD_B, M_GOLDB, { rings: 3, seg: 6, jitter: 0.04 });
  });
  // exterior: wall + roof + windows
  for (let i = 0; i < SEG; i++) {
    const a0 = A0 + ((A1 - A0) * i) / SEG, a1 = A0 + ((A1 - A0) * (i + 1)) / SEG;
    const am = (a0 + a1) / 2;
    const p00 = P(a0, ARO, 0), p10 = P(a1, ARO, 0), p01 = P(a0, ARO, 46), p11 = P(a1, ARO, 46);
    const n = norm([Math.sin(am), 0, -Math.cos(am)]);
    b.quad([p00[0], p00[1], p00[2]], [p10[0], p10[1], p10[2]], [p11[0], p11[1], p11[2]], [p01[0], p01[1], p01[2]], STONE, M_EXT, n);
  }
  // exterior windows
  for (const th of [-1.16, -0.58, 0, 0.58, 1.16]) {
    const pos = P(th, ARO + 0.03, 0);
    putR(b, pos[0], 0, pos[2], Math.PI - th, () =>
      lancetWin(b, 1.85, 7.0, 22.0, 25.6, 0.02, M_GLASS_E, M_EXT2, 0.34, STONE_W, SG, { cols: 2, rows: 4 }));
  }
  // exterior semi-dome roof
  for (let s = 0; s < DS; s++) {
    const a0 = A0 + ((A1 - A0) * s) / DS, a1 = A0 + ((A1 - A0) * (s + 1)) / DS;
    for (let u = 0; u < 5; u++) {
      const u0 = u / 5, u1 = (u + 1) / 5;
      const pt = (ang, uu) => {
        const c = Math.cos(uu * Math.PI / 2), sn = Math.sin(uu * Math.PI / 2);
        return [Math.sin(ang) * (ARO + 0.3) * c, 46 + 8.4 * sn, ZB - Math.cos(ang) * (ARO + 0.3) * c];
      };
      const am = (a0 + a1) / 2;
      b.quad(pt(a0, u0), pt(a1, u0), pt(a1, u1), pt(a0, u1), SLATE, M_SLATE, norm([Math.sin(am) * 0.7, 0.7, -Math.cos(am) * 0.7]));
    }
  }
  put(b, 0, 54.4, ZB, () => {
    cylinder(b, 8, 0.7, 0.3, 1.4, GOLD, M_GOLD, { caps: true, y0: 0 });
    sphere(b, 0.35, GOLD_B, M_GOLDB, { rings: 3, seg: 6, jitter: 0.03 });
  });
  // apse buttress fins
  for (const th of [-1.42, -0.78, -0.16, 0.48, 1.12]) {
    const pos = P(th, ARO + 0.9, 0);
    putR(b, pos[0], 0, pos[2], Math.PI - th, () => {
      put(b, 0, 20, 0, () => box(b, 1.1, 40, 2.6, STONE, M_EXT));
      put(b, 0, 40, 0, () => {
        box(b, 1.4, 1.0, 3.0, MARBLE, M_EXT2);
        cone(b, 0.85, 3.6, 1.0, STONE, M_EXT, 4);
        cone(b, 0.26, 1.2, 4.6, GOLD, M_GOLD, 4);
      });
    });
  }
  void ctx;
}

// ================================================================ crossing tower + fleche
function buildCrossing(b, R, ctx) {
  const cz = -41.0;
  const y0 = 44.0, y1 = 82.0;
  // four corner piers + arched openings
  for (const cx of [-1, 1]) for (const c2 of [-1, 1]) {
    put(b, cx * 6.6, (y0 + y1) / 2, cz + c2 * 6.6, () => {
      box(b, 3.0, y1 - y0, 3.0, STONE_W, M_EXT);
      for (const yy of [-10.0, 10.0]) box(b, 3.5, 0.7, 3.5, MARBLE, M_EXT2);
    });
  }
  // four faces: belfry windows (dark glass)
  const fy0 = y0 + 4, fy1 = y1 - 4;
  for (const sz of [-1, 1]) {
    putR(b, 0, 0, cz + sz * 8.0, sz > 0 ? 0 : Math.PI, () => {
      b.quad([-7.9, y0, 0.01], [7.9, y0, 0.01], [7.9, fy0, 0.01], [-7.9, fy0, 0.01], STONE_W, M_EXT, [0, 0, 1]);
      archWallZ(b, -7.9, 7.9, fy0, fy1, 0, 4.4, 4.4, fy0 + 1.0, 0.02, STONE_W, M_EXT, [0, 0, 1], 14);
      b.quad([-4.4, fy0 + 1.0, 0.05], [4.4, fy0 + 1.0, 0.05], [4.4, fy0 + 1.0 + 4.4, 0.05], [-4.4, fy0 + 1.0 + 4.4, 0.05], BLUE_M, M_DARKGL, [0, 0, 1]);
      b.quad([-4.4, fy0 + 1.0, 0.05], [4.4, fy0 + 1.0, 0.05], [4.4, fy1, 0.05], [-4.4, fy1, 0.05], BLUE_M, M_DARKGL, [0, 0, 1]);
      archFrame(b, 4.4, 4.4, 0.08, 0.45, 0.3, GOLD, M_GOLD, 10, fy0 + 1.0 + 4.4);
    });
  }
  for (const sx of [-1, 1]) {
    putR(b, sx * 8.0, 0, cz, sx > 0 ? Math.PI / 2 : -Math.PI / 2, () => {
      b.quad([-7.9, y0, 0.01], [7.9, y0, 0.01], [7.9, fy0, 0.01], [-7.9, fy0, 0.01], STONE_W, M_EXT, [0, 0, 1]);
      archWallZ(b, -7.9, 7.9, fy0, fy1, 0, 4.4, 4.4, fy0 + 1.0, 0.02, STONE_W, M_EXT, [0, 0, 1], 14);
      b.quad([-4.4, fy0 + 1.0, 0.05], [4.4, fy0 + 1.0, 0.05], [4.4, fy0 + 1.0 + 4.4, 0.05], [-4.4, fy0 + 1.0 + 4.4, 0.05], BLUE_M, M_DARKGL, [0, 0, 1]);
      b.quad([-4.4, fy0 + 1.0, 0.05], [4.4, fy0 + 1.0, 0.05], [4.4, fy1, 0.05], [-4.4, fy1, 0.05], BLUE_M, M_DARKGL, [0, 0, 1]);
      archFrame(b, 4.4, 4.4, 0.08, 0.45, 0.3, GOLD, M_GOLD, 10, fy0 + 1.0 + 4.4);
    });
  }
  // string courses, cornice, parapet pinnacles
  for (const yy of [y0 + 1.0, y1 - 1.4]) put(b, 0, yy, cz, () => box(b, 17.4, 0.9, 17.4, MARBLE, M_EXT2));
  put(b, 0, y1 + 0.4, cz, () => box(b, 18.4, 1.4, 18.4, STONE, M_EXT));
  for (const cx of [-1, 1]) for (const c2 of [-1, 1]) {
    put(b, cx * 7.6, y1 + 3.0, cz + c2 * 7.6, () => {
      box(b, 2.0, 4.2, 2.0, STONE_W, M_EXT);
      cone(b, 1.3, 5.2, 4.2, STONE, M_EXT, 4);
      cone(b, 0.4, 1.6, 9.0, GOLD, M_GOLD, 4);
    });
  }
  // FOUR gold clock dials, one per face, at y 70
  const faces = [
    [0, 70, cz + 8.3, 0],
    [0, 70, cz - 8.3, Math.PI],
    [8.3, 70, cz, Math.PI / 2],
    [-8.3, 70, cz, -Math.PI / 2],
  ];
  for (const f of faces) {
    putR(b, f[0], f[1], f[2], f[3], () => clockDial(b, 5.2));
    if (ctx && ctx.lanterns) {
      const dx = Math.sin(f[3]) * 2.4, dz = Math.cos(f[3]) * 2.4;
      ctx.lanterns.push({ p: W(f[0] + dx, f[1], f[2] + dz), size: 11.0, rot: 0, alpha: 0.19, shape: 1, col: C.goldBright });
    }
  }
  // belfry stage above (82..92) + fleche
  put(b, 0, (y1 + 92) / 2, cz, () => {
    box(b, 13.4, 92 - y1, 13.4, STONE_W, M_EXT);
    box(b, 14.4, 0.9, 14.4, MARBLE, M_EXT2);
  });
  for (const sz of [-1, 1]) putR(b, 0, y1 + 2.0, cz + sz * 6.72, sz > 0 ? 0 : Math.PI, () => lancetWin(b, 1.9, 0, 4.0, 5.6, 0.02, M_DARKGL, M_EXT2, 0.24, STONE_W, [BLUE_M, NAVY], { cols: 2, rows: 2 }));
  for (const sx of [-1, 1]) putR(b, sx * 6.72, y1 + 2.0, cz, sx > 0 ? Math.PI / 2 : -Math.PI / 2, () => lancetWin(b, 1.9, 0, 4.0, 5.6, 0.02, M_DARKGL, M_EXT2, 0.24, STONE_W, [BLUE_M, NAVY], { cols: 2, rows: 2 }));
  put(b, 0, 92.6, cz, () => box(b, 14.0, 1.1, 14.0, GOLD, M_GOLD));
  put(b, 0, 93.2, cz, () => cylinder(b, 8, 5.2, 0.15, 20.0, SLATE, M_SLATE, { caps: true, y0: 0 }));
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU;
    bar3(b, [Math.cos(a) * 5.0, 93.2, cz + Math.sin(a) * 5.0], [0, 112.6, cz], 0.24, 0.26, GOLD, M_GOLD);
    for (let j = 1; j <= 6; j++) {
      const t = j / 7;
      put(b, Math.cos(a) * 5.0 * (1 - t), 93.2 + 19.4 * t, cz + Math.sin(a) * 5.0 * (1 - t), () => box(b, 0.26, 0.36, 0.26, GOLD_D, M_GOLD));
    }
  }
  put(b, 0, 93.2, cz, () => {
    coneBand(b, 5.2, 19.4, 5.0, 0.34, GOLD, M_GOLD, 8);
    coneBand(b, 5.2, 19.4, 12.0, 0.3, GOLD, M_GOLD, 8);
  });
  put(b, 0, 112.8, cz, () => {
    cylinder(b, 8, 0.8, 0.36, 1.5, GOLD, M_GOLD, { caps: true, y0: 0 });
    finialCross(b, 0, 1.6, 0, 1.0);
  });
  void R;
}

// ================================================================ choir / sanctuary
function buildChoir(b, R, ctx) {
  // communion rail
  const rz = -63.0;
  put(b, 0, FL + 0.55, rz, () => {
    box(b, 8.6, 0.2, 0.28, GOLD, M_GOLDB);
    box(b, 8.6, 0.14, 0.2, MARBLE, M_IN2);
  });
  for (const sx of [-1, 1]) for (let i = 0; i < 5; i++) {
    const x = sx * (1.2 + i * 1.8);
    candle(b, x, FL + 0.7, rz, 0.75, 0.85);
  }
  // choir stalls: two banks of canopied seats facing each other
  for (const sx of [-1, 1]) {
    for (let row = 0; row < 4; row++) {
      const x = sx * (6.4 + row * 1.35);
      const z0 = -62.0, z1 = -71.5;
      put(b, x, FL + 0.24, (z0 + z1) / 2, () => {
        box(b, 1.0, 0.48, z1 - z0, WOOD, M_WOOD);
        box(b, 1.06, 0.10, z1 - z0, WOOD_D, M_WOODD);
      });
      // stall dividers + back + canopy
      for (let k = 0; k < 6; k++) {
        const z = z0 + ((z1 - z0) * (k + 0.5)) / 6;
        put(b, x + sx * 0.7, FL + 0.7, z, () => {
          box(b, 0.16, 1.4, 1.5, WOOD_D, M_WOODD);
          box(b, 0.2, 0.1, 1.6, GOLD, M_GOLDI);
        });
      }
      put(b, x + sx * 0.95, FL + 2.0, (z0 + z1) / 2, () => box(b, 0.3, 3.2, z1 - z0, WOOD, M_WOOD));
      // canopy over the stalls
      put(b, x, FL + 4.1, (z0 + z1) / 2, () => {
        box(b, 1.5, 0.22, z1 - z0, WOOD_D, M_WOODD);
        for (let k = 0; k < 8; k++) {
          const z = z0 + ((z1 - z0) * (k + 0.5)) / 8;
          box(b, 1.7, 0.55, 0.16, GOLD, M_GOLDI);
          void z;
        }
      });
      // finials above the canopy
      for (let k = 0; k < 7; k++) {
        const z = z0 + ((z1 - z0) * (k + 0.5)) / 7;
        put(b, x, FL + 4.4, z, () => cone(b, 0.22, 0.9, 0, GOLD, M_GOLDB, 4));
      }
    }
    // a gold eagle lectern at the choir entrance
    put(b, sx * 5.0, FL, -60.6, () => {
      cylinder(b, 8, 0.7, 0.5, 0.25, MARBLE, M_IN2, { caps: true, y0: 0 });
      cylinder(b, 6, 0.18, 0.14, 1.5, GOLD, M_GOLDB, { caps: true, y0: 0.25 });
      box(b, 0.9, 0.16, 0.65, GOLD, M_GOLDB);
      b.push(T(0, 1.85, 0));
      box(b, 0.7, 0.1, 0.55, C.marble, M_IN2);
      b.pop();
    });
    candleAt(b, ctx, sx * 5.0, FL + 2.1, -60.6);
  }
  // high altar: platform + table + gold retable screen + crucifix + candles
  const az = -71.6;
  put(b, 0, FL + 0.62, az + 0.6, () => box(b, 8.4, 0.5, 3.4, MARBLE, M_IN2));
  put(b, 0, FL + 0.9, az + 0.6, () => box(b, 7.6, 0.12, 2.9, GOLD, M_GOLDB));
  put(b, 0, FL + 1.5, az, () => {
    box(b, 4.6, 1.1, 1.6, MARBLE, M_IN2);
    box(b, 4.9, 0.16, 1.9, GOLD, M_GOLDB);
    box(b, 4.2, 0.14, 1.2, C.marbleShade, M_IN2);
  });
  // altar front panel (gold relief)
  put(b, 0, FL + 1.35, az + 0.82, () => {
    box(b, 4.4, 0.85, 0.1, GOLD, M_GOLDB);
    for (let i = 0; i < 5; i++) {
      discZ(b, -1.6 + i * 0.8, 0, 0.57, 0.28, 8, GOLD_B, M_GOLDB);
    }
  });
  // crucifix
  put(b, 0, FL + 2.2, az - 0.3, () => {
    box(b, 0.18, 2.0, 0.18, GOLD, M_GOLDB);
    box(b, 1.2, 0.18, 0.18, GOLD, M_GOLDB);
    box(b, 0.3, 0.5, 0.24, IVORY, M_IN2);
  });
  // candles on the altar
  for (const x of [-1.9, -1.4, 1.4, 1.9]) {
    candle(b, x, FL + 2.05, az - 0.1, 1.5, 1.2);
    flameAt(b, ctx, x, FL + 3.7, az - 0.1, 1.4, 0.55);
  }
  // gold reredos screen behind the altar: two panels + a bridging arch (centre open)
  for (const sx of [-1, 1]) {
    put(b, sx * 3.5, FL + 8.0, az - 8.1, () => {
      box(b, 2.2, 16.0, 0.8, GOLD, M_GOLDB);
      for (let i = 0; i < 3; i++) put(b, 0, -7.0 + i * 7.0, 0, () => box(b, 2.5, 0.35, 1.0, GOLD_B, M_GOLDB));
      for (let i = 0; i < 3; i++) {
        put(b, 0, 4.0 + i * 6.2, 0.5, () => {
          b.quad([-1.2, 0, 0], [1.2, 0, 0], [1.2, 3.6, 0], [-1.2, 3.6, 0], NAVY, M_PAINT, [0, 0, 1]);
          archFrame(b, 1.2, 1.2, 0.04, 0.2, 0.2, GOLD_B, M_GOLDB, 6, 0);
        });
      }
      void sx;
    });
  }
  // bridging arch above the central opening (y 10.5 .. 22)
  for (let i = 0; i < 16; i++) {
    const xa = -3.9 + (7.8 * i) / 16, xb = -3.9 + (7.8 * (i + 1)) / 16;
    const ya = 10.4 + archY(3.9, 3.9, xa), yb2 = 10.4 + archY(3.9, 3.9, xb);
    b.quad([xa, ya, az - 8.5], [xb, yb2, az - 8.5], [xb, 16.0, az - 8.5], [xa, 16.0, az - 8.5], GOLD, M_GOLDB, [0, 0, 1]);
  }
  voussoirs(b, 3.9, 3.9, az - 8.4, 0.5, 0.5, 0.9, GOLD_B, M_GOLDB, 12, 10.4);
  // gold sanctuary lamp hanging in the apse
  put(b, 0, 15.0, ZB - 3.0, () => {
    cylinder(b, 6, 0.06, 0.06, 5.0, GOLD, M_GOLDB, { caps: false, y0: 0 });
    lathe(b, [[0.16, 0], [0.7, 0.3], [0.5, 0.8], [0.3, 1.0]], 10, GOLD, M_GOLDB);
  });
  // apse statues in the ambulatory
  for (const sx of [-1, 1]) {
    put(b, sx * 8.6, FL, ZB - 2.4, () => {
      box(b, 1.5, 1.2, 1.5, MARBLE, M_IN2);
      box(b, 1.7, 0.16, 1.7, GOLD, M_GOLDB);
      lathe(b, [[0.42, 0], [0.36, 1.7], [0.46, 2.7], [0.3, 3.2]], 8, IVORY, M_IN2);
      sphere(b, 0.3, IVORY, M_IN2, { rings: 3, seg: 6, jitter: 0.03 });
    });
    flameAt(b, ctx, sx * 8.6, FL + 4.0, ZB - 2.4, 1.8, 0.45);
  }
  void R;
}
function candleAt(b, ctx, x, y, z) {
  candle(b, x, y, z, 1.1, 1.1);
  flameAt(b, ctx, x, y + 1.5, z, 1.6, 0.5);
}

// ================================================================ pews
function buildPews(b, R) {
  const rows = 13;
  for (const sx of [-1, 1]) {
    for (let r = 0; r < rows; r++) {
      const z = -20.5 - r * 2.85;
      const x0 = sx * 2.9, x1 = sx * 9.4;
      const xm = (x0 + x1) / 2, w = Math.abs(x1 - x0);
      put(b, xm, FL, z, () => {
        // seat, back, kneeler
        box(b, w, 0.14, 0.62, WOOD, M_WOOD);
        put(b, 0, 0.42, 0.0, () => box(b, w, 0.1, 0.7, WOOD_L, M_WOOD));
        put(b, 0, 0.95, -0.34, () => box(b, w, 0.72, 0.12, WOOD, M_WOOD));
        put(b, 0, 1.34, -0.3, () => box(b, w, 0.1, 0.2, WOOD_D, M_WOODD));
        box(b, w, 0.1, 0.2, WOOD_D, M_WOODD);
        // ends
        for (const s2 of [-1, 1]) {
          put(b, s2 * (w / 2 - 0.06), 0.62, 0, () => {
            box(b, 0.13, 1.2, 0.78, WOOD_D, M_WOODD);
            cone(b, 0.16, 0.7, 1.2, WOOD_D, M_WOODD, 4);
          });
        }
        // book rail
        put(b, 0, 1.42, -0.06, () => box(b, w - 0.2, 0.07, 0.22, WOOD_D, M_WOODD));
        if (r === 0) {
          // gilded front panel of the first row
          put(b, 0, 0.55, 0.38, () => {
            box(b, w, 0.8, 0.08, GOLD, M_GOLDI);
            for (let i = 0; i < 5; i++) discY(b, -w / 2 + 1.0 + i * 1.4, 0, 0.06, 0.28, 6, GOLD_B, M_GOLDB);
          });
        }
      });
    }
  }
  // nave carpet borders flanking the pews
  for (const sx of [-1, 1]) {
    const y = FL + 0.02;
    b.quad([sx * 2.6, y, -19.6], [sx * 2.95, y, -19.6], [sx * 2.95, y, -58.0], [sx * 2.6, y, -58.0], BLUE_D, M_CLOTH, [0, 1, 0]);
  }
  void R;
}

// ================================================================ organ loft
// A west gallery above the portal, below the rose window (which is centred at
// y 33.4 with r 8.2, so its sill is at 25.2). The loft deck is at y 15 and the
// case tops out at ~24 so the rose window stays visible from the nave.
function buildOrgan(b, R, ctx) {
  const zf = ZF, z0 = ZF - 3.4;
  const DECK = 15.0;
  // loft deck + gold edge
  put(b, 0, DECK, (zf + z0) / 2, () => box(b, 2 * 8.6, 0.6, 3.4, STONE_C, M_IN));
  put(b, 0, DECK + 0.4, (zf + z0) / 2, () => box(b, 2 * 8.3, 0.16, 3.2, GOLD, M_GOLDI));
  // balustrade along the nave side
  put(b, 0, DECK + 0.55, z0 + 0.15, () => {
    box(b, 2 * 8.6, 0.18, 0.3, GOLD, M_GOLDB);
    for (let i = 0; i < 26; i++) {
      const x = -8.3 + (16.6 * i) / 25;
      put(b, x, 0.55, 0, () => box(b, 0.16, 1.0, 0.22, GOLD_D, M_GOLDI));
    }
    box(b, 2 * 8.6, 0.16, 0.34, MARBLE, M_IN2);
  });
  // corbelled supports under the loft
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) {
    const x = sx * (2.4 + i * 2.6);
    put(b, x, DECK - 1.5, zf + 1.0, () => {
      b.push([1, 0, 0, 0, 0, 0.7, -0.7, 0, 0, 0.7, 0.7, 0, 0, 0, 0, 1]);
      box(b, 0.6, 1.6, 1.6, STONE_C, M_IN2);
      b.pop();
      box(b, 0.9, 0.4, 0.9, GOLD, M_GOLDI);
    });
  }
  // case: three towers of gold pipes on a dark wood chest
  const caseY = DECK + 0.6;
  const towers = [
    [-6.0, 4.4, 8, 10], [-3.3, 5.6, 10, 12], [0.0, 7.0, 12, 14], [3.3, 5.6, 10, 12], [6.0, 4.4, 8, 10],
  ];
  for (const [px, hh, n, nr] of towers) {
    put(b, px, caseY, zf - 1.5, () => {
      box(b, 2.5, 1.1, 2.0, WOOD_D, M_WOODD);
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const r = 0.14 + 0.09 * Math.sin(t * Math.PI);
        const h = hh * (0.74 + 0.26 * Math.sin(t * Math.PI));
        const x = -0.95 + 1.9 * t;
        put(b, x, 0.85, 0, () => {
          cylinder(b, nr, r, r * 0.86, h, GOLD, M_GOLDB, { caps: true, y0: 0 });
          cylinder(b, nr, r * 0.6, r * 0.5, h * 0.2, GOLD_B, M_GOLDB, { caps: false, y0: h * 0.56 });
        });
      }
      put(b, 0, 0.95, 0.15, () => {
        box(b, 2.9, 0.36, 2.2, WOOD_D, M_WOODD);
        box(b, 3.1, 0.14, 2.4, GOLD, M_GOLDI);
        cone(b, 0.85, 1.4, 0.45, GOLD_D, M_GOLDI, 4);
      });
    });
  }
  // organ bench and music desk
  put(b, 0, DECK + 1.3, zf - 0.9, () => {
    box(b, 4.2, 0.16, 0.7, WOOD, M_WOOD);
    box(b, 4.0, 0.9, 0.1, WOOD_D, M_WOODD);
  });
  // deck rail candles
  for (const x of [-7.4, -4.6, 4.6, 7.4]) candle(b, x, DECK + 0.7, z0 + 0.1, 0.8, 0.9);
  flameAt(b, ctx, 0, 24.0, zf - 1.4, 3.2, 0.5);
  void R;
}

// ================================================================ statues, banners, chandeliers
function buildStatuary(b, R, ctx) {
  // nave piers: statue on a bracket facing the nave
  for (const sx of [-1, 1]) {
    for (let pi = 1; pi < 6; pi += 1) {
      const z = PZ[pi];
      const x = sx * (NX - 0.5);
      putR(b, x, 6.4, z, sx > 0 ? -Math.PI / 2 : Math.PI / 2, () => {
        box(b, 1.0, 0.4, 0.8, GOLD, M_GOLDB);
        box(b, 0.9, 0.9, 0.7, STONE_C, M_IN2);
        lathe(b, [[0.34, 0], [0.28, 1.1], [0.38, 1.8], [0.24, 2.2]], 8, IVORY, M_IN2);
        sphere(b, 0.26, IVORY, M_IN2, { rings: 3, seg: 6, jitter: 0.03 });
        box(b, 0.34, 0.5, 0.2, GOLD_B, M_GOLDB);
      });
      flameAt(b, ctx, x - sx * 0.5, 9.4, z, 1.6, 0.42);
      // banner hanging from the pier
      if (pi % 2 === 0) {
        putR(b, x - sx * 0.4, 12.2, z + 0.4, sx > 0 ? -Math.PI / 2 : Math.PI / 2, () => {
          cylinder(b, 6, 0.06, 0.06, 1.9, GOLD, M_GOLDB, { caps: true, y0: -0.95 });
          b.push([0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1]);
          for (let i = 0; i < 4; i++) {
            const y0 = -i * 0.85, y1 = -(i + 1) * 0.85;
            const sw = 0.1 * Math.sin(i * 1.4);
            b.quad([-0.85 + sw, y0, 0], [0.85 + sw, y0, 0], [0.85 + sw * 0.6, y1, 0], [-0.85 + sw * 0.6, y1, 0], i % 2 ? RED_V : RED_C, M_CLOTH, [0, 0, 1]);
          }
          b.pop();
          star(b, 0.3, 0.12, 5, 0.06, GOLD_B, M_GOLDB);
        });
      }
    }
  }
  // chandeliers: two rows of four, hung off the vault
  for (const sx of [-1, 1]) {
    for (const z of [-15.5, -27.5, -39.5, -51.5]) buildChandelier(b, R, ctx, sx * 3.4, z);
  }
  // standing candelabra along the nave
  for (const sx of [-1, 1]) for (const z of [-13.0, -23.0, -35.0, -47.0, -58.0]) candelabrum(b, ctx, sx * 10.1, z, R);
  // pulpit (off axis, on the left arcade pier)
  put(b, -9.4, FL, -33.0, () => {
    cylinder(b, 8, 1.2, 0.9, 0.5, MARBLE, M_IN2, { caps: true, y0: 0 });
    cylinder(b, 8, 0.8, 0.7, 2.2, STONE_C, M_IN2, { caps: true, y0: 0.5 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      b.quad([Math.cos(a) * 1.0, 2.7, Math.sin(a) * 1.0], [Math.cos(a + 0.9) * 1.0, 2.7, Math.sin(a + 0.9) * 1.0],
        [Math.cos(a + 0.9) * 1.0, 3.3, Math.sin(a + 0.9) * 1.0], [Math.cos(a) * 1.0, 3.3, Math.sin(a) * 1.0], GOLD, M_GOLDI);
    }
    discY(b, 0, 3.3, 0, 1.2, 10, GOLD, M_GOLDB);
    cylinder(b, 6, 0.1, 0.08, 1.0, WOOD_D, M_WOODD, { caps: true, y0: 3.3 });
  });
  flameAt(b, ctx, -9.4, 6.0, -33.0, 2.0, 0.4);
  // nave floor candle cross (Easter candlestick)
  put(b, 2.4, FL, -59.5, () => {
    cylinder(b, 8, 0.9, 0.5, 0.35, GOLD, M_GOLDB, { caps: true, y0: 0 });
    cylinder(b, 6, 0.16, 0.12, 2.6, GOLD, M_GOLDB, { caps: true, y0: 0.35 });
    cylinder(b, 5, 0.2, 0.12, 0.5, CANDLE, M_CANDLE, { caps: true, y0: 2.95 });
    cylinder(b, 4, 0.14, 0.02, 0.3, FLAME, M_FLAME, { caps: true, y0: 3.45 });
  });
  flameAt(b, ctx, 2.4, FL + 3.9, -59.5, 2.2, 0.55);
  void R;
}
function buildChandelier(b, R, ctx, x, z) {
  const bodyY = 21.0;
  const topY = vaultY(x) - 0.4;
  put(b, x, bodyY, z, () => {
    cylinder(b, 6, 0.05, 0.05, topY - bodyY - 1.2, GOLD, M_GOLDB, { caps: false, y0: 1.0 });
    box(b, 0.5, 0.34, 0.5, GOLD_B, M_GOLDB);
    lathe(b, [[0.12, 0], [0.8, 0.28], [0.55, 0.62], [0.2, 0.85]], 12, GOLD, M_GOLDB);
    torus(b, 2.0, 0.09, 16, 4, GOLD, M_GOLDB, 'y');
    torus(b, 1.2, 0.06, 12, 4, GOLD_B, M_GOLDB, 'y');
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      bar3(b, [0, 0, 0], [Math.cos(a) * 2.0, 0, Math.sin(a) * 2.0], 0.05, 0.05, GOLD, M_GOLDB);
    }
  });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    const cx = x + Math.cos(a) * 2.0, cz = z + Math.sin(a) * 2.0;
    candle(b, cx, bodyY + 0.08, cz, 0.55, 0.9);
    flameAt(b, ctx, cx, bodyY + 0.9, cz, 1.0 + R() * 0.2, 0.62);
    put(b, cx * 0.98 + 0.02, bodyY - 0.4, cz * 0.98, () => sphere(b, 0.12, rgb('#cfe4ff'), [0.5, 0.9], { rings: 3, seg: 5, jitter: 0.02 }));
  }
  flameAt(b, ctx, x, bodyY + 0.9, z, 4.2, 0.4, C.cityGlow);
}
function candelabrum(b, ctx, x, z, R) {
  put(b, x, FL, z, () => {
    cylinder(b, 10, 0.55, 0.4, 0.28, STONE_D, M_IN2, { caps: true, y0: 0 });
    cylinder(b, 8, 0.1, 0.08, 2.4, GOLD, M_GOLDB, { caps: false, y0: 0.28 });
    cylinder(b, 8, 0.3, 0.2, 0.15, GOLD, M_GOLDB, { caps: true, y0: 2.6 });
    for (const dx of [-0.55, 0, 0.55]) {
      bar3(b, [0, 2.55, 0], [dx, 2.95, 0], 0.06, 0.06, GOLD, M_GOLDB);
      candle(b, dx, 2.95, 0, 0.55, 0.9);
    }
    sphere(b, 0.14, GOLD_B, M_GOLDB, { rings: 3, seg: 5, jitter: 0.02 });
  });
  flameAt(b, ctx, x, FL + 3.8, z, 1.9, 0.55);
  void R;
}

// ================================================================ nave roof / exterior detail
function buildNaveRoof(b, R) {
  const yE = 47.0, yR = 57.0;
  for (const sx of [-1, 1]) {
    // exterior clerestory wall (above the aisle roof)
    b.quad([sx * AW, 27.0, ZF], [sx * AW, 27.0, ZB], [sx * AW, yE, ZB], [sx * AW, yE, ZF], STONE, M_EXT, [sx, 0, 0]);
    // exterior clerestory windows
    for (let bi = 0; bi < 6; bi++) {
      const z0 = PZ[bi], z1 = PZ[bi + 1];
      for (let k = 0; k < 2; k++) {
        const zc = z0 + ((z1 - z0) * (k + 0.5)) / 2;
        putR(b, sx * (AW + 0.03), 0, zc, sx > 0 ? Math.PI / 2 : -Math.PI / 2, () =>
          lancetWin(b, 1.7, 30.0, 42.0, 45.0, 0.02, M_GLASS_E, M_EXT2, 0.3, STONE_W, SG, { cols: 2, rows: 4 }));
      }
    }
    // parapet + pinnacles on the clerestory eaves
    put(b, sx * (AW + 0.2), yE + 0.6, (ZF + ZB) / 2, () => box(b, 1.0, 1.6, ZF - ZB, MARBLE, M_EXT2));
    for (let i = 0; i < 5; i++) {
      const z = ZF - 6 - i * 13.0;
      put(b, sx * (AW + 0.2), yE + 1.3, z, () => {
        box(b, 1.2, 1.2, 1.2, STONE, M_EXT);
        cone(b, 1.0, 4.0, 1.2, STONE, M_EXT, 4);
        cone(b, 0.32, 1.4, 5.2, GOLD, M_GOLD, 4);
      });
    }
    // roof slope
    b.quad([sx * (AW + 0.6), yE, ZF], [sx * (AW + 0.6), yE, ZB], [0, yR, ZB], [0, yR, ZF], SLATE, M_SLATE, [sx * 0.62, 0.78, 0]);
    // slate ridges
    for (let i = 0; i < 20; i++) {
      const t = (i + 0.5) / 20;
      const z = ZF + (ZB - ZF) * t;
      bar3(b, [sx * (AW + 0.6), yE + 0.05, z], [0, yR + 0.05, z], 0.14, 0.1, SLATE_L, M_SLATE);
    }
    // horizontal courses of slates
    for (let k = 1; k < 6; k++) {
      const t = k / 6;
      const px = sx * (AW + 0.6) * (1 - t), py = yE + (yR - yE) * t + 0.03;
      b.quad([px, py, ZF], [px + sx * 0.2, py + 0.03, ZF], [px + sx * 0.2, py + 0.03, ZB], [px, py, ZB], mulc(SLATE_L, 1.05), M_SLATE, [sx * 0.62, 0.78, 0]);
    }
  }
  // ridge cresting + finials
  put(b, 0, yR + 0.2, (ZF + ZB) / 2, () => box(b, 0.7, 0.5, ZF - ZB, SLATE_D, M_SLATE));
  for (let i = 0; i < 11; i++) {
    const z = ZF - 2 - i * 6.1;
    put(b, 0, yR + 0.5, z, () => {
      box(b, 0.22, 0.9, 0.22, GOLD, M_GOLD);
      star(b, 0.34, 0.14, 4, 0.1, GOLD_B, M_GOLDB);
    });
  }
  // east gable (closing the nave roof at the apse end)
  put(b, 0, 0, 0, () => {
    b.tri([-AW - 0.6, yE, ZB], [AW + 0.6, yE, ZB], [0, yR, ZB], STONE, M_EXT, [0, 0, -1], [0, 0, -1], [0, 0, -1]);
    bar3(b, [-AW - 0.6, yE + 0.1, ZB - 0.2], [0, yR, ZB - 0.2], 0.4, 0.4, GOLD, M_GOLD);
    bar3(b, [AW + 0.6, yE + 0.1, ZB - 0.2], [0, yR, ZB - 0.2], 0.4, 0.4, GOLD, M_GOLD);
  });
  // west gable above the facade (so the roof reads closed from the west)
  b.tri([-AW - 0.6, yE, ZF], [AW + 0.6, yE, ZF], [0, yR, ZF], STONE, M_EXT, [0, 0, 1], [0, 0, 1], [0, 0, 1]);
  void R;
}


// ================================================================ extra detail
// A second pass of ornament that also carries the module's triangle budget:
// the apse ambulatory arcade, the nave labyrinth, the choir screen, aisle
// arcading + pinnacles, more banners and a pair of extra chandeliers.
function buildDetail(b, R, ctx) {
  // ---- apse ambulatory: 12 clustered columns on a ring (gap on the axis)
  const AR = 9.5, CH = 15.2;
  for (let i = 0; i < 6; i++) {
    for (const s of [-1, 1]) {
      const th = s * (0.18 + i * 0.24);
      const x = Math.sin(th) * AR, z = ZB - Math.cos(th) * AR;
      put(b, x, FL, z, () => {
        cylinder(b, 8, 0.62, 0.54, 0.4, STONE_D, M_IN2, { caps: true, y0: 0 });
        cylinder(b, 10, 0.44, 0.40, CH - 1.0, STONE_C, M_IN, { caps: false, y0: 0.4 });
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * TAU + Math.PI / 4;
          put(b, Math.cos(a) * 0.42, 0.62, Math.sin(a) * 0.42, () =>
            cylinder(b, 6, 0.13, 0.115, CH - 1.45, mulc(STONE_C, 1.06), M_IN, { caps: false, y0: 0 }));
        }
        cylinder(b, 10, 0.60, 0.76, 0.48, mulc(STONE_C, 1.04), M_IN2, { caps: true, y0: CH - 0.55 });
        box(b, 0.92, 0.2, 0.92, GOLD, M_GOLDI);
      });
      // gilded capital rosette
      put(b, x, FL + CH - 0.9, z, () => sphere(b, 0.2, GOLD_B, M_GOLDB, { rings: 3, seg: 5, jitter: 0.04 }));
    }
  }
  // ambulatory architrave ring + gold rosettes
  for (let i = 0; i < 22; i++) {
    const t0 = -1.46 + (2.92 * i) / 22, t1 = -1.46 + (2.92 * (i + 1)) / 22;
    const P = (t, y, r) => [Math.sin(t) * r, y, ZB - Math.cos(t) * r];
    const a0 = P(t0, CH + 0.25, AR - 0.28), a1 = P(t1, CH + 0.25, AR - 0.28);
    const b0 = P(t0, CH + 0.75, AR - 0.28), b1 = P(t1, CH + 0.75, AR - 0.28);
    const n = norm([-Math.sin((t0 + t1) / 2), 0, Math.cos((t0 + t1) / 2)]);
    b.quad(a0, a1, b1, b0, GOLD, M_GOLDI, n);
    const c0 = P(t0, CH + 0.78, AR - 0.34), c1 = P(t1, CH + 0.78, AR - 0.34);
    const d0 = P(t0, CH + 0.98, AR - 0.34), d1 = P(t1, CH + 0.98, AR - 0.34);
    b.quad(c0, c1, d1, d0, GOLD_B, M_GOLDB, n);
    void a0; void b0;
  }
  // ---- nave labyrinth inlay (west end of the nave)
  const LY = FL + 0.035, LZ = -13.6;
  for (let k = 0; k < 7; k++) {
    const r0 = 1.1 + k * 0.85, r1 = r0 + 0.5;
    ringY(b, 0, LY, LZ, r0, r1, 44, k % 2 ? rgb('#3a3a48') : MARBLE, M_POLISH);
  }
  ringY(b, 0, LY + 0.004, LZ, 7.15, 7.55, 48, GOLD, M_GOLDB);
  ringY(b, 0, LY + 0.004, LZ, 0.35, 0.75, 16, GOLD, M_GOLDB);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU;
    const N = [0, 1, 0];
    b.tri([Math.cos(a) * 0.8, LY + 0.01, LZ + Math.sin(a) * 0.8], [Math.cos(a + 0.2) * 7.0, LY + 0.01, LZ + Math.sin(a + 0.2) * 7.0],
      [Math.cos(a) * 7.0, LY + 0.01, LZ + Math.sin(a) * 7.0], k % 2 ? GOLD_D : GOLD, M_GOLDB, N, N, N);
  }
  // ---- choir screen (jube) with an open central bay
  const JZ = -55.6;
  for (const sx of [-1, 1]) {
    const inner = 2.2, outer = 9.6;
    put(b, sx * (inner + outer) / 2, FL + 4.6, JZ, () => {
      box(b, outer - inner, 9.2, 1.1, STONE_C, M_IN);
      box(b, outer - inner + 0.3, 0.3, 1.4, GOLD, M_GOLDI);
      box(b, outer - inner + 0.3, 0.24, 1.4, GOLD, M_GOLDI);
    });
    // three blind arches on each side of the screen
    for (let k = 0; k < 3; k++) {
      const x = sx * (inner + 1.15 + k * 2.1);
      putR(b, sx * (inner + outer) / 2, 0, JZ, 0, () => {});
      put(b, x, FL + 5.4, JZ + 0.58, () => {
        discZ(b, 0, 0, 0, 0.72, 12, NAVY, M_PAINT);
        archFrame(b, 0.72, 0.72, 0.03, 0.2, 0.2, GOLD, M_GOLDI, 7, 0);
        put(b, 0, -1.0, 0.1, () => {
          lathe(b, [[0.3, 0], [0.26, 0.9], [0.34, 1.5], [0.22, 1.8]], 7, IVORY, M_IN2);
          sphere(b, 0.22, IVORY, M_IN2, { rings: 3, seg: 5, jitter: 0.03 });
        });
      });
    }
    // screen colonnettes
    for (let k = 0; k < 4; k++) {
      const x = sx * (inner + k * 2.45);
      put(b, x, FL + 4.6, JZ + 0.64, () => {
        cylinder(b, 8, 0.16, 0.14, 9.2, mulc(STONE_C, 1.04), M_IN2, { caps: true, y0: 0 });
        box(b, 0.46, 0.2, 0.46, GOLD, M_GOLDI);
      });
    }
    void R;
  }
  // rood arch over the central bay + gold cross
  for (let i = 0; i < 14; i++) {
    const xa = -2.2 + (4.4 * i) / 14, xb = -2.2 + (4.4 * (i + 1)) / 14;
    const ya = FL + 7.4 + archY(2.2, 2.2, xa), yb2 = FL + 7.4 + archY(2.2, 2.2, xb);
    b.quad([xa, ya, JZ - 0.5], [xb, yb2, JZ - 0.5], [xb, yb2, JZ + 0.5], [xa, ya, JZ + 0.5], STONE_C, M_IN, [0, 0, 1]);
  }
  archFrame(b, 2.2, 2.2, JZ - 0.55, 0.26, 0.22, GOLD, M_GOLDI, 9, FL + 7.4);
  put(b, 0, FL + 14.4, JZ, () => {
    box(b, 0.18, 3.0, 0.18, GOLD, M_GOLDB);
    box(b, 1.5, 0.18, 0.18, GOLD, M_GOLDB);
    box(b, 0.3, 0.6, 0.24, IVORY, M_IN2);
  });
  // ---- aisle outer wall: blind arcade band above the windows + parapet pinnacles
  for (const sx of [-1, 1]) {
    const xo = sx * AXO;
    for (let bi = 0; bi < 6; bi++) {
      const z0 = PZ[bi], z1 = PZ[bi + 1];
      for (let k = 0; k < 3; k++) {
        const zc = z0 + ((z1 - z0) * (k + 0.5)) / 3;
        putR(b, xo - sx * 0.05, 0, zc, sx > 0 ? -Math.PI / 2 : Math.PI / 2, () => {
          b.quad([-1.05, 19.4, 0.02], [1.05, 19.4, 0.02], [1.05, 22.2, 0.02], [-1.05, 22.2, 0.02], BLUE_D, M_PAINT, [0, 0, 1]);
          archFrame(b, 1.05, 1.05, 0.03, 0.18, 0.16, GOLD, M_GOLDI, 7, 22.2 + 1.05);
          b.quad([-1.2, 19.2, 0.05], [1.2, 19.2, 0.05], [1.2, 19.4, 0.05], [-1.2, 19.4, 0.05], GOLD, M_GOLDI, [0, 0, 1]);
        });
      }
    }
    for (let i = 0; i < 7; i++) {
      const z = ZF - 4 - i * 9.6;
      put(b, sx * (AXE - 0.4), 30.4, z, () => {
        box(b, 0.9, 1.0, 0.9, STONE, M_EXT);
        cone(b, 0.8, 3.4, 1.0, STONE, M_EXT, 4);
        cone(b, 0.26, 1.2, 4.4, GOLD, M_GOLD, 4);
      });
    }
  }
  // ---- more banners on the piers
  for (const sx of [-1, 1]) {
    for (let pi = 1; pi < 6; pi++) {
      const z = PZ[pi];
      putR(b, sx * (NX - 0.55), 13.4, z - 0.9, sx > 0 ? -Math.PI / 2 : Math.PI / 2, () => {
        cylinder(b, 6, 0.055, 0.055, 2.0, GOLD, M_GOLDB, { caps: true, y0: -1.0 });
        b.push([0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1]);
        for (let i = 0; i < 4; i++) {
          const y0 = -i * 0.92, y1 = -(i + 1) * 0.92;
          const sw = 0.11 * Math.sin(i * 1.3 + z);
          b.quad([-0.9 + sw, y0, 0], [0.9 + sw, y0, 0], [0.9 + sw * 0.6, y1, 0], [-0.9 + sw * 0.6, y1, 0], i % 2 ? RED_V : RED_C, M_CLOTH, [0, 0, 1]);
        }
        b.pop();
        star(b, 0.32, 0.13, 5, 0.06, GOLD_B, M_GOLDB);
      });
    }
  }
  // ---- two more chandeliers over the choir
  for (const sx of [-1, 1]) buildChandelier(b, R, ctx, sx * 3.4, -62.5);
  // ---- corbel statues on the nave wall shafts (one under every triforium bay)
  for (const sx of [-1, 1]) {
    for (let bi = 0; bi < 6; bi++) {
      for (let k = 0; k < 2; k++) {
        const z = PZ[bi] + ((PZ[bi + 1] - PZ[bi]) * (k + 0.5)) / 2;
        putR(b, sx * (NX - 0.42), 9.9, z, sx > 0 ? -Math.PI / 2 : Math.PI / 2, () => {
          box(b, 1.1, 0.36, 0.85, GOLD, M_GOLDB);
          lathe(b, [[0.34, 0.1], [0.28, 1.15], [0.37, 1.85], [0.24, 2.15]], 8, IVORY, M_IN2);
          sphere(b, 0.25, IVORY, M_IN2, { rings: 3, seg: 6, jitter: 0.03 });
          box(b, 0.36, 0.5, 0.2, GOLD_B, M_GOLDB);
          // gilded canopy over the figure
          box(b, 1.15, 0.16, 0.4, GOLD, M_GOLD);
        });
      }
    }
  }
  // ---- statues standing between the ambulatory columns
  for (let i = 0; i < 5; i++) {
    for (const s of [-1, 1]) {
      const th = s * (0.30 + i * 0.24);
      const x = Math.sin(th) * (AR + 0.85), z = ZB - Math.cos(th) * (AR + 0.85);
      putR(b, x, FL, z, -th, () => {
        box(b, 1.5, 1.0, 1.5, MARBLE, M_IN2);
        box(b, 1.7, 0.18, 1.7, GOLD, M_GOLDB);
        box(b, 0.9, 0.5, 0.9, STONE_D, M_IN2);
        lathe(b, [[0.4, 0.5], [0.33, 1.6], [0.44, 2.5], [0.29, 2.9]], 9, IVORY, M_IN2);
        sphere(b, 0.3, IVORY, M_IN2, { rings: 3, seg: 6, jitter: 0.03 });
        box(b, 0.44, 0.6, 0.24, GOLD_B, M_GOLDB);
      });
      flameAt(b, ctx, x, FL + 4.4, z, 1.7, 0.45);
    }
  }
  // ---- four standing candelabra at the crossing
  for (const sx of [-1, 1]) for (const z of [-37.0, -45.0]) candelabrum(b, ctx, sx * 9.2, z, R);
  // ---- apse altar platform steps
  for (let i = 0; i < 2; i++) {
    put(b, 0, FL + 0.12 + i * 0.12, ZB + 1.2, () => cylinder(b, 26, 8.6 - i * 0.6, 8.6 - i * 0.6, 0.24, MARBLE, M_POLISH, { caps: true, y0: 0 }));
  }
}

// ================================================================ lights
function buildLights(ctx) {
  if (!ctx || !ctx.points) return;
  const add = (p, col, range, int) => ctx.points.push({ p, col, range, int });
  add(W(0, 12, -22), C.cityGlow, 44, 0.95);
  add(W(0, 12, -48), C.cityGlow, 44, 0.9);
  add(W(0, 9, -78), C.goldBright, 32, 0.95);
  add(W(-16.5, 8, -34), C.goldBright, 24, 0.55);
  add(W(16.5, 8, -34), C.goldBright, 24, 0.55);
  add(W(0, 7, -15), C.cityGlow, 26, 0.65);
  add(W(0, 26, -41), C.goldBright, 42, 0.5);
}

// ================================================================ assembly
export function buildCathedral(b, ctx, rng) {
  b.note && b.note('cathedral');
  const R = mulberry32(0x7cad3d1 & 0x7fffffff);   // LOCAL rng only
  void rng;
  if (!ctx.lanterns) ctx.lanterns = [];
  if (!ctx.points) ctx.points = [];
  inFrame(b, [A.x, 0, A.z], 0, () => {
    buildParvis(b, R); b.note('parvis');
    buildFloor(b, R); b.note('floor');
    buildWestFront(b, R, ctx); b.note('westfront');
    for (const sx of [-1, 1]) {
      buildTower(b, sx, R, ctx);
      buildNarthex(b, sx, R, ctx);
    }
    b.note('towers');
    buildArcade(b, R); b.note('arcade');
    buildClerestory(b, R); b.note('clerestory');
    buildVault(b, R); b.note('vault');
    buildAisles(b, R, ctx); b.note('aisles');
    buildApse(b, R, ctx); b.note('apse');
    buildCrossing(b, R, ctx); b.note('crossing');
    buildChoir(b, R, ctx); b.note('choir');
    buildPews(b, R); b.note('pews');
    buildOrgan(b, R, ctx); b.note('organ');
    buildStatuary(b, R, ctx);
    buildDetail(b, R, ctx);
    buildNaveRoof(b, R); b.note('roof');
    buildLights(ctx);
  });
}
