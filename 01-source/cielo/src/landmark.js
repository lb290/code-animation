// LANDMARK — the two hero landmarks: the gothic clock cathedral (left) and the
// giant white steel-and-glass conservatory palace (right). Both are seen from the
// terrace in the opening shot, so their silhouettes matter most.
// OWNER: agent "landmark".
//
//   buildLandmarks(b, ctx, rng) -> void
//
// Cathedral at L.cathedral: twin west spires ~118 m, a rose window, flying
// buttresses, and FOUR huge gold clock faces (the reference has a ring of gold
// clock dials around the tower). The glass palace at L.glassPalace: a 130 m white
// steel filigree dome, glass curtain walls, gold trim, an exterior spiral stair,
// roof gardens. Also the ferris wheel at L.ferris (r=40) and the little station
// canopy at L.station.
import { C } from './palette.js';
import { L } from './layout.js';
import { m4, TAU, norm } from './math.js';
import { B, box, cylinder, torus, rgb, mulc, mixc, bar3, lathe, sphere } from './geo.js';
import { MT, extrudeXY, tubePath, inFrame, star, ellipsoid } from './lib3d.js';
import { buildGlassGreenhouse, buildGlassRoofGarden } from './glass-greenhouse.js';
import { buildGlassOrbital } from './glass-orbital.js';
import { mesh } from './gl.js';
import { trs } from './actor.js';

// ---------------------------------------------------------------- local palette
const GLASS_DARK = rgb('#40608c');   // window panes in shade (blue, never black)
const GLASS_PANE = rgb('#9ecbe8');   // lit conservatory glass
const STEEL = rgb('#eef3f8');        // white painted steel filigree
const STEEL_SH = rgb('#c8d5e6');
const GOLD_DEEP = rgb('#c08f3c');
const IRON_LIT = rgb('#7e8ca6');     // painted iron, lifted out of black
const DOOR = rgb('#3d4c66');
const BLUE_DOOR = rgb('#2a3a6e');   // R5: inset panels of the glass palace doors

// limestone reads cream even on its shadow side (the scene key light comes from
// behind the terrace, so the facades the visitor sees are the shaded ones)
const M_STONE = [0.08, 0.10];
const M_MARBLE = [0.07, 0.20];
const M_GOLD = MT.gold;
const M_SLATE = [0.0, 0.30];
const M_GLASS = [0.15, 0.90];
const M_GLOW = [0.55, 0.22];
const M_METAL = MT.metal;
const M_IRON = [0.045, 0.42];   // structural iron: lifted so it never goes to black
const M_STEEL = [0.04, 0.34];   // satin white steel: filigree, no blown specular
const M_MATTE = MT.matte;
const SPG = C.stonePale;    // R6 helper modules (buildGlassPalace has its own SP alias)
const M_GOLD_B = [0.34, 0.72];

// ---------------------------------------------------------------- tiny helpers
const T = (x, y, z) => m4.translate([x, y, z]);
const RY = (a) => m4.rotY(a);

function put(b, x, y, z, fn) { b.push(T(x, y, z)); fn(); b.pop(); }
function putR(b, x, y, z, yaw, fn) { b.push(T(x, y, z)); b.push(RY(yaw)); fn(); b.pop(); b.pop(); }

// annulus sector in the XY plane, extruded a little along Z (faces +Z)
function ringZ(b, cx, cy, z, R, w, d, col, mat, seg = 12, a0 = 0, a1 = TAU) {
  const rI = Math.max(0.02, R - w / 2), rO = R + w / 2;
  const zf = z + d / 2, zb = z - d / 2;
  const NF = [0, 0, 1], NB = [0, 0, -1];
  for (let i = 0; i < seg; i++) {
    const t0 = a0 + (a1 - a0) * (i / seg), t1 = a0 + (a1 - a0) * ((i + 1) / seg);
    const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
    const o0 = [cx + c0 * rO, cy + s0 * rO], o1 = [cx + c1 * rO, cy + s1 * rO];
    const i0 = [cx + c0 * rI, cy + s0 * rI], i1 = [cx + c1 * rI, cy + s1 * rI];
    b.quad([i0[0], i0[1], zf], [o0[0], o0[1], zf], [o1[0], o1[1], zf], [i1[0], i1[1], zf], col, mat, NF);
    b.quad([i1[0], i1[1], zb], [o1[0], o1[1], zb], [o0[0], o0[1], zb], [i0[0], i0[1], zb], mulc(col, 0.84), mat, NB);
  }
}

// flat disc in the XY plane facing +Z
function discZ(b, cx, cy, z, r, col, mat, seg = 16) {
  const N = [0, 0, 1];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    b.tri([cx, cy, z], [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, z],
      [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, z], col, mat, N, N, N);
  }
}

// horizontal open band ring
function band(b, y, r, h, col, mat, seg = 24, x = 0, z = 0) {
  b.push(T(x, y, z));
  cylinder(b, seg, r, r, h, col, mat, { caps: false, y0: -h / 2 });
  b.pop();
}

// cone / spire, base at y0, apex up
function spire(b, r, h, y0, col, mat, seg = 8) {
  b.push(T(0, y0, 0));
  cylinder(b, seg, r, 0.12, h, col, mat, { caps: true, y0: 0 });
  b.pop();
}

// round-headed window: local bottom centre at origin, facing +Z
function roundWin(b, w, h, frameCol, glassCol, opts = {}) {
  const hw = w / 2, spring = Math.max(0.2, h - hw);
  const gmat = opts.gmat || M_GLASS, fmat = opts.fmat || M_STONE;
  const z = opts.z ?? 0, fw = opts.fw ?? Math.min(0.38, Math.max(0.16, w * 0.12));
  const N = [0, 0, 1];
  b.quad([-hw, 0, z], [hw, 0, z], [hw, spring, z], [-hw, spring, z], glassCol, gmat, N);
  const as = 5;
  for (let i = 0; i < as; i++) {
    const a0 = Math.PI * (i / as), a1 = Math.PI * ((i + 1) / as);
    b.tri([0, spring, z], [Math.cos(a0) * hw, spring + Math.sin(a0) * hw, z],
      [Math.cos(a1) * hw, spring + Math.sin(a1) * hw, z], glassCol, gmat, N, N, N);
  }
  const zf = z + 0.14;
  b.quad([-hw - fw, 0, zf], [-hw, 0, zf], [-hw, spring, zf], [-hw - fw, spring, zf], frameCol, fmat, N);
  b.quad([hw, 0, zf], [hw + fw, 0, zf], [hw + fw, spring, zf], [hw, spring, zf], frameCol, fmat, N);
  for (let i = 0; i < as; i++) {
    const a0 = Math.PI * (i / as), a1 = Math.PI * ((i + 1) / as);
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    b.quad([c0 * hw, spring + s0 * hw, zf], [c1 * hw, spring + s1 * hw, zf],
      [c1 * (hw + fw), spring + s1 * (hw + fw), zf], [c0 * (hw + fw), spring + s0 * (hw + fw), zf],
      frameCol, fmat, N);
  }
  b.quad([-hw - fw, -0.16, zf], [hw + fw, -0.16, zf], [hw + fw, 0, zf], [-hw - fw, 0, zf], mulc(frameCol, 1.04), fmat, N);
}

// pointed (lancet) window for the gothic work; local bottom centre, faces +Z
function lancet(b, w, h, frameCol, glassCol, opts = {}) {
  const hw = w / 2, sh = h * 0.66;
  const gmat = opts.gmat || M_GLASS, fmat = opts.fmat || M_STONE;
  const z = opts.z ?? 0, fw = opts.fw ?? Math.max(0.16, w * 0.10);
  const N = [0, 0, 1];
  b.quad([-hw, 0, z], [hw, 0, z], [hw, sh, z], [-hw, sh, z], glassCol, gmat, N);
  b.tri([-hw, sh, z], [hw, sh, z], [0, h, z], glassCol, gmat, N, N, N);
  const zf = z + 0.12;
  b.quad([-hw - fw, 0, zf], [-hw, 0, zf], [-hw, sh, zf], [-hw - fw, sh, zf], frameCol, fmat, N);
  b.quad([hw, 0, zf], [hw + fw, 0, zf], [hw + fw, sh, zf], [hw, sh, zf], frameCol, fmat, N);
  const dx = hw, dy = h - sh, L = Math.hypot(dx, dy) || 1, nx = -dy / L * fw, ny = dx / L * fw;
  b.quad([-hw, sh, zf], [0, h, zf], [nx, h + ny, zf], [-hw + nx, sh + ny, zf], frameCol, fmat, N);
  b.quad([hw, sh, zf], [0, h, zf], [-nx, h - ny, zf], [hw - nx, sh - ny, zf], frameCol, fmat, N);
  b.quad([-hw - fw, -0.14, zf], [hw + fw, -0.14, zf], [hw + fw, 0, zf], [-hw - fw, 0, zf], mulc(frameCol, 1.05), fmat, N);
}

// balustrade along X, bottom at y=0, facing +Z
function balustrade(b, len, h, col, mat = M_MARBLE, opts = {}) {
  const t = opts.t ?? 0.16, n = opts.n ?? Math.max(4, Math.round(len / 1.5));
  b.quad([-len / 2, 0, 0.1], [len / 2, 0, 0.1], [len / 2, h * 0.16, 0.1], [-len / 2, h * 0.16, 0.1], col, mat, [0, 0, 1]);
  b.quad([-len / 2, h - t, 0.1], [len / 2, h - t, 0.1], [len / 2, h, 0.1], [-len / 2, h, 0.1], mulc(col, 1.06), mat, [0, 0, 1]);
  b.quad([-len / 2, h, 0.1], [len / 2, h, 0.1], [len / 2, h, 0.55], [-len / 2, h, 0.55], col, mat, [0, 1, 0]);
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + ((i + 0.5) / n) * len;
    b.quad([x - 0.10, h * 0.16, 0.3], [x + 0.10, h * 0.16, 0.3], [x + 0.10, h - t, 0.3], [x - 0.10, h - t, 0.3], col, mat, [0, 0, 1]);
  }
}

// round column, base at y=0
function columnRound(b, h, r, col, mat, seg = 8) {
  put(b, 0, h * 0.03, 0, () => box(b, r * 3.0, h * 0.06, r * 3.0, mulc(col, 0.96), mat));
  put(b, 0, h * 0.5, 0, () => cylinder(b, seg, r, r * 0.87, h * 0.88, col, mat, { y0: -h * 0.44, caps: true }));
  put(b, 0, h * 0.95, 0, () => box(b, r * 2.5, h * 0.075, r * 2.5, mulc(col, 1.03), mat));
}

// big gold clock dial in the XY plane, facing +Z, centre at origin
function clockDial(b, R) {
  discZ(b, 0, 0, 0.06, R * 0.95, GLASS_DARK, [0.16, 0.6], 14);
  ringZ(b, 0, 0, 0.16, R, R * 0.20, 0.8, C.goldBright, M_GOLD, 14);
  ringZ(b, 0, 0, 0.10, R * 0.62, R * 0.05, 0.34, C.gold, M_GOLD, 10);
  const N = [0, 0, 1];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU, c = Math.cos(a), s = Math.sin(a), hl = R * 0.06;
    const r0 = R * 0.74, r1 = R * 0.87;
    b.quad([c * r0 - s * hl, s * r0 + c * hl, 0.28], [c * r0 + s * hl, s * r0 - c * hl, 0.28],
      [c * r1 + s * hl, s * r1 - c * hl, 0.28], [c * r1 - s * hl, s * r1 + c * hl, 0.28], C.goldBright, M_GOLD, N);
  }
  const hand = (ang, len, wd, zz) => {
    const c = Math.cos(ang), s = Math.sin(ang), hw = wd / 2;
    b.quad([-s * hw, c * hw, zz], [s * hw, -c * hw, zz], [c * len + s * hw, s * len - c * hw, zz],
      [c * len - s * hw, s * len + c * hw, zz], C.goldBright, M_GOLD, N);
  };
  hand(Math.PI * 0.72, R * 0.52, R * 0.10, 0.34);
  hand(Math.PI * 0.08, R * 0.78, R * 0.075, 0.38);
  discZ(b, 0, 0, 0.42, R * 0.11, C.goldBright, M_GLOW, 8);
}

// half-cylinder (barrel vault) along Z: spring line at y=yc, radius r
function barrelZ(b, r, yc, z0, z1, seg, col, mat, opts = {}) {
  const a0 = opts.a0 ?? 0, a1 = opts.a1 ?? Math.PI;
  const rows = opts.rows ?? 3;
  for (let i = 0; i < seg; i++) {
    const aa = a0 + (a1 - a0) * (i / seg), ab = a0 + (a1 - a0) * ((i + 1) / seg);
    const xa = Math.cos(aa) * r, ya = yc + Math.sin(aa) * r;
    const xb = Math.cos(ab) * r, yb = yc + Math.sin(ab) * r;
    const am = (aa + ab) / 2, N = [Math.cos(am), Math.sin(am), 0];
    const sh = 0.9 + 0.1 * Math.cos(am);
    for (let k = 0; k < rows; k++) {
      const za = z0 + (z1 - z0) * (k / rows), zb = z0 + (z1 - z0) * ((k + 1) / rows);
      b.quad([xa, ya, za], [xb, yb, za], [xb, yb, zb], [xa, ya, zb], mulc(col, sh), mat, N);
    }
  }
}

// transverse steel rib of a barrel vault at z (thin band on the outer surface)
function arcRibZ(b, r, yc, z, w, col, mat, seg = 10, a0 = 0, a1 = Math.PI) {
  for (let i = 0; i < seg; i++) {
    const aa = a0 + (a1 - a0) * (i / seg), ab = a0 + (a1 - a0) * ((i + 1) / seg);
    const am = (aa + ab) / 2, N = [Math.cos(am), Math.sin(am), 0];
    const P = (a, dr, dz) => [Math.cos(a) * (r + dr), yc + Math.sin(a) * (r + dr), z + dz];
    b.quad(P(aa, 0.30, -w / 2), P(ab, 0.30, -w / 2), P(ab, 0.30, w / 2), P(aa, 0.30, w / 2), col, mat, N);
    b.quad(P(aa, 0.02, -w / 2), P(ab, 0.02, -w / 2), P(ab, 0.30, -w / 2), P(aa, 0.30, -w / 2), mulc(col, 0.86), mat, N);
    b.quad(P(ab, 0.02, w / 2), P(aa, 0.02, w / 2), P(aa, 0.30, w / 2), P(ab, 0.30, w / 2), mulc(col, 0.86), mat, N);
  }
}

// fill a ring of world positions inside a local (rotY) frame
function frameMap(base, rot) {
  const ca = Math.cos(rot), sa = Math.sin(rot);
  return (lx, ly, lz) => [base[0] + ca * lx + sa * lz, ly, base[2] - sa * lx + ca * lz];
}

// ---- round 5: glass palace podium shell + skylight ridge -------------------
// The old podium was one solid 78x20x50 box. It is now a shell: the outer faces are
// exactly where they were, the cavity (local x +-35 / y 2.6..18.4 / z -48..-2) holds
// the hall built by glass-hall.js, the front wall has a real arched doorway and the
// roof deck carries a glazed skylight ridge over the nave.
function podiumFrontWall(b, col) {
  const z0 = -2, z1 = 0, HWD = 39, OHW = 5.0, SPR = 8.6, TOP = 20;
  const N = [0, 0, 1], NB = [0, 0, -1];
  const archY = (x) => SPR + Math.sqrt(Math.max(0, OHW * OHW - x * x));
  for (const sx of [-1, 1]) {
    const lo = Math.min(sx * OHW, sx * HWD), hi = Math.max(sx * OHW, sx * HWD);
    b.quad([lo, 0, z1], [hi, 0, z1], [hi, TOP, z1], [lo, TOP, z1], col, M_STONE, N);
    b.quad([hi, 0, z0], [lo, 0, z0], [lo, TOP, z0], [hi, TOP, z0], mulc(col, 0.84), M_STONE, NB);
    b.quad([sx * HWD, 0, z1], [sx * HWD, 0, z0], [sx * HWD, TOP, z0], [sx * HWD, TOP, z1], mulc(col, 0.88), M_STONE, [sx, 0, 0]);
    b.quad([sx * OHW, 0, z0], [sx * OHW, 0, z1], [sx * OHW, SPR, z1], [sx * OHW, SPR, z0], mulc(col, 0.62), M_STONE, [-sx, 0, 0]);
  }
  const SEG = 16;
  for (let i = 0; i < SEG; i++) {
    const xa = -OHW + (2 * OHW * i) / SEG, xb = -OHW + (2 * OHW * (i + 1)) / SEG;
    const ya = archY(xa), yb = archY(xb);
    b.quad([xa, ya, z1], [xb, yb, z1], [xb, TOP, z1], [xa, TOP, z1], col, M_STONE, N);
    b.quad([xb, yb, z0], [xa, ya, z0], [xa, TOP, z0], [xb, TOP, z0], mulc(col, 0.84), M_STONE, NB);
    const mx = (xa + xb) / 2, my = (ya + yb) / 2;
    b.quad([xa, ya, z1], [xa, ya, z0], [xb, yb, z0], [xb, yb, z1], mulc(col, 0.55), M_STONE,
      [-mx / OHW, -(my - SPR) / OHW, 0]);
  }
  b.quad([-HWD, TOP, z1], [HWD, TOP, z1], [HWD, TOP, z0], [-HWD, TOP, z0], mulc(col, 1.03), M_STONE, [0, 1, 0]);
}

// One gold door leaf, local hinge at the origin, leaf running toward local +X * dir.
function goldDoorLeaf(b, w, h, dir) {
  const cx = (dir * w) / 2;
  put(b, cx, h / 2, 0, () => box(b, w, h, 0.26, GOLD_DEEP, M_GOLD));
  for (const dz of [-0.15, 0.15]) {
    put(b, cx, 0.55, dz, () => box(b, w, 1.1, 0.1, C.gold, M_GOLD));
    put(b, cx, h - 0.55, dz, () => box(b, w, 1.1, 0.1, C.gold, M_GOLD));
    put(b, dir * (w / 2) - dir * 0.42, h / 2, dz, () => box(b, 0.84, h, 0.1, C.gold, M_GOLD));
    put(b, dir * 0.42, h / 2, dz, () => box(b, 0.84, h, 0.1, C.gold, M_GOLD));
    for (const [py, ph] of [[h * 0.24, h * 0.26], [h * 0.58, h * 0.34]]) {
      put(b, cx, py, dz, () => box(b, w - 1.9, ph, 0.08, mulc(BLUE_DOOR, 1.0), [0.18, 0.6]));
    }
    put(b, cx, h * 0.86, dz, () => box(b, w - 1.9, h * 0.13, 0.08, C.gold, M_GOLD));
  }
  put(b, cx, h * 0.5, 0, () => discZ(b, 0.45, 0.45, 0, 0.45, C.goldBright, M_GLOW, 10));
  // handle
  put(b, dir * (w - 1.0), h * 0.45, 0.28, () => box(b, 0.22, 0.22, 0.3, C.goldBright, M_GLOW));
}

// Glazed skylight ridge above the hall's nave: local x +-9, z -12..-44, spring 18.4, apex 22.6.
function skylightRidge(b) {
  const XW = 9, Y0 = 18.4, Y1 = 22.6, Z0 = -12, Z1 = -44;
  const rise = Y1 - Y0, NS = 14, NR = 8;
  const arc = [];
  for (let i = 0; i <= NS; i++) {
    const t = (i / NS) * Math.PI;
    arc.push([XW * Math.cos(t), Y0 + rise * Math.sin(t), t]);
  }
  const pane = GLASS_PANE, gmat = [0.24, 0.9];
  for (let r = 0; r < NR; r++) {
    const za = Z0 + ((Z1 - Z0) * r) / NR, zb = Z0 + ((Z1 - Z0) * (r + 1)) / NR;
    for (let i = 0; i < NS; i++) {
      const a = arc[i], c2 = arc[i + 1];
      const tm = (a[2] + c2[2]) / 2;
      const nn = norm([rise * Math.cos(tm), XW * Math.sin(tm), 0]);
      b.quad([a[0], a[1], za], [c2[0], c2[1], za], [c2[0], c2[1], zb], [a[0], a[1], zb],
        mixc(pane, rgb('#e6f4fc'), (r % 2) * 0.55), gmat, nn);
    }
  }
  for (const [z, s] of [[Z0, 1], [Z1, -1]]) {
    for (let i = 0; i < NS; i++) {
      b.tri([0, Y0, z], [arc[i][0], arc[i][1], z], [arc[i + 1][0], arc[i + 1][1], z],
        mulc(pane, 0.9), gmat, [0, 0, s], [0, 0, s], [0, 0, s]);
    }
  }
  for (let k = 0; k <= 8; k++) {
    const z = Z0 + ((Z1 - Z0) * k) / 8;
    for (let i = 0; i < NS; i++) {
      const a = arc[i], c2 = arc[i + 1];
      const tm = (a[2] + c2[2]) / 2;
      const nn = norm([rise * Math.cos(tm), XW * Math.sin(tm), 0]);
      b.quad([a[0], a[1], z - 0.22], [c2[0], c2[1], z - 0.22], [c2[0], c2[1], z + 0.22], [a[0], a[1], z + 0.22], STEEL, M_STEEL, nn);
    }
  }
  for (const tm of [0.45, 1.0, 1.57, 2.14, 2.69]) {
    const ct = Math.cos(tm), st = Math.sin(tm);
    const L = Math.hypot(rise * ct, XW * st);
    const nx = (rise * ct) / L, ny = (XW * st) / L;
    const px = XW * ct + nx * 0.16, py = Y0 + rise * st + ny * 0.16;
    bar3(b, [px, py, Z0], [px, py, Z1], 0.2, 0.2, STEEL, M_METAL);
  }
  for (const sx of [-1, 1]) bar3(b, [sx * (XW + 0.02), Y0 + 0.06, Z0], [sx * (XW + 0.02), Y0 + 0.06, Z1], 0.34, 0.3, C.gold, M_GOLD);
  for (const z of [Z0, Z1]) bar3(b, [-XW, Y0 + 0.08, z], [XW, Y0 + 0.08, z], 0.3, 0.26, C.gold, M_GOLD);
}

// ================================================================ GLASS PALACE
// Beaux-Arts stone podium + a 130 m white-steel filigree dome, glass drum,
// barrel-vaulted wings, exterior spiral stair and roof gardens.
// ---- round 6: glass palace drum / dome / frontispiece helpers --------------
// Everything below builds in the glass-palace LOCAL frame (see buildGlassPalace):
// +Z is the street front, the podium spans local x +-39 / z -50..0.  Round 6 moved
// the glass drum + dome from the street edge onto the podium centre (local z=-25).
const DCZ = -25;            // drum / dome centre (local z)
const DRUM_R = 26.6;        // glass drum wall radius
const DRUM_Y0 = 23.0, DRUM_Y1 = 58.0;
const DOME_Y = 60.0, DOME_R = 30.0, DOME_H = 47.0;

// A thick masonry wall with a round-headed opening, extruded along z
// (absolute palace-local coordinates).  Used for the entrance porch and the
// glazed portal in the drum.
function archedOpening(b, hw, yb, yt, archR, springY, z0, z1, col, mat, seg = 16) {
  const zf = z1, zb = z0;
  if (hw > archR + 0.02) for (const sx of [-1, 1]) {
    const xa = Math.min(sx * archR, sx * hw), xb = Math.max(sx * archR, sx * hw);
    b.quad([xa, yb, zf], [xb, yb, zf], [xb, yt, zf], [xa, yt, zf], col, mat, [0, 0, 1]);
    b.quad([xb, yb, zb], [xa, yb, zb], [xa, yt, zb], [xb, yt, zb], mulc(col, 0.86), mat, [0, 0, -1]);
    b.quad([sx * hw, yb, zb], [sx * hw, yb, zf], [sx * hw, yt, zf], [sx * hw, yt, zb], mulc(col, 0.9), mat, [sx, 0, 0]);
    b.quad([sx * archR, yb, zf], [sx * archR, yb, zb], [sx * archR, springY, zb], [sx * archR, springY, zf], mulc(col, 0.66), mat, [-sx, 0, 0]);
    b.quad([xa, yt, zb], [xb, yt, zb], [xb, yt, zf], [xa, yt, zf], mulc(col, 1.04), mat, [0, 1, 0]);
  }
  for (let i = 0; i < seg; i++) {
    const aa = Math.PI * i / seg, ab = Math.PI * (i + 1) / seg;
    const P = (a, r, z) => [Math.cos(a) * r, springY + Math.sin(a) * r, z];
    const rOut = (a) => Math.min(archR / Math.max(1e-4, Math.abs(Math.cos(a))), (yt - springY) / Math.max(1e-4, Math.sin(a)));
    const r0 = rOut(aa), r1 = rOut(ab);
    if (r0 > archR + 0.04 || r1 > archR + 0.04) {
      b.quad(P(aa, archR, zf), P(ab, archR, zf), P(ab, r1, zf), P(aa, r0, zf), col, mat, [0, 0, 1]);
      b.quad(P(ab, archR, zb), P(aa, archR, zb), P(aa, r0, zb), P(ab, r1, zb), mulc(col, 0.86), mat, [0, 0, -1]);
    }
    const am = (aa + ab) / 2;
    b.quad(P(aa, archR, zb), P(aa, archR, zf), P(ab, archR, zf), P(ab, archR, zb), mulc(col, 0.6), mat, [-Math.cos(am), -Math.sin(am), 0]);
  }
}

// masonry drum base on the podium roof: ring wall, gold band, cornice, pilasters, urns
function drumBase(b, col) {
  const N = 40, aDoor = Math.asin(3.9 / 27.0), F = Math.PI / 2;
  const angs = [];
  for (let i = 0; i < N; i++) angs.push((i / N) * TAU);
  angs.push(F - aDoor, F + aDoor);
  angs.sort((p, q) => p - q);
  for (let i = 0; i < angs.length - 1; i++) {
    const a0 = angs[i], a1 = angs[i + 1], am = (a0 + a1) / 2;
    if (Math.abs(am - F) < aDoor + 1e-4) continue;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const NN = [Math.cos(am), 0, Math.sin(am)];
    b.quad([c0 * 27.0, 21.15, DCZ + s0 * 27.0], [c1 * 27.0, 21.15, DCZ + s1 * 27.0],
      [c1 * 27.0, 22.95, DCZ + s1 * 27.0], [c0 * 27.0, 22.95, DCZ + s0 * 27.0], col, M_STONE, NN);
    b.quad([c0 * 27.12, 22.30, DCZ + s0 * 27.12], [c1 * 27.12, 22.30, DCZ + s1 * 27.12],
      [c1 * 27.12, 22.72, DCZ + s1 * 27.12], [c0 * 27.12, 22.72, DCZ + s0 * 27.12], C.gold, M_GOLD, NN);
    b.quad([c0 * 27.45, 22.95, DCZ + s0 * 27.45], [c1 * 27.45, 22.95, DCZ + s1 * 27.45],
      [c1 * 27.45, 23.32, DCZ + s1 * 27.45], [c0 * 27.45, 23.32, DCZ + s0 * 27.45], mulc(col, 1.05), M_MARBLE, NN);
    b.quad([c0 * 27.0, 23.32, DCZ + s0 * 27.0], [c1 * 27.0, 23.32, DCZ + s1 * 27.0],
      [c1 * 27.45, 23.32, DCZ + s1 * 27.45], [c0 * 27.45, 23.32, DCZ + s0 * 27.45], col, M_MARBLE, [0, 1, 0]);
  }
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU + 0.196 + aDoor;
    putR(b, Math.cos(a) * 27.22, 22.15, DCZ + Math.sin(a) * 27.22, Math.PI / 2 - a, () => {
      box(b, 0.66, 1.66, 0.40, mulc(col, 1.04), M_MARBLE);
      box(b, 0.84, 0.20, 0.5, C.gold, M_GOLD);
    });
    put(b, Math.cos(a) * 27.85, 23.34, DCZ + Math.sin(a) * 27.85, () => {
      lathe(b, [[0.0, 0], [0.36, 0.10], [0.25, 0.36], [0.38, 0.66], [0.18, 0.88], [0.0, 0.94]], 8, C.gold, M_GOLD);
    });
  }
}

// two-sided glass drum wall with the entrance and two tiers of window openings
function drumWall(b) {
  const R = DRUM_R, R2 = R - 0.22, F = Math.PI / 2;
  const aDoor = Math.asin(3.8 / R);
  const aWin = Math.asin(2.25 / R), aWin2 = Math.asin(2.2 / R);
  const D1 = [0.42, 0.80, 1.18, 1.56, 1.94, 2.32, 2.70, 3.08];   // 16 open loggia bays
  const D2 = [0.62, 1.25, 1.88, 2.51];                          // 8 glazed upper windows
  const winA = [], winA2 = [];
  for (const d of D1) { winA.push(F - d); winA.push(F + d); }
  void D2; void winA2;   // the upper tier keeps a solid glass wall + applied windows
  const W1 = [23.5, 33.2], W2 = [37.2, 44.4];
  const rows = [DRUM_Y0, W1[0], 25.2, 27.0, 28.8, 30.6, 32.0, W1[1], 34, 36.4, W2[0], 39.5, 42.5, W2[1], 47, 51, 55, DRUM_Y1];
  const angs = [];
  for (let i = 0; i < 64; i++) angs.push((i / 64) * TAU);
  angs.push(F - aDoor, F + aDoor);
  for (const a of winA) angs.push(a - aWin, a + aWin);
  for (const a of winA2) angs.push(a - aWin2, a + aWin2);
  angs.sort((p, q) => p - q);
  const inDoor = (am, ym) => Math.abs(am - F) < aDoor + 1e-4 && ym > DRUM_Y0 && ym < 30.2;
  const inWin = (am, ym) => {
    if (ym > W1[0] && ym < W1[1]) { for (const a of winA) if (Math.abs(am - a) < aWin + 1e-4) return true; }
    if (ym > W2[0] && ym < W2[1]) { for (const a of winA2) if (Math.abs(am - a) < aWin2 + 1e-4) return true; }
    return false;
  };
  const paneOut = (i, j) => (((Math.floor(i / 2) + j) % 2) === 0)
    ? mixc(GLASS_PANE, C.glass, 0.34) : mixc(GLASS_PANE, C.glassDeep, 0.55);
  for (let i = 0; i < angs.length - 1; i++) {
    const a0 = angs[i], a1 = angs[i + 1], am = (a0 + a1) / 2;
    for (let j = 0; j < rows.length - 1; j++) {
      const y0 = Math.max(DRUM_Y0, rows[j]), y1 = rows[j + 1], ym = (y0 + y1) / 2;
      if (y1 <= DRUM_Y0 + 1e-4) continue;
      if (inDoor(am, ym) || inWin(am, ym)) continue;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const Nout = [Math.cos(am), 0, Math.sin(am)];
      b.quad([c0 * R, y0, DCZ + s0 * R], [c1 * R, y0, DCZ + s1 * R],
        [c1 * R, y1, DCZ + s1 * R], [c0 * R, y1, DCZ + s0 * R], paneOut(i, j), [0.15, 0.90], Nout);
      b.quad([c1 * R2, y0, DCZ + s1 * R2], [c0 * R2, y0, DCZ + s0 * R2],
        [c0 * R2, y1, DCZ + s0 * R2], [c1 * R2, y1, DCZ + s1 * R2],
        mixc(mixc(rgb('#8dbca6'), GLASS_PANE, 0.32), C.glassDeep, (i % 3) * 0.10), [0.10, 0.46], [-Nout[0], 0, -Nout[2]]);
    }
  }
  // reveals of the openings + gold frames
  const P = (a, r, y) => [Math.cos(a) * r, y, DCZ + Math.sin(a) * r];
  const reveal = (a0, a1, y0, y1) => {
    const T0 = [-Math.sin(a0), 0, Math.cos(a0)], T1 = [-Math.sin(a1), 0, Math.cos(a1)];
    b.quad(P(a0, R, y0), P(a0, R2, y0), P(a0, R2, y1), P(a0, R, y1), mulc(GLASS_PANE, 0.82), M_STEEL, T0);
    b.quad(P(a1, R2, y0), P(a1, R, y0), P(a1, R, y1), P(a1, R2, y1), mulc(GLASS_PANE, 0.82), M_STEEL, T1);
    b.quad(P(a0, R, y1), P(a1, R, y1), P(a1, R2, y1), P(a0, R2, y1), STEEL, M_STEEL, [0, -1, 0]);
    b.quad(P(a0, R2, y0), P(a1, R2, y0), P(a1, R, y0), P(a0, R, y0), STEEL, M_STEEL, [0, 1, 0]);
    // gold casing on both reveals
    for (const [aa, T] of [[a0, T0], [a1, T1]]) {
      b.quad(P(aa, R + 0.03, y0), P(aa, R + 0.03, y1), P(aa, R + 0.03 - 0.16, y1), P(aa, R + 0.03 - 0.16, y0), C.gold, M_GOLD, T);
    }
  };
  reveal(F - aDoor, F + aDoor, DRUM_Y0, 30.2);
  for (const a of winA) reveal(a - aWin, a + aWin, W1[0], W1[1]);
  for (const a of winA2) reveal(a - aWin2, a + aWin2, W2[0], W2[1]);
  // loggia bays: stone sill, gold railing across the opening, gold archivolt,
  // closed spandrel corners; the four rear bays are glazed, the rest stay open
  // so the palm crowns inside read from the terrace and the air.
  const trim = (a, half, y0, y1, big, glazed) => {
    const rr = R + 0.20, cx = Math.cos(a) * rr, cz = DCZ + Math.sin(a) * rr;
    const w = 2 * R * Math.sin(half);
    putR(b, cx, y0, cz, Math.PI / 2 - a, () => {
      if (big) {
        // gold railing across the open bay (the drum's gold band is the sill)
        put(b, 0, 0.04, 0.22, () => balustrade(b, w - 0.34, 1.05, C.gold, M_GOLD, { n: 5 }));
        const spring = (y1 - 2.25) - y0, yTop = y1 - y0, AR = 2.25;
        // spandrel corners above the arch, in the same pale glass as the wall so
        // the bay head reads as a glazed arched opening rather than a stone plate
        for (let k = 0; k <= 10; k++) {
          const aa = Math.PI * k / 10, ab = Math.PI * (k + 1) / 10;
          const rO = (ang) => Math.min(AR / Math.max(1e-4, Math.abs(Math.cos(ang))), (yTop - spring) / Math.max(1e-4, Math.sin(ang)));
          const ra = rO(aa), rb = rO(ab);
          if (ra > AR + 0.05 || rb > AR + 0.05) {
            b.quad([Math.cos(aa) * AR, spring + Math.sin(aa) * AR, 0.05], [Math.cos(ab) * AR, spring + Math.sin(ab) * AR, 0.05],
              [Math.cos(ab) * rb, spring + Math.sin(ab) * rb, 0.05], [Math.cos(aa) * ra, spring + Math.sin(aa) * ra, 0.05], mixc(GLASS_PANE, C.glass, 0.3), [0.15, 0.85], [0, 0, 1]);
          }
        }
        ringZ(b, 0, spring, 0.10, AR + 0.02, 0.42, 0.12, C.gold, M_GOLD, 14, 0, Math.PI);
        if (glazed) box(b, w - 0.3, y1 - y0 - 0.6, 0.08, GLASS_PANE, [0.24, 0.9]);
      } else {
        box(b, w + 0.4, 0.24, 0.3, SPG, M_MARBLE);
      }
    });
  };
  for (let k = 0; k < D1.length; k++) {
    trim(F - D1[k], aWin, W1[0], W1[1], true, false);
    trim(F + D1[k], aWin, W1[0], W1[1], true, false);
  }
  // applied high windows above the loggia (the upper wall stays solid glass)
  const N2 = [0.62, 1.25, 1.88, 2.51];
  for (const d of N2) for (const s of [-1, 1]) {
    const a = F + s * d, rr = R + 0.24;
    putR(b, Math.cos(a) * rr, 37.4, DCZ + Math.sin(a) * rr, Math.PI / 2 - a, () => {
      roundWin(b, 3.6, 7.4, SPG, mixc(GLASS_PANE, C.glass, 0.35), { fw: 0.42 });
      box(b, 4.9, 0.34, 0.62, C.gold, M_GOLD);
      box(b, 4.4, 0.26, 0.5, SPG, M_MARBLE);
    });
  }
}

// vertical steel ribs of the drum (skipping the openings)
function drumRibs(b) {
  const F = Math.PI / 2, aDoor = Math.asin(3.8 / DRUM_R);
  const D = [0.42, 0.80, 1.18, 1.56, 1.94, 2.32, 2.70, 3.08];
  let n = 0;
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * TAU + 0.03;
    if (Math.abs(a - F) < aDoor + 0.10) continue;
    let skip = false;
    for (const d of D) for (const s of [-1, 1]) if (Math.abs(a - (F + s * d)) < 0.10) skip = true;
    if (skip) continue;
    putR(b, Math.cos(a) * (DRUM_R + 0.34), 40.5, DCZ + Math.sin(a) * (DRUM_R + 0.34), ((Math.PI / 2) - a) % TAU, () => {
      box(b, 0.58, 34.4, 0.62, STEEL, M_STEEL);
      box(b, 0.72, 0.5, 0.72, C.gold, M_GOLD);
    });
    n++;
  }
}

// entrance portal of the drum: stone architrave, gold archivolt, open gilded leaves
function drumEntrance(b, col) {
  archedOpening(b, 5.0, 21.2, 31.8, 3.8, 26.4, 1.82, 2.40, col, M_MARBLE, 18);
  for (const sx of [-1, 1]) {
    b.quad([sx * 3.8, 21.25, 2.41], [sx * 4.98, 21.25, 2.41], [sx * 4.98, 31.8, 2.41], [sx * 3.8, 31.8, 2.41], col, M_MARBLE, [0, 0, 1]);
  }
  ringZ(b, 0, 26.4, 2.45, 4.18, 0.52, 0.14, C.gold, M_GOLD, 18, 0, Math.PI);
  put(b, 0, 30.28, 2.38, () => box(b, 1.15, 0.95, 0.75, col, M_MARBLE));
  put(b, 0, 30.34, 2.45, () => discZ(b, 0, 0, 0, 0.44, C.goldBright, M_GLOW, 10));
  for (const sx of [-1, 1]) {
    put(b, sx * 4.06, 23.8, 2.42, () => box(b, 0.52, 4.9, 0.5, C.gold, M_GOLD));
    put(b, sx * 4.06, 26.42, 2.42, () => box(b, 0.7, 0.55, 0.62, C.gold, M_GOLD));
    // threshold platform bridging the plinth to the drum base
    putR(b, sx * 3.78, 21.35, 1.62, -sx * 1.28, () => goldDoorLeaf(b, 3.6, 9.2, sx));
  }
  put(b, 0, 20.95, 1.95, () => box(b, 9.0, 0.5, 1.7, SPG, M_MARBLE));
}

// glass dome with gold filigree
function domeOuter(b) {
  put(b, 0, DOME_Y, DCZ, () => ellipsoid(b, DOME_R, DOME_H, DOME_R, 32, 8, GLASS_PANE, [0.14, 0.62], {
    v0: 0.5, v1: 1,
    colFn: (u, v) => mixc(mixc(GLASS_PANE, C.glass, 0.45), C.glassDeep, (Math.floor(u * 32) % 2) * 0.7),
  }));
  const NR = 32, NS = 6, hw = 0.55;
  for (let i = 0; i < NR; i++) {
    const a = (i / NR) * TAU, c = Math.cos(a), s = Math.sin(a);
    for (let k = 0; k < NS; k++) {
      const p0 = (k / NS) * Math.PI / 2, p1 = ((k + 1) / NS) * Math.PI / 2;
      const r0 = DOME_R * Math.cos(p0) + 0.55, y0 = DOME_Y + DOME_H * Math.sin(p0) + 0.12;
      const r1 = DOME_R * Math.cos(p1) + 0.55, y1 = DOME_Y + DOME_H * Math.sin(p1) + 0.12;
      b.quad([c * r0 - s * hw, y0, DCZ + s * r0 + c * hw], [c * r0 + s * hw, y0, DCZ + s * r0 - c * hw],
        [c * r1 + s * hw, y1, DCZ + s * r1 - c * hw], [c * r1 - s * hw, y1, DCZ + s * r1 + c * hw],
        C.gold, M_GOLD, [c, 0.5, s]);
    }
  }
  const N2 = 32, hw2 = 0.15;
  for (let i = 0; i < N2; i++) {
    const a = ((i + 0.5) / N2) * TAU, c = Math.cos(a), s = Math.sin(a);
    for (let k = 0; k < 4; k++) {
      const p0 = (k / 4) * Math.PI / 2, p1 = ((k + 1) / 4) * Math.PI / 2;
      const r0 = DOME_R * Math.cos(p0) + 0.45, y0 = DOME_Y + DOME_H * Math.sin(p0) + 0.06;
      const r1 = DOME_R * Math.cos(p1) + 0.45, y1 = DOME_Y + DOME_H * Math.sin(p1) + 0.06;
      b.quad([c * r0 - s * hw2, y0, DCZ + s * r0 + c * hw2], [c * r0 + s * hw2, y0, DCZ + s * r0 - c * hw2],
        [c * r1 + s * hw2, y1, DCZ + s * r1 - c * hw2], [c * r1 - s * hw2, y1, DCZ + s * r1 + c * hw2],
        STEEL, M_METAL, [c, 0.5, s]);
    }
  }
  for (const ph of [0.22, 0.46, 0.70, 0.94, 1.17, 1.36]) {
    const rr = DOME_R * Math.cos(ph) + 0.56, yy = DOME_Y + DOME_H * Math.sin(ph);
    band(b, yy, rr, 0.60, C.gold, M_GOLD, 32, 0, DCZ);
    band(b, yy - 0.12, rr + 0.06, 0.22, C.goldBright, M_GOLD_B, 32, 0, DCZ);
  }
  // 32 gold leaf fans hugging the dome base (short, flat against the glass)
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * TAU + 0.1, c = Math.cos(a), s = Math.sin(a);
    for (let k = 0; k < 2; k++) {
      const t0 = (k / 2 - 0.5) * 0.6, t1 = ((k + 1) / 2 - 0.5) * 0.6;
      b.tri([c * (DOME_R + 0.55), DOME_Y + 1.9, DCZ + s * (DOME_R + 0.55)],
        [c * (DOME_R + 0.75) + Math.cos(a - t0) * 1.2, DOME_Y + 0.35, DCZ + s * (DOME_R + 0.75) + Math.sin(a - t0) * 1.2],
        [c * (DOME_R + 0.75) + Math.cos(a - t1) * 1.2, DOME_Y + 0.35, DCZ + s * (DOME_R + 0.75) + Math.sin(a - t1) * 1.2], C.gold, M_GOLD, [c * 0.5, 0.8, s * 0.5]);
    }
  }
  put(b, 0, DOME_Y, DCZ, () => cylinder(b, 32, 28.2, DOME_R + 0.4, 2.6, C.gold, M_GOLD, { caps: false, y0: -2.2 }));
  band(b, DOME_Y + 0.35, DOME_R + 0.58, 0.5, C.goldBright, M_GOLD_B, 32, 0, DCZ);
  band(b, DRUM_Y1 + 0.2, 28.3, 1.6, C.gold, M_GOLD, 32, 0, DCZ);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU;
    putR(b, Math.cos(a) * 28.62, DRUM_Y1 + 0.95, DCZ + Math.sin(a) * 28.62, Math.PI / 2 - a, () => box(b, 0.5, 1.6, 0.95, C.gold, M_GOLD));
  }
  // lantern gallery balustrade at the dome apex
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * TAU;
    put(b, Math.cos(a) * 6.4, 105.9, DCZ + Math.sin(a) * 6.4, () => box(b, 0.26, 1.05, 0.26, C.gold, M_GOLD));
    const a1 = ((i + 1) / 20) * TAU;
    b.quad([Math.cos(a) * 6.4, 106.95, DCZ + Math.sin(a) * 6.4], [Math.cos(a1) * 6.4, 106.95, DCZ + Math.sin(a1) * 6.4],
      [Math.cos(a1) * 6.26, 107.18, DCZ + Math.sin(a1) * 6.26], [Math.cos(a) * 6.26, 107.18, DCZ + Math.sin(a) * 6.26], C.gold, M_GOLD, [0, 1, 0]);
  }
}

// inner dome shell (inward normals) with gold ribs, seen from the palm house
function domeInner(b) {
  const rx = 29.1, ry = DOME_H - 1.6, rz = 29.1, su = 32, sv = 8;
  const P = (u, v) => {
    const phi = v * Math.PI / 2, rr = Math.cos(phi);
    return [Math.cos(u * TAU) * rr * rx, DOME_Y + ry * Math.sin(phi), DCZ + Math.sin(u * TAU) * rr * rz];
  };
  const Nn = (p) => norm([-p[0] / (rx * rx), -(p[1] - DOME_Y) / (ry * ry), -(p[2] - DCZ) / (rz * rz)]);
  for (let j = 0; j < sv; j++) {
    for (let i = 0; i < su; i++) {
      const p00 = P(i / su, j / sv), p10 = P((i + 1) / su, j / sv);
      const p01 = P(i / su, (j + 1) / sv), p11 = P((i + 1) / su, (j + 1) / sv);
      const cc = mixc(mixc(rgb('#8fc7ab'), GLASS_PANE, 0.28), (i % 2 === 0) ? C.glassDeep : rgb('#5f9a86'), (i % 2 === 0) ? 0.34 : 0.16);
      b.tri(p00, p01, p11, cc, [0.10, 0.45], Nn(p00), Nn(p01), Nn(p11));
      b.tri(p00, p11, p10, cc, [0.10, 0.45], Nn(p00), Nn(p11), Nn(p10));
    }
  }
  // interior meridian ribs
  for (let i = 0; i < 32; i++) {
    const u = i / 32, tx = -Math.sin(u * TAU), tz = Math.cos(u * TAU), w = 0.62;
    for (let k = 0; k < 8; k++) {
      const q0 = P(u, k / 8), q1 = P(u, (k + 1) / 8);
      b.quad([q0[0] + tx * w, q0[1], q0[2] + tz * w], [q0[0] - tx * w, q0[1], q0[2] - tz * w],
        [q1[0] - tx * w, q1[1], q1[2] - tz * w], [q1[0] + tx * w, q1[1], q1[2] + tz * w], C.gold, M_GOLD, Nn(q0));
    }
  }
  for (const v of [0.18, 0.38, 0.58, 0.78, 0.94]) {
    band(b, DOME_Y + ry * Math.sin(v * Math.PI / 2), Math.cos(v * Math.PI / 2) * rx - 0.12, 0.36, C.gold, M_GOLD, 32, 0, DCZ);
  }
  // glowing chandelier hanging inside the lantern
  put(b, 0, 112.0, DCZ, () => {
    cylinder(b, 14, 4.0, 4.0, 0.3, C.gold, M_GOLD, { y0: 0, caps: true });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      bar3(b, [Math.cos(a) * 3.2, 0.3, Math.sin(a) * 3.2], [0, -3.0, 0], 0.10, 0.12, C.gold, M_GOLD);
    }
    put(b, 0, -3.4, 0, () => sphere(b, 0.55, C.goldBright, M_GLOW, { rings: 3, seg: 6, jitter: 0.1 }));
  });
}

function z6(i) { return -40 + i * 6.2; }

function buildGlassPalace(b, ctx, rng) {
  const pCount0 = ctx.points ? ctx.points.length : 0;   // R6 check hook
  const A = L.glassPalace;
  const SW = C.stoneWarm, SP = C.stonePale, S = C.stone;
  // inFrame convention (same frame the geometry is built in): local +X -> (cos,0,sin),
  // local +Z -> (-sin,0,cos).  (landmark's frameMap has the opposite sign; R5 note 3.)
  const _ca = Math.cos(A.rot), _sa = Math.sin(A.rot);
  const wp = (lx, ly, lz) => [A.x + _ca * lx - _sa * lz, ly, A.z + _sa * lx + _ca * lz];
  inFrame(b, [A.x, 0, A.z], A.rot, () => {
    // ---------------- podium: hollow shell with a real doorway (R5) ------
    // Outer faces are unchanged from the round-4 solid box; the cavity is the hall
    // built by glass-hall.js (floor y 2.6, ceiling 18.4, x +-35, z -48..-2).
    put(b, 0, 1.3, -25, () => box(b, 78, 2.6, 50, SW, M_STONE));              // floor slab
    put(b, 0, 10, -49, () => box(b, 78, 20, 2, SW, M_STONE));                 // rear wall
    for (const sx of [-1, 1]) put(b, sx * 37, 10, -25, () => box(b, 4, 20, 50, SW, M_STONE)); // side walls
    // roof deck (y 18.4..20) with the skylight well cut over the nave
    put(b, 0, 19.2, -7, () => box(b, 78, 1.6, 10, SW, M_STONE));
    put(b, 0, 19.2, -47, () => box(b, 78, 1.6, 6, SW, M_STONE));
    for (const sx of [-1, 1]) put(b, sx * 24, 19.2, -28, () => box(b, 30, 1.6, 32, SW, M_STONE));
    podiumFrontWall(b, SW);
    skylightRidge(b);
    put(b, 0, 1.0, 6.4, () => box(b, 56, 2.0, 9, SW, M_MARBLE));
    put(b, 0, 0.5, 11.5, () => box(b, 60, 1.0, 2.6, SW, M_MARBLE));
    put(b, 0, 0.2, 13.5, () => box(b, 63, 0.4, 2.0, SW, M_MARBLE));
    for (const sx of [-1, 1]) for (const y of [4.6, 11.6]) {
      put(b, sx * 36.4, y, -0.6, () => box(b, 7.4, 6.6, 4.6, S, M_STONE));
      put(b, sx * 36.4, y + 3.4, -0.6, () => box(b, 8.2, 0.6, 5.4, SP, M_MARBLE));
    }
    // cornice + balustrades — R5: a ring, so the skylight ridge rises through it
    for (const sx of [-1, 1]) put(b, sx * 24.65, 20.4, -25, () => box(b, 31.3, 1.5, 52.6, SP, M_MARBLE));
    put(b, 0, 20.4, -5.35, () => box(b, 18, 1.5, 13.3, SP, M_MARBLE));
    put(b, 0, 20.4, -47.65, () => box(b, 18, 1.5, 7.3, SP, M_MARBLE));
    put(b, 0, 21.15, 0.75, () => balustrade(b, 78, 1.55, SP, M_MARBLE, { n: 32 }));
    put(b, 0, 21.15, -50.75, () => balustrade(b, 78, 1.55, SP, M_MARBLE, { n: 32 }));
    for (const sx of [-1, 1]) putR(b, sx * 39.55, 21.15, -25, sx * Math.PI / 2, () => balustrade(b, 50, 1.55, SP, M_MARBLE, { n: 22 }));

    // ---------------- windows in the podium ------------------------------
    for (let i = 0; i < 10; i++) {
      const x = -33.0 + i * 7.33;
      if (Math.abs(x) < 9) continue;
      putR(b, x, 6.0, 0.06, 0, () => roundWin(b, 3.6, 10.6, SP, GLASS_DARK, { fw: 0.4 }));
    }
    for (const sx of [-1, 1]) for (let i = 0; i < 8; i++) {
      const z = -6.5 - i * 5.6;
      putR(b, sx * 39.05, 6.0, z, sx * Math.PI / 2, () => roundWin(b, 3.2, 9.6, SP, GLASS_DARK, { fw: 0.36 }));
    }
    // great door under the portico: a real arched portal into the hall (R5).
    // The old decorative ring is re-centred on the new opening as an archivolt.
    ringZ(b, 0, 8.6, 0.45, 5.9, 1.4, 0.9, SP, M_MARBLE, 16, 0, Math.PI);
    ringZ(b, 0, 8.6, 0.72, 5.5, 0.6, 1.0, C.gold, M_GOLD, 16, 0, Math.PI);
    put(b, 0, 13.7, 0.4, () => box(b, 1.6, 2.6, 1.2, SP, M_MARBLE));            // keystone
    put(b, 0, 13.7, 1.0, () => box(b, 1.1, 1.9, 0.5, C.gold, M_GOLD));
    for (const sx of [-1, 1]) {
      put(b, sx * 5.6, 5.7, 0.42, () => box(b, 1.1, 8.4, 0.85, SP, M_MARBLE));  // jamb pilasters
      put(b, sx * 5.6, 10.1, 0.62, () => box(b, 1.35, 0.6, 1.0, C.gold, M_GOLD));
      put(b, sx * 5.6, 1.4, 0.5, () => box(b, 1.35, 1.6, 1.0, C.gold, M_GOLD));
    }
    // two gold leaves swung open into the hall
    for (const sx of [-1, 1]) putR(b, sx * 4.85, 2.6, -1.85, -sx * 1.48, () => goldDoorLeaf(b, 4.7, 11.2, -sx));
    // threshold: shallow steps from the portico platform (y 2.0) up to the hall floor (2.6)
    put(b, 0, 1.1, 1.55, () => box(b, 12.6, 2.2, 0.7, SP, M_MARBLE));
    put(b, 0, 1.2, 0.85, () => box(b, 11.8, 2.4, 0.7, SP, M_MARBLE));
    put(b, 0, 1.3, 0.25, () => box(b, 11.2, 2.6, 0.5, SP, M_MARBLE));

    // ---------------- portico (R6: deepened, wide central bay) -----------
    for (const x of [-22.4, -15.2, -7.8, 7.8, 15.2, 22.4]) {
      putR(b, x, 2.0, 7.8, 0, () => columnRound(b, 13.6, 0.95, SP, M_MARBLE, 8));
    }
    put(b, 0, 17.0, 3.4, () => box(b, 50, 2.6, 15.0, SP, M_MARBLE));
    put(b, 0, 15.45, 3.4, () => box(b, 50.4, 0.5, 15.2, C.gold, M_GOLD));
    put(b, 0, 18.50, 3.4, () => box(b, 51.0, 0.4, 15.6, SP, M_MARBLE));

    // ---------------- attic wings + entrance frontispiece -----------------
    // The old triangular pediment is replaced by an attic frontispiece: the glass
    // drum now rises right behind the portico, and the palm house is entered
    // through a great arched porch standing on the entablature between the two
    // middle columns.
    for (const sx of [-1, 1]) {
      put(b, sx * 15.3, 19.5, 5.0, () => box(b, 19.2, 1.6, 4.4, SP, M_MARBLE));
      put(b, sx * 15.3, 17.3, 7.9, () => box(b, 0.9, 1.2, 1.2, SP, M_MARBLE));
      for (let i = 0; i < 3; i++) {
        const x = sx * (8.6 + i * 5.4);
        put(b, x, 19.2, 7.24, () => {
          b.quad([-1.15, -0.5, 0.04], [1.15, -0.5, 0.04], [1.15, 0.55, 0.04], [-1.15, 0.55, 0.04], mulc(SP, 0.94), M_MARBLE, [0, 0, 1]);
          ringZ(b, 0, 0.55, 0.08, 1.15, 0.34, 0.1, mulc(SP, 0.97), M_MARBLE, 10, 0, Math.PI);
        });
        put(b, x, 19.5, 7.30, () => box(b, 2.5, 0.12, 0.12, C.gold, M_GOLD));
      }
      put(b, sx * 15.3, 20.55, 5.0, () => box(b, 19.9, 0.5, 4.8, SP, M_MARBLE));
      put(b, sx * 15.3, 20.80, 7.45, () => balustrade(b, 18.8, 1.15, SP, M_MARBLE, { n: 12 }));
      put(b, sx * 24.4, 22.05, 7.45, () => {
        lathe(b, [[0.0, 0], [0.5, 0.12], [0.34, 0.52], [0.54, 0.94], [0.24, 1.2], [0.0, 1.27]], 9, C.gold, M_GOLD);
      });
    }
    // porch tower: great arched portal, solid base (the palm-house threshold)
    archedOpening(b, 5.6, 18.7, 32.4, 3.8, 26.6, 2.8, 7.2, SP, M_MARBLE, 18);
    put(b, 0, 19.95, 5.0, () => box(b, 7.6, 2.5, 4.4, mulc(SP, 0.99), M_MARBLE));
    for (const sx of [-1, 1]) {
      put(b, sx * 2.2, 19.9, 7.24, () => box(b, 2.0, 1.9, 0.12, C.gold, M_GOLD));
      put(b, sx * 4.7, 26.9, 7.24, () => box(b, 1.1, 8.8, 0.16, mulc(SP, 1.04), M_MARBLE));
      // gold rosettes in the porch spandrels
      put(b, sx * 2.4, 29.9, 7.26, () => discZ(b, 0, 0, 0, 0.55, C.gold, M_GOLD, 12));
    }
    ringZ(b, 0, 26.6, 7.28, 4.12, 0.45, 0.14, C.gold, M_GOLD, 18, 0, Math.PI);
    put(b, 0, 30.35, 7.30, () => box(b, 1.0, 0.8, 0.5, SP, M_MARBLE));
    put(b, 0, 30.45, 7.40, () => discZ(b, 0, 0, 0, 0.34, C.goldBright, M_GLOW, 10));
    put(b, 0, 32.75, 5.0, () => box(b, 12.4, 0.7, 5.2, SP, M_MARBLE));
    put(b, 0, 33.35, 5.0, () => box(b, 11.4, 0.5, 4.6, SP, M_MARBLE));
    put(b, 0, 33.62, 7.55, () => balustrade(b, 11.0, 1.2, SP, M_MARBLE, { n: 9 }));
    for (const sx of [-1, 1]) {
      putR(b, sx * 5.55, 33.62, 2.95, sx * -Math.PI / 2, () => balustrade(b, 4.6, 1.2, SP, M_MARBLE, { n: 5 }));
      put(b, sx * 5.0, 33.66, 7.0, () => {
        lathe(b, [[0.0, 0], [0.56, 0.14], [0.38, 0.58], [0.6, 1.04], [0.27, 1.34], [0.0, 1.42]], 9, C.gold, M_GOLD);
      });
      put(b, sx * 5.3, 18.9, 7.32, () => box(b, 0.5, 2.2, 0.3, C.gold, M_GOLD));
    }
    put(b, 0, 35.2, 5.0, () => {
      cylinder(b, 8, 0.5, 0.14, 1.8, C.gold, M_GOLD, { caps: true, y0: 0 });
      star(b, 1.0, 0.4, 6, 0.2, C.goldBright, M_GLOW);
    });

    // ---------------- glass drum (R6: centred on the podium) -------------
    drumBase(b, SP);
    drumWall(b);
    drumRibs(b);
    for (const y of [23.55, 34.6, 47.6, 56.4]) band(b, y, DRUM_R + 0.34, 0.46, STEEL, M_STEEL, 32, 0, DCZ);
    band(b, 23.35, DRUM_R + 0.44, 0.55, C.gold, M_GOLD, 32, 0, DCZ);
    band(b, 33.42, DRUM_R + 0.46, 0.44, C.gold, M_GOLD, 32, 0, DCZ);
    band(b, 56.4, DRUM_R + 0.46, 0.3, C.gold, M_GOLD, 32, 0, DCZ);
    drumEntrance(b, SP);

    // ---------------- filigree dome (R6: gilded crystal palm house) -------
    domeOuter(b);
    domeInner(b);
    // hanging vine trellis rings just under the drum top
    for (const yy of [38.5, 46.5]) {
      band(b, yy, DRUM_R - 0.5, 0.18, C.gold, M_GOLD, 32, 0, DCZ);
    }
    band(b, 106.3, 7.2, 1.5, C.gold, M_GOLD, 24, 0, DCZ);

    // ---------------- lantern + gold finial (R6) -------------------------
    put(b, 0, 111.2, DCZ, () => cylinder(b, 16, 5.2, 4.6, 9.2, GLASS_PANE, [0.16, 0.9], { caps: false, y0: -4.6 }));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      putR(b, Math.cos(a) * 5.2, 111.2, DCZ + Math.sin(a) * 5.2, Math.PI / 2 - a, () => {
        box(b, 0.42, 9.2, 0.42, STEEL, M_STEEL);
        box(b, 0.6, 0.5, 0.6, C.gold, M_GOLD);
      });
    }
    band(b, 107.0, 5.85, 0.5, C.gold, M_GOLD, 16, 0, DCZ);
    band(b, 111.2, 5.5, 0.26, C.gold, M_GOLD, 16, 0, DCZ);
    band(b, 115.60, 4.95, 0.9, C.gold, M_GOLD, 16, 0, DCZ);
    put(b, 0, 116.3, DCZ, () => ellipsoid(b, 4.8, 4.2, 4.8, 14, 4, GLASS_PANE, [0.14, 0.9], { v0: 0.5, v1: 1 }));
    band(b, 120.2, 1.3, 0.5, C.gold, M_GOLD, 10, 0, DCZ);
    put(b, 0, 120.6, DCZ, () => cylinder(b, 8, 0.85, 0.16, 4.5, C.gold, M_GOLD, { caps: true, y0: 0 }));
    put(b, 0, 125.15, DCZ, () => star(b, 1.9, 0.75, 4, 0.42, C.goldBright, M_GLOW));
    // lantern halo
    if (ctx.lanterns) {
      ctx.lanterns.push({ p: wp(0, 111.5, DCZ + 0.5), size: 15, rot: 0, alpha: 0.30, shape: 1, col: C.goldBright });
      ctx.lanterns.push({ p: wp(0, 112.5, DCZ), size: 7, rot: 0, alpha: 0.45, shape: 1, col: C.cityGlow });
    }

    // ---------------- exterior spiral stair (R6: re-centred + re-landed) --
    // Starts on the roof garden beside the new entrance porch and winds up the
    // drum to the dome gallery.
    const steps = 34;
    for (let k = 0; k < steps; k++) {
      const a = 0.8 - k * 0.40, y = 21.35 + k * 1.12;
      putR(b, Math.cos(a) * 29.0, y, DCZ + Math.sin(a) * 29.0, -(a + Math.PI / 2), () => box(b, 3.5, 0.26, 2.8, SP, M_MARBLE));
      // bracket back to the drum wall (ties every tread to the drum)
      bar3(b, [Math.cos(a) * 26.8, y - 0.32, DCZ + Math.sin(a) * 26.8], [Math.cos(a) * 28.6, y - 0.12, DCZ + Math.sin(a) * 28.6], 0.26, 0.3, C.gold, M_GOLD);
    }
    const railPts = [];
    for (let k = 0; k <= 40; k++) {
      const t = k / 40, a = 0.8 - t * (steps - 1) * 0.40, y = 22.15 + t * (steps - 1) * 1.12;
      railPts.push([Math.cos(a) * 28.35, y, DCZ + Math.sin(a) * 28.35]);
    }
    tubePath(b, railPts, 0.15, 3, C.gold, M_GOLD);
    // inner stringer: a gold helix that ties the treads to the drum
    const strPts = [];
    for (let k = 0; k <= 34; k++) {
      const a = 0.8 - k * 0.40, y = 21.2 + k * 1.12;
      strPts.push([Math.cos(a) * 27.75, y, DCZ + Math.sin(a) * 27.75]);
    }
    tubePath(b, strPts, 0.2, 3, C.gold, M_GOLD);
    for (let k = 0; k < steps; k += 2) {
      const a = 0.8 - k * 0.40, y = 21.35 + k * 1.12;
      put(b, Math.cos(a) * 28.35, y + 0.6, DCZ + Math.sin(a) * 28.35, () => box(b, 0.10, 0.85, 0.10, C.gold, M_GOLD));
    }

    // ---------------- barrel-vaulted wings -------------------------------
    for (const sx of [-1, 1]) {
      put(b, sx * 50, 6.5, -24, () => box(b, 22, 13, 40, SW, M_STONE));
      put(b, sx * 50, 13.2, -24, () => box(b, 23, 1.0, 41, SP, M_MARBLE));
      put(b, sx * 50, 13.2, -24, () => box(b, 23.4, 0.5, 41.4, C.gold, M_GOLD));
      put(b, sx * 50, 0, 0, () => barrelZ(b, 10.5, 13.7, -43, -5, 10, GLASS_PANE, [0.14, 0.9], { rows: 3 }));
      for (let k = 0; k < 6; k++) put(b, sx * 50, 0, 0, () => arcRibZ(b, 10.5, 13.7, -41 + k * 7.4, 0.85, STEEL, M_METAL, 8));
      for (let i = 0; i < 6; i++) putR(b, sx * 61.05, 5.0, z6(i), sx * Math.PI / 2, () => roundWin(b, 3.0, 8.0, SP, GLASS_DARK, { fw: 0.3 }));
    }

    // ---------------- roof gardens (R6: planters ring around the drum) ---
    // Same number of planters as before (28) so the shared rng draw count is
    // unchanged, re-laid around the centred drum.
    const plant = (lx, lz) => {
      put(b, lx, 21.75, lz, () => box(b, 2.9, 1.2, 2.3, SP, M_MARBLE));
      if (ctx.lanterns) {
        ctx.lanterns.push({
          p: wp(lx, 23.7, lz), size: 2.7 + rng() * 1.2, rot: rng() * TAU, alpha: 0.86,
          shape: 5, col: rng() > 0.4 ? C.leafLight : C.leaf,
        });
      }
    };
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 5; i++) plant(sx * 34, -5 - i * 10);          // outer side rows
      for (let i = 0; i < 4; i++) plant(sx * 31, -10 - i * 10);         // inner side rows
      for (let i = 0; i < 5; i++) plant(sx * (14.5 + i * 4.5), -0.4);   // front row
    }
    // tropical tubs flanking the porch, set against the jambs (clear of the walkway)
    for (const sx of [-1, 1]) {
      put(b, sx * 5.2, 21.6, 3.5, () => box(b, 1.3, 0.9, 1.3, SP, M_MARBLE));
      if (ctx.lanterns) ctx.lanterns.push({ p: wp(sx * 5.2, 23.6, 3.5), size: 4.2, rot: 0, alpha: 0.95, shape: 5, col: C.leafLight });
    }
    // a few rooftop shrubs on the wings
    if (ctx.lanterns) for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) {
      ctx.lanterns.push({
        p: wp(sx * (44 + i * 4.5), 14.6, -20 - i * 5), size: 4.2, rot: rng() * TAU,
        alpha: 0.95, shape: 5, col: C.leaf,
      });
    }

    // ---------------- exterior tropical band around the drum (R6b) -------
    buildGlassRoofGarden(b, ctx);

    // ---------------- the tropical palm house inside the drum (R6) --------
    ctx.ghV0 = b.v.length / 11;                            // R6 check hook
    buildGlassGreenhouse(b, ctx);
    // Round 9: the fantasy observatory in the empty upper cavity of the drum / dome.
    // Built inside the ghV0..ghV1 span so it counts as palm-house interior volume for
    // the existing glass-dome check (which only skips vertices in that span).
    buildGlassOrbital(b, ctx);
    ctx.ghV1 = b.v.length / 11;
  });

  if (ctx.points) {
    ctx.points.push({ p: wp(0, 8, 11), col: C.cityGlow, range: 42, int: 1.2 });
    ctx.points.push({ p: wp(-15, 8, 9), col: C.goldBright, range: 30, int: 0.7 });
    ctx.points.push({ p: wp(15, 8, 9), col: C.goldBright, range: 30, int: 0.7 });
    ctx.glassPointCount = ctx.points.length - pCount0;   // R6 check hook
  } else {
    ctx.glassPointCount = 0;
  }
}

// ================================================================ FERRIS WHEEL
// Static pylons + boarding pier here; the spinning rim and the hanging cabins are
// dynamic actors (their meshes are built separately and added through ctx.dyn).
function buildFerrisWheel(b, ctx, rng) {
  const F = L.ferris;
  const cx = F.x, cz = F.z, hubY = F.y + F.r;

  // ---- supporting A-frames (static) -----------------------------------
  for (const sx of [-1, 1]) {
    const px = cx + sx * 7.2;
    for (const sz of [-1, 1]) {
      bar3(b, [px, 2.4, cz + sz * 21], [px, hubY - 1.5, cz], 1.5, 1.8, C.ironLight, M_METAL);
      put(b, px, 1.2, cz + sz * 21, () => box(b, 4.6, 2.4, 4.6, C.stoneDark, M_STONE));
    }
    bar3(b, [px, 32, cz + 12.4], [px, 32, cz - 12.4], 0.9, 1.0, C.iron, M_METAL);
    bar3(b, [px, 14, cz + 8.0], [px, 14, cz - 8.0], 0.7, 0.8, C.iron, M_METAL);
    bar3(b, [px, 2.4, cz - 21], [px, 32, cz + 12.4], 0.5, 0.55, C.ironLight, M_METAL);
    bar3(b, [px, 2.4, cz + 21], [px, 32, cz - 12.4], 0.5, 0.55, C.ironLight, M_METAL);
    bar3(b, [px, 32, cz - 12.4], [px, hubY - 1.5, cz], 1.0, 1.1, C.ironLight, M_METAL);
    bar3(b, [px, 32, cz + 12.4], [px, hubY - 1.5, cz], 1.0, 1.1, C.ironLight, M_METAL);
  }
  // axle housing
  put(b, cx, hubY, cz, () => {
    b.push(m4.rotX(Math.PI / 2));
    cylinder(b, 12, 4.2, 4.2, 13, C.iron, M_METAL, { caps: true, y0: -6.5 });
    b.pop();
  });
  // boarding pier + deck at the bottom of the wheel
  put(b, cx, F.y / 2, cz, () => box(b, 8, F.y, 8, C.stone, M_STONE));
  put(b, cx, F.y - 0.5, cz, () => box(b, 16, 1.0, 12, C.stonePale, M_MARBLE));
  put(b, cx, F.y + 0.9, cz + 5.6, () => box(b, 16.4, 1.6, 0.5, C.gold, M_GOLD));
  for (const sx of [-1, 1]) put(b, cx + sx * 8.2, F.y + 1.6, cz, () => box(b, 0.5, 3.2, 12.4, C.ironLight, M_METAL));

  // ---- dynamic wheel + hanging cabins ----------------------------------
  const wb = new B();
  buildWheelMesh(wb);
  const gb = new B();
  buildGondolaMesh(gb);
  const wheelTris = wb.i.length / 3, gondTris = gb.i.length / 3;

  if (ctx.gl && ctx.dyn) {
    const wBuilt = wb.build(ctx.gl);
    const wMesh = mesh(ctx.gl, wBuilt.verts, wBuilt.indices);
    ctx.dyn.push({
      name: 'ferrisWheel', kind: 'model', mesh: wMesh, prog: 'lit',
      model: (t) => trs([cx, hubY, cz], 0, 1, 0, t * 0.10),
    });
    const gBuilt = gb.build(ctx.gl);
    const gMesh = mesh(ctx.gl, gBuilt.verts, gBuilt.indices);
    const N = 16;
    ctx.dyn.push({
      name: 'ferrisCabins', kind: 'inst', mesh: gMesh, capacity: N,
      fill: (t, act) => {
        for (let i = 0; i < N; i++) {
          const th = t * 0.10 + (i / N) * TAU;
          const px = cx + Math.cos(th) * F.r, py = hubY + Math.sin(th) * F.r;
          const sway = Math.sin(t * 0.9 + i * 1.9) * 0.055;
          act.set(i, trs([px, py, cz], 0, 1, 0, sway), 0, 0, 1);
        }
        return N;
      },
    });
  }
  return { staticTris: 0, wheelTris, gondTris };
}

// wheel rim + spokes, in the XY plane, hub at the origin
function buildWheelMesh(wb) {
  torus(wb, 40, 0.55, 40, 4, C.gold, M_GOLD, 'z');
  torus(wb, 33, 0.32, 32, 3, C.brass, M_GOLD, 'z');
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU, c = Math.cos(a), s = Math.sin(a);
    bar3(wb, [c * 3.2, s * 3.2, 0], [c * 39.6, s * 39.6, 0], 0.42, 0.55, C.ironLight, M_METAL, [0, 0, 1]);
    const a2 = a + Math.PI / 16, c2 = Math.cos(a2), s2 = Math.sin(a2);
    bar3(wb, [c * 33, s * 33, 0], [c2 * 40, s2 * 40, 0], 0.26, 0.32, C.iron, M_METAL, [0, 0, 1]);
  }
  wb.push(m4.rotX(Math.PI / 2));
  cylinder(wb, 14, 3.4, 3.4, 5.0, C.ironLight, M_METAL, { caps: true, y0: -2.5 });
  wb.pop();
  wb.push(m4.rotX(Math.PI / 2));
  cylinder(wb, 10, 1.6, 1.6, 6.2, C.gold, M_GOLD, { caps: true, y0: -3.1 });
  wb.pop();
}

// one hanging cabin; origin at the point where it hangs from the rim
function buildGondolaMesh(gb) {
  put(gb, 0, -1.3, 0, () => box(gb, 0.32, 2.7, 0.32, C.iron, M_METAL));
  put(gb, 0, -2.7, 0, () => box(gb, 3.9, 0.35, 3.0, C.gold, M_GOLD));
  put(gb, 0, -4.0, 0, () => box(gb, 3.4, 2.6, 2.6, C.ballCream, [0.30, 0.25]));
  put(gb, 0, -4.0, 0, () => box(gb, 3.44, 1.15, 2.64, GLASS_DARK, [0.14, 0.7]));
  put(gb, 0, -5.45, 0, () => box(gb, 3.5, 0.3, 2.7, C.gold, M_GOLD));
}

// ================================================================ ENTRY POINT
export function buildLandmarks(b, ctx, rng) {
  const parts = {};
  const tri = () => b.i.length / 3;
  let n = tri();

  // round 7: the cathedral and the station moved to their own modules
  // (src/cathedral.js / src/station.js) so they can be hollow, enterable and axis
  // aligned. landmark.js keeps the glass palace and the ferris wheel; the three
  // shared rng() draws below are unchanged, so no other module shifts.
  try { buildGlassPalace(b, ctx, rng); } catch (e) { console.warn('[landmark] palace failed', e && e.message); }
  parts.glassPalace = tri() - n; n = tri();

  try {
    const f = buildFerrisWheel(b, ctx, rng);
    parts.ferrisStatic = tri() - n;
    parts.ferrisWheel = f.wheelTris;
    parts.ferrisCabins = f.gondTris * 16;
  } catch (e) { console.warn('[landmark] ferris failed', e && e.message); }
  n = tri();

  parts.total = parts.glassPalace + parts.ferrisStatic + parts.ferrisWheel + parts.ferrisCabins;
  ctx.landmarkParts = parts;
}



