// night-lights.js — round 6 · "万家灯火" layer.
//
// One static additive mesh holding every lit city window (collected by
// src/arch.js while the world was built) plus a handful of warm street-lamp
// glows.  main.js draws it through the existing add pass with
//   uAddMode = 1, uNightGlow = daynight.state.glow
// so at uNightGlow = 0 (daylight) the layer contributes exactly zero — the
// daytime frame is byte-identical to round 5, and the mesh is rebuilt only once.
//
// Everything here is pure + deterministic: the same window list and seed always
// produce the same vertex buffer (tools/night-check.mjs hashes it twice).
import { B } from './geo.js';
import { mesh } from './gl.js';
import { mulberry32, TAU } from './math.js';
import { NIGHT_WIN } from './arch.js';
import { L } from './layout.js';
import { rgb } from './geo.js';

export const NIGHT_LIMITS = {
  windows: 12000,   // hard cap on lit-window quads (2 tris each)
  lamps: 220,       // hard cap on lamp glows
  seed: 7719,
  litRatio: 0.70,   // ~70% of the sampled windows are switched on
};

// deterministic uniform sampling of the collected window list
export function sampleWindows(list, limit = NIGHT_LIMITS.windows) {
  const total = list.length;
  if (total <= limit) return { picks: list, used: total, total, stride: 1 };
  const stride = Math.ceil(total / limit);
  const picks = [];
  for (let i = 0; i < total; i += stride) picks.push(list[i]);
  return { picks, used: picks.length, total, stride };
}

// street lamps that already exist in the city mesh: boulevard allée, plaza ring,
// the four terrace lamp standards. Positions mirror city.js / terrace.js.
export function lampPositions() {
  const out = [];
  const pz = L.plaza.z, px = L.plaza.x;
  for (const sx of [-1, 1]) {
    for (let z = 82; z > -204; z -= 19) {
      if (Math.abs(z - pz) < 30) continue;
      if (Math.abs(z + 232) < 24) continue;
      out.push([sx * 12.2, 4.55, z, 1.0]);
    }
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    out.push([px + Math.cos(a) * 20.5, 4.95, pz + Math.sin(a) * 20.5, 1.05]);
  }
  // terrace lamp standards (terrace.js lampStandard: globe at Y0 + 4.18)
  const Y0 = L.terrace.y;
  const railZ = (x) => {
    const BOWH = 34, BOW = 9.0, EDGE = 93.0;
    const ax = Math.abs(x);
    if (ax >= BOWH) return EDGE;
    return EDGE - BOW * Math.pow(Math.cos((Math.PI * 0.5 * ax) / BOWH), 1.3);
  };
  out.push([-20.0, Y0 + 4.18, railZ(-20.0) - 1.15, 1.25]);
  out.push([20.0, Y0 + 4.18, railZ(20.0) - 1.15, 1.25]);
  out.push([-38.4, Y0 + 4.18, 93.0 - 1.4, 1.25]);
  out.push([38.4, Y0 + 4.18, 93.0 - 1.4, 1.25]);
  return out.slice(0, NIGHT_LIMITS.lamps);
}

// radial glow: a triangle fan with a bright centre and black rim, so the
// additive result has a soft falloff with no texture and no hard quad edge.
function glowDisc(b, cx, cy, cz, r, axis, colHot, mat) {
  const n = axis === 0 ? [0, 0, 1] : [1, 0, 0];
  const t1 = axis === 0 ? [1, 0, 0] : [0, 0, 1];
  const t2 = [0, 1, 0];
  const seg = 8;
  const rim = [0, 0, 0];
  const ic = b.vert([cx, cy, cz], n, colHot, mat);
  const ring = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * TAU;
    const c = Math.cos(a) * r, s = Math.sin(a) * r;
    ring.push(b.vert(
      [cx + t1[0] * c + t2[0] * s, cy + t1[1] * c + t2[1] * s, cz + t1[2] * c + t2[2] * s],
      n, rim, mat,
    ));
  }
  for (let i = 0; i < seg; i++) b.i.push(ic, ring[i], ring[i + 1]);
}

// Pure data build (no GL) — this is what tools/night-check.mjs exercises.
export function buildNightData(opts = {}) {
  const list = opts.windows || NIGHT_WIN.list;
  const seed = opts.seed ?? NIGHT_LIMITS.seed;
  const maxWindows = opts.maxWindows ?? NIGHT_LIMITS.windows;
  const R = mulberry32(seed);
  const b = new B();
  b.note('night-windows');
  const sample = sampleWindows(list, maxWindows);
  const WARM = [1.0, 0.76, 0.44];
  const AMBER = [1.0, 0.63, 0.30];
  const COOL = [0.66, 0.79, 1.0];
  let lit = 0, dark = 0;
  for (const win of sample.picks) {
    const c = win.c, n = win.n, t = win.t;
    if (!c || !n || !t) { dark++; continue; }
    if (R() < 1 - NIGHT_LIMITS.litRatio) { dark++; continue; }
    const k = 0.45 + R() * 0.55;
    const pick = R();
    const base = pick < 0.10 ? COOL : pick < 0.55 ? WARM : AMBER;
    const j = 0.90 + R() * 0.20;
    const col = [base[0] * k * j, base[1] * k * j, base[2] * k * j];
    // window "up" = normal x tangent (both collected in world space)
    let ux = n[1] * t[2] - n[2] * t[1];
    let uy = n[2] * t[0] - n[0] * t[2];
    let uz = n[0] * t[1] - n[1] * t[0];
    const ul = Math.hypot(ux, uy, uz) || 1;
    ux /= ul; uy /= ul; uz /= ul;
    const hw = win.w * 0.55, hh = win.h * 0.58;
    const ox = c[0] + n[0] * 0.07, oy = c[1] + n[1] * 0.07, oz = c[2] + n[2] * 0.07;
    const P = (sx, sy) => [
      ox + t[0] * hw * sx + ux * hh * sy,
      oy + t[1] * hw * sx + uy * hh * sy,
      oz + t[2] * hw * sx + uz * hh * sy,
    ];
    b.quad(P(-1, -1), P(1, -1), P(1, 1), P(-1, 1), col, [k, 0], n);
    lit++;
  }
  // ---- warm street lamps
  const LAMP_COL = rgb('#ffd9a0');
  const LAMP_HOT = [LAMP_COL[0] * 0.85, LAMP_COL[1] * 0.72, LAMP_COL[2] * 0.50];
  const lamps = lampPositions();
  for (const [x, y, z, s] of lamps) {
    const r = 2.1 * s;
    glowDisc(b, x, y, z, r, 0, LAMP_HOT, [1.0, 0]);
    glowDisc(b, x, y, z, r, 1, LAMP_HOT, [1.0, 0]);
  }
  const built = b.build();
  return {
    verts: built.verts,
    indices: built.indices,
    stats: {
      windows: lit,
      dark,
      sampled: sample.used,
      collected: sample.total,
      stride: sample.stride,
      lamps: lamps.length,
      tris: built.indices.length / 3,
      verts: built.verts.length / 11,
    },
  };
}

// GL wrapper used by main.js
export function buildNightLights(gl, opts = {}) {
  const data = buildNightData(opts);
  const m = mesh(gl, data.verts, data.indices);
  return { mesh: m, stats: data.stats };
}

export default buildNightLights;
