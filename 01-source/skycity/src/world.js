// The world: floating islands, the lantern town, bridges, waterfalls, koi lanterns.
import {
  B, box, cylinder, lathe, roof, archWall, torus, ribbon, rockBlob, grid, catenary, sphere,
  rgb, mixc, mulc, addc,
} from './geo.js';
import { C } from './palette.js';
import { buildTown } from './town.js';
import { mainIslandY, islandY } from './terrain.js';
import {
  m4, mulberry32, noise2, fbm2, lerp, clamp, TAU, norm, sub, add, cross, scale as vs, smoothstep,
} from './math.js';

// ------------------------------------------------------------------ small helpers
function octa(b, sx, sy, col, mat) {
  const p = [0, sy, 0], q = [0, -sy, 0];
  const ring = [[sx, 0, 0], [0, 0, sx], [-sx, 0, 0], [0, 0, -sx]];
  for (let i = 0; i < 4; i++) {
    b.tri(p, ring[i], ring[(i + 1) % 4], col, mat);
    b.tri(q, ring[(i + 1) % 4], ring[i], col, mat);
  }
}

function beamMesh(b, r0, r1, h, col, mat) {
  cylinder(b, 14, r0, r1, h, col, mat, { caps: false, y0: 0 });
}

// ---------------------------------------------------------------- island
function islandTop(b, o) {
  const { x, z, y, r, seed, style } = o;
  const rings = 9, seg = 40;
  const rng = mulberry32(seed);
  const P = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const rad = r * Math.pow(t, 0.9);
    const row = [];
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * TAU;
      const px = x + Math.cos(a) * rad, pz = z + Math.sin(a) * rad;
      row.push([px, y + islandY(px, pz, x, z, r, seed), pz]);
    }
    P.push(row);
  }
  const colorAt = (px, pz, n) => {
    if (style === 'town') {
      const g = fbm2(px * 0.12, pz * 0.12, 2);
      return mixc(C.stone, C.stoneDark, g * 0.55 + 0.12);
    }
    if (style === 'garden') {
      const g = fbm2(px * 0.18 + 4, pz * 0.18, 2);
      const flower = smoothstep(0.62, 0.75, fbm2(px * 0.5, pz * 0.5, 2));
      return mixc(mixc(C.moss, C.stoneDark, g * 0.5), rgb('#b56a86'), flower * 0.55);
    }
    const g = fbm2(px * 0.2 + 9, pz * 0.2, 3);
    return mixc(mixc(C.stone, C.moss, g * 0.8), C.stoneDark, 0.2);
  };
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < seg; j++) {
      const j1 = (j + 1) % seg;
      const a = P[i][j], bb = P[i][j1], c = P[i + 1][j1], d = P[i + 1][j];
      const N = i === 0 ? [0, 1, 0] : norm(cross(sub(bb, a), sub(d, a)));
      const cx = (a[0] + c[0]) / 2, cz = (a[2] + c[2]) / 2;
      b.quad(a, bb, c, d, colorAt(cx, cz, N), [0, 0.06], N);
    }
  }
  // cliff band + underside
  const topR = r, bandH = 7.5;
  const c0 = mixc(C.stoneDark, rgb('#6b5a60'), 0.35);
  const c1 = rgb('#3a3040');
  for (let j = 0; j < seg; j++) {
    const j1 = (j + 1) % seg;
    const a0 = (j / seg) * TAU, a1 = (j1 / seg) * TAU;
    const n0 = fbm2(Math.cos(a0) * 2 + seed, Math.sin(a0) * 2, 2);
    const n1 = fbm2(Math.cos(a1) * 2 + seed, Math.sin(a1) * 2, 2);
    const r0 = topR * (0.985 + n0 * 0.03), r1 = topR * (0.985 + n1 * 0.03);
    const p0 = [x + Math.cos(a0) * r0, y - 0.4, z + Math.sin(a0) * r0];
    const p1 = [x + Math.cos(a1) * r1, y - 0.4, z + Math.sin(a1) * r1];
    const p2 = [x + Math.cos(a1) * r1 * 0.94, y - bandH, z + Math.sin(a1) * r1 * 0.94];
    const p3 = [x + Math.cos(a0) * r0 * 0.94, y - bandH, z + Math.sin(a0) * r0 * 0.94];
    const sh = 0.7 + 0.3 * Math.cos(a0 - 0.8);
    b.quad(p0, p1, p2, p3, mulc(mixc(c0, c1, 0.3), sh), [0, 0.04]);
  }
  // rock underside
  b.push(m4.translate([x, y - bandH + 1.5, z]));
  rockBlob(b, topR * 0.94, o.depth, seed * 7 + 3, mixc(C.stoneDark, rgb('#8a6a5e'), 0.5), rgb('#5a4650'), {
    rings: 10, seg: 20, amp: 0.5, taper: 0.82, spikes: 7, power: 1.35,
  });
  b.pop();
  // hanging vines and roots under the rim
  const vineCol = mixc(C.moss, rgb('#2a3a24'), 0.5);
  for (let k = 0; k < 14; k++) {
    const a = rng() * TAU;
    const rr = topR * (0.92 + rng() * 0.06);
    const x0 = x + Math.cos(a) * rr, z0 = z + Math.sin(a) * rr;
    const len = 6 + rng() * 22;
    const pts = [];
    for (let s = 0; s <= 5; s++) {
      const t = s / 5;
      pts.push([x0 + Math.cos(a) * t * 2.5, y - 1 - t * len, z0 + Math.sin(a) * t * 2.5]);
    }
    ribbon(b, pts, pts.map((p, i) => 0.5 * (1 - i / 6)), vineCol, [0, 0.03]);
  }
  // glowing crystals in the rock
  for (let k = 0; k < 7; k++) {
    const a = rng() * TAU;
    const rad = topR * (0.3 + rng() * 0.55);
    const yy = y - bandH - rng() * o.depth * 0.5;
    const s = 1.2 + rng() * 2.6;
    const col = k % 3 === 0 ? rgb('#8ff0ff') : rgb('#ffcf7a');
    b.push(m4.translate([x + Math.cos(a) * rad, yy, z + Math.sin(a) * rad]));
    b.push(m4.rotY(rng() * TAU));
    octa(b, s * 0.45, s, col, [0.9, 0.1]);
    b.pop();
    b.pop();
  }
}


function pagoda(b, ctx, x, y, z) {
  b.push(m4.translate([x, y, z]));
  // stone platform
  b.push(m4.translate([0, 0.6, 0]));
  box(b, 17, 1.2, 17, C.stone, [0, 0.12]);
  b.pop();
  b.push(m4.translate([0, 1.5, 0]));
  box(b, 15, 0.8, 15, C.stoneDark, [0, 0.1]);
  b.pop();
  let yy = 2.2;
  let w = 12;
  const tiers = 5;
  for (let t = 0; t < tiers; t++) {
    const h = 4.4 - t * 0.25;
    // body
    b.push(m4.translate([0, yy + h / 2, 0]));
    box(b, w, h, w, t === 0 ? C.woodMid : C.red, [0, 0.12]);
    b.pop();
    // glowing windows on 4 sides
    for (let s = 0; s < 4; s++) {
      b.push(m4.translate([0, yy + h * 0.55, 0]));
      b.push(m4.rotY((s / 4) * TAU));
      b.push(m4.translate([0, 0, w / 2 + 0.05]));
      box(b, w * 0.45, h * 0.42, 0.08, mixc(C.paper, C.paperCore, 0.4), [1.25, 0]);
      b.pop(); b.pop(); b.pop();
    }
    // eave roof
    b.push(m4.translate([0, yy + h, 0]));
    roof(b, w + 1.2, w + 1.2, 1.9, C.roof, [0, 0.22], { over: 1.9, rows: 4, lipH: 0.55, lipW: 0.7 });
    b.pop();
    // corner lanterns on each eave
    for (let s = 0; s < 4; s++) {
      const a = (s / 4) * TAU + Math.PI / 4;
      ctx.lanterns.push({
        p: [x + Math.cos(a) * (w * 0.78), y + yy + h + 0.15, z + Math.sin(a) * (w * 0.78)],
        size: 0.62, col: C.paper, alpha: 1, shape: 1,
      });
    }
    yy += h + 1.9;
    w *= 0.82;
  }
  // gold spire
  b.push(m4.translate([0, yy, 0]));
  cylinder(b, 8, 0.5, 0.12, 5.5, C.gold, [0.55, 0.7], { y0: 0 });
  b.pop();
  // halo rings + light column
  for (let i = 0; i < 3; i++) {
    const rr = 4.5 + i * 2.2;
    ctx.additive.push({ kind: 'ring', p: [x, y + yy + 1.2 + i * 1.9, z], r: rr, tube: 0.09, col: mixc(C.goldBright, C.paper, 0.4), int: 1.6 - i * 0.25, spin: 0.25 + i * 0.12 });
  }
  ctx.beams.push({ p: [x, y + yy + 1.0, z], r0: 1.8, r1: 0.7, h: 90, col: mixc(C.paper, C.goldBright, 0.5), int: 0.085 });
  ctx.points.push({ p: [x, y + yy + 2, z], col: C.goldBright, range: 70, int: 1.3 });
  ctx.lightBeacon = [x, y + yy, z];
  b.pop();
}

function clockTower(b, ctx, x, y, z) {
  b.push(m4.translate([x, y, z]));
  b.push(m4.translate([0, 0.7, 0]));
  box(b, 7.5, 1.4, 7.5, C.stoneDark, [0, 0.1]);
  b.pop();
  // legs
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.push(m4.translate([sx * 2.4, 8.5, sz * 2.4]));
    box(b, 1.0, 15, 1.0, C.wood, [0, 0.12]);
    b.pop();
  }
  // body
  b.push(m4.translate([0, 13, 0]));
  box(b, 6.6, 9, 6.6, C.woodMid, [0, 0.12]);
  b.pop();
  // clock faces on 4 sides
  for (let s = 0; s < 4; s++) {
    b.push(m4.translate([0, 14.4, 0]));
    b.push(m4.rotY((s / 4) * TAU));
    b.push(m4.translate([0, 0, 3.35]));
    b.push(m4.rotX(Math.PI / 2));
    cylinder(b, 24, 3.0, 3.0, 0.18, C.gold, [0.25, 0.6], { caps: true });
    b.pop();
    b.push(m4.translate([0, 0, 0.2]));
    b.push(m4.rotX(Math.PI / 2));
    cylinder(b, 24, 2.55, 2.55, 0.12, rgb('#f6e3bc'), [0.85, 0.1], { caps: true });
    b.pop(); b.pop();
    // hands
    b.push(m4.translate([0, 0, 0.32]));
    b.push(m4.rotZ(-0.9));
    box(b, 0.16, 1.7, 0.06, rgb('#3a2a1a'), [0, 0.2]);
    b.pop();
    b.push(m4.rotZ(1.9));
    b.push(m4.translate([0, 0.55, 0]));
    box(b, 0.12, 1.2, 0.06, rgb('#3a2a1a'), [0, 0.2]);
    b.pop(); b.pop();
    b.pop();
    b.pop(); b.pop(); b.pop();
  }
  // roof + bell
  b.push(m4.translate([0, 17.6, 0]));
  roof(b, 6.6, 6.6, 4.2, C.roof, [0, 0.2], { over: 1.2, rows: 5, lipH: 0.6 });
  b.pop();
  b.push(m4.translate([0, 21.6, 0]));
  cylinder(b, 8, 0.35, 0.1, 2.6, C.gold, [0.5, 0.7], { y0: 0 });
  b.pop();
  ctx.points.push({ p: [x, y + 15, z], col: rgb('#ffd9a0'), range: 34, int: 0.8 });
  ctx.lanterns.push({ p: [x, y + 22.6, z], size: 1.1, col: C.goldBright, alpha: 1, shape: 0 });
  b.pop();
}

function torii(b, ctx, x, y, z, scale = 1, rotY = 0) {
  b.push(m4.translate([x, y, z]));
  b.push(m4.rotY(rotY));
  b.push(m4.scale([scale, scale, scale]));
  const H = 8.5, W = 6.4;
  for (const s of [-1, 1]) {
    b.push(m4.translate([s * W / 2, H / 2, 0]));
    cylinder(b, 10, 0.45, 0.38, H, C.red, [0.15, 0.3], { y0: -H / 2 });
    b.pop();
  }
  // top lintel (two curved bars)
  b.push(m4.translate([0, H, 0]));
  box(b, W + 3.4, 0.55, 0.85, C.redLight, [0.1, 0.3]);
  b.pop();
  b.push(m4.translate([0, H - 1.1, 0]));
  box(b, W + 1.4, 0.4, 0.6, C.red, [0.1, 0.25]);
  b.pop();
  b.push(m4.translate([0, H - 2.5, 0]));
  box(b, 1.5, 1.1, 0.3, C.gold, [0.2, 0.6]);
  b.pop();
  ctx.lanterns.push({ p: [x, y + H - 1.7, z + 1.2], size: 0.7, col: C.paper, alpha: 1, shape: 1 });
  b.pop(); // scale
  b.pop(); // rotY
  b.pop(); // translate
}

function lanternPost(b, ctx, x, y, z, h = 5.2) {
  b.push(m4.translate([x, y, z]));
  cylinder(b, 8, 0.18, 0.13, h, C.wood, [0, 0.12], { y0: 0 });
  b.push(m4.translate([0, h - 0.2, 0]));
  box(b, 1.5, 0.14, 0.14, C.wood, [0, 0.12]);
  b.pop();
  ctx.lanterns.push({ p: [x + 0.6, y + h - 0.95, z], size: 0.72, col: C.paper, alpha: 1, shape: 1 });
  ctx.lanterns.push({ p: [x - 0.6, y + h - 0.95, z], size: 0.72, col: C.paper, alpha: 1, shape: 1 });
  ctx.points.push({ p: [x, y + h - 0.8, z], col: C.paper, range: 13, int: 0.4 });
  b.pop();
}

function stoneLantern(b, ctx, x, y, z) {
  b.push(m4.translate([x, y, z]));
  cylinder(b, 6, 0.55, 0.45, 0.5, C.stone, [0, 0.1], { y0: 0 });
  b.push(m4.translate([0, 0.5, 0]));
  cylinder(b, 6, 0.28, 0.24, 1.1, C.stone, [0, 0.1], { y0: 0 });
  b.pop();
  b.push(m4.translate([0, 1.6, 0]));
  box(b, 1.0, 0.75, 1.0, mixc(C.paper, C.paperCore, 0.3), [1.1, 0]);
  b.pop();
  b.push(m4.translate([0, 2.4, 0]));
  box(b, 1.5, 0.28, 1.5, C.stone, [0, 0.1]);
  b.pop();
  b.push(m4.translate([0, 2.75, 0]));
  cylinder(b, 4, 0.75, 0.05, 0.8, C.stoneDark, [0, 0.1], { y0: 0 });
  b.pop();
  ctx.points.push({ p: [x, y + 1.9, z], col: C.paper, range: 9, int: 0.3 });
  b.pop();
}

function tree(b, ctx, rng, o = {}) {
  const h = o.h ?? 6 + rng() * 5;
  const pink = o.pink ?? false;
  const lean = (rng() - 0.5) * 0.14;
  b.push(m4.translate([0, 0, 0]));
  b.push(m4.rotZ(lean));
  cylinder(b, 7, 0.5, 0.24, h * 0.72, rgb('#2e211b'), [0, 0.06], { y0: 0 });
  // canopy: a cluster of soft blobs
  const leaf = pink ? rgb('#b98a9e') : mixc(C.moss, rgb('#2a4028'), rng() * 0.5);
  const n = 5 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const a = rng() * TAU, rr = (0.15 + rng() * 0.85) * (pink ? 2.9 : 2.6);
    const yy = h * (0.62 + rng() * 0.42);
    b.push(m4.translate([Math.cos(a) * rr, yy, Math.sin(a) * rr]));
    const s = (pink ? 1.95 : 1.85) * (0.62 + rng() * 0.55);
    b.push(m4.scale([s, s * 0.82, s]));
    sphere(b, 1, mulc(leaf, 0.85 + rng() * 0.3), [0, 0.04], { rings: 5, seg: 8, jitter: 0.3, seed: rng() * 100 });
    b.pop(); b.pop();
  }
  // a warm glow caught under a blossom tree
  if (pink) ctx.points.push({ p: [0, h * 0.7, 0], col: rgb('#ff9ab0'), range: 22, int: 0.22 });
  b.pop();
  b.pop();
}

function banner(b, x, y, z, rotY, col) {
  b.push(m4.translate([x, y, z]));
  b.push(m4.rotY(rotY));
  cylinder(b, 5, 0.1, 0.08, 6.5, C.wood, [0, 0.1], { y0: 0 });
  b.push(m4.translate([0.55, 5.9, 0]));
  b.push(m4.rotY(Math.PI / 2));
  b.push(m4.rotZ(0.02));
  box(b, 0.04, 3.6, 1.15, col, [0.05, 0.05]);
  b.pop(); b.pop(); b.pop();
  // gold trim strip
  b.push(m4.translate([0.56, 5.9, 0.55]));
  b.push(m4.rotY(Math.PI / 2));
  box(b, 0.05, 3.6, 0.1, C.gold, [0.25, 0.5]);
  b.pop(); b.pop();
  b.pop();
  b.pop();
}

// ---------------------------------------------------------------- structures
function stairs(b, ctx, p0, p1, width, steps) {
  const d = sub(p1, p0);
  const len = Math.hypot(d[0], d[2]);
  const yaw = Math.atan2(d[0], d[2]);
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps, t1 = (i + 1) / steps;
    const px = lerp(p0[0], p1[0], (t0 + t1) / 2);
    const pz = lerp(p0[2], p1[2], (t0 + t1) / 2);
    const py = lerp(p0[1], p1[1], t0);
    b.push(m4.translate([px, py + 0.25, pz]));
    b.push(m4.rotY(yaw));
    box(b, width, 0.5, len / steps + 0.06, C.stone, [0, 0.08]);
    b.pop(); b.pop();
    if (i % 3 === 0) {
      for (const s of [-1, 1]) {
        const off = s * (width / 2 + 0.35);
        const ox = px + Math.cos(yaw) * off, oz = pz - Math.sin(yaw) * off;
        lanternPost(b, ctx, ox, py + 0.4, oz, 4.2);
      }
    }
  }
}

function bridge(b, ctx, p0, p1, width, o = {}) {
  const arch = o.arch ?? 6;
  const segs = o.segs ?? 16;
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const x = lerp(p0[0], p1[0], t), z = lerp(p0[2], p1[2], t);
    const y = lerp(p0[1], p1[1], t) + Math.sin(Math.PI * t) * arch;
    pts.push([x, y, z]);
  }
  // deck
  for (let i = 0; i < segs; i++) {
    const a = pts[i], c = pts[i + 1];
    const dir = sub(c, a);
    const yaw = Math.atan2(dir[0], dir[2]);
    const len = Math.hypot(dir[0], dir[2]) + 0.12;
    b.push(m4.translate([(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2]));
    b.push(m4.rotY(yaw));
    box(b, width, 0.34, len, C.woodLight, [0, 0.12]);
    // plank lines
    b.pop();
    // railing posts
    if (i % 2 === 0) {
      for (const s of [-1, 1]) {
        const off = s * (width / 2 - 0.2);
        const ox = Math.cos(yaw) * off, oz = -Math.sin(yaw) * off;
        b.push(m4.translate([ox, 0.75, oz]));
        box(b, 0.14, 1.3, 0.14, C.wood, [0, 0.1]);
        b.pop();
      }
      if (i % 4 === 0) {
        ctx.lanterns.push({ p: [a[0], a[1] + 1.5, a[2]], size: 0.55, col: C.paper, alpha: 1, shape: 1 });
        ctx.points.push({ p: [a[0], a[1] + 1.2, a[2]], col: C.paper, range: 10, int: 0.28 });
      }
    }
    b.pop();
  }
  // handrails
  for (const s of [-1, 1]) {
    const off = s * (width / 2 - 0.2);
    for (let i = 0; i < segs; i++) {
      const a = pts[i], c = pts[i + 1];
      const dir = sub(c, a);
      const yaw = Math.atan2(dir[0], dir[2]);
      const len = Math.hypot(dir[0], dir[2]);
      b.push(m4.translate([(a[0] + c[0]) / 2, (a[1] + c[1]) / 2 + 1.35, (a[2] + c[2]) / 2]));
      b.push(m4.rotY(yaw));
      b.push(m4.translate([off, 0, 0]));
      box(b, 0.1, 0.1, len + 0.05, C.wood, [0, 0.1]);
      b.pop(); b.pop(); b.pop();
    }
  }
}

function waterfallGeom(fb, o) {
  const { x, y, z, dirX, dirZ, width, drop } = o;
  const segs = 20;
  const nx = dirX, nz = dirZ;
  const side = [nz, 0, -nx];
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs, t1 = (i + 1) / segs;
    const y0 = y - t0 * drop, y1 = y - t1 * drop;
    const out0 = Math.sin(t0 * 1.2) * drop * 0.06, out1 = Math.sin(t1 * 1.2) * drop * 0.06;
    const w0 = width * (1 - t0 * 0.30), w1 = width * (1 - t1 * 0.30);
    const cx0 = x + nx * out0, cz0 = z + nz * out0;
    const cx1 = x + nx * out1, cz1 = z + nz * out1;
    const a = [cx0 - side[0] * w0 / 2, y0, cz0 - side[2] * w0 / 2];
    const bq = [cx0 + side[0] * w0 / 2, y0, cz0 + side[2] * w0 / 2];
    const c = [cx1 + side[0] * w1 / 2, y1, cz1 + side[2] * w1 / 2];
    const d = [cx1 - side[0] * w1 / 2, y1, cz1 - side[2] * w1 / 2];
    fb.quadc(a, bq, c, d, [0, t0, 1], [1, t0, 1], [1, t1, 1], [0, t1, 1], [0, 0]);
  }
}

// ---------------------------------------------------------------- koi lantern
export function buildKoi(gl, opts = {}) {
  const b = new B();
  const seg = 12;
  const rings = 16;
  // body along Z: tail at -0.55, head at +0.55
  // body along Z: tail at -0.8, head at +0.8 (slim, fish-like)
  const prof = [];
  const key = [
    [0.0, 0.03], [0.08, 0.10], [0.18, 0.17], [0.32, 0.25], [0.48, 0.30],
    [0.60, 0.31], [0.72, 0.28], [0.84, 0.21], [0.93, 0.13], [1.0, 0.05],
  ];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    let k = 0;
    while (k < key.length - 2 && key[k + 1][0] < t) k++;
    const [t0, r0] = key[k], [t1, r1] = key[k + 1];
    const u = (t - t0) / Math.max(1e-4, t1 - t0);
    const r = lerp(r0, r1, clamp(u, 0, 1));
    prof.push([Math.max(0.02, r), -0.8 + t * 1.6]);
  }
  // lathe around Z: build manually (rings around Z axis)
  const colFn = (t) => {
    if (t < 0.18) return mixc(C.koiRed, rgb('#ff7a3a'), t / 0.18);
    if (t < 0.55) return mixc(rgb('#ff9a48'), C.koiGold, (t - 0.18) / 0.37);
    return mixc(C.koiGold, C.koiWhite, Math.min(1, (t - 0.55) / 0.45));
  };
  for (let k = 0; k < prof.length - 1; k++) {
    const [r0, z0] = prof[k], [r1, z1] = prof[k + 1];
    const t = k / (prof.length - 1);
    const col = colFn(t);
    const rib = k % 2 === 0 ? 1.0 : 0.66;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const p00 = [c0 * r0, s0 * r0, z0], p10 = [c1 * r0, s1 * r0, z0];
      const p01 = [c0 * r1, s0 * r1, z1], p11 = [c1 * r1, s1 * r1, z1];
      const N = norm([(p00[0] + p10[0]) / 2, (p00[1] + p10[1]) / 2, (z0 - z1) * 0.15]);
      b.quad(p00, p10, p11, p01, mulc(col, rib), [0.17, 0.3], N);
    }
  }
  // tail fin (a fan of quads) + pectoral fins + dorsal
  const finCol = mulc(rgb('#ff8a4a'), 0.95);
  const finMat = [0.18, 0.2];
  const tail = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const a = (t - 0.5) * 1.5;
    tail.push([Math.sin(a) * 0.52, Math.cos(a) * 0.52 - 0.12, -0.82 - t * 0.02]);
  }
  const tRoot = [0, 0, -0.8];
  for (let i = 0; i < 8; i++) {
    b.tri(tRoot, tail[i], tail[i + 1], finCol, finMat, [0, 0, -1], [0, 0, -1], [0, 0, -1]);
    b.tri(tRoot, tail[i + 1], tail[i], finCol, finMat, [0, 0, 1], [0, 0, 1], [0, 0, 1]);
  }
  // pectoral fins
  for (const s of [-1, 1]) {
    const root = [s * 0.3, -0.12, 0.24];
    const a = [s * 0.95, -0.32, 0.05], c = [s * 0.72, -0.5, 0.42];
    b.tri(root, a, c, finCol, finMat, [0, -1, 0], [0, -1, 0], [0, -1, 0]);
    b.tri(root, c, a, finCol, finMat, [0, 1, 0], [0, 1, 0], [0, 1, 0]);
  }
  // dorsal ridge
  for (let i = 0; i < 6; i++) {
    const t = 0.35 + i * 0.08;
    const z = -0.8 + t * 1.6;
    const r = 0.28;
    const h = 0.16 * Math.sin((i / 5) * Math.PI);
    b.tri([0, r * 0.9, z], [0, r + h, z + 0.09], [0, r * 0.9, z + 0.12], finCol, finMat, [0, 1, 0], [0, 1, 0], [0, 1, 0]);
  }
  // eyes: dark discs on both sides of the head
  for (const s of [-1, 1]) {
    b.push(m4.translate([s * 0.2, 0.08, 0.52]));
    b.push(m4.rotY(s * Math.PI / 2));
    cylinder(b, 8, 0.075, 0.075, 0.05, rgb('#2a1a12'), [0, 0.4], { y0: -0.025 });
    b.pop(); b.pop();
  }
  return b;
}

// ---------------------------------------------------------------- the world
export const ISLANDS = [
  { id: 'main', x: 0, z: 0, y: 0, r: 62, depth: 120, style: 'town', seed: 1 },
  { id: 'garden', x: 0, z: 132, y: -6, r: 36, depth: 78, style: 'garden', seed: 11 },
  { id: 'shrine', x: -134, z: -34, y: 10, r: 28, depth: 66, style: 'rock', seed: 22 },
  { id: 'tower', x: 116, z: -70, y: 24, r: 24, depth: 60, style: 'rock', seed: 33 },
  { id: 'rock1', x: -78, z: 100, y: -34, r: 20, depth: 52, style: 'rock', seed: 44 },
  { id: 'bigrock', x: 162, z: 64, y: -26, r: 42, depth: 96, style: 'rock', seed: 55 },
  { id: 'far', x: -176, z: 84, y: 28, r: 18, depth: 46, style: 'rock', seed: 66 },
  { id: 'high', x: 66, z: -132, y: 44, r: 21, depth: 54, style: 'rock', seed: 77 },
];

// Lantern-fish circuits. The big ones cruise slowly just above the town so the
// festival reads like the reference photographs; the rest wander between towers.
export const KOI_PATHS = [
  { cx: 0, cz: 0, r: 82, y: 26, len: 30, speed: 0.028, phase: 0.2, dir: 1 },
  { cx: 0, cz: 6, r: 110, y: 46, len: 26, speed: -0.020, phase: 2.5, dir: 1 },
  { cx: 0, cz: 0, r: 154, y: 64, len: 34, speed: 0.015, phase: 4.1, dir: 1 },
  { cx: -20, cz: -8, r: 72, y: 20, len: 18, speed: 0.045, phase: 1.2, dir: 1 },
  { cx: 30, cz: 40, r: 70, y: 16, len: 15, speed: -0.048, phase: 5.0, dir: 1 },
  { cx: -70, cz: 60, r: 62, y: 22, len: 19, speed: 0.055, phase: 0.7, dir: -1 },
  { cx: 0, cz: 110, r: 46, y: 6, len: 21, speed: 0.038, phase: 3.3, dir: 1 },
];

export function buildWorld(gl) {
  const b = new B();
  const fb = new B();       // waterfalls (alpha blend)
  const ab = new B();       // additive glows
  const ctx = { lanterns: [], points: [], additive: [], beams: [], falls: [], lightBeacon: [0, 50, 0] };
  const rng = mulberry32(20261119);

  // ---- islands
  for (const isl of ISLANDS) { b.note('island:' + isl.id); islandTop(b, isl); }

  // ---- main city
  const main = ISLANDS[0];
  // lower terrace is the island top itself; mid + upper platforms
  b.push(m4.translate([0, 0, 0]));
  // mid terrace retaining wall + top
  b.push(m4.translate([0, 4.5, 0]));
  cylinder(b, 40, 36, 36, 9, C.stone, [0, 0.1], { y0: 0, caps: false });
  b.pop();
  b.push(m4.translate([0, 9, 0]));
  cylinder(b, 40, 36, 36, 0.6, mixc(C.stone, C.stoneDark, 0.25), [0, 0.1], { y0: 0, caps: true });
  b.pop();
  // upper terrace
  b.push(m4.translate([0, 14, 0]));
  cylinder(b, 32, 22, 22, 10, C.stone, [0, 0.1], { y0: 0, caps: false });
  b.pop();
  b.push(m4.translate([0, 19, 0]));
  cylinder(b, 32, 22, 22, 0.6, mixc(C.stone, C.stoneDark, 0.2), [0, 0.1], { y0: 0, caps: true });
  b.pop();
  b.pop();

  // stairs: south side, lower -> mid -> upper
  stairs(b, ctx, [0, 0, 47], [0, 9, 34], 5.5, 12);
  stairs(b, ctx, [0, 9, 30], [0, 19, 21], 4.5, 10);
  // stairs north too
  stairs(b, ctx, [0, 0, -47], [0, 9, -34], 4.5, 12);

  // pagoda + clock tower + torii on the upper terrace
  pagoda(b, ctx, 0, 19, 0);
  clockTower(b, ctx, -14, 19, -8);
  torii(b, ctx, 0, 19, 13, 1.15, Math.PI);
  torii(b, ctx, 0, 0, 46, 1.3, Math.PI);

  // blossom trees around the upper terrace
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + 0.4;
    b.push(m4.translate([Math.cos(a) * 16, 19.6, Math.sin(a) * 16]));
    tree(b, ctx, rng, { pink: i % 2 === 0, h: 7 + rng() * 3 });
    b.pop();
  }
  // garden trees on the mid terrace
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + 0.9;
    b.push(m4.translate([Math.cos(a) * 30, 9.6, Math.sin(a) * 30]));
    tree(b, ctx, rng, { pink: rng() < 0.35, h: 5 + rng() * 4 });
    b.pop();
  }
  // stone lanterns along the upper ring
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    stoneLantern(b, ctx, Math.cos(a) * 20, 19.6, Math.sin(a) * 20);
  }

  // ---- lower town: machiya packed along the ring road (town.js)
  const townStats = buildTown(b, ctx, rng);
  console.log('[town] buildings', townStats.count, 'tris', townStats.tris, 'bounds', JSON.stringify(townStats.bounds), 'street', JSON.stringify(townStats.street ? { items: townStats.street.items, tris: townStats.street.tris } : null));
  // lantern posts along the rim + banners
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU;
    const lx = Math.cos(a) * 57, lz = Math.sin(a) * 57;
    lanternPost(b, ctx, lx, mainIslandY(lx, lz) + 0.15, lz, 5.6);
    if (i % 3 === 0) {
      const cols = [rgb('#c8402c'), rgb('#2f6ea8'), rgb('#e0a83c'), rgb('#6a8a4a')];
      const bx = Math.cos(a + 0.06) * 59.5, bz = Math.sin(a + 0.06) * 59.5;
      banner(b, bx, mainIslandY(bx, bz) + 0.15, bz, -a, cols[i % 4]);
    }
  }

  // ---- island-specific dressing
  for (const isl of ISLANDS) {
    if (isl.id === 'main') continue;
    b.push(m4.translate([isl.x, isl.y, isl.z]));
    b.note('isl-prop:' + isl.id);
    if (isl.id === 'garden') {
      // a pond, blossom trees, a small pavilion
      b.push(m4.translate([0, 0.3, 0]));
      cylinder(b, 24, 9, 9, 0.4, C.water, [0, 0.75], { y0: 0, caps: true });
      b.pop();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        b.push(m4.translate([Math.cos(a) * 20, 0.4, Math.sin(a) * 20]));
        tree(b, ctx, rng, { pink: i % 2 === 0, h: 8 + rng() * 4 });
        b.pop();
      }
      // pavilion
      b.push(m4.translate([0, 0.4, -14]));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        b.push(m4.translate([sx * 3, 2.2, sz * 3]));
        box(b, 0.4, 4.4, 0.4, C.red, [0, 0.12]);
        b.pop();
      }
      b.push(m4.translate([0, 5.2, 0]));
      roof(b, 8, 8, 3.4, C.roof, [0, 0.2], { over: 1.4, rows: 5, lipH: 0.5 });
      b.pop();
      ctx.lanterns.push({ p: [isl.x, isl.y + 5.0, isl.z - 14], size: 1.2, col: C.paper, alpha: 1, shape: 0 });
      b.pop();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        stoneLantern(b, ctx, Math.cos(a) * 24, 0.5, Math.sin(a) * 24);
      }
    } else if (isl.id === 'shrine') {
      torii(b, ctx, 0, 0.4, 12, 1.5, Math.PI);
      b.push(m4.translate([0, 0.4, -8]));
      box(b, 12, 5, 9, C.red, [0, 0.12]);
      b.push(m4.translate([0, 2.5, 0]));
      box(b, 12.2, 0.4, 9.2, C.gold, [0.3, 0.5]);
      b.pop();
      b.push(m4.translate([0, 5, 0]));
      roof(b, 12, 9, 5, C.roof, [0, 0.2], { over: 2, rows: 6, lipH: 0.7 });
      b.pop();
      b.pop();
      for (let i = 0; i < 4; i++) {
        b.push(m4.translate([Math.cos(i * 1.7) * 14, 0.4, Math.sin(i * 1.7) * 14]));
        tree(b, ctx, rng, { pink: i % 2 === 0, h: 9 + rng() * 3 });
        b.pop();
      }
      ctx.falls.push({ x: isl.x + 24, y: isl.y - 2, z: isl.z + 6, dirX: 0.9, dirZ: 0.4, width: 7, drop: 150 });
    } else if (isl.id === 'tower') {
      // a slender lantern tower
      for (let i = 0; i < 4; i++) {
        const h = 6 - i * 0.5, w = 5 - i * 0.6;
        b.push(m4.translate([0, 1 + i * 5.2 + h / 2, 0]));
        box(b, w, h, w, C.woodMid, [0, 0.12]);
        b.pop();
        b.push(m4.translate([0, 1 + i * 5.2 + h, 0]));
        roof(b, w, w, 1.8, C.roof, [0, 0.2], { over: 0.9, rows: 3, lipH: 0.35 });
        b.pop();
        for (let s = 0; s < 4; s++) {
          const a = (s / 4) * TAU + Math.PI / 4;
          ctx.lanterns.push({ p: [isl.x + Math.cos(a) * w * 0.8, isl.y + 1 + i * 5.2 + h * 0.6, isl.z + Math.sin(a) * w * 0.8], size: 0.75, col: C.paper, alpha: 1, shape: 1 });
        }
      }
      ctx.beams.push({ p: [isl.x, isl.y + 27, isl.z], r0: 1.6, r1: 0.8, h: 140, col: C.paper, int: 0.09 });
      ctx.falls.push({ x: isl.x - 14, y: isl.y - 2, z: isl.z - 10, dirX: -0.7, dirZ: -0.6, width: 5, drop: 130 });
    } else if (isl.id === 'bigrock') {
      ctx.falls.push({ x: isl.x - 30, y: isl.y - 2, z: isl.z + 10, dirX: -0.95, dirZ: 0.2, width: 11, drop: 210 });
      ctx.falls.push({ x: isl.x + 18, y: isl.y - 2, z: isl.z - 26, dirX: 0.5, dirZ: -0.85, width: 6, drop: 170 });
      for (let i = 0; i < 5; i++) {
        b.push(m4.translate([Math.cos(i * 2.1) * 22, 0.5, Math.sin(i * 2.1) * 22]));
        tree(b, ctx, rng, { pink: false, h: 8 + rng() * 5 });
        b.pop();
      }
    } else if (isl.id === 'high' || isl.id === 'far') {
      for (let i = 0; i < 3; i++) {
        b.push(m4.translate([Math.cos(i * 2.4) * isl.r * 0.5, 0.5, Math.sin(i * 2.4) * isl.r * 0.5]));
        tree(b, ctx, rng, { pink: i === 0, h: 7 + rng() * 4 });
        b.pop();
      }
      if (isl.id === 'high') ctx.falls.push({ x: isl.x + 12, y: isl.y - 2, z: isl.z + 6, dirX: 0.6, dirZ: 0.5, width: 5, drop: 150 });
    } else if (isl.id === 'rock1') {
      b.push(m4.translate([0, 0.5, 0]));
      tree(b, ctx, rng, { pink: true, h: 10 });
      b.pop();
      stoneLantern(b, ctx, 4, 0.5, 3);
    }
    b.pop();
  }

  // ---- bridges
  bridge(b, ctx, [0, 0, 60], [0, -6, 100], 4.2, { arch: 5 });
  bridge(b, ctx, [-46, 0, 40], [-110, 10, -22], 3.6, { arch: 9, segs: 22 });
  bridge(b, ctx, [52, 0, 20], [100, 24, -52], 3.4, { arch: 10, segs: 22 });

  // ---- long lantern strings between islands
  b.note('strings');
  const strings = [
    [[0, 7, 58], [-120, 16, -26]],
    [[46, 9, 30], [104, 30, -56]],
    [[-30, 20, -40], [-166, 34, 80]],
    [[30, 22, 40], [156, -18, 58]],
    [[0, 26, 0], [60, 52, -126]],
  ];
  for (const [p0, p1] of strings) {
    const pts = catenary(p0, p1, Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) * 0.10, 26);
    ribbon(b, pts, pts.map(() => 0.09), C.wood, [0, 0.1]);
    for (let i = 2; i < pts.length - 2; i += 1) {
      ctx.lanterns.push({ p: [pts[i][0], pts[i][1] - 0.9, pts[i][2]], size: 0.62, col: mixc(C.paper, rgb('#ff9a48'), rng() * 0.5), alpha: 1, shape: 1 });
    }
  }
  // strings round the lower town
  for (let i = 0; i < 12; i++) {
    const a0 = (i / 12) * TAU, a1 = ((i + 1) / 12) * TAU;
    const p0 = [Math.cos(a0) * 50, 6.2, Math.sin(a0) * 50];
    const p1 = [Math.cos(a1) * 50, 6.2, Math.sin(a1) * 50];
    const pts = catenary(p0, p1, 1.6, 8);
    ribbon(b, pts, pts.map(() => 0.07), C.wood, [0, 0.1]);
    for (let k = 1; k < 7; k++) {
      ctx.lanterns.push({ p: [pts[k][0], pts[k][1] - 0.7, pts[k][2]], size: 0.5, col: C.paper, alpha: 1, shape: 1 });
    }
  }

  // ---- rune circle on the mid terrace (additive)
  ctx.additive.push({ kind: 'ring', p: [0, 9.7, 0], r: 26, tube: 0.16, col: rgb('#ffcf8a'), int: 0.55, spin: 0.06 });
  ctx.additive.push({ kind: 'ring', p: [0, 9.72, 0], r: 21, tube: 0.1, col: rgb('#8fd8ff'), int: 0.4, spin: -0.09 });
  ctx.additive.push({ kind: 'ring', p: [0, 19.7, 0], r: 15, tube: 0.14, col: rgb('#ffd9a0'), int: 0.5, spin: 0.1 });

  // ---- waterfalls
  for (const f of ctx.falls) waterfallGeom(fb, f);
  // falls off the main island rim
  for (let i = 0; i < 5; i++) {
    const a = 0.7 + i * 1.15;
    waterfallGeom(fb, {
      x: Math.cos(a) * 60, y: 0.2, z: Math.sin(a) * 60,
      dirX: Math.cos(a), dirZ: Math.sin(a), width: 5 + (i % 3) * 2, drop: 220,
    });
  }

  // ---- build additive glow geometry
  const rings = [];
  for (const a of ctx.additive) {
    if (a.kind === 'ring') {
      b.push(m4.translate(a.p));
      torus(ab, a.r, a.tube, 48, 6, a.col, [a.int, 0], 'y');
      b.pop();
      rings.push(a);
    }
  }
  for (const bm of ctx.beams) {
    ab.push(m4.translate(bm.p));
    beamMesh(ab, bm.r0, bm.r1, bm.h, bm.col, [bm.int, 0]);
    ab.pop();
  }

  // ---- rim lanterns on every island
  for (const isl of ISLANDS) {
    const n = isl.id === 'main' ? 0 : 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + isl.seed;
      const rr = isl.r * 0.92;
      ctx.lanterns.push({
        p: [isl.x + Math.cos(a) * rr, isl.y + 1.2, isl.z + Math.sin(a) * rr],
        size: 0.55, col: mixc(C.paper, rgb('#ff9a48'), 0.4), alpha: 1, shape: 1,
      });
    }
  }

  // ---- festival fire in the lower plaza
  {
    const fx = 0, fz = 26;
    b.push(m4.translate([fx, 0.6, fz]));
    cylinder(b, 12, 3.4, 3.0, 0.9, C.stoneDark, [0, 0.1], { y0: 0, caps: true });
    b.pop();
    b.push(m4.translate([fx, 1.2, fz]));
    cylinder(b, 10, 2.6, 0.5, 1.2, rgb('#3a2018'), [0.3, 0.05], { y0: 0, caps: false });
    b.pop();
    // flame tongues (additive)
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU;
      ab.push(m4.translate([fx + Math.cos(a) * 0.9, 2.0, fz + Math.sin(a) * 0.9]));
      beamMesh(ab, 0.9, 0.05, 3.2 + (i % 3) * 1.1, mixc(rgb('#ffd27a'), rgb('#ff7a2a'), (i % 3) / 3), [0.5, 0]);
      ab.pop();
    }
    ab.push(m4.translate([fx, 1.6, fz]));
    beamMesh(ab, 1.8, 0.1, 5.5, rgb('#ffb85a'), [0.55, 0]);
    ab.pop();
    ctx.points.push({ p: [fx, 3.2, fz], col: rgb('#ff9a40'), range: 46, int: 1.6 });
    ctx.fire = [fx, 2.0, fz];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.6;
      lanternPost(b, ctx, fx + Math.cos(a) * 7, 0.2, fz + Math.sin(a) * 7, 5.0);
    }
  }

  // ---- cumulus mounds around and below the islands
  ctx.cloudPuffs = [];
  const puffRng = mulberry32(4242);
  const addMound = (cx, cy, cz, scale, seed) => {
    const r = mulberry32(seed);
    const n = 6 + Math.floor(r() * 5);
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, rr = r() * scale * 0.75;
      ctx.cloudPuffs.push({
        p: [cx + Math.cos(a) * rr, cy + (r() - 0.35) * scale * 0.5, cz + Math.sin(a) * rr],
        size: scale * (0.55 + r() * 0.65),
        rot: r() * TAU,
        alpha: 0.32 + r() * 0.24,
        shape: 2,
        col: mixc(rgb('#7884a4'), rgb('#c6ccdf'), r()),
      });
    }
  };
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * TAU + puffRng() * 0.2;
    const dist = 190 + puffRng() * 520;
    addMound(Math.cos(a) * dist, -150 + puffRng() * 60, Math.sin(a) * dist, 60 + puffRng() * 85, 100 + i * 13);
  }
  for (const isl of ISLANDS) {
    const k = 2 + Math.floor(puffRng() * 3);
    for (let i = 0; i < k; i++) {
      const a = puffRng() * TAU;
      const rr = isl.r * (0.9 + puffRng() * 0.55);
      addMound(
        isl.x + Math.cos(a) * rr,
        isl.y - isl.depth * (0.35 + puffRng() * 0.3),
        isl.z + Math.sin(a) * rr,
        isl.r * (0.28 + puffRng() * 0.26),
        500 + isl.seed * 7 + i
      );
    }
  }
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU + 0.15;
    addMound(
      Math.cos(a) * (1100 + puffRng() * 700),
      -150 + puffRng() * 40,
      Math.sin(a) * (1100 + puffRng() * 700),
      120 + puffRng() * 90,
      900 + i * 31
    );
  }

  {
    let bad = 0, maxSize = 0;
    for (const l of ctx.lanterns) {
      if (!l.p || !isFinite(l.p[0]) || !isFinite(l.p[1]) || !isFinite(l.p[2]) || !isFinite(l.size)) bad++;
      if (l.size > maxSize) maxSize = l.size;
    }
    let badPuff = 0, maxPuff = 0;
    for (const q of ctx.cloudPuffs) {
      if (!q.p || !isFinite(q.p[0]) || !isFinite(q.p[1]) || !isFinite(q.p[2]) || !isFinite(q.size)) badPuff++;
      if (q.size > maxPuff) maxPuff = q.size;
    }
    console.log('[world] lanterns', ctx.lanterns.length, 'bad', bad, 'maxSize', maxSize.toFixed(2), '| puffs', ctx.cloudPuffs.length, 'bad', badPuff, 'max', maxPuff.toFixed(1));
  }

  const staticMesh = (() => {
    const d = b.build();
    return require_mesh(gl, d);
  })();
  {
    let zeroN = 0, zeroC = 0, zeroA = 0;
    for (let i = 0; i < b.v.length; i += 11) {
      const nl = Math.hypot(b.v[i + 3], b.v[i + 4], b.v[i + 5]);
      const cl = Math.hypot(b.v[i + 6], b.v[i + 7], b.v[i + 8]);
      if (nl < 1e-5) zeroN++;
      if (cl < 1e-5) zeroC++;
      if (!isFinite(b.v[i]) || !isFinite(b.v[i + 3])) zeroA++;
    }
    console.log('[world] verts', b.v.length / 11, 'zeroNormals', zeroN, 'zeroColor', zeroC, 'nonFinite', zeroA);
  }
  const fallMesh = (() => {
    const d = fb.build();
    return require_mesh(gl, d);
  })();
  const addMesh = (() => {
    const d = ab.build();
    return require_mesh(gl, d);
  })();

  return {
    staticMesh, fallMesh, addMesh,
    lanterns: ctx.lanterns,
    cloudPuffs: ctx.cloudPuffs,
    points: ctx.points,
    rings,
    falls: ctx.falls,
    lightBeacon: ctx.lightBeacon,
    tris: b.triCount + fb.triCount + ab.triCount,
  };
}

// late import to avoid a cycle at module load
import { mesh as _mesh } from './gl.js';
function require_mesh(gl, d) {
  return _mesh(gl, d.verts, d.indices);
}