// creatures-fish.js — airborne fish schools (OWNER: agent "fish").
// Contract: export function buildFish(b, ctx, rng)
//   b   : B builder for STATIC geometry (unused here — every fish is an instanced actor)
//   ctx : { gl, dyn: [], bbDyn: [], points: [], lanterns: [], props: {} }
//   rng : deterministic mulberry32 — never use Math.random
//
// Fish local space: nose +Z, tail -Z, width ±X, up +Y, centre line y = 0,
// local length ~2.28 u (nose z = +1.05 ... caudal tip z = -1.23).
// The tail wave comes from the instanced vertex shader (mode 1), so the mesh is
// authored nose-forward / tail-back; the body wave grows toward -Z automatically.
//
// Four instanced actors (one mesh per school colour):
//   fish-hero      cobalt-blue hero school beside the balustrade (view 9 subject)
//   fish-koi-blue  distant blue koi school over the boulevard
//   fish-koi-red   distant red koi school over the cathedral quarter
//   fish-koi-gold  distant gold koi school over the glass palace
import { C } from './palette.js';
import { B, mulc, mixc } from './geo.js';
import { mesh } from './gl.js';
import { trs } from './actor.js';
import { TAU, clamp, lerp, smoothstep, norm, cross, add, scale as vs, noise2 } from './math.js';

const FISH_MAT = [0.035, 0.62]; // faint self-glow + glossy wet scales
const FIN_MAT = [0.115, 0.45];  // thin membranes: a little glow so the shadow side stays blue
const SEGS = 12;                // segments around the girth (spec: 12)

// ---------------------------------------------------------------- body profile
// 12 rings from snout to caudal peduncle: [z, halfWidth, halfHeight, centreY]
const RINGS = [
  [1.010, 0.026, 0.038, 0.010],
  [0.950, 0.066, 0.104, 0.016],
  [0.865, 0.108, 0.178, 0.019],
  [0.750, 0.138, 0.244, 0.015],
  [0.605, 0.158, 0.292, 0.007],
  [0.435, 0.168, 0.318, 0.000],
  [0.250, 0.166, 0.320, -0.005],
  [0.060, 0.156, 0.302, -0.008],
  [-0.135, 0.138, 0.268, -0.006],
  [-0.315, 0.110, 0.226, 0.002],
  [-0.495, 0.074, 0.170, 0.013],
  [-0.660, 0.036, 0.092, 0.024],
];

// interpolated cross-section at an arbitrary z
function profAt(z) {
  const R = RINGS;
  if (z >= R[0][0]) return { w: R[0][1], h: R[0][2], cy: R[0][3] };
  for (let k = 0; k < R.length - 1; k++) {
    const z0 = R[k][0], z1 = R[k + 1][0];
    if (z <= z0 && z >= z1) {
      const t = (z0 - z) / (z0 - z1 || 1e-4);
      return {
        w: lerp(R[k][1], R[k + 1][1], t),
        h: lerp(R[k][2], R[k + 1][2], t),
        cy: lerp(R[k][3], R[k + 1][3], t),
      };
    }
  }
  const L = R[R.length - 1];
  return { w: L[1], h: L[2], cy: L[3] };
}

// analytic outward normal of the ring surface at (ring k, angle a)
function ringNormal(k, a) {
  const R = RINGS;
  const k0 = Math.max(0, k - 1), k1 = Math.min(R.length - 1, k + 1);
  const dzr = (R[k1][0] - R[k0][0]) || 1e-4;
  const wp = (R[k1][1] - R[k0][1]) / dzr;
  const hp = (R[k1][2] - R[k0][2]) / dzr;
  const cp = (R[k1][3] - R[k0][3]) / dzr;
  const w = R[k][1], h = R[k][2];
  const sa = Math.sin(a), ca = Math.cos(a);
  // N = (dP/da) x (dP/dz)
  return norm([h * ca, w * sa, -(w * sa * cp + w * hp * sa * sa + h * wp * ca * ca)]);
}

// ---------------------------------------------------------------- fish colours
// dark cobalt back -> saturated flank -> pale silver belly, plus an iridescent
// flank sheen, a pale lateral line and fine scale-row banding.
function bodyCol(pal, z, a) {
  const up = 0.5 + 0.5 * Math.sin(a);            // 0 = belly, 1 = back
  let c = mixc(pal.belly, pal.mid, smoothstep(0.04, 0.32, up));
  c = mixc(c, pal.back, smoothstep(0.36, 0.80, up));
  // iridescent sheen along the upper flank
  const flank = Math.exp(-Math.pow((up - 0.60) / 0.17, 2));
  c = mixc(c, pal.flank, 0.22 * flank);
  // lateral line: a pale line just above the middle flank
  const lat = Math.exp(-Math.pow((up - 0.51) / 0.055, 2));
  c = mixc(c, pal.line, 0.55 * lat);
  // scale rows: bands along the body x rows around the girth (cheap scale read)
  const rowB = Math.floor((z + 1.3) * 7.0);
  const colB = Math.floor((a / TAU) * 20 + 0.5);
  const alt = (rowB + colB) % 2 ? 1 : -1;
  const micro = 0.975 + 0.05 * noise2(z * 3.1 + 7.3, a * 1.7);
  return mulc(c, (1 + 0.038 * alt) * micro);
}

// ---------------------------------------------------------------- helpers
const vadd = (p, q) => [p[0] + q[0], p[1] + q[1], p[2] + q[2]];

// flat-ish disc facing n (used for eyes / glints)
function discFan(b, c, n, r, seg, col, mat, squash = 1) {
  const up = Math.abs(n[1]) > 0.92 ? [0, 0, 1] : [0, 1, 0];
  const t1 = norm(cross(up, n));
  const t2 = norm(cross(n, t1));
  const ic = b.vert(b.tp(c), b.tn(n), col, mat);
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    const p0 = vadd(c, vadd(vs(t1, Math.cos(a0) * r), vs(t2, Math.sin(a0) * r * squash)));
    const p1 = vadd(c, vadd(vs(t1, Math.cos(a1) * r), vs(t2, Math.sin(a1) * r * squash)));
    const i0 = b.vert(b.tp(p0), b.tn(n), col, mat);
    const i1 = b.vert(b.tp(p1), b.tn(n), col, mat);
    b.i.push(ic, i0, i1);
  }
}

// Sagittal fin membrane (base[] and tip[] are [y,z] pairs at x = 0).
// Built as two parallel sheets (x = ±thick, normals ±X) so it reads as a thin
// blade from both sides. Fin rays are flush colour/tint lines 1.2 mm proud of
// the membrane (never floating spikes when seen edge-on).
function finSheet(b, base, tip, mat, colNear, colFar, thick, rayEvery, rayCol) {
  const n = base.length;
  for (const sx of [-1, 1]) {
    const N = [sx, 0, 0];
    const x = sx * thick;
    for (let i = 0; i < n - 1; i++) {
      const t = (i + 1) / (n - 1);
      let cc = mixc(colNear, colFar, smoothstep(0.05, 0.92, t) * 0.9);
      cc = mulc(cc, i % 2 ? 0.94 : 1.04);          // membrane cell alternation = ray read
      b.quad(
        [x, base[i][0], base[i][1]], [x, base[i + 1][0], base[i + 1][1]],
        [x, tip[i + 1][0], tip[i + 1][1]], [x, tip[i][0], tip[i][1]],
        cc, mat, N
      );
    }
    if (rayEvery) {
      for (let i = 0; i < n; i += rayEvery) {
        const by = base[i][0], bz = base[i][1], ty = tip[i][0], tz = tip[i][1];
        const dy = ty - by, dz = tz - bz;
        const l = Math.hypot(dy, dz) || 1;
        const w = 0.005;
        const py = (dz / l) * w, pz = (-dy / l) * w;
        const xx = x + sx * 0.0012;
        b.quad(
          [xx, lerp(by, ty, 0.10) - py, lerp(bz, tz, 0.10) - pz],
          [xx, lerp(by, ty, 0.10) + py, lerp(bz, tz, 0.10) + pz],
          [xx, lerp(by, ty, 0.90) + py, lerp(bz, tz, 0.90) + pz],
          [xx, lerp(by, ty, 0.90) - py, lerp(bz, tz, 0.90) - pz],
          rayCol, mat, N
        );
      }
    }
  }
}

// fan-shaped fin (pectoral / pelvic): triangles from a root to an outer arc.
function finFan(b, root, tips, cols, mat) {
  for (let i = 0; i < tips.length - 1; i++) {
    b.tri(root, tips[i], tips[i + 1], cols[i], mat);
  }
}

// ---------------------------------------------------------------- body + head
function buildBody(b, pal) {
  const N = RINGS.length;
  const rows = [];
  for (let k = 0; k < N; k++) {
    const [z, w, h, cy] = RINGS[k];
    const row = [];
    for (let i = 0; i < SEGS; i++) {
      const a = (i / SEGS) * TAU;
      const p = [w * Math.cos(a), cy + h * Math.sin(a), z];
      row.push({ p, n: ringNormal(k, a), c: bodyCol(pal, z, a) });
    }
    rows.push(row);
  }
  // skin: ring k verts are shared by both neighbouring strips -> smooth shading
  const idx = rows.map((row) => row.map((q) => b.vert(b.tp(q.p), b.tn(q.n), q.c, FISH_MAT)));
  for (let k = 0; k < N - 1; k++) {
    for (let i = 0; i < SEGS; i++) {
      const j = (i + 1) % SEGS;
      const a0 = idx[k][i], a1 = idx[k][j], b0 = idx[k + 1][i], b1 = idx[k + 1][j];
      b.i.push(a0, a1, b1, a0, b1, b0);
    }
  }
  // snout cap: a small cone that closes the head (kept body-coloured so the
  // mouth is a separate dark slit, not a red nose)
  const tipY = RINGS[0][3] + 0.004, tipZ = RINGS[0][0] + 0.038;
  const tip = b.vert(b.tp([0, tipY, tipZ]), b.tn([0, 0, 1]), mulc(pal.mid, 0.92), FISH_MAT);
  for (let i = 0; i < SEGS; i++) {
    const j = (i + 1) % SEGS;
    b.i.push(idx[0][i], idx[0][j], tip);
  }
  // caudal peduncle cap (closed tail end, hidden by the caudal fin root)
  const pend = RINGS[N - 1];
  const ptip = b.vert(b.tp([0, pend[3], pend[0] - 0.012]), b.tn([0, 0, -1]), mulc(pal.mid, 0.7), FISH_MAT);
  for (let i = 0; i < SEGS; i++) {
    const j = (i + 1) % SEGS;
    b.i.push(idx[N - 1][i], ptip, idx[N - 1][j]);
  }
  // mouth: a dark gape sweep across the front of the snout, with a pale lower lip
  for (const s of [1, -1]) {
    for (let i = 0; i < 4; i++) {
      const u0 = i / 4, u1 = (i + 1) / 4;
      const a0 = lerp(-0.95, 0.55, u0), a1 = lerp(-0.95, 0.55, u1);
      const y0 = RINGS[0][3] + 0.036 * Math.sin(a0), y1 = RINGS[0][3] + 0.036 * Math.sin(a1);
      const p0 = [s * 0.028 * Math.cos(a0), y0 - 0.004, 1.014];
      const p1 = [s * 0.028 * Math.cos(a1), y1 - 0.004, 1.014];
      const p2 = [s * 0.020 * Math.cos(a1), y1 - 0.020, 0.972];
      const p3 = [s * 0.020 * Math.cos(a0), y0 - 0.020, 0.972];
      b.quad(p0, p1, p2, p3, i === 1 || i === 2 ? pal.mouth : mulc(pal.mouth, 0.9), FISH_MAT, [s * 0.55, -0.20, 0.81]);
      // pale lower lip just under the gape
      b.quad([p3[0], p3[1] - 0.002, p3[2] + 0.004], [p2[0], p2[1] - 0.002, p2[2] + 0.004],
        [p2[0], p2[1] - 0.014, p2[2] - 0.020], [p3[0], p3[1] - 0.014, p3[2] - 0.020],
        mulc(pal.belly, 0.94), FISH_MAT, [s * 0.4, -0.7, 0.6]);
    }
  }
}

// a soft pale jaw / throat wedge under the snout so the head reads from the side
function buildJaw(b, pal) {
  for (const s of [1, -1]) {
    const p0 = [s * 0.020, 0.002, 0.985];
    const p1 = [s * 0.050, 0.010, 0.930];
    const p2 = [s * 0.036, -0.038, 0.900];
    const p3 = [s * 0.008, -0.030, 0.975];
    b.quad(p0, p1, p2, p3, mulc(pal.belly, 0.97), FISH_MAT, [s * 0.35, -0.45, 0.82]);
  }
}

function buildGills(b, pal) {
  const N = 5;
  for (const s of [1, -1]) {
    const rim = [], back = [], nrm = [];
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      const z = 0.492 + 0.078 * Math.pow(Math.abs(2 * u - 1), 1.4);
      const pf = profAt(z);
      // sweep top -> bottom of THIS flank; s mirrors the x component, not the angle
      const aa = lerp(0.88, -0.60, u);
      const ca = Math.cos(aa), sa = Math.sin(aa);
      const p = [s * pf.w * ca * 1.004, pf.cy + pf.h * sa * 1.004, z];
      const n = norm([(s * ca) / pf.w, sa / pf.h, 0.10]);
      rim.push(p);
      back.push([p[0] + n[0] * 0.005, p[1] + n[1] * 0.005, p[2] + 0.016]);
      nrm.push(n);
    }
    for (let i = 0; i < N - 1; i++) {
      b.quad(rim[i], rim[i + 1], back[i + 1], back[i], pal.gill, FISH_MAT, nrm[i]);
      // pale opercle edge just in front of the dark gill slit
      const f0 = [rim[i][0] + nrm[i][0] * 0.006, rim[i][1] + nrm[i][1] * 0.006, rim[i][2] + 0.019];
      const f1 = [rim[i + 1][0] + nrm[i + 1][0] * 0.006, rim[i + 1][1] + nrm[i + 1][1] * 0.006, rim[i + 1][2] + 0.019];
      b.quad(f0, f1, back[i + 1], back[i], pal.line, FISH_MAT, nrm[i]);
    }
  }
}

function buildEyes(b, pal) {
  const z = 0.805;
  const pf = profAt(z);
  const a = 0.46;
  const ca = Math.cos(a), sa = Math.sin(a);
  for (const s of [1, -1]) {
    const p = [s * pf.w * ca * 0.982, pf.cy + pf.h * sa * 0.982, z];
    const n = norm([(s * ca) / pf.w, sa / pf.h, 0.70]);
    // amber iris ring, big dark pupil, single hard glint
    // the head surface curves away under a flat disc, so the iris is lifted
    // clear of the skin (otherwise the amber ring sinks and only the pupil shows)
    discFan(b, vadd(p, vs(n, 0.011)), n, 0.051, 10, pal.eyeRim, [0.03, 0.8], 0.86);
    discFan(b, vadd(p, vs(n, 0.019)), n, 0.030, 10, pal.pupil, [0.0, 0.9]);
    discFan(b, vadd(vadd(p, vs(n, 0.023)), [s * 0.003, 0.011, 0.004]), n, 0.0085, 4, C.dressWhite, [0.4, 0.9]);
  }
}

// ---------------------------------------------------------------- fins
function buildDorsal(b, pal) {
  const zs = [0.360, 0.320, 0.260, 0.220, 0.160, 0.120, 0.060, 0.020, -0.040, -0.080, -0.140, -0.190, -0.250, -0.300, -0.360, -0.410, -0.455];
  const hs = [0.215, 0.180, 0.215, 0.180, 0.205, 0.170, 0.190, 0.160, 0.180, 0.145, 0.165, 0.140, 0.150, 0.120, 0.125, 0.085, 0.050];
  const base = [], tip = [];
  for (let i = 0; i < zs.length; i++) {
    const z = zs[i];
    const pf = profAt(z);
    const by = pf.cy + pf.h - 0.020;
    base.push([by, z]);
    const sweep = 0.026 + hs[i] * 0.46;
    tip.push([by + 0.010 + hs[i], z - sweep]);
  }
  finSheet(b, base, tip, FIN_MAT, mulc(pal.fin, 0.86), pal.finTip, 0.0065, 2, mulc(pal.fin, 0.66));
}

function buildAnal(b, pal) {
  const zs = [-0.270, -0.320, -0.365, -0.405, -0.450, -0.490, -0.530, -0.565];
  const hs = [0.130, 0.095, 0.120, 0.090, 0.105, 0.075, 0.070, 0.040];
  const base = [], tip = [];
  for (let i = 0; i < zs.length; i++) {
    const z = zs[i];
    const pf = profAt(z);
    const by = pf.cy - pf.h + 0.018;
    base.push([by, z]);
    tip.push([by - 0.008 - hs[i], z - 0.026 - hs[i] * 0.34]);
  }
  finSheet(b, base, tip, FIN_MAT, mulc(pal.fin, 0.86), mixc(pal.finTip, pal.fin, 0.18), 0.006, 2, mulc(pal.fin, 0.66));
}

function buildCaudal(b, pal) {
  const hub = [0.022, -0.665];
  // forked tail outline: root-low -> lower leading edge -> lower tip ->
  // concave trailing edge -> fork notch -> trailing edge -> upper tip ->
  // upper leading edge -> root-high
  const rim = [
    [0.030, -0.700], [-0.070, -0.792], [-0.160, -0.900], [-0.250, -1.010],
    [-0.325, -1.108], [-0.372, -1.190], [-0.380, -1.228],
    [-0.302, -1.158], [-0.205, -1.098], [-0.100, -1.050], [0.006, -1.018],
    [0.100, -1.048], [0.205, -1.098], [0.302, -1.158], [0.380, -1.228],
    [0.372, -1.190], [0.325, -1.108], [0.250, -1.010], [0.160, -0.900],
    [0.070, -0.792], [0.030, -0.700],
  ];
  const hubP = [0.0, hub[0], hub[1]];
  for (const sx of [-1, 1]) {
    const N = [sx, 0, 0];
    const x = sx * 0.006;
    for (let i = 0; i < rim.length; i++) {
      const j = (i + 1) % rim.length;
      const rr = Math.hypot(rim[i][0] - hub[0], rim[i][1] - hub[1]);
      const t = clamp(rr / 0.60, 0, 1);
      let cc = mixc(mixc(pal.fin, pal.back, 0.28), pal.finTip, smoothstep(0.10, 0.95, t) * 0.9);
      cc = mulc(cc, i % 2 ? 0.93 : 1.05);           // alternating sectors = fin rays
      b.tri(hubP, [x, rim[i][0], rim[i][1]], [x, rim[j][0], rim[j][1]], cc, FIN_MAT, N);
    }
    // five flush fin-ray lines running into the lobes
    for (let i = 1; i < rim.length; i += 4) {
      const y0 = lerp(hub[0], rim[i][0], 0.16), z0 = lerp(hub[1], rim[i][1], 0.16);
      const y1 = lerp(hub[0], rim[i][0], 0.90), z1 = lerp(hub[1], rim[i][1], 0.90);
      const dy = y1 - y0, dz = z1 - z0;
      const l = Math.hypot(dy, dz) || 1;
      const w = 0.006;
      const py = (dz / l) * w, pz = (-dy / l) * w;
      const xx = x + sx * 0.0012;
      b.quad([xx, y0 - py, z0 - pz], [xx, y0 + py, z0 + pz], [xx, y1 + py, z1 + pz], [xx, y1 - py, z1 - pz],
        mulc(pal.fin, 0.68), FIN_MAT, N);
    }
  }
}

function buildPelvic(b, pal) {
  for (const s of [1, -1]) {
    const pf = profAt(0.055);
    const root = [s * 0.060, pf.cy - pf.h + 0.018, 0.055];
    const tips = [
      [s * 0.140, -0.408, -0.045],
      [s * 0.108, -0.442, -0.135],
      [s * 0.062, -0.402, -0.200],
    ];
    finFan(b, root, tips, [mulc(pal.fin, 0.84), mixc(pal.fin, pal.finTip, 0.4), mulc(pal.fin, 0.8)], FIN_MAT);
    // flush ray
    const p0 = [s * 0.095, -0.372, -0.072], p1 = [s * 0.090, -0.392, -0.150];
    const dy = p1[1] - p0[1], dz = p1[2] - p0[2];
    const l = Math.hypot(dy, dz) || 1;
    const w = 0.005;
    const py = (dz / l) * w, pz = (-dy / l) * w;
    b.quad([p0[0], p0[1] - py, p0[2] - pz], [p0[0], p0[1] + py, p0[2] + pz],
      [p1[0], p1[1] + py, p1[2] + pz], [p1[0], p1[1] - py, p1[2] - pz],
      mulc(pal.fin, 0.62), FIN_MAT, [s, 0, 0]);
  }
}

function buildPectoral(b, pal) {
  const pf = profAt(0.300);
  for (const s of [1, -1]) {
    const root = [s * (pf.w - 0.010), pf.cy - 0.028, 0.300];
    const tips = [
      [s * 0.258, -0.128, 0.132],
      [s * 0.298, -0.190, 0.040],
      [s * 0.272, -0.222, -0.058],
      [s * 0.205, -0.204, -0.128],
    ];
    finFan(b, root, tips, [mulc(pal.fin, 0.82), mulc(pal.fin, 0.78), mixc(pal.fin, pal.finTip, 0.35), mulc(pal.fin, 0.74)], FIN_MAT);
    for (let i = 0; i < 2; i++) {
      const t = tips[i + 1];
      const m0 = [lerp(root[0], t[0], 0.30), lerp(root[1], t[1], 0.30), lerp(root[2], t[2], 0.30)];
      const m1 = [lerp(root[0], t[0], 0.95), lerp(root[1], t[1], 0.95), lerp(root[2], t[2], 0.95)];
      const dy = m1[1] - m0[1], dz = m1[2] - m0[2];
      const l = Math.hypot(dy, dz) || 1;
      const w = 0.005;
      const py = (dz / l) * w, pz = (-dy / l) * w;
      b.quad([m0[0], m0[1] - py, m0[2] - pz], [m0[0], m0[1] + py, m0[2] + pz],
        [m1[0], m1[1] + py, m1[2] + pz], [m1[0], m1[1] - py, m1[2] - pz],
        mulc(pal.fin, 0.6), FIN_MAT, [s, 0.25, 0]);
    }
  }
}

function buildAdipose(b, pal) {
  const base = [], tip = [];
  for (const z of [-0.470, -0.520, -0.565]) {
    const pf = profAt(z);
    const by = pf.cy + pf.h - 0.022;
    base.push([by, z]);
    tip.push([by + (z === -0.520 ? 0.062 : 0.026), z - 0.018]);
  }
  finSheet(b, base, tip, FIN_MAT, mulc(pal.fin, 0.82), mixc(pal.fin, pal.finTip, 0.3), 0.005, 0, pal.finTip);
}

// ---------------------------------------------------------------- palette sets
export const FISH_PALETTES = {
  cobalt: {
    back: mixc(C.koiBlue, C.zenith, 0.52),
    mid: mixc(C.koiBlue, C.waterDeep, 0.34),
    belly: mixc(mixc(C.koiWhite, C.ballSky, 0.55), C.koiBlue, 0.10),
    flank: mixc(C.glass, C.ballSky, 0.40),
    line: mixc(C.koiWhite, C.glass, 0.40),
    fin: mixc(C.koiBlue, C.waterDeep, 0.26),
    finTip: mixc(C.ballSky, C.glass, 0.35),
    gill: mulc(mixc(C.koiBlue, C.zenith, 0.55), 0.42),
    eyeRim: mixc(C.koiGold, C.bronze, 0.30),
    pupil: C.catBlack,
    mouth: mixc(C.catBlack, C.waterDeep, 0.35),
  },
  koiBlue: {
    back: C.koiBlue,
    mid: mixc(C.koiBlue, C.ballSky, 0.18),
    belly: mixc(C.koiWhite, C.dressWhite, 0.40),
    flank: mixc(C.glass, C.koiWhite, 0.40),
    line: mixc(C.koiWhite, C.glass, 0.30),
    fin: mixc(C.koiBlue, C.koiWhite, 0.40),
    finTip: mixc(C.ballSky, C.dressWhite, 0.40),
    gill: mulc(mixc(C.koiBlue, C.zenith, 0.45), 0.45),
    eyeRim: mixc(C.koiGold, C.bronze, 0.3),
    pupil: C.catBlack,
    mouth: mixc(C.catBlack, C.waterDeep, 0.3),
  },
  koiRed: {
    back: C.koiRed,
    mid: mixc(C.koiRed, C.koiGold, 0.16),
    belly: mixc(C.koiWhite, C.dressWhite, 0.42),
    flank: mixc(C.koiGold, C.koiWhite, 0.55),
    line: mixc(C.koiWhite, C.koiGold, 0.30),
    fin: mixc(C.koiRed, C.koiWhite, 0.42),
    finTip: mixc(C.koiWhite, C.koiGold, 0.30),
    gill: mulc(mixc(C.koiRed, C.catBlack, 0.20), 0.55),
    eyeRim: mixc(C.koiGold, C.bronze, 0.25),
    pupil: C.catBlack,
    mouth: mixc(C.catBlack, C.koiRed, 0.26),
  },
  koiGold: {
    back: C.koiGold,
    mid: mixc(C.koiGold, C.goldBright, 0.32),
    belly: mixc(C.koiWhite, C.dressWhite, 0.50),
    flank: mixc(C.goldBright, C.koiWhite, 0.45),
    line: mixc(C.koiWhite, C.goldBright, 0.32),
    fin: mixc(C.koiGold, C.koiWhite, 0.38),
    finTip: mixc(C.goldBright, C.dressWhite, 0.40),
    gill: mulc(mixc(C.koiGold, C.bronze, 0.28), 0.55),
    eyeRim: mixc(C.koiGold, C.dressWhite, 0.35),
    pupil: C.catBlack,
    mouth: mixc(C.catBlack, C.koiGold, 0.28),
  },
};

// ---------------------------------------------------------------- geometry entry
// Builds ONE fish into b. Exported for tools/fish-check.mjs.
export function fishGeom(b, pal) {
  b.note('fish');
  buildBody(b, pal);
  buildJaw(b, pal);
  buildGills(b, pal);
  buildEyes(b, pal);
  buildDorsal(b, pal);
  buildAnal(b, pal);
  buildCaudal(b, pal);
  buildPelvic(b, pal);
  buildPectoral(b, pal);
  buildAdipose(b, pal);
  return b;
}

// ---------------------------------------------------------------- schools
// Hero school sits beside the belvedere: centre (18, 36.5, 77), an ellipse
// 13 x 7 m, fish gliding 34-40 m up — the subject of viewpoint 9.
const SCHOOL_SPECS = [
  {
    // 1.2-2.2 m fish (local length 2.28 u => scale 0.53-0.96): a school of small
    // cobalt fish gliding beside the belvedere, clear of the balloon fan.
    name: 'fish-hero', pal: 'cobalt', n: 13,
    cx: 19.5, cy: 36.6, cz: 76.0, rx: 7.4, rz: 4.4,
    dir: 1, spd: 0.072, scBase: 0.88, scVar: 0.17, scMin: 0.70, scMax: 1.05,
    altSpread: 2.2, bobAmp: 0.80, swayMin: 0.22, swayMax: 0.30, groups: 3,
    bank: 0.20, yawJit: 0.05, pitchAmp: 0.055,
  },
  {
    name: 'fish-koi-blue', pal: 'koiBlue', n: 10,
    cx: 0, cy: 50, cz: 44, rx: 46, rz: 22,
    dir: -1, spd: 0.140, scBase: 1.48, scVar: 0.10, scMin: 1.35, scMax: 1.62,
    altSpread: 3.0, bobAmp: 1.3, swayMin: 0.20, swayMax: 0.28, groups: 3,
    bank: 0.24, yawJit: 0.06, pitchAmp: 0.06,
  },
  {
    name: 'fish-koi-red', pal: 'koiRed', n: 11,
    cx: -62, cy: 56, cz: -42, rx: 112, rz: 76,
    dir: -1, spd: 0.075, scBase: 1.72, scVar: 0.10, scMin: 1.55, scMax: 1.90,
    altSpread: 3.0, bobAmp: 1.5, swayMin: 0.19, swayMax: 0.27, groups: 3,
    bank: 0.26, yawJit: 0.07, pitchAmp: 0.07,
  },
  {
    name: 'fish-koi-gold', pal: 'koiGold', n: 9,
    cx: 62, cy: 61, cz: 18, rx: 152, rz: 104,
    dir: 1, spd: 0.052, scBase: 2.00, scVar: 0.09, scMin: 1.85, scMax: 2.20,
    altSpread: 2.4, bobAmp: 1.6, swayMin: 0.18, swayMax: 0.26, groups: 3,
    bank: 0.24, yawJit: 0.06, pitchAmp: 0.07,
  },
];

// deterministic school population (rng draws are fixed-order)
function makeSchool(rng, s) {
  const fish = [];
  let rem = s.n;
  let gi = 0;
  while (rem > 0) {
    const gs = Math.min(rem, 4 + ((rng() * 2) | 0));   // clusters of 4-5
    rem -= gs;
    // clusters sit at evenly spaced phases around the orbit (plus jitter), so
    // the school always surrounds the viewpoint's look point instead of
    // bunching on one side of the ellipse
    const gA = (gi / s.groups) * TAU + (rng() - 0.5) * 0.55;
    const gR = 0.88 + rng() * 0.14;
    gi++;
    for (let i = 0; i < gs; i++) {
      fish.push({
        a0: gA + (rng() - 0.5) * 0.12,
        rj: gR * (0.96 + rng() * 0.07),
        h: (rng() - 0.5) * s.altSpread,
        sc: clamp(s.scBase * (1 - s.scVar + rng() * 2 * s.scVar), s.scMin, s.scMax),
        ph: rng() * TAU,
        phase01: rng(),
        sway: s.swayMin + rng() * (s.swayMax - s.swayMin),
        spdMul: 0.92 + rng() * 0.16,
        bob: s.bobAmp * (0.45 + rng() * 0.55),
        yawJit: (rng() - 0.5) * 2 * s.yawJit,
        pitchAmp: s.pitchAmp * (0.6 + rng() * 0.8),
        bank: s.bank * (0.75 + rng() * 0.5),
      });
    }
  }
  return { ...s, fish };
}

// Build every school descriptor from the deterministic rng (exported for check).
export function fishSchools(rng) {
  return SCHOOL_SPECS.map((s) => makeSchool(rng, s));
}

// Pose of one fish at time t (exported so the check tool can validate motion).
export function fishPose(s, f, t) {
  const wob = Math.sin(t * 0.19 + f.ph) * 0.05;
  const a = f.a0 + s.dir * s.spd * t * f.spdMul + wob;
  const ca = Math.cos(a), sa = Math.sin(a);
  const px = s.cx + ca * s.rx * f.rj;
  const pz = s.cz + sa * s.rz * f.rj;
  const py = s.cy + f.h + Math.sin(t * 0.42 + f.ph) * f.bob;
  const vx = -sa * s.rx * s.dir * f.spdMul;
  const vz = ca * s.rz * s.dir * f.spdMul;
  const yaw = Math.atan2(vx, vz) + f.yawJit + Math.sin(t * 1.3 + f.ph) * 0.04;
  const pitch = Math.sin(t * 0.85 + f.ph) * f.pitchAmp;
  const roll = s.dir * f.bank + Math.sin(t * 1.15 + f.ph * 1.6) * 0.04;
  return { pos: [px, py, pz], yaw, scale: f.sc, pitch, roll, phase: f.phase01, sway: f.sway };
}

// ---------------------------------------------------------------- entry
export function buildFish(b, ctx, rng) {
  const gl = ctx.gl;
  if (!gl || !ctx.dyn) return;
  const schools = fishSchools(rng);
  let tris = 0;
  for (const s of schools) {
    const pal = FISH_PALETTES[s.pal];
    const nb = new B();
    fishGeom(nb, pal);
    tris = nb.i.length / 3;
    const r = nb.build(gl);
    const m = mesh(gl, r.verts, r.indices);
    ctx.dyn.push({
      name: s.name,
      kind: 'inst',
      mesh: m,
      capacity: s.fish.length,
      fill(t, act) {
        let k = 0;
        for (const f of s.fish) {
          const p = fishPose(s, f, t);
          // last arg 1 = fish tail-wave mode; phase 0..1, sway = tail amplitude
          act.set(k, trs(p.pos, p.yaw, p.scale, p.pitch, p.roll), p.phase, p.sway, 1, 1);
          k++;
        }
        return k;
      },
    });
  }
  console.log('[fish] ' + schools.map((s) => s.name + '(' + s.fish.length + ')').join(' ') +
    ' tris/mesh=' + tris);
}