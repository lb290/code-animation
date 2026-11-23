// WHALE — the colossal sky whale that carries a whole city on its back.
//
//   buildWhale(b, ctx, rng) -> void
//
// The whale is its own dynamic mesh (NOT part of the merged static world).
// Local space: +Z is the nose, -Z the tail, +Y up, length NOSE-TAIL = 260 m.
// The whole mesh is drawn through trs(pos, yaw, S=3) so in the world it is
// 780 m long, 148 m tall — a sky-leviathan, several times the old balloon.
//
// On its back (local z ≈ +5..+84) sits a second city built by
// ./whale-city.js in real metres: it is scaled 1/S into local space, so its
// houses/cathedral stay at human scale on a 780 m whale (reference image 2).
//
// Also: long pectoral flippers, proper flukes with a centre notch, a hooked
// dorsal fin, pleated throat grooves as real geometry, baleen-jaw colouring,
// twin blowholes, barnacle growths, and a pod of distant whale-cities.
import { B, rgb, mulc, mixc, cylinder } from './geo.js';
import { mesh } from './gl.js';
import { trs } from './actor.js';
import { C } from './palette.js';
import { MT, ellipsoid, tubePath, boxAt } from './lib3d.js';
import { L } from './layout.js';
import { m4, TAU, noise3, clamp, smoothstep, dot, norm, sub, cross, scale as vs, add as vadd, mulberry32 } from './math.js';
import { buildBackCity, WHALE_CITY_LIGHTS } from './whale-city.js';
import { ENV } from './daynight.js';

// ------------------------------------------------------------------ palette
const PALE = rgb('#e6f2fd');             // belly light
const PALE2 = rgb('#b9d4ea');            // belly shadow
const PALE3 = rgb('#86a7c8');            // chin / crease shadow
const CREASE = rgb('#12254a');           // mouth / pleat crease
const BACK_DEEP = rgb('#1a3b8f');        // deep indigo back
const BACK_MID = rgb('#2f63c4');         // cobalt flank
const BACK_LIGHT = rgb('#5e97e6');       // lit top band
const BACK_TEAL = rgb('#46a6dd');        // cyan streak at the waterline
const SPECK = rgb('#e2f1ff');            // barnacle specks
const EYE_C = rgb('#0a1220');
const BARN = rgb('#d5e6f4');
const SCALE_WHITE = rgb('#cfe3f6');

// ------------------------------------------------------------------ shape
const NOSE = 130, TAIL = -130, LEN = NOSE - TAIL;
const S = 3.0;                    // world scale of the whole whale
const CAP = 4.0;                  // length of the rounded snout cap
const RES = { su: 120, ns: 80 };  // body grid (full detail)
const BODY_MAT = [0.0, 0.15];     // softer sheen than MT.polish on the huge body

// key sections: u, half-width, upper half-height, lower depth, centre y,
// belly-edge (sin of the jaw line), top-flatness exponent
// The high top exponent (4–4.8) gives the back its broad, almost level
// plateau that the city stands on, while the sides stay round. The head is
// deliberately big and blunt (whale, not blimp): the throat bulges down and
// the mouth line sits high, sweeping up towards the eye.
const KEYS = [
  [0.000, 4.6, 2.5, 3.2, -1.3, 0.14, 2.4],
  [0.020, 11.5, 5.8, 8.8, -1.9, 0.18, 2.8],
  [0.045, 17.0, 8.8, 13.5, -2.3, 0.24, 3.2],
  [0.075, 21.5, 11.8, 17.6, -2.6, 0.26, 3.6],
  [0.110, 24.5, 14.2, 22.0, -2.9, 0.28, 3.9],
  [0.150, 26.2, 16.2, 25.0, -3.1, 0.30, 4.2],
  [0.195, 26.2, 17.3, 28.4, -3.1, 0.30, 4.5],
  [0.245, 27.5, 18.0, 31.2, -2.9, 0.25, 4.7],
  [0.300, 28.6, 18.4, 31.6, -2.7, 0.13, 4.8],
  [0.360, 29.4, 18.8, 32.6, -2.5, 0.01, 4.7],
  [0.430, 29.6, 18.8, 32.2, -2.2, -0.10, 4.4],
  [0.500, 28.8, 18.2, 30.6, -2.0, -0.22, 4.0],
  [0.570, 25.6, 16.4, 26.6, -1.7, -0.32, 3.5],
  [0.640, 21.6, 14.2, 22.0, -1.4, -0.40, 3.1],
  [0.705, 17.2, 11.6, 17.6, -1.0, -0.47, 2.8],
  [0.770, 12.6, 8.8, 13.0, -0.5, -0.53, 2.6],
  [0.830, 8.6, 6.2, 9.0, 0.0, -0.57, 2.4],
  [0.885, 5.2, 4.2, 5.6, 0.5, -0.60, 2.3],
  [0.940, 3.2, 2.9, 3.9, 0.9, -0.62, 2.2],
  [1.000, 2.4, 2.5, 2.7, 1.3, -0.64, 2.2],
];

const cr1 = (p0, p1, p2, p3, t) => {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
};

function secAt(u) {
  const n = KEYS.length;
  let i = 0;
  if (u <= KEYS[0][0]) i = 0;
  else if (u >= KEYS[n - 1][0]) i = n - 2;
  else { while (i < n - 2 && KEYS[i + 1][0] < u) i++; }
  const a = KEYS[Math.max(0, i - 1)], b = KEYS[i], c = KEYS[i + 1], d = KEYS[Math.min(n - 1, i + 2)];
  const span = Math.max(1e-5, c[0] - b[0]);
  const t = clamp((u - b[0]) / span, 0, 1);
  const k = [0, 0, 0, 0, 0, 0, 0];
  for (let j = 1; j <= 6; j++) k[j] = cr1(a[j], b[j], c[j], d[j], t);
  return {
    w: Math.max(0.2, k[1]), hu: Math.max(0.4, k[2]), hd: Math.max(0.4, k[3]),
    cy: k[4], edge: clamp(k[5], -0.85, 0.7), pt: Math.max(2.0, k[6]),
  };
}

// ---------------------------------------------------------------- surface
// u ∈ [0,1] over the body. The snout cap is folded into the same function so
// its normals come out continuous: u<0 is the cap (u = -1 at the very tip).
function surf(u, ang) {
  const s = secAt(clamp(u, 0, 1));
  const cs = Math.cos(ang), sn = Math.sin(ang);
  let fac = 1, z = null;
  if (u < 0) {
    const c = clamp(u + 1, 0, 1);      // 0 tip -> 1 base
    fac = Math.pow(Math.sin(c * Math.PI / 2), 0.70);
    z = NOSE + CAP * (1 - c);
  }
  const px = s.w * cs * fac;
  const psn = Math.abs(sn);
  const top = sn >= 0;
  const P = top ? s.pt : 2.15;
  const py = (top ? s.hu : s.hd) * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(cs), P)), 1 / P) * (top ? 1 : -1) * fac;
  let y = s.cy * (u < 0 ? 1 : 1) + py;
  let x = px;
  // ---- pleated throat grooves (real geometry; shaded by the normals)
  let groove = 0;
  if (sn < s.edge + 0.04 && u > -0.02) {
    const uf = smoothstep(0.004, 0.05, u) * (1 - smoothstep(0.34, 0.50, u));
    const tc = x / Math.max(0.2, s.w);
    const xf = 1 - smoothstep(0.62, 0.98, Math.abs(tc));
    const af = smoothstep(-0.95, -0.30, sn - s.edge);
    groove = Math.cos(tc * Math.PI * 9.0) * uf * xf * af;
    const k = 1 + groove * 0.034;
    x *= k;
    y = s.cy + (y - s.cy) * k;
  }
  if (z === null) z = NOSE - LEN * clamp(u, 0, 1);
  // subtle hand-painted skin breathing
  const nz = noise3(x * 0.055 + 3.1, y * 0.055 - 2.3, z * 0.045 + 7.1);
  const k2 = 1 + (nz - 0.5) * 0.022;
  return [x * k2, s.cy + (y - s.cy) * k2, z, groove];
}

function surfNormal(u, ang) {
  const hu = 0.010, ha = 0.012;
  const p = surf(u, ang);
  const p1 = surf(u + hu, ang), p0 = surf(u - hu, ang);
  const q1 = surf(u, ang + ha), q0 = surf(u, ang - ha);
  let n = norm(cross(sub(q1, q0), sub(p1, p0)));
  const s = secAt(clamp(u, 0, 1));
  const rad = [p[0], p[1] - s.cy, 0];
  if (dot(n, rad) < 0) n = vs(n, -1);
  return n;
}

// ---------------------------------------------------------------- colour
function bodyColor(u, ang, p, groove) {
  const s = secAt(clamp(u, 0, 1));
  const sn = Math.sin(ang);
  // the jaw line is not a ruler-straight boundary: let it wander
  const edge = s.edge
    + (noise3(p[2] * 0.042, p[1] * 0.06, 3.3) - 0.5) * 0.10
    + (noise3(p[2] * 0.16, p[0] * 0.11, 7.7) - 0.5) * 0.04;
  const mot = noise3(p[0] * 0.07 + 1.7, p[1] * 0.07, p[2] * 0.07);
  const fine = noise3(p[0] * 0.23 + 11.3, p[1] * 0.23, p[2] * 0.16);
  const nearNose = 1 - smoothstep(0.05, 0.30, u);

  // ---- pale pleated belly / lower jaw
  const deep = clamp((edge - sn) / Math.max(0.15, edge + 0.95), 0, 1);
  const streak = noise3(p[0] * 0.30 + 2.1, p[1] * 0.30, p[2] * 0.028 - 4.4);
  let belly = mixc(mixc(PALE, PALE2, 0.54), PALE, clamp(deep * 0.40, 0, 1));
  belly = mixc(belly, PALE3, (streak - 0.5) * 0.22 + 0.06);
  belly = mulc(belly, 0.87 + groove * 0.22);
  if (groove < 0) belly = mixc(belly, PALE3, -groove * 0.18);
  belly = mixc(belly, PALE, nearNose * clamp(-sn, 0, 1) * 0.40);
  belly = mixc(belly, PALE3, clamp(1 - (edge - sn) * 11, 0, 1) * 0.30);
  belly = mulc(belly, 0.95 + (mot - 0.5) * 0.09 + (fine - 0.5) * 0.05);

  // ---- indigo back
  const up = clamp((sn - edge) / Math.max(0.02, 1 - edge), 0, 1);
  let back = mixc(BACK_DEEP, BACK_MID, 0.18 + 0.76 * Math.pow(up, 0.9));
  if (up < 0.20) back = mixc(back, BACK_TEAL, (1 - up / 0.20) * 0.34);
  back = mixc(back, BACK_LIGHT, clamp((up - 0.70) / 0.30, 0, 1) * 0.34);
  const patchN = noise3(p[0] * 0.15 + 5.3, p[1] * 0.17, p[2] * 0.15 + 2.2);
  if (patchN > 0.74) back = mixc(back, BACK_LIGHT, (patchN - 0.74) * 0.9);
  back = mulc(back, 0.90 + mot * 0.13 + fine * 0.10);
  const sp = noise3(p[0] * 0.42 + 3.1, p[1] * 0.42, p[2] * 0.42 - 1.7);
  if (sp > 0.84 && sn > 0.02) back = mixc(back, SPECK, (sp - 0.84) * 2.6);

  // ---- mottled, wandering transition (never a painted stripe)
  let col = mixc(belly, back, smoothstep(-0.06, 0.07, sn - edge));
  // soft dark crease right on the jaw line itself
  const dEdge = Math.abs(sn - edge);
  if (dEdge < 0.085) col = mixc(col, CREASE, (1 - dEdge / 0.085) * 0.30);
  return col;
}

// ---------------------------------------------------------------- body
export function buildBody(wb, res) {
  const SU = res ? res.su : RES.su, NS = res ? res.ns : RES.ns;
  const CAPROWS = res ? Math.max(2, Math.round(res.ns * 0.08)) : 6;
  const rows = [];
  // snout cap rows (u from -1 to 0)
  for (let j = 0; j < CAPROWS; j++) rows.push(-1 + j / CAPROWS);
  for (let j = 0; j <= NS; j++) rows.push(j / NS);

  const grid = [], nrm = [], cols = [];
  for (const u of rows) {
    const rowP = [], rowN = [], rowC = [];
    for (let i = 0; i < SU; i++) {
      const ang = (i / SU) * TAU;
      const p = surf(u, ang);
      rowP.push(p);
      rowN.push(surfNormal(u, ang));
      rowC.push(bodyColor(u, ang, p, p[3]));
    }
    grid.push(rowP); nrm.push(rowN); cols.push(rowC);
  }
  const idx = [];
  // per-vertex material: the pale under-side carries a little emissive so the
  // belly still glows like painted skin when the whale passes overhead and the
  // visitor sees its shaded underside against the sky.
  const BELLY_MAT = [0.030, 0.15];
  for (let j = 0; j < rows.length; j++) {
    const uu = clamp(rows[j], 0, 1);
    const s = secAt(uu);
    const row = [];
    for (let i = 0; i < SU; i++) {
      const ang = (i / SU) * TAU;
      const isBelly = Math.sin(ang) < s.edge + 0.06;
      row.push(wb.vert(grid[j][i], nrm[j][i], cols[j][i], isBelly ? BELLY_MAT : BODY_MAT));
    }
    idx.push(row);
  }
  for (let j = 0; j < rows.length - 1; j++) {
    for (let i = 0; i < SU; i++) {
      const i2 = (i + 1) % SU;
      wb.i.push(idx[j][i], idx[j][i2], idx[j + 1][i2], idx[j][i], idx[j + 1][i2], idx[j + 1][i]);
    }
  }
  // ---- close the very tip of the snout
  const s0 = secAt(0);
  const tipY = s0.cy;
  const tip = wb.vert([0, tipY, NOSE + CAP], [0, 0, 1], mixc(PALE, PALE2, 0.3), BODY_MAT);
  for (let i = 0; i < SU; i++) wb.i.push(tip, idx[0][(i + 1) % SU], idx[0][i]);
  // ---- tail cap (the flukes hide it)
  const s1 = secAt(1);
  const tailTip = wb.vert([0, s1.cy, TAIL - 2.5], [0, 0, -1], mulc(BACK_DEEP, 0.9), BODY_MAT);
  const last = idx[idx.length - 1];
  for (let i = 0; i < SU; i++) wb.i.push(tailTip, last[i], last[(i + 1) % SU]);

  if (res) return;

  // ---- mouth line: swept from the snout tip back and up to the eye corner.
  // It is a dark crease with a pale lower lip under it, so it reads as a mouth
  // rather than a cable lying on the flank.
  for (const side of [-1, 1]) {
    const pts = [], lip = [];
    for (let n = 0; n <= 16; n++) {
      const t = n / 16;
      const u = -0.02 + t * 0.245;
      const s = secAt(clamp(u, 0, 1));
      const asin = Math.asin(clamp(s.edge, -0.98, 0.98));
      const ang = side > 0 ? asin : Math.PI - asin;
      const p = surf(u, ang);
      const nn = surfNormal(u, ang);
      pts.push(vadd(p, vs(nn, 0.02)));
      // lower lip: follow the same line but below the jaw edge, pushed out
      const ang2 = side > 0 ? asin - 0.16 : Math.PI - asin + 0.16;
      const p2 = surf(u, ang2);
      const n2 = surfNormal(u, ang2);
      lip.push(vadd(p2, vs(n2, 0.20)));
    }
    tubePath(wb, pts, 0.62, 4, CREASE, MT.matte, { caps: false });
    tubePath(wb, lip, 0.58, 3, mixc(PALE, PALE2, 0.16), MT.polish, { caps: false });
    void lip;
  }

  // ---- eyes, just above and behind the mouth corner
  for (const side of [-1, 1]) {
    const u = 0.208, s = secAt(u);
    const mal = Math.asin(clamp(s.edge + 0.09, -0.98, 0.98));
    const ang = side > 0 ? mal : Math.PI - mal;
    const p = surf(u, ang);
    const nn = surfNormal(u, ang);
    const c = vadd(p, vs(nn, 0.12));
    // dark eye patch
    wb.push(m4.translate([c[0], c[1], c[2]]));
    ellipsoid(wb, 2.9, 2.1, 1.5, 10, 5, mulc(BACK_DEEP, 0.50), BODY_MAT);
    wb.pop();
    // eyeball + wet glint
    const e = vadd(c, vs(nn, 0.85));
    wb.push(m4.translate(e));
    ellipsoid(wb, 1.05, 0.95, 0.8, 9, 5, EYE_C, MT.gloss);
    wb.pop();
    wb.push(m4.translate([e[0] + nn[0] * 0.55 + side * 0.22, e[1] + nn[1] * 0.55 + 0.30, e[2] + nn[2] * 0.55]));
    ellipsoid(wb, 0.28, 0.28, 0.2, 6, 3, rgb('#f2fbff'), MT.glow);
    wb.pop();
  }

  // ---- twin blowholes on the top of the head
  for (const side of [-1, 1]) {
    const u = 0.048, ang = Math.PI / 2 - side * 0.10;
    const p = surf(u, ang);
    const nn = surfNormal(u, ang);
    wb.push(m4.translate([p[0] + side * 1.7, p[1], p[2]]));
    wb.push(m4.rotZ(side * 0.25));
    ellipsoid(wb, 1.05, 0.42, 1.6, 8, 4, mulc(BACK_DEEP, 0.62), MT.gloss);
    wb.pop();
    wb.pop();
    // raised lip around the nostril
    wb.push(m4.translate([p[0] + side * 1.7, p[1] + 0.15, p[2]]));
    ellipsoid(wb, 1.4, 0.24, 2.0, 8, 3, mulc(BACK_MID, 1.05), MT.polish);
    wb.pop();
    void nn;
  }

  // ---- barnacle growths: clusters on the chin, flipper roots and back
  const spots = [
    [0.10, 1.90, 1.2], [0.13, 2.05, 0.9], [0.16, 1.80, 1.1], [0.20, 2.15, 0.7],
    [0.26, 1.95, 1.0], [0.33, 2.10, 0.8], [0.38, 2.30, 0.6], [0.47, 2.25, 0.9],
    [0.54, 2.05, 0.7], [0.60, 1.95, 0.8], [0.10, -2.10, 0.8], [0.14, -2.35, 0.6],
    [0.22, 1.20, 1.0], [0.30, 0.95, 0.8], [0.42, 0.80, 0.9], [0.52, 0.65, 0.7],
    [0.24, -1.10, 0.9], [0.36, -1.25, 0.6],
  ];
  for (const [u, ang, sc] of spots) {
    const p = surf(u, ang);
    const nn = surfNormal(u, ang);
    const c = vadd(p, vs(nn, 0.05));
    const r = (0.28 + noise3(u * 30, ang * 9, 3) * 0.55) * sc;
    const tipP = vadd(c, vs(nn, r * 1.35));
    const side1 = norm(cross(nn, [0, 0, 1]));
    const side2 = cross(nn, side1);
    const ring = [];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU + 0.6;
      const rr = r * (0.75 + 0.25 * Math.cos(a * 2 + 1));
      ring.push(vadd(c, vadd(vs(side1, Math.cos(a) * rr), vs(side2, Math.sin(a) * rr))));
    }
    const bc = mixc(mulc(BARN, 0.82), BACK_LIGHT, 0.25);
    for (let k = 0; k < 6; k++) wb.tri(ring[k], ring[(k + 1) % 6], tipP, bc, MT.stone, nn, nn, nn);
  }

  // ---- a couple of old scars / rake marks on the flank (thin pale lines)
  for (let sIdx = 0; sIdx < 3; sIdx++) {
    const u0 = 0.36 + sIdx * 0.07;
    const pts = [];
    for (let k = 0; k <= 4; k++) {
      const u = u0 + k * 0.006;
      const ang = 1.05 + k * 0.03;
      const p = surf(u, ang);
      const nn = surfNormal(u, ang);
      pts.push(vadd(p, vs(nn, 0.06)));
    }
    tubePath(wb, pts, 0.17, 2, SCALE_WHITE, MT.polish, { caps: false });
  }
}

// ---------------------------------------------------------------- fins
// Swept, cambered blade: each section has a centre, a span direction, a chord
// direction, chord half-length and thickness. Used for flippers, flukes, fin.
function airfoilFin(wb, sections, opts = {}) {
  const M = opts.chordSeg || 9;
  const colTop = opts.top || mixc(BACK_MID, BACK_DEEP, 0.25);
  const colBot = opts.bottom || mixc(PALE, BACK_LIGHT, 0.55);
  const colEdge = opts.edge || mixc(colTop, BACK_DEEP, 0.35);
  const mat = opts.mat || MT.polish;
  const rows = [];
  for (let si = 0; si < sections.length; si++) {
    const s = sections[si];
    const span = norm(s.span);
    const chord = norm(s.chord);
    let nrm = norm(cross(span, chord));
    if (dot(nrm, s.nref || [0, 0, 1]) < 0 && s.nref) nrm = vs(nrm, -1);
    const row = [];
    for (let q = 0; q <= M; q++) {
      const qf = q / M;
      const prof = Math.pow(Math.sin(Math.PI * clamp(qf, 0.02, 0.98)), 0.72);
      const base = vadd(s.c, vs(chord, (qf - 0.45) * s.ch));
      const halfT = s.th * prof;
      row.push({
        top: vadd(base, vs(nrm, halfT)),
        bot: vadd(base, vs(nrm, -halfT)),
        le: qf < 0.001 || qf > 0.999,
        nrm,
      });
    }
    rows.push(row);
  }
  const tri = (a, b, c, col) => {
    // winding + outward normal from the geometry so lighting is stable
    const n = norm(cross(sub(b, a), sub(c, a)));
    wb.tri(a, b, c, col, mat, n, n, n);
  };
  for (let si = 0; si < rows.length - 1; si++) {
    for (let q = 0; q < M; q++) {
      const t0 = rows[si][q], t1 = rows[si + 1][q], t2 = rows[si + 1][q + 1], t3 = rows[si][q + 1];
      tri(t0.top, t1.top, t2.top, colTop);
      tri(t0.top, t2.top, t3.top, colTop);
      tri(t0.bot, t3.bot, t2.bot, colBot);
      tri(t0.bot, t2.bot, t1.bot, colBot);
    }
  }
  // ---- leading/trailing rims (they read as the thin edge of the flipper)
  for (let si = 0; si < rows.length - 1; si++) {
    const le0 = rows[si][0], le1 = rows[si + 1][0];
    const te0 = rows[si][M], te1 = rows[si + 1][M];
    const mid0 = rows[si][0].nrm, mid1 = rows[si + 1][0].nrm;
    wb.quad(le0.top, le0.bot, le1.bot, le1.top, colEdge, mat, mid0);
    wb.quad(te0.bot, te0.top, te1.top, te1.bot, colEdge, mat, mid1);
  }
  // ---- rounded tip / root caps
  for (const [ri, dir] of [[0, -1], [rows.length - 1, 1]]) {
    const row = rows[ri];
    const nrm = row[0].nrm;
    const col = dir < 0 ? colBot : colEdge;
    for (let q = 0; q < M; q++) wb.tri(row[q].top, row[q + 1].top, row[q].bot, col, mat, nrm, nrm, nrm);
    wb.tri(row[M].top, row[0].bot, row[M].bot, col, mat, nrm, nrm, nrm);
  }
}

// long, broad pectoral flippers, low on the flank, sweeping back and down
export function buildFins(wb) {
  for (const side of [1, -1]) {
    const root = [side * 22, -14, 58];
    const m1 = [side * 28, -36, 38];
    const m2 = [side * 34, -55, 12];
    const tip = [side * 36, -66, -14];
    const N = 14;
    const secs = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const it = 1 - t;
      const c = [0, 0, 0];
      for (let k = 0; k < 3; k++) c[k] = it * it * it * root[k] + 3 * it * it * t * m1[k] + 3 * it * t * t * m2[k] + t * t * t * tip[k];
      // span direction = bezier derivative, so the blade bends along its length
      const d = [0, 0, 0];
      for (let k = 0; k < 3; k++) d[k] = 3 * it * it * (m1[k] - root[k]) + 6 * it * t * (m2[k] - m1[k]) + 3 * t * t * (tip[k] - m2[k]);
      const chord = 12.0 * (1 - t) + 17.0 * t * (1 - t) + 2.4 * t * t;
      const thick = 2.8 * Math.pow(1 - t, 1.1) + 0.08;
      const ch = norm([side * 0.10 * (1 - t), 0.30, 1.0]);
      secs.push({ c, span: norm(d), chord: ch, ch: chord, th: thick, nref: [side, 0, 0] });
    }
    airfoilFin(wb, secs, {
      top: mixc(BACK_MID, BACK_DEEP, 0.40),
      bottom: mixc(PALE, BACK_LIGHT, 0.34),
      edge: mixc(BACK_MID, BACK_DEEP, 0.22),
      mat: [0.06, 0.16],
    });
  }
}

// broad flukes with the classic centre notch and a downward sweep
export function buildFlukes(wb) {
  for (const side of [1, -1]) {
    const spine = [
      [1.4, -0.8, -124], [10, -1.2, -134], [20, -1.8, -144], [30, -2.6, -154],
      [39, -3.6, -163], [47, -4.6, -171], [53, -5.6, -178],
    ];
    const chords = [7.5, 16.0, 20.5, 19.0, 14.5, 8.5, 2.2];
    const thicks = [6.0, 5.0, 4.0, 3.0, 2.1, 1.0, 0.2];
    const out = spine.map((p) => [p[0] * side, p[1], p[2]]);
    const secs = out.map((c, i) => {
      const a = out[Math.max(0, i - 1)], b = out[Math.min(out.length - 1, i + 1)];
      return {
        c,
        span: norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]),
        chord: norm([0, 0.05, 1]),
        ch: chords[i], th: thicks[i], nref: [0, 1, 0],
      };
    });
    airfoilFin(wb, secs, {
      top: mixc(BACK_MID, BACK_DEEP, 0.28),
      bottom: mixc(PALE, BACK_LIGHT, 0.40),
      edge: mixc(BACK_DEEP, PALE, 0.22),
      chordSeg: 8,
      mat: [0.05, 0.16],
    });
  }
  // ---- small hooked dorsal fin, far back, sitting on the actual back surface
  {
    const ptop = surf(0.735, Math.PI / 2);
    const z0 = ptop[2], y0 = ptop[1];
    const secs = [
      { c: [0, y0 - 0.8, z0 + 4.0], span: [0, 1, 0], chord: [0, 0.14, 1], ch: 9.5, th: 1.7, nref: [1, 0, 0] },
      { c: [0, y0 + 2.4, z0 + 1.8], span: [0, 1, 0], chord: [0, 0.12, 1], ch: 7.2, th: 1.15, nref: [1, 0, 0] },
      { c: [0, y0 + 4.8, z0 - 0.8], span: [0, 1, 0], chord: [0, 0.10, 1], ch: 4.6, th: 0.62, nref: [1, 0, 0] },
      { c: [0, y0 + 6.3, z0 - 3.6], span: [0, 1, 0], chord: [0, 0.08, 1], ch: 2.0, th: 0.2, nref: [1, 0, 0] },
    ];
    airfoilFin(wb, secs, {
      top: mixc(BACK_MID, BACK_DEEP, 0.32),
      bottom: mixc(BACK_MID, BACK_DEEP, 0.52),
      edge: BACK_DEEP,
      chordSeg: 6,
    });
  }
}

// ---------------------------------------------------------------- back shelf
// The city does not stand on a big round pancake: it grows out of a rocky
// saddle that hugs the whale's back. The shelf top is flat (the city floor),
// the rim drops as an irregular rock/stone cliff into the skin.
const CITY_Z = 43.0;          // local z of the city centre
const CITY_Y = 18.4;          // local y of the city floor
const CITY_CS = 1.12;         // city is built in real metres, enlarged slightly
const CITY_HX = 23.4;         // shelf half-width  (local)
const CITY_HZ = 44.0;         // shelf half-length (local)
const SHELF_E = 3.4;          // super-ellipse exponent of the plan outline

function uOfZ(z) { return clamp((NOSE - z) / LEN, 0, 1); }

export function backTopY(x, z) {
  const s = secAt(uOfZ(z));
  const c = clamp(Math.abs(x) / Math.max(0.2, s.w), 0, 0.9995);
  return s.cy + s.hu * Math.pow(Math.max(0, 1 - Math.pow(c, s.pt)), 1 / s.pt);
}

export function shelfPoint(a, scale) {
  const cs = Math.cos(a), sn = Math.sin(a);
  const e = 2 / SHELF_E;
  const x = CITY_HX * scale * Math.sign(cs || 1) * Math.pow(Math.abs(cs), e);
  const z = CITY_Z + CITY_HZ * scale * Math.sign(sn || 1) * Math.pow(Math.abs(sn), e);
  const n = 1 + (noise3(Math.cos(a) * 2.3 + 4.1, Math.sin(a) * 2.3, 1.7) - 0.5) * 0.055;
  return [x * n, z];
}

export function backShelf(wb, rng) {
  const N = 64;
  const topRow = [], skinRow = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU;
    const [x, z] = shelfPoint(a, 1.0);
    const skin = backTopY(x, z);
    topRow.push([x, CITY_Y, z]);
    // the rim flares outward as it falls to the skin, like a rock shoulder
    const [x2, z2] = shelfPoint(a, 1.055 + (noise3(Math.cos(a) * 3.0, 2.2, Math.sin(a) * 3.0) * 0.03));
    skinRow.push([x2, skin - 1.6, z2, skin]);
  }
  // ---- the back of the whale swells up around the city: a smooth blue skin
  // collar (this is what makes the town read as *growing out of the whale*,
  // rather than standing on a plate dropped on its back)
  {
    const Nc = 56;
    for (let i = 0; i < Nc; i++) {
      const a0 = (i / Nc) * TAU, a1 = ((i + 1) / Nc) * TAU;
      const [ix0, iz0] = shelfPoint(a0, 0.985), [ix1, iz1] = shelfPoint(a1, 0.985);
      const [ox0, oz0] = shelfPoint(a0, 1.14), [ox1, oz1] = shelfPoint(a1, 1.14);
      const iy0 = backTopY(ix0, iz0) - 0.4, iy1 = backTopY(ix1, iz1) - 0.4;
      const oy0 = backTopY(ox0, oz0) + 1.4 + noise3(Math.cos(a0) * 3.1, 2.4, 0.7) * 1.6;
      const oy1 = backTopY(ox1, oz1) + 1.4 + noise3(Math.cos(a1) * 3.1, 2.4, 0.7) * 1.6;
      const cA = mixc(BACK_MID, BACK_DEEP, 0.15), cB = mixc(BACK_MID, BACK_LIGHT, 0.18);
      wb.quad([ix0, iy0, iz0], [ix1, iy1, iz1], [ox1, oy1, oz1], [ox0, oy0, oz0], mixc(cA, cB, 0.4), BODY_MAT, [0, 1, 0]);
    }
  }
  // ---- rock strata down the rim (no pale pancake: dark rock + moss)
  const bands = [
    [0.0, 0.30, mixc(C.stoneDark, C.stoneCool, 0.35)],
    [0.30, 0.62, mulc(C.stoneDark, 0.9)],
    [0.62, 1.0, mulc(mixc(C.stoneDark, C.leafDark, 0.3), 0.82)],
  ];
  for (const [t0, t1, col] of bands) {
    for (let i = 0; i < N; i++) {
      const i2 = (i + 1) % N;
      const aT = topRow[i], bT = topRow[i2];
      const aS = skinRow[i], bS = skinRow[i2];
      const p0 = [aT[0] + (aS[0] - aT[0]) * t0, aT[1] + (aS[1] - aT[1]) * t0, aT[2] + (aS[2] - aT[2]) * t0];
      const p1 = [bT[0] + (bS[0] - bT[0]) * t0, bT[1] + (bS[1] - bT[1]) * t0, bT[2] + (bS[2] - bT[2]) * t0];
      const p2 = [bT[0] + (bS[0] - bT[0]) * t1, bT[1] + (bS[1] - bT[1]) * t1, bT[2] + (bS[2] - bT[2]) * t1];
      const p3 = [aT[0] + (aS[0] - aT[0]) * t1, aT[1] + (aS[1] - aT[1]) * t1, aT[2] + (aS[2] - aT[2]) * t1];
      const jitter = noise3(p0[0] * 0.22 + 1.3, p0[1] * 0.22, p0[2] * 0.22) - 0.5;
      const c0 = mulc(col, 0.82 + (noise3(p0[0] * 0.2, p0[1] * 0.2, p0[2] * 0.2) + jitter) * 0.24);
      const Nn = norm([p0[0] * 0.45, 1.0, 0]);
      wb.quad(p0, p1, p2, p3, c0, MT.stone, Nn);
    }
  }
  // ---- the narrow apron between the wall and the city (mostly hidden by the
  // town's own base; only a mossy lip is meant to be visible)
  const cols = 14, rows = 12;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a0 = (c / cols) * TAU, a1 = ((c + 1) / cols) * TAU;
      const s0 = 0.78 + 0.22 * (r / rows), s1 = 0.78 + 0.22 * ((r + 1) / rows);
      const [xa0, za0] = shelfPoint(a0, s0), [xa1, za1] = shelfPoint(a1, s0);
      const [xb0, zb0] = shelfPoint(a0, s1), [xb1, zb1] = shelfPoint(a1, s1);
      const n = noise3(c * 1.7, r * 1.3, 2.2);
      const col = mixc(mixc(C.leafDark, C.stoneDark, 0.42), mixc(C.leaf, C.stone, 0.3), n * 0.9);
      const y = CITY_Y - 0.02;
      wb.quad([xa0, y, za0], [xa1, y, za1], [xb1, y, zb1], [xb0, y, zb0], col, MT.leaf, [0, 1, 0]);
    }
  }
  // ---- rocky outcrops tucked against the rim at skin level, mossy boulders
  for (let k = 0; k < 30; k++) {
    const a = (k / 30) * TAU + rng() * 0.15;
    const sc = 1.02 + rng() * 0.06;
    const [x, z] = shelfPoint(a, sc);
    const skin = backTopY(x, z);
    const r = 1.3 + rng() * 2.2;
    wb.push(m4.translate([x, skin + r * 0.25 + rng() * 0.8, z]));
    ellipsoid(wb, r, r * (0.5 + rng() * 0.45), r * (0.7 + rng() * 0.45), 6, 4,
      mixc(C.stoneDark, rng() > 0.6 ? C.leafDark : C.stoneCool, 0.3 + rng() * 0.4), MT.stone, {
        colFn: (v) => mixc(mixc(C.stoneDark, C.stoneCool, 0.3), C.leafDark, 0.2 + v * 0.5),
      });
    wb.pop();
  }
  // ---- vines and hanging gardens spilling over the rim onto the whale's skin
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * TAU + 0.3;
    const [x, z] = shelfPoint(a, 0.995);
    const skin = backTopY(x, z);
    const pts = [];
    const len = Math.max(1.2, (CITY_Y - skin) + 2.0);
    for (let j = 0; j <= 4; j++) {
      const t = j / 4;
      pts.push([x * (1 + t * 0.08), CITY_Y - t * len, z + Math.sin(t * 3 + k) * 1.4]);
    }
    tubePath(wb, pts, 0.5, 3, C.vine, MT.leaf, { caps: false });
    wb.push(m4.translate([x * 1.02, CITY_Y - 0.4, z]));
    ellipsoid(wb, 2.0 + rng() * 1.6, 1.2, 2.2 + rng() * 1.4, 6, 3, mixc(C.leaf, C.leafDark, 0.4), MT.leaf, {
      colFn: (v) => mixc(C.leafDark, C.leafLight, v),
    });
    wb.pop();
  }
}

// ---------------------------------------------------------------- city on the back
function backCity(wb, rng) {
  backShelf(wb, rng);
  wb.note('whale-city');
  wb.push(m4.translate([0, CITY_Y + 0.30, CITY_Z]));
  wb.push(m4.scale([CITY_CS / S, CITY_CS / S, CITY_CS / S]));
  buildBackCity(wb, rng, {});
  wb.pop();
  wb.pop();
}

// ---------------------------------------------------------------- patrol state
const PHASE = 3.89;      // at t≈8 s the whale sits upper-left of the opening view
const BOB = 24;

function whaleState(t) {
  const a = PHASE - t * L.whale.speed;
  const x = L.whale.cx + Math.cos(a) * L.whale.radius;
  const z = L.whale.cz + Math.sin(a) * L.whale.radius;
  const y = L.whale.cy + Math.sin((t * TAU) / BOB) * 9.0;
  const yaw = Math.PI - a;
  const pitch = Math.sin(t * 0.23 + 0.7) * 0.020;
  const roll = Math.sin(t * 0.31) * 0.030;
  return { x, y, z, yaw, pitch, roll };
}

function xf(m, p) {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
}

// ---------------------------------------------------------------- distant pod
// Three more whale-cities far out in the haze: the hero city is one of many.
const POD = [
  { cx: -1000, cy: 620, cz: -1250, r: 340, sp: 0.0035, ph: 0.4, sc: 2.4 },
  { cx: 1250, cy: 540, cz: -700, r: 300, sp: -0.0030, ph: 2.6, sc: 2.0 },
  { cx: -250, cy: 780, cz: 1350, r: 420, sp: 0.0022, ph: 4.4, sc: 2.8 },
  { cx: 1500, cy: 860, cz: 900, r: 380, sp: -0.0025, ph: 5.6, sc: 2.2 },
];

function buildPodWhale(wb, rng) {
  wb.note('pod-whale');
  const res = { su: 26, ns: 16 };
  buildBody(wb, res);
  buildFins(wb);
  buildFlukes(wb);
  // silhouette city: a keep, a cathedral spire cluster and a few house blocks
  wb.push(m4.translate([0, 17.0, 40]));
  wb.push(m4.scale([1 / S, 1 / S, 1 / S]));
  const stone = mulc(C.stonePale, 0.92);
  const slate = C.slateDark;
  wb.push(m4.translate([0, 0, 0]));
  boxAt(wb, 60, 26, 46, stone, MT.stone);
  wb.pop();
  boxAt(wb, 26, 52, 24, stone, MT.stone);
  for (let i = 0; i < 5; i++) {
    const x = -22 + i * 11;
    wb.push(m4.translate([x, 26, -8 + (i % 2) * 6]));
    cylinder(wb, 6, 3.4, 0.2, 34 + (i % 3) * 12, slate, MT.stone, { y0: 0, caps: false });
    wb.pop();
    wb.push(m4.translate([x, 26 + 44 + (i % 3) * 12, -8 + (i % 2) * 6]));
    cylinder(wb, 5, 0.9, 0.03, 5.0, C.goldBright, MT.gold, { y0: 0, caps: false });
    wb.pop();
  }
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU;
    const x = Math.cos(a) * (34 + rng() * 14), z = Math.sin(a) * (30 + rng() * 12);
    const h = 10 + rng() * 16;
    wb.push(m4.translate([x, 13, z]));
    boxAt(wb, 10 + rng() * 6, h, 9 + rng() * 5, mulc(stone, 0.92 + rng() * 0.1), MT.stone);
    wb.pop();
    wb.push(m4.translate([x, 13 + h, z]));
    cylinder(wb, 4, 5.5, 0.2, 6 + rng() * 5, slate, MT.stone, { y0: 0, caps: false });
    wb.pop();
  }
  wb.pop();
  wb.pop();
}

// ---------------------------------------------------------------- entry
export function buildWhale(b, ctx, rng) {
  void b;
  const wb = new B();
  wb.note('whale');
  buildBody(wb, null);
  buildFins(wb);
  buildFlukes(wb);
  backCity(wb, rng);
  const tris = wb.triCount;
  console.log('[whale] tris ' + tris + ' (body/city), scale ' + S);

  const hasGL = ctx && ctx.gl && typeof ctx.gl.createBuffer === 'function';
  if (!hasGL) return { tris, wb };

  // ---- the hero whale
  const m = mesh(ctx.gl, wb.v, wb.i);
  const modelOf = (t) => {
    const s = whaleState(t);
    return trs([s.x, s.y, s.z], s.yaw, S, s.pitch, s.roll);
  };
  ctx.dyn.push({ name: 'whale', kind: 'model', mesh: m, prog: 'whale', model: modelOf });

  // ---- distant pod (same shape, lower detail), angled to read as silhouettes
  const podB = new B();
  buildPodWhale(podB, rng);
  const podMesh = mesh(ctx.gl, podB.v, podB.i);
  console.log('[whale] pod tris ' + podB.triCount);
  for (let i = 0; i < POD.length; i++) {
    const P = POD[i];
    const name = 'whale-pod-' + i;
    ctx.dyn.push({
      name,
      kind: 'model',
      mesh: podMesh,
      prog: 'whale',
      model: (t) => {
        const a = P.ph + t * P.sp;
        const x = P.cx + Math.cos(a) * P.r;
        const z = P.cz + Math.sin(a) * P.r;
        const y = P.cy + Math.sin(t * 0.11 + i * 1.7) * 14;
        const yaw = Math.PI - a;
        return trs([x, y, z], yaw, P.sc, Math.sin(t * 0.09 + i) * 0.03, Math.sin(t * 0.13 + i) * 0.04);
      },
    });
  }

  const M = trs([0, 0, 0], 0, 1);

  // ---- soft glow under the belly
  ctx.bbDyn.push({
    name: 'whale-glow',
    up: false,
    fill: (t, bb) => {
      const s = whaleState(t);
      const W = trs([s.x, s.y, s.z], s.yaw, S, s.pitch, s.roll);
      const glows = [[0, -27, 52, 50], [0, -32, 6, 70], [0, -31, -50, 62], [0, -24, -100, 44]];
      for (let i = 0; i < glows.length; i++) {
        const g = glows[i];
        const p = xf(W, [g[0], g[1], g[2]]);
        const a = 0.06 + 0.03 * Math.sin(t * 0.5 + i);
        bb.add(p[0], p[1] - 4, p[2], g[3] * S * (1 + 0.04 * Math.sin(t * 0.4 + i * 2)), 0, a, 1, rgb('#a9d8ff'));
      }
    },
  });

  // ---- barnacle motes trailing the flukes
  ctx.bbDyn.push({
    name: 'whale-motes',
    up: false,
    fill: (t, bb) => {
      const s = whaleState(t);
      const W = trs([s.x, s.y, s.z], s.yaw, S, s.pitch, s.roll);
      const N = 40;
      for (let i = 0; i < N; i++) {
        const ph = (t * 0.10 + i / N) % 1;
        const side = i % 2 ? 1 : -1;
        const base = xf(W, [side * (24 + (i % 5) * 2.2), -4 - (i % 3) * 2, -154 - (i % 7) * 5]);
        const spread = 5 + (i % 4) * 4;
        const wob = Math.sin(t * 0.7 + i * 1.7) * spread;
        const p = [base[0] + wob, base[1] - ph * 26 + Math.sin(t * 0.9 + i) * 3, base[2] - ph * 16 - (i % 6) * 3];
        const al = Math.sin(Math.PI * Math.min(1, ph * 1.4)) * 0.8;
        const sz = (1.0 + ph * 2.2 + (i % 3) * 0.4) * S;
        bb.add(p[0], p[1], p[2], sz, t * 0.5 + i, al, 0, i % 5 === 0 ? rgb('#ffe7b8') : rgb('#dcefff'));
      }
    },
  });

  // ---- warm town lights along the back city, riding with the whale.
  // Round 6: ~80-120 real window / lamp positions collected by whale-city.js
  // (WHALE_CITY_LIGHTS), plus a day<->night alpha ramp driven by ENV.night.
  ctx.bbDyn.push({
    name: 'whale-city-lights',
    up: false,
    fill: (t, bb) => {
      const s = whaleState(t);
      const W = trs([s.x, s.y, s.z], s.yaw, S, s.pitch, s.roll);
      const night = ENV.night;
      const list = WHALE_CITY_LIGHTS;
      const n = Math.min(120, list.length);
      const warm = rgb('#ffd9a0'), warmHi = rgb('#ffe7b8'), cool = rgb('#bfe6ff');
      for (let i = 0; i < n; i++) {
        const l = list[i];
        // real-metre city space -> whale local -> world
        const local = [l.p[0] * CITY_CS / S, CITY_Y + l.p[1] * CITY_CS / S, CITY_Z + l.p[2] * CITY_CS / S];
        const p = xf(W, local);
        const big = l.size > 1.8;
        const tw = 0.74 + 0.26 * Math.sin(t * 1.7 + i * 2.37);
        // day 0.19 / night 0.92 for windows, softer for the big landmark lights
        const a = (big ? 0.10 + 0.46 * night : 0.19 + 0.76 * night) * tw;
        const col = big ? warmHi : i % 5 === 0 ? cool : warm;
        const size = (big ? 5.4 : 2.6 + (l.size - 1) * 2.6) * S * (0.85 + 0.15 * night);
        bb.add(p[0], p[1], p[2], size, 0, a, 1, col);
      }
      // safety net: if the back-city registry were ever empty, keep a few lamps
      if (n < 12) {
        for (let i = 0; i < 22; i++) {
          const a2 = (i / 22) * TAU;
          const L0 = [Math.cos(a2) * (20 + (i % 3) * 12), 16 + (i % 4) * 7, 40 + Math.sin(a2) * (40 + (i % 5) * 16)];
          const local = [L0[0] * CITY_CS / S, CITY_Y + L0[1] * CITY_CS / S, CITY_Z + L0[2] * CITY_CS / S];
          const p = xf(W, local);
          const tw = 0.55 + 0.25 * Math.sin(t * 1.7 + i * 2.3);
          bb.add(p[0], p[1], p[2], 2.2 * S, 0, (0.18 + 0.72 * night) * tw, 1, i % 4 === 0 ? warm : cool);
        }
      }
    },
  });
  void M;
  return { tris };
}
