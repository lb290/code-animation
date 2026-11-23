// lib3d.js — generic geometry helpers shared by every content module.
// Kept separate from geo.js so content modules can import them read-only.
import { TAU, norm, sub, cross, add, scale as vs, dot, mulberry32, catmull } from './math.js';
import { mulc, mixc } from './geo.js';

// Material presets. mat = [emissive, gloss] — see lit.fs.glsl.
export const MT = {
  matte:   [0.00, 0.05],
  stone:   [0.00, 0.10],
  polish:  [0.00, 0.26],
  gloss:   [0.00, 0.52],
  marble:  [0.00, 0.20],
  metal:   [0.00, 0.70],
  gold:    [0.06, 0.86],
  glass:   [0.12, 0.95],
  lit:     [0.55, 0.10],
  warm:    [0.75, 0.10],
  glow:    [1.00, 0.00],
  skin:    [0.00, 0.16],
  cloth:   [0.00, 0.06],
  leaf:    [0.00, 0.12],
};

// ---------------------------------------------------------------- curves
export function catmullPts(pts, samples, closed = true) {
  const src = closed ? [...pts, pts[0]] : pts;
  const out = [];
  const n = samples | 0;
  for (let i = 0; i < n; i++) out.push(catmull(src, i / n));
  return out;
}

export function bez3(p0, p1, p2, p3, tt) {
  const u = 1 - tt;
  const a = u * u * u, bq = 3 * u * u * tt, cq = 3 * u * tt * tt, dq = tt * tt * tt;
  return [a * p0[0] + bq * p1[0] + cq * p2[0] + dq * p3[0],
          a * p0[1] + bq * p1[1] + cq * p2[1] + dq * p3[1],
          a * p0[2] + bq * p1[2] + cq * p2[2] + dq * p3[2]];
}

export function bez2(p0, p1, p2, tt) {
  const u = 1 - tt;
  return [u*u*p0[0] + 2*u*tt*p1[0] + tt*tt*p2[0],
          u*u*p0[1] + 2*u*tt*p1[1] + tt*tt*p2[1],
          u*u*p0[2] + 2*u*tt*p1[2] + tt*tt*p2[2]];
}

// ---------------------------------------------------------------- solids
// Ellipsoid centred on the origin (y up). opts.v0/v1 clip the vertical range
// (0..1) so a sphere can become a dome or a bowl.
export function ellipsoid(b, rx, ry, rz, su, sv, col, mat, opts = {}) {
  const v0 = opts.v0 ?? 0, v1 = opts.v1 ?? 1;
  const colFn = opts.colFn || null;
  const rings = [];
  for (let j = 0; j <= sv; j++) {
    const v = v0 + (v1 - v0) * (j / sv);
    const phi = (v - 0.5) * Math.PI;
    const cy = Math.sin(phi) * ry, cr = Math.cos(phi);
    const row = [];
    for (let i = 0; i <= su; i++) {
      const th = (i / su) * TAU;
      row.push([Math.cos(th) * cr * rx, cy, Math.sin(th) * cr * rz]);
    }
    rings.push(row);
  }
  for (let j = 0; j < sv; j++) {
    for (let i = 0; i < su; i++) {
      const p00 = rings[j][i], p10 = rings[j][i + 1], p01 = rings[j + 1][i], p11 = rings[j + 1][i + 1];
      const cc = colFn ? colFn((j + 0.5) / sv, (i + 0.5) / su) : col;
      const nrm = (p) => norm([p[0] / (rx * rx), p[1] / (ry * ry), p[2] / (rz * rz)]);
      b.tri(p00, p01, p11, cc, mat, nrm(p00), nrm(p01), nrm(p11));
      b.tri(p00, p11, p10, cc, mat, nrm(p00), nrm(p11), nrm(p10));
    }
  }
}

// Sweep a circle along a polyline with parallel-transport frames.
// radii: number | array (same length as pts) | fn(t in 0..1)
export function tubePath(b, pts, radii, seg, col, mat, opts = {}) {
  const n = pts.length;
  if (n < 2) return;
  const rad = (i) => {
    const t = i / (n - 1);
    if (typeof radii === 'number') return radii;
    if (typeof radii === 'function') return radii(t);
    return radii[Math.min(n - 1, i)];
  };
  const colFn = opts.colFn || null;
  const tan = pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], c2 = pts[Math.min(n - 1, i + 1)];
    return norm(sub(c2, a));
  });
  let ref = Math.abs(dot(tan[0], [0, 1, 0])) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  let u = norm(cross(tan[0], ref));
  let v = norm(cross(tan[0], u));
  const rings = [];
  for (let i = 0; i < n; i++) {
    u = norm(sub(u, vs(tan[i], dot(u, tan[i]))));
    v = norm(cross(tan[i], u));
    const r = rad(i);
    const ring = [];
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * TAU;
      ring.push(add(pts[i], add(vs(u, Math.cos(a) * r), vs(v, Math.sin(a) * r))));
    }
    rings.push(ring);
  }
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < seg; k++) {
      const p00 = rings[i][k], p10 = rings[i][k + 1], p01 = rings[i + 1][k], p11 = rings[i + 1][k + 1];
      const t = (i + 0.5) / (n - 1);
      const cc = colFn ? colFn(t, k / seg) : col;
      b.tri(p00, p01, p11, cc, mat);
      b.tri(p00, p11, p10, cc, mat);
    }
  }
  if (opts.caps !== false) {
    for (const pair of [[0, -1], [n - 1, 1]]) {
      const idx = pair[0], dir = pair[1];
      const c0 = pts[idx];
      const cc = colFn ? colFn(idx / (n - 1), 0) : col;
      for (let k = 0; k < seg; k++) {
        const a0 = rings[idx][k], a1 = rings[idx][k + 1];
        const N = vs(tan[idx], dir);
        b.tri(c0, a0, a1, mulc(cc, 0.92), mat, N, N, N);
      }
    }
  }
}

// Flat disc / annulus in the XZ plane at y=0 (facing +Y).
export function disc(b, r, seg, col, mat, opts = {}) {
  const r0 = opts.inner ?? 0;
  const y = opts.y ?? 0;
  const cc = opts.center || [0, 0, 0];
  const N = [0, 1, 0];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    const p0 = [cc[0] + Math.cos(a0) * r0, cc[1] + y, cc[2] + Math.sin(a0) * r0];
    const p1 = [cc[0] + Math.cos(a1) * r0, cc[1] + y, cc[2] + Math.sin(a1) * r0];
    const p2 = [cc[0] + Math.cos(a1) * r, cc[1] + y, cc[2] + Math.sin(a1) * r];
    const p3 = [cc[0] + Math.cos(a0) * r, cc[1] + y, cc[2] + Math.sin(a0) * r];
    if (r0 <= 0) b.tri(cc, p0, p2, col, mat, N, N, N);
    else b.quad(p0, p2, p3, p1, col, mat, N);
  }
}

// Vertical "profile" extrusion: a 2D polygon in XY extruded along Z by depth.
// Handy for cornices, base mouldings, pediments, rails, eyebrows, friezes.
export function extrudeXY(b, poly, depth, col, mat, opts = {}) {
  const z0 = (opts.z0 ?? -depth / 2), z1 = z0 + depth;
  const side = opts.sideCol || mulc(col, 0.9);
  const ring0 = poly.map(([x, y]) => [x, y, z0]);
  const ring1 = poly.map(([x, y]) => [x, y, z1]);
  for (let i = 1; i < poly.length - 1; i++) {
    b.tri(ring0[0], ring0[i + 1], ring0[i], mulc(col, 0.8), mat, [0, 0, -1], [0, 0, -1], [0, 0, -1]);
    b.tri(ring1[0], ring1[i], ring1[i + 1], col, mat, [0, 0, 1], [0, 0, 1], [0, 0, 1]);
  }
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    const a = poly[i], c2 = poly[j];
    const dx = c2[0] - a[0], dy = c2[1] - a[1];
    const N = norm([dy, -dx, 0]);
    b.quad(ring0[i], ring0[j], ring1[j], ring1[i], side, mat, N);
  }
}

// Extrude a 2D polygon (XZ) upward by h — plinths, terrace platforms, kerbs.
export function extrudeXZ(b, poly, h, col, mat, opts = {}) {
  const y0 = opts.y0 ?? 0, y1 = y0 + h;
  const top = opts.topCol || col;
  const bottom = opts.bottomCol || mulc(col, 0.6);
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], c2 = poly[(i + 1) % poly.length];
    area += a[0] * c2[1] - c2[0] * a[1];
  }
  const flip = area < 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], c2 = poly[(i + 1) % poly.length];
    const p0 = [a[0], y0, a[1]], p1 = [c2[0], y0, c2[1]], p2 = [c2[0], y1, c2[1]], p3 = [a[0], y1, a[1]];
    const dx = c2[0] - a[0], dz = c2[1] - a[1];
    const N = norm([dz, 0, -dx]);
    if (flip) b.quad(p1, p0, p3, p2, mulc(col, 0.9), mat, N);
    else b.quad(p0, p1, p2, p3, mulc(col, 0.9), mat, N);
  }
  for (let i = 1; i < poly.length - 1; i++) {
    const a = poly[0], c2 = poly[i], e = poly[i + 1];
    if (flip) {
      b.tri([a[0], y1, a[1]], [e[0], y1, e[1]], [c2[0], y1, c2[1]], top, mat, [0, 1, 0], [0, 1, 0], [0, 1, 0]);
      b.tri([a[0], y0, a[1]], [c2[0], y0, c2[1]], [e[0], y0, e[1]], bottom, mat, [0, -1, 0], [0, -1, 0], [0, -1, 0]);
    } else {
      b.tri([a[0], y1, a[1]], [c2[0], y1, c2[1]], [e[0], y1, e[1]], top, mat, [0, 1, 0], [0, 1, 0], [0, 1, 0]);
      b.tri([a[0], y0, a[1]], [e[0], y0, e[1]], [c2[0], y0, c2[1]], bottom, mat, [0, -1, 0], [0, -1, 0], [0, -1, 0]);
    }
  }
}

// Mirror a 2D profile across X.
export const mirrorX = (poly) => poly.map(([x, y]) => [-x, y]).reverse();

// A ring of vertical slabs (balustrade panels, fin arrays, ribs).
export function radialSlabs(b, rx, rz, count, w, h, col, mat, opts = {}) {
  const y0 = opts.y0 ?? 0;
  const phase = opts.phase ?? 0;
  const d = opts.d ?? 0.18;
  for (let i = 0; i < count; i++) {
    const a = phase + (i / count) * TAU;
    const cx = Math.cos(a) * rx, cz = Math.sin(a) * rz;
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, cx, y0, cz, 1]);
    const ca = Math.cos(-a + Math.PI / 2), sa = Math.sin(-a + Math.PI / 2);
    b.push([ca, 0, sa, 0, 0, 1, 0, 0, -sa, 0, ca, 0, 0, 0, 0, 1]);
    b.quad([-w / 2, 0, -d / 2], [w / 2, 0, -d / 2], [w / 2, h, -d / 2], [-w / 2, h, -d / 2], col, mat, [0, 0, -1]);
    b.quad([w / 2, 0, d / 2], [-w / 2, 0, d / 2], [-w / 2, h, d / 2], [w / 2, h, d / 2], col, mat, [0, 0, 1]);
    b.pop();
    b.pop();
  }
}

// Flat star prism in the XY plane.
export function star(b, rOut, rIn, points, thick, col, mat) {
  const poly = [];
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * TAU - Math.PI / 2;
    const r = i % 2 === 0 ? rOut : rIn;
    poly.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  extrudeXY(b, poly, thick, col, mat);
}

// Run fn inside a local frame at pos, rotated rotY about Y, scaled by s.
export function inFrame(b, pos, rotY, fn, s = 1) {
  b.push([s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, pos[0], pos[1], pos[2], 1]);
  if (rotY) {
    const co = Math.cos(rotY), si = Math.sin(rotY);
    b.push([co, 0, si, 0, 0, 1, 0, 0, -si, 0, co, 0, 0, 0, 0, 1]);
  }
  fn();
  if (rotY) b.pop();
  b.pop();
}

// Local axis-aligned box (no transform stack churn): centred on the origin.
export function boxAt(b, sx, sy, sz, col, mat) {
  const x = sx / 2, y = sy / 2, z = sz / 2;
  const P = (i, j, k) => [i * x, j * y, k * z];
  b.quad(P(1,-1,1), P(1,-1,-1), P(1,1,-1), P(1,1,1), mulc(col, 0.94), mat, [1,0,0]);
  b.quad(P(-1,-1,-1), P(-1,-1,1), P(-1,1,1), P(-1,1,-1), mulc(col, 0.86), mat, [-1,0,0]);
  b.quad(P(-1,-1,1), P(1,-1,1), P(1,1,1), P(-1,1,1), col, mat, [0,0,1]);
  b.quad(P(1,-1,-1), P(-1,-1,-1), P(-1,1,-1), P(1,1,-1), mulc(col, 0.88), mat, [0,0,-1]);
  b.quad(P(-1,1,1), P(1,1,1), P(1,1,-1), P(-1,1,-1), mulc(col, 1.04), mat, [0,1,0]);
  b.quad(P(-1,-1,-1), P(1,-1,-1), P(1,-1,1), P(-1,-1,1), mulc(col, 0.66), mat, [0,-1,0]);
}

// Rectangular frame of 4 bars in the XY plane at z=0.
export function frameXY(b, w, h, t, col, mat, opts = {}) {
  const d = opts.d ?? 0.12;
  const W = w / 2, H = h / 2;
  for (const sy of [-1, 1]) {
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, sy * (H - t / 2), 0, 1]);
    boxAt(b, w, t, d, col, mat);
    b.pop();
  }
  for (const sx of [-1, 1]) {
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, sx * (W - t / 2), 0, 0, 1]);
    boxAt(b, t, h - 2 * t, d, col, mat);
    b.pop();
  }
}

// Deterministic 2D scatter helper: returns count points inside a disc/rect.
export function scatter(rng, count, rMin, rMax) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = rng() * TAU;
    const r = Math.sqrt(rMin * rMin + rng() * (rMax * rMax - rMin * rMin));
    out.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return out;
}
