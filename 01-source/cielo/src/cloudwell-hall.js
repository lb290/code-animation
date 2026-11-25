// cloudwell-hall.js — ROUND 14 · 云井塔 / THE CLOUDWELL — the interior furnishings.
// OWNER: agent "hall".  Contract: src/cloudwell-plan.js (read-only).  Shell (platform, decks,
// railings, walls, turret, crown) belongs to owner "shell"; this module only stands things on
// those surfaces and hangs things in the atrium.
//
// LAYOUT (local metres, origin on the water-gate axis, +Z = the portal / north):
//   y = 7.0      entrance hall.  The flyable cavity there is r 6.0..16.4 at y 8.2..18.6, so all
//                floor furniture stops below y 8.12; only wall-band pieces (r 16.45..16.68, just
//                inside the 16.8 m glass wall) rise higher: cloud maps, banners, sconces.
//   y = 20..80   eleven galleries, deck tops CW.GALV[i].  Walkway band r 10.4..15.8; wall band
//                r 16.45..16.68.  Galleries 1, 5 and 11 carry a camera cavity (deck+1.0..+5.4),
//                so their furniture stays below deck+0.97 — only wall-mounted pieces go high.
//   r 7.0..8.6   six chandelier chains dropped from the crown (y ~90) to y 34..74.
//   r ~9.3       eight silk banners hung over the gallery rails (r 9.5 is the deck edge).
//
// Determinism: own rng (the passed rng is ignored on purpose); the draw stream never depends
// on how many numbers earlier modules took.
import { mulberry32, TAU, m4 } from './math.js';
import { box, cylinder, torus, rgb, mulc, mixc, lathe, sphere, bar3 } from './geo.js';
import { tubePath, ellipsoid, star } from './lib3d.js';
import { CW, CWC, CWM, cwPush, cwWorld, annulusXZ, CW_LIGHTS } from './cloudwell-plan.js';

const SEED = 0x0c10a1;

// ---------------------------------------------------------------- dimensions
const GY = CW.PY1;                 // 7.0 — entrance-hall deck top
const WALL = 16.62;                // centre of wall-mounted pieces (safe band 16.4..16.8)
const DECK = (i) => CW.GALV[i];

// ---------------------------------------------------------------- palette
const IVORY = CWC.IVORY, IVORY_W = CWC.IVORY_W;
const STONE = CWC.STONE, STONE_D = CWC.STONE_D, STONE_L = CWC.STONE_L;
const MARBLE = CWC.MARBLE, MARBLE_D = CWC.MARBLE_D;
const GOLD = CWC.GOLD, GOLD_B = CWC.GOLD_B, GOLD_D = CWC.GOLD_D;
// Interior albedo discipline (brief: median (r+g+b)/3 in 0.42..0.53): brass dominates the
// vertex count of a brass-and-glass hall, so the fittings use the polished half of the CWC
// brass ramp.  These are still CWC colours (no invented ones), just the lighter end.
const BRASS = mixc(CWC.BRASS, CWC.BRASS_L, 0.80);
const BRASS_D = mixc(CWC.BRASS_D, CWC.BRASS, 0.55);
const BRASS_L = CWC.BRASS_L;
const STEEL = CWC.STEEL, STEEL_D = CWC.STEEL_D;
const GLASS = CWC.GLASS, GLASS_D = CWC.GLASS_D, GLASS_ICE = CWC.GLASS_ICE;
const BLUE = CWC.BLUE, BLUE_D = CWC.BLUE_D, BLUE_L = CWC.BLUE_L;
const CLOTH = CWC.CLOTH, CLOTH_R = CWC.CLOTH_R;
const WOOD = CWC.WOOD, WOOD_D = CWC.WOOD_D, WOOD_L = CWC.WOOD_L;
const LEAF = CWC.LEAF, LEAF_D = CWC.LEAF_D, LEAF_L = CWC.LEAF_L;
const PAPER = CWC.PAPER, INK = CWC.INK, CLOUD = CWC.CLOUD, CLOUD_B = CWC.CLOUD_B;

// ---------------------------------------------------------------- materials (CWM: emissive <= 0.14)
const M_ST = CWM.stone, M_STW = CWM.stoneWarm, M_MB = CWM.marble, M_MBD = CWM.marbleD;
const M_BR = CWM.brass, M_GD = CWM.gold, M_GDB = CWM.goldB, M_STL = CWM.steel;
const M_GL = CWM.glass, M_GLD = CWM.glassD, M_WD = CWM.wood, M_CL = CWM.cloth;
const M_CLS = CWM.clothS, M_LF = CWM.leaf, M_PP = CWM.paper, M_IR = CWM.iron, M_CLD = CWM.cloud;

// ---------------------------------------------------------------- frame helpers
const T = (x, y, z) => m4.translate([x, y, z]);
const RY = (a) => m4.rotY(a);
const RX = (a) => m4.rotX(a);
const RZ = (a) => m4.rotZ(a);
function put(b, x, y, z, fn) { b.push(T(x, y, z)); fn(); b.pop(); }
function putR(b, x, y, z, yaw, fn) { b.push(T(x, y, z)); b.push(RY(yaw)); fn(); b.pop(); b.pop(); }
// local +Z of a prop points at the tower axis (furniture faces the atrium)
const yawIn = (a) => Math.atan2(-Math.cos(a), -Math.sin(a));
// local +Z points outward, away from the axis (telescopes look out through the glass wall)
const yawOut = (a) => Math.atan2(Math.cos(a), Math.sin(a));
function putRing(b, y, a, r, yaw, fn) { putR(b, Math.cos(a) * r, y, Math.sin(a) * r, yaw, fn); }
// flat polar quad on the floor/paving (2 tris)
function polarQuad(b, r0, r1, a0, a1, y, col, mat, ny = 1) {
  const N = [0, ny, 0];
  const p0 = [Math.cos(a0) * r0, y, Math.sin(a0) * r0], p1 = [Math.cos(a1) * r0, y, Math.sin(a1) * r0];
  const p2 = [Math.cos(a1) * r1, y, Math.sin(a1) * r1], p3 = [Math.cos(a0) * r1, y, Math.sin(a0) * r1];
  b.quad(p0, p1, p2, p3, col, mat, N);
}
// vertical quad in a local XY plane (canvas faces, glass panes)
function faceXY(b, x0, y0, x1, y1, z, col, mat, nz = 1) {
  const N = [0, 0, nz];
  b.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], col, mat, N);
}

// ---------------------------------------------------------------- static light billboards (<= 90, size 0.2..0.8, alpha <= 0.85)
let glowN = 0;
function glow(ctx, x, y, z, size, hex, alpha = 0.8) {
  if (!ctx.lanterns || glowN >= 88) return;
  glowN++;
  ctx.lanterns.push({
    p: cwWorld([x, y, z]), size: Math.max(0.2, Math.min(0.8, size)), rot: 0,
    alpha: Math.max(0.2, Math.min(0.85, alpha)), shape: 1, col: rgb(hex),
  });
}

// ================================================================ shared props
// ---------------------------------------------------------------- a glass bottle that holds a cloud (~150 tri)
function cloudBottle(b, seed) {
  lathe(b, [[0.001, 0], [0.070, 0.006], [0.082, 0.055], [0.086, 0.20], [0.070, 0.27], [0.034, 0.325], [0.030, 0.390], [0.045, 0.410]],
    6, GLASS, M_GL);
  put(b, 0, 0.410, 0, () => {
    cylinder(b, 6, 0.042, 0.034, 0.050, BRASS, M_BR, { y0: 0 });
    put(b, 0, 0.050, 0, () => torus(b, 0.028, 0.011, 6, 2, GOLD_B, M_GDB, 'y'));
  });
  put(b, 0, 0.180, 0, () => {
    sphere(b, 0.052, CLOUD, M_CLD, { rings: 2, seg: 5, jitter: 0.30, seed });
    put(b, 0.024, 0.026, 0.012, () => sphere(b, 0.028, CLOUD_B, M_CLD, { rings: 2, seg: 4, jitter: 0.30, seed: seed + 3 }));
  });
}

// ---------------------------------------------------------------- bench (brass + wood + cloth)
function bench(b, len = 2.9, seats = 3, simple = false) {
  const hy = 0.44;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    put(b, sx * (len / 2 - 0.20), 0, sz * 0.24, () => lathe(b,
      [[0.001, 0], [0.082, 0.012], [0.058, 0.26], [0.052, hy]], 6, BRASS, M_BR));
  }
  put(b, 0, hy - 0.075, 0, () => box(b, len - 0.10, 0.085, 0.60, WOOD_L, M_WD));
  put(b, 0, hy - 0.012, 0, () => box(b, len, 0.040, 0.66, GOLD, M_GD));
  const seg = len / seats;
  for (let i = 0; i < seats; i++) {
    const x = -len / 2 + seg * (i + 0.5);
    put(b, x, hy + 0.038, 0.010, () => {
      box(b, seg - 0.10, 0.072, 0.52, CLOTH, M_CLS);
      put(b, 0, 0.040, 0, () => box(b, seg - 0.14, 0.010, 0.50, mulc(CLOTH, 1.35), M_CLS));
    });
  }
  // backrest: two brass posts + a leaning wood panel + cloth pads
  for (const sx of [-1, 1]) {
    bar3(b, [sx * (len / 2 - 0.16), hy - 0.02, -0.24], [sx * (len / 2 - 0.17), hy + 0.47, -0.40], 0.050, 0.045, BRASS, M_BR);
    if (!simple) put(b, sx * (len / 2 - 0.16), hy + 0.47, -0.40, () => sphere(b, 0.042, GOLD_B, M_GDB, { rings: 2, seg: 4, jitter: 0.05 }));
  }
  put(b, 0, hy + 0.30, -0.355, () => { b.push(RX(0.155)); box(b, len - 0.26, 0.42, 0.055, WOOD, M_WD); b.pop(); });
  for (let i = 0; i < seats; i++) {
    const x = -len / 2 + seg * (i + 0.5);
    put(b, x, hy + 0.315, -0.315, () => { b.push(RX(0.155)); box(b, seg - 0.12, 0.34, 0.055, mulc(CLOTH, 1.06), M_CLS); b.pop(); });
  }
  if (!simple) for (const sx of [-1, 1]) {
    bar3(b, [sx * (len / 2 - 0.10), hy + 0.235, 0.25], [sx * (len / 2 - 0.11), hy + 0.245, -0.30], 0.045, 0.050, GOLD_B, M_GDB);
  }
}

// ---------------------------------------------------------------- a stone planter with a low tree (~360 tri)
function planterTree(b, kind, scale = 0.92) {
  const ph = 0.52 * scale;
  lathe(b, [[0.001, 0], [0.50 * scale, 0.015], [0.545 * scale, 0.11], [0.585 * scale, ph - 0.10], [0.635 * scale, ph], [0.575 * scale, ph + 0.045]],
    8, STONE, M_ST);
  put(b, 0, ph, 0, () => annulusXZ(b, 0, 0, 0, 0.50 * scale, 0, 8, mulc(WOOD_D, 0.85), M_WD, 1));
  if (kind === 'palm') {
    cylinder(b, 6, 0.070 * scale, 0.050 * scale, 0.32 * scale, WOOD_D, M_WD, { y0: ph });
    const r0 = ph + 0.31 * scale;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU + 0.3;
      tubePath(b, [[0, r0, 0], [Math.cos(a) * 0.19 * scale, r0 + 0.10 * scale, Math.sin(a) * 0.19 * scale],
        [Math.cos(a) * 0.40 * scale, r0 + 0.08 * scale, Math.sin(a) * 0.40 * scale]],
        [0.042 * scale, 0.034 * scale, 0.008 * scale], 3, k % 2 ? LEAF : LEAF_D, M_LF);
    }
    put(b, 0, r0, 0, () => sphere(b, 0.075 * scale, LEAF_D, M_LF, { rings: 2, seg: 4, jitter: 0.25 }));
  } else {
    cylinder(b, 6, 0.065 * scale, 0.045 * scale, 0.30 * scale, WOOD_D, M_WD, { y0: ph });
    const cy = ph + 0.46 * scale;
    put(b, 0, cy, 0, () => {
      sphere(b, 0.200 * scale, LEAF, M_LF, { rings: 3, seg: 5, jitter: 0.22, seed: 3 });
      put(b, 0.13, -0.03, 0.04, () => sphere(b, 0.125 * scale, LEAF_D, M_LF, { rings: 2, seg: 5, jitter: 0.22, seed: 9 }));
      put(b, -0.12, 0.02, -0.05, () => sphere(b, 0.115 * scale, LEAF_L, M_LF, { rings: 2, seg: 5, jitter: 0.22, seed: 15 }));
    });
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU + 0.6;
      put(b, Math.cos(a) * 0.15 * scale, cy - 0.04 * scale + (k % 2) * 0.06 * scale, Math.sin(a) * 0.15 * scale,
        () => sphere(b, 0.040 * scale, rgb('#e08a3a'), [0.14, 0.35], { rings: 2, seg: 4, jitter: 0.1 }));
    }
  }
}

// ---------------------------------------------------------------- a case of sealed cloud bottles (~200 + bottles)
function displayCase(b, n, seed, baseH, glassH, low) {
  const dw = 1.50, dd = 0.58;
  put(b, 0, baseH / 2, 0, () => box(b, dw, baseH, dd, STONE, M_MB));
  put(b, 0, baseH - 0.028, 0, () => box(b, dw + 0.05, 0.050, dd + 0.05, GOLD, M_GD));
  put(b, 0, 0.040, 0, () => box(b, dw + 0.09, 0.080, dd + 0.09, BRASS_D, M_BR));
  for (let i = 0; i < n; i++) {
    const x = -dw / 2 + 0.15 + (i * (dw - 0.30)) / Math.max(1, n - 1);
    put(b, x, baseH + 0.026, (i % 2 ? 0.05 : -0.05), () => cloudBottle(b, seed + i * 5));
  }
  const gy0 = baseH + 0.026, gy1 = gy0 + glassH;
  // the front pane is left open (a glass face would hide the bottles behind it); back + sides stay
  faceXY(b, -dw / 2, gy0, dw / 2, gy1, -dd / 2, GLASS, M_GL, -1);
  for (const sx of [-1, 1]) faceXY(b, sx * dw / 2, gy0, sx * dw / 2, gy1, -dd / 2, GLASS, M_GL, sx > 0 ? 1 : -1);
  // brass corner posts + head + sill
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    bar3(b, [sx * dw / 2, gy0, sz * dd / 2], [sx * dw / 2, gy1, sz * dd / 2], 0.042, 0.042, BRASS, M_BR);
  }
  put(b, 0, gy1, 0, () => box(b, dw + 0.07, 0.055, dd + 0.07, GOLD, M_GD));
  put(b, 0, gy1 + (low ? 0.045 : 0.06), 0, () => ellipsoid(b, dw * 0.30, low ? 0.045 : 0.10, dd * 0.34, 10, 2, GOLD_B, M_GDB, { v0: 0.5, v1: 0.99 }));
  put(b, 0, baseH + 0.10, dd / 2 + 0.030, () => box(b, 0.40, 0.085, 0.018, GOLD_B, M_GDB));
}

// ---------------------------------------------------------------- the wall cloud map (~600 tri)
function cloudMap(b, w, h, seed) {
  put(b, 0, 0, -0.028, () => box(b, w + 0.12, h + 0.12, 0.050, GOLD_D, M_GD));
  put(b, 0, 0, 0.005, () => box(b, w, h, 0.036, BLUE_D, M_MBD));
  faceXY(b, -w / 2 + 0.05, -h / 2 + 0.05, w / 2 - 0.05, h / 2 - 0.05, 0.026, BLUE, [0.10, 0.12], 1);
  for (const sz of [-1, 1]) put(b, 0, sz * h / 2, 0.028, () => box(b, w, 0.040, 0.016, GOLD_B, M_GDB));
  for (const sx of [-1, 1]) put(b, sx * w / 2, 0, 0.028, () => box(b, 0.040, h, 0.016, GOLD_B, M_GDB));
  // graticule
  for (let k = 1; k < 4; k++) put(b, 0, -h / 2 + (k * h) / 4, 0.031, () => box(b, w - 0.16, 0.012, 0.008, mulc(BLUE_L, 0.62), [0.09, 0.1]));
  for (let k = 1; k < 6; k++) put(b, -w / 2 + (k * w) / 6, 0, 0.031, () => box(b, 0.012, h - 0.16, 0.008, mulc(BLUE_L, 0.62), [0.09, 0.1]));
  // contour family
  const rnd = mulberry32(seed);
  for (let c = 0; c < 6; c++) {
    const base = -h / 2 + 0.28 + (c * (h - 0.56)) / 5;
    const pts = [];
    for (let k = 0; k <= 6; k++) {
      const x = -w / 2 + 0.20 + ((w - 0.40) * k) / 6;
      const y = base + 0.15 * Math.sin(k * 1.05 + c * 1.1) + 0.06 * Math.sin(k * 2.7 + c) * (0.4 + rnd() * 0.6);
      pts.push([x, y, 0.036]);
    }
    tubePath(b, pts, 0.010, 3, GOLD_B, M_GDB, { caps: false });
  }
  // compass rose
  put(b, w * 0.30, h * 0.24, 0.040, () => {
    torus(b, 0.28, 0.026, 14, 3, GOLD, M_GD, 'z');
    star(b, 0.235, 0.070, 4, 0.018, GOLD_B, M_GDB);
  });
  // island marks + scale bar
  for (let k = 0; k < 3; k++) {
    put(b, -w * 0.28 + k * w * 0.12, -h * 0.26 + Math.sin(k * 2.1) * h * 0.10, 0.036,
      () => tubePath(b, [[-0.05, 0, 0], [0, 0.026, 0], [0.05, 0, 0]], 0.013, 3, GOLD_B, M_GDB, { caps: false }));
  }
  put(b, w * 0.10, -h / 2 + 0.16, 0.036, () => box(b, w * 0.32, 0.014, 0.008, GOLD_B, M_GDB));
}

// ---------------------------------------------------------------- a long silk banner hung on the wall band (~300 tri)
function wallBanner(b, w, drop, mainCol, accentCol, seed) {
  const rnd = mulberry32(seed);
  const nu = 5, nv = 9;
  const P = (i, j) => {
    const u = i / nu, v = j / nv;
    return [-w / 2 + w * u, -drop * v - 0.10 * Math.sin(u * Math.PI) * (1 - v),
      0.022 + 0.055 * (0.5 + 0.5 * Math.sin(u * Math.PI * 3.0 + v * 1.1)) + 0.02 * rnd()];
  };
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const p00 = P(i, j), p10 = P(i + 1, j), p11 = P(i + 1, j + 1), p01 = P(i, j + 1);
      b.quad(p00, p10, p11, p01, (j / nv) > 0.88 ? accentCol : mainCol, M_CLS, [0, 0, 1]);
    }
  }
  for (const sx of [-1, 1]) {
    for (let j = 0; j < nv; j++) {
      const a = P(sx > 0 ? nu : 0, j), c2 = P(sx > 0 ? nu : 0, j + 1);
      const x0 = sx * w / 2 - sx * 0.11;
      b.quad([x0, a[1], a[2] + 0.004], [x0 + sx * 0.11, a[1], a[2] + 0.004],
        [x0 + sx * 0.11, c2[1], c2[2] + 0.004], [x0, c2[1], c2[2] + 0.004], GOLD, M_GD, [0, 0, 1]);
    }
  }
  const hemY = -drop;
  b.quad([-w / 2, hemY, 0.10], [w / 2, hemY, 0.10], [w / 2, hemY + 0.15, 0.075], [-w / 2, hemY + 0.15, 0.075], GOLD, M_GD, [0, 0, 1]);
  for (let k = 0; k < 4; k++) {
    const x = -w / 2 + 0.22 + (k * (w - 0.44)) / 3;
    put(b, x, hemY + 0.02, 0.10, () => lathe(b, [[0.001, 0], [0.028, 0.010], [0.012, 0.070], [0.001, 0.140]], 4, GOLD_B, M_GDB));
  }
  bar3(b, [-w / 2 - 0.10, 0, 0.02], [w / 2 + 0.10, 0, 0.02], 0.045, 0.045, BRASS, M_BR);
  for (const sx of [-1, 1]) put(b, sx * (w / 2 + 0.09), 0, 0.02, () => sphere(b, 0.055, GOLD_B, M_GDB, { rings: 2, seg: 4, jitter: 0.05 }));
}

// ---------------------------------------------------------------- brass wall sconce (~150 tri)
function wallSconce(b, x, y, z, outX, outZ) {
  // built facing the axis: (outX,outZ) is the radial outward unit vector
  put(b, x, y, z, () => {
    b.push(RY(Math.atan2(-outX, -outZ)));
    put(b, 0, 0, -0.055, () => box(b, 0.18, 0.30, 0.040, BRASS_D, M_BR));
    put(b, 0, 0.11, -0.055, () => box(b, 0.24, 0.06, 0.045, GOLD, M_GD));
    tubePath(b, [[0, -0.10, -0.03], [0, -0.13, 0.02], [0, -0.04, 0.075], [0, 0.04, 0.085]], 0.020, 3, BRASS, M_BR);
    put(b, 0, 0.055, 0.082, () => {
      cylinder(b, 8, 0.058, 0.054, 0.018, GOLD_B, M_GDB, { y0: 0 });
      put(b, 0, 0.018, 0, () => cylinder(b, 6, 0.017, 0.017, 0.150, IVORY_W, M_PP, { y0: 0 }));
      put(b, 0, 0.168, 0, () => sphere(b, 0.026, GOLD, M_GD, { rings: 2, seg: 4, jitter: 0.05 }));
    });
    b.pop();
  });
}

// ---------------------------------------------------------------- a marble urn of flowers (~340 tri)
function flowerUrn(b) {
  lathe(b, [[0.001, 0], [0.28, 0.012], [0.235, 0.06], [0.185, 0.16], [0.275, 0.30], [0.315, 0.42], [0.285, 0.50], [0.31, 0.55]],
    9, MARBLE, M_MB);
  put(b, 0, 0.55, 0, () => torus(b, 0.30, 0.030, 12, 3, GOLD, M_GD, 'y'));
  put(b, 0, 0.545, 0, () => annulusXZ(b, 0, 0, 0, 0.27, 0, 9, mulc(WOOD_D, 0.85), M_WD, 1));
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * TAU + 0.4;
    const rr = 0.05 + (k % 3) * 0.075;
    const hh = 0.64 + (k % 4) * 0.05;
    const col = k % 3 === 0 ? CLOTH_R : k % 3 === 1 ? BLUE_L : IVORY_W;
    put(b, Math.cos(a) * rr, 0.545, Math.sin(a) * rr, () => {
      tubePath(b, [[0, 0, 0], [Math.cos(a) * rr * 0.5, hh * 0.5, Math.sin(a) * rr * 0.5], [Math.cos(a) * rr, hh - 0.55, Math.sin(a) * rr]], 0.009, 2, LEAF_D, M_LF);
      put(b, Math.cos(a) * rr, hh - 0.55, Math.sin(a) * rr, () => sphere(b, 0.052, col, k % 3 === 0 ? M_CLS : M_MB, { rings: 2, seg: 4, jitter: 0.18, seed: 5 + k }));
    });
  }
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU + 0.9;
    put(b, Math.cos(a) * 0.16, 0.60, Math.sin(a) * 0.16, () => sphere(b, 0.050, LEAF, M_LF, { rings: 2, seg: 4, jitter: 0.25, seed: 11 + k }));
  }
}

// ---------------------------------------------------------------- brass wind chime (~360 tri)
function windChime(b, x, z, yTop, len, seed) {
  const rnd = mulberry32(seed);
  bar3(b, [x, yTop, z], [x, yTop - len * 0.26, z], 0.013, 0.013, BRASS_D, M_BR);
  put(b, x, yTop - len * 0.28, z, () => {
    cylinder(b, 8, 0.095, 0.085, 0.024, GOLD, M_GD, { y0: 0 });
    put(b, 0, -0.028, 0, () => sphere(b, 0.040, GOLD_B, M_GDB, { rings: 2, seg: 4, jitter: 0.05 }));
  });
  const n = 3;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU + 0.5;
    const rr = 0.06 + 0.055 * ((k * 7) % 3) / 2;
    const hh = len * (0.30 + 0.15 * ((k * 3) % 4) / 3);
    const px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr;
    put(b, px, yTop - len * 0.29, pz, () => {
      bar3(b, [0, 0, 0], [0, -0.05, 0], 0.009, 0.009, BRASS_D, M_BR);
      cylinder(b, 6, 0.028, 0.024, hh, BRASS, M_BR, { y0: -0.05 - hh });
      put(b, 0, -0.05 - hh, 0, () => torus(b, 0.024, 0.009, 6, 2, GOLD_B, M_GDB, 'y'));
    });
  }
  put(b, x, yTop - len * 0.29 - len * 0.28, z, () => {
    cylinder(b, 10, 0.145, 0.155, 0.020, GOLD_B, M_GDB, { y0: 0 });
    put(b, 0, -0.032, 0, () => sphere(b, 0.048, GOLD, M_GD, { rings: 2, seg: 4, jitter: 0.05 }));
  });
  for (let k = 0; k < 2; k++) {
    const a = (k / 2) * TAU + 4.1;
    bar3(b, [x, yTop - len * 0.29 - 0.04, z], [x + Math.cos(a) * 0.13, yTop - len * 0.29 - 0.20, z + Math.sin(a) * 0.13],
      0.008, 0.008, BRASS_D, M_BR);
  }
  void rnd;
}

// ---------------------------------------------------------------- brass telescope on a low tripod (~260 tri)
function telescope(b, big) {
  const s = big ? 1.0 : 0.90;
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU + 0.5;
    bar3(b, [Math.cos(a) * 0.30 * s, 0.02, Math.sin(a) * 0.30 * s],
      [Math.cos(a) * 0.05, 0.54 * s, Math.sin(a) * 0.05], 0.042, 0.042, BRASS_D, M_BR);
  }
  put(b, 0, 0.46 * s, 0, () => {
    sphere(b, 0.075, BRASS, M_BR, { rings: 2, seg: 6, jitter: 0.05 });
    put(b, 0, 0.03, 0, () => {
      b.push(RX(-0.34));
      b.push(T(0, 0.06, 0.06));
      // main tube, then the flared objective cell (the aperture reads from across the gallery).
      // Everything stays under 0.95 m so galleries 5 and 11 keep their camera cavity empty.
      cylinder(b, 10, 0.078, 0.070, 0.44 * s, BRASS, M_BR, { y0: -0.22 * s });
      put(b, 0, 0.22 * s, 0, () => {
        cylinder(b, 10, 0.092, 0.108, 0.15 * s, GOLD, M_GD, { y0: 0 });
        put(b, 0, 0.15 * s, 0, () => annulusXZ(b, 0, 0, 0, 0.108, 0, 10, GLASS_ICE, M_GL, 1));
        put(b, 0, 0.15 * s, 0, () => torus(b, 0.104, 0.014, 12, 2, GOLD_B, M_GDB, 'y'));
      });
      put(b, 0, -0.23 * s, 0, () => cylinder(b, 7, 0.040, 0.032, 0.10 * s, BRASS_D, M_BR, { y0: -0.10 * s }));
      for (const sy of [-0.12, 0.0]) put(b, 0, sy * s, 0, () => torus(b, 0.080, 0.014, 10, 2, GOLD_B, M_GDB, 'y'));
      b.pop(); b.pop();
    });
  });
}

// ---------------------------------------------------------------- armchair (~200 tri) + side table (~260)
function armchair(b) {
  const sy = 0.40;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    put(b, sx * 0.24, 0, sz * 0.22, () => lathe(b, [[0.001, 0], [0.042, 0.008], [0.030, 0.14], [0.038, sy]], 5, BRASS, M_BR));
  }
  put(b, 0, sy - 0.05, 0, () => box(b, 0.64, 0.07, 0.60, WOOD, M_WD));
  put(b, 0, sy, 0, () => box(b, 0.60, 0.085, 0.56, CLOTH, M_CLS));
  put(b, 0, sy + 0.26, -0.26, () => { b.push(RX(0.14)); box(b, 0.58, 0.50, 0.095, CLOTH, M_CLS); b.pop(); });
  for (const sx of [-1, 1]) {
    bar3(b, [sx * 0.30, sy + 0.19, 0.24], [sx * 0.30, sy + 0.19, -0.26], 0.042, 0.055, CLOTH, M_CLS);
    bar3(b, [sx * 0.30, sy - 0.02, 0.16], [sx * 0.30, sy + 0.17, 0.16], 0.026, 0.026, BRASS, M_BR);
  }
}
function sideTable(b) {
  cylinder(b, 12, 0.32, 0.32, 0.032, WOOD_L, M_WD, { y0: 0.49 });
  put(b, 0, 0.522, 0, () => torus(b, 0.325, 0.018, 12, 2, GOLD, M_GD, 'y'));
  put(b, 0, 0.24, 0, () => lathe(b, [[0.14, 0], [0.09, 0.04], [0.045, 0.22], [0.045, 0.49]], 7, BRASS, M_BR));
  put(b, 0, 0.02, 0, () => cylinder(b, 10, 0.20, 0.22, 0.030, BRASS_D, M_BR, { y0: 0 }));
  // compass on the top
  put(b, -0.09, 0.523, 0.02, () => {
    torus(b, 0.080, 0.015, 10, 2, GOLD_B, M_GDB, 'y');
    put(b, 0, 0.005, 0, () => annulusXZ(b, 0, 0, 0, 0.072, 0, 10, IVORY_W, M_PP, 1));
    put(b, 0, 0.010, 0, () => { b.push(RZ(0.7)); bar3(b, [-0.056, 0, 0], [0.056, 0, 0], 0.012, 0.005, INK, M_IR); b.pop(); });
  });
  // tea cup
  put(b, 0.09, 0.523, -0.02, () => {
    cylinder(b, 8, 0.070, 0.070, 0.010, IVORY_W, M_MB, { y0: 0 });
    lathe(b, [[0.001, 0.010], [0.028, 0.014], [0.036, 0.048], [0.038, 0.086]], 7, IVORY_W, M_MB);
    put(b, 0, 0.062, 0, () => annulusXZ(b, 0, 0, 0, 0.030, 0, 7, mulc(rgb('#8a5a30'), 0.8), [0.12, 0.4], 1));
  });
}

// ---------------------------------------------------------------- tapestry (~420 tri)
function tapestry(b, w, drop, seed) {
  const rnd = mulberry32(seed);
  const nu = 5, nv = 6;
  bar3(b, [-w / 2 - 0.10, 0, 0.03], [w / 2 + 0.10, 0, 0.03], 0.055, 0.045, BRASS, M_BR);
  for (const sx of [-1, 1]) put(b, sx * (w / 2 + 0.11), 0, 0.03, () => sphere(b, 0.058, GOLD_B, M_GDB, { rings: 2, seg: 5, jitter: 0.05 }));
  const P = (i, j) => {
    const u = i / nu, v = j / nv;
    return [-w / 2 + w * u, -drop * v, 0.02 + 0.03 * Math.sin(u * Math.PI * 4.0) * (0.4 + 0.6 * v)];
  };
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const p00 = P(i, j), p10 = P(i + 1, j), p11 = P(i + 1, j + 1), p01 = P(i, j + 1);
      b.quad(p00, p10, p11, p01, mulc(CLOTH, (j % 2 ? 0.78 : 1.0) * ((i + j) % 3 === 0 ? 1.26 : 1.0)), M_CLS, [0, 0, 1]);
    }
  }
  for (const sx of [-1, 1]) {
    for (let j = 0; j < nv; j++) {
      const a = P(sx > 0 ? nu : 0, j), c2 = P(sx > 0 ? nu : 0, j + 1);
      const x0 = sx * w / 2 - sx * 0.10;
      b.quad([x0, a[1], a[2] + 0.005], [x0 + sx * 0.10, a[1], a[2] + 0.005],
        [x0 + sx * 0.10, c2[1], c2[2] + 0.005], [x0, c2[1], c2[2] + 0.005], GOLD, M_GD, [0, 0, 1]);
    }
  }
  for (let k = 0; k < 7; k++) {
    const x = -w / 2 + 0.10 + (k * (w - 0.20)) / 6;
    bar3(b, [x, -drop, 0.03], [x + (rnd() - 0.5) * 0.04, -drop - 0.20, 0.03], 0.012, 0.012, GOLD_B, M_GDB);
  }
  put(b, 0, -drop * 0.36, 0.050, () => {
    torus(b, 0.30, 0.024, 12, 2, GOLD, M_GD, 'z');
    sphere(b, 0.17, CLOUD_B, M_CLD, { rings: 2, seg: 5, jitter: 0.28, seed: seed + 1 });
  });
}

// ---------------------------------------------------------------- loom (~320 tri)
function loom(b) {
  const W = 1.5, H = 2.1;
  for (const sx of [-1, 1]) {
    bar3(b, [sx * W / 2, 0, 0], [sx * W / 2, H, 0], 0.070, 0.070, WOOD_D, M_WD);
    bar3(b, [sx * W / 2, 0, -0.38], [sx * W / 2, 0.85, -0.38], 0.055, 0.055, WOOD, M_WD);
    put(b, sx * W / 2, 0, 0, () => box(b, 0.18, 0.06, 0.72, WOOD_D, M_WD));
  }
  for (const yy of [0.30, H - 0.10]) bar3(b, [-W / 2, yy, 0], [W / 2, yy, 0], 0.070, 0.070, WOOD, M_WD);
  bar3(b, [-W / 2 - 0.05, 0.86, 0.09], [W / 2 + 0.05, 0.86, 0.09], 0.070, 0.070, BRASS_D, M_BR);
  for (let k = 0; k < 20; k++) {
    const x = -W / 2 + 0.08 + (k * (W - 0.16)) / 19;
    bar3(b, [x, H - 0.12, 0], [x, 0.84, 0], 0.007, 0.007, IVORY_W, M_PP);
  }
  for (let j = 0; j < 5; j++) {
    const y0 = 0.88 - j * 0.10, y1 = y0 - 0.10;
    b.quad([-W / 2 + 0.06, y0, 0.012], [W / 2 - 0.06, y0, 0.012], [W / 2 - 0.06, y1, 0.012], [-W / 2 + 0.06, y1, 0.012],
      mulc(CLOTH, j % 2 ? 0.9 : 1.12), M_CLS, [0, 0, 1]);
  }
  put(b, 0.2, 0.86, 0.20, () => { b.push(RY(0.4)); box(b, 0.40, 0.045, 0.085, WOOD_L, M_WD); b.pop(); });
  put(b, -0.35, 0.90, 0.15, () => cylinder(b, 7, 0.070, 0.070, 0.20, CLOTH_R, M_CLS, { y0: 0 }));
}

// ---------------------------------------------------------------- bookcase (3 tiers, 36 spines, ~600 tri)
function bookcase(b, w, h, seed) {
  const rnd = mulberry32(seed);
  const d = 0.34;
  put(b, 0, 0.055, 0, () => box(b, w + 0.10, 0.11, d + 0.08, WOOD, M_WD));
  put(b, 0, 0.095, 0, () => box(b, w + 0.15, 0.045, d + 0.11, GOLD, M_GD));
  for (const sx of [-1, 1]) put(b, sx * (w / 2 + 0.025), h / 2, 0, () => box(b, 0.065, h, d + 0.03, WOOD_L, M_WD));
  put(b, 0, h, 0, () => box(b, w + 0.15, 0.08, d + 0.11, WOOD_L, M_WD));
  put(b, 0, h + 0.06, 0, () => box(b, w + 0.10, 0.045, d + 0.08, GOLD, M_GD));
  put(b, 0, h / 2, -d / 2 - 0.018, () => box(b, w + 0.05, h, 0.035, mulc(BLUE_D, 0.9), M_WD));
  // brass uprights on the two front corners (a readable library rhythm)
  for (const sx of [-1, 1]) bar3(b, [sx * (w / 2 + 0.03), 0.11, d / 2 + 0.03], [sx * (w / 2 + 0.03), h, d / 2 + 0.03], 0.030, 0.030, BRASS, M_BR);
  const tiers = 3, th = (h - 0.22) / tiers;
  for (let t = 0; t < tiers; t++) {
    const y = 0.11 + t * th;
    put(b, 0, y, 0, () => box(b, w, 0.040, d, WOOD_L, M_WD));
    // 11 spines spread across the whole shelf (33 per case, as the brief asks)
    const nSp = 11, slot = (w - 0.16) / nSp;
    for (let k = 0; k < nSp; k++) {
      const bw = slot * (0.72 + rnd() * 0.20);
      const bh = 0.24 + rnd() * 0.15;   // real book height, not shelf height
      const col = [BLUE, BLUE_D, CLOTH_R, WOOD, INK, CLOTH, GOLD_D][(k + t * 2) % 7];
      const x = -w / 2 + 0.08 + slot * (k + 0.5);
      put(b, x, y + 0.020, 0.03 - rnd() * 0.04, () => {
        b.push(RZ((rnd() - 0.5) * 0.14));
        box(b, bw, bh, 0.20 + rnd() * 0.04, mulc(col, 0.95 + rnd() * 0.30), t % 2 ? M_CLS : M_WD);
        if (k % 3 === 0) put(b, 0, bh / 2 - 0.03, 0, () => box(b, bw * 0.82, 0.012, 0.012, GOLD_B, M_GDB));
        b.pop();
      });
    }
    put(b, w * 0.24, y + 0.065, 0.06, () => { b.push(RY(0.3)); box(b, 0.24, 0.038, 0.16, CLOTH_R, M_CLS); b.pop(); });
  }
}

// ---------------------------------------------------------------- reading table + chair (~520 / 180)
function readingTable(b, yDeck, ctx) {
  const w = 3.0, d = 1.05, h = 0.78;
  put(b, 0, h - 0.04, 0, () => box(b, w, 0.075, d, WOOD_L, M_WD));
  put(b, 0, h - 0.095, 0, () => box(b, w - 0.10, 0.060, d - 0.10, GOLD, M_GD));
  put(b, 0, h - 0.19, 0, () => box(b, w - 0.42, 0.12, d - 0.32, mulc(WOOD_D, 0.9), M_WD));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    put(b, sx * (w / 2 - 0.24), 0, sz * (d / 2 - 0.16), () => lathe(b,
      [[0.001, 0], [0.082, 0.012], [0.050, 0.40], [0.072, 0.50], [0.048, h - 0.15]], 6, BRASS, M_BR));
  }
  for (const [bx, bz, yaw] of [[-0.9, 0.05, 0.2], [-0.05, -0.14, -0.3], [0.72, 0.10, 0.5]]) {
    put(b, bx, h + 0.001, bz, () => {
      b.push(RY(yaw));
      box(b, 0.42, 0.020, 0.29, PAPER, M_PP);
      put(b, 0, 0.018, 0, () => { b.push(RX(0.06)); box(b, 0.37, 0.014, 0.25, IVORY_W, M_PP); b.pop(); });
      put(b, 0, 0.036, -0.02, () => { b.push(RX(-0.06)); box(b, 0.37, 0.014, 0.25, IVORY_W, M_PP); b.pop(); });
      for (let k = 0; k < 3; k++) put(b, -0.13 + k * 0.11, 0.040, 0, () => box(b, 0.052, 0.003, 0.005, INK, M_IR));
      b.pop();
    });
  }
  put(b, 1.12, h + 0.025, 0.05, () => {
    for (let k = 0; k < 3; k++) { b.push(RY(0.1 * k)); put(b, 0, k * 0.032, 0, () => box(b, 0.34, 0.030, 0.25, [CLOTH_R, BLUE_D, CLOTH][k], M_CLS)); b.pop(); }
  });
  put(b, 0.34, h + 0.018, 0.20, () => {
    lathe(b, [[0.001, 0], [0.050, 0.010], [0.045, 0.055], [0.026, 0.070]], 7, INK, M_IR);
    put(b, 0, 0.070, 0, () => cylinder(b, 5, 0.008, 0.006, 0.14, PAPER, M_PP, { y0: 0 }));
  });
  // two candlestick lamps on the table
  for (const sx of [-1, 1]) {
    put(b, sx * 1.26, h, 0.01, () => {
      lathe(b, [[0.001, 0], [0.095, 0.008], [0.075, 0.03], [0.040, 0.12], [0.070, 0.20], [0.040, 0.30], [0.032, 0.40]],
        7, GOLD, M_GD);
      put(b, 0, 0.40, 0, () => lathe(b, [[0.26, 0.02], [0.20, 0.08], [0.11, 0.19], [0.04, 0.25]], 8, mulc(rgb('#f6e2b4'), 1.12), [0.14, 0.30]));
    });
    glow(ctx, -Math.sin(0) * 0 + sx * 1.26, yDeck + h + 0.55, 0.01, 0.30, '#ffe0ae', 0.74);
  }
}
function chair(b) {
  const sy = 0.44;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    put(b, sx * 0.19, 0, sz * 0.18, () => lathe(b, [[0.001, 0], [0.032, 0.008], [0.024, 0.10], [0.030, sy]], 5, BRASS, M_BR));
  }
  put(b, 0, sy, 0, () => box(b, 0.46, 0.055, 0.44, CLOTH, M_CLS));
  put(b, 0, sy - 0.035, 0, () => box(b, 0.50, 0.035, 0.48, WOOD, M_WD));
  put(b, 0, sy + 0.25, -0.20, () => { b.push(RX(0.12)); box(b, 0.42, 0.42, 0.055, CLOTH, M_CLS); b.pop(); });
  for (const sx of [-1, 1]) bar3(b, [sx * 0.20, sy - 0.02, -0.18], [sx * 0.21, sy + 0.44, -0.235], 0.026, 0.026, BRASS, M_BR);
}

// ---------------------------------------------------------------- armillary sphere (~700 tri)
function armillary(b) {
  put(b, 0, 0.085, 0, () => box(b, 0.84, 0.17, 0.84, STONE, M_MB));
  put(b, 0, 0.19, 0, () => box(b, 0.92, 0.045, 0.92, GOLD, M_GD));
  put(b, 0, 0.52, 0, () => lathe(b, [[0.28, 0], [0.24, 0.04], [0.13, 0.20], [0.10, 0.42], [0.15, 0.52], [0.09, 0.62]], 9, BRASS, M_BR));
  const cy = 1.55, R = 1.18;
  put(b, 0, cy, 0, () => {
    torus(b, R, 0.042, 18, 3, GOLD, M_GD, 'y');
    put(b, 0, 0, 0, () => { b.push(RX(Math.PI / 2)); torus(b, R, 0.040, 18, 3, BRASS, M_BR, 'y'); b.pop(); });
    put(b, 0, 0, 0, () => { b.push(RX(Math.PI / 2)); b.push(RY(Math.PI / 2)); torus(b, R, 0.040, 18, 3, BRASS, M_BR, 'y'); b.pop(); b.pop(); });
    put(b, 0, 0, 0, () => { b.push(RX(1.20)); torus(b, R * 0.92, 0.030, 16, 3, GOLD_B, M_GDB, 'y'); b.pop(); });
    put(b, 0, 0, 0, () => {
      b.push(RZ(0.42)); bar3(b, [0, -R * 1.16, 0], [0, R * 1.16, 0], 0.030, 0.030, GOLD_B, M_GDB);
      put(b, 0, R * 1.14, 0, () => sphere(b, 0.095, GOLD_B, M_GDB, { rings: 2, seg: 5, jitter: 0.05 }));
      b.pop();
    });
    put(b, 0, 0, 0, () => sphere(b, 0.145, BLUE_D, M_MB, { rings: 3, seg: 6, jitter: 0.12, seed: 4 }));
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU;
      put(b, Math.cos(a) * R, 0, Math.sin(a) * R, () => sphere(b, 0.032, GOLD_B, M_GDB, { rings: 2, seg: 4, jitter: 0.05 }));
    }
  });
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU + 0.4;
    tubePath(b, [[Math.cos(a) * 0.13, 0.62, Math.sin(a) * 0.13],
      [Math.cos(a) * 0.48, 1.04, Math.sin(a) * 0.48],
      [Math.cos(a) * R * 0.84, 1.22, Math.sin(a) * R * 0.84]], 0.030, 3, BRASS, M_BR);
  }
}

// ---------------------------------------------------------------- astrolabe pillar (~540 tri)
function astrolabe(b, seed) {
  put(b, 0, 0.055, 0, () => box(b, 0.70, 0.11, 0.70, STONE, M_MB));
  put(b, 0, 0.125, 0, () => box(b, 0.78, 0.035, 0.78, GOLD, M_GD));
  put(b, 0, 0.52, 0, () => lathe(b, [[0.23, 0], [0.19, 0.05], [0.095, 0.20], [0.080, 0.56], [0.14, 0.68], [0.10, 0.80]], 8, STONE_D, M_ST));
  put(b, 0, 0.82, 0, () => torus(b, 0.19, 0.028, 10, 2, GOLD, M_GD, 'y'));
  put(b, 0, 0.86, 0, () => {
    b.push(RX(-0.42));
    put(b, 0, 0.28, 0, () => {
      cylinder(b, 14, 0.45, 0.45, 0.032, BRASS, M_BR, { y0: 0 });
      put(b, 0, 0.032, 0, () => annulusXZ(b, 0, 0, 0, 0.43, 0, 14, mulc(BLUE_D, 1.25), M_MB, 1));
      put(b, 0, 0.037, 0, () => annulusXZ(b, 0, 0, 0.35, 0.43, 0, 14, GOLD_B, M_GDB, 1));
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * TAU;
        put(b, Math.cos(a) * 0.32, 0.039, Math.sin(a) * 0.32, () => { b.push(RY(-a)); box(b, 0.016, 0.005, k % 3 ? 0.045 : 0.085, GOLD_B, M_GDB); b.pop(); });
      }
      put(b, 0, 0.050, 0, () => torus(b, 0.29, 0.020, 14, 2, GOLD, M_GD, 'y'));
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * TAU + 0.3;
        tubePath(b, [[0, 0.050, 0], [Math.cos(a) * 0.15, 0.055, Math.sin(a) * 0.15], [Math.cos(a) * 0.30, 0.050, Math.sin(a) * 0.30]],
          0.011, 2, GOLD_B, M_GDB, { caps: false });
      }
      put(b, 0, 0.062, 0, () => { b.push(RY(0.9)); bar3(b, [-0.38, 0, 0], [0.38, 0, 0], 0.026, 0.010, BRASS_D, M_BR); b.pop(); });
    });
    b.pop();
  });
  void seed;
}

// ---------------------------------------------------------------- round tea table (~640) + pot plant (~250)
function teaTable(b) {
  const r = 0.68, h = 0.74;
  cylinder(b, 14, r, r, 0.050, IVORY_W, M_MB, { y0: h - 0.050 });
  put(b, 0, h - 0.050, 0, () => torus(b, r - 0.005, 0.020, 14, 2, GOLD, M_GD, 'y'));
  put(b, 0, h / 2 - 0.06, 0, () => lathe(b, [[0.22, 0], [0.15, 0.05], [0.070, 0.24], [0.065, h - 0.30], [0.15, h - 0.10], [0.09, h - 0.05]], 8, BRASS, M_BR));
  put(b, 0, 0.028, 0, () => cylinder(b, 12, 0.32, 0.28, 0.055, BRASS_D, M_BR, { y0: 0 }));
  // teapot
  put(b, 0.15, h, 0.10, () => {
    lathe(b, [[0.002, 0], [0.100, 0.008], [0.140, 0.055], [0.150, 0.135], [0.110, 0.215], [0.070, 0.240]], 8, IVORY_W, M_MB);
    put(b, 0, 0.240, 0, () => cylinder(b, 6, 0.050, 0.040, 0.026, GOLD, M_GD, { y0: 0 }));
    put(b, 0.125, 0.150, 0, () => { b.push(RZ(-1.2)); bar3(b, [0, 0, 0], [0.115, 0.045, 0], 0.028, 0.028, IVORY_W, M_MB); b.pop(); });
    put(b, -0.125, 0.150, 0, () => torus(b, 0.055, 0.018, 7, 2, IVORY_W, M_MB, 'z'));
  });
  for (const [cx, cz] of [[-0.30, 0.24], [-0.28, -0.26]]) {
    put(b, cx, h, cz, () => {
      cylinder(b, 9, 0.080, 0.080, 0.010, IVORY_W, M_MB, { y0: 0 });
      lathe(b, [[0.001, 0.010], [0.032, 0.014], [0.040, 0.052], [0.042, 0.090]], 7, IVORY_W, M_MB);
      put(b, 0, 0.068, 0, () => annulusXZ(b, 0, 0, 0, 0.034, 0, 7, mulc(rgb('#8a5a30'), 0.85), [0.12, 0.4], 1));
    });
  }
  // tiered cake stand
  put(b, -0.02, h, -0.02, () => {
    cylinder(b, 10, 0.095, 0.095, 0.010, GOLD_B, M_GDB, { y0: 0 });
    cylinder(b, 5, 0.022, 0.022, 0.21, GOLD, M_GD, { y0: 0 });
    put(b, 0, 0.21, 0, () => {
      cylinder(b, 12, 0.145, 0.145, 0.010, GOLD_B, M_GDB, { y0: 0 });
      for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU; put(b, Math.cos(a) * 0.085, 0.010, Math.sin(a) * 0.085, () => sphere(b, 0.038, k % 2 ? CLOTH_R : IVORY_W, k % 2 ? M_CLS : M_MB, { rings: 2, seg: 4, jitter: 0.2, seed: 3 + k })); }
    });
    put(b, 0, 0.115, 0, () => {
      cylinder(b, 10, 0.115, 0.115, 0.009, GOLD_B, M_GDB, { y0: 0 });
      for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU + 0.6; put(b, Math.cos(a) * 0.065, 0.009, Math.sin(a) * 0.065, () => sphere(b, 0.032, BLUE_L, M_MB, { rings: 2, seg: 4, jitter: 0.2, seed: 9 + k })); }
    });
  });
}
function plantPot(b, kind) {
  lathe(b, [[0.001, 0], [0.28, 0.012], [0.31, 0.085], [0.34, 0.34], [0.305, 0.40], [0.26, 0.395]], 8, STONE, M_ST);
  put(b, 0, 0.38, 0, () => annulusXZ(b, 0, 0, 0, 0.28, 0, 8, mulc(WOOD_D, 0.85), M_WD, 1));
  if (kind === 'fern') {
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU + 0.3;
      tubePath(b, [[0, 0.40, 0], [Math.cos(a) * 0.13, 0.50, Math.sin(a) * 0.13], [Math.cos(a) * 0.25, 0.56, Math.sin(a) * 0.25]],
        [0.030, 0.026, 0.010], 3, k % 2 ? LEAF : LEAF_D, M_LF);
    }
    put(b, 0, 0.50, 0, () => sphere(b, 0.11, LEAF_D, M_LF, { rings: 2, seg: 5, jitter: 0.25, seed: 21 }));
  } else {
    put(b, 0, 0.58, 0, () => {
      sphere(b, 0.22, LEAF, M_LF, { rings: 3, seg: 5, jitter: 0.25, seed: 7 });
      put(b, 0.11, 0.06, 0.02, () => sphere(b, 0.145, LEAF_D, M_LF, { rings: 2, seg: 5, jitter: 0.25, seed: 11 }));
      put(b, -0.09, 0.02, -0.06, () => sphere(b, 0.125, LEAF_L, M_LF, { rings: 2, seg: 5, jitter: 0.25, seed: 13 }));
    });
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU + 0.8;
      put(b, Math.cos(a) * 0.17, 0.60 + (k % 2) * 0.07, Math.sin(a) * 0.17, () => sphere(b, 0.040, BLUE_L, M_CLS, { rings: 2, seg: 4, jitter: 0.15 }));
    }
  }
}

// ---------------------------------------------------------------- the whale-song bell (~540 tri)
function whaleBell(b, yTop) {
  const H = 2.05;
  bar3(b, [-1.05, yTop, 0], [1.05, yTop, 0], 0.22, 0.19, WOOD_D, M_WD);
  for (const sx of [-1, 1]) bar3(b, [sx * 0.92, yTop, 0], [sx * 0.92, yTop - 0.52, 0], 0.15, 0.15, WOOD, M_WD);
  put(b, 0, yTop - 0.02, 0, () => sphere(b, 0.09, GOLD, M_GD, { rings: 2, seg: 5, jitter: 0.05 }));
  tubePath(b, [[0, yTop - 0.06, 0], [0.03, yTop - 0.60, 0.02], [0, yTop - 1.20, 0], [-0.02, yTop - 1.40, 0]],
    0.026, 3, mulc(PAPER, 0.8), M_PP, { caps: false });
  const by = yTop - H;
  put(b, 0, by, 0, () => {
    torus(b, 0.095, 0.028, 8, 2, BRASS, M_BR, 'y');
    lathe(b, [[0.050, -0.05], [0.095, -0.10], [0.19, -0.18], [0.32, -0.34], [0.48, -0.62], [0.60, -0.92], [0.68, -1.10], [0.74, -1.18], [0.70, -1.22], [0.58, -1.20], [0.48, -1.14], [0.40, -1.02]],
      14, BRASS, M_BR);
    put(b, 0, -1.16, 0, () => torus(b, 0.72, 0.030, 16, 2, GOLD, M_GD, 'y'));
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU + 0.4;
      put(b, Math.cos(a) * 0.50, -0.72, Math.sin(a) * 0.50, () => { b.push(RY(-a)); box(b, 0.030, 0.70, 0.022, GOLD_B, M_GDB); b.pop(); });
    }
    put(b, 0, -0.55, 0, () => { bar3(b, [0, 0, 0], [0, -0.40, 0], 0.040, 0.040, GOLD_D, M_GD); put(b, 0, -0.44, 0, () => sphere(b, 0.115, GOLD, M_GD, { rings: 2, seg: 5, jitter: 0.1 })); });
    tubePath(b, [[0, -0.60, 0], [0.04, -1.00, 0.02], [0, -1.34, 0], [-0.04, -1.58, 0]], 0.020, 3, mulc(PAPER, 0.78), M_PP, { caps: false });
  });
  put(b, 0.92, by + 0.60, 0.0, () => {
    torus(b, 0.085, 0.022, 7, 2, BRASS_D, M_BR, 'y');
    tubePath(b, [[0, 0, 0], [0.32, -0.26, 0], [0.50, -0.58, 0]], 0.026, 3, BRASS_D, M_BR);
    put(b, 0.51, -0.60, 0, () => sphere(b, 0.095, BRASS, M_BR, { rings: 2, seg: 5, jitter: 0.08 }));
  });
}

// ---------------------------------------------------------------- whale-bone relief panel (~330 tri)
function reliefPanel(b, w, h, seed) {
  put(b, 0, 0, -0.032, () => box(b, w + 0.14, h + 0.14, 0.055, WOOD_D, M_WD));
  put(b, 0, 0, 0, () => box(b, w, h, 0.040, mulc(WOOD, 0.85), M_WD));
  faceXY(b, -w / 2 + 0.04, -h / 2 + 0.04, w / 2 - 0.04, h / 2 - 0.04, 0.022, mulc(IVORY, 0.92), M_PP, 1);
  put(b, 0, 0.10, 0.028, () => {
    ellipsoid(b, 0.60, 0.19, 0.05, 10, 3, mulc(INK, 1.5), M_IR);
    put(b, 0.60, 0.03, 0, () => { b.push(RZ(-0.5)); box(b, 0.32, 0.045, 0.035, mulc(INK, 1.5), M_IR); b.pop(); });
    put(b, -0.58, 0.02, 0, () => { b.push(RZ(0.55)); box(b, 0.28, 0.28, 0.035, mulc(INK, 1.5), M_IR); b.pop(); });
  });
  for (let k = 0; k < 6; k++) {
    const a = -0.72 + (k / 5) * 1.44;
    const pts = [];
    for (let j = 0; j <= 3; j++) {
      const t = j / 3;
      pts.push([Math.sin(a) * t * (w * 0.40), -h * 0.42 + t * h * 0.72 + Math.sin(t * 2.4) * 0.05, 0.030]);
    }
    tubePath(b, pts, [0.018, 0.024, 0.022, 0.010], 3, mulc(IVORY, 1.05), M_PP);
  }
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    put(b, sx * w / 2, sy * h / 2, 0.010, () => box(b, 0.14, 0.14, 0.018, GOLD, M_GD));
  }
  void seed;
}

// ---------------------------------------------------------------- gold-framed placard (~110 tri)
function placard(b, w, h, seed) {
  put(b, 0, 0, -0.026, () => box(b, w + 0.10, h + 0.10, 0.045, GOLD, M_GD));
  put(b, 0, 0, 0.002, () => box(b, w, h, 0.030, BLUE_D, M_MBD));
  faceXY(b, -w / 2 + 0.05, -h / 2 + 0.05, w / 2 - 0.05, h / 2 - 0.05, 0.020, mulc(BLUE_D, 1.45), M_MB, 1);
  const rnd = mulberry32(seed);
  for (let k = 0; k < 4; k++) {
    const yy = h / 2 - 0.22 - k * 0.19;
    put(b, -w / 2 + 0.16, yy, 0.026, () => box(b, w * (0.32 + rnd() * 0.42), 0.020, 0.005, GOLD_B, M_GDB));
  }
  put(b, w * 0.26, 0.0, 0.028, () => {
    lathe(b, [[0.001, -0.17], [0.055, -0.16], [0.065, -0.06], [0.046, 0.05], [0.024, 0.11], [0.022, 0.16]], 7, GOLD_B, M_GDB);
    put(b, 0, 0.16, 0, () => cylinder(b, 5, 0.028, 0.024, 0.026, GOLD, M_GD, { y0: 0 }));
  });
}

// ================================================================ A · the entrance hall (y 7.0)
// Everything on the floor stays below y 8.12: the fly cavity r 6.0..16.4 / y 8.2..18.6 is empty.
function hallFloorInlay(b) {
  const y = GY;
  // three-layer ring parquet around the well (deep blue / gold / white marble)
  annulusXZ(b, 0, 0, 3.46, 4.12, y + 0.018, 48, mulc(BLUE_D, 1.05), [0.075, 0.26], 1);
  annulusXZ(b, 0, 0, 4.12, 4.20, y + 0.030, 48, GOLD, M_GD, 1);
  annulusXZ(b, 0, 0, 4.20, 4.96, y + 0.026, 48, MARBLE, M_MB, 1);
  annulusXZ(b, 0, 0, 4.96, 5.04, y + 0.038, 48, GOLD, M_GD, 1);
  annulusXZ(b, 0, 0, 5.04, 5.88, y + 0.034, 48, mulc(BLUE, 0.92), [0.085, 0.24], 1);
  annulusXZ(b, 0, 0, 5.88, 5.96, y + 0.046, 48, GOLD, M_GD, 1);
  annulusXZ(b, 0, 0, 5.96, 6.44, y + 0.042, 48, MARBLE_D, M_MBD, 1);
  annulusXZ(b, 0, 0, 6.44, 6.52, y + 0.054, 48, GOLD, M_GD, 1);
  // radial gold rays across the marble field
  for (let k = 0; k < 18; k++) {
    const a0 = (k / 18) * TAU, a1 = a0 + 0.040;
    polarQuad(b, 4.22, 4.94, a0, a1, y + 0.034, GOLD_B, M_GDB, 1);
  }
  // dark blue tablets in the outer white ring
  for (let k = 0; k < 24; k++) {
    const a0 = (k / 24) * TAU + 0.02, a1 = a0 + 0.082;
    polarQuad(b, 6.02, 6.38, a0, a1, y + 0.050, BLUE_D, [0.075, 0.26], 1);
  }
  // gold studs on the blue field
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * TAU + 0.11;
    put(b, Math.cos(a) * 5.46, y + 0.036, Math.sin(a) * 5.46, () => cylinder(b, 5, 0.052, 0.042, 0.010, GOLD_B, M_GDB, { y0: 0 }));
  }
  // gold cloud-spiral inlays in the innermost blue ring
  for (let k = 0; k < 12; k++) {
    const a0 = (k / 12) * TAU, a1 = a0 + 0.20;
    polarQuad(b, 3.60, 3.92, a0, a1, y + 0.028, GOLD_B, M_GDB, 1);
  }
}

function hallCloudVases(b, ctx) {
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const x = Math.cos(a) * 4.62, z = Math.sin(a) * 4.62;
    put(b, x, GY, z, () => {
      lathe(b, [[0.001, 0], [0.29, 0.014], [0.29, 0.050], [0.15, 0.10], [0.105, 0.16]], 8, BRASS, M_BR);
      lathe(b, [[0.105, 0.16], [0.066, 0.26], [0.058, 0.50], [0.098, 0.56], [0.066, 0.62], [0.062, 0.82]], 7, BRASS_D, M_BR);
      lathe(b, [[0.062, 0.82], [0.180, 0.90], [0.268, 1.02], [0.248, 1.13], [0.170, 1.24], [0.145, 1.31], [0.210, 1.37], [0.190, 1.41]],
        9, BRASS, M_BR);
      put(b, 0, 1.41, 0, () => torus(b, 0.190, 0.024, 10, 2, GOLD_B, M_GDB, 'y'));
      put(b, 0, 1.400, 0, () => {
        sphere(b, 0.180, CLOUD, M_CLD, { rings: 3, seg: 5, jitter: 0.30, seed: 5 + i });
        put(b, 0.100, 0.085, 0.030, () => sphere(b, 0.082, CLOUD, M_CLD, { rings: 2, seg: 4, jitter: 0.30, seed: 17 + i }));
        put(b, -0.085, 0.120, -0.030, () => sphere(b, 0.060, CLOUD_B, M_CLD, { rings: 2, seg: 4, jitter: 0.30, seed: 23 + i }));
      });
    });
    glow(ctx, x, GY + 1.42, z, 0.38, '#ffe2ae', 0.78);
  }
}

function hallRegistrationDesk(b, ctx) {
  // at +X, r 11.0 — the visitor's desk faces the well
  const a = 0.0, r = 11.0;
  putRing(b, GY, a, r, yawIn(a), () => {
    const w = 2.2, d = 0.78, h = 0.80;
    put(b, 0, h - 0.10, 0, () => box(b, w - 0.06, 0.20, d - 0.06, WOOD, M_WD));
    put(b, 0, h, 0, () => box(b, w, 0.075, d, WOOD_L, M_WD));
    put(b, 0, h + 0.044, 0, () => box(b, w - 0.30, 0.007, d - 0.26, mulc(WOOD_D, 0.78), M_WD));
    for (const sz of [-1, 1]) put(b, 0, h, sz * (d / 2 - 0.015), () => box(b, w + 0.04, 0.052, 0.032, GOLD, M_GD));
    for (const sx of [-1, 1]) put(b, sx * (w / 2 - 0.015), h, 0, () => box(b, 0.032, 0.052, d + 0.02, GOLD, M_GD));
    // panelled front with brass beading
    put(b, 0, 0.46, -d / 2 + 0.005, () => box(b, w - 0.14, 0.62, 0.032, mulc(WOOD_D, 1.06), M_WD));
    for (const sx of [-1, 1]) put(b, sx * 0.56, 0.46, -d / 2 + 0.026, () => box(b, 0.60, 0.48, 0.010, WOOD, M_WD));
    for (const sx of [-1, 1]) for (const sy of [0.23, 0.69]) put(b, sx * 0.56, sy, -d / 2 + 0.033, () => box(b, 0.62, 0.018, 0.008, GOLD_B, M_GDB));
    for (const sx of [-1, 1]) put(b, sx * (w / 2 - 0.10), 0.16, 0, () => box(b, 0.15, 0.32, d - 0.10, WOOD_D, M_WD));
    // open register
    put(b, -0.34, h + 0.046, 0.06, () => {
      b.push(RY(0.06));
      box(b, 0.56, 0.028, 0.40, mulc(WOOD_D, 0.9), M_WD);
      put(b, 0, 0.018, 0, () => { b.push(RZ(0.02)); box(b, 0.27, 0.018, 0.36, PAPER, M_PP); b.pop(); });
      put(b, 0.28, 0.018, 0, () => { b.push(RZ(-0.02)); box(b, 0.27, 0.018, 0.36, PAPER, M_PP); b.pop(); });
      for (let k = 0; k < 4; k++) {
        put(b, -0.13, 0.028, 0.12 - k * 0.06, () => box(b, 0.17, 0.003, 0.005, INK, M_IR));
        put(b, 0.14, 0.028, 0.12 - k * 0.06, () => box(b, 0.15, 0.003, 0.005, INK, M_IR));
      }
      put(b, 0, 0.030, 0.02, () => box(b, 0.010, 0.005, 0.28, CLOTH_R, M_CLS));
      b.pop();
    });
    // service bell
    put(b, 0.55, h + 0.046, -0.12, () => {
      cylinder(b, 10, 0.110, 0.110, 0.016, GOLD, M_GD, { y0: 0 });
      put(b, 0, 0.016, 0, () => lathe(b, [[0.100, 0], [0.094, 0.042], [0.070, 0.100], [0.028, 0.132], [0.011, 0.146]], 10, GOLD_B, M_GDB));
      put(b, 0, 0.146, 0, () => sphere(b, 0.028, GOLD, M_GD, { rings: 2, seg: 4, jitter: 0.05 }));
    });
    // inkwell + quill
    put(b, 0.20, h + 0.046, 0.14, () => {
      lathe(b, [[0.001, 0], [0.070, 0.010], [0.060, 0.050], [0.036, 0.070], [0.044, 0.088]], 7, BRASS_D, M_BR);
      put(b, 0, 0.088, 0, () => cylinder(b, 6, 0.030, 0.024, 0.018, INK, M_IR, { y0: 0 }));
      put(b, 0, 0.092, 0, () => { b.push(RZ(-0.5)); tubePath(b, [[0, 0, 0], [0.035, 0.075, 0.008], [0.020, 0.145, 0.014]], [0.010, 0.007, 0.003], 3, PAPER, M_PP); b.pop(); });
    });
    // stack of letter paper + a brass paper-knife
    put(b, 0.62, h + 0.046, 0.16, () => {
      for (let k = 0; k < 5; k++) { b.push(RY(0.05 * k)); box(b, 0.29, 0.011, 0.21, mulc(PAPER, 0.94 + k * 0.012), M_PP); b.pop(); }
      put(b, 0, 0.075, 0, () => { b.push(RY(0.4)); bar3(b, [-0.15, 0, 0], [0.15, 0, 0], 0.018, 0.005, GOLD_B, M_GDB); b.pop(); });
    });
    glow(ctx, 0.05, h + 0.30, 0.02, 0.30, '#ffe4b4', 0.7);
  });
}

function hallBenches(b) {
  for (const a of [0.0, Math.PI]) putRing(b, GY, a, 13.6, yawIn(a), () => bench(b, 2.9, 3));
}

function hallPlanters(b) {
  for (const a of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) {
    putRing(b, GY, a, 14.5, yawIn(a), () => planterTree(b, a > Math.PI ? 'palm' : 'orange', 0.92));
  }
}

function hallDisplayCases(b) {
  // two vitrines of sealed cloud bottles on the -Z side (clear of the stair turret at z -16.5)
  for (const a of [(252 / 180) * Math.PI, (288 / 180) * Math.PI]) {
    putRing(b, GY, a, 12.0, yawIn(a), () => displayCase(b, 5, 300 + ((a * 10) | 0), 0.46, 0.50, true));
  }
}

function hallWallArt(b, ctx) {
  // ---- two cloud maps on the glass wall, y 9.0..11.2 (wall band, above the fly cavity)
  for (const a of [(26 / 180) * Math.PI, (154 / 180) * Math.PI]) {
    putRing(b, 10.1, a, WALL, yawIn(a), () => cloudMap(b, 3.2, 2.2, 100 + ((a * 100) | 0)));
  }
  // ---- two long silk banners beside the portal (hang from y 18 down to y 9.6)
  for (const a of [(62 / 180) * Math.PI, (118 / 180) * Math.PI]) {
    putRing(b, 18.0, a, WALL, yawIn(a), () => wallBanner(b, 1.9, 8.4, mulc(BLUE_D, 1.1), mulc(CLOTH_R, 1.0), 200 + ((a * 100) | 0)));
  }
  // ---- a pair of brass wall sconces just inside the portal
  for (const a of [(72 / 180) * Math.PI, (108 / 180) * Math.PI]) {
    const y = GY + 2.45;
    wallSconce(b, Math.cos(a) * WALL, y, Math.sin(a) * WALL, Math.cos(a), Math.sin(a));
    glow(ctx, Math.cos(a) * (WALL - 0.16), y + 0.32, Math.sin(a) * (WALL - 0.16), 0.28, '#ffdca4', 0.82);
  }
  void ctx;
}

// ================================================================ B · the galleries
function g0Entrance(b, ctx, y) {
  // 2 benches + 2 stone planters + 4 wall sconces
  for (const a of [(35 / 180) * Math.PI, (215 / 180) * Math.PI]) putRing(b, y, a, 14.1, yawIn(a), () => bench(b, 2.0, 2, true));
  for (const a of [(150 / 180) * Math.PI, (330 / 180) * Math.PI]) putRing(b, y, a, 14.4, yawIn(a), () => planterTree(b, 'palm', 0.84));
  for (const a of [(20 / 180) * Math.PI, (110 / 180) * Math.PI, (200 / 180) * Math.PI, (290 / 180) * Math.PI]) {
    wallSconce(b, Math.cos(a) * WALL, y + 2.3, Math.sin(a) * WALL, Math.cos(a), Math.sin(a));
    glow(ctx, Math.cos(a) * (WALL - 0.16), y + 2.62, Math.sin(a) * (WALL - 0.16), 0.26, '#ffdca4', 0.8);
  }
}

function g1CloudMaps(b, ctx, y) {
  // 云图廊: 3 big cloud maps on the wall + 1 display case + 2 benches
  for (const a of [(20 / 180) * Math.PI, (140 / 180) * Math.PI, (230 / 180) * Math.PI]) {
    putRing(b, y + 1.55, a, WALL, yawIn(a), () => cloudMap(b, 3.0, 2.0, 400 + ((a * 100) | 0)));
  }
  putRing(b, y, (320 / 180) * Math.PI, 12.4, yawIn((320 / 180) * Math.PI), () => displayCase(b, 5, 420, 0.72, 0.52, true));
  for (const a of [(80 / 180) * Math.PI, (270 / 180) * Math.PI]) putRing(b, y, a, 13.9, yawIn(a), () => bench(b, 2.0, 2, true));
  void ctx;
}

function g2Chimes(b, y) {
  // 风铃廊: twelve brass wind chimes hung from the deck above + 2 benches + 1 flower urn
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + 0.13;
    const r = 12.0 + (i % 2) * 0.35;
    windChime(b, Math.cos(a) * r, Math.sin(a) * r, y + CW.GAL_T + 0.02, 1.55 + (i % 3) * 0.30, 700 + i);
  }
  for (const a of [(45 / 180) * Math.PI, (225 / 180) * Math.PI]) putRing(b, y, a, 14.2, yawIn(a), () => bench(b, 2.0, 2, true));
  putRing(b, y, (135 / 180) * Math.PI, 14.0, yawIn((135 / 180) * Math.PI), () => flowerUrn(b));
}

function g3Bottles(b, y) {
  // 云瓶陈列: 3 tall glass cases of cloud bottles + a gold-framed placard
  for (const a of [(30 / 180) * Math.PI, (150 / 180) * Math.PI, (270 / 180) * Math.PI]) {
    putRing(b, y, a, 13.4, yawIn(a), () => displayCase(b, 6, 500 + ((a * 50) | 0), 0.90, 0.92, false));
  }
  putRing(b, y + 1.55, (200 / 180) * Math.PI, WALL, yawIn((200 / 180) * Math.PI), () => placard(b, 1.6, 0.9, 770));
}

function g4Observatory(b, y) {
  // 观云台: 2 brass telescopes looking out + 2 armchair / side-table groups
  for (const a of [(60 / 180) * Math.PI, (240 / 180) * Math.PI]) putRing(b, y, a, 13.0, yawOut(a), () => telescope(b, false));
  for (const a of [(120 / 180) * Math.PI, (300 / 180) * Math.PI]) {
    putRing(b, y, a, 13.4, yawIn(a), () => armchair(b));
    const aa = a + 0.28;
    putRing(b, y, aa, 13.4, yawIn(aa), () => sideTable(b));
  }
}

function g5Weaving(b, y) {
  // 织云室: 2 tapestries on the wall + 2 benches + the warp/weft frame
  for (const a of [(40 / 180) * Math.PI, (145 / 180) * Math.PI]) {
    putRing(b, y + 3.30, a, WALL, yawIn(a), () => tapestry(b, 2.0, 3.0, 880 + ((a * 100) | 0)));
  }
  for (const a of [(320 / 180) * Math.PI, (230 / 180) * Math.PI]) putRing(b, y, a, 14.0, yawIn(a), () => bench(b, 2.0, 2, true));
  putRing(b, y, (75 / 180) * Math.PI, 13.2, yawIn((75 / 180) * Math.PI), () => loom(b));
}

function g6Library(b, ctx, y) {
  // 藏书廊: 4 bookcases + reading table + 2 chairs + 2 lamps
  for (const a of [(18 / 180) * Math.PI, (342 / 180) * Math.PI]) putRing(b, y, a, 16.26, yawIn(a), () => bookcase(b, 2.2, 2.45, 950 + ((a * 70) | 0)));
  for (const a of [(108 / 180) * Math.PI, (252 / 180) * Math.PI]) putRing(b, y, a, 13.4, yawIn(a), () => bookcase(b, 2.0, 2.25, 990 + ((a * 70) | 0)));
  const ta = (200 / 180) * Math.PI;
  putRing(b, y, ta, 13.2, yawIn(ta), () => readingTable(b, y, ctx));
  for (const da of [-0.30, 0.30]) putRing(b, y, ta + da, 14.2, yawIn(ta + da), () => chair(b));
}

function g7Astrolabe(b, y) {
  // 星盘廊: armillary sphere + 2 astrolabe pillars + 2 benches
  putRing(b, y, (90 / 180) * Math.PI, 13.6, yawIn((90 / 180) * Math.PI), () => armillary(b));
  for (const a of [(190 / 180) * Math.PI, (350 / 180) * Math.PI]) putRing(b, y, a, 13.6, yawIn(a), () => astrolabe(b, 1100 + ((a * 60) | 0)));
  for (const a of [(130 / 180) * Math.PI, (250 / 180) * Math.PI]) putRing(b, y, a, 14.5, yawIn(a), () => bench(b, 2.0, 2, true));
}

function g8Tea(b, y) {
  // 茶歇廊: 2 round tables + 4 chairs + 2 plants
  for (const a of [(60 / 180) * Math.PI, (240 / 180) * Math.PI]) {
    putRing(b, y, a, 13.4, yawIn(a), () => teaTable(b));
    for (const da of [-0.34, 0.34]) putRing(b, y, a + da, 14.25, yawIn(a + da), () => chair(b));
  }
  for (const a of [(145 / 180) * Math.PI, (325 / 180) * Math.PI]) putRing(b, y, a, 14.4, yawIn(a), () => plantPot(b, 'flower'));
}

function g9Whale(b, y) {
  // 鲸歌亭: the hanging whale-song bell + 2 benches + a whale-bone relief panel
  putRing(b, y, (15 / 180) * Math.PI, 13.0, yawIn(0), () => whaleBell(b, CW.GAL_T + 5.35));
  for (const a of [(120 / 180) * Math.PI, (240 / 180) * Math.PI]) putRing(b, y, a, 14.2, yawIn(a), () => bench(b, 2.0, 2, true));
  putRing(b, y + 1.6, (185 / 180) * Math.PI, WALL, yawIn((185 / 180) * Math.PI), () => reliefPanel(b, 2.8, 1.9, 1240));
}

function g10Summit(b, ctx, y) {
  // 塔顶观云: four telescopes facing out + 2 benches + 2 planters + 2 sconces
  for (const a of [(30 / 180) * Math.PI, (120 / 180) * Math.PI, (210 / 180) * Math.PI, (300 / 180) * Math.PI]) {
    putRing(b, y, a, 12.6, yawOut(a), () => telescope(b, false));
  }
  for (const a of [(75 / 180) * Math.PI, (255 / 180) * Math.PI]) putRing(b, y, a, 14.3, yawIn(a), () => bench(b, 2.0, 2, true));
  for (const a of [(165 / 180) * Math.PI, (345 / 180) * Math.PI]) putRing(b, y, a, 14.3, yawIn(a), () => plantPot(b, 'fern'));
  for (const a of [(90 / 180) * Math.PI, (270 / 180) * Math.PI]) {
    wallSconce(b, Math.cos(a) * WALL, y + 2.2, Math.sin(a) * WALL, Math.cos(a), Math.sin(a));
    glow(ctx, Math.cos(a) * (WALL - 0.16), y + 2.52, Math.sin(a) * (WALL - 0.16), 0.26, '#ffdca4', 0.8);
  }
}

// ================================================================ C · the atrium hangs
function lanternShade(b) {
  // brass hook + cap (~60) and the glass bell (~48)
  put(b, 0, 0.38, 0, () => { b.push(RZ(Math.PI / 2)); torus(b, 0.038, 0.012, 6, 2, GOLD, M_GD, 'z'); b.pop(); });
  lathe(b, [[0.001, 0.320], [0.070, 0.295], [0.120, 0.230], [0.134, 0.150], [0.118, 0.090]], 8, BRASS, M_BR);
  lathe(b, [[0.001, 0.010], [0.070, 0.020], [0.118, 0.100], [0.106, 0.215], [0.055, 0.280]], 8, GLASS, M_GL);
  put(b, 0, 0.012, 0, () => torus(b, 0.068, 0.016, 8, 2, GOLD_B, M_GDB, 'y'));
}
function chandelier(b, ctx, a, r, yTop, yEnd, nL, seed) {
  const rnd = mulberry32(seed);
  const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
  // the chain: a slim brass rod with link collars down to the canopy
  tubePath(b, [[cx, yTop, cz], [cx, yEnd + 1.2, cz], [cx, yEnd + 0.42, cz]], 0.022, 3, mulc(BRASS_D, 0.85), M_BR, { caps: false });
  for (let k = 0; k < 6; k++) {
    const yy = yEnd + 0.55 + (k * 1.6);
    if (yy > yTop - 0.4) break;
    put(b, cx, yy, cz, () => torus(b, 0.068, 0.022, 6, 2, GOLD_D, M_GD, 'y'));
  }
  put(b, cx, yEnd, cz, () => {
    lathe(b, [[0.001, -0.40], [0.050, -0.36], [0.095, -0.28], [0.190, -0.13], [0.225, 0.0], [0.180, 0.095], [0.105, 0.17], [0.070, 0.32], [0.042, 0.44]], 9, BRASS, M_BR);
    put(b, 0, 0.44, 0, () => torus(b, 0.046, 0.018, 6, 2, GOLD_B, M_GDB, 'y'));
    put(b, 0, -0.42, 0, () => sphere(b, 0.050, GOLD_B, M_GDB, { rings: 2, seg: 4, jitter: 0.05 }));
  });
  for (let k = 0; k < nL; k++) {
    const aa = (k / nL) * TAU + rnd() * 0.5;
    const reach = 0.56 + 0.14 * ((k * 5) % 3) / 2;
    const ax = cx + Math.cos(aa) * reach, az = cz + Math.sin(aa) * reach;
    const ay = yEnd - 0.18 - (k % 2) * 0.10;
    tubePath(b, [[cx + Math.cos(aa) * 0.17, yEnd + 0.05, cz + Math.sin(aa) * 0.17],
      [cx + Math.cos(aa) * (reach * 0.60), ay + 0.10, cz + Math.sin(aa) * (reach * 0.60)],
      [ax, ay + 0.02, az]], 0.028, 3, BRASS, M_BR);
    put(b, ax, ay, az, () => { b.push(m4.scale([1.5, 1.5, 1.5])); lanternShade(b); b.pop(); });
    glow(ctx, ax, ay - 0.22, az, 0.50 + (k % 3) * 0.06, '#ffdcae', 0.82);
    put(b, ax, ay - 0.31, az, () => sphere(b, 0.040, GOLD_B, M_GDB, { rings: 2, seg: 4, jitter: 0.05 }));
  }
}

function silkBanner(b, a, r, yTop, len, mainCol, seed) {
  const rnd = mulberry32(seed);
  const w = 1.5;
  const nu = 5, nv = 8;
  const ca = Math.cos(a), sa = Math.sin(a);
  const P = (i, j) => {
    const u = i / nu, v = j / nv;
    const tang = -w / 2 + w * u;
    const sag = 0.05 * Math.sin(u * Math.PI);
    const rr = r + 0.055 * Math.sin(u * Math.PI * 3.0 + 0.4) * (0.3 + 0.7 * v) - 0.040 * (u * u);
    return [ca * rr - sa * tang, yTop - len * v - sag - 0.30 * v * v, sa * rr + ca * tang];
  };
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const p00 = P(i, j), p10 = P(i + 1, j), p11 = P(i + 1, j + 1), p01 = P(i, j + 1);
      const shade = 0.86 + 0.20 * Math.sin((i / nu) * Math.PI * 2.0) + 0.06 * rnd();
      b.quad(p00, p10, p11, p01, mulc(mainCol, shade), M_CLS);
    }
  }
  for (const u of [0, 1]) {
    for (let j = 0; j < nv; j++) {
      const p0 = P(u, j), p1 = P(u, j + 1);
      const ox = -sa * (u > 0.5 ? 1 : -1) * 0.05, oz = ca * (u > 0.5 ? 1 : -1) * 0.05;
      b.quad([p0[0] - ox, p0[1], p0[2] - oz], [p0[0] + ox, p0[1], p0[2] + oz],
        [p1[0] + ox, p1[1], p1[2] + oz], [p1[0] - ox, p1[1], p1[2] - oz], GOLD, M_GD);
    }
  }
  const h0 = P(0, nv), h1 = P(nu, nv);
  b.quad([h0[0], h0[1], h0[2]], [h1[0], h1[1], h1[2]], [h1[0], h1[1] + 0.15, h1[2]], [h0[0], h0[1] + 0.15, h0[2]], GOLD, M_GD);
  for (let k = 0; k < 4; k++) {
    const u = 0.12 + (k * 0.76) / 3;
    const p = P(u, nv);
    put(b, p[0], p[1], p[2], () => lathe(b, [[0.001, 0], [0.026, 0.010], [0.011, 0.065], [0.001, 0.130]], 4, GOLD_B, M_GDB));
  }
  for (let k = 0; k < 2; k++) {
    const p = P((k + 1) / 3, 0);
    put(b, p[0], p[1] + 0.03, p[2], () => torus(b, 0.050, 0.016, 6, 2, BRASS, M_BR, 'x'));
  }
}

function atriumHangs(b, ctx) {
  // ---- six chandelier chains dropped from the crown
  const groups = [
    { a: 20, end: 74, n: 3 }, { a: 80, end: 66, n: 3 }, { a: 140, end: 58, n: 4 },
    { a: 200, end: 50, n: 3 }, { a: 260, end: 42, n: 4 }, { a: 320, end: 34, n: 3 },
  ];
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    chandelier(b, ctx, (g.a / 180) * Math.PI, 7.9, 90.2, g.end, g.n, 1400 + i * 17);
  }
  // ---- eight long silk banners off the gallery rails (r 9.3; the deck edge is 9.5)
  const banners = [
    { gi: 2, a: 30, len: 9.5, col: BLUE_D }, { gi: 3, a: 75, len: 11.0, col: CLOTH_R },
    { gi: 4, a: 120, len: 8.5, col: BLUE_D }, { gi: 5, a: 165, len: 10.5, col: CLOTH },
    { gi: 6, a: 210, len: 9.0, col: BLUE_D }, { gi: 7, a: 255, len: 12.0, col: CLOTH_R },
    { gi: 8, a: 300, len: 8.0, col: BLUE_D }, { gi: 9, a: 345, len: 10.0, col: CLOTH },
  ];
  for (let i = 0; i < banners.length; i++) {
    const bn = banners[i];
    silkBanner(b, (bn.a / 180) * Math.PI, 9.30, DECK(bn.gi) + 1.02, bn.len, mulc(bn.col, 1.0), 1600 + i * 23);
  }
}

// ================================================================ entry point
export function buildCloudwellHall(b, ctx, rng) {
  const rnd = mulberry32(SEED);   // own stream; the shared rng is intentionally ignored
  cwPush(b);

  // ---- A · entrance hall (y 7)
  hallFloorInlay(b);
  hallCloudVases(b, ctx);
  hallRegistrationDesk(b, ctx);
  hallBenches(b);
  hallPlanters(b);
  hallDisplayCases(b);
  hallWallArt(b, ctx);

  // ---- B · eleven galleries
  g0Entrance(b, ctx, DECK(0));
  g1CloudMaps(b, ctx, DECK(1));
  g2Chimes(b, DECK(2));
  g3Bottles(b, DECK(3));
  g4Observatory(b, DECK(4));
  g5Weaving(b, DECK(5));
  g6Library(b, ctx, DECK(6));
  g7Astrolabe(b, DECK(7));
  g8Tea(b, DECK(8));
  g9Whale(b, DECK(9));
  g10Summit(b, ctx, DECK(10));

  // ---- C · atrium hangs
  atriumHangs(b, ctx);

  b.pop();

  // ---- D · the eight interior point lights (exactly the plan's list)
  if (ctx.points) {
    for (const [x, y, z, hex, range, int] of CW_LIGHTS) {
      ctx.points.push({ p: cwWorld([x, y, z]), col: rgb(hex), range, int });
    }
  }
  void rnd; void rng;
}
