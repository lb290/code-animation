// ARCH — Beaux-Arts / Belle Époque architecture kit + building generator.
// OWNER: agent "architect". Everyone else: read-only imports are welcome, edits are not.
//
// Public API (stable — city.js and landmark.js depend on it):
//   buildBuilding(b, ctx, rng, opts) -> void
//     opts = { x, z, rot, w, d, floors, tone, detail, roof, sides, seed }
//       x,z      world position (metres, y=0 is the ground)
//       rot      yaw in radians
//       w,d      footprint width along local X, depth along local Z
//       floors   number of storeys (1..6); storey height ~8.5 m for grand blocks
//       tone     0..1 warm/cool stone variation
//       detail   0 = silhouette only, 1 = mid, 2 = hero (full ornament)
//       roof     'mansard' | 'dome' | 'balcony' | 'flat' | 'tower'
//       sides    how many facades get detail (1..4), default by detail
//
//   Exported ornament primitives (build in local space, +Z is the facade normal,
//   y=0 is their base, origin = centre):
//     cornice(b, w, y, out)            dentilled cornice band
//     column(b, x, z, y0, h, r, col)   giant order column + capital + base
//     archWindow(b, w, h, x, y, col)   arched window with moulding + keystone
//     balustrade(b, len, h, col)       turned balusters + rail
//     pediment(b, w, h, col)           triangular pediment
//     mansard(b, w, d, h, col)         mansard roof + dormers + chimneys
//     dome(b, r, h, col)               ribbed dome + lantern
//     spire(b, r, h, col)              tapering spire + finial
//     statue(b, x, y, z, s, col)       simple acroterion figure
//
// Building rules:
//   - every storey: rusticated base, giant pilaster/column rhythm at ~4.2 m bays,
//     cornice, then a recessed attic; roofs are blue slate with gold ridge caps.
//   - keep the tri budget: detail 2 <= 4200 tris, detail 1 <= 1400, detail 0 <= 260.
//   - the facade must read at 150 m: strong horizontal cornices + vertical bays.
import { B } from './geo.js';
import { C } from './palette.js';
import { MT, boxAt, extrudeXY, extrudeXZ, disc, ellipsoid } from './lib3d.js';
import { mulc, mixc, box, cylinder, lathe, sphere, rgb } from './geo.js';
import { TAU, clamp, mulberry32 } from './math.js';

// ---------------------------------------------------------------- night windows
// Every glassRect/glassArch records its world-space centre + outward frame so
// the round-6 night layer (src/night-lights.js) can build one static additive
// quad mesh of lit windows. Collection is pure data: it does not touch the
// mesh, does not draw anything while the sun is up, and costs no rng draws.
//   on    false while the whale-city is built (those windows live in the
//         whale's local space and get their own light layer in whale.js)
//   list  {c:[x,y,z], n:[nx,ny,nz], t:[tx,ty,tz], w, h} in world metres
export const NIGHT_WIN = { on: true, limit: 24000, list: [] };
export function setWinCollect(on) { NIGHT_WIN.on = !!on; }
export function clearWinCollect() { NIGHT_WIN.list.length = 0; }

// ---------------------------------------------------------------- local palette
// Module-private colours (palette.js stays untouched — see spec).
const A = {
  winDark: mixc(C.glassDeep, C.slateDark, 0.62),   // recessed glass, deep blue
  winMid: mixc(C.glassDeep, C.slate, 0.30),
  winSky: mixc(C.glass, C.horizon, 0.24),          // sky reflection half
  door: rgb('#2e3350'),
  trunk: rgb('#7a6046'),
  iron: C.iron,
  gold: C.gold,
  goldHi: C.goldBright,
  slate: C.slate,
  slateHi: C.slateLight,
  slateLo: C.slateDark,
  copper: C.copper,
  hedge: C.leafDark,
  hedgeHi: C.leaf,
};

const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);

// ---------------------------------------------------------------- tiny helpers
// place: rotate about Y then translate. Local +Z maps to (sin rot, 0, cos rot).
function place(b, x, y, z, rot, fn) {
  if (!rot) {
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
  } else {
    const c = Math.cos(rot), s = Math.sin(rot);
    b.push([c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, x, y, z, 1]);
  }
  fn();
  b.pop();
}

function boxT(b, x, y, z, sx, sy, sz, col, mat, opts) {
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
  box(b, sx, sy, sz, col, mat, opts);
  b.pop();
}

// four outer faces of a thin horizontal band (no top/bottom) — cheap cornice lines
function band(b, w, d, y, h, col, mat) {
  const x = w / 2, z = d / 2;
  b.quad([-x, y, z], [x, y, z], [x, y + h, z], [-x, y + h, z], col, mat, [0, 0, 1]);
  b.quad([x, y, -z], [-x, y, -z], [-x, y + h, -z], [x, y + h, -z], mulc(col, 0.88), mat, [0, 0, -1]);
  b.quad([x, y, z], [x, y, -z], [x, y + h, -z], [x, y + h, z], mulc(col, 0.94), mat, [1, 0, 0]);
  b.quad([-x, y, -z], [-x, y, z], [-x, y + h, z], [-x, y + h, -z], mulc(col, 0.9), mat, [-1, 0, 0]);
}

// solid projecting band made of 4 boxes (has top faces, reads as a cornice step)
function ringBoxes(b, w, d, out, y, h, col, mat) {
  const hw = w / 2, hd = d / 2;
  boxT(b, 0, y + h / 2, hd + out / 2, w + 2 * out, h, out, col, mat, { topCol: mulc(col, 1.04) });
  boxT(b, 0, y + h / 2, -hd - out / 2, w + 2 * out, h, out, mulc(col, 0.9), mat, { topCol: mulc(col, 1.02) });
  boxT(b, hw + out / 2, y + h / 2, 0, out, h, d, mulc(col, 0.96), mat, { topCol: mulc(col, 1.03) });
  boxT(b, -hw - out / 2, y + h / 2, 0, out, h, d, mulc(col, 0.94), mat, { topCol: mulc(col, 1.03) });
}

function corniceRing(b, w, d, y, out, col, mat, rich) {
  ringBoxes(b, w, d, out * 0.45, y, 0.34, mulc(col, 0.97), mat);
  ringBoxes(b, w, d, out, y + 0.32, 0.42, col, mat);
  if (rich) {
    ringBoxes(b, w, d, out * 1.14, y + 0.72, 0.22, mulc(col, 1.05), mat);
    // faux dentils on the front only (2 tris each, reads at 150 m)
    const n = Math.max(3, Math.floor(w / 0.82));
    const zf = d / 2 + out + 0.02;
    for (let i = 0; i < n; i++) {
      const cx = -w / 2 + (w / n) * (i + 0.5);
      b.quad([cx - 0.2, y + 0.36, zf], [cx + 0.2, y + 0.36, zf], [cx + 0.2, y + 0.62, zf], [cx - 0.2, y + 0.62, zf], mulc(col, 0.76), mat, [0, 0, 1]);
    }
  }
}

// side frame: side 0=+Z, 1=-Z, 2=+X, 3=-X; origin on the body surface, +Z = outward
function sideFrame(b, w, d, side) {
  if (side === 0) b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, d / 2, 1]);
  else if (side === 1) b.push([-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, -d / 2, 1]);
  else if (side === 2) b.push([0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, w / 2, 0, 0, 1]);
  else b.push([0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, -w / 2, 0, 0, 1]);
}

// ---------------------------------------------------------------- window kit
// flat glass with a sky-reflection upper half (2 quads)
function glassRect(b, w, h, x, y, z) {
  const hw = w / 2;
  const ys = y + h * 0.58;
  b.quad([x - hw, y, z], [x + hw, y, z], [x + hw, ys, z], [x - hw, ys, z], A.winDark, MT.glass, [0, 0, 1]);
  b.quad([x - hw, ys, z], [x + hw, ys, z], [x + hw, y + h, z], [x - hw, y + h, z], A.winSky, MT.glass, [0, 0, 1]);
  // night window registry (world space; see NIGHT_WIN above)
  if (NIGHT_WIN.on && NIGHT_WIN.list.length < NIGHT_WIN.limit) {
    NIGHT_WIN.list.push({
      c: b.tp([x, y + h / 2, z]),
      n: b.tn([0, 0, 1]),
      t: b.tn([1, 0, 0]),
      w,
      h,
    });
  }
}

// plain frame: 2 jambs + lintel + sill (8 tris)
function frameRect(b, w, h, x, y, col, z) {
  const hw = w / 2, t = 0.22, zf = z + 0.05;
  b.quad([x - hw - t, y, zf], [x - hw, y, zf], [x - hw, y + h, zf], [x - hw - t, y + h, zf], col, MT.stone, [0, 0, 1]);
  b.quad([x + hw, y, zf], [x + hw + t, y, zf], [x + hw + t, y + h, zf], [x + hw, y + h, zf], col, MT.stone, [0, 0, 1]);
  b.quad([x - hw - t, y + h, zf], [x + hw + t, y + h, zf], [x + hw + t, y + h + 0.26, zf], [x - hw - t, y + h + 0.26, zf], mulc(col, 1.05), MT.stone, [0, 0, 1]);
}

// arched glass (rect + fan)
function glassArch(b, w, h, x, y, z, seg) {
  const hw = w / 2, r = hw, ys = y + h - r;
  glassRect(b, w, h - r, x, y, z);
  const ns = seg || 5;
  for (let i = 0; i < ns; i++) {
    const a0 = Math.PI * (i / ns), a1 = Math.PI * ((i + 1) / ns);
    const p0 = [x + Math.cos(a0) * r, ys + Math.sin(a0) * r, z];
    const p1 = [x + Math.cos(a1) * r, ys + Math.sin(a1) * r, z];
    const c = i < ns / 2 ? A.winDark : A.winSky;
    b.tri([x, ys, z], p0, p1, c, MT.glass, [0, 0, 1], [0, 0, 1], [0, 0, 1]);
  }
}

function archMoulding(b, w, h, x, y, col, z, seg) {
  const hw = w / 2, r = hw, ys = y + h - r, t = 0.34, zf = z + 0.06;
  // jambs
  b.quad([x - hw - t, y, zf], [x - hw, y, zf], [x - hw, ys, zf], [x - hw - t, ys, zf], mulc(col, 0.98), MT.stone, [0, 0, 1]);
  b.quad([x + hw, y, zf], [x + hw + t, y, zf], [x + hw + t, ys, zf], [x + hw, ys, zf], mulc(col, 0.98), MT.stone, [0, 0, 1]);
  const ns = seg || 6;
  for (let i = 0; i < ns; i++) {
    const a0 = Math.PI * (i / ns), a1 = Math.PI * ((i + 1) / ns);
    const r0 = r, r1 = r + t;
    const q0 = [x + Math.cos(a0) * r0, ys + Math.sin(a0) * r0, zf];
    const q1 = [x + Math.cos(a1) * r0, ys + Math.sin(a1) * r0, zf];
    const q2 = [x + Math.cos(a1) * r1, ys + Math.sin(a1) * r1, zf];
    const q3 = [x + Math.cos(a0) * r1, ys + Math.sin(a0) * r1, zf];
    b.quad(q0, q1, q2, q3, mulc(col, 1.0 + 0.04 * Math.sin(a0)), MT.stone, [0, 0, 1]);
  }
  // keystone
  boxT(b, x, ys + r * 0.92, zf + 0.08, 0.62, 1.0, 0.3, mulc(col, 1.06), MT.stone);
}

// ---------------------------------------------------------------- exported kit
export function cornice(b, w, y, out = 1, col, dentils) {
  const c0 = col || C.stonePale;
  const o = Math.max(0.2, out);
  boxT(b, 0, y + 0.16, o * 0.24, w, 0.32, o * 0.55, mulc(c0, 0.95), MT.stone);
  boxT(b, 0, y + 0.56, o * 0.5, w, 0.46, o, c0, MT.stone, { topCol: mulc(c0, 1.05) });
  boxT(b, 0, y + 0.9, o * 0.57, w, 0.22, o * 1.08, mulc(c0, 1.05), MT.stone, { topCol: mulc(c0, 1.07) });
  if (dentils) {
    const n = Math.max(2, Math.floor(w / 0.82));
    const dw = (w / n) * 0.52, zf = o + 0.02;
    for (let i = 0; i < n; i++) {
      const cx = -w / 2 + (w / n) * (i + 0.5);
      b.quad([cx - dw / 2, y + 0.4, zf], [cx + dw / 2, y + 0.4, zf], [cx + dw / 2, y + 0.68, zf], [cx - dw / 2, y + 0.68, zf], mulc(c0, 0.78), MT.stone, [0, 0, 1]);
    }
  }
}

export function column(b, x, z, y0, h, r, col) {
  const c0 = col || C.marble;
  const rr = Math.max(0.12, r);
  const capH = Math.max(0.6, h * 0.13), baseH = Math.min(1.5, h * 0.1);
  const shaftH = Math.max(0.5, h - capH - baseH);
  // pedestal + base
  boxT(b, x, y0 + baseH * 0.45, z, rr * 3.0, baseH * 0.9, rr * 3.0, mulc(c0, 0.95), MT.stone);
  boxT(b, x, y0 + baseH * 0.95, z, rr * 2.3, baseH * 0.2, rr * 2.3, mulc(c0, 1.03), MT.stone);
  // shaft
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y0 + baseH, z, 1]);
  cylinder(b, 9, rr, rr * 0.84, shaftH, c0, MT.polish, { y0: 0, caps: false });
  b.pop();
  // capital: echinus + abacus
  const yc = y0 + baseH + shaftH;
  boxT(b, x, yc + capH * 0.3, z, rr * 2.5, capH * 0.45, rr * 2.5, mulc(c0, 1.04), MT.stone);
  boxT(b, x, yc + capH * 0.78, z, rr * 3.0, capH * 0.3, rr * 3.0, mulc(c0, 1.08), MT.stone);
  // gold neck ring
  boxT(b, x, y0 + baseH + 0.18, z, rr * 2.3, 0.12, rr * 2.3, A.gold, MT.gold);
}

export function archWindow(b, w, h, x, y, col) {
  const c0 = col || C.stonePale;
  glassArch(b, w, h, x, y, 0.02);
  archMoulding(b, w, h, x, y, c0, 0, 6);
  // sill
  boxT(b, x, y - 0.16, 0.2, w + 0.9, 0.3, 0.5, mulc(c0, 1.05), MT.stone);
}

export function balustrade(b, len, h, col) {
  const c0 = col || C.stonePale;
  const hh = Math.max(0.35, h);
  // plinth + rail
  boxT(b, 0, 0.11, 0, len, 0.22, 0.46, mulc(c0, 0.96), MT.stone);
  boxT(b, 0, hh - 0.11, 0, len, 0.22, 0.5, mulc(c0, 1.05), MT.stone, { topCol: mulc(c0, 1.07) });
  // balusters: 2-quad tapered silhouettes (4 tris each)
  const n = Math.max(2, Math.round(len / 1.35));
  const bw = 0.19;
  for (let i = 0; i < n; i++) {
    const cx = -len / 2 + (len / n) * (i + 0.5);
    const y0 = 0.22, y1 = hh - 0.22;
    const yb = y0 + (y1 - y0) * 0.42;
    const cf = mulc(c0, 1.02);
    b.quad([cx - bw, y0, 0.12], [cx + bw, y0, 0.12], [cx + bw * 0.45, yb, 0.12], [cx - bw * 0.45, yb, 0.12], cf, MT.stone, [0, 0, 1]);
    b.quad([cx - bw * 0.45, yb, 0.12], [cx + bw * 0.45, yb, 0.12], [cx + bw, y1, 0.12], [cx - bw, y1, 0.12], cf, MT.stone, [0, 0, 1]);
    b.quad([cx + bw, y0, -0.12], [cx - bw, y0, -0.12], [cx - bw * 0.45, yb, -0.12], [cx + bw * 0.45, yb, -0.12], mulc(c0, 0.92), MT.stone, [0, 0, -1]);
    b.quad([cx + bw * 0.45, yb, -0.12], [cx - bw * 0.45, yb, -0.12], [cx - bw, y1, -0.12], [cx + bw, y1, -0.12], mulc(c0, 0.92), MT.stone, [0, 0, -1]);
  }
  // intermediate piers
  const piers = Math.max(2, Math.round(len / 7));
  for (let i = 0; i <= piers; i++) {
    const px = -len / 2 + (len / piers) * i;
    boxT(b, px, hh / 2, 0, 0.5, hh, 0.58, mulc(c0, 1.0), MT.stone, { topCol: mulc(c0, 1.08) });
  }
}

export function pediment(b, w, h, col) {
  const c0 = col || C.stonePale;
  const hw = w / 2, hh = Math.max(0.6, h);
  // entablature base
  boxT(b, 0, 0.3, 0.15, w + 0.7, 0.6, 0.7, mulc(c0, 1.0), MT.stone, { topCol: mulc(c0, 1.06) });
  const y0 = 0.62, zf = 0.3;
  // raking cornices (sloped boxes)
  const slope = Math.hypot(hw, hh);
  const sLen = slope + 0.5;
  for (const sx of [-1, 1]) {
    const a = Math.atan2(hh, hw);
    const ang = sx > 0 ? -a : a;
    const c = Math.cos(ang), s = Math.sin(ang);
    const mx = sx * hw / 2, my = y0 + hh / 2;
    b.push([c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, mx, my, zf, 1]);
    box(b, sLen, 0.4, 0.55, mulc(c0, 1.04), MT.stone, { topCol: mulc(c0, 1.08) });
    b.pop();
  }
  // tympanum
  b.tri([-hw + 0.3, y0 + 0.1, zf], [hw - 0.3, y0 + 0.1, zf], [0, y0 + hh - 0.3, zf], mulc(c0, 0.9), MT.stone, [0, 0, 1], [0, 0, 1], [0, 0, 1]);
  // small relief boss
  boxT(b, 0, y0 + hh * 0.36, zf + 0.1, 0.9, 0.7, 0.2, A.gold, MT.gold);
  // acroteria
  for (const sx of [-1, 0, 1]) {
    const px = sx * hw * 0.94;
    const py = sx === 0 ? y0 + hh : y0;
    boxT(b, px, py + 0.35, zf, 0.36, 0.7, 0.36, mulc(c0, 1.06), MT.stone);
  }
}

export function mansard(b, w, d, h, col) {
  const c0 = col || A.slate;
  const hw = w / 2, hd = d / 2;
  const hh = Math.max(1.5, h);
  // [height fraction, inset fraction] — steep near the eave, flattening to the
  // flat cresting platform at the top (the classic comble bombé silhouette).
  const prof = [[0.0, 0.0], [0.44, 0.11], [0.76, 0.26], [1.0, 0.45]];
  for (let k = 0; k < prof.length - 1; k++) {
    const y0f = prof[k][0], i0 = prof[k][1], y1f = prof[k + 1][0], i1 = prof[k + 1][1];
    const a0 = hw * (1 - i0), b0 = hd * (1 - i0), a1 = hw * (1 - i1), b1 = hd * (1 - i1);
    const Y0 = y0f * hh, Y1 = y1f * hh;
    const t = k / (prof.length - 1);
    const colr = mixc(mulc(c0, 0.84), mulc(c0, 1.12), t);
    b.quad([-a0, Y0, b0], [a0, Y0, b0], [a1, Y1, b1], [-a1, Y1, b1], colr, MT.stone, [0, 0.5, 1]);
    b.quad([a0, Y0, -b0], [-a0, Y0, -b0], [-a1, Y1, -b1], [a1, Y1, -b1], mulc(colr, 0.86), MT.stone, [0, 0.5, -1]);
    b.quad([a0, Y0, b0], [a0, Y0, -b0], [a1, Y1, -b1], [a1, Y1, b1], mulc(colr, 0.94), MT.stone, [1, 0.5, 0]);
    b.quad([-a0, Y0, -b0], [-a0, Y0, b0], [-a1, Y1, b1], [-a1, Y1, -b1], mulc(colr, 0.9), MT.stone, [-1, 0.5, 0]);
    // gold hip ridges on the four corners
    const gA = [
      mixc(A.gold, c0, 0.30), mixc(A.gold, c0, 0.22), mixc(A.gold, c0, 0.38), mixc(A.gold, c0, 0.30),
    ][k];
    const pts = [[a0, b0, a1, b1], [-a0, b0, -a1, b1], [a0, -b0, a1, -b1], [-a0, -b0, -a1, -b1]];
    for (const [x0, z0, x1, z1] of pts) {
      const nx = Math.sign(x0) * 0.16, nz = Math.sign(z0) * 0.16;
      b.quad([x0 - nx, Y0, z0 - nz], [x0 + nx, Y0, z0 + nz], [x1 + nx, Y1, z1 + nz], [x1 - nx, Y1, z1 - nz], gA, MT.gold);
    }
  }
  const lastI = prof[prof.length - 1][1];
  const tw = hw * (1 - lastI), td = hd * (1 - lastI), ty = hh;
  // flat cresting platform; gold is kept to four corner finials — a continuous
  // gold strip at a shared roof height reads as a laser line across the city.
  b.quad([-tw, ty, td], [tw, ty, td], [tw, ty, -td], [-tw, ty, -td], mulc(c0, 1.2), MT.stone, [0, 1, 0]);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      boxT(b, sx * (tw - 0.35), ty + 0.42, sz * (td - 0.35), 0.3, 0.84, 0.3, A.gold, MT.stone);
    }
  }
  // dormers on the front slope
  const nd = Math.max(1, Math.floor(w / 8.5));
  for (let i = 0; i < nd; i++) {
    const cx = -w * 0.3 + (i / Math.max(1, nd - 1)) * w * 0.6;
    const dz = hd * 0.9, dy = hh * 0.16;
    boxT(b, cx, dy + 1.15, dz, 2.6, 2.3, 2.0, mulc(C.stonePale, 1.0), MT.stone, { topCol: mulc(C.stonePale, 1.05) });
    // little gable
    b.tri([cx - 1.3, dy + 2.3, dz + 1.0], [cx + 1.3, dy + 2.3, dz + 1.0], [cx, dy + 3.35, dz + 1.0], mulc(C.stonePale, 1.02), MT.stone, [0, 0, 1], [0, 0, 1], [0, 0, 1]);
    glassRect(b, 1.2, 1.4, cx, dy + 0.5, dz + 1.02);
    boxT(b, cx, dy + 3.5, dz + 0.6, 0.18, 0.7, 0.18, mixc(A.gold, c0, 0.2), MT.stone);
  }
  // muted gold eave line on all four sides
  const g = mixc(A.gold, c0, 0.22);
  b.quad([-hw, 0.02, hd], [hw, 0.02, hd], [hw, 0.34, hd], [-hw, 0.34, hd], g, MT.stone, [0, 0, 1]);
  b.quad([hw, 0.02, -hd], [-hw, 0.02, -hd], [-hw, 0.34, -hd], [hw, 0.34, -hd], mulc(g, 0.88), MT.stone, [0, 0, -1]);
  b.quad([hw, 0.02, hd], [hw, 0.02, -hd], [hw, 0.34, -hd], [hw, 0.34, hd], mulc(g, 0.94), MT.stone, [1, 0, 0]);
  b.quad([-hw, 0.02, -hd], [-hw, 0.02, hd], [-hw, 0.34, hd], [-hw, 0.34, -hd], mulc(g, 0.9), MT.stone, [-1, 0, 0]);
}

export function dome(b, r, h, col) {
  const c0 = col || A.slate;
  const rr = Math.max(1, r), hh = Math.max(1.5, h);
  const drumH = hh * 0.30, seg = 20;
  // drum
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  cylinder(b, seg, rr * 0.94, rr * 0.94, drumH, mulc(C.stonePale, 1.0), MT.stone, { y0: 0, caps: false });
  b.pop();
  // drum cornice + windows
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    const px = Math.cos(a) * rr * 0.945, pz = Math.sin(a) * rr * 0.945;
    const wx = -Math.sin(a), wz = Math.cos(a);
    // small dark drum window (quad facing out)
    const qw = 0.8;
    const nx = Math.cos(a), nz = Math.sin(a);
    const cx = px + nx * 0.02, cz = pz + nz * 0.02;
    const tx = -Math.sin(a), tz = Math.cos(a);
    b.quad([cx - tx * qw, drumH * 0.35, cz - tz * qw], [cx + tx * qw, drumH * 0.35, cz + tz * qw],
           [cx + tx * qw, drumH * 0.78, cz + tz * qw], [cx - tx * qw, drumH * 0.78, cz - tz * qw], A.winDark, MT.glass, [nx, 0, nz]);
    void wx; void wz;
  }
  // gold ring at drum top
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, drumH, 0, 1]);
  cylinder(b, seg, rr * 1.02, rr * 1.02, 0.35, A.gold, MT.gold, { y0: 0, caps: false });
  b.pop();
  // shell: 5 rings, 8 gold ribs by alternating segment colour
  const y0 = drumH + 0.35, H = hh - y0;
  const bands = 5;
  for (let j = 0; j < bands; j++) {
    const a0 = (j / bands) * Math.PI * 0.5, a1 = ((j + 1) / bands) * Math.PI * 0.5;
    const r0 = rr * 0.955 * Math.cos(a0), yA = y0 + H * Math.sin(a0);
    const r1 = rr * 0.955 * Math.cos(a1), yB = y0 + H * Math.sin(a1);
    for (let i = 0; i < seg; i++) {
      const t0 = (i / seg) * TAU, t1 = ((i + 1) / seg) * TAU;
      const isRib = i % 3 === 0;
      const cc = isRib ? mixc(A.gold, c0, 0.25) : mixc(mulc(c0, 0.95), mulc(c0, 1.08), j / bands);
      const p00 = [Math.cos(t0) * r0, yA, Math.sin(t0) * r0];
      const p10 = [Math.cos(t1) * r0, yA, Math.sin(t1) * r0];
      const p11 = [Math.cos(t1) * r1, yB, Math.sin(t1) * r1];
      const p01 = [Math.cos(t0) * r1, yB, Math.sin(t0) * r1];
      b.quad(p10, p00, p01, p11, cc, isRib ? MT.gold : MT.stone);
    }
  }
  // cap + lantern
  const yTop = y0 + H;
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, yTop, 0, 1]);
  cylinder(b, 10, rr * 0.12, rr * 0.16, hh * 0.13, mulc(C.stonePale, 1.02), MT.stone, { y0: 0, caps: true });
  b.pop();
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, yTop + hh * 0.13, 0, 1]);
  ellipsoid(b, rr * 0.17, rr * 0.16, rr * 0.17, 8, 4, c0, MT.stone, { v0: 0, v1: 0.5 });
  b.pop();
  // gold finial
  boxT(b, 0, yTop + hh * 0.29, 0, 0.22, hh * 0.14, 0.22, A.goldHi, MT.gold);
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, yTop + hh * 0.36, 0, 1]);
  sphere(b, rr * 0.07, A.goldHi, MT.gold, { rings: 3, seg: 6, jitter: 0.02 });
  b.pop();
}

export function spire(b, r, h, col) {
  const c0 = col || A.slate;
  const rr = Math.max(0.6, r), hh = Math.max(2, h);
  const seg = 8;
  // base
  boxT(b, 0, 0.5, 0, rr * 2.5, 1.0, rr * 2.5, mulc(C.stonePale, 1.0), MT.stone, { topCol: mulc(C.stonePale, 1.05) });
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    const p0 = [Math.cos(a0) * rr, 1.0, Math.sin(a0) * rr];
    const p1 = [Math.cos(a1) * rr, 1.0, Math.sin(a1) * rr];
    const apex = [0, hh, 0];
    b.tri(p1, p0, apex, mixc(mulc(c0, 0.9), mulc(c0, 1.12), (i % 2) * 0.7), MT.stone);
  }
  // gold collar + finial
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1.0, 0, 1]);
  cylinder(b, seg, rr * 1.04, rr * 1.04, 0.3, A.gold, MT.gold, { y0: 0, caps: false });
  b.pop();
  boxT(b, 0, hh + 0.35, 0, 0.18, 0.8, 0.18, A.goldHi, MT.gold);
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, hh + 0.5, 0, 1]);
  sphere(b, rr * 0.1, A.goldHi, MT.gold, { rings: 3, seg: 6, jitter: 0.02 });
  b.pop();
}

export function statue(b, x, y, z, s, col) {
  const c0 = col || C.stonePale;
  const k = Math.max(0.4, s);
  // pedestal
  boxT(b, x, y + 0.3 * k, z, 1.15 * k, 0.6 * k, 1.15 * k, mulc(c0, 1.02), MT.stone, { topCol: mulc(c0, 1.06) });
  // robe
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y + 0.6 * k, z, 1]);
  cylinder(b, 6, 0.34 * k, 0.22 * k, 1.35 * k, c0, MT.stone, { y0: 0, caps: false });
  b.pop();
  // torso
  boxT(b, x, y + 2.2 * k, z, 0.5 * k, 0.75 * k, 0.34 * k, mulc(c0, 1.03), MT.stone, { topCol: mulc(c0, 1.06) });
  // head
  boxT(b, x, y + 2.78 * k, z, 0.34 * k, 0.34 * k, 0.32 * k, mulc(c0, 1.04), MT.stone);
  // raised arm
  boxT(b, x + 0.34 * k, y + 2.35 * k, z, 0.14 * k, 0.72 * k, 0.14 * k, c0, MT.stone);
  // wing / drapery blade (reads at distance)
  b.quad([x - 0.12 * k, y + 1.9 * k, z - 0.16 * k], [x - 0.12 * k, y + 2.5 * k, z - 0.16 * k], [x - 0.7 * k, y + 2.9 * k, z - 0.16 * k], [x - 0.55 * k, y + 2.0 * k, z - 0.16 * k], mulc(c0, 0.96), MT.stone, [0, 0, -1]);
}

// ---------------------------------------------------------------- facade builder
function facade(b, rng, cfg) {
  const { fw, floors, baseH, storeyH, H, gTop, detail, col, trim, kind } = cfg;
  const half = fw / 2;
  const nb = Math.max(2, Math.min(9, Math.round(fw / 4.2)));
  const bayW = fw / nb;
  const bayX = (i) => -half + bayW * (i + 0.5);
  const edgeX = (i) => -half + bayW * i;
  const front = kind === 'front';
  const zBase = 0.5;               // base storey steps 0.5 m proud
  const yOpen = 0.85;              // above the plinth
  const winW = Math.min(2.5, bayW * 0.52);
  const giantN = Math.min(2, floors - 1);   // storeys inside the giant order

  // ---- gates / openings on the base storey
  for (let i = 0; i < nb; i++) {
    const x = bayX(i);
    const isCentre = Math.abs(i - (nb - 1) / 2) < 0.6;
    if (detail === 2 && front && isCentre && nb >= 4) {
      // grand portal
      const ph = Math.min(baseH - 2.2, 6.0), pw = Math.min(bayW * 0.8, 4.2);
      glassArch(b, pw * 0.78, ph * 0.92, x, yOpen + 0.25, zBase + 0.06, 6);
      archMoulding(b, pw * 0.78, ph * 0.92, x, yOpen + 0.25, trim, zBase, 6);
      // flanking engaged columns
      column(b, x - pw * 0.62, zBase + 0.1, yOpen - 0.3, baseH - 1.6, 0.34, trim);
      column(b, x + pw * 0.62, zBase + 0.1, yOpen - 0.3, baseH - 1.6, 0.34, trim);
      boxT(b, x, yOpen + ph * 0.92 + 0.8, zBase + 0.25, pw * 1.9, 0.55, 0.9, mulc(trim, 1.05), MT.stone, { topCol: mulc(trim, 1.08) });
      // steps
      for (let s = 0; s < 3; s++) {
        boxT(b, x, 0.14 + s * 0.26, 1.4 - s * 0.45, pw * 1.5 + s * 0.6, 0.26, 0.5, mulc(trim, 1.0 - s * 0.02), MT.stone, { topCol: mulc(trim, 1.06) });
      }
    } else {
      const wh = Math.min(baseH * 0.62, 5.2), ww = winW * 0.92;
      if (detail >= 1) {
        glassArch(b, ww, wh, x, yOpen + 0.15, zBase + 0.03, 4);
        archMoulding(b, ww, wh, x, yOpen + 0.15, trim, zBase, 4);
      } else {
        glassRect(b, ww, wh, x, yOpen + 0.15, zBase + 0.03);
      }
      // shop awning / dark reveal band
      b.quad([x - ww * 0.62, yOpen - 0.5, zBase + 0.06], [x + ww * 0.62, yOpen - 0.5, zBase + 0.06],
             [x + ww * 0.62, yOpen - 0.1, zBase + 0.06], [x - ww * 0.62, yOpen - 0.1, zBase + 0.06], mulc(C.trainNavy, 0.9), MT.mat, [0, 0, 1]);
    }
  }
  // rustication: horizontal joints + vertical block joints on the base storey
  for (let k = 1; k <= 4; k++) {
    const yy = yOpen + (baseH - yOpen) * (k / 5);
    b.quad([-half - 0.02, yy, zBase + 0.014], [half + 0.02, yy, zBase + 0.014],
           [half + 0.02, yy + 0.14, zBase + 0.014], [-half - 0.02, yy + 0.14, zBase + 0.014], mulc(col, 0.78), MT.stone, [0, 0, 1]);
    // staggered vertical joints, two rows per band
    for (let i = 0; i <= nb; i++) {
      const vx = -half + (i + (k % 2 ? 0.5 : 0)) * bayW;
      if (vx < -half + 0.4 || vx > half - 0.4) continue;
      const ya = k === 1 ? yOpen : yOpen + (baseH - yOpen) * ((k - 1) / 5);
      b.quad([vx - 0.07, ya, zBase + 0.016], [vx + 0.07, ya, zBase + 0.016],
             [vx + 0.07, yy, zBase + 0.016], [vx - 0.07, yy, zBase + 0.016], mulc(col, 0.83), MT.stone, [0, 0, 1]);
    }
  }

  // ---- giant order (storeys 1..giantN)
  if (floors >= 2) {
    const gH = gTop - baseH;
    const useCols = detail === 2 && front;
    for (let i = 0; i <= nb; i++) {
      if (i === 0 || i === nb) {
        // corner pilaster
        boxT(b, edgeX(i) + (i === 0 ? 0.32 : -0.32), baseH + gH / 2, 0.18, 0.62, gH, 0.36, mulc(trim, 1.02), MT.stone, { topCol: mulc(trim, 1.05) });
      } else if (useCols) {
        column(b, edgeX(i), 0.28, baseH - 0.35, gH + 0.2, Math.min(0.44, bayW * 0.1), trim);
      } else if (detail >= 1) {
        // pilaster: front + 2 flanks + base + capital
        const px = edgeX(i), pw = Math.min(0.9, bayW * 0.2);
        b.quad([px - pw / 2, baseH, 0.42], [px + pw / 2, baseH, 0.42], [px + pw / 2, gTop, 0.42], [px - pw / 2, gTop, 0.42], mulc(trim, 1.0), MT.stone, [0, 0, 1]);
        b.quad([px - pw / 2, baseH, 0], [px - pw / 2, baseH, 0.42], [px - pw / 2, gTop, 0.42], [px - pw / 2, gTop, 0], mulc(trim, 0.83), MT.stone, [-1, 0, 0]);
        b.quad([px + pw / 2, baseH, 0.42], [px + pw / 2, baseH, 0], [px + pw / 2, gTop, 0], [px + pw / 2, gTop, 0.42], mulc(trim, 0.83), MT.stone, [1, 0, 0]);
        boxT(b, px, gTop - 0.3, 0.22, pw * 1.9, 0.6, 0.6, mulc(trim, 1.06), MT.stone, { topCol: mulc(trim, 1.08) });
        boxT(b, px, baseH + 0.35, 0.22, pw * 1.7, 0.7, 0.55, mulc(trim, 1.03), MT.stone);
      }
    }
    // windows in the giant zone
    for (let s = 0; s < giantN; s++) {
      const y0 = baseH + s * storeyH + 1.35;
      const arch = s === 0;
      const wh = arch ? storeyH * 0.78 : storeyH * 0.6;
      for (let i = 0; i < nb; i++) {
        const x = bayX(i);
        if (detail === 2 && arch) {
          archWindow(b, winW, wh, x, y0, trim);
          // balcony slab + gold rail
          boxT(b, x, y0 - 0.22, 0.48, winW + 1.0, 0.24, 0.85, mulc(trim, 1.06), MT.stone, { topCol: mulc(trim, 1.08) });
          boxT(b, x, y0 + 0.42, 0.86, winW + 1.0, 0.1, 0.1, A.gold, MT.gold);
        } else if (detail >= 1) {
          glassArch(b, winW, wh, x, y0, 0.03, 4);
          archMoulding(b, winW, wh, x, y0, trim, 0, 4);
        } else {
          glassRect(b, winW * 0.92, wh * 0.8, x, y0, 0.03);
          // cheap dark lintel shadow so the far skyline still reads as windows
          b.quad([x - winW * 0.5, y0 + wh * 0.8, 0.05], [x + winW * 0.5, y0 + wh * 0.8, 0.05],
                 [x + winW * 0.5, y0 + wh * 0.8 + 0.22, 0.05], [x - winW * 0.5, y0 + wh * 0.8 + 0.22, 0.05], mulc(col, 0.8), MT.stone, [0, 0, 1]);
        }
      }
      // continuous shadow line over the window heads + bright sill line below
      if (detail >= 1) {
        b.quad([-half, y0 + wh + 0.16, 0.2], [half, y0 + wh + 0.16, 0.2], [half, y0 + wh + 0.52, 0.2], [-half, y0 + wh + 0.52, 0.2], mulc(col, 0.7), MT.stone, [0, 0, 1]);
        b.quad([-half, y0 - 0.42, 0.3], [half, y0 - 0.42, 0.3], [half, y0 - 0.14, 0.3], [-half, y0 - 0.14, 0.3], mulc(trim, 1.08), MT.stone, [0, 0, 1]);
      }
    }
    // entablature above the giant order (if there are storeys above it)
    if (floors - 1 > giantN) {
      boxT(b, 0, gTop + 0.3, 0.35, fw + 0.5, 0.6, 0.7, trim, MT.stone, { topCol: mulc(trim, 1.06) });
      boxT(b, 0, gTop + 0.78, 0.45, fw + 0.9, 0.36, 0.9, mulc(trim, 1.04), MT.stone, { topCol: mulc(trim, 1.08) });
    }
  }

  // ---- upper storeys (above the giant order)
  for (let s = giantN + 1; s < floors - 1; s++) {
    const y0 = baseH + s * storeyH + 1.2;
    const wh = storeyH * 0.58;
    for (let i = 0; i < nb; i++) {
      const x = bayX(i);
      if (detail >= 1) {
        glassRect(b, winW, wh, x, y0, 0.03);
        frameRect(b, winW, wh, x, y0, trim, 0.01);
        // pedimented lintel every other window for rhythm
        if (detail === 2 && (i + s) % 2 === 0) {
          b.tri([x - winW * 0.7, y0 + wh + 0.4, 0.2], [x + winW * 0.7, y0 + wh + 0.4, 0.2], [x, y0 + wh + 1.05, 0.2], mulc(trim, 1.06), MT.stone, [0, 0, 1], [0, 0, 1], [0, 0, 1]);
        }
      } else {
        glassRect(b, winW * 0.85, wh * 0.85, x, y0, 0.03);
      }
    }
    if (detail >= 1) {
      // continuous dark window-head line + bright sill line every storey
      b.quad([-half, y0 + wh + 0.14, 0.2], [half, y0 + wh + 0.14, 0.2], [half, y0 + wh + 0.46, 0.2], [-half, y0 + wh + 0.46, 0.2], mulc(col, 0.7), MT.stone, [0, 0, 1]);
      b.quad([-half, y0 - 0.4, 0.3], [half, y0 - 0.4, 0.3], [half, y0 - 0.12, 0.3], [-half, y0 - 0.12, 0.3], mulc(trim, 1.08), MT.stone, [0, 0, 1]);
      // pilaster strips between bays (with a small top cap)
      for (let i = 1; i < nb; i++) {
        b.quad([edgeX(i) - 0.24, y0 - 0.8, 0.3], [edgeX(i) + 0.24, y0 - 0.8, 0.3], [edgeX(i) + 0.24, y0 + wh + 0.8, 0.3], [edgeX(i) - 0.24, y0 + wh + 0.8, 0.3], mulc(trim, 0.94), MT.stone, [0, 0, 1]);
        b.quad([edgeX(i) - 0.24, y0 - 0.8, 0.3], [edgeX(i) + 0.24, y0 - 0.8, 0.3], [edgeX(i) + 0.24, y0 - 0.8, 0.0], [edgeX(i) - 0.24, y0 - 0.8, 0.0], mulc(trim, 0.84), MT.stone, [0, -1, 0]);
      }
      // projecting cornice: two bright steps so the floor line reads at 150 m
      boxT(b, 0, y0 + wh + 1.02, 0.3, fw + 0.2, 0.3, 0.62, mulc(trim, 1.05), MT.stone, { topCol: mulc(trim, 1.1) });
      boxT(b, 0, y0 + wh + 1.32, 0.34, fw + 0.5, 0.16, 0.8, mulc(trim, 1.02), MT.stone, { topCol: mulc(trim, 1.08) });
    }
  }

  // ---- quoins on the corners
  if (detail >= 1) {
    for (const sx of [-1, 1]) {
      const qx = sx * (half - 0.45);
      for (let k = 0; k < Math.min(6, floors * 2); k++) {
        const yy = 1.4 + k * 3.1;
        if (yy > H - 1.2) break;
        const qw = k % 2 === 0 ? 1.1 : 0.75;
        b.quad([qx - qw / 2, yy, 0.05], [qx + qw / 2, yy, 0.05], [qx + qw / 2, yy + 1.5, 0.05], [qx - qw / 2, yy + 1.5, 0.05], mulc(trim, 1.04), MT.stone, [0, 0, 1]);
      }
    }
  }
}

// ---------------------------------------------------------------- parapet
function parapet(b, w, d, y, col, trim, detail) {
  // solid attic wall ring
  ringBoxes(b, w, d, 0.16, y, 0.95, mulc(col, 0.97), MT.stone);
  // coping
  ringBoxes(b, w, d, 0.34, y + 0.95, 0.2, mulc(trim, 1.06), MT.stone);
  if (detail >= 1) {
    // balustrade standing on the parapet along the front roofline
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, y + 0.95, d / 2 + 0.2, 1]);
    balustrade(b, Math.max(4, w - 2.4), 1.15, trim);
    b.pop();
  }
}

// ---------------------------------------------------------------- generator
export function buildBuilding(b, ctx, rng, opts = {}) {
  const x = num(opts.x, 0), z = num(opts.z, 0), rot = num(opts.rot, 0);
  const w = Math.max(7, num(opts.w, 28));
  const d = Math.max(7, num(opts.d, 22));
  const floors = clamp(Math.round(num(opts.floors, 5)), 1, 8);
  const tone = clamp(num(opts.tone, 0.5), 0, 1);
  const detail = clamp(Math.round(num(opts.detail, 1)), 0, 2);
  const roof = opts.roof || 'mansard';
  const sides = clamp(Math.round(num(opts.sides, detail === 2 ? 4 : detail === 1 ? 4 : 4)), 1, 4);

  // warm limestone dominates; only strongly "cool" tones drift toward blue-grey
  const warm = mixc(C.stoneWarm, C.stone, 0.3 + rng() * 0.45);
  let col = mulc(mixc(warm, C.stoneCool, Math.max(0, tone - 0.55) * 0.9), 0.9);
  if (opts.color) col = opts.color;
  const trim = mulc(mixc(C.stonePale, C.stone, 0.12), 0.97);
  const baseH = detail === 2 ? 10.4 : detail === 1 ? 9.2 : 7.4;
  const storeyH = detail === 2 ? 8.6 : detail === 1 ? 8.2 : 7.0;
  const H = baseH + (floors - 1) * storeyH;
  const gTop = baseH + Math.min(2, floors - 1) * storeyH;
  // round 7: optional footprint log (plinth included) so tools can prove the
  // elevated railway / landmark clearances against the real city layout.
  if (ctx && ctx.footprints) ctx.footprints.push({ x, z, w: w + 2.0, d: d + 2.0, wBody: w, dBody: d, rot, h: H });
  const slateCol = opts.slate || (rng() < 0.16
    ? mixc(C.copper, A.slate, 0.3 + rng() * 0.3)
    : mixc(A.slate, A.slateHi, rng() * 0.45));

  place(b, x, 0, z, rot, () => {
    b.note('buildBuilding');
    // ---- massing
    boxT(b, 0, 0.4, 0, w + 2.0, 0.8, d + 2.0, mulc(col, 0.9), MT.stone, { topCol: mulc(col, 1.0) });
    boxT(b, 0, baseH / 2 + 0.2, 0, w + 1.0, baseH - 0.4, d + 1.0, mulc(col, 0.97), MT.stone, { topCol: mulc(col, 1.02) });
    boxT(b, 0, baseH + (H - baseH) / 2, 0, w, H - baseH, d, col, MT.stone, { topCol: mulc(col, 1.04) });

    // ---- facades
    {
      sideFrame(b, w, d, 0);
      facade(b, rng, { fw: w, floors, baseH, storeyH, H, gTop, detail, col, trim, kind: 'front' });
      b.pop();
      if (sides >= 2) {
        sideFrame(b, w, d, 1);
        facade(b, rng, { fw: w, floors, baseH, storeyH, H, gTop, detail: detail === 2 ? 2 : (detail >= 1 ? 1 : 0), col, trim, kind: 'back' });
        b.pop();
      }
      if (sides >= 3) {
        sideFrame(b, w, d, 2);
        facade(b, rng, { fw: d, floors, baseH, storeyH, H, gTop, detail: detail === 2 ? 1 : (detail >= 1 ? 1 : 0), col, trim, kind: 'side' });
        b.pop();
        sideFrame(b, w, d, 3);
        facade(b, rng, { fw: d, floors, baseH, storeyH, H, gTop, detail: detail === 2 ? 1 : (detail >= 1 ? 1 : 0), col, trim, kind: 'side' });
        b.pop();
      }
    }

    // ---- cornices
    if (detail >= 1) {
      corniceRing(b, w + 1.0, d + 1.0, baseH - 0.9, 0.5, mulc(trim, 1.0), MT.stone, false);
      if (floors - 1 > 2) corniceRing(b, w, d, gTop, 0.7, trim, MT.stone, detail === 2);
      corniceRing(b, w, d, H - 1.0, 1.15, trim, MT.stone, detail === 2);
      corniceRing(b, w, d, H - 0.1, 1.5, mulc(trim, 1.03), MT.stone, false);
      if (detail === 2) {
        // gold fillet under the main cornice (the reference's gold trim line)
        ringBoxes(b, w, d, 1.2, H - 1.42, 0.14, mixc(A.gold, trim, 0.3), MT.stone);
      }
    } else {
      band(b, w, d, H - 0.6, 0.5, mulc(trim, 1.02), MT.stone);
    }

    // ---- parapet / attic
    if (detail >= 1) parapet(b, w, d, H, col, trim, detail);
    else ringBoxes(b, w, d, 0.12, H, 0.7, mulc(col, 0.98), MT.stone);

    // ---- roof
    const roofY = H + (detail >= 1 ? 1.15 : 0.7);
    const rw = w + (detail >= 1 ? 0.4 : 0.2), rd = d + (detail >= 1 ? 0.4 : 0.2);
    if (roof === 'mansard') {
      if (detail === 0) {
        // cheap hipped slate roof (reads as a blue pyramid from the distance)
        const hh = 5.0 + rng() * 2.2;
        b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, roofY, 0, 1]);
        const hw2 = rw * 0.79, hd2 = rd * 0.79;
        for (let i = 0; i < 4; i++) {
          const a0 = (i / 4) * TAU + Math.PI / 4, a1 = ((i + 1) / 4) * TAU + Math.PI / 4;
          const p0 = [Math.cos(a0) * hw2 * 1.2, 0, Math.sin(a0) * hd2 * 1.2];
          const p1 = [Math.cos(a1) * hw2 * 1.2, 0, Math.sin(a1) * hd2 * 1.2];
          b.tri(p0, p1, [0, hh, 0], mulc(slateCol, 0.92 + 0.14 * (i % 2)), MT.stone);
        }
        b.quad([-hw2, 0.04, hd2], [hw2, 0.04, hd2], [hw2, 0.22, hd2], [-hw2, 0.22, hd2], A.gold, MT.gold, [0, 0, 1]);
        b.pop();
      } else {
        const mh = Math.min(11.5, 4.6 + floors * 1.15 + rng() * 1.8);
        b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, roofY, 0, 1]);
        mansard(b, rw, rd, mh, slateCol);
        b.pop();
        // chimneys on the cresting platform
        const nch = detail === 2 ? 3 : 1 + (rng() > 0.5 ? 1 : 0);
        for (let i = 0; i < nch; i++) {
          const cxs = (i - (nch - 1) / 2) * w * 0.3;
          const czz = rd * (0.1 + (i % 2) * 0.14);
          boxT(b, cxs, roofY + mh + 1.5, czz, 1.7, 3.6, 1.2, mulc(col, 1.02), MT.stone, { topCol: mulc(col, 1.07) });
          for (let k = 0; k < 2; k++) {
            b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, cxs - 0.42 + k * 0.84, roofY + mh + 3.2, czz, 1]);
            cylinder(b, 5, 0.24, 0.32, 1.0, mulc(col, 0.86), MT.stone, { y0: 0, caps: true });
            b.pop();
          }
        }
      }
    } else if (roof === 'dome') {
      // low attic + central domed pavilion
      boxT(b, 0, roofY + 0.5, 0, w * 0.56, 1.0, d * 0.52, mulc(col, 0.99), MT.stone, { topCol: mulc(trim, 1.04) });
      b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, roofY + 1.0, 0, 1]);
      dome(b, Math.min(w, d) * 0.26, Math.min(w, d) * 0.52, slateCol);
      b.pop();
      // corner pavilions with small domes
      for (const sx of [-1, 1]) {
        const pw = w * 0.2, pd = d * 0.34;
        boxT(b, sx * (w / 2 - pw * 0.5), roofY + 1.6, d / 2 - pd * 0.5, pw, 3.2, pd, mulc(col, 1.0), MT.stone, { topCol: mulc(trim, 1.05) });
        b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, sx * (w / 2 - pw * 0.5), roofY + 3.2, d / 2 - pd * 0.5, 1]);
        dome(b, pw * 0.62, pw * 0.9, slateCol);
        b.pop();
      }
    } else if (roof === 'tower') {
      // central tower rising above the roofline
      const tw = w * 0.34, td = d * 0.34, th = storeyH * 1.5;
      boxT(b, 0, roofY + th / 2, 0, tw, th, td, mulc(col, 1.0), MT.stone, { topCol: mulc(trim, 1.05) });
      // clock face
      b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, roofY + th * 0.62, td / 2 + 0.03, 1]);
      disc(b, Math.min(tw, td) * 0.3, 12, A.winSky, MT.glass, { y: 0 });
      b.pop();
      b.quad([-tw * 0.3, roofY + th * 0.62 - tw * 0.3, td / 2 + 0.06], [tw * 0.3, roofY + th * 0.62 - tw * 0.3, td / 2 + 0.06], [tw * 0.3, roofY + th * 0.62 + tw * 0.3, td / 2 + 0.06], [-tw * 0.3, roofY + th * 0.62 + tw * 0.3, td / 2 + 0.06], A.gold, MT.gold, [0, 0, 1]);
      b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, roofY + th, 0, 1]);
      spire(b, tw * 0.62, th * 0.85, slateCol);
      b.pop();
      for (const sx of [-1, 1]) {
        b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, sx * w * 0.4, roofY, 0, 1]);
        spire(b, w * 0.055, 7.5 + rng() * 4, slateCol);
        b.pop();
      }
    } else if (roof === 'balcony') {
      // flat roof garden with hedges and urns
      boxT(b, 0, roofY + 0.2, 0, w * 0.9, 0.4, d * 0.9, mulc(C.stonePale, 1.0), MT.stone, { topCol: mulc(C.stonePale, 1.04) });
      for (let i = 0; i < 4; i++) {
        const hx = (i < 2 ? -1 : 1) * w * 0.3, hz = (i % 2 === 0 ? -1 : 1) * d * 0.24;
        boxT(b, hx, roofY + 0.95, hz, w * 0.2, 1.1, 1.4, A.hedge, MT.leaf, { topCol: A.hedgeHi });
      }
      for (const sx of [-1, 1]) {
        boxT(b, sx * w * 0.4, roofY + 0.95, 0, 1.0, 1.5, 1.0, mulc(col, 1.05), MT.stone);
      }
    } else {
      // flat
      boxT(b, 0, roofY + 0.25, 0, w + 0.3, 0.5, d + 0.3, mulc(col, 0.98), MT.stone, { topCol: mulc(trim, 1.02) });
    }

    // ---- statues on the parapet (hero)
    if (detail === 2) {
      for (const sx of [-1, 1]) {
        statue(b, sx * (w / 2 - 1.6), H + 1.15, d / 2 + 0.25, 0.85, C.stonePale);
      }
      if (w > 26) statue(b, 0, H + 1.15, d / 2 + 0.25, 0.9, C.stonePale);
    }
  });
}
