// GLASS ORBITAL — round 9: the fantasy observatory inside the glass-palace drum + dome.
// OWNER: agent "orbital". Contract: 03-notes/cielo-round9-brief.md section C.
//
// The palm house (glass-greenhouse.js) fills the drum floor (y 21.2) with tropical
// planting; the huge cavity above it (y ~46 up to the dome apex y 105.4) was empty.
// This module hangs a colossal gilded armillary / orrery in that cavity, a star-gazing
// gallery ring below it, four floating garden islets, a painted zodiac / nebula sky on
// the inner dome, and a few hanging moon / crystal / star-cage ornaments.  Everything is
// suspended: every floating object owns a visible chain / hanger back to the dome shell.
//
// It builds in the glass-palace LOCAL frame (the frame buildGlassPalace uses), so it is
// called from landmark.js inside that inFrame, right after buildGlassGreenhouse.
// Interior surfaces it must stay inside of (copied from landmark.js, see glass palace §):
//   drum wall   inner radius 26.30, y 23.0 .. 58.0
//   dome inner  ellipsoid rx=rz=29.1 ry=45.4 centred (0, 60, CZ), apex y 105.4
import { mulberry32, TAU, norm, m4 } from './math.js';
import { box, cylinder, torus, rgb, mulc, mixc, bar3, lathe, sphere, catenary } from './geo.js';
import { MT, tubePath, star, disc, extrudeXY } from './lib3d.js';
import { C } from './palette.js';
import { L } from './layout.js';

// ---------------------------------------------------------------- constants
const SEED = 0x5f21a9d1;
const CZ = -25;                       // drum / dome centre (palace-local z)
const DOME_Y = 60.0;                  // dome springing
const DOME_RX = 29.1;                 // inner dome shell radii (landmark domeInner)
const DOME_RY = 45.4;
const DRUM_RIN = 26.30;               // interior radius of the glass drum
const DRUM_TOP = 58.0;
export const MARGIN = 0.40;           // keep-out gap from every interior surface
const Y_ARM = 74.0;                   // armillary centre height
const RING_OUT = 20.0, RING_IN = 17.2, RING_Y = 53.4;   // star-gazing gallery

// ---------------------------------------------------------------- palette
const GOLD = C.gold, GOLD_B = C.goldBright, GOLD_D = rgb('#a5792f');
const BRASS = C.brass, STEEL = rgb('#dbe6f2');
const STONE = rgb('#e7dcc4'), STONE_C = rgb('#cfd8e6'), STONE_G = rgb('#d8c9a8');
const IRON = rgb('#42505f');
const LEAF = C.leaf, LEAF_L = C.leafLight, LEAF_D = C.leafDark, LAWN = C.lawn;
const MOSS = rgb('#4f8040'), MOSS_D = rgb('#38622f');
const IVORY = rgb('#f4eedd');
const CRY_V = rgb('#b88cff'), CRY_C = rgb('#7ff0e0'), MOON = rgb('#e8f0ff');

const M_GOLD = [0.18, 0.88], M_GOLD_B = [0.30, 0.72], M_BRASS = [0.12, 0.62];
const M_ARM = [0.26, 0.86], M_ARM_B = [0.34, 0.74];   // the armillary's own brighter gilding
const M_STEEL = [0.10, 0.55], M_STONE = [0.12, 0.16], M_STONE_C = [0.10, 0.26];
const M_LEAF = [0.15, 0.08], M_WOOD = [0.10, 0.18];
const M_GLOW_G = [0.62, 0.10], M_GLOW_S = [0.80, 0.20];

// stars keep colour because emissive is kept moderate (night term oversaturates >0.6)
const STAR_COLS = [
  rgb('#ffffff'), rgb('#bfe4ff'), rgb('#ffcf7a'), rgb('#ff7fa8'),
  rgb('#b88cff'), rgb('#7ff0e0'), rgb('#ffb060'), rgb('#d6e8ff'),
];
const NEB_COLS = [rgb('#ff62a8'), rgb('#8f6bff'), rgb('#54e6d2'), rgb('#ffb44e'), rgb('#ff7f6a')];

// ---------------------------------------------------------------- small vector helpers
const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vsc = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const vcross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const clamp1 = (x) => (x < -1 ? -1 : x > 1 ? 1 : x);
const T = (x, y, z) => m4.translate([x, y, z]);
const RY = (a) => m4.rotY(a);
const RX = (a) => m4.rotX(a);
const RZ = (a) => m4.rotZ(a);
function put(b, x, y, z, fn) { b.push(T(x, y, z)); fn(); b.pop(); }
function putR(b, x, y, z, yaw, fn) { b.push(T(x, y, z)); b.push(RY(yaw)); fn(); b.pop(); b.pop(); }
const px = (a, r) => Math.cos(a) * r;
const pz = (a, r) => CZ + Math.sin(a) * r;

// ---------------------------------------------------------------- interior surfaces
// Usable horizontal radius at height y, already reduced by MARGIN.  Below the dome
// springing the drum glass wall is the boundary; between the drum top and the dome
// springing the conservative drum radius is used.
export function innerLimit(y) {
  if (y <= DOME_Y) return DRUM_RIN - MARGIN;
  const s = (y - DOME_Y) / DOME_RY;
  if (s >= 1) return -1;
  return DOME_RX * Math.sqrt(Math.max(0, 1 - s * s)) - MARGIN;
}
// Point on the inner dome shell: azimuth a, polar phi (0 = rim at y 60, PI/2 = apex).
function domeSurf(a, phi, inset = 0.5) {
  const c = Math.cos(phi), s = Math.sin(phi);
  const R = DOME_RX * c;
  const p = [Math.cos(a) * R, DOME_Y + DOME_RY * s, CZ + Math.sin(a) * R];
  const n = norm([p[0] / (DOME_RX * DOME_RX), (p[1] - DOME_Y) / (DOME_RY * DOME_RY), (p[2] - CZ) / (DOME_RX * DOME_RX)]);
  return { p: [p[0] - n[0] * inset, p[1] - n[1] * inset, p[2] - n[2] * inset], n };
}
// Anchor on the dome at a given horizontal radius (so a hanger can drop straight down).
export function domeAnchor(a, rHoriz, inset = 0.5) {
  const phi = Math.acos(clamp1(rHoriz / DOME_RX));
  return domeSurf(a, phi, inset);
}

// ---------------------------------------------------------------- chain / rod helpers
function chain(b, p0, p1, w, col, mat) { bar3(b, p0, p1, w, w, col, mat || M_GOLD); }
// A thin gold suspension cable with a couple of drooping link beads.
function cable(b, p0, p1, w, col) {
  bar3(b, p0, p1, w, w, col || GOLD_D, M_GOLD);
  const n = 3;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const p = [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t, p0[2] + (p1[2] - p0[2]) * t];
    put(b, p[0], p[1], p[2], () => sphere(b, w * 1.5, GOLD, M_GOLD, { rings: 2, seg: 4, jitter: 0.1 }));
  }
}

// A tube ring: centre c, basis u/v (orthonormal), radius R.
function tubeRing(b, c, R, u, v, seg, tube, col, mat) {
  const pts = [];
  for (let i = 0; i <= seg; i++) {
    const t = (i / seg) * TAU, ca = Math.cos(t), sa = Math.sin(t);
    pts.push([c[0] + (u[0] * ca + v[0] * sa) * R,
              c[1] + (u[1] * ca + v[1] * sa) * R,
              c[2] + (u[2] * ca + v[2] * sa) * R]);
  }
  tubePath(b, pts, tube, 4, col, mat, { caps: false });
}

// A flat annular band (top + bottom + outer + inner edges) at height y.
function ringBand(b, cx, y, cz, r0, r1, seg, topCol, botCol, edgeCol, mat, y2) {
  const yb = y2 ?? y;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const P = (c, s, r, yy) => [cx + c * r, yy, cz + s * r];
    b.quad(P(c0, s0, r0, y), P(c1, s1, r0, y), P(c1, s1, r1, y), P(c0, s0, r1, y), topCol, mat, [0, 1, 0]);
    b.quad(P(c1, s1, r0, yb), P(c0, s0, r0, yb), P(c0, s0, r1, yb), P(c1, s1, r1, yb), botCol, mat, [0, -1, 0]);
    b.quad(P(c0, s0, r1, yb), P(c1, s1, r1, yb), P(c1, s1, r1, y), P(c0, s0, r1, y), edgeCol, mat, [c0, 0, s0]);
    b.quad(P(c1, s1, r0, yb), P(c0, s0, r0, yb), P(c0, s0, r0, y), P(c1, s1, r0, y), mulc(edgeCol, 0.86), mat, [-c0, 0, -s0]);
  }
}

// A square-section ring beam hanging under the gallery.
function ringBeam(b, cx, yTop, cz, rIn, rOut, h, seg, col, mat) {
  const yb = yTop - h;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const P = (c, s, r, yy) => [cx + c * r, yy, cz + s * r];
    b.quad(P(c0, s0, rOut, yb), P(c1, s1, rOut, yb), P(c1, s1, rOut, yTop), P(c0, s0, rOut, yTop), col, mat, [c0, 0, s0]);
    b.quad(P(c1, s1, rIn, yb), P(c0, s0, rIn, yb), P(c0, s0, rIn, yTop), P(c1, s1, rIn, yTop), mulc(col, 0.84), mat, [-c0, 0, -s0]);
    b.quad(P(c0, s0, rIn, yb), P(c1, s1, rIn, yb), P(c1, s1, rOut, yb), P(c0, s0, rOut, yb), mulc(col, 0.9), mat, [0, -1, 0]);
  }
}

// Inward-facing decal quad on the dome shell (star / nebula patch).
function surfQuad(b, a0, a1, phi0, phi1, col, mat, inset = 0.55) {
  const A0 = domeSurf(a0, phi0, inset), A1 = domeSurf(a1, phi0, inset);
  const B1 = domeSurf(a1, phi1, inset), B0 = domeSurf(a0, phi1, inset);
  const n = (A0.n, [-A0.n[0], -A0.n[1], -A0.n[2]]);
  b.tri(A0.p, A1.p, B1.p, col, mat, n);
  b.tri(A0.p, B1.p, B0.p, col, mat, n);
}
// small star decal: tangent square facing the dome centre.
function starQuad(b, a, phi, size, col, mat, inset = 0.55) {
  const { p, n } = domeSurf(a, phi, inset);
  let u = vcross(n, [0, 1, 0]);
  if (Math.hypot(u[0], u[1], u[2]) < 1e-4) u = [1, 0, 0];
  u = norm(u);
  const v = norm(vcross(n, u));
  const s = size * 0.5;
  const p00 = [p[0] - u[0] * s - v[0] * s, p[1] - u[1] * s - v[1] * s, p[2] - u[2] * s - v[2] * s];
  const p10 = [p[0] + u[0] * s - v[0] * s, p[1] + u[1] * s - v[1] * s, p[2] + u[2] * s - v[2] * s];
  const p11 = [p[0] + u[0] * s + v[0] * s, p[1] + u[1] * s + v[1] * s, p[2] + u[2] * s + v[2] * s];
  const p01 = [p[0] - u[0] * s + v[0] * s, p[1] - u[1] * s + v[1] * s, p[2] - u[2] * s + v[2] * s];
  const ni = [-n[0], -n[1], -n[2]];
  b.tri(p00, p10, p11, col, mat, ni);
  b.tri(p00, p11, p01, col, mat, ni);
}

// ---------------------------------------------------------------- the painted sky
const N_STARS = 300;
const N_CONST = 9;
// billboard collectors filled while the sky is painted (reset at every build)
let SKY = { sparks: [], nebula: [] };
// Star field + constellation lines + nebulae, painted on the inner dome.
function skyChart(b, rng) {
  SKY = { sparks: [], nebula: [] };
  const stars = [];
  for (let i = 0; i < N_STARS; i++) {
    const a = rng() * TAU;
    const cosPhi = 0.055 + rng() * 0.935;          // uniform over the shell
    const phi = Math.acos(cosPhi);
    const bright = rng() < 0.16;
    const ci = Math.floor(rng() * STAR_COLS.length);
    const col = bright ? STAR_COLS[ci] : mulc(STAR_COLS[ci], 0.92);
    const size = bright ? 0.46 + rng() * 0.30 : 0.20 + rng() * 0.22;
    const em = bright ? 0.82 : 0.40 + rng() * 0.16;
    starQuad(b, a, phi, size, col, [em, 0.0]);
    // the glow of a bright star is a soft billboard, never a hard flat quad
    if (bright) SKY.sparks.push({ a, phi, size: 1.9 + rng() * 1.6, col, alpha: 0.34 + rng() * 0.22 });
    else if (rng() < 0.10) SKY.sparks.push({ a, phi, size: 0.9 + rng() * 0.6, col, alpha: 0.22 });
    stars.push({ a, phi, col, size });
  }
  // constellation lines: walk from a seed star to its nearest unvisited neighbour.
  for (let k = 0; k < N_CONST; k++) {
    let idx = Math.floor(rng() * stars.length);
    let prev = stars[idx];
    const used = new Set([idx]);
    const hops = 4 + Math.floor(rng() * 3);
    for (let h = 0; h < hops; h++) {
      let best = -1, bestD = 1e9;
      for (let j = 0; j < stars.length; j++) {
        if (used.has(j)) continue;
        // angular distance on the shell
        const va = [Math.cos(stars[j].a) * Math.cos(stars[j].phi), Math.sin(stars[j].phi), Math.sin(stars[j].a) * Math.cos(stars[j].phi)];
        const vb = [Math.cos(prev.a) * Math.cos(prev.phi), Math.sin(prev.phi), Math.sin(prev.a) * Math.cos(prev.phi)];
        const d = Math.acos(clamp1(dot3(va, vb)));
        if (d < bestD) { bestD = d; best = j; }
      }
      if (best < 0 || bestD > 0.30) break;
      const cur = stars[best];
      used.add(best);
      const p0 = domeSurf(prev.a, prev.phi, 0.54).p;
      const p1 = domeSurf(cur.a, cur.phi, 0.54).p;
      chain(b, p0, p1, 0.065, GOLD_B, [0.34, 0.32]);
      starQuad(b, cur.a, cur.phi, cur.size * 1.5, mixc(cur.col, GOLD_B, 0.4), [0.80, 0.0], 0.55);
      prev = cur;
    }
  }
  // coloured nebulae: soft billboard clouds + coloured star dust, never a hard plate
  for (let i = 0; i < 6; i++) {
    const a0 = rng() * TAU, w = 0.42 + rng() * 0.60;
    const phi0 = 0.20 + rng() * 0.58, hgt = 0.18 + rng() * 0.24;
    const base = NEB_COLS[i % NEB_COLS.length];
    const second = NEB_COLS[(i + 3) % NEB_COLS.length];
    // 9 soft clouds per nebula, smaller denser core
    for (let k = 0; k < 9; k++) {
      const u = rng(), v = rng();
      const aa = a0 + w * (0.15 + u * 0.7), pp = phi0 + hgt * (0.15 + v * 0.7);
      const core = 1 - Math.max(Math.abs(u - 0.5), Math.abs(v - 0.5)) * 2;
      SKY.nebula.push({ a: aa, phi: pp, size: 7.5 + rng() * 11, col: mixc(base, second, rng() * 0.6), alpha: 0.10 + core * 0.12 });
    }
    // coloured dust: tiny stars suspended in the nebula
    for (let k = 0; k < 46; k++) {
      const aa = a0 + w * rng(), pp = phi0 + hgt * rng();
      const col = mixc(base, mixc(second, IVORY, rng() * 0.6), rng());
      starQuad(b, aa, pp, 0.16 + rng() * 0.26, col, [0.36 + rng() * 0.24, 0.0], 0.52);
    }
  }
  // the milky band around the dome: a chain of soft clouds + gold dust
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * TAU + 0.04;
    const c = mixc(mixc(IVORY, rgb('#9fb8ff'), 0.45), NEB_COLS[i % 5], 0.14 + 0.10 * Math.sin(i * 1.7));
    SKY.nebula.push({ a, phi: 0.80 + 0.02 * Math.sin(i * 2.3), size: 9 + 3 * Math.sin(i * 1.1) + 2, col: c, alpha: 0.09 });
    if (i % 2 === 0) {
      const aa = a + 0.02, pp = 0.78 + rng() * 0.10;
      starQuad(b, aa, pp, 0.14 + rng() * 0.22, mixc(c, GOLD_B, 0.4), [0.40, 0.0], 0.52);
    }
  }
  return stars;
}

// ---------------------------------------------------------------- the armillary
function armillary(b) {
  const c = [0, Y_ARM, CZ];
  const R = 10.4;
  // -- the 4 support/gimbal ring around the instrument
  tubeRing(b, c, 12.5, [1, 0, 0], [0, 0, 1], 40, 0.30, GOLD_B, M_ARM_B);
  // equatorial band: a wide engraved annulus plus two rails
  for (let i = 0; i < 40; i++) {
    const a0 = (i / 40) * TAU, a1 = ((i + 1) / 40) * TAU;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const P = (cc, ss, w, yy) => [cc * (R + w), yy, CZ + ss * (R + w)];
    b.quad(P(c0, s0, -0.26, Y_ARM - 0.22), P(c1, s1, -0.26, Y_ARM - 0.22), P(c1, s1, -0.26, Y_ARM + 0.22), P(c0, s0, -0.26, Y_ARM + 0.22), mulc(GOLD, 0.95), M_GOLD, [-c0, 0, -s0]);
    b.quad(P(c0, s0, 0.26, Y_ARM - 0.22), P(c1, s1, 0.26, Y_ARM - 0.22), P(c1, s1, 0.26, Y_ARM + 0.22), P(c0, s0, 0.26, Y_ARM + 0.22), GOLD, M_GOLD, [c0, 0, s0]);
    b.quad(P(c0, s0, 0.26, Y_ARM + 0.22), P(c1, s1, 0.26, Y_ARM + 0.22), P(c1, s1, -0.26, Y_ARM + 0.22), P(c0, s0, -0.26, Y_ARM + 0.22), GOLD_B, M_GOLD_B, [0, 1, 0]);
    b.quad(P(c1, s1, 0.26, Y_ARM - 0.22), P(c0, s0, 0.26, Y_ARM - 0.22), P(c0, s0, -0.26, Y_ARM - 0.22), P(c1, s1, -0.26, Y_ARM - 0.22), GOLD_B, M_GOLD_B, [0, -1, 0]);
    // engraved studs around the band
    if (i % 2 === 0) put(b, c0 * (R + 0.27), Y_ARM, CZ + s0 * (R + 0.27), () => sphere(b, 0.11, GOLD_B, M_GLOW_G, { rings: 2, seg: 4, jitter: 0.1 }));
  }
  tubeRing(b, c, R, [1, 0, 0], [0, 0, 1], 40, 0.22, GOLD, M_ARM);
  // tropics
  for (const dy of [-5.0, 5.0]) {
    const rr = Math.sqrt(Math.max(0.01, R * R - dy * dy));
    tubeRing(b, [0, Y_ARM + dy, CZ], rr, [1, 0, 0], [0, 0, 1], 32, 0.16, GOLD, M_ARM);
  }
  // three meridian / colure rings
  for (const ak of [0.0, 1.0472, 2.0944]) {
    tubeRing(b, c, R, [Math.cos(ak), 0, Math.sin(ak)], [0, 1, 0], 36, 0.19, GOLD, M_ARM);
  }
  // ecliptic ring, tilted 23.5 deg
  const TT = 0.4102;   // 23.5 deg
  const vE = [0, Math.cos(TT), Math.sin(TT)];
  tubeRing(b, c, 9.7, [1, 0, 0], vE, 36, 0.17, GOLD_B, M_ARM_B);
  // tilted polar axis
  for (const s of [-1, 1]) {
    const p0 = [0, Y_ARM, CZ];
    const p1 = [0, Y_ARM + s * 11.2 * vE[1], CZ + s * 11.2 * vE[2]];
    tubePath(b, [p0, p1], 0.085, 5, GOLD_D, M_GOLD, { caps: true });
    put(b, p1[0], p1[1], p1[2], () => sphere(b, 0.34, GOLD_B, M_GOLD_B, { rings: 2, seg: 5, jitter: 0.1 }));
  }
  // four small orrery paths + planets
  const orbits = [
    { r: 4.6, t: 0.55, s: 0.62, col: rgb('#ff8fb0'), dy: 0.30 },
    { r: 5.7, t: 2.35, s: 0.50, col: rgb('#7fd2ff'), dy: -0.22 },
    { r: 6.8, t: 4.05, s: 0.74, col: rgb('#ffc46a'), dy: 0.26 },
    { r: 8.0, t: 5.35, s: 0.44, col: rgb('#a8ffd0'), dy: -0.18 },
  ];
  for (const o of orbits) {
    tubeRing(b, [0, Y_ARM, CZ], o.r, [1, 0, 0], [0, 0, 1], 28, 0.05, GOLD_D, M_BRASS);
    const bx = Math.cos(o.t) * o.r, bz = CZ + Math.sin(o.t) * o.r;
    chain(b, [bx, Y_ARM, bz], [bx, Y_ARM + o.dy, bz], 0.055, GOLD, M_GOLD);
    put(b, bx, Y_ARM + o.dy + o.s, bz, () => {
      sphere(b, o.s, o.col, [0.42, 0.30], { rings: 4, seg: 7, jitter: 0.12 });
      if (o.s > 0.6) {   // a ringed planet
        b.push(RX(0.42)); b.push(RZ(0.22));
        torus(b, o.s * 1.75, o.s * 0.12, 12, 3, GOLD_B, M_GOLD_B, 'y');
        b.pop(); b.pop();
      }
    });
  }
  // the central sun
  put(b, 0, Y_ARM, CZ, () => {
    sphere(b, 1.78, rgb('#fff3cf'), M_GLOW_S, { rings: 5, seg: 10, jitter: 0.06 });
    sphere(b, 1.22, GOLD_B, [0.95, 0.1], { rings: 3, seg: 8, jitter: 0.05 });
    // radiating spikes
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      const tilt = (i % 3 === 0) ? 0.9 : (i % 3 === 1 ? -0.55 : 0.3);
      const u = [Math.cos(a) * Math.cos(tilt), Math.sin(tilt), Math.sin(a) * Math.cos(tilt)];
      const p0 = vsc(u, 2.1), p1 = vsc(u, 4.3 + (i % 2) * 0.7);
      tubePath(b, [p0, p1], (t) => 0.085 * (1 - t * 0.75), 3, GOLD_B, M_GLOW_G, { caps: false });
    }
  });
  // suspension: rod up from the north pole of the outer ring to a crow's nest
  const topY = Y_ARM + R;
  put(b, 0, (topY + 97.2) / 2, CZ, () => cylinder(b, 8, 0.20, 0.16, 97.2 - topY, GOLD_D, M_GOLD, { caps: true }));
  put(b, 0, 88.5, CZ, () => { cylinder(b, 10, 0.45, 0.32, 0.22, GOLD, M_GOLD, { caps: true }); });
  put(b, 0, 92.2, CZ, () => { cylinder(b, 10, 0.36, 0.26, 0.18, GOLD, M_GOLD, { caps: true }); });
  put(b, 0, 97.2, CZ, () => {
    torus(b, 2.3, 0.16, 24, 4, GOLD_B, M_GOLD_B, 'y');
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      put(b, Math.cos(a) * 2.3, 0, Math.sin(a) * 2.3, () => sphere(b, 0.17, GOLD_B, M_GLOW_G, { rings: 2, seg: 5, jitter: 0.1 }));
    }
  });
  // the crow's nest hangs from four chains to the painted dome apex
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.3;
    cable(b, [Math.cos(a) * 2.3, 97.2, CZ + Math.sin(a) * 2.3], domeAnchor(a, 6.4, 0.50).p, 0.06, GOLD_D);
  }
  // pendant below: gold drop + a hanging crystal star
  put(b, 0, (Y_ARM - R + 58.2) / 2, CZ, () => cylinder(b, 8, 0.11, 0.09, Y_ARM - R - 58.2, GOLD_D, M_GOLD, { caps: true }));
  put(b, 0, 58.2, CZ, () => {
    lathe(b, [[0.0, 1.1], [0.42, 0.62], [0.30, 0.2], [0.10, 0.0], [0.0, -0.05]], 10, GOLD, M_GOLD);
  });
  crystal(b, [0, 56.6, CZ], 1.5, 0.42, CRY_C, [0.72, 0.30], -1);
}

// a faceted crystal: apex up (dir +1) or hanging tip down (dir -1)
function crystal(b, p, h, w, col, mat, dir = 1) {
  const apex = [p[0], p[1] + dir * h, p[2]];
  const tip = [p[0], p[1] - dir * h * 0.35, p[2]];
  const ring = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.3;
    ring.push([p[0] + Math.cos(a) * w, p[1], p[2] + Math.sin(a) * w]);
  }
  for (let i = 0; i < 4; i++) {
    const a = ring[i], c2 = ring[(i + 1) % 4];
    const N1 = norm(vcross(vsub(a, apex), vsub(c2, apex)));
    if (dot3(N1, vsub([p[0], p[1] + dir, p[2]], apex)) < 0) b.tri(apex, c2, a, col, mat, N1);
    else b.tri(apex, a, c2, col, mat, N1);
    const N2 = norm(vcross(vsub(a, tip), vsub(c2, tip)));
    b.tri(tip, a, c2, mulc(col, 0.8), mat, N2);
  }
}

// ---------------------------------------------------------------- star-gazing gallery
function gallery(b, rng) {
  const seg = 36;
  const y = RING_Y, th = 0.26;
  const rIn = RING_IN, rOut = RING_OUT;
  const deckCols = [mixc(STONE, IVORY, 0.35), mixc(STONE_C, IVORY, 0.30), mixc(STONE, GOLD, 0.22)];
  const M_DECK = [0.21, 0.32], M_DECK_UNDER = [0.24, 0.22], M_GLOW_STRIP = [0.50, 0.30];
  // deck slab: top / bottom / inner / outer fascia
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const P = (cc, ss, r, yy) => [cc * r, yy, CZ + ss * r];
    const top = deckCols[i % 3];
    const under = (i % 2 === 0) ? GOLD_B : GOLD;
    b.quad(P(c0, s0, rIn, y), P(c1, s1, rIn, y), P(c1, s1, rOut, y), P(c0, s0, rOut, y), top, M_DECK, [0, 1, 0]);
    b.quad(P(c1, s1, rIn, y - th), P(c0, s0, rIn, y - th), P(c0, s0, rOut, y - th), P(c1, s1, rOut, y - th), under, M_DECK_UNDER, [0, -1, 0]);
    b.quad(P(c0, s0, rOut, y - th), P(c1, s1, rOut, y - th), P(c1, s1, rOut, y), P(c0, s0, rOut, y), GOLD_B, [0.30, 0.55], [c0, 0, s0]);
    b.quad(P(c1, s1, rIn, y - th), P(c0, s0, rIn, y - th), P(c0, s0, rIn, y), P(c1, s1, rIn, y), GOLD_B, [0.30, 0.55], [-c0, 0, -s0]);

    // inlaid gold ring line on the walkway
    if (i % 2 === 0) b.quad(P(c0, s0, 18.2, y + 0.008), P(c1, s1, 18.2, y + 0.008), P(c1, s1, 18.45, y + 0.008), P(c0, s0, 18.45, y + 0.008), GOLD_B, M_GOLD_B, [0, 1, 0]);
  }
  // a narrow structural ring beam, so the gilded soffit stays visible around it
  ringBeam(b, 0, y - th, CZ, 18.15, 19.05, 0.42, seg, GOLD, [0.26, 0.42]);
  // the gilded sunburst: radial gold ribs under the beam, hanging between them
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * TAU + 0.04;
    putR(b, Math.cos(a) * 18.6, y - th - 0.52, CZ + Math.sin(a) * 18.6, Math.PI / 2 - a, () => {
      box(b, 0.13, 0.13, 2.72, GOLD_B, M_GLOW_STRIP);
    });
    // a short radial spoke from the beam down/out, catching light from the floor
    if (i % 3 === 0) put(b, Math.cos(a) * 17.4, y - th - 0.34, CZ + Math.sin(a) * 17.4, () => {
      bar3(b, [0, 0, 0], [0, -0.24, 0], 0.06, 0.06, GOLD_B, M_GLOW_STRIP);
    });
  }
  // inner + outer gold trim under the soffit
  tubeRing(b, [0, y - th - 0.03, CZ], rIn + 0.15, [1, 0, 0], [0, 0, 1], seg, 0.09, GOLD_B, [0.34, 0.5]);
  tubeRing(b, [0, y - th - 0.03, CZ], rOut - 0.15, [1, 0, 0], [0, 0, 1], seg, 0.09, GOLD_B, [0.34, 0.5]);
  tubeRing(b, [0, y + 0.02, CZ], rIn + 0.03, [1, 0, 0], [0, 0, 1], seg, 0.10, GOLD, M_GOLD);
  tubeRing(b, [0, y + 0.02, CZ], rOut - 0.03, [1, 0, 0], [0, 0, 1], seg, 0.10, GOLD, M_GOLD);
  // golden balustrades on both edges
  const railRing = (r, nb) => {
    for (let i = 0; i < nb; i++) {
      const a = (i / nb) * TAU + 0.02;
      put(b, Math.cos(a) * r, y + 0.02, CZ + Math.sin(a) * r, () => {
        cylinder(b, 6, 0.055, 0.045, 0.98, GOLD, M_GOLD, { caps: true });
        cylinder(b, 6, 0.075, 0.075, 0.07, GOLD_B, M_GOLD_B, { y0: 0.94, caps: true });
      });
    }
    tubeRing(b, [0, y + 1.02, CZ], r, [1, 0, 0], [0, 0, 1], seg, 0.075, GOLD_B, M_GOLD_B);
    tubeRing(b, [0, y + 0.34, CZ], r, [1, 0, 0], [0, 0, 1], seg, 0.048, GOLD, M_GOLD);
  };
  railRing(rIn + 0.16, 44);
  railRing(rOut - 0.16, 52);
  // newel posts with glowing finials
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.15;
    for (const r of [rIn + 0.16, rOut - 0.16]) {
      put(b, Math.cos(a) * r, y + 0.02, CZ + Math.sin(a) * r, () => {
        cylinder(b, 6, 0.16, 0.12, 1.30, GOLD_D, M_GOLD, { caps: true });
        sphere(b, 0.20, GOLD_B, M_GLOW_G, { rings: 3, seg: 6, jitter: 0.06 });
      });
    }
  }
  // gold rosettes and glowing pendant orbs on the underside of the deck
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.2;
    put(b, Math.cos(a) * 18.6, y - th - 0.58, CZ + Math.sin(a) * 18.6, () => {
      b.push(RX(Math.PI)); b.push(RX(Math.PI / 2));
      star(b, 0.95, 0.40, 6, 0.10, GOLD_B, [0.55, 0.20]);
      b.pop(); b.pop();
      put(b, 0, -0.10, 0, () => sphere(b, 0.24, GOLD_B, M_GLOW_G, { rings: 3, seg: 6, jitter: 0.05 }));
    });
  }
  // swags of glowing beads between the outer newel posts
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * TAU + 0.15, a1 = a0 + TAU / 8 - 0.10;
    const rr = rOut - 0.30;
    const p0 = [Math.cos(a0) * rr, y + 0.88, CZ + Math.sin(a0) * rr];
    const p1 = [Math.cos(a1) * rr, y + 0.88, CZ + Math.sin(a1) * rr];
    const pts = catenary(p0, p1, 1.55, 12);
    tubePath(b, pts, 0.032, 3, GOLD_D, M_GOLD, { caps: false });
    for (let k = 1; k < pts.length - 1; k++) {
      put(b, pts[k][0], pts[k][1] - 0.10, pts[k][2], () => sphere(b, 0.095 + (k % 3) * 0.012,
        k % 2 ? GOLD_B : mixc(GOLD_B, rgb('#ffe6f2'), 0.55), [0.40, 0.18], { rings: 2, seg: 4, jitter: 0.06 }));
    }
  }
  // glowing pendant orbs hanging under the deck rim (read from the palm house floor)
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + 0.1;
    const rr = (i % 2 === 0) ? rOut - 0.55 : rIn + 0.55;
    const len = (i % 2 === 0) ? 1.5 : 1.15;
    const x = Math.cos(a) * rr, z = CZ + Math.sin(a) * rr;
    chain(b, [x, y - th - 0.48, z], [x, y - th - 0.5 - len, z], 0.035, GOLD, M_GOLD);
    put(b, x, y - th - len - 0.62, z, () => {
      cylinder(b, 6, 0.06, 0.16, 0.16, GOLD, M_GOLD, { caps: true });
      sphere(b, 0.22 + (i % 3) * 0.05, i % 3 === 0 ? GOLD_B : mixc(GOLD_B, rgb('#ffe6f2'), 0.5), M_GLOW_G, { rings: 3, seg: 7, jitter: 0.08 });
    });
  }
  // structural hanger rods to the existing drum-top gallery ring + long cables to the dome
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.3927;
    const p0 = [Math.cos(a) * 18.3, y - 0.42, CZ + Math.sin(a) * 18.3];
    const p1 = [Math.cos(a) * 24.2, 54.95, CZ + Math.sin(a) * 24.2];
    bar3(b, p0, p1, 0.13, 0.13, GOLD, M_GOLD);
    // small bracket where it meets the drum-top gallery
    put(b, p1[0], p1[1], p1[2], () => box(b, 0.42, 0.30, 0.42, GOLD_D, M_GOLD));
    const top = domeAnchor(a, 18.3, 0.50).p;
    cable(b, [p0[0], p0[1] + 0.05, p0[2]], top, 0.052, GOLD_D);
  }
  // under-deck decorative brackets
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU + 0.1;
    const p0 = [Math.cos(a) * (rOut - 0.1), y - th, CZ + Math.sin(a) * (rOut - 0.1)];
    const p1 = [Math.cos(a) * (rIn + 0.3), y - th - 1.1, CZ + Math.sin(a) * (rIn + 0.3)];
    bar3(b, p0, p1, 0.09, 0.09, GOLD_D, M_GOLD);
  }
  // four telescopes
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.85;
    putR(b, Math.cos(a) * 18.2, y + 0.02, CZ + Math.sin(a) * 18.2, Math.PI / 2 - a, () => telescope(b));
  }
  // lantern posts around the outer rail (billboards added in lights())
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.05;
    put(b, Math.cos(a) * (rOut - 0.45), y + 0.02, CZ + Math.sin(a) * (rOut - 0.45), () => {
      cylinder(b, 6, 0.10, 0.08, 2.05, GOLD_D, M_GOLD, { caps: true });
      put(b, 0, 2.10, 0, () => {
        cylinder(b, 8, 0.30, 0.14, 0.42, GOLD, M_GOLD, { caps: true });
        sphere(b, 0.20, GOLD_B, M_GLOW_G, { rings: 3, seg: 7, jitter: 0.05 });
        cylinder(b, 8, 0.10, 0.24, 0.20, GOLD, M_GOLD, { y0: 0.56, caps: true });
      });
    });
  }
  // star medallions let into the walkway
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.55;
    put(b, Math.cos(a) * 18.3, y + 0.012, CZ + Math.sin(a) * 18.3, () => {
      b.push(RX(Math.PI / 2));
      star(b, 0.42, 0.17, 5, 0.06, GOLD_B, M_GLOW_G);
      b.pop();
    });
  }
  return rng;
}

function telescope(b) {
  // pedestal + yoke + long gilded tube (local +Z points outward/up)
  put(b, 0, 0.02, 0, () => {
    cylinder(b, 8, 0.30, 0.20, 0.92, GOLD_D, M_GOLD, { caps: true });
    put(b, 0, 0.92, 0, () => cylinder(b, 8, 0.26, 0.26, 0.14, GOLD, M_GOLD_B, { caps: true }));
  });
  for (const sx of [-1, 1]) bar3(b, [sx * 0.20, 1.0, 0], [sx * 0.20, 1.42, 0], 0.10, 0.12, GOLD, M_GOLD);
  put(b, 0, 1.24, 0.10, () => {
    b.push(RX(0.95));
    cylinder(b, 10, 0.24, 0.32, 2.95, GOLD_B, M_ARM_B, { y0: 0, caps: true });
    torus(b, 0.33, 0.065, 10, 3, GOLD, M_GOLD, 'y');
    b.pop();
  });
  put(b, 0, 1.24, 0.10, () => {
    b.push(RX(0.95));
    cylinder(b, 8, 0.11, 0.13, 0.34, BRASS, M_BRASS, { y0: 0.34, caps: true });
    b.pop();
  });
  put(b, 0, 1.2, -0.34, () => sphere(b, 0.16, GOLD_D, M_GOLD, { rings: 3, seg: 6, jitter: 0.1 }));
}

// ---------------------------------------------------------------- floating islets
// faceted floating-island rock (own builder so the underside can carry a lifted material)
function islandRock(b, radius, height, rng, colTop, colBot, mat) {
  const rings = 7, seg = 13;
  const pts = [];
  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    const y = -height * Math.pow(t, 1.2);
    const rad = radius * Math.pow(1 - t, 0.78);
    const ring = [];
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * TAU;
      const rr = rad * (1 + (rng() - 0.5) * 0.30);
      ring.push([Math.cos(a) * rr, y + (rng() - 0.5) * height * 0.06, Math.sin(a) * rr]);
    }
    pts.push(ring);
  }
  for (let r = 0; r < rings; r++) {
    const c = mixc(colTop, colBot, Math.min(1, (r / rings) * 1.4));
    for (let i = 0; i < seg; i++) {
      const i1 = (i + 1) % seg;
      const a = pts[r][i], bb = pts[r][i1], cc = pts[r + 1][i1], d = pts[r + 1][i];
      const shade = 0.86 + 0.14 * Math.cos((i / seg) * TAU - 0.7);
      b.quad(a, bb, cc, d, mulc(c, shade), mat);
    }
  }
  for (let s = 0; s < 4; s++) {
    const a = rng() * TAU;
    const rr = radius * (0.2 + rng() * 0.5);
    const yTop = -height * (0.15 + rng() * 0.4);
    const len = height * (0.25 + rng() * 0.4);
    const tip = [Math.cos(a) * rr * 0.75, yTop - len, Math.sin(a) * rr * 0.75];
    const w = radius * 0.10;
    for (let k = 0; k < 4; k++) {
      const a0 = (k / 4) * TAU, a1 = ((k + 1) / 4) * TAU;
      const p0 = [Math.cos(a) * rr + Math.cos(a0) * w, yTop, Math.sin(a) * rr + Math.sin(a0) * w];
      const p1 = [Math.cos(a) * rr + Math.cos(a1) * w, yTop, Math.sin(a) * rr + Math.sin(a1) * w];
      b.tri(p0, p1, tip, mulc(colBot, 0.92), mat);
    }
  }
}
export function isletSpots() {
  return [
    { a: 0.55, r: 22.0, y: 66.6, s: 1.12 },
    { a: 2.35, r: 20.8, y: 71.6, s: 0.86 },
    { a: 3.95, r: 22.4, y: 68.4, s: 1.02 },
    { a: 5.35, r: 20.4, y: 63.6, s: 0.78 },
  ];
}
function islet(b, spot, rng) {
  const { a, r, y, s } = spot;
  const cx = px(a, r), cz = pz(a, r);
  put(b, cx, y, cz, () => {
    islandRock(b, 3.2 * s, 4.3 * s, rng, mixc(MOSS, LEAF, 0.35), rgb('#b4a184'), [0.17, 0.07]);
    // luminous gold rim where the mossy top meets the rock
    put(b, 0, -0.10, 0, () => torus(b, 3.08 * s, 0.10, 14, 3, GOLD, [0.26, 0.55], 'y'));
    // grassy top + soil rim
    disc(b, 3.06 * s, 14, mixc(LEAF, LAWN, 0.45), [0.17, 0.09]);
    put(b, 0, 0.03, 0, () => torus(b, 3.06 * s, 0.14, 14, 3, rgb('#7a6a52'), M_STONE));
    // a little stone plinth + glowing fruit tree
    cylinder(b, 8, 0.52 * s, 0.40 * s, 0.36 * s, STONE, M_STONE, { caps: true });
    const trunkPts = [[0, 0.3 * s, 0], [0.12 * s, 1.5 * s, 0.06 * s], [0.06 * s, 2.5 * s, -0.05 * s]];
    tubePath(b, trunkPts, (t) => 0.17 * s * (1 - 0.4 * t), 5, rgb('#8a6a42'), M_WOOD);
    put(b, 0.06 * s, 2.5 * s - 0.05 * s, -0.05 * s, () => {
      sphere(b, 1.02 * s, mixc(LEAF, LEAF_L, 0.35), M_LEAF, { rings: 4, seg: 8, jitter: 0.28, seed: 3 });
      put(b, 0.55 * s, 0.5 * s, 0.2 * s, () => sphere(b, 0.62 * s, LEAF_L, M_LEAF, { rings: 3, seg: 7, jitter: 0.26, seed: 5 }));
      put(b, -0.5 * s, 0.34 * s, -0.25 * s, () => sphere(b, 0.55 * s, LEAF_D, M_LEAF, { rings: 3, seg: 7, jitter: 0.26, seed: 7 }));
    });
    // glowing fruit
    for (let i = 0; i < 6; i++) {
      const aa = rng() * TAU, rr = (0.3 + rng() * 0.75) * s;
      put(b, Math.cos(aa) * rr, (2.2 + rng() * 0.9) * s, Math.sin(aa) * rr, () => {
        sphere(b, 0.13 * s + 0.05, mixc(GOLD_B, rgb('#ffb3c8'), rng() * 0.7), [0.80, 0.10], { rings: 2, seg: 5, jitter: 0.1 });
      });
    }
    // small flowering tufts
    for (let i = 0; i < 5; i++) {
      const aa = rng() * TAU, rr = (0.8 + rng() * 1.6) * s;
      put(b, Math.cos(aa) * rr, 0.06, Math.sin(aa) * rr, () => {
        for (let k = 0; k < 3; k++) {
          const ab = (k / 3) * TAU + rng();
          b.quad([0, 0, 0], [Math.cos(ab) * 0.3 * s, 0.42 * s, Math.sin(ab) * 0.3 * s],
            [Math.cos(ab) * 0.55 * s, 0.30 * s, Math.sin(ab) * 0.55 * s], [Math.cos(ab - 0.4) * 0.18 * s, 0.06, Math.sin(ab - 0.4) * 0.18 * s],
            mixc(LEAF_L, LAWN, rng()), M_LEAF);
        }
        sphere(b, 0.14 * s, mixc(C.bloomPink, GOLD_B, rng()), [0.55, 0.10], { rings: 2, seg: 5, jitter: 0.1 });
      });
    }
    // hanging roots and creepers under the rock, with luminous berries
    for (let i = 0; i < 7; i++) {
      const aa = rng() * TAU, rr = (1.0 + rng() * 1.7) * s;
      const x0 = Math.cos(aa) * rr, z0 = Math.sin(aa) * rr;
      const len = (1.6 + rng() * 2.8) * s;
      const pts = [[x0, -0.5 * s, z0], [x0 * 1.08, -0.5 * s - len * 0.55, z0 * 1.08], [x0 * 1.18, -0.5 * s - len, z0 * 1.18]];
      tubePath(b, pts, (t) => 0.075 * s * (1 - t * 0.5), 3, LEAF_D, M_LEAF);
      const tip = pts[2];
      put(b, tip[0], tip[1], tip[2], () => sphere(b, 0.15 * s, mixc(GOLD_B, rgb('#ffb3c8'), rng() * 0.6), [0.85, 0.10], { rings: 2, seg: 5, jitter: 0.1 }));
      if (rng() > 0.45) put(b, (pts[1][0] + tip[0]) / 2, (pts[1][1] + tip[1]) / 2, (pts[1][2] + tip[2]) / 2, () => {
        sphere(b, 0.12 * s, GOLD_B, [0.80, 0.10], { rings: 2, seg: 5, jitter: 0.1 });
      });
    }
  });
  // three chains up to the painted dome
  for (let k = -1; k <= 1; k++) {
    const aa = a + k * 0.10;
    const from = [cx + Math.cos(aa) * 1.15 * s, y + 0.20, cz + Math.sin(aa) * 1.15 * s];
    const to = domeAnchor(aa, r * 0.93, 0.50).p;
    cable(b, from, to, 0.055, GOLD_D);
  }
  // fireflies / blossom sprites around the islet
  return { cx, cz };
}

// ---------------------------------------------------------------- hanging ornaments
export function ornamentSpots() {
  return [
    { kind: 'crescent', a: 1.05, r: 13.6, y: 84.5, s: 1.65 },
    { kind: 'crescent', a: 3.55, r: 10.2, y: 90.5, s: 0.95 },
    { kind: 'crystal', a: 4.45, r: 15.5, y: 70.5, s: 1.0 },
    { kind: 'star', a: 2.85, r: 11.0, y: 64.5, s: 1.0 },
    { kind: 'pearl', a: 5.75, r: 17.8, y: 76.5, s: 1.0 },
    { kind: 'star', a: 1.75, r: 18.6, y: 59.8, s: 0.9 },
    { kind: 'crystal', a: 0.15, r: 19.2, y: 65.2, s: 0.85 },
    { kind: 'crescent', a: 5.15, r: 12.6, y: 71.8, s: 0.72 },
  ];
}
function ornament(b, o) {
  const { a, r, y, s } = o;
  const x = px(a, r), z = pz(a, r);
  let hangTop = y + 1.0 * s;
  if (o.kind === 'crescent') {
    const R = 1.55 * s, ri = 1.42 * s, off = 0.46 * s;
    const e1 = [Math.cos(a), 0, Math.sin(a)];     // radial (the way the moon faces)
    const e2 = [0, 1, 0];                        // up
    const e3 = [-Math.sin(a), 0, Math.cos(a)];   // tangential (in the moon's plane)
    crescentAt(b, [x, y, z], e3, e2, e1, R, ri, off, 0.24, MOON, [0.58, 0.50], GOLD_B);
    put(b, x, y + R, z, () => torus(b, 0.16 * s, 0.06 * s, 8, 3, GOLD_B, M_GLOW_G, 'z'));
    hangTop = y + R + 0.4;
  } else if (o.kind === 'crystal') {
    put(b, x, y, z, () => {
      cylinder(b, 8, 0.42, 0.30, 0.16, GOLD, M_GOLD, { caps: true });
      for (let i = 0; i < 5; i++) {
        const aa = (i / 5) * TAU + 0.4, rr = (0.18 + 0.16 * (i % 2)) * s;
        const hh = (1.4 + (i % 3) * 0.7) * s;
        crystal(b, [Math.cos(aa) * rr, 0.05, Math.sin(aa) * rr], hh, 0.26 * s, mixc(CRY_V, CRY_C, (i % 3) / 2), [0.68, 0.55]);
      }
      crystal(b, [0, 0.05, 0], 2.6 * s, 0.42 * s, CRY_C, [0.75, 0.60]);
    });
    hangTop = y + 2.7 * s;
  } else if (o.kind === 'star') {
    put(b, x, y, z, () => {
      torus(b, 0.72 * s, 0.055 * s, 12, 3, GOLD_D, M_GOLD, 'y');
      put(b, 0, 0.62 * s, 0, () => torus(b, 0.72 * s, 0.055 * s, 12, 3, GOLD_D, M_GOLD, 'y'));
      for (let i = 0; i < 6; i++) {
        const aa = (i / 6) * TAU;
        bar3(b, [Math.cos(aa) * 0.72 * s, 0.62 * s, Math.sin(aa) * 0.72 * s],
          [Math.cos(aa) * 0.72 * s, 0, Math.sin(aa) * 0.72 * s], 0.05, 0.05, GOLD, M_GOLD);
      }
      put(b, 0, 0.31 * s, 0, () => {
        sphere(b, 0.30 * s, GOLD_B, [0.92, 0.2], { rings: 3, seg: 7, jitter: 0.1 });
        b.push(RX(Math.PI / 2));
        star(b, 0.62 * s, 0.24 * s, 4, 0.09, GOLD_B, [0.85, 0.2]);
        b.pop();
      });
    });
    hangTop = y + 0.9 * s;
  } else {
    // pearl moon: glowing orb in a gold filigree cage
    put(b, x, y, z, () => {
      sphere(b, 0.82 * s, MOON, [0.62, 0.70], { rings: 4, seg: 9, jitter: 0.04 });
      b.push(RX(1.1)); torus(b, 1.12 * s, 0.07 * s, 16, 3, GOLD_B, M_GOLD_B, 'y'); b.pop();
      b.push(RZ(0.7)); torus(b, 1.12 * s, 0.07 * s, 16, 3, GOLD, M_GOLD, 'y'); b.pop();
    });
    hangTop = y + 0.9 * s;
  }
  // single chain back to the painted dome
  const to = domeAnchor(a, r * 0.96, 0.50).p;
  cable(b, [x, hangTop, z], to, 0.06, GOLD_D);
}

// a crescent moon in an arbitrary plane: p = c + e1*u + e2*v +- e3*h.
// The crescent is the region between the outer circle (R) and an offset inner circle.
function crescentAt(b, c, e1, e2, e3, R, ri, off, thick, col, mat, edgeCol) {
  const N = 14, h = thick / 2;
  const O = [], I = [];
  for (let i = 0; i <= N; i++) {
    const t = Math.PI * 0.5 + (i / N) * Math.PI;
    O.push([Math.cos(t) * R, Math.sin(t) * R]);
    I.push([off + Math.cos(t) * ri, Math.sin(t) * ri]);
  }
  const P = (p, z) => [
    c[0] + e1[0] * p[0] + e2[0] * p[1] + e3[0] * z,
    c[1] + e1[1] * p[0] + e2[1] * p[1] + e3[1] * z,
    c[2] + e1[2] * p[0] + e2[2] * p[1] + e3[2] * z,
  ];
  for (let i = 0; i < N; i++) {
    b.quad(P(O[i], h), P(I[i], h), P(I[i + 1], h), P(O[i + 1], h), col, mat, e3);
    b.quad(P(I[i], -h), P(O[i], -h), P(O[i + 1], -h), P(I[i + 1], -h), mulc(col, 0.82), mat, [-e3[0], -e3[1], -e3[2]]);
    const nO = norm([(I[i][0] - O[i][0]) * e1[0] + (I[i][1] - O[i][1]) * e2[0],
      (I[i][0] - O[i][0]) * e1[1] + (I[i][1] - O[i][1]) * e2[1],
      (I[i][0] - O[i][0]) * e1[2] + (I[i][1] - O[i][1]) * e2[2]]);
    b.quad(P(O[i], -h), P(O[i], h), P(O[i + 1], h), P(O[i + 1], -h), edgeCol, mat, nO);
    const nI = norm([(O[i + 1][0] - I[i + 1][0]) * e1[0] + (O[i + 1][1] - I[i + 1][1]) * e2[0],
      (O[i + 1][0] - I[i + 1][0]) * e1[1] + (O[i + 1][1] - I[i + 1][1]) * e2[1],
      (O[i + 1][0] - I[i + 1][0]) * e1[2] + (O[i + 1][1] - I[i + 1][1]) * e2[2]]);
    b.quad(P(I[i + 1], -h), P(I[i + 1], h), P(I[i], h), P(I[i], -h), mulc(edgeCol, 0.9), mat, nI);
  }
}

// ---------------------------------------------------------------- hanger bookkeeping
// Every floating object exposes the chain segments that hold it, so the check can
// prove each of them is actually connected.
export function orbitalHangers() {
  const out = [];
  // gallery: 8 cantilever rods + 8 cables to the dome
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.3927;
    const p0 = [Math.cos(a) * 18.3, RING_Y - 0.42, CZ + Math.sin(a) * 18.3];
    const p1 = [Math.cos(a) * 24.2, 54.95, CZ + Math.sin(a) * 24.2];
    out.push({ name: 'gallery-rod-' + i, from: p0, to: p1, kind: 'rod' });
    out.push({ name: 'gallery-cable-' + i, from: [p0[0], p0[1] + 0.05, p0[2]], to: domeAnchor(a, 18.3, 0.50).p, kind: 'cable' });
  }
  // islets: 3 chains each
  for (const spot of isletSpots()) {
    const cx = px(spot.a, spot.r), cz = pz(spot.a, spot.r);
    for (let k = -1; k <= 1; k++) {
      const aa = spot.a + k * 0.10;
      out.push({
        name: 'islet-' + spot.a.toFixed(2) + '-chain-' + (k + 1),
        from: [cx + Math.cos(aa) * 1.15 * spot.s, spot.y + 0.20, cz + Math.sin(aa) * 1.15 * spot.s],
        to: domeAnchor(aa, spot.r * 0.93, 0.50).p, kind: 'cable',
      });
    }
  }
  // armillary crown: 4 chains from the crow's nest to the dome apex region
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.3;
    out.push({
      name: 'armillary-chain-' + i,
      from: [Math.cos(a) * 2.3, 97.2, CZ + Math.sin(a) * 2.3],
      to: domeAnchor(a, 6.4, 0.50).p, kind: 'cable',
    });
  }
  // ornaments: one chain each
  for (const o of ornamentSpots()) {
    const x = px(o.a, o.r), z = pz(o.a, o.r);
    const topY = o.kind === 'crescent' ? o.y + 1.55 * o.s + 0.4
      : o.kind === 'crystal' ? o.y + 2.7 * o.s
      : o.kind === 'star' ? o.y + 0.9 * o.s : o.y + 0.9 * o.s;
    out.push({ name: 'ornament-' + o.kind + '-' + o.a.toFixed(2), from: [x, topY, z], to: domeAnchor(o.a, o.r * 0.96, 0.50).p, kind: 'cable' });
  }
  return out;
}

// ---------------------------------------------------------------- lights / sprites
// Point lights added by this module.  The round-6 glass-dome check counts the glass
// palace point lights (8 = 3 porch + 5 palm house); the lead adds ORB_POINTS to that
// assertion during integration.  Kept to three: the sun, the gallery, the crystal.
export const ORB_POINTS = 3;
function pointLights(ctx) {
  if (!ctx || !ctx.points) return;
  const A = L.glassPalace;
  const ca = Math.cos(A.rot), sa = Math.sin(A.rot);
  const wp = (x, y, z) => [A.x + ca * x - sa * z, y, A.z + sa * x + ca * z];
  const pts = [
    [0, Y_ARM, CZ, GOLD_B, 72, 0.95],            // the armillary sun
    [0, 50.2, CZ, GOLD_B, 48, 0.85],             // under the star gallery (lights its gilded soffit)
    [px(4.45, 15.5), 71.5, pz(4.45, 15.5), CRY_V, 24, 0.35],   // the crystal cluster
  ];
  for (const p of pts) ctx.points.push({ p: wp(p[0], p[1], p[2]), col: p[3], range: p[4], int: p[5] });
}
function lights(ctx) {
  if (!ctx) return;
  const A = L.glassPalace;
  const ca = Math.cos(A.rot), sa = Math.sin(A.rot);
  const wp = (x, y, z) => [A.x + ca * x - sa * z, y, A.z + sa * x + ca * z];
  pointLights(ctx);
  const L2 = ctx.lanterns;   // static billboards: {p,size,rot,alpha,shape,col}
  if (!L2) return;
  const push = (x, y, z, size, alpha, shape, col) => L2.push({ p: wp(x, y, z), size, rot: 0, alpha, shape, col });
  // armillary sun halo
  push(0, Y_ARM, CZ, 15.0, 0.24, 1, GOLD_B);
  push(0, Y_ARM, CZ, 6.5, 0.40, 1, rgb('#fff0c8'));
  // planets as small coloured motes
  for (const o of [[0.55, 4.6], [2.35, 5.7], [4.05, 6.8], [5.35, 8.0]]) {
    push(Math.cos(o[0]) * o[1], Y_ARM + 0.4, CZ + Math.sin(o[0]) * o[1], 2.4, 0.5, 0, mixc(GOLD_B, rgb('#ff9fc4'), 0.5));
  }
  // nebulae + star glows painted while the sky chart was built (soft smoke puffs)
  for (const nb of SKY.nebula) {
    const p = domeSurf(nb.a, nb.phi, 1.4).p;
    push(p[0], p[1], p[2], nb.size, nb.alpha, 6, nb.col);
  }
  for (const sp of SKY.sparks) {
    const p = domeSurf(sp.a, sp.phi, 0.9).p;
    push(p[0], p[1], p[2], sp.size, sp.alpha, 0, sp.col);
  }
  // warm glow washing the gilded underside of the gallery
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.35;
    push(Math.cos(a) * 18.3, RING_Y - 1.6, CZ + Math.sin(a) * 18.3, 7.0, 0.20, 1, GOLD_B);
  }
  // gallery lamps
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.05;
    push(Math.cos(a) * (RING_OUT - 0.45), RING_Y + 2.2, CZ + Math.sin(a) * (RING_OUT - 0.45), 3.6, 0.55, 1, GOLD_B);
  }
  // crystals / moons / islet fireflies
  for (const o of ornamentSpots()) {
    const col = o.kind === 'crystal' ? CRY_C : o.kind === 'crescent' ? MOON : GOLD_B;
    push(px(o.a, o.r), o.y + 0.4, pz(o.a, o.r), 3.0 + o.s, 0.42, 1, col);
    if (o.kind === 'star') push(px(o.a, o.r), o.y + 0.35, pz(o.a, o.r), 4.4, 0.55, 0, GOLD_B);
    if (o.kind === 'crescent') push(px(o.a, o.r), o.y + 0.2, pz(o.a, o.r), 5.0, 0.30, 1, MOON);
  }
  for (const spot of isletSpots()) {
    const cx = px(spot.a, spot.r), cz = pz(spot.a, spot.r);
    push(cx, spot.y - 2.6, cz, 7.0 * spot.s, 0.20, 5, mixc(LEAF, LEAF_L, 0.4));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + spot.a;
      push(cx + Math.cos(a) * 2.2 * spot.s, spot.y + 1.6 + i * 0.5, cz + Math.sin(a) * 2.2 * spot.s, 1.5, 0.55, 0, rgb('#ffe6a8'));
    }
  }
  // a few drifting motes under the gallery
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.4;
    push(Math.cos(a) * 19.0, RING_Y - 2.2, CZ + Math.sin(a) * 19.0, 2.2, 0.3, 0, rgb('#dff3ff'));
  }
}

// ---------------------------------------------------------------- build
export function buildGlassOrbital(b, ctx) {
  const t0 = b.i.length / 3;
  const rng = mulberry32(SEED);
  const A = L.glassPalace;
  const ca = Math.cos(A.rot), sa = Math.sin(A.rot);
  void ca; void sa;

  // 1. the painted cosmos on the dome
  const stars = skyChart(b, rng);
  // 2. gallery + armillary + floating islets + hanging ornaments
  gallery(b, rng);
  armillary(b);
  for (const spot of isletSpots()) islet(b, spot, rng);
  for (const o of ornamentSpots()) ornament(b, o);
  // 3. sprites / halos
  lights(ctx);

  const tris = b.i.length / 3 - t0;
  const summary = {
    tris,
    stars: stars.length,
    constellations: N_CONST,
    islets: isletSpots().length,
    telescopes: 4,
    ornaments: ornamentSpots().length,
    hangers: orbitalHangers().length,
    pointLights: ORB_POINTS,
  };
  if (ctx) ctx.orbital = summary;
  return summary;
}

export const ORBITAL = {
  SEED, CZ, DOME_Y, DOME_RX, DOME_RY, DRUM_RIN, MARGIN,
  armillary: { centre: [0, Y_ARM, CZ], outerR: 10.4 },
  gallery: { y: RING_Y, rIn: RING_IN, rOut: RING_OUT },
  starCount: N_STARS, constellationCount: N_CONST, pointLights: ORB_POINTS,
};
