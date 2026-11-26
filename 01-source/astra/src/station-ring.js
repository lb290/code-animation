// ============================================================================
// station-ring.js — ASTRA · ROUND 15 · 环带外壳 / THE HABITAT BAND
// OWNER: agent "ring".  Contract: layout.js ST (size truth) + palette.js C.
//
// WHAT THIS FILE BUILDS
//   a 1200 m habitat ring around the central spine: a swept ivory shell with four
//   outer window galleries and an inner arcade (dark cavity + two cornices), twelve
//   brass-and-steel ribs dividing the circumference into twelve countable segments,
//   a genuine open docking port (a wedge of the shell is really removed: the mouth
//   and the tunnel through the band are open geometry) with a 150 m tongue platform,
//   guide towers, four claw groups and a boarding bridge, six petal solar sails on
//   radial trusses, sixteen radiator groups, eight antenna masts / beacons and the
//   service greebles (panel seams, hatches, tanks, pipe runs) on the roof decks,
//   the waist band and around the dock.
//
// ART DIRECTION: not a generic sci-fi grey box — "Beaux-Arts in space": ivory hull,
//   brass string courses, tall window galleries, warm gold portholes + cyan light
//   bands, big readable silhouette (eleven ribs + six sails) and close-range detail
//   (panel joints, rivet bands, pipe bundles, lamps).
//
// FRAME: world origin = station centre, ring axis = +Y, ring plane = XZ.
//   Ring angle a (radians): position = (cos a * r, y, sin a * r).
//   a = 0 -> +X;  the dock sits at ST.dockAngle = -90 deg -> -Z.
// DETERMINISM: own mulberry32(0x57A11001); the shared rng is never touched.
// ============================================================================
import { mulberry32, TAU, clamp, lerp, m4 } from './engine.js';
import {
  box, cylinder, lathe, sphere, disc, bar3, railing, tubePath,
  mulc, mixc, rgb,
} from './engine.js';
import { ST } from './layout.js';
import { C } from './palette.js';

const SEED = 0x57A11001;
const PI = Math.PI;
const D2R = PI / 180;

// ---------------------------------------------------------------- contract dims
const RING_R = ST.ringR;              // 600
const HALF_W = ST.ringW / 2;          // 46
const HALF_H = ST.ringH / 2;          // 37
const R_OUT = RING_R + HALF_W;        // 646  outer shell
const R_IN = RING_R - HALF_W;         // 554  inner shell
const SEG = ST.ringSeg;               // 96 sectors
const SECT = TAU / SEG;               // 3.75 deg
const SUB = 2;                        // angular sub-samples per sector (192 quads / turn)
const I_EAVE = R_IN - 4;              // 550  inner eave tips (the ring reads as two cornices)
const O_REC = R_OUT - 2.6;            // 643.4 window recess back
const O_CORN = R_OUT + 3.4;           // 649.4 outer cornice lip
const O_STR = R_OUT + 2.6;            // 648.6 string course
const O_WAIST = R_OUT + 2.9;          // 648.9 waist (service) band
const I_CAV = R_IN + 6.5;             // 560.5 inner arcade back wall
const RIB_N = 12;                     // 12 ribs every 30 deg
const RIB_HALF_DEG = 0.42;            // rib angular half width (about 9.5 m at the crest)
const RIB_D = 3.0;                    // rib protrusion
const WALKWAY_HALF = 2.2;             // inner arcade walkway half height

// dock: a real wedge is cut out of the shell at ST.dockAngle.  The cut is a
// radial wedge whose outer mouth is PORT_HW wide, and the tunnel runs all the way
// through the 92 m band, so the port opens onto the hub side too (fly-through).
const DOCK_A = (((ST.dockAngle * D2R) % TAU) + TAU) % TAU;   // 270 deg
const PORT_HW = 35.2;                 // outer mouth half width (70.4 m wide)
const PORT_HH = 26;                   // half height (52 m high)
const DOCK_HA = Math.asin(PORT_HW / R_OUT);   // 3.127 deg half angle
const A0 = DOCK_A - DOCK_HA;          // -Z side, negative-X jamb
const A1 = DOCK_A + DOCK_HA;          // +X jamb
const TONGUE_Z1 = -(R_OUT + ST.dockR);        // -796 150 m tongue
const DOCK_Z = -(R_OUT);              // -646 mouth plane

// ---------------------------------------------------------------- local colours
// Palette colours are used wherever they exist; only stations-specific tints are
// defined here (never edit src/palette.js — the lead owns it).
const CL = {
  hull: C.ivory,
  hull2: C.ivoryShade,
  hull3: C.ivoryDark,
  cornice: mulc(C.ivory, 1.06),
  seam: C.panelDark,                  // panel / window reveal shadow
  recess: C.panelDark,                // window recess back wall
  cavity: mixc(C.panelDeep, C.amber, 0.16),  // inner arcade recess: warm dark, never black
  hullIn: mixc(C.ivory, C.warmGlow, 0.20),    // inner hull: catches the atrium light
  hullIn2: mixc(C.ivoryShade, C.warmGlow, 0.14),
  seal: mixc(C.steelDark, C.warmGlow, 0.08),
  deck: mixc(C.ivoryDark, C.panel, 0.55),
  waist: mixc(C.ivoryShade, C.panel, 0.35),
  bottom: mulc(C.panelDark, 0.9),
  brass: C.brass,
  brassHi: C.brassHi,
  brassDark: C.brassDark,
  steel: C.steel,
  steelD: C.panelDeep,
  sail: rgb('#0d1738'),               // sail panel: near-black deep blue (local, new)
  sailCell: rgb('#1b2a63'),           // photovoltaic cell highlight (local)
  sailEdge: rgb('#34447a'),           // sail frame blue-grey (local)
  grid: C.cyan,                       // sail grid lines + light bands react with bloom
  warm: C.warmGlow,
  warn: rgb('#ff5a4a'),               // beacon / hazard red (local)
  hatch: rgb('#7b8294'),              // hatch plate grey (local)
  tank: rgb('#c9cdd6'),               // cryo tank white-grey (local)
  pipe: rgb('#97a0b2'),               // pipework grey (local)
};
const M = {
  hull: [0.02, 0.34],       // space baseline: hull
  hullHi: [0.025, 0.46],
  panel: [0.02, 0.20],
  dark: [0.02, 0.16],
  seal: [0.02, 0.12],
  brass: [0.06, 0.86],
  brassD: [0.05, 0.60],
  glass: [0.16, 0.95],
  winWarm: [0.85, 0.10],    // lit warm porthole
  winCyan: [0.85, 0.10],    // lit cyan porthole (same emissive, cold colour)
  winOff: [0.10, 0.14],     // dark / shuttered porthole
  hullIn: [0.075, 0.30],    // inner hull: dim atrium bounce so the rim never reads black
  hullIn2: [0.06, 0.24],    // inner cornice soffits
  seal: [0.045, 0.13],      // arcade floor / ceiling
  cavity: [0.055, 0.12],    // arcade back wall (warm dim glow)
  band: [0.95, 0.05],       // cyan light band
  beacon: [0.95, 0.08],
  warn: [0.90, 0.05],
  sail: [0.02, 0.28],
};

// ---------------------------------------------------------------- small maths
const P = (a, r, y) => [Math.cos(a) * r, y, Math.sin(a) * r];
const RAD = (a) => [Math.cos(a), 0, Math.sin(a)];
const TG = (a) => [-Math.sin(a), 0, Math.cos(a)];
const angDist = (a, b) => {
  let d = Math.abs((a - b) % TAU);
  return d > PI ? TAU - d : d;
};
const T = (x, y, z) => m4.translate([x, y, z]);
const RY = (a) => m4.rotY(a);
const RX = (a) => m4.rotX(a);
// local frame on the ring at angle a, radius r, height y:
//   local +X = radial outward, local +Y = up, local +Z = increasing angle.
function frameAt(b, a, r, y, fn) {
  b.push(m4.mul(T(Math.cos(a) * r, y, Math.sin(a) * r), RY(-a)));
  fn();
  b.pop();
}
// near a rib?  greebles keep clear of the twelve structural hoops.
function nearRib(a, padDeg) {
  const pad = (padDeg === undefined ? 0.75 : padDeg) * D2R;
  for (let k = 0; k < RIB_N; k++) if (angDist(a, k * 30 * D2R) < pad) return true;
  return false;
}
// one quad of a surface of revolution; (nr,ny) = unit normal in the (r,y) profile.
function surf(b, a0, a1, r0, y0, r1, y1, col, mat, nr, ny) {
  const p00 = P(a0, r0, y0), p10 = P(a1, r0, y0), p11 = P(a1, r1, y1), p01 = P(a0, r1, y1);
  if (nr === 0) {
    const N = [0, ny, 0];
    b.quad(p00, p10, p11, p01, col, mat, N);
    return;
  }
  const n00 = [Math.cos(a0) * nr, ny, Math.sin(a0) * nr];
  const n10 = [Math.cos(a1) * nr, ny, Math.sin(a1) * nr];
  b.tri(p00, p10, p11, col, mat, n00, n10, n10);
  b.tri(p00, p11, p01, col, mat, n00, n10, n00);
}
// raised quad strip on a revolve face (panel joints, brass lines)
function ringStrip(b, a0, a1, r, y0, y1, col, mat, nr, ny) {
  surf(b, a0, a1, r, y0, r, y1, col, mat, nr, ny);
}

// ============================================================================
// 1. THE SHELL PROFILE
//    A closed loop in (r,y): outer face (top->bottom, four window galleries and
//    brass string courses) -> bottom annulus -> inner arcade (dark cavity with two
//    cornices) -> top deck annulus.  Every face carries its own unit normal so the
//    corners stay crisp (no averaged normals).
// ============================================================================
function shellFaces() {
  const F = [];
  const fc = (r0, y0, r1, y1, nr, ny, col, mat, opt) => {
    F.push({ r0, y0, r1, y1, nr, ny, col, mat, vary: !!(opt && opt.vary) });
  };
  const O = R_OUT;
  // ---- outer face, top -> bottom
  fc(O, HALF_H, O, 35.8, 1, 0, CL.hull, M.hull, { vary: 1 });            // attic face
  fc(O, 35.8, O_CORN, 35.8, 0, 1, CL.cornice, M.hullHi);                 // cornice top
  fc(O_CORN, 35.8, O_CORN, 34.6, 1, 0, CL.cornice, M.hullHi);            // cornice fascia
  fc(O_CORN, 34.6, O, 34.2, 0, -1, CL.seam, M.panel);                    // cornice soffit
  fc(O, 34.2, O, 32.4, 1, 0, CL.hull, M.hull, { vary: 1 });              // frieze
  // gallery 1: 32.4 .. 21.0
  fc(O, 32.4, O_REC, 32.4, 0, -1, CL.seam, M.panel);
  fc(O_REC, 32.4, O_REC, 21.0, 1, 0, CL.recess, M.panel);
  fc(O_REC, 21.0, O, 21.0, 0, 1, CL.seam, M.panel);
  fc(O, 21.0, O, 20.4, 1, 0, CL.hull, M.hull, { vary: 1 });
  // brass string course 1
  fc(O, 20.4, O_STR, 20.4, 0, 1, CL.brassHi, M.brass);
  fc(O_STR, 20.4, O_STR, 19.4, 1, 0, CL.brass, M.brass);
  fc(O_STR, 19.4, O, 19.4, 0, -1, CL.brassDark, M.brassD);
  fc(O, 19.4, O, 18.8, 1, 0, CL.hull, M.hull, { vary: 1 });
  // gallery 2: 18.8 .. 7.6
  fc(O, 18.8, O_REC, 18.8, 0, -1, CL.seam, M.panel);
  fc(O_REC, 18.8, O_REC, 7.6, 1, 0, CL.recess, M.panel);
  fc(O_REC, 7.6, O, 7.6, 0, 1, CL.seam, M.panel);
  fc(O, 7.6, O, 7.0, 1, 0, CL.hull, M.hull, { vary: 1 });
  // the waist: a 14 m service band with brass edges (holds the heavy greebles)
  fc(O, 7.0, O_WAIST, 7.0, 0, 1, CL.brassHi, M.brass);
  fc(O_WAIST, 7.0, O_WAIST, -7.0, 1, 0, CL.waist, M.hull, { vary: 1 });
  fc(O_WAIST, -7.0, O, -7.0, 0, -1, CL.brassDark, M.brassD);
  fc(O, -7.0, O, -7.6, 1, 0, CL.hull, M.hull, { vary: 1 });
  // gallery 3: -7.6 .. -18.8
  fc(O, -7.6, O_REC, -7.6, 0, -1, CL.seam, M.panel);
  fc(O_REC, -7.6, O_REC, -18.8, 1, 0, CL.recess, M.panel);
  fc(O_REC, -18.8, O, -18.8, 0, 1, CL.seam, M.panel);
  fc(O, -18.8, O, -19.4, 1, 0, CL.hull, M.hull, { vary: 1 });
  // brass string course 2
  fc(O, -19.4, O_STR, -19.4, 0, 1, CL.brassHi, M.brass);
  fc(O_STR, -19.4, O_STR, -20.4, 1, 0, CL.brass, M.brass);
  fc(O_STR, -20.4, O, -20.4, 0, -1, CL.brassDark, M.brassD);
  fc(O, -20.4, O, -21.0, 1, 0, CL.hull, M.hull, { vary: 1 });
  // gallery 4: -21.0 .. -32.4
  fc(O, -21.0, O_REC, -21.0, 0, 1, CL.seam, M.panel);
  fc(O_REC, -21.0, O_REC, -32.4, 1, 0, CL.recess, M.panel);
  fc(O_REC, -32.4, O, -32.4, 0, -1, CL.seam, M.panel);
  fc(O, -32.4, O, -34.2, 1, 0, CL.hull, M.hull, { vary: 1 });
  fc(O, -34.2, O_CORN, -34.6, 0, 1, CL.seam, M.panel);
  fc(O_CORN, -34.6, O_CORN, -35.8, 1, 0, CL.cornice, M.hullHi);
  fc(O_CORN, -35.8, O, -35.8, 0, -1, CL.cornice, M.hullHi);
  fc(O, -35.8, O, -HALF_H, 1, 0, CL.hull, M.hull, { vary: 1 });
  // ---- bottom annulus
  fc(O, -HALF_H, I_EAVE, -HALF_H, 0, -1, CL.bottom, M.panel);
  // ---- inner face, bottom -> top (dim self-lit: the rim is seen across the hub)
  fc(I_EAVE, -HALF_H, I_EAVE, -31.0, -1, 0, CL.hullIn, M.hullIn, { vary: 1 });   // lower cornice fascia
  fc(I_EAVE, -31.0, R_IN, -30.4, 0, 1, CL.hullIn2, M.hullIn2);                   // soffit
  fc(R_IN, -30.4, R_IN, -29.4, -1, 0, CL.hullIn, M.hullIn, { vary: 1 });
  fc(R_IN, -29.4, I_CAV, -29.4, 0, 1, CL.seal, M.seal);                           // arcade floor
  fc(I_CAV, -29.4, I_CAV, 29.4, -1, 0, CL.cavity, M.cavity);                      // arcade back wall
  fc(I_CAV, 29.4, R_IN, 29.4, 0, -1, CL.seal, M.seal);                            // arcade ceiling
  fc(R_IN, 29.4, R_IN, 30.4, -1, 0, CL.hullIn, M.hullIn, { vary: 1 });
  fc(R_IN, 30.4, I_EAVE, 31.0, 0, -1, CL.hullIn2, M.hullIn2);
  fc(I_EAVE, 31.0, I_EAVE, HALF_H, -1, 0, CL.hullIn, M.hullIn, { vary: 1 });     // upper cornice fascia
  // ---- top annulus (the roof deck)
  fc(I_EAVE, HALF_H, O, HALF_H, 0, 1, CL.deck, M.panel);
  return F;
}
const FACES = shellFaces();

// angular sample list; the dock wedge is removed and its two exact edge angles
// are re-inserted so the shell ends exactly on the portal jambs.
const ANG = (() => {
  const list = [];
  for (let s = 0; s < SEG; s++) {
    for (let k = 0; k < SUB; k++) {
      const a = s * SECT + (k * SECT) / SUB;
      if (!(a > A0 + 1e-9 && a < A1 - 1e-9)) list.push(a);
    }
  }
  list.push(A0, A1);
  list.sort((x, y) => x - y);
  return list;
})();

function buildShell(b, sec) {
  const n = ANG.length;
  for (let i = 0; i < n; i++) {
    const a0 = ANG[i];
    const a1 = i + 1 < n ? ANG[i + 1] : ANG[0] + TAU;
    const am = (a0 + a1) * 0.5;
    if (am > A0 && am < A1) continue;                    // the dock mouth: no shell
    const s = Math.floor((((am % TAU) + TAU) % TAU) / SECT) % SEG;
    const sh = sec.shade[s];
    for (let k = 0; k < FACES.length; k++) {
      const f = FACES[k];
      let col = f.col;
      if (f.vary) {
        col = mulc(col, sh);
        if (sec.tint[s]) col = mixc(col, CL.hull2, 0.22);
      }
      surf(b, a0, a1, f.r0, f.y0, f.r1, f.y1, col, f.mat, f.nr, f.ny);
    }
  }
}

// ============================================================================
// 2. PORTHOLES — four outer galleries (5 tall windows each, 20 per sector) and
//    two inner arcade galleries (7 each, 14 per sector).  Warm gold is the norm;
//    every 7th window is cyan and every 9th is shuttered dark blue.
// ============================================================================
const WIN_ROWS = [
  { y: 26.7, hh: 4.6, pediment: true },
  { y: 13.2, hh: 4.5 },
  { y: -13.2, hh: 4.5 },
  { y: -26.7, hh: 4.6 },
];
const IN_ROWS = [
  { y: 22.3, hh: 4.6 },
  { y: 10.6, hh: 4.4 },
  { y: -10.6, hh: 4.4 },
  { y: -22.3, hh: 4.6 },
];
const WIN_HW = 2.3;          // outer window half width (4.6 m)
const IN_HW = 1.65;          // inner window half width (3.3 m)

function winState(rnd) {
  const q = rnd();
  if (q < 0.11) return 'off';
  if (q < 0.245) return 'cyan';
  return 'warm';
}
function glassCol(state) {
  return state === 'cyan' ? C.cyanGlow : state === 'off' ? C.glassDeep : C.warmGlow;
}
function glassMat(state) {
  return state === 'off' ? M.winOff : state === 'cyan' ? M.winCyan : M.winWarm;
}
function drawWindow(b, A, y0, y1, hw, rBack, state, opt) {
  const dA = hw / rBack;
  const rG = rBack + 0.32;
  // brightness jitter per window: a lit city never has 3200 identical bulbs
  const br = opt && opt.br ? opt.br : 1;
  const col = mulc(glassCol(state), br);
  const mat = glassMat(state);
  const N = RAD(A);
  b.quad(P(A - dA, rG, y0), P(A + dA, rG, y0), P(A + dA, rG, y1), P(A - dA, rG, y1), col, mat, N);
  if (!opt || !opt.noFrame) {
    const bw = 0.42;
    const rF = rBack + 0.95;
    const aF = (hw + bw) / rBack;
    const Y0 = y0 - bw, Y1 = y1 + bw;
    const fr = (aa0, yy0, aa1, yy1) => b.quad(P(aa0, rF, yy0), P(aa1, rF, yy0), P(aa1, rF, yy1), P(aa0, rF, yy1), C.brass, M.brass, N);
    fr(A - aF, Y0, A + aF, y0);
    fr(A - aF, y1, A + aF, Y1);
    fr(A - aF, y0, A - dA, y1);
    fr(A + dA, y0, A + aF, y1);
    // transom bar (the tall gallery window is split 3:2)
    const ym = y0 + (y1 - y0) * 0.615;
    fr(A - dA, ym, A + dA, ym + 0.30);
  }
  // brass sill / apron under the window (they read as a rhythm at close range)
  {
    const rS = rBack + 1.15;
    const aS = (hw + 0.8) / rBack;
    b.quad(P(A - aS, rS, y0 - 1.05), P(A + aS, rS, y0 - 1.05), P(A + aS, rS, y0 - 0.15), P(A - aS, rS, y0 - 0.15), C.brassDark, M.brassD, RAD(A));
    b.quad(P(A - aS, rS, y0 - 0.15), P(A + aS, rS, y0 - 0.15), P(A + aS, rBack, y0 - 0.15), P(A - aS, rBack, y0 - 0.15), CL.hull2, M.hull, [0, -1, 0]);
  }
  if (opt && opt.pediment) {
    const rP = rBack + 1.35;
    const aP = (hw + 0.9) / rBack;
    // small brass crown + keystone above the window head
    b.quad(P(A - aP, rP, y1 + 0.5), P(A + aP, rP, y1 + 0.5), P(A + aP, rP, y1 + 1.35), P(A - aP, rP, y1 + 1.35), C.brassHi, M.brass, RAD(A));
    b.quad(P(A - aP, rP, y1 + 1.35), P(A + aP, rP, y1 + 1.35), P(A + aP, rP + 0.7, y1 + 1.9), P(A - aP, rP + 0.7, y1 + 1.9), C.brass, M.brass, [Math.cos(A), 0.8, Math.sin(A)]);
    b.quad(P(A - 0.55 / rBack, rP + 0.15, y1), P(A + 0.55 / rBack, rP + 0.15, y1), P(A + 0.55 / rBack, rP + 0.15, y1 + 1.5), P(A - 0.55 / rBack, rP + 0.15, y1 + 1.5), C.brassHi, M.brass, RAD(A));
  }
}
function pilaster(b, A, r, y0, y1, w, col) {
  const dA = w / r;
  const t = 0.75;
  b.quad(P(A - dA, r + t, y0), P(A + dA, r + t, y0), P(A + dA, r + t, y1), P(A - dA, r + t, y1), col, M.hull, RAD(A));
  b.quad(P(A - dA, r, y0), P(A - dA, r + t, y0), P(A - dA, r + t, y1), P(A - dA, r, y1), mulc(col, 0.9), M.hull, mulc(TG(A), -1));
  b.quad(P(A + dA, r, y0), P(A + dA, r + t, y0), P(A + dA, r + t, y1), P(A + dA, r, y1), mulc(col, 0.94), M.hull, TG(A));
}
function buildWindows(b, sec, rnd) {
  const stat = { warm: 0, cyan: 0, off: 0, total: 0 };
  for (let s = 0; s < SEG; s++) {
    const sh = sec.shade[s];
    const baseA = s * SECT;
    for (let rIdx = 0; rIdx < WIN_ROWS.length; rIdx++) {
      const row = WIN_ROWS[rIdx];
      for (let j = 0; j < 5; j++) {
        const A = baseA + ((j + 0.5) / 5) * SECT;
        if (angDist(A, DOCK_A) < DOCK_HA + WIN_HW / O_REC + 0.012) continue;
        const st = winState(rnd);
        drawWindow(b, A, row.y - row.hh, row.y + row.hh, WIN_HW, O_REC, st, { pediment: !!row.pediment, br: 0.70 + 0.30 * rnd() });
        stat[st]++;
        stat.total++;
      }
    }
    // frieze panel joints: a thin shadow line splitting the plain cornice bands
    for (const yy of [33.3, -33.3]) {
      for (const k of [0.5]) {
        const A = baseA + k * SECT;
        const dA = 0.10 / R_OUT;
        b.quad(P(A - dA, R_OUT + 0.06, yy - 2.2), P(A + dA, R_OUT + 0.06, yy - 2.2), P(A + dA, R_OUT + 0.06, yy + 2.2), P(A - dA, R_OUT + 0.06, yy + 2.2), CL.seam, M.seal, RAD(A));
      }
    }
    // piers between the five windows of the two upper galleries
    for (let j = 1; j <= 4; j++) {
      const A = baseA + (j / 5) * SECT;
      if (angDist(A, DOCK_A) < DOCK_HA + 0.02) continue;
      pilaster(b, A, O_REC, 7.75, 32.25, 0.85, mulc(C.ivory, 0.99 * sh));
      pilaster(b, A, O_REC, -32.25, -7.75, 0.85, mulc(C.ivory, 0.99 * sh));
    }
    // brass medallions on the piers (close-range Beaux-Arts detail, r=645.1)
    for (let j = 1; j <= 4; j++) {
      const A = baseA + (j / 5) * SECT;
      if (angDist(A, DOCK_A) < DOCK_HA + 0.02) continue;
      for (const yy of [14.6, -14.6]) {
        const rr = 645.25;
        const dA = 0.55 / rr;
        b.quad(P(A - dA, rr, yy - 0.55), P(A + dA, rr, yy - 0.55), P(A + dA, rr, yy + 0.55), P(A - dA, rr, yy + 0.55), CL.brass, M.brass, RAD(A));
        b.quad(P(A - dA * 0.5, rr + 0.12, yy - 0.28), P(A + dA * 0.5, rr + 0.12, yy - 0.28), P(A + dA * 0.5, rr + 0.12, yy + 0.28), P(A - dA * 0.5, rr + 0.12, yy + 0.28), CL.brassHi, M.brass, RAD(A));
      }
    }
    // inner arcade: two galleries of seven windows
    for (let rIdx = 0; rIdx < IN_ROWS.length; rIdx++) {
      const row = IN_ROWS[rIdx];
      for (let j = 0; j < 7; j++) {
        const A = baseA + ((j + 0.5) / 7) * SECT;
        if (angDist(A, DOCK_A) < DOCK_HA + IN_HW / I_CAV + 0.012) continue;
        const st = winState(rnd);
        drawWindow(b, A, row.y - row.hh, row.y + row.hh, IN_HW, R_IN + 2.2, st, { noFrame: true, br: 0.78 + 0.30 * rnd() });
        stat[st]++;
        stat.total++;
      }
    }
  }
  return stat;
}

// ============================================================================
// 3. RIB HOOPS — twelve brass/dark-steel collars that wrap the whole cross-section
//    and divide the 1.2 km circumference into twelve countable segments.  The rib
//    at ST.dockAngle is the monumental portal frame (built in the dock section).
// ============================================================================
const RIB_PROFILE = [
  { r0: R_OUT, y0: HALF_H, r1: R_OUT, y1: -HALF_H, nr: 1, ny: 0 },          // outer
  { r0: R_OUT, y0: -HALF_H, r1: I_EAVE, y1: -HALF_H, nr: 0, ny: -1 },       // bottom
  { r0: I_EAVE, y0: -HALF_H, r1: I_EAVE, y1: HALF_H, nr: -1, ny: 0 },       // inner
  { r0: I_EAVE, y0: HALF_H, r1: R_OUT, y1: HALF_H, nr: 0, ny: 1 },          // top
];
function buildRib(b, A, rnd) {
  const ha = RIB_HALF_DEG * D2R;
  const a0 = A - ha, a1 = A + ha;
  for (const g of RIB_PROFILE) {
    const d = RIB_D;
    const oa0 = [g.r0 + g.nr * d, g.y0 + g.ny * d];
    const oa1 = [g.r1 + g.nr * d, g.y1 + g.ny * d];
    // crest face
    surf(b, a0, a1, oa0[0], oa0[1], oa1[0], oa1[1], CL.brass, M.brass, g.nr, g.ny);
    // flanks
    const n0 = mulc(TG(a0), -1), n1 = TG(a1);
    b.quad(P(a0, g.r0, g.y0), P(a0, g.r1, g.y1), P(a0, oa1[0], oa1[1]), P(a0, oa0[0], oa0[1]), CL.steel, M.panel, n0);
    b.quad(P(a1, g.r0, g.y0), P(a1, g.r1, g.y1), P(a1, oa1[0], oa1[1]), P(a1, oa0[0], oa0[1]), CL.steel, M.panel, n1);
    // thin gold ridge on the crest
    surf(b, A - ha * 0.28, A + ha * 0.28, oa0[0] + g.nr * 0.16, oa0[1] + g.ny * 0.16, oa1[0] + g.nr * 0.16, oa1[1] + g.ny * 0.16, CL.brassHi, M.brass, g.nr, g.ny);
  }
  // mitered corner blocks (they hide the four gaps and read as capital stones)
  const d = RIB_D;
  for (const c of [[R_OUT + d * 0.5, HALF_H + d * 0.5], [R_OUT + d * 0.5, -HALF_H - d * 0.5], [I_EAVE - d * 0.5, HALF_H + d * 0.5], [I_EAVE - d * 0.5, -HALF_H - d * 0.5]]) {
    frameAt(b, A, c[0], c[1], () => box(b, d + 2.2, d + 2.2, 2 * ha * RING_R + 1.2, CL.brass, M.brass, { topCol: CL.brassHi }));
  }
  // corbels under the outer crest (Beaux-Arts brackets)
  frameAt(b, A, R_OUT + 0.6, 0, () => {
    for (let k = -3; k <= 3; k++) {
      if (k === 0) continue;
      b.push(T(0, k * 8.4, 0));
      box(b, 2.6, 3.4, 5.4, CL.hull2, M.hull, { topCol: CL.brass });
      b.pop();
    }
  });
  // panel seams / rivet bands on the flanks
  for (const sgn of [-1, 1]) {
    const aa = sgn < 0 ? a0 : a1;
    for (let k = 0; k < 5; k++) {
      const y = -HALF_H + 14.8 * k;
      b.quad(P(aa, R_OUT, y), P(aa, R_OUT, y + 0.5), P(aa, R_OUT + RIB_D, y + 0.5), P(aa, R_OUT + RIB_D, y), mulc(CL.brassDark, 0.9 + 0.2 * rnd()), M.brassD, mulc(TG(aa), sgn));
    }
  }
}
function buildRibs(b, rnd) {
  const ribs = [];
  for (let k = 0; k < RIB_N; k++) {
    const deg = k * 30;
    if (deg === (((Math.round(ST.dockAngle) % 360) + 360) % 360)) {
      ribs.push({ angleDeg: deg, kind: 'dock' });     // built by buildDockFrame
      continue;
    }
    buildRib(b, deg * D2R, rnd);
    ribs.push({ angleDeg: deg, kind: 'rib' });
  }
  return ribs;
}

// ============================================================================
// 4. THE DOCK — a real opening.  A wedge of the shell is missing (see ANG / the
//    shell sweep skip), the two jambs are the full cross-section cut faces, the
//    tunnel is open from the outer mouth straight through to the hub side, and a
//    150 m tongue, two guide towers, four claw groups and a boarding bridge
//    reach out into space.
// ============================================================================
function buildDockFrame(b) {
  const HW = PORT_HW, HH = PORT_HH;
  const zf = DOCK_Z;                 // -646
  // ---- jambs flanking the mouth
  for (const sx of [-1, 1]) {
    const jx = sx * (HW + 6.5);
    // main pier (protrudes 5 m into space)
    b.push(T(jx, 0, zf - 2.4));
    box(b, 13, 2 * HALF_H + 6, 5.2, CL.hull, M.hull, { topCol: CL.cornice, bottomCol: CL.hull2 });
    b.pop();
    // brass flutes on the outer face
    for (let k = -1; k <= 1; k++) {
      b.push(T(jx + k * 3.0, 0, zf - 5.05));
      box(b, 0.7, 2 * HALF_H - 10, 0.5, CL.brass, M.brass);
      b.pop();
    }
    // capital and base
    b.push(T(jx, HALF_H, zf - 2.4));
    box(b, 15, 3.8, 6.6, CL.brass, M.brass, { topCol: CL.brassHi });
    b.pop();
    b.push(T(jx, -HALF_H, zf - 2.4));
    box(b, 15, 3.8, 6.6, CL.brassDark, M.brassD);
    b.pop();
    // radial fins
    for (let k = 0; k < 5; k++) {
      b.push(T(jx + sx * 6.0, -HALF_H + 14.8 * k, zf - 3.2));
      box(b, 5.0, 0.55, 3.4, mulc(CL.steel, 1.1), M.panel);
      b.pop();
    }
    // cyan marker strip on the inner jamb face (visible from the approach)
    b.push(T(sx * (HW + 0.5), HH - 3.0, zf - 0.8));
    box(b, 0.22, 0.55, 52, CL.grid, M.band);
    b.pop();
  }
  // ---- lintel / frieze / cornice over the mouth
  b.push(T(0, HH + 6.0, zf - 1.8));
  box(b, 2 * HW + 26, 12, 5.6, CL.hull, M.hull, { topCol: CL.cornice, bottomCol: CL.brassDark });
  b.pop();
  b.push(T(0, HH + 12.4, zf - 2.0));
  box(b, 2 * HW + 34, 2.6, 7.2, CL.cornice, M.hullHi, { topCol: CL.brassHi });
  b.pop();
  // brass string on the lintel
  b.push(T(0, HH + 1.0, zf - 4.7));
  box(b, 2 * HW + 18, 0.7, 0.5, CL.brass, M.brass);
  b.pop();
  // keystone
  b.push(T(0, HH + 4.2, zf - 5.3));
  box(b, 8.4, 10.5, 3.0, CL.brass, M.brass, { topCol: CL.brassHi });
  b.pop();
  // dentils under the cornice
  for (let k = 0; k < 17; k++) {
    const x = -HW - 8 + (k / 16) * (2 * HW + 16);
    b.push(T(x, HH + 10.4, zf - 4.6));
    box(b, 1.5, 1.6, 1.0, CL.brassDark, M.brassD);
    b.pop();
  }
  // ---- sill / quay edge under the mouth
  b.push(T(0, -HH - 4.4, zf - 2.6));
  box(b, 2 * HW + 18, 8.4, 7.0, CL.hull2, M.hull, { topCol: CL.brass });
  b.pop();
  // hazard stripes on the quay face
  for (let k = 0; k < 9; k++) {
    const x = -HW - 4 + (k / 8) * (2 * HW + 8);
    b.push(T(x, -HH - 4.4, zf - 6.15));
    box(b, 4.6, 2.2, 0.4, k % 2 ? CL.warn : mulc(CL.warn, 0.45), M.warn);
    b.pop();
  }
  // ---- brass collar right on the mouth perimeter
  const zc = zf - 0.6;
  b.push(T(0, HH + 1.0, zc));
  box(b, 2 * HW + 3.4, 2.4, 1.6, CL.brass, M.brass);
  b.pop();
  b.push(T(0, -HH - 1.0, zc));
  box(b, 2 * HW + 3.4, 2.4, 1.6, CL.brass, M.brass);
  b.pop();
  for (const sx of [-1, 1]) {
    b.push(T(sx * (HW + 1.0), 0, zc));
    box(b, 2.4, 2 * HH + 3.4, 1.6, CL.brass, M.brass);
    b.pop();
  }
  // portal lights: warm strips inside the top corners of the mouth
  for (const sx of [-1, 1]) {
    b.push(T(sx * (HW - 2.6), HH - 1.1, zf - 8));
    box(b, 1.2, 0.5, 64, CL.warm, M.band);
    b.pop();
    // cyan inlay running up the outer face of each jamb
    b.push(T(sx * (HW + 0.35), 0, zf - 5.3));
    box(b, 0.30, 2 * HALF_H - 6, 0.35, CL.grid, M.band);
    b.pop();
  }
  // cyan inlay across the lintel and the quay edge
  b.push(T(0, HH + 12.9, zf - 5.65));
  box(b, 2 * HW + 26, 0.30, 0.35, CL.grid, M.band);
  b.pop();
  b.push(T(0, -HH - 8.4, zf - 6.15));
  box(b, 2 * HW + 12, 0.30, 0.35, CL.grid, M.band);
  b.pop();
}

function buildDockTunnel(b, rnd) {
  const HW = PORT_HW, HH = PORT_HH;
  // ---- the two cut faces of the shell (the jamb walls of the tunnel)
  for (const A of [A0, A1]) {
    const N = A === A0 ? TG(A0) : mulc(TG(A1), -1);
    const p00 = P(A, I_EAVE, -HALF_H), p10 = P(A, R_OUT, -HALF_H);
    const p11 = P(A, R_OUT, HALF_H), p01 = P(A, I_EAVE, HALF_H);
    b.quad(p00, p10, p11, p01, CL.steel, M.panel, N);
    // structural ribs on the jamb wall
    for (let k = 0; k < 5; k++) {
      const yy = -HALF_H + 4 + k * 15;
      const rr = R_OUT - 6;
      b.quad(P(A, rr, yy), P(A, rr, yy + 1.2), P(A, rr - 14, yy + 1.2), P(A, rr - 14, yy), CL.brassDark, M.brassD, N);
    }
  }
  // ---- the shell must stay watertight around the cut: outer and inner face
  //      strips above/below the mouth plus the roof / underdeck annulus inside
  //      the wedge.  Only the mouth itself has no face at all.
  surf(b, A0, A1, R_OUT, PORT_HH, R_OUT, HALF_H, CL.hull, M.hull, 1, 0);
  surf(b, A0, A1, R_OUT, -HALF_H, R_OUT, -PORT_HH, CL.hull, M.hull, 1, 0);
  surf(b, A0, A1, R_IN, PORT_HH, R_IN, HALF_H, CL.hull, M.hull, -1, 0);
  surf(b, A0, A1, R_IN, -HALF_H, R_IN, -PORT_HH, CL.hull, M.hull, -1, 0);
  surf(b, A0, A1, I_EAVE, HALF_H, R_OUT, HALF_H, CL.deck, M.panel, 0, 1);
  surf(b, A0, A1, I_EAVE, -HALF_H, R_OUT, -HALF_H, CL.bottom, M.panel, 0, -1);
  // ---- tunnel ceiling and floor (open: no plate across the passage)
  surf(b, A0, A1, R_IN, HH, R_OUT, HH, CL.steelD, M.panel, 0, -1);
  surf(b, A0, A1, R_IN, -HH, R_OUT, -HH, CL.deck, M.panel, 0, 1);
  // ceiling coffers
  for (let k = 0; k < 8; k++) {
    const t = (k + 0.5) / 8;
    const z = DOCK_Z + (R_OUT - R_IN) * t;   // -646 .. -554 (z grows toward the hub)
    b.push(T(0, HH - 1.6, z));
    box(b, 2 * HW - 8, 3.2, 2.0, CL.hull2, M.hull, { bottomCol: CL.brassDark });
    b.pop();
    b.push(T(0, HH - 3.4, z));
    box(b, 2 * HW - 20, 0.4, 0.5, CL.brass, M.brass);
    b.pop();
    // warm downlight panels between the coffers (the hangar is never a black box)
    b.quad([-HW + 7, HH - 3.5, z + 5.6], [HW - 7, HH - 3.5, z + 5.6], [HW - 7, HH - 3.5, z + 11.2], [-HW + 7, HH - 3.5, z + 11.2], CL.warm, M.band, [0, -1, 0]);
    b.quad([-HW + 7, HH - 3.5, z - 11.2], [HW - 7, HH - 3.5, z - 11.2], [HW - 7, HH - 3.5, z - 5.6], [-HW + 7, HH - 3.5, z - 5.6], CL.warm, M.band, [0, -1, 0]);
  }
  // warm light spine along the tunnel ceiling + cyan edge strips
  b.push(T(0, HH - 2.4, DOCK_Z + 46));
  box(b, 1.6, 0.35, 80, CL.warm, M.band);
  b.pop();
  for (const sx of [-1, 1]) {
    b.push(T(sx * (HW - 6), HH - 2.2, DOCK_Z + 46));
    box(b, 0.35, 0.3, 84, CL.grid, M.band);
    b.pop();
    // side loading platforms (leave the centre passage clear for the fly-through)
    b.push(T(sx * (HW - 10), -HH + 4.6, DOCK_Z + 46));
    box(b, 17, 4.4, 88, CL.deck, M.panel, { topCol: CL.hull2 });
    b.pop();
    b.push(T(sx * (HW - 18.6), -HH + 7.0, DOCK_Z + 46));
    box(b, 1.0, 1.4, 88, CL.brass, M.brass);
    b.pop();
    // cargo crates on the platforms
    for (let k = 0; k < 4; k++) {
      const z = DOCK_Z + 12 + k * 24 + rnd() * 6;
      b.push(T(sx * (HW - 10), -HH + 9.4, z));
      box(b, 7, 5, 8, k % 2 ? CL.hatch : CL.tank, M.panel, { topCol: CL.hull2 });
      b.pop();
    }
    // crane rail + trolley
    b.push(T(sx * (HW - 16), -HH + 10.6, DOCK_Z + 46));
    box(b, 1.2, 0.8, 86, CL.steel, M.panel);
    b.pop();
    // warm wash strip on both cut faces (the jamb walls of the tunnel)
    for (const yy of [13.0, -13.0]) {
      b.push(T(sx * (HW - 2.2), yy, DOCK_Z + 46));
      box(b, 0.3, 0.7, 84, CL.warm, M.band);
      b.pop();
    }
    // big cargo stacks just inside the mouth: the port must read as a working dock
    for (let k = 0; k < 4; k++) {
      const z = DOCK_Z + 12 + k * 17;
      b.push(T(sx * (HW - 8.5), -HH + 8.2 + (k % 2) * 3.4, z));
      box(b, 9.5, 6.6, 11.0, k % 2 ? CL.tank : CL.hatch, M.panel, { topCol: CL.hull2 });
      b.pop();
      if (k % 2 === 0) {
        b.push(T(sx * (HW - 8.5), -HH + 14.6, z + 2));
        box(b, 7.5, 5.0, 8.0, mulc(CL.hatch, 0.92), M.panel);
        b.pop();
      }
    }
    // portal loading gantry with warm work lamps
    b.push(T(sx * (HW - 13), -HH + 20.0, DOCK_Z + 16));
    box(b, 1.6, 1.6, 30, CL.steel, M.panel);
    b.pop();
    for (let k = 0; k < 3; k++) {
      b.push(T(sx * (HW - 13), -HH + 18.6, DOCK_Z + 8 + k * 11));
      box(b, 2.2, 1.4, 2.2, CL.warm, M.band);
      b.pop();
    }
  }
  // floor runway lines: two warm guide lines running to the inner mouth
  for (const sx of [-1, 1]) {
    b.push(T(sx * 12.0, -HH + 0.12, DOCK_Z + 46));
    box(b, 0.6, 0.22, 82, CL.warm, M.band);
    b.pop();
    b.push(T(sx * 26.0, -HH + 0.12, DOCK_Z + 46));
    box(b, 0.5, 0.22, 82, CL.grid, M.band);
    b.pop();
  }
  // a lit arrival board on the inner mouth lintel
  b.push(T(0, HH - 4.2, DOCK_Z + 86));
  box(b, 26, 2.6, 0.6, CL.grid, M.band);
  b.pop();
  // ---- boarding bridge (舷桥): slung across the tunnel, high enough to fly under/over
  const bz = -600, by = 8;
  b.push(T(0, by, bz));
  box(b, 2 * (HW - 7), 3.2, 7.0, CL.hull, M.hull, { topCol: CL.cornice, bottomCol: CL.hull2 });
  b.pop();
  for (const sz of [-1, 1]) {
    b.push(T(0, by + 2.2, bz + sz * 3.2));
    box(b, 2 * (HW - 7), 0.45, 0.45, CL.brass, M.brass);
    b.pop();
  }
  // hangers up to the ceiling (kept at the far sides so the central fly-through stays clear)
  for (const sx of [-1, 1]) {
    b.push(T(sx * (HW - 10), by + 10, bz));
    box(b, 0.8, 16, 0.8, CL.steel, M.panel);
    b.pop();
  }
  // ---- inner mouth frame (where the tunnel opens onto the hub side)
  const zi = -(R_IN);
  for (const sx of [-1, 1]) {
    b.push(T(sx * (HW - 2.0), 0, zi + 0.6));
    box(b, 2.6, 2 * HH + 2, 1.4, CL.brass, M.brass);
    b.pop();
  }
  for (const sy of [-1, 1]) {
    b.push(T(0, sy * (HH - 0.2), zi + 0.6));
    box(b, 2 * HW + 2, 2.6, 1.4, CL.brass, M.brass);
    b.pop();
  }
}

function buildDockTongue(b, rnd) {
  const HW = PORT_HW, HH = PORT_HH;
  const z0 = DOCK_Z, z1 = TONGUE_Z1;
  const len = z0 - z1;
  const zc = (z0 + z1) / 2;
  const deckY = -HH;                      // deck top continues the tunnel floor
  // ---- deck plate
  b.push(T(0, deckY - 1.4, zc));
  box(b, 56, 2.8, len, CL.deck, M.panel, { topCol: CL.hull2 });
  b.pop();
  // deck panel joints
  for (let k = 1; k < 12; k++) {
    const z = z0 - (k / 12) * len;
    b.push(T(0, deckY + 0.06, z));
    box(b, 56, 0.12, 0.55, CL.seam, M.seal);
    b.pop();
  }
  b.push(T(0, deckY + 0.06, zc));
  box(b, 0.6, 0.12, len, CL.brassDark, M.brassD);
  b.pop();
  // ---- girders and cross beams under the deck
  for (const sx of [-1, 1]) {
    b.push(T(sx * 27.0, deckY - 4.0, zc));
    box(b, 4.6, 6.6, len, CL.hull2, M.hull, { topCol: CL.hull, bottomCol: CL.hull3 });
    b.pop();
    // gold edge line along the girder
    b.push(T(sx * 27.0, deckY - 1.2, zc));
    box(b, 0.6, 0.5, len, CL.brass, M.brass);
    b.pop();
  }
  for (let k = 0; k < 14; k++) {
    const z = z0 - ((k + 0.5) / 14) * len;
    b.push(T(0, deckY - 4.4, z));
    box(b, 54, 2.6, 2.0, CL.steel, M.panel);
    b.pop();
    // diagonal braces under the deck
    bar3(b, [-24, deckY - 6.0, z - 5.6], [24, deckY - 2.2, z + 5.6], 0.9, 0.9, CL.steel, M.panel);
  }
  // ---- walkway rails
  for (const sx of [-1, 1]) {
    b.push(T(sx * 26.0, deckY, zc));
    b.push(RY(PI / 2));
    railing(b, len - 2, 1.35, CL.brass, M.brass, { n: 12, simple: true });
    b.pop();
    b.pop();
  }
  // ---- luminous edge lines: the tongue must read against the 0 K background
  for (const sx of [-1, 1]) {
    b.push(T(sx * 26.6, deckY + 0.18, zc));
    box(b, 0.55, 0.34, len - 6, CL.warm, M.band);
    b.pop();
    b.push(T(sx * 27.0, deckY - 7.3, zc));
    box(b, 0.42, 0.30, len - 8, CL.grid, M.band);
    b.pop();
    // pipe runs on top of the girders
    tubePath(b, [[sx * 24.4, deckY + 1.4, z0 - 4], [sx * 24.4, deckY + 1.4, z1 + 6]], 0.55, 5, CL.pipe, M.panel, { caps: true });
    tubePath(b, [[sx * 21.8, deckY + 1.1, z0 - 4], [sx * 21.8, deckY + 1.1, z1 + 6]], 0.35, 4, CL.brass, M.brass, { caps: true });
  }
  // runway centreline: chevrons marching out to the mouth
  for (let k = 0; k < 8; k++) {
    b.push(T(0, deckY + 0.16, z0 - 10 - k * 18));
    box(b, 5.2, 0.22, 2.4, CL.warm, M.band);
    b.pop();
  }
  // ---- underside lighting: view 3 sits below the deck, so the readable faces are
  //      the girder bottoms.  Long warm/cyan lines keep the 150 m approach legible.
  for (const sx of [-1, 1]) {
    b.push(T(sx * 27.0, deckY - 7.35, zc));
    box(b, 1.4, 0.30, len - 4, CL.warm, M.band);
    b.pop();
    b.push(T(sx * 13.0, deckY - 6.2, zc));
    box(b, 0.55, 0.28, len - 10, CL.grid, M.band);
    b.pop();
  }
  // warm spark on every cross-beam end (a dotted line under the deck)
  for (let k = 0; k < 14; k++) {
    const z = z0 - ((k + 0.5) / 14) * len;
    for (const sx of [-1, 1]) {
      b.push(T(sx * 24.6, deckY - 5.0, z));
      box(b, 3.2, 0.24, 0.6, CL.warm, M.band);
      b.pop();
    }
  }
  // end face of the tongue: a lit bumper so the platform has a clear terminus
  b.push(T(0, deckY - 4.0, z1 + 0.15));
  box(b, 40, 0.5, 0.4, CL.warm, M.band);
  b.pop();
  // ---- docking lamps along the deck edges
  for (let k = 0; k < 7; k++) {
    const z = z0 - 14 - k * 21;
    for (const sx of [-1, 1]) {
      b.push(T(sx * 24.0, deckY + 0.6, z));
      box(b, 1.8, 1.0, 2.6, CL.warm, M.band);
      b.pop();
    }
  }
  // ---- guide towers at the far end: open ivory trusses with brass ring frames,
  //      warm flood heads and red beacons.  They frame the dock view and never
  //      cross the flight axis (x = +-31, the mouth is 70 m wide).
  for (const sx of [-1, 1]) {
    const tx = sx * 41.0, tz = z1 + 26;
    const H = 70, half = 2.6;
    const y0t = deckY + 2;
    // outrigger that carries the tower out past the mouth jaw
    b.push(T(sx * 34.0, deckY - 2.0, tz));
    box(b, 16, 3.6, 9.0, CL.hull2, M.hull, { topCol: CL.hull });
    b.pop();
    bar3(b, [sx * 27.5, deckY - 4.4, tz - 12], [sx * 40.0, deckY - 4.4, tz], 1.6, 1.6, CL.steel, M.panel);
    bar3(b, [sx * 27.5, deckY - 4.4, tz + 12], [sx * 40.0, deckY - 4.4, tz], 1.6, 1.6, CL.steel, M.panel);
    // four legs
    for (const ox of [-half, half]) {
      for (const oz of [-half, half]) {
        bar3(b, [tx + ox, y0t, tz + oz], [tx + ox * 0.55, y0t + H, tz + oz * 0.55], 1.0, 1.0, CL.hull2, M.hull);
      }
    }
    // ring frames + diagonal bracing every 9 m
    for (let k = 0; k <= 8; k++) {
      const t = k / 8;
      const yy = y0t + H * t;
      const hw = half * lerp(1, 0.55, t);
      for (const oz of [-hw, hw]) bar3(b, [tx - hw, yy, tz + oz], [tx + hw, yy, tz + oz], 0.55, 0.55, k % 2 ? CL.brass : CL.steel, k % 2 ? M.brass : M.panel);
      for (const ox of [-hw, hw]) bar3(b, [tx + ox, yy, tz - hw], [tx + ox, yy, tz + hw], 0.55, 0.55, k % 2 ? CL.brass : CL.steel, k % 2 ? M.brass : M.panel);
      if (k < 8) {
        const t2 = (k + 1) / 8;
        const yy2 = y0t + H * t2;
        const hw2 = half * lerp(1, 0.55, t2);
        bar3(b, [tx - hw, yy, tz - hw], [tx + hw2, yy2, tz - hw2], 0.5, 0.5, CL.steel, M.panel);
        bar3(b, [tx + hw, yy, tz + hw], [tx - hw2, yy2, tz + hw2], 0.5, 0.5, CL.steel, M.panel);
      }
    }
    // crown platform, flood heads, beacons
    b.push(T(tx, y0t + H + 2.4, tz));
    box(b, 7.4, 2.2, 7.4, CL.hull, M.hull, { topCol: CL.cornice });
    b.pop();
    for (const oz of [-2.4, 2.4]) {
      b.push(T(tx, y0t + H + 5.2, tz + oz));
      box(b, 1.4, 4.0, 1.4, CL.brass, M.brass);
      b.pop();
    }
    b.push(T(tx, y0t + H + 8.0, tz));
    sphere(b, 1.5, CL.warn, M.warn, { rings: 3, seg: 6, jitter: 0 });
    b.pop();
    // four flood heads aimed at the mouth (emissive so the shot reads even in shadow)
    for (const ox of [-2.2, 2.2]) {
      for (const oy of [y0t + H * 0.42, y0t + H * 0.72]) {
        b.push(T(tx + ox, oy, tz - 3.0));
        box(b, 1.3, 2.6, 1.2, CL.warm, M.band);
        b.pop();
      }
    }
    // cyan light spine up the tower (segmented so it reads as a ladder of lamps)
    for (let k = 0; k < 6; k++) {
      b.push(T(tx, y0t + 6 + k * (H * 0.82 / 6), tz - 3.1));
      box(b, 0.30, H * 0.82 / 6 - 3.0, 0.30, mulc(CL.grid, 0.75), M.band);
      b.pop();
    }
    // bracing struts back to the deck + hazard stripes at the foot
    bar3(b, [tx, deckY + 4, tz], [sx * 14, deckY + 0.8, tz - 18], 1.2, 1.2, CL.steel, M.panel);
    bar3(b, [tx, deckY + 40, tz], [sx * 24, deckY - 2, tz + 14], 0.9, 0.9, CL.steel, M.panel);
    b.push(T(tx, deckY + 3, tz - 3.0));
    box(b, 6.4, 2.0, 0.4, CL.warn, M.warn);
    b.pop();
    b.push(T(tx, deckY + 6, tz - 3.0));
    box(b, 6.0, 1.4, 0.4, mulc(CL.warn, 0.45), M.warn);
    b.pop();
  }
  // ---- four claw groups (two pairs) reaching in from the sides
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const cxp = sx * 33.5, czp = TONGUE_Z1 + 42 + (sz < 0 ? 0 : 34);
      b.push(T(cxp, deckY + 9 * sz, czp));
      box(b, 7.0, 7.0, 11.0, CL.hull2, M.hull, { topCol: CL.cornice });
      b.pop();
      // two pincer arms
      for (const sy of [-1, 1]) {
        const p0 = [cxp - sx * 2, deckY + 9 * sz + sy * 2.4, czp];
        const p1 = [cxp - sx * 11, deckY + 9 * sz + sy * 5.4, czp + sz * 2.0];
        bar3(b, p0, p1, 1.6, 1.6, CL.steel, M.panel);
        const p2 = [p1[0] - sx * 2.4, p1[1] + sy * 1.8, p1[2] + sz * 5.0];
        bar3(b, p1, p2, 1.2, 1.2, CL.brassDark, M.brassD);
      }
      // hydraulic housing + pivot light
      b.push(T(cxp + sx * 3.4, deckY + 9 * sz, czp - sz * 4.6));
      box(b, 2.6, 3.0, 4.0, CL.brass, M.brass);
      b.pop();
      b.push(T(cxp - sx * 10.5, deckY + 9 * sz, czp + sz * 4.4));
      sphere(b, 0.9, CL.warm, M.beacon, { rings: 2, seg: 5, jitter: 0 });
      b.pop();
    }
  }
  // ---- docking target chevrons painted at the tongue end
  for (let k = 0; k < 5; k++) {
    b.push(T(0, deckY + 0.12, TONGUE_Z1 + 8 + k * 9));
    box(b, 30 - k * 4.4, 0.16, 1.6, CL.warm, M.band);
    b.pop();
  }
  // ---- end beacons + flood masts (low: they stay under the flight axis)
  for (const sx of [-1, 1]) {
    b.push(T(sx * 25.0, deckY + 0.8, TONGUE_Z1 + 6));
    box(b, 2.2, 6.0, 2.2, CL.hull3, M.hull);
    b.pop();
    b.push(T(sx * 25.0, deckY + 4.5, TONGUE_Z1 + 6));
    sphere(b, 1.0, CL.warn, M.warn, { rings: 2, seg: 5, jitter: 0 });
    b.pop();
  }
  // ---- lateral thrusters / RCS blocks on the deck sides
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      b.push(T(sx * 29.5, deckY - 8.5, z0 - 26 - k * 46));
      box(b, 3.4, 2.6, 5.0, CL.steel, M.panel);
      b.pop();
      b.push(T(sx * 31.2, deckY - 8.5, z0 - 26 - k * 46));
      cylinder(b, 6, 1.5, 1.9, 1.2, CL.steelD, M.panel, { y0: 0, caps: true });
      b.pop();
    }
  }
}

// ============================================================================
// 5. SOLAR SAILS — six petal arrays on radial trusses (120..210 m), deep blue
//    panels with cyan grids.  Angles are staggered like a flower and kept away
//    from view 2 (11 deg) and the dock (270 deg).
// ============================================================================
const SAILS = [
  { a: 30, len: 205, tilt: 15, roll: 2 },
  { a: 88, len: 150, tilt: -12, roll: -3 },
  { a: 146, len: 188, tilt: 16, roll: 1 },
  { a: 205, len: 166, tilt: -14, roll: 4 },
  { a: 300, len: 178, tilt: 11, roll: -2 },
  { a: 331, len: 196, tilt: 13, roll: 3 },
];
function sailPanel(b, x0, x1, z0, z1, tilt, rnd) {
  b.push(RX(tilt));
  const y = 0;
  // panel sheet in photovoltaic cells (alternating deep blue / cell highlight)
  const NX = 9, NZ = 5;
  for (let i = 0; i < NX; i++) {
    const xa = lerp(x0, x1, i / NX), xb = lerp(x0, x1, (i + 1) / NX);
    for (let j = 0; j < NZ; j++) {
      const za = lerp(z0, z1, j / NZ), zb = lerp(z0, z1, (j + 1) / NZ);
      const c = (i + j) % 2 ? CL.sail : CL.sailCell;
      b.quad([xa, y, za], [xb, y, za], [xb, y, zb], [xa, y, zb], mulc(c, 0.9 + 0.2 * rnd()), M.sail, [0, 1, 0]);
    }
  }
  // structural frame: outer edge bars + sub-frame ribs every cell row
  const pad = 1.4;
  const bars = [[x0, z0, x1, z0], [x0, z1, x1, z1], [x0, z0, x0, z1], [x1, z0, x1, z1]];
  for (const bb of bars) {
    b.quad([bb[0], 0.22, bb[1] - pad * 0.5], [bb[2], 0.22, bb[3] - pad * 0.5], [bb[2], 0.22, bb[3] + pad * 0.5], [bb[0], 0.22, bb[1] + pad * 0.5], CL.sailEdge, M.panel, [0, 1, 0]);
  }
  // cyan grid (radial + transverse lines) — the readable "solar array" cue
  for (let i = 1; i < NX; i++) {
    const x = lerp(x0, x1, i / NX);
    b.quad([x - 0.30, 0.34, z0 + 1.0], [x + 0.30, 0.34, z0 + 1.0], [x + 0.30, 0.34, z1 - 1.0], [x - 0.30, 0.34, z1 - 1.0], CL.grid, M.band, [0, 1, 0]);
  }
  for (let j = 1; j < NZ; j++) {
    const z = lerp(z0, z1, j / NZ);
    b.quad([x0 + 1.0, 0.34, z - 0.30], [x1 - 1.0, 0.34, z - 0.30], [x1 - 1.0, 0.34, z + 0.30], [x0 + 1.0, 0.34, z + 0.30], CL.grid, M.band, [0, 1, 0]);
  }
  // transverse structural ribs standing on the sheet
  for (let j = 0; j <= 4; j++) {
    const z = lerp(z0, z1, j / 4);
    bar3(b, [x0, 0.3, z], [x1, 0.3, z], 0.42, 0.55, CL.sailEdge, M.panel, [0, 1, 0]);
  }
  b.pop();
}
// four petals per sail: staggered root radius, yaw and cup so the array reads as a
// mechanical flower instead of one flat plate.  Each petal carries its own spar,
// cell grid, cyan grid lines and a lit tip edge.
const SAIL_PETALS = [
  { z: -30.0, rot: -0.085, tilt: -14, len: 0.94, x0: 0.30, w: 9.0 },
  { z: -10.0, rot: -0.022, tilt: 17, len: 1.00, x0: 0.24, w: 9.5 },
  { z: 10.0, rot: 0.030, tilt: -15, len: 0.91, x0: 0.34, w: 9.5 },
  { z: 30.0, rot: 0.092, tilt: 12, len: 0.97, x0: 0.28, w: 9.0 },
];
function buildSail(b, S, rnd) {
  const A = S.a * D2R;
  const L = S.len;
  frameAt(b, A, R_OUT, 0, () => {
    // hinge base + brass collar
    box(b, 15, 17, 19, CL.hull, M.hull, { topCol: CL.cornice, bottomCol: CL.hull2 });
    b.push(T(0.2, 0, 11));
    cylinder(b, 10, 4.2, 4.2, 2.4, CL.brass, M.brass, { y0: -1.2, caps: true });
    b.pop();
    b.push(T(0.2, 0, -11));
    cylinder(b, 10, 4.2, 4.2, 2.4, CL.brass, M.brass, { y0: -1.2, caps: true });
    b.pop();
    b.push(T(7.4, 0, 0));
    box(b, 1.4, 6.0, 22, CL.brass, M.brass);
    b.pop();
    // main truss: two parallel beams + cross braces
    const x0 = 9, x1 = L * 0.94;
    for (const sz of [-1, 1]) {
      bar3(b, [x0, 0, sz * 5.4], [x1, 0, sz * 5.4], 3.0, 3.0, CL.hull2, M.hull);
      bar3(b, [x0, -1.0, sz * 5.4], [x1, -1.0, sz * 5.4], 0.7, 0.7, CL.brass, M.brass);
    }
    const bays = 9;
    for (let k = 0; k <= bays; k++) {
      const x = lerp(x0, x1, k / bays);
      bar3(b, [x, 0, -5.4], [x, 0, 5.4], 2.2, 2.2, CL.brassDark, M.brassD);
      if (k < bays) {
        const xd = lerp(x0, x1, (k + 1) / bays);
        bar3(b, [x, 0, -5.4], [xd, 0, 5.4], 0.75, 0.75, CL.steel, M.panel);
        bar3(b, [x, 0, 5.4], [xd, 0, -5.4], 0.75, 0.75, CL.steel, M.panel);
      }
    }
    // petal panels: four wings per sail, staggered in root radius, yaw and cup
    for (const pt of SAIL_PETALS) {
      const px0 = L * pt.x0, px1 = L * pt.len;
      b.push(T(0, 0, pt.z));
      b.push(RY(pt.rot));
      // spar / hinge arm from the truss out to the petal root
      bar3(b, [8, 0, 0], [px0 + 1.4, 0, 0], 1.9, 1.5, CL.sailEdge, M.panel);
      b.push(T(px0 + 1.0, 0, 0));
      cylinder(b, 8, 2.1, 1.8, 2.0, CL.brass, M.brass, { y0: -1.0, caps: true });
      b.pop();
      // the photovoltaic petal
      sailPanel(b, px0 + 2.4, px1, -pt.w, pt.w, pt.tilt, rnd);
      // lit tip edge + outer spar so the petal has a bright outline from far away
      const tipY = -Math.tan(pt.tilt) * px1;
      b.quad([px1, 0.5, -pt.w], [px1 + 0.6, 0.5, -pt.w], [px1 + 0.6, 0.5, pt.w], [px1, 0.5, pt.w], CL.grid, M.band, [1, 0, 0]);
      bar3(b, [px1, 0.1, -pt.w], [px1, 0.1, pt.w], 0.5, 0.5, CL.brassHi, M.brass);
      void tipY;
      b.pop();
      b.pop();
    }
    // tension cables from the truss tip back to the hinge root
    for (const sz of [-1, 1]) {
      const mid = [[x1 * 0.55, 0, sz * 5.4], [x1, 0, sz * 5.4]];
      tubePath(b, [[8, 2.4, sz * 6.0], ...mid], 0.34, 4, CL.brassDark, M.brassD, { caps: false });
      tubePath(b, [[8, -2.4, sz * 6.0], [x1 * 0.55, 2.4, sz * 5.4], [x1, 0, sz * 5.4]], 0.26, 4, CL.brassDark, M.brassD, { caps: false });
    }
    // tip beacon
    b.push(T(x1 + 2.2, 3.2, 0));
    cylinder(b, 6, 0.9, 0.5, 6.0, CL.steel, M.panel, { y0: -3, caps: false });
    b.pop();
    b.push(T(x1 + 2.2, 6.4, 0));
    sphere(b, 1.2, CL.warm, M.beacon, { rings: 3, seg: 6, jitter: 0 });
    b.pop();
    // root gantry + service box
    b.push(T(L * 0.16, -3.6, 0));
    box(b, 9, 4.4, 12, CL.hull3, M.hull);
    b.pop();
  });
}
function buildSails(b, rnd) {
  for (const S of SAILS) buildSail(b, S, rnd);
}

// ============================================================================
// 6. RADIATORS — eight tilted fin stacks on the roof and eight under the floor.
// ============================================================================
function buildRadiator(b, A, up, rnd) {
  const yy = up > 0 ? HALF_H : -HALF_H;
  frameAt(b, A, 624, yy, () => {
    // mount
    box(b, 16, 4.0, 22, CL.hull3, M.hull, { topCol: CL.hull2 });
    b.push(T(0, up * 2.6, 0));
    box(b, 12, 3.0, 16, CL.brassDark, M.brassD);
    b.pop();
    // five parallel fins, leaning outward
    for (let k = 0; k < 5; k++) {
      b.push(T(2.0, up * 4.0, -12 + k * 6.0));
      b.push(RX(0));
      b.push(m4.rotZ(-up * 0.95));
      box(b, 20, 0.8, 16.5, k % 2 ? CL.tank : mulc(CL.tank, 0.9), M.panel, { topCol: CL.hull });
      b.pop();
      b.pop();
      b.pop();
    }
    // coolant pipes along the base
    for (const sz of [-1, 1]) {
      tubePath(b, [[-7, up * 2.2, sz * 9], [2, up * 2.2, sz * 9], [8, up * 3.4, sz * 9]], 0.75, 5, CL.pipe, M.panel, { caps: true });
    }
    // pipe bundles running back to the band
    bar3(b, [-8, up * 3.0, 6], [-19, up * 0.4, 12], 1.2, 1.2, CL.pipe, M.panel);
    bar3(b, [-8, up * 3.0, -6], [-19, up * 0.4, -12], 1.2, 1.2, CL.pipe, M.panel);
  });
}
function buildRadiators(b, rnd) {
  const angles = [12, 44, 78, 112, 146, 178, 214, 246, 292, 318, 336, 356];
  for (let k = 0; k < angles.length; k++) {
    const a = angles[k] * D2R;
    if (nearRib(a, 3.2)) continue;
    buildRadiator(b, a, 1, rnd);
    if (k % 2 === 0) buildRadiator(b, a + 8 * D2R, -1, rnd);
  }
}

// ============================================================================
// 7. MASTS / BEACONS — eight slim antenna masts on the roof with dish heads.
// ============================================================================
const MASTS = [15, 58, 122, 163, 198, 238, 318, 348];
function buildMast(b, A, rnd) {
  frameAt(b, A, 618, HALF_H, () => {
    box(b, 8, 3.6, 8, CL.hull3, M.hull, { topCol: CL.hull2 });
    // three-stage tapered mast
    let x = 0;
    const H1 = 20, H2 = 16, H3 = 14;
    bar3(b, [0, 0, 0], [0, H1, 0], 2.6, 2.6, CL.hull2, M.hull);
    bar3(b, [0, H1, 0], [0, H1 + H2, 0], 1.7, 1.7, CL.hull, M.hull);
    bar3(b, [0, H1 + H2, 0], [0, H1 + H2 + H3, 0], 1.0, 1.0, CL.steel, M.panel);
    // cross arms + dishes
    for (const hy of [H1 * 0.65, H1 + H2 * 0.5]) {
      b.push(T(0, hy, 0));
      box(b, 11, 0.9, 0.9, CL.hull, M.hull);
      b.pop();
      for (const sx of [-1, 1]) {
        b.push(T(sx * 5.6, hy + 0.7, 0));
        lathe(b, [[0.2, 0], [2.6, 0.7], [3.3, 1.9], [3.5, 2.4]], 8, CL.tank, M.panel, { smooth: false });
        b.pop();
      }
    }
    // ladder rungs
    for (let k = 0; k < 9; k++) {
      b.push(T(1.5, 2 + k * 3.4, 0));
      box(b, 0.5, 0.18, 2.4, CL.brassDark, M.brassD);
      b.pop();
    }
    // beacon head
    b.push(T(0, H1 + H2 + H3 + 1.2, 0));
    sphere(b, 1.5, CL.warn, M.warn, { rings: 3, seg: 6, jitter: 0 });
    b.pop();
    // guy wires
    for (const a of [0, 2.1, 4.2]) {
      const p1 = [Math.cos(a) * 9, 2, Math.sin(a) * 9];
      tubePath(b, [[0, H1 + H2, 0], [Math.cos(a) * 2, H1 * 0.8, Math.sin(a) * 2], p1], 0.16, 4, CL.steelD, M.panel, { caps: false });
    }
    void x;
    void rnd;
  });
}
function buildMasts(b, rnd) {
  for (const deg of MASTS) buildMast(b, deg * D2R, rnd);
}

// ============================================================================
// 8. SERVICE GREEBLES — roof deck, underdeck and the waist band.  Density is
//    tripled within +-45 deg of the close-up viewpoints (about 11 deg and 270 deg).
// ============================================================================
function busyScale(A) {
  let d = Math.min(angDist(A, 11 * D2R), angDist(A, DOCK_A));
  if (d < 40 * D2R) return 3;
  if (d < 80 * D2R) return 2;
  return 1;
}
// four roof pavilions: a small Beaux-Arts pavilion (plinth, colonnade, shallow
// dome, brass finial) so the roof skyline is not just boxes
function buildPavilion(b, A, rnd) {
  frameAt(b, A, 604, HALF_H, () => {
    box(b, 38, 4.2, 26, CL.hull2, M.hull, { topCol: CL.hull });
    b.push(T(0, 2.1, 0));
    box(b, 34, 1.2, 22, CL.brassDark, M.brassD);
    b.pop();
    // eight columns
    for (const ox of [-13, -7.5, 7.5, 13]) {
      for (const oz of [-8.4, 8.4]) {
        b.push(T(ox, 6.0, oz));
        cylinder(b, 8, 1.25, 1.05, 12.0, CL.hull, M.hullHi, { y0: 0, caps: false });
        b.pop();
        b.push(T(ox, 12.4, oz));
        box(b, 3.0, 1.1, 3.0, CL.brass, M.brass);
        b.pop();
      }
    }
    // entablature + dome drum
    b.push(T(0, 12.3, 0));
    box(b, 35, 2.6, 23, CL.hull, M.hull, { topCol: CL.cornice, bottomCol: CL.brassDark });
    b.pop();
    b.push(T(0, 13.6, 0));
    box(b, 30, 1.0, 18, CL.brass, M.brass);
    b.pop();
    // shallow bronze dome
    b.push(T(0, 14.1, 0));
    // note: the profile stops at r=0.9 (not 0) — a lathe that closes on the axis
    // produces degenerate triangles, which the check rejects.
    lathe(b, [[15.0, 0], [13.4, 1.6], [10.4, 3.6], [6.2, 5.0], [2.6, 5.6], [0.9, 5.8]], 20, CL.brassDark, M.brassD, { smooth: false });
    b.pop();
    // lantern + finial
    b.push(T(0, 19.9, 0));
    cylinder(b, 8, 1.5, 1.3, 3.0, CL.hull, M.hull, { y0: 0, caps: false });
    b.pop();
    b.push(T(0, 22.9, 0));
    sphere(b, 1.1, CL.brassHi, M.brass, { rings: 3, seg: 6, jitter: 0 });
    b.pop();
    // warm rope lights on the cornice (read from the panorama)
    for (const oz of [-11.6, 11.6]) {
      b.quad([-16, 13.7, oz], [16, 13.7, oz], [16, 13.7 + 0.35, oz], [-16, 13.7 + 0.35, oz], CL.warm, M.band, [0, 0.1, oz > 0 ? 1 : -1]);
    }
    // side stairs
    for (const oz of [-12.6, 12.6]) {
      b.push(T(0, 2.1, oz));
      box(b, 7, 2.0, 2.2, CL.hull3, M.hull);
      b.pop();
    }
    void rnd;
  });
}
function buildPavilions(b, rnd) {
  for (const deg of [62, 148, 212, 298]) buildPavilion(b, deg * D2R, rnd);
}

function deckGreebles(b, sec, rnd) {
  const Y = HALF_H;
  // ---- continuous panel joints on the roof deck
  for (let s = 0; s < SEG; s++) {
    for (let k = 0; k < SUB; k++) {
      const a0 = s * SECT + (k * SECT) / SUB, a1 = a0 + SECT / SUB;
      for (const rr of [568, 596, 624]) {
        if (angDist((a0 + a1) / 2, DOCK_A) < DOCK_HA + 0.02) continue;
        b.quad(P(a0, rr, Y + 0.10), P(a1, rr, Y + 0.10), P(a1, rr + 0.55, Y + 0.10), P(a0, rr + 0.55, Y + 0.10), CL.seam, M.seal, [0, 1, 0]);
      }
    }
    const ab = s * SECT;
    if (!nearRib(ab, 0.6)) {
      b.quad(P(ab, 560, Y + 0.10), P(ab, 636, Y + 0.10), P(ab, 636, Y + 0.10), P(ab, 560, Y + 0.10), CL.seam, M.seal, [0, 1, 0]);
    }
  }
  // ---- radial panel joints (thin raised ribs)
  for (let s = 0; s < SEG; s += 2) {
    const ab = s * SECT;
    if (nearRib(ab, 0.8) || angDist(ab, DOCK_A) < DOCK_HA + 0.02) continue;
    b.push(T(Math.cos(ab) * 600, Y + 0.16, Math.sin(ab) * 600));
    b.push(RY(-ab));
    box(b, 76, 0.34, 0.5, CL.seam, M.seal);
    b.pop();
    b.pop();
  }
  // ---- pipe runs around the deck
  const pipeR = [578, 612];
  for (const rr of pipeR) {
    const pts = [];
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * TAU;
      if (a > A0 + 0.02 && a < A1 - 0.02) { if (pts.length > 1) tubePath(b, pts.slice(), 0.6, 4, CL.pipe, M.panel, { caps: false }); pts.length = 0; continue; }
      pts.push(P(a, rr, Y + 1.5));
    }
    if (pts.length > 1) tubePath(b, pts, 0.6, 4, CL.pipe, M.panel, { caps: false });
  }
  // ---- tanks, hatches, deck houses, dishes (density follows the viewpoint)
  for (let s = 0; s < SEG; s++) {
    const A = (s + 0.5) * SECT;
    const busy = busyScale(A);
    if (nearRib(A, 0.9)) continue;
    const n = busy;
    for (let k = 0; k < n; k++) {
      const rr = 566 + rnd() * 68;
      const aa = A + (rnd() - 0.5) * SECT * 0.8;
      const kind = rnd();
      if (kind < 0.30) {
        // cryo tank
        frameAt(b, aa, rr, Y, () => {
          box(b, 9, 1.2, 9, CL.hull3, M.hull);
          b.push(T(0, 4.2, 0));
          cylinder(b, 8, 3.6, 3.2, 7.2, CL.tank, M.panel, { y0: 0, caps: true });
          b.push(T(0, 3.2, 0));
          box(b, 7.6, 0.9, 7.6, CL.brassDark, M.brassD);
          b.pop();
          b.pop();
        });
      } else if (kind < 0.58) {
        // hatch plate
        frameAt(b, aa, rr, Y, () => {
          box(b, 8.5, 1.4, 7.0, CL.hatch, M.panel, { topCol: CL.hull2 });
          box(b, 2.0, 0.5, 2.0, CL.brass, M.brass);
        });
      } else if (kind < 0.78) {
        // service deck house
        frameAt(b, aa, rr, Y, () => {
          box(b, 13, 5.2, 9, CL.hull2, M.hull, { topCol: CL.cornice });
          b.push(T(0, 2.6, 0));
          box(b, 14, 0.8, 10, CL.brassDark, M.brassD);
          b.pop();
        });
      } else {
        // dish
        frameAt(b, aa, rr, Y, () => {
          b.push(T(0, 2.2, 0));
          cylinder(b, 6, 0.9, 0.7, 4.4, CL.steel, M.panel, { y0: 0, caps: false });
          b.pop();
          b.push(T(0, 5.0, 0));
          b.push(RX(-0.6));
          lathe(b, [[0.2, 0], [3.4, 0.5], [4.6, 1.6], [4.9, 2.1]], 10, CL.tank, M.panel, { smooth: false });
          b.pop();
          b.pop();
        });
      }
    }
  }
  // ---- rails along both roof edges (the deck reads inhabited at close range)
  for (const rr of [558.5, 641.0]) {
    for (let s = 0; s < SEG; s++) {
      const a0 = s * SECT, a1 = a0 + SECT;
      const am = (a0 + a1) / 2;
      if (am > A0 && am < A1) continue;
      // top rail + mid rail as thin quads, one post per sector
      b.quad(P(a0, rr, Y + 1.65), P(a1, rr, Y + 1.65), P(a1, rr, Y + 1.85), P(a0, rr, Y + 1.85), CL.brass, M.brass, RAD(am));
      b.quad(P(a0, rr, Y + 0.95), P(a1, rr, Y + 0.95), P(a1, rr, Y + 1.08), P(a0, rr, Y + 1.08), CL.brassDark, M.brassD, RAD(am));
      b.quad(P(a0, rr, Y + 0.05), P(a0, rr, Y + 1.8), P(a0, rr + 0.16, Y + 1.8), P(a0, rr + 0.16, Y + 0.05), CL.steel, M.panel, TG(a0));
    }
  }
  // ---- monorail gantry: two circumferential rails with carriages
  for (const rr of [588, 618]) {
    for (let i = 0; i < 24; i++) {
      const a0 = (i / 24) * TAU, a1 = ((i + 1) / 24) * TAU;
      const am = (a0 + a1) / 2;
      if (am > A0 && am < A1) continue;
      bar3(b, P(a0, rr, Y + 3.0), P(a1, rr, Y + 3.0), 1.1, 0.9, CL.steel, M.panel);
    }
  }
  for (let k = 0; k < 4; k++) {
    const A = (k / 4) * TAU + 0.4;
    frameAt(b, A, 588, Y + 3.4, () => {
      box(b, 5.0, 2.6, 7.0, CL.hull3, M.hull, { topCol: CL.brassDark });
      box(b, 1.6, 1.6, 1.6, CL.warm, M.band);
    });
  }
  // ---- luminous rim lines under the band: without them the silhouette from
  //      below (view 8) is one black band
  for (let s = 0; s < SEG; s++) {
    const a0 = s * SECT, a1 = a0 + SECT;
    const am = (a0 + a1) / 2;
    if (am > A0 && am < A1) continue;
    b.quad(P(a0, 640.0, -HALF_H - 0.06), P(a1, 640.0, -HALF_H - 0.06), P(a1, 640.6, -HALF_H - 0.06), P(a0, 640.6, -HALF_H - 0.06), CL.warm, M.band, [0, -1, 0]);
    b.quad(P(a0, 561.0, -HALF_H - 0.06), P(a1, 561.0, -HALF_H - 0.06), P(a1, 561.5, -HALF_H - 0.06), P(a0, 561.5, -HALF_H - 0.06), CL.grid, M.band, [0, -1, 0]);
  }
  // concentric service-light rings on the bottom annulus
  for (const rr of [575, 595, 615, 635]) {
    for (let s = 0; s < SEG; s++) {
      const a0 = s * SECT, a1 = a0 + SECT;
      const am = (a0 + a1) / 2;
      if (am > A0 && am < A1) continue;
      if (nearRib(am, 0.7)) continue;
      b.quad(P(a0, rr, -HALF_H - 0.08), P(a1, rr, -HALF_H - 0.08), P(a1, rr + 0.45, -HALF_H - 0.08), P(a0, rr + 0.45, -HALF_H - 0.08), mulc(CL.warm, 0.8), M.band, [0, -1, 0]);
    }
  }
  // underdeck service modules, tanks and pipe runs
  for (const rr of [572, 598, 624]) {
    for (let s = 0; s < SEG; s += 3) {
      const A = ((s + 0.5) * SECT);
      if (nearRib(A, 1.4) || angDist(A, DOCK_A) < DOCK_HA + 0.05) continue;
      if (rnd() < 0.42) continue;
      frameAt(b, A, rr, -HALF_H, () => {
        b.push(RX(PI));
        const k = rnd();
        if (k < 0.45) {
          box(b, 8, 4.0, 6, CL.hull3, M.hull);
          box(b, 4.2, 1.2, 3.0, CL.brassDark, M.brassD);
        } else if (k < 0.75) {
          cylinder(b, 7, 2.6, 2.2, 6.0, CL.tank, M.panel, { y0: 0, caps: true });
        } else {
          box(b, 10, 2.0, 3.0, CL.steel, M.panel);
          box(b, 6, 1.0, 1.6, CL.warm, M.band);
        }
        b.pop();
      });
    }
  }
  for (const rr of [584, 614]) {
    let pts = [];
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * TAU;
      if (a > A0 + 0.02 && a < A1 - 0.02) { if (pts.length > 1) tubePath(b, pts, 0.55, 4, CL.pipe, M.panel, { caps: false }); pts = []; continue; }
      pts.push(P(a, rr, -HALF_H - 1.6));
    }
    if (pts.length > 1) tubePath(b, pts, 0.55, 4, CL.pipe, M.panel, { caps: false });
  }
  // ---- under-deck (bottom face): fewer, cheaper details
  for (let s = 0; s < SEG; s += 2) {
    const A = (s + 0.5) * SECT;
    if (nearRib(A, 1.2) || angDist(A, DOCK_A) < DOCK_HA + 0.03) continue;
    if (rnd() < 0.45) continue;
    frameAt(b, A, 580 + rnd() * 56, -HALF_H, () => {
      b.push(RX(PI));
      box(b, 9, 2.0, 7, CL.hull3, M.hull);
      b.pop();
    });
  }
  for (let s = 0; s < SEG; s++) {
    const a0 = s * SECT, a1 = a0 + SECT;
    if (angDist((a0 + a1) / 2, DOCK_A) < DOCK_HA + 0.02) continue;
    b.quad(P(a0, 570, -HALF_H - 0.1), P(a1, 570, -HALF_H - 0.1), P(a1, 571, -HALF_H - 0.1), P(a0, 571, -HALF_H - 0.1), CL.seam, M.seal, [0, -1, 0]);
    b.quad(P(a0, 620, -HALF_H - 0.1), P(a1, 620, -HALF_H - 0.1), P(a1, 621, -HALF_H - 0.1), P(a0, 621, -HALF_H - 0.1), CL.seam, M.seal, [0, -1, 0]);
  }
  void sec;
}
function waistGreebles(b, sec, rnd) {
  const R = O_WAIST;
  // continuous seam lines
  for (let s = 0; s < SEG; s++) {
    const a0 = s * SECT, a1 = a0 + SECT;
    if (angDist((a0 + a1) / 2, DOCK_A) < DOCK_HA + 0.02) continue;
    for (const yy of [-3.6, 0.2, 4.0]) {
      b.quad(P(a0, R + 0.08, yy), P(a1, R + 0.08, yy), P(a1, R + 0.08, yy + 0.28), P(a0, R + 0.08, yy + 0.28), CL.seam, M.seal, RAD((a0 + a1) / 2));
    }
    // vertical joints
    b.quad(P(a0, R + 0.08, -6.4), P(a0, R + 0.08, 6.4), P(a0, R + 0.30, 6.4), P(a0, R + 0.30, -6.4), CL.seam, M.seal, TG(a0));
  }
  // cyan light belt just under the brass edges (a continuous luminous line around
  // the whole 1.2 km band — the strongest read from the panorama)
  for (let s = 0; s < SEG; s++) {
    const a0 = s * SECT, a1 = a0 + SECT;
    const am = (a0 + a1) / 2;
    if (am > A0 && am < A1) continue;
    for (const yy of [6.05, -6.55]) {
      b.quad(P(a0, R + 0.16, yy), P(a1, R + 0.16, yy), P(a1, R + 0.16, yy + 0.45), P(a0, R + 0.16, yy + 0.45), CL.grid, M.band, RAD(am));
    }
  }
  // long pipe bundles around the waist
  for (const yy of [3.0, -3.0]) {
    let pts = [];
    for (let i = 0; i <= 96; i++) {
      const a = (i / 96) * TAU;
      if (a > A0 + 0.02 && a < A1 - 0.02) { if (pts.length > 1) tubePath(b, pts, 0.5, 4, CL.pipe, M.panel, { caps: false }); pts = []; continue; }
      pts.push(P(a, R + 1.1, yy));
    }
    if (pts.length > 1) tubePath(b, pts, 0.5, 4, CL.pipe, M.panel, { caps: false });
  }
  // hatches / boxes / vents, dense near the close-up views
  for (let s = 0; s < SEG; s++) {
    const A = (s + 0.5) * SECT;
    if (nearRib(A, 0.9) || angDist(A, DOCK_A) < DOCK_HA + 0.03) continue;
    const busy = busyScale(A);
    for (let k = 0; k < busy * 2; k++) {
      const aa = A + (rnd() - 0.5) * SECT * 0.7;
      const yy = -5.2 + rnd() * 10.4;
      const kind = rnd();
      frameAt(b, aa, R, yy, () => {
        if (kind < 0.4) {
          box(b, 1.8, 3.4, 5.0, CL.hatch, M.panel, { topCol: CL.hull2 });
          box(b, 0.6, 1.2, 1.2, CL.brass, M.brass);
        } else if (kind < 0.7) {
          box(b, 1.2, 2.2, 3.4, CL.hull3, M.hull);
        } else {
          box(b, 2.2, 1.4, 2.2, CL.pipe, M.panel);
        }
      });
    }
  }
  void sec;
}

// ============================================================================
// 9. INNER ARCADE — the walkway ring, pilasters and cyan light strips that give
//    the inner rim its layered reading (window + dark cavity + two cornices).
// ============================================================================
function buildArcade(b, sec, rnd) {
  // walkway: a ring balcony projecting into the hub void from the arcade
  const wIn = R_IN - 4.4, wOut = I_CAV - 0.4;
  const y0 = -WALKWAY_HALF, y1 = WALKWAY_HALF;
  for (let s = 0; s < SEG; s++) {
    const a0 = s * SECT, a1 = a0 + SECT;
    const am = (a0 + a1) / 2;
    if (am > A0 && am < A1) continue;
    // top / bottom / inner fascia
    b.quad(P(a0, wIn, y1), P(a1, wIn, y1), P(a1, wOut, y1), P(a0, wOut, y1), CL.hull2, M.hull, [0, 1, 0]);
    b.quad(P(a0, wIn, y0), P(a1, wIn, y0), P(a1, wOut, y0), P(a0, wOut, y0), CL.hull3, M.hull, [0, -1, 0]);
    b.quad(P(a0, wIn, y0), P(a1, wIn, y0), P(a1, wIn, y1), P(a0, wIn, y1), CL.brassDark, M.brassD, RAD(am));
    // brass rail line on the inner edge
    b.quad(P(a0, wIn - 0.1, y1 + 0.9), P(a1, wIn - 0.1, y1 + 0.9), P(a1, wIn - 0.1, y1 + 1.15), P(a0, wIn - 0.1, y1 + 1.15), CL.brass, M.brass, RAD(am));
  }
  // rail posts
  for (let s = 0; s < SEG; s += 4) {
    const A = s * SECT;
    if (angDist(A, DOCK_A) < DOCK_HA + 0.03) continue;
    frameAt(b, A, wIn - 0.3, y1, () => box(b, 0.5, 2.1, 0.5, CL.brassDark, M.brassD));
  }
  // pilasters at the arcade mouth
  for (let s = 0; s < SEG; s++) {
    const A = s * SECT;
    if (angDist(A, DOCK_A) < DOCK_HA + 0.03) continue;
    const dA = 0.9 / R_IN;
    b.quad(P(A - dA, R_IN - 0.9, -29.0), P(A + dA, R_IN - 0.9, -29.0), P(A + dA, R_IN - 0.9, 29.0), P(A - dA, R_IN - 0.9, 29.0), mulc(C.ivory, 0.97 * sec.shade[s]), M.hull, RAD(A));
    b.quad(P(A - dA, R_IN - 0.9, -29.0), P(A + dA, R_IN - 0.9, -29.0), P(A + dA, R_IN, -29.0), P(A - dA, R_IN, -29.0), CL.hull3, M.panel, [0, -1, 0]);
  }
  // continuous light lines around the inner rim: cyan under the arcade ceiling,
  // warm on both cornice fascias and along the walkway edge.  These are what stop
  // the inner circle from reading as a black band in the panorama.
  for (let s = 0; s < SEG; s++) {
    const a0 = s * SECT, a1 = a0 + SECT;
    const am = (a0 + a1) / 2;
    if (am > A0 && am < A1) continue;
    const N = RAD(am);
    const inner = mulc(N, -1);
    b.quad(P(a0, I_CAV - 1.2, 28.9), P(a1, I_CAV - 1.2, 28.9), P(a1, I_CAV - 1.2, 28.1), P(a0, I_CAV - 1.2, 28.1), CL.grid, M.band, [0, -1, 0]);
    // warm uplight on the upper and lower inner cornices
    b.quad(P(a0, I_EAVE + 0.06, 31.4), P(a1, I_EAVE + 0.06, 31.4), P(a1, I_EAVE + 0.06, 32.4), P(a0, I_EAVE + 0.06, 32.4), CL.warm, M.band, inner);
    b.quad(P(a0, I_EAVE + 0.06, -32.4), P(a1, I_EAVE + 0.06, -32.4), P(a1, I_EAVE + 0.06, -31.4), P(a0, I_EAVE + 0.06, -31.4), CL.warm, M.band, inner);
    // warm strip along the arcade floor (behind the walkway)
    b.quad(P(a0, I_CAV - 0.7, -28.9), P(a1, I_CAV - 0.7, -28.9), P(a1, I_CAV - 0.7, -28.2), P(a0, I_CAV - 0.7, -28.2), CL.warm, M.band, [0, 1, 0]);
  }
  // warm line on the walkway's leading edge (the gallery uplight)
  for (let s = 0; s < SEG; s++) {
    const a0 = s * SECT, a1 = a0 + SECT;
    const am = (a0 + a1) / 2;
    if (am > A0 && am < A1) continue;
    b.quad(P(a0, wIn - 0.05, -0.45), P(a1, wIn - 0.05, -0.45), P(a1, wIn - 0.05, 0.45), P(a0, wIn - 0.05, 0.45), CL.warm, M.band, RAD(am));
    b.quad(P(a0, I_CAV - 2.4, -28.85), P(a1, I_CAV - 2.4, -28.85), P(a1, I_CAV - 2.4, -28.25), P(a0, I_CAV - 2.4, -28.25), CL.grid, M.band, [0, 1, 0]);
  }
  void rnd;
}

// ============================================================================
// 10. LIGHTS / BILLBOARDS (max 8 point lights, range 150..400 m)
// ============================================================================
function buildLights(ctx) {
  const P_ = (aDeg, r, y) => P(aDeg * D2R, r, y);
  // dock: mouth flood + tunnel interior (keyWarm, not amber: the dock must not
  // turn into an orange box — the ivory hull keeps its colour)
  ctx.points.push({ p: [0, 8, DOCK_Z - 14], col: C.keyWarm, range: 250, int: 0.85 });
  ctx.points.push({ p: [0, 20, DOCK_Z + 54], col: C.warmGlow, range: 210, int: 0.8 });
  // four mast beacons (red / warm white)
  const mastLights = [
    { i: 0, col: C.lampRed, int: 1.2 },
    { i: 2, col: C.warmGlow, int: 1.15 },
    { i: 3, col: C.lampRed, int: 1.1 },
    { i: 6, col: C.warmGlow, int: 1.2 },
  ];
  for (const ml of mastLights) {
    const a = MASTS[ml.i] * D2R;
    ctx.points.push({ p: P(a, 618, HALF_H + 52.4), col: ml.col, range: 270, int: ml.int });
  }
  // sail hinge glow (cyan)
  ctx.points.push({ p: P(90 * D2R, R_OUT + 4, 6), col: C.cyanGlow, range: 180, int: 0.9 });
  // tongue deck flood: keeps the 150 m approach platform readable from view 3
  ctx.points.push({ p: [0, -16, TONGUE_Z1 + 46], col: C.keyWarm, range: 260, int: 1.0 });
  // static halos on the strongest emitters
  for (const ml of mastLights) {
    const a = MASTS[ml.i] * D2R;
    ctx.lanterns.push({ p: P(a, 618, HALF_H + 52.4), size: 11, rot: 0, alpha: 0.55, shape: 1, col: ml.col });
  }
  ctx.lanterns.push({ p: [0, 0, DOCK_Z - 4], size: 26, rot: 0, alpha: 0.35, shape: 1, col: C.warmGlow });
  // interior haze: the open port reads as a warm hangar from 300 m out
  ctx.lanterns.push({ p: [0, -2, DOCK_Z + 26], size: 34, rot: 0, alpha: 0.42, shape: 1, col: C.warmGlow });
  ctx.lanterns.push({ p: [0, 2, DOCK_Z + 60], size: 46, rot: 0, alpha: 0.34, shape: 1, col: C.amber });
  ctx.lanterns.push({ p: [0, 2, -R_IN - 4], size: 40, rot: 0, alpha: 0.30, shape: 1, col: C.warmGlow });
  ctx.lanterns.push({ p: [0, 4, DOCK_Z + 40], size: 18, rot: 0, alpha: 0.30, shape: 1, col: C.amber });
  ctx.lanterns.push({ p: P(90 * D2R, R_OUT + 6, 6), size: 9, rot: 0, alpha: 0.35, shape: 1, col: C.cyanGlow });
}

// ============================================================================
// 11. ENTRY
// ============================================================================
export function buildStationRing(b, ctx) {
  const rnd = mulberry32(SEED);
  const t0 = () => b.i.length / 3;
  const mark = { shell: t0(), band: 0, windows: 0, ribs: 0, dock: 0, sails: 0, radiators: 0, masts: 0, greebles: 0 };

  // per-sector colour jitter: neighbours differ by .975..1.0 so the 1.2 km band
  // never reads as one plastic tube
  const shade = new Float64Array(SEG);
  const tint = new Uint8Array(SEG);
  for (let s = 0; s < SEG; s++) {
    shade[s] = 0.971 + 0.029 * rnd();
    tint[s] = rnd() < 0.16 ? 1 : 0;
  }
  const sec = { shade, tint };

  buildShell(b, sec);
  mark.band = t0();

  const winStats = buildWindows(b, sec, rnd);
  mark.windows = t0();

  const ribs = buildRibs(b, rnd);
  mark.ribs = t0();

  buildDockFrame(b);
  buildDockTunnel(b, rnd);
  buildDockTongue(b, rnd);
  mark.dock = t0();

  buildSails(b, rnd);
  mark.sails = t0();

  buildRadiators(b, rnd);
  mark.radiators = t0();

  buildMasts(b, rnd);
  mark.masts = t0();

  buildPavilions(b, rnd);
  deckGreebles(b, sec, rnd);
  waistGreebles(b, sec, rnd);
  buildArcade(b, sec, rnd);
  buildLights(ctx);
  mark.greebles = t0();

  // hand the dock / rib contract to the other modules and to the check script
  ctx.props.ring = {
    dock: {
      angleDeg: ST.dockAngle,
      portalHalfW: +PORT_HW.toFixed(3),
      portalHalfH: PORT_HH,
      mouthZ: +DOCK_Z.toFixed(3),            // -646
      innerMouthZ: +(-R_IN).toFixed(3),      // -554
      tongueEndZ: +TONGUE_Z1.toFixed(3),     // -796
      tunnelDepth: +(R_OUT - R_IN).toFixed(3),
      halfAngleDeg: +(DOCK_HA / D2R).toFixed(3),
    },
    ringR: ST.ringR,
    ringW: ST.ringW,
    ringH: ST.ringH,
    sectors: RIB_N,
    ribs,
    sails: SAILS.map((s) => s.a),
    masts: MASTS.slice(),
    windows: {
      lit: winStats.warm + winStats.cyan,
      warm: winStats.warm,
      cyan: winStats.cyan,
      unlit: winStats.off,
      total: winStats.total,
    },
    triLog: {
      band: mark.band,
      windows: mark.windows - mark.band,
      ribs: mark.ribs - mark.windows,
      dock: mark.dock - mark.ribs,
      sails: mark.sails - mark.dock,
      radiators: mark.radiators - mark.sails,
      masts: mark.masts - mark.radiators,
      greebles: mark.greebles - mark.masts,
      total: mark.greebles,
    },
  };
}
