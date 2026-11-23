// PALACE-HALL — the rotunda interior of the palace (owner: agent "palace-hall").
// Contract: src/palace-plan.js (PAL.hall / PAL.rearWindow / PC / PM).
// Called by world.js as buildPalaceHall(b, ctx, rng).
//
// The shell (cylinder wall, floor slab, rear wall, outer dome) belongs to
// src/palace.js — this module adds only what the visitor sees from inside:
//   floor    marble parquet: sunburst medallion, 12 radial rays, ring bands
//   colonnade 12 fluted columns on r=12.6 + gilded architrave/frieze/cornice (46..49)
//   wall      11 arched niches (6 statues / 5 glowing mirror plates), pilasters,
//             a gilded portal surround at the entrance bay
//   drum      12 tall arched clerestory windows (52.5..59.5) with gold tracery
//   dome      coffered inner shell 62..76 with gilded ribs and an open oculus
//   apse      a glowing stained-glass screen on the rear wall
//   props     a three-tier chandelier hanging from a gold canopy, 4 benches, 2 urns
//   lights    7 warm points round the colonnade + oculus daylight + apse glow
//
// Hard envelope: horizontal radius <= 15.25 about (0, 144), y in 30..77.5, and
// nothing may enter the 5 m sphere around the oculus (0, 76, 144) above y=69.
// Everything below is built inside that envelope.
import { PAL, PC, PM, YAW } from './palace-plan.js';
import { box, cylinder, lathe, mixc, mulc } from './geo.js';
import { ellipsoid, tubePath, MT } from './lib3d.js';
import { TAU } from './math.js';

const H = PAL.hall;
const DM = PAL.dome;
const RW = PAL.rearWindow;
const CX = H.cx, CZ = H.cz;
const FY = H.floorY;              // 30
const NCOL = H.colN;              // 12
const COL_R = H.colR;             // 12.6
const ENT0 = H.colTopY;           // 46
const ENT1 = H.entabTopY;         // 49
const DRUM_Y = H.drumTopY;        // 62 (inner dome springs here)
const OCULUS_Y = H.oculusY;       // 76
const PORTAL = PAL.portal;        // entrance tunnel (shell)

const SEG = 48;                   // ring / drum smoothness
const SEG_F = 64;                 // floor smoothness

// ---------------------------------------------------------------- palette
// The interior is lit almost entirely by emissive materials + point lights, so the
// stone is knocked back ~7% and pulled a touch warm-grey: the gilding and the blue
// floor rays then keep their separation instead of drowning in white.
const WALL = mulc(mixc(PC.hallWall, PC.stoneSh, 0.30), 0.93);
const WALL_HI = mulc(mixc(PC.hallWallHi, PC.stoneSh, 0.26), 0.94);
const SHADE = mulc(mixc(PC.hallShade, PC.slate, 0.10), 0.92);
const DOME_COL = PC.hallDome, RIB = PC.hallRib;
const GOLD = PC.gold, GOLD_HI = PC.goldHi;
const FLOOR_A = PC.floorA, FLOOR_B = PC.floorB;
const FLOOR_G = mixc(PC.gold, PC.goldHi, 0.22);
const MARBLE = PC.marble, MARBLE_HI = PC.marbleHi, MARBLE_SH = PC.marbleSh;
const GLOW = PC.glow, GLOW_SKY = PC.glowSky;
const NAVY = mixc(PC.slateLo, PC.slate, 0.32);
const NAVY_HI = mixc(PC.slate, PC.glassWin, 0.45);
const M_WALL = PM.hall, M_FLOOR = PM.hallFloor;
// gilding: a touch more self-light than PM.hallGold so the gold reads gold inside
// the shaded rotunda (the shared material stays untouched)
const M_GOLD = [0.16, 0.88];
const M_GLOW = PM.glow, M_MARBLE = PM.marble, M_STONE = PM.stone, M_POLISH = PM.marble;

// ---------------------------------------------------------------- helpers
// column-major TRS (same convention as terrace.js): local +X = (cos,0,sin),
// local +Z = (-sin,0,cos).
function mtr(x, y, z, yaw = 0, s = 1) {
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  return [c * s, 0, sn * s, 0, 0, s, 0, 0, -sn * s, 0, c * s, 0, x, y, z, 1];
}
function at(b, x, y, z, yaw, fn) {
  b.push(mtr(x, y, z, yaw));
  fn();
  b.pop();
}
// place a frame ON the hall wall at angle ang / radius rad. y is the world height
// of the frame origin; local +Z points INTO the hall, local +X is tangential.
function wallAt(b, ang, rad, y, fn) {
  at(b, CX + Math.cos(ang) * rad, y, CZ + Math.sin(ang) * rad, ang + Math.PI / 2, fn);
}
// the shell cuts a wide rear opening for the apse: |x| <= 6.1, y <= 46 (see
// palace.js). Any wall band that would cross it must be broken.
const APSE_CUT = { halfW: 6.1, top: 46.2 };
function inApseCut(ang, y, rad) {
  if (y > APSE_CUT.top) return false;
  const x = Math.cos(ang) * (rad || 14.9);
  return Math.sin(ang) > 0 && Math.abs(x) < APSE_CUT.halfW + 0.25;
}
// a vertical band of ring wall (inward facing by default), radius r, y0..y1
function cylBand(b, r, y0, y1, seg, col, mat, inward = true, tint = 1, cutApse = false) {
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU, am = (a0 + a1) * 0.5;
    if (cutApse && inApseCut(am, (y0 + y1) * 0.5, r)) continue;
    const sh = tint * (0.955 + 0.05 * Math.cos(am + 0.7));
    const N = [Math.cos(am) * (inward ? -1 : 1), 0, Math.sin(am) * (inward ? -1 : 1)];
    b.quad(
      [CX + Math.cos(a0) * r, y0, CZ + Math.sin(a0) * r],
      [CX + Math.cos(a1) * r, y0, CZ + Math.sin(a1) * r],
      [CX + Math.cos(a1) * r, y1, CZ + Math.sin(a1) * r],
      [CX + Math.cos(a0) * r, y1, CZ + Math.sin(a0) * r],
      mulc(col, sh), mat, N);
  }
}
// flat horizontal annulus / disc (up = faces the sky / down = faces the floor)
function ringY(b, r0, r1, y, seg, col, mat, up = true, colFn, cutApse = false) {
  const N = [0, up ? 1 : -1, 0];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU, am = (a0 + a1) * 0.5;
    if (cutApse && inApseCut(am, y, r1)) continue;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const cc = colFn ? colFn(i) : col;
    b.quad([CX + c0 * r0, y, CZ + s0 * r0], [CX + c1 * r0, y, CZ + s1 * r0],
      [CX + c1 * r1, y, CZ + s1 * r1], [CX + c0 * r1, y, CZ + s0 * r1], cc, mat, N);
  }
}
function discY(b, r, y, seg, col, mat, up = true) {
  const N = [0, up ? 1 : -1, 0];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    b.tri([CX, y, CZ], [CX + Math.cos(a0) * r, y, CZ + Math.sin(a0) * r],
      [CX + Math.cos(a1) * r, y, CZ + Math.sin(a1) * r], col, mat, N);
  }
}
// flat annulus in the local XY plane at z (faces +Z), for window tracery / halos
function ringFace(b, r0, r1, cy, cz, seg, col, mat) {
  const N = [0, 0, 1];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    b.quad([c0 * r0, cy + s0 * r0, cz], [c1 * r0, cy + s1 * r0, cz],
      [c1 * r1, cy + s1 * r1, cz], [c0 * r1, cy + s0 * r1, cz], col, mat, N);
  }
}
// a small gilded boss / patera facing +Z in the local frame
function patera(b, cy, cz, r, col = GOLD, mat = M_GOLD) {
  ringFace(b, r * 0.5, r, cy, cz, 8, col, mat);
  b.tri([0, cy + r * 0.42, cz + 0.02], [-r * 0.5, cy - r * 0.34, cz + 0.02], [r * 0.5, cy - r * 0.34, cz + 0.02],
    GOLD_HI, mat, [0, 0, 1], [0, 0, 1], [0, 0, 1]);
}

// ---------------------------------------------------------------- 1. floor
function buildFloor(b) {
  const Y = FY + 0.035;
  // ---- cut marble field (subtle tile tones so it never reads as one flat disc)
  const rs = [0, 1.6, 3.2, 4.65, 6.6, 8.7, 10.9, 12.9, 14.6];
  for (let j = 0; j < rs.length - 1; j++) {
    const r0 = rs[j], r1 = rs[j + 1];
    for (let i = 0; i < SEG_F; i++) {
      const a0 = (i / SEG_F) * TAU, a1 = ((i + 1) / SEG_F) * TAU;
      const tone = 0.945 + 0.06 * (((i * 3 + j * 5) % 4) / 3);
      const c = mulc(j % 2 === 0 ? FLOOR_A : mixc(FLOOR_A, FLOOR_B, 0.32), tone);
      b.quad([CX + Math.cos(a0) * r0, Y, CZ + Math.sin(a0) * r0],
        [CX + Math.cos(a1) * r0, Y, CZ + Math.sin(a1) * r0],
        [CX + Math.cos(a1) * r1, Y, CZ + Math.sin(a1) * r1],
        [CX + Math.cos(a0) * r1, Y, CZ + Math.sin(a0) * r1], c, M_FLOOR, [0, 1, 0]);
    }
  }
  // ---- 12 radial rays (gold / deep blue), from the medallion out to r=13.5
  const rayOuter = 13.5, rayInner = 4.65, hw = 0.19;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + Math.PI / 24;
    const isGold = i % 2 === 0;
    const col = isGold ? FLOOR_G : NAVY;
    const ca = Math.cos(a), sa = Math.sin(a);
    const nx = -sa, nz = ca;      // tangent
    const yR = Y + 0.008;
    const P = (r, w) => [CX + ca * r + nx * w, yR, CZ + sa * r + nz * w];
    b.quad(P(rayInner, -hw), P(rayOuter, -hw), P(rayOuter, hw), P(rayInner, hw), col, M_POLISH, [0, 1, 0]);
    // thin gilded border on both sides of a dark ray
    if (!isGold) {
      const yB = Y + 0.006;
      const Q = (r, w) => [CX + ca * r + nx * w, yB, CZ + sa * r + nz * w];
      b.quad(Q(rayInner, -hw - 0.07), Q(rayOuter, -hw - 0.07), Q(rayOuter, -hw), Q(rayInner, -hw), FLOOR_G, M_POLISH, [0, 1, 0]);
      b.quad(Q(rayInner, hw), Q(rayOuter, hw), Q(rayOuter, hw + 0.07), Q(rayInner, hw + 0.07), FLOOR_G, M_POLISH, [0, 1, 0]);
    }
  }
  // ---- concentric border bands (Versailles-style)
  const bands = [
    [13.5, 13.72, NAVY, 0.010],
    [13.72, 13.9, FLOOR_G, 0.012],
    [13.9, 14.28, MARBLE_HI, 0.010],
    [14.28, 14.44, FLOOR_G, 0.012],
    [14.44, 14.6, NAVY, 0.010],
  ];
  for (const [r0, r1, col, dy] of bands) ringY(b, r0, r1, Y + dy, SEG_F, col, M_POLISH, true);
  // fine gilded rim at the very edge + a low wall step that closes the gap to r=15
  ringY(b, 14.58, 14.63, Y + 0.016, SEG_F, GOLD_HI, M_GOLD, true);
  ringY(b, 14.6, 14.95, FY + 0.10, SEG_F, MARBLE_HI, M_MARBLE, true);
  cylBand(b, 14.6, FY + 0.04, FY + 0.10, SEG_F, MARBLE, M_MARBLE, true);
  // ---- central medallion: gilded sunburst / compass rose, r <= 4.65
  const y0 = Y + 0.012;
  ringY(b, 4.42, 4.65, y0, SEG_F, FLOOR_G, M_POLISH, true);
  ringY(b, 4.16, 4.42, y0 + 0.002, SEG_F, NAVY, M_POLISH, true);
  ringY(b, 3.95, 4.16, y0 + 0.003, SEG_F, GOLD_HI, M_POLISH, true);
  discY(b, 3.95, y0 + 0.004, SEG_F, mixc(FLOOR_A, MARBLE_HI, 0.5), M_POLISH, true);
  // 16 sun rays, alternating gold / pale ivory
  for (let i = 0; i < 16; i++) {
    const a0 = (i / 16) * TAU, a1 = ((i + 1) / 16) * TAU, am = (a0 + a1) * 0.5;
    const wOut = 0.20, rIn = 1.25, rOut = 3.55;
    const col = i % 2 === 0 ? FLOOR_G : mixc(FLOOR_G, GOLD_HI, 0.65);
    const p0 = [CX + Math.cos(am - 0.09) * rOut, y0 + 0.006, CZ + Math.sin(am - 0.09) * rOut];
    const p1 = [CX + Math.cos(am + 0.09) * rOut, y0 + 0.006, CZ + Math.sin(am + 0.09) * rOut];
    const p2 = [CX + Math.cos(am) * rIn, y0 + 0.006, CZ + Math.sin(am) * rIn];
    b.tri(p0, p1, p2, col, M_POLISH, [0, 1, 0], [0, 1, 0], [0, 1, 0]);
    void wOut;
  }
  discY(b, 1.62, y0 + 0.008, 32, mixc(FLOOR_G, GOLD_HI, 0.5), M_POLISH, true);
  discY(b, 1.42, y0 + 0.010, 32, NAVY, M_POLISH, true);
  ringY(b, 1.44, 1.62, y0 + 0.010, 32, GOLD_HI, M_GOLD, true);
  ringY(b, 1.20, 1.26, y0 + 0.011, 32, GOLD, M_GOLD, true);
  // sixteen-point gilded star at the very centre
  for (let i = 0; i < 16; i++) {
    const a0 = (i / 16) * TAU, a1 = ((i + 1) / 16) * TAU;
    const am = (a0 + a1) * 0.5;
    const rIn = 0.30, rOut = i % 2 === 0 ? 1.16 : 0.62;
    b.tri([CX + Math.cos(am - 0.16) * rIn, y0 + 0.013, CZ + Math.sin(am - 0.16) * rIn],
      [CX + Math.cos(am + 0.16) * rIn, y0 + 0.013, CZ + Math.sin(am + 0.16) * rIn],
      [CX + Math.cos(am) * rOut, y0 + 0.013, CZ + Math.sin(am) * rOut],
      i % 2 === 0 ? GOLD_HI : GOLD, M_GOLD, [0, 1, 0], [0, 1, 0], [0, 1, 0]);
  }
  // centre boss: gilded rosette
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    b.push(mtr(CX + Math.cos(a) * 0.62, y0 + 0.014, CZ + Math.sin(a) * 0.62, a));
    ellipsoid(b, 0.26, 0.05, 0.14, 5, 2, GOLD_HI, M_GOLD);
    b.pop();
  }
  discY(b, 0.62, y0 + 0.016, 16, mixc(GOLD, MARBLE_HI, 0.35), M_GOLD, true);
  // ---- dark entrance apron: the inner threshold, an arc band in front of the door
  const A = -Math.PI / 2;
  const nSeg = 10, half = 0.30;
  for (let i = 0; i < nSeg; i++) {
    const u0 = -half + (2 * half) * (i / nSeg), u1 = -half + (2 * half) * ((i + 1) / nSeg);
    const r0 = 12.5, r1 = 14.6;
    const P = (u, r) => [CX + Math.cos(A + u) * r, Y + 0.014, CZ + Math.sin(A + u) * r];
    b.quad(P(u0, r0), P(u1, r0), P(u1, r1), P(u0, r1), NAVY_HI, M_POLISH, [0, 1, 0]);
  }
  for (const rr of [12.55, 14.55]) {
    for (let i = 0; i < nSeg; i++) {
      const u0 = -half + (2 * half) * (i / nSeg), u1 = -half + (2 * half) * ((i + 1) / nSeg);
      const P = (u, r) => [CX + Math.cos(A + u) * r, Y + 0.017, CZ + Math.sin(A + u) * r];
      b.quad(P(u0, rr - 0.06), P(u1, rr - 0.06), P(u1, rr + 0.06), P(u0, rr + 0.06), GOLD, M_GOLD, [0, 1, 0]);
    }
  }
  // ---- radial joint lines over the field (cheap, reads as cut stone)
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU + 0.05;
    const ca = Math.cos(a), sa = Math.sin(a), nx = -sa * 0.035, nz = ca * 0.035;
    b.quad([CX + ca * 6.6 - nx, Y + 0.004, CZ + sa * 6.6 - nz], [CX + ca * 13.4 - nx, Y + 0.004, CZ + sa * 13.4 - nz],
      [CX + ca * 13.4 + nx, Y + 0.004, CZ + sa * 13.4 + nz], [CX + ca * 6.6 + nx, Y + 0.004, CZ + sa * 6.6 + nz],
      mixc(FLOOR_B, MARBLE_SH, 0.55), M_POLISH, [0, 1, 0]);
  }
}

// ---------------------------------------------------------------- 2. colonnade
function columnGeom(b) {
  const HGT = H.colH;                 // 16 m: floor -> y = 46
  // stepped plinth
  at(b, 0, 0.14, 0, 0, () => box(b, 2.10, 0.28, 2.10, WALL, M_WALL, { topCol: MARBLE_HI }));
  at(b, 0, 0.44, 0, 0, () => box(b, 1.78, 0.32, 1.78, WALL_HI, M_WALL, { topCol: MARBLE_HI }));
  // attic base moulding
  cylinder(b, 16, 0.84, 0.74, 0.14, MARBLE, M_MARBLE, { y0: 0.62, caps: false });
  cylinder(b, 16, 0.74, 0.62, 0.10, MARBLE_HI, M_MARBLE, { y0: 0.76, caps: false });
  cylinder(b, 16, 0.62, 0.60, 0.08, GOLD, M_GOLD, { y0: 0.86, caps: false });
  // fluted shaft: 24 facets, alternate facets slightly deeper + cooler so the
  // column reads as 12 flutes at eye level and as a smooth ivory column at distance
  const shaftY = 0.94, shaftTop = 14.55;
  const mid = shaftY + (shaftTop - shaftY) * 0.55;
  const SEGC = 24;
  for (let i = 0; i < SEGC; i++) {
    const a0 = (i / SEGC) * TAU, a1 = ((i + 1) / SEGC) * TAU, am = (a0 + a1) * 0.5;
    const deep = i % 2 === 0;
    const rLo = 0.600 - (deep ? 0.022 : 0);
    const rMid = 0.556 - (deep ? 0.020 : 0);
    const rHi = 0.505 - (deep ? 0.018 : 0);
    const c0 = mulc(deep ? mixc(WALL_HI, SHADE, 0.22) : WALL_HI, deep ? 1.0 : 1.02);
    const N0 = [Math.cos(am), 0.10, Math.sin(am)];
    b.quad([Math.cos(a0) * rLo, shaftY, Math.sin(a0) * rLo], [Math.cos(a1) * rLo, shaftY, Math.sin(a1) * rLo],
      [Math.cos(a1) * rMid, mid, Math.sin(a1) * rMid], [Math.cos(a0) * rMid, mid, Math.sin(a0) * rMid], c0, M_WALL, N0);
    b.quad([Math.cos(a0) * rMid, mid, Math.sin(a0) * rMid], [Math.cos(a1) * rMid, mid, Math.sin(a1) * rMid],
      [Math.cos(a1) * rHi, shaftTop, Math.sin(a1) * rHi], [Math.cos(a0) * rHi, shaftTop, Math.sin(a0) * rHi], c0, M_WALL, N0);
  }
  // neck ring
  cylinder(b, 18, 0.505, 0.545, 0.14, GOLD, M_GOLD, { y0: 14.55, caps: false });
  // echinus + abacus + gilded band
  cylinder(b, 18, 0.545, 0.80, 0.42, WALL_HI, M_WALL, { y0: 14.69, caps: false });
  cylinder(b, 18, 0.80, 0.86, 0.16, GOLD, M_GOLD, { y0: 14.95, caps: false });
  at(b, 0, 15.27, 0, 0, () => box(b, 1.80, 0.28, 1.80, WALL_HI, M_WALL, { topCol: MARBLE_HI }));
  at(b, 0, 15.62, 0, 0, () => box(b, 2.02, 0.42, 2.02, WALL, M_WALL, { topCol: MARBLE_HI }));
  // abacus rosettes + acanthus lobes
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    const c = Math.cos(a), s = Math.sin(a);
    b.push(mtr(c * 0.92, 15.62, s * 0.92, -a + Math.PI / 2));
    ellipsoid(b, 0.11, 0.10, 0.10, 4, 2, GOLD_HI, M_GOLD);
    b.pop();
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const c = Math.cos(a), s = Math.sin(a);
    b.push(mtr(c * 0.70, 14.72, s * 0.70, -a + Math.PI / 2));
    ellipsoid(b, 0.14, 0.26, 0.09, 4, 2, mixc(WALL_HI, MARBLE, 0.5), M_WALL);
    b.pop();
  }
  // gilded collar on the plinth
  at(b, 0, 0.60, 0, 0, () => box(b, 1.92, 0.08, 1.92, GOLD, M_GOLD));
  void HGT;
}
function buildColonnade(b) {
  for (let i = 0; i < NCOL; i++) {
    const ang = -Math.PI / 2 + Math.PI / NCOL + (i / NCOL) * TAU;
    wallAt(b, ang, COL_R, FY, () => columnGeom(b));
  }
}

// ---------------------------------------------------------------- 3. entablature
function buildEntablature(b) {
  const y = ENT0;
  // architrave: two fasciae, the lower one stepping out into the room
  ringY(b, 12.30, 13.30, y, SEG, marb1(), M_WALL, false);
  cylBand(b, 12.30, y, y + 0.40, SEG, WALL_HI, M_WALL, true);
  ringY(b, 12.22, 13.34, y + 0.40, SEG, GOLD, M_GOLD, false);
  cylBand(b, 12.22, y + 0.40, y + 0.92, SEG, WALL_HI, M_WALL, true);
  ringY(b, 12.18, 13.40, y + 0.92, SEG, RIB, M_WALL, false);
  // frieze: a pale lapis-marble band with gilded paterae, so the ivory order
  // never reads as one single colour
  cylBand(b, 12.18, y + 0.92, y + 1.80, SEG, mixc(PC.slateHi, MARBLE, 0.66), M_WALL, true);
  for (let i = 0; i < 24; i++) {
    const ang = (i / 24) * TAU + Math.PI / 48;
    wallAt(b, ang, 12.16, 0, () => at(b, 0, y + 1.38, 0, 0, () => patera(b, 0, 0, 0.20)));
  }
  // cornice: three projecting rings + dentils under the corona
  ringY(b, 12.12, 13.50, y + 1.80, SEG, MARBLE_HI, M_MARBLE, false);
  cylBand(b, 12.12, y + 1.80, y + 2.10, SEG, WALL_HI, M_WALL, true);
  ringY(b, 12.02, 13.56, y + 2.10, SEG, GOLD_HI, M_GOLD, false);
  cylBand(b, 12.02, y + 2.10, y + 2.34, SEG, MARBLE_HI, M_MARBLE, true);
  // dentils
  for (let i = 0; i < 64; i++) {
    const ang = (i / 64) * TAU;
    wallAt(b, ang, 12.16, 0, () => at(b, 0, y + 2.04, 0.10, 0, () => box(b, 0.17, 0.24, 0.26, MARBLE_HI, M_MARBLE)));
  }
  // corona undersides / steps
  ringY(b, 11.94, 13.60, y + 2.34, SEG, MARBLE, M_MARBLE, false);
  cylBand(b, 11.94, y + 2.34, y + 2.72, SEG, MARBLE_HI, M_MARBLE, true);
  ringY(b, 11.86, 13.66, y + 2.72, SEG, GOLD, M_GOLD, false);
  cylBand(b, 11.86, y + 2.72, y + 3.0, SEG, MARBLE_HI, M_MARBLE, true);
  // the flat top of the order: reads from the dome viewpoint, so decorate it
  ringY(b, 11.80, 15.0, y + 3.0, SEG, mixc(WALL_HI, MARBLE, 0.3), M_WALL, true, (i) => {
    const t = 0.94 + 0.05 * ((i % 4) / 3);
    return mulc(mixc(WALL_HI, MARBLE, 0.3), t);
  });
  ringY(b, 12.4, 12.62, y + 3.012, SEG, GOLD, M_GOLD, true);
  ringY(b, 13.9, 14.12, y + 3.012, SEG, RIB, M_GOLD, true);
  // a gilded inner lip where the order meets the drum wall
  cylBand(b, 14.86, y + 3.0, y + 3.22, SEG, GOLD, M_GOLD, true);
}
function marb1() { return MARBLE; }

// attic band between the order and the clerestory (49..52.5): wall panels + trim
function buildAttic(b) {
  const y0 = ENT1;                       // 49
  cylBand(b, 14.90, y0 + 0.22, y0 + 3.20, SEG, WALL, M_WALL, true);
  ringY(b, 14.6, 14.9, y0 + 0.16, SEG, MARBLE, M_MARBLE, false);
  cylBand(b, 14.72, y0 + 0.16, y0 + 0.30, SEG, GOLD, M_GOLD, true);
  cylBand(b, 14.80, y0 + 3.20, y0 + 3.42, SEG, GOLD, M_GOLD, true);
  // shallow relief panels + paterae round the attic
  for (let i = 0; i < 24; i++) {
    const ang = (i / 24) * TAU + Math.PI / 24;
    wallAt(b, ang, 14.88, 0, () => {
      at(b, 0, y0 + 1.72, 0.02, 0, () => box(b, 1.15, 2.30, 0.10, mixc(WALL, MARBLE_SH, 0.18), M_WALL));
      at(b, 0, y0 + 1.72, 0.08, 0, () => patera(b, 0, 0, 0.26));
    });
  }
  // small cornice above the attic / under the windows
  ringY(b, 14.55, 14.95, y0 + 3.42, SEG, MARBLE_HI, M_MARBLE, false);
  cylBand(b, 14.55, y0 + 3.42, y0 + 3.52, SEG, MARBLE_HI, M_MARBLE, true);
}

// ---------------------------------------------------------------- 4. niches
// One wall niche in its own frame: origin on the wall face at r=14.42, y=0 at
// the floor, local +Z into the hall.
function nicheGeom(b, kind, rng, idx) {
  const BASE = 0.62;                 // opening sill height above the floor
  const hx = 1.10;                   // opening half width
  const spring = BASE + 4.55;        // arch springing
  const apex = spring + hx;          // 6.27
  const zBack = -0.44, zFace = 0;
  // back panel: rectangle + semicircular head (a shallow arched cassette)
  b.quad([-hx, BASE, zBack], [hx, BASE, zBack], [hx, spring, zBack], [-hx, spring, zBack],
    kind === 'statue' ? mixc(SHADE, PC.slate, 0.26) : mixc(SHADE, WALL, 0.20), M_WALL, [0, 0, 1]);
  for (let i = 0; i < 7; i++) {
    const a0 = Math.PI * (i / 7), a1 = Math.PI * ((i + 1) / 7);
    b.tri([0, spring, zBack], [Math.cos(a1) * hx, spring + Math.sin(a1) * hx, zBack],
      [Math.cos(a0) * hx, spring + Math.sin(a0) * hx, zBack], mixc(SHADE, PC.slate, 0.22), M_WALL,
      [0, 0, 1], [0, 0, 1], [0, 0, 1]);
  }
  // splayed side reveals + arch soffit (gives the niche real depth)
  for (const sx of [-1, 1]) {
    b.quad([sx * hx, BASE, zBack], [sx * hx, BASE, zFace], [sx * hx, spring, zFace], [sx * hx, spring, zBack],
      SHADE, M_WALL, [-sx, 0, 0]);
  }
  for (let i = 0; i < 7; i++) {
    const a0 = Math.PI * (i / 7), a1 = Math.PI * ((i + 1) / 7);
    const p0 = [Math.cos(a0) * hx, spring + Math.sin(a0) * hx];
    const p1 = [Math.cos(a1) * hx, spring + Math.sin(a1) * hx];
    const am = (a0 + a1) * 0.5;
    b.quad([p0[0], p0[1], zBack], [p1[0], p1[1], zBack], [p1[0], p1[1], zFace], [p0[0], p0[1], zFace],
      mulc(SHADE, 1.04), M_WALL, [Math.cos(am) * 0.4, -Math.sin(am), -0.9]);
  }
  // gilded frame: jambs, arch band, keystone
  for (const sx of [-1, 1]) {
    b.quad([sx * hx, BASE - 0.10, zFace + 0.02], [sx * (hx + 0.20), BASE - 0.10, zFace + 0.02],
      [sx * (hx + 0.20), spring, zFace + 0.02], [sx * hx, spring, zFace + 0.02], GOLD, M_GOLD, [0, 0, 1]);
  }
  for (let i = 0; i < 7; i++) {
    const a0 = Math.PI * (i / 7), a1 = Math.PI * ((i + 1) / 7);
    const P = (a, r) => [Math.cos(a) * r, spring + Math.sin(a) * r, zFace + 0.02];
    b.quad(P(a0, hx), P(a1, hx), P(a1, hx + 0.20), P(a0, hx + 0.20), GOLD_HI, M_GOLD, [0, 0, 1]);
  }
  at(b, 0, apex + 0.10, zFace + 0.06, 0, () => box(b, 0.30, 0.42, 0.16, GOLD, M_GOLD));
  // sill / plinth, with a small step in front
  at(b, 0, BASE * 0.5, -0.10, 0, () => box(b, 2.66, BASE, 0.62, WALL_HI, M_WALL, { topCol: MARBLE_HI }));
  at(b, 0, BASE + 0.12, 0.22, 0, () => box(b, 2.42, 0.24, 0.34, MARBLE, M_MARBLE, { topCol: MARBLE_HI }));
  // bracketed cornice over the niche head (kept shallow: a deep shelf reads as a
  // mushroom cap from inside the rotunda)
  at(b, 0, apex + 0.34, -0.06, 0, () => box(b, 2.66, 0.22, 0.46, WALL_HI, M_WALL, { topCol: MARBLE_HI }));
  at(b, 0, apex + 0.56, -0.08, 0, () => box(b, 2.42, 0.22, 0.38, MARBLE, M_MARBLE, { topCol: MARBLE_HI }));
  // segmental pediment: a curved cornice over a recessed tympanum
  const PW = 1.22, PRISE = 0.34, PY = apex + 0.72;
  const arcY = (u) => PY + Math.sqrt(Math.max(0, 1 - u * u)) * PRISE;
  for (let i = 0; i < 8; i++) {
    const u0 = -1 + (2 * i) / 8, u1 = -1 + (2 * (i + 1)) / 8;
    const x0 = u0 * PW, x1 = u1 * PW;
    // recessed tympanum between the baseline and the arc
    b.quad([x0, PY, -0.30], [x1, PY, -0.30], [x1, arcY(u1), -0.30], [x0, arcY(u0), -0.30],
      mixc(MARBLE_SH, WALL, 0.42), M_WALL, [0, 0, 1]);
    // raking marble cornice + gilded bead
    b.quad([x0, arcY(u0), -0.10], [x1, arcY(u1), -0.10], [x1, arcY(u1) + 0.24, -0.10], [x0, arcY(u0) + 0.24, -0.10],
      MARBLE_HI, M_MARBLE, [0, 0, 1]);
    b.quad([x0, arcY(u0) + 0.26, -0.10], [x1, arcY(u1) + 0.26, -0.10], [x1, arcY(u1) + 0.32, -0.10],
      [x0, arcY(u0) + 0.32, -0.10], GOLD, M_GOLD, [0, 0, 1]);
  }
  // gilded cartouche in the tympanum
  at(b, 0, PY + PRISE * 0.46, -0.26, 0, () => patera(b, 0, 0, 0.26));
  at(b, 0, PY + PRISE * 0.46, -0.22, 0, () => ellipsoid(b, 0.13, 0.09, 0.06, 4, 2, GOLD_HI, M_GOLD));
  // a pair of small gilded consoles under the crown
  for (const sx of [-1, 1]) {
    at(b, sx * 1.12, apex + 0.34, 0.02, 0, () => ellipsoid(b, 0.10, 0.22, 0.10, 4, 2, GOLD, M_GOLD));
  }
  // contents: statue or glowing mirror plate
  if (kind === 'statue') statueGeom(b, rng, idx, BASE);
  else mirrorGeom(b, BASE, spring, hx);
}
function statueGeom(b, rng, idx, BASE) {
  const y0 = BASE;                        // stands on the niche sill
  at(b, 0, y0 + 0.24, 0.10, 0, () => box(b, 1.26, 0.48, 0.92, WALL_HI, M_WALL, { topCol: MARBLE_HI }));
  const by = y0 + 0.48;
  const lean = (idx % 3) - 1;
  // robe
  b.push(mtr(0, by, 0.06, 0));
  lathe(b, [[0.40, 0], [0.36, 0.30], [0.30, 0.85], [0.26, 1.38], [0.29, 1.80], [0.24, 2.02]], 10, MARBLE, M_MARBLE);
  b.pop();
  // torso + shoulders
  at(b, 0, by + 2.20, 0.05, 0.18 * lean, () => box(b, 0.52, 0.56, 0.36, MARBLE_HI, M_MARBLE, { topCol: MARBLE_HI }));
  // cloak falling down the back
  b.quad([-0.30, by + 2.44, -0.16], [0.28, by + 2.44, -0.16], [0.34, by + 0.55, -0.22], [-0.38, by + 0.55, -0.22],
    mixc(MARBLE_SH, MARBLE, 0.45), M_MARBLE, [0, 0, -1]);
  // neck + head
  at(b, 0, by + 2.58, 0.04, 0, () => cylinder(b, 7, 0.10, 0.12, 0.10, MARBLE, M_MARBLE, { y0: 0 }));
  b.push(mtr(0, by + 2.86, 0.05, 0.16 * lean));
  ellipsoid(b, 0.18, 0.21, 0.17, 6, 4, MARBLE_HI, M_MARBLE);
  b.pop();
  // laurel / hair mass
  b.push(mtr(0, by + 3.02, 0.03, 0.16 * lean));
  ellipsoid(b, 0.19, 0.10, 0.18, 6, 3, mixc(MARBLE_SH, MARBLE, 0.35), M_MARBLE);
  b.pop();
  // arms: one raised (blessing / orator), the other holding a scroll
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -0.30, by + 2.30, 0.06, 1]);
  b.push([Math.cos(0.45), -Math.sin(0.45), 0, 0, Math.sin(0.45), Math.cos(0.45), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  box(b, 0.15, 0.72, 0.15, MARBLE, M_MARBLE);
  b.pop();
  b.pop();
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.28, by + 2.24, 0.10, 1]);
  b.push([Math.cos(-0.28), -Math.sin(-0.28), 0, 0, Math.sin(-0.28), Math.cos(-0.28), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  box(b, 0.14, 0.66, 0.14, MARBLE, M_MARBLE);
  b.pop();
  b.pop();
  // gilded laurel wreath in the free hand + a scroll
  b.push(mtr(-0.48, by + 2.86, 0.08, 0.3));
  ellipsoid(b, 0.16, 0.16, 0.05, 6, 2, GOLD, M_GOLD);
  b.pop();
  b.push(mtr(0.42, by + 2.06, 0.14, -0.2));
  cylinder(b, 6, 0.06, 0.06, 0.42, GOLD_HI, M_GOLD, { y0: 0, caps: true });
  b.pop();
  // small relief on the plinth
  at(b, 0, y0 + 0.24, 0.50, 0, () => patera(b, 0, 0, 0.16));
}
function mirrorGeom(b, BASE, spring, hx) {
  // a gilded mirror in a heavy gold frame: a softly lit plate with one hot oval at
  // its heart, so it reads as reflected daylight instead of a blank white panel
  const y0 = BASE + 1.05, y1 = spring - 0.42, hw = hx - 0.40;
  // cool glass border (depth) + softly lit mirror face + arched head
  b.quad([-hw - 0.16, y0 - 0.16, -0.33], [hw + 0.16, y0 - 0.16, -0.33], [hw + 0.16, y1 + 0.20, -0.33], [-hw - 0.16, y1 + 0.20, -0.33],
    mixc(PC.slateHi, SHADE, 0.45), M_WALL, [0, 0, 1]);
  b.quad([-hw, y0, -0.30], [hw, y0, -0.30], [hw, y1, -0.30], [-hw, y1, -0.30],
    mixc(GLOW_SKY, MARBLE_SH, 0.28), MT.lit, [0, 0, 1]);
  for (let i = 0; i < 6; i++) {
    const a0 = Math.PI * (i / 6), a1 = Math.PI * ((i + 1) / 6);
    b.tri([0, y1, -0.30], [Math.cos(a1) * hw, y1 + Math.sin(a1) * hw * 0.95, -0.30],
      [Math.cos(a0) * hw, y1 + Math.sin(a0) * hw * 0.95, -0.30],
      mixc(GLOW_SKY, MARBLE_SH, 0.24), MT.lit, [0, 0, 1], [0, 0, 1], [0, 0, 1]);
  }
  // hot reflected-light oval (PM.glow, the contract's glowing plate)
  discFace(b, 0.50, y0 + (y1 - y0) * 0.62, -0.275, 20, GLOW, M_GLOW);
  discFace(b, 0.30, y0 + (y1 - y0) * 0.62, -0.27, 16, mixc(GLOW, MARBLE_HI, 0.5), M_GLOW);
  ringFace(b, 0.50, 0.63, y0 + (y1 - y0) * 0.62, -0.276, 20, GOLD, M_GOLD);
  // heavy gold frame: jambs, sill, arch band, inner bead
  for (const sx of [-1, 1]) {
    b.quad([sx * hw, y0, -0.28], [sx * (hw + 0.20), y0, -0.28],
      [sx * (hw + 0.20), y1 + 0.30, -0.28], [sx * hw, y1 + 0.30, -0.28], GOLD, M_GOLD, [0, 0, 1]);
  }
  b.quad([-hw - 0.2, y0 - 0.16, -0.28], [hw + 0.2, y0 - 0.16, -0.28],
    [hw + 0.2, y0 + 0.16, -0.28], [-hw - 0.2, y0 + 0.16, -0.28], GOLD, M_GOLD, [0, 0, 1]);
  for (let i = 0; i < 6; i++) {
    const a0 = Math.PI * (i / 6), a1 = Math.PI * ((i + 1) / 6);
    const P = (a, r) => [Math.cos(a) * r, y1 + Math.sin(a) * r * 0.95, -0.28];
    b.quad(P(a0, hw), P(a1, hw), P(a1, hw + 0.20), P(a0, hw + 0.20), GOLD_HI, M_GOLD, [0, 0, 1]);
  }
  // gilded rays across the plate (a jewelled mirror)
  for (let i = 0; i < 3; i++) {
    const yy = y0 + (y1 - y0) * (0.18 + i * 0.28);
    b.quad([-hw + 0.16, yy, -0.272], [hw - 0.16, yy, -0.272], [hw - 0.16, yy + 0.055, -0.272], [-hw + 0.16, yy + 0.055, -0.272],
      mixc(GOLD_HI, GLOW_SKY, 0.35), M_GOLD, [0, 0, 1]);
  }
  // two small glowing flecks on the glass, so the mirror reads as catching daylight
  for (const [fx, fy] of [[-0.34, 0.78], [0.30, 0.58]]) {
    b.push(mtr(fx * hw, y0 + (y1 - y0) * fy, -0.268, 0));
    b.quad([-0.09, -0.22, 0], [0.09, -0.22, 0], [0.09, 0.22, 0], [-0.09, 0.22, 0],
      mixc(GLOW, MARBLE_HI, 0.45), M_GLOW, [0, 0, 1]);
    b.pop();
  }
  // gilded crest above the plate
  at(b, 0, y1 + hw * 0.95 + 0.26, -0.30, 0, () => patera(b, 0, 0, 0.22, GOLD_HI, M_GOLD));
}
function buildNiches(b) {
  // 10 niches: the front bay is the entrance and the rear bay is the apse opening
  for (let k = 0; k < 11; k++) {
    const ang = -Math.PI / 2 + (k + 1) * (TAU / 12);
    if (k === 5) continue;                       // rear bay: the apse opening
    const kind = k % 2 === 0 ? 'statue' : 'mirror';
    wallAt(b, ang, 14.42, FY, () => nicheGeom(b, kind, rngNiche(k), k));
  }
  // gilded medallions above the niches (light spots on the blank wall zone)
  for (let k = 0; k < 11; k++) {
    if (k === 5) continue;
    const ang = -Math.PI / 2 + (k + 1) * (TAU / 12);
    wallAt(b, ang, 14.88, 0, () => {
      // a soft blue-grey marble panel with a gilded frame, then the golden medallion
      at(b, 0, 40.6, 0.02, 0, () => box(b, 2.10, 5.60, 0.10, mixc(PC.slateHi, WALL, 0.46), M_WALL));
      at(b, 0, 40.6, 0.06, 0, () => box(b, 1.94, 5.44, 0.06, mixc(PC.slateHi, MARBLE, 0.62), M_WALL));
      for (const sx of [-1, 1]) {
        at(b, sx * 1.00, 40.6, 0.10, 0, () => box(b, 0.10, 5.52, 0.10, GOLD, M_GOLD));
      }
      at(b, 0, 43.34, 0.10, 0, () => box(b, 2.06, 0.10, 0.10, GOLD, M_GOLD));
      at(b, 0, 37.86, 0.10, 0, () => box(b, 2.06, 0.10, 0.10, GOLD, M_GOLD));
      // a cameo oval framed in gold in the upper third, two gilded bosses below —
      // a painted-palace wall panel rather than a disc lost in an oblong frame
      at(b, 0, 41.55, 0.14, 0, () => ringFace(b, 0.44, 0.56, 0, 0, 20, GOLD, M_GOLD));
      at(b, 0, 41.55, 0.12, 0, () => discFace(b, 0.44, 0, 0, 20, mixc(MARBLE_HI, GLOW_SKY, 0.20), M_MARBLE));
      at(b, 0, 41.55, 0.16, 0, () => patera(b, 0, 0, 0.20, GOLD_HI, M_GOLD));
      for (const yy of [39.55, 38.75]) {
        at(b, 0, yy, 0.14, 0, () => {
          b.push(mtr(0, 0, 0, 0));
          ellipsoid(b, 0.13, 0.16, 0.07, 6, 3, GOLD, M_GOLD);
          b.pop();
        });
      }
      at(b, 0, 44.05, 0.10, 0, () => patera(b, 0, 0, 0.22, GOLD_HI, M_GOLD));
    });
  }
  // engaged pilasters aligned with the columns (wall rhythm behind the order)
  for (let i = 0; i < NCOL; i++) {
    const ang = -Math.PI / 2 + Math.PI / NCOL + (i / NCOL) * TAU;
    if (inApseCut(ang, 40, 14.84)) continue;
    wallAt(b, ang, 14.84, 0, () => {
      at(b, 0, 31.10, 0.06, 0, () => box(b, 1.10, 0.55, 0.34, WALL_HI, M_WALL, { topCol: MARBLE_HI }));
      at(b, 0, (31.4 + 43.2) * 0.5, 0.10, 0, () => box(b, 0.86, 11.8, 0.30, WALL, M_WALL, { topCol: MARBLE_HI }));
      at(b, 0, 43.45, 0.14, 0, () => box(b, 1.16, 0.44, 0.40, GOLD, M_GOLD));
      at(b, 0, 43.90, 0.10, 0, () => patera(b, 0, 0, 0.20));
    });
  }
  // string courses round the lower wall (broken across the apse opening)
  cylBand(b, 14.84, 43.95, 44.30, SEG, GOLD, M_GOLD, true, 1, true);
  cylBand(b, 14.90, 44.30, ENT0 - 0.2, SEG, WALL, M_WALL, true, 1, true);
  cylBand(b, 14.90, ENT0 - 0.32, ENT0 - 0.2, SEG, RIB, M_GOLD, true, 1, true);
  cylBand(b, 14.88, 30.95, 31.30, SEG, RIB, M_GOLD, true, 1, true);
}
// flat disc in the local XY plane facing +Z
function discFace(b, r, cy, cz, seg, col, mat) {
  const N = [0, 0, 1];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    b.tri([0, cy, cz], [Math.cos(a0) * r, cy + Math.sin(a0) * r, cz], [Math.cos(a1) * r, cy + Math.sin(a1) * r, cz], col, mat, N);
  }
}
// deterministic per-niche rng so statue poses vary but stay reproducible
const _nicheRng = [];
function rngNiche(k) {
  if (_nicheRng[k]) return _nicheRng[k];
  const rng = mulberry32Fallback(1000 + k * 37);
  _nicheRng[k] = rng;
  return rng;
}
function mulberry32Fallback(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- 5. clerestory
function clerestoryGeom(b) {
  const hx = 1.00;                    // half width
  const y0 = 0, ySpr = 6.0, yTop = 7.0;
  const zG = 0;                       // glass plane on the wall
  // glass: lower / upper / arch, in three brightness steps (light from above)
  // a graded sky: deeper blue low, pale cyan mid, hot daylight in the crown
  b.quad([-hx, y0, zG], [hx, y0, zG], [hx, 3.4, zG], [-hx, 3.4, zG], mixc(PC.glassSky, PC.slate, 0.30), MT.lit, [0, 0, 1]);
  b.quad([-hx, 3.4, zG], [hx, 3.4, zG], [hx, ySpr, zG], [-hx, ySpr, zG], mixc(GLOW_SKY, PC.glassSky, 0.25), MT.lit, [0, 0, 1]);
  for (let i = 0; i < 8; i++) {
    const a0 = Math.PI * (i / 8), a1 = Math.PI * ((i + 1) / 8);
    b.tri([0, ySpr, zG], [Math.cos(a1) * hx, ySpr + Math.sin(a1) * hx, zG],
      [Math.cos(a0) * hx, ySpr + Math.sin(a0) * hx, zG],
      i < 4 ? mixc(GLOW_SKY, MARBLE_HI, 0.3) : GLOW_SKY, i < 4 ? MT.warm : M_GLOW,
      [0, 0, 1], [0, 0, 1], [0, 0, 1]);
  }
  // gold frame: jambs, sill, arch band, mullions
  for (const sx of [-1, 1]) {
    b.quad([sx * hx, y0, 0.02], [sx * (hx + 0.16), y0, 0.10], [sx * (hx + 0.16), ySpr + 0.3, 0.10],
      [sx * hx, ySpr + 0.3, 0.02], GOLD, M_GOLD, [0, 0, 1]);
    b.quad([sx * hx, y0, 0.02], [sx * hx, ySpr, 0.02], [sx * (hx + 0.16), ySpr + 0.3, 0.10],
      [sx * (hx + 0.16), y0, 0.10], GOLD, M_GOLD, [0, 0, 1]);
  }
  for (let i = 0; i < 8; i++) {
    const a0 = Math.PI * (i / 8), a1 = Math.PI * ((i + 1) / 8);
    const P = (a, r) => [Math.cos(a) * r, ySpr + Math.sin(a) * r, 0.04];
    b.quad(P(a0, hx), P(a1, hx), P(a1, hx + 0.18), P(a0, hx + 0.18), GOLD_HI, M_GOLD, [0, 0, 1]);
  }
  at(b, 0, y0 - 0.16, 0.10, 0, () => box(b, 2.42, 0.28, 0.42, MARBLE_HI, M_MARBLE, { topCol: MARBLE_HI }));
  at(b, 0, yTop + 0.30, 0.08, 0, () => box(b, 2.46, 0.26, 0.40, GOLD, M_GOLD));
  // mullions + transoms
  b.quad([-0.05, y0, 0.03], [0.05, y0, 0.03], [0.05, ySpr, 0.03], [-0.05, ySpr, 0.03], GOLD, M_GOLD, [0, 0, 1]);
  for (const yy of [2.2, 4.4]) {
    b.quad([-hx, yy, 0.035], [hx, yy, 0.035], [hx, yy + 0.08, 0.035], [-hx, yy + 0.08, 0.035], GOLD, M_GOLD, [0, 0, 1]);
  }
  // a gilded console under each window
  at(b, 0, y0 - 0.48, 0.16, 0, () => box(b, 0.60, 0.34, 0.34, MARBLE, M_MARBLE));
}
function buildClerestory(b) {
  for (let i = 0; i < 12; i++) {
    const ang = -Math.PI / 2 + (i + 1) * (TAU / 12);
    wallAt(b, ang, 14.85, 52.5, () => clerestoryGeom(b));
  }
  // drum pilasters between the windows
  for (let i = 0; i < 12; i++) {
    const ang = -Math.PI / 2 + (i + 0.5) * (TAU / 12);
    wallAt(b, ang, 14.78, 0, () => {
      at(b, 0, 52.2, 0.02, 0, () => box(b, 0.86, 0.34, 0.34, MARBLE_HI, M_MARBLE, { topCol: MARBLE_HI }));
      at(b, 0, 56.2, 0.04, 0, () => box(b, 0.62, 7.6, 0.28, WALL_HI, M_WALL, { topCol: MARBLE_HI }));
      at(b, 0, 60.2, 0.06, 0, () => box(b, 0.92, 0.40, 0.38, GOLD, M_GOLD));
      at(b, 0, 55.2, 0.22, 0, () => patera(b, 0, 0, 0.15));
    });
  }
  // drum crown cornice (below the dome springing)
  const y0 = 59.5;
  cylBand(b, 14.86, y0 + 0.4, y0 + 1.6, SEG, WALL, M_WALL, true);
  ringY(b, 14.52, 14.96, y0 + 0.45, SEG, MARBLE_HI, M_MARBLE, false);
  cylBand(b, 14.52, y0 + 0.45, y0 + 0.62, SEG, MARBLE_HI, M_MARBLE, true);
  // dentils round the drum cornice
  for (let i = 0; i < 64; i++) {
    const ang = (i / 64) * TAU;
    wallAt(b, ang, 14.60, 0, () => at(b, 0, y0 + 0.66, 0.10, 0, () => box(b, 0.16, 0.22, 0.26, MARBLE_HI, M_MARBLE)));
  }
  cylBand(b, 14.46, y0 + 0.72, y0 + 1.05, SEG, RIB, M_GOLD, true);
  ringY(b, 14.44, 15.0, y0 + 1.05, SEG, MARBLE, M_MARBLE, false);
  // gilded line under the dome
  cylBand(b, 14.62, 61.05, 61.22, SEG, GOLD_HI, M_GOLD, true);
}

// ---------------------------------------------------------------- 6. inner dome
const DOME_R = 14.92;
const PHI_MAX = Math.asin((OCULUS_Y - DRUM_Y) / DOME_R);   // ~1.219 rad
const OC_R = Math.cos(PHI_MAX) * DOME_R;                   // ~5.16 at y=76
function domeP(theta, phi, rad) {
  const rr = Math.cos(phi) * rad;
  return [CX + Math.cos(theta) * rr, DRUM_Y + Math.sin(phi) * rad, CZ + Math.sin(theta) * rr];
}
function domeN(theta, phi) {
  // inward normal of a sphere centred at (CX, DRUM_Y, CZ)
  const c = Math.cos(phi), s = Math.sin(phi);
  return [-c * Math.cos(theta), -s, -c * Math.sin(theta)];
}
function buildDome(b) {
  const NS = 16;                          // sectors
  const phis = [0, 0.31, 0.62, 0.93, PHI_MAX];
  // ---- coffered panels
  for (let j = 0; j < phis.length - 1; j++) {
    const p0 = phis[j], p1 = phis[j + 1];
    for (let i = 0; i < NS; i++) {
      const t0 = (i / NS) * TAU, t1 = ((i + 1) / NS) * TAU;
      const tm = (t0 + t1) * 0.5, pm = (p0 + p1) * 0.5;
      // ivory field warming toward the rim, sky-washed near the oculus; the
      // alternate tint is what turns the shell into a chequer of coffers
      const t = pm / PHI_MAX;
      let c = mixc(mixc(WALL_HI, DOME_COL, 0.42), mixc(WALL_HI, GLOW_SKY, 0.40), t * t);
      const even = (i + j) % 2 === 0;
      c = even ? mixc(c, MARBLE_HI, 0.28) : mulc(mixc(c, PC.slateHi, 0.30), 0.90);
      const a = domeP(t0, p0, DOME_R), b2 = domeP(t1, p0, DOME_R);
      const c2 = domeP(t1, p1, DOME_R), d = domeP(t0, p1, DOME_R);
      b.quad(a, b2, c2, d, c, M_WALL, domeN(tm, pm));
      // gilded coffer boss: an eight-lobed rosette standing proud of the panel
      const RB = 0.085, RPhi = 0.075;
      const ctr = domeP(tm, pm, DOME_R - 0.20);
      const ringP = [];
      for (let k = 0; k < 8; k++) {
        const a2 = (k / 8) * TAU;
        ringP.push(domeP(tm + Math.cos(a2) * RB, pm + Math.sin(a2) * RPhi, DOME_R - 0.13));
      }
      for (let k = 0; k < 8; k++) {
        b.tri(ctr, ringP[k], ringP[(k + 1) % 8], (i + j) % 2 === 0 ? GOLD : mixc(RIB, GOLD, 0.5), M_GOLD,
          domeN(tm, pm), domeN(tm, pm), domeN(tm, pm));
      }
    }
  }
  // ---- gilded meridian ribs at the 16 sector joints
  for (let i = 0; i < NS; i++) {
    const t = (i / NS) * TAU;
    const dt = (TAU / NS) * 0.075;
    for (let j = 0; j < phis.length - 1; j++) {
      const p0 = phis[j], p1 = phis[j + 1];
      const A0 = domeP(t - dt, p0, DOME_R), A1 = domeP(t - dt, p1, DOME_R);
      const B0 = domeP(t + dt, p0, DOME_R), B1 = domeP(t + dt, p1, DOME_R);
      const M0 = domeP(t, p0, DOME_R - 0.20), M1 = domeP(t, p1, DOME_R - 0.20);
      const N = domeN(t, (p0 + p1) * 0.5);
      b.quad(A0, A1, M1, M0, RIB, M_GOLD, N);
      b.quad(M0, M1, B1, B0, mixc(RIB, WALL_HI, 0.25), M_GOLD, N);
    }
  }
  // ---- horizontal gilded ribs (3 rings between rim and oculus)
  for (const phi of [0.31, 0.62, 0.93]) {
    const dphi = 0.028;
    for (let i = 0; i < 32; i++) {
      const t0 = (i / 32) * TAU, t1 = ((i + 1) / 32) * TAU;
      const tm = (t0 + t1) * 0.5;
      const A0 = domeP(t0, phi - dphi, DOME_R), A1 = domeP(t1, phi - dphi, DOME_R);
      const B0 = domeP(t0, phi, DOME_R - 0.24), B1 = domeP(t1, phi, DOME_R - 0.24);
      const C0 = domeP(t0, phi + dphi, DOME_R), C1 = domeP(t1, phi + dphi, DOME_R);
      const N = domeN(tm, phi);
      b.quad(A0, A1, B1, B0, RIB, M_GOLD, N);
      b.quad(B0, B1, C1, C0, mixc(RIB, WALL_HI, 0.3), M_GOLD, N);
    }
  }
  // ---- gilded band at the dome foot (the shell owns the big rim cornice)
  cylBand(b, 14.50, 61.30, 61.52, SEG, GOLD, M_GOLD, true);
  ringY(b, 14.50, 14.66, 61.52, SEG, GOLD_HI, M_GOLD, false);
  // a ring of gilded rosettes just above the springing
  for (let i = 0; i < 32; i++) {
    const ang = (i / 32) * TAU + 0.05;
    wallAt(b, ang, 14.66, 0, () => at(b, 0, 62.9, 0.06, 0, () => patera(b, 0, 0, 0.17, RIB, M_GOLD)));
  }
  // ---- oculus lip: meets the shell's ring without ever closing the skylight
  ringY(b, OC_R, 5.42, OCULUS_Y + 0.015, 32, GOLD, M_GOLD, false);
  cylBand(b, OC_R - 0.02, OCULUS_Y - 0.55, OCULUS_Y, 32, RIB, M_GOLD, true);
}

// ---------------------------------------------------------------- 7. apse window
// The contractual window plane is the flat rear wall at z=159; it is built as a
// glowing screen standing just in front of it so the whole thing stays inside
// the r<=15.25 hall envelope (and never depends on how the shell cuts the wall).
function apseGeom(b) {
  const hx = RW.hx;                    // 4.4
  const y0 = RW.y0, yTop = RW.y1;      // 33.5 .. 47
  const ys = yTop - hx;                // 42.6 springing
  const z = 0;
  // ---- stained glass: a jewelled mosaic, five bays, warm centre, cool flanks
  const cols = 5, rows = 3;
  const tints = [
    mixc(PC.glassSky, PC.slate, 0.42), mixc(GLOW_SKY, PC.glassSky, 0.35), mixc(GLOW, GOLD, 0.42),
    mixc(GLOW_SKY, PC.bloom, 0.32), mixc(PC.leafL, GLOW_SKY, 0.50), mixc(GLOW, MARBLE_HI, 0.55),
  ];
  for (let c = 0; c < cols; c++) {
    const xa = -hx + (c / cols) * hx * 2, xb = -hx + ((c + 1) / cols) * hx * 2;
    for (let rr = 0; rr < rows; rr++) {
      const ya = y0 + (rr / rows) * (ys - y0), yb = y0 + ((rr + 1) / rows) * (ys - y0);
      const ti = (c * 3 + rr * 2 + 1) % tints.length;
      const c0 = mulc(tints[ti], 0.9 + rr * 0.07);
      const mat = (c === 2 && rr === 1) ? M_GLOW : MT.lit;
      b.quad([xa, ya, z], [xb, ya, z], [xb, yb, z], [xa, yb, z], c0, mat, [0, 0, 1]);
    }
  }
  // arch head: radial stained panes, brightest toward the crown
  for (let i = 0; i < 14; i++) {
    const a0 = Math.PI * (i / 14), a1 = Math.PI * ((i + 1) / 14);
    const p0 = [Math.cos(a0) * hx, ys + Math.sin(a0) * hx, z];
    const p1 = [Math.cos(a1) * hx, ys + Math.sin(a1) * hx, z];
    const warm = Math.abs(i - 6.5) < 3.5;
    const c0 = warm ? mixc(GLOW, MARBLE_HI, 0.30) : mixc(GLOW_SKY, PC.glassSky, 0.24);
    b.tri([0, ys, z], p1, p0, c0, MT.lit, [0, 0, 1], [0, 0, 1], [0, 0, 1]);
  }
  // central roundel: the brightest note in the hall (only the small core uses the
  // hot PM.glow material so the tracery and the colours are not washed out)
  discFace(b, 1.55, ys, 0.03, 16, mixc(GLOW_SKY, MARBLE_HI, 0.55), MT.warm);
  discFace(b, 1.05, ys, 0.05, 14, mixc(GLOW, MARBLE_HI, 0.55), MT.warm);
  discFace(b, 0.52, ys, 0.07, 12, mixc(GLOW, MARBLE_HI, 0.65), M_GLOW);
  ringFace(b, 1.55, 1.78, ys, 0.05, 16, GOLD, M_GOLD);
  // ---- gilded tracery
  for (let c = 1; c < cols; c++) {
    const x = -hx + (c / cols) * hx * 2;
    b.quad([x - 0.055, y0, 0.04], [x + 0.055, y0, 0.04], [x + 0.055, ys, 0.04], [x - 0.055, ys, 0.04], GOLD, M_GOLD, [0, 0, 1]);
    // continue up through the arch head to the roundel
    const dy = ys - y0;
    void dy;
  }
  for (let r = 1; r < rows; r++) {
    const y = y0 + (r / rows) * (ys - y0);
    b.quad([-hx, y - 0.055, 0.045], [hx, y - 0.055, 0.045], [hx, y + 0.055, 0.045], [-hx, y + 0.055, 0.045], GOLD, M_GOLD, [0, 0, 1]);
  }
  // radial spokes in the arch head
  for (let i = 0; i < 8; i++) {
    const a = Math.PI * (i / 8) + Math.PI / 16;
    const r0 = 1.80, r1 = hx - 0.04;
    const ca = Math.cos(a), sa = Math.sin(a), nx = -sa * 0.055, ny = ca * 0.055;
    b.quad([ca * r0 - nx, ys + sa * r0 - ny, 0.045], [ca * r1 - nx, ys + sa * r1 - ny, 0.045],
      [ca * r1 + nx, ys + sa * r1 + ny, 0.045], [ca * r0 + nx, ys + sa * r0 + ny, 0.045], GOLD, M_GOLD, [0, 0, 1]);
  }
  // ---- outer gold frame + stone architrave
  for (const sx of [-1, 1]) {
    b.quad([sx * hx, y0 - 0.3, 0.02], [sx * (hx + 0.34), y0 - 0.3, 0.06], [sx * (hx + 0.34), ys + 0.2, 0.06],
      [sx * hx, ys + 0.2, 0.02], GOLD, M_GOLD, [0, 0, 1]);
  }
  for (let i = 0; i < 14; i++) {
    const a0 = Math.PI * (i / 14), a1 = Math.PI * ((i + 1) / 14);
    const P = (a, r) => [Math.cos(a) * r, ys + Math.sin(a) * r, 0.05];
    b.quad(P(a0, hx), P(a1, hx), P(a1, hx + 0.34), P(a0, hx + 0.34), GOLD_HI, M_GOLD, [0, 0, 1]);
  }
  // stone architrave behind the gold
  for (const sx of [-1, 1]) {
    b.quad([sx * (hx + 0.34), y0 - 0.45, 0.0], [sx * (hx + 0.72), y0 - 0.45, 0.0], [sx * (hx + 0.72), ys + 0.4, 0.0],
      [sx * (hx + 0.34), ys + 0.4, 0.0], MARBLE_HI, M_MARBLE, [0, 0, 1]);
  }
  for (let i = 0; i < 14; i++) {
    const a0 = Math.PI * (i / 14), a1 = Math.PI * ((i + 1) / 14);
    const P = (a, r) => [Math.cos(a) * r, ys + Math.sin(a) * r, 0.0];
    b.quad(P(a0, hx + 0.34), P(a1, hx + 0.34), P(a1, hx + 0.72), P(a0, hx + 0.72), MARBLE_HI, M_MARBLE, [0, 0, 1]);
  }
  // sill + hood
  at(b, 0, y0 - 0.42, 0.10, 0, () => box(b, hx * 2 + 1.7, 0.34, 0.52, MARBLE_HI, M_MARBLE, { topCol: MARBLE_HI }));
  at(b, 0, yTop + 0.36, 0.06, 0, () => box(b, hx * 2 + 1.1, 0.30, 0.46, MARBLE, M_MARBLE, { topCol: MARBLE_HI }));
  at(b, 0, yTop + 0.72, 0.02, 0, () => box(b, hx * 2 + 0.3, 0.26, 0.36, GOLD, M_GOLD));
  // keystone over the arch
  at(b, 0, ys + hx + 0.30, 0.06, 0, () => box(b, 0.62, 0.62, 0.26, GOLD_HI, M_GOLD));
  // a finial sunburst above the hood (still inside the envelope)
  at(b, 0, yTop + 1.36, 0.02, 0, () => patera(b, 0, 0, 0.42, GOLD, M_GOLD));
}
function buildApse(b) {
  // The shell (palace.js) cuts the apse bay out of the rear wall and closes it with
  // a flat wall at z = 164.5 that carries the PAL.rearWindow arch. The stained
  // glass therefore sits in that window, framed from the apse side. This is the one
  // part of the module that lives outside the r<=15.25 rotunda envelope — it is the
  // contract's rear window and is checked separately below.
  at(b, 0, 0, RW.apseZ - 0.14, YAW.front, () => apseGeom(b));
}

// ---------------------------------------------------------------- 8. chandelier
function buildChandelier(b) {
  const TOP = DRUM_Y;                        // the canopy sits at y=62
  // 8 slender gilded tension rods from the dome surface down to the canopy
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + Math.PI / 8;
    const phi = 0.95;
    const p0 = domeP(a, phi, DOME_R - 0.06);
    const p1 = [CX, TOP, CZ];
    tubePath(b, [p0, p1], 0.038, 4, mixc(GOLD, RIB, 0.35), M_GOLD, { caps: false });
    // collar where the rod meets the dome
    at(b, p0[0], p0[1], p0[2], a, () => ellipsoid(b, 0.13, 0.10, 0.13, 4, 2, GOLD_HI, M_GOLD));
  }
  // canopy boss
  b.push(mtr(CX, TOP - 0.05, CZ, 0));
  lathe(b, [[0.05, 0.0], [0.45, -0.10], [0.72, -0.32], [0.62, -0.52], [0.28, -0.60], [0.10, -0.62]], 16, GOLD, M_GOLD);
  b.pop();
  b.push(mtr(CX, TOP - 0.62, CZ, 0));
  ellipsoid(b, 0.30, 0.24, 0.30, 8, 4, GOLD_HI, M_GOLD);
  b.pop();
  // the chain
  const yTopChain = TOP - 0.86, yBotChain = 53.0;
  b.push(mtr(CX, 0, CZ, 0));
  cylinder(b, 8, 0.055, 0.055, yTopChain - yBotChain, GOLD, M_GOLD, { y0: yBotChain, caps: false });
  b.pop();
  for (let i = 0; i < 6; i++) {
    const yy = yBotChain + (yTopChain - yBotChain) * ((i + 0.5) / 6);
    b.push(mtr(CX, yy, CZ, i * 0.7));
    ellipsoid(b, 0.10, 0.07, 0.10, 5, 2, GOLD, M_GOLD);
    b.pop();
  }
  // ---- body: a gilded stem with three tiers of candle rings
  b.push(mtr(CX, 0, CZ, 0));
  lathe(b, [
    [0.06, 43.6], [0.24, 43.9], [0.30, 44.4], [0.20, 44.9],
    [0.34, 45.4], [0.22, 46.0], [0.40, 46.7], [0.26, 47.4],
    [0.52, 48.2], [0.34, 49.0], [0.46, 50.0], [0.28, 51.0], [0.16, 52.0], [0.10, 53.0],
  ], 12, GOLD, M_GOLD, { smooth: true });
  b.pop();
  // bottom finial (lowest point 43.4 > 43)
  b.push(mtr(CX, 43.55, CZ, 0));
  ellipsoid(b, 0.20, 0.26, 0.20, 6, 3, GOLD_HI, M_GOLD);
  b.pop();
  // the three rings + arms + candles
  const tiers = [
    { y: 49.6, r: 2.40, n: 12, arm: 48.6 },
    { y: 46.6, r: 1.60, n: 10, arm: 45.8 },
    { y: 44.5, r: 1.00, n: 8, arm: 44.0 },
  ];
  for (const t of tiers) {
    // ring
    b.push(mtr(CX, t.y, CZ, 0));
    torusRing(b, t.r, 0.075, 20, 4, GOLD, M_GOLD);
    b.pop();
    for (let i = 0; i < t.n; i++) {
      const a = (i / t.n) * TAU;
      const ca = Math.cos(a), sa = Math.sin(a);
      // curved arm from the stem out to the ring
      const pts = [];
      for (let k = 0; k <= 3; k++) {
        const u = k / 3;
        const rr = 0.20 + (t.r - 0.20) * u;
        const yy = t.arm + (t.y - t.arm) * (u * u * 0.35 + u * 0.65);
        pts.push([CX + ca * rr, yy, CZ + sa * rr]);
      }
      tubePath(b, pts, (u) => 0.065 - 0.03 * u, 4, GOLD, M_GOLD, { caps: false });
      // candle cup + candle + flame
      b.push(mtr(CX + ca * t.r, t.y + 0.02, CZ + sa * t.r, -a + Math.PI / 2));
      cylinder(b, 7, 0.115, 0.075, 0.14, GOLD_HI, M_GOLD, { y0: 0, caps: true });
      cylinder(b, 7, 0.052, 0.048, 0.30, mixc(MARBLE_HI, GLOW, 0.35), M_MARBLE, { y0: 0.14, caps: false });
      b.push(mtr(0, 0.52, 0, 0));
      ellipsoid(b, 0.055, 0.13, 0.055, 5, 3, mixc(GLOW, GLOW_SKY, 0.15), M_GLOW);
      b.pop();
      b.pop();
      // tiny candle cup collar
      b.push(mtr(CX + ca * t.r, t.y - 0.12, CZ + sa * t.r, -a + Math.PI / 2));
      ellipsoid(b, 0.14, 0.06, 0.14, 5, 2, GOLD, M_GOLD);
      b.pop();
    }
    // little gilded acanthus between the arms
    for (let i = 0; i < t.n; i++) {
      const a = ((i + 0.5) / t.n) * TAU;
      b.push(mtr(CX + Math.cos(a) * (t.r * 0.55), t.y + 0.06, CZ + Math.sin(a) * (t.r * 0.55), -a));
      ellipsoid(b, 0.09, 0.16, 0.07, 4, 2, GOLD, M_GOLD);
      b.pop();
    }
  }
  // crown of small drops under the body
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.2;
    b.push(mtr(CX + Math.cos(a) * 0.55, 43.9, CZ + Math.sin(a) * 0.55, -a));
    ellipsoid(b, 0.07, 0.16, 0.07, 4, 2, GOLD_HI, M_GOLD);
    b.pop();
  }
}
// flattened torus ring in the XZ plane (a chandelier hoop)
function torusRing(b, R, r, segR, segT, col, mat) {
  for (let i = 0; i < segR; i++) {
    const a0 = (i / segR) * TAU, a1 = ((i + 1) / segR) * TAU;
    for (let j = 0; j < segT; j++) {
      const t0 = (j / segT) * TAU, t1 = ((j + 1) / segT) * TAU;
      const P = (a, t) => {
        const rr = R + r * Math.cos(t);
        return [Math.cos(a) * rr, r * Math.sin(t), Math.sin(a) * rr];
      };
      const N = (a, t) => [Math.cos(a) * Math.cos(t), Math.sin(t), Math.sin(a) * Math.cos(t)];
      const p00 = P(a0, t0), p10 = P(a1, t0), p11 = P(a1, t1), p01 = P(a0, t1);
      const n0 = N(a0, t0), n1 = N(a1, t0), n2 = N(a1, t1), n3 = N(a0, t1);
      const e = 1;
      b.tri(p00, p10, p11, col, mat, n0, n1, n2);
      b.tri(p00, p11, p01, col, mat, n0, n2, n3);
      void e;
    }
  }
}

// ---------------------------------------------------------------- 9. furniture
function benchGeom(b) {
  // a curved marble bench, 2.6 m long, seat 0.5 m — local +X runs along the bench
  const L = 2.6;
  // plinth
  at(b, 0, 0.16, 0, 0, () => box(b, L - 0.5, 0.32, 0.86, WALL_HI, M_WALL, { topCol: MARBLE_HI }));
  // two carved supports
  for (const sx of [-1, 1]) {
    at(b, sx * (L * 0.5 - 0.32), 0.38, 0, 0, () => box(b, 0.36, 0.44, 0.66, MARBLE, M_MARBLE, { topCol: MARBLE_HI }));
    at(b, sx * (L * 0.5 - 0.32), 0.62, 0, 0, () => ellipsoid(b, 0.24, 0.10, 0.24, 6, 2, GOLD, M_GOLD));
  }
  // seat slab (slightly curved in plan)
  for (let i = 0; i < 4; i++) {
    const x0 = -L * 0.5 + (i / 4) * L, x1 = -L * 0.5 + ((i + 1) / 4) * L;
    const z0 = 0.06 * (i - 1.5), z1 = 0.06 * (i - 0.5);
    b.quad([x0, 0.56, z0 - 0.38], [x1, 0.56, z1 - 0.38], [x1, 0.56, z1 + 0.38], [x0, 0.56, z0 + 0.38], MARBLE_HI, M_POLISH, [0, 1, 0]);
  }
  // cushion
  at(b, 0, 0.61, 0, 0, () => box(b, L - 0.34, 0.10, 0.66, mixc(PC.glassSky, PC.slate, 0.16), PM.marble, { topCol: mixc(GLOW_SKY, MARBLE_HI, 0.55) }));
  // gilded edge
  at(b, 0, 0.535, 0, 0, () => box(b, L + 0.06, 0.05, 0.86, GOLD, M_GOLD));
}
function urnGeom(b, rng) {
  // a gilded bronze planter with a flowering shrub
  at(b, 0, 0.16, 0, 0, () => box(b, 0.92, 0.32, 0.92, WALL_HI, M_WALL, { topCol: MARBLE_HI }));
  b.push(mtr(0, 0.30, 0, 0));
  lathe(b, [[0.10, 0], [0.34, 0.06], [0.42, 0.30], [0.38, 0.60], [0.30, 0.82], [0.34, 0.92]], 12, GOLD, M_GOLD);
  b.pop();
  // soil + foliage
  at(b, 0, 0.88, 0, 0, () => cylinder(b, 10, 0.32, 0.30, 0.06, mixc(PC.leaf, PC.stoneDeep, 0.55), PM.leaf, { y0: 0, caps: true }));
  for (let i = 0; i < 7; i++) {
    const a = rng() * TAU, r = 0.10 + rng() * 0.24;
    b.push(mtr(Math.cos(a) * r, 1.02 + rng() * 0.30, Math.sin(a) * r, rng() * TAU));
    ellipsoid(b, 0.20, 0.16, 0.20, 5, 3, rng() < 0.5 ? PC.leaf : PC.leafL, PM.leaf);
    b.pop();
  }
  for (let i = 0; i < 9; i++) {
    const a = rng() * TAU, r = 0.08 + rng() * 0.26;
    b.push(mtr(Math.cos(a) * r, 1.18 + rng() * 0.28, Math.sin(a) * r, rng() * TAU));
    ellipsoid(b, 0.085, 0.075, 0.085, 4, 2, i % 2 ? PC.bloom : mixc(PC.glow, PC.bloom, 0.5), PM.cloth);
    b.pop();
  }
}
function buildFurniture(b, rng) {
  const benchAngles = [30, 150, 210, 330];
  for (const deg of benchAngles) {
    const ang = (deg * Math.PI) / 180;
    // seat faces the centre: local +Z is inward, +X tangential
    wallAt(b, ang, 10.6, FY, () => benchGeom(b));
  }
  // two gilded planters flanking the entrance
  for (const deg of [240, 300]) {
    const ang = (deg * Math.PI) / 180;
    wallAt(b, ang, 11.7, FY, () => urnGeom(b, rng));
  }
  // a pair of low marble plinths (empty, ready for future statues) at the apse ends
  for (const deg of [70, 110]) {
    const ang = (deg * Math.PI) / 180;
    wallAt(b, ang, 11.4, FY, () => {
      at(b, 0, 0.30, 0, 0, () => box(b, 0.9, 0.60, 0.9, MARBLE, M_MARBLE, { topCol: MARBLE_HI }));
      at(b, 0, 0.64, 0, 0, () => box(b, 1.04, 0.08, 1.04, GOLD, M_GOLD));
    });
  }
}

// ---------------------------------------------------------------- 10. lighting
function buildLights(b, ctx) {
  const warm = mixc(PC.glow, PC.glowSky, 0.32);
  const warmHi = mixc(PC.glow, PC.glowSky, 0.45);
  // 6 warm points round the colonnade (inside the column ring, clear of the floor)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + Math.PI / 6;
    const r = 7.6 + (i % 2) * 0.9;
    ctx.points.push({
      p: [CX + Math.cos(a) * r, 36.4 + (i % 3) * 1.5, CZ + Math.sin(a) * r],
      col: i % 3 === 0 ? warmHi : warm,
      range: 21 + (i % 3) * 2.5,
      int: 1.02 + (i % 4) * 0.09,
    });
  }
  // cool daylight pouring in through the oculus
  ctx.points.push({ p: [CX, OCULUS_Y - 3.6, CZ], col: mixc(PC.glowSky, MARBLE_HI, 0.45), range: 46, int: 1.12 });
  // warm glow off the apse window (kept out in the hall so it lights the nave of
  // the rotunda instead of blowing out the glass it hangs in front of)
  ctx.points.push({ p: [CX, 40.0, RW.z - 6.0], col: mixc(PC.glow, MARBLE_HI, 0.30), range: 26, int: 1.15 });
  // billboard halos: entrance sconces, chandelier, apse, oculus
  ctx.lanterns.push({ p: [CX, 61.4, CZ], size: 3.6, rot: 0, alpha: 0.30, shape: 1, col: mixc(PC.glow, PC.goldHi, 0.55) });
  ctx.lanterns.push({ p: [CX, 49.4, CZ], size: 2.4, rot: 0, alpha: 0.42, shape: 1, col: mixc(PC.glow, PC.goldHi, 0.5) });
  ctx.lanterns.push({ p: [CX, 44.6, CZ], size: 1.7, rot: 0, alpha: 0.5, shape: 1, col: mixc(PC.glow, PC.goldHi, 0.35) });
  ctx.lanterns.push({ p: [CX, 43.9, CZ], size: 1.2, rot: 0, alpha: 0.55, shape: 1, col: PC.glow });
  ctx.lanterns.push({ p: [CX, 74.2, CZ], size: 5.6, rot: 0, alpha: 0.34, shape: 1, col: mixc(PC.glowSky, MARBLE_HI, 0.4) });
  // entrance sconces (flanking the doorway on the inside)
  for (const s of [-1, 1]) {
    const ang = -Math.PI / 2 + s * 0.42;
    const p = [CX + Math.cos(ang) * 14.2, 36.6, CZ + Math.sin(ang) * 14.2];
    ctx.lanterns.push({ p, size: 1.9, rot: 0, alpha: 0.45, shape: 1, col: mixc(PC.glow, PC.goldHi, 0.5) });
    ctx.points.push({ p, col: mixc(PC.glow, PC.glowSky, 0.35), range: 17, int: 0.95 });
  }
  ctx.props.palaceHall = { cx: CX, cz: CZ, floorY: FY, oculusY: OCULUS_Y };
}

// ---------------------------------------------------------------- entry point
export function buildPalaceHall(b, ctx, rng) {
  b.note && b.note('palace-hall');
  buildFloor(b);
  buildColonnade(b);
  buildEntablature(b);
  buildAttic(b);
  buildNiches(b);
  buildEntranceBay(b);
  buildClerestory(b);
  buildDome(b);
  buildApse(b);
  buildChandelier(b);
  buildFurniture(b, rng);
  buildLights(b, ctx);
}

// ---------------------------------------------------------------- entrance bay
// The shell punches a rectangular hole (|x| <= 4.635, y 30..48.1) through the
// r=15 wall; the outer facade turns it into an arched portal. Inside we dress it
// as a tall gilded portal: pilasters on the reveal, a deep bracketed lintel,
// a coat of arms, and two engaged columns flanking it.
function buildEntranceBay(b) {
  const A = -Math.PI / 2;                    // door centre (-Z)
  const HOLE = 0.3137;                       // asin(4.635 / 15): the shell hole half-angle
  const TOP = PORTAL.springY + PORTAL.hx;    // 48.1: the flat head of the shell hole
  // ---- portal pilasters on the wall either side of the hole
  for (const s of [-1, 1]) {
    const ang = A + s * (HOLE + 0.030);
    wallAt(b, ang, 14.86, 0, () => {
      at(b, 0, 31.05, 0.10, 0, () => box(b, 0.64, 0.55, 0.40, WALL_HI, M_WALL, { topCol: MARBLE_HI }));
      at(b, 0, (31.32 + 47.4) * 0.5, 0.14, 0, () => box(b, 0.52, 16.08, 0.34, WALL_HI, M_WALL, { topCol: MARBLE_HI }));
      at(b, 0, 47.55, 0.18, 0, () => box(b, 0.68, 0.42, 0.44, GOLD, M_GOLD));
      at(b, 0, 44.20, 0.32, 0, () => box(b, 0.58, 0.22, 0.10, GOLD, M_GOLD));
    });
  }
  // ---- deep lintel / entablature across the portal head (y 48.1..49.5)
  const HALF = 0.42;
  for (let i = 0; i < 14; i++) {
    const u0 = -HALF + (2 * HALF) * (i / 14), u1 = -HALF + (2 * HALF) * ((i + 1) / 14);
    const P = (u, rad, yy) => [CX + Math.sin(u) * rad, yy, CZ - Math.cos(u) * rad];
    const N0 = [-Math.sin((u0 + u1) * 0.5), 0, Math.cos((u0 + u1) * 0.5)];
    b.quad(P(u0, 14.58, TOP), P(u1, 14.58, TOP), P(u1, 14.58, TOP + 0.55), P(u0, 14.58, TOP + 0.55), WALL_HI, M_WALL, N0);
    b.quad(P(u0, 14.54, TOP + 0.55), P(u1, 14.54, TOP + 0.55), P(u1, 14.54, TOP + 0.92), P(u0, 14.54, TOP + 0.92), GOLD, M_GOLD, N0);
    b.quad(P(u0, 14.44, TOP + 0.92), P(u1, 14.44, TOP + 0.92), P(u1, 14.44, TOP + 1.16), P(u0, 14.44, TOP + 1.16), MARBLE_HI, M_MARBLE, N0);
    b.quad(P(u0, 14.32, TOP + 1.16), P(u1, 14.32, TOP + 1.16), P(u1, 14.32, TOP + 1.34), P(u0, 14.32, TOP + 1.34), GOLD_HI, M_GOLD, N0);
    // soffit under the lintel (seen from below, over the doorway)
    b.quad(P(u0, 14.34, TOP), P(u1, 14.34, TOP), P(u1, 14.58, TOP), P(u0, 14.58, TOP), MARBLE, M_MARBLE, [0, -1, 0]);
  }
  // carved corbels under the lintel
  for (let i = 0; i < 9; i++) {
    const u = -HALF + 0.07 + (2 * (HALF - 0.07) * i) / 8;
    wallAt(b, A + u, 14.55, 0, () => at(b, 0, TOP - 0.24, 0.14, 0, () => box(b, 0.24, 0.46, 0.42, GOLD, M_GOLD)));
  }
  // ---- engaged columns flanking the portal (standing clear of the hole)
  for (const s of [-1, 1]) {
    const ang = A + s * 0.47;
    wallAt(b, ang, 14.52, FY, () => {
      at(b, 0, 0.30, 0, 0, () => box(b, 1.22, 0.60, 1.22, WALL_HI, M_WALL, { topCol: MARBLE_HI }));
      cylinder(b, 16, 0.52, 0.47, 15.40, WALL_HI, M_WALL, { y0: 0.60, caps: false });
      cylinder(b, 16, 0.47, 0.52, 0.14, GOLD, M_GOLD, { y0: 16.00, caps: false });
      cylinder(b, 16, 0.52, 0.64, 0.36, WALL_HI, M_WALL, { y0: 16.14, caps: false });
      at(b, 0, 16.72, 0, 0, () => box(b, 1.28, 0.30, 1.28, GOLD, M_GOLD, { topCol: GOLD_HI }));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        b.push(mtr(Math.cos(a) * 0.58, 16.16, Math.sin(a) * 0.58, -a + Math.PI / 2));
        ellipsoid(b, 0.12, 0.24, 0.08, 4, 2, mixc(WALL, MARBLE_HI, 0.55), M_WALL);
        b.pop();
      }
    });
  }
  // ---- gilded coat of arms above the portal
  wallAt(b, A, 14.80, 0, () => {
    at(b, 0, 50.80, 0.03, 0, () => box(b, 2.55, 1.70, 0.20, RIB, M_GOLD, { topCol: GOLD_HI }));
    at(b, 0, 50.80, 0.12, 0, () => ringFace(b, 0.56, 0.78, 0, 0, 14, GOLD_HI, M_GOLD));
    at(b, 0, 50.80, 0.10, 0, () => discFace(b, 0.54, 0, 0, 14, mixc(GOLD, PC.glow, 0.45), M_GLOW));
    for (const sx of [-1, 1]) {
      at(b, sx * 1.02, 51.42, 0.10, 0, () => ellipsoid(b, 0.16, 0.10, 0.10, 4, 2, GOLD, M_GOLD));
      at(b, sx * 1.02, 50.18, 0.10, 0, () => ellipsoid(b, 0.16, 0.10, 0.10, 4, 2, GOLD, M_GOLD));
    }
  });
  // ---- entrance sconces (the billboard halos come from buildLights)
  for (const s of [-1, 1]) {
    const ang = A + s * 0.42;
    wallAt(b, ang, 14.26, 0, () => {
      at(b, 0, 35.20, 0.16, 0, () => box(b, 0.34, 0.30, 0.48, GOLD, M_GOLD));
      at(b, 0, 36.55, 0.32, 0, () => ellipsoid(b, 0.19, 0.24, 0.19, 6, 3, mixc(GLOW, GOLD_HI, 0.30), M_GLOW));
      at(b, 0, 36.94, 0.32, 0, () => cylinder(b, 8, 0.24, 0.05, 0.22, GOLD, M_GOLD, { y0: 0, caps: true }));
      at(b, 0, 38.00, 0.14, 0, () => box(b, 0.16, 0.90, 0.16, GOLD, M_GOLD));
    });
  }
}
