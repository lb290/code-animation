// RAIL — the elevated SILVER-STEEL viaduct and the Belle-Époque steam express on it.
// OWNER: agents "whale" (viaduct, round 8) / "train" (train, round 9).
//
//   buildRailway(b, ctx, rng) -> void
//
// Static part: the viaduct (lattice steel piers every 26 m, riveted truss deck,
// two rails, sleepers) following L.railLoop at deck height L.railY, plus lamp
// posts and a signal gantry. Goes into the shared merged mesh via b.
// Dynamic part (round 9): a deep-navy/brass steam locomotive + three double-decked
// coaches as dynamic meshes in ctx.dyn (kind:'model'), following L.railLoop by arc
// length; boiler steam / headlamp glow / brake embers go into ctx.bbDyn as billboards.
import { C } from './palette.js';
import { MT, catmullPts, boxAt, disc, ellipsoid } from './lib3d.js';
import { B, rgb, mulc, mixc, cylinder, lathe } from './geo.js';
import { mesh } from './gl.js';
import { trs } from './actor.js';
import { L } from './layout.js';
import { m4, TAU, clamp, norm, sub, add as vadd, scale as vs, cross, dot, mulberry32 } from './math.js';

// local palette — round 8: the viaduct is now bright silver steel (it used to be
// weathered iron with rust streaks).  Four silver tones + a cyan energy accent.
const S_HI = rgb('#f1f8ff');     // chrome / polished highlight
const S_LIT = rgb('#d6e2ef');    // lit silver face
const S_MID = rgb('#b0c0d2');    // silver body / structure
const S_SH = rgb('#8496ac');     // silver in shade
const S_DEEP = rgb('#5b6b81');   // deep steel (deck underside, blind recesses)
const STEEL = S_MID;
const STEEL_LIT = S_LIT;
const RUST = S_SH;
const RUST2 = S_MID;
const SLEEPER = rgb('#9dabbd');
const RAILHEAD = rgb('#f4f9ff');
const LAMPWARM = rgb('#d4f0ff');   // cool platform light
const GLOWC = rgb('#7fe6ff');      // cyan energy line
const STONE = C.stoneCool;

// ---- round 9: Belle-Époque express liveries ------------------------------
// ref: 素材/图片/幻想城市/高架铁轨火车/56838246_p0.jpg — near-black navy body,
// brass/gold banding on every seam, warm lit windows behind gold frames.
const TC = {
  navy:    rgb('#33415f'),   // body navy — deep but never a black hole in daylight
  navyLit: rgb('#4d6394'),   // sun-facing navy panel / roof shoulder
  navyDk:  rgb('#202a3d'),   // shadowed navy (underframe, blinds)
  steel:   rgb('#46505f'),   // boiler jacket blue-steel
  iron:    rgb('#2b3341'),   // smokebox / frame / underframe
  black:   rgb('#141924'),   // coal, tyre tread
  brass:   rgb('#b3813a'),   // aged brass
  brassHi: rgb('#e3b662'),   // polished brass band / handrail
  gold:    rgb('#e9b661'),
  goldHi:  rgb('#ffe0a8'),
  goldDk:  rgb('#96702c'),
  copper:  rgb('#a5623a'),
  glassW:  rgb('#e0a251'),   // lower-deck window (warm lamp light)
  glassDk: rgb('#54749c'),   // window with no lamp behind it (sky reflection)
  glassU:  rgb('#7fa8d2'),   // upper-deck window (cooler sky reflection)
  red:     rgb('#8c3128'),   // buffer beam / driver web
  cream:   rgb('#e7d9b8'),
  lamp:    rgb('#fff6d6'),
  steam:   rgb('#f3f7fc'),
};
// [emissive, gloss]. Windows are small, so 0.18–0.26 reads as "lit" without
// pushing the project-wide emissive baseline (large areas stay ≤0.12).
const TM = {
  hull:    [0.045, 0.42],
  hullHi:  [0.055, 0.60],
  brass:   [0.07, 0.82],
  gold:    [0.10, 0.88],
  iron:    [0.00, 0.28],
  glass:   [0.15, 0.58],
  glassDk: [0.03, 0.70],
  glassU:  [0.10, 0.64],
  glow:    [0.92, 0.00],
  coal:    [0.00, 0.14],
};


const HALF = 3.3;          // deck half width
const DECK_T = 1.25;       // deck slab thickness
const TRUSS_D = 4.4;       // truss girder depth under the deck
const STEP = 4.2;          // deck segment length

// ------------------------------------------------------------------ path
function makeLoop(ctrl) {
  const raw = catmullPts(ctrl, 1500, true);
  raw.push(raw[0].slice());
  const cum = [0];
  for (let i = 1; i < raw.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][2] - raw[i - 1][2]));
  }
  const total = cum[cum.length - 1];
  const at = (sIn) => {
    let s = sIn % total;
    if (s < 0) s += total;
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= s) lo = mid; else hi = mid;
    }
    const span = Math.max(1e-6, cum[hi] - cum[lo]);
    const f = clamp((s - cum[lo]) / span, 0, 1);
    const a = raw[lo], b = raw[hi];
    const p = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    let d = [b[0] - a[0], 0, b[2] - a[2]];
    if (Math.hypot(d[0], d[2]) < 1e-5) d = [0, 0, 1];
    const t = norm(d);
    const side = norm(cross([0, 1, 0], t));
    return { p, t, side, s };
  };
  const frameAt = (s) => {
    const a = at(s - 1.6), b = at(s + 1.6), c = at(s);
    let d = [b.p[0] - a.p[0], 0, b.p[2] - a.p[2]];
    if (Math.hypot(d[0], d[2]) < 1e-5) d = [0, 0, 1];
    const t = norm(d);
    return { p: c.p, t, side: norm(cross([0, 1, 0], t)), s };
  };
  return { at, frameAt, total };
}

// ------------------------------------------------------------------ static viaduct
function buildDeck(b, loop) {
  const Y = L.railY;
  const N = Math.max(8, Math.round(loop.total / STEP));
  const step = loop.total / N;
  const pts = [];
  for (let i = 0; i < N; i++) pts.push(loop.frameAt(i * step));
  const deckTop = mulc(STEEL_LIT, 0.84);        // brushed steel deck plate
  const deckBot = mulc(S_DEEP, 0.95);
  const fascia = mixc2(S_LIT, S_MID, 0.28);
  for (let i = 0; i < N; i++) {
    const A = pts[i], Bp = pts[(i + 1) % N];
    const al = vadd(A.p, vs(A.side, HALF)), ar = sub(A.p, vs(A.side, HALF));
    const bl = vadd(Bp.p, vs(Bp.side, HALF)), br = sub(Bp.p, vs(Bp.side, HALF));
    // deck top / bottom
    b.quad(al, ar, br, bl, deckTop, MT.stone, [0, 1, 0]);
    const al2 = [al[0], Y - DECK_T, al[2]], ar2 = [ar[0], Y - DECK_T, ar[2]];
    const bl2 = [bl[0], Y - DECK_T, bl[2]], br2 = [br[0], Y - DECK_T, br[2]];
    b.quad(al2, ar2, br2, bl2, deckBot, MT.matte, [0, -1, 0]);
    // deck sides
    b.quad(al, bl, bl2, al2, mulc(STEEL_LIT, 0.95), MT.matte, A.side);
    b.quad(ar, ar2, br2, br, mulc(STEEL_LIT, 0.82), MT.matte, vs(A.side, -1));
    // protruding cornice band (the bright line along the viaduct)
    for (const sgn of [1, -1]) {
      const sa = sgn > 0 ? A.side : vs(A.side, -1);
      const sb = sgn > 0 ? Bp.side : vs(Bp.side, -1);
      const e0 = sgn > 0 ? al : ar, e1 = sgn > 0 ? bl : br;
      const o0 = vadd(e0, vs(sa, 0.24)), o1 = vadd(e1, vs(sb, 0.24));
      const o0a = [o0[0], Y - 0.62, o0[2]], o1a = [o1[0], Y - 0.62, o1[2]];
      const o0b = [o0[0], Y - 1.28, o0[2]], o1b = [o1[0], Y - 1.28, o1[2]];
      b.quad(o0, o1, o1a, o0a, mulc(fascia, 1.12), MT.gloss, [0, 1, 0]);
      b.quad(o0a, o1a, o1b, o0b, fascia, MT.matte, sa);
      // round 8: a recessed cyan energy line all the way round the viaduct
      const le0 = [e0[0] + sa[0] * 0.035, Y - 1.36, e0[2] + sa[2] * 0.035];
      const le1 = [e1[0] + sb[0] * 0.035, Y - 1.36, e1[2] + sb[2] * 0.035];
      b.quad(le0, le1, [le1[0], Y - 1.52, le1[2]], [le0[0], Y - 1.52, le0[2]], GLOWC, MT.glow, sa);
    }
    // rails
    for (const rSign of [1, -1]) {
      const off = 0.78 * rSign;
      const c0 = vadd(A.p, vs(A.side, off)), c1 = vadd(Bp.p, vs(Bp.side, off));
      const y0 = Y + 0.30, y1 = Y + 0.08;
      const w = 0.085;
      const a0 = [c0[0] + A.side[0] * w, y0, c0[2] + A.side[2] * w];
      const a1 = [c0[0] - A.side[0] * w, y0, c0[2] - A.side[2] * w];
      const b0 = [c1[0] + Bp.side[0] * w, y0, c1[2] + Bp.side[2] * w];
      const b1 = [c1[0] - Bp.side[0] * w, y0, c1[2] - Bp.side[2] * w];
      b.quad(a0, a1, b1, b0, RAILHEAD, MT.metal, [0, 1, 0]);
      const a2 = [a0[0], y1, a0[2]], b2 = [b0[0], y1, b0[2]];
      const a3 = [a1[0], y1, a1[2]], b3 = [b1[0], y1, b1[2]];
      b.quad(a0, b0, b2, a2, mulc(RAILHEAD, 0.92), MT.metal, A.side);
      b.quad(a1, a3, b3, b1, mulc(RAILHEAD, 0.8), MT.metal, vs(A.side, -1));
    }
    // sleeper (one per segment, enough at this scale)
    if (i % 1 === 0) {
      const sA = vadd(A.p, vs(A.side, 1.55)), sB = sub(A.p, vs(A.side, 1.55));
      const sy = Y + 0.1;
      b.quad([sA[0], sy, sA[2]], [sB[0], sy, sB[2]],
        [sB[0] + Bp.t[0] * 0.55, sy, sB[2] + Bp.t[2] * 0.55],
        [sA[0] + Bp.t[0] * 0.55, sy, sA[2] + Bp.t[2] * 0.55], SLEEPER, MT.matte, [0, 1, 0]);
    }
    // ---- truss girder under the deck edge
    for (const sgn of [1, -1]) {
      const sd = sgn > 0 ? 1 : -1;
      const eA = vadd(A.p, vs(A.side, (HALF - 0.12) * sd));
      const eB = vadd(Bp.p, vs(Bp.side, (HALF - 0.12) * sd));
      const nrm2 = vs(A.side, sd);
      const tA = Y - DECK_T - 0.15, bA = Y - DECK_T - TRUSS_D;
      const oA = vadd(eA, vs(nrm2, 0.3)), oB = vadd(eB, vs(vs(Bp.side, sd), 0.3));
      // top chord
      b.quad([eA[0], tA, eA[2]], [oA[0], tA, oA[2]], [oB[0], tA, oB[2]], [eB[0], tA, eB[2]], mulc(STEEL_LIT, 1.05), MT.matte, [0, 1, 0]);
      b.quad([eA[0], tA, eA[2]], [eB[0], tA, eB[2]], [oB[0], tA - 0.62, oB[2]], [oA[0], tA - 0.62, oA[2]], STEEL_LIT, MT.matte, nrm2);
      // bottom chord
      const cA = vadd(eA, vs(nrm2, -0.15)), cB = vadd(eB, vs(vs(Bp.side, sd), -0.15));
      b.quad([cA[0], bA + 0.34, cA[2]], [cA[0], bA, cA[2]], [cB[0], bA, cB[2]], [cB[0], bA + 0.34, cB[2]], mulc(RUST2, 0.95), MT.matte, nrm2);
      // zig-zag diagonals
      if (i % 2 === 0) {
        const dA = [eA[0], tA - 0.2, eA[2]], dB = [cB[0], bA + 0.1, cB[2]];
        bar(b, dA, dB, 0.30, 0.40, RUST, MT.matte);
      } else {
        const dA = [cA[0], bA + 0.1, cA[2]], dB = [eB[0], tA - 0.2, eB[2]];
        bar(b, dA, dB, 0.30, 0.40, RUST, MT.matte);
      }
      // vertical posts every 3 segments
      if (i % 3 === 0) bar(b, [cA[0], bA + 0.1, cA[2]], [eA[0], tA - 0.2, eA[2]], 0.32, 0.44, STEEL, MT.matte);
    }
    // cross bracing beneath the deck, every 3 segments
    if (i % 3 === 0) {
      const lA = vadd(A.p, vs(A.side, HALF - 0.4)), rA = sub(A.p, vs(A.side, HALF - 0.4));
      const yb = Y - DECK_T - 0.2;
      bar(b, [lA[0], yb, lA[2]], [rA[0], yb - 1.6, rA[2]], 0.22, 0.26, RUST, MT.matte);
      bar(b, [rA[0], yb, rA[2]], [lA[0], yb - 1.6, lA[2]], 0.22, 0.26, RUST, MT.matte);
    }
    // ---- side railing
    for (const sgn of [1, -1]) {
      const sd = sgn > 0 ? 1 : -1;
      const eA = vadd(A.p, vs(A.side, (HALF - 0.2) * sd));
      const eB = vadd(Bp.p, vs(Bp.side, (HALF - 0.2) * sd));
      const nrm2 = vs(A.side, sd);
      for (const hh of [0.62, 1.06]) {
        b.quad([eA[0], Y + hh, eA[2]], [eB[0], Y + hh, eB[2]],
          [eB[0], Y + hh + 0.09, eB[2]], [eA[0], Y + hh + 0.09, eA[2]], hh > 1 ? S_HI : STEEL_LIT, MT.matte, nrm2);
      }
      if (i % 2 === 0) {
        b.push(m4.translate([eA[0], Y + 0.6, eA[2]]));
        boxAt(b, 0.14, 1.2, 0.14, STEEL_LIT, MT.matte);
        b.pop();
      }
    }
  }
  return pts;
}

function mkCol(c, s) { return mulc(c, s); }
function mixc2(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

// a rectangular bar between two points (thin wrapper around a 4-face prism)
function bar(b, p0, p1, w, h, col, mat) {
  const d = norm(sub(p1, p0));
  let side = cross(d, [0, 1, 0]);
  if (Math.hypot(side[0], side[1], side[2]) < 1e-4) side = cross(d, [1, 0, 0]);
  side = norm(side);
  const up = norm(cross(side, d));
  const S = vs(side, w / 2), U = vs(up, h / 2);
  const a0 = vadd(p0, S), a1 = sub(p0, S), c0 = vadd(p1, S), c1 = sub(p1, S);
  const u0 = vadd(a0, U), u1 = vadd(a1, U), u2 = vadd(c0, U), u3 = vadd(c1, U);
  const d0 = sub(a0, U), d1 = sub(a1, U), d2 = sub(c0, U), d3 = sub(c1, U);
  b.quad(u0, u2, d2, d0, col, mat, side);
  b.quad(u1, d1, d3, u3, mulc(col, 0.9), mat, vs(side, -1));
  b.quad(u0, u1, u3, u2, mulc(col, 1.08), mat, up);
  b.quad(d0, d2, d3, d1, mulc(col, 0.78), mat, vs(up, -1));
  b.quad(u0, d0, d1, u1, mulc(col, 0.95), mat, vs(d, -1));
  b.quad(u2, u3, d3, d2, mulc(col, 1.02), mat, d);
}

// ------------------------------------------------------------------ piers
function buildPiers(b, loop) {
  const Y = L.railY;
  const span = 26;
  const n = Math.max(1, Math.round(loop.total / span));
  const realSpan = loop.total / n;
  const topY = Y - DECK_T - TRUSS_D + 0.1;
  // round 7: the station stands on the ring line and carries the deck itself, so
  // no lattice pier is planted inside its footprint (x 22..94, z -166..-126).
  const ST = L.station;
  const inStation = (x, z) => Math.abs(x - ST.x) < 37 && Math.abs(z - ST.z) < 21;
  for (let i = 0; i < n; i++) {
    const F = loop.frameAt(i * realSpan + realSpan * 0.5);
    const p = F.p, sd = F.side, tg = F.t;
    if (inStation(p[0], p[2])) continue;
    const baseW = 4.0, baseD = 3.3, topW = 2.4, topD = 2.05;
    // stone plinth
    b.push(m4.translate([p[0], 1.0, p[2]]));
    b.push(matYaw(Math.atan2(tg[0], tg[2])));
    boxAt(b, baseW * 2 + 2.0, 2.0, baseD * 2 + 2.0, STONE, MT.stone);
    b.push(m4.translate([0, 1.05, 0]));
    boxAt(b, baseW * 2 + 0.8, 0.6, baseD * 2 + 0.8, mulc(STONE, 0.9), MT.stone);
    b.pop();
    b.pop();
    b.pop();
    // 4 legs
    const corner = (sw, sd2, y, top) => {
      const w = top ? topW : baseW, dd = top ? topD : baseD;
      return [p[0] + sd[0] * sw * w + tg[0] * sd2 * dd, y, p[2] + sd[2] * sw * w + tg[2] * sd2 * dd];
    };
    const legs = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    const L0 = legs.map(([a, c]) => corner(a, c, 2.05, false));
    const L1 = legs.map(([a, c]) => corner(a, c, topY, true));
    for (let k = 0; k < 4; k++) bar(b, L0[k], L1[k], 0.72, 0.72, STEEL, MT.matte);
    // horizontal ties at three levels
    const levels = [0.22, 0.5, 0.78];
    for (const f of levels) {
      for (let k = 0; k < 4; k++) {
        const A2 = L0[k], B2 = L0[(k + 1) % 4];
        const pa = [A2[0] + (L1[k][0] - A2[0]) * f, A2[1] + (L1[k][1] - A2[1]) * f, A2[2] + (L1[k][2] - A2[2]) * f];
        const pb = [B2[0] + (L1[(k + 1) % 4][0] - B2[0]) * f, B2[1] + (L1[(k + 1) % 4][1] - B2[1]) * f, B2[2] + (L1[(k + 1) % 4][2] - B2[2]) * f];
        bar(b, pa, pb, 0.42, 0.42, mulc(STEEL, 0.95), MT.matte);
      }
    }
    // X bracing in two bays on all four faces
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4;
      const seg = (P0, P1, f) => [P0[0] + (P1[0] - P0[0]) * f, P0[1] + (P1[1] - P0[1]) * f, P0[2] + (P1[2] - P0[2]) * f];
      const h0 = 0.08, h1 = 0.5, h2 = 0.97;
      for (const [fa, fb] of [[h0, h1], [h1, h2]]) {
        const a0 = seg(L0[k], L1[k], fa), a1 = seg(L0[k2], L1[k2], fb);
        const b0 = seg(L0[k2], L1[k2], fa), b1 = seg(L0[k], L1[k], fb);
        bar(b, a0, a1, 0.28, 0.42, RUST, MT.matte);
        bar(b, b0, b1, 0.28, 0.42, mulc(RUST, 0.95), MT.matte);
      }
    }
    // cap frame
    for (let k = 0; k < 4; k++) bar(b, L1[k], L1[(k + 1) % 4], 0.55, 0.55, mulc(STEEL, 1.05), MT.matte);
  }
}

function matYaw(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return new Float32Array([c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1]);
}

// ------------------------------------------------------------------ lamps / gantries
function buildFurniture(b, ctx, pts) {
  const Y = L.railY;
  const N = pts.length;
  // lamp posts along the viaduct
  for (let i = 0; i < N; i += 8) {
    const A = pts[i];
    const sgn = (i / 8) % 2 === 0 ? 1 : -1;
    const sd = vs(A.side, sgn);
    const base = vadd(A.p, vs(sd, HALF + 0.1));
    const topY = Y + 4.6;
    // post
    b.push(m4.translate([base[0], Y + 2.3, base[2]]));
    cylinder(b, 6, 0.15, 0.11, 4.6, STEEL_LIT, MT.metal, { y0: -2.3, caps: false });
    b.pop();
    // arm reaching in over the track
    const tip = vadd([base[0], topY, base[2]], vs(sd, -1.5));
    bar(b, [base[0], topY - 0.15, base[2]], tip, 0.12, 0.12, STEEL_LIT, MT.metal);
    // lantern housing
    b.push(m4.translate([tip[0], topY - 0.5, tip[2]]));
    boxAt(b, 0.52, 0.62, 0.52, C.goldBright, MT.warm);
    b.pop();
    b.push(m4.translate([tip[0], topY - 0.08, tip[2]]));
    boxAt(b, 0.7, 0.14, 0.7, STEEL, MT.metal);
    b.pop();
    const lp = [tip[0], topY - 0.55, tip[2]];
    ctx.lanterns.push({ p: lp, size: 3.4, rot: 0, alpha: 0.55, shape: 1, col: LAMPWARM });
    ctx.points.push({ p: lp, col: [1.0, 0.82, 0.55], range: 27, int: 0.55 });
  }
  // two portal signal gantries
  for (const idx of [Math.floor(N * 0.14), Math.floor(N * 0.62)]) {
    const A = pts[idx % N];
    const Y0 = Y;
    for (const sgn of [1, -1]) {
      const base = vadd(A.p, vs(A.side, 4.5 * sgn));
      b.push(m4.translate([base[0], Y0 + 3.0, base[2]]));
      cylinder(b, 6, 0.2, 0.16, 6.0, STEEL_LIT, MT.metal, { y0: -3.0, caps: false });
      b.pop();
    }
    const l0 = vadd([A.p[0], Y0 + 6.0, A.p[2]], vs(A.side, 4.5));
    const l1 = vadd([A.p[0], Y0 + 6.0, A.p[2]], vs(A.side, -4.5));
    bar(b, l0, l1, 0.3, 0.55, STEEL, MT.metal);
    for (const o of [1.4, -1.4]) {
      const sp = vadd([A.p[0], Y0 + 5.5, A.p[2]], vadd(vs(A.side, o), vs(A.t, 0.5)));
      b.push(m4.translate(sp));
      boxAt(b, 0.55, 1.15, 0.4, STEEL, MT.metal);
      b.pop();
      const lampP = vadd(sp, [0, 0.35, 0]);
      b.push(m4.translate(vadd(lampP, vs(A.t, 0.22))));
      boxAt(b, 0.3, 0.3, 0.12, o > 0 ? rgb('#5ef0a0') : rgb('#ff5a5a'), MT.glow);
      b.pop();
      ctx.lanterns.push({ p: vadd(lampP, vs(A.t, 0.3)), size: 2.2, rot: 0, alpha: 0.7, shape: 0, col: o > 0 ? rgb('#8affc0') : rgb('#ff8a8a') });
    }
  }
}

// ------------------------------------------------------------------ train meshes
// Round 9: a Belle-Époque steam express built from the reference sheet.  Every
// part below is built in one frame: +Z is the direction of travel, y = 0 is the
// rail head (world L.railY + 0.3), x = ± half width.  The geometry check
// re-derives the whole contract (bbox / wheel plane / gaps) from the vertices.
function tubeZ(wb, x, y, z, r0, r1, len, seg, col, mat, caps) {
  wb.push(m4.translate([x, y, z]));
  wb.push(m4.rotX(Math.PI / 2));
  cylinder(wb, seg, r0, r1, len, col, mat, { y0: -len / 2, caps: !!caps });
  wb.pop();
  wb.pop();
}
function tubeX(wb, x, y, z, r, thick, seg, col, mat, caps) {
  wb.push(m4.translate([x, y, z]));
  wb.push(m4.rotZ(Math.PI / 2));
  cylinder(wb, seg, r, r, thick, col, mat, { y0: -thick / 2, caps: !!caps });
  wb.pop();
  wb.pop();
}
const bx = (wb, x, y, z, sx, sy, sz, col, mat) => {
  wb.push(m4.translate([x, y, z]));
  boxAt(wb, sx, sy, sz, col, mat);
  wb.pop();
};
// flat disc facing ±Z (dir = +1 / -1)
function discZ(wb, x, y, z, r, seg, col, mat, dir) {
  const zz = z + dir * 0.002;
  const N = [0, 0, dir];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    wb.tri([x, y, zz],
      [x + Math.cos(a0) * r, y + Math.sin(a0) * r, zz],
      [x + Math.cos(a1) * r, y + Math.sin(a1) * r, zz], col, mat, N, N, N);
  }
}
// curved band wrapped on a body of radius r about the axis (0, yc) along z.
// angle 0 = top, +PI/2 = +X flank (round-8 hullBand convention, kept).
function arcBandZ(wb, z0, z1, yc, r, a0, a1, seg, nz, col, mat, off = 0) {
  const rr = r + off;
  for (let iz = 0; iz < nz; iz++) {
    const za = z0 + ((z1 - z0) * iz) / nz;
    const zb = z0 + ((z1 - z0) * (iz + 1)) / nz;
    for (let ia = 0; ia < seg; ia++) {
      const aa = a0 + ((a1 - a0) * ia) / seg;
      const ab = a0 + ((a1 - a0) * (ia + 1)) / seg;
      const pa = [Math.sin(aa) * rr, yc + Math.cos(aa) * rr, za];
      const pb = [Math.sin(ab) * rr, yc + Math.cos(ab) * rr, za];
      const pc = [Math.sin(ab) * rr, yc + Math.cos(ab) * rr, zb];
      const pd = [Math.sin(aa) * rr, yc + Math.cos(aa) * rr, zb];
      const am = (aa + ab) * 0.5;
      wb.quad(pa, pb, pc, pd, col, mat, [Math.sin(am), Math.cos(am), 0]);
    }
  }
}
// Closed [x,y] cross-section swept from z0 to z1. Sides get exact outward
// normals; both ends are closed with centroid fans so the section is a solid.
function sweepZ(wb, sec, z0, z1, col, mat, opts = {}) {
  const n = sec.length;
  const capCol = opts.capCol || mulc(col, 0.86);
  for (let i = 0; i < n; i++) {
    const a = sec[i], c2 = sec[(i + 1) % n];
    const dx = c2[0] - a[0], dy = c2[1] - a[1];
    const dd = Math.hypot(dx, dy) || 1;
    const N = [dy / dd, -dx / dd, 0];
    wb.quad([a[0], a[1], z0], [c2[0], c2[1], z0], [c2[0], c2[1], z1], [a[0], a[1], z1], col, mat, N);
  }
  if (opts.caps !== false) {
    let cx = 0, cy = 0;
    for (const p of sec) { cx += p[0]; cy += p[1]; }
    cx /= n; cy /= n;
    for (let i = 0; i < n; i++) {
      const a = sec[i], c2 = sec[(i + 1) % n];
      wb.tri([cx, cy, z0], [a[0], a[1], z0], [c2[0], c2[1], z0], capCol, mat, [0, 0, -1], [0, 0, -1], [0, 0, -1]);
      wb.tri([cx, cy, z1], [c2[0], c2[1], z1], [a[0], a[1], z1], mulc(capCol, 0.95), mat, [0, 0, 1], [0, 0, 1], [0, 0, 1]);
    }
  }
}
// arched window on a side wall facing ±X.  x = wall plane (the glass sits 0.03
// proud of it), zc = centre along z, hw = half width, yS..yE = straight part,
// arch = rise of the semicircular head.  Gold surround + mullions included.
function archWinX(wb, sgn, x, zc, hw, yS, yE, arch, colGlass, matGlass, colFrm, matFrm) {
  const XF = sgn * (x + 0.010);      // frame plate
  const XG = sgn * (x + 0.030);      // glass
  const N = [sgn, 0, 0];
  const seg = 5;
  const fan = (r, ry, y0, X2, col, mat) => {
    let pz = 0, py = 0;
    for (let k = 0; k <= seg; k++) {
      const a = Math.PI * (k / seg);
      const z = zc + Math.cos(a) * r, y = y0 + Math.sin(a) * ry;
      if (k > 0) wb.tri([X2, y0, zc], [X2, py, pz], [X2, y, z], col, mat, N, N, N);
      pz = z; py = y;
    }
  };
  const fr = 0.075;
  fan(hw + fr, arch + fr, yE, XF, colFrm, matFrm);
  for (const s of [-1, 1]) {
    bx(wb, sgn * (x + 0.008), (yS + yE) / 2, zc + s * (hw + fr * 0.5), 0.055, yE - yS + fr, fr, colFrm, matFrm);
  }
  bx(wb, sgn * (x + 0.008), yS - fr * 0.5, zc, 0.055, fr, hw * 2 + fr * 2, colFrm, matFrm);
  wb.quad([XG, yS, zc - hw], [XG, yS, zc + hw], [XG, yE, zc + hw], [XG, yE, zc - hw], colGlass, matGlass, N);
  fan(hw, arch, yE, XG, colGlass, matGlass);
  bx(wb, sgn * (x + 0.032), (yS + yE) / 2, zc, 0.016, yE - yS, 0.035, TC.navyDk, TM.brass);
  bx(wb, sgn * (x + 0.032), yS + (yE - yS) * 0.66, zc, 0.016, 0.032, hw * 2, TC.navyDk, TM.brass);
}
// Driving wheel: dark tyre, brass spokes, red web, crank pin.  r = radius so the
// tread touches y = 0 (the rail head).
function driverWheel(wb, sgn, r, zc, nSpoke, crankPhase) {
  const xt = sgn * 1.06;            // tyre plane
  const xf = sgn * 1.17;            // spoke / web plane
  tubeX(wb, xt, r, zc, r, 0.20, 18, TC.black, TM.iron, false);
  tubeX(wb, xf, r, zc, r * 0.955, 0.09, 18, TC.navyDk, [0.00, 0.24], false);
  for (let k = 0; k < nSpoke; k++) {
    const a = (k / nSpoke) * TAU;
    const dy = Math.sin(a) * r * 0.90, dz = Math.cos(a) * r * 0.90;
    bar(wb, [xf, r + dy, zc + dz], [xf, r - dy, zc - dz], 0.085, 0.10, TC.brass, TM.brass);
  }
  tubeX(wb, xf + 0.03 * sgn, r, zc, r * 0.24, 0.22, 12, TC.brassHi, TM.brass, false);
  const cw = crankPhase + Math.PI;
  bx(wb, xf, r + Math.sin(cw) * r * 0.56, zc + Math.cos(cw) * r * 0.56, 0.07, r * 0.52, r * 0.46, TC.red, [0.00, 0.20]);
  tubeX(wb, xf + 0.15 * sgn, r + Math.sin(crankPhase) * r * 0.42, zc + Math.cos(crankPhase) * r * 0.42,
    0.085, 0.30, 10, TC.brassHi, TM.brass);
}
// Small pony/trailing wheel (tyre + 8 spokes + hub).
function ponyWheel(wb, sgn, r, zc) {
  const xt = sgn * 1.06, xf = sgn * 1.15;
  tubeX(wb, xt, r, zc, r, 0.18, 14, TC.black, TM.iron, false);
  tubeX(wb, xf, r, zc, r * 0.9, 0.08, 14, TC.navyDk, TM.hull, false);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU;
    const dy = Math.sin(a) * r * 0.86, dz = Math.cos(a) * r * 0.86;
    bar(wb, [xf, r + dy, zc + dz], [xf, r - dy, zc - dz], 0.075, 0.09, TC.iron, TM.iron);
  }
  tubeX(wb, xf + 0.03 * sgn, r, zc, r * 0.26, 0.18, 10, TC.brass, TM.brass, false);
}
// row of rivets on a plane facing ±Z
function rivetsZ(wb, cy, r, z, n, dir, col, mat) {
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU;
    bx(wb, Math.cos(a) * r, cy + Math.sin(a) * r, z, 0.055, 0.055, 0.045, col, mat);
  }
}

// ================================================================== locomotive
// 4-6-0 "347": brass-banded boiler, tall flared stack, big spoked drivers,
// glowing headlamp, slatted cowcatcher, glazed cab, short coal bunker.
export function buildLocomotive() {
  const wb = new B();
  wb.note('loco');
  const BY = 3.10;        // boiler axis height
  const BR = 1.10;        // boiler radius
  const DR = 0.82;        // driver radius (tread touches y = 0)
  const R2 = mulberry32(0x9e3779b1);   // local rng only — never the shared one

  // ---- frame, running board, valance ------------------------------------
  bx(wb, 0, 1.30, 0.40, 2.32, 0.46, 14.00, TC.iron, TM.iron);
  bx(wb, 0, 1.58, 0.50, 2.54, 0.13, 13.40, TC.navy, TM.hull);
  bx(wb, 0, 1.67, 0.50, 2.62, 0.06, 13.45, TC.navy, TM.hullHi);
  for (const s of [-1, 1]) {
    bx(wb, s * 1.31, 1.60, 0.50, 0.05, 0.095, 13.35, TC.gold, TM.gold);
    bx(wb, s * 1.255, 1.105, 0.40, 0.11, 0.52, 13.7, TC.navyDk, TM.hull);
    bx(wb, s * 1.255, 0.86, 0.40, 0.07, 0.05, 13.7, TC.goldDk, TM.brass);
  }
  // front and rear drag beams
  bx(wb, 0, 1.10, 6.55, 2.20, 0.30, 0.30, TC.iron, TM.iron);
  bx(wb, 0, 1.10, -7.30, 2.20, 0.30, 0.30, TC.iron, TM.iron);

  // ---- boiler, smokebox, firebox ----------------------------------------
  tubeZ(wb, 0, BY, 2.18, BR, BR, 7.55, 20, TC.navy, TM.hull, false);
  arcBandZ(wb, -1.55, 5.95, BY, BR, -0.60, 0.60, 8, 8, TC.navyLit, TM.hullHi, 0.014);  // top sheen
  for (const z of [5.72, 4.72, 3.58, 2.34, 1.00, -0.42]) {
    tubeZ(wb, 0, BY, z, BR + 0.030, BR + 0.030, 0.075, 20, TC.brassHi, TM.brass, false);
  }
  // one thin gold pinstripe running the length of each boiler flank
  for (const s of [-1, 1]) {
    arcBandZ(wb, -1.50, 5.90, BY, BR, s * 1.20, s * 1.235, 1, 1, TC.goldDk, TM.brass, 0.012);
  }
  // smokebox + brass front ring + rivets
  tubeZ(wb, 0, BY, 6.55, BR + 0.04, BR, 1.30, 20, TC.iron, TM.iron, false);
  tubeZ(wb, 0, BY, 7.18, 1.20, 1.20, 0.14, 20, TC.brassHi, TM.brass, false);
  discZ(wb, 0, BY, 7.20, 1.10, 20, TC.iron, TM.iron, 1);
  discZ(wb, 0, BY, 7.235, 0.92, 20, mulc(TC.iron, 0.82), TM.hull, 1);
  discZ(wb, 0, BY, 7.26, 0.24, 12, TC.brassHi, TM.brass, 1);
  rivetsZ(wb, BY, 1.13, 7.21, 16, 1, TC.brass, TM.brass);
  // gilt filigree wings across the smokebox door
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const r0 = 0.36 + k * 0.22;
      for (let q = 0; q <= 4; q++) {
        const a0 = (0.28 + q * 0.16), a1 = a0 + 0.16;
        const p0 = [s * Math.cos(a0) * r0, BY + Math.sin(a0) * r0, 7.245];
        const p1 = [s * Math.cos(a1) * r0, BY + Math.sin(a1) * r0, 7.245];
        bar(wb, p0, p1, 0.045, 0.03, TC.brassHi, TM.brass);
      }
    }
  }
  // number plate "347" under the headlamp
  bx(wb, 0, BY + 0.30, 7.20, 1.02, 0.46, 0.07, TC.gold, TM.gold);
  bx(wb, 0, BY + 0.30, 7.235, 0.84, 0.32, 0.05, TC.navyDk, TM.hull);
  for (let k = -1; k <= 1; k++) bx(wb, k * 0.24, BY + 0.30, 7.265, 0.115, 0.21, 0.035, TC.goldHi, TM.gold);
  // firebox shoulders (wider than the boiler, under the cab front)
  sweepZ(wb, [[-1.24, 2.05], [1.24, 2.05], [1.24, 4.05], [0.92, 4.34], [0, 4.42],
    [-0.92, 4.34], [-1.24, 4.05]], -3.00, -1.55, TC.navy, TM.hull, { capCol: TC.navyDk });
  bx(wb, 0, 2.20, -2.28, 2.34, 0.30, 1.45, TC.iron, TM.iron);
  bx(wb, 0, 4.34, -2.28, 1.55, 0.14, 1.45, TC.brassHi, TM.brass);

  // ---- chimney: tall, flared, brass crown -------------------------------
  wb.push(m4.translate([0, BY + BR - 0.06, 5.32]));
  lathe(wb, [[0.46, 0.00], [0.50, 0.24], [0.47, 0.72], [0.52, 1.28], [0.64, 1.80],
    [0.86, 2.12], [0.95, 2.30], [0.92, 2.42], [0.66, 2.42], [0.62, 2.30]], 16, TC.iron, TM.iron);
  wb.pop();
  wb.push(m4.translate([0, BY + BR + 2.18, 5.32]));
  cylinder(wb, 16, 0.96, 0.96, 0.13, TC.brassHi, TM.brass, { y0: -0.065 });
  wb.pop();
  wb.push(m4.translate([0, BY + BR + 2.22, 5.32]));
  disc(wb, 0.70, 14, TC.black, TM.coal, { y: 0 });
  wb.pop();
  // steam dome, sand dome, safety valves, bell, whistle
  wb.push(m4.translate([0, BY + BR - 0.10, 3.55]));
  lathe(wb, [[0.68, 0.00], [0.72, 0.06], [0.68, 0.22], [0.57, 0.42], [0.40, 0.56],
    [0.18, 0.64], [0.00, 0.66]], 16, TC.brassHi, TM.brass);
  wb.pop();
  wb.push(m4.translate([0, BY + BR - 0.06, 2.10]));
  lathe(wb, [[0.46, 0.00], [0.48, 0.05], [0.44, 0.20], [0.34, 0.34], [0.16, 0.42], [0.00, 0.43]], 14, TC.brass, TM.brass);
  wb.pop();
  for (const dz of [-0.35, 0.35]) {
    wb.push(m4.translate([dz, BY + BR + 0.02, -1.05]));
    cylinder(wb, 10, 0.10, 0.13, 0.42, TC.brassHi, TM.brass, { y0: 0 });
    wb.pop();
  }
  // bell
  bx(wb, 0, BY + BR + 0.02, 0.35, 0.10, 0.34, 0.10, TC.brass, TM.brass);
  wb.push(m4.translate([0, BY + BR + 0.28, 0.35]));
  ellipsoid(wb, 0.20, 0.22, 0.20, 10, 4, TC.brassHi, TM.brass);
  wb.pop();
  // whistle + brass pipework on the firebox shoulder
  wb.push(m4.translate([0.30, BY + BR + 0.26, -1.45]));
  cylinder(wb, 10, 0.075, 0.09, 0.36, TC.goldHi, TM.gold, { y0: 0 });
  wb.pop();

  // ---- headlamp ---------------------------------------------------------
  wb.push(m4.translate([0, 4.60, 7.10]));
  wb.push(m4.rotX(Math.PI / 2));
  lathe(wb, [[0.36, -0.24], [0.40, -0.18], [0.42, 0.06], [0.40, 0.20], [0.33, 0.28], [0.30, 0.30]],
    14, TC.brass, TM.brass);
  wb.pop();
  wb.pop();
  tubeZ(wb, 0, 4.60, 7.40, 0.34, 0.34, 0.06, 14, TC.brassHi, TM.brass, false);
  discZ(wb, 0, 4.60, 7.43, 0.29, 14, TC.lamp, [0.55, 0.12], 1);
  discZ(wb, 0, 4.60, 7.45, 0.13, 10, TC.goldHi, TM.glow, 1);
  bx(wb, 0, 5.02, 7.08, 0.34, 0.12, 0.20, TC.brassHi, TM.brass);
  for (const s of [-1, 1]) {   // marker lamps on the smokebox shoulders
    bx(wb, s * 0.86, 4.28, 7.06, 0.20, 0.24, 0.16, TC.brass, TM.brass);
    discZ(wb, s * 0.86, 4.30, 7.15, 0.07, 8, TC.glassW, TM.glow, 1);
  }

  // ---- cowcatcher (pilot) ----------------------------------------------
  bx(wb, 0, 1.60, 6.98, 2.84, 0.22, 0.50, TC.navy, TM.hull);
  bx(wb, 0, 1.72, 6.98, 2.90, 0.06, 0.56, TC.gold, TM.gold);
  for (let k = 0; k < 9; k++) {
    const x = -1.32 + k * 0.33;
    const zFront = 7.92 - Math.abs(x) * 0.30;
    bar(wb, [x, 1.56, 6.86], [x, 0.16, zFront], 0.15, 0.13, TC.iron, TM.iron);
  }
  bar(wb, [-1.38, 0.20, 7.90], [1.38, 0.20, 7.90], 0.17, 0.15, TC.gold, TM.gold);
  bar(wb, [-1.36, 0.94, 7.28], [1.36, 0.94, 7.28], 0.14, 0.12, TC.brass, TM.brass);
  // buffer beam + buffers + coupler
  bx(wb, 0, 1.44, 6.32, 2.72, 0.44, 0.22, TC.red, [0.00, 0.18]);
  bx(wb, 0, 1.60, 6.32, 2.76, 0.06, 0.24, TC.goldDk, TM.brass);
  for (const s of [-1, 1]) {
    tubeZ(wb, s * 0.92, 1.44, 6.55, 0.16, 0.14, 0.30, 10, TC.brassHi, TM.brass, false);
    tubeZ(wb, s * 0.92, 1.44, 6.72, 0.24, 0.24, 0.10, 12, TC.iron, TM.iron, false);
  }
  bx(wb, 0, 1.14, 6.78, 0.24, 0.26, 0.52, TC.iron, TM.iron);
  bx(wb, 0, 1.14, 7.06, 0.34, 0.34, 0.10, TC.brassHi, TM.brass);

  // ---- cylinders, crossheads, coupling rods ----------------------------
  const crank = 0.55;                       // crank phase (radians)
  const cpin = (zc) => [DR + Math.sin(crank) * DR * 0.42, zc + Math.cos(crank) * DR * 0.42];
  const DZ = [3.92, 2.06, 0.20];
  for (const s of [-1, 1]) {
    bx(wb, s * 1.235, 2.02, 5.06, 0.58, 0.70, 1.42, TC.iron, TM.iron);
    bx(wb, s * 1.235, 2.02, 5.06, 0.62, 0.11, 1.26, TC.brassHi, TM.brass);
    tubeZ(wb, s * 1.235, 2.02, 5.82, 0.37, 0.35, 0.18, 12, TC.brass, TM.brass, false);
    tubeZ(wb, s * 1.235, 2.02, 4.30, 0.35, 0.35, 0.16, 12, TC.iron, TM.iron, false);
    bar(wb, [s * 1.06, 4.05, 6.10], [s * 1.235, 2.46, 5.30], 0.16, 0.16, TC.brass, TM.brass);
    bar(wb, [s * 1.20, 1.38, 4.34], [s * 1.20, 1.38, 3.10], 0.13, 0.20, TC.navyLit, TM.hullHi);
    // coupling rods through the three crank pins
    const p0 = cpin(DZ[0]), p2 = cpin(DZ[2]);
    bar(wb, [s * 1.32, p0[0], p0[1]], [s * 1.32, p2[0], p2[1]], 0.10, 0.22, TC.brassHi, TM.brass);
    // main rod: crosshead -> middle crank pin
    const pm = cpin(DZ[1]);
    bar(wb, [s * 1.32, 1.38, 4.20], [s * 1.32, pm[0], pm[1]], 0.11, 0.24, TC.brassHi, TM.brass);
  }

  // ---- wheels ----------------------------------------------------------
  for (const s of [-1, 1]) {
    for (const dz of DZ) driverWheel(wb, s, DR, dz, 16, crank);
    ponyWheel(wb, s, 0.52, 5.32);
    ponyWheel(wb, s, 0.52, 6.24);
    ponyWheel(wb, s, 0.62, -3.45);
    ponyWheel(wb, s, 0.62, -4.62);
    // handrail along the boiler shoulder + stanchions
    bar(wb, [s * 0.84, 3.96, -1.10], [s * 0.84, 3.96, 5.88], 0.05, 0.05, TC.brass, TM.brass);
    for (let k = 0; k < 5; k++) {
      bar(wb, [s * 0.80, 3.88, -0.75 + k * 1.55], [s * 0.845, 3.96, -0.75 + k * 1.55], 0.045, 0.045, TC.brass, TM.brass);
    }
    // sand pipes from the sand dome down to the rail
    bar(wb, [s * 1.14, 3.96, 2.10], [s * 1.20, 0.74, 3.30], 0.055, 0.055, TC.iron, TM.iron);
    // brass pipe running low along the frame
    bar(wb, [s * 1.18, 1.16, 5.90], [s * 1.18, 1.16, -1.20], 0.07, 0.07, TC.brass, TM.brass);
  }

  // ---- cab -------------------------------------------------------------
  const CAB = [[-1.28, 1.64], [1.28, 1.64], [1.28, 4.52], [1.16, 4.90], [0.80, 5.10],
    [0.40, 5.19], [0, 5.21], [-0.40, 5.19], [-0.80, 5.10], [-1.16, 4.90], [-1.28, 4.52]];
  sweepZ(wb, CAB, -6.12, -2.95, TC.navy, TM.hull, { capCol: TC.navyDk });
  bx(wb, 0, 1.70, -4.54, 2.58, 0.10, 3.18, TC.gold, TM.gold);
  bx(wb, 0, 2.96, -4.54, 2.56, 0.035, 3.14, TC.goldDk, TM.brass);
  bx(wb, 0, 4.58, -4.54, 2.30, 0.09, 3.18, TC.gold, TM.gold);
  bx(wb, 0, 5.30, -4.54, 0.52, 0.15, 3.05, TC.brassHi, TM.brass);
  bx(wb, 0, 5.42, -4.54, 0.22, 0.09, 3.12, TC.gold, TM.gold);
  bx(wb, 0, 5.16, -2.86, 2.70, 0.14, 0.32, TC.navyLit, TM.hullHi);
  for (const s of [-1, 1]) {
    archWinX(wb, s, 1.285, -3.55, 0.36, 3.34, 4.04, 0.26, TC.glassDk, TM.glassDk, TC.goldHi, TM.gold);
    archWinX(wb, s, 1.285, -5.05, 0.36, 3.34, 4.04, 0.26, TC.glassDk, TM.glassDk, TC.goldHi, TM.gold);
    bx(wb, s * 1.29, 2.98, -4.30, 0.04, 0.26, 0.74, TC.gold, TM.gold);
    bx(wb, s * 1.315, 2.98, -4.30, 0.02, 0.17, 0.58, TC.navyDk, TM.hull);
    for (let k = -1; k <= 1; k++) bx(wb, s * 1.325, 2.98, -4.30 + k * 0.16, 0.015, 0.10, 0.05, TC.goldHi, TM.gold);
    // cab front spectacle window (either side of the boiler)
    const x0 = s * 1.00;
    const N = [0, 0, 1];
    wb.quad([x0 - 0.17, 3.66, -2.95], [x0 + 0.17, 3.66, -2.95], [x0 + 0.17, 4.24, -2.95], [x0 - 0.17, 4.24, -2.95], TC.glassDk, TM.glassDk, N);
    bx(wb, x0, 3.63, -2.965, 0.40, 0.05, 0.05, TC.goldHi, TM.gold);
    bx(wb, x0, 4.27, -2.965, 0.40, 0.05, 0.05, TC.goldHi, TM.gold);
    for (const xx of [-0.19, 0.19]) bx(wb, x0 + xx, 3.95, -2.965, 0.05, 0.66, 0.05, TC.goldHi, TM.gold);
    // cab step + grab rail
    bx(wb, s * 1.34, 1.30, -3.05, 0.22, 0.10, 0.60, TC.iron, TM.iron);
    bx(wb, s * 1.34, 0.98, -3.05, 0.22, 0.10, 0.46, TC.iron, TM.iron);
    bar(wb, [s * 1.32, 1.62, -3.34], [s * 1.32, 3.30, -3.34], 0.045, 0.045, TC.brassHi, TM.brass);
  }

  // ---- coal bunker (rear) ----------------------------------------------
  sweepZ(wb, [[-1.20, 1.55], [1.20, 1.55], [1.24, 1.74], [1.24, 2.88], [1.06, 3.00], [-1.06, 3.00],
    [-1.24, 2.88], [-1.24, 1.74]], -7.78, -6.18, TC.navy, TM.hull, { capCol: TC.navyDk });
  bx(wb, 0, 1.88, -6.98, 2.50, 0.08, 1.58, TC.gold, TM.gold);
  bx(wb, 0, 2.42, -6.98, 2.48, 0.03, 1.54, TC.goldDk, TM.brass);
  bx(wb, 0, 2.86, -6.98, 2.50, 0.08, 1.58, TC.gold, TM.gold);
  for (const s of [-1, 1]) {
    bar(wb, [s * 1.26, 3.06, -6.18], [s * 1.26, 3.06, -7.78], 0.05, 0.05, TC.brassHi, TM.brass);
  }
  bar(wb, [-1.24, 3.06, -7.76], [1.24, 3.06, -7.76], 0.05, 0.05, TC.brassHi, TM.brass);
  // coal load (deterministic local jitter)
  for (let k = 0; k < 5; k++) {
    wb.push(m4.translate([(R2() - 0.5) * 1.5, 2.90, -6.5 - k * 0.28]));
    ellipsoid(wb, 0.26 + R2() * 0.2, 0.16 + R2() * 0.1, 0.34, 7, 3, TC.black, TM.coal);
    wb.pop();
  }
  // rear buffer beam + coupler
  bx(wb, 0, 1.42, -7.86, 2.66, 0.42, 0.20, TC.red, [0.00, 0.18]);
  for (const s of [-1, 1]) {
    tubeZ(wb, s * 0.92, 1.42, -7.98, 0.17, 0.15, 0.26, 10, TC.brassHi, TM.brass, false);
    tubeZ(wb, s * 0.92, 1.42, -8.11, 0.24, 0.24, 0.08, 12, TC.iron, TM.iron, false);
  }
  bx(wb, 0, 1.14, -7.98, 0.24, 0.26, 0.30, TC.iron, TM.iron);
  return wb;
}

// ================================================================== carriage
// Double-decked Belle-Époque coach: two rows of arched windows behind gold
// frames (the upper row slightly smaller and more ornate), brass waist lines,
// curved roof with a glazed clerestory, end gangways, two four-wheel bogies.
const CAR_SEC = [
  [-1.22, 0.62], [1.22, 0.62],
  [1.44, 0.74], [1.55, 0.92], [1.55, 2.74],
  [1.60, 2.80], [1.60, 2.96],
  [1.53, 3.04], [1.53, 4.94],
  [1.44, 5.24], [1.20, 5.50], [0.80, 5.70], [0.40, 5.81], [0, 5.86],
  [-0.40, 5.81], [-0.80, 5.70], [-1.20, 5.50], [-1.44, 5.24],
  [-1.53, 4.94], [-1.53, 3.04], [-1.60, 2.96], [-1.60, 2.80], [-1.55, 2.74],
  [-1.55, 0.92], [-1.44, 0.74],
];
export function buildCarriage(variant) {
  const wb = new B();
  wb.note('carriage');
  const V = variant === 1;                    // 1 = the ornate dining car
  const LINE = V ? TC.cream : TC.gold;
  const Z0 = -7.70, Z1 = 7.70;
  const FLOOR = 0.62;

  // ---- hull -------------------------------------------------------------
  sweepZ(wb, CAR_SEC, Z0, Z1, V ? mixc(TC.navy, TC.navyLit, 0.16) : TC.navy, TM.hull, { capCol: TC.navyDk });
  // roof shoulder sheen
  sweepZ(wb, [[-1.44, 5.24], [-1.20, 5.50], [-0.80, 5.70], [-0.40, 5.81], [0, 5.86],
    [0.40, 5.81], [0.80, 5.70], [1.20, 5.50], [1.44, 5.24]], Z0 + 0.05, Z1 - 0.05,
    TC.navyLit, TM.hullHi, { caps: false });
  // gold lining: two belt lines top and bottom, cornice under the roof
  bx(wb, 0, FLOOR + 0.30, 0, 3.07, 0.04, Z1 - Z0 - 0.30, LINE, TM.gold);
  bx(wb, 0, 2.78, 0, 3.205, 0.045, Z1 - Z0 - 0.20, TC.gold, TM.gold);
  bx(wb, 0, 2.99, 0, 3.205, 0.045, Z1 - Z0 - 0.20, TC.gold, TM.gold);
  bx(wb, 0, 4.96, 0, 3.075, 0.04, Z1 - Z0 - 0.30, LINE, TM.gold);
  bx(wb, 0, 5.27, 0, 3.13, 0.05, Z1 - Z0 - 0.20, TC.goldDk, TM.brass);

  // ---- window rows: two decks of arched lights, lit ones interleaved -----
  const lowerN = V ? 6 : 8;
  const lowerStep = V ? 2.10 : 1.58;
  const lowerHW = V ? 0.58 : 0.47;
  for (let k = 0; k < lowerN; k++) {
    const zc = -lowerStep * (lowerN - 1) / 2 + k * lowerStep;
    for (const s of [-1, 1]) {
      const lit = (k % 2) === 0;
      archWinX(wb, s, 1.555, zc, lowerHW, 1.16, 2.46, 0.30,
        lit ? TC.glassW : TC.glassDk, lit ? TM.glass : TM.glassDk, TC.goldHi, TM.gold);
    }
  }
  const upperN = 7;
  const upperStep = 1.62;
  for (let k = 0; k < upperN; k++) {
    const zc = -upperStep * (upperN - 1) / 2 + k * upperStep;
    for (const s of [-1, 1]) {
      const lit = (k % 2) === 1;
      archWinX(wb, s, 1.535, zc, 0.42, 3.30, 4.44, 0.26,
        lit ? TC.glassW : TC.glassU, lit ? TM.glass : TM.glassU, TC.goldHi, TM.gold);
      if (k % 2 === 0) {   // gilt crest between the upper lights
        bx(wb, s * 1.53, 4.88, zc, 0.04, 0.09, 0.36, TC.gold, TM.gold);
        bx(wb, s * 1.545, 4.88, zc, 0.02, 0.055, 0.20, TC.goldHi, TM.gold);
      }
    }
  }
  // pilasters: short verticals between the window rows, never full height
  for (const s of [-1, 1]) {
    for (let k = 0; k <= lowerN; k++) {
      const zc = -lowerStep * lowerN / 2 + k * lowerStep;
      bx(wb, s * 1.575, 1.86, zc, 0.05, 1.42, 0.16, TC.navyLit, TM.hullHi);
      bx(wb, s * 1.585, 1.86, zc, 0.02, 1.32, 0.07, TC.goldDk, TM.brass);
    }
    for (let k = 0; k < upperN + 1; k++) {
      const zc = -upperStep * upperN / 2 + k * upperStep;
      bx(wb, s * 1.555, 3.86, zc, 0.05, 1.20, 0.13, TC.navyLit, TM.hullHi);
      bx(wb, s * 1.565, 3.86, zc, 0.02, 1.10, 0.06, TC.goldDk, TM.brass);
    }
    // skirt + eave lining lines
    bx(wb, s * 1.552, 0.80, 0, 0.02, 0.05, Z1 - Z0 - 0.60, TC.gold, TM.gold);
    bx(wb, s * 1.552, 1.06, 0, 0.02, 0.035, Z1 - Z0 - 0.60, TC.goldDk, TM.brass);
    bx(wb, s * 1.575, 5.11, 0, 0.02, 0.04, Z1 - Z0 - 0.45, TC.gold, TM.gold);
  }

  // ---- clerestory roof -------------------------------------------------
  const CLE = [[-0.56, 5.80], [0.56, 5.80], [0.63, 5.92], [0.56, 6.10], [-0.56, 6.10], [-0.63, 5.92]];
  sweepZ(wb, CLE, Z0 + 0.35, Z1 - 0.35, TC.navyLit, TM.hullHi, { capCol: TC.navyDk });
  bx(wb, 0, 6.13, 0, 0.20, 0.06, Z1 - Z0 - 0.60, TC.gold, TM.gold);
  for (const s of [-1, 1]) {
    for (let k = 0; k < 7; k++) {
      const zc = -5.4 + k * 1.8;
      wb.quad([s * 0.628, 5.85, zc - 0.50], [s * 0.628, 5.85, zc + 0.50],
        [s * 0.628, 6.02, zc + 0.50], [s * 0.628, 6.02, zc - 0.50],
        k % 2 ? TC.glassW : TC.glassDk, k % 2 ? TM.glass : TM.glassDk, [s, 0, 0]);
      bx(wb, s * 0.635, 5.835, zc, 0.02, 0.03, 1.06, TC.goldDk, TM.brass);
      bx(wb, s * 0.635, 6.025, zc, 0.02, 0.028, 1.06, TC.gold, TM.gold);
    }
  }
  // brass mushroom ventilators + luggage rail
  for (const zc of [-4.6, 0, 4.6]) {
    wb.push(m4.translate([0, 6.10, zc]));
    lathe(wb, [[0.16, 0.00], [0.18, 0.05], [0.15, 0.14], [0.24, 0.20], [0.26, 0.26], [0.10, 0.26], [0.00, 0.24]],
      12, TC.brassHi, TM.brass);
    wb.pop();
  }
  for (const s of [-1, 1]) {
    for (const zc of [-5.9, 5.9]) bx(wb, s * 1.30, 5.52, zc, 0.05, 0.30, 0.05, TC.brass, TM.brass);
    bar(wb, [s * 1.30, 5.68, -5.9], [s * 1.30, 5.68, 5.9], 0.05, 0.05, TC.brassHi, TM.brass);
  }

  // ---- ends: gangway, doors, steps, buffers ----------------------------
  for (const e of [-1, 1]) {
    const zE = e * (Z1 - 0.02);
    // diaphragm bellows
    bx(wb, 0, 2.42, e * (Z1 + 0.16), 1.56, 2.10, 0.34, TC.black, TM.coal);
    bx(wb, 0, 2.42, e * (Z1 + 0.31), 1.44, 1.98, 0.06, TC.iron, TM.iron);
    for (const y of [1.55, 2.42, 3.30]) bx(wb, 0, y, e * (Z1 + 0.14), 1.60, 0.07, 0.36, TC.brass, TM.brass);
    // end door + window
    wb.quad([-0.34, 1.10, zE], [0.34, 1.10, zE], [0.34, 2.92, zE], [-0.34, 2.92, zE], TC.navyLit, TM.hullHi, [0, 0, e]);
    wb.quad([-0.20, 1.74, zE + e * 0.01], [0.20, 1.74, zE + e * 0.01],
      [0.20, 2.50, zE + e * 0.01], [-0.20, 2.50, zE + e * 0.01], TC.glassDk, TM.glassDk, [0, 0, e]);
    for (const y of [1.04, 2.96]) bx(wb, 0, y, zE + e * 0.02, 0.92, 0.07, 0.05, TC.gold, TM.gold);
    for (const x of [-0.40, 0.40]) bx(wb, x, 2.02, zE + e * 0.02, 0.07, 1.90, 0.05, TC.gold, TM.gold);
    // buffers + coupler
    bx(wb, 0, 1.10, e * (Z1 + 0.12), 2.36, 0.32, 0.14, TC.red, [0.00, 0.18]);
    for (const s of [-1, 1]) {
      tubeZ(wb, s * 0.86, 1.10, e * (Z1 + 0.26), 0.15, 0.13, 0.22, 10, TC.brassHi, TM.brass, false);
      tubeZ(wb, s * 0.86, 1.10, e * (Z1 + 0.38), 0.21, 0.21, 0.08, 12, TC.iron, TM.iron, false);
    }
    // steps below the end doors
    for (const y of [0.34, 0.68]) bx(wb, 0, y, e * (Z1 - 0.28), 1.70, 0.09, 0.52, TC.iron, TM.iron);
  }

  // ---- underframe + bogies --------------------------------------------
  bx(wb, 0, 0.50, 0, 2.10, 0.26, Z1 - Z0 - 1.6, TC.iron, TM.iron);
  for (const s of [-1, 1]) {
    bx(wb, s * 1.30, 0.66, 0, 0.14, 0.22, Z1 - Z0 - 0.9, TC.navyDk, TM.hull);
    // air tanks / battery boxes
    tubeZ(wb, s * 0.92, 0.46, -1.4, 0.20, 0.20, 2.40, 10, TC.navyDk, TM.hull, false);
    bx(wb, s * 0.92, 0.44, 2.9, 0.62, 0.34, 1.30, TC.iron, TM.iron);
  }
  for (const bz of [-4.72, 4.72]) {
    bx(wb, 0, 0.72, bz, 2.26, 0.40, 2.86, TC.iron, TM.iron);
    for (const s of [-1, 1]) {
      bx(wb, s * 1.03, 0.70, bz, 0.14, 0.36, 2.66, TC.black, TM.coal);
      for (const dz of [-0.86, 0.86]) {
        // spring stack + axle box
        bx(wb, s * 1.14, 0.92, bz + dz, 0.16, 0.30, 0.42, TC.brass, TM.brass);
        for (let k = 0; k < 3; k++) bx(wb, s * 1.14, 0.78 + k * 0.09, bz + dz, 0.20, 0.05, 0.46, TC.goldDk, TM.brass);
        ponyWheel(wb, s, 0.46, bz + dz);
      }
    }
    // truss / brake gear between the bogies
    bx(wb, 0, 0.62, bz, 0.18, 0.16, 2.20, TC.iron, TM.iron);
  }
  // brake hoses
  for (const e of [-1, 1]) bx(wb, 0.4 * e, 0.55, e * (Z1 + 0.30), 0.10, 0.50, 0.10, TC.iron, TM.iron);
  return wb;
}

// Contract shared with tools/train-check.mjs (and with the actor spacing below).
export const TRAIN_METRICS = {
  railTopLocalY: 0,        // y = 0 is the rail head (world L.railY + 0.30)
  maxHalfWidth: 1.62,      // viaduct deck half width is 3.30
  maxLocalHeight: 7.70,    // station arch clearance: world y stays < 35.50
  carFloorY: 0.62,         // door sill: world 28.42 vs platform 28.40
  carBodyNetHeight: [5.20, 5.60],
  spacing: { first: 17.0, gap: 17.7 },   // loco centre → car0 centre ; car → car
  carRearExtent: 8.12,     // |z| of the last coach's rear buffer face (measured)
  wakeLag: 17.0 + 17.7 * 2 + 8.12,
  maxTriLoco: 26000,
  maxTriCar: 16000,
};

// ------------------------------------------------------------------ entry
export function buildRailway(b, ctx, rng) {
  const loop = makeLoop(L.railLoop);
  const tri0 = b.i.length / 3;
  const pts = buildDeck(b, loop);
  buildPiers(b, loop);
  buildFurniture(b, ctx, pts);
  console.log('[rail] static tris', Math.round(b.i.length / 3 - tri0));

  // ---- round 9: steam-era train actors — one locomotive + three double-decked
  // coaches.  All four are dynamic models in ctx.dyn; the spacing constants are
  // shared with TRAIN_METRICS so tools/train-check.mjs can verify the gaps.
  const locoB = buildLocomotive();
  const carB0 = buildCarriage(0);
  const carB1 = buildCarriage(1);
  console.log('[train] tris  loco', locoB.triCount, 'car', carB0.triCount, '/', carB1.triCount,
    'drawn', locoB.triCount + carB0.triCount * 2 + carB1.triCount);
  const meshLoco = mesh(ctx.gl, locoB.v, locoB.i);
  const meshCar0 = mesh(ctx.gl, carB0.v, carB0.i);
  const meshCar1 = mesh(ctx.gl, carB1.v, carB1.i);
  const railTop = L.railY + 0.3;
  const SPEED = 8.4;
  const S0 = 55 - 8 * SPEED;
  const FIRST = TRAIN_METRICS.spacing.first;
  const GAP = TRAIN_METRICS.spacing.gap;
  const pose = (t, lag) => {
    const s = S0 + SPEED * t - lag;
    const F = loop.frameAt(s);
    const yaw = Math.atan2(F.t[0], F.t[2]);
    return { F, yaw };
  };
  ctx.dyn.push({
    name: 'loco', kind: 'model', mesh: meshLoco, prog: 'lit',
    model: (t) => {
      const p = pose(t, 0);
      return trs([p.F.p[0], railTop, p.F.p[2]], p.yaw);
    },
  });
  for (let k = 0; k < 3; k++) {
    ctx.dyn.push({
      name: 'car' + k, kind: 'model', mesh: k === 1 ? meshCar1 : meshCar0, prog: 'lit',
      model: (t) => {
        const p = pose(t, FIRST + GAP * k);
        return trs([p.F.p[0], railTop, p.F.p[2]], p.yaw);
      },
    });
  }

  // ---- round 9: real steam.  White boiler steam rolls off the stack, a low
  // vapour trail follows the last coach and a warm glow rides on the headlamp;
  // every position is an analytic function of t, so ?freeze=N is pixel-stable.
  // The shared rng is consumed exactly as many times as in round 8 (192 draws)
  // so the downstream stage sequence does not get re-rolled; the jitter itself
  // comes from a local mulberry32.
  for (let i = 0; i < 192; i++) rng();
  const RL = mulberry32(0x51a7e01);
  const JIT = [];
  for (let i = 0; i < 48; i++) JIT.push([(RL() - 0.5) * 2, (RL() - 0.5) * 2, (RL() - 0.5) * 2, RL()]);
  const local = (m, p) => [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
  const WAKE_LAG = TRAIN_METRICS.wakeLag;      // behind the last coach's rear face
  ctx.bbDyn.push({
    name: 'train-steam',
    up: false,
    fill: (t, bb) => {
      // boiler steam: a column off the stack that drifts back and up
      for (let i = 0; i < 18; i++) {
        const ph = ((t * 0.30 + i * 0.117) % 1);
        const age = ph * 3.1;
        const p = pose(t - age, 0);
        const M = trs([p.F.p[0], railTop, p.F.p[2]], p.yaw);
        const f = local(M, [JIT[i][0] * 0.55, 6.15 + age * 0.95 + JIT[i][1] * 0.30, 5.28 + JIT[i][2] * 0.55]);
        bb.add(f[0] + JIT[i][2] * age * 1.9, f[1], f[2] + JIT[i][0] * age * 1.9,
          1.15 + age * 2.6, ph * 5 + i, (1 - ph) * 0.30, 2, TC.steam);
      }
      // low vapour trail drifting off the last coach
      for (let i = 0; i < 12; i++) {
        const ph = ((t * 0.24 + i * 0.131) % 1);
        const age = ph * 3.4;
        const p = pose(t - age, WAKE_LAG);
        const M = trs([p.F.p[0], railTop, p.F.p[2]], p.yaw);
        const f = local(M, [JIT[i][0] * 1.25, 1.35 + JIT[i][1] * 0.5, JIT[i][2] * 1.2]);
        bb.add(f[0], f[1] + age * 0.42, f[2], 2.0 + age * 3.4, ph * 7 + i, (1 - ph) * 0.20, 2,
          i % 3 ? TC.steam : rgb('#e8eef7'));
      }
      // headlamp: a warm glow riding on the lens, plus two small marker halos
      {
        const p = pose(t, 0);
        const M = trs([p.F.p[0], railTop, p.F.p[2]], p.yaw);
        const f = local(M, [0, 4.62, 7.62]);
        bb.add(f[0], f[1], f[2], 6.6, 11, 0.50, 0, TC.lamp);
        bb.add(f[0], f[1], f[2], 3.0, 23, 0.72, 0, TC.lamp);
        for (const s of [-1, 1]) {
          const g = local(M, [s * 0.86, 4.30, 7.22]);
          bb.add(g[0], g[1], g[2], 1.5, 31 + s, 0.42, 0, TC.glassW);
        }
      }
      // a few warm brake embers flicking off the leading bogie
      for (let i = 0; i < 8; i++) {
        const ph = ((t * 0.9 + i * 0.19) % 1);
        const age = ph * 0.85;
        const p = pose(t - age, 0);
        const M = trs([p.F.p[0], railTop, p.F.p[2]], p.yaw);
        const f = local(M, [(i % 2 ? 1 : -1) * (0.95 + JIT[i][0] * 0.2), 0.22 + JIT[i][1] * 0.18, 5.9 + JIT[i][2] * 0.5]);
        bb.add(f[0] + JIT[i][0] * age * 1.4, f[1] + age * 1.1, f[2] + JIT[i][1] * age * 1.4,
          0.28 + ph * 0.42, i, (1 - ph) * 0.60, 0, i % 2 ? TC.lamp : TC.copper);
      }
    },
  });
}