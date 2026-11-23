// Procedural mesh builder + primitives. Vertex: pos(3) normal(3) color(3) mat(2).
import { m4, lerp, clamp, smoothstep, noise2, noise3, fbm3, mulberry32, TAU, norm, sub, cross, add, scale as vs, dot } from './math.js';

export const STRIDE = 11;

// sRGB hex -> linear rgb
export function rgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  const s = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  return s.map((c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
}
export const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const mulc = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const addc = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

export class B {
  constructor() {
    this.v = [];
    this.i = [];
    this.n = 0;
    this.stack = [m4.identity()];
    this.cur = m4.identity();
    this.nrm = m4.identity();
  }
  get xf() {
    return this.cur;
  }
  push(mat) {
    // defensive: a 15-element matrix (translation row missing its 1) would turn
    // every later vertex into NaN and silently delete the rest of the world.
    if (!mat || mat.length !== 16) {
      const bad = mat ? mat.length : -1;
      console.warn('[geo] B.push expected a 16-float matrix, got ' + bad + '; repairing');
      const fixed = new Array(16).fill(0);
      if (mat) for (let i = 0; i < Math.min(15, mat.length); i++) fixed[i] = mat[i];
      fixed[0] = fixed[0] || 1; fixed[5] = fixed[5] || 1; fixed[10] = fixed[10] || 1; fixed[15] = 1;
      mat = fixed;
    }
    this.cur = m4.mul(this.cur, mat);
    this.stack.push(this.cur);
    this._updateN();
    return this;
  }
  pop() {
    this.stack.pop();
    this.cur = this.stack[this.stack.length - 1];
    this._updateN();
    return this;
  }
  _updateN() {
    // normals: use the rotation part (uniform scale only) of cur
    this.nrm = this.cur;
  }
  tp(p) {
    const m = this.cur;
    return [
      m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
      m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
      m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
    ];
  }
  tn(n) {
    const m = this.cur;
    const r = norm([
      m[0] * n[0] + m[4] * n[1] + m[8] * n[2],
      m[1] * n[0] + m[5] * n[1] + m[9] * n[2],
      m[2] * n[0] + m[6] * n[1] + m[10] * n[2],
    ]);
    if (!isFinite(r[0]) && !this._tnWarn) {
      this._tnWarn = 1;
      console.warn(
        '[geo] tn NaN n=' + JSON.stringify(n) + ' cur=' + JSON.stringify(Array.from(this.cur)) +
        ' at ' + (new Error().stack || '').split('\n').slice(1, 5).join(' | ')
      );
    }
    return r;
  }
  vert(p, n, c, mat) {
    // a non-finite colour poisons the whole fragment (it can rasterise as a
    // neon band across the screen), so fall back to a neutral grey and warn.
    // A 2-element colour means a material array (e.g. MT.stone) was passed in
    // the colour slot by mistake — report the call stack so it gets fixed.
    if (!c || c.length < 3 || !Number.isFinite(c[0]) || !Number.isFinite(c[1]) || !Number.isFinite(c[2])) {
      this.badColor = (this.badColor || 0) + 1;
      if (this._badColorTag !== this.tag) {
        this._badColorTag = this.tag;
        console.warn('[geo] bad colour in ' + this.tag + ' c=' + JSON.stringify(c) + ' p=' + JSON.stringify(p) +
          '\n' + String(new Error().stack).split('\n').slice(2, 7).join('\n'));
      }
      c = [0.62, 0.60, 0.55];
    }
    // a vertex thousands of metres out means a broken transform / NaN in a
    // generator; it rasterises as a giant slab across the screen. Catch it early.
    if (Math.abs(p[0]) > 3000 || Math.abs(p[1]) > 3000 || Math.abs(p[2]) > 3000) {
      if (!this._farWarn) {
        this._farWarn = 1;
        console.warn('[geo] far vertex tag=' + this.tag + ' p=' + JSON.stringify(p) + '\n' + String(new Error().stack).split('\n').slice(1, 6).join('\n'));
      }
    }
    if (!isFinite(p[0]) || !isFinite(p[1]) || !isFinite(p[2]) || !isFinite(n[0]) || !isFinite(n[1]) || !isFinite(n[2])) {
      this.bad = (this.bad || 0) + 1;
      if (this._badTag !== this.tag) {
        this._badTag = this.tag;
        console.warn('[geo] non-finite in ' + this.tag + ' p=' + JSON.stringify(p) + ' n=' + JSON.stringify(n));
      }
    }
    this.v.push(p[0], p[1], p[2], n[0], n[1], n[2], c[0], c[1], c[2], mat[0], mat[1]);
    return this.n++;
  }
  note(tag) {
    this.tag = tag;
  }
  tri(a, b, c, color, mat = [0, 0.1], na, nb, nc) {
    let N;
    if (na) N = [na, nb || na, nc || na];
    else {
      const n = norm(cross(sub(b, a), sub(c, a)));
      const nl = Math.hypot(n[0], n[1], n[2]);
      if (!(nl > 1e-6)) {
        // degenerate triangle: a zero-length normal would poison lighting, so fall
        // back to up (the triangle has no area and is never rasterised anyway)
        this.badNormal = (this.badNormal || 0) + 1;
        N = [[0, 1, 0], [0, 1, 0], [0, 1, 0]];
      } else {
        N = [n, n, n];
      }
    }
    const ia = this.vert(this.tp(a), this.tn(N[0]), color, mat);
    const ib = this.vert(this.tp(b), this.tn(N[1]), color, mat);
    const ic = this.vert(this.tp(c), this.tn(N[2]), color, mat);
    this.i.push(ia, ib, ic);
  }
  quad(a, b, c, d, color, mat = [0, 0.1], N) {
    if (N) {
      this.tri(a, b, c, color, mat, N, N, N);
      this.tri(a, c, d, color, mat, N, N, N);
    } else {
      this.tri(a, b, c, color, mat);
      this.tri(a, c, d, color, mat);
    }
  }
  // quad with per-corner colours
  quadc(a, b, c, d, ca, cb, cc, cd, mat = [0, 0.1]) {
    const N = norm(cross(sub(b, a), sub(c, a)));
    const ia = this.vert(this.tp(a), this.tn(N), ca, mat);
    const ib = this.vert(this.tp(b), this.tn(N), cb, mat);
    const ic = this.vert(this.tp(c), this.tn(N), cc, mat);
    const id = this.vert(this.tp(d), this.tn(N), cd, mat);
    this.i.push(ia, ib, ic, ia, ic, id);
  }
  build(gl) {
    return { verts: new Float32Array(this.v), indices: new Uint32Array(this.i) };
  }
  get triCount() {
    return this.i.length / 3;
  }
}

// ---------------------------------------------------------------- primitives
export function box(b, sx, sy, sz, col, mat = [0, 0.15], opts = {}) {
  const x = sx / 2, y = sy / 2, z = sz / 2;
  const ao = opts.ao ?? 0.0;
  const top = opts.topCol || col;
  const bottom = opts.bottomCol || mulc(col, 0.55);
  const P = (i, j, k) => [i * x, j * y, k * z];
  // +X
  b.quad(P(1, -1, 1), P(1, -1, -1), P(1, 1, -1), P(1, 1, 1), mulc(col, 0.92 - ao), mat, [1, 0, 0]);
  // -X
  b.quad(P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, 1), P(-1, 1, -1), mulc(col, 0.86 - ao), mat, [-1, 0, 0]);
  // +Z
  b.quad(P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1), mulc(col, 1.0 - ao), mat, [0, 0, 1]);
  // -Z
  b.quad(P(1, -1, -1), P(-1, -1, -1), P(-1, 1, -1), P(1, 1, -1), mulc(col, 0.88 - ao), mat, [0, 0, -1]);
  // +Y
  b.quad(P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1), P(-1, 1, -1), top, mat, [0, 1, 0]);
  // -Y
  b.quad(P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1), bottom, mat, [0, -1, 0]);
}

export function cylinder(b, seg, rBot, rTop, h, col, mat = [0, 0.2], opts = {}) {
  const y0 = opts.y0 ?? -h / 2, y1 = y0 + h;
  const caps = opts.caps !== false;
  const dark = opts.shade ?? 1;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const p00 = [c0 * rBot, y0, s0 * rBot], p10 = [c1 * rBot, y0, s1 * rBot];
    const p01 = [c0 * rTop, y1, s0 * rTop], p11 = [c1 * rTop, y1, s1 * rTop];
    const n0 = norm([c0, (rBot - rTop) / h, s0]), n1 = norm([c1, (rBot - rTop) / h, s1]);
    const shade = 0.86 + 0.14 * Math.cos(a0 - 0.9) * dark;
    b.quad(p10, p00, p01, p11, mulc(col, shade), mat, null);
  }
  if (caps) {
    for (let i = 1; i < seg - 1; i++) {
      const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
      b.tri([0, y1, 0], [Math.cos(a1) * rTop, y1, Math.sin(a1) * rTop], [Math.cos(a0) * rTop, y1, Math.sin(a0) * rTop], mulc(col, 1.05), mat, [0, 1, 0], [0, 1, 0], [0, 1, 0]);
      b.tri([0, y0, 0], [Math.cos(a0) * rBot, y0, Math.sin(a0) * rBot], [Math.cos(a1) * rBot, y0, Math.sin(a1) * rBot], mulc(col, 0.6), mat, [0, -1, 0], [0, -1, 0], [0, -1, 0]);
    }
  }
}

export function lathe(b, profile, seg, col, mat = [0, 0.25], opts = {}) {
  const colFn = opts.colFn || (() => col);
  const smooth = opts.smooth !== false;
  for (let k = 0; k < profile.length - 1; k++) {
    const [r0, y0] = profile[k], [r1, y1] = profile[k + 1];
    const dr = r1 - r0, dy = y1 - y0;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const p00 = [c0 * r0, y0, s0 * r0], p10 = [c1 * r0, y0, s1 * r0];
      const p01 = [c0 * r1, y1, s0 * r1], p11 = [c1 * r1, y1, s1 * r1];
      const cc = colFn((y0 + y1) / 2, k / (profile.length - 1));
      const n00 = smooth ? norm([c0 * dy, -dr, s0 * dy]) : null;
      const n10 = smooth ? norm([c1 * dy, -dr, s1 * dy]) : null;
      if (smooth) {
        const ia = b.vert(b.tp(p00), b.tn(n00), cc, mat);
        const ib = b.vert(b.tp(p01), b.tn(n00), cc, mat);
        const ic = b.vert(b.tp(p11), b.tn(n10), cc, mat);
        const id = b.vert(b.tp(p10), b.tn(n10), cc, mat);
        b.i.push(ia, ib, ic, ia, ic, id);
      } else {
        b.quad(p00, p01, p11, p10, cc, mat);
      }
    }
  }
}

// Japanese-ish roof: two curved slopes with a ridge along X, plus upturned eave lip.
export function roof(b, w, d, h, col, mat = [0, 0.15], opts = {}) {
  const over = opts.over ?? 0.6;
  const rows = opts.rows ?? 7;
  const W = w / 2 + over, D = d / 2 + over;
  const ridgeH = h;
  const curve = opts.curve ?? 1.55;
  const tileA = col, tileB = mulc(col, 0.82);
  for (let side = -1; side <= 1; side += 2) {
    for (let r = 0; r < rows; r++) {
      const t0 = r / rows, t1 = (r + 1) / rows;
      const y0 = ridgeH * Math.pow(1 - t0, curve), y1 = ridgeH * Math.pow(1 - t1, curve);
      const z0 = D * t0, z1 = D * t1;
      const c = r % 2 === 0 ? tileA : tileB;
      // slightly darker toward the eave
      const sh = mulc(c, 1 - 0.10 * t1);
      const p0 = [-W, y0, side * z0], p1 = [W, y0, side * z0], p2 = [W, y1, side * z1], p3 = [-W, y1, side * z1];
      if (side > 0) b.quad(p0, p1, p2, p3, sh, mat);
      else b.quad(p1, p0, p3, p2, sh, mat);
    }
  }
  // gable end caps (thin triangles)
  const gableCol = mulc(col, 0.7);
  for (const sx of [-1, 1]) {
    const x = sx * W;
    const N = [sx, 0, 0];
    const y0 = 0.02;
    for (let r = 0; r < rows; r++) {
      const t0 = r / rows, t1 = (r + 1) / rows;
      const ya = ridgeH * Math.pow(1 - t0, curve), yb = ridgeH * Math.pow(1 - t1, curve);
      const z0 = D * t0, z1 = D * t1;
      b.tri([x, ya, -z0], [x, ya, z0], [x, yb, z1], gableCol, mat, N, N, N);
      b.tri([x, ya, -z0], [x, yb, z1], [x, yb, -z1], gableCol, mat, N, N, N);
      void y0;
    }
  }
  // eave lip: a narrow upward-angled strip at the outer edge
  if (opts.lip !== false) {
    const lipH = opts.lipH ?? 0.35, lipW = opts.lipW ?? 0.55;
    for (const side of [-1, 1]) {
      const p0 = [-W, 0.02, side * D], p1 = [W, 0.02, side * D];
      const p2 = [W, lipH, side * (D + lipW)], p3 = [-W, lipH, side * (D + lipW)];
      if (side > 0) b.quad(p0, p1, p2, p3, mulc(col, 0.75), mat);
      else b.quad(p1, p0, p3, p2, mulc(col, 0.75), mat);
    }
  }
}

// Arch wall: a rectangular wall with a semicircular opening. Builds in XY plane,
// extruded along Z (thickness). Origin at wall centre bottom.
export function archWall(b, w, h, archR, depth, col, mat = [0, 0.15], seg = 12) {
  const z0 = -depth / 2, z1 = depth / 2;
  const springY = h * 0.42;
  const top = springY + archR;
  const sideW = Math.max(0.01, w / 2 - archR);
  const colS = mulc(col, 0.9);
  // left / right solid parts
  for (const s of [-1, 1]) {
    const x0 = s * archR, x1 = s * (archR + sideW);
    const xa = Math.min(x0, x1), xb = Math.max(x0, x1);
    b.quad([xa, 0, z1], [xb, 0, z1], [xb, h, z1], [xa, h, z1], col, mat, [0, 0, 1]);
    b.quad([xb, 0, z0], [xa, 0, z0], [xa, h, z0], [xb, h, z0], colS, mat, [0, 0, -1]);
    // outer side
    const xs = s * (w / 2);
    b.quad([xs, 0, z1], [xs, 0, z0], [xs, h, z0], [xs, h, z1], colS, mat, [s, 0, 0]);
    // inner reveal
    const xi = s * archR;
    b.quad([xi, 0, z0], [xi, 0, z1], [xi, springY, z1], [xi, springY, z0], mulc(col, 0.6), mat, [-s, 0, 0]);
  }
  // arch ring
  for (let i = 0; i < seg; i++) {
    const a0 = Math.PI * (i / seg), a1 = Math.PI * ((i + 1) / seg);
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const p0 = [c0 * archR, springY + s0 * archR];
    const p1 = [c1 * archR, springY + s1 * archR];
    // inner face of the ring
    b.quad([p0[0], p0[1], z1], [p1[0], p1[1], z1], [p1[0], p1[1], z0], [p0[0], p0[1], z0], mulc(col, 0.62), mat);
    // outer face (toward the wall top)
    const rOut = Math.min(archR * 1.0, archR);
    void rOut;
  }
  // spandrel above the arch: fill from top of the arch to wall top
  const fillH = h - top;
  if (fillH > 0.01) {
    const xs = Math.min(archR, w / 2);
    b.quad([-xs, top, z1], [xs, top, z1], [xs, h, z1], [-xs, h, z1], col, mat, [0, 0, 1]);
    b.quad([xs, top, z0], [-xs, top, z0], [-xs, h, z0], [xs, h, z0], colS, mat, [0, 0, -1]);
  }
  // top cap
  b.quad([-w / 2, h, z1], [w / 2, h, z1], [w / 2, h, z0], [-w / 2, h, z0], mulc(col, 1.05), mat, [0, 1, 0]);
}

// Torus in the XZ plane (a halo ring lying flat) or XY (vertical). axis: 'y' | 'z'
export function torus(b, R, r, segR, segT, col, mat = [1.0, 0.3], axis = 'y') {
  for (let i = 0; i < segR; i++) {
    const a0 = (i / segR) * TAU, a1 = ((i + 1) / segR) * TAU;
    for (let j = 0; j < segT; j++) {
      const t0 = (j / segT) * TAU, t1 = ((j + 1) / segT) * TAU;
      const P = (a, t) => {
        const rr = R + r * Math.cos(t);
        if (axis === 'y') return [Math.cos(a) * rr, r * Math.sin(t), Math.sin(a) * rr];
        return [Math.cos(a) * rr, Math.sin(a) * rr, r * Math.sin(t)];
      };
      const N = (a, t) => {
        const c = Math.cos(t);
        if (axis === 'y') return norm([Math.cos(a) * c, Math.sin(t), Math.sin(a) * c]);
        return norm([Math.cos(a) * c, Math.sin(a) * c, Math.sin(t)]);
      };
      const p00 = P(a0, t0), p10 = P(a1, t0), p11 = P(a1, t1), p01 = P(a0, t1);
      const n00 = N(a0, t0), n10 = N(a1, t0), n11 = N(a1, t1), n01 = N(a0, t1);
      const ia = b.vert(b.tp(p00), b.tn(n00), col, mat);
      const ib = b.vert(b.tp(p10), b.tn(n10), col, mat);
      const ic = b.vert(b.tp(p11), b.tn(n11), col, mat);
      const id = b.vert(b.tp(p01), b.tn(n01), col, mat);
      b.i.push(ia, ib, ic, ia, ic, id);
    }
  }
}

// Low-poly sphere with slight noise, smooth normals. For tree canopies and rocks.
export function sphere(b, r, col, mat = [0, 0.05], opts = {}) {
  const rings = opts.rings ?? 6, seg = opts.seg ?? 9;
  const jitter = opts.jitter ?? 0.12;
  const seed = opts.seed ?? 1;
  const colFn = opts.colFn || (() => col);
  const P = (i, j) => {
    const v = i / rings;
    const phi = v * Math.PI;
    const th = (j / seg) * TAU;
    const rr = r * (1 + (noise3(Math.cos(th) * 2 + seed, v * 3, Math.sin(th) * 2) - 0.5) * jitter);
    const sy = Math.cos(phi) * rr;
    const sr = Math.sin(phi) * rr;
    return [Math.cos(th) * sr, sy, Math.sin(th) * sr];
  };
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < seg; j++) {
      const j1 = (j + 1) % seg;
      const a = P(i, j), bb = P(i, j1), c = P(i + 1, j1), d = P(i + 1, j);
      const N = norm(cross(sub(bb, a), sub(d, a)));
      const shade = 0.82 + 0.18 * Math.cos((j / seg) * TAU - 0.9);
      b.quad(a, bb, c, d, mulc(colFn(i / rings), shade), mat, N);
    }
  }
}

// A ribbon/strip along a polyline, facing "up" by default (for ropes, banners, paths)
export function ribbon(b, pts, widths, col, mat = [0, 0.1], up = [0, 1, 0]) {
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i], p1 = pts[i + 1];
    const dir = norm(sub(p1, p0));
    let side = cross(dir, up);
    if (Math.hypot(...side) < 0.01) side = cross(dir, [1, 0, 0]);
    side = norm(side);
    const w0 = widths[i] / 2, w1 = widths[i + 1] / 2;
    const a = add(p0, vs(side, w0)), c = sub(p0, vs(side, w0));
    const d = add(p1, vs(side, w1)), e = sub(p1, vs(side, w1));
    const N = norm(cross(side, dir));
    b.quad(a, d, e, c, col, mat, N);
  }
}

// Faceted noise rock (an inverted cone / blob). Used for island undersides and boulders.
export function rockBlob(b, radius, height, seed, colTop, colBot, opts = {}) {
  const rng = mulberry32(seed);
  const rings = opts.rings ?? 9, seg = opts.seg ?? 16;
  const amp = opts.amp ?? 0.42;
  const taper = opts.taper ?? 0.75;
  const pts = [];
  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    const y = -height * Math.pow(t, opts.power ?? 1.25);
    const rad = radius * Math.pow(1 - t, taper) * (1 + (noise2(seed * 3.1 + t * 3, seed) - 0.5) * 0.25);
    const ring = [];
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * TAU;
      const n = fbm3(Math.cos(a) * 2 + seed, y * 0.06, Math.sin(a) * 2, 3);
      const rr = rad * (1 + (n - 0.5) * amp);
      ring.push([Math.cos(a) * rr, y + (noise2(a * 2, seed + t * 5) - 0.5) * height * 0.03, Math.sin(a) * rr]);
    }
    pts.push(ring);
  }
  for (let r = 0; r < rings; r++) {
    const t = r / rings;
    const c = mixc(colTop, colBot, Math.min(1, t * 1.25));
    for (let i = 0; i < seg; i++) {
      const i1 = (i + 1) % seg;
      const a = pts[r][i], bb = pts[r][i1], cc = pts[r + 1][i1], d = pts[r + 1][i];
      const shade = 0.78 + 0.22 * Math.cos((i / seg) * TAU - 0.7);
      b.quad(a, bb, cc, d, mulc(c, shade), [0, 0.05]);
    }
  }
  // jagged hanging spikes
  const spikes = opts.spikes ?? 5;
  for (let s = 0; s < spikes; s++) {
    const a = rng() * TAU;
    const rr = radius * (0.15 + rng() * 0.55);
    const yTop = -height * (0.15 + rng() * 0.5);
    const len = height * (0.2 + rng() * 0.45);
    const tip = [Math.cos(a) * rr * 0.7, yTop - len, Math.sin(a) * rr * 0.7];
    const w = radius * (0.05 + rng() * 0.06);
    const N = Math.floor(5);
    for (let k = 0; k < N; k++) {
      const a0 = (k / N) * TAU, a1 = ((k + 1) / N) * TAU;
      const p0 = [Math.cos(a) * rr + Math.cos(a0) * w, yTop, Math.sin(a) * rr + Math.sin(a0) * w];
      const p1 = [Math.cos(a) * rr + Math.cos(a1) * w, yTop, Math.sin(a) * rr + Math.sin(a1) * w];
      b.tri(p0, p1, tip, mulc(colBot, 0.8), [0, 0.05]);
    }
  }
}

// Terrain grid with height/colour functions (x,z in [-w/2,w/2]).
export function grid(b, w, d, segX, segZ, heightFn, colorFn, mat = [0, 0.1]) {
  const P = (i, j) => {
    const x = -w / 2 + (i / segX) * w;
    const z = -d / 2 + (j / segZ) * d;
    return [x, heightFn(x, z), z];
  };
  for (let j = 0; j < segZ; j++) {
    for (let i = 0; i < segX; i++) {
      const p00 = P(i, j), p10 = P(i + 1, j), p11 = P(i + 1, j + 1), p01 = P(i, j + 1);
      const N = norm(cross(sub(p01, p00), sub(p10, p00)));
      b.quad(p00, p01, p11, p10, colorFn((p00[0] + p11[0]) / 2, (p00[2] + p11[2]) / 2, N), mat, N);
    }
  }
}

// A ring of points (for catenary lantern strings etc.)
export function catenary(p0, p1, sag, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = lerp(p0[0], p1[0], t), z = lerp(p0[2], p1[2], t);
    const y = lerp(p0[1], p1[1], t) - sag * Math.sin(Math.PI * t);
    pts.push([x, y, z]);
  }
  return pts;
}

// ============================================================ building primitives
// Everything below exists for the machiya town: a beam between two points, a
// planar lattice, a railing, bracket sets, and curved-eave roofs with rafters,
// tile ridges and gable boards. All of them append to a B builder.

// A rectangular beam between two 3D points (12 tris). Used for rafters, arms,
// bracket timbers, diagonal braces and eave fascia.
export function bar3(b, p0, p1, w, h, col, mat = [0, 0.12], up = [0, 1, 0]) {
  const d = norm(sub(p1, p0));
  let side = cross(d, up);
  if (Math.hypot(side[0], side[1], side[2]) < 1e-4) side = cross(d, [1, 0, 0]);
  side = norm(side);
  const u = norm(cross(side, d));
  const S = vs(side, w / 2), U = vs(u, h / 2);
  const a0 = add(p0, S), a1 = sub(p0, S), c0 = add(p1, S), c1 = sub(p1, S);
  const up0 = add(a0, U), up1 = add(a1, U), up2 = add(c0, U), up3 = add(c1, U);
  const dn0 = sub(a0, U), dn1 = sub(a1, U), dn2 = sub(c0, U), dn3 = sub(c1, U);
  b.quad(up0, up2, dn2, dn0, col, mat, side);
  b.quad(up1, dn1, dn3, up3, mulc(col, 0.9), mat, vs(side, -1));
  b.quad(up0, up1, up3, up2, mulc(col, 1.06), mat, u);
  b.quad(dn0, dn2, dn3, dn1, mulc(col, 0.82), mat, vs(u, -1));
  b.quad(up0, dn0, dn1, up1, mulc(col, 0.96), mat, vs(d, -1));
  b.quad(up2, up3, dn3, dn2, mulc(col, 1.02), mat, d);
}

// Planar window grille in the XY plane, facing +Z, centred at the origin.
// Vertical bars sit at z, horizontal bars a hair in front to avoid z-fighting.
export function fretGrid(b, w, h, nx, ny, col, mat = [0, 0.08], opts = {}) {
  const z = opts.z ?? 0;
  const barW = opts.barW ?? Math.min(0.07, Math.max(0.03, w * 0.055));
  const frame = opts.frame !== false;
  const F = opts.frameW ?? Math.min(0.17, w * 0.09);
  const face = (x0, y0, x1, y1, zz) => b.quad([x0, y0, zz], [x1, y0, zz], [x1, y1, zz], [x0, y1, zz], col, mat, [0, 0, 1]);
  for (let i = 1; i <= nx; i++) {
    const x = -w / 2 + (i / (nx + 1)) * w;
    face(x - barW / 2, -h / 2, x + barW / 2, h / 2, z);
  }
  for (let j = 1; j <= ny; j++) {
    const y = -h / 2 + (j / (ny + 1)) * h;
    face(-w / 2, y - barW / 2, w / 2, y + barW / 2, z + 0.013);
  }
  if (frame) {
    face(-w / 2, h / 2 - F, w / 2, h / 2, z + 0.02);
    face(-w / 2, -h / 2, w / 2, -h / 2 + F, z + 0.02);
    face(-w / 2, -h / 2, -w / 2 + F, h / 2, z + 0.02);
    face(w / 2 - F, -h / 2, w / 2, h / 2, z + 0.02);
  }
}

// Wooden railing along X, centred at the origin, facing +Z.
// opts: { n, thick, simple } — simple draws balusters as quads (cheap LOD).
export function railing(b, len, h, col, mat = [0, 0.12], opts = {}) {
  const t = opts.thick ?? 0.08;
  const simple = opts.simple === true;
  const n = opts.n ?? Math.max(3, Math.round(len / 0.44));
  const z = 0;
  b.quad([-len / 2, h - t, z], [len / 2, h - t, z], [len / 2, h, z], [-len / 2, h, z], col, mat, [0, 0, 1]);
  b.quad([-len / 2, h, z], [len / 2, h, z], [len / 2, h, z + t], [-len / 2, h, z + t], mulc(col, 1.1), mat, [0, 1, 0]);
  const mh = h * 0.56;
  b.quad([-len / 2, mh - t * 0.45, z], [len / 2, mh - t * 0.45, z], [len / 2, mh + t * 0.45, z], [-len / 2, mh + t * 0.45, z], mulc(col, 0.9), mat, [0, 0, 1]);
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + ((i + 0.5) / n) * len;
    if (simple) {
      b.quad([x - 0.032, 0.02, z], [x + 0.032, 0.02, z], [x + 0.032, h - t, z], [x - 0.032, h - t, z], col, mat, [0, 0, 1]);
    } else {
      b.push(m4.translate([x, h / 2, 0]));
      box(b, 0.062, h, 0.062, col, mat);
      b.pop();
    }
  }
  for (const x of [-len / 2 + 0.06, len / 2 - 0.06]) {
    b.push(m4.translate([x, (h + 0.12) / 2, 0]));
    box(b, 0.13, h + 0.12, 0.13, mulc(col, 0.94), mat);
    b.pop();
  }
}

// Simplified bracket set (dougong): origin at the column top, arms along X and Z.
export function dougong(b, col, mat = [0, 0.14], opts = {}) {
  const s = opts.scale ?? 1;
  const wood = mulc(col, 0.92);
  const cap = mulc(col, 1.08);
  // base block on the column
  b.push(m4.translate([0, 0.11 * s, 0]));
  box(b, 0.3 * s, 0.22 * s, 0.3 * s, wood, mat);
  b.pop();
  // first arm along X
  bar3(b, [-0.62 * s, 0.3 * s, 0], [0.62 * s, 0.3 * s, 0], 0.17 * s, 0.15 * s, wood, mat);
  // second arm along Z
  bar3(b, [0, 0.45 * s, -0.44 * s], [0, 0.45 * s, 0.44 * s], 0.16 * s, 0.14 * s, wood, mat);
  // small bearing blocks on top of the arms
  for (const x of [-0.46, 0, 0.46]) {
    b.push(m4.translate([x * s, 0.6 * s, 0]));
    box(b, 0.14 * s, 0.18 * s, 0.14 * s, cap, mat);
    b.pop();
  }
  b.push(m4.translate([0, 0.6 * s, 0.28 * s]));
  box(b, 0.13 * s, 0.17 * s, 0.13 * s, cap, mat);
  b.pop();
  b.push(m4.translate([0, 0.6 * s, -0.28 * s]));
  box(b, 0.13 * s, 0.17 * s, 0.13 * s, cap, mat);
  b.pop();
}

// Curved-eave pent roof (庇). Attaches to a wall at z=0,y=0 along X and slopes
// down toward +Z. opts: rows, cols, lift, tiles, rafters, drop.
export function eaveRoof(b, w, depth, drop, col, mat = [0, 0.2], opts = {}) {
  const rows = opts.rows ?? 3, cols = opts.cols ?? 6;
  const lift = opts.lift ?? 0.15;
  const tiles = opts.tiles ?? 9;
  const rafters = opts.rafters ?? 0;
  const W = w / 2;
  const P = (x, t) => {
    const xr = x / Math.max(W, 1e-4);
    return [x, -drop * Math.pow(t, 1.35) + lift * Math.pow(Math.abs(xr), 2.4) * Math.pow(t, 1.7), depth * t];
  };
  for (let r = 0; r < rows; r++) {
    const t0 = r / rows, t1 = (r + 1) / rows;
    for (let c = 0; c < cols; c++) {
      const x0 = -W + (c / cols) * w, x1 = -W + ((c + 1) / cols) * w;
      const shade = mulc(col, (r % 2 ? 0.88 : 1.0) * (1 - 0.10 * t1));
      b.quad(P(x0, t0), P(x1, t0), P(x1, t1), P(x0, t1), shade, mat);
    }
  }
  if (tiles > 0) {
    for (let i = 0; i <= tiles; i++) {
      const x = -W + (i / tiles) * w;
      for (let r = 0; r < rows; r++) {
        const t0 = r / rows, t1 = (r + 1) / rows;
        const a = P(x, t0), c2 = P(x, t1);
        b.quad([a[0] - 0.1, a[1] + 0.05, a[2]], [c2[0] - 0.1, c2[1] + 0.05, c2[2]],
          [c2[0], c2[1] + 0.05, c2[2]], [a[0], a[1] + 0.05, a[2]], mulc(col, 1.36), mat, [0, 1, 0]);
      }
    }
  }
  // fascia along the eave edge + soffit underneath
  for (let c = 0; c < cols; c++) {
    const x0 = -W + (c / cols) * w, x1 = -W + ((c + 1) / cols) * w;
    const p0 = P(x0, 1), p1 = P(x1, 1);
    b.quad([p0[0], p0[1], p0[2]], [p1[0], p1[1], p1[2]], [p1[0], p1[1] - 0.22, p1[2]], [p0[0], p0[1] - 0.22, p0[2]], mulc(col, 0.66), mat, [0, 0, 1]);
  }
  b.quad([-W, -0.03, 0], [W, -0.03, 0], [W, -drop - 0.14, depth], [-W, -drop - 0.14, depth], mulc(col, 0.7), mat, [0, -1, 0]);
  for (let i = 0; i < rafters; i++) {
    const x = -W + ((i + 0.5) / rafters) * w;
    bar3(b, [x, -0.05, 0.05], [x, -drop - 0.13, depth - 0.04], 0.075, 0.11, mulc(col, 0.55), [0, 0.1]);
    bar3(b, [x, -drop - 0.14, depth - 0.06], [x, -drop - 0.21, depth + 0.18], 0.075, 0.1, mulc(col, 0.62), [0, 0.1]);
  }
}

// Gable roof with curved eaves, tile ridges, rafters, barge boards and a ridge
// cap. Origin at the eave line; the ridge runs along X at height h.
// opts: over (Z overhang), sideOver (X overhang), rows, cols, curve, lift,
//       tiles (number of tile ridges, 0 = none), rafters, gable:true.
export function roofGable(b, w, d, h, col, mat = [0, 0.2], opts = {}) {
  const over = opts.over ?? 1.0, sideOver = opts.sideOver ?? 0.55;
  const rows = opts.rows ?? 7, cols = opts.cols ?? 6;
  const curve = opts.curve ?? 1.3, lift = opts.lift ?? 0.45;
  const tiles = opts.tiles ?? 10;
  const rafters = opts.rafters ?? 0;
  const W = w / 2 + sideOver, D = d / 2 + over;
  const yAt = (t, xr) =>
    h * Math.pow(1 - clamp(t, 0, 1), curve) + lift * Math.pow(Math.abs(xr), 2.6) * smoothstep(0.45, 1.0, t);
  const P = (x, side, t) => [x, yAt(t, x / W), side * D * t];
  for (const side of [-1, 1]) {
    for (let r = 0; r < rows; r++) {
      const t0 = r / rows, t1 = (r + 1) / rows;
      for (let c = 0; c < cols; c++) {
        const x0 = -W + (c / cols) * 2 * W, x1 = -W + ((c + 1) / cols) * 2 * W;
        const shade = mulc(col, (r % 2 ? 0.92 : 1.0) * (1 - 0.09 * t1) * (0.97 + 0.06 * Math.sin(c * 1.7)));
        const a = P(x0, side, t0), b2 = P(x1, side, t0), c2 = P(x1, side, t1), d2 = P(x0, side, t1);
        if (side > 0) b.quad(a, b2, c2, d2, shade, mat);
        else b.quad(b2, a, d2, c2, shade, mat);
      }
    }
  }
  // tile ridges running down the slope (the strongest roof read at distance)
  if (tiles > 0) {
    const trs = Math.max(2, Math.round(rows * 0.55));
    for (const side of [-1, 1]) {
      for (let i = 0; i <= tiles; i++) {
        const x = -W + (i / tiles) * 2 * W;
        for (let r = 0; r < trs; r++) {
          const t0 = r / trs, t1 = (r + 1) / trs;
          const a = P(x, side, t0), c2 = P(x, side, t1);
          const w0 = 0.085, off = 0.045;
          b.quad([a[0] - w0, a[1] + off, a[2]], [c2[0] - w0, c2[1] + off, c2[2]],
            [c2[0], c2[1] + off, c2[2]], [a[0], a[1] + off, a[2]], mulc(col, 1.2), mat, [0, 1, 0]);
        }
      }
    }
  }
  // eave fascia + soffit + rafter heads near the two long eaves
  for (const side of [-1, 1]) {
    for (let c = 0; c < cols; c++) {
      const x0 = -W + (c / cols) * 2 * W, x1 = -W + ((c + 1) / cols) * 2 * W;
      const p0 = P(x0, side, 1), p1 = P(x1, side, 1);
      const N = side > 0 ? [0, 0, 1] : [0, 0, -1];
      b.quad([p0[0], p0[1], p0[2]], [p1[0], p1[1], p1[2]], [p1[0], p1[1] - 0.27, p1[2]], [p0[0], p0[1] - 0.27, p0[2]], mulc(col, 0.62), mat, N);
    }
    // soffit: the eave underside, seen from the street
    const z0 = side * D * 0.42, z1 = side * D;
    const y0 = yAt(0.42, 0) - 0.06, y1 = yAt(1, 0) - 0.18;
    b.quad([-W, y0, z0], [W, y0, z0], [W, y1, z1], [-W, y1, z1], mulc(col, 0.66), mat, [0, -1, 0]);
    if (rafters > 0) {
      for (let i = 0; i < rafters; i++) {
        const x = -W + ((i + 0.5) / rafters) * 2 * W;
        const t0 = 0.42, t1 = 1.0;
        const a = P(x, side, t0), c2 = P(x, side, t1);
        bar3(b, [a[0], a[1] - 0.12, a[2]], [c2[0], c2[1] - 0.16, c2[2]], 0.08, 0.12, mulc(col, 0.56), [0, 0.1]);
        bar3(b, [c2[0], c2[1] - 0.18, c2[2]], [c2[0], c2[1] - 0.26, c2[2] + side * 0.18], 0.08, 0.1, mulc(col, 0.64), [0, 0.1]);
      }
    }
  }
  // gable ends: 妻壁 fill + barge boards
  if (opts.gable !== false) {
    const gableCol = opts.gableCol ?? col;      // 妻壁: usually plaster
    const bargeCol = opts.bargeCol ?? mulc(col, 0.8);
    const ornamentCol = opts.ornamentCol ?? mulc(col, 1.15);
    for (const ex of [-1, 1]) {
      const X = ex * W + ex * 0.02;
      const N = [ex, 0, 0];
      // gable wall: vertical fill from the wall top up to the roof line
      for (let c = 0; c < cols; c++) {
        const t0 = c / cols, t1 = (c + 1) / cols;
        for (const side of [-1, 1]) {
          const z0 = side * D * t0, z1 = side * D * t1;
          const ya = yAt(t0, ex), yb = yAt(t1, ex);
          b.quad([X, 0, z0], [X, 0, z1], [X, yb, z1], [X, ya, z0], mulc(gableCol, 0.82 + 0.18 * t1), mat, N);
        }
      }
      // barge board following the roof line, both sides of the gable
      for (const side of [-1, 1]) {
        for (let c = 0; c < cols; c++) {
          const t0 = c / cols, t1 = (c + 1) / cols;
          const z0 = side * D * t0, z1 = side * D * t1;
          const ya = yAt(t0, ex), yb = yAt(t1, ex);
          b.quad([X, ya, z0], [X, yb, z1], [X, yb + 0.26, z1], [X, ya + 0.26, z0], bargeCol, mat, N);
        }
      }
      // hanging gable ornament (懸魚)
      b.push(m4.translate([X, yAt(0.2, ex) - 0.3, 0]));
      box(b, 0.1, 0.5, 0.32, ornamentCol, [0.16, 0.55]);
      b.pop();
    }
  }
  // ridge cap
  bar3(b, [-W - 0.08, h + 0.12, 0], [W + 0.08, h + 0.12, 0], 0.36, 0.3, mulc(col, 0.72), [0, 0.22]);
  for (const ex of [-1, 1]) {
    b.push(m4.translate([ex * (W + 0.12), h + 0.24, 0]));
    box(b, 0.3, 0.3, 0.5, mulc(col, 0.8), [0.15, 0.4]);
    b.pop();
  }
}
