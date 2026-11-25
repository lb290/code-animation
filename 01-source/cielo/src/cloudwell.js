// CLOUDWELL — ROUND 14 · 云井塔 / THE CLOUDWELL
// OWNER: agent "shell".  Contract (frozen): src/cloudwell-plan.js (CW / CWC / CWM / FLY_RAYS / CAVITIES).
// Interior furnishings + the 8 point lights: src/cloudwell-hall.js (other builder).
//
// WHAT THIS FILE BUILDS
//   the water-gate platform astride the canal (rusticated massif, two canal arches, grand
//   north stair, marble terrace, stone balustrade, urns, corner lamp pedestals), the stone
//   entrance storey with its pierced +Z portal (arch, voussoirs, sunburst, copper leaves),
//   the 24-bay brass-and-glass curtain wall (20..89) with the eleven gallery decks + railings,
//   the outer cornice rings, and the lantern crown (colonnade, open oculus, shallow dome,
//   finial, weather flags).  Pass 2 adds the 云井亭 pavilion, the spiral stair turret and
//   the ornamental relief.
//
// FRAME: origin at ground level on the canal axis.  +Z = north (city / terrace side),
//   +X east, y up.  Angles PHI are measured from +Z toward +X: P = (r sin phi, y, r cos phi).
//   Terrace level y = 7, canal water plane y ~ 0.035.
// DETERMINISM: own mulberry32(0x0c10d5); the shared rng is ignored (never drawn from).
import { mulberry32, TAU, m4 } from './math.js';
import { box, cylinder, lathe, torus, sphere, mulc, mixc, bar3 } from './geo.js';
import { C } from './palette.js';
import { CW, CWC, CWM, cwPush } from './cloudwell-plan.js';

const SEED = 0x0c10d5;
const PI = Math.PI;

// ---------------------------------------------------------------- contract dims
const SEG = CW.SEG, BAY = TAU / SEG;
const PX = CW.PX, PZ = CW.PZ, PY0 = CW.PY0, PY1 = CW.PY1;
const TUN_HW = CW.TUN_HW, TUN_SPR = CW.TUN_SPRING, TUN_TOP = CW.TUN_TOP;
const STAIR_HW = CW.STAIR_HW;
const R_OUT = CW.R_OUT, R_IN = CW.R_IN, ES_O = 18.6;      // entrance storey outer radius
const Y0 = CW.Y_BASE, Y_ENT = CW.ENT_Y1, CORN_Y1 = 20.4;  // 7 / 19 / 20.4
const GALV = CW.GALV, GAL_T = CW.GAL_T, GAL_R0 = CW.GAL_R0, RAIL_H = CW.RAIL_H;
const WELL_R = CW.WELL_R, WELL_Y = CW.WELL_Y;
const PAV_R = CW.PAV_R, PAV_N = CW.PAV_N, PAV_COL_H = CW.PAV_COL_H;
const PAV_ROOF_Y = CW.PAV_ROOF_Y, PAV_TOP = CW.PAV_TOP, PAV_OC = CW.PAV_OC;
const TC = CW.TUR_C, TR = CW.TUR_R, TRI = CW.TUR_RI, TR_Y0 = CW.TUR_Y0, TR_Y1 = CW.TUR_Y1;
const TR_CAP = CW.TUR_TOPCAP, CR_R = CW.CROWN_R, CR_OC = CW.CROWN_OC;
const Y_TOP = CW.Y_TOP, Y_ROOF = CW.Y_ROOF, Y_CROWN = CW.Y_CROWN;
const PORT_HW = CW.PORT_HW, PORT_SPRING = CW.PORT_SPRING, PORT_APEX = CW.PORT_APEX;
const PHA = 15 * PI / 180;         // portal sector half-angle
const TRH = 9.5 * PI / 180;        // half-angle of the curtain-wall cut for the turret (phi = PI)
const PAV_A = (15 + 30 * (0)) * 0; // (placeholder, keeps the constant list tidy)

// ---------------------------------------------------------------- palette
const IV = CWC.IVORY, IVW = CWC.IVORY_W, ST = CWC.STONE, STD = CWC.STONE_D, STL = CWC.STONE_L;
const MB = CWC.MARBLE, MBD = CWC.MARBLE_D, GD = CWC.GOLD, GDB = CWC.GOLD_B, GDD = CWC.GOLD_D;
const BR = CWC.BRASS, BRD = CWC.BRASS_D, BRL = CWC.BRASS_L;
const GL = CWC.GLASS, GLD = CWC.GLASS_D, GLI = CWC.GLASS_ICE;
const BL = CWC.BLUE, BLD = CWC.BLUE_D, BLL = CWC.BLUE_L;
const WD = CWC.WOOD, WDD = CWC.WOOD_D, CLOUD = CWC.CLOUD;
const CU = C.copper, SL = C.slate, SLD = C.slateDark;

// ---------------------------------------------------------------- materials (CWM only, em <= 0.145)
const M_ST = CWM.stone, M_STW = CWM.stoneWarm, M_MB = CWM.marble, M_MBD = CWM.marbleD;
const M_BR = CWM.brass, M_GD = CWM.gold, M_GDB = CWM.goldB, M_STL = CWM.steel;
const M_GL = CWM.glass, M_GLD = CWM.glassD, M_IRON = CWM.iron, M_WD = CWM.wood;
const M_DARK = [0.042, 0.16];

// ---------------------------------------------------------------- tiny helpers
const T = (x, y, z) => m4.translate([x, y, z]);
const RY = (a) => m4.rotY(a);
function put(b, x, y, z, fn) { b.push(T(x, y, z)); fn(); b.pop(); }
function putR(b, x, y, z, yaw, fn) { b.push(T(x, y, z)); if (yaw) b.push(RY(yaw)); fn(); if (yaw) b.pop(); b.pop(); }

// polar point (phi from +Z), radial normal
const Pt = (r, a, y) => [r * Math.sin(a), y, r * Math.cos(a)];
const NR = (a) => [Math.sin(a), 0, Math.cos(a)];

// cylindrical face band
function cylF(b, r, y0, y1, a0, a1, n, col, mat, side = 1, colFn) {
  for (let i = 0; i < n; i++) {
    const t0 = a0 + (a1 - a0) * (i / n), t1 = a0 + (a1 - a0) * ((i + 1) / n), tm = (t0 + t1) / 2;
    const c = colFn ? colFn(tm, i) : col;
    b.quad(Pt(r, t0, y0), Pt(r, t1, y0), Pt(r, t1, y1), Pt(r, t0, y1), c, mat,
      [side * Math.sin(tm), 0, side * Math.cos(tm)]);
  }
}
// flat annulus / disc sector (r0 may be 0)
function ringF(b, r0, r1, y, a0, a1, n, col, mat, ny = 1, colFn) {
  const N = [0, ny, 0];
  for (let i = 0; i < n; i++) {
    const t0 = a0 + (a1 - a0) * (i / n), t1 = a0 + (a1 - a0) * ((i + 1) / n);
    const c = colFn ? colFn((t0 + t1) / 2, i) : col;
    if (r0 < 1e-4) b.tri([0, y, 0], Pt(r1, t1, y), Pt(r1, t0, y), c, mat, N, N, N);
    else b.quad(Pt(r0, t0, y), Pt(r0, t1, y), Pt(r1, t1, y), Pt(r1, t0, y), c, mat, N);
  }
}
// rectangular-section ring band, optional per-face suppression
function bandF(b, rIn, rOut, y0, y1, a0, a1, n, col, mat, o = {}) {
  const top = o.topCol || mulc(col, 1.12), bot = o.botCol || mulc(col, 0.58);
  const oc = o.outCol || col, ic = o.inCol || mulc(col, 0.80);
  for (let i = 0; i < n; i++) {
    const t0 = a0 + (a1 - a0) * (i / n), t1 = a0 + (a1 - a0) * ((i + 1) / n), tm = (t0 + t1) / 2;
    if (o.skip && o.skip(tm)) continue;
    if (!o.noTop) b.quad(Pt(rIn, t0, y1), Pt(rIn, t1, y1), Pt(rOut, t1, y1), Pt(rOut, t0, y1), top, mat, [0, 1, 0]);
    if (!o.noBot) b.quad(Pt(rIn, t0, y0), Pt(rIn, t1, y0), Pt(rOut, t1, y0), Pt(rOut, t0, y0), bot, mat, [0, -1, 0]);
    if (!o.noOut) b.quad(Pt(rOut, t0, y0), Pt(rOut, t1, y0), Pt(rOut, t1, y1), Pt(rOut, t0, y1), oc, mat, NR(tm));
    if (!o.noIn) b.quad(Pt(rIn, t0, y0), Pt(rIn, t1, y0), Pt(rIn, t1, y1), Pt(rIn, t0, y1), ic, mat, [-Math.sin(tm), 0, -Math.cos(tm)]);
  }
}
// radial rib (mullion) on a cylinder: front face at r + d, two sides
function ribF(b, r, a, w, d, y0, y1, col, mat) {
  const ha = w / (2 * r);
  const a0 = a - ha, a1 = a + ha;
  b.quad(Pt(r + d, a0, y0), Pt(r + d, a1, y0), Pt(r + d, a1, y1), Pt(r + d, a0, y1), col, mat, NR(a));
  const tg = [Math.cos(a), 0, -Math.sin(a)];
  b.quad(Pt(r, a0, y0), Pt(r + d, a0, y0), Pt(r + d, a0, y1), Pt(r, a0, y1), mulc(col, 0.86), mat, [-tg[0], 0, -tg[2]]);
  b.quad(Pt(r, a1, y0), Pt(r + d, a1, y0), Pt(r + d, a1, y1), Pt(r, a1, y1), mulc(col, 0.92), mat, tg);
}
// arch height of the canal tunnel (segment arch: spring 1.2 -> crown 5.4 over z +-11)
const tunY = (z) => TUN_SPR + (TUN_TOP - TUN_SPR) * Math.sqrt(Math.max(0, 1 - (z / TUN_HW) * (z / TUN_HW)));
// run a box along a straight run: horizontal (along X) or vertical (along Z)
function runBox(b, x0, z0, x1, z1, y0, y1, w, col, mat, topCol) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, cy = (y0 + y1) / 2;
  const yaw = Math.atan2(x1 - x0, z1 - z0);
  putR(b, cx, cy, cz, yaw, () => box(b, w, y1 - y0, len, col, mat, topCol ? { topCol } : {}));
}

// ================================================================== PLATFORM
function buildTerrace(b, rnd) {
  const Y = PY1;                      // 7
  // ---------------- rusticated outer faces of the massif (visible part y 0..7)
  // outer faces exist on all four sides; the two canal arches pierce the x = +-PX faces.
  const courses = [[0.0, 1.9], [1.9, 3.8], [3.8, 5.7], [5.7, 7.0]];
  // east / west faces with the canal tunnel
  for (const sx of [-1, 1]) {
    const x = sx * PX;
    const N = [sx, 0, 0];
    // piers on both sides of the tunnel opening
    for (const [z0, z1] of [[TUN_HW, PZ], [-PZ, -TUN_HW]]) {
      for (let ci = 0; ci < courses.length; ci++) {
        const [y0, y1] = courses[ci];
        const off = ci % 2 ? 0.09 : 0.0;
        const xx = x + sx * off;
        const cA = ci % 2 ? STD : ST;
        b.quad([xx, y0, z0], [xx, y0, z1], [xx, y1, z1], [xx, y1, z0], cA, M_ST, N);
        if (ci > 0) {
          const yo = y0;
          b.quad([x, yo, z0], [x, yo, z1], [xx, yo, z1], [xx, yo, z0], mulc(ST, 0.72), M_ST, [0, -1, 0]);
        }
      }
      // pilaster strip at the outer end of each pier
      const zp = z0 < 0 ? z0 + 0.7 : z1 - 0.7;
      b.quad([x + sx * 0.16, 0.0, zp - 0.55], [x + sx * 0.16, 0.0, zp + 0.55],
        [x + sx * 0.16, Y, zp + 0.55], [x + sx * 0.16, Y, zp - 0.55], STL, M_ST, N);
      // gold string course
      b.quad([x + sx * 0.13, 5.45, z0], [x + sx * 0.13, 5.45, z1], [x + sx * 0.13, 5.6, z1], [x + sx * 0.13, 5.6, z0], GDD, M_GD, N);
    }
    // spandrel above the arch (arched bottom edge) + gold arch line
    const NS = 18;
    for (let i = 0; i < NS; i++) {
      const z0 = -TUN_HW + (2 * TUN_HW * i) / NS, z1 = -TUN_HW + (2 * TUN_HW * (i + 1)) / NS;
      const y0 = tunY(z0), y1 = tunY(z1);
      b.quad([x, y0, z0], [x, y1, z1], [x, Y, z1], [x, Y, z0], STL, M_ST, N);
      b.quad([x + sx * 0.1, y0 + 0.06, z0], [x + sx * 0.1, y1 + 0.06, z1],
        [x + sx * 0.1, y1 + 0.42, z1], [x + sx * 0.1, y0 + 0.42, z0], GD, M_GD, N);
    }
    // keystone
    put(b, x + sx * 0.2, TUN_TOP + 0.55, 0, () => box(b, 0.5, 1.5, 0.9, GD, M_GD, { topCol: GDB }));
    // ------- canal tunnel soffit (elliptical barrel, normals into the tunnel)
    const NT = 26;
    for (let i = 0; i < NT; i++) {
      const z0 = -TUN_HW + (2 * TUN_HW * i) / NT, z1 = -TUN_HW + (2 * TUN_HW * (i + 1)) / NT;
      const y0 = tunY(z0), y1 = tunY(z1);
      const zm = (z0 + z1) / 2;
      const dy = (tunY(zm + 0.01) - tunY(zm - 0.01)) / 0.02;
      const n = [0, -1, dy];
      const nn = Math.hypot(n[1], n[2]);
      b.quad([-PX, y0, z0], [PX, y0, z0], [PX, y1, z1], [-PX, y1, z1], mulc(STD, 0.85), M_ST, [0, n[1] / nn, n[2] / nn]);
    }
    // tunnel side walls (from the waterline up to the springline)
    for (const sz of [-1, 1]) {
      const z = sz * TUN_HW;
      b.quad([-PX, -0.2, z], [PX, -0.2, z], [PX, TUN_SPR, z], [-PX, TUN_SPR, z], mulc(STD, 0.8), M_ST, [0, 0, -sz]);
    }
  }
  // north face (z = +PZ): two wall panels flanking the grand stair
  const NF = 11;
  for (const sx of [-1, 1]) {
    const x0 = sx * (STAIR_HW + 0.45), x1 = sx * PX;
    const xa = Math.min(x0, x1), xb = Math.max(x0, x1);
    for (let ci = 0; ci < courses.length; ci++) {
      const [y0, y1] = courses[ci];
      const off = ci % 2 ? 0.09 : 0.0;
      const zz = PZ + off;
      b.quad([xa, y0, zz], [xb, y0, zz], [xb, y1, zz], [xa, y1, zz], ci % 2 ? STD : ST, M_ST, [0, 0, 1]);
      if (ci > 0) b.quad([xa, y0, PZ], [xb, y0, PZ], [xb, y0, zz], [xa, y0, zz], mulc(ST, 0.72), M_ST, [0, -1, 0]);
    }
    // blind arch niches on the north face
    for (let k = 0; k < 2; k++) {
      const cx = sx * (11.6 + k * 5.4);
      blindArch(b, cx, 0.0, PZ + 0.03, 1.55, 2.9, 1.15, 0.42, 1, [0, 0, 1], STD, STD, GDD);
    }
    // gold string course
    b.quad([xa, 5.45, PZ + 0.12], [xb, 5.45, PZ + 0.12], [xb, 5.6, PZ + 0.12], [xa, 5.6, PZ + 0.12], GDD, M_GD, [0, 0, 1]);
  }
  // south face (z = -PZ): three blind arches + the central niche gateway
  for (let ci = 0; ci < courses.length; ci++) {
    const [y0, y1] = courses[ci];
    const off = ci % 2 ? 0.09 : 0.0;
    const zz = -PZ - off;
    b.quad([-PX, y0, zz], [PX, y0, zz], [PX, y1, zz], [-PX, y1, zz], ci % 2 ? STD : ST, M_ST, [0, 0, -1]);
    if (ci > 0) b.quad([-PX, y0, -PZ], [PX, y0, -PZ], [PX, y0, zz], [-PX, y0, zz], mulc(ST, 0.72), M_ST, [0, -1, 0]);
  }
  for (let k = -1; k <= 1; k++) {
    const cx = k * 13.2;
    const big = k === 0;
    blindArch(b, cx, 0.0, -PZ - 0.03, big ? 2.5 : 2.1, big ? 4.6 : 3.9, big ? 1.9 : 1.45, 0.5, -1, [0, 0, -1], STD, STD, GDD);
    if (big) {
      // central gateway: a dark reveal + copper door leaves set in the blind niche
      put(b, 0, 1.9, -PZ - 0.55, () => box(b, 3.3, 3.8, 0.16, mulc(WD, 0.55), M_WD, { topCol: mulc(WD, 0.7) }));
      for (const sx of [-1, 1]) put(b, sx * 1.72, 1.9, -PZ - 0.35, () => box(b, 0.14, 3.8, 0.4, BRD, M_BR));
    }
  }
  // gold string course along the south face
  b.quad([-PX, 5.45, -PZ - 0.12], [PX, 5.45, -PZ - 0.12], [PX, 5.6, -PZ - 0.12], [-PX, 5.6, -PZ - 0.12], GDD, M_GD, [0, 0, -1]);

  // ---------------- terrace cornice (the platform's crowning band)
  runBox(b, -PX, -PZ, PX, -PZ, 6.42, 6.94, 0.5, STL, M_ST, MB);
  runBox(b, -PX, PZ, PX, PZ, 6.42, 6.94, 0.5, STL, M_ST, MB);
  runBox(b, PX, -PZ, PX, PZ, 6.42, 6.94, 0.5, STL, M_ST, MB);
  runBox(b, -PX, -PZ, -PX, PZ, 6.42, 6.94, 0.5, STL, M_ST, MB);
  // ---------------- marble terrace paving (tiles, with the well and the stair slot cut out)
  const tile = 2.35;
  const slot = [-(STAIR_HW + 0.45), STAIR_HW + 0.45, PZ - 10.6, PZ + 1.0];
  let ti = 0;
  for (let x0 = -PX; x0 < PX - 1e-6; x0 += tile) {
    for (let z0 = -PZ; z0 < PZ - 1e-6; z0 += tile) {
      const x1 = Math.min(PX, x0 + tile), z1 = Math.min(PZ, z0 + tile);
      ti++;
      const subs = rectMinus(x0, z0, x1, z1, slot);
      for (const s of subs) {
        const [ax, bx, cz, dz] = s;
        // skip tiles that sit wholly inside the well's paving ring
        let far = 0;
        for (const cx of [ax, bx]) for (const czz of [cz, dz]) far = Math.max(far, Math.hypot(cx, czz));
        if (far < 6.05) continue;
        const c = (ti % 2) ? MB : MBD;
        const cc = mulc(c, 0.97 + 0.05 * ((ti * 37) % 7) / 7);
        b.quad([ax, Y, cz], [bx, Y, cz], [bx, Y, dz], [ax, Y, dz], cc, M_MB, [0, 1, 0]);
      }
    }
  }
  // terrace inlays: concentric gold rings + 24 radial gilt lines
  ringF(b, 6.1, 6.34, Y + 0.012, 0, TAU, 48, GD, M_GD, 1);
  ringF(b, 9.42, 9.6, Y + 0.012, 0, TAU, 48, GD, M_GD, 1);
  ringF(b, 12.9, 13.1, Y + 0.012, 0, TAU, 48, GDD, M_GD, 1);
  ringF(b, 15.6, 15.8, Y + 0.012, 0, TAU, 48, GD, M_GD, 1);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU;
    b.quad(Pt(6.4, a - 0.004, Y + 0.012), Pt(6.4, a + 0.004, Y + 0.012),
      Pt(18.4, a + 0.006, Y + 0.012), Pt(18.4, a - 0.006, Y + 0.012), mulc(GD, 0.9), M_GD, [0, 1, 0]);
  }
  // ---------------- the well: brass curb, marble surround, glass disc, liner
  ringF(b, WELL_R, WELL_R + 0.62, Y + 0.02, 0, TAU, 40, BR, M_BR, 1, (a, i) => (i % 2 ? mulc(BR, 0.86) : BR));
  bandF(b, WELL_R, WELL_R + 0.62, Y - 0.16, Y + 0.02, 0, TAU, 40, BR, M_BR, { noIn: true, noBot: true });
  ringF(b, WELL_R + 0.62, 6.0, Y + 0.016, 0, TAU, 48, MB, M_MB, 1, (a, i) => (i % 2 ? MB : MBD));
  bandF(b, WELL_R + 0.2, WELL_R + 0.4, Y + 0.016, Y + 0.05, 0, TAU, 40, BL, [0.07, 0.2], { noIn: true, noBot: true });
  cylF(b, WELL_R, WELL_Y, Y - 0.16, 0, TAU, 40, mulc(STD, 0.9), M_ST, -1);
  ringF(b, 0.0, WELL_R, WELL_Y, 0, TAU, 40, GLI, M_GL, 1);
  bandF(b, WELL_R - 0.18, WELL_R, WELL_Y - 0.16, WELL_Y + 0.02, 0, TAU, 40, BR, M_BR, { noIn: true, noTop: true });
  // ---------------- terrace balustrade (stone, with the grand stair opening cut out)
  const pIn = PX - 1.0, pOut = PX - 0.28, qz = PZ - 1.0;
  // south run
  railRun(b, -pOut, -qz, pOut, -qz, Y, 1, rnd);
  // east / west runs
  railRun(b, pOut, -qz, pOut, qz, Y, 2, rnd);
  railRun(b, -pOut, -qz, -pOut, qz, Y, 2, rnd);
  // north runs, leaving the central 9 m open for the approach to the portal
  railRun(b, -pOut, qz, -5.2, qz, Y, 2, rnd);
  railRun(b, 5.2, qz, pOut, qz, Y, 2, rnd);
  // corner piers with gilt finials
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    put(b, sx * pOut, Y, sz * qz, () => {
      box(b, 1.15, 1.55, 1.15, STL, M_ST, { topCol: mulc(MB, 1.02) });
      put(b, 0, 0.9, 0, () => { box(b, 1.35, 0.16, 1.35, GD, M_GD); });
      put(b, 0, 1.06, 0, () => sphere(b, 0.34, GDB, M_GDB, { rings: 3, seg: 8, jitter: 0.05, seed: 7 }));
    });
  }
  // ---------------- the north grand stair (two flights + landing)
  buildGrandStair(b);

  // ---------------- urns flanking the stair head
  for (const sx of [-1, 1]) {
    put(b, sx * 8.0, Y, PZ - 1.1, () => {
      box(b, 1.16, 0.9, 1.16, STL, M_ST, { topCol: MB });
      put(b, 0, 0.9, 0, () => urn(b, 1.0, MB, M_MB, GD, M_GD));
    });
  }
  // ---------------- four corner lamp pedestals (geometry only: no point lights here)
  for (let k = 0; k < 4; k++) {
    const a = PI / 4 + k * PI / 2;
    put(b, Math.sin(a) * 17.0, Y, Math.cos(a) * 17.0, () => lampPedestal(b, 1.0));
  }
}

// blind arch recess in a plane facing +-Z (nz = +1 north, -1 south)
function blindArch(b, cx, y0, zFace, hw, h, arcH, depth, nz, N, cBack, cFrame, cGold) {
  const z0 = zFace, z1 = zFace - nz * depth;
  const ys = y0 + h;
  // back panel
  b.quad([cx - hw, y0, z1], [cx + hw, y0, z1], [cx + hw, ys, z1], [cx - hw, ys, z1], cBack, M_ST, [0, 0, nz]);
  // arch head on the back panel
  const NA = 7;
  for (let i = 0; i < NA; i++) {
    const a0 = PI * (i / NA), a1 = PI * ((i + 1) / NA);
    b.tri([cx, ys, z1], [cx + Math.cos(a0) * hw, ys + Math.sin(a0) * arcH, z1],
      [cx + Math.cos(a1) * hw, ys + Math.sin(a1) * arcH, z1], cBack, M_ST, [0, 0, nz], [0, 0, nz], [0, 0, nz]);
  }
  // reveals: jambs
  for (const s of [-1, 1]) {
    b.quad([cx + s * hw, y0, z1], [cx + s * hw, y0, z0], [cx + s * hw, ys, z0], [cx + s * hw, ys, z1],
      mulc(cBack, 0.86), M_ST, [-s, 0, 0]);
  }
  // reveals: sill
  b.quad([cx - hw, y0, z1], [cx - hw, y0, z0], [cx + hw, y0, z0], [cx + hw, y0, z1], mulc(cBack, 0.7), M_ST, [0, 1, 0]);
  // reveals: arch soffit
  for (let i = 0; i < NA; i++) {
    const a0 = PI * (i / NA), a1 = PI * ((i + 1) / NA);
    const x0 = cx + Math.cos(a0) * hw, y0a = ys + Math.sin(a0) * arcH;
    const x1 = cx + Math.cos(a1) * hw, y1a = ys + Math.sin(a1) * arcH;
    const am = (a0 + a1) / 2;
    b.quad([x0, y0a, z1], [x1, y1a, z1], [x1, y1a, z0], [x0, y0a, z0], mulc(cBack, 0.8), M_ST,
      [0, -Math.sin(am), 0]);
  }
  // frame: a raised band around the opening (three straight pieces + the arch)
  const fw = 0.3;
  b.quad([cx - hw - fw, y0, z0 + nz * 0.06], [cx - hw, y0, z0 + nz * 0.06], [cx - hw, ys, z0 + nz * 0.06], [cx - hw - fw, ys, z0 + nz * 0.06], cFrame, M_ST, [0, 0, nz]);
  b.quad([cx + hw, y0, z0 + nz * 0.06], [cx + hw + fw, y0, z0 + nz * 0.06], [cx + hw + fw, ys, z0 + nz * 0.06], [cx + hw, ys, z0 + nz * 0.06], cFrame, M_ST, [0, 0, nz]);
  b.quad([cx - hw - fw, ys - 0.24, z0 + nz * 0.06], [cx + hw + fw, ys - 0.24, z0 + nz * 0.06], [cx + hw + fw, ys, z0 + nz * 0.06], [cx - hw - fw, ys, z0 + nz * 0.06], cFrame, M_ST, [0, 0, nz]);
  for (let i = 0; i < NA; i++) {
    const a0 = PI * (i / NA), a1 = PI * ((i + 1) / NA);
    const r0 = hw, r1 = hw + fw;
    const p0 = [cx + Math.cos(a0) * r0, ys + Math.sin(a0) * arcH * 0.9];
    const p1 = [cx + Math.cos(a1) * r0, ys + Math.sin(a1) * arcH * 0.9];
    const q0 = [cx + Math.cos(a0) * r1, ys + Math.sin(a0) * (arcH + fw)];
    const q1 = [cx + Math.cos(a1) * r1, ys + Math.sin(a1) * (arcH + fw)];
    b.quad([p0[0], p0[1], z0 + nz * 0.06], [p1[0], p1[1], z0 + nz * 0.06], [q1[0], q1[1], z0 + nz * 0.06], [q0[0], q0[1], z0 + nz * 0.06], cFrame, M_ST, [0, 0, nz]);
  }
}

// axis-aligned rectangle minus an axis-aligned hole -> list of [x0,x1,z0,z1]
function rectMinus(x0, z0, x1, z1, h) {
  const [hx0, hx1, hz0, hz1] = h;
  if (x1 <= hx0 || x0 >= hx1 || z1 <= hz0 || z0 >= hz1) return [[x0, x1, z0, z1]];
  const out = [];
  if (x0 < hx0) out.push([x0, Math.min(x1, hx0), z0, z1]);
  if (x1 > hx1) out.push([Math.max(x0, hx1), x1, z0, z1]);
  const xa = Math.max(x0, hx0), xb = Math.min(x1, hx1);
  if (xa < xb - 1e-9) {
    if (z0 < hz0) out.push([xa, xb, z0, Math.min(z1, hz0)]);
    if (z1 > hz1) out.push([xa, xb, Math.max(z0, hz1), z1]);
  }
  return out;
}

// stone balustrade run: mode 1 = along X at z = zc, mode 2 = along Z at x = xc
function railRun(b, x0, z0, x1, z1, y, mode, rnd) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const yaw = Math.atan2(x1 - x0, z1 - z0);
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  putR(b, cx, y, cz, yaw, () => {
    // plinth + top rail + bottom rail
    box(b, 0.46, 0.3, len, STL, M_ST, { topCol: MB });
    put(b, 0, 1.1, 0, () => box(b, 0.42, 0.19, len, MB, M_MB, { topCol: mulc(MB, 1.03) }));
    put(b, 0, 0.3, 0, () => box(b, 0.36, 0.1, len, mulc(STL, 0.9), M_ST));
    const n = Math.max(2, Math.round(len / 1.85));
    for (let i = 1; i < n; i++) {
      const zz = -len / 2 + (len * i) / n;
      put(b, 0, 0.75, zz, () => {
        box(b, 0.15, 0.62, 0.15, mulc(MB, 0.98), M_MB);
        put(b, 0, 0.34, 0, () => box(b, 0.2, 0.08, 0.2, GD, M_GD));
      });
    }
    // gilt line under the handrail
    put(b, 0, 0.97, 0, () => box(b, 0.44, 0.05, len * 0.985, GD, M_GD));
  });
}

// stone urn on a square foot; h ~ 1.0 m
function urn(b, s, col, mat, colG, matG) {
  lathe(b, [[0.30 * s, 0.0], [0.34 * s, 0.07 * s], [0.2 * s, 0.13 * s], [0.17 * s, 0.26 * s],
    [0.34 * s, 0.42 * s], [0.5 * s, 0.62 * s], [0.52 * s, 0.72 * s], [0.44 * s, 0.8 * s],
    [0.3 * s, 0.87 * s], [0.33 * s, 0.93 * s], [0.12 * s, 0.99 * s]], 12, col, mat);
  put(b, 0, 1.0 * s, 0, () => sphere(b, 0.16 * s, colG, matG, { rings: 3, seg: 8, jitter: 0.04, seed: 3 }));
  for (const sx of [-1, 1]) {
    put(b, sx * 0.46 * s, 0.68 * s, 0, () => { b.push(m4.rotZ(sx * 0.5 * 0)); torus(b, 0.14 * s, 0.035 * s, 8, 3, colG, matG, 'z'); b.pop(); });
  }
}

// lamp pedestal: octagonal die + gilt cage + glass lantern (geometry only)
function lampPedestal(b, s) {
  lathe(b, [[0.55 * s, 0], [0.55 * s, 0.16], [0.42 * s, 0.3], [0.4 * s, 1.0], [0.48 * s, 1.12], [0.44 * s, 1.2]], 8, STL, M_ST);
  put(b, 0, 1.2, 0, () => {
    cylinder(b, 8, 0.3, 0.26, 0.5, GD, M_GD, { y0: 0 });
    put(b, 0, 0.6, 0, () => {
      cylinder(b, 8, 0.24, 0.24, 0.62, GLI, M_GL, { y0: 0 });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        putR(b, Math.sin(a) * 0.25, 0, Math.cos(a) * 0.25, a, () => box(b, 0.05, 0.62, 0.05, BRD, M_BR));
      }
    });
    put(b, 0, 1.22, 0, () => lathe(b, [[0.34, 0], [0.3, 0.12], [0.12, 0.2], [0.03, 0.34]], 8, GD, M_GD));
  });
}

// grand stair, projecting north from the platform edge (terrace y=7 -> ground y=0)
function buildGrandStair(b) {
  const HW = STAIR_HW;            // 7
  const yTop = PY1;               // 7
  const risers = 10, rise = 3.5 / risers;
  const zA = PZ;                  // top step nose at the platform edge
  const runA = 0.42, runB = 0.44;
  const zLand = zA + risers * runA;              // 24.2
  const zLand2 = zLand + 1.3;                    // 25.5
  const zBot = zLand2 + risers * runB;           // 29.9
  // flight A (from the terrace down to the half landing)
  for (let i = 0; i < risers; i++) {
    const yt = yTop - (i + 1) * rise;
    const z0 = zA + i * runA, z1 = z0 + runA;
    b.quad([-HW, yt, z0], [HW, yt, z0], [HW, yt, z1], [-HW, yt, z1], i % 2 ? MB : MBD, M_MB, [0, 1, 0]);
    b.quad([-HW, yt, z0], [HW, yt, z0], [HW, yt + rise, z0], [-HW, yt + rise, z0], mulc(STD, 0.92), M_ST, [0, 0, -1]);
    b.quad([-HW, yt, z1 - 0.05], [HW, yt, z1 - 0.05], [HW, yt + 0.03, z1 - 0.05], [-HW, yt + 0.03, z1 - 0.05], GD, M_GD, [0, 1, 0]);
  }
  // half landing
  b.quad([-HW, yTop - 3.5, zLand], [HW, yTop - 3.5, zLand], [HW, yTop - 3.5, zLand2], [-HW, yTop - 3.5, zLand2], MB, M_MB, [0, 1, 0]);
  b.quad([-HW, yTop - 3.5, zLand], [HW, yTop - 3.5, zLand], [HW, yTop - 3.5 + rise, zLand], [-HW, yTop - 3.5 + rise, zLand], mulc(STD, 0.92), M_ST, [0, 0, -1]);
  // flight B
  for (let i = 0; i < risers; i++) {
    const yt = yTop - 3.5 - (i + 1) * rise;
    const z0 = zLand2 + i * runB, z1 = z0 + runB;
    b.quad([-HW, yt, z0], [HW, yt, z0], [HW, yt, z1], [-HW, yt, z1], i % 2 ? MBD : MB, M_MB, [0, 1, 0]);
    b.quad([-HW, yt, z0], [HW, yt, z0], [HW, yt + rise, z0], [-HW, yt + rise, z0], mulc(STD, 0.92), M_ST, [0, 0, -1]);
    b.quad([-HW, yt, z1 - 0.05], [HW, yt, z1 - 0.05], [HW, yt + 0.03, z1 - 0.05], [-HW, yt + 0.03, z1 - 0.05], GD, M_GD, [0, 1, 0]);
  }
  // side cheeks / parapets (stepped stone blocks)
  for (const sx of [-1, 1]) {
    for (let i = 0; i <= risers; i++) {
      const yt = yTop - i * rise;
      const z0 = zA + (i - 1) * runA;
      if (i === 0) continue;
      const yTopP = i === 0 ? yTop : yt;
      runBox(b, sx * HW, z0, sx * (HW + 0.52), z0 + runA, 0, yTopP + 0.95, 0.52, i % 2 ? ST : STL, M_ST, MB);
    }
    // landing parapet
    runBox(b, sx * HW, zLand, sx * (HW + 0.52), zLand2, 0, yTop - 3.5 + 0.95, 0.52, ST, M_ST, MB);
    for (let i = 1; i <= risers; i++) {
      const yt = yTop - 3.5 - i * rise;
      const z0 = zLand2 + (i - 1) * runB;
      runBox(b, sx * HW, z0, sx * (HW + 0.52), z0 + runB, 0, yt + 0.95, 0.52, i % 2 ? STL : ST, M_ST, MB);
    }
    // gilt handrail following the slope
    for (let i = 0; i < risers; i++) {
      const ya = yTop - i * rise + 0.95, yb = yTop - (i + 1) * rise + 0.95;
      const z0 = zA + i * runA, z1 = z0 + runA;
      b.quad([sx * (HW + 0.1), ya, z0], [sx * (HW + 0.1), ya, z1], [sx * (HW + 0.1), yb, z1], [sx * (HW + 0.1), yb, z0], GD, M_GD, [sx, 0, 0]);
      const ya2 = yTop - 3.5 - i * rise + 0.95, yb2 = yTop - 3.5 - (i + 1) * rise + 0.95;
      const w0 = zLand2 + i * runB, w1 = w0 + runB;
      b.quad([sx * (HW + 0.1), ya2, w0], [sx * (HW + 0.1), ya2, w1], [sx * (HW + 0.1), yb2, w1], [sx * (HW + 0.1), yb2, w0], GD, M_GD, [sx, 0, 0]);
    }
    // newel post at the bottom
    put(b, sx * (HW + 0.26), 0.75, zBot - 0.2, () => {
      box(b, 0.7, 1.5, 0.7, STL, M_ST, { topCol: MB });
      put(b, 0, 0.85, 0, () => sphere(b, 0.26, GDB, M_GDB, { rings: 3, seg: 8, jitter: 0.05, seed: 9 }));
    });
  }
  // soffit / underside of the stair mass
  b.quad([-HW, 0.02, zA], [HW, 0.02, zA], [HW, 0.02, zBot], [-HW, 0.02, zBot], mulc(STD, 0.8), M_ST, [0, 1, 0]);
}

// ================================================================== angles / cuts
function wrapPi(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }
const PORTAL_CUT = [[-PHA, PHA]];
const TURRET_CUT = [[PI - TRH, PI + TRH]];
function angParts(a0, a1, cuts) {
  let parts = [[a0, a1]];
  for (let ci = 0; ci < cuts.length; ci++) {
    const c0 = cuts[ci][0], c1 = cuts[ci][1];
    const out = [];
    for (const p of parts) {
      const s = p[0], e = p[1];
      if (e <= c0 + 1e-9 || s >= c1 - 1e-9) { out.push([s, e]); continue; }
      if (s < c0) out.push([s, c0]);
      if (e > c1) out.push([c1, e]);
    }
    parts = out;
  }
  return parts.filter((p) => p[1] - p[0] > 2e-3);
}

// ================================================================== ENTRANCE STOREY (y 7..19)
function archPane(b, r, mid, hwA, yS, yA, yTop, col, mat, nz, seg) {
  const N = [nz * Math.sin(mid), 0, nz * Math.cos(mid)];
  const P = (a, y) => Pt(r, mid + a, y);
  b.quad(P(-hwA, yS), P(hwA, yS), P(hwA, yA), P(-hwA, yA), col, mat, N);
  for (let i = 0; i < seg; i++) {
    const t0 = PI * (i / seg), t1 = PI * ((i + 1) / seg);
    b.tri(P(0, yA), P(Math.cos(t0) * hwA, yA + Math.sin(t0) * (yTop - yA)),
      P(Math.cos(t1) * hwA, yA + Math.sin(t1) * (yTop - yA)), col, mat, N, N, N);
  }
}
function archFrame(b, r, mid, hwA, fwA, yS, yA, yTop, col, mat, nz) {
  const N = [nz * Math.sin(mid), 0, nz * Math.cos(mid)];
  const P = (a, y) => Pt(r, mid + a, y);
  b.quad(P(-hwA - fwA, yS - 0.1), P(-hwA, yS - 0.1), P(-hwA, yTop + 0.1), P(-hwA - fwA, yTop + 0.1), col, mat, N);
  b.quad(P(hwA, yS - 0.1), P(hwA + fwA, yS - 0.1), P(hwA + fwA, yTop + 0.1), P(hwA, yTop + 0.1), col, mat, N);
  b.quad(P(-hwA - fwA, yS - 0.12), P(hwA + fwA, yS - 0.12), P(hwA + fwA, yS + 0.06), P(-hwA - fwA, yS + 0.06), col, mat, N);
  for (let i = 0; i < 6; i++) {
    const t0 = PI * (i / 6), t1 = PI * ((i + 1) / 6);
    const r0 = hwA, r1 = hwA + fwA;
    const p0 = [Math.cos(t0) * r0, yA + Math.sin(t0) * (yTop - yA)];
    const p1 = [Math.cos(t1) * r0, yA + Math.sin(t1) * (yTop - yA)];
    const q0 = [Math.cos(t0) * r1, yA + Math.sin(t0) * (yTop - yA + fwA * 1.4)];
    const q1 = [Math.cos(t1) * r1, yA + Math.sin(t1) * (yTop - yA + fwA * 1.4)];
    b.quad(P(p0[0], p0[1]), P(p1[0], p1[1]), P(q1[0], q1[1]), P(q0[0], q0[1]), col, mat, N);
  }
}
function buildEntrance(b, rnd) {
  const rP = 18.3;
  for (let k = 0; k < SEG; k++) {
    const a0 = -PI + k * BAY, a1 = a0 + BAY;
    const parts = angParts(a0, a1, PORTAL_CUT.concat(TURRET_CUT));
    if (!parts.length) continue;
    const full = parts.length === 1 && parts[0][0] - a0 < 1e-6 && a1 - parts[0][1] < 1e-6;
    for (const p of parts) {
      const pa = p[0] + 0.014, pb = p[1] - 0.014, pm = (pa + pb) / 2;
      if (pb - pa < 4e-3) continue;
      b.quad(Pt(rP, pa, 7.45), Pt(rP, pb, 7.45), Pt(rP, pb, 18.4), Pt(rP, pa, 18.4), ST, M_ST, NR(pm));
      const tg0 = [Math.cos(pa), 0, -Math.sin(pa)], tg1 = [Math.cos(pb), 0, -Math.sin(pb)];
      b.quad(Pt(rP, pa, 7.45), Pt(ES_O, pa, 7.45), Pt(ES_O, pa, 18.4), Pt(rP, pa, 18.4), mulc(ST, 0.8), M_ST, [tg0[0], 0, tg0[2]]);
      b.quad(Pt(rP, pb, 7.45), Pt(ES_O, pb, 7.45), Pt(ES_O, pb, 18.4), Pt(rP, pb, 18.4), mulc(ST, 0.8), M_ST, [-tg1[0], 0, -tg1[2]]);
      b.quad(Pt(rP, pa, 18.4), Pt(rP, pb, 18.4), Pt(ES_O, pb, 18.4), Pt(ES_O, pa, 18.4), mulc(ST, 0.7), M_ST, [0, -1, 0]);
      b.quad(Pt(rP, pa, 7.45), Pt(rP, pb, 7.45), Pt(ES_O, pb, 7.45), Pt(ES_O, pa, 7.45), mulc(MB, 0.98), M_MB, [0, 1, 0]);
      if (!full) continue;
      const mid = (a0 + a1) / 2;
      const hwA = 1.22 / rP;
      if ((k % 2) === 0) {
        archFrame(b, rP - 0.02, mid, hwA, 0.12 / rP, 9.35, 12.5, 13.65, BRD, M_BR, 1);
        archPane(b, rP - 0.06, mid, hwA, 9.35, 12.5, 13.65, mixc(GLD, BLL, 0.3), M_GLD, 1, 5);
        b.quad(Pt(rP - 0.03, mid - 0.005, 9.45), Pt(rP - 0.03, mid + 0.005, 9.45), Pt(rP - 0.03, mid + 0.005, 13.5), Pt(rP - 0.03, mid - 0.005, 13.5), BRL, M_BR, NR(mid));
        b.quad(Pt(rP - 0.03, mid - hwA, 11.2), Pt(rP + 0.0, mid - hwA, 11.2), Pt(rP + 0.0, mid + hwA, 11.2), Pt(rP - 0.03, mid + hwA, 11.2), BRL, M_BR, NR(mid));
      } else {
        archPane(b, rP - 0.24, mid, hwA, 8.9, 12.1, 13.25, BLD, M_DARK, 1, 5);
        archFrame(b, rP - 0.02, mid, hwA, 0.16 / rP, 8.9, 12.1, 13.25, STL, M_ST, 1);
        archFrame(b, rP - 0.02, mid, hwA * 0.6, 0.1 / rP, 10.1, 12.4, 13.0, GD, M_GD, 1);
        b.quad(Pt(rP - 0.03, mid - hwA * 0.3, 10.0), Pt(rP - 0.03, mid + hwA * 0.3, 10.0),
          Pt(rP - 0.03, mid + hwA * 0.3, 10.9), Pt(rP - 0.03, mid - hwA * 0.3, 10.9), GDB, M_GDB, NR(mid));
      }
    }
  }
  // base plinth of the storey (closes the bottom of the recessed panels)
  bandF(b, ES_O - 0.34, ES_O + 0.1, 6.86, 7.46, 0, TAU, 60, STL, M_ST, { skip: (a) => Math.abs(wrapPi(a)) < PHA || Math.abs(wrapPi(a - PI)) < TRH });
  // pilasters on the bay boundaries
  for (let k = 0; k < SEG; k++) {
    const a = -PI + k * BAY;
    if (Math.abs(wrapPi(a)) < PHA + 0.02) continue;
    if (Math.abs(wrapPi(a - PI)) < TRH + 0.02) continue;
    const d = 0.26, w = 0.58, ha = w / (2 * ES_O);
    b.quad(Pt(ES_O + d, a - ha, 7.0), Pt(ES_O + d, a + ha, 7.0), Pt(ES_O + d, a + ha, 18.9), Pt(ES_O + d, a - ha, 18.9), mulc(STL, 1.02), M_ST, NR(a));
    const tg = [Math.cos(a), 0, -Math.sin(a)];
    b.quad(Pt(ES_O, a - ha, 7.0), Pt(ES_O + d, a - ha, 7.0), Pt(ES_O + d, a - ha, 18.9), Pt(ES_O, a - ha, 18.9), mulc(ST, 0.84), M_ST, [-tg[0], 0, -tg[2]]);
    b.quad(Pt(ES_O, a + ha, 7.0), Pt(ES_O + d, a + ha, 7.0), Pt(ES_O + d, a + ha, 18.9), Pt(ES_O, a + ha, 18.9), mulc(ST, 0.9), M_ST, tg);
    put(b, ES_O * Math.sin(a), 18.95, ES_O * Math.cos(a), () => { b.push(RY(a)); box(b, 0.84, 0.34, 0.8, MB, M_MB, { topCol: mulc(MB, 1.03) }); b.pop(); });
    put(b, ES_O * Math.sin(a), 7.2, ES_O * Math.cos(a), () => { b.push(RY(a)); box(b, 0.86, 0.4, 0.82, STL, M_ST, { topCol: MB }); b.pop(); });
  }
  // frieze + cornice (cut at the portal)
  bandF(b, ES_O, ES_O + 0.16, 18.4, 19.0, 0, TAU, 60, STL, M_ST, { skip: (a) => Math.abs(wrapPi(a)) < PHA + 0.01 });
  bandF(b, ES_O - 0.1, 19.12, 19.0, 19.72, 0, TAU, 60, STL, M_ST, { skip: (a) => Math.abs(wrapPi(a)) < PHA });
  bandF(b, ES_O - 0.1, 19.82, 19.72, 20.28, 0, TAU, 60, STL, M_ST, { skip: (a) => Math.abs(wrapPi(a)) < PHA, topCol: mulc(STL, 1.06) });
  bandF(b, ES_O, 19.86, 20.28, 20.44, 0, TAU, 60, GD, M_GD, { skip: (a) => Math.abs(wrapPi(a)) < PHA, noIn: true });
  for (let k = 0; k < 28; k++) {
    const a = -PI + (k + 0.5) * (TAU / 28);
    if (Math.abs(wrapPi(a)) < PHA) continue;
    put(b, (ES_O + 0.3) * Math.sin(a), 18.56, (ES_O + 0.3) * Math.cos(a), () => {
      b.push(RY(a)); box(b, 0.32, 0.6, 0.64, mulc(STL, 0.92), M_ST); b.pop();
    });
  }
  // inner hall wall (r = R_IN), cut at the portal
  for (const p of angParts(-PI, PI, PORTAL_CUT)) {
    cylF(b, R_IN, 7.0, 19.35, p[0], p[1], 60, IV, M_STW, -1, (a) => mixc(IV, IVW, 0.35 + 0.16 * Math.sin(a * 6)));
  }
  for (let k = 0; k < SEG; k++) {
    const a0 = -PI + k * BAY, a1 = a0 + BAY, mid = (a0 + a1) / 2;
    if (Math.abs(wrapPi(mid)) < PHA + 0.03) continue;
    if (Math.abs(wrapPi(mid - PI)) < TRH + 0.03) continue;
    archPane(b, R_IN + 0.26, mid, 1.5 / R_IN, 8.0, 13.0, 14.6, mixc(IV, MBD, 0.45), M_STW, -1, 5);
    archFrame(b, R_IN + 0.02, mid, 1.5 / R_IN, 0.1 / R_IN, 8.0, 13.0, 14.6, STL, M_ST, -1);
    b.quad(Pt(R_IN + 0.01, mid - 0.05, 15.2), Pt(R_IN + 0.01, mid + 0.05, 15.2), Pt(R_IN + 0.01, mid + 0.05, 16.4), Pt(R_IN + 0.01, mid - 0.05, 16.4), GD, M_GD, [-Math.sin(mid), 0, -Math.cos(mid)]);
  }
  for (let k = 0; k < SEG; k++) {
    const a = -PI + k * BAY;
    if (Math.abs(wrapPi(a)) < PHA + 0.03) continue;
    if (Math.abs(wrapPi(a - PI)) < TRH + 0.03) continue;
    ribIn(b, R_IN, a, 0.5, 0.24, 7.0, 19.3, IVW, M_STW);
  }
  bandF(b, R_IN - 0.1, R_IN, 17.35, 18.55, 0, TAU, 60, BL, [0.07, 0.18], { noOut: true });
  bandF(b, R_IN - 0.14, R_IN, 18.55, 18.72, 0, TAU, 60, GD, M_GD, { noOut: true });
  bandF(b, R_IN - 0.14, R_IN, 17.2, 17.35, 0, TAU, 60, GD, M_GD, { noOut: true });
}
function ribIn(b, r, a, w, d, y0, y1, col, mat) {
  const ha = w / (2 * r), a0 = a - ha, a1 = a + ha;
  b.quad(Pt(r - d, a0, y0), Pt(r - d, a1, y0), Pt(r - d, a1, y1), Pt(r - d, a0, y1), col, mat, [-Math.sin(a), 0, -Math.cos(a)]);
  const tg = [Math.cos(a), 0, -Math.sin(a)];
  b.quad(Pt(r, a0, y0), Pt(r - d, a0, y0), Pt(r - d, a0, y1), Pt(r, a0, y1), mulc(col, 0.84), mat, [-tg[0], 0, -tg[2]]);
  b.quad(Pt(r, a1, y0), Pt(r - d, a1, y0), Pt(r - d, a1, y1), Pt(r, a1, y1), mulc(col, 0.9), mat, tg);
}

// ================================================================== PORTAL (+Z)
function buildPortal(b) {
  const rI = R_IN, rO = ES_O, NS = 18;
  const yArch = (a) => PORT_SPRING + (PORT_APEX - PORT_SPRING) * Math.sqrt(Math.max(0, 1 - (a / PHA) * (a / PHA)));
  for (const s of [-1, 1]) {
    const a = s * PHA, tg = [Math.cos(a), 0, -Math.sin(a)];
    b.quad(Pt(rI, a, Y0), Pt(rO, a, Y0), Pt(rO, a, PORT_SPRING), Pt(rI, a, PORT_SPRING), mulc(STL, 0.88), M_ST, [-s * tg[0], 0, -s * tg[2]]);
    b.quad(Pt(rI, a - s * 0.02, Y0), Pt(rI, a, Y0), Pt(rI, a, PORT_SPRING), Pt(rI, a - s * 0.02, PORT_SPRING), BRD, M_BR, [-Math.sin(a), 0, -Math.cos(a)]);
  }
  for (let i = 0; i < NS; i++) {
    const a0 = -PHA + 2 * PHA * (i / NS), a1 = -PHA + 2 * PHA * ((i + 1) / NS), am = (a0 + a1) / 2;
    const y0 = yArch(a0), y1 = yArch(a1);
    const dy = (yArch(am + 1e-4) - yArch(am - 1e-4)) / 2e-4;
    const nn = Math.hypot(dy * Math.cos(am), rI, dy * Math.sin(am));
    b.quad(Pt(rI, a0, y0), Pt(rI, a1, y1), Pt(rO, a1, y1), Pt(rO, a0, y0), mulc(STL, 0.9), M_ST,
      [(dy * Math.cos(am)) / nn, -rI / nn, (-dy * Math.sin(am)) / nn]);
    b.quad(Pt(rO, a0, y0), Pt(rO, a1, y1), Pt(rO, a1, CORN_Y1), Pt(rO, a0, CORN_Y1), ST, M_ST, NR(am));
    b.quad(Pt(rI, a0, y0), Pt(rI, a1, y1), Pt(rI, a1, CORN_Y1 - 0.4), Pt(rI, a0, CORN_Y1 - 0.4), IV, M_STW, [-Math.sin(am), 0, -Math.cos(am)]);
    b.quad(Pt(rO + 0.02, a0, y0 + 0.06), Pt(rO + 0.02, a1, y1 + 0.06), Pt(rO + 0.02, a1, y1 + 0.72), Pt(rO + 0.02, a0, y0 + 0.72), mulc(STL, 1.04), M_ST, NR(am));
  }
  for (let i = 0; i < 13; i++) {
    const a = -PHA * 0.9 + 1.8 * PHA * (i / 12);
    const yb = yArch(a) + 0.3, yt = Math.min(CORN_Y1 - 0.12, yb + 0.95);
    if (yt - yb < 0.1) continue;
    b.quad(Pt(rO + 0.04, a - 0.013, yb), Pt(rO + 0.04, a + 0.013, yb), Pt(rO + 0.04, a + 0.013, yt), Pt(rO + 0.04, a - 0.013, yt), GD, M_GD, NR(a));
  }
  put(b, 0, PORT_APEX + 0.34, ES_O + 0.06, () => box(b, 0.86, 1.15, 0.5, GD, M_GD, { topCol: GDB }));
  // threshold steps
  b.quad([-4.9, 6.62, 18.9], [4.9, 6.62, 18.9], [4.9, 6.62, 20.2], [-4.9, 6.62, 20.2], MB, M_MB, [0, 1, 0]);
  for (let s = 0; s < 2; s++) {
    const y = 6.62 - s * 0.3, z0 = 18.9 + s * 0.28;
    b.quad([-4.9, y, z0], [4.9, y, z0], [4.9, y, z0 + 0.3], [-4.9, y, z0 + 0.3], MB, M_MB, [0, 1, 0]);
    b.quad([-4.9, y - 0.3, z0 + 0.3], [4.9, y - 0.3, z0 + 0.3], [4.9, y, z0 + 0.3], [-4.9, y, z0 + 0.3], MBD, M_MB, [0, 0, 1]);
  }
  // open copper door leaves
  for (const s of [-1, 1]) {
    const a = s * (PHA + 0.03);
    const p = (r, y) => Pt(r, a, y);
    const r0 = 17.5, r1 = 20.0;
    const N1 = [Math.cos(a) * s, 0, -Math.sin(a) * s];
    b.quad(p(r0, 7.05), p(r1, 7.05), p(r1, 14.1), p(r0, 14.1), WD, M_WD, N1);
    b.quad(p(r0, 7.05), p(r1, 7.05), p(r1, 14.1), p(r0, 14.1), mulc(WD, 0.8), M_WD, [-N1[0], 0, -N1[2]]);
    for (let k = 0; k < 4; k++) {
      const rr = r0 + 0.34 + k * 0.62;
      b.quad(p(rr, 9.2), p(rr + 0.1, 9.2), p(rr + 0.1, 9.9), p(rr, 9.9), BRD, M_BR, N1);
    }
  }
}

// ================================================================== GALLERIES (11 decks)
function deckR(phi) {
  const c = Math.cos(phi);
  const u = -16.5 * c;                       // origin-ray . turret-centre
  const disc = u * u - (16.5 * 16.5 - 3.7 * 3.7);
  if (disc <= 0 || u <= 0) return R_IN;      // the turret is not in this direction
  const t = u - Math.sqrt(disc);             // near intersection (must be > 0)
  if (!(t > 0)) return R_IN;
  return Math.min(R_IN, t + 0.42);
}
function buildGalleries(b) {
  for (let gi = 0; gi < GALV.length; gi++) {
    const y = GALV[gi];
    const n = 48;
    for (let i = 0; i < n; i++) {
      const a0 = -PI + (TAU * i) / n, a1 = -PI + (TAU * (i + 1)) / n, mid = (a0 + a1) / 2;
      if (gi === 0 && Math.abs(wrapPi(mid - PI)) < 0.09) continue;
      const rA = Math.min(deckR(a0), deckR(a1), deckR(mid));
      const sector = rA < R_IN - 0.01;
      b.quad(Pt(GAL_R0, a0, y), Pt(GAL_R0, a1, y), Pt(rA, a1, y), Pt(rA, a0, y), (gi % 2) ? MB : mulc(MB, 0.98), M_MB, [0, 1, 0]);
      const yU = (sector && (gi === 1 || gi === 5)) ? y - 0.42 : y - GAL_T;
      b.quad(Pt(GAL_R0, a0, yU), Pt(GAL_R0, a1, yU), Pt(rA, a1, yU), Pt(rA, a0, yU), mulc(STL, 0.86), M_MBD, [0, -1, 0]);
      if (sector) b.quad(Pt(rA, a0, yU), Pt(rA, a1, yU), Pt(rA, a1, y), Pt(rA, a0, y), mulc(STL, 0.8), M_ST, NR(mid));
    }
    ringF(b, GAL_R0, GAL_R0 + 0.55, y + 0.012, 0, TAU, 60, mixc(MB, IV, 0.4), M_MB, 1,
      (a, i) => (i % 2 ? mixc(MB, MBD, 0.55) : mixc(MB, IVW, 0.3)));
    bandF(b, GAL_R0 - 0.05, GAL_R0 + 0.35, y - 1.16, y - 0.66, 0, TAU, 32, BLD, [0.07, 0.16],
      { noOut: true, noTop: true, botCol: BRD, inCol: BLD });
    bandF(b, GAL_R0 - 0.09, GAL_R0 + 0.34, y - 0.68, y - 0.60, 0, TAU, 32, GD, M_GD, { noOut: true, noTop: true, inCol: GD });
    bandF(b, GAL_R0 - 0.07, GAL_R0 + 0.33, y - 1.24, y - 1.16, 0, TAU, 32, BR, M_BR, { noOut: true, noTop: true, inCol: BR });
    const nP = 24;
    for (let i = 0; i < nP; i++) {
      const a = -PI + (TAU * i) / nP;
      put(b, GAL_R0 * Math.sin(a), y + 0.56, GAL_R0 * Math.cos(a), () => {
        b.push(RY(a)); box(b, 0.085, 1.12, 0.085, BRD, M_BR, { topCol: BRL }); b.pop();
        b.push(RY(a)); box(b, 0.15, 0.06, 0.15, GD, M_GD); b.pop();
      });
      const a2 = -PI + (TAU * (i + 1)) / nP;
      b.quad(Pt(GAL_R0 + 0.005, a + 0.006, y + 0.13), Pt(GAL_R0 + 0.005, a2 - 0.006, y + 0.13),
        Pt(GAL_R0 + 0.005, a2 - 0.006, y + 0.99), Pt(GAL_R0 + 0.005, a + 0.006, y + 0.99), GLI, M_GL, NR((a + a2) / 2));
    }
    bandF(b, GAL_R0 - 0.03, GAL_R0 + 0.075, y + 1.0, y + RAIL_H, 0, TAU, 40, BR, M_BR, { noIn: true });
    bandF(b, GAL_R0 - 0.02, GAL_R0 + 0.06, y + 0.10, y + 0.2, 0, TAU, 40, BRD, M_BR, { noIn: true });
  }
}

// ================================================================== SHAFT / CURTAIN WALL
const ROWS = [20, 26, 32, 38, 44, 50, 56, 62, 68, 74, 80, 89];
const R_GL = 17.85, R_SILL = 18.0, R_MULL = 18.18;
function glassCol(mid, y) {
  const t = 0.5 + 0.5 * Math.sin(mid * 3.1 + y * 0.11);
  return mixc(GLD, mixc(GL, BLL, 0.35), 0.25 + 0.45 * t);
}
function buildShaft(b) {
  for (let k = 0; k < SEG; k++) {
    const a0 = -PI + k * BAY, a1 = a0 + BAY;
    for (let ri = 0; ri < ROWS.length - 1; ri++) {
      const yb = ROWS[ri], yt = ROWS[ri + 1];
      const cuts = yb < 84 ? TURRET_CUT : [];
      const parts = angParts(a0, a1, cuts);
      for (const p of parts) {
        const pa = p[0] + 0.012, pb = p[1] - 0.012, pm = (pa + pb) / 2;
        if (pb - pa < 3e-3) continue;
        b.quad(Pt(R_SILL, pa, yb), Pt(R_SILL, pb, yb), Pt(R_SILL, pb, yb + 0.86), Pt(R_SILL, pa, yb + 0.86), mulc(STL, 1.01), M_ST, NR(pm));
        b.quad(Pt(R_GL - 0.06, pa, yb + 0.86), Pt(R_GL - 0.06, pb, yb + 0.86), Pt(R_SILL, pb, yb + 0.86), Pt(R_SILL, pa, yb + 0.86), mulc(MB, 1.0), M_MB, [0, 1, 0]);
        const yG0 = yb + 0.9, yG1 = yt - 0.07;
        b.quad(Pt(R_GL, pa, yG0), Pt(R_GL, pb, yG0), Pt(R_GL, pb, yG1), Pt(R_GL, pa, yG1), glassCol(pm, yG0), M_GL, NR(pm));
        b.quad(Pt(R_GL, pa, yb), Pt(R_GL, pa, yt), Pt(R_SILL, pa, yt), Pt(R_SILL, pa, yb), mulc(STL, 0.9), M_ST, [Math.cos(pa), 0, -Math.sin(pa)]);
        b.quad(Pt(R_GL, pb, yb), Pt(R_GL, pb, yt), Pt(R_SILL, pb, yt), Pt(R_SILL, pb, yb), mulc(STL, 0.9), M_ST, [-Math.cos(pb), 0, Math.sin(pb)]);
      }
    }
  }
  for (let k = 0; k <= SEG; k++) {
    const a = -PI + k * BAY;
    if (Math.abs(wrapPi(a)) < PHA + 1e-3) continue;
    if (Math.abs(wrapPi(a - PI)) < TRH) continue;
    ribF(b, R_SILL, a, 0.22, 0.18, 20, 89, BR, M_BR);
  }
  for (let k = 0; k < 8; k++) {
    const a = 22.5 * PI / 180 + k * PI / 4;
    ribF(b, R_SILL, a, 0.62, 0.48, 20, 89, mulc(BRL, 1.02), M_BR);
    for (let gi = 0; gi < GALV.length; gi++) {
      const y = GALV[gi];
      b.quad(Pt(R_OUT + 0.1, a - 0.03, y - 0.28), Pt(R_OUT + 0.1, a + 0.03, y - 0.28), Pt(R_OUT + 0.1, a + 0.03, y + 0.22), Pt(R_OUT + 0.1, a - 0.03, y + 0.22), GD, M_GD, NR(a));
    }
  }
  for (let ri = 0; ri < ROWS.length - 1; ri++) {
    const yb = ROWS[ri], yt = ROWS[ri + 1];
    for (const yy of [yb + 0.82, yt]) {
      bandF(b, R_SILL - 0.02, R_MULL - 0.02, yy - 0.09, yy + 0.13, 0, TAU, 24, BR, M_BR,
        { skip: (a) => Math.abs(wrapPi(a - PI)) < TRH, noTop: yy !== yt });
    }
  }
  for (let gi = 1; gi < GALV.length; gi++) {
    const y = GALV[gi];
    bandF(b, R_OUT - 0.15, R_OUT + 0.8, y - 0.2, y + 0.42, 0, TAU, 28, STL, M_ST,
      { skip: (a) => Math.abs(wrapPi(a - PI)) < TRH, topCol: GD });
    bandF(b, R_OUT - 0.12, R_OUT + 0.84, y + 0.42, y + 0.52, 0, TAU, 28, GDB, M_GDB,
      { skip: (a) => Math.abs(wrapPi(a - PI)) < TRH, noIn: true });
  }
  for (let ri = 0; ri < ROWS.length - 1; ri++) {
    const yb = ROWS[ri], yt = ROWS[ri + 1];
    cylF(b, R_IN - 0.02, yb, yt, 0, TAU, 36, mixc(GLI, IVW, 0.35), M_GL, -1,
      (a) => mixc(mixc(GLD, IVW, 0.5), BLL, 0.2 + 0.2 * Math.sin(a * 4)));
  }
  for (let gi = 0; gi < GALV.length; gi++) {
    const y = GALV[gi];
    bandF(b, R_IN - 0.1, R_IN, y - 0.9, y - 0.12, 0, TAU, 36, BL, [0.075, 0.18], { noOut: true, noTop: true, noBot: true, inCol: BL });
    bandF(b, R_IN - 0.12, R_IN, y - 0.12, y - 0.02, 0, TAU, 36, GD, M_GD, { noOut: true, noBot: true });
  }
  for (let k = 0; k <= SEG; k++) {
    const a = -PI + k * BAY;
    if (Math.abs(wrapPi(a)) < PHA + 1e-3) continue;
    if (Math.abs(wrapPi(a - PI)) < TRH) continue;
    ribIn(b, R_IN, a, 0.2, 0.14, 20, 89, BR, M_BR);
  }
  bandF(b, R_IN, R_OUT + 0.35, 88.55, 89.0, 0, TAU, 48, STL, M_ST, { topCol: mulc(MB, 1.02) });
  bandF(b, R_IN, R_OUT + 0.4, 89.0, 89.16, 0, TAU, 48, GD, M_GD, { noIn: true });
}

// ================================================================== PAVILION (云井亭)
function buildPavilion(b) {
  ringF(b, WELL_R + 0.62, 4.05, PY1 + 0.02, 0, TAU, 40, BLD, [0.06, 0.2], 1, (a, i) => (i % 2 ? BLD : mulc(BLD, 1.25)));
  ringF(b, 4.05, 4.2, PY1 + 0.026, 0, TAU, 40, GD, M_GD, 1);
  ringF(b, 4.2, 5.05, PY1 + 0.02, 0, TAU, 40, MB, M_MB, 1, (a, i) => (i % 2 ? MB : MBD));
  ringF(b, 5.05, 5.2, PY1 + 0.026, 0, TAU, 40, GD, M_GD, 1);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU;
    b.quad(Pt(4.22, a - 0.012, PY1 + 0.032), Pt(4.22, a + 0.012, PY1 + 0.032), Pt(5.02, a + 0.02, PY1 + 0.032), Pt(5.02, a - 0.02, PY1 + 0.032), GD, M_GD, [0, 1, 0]);
  }
  for (let k = 0; k < PAV_N; k++) {
    const a = (15 + 30 * k) * PI / 180;
    put(b, PAV_R * Math.sin(a), PY1, PAV_R * Math.cos(a), () => {
      box(b, 0.94, 0.34, 0.94, STL, M_ST, { topCol: MB });
      put(b, 0, 0.34, 0, () => cylinder(b, 14, 0.31, 0.25, 0.34, BR, M_BR, { y0: 0, caps: false }));
      put(b, 0, 0.68, 0, () => cylinder(b, 14, 0.235, 0.195, PAV_COL_H - 1.5, mulc(BRL, 1.02), M_BR, { y0: 0, caps: false }));
      put(b, 0, PAV_COL_H - 0.82, 0, () => cylinder(b, 14, 0.2, 0.33, 0.5, BR, M_BR, { y0: 0, caps: false }));
      put(b, 0, PAV_COL_H - 0.44, 0, () => bandF(b, 0.02, 0.33, 0, 0.14, 0, TAU, 14, GD, M_GD, { noIn: true }));
      for (let fi = 0; fi < 8; fi++) {
        const fa = (fi / 8) * TAU;
        put(b, Math.sin(fa) * 0.225, 0.7, Math.cos(fa) * 0.225, () => {
          b.push(RY(fa)); box(b, 0.05, PAV_COL_H - 1.62, 0.05, mulc(BRL, 0.9), M_BR); b.pop();
        });
      }
    });
  }
  bandF(b, PAV_R - 0.5, PAV_R + 0.34, PAV_ROOF_Y - 0.62, PAV_ROOF_Y, 0, TAU, 48, BR, M_BR, { topCol: mulc(BRL, 1.02) });
  bandF(b, PAV_R - 0.52, PAV_R + 0.36, PAV_ROOF_Y - 0.72, PAV_ROOF_Y - 0.62, 0, TAU, 48, GD, M_GD, { noIn: true, noTop: true });
  const rOc = PAV_OC, rOut = 5.97;
  ringF(b, rOc, rOut, PAV_TOP, 0, TAU, 48, GLI, M_GL, 1, (a, i) => mixc(GLI, GL, 0.2 + 0.2 * Math.sin(a * 3)));
  ringF(b, rOc, rOut, PAV_ROOF_Y, 0, TAU, 48, mixc(GLI, IVW, 0.4), M_GLD, -1);
  cylF(b, rOut, PAV_ROOF_Y, PAV_TOP, 0, TAU, 48, BR, M_BR, 1);
  cylF(b, rOc, PAV_ROOF_Y, PAV_TOP, 0, TAU, 48, GD, M_GD, -1);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU;
    b.quad(Pt(rOc, a - 0.026, PAV_TOP + 0.02), Pt(rOc, a + 0.026, PAV_TOP + 0.02), Pt(rOut, a + 0.026, PAV_TOP + 0.02), Pt(rOut, a - 0.026, PAV_TOP + 0.02), BR, M_BR, [0, 1, 0]);
    b.quad(Pt(rOc, a - 0.02, PAV_ROOF_Y - 0.02), Pt(rOc, a + 0.02, PAV_ROOF_Y - 0.02), Pt(rOut, a + 0.02, PAV_ROOF_Y - 0.02), Pt(rOut, a - 0.02, PAV_ROOF_Y - 0.02), BRD, M_BR, [0, -1, 0]);
  }
  bandF(b, rOc - 0.1, rOc + 0.12, PAV_ROOF_Y - 0.12, PAV_TOP + 0.04, 0, TAU, 24, GD, M_GD, {});
  bandF(b, rOut - 0.16, rOut, PAV_ROOF_Y - 0.12, PAV_TOP + 0.04, 0, TAU, 48, GD, M_GD, {});
}

// ================================================================== STAIR TURRET (mass; pass 2 adds the spiral)
function buildTurret(b) {
  put(b, TC[0], 0, TC[1], () => {
    cylF(b, TR, 6.2, TR_Y1, 0, TAU, 36, mulc(STL, 0.98), M_ST, 1);
    cylF(b, TRI, 7.0, TR_Y1, 0, TAU, 24, mulc(IV, 0.96), M_STW, -1);
    for (let y = 9; y < TR_Y1 - 1; y += 4.0) {
      bandF(b, TR - 0.06, TR + 0.1, y, y + 0.26, 0, TAU, 36, BR, M_BR, { noIn: true });
    }
    for (let k = 0; k < 12; k++) {
      const a = -PI + k * (TAU / 12);
      ribF(b, TR, a, 0.26, 0.14, 6.4, TR_Y1 - 0.2, BR, M_BR);
    }
    bandF(b, TR - 0.2, 3.86, TR_Y1 - 0.5, TR_Y1 + 0.1, 0, TAU, 24, GD, M_GD, { noIn: true });
    lathe(b, [[3.84, TR_Y1 + 0.1], [3.5, TR_Y1 + 1.5], [2.55, 86.4], [1.6, 87.6], [0.62, 88.3], [0.14, TR_CAP]],
      18, CU, [0.045, 0.32]);
    put(b, 0, TR_CAP, 0, () => {
      cylinder(b, 8, 0.16, 0.1, 1.9, GD, M_GD, { y0: 0, caps: false });
      put(b, 0, 0.9, 0, () => sphere(b, 0.2, GDB, M_GDB, { rings: 3, seg: 8, jitter: 0.03, seed: 5 }));
      put(b, 0, 1.7, 0, () => sphere(b, 0.1, BRD, M_BR, { rings: 2, seg: 6, jitter: 0.02, seed: 2 }));
      b.push(RY(0.6)); box(b, 0.9, 0.05, 0.05, GD, M_GD); b.push(RY(PI / 2)); box(b, 0.5, 0.05, 0.05, GDD, M_GD); b.pop(); b.pop();
    });
  });
}

// ================================================================== CROWN (y 89..104)
function buildCrown(b) {
  bandF(b, R_OUT - 0.2, 19.05, 89.0, 89.62, 0, TAU, 48, STL, M_ST, { topCol: MB });
  cylF(b, 19.0, 89.62, 91.5, 0, TAU, 48, mulc(STL, 0.99), M_ST, 1);
  for (let k = 0; k < 24; k++) {
    const a = -PI + (k + 0.5) * (TAU / 24);
    ribF(b, 19.0, a, 0.34, 0.13, 89.6, 91.5, mulc(STL, 0.9), M_ST);
  }
  for (let k = 0; k < 12; k++) {
    const a = -PI + k * (TAU / 12) + 0.13;
    archPane(b, 19.0, a, 1.15 / 19.0, 89.9, 91.0, 91.35, BLD, M_DARK, 1, 4);
  }
  bandF(b, R_OUT - 0.2, 19.28, 91.5, 92.16, 0, TAU, 48, STL, M_ST, { topCol: mulc(MB, 1.02) });
  bandF(b, R_OUT - 0.1, 19.32, 92.16, 92.44, 0, TAU, 48, GD, M_GD, { noIn: true });
  ringF(b, CR_OC, 17.0, Y_ROOF, 0, TAU, 48, MB, M_MB, 1, (a, i) => (i % 2 ? MB : MBD));
  ringF(b, CR_OC, 17.0, Y_ROOF - 0.42, 0, TAU, 48, mulc(STL, 0.85), M_MBD, -1);
  bandF(b, CR_OC, 2.82, Y_ROOF - 0.42, Y_ROOF + 0.14, 0, TAU, 24, GD, M_GD, {});
  bandF(b, 16.6, 17.0, Y_ROOF - 0.42, Y_ROOF + 0.14, 0, TAU, 48, GD, M_GD, { noIn: true });
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU;
    b.quad(Pt(CR_OC + 0.1, a - 0.012, Y_ROOF + 0.16), Pt(CR_OC + 0.1, a + 0.012, Y_ROOF + 0.16),
      Pt(16.6, a + 0.02, Y_ROOF + 0.16), Pt(16.6, a - 0.02, Y_ROOF + 0.16), GDD, M_GD, [0, 1, 0]);
  }
  const COLH = 98.4 - Y_ROOF;
  for (let k = 0; k < 16; k++) {
    const a = -PI + (k + 0.5) * (TAU / 16);
    put(b, CR_R * Math.sin(a), Y_ROOF + 0.1, CR_R * Math.cos(a), () => {
      box(b, 0.62, 0.24, 0.62, GD, M_GD, { topCol: GDB });
      put(b, 0, 0.24, 0, () => cylinder(b, 10, 0.21, 0.165, COLH - 0.5, BR, M_BR, { y0: 0, caps: false }));
      put(b, 0, COLH - 0.26, 0, () => cylinder(b, 10, 0.18, 0.34, 0.34, BR, M_BR, { y0: 0, caps: false }));
      put(b, 0, COLH - 0.28, 0, () => bandF(b, 0.02, 0.38, 0, 0.1, 0, TAU, 10, GDB, M_GDB, { noIn: true }));
    });
  }
  bandF(b, CR_R - 0.62, CR_R + 0.42, Y_ROOF + COLH - 0.16, Y_ROOF + COLH, 0, TAU, 48, BR, M_BR, { topCol: GDB });
  bandF(b, CR_R - 0.5, CR_R + 0.3, Y_ROOF + COLH, Y_ROOF + COLH + 0.18, 0, TAU, 48, GD, M_GD, { noIn: true });
  bandF(b, CR_R - 0.06, CR_R + 0.06, Y_ROOF + 0.62, Y_ROOF + 0.74, 0, TAU, 48, GD, M_GD, { noIn: true });
  bandF(b, CR_R - 0.06, CR_R + 0.06, Y_ROOF + 1.32, Y_ROOF + 1.46, 0, TAU, 48, GD, M_GD, { noIn: true });
  for (let k = 0; k < 48; k++) {
    const a = -PI + (k + 0.5) * (TAU / 48);
    put(b, CR_R * Math.sin(a), Y_ROOF + 0.98, CR_R * Math.cos(a), () => { b.push(RY(a)); box(b, 0.06, 0.62, 0.06, BRD, M_BR); b.pop(); });
  }
  const yBase = 98.4, yApex = 101.6;
  const domeY = (r) => yBase + (yApex - yBase) * Math.pow(Math.max(0, (17.0 - r) / (17.0 - CR_OC)), 0.62);
  const RINGS = [17.0, 13.2, 9.6, 6.4, 3.9, CR_OC];
  for (let ri = 0; ri < RINGS.length - 1; ri++) {
    const r0 = RINGS[ri], r1 = RINGS[ri + 1], y0 = domeY(r0), y1 = domeY(r1);
    for (let i = 0; i < 32; i++) {
      const a0 = (TAU * i) / 32, a1 = (TAU * (i + 1)) / 32, am = (a0 + a1) / 2;
      b.quad([Math.sin(a0) * r0, y0, Math.cos(a0) * r0], [Math.sin(a1) * r0, y0, Math.cos(a1) * r0],
        [Math.sin(a1) * r1, y1, Math.cos(a1) * r1], [Math.sin(a0) * r1, y1, Math.cos(a0) * r1],
        mixc(GLI, GL, 0.25 + 0.25 * Math.sin(a0 * 2 + ri)), M_GL, [Math.sin(am), 0.55, Math.cos(am)]);
    }
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      b.quad([Math.sin(a - 0.022) * r0, y0 + 0.03, Math.cos(a - 0.022) * r0], [Math.sin(a + 0.022) * r0, y0 + 0.03, Math.cos(a + 0.022) * r0],
        [Math.sin(a + 0.022) * r1, y1 + 0.03, Math.cos(a + 0.022) * r1], [Math.sin(a - 0.022) * r1, y1 + 0.03, Math.cos(a - 0.022) * r1],
        GD, M_GD, [Math.sin(a), 1.2, Math.cos(a)]);
    }
  }
  bandF(b, CR_OC, CR_OC + 0.34, yApex - 0.3, yApex + 0.16, 0, TAU, 24, GD, M_GD, {});
  bandF(b, 16.7, 17.0, yBase - 0.1, yBase + 0.2, 0, TAU, 24, GD, M_GD, { noIn: true });
  // openwork gold crown around the oculus: the sky well stays open (nothing on the axis)
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU, r0 = 2.42, r1 = 1.02, y0 = 101.7, y1 = 104.0;
    const w0 = 0.05, w1 = 0.035;
    const P = (r, aa, y) => [Math.sin(aa) * r, y, Math.cos(aa) * r];
    const N = [Math.sin(a), 1.4, Math.cos(a)];
    b.quad(P(r0, a - w0, y0), P(r0, a + w0, y0), P(r1, a + w1, y1), P(r1, a - w1, y1), GD, M_GD, N);
    b.quad(P(r0, a + w0, y0), P(r0, a - w0, y0), P(r1, a - w1, y1), P(r1, a + w1, y1), mulc(GD, 0.82), M_GD, [-N[0], -N[1], -N[2]]);
    put(b, Math.sin(a) * r1, y1, Math.cos(a) * r1, () => sphere(b, 0.1, GDB, M_GDB, { rings: 2, seg: 6, jitter: 0.02, seed: k + 4 }));
  }
  bandF(b, 1.02, 1.16, 103.5, 103.66, 0, TAU, 24, GD, M_GD, {});
  put(b, Math.sin(0.4) * 1.09, 103.62, Math.cos(0.4) * 1.09, () => {
    cylinder(b, 6, 0.055, 0.04, 0.86, GDB, M_GDB, { y0: 0, caps: false });
    put(b, 0, 0.86, 0, () => sphere(b, 0.11, GDB, M_GDB, { rings: 2, seg: 6, jitter: 0.02, seed: 13 }));
    put(b, 0, 0.62, 0, () => { b.push(RY(0.5)); box(b, 0.62, 0.035, 0.035, GD, M_GD); b.push(RY(PI / 2)); box(b, 0.34, 0.035, 0.035, GDD, M_GD); b.pop(); b.pop(); });
  });
  for (let k = 0; k < 8; k++) {
    const a = -PI + (k + 0.5) * (TAU / 8), r = 14.6;
    put(b, r * Math.sin(a), Y_ROOF + 0.1, r * Math.cos(a), () => {
      b.push(RY(a));
      box(b, 0.5, 0.36, 0.5, mulc(STL, 0.9), M_ST, { topCol: BRD });
      put(b, 0, 0.18, 0, () => {
        cylinder(b, 8, 0.055, 0.05, 2.5, BRD, M_BR, { y0: 0, caps: false });
        put(b, 0, 2.2, 0, () => lathe(b, [[0.05, 0], [0.24, 0.08], [0.28, 0.26], [0.09, 0.4]], 8, CU, [0.05, 0.3]));
        put(b, 0, 2.45, 0, () => b.quad([0.0, 0.0, 0.0], [0.7, 0.16, 0], [0.7, -0.14, 0], [0.0, -0.3, 0], CU, [0.05, 0.25], [0, 1, 0]));
      });
      b.pop();
    });
  }
}

export function buildCloudwell(b, ctx, rng) {
  const rnd = mulberry32(SEED);
  cwPush(b);
  buildTerrace(b, rnd);
  buildEntrance(b, rnd);
  buildPortal(b);
  buildShaft(b);
  buildGalleries(b);
  buildPavilion(b);
  buildTurret(b);
  buildCrown(b);
  b.pop();
}
