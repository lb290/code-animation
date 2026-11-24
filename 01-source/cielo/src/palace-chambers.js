// =====================================================================
// PALACE-CHAMBERS — round 8: the palace's first-floor rear suite.
// OWNER: agent "rooms". Contract: the podium void carved by palace.js buildPodium()
// and the three doorways opened by palace-base.js (CHAMBER_DOORS).
//
// The suite is hollowed out of the back half of the palace podium (the city level),
// behind the round-5 entrance hall.  Everything is enterable and connected:
//
//            z=122.2   the hall's rear wall:  grand arch + two side doors
//   +--------------------------------------------------------------+
//   |                    GRAND GALLERY  z 124.1..135.75            |  ceil 13.2
//   +---------------+------------------------+---------------------+
//   |  ROYAL STUDY  |    GRAND STAIR HALL    |    MUSIC SALON      |
//   |  library      |    22 m barrel vault   |    ballroom         |
//   |  x -40.4..    |    x -10.25..10.25     |    x 11.15..40.4    |
//   |     -11.15    |    mezzanine 11.6      |    ceil 14.0        |
//   |  ceil 12.6    |    z 136.65..160.2     |    z 136.65..173    |
//   |               +------------------------+                     |
//   |  z 136.65..   |  WINTER GARDEN COURT   |                     |
//   |     173       |  glazed vault 15.4     |                     |
//   |               |  z 161.4..173          |                     |
//   +---------------+------------------------+---------------------+
//
//   world envelope: x -41.4..41.4, y -0.4..24.0, z 122.15..174.2
//   (the podium stays solid outside that: >= 11 m of stone to the x facades and
//    >= 9 m to the rear facade at z=182)
//
// Coordinate notes: +Z runs inland (away from the city), +X east, y up.
// The hall floor is FY = 0.9, so every door here starts at that level.
// =====================================================================
import { PAL, PC } from './palace-plan.js';
import { CHAMBER_DOORS } from './palace-base.js';
import { C } from './palette.js';
import { box, cylinder, lathe, mulc, mixc, bar3, torus } from './geo.js';
import { MT, ellipsoid, tubePath } from './lib3d.js';
import { mulberry32, TAU, lerp } from './math.js';

const D = CHAMBER_DOORS;
const FY = 0.9;                       // floor level, shared with the hall

// ---------------------------------------------------------------- the rooms
const GAL = { x0: -40.4, x1: 40.4, z0: D.revealZ, z1: 135.75, ceil: 13.2, cz: 129.93 };
// the stair hall runs from the gallery to the garden court; the study and the
// salon are the two full-depth side halls
const STH = { x0: -10.25, x1: 10.25, z0: 136.65, z1: 160.20, ceil: 22.0, mezz: 11.6, cz: 148.43 };
const GAR = { x0: -10.25, x1: 10.25, z0: 161.40, z1: 173.0, ceil: 15.4, eave: 13.4, cx: 0, cz: 167.2 };
const STD = { x0: -40.4, x1: -11.15, z0: 136.65, z1: 173.0, ceil: 12.6, cx: -25.775, cz: 154.83 };
const SAL = { x0: 11.15, x1: 40.4, z0: 136.65, z1: 173.0, ceil: 14.0, cx: 25.775, cz: 154.83 };
const ZW = 0.9;                       // partition wall thickness
const WALLG = 0.8;                    // outer wall thickness (the rest is podium stone)

// gallery south wall: three 8.15 m arches per side + the central 12 m portal.
// The layout is tuned so the hall-centre sight lines to the study / salon centres
// pass through the easternmost/westernmost arch (see tools/palace-chambers-check).
const ARCS_W = [[-39.40, -31.25], [-29.85, -21.70], [-20.30, -12.15]];
const ARCS_E = [[12.15, 20.30], [21.70, 29.85], [31.25, 39.40]];
const BAYS_ALL = [...ARCS_W, [-6.0, 6.0], ...ARCS_E];
const ARC_OPENS = BAYS_ALL.map(([a, c]) => ({ cx: (a + c) / 2, hx: (c - a) / 2, spring: Math.abs(a + c) < 1 ? 4.4 : 6.6 }));
// the arched opening from the stair hall down into the garden court
const GA = { cx: 0, hx: 6.0, spring: 4.6 };
// sight-line anchor: the centre of the entrance hall (a clear point under the
// hall's rear gallery, see palace-base-check's hall-cavity assertion)
const HALL_C = [0, 4.5, 116.0];
const ROOM_CENTRES = [
  ['gallery', [0, 5.0, GAL.cz]],
  ['stair', [0, 5.0, STH.cz]],
  ['garden', [GAR.cx, 5.0, GAR.cz]],
  ['study', [STD.cx, 5.0, STD.cz]],
  ['salon', [SAL.cx, 5.0, SAL.cz]],
];

// ---------------------------------------------------------------- palette
const MARB = mulc(mixc(PC.marble, C.sunGlow, 0.24), 0.66);
const MARB_HI = mulc(mixc(PC.marbleHi, C.sunGlow, 0.32), 0.74);
const MARB_SH = mulc(mixc(PC.marbleSh, C.stoneWarm, 0.34), 0.60);
const WALL = mulc(mixc(PC.hallWall, C.sunGlow, 0.36), 0.70);
const WALL_HI = mulc(mixc(PC.hallWallHi, C.sunGlow, 0.42), 0.76);
const WALL_SH = mulc(mixc(C.stoneWarm, C.stoneDark, 0.40), 0.62);
const GOLD = PC.gold, GOLD_HI = PC.goldHi, GOLDD = mulc(PC.gold, 0.80);
const BLUE = mulc(mixc(C.slateDark, C.stoneCool, 0.24), 0.70);
const BLUE_HI = mulc(mixc(C.slateLight, C.horizon, 0.28), 0.68);
const RED = mulc(mixc(C.bloomRed, C.slateDark, 0.30), 0.80);
const RED_HI = mulc(mixc(C.bloomRed, C.gold, 0.16), 0.86);
const VELVET = mulc(mixc(C.bloomRed, C.slateDark, 0.44), 0.78);
const VELVET_B = mulc(mixc(C.slateDark, C.slate, 0.40), 0.70);
const WOOD = mulc(mixc(C.bronze, C.gold, 0.20), 0.72);
const WOOD_D = mulc(mixc(C.bronze, C.slateDark, 0.34), 0.62);
const LEAF = C.leaf, LEAF_L = C.leafLight, LEAF_D = C.leafDark;
const GLASS_W = mulc(mixc(C.sunGlow, C.cloudLit, 0.34), 0.94);   // warm lit pane
const GLASS_G = mulc(mixc(C.sunGlow, C.leafLight, 0.34), 0.86);  // garden lit pane
const GLASS_S = mulc(mixc(C.horizon, C.cloudLit, 0.40), 0.90);
const FLOOR_A = mulc(mixc(PC.floorA, C.cloudLit, 0.20), 0.74);
const FLOOR_B = mulc(mixc(PC.floorB, C.stoneCool, 0.30), 0.58);
const FLOOR_G = mulc(PC.floorGold, 0.88);
const PARQ_A = mulc(mixc(WOOD, C.sunGlow, 0.10), 0.92);      // warm oak
const PARQ_B = mulc(mixc(WOOD, C.bronze, 0.55), 0.70);      // darker walnut
const IVORY = mulc(mixc(C.marble, C.sunGlow, 0.20), 0.72);

// materials [emissive, gloss]: interior baseline (albedo 0.42..0.62, emissive <= 0.145)
const MI = {
  marb: [0.100, 0.22], marbHi: [0.125, 0.28], marbSh: [0.075, 0.15],
  wall: [0.105, 0.10], wallHi: [0.135, 0.14], wallSh: [0.080, 0.08],
  gold: [0.105, 0.88], goldHi: [0.145, 0.92], goldD: [0.070, 0.74],
  glass: [0.340, 0.72], glassHi: [0.420, 0.86], glassLo: [0.260, 0.80],
  glowW: [0.760, 0.00], glowS: [0.560, 0.00],
  cloth: [0.030, 0.06], velvet: [0.020, 0.10], carpet: [0.050, 0.05],
  wood: [0.080, 0.28], woodD: [0.045, 0.18],
  leaf: [0.055, 0.12], leafHi: [0.075, 0.14], bloom: [0.060, 0.08],
  water: [0.260, 0.82], mirror: [0.200, 0.94], paint: [0.095, 0.12],
  blue: [0.055, 0.12], red: [0.060, 0.08], iron: [0.020, 0.55],
  dark: [0.045, 0.08], book: [0.060, 0.10], stone: [0.100, 0.10],
};

const NZ = [0, 0, -1], PZ = [0, 0, 1], NX = [-1, 0, 0], PX = [1, 0, 0], UP = [0, 1, 0], DN = [0, -1, 0];

// ---------------------------------------------------------------- helpers
const mat4 = (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
function at(b, x, y, z, yaw, fn) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  b.push([c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, x, y, z, 1]); fn(); b.pop();
}
// world box from min/max ranges
function bx(b, x0, x1, y0, y1, z0, z1, col, mat, opts) {
  b.push(mat4((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2));
  box(b, x1 - x0, y1 - y0, z1 - z0, col, mat, opts);
  b.pop();
}
// axis-aligned quads with explicit normals
function qF(b, x0, x1, y0, y1, z, col, mat) { b.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], col, mat, NZ); }
function qB(b, x0, x1, y0, y1, z, col, mat) { b.quad([x1, y0, z], [x0, y0, z], [x0, y1, z], [x1, y1, z], col, mat, PZ); }
function qXm(b, x, z0, z1, y0, y1, col, mat) { b.quad([x, y0, z1], [x, y0, z0], [x, y1, z0], [x, y1, z1], col, mat, NX); }
function qXp(b, x, z0, z1, y0, y1, col, mat) { b.quad([x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0], col, mat, PX); }
function qYp(b, y, x0, x1, z0, z1, col, mat) { b.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], col, mat, UP); }
function qYn(b, y, x0, x1, z0, z1, col, mat) { b.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], col, mat, DN); }

// ---------------------------------------------------------------- wall builders
// A wall slab in an XY plane (thickness zA..zB) with semicircular arched openings
// that reach the floor.  Both faces are built, plus the reveal soffit/jambs.
function wallZ(b, x0, x1, y0, y1, zA, zB, opens, colA, matA, colB, matB, opt) {
  const o = opt || {};
  const seg = o.seg || 10;
  const zR = o.zRev !== undefined ? o.zRev : zA;   // reveal may start in front of the wall
  const op = opens.slice().sort((p, q) => p.cx - q.cx);
  let x = x0;
  const spans = [];
  for (const a of op) {
    const l = a.cx - a.hx, r = a.cx + a.hx;
    if (l > x + 0.01) spans.push([x, l]);
    x = Math.max(x, r);
  }
  if (x < x1 - 0.01) spans.push([x, x1]);
  for (const [a, c] of spans) bx(b, a, c, y0, y1, zA, zB, colA, matA, { topCol: o.topA || colB });
  for (const a of op) {
    const n = o.strips || Math.max(8, Math.round(a.hx * 4));
    for (let i = 0; i < n; i++) {
      const xa = a.cx - a.hx + (2 * a.hx * i) / n, xb = a.cx - a.hx + (2 * a.hx * (i + 1)) / n;
      const dx = (xa + xb) * 0.5 - a.cx;
      const yb = a.spring + Math.sqrt(Math.max(0, a.hx * a.hx - dx * dx));
      if (y1 - yb < 0.012) continue;
      b.quad([xa, yb, zA], [xb, yb, zA], [xb, y1, zA], [xa, y1, zA], colA, matA, NZ);
      b.quad([xb, yb, zB], [xa, yb, zB], [xa, y1, zB], [xb, y1, zB], colB, matB, PZ);
    }
    // jambs + arch soffit (the reveal)
    for (const s of [-1, 1]) {
      const xx = a.cx + s * a.hx;
      b.quad([xx, y0, zR], [xx, y0, zB], [xx, a.spring, zB], [xx, a.spring, zR], mulc(colA, 0.94), matA, [-s, 0, 0]);
    }
    for (let i = 0; i < seg; i++) {
      const t0 = Math.PI * (i / seg), t1 = Math.PI * ((i + 1) / seg);
      const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
      const am = (t0 + t1) * 0.5;
      b.quad([a.cx + c0 * a.hx, a.spring + s0 * a.hx, zR], [a.cx + c0 * a.hx, a.spring + s0 * a.hx, zB],
        [a.cx + c1 * a.hx, a.spring + s1 * a.hx, zB], [a.cx + c1 * a.hx, a.spring + s1 * a.hx, zR],
        mulc(colA, 0.82), matA, [-Math.cos(am), -Math.sin(am), 0]);
    }
  }
}
// A wall slab in a ZY plane (thickness xA..xB), normal +X on the xA face.
function wallX(b, z0, z1, y0, y1, xA, xB, colA, matA, colB, matB) {
  bx(b, xA, xB, y0, y1, z0, z1, colA, matA, { topCol: colB });
}
// archivolt / moulding ring on a Z plane; normal -Z if nz, else +Z
function ringZ(b, cx, cy, r0, r1, z, t0, t1, seg, col, mat, nz) {
  const N = nz ? NZ : PZ;
  for (let i = 0; i < seg; i++) {
    const a0 = t0 + ((t1 - t0) * i) / seg, a1 = t0 + ((t1 - t0) * (i + 1)) / seg;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    b.quad([cx + c0 * r0, cy + s0 * r0, z], [cx + c1 * r0, cy + s1 * r0, z],
      [cx + c1 * r1, cy + s1 * r1, z], [cx + c0 * r1, cy + s0 * r1, z], col, mat, N);
  }
}

// horizontal moulding band on a Z wall
function bandZx(b, x0, x1, y0, y1, z0, z1, col, mat) { bx(b, x0, x1, y0, y1, z0, z1, col, mat, { topCol: col }); }

// checkerboard floor slab (top face at y)
function checker(b, x0, x1, z0, z1, y, tx, tz, cA, cB, mat, opt) {
  const o = opt || {};
  const nx = Math.max(1, Math.round((x1 - x0) / tx)), nz = Math.max(1, Math.round((z1 - z0) / tz));
  const dx = (x1 - x0) / nx, dz = (z1 - z0) / nz;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const tone = 0.96 + 0.05 * (((i * 5 + j * 3) % 4) / 3) + (o.jit ? (o.jit(i, j) - 0.5) * 0.02 : 0);
      const cc = (i + j) % 2 ? mulc(cA, tone) : mulc(cB, 0.94 + 0.05 * tone);
      qYp(b, y, x0 + dx * i + 0.012, x0 + dx * (i + 1) - 0.012, z0 + dz * j + 0.012, z0 + dz * (j + 1) - 0.012, cc, mat);
    }
  }
}
// simple field of floor tiles with a gold border and skirting shadow
function floorField(b, x0, x1, z0, z1, y, col, mat) {
  qYp(b, y, x0, x1, z0, z1, col, mat);
}
// coffer grid on a horizontal plane (visible from below: normal -Y)
function coffersY(b, x0, x1, z0, z1, y, nx, nz, cField, cFrame, cDot, matField, matFrame) {
  const dx = (x1 - x0) / nx, dz = (z1 - z0) / nz;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const xa = x0 + dx * i, xb = xa + dx, za = z0 + dz * j, zb = za + dz;
      const t = 0.20;
      qYn(b, y, xa + t, xb - t, za + t, zb - t, cField, matField);
      qYn(b, y - 0.005, xa, xb, za, za + t, cFrame, matFrame);
      qYn(b, y - 0.005, xa, xb, zb - t, zb, cFrame, matFrame);
      qYn(b, y - 0.005, xa, xa + t, za + t, zb - t, cFrame, matFrame);
      qYn(b, y - 0.005, xb - t, xb, za + t, zb - t, cFrame, matFrame);
      if (cDot) {
        b.push(mat4((xa + xb) / 2, y - 0.02, (za + zb) / 2));
        ellipsoid(b, Math.min(dx, dz) * 0.16, 0.05, Math.min(dx, dz) * 0.16, 6, 3, cDot, MI.gold);
        b.pop();
      }
    }
  }
}
// glowing arched blind window on a Z wall.  opt.dir = -1 (default) faces -Z,
// +1 faces +Z; use it inside a wallFrameX frame (where +Z is the room side).
function windowZ(b, cx, y0, hx, spring, z, colPane, colFrame, opt) {
  const o = opt || {};
  const seg = o.seg || 8;
  const d = o.dir || -1;
  const N = [0, 0, d];
  const zp = (k) => z + d * k;
  const lo = (a, c) => Math.min(a, c), hi = (a, c) => Math.max(a, c);
  // dark reveal, then the lit pane slightly in front of it
  b.quad([cx - hx, y0, zp(-0.04)], [cx + hx, y0, zp(-0.04)], [cx + hx, spring, zp(-0.04)], [cx - hx, spring, zp(-0.04)],
    mulc(colFrame, 0.42), MI.dark, N);
  for (let i = 0; i < seg; i++) {
    const t0 = Math.PI * (i / seg), t1 = Math.PI * ((i + 1) / seg);
    b.tri([cx, spring, zp(-0.04)], [cx + Math.cos(t0) * hx, spring + Math.sin(t0) * hx, zp(-0.04)],
      [cx + Math.cos(t1) * hx, spring + Math.sin(t1) * hx, zp(-0.04)], mulc(colFrame, 0.42), MI.dark, N, N, N);
  }
  b.quad([cx - hx + 0.14, y0 + 0.14, z], [cx + hx - 0.14, y0 + 0.14, z], [cx + hx - 0.14, spring, z], [cx - hx + 0.14, spring, z],
    colPane, MI.glass, N);
  for (let i = 0; i < seg; i++) {
    const t0 = Math.PI * (i / seg), t1 = Math.PI * ((i + 1) / seg);
    b.tri([cx, spring, z], [cx + Math.cos(t0) * (hx - 0.14), spring + Math.sin(t0) * (hx - 0.14), z],
      [cx + Math.cos(t1) * (hx - 0.14), spring + Math.sin(t1) * (hx - 0.14), z], colPane, MI.glass, N, N, N);
  }
  // gold mullions + arch ring
  bx(b, cx - 0.05, cx + 0.05, y0 + 0.14, spring + hx - 0.24, lo(z, zp(0.03)), hi(z, zp(0.03)), GOLD, MI.gold);
  bx(b, cx - hx + 0.14, cx + hx - 0.14, spring - 0.30, spring - 0.22, lo(z, zp(0.03)), hi(z, zp(0.03)), GOLD, MI.gold);
  ringZ(b, cx, spring, hx - 0.06, hx + 0.16, zp(0.04), 0, Math.PI, seg, GOLD_HI, MI.goldHi, d < 0);
  // stone surround (behind the pane)
  bx(b, cx - hx - 0.34, cx - hx - 0.02, y0, spring, lo(z, zp(-0.14)), hi(z, zp(-0.14)), MARB_HI, MI.marbHi);
  bx(b, cx + hx + 0.02, cx + hx + 0.34, y0, spring, lo(z, zp(-0.14)), hi(z, zp(-0.14)), MARB_HI, MI.marbHi);
  ringZ(b, cx, spring, hx + 0.16, hx + 0.48, zp(-0.14), 0, Math.PI, seg, MARB, MI.marb, d < 0);
  bx(b, cx - hx - 0.44, cx + hx + 0.44, y0 - 0.20, y0, lo(z, zp(-0.20)), hi(z, zp(-0.04)), MARB_HI, MI.marbHi, { topCol: MARB });
}

// balustrade running along X at a fixed z, bottom at y
function balX(b, x0, x1, z, y, h, opt) {
  const o = opt || {};
  bx(b, x0, x1, y + 0.10, y + 0.24, z - 0.18, z + 0.18, MARB, MI.marb, { topCol: MARB_HI });
  bx(b, x0, x1, y + h + 0.06, y + h + 0.22, z - 0.24, z + 0.24, GOLD_HI, MI.goldHi);
  const n = Math.max(2, Math.round((x1 - x0) / 0.95));
  for (let i = 0; i < n; i++) {
    const xa = x0 + ((x1 - x0) * (i + 0.5)) / n;
    b.push(mat4(xa, y + 0.24, z));
    ellipsoid(b, 0.10, (h - 0.02) * 0.5, 0.10, 5, 3, GOLD, MI.gold);
    b.pop();
  }
  for (let i = 0; i <= Math.round((x1 - x0) / 5.2); i++) {
    const nn = Math.max(1, Math.round((x1 - x0) / 5.2));
    const xa = x0 + ((x1 - x0) * i) / nn;
    bx(b, xa - 0.17, xa + 0.17, y + 0.10, y + h + 0.44, z - 0.17, z + 0.17, MARB_HI, MI.marbHi, { topCol: MARB });
  }
}
// balustrade running along Z at a fixed x
function balZ(b, z0, z1, x, y, h) {
  bx(b, x - 0.18, x + 0.18, y + 0.10, y + 0.24, z0, z1, MARB, MI.marb, { topCol: MARB_HI });
  bx(b, x - 0.24, x + 0.24, y + h + 0.06, y + h + 0.22, z0, z1, GOLD_HI, MI.goldHi);
  const n = Math.max(2, Math.round((z1 - z0) / 0.95));
  for (let i = 0; i < n; i++) {
    const za = z0 + ((z1 - z0) * (i + 0.5)) / n;
    b.push(mat4(x, y + 0.24, za));
    ellipsoid(b, 0.10, (h - 0.02) * 0.5, 0.10, 5, 3, GOLD, MI.gold);
    b.pop();
  }
  for (let i = 0; i <= Math.round((z1 - z0) / 5.2); i++) {
    const nn = Math.max(1, Math.round((z1 - z0) / 5.2));
    const za = z0 + ((z1 - z0) * i) / nn;
    bx(b, x - 0.17, x + 0.17, y + 0.10, y + h + 0.44, za - 0.17, za + 0.17, MARB_HI, MI.marbHi, { topCol: MARB });
  }
}
// ceiling slab: flat, from the room ceiling upward (hides the void above)
function ceilSlab(b, x0, x1, z0, z1, y, t) {
  // the slab hangs 3 cm above the decorative ceiling plane: coplanar faces would
  // z-fight into grey scribbles on every coffer
  bx(b, x0, x1, y + 0.03, y + 0.03 + (t || 0.5), z0, z1, WALL_SH, MI.wallSh, { topCol: WALL_SH, bottomCol: WALL_SH });
}

// ============================================================== ROOM SHELLS
// (decor is added in the sections below; these build the envelope every room needs)
function shellGallery(b, ctx, R) {
  const XL = GAL.x0 - WALLG, XR = GAL.x1 + WALLG;      // -41.2 .. 41.2
  checker(b, GAL.x0, GAL.x1, GAL.z0, GAL.z1, FY, 2.35, 2.35, FLOOR_A, FLOOR_B, MI.marb);
  ceilSlab(b, XL, XR, 122.90, GAL.z1 + ZW, GAL.ceil, 0.5);
  // north wall = the three doorways (the reveal reaches back to the hall's wall plane)
  wallZ(b, XL, XR, FY, GAL.ceil, 122.90, D.revealZ, [
    { cx: D.grand.x, hx: D.grand.hx, spring: D.grand.spring },
    { cx: D.sides[0].x, hx: D.side.hx, spring: D.side.spring },
    { cx: D.sides[1].x, hx: D.side.hx, spring: D.side.spring },
  ], WALL, MI.wall, WALL, MI.wall, { zRev: D.zFace });
  // south wall = three arcades into the three rear rooms
  wallZ(b, XL, XR, FY, GAL.ceil, GAL.z1, GAL.z1 + ZW, ARC_OPENS, WALL, MI.wall, WALL, MI.wall);
  // end walls
  bx(b, XL, GAL.x0, FY, GAL.ceil, 122.90, GAL.z1 + ZW, WALL, MI.wall, { topCol: WALL_HI });
  bx(b, GAL.x1, XR, FY, GAL.ceil, 122.90, GAL.z1 + ZW, WALL, MI.wall, { topCol: WALL_HI });
  void ctx; void R;
}

// ---- stair hall ------------------------------------------------------------
// The grand double stair rises along the two long walls to the mezzanine landing at
// 11.6 m, which spans the rear wall above the arch down into the garden court.
const STAIR = { zin: 139.40, zout: 158.20, n: 60, xin: 6.55, xout: 10.25 };
function shellStair(b, ctx, R) {
  const XL = STH.x0 - ZW, XR = STH.x1 + ZW;            // -11.15 .. 11.15
  // the two long walls: shared with the study (west) and the salon (east); they run
  // the full depth of the suite so one wall encloses stair hall, garden and study
  bx(b, XL, STH.x0, FY, STH.ceil, 135.75, 173.9, WALL, MI.wall, { topCol: WALL_HI, bottomCol: WALL_SH });
  bx(b, STH.x1, XR, FY, STH.ceil, 135.75, 173.9, WALL, MI.wall, { topCol: WALL_HI, bottomCol: WALL_SH });
  // north wall above the gallery ceiling
  bx(b, XL, XR, GAL.ceil, STH.ceil, STH.z0 - ZW, STH.z0, WALL, MI.wall, { topCol: WALL_HI });
  // floor: marble with the palace star medallion under the stair
  checker(b, STH.x0, STH.x1, STH.z0, STH.z1, FY, 2.05, 2.05, FLOOR_A, FLOOR_B, MI.marb);
  // ---- the barrel vault (springing 17.0 at |x| 10.25, crown 22.0) ----
  vaultZ(b, STH.x0, STH.x1, STH.z0, STH.z1, 17.0, STH.ceil, 16, 10,
    mulc(IVORY, 0.92), mulc(IVORY, 0.84), GOLD);
  // ---- the grand double staircase along the two side walls ----
  const rise = (STH.mezz - FY) / STAIR.n, run = (STAIR.zout - STAIR.zin) / STAIR.n;
  for (const s of [-1, 1]) {
    const xa = s > 0 ? STAIR.xin : -STAIR.xout, xb = s > 0 ? STAIR.xout : -STAIR.xin;
    for (let i = 0; i < STAIR.n; i++) {
      const z0 = STAIR.zin + i * run, z1 = z0 + run, yT = FY + (i + 1) * rise;
      bx(b, xa, xb, FY - 0.12, yT, z0, z1, i % 2 ? MARB : MARB_HI, MI.marb, { topCol: MARB_HI });
      // gold nosing + red runner on the tread
      bx(b, xa + 0.04, xb - 0.04, yT - 0.035, yT, z0, z0 + 0.06, GOLD, MI.gold);
      qYp(b, yT + 0.006, s > 0 ? STAIR.xin + 0.9 : -STAIR.xout + 0.8, s > 0 ? STAIR.xout - 0.8 : -STAIR.xin - 0.9,
        z0 + 0.02, z1 - 0.02, RED, MI.carpet);
      // inner marble parapet + gold capping, following the flight
      const xi = s > 0 ? STAIR.xin : -STAIR.xin;
      bx(b, s > 0 ? xi : xi - 0.22, s > 0 ? xi + 0.22 : xi, yT, yT + 1.04, z0, z1, MARB_HI, MI.marbHi, { topCol: MARB });
      bx(b, s > 0 ? xi - 0.24 : xi - 0.26, s > 0 ? xi + 0.26 : xi + 0.24, yT + 1.04, yT + 1.20, z0, z1, GOLD_HI, MI.goldHi);
      // a slim baluster every third step, for a richer silhouette against the light
      if (i % 3 === 1) {
        b.push(mat4(s > 0 ? xi + 0.02 : xi - 0.02, yT + 0.10, z0 + run * 0.5));
        lathe(b, [[0.10, 0], [0.055, 0.22], [0.075, 0.52], [0.05, 0.78], [0.09, 0.94]], 5, GOLD, MI.gold);
        b.pop();
      }
    }
    // newel at the foot + a gold urn at the top
    bx(b, s * STAIR.xin - 0.30, s * STAIR.xin + 0.30, FY, FY + 1.5, STAIR.zin - 0.9, STAIR.zin - 0.2, MARB_HI, MI.marbHi, { topCol: MARB });
    b.push(mat4(s * STAIR.xin, FY + 1.62, STAIR.zin - 0.55));
    ellipsoid(b, 0.28, 0.30, 0.28, 6, 4, GOLD_HI, MI.goldHi);
    b.pop();
  }
  // ---- mezzanine landing across the rear wall ----
  bx(b, STH.x0, STH.x1, STH.mezz - 0.42, STH.mezz, STAIR.zout, STH.z1, MARB, MI.marb, { topCol: MARB_HI });
  bx(b, STH.x0, STH.x1, STH.mezz - 0.76, STH.mezz - 0.42, STAIR.zout - 0.10, STAIR.zout, MARB_HI, MI.marbHi);
  bx(b, STH.x0, STH.x1, STH.mezz - 0.56, STH.mezz - 0.42, STAIR.zout - 0.16, STAIR.zout - 0.10, GOLD, MI.gold);
  balX(b, -STAIR.xin + 0.2, STAIR.xin - 0.2, STAIR.zout - 0.16, STH.mezz, 1.06);
  for (const s of [-1, 1]) {
    bx(b, s > 0 ? STAIR.xin - 0.4 : -STAIR.xin - 0.4, s > 0 ? STAIR.xin + 0.4 : -STAIR.xin + 0.4,
      STH.mezz, STH.mezz + 1.5, STAIR.zout - 0.5, STAIR.zout + 0.2, MARB_HI, MI.marbHi, { topCol: MARB });
    b.push(mat4(s * (STAIR.xin + 0.0), STH.mezz + 1.62, STAIR.zout - 0.15));
    ellipsoid(b, 0.26, 0.28, 0.26, 6, 4, GOLD_HI, MI.goldHi);
    b.pop();
  }
  // ---- rear wall with the arch down into the garden court ----
  wallZ(b, XL, XR, FY, STH.ceil, STH.z1, STH.z1 + 1.2, [GA], WALL, MI.wall, WALL, MI.wall);
  // archivolt + keystone on the stair side, flanking statues
  ringZ(b, GA.cx, GA.spring, GA.hx - 0.10, GA.hx + 0.42, STH.z1 - 0.06, 0, Math.PI, 20, GOLD, MI.gold, true);
  ringZ(b, GA.cx, GA.spring, GA.hx + 0.42, GA.hx + 0.70, STH.z1 - 0.02, 0, Math.PI, 20, MARB_HI, MI.marbHi, true);
  bx(b, -0.55, 0.55, GA.spring + GA.hx - 0.10, GA.spring + GA.hx + 0.50, STH.z1 - 0.30, STH.z1 - 0.02, GOLD_HI, MI.goldHi);
  for (const s of [-1, 1]) {
    pedestal(b, s * 8.35, FY, STH.z1 - 0.85, 1.3, 0.85, 1.2, MARB);
    figure(b, s * 8.35, FY + 0.85, STH.z1 - 0.85, 1.45, 0, MARB_HI, MI.marb);
    candelabrum(b, s * 5.9, FY, STH.z1 - 1.1, 1.3);
  }
  // the big luminous lunette over the mezzanine landing
  windowZ(b, 0, STH.mezz + 0.6, 4.4, STH.mezz + 0.6 + 4.4, STH.z1 - 0.12, mixc(GLASS_W, C.sunGlow, 0.4), MARB_HI, { seg: 12 });
  void ctx; void R;
}

// ---- winter garden court ---------------------------------------------------
function shellGarden(b, ctx, R) {
  checker(b, GAR.x0, GAR.x1, GAR.z0, GAR.z1, FY, 1.60, 1.60, mulc(FLOOR_A, 0.92),
    mulc(mixc(FLOOR_B, C.slateLight, 0.30), 0.74), MI.marb);
  // south (outer) wall with three tall lit windows
  bx(b, GAR.x0 - ZW, GAR.x1 + ZW, FY, GAR.ceil, GAR.z1, GAR.z1 + 0.9, WALL, MI.wall, { topCol: WALL_HI, bottomCol: WALL_SH });
  for (const cx of [-6.6, 0, 6.6]) {
    windowZ(b, cx, 2.0, 2.4, 9.4, GAR.z1 - 0.10, mixc(GLASS_G, GLASS_W, 0.35), MARB_HI, { seg: 12 });
  }
  // glazed barrel vault (springing 13.4, crown 15.4) + gold ribs
  glassVaultZ(b, GAR.x0, GAR.x1, GAR.z0, GAR.z1, GAR.eave, GAR.ceil, 12, 8);
  void ctx; void R;
}

// ---- music salon / ballroom -----------------------------------------------
function shellSalon(b, ctx, R) {
  const XR = SAL.x1 + WALLG;
  // parquet field
  checker(b, SAL.x0, SAL.x1, SAL.z0, SAL.z1, FY, 1.42, 2.84, PARQ_A, PARQ_B, MI.wood);
  ceilSlab(b, SAL.x0 - ZW, XR, 135.75, SAL.z1 + 0.9, SAL.ceil, 0.5);
  bx(b, SAL.x1, XR, FY, SAL.ceil, SAL.z0 - ZW, SAL.z1 + 0.9, WALL, MI.wall, { topCol: WALL_HI, bottomCol: WALL_SH });
  bx(b, SAL.x0 - ZW, XR, FY, SAL.ceil, SAL.z1, SAL.z1 + 0.9, WALL, MI.wall, { topCol: WALL_HI, bottomCol: WALL_SH });
  bx(b, SAL.x0, SAL.x1, GAL.ceil, SAL.ceil, SAL.z0 - ZW, SAL.z0, WALL, MI.wall, { topCol: WALL_HI });
  void ctx; void R;
}

// ---- royal study / library -------------------------------------------------
function shellStudy(b, ctx, R) {
  const XL = STD.x0 - WALLG;
  // dark oak parquet, longitudinal boards
  checker(b, STD.x0, STD.x1, STD.z0, STD.z1, FY, 1.16, 2.32, PARQ_A, PARQ_B, MI.wood);
  ceilSlab(b, XL, STD.x1 + ZW, 135.75, STD.z1 + 0.9, STD.ceil, 0.5);
  bx(b, XL, STD.x0, FY, STD.ceil, STD.z0 - ZW, STD.z1 + 0.9, WALL, MI.wall, { topCol: WALL_HI, bottomCol: WALL_SH });
  bx(b, XL, STD.x1 + ZW, FY, STD.ceil, STD.z1, STD.z1 + 0.9, WALL, MI.wall, { topCol: WALL_HI, bottomCol: WALL_SH });
  void ctx; void R;
}
// ---- helpers used by the shells above --------------------------------------
// barrel vault (elliptical) over an XY cross-section, extruded along z
function vaultZ(b, x0, x1, z0, z1, ySpring, yCrown, nSeg, nBay, colA, colB, colRib) {
  const a = (x1 - x0) / 2, xc = (x0 + x1) / 2, br = yCrown - ySpring;
  const dz = (z1 - z0) / nBay;
  const P = (t) => [xc + Math.cos(t) * a, ySpring + Math.sin(t) * br];
  const N = (t) => {
    const nx = -Math.cos(t) / a, ny = -Math.sin(t) / br, nl = Math.hypot(nx, ny) || 1;
    return [nx / nl, ny / nl, 0];
  };
  for (let j = 0; j < nBay; j++) {
    const za = z0 + dz * j, zb = za + dz;
    for (let i = 0; i < nSeg; i++) {
      const t0 = (Math.PI * i) / nSeg, t1 = (Math.PI * (i + 1)) / nSeg;
      const p0 = P(t0), p1 = P(t1), N0 = N((t0 + t1) / 2);
      b.quad([p0[0], p0[1], za], [p1[0], p1[1], za], [p1[0], p1[1], zb], [p0[0], p0[1], zb],
        j % 2 ? colA : colB, MI.marb, N0);
      // gold transverse ribs on the bay boundary
      if (i >= 0 && j > 0) {
        const s = 0.972;
        const q0 = [xc + (p0[0] - xc) * s, ySpring + (p0[1] - ySpring) * s];
        const q1 = [xc + (p1[0] - xc) * s, ySpring + (p1[1] - ySpring) * s];
        b.quad([q0[0], q0[1], za - 0.02], [q1[0], q1[1], za - 0.02], [p1[0], p1[1], za], [p0[0], p0[1], za], colRib, MI.gold, N0);
      }
    }
  }
  // gold rosettes at the crown of each bay
  for (let j = 0; j < nBay; j++) {
    b.push(mat4(xc, yCrown - 0.06, z0 + dz * (j + 0.5)));
    ellipsoid(b, 0.42, 0.10, 0.42, 8, 3, GOLD, MI.gold);
    b.pop();
  }
  // springing cornice lines
  for (const s of [-1, 1]) {
    bx(b, xc + s * a - 0.18, xc + s * a + (s > 0 ? 0.30 : 0.18), ySpring - 0.42, ySpring, z0, z1,
      GOLD, MI.gold);
  }
}
// glazed barrel vault for the winter-garden court: glowing panes + gold ribs
function glassVaultZ(b, x0, x1, z0, z1, ySpring, yCrown, nSeg, nBay) {
  const a = (x1 - x0) / 2, xc = (x0 + x1) / 2, br = yCrown - ySpring;
  const dz = (z1 - z0) / nBay;
  const P = (t) => [xc + Math.cos(t) * a, ySpring + Math.sin(t) * br];
  const N = (t) => {
    const nx = -Math.cos(t) / a, ny = -Math.sin(t) / br, nl = Math.hypot(nx, ny) || 1;
    return [nx / nl, ny / nl, 0];
  };
  for (let j = 0; j < nBay; j++) {
    const za = z0 + dz * j, zb = za + dz;
    for (let i = 0; i < nSeg; i++) {
      const t0 = (Math.PI * i) / nSeg, t1 = (Math.PI * (i + 1)) / nSeg;
      const p0 = P(t0), p1 = P(t1), N0 = N((t0 + t1) / 2);
      b.quad([p0[0], p0[1], za], [p1[0], p1[1], za], [p1[0], p1[1], zb], [p0[0], p0[1], zb],
        (i + j) % 2 ? GLASS_G : GLASS_S, MI.glassLo, N0);
      // gold glazing bar along z
      const s = 0.985;
      const q0 = [xc + (p0[0] - xc) * s, ySpring + (p0[1] - ySpring) * s];
      const q1 = [xc + (p1[0] - xc) * s, ySpring + (p1[1] - ySpring) * s];
      b.quad([q0[0], q0[1], za], [q1[0], q1[1], za], [p1[0], p1[1], za], [p0[0], p0[1], za], GOLD, MI.gold, N0);
    }
    // heavier transverse rib + a gold rosette at the crown
    for (let i = 0; i < nSeg; i++) {
      const t0 = (Math.PI * i) / nSeg, t1 = (Math.PI * (i + 1)) / nSeg;
      const p0 = P(t0), p1 = P(t1);
      const s = 0.955;
      const q0 = [xc + (p0[0] - xc) * s, ySpring + (p0[1] - ySpring) * s];
      const q1 = [xc + (p1[0] - xc) * s, ySpring + (p1[1] - ySpring) * s];
      b.quad([q0[0], q0[1], za - 0.10], [q1[0], q1[1], za - 0.10], [p1[0], p1[1], za], [p0[0], p0[1], za],
        GOLD_HI, MI.goldHi, N((t0 + t1) / 2));
    }
    b.push(mat4(xc, yCrown - 0.10, za + dz * 0.5));
    ellipsoid(b, 0.34, 0.12, 0.34, 8, 3, GOLD, MI.gold);
    b.pop();
  }
  // springing cornice + a hanging basket per bay
  for (const s of [-1, 1]) {
    bx(b, xc + s * a - (s > 0 ? 0.0 : 0.26), xc + s * a + (s > 0 ? 0.26 : 0.0), ySpring - 0.34, ySpring, z0, z1, GOLD, MI.gold);
  }
}

// gable roof: two slopes from the eaves (x0/x1) up to a ridge at cx, yCrown
function roofGableZ(b, x0, x1, z0, z1, yEave, yRidge, cxIn) {
  const cx = cxIn !== undefined ? cxIn : (x0 + x1) / 2;
  const nz = 8, nx = 4;
  const dz = (z1 - z0) / nz;
  for (const s of [-1, 1]) {
    const xe = s > 0 ? x1 : x0;
    // inward normal: points down into the room
    const dx = cx - xe, dy = yRidge - yEave;
    const nl = Math.hypot(dx, dy);
    const N = [-dy / nl * (s > 0 ? 1 : -1), -Math.abs(dx) / nl, 0];
    for (let j = 0; j < nz; j++) {
      const za = z0 + dz * j, zb = za + dz;
      for (let i = 0; i < nx; i++) {
        const t0 = i / nx, t1 = (i + 1) / nx;
        const xa = xe + dx * t0, xb = xe + dx * t1;
        const ya = yEave + dy * t0, yb = yEave + dy * t1;
        // glass pane
        b.quad([xa, ya, za], [xb, yb, za], [xb, yb, zb], [xa, ya, zb],
          (i + j) % 2 ? GLASS_S : GLASS_G, MI.glassLo, N);
        // gold glazing bar along z at each pane edge
        if (i > 0) bx(b, Math.min(xa, xb) - 0.05, Math.max(xa, xb) + 0.05, Math.min(ya, yb) - 0.07, Math.max(ya, yb) + 0.07, za, zb, GOLD, MI.gold);
      }
      // heavier transverse rib per bay
      bx(b, Math.min(xe, cx), Math.max(xe, cx), yEave + dy * 0.5 - 0.06, yEave + dy * 0.5 + 0.06, za - 0.06, za + 0.06, GOLD, MI.goldD);
    }
    // eave line
    bx(b, s > 0 ? x1 - 0.3 : x0, s > 0 ? x1 : x0 + 0.3, yEave - 0.3, yEave + 0.1, z0, z1, WALL_HI, MI.wallHi);
  }
  // ridge beam
  bx(b, cx - 0.16, cx + 0.16, yRidge - 0.24, yRidge + 0.06, z0, z1, GOLD_HI, MI.goldHi);
}
// stone gable fill under a roof profile (into a Z-facing wall), from yBase up to the roof
function gableFillZ(b, x0, x1, yBase, yRidge, cx, z, faceBack) {
  const n = 26, N = faceBack ? PZ : NZ;
  for (let i = 0; i < n; i++) {
    const xa = x0 + ((x1 - x0) * i) / n, xb = x0 + ((x1 - x0) * (i + 1)) / n;
    const xm = (xa + xb) / 2;
    const yr = yRidge - (yRidge - GAR.eave) * Math.abs(xm - cx) / ((x1 - x0) / 2);
    if (yr <= yBase + 0.01) continue;
    b.quad([xa, yBase, z], [xb, yBase, z], [xb, yr, z], [xa, yr, z], WALL, MI.wall, N);
    b.quad([xb, yBase, z + 0.9], [xa, yBase, z + 0.9], [xa, yr, z + 0.9], [xb, yr, z + 0.9], WALL, MI.wall, faceBack ? NZ : PZ);
  }
}

// ============================================================== props
// draped statue, feet at (x,y,z)
function figure(b, x, y, z, s, yaw, col, mat) {
  const c = col || MARB_HI, m = mat || MI.marb;
  at(b, x, y, z, yaw || 0, () => {
    lathe(b, [[0.34, 0], [0.30, 0.10], [0.26, 0.28], [0.215, 0.55], [0.19, 0.86], [0.20, 1.06], [0.235, 1.20], [0.225, 1.30]], 8, c, m);
    lathe(b, [[0.215, 0.55], [0.19, 0.86]], 8, mulc(c, 0.90), m);
    b.push(mat4(0, 1.36, 0.02)); box(b, 0.34, 0.26, 0.30, mulc(c, 1.02), m); b.pop();
    b.push(mat4(0, 1.50, 0.01)); box(b, 0.44, 0.10, 0.26, mulc(c, 1.05), m); b.pop();
    b.push(mat4(0, 1.67, 0.01));
    ellipsoid(b, 0.115, 0.135, 0.115, 6, 4, mulc(c, 1.05), m);
    b.pop();
    b.push(mat4(0, 1.73, -0.02)); box(b, 0.20, 0.10, 0.19, mulc(c, 0.86), m); b.pop();
    bar3(b, [0.19, 1.48, 0], [0.34, 1.72, 0.10], 0.10, 0.10, c, m);
    bar3(b, [0.32, 1.70, 0.10], [0.30, 1.96, 0.14], 0.085, 0.085, mulc(c, 1.02), m);
    bar3(b, [-0.19, 1.48, 0], [-0.28, 1.16, 0.14], 0.095, 0.095, mulc(c, 0.98), m);
    b.quad([-0.30, 1.42, -0.16], [0.30, 1.42, -0.16], [0.42, 0.62, -0.30], [-0.36, 0.62, -0.30], mulc(c, 0.92), m, PZ);
  });
}
function pedestal(b, x, y, z, w, h, d, col) {
  const c = col || MARB;
  bx(b, x - w / 2, x + w / 2, y, y + h, z - d / 2, z + d / 2, c, MI.marb, { topCol: MARB_HI });
  bx(b, x - w / 2 - 0.10, x + w / 2 + 0.10, y + h - 0.14, y + h, z - d / 2 - 0.10, z + d / 2 + 0.10, GOLD, MI.gold);
  bx(b, x - w / 2 - 0.08, x + w / 2 + 0.08, y, y + 0.16, z - d / 2 - 0.08, z + d / 2 + 0.08, MARB_HI, MI.marbHi);
}
// candle crown: a ring of lit candles with gold cups
function candleRing(b, r, y, n, s, colWax) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, px = Math.cos(a) * r, pz = Math.sin(a) * r;
    b.push(mat4(px, y, pz));
    cylinder(b, 5, 0.045 * s, 0.038 * s, 0.30 * s, colWax || mixc(C.cloudLit, C.sunGlow, 0.45), MI.cloth, { y0: 0 });
    b.pop();
    b.push(mat4(px, y + 0.34 * s, pz));
    ellipsoid(b, 0.06 * s, 0.10 * s, 0.06 * s, 5, 3, mixc(C.sunGlow, C.cloudLit, 0.30), MI.glowW);
    b.pop();
  }
}
// big hanging chandelier; y = the bowl centre, chain up to ceilY
function chandelier(b, x, y, z, s, ceilY) {
  const k = s, top = ceilY !== undefined ? ceilY - 0.05 : y + 4.6 * k;
  const y0 = y + 0.55 * k;
  const n = 5, step = Math.max(0.22, (top - y0) / n);
  for (let i = 0; i < n; i++) {
    const yy = y0 + step * (i + 0.5);
    bx(b, x - 0.06 * k, x + 0.06 * k, yy - step * 0.45, yy + step * 0.45, z - 0.06 * k, z + 0.06 * k, GOLD, MI.gold);
  }
  at(b, x, y, z, 0, () => {
    torus(b, 1.10 * k, 0.10 * k, 14, 4, GOLD, MI.gold, 'y');
    torus(b, 0.66 * k, 0.08 * k, 12, 4, GOLD, MI.gold, 'y');
    torus(b, 0.34 * k, 0.06 * k, 10, 3, GOLD_HI, MI.goldHi, 'y');
    b.push(mat4(0, 0.40 * k, 0)); ellipsoid(b, 0.36 * k, 0.32 * k, 0.36 * k, 7, 4, GOLD, MI.gold); b.pop();
    b.push(mat4(0, -0.30 * k, 0)); ellipsoid(b, 0.22 * k, 0.30 * k, 0.22 * k, 7, 4, GOLD_HI, MI.goldHi); b.pop();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      bar3(b, [Math.cos(a) * 0.30 * k, 0.30 * k, Math.sin(a) * 0.30 * k],
        [Math.cos(a) * 1.08 * k, 0.14 * k, Math.sin(a) * 1.08 * k], 0.05 * k, 0.05 * k, GOLD, MI.gold);
    }
    candleRing(b, 1.08 * k, 0.18 * k, 12, k);
    candleRing(b, 0.62 * k, 0.44 * k, 8, k * 0.85);
  });
}
// standing candelabrum, 1.9 m at s=1
function candelabrum(b, x, y, z, s) {
  const k = s || 1;
  at(b, x, y, z, 0, () => {
    lathe(b, [[0.28 * k, 0], [0.24 * k, 0.06 * k], [0.14 * k, 0.12 * k], [0.09 * k, 0.30 * k], [0.07 * k, 1.10 * k], [0.10 * k, 1.20 * k], [0.20 * k, 1.26 * k]], 7, GOLD, MI.gold);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + 0.4;
      bar3(b, [0, 1.24 * k, 0], [Math.cos(a) * 0.30 * k, 1.56 * k, Math.sin(a) * 0.30 * k], 0.05 * k, 0.05 * k, GOLD, MI.gold);
      b.push(mat4(Math.cos(a) * 0.30 * k, 1.58 * k, Math.sin(a) * 0.30 * k));
      cylinder(b, 5, 0.05 * k, 0.04 * k, 0.28 * k, mixc(C.cloudLit, C.sunGlow, 0.4), MI.cloth, { y0: 0 });
      b.pop();
      b.push(mat4(Math.cos(a) * 0.30 * k, 1.90 * k, Math.sin(a) * 0.30 * k));
      ellipsoid(b, 0.07 * k, 0.11 * k, 0.07 * k, 5, 3, mixc(C.sunGlow, C.cloudLit, 0.3), MI.glowW);
      b.pop();
    }
  });
}
// flower urn
function flowerUrn(b, x, y, z, s, seed) {
  const k = s || 1;
  const cols = [C.bloomPink, C.bloomRed, C.bloomYellow, C.bloomBlue, C.bloomWhite];
  at(b, x, y, z, 0, () => {
    b.push(mat4(0, 0.09 * k, 0)); box(b, 0.62 * k, 0.18 * k, 0.62 * k, MARB_SH, MI.marb); b.pop();
    lathe(b, [[0.12 * k, 0.18 * k], [0.26 * k, 0.30 * k], [0.30 * k, 0.48 * k], [0.24 * k, 0.66 * k], [0.27 * k, 0.72 * k]], 8, MARB, MI.marb);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + 0.3, r = 0.13 * k;
      b.push(mat4(Math.cos(a) * r, (0.80 + (i % 3) * 0.07) * k, Math.sin(a) * r));
      ellipsoid(b, 0.085 * k, 0.075 * k, 0.085 * k, 5, 3, cols[(i + (seed || 0)) % cols.length], MI.bloom);
      b.pop();
    }
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + 1.1;
      b.push(mat4(Math.cos(a) * 0.20 * k, 0.74 * k, Math.sin(a) * 0.20 * k));
      ellipsoid(b, 0.16 * k, 0.05 * k, 0.10 * k, 5, 3, LEAF_L, MI.leaf);
      b.pop();
    }
  });
}
// one palm frond: curved spine + two rows of leaflets (adapted from glass-greenhouse)
function frond(b, base, a, len, lift, droop, colA, colB, wSc) {
  const dx = Math.cos(a), dz = Math.sin(a);
  const pts = [];
  for (let i = 0; i <= 5; i++) {
    const t = i / 5, rr = len * t;
    pts.push([base[0] + dx * rr, base[1] + lift * t - droop * t * t + 0.30 * wSc * (1 - t),
      base[2] + dz * rr]);
  }
  for (let i = 0; i < 5; i++) bar3(b, pts[i], pts[i + 1], 0.055 * wSc, 0.055 * wSc, mulc(colA, 0.92), MI.leaf);
  for (let i = 1; i <= 5; i++) {
    const p = pts[i], q = pts[i - 1];
    const ux = p[0] - q[0], uy = p[1] - q[1], uz = p[2] - q[2];
    const sx = -dz, sz = dx;
    for (const s of [-1, 1]) {
      const ll = (0.50 + 0.52 * (1 - i / 6)) * wSc;
      const tip = [p[0] + sx * s * ll, p[1] - 0.26 * ll, p[2] + sz * s * ll];
      const tip2 = [tip[0] + ux * 0.30, tip[1] - 0.10 * wSc, tip[2] + uz * 0.30];
      const b0 = [p[0] + ux * 0.20, p[1] + uy * 0.20, p[2] + uz * 0.20];
      const b1 = [p[0] + ux * 0.70, p[1] + uy * 0.70, p[2] + uz * 0.70];
      b.quad(b0, tip, tip2, b1, mulc(mixc(colA, colB, i / 6), 0.86), MI.leaf, [0, 1, 0]);
    }
  }
}
// palm: leaning trunk + two crowns of fronds, h metres at s=1
function palm(b, x, y, z, h, s, R) {
  const k = s || 1, H = h * k;
  const rnd = R || (() => 0.5);
  const lean = (0.35 + rnd() * 0.55) * k, ba = rnd() * TAU;
  const n = 5, pts = [], radii = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([x + Math.cos(ba) * lean * t * t, y + H * 0.86 * t, z + Math.sin(ba) * lean * t * t]);
    radii.push((0.24 - 0.09 * t) * k);
  }
  tubePath(b, pts, radii, 5, mulc(WOOD, 0.92), MI.wood);
  for (let i = 1; i < n; i++) {
    b.push(mat4(pts[i][0], pts[i][1], pts[i][2]));
    cylinder(b, 5, radii[i] + 0.045 * k, radii[i] + 0.040 * k, 0.07 * k, GOLD, MI.goldD, { y0: -0.035 * k, caps: false });
    b.pop();
  }
  const top = pts[n];
  const nf = 11;
  for (let f = 0; f < nf; f++) {
    const a = (f / nf) * TAU + rnd() * 0.28;
    frond(b, top, a, H * (0.20 + rnd() * 0.08), 0.8 + rnd() * 0.4, 1.3 + rnd() * 0.9, mulc(LEAF, 0.95), LEAF, 0.92 * k);
  }
  for (let f = 0; f < 6; f++) {
    const a = (f / 6) * TAU + 0.6;
    frond(b, top, a, H * (0.13 + rnd() * 0.05), 1.4, 0.8, LEAF, mulc(LEAF_L, 1.05), 0.74 * k);
  }
  for (let f = 0; f < 3; f++) {
    const a = rnd() * TAU;
    frond(b, top, a, H * 0.15, -0.4, 1.9, mulc(LEAF, 0.66), mulc(LEAF_L, 0.75), 0.72 * k);
  }
  b.push(mat4(top[0], top[1] - 0.1 * k, top[2]));
  ellipsoid(b, 0.26 * k, 0.22 * k, 0.26 * k, 6, 3, mulc(LEAF_D, 1.2), MI.leaf);
  b.pop();
}
// tree fern
function fern(b, x, y, z, s, R) {
  const k = s || 1;
  const rnd = R || (() => 0.5);
  at(b, x, y, z, 0, () => {
    b.push(mat4(0, 0.16 * k, 0)); box(b, 0.54 * k, 0.32 * k, 0.54 * k, MARB_SH, MI.marb); b.pop();
    b.push(mat4(0, 0.30 * k, 0));
    cylinder(b, 6, 0.10 * k, 0.13 * k, 0.5 * k, mulc(WOOD_D, 0.9), MI.wood, { y0: 0 });
    b.pop();
    const top = [0, 0.78 * k, 0];          // local to the frame opened above
    for (let f = 0; f < 9; f++) {
      const a = (f / 9) * TAU + rnd() * 0.4;
      frond(b, top, a, (1.0 + rnd() * 0.45) * k, 0.55 + rnd() * 0.4, 1.35 + rnd() * 0.7,
        mulc(LEAF, 1.05), LEAF_L, 0.75 * k);
    }
  });
}
// potted orange tree
function orangeTree(b, x, y, z, s) {
  const k = s || 1;
  at(b, x, y, z, 0, () => {
    lathe(b, [[0.30 * k, 0], [0.40 * k, 0.10 * k], [0.44 * k, 0.42 * k], [0.40 * k, 0.52 * k], [0.44 * k, 0.58 * k]], 8, MARB_SH, MI.marb);
    b.push(mat4(0, 0.62 * k, 0));
    cylinder(b, 6, 0.09 * k, 0.07 * k, 0.85 * k, mulc(WOOD, 0.8), MI.wood, { y0: 0 });
    b.pop();
    const blobs = [[0, 1.42, 0, 0.34], [0.22, 1.28, 0.10, 0.24], [-0.20, 1.30, -0.12, 0.22], [0.06, 1.60, -0.08, 0.20]];
    for (let i = 0; i < blobs.length; i++) {
      const [px, py, pz, r] = blobs[i];
      b.push(mat4(px * k, py * k, pz * k));
      ellipsoid(b, r * k, r * 0.86 * k, r * k, 6, 4, i % 2 ? LEAF : LEAF_L, MI.leaf);
      b.pop();
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + 0.4;
      b.push(mat4(Math.cos(a) * 0.24 * k, (1.24 + (i % 3) * 0.12) * k, Math.sin(a) * 0.22 * k));
      ellipsoid(b, 0.075 * k, 0.075 * k, 0.075 * k, 5, 3, C.koiGold, MI.bloom);
      b.pop();
    }
  });
}
// marble bench along X
function bench(b, x, y, z, len, depth) {
  const hw = len / 2, d = (depth || 0.62) / 2;
  bx(b, x - hw, x + hw, y, y + 0.14, z - d - 0.04, z + d + 0.04, MARB_HI, MI.marbHi, { topCol: MARB });
  bx(b, x - hw + 0.12, x + hw - 0.12, y - 0.42, y, z - d, z + d, MARB_SH, MI.marb);
  for (const s of [-1, 1]) bx(b, x + s * (hw - 0.22) - 0.14, x + s * (hw - 0.22) + 0.14, y - 0.52, y - 0.40, z - d - 0.02, z + d + 0.02, GOLD, MI.gold);
  bx(b, x - hw + 0.25, x + hw - 0.25, y + 0.14, y + 0.26, z - d + 0.04, z + d - 0.04, VELVET, MI.velvet);
  for (const s of [-1, 1]) bar3(b, [x + s * (hw - 0.1), y + 0.06, z], [x + s * (hw - 0.1), y + 0.62, z], 0.10, 0.10, GOLD, MI.gold);
}
// velvet sofa, facing -Z when yaw = 0
function sofa(b, x, y, z, len, yaw) {
  const hw = len / 2, d = 0.95;
  at(b, x, y, z, yaw || 0, () => {
    bx(b, -hw, hw, 0.10, 0.42, -d / 2, d / 2, VELVET, MI.velvet, { topCol: mulc(VELVET, 1.08) });
    bx(b, -hw, hw, 0.42, 0.56, -d / 2 + 0.05, d / 2 - 0.05, VELVET, MI.velvet, { topCol: mulc(VELVET, 1.10) });
    bx(b, -hw, hw, 0.42, 1.14, d / 2 - 0.26, d / 2, VELVET, MI.velvet, { topCol: mulc(VELVET, 1.06) });
    bx(b, -hw + 0.04, hw - 0.04, 1.14, 1.24, d / 2 - 0.30, d / 2 + 0.03, GOLD, MI.gold);
    bx(b, -hw, -hw + 0.22, 0.42, 1.02, -d / 2, d / 2 - 0.16, VELVET, MI.velvet);
    bx(b, hw - 0.22, hw, 0.42, 1.02, -d / 2, d / 2 - 0.16, VELVET, MI.velvet);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      bx(b, sx * (hw - 0.18) - 0.05, sx * (hw - 0.18) + 0.05, 0, 0.12, sz * (d / 2 - 0.12) - 0.05, sz * (d / 2 - 0.12) + 0.05, GOLD, MI.gold);
    }
    bx(b, -hw + 0.02, hw - 0.02, 0.40, 0.46, -d / 2 + 0.10, -d / 2 + 0.14, GOLD, MI.goldD);
    for (const sx of [-1, 1]) bx(b, sx * (hw - 0.60) - 0.34, sx * (hw - 0.60) + 0.34, 0.56, 0.98, d / 2 - 0.48, d / 2 - 0.20,
      sx > 0 ? VELVET_B : mulc(VELVET, 1.16), MI.velvet);
  });
}
function armchair(b, x, y, z, yaw) {
  at(b, x, y, z, yaw || 0, () => {
    bx(b, -0.52, 0.52, 0.10, 0.46, -0.46, 0.46, VELVET, MI.velvet, { topCol: mulc(VELVET, 1.08) });
    bx(b, -0.52, 0.52, 0.46, 0.56, -0.46, 0.40, VELVET, MI.velvet);
    bx(b, -0.52, 0.52, 0.56, 1.22, 0.24, 0.46, VELVET, MI.velvet, { topCol: mulc(VELVET, 1.06) });
    bx(b, -0.56, 0.56, 1.22, 1.30, 0.20, 0.50, GOLD, MI.gold);
    for (const s of [-1, 1]) {
      bx(b, s * 0.52, s * 0.70, 0.46, 0.92, -0.46, 0.36, VELVET, MI.velvet);
      bx(b, s * 0.52, s * 0.70, 0.92, 1.00, -0.46, 0.36, GOLD, MI.gold);
      for (const sz of [-1, 1]) bx(b, s * 0.60 - 0.06, s * 0.60 + 0.06, 0, 0.12, sz * 0.36 - 0.06, sz * 0.36 + 0.06, GOLD, MI.goldD);
    }
  });
}
// round marble-topped table
function table(b, x, y, z, r, h) {
  const hh = h || 0.78;
  b.push(mat4(x, y + hh, z)); cylinder(b, 12, r, r, 0.10, MARB_HI, MI.marbHi, { y0: 0 }); b.pop();
  b.push(mat4(x, y + hh - 0.06, z)); cylinder(b, 12, r, r * 0.96, 0.06, GOLD, MI.gold, { y0: 0 }); b.pop();
  b.push(mat4(x, y, z)); cylinder(b, 8, 0.14, 0.10, hh - 0.10, GOLD, MI.gold, { y0: 0 }); b.pop();
  b.push(mat4(x, y, z)); cylinder(b, 8, 0.34, 0.26, 0.10, GOLD, MI.gold, { y0: 0 }); b.pop();
}
// tall bookcase wall along X on a Z wall, books from the local rng
function bookcaseZ(b, x0, x1, y0, y1, z, R) {
  const w = x1 - x0;
  bx(b, x0, x1, y0, y0 + 0.28, z, z + 0.30, WOOD_D, MI.woodD, { topCol: WOOD });
  bx(b, x0, x1, y1 - 0.34, y1, z, z + 0.50, WOOD, MI.wood, { topCol: mulc(WOOD, 1.1) });
  bx(b, x0 - 0.10, x0 + 0.10, y0, y1, z, z + 0.50, WOOD_D, MI.woodD);
  bx(b, x1 - 0.10, x1 + 0.10, y0, y1, z, z + 0.50, WOOD_D, MI.woodD);
  const shelves = 6, hEach = (y1 - y0 - 0.9) / shelves;
  const bookCols = [RED, BLUE, LEAF_D, WOOD, mulc(BLUE_HI, 0.7), mulc(RED_HI, 0.8), mulc(LEAF, 0.8), mulc(WOOD, 1.2)];
  for (let s = 0; s < shelves; s++) {
    const sy = y0 + 0.5 + s * hEach;
    bx(b, x0, x1, sy - 0.06, sy, z + 0.06, z + 0.46, WOOD, MI.wood, { topCol: mulc(WOOD, 1.08) });
    bx(b, x0, x1, sy, sy + 0.05, z + 0.10, z + 0.44, mulc(WOOD_D, 0.9), MI.woodD);
    const nb = Math.max(6, Math.round(w / 0.22));
    for (let i = 0; i < nb; i++) {
      const bx0 = x0 + 0.16 + ((w - 0.32) * i) / nb + (R ? R() * 0.02 : 0);
      const bw = (w - 0.32) / nb - 0.02 - (R ? R() * 0.03 : 0);
      const bh = hEach * (0.52 + (R ? R() * 0.30 : 0.15));
      const bc = bookCols[Math.floor((R ? R() : 0.4) * bookCols.length) % bookCols.length];
      bx(b, bx0, bx0 + bw, sy + 0.05, sy + 0.05 + bh, z + 0.12, z + 0.12 + 0.16 + (R ? R() * 0.10 : 0.05), bc, MI.book);
      if (R && R() > 0.82) bx(b, bx0, bx0 + bw, sy + 0.05, sy + 0.05 + bh * 0.85, z + 0.13, z + 0.14, GOLD, MI.gold);
    }
    if (R && R() > 0.45) {
      const px = x0 + 0.5 + (R() * (w - 1.0));
      for (let k = 0; k < 3; k++) bx(b, px - 0.16, px + 0.16, sy + 0.05 + k * 0.07, sy + 0.10 + k * 0.07, z + 0.14, z + 0.42, bookCols[(k + s) % bookCols.length], MI.book);
    }
  }
  bx(b, x0 - 0.14, x1 + 0.14, y1, y1 + 0.22, z, z + 0.56, GOLD, MI.gold);
  bx(b, x0, x1, y0 + 0.30, y0 + 0.36, z, z + 0.34, GOLD, MI.gold);
}
// bookcase against an X wall; dir=+1 means the room is at x > face (faces +X)
function bookcaseX(b, z0, z1, y0, y1, x, dir, R) {
  at(b, x, 0, 0, dir > 0 ? -Math.PI / 2 : Math.PI / 2, () => {
    const a = dir > 0 ? -z1 : z0, c = dir > 0 ? -z0 : z1;
    bookcaseZ(b, a, c, y0, y1, 0, R);
  });
}
// globe on a stand
function globe(b, x, y, z, s) {
  const k = s || 1;
  at(b, x, y, z, 0, () => {
    lathe(b, [[0.34 * k, 0], [0.26 * k, 0.06 * k], [0.12 * k, 0.16 * k], [0.08 * k, 0.60 * k], [0.14 * k, 0.72 * k]], 8, WOOD, MI.wood);
    torus(b, 0.34 * k, 0.045 * k, 12, 3, GOLD, MI.gold, 'x');
    b.push(mat4(0, 0.96 * k, 0));
    ellipsoid(b, 0.32 * k, 0.32 * k, 0.32 * k, 10, 7, mixc(C.leafDark, C.water, 0.45), MI.marb);
    b.pop();
    b.push(mat4(0, 0.96 * k, 0));
    torus(b, 0.35 * k, 0.02 * k, 12, 3, GOLD, MI.gold, 'x');
    b.pop();
  });
}
// grand piano (faces -Z), lid open
function piano(b, x, y, z, yaw, s) {
  const k = s || 1;
  at(b, x, y, z, yaw || 0, () => {
    bx(b, -1.05 * k, 1.05 * k, 0.42 * k, 1.02 * k, -1.30 * k, 0.90 * k, mulc(C.catBlack, 1.5), MI.wood);
    bx(b, -1.05 * k, 0.55 * k, 0.42 * k, 1.02 * k, 0.90 * k, 1.60 * k, mulc(C.catBlack, 1.5), MI.wood);
    bx(b, -1.10 * k, 1.10 * k, 1.02 * k, 1.10 * k, -1.34 * k, 0.94 * k, GOLD, MI.goldD);
    b.push([1, 0, 0, 0, 0, Math.cos(-0.42), -Math.sin(-0.42), 0, 0, Math.sin(-0.42), Math.cos(-0.42), 0, 0, 1.10 * k, 0.2 * k, 1]);
    b.push(mat4(0.0, 0, -0.2 * k));
    box(b, 2.10 * k, 0.10 * k, 2.60 * k, mulc(C.catBlack, 1.7), MI.wood);
    b.pop();
    b.pop();
    bx(b, -1.02 * k, 1.02 * k, 0.98 * k, 1.05 * k, -1.62 * k, -1.34 * k, mulc(C.cloudLit, 0.94), MI.cloth);
    for (let i = 0; i < 14; i++) {
      const xx = -0.95 * k + i * (1.9 * k / 13);
      bx(b, xx - 0.02 * k, xx + 0.02 * k, 1.04 * k, 1.06 * k, -1.58 * k, -1.36 * k, mulc(C.catBlack, 2.2), MI.iron);
    }
    bx(b, -1.08 * k, 1.08 * k, 0.92 * k, 0.99 * k, -1.66 * k, -1.30 * k, WOOD, MI.wood);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      b.push(mat4(sx * 0.86 * k, 0, sz * 0.9 * k));
      cylinder(b, 7, 0.12 * k, 0.09 * k, 0.44 * k, mulc(C.catBlack, 1.6), MI.wood, { y0: 0 });
      b.pop();
    }
    bx(b, -0.30 * k, 0.30 * k, 0.06 * k, 0.20 * k, -1.44 * k, -1.20 * k, GOLD, MI.gold);
    bx(b, -0.75 * k, 0.75 * k, 1.10 * k, 1.44 * k, -1.50 * k, -1.42 * k, WOOD, MI.wood);
  });
}
// gilded harp
function harp(b, x, y, z, s, yaw) {
  const k = s || 1;
  at(b, x, y, z, yaw || 0, () => {
    lathe(b, [[0.40 * k, 0], [0.34 * k, 0.10 * k], [0.22 * k, 0.22 * k], [0.16 * k, 0.34 * k]], 8, GOLD, MI.gold);
    bar3(b, [-0.62 * k, 0.34 * k, 0], [-0.62 * k, 2.55 * k, 0], 0.14 * k, 0.16 * k, GOLD_HI, MI.goldHi);
    for (let i = 0; i < 5; i++) {
      const t0 = i / 5, t1 = (i + 1) / 5;
      const p0 = [-0.62 * k + t0 * 1.15 * k, 2.55 * k + Math.sin(t0 * 1.3) * 0.34 * k, 0];
      const p1 = [-0.62 * k + t1 * 1.15 * k, 2.55 * k + Math.sin(t1 * 1.3) * 0.34 * k, 0];
      bar3(b, p0, p1, 0.13 * k, 0.14 * k, GOLD, MI.gold);
    }
    bx(b, 0.30 * k, 0.64 * k, 0.34 * k, 2.84 * k, -0.14 * k, 0.14 * k, mixc(WOOD, GOLD, 0.35), MI.wood);
    for (let i = 0; i < 14; i++) {
      const t = i / 13;
      const xx = -0.56 * k + t * 1.05 * k;
      const yy0 = 0.44 * k + t * 0.10 * k;
      const yy1 = 2.62 * k + Math.sin(t * 1.3) * 0.30 * k;
      bar3(b, [xx, yy0, 0.01], [xx, yy1, 0.01], 0.012, 0.012, mixc(C.cloudLit, GOLD_HI, 0.5), MI.goldD);
    }
  });
}
// a hanging tapestry with folds (faces -Z in the local frame)
function tapestryZ(b, cx, y0, y1, w, z, colA, colB) {
  const cols = 8, ww = w / cols;
  for (let i = 0; i < cols; i++) {
    const xa = cx - w / 2 + i * ww, xb = xa + ww;
    const tone = 0.88 + 0.18 * Math.abs(Math.sin(i * 1.7 + 0.4));
    const zz = z - 0.05 - 0.05 * Math.sin(i * 1.3);
    bx(b, xa + 0.02, xb - 0.02, y0, y1, zz - 0.035, zz, mulc(colA, tone), MI.cloth, { topCol: mulc(colA, tone * 1.08) });
    bx(b, xb - 0.06, xb - 0.02, y0, y1, zz - 0.04, zz - 0.005, mulc(colA, 0.58), MI.cloth);
  }
  bx(b, cx - w / 2 - 0.16, cx + w / 2 + 0.16, y1, y1 + 0.24, z - 0.16, z + 0.04, GOLD, MI.gold);
  bx(b, cx - w / 2 - 0.16, cx - w / 2, y0, y1, z - 0.16, z + 0.04, GOLD, MI.gold);
  bx(b, cx + w / 2, cx + w / 2 + 0.16, y0, y1, z - 0.16, z + 0.04, GOLD, MI.gold);
  for (let i = 0; i < 7; i++) {
    const xa = cx - w / 2 + ww * (i + 0.5);
    bx(b, xa - 0.07, xa + 0.07, y0 - 0.30, y0, z - 0.10, z - 0.02, GOLD, MI.gold);
  }
  b.push(mat4(cx, y1 - 1.7, z - 0.14));
  ellipsoid(b, 0.85, 0.80, 0.10, 9, 5, colB || GOLD, MI.gold);
  b.pop();
}
// drapery: vertical folds against a Z wall (faces -Z in the local frame)
function curtainZ(b, x0, x1, y0, y1, z, col, n) {
  const nn = n || 6, w = (x1 - x0) / nn;
  for (let i = 0; i < nn; i++) {
    const xa = x0 + i * w;
    const bulge = 0.10 + 0.07 * Math.sin(i * 2.1);
    bx(b, xa + 0.03, xa + w - 0.03, y0, y1, z, z + bulge, mulc(col, 0.94 + 0.12 * ((i * 3) % 3) / 2), MI.velvet);
  }
  bx(b, x0 - 0.1, x1 + 0.1, y1 - 0.12, y1 + 0.12, z - 0.14, z + 0.14, GOLD, MI.gold);
}
// fireplace on a Z wall (faces -Z), glowing firebox
function fireplaceZ(b, cx, y0, w, h, z, ctx) {
  const hw = w / 2;
  bx(b, cx - hw - 0.5, cx + hw + 0.5, y0, y0 + h, z - 0.42, z, MARB, MI.marb, { topCol: MARB_HI });
  bx(b, cx - hw, cx + hw, y0, y0 + h * 0.72, z - 0.05, z - 0.02, mulc(C.koiRed, 0.24), MI.dark);
  for (let i = 0; i < 5; i++) {
    const ff = i / 4;
    qF(b, cx - hw * 0.7 + hw * 0.4 * ff, cx - hw * 0.2 + hw * 0.5 * ff, y0 + 0.12, y0 + 0.3 + 0.4 * (1 - ff), z - 0.06 - 0.01 * i,
      mixc(C.koiGold, C.sunGlow, ff * 0.7), MI.glowS);
  }
  bx(b, cx - hw - 0.75, cx + hw + 0.75, y0 + h, y0 + h + 0.22, z - 0.62, z, MARB_HI, MI.marbHi, { topCol: MARB });
  bx(b, cx - hw - 0.6, cx + hw + 0.6, y0 + h + 0.22, y0 + h + 1.9, z - 0.40, z, WALL_SH, MI.wallSh);
  for (const s of [-1, 1]) {
    bx(b, cx + s * (hw + 0.16) - 0.16, cx + s * (hw + 0.16) + 0.16, y0, y0 + h, z - 0.56, z, MARB_HI, MI.marbHi);
    bx(b, cx + s * (hw + 0.16) - 0.22, cx + s * (hw + 0.16) + 0.22, y0 + h - 0.20, y0 + h, z - 0.62, z, GOLD, MI.gold);
  }
  for (const s of [-1, 1]) bx(b, cx + s * hw * 0.55 - 0.05, cx + s * hw * 0.55 + 0.05, y0, y0 + 0.42, z - 0.30, z - 0.24, GOLD, MI.gold);
  // overmantel: gilded mirror + a mantel clock
  if (w > 2.0) {
    const my0 = y0 + h + 0.30, mw = Math.min(hw * 0.95, 1.5);
    bx(b, cx - mw - 0.16, cx + mw + 0.16, my0 - 0.16, my0, z - 0.50, z - 0.40, GOLD_HI, MI.goldHi);
    bx(b, cx - mw - 0.16, cx + mw + 0.16, my0 + 1.7, my0 + 1.86, z - 0.50, z - 0.40, GOLD_HI, MI.goldHi);
    bx(b, cx - mw - 0.16, cx - mw, my0, my0 + 1.7, z - 0.50, z - 0.40, GOLD_HI, MI.goldHi);
    bx(b, cx + mw, cx + mw + 0.16, my0, my0 + 1.7, z - 0.50, z - 0.40, GOLD_HI, MI.goldHi);
    b.quad([cx - mw, my0, z - 0.46], [cx + mw, my0, z - 0.46], [cx + mw, my0 + 1.7, z - 0.46], [cx - mw, my0 + 1.7, z - 0.46],
      mulc(mixc(C.slateDark, C.horizon, 0.45), 0.74), MI.mirror, [0, 0, -1]);
    bx(b, cx - 0.24, cx + 0.24, my0 + 0.62, my0 + 0.78, z - 0.62, z - 0.52, GOLD, MI.gold);
    b.push(mat4(cx, my0 + 0.70, z - 0.64));
    ellipsoid(b, 0.16, 0.16, 0.05, 6, 3, GOLD_HI, MI.goldHi);
    b.pop();
  }
  if (ctx && ctx.lanterns) {
    ctx.lanterns.push({ p: [cx, y0 + 0.5, z - 0.5], size: 1.8, rot: 0, alpha: 0.50, shape: 1, col: mixc(C.koiGold, C.sunGlow, 0.5) });
    ctx.lanterns.push({ p: [cx, y0 + h + 0.4, z - 0.7], size: 1.2, rot: 0, alpha: 0.30, shape: 1, col: mixc(C.sunGlow, C.cloudLit, 0.4) });
  }
}
// potted bay tree in a gilt tub
function tubTree(b, x, y, z, s) {
  const k = s || 1;
  bx(b, x - 0.42 * k, x + 0.42 * k, y, y + 0.52 * k, z - 0.42 * k, z + 0.42 * k, MARB_SH, MI.marb, { topCol: MARB });
  bx(b, x - 0.46 * k, x + 0.46 * k, y + 0.46 * k, y + 0.58 * k, z - 0.46 * k, z + 0.46 * k, GOLD, MI.gold);
  b.push(mat4(x, y + 0.58 * k, z));
  cylinder(b, 6, 0.10 * k, 0.08 * k, 1.3 * k, WOOD, MI.wood, { y0: 0 });
  b.pop();
  const blobs = [[0, 2.1, 0, 0.62], [0.32, 1.86, 0.12, 0.42], [-0.30, 1.9, -0.16, 0.40], [0.05, 2.42, -0.1, 0.36]];
  for (let i = 0; i < blobs.length; i++) {
    const [px, py, pz, r] = blobs[i];
    b.push(mat4(x + px * k, y + py * k, z + pz * k));
    ellipsoid(b, r * k, r * 0.82 * k, r * k, 6, 4, i % 2 ? LEAF : LEAF_D, MI.leaf);
    b.pop();
  }
}
// hanging plant basket
function hangingBasket(b, x, y, z, s) {
  const k = s || 1;
  bar3(b, [x, y + 0.42 * k, z], [x, y + 1.75 * k, z], 0.035, 0.035, GOLD, MI.goldD);
  bx(b, x - 0.05, x + 0.05, y + 1.55 * k, y + 1.75 * k, z - 0.05, z + 0.05, GOLD, MI.gold);
  b.push(mat4(x, y + 0.10 * k, z));
  ellipsoid(b, 0.44 * k, 0.36 * k, 0.44 * k, 7, 4, mulc(LEAF, 0.92), MI.leaf);
  b.pop();
  b.push(mat4(x, y, z));
  lathe(b, [[0.06 * k, 0.42 * k], [0.30 * k, 0.36 * k], [0.34 * k, 0.20 * k], [0.28 * k, 0.02 * k]], 8, WOOD, MI.wood);
  b.pop();
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU;
    b.push(mat4(x + Math.cos(a) * 0.30 * k, y + 0.10 * k, z + Math.sin(a) * 0.30 * k));
    ellipsoid(b, 0.22 * k, 0.10 * k, 0.16 * k, 5, 3, i % 2 ? LEAF : LEAF_L, MI.leaf);
    b.pop();
  }
}
// gilded bird cage on a stand
function birdcage(b, x, y, z, s) {
  const k = s || 1;
  bx(b, x - 0.30 * k, x + 0.30 * k, y, y + 0.10 * k, z - 0.30 * k, z + 0.30 * k, GOLD, MI.gold);
  b.push(mat4(x, y + 0.10 * k, z));
  lathe(b, [[0.12 * k, 0], [0.30 * k, 0.22 * k], [0.34 * k, 0.80 * k], [0.24 * k, 1.10 * k], [0.06 * k, 1.24 * k]], 8, GOLD, MI.gold, { smooth: false });
  b.pop();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    bar3(b, [x + Math.cos(a) * 0.33 * k, y + 0.30 * k, z + Math.sin(a) * 0.33 * k],
      [x + Math.cos(a) * 0.26 * k, y + 1.10 * k, z + Math.sin(a) * 0.26 * k], 0.03, 0.03, GOLD_HI, MI.goldHi);
  }
  b.push(mat4(x, y + 1.24 * k, z));
  ellipsoid(b, 0.10 * k, 0.16 * k, 0.10 * k, 6, 3, GOLD_HI, MI.goldHi);
  b.pop();
}
// reading ladder leaning on a book wall
function ladder(b, x, y, z, h, lean) {
  const dz = lean || 0.6;
  for (const s of [-1, 1]) bar3(b, [x + s * 0.32, y, z + dz], [x + s * 0.32, y + h, z], 0.07, 0.07, WOOD, MI.wood);
  for (let i = 1; i < 8; i++) {
    const t = i / 8;
    bx(b, x - 0.34, x + 0.34, y + h * t - 0.03, y + h * t + 0.03, z + dz * (1 - t) - 0.03, z + dz * (1 - t) + 0.03, WOOD_D, MI.woodD);
  }
}
// writing desk with a green banker's lamp
function desk(b, x, y, z, w, d) {
  const hw = w / 2, hd = d / 2;
  bx(b, x - hw, x + hw, y + 0.74, y + 0.84, z - hd, z + hd, WOOD, MI.wood, { topCol: mulc(WOOD, 1.12) });
  bx(b, x - hw + 0.08, x + hw - 0.08, y + 0.70, y + 0.74, z - hd + 0.08, z + hd - 0.08, GOLD, MI.goldD);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    bx(b, x + sx * (hw - 0.10) - 0.06, x + sx * (hw - 0.10) + 0.06, y, y + 0.74, z + sz * (hd - 0.10) - 0.06, z + sz * (hd - 0.10) + 0.06, WOOD_D, MI.woodD);
  }
  bx(b, x - hw + 0.2, x + hw - 0.2, y + 0.30, y + 0.66, z + hd - 0.18, z + hd - 0.06, WOOD_D, MI.woodD);
  for (const sx of [-1, 1]) bx(b, x + sx * 0.16 - 0.06, x + sx * 0.16 + 0.06, y + 0.44, y + 0.50, z + hd - 0.24, z + hd - 0.02, GOLD, MI.gold);
  bx(b, x + hw * 0.42 - 0.16, x + hw * 0.42 + 0.16, y + 0.84, y + 0.90, z + 0.1, z + 0.34, GOLD, MI.gold);
  bar3(b, [x + hw * 0.42, y + 0.90, z + 0.22], [x + hw * 0.42, y + 1.16, z + 0.16], 0.035, 0.035, GOLD, MI.gold);
  b.push(mat4(x + hw * 0.42, y + 1.20, z + 0.05));
  cylinder(b, 8, 0.24, 0.16, 0.12, mulc(LEAF_D, 0.9), MI.mirror, { y0: 0 });
  b.pop();
  bx(b, x - 0.5, x - 0.1, y + 0.845, y + 0.855, z - 0.3, z + 0.05, mulc(C.cloudLit, 0.94), MI.cloth);
  bx(b, x + 0.05, x + 0.42, y + 0.84, y + 0.90, z - 0.34, z - 0.02, RED, MI.book);
}
// upholstered chair
function chair(b, x, y, z, yaw) {
  at(b, x, y, z, yaw || 0, () => {
    bx(b, -0.30, 0.30, 0.42, 0.52, -0.30, 0.30, VELVET, MI.velvet, { topCol: mulc(VELVET, 1.1) });
    bx(b, -0.32, 0.32, 0.52, 0.58, -0.32, 0.32, GOLD, MI.goldD);
    bx(b, -0.30, 0.30, 0.52, 1.16, 0.22, 0.34, VELVET, MI.velvet);
    bx(b, -0.34, 0.34, 1.16, 1.24, 0.20, 0.36, GOLD, MI.gold);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      bx(b, sx * 0.24 - 0.04, sx * 0.24 + 0.04, 0, 0.42, sz * 0.24 - 0.04, sz * 0.24 + 0.04, WOOD_D, MI.woodD);
    }
  });
}

// ============================================================== WALL KIT (2)
// direction-aware mouldings: dir=-1 faces -Z (the wall face is at z, the relief
// stands proud toward -Z), dir=+1 faces +Z.
function dadoZ(b, x0, x1, y0, h, z, dir, col, colHi) {
  const d = dir || -1;
  const za = d < 0 ? z - 0.32 : z, zb = d < 0 ? z : z + 0.32;
  bx(b, x0, x1, y0, y0 + h, za, zb, col || MARB_SH, MI.marbSh, { topCol: colHi || MARB });
  const ga = d < 0 ? z - 0.38 : z, gb = d < 0 ? z : z + 0.38;
  bx(b, x0, x1, y0 + h, y0 + h + 0.10, Math.min(ga, gb), Math.max(ga, gb), GOLD, MI.gold);
  bx(b, x0, x1, y0 + h + 0.10, y0 + h + 0.18, za, zb, colHi || MARB, MI.marb, { topCol: MARB_HI });
}
function pilasterZ(b, x, y0, y1, z, w, dep, dir, col, mat) {
  const d = dir || -1;
  const za = d < 0 ? z - dep : z, zb = d < 0 ? z : z + dep;
  bx(b, x - w / 2, x + w / 2, y0, y1, za, zb, col || MARB, mat || MI.marb, { topCol: MARB_HI });
  const p = d < 0 ? -1 : 1;
  bx(b, x - w * 0.64, x + w * 0.64, y0, y0 + 0.44, Math.min(za - p * 0.10, zb), Math.max(za - p * 0.10, zb), MARB_HI, MI.marbHi, { topCol: MARB });
  bx(b, x - w * 0.66, x + w * 0.66, y1 - 0.58, y1, Math.min(za - p * 0.12, zb), Math.max(za - p * 0.12, zb), GOLD, MI.gold);
  bx(b, x - w * 0.66, x + w * 0.66, y1, y1 + 0.20, Math.min(za - p * 0.05, zb), Math.max(za - p * 0.05, zb), MARB_HI, MI.marbHi);
  bx(b, x - w * 0.22, x + w * 0.22, y0 + 0.44, y1 - 0.58, Math.min(za - p * 0.03, zb), Math.max(za - p * 0.03, zb), GOLD, MI.goldD);
}
// a raised moulding panel on a Z wall
function panelZ(b, x0, x1, y0, y1, z, dir, colIn, colFrame) {
  const d = dir || -1;
  const zIn = z + d * 0.03, zFr = z + d * 0.09;
  const t = 0.15;
  b.quad([x0, y0, zIn], [x1, y0, zIn], [x1, y1, zIn], [x0, y1, zIn], colIn || mulc(WALL, 0.93),
    MI.wall, [0, 0, d]);
  // frame bars stand 6 cm prouder
  const zA = Math.min(zFr, zIn), zB = Math.max(zFr, zIn);
  bx(b, x0, x1, y0, y0 + t, zA, zB, colFrame || MARB_HI, MI.marbHi);
  bx(b, x0, x1, y1 - t, y1, zA, zB, colFrame || MARB_HI, MI.marbHi);
  bx(b, x0, x0 + t, y0 + t, y1 - t, zA, zB, colFrame || MARB_HI, MI.marbHi);
  bx(b, x1 - t, x1, y0 + t, y1 - t, zA, zB, colFrame || MARB_HI, MI.marbHi);
  // gold bead inside the frame
  const zg = z + d * 0.10;
  bx(b, x0 + 0.22, x1 - 0.22, y0 + 0.22, y0 + 0.26, Math.min(zg, zIn), Math.max(zg, zIn), GOLD, MI.gold);
  bx(b, x0 + 0.22, x1 - 0.22, y1 - 0.26, y1 - 0.22, Math.min(zg, zIn), Math.max(zg, zIn), GOLD, MI.gold);
}
// cornice band where a Z wall meets the ceiling
function corniceZ(b, x0, x1, y, z, dir, col) {
  const d = dir || -1;
  const s = d < 0 ? -1 : 1;
  bx(b, x0, x1, y - 0.42, y - 0.22, Math.min(z, z + s * 0.10), Math.max(z, z + s * 0.10), GOLD, MI.gold);
  bx(b, x0, x1, y - 0.22, y, Math.min(z, z + s * 0.34), Math.max(z, z + s * 0.34), col || MARB_HI, MI.marbHi, { topCol: MARB });
  bx(b, x0, x1, y - 0.62, y - 0.42, Math.min(z, z + s * 0.20), Math.max(z, z + s * 0.20), MARB, MI.marb);
}
// gold-framed portrait with a painted picture (dir as above)
function portraitZ(b, cx, y0, y1, w, z, dir, seed) {
  const d = dir || -1;
  const sd = seed || 0;
  const hw = w / 2;
  const zf = z + d * 0.24;                 // frame face
  // gilded frame, three stepped members
  bx(b, cx - hw - 0.20, cx + hw + 0.20, y1, y1 + 0.24, Math.min(z, zf), Math.max(z, zf), GOLD_HI, MI.goldHi);
  bx(b, cx - hw - 0.20, cx + hw + 0.20, y0 - 0.24, y0, Math.min(z, zf), Math.max(z, zf), GOLD_HI, MI.goldHi);
  bx(b, cx - hw - 0.20, cx - hw, y0, y1, Math.min(z, zf), Math.max(z, zf), GOLD_HI, MI.goldHi);
  bx(b, cx + hw, cx + hw + 0.20, y0, y1, Math.min(z, zf), Math.max(z, zf), GOLD_HI, MI.goldHi);
  bx(b, cx - hw - 0.26, cx + hw + 0.26, y1 + 0.24, y1 + 0.34, Math.min(z, zf - d * 0.08), Math.max(z, zf - d * 0.08), GOLD, MI.gold);
  // the picture, built from 3 tone bands (sky / distance / foreground)
  const zc = z + d * 0.19;
  const h = y1 - y0, N = [0, 0, d];
  b.quad([cx - hw, y0, zc], [cx + hw, y0, zc], [cx + hw, y1, zc], [cx - hw, y1, zc],
    mulc(mixc(C.skyMid, C.horizon, 0.42), 0.82), MI.paint, N);
  b.quad([cx - hw, y0 + h * 0.50, zc - d * 0.004], [cx + hw, y0 + h * 0.50, zc - d * 0.004],
    [cx + hw, y1, zc - d * 0.004], [cx - hw, y1, zc - d * 0.004],
    mulc(mixc(C.zenith, C.skyMid, 0.45), 0.78), MI.paint, N);
  b.quad([cx - hw, y0 + h * 0.36, zc - d * 0.008], [cx + hw, y0 + h * 0.36, zc - d * 0.008],
    [cx + hw, y0 + h * 0.52, zc - d * 0.008], [cx - hw, y0 + h * 0.52, zc - d * 0.008],
    mulc(mixc(C.cloudShade, C.haze, 0.30), 0.86), MI.paint, N);
  b.quad([cx - hw, y0 + h * 0.10, zc - d * 0.012], [cx + hw, y0 + h * 0.10, zc - d * 0.012],
    [cx + hw, y0 + h * 0.40, zc - d * 0.012], [cx - hw, y0 + h * 0.40, zc - d * 0.012],
    mulc(mixc(C.slateDark, C.stoneCool, 0.35), 0.66), MI.paint, N);
  b.quad([cx - hw, y0, zc - d * 0.016], [cx + hw, y0, zc - d * 0.016],
    [cx + hw, y0 + h * 0.13, zc - d * 0.016], [cx - hw, y0 + h * 0.13, zc - d * 0.016],
    mulc(mixc(C.leafDark, C.slateDark, 0.42), 0.58), MI.paint, N);
  // sun / moon + two cypress silhouettes
  b.push(mat4(cx + hw * (sd % 2 ? 0.36 : -0.30), y0 + h * 0.76, zc - d * 0.022));
  ellipsoid(b, hw * 0.15, hw * 0.15, 0.03, 6, 3, GOLD_HI, MI.goldHi);
  b.pop();
  for (let i = 0; i < 2; i++) {
    b.push(mat4(cx + hw * (i ? 0.46 : -0.54), y0 + h * 0.17, zc - d * 0.022));
    ellipsoid(b, hw * 0.15, h * 0.11, 0.03, 6, 3, mulc(mixc(C.leaf, C.leafDark, 0.55), 0.78), MI.leaf);
    b.pop();
    b.push(mat4(cx + hw * (i ? 0.46 : -0.54), y0 + h * 0.10, zc - d * 0.022));
    ellipsoid(b, hw * 0.04, h * 0.07, 0.02, 4, 3, mulc(C.leafDark, 0.7), MI.leaf);
    b.pop();
  }
  // a thin gold horizon line between the hills and the foreground
  b.push(mat4(0, 0, 0));
  b.quad([cx - hw, y0 + h * 0.395, zc - d * 0.020], [cx + hw, y0 + h * 0.395, zc - d * 0.020],
    [cx + hw, y0 + h * 0.405, zc - d * 0.020], [cx - hw, y0 + h * 0.405, zc - d * 0.020],
    mulc(GOLD, 0.72), MI.goldD, N);
  b.pop();
  // a curl of gold cloud across the sky
  for (let i = 0; i < 3; i++) {
    b.push(mat4(cx + hw * (-0.3 + i * 0.26), y0 + h * (0.62 + 0.05 * i), zc - d * 0.019));
    ellipsoid(b, hw * 0.13, h * 0.022, 0.02, 6, 3, mulc(mixc(C.cloudLit, C.sunGlow, 0.4), 0.94), MI.paint);
    b.pop();
  }
  // a small gilt cartouche on the frame's top rail
  b.push(mat4(cx, y1 + 0.16, z + d * 0.10));
  ellipsoid(b, 0.26, 0.16, 0.06, 6, 3, GOLD_HI, MI.goldHi);
  b.pop();
}
// full-height pier mirror (dir aware)
function pierMirrorZ(b, cx, w, y0, y1, z, dir) {
  const d = dir || -1;
  const hw = w / 2, spring = y1 - hw;
  const N = [0, 0, d];
  ringZ(b, cx, spring, hw, hw + 0.22, z + d * 0.14, 0, Math.PI, 14, GOLD_HI, MI.goldHi, d < 0);
  bx(b, cx - hw - 0.22, cx - hw, y0, spring, Math.min(z, z + d * 0.14), Math.max(z, z + d * 0.14), GOLD_HI, MI.goldHi);
  bx(b, cx + hw, cx + hw + 0.22, y0, spring, Math.min(z, z + d * 0.14), Math.max(z, z + d * 0.14), GOLD_HI, MI.goldHi);
  bx(b, cx - hw - 0.22, cx + hw + 0.22, y0 - 0.24, y0, Math.min(z, z + d * 0.14), Math.max(z, z + d * 0.14), GOLD_HI, MI.goldHi);
  const zp = z + d * 0.08;
  // reflected sky, three bands: deep blue at the bottom, pale at the top
  const mB = [[y0, y0 + (spring - y0) * 0.34, mulc(mixc(C.slateDark, C.skyMid, 0.35), 0.58)],
    [y0 + (spring - y0) * 0.34, y0 + (spring - y0) * 0.68, mulc(mixc(C.skyMid, C.horizon, 0.40), 0.66)],
    [y0 + (spring - y0) * 0.68, spring, mulc(mixc(C.horizon, C.cloudLit, 0.55), 0.80)]];
  for (const [ya, yb, cc] of mB) {
    b.quad([cx - hw, ya, zp], [cx + hw, ya, zp], [cx + hw, yb, zp], [cx - hw, yb, zp], cc, MI.mirror, N);
  }
  for (let i = 0; i < 10; i++) {
    const t0 = Math.PI * (i / 10), t1 = Math.PI * ((i + 1) / 10);
    b.tri([cx, spring, zp], [cx + Math.cos(t0) * hw, spring + Math.sin(t0) * hw, zp],
      [cx + Math.cos(t1) * hw, spring + Math.sin(t1) * hw, zp], mixc(C.skyMid, C.horizon, 0.45), MI.mirror, N, N, N);
  }
  const zq = z + d * 0.075;
  b.quad([cx - hw, spring + hw * 0.30, zq], [cx + hw, spring + hw * 0.30, zq],
    [cx + hw, spring + hw * 0.66, zq], [cx - hw, spring + hw * 0.66, zq], mixc(C.horizon, C.cloudLit, 0.60), MI.mirror, N);
  // gilt candle brackets on either side of the mirror
  for (const s of [-1, 1]) {
    const bx0 = cx + s * (hw + 0.42);
    bx(b, bx0 - 0.08, bx0 + 0.08, y0 + 3.2, y0 + 3.46, Math.min(z, z + d * 0.62), Math.max(z, z + d * 0.62), GOLD, MI.gold);
    b.push(mat4(bx0, y0 + 3.62, z + d * 0.5));
    cylinder(b, 5, 0.05, 0.04, 0.28, mixc(C.cloudLit, C.sunGlow, 0.45), MI.cloth, { y0: 0 });
    b.pop();
    b.push(mat4(bx0, y0 + 3.96, z + d * 0.5));
    ellipsoid(b, 0.07, 0.11, 0.07, 5, 3, mixc(C.sunGlow, C.cloudLit, 0.3), MI.glowW);
    b.pop();
  }
}

// marble-topped console table against a Z wall (dir aware)
function consoleX(b, x0, x1, y, z, dir) {
  const d = dir || -1;
  const za = d < 0 ? z - 0.58 : z, zc = d < 0 ? z - 0.50 : z + 0.08;
  bx(b, x0, x1, y + 0.86, y + 0.98, Math.min(za, zc), Math.max(za, zc), MARB_HI, MI.marbHi, { topCol: MARB });
  for (const s of [-1, 1]) {
    const xa = s > 0 ? x1 - 0.20 : x0, xb = s > 0 ? x1 : x0 + 0.20;
    bx(b, xa, xb, y + 0.16, y + 0.86, Math.min(za + 0.06 * -d, zc - 0.08 * -d), Math.max(za + 0.06 * -d, zc - 0.08 * -d), GOLD, MI.gold);
    bx(b, xa, xb, y, y + 0.16, Math.min(za + 0.02, zc - 0.04), Math.max(za + 0.02, zc - 0.04), MARB_SH, MI.marb);
  }
  bx(b, x0 + 0.22, x1 - 0.22, y + 0.98, y + 1.03, Math.min(za, zc), Math.max(za, zc), GOLD, MI.goldD);
}

// ============================================================== GALLERY
function galleryDecor(b, ctx, R) {
  const XL = GAL.x0, XR = GAL.x1, zN = GAL.z0, zS = GAL.z1;
  // ---- floor: long runner on the axis + spurs from the three doorways ----
  qYp(b, FY + 0.012, -35.6, 35.6, 128.55, 131.35, RED, MI.carpet);
  for (const s of [-1, 1]) qYp(b, FY + 0.016, s * 35.6 - 0.18, s * 35.6 + 0.18, 128.55, 131.35, GOLD, MI.gold);
  for (const [cx, hw] of [[0, 3.4], [-20.5, 1.75], [20.5, 1.75]]) {
    qYp(b, FY + 0.012, cx - hw, cx + hw, zN + 0.02, 128.55, RED, MI.carpet);
    for (const s of [-1, 1]) qYp(b, FY + 0.016, cx + s * hw - 0.16, cx + s * hw + 0.16, zN + 0.02, 128.55, GOLD, MI.gold);
  }
  // central medallion under the crossing
  for (const [r0, r1, cc, mm] of [[5.4, 6.2, GOLD, MI.gold], [4.7, 5.4, mulc(FLOOR_A, 0.90), MI.marb], [4.2, 4.7, FLOOR_G, MI.marb], [3.5, 4.2, mulc(FLOOR_B, 0.86), MI.marb]]) {
    for (let i = 0; i < 44; i++) {
      const a0 = (i / 44) * TAU, a1 = ((i + 1) / 44) * TAU;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      b.quad([c0 * r0, FY + 0.020, GAL.cz + s0 * r0], [c1 * r0, FY + 0.020, GAL.cz + s1 * r0],
        [c1 * r1, FY + 0.020, GAL.cz + s1 * r1], [c0 * r1, FY + 0.020, GAL.cz + s0 * r1], cc, mm, UP);
    }
  }
  for (let i = 0; i < 16; i++) {                    // sun rays
    const a = (i / 16) * TAU, w = 0.14;
    const c = Math.cos(a), sn = Math.sin(a);
    b.quad([GAL.cz * 0 + c * 3.3 - sn * w, FY + 0.024, GAL.cz + sn * 3.3 + c * w],
      [c * 3.3 + sn * w, FY + 0.024, GAL.cz + sn * 3.3 - c * w],
      [c * 5.0 + sn * w * 0.35, FY + 0.024, GAL.cz + sn * 5.0 - c * w * 0.35],
      [c * 5.0 - sn * w * 0.35, FY + 0.024, GAL.cz + sn * 5.0 + c * w * 0.35], GOLD, MI.gold, UP);
  }
  // ---- NORTH WALL (faces +Z): dado, panels, pier mirrors, portraits, archivolt ----
  const dirN = 1;
  const fields = [[XL, -22.5], [-18.5, -7.2], [7.2, 18.5], [22.5, XR]];
  for (const [a, c] of fields) dadoZ(b, a, c, FY, 1.25, zN, dirN, MARB_SH, MARB);
  for (const [a, c] of fields) {
    // pilaster at both ends of the field + two framed panels between them
    const w = c - a;
    const np = Math.max(1, Math.round(w / 4.6));
    for (let i = 0; i <= np; i++) {
      const x = a + (w * i) / np;
      if (x <= a + 0.5 || x >= c - 0.5) continue;
      // keep the pier mirrors clear (they hang exactly where a mid-field pilaster would land)
      if (Math.abs(Math.abs(x) - 12.85) < 2.5) continue;
      pilasterZ(b, x, FY + 1.35, 11.6, zN, 0.62, 0.30, dirN, MARB, MI.marb);
    }
    for (let i = 0; i < np; i++) {
      const xa = a + (w * i) / np + 0.55, xb = a + (w * (i + 1)) / np - 0.55;
      if (xb - xa < 1.2) continue;
      panelZ(b, xa, xb, 2.75, 5.9, zN, dirN, mulc(WALL, 1.05));
      panelZ(b, xa, xb, 6.35, 9.5, zN, dirN, mulc(WALL, 1.05));
    }
  }
  // archivolt on the gallery side of the three doorways
  for (const o of [
    { cx: 0, hx: D.grand.hx, spring: D.grand.spring },
    { cx: -20.5, hx: D.side.hx, spring: D.side.spring },
    { cx: 20.5, hx: D.side.hx, spring: D.side.spring },
  ]) {
    ringZ(b, o.cx, o.spring, o.hx - 0.12, o.hx + 0.44, zN + 0.10, 0, Math.PI, 22, MARB_HI, MI.marbHi, false);
    ringZ(b, o.cx, o.spring, o.hx + 0.44, o.hx + 0.62, zN + 0.16, 0, Math.PI, 22, GOLD, MI.gold, false);
    for (const s of [-1, 1]) {
      bx(b, o.cx + s * o.hx, o.cx + s * (o.hx + 0.44), FY, o.spring, zN, zN + 0.30, MARB_HI, MI.marbHi);
      bx(b, o.cx + s * (o.hx + 0.44), o.cx + s * (o.hx + 0.62), FY, o.spring, zN, zN + 0.36, GOLD, MI.gold);
    }
    bx(b, o.cx - 0.56, o.cx + 0.56, o.spring + o.hx - 0.10, o.spring + o.hx + 0.62, zN, zN + 0.34, GOLD_HI, MI.goldHi);
    b.push(mat4(o.cx, o.spring + o.hx + 0.26, zN + 0.42));
    ellipsoid(b, 0.42, 0.30, 0.12, 8, 4, GOLD_HI, MI.goldHi);
    b.pop();
  }
  // pier mirrors between the grand arch and the side doors
  for (const s of [-1, 1]) pierMirrorZ(b, s * 12.85, 3.6, 2.0, 10.2, zN, dirN);
  // portraits on the outer fields (between the side doors and the corners)
  for (const s of [-1, 1]) {
    for (const cx of [26.6, 34.0]) {
      portraitZ(b, s * cx, 3.4, 9.2, 4.2, zN, dirN, Math.round(cx));
      if (ctx.lanterns) ctx.lanterns.push({ p: [s * (cx + 3.7), 6.2, zN + 1.0], size: 1.4, rot: 0, alpha: 0.42, shape: 1, col: mixc(C.sunGlow, GOLD_HI, 0.5) });
    }
  }
  // console tables + urns under the mirrors
  for (const s of [-1, 1]) {
    consoleX(b, s * 12.85 - 2.2, s * 12.85 + 2.2, FY, zN + 0.30, dirN);
    flowerUrn(b, s * 12.85, FY + 0.98, zN + 0.62, 1.05, s > 0 ? 1 : 3);
  }
  // benches against the north wall
  for (const s of [-1, 1]) for (const cx of [28.0, 36.0]) bench(b, s * cx, FY + 0.42, zN + 0.75, 3.0);
  // ---- SOUTH WALL (faces -Z): arcade archivolts, pilasters, over-arch paintings ----
  const dirS = -1;
  for (const [a, c] of [[XL, ...ARCS_W[0]], [-31.25, -29.85], [-21.7, -20.3], [-12.15, -6.0], [6.0, 11.15 + 1.0], [20.3, 21.7], [29.85, 31.25], [39.4, XR]]) {
    if (c - a < 0.3) continue;
    dadoZ(b, a, c, FY, 1.25, zS, dirS, MARB_SH, MARB);
  }
  for (const o of ARC_OPENS) {
    ringZ(b, o.cx, o.spring, o.hx - 0.14, o.hx + 0.40, zS - 0.10, 0, Math.PI, 22, MARB_HI, MI.marbHi, true);
    ringZ(b, o.cx, o.spring, o.hx + 0.40, o.hx + 0.58, zS - 0.16, 0, Math.PI, 22, GOLD, MI.gold, true);
    for (const s of [-1, 1]) {
      bx(b, o.cx + s * o.hx, o.cx + s * (o.hx + 0.40), FY, o.spring, zS - 0.30, zS, MARB_HI, MI.marbHi);
      bx(b, o.cx + s * (o.hx + 0.40), o.cx + s * (o.hx + 0.58), FY, o.spring, zS - 0.36, zS, GOLD, MI.gold);
    }
    bx(b, o.cx - 0.50, o.cx + 0.50, o.spring + o.hx - 0.08, o.spring + o.hx + 0.54, zS - 0.34, zS, GOLD_HI, MI.goldHi);
    // over-arch panel with a small painting
    const w = o.hx * 1.1;
    portraitZ(b, o.cx, 11.1, 12.4, Math.min(2.6, w), zS, dirS, Math.round(o.cx));
  }
  // pilasters on the piers
  for (const [a, c] of [[-31.25, -29.85], [-21.7, -20.3], [-12.15, -11.15], [11.15, 12.15], [20.3, 21.7], [29.85, 31.25]]) {
    pilasterZ(b, (a + c) / 2, FY + 1.35, 11.6, zS, 0.72, 0.30, dirS, MARB, MI.marb);
  }
  // ---- END WALLS: mirrors, consoles, statues, candelabra ----
  for (const s of [-1, 1]) {
    const x = s * XR;
    at(b, x, 0, GAL.cz, s > 0 ? -Math.PI / 2 : Math.PI / 2, () => {
      const n = s > 0 ? -1 : 1;
      pierMirrorZ(b, 0, 4.2, 2.0, 10.4, 0, -1);
      void n;
    });
    pedestal(b, x - s * 0.85, FY, GAL.cz - 4.2, 1.4, 0.95, 1.4, MARB);
    figure(b, x - s * 0.85, FY + 0.95, GAL.cz - 4.2, 1.35, s > 0 ? -Math.PI / 2 : Math.PI / 2, MARB_HI, MI.marb);
    pedestal(b, x - s * 0.85, FY, GAL.cz + 4.2, 1.4, 0.95, 1.4, MARB);
    figure(b, x - s * 0.85, FY + 0.95, GAL.cz + 4.2, 1.35, s > 0 ? -Math.PI / 2 : Math.PI / 2, MARB_HI, MI.marb);
    candelabrum(b, x - s * 1.2, FY, GAL.cz, 1.4);
    flowerUrn(b, x - s * 1.4, FY, GAL.cz - 2.3, 1.0, 2);
    flowerUrn(b, x - s * 1.4, FY, GAL.cz + 2.3, 1.0, 4);
  }
  // ---- ceiling: gold coffers + cornice ----
  coffersY(b, XL, XR, zN, zS, GAL.ceil, 10, 4, mulc(WALL_HI, 0.90), GOLD, GOLD_HI, MI.wallHi, MI.gold);
  bx(b, XL, XR, GAL.ceil - 0.10, GAL.ceil, zN + 0.30, zN + 0.60, GOLD, MI.gold);
  bx(b, XL, XR, GAL.ceil - 0.10, GAL.ceil, zS - 0.60, zS - 0.30, GOLD, MI.gold);
  corniceZ(b, XL, XR, GAL.ceil, zN, +1, MARB_HI);
  corniceZ(b, XL, XR, GAL.ceil, zS, -1, MARB_HI);
  // ---- chandeliers ----
  for (const cx of [-31, -11, 11, 31]) {
    chandelier(b, cx, 8.5, GAL.cz, 1.15, GAL.ceil);
    if (ctx.lanterns) ctx.lanterns.push({ p: [cx, 8.7, GAL.cz], size: 2.6, rot: 0, alpha: 0.40, shape: 1, col: mixc(C.sunGlow, GOLD_HI, 0.5) });
  }
  void R;
}

// build in a frame flush with an X wall (face at world x).  dir=+1: the room is at
// x > face (the wall faces +X); dir=-1: the room is at x < face.
function wallFrameX(b, x, zc, dir, fn) {
  at(b, x, 0, zc, dir > 0 ? -Math.PI / 2 : Math.PI / 2, fn);
}
// roman mosaic medallion on the floor
function medallion(b, cx, cz, y, r, R) {
  const rings = [[r, r * 0.92, GOLD, MI.gold], [r * 0.92, r * 0.82, mulc(FLOOR_B, 0.88), MI.marb],
    [r * 0.82, r * 0.72, FLOOR_G, MI.marb], [r * 0.60, r * 0.50, mulc(FLOOR_A, 0.92), MI.marb]];
  for (const [r0, r1, cc, mm] of rings) {
    for (let i = 0; i < 40; i++) {
      const a0 = (i / 40) * TAU, a1 = ((i + 1) / 40) * TAU;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      b.quad([cx + c0 * r0, y, cz + s0 * r0], [cx + c1 * r0, y, cz + s1 * r0],
        [cx + c1 * r1, y, cz + s1 * r1], [cx + c0 * r1, y, cz + s0 * r1], cc, mm, UP);
    }
  }
  for (let i = 0; i < 16; i++) {                    // star rays
    const a = (i / 16) * TAU + (R ? R() * 0.06 : 0), w = r * 0.026;
    const c = Math.cos(a), sn = Math.sin(a);
    b.quad([cx + c * r * 0.66 - sn * w, y + 0.004, cz + sn * r * 0.66 + c * w],
      [cx + c * r * 0.66 + sn * w, y + 0.004, cz + sn * r * 0.66 - c * w],
      [cx + c * r * 0.96 + sn * w * 0.4, y + 0.004, cz + sn * r * 0.96 - c * w * 0.4],
      [cx + c * r * 0.96 - sn * w * 0.4, y + 0.004, cz + sn * r * 0.96 + c * w * 0.4], GOLD_HI, MI.goldHi, UP);
  }
  // central rosette
  b.push(mat4(cx, y + 0.006, cz));
  ellipsoid(b, r * 0.16, 0.04, r * 0.16, 8, 3, GOLD, MI.gold);
  b.pop();
}
// tiered marble fountain; basin top at y
function fountain(b, cx, y, cz, r, s, ctx) {
  const k = s || 1;
  const seg = 20;
  for (const [r0, r1, y0, y1, cc] of [
    [r * 1.20, r * 1.05, y - 0.05, y + 0.26, MARB_SH], [r * 1.02, r * 0.98, y + 0.26, y + 0.44, MARB],
  ]) {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      b.quad([cx + c0 * r0, y1, cz + s0 * r0], [cx + c1 * r0, y1, cz + s1 * r0],
        [cx + c1 * r1, y1, cz + s1 * r1], [cx + c0 * r1, y1, cz + s0 * r1], cc, MI.marb, UP);
      b.quad([cx + c0 * r0, y0, cz + s0 * r0], [cx + c1 * r0, y0, cz + s1 * r0],
        [cx + c1 * r0, y1, cz + s1 * r0], [cx + c0 * r0, y1, cz + s0 * r0], cc, MI.marb,
        [c0, 0, s0]);
    }
  }
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    b.tri([cx, y + 0.36, cz], [cx + c0 * r * 0.94, y + 0.36, cz + s0 * r * 0.94],
      [cx + c1 * r * 0.94, y + 0.36, cz + s1 * r * 0.94], mulc(mixc(C.waterDeep, C.water, 0.6), 0.86), MI.water, UP, UP, UP);
  }
  // pedestal + upper basin + finial
  at(b, cx, 0, cz, 0, () => {
    lathe(b, [[r * 0.34, y], [r * 0.26, y + 0.2], [r * 0.16, y + 0.5], [r * 0.30, y + 0.9], [r * 0.26, y + 1.0]], 10, MARB, MI.marb);
    for (let i = 0; i < 12; i++) {
      const a0 = (i / 12) * TAU, a1 = ((i + 1) / 12) * TAU;
      b.quad([Math.cos(a0) * r * 0.72, y + 1.16, Math.sin(a0) * r * 0.72], [Math.cos(a1) * r * 0.72, y + 1.16, Math.sin(a1) * r * 0.72],
        [Math.cos(a1) * r * 0.40, y + 1.02, Math.sin(a1) * r * 0.40], [Math.cos(a0) * r * 0.40, y + 1.02, Math.sin(a0) * r * 0.40],
        MARB_HI, MI.marbHi, [0, -0.6, 0]);
      b.quad([Math.cos(a0) * r * 0.76, y + 1.20, Math.sin(a0) * r * 0.76], [Math.cos(a1) * r * 0.76, y + 1.20, Math.sin(a1) * r * 0.76],
        [Math.cos(a1) * r * 0.60, y + 1.13, Math.sin(a1) * r * 0.60], [Math.cos(a0) * r * 0.60, y + 1.13, Math.sin(a0) * r * 0.60],
        GOLD, MI.gold, UP);
    }
    for (let i = 0; i < 12; i++) {
      const a0 = (i / 12) * TAU, a1 = ((i + 1) / 12) * TAU;
      b.tri([0, y + 1.14, 0], [Math.cos(a0) * r * 0.66, y + 1.14, Math.sin(a0) * r * 0.66],
        [Math.cos(a1) * r * 0.66, y + 1.14, Math.sin(a1) * r * 0.66], mulc(mixc(C.waterDeep, C.water, 0.6), 0.9), MI.water, UP, UP, UP);
    }
    // second basin + a third small one, then a gilt finial
    for (let i = 0; i < 12; i++) {
      const a0 = (i / 12) * TAU, a1 = ((i + 1) / 12) * TAU;
      b.quad([Math.cos(a0) * r * 0.52, y + 1.86, Math.sin(a0) * r * 0.52], [Math.cos(a1) * r * 0.52, y + 1.86, Math.sin(a1) * r * 0.52],
        [Math.cos(a1) * r * 0.30, y + 1.74, Math.sin(a1) * r * 0.30], [Math.cos(a0) * r * 0.30, y + 1.74, Math.sin(a0) * r * 0.30],
        MARB_HI, MI.marbHi, [0, -0.6, 0]);
      b.quad([Math.cos(a0) * r * 0.56, y + 1.90, Math.sin(a0) * r * 0.56], [Math.cos(a1) * r * 0.56, y + 1.90, Math.sin(a1) * r * 0.56],
        [Math.cos(a1) * r * 0.42, y + 1.83, Math.sin(a1) * r * 0.42], [Math.cos(a0) * r * 0.42, y + 1.83, Math.sin(a0) * r * 0.42],
        GOLD, MI.gold, UP);
    }
    lathe(b, [[r * 0.20, y + 1.90], [r * 0.14, y + 2.18], [r * 0.10, y + 2.55], [r * 0.055, y + 2.72]], 7, MARB_HI, MI.marb);
    b.push(mat4(0, y + 2.86, 0));
    ellipsoid(b, r * 0.11, r * 0.15, r * 0.11, 6, 4, GOLD_HI, MI.goldHi);
    b.pop();
    // water veils from the upper basin
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      b.quad([Math.cos(a) * r * 0.30, y + 1.80, Math.sin(a) * r * 0.30],
        [Math.cos(a + 0.22) * r * 0.30, y + 1.80, Math.sin(a + 0.22) * r * 0.30],
        [Math.cos(a + 0.22) * r * 0.46, y + 1.06, Math.sin(a + 0.22) * r * 0.46],
        [Math.cos(a) * r * 0.46, y + 1.06, Math.sin(a) * r * 0.46],
        mulc(mixc(C.waterDeep, C.water, 0.55), 0.9), MI.water, [Math.cos(a + 0.11), 0.3, Math.sin(a + 0.11)]);
    }
  });
  if (ctx && ctx.lanterns) ctx.lanterns.push({ p: [cx, y + 0.9, cz], size: 2.0 * k, rot: 0, alpha: 0.26, shape: 1, col: mixc(C.cloudLit, C.glass, 0.45) });
}
// ============================================================== COSMOS KIT (round 9 / 10)
// The salon's painted ceiling used to be a flat navy sky with white squares. It became a
// COLOURED COSMOS: the whole ceiling is a smooth multi-hue nebula field (one Gouraud grid,
// so no camera angle ever sees a single flat navy), with soft cloud banks, a dense field
// of small stars along a faint milky way, a dozen brilliant stars, gold constellations and
// two meteors, all inside a heavy gold frame with rosettes. Round 10 replaced the wide
// translucent galaxy band (it read as plastic film stuck to the ceiling) with the star-
// chart treatment borrowed from the observatory's dome.
// The blank west wall becomes the "Cabinet of Cosmic Curiosities": seven gilded niches on
// a symmetric rhythm, each exhibit grounded on a stepped plinth, under a vitrine whose
// posts / side panes / canopy are MI.glass-class; a framed star-chart gallery, a
// constellation frieze and a suspended planet carry the wall from FY up to the ceiling.
//
// Materials are [emissive, gloss] and the renderer is opaque, so a vitrine is built with
// an OPEN FRONT (posts + side panes + canopy): a closed glass pane would hide the exhibit
// instead of showing it. Every large surface stays at emissive <= 0.19.
const CX = {
  base: mulc(mixc(C.zenith, C.slateDark, 0.50), 0.66),        // deep indigo-violet
  violet: mulc(mixc(C.ballLilac, C.slateLight, 0.40), 0.78),
  rose: mulc(mixc(C.bloomPink, C.bloomRed, 0.34), 0.88),
  magenta: mulc(mixc(C.ballLilac, C.bloomPink, 0.58), 0.92),
  teal: mulc(mixc(C.glassDeep, C.leafLight, 0.42), 0.88),
  cyan: mulc(mixc(C.glass, C.horizon, 0.32), 0.96),
  gold: mulc(mixc(C.gold, C.bloomYellow, 0.38), 1.00),
  amber: mulc(mixc(C.koiGold, C.sunGlow, 0.36), 0.98),
  ice: mixc(C.cloudLit, C.glass, 0.42),
  white: C.cloudLit,
  wine: mulc(mixc(C.bloomRed, C.slateDark, 0.58), 0.62),      // deep wine velvet
  indigoV: mulc(mixc(C.slateDark, C.zenith, 0.34), 0.50),
  bone: mulc(mixc(C.marble, C.sunGlow, 0.26), 0.88),
};
const MX = {
  field: [0.080, 0.10], fieldHi: [0.106, 0.08],
  cloud: [0.100, 0.05], cloudHi: [0.132, 0.04], core: [0.186, 0.03],
  star: [0.540, 0.00], starHi: [0.780, 0.00],
  gold: [0.105, 0.88], goldHi: [0.150, 0.92], goldD: [0.072, 0.74],
  velvet: [0.042, 0.10], velvetHi: [0.060, 0.12],
  marble: [0.100, 0.22], marbleHi: [0.126, 0.28],
  crystal: [0.245, 0.80], crystalHi: [0.330, 0.88],
  glass: [0.300, 0.90], glass2: [0.105, 0.86], glow: [0.620, 0.00], glowHi: [1.000, 0.00],
  plaque: [0.030, 0.34], iron: [0.022, 0.56], moss: [0.055, 0.10],
};
// the ceiling field (inside the gold frame) and the cabinet wall layout
const COS_CEIL = { x0: SAL.x0 + 0.45, x1: SAL.x1 - 0.45, z0: SAL.z0 + 0.45, z1: SAL.z1 - 0.45, y: SAL.ceil - 0.02 };
const COS_DECK = FY + 1.28;                    // top of every display plinth
const CURIOS = [
  { u: 0.00, w: 3.10, d: 0.86, kind: 'nebula', hood: 2.36 },
  { u: -4.55, w: 2.20, d: 0.84, kind: 'meteor', hood: 1.92 },
  { u: 4.55, w: 2.20, d: 0.84, kind: 'comet', hood: 2.06 },
  { u: -8.45, w: 2.05, d: 0.84, kind: 'tooth', hood: 2.24 },
  { u: 8.45, w: 2.05, d: 0.84, kind: 'astrolabe', hood: 2.02 },
  { u: -12.10, w: 1.85, d: 0.82, kind: 'moon', hood: 1.78 },
  { u: 12.10, w: 1.85, d: 0.82, kind: 'terrarium', hood: 1.84 },
];
const CURIO_GLOW = { nebula: CX.magenta, meteor: CX.amber, comet: CX.ice, tooth: CX.ice, astrolabe: CX.gold, moon: CX.cyan, terrarium: CX.rose };

// a flat quad on an X wall: u runs along the wall, +w is into the room
function wq(b, u0, u1, y0, y1, w, col, mat) {
  b.quad([u0, y0, w], [u1, y0, w], [u1, y1, w], [u0, y1, w], col, mat, [0, 0, 1]);
}
// a thin painted line on an X wall (used by the star charts and the frieze)
function wlin(b, u0, y0, u1, y1, th, w, col, mat) {
  const du = u1 - u0, dy = y1 - y0, L = Math.hypot(du, dy) || 1;
  const nx = (-dy / L) * th * 0.5, ny = (du / L) * th * 0.5;
  b.quad([u0 - nx, y0 - ny, w], [u1 - nx, y1 - ny, w], [u1 + nx, y1 + ny, w], [u0 + nx, y0 + ny, w], col, mat, [0, 0, 1]);
}

// a flat diamond star (normal down), rotated so the star field never reads as squares
function qStar(b, y, cx, cz, ss, rot, col, mat) {
  const P = (a) => [cx + Math.cos(a) * ss, y, cz + Math.sin(a) * ss];
  b.quad(P(rot), P(rot + Math.PI / 2), P(rot + Math.PI), P(rot + Math.PI * 1.5), col, mat, DN);
}

// a soft round nebula painted on an X-wall plane (u, y), fading into the panel
function wblob(b, cu, cy, ru, rv, seg, colIn, colOut, w, rot) {
  const r0 = rot || 0, cr = Math.cos(r0), sr = Math.sin(r0);
  const P = (a, sc) => {
    const uu = Math.cos(a) * ru * sc, vv = Math.sin(a) * rv * sc;
    return [cu + uu * cr - vv * sr, cy + uu * sr + vv * cr, w];
  };
  for (let k = 0; k < seg; k++) {
    const a0 = (k / seg) * TAU, a1 = ((k + 1) / seg) * TAU;
    b.quadc(P(a1, 0.16), P(a0, 0.16), P(a0, 1.0), P(a1, 1.0), colIn, colIn, colOut, colOut, MX.cloud);
  }
}

// ---------------------------------------------------------------- the ceiling
// Round 10: the round-9 "coloured cosmos" read as a painted tent. The galaxy band was
// built from wide translucent ribbons (a 3.2 m wash, a 1.3 m inner lane, a hot 0.5 m
// centre line, a dark dust lane and two spiral arms) and its hard edges met the painted
// field like plastic film stuck to the ceiling. The rebuilt sky follows the observatory's
// star chart instead (glass-orbital.js skyChart): a deep indigo field, soft nebula
// patches built from many small fading discs + coloured dust, a dense field of small
// stars whose density swells along a barely visible milky way, a dozen brilliant stars
// with a soft halo and a four-ray cross flare, three gold constellations, two meteors.
// No wide flat bands.
const STAR_N = 880;                        // painted star points (the check's metric)
const CEIL_CLOUDS = [
  [0.20, 0.26, 3.6, 'rose'], [0.58, 0.15, 3.1, 'teal'], [0.40, 0.55, 3.4, 'violet'],
  [0.80, 0.40, 3.0, 'gold'], [0.09, 0.62, 2.8, 'magenta'], [0.66, 0.74, 3.1, 'cyan'],
  [0.30, 0.86, 2.7, 'amber'], [0.91, 0.78, 2.6, 'ice'], [0.52, 0.32, 2.4, 'magenta'],
  [0.62, 0.57, 2.5, 'ice'],
];
// the faint milky-way line and the brilliant stars, in ceiling (t, s) coordinates
const galS = (t) => 0.30 + 0.40 * t + 0.035 * Math.sin(t * 4.7);
// [t, s, palette key, size multiplier]; the figures below are index chains into this
const BRIGHT = [
  [0.07, 0.34, 'ice', 1.15], [0.16, 0.31, 'gold', 1.00], [0.26, 0.50, 'cyan', 1.05],
  [0.35, 0.45, 'white', 1.55], [0.44, 0.55, 'rose', 1.00], [0.55, 0.48, 'gold', 1.25],
  [0.64, 0.62, 'white', 1.05], [0.72, 0.53, 'cyan', 1.10], [0.81, 0.66, 'ice', 1.00],
  [0.90, 0.60, 'gold', 0.95], [0.50, 0.36, 'violet', 0.90], [0.22, 0.62, 'amber', 0.85],
  [0.70, 0.72, 'rose', 0.85], [0.40, 0.25, 'white', 0.95],
];
const CONSTELL = [[0, 1, 2, 3], [5, 6, 7, 8], [10, 4, 11]];
const M_LINE = [0.440, 0.00];              // gold constellation paint: bright, below bloom

// A soft round nebula patch: two Gouraud rings that fade exactly into the field colour
// underneath, so a cloud never shows a hard rim (the round-9 altitude blobs did).
function ceilPatch(b, yy, cx, cz, rad, col, F, seg, ph) {
  const cIn = mixc(F, col, 0.62), cMid = mixc(F, col, 0.34);
  const rmod = (a) => 1 + 0.18 * Math.sin(a * 3 + ph) + 0.11 * Math.sin(a * 5 - ph * 1.7) +
    0.05 * Math.sin(a * 9 + ph * 2.3);
  for (let k = 0; k < seg; k++) {
    const a0 = (k / seg) * TAU, a1 = ((k + 1) / seg) * TAU;
    const m0 = rmod(a0), m1 = rmod(a1);
    const Q = (a, m, rr) => [cx + Math.cos(a) * rad * rr * m, yy, cz + Math.sin(a) * rad * rr * m];
    b.quadc(Q(a1, m1, 0.48), Q(a0, m0, 0.48), Q(a0, m0, 1), Q(a1, m1, 1), cMid, cMid, F, F, MX.cloud);
    b.quadc(Q(a1, m1, 0.06), Q(a0, m0, 0.06), Q(a0, m0, 0.48), Q(a1, m1, 0.48),
      cIn, cIn, cMid, cMid, MX.cloudHi);
  }
}
// A soft radial halo under a brilliant star: bright tint at the centre, the field colour
// at the rim, so it reads as glow instead of a painted disc.
function ceilHalo(b, yy, cx, cz, rad, col, F, seg) {
  const c0 = mixc(F, col, 0.64), c1 = mixc(F, col, 0.38);
  for (let k = 0; k < seg; k++) {
    const a0 = (k / seg) * TAU, a1 = ((k + 1) / seg) * TAU;
    const Q = (a, rr) => [cx + Math.cos(a) * rad * rr, yy, cz + Math.sin(a) * rad * rr];
    b.quadc(Q(a1, 0.09), Q(a0, 0.09), Q(a0, 0.42), Q(a1, 0.42), c0, c0, c1, c1, MX.glow);
    b.quadc(Q(a1, 0.42), Q(a0, 0.42), Q(a0, 1), Q(a1, 1), c1, c1, F, F, MX.cloudHi);
  }
}
// A four-ray cross flare lying in the ceiling plane, fading into the field.
function ceilCross(b, yy, cx, cz, len, wid, col, F, rot) {
  for (let k = 0; k < 4; k++) {
    const a = rot + (k / 4) * TAU, dx = Math.cos(a), dz = Math.sin(a);
    const px = -dz, pz = dx;
    const bx0 = cx - dx * len * 0.12, bz0 = cz - dz * len * 0.12;
    b.quadc([cx + dx * len + px * wid * 0.05, yy, cz + dz * len + pz * wid * 0.05],
      [bx0 + px * wid, yy, bz0 + pz * wid],
      [bx0 - px * wid, yy, bz0 - pz * wid],
      [cx + dx * len - px * wid * 0.05, yy, cz + dz * len - pz * wid * 0.05],
      F, col, col, F, MX.star);
  }
}
// A thin painted constellation line, flat on the ceiling, normal down.
function ceilLine(b, yy, p0, p1, w, col, mat) {
  const dx = p1[0] - p0[0], dz = p1[1] - p0[1], L = Math.hypot(dx, dz) || 1;
  const px = (-dz / L) * w, pz = (dx / L) * w;
  b.quadc([p1[0] + px, yy, p1[1] + pz], [p0[0] + px, yy, p0[1] + pz],
    [p0[0] - px, yy, p0[1] - pz], [p1[0] - px, yy, p1[1] - pz], col, col, col, col, mat);
}
// A meteor: a bright head and a tapered tail that fades into the field.
function ceilMeteor(b, yy, cx, cz, ang, len, col, F) {
  const dx = Math.cos(ang), dz = Math.sin(ang), px = -dz, pz = dx;
  for (let i = 0; i < 5; i++) {
    const r0 = i / 5, r1 = (i + 1) / 5;
    const L0 = len * r0, L1 = len * r1;
    const w0 = 0.085 * (1 - r0) + 0.008, w1 = 0.085 * (1 - r1) + 0.008;
    const c0 = mixc(F, col, 0.96 - r0 * 0.86), c1 = mixc(F, col, 0.96 - r1 * 0.86);
    b.quadc([cx - dx * L1 + px * w1, yy, cz - dz * L1 + pz * w1],
      [cx - dx * L0 - px * w0, yy, cz - dz * L0 - pz * w0],
      [cx - dx * L0 + px * w0, yy, cz - dz * L0 + pz * w0],
      [cx - dx * L1 - px * w1, yy, cz - dz * L1 - pz * w1],
      c1, c0, c0, c1, MX.star);
  }
  qStar(b, yy - 0.002, cx, cz, 0.15, ang, mixc(CX.white, col, 0.4), MX.starHi);
}

function cosmosCeiling(b, x0, x1, z0, z1, y, R) {
  const FW = x1 - x0, FD = z1 - z0;
  const NW = 22, NV = 28;                                  // field grid (Gouraud colours)
  // many small, gentle colour cells instead of a few big washes: the round-9 field read
  // as flat painted regions where one broad gaussian dominated a whole quarter
  const CS = [
    [0.14, 0.30, 0.26, CX.rose, 0.62], [0.70, 0.18, 0.24, CX.teal, 0.60],
    [0.44, 0.52, 0.26, CX.magenta, 0.64], [0.84, 0.62, 0.24, CX.gold, 0.46],
    [0.10, 0.70, 0.24, CX.violet, 0.56], [0.56, 0.06, 0.22, CX.cyan, 0.44],
    [0.30, 0.88, 0.22, CX.amber, 0.40], [0.92, 0.30, 0.20, CX.magenta, 0.42],
    [0.36, 0.16, 0.20, CX.violet, 0.50], [0.66, 0.44, 0.20, CX.amber, 0.34],
    [0.24, 0.56, 0.18, CX.cyan, 0.36], [0.78, 0.84, 0.18, CX.teal, 0.32],
  ];
  const fieldCol = (t, s) => {
    let col = CX.base, lum = 0;
    for (let i = 0; i < CS.length; i++) {
      const q = CS[i], dt = t - q[0], ds = s - q[1], rr = q[2];
      const wgt = Math.exp(-(dt * dt + ds * ds) / (rr * rr)) * q[4];
      if (wgt < 0.010) continue;
      lum += wgt;
      col = mixc(col, q[3], Math.min(0.60, wgt * 0.72));
    }
    // a slow two-frequency swirl: no patch of the field is ever one flat colour
    const m = 0.5 + 0.5 * Math.sin(t * 13.7 + s * 17.3 + 1.1) * Math.sin(t * 21.1 - s * 9.7 + 0.4);
    col = mixc(col, mulc(col, 0.72 + 0.50 * m), 0.55);
    // a very soft brightening along the milky way (belief in the band, no band geometry)
    const g = Math.exp(-Math.pow((s - galS(t)) / 0.115, 2));
    if (g > 0.02) { col = mixc(col, CX.ice, Math.min(0.15, g * 0.18)); lum += g * 0.7; }
    const edge = Math.min(1, Math.min(t, 1 - t) * 4.8) * Math.min(1, Math.min(s, 1 - s) * 4.8);
    return { c: mulc(col, 0.80 + 0.20 * edge), l: lum };
  };
  for (let j = 0; j < NV; j++) {
    for (let i = 0; i < NW; i++) {
      const t0 = i / NW, t1 = (i + 1) / NW, s0 = j / NV, s1 = (j + 1) / NV;
      const A = fieldCol(t0, s0), Bc = fieldCol(t1, s0), Cc = fieldCol(t1, s1), Dd = fieldCol(t0, s1);
      b.quadc([x0 + FW * t0, y, z0 + FD * s0], [x0 + FW * t1, y, z0 + FD * s0],
        [x0 + FW * t1, y, z0 + FD * s1], [x0 + FW * t0, y, z0 + FD * s1],
        A.c, Bc.c, Cc.c, Dd.c, MX.field);
    }
  }
  // ---- soft nebulae: clusters of small fading patches + coloured dust ----
  const NEB = [CX.rose, CX.teal, CX.magenta, CX.gold, CX.violet, CX.cyan, CX.amber, CX.ice];
  const dust = [];
  let pIdx = 0;
  for (let i = 0; i < CEIL_CLOUDS.length; i++) {
    const q = CEIL_CLOUDS[i];
    const cx = x0 + FW * q[0], cz = z0 + FD * q[1], rad = q[2];
    const base = CX[q[3]], second = NEB[(i * 3 + 2) % NEB.length];
    const F = fieldCol(q[0], q[1]).c;
    const nP = 8 + (i % 3);
    for (let k = 0; k < nP; k++) {
      const a = R() * TAU, rr = 0.66 * Math.sqrt(R()) * rad;
      const pcx = cx + Math.cos(a) * rr, pcz = cz + Math.sin(a) * rr * 0.88;
      const pr = rad * (0.20 + R() * 0.15);
      const col = mixc(base, second, R() * 0.55);
      const F2 = fieldCol(q[0] + (pcx - cx) / FW, q[1] + (pcz - cz) / FD).c;
      ceilPatch(b, y - 0.012 - (pIdx % 14) * 0.00055, pcx, pcz, pr, col, F2, 10, R() * TAU);
      pIdx++;
    }
    // a couple of brighter knots so each cloud has a lit centre
    for (let k = 0; k < 2; k++) {
      const a = R() * TAU, rr = 0.30 * Math.sqrt(R()) * rad;
      const pr = rad * (0.10 + R() * 0.06);
      ceilPatch(b, y - 0.012 - (pIdx % 14) * 0.00055, cx + Math.cos(a) * rr,
        cz + Math.sin(a) * rr * 0.88, pr, mixc(base, CX.white, 0.35 + R() * 0.25), F, 8, R() * TAU);
      pIdx++;
    }
    // coloured dust suspended in the cloud
    for (let k = 0; k < 14 + (i % 4) * 3; k++) {
      const a = R() * TAU, rr = Math.sqrt(R()) * rad * 1.05;
      dust.push([cx + Math.cos(a) * rr, cz + Math.sin(a) * rr * 0.88,
        mixc(base, mixc(second, CX.white, R() * 0.65), R()), 0.026 + R() * 0.05]);
    }
  }
  // ---- the brilliant stars: a soft halo and a four-ray cross flare each ----
  const bright = [];
  for (let i = 0; i < BRIGHT.length; i++) {
    const q = BRIGHT[i];
    const bcx = x0 + FW * q[0], bcz = z0 + FD * q[1];
    const size = (0.50 + q[3] * 0.55) * (0.85 + 0.35 * R());
    const col = mixc(CX[q[2]], CX.white, 0.10 + R() * 0.26);
    const F = fieldCol(q[0], q[1]).c;
    ceilHalo(b, y - 0.0206, bcx, bcz, size * (0.30 + 0.10 * R()), col, F, 12);
    ceilCross(b, y - 0.0210, bcx, bcz, size * (0.46 + 0.20 * R()),
      0.022 + R() * 0.010, col, F, R() * TAU);
    bright.push({ x: bcx, z: bcz });
  }
  // ---- three gold constellation figures (thin lines between brilliant stars) ----
  for (let g = 0; g < CONSTELL.length; g++) {
    const chain = CONSTELL[g];
    for (let k = 0; k < chain.length - 1; k++) {
      const p0 = bright[chain[k]], p1 = bright[chain[k + 1]];
      ceilLine(b, y - 0.0198, [p0.x, p0.z], [p1.x, p1.z], 0.042,
        mixc(GOLD, CX.ice, 0.20), M_LINE);
    }
  }
  // ---- star dust inside the nebulae ----
  for (let i = 0; i < dust.length; i++) {
    const d = dust[i];
    qStar(b, y - 0.0214 - (i % 5) * 0.00018, d[0], d[1], d[3], (i * 2.399) % TAU, d[2], MX.star);
  }
  // ---- the star field: dense along the milky way, sparse across the rest ----
  const BAND = [CX.ice, CX.white, mixc(CX.white, CX.cyan, 0.45), mixc(CX.white, CX.gold, 0.55),
    mixc(CX.white, CX.rose, 0.38), mixc(CX.white, CX.violet, 0.48), CX.amber, CX.gold];
  const FIELD = [CX.white, CX.ice, mixc(CX.white, CX.cyan, 0.5), mixc(CX.white, CX.violet, 0.45),
    mixc(CX.white, CX.gold, 0.35)];
  const NB = 540;                                    // stars strung along the lane
  const NF = STAR_N - NB - dust.length;              // scattered stars over the whole field
  let sIdx = 0;
  const paintStar = (t, s, ss, col) => {
    const yy = y - 0.0222 - (sIdx % 9) * 0.00024;
    sIdx++;
    qStar(b, yy, x0 + FW * t, z0 + FD * s, ss, (sIdx * 1.7) % TAU, col, MX.star);
  };
  for (let i = 0; i < NB; i++) {
    // one in four sits in the broad halo of the band, the rest hug the lane
    const wide = i % 4 === 0;
    const t = 0.015 + R() * 0.97;
    const u = R() * 2 - 1;
    const off = (u < 0 ? -1 : 1) * Math.pow(Math.abs(u), wide ? 1.4 : 2.2) * (wide ? 0.30 : 0.092);
    let s = galS(t) + off;
    if (s < 0.02) s = 0.02 + R() * 0.02;
    if (s > 0.98) s = 0.98 - R() * 0.02;
    const core = Math.exp(-Math.pow((s - galS(t)) / 0.05, 2));
    const ss = (0.030 + Math.pow(R(), 2.3) * 0.125) * (1 + 0.5 * core);
    paintStar(t, s, ss, mulc(BAND[(i * 3 + 1) % BAND.length], 0.72 + R() * 0.28));
  }
  for (let i = 0; i < NF; i++) {
    const t = 0.02 + R() * 0.96, s = 0.02 + R() * 0.96;
    const ss = 0.028 + Math.pow(R(), 2.6) * 0.095;
    paintStar(t, s, ss, mulc(FIELD[(i * 3 + 2) % FIELD.length], 0.66 + R() * 0.30));
  }
  // ---- the brilliant stars themselves, on top of their flares ----
  for (let i = 0; i < BRIGHT.length; i++) {
    const q = BRIGHT[i];
    qStar(b, y - 0.0248, x0 + FW * q[0], z0 + FD * q[1], 0.105 * q[3], R() * TAU,
      mixc(CX[q[2]], CX.white, 0.35 + 0.30 * R()), MX.starHi);
  }
  // ---- two meteors: a bright head and a tapered tail ----
  for (const [t, s, ang, kk] of [[0.63, 0.16, 2.55, 1.0], [0.24, 0.72, 1.05, 0.72]]) {
    ceilMeteor(b, y - 0.0256, x0 + FW * t, z0 + FD * s, ang, 0.8 + 2.4 * kk,
      mixc(CX.ice, CX.white, 0.5), fieldCol(t, s).c);
  }
  // ---- painted border + heavy gold frame with rosettes (kept and strengthened) ----
  const BX = 0.34, fr = 0.15;
  qYn(b, y - 0.001, x0 - BX, x1 + BX, z0 - BX, z0, CX.wine, MX.velvet);
  qYn(b, y - 0.001, x0 - BX, x1 + BX, z1, z1 + BX, CX.wine, MX.velvet);
  qYn(b, y - 0.001, x0 - BX, x0, z0, z1, CX.wine, MX.velvet);
  qYn(b, y - 0.001, x1, x1 + BX, z0, z1, CX.wine, MX.velvet);
  bx(b, x0 - fr, x1 + fr, y - 0.06, y, z0 - fr, z0, GOLD, MX.gold);
  bx(b, x0 - fr, x1 + fr, y - 0.06, y, z1, z1 + fr, GOLD, MX.gold);
  bx(b, x0 - fr, x0, y - 0.06, y, z0, z1, GOLD, MX.gold);
  bx(b, x1, x1 + fr, y - 0.06, y, z0, z1, GOLD, MX.gold);
  bx(b, x0 - 0.05, x1 + 0.05, y - 0.095, y - 0.055, z0 - 0.05, z0 + 0.02, GOLD_HI, MX.goldHi);
  bx(b, x0 - 0.05, x1 + 0.05, y - 0.095, y - 0.055, z1 - 0.02, z1 + 0.05, GOLD_HI, MX.goldHi);
  bx(b, x0 - 0.05, x0 + 0.02, y - 0.095, y - 0.055, z0 - 0.05, z1 + 0.05, GOLD_HI, MX.goldHi);
  bx(b, x1 - 0.02, x1 + 0.05, y - 0.095, y - 0.055, z0 - 0.05, z1 + 0.05, GOLD_HI, MX.goldHi);
  for (let i = 0; i <= 8; i++) {
    const xx = x0 + ((x1 - x0) * i) / 8;
    for (const zz of [z0 - 0.085, z1 + 0.085]) {
      b.push(mat4(xx, y - 0.115, zz));
      ellipsoid(b, 0.20, 0.045, 0.20, 5, 2, i % 2 ? GOLD : GOLD_HI, MX.goldHi);
      b.pop();
    }
  }
  for (let i = 0; i <= 6; i++) {
    const zz = z0 + ((z1 - z0) * i) / 6;
    for (const xx of [x0 - 0.085, x1 + 0.085]) {
      b.push(mat4(xx, y - 0.115, zz));
      ellipsoid(b, 0.18, 0.045, 0.18, 5, 2, i % 2 ? GOLD_HI : GOLD, MX.goldHi);
      b.pop();
    }
  }
  // corner sunbursts
  for (const sx2 of [-1, 1]) {
    for (const sz2 of [-1, 1]) {
      const cc = [sx2 < 0 ? x0 - 0.10 : x1 + 0.10, sz2 < 0 ? z0 - 0.10 : z1 + 0.10];
      const yy = y - 0.13;
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * TAU, dxu = Math.cos(a), dzu = Math.sin(a), px = -dzu, pz = dxu;
        b.quad([cc[0] + px * 0.06, yy, cc[1] + pz * 0.06],
          [cc[0] + dxu * 0.55 + px * 0.02, yy, cc[1] + dzu * 0.55 + pz * 0.02],
          [cc[0] + dxu * 0.55 - px * 0.02, yy, cc[1] + dzu * 0.55 - pz * 0.02],
          [cc[0] - px * 0.06, yy, cc[1] - pz * 0.06], k % 2 ? GOLD_HI : GOLD, MX.goldHi, DN);
      }
      b.push(mat4(cc[0], yy, cc[1]));
      ellipsoid(b, 0.16, 0.16, 0.16, 6, 3, mixc(CX.ice, CX.gold, 0.4), MX.glow);
      b.pop();
    }
  }
}

// ============================================================== CABINET WALL
// A symmetric run of gilded niches down the blank west wall (x = SAL.x0), authored in the
// wall frame: u runs along the wall (+u = north / -Z), y is world up, +w is into the room.
// A niche's u = SAL.cz - z, so the composition mirrors about the room centre. Every plinth
// starts at y = FY on the floor, and nothing stands deeper than 0.90 m off the wall (the
// room furniture and the walkway are untouched).
function nichePanel(b, u, wid, y0, y1) {
  const a = u - wid / 2, c = u + wid / 2, t = 0.11;
  const hgt = y1 - y0;
  const PB = mulc(mixc(CX.indigoV, CX.magenta, 0.20), 1.02);
  wq(b, a + t, c - t, y0 + t, y1 - t, 0.050, PB, MX.velvetHi);
  // painted nebula in the upper half (the part the vitrine never covers), fading into PB
  wblob(b, u, y0 + hgt * 0.70, (c - a) * 0.34, hgt * 0.26, 22, mixc(CX.magenta, CX.violet, 0.34), PB, 0.054, 0.3);
  wblob(b, u + (c - a) * 0.16, y0 + hgt * 0.80, (c - a) * 0.18, hgt * 0.14, 18, mixc(CX.teal, CX.indigoV, 0.55), PB, 0.056, -0.4);
  wblob(b, u - (c - a) * 0.14, y0 + hgt * 0.62, (c - a) * 0.15, hgt * 0.11, 18, mixc(CX.rose, CX.violet, 0.50), PB, 0.058, 0.6);
  // a small constellation + loose stars so the niche reads as a painted panel
  const SP = [];
  for (let i = 0; i < 4; i++) {
    SP.push([a + t + (wid - 2 * t) * (0.18 + 0.21 * i), y0 + hgt * (0.60 + 0.075 * (((i * 7) % 4) / 3))]);
  }
  for (let i = 0; i < SP.length - 1; i++) wlin(b, SP[i][0], SP[i][1], SP[i + 1][0], SP[i + 1][1], 0.018, 0.060, GOLD, MX.goldD);
  for (let i = 0; i < SP.length; i++) wq(b, SP[i][0] - 0.03, SP[i][0] + 0.03, SP[i][1] - 0.03, SP[i][1] + 0.03, 0.062, CX.ice, MX.starHi);
  for (let i = 0; i < 14; i++) {
    const su = a + t + 0.2 + (wid - 2 * t - 0.4) * (((i * 37) % 100) / 100);
    const sy = y0 + t + 0.2 + (hgt - 2 * t - 0.4) * (((i * 61) % 100) / 100);
    const ss = 0.022 + 0.016 * (i % 3);
    wq(b, su - ss, su + ss, sy - ss, sy + ss, 0.064, i % 2 ? CX.gold : CX.white, MX.star);
  }
  bx(b, a, c, y0, y0 + t, -0.01, 0.15, GOLD, MX.gold);
  bx(b, a, c, y1 - t, y1, -0.01, 0.15, GOLD, MX.gold);
  bx(b, a, a + t, y0 + t, y1 - t, -0.01, 0.15, GOLD, MX.gold);
  bx(b, c - t, c, y0 + t, y1 - t, -0.01, 0.15, GOLD, MX.gold);
  bx(b, a + 0.16, c - 0.16, y0 + 0.14, y0 + 0.19, 0.05, 0.13, GOLD_HI, MX.goldHi);
  bx(b, a + 0.16, c - 0.16, y1 - 0.19, y1 - 0.14, 0.05, 0.13, GOLD_HI, MX.goldHi);
  b.push(mat4(u, y1 + 0.02, 0.09));
  ellipsoid(b, 0.20, 0.13, 0.05, 6, 3, GOLD_HI, MX.goldHi);
  b.pop();
}
// a framed star chart in the upper tier: indigo plate, painted nebula, a constellation
function starChart(b, u, y0, y1, wid, seed) {
  const a = u - wid / 2, c = u + wid / 2, t = 0.13, hgt = y1 - y0;
  wq(b, a + t, c - t, y0 + t, y1 - t, 0.055, CX.indigoV, MX.field);
  const CC = [mixc(CX.indigoV, CX.violet, 0.50), mixc(CX.violet, CX.magenta, 0.36), mixc(CX.violet, CX.teal, 0.34)];
  wblob(b, u, y0 + hgt * 0.62, (c - a) * 0.36, hgt * 0.26, 20, CC[seed % 3], CX.indigoV, 0.058, 0.25 + 0.2 * (seed % 3));
  wblob(b, u + (c - a) * 0.12, y0 + hgt * 0.34, (c - a) * 0.19, hgt * 0.15, 16, CC[(seed + 1) % 3], CX.indigoV, 0.060, -0.5);
  const SP = [];
  for (let i = 0; i < 5; i++) {
    SP.push([a + t + (wid - 2 * t) * (0.16 + 0.17 * i),
      y0 + t + (hgt - 2 * t) * (0.30 + 0.12 * i + 0.05 * ((i + seed) % 3))]);
  }
  for (let i = 0; i < SP.length - 1; i++) wlin(b, SP[i][0], SP[i][1], SP[i + 1][0], SP[i + 1][1], 0.022, 0.062, GOLD, MX.gold);
  for (let i = 0; i < SP.length; i++) {
    const s = 0.05 + 0.02 * (i % 2);
    wq(b, SP[i][0] - s, SP[i][0] + s, SP[i][1] - s, SP[i][1] + s, 0.066, i % 2 ? CX.ice : CX.white, MX.starHi);
  }
  bx(b, a, c, y0, y0 + t, 0.02, 0.16, GOLD, MX.gold);
  bx(b, a, c, y1 - t, y1, 0.02, 0.16, GOLD, MX.gold);
  bx(b, a, a + t, y0 + t, y1 - t, 0.02, 0.16, GOLD, MX.gold);
  bx(b, c - t, c, y0 + t, y1 - t, 0.02, 0.16, GOLD, MX.gold);
  bx(b, a, a + 0.30, y0, y0 + 0.30, 0.02, 0.19, GOLD_HI, MX.goldHi);
  bx(b, c - 0.30, c, y0, y0 + 0.30, 0.02, 0.19, GOLD_HI, MX.goldHi);
  bx(b, a, a + 0.30, y1 - 0.30, y1, 0.02, 0.19, GOLD_HI, MX.goldHi);
  bx(b, c - 0.30, c, y1 - 0.30, y1, 0.02, 0.19, GOLD_HI, MX.goldHi);
  b.push(mat4(u, y1 + 0.12, 0.10));
  ellipsoid(b, 0.22, 0.14, 0.06, 6, 3, GOLD_HI, MX.goldHi);
  b.pop();
}
// gilt wall sconce (candle light) on a pilaster
function sconce(b, u, y, ctx) {
  bx(b, u - 0.05, u + 0.05, y - 0.05, y + 0.05, 0.08, 0.30, GOLD, MX.gold);
  bx(b, u - 0.17, u + 0.17, y + 0.02, y + 0.10, 0.24, 0.38, GOLD_HI, MX.goldHi);
  bx(b, u - 0.13, u + 0.13, y + 0.10, y + 0.16, 0.26, 0.36, GOLD, MX.goldD);
  b.push(mat4(u, y + 0.30, 0.32));
  ellipsoid(b, 0.14, 0.19, 0.14, 6, 4, mixc(C.sunGlow, CX.ice, 0.35), MX.glow);
  b.pop();
  if (ctx && ctx.lanterns) {
    ctx.lanterns.push({ p: [SAL.x0 + 0.34, y + 0.30, SAL.cz - u], size: 1.45, rot: 0, alpha: 0.34, shape: 1,
      col: mixc(C.sunGlow, CX.ice, 0.42) });
  }
}
// one vitrine: gilded niche behind, stepped plinth on the floor, glass hood, exhibit, label
function curioCase(b, c, ctx, R) {
  const u = c.u, wid = c.w, d = c.d;
  const u0 = u - wid / 2, u1 = u + wid / 2;
  const deckY = COS_DECK, top = deckY + c.hood;
  nichePanel(b, u, wid + 0.66, FY + 1.14, 6.55);
  // plinth: the bottom course stands on the floor (base y = FY)
  bx(b, u0, u1, FY, FY + 0.18, -0.01, d + 0.01, mulc(MARB_SH, 0.92), MX.marble, { topCol: MARB });
  bx(b, u0 + 0.08, u1 - 0.08, FY + 0.18, FY + 1.16, 0.01, d - 0.02, MARB, MX.marbleHi, { topCol: MARB_HI });
  bx(b, u0 + 0.04, u1 - 0.04, FY + 1.16, deckY, -0.01, d, GOLD, MX.gold);
  // engraved label plaque on the front of the plinth
  bx(b, u - 0.42, u + 0.42, FY + 0.46, FY + 0.78, d - 0.02, d + 0.02, CX.indigoV, MX.plaque, { topCol: CX.indigoV });
  for (let k = 0; k < 2; k++) {
    const yy = FY + 0.55 + k * 0.10;
    bx(b, u - 0.32, u - 0.12, yy, yy + 0.026, d + 0.02, d + 0.036, GOLD_HI, MX.goldHi);
    bx(b, u - 0.07, u + 0.30, yy, yy + 0.026, d + 0.02, d + 0.036, GOLD, MX.goldD);
  }
  // vitrine: four gold posts + glass side panes + glass canopy; the front stays open
  const pd = d - 0.07;
  for (const su of [-1, 1]) {
    const uu = u + su * (wid / 2 - 0.07);
    bx(b, uu - 0.045, uu + 0.045, deckY, top, 0.03, 0.09, GOLD, MX.gold);
    bx(b, uu - 0.045, uu + 0.045, deckY, top, pd, pd + 0.06, GOLD, MX.gold);
    bx(b, u + su * (wid / 2 - 0.06) - 0.022, u + su * (wid / 2 - 0.06) + 0.022,
      deckY + 0.08, top - 0.10, 0.12, pd - 0.06, mixc(CX.cyan, CX.indigoV, 0.86), MX.glass2);
  }
  bx(b, u0 + 0.03, u1 - 0.03, top - 0.10, top, 0.03, 0.10, GOLD, MX.gold);
  bx(b, u0 + 0.03, u1 - 0.03, top - 0.10, top, pd, pd + 0.07, GOLD, MX.gold);
  bx(b, u0 + 0.03, u0 + 0.09, top - 0.10, top, 0.03, pd + 0.07, GOLD, MX.gold);
  bx(b, u1 - 0.09, u1 - 0.03, top - 0.10, top, 0.03, pd + 0.07, GOLD, MX.gold);
  qYn(b, top - 0.02, u0 + 0.10, u1 - 0.10, pd - 0.20, pd, mixc(CX.cyan, CX.indigoV, 0.84), MX.glass2);
  bx(b, u0 + 0.06, u1 - 0.06, top - 0.05, top - 0.01, 0.06, 0.14, mixc(CX.cyan, CX.indigoV, 0.40), MX.glass2);
  b.push(mat4(u, top + 0.02, (0.08 + pd) / 2));
  ellipsoid(b, 0.09, 0.12, 0.09, 5, 3, GOLD_HI, MX.goldHi);
  b.pop();
  // the exhibit itself
  b.push(mat4(u, deckY, d * 0.52));
  curioContent(b, c, R);
  b.pop();
  if (ctx && ctx.lanterns) {
    ctx.lanterns.push({ p: [SAL.x0 + d * 0.62, deckY + 0.72, SAL.cz - u], size: c.kind === 'nebula' ? 2.15 : 1.55,
      rot: 0, alpha: c.kind === 'nebula' ? 0.36 : 0.30, shape: 1, col: CURIO_GLOW[c.kind] });
  }
}
// ---- the eight exhibits ----------------------------------------------------------
// Built in the case frame: x along the wall, y up from the deck, z into the room.
function curioContent(b, c, R) {
  const half = c.w / 2 - 0.24;
  switch (c.kind) {
    case 'nebula': {
      // "a nebula in a glass vial": a ribbed crystal cage on a gilt tripod, the nebula
      // glowing inside it, gold stopper and a hanging chain
      const rr = 0.30, base = 0.33;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU + 0.5;
        bar3(b, [Math.cos(a) * 0.48, 0, Math.sin(a) * 0.48], [Math.cos(a) * 0.18, 0.26, Math.sin(a) * 0.18], 0.055, 0.055, GOLD, MX.gold);
      }
      b.push(mat4(0, 0.24, 0));
      cylinder(b, 14, 0.36, 0.34, 0.07, GOLD_HI, MX.goldHi, { y0: 0 });
      cylinder(b, 14, 0.33, 0.33, 0.04, mulc(GOLD, 0.82), MX.goldD, { y0: 0.07 });
      b.pop();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + 0.2, cc2 = Math.cos(a), ss2 = Math.sin(a);
        bar3(b, [cc2 * rr, base, ss2 * rr], [cc2 * rr, base + 0.95, ss2 * rr], 0.040, 0.040, mixc(CX.cyan, CX.indigoV, 0.44), MX.glass2);
        bar3(b, [cc2 * rr, base + 0.95, ss2 * rr], [cc2 * 0.13, base + 1.18, ss2 * 0.13], 0.036, 0.036, mixc(CX.cyan, CX.indigoV, 0.44), MX.glass2);
      }
      for (const yy of [base + 0.03, base + 0.50, base + 0.94]) {
        b.push(mat4(0, yy, 0));
        torus(b, rr, 0.026, 12, 3, mixc(CX.cyan, CX.indigoV, 0.42), MX.glass2, 'y');
        b.pop();
      }
      b.push(mat4(0, base + 1.18, 0));
      cylinder(b, 10, 0.12, 0.12, 0.18, mixc(CX.cyan, CX.indigoV, 0.42), MX.glass2, { y0: 0 });
      b.pop();
      b.push(mat4(0, base + 1.36, 0));
      lathe(b, [[0.13, 0], [0.10, 0.08], [0.15, 0.16], [0.05, 0.24], [0.02, 0.30]], 8, GOLD_HI, MX.goldHi);
      b.pop();
      // the nebula inside
      b.push(mat4(0, base + 0.60, 0));
      ellipsoid(b, 0.24, 0.30, 0.22, 8, 5, mulc(CX.magenta, 0.92), MX.cloudHi);
      b.pop();
      b.push(mat4(0.06, base + 0.50, 0.03));
      ellipsoid(b, 0.15, 0.19, 0.14, 7, 4, mulc(CX.teal, 0.92), MX.cloudHi);
      b.pop();
      b.push(mat4(-0.03, base + 0.68, 0));
      ellipsoid(b, 0.09, 0.11, 0.08, 6, 3, mixc(CX.ice, CX.gold, 0.30), MX.glow);
      b.pop();
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU, r2 = 0.09 + (i % 3) * 0.05, yy = base + 0.42 + (i % 4) * 0.15;
        b.quad([Math.cos(a) * r2 - 0.024, yy, Math.sin(a) * r2], [Math.cos(a) * r2 + 0.024, yy, Math.sin(a) * r2],
          [Math.cos(a) * r2 + 0.024, yy + 0.05, Math.sin(a) * r2], [Math.cos(a) * r2 - 0.024, yy + 0.05, Math.sin(a) * r2],
          i % 2 ? CX.white : CX.gold, MX.starHi, [0, 0, 1]);
      }
      break;
    }
    case 'meteor': {
      // "a fallen star": iron shard with molten seams on a velvet cushion in a gilt cradle
      bx(b, -0.52, 0.52, 0, 0.05, -0.32, 0.32, GOLD, MX.gold, { topCol: GOLD_HI });
      b.push(mat4(0, 0.10, 0));
      ellipsoid(b, 0.44, 0.08, 0.30, 9, 2, CX.wine, MX.velvet);
      b.pop();
      b.push(mat4(0, 0.26, 0));
      ellipsoid(b, 0.26, 0.20, 0.22, 9, 5, mulc(mixc(C.iron, C.slateLight, 0.34), 0.96), MX.iron);
      b.pop();
      b.push(mat4(0.19, 0.34, 0.10)); ellipsoid(b, 0.11, 0.10, 0.10, 6, 3, mulc(mixc(C.iron, C.slateLight, 0.20), 1.10), MX.iron); b.pop();
      b.push(mat4(-0.17, 0.28, -0.09)); ellipsoid(b, 0.09, 0.08, 0.08, 6, 3, mulc(mixc(C.iron, C.slateDark, 0.4), 0.90), MX.iron); b.pop();
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU + 0.7;
        b.quad([Math.cos(a) * 0.10, 0.22, Math.sin(a) * 0.10], [Math.cos(a) * 0.20, 0.30, Math.sin(a) * 0.14],
          [Math.cos(a) * 0.21, 0.26, Math.sin(a) * 0.16], [Math.cos(a) * 0.11, 0.19, Math.sin(a) * 0.11],
          CX.amber, MX.glow, [0, 0.6, 0.5]);
      }
      b.push(mat4(0, 0.18, 0));
      torus(b, 0.34, 0.035, 16, 3, GOLD_HI, MX.goldHi, 'y');
      b.pop();
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU + 0.3;
        bar3(b, [Math.cos(a) * 0.34, 0.18, Math.sin(a) * 0.34], [Math.cos(a) * 0.20, 0.42, Math.sin(a) * 0.20], 0.04, 0.04, GOLD, MX.gold);
      }
      break;
    }
    case 'comet': {
      // "a captured comet": a glowing nucleus clamped in a brass arch, its tail streaming
      b.push(mat4(0, 0.04, 0));
      cylinder(b, 14, 0.42, 0.38, 0.07, mulc(GOLD, 0.92), MX.gold, { y0: 0 });
      b.pop();
      for (const sd of [-1, 1]) {
        const pts = [];
        for (let i = 0; i <= 7; i++) {
          const a = Math.PI * 0.16 + (Math.PI * 0.68 * i) / 7;
          pts.push([Math.cos(a) * 0.30 * sd, 0.34 + Math.sin(a) * 0.90, 0]);
        }
        for (let i = 0; i < pts.length - 1; i++) bar3(b, pts[i], pts[i + 1], 0.042, 0.042, GOLD_HI, MX.goldHi);
      }
      b.push(mat4(0, 1.02, 0));
      ellipsoid(b, 0.20, 0.20, 0.20, 9, 5, mixc(CX.ice, CX.cyan, 0.35), MX.crystalHi);
      b.pop();
      b.push(mat4(0, 1.02, 0));
      torus(b, 0.23, 0.030, 14, 3, GOLD, MX.gold, 'y');
      b.pop();
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU;
        const x0 = Math.cos(a) * 0.15, y0 = 1.02 + Math.sin(a) * 0.15;
        const x1 = Math.cos(a) * 0.40, y1 = 1.02 + Math.sin(a) * 0.60;
        b.quad([x0 - 0.05, y0, 0.05], [x1 - 0.02, y1, 0.17], [x1 + 0.02, y1, 0.21], [x0 + 0.05, y0, 0.09],
          i % 2 ? CX.ice : mixc(CX.cyan, CX.violet, 0.40), MX.crystal, [0, 0, 1]);
      }
      break;
    }
    case 'tooth': {
      // "the star-whale's tooth": a curved ivory tusk on a black marble cradle
      bx(b, -0.50, 0.50, 0, 0.30, -0.28, 0.28, mulc(C.slateDark, 0.42), MX.marble, { topCol: mulc(C.slateDark, 0.54) });
      bx(b, -0.54, 0.54, 0, 0.05, -0.32, 0.32, GOLD, MX.goldD, { topCol: GOLD });
      const pts = [], rad = [];
      for (let i = 0; i <= 9; i++) {
        const t = i / 9;
        pts.push([Math.sin(t * 1.45) * 0.17, 0.28 + t * 1.52, Math.sin(t * 1.05) * 0.32]);
        rad.push(0.19 * (1 - t) + 0.022);
      }
      tubePath(b, pts, rad, 8, CX.bone, MX.marbleHi);
      for (const t of [0.22, 0.50, 0.78]) {
        const i = Math.round(t * 9);
        b.push(mat4(pts[i][0], pts[i][1], pts[i][2]));
        torus(b, rad[i] + 0.030, 0.024, 10, 3, GOLD, MX.gold, 'y');
        b.pop();
      }
      b.push(mat4(pts[9][0], pts[9][1] + 0.04, pts[9][2]));
      ellipsoid(b, 0.055, 0.075, 0.055, 5, 3, GOLD_HI, MX.goldHi);
      b.pop();
      break;
    }
    case 'astrolabe': {
      // "the star astrolabe": a brass armillary sphere on a turned column
      b.push(mat4(0, 0, 0));
      lathe(b, [[0.32, 0], [0.27, 0.05], [0.10, 0.10], [0.07, 0.44], [0.12, 0.52], [0.06, 0.60]], 10, GOLD, MX.gold);
      b.pop();
      b.push(mat4(0, 1.02, 0));
      torus(b, 0.42, 0.030, 18, 3, GOLD_HI, MX.goldHi, 'y');
      torus(b, 0.37, 0.024, 16, 3, GOLD, MX.gold, 'z');
      torus(b, 0.37, 0.024, 16, 3, GOLD, MX.gold, 'x');
      ellipsoid(b, 0.10, 0.10, 0.10, 7, 4, mixc(CX.gold, CX.ice, 0.35), MX.glow);
      bar3(b, [-0.46, 0, 0], [0.46, 0, 0], 0.030, 0.030, GOLD_HI, MX.goldHi);
      bar3(b, [0, -0.46, 0], [0, 0.46, 0], 0.025, 0.025, GOLD, MX.gold);
      b.pop();
      // an engraved star plate leaning on the column
      wq(b, -0.34, 0.34, 0.12, 0.78, 0.20, CX.indigoV, MX.plaque);
      for (let i = 0; i < 7; i++) {
        const su = -0.28 + 0.09 * i, sy = 0.20 + 0.07 * ((i * 37) % 5);
        wq(b, su - 0.016, su + 0.016, sy - 0.016, sy + 0.016, 0.206, CX.gold, MX.starHi);
      }
      break;
    }
    case 'moon': {
      // "moonstone cluster": five luminous prisms on a gilt tray
      bx(b, -0.44, 0.44, 0, 0.07, -0.26, 0.26, GOLD, MX.gold, { topCol: GOLD_HI });
      const CR = [[0.00, 0.60, 0.00], [-0.16, 0.40, 0.06], [0.15, 0.46, -0.05], [0.05, 0.30, 0.15], [-0.09, 0.26, -0.15]];
      for (let i = 0; i < CR.length; i++) {
        const cx2 = CR[i][0], hh = CR[i][1], cz2 = CR[i][2];
        b.push(mat4(cx2, 0.07, cz2));
        cylinder(b, 5, 0.085, 0.012, hh, mixc(CX.ice, CX.cyan, 0.30 + 0.18 * (i % 2)), MX.crystal, { y0: 0 });
        b.push(mat4(0, hh * 0.52, 0));
        ellipsoid(b, 0.055, 0.085, 0.055, 6, 3, mixc(CX.ice, CX.white, 0.40), MX.glow);
        b.pop();
        b.pop();
      }
      b.push(mat4(0, 0.09, 0));
      ellipsoid(b, 0.32, 0.030, 0.20, 8, 2, mixc(CX.cyan, CX.ice, 0.50), MX.cloudHi);
      b.pop();
      break;
    }
    case 'terrarium': {
      // "an alien botanical cabinet": a moss bed, three glowing-pod stalks, mushrooms
      bx(b, -0.50, 0.50, 0, 0.06, -0.34, 0.34, mulc(GOLD, 0.90), MX.gold, { topCol: GOLD_HI });
      b.push(mat4(0, 0.10, 0));
      ellipsoid(b, 0.46, 0.09, 0.30, 9, 3, mixc(C.leafDark, C.leaf, 0.50), MX.moss);
      b.pop();
      const ST = [[-0.20, 0.10, 0.60, 0.35], [0.10, -0.08, 0.78, 0.15], [0.26, 0.12, 0.46, 0.65]];
      for (let i = 0; i < ST.length; i++) {
        const sx2 = ST[i][0], sz2 = ST[i][1], hh = ST[i][2], lean = ST[i][3];
        const p1 = [sx2 + lean * 0.16, 0.14 + hh * 0.5, sz2];
        const p2 = [sx2 + lean * 0.30, 0.14 + hh, sz2 + lean * 0.05];
        bar3(b, [sx2, 0.14, sz2], p1, 0.035, 0.035, mixc(C.leafDark, C.leaf, 0.40), MX.moss);
        bar3(b, p1, p2, 0.028, 0.028, mixc(C.leaf, C.leafLight, 0.40), MX.moss);
        b.push(mat4(p2[0], p2[1], p2[2]));
        ellipsoid(b, 0.075, 0.10, 0.075, 6, 4, mixc(CX.rose, CX.magenta, lean), MX.glow);
        b.pop();
        for (const sd of [-1, 1]) {
          b.quad([p1[0], p1[1], p1[2]], [p1[0] + 0.20 * sd, p1[1] + 0.06, p1[2] + 0.10],
            [p1[0] + 0.22 * sd, p1[1] + 0.02, p1[2] + 0.14], [p1[0] + 0.02, p1[1] - 0.02, p1[2] + 0.04],
            mixc(C.leafLight, C.leaf, 0.30), MX.moss, [0, 0.6, 0.8]);
        }
      }
      for (const [mx, mz, mh] of [[-0.34, -0.16, 0.16], [0.30, -0.18, 0.13]]) {
        b.push(mat4(mx, 0.14, mz));
        lathe(b, [[0.05, 0], [0.06, mh * 0.6], [0.10, mh]], 7, mixc(CX.ice, CX.rose, 0.4), MX.crystal);
        b.pop();
      }
      break;
    }
  }
  void half; void R;
}
// a small planet on a gold chain, suspended in front of the star-chart gallery
function suspendedPlanet(b, ctx) {
  const u = 0, w = 1.05, yTop = 12.90, yc = 9.55;
  for (let i = 0; i < 7; i++) {
    bx(b, u - 0.028, u + 0.028, yTop - (i + 1) * 0.40, yTop - i * 0.40 - 0.03, w - 0.028, w + 0.028, GOLD, MX.gold);
  }
  b.push(mat4(u, yc + 0.62, w));
  torus(b, 0.16, 0.025, 10, 3, GOLD_HI, MX.goldHi, 'y');
  b.pop();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.5;
    bar3(b, [u + Math.cos(a) * 0.10, yc + 0.60, w + Math.sin(a) * 0.10],
      [u + Math.cos(a) * 0.30, yc + 0.26, w + Math.sin(a) * 0.30], 0.035, 0.035, GOLD, MX.gold);
  }
  b.push(mat4(u, yc, w));
  ellipsoid(b, 0.46, 0.44, 0.46, 10, 6, mulc(mixc(CX.teal, C.waterDeep, 0.42), 0.94), MX.crystal);
  b.pop();
  // two latitude bands that sit on the sphere so it reads as a small world
  for (const [yy2, ry2, rr2, cc2] of [[0.17, 0.055, 0.40, CX.ice], [-0.19, 0.040, 0.38, mixc(CX.cyan, CX.teal, 0.4)]]) {
    b.push(mat4(u, yc + yy2, w));
    ellipsoid(b, rr2, ry2, rr2, 10, 2, cc2, MX.cloudHi);
    b.pop();
  }
  b.push(mat4(u, yc, w));
  torus(b, 0.58, 0.035, 18, 3, GOLD_HI, MX.goldHi, 'y');
  torus(b, 0.52, 0.026, 16, 3, mulc(mixc(CX.ice, CX.cyan, 0.50), 0.92), MX.crystalHi, 'x');
  b.pop();
  b.push(mat4(u + 0.72, yc + 0.20, w - 0.06));
  ellipsoid(b, 0.10, 0.10, 0.10, 6, 3, CX.ice, MX.glow);
  b.pop();
  bx(b, u + 0.50, u + 0.72, yc + 0.16, yc + 0.20, w - 0.09, w - 0.03, GOLD, MX.goldD);
  if (ctx && ctx.lanterns) {
    ctx.lanterns.push({ p: [SAL.x0 + w, yc, SAL.cz - u], size: 2.0, rot: 0, alpha: 0.26, shape: 1, col: mixc(CX.cyan, CX.ice, 0.40) });
    ctx.lanterns.push({ p: [SAL.x0 + w + 0.72, yc + 0.20, SAL.cz - u], size: 1.0, rot: 0, alpha: 0.26, shape: 1, col: CX.ice });
  }
}
// the whole west wall: architecture, gallery, frieze, niches, sconces, planet
function cosmosWall(b, ctx, R) {
  const WU = (SAL.z1 - SAL.z0) / 2;
  const PILS = [-17.45, -14.35, -10.30, -6.45, -2.50, 2.50, 6.45, 10.30, 14.35, 17.45];
  wallFrameX(b, SAL.x0, SAL.cz, 1, () => {
    bx(b, -WU, WU, FY, FY + 0.95, -0.02, 0.075, mulc(MARB_SH, 0.84), MX.marble, { topCol: mulc(MARB_SH, 0.92) });
    bx(b, -WU, WU, FY + 0.95, FY + 1.04, -0.02, 0.11, GOLD, MX.gold);
    bx(b, -WU, WU, FY + 1.04, FY + 1.14, -0.02, 0.065, MARB, MX.marbleHi);
    for (let i = 0; i < PILS.length - 1; i++) {
      const a = PILS[i] + 0.28, c = PILS[i + 1] - 0.28;
      wq(b, a, c, FY + 1.14, 6.90, 0.048, mulc(CX.wine, i % 2 ? 0.90 : 1.0), MX.velvet);
      wq(b, a, a + 0.05, FY + 1.14, 6.90, 0.052, GOLD, MX.goldD);
      wq(b, c - 0.05, c, FY + 1.14, 6.90, 0.052, GOLD, MX.goldD);
    }
    for (const u of PILS) {
      bx(b, u - 0.26, u + 0.26, FY + 0.12, 6.90, 0.02, 0.21, MARB, MX.marble, { topCol: MARB_HI });
      bx(b, u - 0.32, u + 0.32, FY + 0.12, FY + 0.38, 0.01, 0.25, MARB_HI, MX.marbleHi);
      bx(b, u - 0.32, u + 0.32, 6.48, 6.90, 0.01, 0.25, GOLD, MX.gold);
      bx(b, u - 0.06, u + 0.06, FY + 0.38, 6.48, 0.19, 0.23, GOLD, MX.goldD);
    }
    bx(b, -WU, WU, 6.90, 7.06, -0.02, 0.28, GOLD, MX.gold);
    bx(b, -WU, WU, 7.06, 7.50, -0.02, 0.20, MARB_HI, MX.marbleHi, { topCol: MARB });
    bx(b, -WU, WU, 7.50, 7.60, -0.02, 0.15, GOLD, MX.goldD);
    const UFR = [0, -4.2, 4.2, -8.4, 8.4, -12.6, 12.6];
    for (let i = 0; i < UFR.length; i++) {
      const isC = i === 0;
      starChart(b, UFR[i], isC ? 7.86 : 8.06, isC ? 10.86 : 10.56, isC ? 2.70 : 2.05, i);
    }
    for (const uu of [-14.9, -10.5, -6.3, -2.1, 2.1, 6.3, 10.5, 14.9]) {
      // a short gilt arm off the entablature holding a lit crystal star-catcher
      bx(b, uu - 0.04, uu + 0.04, 7.44, 7.62, 0.02, 0.30, GOLD, MX.gold);
      bx(b, uu - 0.06, uu + 0.06, 7.38, 7.46, 0.22, 0.32, GOLD_HI, MX.goldHi);
      b.push(mat4(uu, 7.20, 0.27));
      ellipsoid(b, 0.13, 0.17, 0.13, 6, 4, mixc(CX.ice, CX.gold, 0.30), MX.crystal);
      b.pop();
      b.push(mat4(uu, 7.00, 0.27));
      ellipsoid(b, 0.085, 0.09, 0.085, 5, 3, mixc(CX.gold, CX.ice, 0.40), MX.glow);
      b.pop();
      if (ctx && ctx.lanterns) {
        ctx.lanterns.push({ p: [SAL.x0 + 0.27, 7.14, SAL.cz - uu], size: 1.25, rot: 0, alpha: 0.30, shape: 1,
          col: mixc(CX.gold, CX.ice, 0.35) });
      }
    }
    bx(b, -WU, WU, 10.94, 11.08, -0.02, 0.17, GOLD, MX.gold);
    wq(b, -WU, WU, 11.08, 12.80, 0.05, CX.indigoV, MX.field);
    bx(b, -WU, WU, 12.80, 12.94, -0.02, 0.17, GOLD, MX.gold);
    for (let i = 0; i < 60; i++) {
      const su = -WU + 0.6 + ((2 * WU - 1.2) * ((i * 37) % 101)) / 101;
      const sy = 11.30 + (1.30 * ((i * 61) % 97)) / 97;
      const ss = 0.035 + 0.022 * (i % 3);
      wq(b, su - ss, su + ss, sy - ss, sy + ss, 0.056,
        i % 4 === 0 ? CX.gold : i % 4 === 1 ? CX.ice : CX.white, i % 3 === 0 ? MX.starHi : MX.star);
    }
    for (let i = 0; i < 9; i++) {
      const su = -16.4 + i * 4.1;
      const pairs = [[-1.5, 0.20], [1.4, 0.36], [0.3, 0.75]];
      const pp = pairs.map(([du, dy]) => [su + du, 11.60 + dy]);
      wlin(b, pp[0][0], pp[0][1], pp[1][0], pp[1][1], 0.020, 0.058, GOLD, MX.goldD);
      wlin(b, pp[1][0], pp[1][1], pp[2][0], pp[2][1], 0.020, 0.058, GOLD, MX.goldD);
    }
    bx(b, -WU, WU, 12.94, 13.12, -0.02, 0.24, MARB_HI, MX.marbleHi);
    bx(b, -WU, WU, 13.12, 13.30, -0.02, 0.30, MARB, MX.marble);
    bx(b, -WU, WU, 13.30, 13.44, -0.02, 0.22, GOLD, MX.gold);
    bx(b, -WU, WU, 13.44, SAL.ceil, -0.02, 0.12, mulc(MARB_HI, 0.94), MX.marbleHi);
    for (const c of CURIOS) curioCase(b, c, ctx, R);
    for (const uu of [-14.35, -10.30, -6.45, -2.50, 2.50, 6.45, 10.30, 14.35]) sconce(b, uu, 5.34, ctx);
    suspendedPlanet(b, ctx);
  });
}
// ---------------------------------------------------------------- metrics for the check
export const SALON_COSMOS = {
  room: { ...SAL },
  floorY: FY,
  ceilY: SAL.ceil,
  ceiling: { ...COS_CEIL, fieldGrid: [22, 28], starCount: STAR_N, cloudCount: CEIL_CLOUDS.length, clouds: CEIL_CLOUDS },
  wall: { x: SAL.x0, cz: SAL.cz, halfLen: (SAL.z1 - SAL.z0) / 2, deckY: COS_DECK, maxDepth: 0.90 },
  hues: [CX.rose, CX.teal, CX.magenta, CX.gold, CX.violet, CX.cyan, CX.amber],
  materialMaxEmissive: 0.19,
};
export const SALON_CURIOS = CURIOS.map((c) => ({
  kind: c.kind, u: c.u, z: SAL.cz - c.u, w: c.w, d: c.d, hood: c.hood,
  baseY: FY, deckY: COS_DECK, frontX: SAL.x0 + c.d + 0.036,
}));


// ============================================================== STAIR HALL
function stairDecor(b, ctx, R) {
  const XL = STH.x0, XR = STH.x1, z0 = STH.z0, z1 = STH.z1;
  // axis carpet from the gallery arch to the foot of the stairs + star medallion
  qYp(b, FY + 0.012, -3.4, 3.4, z0 + 0.05, STAIR.zin + 0.10, RED, MI.carpet);
  for (const s of [-1, 1]) qYp(b, FY + 0.016, s * 3.4 - 0.18, s * 3.4 + 0.18, z0 + 0.05, STAIR.zin + 0.10, GOLD, MI.gold);
  medallion(b, 0, (z0 + STAIR.zin) / 2 + 0.4, FY + 0.022, 2.9, R);
  // ---- the two long walls (faces +-X): pilasters, panels, tapestries, cornice ----
  for (const s of [-1, 1]) {
    const x = s * XR;
    const dir = -s;                                  // inward direction
    wallFrameX(b, x, STH.cz, dir, () => {
      for (let i = 0; i < 5; i++) {
        pilasterZ(b, -10.8 + i * 5.4, FY + 1.2, 16.6, 0, 0.66, 0.28, 1, MARB, MI.marb);
      }
      for (let i = 0; i < 4; i++) {
        const a = -8.1 + i * 5.4;
        panelZ(b, a, a + 3.0, 12.9, 16.0, 0, 1, mulc(WALL, 1.04));
      }
      dadoZ(b, -10.9, 10.9, FY, 1.2, 0, 1, MARB_SH, MARB);
      corniceZ(b, -10.9, 10.9, 16.9, 0, 1, MARB_HI);
      tapestryZ(b, -5.4, 12.9, 16.2, 3.4, 0, BLUE, GOLD);
      tapestryZ(b, 5.4, 12.9, 16.2, 3.4, 0, BLUE, GOLD);
    });
  }
  // ---- gold ribs + painted coffer fields along the vault crown ----
  for (let j = 0; j <= 10; j += 2) {
    const zz = z0 + ((z1 - z0) * j) / 10;
    for (const s of [-1, 1]) {
      const t = s > 0 ? 0.34 : 0.66;
      const xa = Math.cos(t * Math.PI) * XR;
      bx(b, xa - 0.16, xa + 0.16, 17.0 + Math.sin(t * Math.PI) * 4.72, 17.0 + Math.sin(t * Math.PI) * 5.02,
        zz - 0.16, zz + 0.16, GOLD, MI.gold);
    }
  }
  // ---- one huge chandelier on the axis + two small ones at the stair foot ----
  chandelier(b, 0, 13.0, STH.cz, 2.0, STH.ceil);
  if (ctx.lanterns) ctx.lanterns.push({ p: [0, 13.2, STH.cz], size: 5.0, rot: 0, alpha: 0.46, shape: 1, col: mixc(C.sunGlow, GOLD_HI, 0.5) });
  for (const s of [-1, 1]) {
    chandelier(b, s * 6.4, 9.6, z0 + 1.6, 0.9, 13.2);
    if (ctx.lanterns) ctx.lanterns.push({ p: [s * 6.4, 9.7, z0 + 1.6], size: 2.2, rot: 0, alpha: 0.36, shape: 1, col: mixc(C.sunGlow, GOLD_HI, 0.5) });
  }
  // ---- statues + urns on the mezzanine landing and at the stair foot ----
  for (const s of [-1, 1]) {
    pedestal(b, s * 4.0, STH.mezz, STH.z1 - 0.95, 1.3, 0.85, 1.2, MARB);
    figure(b, s * 4.0, STH.mezz + 0.85, STH.z1 - 0.95, 1.45, 0, MARB_HI, MI.marb);
    flowerUrn(b, s * 7.6, STH.mezz, STH.z1 - 0.95, 1.1, s > 0 ? 2 : 5);
    pedestal(b, s * 8.4, FY, STAIR.zin - 1.2, 1.3, 0.9, 1.3, MARB);
    figure(b, s * 8.4, FY + 0.9, STAIR.zin - 1.2, 1.5, 0, MARB_HI, MI.marb);
    flowerUrn(b, s * 5.6, FY, STAIR.zin - 1.0, 1.15, s > 0 ? 4 : 1);
  }
  for (const s of [-1, 1]) candelabrum(b, s * 4.6, FY, STAIR.zin - 2.2, 1.6);
  // side drapes under the vault springing (inside the wall frames)
  for (const s of [-1, 1]) {
    wallFrameX(b, s * XR, STH.cz, -s, () => {
      curtainZ(b, -2.4, -1.6, 13.2, 16.8, 0, BLUE, 3);
      curtainZ(b, 1.6, 2.4, 13.2, 16.8, 0, BLUE, 3);
    });
  }
  void ctx; void R;
}

// ============================================================== WINTER GARDEN
function gardenDecor(b, ctx, R) {
  const x0 = GAR.x0, x1 = GAR.x1, z0 = GAR.z0, z1 = GAR.z1;
  // ---- central mosaic and a fountain just off the sight line ----
  medallion(b, 0, GAR.cz, FY + 0.02, 3.6, R);
  fountain(b, -5.7, FY, GAR.cz, 1.72, 1.0, ctx);
  // flower urns on the far side of the fountain only (never in the centre column)
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    const px = -5.7 + Math.cos(a) * 3.1, pz = GAR.cz + Math.sin(a) * 3.1;
    if (px > -3.9 || px < x0 + 1.2 || pz > z1 - 1.2 || pz < z0 + 1.2) continue;
    flowerUrn(b, px, FY, pz, 0.95, i);
  }
  // ---- palms + tree ferns ----
  const palms = [[-8.1, z0 + 1.7, 4.9, 0.92], [-8.1, z1 - 1.7, 5.1, 0.88], [8.1, z0 + 1.7, 4.7, 0.90], [8.1, z1 - 1.7, 5.0, 0.86]];
  for (const [px, pz, h, s] of palms) palm(b, px, FY, pz, h, s, R);
  for (const [px, pz] of [[-5.8, z0 + 1.6], [5.8, z0 + 1.6], [-5.8, z1 - 1.6], [5.8, z1 - 1.6], [6.9, GAR.cz], [-9.6, GAR.cz]]) {
    fern(b, px, FY, pz, 1.1, R);
  }
  for (const [px, pz, sd] of [[-2.6, z0 + 1.1, 1], [2.6, z0 + 1.1, 2], [-2.6, z1 - 1.1, 3], [2.6, z1 - 1.1, 4]]) {
    flowerUrn(b, px, FY, pz, 1.05, sd);
  }
  // hanging baskets from the glazed vault
  for (const [px, pz] of [[-3.4, z0 + 3.0], [3.4, z0 + 3.0], [-3.4, z1 - 3.0], [3.4, z1 - 3.0]]) {
    hangingBasket(b, px, 11.4, pz, 1.0);
  }
  // ---- the two long walls: pilasters, panelled bays, a cornice ----
  for (const s of [-1, 1]) {
    wallFrameX(b, s > 0 ? x1 : x0, GAR.cz, -s, () => {
      for (let i = 0; i < 5; i++) pilasterZ(b, -5.6 + i * 2.8, FY + 1.1, 12.4, 0, 0.50, 0.24, 1, MARB, MI.marb);
      for (let i = 0; i < 4; i++) panelZ(b, -4.2 + i * 2.8, -2.2 + i * 2.8, 2.6, 5.6, 0, 1, mulc(WALL, 1.05));
      for (let i = 0; i < 4; i++) panelZ(b, -4.2 + i * 2.8, -2.2 + i * 2.8, 6.2, 9.2, 0, 1, mulc(WALL, 1.05));
      dadoZ(b, -5.8, 5.8, FY, 1.1, 0, 1, MARB_SH, MARB);
      corniceZ(b, -5.8, 5.8, 12.6, 0, 1, MARB_HI);
    });
  }
  // ---- climbing vines, benches, a bird cage, a reading table ----
  for (const s of [-1, 1]) {
    const x = s > 0 ? x1 : x0;
    // a row of tall gilt planters along the wall instead of loose foliage
    for (const zz of [z0 + 2.4, z1 - 2.4]) {
      flowerUrn(b, x - s * 0.75, FY, zz, 1.15, s > 0 ? 2 : 4);
      tubTree(b, x - s * 0.85, FY, (z0 + z1) / 2 + (s > 0 ? 1.0 : -1.0), 0.85);
    }
    bench(b, s * 8.0, FY + 0.42, z0 + 3.0, 2.6);
    bench(b, s * 8.0, FY + 0.42, z1 - 3.0, 2.6);
  }
  birdcage(b, 6.4, FY + 1.05, z1 - 2.4, 1.0);
  bx(b, 6.1, 6.7, FY, FY + 1.05, z1 - 2.7, z1 - 2.1, MARB_SH, MI.marb, { topCol: MARB });
  table(b, -6.2, FY, z1 - 2.6, 0.8, 0.72);
  candelabrum(b, -6.2, FY + 0.82, z1 - 2.6, 0.7);
  if (ctx && ctx.lanterns) {
    for (const [px, pz] of [[-8.3, z0 + 1.9], [8.3, z1 - 1.9], [-5.7, GAR.cz]]) {
      ctx.lanterns.push({ p: [px, 2.0, pz], size: 1.5, rot: 0, alpha: 0.26, shape: 1, col: mixc(C.cloudLit, C.glass, 0.5) });
    }
  }
  void R;
}

// ============================================================== ROYAL STUDY
function studyDecor(b, ctx, R) {
  const x0 = STD.x0, x1 = STD.x1, z0 = STD.z0, z1 = STD.z1, cz = STD.cz, cx = STD.cx;
  // ---- three book walls: west (+X), south (-Z), east (-X, split by the fireplace) ----
  bookcaseX(b, z0 + 0.6, z1 - 0.6, FY + 0.18, 11.3, x0, 1, R);
  bookcaseZ(b, x0 + 0.4, x1 - 0.4, FY + 0.18, 11.3, z1 - 0.50, R);
  bookcaseX(b, z0 + 0.6, cz - 2.6, FY + 0.18, 11.3, x1, -1, R);
  bookcaseX(b, cz + 2.6, z1 - 0.6, FY + 0.18, 11.3, x1, -1, R);
  at(b, x1, 0, STD.cz, -Math.PI / 2, () => fireplaceZ(b, 0, FY, 2.6, 2.2, 0, ctx));
  // cornice over the book walls
  corniceZ(b, x0 + 0.2, x1 - 0.2, 12.0, z1, -1, MARB_HI);
  wallFrameX(b, x0, STD.cz, 1, () => corniceZ(b, -17.6, 17.6, 12.0, 0, 1, MARB_HI));
  wallFrameX(b, x1, STD.cz, -1, () => corniceZ(b, -17.6, 17.6, 12.0, 0, 1, MARB_HI));
  // ---- north side: the gallery arcade; pilasters + panels between the arches ----
  for (const [a, c] of [...ARCS_W, [ARCS_W[2][1], -12.15]]) {
    pilasterZ(b, (a + c) / 2, FY + 1.3, 11.8, z0, 0.7, 0.28, 1, MARB, MI.marb);
  }
  for (const [a, c] of ARCS_W) {
    panelZ(b, a + 0.34, a + (c - a) / 2 - 0.30, 8.4, 11.3, z0, 1, mulc(WALL, 1.05));
    panelZ(b, a + (c - a) / 2 + 0.30, c - 0.34, 8.4, 11.3, z0, 1, mulc(WALL, 1.05));
  }
  dadoZ(b, x0 + 0.3, x1 - 0.3, FY, 1.2, z0, 1, MARB_SH, MARB);
  corniceZ(b, x0 + 0.3, x1 - 0.3, 11.9, z0, 1, MARB_HI);
  // ---- furniture: the great desk, chair, globes, armchairs, ladder ----
  bx(b, -38.8, -31.4, FY, FY + 0.14, 148.6, 152.2, mulc(WOOD, 0.92), MI.wood, { topCol: mulc(WOOD, 1.08) });
  desk(b, -35.2, FY + 0.16, 150.2, 4.6, 2.0);
  chair(b, -35.2, FY + 0.16, 152.0, Math.PI);
  globe(b, -32.4, FY, 146.4, 1.15);
  globe(b, -32.4, FY, 155.6, 1.0);
  armchair(b, x1 - 2.2, FY, cz - 1.6, Math.PI / 2);
  armchair(b, x1 - 2.2, FY, cz + 1.6, Math.PI / 2);
  table(b, x1 - 3.6, FY, cz, 0.9);
  ladder(b, -36.2, FY, z1 - 0.9, 8.6, 1.3);
  for (const [px, pz, n] of [[-16.6, z1 - 2.0, 4], [-15.4, z1 - 2.1, 3], [-33.0, 143.6, 3]]) {
    for (let k = 0; k < n; k++) {
      bx(b, px - 0.34, px + 0.34, FY + k * 0.12, FY + 0.12 + k * 0.12, pz - 0.24, pz + 0.24,
        [RED, BLUE, LEAF_D, WOOD][(k + 1) % 4], MI.book);
    }
  }
  candelabrum(b, -30.4, FY, 146.2, 1.3);
  candelabrum(b, -30.4, FY, 154.4, 1.3);
  // a long wine carpet on the room axis + low reading tables off the sight line
  qYp(b, FY + 0.012, -33.0, -17.4, 146.0, 164.0, mulc(mixc(C.bloomRed, C.slateDark, 0.60), 0.56), MI.carpet);
  for (const s of [-1, 1]) {
    qYp(b, FY + 0.016, s > 0 ? -17.4 - 0.18 : -33.0, s > 0 ? -17.4 : -33.0 + 0.18, 146.0, 164.0, GOLD, MI.gold);
  }
  for (const [px, pz] of [[-30.8, 158.6], [-20.2, 149.6]]) {
    bx(b, px - 1.5, px + 1.5, FY + 0.62, FY + 0.74, pz - 0.9, pz + 0.9, WOOD, MI.wood, { topCol: mulc(WOOD, 1.1) });
    for (const sx of [-1, 1]) bx(b, px + sx * 1.3 - 0.08, px + sx * 1.3 + 0.08, FY, FY + 0.62, pz - 0.8, pz - 0.64, WOOD_D, MI.woodD);
    for (const sx of [-1, 1]) bx(b, px + sx * 1.3 - 0.08, px + sx * 1.3 + 0.08, FY, FY + 0.62, pz + 0.64, pz + 0.8, WOOD_D, MI.woodD);
    bx(b, px - 0.5, px + 0.2, FY + 0.74, FY + 0.78, pz - 0.3, pz + 0.3, mulc(C.cloudLit, 0.94), MI.cloth);
    for (let k = 0; k < 3; k++) bx(b, px + 0.5, px + 1.1, FY + 0.74 + k * 0.07, FY + 0.80 + k * 0.07, pz - 0.4, pz + 0.4, [RED, BLUE, LEAF_D][k], MI.book);
    chair(b, px - 1.9, FY, pz, -Math.PI / 2);
  }
  for (const [px, pz] of [[-14.2, 139.4], [-14.2, 170.2], [-38.4, 168.4]]) tubTree(b, px, FY, pz, 1.0);
  if (ctx && ctx.lanterns) {
    ctx.lanterns.push({ p: [-35.2, 1.5, 150.6], size: 1.5, rot: 0, alpha: 0.40, shape: 1, col: mixc(C.sunGlow, GOLD_HI, 0.5) });
    ctx.lanterns.push({ p: [x1 - 0.7, 1.6, cz], size: 1.6, rot: 0, alpha: 0.34, shape: 1, col: mixc(C.koiGold, C.sunGlow, 0.5) });
    for (const px of [-34.4, -18.2]) ctx.lanterns.push({ p: [px, 7.6, z0 + 1.2], size: 1.3, rot: 0, alpha: 0.34, shape: 1, col: mixc(C.sunGlow, GOLD_HI, 0.5) });
  }
  // ---- the red-and-gold coffered ceiling ----
  const REDC = mulc(mixc(C.bloomRed, C.slateDark, 0.42), 0.72);
  coffersY(b, x0, x1, z0, z1, STD.ceil, 7, 9, REDC, GOLD, GOLD_HI, MI.red, MI.gold);
  void R;
}

// ============================================================== MUSIC SALON
function salonDecor(b, ctx, R) {
  const x0 = SAL.x0, x1 = SAL.x1, z0 = SAL.z0, z1 = SAL.z1, cz = SAL.cz, cx = SAL.cx;
  // ---- parquet dance floor medallion + carpet borders ----
  medallion(b, cx, cz, FY + 0.02, 6.0, R);
  for (const s of [-1, 1]) {
    qYp(b, FY + 0.012, cx - 7.4, cx + 7.4, cz + s * 6.6, cz + s * 10.4, mulc(mixc(C.bloomRed, C.slateDark, 0.5), 0.66), MI.carpet);
  }
  // ---- east wall (faces -X): four tall lit windows + mirrors between ----
  wallFrameX(b, x1, SAL.cz, -1, () => {
    for (let i = 0; i < 4; i++) {
      const lz = -13.2 + i * 8.8;
      windowZ(b, lz, 2.0, 2.4, 9.0, 0.04, mixc(GLASS_W, GOLD, 0.24), MARB_HI, { seg: 10, dir: 1 });
      curtainZ(b, lz - 3.4, lz - 2.6, 1.6, 10.4, -0.34, VELVET, 3);
      curtainZ(b, lz + 2.6, lz + 3.4, 1.6, 10.4, -0.34, VELVET, 3);
      if (i < 3) pierMirrorZ(b, lz + 4.4, 2.2, 2.4, 10.2, 0, 1);
    }
    dadoZ(b, -17.4, 17.4, FY, 1.3, 0, 1, MARB_SH, MARB);
    corniceZ(b, -17.4, 17.4, SAL.ceil, 0, 1, MARB_HI);
  });
  // ---- south wall (faces -Z): two lit windows + a great mirror + curtains ----
  for (const wcx of [cx - 7.6, cx + 7.6]) {
    windowZ(b, wcx, 2.0, 2.3, 9.6, z1 - 0.10, mixc(GLASS_W, C.sunGlow, 0.42), MARB_HI, { seg: 10 });
    curtainZ(b, wcx - 3.2, wcx - 2.5, 1.6, 10.8, z1 - 0.38, VELVET, 3);
    curtainZ(b, wcx + 2.5, wcx + 3.2, 1.6, 10.8, z1 - 0.38, VELVET, 3);
  }
  pierMirrorZ(b, cx, 4.6, 2.2, 10.6, z1, -1);
  dadoZ(b, x0 + 0.2, x1 - 0.2, FY, 1.3, z1, -1, MARB_SH, MARB);
  corniceZ(b, x0 + 0.2, x1 - 0.2, SAL.ceil, z1, -1, MARB_HI);
  // ---- north side: pilasters on the arcade piers ----
  for (const [a, c] of [[x0, ARCS_E[0][0]], [ARCS_E[0][1], ARCS_E[1][0]], [ARCS_E[1][1], ARCS_E[2][0]], [ARCS_E[2][1], x1]]) {
    pilasterZ(b, (a + c) / 2, FY + 1.4, 13.2, z0, 0.8, 0.30, 1, MARB, MI.marb);
  }
  // ---- ensemble: grand piano on a dais, two harps, sofas, chairs, tables ----
  bx(b, x0 + 1.0, x0 + 8.6, FY, FY + 0.18, z0 + 1.2, z0 + 7.0, mulc(WOOD, 0.80), MI.wood, { topCol: WOOD });
  piano(b, x0 + 4.6, FY + 0.18, z0 + 3.4, -0.55, 1.15);
  harp(b, x1 - 3.4, FY + 0.30, z0 + 2.6, 1.25, -1.9);
  pedestal(b, x1 - 3.4, FY, z0 + 2.6, 1.5, 0.30, 1.5, MARB);
  harp(b, x0 + 2.6, FY + 0.30, z1 - 3.2, 1.15, 0.6);
  pedestal(b, x0 + 2.6, FY, z1 - 3.2, 1.4, 0.30, 1.4, MARB);
  sofa(b, cx - 9.6, FY, cz, 3.2, Math.PI / 2);
  sofa(b, cx + 9.6, FY, cz, 3.2, -Math.PI / 2);
  sofa(b, cx, FY, z1 - 6.0, 3.6, Math.PI);
  for (const [px, pz, yaw] of [[cx - 11.2, cz - 8.0, 0.6], [cx - 11.2, cz + 8.0, -0.6], [cx + 11.2, cz - 8.0, 2.5], [cx + 11.2, cz + 8.0, -2.5]]) {
    armchair(b, px, FY, pz, yaw);
  }
  for (const [px, pz] of [[cx - 12.4, cz], [cx + 12.4, cz], [cx, cz - 9.0]]) table(b, px, FY, pz, 0.85);
  bx(b, x0 + 3.2, x0 + 6.2, FY + 0.18, FY + 0.66, z0 + 6.6, z0 + 7.2, WOOD, MI.wood, { topCol: mulc(WOOD, 1.1) });
  for (const [px, pz] of [[x0 + 7.6, z0 + 4.2], [x0 + 6.0, z0 + 5.4]]) {
    bx(b, px - 0.05, px + 0.05, FY, FY + 1.0, pz - 0.05, pz + 0.05, GOLD, MI.gold);
    bx(b, px - 0.4, px + 0.4, FY + 1.0, FY + 1.34, pz - 0.05, pz + 0.05, WOOD, MI.wood);
  }
  for (const [px, pz, sd] of [[cx - 3.0, z1 - 2.6, 1], [cx + 3.0, z1 - 2.6, 3], [x0 + 1.7, cz - 10.0, 2], [x1 - 1.7, cz + 10.0, 4]]) {
    flowerUrn(b, px, FY, pz, 1.25, sd);
  }
  // two more conversation groups + gilt consoles along the stair wall
  sofa(b, x0 + 4.2, FY, cz + 2.8, 2.8, Math.PI / 2);
  sofa(b, x1 - 4.2, FY, cz - 2.8, 2.8, -Math.PI / 2);
  for (const [px, pz] of [[x0 + 4.2, cz - 1.8], [x1 - 4.2, cz + 1.8]]) table(b, px, FY, pz, 0.8);
  armchair(b, x0 + 4.0, FY, cz + 6.4, 0.4);
  armchair(b, x1 - 4.0, FY, cz - 6.4, -0.4);
  // console tables along the east wall between the mirrors
  for (const [pz, sd] of [[cz - 13.0, 2], [cz + 13.0, 4]]) {
    bx(b, x1 - 2.6, x1 - 0.42, FY + 0.84, FY + 0.96, pz - 0.55, pz + 0.55, MARB_HI, MI.marbHi, { topCol: MARB });
    bx(b, x1 - 2.5, x1 - 0.45, FY + 0.90, FY + 0.94, pz - 0.57, pz - 0.53, GOLD, MI.gold);
    flowerUrn(b, x1 - 1.5, FY + 0.96, pz, 0.95, sd);
  }
  // wall sconces on the north-arcade piers
  for (const px of [ARCS_E[0][1] + 0.6, ARCS_E[1][1] + 0.6]) {
    bx(b, px - 0.12, px + 0.12, 5.4, 5.66, z0 + 0.30, z0 + 0.62, GOLD, MI.gold);
  }
  for (const [px, pz] of [[x0 + 1.4, z0 + 9.4], [x1 - 1.4, z0 + 9.4], [x0 + 1.4, z1 - 8.8]]) tubTree(b, px, FY, pz, 1.05);
  // ---- the painted star ceiling + three chandeliers ----
  // ---- the coloured cosmos ceiling + the west cabinet wall (round 9) ----
  cosmosCeiling(b, COS_CEIL.x0, COS_CEIL.x1, COS_CEIL.z0, COS_CEIL.z1, COS_CEIL.y, R);
  cosmosWall(b, ctx, R);
  // three lamps against the cabinet wall: a warm wash + two colour accents
  if (ctx && ctx.points) {
    ctx.points.push({ p: [x0 + 2.7, 8.7, cz], col: mixc(C.sunGlow, GOLD_HI, 0.45), range: 22, int: 0.44 });
    ctx.points.push({ p: [x0 + 2.4, 4.4, cz - 8.4], col: mixc(C.glass, C.horizon, 0.35), range: 16, int: 0.30 });
    ctx.points.push({ p: [x0 + 2.4, 4.4, cz + 8.4], col: mixc(C.bloomPink, C.ballLilac, 0.40), range: 16, int: 0.26 });
  }
  for (const pz of [z0 + 5.4, cz, z1 - 5.4]) {
    chandelier(b, cx, 10.2, pz, 1.5, SAL.ceil - 0.1);
    if (ctx.lanterns) ctx.lanterns.push({ p: [cx, 10.4, pz], size: 3.4, rot: 0, alpha: 0.42, shape: 1, col: mixc(C.sunGlow, GOLD_HI, 0.55) });
  }
  if (ctx && ctx.lanterns) {
    for (const px of [x0 + 1.7, ARCS_E[0][1] + 0.7, ARCS_E[1][1] + 0.7, x1 - 1.7]) {
      ctx.lanterns.push({ p: [px, 7.4, z0 + 0.9], size: 1.5, rot: 0, alpha: 0.34, shape: 1, col: mixc(C.sunGlow, GOLD_HI, 0.5) });
    }
  }
  void R;
}

// ============================================================== entry point
export function buildPalaceChambers(b, ctx, rng) {
  b.note && b.note('palaceChambers');
  const R = mulberry32(0x8f31a2c7);       // LOCAL rng — never draws from the shared sequence
  const depth = b.stack.length;
  try {
    shellGallery(b, ctx, R);
    shellStair(b, ctx, R);
    shellGarden(b, ctx, R);
    shellSalon(b, ctx, R);
    shellStudy(b, ctx, R);
    galleryDecor(b, ctx, R);
    stairDecor(b, ctx, R);
    gardenDecor(b, ctx, R);
    studyDecor(b, ctx, R);
    salonDecor(b, ctx, R);
    buildLights(ctx);
  } catch (e) {
    while (b.stack.length > depth) b.pop();
    throw e;
  }
  void rng;
}

// ---------------------------------------------------------------- lights
// Point lights sit on the circulation axis of every room (the renderer keeps the 12
// nearest, so a lamp low in one hall never lights the next one).
function buildLights(ctx) {
  if (!ctx) return;
  const warm = mixc(C.sunGlow, GOLD_HI, 0.40);
  const warmSoft = mixc(C.sunGlow, C.cloudLit, 0.40);
  const cool = mixc(C.horizon, C.glass, 0.45);
  if (ctx.points) {
    const pts = [
      // grand gallery: along the long enfilade
      [-31, 6.4, 130.2, 27, 0.44, warm], [-11, 6.4, 130.2, 27, 0.42, warm],
      [11, 6.4, 130.2, 27, 0.42, warm], [31, 6.4, 130.2, 27, 0.44, warm],
      // stair hall: the two flights + the vault
      [0, 7.2, 143.0, 26, 0.48, warm], [0, 7.2, 156.0, 26, 0.48, warm],
      [0, 15.5, 148.5, 34, 0.44, warmSoft],
      // winter garden court (three so the palms and the fountain all read)
      [-6.0, 6.2, 166.0, 22, 0.46, warmSoft], [5.4, 6.2, 167.2, 22, 0.44, warmSoft], [0, 9.8, 169.0, 24, 0.40, cool],
      // royal study (two bays of the long library)
      [-25.8, 6.4, 146.0, 26, 0.48, warm], [-25.8, 6.4, 164.0, 26, 0.50, warm],
      // music salon (two ends of the ballroom)
      [25.8, 6.8, 146.0, 28, 0.44, warm], [25.8, 6.8, 164.0, 28, 0.44, warm],
      // the three doorways glow from the hall side
      [0, 5.0, 123.6, 20, 0.42, cool],
    ];
    for (const [x, y, z, range, int, col] of pts) ctx.points.push({ p: [x, y, z], col, range, int });
  }
  if (ctx.lanterns) {
    const halos = [
      [-31, 8.4, 130.2, 3.0], [-11, 8.4, 130.2, 3.0], [11, 8.4, 130.2, 3.0], [31, 8.4, 130.2, 3.0],
      [0, 13.0, 148.5, 4.4], [0, 9.6, 167.2, 3.0],
    ];
    for (const [x, y, z, s] of halos) ctx.lanterns.push({ p: [x, y, z], size: s, rot: 0, alpha: 0.48, shape: 1, col: warm });
  }
}

// ---------------------------------------------------------------- metrics
export const CHAMBER_METRICS = {
  floorY: FY,
  void: { x0: -41.0, x1: 41.0, y0: 0, y1: 24.0, z0: 122.4, z1: 174.0 },
  rooms: {
    gallery: { ...GAL },
    stair: { ...STH },
    garden: { ...GAR },
    study: { ...STD },
    salon: { ...SAL },
  },
  centres: ROOM_CENTRES,
  hallCentre: HALL_C,
  doors: D,
  bays: BAYS_ALL,
  gardenArch: GA,
  stair: { ...STAIR, mezz: STH.mezz },
};