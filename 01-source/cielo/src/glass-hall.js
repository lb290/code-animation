// GLASS HALL — round 5: the enterable interior of the glass palace (image 2).
// OWNER: agent "glass". Contract: 03-notes/cielo-round5-brief.md section C.
// landmark.js buildGlassPalace keeps the exterior silhouette but rebuilds the podium as
// a shell with a real arched entrance and a central glazed skylight ridge; this module
// builds the whimsical blue-and-gold winter-garden interior in the local frame of
// L.glassPalace, styled after the reference (image 3): deep ultramarine + gold, painted
// starry / nebula vault, black-and-white checkerboard marble, a gilded arcade of giant
// columns, gold-framed odd paintings (rabbits), bright green greenhouse arches, floating
// playing cards and teacups, candle chandeliers, palms, a shallow mirror pool.
//
// Local frame (lib3d inFrame: local X -> (cos,0,sin), local Z -> (-sin,0,cos)):
// +Z is the entrance front, floor y = 2.6, aisle ceiling 15.6, nave vault springs at 16
// and reaches the roof deck at 18.4, skylight well x +-9 / z -12..-44.
import { mulberry32, TAU, norm, m4 } from './math.js';
import { box, cylinder, torus, rgb, mulc, mixc, bar3, lathe, sphere, ribbon } from './geo.js';
import { inFrame, star } from './lib3d.js';
import { L } from './layout.js';
import { C } from './palette.js';

// ---------------------------------------------------------------- dims
const G = 2.6;            // hall floor
const HW = 35;            // interior half width
const ZF = -2, ZB = -48;  // interior front / back (structural wall faces)
const AX = 13;            // arcade line
const AISLE_C = 15.6;     // aisle ceiling
const VSPR = 16.0;        // nave vault springline
const VAPEX = 18.4;       // vault crown = roof deck underside
const WX = 9;             // skylight well half width
const WZ0 = -12, WZ1 = -44;

// ---------------------------------------------------------------- palette
const GOLD = rgb('#e2b25e'), GOLD_B = rgb('#ffdda2'), GOLD_D = rgb('#a5792f');
const BLUE = rgb('#2a3f9e'), BLUE_D = rgb('#15205a'), BLUE_M = rgb('#3a5fc8');
const IVORY = rgb('#efe7d3'), WHITE_M = rgb('#e6e0d0'), BLACK_M = rgb('#262a44');
const GREEN_G = rgb('#7fd85e'), GREEN_L = rgb('#b6f086');
const PINK = rgb('#e88ac4'), VIOLET = rgb('#8a66d8'), CYAN = rgb('#7ec8e8');
const RED_C = rgb('#9c3038'), CARD_W = rgb('#f2e9d4'), CARD_R = rgb('#b8322e'), TEAL = rgb('#2f7c86');
const WATER = rgb('#5fb0d8'), TRUNK = rgb('#8a6a3a'), NAVY = rgb('#0c1230');

// ---------------------------------------------------------------- materials [emissive, gloss]
const M_BLUE = [0.21, 0.14];
const M_PAINT = [0.26, 0.07];
const M_MARBLE = [0.13, 0.32];
const M_GOLD = [0.20, 0.82];
const M_GOLD_B = [0.34, 0.72];
const M_GOLD_FLAT = [0.22, 0.55];
const M_GLOWG = [0.34, 0.5];
const M_STAR = [0.62, 0.14];
const M_CANDLE = [0.55, 0.06];
const M_WATER = [0.14, 0.94];
const M_CLOTH = [0.15, 0.05];
const M_LEAF = [0.16, 0.1];

// ---------------------------------------------------------------- helpers
const T = (x, y, z) => m4.translate([x, y, z]);
const RY = (a) => m4.rotY(a);
function put(b, x, y, z, fn) { b.push(T(x, y, z)); fn(); b.pop(); }
function putR(b, x, y, z, yaw, fn) { b.push(T(x, y, z)); b.push(RY(yaw)); fn(); b.pop(); b.pop(); }

const vaultY = (x) => VSPR + (VAPEX - VSPR) * Math.sqrt(Math.max(0, 1 - (x / AX) * (x / AX)));

// annulus sector in the local XY plane facing +Z (landmark.js has this privately)
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
function flatEllipse(b, cx, cy, rx, ry, seg, col, mat, z) {
  const N = [0, 0, 1];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    b.tri([cx + Math.cos(a0) * rx, cy + Math.sin(a0) * ry, z],
      [cx + Math.cos(a1) * rx, cy + Math.sin(a1) * ry, z], [cx, cy, z], col, mat, N, N, N);
  }
}
function flatRingY(b, cx, cy, cz, r0, r1, seg, col, mat, ny = 1) {
  const N = [0, ny, 0];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    b.quad([cx + Math.cos(a0) * r0, cy, cz + Math.sin(a0) * r0],
      [cx + Math.cos(a1) * r0, cy, cz + Math.sin(a1) * r0],
      [cx + Math.cos(a1) * r1, cy, cz + Math.sin(a1) * r1],
      [cx + Math.cos(a0) * r1, cy, cz + Math.sin(a0) * r1], col, mat, N);
  }
}
function flatDiscY(b, cx, cy, cz, r, seg, col, mat, ny = 1) {
  const N = [0, ny, 0];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    b.tri([cx, cy, cz], [cx + Math.cos(a1) * r, cy, cz + Math.sin(a1) * r],
      [cx + Math.cos(a0) * r, cy, cz + Math.sin(a0) * r], col, mat, N, N, N);
  }
}
// semicircular arch band in the plane x = xf (spans z), with soffit + rims
function archBandX(b, xf, ySpr, zc, r, w, d, col, mat, seg) {
  const x0 = xf - d / 2, x1 = xf + d / 2;
  const P = (t, rr) => [zc + Math.cos(t) * rr, ySpr + Math.sin(t) * rr];
  for (let i = 0; i < seg; i++) {
    const t0 = (Math.PI * i) / seg, t1 = (Math.PI * (i + 1)) / seg;
    const i0 = P(t0, r), i1 = P(t1, r), o0 = P(t0, r + w), o1 = P(t1, r + w);
    b.quad([x0, i0[1], i0[0]], [x0, i1[1], i1[0]], [x0, o1[1], o1[0]], [x0, o0[1], o0[0]], col, mat, [-1, 0, 0]);
    b.quad([x1, i1[1], i1[0]], [x1, i0[1], i0[0]], [x1, o0[1], o0[0]], [x1, o1[1], o1[0]], mulc(col, 0.82), mat, [1, 0, 0]);
    const tm = (t0 + t1) / 2;
    b.quad([x0, i0[1], i0[0]], [x1, i0[1], i0[0]], [x1, i1[1], i1[0]], [x0, i1[1], i1[0]], mulc(col, 0.62), mat, [0, -Math.sin(tm), -Math.cos(tm)]);
    b.quad([x0, o0[1], o0[0]], [x0, o1[1], o1[0]], [x1, o1[1], o1[0]], [x1, o0[1], o0[0]], mulc(col, 0.8), mat, [0, Math.sin(tm), Math.cos(tm)]);
  }
}
// arch-shaped glowing pane in the local XY plane facing +Z
function archPane(b, cx, yBot, hw, spring, z, colA, colB, mat, seg = 10) {
  b.quadc([cx - hw, yBot, z], [cx + hw, yBot, z], [cx + hw, spring, z], [cx - hw, spring, z],
    colA, colA, colB, colB, mat);
  const N = [0, 0, 1];
  for (let i = 0; i < seg; i++) {
    const a0 = Math.PI * (i / seg), a1 = Math.PI * ((i + 1) / seg);
    b.tri([cx, spring, z], [cx + Math.cos(a0) * hw, spring + Math.sin(a0) * hw, z],
      [cx + Math.cos(a1) * hw, spring + Math.sin(a1) * hw, z], colB, mat, N, N, N);
  }
}
// one candle (stick + flame); returns the flame position
function candleUnit(b, x, y, z, h) {
  put(b, x, y, z, () => cylinder(b, 6, 0.085, 0.08, h, IVORY, M_CANDLE, { caps: true, y0: 0 }));
  put(b, x, y + h, z, () => cylinder(b, 5, 0.085, 0.01, 0.3, GOLD_B, M_STAR, { caps: true, y0: 0 }));
  return [x, y + h + 0.28, z];
}

// ---------------------------------------------------------------- floor
function buildFloor(b, R) {
  const x0 = -34.5, x1 = 34.5, z0 = -48, z1 = -2;
  const nx = 69, nz = 46;
  const dx = (x1 - x0) / nx, dz = (z1 - z0) / nz;
  const y = G + 0.03;
  const inlay = (i, j) => (i % 6 === 3 && j % 6 === 3);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const xa = x0 + i * dx, xb = xa + dx, za = z0 + j * dz, zb = za + dz;
      const dark = (i + j) % 2 === 0;
      const v = 0.93 + R() * 0.12;
      let col = mulc(dark ? BLACK_M : WHITE_M, v);
      if (inlay(i, j)) col = mixc(col, GOLD_D, 0.55);
      b.quad([xa, y, za], [xb, y, za], [xb, y, zb], [xa, y, zb], col, M_MARBLE, [0, 1, 0]);
    }
  }
  const gy = y + 0.02;
  for (const [xa, za, xb, zb] of [
    [x0, z0, x1, z0 + 0.7], [x0, z1 - 0.7, x1, z1],
    [x0, z0, x0 + 0.7, z1], [x1 - 0.7, z0, x1, z1],
  ]) b.quad([xa, gy, za], [xb, gy, za], [xb, gy, zb], [xa, gy, zb], GOLD, M_GOLD_FLAT, [0, 1, 0]);
  // gold lines under the arcades + mosaic carpet borders down the aisles
  for (const sx of [-1, 1]) {
    b.quad([sx * 13.7, gy, z0], [sx * 14.1, gy, z0], [sx * 14.1, gy, z1], [sx * 13.7, gy, z1], GOLD, M_GOLD_FLAT, [0, 1, 0]);
    for (const [off, w, col, mat] of [[15.0, 0.45, BLUE_D, M_MARBLE], [16.1, 0.2, GOLD, M_GOLD_FLAT], [30.6, 0.5, BLUE_D, M_MARBLE], [31.6, 0.2, GOLD, M_GOLD_FLAT]]) {
      b.quad([sx * off, gy + 0.004, z0], [sx * (off + w), gy + 0.004, z0], [sx * (off + w), gy + 0.004, z1], [sx * off, gy + 0.004, z1], col, mat, [0, 1, 0]);
    }
  }
  // entrance medallion: gold ring, blue field, 8-point gold star
  flatRingY(b, 0, gy + 0.004, -6.5, 2.1, 2.6, 26, GOLD, M_GOLD_FLAT);
  flatDiscY(b, 0, gy + 0.006, -6.5, 2.1, 26, BLUE_D, [0.2, 0.2]);
  flatDiscY(b, 0, gy + 0.008, -6.5, 0.62, 12, GOLD_D, M_GOLD_FLAT);
  const N = [0, 1, 0];
  for (let i = 0; i < 16; i++) {
    const a0 = (i / 16) * TAU;
    const rr = i % 2 === 0 ? 1.85 : 0.55, rn = i % 2 === 0 ? 0.55 : 1.85;
    b.tri([0, gy + 0.01, -6.5], [Math.cos(a0) * rr, gy + 0.01, -6.5 + Math.sin(a0) * rr],
      [Math.cos(a0 + TAU / 16) * rn, gy + 0.01, -6.5 + Math.sin(a0 + TAU / 16) * rn], GOLD_B, M_GOLD_FLAT, N, N, N);
  }
}

// ---------------------------------------------------------------- carpet
function buildCarpet(b) {
  const y = G + 0.045;
  for (const [za, zb] of [[-2.6, -17.2], [-34.8, -47.2]]) {
    const zlo = Math.min(za, zb), zhi = Math.max(za, zb);
    b.quad([-2.5, y, zlo], [2.5, y, zlo], [2.5, y, zhi], [-2.5, y, zhi], RED_C, M_CLOTH, [0, 1, 0]);
    for (const sx of [-1, 1]) {
      b.quad([sx * 2.5, y, zlo], [sx * 2.62, y, zlo], [sx * 2.62, y, zhi], [sx * 2.5, y, zhi], GOLD, M_GOLD_FLAT, [0, 1, 0]);
    }
    const n = Math.max(2, Math.floor((zhi - zlo) / 2.8));
    for (let i = 0; i < n; i++) {
      const zc = zlo + (i + 0.5) * ((zhi - zlo) / n);
      const N = [0, 1, 0];
      b.tri([0, y + 0.008, zc - 0.6], [0.8, y + 0.008, zc], [0, y + 0.008, zc + 0.6], GOLD_B, M_GOLD_FLAT, N, N, N);
      b.tri([0, y + 0.008, zc - 0.6], [0, y + 0.008, zc + 0.6], [-0.8, y + 0.008, zc], GOLD_B, M_GOLD_FLAT, N, N, N);
    }
  }
}

// ---------------------------------------------------------------- arcade
function builtColumn(b, x, z) {
  put(b, x, G + 0.45, z, () => box(b, 2.5, 0.9, 2.5, BLACK_M, M_MARBLE));
  put(b, x, G + 0.98, z, () => box(b, 2.8, 0.16, 2.8, GOLD, M_GOLD));
  put(b, x, G + 1.06, z, () => cylinder(b, 14, 0.84, 0.72, 7.84, BLUE_M, M_BLUE, { caps: false, y0: 0 }));
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * TAU + 0.25;
    bar3(b, [x + Math.cos(a) * 0.81, G + 1.2, z + Math.sin(a) * 0.81],
      [x + Math.cos(a) * 0.69, G + 8.3, z + Math.sin(a) * 0.69], 0.1, 0.1, GOLD, M_GOLD);
  }
  put(b, x, G + 8.9, z, () => cylinder(b, 14, 1.0, 1.2, 0.55, GOLD, M_GOLD, { caps: true, y0: 0 }));
  put(b, x, G + 9.45, z, () => box(b, 2.4, 0.3, 2.4, GOLD_B, M_GOLD_B));
  put(b, x, G + 8.55, z, () => box(b, 2.1, 0.18, 2.1, GOLD_B, M_GOLD_B));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    put(b, x + sx * 0.95, G + 9.15, z + sz * 0.95, () => box(b, 0.7, 0.34, 0.7, GOLD, M_GOLD));
  }
}

function buildArcade(b) {
  const SPR = 12.35;
  const sup = [ZF, -8, -14, -20, -26, -32, -38, -44, ZB];
  for (const sx of [-1, 1]) {
    const xi = sx * (AX - 0.34), xo = sx * (AX + 0.34);
    const nx = -sx;
    for (let bi = 0; bi < sup.length - 1; bi++) {
      const za = sup[bi], zb = sup[bi + 1];
      const zc = (za + zb) / 2, half = Math.abs(zb - za) / 2;
      const r = Math.max(1.3, half - 0.5);
      const SEG = 16;
      for (let i = 0; i < SEG; i++) {
        const a0 = -half + (2 * half * i) / SEG, a1 = -half + (2 * half * (i + 1)) / SEG;
        const y0 = SPR + Math.sqrt(Math.max(0, r * r - a0 * a0));
        const y1 = SPR + Math.sqrt(Math.max(0, r * r - a1 * a1));
        b.quad([xi, y0, zc + a0], [xi, y1, zc + a1], [xi, VSPR, zc + a1], [xi, VSPR, zc + a0], BLUE, M_BLUE, [nx, 0, 0]);
        b.quad([xo, y1, zc + a1], [xo, y0, zc + a0], [xo, VSPR, zc + a0], [xo, VSPR, zc + a1], mulc(BLUE, 0.66), M_BLUE, [-nx, 0, 0]);
        b.quad([xi, y0, zc + a0], [xo, y0, zc + a0], [xo, y1, zc + a1], [xi, y1, zc + a1], mulc(GOLD_D, 0.9), M_GOLD);
      }
      archBandX(b, AX, SPR, zc, r + 0.03, 0.55, 1.0, GOLD, M_GOLD, 16);
      put(b, AX, SPR + r + 0.34, zc, () => box(b, 1.3, 1.0, 0.8, GOLD_B, M_GOLD_B));
      putR(b, xi + nx * 0.16, SPR + r + 1.35, zc, sx > 0 ? -Math.PI / 2 : Math.PI / 2, () => {
        flatEllipse(b, 0, 0, 0.85, 0.85, 10, GOLD_D, M_GOLD_FLAT, 0);
        flatEllipse(b, 0, 0, 0.55, 0.55, 8, GOLD, M_GOLD_B, 0.02);
      });
    }
    for (let i = 1; i < sup.length - 1; i++) builtColumn(b, sx * AX, sup[i]);
    bar3(b, [xi + nx * 0.2, 15.62, ZF], [xi + nx * 0.2, 15.62, ZB], 0.85, 0.6, GOLD, M_GOLD, [0, 1, 0]);
    bar3(b, [xi + nx * 0.2, 15.15, ZF], [xi + nx * 0.2, 15.15, ZB], 0.5, 0.32, GOLD_D, M_GOLD, [0, 1, 0]);
    bar3(b, [xi, G + 0.12, ZF], [xi, G + 0.12, ZB], 1.0, 0.24, BLACK_M, M_MARBLE, [0, 1, 0]);
  }
}

// ---------------------------------------------------------------- nave vault
function buildVault(b, R) {
  const NS = 32, rows = 28;
  const dz = (ZF - ZB) / rows;
  const xs = [];
  for (let i = 0; i <= NS; i++) {
    const x = -AX + (2 * AX * i) / NS;
    xs.push([x, vaultY(x)]);
  }
  const NEB = [];
  for (let i = 0; i < 22; i++) {
    NEB.push({ x: -11 + R() * 22, z: ZB + 2 + R() * 42, r: 3 + R() * 5.5, c: [PINK, VIOLET, CYAN, BLUE_M][Math.floor(R() * 4)] });
  }
  const inWell = (x, z) => Math.abs(x) < WX && z < WZ0 && z > WZ1;
  const vn = (x, y) => norm([-x / (AX * AX), -(y - VSPR) / ((VAPEX - VSPR) * (VAPEX - VSPR)), 0]);
  for (let r = 0; r < rows; r++) {
    const za = ZB + r * dz, zb = za + dz, zm = (za + zb) / 2;
    for (let i = 0; i < NS; i++) {
      const xa = xs[i][0], ya = xs[i][1], xb = xs[i + 1][0], yb = xs[i + 1][1];
      const xm = (xa + xb) / 2;
      if (inWell(xm, zm)) continue;
      let col = mixc(BLUE_D, BLUE, 0.18 + R() * 0.34);
      for (const nb of NEB) {
        const d = Math.hypot(xm - nb.x, (zm - nb.z) * 0.75) / nb.r;
        if (d < 1) col = mixc(col, nb.c, (1 - d) * 0.62);
      }
      if (R() < 0.045) col = mixc(col, GOLD_D, 0.35);
      const nn = vn((xa + xb) / 2, (ya + yb) / 2);
      b.quad([xa, ya, za], [xb, yb, za], [xb, yb, zb], [xa, ya, zb], col, M_PAINT, nn);
      // recessed gold coffer frame on every painted bay
      const ins = 0.19, dep = 0.15;
      const ax2 = xa + ins, bx2 = xb - ins, az2 = za + ins, bz2 = zb - ins;
      b.quad([xa, ya, za], [xb, yb, za], [bx2, yb - dep, az2], [ax2, ya - dep, az2], GOLD_D, M_GOLD_FLAT, nn);
      b.quad([xb, yb, zb], [xa, ya, zb], [ax2, ya - dep, bz2], [bx2, yb - dep, bz2], GOLD_D, M_GOLD_FLAT, nn);
      b.quad([xb, yb, za], [xb, yb, zb], [bx2, yb - dep, bz2], [bx2, yb - dep, az2], GOLD_D, M_GOLD_FLAT, nn);
      b.quad([xa, ya, zb], [xa, ya, za], [ax2, ya - dep, az2], [ax2, ya - dep, bz2], GOLD_D, M_GOLD_FLAT, nn);
    }
  }
  // transverse gold ribs
  for (let k = 0; k <= 11; k++) {
    const z = ZB + ((ZF - ZB) * k) / 11;
    for (let i = 0; i < NS; i++) {
      const xa = xs[i][0], ya = xs[i][1] - 0.16, xb = xs[i + 1][0], yb = xs[i + 1][1] - 0.16;
      if (inWell((xa + xb) / 2, z)) continue;
      b.quad([xa, ya, z - 0.24], [xb, yb, z - 0.24], [xb, yb, z + 0.24], [xa, ya, z + 0.24], GOLD, M_GOLD_FLAT, vn((xa + xb) / 2, (ya + yb) / 2));
    }
  }
  // longitudinal gold ribs
  for (const x of [-10.5, -7, -3.5, 3.5, 7, 10.5]) {
    for (let r = 0; r < rows; r++) {
      const za = ZB + r * dz, zb = za + dz, zm = (za + zb) / 2;
      if (inWell(x, zm)) continue;
      const y = vaultY(x) - 0.16;
      b.quad([x - 0.2, y, za], [x + 0.2, y, za], [x + 0.2, y, zb], [x - 0.2, y, zb], GOLD, M_GOLD_FLAT, vn(x, y));
    }
  }
  // painted stars
  for (let i = 0; i < 620; i++) {
    const x = -12.4 + R() * 24.8;
    const z = ZB + 0.8 + R() * (ZF - ZB - 1.6);
    if (inWell(x, z)) continue;
    const y = vaultY(x) - 0.13;
    const s = 0.14 + R() * 0.32;
    const n = vn(x, y);
    const t1 = norm([n[1], -n[0], 0]);
    const t2 = [n[1] * t1[2] - n[2] * t1[1], n[2] * t1[0] - n[0] * t1[2], n[0] * t1[1] - n[1] * t1[0]];
    const col = R() < 0.22 ? CARD_W : GOLD_B;
    const p = (a, bb) => [x + t1[0] * a * s + t2[0] * bb * s, y + t1[1] * a * s + t2[1] * bb * s, z + t1[2] * a * s + t2[2] * bb * s];
    b.quad(p(-1, 0), p(0, 1), p(1, 0), p(0, -1), col, M_STAR, n);
  }
  // painted gold sunbursts at both ends of the vault
  for (const z of [-4.5, -45.5]) {
    put(b, 0, vaultY(0) - 0.22, z, () => {
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * TAU;
        b.tri([Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5], [Math.cos(a + 0.09) * 2.9, 0, Math.sin(a + 0.09) * 2.9],
          [Math.cos(a - 0.09) * 2.9, 0, Math.sin(a - 0.09) * 2.9], GOLD_B, M_STAR, [0, -1, 0], [0, -1, 0], [0, -1, 0]);
      }
      flatDiscY(b, 0, 0.02, 0, 0.55, 10, GOLD, M_STAR, -1);
    });
  }
}

// ---------------------------------------------------------------- skylight curb
function buildSkylightTrim(b) {
  for (const sx of [-1, 1]) {
    const x = sx * WX;
    const y0 = vaultY(WX);
    for (let i = 0; i < 24; i++) {
      const za = WZ1 + ((WZ0 - WZ1) * i) / 24, zb = WZ1 + ((WZ0 - WZ1) * (i + 1)) / 24;
      b.quad([x, y0, za], [x, VAPEX, za], [x, VAPEX, zb], [x, y0, zb], GOLD_D, M_GOLD, [-sx, 0, 0]);
    }
    bar3(b, [x, y0 - 0.08, WZ1], [x, y0 - 0.08, WZ0], 0.24, 0.2, GOLD, M_GOLD_B, [0, 1, 0]);
    bar3(b, [x, VAPEX - 0.08, WZ1], [x, VAPEX - 0.08, WZ0], 0.3, 0.22, GOLD_B, M_GOLD_B, [0, 1, 0]);
  }
  for (const [z, s] of [[WZ0, -1], [WZ1, 1]]) {
    for (let i = 0; i < 18; i++) {
      const xa = -WX + (2 * WX * i) / 18, xb = -WX + (2 * WX * (i + 1)) / 18;
      b.quad([xa, vaultY(xa), z], [xb, vaultY(xb), z], [xb, VAPEX, z], [xa, VAPEX, z], GOLD_D, M_GOLD, [0, 0, s]);
    }
    bar3(b, [-WX, VAPEX - 0.1, z], [WX, VAPEX - 0.1, z], 0.3, 0.24, GOLD_B, M_GOLD_B);
  }
}

// ---------------------------------------------------------------- aisle ceilings
function buildAisleCeilings(b, R) {
  for (const sx of [-1, 1]) {
    const x0 = sx * (AX + 0.34), x1 = sx * (HW - 0.12);
    const xa = Math.min(x0, x1), xb = Math.max(x0, x1);
    const y = AISLE_C;
    const nx = 5, nz = 13;
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const xA = xa + ((xb - xa) * i) / nx, xB = xa + ((xb - xa) * (i + 1)) / nx;
        const zA = ZB + (46 * j) / nz, zB = ZB + (46 * (j + 1)) / nz;
        const col = mixc(BLUE_D, BLUE, 0.12 + R() * 0.3);
        const N = [0, -1, 0];
        b.quad([xA, y, zA], [xB, y, zA], [xB, y, zB], [xA, y, zB], col, M_PAINT, N);
        // gold coffer frame
        const ins = 0.24, dep = 0.14;
        b.quad([xA, y, zA], [xB, y, zA], [xB - ins, y - dep, zA + ins], [xA + ins, y - dep, zA + ins], GOLD_D, M_GOLD_FLAT, N);
        b.quad([xB, y, zB], [xA, y, zB], [xA + ins, y - dep, zB - ins], [xB - ins, y - dep, zB - ins], GOLD_D, M_GOLD_FLAT, N);
        b.quad([xB, y, zA], [xB, y, zB], [xB - ins, y - dep, zB - ins], [xB - ins, y - dep, zA + ins], GOLD_D, M_GOLD_FLAT, N);
        b.quad([xA, y, zB], [xA, y, zA], [xA + ins, y - dep, zA + ins], [xA + ins, y - dep, zB - ins], GOLD_D, M_GOLD_FLAT, N);
        flatDiscY(b, (xA + xB) / 2, y - 0.16, (zA + zB) / 2, 0.34, 8, GOLD, M_GOLD_B, -1);
      }
    }
    for (let j = 0; j <= nz; j++) {
      const z = ZB + 46 * (j / nz);
      bar3(b, [xa, y - 0.2, z], [xb, y - 0.2, z], 0.24, 0.36, GOLD, M_GOLD_FLAT, [0, 1, 0]);
    }
    for (let i = 1; i < nx; i++) {
      const x = xa + ((xb - xa) * i) / nx;
      bar3(b, [x, y - 0.2, ZB], [x, y - 0.2, ZF], 0.22, 0.34, GOLD, M_GOLD_FLAT, [0, 1, 0]);
    }
    bar3(b, [sx * (HW - 0.14), y - 0.32, ZB], [sx * (HW - 0.14), y - 0.32, ZF], 0.5, 0.7, GOLD, M_GOLD, [0, 1, 0]);
    // gilded corbels under the aisle ceiling along the outer wall
    for (let j = 0; j < 16; j++) {
      const z = ZB + 2 + j * 2.9;
      put(b, sx * (HW - 0.55), AISLE_C - 0.85, z, () => {
        box(b, 0.7, 0.3, 0.5, GOLD, M_GOLD);
        b.push([1, 0, 0, 0, 0, 0.7, -0.7, 0, 0, 0.7, 0.7, 0, 0, 0, 0, 1]);
        box(b, 0.5, 0.5, 0.75, GOLD_D, M_GOLD);
        b.pop();
      });
    }
  }
}

// ---------------------------------------------------------------- paintings
function painting(b, R, w, h, kind, seed) {
  const hw = w / 2, hh = h / 2;
  put(b, 0, 0, 0, () => {
    box(b, w + 0.5, h + 0.5, 0.22, GOLD_D, M_GOLD);
    box(b, w + 0.24, h + 0.24, 0.28, GOLD, M_GOLD_B);
    const cA = kind === 'rabbit' ? rgb('#1d2a63') : rgb('#26406e');
    const cB = kind === 'rabbit' ? rgb('#2b3f86') : rgb('#3a6a68');
    b.quadc([-hw, -hh, 0.17], [hw, -hh, 0.17], [hw, hh, 0.17], [-hw, hh, 0.17], cA, cA, cB, cB, M_PAINT);
    const sc = Math.min(w, h) * 0.42;
    b.push([sc, 0, 0, 0, 0, sc, 0, 0, 0, 0, sc, 0, 0, 0, 0.2, 1]);
    if (kind === 'rabbit') {
      const cream = rgb('#f2ecdc');
      flatEllipse(b, 0, -0.32, 0.85, 0.72, 12, cream, M_PAINT, 0);
      flatEllipse(b, 0.02, 0.5, 0.42, 0.4, 10, cream, M_PAINT, 0.001);
      flatEllipse(b, -0.24, 1.12, 0.14, 0.52, 8, cream, M_PAINT, 0.002);
      flatEllipse(b, 0.2, 1.18, 0.13, 0.55, 8, cream, M_PAINT, 0.002);
      flatEllipse(b, -0.36, 1.3, 0.055, 0.3, 6, PINK, M_PAINT, 0.004);
      flatEllipse(b, 0.31, 1.36, 0.05, 0.3, 6, PINK, M_PAINT, 0.004);
      flatEllipse(b, 0.72, -0.5, 0.26, 0.26, 6, cream, M_PAINT, 0.002);
      flatEllipse(b, -0.12, 0.55, 0.06, 0.06, 5, rgb('#8a3a8a'), M_PAINT, 0.006);
      flatEllipse(b, 0.16, 0.58, 0.06, 0.06, 5, rgb('#8a3a8a'), M_PAINT, 0.006);
    } else if (kind === 'cat') {
      const dark = rgb('#20223c');
      flatEllipse(b, 0, -0.3, 0.7, 0.62, 10, dark, M_PAINT, 0);
      flatEllipse(b, 0, 0.45, 0.46, 0.42, 10, dark, M_PAINT, 0.001);
      b.tri([-0.42, 0.72, 0.002], [-0.16, 0.75, 0.002], [-0.34, 1.24, 0.002], dark, M_PAINT, [0, 0, 1], [0, 0, 1], [0, 0, 1]);
      b.tri([0.42, 0.72, 0.002], [0.34, 1.24, 0.002], [0.16, 0.75, 0.002], dark, M_PAINT, [0, 0, 1], [0, 0, 1], [0, 0, 1]);
      flatEllipse(b, -0.18, 0.48, 0.09, 0.09, 6, GOLD_B, M_STAR, 0.004);
      flatEllipse(b, 0.18, 0.48, 0.09, 0.09, 6, GOLD_B, M_STAR, 0.004);
    } else {
      b.quad([-1.0, -0.1, 0.002], [1.0, -0.1, 0.002], [1.0, 1.0, 0.002], [-1.0, 1.0, 0.002], rgb('#4a6fb8'), M_PAINT, [0, 0, 1]);
      b.quad([-1.0, -0.34, 0.003], [1.0, -0.34, 0.003], [1.0, -0.05, 0.003], [-1.0, -0.05, 0.003], rgb('#2f6f5a'), M_PAINT, [0, 0, 1]);
      b.quad([-1.0, -1.0, 0.003], [1.0, -1.0, 0.003], [1.0, -0.38, 0.003], [-1.0, -0.38, 0.003], rgb('#20443c'), M_PAINT, [0, 0, 1]);
      flatEllipse(b, 0.45, 0.55, 0.18, 0.18, 8, rgb('#ffeec0'), M_STAR, 0.006);
      flatEllipse(b, -0.5, 0.3, 0.12, 0.12, 6, rgb('#ffeec0'), M_STAR, 0.006);
      for (let i = 0; i < 5; i++) {
        const x = -0.9 + i * 0.45, th = 0.3 + ((i * 37 + seed) % 5) * 0.1;
        b.tri([x - 0.16, -0.36, 0.006], [x + 0.16, -0.36, 0.006], [x, -0.36 + th, 0.006], rgb('#1c3a30'), M_PAINT, [0, 0, 1], [0, 0, 1], [0, 0, 1]);
      }
    }
    b.pop();
  });
}

// ---------------------------------------------------------------- window
function archedWindow(b, ctx, toWorld) {
  const hw = 1.8, yBot = 4.3, spring = 8.1;
  b.push(T(0, 0, -0.32));
  archPane(b, 0, yBot, hw, spring, 0, GREEN_L, GREEN_G, M_GLOWG, 10);
  const dark = rgb('#2f6a3e');
  for (let i = 0; i < 3; i++) flatEllipse(b, -1.0 + i * 1.0, yBot + 1.4 + (i % 2) * 0.9, 0.55, 0.75, 8, dark, M_LEAF, 0.02);
  flatEllipse(b, 0.35, yBot + 3.0, 0.9, 0.55, 8, rgb('#4d9a54'), M_LEAF, 0.03);
  for (const sx of [-1, 1]) {
    b.quad([sx * hw, yBot, 0], [sx * hw, yBot, -0.32], [sx * hw, spring, -0.32], [sx * hw, spring, 0], mulc(IVORY, 0.85), M_MARBLE, [-sx, 0, 0]);
  }
  for (let i = 0; i < 10; i++) {
    const a0 = Math.PI * (i / 10), a1 = Math.PI * ((i + 1) / 10);
    b.quad([Math.cos(a0) * hw, spring + Math.sin(a0) * hw, 0], [Math.cos(a0) * hw, spring + Math.sin(a0) * hw, -0.32],
      [Math.cos(a1) * hw, spring + Math.sin(a1) * hw, -0.32], [Math.cos(a1) * hw, spring + Math.sin(a1) * hw, 0],
      mulc(IVORY, 0.8), M_MARBLE, [0, -Math.sin((a0 + a1) / 2), 0]);
  }
  b.pop();
  for (const sx of [-1, 1]) {
    put(b, sx * (hw + 0.16), (yBot + spring) / 2 + 0.4, 0.1, () => box(b, 0.34, spring - yBot + 0.8, 0.28, GOLD, M_GOLD));
  }
  ringZ(b, 0, spring, -0.02, hw + 0.02, 0.34, 0.36, GOLD, M_GOLD, 12, 0, Math.PI);
  ringZ(b, 0, spring, 0.12, hw + 0.06, 0.16, 0.2, GOLD_B, M_GOLD_B, 12, 0, Math.PI);
  put(b, 0, yBot - 0.2, 0.02, () => box(b, hw * 2 + 1.0, 0.4, 0.7, IVORY, M_MARBLE));
  put(b, 0, yBot - 0.36, 0.06, () => box(b, hw * 2 + 1.2, 0.14, 0.9, GOLD, M_GOLD));
  for (const mx of [-0.85, 0, 0.85]) put(b, mx, (yBot + spring) / 2, -0.06, () => box(b, 0.1, spring - yBot, 0.12, GOLD, M_GOLD));
  put(b, 0, yBot + 1.5, -0.06, () => box(b, hw * 2, 0.1, 0.12, GOLD, M_GOLD));
  put(b, 0, spring + 0.5, -0.06, () => box(b, 0.12, 1.2, 0.12, GOLD, M_GOLD));
  for (const [lx, ly] of [[-1.1, yBot + 0.4], [1.0, yBot + 0.2], [0.1, yBot + 4.6]]) {
    ctx.lanterns.push({ p: toWorld(lx, ly, 0.5), size: 2.2, rot: lx * 2.3 + ly, alpha: 0.9, shape: 5, col: lx < 0 ? C.leafLight : C.leaf });
  }
}

function buildOuterWall(b, R, ctx, mapP, lightList) {
  const bays = [-11, -17, -23, -29, -35, -41];
  const pil = [-8, -14, -20, -26, -32, -38, -44];
  for (const sx of [-1, 1]) {
    const X = sx * HW;
    const yaw = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
    const xl = X - sx * 0.3;
    const N = [-sx, 0, 0];
    const yb = G + 0.9;
    const n = 153;
    for (let i = 0; i < n; i++) {
      const za = ZF + ((ZB - ZF) * i) / n, zb = ZF + ((ZB - ZF) * (i + 1)) / n;
      const zc = (za + zb) / 2;
      let wz = null;
      for (const c2 of bays) if (Math.abs(zc - c2) <= 1.8) { wz = c2; break; }
      if (wz === null) {
        b.quad([xl, yb, za], [xl, yb, zb], [xl, AISLE_C, zb], [xl, AISLE_C, za], BLUE, M_BLUE, N);
      } else {
        const d = Math.abs(zc - wz);
        const top = 8.1 + Math.sqrt(Math.max(0, 1.8 * 1.8 - d * d));
        b.quad([xl, yb, za], [xl, yb, zb], [xl, 4.3, zb], [xl, 4.3, za], BLUE, M_BLUE, N);
        if (top < AISLE_C) b.quad([xl, top, za], [xl, top, zb], [xl, AISLE_C, zb], [xl, AISLE_C, za], BLUE, M_BLUE, N);
      }
    }
    put(b, X - sx * 0.15, G + 0.45, (ZF + ZB) / 2, () => box(b, 0.3, 0.9, ZF - ZB, BLACK_M, M_MARBLE));
    put(b, X - sx * 0.22, G + 0.94, (ZF + ZB) / 2, () => box(b, 0.44, 0.16, ZF - ZB + 0.1, GOLD, M_GOLD));
    // mosaic frieze above the wainscot
    for (let i = 0; i < 24; i++) {
      const z = ZF - 1.2 - i * 1.85;
      b.quad([xl - sx * 0.02, 3.62, z], [xl - sx * 0.02, 3.62, z - 1.0], [xl - sx * 0.02, 4.06, z - 1.0], [xl - sx * 0.02, 4.06, z],
        i % 2 ? GOLD_D : BLUE_M, i % 2 ? M_GOLD_FLAT : M_BLUE, N);
    }
    for (const z of pil) {
      put(b, X - sx * 0.55, 9.5, z, () => box(b, 0.55, 11.8, 1.45, GOLD_D, M_GOLD));
      put(b, X - sx * 0.72, 9.5, z, () => box(b, 0.16, 10.6, 1.0, GOLD, M_GOLD));
      put(b, X - sx * 0.6, 15.3, z, () => box(b, 0.75, 0.45, 1.8, GOLD_B, M_GOLD_B));
      put(b, X - sx * 0.6, 3.9, z, () => box(b, 0.75, 0.5, 1.7, GOLD, M_GOLD));
    }
    bar3(b, [X - sx * 0.35, 15.5, ZF], [X - sx * 0.35, 15.5, ZB], 0.7, 0.5, GOLD, M_GOLD, [0, 1, 0]);
    for (const zc of bays) {
      const toWorld = (lx, ly, lz) => mapP(xl - sx * lz, ly, zc + sx * lx);
      putR(b, xl, 0, zc, yaw, () => archedWindow(b, ctx, toWorld));
      putR(b, xl, 12.35, zc, yaw, () => painting(b, R, 3.0, 3.1, R() < 0.55 ? 'rabbit' : 'landscape', Math.floor(R() * 97)));
      // gilded garland above each painting
      putR(b, xl - sx * 0.05, 14.4, zc, yaw, () => {
        for (let i = 0; i < 7; i++) {
          const x = -1.3 + i * 0.44;
          flatEllipse(b, x, -0.12 * Math.abs(x) * 1.3, 0.17, 0.17, 6, GOLD, M_GOLD_B, 0.02);
        }
      });
      // blind arcade band under the aisle cornice
      putR(b, xl - sx * 0.02, 14.55, zc, yaw, () => {
        for (const ax of [-1.15, 0, 1.15]) {
          b.quad([ax - 0.55, -0.4, 0.01], [ax + 0.55, -0.4, 0.01], [ax + 0.55, 0.42, 0.01], [ax - 0.55, 0.42, 0.01], BLUE_D, M_BLUE, [0, 0, 1]);
          ringZ(b, ax, 0.42, 0.06, 0.55, 0.16, 0.14, GOLD, M_GOLD, 8, 0, Math.PI);
          b.quad([ax - 0.66, -0.55, 0.07], [ax + 0.66, -0.55, 0.07], [ax + 0.66, -0.4, 0.07], [ax - 0.66, -0.4, 0.07], GOLD, M_GOLD, [0, 0, 1]);
        }
      });
    }
    for (const z of [-14, -26, -38]) {
      putR(b, X - sx * 0.7, 7.2, z, yaw, () => {
        box(b, 0.3, 0.3, 0.5, GOLD, M_GOLD);
        put(b, 0, 0.35, 0.5, () => cylinder(b, 8, 0.34, 0.3, 0.14, GOLD, M_GOLD, { caps: true, y0: 0 }));
        for (const lx of [-0.4, 0, 0.4]) {
          const f = candleUnit(b, lx, 0.5, 0.62, 0.62);
          void f;
        }
      });
      const hp = mapP(X - sx * (0.7 + 0.62), 8.35, z + 0.4);
      ctx.lanterns.push({ p: hp, size: 1.5, rot: z * 0.7, alpha: 0.62, shape: 1, col: C.goldBright });
    }
    void lightList;
  }
}

// ---------------------------------------------------------------- back wall
function buildBackWall(b, R, ctx, mapP) {
  const z = ZB + 0.06;
  const N = [0, 0, 1];
  const n = 200;
  const archHW = 4.5, archBot = 2.9, archSpr = 9.6;
  for (let i = 0; i < n; i++) {
    const xa = -HW + (2 * HW * i) / n, xb = -HW + (2 * HW * (i + 1)) / n, xc = (xa + xb) / 2;
    const top = Math.abs(xc) <= AX ? vaultY(xc) : AISLE_C;
    if (Math.abs(xc) <= archHW) {
      const d = Math.abs(xc);
      const y0 = archSpr + Math.sqrt(Math.max(0, archHW * archHW - d * d));
      if (y0 < top) b.quad([xa, y0, z], [xb, y0, z], [xb, top, z], [xa, top, z], BLUE, M_BLUE, N);
    } else {
      b.quad([xa, G + 0.9, z], [xb, G + 0.9, z], [xb, top, z], [xa, top, z], BLUE, M_BLUE, N);
    }
  }
  put(b, 0, G + 0.45, ZB + 0.15, () => box(b, 2 * HW, 0.9, 0.3, BLACK_M, M_MARBLE));
  put(b, 0, G + 0.94, ZB + 0.2, () => box(b, 2 * HW, 0.16, 0.42, GOLD, M_GOLD));
  archPane(b, 0, archBot, archHW, archSpr, ZB + 0.02, GREEN_L, GREEN_G, M_GLOWG, 12);
  for (let i = 0; i < 5; i++) {
    flatEllipse(b, -3.6 + i * 1.8, archBot + 1.2 + (i % 3) * 1.3, 0.9, 1.2, 8, rgb('#2f6a3e'), M_LEAF, ZB + 0.05);
  }
  flatEllipse(b, 0, archBot + 4.2, 2.0, 1.0, 10, rgb('#3f8a48'), M_LEAF, ZB + 0.06);
  for (const sx of [-1, 1]) {
    put(b, sx * (archHW + 0.55), (archBot + archSpr) / 2 + 0.4, ZB + 0.35, () => box(b, 1.1, archSpr - archBot + 1.6, 0.55, GOLD_D, M_GOLD));
    put(b, sx * (archHW + 0.55), archBot + 0.3, ZB + 0.5, () => box(b, 1.35, 0.5, 0.7, GOLD, M_GOLD));
  }
  ringZ(b, 0, archSpr, ZB + 0.32, archHW + 0.05, 0.55, 0.6, GOLD, M_GOLD, 16, 0, Math.PI);
  ringZ(b, 0, archSpr, ZB + 0.42, archHW + 0.1, 0.22, 0.5, GOLD_B, M_GOLD_B, 16, 0, Math.PI);
  put(b, 0, archSpr + archHW + 0.2, ZB + 0.4, () => box(b, 1.5, 1.2, 0.7, GOLD_B, M_GOLD_B));
  putR(b, 0, archSpr + archHW + 2.1, ZB + 0.1, Math.PI, () => star(b, 1.5, 0.62, 5, 0.28, GOLD, M_GOLD_B));
  for (const sx of [-1, 1]) {
    putR(b, sx * 15.5, 11.6, z + 0.3, Math.PI, () => painting(b, R, 3.0, 3.1, sx > 0 ? 'rabbit' : 'cat', 7));
    putR(b, sx * 25.0, 11.6, z + 0.3, Math.PI, () => painting(b, R, 3.0, 3.1, 'landscape', 11));
    for (const yy of [5.4, 9.0]) {
      put(b, sx * 8.2, yy, ZB + 0.5, () => box(b, 0.7, 1.4, 0.7, IVORY, M_MARBLE));
      flatEllipse(b, sx * 8.2, yy + 0.9, 0.28, 0.9, 6, GOLD_B, M_STAR, ZB + 0.5);
    }
    ctx.lanterns.push({ p: mapP(sx * 20.5, 8.2, ZB + 1.2), size: 1.8, rot: sx * 1.3, alpha: 0.6, shape: 1, col: C.goldBright });
  }
}

// ---------------------------------------------------------------- front wall lining
function buildFrontWall(b, R) {
  const z = ZF - 0.06;
  const N = [0, 0, -1];
  const n = 200;
  const OHW = 5.0, OSPR = 8.6;
  for (let i = 0; i < n; i++) {
    const xa = -HW + (2 * HW * i) / n, xb = -HW + (2 * HW * (i + 1)) / n, xc = (xa + xb) / 2;
    const top = Math.abs(xc) <= AX ? vaultY(xc) : AISLE_C;
    if (Math.abs(xc) <= OHW) {
      const y0 = OSPR + Math.sqrt(Math.max(0, OHW * OHW - xc * xc));
      if (y0 < top) b.quad([xa, y0, z], [xb, y0, z], [xb, top, z], [xa, top, z], BLUE, M_BLUE, N);
    } else {
      b.quad([xa, G + 0.9, z], [xb, G + 0.9, z], [xb, top, z], [xa, top, z], BLUE, M_BLUE, N);
    }
  }
  ringZ(b, 0, OSPR, ZF - 0.25, 5.2, 0.5, 0.5, GOLD, M_GOLD, 16, 0, Math.PI);
  for (const sx of [-1, 1]) {
    put(b, sx * 5.45, (G + OSPR) / 2 + 0.4, ZF - 0.2, () => box(b, 0.7, OSPR - G + 1.4, 0.4, GOLD_D, M_GOLD));
    put(b, sx * 5.45, G + 0.2, ZF - 0.2, () => box(b, 0.9, 0.4, 0.6, GOLD, M_GOLD));
  }
  putR(b, 0, 15.9, ZF - 0.1, Math.PI, () => star(b, 1.6, 0.66, 5, 0.3, GOLD, M_GOLD_B));
  for (const sx of [-1, 1]) put(b, sx * 20.1, G + 0.45, ZF - 0.15, () => box(b, 29.8, 0.9, 0.3, BLACK_M, M_MARBLE));
  put(b, 0, G + 0.06, ZF - 0.28, () => box(b, 10.2, 0.14, 0.5, GOLD, M_GOLD));
  for (const sx of [-1, 1]) {
    putR(b, sx * 16.5, 9.4, ZF - 0.35, Math.PI, () => painting(b, R, 3.0, 3.4, sx > 0 ? 'landscape' : 'rabbit', 3));
    putR(b, sx * 26.5, 9.4, ZF - 0.35, Math.PI, () => painting(b, R, 3.0, 3.4, 'cat', 5));
  }
}

// ---------------------------------------------------------------- mirror pool
function buildPool(b) {
  const cz = -26, y = G + 0.04;
  flatRingY(b, 0, y + 0.02, cz, 7.9, 8.9, 34, BLACK_M, M_MARBLE);
  flatRingY(b, 0, y + 0.05, cz, 7.55, 7.95, 34, GOLD, M_GOLD_FLAT);
  b.push(T(0, y, cz));
  torus(b, 8.2, 0.42, 34, 6, GOLD_D, M_GOLD, 'y');
  torus(b, 8.55, 0.16, 34, 5, GOLD, M_GOLD_B, 'y');
  torus(b, 7.45, 0.18, 34, 5, BLACK_M, M_MARBLE, 'y');
  b.pop();
  flatDiscY(b, 0, y + 0.12, cz, 7.3, 40, WATER, M_WATER);
  for (let i = 0; i < 16; i++) {
    const a0 = (i / 16) * TAU, a1 = ((i + 1) / 16) * TAU;
    const N = [0, 1, 0];
    const rr = i % 2 === 0 ? 2.3 : 5.9;
    b.tri([Math.cos(a0) * 2.3, y + 0.13, cz + Math.sin(a0) * 2.3],
      [Math.cos(a1) * rr, y + 0.13, cz + Math.sin(a1) * rr],
      [Math.cos(a0) * 5.9, y + 0.13, cz + Math.sin(a0) * 5.9], GOLD_D, M_GOLD_FLAT, N, N, N);
  }
  // low lotus fountain (top stays under the fly-through line at y=4.8 / z=-26)
  put(b, 0, y + 0.06, cz, () => {
    cylinder(b, 16, 1.5, 1.3, 0.5, GOLD_D, M_GOLD, { caps: true, y0: 0 });
    cylinder(b, 16, 1.35, 0.5, 0.45, GOLD, M_GOLD, { caps: true, y0: 0.5 });
    cylinder(b, 12, 0.28, 0.24, 0.6, GOLD_B, M_GOLD_B, { caps: true, y0: 0.95 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      b.quad([Math.cos(a) * 0.3, 1.4, Math.sin(a) * 0.3], [Math.cos(a) * 1.35, 1.05, Math.sin(a) * 1.35],
        [Math.cos(a + 0.25) * 1.2, 1.2, Math.sin(a + 0.25) * 1.2], [Math.cos(a + 0.12) * 0.25, 1.55, Math.sin(a + 0.12) * 0.25],
        mixc(PINK, GOLD_B, 0.35), [0.3, 0.4]);
    }
    cylinder(b, 10, 0.2, 0.42, 0.4, PINK, [0.35, 0.3], { caps: true, y0: 1.45 });
  });
  // four gold urns on the kerb
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i / 4) * TAU;
    put(b, Math.cos(a) * 9.5, G, cz + Math.sin(a) * 9.5, () => {
      box(b, 1.1, 1.0, 1.1, BLACK_M, M_MARBLE);
      lathe(b, [[0.5, 1.0], [0.62, 1.4], [0.4, 2.0], [0.44, 2.3], [0.3, 2.4]], 10, GOLD, M_GOLD);
    });
  }
  // ring balustrade around the pool kerb
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * TAU;
    if (Math.abs(Math.sin(a)) < 0.001) continue;
    put(b, Math.cos(a) * 9.7, G, cz + Math.sin(a) * 9.7, () => {
      put(b, 0, 0.6, 0, () => box(b, 0.24, 1.05, 0.24, GOLD_D, M_GOLD));
      put(b, 0, 1.12, 0, () => box(b, 0.34, 0.12, 0.34, GOLD, M_GOLD));
      put(b, 0, 1.22, 0, () => box(b, 0.4, 0.1, 0.4, GOLD_B, M_GOLD_B));
      put(b, 0, 0.06, 0, () => box(b, 0.4, 0.12, 0.4, GOLD_D, M_GOLD));
    });
  }
  b.push(T(0, G + 1.28, cz));
  torus(b, 9.7, 0.16, 28, 5, GOLD, M_GOLD, 'y');
  b.pop();
  // water jets and lily pads
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.2;
    const px = Math.cos(a) * 1.05, pz = cz + Math.sin(a) * 1.05;
    put(b, px, y + 1.9, pz, () => cylinder(b, 6, 0.05, 0.02, 0.9, rgb('#dff4ff'), [0.75, 0.6], { caps: false, y0: 0 }));
    put(b, Math.cos(a) * 3.3, y + 0.16, cz + Math.sin(a) * 3.3, () => {
      flatDiscY(b, 0, 0, 0, 0.62, 10, C.leaf, M_LEAF);
      flatDiscY(b, 0, 0.012, 0, 0.3, 8, C.leafLight, M_LEAF);
    });
  }
}

// ---------------------------------------------------------------- chandeliers
function chandelier(b, ctx, mapP, z, R) {
  const bodyY = 12.7;
  put(b, 0, 13.4, z, () => cylinder(b, 6, 0.055, 0.055, 4.9, GOLD, M_GOLD, { caps: false, y0: 0 }));
  put(b, 0, 13.55, z, () => box(b, 0.7, 0.42, 0.7, GOLD_B, M_GOLD_B));
  put(b, 0, 12.15, z, () => lathe(b, [[0.14, 0], [0.85, 0.3], [0.6, 0.7], [0.2, 0.95]], 14, GOLD, M_GOLD));
  b.push(T(0, bodyY, z));
  torus(b, 2.3, 0.1, 18, 4, GOLD, M_GOLD, 'y');
  torus(b, 1.45, 0.07, 14, 4, GOLD_B, M_GOLD_B, 'y');
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    bar3(b, [0, 0, 0], [Math.cos(a) * 2.3, 0, Math.sin(a) * 2.3], 0.06, 0.06, GOLD, M_GOLD);
  }
  b.pop();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const cx = Math.cos(a) * 2.3, cz2 = Math.sin(a) * 2.3;
    candleUnit(b, cx, bodyY + 0.08, z + cz2, 0.6);
    ctx.lanterns.push({ p: mapP(cx, bodyY + 0.95, z + cz2), size: 1.05 + R() * 0.25, rot: cx * 2.1 + cz2, alpha: 0.72, shape: 1, col: C.goldBright });
    put(b, cx * 1.04, bodyY - 0.62, z + cz2 * 1.04, () => sphere(b, 0.15, rgb('#dfeaff'), [0.5, 0.9], { rings: 3, seg: 5, jitter: 0.02 }));
    put(b, cx * 0.93, bodyY - 0.28, z + cz2 * 0.93, () => sphere(b, 0.12, rgb('#dfeaff'), [0.5, 0.9], { rings: 3, seg: 5, jitter: 0.02 }));
    put(b, cx * 0.82, bodyY + 0.02, z + cz2 * 0.82, () => sphere(b, 0.1, rgb('#f6f0ff'), [0.5, 0.9], { rings: 3, seg: 5, jitter: 0.02 }));
  }
  ctx.lanterns.push({ p: mapP(0, bodyY + 0.9, z), size: 5.2, rot: 0.4, alpha: 0.45, shape: 1, col: C.cityGlow });
}

// ---------------------------------------------------------------- standing candelabra
function candelabrum(b, ctx, mapP, x, z, R) {
  put(b, x, G, z, () => {
    cylinder(b, 10, 0.55, 0.42, 0.28, BLACK_M, M_MARBLE, { caps: true, y0: 0 });
    cylinder(b, 8, 0.11, 0.09, 2.5, GOLD, M_GOLD, { caps: false, y0: 0.28 });
    cylinder(b, 8, 0.34, 0.22, 0.16, GOLD, M_GOLD, { caps: true, y0: 2.72 });
    for (const dx of [-0.55, 0, 0.55]) {
      bar3(b, [0, 2.62, 0], [dx, 3.0, 0], 0.07, 0.07, GOLD, M_GOLD);
      grid: {
        candleUnit(b, dx, 3.0, 0, 0.55);
      }
    }
    put(b, 0, 2.86, 0, () => sphere(b, 0.16, GOLD_B, M_GOLD_B, { rings: 3, seg: 6, jitter: 0.02 }));
  });
  ctx.lanterns.push({ p: mapP(x, G + 3.95, z), size: 2.0, rot: x * 1.7 + z, alpha: 0.6, shape: 1, col: C.goldBright });
  void R;
}

// ---------------------------------------------------------------- palms / plants
function palm(b, ctx, mapP, x, z, R) {
  const h = 2.6 + R() * 1.8;
  put(b, x, G, z, () => cylinder(b, 10, 0.62, 0.78, 1.0, GOLD_D, M_GOLD, { caps: true, y0: 0 }));
  put(b, x, G + 0.98, z, () => box(b, 1.75, 0.14, 1.75, GOLD, M_GOLD));
  put(b, x, G + 1.0, z, () => cylinder(b, 8, 0.22, 0.16, h, TRUNK, [0.14, 0.1], { caps: false, y0: 0 }));
  const topY = G + 1.0 + h;
  const nf = 10;
  for (let i = 0; i < nf; i++) {
    const a = (i / nf) * TAU + R() * 0.4;
    const len = 2.0 + R() * 1.4;
    const droop = 0.4 + R() * 1.0;
    const ca = Math.cos(a), sa = Math.sin(a);
    const pts = [
      [x, topY, z],
      [x + ca * len * 0.5, topY + 0.45, z + sa * len * 0.5],
      [x + ca * len * 0.85, topY + 0.1, z + sa * len * 0.85],
      [x + ca * len, topY - droop, z + sa * len],
    ];
    ribbon(b, pts, [0.16, 0.5, 0.4, 0.1], mixc(C.leaf, C.leafLight, R() * 0.5), M_LEAF);
  }
  ctx.lanterns.push({ p: mapP(x, topY + 0.4, z), size: 3.0, rot: R() * TAU, alpha: 0.9, shape: 5, col: R() < 0.5 ? C.leafLight : C.leaf });
  ctx.lanterns.push({ p: mapP(x + 0.3, topY - 0.9, z + 0.2), size: 2.2, rot: R() * TAU, alpha: 0.8, shape: 5, col: C.leaf });
}

// ---------------------------------------------------------------- console table with urn
function consoleTable(b, R, x, z, yaw) {
  putR(b, x, G, z, yaw, () => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      put(b, sx * 0.85, 0.42, sz * 0.32, () => box(b, 0.16, 0.84, 0.16, GOLD_D, M_GOLD));
    }
    box(b, 2.1, 0.16, 0.85, GOLD, M_GOLD);
    put(b, 0, 0.9, 0, () => box(b, 2.1, 0.06, 0.85, GOLD_B, M_GOLD_B));
    put(b, 0, 0.98, 0, () => {
      lathe(b, [[0.3, 0], [0.42, 0.18], [0.3, 0.5], [0.2, 0.62]], 10, BLACK_M, M_MARBLE);
      // bouquet
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * TAU;
        const rr = 0.22 + R() * 0.16;
        put(b, Math.cos(a) * rr, 0.72 + R() * 0.35, Math.sin(a) * rr, () => sphere(b, 0.14, i % 2 ? PINK : rgb('#f6f0d8'), M_LEAF, { rings: 3, seg: 5, jitter: 0.05 }));
      }
      put(b, 0, 0.78, 0, () => sphere(b, 0.2, C.leaf, M_LEAF, { rings: 3, seg: 6, jitter: 0.08 }));
    });
  });
}

// ---------------------------------------------------------------- banner
function banner(b, x, z, yTop, len) {
  const w = 0.85;
  put(b, x, yTop, z, () => cylinder(b, 6, 0.07, 0.07, w * 2, GOLD, M_GOLD, { caps: true, y0: -w }));
  b.push(T(x, yTop, z)); b.push([0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1]);
  for (let i = 0; i < 4; i++) {
    const y0 = -i * (len / 4), y1 = -(i + 1) * (len / 4);
    const sway = 0.12 * Math.sin(i * 1.4);
    b.quad([-w + sway, y0, 0], [w + sway, y0, 0], [w + sway * 0.6, y1, 0], [-w + sway * 0.6, y1, 0], BLUE_M, M_CLOTH, [0, 0, 1]);
  }
  b.pop(); b.pop();
  for (let i = 0; i < 5; i++) {
    put(b, x - w + 0.2 + i * 0.4, yTop - len - 0.12, z, () => box(b, 0.08, 0.28, 0.06, GOLD, M_GOLD));
  }
  put(b, x, yTop - len * 0.45, z + 0.03, () => star(b, 0.34, 0.14, 5, 0.05, GOLD_B, M_GOLD_B));
}

// ---------------------------------------------------------------- floating whimsy
function playingCard(b, R) {
  const red = R() < 0.5;
  const w = 1.05, h = 1.5;
  put(b, 0, 0, 0, () => {
    box(b, w, h, 0.06, CARD_W, [0.22, 0.25]);
    for (const dz of [-0.04, 0.04]) {
      for (const [px, py, s] of [[-0.3, 0.42, 0.11], [0.3, 0.42, 0.11], [0, 0, 0.17], [-0.3, -0.42, 0.11], [0.3, -0.42, 0.11]]) {
        flatEllipse(b, px, py, s, s * (red ? 0.85 : 1.1), 6, red ? CARD_R : NAVY, [0.25, 0.2], dz);
      }
      b.quad([-w / 2 + 0.08, h / 2 - 0.2, dz], [w / 2 - 0.08, h / 2 - 0.2, dz], [w / 2 - 0.08, h / 2 - 0.08, dz], [-w / 2 + 0.08, h / 2 - 0.08, dz], red ? CARD_R : NAVY, [0.25, 0.2], [0, 0, 1]);
    }
  });
}

function teacup(b, R) {
  const col = R() < 0.5 ? TEAL : rgb('#c8a3d8');
  put(b, 0, 0, 0, () => {
    cylinder(b, 12, 0.62, 0.6, 0.1, IVORY, [0.2, 0.6], { caps: true, y0: 0 });
    cylinder(b, 12, 0.66, 0.64, 0.04, GOLD, M_GOLD, { caps: true, y0: 0.08 });
    lathe(b, [[0.34, 0.12], [0.42, 0.3], [0.42, 0.46], [0.36, 0.5]], 12, col, [0.24, 0.55]);
    torus(b, 0.38, 0.035, 12, 4, GOLD, M_GOLD, 'y');
    b.quad([0.38, 0.28, 0.18], [0.34, 0.42, 0.3], [0.56, 0.56, 0.2], [0.56, 0.4, 0.06], GOLD, M_GOLD);
  });
}

// ---------------------------------------------------------------- statuary
function rabbitStatue(b, x, z, yaw, scale = 1) {
  putR(b, x, G, z, yaw, () => {
    b.push([scale, 0, 0, 0, 0, scale, 0, 0, 0, 0, scale, 0, 0, 0, 0, 1]);
    put(b, 0, 0.4, 0, () => box(b, 1.9, 0.8, 1.9, BLACK_M, M_MARBLE));
    put(b, 0, 0.88, 0, () => box(b, 2.1, 0.16, 2.1, GOLD, M_GOLD));
    lathe(b, [[0.62, 0.9], [0.5, 1.4], [0.62, 2.0], [0.4, 2.5], [0.3, 2.8]], 12, IVORY, M_MARBLE);
    put(b, 0, 3.05, 0, () => sphere(b, 0.4, IVORY, M_MARBLE, { rings: 4, seg: 8, jitter: 0.02 }));
    for (const sx of [-1, 1]) {
      put(b, sx * 0.2, 3.75, -0.05, () => box(b, 0.22, 1.3, 0.14, IVORY, M_MARBLE));
      put(b, sx * 0.3, 4.42, -0.05, () => sphere(b, 0.13, IVORY, M_MARBLE, { rings: 3, seg: 6, jitter: 0.02 }));
    }
    flatEllipse(b, -0.14, 3.07, 0.06, 0.06, 5, PINK, M_PAINT, 0.4);
    flatEllipse(b, 0.14, 3.07, 0.06, 0.06, 5, PINK, M_PAINT, 0.4);
    put(b, 0, 2.1, 0.42, () => sphere(b, 0.28, GOLD_B, M_GOLD_B, { rings: 3, seg: 6, jitter: 0.02 }));
    b.pop();
  });
}

// ---------------------------------------------------------------- hanging birdcage
function birdcage(b, ctx, mapP, x, z, R) {
  const topY = 15.4, botY = 12.5, r = 0.72;
  put(b, x, topY, z, () => cylinder(b, 6, 0.04, 0.04, 2.6, GOLD, M_GOLD, { caps: false, y0: 0 }));
  put(b, x, topY, z, () => cylinder(b, 10, 0.95, 0.36, 0.36, GOLD, M_GOLD, { caps: true, y0: 0 }));
  put(b, x, topY - 0.36, z, () => cylinder(b, 8, 0.3, 0.55, 0.2, GOLD_D, M_GOLD, { caps: true, y0: 0 }));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    bar3(b, [x + Math.cos(a) * r, botY, z + Math.sin(a) * r], [x + Math.cos(a) * r * 0.5, topY, z + Math.sin(a) * r * 0.5], 0.05, 0.05, GOLD, M_GOLD);
  }
  b.push(T(x, botY, z));
  torus(b, 0.76, 0.07, 12, 4, GOLD, M_GOLD, 'y');
  b.push(T(0, 0.32, 0));
  torus(b, 0.88, 0.06, 12, 4, GOLD, M_GOLD, 'y');
  b.pop(); b.pop();
  put(b, x, botY - 0.12, z, () => cylinder(b, 12, 0.85, 0.62, 0.22, GOLD_D, M_GOLD, { caps: true, y0: 0 }));
  bar3(b, [x - 0.46, botY + 0.72, z], [x + 0.46, botY + 0.72, z], 0.05, 0.05, GOLD, M_GOLD);
  put(b, x, botY + 0.45, z, () => sphere(b, 0.2, rgb('#e8f0ff'), [0.32, 0.4], { rings: 3, seg: 6, jitter: 0.02, seed: Math.floor(R() * 9) }));
  put(b, x + 0.16, botY + 0.62, z, () => sphere(b, 0.1, rgb('#f0f4ff'), [0.32, 0.4], { rings: 3, seg: 5, jitter: 0.02 }));
  ctx.lanterns.push({ p: mapP(x, botY + 0.5, z), size: 1.6, rot: R() * TAU, alpha: 0.45, shape: 1, col: rgb('#e8f0ff') });
}

// ---------------------------------------------------------------- assembly
export function buildGlassHall(b, ctx, rng) {
  b.note && b.note('glassHall');
  const R = mulberry32(0x91a5520 & 0x7fffffff);   // LOCAL rng only
  void rng;
  const A = L.glassPalace;
  const ca = Math.cos(A.rot), sa = Math.sin(A.rot);
  // inFrame convention: local X -> (cos,0,sin), local Z -> (-sin,0,cos)
  const mapP = (lx, ly, lz) => [A.x + ca * lx - sa * lz, ly, A.z + sa * lx + ca * lz];
  if (!ctx.lanterns) ctx.lanterns = [];

  inFrame(b, [A.x, 0, A.z], A.rot, () => {
    buildFloor(b, R);
    buildCarpet(b);
    buildArcade(b);
    buildVault(b, R);
    buildSkylightTrim(b);
    buildAisleCeilings(b, R);
    buildOuterWall(b, R, ctx, mapP, null);
    buildBackWall(b, R, ctx, mapP);
    buildFrontWall(b, R);
    buildPool(b);
    for (const z of [-5, -11, -17, -23, -29, -35, -41, -44.5]) chandelier(b, ctx, mapP, z, R);
    for (const [bx, bz] of [[-5.6, -8.5], [5.6, -8.5], [-5.6, -45.0], [5.6, -45.0]]) birdcage(b, ctx, mapP, bx, bz, R);
    for (const sx of [-1, 1]) {
      put(b, sx * 8.6, G, -3.4, () => {
        cylinder(b, 10, 0.55, 0.4, 0.3, BLACK_M, M_MARBLE, { caps: true, y0: 0 });
        cylinder(b, 8, 0.12, 0.1, 1.5, GOLD, M_GOLD, { caps: false, y0: 0.3 });
        cylinder(b, 12, 0.42, 0.75, 0.5, GOLD_D, M_GOLD, { caps: true, y0: 1.8 });
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * TAU;
          put(b, Math.cos(a) * 0.32, 2.3, Math.sin(a) * 0.32, () => cylinder(b, 5, 0.09, 0.01, 0.7, GOLD_B, M_STAR, { caps: true, y0: 0 }));
        }
        put(b, 0, 2.25, 0, () => sphere(b, 0.26, rgb('#ffd9a0'), [0.7, 0.2], { rings: 3, seg: 6, jitter: 0.05 }));
      });
      ctx.lanterns.push({ p: mapP(sx * 8.6, G + 2.4, -3.4), size: 2.6, rot: sx * 1.1, alpha: 0.6, shape: 1, col: C.goldBright });
    }
    // banners between the arcade arches
    for (const sx of [-1, 1]) for (const z of [-11, -17, -23, -29, -35, -41]) banner(b, sx * 12.15, z, 15.0, 3.1);
    // standing candelabra inside the nave edge
    for (const sx of [-1, 1]) for (const z of [-11, -23, -35, -45]) candelabrum(b, ctx, mapP, sx * 10.7, z, R);
    // entrance statues + urns
    rabbitStatue(b, -10.5, -6.5, 0.5);
    rabbitStatue(b, 10.5, -6.5, -0.5);
    rabbitStatue(b, -11.6, -20.0, 1.3);
    rabbitStatue(b, 11.6, -32.0, -1.3);
    rabbitStatue(b, -20.0, -44.5, 0.9, 0.9);
    rabbitStatue(b, 20.0, -44.5, -0.9, 0.9);
    // statuary promenade along the arcade piers (nave side)
    rabbitStatue(b, -11.4, -14, 1.4, 0.82);
    rabbitStatue(b, 11.4, -17, -1.4, 0.82);
    rabbitStatue(b, -11.4, -23, 1.4, 0.82);
    rabbitStatue(b, 11.4, -26, -1.4, 0.82);
    rabbitStatue(b, -11.4, -35, 1.4, 0.82);
    rabbitStatue(b, 11.4, -38, -1.4, 0.82);
    rabbitStatue(b, -11.4, -44, 1.4, 0.82);
    rabbitStatue(b, 11.4, -11, -1.4, 0.82);
    for (const px of [-7.5, 7.5]) {
      put(b, px, G, -4.5, () => {
        put(b, 0, 0.7, 0, () => box(b, 1.6, 1.4, 1.6, BLACK_M, M_MARBLE));
        put(b, 0, 0.75, 0, () => box(b, 1.8, 0.18, 1.8, GOLD, M_GOLD));
        lathe(b, [[0.6, 1.55], [0.72, 2.05], [0.46, 2.75], [0.5, 3.15], [0.34, 3.3]], 12, GOLD, M_GOLD);
      });
      palm(b, ctx, mapP, px * 0.9, -5.4, R);
    }
    // palms in the aisles
    const palms = [
      [-18, -9], [18, -9], [-18, -17], [18, -17], [-18, -27], [18, -27],
      [-18, -37], [18, -37], [-29, -13], [29, -13], [-29, -30], [29, -30],
      [-29, -43], [29, -43], [-17, -45], [17, -45], [-22, -6], [22, -6],
      [-31, -20], [31, -20], [-31, -37], [31, -37], [-24, -24], [24, -24],
      [-30.5, -16], [30.5, -16], [-30.5, -33], [30.5, -33], [-21, -41], [21, -41],
      [-23, -7.0], [23, -7.0], [-28, -44], [28, -44], [-30.5, -24], [30.5, -24],
    ];
    for (const [px, pz] of palms) palm(b, ctx, mapP, px, pz, R);
    // console tables along the outer walls
    for (const sx of [-1, 1]) for (const z of [-5, -11, -17, -23, -29, -35, -41, -47]) consoleTable(b, R, sx * 32.9, z, sx > 0 ? -Math.PI / 2 : Math.PI / 2);
    // floating cards and teacups
    const cardSpots = [
      [-6.5, 8.2, -13], [7.2, 9.4, -17], [-8.5, 6.4, -21], [8.8, 11.2, -25],
      [-7.4, 12.6, -30], [7.6, 7.2, -34], [-9.2, 10.4, -38], [9.4, 8.0, -42],
      [-15.5, 7.4, -12], [16.2, 9.8, -22], [-16.8, 11.6, -33], [15.4, 6.6, -40],
      [4.6, 13.4, -20], [-4.2, 6.0, -44], [2.0, 11.8, -8], [6.4, 5.6, -12],
      [-6.8, 10.0, -26], [7.8, 12.2, -36], [-11.2, 8.6, -43], [11.4, 10.6, -15],
      [-3.6, 9.2, -33], [3.2, 6.8, -39], [9.8, 12.8, -45], [-9.4, 7.8, -36],
    ];
    for (const [px, py, pz] of cardSpots) {
      putR(b, px, py, pz, R() * TAU, () => {
        const ang = 0.5 + R() * 0.5;
        b.push([1, 0, 0, 0, 0, Math.cos(ang), Math.sin(ang), 0, 0, -Math.sin(ang), Math.cos(ang), 0, 0, 0, 0, 1]);
        playingCard(b, R);
        b.pop();
      });
    }
    for (const [px, py, pz] of [[-5.2, 7.6, -15], [5.6, 9.2, -24], [-6.4, 8.8, -37], [6.2, 7.0, -45], [-4.0, 10.6, -29], [4.4, 6.2, -18], [-5.6, 8.4, -41], [5.0, 11.0, -33]]) {
      putR(b, px, py, pz, R() * TAU, () => {
        b.push([1, 0, 0, 0, 0, Math.cos(0.3), Math.sin(0.3), 0, 0, -Math.sin(0.3), Math.cos(0.3), 0, 0, 0, 0, 1]);
        teacup(b, R);
        b.pop();
      });
      ctx.lanterns.push({ p: mapP(px, py + 1.0, pz), size: 0.9, rot: R() * TAU, alpha: 0.5, shape: 1, col: C.ballMint });
    }
    // gilded rope stanchions along the carpet
    for (const sx of [-1, 1]) for (const z of [-6.5, -11.5, -15.5]) {
      put(b, sx * 3.5, G, z, () => {
        cylinder(b, 8, 0.16, 0.16, 1.0, GOLD, M_GOLD, { caps: true, y0: 0 });
        cylinder(b, 8, 0.26, 0.18, 0.12, GOLD_B, M_GOLD_B, { caps: true, y0: 1.0 });
        sphere(b, 0.16, GOLD_B, M_GOLD_B, { rings: 3, seg: 6, jitter: 0.02, seed: 3 });
      });
      if (z > -15.5) bar3(b, [sx * 3.5, G + 0.92, z], [sx * 3.5, G + 0.86, z - 5.0], 0.07, 0.07, GOLD, M_GOLD_B);
    }
  });

  // ---------------------------------------------------------------- lights
  if (ctx.points) {
    const P = (lx, ly, lz, col, range, int) => ctx.points.push({ p: mapP(lx, ly, lz), col, range, int });
    P(0, 9.0, -8, C.cityGlow, 42, 0.95);
    P(0, 9.0, -21, C.cityGlow, 42, 0.92);
    P(0, 9.0, -34, C.cityGlow, 42, 0.9);
    P(0, 5.6, -45.5, rgb('#d8f0b8'), 26, 0.6);
    P(-26, 8.5, -18, rgb('#c8ecac'), 32, 0.55);
    P(26, 8.5, -32, rgb('#c8ecac'), 32, 0.55);
    P(-27, 8.5, -42, rgb('#c8ecac'), 30, 0.5);
    P(0, 16.5, -26, rgb('#a8b8f0'), 30, 0.45);
    P(0, 4.8, -4.5, C.goldBright, 24, 0.72);
    P(0, 12.5, -26, rgb('#ffd9a8'), 24, 0.4);
  }
}
