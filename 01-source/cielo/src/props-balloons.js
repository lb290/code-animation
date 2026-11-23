// props-balloons.js — pastel balloons tied to the terrace balustrade, plus loose
// balloons drifting above the city. OWNER: agent "balloons".
//
//   export function buildBalloons(b, ctx, rng) -> void
//
// Nothing is appended to the shared static builder: every string and ribbon is
// part of an animated bunch mesh, so it swings with its own balloons. Registered
// dynamic content:
//   * 4 terrace bunches  : kind 'model', local origin AT THE RAIL KNOT, so the
//                          whole bunch (balloons + strings) pendulums from the
//                          handrail: yaw / pitch / roll sine offsets.
//   * 2 loose bunches    : kind 'model', slowly rising + drifting over the city.
//   * 4 colour groups    : kind 'inst', 20 single balloons, each with a short
//                          trailing string, drifting up + sideways + spinning.
// All randomness comes from the rng() handed in — never Math.random — so two
// builds of the same page are pixel-identical for a given freeze time.

import { C, LOOK } from './palette.js';
import { MT, ellipsoid, tubePath, bez2 } from './lib3d.js';
import { B, mixc, mulc, cylinder, lathe, ribbon } from './geo.js';
import { mesh } from './gl.js';
import { trs } from './actor.js';
import { TAU, clamp, m4, norm, smoothstep } from './math.js';

// ---------------------------------------------------------------- world anchors
// Same balustrade plan curve as terrace.js / life.js: the belvedere bow projects
// 9 m over the boulevard, so a bunch anchored here leans out over the city.
const RAIL_EDGE = 93.0, RAIL_HALF = 34, RAIL_BOW = 9.0;
export const RAIL_TOP = 31.25;   // marble handrail crown is at ~31.20

export function railZ(x) {
  const ax = Math.abs(x);
  if (ax >= RAIL_HALF) return RAIL_EDGE;
  return RAIL_EDGE - RAIL_BOW * Math.pow(Math.cos((Math.PI * 0.5 * ax) / RAIL_HALF), 1.3);
}
function railSlope(x) {
  const d = 0.12;
  return (railZ(x + d) - railZ(x - d)) / (2 * d);
}

const SUN = norm(LOOK.sunDir);
// sun direction expressed in a frame yawed by yaw (local = Ry(-yaw) * world)
function sunLocal(yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [c * SUN[0] - s * SUN[2], SUN[1], s * SUN[0] + c * SUN[2]];
}
const SUN_NEUTRAL = norm([-0.30, 0.60, 0.74]);

// ---------------------------------------------------------------- geometry
// One pastel balloon. Local origin at the body centre, +Y up. This is the piece
// the instanced free balloons are made of; the terrace bunches reuse it.
// opts: r, col (lower body), colTop (lighter crown), sunL (light dir in local
// space), sq (horizontal squash), su/sv (tessellation).
export function balloonGeom(b, opts = {}) {
  const r = opts.r ?? 0.42;
  const col = opts.col ?? C.ballPink;
  const colTop = opts.colTop ?? C.ballCream;
  const sunL = opts.sunL ?? SUN_NEUTRAL;
  const sq = opts.sq ?? 1;
  const su = opts.su ?? 9, sv = opts.sv ?? 7;
  const crown = opts.crown ?? 0.22;          // how much lighter the top half is
  const rx = r * 0.94 * sq, ry = r * 1.06, rz = r * 0.94;
  // Painted latex: a soft lighter crown, a warmer underside, and a compact
  // specular-looking spot on the sun-facing shoulder. The shader's own spec
  // (MT.polish) is narrow, so the painted spot is what carries at distance.
  const colFn = (v, u) => {
    const phi = (v - 0.5) * Math.PI;
    const cr = Math.cos(phi), sp = Math.sin(phi);
    const th = u * TAU;
    const nx = Math.cos(th) * cr, ny = sp, nz = Math.sin(th) * cr;
    const d = Math.max(0, nx * sunL[0] + ny * sunL[1] + nz * sunL[2]);
    const sheen = 0.30 * Math.pow(d, 2.0) + 0.06 * Math.max(0, ny);
    const shade = 0.82 + 0.18 * (0.5 + 0.5 * sp);      // slightly darker underside
    const base = mixc(col, colTop, smoothstep(0.50, 0.99, v) * crown);
    const lit = mulc(base, shade * (1 + sheen));
    const glint = Math.pow(d, 9.0) * 0.85;             // compact latex glint
    return mixc(lit, [1.05, 1.0, 0.95], glint);
  };
  ellipsoid(b, rx, ry, rz, su, sv, col, MT.polish, { colFn });
  // pinched neck + tied knot at the bottom of the body
  b.push(m4.translate([0, -ry + 0.015, 0]));
  lathe(
    b,
    [[0.155 * r, -0.015], [0.085 * r, 0.040], [0.050 * r, 0.070], [0.066 * r, 0.098]],
    5, mulc(col, 0.80), MT.polish, { smooth: true }
  );
  b.pop();
  return { ry, bottom: -ry };
}

// Slot table for a bunch: [x, y, z, radius] in bunch-local space. -Z is out
// over the city, +Y up. Prefix order keeps any 5-balloon subset well spread.
const BUNCH_SLOTS = [
  [0.00, 1.55, -1.00, 0.46],
  [0.64, 1.98, -1.50, 0.52],
  [-0.60, 2.08, -1.26, 0.40],
  [0.24, 2.70, -1.88, 0.55],
  [-0.38, 2.98, -1.62, 0.36],
  [0.72, 3.16, -2.16, 0.48],
  [-0.14, 3.56, -2.32, 0.42],
];
const BUNCH_ORDER = [0, 3, 1, 5, 2, 4, 6];
const BUNCH_COLI = [0, 1, 2, 1, 2, 0, 1];

// A whole bunch in local space. For a terrace bunch the local origin is the knot
// on the handrail (so the mesh pivots exactly there); for a loose, rising bunch
// the origin is the knot hanging below it. Strings are baked into the same mesh.
// opts: n (3..7), cols, ribbon, scale, free, sunL
export function bunchGeom(b, rng, opts = {}) {
  const n = clamp(opts.n ?? 6, 3, 7) | 0;
  const cols = opts.cols ?? [C.ballPink, C.ballCream, C.ballCoral];
  const ribbonCol = opts.ribbon ?? cols[0];
  const scale = opts.scale ?? 1;
  const free = !!opts.free;
  const sunL = opts.sunL ?? SUN_NEUTRAL;
  const su = opts.su ?? 9, sv = opts.sv ?? 6;
  const liftY = opts.liftY ?? 1.12;   // balloons sail above the rail, long strings
  const liftZ = opts.liftZ ?? 1.06;   // ...and a little further out over the city
  const spreadX = opts.spreadX ?? 1.0;
  const knot = [0, 0.02, 0];
  const stringCol = mulc(C.stoneWarm, 0.78);
  const balloons = [];

  for (let i = 0; i < n; i++) {
    const slot = BUNCH_SLOTS[BUNCH_ORDER[i]];
    const r = clamp((slot[3] + (rng() - 0.5) * 0.07) * scale, 0.30 * scale, 0.56 * scale);
    const px = (slot[0] * spreadX + (rng() - 0.5) * 0.16) * scale;
    const py = (slot[1] + (rng() - 0.5) * 0.14) * scale * liftY;
    const pz = (slot[2] + (rng() - 0.5) * 0.18) * scale * liftZ;
    const col = cols[BUNCH_COLI[BUNCH_ORDER[i]] % cols.length];
    const colTop = mixc(col, C.dressWhite, 0.55);
    const crown = 0.10 + rng() * 0.26;   // some balloons are nearly one colour
    b.push(m4.translate([px, py, pz]));
    const g = balloonGeom(b, { r, col, colTop, sunL, sq: 0.94 + rng() * 0.12, su, sv, crown });
    b.pop();
    balloons.push({ p: [px, py, pz], bottom: py - g.ry, r });
  }

  // strings: every balloon knot falls to ONE tie point, sagging a little
  for (const bl of balloons) {
    const p0 = [bl.p[0], bl.bottom, bl.p[2]];
    const sag = (0.10 + rng() * 0.10) * scale;
    const mid = [
      (p0[0] + knot[0]) * 0.5 + (rng() - 0.5) * 0.10 * scale,
      (p0[1] + knot[1]) * 0.5 - sag,
      (p0[2] + knot[2]) * 0.5 - 0.05 * scale,
    ];
    const pts = [];
    for (let k = 0; k <= 5; k++) pts.push(bez2(p0, mid, knot, k / 5));
    tubePath(b, pts, 0.0095 * scale, 2, stringCol, MT.polish, { caps: false });
  }

  if (free) {
    // loose bunch: a small bow at the hanging knot plus a trailing ribbon
    b.push(m4.translate([0, 0.0, 0]));
    for (const sgn of [-1, 1]) {
      b.quad(
        [0.02 * sgn, 0.02, -0.02], [0.13 * sgn, 0.11, 0.01],
        [0.10 * sgn, -0.02, 0.06], [0.015 * sgn, 0.0, 0.02],
        ribbonCol, MT.polish
      );
    }
    b.pop();
    const tail = [];
    for (let k = 0; k <= 4; k++) {
      const t = k / 4;
      tail.push([Math.sin(t * 2.4) * 0.11 * scale, -0.02 - t * 1.05 * scale, Math.cos(t * 1.7) * 0.07 * scale]);
    }
    ribbon(b, tail, [0.075, 0.070, 0.062, 0.055, 0.048].map((v) => v * scale), ribbonCol, MT.cloth, [1, 0, 0]);
  } else {
    // terrace bunch: clove hitch over the marble handrail + two short ribbon tails
    b.push(m4.translate([0, 0.02, 0]));
    b.push(m4.rotZ(Math.PI / 2));
    cylinder(b, 6, 0.060, 0.052, 0.16, ribbonCol, MT.polish, { y0: -0.08, caps: true });
    b.pop();
    ellipsoid(b, 0.052, 0.046, 0.052, 4, 2, ribbonCol, MT.polish);
    for (const sd of [-1, 1]) {
      const x0 = 0.045 * sd, z0 = 0.015 * sd;
      b.quad([x0, 0.01, z0], [x0 + 0.05 * sd, 0.01, z0 + 0.02], [x0 + 0.03 * sd, -0.17, z0 + 0.05], [x0 - 0.01 * sd, -0.17, z0 + 0.03], ribbonCol, MT.polish);
      b.quad([x0 - 0.01 * sd, -0.17, z0 + 0.03], [x0 + 0.03 * sd, -0.17, z0 + 0.05], [x0 + 0.05 * sd, 0.01, z0 + 0.02], [x0, 0.01, z0], mulc(ribbonCol, 0.86), MT.polish);
    }
    b.pop();
  }
  return { n, balloons };
}

// A single free balloon: body + knot + a short trailing string with a small
// ribbon end. Local origin at the body centre so the actor matrix is its position.
export function freeBalloonGeom(b, opts = {}) {
  const r = opts.r ?? 0.44;
  const col = opts.col ?? C.ballPink;
  const colTop = opts.colTop ?? C.ballCream;
  const tailCol = opts.tailCol ?? col;
  const sunL = opts.sunL ?? SUN_NEUTRAL;
  const g = balloonGeom(b, { r, col, colTop, sunL, sq: 0.96 });
  const p0 = [0, g.bottom, 0];
  const pts = [];
  for (let k = 0; k <= 4; k++) {
    const t = k / 4;
    pts.push([Math.sin(t * 2.6 + 0.35) * 0.075 * t, g.bottom - t * 0.82, Math.cos(t * 2.0) * 0.055 * t]);
  }
  tubePath(b, pts, 0.0058, 2, mixc(C.stonePale, C.ballCream, 0.3), MT.polish, { caps: false });
  // small ribbon flag at the end of the tail
  const e = pts[pts.length - 1];
  b.quad([e[0], e[1], e[2]], [e[0] + 0.07, e[1] - 0.035, e[2] + 0.02], [e[0] + 0.06, e[1] - 0.10, e[2] - 0.01], [e[0], e[1] - 0.075, e[2]], tailCol, MT.polish);
  b.quad([e[0], e[1] - 0.075, e[2]], [e[0] + 0.06, e[1] - 0.10, e[2] - 0.01], [e[0] + 0.07, e[1] - 0.035, e[2] + 0.02], [e[0], e[1], e[2]], mulc(tailCol, 0.86), MT.polish);
  void p0;
  return g;
}

// ---------------------------------------------------------------- geometry plan
// Pure (no GL): builds every mesh + the motion metadata. The check tool calls
// this directly; buildBalloons uploads the same data.
export function buildBalloonGeometry(rng) {
  const bunches = [];
  const freeBunches = [];
  const groups = [];

  // ---- 4 bunches tied to the balustrade -----------------------------------
  const BUNCH_SET = [
    // the hero bunch dead centre of view 11: warm pinks against the pale sky
    { x: 10.5, n: 6, cols: [C.ballPink, C.ballCream, C.ballCoral], ribbon: C.ballPink, leanX: -0.055, su: 9, sv: 7, spreadX: 1.18, liftZ: 1.12, scale: 1.0 },
    // the right-hand bunch sits against the pale glass dome, so it goes warm
    { x: 14.5, n: 7, cols: [C.ballLilac, C.ballCoral, C.ballCream], ribbon: C.ballLilac, leanX: -0.050, su: 9, sv: 6, spreadX: 0.95, liftZ: 1.02, scale: 0.90 },
    { x: -6.5, n: 5, cols: [C.ballPink, C.ballSky, C.ballCream], ribbon: C.ballSky, leanX: -0.060, su: 9, sv: 7, scale: 1.0 },
    { x: -11.5, n: 6, cols: [C.ballSky, C.ballMint, C.ballCream], ribbon: C.ballSky, leanX: -0.052, su: 9, sv: 7, scale: 1.0 },
  ];
  for (let i = 0; i < BUNCH_SET.length; i++) {
    const s = BUNCH_SET[i];
    const ph = rng() * TAU;
    const yaw0 = -Math.atan(railSlope(s.x));
    const nb = new B();
    nb.note('balloon-bunch');
    bunchGeom(nb, rng, {
      n: s.n, cols: s.cols, ribbon: s.ribbon, scale: s.scale ?? 1, sunL: sunLocal(yaw0), free: false,
      su: s.su, sv: s.sv, liftY: 1.13, liftZ: s.liftZ ?? 1.06, spreadX: s.spreadX ?? 1.0,
    });
    bunches.push({
      name: 'balloon-bunch-' + i, b: nb, x: s.x, z: railZ(s.x), yaw0, ph,
      leanX: s.leanX + (rng() - 0.5) * 0.012,
    });
  }

  // ---- 2 loose bunches rising over the city ------------------------------
  const FREE_BUNCH = [
    { p: [8.5, 41.5, 64.0], sc: 0.95, cols: [C.ballPink, C.ballSky, C.ballCream], ribbon: C.ballPink },
    { p: [-6.0, 46.0, 57.0], sc: 1.10, cols: [C.ballCream, C.ballLilac, C.ballMint], ribbon: C.ballLilac },
  ];
  for (let i = 0; i < FREE_BUNCH.length; i++) {
    const s = FREE_BUNCH[i];
    const ph = rng() * TAU;
    const nb = new B();
    nb.note('balloon-free-bunch');
    bunchGeom(nb, rng, { n: 5, cols: s.cols, ribbon: s.ribbon, scale: 1, free: true, sunL: SUN_NEUTRAL, liftY: 1.0, liftZ: 1.0 });
    freeBunches.push({
      name: 'balloon-rising-' + i, b: nb, base: s.p, sc: s.sc, ph,
      spin: 0.030 + rng() * 0.030, rise: 0.022 + rng() * 0.020,
    });
  }

  // ---- 20 loose balloons in 4 colour groups ------------------------------
  const GROUPS = [
    { col: C.ballPink, top: C.dressWhite, tail: C.ballPink },
    { col: C.ballSky, top: C.ballCream, tail: C.ballSky },
    { col: C.ballMint, top: C.dressWhite, tail: C.ballMint },
    { col: C.ballLilac, top: C.ballCream, tail: C.ballLilac },
  ];
  // [x, y, z, scale]: a fan over the boulevard, framed for view 11 (look from the
  // terrace toward the city) — near ones are small accents, far ones haze out.
  const FREE = [
    [2.5, 37.0, 80.0, 1.00], [16.5, 36.5, 79.0, 0.90], [12.0, 40.0, 74.0, 1.20],
    [4.0, 43.5, 68.0, 1.10], [20.0, 42.0, 70.0, 1.30], [-2.0, 39.0, 74.0, 0.85],
    [24.0, 47.0, 62.0, 1.15], [9.0, 47.0, 63.0, 1.35], [-6.0, 45.0, 66.0, 1.05],
    [15.0, 51.0, 57.0, 1.20], [28.0, 44.0, 55.0, 1.10], [0.0, 54.0, 56.0, 1.25],
    [21.0, 56.0, 49.0, 1.30], [-10.0, 49.0, 61.0, 1.00], [33.0, 50.0, 45.0, 1.15],
    [6.0, 50.0, 60.0, 0.95], [-4.0, 57.0, 52.0, 1.20], [36.0, 43.0, 40.0, 1.05],
    [13.5, 36.0, 82.5, 0.85], [-16.0, 53.0, 57.0, 1.10],
  ];
  const lists = GROUPS.map(() => []);
  for (let i = 0; i < FREE.length; i++) {
    const f = FREE[i];
    lists[i % GROUPS.length].push({
      p: [f[0], f[1], f[2]],
      s: Math.min(f[3], 1.20),
      ph: rng(),
      ax: 1.1 + rng() * 1.7, ay: 1.2 + rng() * 1.9, az: 0.7 + rng() * 1.4,
      wx: 0.045 + rng() * 0.060, wy: 0.030 + rng() * 0.045, wz: 0.045 + rng() * 0.060,
      rise: 0.022 + rng() * 0.030,
      spin: (rng() - 0.5) * 0.55,
      yaw0: rng() * TAU,
    });
  }
  for (let g = 0; g < GROUPS.length; g++) {
    const nb = new B();
    nb.note('balloon-free');
    freeBalloonGeom(nb, {
      r: 0.44, col: GROUPS[g].col, colTop: GROUPS[g].top, tailCol: GROUPS[g].tail, sunL: SUN_NEUTRAL,
    });
    groups.push({ name: 'balloon-free-' + g, b: nb, list: lists[g] });
  }

  return { bunches, freeBunches, groups };
}

// ---------------------------------------------------------------- entry point
export function buildBalloons(b, ctx, rng) {
  const geo = buildBalloonGeometry(rng);
  const gl = ctx.gl;
  const tris = [];
  const upload = (nb) => {
    const r = nb.build(gl);
    tris.push(nb.i.length / 3);
    return mesh(gl, r.verts, r.indices);
  };

  // ---- terrace bunches: pendulum from the rail knot ----------------------
  for (const bn of geo.bunches) {
    const m = upload(bn.b);
    const anchor = [bn.x, RAIL_TOP, bn.z];
    const yaw0 = bn.yaw0, ph = bn.ph, leanX = bn.leanX;
    ctx.dyn.push({
      name: bn.name, kind: 'model', mesh: m, prog: 'lit',
      // the whole bunch swings as one rigid pendulum: yaw drift, a slow lean
      // out over the city, and a small sideways roll — balloons + strings move
      // together because they live in this one local mesh.
      model: (t) => trs(
        anchor,
        yaw0 + Math.sin(t * 0.40 + ph) * 0.050,
        1,
        leanX + Math.sin(t * 0.55 + ph) * 0.055,
        Math.sin(t * 0.70 + ph) * 0.045
      ),
    });
  }

  // ---- loose bunches: rising + drifting over the city --------------------
  for (const bn of geo.freeBunches) {
    const m = upload(bn.b);
    const base = bn.base, sc = bn.sc, ph = bn.ph, spin = bn.spin, rise = bn.rise;
    ctx.dyn.push({
      name: bn.name, kind: 'model', mesh: m, prog: 'lit',
      model: (t) => trs(
        [
          base[0] + Math.sin(t * 0.061 + ph) * 3.0 + Math.sin(t * 0.021 + ph * 1.7) * 1.3,
          base[1] + Math.sin(t * 0.047 + ph * 1.3) * 2.4 + t * rise,
          base[2] + Math.cos(t * 0.053 + ph * 0.8) * 2.2,
        ],
        ph + t * spin + Math.sin(t * 0.13 + ph) * 0.12,
        sc,
        Math.sin(t * 0.17 + ph) * 0.07,
        Math.sin(t * 0.21 + ph * 1.6) * 0.08
      ),
    });
  }

  // ---- 20 loose balloons, 4 instanced groups -----------------------------
  for (const g of geo.groups) {
    const m = upload(g.b);
    const list = g.list;
    ctx.dyn.push({
      name: g.name, kind: 'inst', mesh: m, capacity: list.length,
      fill(t, act) {
        for (let k = 0; k < list.length; k++) {
          const o = list[k];
          const ph = o.ph * TAU;
          const x = o.p[0] + Math.sin(t * o.wx + ph) * o.ax + Math.sin(t * 0.073 + ph * 2.3) * 0.35;
          const y = o.p[1] + Math.sin(t * o.wy + ph * 1.7) * o.ay + Math.sin(t * 0.041 + ph) * 0.5 + t * o.rise;
          const z = o.p[2] + Math.cos(t * o.wz + ph * 1.3) * o.az;
          const yaw = o.yaw0 + t * o.spin + Math.sin(t * 0.21 + ph) * 0.14;
          act.set(
            k,
            trs([x, y, z], yaw, o.s, Math.sin(t * 0.19 + ph * 2.1) * 0.10, Math.cos(t * 0.23 + ph * 1.4) * 0.12),
            o.ph, 0.025, 1, 2
          );
        }
        return list.length;
      },
    });
  }

  const total = tris.reduce((a, c) => a + c, 0);
  const maxTri = tris.reduce((a, c) => Math.max(a, c), 0);
  console.log('[balloons] meshes=' + tris.length + ' tris=' + Math.round(total) + ' max=' + Math.round(maxTri) +
    ' (' + tris.map((v) => Math.round(v)).join(',') + ')');
}
