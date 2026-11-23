// PALACE ROOMS — round 6: the two luxury theme halls carved out of the palace wings.
// OWNER: agent "palace". Contract: 03-notes/cielo-round6-brief.md section B.
//
// palace.js hollows each wing (src/palace.js wingShell / wingPortal) and calls
// buildWingRooms() at the end of its own pass, so this module needs no entry in
// world.js and never touches the shared rng.
//
//   east wing (x > 0) : the ROYAL LIBRARY
//       gold-framed book walls (two tiers), a mezzanine gallery + bridge, rolling ladders,
//       three reading tables with green lamps, celestial + terrestrial globes, a fireplace
//       with an overmantel mirror, portraits, palms, four chandeliers
//   west wing (x < 0) : the GRAND BANQUET HALL
//       a 16 m table set for 22 with silver chargers, goblets and napkins, high-back chairs,
//       five chandeliers, candelabra and floral centrepieces, tapestries, sideboards, a mirror
//       and fireplace, a music corner (grand piano + harp + stands), wine-red carpet
//
// ---------------------------------------------------------------- coordinate table
// The room is written in a hall-local frame and mirrored into place by buildWingRooms:
//   local X : -8.775 (rotunda-side wall) .. +8.775 (outer wall)
//   local Y : absolute world height (floor 30.36, ceiling 44.0)
//   local Z : -16 = front wall (the z=124 facade) .. +16 = back wall (z=157)
// world placement:  world = (s * (29.725 + X), Y, 141 + Z)   with s = +1 east / -1 west.
// The mirror is a -1 determinant matrix; geo.js derives normals through the same transform,
// so lighting stays correct on both sides (culling is disabled in main.js).
//
// Entrance: a real arched hole in the front wall (7.6 m wide, springing y=37.2, apex 41.0)
// with the exterior portal and threshold steps built by palace.js. The room-side surround,
// the reveal and the folded-open gilded door leaves live here.
//
// The shell's floor / walls / ceiling are built by palace.js; every visible surface is
// re-lined here (0.12 m proud) so the raw shell never shows through.
//
// Budget: 100k..220k tris, deterministic (local mulberry32).
import { PC } from './palace-plan.js';
import { C } from './palette.js';
import { box, cylinder, lathe, mulc, mixc, bar3, torus } from './geo.js';
import { ellipsoid, tubePath } from './lib3d.js';
import { mulberry32, TAU } from './math.js';

// ---------------------------------------------------------------- room shell constants
// palace.js imports these: the two files must stay in step.
export const ROOM = {
  floorY: 30.36,       // top of the structural floor slab
  ceilY: 44.0,         // room ceiling (structural slab 44..46 above)
  xIn: 20.95,          // rotunda-side wall face (east; mirrored for west)
  xOut: 38.5,          // outer wall face
  zFront: 125.0,       // inner face of the front wall (facade plane is 124)
  zBack: 157.0,        // inner face of the back wall
  cx: 29.725,          // room centre |x|
  cz: 141.0,           // room centre z
  hx: 8.775,           // half width  (xOut - xIn) / 2
  hz: 16.0,            // half depth  (zBack - zFront) / 2
  door: { cx: 29.5, hw: 3.8, springY: 37.2, apexY: 41.0, z0: 124.0, z1: 125.0 },
  seed: 0x9a1ace,
};

// hall-local bounds
const X0 = -ROOM.hx, X1 = ROOM.hx, Z0 = -ROOM.hz, Z1 = ROOM.hz;
const FY = ROOM.floorY, CY = ROOM.ceilY;
const W = ROOM.hx - 0.12;          // wall lining plane |x|
const ZF = Z0 + 0.12;              // front wall lining plane
const ZB = Z1 - 0.12;              // back wall lining plane
const DX = ROOM.door.cx - ROOM.cx; // door centre in local x (-0.225)
const DHW = ROOM.door.hw, DSY = ROOM.door.springY, DAP = ROOM.door.apexY;
const GALY = FY + 5.64;            // library mezzanine floor (36.0)

// ---------------------------------------------------------------- palette
const GOLD = PC.gold, GOLD_HI = PC.goldHi;
const MARBLE = PC.marble, MARBLE_HI = PC.marbleHi, MARBLE_SH = PC.marbleSh;
const WALL = mulc(mixc(PC.hallWall, C.sunGlow, 0.32), 0.82);
const WALL_HI = mulc(mixc(PC.hallWallHi, C.sunGlow, 0.44), 0.88);
const WALL_SH = mulc(mixc(C.stoneWarm, C.stoneDark, 0.30), 0.74);
const DARK = mulc(mixc(C.slateDark, C.stoneWarm, 0.22), 0.56);
const WOOD = mulc(mixc(C.bronze, C.stoneDark, 0.34), 0.86);
const WOOD_D = mulc(WOOD, 0.66);
const WOOD_R = mulc(mixc(C.trainRed, C.bronze, 0.50), 0.78);
const GREEN = mulc(mixc(C.leaf, C.leafDark, 0.38), 0.84);
const GREEN_D = mulc(mixc(C.leafDark, C.iron, 0.18), 0.76);
const BLUE = mulc(mixc(C.slateDark, C.stoneCool, 0.22), 0.74);
const RED = mulc(mixc(C.bloomRed, C.slateDark, 0.34), 0.82);
const RED_HI = mixc(RED, C.bloomRed, 0.24);
const CREAM = mixc(PC.marbleHi, C.sunGlow, 0.14);
const IVORY = mixc(C.stonePale, C.sunGlow, 0.14);
const GLOW = mixc(C.sunGlow, C.cloudLit, 0.30);
const GLOW_W = mixc(C.sunGlow, C.cloudLit, 0.62);
const SKY = mixc(C.glass, C.horizon, 0.28);
const SKY_HI = mixc(C.glass, C.skyMid, 0.42);
const LEAF = PC.leaf, LEAF_L = PC.leafL, LEAF_D = PC.leafD;
const SILVER = mixc(mixc(PC.glowSky, C.slate, 0.40), C.cloudLit, 0.24);
const PAINT = [mixc(C.skyMid, C.horizon, 0.52), mixc(C.lawn, LEAF_D, 0.40), mixc(C.gold, C.sunGlow, 0.28),
  mixc(C.stoneDark, C.trainRed, 0.34), mixc(C.slateDark, C.slate, 0.5), mixc(C.bloomPink, C.sunGlow, 0.30)];
const BLOOM = [C.bloomPink, C.bloomRed, C.bloomYellow, C.bloomWhite, C.bloomBlue, C.ballCoral];

// ---------------------------------------------------------------- materials [emissive, gloss]
const M_WALL = [0.105, 0.10], M_WALL_HI = [0.135, 0.14];
const M_MARBLE = [0.100, 0.22], M_MARBLE_HI = [0.120, 0.28], M_MARBLE_SH = [0.080, 0.16];
const M_GOLD = [0.110, 0.88], M_GOLD_HI = [0.150, 0.92], M_GOLD_D = [0.070, 0.58];
const M_WOOD = [0.062, 0.26], M_WOOD_D = [0.040, 0.18];
const M_CLOTH = [0.022, 0.05], M_VELVET = [0.032, 0.06];
const M_CARPET = [0.042, 0.03], M_CARPET_HI = [0.052, 0.04];
const M_PAINT = [0.080, 0.12];
const M_SKY = [0.30, 0.34];
const M_GLOW = [0.88, 0.00];
const M_WARM = [0.56, 0.10];
const M_MIRROR = [0.10, 0.94];
const M_LEAF = [0.030, 0.10];
const M_SILVER = [0.110, 0.62];
const M_DARK = [0.045, 0.10];
const M_BOOK = [0.050, 0.06];
const M_WINE = [0.060, 0.30];

// ---------------------------------------------------------------- transform helpers
// same convention as palace-plan.js / palace-salon.js:
// local +X = (cos,0,sin), local +Z = (-sin,0,cos)
function mtr(x, y, z, yaw = 0, s = 1) {
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  return [c * s, 0, sn * s, 0, 0, s, 0, 0, -sn * s, 0, c * s, 0, x, y, z, 1];
}
function at(b, x, y, z, yaw, fn) { b.push(mtr(x, y, z, yaw)); fn(); b.pop(); }
function pb(b, x, y, z, sx, sy, sz, col, mat, opts) { at(b, x, y, z, 0, () => box(b, sx, sy, sz, col, mat, opts)); }
function bx(b, x0, x1, y0, y1, z0, z1, col, mat, opts) {
  const xa = Math.min(x0, x1), xb = Math.max(x0, x1);
  const ya = Math.min(y0, y1), yb = Math.max(y0, y1);
  const za = Math.min(z0, z1), zb = Math.max(z0, z1);
  pb(b, (xa + xb) * 0.5, (ya + yb) * 0.5, (za + zb) * 0.5, xb - xa, yb - ya, zb - za, col, mat, opts);
}
const NX = [-1, 0, 0], PX = [1, 0, 0], NZ = [0, 0, -1], PZ = [0, 0, 1], UP = [0, 1, 0], DN = [0, -1, 0];
function ew(b, x, z0, z1, y0, y1, col, mat, N) { b.quad([x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0], col, mat, N); }
function nw(b, z, x0, x1, y0, y1, col, mat, N) { b.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], col, mat, N); }
function fw(b, y, x0, x1, z0, z1, col, mat, N) { b.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], col, mat, N || UP); }
function faceYaw(dx, dz) { return Math.atan2(-dx, dz); }
const deg = (d) => (d * Math.PI) / 180;
function patera(b, r, z, col, mat) {
  const seg = 8;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    b.tri([0, 0, z], [Math.cos(a0) * r, Math.sin(a0) * r, z], [Math.cos(a1) * r, Math.sin(a1) * r, z], i % 2 ? col : mulc(col, 0.92), mat, PZ, PZ, PZ);
  }
}
function GOLD_D() { return mixc(GOLD, C.bronze, 0.44); }
// flat rosette lying in the XZ plane, facing down (ceiling coffers)
function rosetteDown(b, x, y, z, r, rays) {
  const seg = Math.max(8, rays || 10);
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    b.tri([x, y, z], [x + Math.cos(a0) * r, y, z + Math.sin(a0) * r], [x + Math.cos(a1) * r, y, z + Math.sin(a1) * r], i % 2 ? GOLD : GOLD_HI, M_GOLD, DN, DN, DN);
  }
  const nr = 8;
  for (let i = 0; i < nr; i++) {
    const a = (i / nr) * TAU;
    const ca = Math.cos(a), sa = Math.sin(a), w = 0.10 * r;
    b.quad([x + ca * r * 1.1 - sa * w, y, z + sa * r * 1.1 + ca * w], [x + ca * r * 1.1 + sa * w, y, z + sa * r * 1.1 - ca * w],
      [x + ca * r * 1.9 + sa * w * 0.4, y, z + sa * r * 1.9 - ca * w * 0.4], [x + ca * r * 1.9 - sa * w * 0.4, y, z + sa * r * 1.9 + ca * w * 0.4], GOLD_HI, M_GOLD, DN);
  }
}

// ---------------------------------------------------------------- light collectors
const LIGHTS = [];
function point(x, y, z, col, range, int) { LIGHTS.push({ kind: 0, p: [x, y, z], col, range, int }); }
function lantern(x, y, z, size, alpha, col, shape) { LIGHTS.push({ kind: 1, p: [x, y, z], size, alpha, col, shape: shape == null ? 1 : shape }); }

// ================================================================ shell dress
function shellDress(b) {
  // ---- floor: warm marble field inside a parquet border
  const FLOOR_A = mulc(mixc(MARBLE, C.sunGlow, 0.20), 0.80);
  const FLOOR_B = mulc(mixc(PC.floorB, C.stoneWarm, 0.30), 0.68);
  for (const s of [-1, 1]) {
    const xb0 = s > 0 ? 6.4 : X0 + 0.12, xb1 = s > 0 ? X1 - 0.12 : -6.4;
    fw(b, FY + 0.004, xb0, xb1, ZF, ZB, mulc(WOOD, 1.06), M_WOOD, UP);
    // parquet battens
    const nb = 8;
    for (let i = 0; i < nb; i++) {
      const t0 = xb0 + ((xb1 - xb0) * i) / nb, t1 = xb0 + ((xb1 - xb0) * (i + 1)) / nb;
      fw(b, FY + 0.007, t0 + 0.03, t1 - 0.03, ZF + 0.25, ZB - 0.25, mulc(WOOD, i % 2 ? 0.94 : 1.10), M_WOOD, UP);
    }
  }
  const NXSEG = 10, NZSEG = 18;
  for (let i = 0; i < NXSEG; i++) {
    for (let j = 0; j < NZSEG; j++) {
      const xa = -6.4 + (12.8 * i) / NXSEG, xb = -6.4 + (12.8 * (i + 1)) / NXSEG;
      const za = ZF + ((ZB - ZF) * j) / NZSEG, zb = ZF + ((ZB - ZF) * (j + 1)) / NZSEG;
      const tone = 0.965 + 0.075 * (((i * 3 + j * 5) % 5) / 4);
      fw(b, FY + 0.002, xa, xb, za, zb, mulc(FLOOR_A, tone), M_MARBLE, UP);
      if ((i + j) % 5 === 0) fw(b, FY + 0.003, xa + 0.22, xb - 0.22, za + 0.22, zb - 0.22, FLOOR_B, M_MARBLE, UP);
      // gold joint grid
      fw(b, FY + 0.006, xa, xb, za, za + 0.06, GOLD, M_GOLD, UP);
      fw(b, FY + 0.006, xa, xa + 0.06, za, zb, GOLD, M_GOLD, UP);
    }
  }
  // ---- long walls: lining + wainscot + chair rail + panel fields
  for (const s of [-1, 1]) {
    const x = s * W;
    ew(b, x, Z0, Z1, FY, CY, WALL, M_WALL, s > 0 ? NX : PX);
    ew(b, x - s * 0.02, Z0, Z1, FY, FY + 1.18, mulc(WOOD, 1.06), M_WOOD, s > 0 ? NX : PX);
    ew(b, x - s * 0.04, Z0, Z1, FY + 1.18, FY + 1.27, GOLD, M_GOLD, s > 0 ? NX : PX);
    for (let k = 0; k < 5; k++) {
      const zz = Z0 + 0.5 + k * 6.3;
      ew(b, x - s * 0.03, zz, zz + 5.2, FY + 1.45, FY + 1.58, GOLD, M_GOLD, s > 0 ? NX : PX);
      ew(b, x - s * 0.03, zz + 1.05, zz + 1.18, FY + 1.58, FY + 5.6, GOLD, M_GOLD, s > 0 ? NX : PX);
      ew(b, x - s * 0.03, zz + 4.02, zz + 4.15, FY + 1.58, FY + 5.6, GOLD, M_GOLD, s > 0 ? NX : PX);
    }
  }
  // ---- back wall lining
  nw(b, ZB, X0, X1, FY, CY, WALL, M_WALL, NZ);
  // ---- front wall lining with the door arch cut out
  frontLining(b);
  // ---- ceiling: painted coffer grid with gold ribs and rosettes
  const RB = 6, RD = 12;
  const CTRIM = mixc(WALL_SH, GOLD, 0.22);
  const COFFER = mixc(mixc(WALL_HI, SKY_HI, 0.34), C.sunGlow, 0.16);
  for (let i = 0; i <= RB; i++) {
    const x = X0 + ((X1 - X0) * i) / RB;
    bx(b, x - 0.17, x + 0.17, CY - 0.44, CY, Z0, Z1, CTRIM, M_WALL_HI, { topCol: GOLD });
    bx(b, x - 0.06, x + 0.06, CY - 0.47, CY - 0.42, Z0, Z1, GOLD, M_GOLD);
  }
  for (let j = 0; j <= RD; j++) {
    const z = Z0 + ((Z1 - Z0) * j) / RD;
    bx(b, X0, X1, CY - 0.40, CY, z - 0.13, z + 0.13, CTRIM, M_WALL_HI, { topCol: GOLD });
  }
  fw(b, CY - 0.01, X0, X1, Z0, Z1, mulc(WALL_HI, 0.94), M_WALL_HI, DN);
  for (let i = 0; i < RB; i++) {
    for (let j = 0; j < RD; j++) {
      const xa = X0 + ((X1 - X0) * i) / RB + 0.20, xb = X0 + ((X1 - X0) * (i + 1)) / RB - 0.20;
      const za = Z0 + ((Z1 - Z0) * j) / RD + 0.18, zb = Z0 + ((Z1 - Z0) * (j + 1)) / RD - 0.18;
      const tone = 0.92 + 0.12 * (((i * 3 + j * 5) % 7) / 6);
      fw(b, CY - 0.03, xa, xb, za, zb, mulc(COFFER, tone), M_WALL_HI, DN);
      // gold inner border of the coffer
      for (const e of [[xa, za, xb, za], [xa, zb, xb, zb]]) fw(b, CY - 0.05, e[0], e[2], e[1] - 0.02, e[1] + 0.02, GOLD, M_GOLD, DN);
      rosetteDown(b, (xa + xb) * 0.5, CY - 0.06, (za + zb) * 0.5, 0.42, 8);
    }
  }
}

// front wall lining: two panels, the spandrel above the door arch, the reveal, the open leaves
function frontLining(b) {
  nw(b, ZF, X0, DX - DHW, FY, CY, WALL, M_WALL, PZ);
  nw(b, ZF, DX + DHW, X1, FY, CY, WALL, M_WALL, PZ);
  nw(b, ZF, DX - DHW, DX + DHW, DAP, CY, WALL, M_WALL, PZ);
  const N = 14;
  for (let i = 0; i < N; i++) {
    const a0 = (Math.PI * i) / N, a1 = (Math.PI * (i + 1)) / N;
    const p0 = [DX + Math.cos(a0) * DHW, DSY + Math.sin(a0) * DHW];
    const p1 = [DX + Math.cos(a1) * DHW, DSY + Math.sin(a1) * DHW];
    b.quad([p0[0], p0[1], ZF], [p1[0], p1[1], ZF], [p1[0], DAP, ZF], [p0[0], DAP, ZF], WALL, M_WALL, PZ);
    const am = (a0 + a1) * 0.5;
    b.quad([p0[0], p0[1], Z0], [p0[0], p0[1], ZF], [p1[0], p1[1], ZF], [p1[0], p1[1], Z0], MARBLE_SH, M_MARBLE_SH, [-Math.cos(am), -Math.sin(am), 0]);
  }
  for (const s of [-1, 1]) {
    const x = DX + s * DHW;
    b.quad([x, FY, Z0], [x, FY, ZF], [x, DSY, ZF], [x, DSY, Z0], MARBLE, M_MARBLE, [-s, 0, 0]);
    bx(b, DX + s * (DHW - 0.02), DX + s * (DHW + 0.34), FY, DSY + 0.06, ZF - 0.36, ZF + 0.02, MARBLE, M_MARBLE, { topCol: MARBLE_HI });
  }
  // flat marble threshold across the opening
  bx(b, DX - DHW, DX + DHW, FY, FY + 0.035, Z0, Z0 + 0.55, MARBLE_HI, M_MARBLE_HI);
  // room-side archivolt + keystone
  for (let i = 0; i < 12; i++) {
    const a0 = (Math.PI * i) / 12, a1 = (Math.PI * (i + 1)) / 12;
    const q = (r, a) => [DX + Math.cos(a) * r, DSY + Math.sin(a) * r];
    const p00 = q(DHW, a0), p01 = q(DHW, a1), p10 = q(DHW + 0.40, a1), p11 = q(DHW + 0.40, a0);
    b.quad([p00[0], p00[1], ZF + 0.10], [p01[0], p01[1], ZF + 0.10], [p10[0], p10[1], ZF + 0.10], [p11[0], p11[1], ZF + 0.10], GOLD, M_GOLD, PZ);
    const am = (a0 + a1) * 0.5;
    b.quad([p00[0], p00[1], ZF], [p00[0], p00[1], ZF + 0.10], [p11[0], p11[1], ZF + 0.10], [p11[0], p11[1], ZF], MARBLE, M_MARBLE, [-Math.cos(am), -Math.sin(am), 0]);
  }
  bx(b, DX - 0.40, DX + 0.40, DAP - 0.26, DAP + 0.90, ZF - 0.30, ZF + 0.04, MARBLE_HI, M_MARBLE_HI);
  // gilded door leaves folded flat against the lining on both sides of the opening
  for (const s of [-1, 1]) {
    const hx0 = DX + s * (DHW + 0.10);
    const hx1 = hx0 + s * 3.42;
    bx(b, hx0, hx1, FY + 0.02, FY + 6.30, ZF + 0.03, ZF + 0.17, mixc(GOLD, WOOD, 0.24), M_GOLD);
    bx(b, Math.min(hx0, hx1), Math.max(hx0, hx1), FY + 0.02, FY + 6.30, ZF + 0.17, ZF + 0.19, GOLD_HI, M_GOLD_HI);
    for (let k = 0; k < 3; k++) {
      const y0 = FY + 0.42 + k * 1.95;
      bx(b, hx0 + s * 0.20, hx1 - s * 0.20, y0, y0 + 1.65, ZF + 0.19, ZF + 0.23, RED, M_VELVET);
      // gold beading around the velvet panel
      const a0 = Math.min(hx0 + s * 0.16, hx1 - s * 0.16), a1 = Math.max(hx0 + s * 0.16, hx1 - s * 0.16);
      bx(b, a0, a1, y0 - 0.05, y0, ZF + 0.19, ZF + 0.25, GOLD, M_GOLD);
      bx(b, a0, a1, y0 + 1.65, y0 + 1.70, ZF + 0.19, ZF + 0.25, GOLD, M_GOLD);
      bx(b, a0 - 0.02, a0 + 0.02, y0, y0 + 1.65, ZF + 0.19, ZF + 0.25, GOLD, M_GOLD);
      bx(b, a1 - 0.02, a1 + 0.02, y0, y0 + 1.65, ZF + 0.19, ZF + 0.25, GOLD, M_GOLD);
    }
    at(b, (hx0 + hx1) * 0.5, FY + 3.2, ZF + 0.24, 0, () => patera(b, 0.26, 0, GOLD_HI, M_GOLD_HI));
    // door pull
    at(b, hx0 - s * 0.18, FY + 3.3, ZF + 0.28, 0, () => ellipsoid(b, 0.09, 0.16, 0.09, 5, 3, GOLD_HI, M_GOLD_HI));
  }
  // sunburst above the door on the hall side
  at(b, DX, 42.7, ZF + 0.12, 0, () => {
    const seg = 16;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
      const col = i % 2 ? GOLD : GOLD_HI;
      b.tri([0, 0, 0], [Math.cos(a0) * 1.25, Math.sin(a0) * 0.78, 0], [Math.cos(a1) * 1.25, Math.sin(a1) * 0.78, 0], col, M_GOLD, PZ, PZ, PZ);
    }
    b.push(mtr(0, 0, 0.10));
    ellipsoid(b, 0.30, 0.30, 0.16, 7, 4, GOLD_HI, M_GOLD_HI);
    b.pop();
  });
}

// ================================================================ shared kit
// framed painting / portrait. axis 'x': wall plane X=plane (art into the room), 'z': Z=plane
function framedArt(b, axis, plane, c, w, h, y0, R, kind) {
  const du = w / 2, cy = y0 + h / 2;
  const off = plane > 0 ? -1 : 1;
  const N = axis === 'z' ? (plane > 0 ? NZ : PZ) : (plane > 0 ? NX : PX);
  if (axis === 'z') {
    const z = plane + off * 0.02;
    b.quad([c - du, y0, z], [c + du, y0, z], [c + du, y0 + h, z], [c - du, y0 + h, z], mulc(DARK, 1.12), M_PAINT, N);
    b.quad([c - du + 0.14, y0 + h * 0.52, z + off * 0.006], [c + du - 0.14, y0 + h * 0.52, z + off * 0.006],
      [c + du - 0.14, y0 + h - 0.14, z + off * 0.006], [c - du + 0.14, y0 + h - 0.14, z + off * 0.006], PAINT[kind % 6], M_PAINT, N);
    b.quad([c - du + 0.14, y0 + 0.14, z + off * 0.006], [c + du - 0.14, y0 + 0.14, z + off * 0.006],
      [c + du - 0.14, y0 + h * 0.52, z + off * 0.006], [c - du + 0.14, y0 + h * 0.52, z + off * 0.006], mulc(PAINT[(kind + 2) % 6], 0.9), M_PAINT, N);
    at(b, c - du * 0.24, cy, z + off * 0.02, 0, () => ellipsoid(b, w * 0.10, h * 0.14, 0.05, 5, 3, PAINT[(kind + 1) % 6], M_PAINT));
    const fw2 = 0.13, fd = 0.16;
    bx(b, c - du - fw2, c + du + fw2, y0 + h, y0 + h + fw2 * 2, plane + off * 0.02, plane + off * fd, GOLD, M_GOLD);
    bx(b, c - du - fw2, c + du + fw2, y0 - fw2 * 2, y0, plane + off * 0.02, plane + off * fd, GOLD, M_GOLD);
    bx(b, c - du - fw2, c - du, y0, y0 + h, plane + off * 0.02, plane + off * fd, GOLD, M_GOLD);
    bx(b, c + du, c + du + fw2, y0, y0 + h, plane + off * 0.02, plane + off * fd, GOLD, M_GOLD);
    at(b, c, y0 + h + fw2 * 2 + 0.10, plane + off * 0.06, 0, () => patera(b, 0.19, 0, GOLD_HI, M_GOLD_HI));
  } else {
    const x = plane + off * 0.02;
    b.quad([x, y0, c - du], [x, y0, c + du], [x, y0 + h, c + du], [x, y0 + h, c - du], mulc(DARK, 1.12), M_PAINT, N);
    b.quad([x + off * 0.006, y0 + h * 0.52, c - du + 0.14], [x + off * 0.006, y0 + h * 0.52, c + du - 0.14],
      [x + off * 0.006, y0 + h - 0.14, c + du - 0.14], [x + off * 0.006, y0 + h - 0.14, c - du + 0.14], PAINT[kind % 6], M_PAINT, N);
    b.quad([x + off * 0.006, y0 + 0.14, c - du + 0.14], [x + off * 0.006, y0 + 0.14, c + du - 0.14],
      [x + off * 0.006, y0 + h * 0.52, c + du - 0.14], [x + off * 0.006, y0 + h * 0.52, c - du + 0.14], mulc(PAINT[(kind + 2) % 6], 0.9), M_PAINT, N);
    at(b, x + off * 0.02, cy, c, 0, () => ellipsoid(b, 0.05, h * 0.14, w * 0.10, 5, 3, PAINT[(kind + 1) % 6], M_PAINT));
    const fw2 = 0.13, fd = 0.16;
    bx(b, plane + off * 0.02, plane + off * fd, y0 + h, y0 + h + fw2 * 2, c - du - fw2, c + du + fw2, GOLD, M_GOLD);
    bx(b, plane + off * 0.02, plane + off * fd, y0 - fw2 * 2, y0, c - du - fw2, c + du + fw2, GOLD, M_GOLD);
    bx(b, plane + off * 0.02, plane + off * fd, y0, y0 + h, c - du - fw2, c - du, GOLD, M_GOLD);
    bx(b, plane + off * 0.02, plane + off * fd, y0, y0 + h, c + du, c + du + fw2, GOLD, M_GOLD);
    at(b, x + off * 0.06, y0 + h + fw2 * 2 + 0.10, c, 0, () => patera(b, 0.19, 0, GOLD_HI, M_GOLD_HI));
  }
  void R;
}

// gilt-framed mirror on a wall
function mirrorWall(b, axis, plane, c, w, h, y0, R) {
  const off = plane > 0 ? -1 : 1;
  const du = w / 2, cy = y0 + h / 2;
  const N = axis === 'z' ? (plane > 0 ? NZ : PZ) : (plane > 0 ? NX : PX);
  if (axis === 'z') {
    const z = plane + off * 0.03;
    b.quad([c - du, y0, z], [c + du, y0, z], [c + du, y0 + h, z], [c - du, y0 + h, z], mixc(SKY_HI, IVORY, 0.45), M_MIRROR, N);
    // bevel + reflected streak
    b.quad([c - du * 0.62, y0, z + off * 0.005], [c - du * 0.18, y0, z + off * 0.005], [c - du * 0.72, y0 + h, z + off * 0.005], [c - du * 0.95, y0 + h, z + off * 0.005], mixc(CREAM, GLOW, 0.4), M_MIRROR, N);
    bx(b, c - du - 0.15, c + du + 0.15, y0 + h, y0 + h + 0.26, plane + off * 0.02, plane + off * 0.22, GOLD, M_GOLD);
    bx(b, c - du - 0.15, c + du + 0.15, y0 - 0.26, y0, plane + off * 0.02, plane + off * 0.22, GOLD, M_GOLD);
    bx(b, c - du - 0.15, c - du, y0, y0 + h, plane + off * 0.02, plane + off * 0.22, GOLD, M_GOLD);
    bx(b, c + du, c + du + 0.15, y0, y0 + h, plane + off * 0.02, plane + off * 0.22, GOLD, M_GOLD);
    at(b, c, y0 + h + 0.36, plane + off * 0.06, 0, () => patera(b, 0.22, 0, GOLD_HI, M_GOLD_HI));
  } else {
    const x = plane + off * 0.03;
    b.quad([x, y0, c - du], [x, y0, c + du], [x, y0 + h, c + du], [x, y0 + h, c - du], mixc(SKY_HI, IVORY, 0.45), M_MIRROR, N);
    bx(b, plane + off * 0.02, plane + off * 0.22, y0 + h, y0 + h + 0.26, c - du - 0.15, c + du + 0.15, GOLD, M_GOLD);
    bx(b, plane + off * 0.02, plane + off * 0.22, y0 - 0.26, y0, c - du - 0.15, c + du + 0.15, GOLD, M_GOLD);
    bx(b, plane + off * 0.02, plane + off * 0.22, y0, y0 + h, c - du - 0.15, c - du, GOLD, M_GOLD);
    bx(b, plane + off * 0.02, plane + off * 0.22, y0, y0 + h, c + du, c + du + 0.15, GOLD, M_GOLD);
    at(b, x + off * 0.06, y0 + h + 0.36, c, 0, () => patera(b, 0.22, 0, GOLD_HI, M_GOLD_HI));
  }
  void R;
}

// window on a Z wall: pale sky pane + gold mullions + stone surround + sheer curtains
function windowZ(b, zPlane, c, w, y0, y1, archR, sheer) {
  const inward = zPlane > 0 ? -1 : 1;
  const N = inward > 0 ? PZ : NZ;
  const hw = w / 2, ys = y1 - archR;
  const zg = zPlane + inward * 0.03;
  b.quad([c - hw, y0, zg], [c + hw, y0, zg], [c + hw, ys, zg], [c - hw, ys, zg], SKY, M_SKY, N);
  const SEG = 6;
  for (let i = 0; i < SEG; i++) {
    const a0 = (Math.PI * i) / SEG, a1 = (Math.PI * (i + 1)) / SEG;
    b.tri([c, ys, zg], [c + Math.cos(a0) * hw, ys + Math.sin(a0) * archR, zg], [c + Math.cos(a1) * hw, ys + Math.sin(a1) * archR, zg],
      mixc(SKY, SKY_HI, 0.35), M_SKY, N, N, N);
  }
  const zn = zPlane + inward * 0.12;
  bx(b, c - 0.06, c + 0.06, y0, ys, zPlane + inward * 0.04, zn, GOLD, M_GOLD);
  bx(b, c - hw, c + hw, ys - 0.07, ys + 0.07, zPlane + inward * 0.04, zn, GOLD, M_GOLD);
  for (const sx of [-1, 1]) bx(b, c + sx * hw * 0.42 - 0.05, c + sx * hw * 0.42 + 0.05, y0, ys, zPlane + inward * 0.04, zn, GOLD_D(), M_GOLD_D);
  const md = 0.24;
  for (const sx of [-1, 1]) {
    bx(b, c + sx * hw + (sx > 0 ? 0.02 : -0.34), c + sx * hw + (sx > 0 ? 0.34 : -0.02), y0 - 0.12, y1 + 0.10, zPlane, zPlane + inward * md, MARBLE, M_MARBLE, { topCol: MARBLE_HI });
  }
  const NA = 7;
  for (let i = 0; i < NA; i++) {
    const a0 = (Math.PI * i) / NA, a1 = (Math.PI * (i + 1)) / NA;
    const q = (r, a) => [c + Math.cos(a) * r, ys + Math.sin(a) * r];
    const p00 = q(hw + 0.02, a0), p01 = q(hw + 0.02, a1), p10 = q(hw + 0.34, a1), p11 = q(hw + 0.34, a0);
    b.quad([p00[0], p00[1], zPlane + inward * md], [p01[0], p01[1], zPlane + inward * md], [p10[0], p10[1], zPlane + inward * md], [p11[0], p11[1], zPlane + inward * md], MARBLE_HI, M_MARBLE_HI, N);
  }
  bx(b, c - hw - 0.46, c + hw + 0.46, y0 - 0.24, y0 - 0.06, zPlane, zPlane + inward * 0.42, MARBLE_HI, M_MARBLE_HI, { topCol: MARBLE_HI });
  if (sheer !== false) {
    const yy0 = y0 - 0.62, yy1 = ys + archR * 0.30;
    for (const s of [-1, 1]) {
      const xIn = c + s * (hw - 0.12);
      const xOut = c + s * (hw + 0.56);
      for (let k = 0; k < 3; k++) {
        const t0 = k / 3, t1 = (k + 1) / 3;
        const xa = xIn + (xOut - xIn) * t0, xb = xIn + (xOut - xIn) * t1;
        const za = zPlane + inward * (0.24 + 0.06 * Math.sin(t0 * 4.7));
        const zb = zPlane + inward * (0.24 + 0.06 * Math.sin(t1 * 4.7));
        b.quad([xa, yy0, za], [xb, yy0, zb], [xb, yy1, zb], [xa, yy1, za], k % 2 ? CREAM : mulc(CREAM, 0.96), M_CLOTH, N);
      }
    }
    bx(b, c - hw - 0.72, c + hw + 0.72, ys + archR + 0.22, ys + archR + 0.44, zPlane + inward * 0.16, zPlane + inward * 0.44, GOLD, M_GOLD);
  }
}

// hanging chandelier centred at (x,z), top of the chain at yTop
function chandelier(b, x, z, yTop, s) {
  const y0 = yTop - 2.5 * s;
  for (let k = 0; k < 4; k++) {
    const y = yTop - (k + 0.5) * (0.33 * s);
    bx(b, x - 0.035, x + 0.035, y - 0.14 * s, y + 0.14 * s, z - 0.035, z + 0.035, GOLD_D(), M_GOLD);
  }
  at(b, x, y0, z, 0, () => {
    lathe(b, [[0.05, 0.55], [0.16, 0.42], [0.11, 0.12], [0.20, 0.0], [0.11, -0.22], [0.30, -0.44], [0.18, -0.62]], 10, GOLD, M_GOLD);
    torus(b, 1.10 * s, 0.055, 18, 3, GOLD, M_GOLD);
    at(b, 0, 0.66 * s, 0, 0, () => torus(b, 0.62 * s, 0.045, 14, 3, GOLD_HI, M_GOLD_HI));
    const NARM = 8;
    for (let i = 0; i < NARM; i++) {
      const a = (i / NARM) * TAU, ca = Math.cos(a), sa = Math.sin(a);
      tubePath(b, [[ca * 0.16, -0.18, sa * 0.16], [ca * 0.62, -0.30, sa * 0.62], [ca * 1.05, 0.06, sa * 1.05]], () => 0.045 * s, 4, GOLD, M_GOLD, { caps: false });
      at(b, ca * 1.10, 0.06, sa * 1.10, 0, () => {
        cylinder(b, 7, 0.10 * s, 0.075 * s, 0.09 * s, GOLD_HI, M_GOLD_HI, { y0: 0, caps: true });
        cylinder(b, 6, 0.048 * s, 0.044 * s, 0.26 * s, mixc(CREAM, GLOW, 0.3), M_WARM, { y0: 0.09 * s, caps: false });
        at(b, 0, 0.40 * s, 0, 0, () => ellipsoid(b, 0.05, 0.12 * s, 0.05, 4, 2, GLOW_W, M_GLOW));
      });
      at(b, ca * 1.02, -0.20, sa * 1.02, 0, () => ellipsoid(b, 0.055 * s, 0.13 * s, 0.055 * s, 4, 2, mixc(SILVER, GLOW_W, 0.4), M_SILVER));
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.3;
      at(b, Math.cos(a) * 0.58 * s, 0.70 * s, Math.sin(a) * 0.58 * s, 0, () => {
        cylinder(b, 6, 0.038 * s, 0.036 * s, 0.20 * s, mixc(CREAM, GLOW, 0.3), M_WARM, { y0: 0, caps: false });
        at(b, 0, 0.30 * s, 0, 0, () => ellipsoid(b, 0.045, 0.10 * s, 0.045, 4, 2, GLOW_W, M_GLOW));
      });
    }
    at(b, 0, 0.95 * s, 0, 0, () => ellipsoid(b, 0.12 * s, 0.30 * s, 0.12 * s, 5, 3, GOLD_HI, M_GOLD_HI));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      at(b, Math.cos(a) * 0.75 * s, -0.42 * s, Math.sin(a) * 0.75 * s, 0, () => ellipsoid(b, 0.03, 0.20 * s, 0.03, 4, 2, mixc(SILVER, GLOW_W, 0.35), M_SILVER));
    }
  });
  lantern(x, y0 - 0.1 * s, z, 2.1 * s, 0.45, mixc(C.sunGlow, GOLD_HI, 0.35));
}

// gilt wall sconce on a long wall (s = -1 rotunda side, +1 outer); draws facing the room
function wallSconce(b, s) {
  at(b, s * (W - 0.02), 0, 0, s > 0 ? -Math.PI / 2 : Math.PI / 2, () => {
    bx(b, -0.16, 0.16, 0, 0.46, 0, 0.14, GOLD, M_GOLD);
    tubePath(b, [[0, 0.34, 0.10], [0, 0.52, 0.34], [0, 0.66, 0.54]], () => 0.035, 4, GOLD, M_GOLD, { caps: false });
    for (const sx of [-0.26, 0.26]) {
      tubePath(b, [[0, 0.36, 0.12], [sx * 0.55, 0.50, 0.34], [sx, 0.64, 0.50]], () => 0.028, 3, GOLD, M_GOLD, { caps: false });
      at(b, sx, 0.66, 0.50, 0, () => {
        cylinder(b, 6, 0.05, 0.045, 0.20, mixc(CREAM, GLOW, 0.3), M_WARM, { y0: 0, caps: false });
        at(b, 0, 0.28, 0, 0, () => ellipsoid(b, 0.05, 0.10, 0.05, 4, 2, GLOW_W, M_GLOW));
      });
    }
  });
}

// gilded balustrade along X (at z) or along Z (at x)
function railX(b, x0, x1, z, y, h) {
  const len = x1 - x0;
  bx(b, x0, x1, y, y + 0.14, z - 0.10, z + 0.10, MARBLE, M_MARBLE, { topCol: MARBLE_HI });
  bx(b, x0, x1, y + h - 0.10, y + h, z - 0.12, z + 0.12, GOLD, M_GOLD, { topCol: GOLD_HI });
  const n = Math.max(3, Math.round(len / 0.42));
  for (let i = 0; i < n; i++) {
    const x = x0 + ((i + 0.5) / n) * len;
    pb(b, x, y + h * 0.5, z, 0.055, h - 0.14, 0.055, GOLD_D(), M_GOLD_D);
  }
  for (let i = 0; i <= 2; i++) {
    const x = x0 + (len * i) / 2;
    bx(b, x - 0.09, x + 0.09, y, y + h + 0.10, z - 0.11, z + 0.11, GOLD, M_GOLD, { topCol: GOLD_HI });
  }
}
function railZ(b, z0, z1, x, y, h) {
  const len = z1 - z0;
  bx(b, x - 0.10, x + 0.10, y, y + 0.14, z0, z1, MARBLE, M_MARBLE, { topCol: MARBLE_HI });
  bx(b, x - 0.12, x + 0.12, y + h - 0.10, y + h, z0, z1, GOLD, M_GOLD, { topCol: GOLD_HI });
  const n = Math.max(3, Math.round(len / 0.42));
  for (let i = 0; i < n; i++) {
    const z = z0 + ((i + 0.5) / n) * len;
    pb(b, x, y + h * 0.5, z, 0.055, h - 0.14, 0.055, GOLD_D(), M_GOLD_D);
  }
  for (let i = 0; i <= 2; i++) {
    const z = z0 + (len * i) / 2;
    bx(b, x - 0.11, x + 0.11, y, y + h + 0.10, z - 0.09, z + 0.09, GOLD, M_GOLD, { topCol: GOLD_HI });
  }
}

// table: len along X, wid along Z, top at h
function tableB(b, cx, cz, len, wid, h) {
  bx(b, cx - len / 2, cx + len / 2, h - 0.13, h, cz - wid / 2, cz + wid / 2, WOOD, M_WOOD, { topCol: mulc(WOOD, 1.16) });
  bx(b, cx - len / 2 + 0.12, cx + len / 2 - 0.12, h - 0.38, h - 0.13, cz - wid / 2 + 0.10, cz + wid / 2 - 0.10, WOOD_D, M_WOOD_D);
  const legs = Math.max(2, Math.round(len / 1.9));
  for (let i = 0; i <= legs; i++) {
    const x = cx - len / 2 + 0.26 + ((len - 0.52) * i) / legs;
    for (const sz of [-1, 1]) {
      const z = cz + sz * (wid / 2 - 0.26);
      at(b, x, 0.02, z, 0, () => {
        cylinder(b, 8, 0.14, 0.10, h - 0.30, WOOD_D, M_WOOD_D, { y0: 0, caps: true });
        cylinder(b, 8, 0.19, 0.15, 0.16, mulc(WOOD_D, 0.9), M_WOOD_D, { y0: 0.02, caps: true });
      });
    }
  }
  for (const sz of [-1, 1]) bx(b, cx - len / 2, cx + len / 2, h - 0.06, h + 0.02, cz + sz * wid / 2 - 0.03, cz + sz * wid / 2 + 0.03, GOLD, M_GOLD);
}

// high-back chair; local +Z = the direction the sitter faces
function chairB(b, col, hi, tall) {
  const h = tall ? 1.16 : 1.02;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bx(b, sx * 0.31 - 0.05, sx * 0.31 + 0.05, 0.02, 0.46, sz * 0.30 - 0.05, sz * 0.30 + 0.05, WOOD_D, M_WOOD_D);
  bx(b, -0.43, 0.43, 0.42, 0.56, -0.42, 0.40, col, M_VELVET, { topCol: hi });
  for (const sg of [-1, 1]) {
    bx(b, -0.46, 0.46, 0.54, 0.60, sg * 0.42 - 0.035, sg * 0.42 + 0.035, GOLD, M_GOLD);
    bx(b, sg * 0.43 - 0.035, sg * 0.43 + 0.035, 0.54, 0.60, -0.44, 0.42, GOLD, M_GOLD);
  }
  bx(b, -0.37, 0.37, 0.60, h, -0.45, -0.34, col, M_VELVET, { topCol: hi });
  for (const sx of [-1, 1]) bx(b, sx * 0.37 - 0.045, sx * 0.37 + 0.045, 0.58, h + 0.08, -0.47, -0.32, GOLD, M_GOLD);
  bx(b, -0.42, 0.42, h, h + 0.15, -0.48, -0.30, GOLD, M_GOLD);
  at(b, 0, h - 0.36, -0.35, 0, () => patera(b, 0.12, 0, GOLD_HI, M_GOLD_HI));
  for (const sx of [-1, 1]) {
    bx(b, sx * 0.34 - 0.04, sx * 0.34 + 0.04, 0.60, 0.73, -0.30, 0.34, WOOD, M_WOOD);
    bx(b, sx * 0.43 - 0.06, sx * 0.43 + 0.06, 0.73, 0.80, -0.32, 0.34, GOLD, M_GOLD);
    bx(b, sx * 0.43 - 0.05, sx * 0.43 + 0.05, 0.48, 0.73, 0.26, 0.34, GOLD_D(), M_GOLD_D);
  }
  for (let i = 0; i < 3; i++) at(b, -0.20 + i * 0.20, h - 0.68, -0.355, 0, () => ellipsoid(b, 0.04, 0.04, 0.03, 4, 2, GOLD_HI, M_GOLD_HI));
}

// open book lying on a surface at y (local frame: spine along Z)
function openBook(b, x, y, z, yaw, w) {
  at(b, x, y, z, yaw, () => {
    bx(b, -w / 2, 0, 0, 0.05, -w * 0.36, w * 0.36, CREAM, M_CLOTH);
    bx(b, 0, w / 2, 0, 0.05, -w * 0.36, w * 0.36, CREAM, M_CLOTH);
    bx(b, -0.02, 0.02, -0.01, 0.10, -w * 0.36, w * 0.36, RED, M_VELVET);
    for (let i = 0; i < 5; i++) {
      const zz = -w * 0.30 + i * w * 0.14;
      bx(b, -w / 2 + 0.07, -0.04, 0.052, 0.060, zz, zz + 0.02, mulc(CREAM, 0.72), M_CLOTH);
      bx(b, 0.04, w / 2 - 0.07, 0.052, 0.060, zz, zz + 0.02, mulc(CREAM, 0.72), M_CLOTH);
    }
  });
}

// book row along Z on a shelf (spines face +X or -X). dir = +1 or -1 (room direction)
function bookRowZ(b, xSpine, z0, z1, y, R, n, kind) {
  let z = z0;
  for (let i = 0; i < n; i++) {
    const w = 0.055 + R() * 0.075;
    if (z + w > z1) break;
    const h = (kind === 2 ? 0.26 : 0.30) + R() * 0.14;
    const col = BOOKS[(i * 7 + Math.round(R() * 5)) % BOOKS.length];
    const N = xSpine > 0 ? NX : PX;
    b.quad([xSpine, y, z], [xSpine, y, z + w], [xSpine, y + h, z + w], [xSpine, y + h, z], col, M_BOOK, N);
    b.quad([xSpine, y + h, z], [xSpine - (xSpine > 0 ? 0.16 : -0.16), y + h, z], [xSpine - (xSpine > 0 ? 0.16 : -0.16), y + h, z + w], [xSpine, y + h, z + w], mulc(col, 1.12), M_BOOK, UP);
    z += w + 0.004 + R() * 0.012;
  }
}
const BOOKS = [mulc(RED, 0.9), mulc(GREEN, 0.95), mulc(BLUE, 0.95), mulc(WOOD_R, 0.95), mulc(WALL_SH, 0.85),
  mulc(CREAM, 0.86), mulc(mixc(C.slateDark, C.iron, 0.4), 1.0), mulc(mixc(C.bronze, C.gold, 0.2), 0.9),
  mulc(mixc(C.bloomRed, C.stoneDark, 0.4), 0.95), mulc(mixc(C.leafDark, C.stoneDark, 0.35), 0.95)];

// flat ellipse ring / disc on the floor (local frame, facing up), rx/rz scale
function ringFlat(b, r0, r1, y, rz, col, mat) {
  const seg = 20;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    b.quad([c0 * r0, y, s0 * r0 * rz], [c1 * r0, y, s1 * r0 * rz], [c1 * r1, y, s1 * r1 * rz], [c0 * r1, y, s0 * r1 * rz], col, mat, UP);
  }
}
function discFlat(b, r, y, rz, col, mat) {
  const seg = 20;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    b.tri([0, y, 0], [Math.cos(a0) * r, y, Math.sin(a0) * r * rz], [Math.cos(a1) * r, y, Math.sin(a1) * r * rz], col, mat, UP, UP, UP);
  }
}
// potted palm
function palm(b, R, x, z, s) {
  const k = s || 1;
  b.push(mtr(x, FY, z));
  // tub
  lathe(b, [[0.26 * k, 0], [0.34 * k, 0.10 * k], [0.40 * k, 0.52 * k], [0.36 * k, 0.60 * k], [0.40 * k, 0.66 * k]], 10, mixc(WOOD_R, GOLD, 0.25), M_WOOD);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    at(b, Math.cos(a) * 0.34 * k, 0.66 * k, Math.sin(a) * 0.34 * k, 0, () => ellipsoid(b, 0.10 * k, 0.06 * k, 0.10 * k, 4, 2, mixc(WOOD_R, GOLD, 0.4), M_WOOD));
  }
  // trunk + fronds
  at(b, 0, 0.66 * k, 0, 0, () => cylinder(b, 7, 0.16 * k, 0.10 * k, 1.5 * k, mixc(WOOD, LEAF_D, 0.35), M_WOOD_D, { y0: 0, caps: false }));
  const N = 9;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU + R() * 0.4;
    const len = (1.25 + R() * 0.45) * k;
    const y0 = 2.05 * k + R() * 0.25 * k;
    const tip = [Math.cos(a) * len, y0 + (R() - 0.3) * 0.5 * k, Math.sin(a) * len];
    const mid = [Math.cos(a) * len * 0.5, y0 + 0.55 * k, Math.sin(a) * len * 0.5];
    tubePath(b, [[0, y0 - 0.2 * k, 0], mid, tip], () => 0.035 * k, 4, LEAF_D, M_LEAF, { caps: false });
    for (let q = 0; q < 4; q++) {
      const t = 0.30 + q * 0.20;
      const px = mid[0] + (tip[0] - mid[0]) * t, py = mid[1] + (tip[1] - mid[1]) * t, pz = mid[2] + (tip[2] - mid[2]) * t;
      const side = a + Math.PI / 2;
      for (const sg of [-1, 1]) {
        at(b, px, py, pz, side, () => ellipsoid(b, 0.34 * k * (1 - t * 0.4), 0.05 * k, 0.13 * k, 5, 2, sg > 0 ? LEAF : LEAF_L, M_LEAF));
      }
    }
  }
  b.pop();
}

// fireplace with a lit fire, hearth and mantel; local +Z faces the room
function fireplace(b, R, w) {
  const hw = w / 2;
  // surround
  for (const s of [-1, 1]) bx(b, s * (hw - 0.85), s * hw, 0, 2.60, -0.55, 0.10, MARBLE, M_MARBLE, { topCol: MARBLE_HI });
  bx(b, -hw, hw, 2.60, 3.05, -0.62, 0.14, MARBLE_HI, M_MARBLE_HI, { topCol: MARBLE_HI });
  bx(b, -hw - 0.22, hw + 0.22, 3.05, 3.20, -0.72, 0.20, GOLD, M_GOLD);
  // opening + recessed firebox (back / floor / side cheeks only: the cavity stays open)
  const FW0 = -hw + 0.85, FW1 = hw - 0.85;
  bx(b, FW0, FW1, 0, 2.30, -0.56, -0.54, DARK, M_DARK);
  for (const sg of [-1, 1]) bx(b, Math.min(sg * FW0, sg * FW1), Math.max(sg * FW0, sg * FW1), 0, 2.30, -0.54, 0.02, mulc(DARK, 0.9), M_DARK);
  bx(b, FW0, FW1, 0, 0.10, -0.54, 0.10, mulc(DARK, 0.8), M_DARK);
  // fire
  at(b, 0, 0.14, -0.34, 0, () => {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU;
      ellipsoid(b, 0.42 + R() * 0.18, 0.52 + R() * 0.40, 0.22, 5, 3, mixc(C.bloomRed, C.gold, 0.55), M_GLOW);
      at(b, Math.cos(a) * 0.42, 0.06, Math.sin(a) * 0.14, 0, () => ellipsoid(b, 0.30, 0.58, 0.22, 4, 3, mixc(C.gold, C.sunGlow, 0.5), M_GLOW));
    }
    // logs
    for (const [sx, yaw] of [[-0.45, 0.4], [0.40, -0.5]]) {
      at(b, sx * 0.6, 0.06, 0.02, yaw, () => cylinder(b, 6, 0.11, 0.09, 0.85, WOOD_D, M_WOOD_D, { y0: 0, caps: true }));
    }
  });
  // andirons
  for (const s of [-1, 1]) {
    at(b, s * 0.55, 0.06, -0.30, 0, () => {
      lathe(b, [[0.13, 0], [0.05, 0.08], [0.05, 0.34], [0.12, 0.40], [0.04, 0.46]], 6, GOLD, M_GOLD);
    });
  }
  // hearth slab
  bx(b, -hw - 0.30, hw + 0.30, 0, 0.14, 0.10, 0.95, MARBLE_HI, M_MARBLE_HI, { topCol: MARBLE_HI });
  // mantel clock + candles
  bx(b, -0.24, 0.24, 3.20, 3.72, -0.50, -0.10, GOLD, M_GOLD, { topCol: GOLD_HI });
  at(b, 0, 3.46, -0.10, 0, () => patera(b, 0.16, 0, CREAM, M_MARBLE));
  at(b, 0, 3.80, -0.30, 0, () => ellipsoid(b, 0.20, 0.10, 0.18, 5, 3, GOLD_HI, M_GOLD_HI));
  for (const s of [-1, 1]) {
    at(b, s * (hw - 0.45), 3.21, -0.30, 0, () => {
      lathe(b, [[0.13, 0], [0.06, 0.06], [0.05, 0.30], [0.11, 0.38], [0.04, 0.44]], 6, GOLD, M_GOLD);
      at(b, 0, 0.44, 0, 0, () => {
        cylinder(b, 6, 0.04, 0.038, 0.24, mixc(CREAM, GLOW, 0.3), M_WARM, { y0: 0, caps: false });
        at(b, 0, 0.34, 0, 0, () => ellipsoid(b, 0.045, 0.10, 0.045, 4, 2, GLOW_W, M_GLOW));
      });
    });
  }
}

// globe on a turned stand
function globe(b, x, z, R, celestial) {
  at(b, x, FY, z, 0, () => {
    lathe(b, [[0.46, 0], [0.34, 0.06], [0.18, 0.20], [0.14, 0.62], [0.22, 0.70], [0.10, 0.78], [0.10, 0.86]], 9, WOOD_D, M_WOOD_D);
    // meridian ring
    at(b, 0, 1.42, 0, 0, () => torus(b, 0.62, 0.045, 16, 3, GOLD, M_GOLD, 'z'));
    // sphere
    at(b, 0, 1.42, 0, 0, () => {
      const rr = 0.56;
      ellipsoid(b, rr, rr, rr, 12, 7, celestial ? mixc(C.slateDark, C.slate, 0.5) : mixc(C.glass, C.horizon, 0.25), M_MARBLE);
      // land / star patches
      for (let i = 0; i < 14; i++) {
        const a = R() * TAU, v = (R() - 0.5) * 2.2;
        const px = Math.cos(a) * Math.cos(v) * rr, py = Math.sin(v) * rr, pz = Math.sin(a) * Math.cos(v) * rr;
        at(b, px, py, pz, a, () => ellipsoid(b, 0.16 + R() * 0.14, 0.05, 0.13 + R() * 0.10,
          5, 2, celestial ? mixc(C.gold, C.sunGlow, 0.5) : (R() < 0.5 ? mixc(C.leaf, C.leafDark, 0.3) : mixc(C.stoneDark, C.leafDark, 0.3)), M_LEAF));
      }
    });
    // horizon ring
    at(b, 0, 1.42, 0, 0, () => torus(b, 0.86, 0.05, 20, 3, GOLD, M_GOLD));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU;
      at(b, Math.cos(a) * 0.80, 1.42, Math.sin(a) * 0.80, 0, () => cylinder(b, 5, 0.05, 0.04, 0.24, GOLD, M_GOLD, { y0: -0.12, caps: true }));
    }
  });
}

// rolling ladder leaning on a bookcase (local +X = into the room from the wall)
function ladder(b, R, xWall, z, dir) {
  at(b, xWall, FY, z, 0, () => {
    for (const s of [-1, 1]) {
      bar3(b, [0, 0.05, s * 0.30], [dir * 0.72, 5.1, s * 0.22], 0.07, 0.09, WOOD, M_WOOD);
    }
    for (let i = 0; i < 8; i++) {
      const t = (i + 0.6) / 8.6;
      const xx = dir * 0.72 * t, yy = 0.05 + 5.05 * t;
      bx(b, xx - 0.035, xx + 0.035, yy, yy + 0.055, -0.28, 0.28, WOOD, M_WOOD);
    }
    // top hook
    at(b, dir * 0.72, 5.12, 0, 0, () => ellipsoid(b, 0.10, 0.08, 0.10, 5, 3, GOLD, M_GOLD));
  });
  void R;
}

// harp
function harp(b, x, z, yaw) {
  at(b, x, FY, z, yaw, () => {
    bx(b, -0.42, 0.42, 0, 0.22, -0.30, 0.30, WOOD_D, M_WOOD_D);
    // column + neck + pillar
    bar3(b, [0.34, 0.18, 0], [0.40, 2.30, 0], 0.11, 0.11, GOLD, M_GOLD);
    tubePath(b, [[0.40, 2.30, 0], [-0.10, 2.62, 0], [-0.62, 1.20, 0], [-0.46, 0.20, 0]], () => 0.10, 5, WOOD_R, M_WOOD);
    tubePath(b, [[0.40, 2.24, 0], [-0.10, 2.54, 0], [-0.56, 1.20, 0], [-0.42, 0.24, 0]], () => 0.045, 4, GOLD, M_GOLD);
    // strings
    for (let i = 0; i < 12; i++) {
      const t = i / 11;
      bar3(b, [0.36 - t * 0.96, 2.28 - t * 2.02, 0], [-0.44 + t * 0.02, 0.30 + t * 0.02, 0], 0.010, 0.010, mixc(SILVER, GLOW, 0.2), M_SILVER);
    }
  });
}

// grand piano (lid open), local +Z = player side
function piano(b, x, z, yaw) {
  at(b, x, FY, z, yaw, () => {
    // body outline (approximated with a few boxes)
    bx(b, -1.15, 1.15, 0.62, 0.92, -0.95, 0.95, mixc(C.iron, WOOD_D, 0.25), M_WOOD);
    bx(b, -1.10, 1.09, 0.90, 0.94, -0.90, 0.90, mixc(C.iron, C.slateDark, 0.4), M_MIRROR);
    for (let i = 0; i < 3; i++) {
      const sx = -0.85 + i * 0.85;
      at(b, sx, 0.62, 0.60, 0, () => cylinder(b, 6, 0.09, 0.07, 0.62, C.iron, M_MIRROR, { y0: -0.62, caps: true }));
    }
    at(b, 0, 0.30, 0.60, 0, () => cylinder(b, 6, 0.12, 0.10, 0.32, C.iron, M_MIRROR, { y0: 0, caps: true }));
    // keyboard + music desk
    bx(b, -1.05, 1.05, 0.86, 0.98, 0.90, 1.28, CREAM, M_MARBLE);
    for (let i = 0; i < 14; i++) bx(b, -1.0 + i * 0.148, -1.0 + i * 0.148 + 0.035, 0.98, 1.02, 1.02, 1.16, DARK, M_DARK);
    bx(b, -0.70, 0.70, 1.02, 1.34, 1.22, 1.30, WOOD_D, M_WOOD_D);
    openBook(b, 0, 1.35, 1.26, Math.PI, 0.9);
    // raised lid
    at(b, 0, 0.94, -0.10, 0, () => {
      b.quad([-1.10, 0, -0.85], [-1.10, 1.55, -0.30], [1.10, 1.55, -0.30], [1.10, 0, -0.85], mixc(C.iron, C.slateDark, 0.3), M_MIRROR, [0, 0.6, 0.8]);
      b.quad([1.10, 0, -0.85], [1.10, 1.55, -0.30], [1.10, 0.0, -0.20], [1.10, 0, -0.85], mixc(C.iron, C.ironLight, 0.4), M_MIRROR, [1, 0, 0]);
    });
    // bench
    at(b, 0, 0, 1.75, 0, () => {
      bx(b, -0.55, 0.55, 0.44, 0.56, -0.24, 0.24, C.catBlack, M_VELVET);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) bx(b, sx * 0.42 - 0.04, sx * 0.42 + 0.04, 0.0, 0.44, sz * 0.16 - 0.04, sz * 0.16 + 0.04, WOOD_D, M_WOOD_D);
    });
  });
}

// music stand
function musicStand(b, x, z, yaw) {
  at(b, x, FY, z, yaw, () => {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU;
      bar3(b, [0, 0.05, 0], [Math.cos(a) * 0.34, 0.12, Math.sin(a) * 0.34], 0.04, 0.05, C.iron, M_MIRROR);
    }
    bar3(b, [0, 0.10, 0], [0, 1.30, 0], 0.045, 0.05, C.iron, M_MIRROR);
    at(b, 0, 1.32, 0, 0, () => {
      b.quad([-0.36, -0.28, 0], [0.36, -0.28, 0], [0.36, 0.28, 0], [-0.36, 0.28, 0], CREAM, M_CLOTH, PZ);
      bx(b, -0.38, 0.38, -0.30, -0.27, -0.02, 0.03, WOOD_D, M_WOOD_D);
      for (let i = 0; i < 5; i++) bx(b, -0.30, 0.30, -0.20 + i * 0.10, -0.19 + i * 0.10, 0.01, 0.02, mulc(CREAM, 0.7), M_CLOTH);
    });
  });
}

// tapestry hanging on a long wall (s = wall side; z centre)
function tapestry(b, s, zc, w, y0, y1) {
  const x = s * (W - 0.05);
  const hw = w / 2;
  ew(b, x - s * 0.02, zc - hw, zc + hw, y0, y1, mulc(BLUE, 1.05), M_CLOTH, s > 0 ? NX : PX);
  // border
  ew(b, x - s * 0.035, zc - hw, zc + hw, y0, y0 + 0.26, GOLD, M_GOLD, s > 0 ? NX : PX);
  ew(b, x - s * 0.035, zc - hw, zc + hw, y1 - 0.26, y1, GOLD, M_GOLD, s > 0 ? NX : PX);
  for (const sg of [-1, 1]) ew(b, x - s * 0.035, zc + sg * hw - 0.26, zc + sg * hw, y0, y1, GOLD, M_GOLD, s > 0 ? NX : PX);
  // a simple woven scene: dusk sky with stars, hills, a gilded tower
  const zA = zc - hw + 0.34, zB = zc + hw - 0.34;
  const NB = 6;
  for (let i = 0; i < NB; i++) {
    const t0 = i / NB, t1 = (i + 1) / NB;
    const ya = y0 + 1.30 + t0 * 2.9, yb = y0 + 1.30 + t1 * 2.9;
    const ca = mixc(mixc(BLUE, C.slateLight, 0.30), mixc(BLUE, GOLD, 0.30), t0);
    ew(b, x - s * 0.05, zA, zB, ya, yb, ca, M_CLOTH, s > 0 ? NX : PX);
  }
  // stars
  for (let i = 0; i < 26; i++) {
    const z = zA + ((zB - zA) * ((i * 7) % 23)) / 23;
    const yy = y0 + 3.05 + ((i * 13) % 9) * 0.12;
    ew(b, x - s * 0.06, z, z + 0.06, yy, yy + 0.06, GOLD_HI, M_GOLD_HI, s > 0 ? NX : PX);
  }
  // hills
  for (let i = 0; i < 5; i++) {
    const z = zA + ((zB - zA) * (i + 0.5)) / 5;
    const top = y0 + 2.15 + 0.55 * Math.abs(Math.sin(i * 2.1));
    ew(b, x - s * 0.065, z - 0.44, z + 0.44, y0 + 1.30, top, i % 2 ? mulc(GREEN, 0.92) : mulc(mixc(GREEN, GOLD, 0.25), 0.95), M_CLOTH, s > 0 ? NX : PX);
  }
  // gilded tower
  ew(b, x - s * 0.07, zc - 0.42, zc + 0.42, y0 + 1.30, y0 + 3.55, mixc(C.stonePale, C.slateDark, 0.24), M_CLOTH, s > 0 ? NX : PX);
  ew(b, x - s * 0.075, zc - 0.50, zc + 0.50, y0 + 3.55, y0 + 3.85, GOLD, M_GOLD, s > 0 ? NX : PX);
  for (let i = 0; i < 4; i++) ew(b, x - s * 0.078, zc - 0.28 + i * 0.19, zc - 0.16 + i * 0.19, y0 + 2.0, y0 + 2.35, GOLD, M_GOLD, s > 0 ? NX : PX);
  // hanging rod + rings + fringe
  bx(b, x - s * 0.30, x + s * 0.02, y1 + 0.06, y1 + 0.16, zc - hw - 0.16, zc + hw + 0.16, GOLD, M_GOLD);
  for (let i = 0; i < 8; i++) {
    const z = zc - hw + ((hw * 2) * (i + 0.5)) / 8;
    at(b, x - s * 0.16, y1 + 0.02, z, 0, () => ellipsoid(b, 0.05, 0.05, 0.05, 4, 2, GOLD_HI, M_GOLD_HI));
    bx(b, x - s * 0.06, x - s * 0.02, y0 - 0.16, y0, z - 0.035, z + 0.035, GOLD, M_GOLD);
  }
}

// sideboard / console against a long wall (s = wall side)
function sideboard(b, R, s, zc, w, h) {
  const x = s * (W - 0.05);
  const hw = w / 2;
  const dir = -s;      // into the room
  bx(b, x, x + dir * 0.62, 0.12, h, zc - hw, zc + hw, WOOD, M_WOOD, { topCol: mulc(WOOD, 1.15) });
  bx(b, x + dir * 0.58, x + dir * 0.66, 0.30, h, zc - hw + 0.05, zc + hw - 0.05, GOLD, M_GOLD);
  for (const sg of [-1, 1]) {
    bx(b, x, x + dir * 0.62, h, h + 0.06, zc + sg * hw - 0.04, zc + sg * hw + 0.04, GOLD, M_GOLD);
    for (const sx of [0.02, 0.34]) bx(b, x + dir * sx - 0.03, x + dir * sx + 0.03, 0.16, h - 0.1, zc + sg * hw - 0.05, zc + sg * hw + 0.05, WOOD_D, M_WOOD_D);
  }
  for (const sg of [-1, 1]) bx(b, x + dir * 0.14, x + dir * 0.58, 0.30, h - 0.14, zc + sg * (hw * 0.34), zc + sg * (hw * 0.66), GOLD_D(), M_GOLD_D);
  // wine bottles + goblets + a fruit bowl on top
  for (let i = 0; i < 4; i++) {
    at(b, x + dir * 0.22, h + 0.02, zc - hw + 0.34 + i * 0.36, 0, () => {
      lathe(b, [[0.055, 0], [0.075, 0.04], [0.075, 0.22], [0.045, 0.30], [0.035, 0.34]], 7, mixc(GREEN_D, C.iron, 0.3), M_MIRROR);
      at(b, 0, 0.34, 0, 0, () => cylinder(b, 5, 0.028, 0.026, 0.08, GOLD, M_GOLD, { y0: 0, caps: true }));
    });
  }
  for (let i = 0; i < 3; i++) {
    at(b, x + dir * 0.40, h + 0.02, zc + 0.20 + i * 0.24, 0, () => {
      lathe(b, [[0.035, 0], [0.055, 0.02], [0.03, 0.08], [0.06, 0.16], [0.055, 0.20]], 7, SILVER, M_SILVER);
      at(b, 0, 0.20, 0, 0, () => ellipsoid(b, 0.045, 0.055, 0.045, 5, 3, mixc(C.gold, C.sunGlow, 0.3), M_WINE));
    });
  }
  // fruit bowl
  at(b, x + dir * 0.30, h + 0.02, zc + hw - 0.42, 0, () => {
    lathe(b, [[0.10, 0], [0.26, 0.06], [0.34, 0.18], [0.30, 0.24]], 10, GOLD, M_GOLD);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU;
      at(b, Math.cos(a) * 0.16, 0.22, Math.sin(a) * 0.16, 0, () => ellipsoid(b, 0.09, 0.085, 0.09, 5, 3, i % 3 ? mixc(C.bloomPink, C.bloomYellow, 0.5) : mixc(C.leaf, C.bloomYellow, 0.55), M_LEAF));
    }
  });
  // pair of candlesticks
  for (const sg of [-1, 1]) at(b, x + dir * 0.26, h + 0.02, zc + sg * (hw * 0.72), 0, () => candlestick(b));
}

function candlestick(b) {
  lathe(b, [[0.11, 0], [0.055, 0.04], [0.04, 0.22], [0.075, 0.30], [0.045, 0.36], [0.09, 0.42]], 8, GOLD, M_GOLD);
  at(b, 0, 0.42, 0, 0, () => {
    cylinder(b, 6, 0.042, 0.04, 0.24, mixc(CREAM, GLOW, 0.3), M_WARM, { y0: 0, caps: false });
    at(b, 0, 0.34, 0, 0, () => ellipsoid(b, 0.045, 0.10, 0.045, 4, 2, GLOW_W, M_GLOW));
  });
}

// 3-arm candelabrum (table centrepiece)
function candelabrum(b) {
  lathe(b, [[0.16, 0], [0.10, 0.05], [0.07, 0.20], [0.11, 0.46], [0.06, 0.60], [0.10, 0.70]], 8, GOLD, M_GOLD);
  for (const s of [-1, 1]) {
    tubePath(b, [[0, 0.52, 0], [s * 0.14, 0.62, 0], [s * 0.26, 0.66, 0]], () => 0.032, 4, GOLD, M_GOLD, { caps: false });
    at(b, s * 0.28, 0.62, 0, 0, () => {
      cylinder(b, 6, 0.06, 0.05, 0.07, GOLD_HI, M_GOLD_HI, { y0: 0, caps: true });
      cylinder(b, 6, 0.038, 0.036, 0.22, mixc(CREAM, GLOW, 0.3), M_WARM, { y0: 0.07, caps: false });
      at(b, 0, 0.29, 0, 0, () => ellipsoid(b, 0.04, 0.09, 0.04, 4, 2, GLOW_W, M_GLOW));
    });
  }
  at(b, 0, 0.70, 0, 0, () => {
    cylinder(b, 6, 0.05, 0.045, 0.20, mixc(CREAM, GLOW, 0.3), M_WARM, { y0: 0, caps: false });
    at(b, 0, 0.27, 0, 0, () => ellipsoid(b, 0.045, 0.10, 0.045, 4, 2, GLOW_W, M_GLOW));
  });
}

// floral centrepiece
function floral(b, R, plateR) {
  at(b, 0, 0, 0, 0, () => lathe(b, [[0.20, 0], [0.30, 0.05], [0.24, 0.16], [0.18, 0.30], [0.22, 0.36]], 9, GOLD, M_GOLD));
  for (let i = 0; i < 16; i++) {
    const a = R() * TAU, rr = 0.06 + R() * 0.30;
    const h = 0.36 + R() * 0.42;
    tubePath(b, [[0, 0.10, 0], [Math.cos(a) * rr * 0.5, 0.10 + h * 0.5, Math.sin(a) * rr * 0.5], [Math.cos(a) * rr, 0.10 + h, Math.sin(a) * rr]], () => 0.010, 3, LEAF_D, M_LEAF, { caps: false });
    at(b, Math.cos(a) * rr, 0.10 + h, Math.sin(a) * rr, 0, () => {
      ellipsoid(b, 0.075, 0.055, 0.075, 5, 3, BLOOM[i % BLOOM.length], M_LEAF);
      at(b, 0, 0.04, 0, 0, () => ellipsoid(b, 0.05, 0.03, 0.05, 4, 2, LEAF_L, M_LEAF));
    });
  }
  for (let i = 0; i < 6; i++) {
    const a = R() * TAU, rr = 0.08 + R() * 0.20;
    at(b, Math.cos(a) * rr, 0.20 + R() * 0.16, Math.sin(a) * rr, 0, () => ellipsoid(b, 0.10, 0.05, 0.10, 4, 2, LEAF, M_LEAF));
  }
  void plateR;
}

// one place setting on a table top at y, chair direction yaw (place faces the table centre)
function placeSetting(b, x, y, z, yaw) {
  at(b, x, y + 0.005, z, yaw, () => {
    // gold charger + plate + napkin + cutlery + two goblets
    cylinder(b, 14, 0.29, 0.29, 0.012, GOLD, M_GOLD, { y0: 0, caps: true });
    cylinder(b, 12, 0.22, 0.22, 0.02, CREAM, M_MARBLE, { y0: 0.012, caps: true });
    cylinder(b, 10, 0.17, 0.17, 0.008, mulc(CREAM, 0.94), M_MARBLE, { y0: 0.032, caps: true });
    bx(b, -0.13, 0.13, 0.045, 0.075, -0.09, 0.13, CREAM, M_CLOTH);
    bx(b, -0.02, 0.02, 0.075, 0.10, -0.09, 0.13, GOLD, M_GOLD);
    for (const sx of [-1, 1]) {
      // knife / fork
      bx(b, sx * 0.30 - 0.018, sx * 0.30 + 0.018, 0.02, 0.055, -0.16, 0.14, SILVER, M_SILVER);
      bx(b, sx * 0.34 - 0.030, sx * 0.34 + 0.030, 0.02, 0.040, -0.02, 0.10, SILVER, M_SILVER);
    }
    // goblets
    for (const [gx, gz] of [[0.34, 0.22], [0.24, 0.30]]) {
      at(b, gx, 0.02, gz, 0, () => {
        lathe(b, [[0.045, 0], [0.055, 0.02], [0.03, 0.05], [0.075, 0.13], [0.070, 0.19], [0.050, 0.21]], 8, SILVER, M_SILVER);
        at(b, 0, 0.10, 0, 0, () => ellipsoid(b, 0.045, 0.07, 0.045, 5, 3, mixc(C.bloomRed, C.slateDark, 0.3), M_WINE));
      });
    }
    // salt cellar
    cylinder(b, 8, 0.045, 0.035, 0.05, SILVER, M_SILVER, { y0: 0.02, caps: true });
  });
}

// armchair (deep, for library reading corners); local +Z = facing
function armchair(b, col, hi) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bx(b, sx * 0.36 - 0.06, sx * 0.36 + 0.06, 0.02, 0.34, sz * 0.36 - 0.06, sz * 0.36 + 0.06, WOOD_D, M_WOOD_D);
  bx(b, -0.52, 0.52, 0.30, 0.62, -0.50, 0.48, col, M_VELVET, { topCol: hi });
  bx(b, -0.54, 0.54, 0.62, 0.70, -0.52, 0.50, mulc(col, 1.1), M_VELVET, { topCol: hi });
  bx(b, -0.50, 0.50, 0.62, 1.36, -0.56, -0.40, col, M_VELVET, { topCol: hi });
  for (const sx of [-1, 1]) {
    bx(b, sx * 0.52 - 0.08, sx * 0.52 + 0.08, 0.34, 0.86, -0.52, 0.50, mulc(col, 1.06), M_VELVET, { topCol: hi });
    bx(b, sx * 0.60 - 0.05, sx * 0.60 + 0.05, 0.86, 0.94, -0.54, 0.50, GOLD, M_GOLD);
    at(b, sx * 0.60, 0.90, 0.44, 0, () => ellipsoid(b, 0.09, 0.10, 0.09, 5, 3, GOLD_HI, M_GOLD_HI));
  }
  for (let i = 0; i < 7; i++) at(b, -0.36 + i * 0.12, 0.98 + (i % 2) * 0.18, -0.555, 0, () => ellipsoid(b, 0.035, 0.035, 0.025, 4, 2, GOLD_HI, M_GOLD_HI));
  // cushion
  bx(b, -0.34, 0.34, 0.62, 0.86, -0.34, -0.14, mixc(col, CREAM, 0.12), M_VELVET, { topCol: hi });
}

// ================================================================ LIBRARY
function libWallUnit(b, R, s) {
  // s = -1 rotunda-side wall, +1 outer wall
  const wallX = s * W;
  const zA = Z0 + 0.55, zB = Z1 - 0.55;
  const len = zB - zA;
  const NBAY = 10, pitch = len / NBAY;
  const base = FY + 0.06, topL = FY + 5.28;
  // back panel + plinth + cornice
  ew(b, wallX - s * 0.07, zA, zB, base, GALY + 4.30, mulc(WOOD_D, 0.92), M_WOOD_D, s > 0 ? NX : PX);
  bx(b, wallX, wallX - s * 0.50, base - 0.06, base + 0.20, zA - 0.10, zB + 0.10, mulc(WOOD_D, 0.86), M_WOOD_D);
  for (let k = 0; k < NBAY; k++) {
    const z0 = zA + k * pitch, z1 = z0 + pitch;
    // vertical pilasters
    for (const z of [z0, z1]) {
      bx(b, wallX, wallX - s * 0.54, base, topL + 0.22, z - 0.08, z + 0.08, mulc(WOOD, 0.92), M_WOOD);
      bx(b, wallX - s * 0.52, wallX - s * 0.58, base, topL + 0.16, z - 0.06, z + 0.06, GOLD, M_GOLD);
      bx(b, wallX - s * 0.56, wallX - s * 0.02, topL, topL + 0.20, z - 0.10, z + 0.10, GOLD_HI, M_GOLD_HI);
    }
    // lower shelves + books
    const rows = [0.20, 0.92, 1.64, 2.36, 3.08, 3.80, 4.52];
    for (let r = 0; r < rows.length; r++) {
      const y = base + rows[r];
      bx(b, wallX, wallX - s * 0.48, y - 0.055, y, z0 + 0.10, z1 - 0.10, mulc(WOOD, 1.06), M_WOOD);
      bookRowZ(b, wallX - s * 0.46, z0 + 0.13, z1 - 0.13, y + 0.02, R, 26, r % 3);
    }
    // bay cornice
    bx(b, wallX, wallX - s * 0.56, topL + 0.22, topL + 0.42, z0 - 0.10, z1 + 0.10, MARBLE, M_MARBLE, { topCol: MARBLE_HI });
    // ---- upper tier above the gallery
    const ub = GALY + 0.34, ut = GALY + 4.20;
    bx(b, wallX, wallX - s * 0.40, ub, ut, z0 + 0.05, z1 - 0.05, mulc(WOOD_D, 1.06), M_WOOD_D);
    for (let r = 0; r < 4; r++) {
      const y = ub + 0.22 + r * 0.96;
      bx(b, wallX - s * 0.02, wallX - s * 0.38, y - 0.05, y, z0 + 0.10, z1 - 0.10, mulc(WOOD, 1.08), M_WOOD);
      bookRowZ(b, wallX - s * 0.38, z0 + 0.14, z1 - 0.14, y + 0.02, R, 24, 1);
    }
    bx(b, wallX, wallX - s * 0.44, ut, ut + 0.26, z0 + 0.04, z1 - 0.04, MARBLE, M_MARBLE, { topCol: MARBLE_HI });
    // frieze panel between the tiers and the ceiling
    bx(b, wallX, wallX - s * 0.12, ut + 0.26, CY - 0.40, z0 + 0.12, z1 - 0.12, mulc(WALL_HI, 0.97), M_WALL_HI);
  }
  // gallery slab + brackets + gold railing
  const gw = 1.62;
  bx(b, wallX, wallX - s * gw, GALY, GALY + 0.22, zA - 0.10, zB + 0.10, MARBLE, M_MARBLE, { topCol: MARBLE_HI });
  for (let k = 0; k <= NBAY * 2; k++) {
    const z = zA - 0.10 + ((zB - zA + 0.20) * k) / (NBAY * 2);
    at(b, wallX - s * (gw - 0.14), GALY - 0.10, z, 0, () => lathe(b, [[0.17, -0.52], [0.10, -0.30], [0.17, -0.10], [0.07, 0]], 6, GOLD, M_GOLD));
  }
  railZ(b, zA - 0.10, zB + 0.10, wallX - s * gw, GALY + 0.22, 0.96);
  bx(b, wallX - s * gw - 0.11, wallX - s * gw + 0.11, GALY + 1.16, GALY + 1.28, zA - 0.10, zB + 0.10, GOLD, M_GOLD);
  // wall sconces on the pilasters (every other bay) + oil paintings above the upper tier
  for (let k = 1; k < NBAY; k += 3) {
    const zc2 = zA + k * pitch + pitch * 0.5;
    framedArt(b, 'x', wallX, zc2, 1.3, 1.9, CY - 2.85, R, k + 5);
  }
  for (let k = 1; k < NBAY; k += 2) {
    const zc = zA + k * pitch;
    at(b, wallX - s * 0.60, GALY + 0.66, zc, s > 0 ? -Math.PI / 2 : Math.PI / 2, () => sconceHead(b));
    lantern(wallX - s * 1.05, GALY + 1.95, zc, 1.2, 0.32, mixc(C.sunGlow, GOLD_HI, 0.4));
    framedArt(b, 'x', wallX, zc, 1.55, 2.1, CY - 3.05, R, k);
  }
}
function sconceHead(b) {
  // one gilt two-candle wall light, local +Z = out of the wall
  bx(b, -0.16, 0.16, -0.10, 0.46, -0.02, 0.16, GOLD, M_GOLD);
  tubePath(b, [[0, 0.36, 0.06], [0, 0.54, 0.32], [0, 0.70, 0.50]], () => 0.035, 4, GOLD, M_GOLD, { caps: false });
  for (const sx of [-0.26, 0.26]) {
    tubePath(b, [[0, 0.38, 0.10], [sx * 0.55, 0.52, 0.32], [sx, 0.66, 0.48]], () => 0.028, 3, GOLD, M_GOLD, { caps: false });
    at(b, sx, 0.68, 0.48, 0, () => {
      cylinder(b, 6, 0.05, 0.045, 0.20, mixc(CREAM, GLOW, 0.3), M_WARM, { y0: 0, caps: false });
      at(b, 0, 0.28, 0, 0, () => ellipsoid(b, 0.05, 0.10, 0.05, 4, 2, GLOW_W, M_GLOW));
    });
  }
}

// a long reading table (long axis along X) with two green-shaded lamps, books and chairs
function libReadingTable(b, R, x, z, len, wid) {
  at(b, x, FY, z, 0, () => {
    tableB(b, 0, 0, len, wid, 0.78);
    // red runner with gold borders
    bx(b, -len / 2 + 0.22, len / 2 - 0.22, 0.782, 0.792, -wid / 2 + 0.14, wid / 2 - 0.14, RED, M_CARPET);
    bx(b, -len / 2 + 0.22, len / 2 - 0.22, 0.792, 0.797, -wid / 2 + 0.14, -wid / 2 + 0.24, GOLD, M_GOLD);
    bx(b, -len / 2 + 0.22, len / 2 - 0.22, 0.792, 0.797, wid / 2 - 0.24, wid / 2 - 0.14, GOLD, M_GOLD);
    // two green reading lamps
    for (const sg of [-1, 1]) {
      at(b, sg * len * 0.27, 0.78, -wid * 0.14, 0, () => {
        lathe(b, [[0.16, 0], [0.10, 0.04], [0.055, 0.22], [0.045, 0.50], [0.075, 0.54], [0.06, 0.60]], 8, GOLD, M_GOLD);
        at(b, 0, 0.60, 0, 0, () => {
          for (let i = 0; i < 12; i++) {
            const a0 = (i / 12) * TAU, a1 = ((i + 1) / 12) * TAU;
            b.tri([0, 0.30, 0], [Math.cos(a0) * 0.38, 0, Math.sin(a0) * 0.38], [Math.cos(a1) * 0.38, 0, Math.sin(a1) * 0.38], i % 2 ? GREEN : mulc(GREEN, 1.14), M_WARM, DN, DN, DN);
          }
          torus(b, 0.38, 0.022, 14, 3, GOLD, M_GOLD);
          at(b, 0, -0.08, 0, 0, () => ellipsoid(b, 0.19, 0.07, 0.19, 6, 2, GLOW_W, M_GLOW));
        });
      });
    }
    // books, a globelet, a small candlestick
    openBook(b, -0.42, 0.78, 0.14, 0.22, 0.40);
    openBook(b, 0.52, 0.78, -0.16, -0.35, 0.36);
    for (let i = 0; i < 4; i++) {
      at(b, -len * 0.36 + i * 0.32, 0.78, wid * 0.28, R() * 0.5, () => {
        bx(b, -0.13, 0.13, 0, 0.045, -0.10, 0.10, BOOKS[i % BOOKS.length], M_BOOK);
        bx(b, -0.13, 0.13, 0.045, 0.078, -0.10, 0.10, mulc(BOOKS[(i + 3) % BOOKS.length], 0.9), M_BOOK);
      });
    }
    at(b, len * 0.38, 0.78, wid * 0.20, 0, () => {
      lathe(b, [[0.11, 0], [0.05, 0.05], [0.13, 0.22], [0.09, 0.32]], 7, GOLD, M_GOLD);
      at(b, 0, 0.34, 0, 0, () => ellipsoid(b, 0.15, 0.15, 0.15, 7, 4, mixc(C.glass, C.gold, 0.3), M_MARBLE));
    });
    at(b, len * 0.18, 0.78, -wid * 0.30, 0, () => candlestick(b));
  });
  // chairs on both long sides (world coords so the facing is exact)
  for (const sz of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const cz = z + sz * (wid / 2 + 0.56);
      const cx = x + (i - 0.5) * len * 0.46;
      at(b, cx, FY, cz, faceYaw(0, -sz), () => chairB(b, sz > 0 ? BLUE : GREEN, sz > 0 ? mixc(BLUE, CREAM, 0.14) : mixc(GREEN, CREAM, 0.12), false));
    }
  }
}

function buildLibrary(b, R) {
  // ---- wall units + gallery
  for (const s of [-1, 1]) libWallUnit(b, R, s);
  // ---- mezzanine bridge across the hall (connects the two galleries)
  const bz = 9.4, bw = 1.70;
  bx(b, X0, X1, GALY, GALY + 0.24, bz - bw / 2, bz + bw / 2, MARBLE, M_MARBLE, { topCol: MARBLE_HI });
  for (let i = 0; i < 12; i++) {
    const x = X0 + 0.6 + ((X1 - X0 - 1.2) * i) / 11;
    at(b, x, GALY - 0.10, bz, 0, () => lathe(b, [[0.15, -0.42], [0.09, -0.24], [0.15, -0.08], [0.06, 0]], 6, GOLD, M_GOLD));
  }
  railX(b, X0, X1, bz - bw / 2, GALY + 0.24, 0.96);
  railX(b, X0, X1, bz + bw / 2, GALY + 0.24, 0.96);
  // bookshelves on both ends of the bridge
  for (const s of [-1, 1]) {
    const x = s * (W - 0.02), dir = -s;
    bx(b, x, x + dir * 0.30, GALY + 0.26, GALY + 1.9, bz - bw / 2 + 0.12, bz + bw / 2 - 0.12, mulc(WOOD_D, 1.02), M_WOOD_D);
    for (let r = 0; r < 2; r++) {
      const y = GALY + 0.60 + r * 0.56;
      bx(b, x + dir * 0.28, x + dir * 0.32, y - 0.04, y, bz - bw / 2 + 0.14, bz + bw / 2 - 0.14, mulc(WOOD, 1.06), M_WOOD);
    }
  }
  // ---- back wall: fireplace + overmantel mirror + flanking bookcases + windows
  const FX = -1.6;
  at(b, FX, FY, ZB - 0.02, Math.PI, () => fireplace(b, R, 3.6));
  mirrorWall(b, 'z', ZB - 0.02, FX, 2.5, 3.3, 33.6, R);
  // window sills on the back wall get small console tables
  // flanking bookcases (low, below the back windows)
  for (const [xa, xb] of [[X0 + 0.30, FX - 2.55], [FX + 2.55, X1 - 0.30]]) {
    bx(b, xa, xb, FY + 0.04, FY + 4.60, ZB - 0.42, ZB - 0.02, mulc(WOOD_D, 0.96), M_WOOD_D);
    for (let r = 0; r < 5; r++) {
      const y = FY + 0.30 + r * 0.86;
      bx(b, xa, xb, y - 0.05, y, ZB - 0.62, ZB - 0.40, mulc(WOOD, 1.06), M_WOOD);
      bookRowBack(b, xa + 0.16, xb - 0.16, y + 0.02, ZB - 0.60, R, Math.round((xb - xa) / 0.10), r);
    }
    bx(b, xa - 0.06, xb + 0.06, FY + 4.60, FY + 4.86, ZB - 0.58, ZB - 0.02, MARBLE, M_MARBLE, { topCol: MARBLE_HI });
    // gold pilasters
    for (const x of [xa, xb]) bx(b, x - 0.05, x + 0.05, FY + 0.10, FY + 4.62, ZB - 0.56, ZB - 0.02, GOLD, M_GOLD);
    // paintings above the bookcases, under the windows
    framedArt(b, 'z', ZB - 0.02, (xa + xb) / 2, 1.7, 1.0, FY + 4.95, R, 2);
  }
  // back windows + front windows
  for (const c of [-6.725, -1.625, 3.575]) windowZ(b, ZB, c, 2.4, 37.6, 43.5, 1.2, true);
  for (const c of [-7.35, 6.9]) {
    windowZ(b, ZF, c, 2.35, 31.0, 36.35, 1.175, true);
    windowZ(b, ZF, c, 2.55, 37.4, 43.0, 1.275, true);
  }
  // front wall: portraits + mirrors on the piers beside the door
  framedArt(b, 'z', ZF, 4.75, 1.55, 2.6, 31.6, R, 0);
  mirrorWall(b, 'z', ZF, -5.25, 1.45, 2.6, 31.6, R);
  framedArt(b, 'z', ZF, -5.25, 1.45, 1.9, 39.6, R, 3);
  framedArt(b, 'z', ZF, 4.75, 1.55, 1.9, 39.6, R, 4);
  // ---- carpet runner down the hall
  const cr = 3.5;
  fw(b, FY + 0.010, -cr, cr, -15.4, 12.6, RED, M_CARPET, UP);
  fw(b, FY + 0.012, -cr + 0.28, cr - 0.28, -15.2, 12.4, mixc(RED, C.gold, 0.10), M_CARPET_HI, UP);
  for (const s of [-1, 1]) fw(b, FY + 0.014, s * (cr - 0.30), s * (cr - 0.16), -15.2, 12.4, GOLD, M_GOLD, UP);
  for (let i = 0; i < 6; i++) {
    const z = -12.2 + i * 4.4;
    at(b, 0, FY + 0.016, z, 0, () => {
      ringFlat(b, 1.05, 1.22, 0, 0.60, GOLD, M_GOLD);
      discFlat(b, 1.05, 0.001, 0.60, RED_HI, M_CARPET_HI);
      ringFlat(b, 0.58, 0.68, 0.004, 0.42, GOLD_HI, M_GOLD_HI);
      discFlat(b, 0.58, 0.005, 0.42, BLUE, M_VELVET);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU;
        at(b, Math.cos(a) * 1.42, 0.003, Math.sin(a) * 0.86, -a, () => {
          b.quad([-0.18, 0, 0], [0, 0, 0.11], [0.18, 0, 0], [0, 0, -0.11], GOLD, M_GOLD, UP);
        });
      }
    });
  }
  // ---- three reading tables
  libReadingTable(b, R, 0.3, -7.6, 3.2, 1.5);
  libReadingTable(b, R, 0.3, -1.4, 3.2, 1.5);
  libReadingTable(b, R, 0.3, 4.8, 3.2, 1.5);
  // ---- entrance pair of globes + reading armchairs at the front corners
  globe(b, -6.1, -11.4, R, false);
  globe(b, 6.1, -11.4, R, true);
  for (const s of [-1, 1]) {
    at(b, s * 5.7, FY, -8.9, s > 0 ? -2.2 : 2.2, () => armchair(b, s > 0 ? GREEN : BLUE, s > 0 ? mixc(GREEN, CREAM, 0.12) : mixc(BLUE, CREAM, 0.12)));
    // small side table
    at(b, s * 3.9, FY, -8.4, 0, () => {
      at(b, 0, 0.62, 0, 0, () => cylinder(b, 14, 0.44, 0.44, 0.07, MARBLE, M_MARBLE, { y0: 0, caps: true }));
      at(b, 0, 0.62, 0, 0, () => torus(b, 0.44, 0.025, 14, 3, GOLD, M_GOLD));
      lathe(b, [[0.10, 0], [0.07, 0.06], [0.06, 0.50], [0.12, 0.56]], 8, GOLD_D(), M_GOLD_D);
      candlestick(b);
    });
  }
  // ---- far corners: harp, easel, palms
  harp(b, 6.5, 13.1, Math.PI * 0.86);
  at(b, -6.3, FY, 13.2, deg(58), () => {
    // easel
    for (const s of [-1, 1]) bar3(b, [s * 0.42, 0.05, 0.30], [s * 0.30, 2.10, 0.10], 0.055, 0.06, WOOD, M_WOOD);
    bar3(b, [0, 0.05, -0.35], [0, 1.95, 0.02], 0.05, 0.055, WOOD_D, M_WOOD_D);
    bar3(b, [-0.38, 0.86, 0.22], [0.38, 0.86, 0.22], 0.09, 0.06, WOOD, M_WOOD);
    at(b, 0, 1.12, 0.16, 0, () => {
      bx(b, -0.62, 0.62, 0, 1.32, -0.03, 0.03, mulc(DARK, 1.12), M_PAINT, PZ);
      bx(b, -0.55, 0.55, 0.10, 1.22, 0.035, 0.05, PAINT[0], M_PAINT, PZ, UP);
      bx(b, -0.50, 0.50, 0.20, 0.92, 0.055, 0.07, PAINT[3], M_PAINT, PZ);
      at(b, 0.08, 0.60, 0.08, 0, () => ellipsoid(b, 0.14, 0.20, 0.04, 5, 3, PAINT[1], M_PAINT));
      bx(b, -0.62, 0.62, 1.32, 1.44, -0.05, 0.05, GOLD, M_GOLD);
    });
  });
  for (const [px, pz, ps] of [[-5.9, 14.2, 1.15], [6.0, 14.1, 1.05], [-6.0, -14.0, 1.0], [6.1, -14.1, 0.95]]) palm(b, R, px, pz, ps);
  // rolling ladders on the outer wall
  ladder(b, R, W - 0.50, -8.6, -1);
  ladder(b, R, W - 0.50, 2.2, -1);
  // ---- chandeliers
  for (const cz of [-11.2, -4.4, 2.2, 8.2]) chandelier(b, 0, cz, CY - 0.05, 1.05);
  // ---- lights (fire glow at the hall end)
  point(-1.6, FY + 1.5, 14.9, mixc(C.sunGlow, C.bloomRed, 0.35), 16, 0.85);
  lantern(-1.6, FY + 1.0, 15.2, 1.6, 0.5, mixc(C.sunGlow, C.bloomRed, 0.4));
  point(-1.6, FY + 3.9, 13.0, mixc(C.sunGlow, GOLD_HI, 0.35), 20, 0.80);
  point(0, 37.6, -10.5, mixc(C.sunGlow, C.cloudLit, 0.30), 30, 0.72);
  point(0, 37.6, -2.0, mixc(C.sunGlow, C.cloudLit, 0.30), 30, 0.70);
  point(0, 37.4, 7.0, mixc(C.sunGlow, C.cloudLit, 0.28), 28, 0.66);
  point(-6.4, 34.2, -11.2, mixc(SKY_HI, C.cloudLit, 0.4), 16, 0.55);
  point(6.4, 34.2, -11.2, mixc(SKY_HI, C.cloudLit, 0.4), 16, 0.55);
}
// book row against the back wall (spines face -Z into the room)
function bookRowBack(b, x0, x1, y, zSpine, R, n, kind) {
  let x = x0;
  for (let i = 0; i < n; i++) {
    const w = 0.055 + R() * 0.075;
    if (x + w > x1) break;
    const h = (kind === 2 ? 0.26 : 0.30) + R() * 0.14;
    const col = BOOKS[(i * 7 + Math.round(R() * 5)) % BOOKS.length];
    b.quad([x, y, zSpine], [x + w, y, zSpine], [x + w, y + h, zSpine], [x, y + h, zSpine], col, M_BOOK, NZ);
    b.quad([x, y + h, zSpine], [x + w, y + h, zSpine], [x + w, y + h, zSpine - 0.16], [x, y + h, zSpine - 0.16], mulc(col, 1.12), M_BOOK, UP);
    x += w + 0.004 + R() * 0.012;
  }
}

// ================================================================ BANQUET HALL
function banquetLongTable(b, R) {
  const tlen = 16.0, tcz = -0.4, wid = 2.9;
  // everything is drawn in a frame whose local +X runs down the table (world +Z)
  at(b, 0, FY, tcz, Math.PI / 2, () => {
    tableB(b, 0, 0, tlen, wid, 0.78);
    // white damask runner + gold borders down the centre
    bx(b, -tlen / 2 + 0.25, tlen / 2 - 0.25, 0.782, 0.790, -0.42, 0.42, mixc(CREAM, GLOW, 0.30), M_CLOTH);
    for (const sz of [-1, 1]) bx(b, -tlen / 2 + 0.25, tlen / 2 - 0.25, 0.790, 0.796, sz * 0.42 - sz * 0.05, sz * 0.42, GOLD, M_GOLD);
    // 10 seats down each side + 1 at each end
    const NZ = 10;
    for (let i = 0; i < NZ; i++) {
      const lx = -tlen / 2 + 1.05 + (i / (NZ - 1)) * (tlen - 2.1);
      for (const sz of [-1, 1]) {
        // chair beyond the table edge, facing it
        at(b, lx, 0.02, sz * (wid / 2 + 0.72), sz > 0 ? Math.PI : 0, () => chairB(b, i % 2 ? RED : BLUE, i % 2 ? RED_HI : mixc(BLUE, CREAM, 0.14), true));
        at(b, lx, 0.79, sz * (wid / 2 - 0.34), 0, () => placeSetting(b, 0, 0, 0, 0));
      }
    }
    for (const sx of [-1, 1]) {
      at(b, sx * (tlen / 2 + 0.72), 0.02, 0, sx > 0 ? -Math.PI / 2 : Math.PI / 2, () => chairB(b, RED, RED_HI, true));
      at(b, sx * (tlen / 2 - 0.34), 0.79, 0, 0, () => placeSetting(b, 0, 0, 0, 0));
    }
    // centrepieces: candelabra / floral + tureens, alternating
    for (let i = 0; i < 5; i++) {
      const lx = -tlen / 2 + 1.6 + i * ((tlen - 3.2) / 4);
      if (i % 2 === 0) {
        at(b, lx, 0.79, 0, 0, () => { candelabrum(b); });
        at(b, lx, 0.79, 0.95, 0, () => candlestick(b));
        at(b, lx, 0.79, -0.95, 0, () => candlestick(b));
      } else {
        at(b, lx, 0.79, 0, 0, () => floral(b, R, 0.3));
        for (const sz of [-1, 1]) {
          at(b, lx, 0.79, sz * 0.95, 0, () => {
            lathe(b, [[0.10, 0], [0.24, 0.04], [0.26, 0.20], [0.18, 0.28], [0.20, 0.32]], 9, SILVER, M_SILVER);
            at(b, 0, 0.32, 0, 0, () => ellipsoid(b, 0.10, 0.07, 0.10, 5, 3, GOLD_HI, M_GOLD_HI));
          });
        }
      }
    }
    // gold fruit pyramids near both ends
    for (const sx of [-1, 1]) {
      at(b, sx * (tlen / 2 - 1.0), 0.79, 0, 0, () => {
        lathe(b, [[0.16, 0], [0.10, 0.06], [0.08, 0.16], [0.20, 0.22]], 8, GOLD, M_GOLD);
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * TAU, rr = 0.08 + (i % 3) * 0.07;
          at(b, Math.cos(a) * rr, 0.24 + (i % 4) * 0.09, Math.sin(a) * rr, 0, () => ellipsoid(b, 0.09, 0.085, 0.09, 5, 3, i % 2 ? mixc(C.bloomYellow, C.bloomPink, 0.4) : mixc(C.leaf, C.bloomYellow, 0.5), M_LEAF));
        }
      });
    }
  });
}

function banquetWalls(b, R) {
  for (const s of [-1, 1]) {
    // tapestries hanging over the two sideboards
    for (const zc of [-10.4, 7.2]) tapestry(b, s, zc, 4.6, FY + 1.7, FY + 6.9);
    // gilded wall panels between the tapestries: two mirrors, two paintings
    for (const zc of [-14.5, -5.9, 2.8, 11.2]) {
      const x = s * (W - 0.04);
      ew(b, x - s * 0.02, zc - 1.5, zc + 1.5, FY + 1.55, FY + 5.25, mulc(WALL_HI, 1.0), M_WALL_HI, s > 0 ? NX : PX);
      // recessed inner field + gold moulding frame
      ew(b, x - s * 0.045, zc - 1.32, zc + 1.32, FY + 1.74, FY + 5.06, mulc(WALL_HI, 0.94), M_WALL_HI, s > 0 ? NX : PX);
      for (const yy of [FY + 1.55, FY + 5.13]) ew(b, x - s * 0.06, zc - 1.42, zc + 1.42, yy, yy + 0.12, GOLD, M_GOLD, s > 0 ? NX : PX);
      for (const dz of [-1.42, 1.42]) ew(b, x - s * 0.06, zc + dz - 0.06, zc + dz + 0.06, FY + 1.55, FY + 5.25, GOLD, M_GOLD, s > 0 ? NX : PX);
      // gilded rosette in the panel head
      at(b, x - s * 0.07, FY + 4.72, zc, s > 0 ? -Math.PI / 2 : Math.PI / 2, () => patera(b, 0.26, 0, GOLD, M_GOLD));
      if (zc === -5.9 || zc === 2.8) mirrorWall(b, 'x', s * W, zc, 1.7, 2.5, FY + 2.05, R);
      else framedArt(b, 'x', s * W, zc, 1.8, 2.3, FY + 2.2, R, Math.round(zc + 20));
    }
    // sconces on the piers between panels + a gilded frieze band above
    for (const zc of [-12.45, -8.15, -1.55, 4.9, 9.2, 13.0]) {
      at(b, s * (W - 0.60), FY + 3.05, zc, s > 0 ? -Math.PI / 2 : Math.PI / 2, () => sconceHead(b));
      lantern(s * (W - 1.05), FY + 4.35, zc, 1.15, 0.30, mixc(C.sunGlow, GOLD_HI, 0.4));
    }
    // cornice + frieze along the top of the wall
    for (const yy of [FY + 7.55, FY + 8.35]) {
      ew(b, s * (W - 0.03), Z0, Z1, yy, yy + 0.18, GOLD, M_GOLD, s > 0 ? NX : PX);
      ew(b, s * (W - 0.05), Z0, Z1, yy + 0.18, yy + 0.30, mulc(WALL_HI, 1.04), M_WALL_HI, s > 0 ? NX : PX);
    }
    for (let k = 0; k < 12; k++) {
      const zc = Z0 + 1.2 + k * 2.55;
      at(b, s * (W - 0.07), FY + 7.9, zc, s > 0 ? -Math.PI / 2 : Math.PI / 2, () => patera(b, 0.24, 0, GOLD, M_GOLD));
    }
    // vertical gilt pilasters at the panel/tapestry joints
    for (const zc of [-15.9, -13.1, -8.0, -3.2, -0.1, 1.0, 5.0, 6.0, 9.2, 12.8, 15.9]) {
      ew(b, s * (W - 0.06), zc - 0.16, zc + 0.16, FY + 1.30, FY + 7.55, mulc(WALL_HI, 1.08), M_WALL_HI, s > 0 ? NX : PX);
      ew(b, s * (W - 0.08), zc - 0.05, zc + 0.05, FY + 1.30, FY + 7.55, GOLD, M_GOLD, s > 0 ? NX : PX);
    }
    // upper order: a row of portraits over the frieze, with gilt cartouches between them
    for (const zc of [-14.5, -10.4, -5.9, -1.6, 2.8, 7.2, 11.2]) {
      framedArt(b, 'x', s * W, zc, 2.0, 2.7, FY + 9.30, R, Math.round(zc + 30));
      at(b, s * (W - 0.10), FY + 13.05, zc, s > 0 ? -Math.PI / 2 : Math.PI / 2, () => patera(b, 0.30, 0, GOLD, M_GOLD));
    }
    // top cornice + gilded cove under the ceiling
    ew(b, s * (W - 0.05), Z0, Z1, FY + 12.55, FY + 12.90, GOLD, M_GOLD, s > 0 ? NX : PX);
    ew(b, s * (W - 0.05), Z0, Z1, FY + 12.90, FY + 13.30, mulc(WALL_HI, 1.06), M_WALL_HI, s > 0 ? NX : PX);
    ew(b, s * (W - 0.10), Z0, Z1, FY + 13.30, FY + 13.55, GOLD_HI, M_GOLD_HI, s > 0 ? NX : PX);
    // sideboards under the tapestries (+ wine coolers flanking them)
    for (const zc of [-10.4, 7.2]) {
      at(b, s * (W - 0.08), FY, zc, s > 0 ? -Math.PI / 2 : Math.PI / 2, () => sideboardUnit(b, R, 0.94, 3.4));
    }
    for (const zc of [-12.6, -8.2, 5.0, 9.4]) {
      at(b, s * (W - 0.34), FY, zc, 0, () => {
        lathe(b, [[0.26, 0], [0.30, 0.06], [0.30, 0.42], [0.26, 0.48], [0.30, 0.54]], 9, SILVER, M_SILVER);
        at(b, 0, 0.54, 0, 0, () => ellipsoid(b, 0.24, 0.05, 0.24, 6, 2, mixc(C.bloomRed, C.slateDark, 0.4), M_WINE));
      });
    }
  }
  // back wall: fireplace + overmantel mirror + flanking paintings + gilt plate trophies
  at(b, 0, FY, ZB - 0.02, Math.PI, () => fireplace(b, R, 3.9));
  mirrorWall(b, 'z', ZB - 0.02, 0, 3.0, 3.2, 37.0, R);
  for (const s of [-1, 1]) {
    framedArt(b, 'z', ZB - 0.02, s * 5.4, 2.4, 3.2, FY + 1.5, R, 5);
    // gold plates / urns trophy above the paintings
    for (let i = 0; i < 3; i++) {
      at(b, s * (5.4 - 0.62 + i * 0.62), FY + 5.15 + (i === 1 ? 0.16 : 0), ZB - 0.14, 0, () => {
        ellipsoid(b, 0.24, 0.24, 0.05, 8, 3, i === 1 ? GOLD_HI : GOLD, M_GOLD);
        ellipsoid(b, 0.06, 0.06, 0.10, 4, 2, GOLD_HI, M_GOLD_HI);
      });
    }
  }
}
// free-standing sideboard unit (drawn in its own local frame: +Z into the room)
function sideboardUnit(b, R, h, w) {
  const hw = w / 2;
  bx(b, -hw, hw, 0.10, h, -0.30, 0.30, WOOD, M_WOOD, { topCol: mulc(WOOD, 1.15) });
  bx(b, -hw + 0.04, hw - 0.04, 0.24, h - 0.10, 0.30, 0.36, GOLD, M_GOLD);
  for (const sx of [-1, 1]) bx(b, sx * hw - 0.05, sx * hw + 0.05, h, h + 0.06, -0.32, 0.32, GOLD, M_GOLD);
  // wine bottles + goblets + fruit bowl + candlesticks
  for (let i = 0; i < 5; i++) {
    at(b, -hw + 0.32 + i * 0.36, h + 0.02, 0.0, 0, () => {
      lathe(b, [[0.055, 0], [0.075, 0.04], [0.075, 0.22], [0.045, 0.30], [0.035, 0.34]], 7, mixc(GREEN_D, C.iron, 0.3), M_MIRROR);
      at(b, 0, 0.34, 0, 0, () => cylinder(b, 5, 0.028, 0.026, 0.08, GOLD, M_GOLD, { y0: 0, caps: true }));
    });
  }
  for (let i = 0; i < 4; i++) {
    at(b, -hw + 0.55 + i * 0.30, h + 0.02, 0.18, 0, () => {
      lathe(b, [[0.035, 0], [0.055, 0.02], [0.03, 0.08], [0.06, 0.16], [0.055, 0.20]], 7, SILVER, M_SILVER);
    });
  }
  at(b, 0, h + 0.02, 0.02, 0, () => {
    lathe(b, [[0.10, 0], [0.26, 0.06], [0.34, 0.18], [0.30, 0.24]], 10, GOLD, M_GOLD);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU;
      at(b, Math.cos(a) * 0.16, 0.22, Math.sin(a) * 0.16, 0, () => ellipsoid(b, 0.09, 0.085, 0.09, 5, 3, i % 3 ? mixc(C.bloomPink, C.bloomYellow, 0.5) : mixc(C.leaf, C.bloomYellow, 0.55), M_LEAF));
    }
  });
  for (const sx of [-1, 1]) at(b, sx * (hw - 0.30), h + 0.02, -0.02, 0, () => candlestick(b));
  void R;
}

function banquetCarpet(b) {
  const xr = 5.6, z0 = -12.8, z1 = 12.4;
  fw(b, FY + 0.010, -xr, xr, z0, z1, RED, M_CARPET, UP);
  fw(b, FY + 0.012, -xr + 0.34, xr - 0.34, z0 + 0.30, z1 - 0.30, mixc(RED, C.gold, 0.08), M_CARPET_HI, UP);
  for (const s of [-1, 1]) fw(b, FY + 0.014, s * (xr - 0.36), s * (xr - 0.18), z0 + 0.30, z1 - 0.30, GOLD, M_GOLD, UP);
  for (const z of [z0, z1]) fw(b, FY + 0.014, -xr + 0.30, xr - 0.30, z - 0.18, z + 0.18, GOLD, M_GOLD, UP);
  // medallions + corner lozenges
  for (let i = 0; i < 6; i++) {
    const z = z0 + 2.2 + i * 4.15;
    at(b, 0, FY + 0.016, z, 0, () => {
      // gold ring + wine field + blue cartouche + small gold lozenges around it
      ringFlat(b, 1.35, 1.55, 0, 0.58, GOLD, M_GOLD);
      discFlat(b, 1.35, 0.001, 0.58, RED_HI, M_CARPET_HI);
      ringFlat(b, 0.78, 0.90, 0.004, 0.40, GOLD_HI, M_GOLD_HI);
      discFlat(b, 0.78, 0.005, 0.40, BLUE, M_VELVET);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU;
        at(b, Math.cos(a) * 1.75, 0.003, Math.sin(a) * 1.1, -a, () => {
          b.quad([-0.22, 0, 0], [0, 0, 0.14], [0.22, 0, 0], [0, 0, -0.14], GOLD, M_GOLD, UP);
        });
      }
    });
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    at(b, sx * (xr - 1.5), FY + 0.016, sz > 0 ? z1 - 1.6 : z0 + 1.6, deg(45), () => {
      b.quad([-0.8, 0, 0], [0, 0, 0.45], [0.8, 0, 0], [0, 0, -0.45], GOLD, M_GOLD, UP);
    });
  }
}

function buildBanquet(b, R) {
  banquetCarpet(b);
  banquetLongTable(b, R);
  banquetWalls(b, R);
  // ---- front wall: windows, portraits, music corner
  for (const c of [-7.35, 6.9]) {
    windowZ(b, ZF, c, 2.35, 31.0, 36.35, 1.175, true);
    windowZ(b, ZF, c, 2.55, 37.4, 43.0, 1.275, true);
  }
  framedArt(b, 'z', ZF, 4.75, 1.55, 2.6, 31.6, R, 1);
  mirrorWall(b, 'z', ZF, -5.25, 1.45, 2.6, 31.6, R);
  framedArt(b, 'z', ZF, -5.25, 1.45, 1.9, 39.6, R, 2);
  framedArt(b, 'z', ZF, 4.75, 1.55, 1.9, 39.6, R, 3);
  piano(b, -5.5, -12.4, deg(58));
  harp(b, 5.5, -13.0, deg(-56));
  musicStand(b, 4.0, -10.6, deg(-40));
  musicStand(b, -3.6, -10.0, deg(30));
  // ---- ceiling chandeliers above the table
  for (const cz of [-7.4, -3.7, 0, 3.7, 7.4]) chandelier(b, 0, cz, CY - 0.05, 1.15);
  // ---- citrus trees in tubs at the corners + palms
  for (const [px, pz, ps] of [[-5.9, 14.3, 1.1], [6.0, 14.3, 1.1], [-6.0, -14.2, 1.0], [6.1, -14.2, 1.0]]) palm(b, R, px, pz, ps);
  // ---- lights (fire glow + chandelier pool)
  point(0, FY + 1.5, 14.9, mixc(C.sunGlow, C.bloomRed, 0.30), 17, 0.85);
  lantern(0, FY + 1.0, 15.2, 1.6, 0.5, mixc(C.sunGlow, C.bloomRed, 0.35));
  point(0, FY + 4.1, 0.0, mixc(C.sunGlow, GOLD_HI, 0.32), 34, 0.78);
  point(0, 37.8, -8.0, mixc(C.sunGlow, C.cloudLit, 0.30), 30, 0.70);
  point(0, 37.8, 8.0, mixc(C.sunGlow, C.cloudLit, 0.30), 30, 0.68);
  point(0, FY + 4.0, 14.2, mixc(C.sunGlow, GOLD_HI, 0.30), 20, 0.80);
  point(-6.4, FY + 2.6, -12.0, mixc(C.sunGlow, C.bloomRed, 0.18), 16, 0.55);
  point(6.4, FY + 2.6, -12.0, mixc(C.sunGlow, C.bloomRed, 0.18), 16, 0.55);
}

// ================================================================ entrance point
function buildHall(b, s) {
  b.push([s, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, s * ROOM.cx, 0, ROOM.cz, 1]);
  LIGHTS.length = 0;
  try {
    const R = mulberry32(ROOM.seed + (s > 0 ? 0 : 977));
    shellDress(b);
    if (s > 0) buildLibrary(b, R);
    else buildBanquet(b, R);
  } finally {
    b.pop();
  }
}

export function buildWingRooms(b, ctx, s) {
  b.note && b.note(s > 0 ? 'palaceLibrary' : 'palaceBanquet');
  const depth = b.stack.length;
  try {
    buildHall(b, s);
  } catch (e) {
    while (b.stack.length > depth) b.pop();
    throw e;
  }
  // mirror the recorded lights into world space (palace-check calls us without lanterns)
  for (const L of LIGHTS) {
    const p = [s * (ROOM.cx + L.p[0]), L.p[1], ROOM.cz + L.p[2]];
    if (L.kind === 0) {
      if (ctx.points) ctx.points.push({ p, col: L.col, range: L.range, int: L.int });
    } else if (ctx.lanterns) {
      ctx.lanterns.push({ p, size: L.size, rot: 0, alpha: L.alpha, shape: L.shape, col: L.col });
    }
  }
  LIGHTS.length = 0;
}
