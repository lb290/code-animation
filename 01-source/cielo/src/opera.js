// OPERA — round 8 · "CIELO 歌剧院": a grand, ENTERABLE Beaux-Arts opera house.
// OWNER: agent "opera".  Called by world.js as  buildOpera(b, ctx, rng).
//
// SITE CONTRACT (lead)   local frame: +x along the facade, +y up, +z toward the front.
//   anchor L.opera = { x: 104, z: -58, rot: +PI/2 }  ->  local +Z = world -X (facing the boulevard).
//   world(lx,ly,lz) = (104 - lz, ly, -58 + lx).
//   envelope  world x 77..131 (the front stair may reach x >= 67), z -94..-22, y 0..70.
//   local x +-36, local z -27..+36.8 (the extra is the front stair flight).
//
// PROGRAMME
//   exterior: rusticated podium + a 10-riser grand stair, a six-column portico with a
//     sculpture pediment, giant-order facade, a verdigris dome over the auditorium,
//     two corner pavilions with copper cupolas, a stage fly-tower, roof balustrade+statues.
//   interior: Grand Foyer (marble, double-flight twin stairs, arcades, mirrors, chandeliers,
//     statues), the horseshoe auditorium (3 tiers of boxes + parterre + painted dome +
//     the great chandelier + seats + stage + parted velvet curtain), a Salon, a stage and
//     a backstage.  You can fly in from the boulevard, up the steps and all the way in.
//
// DETERMINISM: local mulberry32 only; never draws from the shared rng.
// BUDGET: <= 150k tris. Check: node tools/opera-check.mjs
import { mulberry32, TAU, m4, clamp, lerp, norm, sub, add as vadd } from './math.js';
import { box, cylinder, lathe, torus, sphere, mulc, mixc, bar3 } from './geo.js';
import { MT, boxAt, ellipsoid, disc, extrudeXY } from './lib3d.js';
import { C } from './palette.js';
import { L } from './layout.js';
import { column as kColumn, archWindow, balustrade as kBal, pediment as kPediment, statue as kStatue } from './arch.js';

const PI = Math.PI;
const A = L.opera;
const AX = A.x, AZ = A.z, YAW = A.rot;
const W = (lx, ly, lz) => [AX - lz, ly, AZ + lx];
const FRAME = (() => {
  const c = Math.cos(YAW), s = Math.sin(YAW);
  return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, AX, 0, AZ, 1];
})();

// ------------------------------------------------------------------ massing (local, m)
const HALF_X = 34.8;
const FRONT = 27;
const BACK = -25.8;
const POD = 3.6;
const STAIR_N = 10;
const RISER = POD / STAIR_N;
const PORCH = 32.2;
const STEP_FRONT = 36.8;
const CHEEK_X = 24.0;
const STAIR_HX = 18.6;
const SIDE_TER = 29.5;
const GND_TOP = 14.2;
const MAIN_TOP = 25.2;
const CORN_TOP = 26.4;
const ROOF_Y = 27.4;
const ATTIC_TOP = 28.1;
const PARA_TOP = 29.5;
const DOME_CZ = -1.4;
const DRUM_R = 12.6;
const DRUM_Y0 = ROOF_Y, DRUM_Y1 = 41.2;
const DOME_Y1 = 57.7;
const LANT_Y1 = 63.4;
const PAV = { x0: 25.6, x1: 34.4, z0: 21.0, z1: 29.0, top: 30.6 };
const STG = { x: 18.0, z0: BACK, z1: -14.6, top: 33.2 };

// ------------------------------------------------------------------ interior (local, m)
const FY = POD;
const VX = 13.0, VZ0 = 21.0, VZ1 = 25.2, VCEIL = 14.4;
const FX = 26.0, FZ0 = 6.0, FZ1 = 20.4, FCEIL = 21.4;
const AXH = 17.0, AZ0 = -13.5, AZ1 = 6.0;
const TIER = [8.6, 12.3, 16.0];
const BAND_T = 0.55;
const AUD_TOP = 20.4;
const DOME_SPRING = 20.4, DOME_APEX = 26.7;
const SAL = { x0: 26.7, x1: 32.8, z0: 8.0, z1: 20.0, ceil: 12.4 };
const STAGE = { x: 14.0, z0: -21.0, z1: -14.5, h: 26.0 };
const BST = { x: 11.0, z0: BACK, z1: -21.0, h: 10.0 };
const GAL_Y = 8.6;

// ------------------------------------------------------------------ palette
const EXS = mulc(C.stone, 0.96), EXS_HI = mulc(C.stonePale, 1.0), EXS_W = mulc(C.stoneWarm, 0.98);
const EXS_SH = mulc(C.stoneCool, 0.92), EXM = mixc(C.marble, C.cloudLit, 0.12);
const EXG = C.gold, EXGH = C.goldBright, EXCU = C.copper;
const EXSL = mixc(C.slate, C.slateLight, 0.22), EXIRON = C.iron;
const EXGL = mixc(C.glassDeep, C.slateDark, 0.5), EXGLS = mixc(C.glass, C.horizon, 0.28);
const M_ST = [0.09, 0.10], M_STH = [0.11, 0.14], M_MAR = [0.10, 0.20], M_GOLD = [0.12, 0.86];
const M_CU = [0.06, 0.30], M_SL = [0.06, 0.24], M_GL = [0.13, 0.92], M_IRON = [0.05, 0.42];

const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const ia = (c, L0 = 0.52) => {
  const l = lum(c);
  if (l < 1e-5) return [L0, L0, L0];
  const k = L0 / l;
  return [c[0] * k, c[1] * k, c[2] * k];
};
const I_WALL = ia(mixc(C.stonePale, C.sunGlow, 0.14), 0.55);
const I_WALL_HI = ia(mixc(C.marble, C.sunGlow, 0.18), 0.60);
const I_WALL_SH = ia(mixc(C.stoneWarm, C.stoneCool, 0.30), 0.44);
const I_MARB = ia(mixc(C.marble, C.sunGlow, 0.10), 0.57);
const I_MARB_D = ia(mixc(C.marbleShade, C.stoneCool, 0.30), 0.46);
const I_FLOOR_A = ia(mixc(C.marble, C.cloudLit, 0.28), 0.60);
const I_FLOOR_B = ia(mixc(C.stoneCool, C.marble, 0.50), 0.47);
const I_GOLD = ia(C.gold, 0.48), I_GOLD_HI = ia(C.goldBright, 0.56), I_GOLD_D = ia(C.gold, 0.46);
const I_RED = [0.34, 0.07, 0.08];
const I_RED_HI = [0.46, 0.11, 0.12];
const I_BLUE = ia(mixc(C.glassDeep, C.slate, 0.42), 0.50);
const I_WOOD = ia(mixc(C.bronze, C.gold, 0.25), 0.46);
const I_DARK = ia(mixc(C.slateDark, C.stoneWarm, 0.22), 0.42);
const I_GLOW = ia(mixc(C.sunGlow, C.cloudLit, 0.32), 0.60);
const I_LAMP = ia(mixc(C.sunGlow, C.goldBright, 0.55), 0.62);
const I_SKY = ia(mixc(C.horizon, C.cloudLit, 0.28), 0.60);
const I_LEAF = ia(mixc(C.leaf, C.leafLight, 0.4), 0.46);
const MI = {
  wall: [0.11, 0.10], wallHi: [0.13, 0.16], wallSh: [0.10, 0.08],
  marble: [0.12, 0.22], marbleHi: [0.13, 0.30], floor: [0.11, 0.32], floorB: [0.11, 0.36],
  gold: [0.13, 0.86], goldHi: [0.14, 0.90], glow: [0.14, 0.04], red: [0.11, 0.06],
  wood: [0.11, 0.18], glass: [0.13, 0.70], iron: [0.10, 0.40], leaf: [0.12, 0.10], dark: [0.10, 0.10],
};

// ------------------------------------------------------------------ tiny helpers
const T = (x, y, z) => m4.translate([x, y, z]);
const PX = [1, 0, 0], NX = [-1, 0, 0], PY = [0, 1, 0], NY = [0, -1, 0], PZ = [0, 0, 1], NZ = [0, 0, -1];
function at(b, x, y, z, fn) { b.push(T(x, y, z)); fn(); b.pop(); }
function atR(b, x, y, z, yaw, fn) { b.push(T(x, y, z)); if (yaw) b.push(m4.rotY(yaw)); fn(); if (yaw) b.pop(); b.pop(); }
function bx(b, x0, x1, y0, y1, z0, z1, c, m, opts) {
  b.push(T((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2));
  box(b, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), c, m, opts);
  b.pop();
}
function qUp(b, y, x0, x1, z0, z1, c, m) { b.quad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], c, m, PY); }
function qDn(b, y, x0, x1, z0, z1, c, m) { b.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], c, m, NY); }
function qZp(b, z, x0, x1, y0, y1, c, m) { b.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], c, m, PZ); }
function qZn(b, z, x0, x1, y0, y1, c, m) { b.quad([x1, y0, z], [x0, y0, z], [x0, y1, z], [x1, y1, z], c, m, NZ); }
function qXp(b, x, z0, z1, y0, y1, c, m) { b.quad([x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0], c, m, PX); }
function qXn(b, x, z0, z1, y0, y1, c, m) { b.quad([x, y0, z1], [x, y0, z0], [x, y1, z0], [x, y1, z1], c, m, NX); }
function bar(b, p0, p1, w, h, c, m, up) { bar3(b, p0, p1, w, h, c, m, up || PY); }

// A pair of wall faces with openings.  axis 0: wall planes z = wA/wB, u = local x.
// axis 1: wall planes x = wA/wB, u = local z.  nA/nB are each face's outward normal.
// holes: {c,w,y0,ys} arched (semicircle from ys, radius w/2) or {c,w,y0,y1} rectangular.
function wallPanel(b, axis, u0, u1, y0, y1, wA, wB, nA, nB, holes, cA, cB, mA, mB, seg) {
  seg = seg || 8;
  const pt = axis === 0 ? (u, v, w) => [u, v, w] : (u, v, w) => [w, v, u];
  const uD = axis === 0 ? PX : PZ;
  const fA = (ua, ub, va, vb, c, m) => b.quad(pt(ua, va, wA), pt(ub, va, wA), pt(ub, vb, wA), pt(ua, vb, wA), c, m, nA);
  const fB = (ua, ub, va, vb, c, m) => b.quad(pt(ub, va, wB), pt(ua, va, wB), pt(ua, vb, wB), pt(ub, vb, wB), c, m, nB);
  const jamb = (U, va, vb, s, c) => b.quad(pt(U, va, wA), pt(U, va, wB), pt(U, vb, wB), pt(U, vb, wA), c, mA, [uD[0] * s, 0, uD[2] * s]);
  const sillQ = (ua, ub, v, c) => b.quad(pt(ua, v, wA), pt(ub, v, wA), pt(ub, v, wB), pt(ua, v, wB), c, mA, PY);
  const headQ = (ua, ub, v, c) => b.quad(pt(ua, v, wB), pt(ub, v, wB), pt(ub, v, wA), pt(ua, v, wA), c, mA, NY);
  const hs = holes.map((h) => ({ ...h, a: h.c - h.w / 2, b: h.c + h.w / 2 })).sort((p, q) => p.a - q.a);
  let u = u0;
  const solidCol = (ua, ub) => { if (ub - ua < 1e-4) return; fA(ua, ub, y0, y1, cA, mA); fB(ua, ub, y0, y1, cB, mB); };
  for (const h of hs) {
    const ub0 = Math.min(u1, h.b);
    if (ub0 <= u + 1e-4) continue;
    if (h.a > u) solidCol(u, h.a);
    const ua = Math.max(u0, h.a, u), ub = ub0;
    if (ub - ua < 1e-4) { u = Math.max(u, h.b); continue; }
    if (h.y0 > y0 + 1e-4) { fA(ua, ub, y0, h.y0, cA, mA); fB(ua, ub, y0, h.y0, cB, mB); }
    if (h.y1 !== undefined) {
      if (h.y1 < y1 - 1e-4) { fA(ua, ub, h.y1, y1, cA, mA); fB(ua, ub, h.y1, y1, cB, mB); }
      jamb(ua, h.y0, Math.min(h.y1, y1), 1, cA);
      jamb(ub, h.y0, Math.min(h.y1, y1), -1, cA);
      if (h.y0 > y0 + 1e-4) sillQ(ua, ub, h.y0, cA);
      if (h.y1 < y1 - 1e-4) headQ(ua, ub, h.y1, cA);
    } else {
      const uc = h.c, ys = h.ys, r = h.w / 2, crown = ys + r;
      jamb(uc - r, h.y0, ys, 1, cA);
      jamb(uc + r, h.y0, ys, -1, cA);
      for (let i = 0; i < seg; i++) {
        const a0 = PI * (i / seg), a1 = PI * ((i + 1) / seg);
        const s0 = [uc + Math.cos(a0) * r, ys + Math.sin(a0) * r];
        const s1 = [uc + Math.cos(a1) * r, ys + Math.sin(a1) * r];
        const am = (a0 + a1) / 2;
        const ns = [-Math.cos(am) * uD[0], -Math.sin(am), -Math.cos(am) * uD[2]];
        b.quad(pt(s0[0], s0[1], wA), pt(s1[0], s1[1], wA), pt(s1[0], s1[1], wB), pt(s0[0], s0[1], wB), cB, mB, ns);
      }
      if (crown < y1 - 1e-4) { fA(ua, ub, crown, y1, cA, mA); fB(ua, ub, crown, y1, cB, mB); }
    }
    u = Math.max(u, h.b);
  }
  if (u < u1) solidCol(u, u1);
  for (const h of hs) {
    if (h.y1 !== undefined) continue;
    const uc = h.c, ys = h.ys, r = h.w / 2, crown = ys + r;
    const ua = Math.max(u0, h.a), ub = Math.min(u1, h.b);
    for (let i = 0; i < seg; i++) {
      const a0 = PI * (i / seg), a1 = PI * ((i + 1) / seg);
      const s0 = [uc + Math.cos(a0) * r, ys + Math.sin(a0) * r];
      const s1 = [uc + Math.cos(a1) * r, ys + Math.sin(a1) * r];
      const x0 = clamp(s0[0], ua, ub), x1 = clamp(s1[0], ua, ub);
      if (Math.abs(x1 - x0) < 1e-5) continue;
      const yTop = Math.min(crown, y1);
      if (s0[1] > yTop - 1e-4 || s1[1] > yTop - 1e-4) continue;
      b.quad(pt(x0, s0[1], wA), pt(x1, s1[1], wA), pt(x1, yTop, wA), pt(x0, yTop, wA), cA, mA, nA);
      b.quad(pt(x1, s1[1], wB), pt(x0, s0[1], wB), pt(x0, yTop, wB), pt(x1, yTop, wB), cB, mB, nB);
    }
  }
}

// horizontal slab with rectangular holes in (x,z)
function flatPanel(b, x0, x1, z0, z1, y, up, holes, c, m, tile, c2) {
  const N = up ? PY : NY;
  tile = tile || 0;
  const emit = (xa, xb, za, zb) => {
    if (xb - xa < 1e-4 || zb - za < 1e-4) return;
    let cc = c;
    if (tile > 0 && c2) {
      const ix = Math.floor((xa - x0) / tile + 1e-3), iz = Math.floor((za - z0) / tile + 1e-3);
      cc = ((ix + iz) & 1) ? c2 : c;
    }
    if (up) b.quad([xa, y, za], [xa, y, zb], [xb, y, zb], [xb, y, za], cc, m, N);
    else b.quad([xa, y, za], [xb, y, za], [xb, y, zb], [xa, y, zb], cc, m, N);
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

// An arched glass window with gold tracery filling a wall opening plane.
// axis 0: pane in the local XY plane at z = wp ; nOut = +-1. axis 1: at x = wp.
function winArch(b, axis, c, w, y0, ys, wp, nOut, cG, mG, cF, mF, tracery) {
  const r = w / 2;
  const pt = axis === 0 ? (u, v) => [u, v, wp] : (u, v) => [wp, v, u];
  const N = axis === 0 ? [0, 0, nOut] : [nOut, 0, 0];
  const q = (a, bb, va, vb, cc, mm) => b.quad(pt(a, va), pt(bb, va), pt(bb, vb), pt(a, vb), cc, mm, N);
  q(c - r, c + r, y0, ys, cG, mG);
  for (let i = 0; i < 6; i++) {
    const a0 = PI * (i / 6), a1 = PI * ((i + 1) / 6);
    b.tri(pt(c, ys), pt(c + Math.cos(a0) * r, ys + Math.sin(a0) * r), pt(c + Math.cos(a1) * r, ys + Math.sin(a1) * r), cG, mG, N, N, N);
  }
  if (!tracery) return;
  const fw = Math.max(0.08, w * 0.02);
  for (const uu of [c - r / 3, c + r / 3]) q(uu - fw, uu + fw, y0, ys, cF, mF);
  const ym = y0 + (ys - y0) * 0.52;
  q(c - r, c + r, ym - fw, ym + fw, cF, mF);
  q(c - r - fw * 2, c - r, y0, ys, cF, mF);
  q(c + r, c + r + fw * 2, y0, ys, cF, mF);
  for (let i = 0; i < 10; i++) {
    const a0 = PI * (i / 10), a1 = PI * ((i + 1) / 10);
    const p0 = [c + Math.cos(a0) * r, ys + Math.sin(a0) * r], p1 = [c + Math.cos(a1) * r, ys + Math.sin(a1) * r];
    const p2 = [c + Math.cos(a1) * (r + fw * 2), ys + Math.sin(a1) * (r + fw * 2)], p3 = [c + Math.cos(a0) * (r + fw * 2), ys + Math.sin(a0) * (r + fw * 2)];
    b.quad(pt(p0[0], p0[1]), pt(p1[0], p1[1]), pt(p2[0], p2[1]), pt(p3[0], p3[1]), cF, mF, N);
  }
}

// band of cornice boxes around a rectangle (projecting out by out)
function corniceBand(b, x0, x1, z0, z1, y, h, out, c, m, rich) {
  const o1 = out, h1 = h * 0.45;
  bx(b, x0 - o1 * 0.4, x1 + o1 * 0.4, y, y + h1, z1, z1 + o1 * 0.5, mulc(c, 0.97), m, { topCol: mulc(c, 1.02) });
  bx(b, x0 - o1 * 0.4, x1 + o1 * 0.4, y, y + h1, z0 - o1 * 0.5, z0, mulc(c, 0.9), m, { topCol: mulc(c, 1.01) });
  bx(b, x1, x1 + o1 * 0.5, y, y + h1, z0, z1, mulc(c, 0.95), m, { topCol: mulc(c, 1.02) });
  bx(b, x0 - o1 * 0.5, x0, y, y + h1, z0, z1, mulc(c, 0.93), m, { topCol: mulc(c, 1.02) });
  bx(b, x0 - o1, x1 + o1, y + h1, y + h * 0.8, z1, z1 + o1, c, m, { topCol: mulc(c, 1.04) });
  bx(b, x0 - o1, x1 + o1, y + h1, y + h * 0.8, z0 - o1, z0, mulc(c, 0.92), m);
  bx(b, x1, x1 + o1, y + h1, y + h * 0.8, z0 - o1, z1 + o1, mulc(c, 0.97), m);
  bx(b, x0 - o1, x0, y + h1, y + h * 0.8, z0 - o1, z1 + o1, mulc(c, 0.95), m);
  bx(b, x0 - o1 * 1.05, x1 + o1 * 1.05, y + h * 0.8, y + h, z1 - 0.1, z1 + o1 * 1.2, mulc(c, 1.05), m, { topCol: mulc(c, 1.07) });
  bx(b, x0 - o1 * 1.05, x1 + o1 * 1.05, y + h * 0.8, y + h, z0 - o1 * 1.2, z0 + 0.1, mulc(c, 0.94), m);
  bx(b, x1 - 0.1, x1 + o1 * 1.2, y + h * 0.8, y + h, z0, z1, c, m);
  bx(b, x0 - o1 * 1.2, x0 + 0.1, y + h * 0.8, y + h, z0, z1, mulc(c, 0.97), m);
  if (rich) {
    const n = Math.max(3, Math.floor((x1 - x0) / 1.1));
    for (let i = 0; i < n; i++) {
      const cx = x0 + ((x1 - x0) / n) * (i + 0.5);
      bx(b, cx - 0.16, cx + 0.16, y + h * 0.42, y + h * 0.66, z1 + o1, z1 + o1 + 0.14, mulc(c, 0.78), m);
    }
  }
}

// horizontal rustication joints on a front-facing plane
function rustZ(b, z, x0, x1, y0, y1, c, rows) {
  const n = rows || Math.max(2, Math.round((y1 - y0) / 1.35));
  for (let i = 1; i < n; i++) {
    const y = y0 + (y1 - y0) * (i / n);
    b.quad([x0, y, z], [x1, y, z], [x1, y + 0.075, z], [x0, y + 0.075, z], mulc(c, 0.74), M_ST, PZ);
  }
}
// horizontal rustication joints on a +-x-facing plane
function rustX(b, x, z0, z1, y0, y1, c, nrm, rows) {
  const n = rows || Math.max(2, Math.round((y1 - y0) / 1.35));
  for (let i = 1; i < n; i++) {
    const y = y0 + (y1 - y0) * (i / n);
    if (nrm > 0) b.quad([x, y, z0], [x, y, z1], [x, y + 0.075, z1], [x, y + 0.075, z0], mulc(c, 0.74), M_ST, PX);
    else b.quad([x, y, z1], [x, y, z0], [x, y + 0.075, z0], [x, y + 0.075, z1], mulc(c, 0.74), M_ST, NX);
  }
}

// robed figure (statue / allegory); built at the current origin, base y=0
function fig(b, col, mat, s, yaw) {
  s = s || 1;
  if (yaw) b.push(m4.rotY(yaw));
  b.push(m4.scale([s, s, s]));
  lathe(b, [[0.62, 0], [0.5, 0.35], [0.34, 0.95], [0.3, 1.35], [0.34, 1.5]], 8, col, mat);
  b.push(T(0, 1.55, 0));
  ellipsoid(b, 0.3, 0.36, 0.22, 8, 4, col, mat);
  b.push(T(0, 0.5, 0));
  ellipsoid(b, 0.19, 0.22, 0.19, 7, 4, col, mat);
  b.pop(); b.pop();
  for (const sx of [-1, 1]) {
    b.push(T(sx * 0.3, 1.6, 0.05));
    cylinder(b, 6, 0.11, 0.08, 0.75, col, mat, { y0: -0.2, caps: true });
    b.pop();
  }
  b.pop();
  if (yaw) b.pop();
}

// exterior statue on a two-step pedestal
function statueAt(b, x, y, z, s, col, yaw) {
  atR(b, x, y, z, yaw || 0, () => {
    bx(b, -0.55 * s, 0.55 * s, 0, 0.7 * s, -0.55 * s, 0.55 * s, EXM, M_MAR, { topCol: mulc(EXM, 1.04) });
    bx(b, -0.68 * s, 0.68 * s, 0.7 * s, 0.86 * s, -0.68 * s, 0.68 * s, EXS_HI, M_STH, { topCol: mulc(EXS_HI, 1.06) });
    at(b, 0, 0.86 * s, 0, () => fig(b, col || EXM, M_MAR, s));
  });
}

// urn / finial
function urnAt(b, x, y, z, s, col) {
  at(b, x, y, z, () => {
    b.push(m4.scale([s, s, s]));
    lathe(b, [[0.34, 0], [0.42, 0.12], [0.3, 0.4], [0.5, 0.62], [0.52, 0.78], [0.34, 0.92], [0.26, 0.98]], 8, col || EXGH, M_MAR);
    b.pop();
  });
}

// interior chandelier (also emits a glow billboard)
function chandelier(b, ctx, x, y, z, s, glow) {
  bx(b, x - 0.07, x + 0.07, y + 0.2, y + 3.0, z - 0.07, z + 0.07, I_GOLD_D, MI.gold);
  at(b, x, y, z, () => {
    b.push(m4.scale([s, s, s]));
    torus(b, 1.25, 0.09, 26, 5, I_GOLD, MI.gold, 'y');
    torus(b, 0.72, 0.07, 20, 4, I_GOLD_HI, MI.goldHi, 'y');
    torus(b, 0.34, 0.06, 14, 3, I_GOLD, MI.gold, 'y');
    for (let i = 0; i < 3; i++) {
      b.push(T(0, -0.12 * i - 0.06, 0));
      ellipsoid(b, 0.3 - i * 0.07, 0.24, 0.3 - i * 0.07, 7, 4, I_GOLD_HI, MI.goldHi);
      b.pop();
    }
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU, rr = i % 2 ? 0.72 : 1.25;
      const px = Math.cos(a) * rr, pz = Math.sin(a) * rr;
      b.push(T(px, 0.16, pz));
      cylinder(b, 5, 0.055, 0.04, 0.4, I_GLOW, MI.glow, { y0: 0, caps: true });
      b.pop();
      b.push(T(px, 0.6, pz));
      ellipsoid(b, 0.075, 0.12, 0.075, 5, 3, I_GLOW, MI.glow);
      b.pop();
    }
    b.pop();
  });
  if (glow !== false && ctx.lanterns) ctx.lanterns.push({ p: W(x, y + 0.3, z), size: 4.2 * s, rot: 0, alpha: 0.34, shape: 1, col: mixc(C.sunGlow, C.goldBright, 0.4) });
}

// wall sconce (warm bowl of candles) + billboard
function sconce(b, ctx, x, y, z, yaw) {
  atR(b, x, y, z, yaw || 0, () => {
    bx(b, -0.14, 0.14, 0.0, 0.62, 0.0, 0.2, I_GOLD, MI.gold);
    bx(b, -0.4, 0.4, 0.55, 0.68, 0.05, 0.3, I_GOLD_HI, MI.goldHi);
    for (const sx of [-1, 0, 1]) bx(b, sx * 0.36 - 0.09, sx * 0.36 + 0.09, 0.68, 1.0, 0.1, 0.28, I_GLOW, MI.glow);
  });
  if (ctx.lanterns) {
    const dx = Math.sin(yaw || 0) * 0.45, dz = Math.cos(yaw || 0) * 0.45;
    ctx.lanterns.push({ p: W(x + dx, y + 0.85, z + dz), size: 1.7, rot: 0, alpha: 0.42, shape: 1, col: mixc(C.sunGlow, C.goldBright, 0.35) });
  }
}

// parterre seat (local origin at the seat centre, facing -z toward the stage)
function seat(b, x, y, z) {
  const w = 0.52;
  bx(b, x - w / 2, x + w / 2, y + 0.42, y + 0.52, z - 0.24, z + 0.2, I_RED, MI.red);
  bx(b, x - w / 2, x + w / 2, y + 0.52, y + 1.02, z + 0.16, z + 0.26, I_RED, MI.red, { topCol: mulc(I_RED, 1.08) });
  bx(b, x - w / 2 - 0.02, x + w / 2 + 0.02, y + 0.98, y + 1.04, z + 0.2, z + 0.3, I_GOLD_D, MI.gold);
  bx(b, x - 0.06, x - 0.02, y, y + 0.42, z - 0.2, z + 0.24, I_WOOD, MI.wood);
  bx(b, x + 0.02, x + 0.06, y, y + 0.42, z - 0.2, z + 0.24, I_WOOD, MI.wood);
}

// gold-framed mural / wall panel on a z-facing plane (dir = +1 faces +Z, -1 faces -Z)
function artPanelZ(b, z, dir, x0, x1, y0, y1) {
  const zz = z + dir * 0.035;
  const Q = dir > 0 ? qZp : qZn;
  const c1 = mixc(I_SKY, I_BLUE, 0.35), c2 = mixc(I_WALL_HI, I_GOLD, 0.24), c3 = mixc(I_BLUE, I_WALL, 0.28);
  Q(b, zz, x0, x1, y0, y1, c1, MI.wall);
  Q(b, zz, x0, x1, y0 + (y1 - y0) * 0.52, y1, c2, MI.wall);
  Q(b, zz, x0, x1, y0 + (y1 - y0) * 0.2, y0 + (y1 - y0) * 0.52, c3, MI.wall);
  const fw = 0.24, d = 0.18, za = Math.min(z, z + dir * d), zb = Math.max(z, z + dir * d);
  bx(b, x0 - fw, x1 + fw, y0 - fw, y0, za, zb, I_GOLD, MI.gold, { topCol: mulc(I_GOLD, 1.06) });
  bx(b, x0 - fw, x1 + fw, y1, y1 + fw, za, zb, I_GOLD, MI.gold);
  bx(b, x0 - fw, x0, y0, y1, za, zb, I_GOLD, MI.gold);
  bx(b, x1, x1 + fw, y0, y1, za, zb, I_GOLD, MI.gold);
  bx(b, x0 + 0.1, x1 - 0.1, y0 + 0.1, y0 + 0.18, Math.min(z, z + dir * (d + 0.03)), Math.max(z, z + dir * (d + 0.03)), I_GOLD_HI, MI.goldHi);
}
// gold-framed panel on an x-facing plane (dir = +1 faces +X, -1 faces -X)
function artPanelX(b, x, dir, z0, z1, y0, y1) {
  const xx = x + dir * 0.035;
  const Q = dir > 0 ? qXp : qXn;
  const c1 = mixc(I_SKY, I_BLUE, 0.32), c2 = mixc(I_WALL_HI, I_GOLD, 0.22), c3 = mixc(I_BLUE, I_WALL, 0.26);
  Q(b, xx, z0, z1, y0, y1, c1, MI.wall);
  Q(b, xx, z0, z1, y0 + (y1 - y0) * 0.5, y1, c2, MI.wall);
  Q(b, xx, z0, z1, y0 + (y1 - y0) * 0.18, y0 + (y1 - y0) * 0.5, c3, MI.wall);
  const fw = 0.22, d = 0.16, xa = Math.min(x, x + dir * d), xb = Math.max(x, x + dir * d);
  bx(b, xa, xb, y0 - fw, y0, z0 - fw, z1 + fw, I_GOLD, MI.gold, { topCol: mulc(I_GOLD, 1.06) });
  bx(b, xa, xb, y1, y1 + fw, z0 - fw, z1 + fw, I_GOLD, MI.gold);
  bx(b, xa, xb, y0, y1, z0 - fw, z0, I_GOLD, MI.gold);
  bx(b, xa, xb, y0, y1, z1, z1 + fw, I_GOLD, MI.gold);
}
// flat pilaster strip on an x-facing wall
function pilasterX(b, x, dir, zc, y0, y1, w) {
  const xa = Math.min(x, x + dir * 0.26), xb = Math.max(x, x + dir * 0.26);
  bx(b, xa, xb, y0, y1, zc - w / 2, zc + w / 2, I_MARB, MI.marbleHi);
  bx(b, xa, xb, y0, y0 + 0.26, zc - w / 2 - 0.06, zc + w / 2 + 0.06, I_GOLD, MI.gold);
  bx(b, xa, xb, y1 - 0.34, y1, zc - w / 2 - 0.1, zc + w / 2 + 0.1, I_GOLD_HI, MI.goldHi);
}
// a standing marble statue on a plinth (interior prop)
function plinthStatue(b, x, z, s, yaw, col, mat) {
  bx(b, x - 0.62 * s, x + 0.62 * s, FY, FY + 0.85 * s, z - 0.62 * s, z + 0.62 * s, I_MARB, MI.marble, { topCol: mulc(I_MARB, 1.05) });
  bx(b, x - 0.72 * s, x + 0.72 * s, FY + 0.85 * s, FY + 0.98 * s, z - 0.72 * s, z + 0.72 * s, I_MARB_D, MI.marble);
  at(b, x, FY + 0.98 * s, z, () => fig(b, col, mat, s, yaw || 0));
}
// a great marble urn on a plinth (interior prop)
function plinthUrn(b, x, z, s) {
  bx(b, x - 0.6 * s, x + 0.6 * s, FY, FY + 0.8 * s, z - 0.6 * s, z + 0.6 * s, I_MARB, MI.marble, { topCol: mulc(I_MARB, 1.05) });
  bx(b, x - 0.7 * s, x + 0.7 * s, FY + 0.8 * s, FY + 0.92 * s, z - 0.7 * s, z + 0.7 * s, I_GOLD, MI.gold);
  at(b, x, FY + 0.92 * s, z, () => urnAt(b, 0, 0, 0, 1.55 * s, I_GOLD_HI));
}

// a gilded floor lamp / torchère (interior), with a glow billboard
function floorLamp(b, ctx, x, y, z, h) {
  bx(b, x - 0.42, x + 0.42, y, y + 0.3, z - 0.42, z + 0.42, I_MARB_D, MI.marble);
  bx(b, x - 0.16, x + 0.16, y + 0.3, y + 0.5, z - 0.16, z + 0.16, I_GOLD, MI.gold);
  bx(b, x - 0.09, x + 0.09, y + 0.5, y + h, z - 0.09, z + 0.09, I_MARB, MI.marbleHi);
  bx(b, x - 0.3, x + 0.3, y + h, y + h + 0.22, z - 0.3, z + 0.3, I_GOLD, MI.gold, { topCol: mulc(I_GOLD, 1.06) });
  for (const dx of [-1, 0, 1]) {
    bx(b, x + dx * 0.36 - 0.065, x + dx * 0.36 + 0.065, y + h + 0.22, y + h + 0.62, z - 0.065, z + 0.065, I_GOLD_HI, MI.goldHi);
    bx(b, x + dx * 0.36 - 0.05, x + dx * 0.36 + 0.05, y + h + 0.62, y + h + 0.98, z - 0.05, z + 0.05, I_LAMP, MI.glow);
  }
  if (ctx.lanterns) ctx.lanterns.push({ p: W(x, y + h + 0.8, z), size: 2.4, rot: 0, alpha: 0.36, shape: 1, col: mixc(C.sunGlow, C.goldBright, 0.4) });
}

// ================================================================ SITE
function buildSite(b, ctx, R) {
  // podium mass (solid base of the house)
  bx(b, -HALF_X, HALF_X, -0.02, POD, BACK, FRONT, EXS_SH, M_ST, { topCol: EXM });
  bx(b, -HALF_X, -19.0, -0.02, POD, FRONT, SIDE_TER, EXS_SH, M_ST, { topCol: EXM });
  bx(b, 19.0, HALF_X, -0.02, POD, FRONT, SIDE_TER, EXS_SH, M_ST, { topCol: EXM });
  bx(b, -19.0, 19.0, -0.02, POD, FRONT, PORCH, EXS_SH, M_ST, { topCol: EXM });
  // rusticated podium faces
  rustZ(b, FRONT + 0.012, -19.0, 19.0, 0.0, POD, EXS_SH, 3);
  rustZ(b, SIDE_TER + 0.012, -HALF_X, -19.0, 0.0, POD, EXS_SH, 3);
  rustZ(b, SIDE_TER + 0.012, 19.0, HALF_X, 0.0, POD, EXS_SH, 3);
  rustX(b, HALF_X + 0.012, BACK, SIDE_TER, 0, POD, EXS_SH, 1, 4);
  rustX(b, -HALF_X - 0.012, BACK, SIDE_TER, 0, POD, EXS_SH, -1, 4);
  // podium cornice + terrace paving
  corniceBand(b, -HALF_X, HALF_X, BACK, FRONT, POD - 0.55, 0.55, 0.3, EXS_HI, M_STH, false);
  bx(b, -HALF_X - 0.3, HALF_X + 0.3, POD - 0.05, POD, BACK - 0.1, FRONT + 0.3, EXM, M_MAR, { topCol: mulc(EXM, 1.03) });
  bx(b, -HALF_X - 0.3, -19.0, POD - 0.05, POD, FRONT, SIDE_TER + 0.3, EXM, M_MAR, { topCol: mulc(EXM, 1.03) });
  bx(b, 19.0, HALF_X + 0.3, POD - 0.05, POD, FRONT, SIDE_TER + 0.3, EXM, M_MAR, { topCol: mulc(EXM, 1.03) });
  bx(b, -19.0, 19.0, POD - 0.05, POD, FRONT, PORCH + 0.3, EXM, M_MAR, { topCol: mulc(EXM, 1.03) });
  // grand stair: 10 treads / 10 risers
  const run = STEP_FRONT - PORCH;
  for (let k = 0; k < STAIR_N; k++) {
    const z1 = STEP_FRONT - k * (run / STAIR_N);
    const top = (k + 1) * RISER;
    bx(b, -STAIR_HX, STAIR_HX, -0.02, top, PORCH, z1, k % 2 ? mulc(EXS_HI, 0.99) : EXS_HI, M_STH, { topCol: mulc(EXM, 1.02) });
    bx(b, -STAIR_HX, STAIR_HX, top - 0.05, top, z1 - 0.08, z1, EXM, M_MAR);
  }
  // stair cheek piers + coping + urns
  for (const s of [-1, 1]) {
    const xa = s > 0 ? STAIR_HX : -CHEEK_X, xb = s > 0 ? CHEEK_X : -STAIR_HX;
    bx(b, xa, xb, -0.02, POD + 0.85, PORCH - 1.4, STEP_FRONT, EXS, M_ST, { topCol: mulc(EXS, 1.02) });
    rustZ(b, STEP_FRONT + 0.012, xa, xb, 0, POD + 0.85, EXS, 3);
    bx(b, xa - 0.12, xb + 0.12, POD + 0.85, POD + 1.06, PORCH - 1.55, STEP_FRONT + 0.16, EXS_HI, M_STH, { topCol: mulc(EXS_HI, 1.05) });
    bx(b, xa, xb, 0, POD + 1.5, PORCH - 2.2, PORCH - 1.2, EXS, M_ST, { topCol: mulc(EXS, 1.04) });
    bx(b, xa - 0.14, xb + 0.14, POD + 1.5, POD + 1.7, PORCH - 2.36, PORCH - 1.04, EXS_HI, M_STH);
    urnAt(b, (xa + xb) / 2, POD + 1.7, PORCH - 1.7, 1.5, EXGH);
    // niche panels on the outer face of each cheek
    const xn = s > 0 ? xb - 0.05 : xa + 0.05;
    for (let i = 0; i < 2; i++) {
      const zc = 30.2 + i * 2.3;
      if (s > 0) qXp(b, xn, zc - 0.55, zc + 0.55, POD + 0.12, POD + 1.42, mulc(EXS_SH, 0.9), M_ST);
      else qXn(b, xn, zc - 0.55, zc + 0.55, POD + 0.12, POD + 1.42, mulc(EXS_SH, 0.9), M_ST);
    }
  }
  // flanking lamp standards on the side terraces
  for (const s of [-1, 1]) {
    const lx = s * 22.0, lz = SIDE_TER - 0.9;
    bx(b, lx - 0.45, lx + 0.45, POD, POD + 0.5, lz - 0.45, lz + 0.45, EXM, M_MAR);
    bx(b, lx - 0.26, lx + 0.26, POD + 0.5, POD + 4.6, lz - 0.26, lz + 0.26, EXIRON, M_IRON);
    bx(b, lx - 0.5, lx + 0.5, POD + 4.6, POD + 4.9, lz - 0.5, lz + 0.5, EXG, M_GOLD);
    at(b, lx, POD + 4.9, lz, () => ellipsoid(b, 0.42, 0.55, 0.42, 8, 5, mixc(C.sunGlow, C.cloudLit, 0.4), MI.glow));
    if (ctx.lanterns) ctx.lanterns.push({ p: W(lx, POD + 4.9, lz), size: 3.4, rot: 0, alpha: 0.42, shape: 1, col: mixc(C.sunGlow, C.goldBright, 0.35) });
    if (ctx.points) ctx.points.push({ p: W(lx, POD + 5.0, lz), col: mixc(C.sunGlow, C.goldBright, 0.32), range: 26, int: 0.55 });
  }
}

// ================================================================ EXTERIOR SHELL
function buildExterior(b, ctx, R) {
  // ---------- front facade: ground storey with the three real entrance doors
  wallPanel(b, 0, -HALF_X, HALF_X, POD, GND_TOP, FRONT, FRONT - 1.8, PZ, NZ, [
    { c: 0, w: 6.0, y0: POD, ys: 9.4 },
    { c: -8.0, w: 3.6, y0: POD, ys: 8.6 },
    { c: 8.0, w: 3.6, y0: POD, ys: 8.6 },
  ], EXS, I_WALL_SH, M_ST, MI.wallSh);
  rustZ(b, FRONT + 0.012, -HALF_X, HALF_X, POD, GND_TOP, EXS, 8);
  bx(b, -HALF_X - 0.1, HALF_X + 0.1, POD, POD + 0.55, FRONT - 0.1, FRONT + 0.34, EXS_HI, M_STH, { topCol: mulc(EXS_HI, 1.04) });
  // door surrounds: mouldings + keystones + gold fillets + folded bronze leaves
  for (const dd of [[0, 6.0, 9.4], [-8.0, 3.6, 8.6], [8.0, 3.6, 8.6]]) {
    const c = dd[0], w = dd[1], ys = dd[2], r = w / 2, zf = FRONT + 0.06;
    for (const s of [-1, 1]) {
      qZp(b, zf, c + s * r - 0.5, c + s * r, POD, ys, EXM, M_MAR);
      qZp(b, zf + 0.05, c + s * r - 0.36, c + s * r - 0.12, POD + 0.1, ys - 0.1, EXG, M_GOLD);
    }
    for (let i = 0; i < 9; i++) {
      const a0 = PI * (i / 9), a1 = PI * ((i + 1) / 9);
      const p0 = [c + Math.cos(a0) * r, ys + Math.sin(a0) * r], p1 = [c + Math.cos(a1) * r, ys + Math.sin(a1) * r];
      const p2 = [c + Math.cos(a1) * (r + 0.5), ys + Math.sin(a1) * (r + 0.5)], p3 = [c + Math.cos(a0) * (r + 0.5), ys + Math.sin(a0) * (r + 0.5)];
      b.quad([p0[0], p0[1], zf], [p1[0], p1[1], zf], [p2[0], p2[1], zf], [p3[0], p3[1], zf], EXM, M_MAR, PZ);
    }
    bx(b, c - 0.34, c + 0.34, ys + r - 0.15, ys + r + 1.05, FRONT, FRONT + 0.42, EXS_HI, M_STH, { topCol: mulc(EXS_HI, 1.06) });
    bx(b, c - 0.2, c + 0.2, ys + r + 0.05, ys + r + 0.9, FRONT + 0.4, FRONT + 0.5, EXG, M_GOLD);
    // lit transom + fanlight in the head of the door arch
    winArch(b, 0, c, w - 0.45, ys - 0.3, ys, FRONT + 0.04, 1, I_LAMP, MI.glow, EXG, M_GOLD, true);
    // gilt wreath over the keystone
    at(b, 0, ys + r + 0.62, FRONT + 0.2, () => {
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * TAU;
        bx(b, c + Math.cos(a) * 0.52 - 0.1, c + Math.cos(a) * 0.52 + 0.1, Math.sin(a) * 0.52 - 0.1, Math.sin(a) * 0.52 + 0.1, 0, 0.16, EXG, M_GOLD);
      }
      bx(b, c - 0.14, c + 0.14, -0.14, 0.14, 0.0, 0.18, EXGH, M_GOLD);
    });
    for (const s of [-1, 1]) {
      const xa = c + s * r * 0.98, xb = xa + s * 1.55;
      bx(b, Math.min(xa, xb), Math.max(xa, xb), POD + 0.05, POD + 4.9, FRONT - 1.7, FRONT - 1.45, mixc(C.bronze, C.iron, 0.55), M_IRON);
      for (let k = 0; k < 3; k++) bx(b, Math.min(xa, xb) + 0.1, Math.max(xa, xb) - 0.1, POD + 0.7 + k * 1.5, POD + 0.85 + k * 1.5, FRONT - 1.44, FRONT - 1.4, EXGH, M_GOLD);
    }
  }
  // niches with allegorical statues between the doors
  for (const x of [-12.0, 12.0, -4.4, 4.4]) {
    const w = (x < -6 || x > 6) ? 2.0 : 1.5;
    qZp(b, FRONT + 0.02, x - w / 2, x + w / 2, POD + 0.9, POD + 3.6, mulc(EXS_SH, 0.86), M_ST);
    bx(b, x - w / 2 - 0.12, x + w / 2 + 0.12, POD + 0.78, POD + 0.95, FRONT, FRONT + 0.2, EXS_HI, M_STH);
    at(b, x, POD + 0.95, FRONT - 0.35, () => fig(b, EXM, M_MAR, 0.72));
  }
  // outer-bay ground windows: warm lit glass with gilt tracery + stone moulding
  for (const x of [-21.5, -27.5, -33.0, 21.5, 27.5, 33.0]) {
    const wy = POD + 1.7;
    winArch(b, 0, x, 2.6, wy + 0.15, wy + 4.9, FRONT + 0.03, 1, I_LAMP, MI.glow, EXG, M_GOLD, true);
    for (const s2 of [-1, 1]) qZp(b, FRONT + 0.06, x + s2 * 1.3 - 0.36, x + s2 * 1.3, wy, wy + 4.9, EXM, M_MAR);
    for (let i = 0; i < 8; i++) {
      const a0 = PI * (i / 8), a1 = PI * ((i + 1) / 8);
      const p0 = [x + Math.cos(a0) * 1.3, wy + 4.9 + Math.sin(a0) * 1.3], p1 = [x + Math.cos(a1) * 1.3, wy + 4.9 + Math.sin(a1) * 1.3];
      const p2 = [x + Math.cos(a1) * 1.62, wy + 4.9 + Math.sin(a1) * 1.62], p3 = [x + Math.cos(a0) * 1.62, wy + 4.9 + Math.sin(a0) * 1.62];
      b.quad([p0[0], p0[1], FRONT + 0.07], [p1[0], p1[1], FRONT + 0.07], [p2[0], p2[1], FRONT + 0.07], [p3[0], p3[1], FRONT + 0.07], EXM, M_MAR, PZ);
    }
    bx(b, x - 2.0, x + 2.0, POD + 1.45, POD + 1.66, FRONT, FRONT + 0.5, EXS_HI, M_STH, { topCol: mulc(EXS_HI, 1.04) });
    bx(b, x - 0.2, x + 0.2, wy + 6.2, wy + 7.1, FRONT, FRONT + 0.4, EXS_HI, M_STH);
  }
  // attic row of lit oval windows (the house reads as an opera at night)
  for (const x of [-30.0, -25.0, -20.0, 20.0, 25.0, 30.0]) {
    const cy = CORN_TOP + 1.5;
    at(b, 0, 0, FRONT - 0.28, () => {
      disc(b, 1.05, 16, I_LAMP, MI.glow, { y: 0, center: [x, cy, 0] });
      for (let i = 0; i < 18; i++) {
        const a0 = (i / 18) * TAU, a1 = ((i + 1) / 18) * TAU;
        const p0 = [x + Math.cos(a0) * 1.05, cy + Math.sin(a0) * 1.05], p1 = [x + Math.cos(a1) * 1.05, cy + Math.sin(a1) * 1.05];
        const p2 = [x + Math.cos(a1) * 1.35, cy + Math.sin(a1) * 1.35], p3 = [x + Math.cos(a0) * 1.35, cy + Math.sin(a0) * 1.35];
        b.quad([p0[0], p0[1], 0.02], [p1[0], p1[1], 0.02], [p2[0], p2[1], 0.02], [p3[0], p3[1], 0.02], EXG, M_GOLD, PZ);
      }
    });
  }
}

// ---------- upper facade, side + rear elevations, cornices, roof, parapet, statues
function buildExtUpper(b, ctx, R) {
  // main storey wall (14.2 .. 25.2) with the giant order + two grand windows
  wallPanel(b, 0, -HALF_X, HALF_X, GND_TOP, MAIN_TOP, FRONT, FRONT - 1.6, PZ, NZ, [], EXS, I_WALL_SH, M_ST, MI.wallSh);
  bx(b, -HALF_X - 0.1, HALF_X + 0.1, MAIN_TOP - 0.34, MAIN_TOP - 0.2, FRONT, FRONT + 0.22, EXG, M_GOLD);
  // giant pilasters flanking the portico
  for (const x of [-21.5, -18.2, 18.2, 21.5]) {
    bx(b, x - 0.42, x + 0.42, GND_TOP - 0.4, MAIN_TOP - 0.5, FRONT, FRONT + 0.62, EXM, M_MAR, { topCol: mulc(EXM, 1.04) });
    bx(b, x - 0.58, x + 0.58, GND_TOP - 0.4, GND_TOP + 0.5, FRONT, FRONT + 0.8, EXS_HI, M_STH);
    bx(b, x - 0.58, x + 0.58, MAIN_TOP - 1.2, MAIN_TOP - 0.5, FRONT, FRONT + 0.8, EXS_HI, M_STH, { topCol: mulc(EXS_HI, 1.06) });
    bx(b, x - 0.1, x + 0.1, GND_TOP + 1.0, MAIN_TOP - 1.4, FRONT + 0.63, FRONT + 0.68, EXG, M_GOLD);
  }
  for (const x of [-23.4, 23.4]) {
    at(b, 0, 0, FRONT + 0.05, () => archWindow(b, 3.4, 8.4, x, GND_TOP + 2.0, EXS_HI));
    bx(b, x - 2.6, x + 2.6, GND_TOP + 1.7, GND_TOP + 2.05, FRONT, FRONT + 1.25, EXM, M_MAR, { topCol: mulc(EXM, 1.04) });
    at(b, x, GND_TOP + 2.05, FRONT + 1.05, () => kBal(b, 5.0, 1.15, EXM));
    bx(b, x - 2.7, x + 2.7, GND_TOP + 3.15, GND_TOP + 3.27, FRONT, FRONT + 1.1, EXG, M_GOLD);
    // round oculus above the window
    at(b, 0, 0, FRONT + 0.05, () => {
      disc(b, 1.15, 14, EXGL, M_GL, { y: 0, center: [x, GND_TOP + 13.0, 0] });
      for (let i = 0; i < 16; i++) {
        const a0 = (i / 16) * TAU, a1 = ((i + 1) / 16) * TAU;
        const cx = x, cy = GND_TOP + 13.0;
        const p0 = [cx + Math.cos(a0) * 1.15, cy + Math.sin(a0) * 1.15], p1 = [cx + Math.cos(a1) * 1.15, cy + Math.sin(a1) * 1.15];
        const p2 = [cx + Math.cos(a1) * 1.42, cy + Math.sin(a1) * 1.42], p3 = [cx + Math.cos(a0) * 1.42, cy + Math.sin(a0) * 1.42];
        b.quad([p0[0], p0[1], 0.02], [p1[0], p1[1], 0.02], [p2[0], p2[1], 0.02], [p3[0], p3[1], 0.02], EXS_HI, M_STH, PZ);
      }
    });
  }
  // main cornice (rich, all around)
  corniceBand(b, -HALF_X, HALF_X, BACK, FRONT, MAIN_TOP, CORN_TOP - MAIN_TOP, 0.95, EXS_HI, M_STH, true);
  bx(b, -HALF_X - 1.0, HALF_X + 1.0, CORN_TOP, CORN_TOP + 0.28, BACK - 1.0, FRONT + 1.0, EXM, M_MAR, { topCol: mulc(EXM, 1.05) });
  // attic storey face + small attic windows
  wallPanel(b, 0, -HALF_X, HALF_X, CORN_TOP, ATTIC_TOP, FRONT - 0.3, FRONT - 0.9, PZ, NZ, [], EXS, I_WALL_SH, M_ST, MI.wallSh);
  wallPanel(b, 0, -HALF_X, HALF_X, CORN_TOP, ATTIC_TOP, BACK + 0.9, BACK + 0.3, NZ, PZ, [], EXS, I_WALL_SH, M_ST, MI.wallSh);
  for (let i = 0; i < 17; i++) {
    const x = -HALF_X + 2.2 + i * ((2 * HALF_X - 4.4) / 16);
    bx(b, x - 0.28, x + 0.28, CORN_TOP + 0.35, CORN_TOP + 1.15, FRONT - 0.32, FRONT - 0.24, mulc(EXS_SH, 0.9), M_ST);
  }
  // ---------- side elevations (x = +-36)
  for (const s of [-1, 1]) {
    const xo = s * HALF_X, xi = s * (HALF_X - 2.0);
    const nO = s > 0 ? PX : NX, nI = s > 0 ? NX : PX;
    wallPanel(b, 1, BACK, FRONT, POD, GND_TOP, xo, xi, nO, nI, [], EXS, I_WALL_SH, M_ST, MI.wallSh);
    wallPanel(b, 1, BACK, FRONT, GND_TOP, MAIN_TOP, xo, xi, nO, nI, [], EXS, I_WALL_SH, M_ST, MI.wallSh);
    wallPanel(b, 1, BACK, FRONT, CORN_TOP, ATTIC_TOP, xo - s * 0.3, xo - s * 0.9, nO, nI, [], EXS, I_WALL_SH, M_ST, MI.wallSh);
    rustX(b, xo + s * 0.012, BACK, FRONT, POD, GND_TOP, EXS, s, 8);
    const yaw = s > 0 ? PI / 2 : -PI / 2;
    for (let i = 0; i < 7; i++) {
      const z = -22.5 + i * 6.6;
      b.push(T(xo + s * 0.05, 0, z)); b.push(m4.rotY(yaw));
      archWindow(b, 2.8, 6.6, 0, POD + 1.7, EXS_HI);
      b.pop(); b.pop();
      if (i < 6) {
        const pz = z + 3.3;
        bx(b, xo - s * 0.1, xo + s * 0.5, GND_TOP - 0.3, MAIN_TOP - 0.6, pz - 0.4, pz + 0.4, EXM, M_MAR, { topCol: mulc(EXM, 1.04) });
      }
    }
    for (let i = 0; i < 6; i++) {
      const z = -19.2 + i * 6.6;
      b.push(T(xo + s * 0.05, 0, z)); b.push(m4.rotY(yaw));
      archWindow(b, 3.2, 8.2, 0, GND_TOP + 2.1, EXS_HI);
      b.pop(); b.pop();
    }
    for (let i = 0; i < 5; i++) statueAt(b, xo - s * 0.5, ATTIC_TOP, -22.0 + i * 9.0, 1.05, EXM, yaw);
  }
  // ---------- rear elevation (z = -27)
  wallPanel(b, 0, -HALF_X, HALF_X, POD, GND_TOP, BACK, BACK + 1.8, NZ, PZ, [], EXS, I_WALL_SH, M_ST, MI.wallSh);
  wallPanel(b, 0, -HALF_X, HALF_X, GND_TOP, MAIN_TOP, BACK, BACK + 1.8, NZ, PZ, [], EXS, I_WALL_SH, M_ST, MI.wallSh);
  rustZ(b, BACK - 0.012, -HALF_X, HALF_X, POD, GND_TOP, EXS, 8);
  for (let i = 0; i < 8; i++) {
    const x = -31.5 + i * 9.0;
    b.push(T(0, 0, BACK - 0.05)); b.push(m4.rotY(PI));
    archWindow(b, 3.0, 7.6, -x, GND_TOP + 1.9, EXS_HI);
    b.pop(); b.pop();
  }
  // ---------- roof deck, parapet balustrade, statues, urns
  qUp(b, ROOF_Y, -HALF_X + 0.3, HALF_X - 0.3, BACK + 0.3, FRONT - 0.3, mulc(EXSL, 0.92), M_SL);
  qUp(b, ROOF_Y + 0.02, -HALF_X + 0.3, HALF_X - 0.3, BACK + 0.3, FRONT - 0.3, mulc(EXSL, 0.86), M_SL);
  at(b, 0, ATTIC_TOP, FRONT - 0.45, () => kBal(b, 2 * HALF_X - 1.2, 1.35, EXM));
  at(b, 0, ATTIC_TOP, BACK + 0.45, () => kBal(b, 2 * HALF_X - 1.2, 1.35, EXM));
  at(b, -HALF_X + 0.45, ATTIC_TOP, (BACK + FRONT) / 2, () => { b.push(m4.rotY(PI / 2)); kBal(b, FRONT - BACK - 1.2, 1.35, EXM); b.pop(); });
  at(b, HALF_X - 0.45, ATTIC_TOP, (BACK + FRONT) / 2, () => { b.push(m4.rotY(PI / 2)); kBal(b, FRONT - BACK - 1.2, 1.35, EXM); b.pop(); });
  bx(b, -HALF_X, HALF_X, PARA_TOP, PARA_TOP + 0.16, FRONT - 0.62, FRONT - 0.28, EXM, M_MAR, { topCol: mulc(EXM, 1.06) });
  bx(b, -HALF_X, HALF_X, PARA_TOP, PARA_TOP + 0.16, BACK + 0.28, BACK + 0.62, EXM, M_MAR);
  for (const x of [-33, -27, -21, -15, 15, 21, 27, 33]) statueAt(b, x, ATTIC_TOP, FRONT - 0.45, 1.1, EXM, PI);
  for (const x of [-26, -13, 13, 26]) statueAt(b, x, ATTIC_TOP, BACK + 0.45, 1.0, EXM, 0);
  for (const s of [-1, 1]) for (let i = 0; i < 5; i++) urnAt(b, s * (HALF_X - 0.45), ATTIC_TOP, -20 + i * 9.0, 1.2, EXGH);
}

// ================================================================ PORTICO
const COL_X = [-18.2, -11.4, -4.6, 4.6, 11.4, 18.2];
const COL_Z = 30.2, COL_TOP = 18.35, ENT_TOP = 21.35, PED_H = 6.2;
function buildPortico(b, ctx, R) {
  // square pedestals + six giant columns
  for (const x of COL_X) {
    bx(b, x - 1.15, x + 1.15, POD, POD + 0.95, COL_Z - 1.15, COL_Z + 1.15, EXS_HI, M_STH, { topCol: mulc(EXS_HI, 1.05) });
    bx(b, x - 1.32, x + 1.32, POD + 0.95, POD + 1.12, COL_Z - 1.32, COL_Z + 1.32, EXM, M_MAR, { topCol: mulc(EXM, 1.06) });
    kColumn(b, x, COL_Z, POD + 1.12, COL_TOP - POD - 1.12, 0.86, EXM);
  }
  // entablature: architrave / frieze / cornice
  bx(b, -19.7, 19.7, COL_TOP, COL_TOP + 0.75, FRONT - 0.1, COL_Z + 1.9, EXM, M_MAR, { topCol: mulc(EXM, 1.04) });
  bx(b, -19.4, 19.4, COL_TOP + 0.75, ENT_TOP - 1.05, FRONT, COL_Z + 1.6, EXS_HI, M_STH);
  // gilded inscription panel on the frieze
  bx(b, -13.0, 13.0, COL_TOP + 1.02, ENT_TOP - 1.3, COL_Z + 1.58, COL_Z + 1.63, mulc(C.bronze, 0.78), M_IRON);
  for (let i = 0; i < 13; i++) {
    const gx = -10.2 + i * 1.7;
    bx(b, gx - 0.2, gx + 0.2, COL_TOP + 1.28, ENT_TOP - 1.56, COL_Z + 1.63, COL_Z + 1.68, EXG, M_GOLD);
  }
  bx(b, -19.9, 19.9, ENT_TOP - 1.05, ENT_TOP - 0.72, FRONT - 0.15, COL_Z + 1.95, EXS_HI, M_STH, { topCol: mulc(EXS_HI, 1.04) });
  // dentil course (the shadow line under the cornice)
  for (let i = 0; i < 46; i++) {
    const dx = -19.3 + i * (38.6 / 45);
    bx(b, dx - 0.22, dx + 0.22, ENT_TOP - 1.02, ENT_TOP - 0.74, COL_Z + 1.95, COL_Z + 2.06, mulc(EXM, 0.92), M_MAR);
  }
  // three-step cornice
  bx(b, -20.0, 20.0, ENT_TOP - 0.72, ENT_TOP - 0.44, FRONT - 0.2, COL_Z + 2.2, EXM, M_MAR, { topCol: mulc(EXM, 1.05) });
  bx(b, -20.3, 20.3, ENT_TOP - 0.44, ENT_TOP - 0.18, FRONT - 0.25, COL_Z + 2.45, EXS_HI, M_STH, { topCol: mulc(EXS_HI, 1.06) });
  bx(b, -20.6, 20.6, ENT_TOP - 0.18, ENT_TOP, FRONT - 0.3, COL_Z + 2.7, EXM, M_MAR, { topCol: mulc(EXM, 1.07) });
  // capital volutes + gilt neck rings on the six giant columns
  for (const x of COL_X) {
    for (const sx of [-1, 1]) {
      bx(b, x + sx * 1.02 - 0.13, x + sx * 1.02 + 0.13, COL_TOP - 1.0, COL_TOP - 0.16, COL_Z + 0.92, COL_Z + 1.06, EXM, M_MAR);
      bx(b, x + sx * 1.02 - 0.2, x + sx * 1.02 + 0.2, COL_TOP - 0.42, COL_TOP - 0.2, COL_Z + 0.9, COL_Z + 1.1, EXG, M_GOLD);
    }
    bx(b, x - 1.05, x + 1.05, COL_TOP - 0.2, COL_TOP + 0.06, COL_Z - 1.05, COL_Z + 1.05, EXM, M_MAR, { topCol: mulc(EXM, 1.06) });
    bx(b, x - 1.12, x + 1.12, COL_TOP - 1.32, COL_TOP - 1.2, COL_Z - 1.12, COL_Z + 1.12, EXG, M_GOLD);
  }
  // coffered porch soffit
  for (let i = -9; i <= 9; i++) {
    bx(b, i * 2.12 - 0.16, i * 2.12 + 0.16, COL_TOP - 0.55, COL_TOP, FRONT, COL_Z + 1.6, mulc(EXS_HI, 0.93), M_STH);
  }
  qDn(b, COL_TOP - 0.55, -19.5, 19.5, FRONT, COL_Z + 1.7, mulc(EXM, 0.9), M_MAR);
  // triangular pediment with the sculpture group (Apollo's train)
  at(b, 0, ENT_TOP, COL_Z - 0.4, () => {
    kPediment(b, 40.0, PED_H, EXM);
    // shadowed relief tympanum + gilt sun behind the group
    b.tri([-17.6, 1.55, 0.34], [17.6, 1.55, 0.34], [0, 6.72, 0.34], mulc(mixc(EXS_SH, C.sunGlow, 0.12), 0.94), M_STH, PZ, PZ, PZ);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU;
      bx(b, Math.cos(a) * 1.9 - 0.16, Math.cos(a) * 1.9 + 0.16, 3.5 + Math.sin(a) * 1.9 - 0.16, 3.5 + Math.sin(a) * 1.9 + 0.16, 0.34, 0.4, EXG, M_GOLD);
    }
    // sculpture ledge
    bx(b, -17.4, 17.4, 1.18, 1.55, 0.34, 0.95, EXM, M_MAR, { topCol: mulc(EXM, 1.05) });
    bx(b, -17.4, 17.4, 1.08, 1.2, 0.34, 1.0, EXG, M_GOLD);
    // the group
    at(b, -8.6, 1.55, 0.55, () => fig(b, EXM, M_MAR, 0.76, 0.32));
    at(b, -4.3, 1.55, 0.55, () => fig(b, EXM, M_MAR, 0.88, 0.14));
    at(b, 0.0, 1.55, 0.55, () => fig(b, EXM, M_MAR, 1.02, 0));
    at(b, 4.3, 1.55, 0.55, () => fig(b, EXM, M_MAR, 0.88, -0.14));
    at(b, 8.6, 1.55, 0.55, () => fig(b, EXM, M_MAR, 0.76, -0.32));
    // two gilded antefixae on the raking cornices
    for (const sx of [-1, 1]) {
      at(b, sx * 9.6, 3.2, 0.3, () => urnAt(b, 0, 0, 0, 0.85, EXGH));
    }
  });
  // acroterion statues on the pediment corners + apex
  statueAt(b, -19.3, ENT_TOP + PED_H - 0.2, COL_Z + 0.1, 0.85, EXM, PI * 0.5);
  statueAt(b, 19.3, ENT_TOP + PED_H - 0.2, COL_Z + 0.1, 0.85, EXM, -PI * 0.5);
  statueAt(b, 0, ENT_TOP + PED_H + 0.3, COL_Z + 0.1, 1.25, EXM, PI);
  // porch lamps against the facade between the doors
  for (const x of [-15.0, -11.6, -5.6, 5.6, 11.6, 15.0]) {
    sconce(b, ctx, x, POD + 5.2, FRONT + 0.18, 0);
    if (ctx.points) ctx.points.push({ p: W(x, POD + 5.4, FRONT + 0.9), col: mixc(C.sunGlow, C.goldBright, 0.3), range: 15, int: 0.4 });
  }
}

// ================================================================ PAVILIONS
function buildPavilions(b, ctx, R) {
  for (const s of [-1, 1]) {
    const x0 = s > 0 ? PAV.x0 : -PAV.x1, x1 = s > 0 ? PAV.x1 : -PAV.x0;
    bx(b, x0, x1, POD, PAV.top, PAV.z0, PAV.z1, EXS, M_ST, { topCol: mulc(EXS, 1.03) });
    // rustication + quoins
    rustZ(b, PAV.z1 + 0.012, x0, x1, POD, PAV.top, EXS, 10);
    rustX(b, s > 0 ? x1 + 0.012 : x0 - 0.012, PAV.z0, PAV.z1, POD, PAV.top, EXS, s, 10);
    for (const qx of [x0 + 0.5, x1 - 0.5]) {
      for (let k = 0; k < 9; k++) {
        const qw = k % 2 ? 0.55 : 0.85;
        bx(b, qx - qw / 2, qx + qw / 2, POD + 0.4 + k * 3.1, POD + 1.9 + k * 3.1, PAV.z1, PAV.z1 + 0.1, EXS_HI, M_STH);
      }
    }
    // pavilion cornice + attic + copper cupola
    corniceBand(b, x0, x1, PAV.z0, PAV.z1, PAV.top - 1.2, 1.2, 0.6, EXS_HI, M_STH, true);
    bx(b, x0 + 0.2, x1 - 0.2, PAV.top, PAV.top + 1.0, PAV.z0 + 0.2, PAV.z1 - 0.2, EXS, M_ST, { topCol: mulc(EXS, 1.04) });
    bx(b, x0 - 0.3, x1 + 0.3, PAV.top + 1.0, PAV.top + 1.3, PAV.z0 - 0.3, PAV.z1 + 0.3, EXM, M_MAR, { topCol: mulc(EXM, 1.05) });
    at(b, (x0 + x1) / 2, PAV.top + 1.3, (PAV.z0 + PAV.z1) / 2, () => domeShell(b, 0, 0, 0, 4.7, 9.4, 24, 8, EXCU, mulc(EXCU, 0.82), M_CU));
    bx(b, (x0 + x1) / 2 - 0.14, (x0 + x1) / 2 + 0.14, PAV.top + 10.4, PAV.top + 12.6, (PAV.z0 + PAV.z1) / 2 - 0.14, (PAV.z0 + PAV.z1) / 2 + 0.14, EXGH, M_GOLD);
    // pavilion windows: two arched on the front, one on the outer side
    const pcx = (x0 + x1) / 2;
    at(b, pcx, 0, PAV.z1 + 0.06, () => {
      archWindow(b, 2.9, 7.4, -2.4, GND_TOP + 1.6, EXS_HI);
      archWindow(b, 2.9, 7.4, 2.4, GND_TOP + 1.6, EXS_HI);
      bx(b, -5.0, 5.0, POD + 1.5, POD + 1.72, 0.0, 0.45, EXS_HI, M_STH);
      bx(b, -0.12, 0.12, POD + 2.6, GND_TOP - 0.2, 0.0, 0.4, EXM, M_MAR);
    });
    // a small balcony under the pavilion windows + gold rail
    bx(b, pcx - 5.2, pcx + 5.2, GND_TOP + 1.2, GND_TOP + 1.5, PAV.z1, PAV.z1 + 0.9, EXM, M_MAR, { topCol: mulc(EXM, 1.05) });
    at(b, (x0 + x1) / 2, GND_TOP + 1.5, PAV.z1 + 0.75, () => kBal(b, 10.0, 1.1, EXM));
    // side window on the outer elevation
    b.push(T(s > 0 ? x1 + 0.06 : x0 - 0.06, 0, (PAV.z0 + PAV.z1) / 2));
    b.push(m4.rotY(s > 0 ? PI / 2 : -PI / 2));
    archWindow(b, 2.8, 7.0, 0, GND_TOP + 1.8, EXS_HI);
    b.pop(); b.pop();
    // a statue in a niche at the pavilion ground level
    at(b, s * (PAV.x0 + 2.0), POD + 0.2, PAV.z1 - 0.1, () => fig(b, EXM, M_MAR, 1.0, PI));
    sconce(b, ctx, s * (PAV.x0 + 4.4), POD + 4.4, PAV.z1 + 0.1, 0);
    if (ctx.points) ctx.points.push({ p: W(s * 30.6, POD + 6, PAV.z1 + 1.6), col: mixc(C.sunGlow, C.goldBright, 0.3), range: 24, int: 0.5 });
  }
}

// copper dome shell: rings from the base (r0 at y0) up to the apex; gold ribs
function domeShell(b, cx, cz, y0, r0, h, seg, rings, col, ribCol, mat) {
  const P = (a, t) => {
    const ang = t * PI * 0.5;
    const r = r0 * Math.cos(ang);
    return [cx + Math.cos(a) * r, y0 + h * Math.sin(ang), cz + Math.sin(a) * r];
  };
  for (let j = 0; j < rings; j++) {
    const t0 = j / rings, t1 = (j + 1) / rings;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
      const p00 = P(a0, t0), p10 = P(a1, t0), p11 = P(a1, t1), p01 = P(a0, t1);
      const N = (p) => norm([p[0] - cx, (p[1] - y0) * (r0 / Math.max(h, 0.1)), p[2] - cz]);
      const isRib = i % (seg / 8) === 0;
      const cc = isRib ? ribCol : mixc(mulc(col, 0.97), mulc(col, 1.05), t0 + (j & 1) * 0.08);
      b.quad(p00, p01, p11, p10, cc, isRib ? M_CU : mat, N(p00));
    }
  }
}

// ================================================================ DRUM + DOME
function buildDome(b, ctx, R) {
  // drum base
  at(b, 0, 0, DOME_CZ, () => {
    cylinder(b, 28, 14.8, 14.4, 3.1, EXS, M_ST, { y0: ROOF_Y, caps: false });
    cylinder(b, 28, 14.4, 14.4, 0.55, EXM, M_MAR, { y0: ROOF_Y + 3.1, caps: false });
    // statue ring on the base
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + 0.13;
      statueAt(b, Math.cos(a) * 14.9, ROOF_Y + 3.65, Math.sin(a) * 14.9, 0.95, EXM, -a + PI / 2);
    }
    // main drum with engaged paired columns + eight lit windows
    cylinder(b, 28, DRUM_R, DRUM_R, DRUM_Y1 - (ROOF_Y + 3.65), EXS_HI, M_STH, { y0: ROOF_Y + 3.65, caps: false });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      const px = Math.cos(a) * DRUM_R, pz = Math.sin(a) * DRUM_R;
      bx(b, px * 0.978 - 0.3, px * 0.978 + 0.3, ROOF_Y + 3.9, DRUM_Y1 - 0.4, pz * 0.978 - 0.3, pz * 0.978 + 0.3, EXM, M_MAR);
      const tx = -Math.sin(a) * 0.62, tz = Math.cos(a) * 0.62;
      bx(b, px * 0.975 + tx - 0.22, px * 0.975 + tx + 0.22, DRUM_Y1 - 1.4, DRUM_Y1 - 0.2, pz * 0.975 + tz - 0.22, pz * 0.975 + tz + 0.22, EXS_HI, M_STH);
      bx(b, px * 0.975 - tx - 0.22, px * 0.975 - tx + 0.22, DRUM_Y1 - 1.4, DRUM_Y1 - 0.2, pz * 0.975 - tz - 0.22, pz * 0.975 - tz + 0.22, EXS_HI, M_STH);
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + 0.3927;
      b.push(T(Math.cos(a) * (DRUM_R - 0.15), 0, Math.sin(a) * (DRUM_R - 0.15)));
      b.push(m4.rotY(-a + PI / 2));
      winArch(b, 0, 0, 2.6, ROOF_Y + 7.2, ROOF_Y + 11.6, 0.06, 1, mixc(C.sunGlow, C.goldBright, 0.35), MI.glow, EXG, M_GOLD, true);
      b.pop(); b.pop();
    }
    // drum cornice + balustrade
    cylinder(b, 28, DRUM_R + 0.7, DRUM_R + 0.7, 0.45, EXM, M_MAR, { y0: DRUM_Y1 - 0.1, caps: false });
    cylinder(b, 28, DRUM_R + 0.9, DRUM_R + 0.9, 0.3, EXM, M_MAR, { y0: DRUM_Y1 + 0.35, caps: false });
    for (let i = 0; i < 32; i++) {
      const a0 = (i / 32) * TAU, a1 = ((i + 1) / 32) * TAU;
      const r = DRUM_R + 0.55;
      b.quad([Math.cos(a0) * r, DRUM_Y1 + 0.65, Math.sin(a0) * r], [Math.cos(a1) * r, DRUM_Y1 + 0.65, Math.sin(a1) * r],
             [Math.cos(a1) * r, DRUM_Y1 + 1.05, Math.sin(a1) * r], [Math.cos(a0) * r, DRUM_Y1 + 1.05, Math.sin(a0) * r], EXG, M_GOLD);
    }
    // the great verdigris dome
    domeShell(b, 0, 0, DRUM_Y1 + 0.4, DRUM_R, DOME_Y1 - DRUM_Y1 - 0.4, 40, 12, EXCU, mulc(EXCU, 0.82), M_CU);
    // gold base band + finial ring
    cylinder(b, 32, DRUM_R + 0.12, DRUM_R + 0.12, 0.35, EXG, M_GOLD, { y0: DRUM_Y1 + 0.4, caps: false });
    // lantern: drum of columns + small dome + gold finial
    at(b, 0, DOME_Y1, 0, () => {
      cylinder(b, 12, 4.0, 3.9, 0.4, EXM, M_MAR, { y0: 0, caps: true });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        bx(b, Math.cos(a) * 3.4 - 0.2, Math.cos(a) * 3.4 + 0.2, 0.4, 3.4, Math.sin(a) * 3.4 - 0.2, Math.sin(a) * 3.4 + 0.2, EXM, M_MAR);
      }
      cylinder(b, 12, 3.7, 3.7, 0.35, EXM, M_MAR, { y0: 3.4, caps: true });
      domeShell(b, 0, 0, 3.75, 3.85, 3.1, 20, 6, EXCU, mulc(EXCU, 0.82), M_CU);
      bx(b, -0.16, 0.16, 7.1, 8.4, -0.16, 0.16, EXGH, M_GOLD);
      at(b, 0, 8.55, 0, () => sphere(b, 0.55, EXGH, M_GOLD, { rings: 4, seg: 8, jitter: 0.02 }));
    });
    // glow billboard inside the lantern + a point light so the dome reads at night
    if (ctx.lanterns) ctx.lanterns.push({ p: W(0, DOME_Y1 + 2.0, DOME_CZ), size: 6.0, rot: 0, alpha: 0.26, shape: 1, col: mixc(C.sunGlow, C.goldBright, 0.5) });
  });
}

// ================================================================ STAGE HOUSE
function buildStageHouse(b, ctx, R) {
  bx(b, -STG.x, STG.x, ROOF_Y, STG.top, STG.z0, STG.z1, EXS, M_ST, { topCol: mulc(EXS, 1.03) });
  rustZ(b, STG.z1 + 0.012, -STG.x, STG.x, ROOF_Y, STG.top, EXS, 4);
  rustZ(b, STG.z0 - 0.012, -STG.x, STG.x, ROOF_Y, STG.top, EXS, 4);
  corniceBand(b, -STG.x, STG.x, STG.z0, STG.z1, STG.top - 1.1, 1.1, 0.55, EXS_HI, M_STH, false);
  bx(b, -STG.x - 0.4, STG.x + 0.4, STG.top, STG.top + 0.4, STG.z0 - 0.4, STG.z1 + 0.4, EXCU, M_CU, { topCol: mulc(EXCU, 1.06) });
  // statues on the stage-house corners
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) statueAt(b, sx * (STG.x - 0.8), STG.top + 0.4, sz > 0 ? STG.z1 - 0.8 : STG.z0 + 0.8, 0.9, EXM, sz > 0 ? 0 : PI);
  // pilasters on the rear face
  for (let i = 0; i < 5; i++) {
    const x = -12 + i * 6;
    bx(b, x - 0.45, x + 0.45, ROOF_Y + 0.3, STG.top - 1.2, STG.z0 - 0.45, STG.z0, EXM, M_MAR);
  }
}

// ================================================================ EXTERIOR DRESSING
function buildFacadeDetail(b, ctx, R) {
  // bracket lamps on the giant pilasters + their brackets
  for (const x of [-21.5, -18.2, 18.2, 21.5]) {
    bx(b, x - 0.24, x + 0.24, GND_TOP + 6.4, GND_TOP + 7.4, FRONT + 0.6, FRONT + 1.15, EXG, M_GOLD);
    at(b, x, GND_TOP + 7.0, FRONT + 1.1, () => ellipsoid(b, 0.3, 0.36, 0.3, 7, 4, mixc(C.sunGlow, C.goldBright, 0.4), MI.glow));
    if (ctx.lanterns) ctx.lanterns.push({ p: W(x, GND_TOP + 7.0, FRONT + 1.4), size: 2.4, rot: 0, alpha: 0.34, shape: 1, col: mixc(C.sunGlow, C.goldBright, 0.4) });
  }
  // gold garland bands along the attic
  for (const y of [CORN_TOP + 1.9, MAIN_TOP - 1.55]) {
    bx(b, -HALF_X + 0.6, HALF_X - 0.6, y, y + 0.16, FRONT + 0.02, FRONT + 0.12, mulc(EXG, 0.9), M_GOLD);
  }
  // wreath medallions along the attic
  for (let i = 0; i < 9; i++) {
    const x = -28 + i * 7;
    at(b, x, CORN_TOP + 1.15, FRONT + 0.06, () => {
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * TAU;
        bx(b, Math.cos(a) * 0.75 - 0.14, Math.cos(a) * 0.75 + 0.14, Math.sin(a) * 0.75 - 0.14, Math.sin(a) * 0.75 + 0.14, 0, 0.1, EXG, M_GOLD);
      }
      bx(b, -0.22, 0.22, -0.22, 0.22, 0, 0.12, EXGH, M_GOLD);
    });
  }
  // roof flagpoles with small pennants on the front corners
  for (const s of [-1, 1]) {
    const x = s * 34.0;
    bx(b, x - 0.08, x + 0.08, PARA_TOP, PARA_TOP + 5.2, FRONT - 0.5, FRONT - 0.34, EXIRON, M_IRON);
    bx(b, x - 0.06, x + 0.06, PARA_TOP + 5.2 - 1.9, PARA_TOP + 5.2 - 0.2, FRONT - 0.58, FRONT - 0.3, s > 0 ? C.bloomRed : C.slate, MI.red);
  }
  // entrance glow + point lights (the house must read as alive)
  if (ctx.lanterns) {
    for (const x of [-8, 0, 8]) ctx.lanterns.push({ p: W(x, POD + 3.0, FRONT + 1.2), size: 5.0, rot: 0, alpha: 0.22, shape: 1, col: mixc(C.sunGlow, C.cloudLit, 0.3) });
    ctx.lanterns.push({ p: W(0, POD + 1.6, PORCH - 1.0), size: 9.0, rot: 0, alpha: 0.16, shape: 1, col: mixc(C.sunGlow, C.cloudLit, 0.25) });
  }
}

// ================================================================ LIGHTS (world space)
function buildLights(ctx) {
  const warm = mixc(C.sunGlow, C.goldBright, 0.42);
  const warmSoft = mixc(C.sunGlow, C.cloudLit, 0.32);
  if (ctx.points) {
    const pts = EX_POINTS;
    for (const q of pts) ctx.points.push({ p: W(q[0], q[1], q[2]), col: q[5] || warm, range: q[3], int: q[4] });
  }
}
const EX_POINTS = [
  [0, POD + 6.0, FRONT - 2.0, 34, 0.75],
  [-14, POD + 7.0, FRONT - 2.0, 26, 0.5, mixc(C.sunGlow, C.cloudLit, 0.3)],
  [14, POD + 7.0, FRONT - 2.0, 26, 0.5, mixc(C.sunGlow, C.cloudLit, 0.3)],
];

// ================================================================ INTERIOR
function buildInterior(b, ctx, R) {
  buildVestibule(b, ctx, R);
  buildFoyerShell(b, ctx, R);
  buildAudFoyerWall(b, ctx, R);
  buildAuditoriumShell(b, ctx, R);
  buildStageShell(b, ctx, R);
  buildSalonShell(b, ctx, R);
  buildFoyerDetail(b, ctx, R);
  buildStairs(b, ctx, R);
  buildAuditoriumDetail(b, ctx, R);
  buildStageDetail(b, ctx, R);
  buildSalonDetail(b, ctx, R);
  buildInteriorLights(ctx);
}

// ================================================================ ENTRY
export function buildOpera(b, ctx, rng) {
  if (b.note) b.note('opera');
  const R = mulberry32(0x3a71e5d9);
  const depth = b.stack.length;
  try {
    b.push(FRAME);
    buildSite(b, ctx, R);
    buildExterior(b, ctx, R);
    buildExtUpper(b, ctx, R);
    buildPortico(b, ctx, R);
    buildPavilions(b, ctx, R);
    buildDome(b, ctx, R);
    buildStageHouse(b, ctx, R);
    buildFacadeDetail(b, ctx, R);
    buildInterior(b, ctx, R);
    b.pop();
    buildLights(ctx);
  } catch (e) {
    while (b.stack.length > depth) b.pop();
    throw e;
  }
  void rng;
}

// debug handle (used by tools/opera-check.mjs to report per-phase envelopes)
export const OPERA_PARTS = { buildSite, buildExterior, buildExtUpper, buildPortico, buildPavilions, buildDome, buildStageHouse, buildFacadeDetail, buildInterior, buildLights };

// ---------- vestibule (between the three doors and the foyer)
function buildVestibule(b, ctx, R) {
  // floor: warm marble with a gold border
  flatPanel(b, -VX, VX, VZ0, VZ1, FY, true, [], I_FLOOR_A, MI.floor, 2.2, I_FLOOR_B);
  qUp(b, FY + 0.008, -VX + 1.1, VX - 1.1, VZ0 + 1.1, VZ1 - 1.1, I_GOLD_D, MI.gold);
  qUp(b, FY + 0.012, -VX + 1.5, VX - 1.5, VZ0 + 1.5, VZ1 - 1.5, I_FLOOR_A, MI.floor);
  // ceiling: coffered, with a central oval glow
  qDn(b, VCEIL, -VX, VX, VZ0, VZ1, I_WALL_HI, MI.wallHi);
  for (let i = 0; i < 6; i++) {
    const x = -VX + 1.6 + i * ((2 * VX - 3.2) / 5);
    bx(b, x - 0.2, x + 0.2, VCEIL - 0.42, VCEIL, VZ0 + 0.3, VZ1 - 0.3, I_MARB, MI.marble);
  }
  for (let j = 0; j < 3; j++) {
    const z = VZ0 + 1.4 + j * ((VZ1 - VZ0 - 2.8) / 2);
    bx(b, -VX + 0.3, VX - 0.3, VCEIL - 0.3, VCEIL, z - 0.2, z + 0.2, I_MARB, MI.marble);
  }
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 2; j++) {
      const x = -VX + 1.6 + i * ((2 * VX - 3.2) / 5);
      const z = VZ0 + 1.4 + j * ((VZ1 - VZ0 - 2.8) / 2);
      qDn(b, VCEIL - 0.44, x - 1.5, x + 1.5, z - 1.35, z + 1.35, I_WALL, MI.wall);
      bx(b, x - 0.3, x + 0.3, VCEIL - 0.46, VCEIL - 0.4, z - 0.3, z + 0.3, I_GOLD_HI, MI.goldHi);
    }
  }
  // side walls with pilasters + lit niches
  for (const s of [-1, 1]) {
    const xa = s * VX, xb = s * (VX + 0.6);
    wallPanel(b, 1, VZ0, VZ1, FY, VCEIL, xa, xb, s > 0 ? NX : PX, s > 0 ? PX : NX, [], I_WALL, I_WALL_SH, MI.wall, MI.wallSh);
    for (let i = 0; i < 3; i++) {
      const z = VZ0 + 1.2 + i * 1.5;
      bx(b, s > 0 ? xa - 0.3 : xa, s > 0 ? xa : xa + 0.3, FY, VCEIL - 0.9, z - 0.34, z + 0.34, I_MARB, MI.marble);
      winArch(b, 1, z, 0.9, FY + 2.4, FY + 4.2, s * (VX - 0.02), s > 0 ? -1 : 1, I_SKY, MI.glow, I_GOLD, MI.gold, false);
    }
    // benches along the side walls
    bx(b, s > 0 ? VX - 1.4 : -VX, s > 0 ? VX - 0.5 : -VX + 1.4, FY + 0.42, FY + 0.52, VZ0 + 2.0, VZ1 - 2.0, I_WOOD, MI.wood);
    bx(b, s > 0 ? VX - 0.58 : -VX, s > 0 ? VX - 0.5 : -VX + 0.58, FY + 0.52, FY + 1.1, VZ0 + 2.0, VZ1 - 2.0, I_RED, MI.red);
  }
  // rear partition to the foyer, with the tall arched portal
  wallPanel(b, 0, -VX, VX, FY, VCEIL, VZ0 + 0.6, VZ0, PZ, NZ, [{ c: 0, w: 11.0, y0: FY, ys: 8.4 }], I_WALL, I_WALL_HI, MI.wall, MI.wallHi);
  // portal arch trim on the vestibule side
  for (const s of [-1, 1]) {
    const r = 5.5;
    for (let i = 0; i < 10; i++) {
      const a0 = PI * (i / 10), a1 = PI * ((i + 1) / 10);
      const p0 = [Math.cos(a0) * r, 8.4 + Math.sin(a0) * r], p1 = [Math.cos(a1) * r, 8.4 + Math.sin(a1) * r];
      const p2 = [Math.cos(a1) * (r + 0.55), 8.4 + Math.sin(a1) * (r + 0.55)], p3 = [Math.cos(a0) * (r + 0.55), 8.4 + Math.sin(a0) * (r + 0.55)];
      b.quad([p0[0], p0[1], VZ0 + 0.62], [p1[0], p1[1], VZ0 + 0.62], [p2[0], p2[1], VZ0 + 0.62], [p3[0], p3[1], VZ0 + 0.62], I_GOLD, MI.gold, PZ);
      void s;
    }
  }
  bx(b, -0.35, 0.35, 8.4 + 5.4, 8.4 + 6.4, VZ0 + 0.6, VZ0 + 0.8, I_GOLD_HI, MI.goldHi);
  // mirrors + sconces between the doors on the inner face of the front wall
  for (const x of [-11.0, -5.4, 5.4, 11.0]) {
    bx(b, x - 1.15, x + 1.15, FY + 3.7, FY + 8.0, VZ1 - 0.16, VZ1 - 0.06, I_GOLD, MI.gold);
    winArch(b, 0, x, 1.9, FY + 3.9, FY + 6.2, VZ1 - 0.2, -1, mixc(I_SKY, I_MARB, 0.35), [0.13, 0.94], I_GOLD_HI, MI.goldHi, false);
    sconce(b, ctx, x, FY + 6.4, VZ1 - 0.12, PI);
  }
  // two chandeliers
  chandelier(b, ctx, -6.2, VCEIL - 3.3, VZ0 + 2.4, 0.85);
  chandelier(b, ctx, 6.2, VCEIL - 3.3, VZ0 + 2.4, 0.85);
}

// ---------- foyer side walls + salon openings + mirrors
function buildFoyerShell(b, ctx, R) {
  // floor: two-tone marble, gold border, central medallion, red approach runner
  flatPanel(b, -FX, FX, FZ0, FZ1, FY, true, [], I_FLOOR_A, MI.floor, 3.4, I_FLOOR_B);
  qUp(b, FY + 0.006, -FX + 2.2, FX - 2.2, FZ0 + 2.2, FZ1 - 1.2, I_MARB_D, MI.marble);
  qUp(b, FY + 0.012, -FX + 2.8, FX - 2.8, FZ0 + 2.8, FZ1 - 1.8, I_FLOOR_A, MI.floor);
  qUp(b, FY + 0.02, -8.4, 8.4, FZ0, FZ1 - 1.6, I_RED, MI.red);
  for (const x of [-8.4, 8.4]) qUp(b, FY + 0.024, x - 0.3, x + 0.3, FZ0, FZ1 - 1.6, I_GOLD_D, MI.gold);
  // central medallion with a gold ray sun
  for (const rr of [[9.2, 9.8, I_GOLD_D, MI.gold], [6.6, 9.2, I_MARB, MI.marbleHi], [5.9, 6.6, I_GOLD, MI.gold], [3.0, 5.9, I_FLOOR_B, MI.floorB]]) {
    for (let i = 0; i < 40; i++) {
      const a0 = (i / 40) * TAU, a1 = ((i + 1) / 40) * TAU;
      b.quad([Math.cos(a0) * rr[0], FY + 0.028, 12.8 + Math.sin(a0) * rr[0]], [Math.cos(a1) * rr[0], FY + 0.028, 12.8 + Math.sin(a1) * rr[0]],
             [Math.cos(a1) * rr[1], FY + 0.028, 12.8 + Math.sin(a1) * rr[1]], [Math.cos(a0) * rr[1], FY + 0.028, 12.8 + Math.sin(a0) * rr[1]], rr[2], rr[3], PY);
    }
  }
  for (let i = 0; i < 40; i++) {
    const a0 = (i / 40) * TAU, a1 = ((i + 1) / 40) * TAU;
    b.quad([Math.cos(a0) * 0.01, FY + 0.032, 12.8 + Math.sin(a0) * 0.01], [Math.cos(a0) * 2.9, FY + 0.032, 12.8 + Math.sin(a0) * 2.9],
           [Math.cos(a1) * 2.9, FY + 0.032, 12.8 + Math.sin(a1) * 2.9], [Math.cos(a1) * 0.01, FY + 0.032, 12.8 + Math.sin(a1) * 0.01], I_MARB_D, MI.marbleHi, PY);
  }
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * TAU + 0.15, r0 = 2.0, r1 = 5.6;
    const ux = Math.cos(a), uz = Math.sin(a), wx = -Math.sin(a) * 0.18, wz = Math.cos(a) * 0.18;
    b.quad([ux * r0 + wx, FY + 0.036, 12.8 + uz * r0 + wz], [ux * r1 + wx, FY + 0.036, 12.8 + uz * r1 + wz],
           [ux * r1 - wx, FY + 0.036, 12.8 + uz * r1 - wz], [ux * r0 - wx, FY + 0.036, 12.8 + uz * r0 - wz], I_GOLD_HI, MI.goldHi, PY);
  }
  // ceiling: coffers + painted centre panel
  qDn(b, FCEIL, -FX, FX, FZ0, FZ1, I_WALL_HI, MI.wallHi);
  for (let i = 0; i <= 10; i++) {
    const x = -FX + i * ((2 * FX) / 10);
    bx(b, x - 0.3, x + 0.3, FCEIL - 0.85, FCEIL, FZ0, FZ1, I_MARB, MI.marble);
    bx(b, x - 0.36, x + 0.36, FCEIL - 0.95, FCEIL - 0.8, FZ0, FZ1, I_GOLD_D, MI.gold);
  }
  for (let j = 0; j <= 4; j++) {
    const z = FZ0 + j * ((FZ1 - FZ0) / 4);
    bx(b, -FX, FX, FCEIL - 0.7, FCEIL, z - 0.3, z + 0.3, I_MARB, MI.marble);
    bx(b, -FX, FX, FCEIL - 0.8, FCEIL - 0.66, z - 0.36, z + 0.36, I_GOLD_D, MI.gold);
  }
  for (let i = 0; i < 10; i++) {
    for (let j = 0; j < 4; j++) {
      const x = -FX + (i + 0.5) * ((2 * FX) / 10), z = FZ0 + (j + 0.5) * ((FZ1 - FZ0) / 4);
      if (Math.abs(x) < 7.5) continue;
      qDn(b, FCEIL - 0.88, x - 1.8, x + 1.8, z - 1.5, z + 1.5, (i + j) & 1 ? I_WALL : I_WALL_HI, MI.wall);
      bx(b, x - 0.34, x + 0.34, FCEIL - 0.92, FCEIL - 0.86, z - 0.34, z + 0.34, I_GOLD_HI, MI.goldHi);
    }
  }
  qDn(b, FCEIL - 0.9, -7.5, 7.5, FZ0 + 2.0, FZ1 - 2.0, I_SKY, MI.glow);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    bx(b, Math.cos(a) * 7.2 - 0.2, Math.cos(a) * 7.2 + 0.2, FCEIL - 0.98, FCEIL - 0.9, 13.2 + Math.sin(a) * 6.6 - 0.2, 13.2 + Math.sin(a) * 6.6 + 0.2, I_GOLD, MI.gold);
  }
  // side walls: tall arcades to the salons, mirrors between them
  for (const s of [-1, 1]) {
    const xa = s * FX, xb = s * (FX + 0.7);
    wallPanel(b, 1, FZ0, FZ1, FY, FCEIL, xa, xb, s > 0 ? NX : PX, s > 0 ? PX : NX, [
      { c: 11.2, w: 5.4, y0: FY, ys: 8.6 },
      { c: 17.0, w: 5.4, y0: FY, ys: 8.6 },
    ], I_WALL, I_WALL_SH, MI.wall, MI.wallSh);
    const dir = s > 0 ? -1 : 1;
    // engaged columns framing the two arcade openings
    for (const z of [8.15, 14.1, 19.95]) {
      bx(b, s > 0 ? FX - 0.55 : -FX, s > 0 ? FX : -FX + 0.55, FY, FCEIL - 2.2, z - 0.52, z + 0.52, I_MARB, MI.marble);
      bx(b, s > 0 ? FX - 0.7 : -FX, s > 0 ? FX : -FX + 0.7, FY + 0.1, FY + 0.75, z - 0.66, z + 0.66, I_GOLD, MI.gold);
      bx(b, s > 0 ? FX - 0.7 : -FX, s > 0 ? FX : -FX + 0.7, FCEIL - 2.5, FCEIL - 2.1, z - 0.66, z + 0.66, I_GOLD, MI.gold);
    }
    // gold string courses, only on the piers (never across the arcades)
    for (const yy of [FY + 4.35, FY + 9.7]) {
      for (const pr of [[FZ0 + 0.2, 8.45], [13.95, 14.25], [19.75, FZ1 - 0.2]]) {
        bx(b, s > 0 ? FX - 0.08 : -FX, s > 0 ? FX : -FX + 0.08, yy, yy + 0.18, pr[0], pr[1], I_GOLD, MI.gold);
      }
    }
    // upper-wall pilasters (aligned with the columns) + a moulded cornice
    for (const z of [8.4, 14.1, 19.8]) pilasterX(b, s * FX, dir, z, FY + 11.8, FCEIL - 1.1, 0.95);
    bx(b, s > 0 ? FX - 0.26 : -FX, s > 0 ? FX : -FX + 0.26, FCEIL - 1.55, FCEIL - 1.3, FZ0 + 0.25, FZ1 - 0.25, I_GOLD, MI.gold);
    bx(b, s > 0 ? FX - 0.2 : -FX, s > 0 ? FX : -FX + 0.2, FCEIL - 2.0, FCEIL - 1.8, FZ0 + 0.25, FZ1 - 0.25, I_MARB, MI.marbleHi);
    // large gilt-framed mural panels above each arcade
    artPanelX(b, s * FX, dir, 8.75, 13.65, FY + 12.4, FCEIL - 2.3);
    artPanelX(b, s * FX, dir, 14.55, 19.55, FY + 12.4, FCEIL - 2.3);
    // painted panels + sconces on the lower piers
    artPanelX(b, s * FX, dir, 6.5, 7.7, FY + 1.1, FY + 3.6);
    for (const z of [8.15, 19.95]) {
      sconce(b, ctx, s * (FX - 0.62), FY + 4.15, z, s > 0 ? -PI / 2 : PI / 2);
      sconce(b, ctx, s * (FX - 0.22), FY + 6.6, z, s > 0 ? -PI / 2 : PI / 2);
    }
    sconce(b, ctx, s * (FX - 0.1), FY + 4.3, 14.1, s > 0 ? -PI / 2 : PI / 2);
  }
}

// ---------- the wall between the foyer and the auditorium (rear of the house)
function buildAudFoyerWall(b, ctx, R) {
  wallPanel(b, 0, -AXH, AXH, FY, AUD_TOP, AZ1 - 0.6, AZ1, NZ, PZ, [{ c: 0, w: 13.0, y0: FY, y1: FY + 4.45 }], I_WALL, I_WALL, MI.wall, MI.wall);
  // the two wings of the same wall outside the auditorium
  for (const s of [-1, 1]) {
    const xa = s > 0 ? AXH : -FX, xb = s > 0 ? FX : -AXH;
    wallPanel(b, 0, xa, xb, FY, FCEIL, AZ1, AZ1 + 0.6, NZ, PZ, [], I_WALL, I_WALL, MI.wall, MI.wall);
    wallPanel(b, 0, xa, xb, FCEIL, FCEIL + 0.001, AZ1, AZ1 + 0.6, NZ, PZ, [], I_WALL, I_WALL, MI.wall, MI.wall);
  }
  // portal trim on the foyer side: jamb pilasters + a gilded arch ring
  const r = 6.5, y0 = FY + 4.45;
  for (let i = 0; i < 14; i++) {
    const a0 = PI * (i / 14), a1 = PI * ((i + 1) / 14);
    const p0 = [Math.cos(a0) * r, y0 + Math.sin(a0) * r], p1 = [Math.cos(a1) * r, y0 + Math.sin(a1) * r];
    const p2 = [Math.cos(a1) * (r + 0.55), y0 + Math.sin(a1) * (r + 0.55)], p3 = [Math.cos(a0) * (r + 0.55), y0 + Math.sin(a0) * (r + 0.55)];
    b.quad([p0[0], p0[1], AZ1 + 0.05], [p1[0], p1[1], AZ1 + 0.05], [p2[0], p2[1], AZ1 + 0.05], [p3[0], p3[1], AZ1 + 0.05], I_GOLD, MI.gold, PZ);
  }
  // the big gilt-framed murals flanking the portal (banded allegories) + roundel frieze
  for (const sd of [-1, 1]) {
    const xa = sd > 0 ? 8.2 : -19.6, xb = sd > 0 ? 19.6 : -8.2;
    artPanelZ(b, AZ1, 1, Math.min(xa, xb), Math.max(xa, xb), FY + 1.3, FY + 8.9);
    artPanelZ(b, AZ1, 1, Math.min(xa, xb) + 0.7, Math.max(xa, xb) - 0.7, FY + 9.9, FCEIL - 1.5);
    for (let i = 0; i < 4; i++) {
      const x = sd * (10.9 + i * 2.35);
      at(b, x, FY + 11.4, AZ1 + 0.2, () => {
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * TAU;
          bx(b, Math.cos(a) * 0.5 - 0.1, Math.cos(a) * 0.5 + 0.1, Math.sin(a) * 0.5 - 0.1, Math.sin(a) * 0.5 + 0.1, 0, 0.1, I_GOLD_HI, MI.goldHi);
        }
        ellipsoid(b, 0.22, 0.22, 0.08, 8, 3, I_GOLD, MI.gold);
      });
    }
  }
  // painted tympanum above the portal: a sky-and-sun mosaic in a gold ring
  for (let i = 0; i < 24; i++) {
    const a0 = PI * (i / 24), a1 = PI * ((i + 1) / 24);
    const rr = r - 0.62;
    b.tri([0, y0 + 0.2, AZ1 + 0.045], [Math.cos(a0) * rr, y0 + Math.sin(a0) * rr, AZ1 + 0.045], [Math.cos(a1) * rr, y0 + Math.sin(a1) * rr, AZ1 + 0.045],
          (i & 1) ? I_SKY : mixc(I_SKY, I_GOLD, 0.34), MI.glow, PZ, PZ, PZ);
  }
  for (let i = 0; i < 12; i++) {
    const a = PI * (i / 12), r0 = 0.9, r1 = r - 1.4;
    const ux = Math.cos(a), uy = Math.sin(a), wx = -uy * 0.14, wy = ux * 0.14;
    b.quad([ux * r0 + wx, y0 + uy * r0 + wy, AZ1 + 0.05], [ux * r1 + wx, y0 + uy * r1 + wy, AZ1 + 0.05],
           [ux * r1 - wx, y0 + uy * r1 - wy, AZ1 + 0.05], [ux * r0 - wx, y0 + uy * r0 - wy, AZ1 + 0.05], I_GOLD, MI.gold, PZ);
  }
  at(b, 0, y0 + 0.9, AZ1 + 0.06, () => { for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; ellipsoid(b, Math.cos(a) * 0.0 + 0.16, 0.16, 0.16, 5, 3, I_GOLD_HI, MI.goldHi); } });
  bx(b, -0.6, 0.6, y0 + r - 0.25, y0 + r + 0.95, AZ1, AZ1 + 0.32, I_GOLD_HI, MI.goldHi, { topCol: mulc(I_GOLD_HI, 1.06) });
  for (const s of [-1, 1]) {
    bx(b, s * 6.5 - 0.32, s * 6.5 + 0.32, FY, y0 + r, AZ1, AZ1 + 0.28, I_MARB, MI.marble);
    bx(b, s * (6.5 + 0.55) - 0.3, s * (6.5 + 0.55) + 0.3, FY, y0 + r + 0.5, AZ1, AZ1 + 0.2, I_GOLD_D, MI.gold);
  }
}

// ---------- auditorium shell: floor, side walls, proscenium wall, entablature, painted dome
function buildAuditoriumShell(b, ctx, R) {
  // stalls floor
  flatPanel(b, -AXH, AXH, AZ0, AZ1, FY, true, [], I_FLOOR_B, MI.floorB, 2.6, I_FLOOR_A);
  qUp(b, FY + 0.006, -AXH + 1.4, AXH - 1.4, AZ0 + 0.8, AZ1 - 0.8, I_MARB_D, MI.marble);
  // side walls (interior faces); the tier bands hang on them
  for (const s of [-1, 1]) {
    wallPanel(b, 1, AZ0, AZ1, FY, AUD_TOP, s * AXH, s * (AXH + 0.6), s > 0 ? NX : PX, s > 0 ? PX : NX, [], I_WALL, I_WALL_SH, MI.wall, MI.wallSh);
  }
  // proscenium wall with the great arch
  wallPanel(b, 0, -AXH, AXH, FY, AUD_TOP, AZ0, AZ0 - 1.0, PZ, NZ, [{ c: 0, w: 18.4, y0: FY, ys: 8.0 }], I_WALL, I_WALL_SH, MI.wall, MI.wallSh);
  // entablature ring around the top of the house
  for (const s of [-1, 1]) {
    bx(b, s > 0 ? AXH - 1.1 : -AXH, s > 0 ? AXH : -AXH + 1.1, AUD_TOP - 1.2, AUD_TOP, AZ0, AZ1, I_WALL_HI, MI.wallHi);
    bx(b, s > 0 ? AXH - 1.3 : -AXH, s > 0 ? AXH : -AXH + 1.3, AUD_TOP - 1.35, AUD_TOP - 1.2, AZ0, AZ1, I_GOLD, MI.gold);
  }
  bx(b, -AXH, AXH, AUD_TOP - 1.2, AUD_TOP, AZ1 - 1.1, AZ1, I_WALL_HI, MI.wallHi);
  bx(b, -AXH, AXH, AUD_TOP - 1.35, AUD_TOP - 1.2, AZ1 - 1.3, AZ1, I_GOLD, MI.gold);
  bx(b, -AXH, AXH, AUD_TOP - 1.2, AUD_TOP, AZ0, AZ0 + 1.0, I_WALL_HI, MI.wallHi);
  // painted dome: flat spandrel from the rectangle to the ellipse, then the bowl
  ringToRect(b, AUD_TOP, 0, -3.75, 16.4, 9.7, -AXH + 0.02, AXH - 0.02, AZ0 + 0.02, AZ1 - 0.02, 48, I_WALL_SH, MI.wallSh);
  paintDome(b, 0, -3.75, AUD_TOP, 16.4, 9.7, DOME_APEX - AUD_TOP, 40, 9);
  // central oculus medallion at the dome apex
  qDn(b, DOME_APEX - 0.12, -2.6, 2.6, -3.75 - 2.0, -3.75 + 2.0, I_SKY, MI.glow);
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * TAU;
    bx(b, Math.cos(a) * 2.7 - 0.16, Math.cos(a) * 2.7 + 0.16, DOME_APEX - 0.24, DOME_APEX - 0.1, -3.75 + Math.sin(a) * 2.1 - 0.16, -3.75 + Math.sin(a) * 2.1 + 0.16, I_GOLD_HI, MI.goldHi);
  }
}

// soffit ring between a rectangle and an ellipse (both at height y)
function ringToRect(b, y, cx, cz, rx, rz, x0, x1, z0, z1, seg, c, m) {
  const wallPt = (dx, dz) => {
    const tx = dx > 1e-6 ? (x1 - cx) / dx : (dx < -1e-6 ? (x0 - cx) / dx : 1e9);
    const tz = dz > 1e-6 ? (z1 - cz) / dz : (dz < -1e-6 ? (z0 - cz) / dz : 1e9);
    const t = Math.min(tx, tz);
    return [cx + dx * t, cz + dz * t];
  };
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    const e0 = [cx + Math.cos(a0) * rx, cz + Math.sin(a0) * rz];
    const e1 = [cx + Math.cos(a1) * rx, cz + Math.sin(a1) * rz];
    const w0 = wallPt(e0[0] - cx, e0[1] - cz);
    const w1 = wallPt(e1[0] - cx, e1[1] - cz);
    b.quad([e0[0], y, e0[1]], [e1[0], y, e1[1]], [w1[0], y, w1[1]], [w0[0], y, w0[1]], c, m, NY);
  }
}

// painted interior dome bowl, normals inward, gold ribs + painted panels
function paintDome(b, cx, cz, y0, rx, rz, h, seg, rings) {
  const P = (a, t) => {
    const ang = t * PI * 0.5;
    const r = Math.cos(ang);
    return [cx + Math.cos(a) * rx * r, y0 + h * Math.sin(ang), cz + Math.sin(a) * rz * r];
  };
  const N = (a, t) => {
    const ang = t * PI * 0.5;
    return norm([-Math.cos(a) * Math.cos(ang) / rx, -Math.sin(ang) / Math.max(h, 0.1), -Math.sin(a) * Math.cos(ang) / rz]);
  };
  // painted panels: a warm ivory field with blue medallions, alternating per ring
  for (let j = 0; j < rings; j++) {
    const t0 = j / rings, t1 = (j + 1) / rings;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
      const p00 = P(a0, t0), p10 = P(a1, t0), p11 = P(a1, t1), p01 = P(a0, t1);
      const band = j / rings;
      let cc;
      if ((i % 2) === 0) cc = mixc(I_WALL_HI, I_BLUE, 0.16 + 0.1 * band);
      else cc = mixc(mixc(I_WALL, I_GOLD, 0.18), I_WALL_HI, 0.10 + 0.2 * band);
      if (j === 0) cc = mixc(I_WALL_HI, I_GOLD, 0.12);
      b.quad(p00, p01, p11, p10, cc, MI.wall, N(a0 + 0.05, (t0 + t1) / 2));
    }
  }
  // 16 thin gilded meridian ribs following the bowl
  for (let r = 0; r < 16; r++) {
    const a = (r / 16) * TAU;
    const dx = Math.cos(a), dz = Math.sin(a);
    const tx = -dz, tz = dx;
    for (let j = 0; j < rings; j++) {
      const t0 = j / rings, t1 = (j + 1) / rings;
      const p0 = P(a, t0), p1 = P(a, t1);
      const w0 = 0.20 * (1 - 0.6 * t0), w1 = 0.20 * (1 - 0.6 * t1);
      const n = N(a, (t0 + t1) / 2);
      b.quad([p0[0] - tx * w0, p0[1] - 0.02, p0[2] - tz * w0], [p0[0] + tx * w0, p0[1] - 0.02, p0[2] + tz * w0],
             [p1[0] + tx * w1, p1[1] - 0.02, p1[2] + tz * w1], [p1[0] - tx * w1, p1[1] - 0.02, p1[2] - tz * w1], I_GOLD, MI.gold, n);
    }
  }
  // three gold rings across the bowl
  for (const t of [0.30, 0.62, 0.90]) {
    const p = P(0, t), r = Math.hypot(p[0] - cx, p[2] - cz);
    const yy = p[1];
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
      b.quad([cx + Math.cos(a0) * rx * Math.cos(t * PI / 2), yy - 0.03, cz + Math.sin(a0) * rz * Math.cos(t * PI / 2)],
             [cx + Math.cos(a0) * rx * Math.cos(t * PI / 2) * 0.982, yy - 0.03, cz + Math.sin(a0) * rz * Math.cos(t * PI / 2) * 0.982],
             [cx + Math.cos(a1) * rx * Math.cos(t * PI / 2) * 0.982, yy - 0.03, cz + Math.sin(a1) * rz * Math.cos(t * PI / 2) * 0.982],
             [cx + Math.cos(a1) * rx * Math.cos(t * PI / 2), yy - 0.03, cz + Math.sin(a1) * rz * Math.cos(t * PI / 2)], I_GOLD, MI.gold, NY);
    }
    void r;
  }
}

// ---------- stage + backstage shells
function buildStageShell(b, ctx, R) {
  const z1 = STAGE.z1, z0 = STAGE.z0, sx = STAGE.x;
  flatPanel(b, -sx, sx, z0, z1, FY, true, [], I_WOOD, MI.wood, 2.0, I_WALL_SH);
  for (const s of [-1, 1]) {
    wallPanel(b, 1, z0, z1, FY, STAGE.h, s * sx, s * (sx + 0.6), s > 0 ? NX : PX, s > 0 ? PX : NX, [], I_WALL_SH, I_WALL_SH, MI.wallSh, MI.wallSh);
  }
  wallPanel(b, 0, -sx, sx, FY, STAGE.h, z0, z0 + 0.6, NZ, PZ, [{ c: 0, w: 3.0, y0: FY, y1: FY + 2.6 }], I_WALL_SH, I_WALL_SH, MI.wallSh, MI.wallSh);
  qDn(b, STAGE.h, -sx, sx, z0, z1, I_DARK, MI.dark);
  // fly grid + battens
  for (let i = 0; i < 6; i++) {
    const z = z0 + 0.8 + i * 1.05;
    bx(b, -sx + 0.2, sx - 0.2, STAGE.h - 0.5, STAGE.h - 0.25, z - 0.12, z + 0.12, I_WOOD, MI.wood);
  }
  // backstage
  flatPanel(b, -BST.x, BST.x, BST.z0 + 1.8, BST.z1, FY, true, [], I_WALL_SH, MI.wallSh, 0, null);
  for (const s of [-1, 1]) {
    wallPanel(b, 1, BST.z0 + 1.8, BST.z1, FY, BST.h, s * BST.x, s * (BST.x + 0.5), s > 0 ? NX : PX, s > 0 ? PX : NX, [], I_WALL_SH, I_WALL_SH, MI.wallSh, MI.wallSh);
  }
  qDn(b, BST.h, -BST.x, BST.x, BST.z0 + 1.8, BST.z1, I_WALL_SH, MI.wallSh);
}

// ---------- salons (one each side, reached through the foyer arcades)
function buildSalonShell(b, ctx, R) {
  for (const s of [-1, 1]) {
    const xa = s > 0 ? SAL.x0 : -SAL.x1, xb = s > 0 ? SAL.x1 : -SAL.x0;
    flatPanel(b, xa, xb, SAL.z0, SAL.z1, FY, true, [], I_FLOOR_A, MI.floor, 2.6, I_FLOOR_B);
    // partitions front and back
    wallPanel(b, 0, xa, xb, FY, SAL.ceil, SAL.z0, SAL.z0 + 0.5, PZ, NZ, [], I_WALL, I_WALL_SH, MI.wall, MI.wallSh);
    wallPanel(b, 0, xa, xb, FY, SAL.ceil, SAL.z1 - 0.5, SAL.z1, NZ, PZ, [], I_WALL, I_WALL_SH, MI.wall, MI.wallSh);
    // ceiling with a cove
    qDn(b, SAL.ceil, xa, xb, SAL.z0, SAL.z1, I_WALL_HI, MI.wallHi);
    bx(b, xa, xb, SAL.ceil - 0.5, SAL.ceil, SAL.z0 + 0.2, SAL.z0 + 0.9, I_MARB, MI.marble);
    bx(b, xa, xb, SAL.ceil - 0.5, SAL.ceil, SAL.z1 - 0.9, SAL.z1 - 0.2, I_MARB, MI.marble);
    // coffer grid
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 5; j++) {
        const x = xa + (i + 0.5) * ((xb - xa) / 4), z = SAL.z0 + (j + 0.5) * ((SAL.z1 - SAL.z0) / 5);
        qDn(b, SAL.ceil - 0.52, x - 0.7, x + 0.7, z - 0.85, z + 0.85, (i + j) & 1 ? I_WALL : I_WALL_HI, MI.wall);
        bx(b, x - 0.16, x + 0.16, SAL.ceil - 0.56, SAL.ceil - 0.5, z - 0.16, z + 0.16, I_GOLD_HI, MI.goldHi);
      }
    }
  }
}

// ---------- foyer detail: arcades, mirrors, statues, chandeliers, planting
function buildFoyerDetail(b, ctx, R) {
  // blind arcade + mirrors on the foyer front wall (flanking the vestibule portal)
  for (const x of [-19.5, -13.6, 13.6, 19.5]) {
    const w = 4.4;
    // gold-framed mirror: a pale glossy panel, framed in gold, tilted out 0.1
    bx(b, x - w / 2 - 0.45, x + w / 2 + 0.45, FY + 0.35, FCEIL - 1.6, FZ1 - 0.42, FZ1 - 0.2, I_GOLD, MI.gold);
    winArch(b, 0, x, w, FY + 0.6, FY + 7.6, FZ1 - 0.4, -1, mixc(I_SKY, I_MARB, 0.35), [0.13, 0.92], I_GOLD_HI, MI.goldHi, false);
    bx(b, x - w / 2 - 0.6, x + w / 2 + 0.6, FY, FY + 0.4, FZ1 - 0.6, FZ1 - 0.05, I_MARB, MI.marbleHi);
    bx(b, x - w / 2 - 0.6, x + w / 2 + 0.6, FCEIL - 1.7, FCEIL - 1.45, FZ1 - 0.6, FZ1 - 0.05, I_MARB, MI.marbleHi);
    bx(b, x - 0.3, x + 0.3, FCEIL - 1.6, FCEIL - 0.2, FZ1 - 0.42, FZ1 - 0.3, I_GOLD_HI, MI.goldHi);
  }
  // statues in niches on the foyer front wall between the mirrors
  for (const x of [-16.6, 16.6]) {
    bx(b, x - 1.5, x + 1.5, FY, FY + 0.9, FZ1 - 1.2, FZ1 - 0.4, I_MARB, MI.marble);
    at(b, x, FY + 0.9, FZ1 - 0.85, () => fig(b, I_MARB, MI.marbleHi, 1.15, PI));
    bx(b, x - 1.7, x + 1.7, FY + 3.9, FY + 4.3, FZ1 - 1.3, FZ1 - 0.2, I_GOLD, MI.gold);
  }
  // the three great chandeliers
  chandelier(b, ctx, 0, 16.4, 12.8, 1.95);
  chandelier(b, ctx, -15.0, 15.0, 11.0, 1.15);
  chandelier(b, ctx, 15.0, 15.0, 11.0, 1.15);
  chandelier(b, ctx, -15.0, 15.0, 18.0, 1.05);
  chandelier(b, ctx, 15.0, 15.0, 18.0, 1.05);
  // candelabra on the floor flanking the central axis
  for (const s of [-1, 1]) {
    for (const z of [8.6, 18.2]) {
      const x = s * 7.0;
      bx(b, x - 0.42, x + 0.42, FY, FY + 0.35, z - 0.42, z + 0.42, I_MARB_D, MI.marble);
      bx(b, x - 0.22, x + 0.22, FY + 0.35, FY + 2.6, z - 0.22, z + 0.22, I_MARB, MI.marbleHi);
      bx(b, x - 0.3, x + 0.3, FY + 2.6, FY + 2.85, z - 0.3, z + 0.3, I_GOLD, MI.gold);
      bx(b, x - 0.05, x + 0.05, FY + 2.85, FY + 3.7, z - 0.05, z + 0.05, I_GOLD, MI.gold);
      for (const dx of [-1, 0, 1]) {
        bx(b, x + dx * 0.42 - 0.07, x + dx * 0.42 + 0.07, FY + 3.7, FY + 4.1, z - 0.07, z + 0.07, I_GOLD_HI, MI.goldHi);
        bx(b, x + dx * 0.42 - 0.055, x + dx * 0.42 + 0.055, FY + 4.1, FY + 4.5, z - 0.055, z + 0.055, I_LAMP, MI.glow);
      }
      if (ctx.lanterns) ctx.lanterns.push({ p: W(x, FY + 4.4, z), size: 2.0, rot: 0, alpha: 0.34, shape: 1, col: mixc(C.sunGlow, C.goldBright, 0.4) });
    }
  }
  // four gilded torchères around the foyer
  floorLamp(b, ctx, -22.4, FY, 10.2, 4.6);
  floorLamp(b, ctx, 22.4, FY, 10.2, 4.6);
  floorLamp(b, ctx, -22.4, FY, 16.6, 4.6);
  floorLamp(b, ctx, 22.4, FY, 16.6, 4.6);
  // two great marble urns flanking the portal, two figures by the side aisles
  plinthUrn(b, -9.4, 7.3, 1.05);
  plinthUrn(b, 9.4, 7.3, 1.05);
  plinthStatue(b, -23.2, 10.6, 1.12, PI / 2, I_MARB, MI.marbleHi);
  plinthStatue(b, 23.2, 10.6, 1.12, -PI / 2, I_MARB, MI.marbleHi);
  // potted bay trees at the corners
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * 23.2, z = sz > 0 ? 18.6 : 7.2;
    bx(b, x - 0.52, x + 0.52, FY, FY + 1.05, z - 0.52, z + 0.52, I_MARB, MI.marble, { topCol: mulc(I_MARB, 1.05) });
    bx(b, x - 0.14, x + 0.14, FY + 1.05, FY + 2.2, z - 0.14, z + 0.14, I_WOOD, MI.wood);
    at(b, x, FY + 2.2, z, () => ellipsoid(b, 1.15, 1.5, 1.15, 9, 6, I_LEAF, MI.leaf));
  }
}

// a sloping hand-rail along a flight (x fixed; the flight runs in z)
function rampRail(b, x, zA, zB, yA, yB, dir) {
  const n = 6;
  for (let i = 0; i <= n; i++) {
    const t = i / n, z = lerp(zA, zB, t), y = lerp(yA, yB, t);
    bx(b, x - 0.06, x + 0.06, y, y + 0.92, z - 0.06, z + 0.06, I_MARB, MI.marbleHi);
  }
  // marble hand rail + a gold fillet
  bar3(b, [x, yA + 0.92, zA], [x, yB + 0.92, zB], 0.15, 0.12, I_MARB, MI.marbleHi, PY);
  bar3(b, [x, yA + 1.04, zA], [x, yB + 1.04, zB], 0.11, 0.05, I_GOLD, MI.gold, PY);
  void dir;
}

// ---------- the twin double-flight grand staircases
function buildStairs(b, ctx, R) {
  const N1 = 10, rise1 = (6.1 - FY) / N1, run1 = (19.4 - 13.4) / N1;
  const N2 = 10, rise2 = (GAL_Y - 6.1) / N2, run2 = (18.4 - 13.4) / N2;
  for (const s of [-1, 1]) {
    const xa = s * 7.6, xb = s * 13.2;         // lower flight
    const xc = s * 14.0, xd = s * 19.6;         // upper flight
    // lower flight: solid stone steps, rising toward -z
    for (let i = 0; i < N1; i++) {
      const z0 = 19.4 - run1 * i, z1 = z0 - run1;
      const top = FY + rise1 * (i + 1);
      bx(b, Math.min(xa, xb), Math.max(xa, xb), FY, top, z1, z0, i % 2 ? I_MARB : I_MARB_D, MI.marble, { topCol: mulc(I_MARB, 1.03) });
      bx(b, Math.min(xa, xb), Math.max(xa, xb), top - 0.045, top, z1 - 0.06, z1, I_GOLD, MI.gold);
    }
    // half landing
    bx(b, Math.min(s * 7.6, s * 19.6), Math.max(s * 7.6, s * 19.6), 5.6, 6.1, 11.4, 13.4, I_MARB, MI.marble, { topCol: mulc(I_MARB, 1.03) });
    bx(b, Math.min(s * 7.6, s * 19.6), Math.max(s * 7.6, s * 19.6), 5.45, 5.6, 11.4, 13.4, I_GOLD_D, MI.gold);
    // upper flight: rises toward +z
    for (let i = 0; i < N2; i++) {
      const z0 = 13.4 + run2 * i, z1 = z0 + run2;
      const top = 6.1 + rise2 * (i + 1);
      bx(b, Math.min(xc, xd), Math.max(xc, xd), 5.6, top, z0, z1, i % 2 ? I_MARB : I_MARB_D, MI.marble, { topCol: mulc(I_MARB, 1.03) });
      bx(b, Math.min(xc, xd), Math.max(xc, xd), top - 0.045, top, z0, z0 + 0.06, I_GOLD, MI.gold);
    }
    // the core wall between the two flights
    bx(b, Math.min(s * 13.2, s * 14.0), Math.max(s * 13.2, s * 14.0), FY, 8.6, 13.4, 19.4, I_WALL_HI, MI.wallHi);
    bx(b, Math.min(s * 13.2, s * 14.0), Math.max(s * 13.2, s * 14.0), 8.6, 8.8, 13.2, 19.5, I_GOLD, MI.gold);
    // gilt urns + a marble figure standing on the stair-parapet coping
    urnAt(b, s * 13.0, 8.8, 14.0, 1.15, I_GOLD_HI);
    urnAt(b, s * 13.0, 8.8, 18.8, 1.15, I_GOLD_HI);
    at(b, s * 13.6, 8.8, 16.4, () => fig(b, I_MARB, MI.marbleHi, 1.05, s > 0 ? -PI / 2 : PI / 2));
    sconce(b, ctx, s * 7.7, FY + 6.2, 13.6, s > 0 ? -PI / 2 : PI / 2);
    // sloping hand rails (house side and central side)
    rampRail(b, s * 7.55, 19.4, 13.4, FY, 6.1);
    rampRail(b, s * 13.15, 19.4, 13.4, FY, 6.1);
    rampRail(b, s * 19.65, 13.4, 18.4, 6.1, GAL_Y);
    // newel urns at the bottom
    urnAt(b, s * 7.5, FY, 19.5, 1.3, I_GOLD_HI);
    urnAt(b, s * 13.3, FY, 19.5, 1.3, I_GOLD_HI);
    // balustrade around the half landing and the top balcony edge
    at(b, s * 13.6, 6.1, 11.4, () => { b.push(m4.rotY(PI / 2)); kBal(b, 1.9, 1.05, I_MARB); b.pop(); });
    // gallery slab + balustrade at the first tier level
    bx(b, s > 0 ? 19.6 : -FX, s > 0 ? FX : -19.6, GAL_Y - 0.5, GAL_Y, FZ0, FZ1, I_MARB, MI.marble, { topCol: mulc(I_MARB, 1.04) });
    bx(b, s > 0 ? 19.5 : -FX, s > 0 ? FX : -19.5, GAL_Y - 0.68, GAL_Y - 0.5, FZ0, FZ1, I_GOLD_D, MI.gold);
    bx(b, s > 0 ? 14.0 : -FX, s > 0 ? FX : -14.0, GAL_Y - 0.5, GAL_Y, 18.4, FZ1, I_MARB, MI.marble, { topCol: mulc(I_MARB, 1.04) });
    bx(b, s > 0 ? 14.0 : -FX, s > 0 ? FX : -14.0, GAL_Y - 0.68, GAL_Y - 0.5, 18.4, FZ1, I_GOLD_D, MI.gold);
    at(b, s * 19.55, GAL_Y, 12.6, () => { b.push(m4.rotY(PI / 2)); kBal(b, FZ1 - 6.4 - 0.2, 1.1, I_MARB); b.pop(); });
    // gold rail along the balcony front
    bar3(b, [s * 19.55, GAL_Y + 1.1, 6.4], [s * 19.55, GAL_Y + 1.1, 18.4], 0.2, 0.14, I_GOLD_HI, MI.goldHi, PY);
    // red carpet up the stairs
    for (let i = 0; i < N1; i++) {
      const z0 = 19.4 - run1 * i, z1 = z0 - run1, top = FY + rise1 * (i + 1) + 0.02;
      qUp(b, top, Math.min(s * 9.0, s * 11.8), Math.max(s * 9.0, s * 11.8), z1 + 0.02, z0 - 0.02, I_RED, MI.red);
    }
    for (let i = 0; i < N2; i++) {
      const z0 = 13.4 + run2 * i, z1 = z0 + run2, top = 6.1 + rise2 * (i + 1) + 0.02;
      qUp(b, top, Math.min(s * 15.4, s * 18.2), Math.max(s * 15.4, s * 18.2), z0 + 0.02, z1 - 0.02, I_RED, MI.red);
    }
  }
  // the balustrade across the balcony between the two staircases (over the entrance)
  at(b, 0, GAL_Y, 20.0, () => kBal(b, 27.2, 1.1, I_MARB));
}

// ================================================================ AUDITORIUM DETAIL
// the horseshoe plan of the box tiers (x, z), stage side -> around the back -> stage side
const HP = [
  [-9.2, -13.5], [-12.4, -11.2], [-13.6, -8.0], [-13.9, -4.0], [-13.5, -0.4],
  [-12.0, 1.6], [-9.2, 2.6], [-5.2, 3.05], [0, 3.15], [5.2, 3.05],
  [9.2, 2.6], [12.0, 1.6], [13.5, -0.4], [13.9, -4.0], [13.6, -8.0],
  [12.4, -11.2], [9.2, -13.5],
];
const BAND_D = 2.6;
const HPC = [0, -4.6];   // house centre used for the outward normals
function hpOut() {
  const out = [];
  const n = HP.length;
  for (let i = 0; i < n; i++) {
    const a = HP[Math.max(0, i - 1)], c = HP[Math.min(n - 1, i + 1)];
    let tx = c[0] - a[0], tz = c[1] - a[1];
    const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    let nx = tz, nz = -tx;
    if (nx * (HP[i][0] - HPC[0]) + nz * (HP[i][1] - HPC[1]) < 0) { nx = -nx; nz = -nz; }
    out.push([nx, nz]);
  }
  return out;
}
const HPN = hpOut();
const HPQ = HP.map((p, i) => {
  const qx = clamp(p[0] + HPN[i][0] * BAND_D, -AXH + 0.06, AXH - 0.06);
  const qz = clamp(p[1] + HPN[i][1] * BAND_D, AZ0 + 0.06, AZ1 - 0.06);
  return [qx, qz];
});

function boxCol(b, x, z, y0, h, r, col, mat) {
  bx(b, x - r * 2.2, x + r * 2.2, y0, y0 + 0.16, z - r * 2.2, z + r * 2.2, col, mat);
  bx(b, x - r * 1.8, x + r * 1.8, y0 + 0.16, y0 + 0.26, z - r * 1.8, z + r * 1.8, I_GOLD, MI.gold);
  at(b, x, y0 + 0.26, z, () => cylinder(b, 7, r, r * 0.86, Math.max(0.2, h - 0.62), col, mat, { y0: 0, caps: false }));
  bx(b, x - r * 2.1, x + r * 2.1, y0 + h - 0.36, y0 + h - 0.18, z - r * 2.1, z + r * 2.1, col, mat);
  bx(b, x - r * 2.5, x + r * 2.5, y0 + h - 0.18, y0 + h, z - r * 2.5, z + r * 2.5, I_GOLD_HI, MI.goldHi);
}
function tierBand(b, ty, t, ctx) {
  const bot = ty - BAND_T;
  const ceil = t < 2 ? TIER[t + 1] - BAND_T : AUD_TOP - 1.25;
  const n = HP.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = HP[i], p1 = HP[i + 1], q0 = HPQ[i], q1 = HPQ[i + 1];
    const nx = (HPN[i][0] + HPN[i + 1][0]) / 2, nz = (HPN[i][1] + HPN[i + 1][1]) / 2;
    const inx = -nx, inz = -nz;
    // floor, underside, parapet front, ceiling, back wall
    b.quad([p0[0], ty, p0[1]], [p0[0], ty, q0[1]], [p1[0], ty, q1[1]], [p1[0], ty, p1[1]], I_MARB, MI.marbleHi, PY);
    const q0b = [q0[0], bot, q0[1]], q1b = [q1[0], bot, q1[1]];
    b.quad([p0[0], bot, p0[1]], [p1[0], bot, p1[1]], [q1[0], bot, q1[1]], [q0[0], bot, q0[1]], I_WALL, MI.wall, NY);
    b.quad([p0[0], bot, p0[1]], [p1[0], bot, p1[1]], [p1[0], ty + 1.05, p1[1]], [p0[0], ty + 1.05, p0[1]], I_MARB_D, MI.marble, [inx, 0, inz]);
    // red velvet panel + gold frame on the balcony front
    b.quad([p0[0] + inx * 0.03, ty - 0.2, p0[1] + inz * 0.03], [p1[0] + inx * 0.03, ty - 0.2, p1[1] + inz * 0.03],
           [p1[0] + inx * 0.03, ty + 0.72, p1[1] + inz * 0.03], [p0[0] + inx * 0.03, ty + 0.72, p0[1] + inz * 0.03], I_RED, MI.red, [inx, 0, inz]);
    b.quad([p0[0] + inx * 0.045, ty + 0.72, p0[1] + inz * 0.045], [p1[0] + inx * 0.045, ty + 0.72, p1[1] + inz * 0.045],
           [p1[0] + inx * 0.045, ty + 0.86, p1[1] + inz * 0.045], [p0[0] + inx * 0.045, ty + 0.86, p0[1] + inz * 0.045], I_GOLD, MI.gold, [inx, 0, inz]);
    // gilt moulding at the foot of the balcony front + a fine top fillet
    b.quad([p0[0] + inx * 0.045, ty - 0.34, p0[1] + inz * 0.045], [p1[0] + inx * 0.045, ty - 0.34, p1[1] + inz * 0.045],
           [p1[0] + inx * 0.045, ty - 0.22, p1[1] + inz * 0.045], [p0[0] + inx * 0.045, ty - 0.22, p0[1] + inz * 0.045], I_GOLD, MI.gold, [inx, 0, inz]);
    b.quad([p0[0] + inx * 0.06, ty + 0.99, p0[1] + inz * 0.06], [p1[0] + inx * 0.06, ty + 0.99, p1[1] + inz * 0.06],
           [p1[0] + inx * 0.06, ty + 1.07, p1[1] + inz * 0.06], [p0[0] + inx * 0.06, ty + 1.07, p0[1] + inz * 0.06], I_GOLD_HI, MI.goldHi, [inx, 0, inz]);
    b.quad([p0[0], bot, p0[1]], [q0[0], bot, q0[1]], [q0[0], ceil, q0[1]], [p0[0], ceil, p0[1]], I_WALL_SH, MI.wallSh, [inx, 0, inz]);
    b.quad([p0[0], ceil, p0[1]], [q0[0], ceil, q0[1]], [q1[0], ceil, q1[1]], [p1[0], ceil, p1[1]], I_WALL, MI.wall, NY);
    b.quad([q0[0], bot, q0[1]], [q0[0], ceil, q0[1]], [q1[0], ceil, q1[1]], [q1[0], bot, q1[1]], I_WALL_SH, MI.wallSh, [inx, 0, inz]);
    // gilded hand rail following the curve
    bar3(b, [p0[0] + inx * 0.18, ty + 1.14, p0[1] + inz * 0.18], [p1[0] + inx * 0.18, ty + 1.14, p1[1] + inz * 0.18], 0.26, 0.14, I_GOLD_HI, MI.goldHi, PY);
    void q0b; void q1b;
  }
  // paired box columns at each bay division + sconce glow
  for (let i = 0; i < n; i++) {
    const p = HP[i];
    const hgt = ceil - (ty + 1.2);
    if (hgt > 0.4) {
      boxCol(b, p[0] - HPN[i][0] * 0.25, p[1] - HPN[i][1] * 0.25, ty + 1.12, hgt, 0.15, I_MARB, MI.marbleHi);
      bx(b, p[0] - 0.26, p[0] + 0.26, ceil - 0.22, ceil, p[1] - 0.26, p[1] + 0.26, I_GOLD, MI.gold);
    }
    if (i % 3 === 1) {
      at(b, p[0] - HPN[i][0] * 0.1, ty + 1.5, p[1] - HPN[i][1] * 0.1, () => {
        bx(b, -0.1, 0.1, 0, 0.5, -0.1, 0.1, I_GOLD, MI.gold);
        bx(b, -0.28, 0.28, 0.45, 0.55, -0.24, 0.24, I_GOLD_HI, MI.goldHi);
        bx(b, -0.16, 0.16, 0.55, 0.85, -0.16, 0.16, I_GLOW, MI.glow);
      });
      if (ctx && ctx.lanterns) {
        const lx = p[0] - HPN[i][0] * 0.35, lz = p[1] - HPN[i][1] * 0.35;
        ctx.lanterns.push({ p: W(lx, ty + 1.9, lz), size: 1.6, rot: 0, alpha: 0.40, shape: 1, col: mixc(C.sunGlow, C.goldBright, 0.38) });
      }
    }
  }
}

function buildAuditoriumDetail(b, ctx, R) {
  // three tier bands
  for (let t = 0; t < 3; t++) tierBand(b, TIER[t], t, ctx);
  // parterre seating: 11 rows facing the stage, centre aisle kept clear
  for (let r = 0; r < 11; r++) {
    const z = AZ0 + 2.1 + r * 0.9;
    const hw = 9.0 + r * 0.38;
    for (const k of [-1, 1]) {
      for (let x = 1.0; x <= hw; x += 0.62) seat(b, k * x, FY, z);
    }
  }
  // parterre aisles: red carpet runners with gilt edging along both side aisles
  for (const sd of [-1, 1]) {
    const x0 = sd > 0 ? 12.9 : -13.7, x1 = sd > 0 ? 13.7 : -12.9;
    qUp(b, FY + 0.02, Math.min(x0, x1), Math.max(x0, x1), AZ0 + 1.7, AZ1 - 1.5, I_RED, MI.red);
    for (const xg of [x0, x1]) qUp(b, FY + 0.024, Math.min(xg, xg + sd * 0.18), Math.max(xg, xg + sd * 0.18), AZ0 + 1.7, AZ1 - 1.5, I_GOLD_D, MI.gold);
  }
  // gilt lines flanking the central aisle
  for (const sd of [-1, 1]) qUp(b, FY + 0.02, Math.min(sd * 1.0, sd * 1.18), Math.max(sd * 1.0, sd * 1.18), AZ0 + 1.8, AZ1 - 1.2, I_GOLD, MI.gold);
  // two gilded torchères beside the orchestra pit
  floorLamp(b, ctx, -10.8, FY, -11.5, 4.4);
  floorLamp(b, ctx, 10.8, FY, -11.5, 4.4);
  // the great chandelier, hung from the dome
  bx(b, -0.09, 0.09, 13.2, 26.4, -4.0, -3.5, I_GOLD_D, MI.gold);
  chandelier(b, ctx, 0, 12.6, -3.75, 2.55);
  chandelier(b, ctx, -9.5, 10.2, 3.2, 0.9);
  chandelier(b, ctx, 9.5, 10.2, 3.2, 0.9);
  // sconces along the side walls
  for (const s of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const z = AZ0 + 2.2 + i * 3.4;
      sconce(b, ctx, s * (AXH - 0.05), 9.6 + (i % 2) * 2.6, z, s > 0 ? -PI / 2 : PI / 2);
    }
    // framed gilt panels between the statue niches (visible under the tier-1 balcony)
    for (const zz of [-12.2, -7.85, -3.95, -0.05, 3.85]) {
      artPanelX(b, s * AXH, s > 0 ? -1 : 1, zz - 0.8, zz + 0.8, FY + 0.55, FY + 3.6);
    }
    // gold dado line along the side walls
    bx(b, s > 0 ? AXH - 0.2 : -AXH, s > 0 ? AXH : -AXH + 0.2, FY + 4.0, FY + 4.2, AZ0 + 0.3, AZ1 - 0.9, I_GOLD, MI.gold);
    // statues in arched niches between the sconces
    for (let i = 0; i < 4; i++) {
      const z = AZ0 + 3.8 + i * 3.9;
      bx(b, s > 0 ? AXH - 0.5 : -AXH, s > 0 ? AXH : -AXH + 0.5, FY, FY + 2.2, z - 1.1, z + 1.1, I_MARB, MI.marble);
      at(b, s * (AXH - 0.35), FY + 2.2, z, () => fig(b, I_MARB, MI.marbleHi, 1.0, s > 0 ? -PI / 2 : PI / 2));
    }
  }
  // proscenium trim: gilded arch + pilasters + keystone (auditorium side)
  const zm = AZ0 + 0.03;
  for (let i = 0; i < 16; i++) {
    const a0 = PI * (i / 16), a1 = PI * ((i + 1) / 16);
    const r0 = 9.2, r1 = 10.0;
    const p0 = [Math.cos(a0) * r0, 8.0 + Math.sin(a0) * r0], p1 = [Math.cos(a1) * r0, 8.0 + Math.sin(a1) * r0];
    const p2 = [Math.cos(a1) * r1, 8.0 + Math.sin(a1) * r1], p3 = [Math.cos(a0) * r1, 8.0 + Math.sin(a0) * r1];
    b.quad([p0[0], p0[1], zm], [p1[0], p1[1], zm], [p2[0], p2[1], zm], [p3[0], p3[1], zm], I_GOLD, MI.gold, PZ);
  }
  for (const s of [-1, 1]) {
    bx(b, s * 9.2, s * 10.1, FY, 8.0, zm - 0.35, zm, I_MARB, MI.marble);
    bx(b, s * 9.1, s * 10.3, 8.0, 8.5, zm - 0.45, zm, I_GOLD, MI.gold);
    bx(b, s * 9.1, s * 10.3, FY, FY + 0.6, zm - 0.45, zm, I_GOLD, MI.gold);
  }
  bx(b, -0.6, 0.6, 16.6, 17.9, zm - 0.3, zm, I_GOLD_HI, MI.goldHi);
  // rear wall of the house (seen through the foyer portal): gilt clock + blind arcade
  const zr = AZ1 - 0.62;
  at(b, 0, 13.2, zr - 0.12, () => {
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU;
      bx(b, Math.cos(a) * 1.55 - 0.14, Math.cos(a) * 1.55 + 0.14, Math.sin(a) * 1.55 - 0.14, Math.sin(a) * 1.55 + 0.14, -0.1, 0.1, I_GOLD, MI.gold);
    }
    ellipsoid(b, 1.25, 1.25, 0.18, 16, 3, I_WALL_HI, MI.marbleHi);
  });
  bx(b, -3.4, -1.6, 13.0, 13.4, zr - 0.14, zr - 0.04, I_GOLD_HI, MI.goldHi);
  bx(b, 1.6, 3.4, 13.0, 13.4, zr - 0.14, zr - 0.04, I_GOLD_HI, MI.goldHi);
  bx(b, -0.16, 0.16, 13.3, 14.9, zr - 0.16, zr - 0.02, I_GOLD_HI, MI.goldHi);
  bx(b, 0.5, 0.9, 13.4, 13.9, zr - 0.14, zr - 0.02, I_GOLD, MI.gold);
  for (const xs of [-11.5, -8.0, 8.0, 11.5]) {
    winArch(b, 0, xs, 2.2, FY + 9.2, FY + 12.6, zr - 0.06, -1, I_GLOW, MI.glow, I_GOLD, MI.gold, true);
    bx(b, xs - 1.4, xs + 1.4, FY + 8.6, FY + 9.0, zr - 0.2, zr - 0.04, I_MARB, MI.marble);
  }
  // side-wall gold band + framed panels between the niches
  for (const sx of [-1, 1]) {
    bx(b, sx > 0 ? AXH - 0.2 : -AXH, sx > 0 ? AXH : -AXH + 0.2, FY + 3.1, FY + 3.3, AZ0 + 0.5, AZ1 - 0.5, I_GOLD, MI.gold);
    for (let i = 0; i < 4; i++) {
      const z0 = AZ0 + 0.8 + i * 4.6;
      bx(b, sx > 0 ? AXH - 0.14 : -AXH, sx > 0 ? AXH : -AXH + 0.14, FY + 3.4, FY + 6.6, z0, z0 + 0.18, I_MARB_D, MI.marble);
      bx(b, sx > 0 ? AXH - 0.14 : -AXH, sx > 0 ? AXH : -AXH + 0.14, FY + 3.4, FY + 6.6, z0 + 2.6, z0 + 2.78, I_MARB_D, MI.marble);
    }
  }
  // the royal box at the centre of the first tier
  at(b, 0, TIER[0], 3.45, () => {
    for (const sx of [-1, 1]) boxCol(b, sx * 2.7, 0.0, 1.12, 1.92, 0.19, I_GOLD, MI.gold);
    bx(b, -3.1, 3.1, 2.88, 3.06, -0.5, 0.45, I_GOLD_HI, MI.goldHi);
    bx(b, -3.1, 3.1, 2.68, 2.88, -0.45, 0.4, I_RED, MI.red);
    bx(b, -0.85, 0.85, 3.06, 3.16, -0.2, 0.2, I_GOLD, MI.gold);
    // draped velvet in the box
    bx(b, -2.9, 2.9, 1.18, 2.62, 0.12, 0.28, I_RED, MI.red);
    bx(b, -2.9, 2.9, 2.62, 2.78, 0.08, 0.32, I_GOLD, MI.gold);
  });
  // proscenium wall dressing: framed panels, gold cornice, sconces
  const zp = AZ0 + 0.02;
  for (const sd of [-1, 1]) {
    const xa = sd > 0 ? 11.2 : -16.4, xb = sd > 0 ? 16.4 : -11.2;
    artPanelZ(b, AZ0, 1, Math.min(xa, xb), Math.max(xa, xb), FY + 0.6, FY + 3.9);
    bx(b, Math.min(xa, xb) - 0.3, Math.max(xa, xb) + 0.3, FY + 4.05, FY + 4.3, zp, AZ0 + 0.2, I_GOLD, MI.gold);
    sconce(b, ctx, sd * 13.8, FY + 2.2, AZ0 + 0.05, 0);
  }
  // orchestra pit rail just in front of the arch
  bx(b, -9.2, 9.2, FY, FY + 0.95, AZ0 + 0.35, AZ0 + 0.6, I_MARB_D, MI.marble);
  bx(b, -9.2, 9.2, FY + 0.95, FY + 1.1, AZ0 + 0.3, AZ0 + 0.66, I_GOLD, MI.gold);
  void R;
}

// ================================================================ STAGE DETAIL
function buildStageDetail(b, ctx, R) {
  const zc = -14.85;    // curtain plane, just behind the proscenium wall
  // parted velvet curtain: two drapes with deep folds + a valance
  for (const s of [-1, 1]) {
    const x0 = s * 3.1, x1 = s * 9.1;
    const nf = 11;
    for (let i = 0; i < nf; i++) {
      const xa = x0 + (x1 - x0) * (i / nf), xb = x0 + (x1 - x0) * ((i + 1) / nf);
      const off = (i % 2 ? 0.22 : -0.16);
      bx(b, Math.min(xa, xb), Math.max(xa, xb), FY + 0.55, 16.6, zc + off - 0.16, zc + off + 0.16, i % 2 ? I_RED : mulc(I_RED, 0.86), MI.red);
    }
    // gold tie-back
    bx(b, Math.min(s * 3.1, s * 4.0), Math.max(s * 3.1, s * 4.0), FY + 2.6, FY + 2.95, zc - 0.4, zc + 0.4, I_GOLD, MI.gold);
    // valance across the top
    bx(b, s > 0 ? 3.1 : -9.2, s > 0 ? 9.2 : -3.1, 15.6, 16.6, zc - 0.3, zc + 0.3, I_RED, MI.red);
    bx(b, s > 0 ? 3.1 : -9.2, s > 0 ? 9.2 : -3.1, 15.4, 15.62, zc - 0.34, zc + 0.34, I_GOLD_HI, MI.goldHi);
  }
  // footlights along the stage front
  for (let i = 0; i < 15; i++) {
    const x = -8.4 + i * 1.2;
    bx(b, x - 0.28, x + 0.28, FY, FY + 0.28, AZ0 + 0.75, AZ0 + 1.05, I_GOLD_D, MI.gold);
    bx(b, x - 0.18, x + 0.18, FY + 0.28, FY + 0.38, AZ0 + 0.8, AZ0 + 1.0, I_GLOW, MI.glow);
    if (ctx.lanterns) ctx.lanterns.push({ p: W(x, FY + 0.4, AZ0 + 0.9), size: 1.4, rot: 0, alpha: 0.30, shape: 1, col: mixc(C.sunGlow, C.goldBright, 0.45) });
  }
  // painted backdrop + side masking flats
  // painted backdrop: a lake-and-mountain scene (bands of colour read as a painting)
  qZp(b, STAGE.z0 + 0.70, -12.6, 12.6, FY, STAGE.h - 2.0, mixc(I_SKY, I_WALL_HI, 0.22), MI.wall);
  qZp(b, STAGE.z0 + 0.74, -12.6, 12.6, FY + 8.6, STAGE.h - 2.2, mixc(I_SKY, I_BLUE, 0.46), MI.wall);
  for (let i = 0; i < 9; i++) {
    const x0 = -12.6 + i * 2.8, hh = 4.6 + Math.abs(Math.sin(i * 1.7)) * 3.4;
    b.push(T(0, 0, STAGE.z0 + 0.78));
    b.tri([x0, hh, 0], [x0 + 2.8, hh, 0], [x0 + 1.4, hh + 1.9 + (i % 3) * 0.6, 0], i % 2 ? mixc(I_BLUE, I_DARK, 0.28) : mixc(I_BLUE, I_WALL_HI, 0.42), MI.wall, PZ, PZ, PZ);
    b.pop();
  }
  for (let i = 0; i < 5; i++) {
    const x = -9.0 + i * 4.5, y = 15.0 + (i % 2) * 1.4;
    qZp(b, STAGE.z0 + 0.82, x - 1.4, x + 1.4, y, y + 0.8, mixc(I_WALL_HI, I_SKY, 0.3), MI.glow);
    qZp(b, STAGE.z0 + 0.84, x - 1.9, x - 0.2, y - 0.5, y + 0.3, mixc(I_WALL_HI, I_SKY, 0.3), MI.glow);
  }
  at(b, 4.0, 18.6, STAGE.z0 + 0.86, () => {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      bx(b, Math.cos(a) * 1.1 - 0.14, Math.cos(a) * 1.1 + 0.14, Math.sin(a) * 1.1 - 0.14, Math.sin(a) * 1.1 + 0.14, 0, 0.04, I_GOLD_HI, MI.goldHi);
    }
    ellipsoid(b, 0.95, 0.95, 0.08, 12, 3, mixc(I_GOLD_HI, I_WALL_HI, 0.3), MI.glow);
  });
  qZp(b, STAGE.z0 + 0.76, -12.6, 12.6, FY + 0.6, FY + 4.6, mixc(I_BLUE, I_WALL_SH, 0.18), MI.wall);
  for (let i = 0; i < 9; i++) qZp(b, STAGE.z0 + 0.80, -12.0 + i * 2.7, -11.2 + i * 2.7, FY + 0.9, FY + 4.4, mixc(I_SKY, I_BLUE, 0.5), MI.glow);
  bx(b, -13.0, 13.0, STAGE.h - 2.1, STAGE.h - 1.9, STAGE.z0 + 0.6, STAGE.z0 + 0.8, I_GOLD, MI.gold);
  for (const s of [-1, 1]) {
    bx(b, s > 0 ? 11.4 : -14.0, s > 0 ? 14.0 : -11.4, FY, STAGE.h - 1.0, STAGE.z0 + 1.0, STAGE.z0 + 1.3, I_DARK, MI.dark);
    bx(b, s > 0 ? 11.4 : -14.0, s > 0 ? 14.0 : -11.4, FY, STAGE.h - 1.0, STAGE.z1 - 2.4, STAGE.z1 - 2.1, I_DARK, MI.dark);
  }
  // stage props: a gilded throne-dais and two crates; a ladder to the grid
  bx(b, -2.4, 2.4, FY, FY + 0.55, STAGE.z0 + 3.2, STAGE.z0 + 6.0, I_MARB, MI.marble, { topCol: mulc(I_MARB, 1.05) });
  bx(b, -2.6, 2.6, FY + 0.55, FY + 0.75, STAGE.z0 + 3.0, STAGE.z0 + 3.4, I_GOLD, MI.gold);
  bx(b, -1.2, 1.2, FY + 0.75, FY + 1.2, STAGE.z0 + 4.2, STAGE.z0 + 5.4, I_RED, MI.red);
  bx(b, -1.0, 1.0, FY + 1.2, FY + 2.9, STAGE.z0 + 5.2, STAGE.z0 + 5.7, I_RED, MI.red);
  bx(b, -1.2, 1.2, FY + 2.9, FY + 3.1, STAGE.z0 + 4.9, STAGE.z0 + 5.9, I_GOLD, MI.gold);
  for (const sx of [-1, 1]) for (let i = 0; i < 2; i++) {
    const x = sx * (8.2 + i * 0.9), z = STAGE.z0 + 2.2 + i * 1.1;
    bx(b, x - 0.55, x + 0.55, FY, FY + 0.8, z - 0.55, z + 0.55, I_WOOD, MI.wood, { topCol: mulc(I_WOOD, 1.06) });
  }
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 16; i++) {
      const y = FY + 0.4 + i * 1.4;
      bx(b, sx * 12.0 - 0.16, sx * 12.0 + 0.16, y, y + 0.1, STAGE.z0 + 2.2, STAGE.z0 + 2.5, I_WOOD, MI.wood);
    }
    bx(b, sx * 12.0 - 0.1, sx * 12.0 + 0.1, FY, STAGE.h - 0.6, STAGE.z0 + 2.28, STAGE.z0 + 2.42, I_WOOD, MI.wood);
  }
  // fly battens + hanging ropes from the grid
  for (let i = 0; i < 5; i++) {
    const z = STAGE.z0 + 2.2 + i * 1.6;
    bx(b, -11.5, 11.5, STAGE.h - 2.4, STAGE.h - 2.1, z - 0.14, z + 0.14, I_WOOD, MI.wood);
    for (const x of [-10.5, -5.2, 0, 5.2, 10.5]) bx(b, x - 0.025, x + 0.025, STAGE.h - 0.5, STAGE.h - 2.2, z - 0.03, z + 0.03, I_DARK, MI.dark);
  }
  // backstage dressing: trunks, ropes, a work table, a ladder
  for (let i = 0; i < 4; i++) {
    const x = -8.5 + i * 5.0, z = BST.z0 + 3.1;
    bx(b, x - 0.7, x + 0.7, FY, FY + 0.7, z - 0.5, z + 0.5, i % 2 ? I_WOOD : mulc(I_RED, 0.9), MI.wood, { topCol: mulc(I_WOOD, 1.05) });
    bx(b, x - 0.72, x + 0.72, FY + 0.7, FY + 0.82, z - 0.52, z + 0.52, I_GOLD_D, MI.gold);
  }
  bx(b, -2.5, 2.5, FY, FY + 0.85, BST.z0 + 2.4, BST.z0 + 3.4, I_WOOD, MI.wood, { topCol: mulc(I_WOOD, 1.06) });
  for (const sx of [-1, 1]) bx(b, sx * 2.2 - 0.1, sx * 2.2 + 0.1, FY, FY + 0.85, BST.z0 + 2.5, BST.z0 + 3.3, I_WOOD, MI.wood);
}

// ================================================================ SALON DETAIL
function buildSalonDetail(b, ctx, R) {
  for (const s of [-1, 1]) {
    const xi = s > 0 ? SAL.x1 : -SAL.x1;    // outer wall interior face
    const xf = s > 0 ? SAL.x0 : -SAL.x0;    // foyer wall side
    // three tall lit windows on the outer wall with drapes
    for (let i = 0; i < 3; i++) {
      const z = Ze(SAL.z0, SAL.z1, i);
      winArch(b, 1, z, 2.6, FY + 0.9, FY + 4.6, xi - s * 0.03, s > 0 ? -1 : 1, I_SKY, MI.glow, I_GOLD_HI, MI.goldHi, true);
      bx(b, xi - s * 0.12, xi, FY + 0.8, FY + 5.6, z - 1.9, z - 1.75, I_RED, MI.red);
      bx(b, xi - s * 0.12, xi, FY + 0.8, FY + 5.6, z + 1.75, z + 1.9, I_RED, MI.red);
      bx(b, xi - s * 0.14, xi, FY + 5.6, FY + 5.78, z - 2.1, z + 2.1, I_GOLD, MI.gold);
      bx(b, xi - s * 0.2, xi, FY + 0.6, FY + 0.78, z - 2.1, z + 2.1, I_GOLD, MI.gold);
    }
    // fireplace on the foyer-side wall
    const zf = 14.0;
    bx(b, s > 0 ? xf : xf - 0.55, s > 0 ? xf + 0.55 : xf, FY, FY + 3.8, zf - 1.6, zf + 1.6, I_MARB, MI.marbleHi);
    bx(b, s > 0 ? xf + 0.5 : xf - 0.5, s > 0 ? xf + 0.7 : xf - 0.3, FY, FY + 1.1, zf - 1.0, zf + 1.0, I_DARK, MI.dark);
    bx(b, s > 0 ? xf + 0.45 : xf - 0.75, s > 0 ? xf + 0.75 : xf - 0.45, FY + 1.1, FY + 1.35, zf - 1.3, zf + 1.3, I_MARB, MI.marbleHi, { topCol: mulc(I_MARB, 1.06) });
    bx(b, s > 0 ? xf + 0.48 : xf - 0.72, s > 0 ? xf + 0.72 : xf - 0.48, FY + 1.35, FY + 3.4, zf - 1.4, zf - 1.25, I_MARB_D, MI.marble);
    bx(b, s > 0 ? xf + 0.48 : xf - 0.72, s > 0 ? xf + 0.72 : xf - 0.48, FY + 1.35, FY + 3.4, zf + 1.25, zf + 1.4, I_MARB_D, MI.marble);
    // mirror over the fireplace
    winArch(b, 1, zf, 2.2, FY + 1.6, FY + 3.0, s > 0 ? xf - 0.04 : xf + 0.04, s > 0 ? -1 : 1, mixc(I_SKY, I_MARB, 0.3), [0.13, 0.9], I_GOLD_HI, MI.goldHi, false);
    // two sofas facing each other + a low table + two armchairs
    const cx = (xf + xi) / 2;
    for (const d of [-1, 1]) {
      const z = zf + d * 3.0;
      bx(b, cx - 2.4, cx + 2.4, FY + 0.4, FY + 0.55, z - 0.5, z + 0.5, I_RED, MI.red, { topCol: mulc(I_RED, 1.06) });
      bx(b, cx - 2.4, cx + 2.4, FY + 0.55, FY + 1.15, z + d * 0.4, z + d * 0.55, I_RED, MI.red);
      for (const sx of [-1, 1]) bx(b, cx + sx * 2.3 - 0.1, cx + sx * 2.3 + 0.1, FY, FY + 0.55, z - 0.5, z + 0.5, I_GOLD_D, MI.gold);
      bx(b, cx - 2.3, cx + 2.3, FY + 0.28, FY + 0.4, z - 0.5, z + 0.5, I_WOOD, MI.wood);
    }
    bx(b, cx - 1.5, cx + 1.5, FY + 0.72, FY + 0.82, zf - 0.9, zf + 0.9, I_MARB_D, MI.marble, { topCol: mulc(I_MARB, 1.05) });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) bx(b, cx + sx * 1.3 - 0.09, cx + sx * 1.3 + 0.09, FY, FY + 0.72, zf + sz * 0.7 - 0.09, zf + sz * 0.7 + 0.09, I_GOLD, MI.gold);
    bx(b, cx - 0.35, cx + 0.35, FY + 0.82, FY + 1.05, zf - 0.3, zf + 0.3, I_GOLD_HI, MI.goldHi);
    // paintings on the partitions
    for (const z of [SAL.z0 + 1.2, SAL.z1 - 1.2]) {
      bx(b, cx - 2.2, cx + 2.2, FY + 2.4, FY + 5.0, z - 0.06, z + 0.06, I_GOLD, MI.gold);
      qZp(b, z + 0.07, cx - 1.9, cx + 1.9, FY + 2.6, FY + 4.8, mixc(I_BLUE, I_GOLD, 0.18), MI.wall);
      for (let k = 0; k < 5; k++) {
        const yy = FY + 2.8 + k * 0.42;
        qZp(b, z + 0.075, cx - 1.75, cx + 1.75, yy, yy + 0.18, k % 2 ? mixc(I_SKY, I_WALL_HI, 0.4) : mixc(I_BLUE, I_WALL, 0.3), MI.wall);
      }
    }
    // marble wainscot + gold cornice
    for (const zz of [[SAL.z0 + 0.5, SAL.z0 + 0.62], [SAL.z1 - 0.62, SAL.z1 - 0.5]]) {
      bx(b, s > 0 ? SAL.x0 : -SAL.x1, s > 0 ? SAL.x1 : -SAL.x0, FY, FY + 1.5, zz[0], zz[1], I_MARB_D, MI.marble);
      bx(b, s > 0 ? SAL.x0 : -SAL.x1, s > 0 ? SAL.x1 : -SAL.x0, FY + 1.5, FY + 1.65, zz[0], zz[1], I_GOLD, MI.gold);
    }
    // chandelier + potted palms
    chandelier(b, ctx, cx, SAL.ceil - 0.5, zf, 1.0);
    for (const d of [-1, 1]) {
      const x = cx + d * 2.4, z = SAL.z0 + 1.3;
      bx(b, x - 0.45, x + 0.45, FY, FY + 0.9, z - 0.45, z + 0.45, I_MARB, MI.marble);
      bx(b, x - 0.12, x + 0.12, FY + 0.9, FY + 1.9, z - 0.12, z + 0.12, I_WOOD, MI.wood);
      at(b, x, FY + 1.9, z, () => ellipsoid(b, 0.95, 1.15, 0.95, 8, 5, I_LEAF, MI.leaf));
    }
  }
}
function Ze(a, b2, i) { return a + 3.0 + i * ((b2 - a) - 6.0) / 2; }

// ================================================================ INTERIOR LIGHTS
function buildInteriorLights(ctx) {
  const warm = mixc(C.sunGlow, C.cloudLit, 0.55);
  const warmSoft = mixc(C.sunGlow, C.cloudLit, 0.70);
  const deep = mixc(C.sunGlow, C.goldBright, 0.25);
  const cool = mixc(C.horizon, C.cloudLit, 0.55);
  if (!ctx.points) return;
  const pts = [
    [0, FY + 6.5, 23.0, 17, 0.40, warmSoft],
    [0, FY + 12.0, 13.0, 32, 0.62, warm],
    [0, FY + 7.0, 18.8, 20, 0.34, warmSoft],
    [-18, FY + 7.0, 10.5, 20, 0.30, warmSoft],
    [18, FY + 7.0, 10.5, 20, 0.30, warmSoft],
    [0, FY + 9.0, 2.5, 28, 0.52, warm],
    [0, FY + 14.0, -3.5, 34, 0.62, warm],
    [0, FY + 6.0, -9.0, 24, 0.36, warmSoft],
    [0, FY + 8.0, -18.0, 24, 0.42, deep],
    [-29.5, FY + 6.5, 14.0, 20, 0.40, warmSoft],
    [29.5, FY + 6.5, 14.0, 20, 0.40, warmSoft],
    [0, FY + 4.5, 34.0, 20, 0.30, warmSoft],
    [0, FY + 20.0, -3.5, 30, 0.30, cool],
    [0, FY + 9.0, 12.0, 26, 0.22, cool],
    [0, FY + 9.0, 8.0, 22, 0.34, warmSoft],
    [-8.5, FY + 5.0, -11.6, 16, 0.28, warm],
    [8.5, FY + 5.0, -11.6, 16, 0.28, warm],
    [-13.8, FY + 5.0, -11.6, 14, 0.24, warmSoft],
    [13.8, FY + 5.0, -11.6, 14, 0.24, warmSoft],
  ];
  for (const q of pts) ctx.points.push({ p: W(q[0], q[1], q[2]), col: q[5], range: q[3], int: q[4] });
  // hanging hall lamps get glow billboards (the chandeliers do their own)
  if (ctx.lanterns) {
    ctx.lanterns.push({ p: W(0, 20.4, 12.8), size: 6.5, rot: 0, alpha: 0.22, shape: 1, col: warmSoft });
    ctx.lanterns.push({ p: W(0, DOME_APEX - 1.4, -3.75), size: 9.0, rot: 0, alpha: 0.20, shape: 1, col: mixc(C.sunGlow, C.cloudLit, 0.4) });
  }
}
