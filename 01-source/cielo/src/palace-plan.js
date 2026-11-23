// PALACE-PLAN — shared dimensions + palette for the palace complex on the hero terrace.
// OWNER: lead (contract). palace.js / palace-hall.js / terrace-set.js read this; do not change
// numbers here without updating both builders.
//
// World frame: y up, island plaza y=0, the belvedere deck y=30, the palace front plane z=124,
// the palace extends inland toward +Z. The terrace (terrace.js) is in front (z < 124).
//
// Layout
//   podium   x -53..53, z 96..182, y 0..30   (solid base; the terrace deck rides on it)
//   core     x -20..20, z 124..176, cornice 52, attic 54.5, drum 54.5..62, dome to 78.6
//   wings    x 20..52 (mirrored), z 124..158, cornice 46, mansard to 52.5
//   pavilion x 39..53, z 121.5..147, cornice 49, mansard to 56
//   portico  6 columns at z=118.6 (x listed below), entablature 46..49, pediment apex ~55
//   portal   open arch x -4.6..4.6, springing 43.5, apex 48.1, tunnel z 123.9..129
//   hall     rotunda r=15 centred (0,144), floor 30, column ring r=12.6 (12 columns),
//            entablature to 49, clerestory drum to 62, dome to oculus at 76 (open to sky)
//   apse     rear wall z=159 with a tall arched window, apse shell to z=164.5
import { mixc } from './geo.js';
import { box } from './geo.js';
import { C } from './palette.js';

export const PAL = {
  deckY: 30,                 // terrace / palace-floor level
  frontZ: 124,               // main (city-facing) facade plane

  podium: { hx: 53, z0: 96, z1: 182 },

  core: {
    hx: 20, z0: 124, z1: 176,
    baseTop: 37.5,           // top of the rusticated ground floor
    cornice: 52.0,           // main cornice (dome drum starts above the attic)
    attic: 54.5,             // attic / parapet top
    drumY0: 54.5, drumY1: 62.0,
    domeY0: 62.0, domeApex: 78.6,
  },

  dome: { rOuter: 16.6, rInner: 15.0, oculusY: 76.0, oculusR: 5.4 },

  wing: { xInner: 20, xOuter: 52, z1: 158, cornice: 46.0, attic: 48.0, mansardTop: 52.5 },

  pavilion: { x0: 39, x1: 53, z0: 121.5, z1: 147, cornice: 49.0, attic: 51.0, mansardTop: 56.0 },

  portico: {
    z: 118.6, cols: [-16.9, -10.9, -4.9, 4.9, 10.9, 16.9],
    r: 0.86, y0: 30, h: 16.0, entabY: 46.0,
    pedH: 6.0, pedHalfW: 18.6, pedZ: 118.2,
  },

  // the open entrance portal (must stay a real hole — you can fly through it)
  portal: { hx: 4.6, springY: 43.5, z0: 123.9, z1: 129.0 },   // arch apex y = 48.1

  // closed secondary doors on the front wall (glass only, no interior behind)
  sideDoors: { x: 13.9, hx: 1.6, y0: 30.6, y1: 38.6 },

  // the rotunda hall (interior). Wall cylinder is centred at (0, cz).
  hall: {
    cx: 0, cz: 144, rWall: 15.0, floorY: 30,
    colR: 12.6, colN: 12, colH: 16.0, colTopY: 46.0, entabTopY: 49.0,
    drumTopY: 62.0,          // inner dome springs here
    oculusY: 76.0,
  },

  rearWindow: { z: 159.0, hx: 4.4, y0: 33.5, y1: 47.0, apseZ: 164.5 },

  // ---- round 5: the palace's ground floor (city level, y=0) ------------------
  // The podium in front of the rotunda is hollowed out into a grand entrance hall.
  // It is entered from the boulevard through the carriage arch that terrace.js
  // already punches through the belvedere support wall (z 92.6..95.6, x +-12.2,
  // springing 4.6, apex 16.8). palace.js carves the void; palace-base.js furnishes it.
  base: {
    arch: { hx: 12.2, springY: 4.6, apexY: 16.8, zFront: 92.6, zBack: 95.6 },
    facadeZ: 92.2,             // new decorated facade must stay in front of this plane
    hall: {
      x0: -40, x1: 40, z0: 96.4, z1: 122.4,
      y0: 0, ceilY: 23.6,
      entry: { hx: 12.4, yTop: 17.0, z: 96.0, t: 0.4 },
      mezzY: 11.6,             // side + rear gallery level
      pond: { x: 0, z: 107.0, r: 4.6 },
    },
  },
};

// ---------------------------------------------------------------- palette (linear rgb)
export const PC = {
  stone: mixc(C.stone, C.stonePale, 0.42),
  stoneHi: mixc(C.marble, C.stonePale, 0.55),
  stoneSh: mixc(C.stoneWarm, C.stoneCool, 0.30),
  stoneDeep: mixc(C.stoneDark, C.stoneCool, 0.25),
  marble: mixc(C.marble, C.cloudLit, 0.12),
  marbleHi: mixc(C.marble, C.cloudLit, 0.35),
  marbleSh: mixc(C.marbleShade, C.stoneCool, 0.28),
  gold: C.gold,
  goldHi: C.goldBright,
  slate: mixc(C.slate, C.slateLight, 0.18),
  slateHi: C.slateLight,
  slateLo: C.slateDark,
  copper: C.copper,
  glassWin: mixc(C.glassDeep, C.slateDark, 0.55),
  glassSky: mixc(C.glass, C.horizon, 0.30),
  leaf: C.leaf, leafL: C.leafLight, leafD: C.leafDark,

  // interior: warm ivory stone (self-lit a little so the hall never turns muddy)
  hallWall: mixc(C.stonePale, C.sunGlow, 0.10),
  hallWallHi: mixc(C.marble, C.sunGlow, 0.16),
  hallShade: mixc(C.stoneCool, C.stoneWarm, 0.30),
  hallDome: mixc(C.marbleShade, C.sunGlow, 0.14),
  hallRib: mixc(C.gold, C.stonePale, 0.22),
  floorA: mixc(C.marble, C.cloudLit, 0.30),
  floorB: mixc(C.stoneCool, C.marble, 0.55),
  floorGold: mixc(C.gold, C.goldBright, 0.35),
  glow: mixc(C.sunGlow, C.cloudLit, 0.40),
  glowSky: mixc(C.horizon, C.cloudLit, 0.55),
  bloom: C.bloomPink,
};

// ------------------------------------------------ materials [emissive, gloss] (see lit.fs.glsl)
// The palace front is back-lit by the scene sun, so exterior stone carries a small emissive
// lift (like terrace.js MASS) — it must never read as a dark silhouette.
export const PM = {
  stone: [0.14, 0.08],
  stoneHi: [0.16, 0.10],
  marble: [0.12, 0.20],
  gold: [0.09, 0.86],
  glass: [0.16, 0.92],
  slate: [0.06, 0.24],
  hall: [0.17, 0.12],
  hallFloor: [0.08, 0.30],
  hallGold: [0.12, 0.88],
  glow: [0.85, 0.00],
  leaf: [0.00, 0.12],
  cloth: [0.00, 0.06],
};

// ---------------------------------------------------------------- shared helpers
// rotate about Y then translate; local +X = (cos yaw, 0, sin yaw), local +Z = (-sin yaw, 0, cos yaw)
// (same convention as terrace.js mtr)
export function palaceFrame(x, y, z, yaw = 0, s = 1) {
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  return [c * s, 0, sn * s, 0, 0, s, 0, 0, -sn * s, 0, c * s, 0, x, y, z, 1];
}
export function pAt(b, x, y, z, yaw, fn) {
  b.push(palaceFrame(x, y, z, yaw));
  fn();
  b.pop();
}
// box centred on a world point (leaves no frame on the stack)
export function pBox(b, x, y, z, sx, sy, sz, col, mat, opts) {
  b.push(palaceFrame(x, y, z));
  box(b, sx, sy, sz, col, mat, opts);
  b.pop();
}
// facing yaw constants for facade frames (local +Z = outward normal)
export const YAW = {
  front: Math.PI,      // faces -Z (the city / terrace)
  back: 0,             // faces +Z (inland)
  east: Math.PI / 2,   // faces +X
  west: -Math.PI / 2,  // faces -X
};
