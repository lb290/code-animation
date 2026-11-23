// STATION — round 7 rebuild: the elevated ring line now runs THROUGH it. OWNER: agent "station".
//
//   buildStation(b, ctx, rng) -> void     called by world.js (tag 'station')
//
// CONTRACT (lead, do not change without telling the lead):
//  * Anchor L.station = { x: 58, z: -146, rot: 0 } — build directly in WORLD axes.
//    local +X = east along the track, local +Z = south toward the boulevard.
//  * Footprint MUST stay inside x [22,94], z [-166,-126]; total height <= 58.
//  * THE TRACK (built by rail.js, do not rebuild it): the viaduct deck runs dead
//    straight along z = -146, deck top y = 27.5, deck half width 3.3 (z -149.3..-142.7),
//    rail head y ~= 27.8. The train envelope is z -150..-142, y 27..35.5, x anywhere:
//    NOTHING may intrude there, and the shed end walls at x=22 / x=94 need open arches
//    (>=12 m wide, >=14 m high, centred on z=-146) so the train runs through.
//  * Programme:
//      - ground concourse (floor y 0.2, ceiling y~17) entered from +Z (z=-126) through
//        three arched portals, with a grand stair down to the plaza at y=0 (z~-100);
//        ticket hall, clock, benches, kiosks, lamps, coffered ceiling, big side windows;
//      - two staircases up to the platform level y = 28.4;
//      - two platforms flanking the track (z -166..-149.3 and -142.7..-126) with iron
//        columns, canopies, benches, lamps, luggage;
//      - steel-and-glass barrel-vault train shed over it all (springing y~30, crown
//        y~52), ribs/purlins/glazing, arched end walls with the track arch;
//      - gold + cobalt palette, clock faces, station name board, statue, plants.
//  * Keep indoor albedo 0.45..0.85, emissive 0.10..0.24, <=8 ctx.points warm,
//    ctx.lanterns for lamp glows.
//  * Determinism: local mulberry32 only, never the shared rng argument.
//  * Budget 120k..240k tris. Check with tools/station-check.mjs.
import { mulberry32, TAU, m4, norm, sub, add as vadd, scale as vs, clamp, lerp } from './math.js';
import { box, cylinder, lathe, torus, sphere, mulc, mixc, bar3 } from './geo.js';
import { MT, boxAt, ellipsoid, disc, extrudeXY } from './lib3d.js';
import { C } from './palette.js';
import { L } from './layout.js';

// ---------------------------------------------------------------- world table
const A = L.station;              // { x:58, z:-146 }
const XC = 58, ZC = -146;
const X0 = 22, X1 = 94;           // hard footprint along the track (lead contract)
const ZB = -166, ZF = -126;       // hard footprint back (-Z) / front (+Z, boulevard side)
const WL = 0.5;                   // facade setback: cornices/projections land exactly on the edge
const XW0 = X0 + WL, XW1 = X1 - WL;   // outer wall planes
const ZBW = ZB + WL, ZFW = ZF - WL;
const HX0 = 26.5, HX1 = 89.5;     // concourse interior x (end walls 4 m thick)
const HZ0 = -161.5, HZ1 = -130.5; // concourse interior z (front/back walls 4 m thick)
const FY = 0.2;                   // concourse floor
const CEIL = 17.0;                // concourse ceiling
const TY = 2.2;                   // entrance terrace level (portal sills)
const PLY = 28.4;                 // platform level
const CHN = -150.02, CHS = -141.98;   // track channel walls (strictly outside the envelope)
const CHF = 21.7;                 // channel floor (below the rail truss)
const DECKT = 27.5;               // deck top (rail.js)
const SPRING = 30.0;              // shed springing
const CROWN = 52.0;               // shed crown
const SHALF = 19.3;               // shed half span in z (ribs stay inside the footprint)
const SINC = 22.0;                // shed rise
const WTOP = 30.0;                // masonry wall top
const ARCHZ = 6.0, ARCHY = 35.5, ARCHR = 6.0;   // train arch: 12 wide, 27.45..41.5 = 14.05 high
const CROWN_Y = ARCHY + ARCHR;    // 41.5
// grand stairs: local frame x 0..14.5 (flight direction), z 0..9.8; arrival at local x 2.5
const STAIRS = [
  { ox: 34.0, oz: -140.9, yaw: 0 },        // world x 34..48.5, z -140.9..-131.1
  { ox: 82.0, oz: -151.1, yaw: Math.PI },  // world x 67.5..82,  z -160.9..-151.1
];
// the open well in the platform slab (arrival ledge x 0..2.5 stays solid)
const WELLS = [
  { x0: 36.5, x1: 48.5, z0: -140.9, z1: -131.1 },
  { x0: 67.5, x1: 79.5, z0: -160.9, z1: -151.1 },
];

// ---------------------------------------------------------------- platform layout (well-aware)
// ROUND 9 FIX (the "floating platform furniture" bug).
// The two stair wells are holes cut in the platform slab, but every platform fixture used to be
// placed on arithmetic grids that ignored them:
//     canopy columns x = 30 + 8i, benches x = 34 + 11i, palms x = 38 + 14i, luggage x + 4, ...
// so x = 38/46 (south platform) and x = 70/78 (north) put columns, benches, palms and luggage
// straight over the stair openings, and the two bench rows at z = -162.2 / -129.8 sat inside the
// front/back walls. Everything was drawn at y = PLY with no slab under it = "floating".
// Fix: one plan (below) places *every* platform fixture on solid slab only, keeping a 0.6 m
// keep-clear margin around both wells and staying off the kerb/walls. No column stands in an
// opening any more: the canopy over each well is carried by two flanking columns + a transfer
// girder. tools/station-stair-check.mjs asserts this plan and ray-tests the built geometry.
const WELL_M = 0.6;          // keep-clear margin around every well opening
const COL_HALF = 0.55;       // canopy column plinth half-size
const COL_BASE_X = [30, 38, 46, 54, 62, 70, 78, 86];   // the round-7 8 m shaft grid

// arrival mouth of a well = where the top flight (stair local x 2.5, z 5.4..9.8) meets the slab
function stairMouth(st) {
  const x = st.yaw === 0 ? st.ox + 2.5 : st.ox - 2.5;
  const za = st.yaw === 0 ? st.oz + 5.4 : st.oz - 9.8;
  const zb = st.yaw === 0 ? st.oz + 9.8 : st.oz - 5.4;
  return { x, z0: Math.min(za, zb), z1: Math.max(za, zb) };
}
const PLAT_SPEC = [
  // north platform: slab z HZ0..CHN, canopy column line z = -159.5, stair well B
  { side: -1, z0: HZ0, z1: CHN, zc: -159.5, well: WELLS[1], st: STAIRS[1] },
  // south platform: slab z CHS..HZ1, canopy column line z = -132.5, stair well A
  { side: 1, z0: CHS, z1: HZ1, zc: -132.5, well: WELLS[0], st: STAIRS[0] },
];
function rectHit(x, z, hx, hz, r, m = 0) {
  return x + hx > r.x0 - m && x - hx < r.x1 + m && z + hz > r.z0 - m && z - hz < r.z1 + m;
}
const wellHit = (w, x, z, hx, hz, m = WELL_M) => rectHit(x, z, hx, hz, w, m);

let PLAN_CACHE = null;
// single source of truth for the platform fixtures; also imported by the geometry check
export function platformPlan() {
  if (PLAN_CACHE) return PLAN_CACHE;
  const platforms = [];
  for (const B of PLAT_SPEC) {
    const w = B.well, side = B.side, mouth = stairMouth(B.st);
    mouth.edge = Math.abs(mouth.x - w.x0) < 1e-6 ? 'x0' : 'x1';   // the open arrival rim
    const wallZ = side < 0 ? B.z0 : B.z1;                  // slab edge against the front/back wall
    const trackZ = side < 0 ? B.z1 : B.z0;                 // slab edge towards the track (kerb)
    const kerbZ = side < 0 ? trackZ - 0.45 : trackZ + 0.45; // centre of the kerb band
    const zBack = side < 0 ? wallZ + 1.2 : wallZ - 1.2;     // furniture row against the wall
    const zFront = side < 0 ? trackZ - 2.4 : trackZ + 2.4;  // furniture row towards the track
    const zPalm = side < 0 ? wallZ + 1.5 : wallZ - 1.5;     // palms: foliage clears the wall
    const zMid = (zBack + zFront) / 2;
    // canopy column line: the 8 m shaft grid, minus any column over a well. The opening is
    // carried by a pair of flanking columns + the transfer girder instead of a floating column.
    const cols = COL_BASE_X.filter((x) => !wellHit(w, x, B.zc, COL_HALF, COL_HALF));
    const fl = [w.x0 - WELL_M - COL_HALF - 0.15, w.x1 + WELL_M + COL_HALF + 0.15];
    cols.push(fl[0], fl[1]);
    cols.sort((a, b) => a - b);
    // bench bays: centred between consecutive columns, sized to clear both plinths
    const edges = [HX0 + 1.7, ...cols, HX1 - 1.7];
    const bays = [];
    for (let i = 0; i + 1 < edges.length; i++) {
      const a = edges[i], b = edges[i + 1];
      const half = Math.min(1.3, (b - a) / 2 - COL_HALF - 0.15);
      if (half < 1.0) continue;
      const x = (a + b) / 2;
      if (wellHit(w, x, B.zc, half, 8.0, WELL_M + 0.1)) continue;   // bay sits over the opening
      bays.push({ x, half });
    }
    if (bays.length < 4) throw new Error('station: platform ' + side + ' lost its bench bays');
    const items = [];
    const add = (kind, x, z, hx, hz, y, extra) => items.push(Object.assign({ kind, x, y, z, hx, hz }, extra));
    for (const c of cols) add('column', c, B.zc, COL_HALF, COL_HALF, PLY, { h: 35.6 - PLY });
    // wall row: bench / palm / luggage cycle; track row: a bench in every bay
    bays.forEach((bay, i) => {
      const k = i % 3;
      if (k === 0) add('bench', bay.x, zBack, bay.half, 0.3, PLY, { len: bay.half * 2, yaw: 0 });
      else if (k === 1) add('palm', bay.x, zPalm, 1.35, 1.35, PLY, { s: 0.8 });
      else add('luggage', bay.x, zBack, 0.8, 0.8, PLY, {});
      add('bench', bay.x, zFront, bay.half, 0.3, PLY, { len: bay.half * 2, yaw: 0 });
    });
    add('cart', bays[0].x, zMid, 1.2, 0.7, PLY, { yaw: side < 0 ? -0.3 : 0.3 });
    add('clock', bays[3].x, B.zc, 0.2, 0.2, PLY, { yaw: side < 0 ? Math.PI / 2 : -Math.PI / 2 });
    add('sign', bays[2].x, B.zc, 1.1, 0.2, PLY + 4.6, { hang: true });
    // kerb planters: the only fixtures that stand on the kerb (it is 0.9 m wide and solid)
    for (let i = 0; i < 6; i++) {
      const x = 32 + i * 10;
      if (wellHit(w, x, kerbZ, 1.1, 0.32)) continue;
      add('planter', x, kerbZ, 1.1, 0.32, PLY + 0.14, {});
    }
    // ticket-barrier posts at the two platform ends (they used to start at z = -162.5, i.e. in the wall)
    for (const xe of [HX0 + 2.5, HX1 - 2.5]) {
      for (let k = 0; k < 4; k++) {
        const z = side < 0 ? -160.4 + k * 1.6 : -131.4 - k * 1.6;
        add('barrier', xe, z, 0.16, 0.14, PLY, {});
      }
    }
    // the canopy soffit height at the column line, for the transfer girder hangers
    const za = side < 0 ? HZ0 : CHS + 1.2;
    const zb = side < 0 ? CHN - 1.2 : HZ1;
    const gtop = 35.6 + Math.sin(Math.PI * ((B.zc - za) / (zb - za))) - 0.43;
    const girder = { x0: fl[0], x1: fl[1], z: B.zc, top: gtop };
    platforms.push({ side, z0: B.z0, z1: B.z1, zc: B.zc, kerbZ, wallZ, trackZ, mouth, well: w, cols, bays, girder, items });
  }
  PLAN_CACHE = { wells: WELLS, platforms };
  return PLAN_CACHE;
}

// ---------------------------------------------------------------- palette
const STONE = C.stone, STONE_P = C.stonePale, STONE_W = C.stoneWarm, STONE_C = C.stoneCool, STONE_D = C.stoneDark;
const MARBLE = C.marble;
const GOLD = C.gold, GOLDB = C.goldBright, BRASS = C.brass, BRONZE = C.bronze;
const IRON = C.iron, IRONL = C.ironLight;
const COBALT = C.slate, COBALTD = C.slateDark, COBALTL = C.slateLight;
const GLASS = C.glass, GLASSD = C.glassDeep;
const LEAF = C.leaf, LEAFL = C.leafLight, LEAFD = C.leafDark;
const RED = C.bloomRed, PINK = C.bloomPink, YELLOW = C.bloomYellow;

// exterior materials
const M_STONE = MT.stone, M_MARBLE = MT.marble, M_GOLD = MT.gold, M_METAL = MT.metal;
const M_GLASS = MT.glass, M_IRON = [0.045, 0.42], M_STEEL = [0.04, 0.34];
const M_GLOW = [0.55, 0.22];

// interior (warm lift: albedo 0.45..0.85, emissive 0.10..0.24)
const I_WALL = mulc(mixc(STONE_P, C.sunGlow, 0.30), 0.80);
const I_WALL_HI = mulc(mixc(MARBLE, C.sunGlow, 0.34), 0.84);
const I_WALL_SH = mulc(mixc(STONE_W, STONE_D, 0.34), 0.74);
const I_MARB = mulc(mixc(MARBLE, C.sunGlow, 0.20), 0.82);
const I_MARB_D = mulc(mixc(C.marbleShade, STONE_W, 0.30), 0.74);
const I_FLOOR_A = mulc(mixc(MARBLE, C.sunGlow, 0.16), 0.84);
const I_FLOOR_B = mulc(mixc(COBALT, STONE_C, 0.34), 0.52);
const I_GOLD = mulc(GOLD, 0.96), I_GOLDD = mulc(GOLD, 0.84);
const I_GLASS_W = mixc(C.sunGlow, GOLDB, 0.32);      // warm lit pane
const I_GLASS_C = mixc(COBALTL, GLASS, 0.42);        // cobalt pane
const I_RED = mulc(mixc(RED, COBALTD, 0.30), 0.84);
const I_BLUE = mulc(mixc(COBALTD, STONE_C, 0.20), 0.70);
const I_WOOD = mulc(mixc(BRONZE, GOLD, 0.20), 0.84);
const I_DARK = mulc(mixc(COBALTD, STONE_W, 0.22), 0.58);
const MI = {
  wall: [0.11, 0.10], wallHi: [0.15, 0.16], wallSh: [0.08, 0.08],
  marble: [0.13, 0.24], marbleHi: [0.16, 0.30], floor: [0.10, 0.34], floorB: [0.07, 0.40],
  gold: [0.20, 0.86], goldHi: [0.28, 0.90], glassW: [0.24, 0.80], glassC: [0.18, 0.92],
  cloth: [0.10, 0.06], red: [0.12, 0.08], wood: [0.09, 0.22], iron: [0.05, 0.45],
  leaf: [0.08, 0.12], dark: [0.04, 0.10], glow: [0.85, 0.05], stone: [0.09, 0.12],
};

// ---------------------------------------------------------------- tiny helpers
const T = (x, y, z) => m4.translate([x, y, z]);
const RY = (a) => m4.rotY(a);
const UP = [0, 1, 0], DN = [0, -1, 0], PZ = [0, 0, 1], NZ = [0, 0, -1], PX = [1, 0, 0], NX = [-1, 0, 0];
function at(b, x, y, z, fn) { b.push(T(x, y, z)); fn(); b.pop(); }
function atR(b, x, y, z, yaw, fn) { b.push(T(x, y, z)); b.push(RY(yaw)); fn(); b.pop(); b.pop(); }
function bx(b, x0, x1, y0, y1, z0, z1, c, m) {
  b.push(T((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2));
  boxAt(b, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), c, m);
  b.pop();
}
function qUp(b, y, x0, x1, z0, z1, c, m) { b.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], c, m, UP); }
function qDn(b, y, x0, x1, z0, z1, c, m) { b.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], c, m, DN); }
function qZp(b, z, x0, x1, y0, y1, c, m) { b.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], c, m, PZ); }
function qZn(b, z, x0, x1, y0, y1, c, m) { b.quad([x1, y0, z], [x0, y0, z], [x0, y1, z], [x1, y1, z], c, m, NZ); }
function qXp(b, x, z0, z1, y0, y1, c, m) { b.quad([x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0], c, m, PX); }
function qXn(b, x, z0, z1, y0, y1, c, m) { b.quad([x, y0, z1], [x, y0, z0], [x, y1, z0], [x, y1, z1], c, m, NX); }
function quadN(b, p0, p1, p2, p3, n0, n1, n2, n3, c, m) {
  const i0 = b.vert(p0, n0, c, m), i1 = b.vert(p1, n1, c, m), i2 = b.vert(p2, n2, c, m), i3 = b.vert(p3, n3, c, m);
  b.i.push(i0, i1, i2, i0, i2, i3);
}
function bar(b, p0, p1, w, h, c, m, up) { bar3(b, p0, p1, w, h, c, m, up || UP); }

// A vertical wall panel with arched / rect holes, built in world axes.
// axis 0: wall normal along Z (u = world x, w = world z); axis 1: normal along X (u = world z, w = world x).
// holes: {c, w, y0, ys, r}  arch (semicircle from ys to ys+r, opening width 2r)
//     or {c, w, y0, y1}     rect
function wallPanel(b, axis, u0, u1, y0, y1, wA, wB, nA, nB, holes, cA, cB, m, seg = 8) {
  const pt = axis === 0 ? (u, v, w) => [u, v, w] : (u, v, w) => [w, v, u];
  const uD = axis === 0 ? PX : PZ;
  const fA = (ua, ub, va, vb, c) => b.quad(pt(ua, va, wA), pt(ub, va, wA), pt(ub, vb, wA), pt(ua, vb, wA), c, m, nA);
  const fB = (ua, ub, va, vb, c) => b.quad(pt(ub, va, wB), pt(ua, va, wB), pt(ua, vb, wB), pt(ub, vb, wB), c, m, nB);
  const jamb = (U, va, vb, s, c) => {
    const n = [uD[0] * s, 0, uD[2] * s];
    b.quad(pt(U, va, wA), pt(U, va, wB), pt(U, vb, wB), pt(U, vb, wA), c, m, n);
  };
  const sillQ = (ua, ub, v, c) => b.quad(pt(ua, v, wA), pt(ub, v, wA), pt(ub, v, wB), pt(ua, v, wB), c, m, UP);
  const headQ = (ua, ub, v, c) => b.quad(pt(ua, v, wB), pt(ub, v, wB), pt(ub, v, wA), pt(ua, v, wA), c, m, DN);
  const hs = holes.map((h) => ({ ...h, a: h.c - h.w / 2, b: h.c + h.w / 2 })).sort((p, q) => p.a - q.a);
  let u = u0;
  const solidCol = (ua, ub) => { if (ub - ua < 1e-4) return; fA(ua, ub, y0, y1, cA); fB(ua, ub, y0, y1, cB); };
  for (const h of hs) {
    const ub0 = Math.min(u1, h.b);
    if (ub0 <= u + 1e-4) continue;                 // already covered by a wider hole
    if (h.a > u) solidCol(u, h.a);
    const ua = Math.max(u0, h.a, u), ub = ub0;
    if (ub - ua < 1e-4) { u = Math.max(u, h.b); continue; }
    if (h.y0 > y0 + 1e-4) { fA(ua, ub, y0, h.y0, cA); fB(ua, ub, y0, h.y0, cB); }
    if (h.y1 !== undefined) {
      if (h.y1 < y1 - 1e-4) { fA(ua, ub, h.y1, y1, cA); fB(ua, ub, h.y1, y1, cB); }
      jamb(ua, h.y0, Math.min(h.y1, y1), 1, cA);
      jamb(ub, h.y0, Math.min(h.y1, y1), -1, cA);
      if (h.y0 > y0 + 1e-4) sillQ(ua, ub, h.y0, cA);
      if (h.y1 < y1 - 1e-4) headQ(ua, ub, h.y1, cA);
    } else {
      const uc = h.c, ys = h.ys, r = h.w / 2, crown = ys + r;
      // arch reveals: jambs below the springing + semicircular soffit
      jamb(uc - r, h.y0, ys, 1, cA);
      jamb(uc + r, h.y0, ys, -1, cA);
      for (let i = 0; i < seg; i++) {
        const a0 = Math.PI * (i / seg), a1 = Math.PI * ((i + 1) / seg);
        const q0 = [uc + Math.cos(a0) * r, ys + Math.sin(a0) * r];
        const q1 = [uc + Math.cos(a1) * r, ys + Math.sin(a1) * r];
        const am = (a0 + a1) / 2;
        const ns = [-Math.cos(am) * uD[0], -Math.sin(am), -Math.cos(am) * uD[2]];
        b.quad(pt(q0[0], q0[1], wA), pt(q1[0], q1[1], wA), pt(q1[0], q1[1], wB), pt(q0[0], q0[1], wB), cA, m, ns);
        // (spandrels are emitted in the second pass below)
      }
      if (crown < y1 - 1e-4) {
        fA(ua, ub, crown, y1, cA); fB(ua, ub, crown, y1, cB);
      }
    }
    u = Math.max(u, h.b);
  }
  if (u < u1) solidCol(u, u1);
  // second pass: arch spandrels (needs the arch curve, done here to keep the loop readable)
  for (const h of hs) {
    if (h.y1 !== undefined) continue;
    const uc = h.c, ys = h.ys, r = h.w / 2, crown = ys + r;
    const ua = Math.max(u0, h.a), ub = Math.min(u1, h.b);
    for (let i = 0; i < seg; i++) {
      const a0 = Math.PI * (i / seg), a1 = Math.PI * ((i + 1) / seg);
      const q0 = [uc + Math.cos(a0) * r, ys + Math.sin(a0) * r];
      const q1 = [uc + Math.cos(a1) * r, ys + Math.sin(a1) * r];
      const x0 = clamp(q0[0], ua, ub), x1 = clamp(q1[0], ua, ub);
      if (Math.abs(x1 - x0) < 1e-5) continue;
      const yTop = Math.min(crown, y1);
      if (q0[1] > yTop - 1e-4 || q1[1] > yTop - 1e-4) continue;
      b.quad(pt(x0, q0[1], wA), pt(x1, q1[1], wA), pt(x1, yTop, wA), pt(x0, yTop, wA), cA, m, nA);
      b.quad(pt(x1, q1[1], wB), pt(x0, q0[1], wB), pt(x0, yTop, wB), pt(x1, yTop, wB), cB, m, nB);
    }
  }
}

// horizontal slab with rect holes in (x,z), optionally tiled two-tone
function flatPanel(b, x0, x1, z0, z1, y, up, holes, c, m, tile = 0, c2 = null) {
  const N = up ? UP : DN;
  const emit = (xa, xb, za, zb) => {
    if (xb - xa < 1e-4 || zb - za < 1e-4) return;
    let cc = c;
    if (tile > 0 && c2) {
      const ix = Math.floor((xa - x0) / tile + 0.001), iz = Math.floor((za - z0) / tile + 0.001);
      cc = ((ix + iz) & 1) ? c2 : c;
    }
    if (up) b.quad([xa, y, za], [xb, y, za], [xb, y, zb], [xa, y, zb], cc, m, N);
    else b.quad([xa, y, zb], [xb, y, zb], [xb, y, za], [xa, y, za], cc, m, N);
  };
  const zs = new Set([z0, z1]);
  for (const h of holes) { zs.add(clamp(h.z0, z0, z1)); zs.add(clamp(h.z1, z0, z1)); }
  const zl = [...zs].sort((p, q) => p - q);
  for (let i = 0; i < zl.length - 1; i++) {
    const za = zl[i], zb = zl[i + 1];
    if (zb - za < 1e-4) continue;
    const zc = (za + zb) / 2;
    const hs = holes.filter((h) => h.z0 < zc && h.z1 > zc).sort((p, q) => p.x0 - q.x0);
    let u = x0;
    for (const h of hs) {
      const a = Math.max(x0, h.x0), bb = Math.min(x1, h.x1);
      if (a > u) emit(u, a, za, zb);
      u = Math.max(u, bb);
    }
    if (u < x1) emit(u, x1, za, zb);
  }
}

// arched glass pane + gold tracery filling a wall opening (built at a fixed plane)
function archGlass(b, axis, c, w, y0, ys, wp, nOut, cG, mG, cF, mF) {
  const r = w / 2, pt = axis === 0 ? (u, v) => [u, v, wp] : (u, v) => [wp, v, u];
  const N = axis === 0 ? [0, 0, nOut] : [nOut, 0, 0];
  const q = (a, bb, va, vb, cc, mm) => b.quad(pt(a, va), pt(bb, va), pt(bb, vb), pt(a, vb), cc, mm, N);
  q(c - r, c + r, y0, ys, cG, mG);
  for (let i = 0; i < 6; i++) {
    const a0 = Math.PI * (i / 6), a1 = Math.PI * ((i + 1) / 6);
    b.tri(pt(c, ys), pt(c + Math.cos(a0) * r, ys + Math.sin(a0) * r), pt(c + Math.cos(a1) * r, ys + Math.sin(a1) * r), cG, mG, N, N, N);
  }
  // gold mullions / transoms / arch ring
  const fw = Math.max(0.09, w * 0.022);
  for (const uu of [c - r / 3, c + r / 3]) q(uu - fw, uu + fw, y0, ys, cF, mF);
  for (const vv of [y0 + (ys - y0) * 0.5]) q(c - r, c + r, vv - fw, vv + fw, cF, mF);
  q(c - r - fw * 2, c - r, y0, ys, cF, mF);
  q(c + r, c + r + fw * 2, y0, ys, cF, mF);
  for (let i = 0; i < 10; i++) {
    const a0 = Math.PI * (i / 10), a1 = Math.PI * ((i + 1) / 10);
    const p0 = [c + Math.cos(a0) * r, ys + Math.sin(a0) * r], p1 = [c + Math.cos(a1) * r, ys + Math.sin(a1) * r];
    const p2 = [c + Math.cos(a1) * (r + fw * 2), ys + Math.sin(a1) * (r + fw * 2)], p3 = [c + Math.cos(a0) * (r + fw * 2), ys + Math.sin(a0) * (r + fw * 2)];
    b.quad(pt(p0[0], p0[1]), pt(p1[0], p1[1]), pt(p2[0], p2[1]), pt(p3[0], p3[1]), cF, mF, N);
  }
}

// ---------------------------------------------------------------- entry point
export function buildStation(b, ctx, rng) {
  b.note && b.note('station');
  const R = mulberry32(0x57a7104e);   // LOCAL rng: never draw from the shared sequence
  const depth = b.stack.length;
  try {
    buildShell(b, ctx, R);
    buildShed(b, ctx, R);
    buildHall(b, ctx, R);
    buildStairs(b, ctx, R);
    buildPlatforms(b, ctx, R);
    buildDetail(b, ctx, R);
    buildForecourt(b, ctx, R);
    buildLights(ctx);
  } catch (e) {
    while (b.stack.length > depth) b.pop();
    throw e;
  }
  void rng;
}

// ================================================================ SHELL
function buildShell(b, ctx, R) {
  // ---- front wall (z -130.5..-126.5): three portals + two windows + attic windows
  wallPanel(b, 0, XW0, XW1, 0, 17.0, ZFW, HZ1, PZ, NZ, [
    { c: 58, w: 9.0, y0: TY, ys: 11.2, r: 4.5 },     // main portal, crown 15.7
    { c: 33, w: 6.5, y0: TY, ys: 10.45, r: 3.25 },   // west portal
    { c: 83, w: 6.5, y0: TY, ys: 10.45, r: 3.25 },   // east portal
    { c: 48.875, w: 4.6, y0: 4.6, ys: 12.0, r: 2.3 },
    { c: 67.125, w: 4.6, y0: 4.6, ys: 12.0, r: 2.3 },
  ], STONE_W, I_WALL, M_STONE);
  wallPanel(b, 0, XW0, XW1, 17.0, WTOP, ZFW, HZ1, PZ, NZ, [
    { c: 47.0, w: 4.4, y0: 21.0, ys: 25.4, r: 2.2 },
    { c: 69.0, w: 4.4, y0: 21.0, ys: 25.4, r: 2.2 },
    { c: 36.0, w: 3.6, y0: 21.5, ys: 24.5, r: 1.8 },
    { c: 80.0, w: 3.6, y0: 21.5, ys: 24.5, r: 1.8 },
  ], STONE_W, I_WALL, M_STONE);
  for (const [c, w, y0, ys] of [[48.875, 4.6, 4.6, 12.0], [67.125, 4.6, 4.6, 12.0]]) {
    archGlass(b, 0, c, w - 0.3, y0 + 0.1, ys, ZFW - 1.2, 1, I_GLASS_W, MI.glassW, I_GOLD, MI.gold);
  }
  for (const [c, w, y0, ys] of [[47, 4.4, 21, 25.4], [69, 4.4, 21, 25.4], [36, 3.6, 21.5, 24.5], [80, 3.6, 21.5, 24.5]]) {
    archGlass(b, 0, c, w - 0.3, y0 + 0.1, ys, ZFW - 1.2, 1, I_GLASS_C, MI.glassC, I_GOLD, MI.gold);
  }
  // portal dressings on the outer face (recessed into the footprint, never past z=-126)
  for (const [c, w, ys] of [[58, 9.0, 11.2], [33, 6.5, 10.45], [83, 6.5, 10.45]]) {
    for (const s of [-1, 1]) {
      qZp(b, ZFW - 0.05, c + s * w / 2 - 0.66, c + s * w / 2 - 0.05, TY, ys, I_MARB, MI.marbleHi);
      qZp(b, ZFW - 0.10, c + s * w / 2 - 0.54, c + s * w / 2 - 0.17, TY + 0.2, ys - 0.2, I_GOLD, MI.gold);
    }
  }
  // ---- back wall (z -165.5..-161.5)
  wallPanel(b, 0, XW0, XW1, 0, 17.0, ZBW, HZ0, NZ, PZ, [
    { c: 36, w: 4.6, y0: 6.0, ys: 13.0, r: 2.3 },
    { c: 47, w: 4.6, y0: 6.0, ys: 13.0, r: 2.3 },
    { c: 58, w: 4.6, y0: 6.0, ys: 13.0, r: 2.3 },
    { c: 69, w: 4.6, y0: 6.0, ys: 13.0, r: 2.3 },
    { c: 80, w: 4.6, y0: 6.0, ys: 13.0, r: 2.3 },
  ], STONE, I_WALL, M_STONE);
  wallPanel(b, 0, XW0, XW1, 17.0, WTOP, ZBW, HZ0, NZ, PZ, [
    { c: 47, w: 5.0, y0: 19.0, ys: 24.0, r: 2.5 },
    { c: 69, w: 5.0, y0: 19.0, ys: 24.0, r: 2.5 },
  ], STONE, I_WALL, M_STONE);
  for (const c of [36, 47, 58, 69, 80]) archGlass(b, 0, c, 4.3, 6.1, 13.0, ZBW + 1.2, -1, I_GLASS_W, MI.glassW, I_GOLD, MI.gold);
  for (const c of [47, 69]) archGlass(b, 0, c, 4.7, 19.1, 24.0, ZBW + 1.2, -1, I_GLASS_C, MI.glassC, I_GOLD, MI.gold);
  // ---- end walls (x 22.5..26.5 / 89.5..93.5) with the train arch notch
  const endGround = [
    { c: -156, w: 5.0, y0: 3.5, ys: 11.0, r: 2.5 },
    { c: -146, w: 5.0, y0: 3.5, ys: 11.0, r: 2.5 },
    { c: -136, w: 5.0, y0: 3.5, ys: 11.0, r: 2.5 },
  ];
  const endUpper = [
    { c: -156, w: 4.0, y0: 19.0, ys: 24.0, r: 2.0 },
    { c: -146, w: 4.0, y0: 19.0, ys: 24.0, r: 2.0 },
    { c: -136, w: 4.0, y0: 19.0, ys: 24.0, r: 2.0 },
  ];
  const endNotch = [{ c: -146, w: 12.0, y0: 26.95, y1: WTOP }];
  for (const [wA, wB, nA, nB] of [[XW0, HX0, NX, PX], [XW1, HX1, PX, NX]]) {
    wallPanel(b, 1, ZBW, ZFW, 0, 17.0, wA, wB, nA, nB, endGround, STONE_W, I_WALL, M_STONE);
    wallPanel(b, 1, ZBW, ZFW, 17.0, 26.95, wA, wB, nA, nB, endUpper, STONE_W, I_WALL, M_STONE);
    wallPanel(b, 1, ZBW, ZFW, 26.95, WTOP, wA, wB, nA, nB, endNotch, STONE_W, I_WALL, M_STONE);
  }
  for (const s of [1, -1]) {
    const wp = s > 0 ? XW0 + 1.2 : XW1 - 1.2, nO = s > 0 ? -1 : 1;
    for (const c of [-156, -146, -136]) {
      archGlass(b, 1, c, 4.7, 3.6, 11.0, wp, nO, I_GLASS_C, MI.glassC, I_GOLD, MI.gold);
      archGlass(b, 1, c, 3.7, 19.1, 24.0, wp, nO, I_GLASS_W, MI.glassW, I_GOLD, MI.gold);
    }
  }
  // ---- train arch: tunnel floor + stone voussoirs + keystone (all inside the footprint)
  for (const s of [1, -1]) {
    const xa = s > 0 ? XW0 : XW1 - 4.0, xb = s > 0 ? XW0 + 4.0 : XW1;
    qUp(b, 26.98, xa, xb, ZC - ARCHZ, ZC + ARCHZ, mulc(STONE_D, 0.8), M_STONE);
    bx(b, xa, xb, 26.5, 26.98, ZC - ARCHZ, ZC + ARCHZ, mulc(STONE_D, 0.75), M_STONE);
    const xo = s > 0 ? XW0 - 0.05 : XW1 + 0.05;
    for (let i = 0; i < 13; i++) {
      const a0 = Math.PI * (i / 13), a1 = Math.PI * ((i + 1) / 13);
      const p0 = [ZC + Math.cos(a0) * ARCHR, ARCHY + Math.sin(a0) * ARCHR];
      const p1 = [ZC + Math.cos(a1) * ARCHR, ARCHY + Math.sin(a1) * ARCHR];
      const p2 = [ZC + Math.cos(a1) * (ARCHR + 0.8), ARCHY + Math.sin(a1) * (ARCHR + 0.8)];
      const p3 = [ZC + Math.cos(a0) * (ARCHR + 0.8), ARCHY + Math.sin(a0) * (ARCHR + 0.8)];
      b.quad([xo, p0[1], p0[0]], [xo, p1[1], p1[0]], [xo, p2[1], p2[0]], [xo, p3[1], p3[0]], mulc(STONE_P, 1.02), M_MARBLE, s > 0 ? NX : PX);
    }
    bx(b, Math.min(xo, xo + s * 0.55), Math.max(xo, xo + s * 0.55), CROWN_Y - 0.1, CROWN_Y + 1.5, ZC - 0.55, ZC + 0.55, GOLDB, M_GOLD);
  }
  // ---- cornices / string courses (they land exactly on the footprint edge)
  for (const [yy, hh, ov] of [[WTOP - 1.0, 1.0, 0.45], [19.4, 1.1, 0.42], [16.6, 0.45, 0.30]]) {
    bx(b, XW0, XW1, yy, yy + hh, ZFW - 0.1, ZF - 0.05, STONE_P, M_MARBLE);
    bx(b, XW0, XW1, yy, yy + hh, ZB + 0.05, ZBW + 0.1, STONE_P, M_MARBLE);
    for (const [za, zb] of [[ZB + 0.05, -152.1], [-139.9, ZF - 0.05]]) {
      bx(b, X0 + 0.05, XW0 + 0.1, yy, yy + hh, za, zb, STONE_P, M_MARBLE);
      bx(b, XW1 - 0.1, X1 - 0.05, yy, yy + hh, za, zb, STONE_P, M_MARBLE);
    }
    void ov;
  }
  // plinth band
  bx(b, X0 + 0.05, X1 - 0.05, 0, 2.2, ZB + 0.05, ZF - 0.05, mulc(STONE_D, 0.92), M_STONE);
  for (let i = 0; i < 24; i++) {
    const x = XW0 + 0.5 + i * ((XW1 - XW0 - 1.0) / 23);
    bx(b, x - 0.3, x + 0.3, 0.05, 2.0, ZFW - 0.02, ZFW + 0.28, mulc(STONE_P, 0.98), M_STONE);
  }
  // giant pilasters on the front
  for (const px of [37.8, 45.8, 52, 64, 70.2, 78.2]) {
    bx(b, px - 0.8, px + 0.8, TY, 16.6, ZFW - 0.05, ZF - 0.06, I_MARB, MI.marble);
    bx(b, px - 0.95, px + 0.95, TY, TY + 0.9, ZFW - 0.05, ZF - 0.04, STONE_P, M_MARBLE);
    bx(b, px - 0.95, px + 0.95, 15.7, 16.6, ZFW - 0.05, ZF - 0.04, I_GOLD, MI.gold);
  }
  // facade clock (big, faces +Z) — set 0.32 m behind the facade plane so it stays in the footprint
  at(b, 58, 24.6, ZF - 0.34, () => clockDial(b, 3.1));
  // station name board under the cornice
  bx(b, 44, 72, 17.6, 19.2, ZF - 0.44, ZF - 0.08, I_DARK, MI.dark);
  bx(b, 44.3, 71.7, 17.8, 19.0, ZF - 0.12, ZF - 0.06, I_GOLD, MI.gold);
  for (let i = 0; i < 13; i++) {
    const gx = 46 + i * 1.9;
    bx(b, gx, gx + 1.15, 18.05, 18.75, ZF - 0.06, ZF - 0.02, GOLDB, MI.goldHi);
  }
  // corner pavilions with gold cupolas
  for (const px of [26, 90]) {
    bx(b, px - 3.5, px + 3.5, 0, 30.6, HZ1, ZFW, STONE_W, M_STONE);
    bx(b, px - 3.7, px + 3.7, TY, 30.2, ZFW - 0.05, ZF - 0.06, mulc(STONE_W, 1.03), M_STONE);
    bx(b, px - 3.9, px + 3.9, 30.6, 31.4, ZFW - 0.05, ZF - 0.05, STONE_P, M_MARBLE);
    bx(b, px - 2.9, px + 2.9, 31.4, 33.0, HZ1 + 1.0, ZFW, I_MARB, MI.marble);
    b.push(T(px, 33.0, -129.0));
    ellipsoid(b, 2.9, 2.2, 2.4, 12, 5, GOLD, M_GOLD, { v0: 0, v1: 1 });
    b.pop();
    bx(b, px - 0.15, px + 0.15, 35.0, 36.6, -127.2, -126.9, GOLDB, MI.gold);
    for (const s of [-1, 1]) {
      bx(b, px + s * 2.4 - 0.5, px + s * 2.4 + 0.5, TY, 15.0, ZFW - 0.05, ZF - 0.06, I_MARB, MI.marble);
    }
  }
}

// ================================================================ SHED (barrel vault)
function vaultY(z) { return SPRING + SINC * Math.sqrt(Math.max(0, 1 - ((z - ZC) / SHALF) ** 2)); }
function vaultN(t) {
  return norm([0, Math.sin(t) / SINC, -Math.cos(t) / SHALF]);
}

function buildShed(b, ctx, R) {
  const NT = 18, NSX = 24;
  const gA = mixc(GLASS, COBALTL, 0.30), gB = mixc(GLASS, COBALTD, 0.14);
  // ---- glazing
  for (let i = 0; i < NT; i++) {
    const ta = Math.PI * (i / NT), tb = Math.PI * ((i + 1) / NT);
    const ya = SPRING + SINC * Math.sin(ta), za = ZC - SHALF * Math.cos(ta);
    const yb = SPRING + SINC * Math.sin(tb), zb = ZC - SHALF * Math.cos(tb);
    const na = vaultN(ta), nb = vaultN(tb);
    for (let j = 0; j < NSX; j++) {
      const xa = XW0 + ((XW1 - XW0) * j) / NSX, xb = XW0 + ((XW1 - XW0) * (j + 1)) / NSX;
      const cc = ((i + j) & 1) ? gA : gB;
      quadN(b, [xa, ya, za], [xb, ya, za], [xb, yb, zb], [xa, yb, zb], na, na, nb, nb, cc, MT.glass);
    }
  }
  // ---- transverse steel ribs
  for (let k = 0; k <= 12; k++) {
    const x = XW0 + ((XW1 - XW0) * k) / 12;
    const xa = x - 0.42, xb = x + 0.42;
    for (let i = 0; i < NT; i++) {
      const ta = Math.PI * (i / NT), tb = Math.PI * ((i + 1) / NT);
      const na = vaultN(ta), nb = vaultN(tb);
      const p = (t, d) => [0, SPRING + (SINC + d) * Math.sin(t), ZC - (SHALF + d) * Math.cos(t)];
      const a0 = p(ta, 0.0), a1 = p(tb, 0.0), b0 = p(ta, 0.55), b1 = p(tb, 0.55);
      const cc = mulc(IRONL, 0.92);
      // outer band
      b.quad([xa, b0[1], b0[2]], [xb, b0[1], b0[2]], [xb, b1[1], b1[2]], [xa, b1[1], b1[2]], cc, M_METAL, nb);
      // two sides
      b.quad([xa, a0[1], a0[2]], [xa, b0[1], b0[2]], [xa, b1[1], b1[2]], [xa, a1[1], a1[2]], mulc(cc, 0.86), M_METAL, NX);
      b.quad([xb, a1[1], a1[2]], [xb, b1[1], b1[2]], [xb, b0[1], b0[2]], [xb, a0[1], a0[2]], mulc(cc, 0.9), M_METAL, PX);
      void na;
    }
  }
  // ---- longitudinal purlins
  for (let i = 1; i < 9; i++) {
    const t = Math.PI * (i / 9);
    const y0 = SPRING + (SINC + 0.02) * Math.sin(t), z0 = ZC - (SHALF + 0.02) * Math.cos(t);
    const y1 = SPRING + (SINC + 0.42) * Math.sin(t), z1 = ZC - (SHALF + 0.42) * Math.cos(t);
    const n = vaultN(t);
    for (let j = 0; j < NSX; j++) {
      const xa = XW0 + ((XW1 - XW0) * j) / NSX, xb = XW0 + ((XW1 - XW0) * (j + 1)) / NSX;
      b.quad([xa, y1, z1], [xb, y1, z1], [xb, y1, z1], [xa, y1, z1], mulc(IRONL, 0.88), M_METAL, n);
      // a flat 0.4-wide band: offset in the local tangent direction
      const ty = Math.cos(t) * 0.42, tz = Math.sin(t) * 0.42;
      b.quad([xa, y1 - ty, z1 + tz], [xb, y1 - ty, z1 + tz], [xb, y1 + ty, z1 - tz], [xa, y1 + ty, z1 - tz], mulc(IRONL, 0.92), M_METAL, n);
      void y0; void z0;
    }
  }
  // ---- ridge lantern (raised glazed strip with gold cresting)
  for (const s of [-1, 1]) {
    const zz = ZC + s * 1.6;
    qZp(b, zz, XW0, XW1, CROWN - 0.1, CROWN + 2.6, mixc(GLASS, C.cloudLit, 0.3), MT.glass);
    bx(b, XW0, XW1, CROWN + 2.6, CROWN + 3.0, zz - 0.16, zz + 0.16, GOLD, M_GOLD);
    for (let k = 0; k <= 12; k++) {
      const x = XW0 + ((XW1 - XW0) * k) / 12;
      bx(b, x - 0.22, x + 0.22, CROWN - 0.2, CROWN + 2.9, zz - 0.24, zz + 0.24, IRONL, M_METAL);
    }
  }
  bx(b, XW0, XW1, CROWN + 2.9, CROWN + 3.1, ZC - 1.7, ZC + 1.7, mulc(GOLD, 0.9), M_GOLD);
  for (let k = 0; k <= 12; k++) {
    const x = XW0 + ((XW1 - XW0) * k) / 12;
    bx(b, x - 0.2, x + 0.2, CROWN + 3.1, CROWN + 4.0, ZC - 0.2, ZC + 0.2, GOLDB, M_GOLD);
  }
  // ---- end gables (x = 22..23.4 and 92.6..94) with the train arch
  buildGable(b, XW0, 1.6, -1);
  buildGable(b, XW1, 1.6, 1);
}

function buildGable(b, xFace, thick, sgn) {
  const xOut = xFace, xIn = xFace - sgn * thick;
  const NSZ = 40, nO = sgn > 0 ? PX : NX;
  const yBot = (z) => {
    const d = Math.abs(z - ZC);
    if (d >= ARCHZ) return SPRING;
    return ARCHY + Math.sqrt(Math.max(0, ARCHR * ARCHR - d * d));
  };
  const cO = mulc(STONE_W, 1.0), cI = mulc(STONE_D, 0.86);
  for (let i = 0; i < NSZ; i++) {
    const za = ZBW + ((ZFW - ZBW) * i) / NSZ, zb = ZBW + ((ZFW - ZBW) * (i + 1)) / NSZ;
    const ya = yBot(za), yb = yBot(zb);
    const ta = Math.max(ya, vaultY(za)), tb = Math.max(yb, vaultY(zb));
    if (ta - ya < 1e-3 && tb - yb < 1e-3) continue;
    b.quad([xOut, ya, za], [xOut, yb, zb], [xOut, tb, zb], [xOut, ta, za], cO, M_STONE, nO);
    b.quad([xIn, yb, zb], [xIn, ya, za], [xIn, ta, za], [xIn, tb, zb], cI, M_STONE, vs(nO, -1));
    b.quad([xOut, ta, za], [xOut, tb, zb], [xIn, tb, zb], [xIn, ta, za], mulc(STONE_P, 1.02), M_MARBLE, UP);
  }
  // arch soffit through the gable thickness
  for (let i = 0; i < 14; i++) {
    const a0 = Math.PI * (i / 14), a1 = Math.PI * ((i + 1) / 14);
    const p0 = [ZC + Math.cos(a0) * ARCHR, ARCHY + Math.sin(a0) * ARCHR];
    const p1 = [ZC + Math.cos(a1) * ARCHR, ARCHY + Math.sin(a1) * ARCHR];
    const am = (a0 + a1) / 2;
    const n = [0, -Math.sin(am), -Math.cos(am)];
    b.quad([xOut, p0[1], p0[0]], [xIn, p0[1], p0[0]], [xIn, p1[1], p1[0]], [xOut, p1[1], p1[0]], mulc(STONE_D, 0.8), M_STONE, n);
  }
  for (const sz of [-1, 1]) {
    const z = ZC + sz * ARCHZ;
    b.quad([xOut, SPRING, z], [xIn, SPRING, z], [xIn, ARCHY, z], [xOut, ARCHY, z], mulc(STONE_D, 0.8), M_STONE, [0, 0, -sz]);
  }
  // steel arch rib + gold cresting on the gable face (0.35 m proud, stays in the footprint)
  const xr = xOut + sgn * 0.35;
  for (let i = 0; i < 20; i++) {
    const ta = Math.PI * (i / 20), tb = Math.PI * ((i + 1) / 20);
    const ya = SPRING + SINC * Math.sin(ta), za = ZC - SHALF * Math.cos(ta);
    const yb = SPRING + SINC * Math.sin(tb), zb = ZC - SHALF * Math.cos(tb);
    b.quad([xr, ya, za], [xr, yb, zb], [xr, yb - 0.9, zb], [xr, ya - 0.9, za], mulc(IRONL, 0.94), M_METAL, nO);
  }
  bx(b, Math.min(xOut, xOut + sgn * 0.45), Math.max(xOut, xOut + sgn * 0.45), CROWN, CROWN + 2.4, ZC - 0.4, ZC + 0.4, GOLDB, M_GOLD);
}

function clockDial(b, R) {
  const N = PZ;
  for (let i = 0; i < 24; i++) {
    const a0 = (i / 24) * TAU, a1 = ((i + 1) / 24) * TAU;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    b.tri([0, 0, 0.04], [c0 * R * 0.94, s0 * R * 0.94, 0.04], [c1 * R * 0.94, s1 * R * 0.94, 0.04], I_DARK, MI.dark, N, N, N);
    b.quad([c0 * R * 0.94, s0 * R * 0.94, 0.06], [c1 * R * 0.94, s1 * R * 0.94, 0.06], [c1 * R, s1 * R, 0.06], [c0 * R, s0 * R, 0.06], GOLDB, M_GOLD, N);
    b.quad([c0 * R * 0.94, s0 * R * 0.94, 0.06], [c1 * R * 0.94, s1 * R * 0.94, 0.06], [c1 * R * 0.94, s1 * R * 0.94, 0.0], [c0 * R * 0.94, s0 * R * 0.94, 0.0], I_GOLDD, M_GOLD, [-c0, -s0, 0]);
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU, c = Math.cos(a), s = Math.sin(a), hl = R * 0.055;
    const r0 = R * 0.72, r1 = R * 0.86;
    b.quad([c * r0 - s * hl, s * r0 + c * hl, 0.08], [c * r0 + s * hl, s * r0 - c * hl, 0.08], [c * r1 + s * hl, s * r1 - c * hl, 0.08], [c * r1 - s * hl, s * r1 + c * hl, 0.08], GOLDB, M_GOLD, N);
  }
  const hand = (ang, len, wd, zz) => {
    const c = Math.cos(ang), s = Math.sin(ang), hw = wd / 2;
    b.quad([-s * hw, c * hw, zz], [s * hw, -c * hw, zz], [c * len + s * hw, s * len - c * hw, zz], [c * len - s * hw, s * len + c * hw, zz], GOLDB, M_GOLD, N);
  };
  hand(Math.PI * 0.72, R * 0.5, R * 0.09, 0.12);
  hand(Math.PI * 0.08, R * 0.76, R * 0.07, 0.16);
  b.push(T(0, 0, 0.2));
  ellipsoid(b, R * 0.1, R * 0.1, R * 0.1, 8, 4, GOLDB, M_GLOW);
  b.pop();
}

// ================================================================ HALL
function buildHall(b, ctx, R) {
  buildHallFloor(b, R);
  buildHallCeiling(b, R);
  buildHallWalls(b, ctx, R);
  buildHallFurniture(b, ctx, R);
}

function buildHallFloor(b, R) {
  flatPanel(b, HX0, HX1, HZ0, HZ1, FY, true, [], I_FLOOR_A, MI.floor, 4.0, I_FLOOR_B);
  // base slab so nothing shows through at the edges
  qUp(b, FY - 0.05, HX0 - 0.2, HX1 + 0.2, HZ0 - 0.2, HZ1 + 0.2, mulc(I_MARB_D, 0.9), MI.marble);
  // marble border + gold inlay
  for (const [a, c] of [[HX0, HX0 + 2.4], [HX1 - 2.4, HX1]]) {
    qUp(b, FY + 0.004, a, c, HZ0, HZ1, mulc(I_MARB_D, 0.96), MI.marble);
    qUp(b, FY + 0.008, a + 0.35, c - 0.35, HZ0 + 0.35, HZ1 - 0.35, I_GOLDD, MI.gold);
  }
  for (const [a, c] of [[HZ0, HZ0 + 2.4], [HZ1 - 2.4, HZ1]]) {
    qUp(b, FY + 0.004, HX0, HX1, a, c, mulc(I_MARB_D, 0.96), MI.marble);
    qUp(b, FY + 0.008, HX0 + 0.35, HX1 - 0.35, a + 0.35, c - 0.35, I_GOLDD, MI.gold);
  }
  // central medallion
  for (const [r0, r1, cc, mm] of [[8.4, 9.0, I_GOLDD, MI.gold], [6.6, 8.4, I_MARB, MI.marbleHi], [5.8, 6.6, mulc(I_GOLD, 0.9), MI.gold], [5.4, 5.8, GOLDB, MI.goldHi]]) {
    for (let i = 0; i < 36; i++) {
      const a0 = (i / 36) * TAU, a1 = ((i + 1) / 36) * TAU;
      b.quad([XC + Math.cos(a0) * r0, FY + 0.012, ZC + Math.sin(a0) * r0], [XC + Math.cos(a1) * r0, FY + 0.012, ZC + Math.sin(a1) * r0],
        [XC + Math.cos(a1) * r1, FY + 0.012, ZC + Math.sin(a1) * r1], [XC + Math.cos(a0) * r1, FY + 0.012, ZC + Math.sin(a0) * r1], cc, mm, UP);
    }
  }
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU + 0.1, r0 = 1.4, r1 = 5.2;
    const ux = Math.cos(a), uz = Math.sin(a), wx = -Math.sin(a) * 0.18, wz = Math.cos(a) * 0.18;
    b.quad([XC + ux * r0 + wx, FY + 0.016, ZC + uz * r0 + wz], [XC + ux * r1 + wx, FY + 0.016, ZC + uz * r1 + wz],
      [XC + ux * r1 - wx, FY + 0.016, ZC + uz * r1 - wz], [XC + ux * r0 - wx, FY + 0.016, ZC + uz * r0 - wz], GOLDB, MI.goldHi, UP);
  }
  // red runners from each portal
  for (const cx of [58, 41, 75]) {
    qUp(b, FY + 0.02, cx - 2.1, cx + 2.1, HZ1 - 2.0, HZ0 + 2.2, I_RED, MI.cloth);
    qUp(b, FY + 0.024, cx - 2.35, cx - 2.1, HZ1 - 2.0, HZ0 + 2.2, I_GOLDD, MI.gold);
    qUp(b, FY + 0.024, cx + 2.1, cx + 2.35, HZ1 - 2.0, HZ0 + 2.2, I_GOLDD, MI.gold);
  }
}

function buildHallCeiling(b, R) {
  const holes = WELLS;
  const NX = 16, NZ = 8;
  const dx = (HX1 - HX0) / NX, dz = (HZ1 - HZ0) / NZ;
  const inHole = (x0, x1, z0, z1) => holes.some((h) => x1 > h.x0 && x0 < h.x1 && z1 > h.z0 && z0 < h.z1);
  // transverse + longitudinal beams with gold fillets
  for (let i = 0; i <= NX; i++) {
    const x = HX0 + i * dx;
    for (let j = 0; j < NZ; j++) {
      const z0 = HZ0 + j * dz, z1 = z0 + dz;
      if (inHole(x - 0.4, x + 0.4, z0, z1)) continue;
      bx(b, x - 0.36, x + 0.36, CEIL - 0.74, CEIL, z0, z1, I_MARB_D, MI.marble);
      bx(b, x - 0.42, x + 0.42, CEIL - 0.82, CEIL - 0.7, z0, z1, I_GOLDD, MI.gold);
    }
  }
  for (let j = 0; j <= NZ; j++) {
    const z = HZ0 + j * dz;
    for (let i = 0; i < NX; i++) {
      const x0 = HX0 + i * dx, x1 = x0 + dx;
      if (inHole(x0, x1, z - 0.4, z + 0.4)) continue;
      bx(b, x0, x1, CEIL - 0.6, CEIL, z - 0.36, z + 0.36, I_MARB, MI.marble);
      bx(b, x0, x1, CEIL - 0.68, CEIL - 0.58, z - 0.42, z + 0.42, I_GOLDD, MI.gold);
    }
  }
  // coffer fields: recessed panel, gold inner frame, rosette
  for (let i = 0; i < NX; i++) {
    for (let j = 0; j < NZ; j++) {
      const x0 = HX0 + i * dx, z0 = HZ0 + j * dz;
      if (inHole(x0, x0 + dx, z0, z0 + dz)) continue;
      const xa = x0 + 0.42, xb = x0 + dx - 0.42, za = z0 + 0.42, zb = z0 + dz - 0.42;
      qDn(b, CEIL - 0.03, xa, xb, za, zb, ((i + j) & 1) ? I_WALL : I_WALL_HI, MI.wall);
      bx(b, xa, xa + 0.14, CEIL - 0.16, CEIL - 0.03, za, zb, I_GOLDD, MI.gold);
      bx(b, xb - 0.14, xb, CEIL - 0.16, CEIL - 0.03, za, zb, I_GOLDD, MI.gold);
      bx(b, xa, xb, CEIL - 0.16, CEIL - 0.03, za, za + 0.14, I_GOLDD, MI.gold);
      bx(b, xa, xb, CEIL - 0.16, CEIL - 0.03, zb - 0.14, zb, I_GOLDD, MI.gold);
      b.push(T((xa + xb) / 2, CEIL - 0.12, (za + zb) / 2));
      ellipsoid(b, 0.34, 0.13, 0.34, 7, 3, GOLDB, MI.goldHi);
      b.pop();
    }
  }
  // perimeter cornice + dentils
  for (const [xa, xb] of [[HX0, HX0 + 1.0], [HX1 - 1.0, HX1]]) bx(b, xa, xb, CEIL - 1.05, CEIL + 0.2, HZ0, HZ1, I_WALL_HI, MI.wallHi);
  for (const [za, zb] of [[HZ0, HZ0 + 1.0], [HZ1 - 1.0, HZ1]]) bx(b, HX0, HX1, CEIL - 1.05, CEIL + 0.2, za, zb, I_WALL_HI, MI.wallHi);
  for (let i = 0; i < 40; i++) {
    const x = HX0 + 1.0 + i * ((HX1 - HX0 - 2.0) / 39);
    bx(b, x - 0.22, x + 0.22, CEIL - 1.28, CEIL - 1.05, HZ0 + 0.15, HZ0 + 0.5, I_GOLDD, MI.gold);
    bx(b, x - 0.22, x + 0.22, CEIL - 1.28, CEIL - 1.05, HZ1 - 0.5, HZ1 - 0.15, I_GOLDD, MI.gold);
  }
  for (let j = 0; j < 24; j++) {
    const z = HZ0 + 1.0 + j * ((HZ1 - HZ0 - 2.0) / 23);
    bx(b, HX0 + 0.15, HX0 + 0.5, CEIL - 1.28, CEIL - 1.05, z - 0.22, z + 0.22, I_GOLDD, MI.gold);
    bx(b, HX1 - 0.5, HX1 - 0.15, CEIL - 1.28, CEIL - 1.05, z - 0.22, z + 0.22, I_GOLDD, MI.gold);
  }
}

function buildHallWalls(b, ctx, R) {
  // wainscot around the hall
  for (const [xa, xb] of [[HX0, HX0 + 0.22], [HX1 - 0.22, HX1]]) {
    bx(b, xa, xb, FY, 2.5, HZ0 + 0.4, HZ1 - 0.4, I_MARB_D, MI.marble);
    bx(b, xa, xb, 2.5, 2.68, HZ0 + 0.4, HZ1 - 0.4, I_GOLDD, MI.gold);
  }
  for (const [za, zb] of [[HZ0, HZ0 + 0.22], [HZ1 - 0.22, HZ1]]) {
    bx(b, HX0 + 0.4, HX1 - 0.4, FY, 2.5, za, zb, I_MARB_D, MI.marble);
    bx(b, HX0 + 0.4, HX1 - 0.4, 2.5, 2.68, za, zb, I_GOLDD, MI.gold);
  }
  // pilasters on the end walls between the windows
  for (const x of [HX0 + 0.5, HX1 - 0.5]) {
    const s = x < XC ? 1 : -1;
    for (const z of [-161, -151, -141, -131]) {
      bx(b, Math.min(x, x + s * 1.0), Math.max(x, x + s * 1.0), FY, CEIL - 1.0, z - 0.75, z + 0.75, I_WALL_HI, MI.wallHi);
      bx(b, Math.min(x, x + s * 1.15), Math.max(x, x + s * 1.15), CEIL - 1.5, CEIL - 0.9, z - 0.95, z + 0.95, I_GOLDD, MI.gold);
    }
  }
  // ticket windows on the back wall (7 arched counters)
  for (let i = 0; i < 7; i++) {
    const cx = 58 + (i - 3) * 7.6;
    // counter slab
    bx(b, cx - 2.1, cx + 2.1, 1.15, 1.35, HZ0 + 0.22, HZ0 + 1.25, I_MARB, MI.marbleHi);
    bx(b, cx - 2.2, cx + 2.2, 1.02, 1.16, HZ0 + 0.22, HZ0 + 1.35, I_GOLDD, MI.gold);
    // arched gold frame + lit grille panel
    for (const s of [-1, 1]) bx(b, cx + s * 2.1 - 0.16, cx + s * 2.1 + 0.16, 1.35, 4.4, HZ0 + 0.2, HZ0 + 0.52, I_GOLD, MI.gold);
    bx(b, cx - 2.1, cx + 2.1, 4.3, 4.62, HZ0 + 0.2, HZ0 + 0.52, I_GOLD, MI.gold);
    qZp(b, HZ0 + 0.26, cx - 1.9, cx + 1.9, 1.35, 4.3, mixc(I_GLASS_W, I_GOLD, 0.25), MI.glow);
    for (let k = 0; k < 7; k++) {
      const gx = cx - 1.8 + k * 0.6;
      bx(b, gx - 0.05, gx + 0.05, 1.35, 4.3, HZ0 + 0.5, HZ0 + 0.62, mulc(BRONZE, 1.1), MI.wood);
    }
    bx(b, cx - 2.3, cx + 2.3, 4.62, 5.1, HZ0 + 0.2, HZ0 + 0.6, I_MARB, MI.marble);
  }
  // big wall clock above the ticket windows
  at(b, 58, 12.4, HZ0 + 0.55, () => clockDial(b, 3.0));
  bx(b, 58 - 3.4, 58 + 3.4, 8.6, 16.3, HZ0 + 0.2, HZ0 + 0.4, I_GOLDD, MI.gold);
  // murals flanking the clock
  for (const cx of [40, 76]) {
    bx(b, cx - 4.2, cx + 4.2, 8.0, 15.4, HZ0 + 0.2, HZ0 + 0.42, I_GOLD, MI.gold);
    qZp(b, HZ0 + 0.4, cx - 3.8, cx + 3.8, 8.4, 15.0, mixc(I_BLUE, I_GLASS_W, 0.4), MI.wall);
  }
  // statues in niches on the end walls
  for (const s of [-1, 1]) {
    const x = s > 0 ? HX0 + 0.9 : HX1 - 0.9;
    for (const z of [-156, -136]) {
      bx(b, Math.min(x, x + s * 1.0), Math.max(x, x + s * 1.0), FY, 2.4, z - 1.3, z + 1.3, I_MARB, MI.marble);
      atR(b, x + s * 0.4, 2.4, z, s > 0 ? Math.PI / 2 : -Math.PI / 2, () => figure(b, 0, 0, 0, 1.5, 0, MARBLE, MI.marbleHi));
    }
  }
  // entrance door leaves folded open against the inner face of the front wall
  for (const [c, w] of [[58, 9.0], [33, 6.5], [83, 6.5]]) {
    for (const s of [-1, 1]) {
      const xa = c + s * (w / 2), xb = xa + s * 1.9;
      bx(b, Math.min(xa, xb), Math.max(xa, xb), FY + 0.1, 10.2, HZ1 - 0.6, HZ1 - 0.28, I_RED, MI.red);
      for (let k = 0; k < 4; k++) {
        bx(b, Math.min(xa, xb) + 0.12, Math.max(xa, xb) - 0.12, 1.4 + k * 2.3, 1.55 + k * 2.3, HZ1 - 0.3, HZ1 - 0.22, I_GOLDD, MI.gold);
      }
    }
  }
  // banners hanging from the ceiling
  for (const [x, z] of [[34, -140], [82, -152], [34, -152], [82, -140]]) {
    bx(b, x - 0.06, x + 0.06, CEIL - 4.4, CEIL - 0.6, z - 0.06, z + 0.06, I_GOLDD, MI.gold);
    bx(b, x - 1.1, x + 1.1, CEIL - 6.2, CEIL - 4.4, z - 0.08, z + 0.08, I_RED, MI.red);
    bx(b, x - 1.2, x + 1.2, CEIL - 4.5, CEIL - 4.3, z - 0.12, z + 0.12, I_GOLD, MI.gold);
  }
  // sconces on the end-wall pilasters
  for (const s of [-1, 1]) {
    const x = s > 0 ? HX0 + 0.35 : HX1 - 0.35;
    for (const z of [-161, -151, -141, -131]) {
      bx(b, Math.min(x, x + s * 0.5), Math.max(x, x + s * 0.5), 7.4, 8.0, z - 0.3, z + 0.3, I_GOLD, MI.gold);
      if (ctx.lanterns) ctx.lanterns.push({ p: [x + s * 0.6, 7.7, z], size: 1.5, rot: 0, alpha: 0.55, shape: 1, col: mixc(C.sunGlow, GOLDB, 0.5) });
    }
  }
}

function figure(b, x, y, z, s, yaw, col, mat) {
  atR(b, x, y, z, yaw, () => {
    b.push([s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1]);
    // plinth-less robed figure: cone skirt + torso + head + arms
    lathe(b, [[0.62, 0], [0.5, 0.35], [0.34, 0.95], [0.3, 1.35], [0.34, 1.5]], 8, col, mat);
    b.push(T(0, 1.55, 0));
    ellipsoid(b, 0.3, 0.36, 0.22, 8, 4, col, mat);
    b.push(T(0, 0.5, 0));
    ellipsoid(b, 0.19, 0.22, 0.19, 7, 4, col, mat);
    b.pop();
    b.pop();
    for (const sx of [-1, 1]) {
      b.push(T(sx * 0.3, 1.6, 0.05));
      b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
      cylinder(b, 6, 0.11, 0.08, 0.75, col, mat, { y0: -0.2, caps: true });
      b.pop();
      b.pop();
    }
    b.pop();
  });
}

function buildHallFurniture(b, ctx, R) {
  // chandeliers
  for (const [x, z] of [[42, -146], [74, -146], [58, -156], [58, -136]]) chandelier(b, x, CEIL - 0.2, z, 1.25);
  // lamp standards flanking the axis
  for (const sx of [-1, 1]) {
    for (const z of [-138, -146, -154]) {
      lampPost(b, XC + sx * 11, FY, z, 4.6, true);
    }
  }
  // benches (double-sided, facing the axis)
  for (const sx of [-1, 1]) {
    for (const z of [-141, -147, -153]) bench(b, XC + sx * 6.2, FY, z, 0, 3.4);
  }
  // kiosks
  kiosk(b, 30, FY, -136);
  kiosk(b, 86, FY, -156);
  // luggage piles
  for (const [x, z] of [[30, -144], [86, -148], [62, -158]]) luggage(b, x, FY, z, R);
  // potted palms
  for (const [x, z] of [[28, -132], [88, -160], [28, -160], [88, -132], [50, -159], [66, -133]]) palm(b, x, FY, z, 1.0);
  // central statue group is deliberately off-axis-free: a marble fountain basin at the medallion edge? no - keep the axis clear
}

function chandelier(b, x, y, z, s) {
  const k = s;
  bx(b, x - 0.07, x + 0.07, y - 1.4, y + 0.1, z - 0.07, z + 0.07, I_GOLDD, MI.gold);
  at(b, x, y - 1.6, z, () => {
    torus(b, 1.15 * k, 0.09 * k, 14, 4, GOLD, M_GOLD, 'y');
    torus(b, 0.66 * k, 0.07 * k, 12, 4, GOLD, M_GOLD, 'y');
    b.push(T(0, 0.34 * k, 0));
    ellipsoid(b, 0.36 * k, 0.32 * k, 0.36 * k, 7, 4, GOLD, M_GOLD);
    b.pop();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU, px = Math.cos(a) * 1.15 * k, pz = Math.sin(a) * 1.15 * k;
      b.push(T(px, 0.12 * k, pz));
      cylinder(b, 5, 0.06 * k, 0.045 * k, 0.42 * k, mixc(C.cloudLit, C.sunGlow, 0.5), M_CLOTH, { y0: 0, caps: true });
      b.pop();
      b.push(T(px, 0.55 * k, pz));
      ellipsoid(b, 0.085 * k, 0.13 * k, 0.085 * k, 5, 3, mixc(C.sunGlow, C.cloudLit, 0.3), MI.glow);
      b.pop();
    }
  });
}
const M_CLOTH = [0.10, 0.06];

function lampPost(b, x, y, z, h, big) {
  const base = mulc(I_MARB, 0.96);
  bx(b, x - 0.42, x + 0.42, y, y + 0.35, z - 0.42, z + 0.42, base, MI.marble);
  bx(b, x - 0.28, x + 0.28, y + 0.35, y + 0.55, z - 0.28, z + 0.28, I_GOLD, MI.gold);
  b.push(T(x, y + 0.55, z));
  cylinder(b, 7, 0.14, 0.09, h - 1.4, I_WOOD, MI.wood, { y0: 0, caps: false });
  b.pop();
  b.push(T(x, y + h - 0.85, z));
  cylinder(b, 6, 0.1, 0.3, 0.5, I_GOLD, MI.gold, { y0: 0, caps: true });
  b.pop();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU;
    bx(b, x + Math.cos(a) * 0.34 - 0.12, x + Math.cos(a) * 0.34 + 0.12, y + h - 0.85, y + h - 0.2, z + Math.sin(a) * 0.34 - 0.12, z + Math.sin(a) * 0.34 + 0.12, I_GOLDD, MI.gold);
  }
  b.push(T(x, y + h - 0.25, z));
  ellipsoid(b, 0.34, 0.4, 0.34, 7, 4, mixc(I_GLASS_W, GOLDB, 0.35), MI.glow);
  b.pop();
  if (big) {
    b.push(T(x, y + h + 0.35, z));
    cylinder(b, 7, 0.06, 0.02, 0.4, I_GOLD, MI.gold, { y0: 0, caps: true });
    b.pop();
  }
}

function bench(b, x, y, z, yaw, len) {
  atR(b, x, y, z, yaw, () => {
    for (const sz of [-0.22, 0.22]) {
      bx(b, -len / 2, len / 2, 0.42, 0.5, sz - 0.11, sz + 0.11, I_WOOD, MI.wood);
      bx(b, -len / 2, len / 2, 0.9, 0.98, sz - 0.07, sz + 0.07, I_WOOD, MI.wood);
    }
    for (const sx of [-1, 1]) {
      bx(b, sx * (len / 2 - 0.25) - 0.09, sx * (len / 2 - 0.25) + 0.09, 0, 0.44, -0.28, 0.28, I_GOLDD, MI.gold);
    }
    bx(b, -len / 2, len / 2, 0.36, 0.42, -0.3, 0.3, I_GOLDD, MI.gold);
  });
}

function kiosk(b, x, y, z) {
  at(b, x, y, z, () => {
    cylinder(b, 8, 1.5, 1.5, 1.1, I_MARB_D, MI.marble, { y0: 0, caps: true });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      bx(b, Math.cos(a) * 1.45 - 0.09, Math.cos(a) * 1.45 + 0.09, 1.1, 3.0, Math.sin(a) * 1.45 - 0.09, Math.sin(a) * 1.45 + 0.09, I_GOLD, MI.gold);
    }
    qUp(b, 1.12, -1.35, 1.35, -1.35, 1.35, I_MARB, MI.marble);
    for (let i = 0; i < 8; i++) {
      const a0 = (i / 8) * TAU, a1 = ((i + 1) / 8) * TAU;
      const p0 = [Math.cos(a0) * 1.55, 3.0, Math.sin(a0) * 1.55], p1 = [Math.cos(a1) * 1.55, 3.0, Math.sin(a1) * 1.55];
      b.tri([0, 3.9, 0], p0, p1, I_GOLD, MI.gold, UP, UP, UP);
    }
    b.push(T(0, 3.9, 0));
    ellipsoid(b, 0.22, 0.4, 0.22, 6, 4, GOLDB, MI.goldHi);
    b.pop();
    // goods shelf
    bx(b, -1.1, 1.1, 1.2, 1.35, -0.5, 0.5, I_RED, MI.red);
    for (let i = 0; i < 5; i++) bx(b, -1.0 + i * 0.45, -0.75 + i * 0.45, 1.35, 1.75, -0.3, 0.3, i % 2 ? I_GOLD : I_BLUE, MI.wall);
  });
}

function luggage(b, x, y, z, R) {
  const cols = [I_RED, I_WOOD, I_BLUE, mulc(BRONZE, 1.1)];
  for (let i = 0; i < 4; i++) {
    const w = 0.55 + R() * 0.25, h = 0.3 + R() * 0.2, d = 0.4 + R() * 0.2;
    const yy = y + (i > 1 ? 0.62 : 0) + (i === 3 ? 0.6 : 0);
    bx(b, x + (R() - 0.5) * 0.5 - w / 2, x + (R() - 0.5) * 0.5 + w / 2, yy, yy + h, z + (R() - 0.5) * 0.5 - d / 2, z + (R() - 0.5) * 0.5 + d / 2, cols[i % 4], MI.wood);
  }
}

function palm(b, x, y, z, s) {
  at(b, x, y, z, () => {
    b.push([s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1]);
    lathe(b, [[0.55, 0], [0.5, 0.15], [0.62, 0.9], [0.58, 1.0]], 8, I_MARB, MI.marble);
    b.push(T(0, 1.0, 0));
    cylinder(b, 6, 0.12, 0.08, 1.9, mulc(C.leafDark, 1.1), MI.leaf, { y0: 0, caps: false });
    b.pop();
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + 0.4;
      const tip = [Math.cos(a) * 1.35, 3.0 + (i % 2) * 0.25, Math.sin(a) * 1.35];
      bar3(b, [0, 2.85, 0], tip, 0.09, 0.05, i % 2 ? LEAF : LEAFL, MI.leaf, UP);
    }
    b.push(T(0, 2.85, 0));
    ellipsoid(b, 0.3, 0.22, 0.3, 6, 3, LEAFD, MI.leaf);
    b.pop();
    b.pop();
  });
}

// ================================================================ STAIRS
function railLine(b, x0, z0, x1, z1, y) {
  const len = Math.hypot(x1 - x0, z1 - z0), nn = Math.max(2, Math.round(len / 1.3));
  for (let i = 0; i <= nn; i++) {
    const t = i / nn, px = lerp(x0, x1, t), pz = lerp(z0, z1, t);
    bx(b, px - 0.08, px + 0.08, y + 0.05, y + 1.0, pz - 0.08, pz + 0.08, I_GOLDD, MI.gold);
  }
  bar3(b, [x0, y + 1.0, z0], [x1, y + 1.0, z1], 0.18, 0.14, GOLDB, MI.goldHi, UP);
}

function buildStairs(b, ctx, R) {
  const rise = (PLY - FY) / 4, n = 30;
  const flights = [
    { x0: 0.0, x1: 12.0, z0: 0.0, z1: 4.4, y0: FY, y1: FY + rise, dir: 1 },
    { x0: 14.5, x1: 2.5, z0: 5.4, z1: 9.8, y0: FY + rise, y1: FY + 2 * rise, dir: -1 },
    { x0: 2.5, x1: 14.5, z0: 0.0, z1: 4.4, y0: FY + 2 * rise, y1: FY + 3 * rise, dir: 1 },
    { x0: 14.5, x1: 2.5, z0: 5.4, z1: 9.8, y0: FY + 3 * rise, y1: PLY, dir: -1 },
  ];
  const landings = [
    { x0: 12.0, x1: 14.5, z0: 0.0, z1: 9.8, y: FY + rise },
    { x0: 0.0, x1: 2.5, z0: 0.0, z1: 9.8, y: FY + 2 * rise },
    { x0: 12.0, x1: 14.5, z0: 0.0, z1: 9.8, y: FY + 3 * rise },
  ];
  for (const st of STAIRS) {
    atR(b, st.ox, 0, st.oz, st.yaw, () => {
      // core wall between the flights
      bx(b, 0.0, 14.5, FY, PLY, 4.4, 5.4, I_WALL_HI, MI.wallHi);
      for (const f of flights) {
        const dx = (f.x1 - f.x0) / n, dy = (f.y1 - f.y0) / n;
        for (let i = 0; i < n; i++) {
          const xa = f.x0 + dx * i, xb = f.x0 + dx * (i + 1);
          const ya = f.y0 + dy * i, yb = f.y0 + dy * (i + 1);
          const lo = Math.min(xa, xb), hi = Math.max(xa, xb);
          b.quad([lo, yb, f.z0], [hi, yb, f.z0], [hi, yb, f.z1], [lo, yb, f.z1], (i & 1) ? I_MARB : I_MARB_D, MI.marbleHi, UP);
          b.quad([xa, ya, f.z0], [xa, yb, f.z0], [xa, yb, f.z1], [xa, ya, f.z1], I_MARB_D, MI.marble, [f.dir, 0, 0]);
          const nx = lo + Math.abs(dx) * 0.14;
          b.quad([lo, yb + 0.005, f.z0], [nx, yb + 0.005, f.z0], [nx, yb + 0.005, f.z1], [lo, yb + 0.005, f.z1], I_GOLDD, MI.gold, UP);
        }
        // sloped soffit + side stringers
        const sy0 = Math.max(0.02, f.y0 - 1.5), sy1 = f.y1 - 1.5;
        b.quad([f.x0, sy0, f.z0], [f.x1, sy1, f.z0], [f.x1, sy1, f.z1], [f.x0, sy0, f.z1], I_WALL_SH, MI.wall, DN);
        for (const zz of [f.z0, f.z1]) {
          b.quad([f.x0, sy0, zz], [f.x1, sy1, zz], [f.x1, f.y1, zz], [f.x0, f.y0, zz], I_MARB, MI.marble, [0, 0, zz === f.z0 ? -1 : 1]);
        }
        // gold balustrade along the open edge of the flight
        const zz = f.z0 === 0 ? 0.16 : 9.64;
        for (let i = 0; i <= n; i += 2) {
          const xa = f.x0 + dx * i, ya = f.y0 + dy * i;
          bx(b, xa - 0.07, xa + 0.07, ya + 0.05, ya + 0.95, zz - 0.07, zz + 0.07, I_GOLDD, MI.gold);
        }
        bar3(b, [f.x0, f.y0 + 1.0, zz], [f.x1, f.y1 + 1.0, zz], 0.16, 0.12, GOLDB, MI.goldHi, UP);
      }
      for (const l of landings) {
        bx(b, l.x0, l.x1, l.y - 0.5, l.y, l.z0, l.z1, I_MARB_D, MI.marble);
        qUp(b, l.y + 0.005, l.x0, l.x1, l.z0, l.z1, I_MARB, MI.marbleHi);
        for (const zz of [l.z0 + 0.16, l.z1 - 0.16]) {
          for (let i = 0; i < 8; i++) {
            const xx = l.x0 + ((l.x1 - l.x0) * (i + 0.5)) / 8;
            bx(b, xx - 0.07, xx + 0.07, l.y + 0.05, l.y + 0.95, zz - 0.07, zz + 0.07, I_GOLDD, MI.gold);
          }
          bx(b, l.x0, l.x1, l.y + 0.95, l.y + 1.1, zz - 0.09, zz + 0.09, GOLDB, MI.goldHi);
        }
      }
      // stair-well shaft walls (the well is local x 2.5..14.5, z 0..9.8)
      bx(b, 2.3, 2.5, CEIL, PLY - 0.6, 0.0, 9.8, I_WALL, MI.wall);
      bx(b, 14.5, 14.7, CEIL, PLY - 0.6, 0.0, 9.8, I_WALL, MI.wall);
      bx(b, 2.3, 14.7, CEIL, PLY - 0.6, -0.2, 0.0, I_WALL, MI.wall);
      bx(b, 2.3, 14.7, CEIL, PLY - 0.6, 9.8, 10.0, I_WALL, MI.wall);
      // gold trim on the shaft edges
      bx(b, 2.3, 2.55, PLY - 0.7, PLY - 0.55, 0.0, 9.8, I_GOLDD, MI.gold);
    });
  }
  // stone coping + continuous handrail round both well openings; the arrival mouths stay open
  wellCoping(b);
  wellRails(b);
}

// ---------------------------------------------------------------- stair-well rims
// A well is cut with four rims; the rim the top flight lands on is the "arrival mouth" and is
// left open (flush brass threshold), the other rims get a stone coping + a handrail.
function wellCoping(b) {
  const P = platformPlan();
  const y0 = PLY - 0.62, cy = 0.12, CW = 0.36;
  const cs = mulc(STONE_C, 0.95), cp = mulc(STONE_P, 0.98), cg = mulc(I_GOLD, 0.99);
  for (const pl of P.platforms) {
    const w = pl.well, m = pl.mouth;
    // the slab cut had no side faces at all (flatPanel only emits its top and bottom panel):
    // from inside the well you looked straight through the slab edge. Give the rim its reveal.
    b.quad([w.x0, PLY, w.z0], [w.x1, PLY, w.z0], [w.x1, y0, w.z0], [w.x0, y0, w.z0], cs, MI.stone, PZ);
    b.quad([w.x1, PLY, w.z1], [w.x0, PLY, w.z1], [w.x0, y0, w.z1], [w.x1, y0, w.z1], cs, MI.stone, NZ);
    b.quad([w.x0, PLY, w.z1], [w.x0, PLY, w.z0], [w.x0, y0, w.z0], [w.x0, y0, w.z1], cs, MI.stone, PX);
    b.quad([w.x1, PLY, w.z0], [w.x1, PLY, w.z1], [w.x1, y0, w.z1], [w.x1, y0, w.z0], cs, MI.stone, NX);
    const band = (xa, xb, za, zb) => {
      const x0 = Math.min(xa, xb), x1 = Math.max(xa, xb), z0 = Math.min(za, zb), z1 = Math.max(za, zb);
      if (x1 - x0 < 0.02 || z1 - z0 < 0.02) return;
      bx(b, x0, x1, PLY, PLY + cy, z0, z1, cp, MI.stone);
      bx(b, x0 + 0.1, x1 - 0.1, PLY + cy + 0.001, PLY + cy + 0.026, z0 + 0.1, z1 - 0.1, cg, MI.gold);
    };
    band(w.x0, w.x1, w.z0, w.z0 + CW);
    band(w.x0, w.x1, w.z1 - CW, w.z1);
    const zi0 = w.z0 + CW, zi1 = w.z1 - CW;
    if (m.edge === 'x0') { band(w.x0, w.x0 + CW, zi0, m.z0); band(w.x0, w.x0 + CW, m.z1, zi1); }
    else band(w.x0, w.x0 + CW, zi0, zi1);
    if (m.edge === 'x1') { band(w.x1 - CW, w.x1, zi0, m.z0); band(w.x1 - CW, w.x1, m.z1, zi1); }
    else band(w.x1 - CW, w.x1, zi0, zi1);
    // flush brass threshold across the arrival mouth (no raised coping where people walk)
    if (m.edge === 'x0') bx(b, w.x0 - 0.12, w.x0 + 0.14, PLY + 0.002, PLY + 0.032, m.z0 + 0.06, m.z1 - 0.06, cg, MI.gold);
    else bx(b, w.x1 - 0.14, w.x1 + 0.12, PLY + 0.002, PLY + 0.032, m.z0 + 0.06, m.z1 - 0.06, cg, MI.gold);
  }
}

function wellRails(b) {
  const P = platformPlan();
  const y = PLY + 0.12;          // rails stand on the stone coping
  for (const pl of P.platforms) {
    const w = pl.well, m = pl.mouth;
    railLine(b, w.x0, w.z0, w.x1, w.z0, y);
    railLine(b, w.x0, w.z1, w.x1, w.z1, y);
    if (m.edge === 'x0') {
      railLine(b, w.x1, w.z0, w.x1, w.z1, y);
      railLine(b, w.x0, w.z0, w.x0, m.z0, y);
    } else {
      railLine(b, w.x0, w.z0, w.x0, w.z1, y);
      railLine(b, w.x1, m.z1, w.x1, w.z1, y);
    }
    // corner piers + the two piers that terminate the rails at the arrival mouth
    const piers = [[w.x0, w.z0], [w.x1, w.z0], [w.x0, w.z1], [w.x1, w.z1], [m.x, m.z0], [m.x, m.z1]];
    const seen = new Set();
    for (const [x, z] of piers) {
      const key = x.toFixed(2) + '|' + z.toFixed(2);
      if (seen.has(key)) continue;
      seen.add(key);
      bx(b, x - 0.18, x + 0.18, PLY, PLY + 1.3, z - 0.18, z + 0.18, I_MARB, MI.marble);
      b.push(T(x, PLY + 1.45, z));
      ellipsoid(b, 0.24, 0.24, 0.24, 7, 4, GOLDB, MI.goldHi);
      b.pop();
    }
  }
}

// ================================================================ PLATFORMS
function buildPlatforms(b, ctx, R) {
  const P = platformPlan();
  // slabs: top surface open at the two stair wells
  flatPanel(b, HX0, HX1, HZ0, CHN, PLY, true, WELLS, I_MARB, MI.marble, 3.2, I_MARB_D);
  flatPanel(b, HX0, HX1, CHS, HZ1, PLY, true, WELLS, I_MARB, MI.marble, 3.2, I_MARB_D);
  flatPanel(b, HX0, HX1, HZ0, CHN, PLY - 0.6, false, WELLS, mulc(I_WALL_SH, 0.9), MI.wall);
  flatPanel(b, HX0, HX1, CHS, HZ1, PLY - 0.6, false, WELLS, mulc(I_WALL_SH, 0.9), MI.wall);
  // platform edge: kerb + safety line
  for (const [z0, z1] of [[CHN - 0.9, CHN], [CHS, CHS + 0.9]]) {
    bx(b, HX0, HX1, PLY - 0.02, PLY + 0.12, z0, z1, mulc(STONE_C, 0.98), MI.marble);
    bx(b, HX0, HX1, PLY + 0.12, PLY + 0.14, z0 + 0.12, z1 - 0.12, YELLOW, MI.wallHi);
  }
  // track channel walls (face the track) + channel floor
  qZp(b, CHN, HX0, HX1, CHF, PLY - 0.6, mulc(I_WALL_SH, 0.82), MI.wall);
  qZn(b, CHS, HX0, HX1, CHF, PLY - 0.6, mulc(I_WALL_SH, 0.82), MI.wall);
  qUp(b, CHF, HX0, HX1, CHN, CHS, mulc(I_DARK, 0.9), MI.dark);
  // canopy over each platform
  for (const side of [-1, 1]) {
    const zc = side < 0 ? -159.5 : -132.5;
    const zWall = side < 0 ? HZ0 : HZ1;
    const zEdge = side < 0 ? CHN - 1.2 : CHS + 1.2;
    // canopy columns come from the well-aware plan (no column may stand over an opening)
    const za = Math.min(zWall, zEdge), zb = Math.max(zWall, zEdge);
    const NSEG = 10;
    for (let i = 0; i < NSEG; i++) {
      const t0 = i / NSEG, t1 = (i + 1) / NSEG;
      const z0 = lerp(za, zb, t0), z1 = lerp(za, zb, t1);
      const y0 = 35.6 + 1.0 * Math.sin(Math.PI * t0), y1 = 35.6 + 1.0 * Math.sin(Math.PI * t1);
      for (let j = 0; j < 16; j++) {
        const x0 = HX0 + j * 4, x1 = HX0 + (j + 1) * 4;
        b.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z1], [x0, y1, z1], (i & 1) ? mulc(GLASS, 0.95) : mixc(GLASS, COBALTL, 0.22), MT.glass, [0, 1, 0]);
        b.quad([x0, y0 - 0.45, z0], [x1, y0 - 0.45, z0], [x1, y1 - 0.45, z1], [x0, y1 - 0.45, z1], mulc(STONE_P, 0.9), MI.wall, [0, -1, 0]);
      }
    }
    for (let k = 0; k <= 8; k++) {
      const x = HX0 + k * 8;
      for (let i = 0; i < NSEG; i++) {
        const t0 = i / NSEG, t1 = (i + 1) / NSEG;
        const z0 = lerp(za, zb, t0), z1 = lerp(za, zb, t1);
        const y0 = 35.6 + 1.0 * Math.sin(Math.PI * t0) + 0.16, y1 = 35.6 + 1.0 * Math.sin(Math.PI * t1) + 0.16;
        b.quad([x - 0.22, y0, z0], [x + 0.22, y0, z0], [x + 0.22, y1, z1], [x - 0.22, y1, z1], IRONL, M_METAL, UP);
      }
    }
    for (let j = 0; j < 16; j++) {
      const x0 = HX0 + j * 4, x1 = HX0 + (j + 1) * 4;
      bx(b, x0, x1, 35.0, 35.6, zEdge - 0.12, zEdge + 0.12, I_GOLDD, MI.gold);
      bx(b, x0, x1, 34.3, 35.0, zEdge - 0.08, zEdge + 0.08, I_RED, MI.red);
    }
    // column-head lanterns are placed with the planned columns (see platformFixtures)
    // hanging direction boards: fixed to the canopy, no floor contact
    for (const x of [42, 74]) {
      bx(b, x - 3.0, x + 3.0, 32.6, 33.6, zc - 0.18, zc + 0.18, I_DARK, MI.dark);
      bx(b, x - 2.8, x + 2.8, 32.75, 33.45, zc + 0.16, zc + 0.26, I_GOLD, MI.gold);
      for (let i = 0; i < 8; i++) bx(b, x - 2.4 + i * 0.62, x - 2.1 + i * 0.62, 32.9, 33.3, zc + 0.25, zc + 0.31, GOLDB, MI.goldHi);
      bx(b, x - 3.1, x - 2.9, 33.6, 35.0, zc - 0.06, zc + 0.06, I_GOLDD, MI.gold);
      bx(b, x + 2.9, x + 3.1, 33.6, 35.0, zc - 0.06, zc + 0.06, I_GOLDD, MI.gold);
    }
  }
  // well-aware platform fixtures (columns, transfer girders, benches, palms, luggage, carts,
  // clocks, number signs, kerb planters, ticket barriers) — see platformPlan()
  for (const pl of P.platforms) {
    for (const it of pl.items) {
      if (it.kind !== 'column') continue;
      ironColumn(b, it.x, PLY, pl.zc, it.h);
      bx(b, it.x - 0.05, it.x + 0.05, 35.0, 35.7, pl.zc - 0.05, pl.zc + 0.05, I_GOLDD, MI.gold);
      b.push(T(it.x, 34.5, pl.zc));
      ellipsoid(b, 0.4, 0.5, 0.4, 7, 4, mixc(I_GLASS_W, GOLDB, 0.4), MI.glow);
      b.pop();
      if (ctx.lanterns) ctx.lanterns.push({ p: [it.x, 34.5, pl.zc], size: 2.4, rot: 0, alpha: 0.5, shape: 1, col: mixc(C.sunGlow, GOLDB, 0.45) });
    }
    platformGirder(b, pl.girder);
    for (const it of pl.items) platformItem(b, it, R);
  }
}

// transfer girder over a stair opening: the canopy is carried across the well by the two
// flanking columns, so no column has to stand in the opening
function platformGirder(b, G) {
  const y0 = PLY + 6.0, y1 = PLY + 6.6;
  bx(b, G.x0, G.x1, y0, y1, G.z - 0.30, G.z + 0.30, IRONL, M_METAL);
  bx(b, G.x0, G.x1, y1, y1 + 0.16, G.z - 0.42, G.z + 0.42, I_GOLDD, MI.gold);
  bx(b, G.x0, G.x1, y0 - 0.16, y0, G.z - 0.42, G.z + 0.42, I_GOLDD, MI.gold);
  for (let i = 1; i <= 3; i++) {
    const x = lerp(G.x0, G.x1, i / 4);
    bx(b, x - 0.10, x + 0.10, y1 + 0.16, G.top, G.z - 0.10, G.z + 0.10, IRON, M_METAL);
  }
  const n = Math.max(4, Math.round((G.x1 - G.x0) / 1.6));
  for (let i = 0; i <= n; i++) {
    const x = lerp(G.x0 + 0.7, G.x1 - 0.7, i / n);
    for (const s of [-1, 1]) bx(b, x - 0.06, x + 0.06, y0 + 0.22, y0 + 0.34, G.z + s * 0.30 - 0.035, G.z + s * 0.30 + 0.035, GOLDB, MI.goldHi);
  }
}

function platformItem(b, it, R) {
  switch (it.kind) {
    case 'bench': bench(b, it.x, it.y, it.z, it.yaw, it.len); break;
    case 'palm': palm(b, it.x, it.y, it.z, it.s); break;
    case 'luggage': luggage(b, it.x, it.y, it.z, R); break;
    case 'cart': cart(b, it.x, it.y, it.z, it.yaw, R); break;
    case 'clock':
      atR(b, it.x, it.y, it.z, it.yaw, () => {
        bx(b, -0.16, 0.16, 0, 3.4, -0.16, 0.16, I_GOLDD, MI.gold);
        b.push(T(0, 3.9, 0));
        clockDial(b, 1.1);
        b.pop();
      });
      break;
    case 'sign':
      bx(b, it.x - 0.12, it.x + 0.12, 33.0, 34.4, it.z - 0.12, it.z + 0.12, I_GOLDD, MI.gold);
      bx(b, it.x - 1.1, it.x + 1.1, 34.4, 35.0, it.z - 0.16, it.z + 0.16, I_DARK, MI.dark);
      bx(b, it.x - 1.0, it.x + 1.0, 34.45, 34.95, it.z + 0.14, it.z + 0.2, I_GOLD, MI.gold);
      for (let k = 0; k < 3; k++) bx(b, it.x - 0.7 + k * 0.5, it.x - 0.45 + k * 0.5, 34.6, 34.82, it.z + 0.19, it.z + 0.23, GOLDB, MI.goldHi);
      break;
    case 'planter':
      bx(b, it.x - 1.1, it.x + 1.1, PLY + 0.14, PLY + 0.62, it.z - 0.32, it.z + 0.32, I_MARB, MI.marble);
      bx(b, it.x - 1.0, it.x + 1.0, PLY + 0.62, PLY + 0.68, it.z - 0.28, it.z + 0.28, LEAFD, MI.leaf);
      for (let k = 0; k < 5; k++) {
        b.push(T(it.x - 0.8 + k * 0.4, PLY + 0.68, it.z));
        ellipsoid(b, 0.16, 0.14, 0.16, 5, 3, k % 2 ? PINK : YELLOW, MI.leaf);
        b.pop();
      }
      break;
    case 'barrier':
      bx(b, it.x - 0.16, it.x + 0.16, PLY, PLY + 1.05, it.z - 0.14, it.z + 0.14, I_GOLDD, MI.gold);
      break;
    default: break;
  }
}

function ironColumn(b, x, y, z, h) {
  bx(b, x - 0.55, x + 0.55, y, y + 0.5, z - 0.55, z + 0.55, mulc(STONE_C, 0.95), MI.marble);
  bx(b, x - 0.42, x + 0.42, y + 0.5, y + 0.75, z - 0.42, z + 0.42, I_GOLD, MI.gold);
  b.push(T(x, y + 0.75, z));
  cylinder(b, 8, 0.3, 0.24, h - 1.3, IRONL, M_IRON, { y0: 0, caps: false });
  b.pop();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    bx(b, x + Math.cos(a) * 0.34 - 0.1, x + Math.cos(a) * 0.34 + 0.1, y + 0.8, y + 2.6, z + Math.sin(a) * 0.34 - 0.1, z + Math.sin(a) * 0.34 + 0.1, IRON, M_IRON);
  }
  bx(b, x - 0.5, x + 0.5, y + h - 0.55, y + h - 0.15, z - 0.5, z + 0.5, I_GOLD, MI.gold);
}

// ================================================================ FORECOURT
function buildForecourt(b, ctx, R) {
  const TX0 = 23.5, TX1 = 92.5, TZ0 = ZFW, TZ1 = -116;
  // raised terrace + rusticated retaining wall (this is a site element: city.js reserves
  // x 18..98 / z -168..-100 as the station forecourt)
  bx(b, TX0, TX1, 0, TY, TZ0, TZ1, mulc(STONE_D, 0.9), M_STONE);
  qUp(b, TY + 0.01, TX0, TX1, TZ0, TZ1, I_MARB, MI.marble, 3.0, I_MARB_D);
  bx(b, TX0, TX1, TY - 0.4, TY, TZ1 - 0.5, TZ1 + 0.15, STONE_P, M_MARBLE);
  for (let i = 0; i < 26; i++) {
    const x = TX0 + 0.7 + i * ((TX1 - TX0 - 1.4) / 25);
    bx(b, x - 0.35, x + 0.35, 0, TY - 0.4, TZ1, TZ1 + 0.3, mulc(STONE_P, 0.97), M_STONE);
  }
  // grand stair (24 m wide) + two side stairs (8 m), 11 steps down to the plaza
  const stairs = [[46, 70], [28, 36], [80, 88]];
  for (const [x0, x1] of stairs) {
    const steps = 11, rise = TY / steps, run = 10.0 / steps;
    for (let i = 0; i < steps; i++) {
      const z0 = TZ1 + i * run, z1 = TZ1 + (i + 1) * run;
      const yTop = TY - (i + 1) * rise;
      bx(b, x0, x1, 0, yTop, z0, z1, i & 1 ? I_MARB : I_MARB_D, MI.marble);
      bx(b, x0, x1, Math.max(0.005, yTop - 0.07), yTop, z0, z0 + 0.16, I_GOLDD, MI.gold);
    }
    for (const sx of [x0, x1]) {
      bx(b, sx - 0.55, sx + 0.55, 0, TY + 0.9, TZ1, TZ1 + 10.0, STONE_P, M_MARBLE);
      for (let i = 0; i <= 11; i++) {
        const t = i / 11;
        bx(b, sx - 0.62, sx + 0.62, TY + 1.05 - t * 0.9, TY + 1.2 - t * 0.9, TZ1 + t * 10.0, TZ1 + t * 10.0 + 0.9, STONE_P, M_MARBLE);
      }
    }
  }
  for (const [x0, x1] of [[TX0 + 0.6, 28], [36, 46], [70, 80], [88, TX1 - 0.6]]) {
    balustradeX(b, x0, x1, TZ1 - 0.2, TY, 1.1);
  }
  for (const x of [26, 37.5, 46, 70, 78.5, 90]) lampPost(b, x, TY, TZ0 + 2.6, 5.0, true);
  for (const x of [42, 74]) {
    bx(b, x - 1.1, x + 1.1, 0, 1.5, TZ1 + 1.0, TZ1 + 3.2, I_MARB, MI.marble);
    atR(b, x, 1.5, TZ1 + 2.1, x < 58 ? 0.35 : -0.35, () => figure(b, 0, 0, 0, 1.3, 0, MARBLE, MI.marbleHi));
  }
  for (const x of [25.5, 90.5]) {
    at(b, x, TY, -122, () => {
      lathe(b, [[0.9, 0], [0.95, 0.2], [0.8, 0.9], [0.86, 1.0]], 8, I_MARB, MI.marble);
      b.push(T(0, 1.0, 0));
      cylinder(b, 6, 0.16, 0.12, 2.2, I_WOOD, MI.wood, { y0: 0, caps: false });
      b.pop();
      b.push(T(0, 3.0, 0));
      sphere(b, 1.5, LEAF, MI.leaf, { rings: 5, seg: 8, jitter: 0.2, seed: 3 });
      b.pop();
    });
  }
  // flagpoles on the corner pavilions
  for (const x of [26, 90]) {
    bx(b, x - 0.09, x + 0.09, 36.8, 46.0, -127.4, -127.22, I_GOLDD, MI.gold);
    bx(b, x, x + 2.6, 43.6, 45.6, -127.35, -127.27, I_RED, MI.red);
    bx(b, x, x + 2.6, 44.4, 44.9, -127.36, -127.26, GOLDB, MI.gold);
  }
}

function balustradeX(b, x0, x1, z, y, h) {
  const len = x1 - x0, n = Math.max(3, Math.round(len / 1.5));
  bx(b, x0, x1, y, y + h * 0.16, z - 0.24, z + 0.24, STONE_P, M_MARBLE);
  bx(b, x0, x1, y + h - 0.16, y + h, z - 0.3, z + 0.3, STONE_P, M_MARBLE);
  for (let i = 0; i < n; i++) {
    const x = x0 + ((i + 0.5) / n) * len;
    b.push(T(x, y + h * 0.16, z));
    lathe(b, [[0.13, 0], [0.17, 0.12], [0.1, h * 0.5], [0.16, h * 0.8], [0.12, h * 0.84]], 6, STONE_P, M_MARBLE);
    b.pop();
  }
}

// ================================================================ LIGHTS
function buildLights(ctx) {
  const warm = mixc(C.sunGlow, GOLDB, 0.42);
  const warmSoft = mixc(C.sunGlow, C.cloudLit, 0.30);
  if (ctx.points) {
    const pts = [
      [58, 12.0, -146, 48, 0.95, warm],      // hall centre
      [58, 9.0, -134, 30, 0.60, warmSoft],   // hall front
      [58, 11.0, -158, 34, 0.72, warm],      // ticket hall
      [41, 20.0, -136, 26, 0.52, warmSoft],  // stair well A
      [75, 20.0, -156, 26, 0.52, warmSoft],  // stair well B
      [58, 33.0, -158, 32, 0.55, warm],      // north platform
      [58, 33.0, -134, 32, 0.55, warm],      // south platform
      [58, 7.0, -118, 30, 0.50, warmSoft],   // forecourt
    ];
    for (const [x, y, z, range, int, col] of pts) ctx.points.push({ p: [x, y, z], col, range, int });
  }
  if (ctx.lanterns) {
    for (const [x, z] of [[42, -146], [74, -146], [58, -156], [58, -136]]) {
      ctx.lanterns.push({ p: [x, CEIL - 2.6, z], size: 4.0, rot: 0, alpha: 0.40, shape: 1, col: mixc(C.cloudLit, C.sunGlow, 0.4) });
    }
    ctx.lanterns.push({ p: [58, 12.4, -160], size: 3.2, rot: 0, alpha: 0.35, shape: 1, col: warmSoft });
    ctx.lanterns.push({ p: [58, 4.0, -126.5], size: 3.6, rot: 0, alpha: 0.32, shape: 1, col: warmSoft });
  }
}


// ================================================================ DETAIL PASS
function buildDetail(b, ctx, R) {
  hallColonnade(b);
  hallGallery(b);
  stairDetail(b);
  platformDetail(b, ctx, R);
  shedDetail(b);
  facadeDetail(b);
  endWallDetail(b);
  archDetail(b);
  forecourtDetail(b);
}
function baluster(b, x, y, z, h) {
  b.push(T(x, y, z));
  lathe(b, [[0.17, 0], [0.21, 0.1 * h], [0.1, 0.42 * h], [0.19, 0.72 * h], [0.15, 0.78 * h], [0.15, h]], 6, I_MARB, MI.marbleHi);
  b.pop();
}
function urn(b, x, y, z, s) {
  b.push(T(x, y, z));
  b.push([s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1]);
  lathe(b, [[0.16, 0], [0.4, 0.14], [0.46, 0.34], [0.3, 0.62], [0.34, 0.74], [0.16, 0.82], [0.12, 0.86]], 8, I_GOLD, MI.gold);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    bar3(b, [0, 0.8, 0], [Math.cos(a) * 0.42, 1.12, Math.sin(a) * 0.42], 0.09, 0.06, LEAF, MI.leaf, UP);
  }
  b.push(T(0, 0.9, 0));
  ellipsoid(b, 0.28, 0.2, 0.28, 6, 3, LEAFL, MI.leaf);
  b.pop();
  b.pop();
  b.pop();
}
function cart(b, x, y, z, yaw, R) {
  atR(b, x, y, z, yaw, () => {
    bx(b, -1.1, 1.1, 0.42, 0.52, -0.6, 0.6, I_WOOD, MI.wood);
    bx(b, -1.2, 1.2, 0.32, 0.44, -0.7, 0.7, I_GOLDD, MI.gold);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      b.push(T(sx * 0.9, 0.24, sz * 0.5));
      b.push(m4.rotZ(Math.PI / 2));
      cylinder(b, 8, 0.22, 0.22, 0.14, IRON, M_IRON, { y0: -0.07, caps: true });
      b.pop();
      b.pop();
    }
    bx(b, 1.05, 1.2, 0.44, 1.5, -0.6, 0.6, I_GOLDD, MI.gold);
    for (let i = 0; i < 3; i++) {
      const w = 0.4 + R() * 0.25, hh = 0.22 + R() * 0.2, d = 0.34 + R() * 0.2;
      bx(b, -0.6 + i * 0.5 - w / 2, -0.6 + i * 0.5 + w / 2, 0.52, 0.52 + hh, -d / 2, d / 2, [I_RED, I_BLUE, I_WOOD][i % 3], MI.wood);
    }
  });
}

function hallColonnade(b) {
  // engaged columns on the two end walls, between the windows
  for (const s of [-1, 1]) {
    const x = s > 0 ? HX0 + 0.85 : HX1 - 0.85;
    for (const z of [-161, -151, -141, -131]) {
      bx(b, x - s * 0.75, x + s * 0.12, FY, FY + 0.9, z - 0.82, z + 0.82, I_MARB, MI.marble);
      bx(b, x - s * 0.85, x + s * 0.16, FY + 0.9, FY + 1.1, z - 0.9, z + 0.9, I_GOLDD, MI.gold);
      b.push(T(x + s * 0.32, FY + 1.1, z));
      cylinder(b, 10, 0.58, 0.5, CEIL - 2.4, I_MARB, MI.marble, { y0: 0, caps: false });
      b.pop();
      bx(b, x - s * 0.8, x + s * 0.2, CEIL - 1.45, CEIL - 1.1, z - 0.88, z + 0.88, I_GOLD, MI.gold);
      b.push(T(x + s * 0.28, CEIL - 1.5, z));
      ellipsoid(b, 0.66, 0.28, 0.66, 8, 4, I_MARB, MI.marbleHi);
      b.pop();
    }
  }
  // pilasters on the ticket wall between the counters
  for (const x of [31.4, 46.6, 54.2, 61.8, 69.4, 84.6]) {
    bx(b, x - 0.72, x + 0.72, FY, CEIL - 1.1, HZ0 + 0.02, HZ0 + 0.5, I_WALL_HI, MI.wallHi);
    bx(b, x - 0.82, x + 0.82, CEIL - 1.45, CEIL - 1.1, HZ0, HZ0 + 0.62, I_GOLD, MI.gold);
  }
  // departure boards: gold lettering rows on the two murals
  for (const cx of [40, 76]) {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 11; c++) {
        if ((r * 7 + c * 3) % 5 === 0) continue;
        const x = cx - 3.3 + c * 0.62, y = 9.1 + r * 0.66;
        bx(b, x, x + 0.46, y, y + 0.2, HZ0 + 0.42, HZ0 + 0.5, GOLDB, MI.goldHi);
      }
    }
    bx(b, cx - 4.0, cx + 4.0, 8.6, 8.9, HZ0 + 0.4, HZ0 + 0.55, I_GOLD, MI.gold);
  }
  // hanging direction signs under the ceiling near each portal
  for (const x of [33, 58, 83]) {
    bx(b, x - 2.2, x + 2.2, CEIL - 2.6, CEIL - 1.8, -134.2, -133.9, I_DARK, MI.dark);
    bx(b, x - 2.05, x + 2.05, CEIL - 2.5, CEIL - 1.9, -133.92, -133.82, I_GOLD, MI.gold);
    for (let i = 0; i < 6; i++) bx(b, x - 1.7 + i * 0.62, x - 1.35 + i * 0.62, CEIL - 2.36, CEIL - 2.04, -133.84, -133.78, GOLDB, MI.goldHi);
    bx(b, x - 2.1, x - 2.0, CEIL - 1.8, CEIL, -134.1, -134.0, I_GOLDD, MI.gold);
    bx(b, x + 2.0, x + 2.1, CEIL - 1.8, CEIL, -134.1, -134.0, I_GOLDD, MI.gold);
  }
}

function hallGallery(b) {
  const y = 7.1;
  for (const [x0, x1] of [[29.5, 66], [83.5, 87.5]]) {
    bx(b, x0, x1, y - 0.38, y, HZ0 + 0.02, HZ0 + 2.7, I_MARB, MI.marble);
    bx(b, x0, x1, y, y + 0.07, HZ0 + 0.02, HZ0 + 2.78, I_GOLDD, MI.gold);
    const nb = Math.round((x1 - x0) / 4);
    for (let i = 0; i <= nb; i++) {
      const x = x0 + 0.5 + i * ((x1 - x0 - 1.0) / nb);
      bx(b, x - 0.22, x + 0.22, y - 1.15, y - 0.38, HZ0 + 0.1, HZ0 + 2.4, I_MARB_D, MI.marble);
    }
    const z = HZ0 + 2.72;
    const nBal = Math.round((x1 - x0) / 1.25);
    for (let i = 0; i <= nBal; i++) baluster(b, x0 + 0.15 + i * ((x1 - x0 - 0.3) / nBal), y + 0.07, z, 0.98);
    bx(b, x0, x1, y + 1.05, y + 1.2, z - 0.13, z + 0.13, I_GOLDD, MI.gold);
    bx(b, x0, x1, y + 0.12, y + 0.24, z - 0.1, z + 0.1, I_GOLDD, MI.gold);
    urn(b, x0 + 0.5, y + 1.2, z, 0.9);
    urn(b, x1 - 0.5, y + 1.2, z, 0.9);
  }
}

function stairDetail(b) {
  const rise = (PLY - FY) / 4, n = 30;
  const flights = [
    { x0: 0.0, x1: 12.0, z0: 0.0, z1: 4.4, y0: FY, y1: FY + rise },
    { x0: 14.5, x1: 2.5, z0: 5.4, z1: 9.8, y0: FY + rise, y1: FY + 2 * rise },
    { x0: 2.5, x1: 14.5, z0: 0.0, z1: 4.4, y0: FY + 2 * rise, y1: FY + 3 * rise },
    { x0: 14.5, x1: 2.5, z0: 5.4, z1: 9.8, y0: FY + 3 * rise, y1: PLY },
  ];
  for (const st of STAIRS) {
    atR(b, st.ox, 0, st.oz, st.yaw, () => {
      for (const f of flights) {
        const dx = (f.x1 - f.x0) / n, dy = (f.y1 - f.y0) / n;
        const zz = f.z0 === 0 ? 0.16 : 9.64;
        for (let i = 0; i <= n; i++) {
          const x = f.x0 + dx * i, y = f.y0 + dy * i;
          baluster(b, x, y + 0.05, zz, 0.9);
        }
      }
      // landing balusters + urns
      for (const [xa, xb, y, z0, z1] of [[12.0, 14.5, FY + rise, 0, 9.8], [0, 2.5, FY + 2 * rise, 0, 9.8], [12.0, 14.5, FY + 3 * rise, 0, 9.8]]) {
        for (const zz of [0.16, 9.64]) {
          for (let i = 0; i < 9; i++) baluster(b, xa + 0.2 + i * ((xb - xa - 0.4) / 8), y + 0.05, zz, 0.9);
        }
        urn(b, xa + 0.6, y + 0.05, z0 + 0.16, 0.7);
        urn(b, xa + 0.6, y + 0.05, z1 - 0.16, 0.7);
      }
      // ribbed soffits + gold fascia on the flights (kills the big blank beige mass)
      for (const f of flights) {
        const sy0 = Math.max(0.02, f.y0 - 1.5), sy1 = f.y1 - 1.5;
        for (let i = 0; i <= 8; i++) {
          const t = i / 8;
          const x = lerp(f.x0, f.x1, t), y = lerp(sy0, sy1, t);
          bx(b, x - 0.14, x + 0.14, Math.max(0.01, y - 0.34), y, f.z0 + 0.1, f.z1 - 0.1, I_GOLDD, MI.gold);
        }
        for (const zz of [f.z0 + 0.06, f.z1 - 0.06]) {
          b.quad([f.x0, Math.max(0.01, sy0 - 0.36), zz], [f.x1, sy1 - 0.36, zz], [f.x1, sy1, zz], [f.x0, sy0, zz], I_GOLDD, MI.gold, [0, 0, zz === f.z0 + 0.06 ? -1 : 1]);
        }
        for (let i = 0; i < 6; i++) {
          const t0 = i / 6, t1 = (i + 1) / 6;
          const xa = lerp(f.x0, f.x1, t0), xb = lerp(f.x0, f.x1, t1);
          const ya = lerp(f.y0, f.y1, t0), yb = lerp(f.y0, f.y1, t1);
          const zz = f.z0 === 0 ? 0.0 : 9.8;
          const nz = f.z0 === 0 ? -1 : 1;
          b.quad([xa + 0.12, Math.max(0.01, ya - 1.3), zz], [xb - 0.12, Math.max(0.01, yb - 1.3), zz], [xb - 0.12, yb - 0.12, zz], [xa + 0.12, ya - 0.12, zz], I_WALL_HI, MI.wallHi, [0, 0, nz]);
        }
      }
      // gold trim along the top of the core wall
      bx(b, 0.0, 14.5, PLY - 0.7, PLY - 0.5, 4.35, 4.55, I_GOLDD, MI.gold);
      bx(b, 0.0, 14.5, PLY - 0.7, PLY - 0.5, 5.25, 5.45, I_GOLDD, MI.gold);
    });
  }
}

function platformDetail(b, ctx, R) {
  const P = platformPlan();
  void R;
  for (const pl of P.platforms) {
    const side = pl.side, zc = pl.zc;
    const zEdge = side < 0 ? CHN - 1.2 : CHS + 1.2;
    const za = side < 0 ? HZ0 : zEdge;
    const zb = side < 0 ? zEdge : HZ1;
    // brackets from each (planned) canopy column up to the canopy
    for (const it of pl.items) {
      if (it.kind !== 'column') continue;
      const x = it.x;
      for (const sz of [-1, 1]) {
        for (const sx of [-1, 1]) {
          bar3(b, [x + sx * 0.42, PLY + 5.6, zc + sz * 0.42], [x + sx * 0.42, 35.9, zc + sz * 2.1], 0.16, 0.2, IRONL, M_METAL, UP);
        }
      }
    }
    // glazing bars on the canopy
    for (let j = 0; j <= 16; j++) {
      const x = HX0 + j * 4;
      for (let i = 0; i < 10; i++) {
        const t0 = i / 10, t1 = (i + 1) / 10;
        const z0 = lerp(za, zb, t0), z1 = lerp(za, zb, t1);
        const y0 = 35.6 + 1.0 * Math.sin(Math.PI * t0) + 0.2, y1 = 35.6 + 1.0 * Math.sin(Math.PI * t1) + 0.2;
        b.quad([x - 0.09, y0, z0], [x + 0.09, y0, z0], [x + 0.09, y1, z1], [x - 0.09, y1, z1], IRONL, M_METAL, UP);
      }
    }
    for (let k = 0; k <= 4; k++) {
      const t = k / 4;
      const z = lerp(za, zb, t), y = 35.6 + 1.0 * Math.sin(Math.PI * t) + 0.22;
      for (let j = 0; j < 16; j++) {
        const x0 = HX0 + j * 4, x1 = x0 + 4;
        b.quad([x0, y, z - 0.1], [x1, y, z - 0.1], [x1, y, z + 0.1], [x0, y, z + 0.1], mulc(IRONL, 0.9), M_METAL, UP);
      }
    }
    // carts / kerb planters / number signs are plan-driven (see platformItem)
  }
}

function shedDetail(b) {
  const NT = 18, NSX = 24;
  const gIn = mixc(GLASS, C.sunGlow, 0.18);
  for (let i = 0; i < NT; i++) {
    const ta = Math.PI * (i / NT), tb = Math.PI * ((i + 1) / NT);
    const ya = SPRING + (SINC - 0.1) * Math.sin(ta), za = ZC - (SHALF - 0.1) * Math.cos(ta);
    const yb = SPRING + (SINC - 0.1) * Math.sin(tb), zb = ZC - (SHALF - 0.1) * Math.cos(tb);
    const na = vs(vaultN(ta), -1), nb = vs(vaultN(tb), -1);
    for (let j = 0; j < NSX; j++) {
      const xa = XW0 + ((XW1 - XW0) * j) / NSX, xb = XW0 + ((XW1 - XW0) * (j + 1)) / NSX;
      quadN(b, [xa, ya, za], [xb, ya, za], [xb, yb, zb], [xa, yb, zb], na, na, nb, nb, ((i + j) & 1) ? gIn : mixc(gIn, C.cloudLit, 0.15), MT.glass);
    }
  }
  // inner ribs + inner purlins
  for (let k = 0; k <= 12; k++) {
    const x = XW0 + ((XW1 - XW0) * k) / 12;
    const xa = x - 0.34, xb = x + 0.34;
    for (let i = 0; i < NT; i++) {
      const ta = Math.PI * (i / NT), tb = Math.PI * ((i + 1) / NT);
      const p = (t, d) => [0, SPRING + (SINC + d) * Math.sin(t), ZC - (SHALF + d) * Math.cos(t)];
      const a0 = p(ta, -0.1), a1 = p(tb, -0.1), b0 = p(ta, -0.5), b1 = p(tb, -0.5);
      const n = vs(vaultN((ta + tb) / 2), -1);
      b.quad([xa, b0[1], b0[2]], [xb, b0[1], b0[2]], [xb, b1[1], b1[2]], [xa, b1[1], b1[2]], mulc(IRONL, 0.9), M_METAL, n);
      b.quad([xa, a0[1], a0[2]], [xa, b0[1], b0[2]], [xa, b1[1], b1[2]], [xa, a1[1], a1[2]], IRON, M_METAL, NX);
      b.quad([xb, a1[1], a1[2]], [xb, b1[1], b1[2]], [xb, b0[1], b0[2]], [xb, a0[1], a0[2]], IRON, M_METAL, PX);
    }
  }
  for (let i = 1; i < 9; i++) {
    const t = Math.PI * (i / 9);
    const y = SPRING + (SINC - 0.12) * Math.sin(t), z = ZC - (SHALF - 0.12) * Math.cos(t);
    const n = vs(vaultN(t), -1);
    for (let j = 0; j < NSX; j++) {
      const xa = XW0 + ((XW1 - XW0) * j) / NSX, xb = XW0 + ((XW1 - XW0) * (j + 1)) / NSX;
      const ty = Math.cos(t) * 0.2, tz = Math.sin(t) * 0.2;
      b.quad([xa, y - ty, z + tz], [xb, y - ty, z + tz], [xb, y + ty, z - tz], [xa, y + ty, z - tz], mulc(IRONL, 0.86), M_METAL, n);
    }
  }
  // gable interior trusses (clear of the train envelope: verticals sit outside z -150..-142)
  for (const x of [XW0 + 2.2, XW1 - 2.2]) {
    for (const z of [-160, -156, -136, -132]) {
      const yTop = vaultY(z) - 0.5;
      bar3(b, [x, PLY, z], [x, yTop, z], 0.3, 0.3, IRON, M_METAL, UP);
      bar3(b, [x, yTop - 1.2, z], [x, yTop - 1.2, z + (z < ZC ? 4 : -4)], 0.24, 0.24, IRONL, M_METAL, UP);
    }
    for (let i = 0; i < 18; i++) {
      const ta = Math.PI * (i / 18), tb = Math.PI * ((i + 1) / 18);
      const ya = SPRING + (SINC - 0.55) * Math.sin(ta), za = ZC - (SHALF - 0.55) * Math.cos(ta);
      const yb = SPRING + (SINC - 0.55) * Math.sin(tb), zb = ZC - (SHALF - 0.55) * Math.cos(tb);
      b.quad([x - 0.2, ya, za], [x + 0.2, ya, za], [x + 0.2, yb, zb], [x - 0.2, yb, zb], IRON, M_METAL, vs(vaultN((ta + tb) / 2), -1));
    }
  }
}

function facadeDetail(b) {
  // dentils under the main cornice
  for (let i = 0; i < 96; i++) {
    const x = XW0 + 0.4 + i * ((XW1 - XW0 - 0.8) / 95);
    bx(b, x - 0.16, x + 0.16, 18.6, 19.35, ZFW - 0.02, ZF - 0.08, STONE_P, M_MARBLE);
  }
  // statues on the attic parapet
  for (const x of [34, 50, 66, 82]) {
    bx(b, x - 0.7, x + 0.7, WTOP - 0.2, WTOP + 1.0, ZFW - 0.1, ZF - 0.15, STONE_P, M_MARBLE);
    atR(b, x, WTOP + 1.0, ZF - 0.5, 0, () => figure(b, 0, 0, 0, 1.5, 0, MARBLE, MI.marbleHi));
  }
  // keystones over the facade openings
  for (const [x, y, w] of [[58, 15.7, 1.3], [33, 13.7, 1.0], [83, 13.7, 1.0], [48.875, 14.3, 0.9], [67.125, 14.3, 0.9]]) {
    bx(b, x - w / 2, x + w / 2, y - 0.1, y + 0.95, ZFW - 0.05, ZF - 0.1, GOLDB, M_GOLD);
  }
  // portal awnings (folded, against the facade, above each portal)
  for (const [x, y, w] of [[58, 16.0, 10.0], [33, 14.0, 7.4], [83, 14.0, 7.4]]) {
    bx(b, x - w / 2, x + w / 2, y, y + 0.34, ZFW - 0.05, ZF - 0.42, I_RED, MI.red);
    bx(b, x - w / 2, x + w / 2, y - 0.14, y, ZFW - 0.05, ZF - 0.42, I_GOLDD, MI.gold);
    for (let i = 0; i < 8; i++) {
      const gx = x - w / 2 + 0.4 + i * ((w - 0.8) / 7);
      bx(b, gx - 0.05, gx + 0.05, y + 0.34, y + 0.5, ZF - 0.4, ZF - 0.3, GOLDB, M_GOLD);
    }
  }
  // banners on the pilasters
  for (const x of [45.8, 70.2]) {
    bx(b, x - 0.9, x + 0.9, 12.6, 15.6, ZF - 0.1, ZF - 0.16, I_RED, MI.red);
    bx(b, x - 0.9, x + 0.9, 15.5, 15.7, ZF - 0.1, ZF - 0.18, GOLDB, M_GOLD);
    bx(b, x - 0.12, x + 0.12, 15.6, 16.5, ZF - 0.12, ZF - 0.2, I_GOLDD, MI.gold);
  }
  // relief panels between the attic windows
  for (const x of [42, 58, 74]) {
    bx(b, x - 2.0, x + 2.0, 22.0, 25.6, ZFW - 0.03, ZF - 0.08, mulc(STONE_P, 1.02), M_MARBLE);
    for (let i = 0; i < 5; i++) bx(b, x - 1.6 + i * 0.66, x - 1.25 + i * 0.66, 22.4, 25.2, ZF - 0.08, ZF - 0.02, STONE, M_MARBLE);
  }
}

function endWallDetail(b) {
  for (const s of [1, -1]) {
    const xo = s > 0 ? XW0 - 0.03 : XW1 + 0.03;
    // blind arcade on the band above the ground windows
    for (const z of [-156, -146, -136]) {
      for (let i = 0; i < 7; i++) {
        const a0 = Math.PI * (i / 7), a1 = Math.PI * ((i + 1) / 7);
        const p0 = [z + Math.cos(a0) * 2.5, 16.2 + Math.sin(a0) * 2.5];
        const p1 = [z + Math.cos(a1) * 2.5, 16.2 + Math.sin(a1) * 2.5];
        const p2 = [z + Math.cos(a1) * 2.9, 16.2 + Math.sin(a1) * 2.9];
        const p3 = [z + Math.cos(a0) * 2.9, 16.2 + Math.sin(a0) * 2.9];
        b.quad([xo, p0[1], p0[0]], [xo, p1[1], p1[0]], [xo, p2[1], p2[0]], [xo, p3[1], p3[0]], STONE_P, M_MARBLE, s > 0 ? NX : PX);
      }
      for (const sz of [-1, 1]) bx(b, Math.min(xo, xo - s * 0.1), Math.max(xo, xo - s * 0.1), 13.6, 16.2, z + sz * 2.5 - 0.2, z + sz * 2.5 + 0.2, STONE_P, M_MARBLE);
    }
    // quoins at the four corners
    for (let k = 0; k < 12; k++) {
      const y = 2.4 + k * 2.4;
      bx(b, Math.min(xo, xo - s * 0.25), Math.max(xo, xo - s * 0.25), y, y + 1.1, ZBW + 0.1, ZBW + 1.6, STONE_P, M_MARBLE);
      bx(b, Math.min(xo, xo - s * 0.25), Math.max(xo, xo - s * 0.25), y + 1.2, y + 2.3, ZFW - 1.6, ZFW - 0.1, STONE_P, M_MARBLE);
    }
    // cornice dentils on the end walls
    for (let i = 0; i < 20; i++) {
      const z = ZBW + 0.5 + i * ((ZFW - ZBW - 1.0) / 19);
      if (z > -152.2 && z < -139.8) continue;
      bx(b, Math.min(xo, xo - s * 0.3), Math.max(xo, xo - s * 0.3), 18.6, 19.35, z - 0.16, z + 0.16, STONE_P, M_MARBLE);
    }
  }
}

function archDetail(b) {
  for (const s of [1, -1]) {
    const xa = s > 0 ? XW0 : XW1 - 4.0, xb = s > 0 ? XW0 + 4.0 : XW1;
    // transverse ribs on the tunnel soffit
    for (let k = 0; k < 5; k++) {
      const x = xa + (xb - xa) * (k + 0.5) / 5;
      for (let i = 0; i < 12; i++) {
        const a0 = Math.PI * (i / 12), a1 = Math.PI * ((i + 1) / 12);
        const p0 = [ZC + Math.cos(a0) * (ARCHR - 0.16), ARCHY + Math.sin(a0) * (ARCHR - 0.16)];
        const p1 = [ZC + Math.cos(a1) * (ARCHR - 0.16), ARCHY + Math.sin(a1) * (ARCHR - 0.16)];
        b.quad([x - 0.16, p0[1], p0[0]], [x + 0.16, p0[1], p0[0]], [x + 0.16, p1[1], p1[0]], [x - 0.16, p1[1], p1[0]], IRON, M_METAL, UP);
      }
    }
    // gold arch trim on the outer face
    const xo = s > 0 ? XW0 - 0.12 : XW1 + 0.12;
    for (let i = 0; i < 16; i++) {
      const a0 = Math.PI * (i / 16), a1 = Math.PI * ((i + 1) / 16);
      const p0 = [ZC + Math.cos(a0) * ARCHR, ARCHY + Math.sin(a0) * ARCHR];
      const p1 = [ZC + Math.cos(a1) * ARCHR, ARCHY + Math.sin(a1) * ARCHR];
      const p2 = [ZC + Math.cos(a1) * (ARCHR + 0.22), ARCHY + Math.sin(a1) * (ARCHR + 0.22)];
      const p3 = [ZC + Math.cos(a0) * (ARCHR + 0.22), ARCHY + Math.sin(a0) * (ARCHR + 0.22)];
      b.quad([xo, p0[1], p0[0]], [xo, p1[1], p1[0]], [xo, p2[1], p2[0]], [xo, p3[1], p3[0]], GOLDB, M_GOLD, s > 0 ? NX : PX);
    }
  }
}

function forecourtDetail(b) {
  const TZ0 = ZFW, TZ1 = -116;
  // urns on the balustrade piers
  for (const x of [23.8, 27.4, 36.6, 45.4, 70.6, 79.4, 88.6, 92.2]) urn(b, x, TY + 1.1, TZ1 - 0.2, 1.0);
  // planter boxes along the facade
  for (const x of [31, 45, 71, 85]) {
    bx(b, x - 1.6, x + 1.6, TY, TY + 0.75, TZ0 + 0.5, TZ0 + 1.9, I_MARB, MI.marble);
    bx(b, x - 1.5, x + 1.5, TY + 0.75, TY + 0.82, TZ0 + 0.6, TZ0 + 1.8, LEAFD, MI.leaf);
    for (let k = 0; k < 7; k++) {
      b.push(T(x - 1.2 + k * 0.4, TY + 0.82, TZ0 + 1.2));
      ellipsoid(b, 0.2, 0.18, 0.2, 5, 3, k % 2 ? PINK : YELLOW, MI.leaf);
      b.pop();
    }
  }
  // terrace paving inlay: two gold bands + a medallion in front of the main portal
  for (const z of [TZ0 + 2.2, TZ1 - 2.2]) bx(b, 23.5, 92.5, TY + 0.012, TY + 0.022, z - 0.14, z + 0.14, I_GOLDD, MI.gold);
  for (const [r0, r1] of [[5.6, 6.2], [3.4, 3.8]]) {
    for (let i = 0; i < 40; i++) {
      const a0 = (i / 40) * TAU, a1 = ((i + 1) / 40) * TAU;
      b.quad([58 + Math.cos(a0) * r0, TY + 0.018, -121 + Math.sin(a0) * r0], [58 + Math.cos(a1) * r0, TY + 0.018, -121 + Math.sin(a1) * r0],
        [58 + Math.cos(a1) * r1, TY + 0.018, -121 + Math.sin(a1) * r1], [58 + Math.cos(a0) * r1, TY + 0.018, -121 + Math.sin(a0) * r1], I_GOLDD, MI.gold, UP);
    }
  }
}


