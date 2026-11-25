// cloudwell-plan.js — ROUND 14 contract: 云井塔 / THE CLOUDWELL (a canal water-gate tower).
//
// OWNER: lead (this file is frozen once the three builders start; change it only with a note
// in HANDOFF).  READ-ONLY for src/cloudwell.js · src/cloudwell-hall.js · tools/cloudwell-check.mjs.
//
// WHAT IT IS
//   A tall glass-and-brass tower standing astride the grand canal at the south end of the
//   boulevard, where the canal crosses the city axis (the existing x=0 bridge is absorbed by
//   its water-gate platform). Inside is one continuous "云井" atrium: a 19 m wide, 66 m tall
//   well with eleven ring galleries stacked up the glass wall, a copper-and-glass pavilion
//   around the floor oculus (a glass disc over the canal water below), and a lantern crown
//   with an open oculus at the top. A spiral-stair turret hangs on the south (-Z) side.
//   Interior reference: 03-notes/../素材/图片/幻想城市/室内/74981085_p0.jpg (blue-white glass
//   atrium, stacked mezzanine rings, central glass core, brass mullions).
//
// FRAME
//   All coordinates below are LOCAL metres: origin at the centre of the water gate at ground
//   level (canal water plane ~y=0), +Z points north toward the city/terrace (the facade side),
//   +X east, y up.  Modules push a translate by (L.cloudwell.x, 0, L.cloudwell.z) once
//   (hzFrame / cwPush) and write local coordinates inside it.
//
// STRUCTURE OWNERSHIP
//   src/cloudwell.js       platform + tower shell + galleries + ramp turret + crown  (~55-65k tri)
//   src/cloudwell-hall.js  interior furnishings, lanterns, 8 point lights          (~38-52k tri)
//   Combined budget 80,000..140,000 tri (project soft cap 2.2M; baseline 2,048,729).
import { m4 } from './math.js';
import { rgb } from './geo.js';
import { L } from './layout.js';

// ---------------------------------------------------------------- dimensions
export const CW = {
  // ---- water gate platform (spans the canal: world z -250..-210, x -21..21)
  PX: 21.0,          // platform half width  (x)
  PZ: 20.0,          // platform half depth  (z)   -> world z -252..-212
  PY0: -5.2,         // foundation bottom (below the water surface)
  PY1: 7.0,          // platform terrace level = the tower's ground floor
  TUN_HW: 11.0,      // canal tunnel half width in z (matches city CANAL.half = 11)
  TUN_SPRING: 1.2,   // canal arch springing height (above y=0)
  TUN_TOP: 5.4,      // canal arch crown
  STAIR_HW: 7.0,     // half width of the north entrance stair (the boulevard's 34 m bridge -> 14 m stair)
  // ---- tower shaft
  SEG: 24,           // radial segments of the whole tower (24 bays)
  R_OUT: 18.0,       // outer face of the shell
  R_IN: 16.8,        // inner face of the shell (1.2 m thick curtain wall)
  Y_BASE: 7.0,       // tower shaft starts on the platform terrace
  ENT_Y1: 19.0,      // top of the stone entrance storey (y 7..19 is solid stone/brass)
  Y_TOP: 89.0,       // top of the glazed shaft
  Y_ROOF: 92.4,      // roof cornice / crown deck
  Y_CROWN: 104.0,    // lantern finial tip
  // ---- entrance portal (+Z face, centred on the axis)
  PORT_HW: 4.6,      // portal half width at the bottom
  PORT_SPRING: 16.4, // arch springing height
  PORT_APEX: 20.2,   // arch apex (just touches gallery 0's deck)
  // ---- atrium galleries: deck TOP surfaces, 11 of them, 6 m apart
  GALV: [20.0, 26.0, 32.0, 38.0, 44.0, 50.0, 56.0, 62.0, 68.0, 74.0, 80.0],
  GAL_T: 0.65,       // deck slab thickness (deck underside = level - GAL_T)
  GAL_R0: 9.5,       // void radius / inner edge of every walkway
  RAIL_H: 1.08,      // inner railing height above each deck
  // ---- ground-floor pavilion (the brass-and-glass "云井亭" around the well)
  WELL_R: 3.3,       // circular oculus in the platform floor (glass disc over the canal)
  WELL_Y: 5.30,      // the glass disc sits just under the canal-arch crown
  PAV_R: 5.6,        // pavilion column ring radius
  PAV_N: 12,         // 12 columns at angles 15+30k degrees -> the +Z/-Z axis stays clear
  PAV_COL_H: 8.2,    // column height (y 7 -> 15.2)
  PAV_ROOF_Y: 15.2,  // canopy underside
  PAV_TOP: 16.8,     // canopy top (annulus with a central oculus PAV_OC)
  PAV_OC: 2.7,       // canopy oculus radius (the well continues up through it)
  // ---- spiral stair turret, hanging on the -Z side (opposite the portal)
  TUR_C: [0, -16.5], // centre in local x/z
  TUR_R: 3.7,        // outer radius
  TUR_RI: 3.05,      // inner radius
  TUR_Y0: -5.2,      // foundation (inside the platform)
  TUR_Y1: 84.0,      // top of the turret shaft
  TUR_DOOR_Y: 7.0,   // door from the platform terrace into the turret
  TUR_TOPCAP: 88.6,  // conical roof apex
  // ---- crown / lantern (y 92.4..104)
  CROWN_R: 10.4,     // base radius of the lantern colonnade
  CROWN_OC: 2.4,     // open oculus radius at the crown apex
  // ---- exterior detection helpers
  R_BODY: 18.0,      // shaft outer radius (== R_OUT)
};

// ---------------------------------------------------------------- palette (LINEAR rgb)
export const CWC = {
  IVORY: rgb('#e9e0cc'), IVORY_W: rgb('#f4eddd'),
  STONE: rgb('#d7ccb6'), STONE_D: rgb('#bcb098'), STONE_L: rgb('#e2d8c2'),
  MARBLE: rgb('#efe8d8'), MARBLE_D: rgb('#d4cbb8'),
  GOLD: rgb('#e2b263'), GOLD_B: rgb('#f6d59a'), GOLD_D: rgb('#a2783b'),
  BRASS: rgb('#c8a055'), BRASS_D: rgb('#8a6b33'), BRASS_L: rgb('#e0c485'),
  STEEL: rgb('#c8d5e1'), STEEL_D: rgb('#93a5b8'),
  GLASS: rgb('#bfe4f2'), GLASS_D: rgb('#7fb4d8'), GLASS_ICE: rgb('#dff2fa'),
  BLUE: rgb('#315f9f'), BLUE_D: rgb('#1e3c6e'), BLUE_L: rgb('#6e95cf'),
  CLOTH: rgb('#3b5e97'), CLOTH_R: rgb('#8f3038'), CLOTH_G: rgb('#3f6e56'),
  WOOD: rgb('#8a6440'), WOOD_D: rgb('#5e4229'), WOOD_L: rgb('#b08858'),
  LEAF: rgb('#4f9a4e'), LEAF_D: rgb('#2f6b40'), LEAF_L: rgb('#7cc463'),
  WATER: rgb('#2a6ea8'), WATER_L: rgb('#4fa8d8'),
  PAPER: rgb('#f2e7cf'), INK: rgb('#2b3550'),
  CLOUD: rgb('#eef6fb'), CLOUD_B: rgb('#bcd6ea'),
};

// ---------------------------------------------------------------- materials [emissive, gloss]
// Interior rule (round 14 brief): surfaces stay at emissive <= 0.145; no MT.glow / MT.lit
// inside. Light comes from the 8 point lights + static billboards (ctx.lanterns, not vertices).
export const CWM = {
  stone:     [0.045, 0.10],
  stoneWarm: [0.050, 0.12],
  marble:    [0.060, 0.20],
  marbleD:   [0.050, 0.16],
  brass:     [0.095, 0.66],
  gold:      [0.115, 0.80],
  goldB:     [0.135, 0.72],
  steel:     [0.055, 0.55],
  glass:     [0.130, 0.88],
  glassD:    [0.110, 0.82],
  wood:      [0.045, 0.16],
  cloth:     [0.040, 0.05],
  clothS:    [0.075, 0.05],   // richer silk (still <= 0.145)
  leaf:      [0.085, 0.12],
  water:     [0.115, 0.74],
  paper:     [0.100, 0.04],
  iron:      [0.040, 0.38],
  cloud:     [0.140, 0.02],
};

// ---------------------------------------------------------------- frame helpers
const ORIGIN = [L.cloudwell.x, 0, L.cloudwell.z];
export const cwPush = (b) => b.push(m4.translate(ORIGIN));
export const cwWorld = (p) => [ORIGIN[0] + p[0], p[1], ORIGIN[2] + p[2]];
export const cwWorldFlat = (x, y, z) => [ORIGIN[0] + x, y, ORIGIN[2] + z];

// ---------------------------------------------------------------- shared ring surfaces
// Flat annulus in the XZ plane at height y. ny=+1 faces up, -1 faces down.
export function annulusXZ(b, cx, cz, r0, r1, y, seg, col, mat, ny = 1, a0 = 0, a1 = Math.PI * 2) {
  const N = [0, ny, 0];
  const n = Math.max(3, Math.round((seg * (a1 - a0)) / (Math.PI * 2)));
  for (let i = 0; i < n; i++) {
    const t0 = a0 + ((a1 - a0) * i) / n, t1 = a0 + ((a1 - a0) * (i + 1)) / n;
    const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
    const p0 = [cx + c0 * r0, y, cz + s0 * r0], p1 = [cx + c1 * r0, y, cz + s1 * r0];
    const p2 = [cx + c1 * r1, y, cz + s1 * r1], p3 = [cx + c0 * r1, y, cz + s0 * r1];
    // r0=0: p0 and p1 coincide with the centre, so the wedge must be
    // (centre, p2, p3) — using (centre, p1, p2) produced a zero-area triangle and left
    // 48 stray centre vertices inside the atrium cavity (caught by content/cloudwell-check).
    if (r0 < 1e-4) b.tri([cx, y, cz], p2, p3, col, mat, N, N, N);
    else b.quad(p0, p1, p2, p3, col, mat, N);
  }
}

// Vertical cylinder wall from y0 to y1 at radius r. side=+1 -> normals point outward,
// side=-1 -> inward (so the inside of the atrium is lit as a wall, not a back face).
export function cylWall(b, cx, cz, r, y0, y1, seg, col, mat, side = 1, a0 = 0, a1 = Math.PI * 2) {
  const n = Math.max(3, Math.round((seg * (a1 - a0)) / (Math.PI * 2)));
  for (let i = 0; i < n; i++) {
    const t0 = a0 + ((a1 - a0) * i) / n, t1 = a0 + ((a1 - a0) * (i + 1)) / n;
    const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
    const N0 = [side * c0, 0, side * s0], N1 = [side * c1, 0, side * s1];
    b.quad([cx + c0 * r, y0, cz + s0 * r], [cx + c1 * r, y0, cz + s1 * r],
           [cx + c1 * r, y1, cz + s1 * r], [cx + c0 * r, y1, cz + s0 * r], col, mat, N0);
  }
}

// ---------------------------------------------------------------- FLY-IN CONTRACT
// Every ray below starts OUTSIDE the tower and ends INSIDE the hollow it is meant to reach.
// tools/cloudwell-check.mjs ray-casts them against the built triangles and requires 0 hits.
// [ax, ay, az, bx, by, bz] in LOCAL coordinates.
export const FLY_RAYS = [
  // 1-4: the +Z portal, from the north approach to a point 4 m inside the entrance hall
  [0, 9.6, 34, 0, 9.6, 8],
  [0, 12.6, 34, 0, 12.6, 8],
  [0, 15.4, 34, 0, 15.4, 8],
  [3.2, 11.0, 34, 3.2, 11.0, 9],
  [-3.2, 11.0, 34, -3.2, 11.0, 9],
  // 5-6: the well: straight up the middle of the atrium, from the pavilion floor to the crown
  [0, 9.0, 0, 0, 86.0, 0],
  [0, 21.0, 0, 0, 86.0, 0],
  // 7: through the crown oculus (out the top)
  [0, 86.0, 0, 0, 110.0, 0],
];

// Interior cavities that must contain ZERO vertices (they are the flyable space):
// { kind:'cyl', cx, cz, r, y0, y1 } -> open cylinder;  { kind:'ann', cx, cz, r0, r1, y0, y1 }
export const CAVITIES = [
  { kind: 'cyl', cx: 0, cz: 0, r: 6.2, y0: 17.6, y1: 86.5, name: 'atrium well' },
  { kind: 'ann', cx: 0, cz: 0, r0: 6.0, r1: 16.4, y0: 8.2, y1: 18.6, name: 'entrance hall' },
  { kind: 'ann', cx: 0, cz: 0, r0: 9.9, r1: 16.4, y0: 21.0, y1: 25.4, name: 'gallery 1 deck' },
  { kind: 'ann', cx: 0, cz: 0, r0: 9.9, r1: 16.4, y0: 45.0, y1: 49.4, name: 'gallery 5 deck' },
  { kind: 'ann', cx: 0, cz: 0, r0: 9.9, r1: 16.4, y0: 81.0, y1: 85.4, name: 'gallery 11 deck' },
];

// The spiral-stair turret is a SOLID volume attached to the -Z face of the shaft (a real
// stair tower); it inevitably occupies part of the entrance-hall / gallery annuli, so the
// cavity assertions exempt its footprint and report both the raw and the exempted counts.
// centre (0,-16.5), outer radius 3.7 -> exemption radius 3.95, cone apex at 88.6.
export const TURRET_EXCLUDE = { cx: 0, cz: -16.5, r: 3.95, y0: -5.2, y1: 88.6 };

// The 8 interior point lights: [x, y, z, hex, range, intensity] in LOCAL coordinates.
// cloudwell-hall.js pushes exactly these into ctx.points (transformed by cwWorld).
export const CW_LIGHTS = [
  [0, 12.6, 0, '#ffe6b8', 34, 1.05],    // entrance hall / pavilion
  [0, 24.0, 6.0, '#ffdcae', 26, 0.80],  // gallery 1
  [0, 40.0, -6.0, '#ffe0b4', 30, 0.78], // gallery 4
  [6.2, 52.0, 0, '#ffd9a6', 28, 0.74],  // gallery 6
  [-6.2, 64.0, 0, '#ffd9a6', 28, 0.74], // gallery 8
  [0, 78.0, 6.0, '#fff0d2', 34, 0.86],  // gallery 10 / observatory
  [0, 88.0, 0, '#dfeaf8', 42, 0.92],    // crown lantern (cool daylight from the oculus)
  [0, 4.0, 0, '#8fc4e8', 26, 0.60],     // the canal well (cool water light)
];

// ---------------------------------------------------------------- build report helper
// Both modules call this at the end so the lead can log their triangle counts.
export function reportTris(name, b, i0) {
  return { name, tris: b.i.length / 3 - i0 };
}
