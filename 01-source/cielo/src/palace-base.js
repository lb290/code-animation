// =====================================================================
// PALACE BASE — round 5: the palace's ground floor (city level, y = 0).
// OWNER: agent "base". Contract: 03-notes/cielo-round5-brief.md section A
// + PAL.base in palace-plan.js.
//
// The podium in front of the rotunda was carved hollow by palace.js; this module
// dresses its city facade, its entrance tunnel and its grand entrance hall.
//
// ---------------------------------------------------------------- coordinate table
// (world space, y up, the city is toward -Z)
//
// existing belvedere support wall : front plane z = 92.6, y 0..26.6, x +-47
//   carriage arch opening         : semicircle r = 12.2 about (x 0, y 4.6), tunnel z 92.6..95.6
//   its front-most relief         : z = 91.92 (pilasters x=+-20/32/44), cornices 91.88
//   the terrace deck soffit above : comes down to y 26.6 at z 92.8 -> nothing may stand above 26.5
// hall void (carved by palace.js) : x +-40, y 0..23.6, z 96.4..122.4
//   hall front wall               : z 96..96.4, opening x +-12.4 / y 0..17
//   entrance passage              : x +-12.2 / y 0..16.8 through z 92.6..96.4
//
//   my facade backup plane  ZB  = 91.55   (0.33 in front of the existing relief)
//   facade front-most       z   = 89.5    (giant column shafts)
//   attic top                   = 26.5
//   hall / tunnel floor     FY  = 0.9     (5 stone risers x 0.18 outside, run 0.5)
//   hall ceiling (my plane)     = 22.95, skylight panel 23.5, coffered beams 22.5
//
//   facade bays (mirrored)  columns |x| = 15.3, 25.9, 36.3 ; corner block 46.1..47.05
//                           niches/windows |x| = 20.6, 31.0, 40.2
//   interior nave           columns x=+-22 at z = 101.5, 107.5, 113.5, 119.5
//                           arcade spring 14.2, entablature 17.2..18.6, clerestory to 22.95
//   mezzanine gallery       y = 11.6, back strip z 117.9..122.2, side stairs x=+-33.8..37.8
//   fountain                (0, 107), pool r 4.6, total height 2.55 above the floor
//
// Every face of the old wall that the visitor can see from the plaza is covered by
// new geometry that stands 0.33 m in front of it, so nothing z-fights and the old
// rustication never shows through.
// =====================================================================
import { PAL, PC, palaceFrame } from './palace-plan.js';
import { C } from './palette.js';
import { box, cylinder, lathe, mulc, mixc, bar3, torus } from './geo.js';
import { MT, ellipsoid } from './lib3d.js';
import { mulberry32, TAU, lerp } from './math.js';

const P = PAL;
const BSE = P.base;
const ARCH = BSE.arch;          // { hx 12.2, springY 4.6, apexY 16.8, zFront 92.6, zBack 95.6 }
const HALL = BSE.hall;          // { x0 -40, x1 40, z0 96.4, z1 122.4, ceilY 23.6, mezzY 11.6, pond }
const ZWALL = 92.6;             // (existing support wall plane — read-only)
const ZB = 91.55;               // back plane of the new facade relief
const HW = 47.0;                // (existing wall half width — read-only)
const XEDGE = 46.1;             // inner edge of the corner block
const TOPY = 26.5;              // our attic top (existing wall top is 26.6)
const L_RUST = 9.05;            // top of the rusticated ground storey
const L_ENT = 20.4;             // entablature base (top of the giant order)
const L_ATT = 23.0;             // attic base (top of the entablature)
const FY = 0.9;                 // hall + tunnel floor level
const HX = HALL.x1;             // 40
const HZ0 = HALL.z0, HZ1 = HALL.z1;
const CEILP = 22.95;            // my ceiling plane
const MEZZ = HALL.mezzY;        // 11.6
const COLX = 22.0;              // nave column line
const COLZ = [101.5, 107.5, 113.5, 119.5];
const SXW = 39.85;              // side-wall marble panel plane |x|
const BZW = 122.2;              // back-wall marble panel plane z
const FZW = 96.45;              // front-wall (hall side) panel plane z
const XCOL = [15.3, 25.9, 36.3];
const XBAY = [20.6, 31.0, 40.2];
const ARC_R = ARCH.hx;          // 12.2
const SPR = ARCH.springY;       // 4.6

// ---------------------------------------------------------------- round 8 contract
// The three doorways this wall opens into the palace's rear suite (agent "rooms",
// src/palace-chambers.js). Everything behind this wall belongs to that module; the
// numbers below are the only shared contract, so the reveal linings line up exactly.
//   grand : semicircular arch, 14.4 m wide, springing 3.3, apex 10.5 (under the deck)
//   side  : two 4 m doors at x = +-20.5, springing 5.4, apex 7.4
export const CHAMBER_DOORS = {
  zFace: BZW,                   // 122.2 — the decorated, hall-facing plane
  zBack: HZ1,                   // 122.4 — where the hollowed podium mass begins
  grand: { x: 0, hx: 7.2, y0: FY, spring: 3.3, apex: 10.5 },
  sides: [{ x: -20.5 }, { x: 20.5 }],
  side: { hx: 2.0, y0: FY, spring: 5.4, apex: 7.4 },
  revealZ: 124.10,              // deep side of the reveal (chambers' gallery wall face)
};

// ---------------------------------------------------------------- palette
const STONE = PC.stone, STONE_HI = PC.stoneHi, STONE_SH = PC.stoneSh;
const MARBLE = PC.marble, MARBLE_HI = PC.marbleHi, MARBLE_SH = PC.marbleSh;
const GOLD = PC.gold, GOLD_HI = PC.goldHi;
const HALLW = PC.hallWall, HALLHI = PC.hallWallHi, HALLSH = PC.hallShade;
const FLOOR_A = mulc(mixc(PC.floorA, C.stoneCool, 0.20), 0.86);
const FLOOR_B = mulc(mixc(PC.floorB, C.slate, 0.34), 0.62);
const FLOOR_G = mulc(PC.floorGold, 0.92);
const GLASS_W = mulc(mixc(GOLD_HI, C.sunGlow, 0.45), 0.92);   // warm lit window
const GLASS_S = PC.glassSky;
const RED = mulc(mixc(C.bloomRed, C.slateDark, 0.26), 0.92);
const RED_D = mulc(RED, 0.62);
const VELVET = mixc(C.bloomRed, C.slateDark, 0.42);
const VELVET_B = mixc(C.slate, C.slateDark, 0.62);
const LEAF = C.leaf, LEAF_L = C.leafLight, LEAF_D = C.leafDark;
const WOOD = mixc(C.bronze, C.gold, 0.22);

// ---- interior palette (round 2 rebalance) ---------------------------------
// The hall is a huge interior with no direct sun: if the stone stays near-white
// the 9 fill lights blow it out and every gold detail disappears. Albedo is kept
// around 0.42..0.62 linear with a very small emissive floor; the luxury comes from
// gold / brass / deep-blue tapestry / wine-red carpet / dark picture fields.
const I_MARB = mulc(mixc(PC.marble, C.sunGlow, 0.26), 0.72);          // warm ivory
const I_MARBHI = mulc(mixc(PC.marbleHi, C.sunGlow, 0.34), 0.80);
const I_MARBSH = mulc(mixc(PC.marbleSh, C.stoneWarm, 0.34), 0.70);
const I_WALL = mulc(mixc(PC.hallWall, C.sunGlow, 0.38), 0.78);
const I_WALLHI = mulc(mixc(PC.hallWallHi, C.sunGlow, 0.44), 0.84);
const I_WALLSH = mulc(mixc(C.stoneWarm, C.stoneDark, 0.40), 0.72);
const I_DARK = mulc(mixc(C.slateDark, C.stoneWarm, 0.22), 0.60);      // niche / reveal shadow
const I_GLASS = mixc(C.sunGlow, GOLD, 0.34);                          // lit window pane
const I_GLASSB = mixc(C.glassDeep, C.horizon, 0.30);                  // cool pane
const I_BLUE = mulc(mixc(C.slateDark, C.stoneCool, 0.26), 0.74);     // deep lapis (not poster blue)
const I_BLUEHI = mulc(mixc(C.slateLight, C.horizon, 0.30), 0.72);
const I_RED = mulc(mixc(C.bloomRed, C.slateDark, 0.30), 0.86);        // wine carpet
const I_REDHI = mulc(mixc(C.bloomRed, C.gold, 0.18), 0.92);
const I_WOOD = mulc(mixc(C.bronze, C.slateDark, 0.35), 0.85);
const I_GOLDD = mulc(GOLD, 0.86);
const MI = {
  marble: [0.095, 0.22],
  marbleHi: [0.115, 0.28],
  marbleSh: [0.075, 0.16],
  wall: [0.100, 0.10],
  wallHi: [0.135, 0.14],
  dark: [0.050, 0.08],
  gold: [0.100, 0.88],
  goldHi: [0.150, 0.92],
  glass: [0.40, 0.70],
  glowW: [0.62, 0.00],
  cloth: [0.020, 0.06],
  velvet: [0.015, 0.08],
  wood: [0.050, 0.30],
  water: [0.120, 0.75],
  paint: [0.030, 0.10],
};

// materials [emissive, gloss] — interior stone carries a warm self-lit lift so the
// hall never goes muddy (see lit.fs.glsl); exteriors match PM.stone.
const M = {
  stone: [0.135, 0.09],
  stoneHi: [0.155, 0.13],
  stoneSh: [0.115, 0.07],
  marble: [0.135, 0.24],
  marbleHi: [0.16, 0.28],
  marbleSh: [0.12, 0.16],
  gold: [0.13, 0.88],
  goldHi: [0.20, 0.92],
  window: [0.38, 0.72],
  windowS: [0.32, 0.85],
  glowW: [0.88, 0.00],
  glowS: [0.95, 0.00],
  glowS2: [0.70, 0.00],
  cloth: [0.04, 0.06],
  carpet: [0.06, 0.05],
  velvet: [0.02, 0.10],
  wood: [0.10, 0.34],
  water: [0.30, 0.80],
  leaf: [0.00, 0.12],
  bloom: [0.05, 0.08],
  iron: [0.02, 0.55],
  mirror: [0.22, 0.92],
  paint: [0.10, 0.12],
  dark: [0.06, 0.10],
};

const NZ = [0, 0, -1], PZ = [0, 0, 1], NX = [-1, 0, 0], PX = [1, 0, 0];
const UPV = [0, 1, 0], DNV = [0, -1, 0];

// ---------------------------------------------------------------- helpers
function at(b, x, y, z, yaw, fn) { b.push(palaceFrame(x, y, z, yaw)); fn(); b.pop(); }
// local box in the current frame
function lbox(b, cx, cy, cz, sx, sy, sz, col, mat, opts) {
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, cx, cy, cz, 1]);
  box(b, sx, sy, sz, col, mat, opts);
  b.pop();
}
// world box from min/max ranges (stays inside the current frame)
function bx(b, x0, x1, y0, y1, z0, z1, col, mat, opts) {
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, 1]);
  box(b, x1 - x0, y1 - y0, z1 - z0, col, mat, opts);
  b.pop();
}
// axis-aligned quads (normals given explicitly; the renderer does not cull)
function qF(b, x0, x1, y0, y1, z, col, mat) { b.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], col, mat, NZ); }
function qB(b, x0, x1, y0, y1, z, col, mat) { b.quad([x1, y0, z], [x0, y0, z], [x0, y1, z], [x1, y1, z], col, mat, PZ); }
function qXm(b, x, z0, z1, y0, y1, col, mat) { b.quad([x, y0, z1], [x, y0, z0], [x, y1, z0], [x, y1, z1], col, mat, NX); }
function qXp(b, x, z0, z1, y0, y1, col, mat) { b.quad([x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0], col, mat, PX); }
function qYp(b, y, x0, x1, z0, z1, col, mat) { b.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], col, mat, UPV); }
function qYn(b, y, x0, x1, z0, z1, col, mat) { b.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], col, mat, DNV); }
// side-wall facing quad: the inward normal of the s=+1 wall is -X, of the s=-1 wall is +X
function qSide(b, s, x, z0, z1, y0, y1, col, mat) {
  if (s > 0) b.quad([x, y0, z1], [x, y0, z0], [x, y1, z0], [x, y1, z1], col, mat, NX);
  else b.quad([x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0], col, mat, PX);
}
// cylindrical band in the XY plane about (cx,cy), extruded z0..z1 (front faces -Z)
function bandZ(b, cx, cy, r0, r1, z0, z1, a0, a1, seg, col, mat, front, inner) {
  for (let i = 0; i < seg; i++) {
    const t0 = a0 + ((a1 - a0) * i) / seg, t1 = a0 + ((a1 - a0) * (i + 1)) / seg;
    const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
    if (front !== false) {
      b.quad([cx + c0 * r0, cy + s0 * r0, z0], [cx + c1 * r0, cy + s1 * r0, z0],
        [cx + c1 * r1, cy + s1 * r1, z0], [cx + c0 * r1, cy + s0 * r1, z0], col, mat, NZ);
    }
    if (inner !== false) {
      const am = (t0 + t1) * 0.5;
      b.quad([cx + c0 * r0, cy + s0 * r0, z0], [cx + c0 * r0, cy + s0 * r0, z1],
        [cx + c1 * r0, cy + s1 * r0, z1], [cx + c1 * r0, cy + s1 * r0, z0],
        mulc(col, 0.80), mat, [-Math.cos(am), -Math.sin(am), 0]);
    }
  }
}
// flat panel frames / mouldings on a facade (front faces -Z)
function frameZ(b, x0, x1, y0, y1, zf, t, d, col, mat) {
  bx(b, x0, x1, y1 - t, y1, zf, zf + d, col, mat);
  bx(b, x0, x1, y0, y0 + t, zf, zf + d, col, mat);
  bx(b, x0, x0 + t, y0 + t, y1 - t, zf, zf + d, col, mat);
  bx(b, x1 - t, x1, y0 + t, y1 - t, zf, zf + d, col, mat);
}

// ---------------------------------------------------------------- statues / props
// draped standing figure, 2.5 m tall at s=1, feet at the origin of the frame
function figure(b, x, y, z, s, yaw, col, mat) {
  const c = col || MARBLE_HI, m = mat || M.marble;
  at(b, x, y, z, yaw, () => {
    // robe (vase silhouette, deeply folded by tone bands)
    lathe(b, [[0.34, 0.00], [0.30, 0.10], [0.26, 0.28], [0.215, 0.55], [0.19, 0.86],
      [0.20, 1.06], [0.235, 1.20], [0.225, 1.30]], 8, c, m);
    lathe(b, [[0.215, 0.55], [0.19, 0.86]], 8, mulc(c, 0.90), m);   // drapery shadow band
    // chest + shoulders
    lbox(b, 0, 1.36, 0.02, 0.34, 0.26, 0.30, mulc(c, 1.02), m);
    lbox(b, 0, 1.50, 0.01, 0.44, 0.10, 0.26, mulc(c, 1.05), m);
    // head + hair
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1.66, 0.01, 1]);
    ellipsoid(b, 0.115, 0.135, 0.115, 6, 4, mulc(c, 1.05), m);
    b.pop();
    lbox(b, 0, 1.72, -0.02, 0.20, 0.10, 0.19, mulc(c, 0.86), m);
    // arms: one raised, one across the body
    bar3(b, [0.19, 1.48, 0.0], [0.34, 1.72, 0.10], 0.10, 0.10, mulc(c, 1.0), m);
    bar3(b, [0.32, 1.70, 0.10], [0.30, 1.96, 0.14], 0.085, 0.085, mulc(c, 1.02), m);
    bar3(b, [-0.19, 1.48, 0.0], [-0.28, 1.16, 0.14], 0.095, 0.095, mulc(c, 0.98), m);
    // drapery blade behind (reads as a mantle at a distance)
    b.quad([-0.30, 1.42, -0.16], [0.30, 1.42, -0.16], [0.42, 0.62, -0.30], [-0.36, 0.62, -0.30], mulc(c, 0.92), m, PZ);
  });
}
// ornate pedestal under a statue
function pedestal(b, x, y, z, w, h, d, col) {
  const c = col || MARBLE;
  bx(b, x - w / 2, x + w / 2, y, y + h, z - d / 2, z + d / 2, c, M.marble, { topCol: MARBLE_HI });
  bx(b, x - w / 2 - 0.10, x + w / 2 + 0.10, y + h - 0.14, y + h, z - d / 2 - 0.10, z + d / 2 + 0.10, GOLD, M.gold);
  bx(b, x - w / 2 - 0.08, x + w / 2 + 0.08, y, y + 0.16, z - d / 2 - 0.08, z + d / 2 + 0.08, MARBLE_HI, M.marbleHi);
}
// seated lion, facing -Z, ~1.9 m tall at s=1
function lion(b, x, y, z, yaw, s, col) {
  const c = col || MARBLE_HI;
  at(b, x, y, z, yaw, () => {
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    box(b, 1.05, 0.34, 1.9, mulc(c, 0.96), M.marble);                 // plinth
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0.17, 0, 1]);
    b.pop();
    box(b, 0.78, 0.62, 1.25, c, M.marble);                            // haunches
    box(b, 0.62, 0.72, 0.62, mulc(c, 1.02), M.marble);                // chest
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0.92, 0.42, 1]);
    ellipsoid(b, 0.36, 0.34, 0.34, 7, 5, mulc(c, 1.04), M.marble);    // mane
    b.pop();
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0.98, 0.66, 1]);
    ellipsoid(b, 0.21, 0.20, 0.20, 6, 4, mulc(c, 1.06), M.marble);    // head
    b.pop();
    for (const sx of [-1, 1]) {                                       // forelegs
      box(b, 0.18, 0.60, 0.18, mulc(c, 1.0), M.marble);
      b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, sx * 0.24, 0.56, 0.52, 1]);
      box(b, 0.20, 0.62, 0.20, mulc(c, 1.02), M.marble);
      b.pop();
    }
    bar3(b, [0, 0.42, -0.62], [-0.34, 0.62, -0.70], 0.10, 0.10, mulc(c, 0.94), M.marble);  // tail
    b.pop();
  });
}
// hanging banner; top edge at (x,y,z), width w, length h, facing -Z
function banner(b, x, y, z, w, h, colA, colB) {
  const rows = 6, cols = 4;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const xa = x - w / 2 + (w * c) / cols, xb = x - w / 2 + (w * (c + 1)) / cols;
      const ya = y - (h * r) / rows, yb = y - (h * (r + 1)) / rows;
      const wv = Math.sin(r * 0.9 + c * 1.1) * 0.10;
      const col = (r + c) % 2 ? colA : colB;
      b.quad([xa, yb, z + wv], [xb, yb, z + wv], [xb, ya, z + wv], [xa, ya, z + wv], mulc(col, 0.96 + 0.05 * ((r + c) % 3)), M.cloth, NZ);
    }
  }
  // gold fringe + rod
  bx(b, x - w / 2 - 0.10, x + w / 2 + 0.10, y - 0.10, y + 0.06, z - 0.07, z + 0.07, GOLD, M.gold);
  for (let c = 0; c < cols; c++) {
    const xa = x - w / 2 + (w * c) / cols;
    const wv = Math.sin(rows * 0.9 + c * 1.1) * 0.10;
    b.quad([xa, y - h - 0.16, z + wv], [xa + w / cols, y - h - 0.16, z + wv],
      [xa + w / cols, y - h, z + wv], [xa, y - h, z + wv], GOLD, M.gold, NZ);
  }
}
// potted orange tree
function orangeTree(b, x, y, z, s) {
  const k = s || 1;
  at(b, x, y, z, 0, () => {
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    lathe(b, [[0.30 * k, 0], [0.40 * k, 0.10 * k], [0.44 * k, 0.42 * k], [0.40 * k, 0.52 * k], [0.44 * k, 0.58 * k]], 8, MARBLE_SH, M.marble);
    cylinder(b, 6, 0.30 * k, 0.26 * k, 0.10 * k, mulc(WOOD, 0.7), M.wood, { y0: 0.52 * k });
    cylinder(b, 5, 0.055 * k, 0.045 * k, 0.85 * k, WOOD, M.wood, { y0: 0.58 * k });
    const blobs = [[0, 1.42, 0, 0.34], [0.22, 1.28, 0.10, 0.24], [-0.20, 1.30, -0.12, 0.22], [0.06, 1.60, -0.08, 0.20]];
    for (let i = 0; i < blobs.length; i++) {
      const [bx2, by2, bz2, r] = blobs[i];
      b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, bx2 * k, by2 * k, bz2 * k, 1]);
      ellipsoid(b, r * k, r * 0.86 * k, r * k, 6, 4, i % 2 ? LEAF : LEAF_L, M.leaf);
      b.pop();
    }
    for (let i = 0; i < 5; i++) {                 // oranges
      const a = (i / 5) * TAU + 0.4;
      b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, Math.cos(a) * 0.24 * k, (1.24 + (i % 3) * 0.12) * k, Math.sin(a) * 0.22 * k, 1]);
      ellipsoid(b, 0.075 * k, 0.075 * k, 0.075 * k, 5, 3, C.koiGold, M.bloom);
      b.pop();
    }
    b.pop();
  });
}
// flower urn
function flowerUrn(b, x, y, z, s) {
  const k = s || 1;
  at(b, x, y, z, 0, () => {
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    lbox(b, 0, 0.09, 0, 0.62 * k, 0.18 * k, 0.62 * k, MARBLE_SH, M.marble);
    lathe(b, [[0.12 * k, 0.18 * k], [0.26 * k, 0.30 * k], [0.30 * k, 0.48 * k], [0.24 * k, 0.66 * k], [0.27 * k, 0.72 * k]], 8, MARBLE, M.marble);
    const cols = [C.bloomPink, C.bloomRed, C.bloomYellow, C.bloomBlue, C.bloomWhite];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + 0.3, r = 0.13 * k;
      b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, Math.cos(a) * r, (0.80 + (i % 3) * 0.07) * k, Math.sin(a) * r, 1]);
      ellipsoid(b, 0.085 * k, 0.075 * k, 0.085 * k, 5, 3, cols[i % cols.length], M.bloom);
      b.pop();
    }
    b.pop();
  });
}
// standing candelabrum, 1.9 m at s=1
function candelabrum(b, x, y, z, s) {
  const k = s || 1;
  at(b, x, y, z, 0, () => {
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    lathe(b, [[0.28 * k, 0], [0.24 * k, 0.06 * k], [0.14 * k, 0.12 * k], [0.09 * k, 0.30 * k], [0.07 * k, 1.10 * k], [0.10 * k, 1.20 * k], [0.20 * k, 1.26 * k]], 7, GOLD, M.gold);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU;
      bar3(b, [0, 1.24 * k, 0], [Math.cos(a) * 0.26 * k, 1.52 * k, Math.sin(a) * 0.26 * k], 0.05 * k, 0.05 * k, GOLD, M.gold);
      b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, Math.cos(a) * 0.26 * k, 1.54 * k, Math.sin(a) * 0.26 * k, 1]);
      cylinder(b, 5, 0.035 * k, 0.030 * k, 0.16 * k, mixc(C.cloudLit, C.sunGlow, 0.4), M.cloth, { y0: 0 });
      b.pop();
    }
    b.pop();
  });
}
// gold-framed landscape painting hung on a side wall (x = const)
// s = wall side (+1 = the +X wall). Frame + sky / hill / foreground bands + a sun.
function painting(b, s, xFace, z0, z1, y0, y1, colA, colB) {
  const w = z1 - z0, h = y1 - y0;
  const xf = s * (Math.abs(xFace) - 0.03);
  const zc = s * (Math.abs(xFace) - 0.005);
  // gold frame
  qSide(b, s, xf, z0 - 0.11, z1 + 0.11, y1 - 0.18, y1, GOLD_HI, MI.goldHi);
  qSide(b, s, xf, z0 - 0.11, z1 + 0.11, y0, y0 + 0.18, GOLD_HI, MI.goldHi);
  qSide(b, s, xf, z0 - 0.11, z0 + 0.02, y0, y1, GOLD_HI, MI.goldHi);
  qSide(b, s, xf, z1 - 0.02, z1 + 0.11, y0, y1, GOLD_HI, MI.goldHi);
  qSide(b, s, xf, z0 - 0.02, z1 + 0.02, y1, y1 + 0.14, GOLD, MI.gold);
  // canvas: sky gradient, distant hills, foreground
  qSide(b, s, zc, z0 + 0.05, z1 - 0.05, y0 + 0.08, y1 - 0.08, colA, MI.paint);
  qSide(b, s, zc + 0.006, z0 + 0.05, z1 - 0.05, y0 + h * 0.46, y0 + h * 0.66, mixc(colA, C.cloudLit, 0.45), MI.paint);
  qSide(b, s, zc + 0.012, z0 + 0.05, z1 - 0.05, y0 + h * 0.24, y0 + h * 0.50, colB, MI.paint);
  qSide(b, s, zc + 0.018, z0 + 0.05, z1 - 0.05, y0 + 0.08, y0 + h * 0.28, mulc(colB, 0.62), MI.paint);
  // a gold sun low over the hills
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, s * (Math.abs(xFace) + 0.012), y0 + h * 0.62, z0 + w * 0.68, 1]);
  ellipsoid(b, 0.02, h * 0.09, w * 0.09, 6, 3, GOLD_HI, MI.goldHi);
  b.pop();
  void xf;
  void xf;
}
// simple 4-bar gold frame standing proud of a side wall (used for mirrors)
function frameX(b, s, xFace, z0, z1, y0, y1, t, col) {
  const x = s * (Math.abs(xFace) - 0.02);
  qSide(b, s, x, z0, z1, y1 - t, y1, col, M.gold);
  qSide(b, s, x, z0, z1, y0, y0 + t, col, M.gold);
  qSide(b, s, x, z0, z0 + t, y0, y1, col, M.gold);
  qSide(b, s, x, z1 - t, z1, y0, y1, col, M.gold);
}

// =====================================================================
// 1. THE CITY FACADE (all of it in front of z = 92.2)
// =====================================================================
function buildFacade(b, ctx, R) {
  // ---- backing wall: the whole old wall covered, with the arch cut out -------
  // (the ragged arch edge is hidden behind the archivolt annulus below)
  const sx0 = 12.55;
  for (let y = 1.0; y < TOPY - 1e-6; y += 0.5) {
    const y1 = Math.min(TOPY, y + 0.5);
    const ym = (y + y1) * 0.5;
    const open = ym <= SPR ? sx0 : Math.sqrt(Math.max(0, sx0 * sx0 - (ym - SPR) * (ym - SPR)));
    const cc = ym < L_RUST ? mulc(STONE_SH, 0.72) : (ym < L_ENT ? STONE : STONE_HI);
    const mm = ym < L_RUST ? M.stoneSh : M.stone;
    if (open < XEDGE) {
      qF(b, -XEDGE, -open, y, y1, ZB, cc, mm);
      qF(b, open, XEDGE, y, y1, ZB, mulc(cc, 0.995), mm);
    }
  }
  qF(b, -XEDGE, -sx0, 1.0, SPR, ZB, STONE_SH, M.stoneSh);
  qF(b, sx0, XEDGE, 1.0, SPR, ZB, STONE_SH, M.stoneSh);

  // ---- rusticated ground storey: individual blocks with dark joints ----------
  const nBW = 7, bw = (XEDGE - 14.7) / 5;      // blocks per side course
  for (const s of [-1, 1]) {
    for (let j = 0; j < nBW; j++) {
      const ya = 1.0 + (L_RUST - 1.0) * (j / nBW), yb = 1.0 + (L_RUST - 1.0) * ((j + 1) / nBW);
      const cols = Math.max(4, Math.round((XEDGE - 14.7) / 3.2));
      for (let i = 0; i < cols; i++) {
        const xa = 14.7 + ((XEDGE - 14.7) * i) / cols, xb = 14.7 + ((XEDGE - 14.7) * (i + 1)) / cols;
        // skip the blocks that would intrude into the arch opening
        const nnx = s > 0 ? xa : -xb, nxx = s > 0 ? xb : -xa;
        const rCorner = Math.hypot(Math.min(Math.abs(nnx), Math.abs(nxx)), Math.max(0, ya - SPR));
        if (rCorner < sx0 - 0.05) continue;
        const g = 0.105;
        const X0 = s * (xa + g) * 1, X1 = s * (xb - g);
        const x0 = Math.min(X0, X1), x1 = Math.max(X0, X1);
        const zf = (i + j) % 2 ? ZB - 0.05 : ZB - 0.09;
        const tone = 0.94 + 0.06 * (((i * 3 + j * 5) % 4) / 3);
        const cc = mulc((i + j) % 2 ? STONE : STONE_HI, tone * 0.99);
        qF(b, x0, x1, ya + g, yb - g, zf, cc, M.stone);
        bx(b, x0, x1, yb - g - 0.05, yb - g, zf, zf + 0.05, mulc(cc, 1.06), M.stone);
      }
    }
  }
  // plinth (stylobate) either side of the portal
  for (const s of [-1, 1]) {
    const xa = Math.min(s * 14.6, s * XEDGE), xb = Math.max(s * 14.6, s * XEDGE);
    bx(b, xa, xb, 0.0, 1.0, 90.55, 92.05, mulc(STONE, 0.97), M.stone, { topCol: STONE_HI });
    bx(b, xa, xb, 1.0, 1.16, 90.45, 92.05, MARBLE_SH, M.marble);
  }

  // ---- the great portal: archivolt annulus, keystone, spandrel reliefs ------
  const zA0 = 90.55, zA1 = 92.20;
  bandZ(b, 0, SPR, ARC_R + 0.05, 14.7, zA0, zA1, 0, Math.PI, 26, STONE_HI, M.stoneHi);
  // three concentric grooves + gold fillet on the annulus face
  for (const rr of [13.05, 13.85]) {
    for (let i = 0; i < 26; i++) {
      const t0 = (Math.PI * i) / 26, t1 = (Math.PI * (i + 1)) / 26;
      b.quad([Math.cos(t0) * rr, SPR + Math.sin(t0) * rr, zA0 - 0.02], [Math.cos(t1) * rr, SPR + Math.sin(t1) * rr, zA0 - 0.02],
        [Math.cos(t1) * (rr + 0.10), SPR + Math.sin(t1) * (rr + 0.10), zA0 - 0.02], [Math.cos(t0) * (rr + 0.10), SPR + Math.sin(t0) * (rr + 0.10), zA0 - 0.02],
        mulc(STONE_SH, 0.9), M.stoneSh, NZ);
    }
  }
  for (let i = 0; i < 26; i++) {
    const t0 = (Math.PI * i) / 26, t1 = (Math.PI * (i + 1)) / 26;
    b.quad([Math.cos(t0) * (ARC_R + 0.12), SPR + Math.sin(t0) * (ARC_R + 0.12), zA0 - 0.03], [Math.cos(t1) * (ARC_R + 0.12), SPR + Math.sin(t1) * (ARC_R + 0.12), zA0 - 0.03],
      [Math.cos(t1) * (ARC_R + 0.34), SPR + Math.sin(t1) * (ARC_R + 0.34), zA0 - 0.03], [Math.cos(t0) * (ARC_R + 0.34), SPR + Math.sin(t0) * (ARC_R + 0.34), zA0 - 0.03],
      GOLD, M.gold, NZ);
  }
  // jamb pilasters below the springing (portal reveal)
  for (const s of [-1, 1]) {
    const x0 = s > 0 ? ARC_R : -14.7, x1 = s > 0 ? 14.7 : -ARC_R;
    bx(b, x0, x1, 1.0, SPR, 90.6, 92.20, STONE_HI, M.stone, { topCol: MARBLE_HI });
    qF(b, x0, x1, SPR - 0.45, SPR, 90.55, MARBLE, M.marble);      // springing block
    b.quad([s * ARC_R, 1.0, zA0], [s * ARC_R, 1.0, zA1], [s * ARC_R, SPR, zA1], [s * ARC_R, SPR, zA0],
      mulc(STONE, 0.86), M.stone, [-s, 0, 0]);
    // gold band + a pair of torch brackets on the jambs
    qF(b, Math.min(x0, x1) + 0.1, Math.max(x0, x1) - 0.1, SPR - 0.56, SPR - 0.46, 90.50, GOLD, M.gold);
    for (const yy of [2.6, 6.2, 9.8, 13.4]) {
      const xx = s * (ARC_R + 0.55);
      bx(b, xx - 0.22 * s - 0.16, xx + 0.16 * s + 0.16, yy - 0.16, yy + 0.16, 90.35, 90.75, GOLD, M.gold);
    }
  }
  // keystone + cartouche at the crown
  bx(b, -1.15, 1.15, 16.9, 19.6, 89.85, 91.6, MARBLE_HI, M.marbleHi, { topCol: MARBLE });
  bx(b, -0.75, 0.75, 17.3, 19.2, 89.60, 89.9, GOLD, M.gold);
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 18.35, 89.55, 1]);
  ellipsoid(b, 0.52, 0.62, 0.18, 8, 5, GOLD_HI, M.goldHi);
  b.pop();
  // spandrel trophies on the annulus face
  for (const s of [-1, 1]) {
    const cx = s * 9.6, cy = 14.9;
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, cx, cy, 90.52, 1]);
    torus(b, 0.78, 0.09, 10, 4, GOLD, M.gold, 'z');
    ellipsoid(b, 0.46, 0.40, 0.12, 8, 4, GOLD, M.gold);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, Math.cos(a) * 0.78, Math.sin(a) * 0.78, 0.02, 1]);
      ellipsoid(b, 0.11, 0.11, 0.07, 5, 3, GOLD_HI, M.goldHi);
      b.pop();
    }
    b.pop();
  }

  // ---- relief panels on the ground-storey piers under the giant columns ----
  for (const s of [-1, 1]) {
    for (const cx of [25.9, 36.3]) {
      const x = s * cx;
      bx(b, x - 1.12, x + 1.12, 2.7, 8.1, ZB - 0.16, ZB, MARBLE, M.marble);
      bx(b, x - 1.26, x + 1.26, 8.1, 8.34, ZB - 0.26, ZB, MARBLE_HI, M.marbleHi);
      bx(b, x - 1.26, x + 1.26, 2.7, 2.94, ZB - 0.26, ZB, MARBLE_HI, M.marbleHi);
      bx(b, x - 1.26, x - 1.10, 2.94, 8.1, ZB - 0.26, ZB, GOLD, M.gold);
      bx(b, x + 1.10, x + 1.26, 2.94, 8.1, ZB - 0.26, ZB, GOLD, M.gold);
      bx(b, x - 1.00, x + 1.00, 3.05, 7.85, ZB - 0.20, ZB - 0.14, mulc(MARBLE_SH, 0.94), M.marbleSh);
      // gold garland hanging down the panel
      for (let i = 0; i < 7; i++) {
        const yy = 7.5 - i * 0.62;
        b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x + Math.sin(i * 1.1) * 0.28, yy, ZB - 0.30, 1]);
        ellipsoid(b, 0.30, 0.22, 0.12, 6, 3, i % 2 ? GOLD : GOLD_HI, M.gold);
        b.pop();
      }
      b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 5.4, ZB - 0.32, 1]);
      ellipsoid(b, 0.52, 0.42, 0.12, 8, 4, GOLD_HI, M.goldHi);
      b.pop();
    }
  }
  // ---- giant order: pedestals, shafts, capitals ---------------------------
  for (const s of [-1, 1]) {
    for (const cx of XCOL) {
      const x = s * cx;
      // pedestal (dies into the rusticated storey)
      bx(b, x - 1.32, x + 1.32, 9.05, 10.5, 89.95, 92.0, MARBLE, M.marble, { topCol: MARBLE_HI });
      bx(b, x - 1.42, x + 1.42, 10.5, 10.72, 89.85, 92.0, MARBLE_HI, M.marbleHi);
      bx(b, x - 1.30, x + 1.30, 9.35, 9.6, 89.8, 90.1, GOLD, M.gold);
      // base
      bx(b, x - 1.24, x + 1.24, 10.72, 11.05, 89.75, 91.6, MARBLE, M.marble);
      bx(b, x - 1.12, x + 1.12, 11.05, 11.30, 89.85, 91.5, MARBLE_HI, M.marbleHi);
      // shaft (engaged: half round against the wall plane)
      at(b, x, 0, 90.55, 0, () => {
        cylinder(b, 12, 1.05, 0.90, 7.30, MARBLE, M.marble, { y0: 11.30 });
        cylinder(b, 12, 0.90, 0.90, 0.10, GOLD, M.gold, { y0: 18.60 });
        cylinder(b, 12, 1.035, 1.035, 0.09, GOLD, M.gold, { y0: 11.42 });
        cylinder(b, 12, 0.975, 0.975, 0.08, GOLD, M.gold, { y0: 11.75 });
      });
      // capital: gold bell + volutes + abacus
      bx(b, x - 1.02, x + 1.02, 18.72, 19.25, 89.60, 91.6, GOLD, M.gold);
      bx(b, x - 1.16, x + 1.16, 19.25, 19.62, 89.55, 91.6, MARBLE_HI, M.marbleHi, { topCol: MARBLE });
      bx(b, x - 1.02, x + 1.02, 19.62, 19.82, 89.70, 91.6, MARBLE, M.marble);
      for (const sx of [-1, 1]) {
        b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x + sx * 0.86, 18.98, 89.66, 1]);
        ellipsoid(b, 0.20, 0.20, 0.16, 6, 4, GOLD_HI, M.goldHi);
        b.pop();
      }
    }
    // corner block sealing the end of the facade slot
    const xa = s > 0 ? 46.1 : -47.05, xb = s > 0 ? 47.05 : -46.1;
    bx(b, xa, xb, 0, TOPY, 90.3, 92.22, STONE, M.stone, { topCol: STONE_HI });
    for (let k = 0; k < 6; k++) {       // quoins
      const wq = k % 2 ? 0.55 : 0.95;
      bx(b, s > 0 ? 47.05 - wq : -47.05, s > 0 ? 47.05 : -47.05 + wq,
        1.2 + k * 4.2, 1.2 + k * 4.2 + 3.9, 90.25, 90.32, k % 2 ? STONE_HI : MARBLE, M.stone);
    }
    // giant corner pilaster on the facade
    const px = s * 45.4;
    bx(b, px - 1.05, px + 1.05, 9.05, 10.5, 90.5, 92.0, MARBLE, M.marble);
    bx(b, px - 0.95, px + 0.95, 10.5, 18.8, 90.62, 91.6, MARBLE, M.marble);
    bx(b, px - 1.10, px + 1.10, 18.8, 19.62, 90.45, 91.6, MARBLE_HI, M.marbleHi);
    bx(b, px - 0.80, px + 0.80, 19.05, 19.30, 90.35, 90.62, GOLD, M.gold);
  }

  // ---- piano nobile windows ----------------------------------------------
  for (const s of [-1, 1]) {
    for (const cx of XBAY) {
      const x = s * cx, hw = 1.70, yS = 11.30, ySpr = 15.30, yAp = ySpr + hw;
      // recess shadow + glass (flush panel with a dark reveal ring: reads recessed)
      qF(b, x - hw, x + hw, yS, ySpr, ZB - 0.06, mixc(C.slateDark, C.stoneCool, 0.35), M.dark);
      for (let i = 0; i < 8; i++) {
        const a0 = Math.PI * (i / 8), a1 = Math.PI * ((i + 1) / 8);
        b.tri([x, ySpr, ZB - 0.06], [x + Math.cos(a0) * hw, ySpr + Math.sin(a0) * hw, ZB - 0.06],
          [x + Math.cos(a1) * hw, ySpr + Math.sin(a1) * hw, ZB - 0.06], mixc(C.slateDark, C.stoneCool, 0.35), M.dark, NZ, NZ, NZ);
      }
      // the lit pane, slightly proud of the reveal so it glows
      qF(b, x - hw + 0.16, x + hw - 0.16, yS + 0.14, ySpr, ZB - 0.10, GLASS_W, M.window);
      for (let i = 0; i < 8; i++) {
        const a0 = Math.PI * (i / 8), a1 = Math.PI * ((i + 1) / 8);
        b.tri([x, ySpr, ZB - 0.10], [x + Math.cos(a0) * (hw - 0.16), ySpr + Math.sin(a0) * (hw - 0.16), ZB - 0.10],
          [x + Math.cos(a1) * (hw - 0.16), ySpr + Math.sin(a1) * (hw - 0.16), ZB - 0.10], GLASS_W, M.window, NZ, NZ, NZ);
      }
      // stone mullion cross so the pane reads as a window, not as a louvre
      bx(b, x - 0.10, x + 0.10, yS + 0.14, ySpr + 1.45, ZB - 0.13, ZB - 0.09, MARBLE_HI, M.marbleHi);
      bx(b, x - hw + 0.16, x + hw - 0.16, 13.10, 13.30, ZB - 0.13, ZB - 0.09, MARBLE_HI, M.marbleHi);
      for (const sx of [-1, 1]) {
        bx(b, x + sx * 0.16, x + sx * 0.24, yS + 0.14, ySpr + 1.45, ZB - 0.15, ZB - 0.13, GOLD, M.gold);
        bx(b, x - hw + 0.16, x + hw - 0.16, 13.32 + (sx > 0 ? 0.20 : 0), 13.40 + (sx > 0 ? 0.20 : 0), ZB - 0.15, ZB - 0.13, GOLD, M.gold);
      }
      // stone architrave + gold bead + sill
      bandZ(b, x, ySpr, hw + 0.05, hw + 0.55, ZB - 0.34, ZB - 0.02, 0, Math.PI, 9, MARBLE_HI, M.marbleHi, true, true);
      for (let i = 0; i < 9; i++) {
        const a0 = Math.PI * (i / 9), a1 = Math.PI * ((i + 1) / 9);
        b.quad([x + Math.cos(a0) * (hw + 0.10), ySpr + Math.sin(a0) * (hw + 0.10), ZB - 0.36], [x + Math.cos(a1) * (hw + 0.10), ySpr + Math.sin(a1) * (hw + 0.10), ZB - 0.36],
          [x + Math.cos(a1) * (hw + 0.22), ySpr + Math.sin(a1) * (hw + 0.22), ZB - 0.36], [x + Math.cos(a0) * (hw + 0.22), ySpr + Math.sin(a0) * (hw + 0.22), ZB - 0.36],
          GOLD, M.gold, NZ);
      }
      bx(b, x - hw - 0.42, x + hw + 0.42, yS - 0.24, yS, ZB - 0.62, ZB, MARBLE_HI, M.marbleHi, { topCol: MARBLE });
      bx(b, x - hw - 0.30, x + hw + 0.30, yS - 0.34, yS - 0.24, ZB - 0.56, ZB - 0.02, GOLD, M.gold);
      // moulded panel above the window
      bx(b, x - hw - 0.30, x + hw + 0.30, yAp + 0.20, 18.55, ZB - 0.16, ZB, MARBLE, M.marble);
      bx(b, x - hw - 0.20, x + hw + 0.20, yAp + 0.30, 18.45, ZB - 0.20, ZB - 0.16, GOLD, M.gold);
      // a bracket lamp under the sill
      bx(b, x - 0.20, x + 0.20, yS - 0.95, yS - 0.60, ZB - 0.75, ZB - 0.30, GOLD, M.gold);
    }
  }

  // ---- ground-storey aedicules with statues ------------------------------
  for (const s of [-1, 1]) {
    for (const cx of XBAY) {
      const x = s * cx;
      bx(b, x - 1.95, x + 1.95, 8.30, 9.05, ZB - 0.55, ZB, MARBLE, M.marble, { topCol: MARBLE_HI });
      bx(b, x - 2.10, x + 2.10, 9.05, 9.30, ZB - 0.70, ZB, MARBLE_HI, M.marbleHi, { topCol: MARBLE });
      // two small columns + entablature + pediment
      for (const sx of [-1, 1]) {
        const px = x + sx * 1.62;
        bx(b, px - 0.30, px + 0.30, 2.30, 2.62, ZB - 0.62, ZB - 0.05, MARBLE, M.marble);
        at(b, px, 0, ZB - 0.40, 0, () => {
          cylinder(b, 7, 0.26, 0.22, 3.90, MARBLE, M.marble, { y0: 2.62 });
        });
        bx(b, px - 0.34, px + 0.34, 6.52, 6.80, ZB - 0.55, ZB - 0.05, GOLD, M.gold);
      }
      bx(b, x - 1.95, x + 1.95, 6.80, 7.35, ZB - 0.60, ZB, MARBLE_HI, M.marbleHi, { topCol: MARBLE });
      bx(b, x - 1.50, x + 1.50, 7.35, 7.95, ZB - 0.50, ZB - 0.05, MARBLE, M.marble);
      qF(b, x - 1.50, x + 1.50, 7.60, 7.95, ZB - 0.52, GOLD, M.gold);
      // the statue itself
      pedestal(b, x, 2.30, ZB - 0.42, 1.5, 0.72, 1.05, MARBLE);
      figure(b, x, 3.02, ZB - 0.42, 1.16, Math.PI, MARBLE_HI, M.marble);
    }
    // garlands between the aedicules
    for (let i = 0; i < 3; i++) {
      const x0 = s * (XBAY[i] + 2.15), x1 = s * (i < 2 ? XBAY[i + 1] - 2.15 : 44.9);
      const n = 8;
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const xx = x0 + (x1 - x0) * t;
        const yy = 6.9 - Math.sin(Math.PI * t) * 0.55;
        b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, xx, yy, ZB - 0.30, 1]);
        ellipsoid(b, 0.20, 0.13, 0.12, 5, 3, k % 2 ? LEAF : LEAF_L, M.leaf);
        b.pop();
      }
    }
    // flower boxes on the plinth
    for (const cx of [17.6, 44.6]) {
      const x = s * cx;
      bx(b, x - 1.25, x + 1.25, 1.16, 1.95, 90.9, 91.9, MARBLE_SH, M.marble);
      bx(b, x - 1.35, x + 1.35, 1.95, 2.10, 90.85, 91.95, MARBLE_HI, M.marbleHi);
      const cols = [C.bloomPink, C.bloomRed, C.bloomYellow, C.bloomWhite];
      for (let i = 0; i < 9; i++) {
        const px = x + (((i % 3) / 2) - 0.5) * 1.7, pz = 91.1 + (Math.floor(i / 3) / 2) * 0.7;
        b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, px, 2.10 + (i % 3) * 0.09, pz, 1]);
        ellipsoid(b, 0.22, 0.18, 0.20, 5, 3, cols[i % cols.length], M.bloom);
        b.pop();
      }
    }
  }

  // ---- frieze band above the windows (kills the blank wall between the window
  // heads and the entablature; the central zone keeps its arch + keystone)
  for (const s of [-1, 1]) {
    const xa = s > 0 ? 15.2 : -XEDGE, xb = s > 0 ? XEDGE : -15.2;
    bx(b, xa, xb, 18.56, 18.76, ZB - 0.24, ZB, MARBLE_HI, M.marbleHi, { topCol: MARBLE });
    bx(b, xa, xb, 18.76, 18.86, ZB - 0.26, ZB - 0.18, GOLD, M.gold);
    bx(b, xa, xb, 19.72, 19.88, ZB - 0.30, ZB, MARBLE, M.marble);
    bx(b, xa, xb, 19.88, 19.98, ZB - 0.32, ZB - 0.24, GOLD, M.gold);
    for (let i = 0; i < 14; i++) {                       // dentils
      const dx0 = s > 0 ? 16.0 + i * 2.1 : -XEDGE + 0.4 + i * 2.1;
      bx(b, dx0, dx0 + 0.34, 19.44, 19.70, ZB - 0.26, ZB - 0.22, mulc(MARBLE_SH, 0.92), M.marbleSh);
    }
    for (const cx of XBAY) {                             // gold patera per bay
      b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, s * cx, 19.22, ZB - 0.28, 1]);
      ellipsoid(b, 0.42, 0.30, 0.12, 8, 4, GOLD, M.gold);
      b.pop();
    }
    // a relief shield over each window head
    for (const cx of XBAY) {
      const x = s * cx;
      bx(b, x - 1.0, x + 1.0, 18.90, 19.55, ZB - 0.30, ZB - 0.24, MARBLE, M.marble);
      bx(b, x - 0.62, x + 0.62, 19.02, 19.44, ZB - 0.34, ZB - 0.30, GOLD, M.gold);
    }
  }
  // ---- entablature -------------------------------------------------------
  // architrave
  bx(b, -XEDGE, XEDGE, L_ENT, 21.05, 90.95, 92.0, MARBLE, M.marble, { topCol: MARBLE_HI });
  bx(b, -XEDGE, XEDGE, 21.05, 21.22, 90.85, 92.0, GOLD, M.gold);
  // frieze with gold medallions
  bx(b, -XEDGE, XEDGE, 21.22, 22.12, 91.10, 92.0, MARBLE_HI, M.marbleHi);
  for (const s of [-1, 1]) {
    for (const cx of [10.4, ...XCOL.map((v) => v + 5.2)]) {
      const x = s * cx;
      if (Math.abs(x) > 45.2) continue;
      b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 21.67, 91.06, 1]);
      ellipsoid(b, 0.30, 0.34, 0.10, 7, 4, GOLD, M.gold);
      b.pop();
    }
  }
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 21.67, 91.04, 1]);
  ellipsoid(b, 0.85, 0.55, 0.14, 9, 5, GOLD_HI, M.goldHi);
  b.pop();
  // cornice (stepped out, with dentils)
  bx(b, -XEDGE, XEDGE, 22.12, 22.34, 90.80, 92.0, MARBLE_HI, M.marbleHi, { topCol: MARBLE });
  bx(b, -XEDGE, XEDGE, 22.34, 22.72, 90.35, 92.0, MARBLE, M.marble, { topCol: MARBLE_HI });
  bx(b, -XEDGE, XEDGE, 22.72, L_ATT, 90.22, 92.0, MARBLE_HI, M.marbleHi, { topCol: MARBLE });
  {
    const n = 56, pw = (XEDGE * 2) / n;
    for (let i = 0; i < n; i++) {
      const xa = -XEDGE + pw * i;
      bx(b, xa + pw * 0.28, xa + pw * 0.72, 22.34, 22.62, 90.30, 90.36, mulc(MARBLE_SH, 0.9), M.marbleSh);
    }
  }
  // ---- attic storey: blind balustrade + relief panels + crown -------------
  bx(b, -XEDGE, XEDGE, L_ATT, 26.0, 91.28, 92.0, STONE, M.stone, { topCol: STONE_HI });
  for (let i = 0; i < 22; i++) {         // flat baluster silhouettes
    const xa = -XEDGE + 0.5 + (i / 21) * (XEDGE * 2 - 1.0);
    if (Math.abs(xa) < 1.1) continue;
    bx(b, xa - 0.16, xa + 0.16, 24.15, 25.55, 91.22, 91.30, mulc(STONE_HI, 0.98), M.stoneHi);
  }
  bx(b, -XEDGE, XEDGE, 24.02, 24.18, 91.14, 91.30, MARBLE, M.marble);
  bx(b, -XEDGE, XEDGE, 25.52, 25.72, 91.12, 91.30, MARBLE_HI, M.marbleHi);
  for (const s of [-1, 1]) {
    for (const cx of [7.4, 20.6, 31.0, 40.2]) {     // attic relief panels / shields
      const x = s * cx;
      bx(b, x - 1.15, x + 1.15, 23.35, 23.95, 91.18, 91.30, MARBLE, M.marble);
      bx(b, x - 0.95, x + 0.95, 23.45, 23.85, 91.14, 91.20, GOLD, M.gold);
    }
  }
  bx(b, -XEDGE, XEDGE, 26.0, TOPY, 91.05, 92.0, MARBLE_HI, M.marbleHi, { topCol: STONE_HI });
  bx(b, -XEDGE, XEDGE, TOPY - 0.10, TOPY, 90.85, 92.0, GOLD, M.gold);

  // ---- great steps (5 risers to FY), lions, lamps, flags -----------------
  for (let i = 0; i < 5; i++) {
    const y1 = 0.18 * (i + 1);
    const z0 = 89.05 + 0.5 * i, z1 = 89.05 + 0.5 * (i + 1);
    bx(b, -14.6, 14.6, 0, y1, z0, z1, i % 2 ? MARBLE : MARBLE_HI, M.marble, { topCol: MARBLE_HI });
    // red runner on the tread
    qYp(b, y1 + 0.012, -3.6, 3.6, z0, z1, RED, M.carpet);
    qF(b, -3.6, 3.6, y1 - 0.18, y1 - 0.012, z0 + 0.012, RED_D, M.carpet);
    // gold nosing
    bx(b, -14.6, 14.6, y1 - 0.035, y1, z0, z0 + 0.07, GOLD, M.gold);
  }
  // cheek blocks flanking the flight
  for (const s of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const y1 = 0.18 * (i + 1), z0 = 89.05 + 0.5 * i, z1 = 89.05 + 0.5 * (i + 1);
      const xa = s > 0 ? 14.6 : -15.5, xb = s > 0 ? 15.5 : -14.6;
      bx(b, xa, xb, 0, y1 + 0.30, z0, z1, MARBLE, M.marble, { topCol: MARBLE_HI });
    }
  }
  lion(b, -9.6, 0, 87.55, -0.22, 1.05, MARBLE_HI);
  lion(b, 9.6, 0, 87.55, 0.22, 1.05, MARBLE_HI);
  for (const s of [-1, 1]) {
    // lamp standard
    const x = s * 13.3, z = 87.5;
    bx(b, x - 0.42, x + 0.42, 0, 0.34, z - 0.42, z + 0.42, MARBLE_SH, M.marble);
    bx(b, x - 0.34, x + 0.34, 0.34, 0.52, z - 0.34, z + 0.34, MARBLE, M.marble);
    at(b, x, 0, z, 0, () => {
      cylinder(b, 7, 0.15, 0.11, 3.5, MARBLE_HI, M.marble, { y0: 0.52 });
      cylinder(b, 6, 0.30, 0.24, 0.72, mixc(C.cloudLit, C.sunGlow, 0.35), M.window, { y0: 4.0 });
      cylinder(b, 6, 0.32, 0.32, 0.10, GOLD, M.gold, { y0: 3.94 });
      cylinder(b, 6, 0.28, 0.34, 0.16, GOLD, M.gold, { y0: 4.72 });
      cylinder(b, 6, 0.30, 0.02, 0.30, mixc(C.copper, GOLD, 0.5), M.gold, { y0: 4.88 });
    });
    if (ctx && ctx.points) ctx.points.push({ p: [x, 4.5, z], col: mixc(C.sunGlow, GOLD_HI, 0.45), range: 26, int: 0.75 });
    if (ctx && ctx.lanterns) ctx.lanterns.push({ p: [x, 4.4, z], size: 2.2, rot: 0, alpha: 0.45, shape: 1, col: mixc(C.sunGlow, GOLD_HI, 0.5) });
    // flags on the columns
    for (const cx of [25.9, 36.3]) {
      const fx = s * cx;
      banner(b, fx, 19.9, 89.42, 2.5, 7.1, RED, mixc(RED, GOLD, 0.22));
      bar3(b, [fx - 1.4, 20.0, 89.45], [fx + 1.4, 20.0, 89.45], 0.11, 0.11, GOLD, M.gold);
    }
  }

  // ---- city-side lights --------------------------------------------------
  if (ctx && ctx.points) {
    ctx.points.push({ p: [-10, 6.0, 89.0], col: mixc(C.sunGlow, GOLD_HI, 0.40), range: 34, int: 0.80 });
    ctx.points.push({ p: [10, 6.0, 89.0], col: mixc(C.sunGlow, GOLD_HI, 0.40), range: 34, int: 0.80 });
    ctx.points.push({ p: [0, 13.0, 90.0], col: mixc(C.sunGlow, C.cloudLit, 0.45), range: 30, int: 0.62 });
  }
  if (ctx && ctx.lanterns) {
    for (const cx of XBAY) {
      for (const s of [-1, 1]) {
        ctx.lanterns.push({ p: [s * cx, 6.6, 90.6], size: 1.5, rot: 0, alpha: 0.38, shape: 1, col: mixc(C.sunGlow, GOLD_HI, 0.55) });
      }
    }
  }
  void R;
}

// =====================================================================
// 2. THE ENTRANCE TUNNEL (z 92.6 .. 96.4)
// =====================================================================
function buildTunnel(b, ctx, R) {
  const vR = 11.85;                        // my coffered vault radius (existing 12.2)
  // floor slab + threshold
  bx(b, -12.0, 12.0, -0.20, FY, 90.9, 96.45, I_MARB, MI.marble, { topCol: I_MARBHI });
  // marble pavement pattern + red carpet on the threshold
  qYp(b, FY + 0.006, -11.9, 11.9, 91.0, 96.44, I_MARBHI, MI.marbleHi);
  for (const s of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const z0 = 91.4 + i * 0.82;
      qYp(b, FY + 0.012, s > 0 ? 1.9 : -11.9, s > 0 ? 11.9 : -1.9, z0, z0 + 0.82, i % 2 ? I_MARB : FLOOR_B, MI.marble);
    }
  }
  qYp(b, FY + 0.016, -3.7, 3.7, 90.95, 96.44, RED, MI.cloth);
  for (const s of [-1, 1]) {
    qYp(b, FY + 0.020, s * 3.7 - 0.14, s * 3.7 + 0.14, 91.0, 96.44, GOLD, MI.gold);
  }
  // coffered barrel vault (semicylinder at r = vR about y = SPR)
  {
    const seg = 22, z0 = 92.55, z1 = 96.38;
    for (let i = 0; i < seg; i++) {
      const a0 = Math.PI * (i / seg), a1 = Math.PI * ((i + 1) / seg);
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const p0 = [c0 * vR, SPR + s0 * vR], p1 = [c1 * vR, SPR + s1 * vR];
      const am = (a0 + a1) * 0.5;
      const cc = i % 2 ? I_MARBHI : I_MARB;
      b.quad([p0[0], p0[1], z0], [p1[0], p1[1], z0], [p1[0], p1[1], z1], [p0[0], p0[1], z1], cc, MI.marble,
        [-Math.cos(am) * 0.55, -Math.sin(am) * 0.55, -0.05]);
      // gold transverse rib
      b.quad([p0[0], p0[1], z0], [p0[0], p0[1], z0 + 0.16], [p1[0], p1[1], z0 + 0.16], [p1[0], p1[1], z0],
        GOLD, MI.gold, [-Math.cos(am), -Math.sin(am), 0]);
      b.quad([p0[0], p0[1], z1 - 0.16], [p0[0], p0[1], z1], [p1[0], p1[1], z1], [p1[0], p1[1], z1 - 0.16],
        GOLD, MI.gold, [-Math.cos(am), -Math.sin(am), 0]);
    }
    // rib bands at intervals across the tunnel
    for (const zz of [93.2, 94.4, 95.6]) {
      for (let i = 0; i < seg; i++) {
        const a0 = Math.PI * (i / seg), a1 = Math.PI * ((i + 1) / seg);
        const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
        const am = (a0 + a1) * 0.5;
        const r2 = vR - 0.24;
        b.quad([c0 * vR, SPR + s0 * vR, zz], [c1 * vR, SPR + s1 * vR, zz],
          [c1 * r2, SPR + s1 * r2, zz], [c0 * r2, SPR + s0 * r2, zz], GOLD, MI.gold,
          [Math.cos(am), Math.sin(am), 0]);
      }
    }
    // closure above the arch (hides the 0.4 m slot between the support wall and the podium)
    bx(b, -12.3, 12.3, 16.95, 23.5, 95.55, 96.05, STONE, M.stone);
  }
  // jamb wainscot + torches
  for (const s of [-1, 1]) {
    bx(b, s > 0 ? 11.62 : -12.19, s > 0 ? 12.19 : -11.62, FY, 4.6, 92.62, 96.4, I_MARB, MI.marble, { topCol: I_MARBHI });
    bx(b, s > 0 ? 11.55 : -12.19, s > 0 ? 12.19 : -11.55, 4.5, 4.66, 92.62, 96.4, GOLD, MI.gold);
    for (const zz of [93.4, 95.2]) {
      const xx = s * 11.85;
      bx(b, xx - 0.22, xx + 0.22, 3.7, 4.1, zz - 0.30, zz + 0.30, GOLD, MI.gold);
      if (ctx && ctx.lanterns) ctx.lanterns.push({ p: [s * 11.5, 3.95, zz], size: 1.35, rot: 0, alpha: 0.55, shape: 1, col: mixc(C.sunGlow, GOLD_HI, 0.55) });
    }
  }
  // soldier statues just inside the tunnel? (the pair live in the hall, see below)
  if (ctx && ctx.points) {
    ctx.points.push({ p: [0, 4.2, 94.4], col: mixc(C.sunGlow, GOLD_HI, 0.45), range: 22, int: 0.75 });
  }
  void R;
}

// =====================================================================
// 3. THE GRAND ENTRANCE HALL
// =====================================================================
function buildHall(b, ctx, R) {
  hallFloor(b, R);
  naveStructure(b, R);
  ceiling(b, ctx, R);
  sideWalls(b, ctx, R);
  backWallAndGallery(b, ctx, R);
  frontWall(b, ctx, R);
  stairs(b, R);
  fountain(b, ctx, R);
  furniture(b, ctx, R);
  hallLights(ctx);
}

// ---- floor: marble field, inlay band, carpet, medallion -------------------
function hallFloor(b, R) {
  bx(b, -40.35, 40.35, -0.3, FY, 96.3, 122.5, I_MARBSH, MI.marble, { topCol: I_MARB });
  const y = FY + 0.004;
  // field tiles
  const NX = 16, NZ = 10;
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      const x0 = -36.4 + (72.8 * i) / NX, x1 = -36.4 + (72.8 * (i + 1)) / NX;
      const z0 = 98.6 + (21.6 * j) / NZ, z1 = 98.6 + (21.6 * (j + 1)) / NZ;
      const tone = 0.96 + 0.05 * (((i * 5 + j * 3) % 4) / 3);
      const cc = (i + j) % 2 ? mulc(FLOOR_A, tone) : mulc(FLOOR_B, 0.92 + 0.05 * tone);
      qYp(b, y, x0 + 0.02, x1 - 0.02, z0 + 0.02, z1 - 0.02, cc, MI.marble);
    }
  }
  // border band + skirting shadow
  for (const [a0, a1] of [[-40.1, -36.4], [36.4, 40.1]]) {
    qYp(b, y, a0, a1, 96.45, 122.45, mulc(FLOOR_B, 0.94), MI.marble);
    qYp(b, y + 0.004, a0 + 0.25, a1 - 0.25, 96.7, 122.25, mulc(I_MARBSH, 0.92), MI.marble);
    qYp(b, y + 0.008, a0 + 0.55, a1 - 0.55, 97.0, 122.0, GOLD, MI.gold);
  }
  for (const [z0, z1] of [[96.45, 98.6], [120.2, 122.45]]) {
    qYp(b, y, -40.1, 40.1, z0, z1, mulc(FLOOR_B, 0.94), MI.marble);
    qYp(b, y + 0.004, -39.8, 39.8, z0 + 0.25, z1 - 0.25, mulc(I_MARBSH, 0.92), MI.marble);
    qYp(b, y + 0.008, -39.5, 39.5, z0 + 0.55, z1 - 0.55, GOLD, MI.gold);
  }
  // central medallion around the fountain
  const cx = HALL.pond.x, cz = HALL.pond.z;
  for (const [r0, r1, cc, mm] of [[7.6, 8.2, GOLD, MI.gold], [6.0, 7.6, mulc(FLOOR_A, 0.94), MI.marble],
    [5.2, 6.0, mulc(FLOOR_G, 0.9), MI.marble], [4.9, 5.2, GOLD_HI, MI.goldHi]]) {
    for (let i = 0; i < 40; i++) {
      const a0 = (i / 40) * TAU, a1 = ((i + 1) / 40) * TAU;
      b.quad([cx + Math.cos(a0) * r0, y + 0.010, cz + Math.sin(a0) * r0], [cx + Math.cos(a1) * r0, y + 0.010, cz + Math.sin(a1) * r0],
        [cx + Math.cos(a1) * r1, y + 0.010, cz + Math.sin(a1) * r1], [cx + Math.cos(a0) * r1, y + 0.010, cz + Math.sin(a0) * r1],
        cc, mm, UPV);
    }
  }
  // star rays in the medallion
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    const w = 0.12;
    b.quad([cx + Math.cos(a) * 5.4 - Math.sin(a) * w, y + 0.014, cz + Math.sin(a) * 5.4 + Math.cos(a) * w],
      [cx + Math.cos(a) * 5.4 + Math.sin(a) * w, y + 0.014, cz + Math.sin(a) * 5.4 - Math.cos(a) * w],
      [cx + Math.cos(a) * 7.4 + Math.sin(a) * w * 0.3, y + 0.014, cz + Math.sin(a) * 7.4 - Math.cos(a) * w * 0.3],
      [cx + Math.cos(a) * 7.4 - Math.sin(a) * w * 0.3, y + 0.014, cz + Math.sin(a) * 7.4 + Math.cos(a) * w * 0.3],
      GOLD, MI.gold, UPV);
  }
  // red carpet on the axis (split around the fountain)
  for (const [z0, z1] of [[96.5, 102.4], [111.6, 118.4]]) {
    qYp(b, FY + 0.02, -3.7, 3.7, z0, z1, RED, MI.cloth);
    for (const s of [-1, 1]) qYp(b, FY + 0.024, s * 3.7 - 0.16, s * 3.7 + 0.16, z0, z1, GOLD, MI.gold);
  }
  // marble skirting around the hall
  const sk = 0.26;
  for (const s of [-1, 1]) {
    bx(b, s > 0 ? HX - sk : -HX, s > 0 ? HX : -HX + sk, FY, 2.15, 96.4, HZ1, I_MARBSH, MI.marble, { topCol: I_MARB });
    bx(b, s * (HX - sk) - 0.06, s * (HX - sk) + 0.06, 2.0, 2.15, 96.4, HZ1, GOLD, MI.gold);
  }
  bx(b, -HX, HX, FY, 2.15, HZ1 - sk, HZ1, I_MARBSH, MI.marble, { topCol: I_MARB });
  bx(b, -HX, HX, 2.0, 2.15, HZ1 - sk - 0.06, HZ1 - sk, GOLD, MI.gold);
  void R;
}

// ---- nave: columns, arcade, clerestory, entablature ----------------------
function naveStructure(b, R) {
  const spans = [];
  const zs = [HZ0 + 0.3, ...COLZ, HZ1 - 0.3];
  for (let i = 0; i < zs.length - 1; i++) spans.push([zs[i], zs[i + 1]]);
  for (const s of [-1, 1]) {
    const X = s * COLX;
    // columns
    for (const cz of COLZ) {
      bx(b, X - 1.35, X + 1.35, FY, FY + 0.42, cz - 1.35, cz + 1.35, I_MARBSH, MI.marble, { topCol: I_MARB });
      bx(b, X - 1.22, X + 1.22, FY + 0.42, FY + 0.62, cz - 1.22, cz + 1.22, I_MARBHI, MI.marbleHi);
      at(b, X, 0, cz, 0, () => {
        cylinder(b, 12, 1.02, 0.86, 12.98, mulc(I_MARB, 0.90), MI.marble, { y0: FY + 0.62 });
        cylinder(b, 12, 1.045, 1.045, 0.12, GOLD, MI.gold, { y0: FY + 0.70 });
        cylinder(b, 9, 0.40, 0.40, 0.10, GOLD, MI.gold, { y0: FY + 0.74 });
        cylinder(b, 12, 0.86, 0.86, 0.10, GOLD, MI.gold, { y0: 13.58 });
        // capital
        cylinder(b, 12, 0.98, 1.24, 0.42, GOLD, MI.gold, { y0: 13.68 });
        cylinder(b, 12, 1.30, 1.30, 0.26, I_MARBHI, MI.marbleHi, { y0: 14.10 });
      });
      for (let i = 0; i < 4; i++) {            // volute leaves
        const a = (i / 4) * TAU + Math.PI / 4;
        b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, X + Math.cos(a) * 1.18, 14.03, cz + Math.sin(a) * 1.18, 1]);
        ellipsoid(b, 0.20, 0.15, 0.20, 5, 3, GOLD_HI, MI.goldHi);
        b.pop();
      }
      bx(b, X - 1.42, X + 1.42, 14.36, 14.62, cz - 1.42, cz + 1.42, I_MARBHI, MI.marbleHi, { topCol: I_MARB });
    }
    // arcade: arches + spandrels + entablature in the plane x = X
    const spring = 14.62, topY = 17.2;
    for (const [za, zb] of spans) {
      const zc = (za + zb) / 2, half = (zb - za) / 2, seg = 10;
      const sgn = s;                      // the hall is on the -s side of this wall
      for (let i = 0; i < seg; i++) {
        const a0 = (Math.PI * i) / seg, a1 = (Math.PI * (i + 1)) / seg;
        const p0z = zc + Math.cos(a0) * half, p0y = spring + Math.sin(a0) * half;
        const p1z = zc + Math.cos(a1) * half, p1y = spring + Math.sin(a1) * half;
        // spandrel above the extrados up to the entablature (a real fan, not a step)
        b.quad([X, p0y, p0z], [X, p1y, p1z], [X, topY, p1z], [X, topY, p0z], I_MARB, MI.marble, [sgn, 0, 0]);
        // archivolt: 0.55 wide band on the room side of the arch
        const r1 = half - 0.55;
        const q0z = zc + Math.cos(a0) * r1, q0y = spring + Math.sin(a0) * r1;
        const q1z = zc + Math.cos(a1) * r1, q1y = spring + Math.sin(a1) * r1;
        const am = (a0 + a1) * 0.5;
        const xf = X - sgn * 0.46;
        b.quad([xf, p0y, p0z], [xf, q0y, q0z], [xf, q1y, q1z], [xf, p1y, p1z],
          GOLD, MI.gold, [sgn, -Math.sin(am) * 0.5, -Math.cos(am) * 0.5]);
        // arch soffit (intrados) between the two faces of the arcade wall
        b.quad([X - sgn * 0.46, q0y, q0z], [X - sgn * 0.46, q1y, q1z], [X + sgn * 0.46, q1y, q1z], [X + sgn * 0.46, q0y, q0z],
          mulc(I_MARBSH, 0.92), MI.marbleSh, [0, -Math.sin(am), -Math.cos(am)]);
        // rear face of the arcade wall
        b.quad([X + sgn * 0.46, p0y, p0z], [X + sgn * 0.46, p1y, p1z], [X + sgn * 0.46, topY, p1z], [X + sgn * 0.46, topY, p0z],
          mulc(I_MARB, 0.9), MI.marble, [-sgn, 0, 0]);
      }
      // gold keystone
      bx(b, Math.min(X - sgn * 0.62, X - sgn * 0.30), Math.max(X - sgn * 0.62, X - sgn * 0.30),
        spring + half - 0.30, spring + half + 0.62, zc - 0.34, zc + 0.34, GOLD_HI, MI.goldHi);
    }
    // entablature over the arcade
    bx(b, X - 0.62, X + 0.62, 17.2, 17.9, HZ0 + 0.2, HZ1 - 0.2, I_MARB, MI.marble, { topCol: I_MARBHI });
    bx(b, X - 0.70, X + 0.70, 17.9, 18.30, HZ0 + 0.2, HZ1 - 0.2, GOLD, MI.gold);
    bx(b, X - 0.58, X + 0.58, 18.30, 18.62, HZ0 + 0.2, HZ1 - 0.2, I_MARBHI, MI.marbleHi);
    // clerestory: a solid marble attic wall with glowing arched windows on the room side
    bx(b, X - 0.44, X + 0.44, 18.62, CEILP + 0.30, HZ0 + 0.2, HZ1 - 0.2, I_MARB, MI.marble, { topCol: I_MARBHI });
    for (const [za, zb] of spans) {
      const zc = (za + zb) / 2, hw = Math.min(1.60, (zb - za) * 0.25);
      const yS2 = 19.75;
      const xf = X - s * 0.46;                 // pane on the hall side of the wall
      qSide(b, s, xf, zc - hw, zc + hw, yS2, yS2 + hw * 0.55, I_GLASS, MI.glass);
      for (let i = 0; i < 7; i++) {
        const a0 = Math.PI * (i / 7), a1 = Math.PI * ((i + 1) / 7);
        const N = s > 0 ? NX : PX;
        b.tri([xf, yS2, zc], [xf, yS2 + Math.sin(a0) * hw, zc + Math.cos(a0) * hw],
          [xf, yS2 + Math.sin(a1) * hw, zc + Math.cos(a1) * hw], I_GLASS, MI.glass, N, N, N);
        // gold frame around the arch
        b.quad([xf - s * 0.04, yS2 + Math.sin(a0) * hw, zc + Math.cos(a0) * hw],
          [xf - s * 0.04, yS2 + Math.sin(a1) * hw, zc + Math.cos(a1) * hw],
          [xf - s * 0.04, yS2 + Math.sin(a1) * (hw + 0.18), zc + Math.cos(a1) * (hw + 0.18)],
          [xf - s * 0.04, yS2 + Math.sin(a0) * (hw + 0.18), zc + Math.cos(a0) * (hw + 0.18)], GOLD, MI.gold, N);
      }
      for (const sx of [-1, 1]) {             // gold jambs
        bx(b, xf - 0.04, xf + 0.05, yS2 - 0.30, yS2 + hw * 0.55, zc + sx * hw - 0.10, zc + sx * hw + 0.10, GOLD, MI.gold);
      }
      bx(b, Math.min(xf - 0.05, xf + 0.05), Math.max(xf - 0.05, xf + 0.05), yS2 - 0.34, yS2 - 0.18,
        zc - hw - 0.22, zc + hw + 0.22, I_MARBHI, MI.marbleHi);
    }
  }
}

// ---- ceiling: coffered plane, painted star ring, skylight well ----------
function ceiling(b, ctx, R) {
  const cz = 109.4, rx = 13.5, rz = 10.0, seg = 24;
  const ry = 23.5;                       // luminous skylight panel height
  const CEIL_D = mulc(mixc(I_WALLHI, C.sunGlow, 0.28), 0.82);   // the ceiling reads darker but stays warm
  // 1. aisle ceilings: coffers with gold rosettes
  for (const s of [-1, 1]) {
    const xa = s > 0 ? COLX + 0.7 : -HX, xb = s > 0 ? HX : -COLX - 0.7;
    for (let j = 0; j < 7; j++) {
      for (let i = 0; i < 5; i++) {
        const x0 = xa + ((xb - xa) * i) / 5, x1 = xa + ((xb - xa) * (i + 1)) / 5;
        const z0 = HZ0 + 0.3 + ((HZ1 - HZ0 - 0.6) * j) / 7, z1 = HZ0 + 0.3 + ((HZ1 - HZ0 - 0.6) * (j + 1)) / 7;
        const cxm = (x0 + x1) / 2, czm = (z0 + z1) / 2;
        // coffer frame then a recessed darker field
        qYn(b, CEILP, x0 + 0.03, x1 - 0.03, z0 + 0.03, z1 - 0.03, mulc(CEIL_D, (i + j) % 2 ? 0.94 : 1.0), MI.wallHi);
        qYn(b, CEILP - 0.02, x0 + 0.34, x1 - 0.34, z0 + 0.34, z1 - 0.34, mulc(CEIL_D, 0.80), MI.wall);
        // gold rod frame around the field
        bx(b, x0 + 0.16, x1 - 0.16, CEILP - 0.06, CEILP - 0.02, z0 + 0.14, z0 + 0.20, I_GOLDD, MI.gold);
        bx(b, x0 + 0.16, x1 - 0.16, CEILP - 0.06, CEILP - 0.02, z1 - 0.20, z1 - 0.14, I_GOLDD, MI.gold);
        bx(b, x0 + 0.14, x0 + 0.20, CEILP - 0.06, CEILP - 0.02, z0 + 0.16, z1 - 0.16, I_GOLDD, MI.gold);
        bx(b, x1 - 0.20, x1 - 0.14, CEILP - 0.06, CEILP - 0.02, z0 + 0.16, z1 - 0.16, I_GOLDD, MI.gold);
        b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, cxm, CEILP - 0.04, czm, 1]);
        ellipsoid(b, 0.26, 0.10, 0.26, 6, 3, GOLD, MI.gold);
        b.pop();
      }
    }
  }
  // 2. nave ceiling: painted blue star ring between the well and the nave rectangle
  const EP = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * TAU;
    EP.push([Math.cos(a) * rx, cz + Math.sin(a) * rz]);
  }
  const rect = (x, z) => {
    const dx = x / (COLX - 0.7), dz = (z - cz) / ((HZ1 - HZ0) / 2 - 0.3);
    const k = 1 / Math.max(Math.abs(dx), Math.abs(dz), 1e-6);
    return [x * k, cz + (z - cz) * k];
  };
  for (let i = 0; i < seg; i++) {
    const p0 = EP[i], p1 = EP[(i + 1) % seg];
    const o0 = rect(p0[0], p0[1]), o1 = rect(p1[0], p1[1]);
    // outer stone band of the ring
    const m0 = [p0[0] * 1.18, cz + (p0[1] - cz) * 1.18];
    const m1 = [p1[0] * 1.18, cz + (p1[1] - cz) * 1.18];
    b.quad([o0[0], CEILP, o0[1]], [o1[0], CEILP, o1[1]], [m1[0], CEILP, m1[1]], [m0[0], CEILP, m0[1]],
      mulc(CEIL_D, i % 2 ? 0.94 : 1.0), MI.wallHi, DNV);
    // deep-blue painted band with gold stars
    b.quad([m0[0], CEILP - 0.01, m0[1]], [m1[0], CEILP - 0.01, m1[1]], [p1[0], CEILP - 0.01, p1[1]], [p0[0], CEILP - 0.01, p0[1]],
      I_BLUE, MI.wall, DNV);
    if (i % 2 === 0) {
      const sm = [(m0[0] + m1[0]) / 2, (m0[1] + m1[1]) / 2];
      const sv = [sm[0] * 0.88, cz + (sm[1] - cz) * 0.88];
      const ux = (sm[0] - sv[0]) * 0.42, uz = (sm[1] - sv[1]) * 0.42;
      const wx = -(sm[1] - sv[1]) * 0.42, wz = (sm[0] - sv[0]) * 0.42;
      b.quad([sv[0] + ux, CEILP - 0.02, sv[1] + uz], [sv[0] - ux + wx, CEILP - 0.02, sv[1] - uz + wz],
        [sv[0] - ux - wx, CEILP - 0.02, sv[1] - uz - wz], [sv[0] + ux - wx, CEILP - 0.02, sv[1] + uz - wz],
        GOLD_HI, MI.goldHi, DNV);
    }
    // fascia ring from the ceiling plane up to the luminous panel
    b.quad([p0[0], CEILP, p0[1]], [p1[0], CEILP, p1[1]], [p1[0], ry, p1[1]], [p0[0], ry, p0[1]],
      I_GOLDD, MI.gold, [-Math.cos(((i + 0.5) / seg) * TAU), 0, Math.sin(((i + 0.5) / seg) * TAU)]);
    // luminous panel: pale gold at the centre fading to pale sky at the rim
    b.tri([0, ry, cz], [p0[0], ry, p0[1]], [p1[0], ry, p1[1]], mixc(C.sunGlow, GOLD_HI, 0.30), M.glowS, DNV, DNV, DNV);
    b.tri([p0[0], ry, p0[1]], [p1[0], ry, p1[1]], [p0[0] * 1.24, ry, cz + (p0[1] - cz) * 1.24],
      mixc(C.horizon, C.glass, 0.35), M.glowS, DNV, DNV, DNV);
    b.tri([p0[0] * 1.24, ry, cz + (p0[1] - cz) * 1.24], [p1[0], ry, p1[1]], [p1[0] * 1.24, ry, cz + (p1[1] - cz) * 1.24],
      mixc(C.horizon, C.glassSky || C.horizon, 0.30), M.glowS, DNV, DNV, DNV);
  }
  // outer gold rim of the well
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    b.quad([c0 * (rx + 0.55), CEILP - 0.06, cz + s0 * (rz + 0.55)], [c1 * (rx + 0.55), CEILP - 0.06, cz + s1 * (rz + 0.55)],
      [c1 * rx, CEILP, cz + s1 * rz], [c0 * rx, CEILP, cz + s0 * rz], GOLD_HI, MI.goldHi, DNV);
  }
  // skylight grille: radial gold ribs + two concentric rings
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU + 0.06;
    const c = Math.cos(a), s = Math.sin(a);
    const w = 0.10;
    b.quad([c * 0.35 - s * w, ry - 0.03, cz + s * 0.35 + c * w], [c * rx - s * w, ry - 0.03, cz + s * rz + c * w],
      [c * rx + s * w, ry - 0.03, cz + s * rz - c * w], [c * 0.35 + s * w, ry - 0.03, cz + s * 0.35 - c * w],
      I_GOLDD, MI.gold, DNV);
  }
  for (const k of [0.42, 0.78]) {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const w = 0.12;
      b.quad([c0 * rx * k, ry - 0.03, cz + s0 * rz * k], [c1 * rx * k, ry - 0.03, cz + s1 * rz * k],
        [c1 * (rx * k + w), ry - 0.03, cz + s1 * (rz * k + w)], [c0 * (rx * k + w), ry - 0.03, cz + s0 * (rz * k + w)],
        I_GOLDD, MI.gold, DNV);
    }
  }
  // 3. beams: transverse over the nave + longitudinal over the aisles
  for (const zz of COLZ) {
    bx(b, -COLX - 0.6, COLX + 0.6, CEILP - 0.48, CEILP, zz - 0.30, zz + 0.30, I_MARBSH, MI.marbleSh, { topCol: I_MARB });
    bx(b, -COLX - 0.6, COLX + 0.6, CEILP - 0.56, CEILP - 0.46, zz - 0.36, zz + 0.36, GOLD, MI.gold);
    bx(b, -COLX - 0.6, COLX + 0.6, CEILP - 0.10, CEILP - 0.02, zz - 0.22, zz + 0.22, I_GOLDD, MI.gold);
  }
  for (const s of [-1, 1]) {
    bx(b, s * COLX - 0.5, s * COLX + 0.5, CEILP - 0.44, CEILP, HZ0 + 0.3, HZ1 - 0.3, I_MARBSH, MI.marbleSh);
    bx(b, s * 31 - 0.35, s * 31 + 0.35, CEILP - 0.34, CEILP, HZ0 + 0.3, HZ1 - 0.3, I_MARB, MI.marble);
  }
  // 4. cornice band where the ceiling meets the walls
  for (const s of [-1, 1]) {
    bx(b, s > 0 ? HX - 0.55 : -HX, s > 0 ? HX : -HX + 0.55, CEILP - 0.05, CEILP + 0.4, HZ0 + 0.2, HZ1 - 0.2, I_MARBHI, MI.marbleHi);
    bx(b, s > 0 ? HX - 0.66 : -HX, s > 0 ? HX : -HX + 0.66, CEILP - 0.35, CEILP - 0.05, HZ0 + 0.2, HZ1 - 0.2, GOLD, MI.gold);
  }
  bx(b, -HX, HX, CEILP - 0.05, CEILP + 0.4, HZ1 - 0.55, HZ1, I_MARBHI, MI.marbleHi);
  bx(b, -HX, HX, CEILP - 0.35, CEILP - 0.05, HZ1 - 0.62, HZ1 - 0.55, GOLD, MI.gold);
  bx(b, -HX, HX, CEILP - 0.05, CEILP + 0.4, HZ0, HZ0 + 0.45, I_MARBHI, MI.marbleHi);
  void R;
}

// ---- side walls: pilasters, blind arches, niches, paintings, banners -----
function sideWalls(b, ctx, R) {
  const pilZ = [98.6, 104.2, 109.8, 115.4];
  const bays = [[98.6, 104.2], [104.2, 109.8], [109.8, 115.4]];
  for (const s of [-1, 1]) {
    // wall field
    qSide(b, s, s * SXW, HZ0, HZ1, FY, CEILP + 0.4, s > 0 ? I_WALL : mulc(I_WALL, 0.99), MI.marble);
    // dado
    bx(b, s > 0 ? SXW : -HX, s > 0 ? HX : -SXW, FY, 2.15, HZ0, HZ1, I_MARBSH, MI.marble, { topCol: I_MARB });
    // wall base shadow + gold line
    bx(b, s > 0 ? SXW - 0.12 : -HX, s > 0 ? HX : -SXW + 0.12, 2.15, 2.30, HZ0, HZ1, GOLD, MI.gold);
    // pilasters
    for (const pz of [...pilZ, 121.2]) {
      bx(b, s > 0 ? SXW - 0.52 : -HX, s > 0 ? HX : -SXW + 0.52, FY, 20.6, pz - 0.62, pz + 0.62, mixc(I_MARBHI, I_MARB, 0.5), MI.marbleHi);
      bx(b, s > 0 ? SXW - 0.60 : -HX, s > 0 ? HX : -SXW + 0.60, 19.9, 20.6, pz - 0.78, pz + 0.78, GOLD, MI.gold);
      bx(b, s > 0 ? SXW - 0.60 : -HX, s > 0 ? HX : -SXW + 0.60, FY, 2.15, pz - 0.78, pz + 0.78, I_MARB, MI.marble);
    }
    // bays: blind arch, statue niche, painting, sconce
    for (let bi = 0; bi < bays.length; bi++) {
      const [za, zb] = bays[bi], zc = (za + zb) / 2;
      // blind arch band
      const hw = (zb - za) / 2 - 0.75, spring = 13.9;
      for (let i = 0; i < 8; i++) {
        const a0 = Math.PI * (i / 8), a1 = Math.PI * ((i + 1) / 8);
        const p0z = zc + Math.cos(a0) * hw, p0y = spring + Math.sin(a0) * hw;
        const p1z = zc + Math.cos(a1) * hw, p1y = spring + Math.sin(a1) * hw;
        const rr = hw + 0.34;
        const q0z = zc + Math.cos(a0) * rr, q0y = spring + Math.sin(a0) * rr;
        const q1z = zc + Math.cos(a1) * rr, q1y = spring + Math.sin(a1) * rr;
        b.quad([s * (SXW - 0.06), p0y, p0z], [s * (SXW - 0.06), p1y, p1z], [s * (SXW - 0.06), q1y, q1z], [s * (SXW - 0.06), q0y, q0z],
          bi % 2 ? I_MARBHI : I_MARB, MI.marbleHi, [-s, 0, 0]);
        // inner reveal of the arch (recessed 0.3)
        b.quad([s * (SXW - 0.06), p0y, p0z], [s * (SXW - 0.36), p0y, p0z], [s * (SXW - 0.36), p1y, p1z], [s * (SXW - 0.06), p1y, p1z],
          mulc(I_MARBSH, 0.92), MI.marbleSh, [0, -Math.sin((a0 + a1) / 2), -Math.cos((a0 + a1) / 2)]);
      }
      // niche recess + statue
      const nz0 = zc - 0.95, nz1 = zc + 0.95;
      if (bi !== 1) {
        qSide(b, s, s * (SXW - 0.05), nz0, nz1, 2.3, 7.9, mulc(I_BLUE, 0.90), MI.wall);
        for (const [za2, zb2] of [[nz0, nz0 + 0.14], [nz1 - 0.14, nz1]]) {
          qSide(b, s, s * (SXW - 0.02), za2, zb2, 2.3, 7.9, I_MARBSH, MI.marbleSh);
        }
        bx(b, s > 0 ? SXW - 0.45 : -HX, s > 0 ? HX : -SXW + 0.45, 2.3, 2.55, nz0 - 0.2, nz1 + 0.2, I_MARBHI, MI.marbleHi);
        pedestal(b, s * (SXW - 0.40), 2.55, zc, 1.40, 0.72, 1.30, I_MARB);
        at(b, s * (SXW - 0.40), 3.27, zc, 0, () => {
          figure(b, 0, 0, 0, 1.12, s > 0 ? -Math.PI / 2 : Math.PI / 2, I_MARBHI, MI.marble);
        });
        // gold crown + shelf over the niche
        bx(b, s > 0 ? SXW - 0.30 : -HX, s > 0 ? HX : -SXW + 0.30, 7.9, 8.1, nz0 - 0.30, nz1 + 0.30, GOLD, MI.gold);
      } else {
        // gold-framed mirror + painting in this bay
        qSide(b, s, s * (SXW - 0.04), zc - 1.6, zc + 1.6, 3.2, 8.4, I_BLUEHI, M.mirror);
        frameX(b, s, SXW - 0.10, zc - 1.75, zc + 1.75, 3.05, 8.55, 0.16, GOLD_HI);
      }
      // painting above the arch
      painting(b, s, SXW - 0.10, zc - 1.35, zc + 1.35, 16.0, 19.8,
        mixc(C.horizon, C.haze, 0.55), mulc(mixc(C.leafDark, C.slate, 0.35), 0.86));
      // hanging banner (front bays only) — a red-gold tapestry
      if (bi !== 1) banner(b, s * (SXW - 0.55), 21.6, zc, 2.4, 8.6, I_BLUE, mulc(mixc(I_BLUE, GOLD, 0.35), 0.95));
      // sconce
      if (ctx && ctx.lanterns) {
        ctx.lanterns.push({ p: [s * (SXW - 0.55), 10.4, zc], size: 1.5, rot: 0, alpha: 0.5, shape: 1, col: mixc(C.sunGlow, GOLD_HI, 0.55) });
      }
      bx(b, s > 0 ? SXW - 0.55 : -HX, s > 0 ? HX : -SXW + 0.55, 10.05, 10.25, zc - 0.22, zc + 0.22, GOLD, MI.gold);
    }
    // wall top frieze (gold band under the ceiling cornice)
    bx(b, s > 0 ? SXW - 0.16 : -HX, s > 0 ? HX : -SXW + 0.16, 21.4, 22.4, HZ0, HZ1, GOLD, MI.gold);
    // alcove under the gallery (z 116.6..122.2): marble bench + niche
    bx(b, s > 0 ? SXW - 0.55 : -HX, s > 0 ? HX : -SXW + 0.55, FY, 1.55, HZ0 + 20.0, HZ1 - 0.3, I_MARB, MI.marble, { topCol: I_MARBHI });
    bx(b, s > 0 ? SXW - 0.62 : -HX, s > 0 ? HX : -SXW + 0.62, 1.55, 1.68, HZ0 + 19.9, HZ1 - 0.2, VELVET_B, MI.velvet);
  }
  void R;
}

// ---- round 8 helpers for the rear wall -----------------------------------
// Semicircular arch band on a vertical XY plane at z, normal -Z (into the hall).
function archBandH(b, cx, cy, r0, r1, z, seg, col, mat) {
  for (let i = 0; i < seg; i++) {
    const a0 = Math.PI * (i / seg), a1 = Math.PI * ((i + 1) / seg);
    b.quad([cx + Math.cos(a0) * r0, cy + Math.sin(a0) * r0, z], [cx + Math.cos(a1) * r0, cy + Math.sin(a1) * r0, z],
      [cx + Math.cos(a1) * r1, cy + Math.sin(a1) * r1, z], [cx + Math.cos(a0) * r1, cy + Math.sin(a0) * r1, z],
      col, mat, NZ);
  }
}
// v-jamb faces of a doorway (both sides, from the springing down to y0)
function doorJambs(b, cx, hx, y0, spring, zf, zBack, col, mat) {
  for (const sx of [-1, 1]) {
    const x = cx + sx * hx;
    b.quad([x, y0, zBack], [x, y0, zf], [x, spring, zf], [x, spring, zBack], col, mat, [-sx, 0, 0]);
  }
}
// back-wall wall field with arched openings, built as horizontal strips so the
// arch curves are followed exactly (no stepped openings).
function wallFieldArched(b, x0, x1, y0, y1, z, opens, colFn, matFn, segY) {
  const dy = segY || 0.26;
  for (let y = y0; y < y1 - 1e-6; y += dy) {
    const yb = Math.min(y1, y + dy), ym = (y + yb) * 0.5;
    const iv = [];
    for (const o of opens) {
      if (ym <= o.spring) { iv.push([o.cx - o.hx, o.cx + o.hx]); continue; }
      const rr = o.hx * o.hx - (ym - o.spring) * (ym - o.spring);
      if (rr <= 1e-4) continue;
      const hw = Math.sqrt(rr);
      iv.push([o.cx - hw, o.cx + hw]);
    }
    iv.sort((a, c) => a[0] - c[0]);
    const mg = [];
    for (const q of iv) {
      const last = mg[mg.length - 1];
      if (last && q[0] <= last[1] + 0.02) last[1] = Math.max(last[1], q[1]);
      else mg.push([q[0], q[1]]);
    }
    let x = x0;
    const spans = [];
    for (const q of mg) {
      if (q[0] > x + 1e-3) spans.push([x, Math.min(q[0], x1)]);
      x = Math.max(x, q[1]);
      if (x >= x1) break;
    }
    if (x < x1) spans.push([x, x1]);
    for (const [a, c] of spans) {
      if (c - a < 0.02) continue;
      b.quad([a, y, z], [c, y, z], [c, yb, z], [a, yb, z], colFn(ym, a, c), matFn(ym), NZ);
    }
  }
}

// ---- back wall + mezzanine gallery --------------------------------------
// Round 8: the wall's central statue niche is gone; in its place a 12 m arch and
// two side doors open into the palace's rear suite (src/palace-chambers.js). The
// mezzanine balcony still crosses the whole wall above them.
function backWallAndGallery(b, ctx, R) {
  const GZ = 117.9;                 // front edge of the back gallery
  // ==== round 8: three doorways into the rear suite (src/palace-chambers.js) ====
  // The wall's old central statue niche is replaced by a 12 m arch; two 4 m side
  // doors flank it. The mezzanine balcony above is untouched.
  const D = CHAMBER_DOORS;
  const zf = BZW;                              // the decorated, hall-facing plane
  const OPENS = [
    { cx: D.grand.x, hx: D.grand.hx, spring: D.grand.spring, apex: D.grand.apex },
    { cx: D.sides[0].x, hx: D.side.hx, spring: D.side.spring, apex: D.side.apex },
    { cx: D.sides[1].x, hx: D.side.hx, spring: D.side.spring, apex: D.side.apex },
  ];
  const OPEN_X = [[-HX, -22.5], [-18.5, -7.2], [7.2, 18.5], [22.5, HX]];
  // ---- wall field: strips that follow all three arch heads exactly ----
  wallFieldArched(b, -HX, HX, FY, CEILP + 0.4, zf, OPENS,
    (ym) => (ym < 2.15 ? I_MARBSH : ym < 11.35 ? I_WALL : mulc(I_WALL, 1.01)),
    (ym) => (ym < 2.15 ? MI.marbleSh : MI.wall));
  // ---- dado + gold line, broken by the three openings ----
  for (const [a, c] of OPEN_X) {
    bx(b, a, c, FY, 2.15, zf - 0.26, HZ1, I_MARBSH, MI.marbleSh, { topCol: I_MARB });
    bx(b, a, c, 2.15, 2.32, zf - 0.34, HZ1, GOLD, MI.gold);
  }
  // ---- giant pilasters: moved off the old +-19 / +-30.5 lines ----
  for (const px of [-33.0, -24.6, -16.6, -10.75, 10.75, 16.6, 24.6, 33.0]) {
    bx(b, px - 0.62, px + 0.62, FY, 20.6, zf - 0.52, HZ1, I_MARB, MI.marble, { topCol: I_MARBHI });
    bx(b, px - 0.78, px + 0.78, 19.9, 20.6, zf - 0.66, HZ1, GOLD, MI.gold);
    bx(b, px - 0.78, px + 0.78, FY, 2.15, zf - 0.66, HZ1, I_MARBSH, MI.marbleSh, { topCol: I_MARB });
  }
  // ---- THE GRAND ARCH: 12 m wide, marble+gold surround, gold columns ----
  {
    const o = OPENS[0];
    archBandH(b, o.cx, o.spring, o.hx - 0.12, o.hx + 0.60, zf - 0.04, 28, I_MARBHI, MI.marbleHi);
    archBandH(b, o.cx, o.spring, o.hx + 0.60, o.hx + 0.78, zf - 0.10, 28, GOLD, MI.gold);
    archBandH(b, o.cx, o.spring, o.hx + 0.78, o.hx + 1.02, zf - 0.04, 28, I_MARB, MI.marble);
    doorJambs(b, o.cx, o.hx, FY, o.spring, zf, HZ1, I_MARB, MI.marble);
    // keystone + gold cartouche in the space under the balcony
    bx(b, o.cx - 0.78, o.cx + 0.78, o.apex - 0.06, o.apex + 0.56, zf - 0.36, zf - 0.02, GOLD_HI, MI.goldHi);
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, o.cx, o.apex + 0.22, zf - 0.44, 1]);
    ellipsoid(b, 0.52, 0.26, 0.14, 8, 4, GOLD_HI, MI.goldHi);
    b.pop();
    // the two gilded columns flanking the arch
    for (const sx of [-1, 1]) {
      const cx2 = sx * (o.hx + 2.20);
      bx(b, cx2 - 0.46, cx2 + 0.46, FY, 2.55, zf - 0.68, HZ1, I_MARBHI, MI.marbleHi, { topCol: I_MARB });
      at(b, cx2, 0, zf - 0.46, 0, () => {
        cylinder(b, 10, 0.35, 0.29, 6.85, I_MARBHI, MI.marbleHi, { y0: 2.55 });
        cylinder(b, 10, 0.33, 0.33, 0.12, GOLD, MI.gold, { y0: 3.15 });
        cylinder(b, 10, 0.32, 0.32, 0.12, GOLD, MI.gold, { y0: 7.85 });
        cylinder(b, 10, 0.40, 0.35, 0.34, GOLD, MI.gold, { y0: 9.40 });
        cylinder(b, 10, 0.24, 0.52, 0.46, GOLD, MI.gold, { y0: 9.74 });
        cylinder(b, 10, 0.54, 0.54, 0.22, I_MARB, MI.marble, { y0: 10.20 });
      });
      bx(b, cx2 - 0.62, cx2 + 0.62, 10.42, 10.94, zf - 0.72, HZ1, I_MARBHI, MI.marbleHi, { topCol: I_MARB });
      bx(b, cx2 - 0.64, cx2 + 0.64, 10.86, 11.02, zf - 0.74, HZ1, GOLD, MI.gold);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + Math.PI / 4;
        b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, cx2 + Math.cos(a) * 0.44, 9.98, zf - 0.46 + Math.sin(a) * 0.44, 1]);
        ellipsoid(b, 0.16, 0.12, 0.16, 5, 3, GOLD_HI, MI.goldHi);
        b.pop();
      }
    }
    // wine carpet running through the arch + candle stands
    for (const sx of [-1, 1]) candelabrum(b, sx * (o.hx + 1.12), FY, zf - 1.24, 1.35);
    qYp(b, FY + 0.03, -3.6, 3.6, zf - 3.6, zf - 0.04, RED, MI.cloth);
    for (const sx of [-1, 1]) qYp(b, FY + 0.034, sx * 3.6 - 0.16, sx * 3.6 + 0.16, zf - 3.6, zf - 0.04, GOLD, MI.gold);
  }
  // ---- the two side doors ----
  for (let k = 1; k < 3; k++) {
    const o = OPENS[k];
    archBandH(b, o.cx, o.spring, o.hx - 0.10, o.hx + 0.44, zf - 0.04, 16, I_MARBHI, MI.marbleHi);
    archBandH(b, o.cx, o.spring, o.hx + 0.44, o.hx + 0.58, zf - 0.09, 16, GOLD, MI.gold);
    for (const sx of [-1, 1]) {
      bx(b, o.cx + sx * o.hx, o.cx + sx * (o.hx + 0.44), FY, o.spring, zf - 0.30, zf - 0.02, I_MARBHI, MI.marbleHi);
      bx(b, o.cx + sx * (o.hx + 0.44), o.cx + sx * (o.hx + 0.58), FY, o.spring, zf - 0.34, zf - 0.02, GOLD, MI.gold);
    }
    doorJambs(b, o.cx, o.hx, FY, o.spring, zf, HZ1, I_MARB, MI.marble);
    bx(b, o.cx - 0.48, o.cx + 0.48, o.apex - 0.06, o.apex + 0.64, zf - 0.30, zf - 0.02, GOLD_HI, MI.goldHi);
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, o.cx, o.apex + 0.24, zf - 0.38, 1]);
    ellipsoid(b, 0.36, 0.30, 0.12, 8, 4, GOLD_HI, MI.goldHi);
    b.pop();
    // gold-framed landscape painting over each side door
    const py0 = 8.30, py1 = 10.62, phw = 1.85;
    const zc = zf - 0.22, zc2 = zc + 0.05;
    bx(b, o.cx - phw - 0.15, o.cx + phw + 0.15, py1, py1 + 0.16, zc, zf, GOLD_HI, MI.goldHi);
    bx(b, o.cx - phw - 0.15, o.cx + phw + 0.15, py0 - 0.16, py0, zc, zf, GOLD_HI, MI.goldHi);
    bx(b, o.cx - phw - 0.15, o.cx - phw, py0, py1, zc, zf, GOLD_HI, MI.goldHi);
    bx(b, o.cx + phw, o.cx + phw + 0.15, py0, py1, zc, zf, GOLD_HI, MI.goldHi);
    qF(b, o.cx - phw, o.cx + phw, py0, py1, zc2, mulc(mixc(C.cloudShade, C.stoneCool, 0.30), 0.90), MI.paint);
    qF(b, o.cx - phw, o.cx + phw, py0, py0 + (py1 - py0) * 0.32, zc2 + 0.006, mulc(mixc(C.horizon, C.haze, 0.40), 0.92), MI.paint);
    qF(b, o.cx - phw, o.cx + phw, py0 + (py1 - py0) * 0.32, py0 + (py1 - py0) * 0.50, zc2 + 0.012, mulc(mixc(C.leafDark, C.stoneCool, 0.55), 0.86), MI.paint);
    qF(b, o.cx - phw, o.cx + phw, py0 + (py1 - py0) * 0.50, py0 + (py1 - py0) * 0.66, zc2 + 0.018, mulc(mixc(C.slateDark, C.stoneCool, 0.42), 0.84), MI.paint);
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, o.cx + phw * 0.34, py0 + (py1 - py0) * 0.60, zc2 - 0.01, 1]);
    ellipsoid(b, 0.20, 0.20, 0.02, 6, 3, GOLD_HI, MI.goldHi);
    b.pop();
    // torch sconces on the two flanking pilasters
    for (const sx of [-1, 1]) {
      const px = o.cx + sx * 3.9;
      bx(b, px - 0.13, px + 0.13, 4.30, 4.56, zf - 0.86, zf - 0.52, GOLD, MI.gold);
      if (ctx && ctx.lanterns) ctx.lanterns.push({ p: [px, 4.72, zf - 0.95], size: 1.5, rot: 0, alpha: 0.52, shape: 1, col: mixc(C.sunGlow, GOLD_HI, 0.55) });
    }
  }
  // ---- four statue niches with their backs to the wall (repositioned clear of
  // the three new doorways: +-13.2 and +-28.2)
  for (const cxp of [-28.2, -13.2, 13.2, 28.2]) {
    const nw = 1.55, ns = 6.6, nr = nw;
    qB(b, cxp - nw, cxp + nw, 2.30, ns, BZW - 0.03, mulc(I_BLUE, 0.92), MI.wall);
    for (let i = 0; i < 8; i++) {
      const a0 = Math.PI * (i / 8), a1 = Math.PI * ((i + 1) / 8);
      b.tri([cxp, ns, BZW - 0.03], [cxp + Math.cos(a0) * nr, ns + Math.sin(a0) * nr, BZW - 0.03],
        [cxp + Math.cos(a1) * nr, ns + Math.sin(a1) * nr, BZW - 0.03], mulc(I_BLUE, 0.92), MI.wall, PZ, PZ, PZ);
    }
    for (let i = 0; i < 8; i++) {
      const a0 = Math.PI * (i / 8), a1 = Math.PI * ((i + 1) / 8);
      const r0 = nr + 0.06, r1 = nr + 0.34;
      b.quad([cxp + Math.cos(a0) * r0, ns + Math.sin(a0) * r0, BZW - 0.26], [cxp + Math.cos(a1) * r0, ns + Math.sin(a1) * r0, BZW - 0.26],
        [cxp + Math.cos(a1) * r1, ns + Math.sin(a1) * r1, BZW - 0.26], [cxp + Math.cos(a0) * r1, ns + Math.sin(a0) * r1, BZW - 0.26],
        GOLD, MI.gold, PZ);
    }
    for (const sx of [-1, 1]) bx(b, cxp + sx * nw, cxp + sx * (nw + 0.34), 2.30, ns, BZW - 0.26, BZW - 0.16, GOLD, MI.gold);
    bx(b, cxp - nw - 0.30, cxp + nw + 0.30, 2.30, 2.52, BZW - 0.34, HZ1, I_MARBHI, MI.marbleHi);
    pedestal(b, cxp, 2.52, BZW - 0.28, 1.30, 0.70, 1.20, I_MARB);
    figure(b, cxp, 3.22, BZW - 0.28, 1.18, 0, I_MARBHI, MI.marble);
    // gilded canopy shelf above
    bx(b, cxp - nw - 0.40, cxp + nw + 0.40, ns + nr + 0.40, ns + nr + 0.62, BZW - 0.42, HZ1, GOLD, MI.gold);
  }
  // ---- mezzanine deck: back strip + two side strips, marble with gold fascia
  const deckY0 = MEZZ - 0.42, deckY1 = MEZZ;
  bx(b, -HX + 0.25, HX - 0.25, deckY0, deckY1, GZ, HZ1 - 0.2, I_MARB, MI.marble, { topCol: I_MARBHI });
  for (const s of [-1, 1]) {
    bx(b, s > 0 ? 35.4 : -HX + 0.25, s > 0 ? HX - 0.25 : -35.4, deckY0, deckY1, 111.0, GZ + 0.1, I_MARB, MI.marble, { topCol: I_MARBHI });
  }
  // fascia + gold trim along the deck edges
  bx(b, -HX + 0.25, HX - 0.25, deckY0 - 0.34, deckY0, GZ - 0.16, GZ, I_MARBHI, MI.marbleHi);
  bx(b, -HX + 0.25, HX - 0.25, deckY0 - 0.10, deckY0, GZ - 0.20, GZ - 0.16, GOLD, MI.gold);
  // gold balustrade: back edge (middle span between the stairs) + stair sides
  balustradeX(b, -33.9, 33.9, GZ - 0.20, MEZZ, 1.0);
  for (const s of [-1, 1]) {
    balustradeZ(b, s * 35.5, 111.0, GZ - 0.20, MEZZ, 1.0);
    balustradeX(b, s > 0 ? 37.9 : -39.7, s > 0 ? 39.7 : -37.9, GZ - 0.20, MEZZ, 1.0);
    for (let i = 0; i < 4; i++) {
      const zz = 111.4 + i * 1.7;
      b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, s * (HX - 0.35), deckY0 - 0.35, zz, 1]);
      ellipsoid(b, 0.40, 0.55, 0.40, 6, 4, I_MARBHI, MI.marbleHi, { v0: 0.5, v1: 1.0 });
      b.pop();
    }
  }
  buistradeGold(b, -33.9, 33.9, GZ - 0.20, MEZZ);
  // statues + flower urns on the gallery
  for (const cxp of [-27, -14, 14, 27]) {
    pedestal(b, cxp, MEZZ, GZ + 0.55, 1.2, 0.75, 1.2, I_MARB);
    figure(b, cxp, MEZZ + 0.75, GZ + 0.55, 1.0, Math.PI, I_MARBHI, MI.marble);
  }
  for (const cxp of [-35, 35]) flowerUrn(b, cxp, MEZZ, GZ + 0.6, 1.15);
  // ---- wall above the gallery: tapestries, paintings, the palace arms
  for (const cxp of [-30.5, -19.0, 19.0, 30.5]) {
    tapestry(b, cxp, 12.4, 20.4, 7.4, BZW - 0.06);
  }
  for (const cxp of [-13.2, 13.2]) {
    painting2(b, cxp, 14.6, 19.4, 3.4, BZW - 0.30);
  }
  // palace arms centered above the balcony
  bx(b, -5.6, 5.6, 14.6, 20.6, BZW - 0.26, HZ1, I_MARBHI, MI.marbleHi);
  bx(b, -5.1, 5.1, 15.0, 20.2, BZW - 0.32, BZW - 0.26, GOLD, MI.gold);
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 17.6, BZW - 0.38, 1]);
  ellipsoid(b, 2.2, 1.6, 0.22, 10, 6, GOLD_HI, MI.goldHi);
  b.pop();
  for (const s of [-1, 1]) {
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, s * 3.9, 17.6, BZW - 0.36, 1]);
    ellipsoid(b, 0.55, 1.5, 0.16, 7, 4, GOLD, MI.gold);
    b.pop();
  }
  // gallery torches
  if (ctx && ctx.lanterns) {
    for (const cxp of [-22, 0, 22]) {
      ctx.lanterns.push({ p: [cxp, MEZZ + 2.6, GZ + 0.3], size: 1.7, rot: 0, alpha: 0.45, shape: 1, col: mixc(C.sunGlow, GOLD_HI, 0.5) });
    }
    ctx.lanterns.push({ p: [0, 8.6, BZW - 1.3], size: 1.9, rot: 0, alpha: 0.28, shape: 1, col: mixc(C.sunGlow, GOLD_HI, 0.55) });
    for (const cxp of [-13.2, 13.2]) {
      ctx.lanterns.push({ p: [cxp, 11.0, BZW - 0.9], size: 1.4, rot: 0, alpha: 0.4, shape: 1, col: mixc(C.sunGlow, GOLD_HI, 0.5) });
    }
  }
  void R;
}
// hanging tapestry with fabric folds, gold crest and tassels (normal +Z)
function tapestry(b, cx, y0, y1, w, zf) {
  const cols = 8, ww = w / cols;
  for (let i = 0; i < cols; i++) {
    const xa = cx - w / 2 + i * ww, xb = xa + ww;
    const tone = 0.88 + 0.18 * Math.abs(Math.sin(i * 1.7 + 0.4));
    const zz = zf + 0.05 + 0.05 * Math.sin(i * 1.3);
    bx(b, xa + 0.02, xb - 0.02, y0, y1, zz, zz + 0.035, mulc(I_BLUE, tone), MI.cloth, { topCol: mulc(I_BLUE, tone * 1.08) });
    bx(b, xb - 0.06, xb - 0.02, y0, y1, zz + 0.005, zz + 0.04, mulc(I_BLUE, 0.58), MI.cloth);
  }
  // gold border + crest + tassels
  bx(b, cx - w / 2 - 0.16, cx + w / 2 + 0.16, y1, y1 + 0.24, zf - 0.12, zf + 0.04, GOLD, MI.gold);
  bx(b, cx - w / 2 - 0.16, cx - w / 2, y0, y1, zf - 0.12, zf + 0.04, GOLD, MI.gold);
  bx(b, cx + w / 2, cx + w / 2 + 0.16, y0, y1, zf - 0.12, zf + 0.04, GOLD, MI.gold);
  for (let i = 0; i < 7; i++) {
    const xa = cx - w / 2 + ww * (i + 0.5);
    bx(b, xa - 0.07, xa + 0.07, y0 - 0.30, y0, zf - 0.02, zf + 0.04, GOLD, MI.gold);
  }
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, cx, y1 - 1.5, zf - 0.10, 1]);
  ellipsoid(b, 0.95, 0.90, 0.10, 9, 5, GOLD, MI.gold);
  b.pop();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, cx + Math.cos(a) * 0.95, y1 - 1.5 + Math.sin(a) * 0.90, zf - 0.12, 1]);
    ellipsoid(b, 0.13, 0.13, 0.06, 5, 3, GOLD_HI, MI.goldHi);
    b.pop();
  }
}
// flat gold-framed painting on the back wall (normal +Z)
function painting2(b, cx2, y0, y1, w, zf) {
  const hw = w / 2;
  bx(b, cx2 - hw - 0.16, cx2 + hw + 0.16, y1, y1 + 0.18, zf, zf + 0.16, GOLD_HI, MI.goldHi);
  bx(b, cx2 - hw - 0.16, cx2 + hw + 0.16, y0 - 0.18, y0, zf, zf + 0.16, GOLD_HI, MI.goldHi);
  bx(b, cx2 - hw - 0.16, cx2 - hw, y0, y1, zf, zf + 0.16, GOLD_HI, MI.goldHi);
  bx(b, cx2 + hw, cx2 + hw + 0.16, y0, y1, zf, zf + 0.16, GOLD_HI, MI.goldHi);
  const zc = zf + 0.13;
  qB(b, cx2 - hw, cx2 + hw, y0, y1, zc, mulc(mixc(C.cloudShade, C.stoneCool, 0.35), 0.86), MI.paint);
  qB(b, cx2 - hw, cx2 + hw, y0, y0 + (y1 - y0) * 0.34, zc + 0.01, mulc(mixc(C.horizon, C.haze, 0.45), 0.90), MI.paint);
  qB(b, cx2 - hw, cx2 + hw, y0 + (y1 - y0) * 0.34, y0 + (y1 - y0) * 0.56, zc + 0.01, mulc(mixc(C.slateDark, C.stoneCool, 0.42), 0.82), MI.paint);
  qB(b, cx2 - hw, cx2 + hw, y0 + (y1 - y0) * 0.56, y0 + (y1 - y0) * 0.72, zc + 0.015, mulc(mixc(C.leafDark, C.stoneCool, 0.55), 0.80), MI.paint);
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, cx2 + hw * 0.30, y0 + (y1 - y0) * 0.74, zc + 0.02, 1]);
  ellipsoid(b, hw * 0.20, hw * 0.20, 0.02, 6, 3, GOLD_HI, MI.goldHi);
  b.pop();
}
function buistradeGold(b, x0, x1, z, y) {
  bx(b, x0, x1, y + 1.02, y + 1.14, z - 0.26, z - 0.06, GOLD_HI, MI.goldHi);
}
function frameXish(b, x, y0, y1) {
  bx(b, x - 1.0, x + 1.0, y1 - 0.14, y1, BZW - 0.30, BZW - 0.22, GOLD, MI.gold);
}
// gold balustrade running along X at a fixed z
function balustradeX(b, x0, x1, z, y, h) {
  bx(b, x0, x1, y + 0.10, y + 0.24, z - 0.20, z + 0.20, I_MARB, MI.marble, { topCol: I_MARBHI });
  bx(b, x0, x1, y + h + 0.10, y + h + 0.26, z - 0.26, z + 0.26, GOLD_HI, MI.goldHi);
  const n = Math.max(2, Math.round((x1 - x0) / 1.05));
  for (let i = 0; i < n; i++) {
    const xa = x0 + ((x1 - x0) * (i + 0.5)) / n;
    bx(b, xa - 0.075, xa + 0.075, y + 0.24, y + h + 0.10, z - 0.075, z + 0.075, GOLD, MI.gold);
  }
  for (let i = 0; i <= Math.round((x1 - x0) / 6); i++) {
    const xa = x0 + ((x1 - x0) * i) / Math.max(1, Math.round((x1 - x0) / 6));
    bx(b, xa - 0.16, xa + 0.16, y + 0.10, y + h + 0.30, z - 0.16, z + 0.16, I_MARBHI, MI.marbleHi);
  }
}
// gold balustrade running along Z at a fixed x
function balustradeZ(b, x, z0, z1, y, h) {
  bx(b, x - 0.20, x + 0.20, y + 0.10, y + 0.24, z0, z1, I_MARB, MI.marble, { topCol: I_MARBHI });
  bx(b, x - 0.26, x + 0.26, y + h + 0.10, y + h + 0.26, z0, z1, GOLD_HI, MI.goldHi);
  const n = Math.max(2, Math.round((z1 - z0) / 1.05));
  for (let i = 0; i < n; i++) {
    const za = z0 + ((z1 - z0) * (i + 0.5)) / n;
    bx(b, x - 0.075, x + 0.075, y + 0.24, y + h + 0.10, za - 0.075, za + 0.075, GOLD, MI.gold);
  }
}

// ---- hall side stairs (x +-33.8 .. 37.8, z 97.2 .. 117.9) ---------------
function stairs(b, R) {
  const n = 45, rise = (MEZZ - FY) / n, run = 20.7 / n;
  for (const s of [-1, 1]) {
    const xa = s > 0 ? 33.9 : -37.8, xb = s > 0 ? 37.8 : -33.9;
    for (let i = 0; i < n; i++) {
      const z0 = 97.2 + i * run, z1 = 97.2 + (i + 1) * run;
      const yTop = FY + (i + 1) * rise;
      bx(b, xa, xb, FY - 0.1, yTop, z0, z1, i % 2 ? I_MARB : I_MARBHI, MI.marble, { topCol: I_MARBHI });
      // gold nosing
      bx(b, xa + 0.05, xb - 0.05, yTop - 0.03, yTop, z0, z0 + 0.07, GOLD, MI.gold);
      // red runner up the middle
      qYp(b, yTop + 0.008, s > 0 ? 34.6 : -36.6, s > 0 ? 36.6 : -34.6, z0 + 0.02, z1 - 0.02, RED, MI.cloth);
      // inner balustrade: a marble parapet with a gold capping
      const xi = s * 34.0;
      const yb = yTop + 0.95;
      qSide(b, s, xi - s * 0.22, z0, z1, yTop, yb, mulc(I_MARBHI, 0.98), MI.marbleHi);
      qSide(b, -s, xi + s * 0.22, z0, z1, yTop, yb, mulc(I_MARB, 0.98), MI.marble);
      bx(b, Math.min(xi - 0.26, xi + 0.26), Math.max(xi - 0.26, xi + 0.26), yb - 0.02, yb + 0.16, z0, z1, GOLD_HI, MI.goldHi);
    }
    // sloped handrail + bottom newel
    bar3(b, [s * 34.0, FY + 1.05, 97.2], [s * 34.0, MEZZ + 1.05, 117.9], 0.34, 0.20, GOLD, MI.gold);
    bx(b, s * 34.0 - 0.32, s * 34.0 + 0.32, FY, FY + 1.3, 96.7, 97.4, I_MARBHI, MI.marbleHi, { topCol: I_MARB });
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, s * 34.0, FY + 1.5, 96.9, 1]);
    ellipsoid(b, 0.26, 0.26, 0.26, 6, 4, GOLD_HI, MI.goldHi);
    b.pop();
    // stair carpet band
  }
  void R;
}

// ---- central low fountain -------------------------------------------------
function fountain(b, ctx, R) {
  const cx = HALL.pond.x, cz = HALL.pond.z, r = HALL.pond.r;
  const seg = 28;
  // pool curb (two courses) + basin wall
  for (const [r0, r1, y0, y1, cc, mm] of [
    [r, r + 0.55, FY, FY + 0.30, I_MARBSH, MI.marble],
    [r - 0.10, r + 0.50, FY + 0.30, FY + 0.52, I_MARB, MI.marble],
    [r - 0.10, r - 0.02, FY + 0.52, FY + 0.60, GOLD, MI.gold],
  ]) {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      b.quad([cx + c0 * r0, y1, cz + s0 * r0], [cx + c1 * r0, y1, cz + s1 * r0],
        [cx + c1 * r1, y1, cz + s1 * r1], [cx + c0 * r1, y1, cz + s0 * r1], cc, mm, UPV);
      b.quad([cx + c0 * r0, y0, cz + s0 * r0], [cx + c1 * r0, y0, cz + s1 * r0],
        [cx + c1 * r0, y1, cz + s1 * r0], [cx + c0 * r0, y1, cz + s0 * r0], cc, mm, [Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2)]);
    }
  }
  // water surface
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    b.tri([cx, FY + 0.40, cz], [cx + Math.cos(a0) * (r - 0.05), FY + 0.40, cz + Math.sin(a0) * (r - 0.05)],
      [cx + Math.cos(a1) * (r - 0.05), FY + 0.40, cz + Math.sin(a1) * (r - 0.05)], mulc(mixc(C.waterDeep, C.water, 0.62), 0.86), MI.water, UPV, UPV, UPV);
  }
  // central pedestal + upper dolphin basin + finial sculpture
  at(b, cx, 0, cz, 0, () => {
    lathe(b, [[1.05, FY], [0.85, FY + 0.20], [0.45, FY + 0.35], [0.30, FY + 0.55], [0.42, FY + 0.85], [0.30, FY + 1.02]], 10, I_MARB, MI.marble);
    for (let i = 0; i < 10; i++) {
      const a0 = (i / 10) * TAU, a1 = ((i + 1) / 10) * TAU;
      b.quad([Math.cos(a0) * 1.45, FY + 1.10, Math.sin(a0) * 1.45], [Math.cos(a1) * 1.45, FY + 1.10, Math.sin(a1) * 1.45],
        [Math.cos(a1) * 0.75, FY + 1.02, Math.sin(a1) * 0.75], [Math.cos(a0) * 0.75, FY + 1.02, Math.sin(a0) * 0.75],
        I_MARBHI, MI.marbleHi, [0, -0.6, 0]);
      b.quad([Math.cos(a0) * 1.52, FY + 1.16, Math.sin(a0) * 1.52], [Math.cos(a1) * 1.52, FY + 1.16, Math.sin(a1) * 1.52],
        [Math.cos(a1) * 1.24, FY + 1.10, Math.sin(a1) * 1.24], [Math.cos(a0) * 1.24, FY + 1.10, Math.sin(a0) * 1.24],
        GOLD, MI.gold, [0, 1, 0]);
    }
    // upper basin water
    for (let i = 0; i < 14; i++) {
      const a0 = (i / 14) * TAU, a1 = ((i + 1) / 14) * TAU;
      b.tri([0, FY + 1.08, 0], [Math.cos(a0) * 1.36, FY + 1.08, Math.sin(a0) * 1.36],
        [Math.cos(a1) * 1.36, FY + 1.08, Math.sin(a1) * 1.36], mulc(mixc(C.waterDeep, C.water, 0.62), 0.86), MI.water, UPV, UPV, UPV);
    }
    // statue on top (total height 2.55 above the floor)
    lathe(b, [[0.34, FY + 1.16], [0.26, FY + 1.30], [0.22, FY + 1.55], [0.24, FY + 1.75], [0.20, FY + 1.90]], 7, I_MARBHI, MI.marble);
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, FY + 2.02, 0, 1]);
    ellipsoid(b, 0.19, 0.22, 0.19, 6, 4, I_MARBHI, MI.marble);
    b.pop();
    bar3(b, [0.16, FY + 1.98, 0], [0.55, FY + 2.34, 0.10], 0.13, 0.13, I_MARBHI, MI.marble);
    bar3(b, [-0.16, FY + 1.98, 0], [-0.5, FY + 1.72, 0.16], 0.13, 0.13, I_MARBHI, MI.marble);
    bx(b, -0.30, 0.30, FY + 1.16, FY + 1.22, -0.10, 0.10, GOLD, MI.gold);
  });
  // four flower clusters in the pool ring + gold spouts
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    const px = cx + Math.cos(a) * 2.6, pz = cz + Math.sin(a) * 2.6;
    flowerUrn(b, px, FY + 0.40, pz, 0.9);
    const sa = a + Math.PI / 4;
    if (ctx && ctx.lanterns) {
      ctx.lanterns.push({ p: [cx + Math.cos(sa) * 3.4, FY + 0.75, cz + Math.sin(sa) * 3.4], size: 1.1, rot: 0, alpha: 0.32, shape: 1, col: mixc(C.cloudLit, C.glass, 0.5) });
    }
  }
  void R;
}

// ---- furniture, greenery, chandeliers ------------------------------------
function furniture(b, ctx, R) {
  const cz = HALL.pond.z;
  // benches along the side walls between the stair feet
  for (const s of [-1, 1]) {
    for (const bz of [99.6, 108.0]) {
      const x = s * 32.6;
      bx(b, x - 1.3, x + 1.3, FY, FY + 0.55, bz - 2.4, bz + 2.4, I_MARB, MI.marble, { topCol: I_MARBHI });
      bx(b, x - 1.15, x + 1.15, FY + 0.55, FY + 0.72, bz - 2.25, bz + 2.25, VELVET, MI.velvet);
      bx(b, x + (s > 0 ? 0.9 : -1.3), x + (s > 0 ? 1.3 : -0.9), FY, FY + 1.1, bz - 2.4, bz + 2.4, I_MARBHI, MI.marbleHi);
      for (const ez of [-2.2, 2.2]) bx(b, x - 1.2, x + 1.2, FY, FY + 0.30, bz + ez - 0.12, bz + ez + 0.12, GOLD, MI.gold);
    }
  }
  // standing candelabra flanking the carpet
  for (const s of [-1, 1]) {
    for (const zz of [99.2, 114.4]) candelabrum(b, s * 6.2, FY, zz, 1.15);
  }
  // gold-framed console tables + flower urns by the entrance
  for (const s of [-1, 1]) {
    const x = s * 18.5, z = 98.9;
    bx(b, x - 1.05, x + 1.05, FY + 0.92, FY + 1.06, z - 0.55, z + 0.55, GOLD, MI.gold);
    for (const sx of [-1, 1]) {
      bx(b, x + sx * 0.9 - 0.07, x + sx * 0.9 + 0.07, FY, FY + 0.92, z - 0.45, z - 0.31, GOLD, MI.gold);
      bx(b, x + sx * 0.9 - 0.07, x + sx * 0.9 + 0.07, FY, FY + 0.92, z + 0.31, z + 0.45, GOLD, MI.gold);
    }
    flowerUrn(b, x, FY + 1.06, z, 1.0);
  }
  // orange trees / potted greenery in the aisles and by the piers
  for (const s of [-1, 1]) {
    for (const zz of [98.4, 104.6, 110.8, 116.9]) orangeTree(b, s * 27.0, FY, zz, 1.05);
    for (const zz of [100.4, 112.2]) orangeTree(b, s * 34.6, FY, zz, 0.95);
  }
  // urns at the nave column feet
  for (const s of [-1, 1]) {
    for (const zz of COLZ) flowerUrn(b, s * (COLX - 2.25), FY, zz, 1.0);
  }
  // a low marble table with a vase by the fountain
  for (const s of [-1, 1]) {
    const x = s * 9.4, z = cz;
    bx(b, x - 0.8, x + 0.8, FY + 0.72, FY + 0.86, z - 1.2, z + 1.2, I_MARBHI, MI.marbleHi, { topCol: I_MARB });
    bx(b, x - 1.0, x + 1.0, FY + 0.86, FY + 0.96, z - 1.35, z + 1.35, GOLD, MI.gold);
    bx(b, x - 0.10, x + 0.10, FY, FY + 0.72, z - 1.0, z - 0.8, I_MARB, MI.marble);
    bx(b, x - 0.10, x + 0.10, FY, FY + 0.72, z + 0.8, z + 1.0, I_MARB, MI.marble);
    flowerUrn(b, x, FY + 0.96, z, 1.05);
  }
  // chandeliers (geometry + candle glows)
  for (const [cx, cy, cz2, s] of [[0, 17.8, cz, 2.05], [-14.5, 16.4, 101.0, 1.15], [14.5, 16.4, 101.0, 1.15],
    [-14.5, 16.4, 115.0, 1.15], [14.5, 16.4, 115.0, 1.15]]) {
    chandelier(b, cx, cy, cz2, s);
    if (ctx && ctx.lanterns) {
      ctx.lanterns.push({ p: [cx, cy - 0.2, cz2], size: 2.6 * s, rot: 0, alpha: 0.55, shape: 1, col: mixc(C.sunGlow, GOLD_HI, 0.5) });
    }
  }
  void R;
}
function chandelier(b, x, y, z, s) {
  const k = s;
  // chain from the chandelier crown up to the ceiling
  const cyTop = CEILP - 0.1;
  const cy0 = y + 0.55 * k;
  const n = 5, step = Math.max(0.25, (cyTop - cy0) / n);
  for (let i = 0; i < n; i++) {
    const yy = cy0 + step * (i + 0.5);
    bx(b, x - 0.06 * k, x + 0.06 * k, yy - step * 0.45, yy + step * 0.45, z - 0.06 * k, z + 0.06 * k, GOLD, MI.gold);
  }
  bx(b, x - 0.09 * k, x + 0.09 * k, cy0 - 0.10, cyTop, z - 0.09 * k, z + 0.09 * k, mixc(GOLD, I_MARBSH, 0.35), MI.gold);
  // bowl + gold arms
  at(b, x, y, z, 0, () => {
    torus(b, 1.05 * k, 0.10 * k, 14, 4, GOLD, MI.gold, 'y');
    torus(b, 0.62 * k, 0.08 * k, 12, 4, GOLD, MI.gold, 'y');
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0.35 * k, 0, 1]);
    ellipsoid(b, 0.34 * k, 0.30 * k, 0.34 * k, 7, 4, GOLD, MI.gold);
    b.pop();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      const px = Math.cos(a) * 1.05 * k, pz = Math.sin(a) * 1.05 * k;
      cylinder(b, 5, 0.055 * k, 0.045 * k, 0.30 * k, mixc(C.cloudLit, C.sunGlow, 0.5), M.cloth, { y0: 0.08 * k });
      b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, px, 0, pz, 1]);
      cylinder(b, 5, 0.05 * k, 0.04 * k, 0.34 * k, mixc(C.cloudLit, C.sunGlow, 0.5), M.cloth, { y0: 0.10 * k });
      b.pop();
      b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, px, 0.46 * k, pz, 1]);
      ellipsoid(b, 0.07 * k, 0.11 * k, 0.07 * k, 5, 3, mixc(C.sunGlow, C.cloudLit, 0.35), M.glowW);
      b.pop();
    }
  });
}
// ---- indoor sculptures flanking the doors -------------------------------
function frontWall(b, ctx, R) {
  // wall panels either side of the opening + above it
  for (const s of [-1, 1]) {
    qB(b, s > 0 ? 12.4 : -40, s > 0 ? 40 : -12.4, FY, MEZZ + 0.5, FZW, s > 0 ? I_WALL : mulc(I_WALL, 0.99), MI.marble);
    qB(b, s > 0 ? 12.4 : -40, s > 0 ? 40 : -12.4, MEZZ + 0.5, CEILP + 0.4, FZW, mulc(I_WALL, 1.02), MI.marble);
    // dado + gold
    bx(b, s > 0 ? 12.4 : -40, s > 0 ? 40 : -12.4, FY, 2.15, FZW - 0.02, FZW + 0.30, I_MARBSH, MI.marble, { topCol: I_MARB });
    bx(b, s > 0 ? 12.4 : -40, s > 0 ? 40 : -12.4, 2.15, 2.30, FZW - 0.02, FZW + 0.36, GOLD, MI.gold);
    // the two gilded door leaves, folded open flat against the wall
    doorLeaf(b, s, ctx);
    // marble panels above the doors
    bx(b, s > 0 ? 12.9 : -38.9, s > 0 ? 38.9 : -12.9, 13.2, 19.4, FZW + 0.10, FZW + 0.26, I_MARBHI, MI.marbleHi);
    // gold-framed landscape paintings on those panels
    for (const dz of [16.2, 26.2, 33.6]) {
      painting2(b, s * dz, 14.3, 18.6, 4.4, FZW + 0.26);
    }
    // torch sconces between the paintings
    for (const dz of [21.0, 30.0]) {
      const x = s * dz;
      bx(b, x - 0.14, x + 0.14, 10.4, 10.7, FZW + 0.20, FZW + 0.66, GOLD, MI.gold);
      if (ctx && ctx.lanterns) ctx.lanterns.push({ p: [x, 10.6, FZW + 0.7], size: 1.4, rot: 0, alpha: 0.5, shape: 1, col: mixc(C.sunGlow, GOLD_HI, 0.5) });
    }
  }
  // panel above the opening (y 17..23) with the palace arms
  qB(b, -12.4, 12.4, 17.0, CEILP + 0.4, FZW, I_WALL, MI.marble);
  bx(b, -5.4, 5.4, 17.4, 22.2, FZW + 0.10, FZW + 0.26, I_MARBHI, MI.marbleHi);
  bx(b, -5.0, 5.0, 17.6, 22.0, FZW + 0.26, FZW + 0.34, GOLD, MI.gold);
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 19.8, FZW + 0.38, 1]);
  ellipsoid(b, 1.7, 1.3, 0.20, 10, 6, GOLD_HI, MI.goldHi);
  b.pop();
  // archivolt inside the opening (hall side)
  bandZ(b, 0, SPR, 12.0, 12.5, FZW - 0.5, FZW + 0.02, 0, Math.PI, 12, I_MARBHI, MI.marbleHi, false, true);
  // torch columns flanking the opening
  for (const s of [-1, 1]) {
    bx(b, s * 13.0 - 0.55, s * 13.0 + 0.55, FY, 20.2, FZW + 0.30, FZW + 0.70, I_MARB, MI.marble, { topCol: I_MARBHI });
    bx(b, s * 13.0 - 0.68, s * 13.0 + 0.68, 19.5, 20.2, FZW + 0.24, FZW + 0.78, GOLD, MI.gold);
    bx(b, s * 13.0 - 0.68, s * 13.0 + 0.68, FY, 2.15, FZW + 0.24, FZW + 0.78, I_MARBHI, MI.marbleHi);
  }
  // the two guards, standing in front of the folded doors
  for (const s of [-1, 1]) {
    const x = s * 16.6, z = FZW + 1.55;
    pedestal(b, x, FY, z, 1.9, 0.85, 1.9, I_MARB);
    figure(b, x, FY + 0.85, z, 1.5, Math.PI, I_MARBHI, MI.marble);
    // halberd
    bar3(b, [x + s * 0.62, FY + 0.85, z + 0.1], [x + s * 0.62, FY + 4.6, z + 0.1], 0.08, 0.08, GOLD, MI.gold);
    bx(b, x + s * 0.62 - 0.16, x + s * 0.62 + 0.16, FY + 4.5, FY + 4.95, z - 0.04, z + 0.05, GOLD_HI, MI.goldHi);
  }
  void R;
}
// one gilded door leaf, folded back flat against the hall side of the front wall.
// The visible face looks INTO the hall, i.e. toward +Z, so all relief sits on that side.
function doorLeaf(b, s, ctx) {
  const x0 = s > 0 ? 12.5 : -24.6, x1 = s > 0 ? 24.6 : -12.5;
  const y0 = FY + 0.05, y1 = 12.7;
  const zBack = FZW + 0.05;               // against the wall
  const zFace = FZW + 0.30;               // the leaf's hall-side face
  const zRel = zFace + 0.01;              // recessed panels
  const zS = zFace + 0.055;               // stiles stand proud of the panels
  bx(b, x0, x1, y0, y1, zBack, zFace, mulc(I_RED, 0.96), MI.velvet, { topCol: mulc(I_RED, 1.06) });
  const BRASS = mulc(mixc(GOLD, C.bronze, 0.42), 0.90);
  // stiles + rails standing proud
  const nx = 4, ny = 5;
  for (let i = 0; i <= nx; i++) {
    const xa = x0 + ((x1 - x0) * i) / nx;
    bx(b, xa - 0.085, xa + 0.085, y0, y1, zFace, zS, BRASS, MI.gold);
  }
  for (let j = 0; j <= ny; j++) {
    const ya = y0 + ((y1 - y0) * j) / ny;
    bx(b, x0, x1, ya - 0.08, ya + 0.08, zFace, zS, BRASS, MI.gold);
  }
  // deep red lacquer panels, each with a gilt boss
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const xa = x0 + ((x1 - x0) * i) / nx + 0.18, xb = x0 + ((x1 - x0) * (i + 1)) / nx - 0.18;
      const ya = y0 + ((y1 - y0) * j) / ny + 0.16, yb = y0 + ((y1 - y0) * (j + 1)) / ny - 0.16;
      qB(b, xa, xb, ya, yb, zRel, mulc(mixc(I_RED, C.gold, 0.12), 0.82 + 0.07 * ((i + j) % 3)), MI.velvet);
      bx(b, xa - 0.05, xb + 0.05, ya - 0.05, yb + 0.05, zFace + 0.004, zRel, BRASS, MI.gold);
      b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, (xa + xb) / 2, (ya + yb) / 2, zRel + 0.05, 1]);
      ellipsoid(b, (xb - xa) * 0.13, (yb - ya) * 0.13, 0.045, 6, 3, GOLD_HI, MI.goldHi);
      b.pop();
    }
  }
  // ring handles on the leading edge + hinge straps on the wall side
  const hx = s > 0 ? x0 + 1.2 : x1 - 1.2;
  for (const yy of [5.6, 6.4]) {
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, hx, yy, zS + 0.05, 1]);
    ellipsoid(b, 0.17, 0.17, 0.06, 8, 4, GOLD_HI, MI.goldHi);
    b.pop();
  }
  for (let j = 0; j < 4; j++) {
    const yy = y0 + 1.8 + j * 2.7;
    const hx0 = s > 0 ? x0 : x1 - 2.2, hx1 = s > 0 ? x0 + 2.2 : x1;
    bx(b, hx0, hx1, yy - 0.09, yy + 0.09, zS - 0.01, zS + 0.02, mulc(BRASS, 1.05), MI.gold);
  }
  void ctx;
}

// ---- lights --------------------------------------------------------------
function hallLights(ctx) {
  if (!ctx) return;
  const warm = mixc(C.sunGlow, GOLD_HI, 0.42);
  const warmSoft = mixc(C.sunGlow, C.cloudLit, 0.35);
  if (ctx.points) {
    const pts = [
      [0, 8.0, 98.0, 26, 0.60, warm],
      [0, 11.0, 104.0, 26, 0.48, warm],
      [-25, 10.0, 103.0, 30, 0.46, warm],
      [25, 10.0, 103.0, 30, 0.46, warm],
      [-25, 10.0, 116.0, 30, 0.42, warmSoft],
      [25, 10.0, 116.0, 30, 0.42, warmSoft],
      [0, 12.0, 117.0, 26, 0.44, warm],
      [0, 18.5, 109.4, 40, 0.48, mixc(C.sunGlow, C.cloudLit, 0.35)],
      [0, 6.5, 92.9, 22, 0.50, warm],
    ];
    for (const [x, y, z, range, int, col] of pts) ctx.points.push({ p: [x, y, z], col, range, int });
  }
  if (ctx.lanterns) {
    ctx.lanterns.push({ p: [0, 21.5, 109.4], size: 5.2, rot: 0, alpha: 0.42, shape: 1, col: mixc(C.cloudLit, C.sunGlow, 0.4) });
    ctx.lanterns.push({ p: [0, 5.2, 96.9], size: 3.4, rot: 0, alpha: 0.38, shape: 1, col: mixc(C.cloudLit, C.sunGlow, 0.45) });
  }
}

// =====================================================================
// entry point
// =====================================================================
export function buildPalaceBase(b, ctx, rng) {
  b.note && b.note('palaceBase');
  const R = mulberry32(0xba5e2026);     // LOCAL rng: never draw from the shared sequence
  const depth = b.stack.length;
  try {
    buildFacade(b, ctx, R);
    buildTunnel(b, ctx, R);
    buildHall(b, ctx, R);
  } catch (e) {
    while (b.stack.length > depth) b.pop();
    throw e;
  }
  void rng;
}
// what the geometry check tool needs (kept in sync with the builders above)
export const BASE_METRICS = {
  facadeZ: ZB, atticTop: TOPY, floorY: FY, ceilingPlane: CEILP,
  arch: { r: ARC_R, spring: SPR, zFront: ARCH.zFront, zBack: ARCH.zBack },
  hall: { x0: HALL.x0, x1: HALL.x1, z0: HZ0, z1: HZ1, mezzY: MEZZ, pond: HALL.pond },
  nave: { colX: COLX, cols: COLZ },
  chamberDoors: CHAMBER_DOORS,
};
