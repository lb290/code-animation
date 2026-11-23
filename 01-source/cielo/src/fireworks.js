// fireworks.js — round 6 · controllable fireworks (C2 pass: readable city-scale sparks).
//
// Every shell is ANALYTIC: its burst particles are a closed-form function of
// (t - launchTime), so a frozen frame is exactly reproducible and nothing is
// integrated step by step. No shared rng: each shell owns a mulberry32 built
// from its own seed, and its per-particle directions/speeds/lifetimes are
// precomputed once in buildShell().
//
//   F key            fire a 3-shell volley (staggered, different pads/colours)
//   ?fw=N            pre-load N manual shells (stills use ?fw=16&freeze=7.1)
//   ?fw=0            no fireworks at all (F included)
//   night (ENV.night > 0.42)  an automatic shell every 6..12 s from a fixed
//                    deterministic cycle, so a frozen time always maps to the
//                    same shells.
//
// Design note (C2 feedback): the sparks must be readable as individual grains
// at 200-350 m, so a single spark is ~2.5-4.5 m and the "wow" comes from
// DENSITY (100-160 grains per shell) + a handful of small glows for the flash
// and the crown. Two billboard systems are exported: additive sparks and a
// normal-alpha soft smoke system (3 puffs per burst, kept out of the way).
import { mulberry32, TAU, clamp } from './math.js';
import { rgb } from './geo.js';
import { ENV } from './daynight.js';

// Saturated palette, gold / warm white dominant; pink / cyan / red / violet are
// accents only (a whole violet shell reads as a purple cloud at city scale).
export const FW_COLORS = [
  [1.70, 1.05, 0.34],   // gold
  [1.85, 0.55, 0.85],   // pink
  [0.38, 1.55, 1.75],   // cyan
  [1.85, 0.30, 0.22],   // red
  [1.80, 1.58, 1.22],   // warm white
  [1.00, 0.60, 1.70],   // violet
];
// weighted colour choice: gold 30 / warm white 22 / pink 16 / cyan 14 / red 10 / violet 8
const COLOR_WEIGHTS = [[0, 0.30], [4, 0.22], [1, 0.16], [2, 0.14], [3, 0.10], [5, 0.08]];
export function pickColorIndex(R) {
  const r = R();
  let acc = 0;
  for (const [idx, w] of COLOR_WEIGHTS) { acc += w; if (r < acc) return idx; }
  return 0;
}

// launch pads: open squares / the boulevard / the canal, all clear of the
// palace (x±60, z 124..188) and the glass palace (x 104, z 44, r~50) solids.
export const FW_PADS = [
  [0, 2, -40],       // fountain plaza
  [0, 2, 24],        // grand boulevard
  [-96, 2, -24],     // cathedral forecourt
  [-196, 2, -132],   // ferris wheel lawn
  [0, 2, -204],      // canal quay
  [104, 2, 100],     // east of the glass palace, in front of the palace
];

export const FW_KIND = { SPHERE: 0, RING: 1, WILLOW: 2 };
export const FW_LIMITS = {
  burstSphere: 150,
  burstRing: 124,
  burstWillow: 112,
  secondary: 30,
  trail: 20,
  glow: 6,            // max small glows per shell (flash + crown)
  smoke: 3,           // max smoke puffs per burst (shape 6, normal alpha)
  sparkSize: 2.8,     // world-size multiplier: base 0.9..1.6 -> 2.5..4.5 m
  perShell: 260,
  capacityPerFrame: 2200,
  autoMinGap: 6,
  autoMaxGap: 12,
  autoStart: 3.6,
  volleyMin: 2,
  volleyMax: 3,
};
const G = 9.8;

function unit(R) {
  // uniform point on the sphere (deterministic for a given rng stream)
  const z = R() * 2 - 1;
  const a = R() * TAU;
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  return [Math.cos(a) * r, z, Math.sin(a) * r];
}

function scaleCol(c, s, w, white) {
  return [
    c[0] * (1 - w) + white[0] * w,
    c[1] * (1 - w) + white[1] * w,
    c[2] * (1 - w) + white[2] * w,
  ].map((v) => v * s);
}

const WHITE = [1.0, 0.97, 0.90];

/**
 * Precompute one shell. spec = {t0, seed, pad:[x,y,z], burstH, kind, colorIdx, hasSecond}
 * The returned object is plain data (no functions) — purely a spec + lookup tables.
 */
export function buildShell(spec) {
  const R = mulberry32((spec.seed >>> 0) || 1);
  const pad = (spec.pad || FW_PADS[0]).slice();
  const kind = spec.kind == null ? FW_KIND.SPHERE : spec.kind;
  const colIdx = spec.colorIdx == null ? pickColorIndex(R) : spec.colorIdx;
  const base = FW_COLORS[colIdx % FW_COLORS.length];
  // ---- ascent: ballistic for ta seconds, ends at (pad.x+drift, burstH, ...)
  const ta = 0.92 + R() * 0.26;   // shorter climb so a shell lives ~3 s of show
  const burstH = spec.burstH || 100;
  const v0 = (burstH - pad[1] + 0.5 * G * ta * ta) / ta;
  const drift = [(R() - 0.5) * 5.0, (R() - 0.5) * 5.0];
  const p1 = [pad[0] + drift[0] * ta, pad[1] + v0 * ta - 0.5 * G * ta * ta, pad[2] + drift[1] * ta];
  // ---- burst particles: small grains, the density does the work
  const N = kind === FW_KIND.RING ? FW_LIMITS.burstRing : kind === FW_KIND.WILLOW ? FW_LIMITS.burstWillow : FW_LIMITS.burstSphere;
  const dir = new Float32Array(N * 3);
  const speed = new Float32Array(N);
  const drag = new Float32Array(N);
  const life = new Float32Array(N);
  const size = new Float32Array(N);
  const phase = new Float32Array(N);
  const pcol = new Float32Array(N * 3);
  const grav = kind === FW_KIND.WILLOW ? 14.0 : kind === FW_KIND.RING ? 5.2 : 5.8;
  // ring plane (only used by RING)
  const rn = unit(R);
  let rt1 = [1, 0, 0];
  if (Math.abs(rn[0]) > 0.9) rt1 = [0, 1, 0];
  let t1 = [rn[1] * rt1[2] - rn[2] * rt1[1], rn[2] * rt1[0] - rn[0] * rt1[2], rn[0] * rt1[1] - rn[1] * rt1[0]];
  const tl = Math.hypot(t1[0], t1[1], t1[2]) || 1;
  t1 = [t1[0] / tl, t1[1] / tl, t1[2] / tl];
  const t2 = [rn[1] * t1[2] - rn[2] * t1[1], rn[2] * t1[0] - rn[0] * t1[2], rn[0] * t1[1] - rn[1] * t1[0]];
  for (let i = 0; i < N; i++) {
    let d;
    if (kind === FW_KIND.RING) {
      const a = (i / N) * TAU + (R() - 0.5) * 0.05;
      const spread = (R() - 0.5) * 0.08;
      d = [
        Math.cos(a) * t1[0] + Math.sin(a) * t2[0] + rn[0] * spread,
        Math.cos(a) * t1[1] + Math.sin(a) * t2[1] + rn[1] * spread,
        Math.cos(a) * t1[2] + Math.sin(a) * t2[2] + rn[2] * spread,
      ];
    } else {
      d = unit(R);
    }
    const dl = Math.hypot(d[0], d[1], d[2]) || 1;
    dir[i * 3] = d[0] / dl; dir[i * 3 + 1] = d[1] / dl; dir[i * 3 + 2] = d[2] / dl;
    if (kind === FW_KIND.RING) { speed[i] = 40 + R() * 16; drag[i] = 0.92 + R() * 0.30; life[i] = 2.0 + R() * 0.8; size[i] = 0.95 + R() * 0.45; }
    else if (kind === FW_KIND.WILLOW) { speed[i] = 38 + R() * 20; drag[i] = 1.20 + R() * 0.45; life[i] = 2.8 + R() * 1.3; size[i] = 0.92 + R() * 0.46; }
    else { speed[i] = 46 + R() * 22; drag[i] = 0.70 + R() * 0.34; life[i] = 1.8 + R() * 1.0; size[i] = 0.98 + R() * 0.55; }
    phase[i] = R() * TAU;
    const w = R() * 0.22;
    const c = scaleCol(base, 0.92 + R() * 0.22, w, WHITE);
    pcol[i * 3] = c[0]; pcol[i * 3 + 1] = c[1]; pcol[i * 3 + 2] = c[2];
  }
  // ---- a handful of small glows: burst flash + crown sparks (never a big wash)
  const glowN = FW_LIMITS.glow;
  const gOff = new Float32Array(glowN * 3);
  const gSize = new Float32Array(glowN);
  const gCol = new Float32Array(glowN * 3);
  const gDelay = new Float32Array(glowN);
  const gLife = new Float32Array(glowN);
  for (let i = 0; i < glowN; i++) {
    const d = i === 0 ? [0, 0, 0] : unit(R);
    const r = i === 0 ? 0 : 2.5 + R() * 6.0;
    gOff[i * 3] = d[0] * r; gOff[i * 3 + 1] = d[1] * r * 0.7; gOff[i * 3 + 2] = d[2] * r;
    gSize[i] = i === 0 ? 10.0 + R() * 2.0 : 6.0 + R() * 4.0;
    gDelay[i] = i === 0 ? 0 : 0.04 + R() * 0.16;
    gLife[i] = i === 0 ? 0.34 : 0.30 + R() * 0.35;
    const w = 0.25 + R() * 0.35;
    const c = scaleCol(i === 1 ? FW_COLORS[4] : base, 1.05 + R() * 0.25, w, WHITE);
    gCol[i * 3] = c[0]; gCol[i * 3 + 1] = c[1]; gCol[i * 3 + 2] = c[2];
  }
  // ---- optional secondary (inner) burst
  const secN = spec.hasSecond ? FW_LIMITS.secondary : 0;
  const sIdx = new Uint8Array(secN);
  const sDir = new Float32Array(secN * 3);
  const sSpeed = new Float32Array(secN);
  const sLife = new Float32Array(secN);
  const sDrag = new Float32Array(secN);
  const sSize = new Float32Array(secN);
  const sCol = new Float32Array(secN * 3);
  const tau2 = secN ? 0.62 + R() * 0.26 : 0;
  if (secN) {
    const secBase = FW_COLORS[(colIdx + 4) % FW_COLORS.length];
    for (let i = 0; i < secN; i++) {
      sIdx[i] = i % N;
      const d = unit(R);
      sDir[i * 3] = d[0]; sDir[i * 3 + 1] = d[1]; sDir[i * 3 + 2] = d[2];
      sSpeed[i] = 16 + R() * 12;
      sLife[i] = 0.85 + R() * 0.6;
      sDrag[i] = 1.5 + R() * 0.5;
      sSize[i] = 0.9 + R() * 0.45;
      const c = scaleCol(secBase, 0.85 + R() * 0.25, R() * 0.25, WHITE);
      sCol[i * 3] = c[0]; sCol[i * 3 + 1] = c[1]; sCol[i * 3 + 2] = c[2];
    }
  }
  // ---- soft smoke: only 2-3 puffs sitting at the burst centre
  const smokeN = FW_LIMITS.smoke;
  const mDir = new Float32Array(smokeN * 3);
  const mSpeed = new Float32Array(smokeN);
  const mLife = new Float32Array(smokeN);
  const mSize = new Float32Array(smokeN);
  const mDelay = new Float32Array(smokeN);
  for (let i = 0; i < smokeN; i++) {
    const d = unit(R);
    mDir[i * 3] = d[0] * 0.5; mDir[i * 3 + 1] = d[1] * 0.5; mDir[i * 3 + 2] = d[2] * 0.5;
    mSpeed[i] = 1.5 + R() * 3.0;
    mLife[i] = 1.2 + R() * 0.8;
    mSize[i] = 26.0 + R() * 14.0;
    mDelay[i] = 0.02 + R() * 0.10;
  }
  return {
    t0: spec.t0, seed: spec.seed, pad, p1, kind, ta, v0, drift,
    trailN: FW_LIMITS.trail, N, dir, speed, drag, life, size, phase, pcol, grav,
    glowN, gOff, gSize, gCol, gDelay, gLife,
    secN, sIdx, sDir, sSpeed, sLife, sDrag, sSize, sCol, tau2,
    smokeN, mDir, mSpeed, mLife, mSize, mDelay,
    span: ta + tau2 + 5.0,
  };
}

// position of one burst particle at age tau (pure function of its tables)
function burstPos(s, i, tau, out) {
  const k = s.drag[i];
  const e = (1 - Math.exp(-k * tau)) / k;
  out[0] = s.p1[0] + s.dir[i * 3] * s.speed[i] * e;
  out[1] = s.p1[1] + s.dir[i * 3 + 1] * s.speed[i] * e - 0.5 * s.grav * tau * tau;
  out[2] = s.p1[2] + s.dir[i * 3 + 2] * s.speed[i] * e;
  return out;
}

/**
 * Push one shell's additive spark sprites at the given age into a Billboards
 * instance. Pure function of (shell, age): calling it twice at the same age
 * yields the same sequence (frozen-frame reproducibility).
 */
export function shellBillboards(shell, age, sink) {
  if (!(age >= 0)) return 0;
  const s = shell;
  // sink is a src/fx.js Billboards instance (or anything with add(...))
  const add = (x, y, z, size, rot, alpha, shape, col) => (sink.add(x, y, z, size, rot, alpha, shape, col), 1);
  let n = 0;
  // ---- ascent: a small bright grain with a dotted trail behind it
  if (age < s.ta) {
    const hx = s.pad[0] + s.drift[0] * age;
    const hy = s.pad[1] + s.v0 * age - 0.5 * G * age * age;
    const hz = s.pad[2] + s.drift[1] * age;
    n += add(hx, hy, hz, 2.4, 0, 1.0, 0, [1.75, 1.40, 0.72]);
    n += add(hx, hy, hz, 5.5, 0, 0.55, 1, [1.20, 0.95, 0.48]);
    const trailN = s.trailN;
    for (let j = 1; j < trailN; j++) {
      const back = j * 0.038 + j * j * 0.0005;
      const a2 = age - back;
      if (a2 < 0) continue;
      const f = j / trailN;
      const px = s.pad[0] + s.drift[0] * a2;
      const py = s.pad[1] + s.v0 * a2 - 0.5 * G * a2 * a2;
      const pz = s.pad[2] + s.drift[1] * a2;
      n += add(px, py, pz, 2.6 - f * 1.2, 0, (1 - f) * 0.85, 0, [1.45, 1.02, 0.46]);
    }
  }
  // ---- burst
  const tau = age - s.ta;
  if (tau >= 0) {
    // flash: one small hot glow at the centre
    if (tau < s.gLife[0]) {
      const a = 0.50 * (1 - tau / s.gLife[0]);
      n += add(s.p1[0], s.p1[1], s.p1[2], s.gSize[0] * (0.55 + 0.45 * (1 - a)), 0, a, 1,
        [s.gCol[0], s.gCol[1], s.gCol[2]]);
    }
    // crown: a few small glows, not a wash
    for (let i = 1; i < s.glowN; i++) {
      const t = tau - s.gDelay[i];
      if (t < 0 || t > s.gLife[i]) continue;
      const a = 0.34 * (1 - t / s.gLife[i]);
      n += add(s.p1[0] + s.gOff[i * 3], s.p1[1] + s.gOff[i * 3 + 1], s.p1[2] + s.gOff[i * 3 + 2],
        s.gSize[i] * (0.8 + 0.2 * (1 - a)), 0, a, 1, [s.gCol[i * 3], s.gCol[i * 3 + 1], s.gCol[i * 3 + 2]]);
    }
    if (tau < 7.0) {
      const out = [0, 0, 0];
      const sizeMul = FW_LIMITS.sparkSize;
      for (let i = 0; i < s.N; i++) {
        const li = s.life[i];
        if (tau > li) continue;
        burstPos(s, i, tau, out);
        if (out[1] < -30) continue;
        const fade = 1 - tau / li;
        let a = Math.pow(fade, 0.85) * 0.96;
        a *= 0.90 + 0.10 * Math.sin(tau * 18 + s.phase[i]);
        const sz = s.size[i] * sizeMul * (0.92 + 0.20 * (1 - Math.exp(-tau * 4.0)));
        n += add(out[0], out[1], out[2], sz, 0, clamp(a, 0, 1), 0,
          [s.pcol[i * 3], s.pcol[i * 3 + 1], s.pcol[i * 3 + 2]]);
        if (n >= 210) return n;
      }
      // ---- secondary (inner) burst
      if (s.secN) {
        const t2 = tau - s.tau2;
        if (t2 >= 0) {
          for (let j = 0; j < s.secN; j++) {
            const li = s.sLife[j];
            if (t2 > li) continue;
            const pi = s.sIdx[j];
            burstPos(s, pi, s.tau2, out);
            const k = s.sDrag[j];
            const e = (1 - Math.exp(-k * t2)) / k;
            const x = out[0] + s.sDir[j * 3] * s.sSpeed[j] * e;
            const y = out[1] + s.sDir[j * 3 + 1] * s.sSpeed[j] * e - 0.5 * 6.0 * t2 * t2;
            const z = out[2] + s.sDir[j * 3 + 2] * s.sSpeed[j] * e;
            const a = Math.pow(1 - t2 / li, 1.1) * (0.75 + 0.25 * Math.sin(t2 * 24 + j));
            n += add(x, y, z, s.sSize[j] * 2.5, 0, clamp(a, 0, 1), 0,
              [s.sCol[j * 3], s.sCol[j * 3 + 1], s.sCol[j * 3 + 2]]);
          }
        }
      }
    }
  }
  return n;
}

/**
 * Soft smoke: 2-3 puffs at the burst centre only (the lead's note: smoke must
 * not turn the sky into a nebula). Pure function of (shell, age).
 */
export function smokeBillboards(shell, age, sink) {
  if (!(age >= 0)) return 0;
  const s = shell;
  const add = (x, y, z, size, rot, alpha, shape, col) => (sink.add(x, y, z, size, rot, alpha, shape, col), 1);
  const tau = age - s.ta;
  if (tau < 0) return 0;
  let n = 0;
  for (let i = 0; i < s.smokeN; i++) {
    const li = s.mLife[i];
    const t = tau - s.mDelay[i];
    if (t < 0 || t > li) continue;
    const k = 1.4;
    const e = (1 - Math.exp(-k * t)) / k;
    const x = s.p1[0] + s.mDir[i * 3] * s.mSpeed[i] * e;
    const y = s.p1[1] + s.mDir[i * 3 + 1] * s.mSpeed[i] * e + t * 2.0;
    const z = s.p1[2] + s.mDir[i * 3 + 2] * s.mSpeed[i] * e;
    const fade = 1 - t / li;
    const a = fade * (0.16 + 0.08 * fade);
    n += add(x, y, z, s.mSize[i] * (0.85 + 0.35 * (t / li)), 0, clamp(a, 0, 0.24), 6, [0.66, 0.68, 0.76]);
  }
  return n;
}

// ---------------------------------------------------------------- auto cycle
// A fixed 48-shell cycle (period ~7 min) so any frozen time t maps to the same
// set of shells — and the sky keeps popping for a whole session.
export function buildAutoCycle(seed = 9151) {
  const R = mulberry32(seed);
  const shells = [];
  let t = FW_LIMITS.autoStart;
  for (let k = 0; k < 48; k++) {
    const gap = FW_LIMITS.autoMinGap + R() * (FW_LIMITS.autoMaxGap - FW_LIMITS.autoMinGap);
    const padIdx = Math.floor(R() * FW_PADS.length);
    const kr = R();
    const kind = kr < 0.20 ? FW_KIND.RING : kr < 0.46 ? FW_KIND.WILLOW : FW_KIND.SPHERE;
    const colorIdx = pickColorIndex(R);
    const burstH = 80 + R() * 62;
    const hasSecond = R() < 0.45;
    shells.push(buildShell({ t0: t, seed: 1201 + k * 977, pad: FW_PADS[padIdx], burstH, kind, colorIdx, hasSecond }));
    t += gap;
  }
  return { period: t, shells };
}

// shells visible at time t (deterministic lookup, no state)
export function visibleAuto(cycle, t) {
  const out = [];
  const P = cycle.period;
  const lo = t - 9.2, hi = t;
  const c0 = Math.floor(lo / P) * P;
  for (let c = c0 - P; c <= hi + P; c += P) {
    for (const s of cycle.shells) {
      const t0 = c + s.t0;
      if (t0 >= lo && t0 <= hi) out.push({ shell: s, age: t - t0 });
    }
  }
  return out;
}

/**
 * makeFireworks({ fw, seed, auto })
 *   fw    number | null   ?fw=N preloads N manual shells, 0 disables every
 *                         fireworks source (the F key is then a no-op)
 *   auto  boolean         automatic night shells (default true)
 *
 * Returns { system, smokeSystem, systems, autoCycle, manual, launch, volley, ... }
 */
export function makeFireworks(opts = {}) {
  const fwParam = opts.fw == null ? null : Number(opts.fw);
  const autoOn = opts.auto !== false && fwParam !== 0;
  const cycle = buildAutoCycle(opts.seed ?? 9151);
  const R = mulberry32((opts.seed ?? 9151) ^ 0x5bd1);
  const manual = [];
  let launched = 0;

  function shellAt(t, extra = {}) {
    if (fwParam === 0) return null;
    const seed = extra.seed != null ? extra.seed : 4001 + launched * 131;
    const pad = extra.pad || FW_PADS[(launched + Math.floor(R() * FW_PADS.length)) % FW_PADS.length];
    const kr = R();
    const kind = extra.kind != null ? extra.kind : kr < 0.18 ? FW_KIND.RING : kr < 0.42 ? FW_KIND.WILLOW : FW_KIND.SPHERE;
    const colorIdx = extra.colorIdx != null ? extra.colorIdx : pickColorIndex(R);
    const shell = buildShell({
      t0: t,
      seed,
      pad,
      burstH: extra.burstH != null ? extra.burstH : 82 + R() * 58,
      kind,
      colorIdx,
      hasSecond: extra.hasSecond != null ? extra.hasSecond : R() < 0.55,
    });
    manual.push(shell);
    launched++;
    return shell;
  }

  // single shell (kept for ?fw= preload / tooling)
  function launch(t, extra = {}) {
    return shellAt(t, extra);
  }

  // F key: a 2-3 shell volley, staggered so it reads as a proper show
  function volley(t, extra = {}) {
    if (fwParam === 0) return [];
    const n = extra.n != null ? extra.n : FW_LIMITS.volleyMin + Math.floor(R() * (FW_LIMITS.volleyMax - FW_LIMITS.volleyMin + 1));
    const basePad = extra.padIdx != null ? extra.padIdx : Math.floor(R() * FW_PADS.length);
    const out = [];
    for (let i = 0; i < n; i++) {
      const stagger = i * 0.15;                           // 0.15 s between shells
      const padIdx = (basePad + i * 2) % FW_PADS.length;  // different launch points
      out.push(shellAt(t + stagger, {
        seed: 9001 + launched * 331 + i * 47,
        pad: FW_PADS[padIdx],
        colorIdx: (pickColorIndex(R) + i * 3) % FW_COLORS.length,
        kind: i === 1 ? FW_KIND.WILLOW : i === 2 ? FW_KIND.RING : FW_KIND.SPHERE,
        burstH: 84 + i * 14 + R() * 26,
        hasSecond: true,
      }));
    }
    return out.filter(Boolean);
  }

  // ?fw=N pre-loads a deterministic volley of shells 0.72 s apart: at any
  // freeze there are ~2 fresh bursts + a couple of fading / rising ones, which
  // is what reads as a show; the sparks are small so density is safe now.
  const preload = fwParam == null ? 0 : Math.max(0, Math.min(24, Math.floor(fwParam)));
  for (let i = 0; i < preload; i++) {
    shellAt(1.15 + i * 0.72, { seed: 7001 + i * 53 });
  }

  const sharedFill = (t, bb) => {
    if (fwParam === 0) return 0;
    let n = 0;
    if (autoOn && ENV.night > 0.42) {
      for (const v of visibleAuto(cycle, t)) {
        n += shellBillboards(v.shell, v.age, bb);
        if (n >= FW_LIMITS.capacityPerFrame) return n;
      }
    }
    for (const s of manual) {
      const age = t - s.t0;
      if (age < 0 || age > 9) continue;
      n += shellBillboards(s, age, bb);
      if (n >= FW_LIMITS.capacityPerFrame) return n;
    }
    return n;
  };

  const sharedSmoke = (t, bb) => {
    if (fwParam === 0) return 0;
    let n = 0;
    if (autoOn && ENV.night > 0.42) {
      for (const v of visibleAuto(cycle, t)) n += smokeBillboards(v.shell, v.age, bb);
    }
    for (const s of manual) {
      const age = t - s.t0;
      if (age < 0 || age > 9) continue;
      n += smokeBillboards(s, age, bb);
    }
    return n;
  };

  const system = { name: 'fireworks', up: false, additive: true, fill: sharedFill };
  const smokeSystem = { name: 'fireworks-smoke', up: false, additive: false, fill: sharedSmoke };

  return {
    system,
    smokeSystem,
    systems: [system, smokeSystem],
    autoCycle: cycle,
    launched: () => launched,
    manual,
    launch,
    volley,
    preload,
    disabled: fwParam === 0,
  };
}

export default makeFireworks;
