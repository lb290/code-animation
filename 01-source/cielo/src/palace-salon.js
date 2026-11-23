// PALACE SALON — round 5: luxury furnishing of the rotunda's ground floor.
// OWNER: agent "salon". Contract: 03-notes/cielo-round5-brief.md + PAL.hall/PC/PM.
// Additive only: the rotunda shell + interior shell stay in palace.js / palace-hall.js.
// buildPalaceSalon(b, ctx, rng) is called from world.js after palaceHall.
//
// What this module adds (all inside the existing rotunda, nothing rebuilt):
//   carpet    wine/gold processional carpet: tunnel -> door -> ring band -> throne steps
//   throne    apse dais (3 marble steps) + gilded throne + wine baldachin + candelabra
//   seating   8 velvet-and-gold salon groups (4 settee+2 chairs+tea table, 4 chair pairs)
//   piers     4 gilded trumeau mirrors + consoles, 8 flower urns, 6 orange trees
//   hangings  10 damask valances on gilded rods between the column capitals
//   art       6 gold-framed oil paintings on the bay panels
//   lights    6 secondary chandeliers on the r=8 ring + 8 gilded sconces
//   entrance  two opened gilded doors in the tunnel, carpet, 2 guard statues, gold shield
//
// Envelope rules it must respect: nothing in the protected dome-view cylinder
// (r < 3.5, y 32..46), nothing in front of the apse stained glass above y=33.2,
// nothing in the clerestory drum band, and every vertex inside r<=14.7 (the apse
// recess and the entrance tunnel are the two documented exceptions).
import { PAL, PC, PM } from './palace-plan.js';
import { box, cylinder, lathe, mixc, mulc, bar3, torus } from './geo.js';
import { ellipsoid, tubePath, MT, frameXY } from './lib3d.js';
import { C } from './palette.js';
import { mulberry32, TAU } from './math.js';

const H = PAL.hall;
const CX = H.cx, CZ = H.cz, FY = H.floorY;         // 0, 144, 30
const RW = PAL.rearWindow;
const SEED = 0x5a10a2026 & 0x7fffffff;

// ---------------------------------------------------------------- palette
const GOLD = PC.gold, GOLD_HI = PC.goldHi;
const GOLD_D = mixc(PC.gold, C.bronze, 0.42);
const BLUE = mulc(mixc(C.slate, C.slateLight, 0.18), 0.86);   // royal damask
const BLUE_D = mulc(BLUE, 0.55);
const BLUE_HI = mulc(mixc(BLUE, C.glass, 0.07), 0.92);
const NAVY = mixc(C.slateDark, C.iron, 0.26);            // deep blue velvet
const NAVY_HI = mixc(NAVY, C.slate, 0.40);
const WINE = mulc(mixc(mulc(C.trainRed, 0.52), C.slateDark, 0.20), 0.80);   // deep wine velvet
const WINE_HI = mixc(WINE, C.bloomRed, 0.26);
const CREAM = PC.marbleHi, MARBLE = PC.marble, MARBLE_HI = PC.marbleHi, MARBLE_SH = PC.marbleSh;
const IVORY = mixc(C.stonePale, C.sunGlow, 0.10);
const SILVER = mixc(mixc(PC.glowSky, C.slate, 0.42), C.cloudLit, 0.20);
const LEAF = PC.leaf, LEAF_L = PC.leafL, LEAF_D = PC.leafD;
const WOOD = mixc(C.bronze, C.trainRed, 0.30);
const GLOW = mixc(C.sunGlow, C.cloudLit, 0.30);
const GLOW_W = mixc(C.sunGlow, C.cloudLit, 0.62);
const SKY_B = mixc(PC.glowSky, C.horizon, 0.35);
const PAINT = [mixc(C.skyMid, C.horizon, 0.55), mixc(C.lawn, LEAF_D, 0.4), mixc(C.gold, C.sunGlow, 0.3),
  mixc(C.stoneDark, C.trainRed, 0.35), mixc(C.slateDark, C.slate, 0.5)];

// ---------------------------------------------------------------- materials [emissive, gloss]
const M_GOLD = [0.16, 0.88];
const M_GOLD_HI = [0.20, 0.90];
const M_GOLD_D = [0.11, 0.66];
const M_MARBLE = [0.12, 0.22];
const M_MARBLE_HI = [0.16, 0.30];
const M_WALL = PM.hall;
const M_VELVET = [0.12, 0.04];
const M_CARPET = [0.055, 0.03];
const M_CLOTH = [0.10, 0.05];
const M_GLOW = [0.88, 0.0];
const M_WARM = [0.62, 0.10];
const M_MIRROR = [0.10, 0.95];
const M_LEAF = [0.05, 0.10];
const M_BLOOM = [0.10, 0.05];
const M_WOOD = [0.08, 0.30];
const M_SILVER = [0.12, 0.60];
const M_PAINT = [0.10, 0.10];
// top surface of the salon tables / consoles where the still-life props sit
const TABLE_TOP = 0.77;

// ---------------------------------------------------------------- transforms / helpers
// column-major TRS, local +X = (cos,0,sin), local +Z = (-sin,0,cos) — same as palace-hall
function mtr(x, y, z, yaw = 0, s = 1) {
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  return [c * s, 0, sn * s, 0, 0, s, 0, 0, -sn * s, 0, c * s, 0, x, y, z, 1];
}
function at(b, x, y, z, yaw, fn) { b.push(mtr(x, y, z, yaw)); fn(); b.pop(); }
// a frame standing on the hall wall at angle ang / radius rad (local +Z points inward)
function atA(b, ang, r, y, fn) {
  at(b, CX + Math.cos(ang) * r, y, CZ + Math.sin(ang) * r, ang + Math.PI / 2, fn);
}
// box centred on a point in the CURRENT frame
function pb(b, x, y, z, sx, sy, sz, col, mat, opts) {
  at(b, x, y, z, 0, () => box(b, sx, sy, sz, col, mat, opts));
}
function polar(ang, r) { return [CX + Math.cos(ang) * r, CZ + Math.sin(ang) * r]; }
// yaw that makes local +Z point along (dx,dz)
function faceYaw(dx, dz) { return Math.atan2(-dx, dz); }
const deg = (d) => (d * Math.PI) / 180;
function discFace(b, r, cy, cz, seg, col, mat) {
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    b.tri([0, cy, cz], [Math.cos(a0) * r, cy + Math.sin(a0) * r, cz], [Math.cos(a1) * r, cy + Math.sin(a1) * r, cz],
      col, mat, [0, 0, 1]);
  }
}
function ringFace(b, r0, r1, cy, cz, seg, col, mat) {
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    b.quad([c0 * r0, cy + s0 * r0, cz], [c1 * r0, cy + s1 * r0, cz],
      [c1 * r1, cy + s1 * r1, cz], [c0 * r1, cy + s0 * r1, cz], col, mat, [0, 0, 1]);
  }
}
function patera(b, cy, cz, r, col = GOLD, mat = M_GOLD) {
  ringFace(b, r * 0.5, r, cy, cz, 8, col, mat);
  b.tri([0, cy + r * 0.42, cz + 0.02], [-r * 0.5, cy - r * 0.34, cz + 0.02], [r * 0.5, cy - r * 0.34, cz + 0.02],
    GOLD_HI, mat, [0, 0, 1]);
}
function upQuad(b, x0, z0, x1, z1, y, col, mat) {
  b.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], col, mat, [0, 1, 0]);
}
function flatQuadZ(b, xa, xb, za, zb, y, col, mat) { upQuad(b, xa, za, xb, zb, y, col, mat); }

// ---------------------------------------------------------------- triangle bookkeeping
export const SALON_TRI = {};
let _sec = 'misc';
let _i0 = 0;
function begin(b, name) { _sec = name; _i0 = b.i.length / 3; }
function end(b) { SALON_TRI[_sec] = (SALON_TRI[_sec] || 0) + b.i.length / 3 - _i0; }
function sect(b, name, fn) { begin(b, name); fn(); end(b); }

// ---------------------------------------------------------------- footprints (for tools/palace-salon-check.mjs)
export const FOOTPRINTS = [];
function fp(name, x, z, hw, hd, yaw, y0, y1) { FOOTPRINTS.push({ n: name, x, z, hw, hd, yaw, y0, y1 }); }

// ================================================================ 1. carpet
// Wine velvet with a gilded border: tunnel carpet -> entrance strip -> ring band ->
// throne approach + the three dais steps. Kept flat (y 30.06..30.87) so the parquet
// medallion and the outer rays stay readable.
const CARPET_Y = FY + 0.06;
function carpetStripZ(b, x0, x1, z0, z1, y, field, border) {
  const bt = 0.20;
  flatQuadZ(b, x0, x1, z0, z1, y, border, M_CARPET);
  flatQuadZ(b, x0 + bt, x1 - bt, z0 + bt, z1 - bt, y + 0.005, field, M_CARPET);
  // centre gold filament
  flatQuadZ(b, (x0 + x1) * 0.5 - 0.05, (x0 + x1) * 0.5 + 0.05, z0 + bt, z1 - bt, y + 0.010, GOLD, M_GOLD);
}
function carpetRingBand(b, r0, r1) {
  const y = CARPET_Y;
  const seg = 96;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU, am = (a0 + a1) * 0.5;
    const c = mixc(WINE, WINE_HI, 0.10 + 0.16 * (0.5 + 0.5 * Math.sin(am * 8)));
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    b.quad([CX + c0 * r0, y, CZ + s0 * r0], [CX + c1 * r0, y, CZ + s1 * r0],
      [CX + c1 * r1, y, CZ + s1 * r1], [CX + c0 * r1, y, CZ + s0 * r1], c, M_CARPET, [0, 1, 0]);
  }
  // gold borders on both edges
  for (const rr of [r0 + 0.09, r1 - 0.09]) {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      b.quad([CX + c0 * (rr - 0.09), y + 0.006, CZ + s0 * (rr - 0.09)], [CX + c1 * (rr - 0.09), y + 0.006, CZ + s1 * (rr - 0.09)],
        [CX + c1 * (rr + 0.09), y + 0.006, CZ + s1 * (rr + 0.09)], [CX + c0 * (rr + 0.09), y + 0.006, CZ + s0 * (rr + 0.09)],
        GOLD, M_GOLD, [0, 1, 0]);
    }
  }
  // 16 gilded diamonds on the band
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU + Math.PI / 32;
    const rm = (r0 + r1) * 0.5 + (i % 2 ? 0.28 : -0.28);
    const ca = Math.cos(a), sa = Math.sin(a), nx = -sa, nz = ca;
    const P = (u, v) => [CX + ca * rm + nx * u + ca * v, CARPET_Y + 0.012, CZ + sa * rm + nz * u + sa * v];
    b.quad(P(-0.26, 0), P(0, -0.26), P(0.26, 0), P(0, 0.26), GOLD, M_GOLD, [0, 1, 0]);
  }
}
function buildCarpet(b) {
  // tunnel: from the outer door line into the hall threshold
  carpetStripZ(b, -2.05, 2.05, 124.12, 129.55, FY + 0.05, WINE, GOLD_D);
  // entrance strip in the hall (the palace threshold block sits at z 129.7..130.05)
  carpetStripZ(b, -2.15, 2.15, 130.10, 136.95, CARPET_Y, WINE, GOLD_D);
  // dais approach (through the apse mouth, between the two flanking columns)
  carpetStripZ(b, -1.55, 1.55, 150.60, 157.53, CARPET_Y, WINE, GOLD_D);
  // ring band round the medallion (leaves r<4.7 parquet visible)
  carpetRingBand(b, 5.00, 7.35);
  // the three steps + platform run (stair carpet with risers)
  const w = 1.30;
  const riser = (z, y0, y1) => {
    b.quad([-w, y0, z], [w, y0, z], [w, y1, z], [-w, y1, z], WINE, M_CARPET, [0, 0, -1]);
    b.quad([-w - 0.10, y0, z - 0.012], [w + 0.10, y0, z - 0.012], [w + 0.10, y1, z - 0.012], [-w - 0.10, y1, z - 0.012], GOLD, M_GOLD, [0, 0, -1]);
  };
  flatQuadZ(b, -w, w, 157.55, 158.25, 30.288, WINE, M_CARPET);
  riser(157.525, 30.06, 30.288);
  flatQuadZ(b, -w, w, 158.25, 158.95, 30.568, WINE, M_CARPET);
  riser(158.225, 30.288, 30.568);
  flatQuadZ(b, -w, w, 158.95, 163.55, 30.848, WINE, M_CARPET);
  riser(158.925, 30.568, 30.848);
  // gold edge lines on the platform + steps
  for (const [z, y] of [[157.57, 30.29], [158.27, 30.57], [158.97, 30.85]]) {
    for (const sx of [-1, 1]) flatQuadZ(b, sx * w, sx * (w + 0.12), z, 163.5, y + 0.002, GOLD, M_GOLD);
  }
}

// ================================================================ 2. throne
const DAIS = { z0: 157.55, z1: 164.15, top: 30.845, throneZ: 162.30 };
function daisGeom(b) {
  // the dais lives in the apse recess only: the two columns that flank the apse
  // mouth stand at (+-3.26, 156.2) with 2.1 m plinths, so nothing may cross z=157.2
  const tiers = [
    { x: 5.30, z0: 157.55, z1: 164.10, y0: 30.00, y1: 30.28, col: MARBLE },
    { x: 4.50, z0: 158.25, z1: 164.00, y0: 30.28, y1: 30.56, col: MARBLE_HI },
    { x: 3.70, z0: 158.95, z1: 163.90, y0: 30.56, y1: 30.845, col: MARBLE },
  ];
  for (const t of tiers) {
    pb(b, 0, (t.y0 + t.y1) * 0.5, (t.z0 + t.z1) * 0.5, t.x * 2, t.y1 - t.y0, t.z1 - t.z0, t.col, M_MARBLE, { topCol: MARBLE_HI });
    // gilded nosing on the front + sides of this tier
    pb(b, 0, t.y1 - 0.035, t.z0 + 0.055, t.x * 2 + 0.02, 0.07, 0.11, GOLD, M_GOLD);
    for (const sx of [-1, 1]) pb(b, sx * (t.x - 0.055), t.y1 - 0.035, (t.z0 + t.z1) * 0.5, 0.11, 0.07, t.z1 - t.z0, GOLD, M_GOLD);
  }
  // a low gilded rail round the platform edge (behind this the throne sits)
  for (const sx of [-1, 1]) {
    pb(b, sx * 3.62, 31.25, 159.05, 0.10, 0.10, 0.10, GOLD, M_GOLD);
    pb(b, sx * 3.62, 31.25, 163.45, 0.10, 0.10, 0.10, GOLD, M_GOLD);
    bar3(b, [sx * 3.62, 31.25, 159.05], [sx * 3.62, 31.25, 163.45], 0.075, 0.075, GOLD, M_GOLD);
    for (let i = 0; i < 4; i++) {
      pb(b, sx * 3.62, 31.14, 159.6 + i * 1.15, 0.05, 0.20, 0.05, GOLD_D, M_GOLD_D);
    }
  }
}
function throneGeom(b) {
  const Y = 0;          // local frame: origin on the platform top
  // ---- plinth + seat
  pb(b, 0, Y + 0.06, 0.6, 2.10, 0.12, 1.80, GOLD_D, M_GOLD_D);
  pb(b, 0, Y + 0.20, 0.55, 1.86, 0.18, 1.55, MARBLE_HI, M_MARBLE);
  pb(b, 0, Y + 0.40, 0.60, 1.70, 0.22, 1.35, WINE, M_VELVET, { topCol: WINE_HI });
  // seat cushion piping
  pb(b, 0, Y + 0.53, 0.60, 1.62, 0.06, 1.24, WINE_HI, M_CLOTH);
  pb(b, 0, Y + 0.28, 0.60, 1.78, 0.05, 1.42, GOLD, M_GOLD);
  // ---- back: gold frame + wine velvet panel with tufting
  pb(b, 0, Y + 1.62, 1.24, 2.02, 2.72, 0.26, GOLD_D, M_GOLD_D);
  pb(b, 0, Y + 1.64, 1.15, 1.78, 2.44, 0.15, WINE, M_VELVET, { topCol: WINE_HI });
  pb(b, 0, Y + 2.90, 1.20, 1.90, 0.14, 0.30, GOLD, M_GOLD);
  for (const sx of [-1, 1]) pb(b, sx * 0.94, Y + 1.70, 1.16, 0.13, 2.55, 0.20, GOLD, M_GOLD);
  // lion-paw feet
  for (const sx of [-1, 1]) {
    at(b, sx * 0.82, Y + 0.10, -0.30, 0, () => ellipsoid(b, 0.11, 0.12, 0.16, 5, 3, GOLD_HI, M_GOLD));
  }
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 4; j++) {
      at(b, -0.54 + i * 0.54, Y + 1.02 + j * 0.30, 1.10, 0, () => ellipsoid(b, 0.045, 0.045, 0.03, 4, 2, GOLD_HI, M_GOLD));
    }
  }
  // gilded crown over the back
  at(b, 0, Y + 3.28, 1.22, 0, () => {
    patera(b, 0, 0, 0.34, GOLD_HI, M_GOLD);
    pb(b, 0, -0.30, 0.02, 0.96, 0.16, 0.20, GOLD, M_GOLD);
    for (let i = 0; i < 3; i++) at(b, -0.30 + i * 0.30, -0.14, 0.02, 0, () => ellipsoid(b, 0.075, 0.16, 0.06, 4, 2, GOLD_HI, M_GOLD));
    for (const s of [-1, 1]) at(b, s * 0.42, 0.02, 0.0, 0, () => ellipsoid(b, 0.11, 0.22, 0.07, 4, 2, GOLD, M_GOLD));
  });
  for (const sx of [-1, 1]) {
    at(b, sx * 0.86, Y + 2.68, 1.20, 0, () => ellipsoid(b, 0.13, 0.22, 0.08, 4, 2, GOLD, M_GOLD));
  }
  // ---- arms: gilded, with velvet pads + ball finials on the front posts
  for (const sx of [-1, 1]) {
    pb(b, sx * 0.93, Y + 0.78, 0.62, 0.24, 0.56, 0.24, GOLD_D, M_GOLD_D);
    pb(b, sx * 0.93, Y + 1.06, 0.26, 0.20, 0.09, 0.90, GOLD_D, M_GOLD_D);
    pb(b, sx * 0.93, Y + 1.14, 0.20, 0.22, 0.08, 0.74, WINE, M_VELVET, { topCol: WINE_HI });
    at(b, sx * 0.93, Y + 1.20, 1.02, 0, () => ellipsoid(b, 0.13, 0.13, 0.13, 6, 3, GOLD, M_GOLD));
  }
  // ---- footstool
  pb(b, 0, Y + 0.16, -0.62, 1.20, 0.32, 0.72, GOLD_D, M_GOLD_D);
  pb(b, 0, Y + 0.35, -0.62, 1.08, 0.10, 0.62, WINE, M_VELVET, { topCol: WINE_HI });
  pb(b, 0, Y + 0.07, -0.62, 1.30, 0.10, 0.82, GOLD, M_GOLD);
}
function baldachinGeom(b) {
  const Y = DAIS.top;
  const PZ = [160.15, 163.55];
  const PX = 2.50;
  const CZ_T = 161.85;                  // tester centre (0.5 m clear of the glass at 164.36)
  // four gilded posts
  for (const sx of [-1, 1]) {
    for (const pz of PZ) {
      pb(b, sx * PX, Y + 0.09, pz, 0.42, 0.18, 0.42, MARBLE_HI, M_MARBLE);
      pb(b, sx * PX, Y + 0.20, pz, 0.34, 0.06, 0.34, GOLD, M_GOLD);
      at(b, sx * PX, Y + 0.23, pz, 0, () => {
        cylinder(b, 8, 0.115, 0.10, 3.90, GOLD, M_GOLD, { y0: 0, caps: false });
        cylinder(b, 8, 0.16, 0.19, 0.14, GOLD_HI, M_GOLD, { y0: 3.90, caps: true });
      });
      // gold collar + rosette at the capital
      pb(b, sx * PX, Y + 4.10, pz, 0.34, 0.14, 0.34, GOLD, M_GOLD);
    }
  }
  // tester: wine velvet slab with a gilded rim + a hanging valance and fringe
  const topY = Y + 4.22;
  pb(b, 0, topY, CZ_T, 5.80, 0.20, 3.55, WINE, M_VELVET, { topCol: WINE_HI });
  pb(b, 0, topY + 0.13, CZ_T, 6.00, 0.09, 3.75, GOLD, M_GOLD);
  // shallow wine dome + gilded ribs + crown: reads as a baldachin, not a slab
  at(b, 0, topY + 0.17, CZ_T, 0, () => {
    lathe(b, [[1.82, 0], [1.66, 0.20], [1.36, 0.38], [0.92, 0.52], [0.46, 0.60], [0.08, 0.62]], 20, WINE, M_VELVET, { smooth: true });
  });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    tubePath(b, [[Math.cos(a) * 1.80, topY + 0.19, CZ_T + Math.sin(a) * 1.80],
      [Math.cos(a) * 0.95, topY + 0.72, CZ_T + Math.sin(a) * 0.95],
      [0, topY + 0.80, CZ_T]], () => 0.045, 4, GOLD, M_GOLD, { caps: false });
  }
  at(b, 0, topY + 0.80, CZ_T, 0, () => {
    ellipsoid(b, 0.15, 0.15, 0.15, 6, 3, GOLD_HI, M_GOLD);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      at(b, Math.cos(a) * 0.19, 0.18, Math.sin(a) * 0.19, 0, () => ellipsoid(b, 0.05, 0.15, 0.05, 4, 2, GOLD, M_GOLD));
    }
  });
  // gilded rim strips
  for (const sz of [-1, 1]) pb(b, 0, topY - 0.14, CZ_T + sz * 1.78, 5.80, 0.09, 0.09, GOLD_HI, M_GOLD);
  for (const sx of [-1, 1]) pb(b, sx * 2.88, topY - 0.14, CZ_T, 0.09, 0.09, 3.55, GOLD_HI, M_GOLD);
  // valance (scalloped wine cloth) + gold fringe on all four edges
  // valance: one continuous scalloped strip per edge (2.72 m inside the rim strips)
  const scx = (x) => 0.30 + 0.34 * (0.5 + 0.5 * Math.cos((x / 2.86) * Math.PI * 3));
  const scz = (z) => 0.30 + 0.34 * (0.5 + 0.5 * Math.cos((z / 1.75) * Math.PI * 3));
  const NX = 18, NZ = 11;
  for (let i = 0; i < NX; i++) {
    const x0 = -2.86 + (i / NX) * 5.72, x1 = -2.86 + ((i + 1) / NX) * 5.72;
    for (const sz of [-1, 1]) {
      const z = CZ_T + sz * 1.70;
      b.quad([x0, topY - 0.08, z], [x1, topY - 0.08, z], [x1, topY - 0.08 - scx(x1), z],
        [x0, topY - 0.08 - scx(x0), z], WINE, M_VELVET, [0, 0, sz]);
      b.quad([x0, topY - 0.08 - scx(x0), z + sz * 0.01], [x1, topY - 0.08 - scx(x1), z + sz * 0.01],
        [x1, topY - 0.14 - scx(x1), z + sz * 0.01], [x0, topY - 0.14 - scx(x0), z + sz * 0.01], GOLD, M_GOLD, [0, 0, sz]);
    }
  }
  for (let i = 0; i < NZ; i++) {
    const z0 = -1.70 + (i / NZ) * 3.40, z1 = -1.70 + ((i + 1) / NZ) * 3.40;
    for (const sx of [-1, 1]) {
      const x = sx * 2.87;
      b.quad([x, topY - 0.08, CZ_T + z0], [x, topY - 0.08, CZ_T + z1], [x, topY - 0.08 - scz(z1), CZ_T + z1],
        [x, topY - 0.08 - scz(z0), CZ_T + z0], WINE, M_VELVET, [sx, 0, 0]);
      b.quad([x + sx * 0.01, topY - 0.08 - scz(z0), CZ_T + z0], [x + sx * 0.01, topY - 0.08 - scz(z1), CZ_T + z1],
        [x + sx * 0.01, topY - 0.14 - scz(z1), CZ_T + z1], [x + sx * 0.01, topY - 0.14 - scz(z0), CZ_T + z0], GOLD, M_GOLD, [sx, 0, 0]);
    }
  }
  // gold fringe lines under the valance
  for (const sz of [-1, 1]) bar3(b, [-2.88, topY - 0.80, CZ_T + sz * 1.71], [2.88, topY - 0.80, CZ_T + sz * 1.71], 0.09, 0.09, GOLD, M_GOLD);
  for (const sx of [-1, 1]) bar3(b, [sx * 2.88, topY - 0.80, CZ_T - 1.71], [sx * 2.88, topY - 0.80, CZ_T + 1.71], 0.09, 0.09, GOLD, M_GOLD);
  // gold crown boss on the tester + gilded crest facing the hall
  at(b, 0, topY + 0.24, CZ_T, 0, () => {
    lathe(b, [[0.06, 0], [0.34, 0.10], [0.46, 0.26], [0.30, 0.36], [0.12, 0.40]], 10, GOLD, M_GOLD);
  });
  at(b, 0, topY - 0.04, CZ_T - 1.80, Math.PI, () => patera(b, 0, 0, 0.30, GOLD_HI, M_GOLD));
  // gilded corner drops
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    at(b, sx * 2.80, topY - 0.88, CZ_T + sz * 1.70, 0, () => ellipsoid(b, 0.09, 0.22, 0.09, 4, 3, GOLD, M_GOLD));
  }
}
function candelabrumGeom(b) {
  // 5-arm gilded candelabrum on a tripod, total 2.55 m
  pb(b, 0, 0.09, 0, 0.66, 0.18, 0.66, MARBLE_HI, M_MARBLE);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    b.push(mtr(Math.cos(a) * 0.20, 0, Math.sin(a) * 0.20, 0));
    bar3(b, [0, 0.10, 0], [0, 0.44, 0], 0.06, 0.06, GOLD_D, M_GOLD_D);
    b.pop();
  }
  b.push(mtr(0, 0.30, 0));
  lathe(b, [[0.10, 0], [0.16, 0.26], [0.10, 0.78], [0.16, 1.06], [0.10, 1.36], [0.13, 1.62]], 10, GOLD, M_GOLD);
  b.pop();
  // arms + candles
  const arms = [[0, 0.30, 1.86], [0, -0.30, 1.86], [0.34, 0, 2.06], [-0.34, 0, 2.06], [0, 0, 2.30]];
  for (const [ax, az, ay] of arms) {
    tubePath(b, [[0, 1.58, 0], [ax * 0.5, ay - 0.12, az * 0.5], [ax, ay - 0.02, az]], () => 0.035, 4, GOLD, M_GOLD, { caps: false });
    at(b, ax, ay, az, 0, () => {
      cylinder(b, 6, 0.10, 0.07, 0.08, GOLD_HI, M_GOLD, { y0: 0, caps: true });
      cylinder(b, 6, 0.048, 0.044, 0.26, mixc(CREAM, GLOW, 0.25), M_WARM, { y0: 0.08, caps: false });
      at(b, 0, 0.40, 0, 0, () => ellipsoid(b, 0.055, 0.12, 0.055, 4, 2, GLOW_W, M_GLOW));
    });
  }
}
function buildThrone(b) {
  daisGeom(b);
  at(b, 0, DAIS.top, DAIS.throneZ, 0, () => throneGeom(b));
  baldachinGeom(b);
  for (const sx of [-1, 1]) {
    at(b, sx * 3.30, DAIS.top, 159.60, 0, () => candelabrumGeom(b));
  }
}

// ================================================================ 3. seating
// settee: local +Z = front (faces the hall centre), origin on the floor
function sofaGeom(b, L, col, colHi) {
  const D = 0.98;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      at(b, sx * (L / 2 - 0.16), 0, sz * (D / 2 - 0.16), 0, () => {
        cylinder(b, 6, 0.05, 0.045, 0.22, GOLD_D, M_GOLD_D, { y0: 0, caps: false });
      });
    }
  }
  pb(b, 0, 0.26, 0, L, 0.14, D, GOLD_D, M_GOLD_D);
  pb(b, 0, 0.235, 0, L + 0.06, 0.05, D + 0.06, GOLD, M_GOLD);
  const cw = (L - 0.20) / 3;
  for (let i = 0; i < 3; i++) {
    pb(b, -L / 2 + 0.10 + cw * (i + 0.5), 0.40, 0.03, cw - 0.05, 0.19, D - 0.24, col, M_VELVET, { topCol: colHi });
  }
  // back
  pb(b, 0, 0.86, -D / 2 + 0.14, L - 0.06, 0.86, 0.24, col, M_VELVET, { topCol: colHi });
  pb(b, 0, 0.86, -D / 2 + 0.31, L - 0.22, 0.70, 0.16, mixc(col, colHi, 0.5), M_VELVET, { topCol: colHi });
  pb(b, 0, 1.33, -D / 2 + 0.14, L + 0.08, 0.10, 0.30, GOLD, M_GOLD);
  // gilded stiles + back rosettes (the back faces the room from most viewpoints)
  for (const sx of [-1, 1]) pb(b, sx * (L / 2 - 0.10), 0.86, -D / 2 + 0.10, 0.09, 0.88, 0.34, GOLD_D, M_GOLD_D);
  for (const u of [-L * 0.24, L * 0.24]) at(b, u, 1.02, -D / 2 + 0.02, Math.PI, () => patera(b, 0, 0, 0.11, GOLD_HI, M_GOLD));
  // arms
  for (const sx of [-1, 1]) {
    const X = sx * (L / 2 - 0.03);
    pb(b, X, 0.68, 0.02, 0.20, 0.44, D - 0.18, col, M_VELVET, { topCol: colHi });
    pb(b, X, 0.93, 0.02, 0.26, 0.08, D - 0.14, GOLD_D, M_GOLD_D);
    at(b, X, 0.99, D / 2 - 0.16, 0, () => ellipsoid(b, 0.11, 0.13, 0.11, 5, 3, GOLD, M_GOLD));
  }
  // tufting buttons along the back
  for (let i = 0; i < 5; i++) {
    at(b, -L / 2 + 0.40 + i * (L - 0.80) / 4, 1.02, -D / 2 + 0.03, 0, () => ellipsoid(b, 0.05, 0.05, 0.035, 4, 2, GOLD_HI, M_GOLD));
  }
  at(b, 0, 1.44, -D / 2 + 0.12, 0, () => patera(b, 0, 0.0, 0.13, GOLD_HI, M_GOLD));
}
function chairGeom(b, col, colHi) { sofaGeom(b, 0.96, col, colHi); }
function teaSet(b, R) {
  // silver tray + pot + two cups + sugar bowl
  at(b, 0, TABLE_TOP + 0.01, 0, 0, () => cylinder(b, 14, 0.34, 0.34, 0.025, SILVER, M_SILVER, { y0: 0, caps: true }));
  at(b, -0.10, TABLE_TOP + 0.05, 0.02, 0, () => {
    lathe(b, [[0.10, 0], [0.13, 0.04], [0.15, 0.14], [0.11, 0.20], [0.05, 0.22]], 10, SILVER, M_SILVER);
    at(b, 0.13, 0.10, 0, 0, () => ellipsoid(b, 0.03, 0.10, 0.035, 4, 2, SILVER, M_SILVER));
    at(b, 0.10, 0.22, 0, 0, () => cylinder(b, 6, 0.02, 0.015, 0.07, GOLD, M_GOLD, { y0: 0, caps: true }));
  });
  for (const [cx, cz] of [[0.16, 0.04], [0.10, -0.16], [-0.16, -0.10]]) {
    at(b, cx, TABLE_TOP + 0.05, cz, 0, () => lathe(b, [[0.03, 0], [0.07, 0.02], [0.075, 0.07], [0.055, 0.09]], 8, CREAM, M_MARBLE));
  }
  void R;
}
function vaseFlowers(b, R, big) {
  const s = big ? 1 : 0.8;
  b.push(mtr(0, TABLE_TOP - 0.02, 0, 0, s));
  lathe(b, [[0.07, 0], [0.15, 0.04], [0.18, 0.16], [0.11, 0.30], [0.13, 0.36]], 10, BLUE_D, M_VELVET);
  b.pop();
  for (let i = 0; i < 7; i++) {
    const a = R() * TAU, rr = (0.05 + R() * 0.14) * s;
    const h = (0.36 + R() * 0.24) * s;
    tubePath(b, [[0, TABLE_TOP + 0.01, 0], [Math.cos(a) * rr * 0.6, TABLE_TOP + 0.01 + h * 0.5, Math.sin(a) * rr * 0.6],
      [Math.cos(a) * rr, TABLE_TOP + 0.01 + h, Math.sin(a) * rr]], () => 0.012 * s, 3, LEAF_D, M_LEAF, { caps: false });
    const fc = i % 3 === 0 ? mixc(BLOOM_A, BLOOM_W, 0.35) : (i % 3 === 1 ? BLOOM_B : mixc(BLOOM_C, BLOOM_W, 0.45));
    at(b, Math.cos(a) * rr, 0.79 + h, Math.sin(a) * rr, 0, () => {
      ellipsoid(b, 0.075 * s, 0.055 * s, 0.075 * s, 5, 3, fc, M_BLOOM);
    });
  }
  // foliage
  for (let i = 0; i < 5; i++) {
    const a = R() * TAU, rr = (0.10 + R() * 0.14) * s;
    at(b, Math.cos(a) * rr, TABLE_TOP + 0.07 + R() * 0.10, Math.sin(a) * rr, 0, () => ellipsoid(b, 0.10 * s, 0.06 * s, 0.10 * s, 4, 2, LEAF_L, M_LEAF));
  }
}
const BLOOM_A = C.bloomPink, BLOOM_B = C.bloomYellow, BLOOM_C = C.bloomRed, BLOOM_W = C.bloomWhite;
function pem(c) { return mixc(c, BLOOM_W, 0.25); }
function booksGeom(b) {
  const bk = [BLUE_D, WINE, MARBLE_SH];
  for (let i = 0; i < 3; i++) {
    pb(b, 0.05 * i, TABLE_TOP + 0.03 + i * 0.055, 0, 0.34 - i * 0.03, 0.05, 0.24, bk[i], M_CLOTH, { topCol: CREAM });
  }
}
function candlestickGeom(b) {
  at(b, 0, TABLE_TOP + 0.01, 0, 0, () => {
    lathe(b, [[0.09, 0], [0.06, 0.03], [0.045, 0.16], [0.075, 0.22], [0.05, 0.26], [0.09, 0.30]], 8, GOLD, M_GOLD);
    at(b, 0, 0.30, 0, 0, () => {
      cylinder(b, 6, 0.045, 0.042, 0.24, mixc(CREAM, GLOW, 0.25), M_WARM, { y0: 0, caps: false });
      at(b, 0, 0.36, 0, 0, () => ellipsoid(b, 0.05, 0.11, 0.05, 4, 2, GLOW_W, M_GLOW));
    });
  });
}
function roundTableGeom(b, R, r, kind) {
  at(b, 0, TABLE_TOP - 0.08, 0, 0, () => {
    cylinder(b, 18, r, r, 0.08, MARBLE, M_MARBLE, { y0: 0, caps: true });
    torus(b, r + 0.015, 0.035, 18, 3, GOLD, M_GOLD);
  });
  at(b, 0, 0.66, 0, 0, () => {
    lathe(b, [[0.32, -0.62], [0.26, -0.52], [0.14, -0.36], [0.13, -0.16], [0.18, -0.06], [0.10, 0]], 10, GOLD_D, M_GOLD_D);
  });
  at(b, 0, 0.02, 0, 0, () => cylinder(b, 12, 0.30, 0.24, 0.06, GOLD_D, M_GOLD_D, { y0: 0, caps: true }));
  if (kind === 'tea') { teaSet(b, R); vaseFlowers(b, R, false); }
  else { candlestickGeom(b); booksGeom(b); }
}
// 8 salon groups, symmetric about the apse axis (x=0), kept out of r<8.2
const GROUPS = [
  { ang: -60, kind: 'grand', col: NAVY, hi: NAVY_HI },
  { ang: 60, kind: 'grand', col: WINE, hi: WINE_HI },
  { ang: 120, kind: 'grand', col: WINE, hi: WINE_HI },
  { ang: 240, kind: 'grand', col: NAVY, hi: NAVY_HI },
  { ang: -30, kind: 'duo', col: NAVY, hi: NAVY_HI },
  { ang: 30, kind: 'duo', col: WINE, hi: WINE_HI },
  { ang: 150, kind: 'duo', col: WINE, hi: WINE_HI },
  { ang: 210, kind: 'duo', col: NAVY, hi: NAVY_HI },
];
function buildSeating(b, R) {
  for (const g of GROUPS) {
    const a = deg(g.ang);
    if (g.kind === 'grand') {
      const [sx, sz] = polar(a, 10.65);
      at(b, sx, FY, sz, a + Math.PI / 2, () => sofaGeom(b, 2.60, g.col, g.hi));
      fp('settee', sx, sz, 1.32, 0.52, a + Math.PI / 2, FY, FY + 1.6);
      const [tx, tz] = polar(a, 9.42);
      at(b, tx, FY, tz, 0, () => roundTableGeom(b, R, 0.55, 'tea'));
      fp('table', tx, tz, 0.56, 0.56, 0, FY, FY + 0.9);
      for (const s of [-1, 1]) {
        const [cx2, cz2] = polar(a + s * 0.162, 8.80);
        const yaw = faceYaw(tx - cx2, tz - cz2);
        at(b, cx2, FY, cz2, yaw, () => chairGeom(b, g.col, g.hi));
        fp('armchair', cx2, cz2, 0.48, 0.48, yaw, FY, FY + 1.6);
      }
    } else {
      const [tx, tz] = polar(a, 9.62);
      at(b, tx, FY, tz, 0, () => roundTableGeom(b, R, 0.46, 'still'));
      fp('side table', tx, tz, 0.47, 0.47, 0, FY, FY + 0.9);
      for (const s of [-1, 1]) {
        const [cx2, cz2] = polar(a + s * 0.170, 9.62);
        const yaw = faceYaw(tx - cx2, tz - cz2);
        at(b, cx2, FY, cz2, yaw, () => chairGeom(b, g.col, g.hi));
        fp('armchair', cx2, cz2, 0.48, 0.48, yaw, FY, FY + 1.6);
      }
    }
  }
}

// ================================================================ 4. piers: mirrors, consoles, urns, trees
function urnGeom(b, R) {
  pb(b, 0, 0.48, 0, 0.56, 0.96, 0.56, MARBLE, M_MARBLE, { topCol: MARBLE_HI });
  pb(b, 0, 0.13, 0, 0.64, 0.10, 0.64, GOLD, M_GOLD);
  pb(b, 0, 0.92, 0, 0.64, 0.08, 0.64, GOLD, M_GOLD);
  b.push(mtr(0, 0.96, 0));
  lathe(b, [[0.10, 0], [0.22, 0.05], [0.31, 0.20], [0.35, 0.40], [0.29, 0.56], [0.21, 0.64], [0.25, 0.68]], 12, GOLD, M_GOLD);
  b.pop();
  for (const sx of [-1, 1]) {
    at(b, sx * 0.34, 1.44, 0, 0, () => ellipsoid(b, 0.055, 0.13, 0.055, 4, 2, GOLD_HI, M_GOLD));
  }
  // flower spray
  for (let i = 0; i < 14; i++) {
    const a = R() * TAU, rr = 0.06 + R() * 0.34;
    const h = 0.74 + R() * 0.52;
    at(b, Math.cos(a) * rr, 0.96 + h, Math.sin(a) * rr, 0, () => {
      const c = i % 4 === 0 ? BLOOM_C : (i % 4 === 1 ? BLOOM_A : (i % 4 === 2 ? BLOOM_Y : BLOOM_W));
      ellipsoid(b, 0.09, 0.065, 0.09, 5, 3, c, M_BLOOM);
    });
  }
  for (let i = 0; i < 9; i++) {
    const a = R() * TAU, rr = 0.10 + R() * 0.30;
    at(b, Math.cos(a) * rr, 1.62 + R() * 0.14, Math.sin(a) * rr, 0, () => ellipsoid(b, 0.13, 0.07, 0.13, 4, 2, i % 2 ? LEAF : LEAF_L, M_LEAF));
  }
}
const BLOOM_Y = C.bloomYellow;
function orangeTreeGeom(b, R) {
  b.push(mtr(0, 0, 0));
  lathe(b, [[0.32, 0], [0.28, 0.10], [0.30, 0.50], [0.40, 0.58], [0.42, 0.68]], 12, GOLD, M_GOLD);
  b.pop();
  at(b, 0, 0.66, 0, 0, () => cylinder(b, 6, 0.075, 0.05, 1.55, mixc(WOOD, C.bronze, 0.35), M_WOOD, { y0: 0, caps: false }));
  for (const s of [-1, 1]) {
    tubePath(b, [[0, 1.45, 0], [s * 0.24, 1.80, 0.06], [s * 0.42, 2.02, 0.12]], () => 0.035, 4, mixc(WOOD, C.bronze, 0.35), M_WOOD, { caps: false });
  }
  for (let i = 0; i < 7; i++) {
    const a = R() * TAU, rr = 0.10 + R() * 0.46;
    at(b, Math.cos(a) * rr, 1.92 + R() * 0.80, Math.sin(a) * rr, 0, () => {
      const r0 = 0.30 + R() * 0.22;
      ellipsoid(b, r0, r0 * 0.78, r0, 6, 3, i % 3 === 0 ? LEAF_D : (i % 3 === 1 ? LEAF : LEAF_L), M_LEAF);
    });
  }
  for (let i = 0; i < 12; i++) {
    const a = R() * TAU, rr = 0.16 + R() * 0.52;
    at(b, Math.cos(a) * rr, 1.95 + R() * 0.76, Math.sin(a) * rr, 0, () => {
      ellipsoid(b, 0.075, 0.075, 0.075, 5, 3, mixc(C.koiGold, C.bloomYellow, 0.35), M_BLOOM);
    });
  }
}
function sconceGeom(b) {
  // local +Z = out of the wall
  pb(b, 0, 0, 0.05, 0.34, 0.64, 0.09, GOLD_D, M_GOLD_D);
  pb(b, 0, 0, 0.02, 0.44, 0.16, 0.06, GOLD, M_GOLD);
  pb(b, 0, 0.34, 0.10, 0.30, 0.34, 0.03, SILVER, M_MIRROR);
  for (const s of [-1, 1]) {
    tubePath(b, [[s * 0.04, 0.02, 0.10], [s * 0.24, -0.04, 0.26], [s * 0.34, 0.06, 0.38]], () => 0.028, 4, GOLD, M_GOLD, { caps: false });
    at(b, s * 0.34, 0.12, 0.38, 0, () => {
      cylinder(b, 6, 0.09, 0.06, 0.08, GOLD_HI, M_GOLD, { y0: 0, caps: true });
      cylinder(b, 6, 0.045, 0.042, 0.22, mixc(CREAM, GLOW, 0.25), M_WARM, { y0: 0.08, caps: false });
      at(b, 0, 0.34, 0, 0, () => ellipsoid(b, 0.05, 0.10, 0.05, 4, 2, GLOW_W, M_GLOW));
    });
  }
  at(b, 0, 0.40, 0.06, 0, () => patera(b, 0, 0, 0.11, GOLD_HI, M_GOLD));
  // crest above the arms
  at(b, 0, 0.56, 0.08, 0, () => patera(b, 0, 0, 0.13, GOLD_HI, M_GOLD));
  for (const s of [-1, 1]) at(b, s * 0.20, 0.46, 0.06, 0, () => ellipsoid(b, 0.06, 0.14, 0.05, 4, 2, GOLD, M_GOLD));
}
function trumeauGeom(b, R) {
  // console table (bottom) + tall gilded mirror standing on it
  const HGT = 0.86;
  pb(b, 0, HGT - 0.04, 0, 2.20, 0.08, 0.62, MARBLE, M_MARBLE, { topCol: MARBLE_HI });
  pb(b, 0, HGT - 0.10, 0, 2.26, 0.05, 0.66, GOLD, M_GOLD);
  for (const sx of [-1, 1]) {
    pb(b, sx * 0.98, HGT * 0.5, 0, 0.10, HGT, 0.10, GOLD_D, M_GOLD_D);
    at(b, sx * 0.98, 0.14, 0, 0, () => ellipsoid(b, 0.10, 0.06, 0.10, 5, 2, GOLD, M_GOLD));
  }
  pb(b, 0, 0.10, 0, 2.30, 0.20, 0.58, GOLD_D, M_GOLD_D);
  // mirror plate + frame
  const my = HGT + 1.42;
  at(b, 0, my, -0.20, 0, () => {
    b.quad([-0.95, -1.42, 0.02], [0.95, -1.42, 0.02], [0.95, 1.42, 0.02], [-0.95, 1.42, 0.02], SILVER, M_MIRROR, [0, 0, 1]);
    b.quad([-0.95, 0.5, 0.04], [0.95, 0.5, 0.04], [0.95, 1.42, 0.04], [-0.95, 1.42, 0.04], mixc(SILVER, C.cloudLit, 0.5), M_MIRROR, [0, 0, 1]);
    frameXY(b, 2.10, 3.04, 0.16, GOLD, M_GOLD, { d: 0.20 });
    for (let i = 0; i < 4; i++) {
      at(b, -0.72 + i * 0.48, 1.30, 0.12, 0, () => ellipsoid(b, 0.10, 0.14, 0.06, 4, 2, GOLD_HI, M_GOLD));
    }
    at(b, 0, 1.58, 0.10, 0, () => patera(b, 0, 0, 0.20, GOLD_HI, M_GOLD));
    // two volutes at the top corners
    for (const sx of [-1, 1]) at(b, sx * 0.92, 1.44, 0.10, 0, () => ellipsoid(b, 0.14, 0.10, 0.07, 4, 2, GOLD, M_GOLD));
  });
  // a vase + a small clock on the console top
  at(b, -0.62, HGT + 0.02 - TABLE_TOP, 0, 0, () => vaseFlowers(b, R, false));
  at(b, 0.60, HGT + 0.02 - TABLE_TOP, 0, 0, () => candlestickGeom(b));
}
const PIERS = [deg(45), deg(135), deg(-45), deg(225)];
const URN_PIERS = [deg(-15), deg(15), deg(165), deg(195)];
function buildPiers(b, R) {
  for (const ang of PIERS) {
    atA(b, ang, 14.10, FY, () => {
      trumeauGeom(b, R);
      const [x, z] = polar(ang, 14.10);
      fp('mirror console', x, z, 1.13, 0.34, ang + Math.PI / 2, FY, FY + 4.8);
    });
  }
  for (const ang of URN_PIERS) {
    atA(b, ang, 14.05, FY, () => urnGeom(b, R));
    const [x, z] = polar(ang, 14.05);
    fp('urn', x, z, 0.33, 0.33, 0, FY, FY + 2.4);
  }
  // four more urns: two flanking the dais, two flanking the throne approach
  for (const [x, z, y] of [[-4.85, 162.40, DAIS.top - 0.565], [4.85, 162.40, DAIS.top - 0.565],
    [-5.15, 148.10, FY], [5.15, 148.10, FY]]) {
    at(b, x, y, z, 0, () => urnGeom(b, R));
    fp('urn', x, z, 0.33, 0.33, 0, y, y + 2.4);
  }
  // six orange trees: two on the dais, two at the entrance, two on the crossing
  at(b, -5.55, FY, 155.10, 0, () => orangeTreeGeom(b, R));
  at(b, 5.55, FY, 155.10, 0, () => orangeTreeGeom(b, R));
  fp('orange', -5.55, 155.10, 0.47, 0.47, 0, FY, FY + 2.9);
  fp('orange', 5.55, 155.10, 0.47, 0.47, 0, FY, FY + 2.9);
  for (const [x, z] of [[-4.95, 132.30], [4.95, 132.30], [-7.85, 144.0], [7.85, 144.0]]) {
    at(b, x, FY, z, 0, () => orangeTreeGeom(b, R));
    fp('orange', x, z, 0.47, 0.47, 0, FY, FY + 2.9);
  }
  // 8 gilded wall sconces on the eight usable piers
  for (const ang of [...PIERS, ...URN_PIERS]) {
    atA(b, ang, 14.40, 0, () => at(b, 0, FY + 8.55, 0, 0, () => sconceGeom(b)));
  }
}

// ================================================================ 5. damask hangings between the columns
// 10 bays (skip the apse bay 90 and the entrance bay 270). Each bay gets a gilded
// rod across the chord between capitals with a gathered blue damask valance.
const BAYS = [-60, -30, 0, 30, 60, 120, 150, 180, 210, 240];
const COL_R = 12.6;
const ROD_Y = FY + 15.05;
function valanceGeom(b) {
  const W = COL_R * Math.sin(deg(15));
  const YB = -4.35;                                  // hem: y = 40.7 (above the bay paintings)
  const rows = 6, cols = 24;
  // the cloth, with sinusoidal folds and a soft vertical gradient — no stripes
  const foldU = (u) => 0.14 + 0.13 * Math.sin(u * 2.4 + 0.5) + 0.045 * Math.sin(u * 6.3 + 1.1);
  for (let r = 0; r < rows; r++) {
    const t0 = r / rows, t1 = (r + 1) / rows;
    const y0 = YB * t0, y1 = YB * t1;
    for (let i = 0; i < cols; i++) {
      const u0 = -W + (i / cols) * 2 * W, u1 = -W + ((i + 1) / cols) * 2 * W;
      const um = (u0 + u1) * 0.5;
      const shade = (0.86 + 0.14 * Math.sin(um * 2.4 + 0.5)) * (1.04 - 0.20 * t1);
      const c = mulc(mixc(BLUE, BLUE_D, 0.16 + 0.34 * t1), shade);
      b.quad([u0, y0, foldU(u0)], [u1, y0, foldU(u1)], [u1, y1, foldU(u1) + 0.04], [u0, y1, foldU(u0) + 0.04], c, M_VELVET, [0, 0, 1]);
    }
  }
  // gathered swag across the top, scalloped hem with a gold trim line
  for (let i = 0; i < cols; i++) {
    const u0 = -W + (i / cols) * 2 * W, u1 = -W + ((i + 1) / cols) * 2 * W;
    const sc = (u) => 0.24 + 0.30 * (0.5 + 0.5 * Math.cos((u / W) * Math.PI * 2));
    const z = (u) => foldU(u) + 0.06;
    const c = mulc(mixc(BLUE_HI, BLUE, 0.40), 0.94 + 0.06 * Math.cos((u0 / W) * Math.PI * 2));
    b.quad([u0, 0.10, z(u0)], [u1, 0.10, z(u1)], [u1, 0.10 - sc(u1), z(u1)], [u0, 0.10 - sc(u0), z(u0)], c, M_VELVET, [0, 0, 1]);
    b.quad([u0, 0.10 - sc(u0), z(u0) + 0.01], [u1, 0.10 - sc(u1), z(u1) + 0.01],
      [u1, 0.02 - sc(u1), z(u1) + 0.01], [u0, 0.02 - sc(u0), z(u0) + 0.01], GOLD, M_GOLD, [0, 0, 1]);
  }
  // gilded hem band + fringe
  for (let i = 0; i < cols; i++) {
    const u0 = -W + (i / cols) * 2 * W, u1 = -W + ((i + 1) / cols) * 2 * W;
    b.quad([u0, YB + 0.28, foldU(u0) + 0.05], [u1, YB + 0.28, foldU(u1) + 0.05],
      [u1, YB, foldU(u1) + 0.05], [u0, YB, foldU(u0) + 0.05], GOLD, M_GOLD, [0, 0, 1]);
  }
  for (let i = 0; i < 39; i++) {
    const u = -W + 0.10 + (i / 38) * (2 * W - 0.20);
    at(b, u, YB - 0.02, foldU(u) + 0.06, 0, () => ellipsoid(b, 0.035, 0.11, 0.035, 4, 2, GOLD, M_GOLD));
  }
  // gilded rod + finials + tie-back tassels
  bar3(b, [-W - 0.28, 0.14, 0.18], [W + 0.28, 0.14, 0.18], 0.12, 0.12, GOLD, M_GOLD);
  for (const sx of [-1, 1]) {
    at(b, sx * (W + 0.32), 0.14, 0.18, 0, () => ellipsoid(b, 0.13, 0.13, 0.13, 5, 3, GOLD_HI, M_GOLD));
    for (let k = 0; k < 3; k++) {
      at(b, sx * (W - 0.20), -1.05 - k * 0.62, 0.20, 0, () => ellipsoid(b, 0.055, 0.17, 0.055, 4, 2, GOLD, M_GOLD));
    }
  }
  // central cartouche + two smaller medallions
  at(b, 0, -2.20, 0.28, 0, () => {
    patera(b, 0, 0, 0.30, GOLD_HI, M_GOLD);
    for (const s of [-1, 1]) at(b, s * 0.44, 0, -0.02, 0, () => ellipsoid(b, 0.08, 0.21, 0.06, 4, 2, GOLD, M_GOLD));
  });
  for (const sx of [-1, 1]) {
    at(b, sx * W * 0.58, -2.15, 0.26, 0, () => patera(b, 0, 0, 0.17, GOLD, M_GOLD));
  }
}
function buildHangings(b) {
  for (const dAng of BAYS) {
    const a = deg(dAng);
    const [x, z] = polar(a, COL_R);
    at(b, x, ROD_Y - 0.06, z, a + Math.PI / 2, () => valanceGeom(b));
  }
}

// ================================================================ 6. gold-framed oil paintings
const PAINT_BAYS = [0, 30, 60, 120, 150, 180];
function paintingGeom(b, R, idx) {
  const w = 1.72, h = 2.42;
  const cy = 39.20, cz = 0.33;
  // frame (outer gold, inner bead)
  at(b, 0, cy, cz, 0, () => {
    frameXY(b, w + 0.18, h + 0.18, 0.11, GOLD, M_GOLD, { d: 0.14 });
    frameXY(b, w, h, 0.05, GOLD_HI, M_GOLD, { d: 0.10 });
  });
  // canvas: layered painted fields inside a gilded liner, three subjects cycling
  const zc = cz + 0.02;
  const kind = idx % 3;
  const X0 = -w / 2, X1 = w / 2, YB = cy - h / 2, YT = cy + h / 2;
  const ax0 = X0 + 0.06, ax1 = X1 - 0.06, ayb = YB + 0.06, ayt = YT - 0.06;
  const Aband = (y0, y1, c, zo) => b.quad([ax0, y0, zc + zo], [ax1, y0, zc + zo], [ax1, y1, zc + zo], [ax0, y1, zc + zo], c, M_PAINT, [0, 0, 1]);
  // gilded liner
  b.quad([X0, YB, zc - 0.005], [X1, YB, zc - 0.005], [X1, YT, zc - 0.005], [X0, YT, zc - 0.005], mixc(GOLD, MARBLE_SH, 0.50), M_PAINT, [0, 0, 1]);
  if (kind === 0) {
    // landscape: graded sky, sun, three hill silhouettes, water, dark foreground
    Aband(cy + 0.55, ayt, mixc(PAINT[0], C.horizon, 0.30), 0.002);
    Aband(cy + 0.16, cy + 0.55, mixc(PAINT[0], C.horizon, 0.66), 0.003);
    Aband(cy - 0.04, cy + 0.16, mixc(C.horizon, C.sunGlow, 0.35), 0.004);
    discFace(b, 0.18, cy + 0.84, zc + 0.006, 12, mixc(C.sunGlow, GOLD_HI, 0.45), M_WARM);
    const hill = (cxh, hw, hh, c, zo) =>
      b.tri([cxh - hw, cy - 0.04, zc + zo], [cxh + hw, cy - 0.04, zc + zo], [cxh, cy - 0.04 + hh, zc + zo], c, M_PAINT, [0, 0, 1]);
    hill(-0.34, 0.66, 0.48, mixc(PAINT[1], C.haze, 0.45), 0.005);
    hill(0.36, 0.58, 0.34, mixc(PAINT[1], C.haze, 0.28), 0.006);
    hill(0.02, 0.80, 0.24, mixc(PAINT[1], C.cloudShade, 0.40), 0.007);
    Aband(ayb + 0.32, cy - 0.04, mixc(PC.glowSky, C.waterDeep, 0.50), 0.008);
    Aband(ayb, ayb + 0.32, mixc(PAINT[1], C.leafDark, 0.55), 0.009);
    b.tri([ax0 + 0.14, ayb + 0.32, zc + 0.010], [ax0 + 0.34, ayb + 0.32, zc + 0.010], [ax0 + 0.24, ayb + 0.98, zc + 0.010],
      mixc(C.leafDark, C.iron, 0.45), M_PAINT, [0, 0, 1]);
    b.tri([ax1 - 0.30, ayb + 0.32, zc + 0.010], [ax1 - 0.14, ayb + 0.32, zc + 0.010], [ax1 - 0.22, ayb + 0.78, zc + 0.010],
      mixc(C.leafDark, C.iron, 0.55), M_PAINT, [0, 0, 1]);
  } else if (kind === 1) {
    // portrait: warm chiaroscuro ground, gown, ruff, head, hair
    Aband(ayb, ayt, mixc(PAINT[4], C.iron, 0.60), 0.002);
    discFace(b, 0.58, cy + 0.40, zc + 0.004, 16, mixc(C.gold, C.bronze, 0.45), M_PAINT);
    at(b, 0, cy - 0.64, zc + 0.006, 0, () => ellipsoid(b, 0.74, 0.56, 0.02, 10, 4, mixc(WINE, NAVY, 0.35), M_PAINT));
    at(b, 0, cy - 0.38, zc + 0.010, 0, () => ellipsoid(b, 0.42, 0.14, 0.02, 8, 3, mixc(CREAM, GOLD, 0.30), M_PAINT));
    at(b, 0, cy + 0.14, zc + 0.012, 0, () => ellipsoid(b, 0.30, 0.38, 0.02, 8, 4, mixc(C.skin, CREAM, 0.22), M_PAINT));
    at(b, 0, cy + 0.36, zc + 0.011, 0, () => ellipsoid(b, 0.33, 0.28, 0.02, 8, 3, mixc(PAINT[4], C.bronze, 0.45), M_PAINT));
    for (const sx of [-1, 1]) {
      b.quad([sx * 0.13 - 0.035, cy + 0.20, zc + 0.014], [sx * 0.13 + 0.035, cy + 0.20, zc + 0.014],
        [sx * 0.13 + 0.035, cy + 0.24, zc + 0.014], [sx * 0.13 - 0.035, cy + 0.24, zc + 0.014], mixc(C.iron, WINE, 0.25), M_PAINT, [0, 0, 1]);
    }
    b.quad([-0.06, cy + 0.04, zc + 0.014], [0.06, cy + 0.04, zc + 0.014], [0.06, cy + 0.07, zc + 0.014], [-0.06, cy + 0.07, zc + 0.014], mixc(C.bloomRed, WINE, 0.4), M_PAINT, [0, 0, 1]);
  } else {
    // still life: dark ground, a lit table, fruit, a silver jug, a glass
    Aband(cy - 0.18, ayt, mixc(PAINT[4], C.iron, 0.70), 0.002);
    Aband(ayb, cy - 0.18, mixc(C.bronze, PAINT[2], 0.30), 0.003);
    b.quad([ax0, cy - 0.22, zc + 0.005], [ax1, cy - 0.22, zc + 0.005], [ax1, cy - 0.14, zc + 0.005], [ax0, cy - 0.14, zc + 0.005],
      mixc(PAINT[2], GOLD, 0.25), M_PAINT, [0, 0, 1]);
    at(b, 0, cy - 0.22, zc + 0.007, 0, () => { discFace(b, 0.44, 0, 0, 14, mixc(CREAM, MARBLE_SH, 0.4), M_PAINT); });
    for (const [fx, fy, fr, fc] of [[-0.40, -0.44, 0.15, mixc(C.koiRed, C.trainRed, 0.35)],
      [-0.12, -0.40, 0.17, mixc(C.koiGold, C.bloomYellow, 0.30)],
      [0.18, -0.45, 0.13, mixc(C.bloomRed, WINE, 0.40)],
      [0.02, -0.52, 0.11, mixc(C.leaf, C.leafDark, 0.35)]]) {
      at(b, fx, cy + fy, zc + 0.009, 0, () => ellipsoid(b, fr, fr * 0.92, 0.03, 6, 3, fc, M_PAINT));
    }
    at(b, 0.46, cy - 0.30, zc + 0.010, 0, () => lathe(b, [[0.11, -0.28], [0.15, -0.18], [0.13, 0.02], [0.07, 0.10]], 8, SILVER, M_SILVER));
    at(b, -0.56, cy - 0.26, zc + 0.010, 0, () => lathe(b, [[0.05, -0.22], [0.09, -0.12], [0.02, 0.04]], 6, mixc(CREAM, PC.glowSky, 0.4), M_SILVER));
  }
  // a gilded console bracket + name-plate under the frame
  at(b, 0, cy - h / 2 - 0.22, cz, 0, () => {
    pb(b, 0, 0, 0.02, 0.56, 0.12, 0.20, GOLD, M_GOLD);
    for (const sx of [-1, 1]) at(b, sx * 0.24, -0.14, 0.02, 0, () => ellipsoid(b, 0.07, 0.16, 0.06, 4, 2, GOLD, M_GOLD));
    patera(b, -0.30, 0.02, 0.12, GOLD_HI, M_GOLD);
  });
  void R;
}
function buildPaintings(b, R) {
  let i = 0;
  for (const dAng of PAINT_BAYS) {
    const a = deg(dAng);
    atA(b, a, 14.88, 0, () => paintingGeom(b, R, i++));
  }
}

// ================================================================ 7. secondary chandeliers (r = 8 ring)
const DOME_R = 14.92, DOME_Y = 62.0;
function chandelierGeom(b, RR) {
  // chain up to the dome soffit
  const domeY = DOME_Y + Math.sqrt(Math.max(0, DOME_R * DOME_R - RR * RR));
  const chainTop = FY + 9.88;
  at(b, 0, 0, 0, 0, () => {
    cylinder(b, 4, 0.035, 0.035, domeY - chainTop, GOLD_D, M_GOLD_D, { y0: chainTop, caps: false });
    at(b, 0, domeY - 0.16, 0, 0, () => ellipsoid(b, 0.30, 0.22, 0.30, 6, 3, GOLD, M_GOLD));
    for (let i = 0; i < 5; i++) {
      at(b, 0, chainTop + 0.9 + i * ((domeY - chainTop - 1.6) / 4), 0, 0, () => ellipsoid(b, 0.085, 0.07, 0.085, 4, 2, GOLD_HI, M_GOLD));
    }
  });
  // body: stem + two candle tiers
  at(b, 0, FY + 9.05, 0, 0, () => {
    lathe(b, [[0.05, -0.55], [0.18, -0.34], [0.26, -0.12], [0.16, 0.12], [0.30, 0.34], [0.22, 0.58], [0.13, 0.80]], 10, GOLD, M_GOLD);
    at(b, 0, -0.62, 0, 0, () => ellipsoid(b, 0.16, 0.20, 0.16, 6, 3, GOLD_HI, M_GOLD));
  });
  const tiers = [{ y: FY + 9.95, r: 1.02, n: 10 }, { y: FY + 9.05, r: 0.62, n: 6 }];
  for (const t of tiers) {
    at(b, 0, t.y, 0, 0, () => torus(b, t.r, 0.045, 16, 3, GOLD, M_GOLD));
    for (let i = 0; i < t.n; i++) {
      const a = (i / t.n) * TAU;
      tubePath(b, [[Math.cos(a) * 0.14, t.y + 0.20, Math.sin(a) * 0.14],
        [Math.cos(a) * (t.r * 0.6), t.y - 0.05, Math.sin(a) * (t.r * 0.6)],
        [Math.cos(a) * t.r, t.y + 0.01, Math.sin(a) * t.r]], () => 0.028, 4, GOLD, M_GOLD, { caps: false });
      at(b, Math.cos(a) * t.r, t.y + 0.05, Math.sin(a) * t.r, 0, () => {
        cylinder(b, 5, 0.062, 0.045, 0.06, GOLD_HI, M_GOLD, { y0: 0, caps: true });
        cylinder(b, 5, 0.030, 0.028, 0.17, mixc(CREAM, GLOW, 0.25), M_WARM, { y0: 0.06, caps: false });
        at(b, 0, 0.29, 0, 0, () => ellipsoid(b, 0.045, 0.09, 0.045, 4, 2, GLOW_W, M_GLOW));
      });
    }
  }
  // crystal drops under the tiers + a bottom finial
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.2;
    at(b, Math.cos(a) * 0.62, FY + 8.30, Math.sin(a) * 0.62, 0, () => ellipsoid(b, 0.05, 0.14, 0.05, 4, 2, mixc(SILVER, GLOW, 0.4), M_SILVER));
  }
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    at(b, Math.cos(a) * 0.90, FY + 9.62, Math.sin(a) * 0.90, 0, () => ellipsoid(b, 0.042, 0.12, 0.042, 4, 2, mixc(SILVER, GLOW, 0.5), M_SILVER));
  }
  at(b, 0, FY + 8.10, 0, 0, () => ellipsoid(b, 0.13, 0.22, 0.13, 6, 3, GOLD_HI, M_GOLD));
}
const CHANDELIERS = [0, 60, 120, 180, 240, 300];
function buildChandeliers(b) {
  for (const dAng of CHANDELIERS) {
    const [x, z] = polar(deg(dAng), 8.0);
    at(b, x, 0, z, 0, () => chandelierGeom(b, 8.0));
  }
}

// ================================================================ 8. entrance: doors, carpet, guards, shield
function doorLeafGeom(b, s) {
  // local XY = the leaf plane, +X along the tunnel, +Y up, leaf 4.4 x 8.5
  const W = 4.40, Hh = 8.50;
  pb(b, 0, Hh * 0.5, 0, W, Hh, 0.14, GOLD_D, M_GOLD_D);
  // gilded stiles / rails
  for (const sx of [-1, 1]) pb(b, sx * (W / 2 - 0.13), Hh * 0.5, 0.02, 0.26, Hh, 0.16, GOLD, M_GOLD);
  for (const sy of [-1, 1]) pb(b, 0, Hh * 0.5 + sy * (Hh / 2 - 0.16), 0.02, W, 0.32, 0.16, GOLD, M_GOLD);
  for (const yy of [1.35, 3.55, 5.75]) pb(b, 0, yy, 0.02, W - 0.30, 0.16, 0.15, GOLD, M_GOLD);
  // blue + wine velvet panels
  const panels = [[0.36, 1.26], [1.44, 3.46], [3.64, 5.66], [5.84, 7.86]];
  panels.forEach(([y0, y1], i) => {
    const col = i % 2 === 0 ? BLUE : WINE;
    pb(b, 0, (y0 + y1) * 0.5, 0.05, W - 0.62, y1 - y0, 0.07, col, M_VELVET, { topCol: mixc(col, GOLD, 0.12) });
    pb(b, 0, (y0 + y1) * 0.5, 0.09, W - 0.94, (y1 - y0) - 0.28, 0.04, mulc(col, 0.80), M_VELVET);
    // gilded cabochon in the panel centre
    at(b, 0, (y0 + y1) * 0.5, 0.12, 0, () => patera(b, 0, 0, 0.22, GOLD, M_GOLD));
  });
  // big ring handle near the free edge
  const hx = -s * (W / 2 - 0.55);
  at(b, hx, 3.9, 0.12, 0, () => {
    torus(b, 0.30, 0.06, 14, 3, GOLD_HI, M_GOLD, 'z');
  });
}
function guardGeom(b, s) {
  // a halberdier on a marble plinth, local +Z = facing the hall
  pb(b, 0, 0.32, 0, 0.84, 0.64, 0.84, MARBLE, M_MARBLE, { topCol: MARBLE_HI });
  pb(b, 0, 0.66, 0, 0.90, 0.10, 0.90, GOLD, M_GOLD);
  pb(b, 0, 0.26, 0, 0.96, 0.10, 0.96, GOLD_D, M_GOLD_D);
  // legs + boots
  for (const sx of [-1, 1]) {
    pb(b, sx * 0.15, 0.80, 0.02, 0.20, 0.24, 0.30, GOLD_D, M_GOLD_D);
    at(b, sx * 0.15, 0.94, 0, 0, () => cylinder(b, 6, 0.105, 0.09, 0.70, GOLD_D, M_GOLD_D, { y0: 0, caps: true }));
  }
  // cuirass
  at(b, 0, 1.62, 0, 0, () => {
    lathe(b, [[0.26, 0], [0.32, 0.12], [0.35, 0.34], [0.30, 0.52], [0.20, 0.60], [0.13, 0.66]], 10, GOLD, M_GOLD);
  });
  pb(b, 0, 1.60, 0, 0.72, 0.10, 0.42, GOLD_HI, M_GOLD);
  // shoulders + arms
  for (const sx of [-1, 1]) {
    at(b, sx * 0.30, 2.16, 0, 0, () => ellipsoid(b, 0.15, 0.13, 0.15, 5, 3, GOLD, M_GOLD));
    tubePath(b, [[sx * 0.34, 2.10, 0], [sx * 0.42, 1.80, 0.06], [sx * 0.36, 1.55, 0.16]], () => 0.075, 4, GOLD_D, M_GOLD_D, { caps: false });
    at(b, sx * 0.36, 1.52, 0.16, 0, () => ellipsoid(b, 0.075, 0.075, 0.075, 4, 2, mixc(C.skin, CREAM, 0.3), M_PAINT));
  }
  // neck + head + helmet
  at(b, 0, 2.26, 0, 0, () => cylinder(b, 6, 0.10, 0.10, 0.14, mixc(C.skin, CREAM, 0.3), M_PAINT, { y0: 0, caps: false }));
  at(b, 0, 2.50, 0.01, 0, () => ellipsoid(b, 0.17, 0.20, 0.17, 6, 3, mixc(C.skin, CREAM, 0.32), M_PAINT));
  at(b, 0, 2.62, 0, 0, () => ellipsoid(b, 0.22, 0.20, 0.22, 6, 3, GOLD, M_GOLD, { v1: 0.62 }));
  pb(b, 0, 2.74, -0.02, 0.34, 0.10, 0.30, GOLD_HI, M_GOLD);
  // plume
  at(b, 0, 2.90, -0.06, 0, () => ellipsoid(b, 0.10, 0.26, 0.10, 5, 3, WINE, M_CLOTH));
  // cloak down the back
  b.quad([-0.36, 2.16, -0.16], [0.36, 2.16, -0.16], [0.44, 0.94, -0.30], [-0.44, 0.94, -0.30], WINE, M_VELVET, [0, 0, -1]);
  b.quad([-0.44, 0.94, -0.30], [0.44, 0.94, -0.30], [0.30, 0.80, -0.24], [-0.30, 0.80, -0.24], WINE_HI, M_CLOTH, [0, 0, -1]);
  // halberd
  const hxp = s * 0.62;
  at(b, hxp, 0.56, 0.18, 0, () => {
    cylinder(b, 6, 0.035, 0.032, 2.55, WOOD, M_WOOD, { y0: 0, caps: false });
    pb(b, 0, 2.38, 0.02, 0.30, 0.44, 0.05, GOLD, M_GOLD);
    pb(b, 0, 2.42, 0.02, 0.16, 0.30, 0.055, GOLD_HI, M_GOLD);
    at(b, 0, 2.66, 0, 0, () => ellipsoid(b, 0.05, 0.16, 0.05, 4, 3, GOLD_HI, M_GOLD));
    at(b, 0, 1.10, 0, 0, () => cylinder(b, 6, 0.06, 0.05, 0.06, GOLD, M_GOLD, { y0: 0, caps: true }));
  });
}
// one heraldic shield silhouette: rectangle + arched chief + pointed base
function shieldPlate(b, w, top, bot, point, arc, col, mat, z) {
  b.quad([-w, bot, z], [w, bot, z], [w, top, z], [-w, top, z], col, mat, [0, 0, 1]);
  for (let i = 0; i < 10; i++) {
    const a0 = Math.PI * (i / 10), a1 = Math.PI * ((i + 1) / 10);
    b.tri([0, top, z], [Math.cos(a0) * w, top + Math.sin(a0) * arc, z], [Math.cos(a1) * w, top + Math.sin(a1) * arc, z], col, mat, [0, 0, 1]);
  }
  b.tri([-w, bot, z], [w, bot, z], [0, bot - point, z], col, mat, [0, 0, 1]);
}
function shieldCrestGeom(b) {
  // mounted on the lintel over the doors, facing +Z (into the hall)
  pb(b, 0, -1.62, 0, 1.10, 0.30, 0.40, GOLD_D, M_GOLD_D);
  for (const sx of [-1, 1]) {
    bar3(b, [sx * 0.70, -1.48, 0.02], [sx * 0.98, -0.70, 0.02], 0.09, 0.09, GOLD, M_GOLD);
    at(b, sx * 1.02, -0.62, 0.02, 0, () => ellipsoid(b, 0.11, 0.17, 0.09, 5, 3, GOLD_HI, M_GOLD));
  }
  // three nested shield plates: gilt board, gilt moulding, navy field
  shieldPlate(b, 1.02, 0.86, -0.62, 0.62, 0.52, GOLD_D, M_GOLD_D, 0.0);
  shieldPlate(b, 0.92, 0.80, -0.56, 0.56, 0.46, GOLD, M_GOLD, 0.05);
  shieldPlate(b, 0.78, 0.70, -0.48, 0.46, 0.38, NAVY, M_VELVET, 0.09);
  // charges: gilded cross, chief band, three lozenges, four fleurs
  pb(b, 0, -0.30, 0.12, 0.15, 1.24, 0.05, GOLD, M_GOLD);
  pb(b, 0, 0.04, 0.12, 0.86, 0.15, 0.05, GOLD, M_GOLD);
  pb(b, 0, 0.52, 0.12, 0.98, 0.13, 0.05, GOLD_HI, M_GOLD);
  for (const lx of [-0.30, 0, 0.30]) at(b, lx, 0.52, 0.15, 0, () => patera(b, 0, 0, 0.075, GOLD, M_GOLD));
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    at(b, sx * 0.44, sy * 0.20 - 0.08, 0.15, 0, () => ellipsoid(b, 0.06, 0.09, 0.03, 4, 2, GOLD_HI, M_GOLD));
  }
  // crown resting on the shield's shoulder
  at(b, 0, 1.42, 0.06, 0, () => {
    pb(b, 0, 0, 0, 0.78, 0.14, 0.20, GOLD, M_GOLD);
    for (let i = 0; i < 3; i++) {
      at(b, -0.25 + i * 0.25, 0.14, 0, 0, () => ellipsoid(b, 0.07, 0.16, 0.06, 4, 2, GOLD_HI, M_GOLD));
    }
    at(b, 0, 0.10, 0, 0, () => ellipsoid(b, 0.07, 0.07, 0.07, 5, 3, GOLD, M_GOLD));
  });
  // laurel sprays flanking the shield
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      at(b, sx * (1.16 + i * 0.02), -1.10 + i * 0.30, 0.02, 0, () => ellipsoid(b, 0.08, 0.15, 0.05, 4, 2, GOLD, M_GOLD));
    }
  }
}
function buildEntrance(b) {
  // two door leaves, opened flat against the tunnel side walls
  for (const s of [-1, 1]) {
    at(b, s * 4.34, FY + 0.10, 126.80, Math.PI / 2, () => doorLeafGeom(b, s));
  }
  // heavy gilded lintel band across the tunnel above the doors
  pb(b, 0, FY + 9.15, 128.62, 9.30, 0.62, 0.55, GOLD_D, M_GOLD_D);
  pb(b, 0, FY + 8.78, 128.62, 9.30, 0.14, 0.62, GOLD, M_GOLD);
  pb(b, 0, FY + 9.52, 128.62, 9.30, 0.16, 0.62, GOLD_HI, M_GOLD);
  for (let i = 0; i < 15; i++) {
    pb(b, -4.30 + i * 0.615, FY + 9.32, 128.32, 0.16, 0.16, 0.10, GOLD, M_GOLD);
  }
  // the gold shield with crown, hanging in the portal above the doors
  at(b, 0, FY + 11.30, 128.70, 0, () => shieldCrestGeom(b));
  // two guard statues inside the hall, flanking the entrance
  for (const s of [-1, 1]) {
    at(b, s * 3.78, FY, 130.30, -s * 0.22, () => guardGeom(b, s));
    fp('guard', s * 3.78, 130.30, 0.44, 0.44, -s * 0.22, FY, FY + 3.0);
  }
}

// ================================================================ 9. lighting
function buildLights(b, ctx) {
  const warm = mixc(GLOW, PC.glowSky, 0.30);
  const warmHi = mixc(GLOW, PC.glowSky, 0.45);
  const P = (p, col, range, int) => ctx.points.push({ p, col, range, int });
  // throne / apse: two low-intensity sources under the baldachin, above head height
  P([-3.0, FY + 2.8, 157.6], warmHi, 13, 0.56);
  P([3.0, FY + 2.8, 157.6], warmHi, 13, 0.56);
  // four seating clusters, lifted to 5.6 m so a fly-through never grazes a light
  const seat = [-60, 60, 120, 240];
  seat.forEach((d, i) => {
    const [x, z] = polar(deg(d), i % 2 ? 10.0 : 9.4);
    P([x, FY + 5.6, z], i % 2 ? warm : warmHi, 18, 0.80);
  });
  // entrance bay, high and forward of the threshold
  P([0, FY + 6.6, 132.6], warm, 15, 0.70);
  // two chandelier cores
  for (const d of [0, 180]) {
    const [x, z] = polar(deg(d), 8.0);
    P([x, FY + 9.6, z], warmHi, 25, 0.98);
  }
  // ---- billboard halos
  const L = (p, size, alpha, col, shape = 1) => ctx.lanterns.push({ p, size, rot: 0, alpha, shape, col });
  for (const d of CHANDELIERS) {
    const [x, z] = polar(deg(d), 8.0);
    L([x, FY + 9.5, z], 2.2, 0.44, mixc(GLOW, GOLD_HI, 0.5));
    L([x, FY + 8.7, z], 1.3, 0.50, GLOW);
  }
  for (const dAng of [...PIERS, ...URN_PIERS].map((a) => (a * 180) / Math.PI)) {
    const a = deg(dAng);
    const [x, z] = polar(a, 14.55);
    L([x, FY + 8.7, z], 1.05, 0.46, mixc(GLOW, GOLD_HI, 0.5));
  }
  for (const sx of [-1, 1]) {
    L([sx * 3.30, DAIS.top + 2.15, 156.30], 1.25, 0.50, mixc(GLOW, GOLD_HI, 0.45));
  }
  // canopy glow (soft, high, never near a camera)
  L([0, DAIS.top + 4.05, 159.0], 2.4, 0.30, mixc(GLOW, WINE_HI, 0.25));
  ctx.props.palaceSalon = { cx: CX, cz: CZ, floorY: FY, daisTop: DAIS.top, throne: [CX, DAIS.top, 159.0] };
}


// ================================================================ 10. gilded order details
// Column collars + a gilded cartouche on each of the 12 column shafts, facing the
// centre; the entablature above them is already gilded by palace-hall, so this only
// adds the eye-level jewellery that makes the order read as a palace up close.
function buildOrderDetail(b) {
  for (let i = 0; i < 12; i++) {
    const ang = deg(-75 + 30 * i);
    const [x, z] = polar(ang, COL_R);
    const yaw = faceYaw(CX - x, CZ - z);
    at(b, x, FY, z, yaw, () => {
      at(b, 0, 1.18, 0, 0, () => torus(b, 0.635, 0.05, 16, 3, GOLD, M_GOLD));
      at(b, 0, 2.34, 0, 0, () => torus(b, 0.598, 0.038, 14, 3, GOLD_HI, M_GOLD));
      at(b, 0, 3.55, 0.575, 0, () => {
        patera(b, 0, 0, 0.24, GOLD_HI, M_GOLD);
        for (const s of [-1, 1]) at(b, s * 0.26, 0.22, -0.02, 0, () => ellipsoid(b, 0.08, 0.20, 0.06, 4, 2, GOLD, M_GOLD));
      });
      at(b, 0, 0.98, 0, 0, () => torus(b, 0.655, 0.035, 16, 3, GOLD, M_GOLD));
    });
  }
}

// ================================================================ 11. carpet enrichment
// a chain of gilded lozenges along the processional strips + rosettes inside the band
function carpetLozenges(b) {
  const y = CARPET_Y + 0.016;
  for (const [x0, x1, z0, z1] of [[-2.15, 2.15, 130.30, 136.75], [-1.55, 1.55, 150.80, 157.35]]) {
    const n = Math.floor((z1 - z0) / 1.15);
    for (const sx of [-1, 1]) {
      const cx = (x0 + x1) * 0.5 + sx * ((x1 - x0) * 0.5 - 0.16);
      for (let i = 0; i < n; i++) {
        const z = z0 + 0.5 + i * 1.15;
        b.quad([cx - 0.13, y, z - 0.24], [cx, y, z], [cx + 0.13, y, z - 0.24], [cx, y, z - 0.48], GOLD, M_GOLD, [0, 1, 0]);
      }
    }
  }
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU + Math.PI / 16;
    const [x, z] = polar(a, 6.15);
    const ca = Math.cos(a), sa = Math.sin(a), nx = -sa, nz = ca;
    for (let k = 0; k < 4; k++) {
      const b0 = (k / 4) * TAU, b1 = ((k + 1) / 4) * TAU;
      const P0 = [x + Math.cos(b0) * 0.20 * ca + Math.sin(b0) * 0.20 * nx, y, z + Math.cos(b0) * 0.20 * sa + Math.sin(b0) * 0.20 * nz];
      const P1 = [x + Math.cos(b1) * 0.20 * ca + Math.sin(b1) * 0.20 * nx, y, z + Math.cos(b1) * 0.20 * sa + Math.sin(b1) * 0.20 * nz];
      b.tri([x, y, z], P0, P1, k % 2 ? GOLD : GOLD_HI, M_GOLD, [0, 1, 0], [0, 1, 0], [0, 1, 0]);
    }
  }
}

// ================================================================ entry point
export function buildPalaceSalon(b, ctx, rng) {
  b.note && b.note('palaceSalon');
  const R = mulberry32(SEED);          // module-local rng: never touches the world sequence
  void rng;
  FOOTPRINTS.length = 0;
  for (const k of Object.keys(SALON_TRI)) delete SALON_TRI[k];
  sect(b, 'carpet', () => { buildCarpet(b); carpetLozenges(b); });
  sect(b, 'throne', () => buildThrone(b));
  sect(b, 'seating', () => buildSeating(b, R));
  sect(b, 'piers', () => buildPiers(b, R));
  sect(b, 'hangings', () => buildHangings(b));
  sect(b, 'order', () => buildOrderDetail(b));
  sect(b, 'paintings', () => buildPaintings(b, R));
  sect(b, 'chandeliers', () => buildChandeliers(b));
  sect(b, 'entrance', () => buildEntrance(b));
  sect(b, 'lights', () => buildLights(b, ctx));
}
