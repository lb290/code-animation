
// PALACE — the enterable Beaux-Arts palace on the hero terrace (owner: agent "palace-shell").
// Contract: src/palace-plan.js (PAL dimensions, PC palette, PM materials). Called by world.js
// as buildPalace(b, ctx, rng). All geometry is static, merged into the world mesh.
//
// Layout (see palace-plan.js):
//   podium   x ±53, z 96..182, y 0..30   — rusticated mass, blind arcades, cornice, parapet, urns
//   core     x ±20, z 124..176           — 8-bay front, portal, side doors, portico, attic, parapet
//   wings    x 20..52 (mirrored)         — base + giant order + mansard
//   pavilions x 39..53 (mirrored)        — taller corner pavilions with pediment + sculptures
//   drum/dome r 16.6, 54.5..62 / 62..76  — open oculus, 16 gold ribs
//   interior shell: front wall, rotunda r 15, apse, floor (furnishings live in palace-hall.js)
import { PAL, PC, PM, pAt, pBox, YAW } from './palace-plan.js';
import { C } from './palette.js';
import { box, cylinder, lathe, mulc, mixc } from './geo.js';
import { MT, ellipsoid, disc } from './lib3d.js';
import { cornice, column, balustrade, statue, mansard } from './arch.js';
import { TAU } from './math.js';
import { ROOM, buildWingRooms } from './palace-rooms.js';

const P = PAL;
const DECK = P.deckY;               // 30
const FZ = P.frontZ;                // 124
const CORE = P.core, WING = P.wing, PAV = P.pavilion, PORT = P.portico, POR = P.portal, HALL = P.hall, DOME = P.dome;
const D90 = Math.PI / 2;
const NS = [0, 0, -1], PS = [0, 0, 1], NX3 = [-1, 0, 0], PX3 = [1, 0, 0], UP = [0, 1, 0], DN = [0, -1, 0];

// ---------------------------------------------------------------- palette
const STONE = PC.stone, STONE_HI = PC.stoneHi, STONE_SH = PC.stoneSh, STONE_DEEP = PC.stoneDeep;
const MARBLE = PC.marble, MARBLE_HI = PC.marbleHi, MARBLE_SH = PC.marbleSh;
const GOLD = PC.gold, GOLD_HI = PC.goldHi;
const SLATE = PC.slate, SLATE_HI = PC.slateHi, SLATE_LO = PC.slateLo;
const GLASS_D = PC.glassWin, GLASS_S = PC.glassSky;
const HALLW = PC.hallWall, HALLHI = PC.hallWallHi, HALLSH = PC.hallShade;
const FLR = PC.floorA, FLRB = PC.floorB;

// ---------------------------------------------------------------- local helpers
function rotY(b, x, y, z, ang, fn) {
  const c = Math.cos(ang), s = Math.sin(ang);
  b.push([c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, x, y, z, 1]);
  fn();
  b.pop();
}
function rotZ(b, x, y, z, ang, fn) {
  const c = Math.cos(ang), s = Math.sin(ang);
  b.push([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
  fn();
  b.pop();
}
// local box (current frame), centred
function lbox(b, x, y, z, sx, sy, sz, col, mat, opts) {
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
  box(b, sx, sy, sz, col, mat, opts);
  b.pop();
}
// horizontal annulus, y up, in the current frame
function ringY(b, r0, r1, y, seg, col, mat, up = true) {
  const N = up ? UP : DN;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    b.quad([c0 * r0, y, s0 * r0], [c1 * r0, y, s1 * r0], [c1 * r1, y, s1 * r1], [c0 * r1, y, s0 * r1], col, mat, N);
  }
}
// cylinder band (open), outward or inward normals
function cylBand(b, rb, rt, y0, y1, seg, col, mat, out = true, colFn) {
  const dy = y1 - y0, dr = rt - rb;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    let n0 = [c0 * dy, -dr, s0 * dy], n1 = [c1 * dy, -dr, s1 * dy];
    if (!out) { n0 = [-n0[0], -n0[1], -n0[2]]; n1 = [-n1[0], -n1[1], -n1[2]]; }
    const cc = colFn ? colFn(i / seg) : col;
    b.tri([c0 * rb, y0, s0 * rb], [c0 * rt, y1, s0 * rt], [c1 * rt, y1, s1 * rt], cc, mat, n0, n1, n1);
    b.tri([c0 * rb, y0, s0 * rb], [c1 * rt, y1, s1 * rt], [c1 * rb, y0, s1 * rb], cc, mat, n0, n1, n0);
  }
}
// partial cylindrical band with inward normals, current frame, angles in radians from +X
function arcBandIn(b, r, y0, y1, a0, a1, seg, col, mat, colFn) {
  for (let i = 0; i < seg; i++) {
    const t0 = a0 + ((a1 - a0) * i) / seg, t1 = a0 + ((a1 - a0) * (i + 1)) / seg;
    const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
    const N0 = [-c0, 0, -s0], N1 = [-c1, 0, -s1];
    const cc = colFn ? colFn((t0 + t1) * 0.5) : col;
    b.tri([c0 * r, y0, s0 * r], [c0 * r, y1, s0 * r], [c1 * r, y1, s1 * r], cc, mat, N0, N0, N1);
    b.tri([c0 * r, y0, s0 * r], [c1 * r, y1, s1 * r], [c1 * r, y0, s1 * r], cc, mat, N0, N1, N1);
  }
}
// horizontal ruby/joint band on a facade (local frame, +z out)
function jointLine(b, x0, x1, y, z, w, col) {
  b.quad([x0, y - w / 2, z], [x1, y - w / 2, z], [x1, y + w / 2, z], [x0, y + w / 2, z], col, PM.stone, PS);
}
// rusticated wall: courses + staggered vertical joints
function rusticated(b, x0, x1, y0, y1, nCourse, z, col, colJ, skip) {
  const sk = skip || [];
  const segs = (a, c) => {
    let out = [[a, c]];
    for (const [s0, s1] of sk) {
      const nx = [];
      for (const [u0, u1] of out) {
        if (s1 <= u0 || s0 >= u1) { nx.push([u0, u1]); continue; }
        if (s0 > u0 + 0.1) nx.push([u0, s0]);
        if (s1 < u1 - 0.1) nx.push([s1, u1]);
      }
      out = nx;
    }
    return out.filter(([p, q]) => q - p > 0.2);
  };
  const inside = (x) => sk.some(([s0, s1]) => x > s0 && x < s1);
  const w = x1 - x0, ch = (y1 - y0) / nCourse;
  for (let k = 1; k < nCourse; k++) {
    const y = y0 + k * ch;
    for (const [a, c] of segs(x0, x1)) {
      jointLine(b, a, c, y, z, 0.07, colJ);
      b.quad([a, y + 0.04, z + 0.012], [c, y + 0.04, z + 0.012], [c, y + 0.11, z + 0.012], [a, y + 0.11, z + 0.012], mulc(col, 1.04), PM.stone, PS);
    }
  }
  for (let k = 0; k < nCourse; k++) {
    const ya = y0 + k * ch + 0.13, yb = y0 + (k + 1) * ch - 0.13;
    const n = Math.max(2, Math.round(w / 2.1));
    for (let i = 0; i <= n; i++) {
      const x = x0 + (i + (k % 2 ? 0.5 : 0)) * (w / n);
      if (x < x0 + 0.35 || x > x1 - 0.35 || inside(x)) continue;
      b.quad([x - 0.035, ya, z], [x + 0.035, ya, z], [x + 0.035, yb, z], [x - 0.035, yb, z], colJ, PM.stone, PS);
    }
  }
}
// flat gold swag (frieze garland), local frame
function swag(b, x, y, w, z) {
  const n = 3;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const px = x - w / 2 + w * t;
    const py = y - Math.sin(t * Math.PI) * 0.14;
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, px, py, z, 1]);
    ellipsoid(b, 0.145, 0.155, 0.055, 4, 2, GOLD, PM.gold);
    b.pop();
  }
  b.quad([x - w / 2, y + 0.07, z], [x + w / 2, y + 0.07, z], [x + w / 2, y + 0.13, z], [x - w / 2, y + 0.13, z], GOLD_HI, PM.gold, PS);
}
// small stone urn (local frame, base at origin)
function urn(b, s, col) {
  const k = s || 1;
  lbox(b, 0, 0.16 * k, 0, 0.72 * k, 0.32 * k, 0.72 * k, MARBLE_SH, PM.marble, { topCol: MARBLE });
  lbox(b, 0, 0.36 * k, 0, 0.58 * k, 0.10 * k, 0.58 * k, MARBLE, PM.marble);
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0.40 * k, 0, 1]);
  lathe(b, [[0.09 * k, 0], [0.22 * k, 0.05 * k], [0.30 * k, 0.22 * k], [0.31 * k, 0.42 * k], [0.24 * k, 0.56 * k], [0.26 * k, 0.64 * k]], 8, col || MARBLE, PM.marble, { smooth: true });
  b.pop();
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1.02 * k, 0, 1]);
  ellipsoid(b, 0.30 * k, 0.16 * k, 0.30 * k, 6, 3, col || MARBLE, PM.stone);
  b.pop();
}
// gold rosette / sun disc facing +Z in the current frame
function rosette(b, r, z, rays) {
  const seg = 16;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    b.tri([0, 0, z], [Math.cos(a0) * r, Math.sin(a0) * r, z], [Math.cos(a1) * r, Math.sin(a1) * r, z], GOLD, PM.gold, PS, PS, PS);
  }
  const nr = rays || 16;
  for (let i = 0; i < nr; i++) {
    const a = (i / nr) * TAU;
    const ca = Math.cos(a), sa = Math.sin(a);
    const w = 0.055 * r;
    const r0 = r * 1.12, r1 = r * (1.9 + 0.12 * (i % 2));
    b.quad([ca * r0 - sa * w, sa * r0 + ca * w, z - 0.01], [ca * r0 + sa * w, sa * r0 - ca * w, z - 0.01],
      [ca * r1 + sa * w * 0.4, sa * r1 - ca * w * 0.4, z - 0.01], [ca * r1 - sa * w * 0.4, sa * r1 + ca * w * 0.4, z - 0.01],
      GOLD_HI, PM.gold, PS);
  }
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, z + 0.10, 1]);
  ellipsoid(b, r * 0.34, r * 0.34, r * 0.28, 8, 4, GOLD_HI, PM.gold);
  b.pop();
}

// ---------------------------------------------------------------- window kit (local frame, +z outward)
// arched window: u centre, y0 sill, w width, h total height (arch radius w/2 on top)
function archWin(b, u, y0, w, h, o) {
  const opt = o || {};
  const r = w / 2, ys = y0 + h - r;
  const zG = opt.face != null ? opt.face : 0.07;
  const seg = opt.seg || 6;
  // dark glass with a sky-reflecting top
  b.quad([u - r, y0, zG], [u + r, y0, zG], [u + r, ys, zG], [u - r, ys, zG], opt.glassLo || GLASS_D, PM.glass, PS);
  const m = 0.62;
  b.quad([u - r, ys - (ys - y0) * 0.22, zG + 0.004], [u + r, ys - (ys - y0) * 0.22, zG + 0.004], [u + r, ys, zG + 0.004], [u - r, ys, zG + 0.004], mixc(GLASS_D, GLASS_S, 0.55), PM.glass, PS);
  for (let i = 0; i < seg; i++) {
    const a0 = (Math.PI * i) / seg, a1 = (Math.PI * (i + 1)) / seg;
    b.tri([u, ys, zG + 0.004], [u + Math.cos(a0) * r, ys + Math.sin(a0) * r, zG + 0.004], [u + Math.cos(a1) * r, ys + Math.sin(a1) * r, zG + 0.004], opt.glassHi || GLASS_S, PM.glass, PS, PS, PS);
  }
  // mullions
  if (opt.mullions !== false) {
    lbox(b, u, (y0 + ys) * 0.5, zG + 0.025, 0.075, ys - y0 - 0.16, 0.05, mixc(GOLD, STONE_DEEP, 0.30), PM.gold);
    lbox(b, u, ys - (ys - y0) * 0.30, zG + 0.025, w - 0.24, 0.07, 0.05, mixc(GOLD, STONE_DEEP, 0.30), PM.gold);
    void m;
  }
  // gold frame
  const fw = opt.fw != null ? opt.fw : 0.15;
  lbox(b, u - (r + fw * 0.5), (y0 + ys) * 0.5, zG + 0.045, fw, ys - y0, 0.10, GOLD, PM.gold);
  lbox(b, u + (r + fw * 0.5), (y0 + ys) * 0.5, zG + 0.045, fw, ys - y0, 0.10, GOLD, PM.gold);
  for (let i = 0; i < seg; i++) {
    const a0 = (Math.PI * i) / seg, a1 = (Math.PI * (i + 1)) / seg;
    const r0 = r, r1 = r + fw;
    b.quad([u + Math.cos(a0) * r0, ys + Math.sin(a0) * r0, zG + 0.045], [u + Math.cos(a1) * r0, ys + Math.sin(a1) * r0, zG + 0.045],
      [u + Math.cos(a1) * r1, ys + Math.sin(a1) * r1, zG + 0.045], [u + Math.cos(a0) * r1, ys + Math.sin(a0) * r1, zG + 0.045], GOLD, PM.gold, PS);
  }
  // stone surround
  if (opt.mould !== false) {
    const mw = 0.34, md = 0.24;
    lbox(b, u - (r + fw + mw * 0.5), (y0 + ys) * 0.5, md * 0.5, mw, ys - y0, md, opt.col || MARBLE_HI, PM.stone);
    lbox(b, u + (r + fw + mw * 0.5), (y0 + ys) * 0.5, md * 0.5, mw, ys - y0, md, opt.col || MARBLE_HI, PM.stone);
    for (let i = 0; i < seg; i++) {
      const a0 = (Math.PI * i) / seg, a1 = (Math.PI * (i + 1)) / seg;
      const r0 = r + fw, r1 = r + fw + mw;
      b.quad([u + Math.cos(a0) * r0, ys + Math.sin(a0) * r0, 0.03], [u + Math.cos(a1) * r0, ys + Math.sin(a1) * r0, 0.03],
        [u + Math.cos(a1) * r1, ys + Math.sin(a1) * r1, 0.03], [u + Math.cos(a0) * r1, ys + Math.sin(a0) * r1, 0.03], opt.col || MARBLE_HI, PM.stone, PS);
    }
    // keystone
    lbox(b, u, ys + r * 0.92, 0.16, 0.54, 1.02, 0.34, MARBLE_HI, PM.stone, { topCol: MARBLE_HI });
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, u, ys + r * 0.92, 0.36, 1]);
    ellipsoid(b, 0.14, 0.20, 0.10, 5, 3, GOLD, PM.gold);
    b.pop();
    // springer blocks + impost band at the arch springing
    for (const sx of [-1, 1]) {
      lbox(b, u + sx * (r + fw + mw * 0.72), ys + 0.26, 0.20, 0.44, 0.56, 0.36, MARBLE_HI, PM.stone);
      lbox(b, u + sx * (r + fw + mw * 0.72), ys - 0.02, 0.24, 0.60, 0.14, 0.42, GOLD, PM.gold);
    }
    // outer bead ring outside the stone moulding
    for (let i = 0; i < seg; i++) {
      const a0 = (Math.PI * i) / seg, a1 = (Math.PI * (i + 1)) / seg;
      const r0 = r + fw + mw, r1 = r + fw + mw + 0.10;
      b.quad([u + Math.cos(a0) * r0, ys + Math.sin(a0) * r0, 0.05], [u + Math.cos(a1) * r0, ys + Math.sin(a1) * r0, 0.05],
        [u + Math.cos(a1) * r1, ys + Math.sin(a1) * r1, 0.05], [u + Math.cos(a0) * r1, ys + Math.sin(a0) * r1, 0.05], GOLD, PM.gold, PS);
    }
  }
  // sill + brackets
  if (opt.sill !== false) {
    lbox(b, u, y0 - 0.13, 0.16, w + 0.9, 0.26, 0.50, MARBLE, PM.stone, { topCol: MARBLE_HI });
    for (const sx of [-1, 1]) lbox(b, u + sx * (w * 0.5 + 0.30), y0 - 0.42, 0.12, 0.30, 0.34, 0.34, MARBLE_HI, PM.stone);
    if (opt.apron) lbox(b, u, y0 - 0.30, 0.10, w * 0.55, 0.22, 0.20, GOLD, PM.gold);
  }
}
// triangular window head (local frame)
function headTri(b, u, yTop, w) {
  const hw = w * 0.5 + 0.42, hh = 1.0, zz = 0.20;
  b.tri([u - hw, yTop + 0.10, zz], [u + hw, yTop + 0.10, zz], [u, yTop + 0.10 + hh, zz], mulc(MARBLE, 0.94), PM.stone, PS, PS, PS);
  const ang = Math.atan2(hh, hw);
  const len = Math.hypot(hw, hh) + 0.34;
  for (const s of [-1, 1]) {
    rotZ(b, u + (s * hw) / 2, yTop + 0.10 + hh / 2, zz + 0.04, s > 0 ? -ang : ang, () => {
      box(b, len, 0.24, 0.36, MARBLE_HI, PM.stone, { topCol: MARBLE_HI });
    });
  }
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, u, yTop + 0.10 + hh + 0.02, zz + 0.08, 1]);
  ellipsoid(b, 0.11, 0.16, 0.09, 5, 3, GOLD, PM.gold);
  b.pop();
}
// segmental (curved) window head
function headSeg(b, u, yTop, w) {
  const r = w * 0.62, zz = 0.20, seg = 7;
  for (let i = 0; i < seg; i++) {
    const a0 = Math.PI * (0.18 + 0.64 * (i / seg)), a1 = Math.PI * (0.18 + 0.64 * ((i + 1) / seg));
    const p0 = [u - Math.cos(a0) * r, yTop + Math.sin(a0) * r * 0.34, zz];
    const p1 = [u - Math.cos(a1) * r, yTop + Math.sin(a1) * r * 0.34, zz];
    b.quad([p0[0], p0[1], p0[2]], [p1[0], p1[1], p1[2]], [p1[0], p1[1] + 0.24, p1[2] + 0.02], [p0[0], p0[1] + 0.24, p0[2] + 0.02], MARBLE_HI, PM.stone, PS);
  }
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, u, yTop + 0.42, zz + 0.06, 1]);
  ellipsoid(b, 0.10, 0.13, 0.08, 5, 3, GOLD, PM.gold);
  b.pop();
}
// window balcony: slab + small stone balustrade (local frame)
function balcony(b, u, y, w) {
  lbox(b, u, y - 0.16, 0.34, w + 1.0, 0.24, 0.86, MARBLE, PM.stone, { topCol: MARBLE_HI });
  lbox(b, u, y - 0.44, 0.18, w + 0.5, 0.30, 0.44, MARBLE_SH, PM.stone);
  pAt(b, u, y + 0.0, 0.74, 0, () => balustrade(b, w + 0.9, 0.86, MARBLE));
  for (const s of [-1, 1]) {
    lbox(b, u + s * (w * 0.5 + 0.45), y + 0.22, 0.60, 0.34, 0.62, 0.44, MARBLE_HI, PM.stone);
  }
}
// engaged pilaster
// small acroterion figure, local frame, base at the origin, facing local -Z
function statueL(b, s, col) {
  const k = s;
  const c0 = col || mixc(MARBLE, C.cloudLit, 0.34);
  lbox(b, 0, 0.22 * k, 0, 1.0 * k, 0.44 * k, 1.0 * k, MARBLE, PM.stone, { topCol: MARBLE_HI });
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0.44 * k, 0, 1]);
  cylinder(b, 7, 0.33 * k, 0.21 * k, 1.22 * k, c0, PM.stone, { y0: 0, caps: false });
  b.pop();
  lbox(b, 0, 1.98 * k, 0, 0.48 * k, 0.74 * k, 0.34 * k, c0, PM.stone, { topCol: mulc(c0, 1.04) });
  lbox(b, 0, 2.52 * k, 0, 0.30 * k, 0.32 * k, 0.30 * k, c0, PM.stone, { topCol: mulc(c0, 1.06) });
  lbox(b, 0.33 * k, 2.18 * k, 0, 0.14 * k, 0.66 * k, 0.14 * k, c0, PM.stone);
  b.quad([-0.10 * k, 1.76 * k, -0.18 * k], [-0.10 * k, 2.34 * k, -0.18 * k], [-0.64 * k, 2.74 * k, -0.18 * k], [-0.52 * k, 1.86 * k, -0.18 * k], mulc(c0, 0.95), PM.stone, NS);
  b.quad([0.12 * k, 1.80 * k, -0.18 * k], [0.12 * k, 2.30 * k, -0.18 * k], [0.70 * k, 2.66 * k, -0.18 * k], [0.58 * k, 1.90 * k, -0.18 * k], mulc(c0, 0.97), PM.stone, NS);
}
// engaged giant column on a facade (uses the palace stone materials, so it stays pale back-lit)
function engagedCol(b, u, yBase, h, r) {
  lbox(b, u, yBase + 0.45, 0.22, r * 2.7, 0.9, 1.0, MARBLE, PM.stone, { topCol: MARBLE_HI });
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, u, yBase + 0.9, 0.34, 1]);
  cylinder(b, 10, r, r * 0.86, h - 1.6, MARBLE_HI, PM.stone, { y0: 0, caps: false });
  b.pop();
  lbox(b, u, yBase + h - 0.75, 0.30, r * 2.4, 0.62, 0.98, MARBLE_HI, PM.stone, { topCol: MARBLE_HI });
  lbox(b, u, yBase + h - 0.24, 0.32, r * 2.8, 0.34, 1.06, MARBLE, PM.stone);
  lbox(b, u, yBase + h - 1.08, 0.36, r * 2.2, 0.14, 1.02, GOLD, PM.gold);
}
function pilaster(b, u, y0, y1, w, d, col) {
  const h = y1 - y0;
  lbox(b, u, (y0 + y1) * 0.5, d * 0.5, w, h, d, col || MARBLE, PM.stone, { topCol: mulc(col || MARBLE, 1.03) });
  lbox(b, u, y0 + 0.24, d * 0.5 + 0.05, w * 1.34, 0.48, d + 0.12, MARBLE_HI, PM.stone);
  lbox(b, u, y1 - 0.34, d * 0.5 + 0.06, w * 1.42, 0.66, d + 0.14, MARBLE_HI, PM.stone);
  lbox(b, u, y1 - 0.72, d * 0.5 + 0.10, w * 0.44, 0.10, d + 0.10, GOLD, PM.gold);
}
// quoins on a facade corner (local frame; side = -1 left / +1 right)
function quoins(b, u, y0, y1, side, z) {
  const n = Math.max(3, Math.round((y1 - y0) / 1.55));
  for (let k = 0; k < n; k++) {
    const y = y0 + ((k + 0.5) / n) * (y1 - y0);
    const wq = k % 2 === 0 ? 1.15 : 0.78;
    lbox(b, u + side * wq * 0.5, y, z + 0.14, wq, (y1 - y0) / n - 0.12, 0.28, k % 2 ? MARBLE : MARBLE_HI, PM.stone);
  }
}

// ================================================================ 1. PODIUM
function buildPodium(b, rng) {
  const HX = P.podium.hx, Z0 = P.podium.z0, Z1 = P.podium.z1;
  const IN = 0.34;                  // facade skin inset
  const TOP = DECK - 0.02;
  // ---- round 5: the podium is no longer one solid block. Its front half is hollowed
  // out for the palace's ground-floor entrance hall (src/palace-base.js, contract in
  // palace-plan.js PAL.base). The mass is rebuilt as blocks around that void, so the
  // exterior silhouette is unchanged and the city-facing front wall gets a real opening
  // lined up with the carriage arch in the belvedere support wall.
  const B = P.base.hall;
  const VX = B.x1, VZ0 = B.z0, VZ1 = B.z1, VY = B.ceilY;
  const OW = B.entry.hx, OH = B.entry.yTop, FR = B.entry.t;
  const XO = HX - IN;               // 52.66 outer half-width
  const YC = TOP / 2, ZC = (Z0 + Z1 - IN) / 2, ZD = Z1 - Z0 - IN;
  const TOPCOL = { topCol: mulc(STONE, 1.04), bottomCol: STONE_DEEP };
  // ---- round 8: the back half of the podium is hollowed out for the palace's rear
  // suite (src/palace-chambers.js). The mass is rebuilt as blocks around that void
  // so the exterior silhouette does not change and the stone stays thick:
  //   void      x +-41, z 122.4..174, y 0..24   (CHAMBER_METRICS.void)
  //   remainder >= 11 m of stone to the x facades, >= 8 m to the rear facade z=182,
  //             >= 5.9 m of roof above the highest vault (crown 22.0).
  const CHX = 41.0, CHZ1 = 174.0, CHY = 24.0;
  // side masses outside the hall void (front half, z 96..122.4)
  for (const s of [-1, 1]) {
    pBox(b, s * (VX + XO) * 0.5, YC, (Z0 + VZ1) * 0.5, XO - VX, TOP, VZ1 - Z0, STONE, PM.stone, TOPCOL);
    // rear half: the chambers reach to |x| = 41, so this block is thinner
    pBox(b, s * (CHX + XO) * 0.5, YC, (VZ1 + Z1 - IN) * 0.5, XO - CHX, TOP, Z1 - IN - VZ1, STONE, PM.stone, TOPCOL);
  }
  // back mass behind the suite (z 174..181.66)
  pBox(b, 0, YC, (CHZ1 + Z1 - IN) * 0.5, CHX * 2, TOP, Z1 - IN - CHZ1, STONE, PM.stone, TOPCOL);
  // roof slab over the hall (hidden under the terrace deck / palace floor)
  pBox(b, 0, (VY + TOP) * 0.5, (Z0 + VZ1) * 0.5, VX * 2, TOP - VY, VZ1 - Z0, STONE, PM.stone, TOPCOL);
  // roof slab over the suite (6 m of stone over the vaults, 5.9 m over the stair crown)
  pBox(b, 0, (CHY + TOP) * 0.5, (VZ1 + CHZ1) * 0.5, CHX * 2, TOP - CHY, CHZ1 - VZ1, STONE, PM.stone, TOPCOL);
  // front wall at z = 96..96.4, with the arched entrance opening left empty
  for (const s of [-1, 1]) {
    pBox(b, s * (OW + VX) * 0.5, VY * 0.5, Z0 + FR * 0.5, VX - OW, VY, FR, STONE, PM.stone, { topCol: STONE_HI });
  }
  pBox(b, 0, (OH + VY) * 0.5, Z0 + FR * 0.5, OW * 2, VY - OH, FR, STONE, PM.stone, { topCol: STONE_HI });
  for (const s of [-1, 1]) {
    const yaw = s > 0 ? -D90 : D90;
    pAt(b, s * HX, 0, (Z0 + Z1) * 0.5, yaw, () => podiumSide(b, s, Z1 - Z0, rng));
  }
  // back elevation (z = 182, facing +Z)
  pAt(b, 0, 0, Z1, 0, () => podiumBack(b, HX * 2 - IN * 2, rng));
  // corner quoins
  for (const sx of [-1, 1]) {
    for (const z of [Z0 + 0.6, Z1 - 0.6]) {
      for (let k = 0; k < 6; k++) {
        const wq = k % 2 ? 0.9 : 1.4;
        lbox(b, sx * (HX - 0.14), 1.2 + k * 1.5, z, 0.28, 1.36, wq, k % 2 ? STONE_SH : STONE_HI, PM.stone);
      }
    }
  }
}
// one podium side elevation; local X along z, local +Z outward, origin at the face centre
function podiumSide(b, s, L, rng) {
  const hx = L / 2;
  // rusticated base 0..8.4
  rusticated(b, -hx, hx, 0, 8.4, 5, 0.03, STONE, STONE_SH);
  lbox(b, 0, 8.6, 0.12, L, 0.44, 0.5, MARBLE, PM.stone, { topCol: MARBLE_HI });    // base moulding
  // blind arcade 9.4..24.3
  const Y0 = 9.4, Y1 = 24.3;
  const nB = Math.max(8, Math.round(L / 3.9));
  const pitch = L / nB;
  // continuous spandrel strips
  b.quad([-hx, 8.8, 0.02], [hx, 8.8, 0.02], [hx, Y0, 0.02], [-hx, Y0, 0.02], STONE, PM.stone, PS);
  b.quad([-hx, Y1, 0.02], [hx, Y1, 0.02], [hx, 26.4, 0.02], [-hx, 26.4, 0.02], STONE, PM.stone, PS);
  for (let i = 0; i < nB; i++) {
    const xc = -hx + (i + 0.5) * pitch;
    const aw = Math.min(1.08, pitch * 0.28);
    const sill = Y0 + 0.55, spring = 15.9, apex = spring + aw;
    // recessed glass + arch
    const dz = -0.34;
    b.quad([xc - aw, sill, dz], [xc + aw, sill, dz], [xc + aw, spring, dz], [xc - aw, spring, dz], GLASS_D, PM.glass, PS);
    for (let k = 0; k < 5; k++) {
      const a0 = Math.PI * (k / 5), a1 = Math.PI * ((k + 1) / 5);
      b.tri([xc, spring, dz], [xc + Math.cos(a0) * aw, spring + Math.sin(a0) * aw, dz], [xc + Math.cos(a1) * aw, spring + Math.sin(a1) * aw, dz], GLASS_S, PM.glass, PS, PS, PS);
    }
    // reveal
    for (const sx of [-1, 1]) {
      b.quad([xc + sx * aw, sill, 0.02], [xc + sx * aw, sill, dz], [xc + sx * aw, spring, dz], [xc + sx * aw, spring, 0.02], STONE_SH, PM.stone, [-sx, 0, 0]);
    }
    for (let k = 0; k < 5; k++) {
      const a0 = Math.PI * (k / 5), a1 = Math.PI * ((k + 1) / 5);
      const am = (a0 + a1) * 0.5;
      const p0 = [xc + Math.cos(a0) * aw, spring + Math.sin(a0) * aw];
      const p1 = [xc + Math.cos(a1) * aw, spring + Math.sin(a1) * aw];
      b.quad([p0[0], p0[1], 0.02], [p0[0], p0[1], dz], [p1[0], p1[1], dz], [p1[0], p1[1], 0.02], STONE_SH, PM.stone, [Math.cos(am), Math.sin(am), 0]);
    }
    // spandrel above the arch up to the arcade top
    for (let k = 0; k < 5; k++) {
      const a0 = Math.PI * (k / 5), a1 = Math.PI * ((k + 1) / 5);
      const p0 = [xc + Math.cos(a0) * aw, spring + Math.sin(a0) * aw];
      const p1 = [xc + Math.cos(a1) * aw, spring + Math.sin(a1) * aw];
      b.quad([p0[0], p0[1], 0.02], [p1[0], p1[1], 0.02], [p1[0], Y1, 0.02], [p0[0], Y1, 0.02], STONE, PM.stone, PS);
    }
    // pierced side panels between niche and pilasters
    for (const sx of [-1, 1]) {
      const xa = xc + sx * aw, xb = xc + sx * (pitch * 0.5);
      b.quad([xa, sill, 0.02], [xb, sill, 0.02], [xb, Y1, 0.02], [xa, Y1, 0.02], STONE, PM.stone, PS);
    }
    // gold frame on the face
    for (const sx of [-1, 1]) {
      b.quad([xc + sx * aw - 0.12, sill - 0.06, 0.05], [xc + sx * aw + 0.12, sill - 0.06, 0.05], [xc + sx * aw + 0.12, spring, 0.05], [xc + sx * aw - 0.12, spring, 0.05], GOLD, PM.gold, PS);
    }
    for (let k = 0; k < 5; k++) {
      const a0 = Math.PI * (k / 5), a1 = Math.PI * ((k + 1) / 5);
      const r0 = aw, r1 = aw + 0.20;
      b.quad([xc + Math.cos(a0) * r0, spring + Math.sin(a0) * r0, 0.05], [xc + Math.cos(a1) * r0, spring + Math.sin(a1) * r0, 0.05],
        [xc + Math.cos(a1) * r1, spring + Math.sin(a1) * r1, 0.05], [xc + Math.cos(a0) * r1, spring + Math.sin(a0) * r1, 0.05], GOLD, PM.gold, PS);
    }
    lbox(b, xc, apex + 0.34, 0.12, 0.42, 0.78, 0.24, MARBLE_HI, PM.stone);
    // stone arch moulding around the niche + gold patera above it
    for (let k = 0; k < 5; k++) {
      const a0 = Math.PI * (k / 5), a1 = Math.PI * ((k + 1) / 5);
      const r0 = aw + 0.20, r1 = aw + 0.52;
      b.quad([xc + Math.cos(a0) * r0, spring + Math.sin(a0) * r0, 0.04], [xc + Math.cos(a1) * r0, spring + Math.sin(a1) * r0, 0.04],
        [xc + Math.cos(a1) * r1, spring + Math.sin(a1) * r1, 0.04], [xc + Math.cos(a0) * r1, spring + Math.sin(a0) * r1, 0.04], MARBLE_HI, PM.stone, PS);
    }
    for (const sx of [-1, 1]) {
      b.quad([xc + sx * aw, spring, 0.06], [xc + sx * (aw + 0.52), spring, 0.06], [xc + sx * (aw + 0.52), spring - 0.34, 0.06], [xc + sx * aw, spring - 0.34, 0.06], MARBLE_HI, PM.stone, PS);
      lbox(b, xc + sx * (aw + 0.30), sill - 0.26, 0.10, 0.34, 0.26, 0.24, MARBLE, PM.stone);
    }
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, xc, apex + 1.30, 0.10, 1]);
    ellipsoid(b, 0.19, 0.24, 0.08, 5, 3, GOLD, PM.gold);
    b.pop();
    // pier / pilaster at the bay boundary
    const xp = -hx + i * pitch;
    if (xp > -hx + 0.3) {
      lbox(b, xp, (Y0 + Y1) * 0.5, 0.16, 0.86, Y1 - Y0, 0.30, MARBLE, PM.stone, { topCol: MARBLE_HI });
      lbox(b, xp, Y1 - 0.34, 0.22, 1.02, 0.34, 0.40, MARBLE_HI, PM.stone);
      lbox(b, xp, Y0 + 0.26, 0.22, 1.02, 0.34, 0.38, MARBLE_HI, PM.stone);
      b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, xp, Y1 - 0.68, 0.34, 1]);
      ellipsoid(b, 0.14, 0.14, 0.07, 5, 3, GOLD, PM.gold);
      b.pop();
    }
  }
  // cornice 26.4..28.6 (local frame of this facade)
  pAt(b, 0, 0, 0, 0, () => cornice(b, L + 0.3, 26.2, 0.85, MARBLE, true));
  // parapet 28.6..30.65
  lbox(b, 0, 29.0, 0.24, L, 0.86, 0.62, STONE, PM.stone, { topCol: STONE_HI });
  pAt(b, 0, 29.38, 0.28, 0, () => balustrade(b, L - 0.6, 1.16, MARBLE));
  lbox(b, 0, 30.62, 0.22, L, 0.24, 0.78, MARBLE_HI, PM.stone, { topCol: MARBLE_HI });
  // urns
  for (const zz of [-0.407, -0.314, 0.314, 0.407]) {
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, zz * L, 30.74, 0.24, 1]);
    urn(b, 1.15, MARBLE);
    b.pop();
  }
  void rng;
}
function podiumBack(b, L, rng) {
  const hx = L / 2;
  rusticated(b, -hx, hx, 0, 8.4, 5, 0.03, STONE, STONE_SH);
  lbox(b, 0, 8.6, 0.12, L, 0.44, 0.5, MARBLE, PM.stone, { topCol: MARBLE_HI });
  const Y0 = 9.4, Y1 = 24.3;
  b.quad([-hx, 8.8, 0.02], [hx, 8.8, 0.02], [hx, Y0, 0.02], [-hx, Y0, 0.02], STONE, PM.stone, PS);
  b.quad([-hx, Y1, 0.02], [hx, Y1, 0.02], [hx, 26.4, 0.02], [-hx, 26.4, 0.02], STONE, PM.stone, PS);
  const nB = Math.max(8, Math.round(L / 3.9));
  const pitch = L / nB;
  for (let i = 0; i < nB; i++) {
    const xc = -hx + (i + 0.5) * pitch;
    const aw = Math.min(1.05, pitch * 0.28);
    const sill = Y0 + 0.55, spring = 15.9, apex = spring + aw;
    const dz = -0.34;
    b.quad([xc - aw, sill, dz], [xc + aw, sill, dz], [xc + aw, spring, dz], [xc - aw, spring, dz], GLASS_D, PM.glass, PS);
    for (let k = 0; k < 5; k++) {
      const a0 = Math.PI * (k / 5), a1 = Math.PI * ((k + 1) / 5);
      b.tri([xc, spring, dz], [xc + Math.cos(a0) * aw, spring + Math.sin(a0) * aw, dz], [xc + Math.cos(a1) * aw, spring + Math.sin(a1) * aw, dz], GLASS_S, PM.glass, PS, PS, PS);
      const am = (a0 + a1) * 0.5;
      b.quad([xc + Math.cos(a0) * aw, spring + Math.sin(a0) * aw, 0.02], [xc + Math.cos(a0) * aw, spring + Math.sin(a0) * aw, dz],
        [xc + Math.cos(a1) * aw, spring + Math.sin(a1) * aw, dz], [xc + Math.cos(a1) * aw, spring + Math.sin(a1) * aw, 0.02], STONE_SH, PM.stone, [Math.cos(am), Math.sin(am), 0]);
      b.quad([xc + Math.cos(a0) * aw, spring + Math.sin(a0) * aw, 0.02], [xc + Math.cos(a1) * aw, spring + Math.sin(a1) * aw, 0.02],
        [xc + Math.cos(a1) * aw, Y1, 0.02], [xc + Math.cos(a0) * aw, Y1, 0.02], STONE, PM.stone, PS);
    }
    for (const sx of [-1, 1]) {
      b.quad([xc + sx * aw, sill, 0.02], [xc + sx * aw, sill, dz], [xc + sx * aw, spring, dz], [xc + sx * aw, spring, 0.02], STONE_SH, PM.stone, [-sx, 0, 0]);
      const xa = xc + sx * aw, xb = xc + sx * (pitch * 0.5);
      b.quad([xa, sill, 0.02], [xb, sill, 0.02], [xb, Y1, 0.02], [xa, Y1, 0.02], STONE, PM.stone, PS);
    }
    lbox(b, xc, apex + 0.30, 0.12, 0.40, 0.72, 0.24, MARBLE_HI, PM.stone);
    const xp = -hx + i * pitch;
    if (xp > -hx + 0.3) lbox(b, xp, (Y0 + Y1) * 0.5, 0.14, 0.78, Y1 - Y0, 0.26, MARBLE, PM.stone);
  }
  pAt(b, 0, 0, 0, 0, () => cornice(b, L + 0.3, 26.2, 0.85, MARBLE, true));
  lbox(b, 0, 29.0, 0.24, L, 0.86, 0.62, STONE, PM.stone, { topCol: STONE_HI });
  pAt(b, 0, 29.38, 0.28, 0, () => balustrade(b, L - 0.6, 1.16, MARBLE));
  lbox(b, 0, 30.62, 0.22, L, 0.24, 0.78, MARBLE_HI, PM.stone, { topCol: MARBLE_HI });
  for (const xx of [-0.36, -0.12, 0.12, 0.36]) {
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, xx * L, 30.74, 0.24, 1]);
    urn(b, 1.15, MARBLE);
    b.pop();
  }
  void rng;
}


// ================================================================ 2. CORE
function rectRay(a, hx, z0, z1, cx, cz) {
  const dx = Math.cos(a), dz = Math.sin(a);
  let t = 1e9;
  if (dx > 1e-6) t = Math.min(t, (hx - cx) / dx);
  else if (dx < -1e-6) t = Math.min(t, (-hx - cx) / dx);
  if (dz > 1e-6) t = Math.min(t, (z1 - cz) / dz);
  else if (dz < -1e-6) t = Math.min(t, (z0 - cz) / dz);
  return [cx + dx * t, cz + dz * t];
}
function buildCore(b, rng) {
  const hx = CORE.hx, z0 = CORE.z0, z1 = CORE.z1;
  const HT = CORE.cornice, AT = CORE.attic;
  // ---- front wall, rectangular tunnel mouth behind a thin arched reveal
  for (const s of [-1, 1]) {
    pBox(b, s * (POR.hx + (hx - POR.hx) * 0.5), (DECK + HT) * 0.5, 125.5, hx - POR.hx, HT - DECK, 3, STONE, PM.stone, { topCol: STONE_HI });
  }
  pBox(b, 0, (48.1 + HT) * 0.5, 125.5, POR.hx * 2, HT - 48.1, 3, STONE, PM.stone);
  // ---- walls around the rotunda (the hall void stays open)
  for (const s of [-1, 1]) pBox(b, s * 19, (DECK + HT) * 0.5, (127 + z1) * 0.5, 2, HT - DECK, z1 - 127, STONE, PM.stone);
  pBox(b, 0, (DECK + HT) * 0.5, z1 - 1, hx * 2, HT - DECK, 2, STONE, PM.stone);
  // ---- front facade
  pAt(b, 0, 0, FZ, Math.PI, () => coreFront(b, rng));
  // ---- side + back elevations
  for (const s of [-1, 1]) {
    pAt(b, s * hx, 0, (158 + z1) * 0.5, s > 0 ? -D90 : D90, () => coreSide(b, (z1 - 158) * 0.5, rng));
  }
  pAt(b, 0, 0, z1, 0, () => coreBack(b, hx, rng));
  // ---- attic storey ring
  pBox(b, 0, (52.3 + AT) * 0.5, 124.6, hx * 2, AT - 52.3, 1.2, STONE, PM.stone, { topCol: STONE_HI });
  pBox(b, 0, (52.3 + AT) * 0.5, z1 - 0.6, hx * 2, AT - 52.3, 1.2, STONE, PM.stone, { topCol: STONE_HI });
  for (const s of [-1, 1]) pBox(b, s * 19.4, (52.3 + AT) * 0.5, (125.2 + z1 - 1.2) * 0.5, 1.2, AT - 52.3, z1 - 1.2 - 125.2, STONE, PM.stone, { topCol: STONE_HI });
  // attic parapet + urns along the sides
  for (const s of [-1, 1]) {
    pAt(b, s * 19.4, 0, (125.2 + z1 - 1.2) * 0.5, s > 0 ? -D90 : D90, () => {
      pAt(b, 0, AT - 0.02, 0.2, 0, () => balustrade(b, z1 - 125.2 - 2.2, 1.0, MARBLE));
      pAt(b, 0, AT + 0.04, 0.2, 0, () => {
        for (const f of [-0.34, -0.12, 0.12, 0.34]) {
          b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, f * (z1 - 126), 0, 0, 1]);
          urn(b, 1.05, MARBLE);
          b.pop();
        }
      });
    });
  }
  // ---- low slate roof around the drum
  const cx = 0, cz = HALL.cz, yOut = 52.42, yIn = 54.38;
  const rx = 18.75, rz0 = 125.25, rz1 = z1 - 1.25, rIn = 17.2;
  const NRAY = 48;
  const rr = (a) => rectRay(a, rx, rz0, rz1, cx, cz);
  for (let i = 0; i < NRAY; i++) {
    const a0 = (i / NRAY) * TAU, a1 = ((i + 1) / NRAY) * TAU;
    const o0 = rr(a0), o1 = rr(a1);
    const i0 = [cx + Math.cos(a0) * rIn, cz + Math.sin(a0) * rIn];
    const i1 = [cx + Math.cos(a1) * rIn, cz + Math.sin(a1) * rIn];
    const cc = mulc(SLATE, 0.86 + (0.2 * ((i * 7) % 5)) / 4);
    b.quad([o0[0], yOut, o0[1]], [o1[0], yOut, o1[1]], [i1[0], yIn, i1[1]], [i0[0], yIn, i0[1]], cc, PM.slate, [0, 1, 0]);
  }
  pAt(b, 0, 0, cz, 0, () => ringY(b, rIn - 0.05, 16.62, yIn, NRAY, SLATE_LO, PM.slate, true));
  for (const sx of [-1, 1]) {
    for (const sz of [rz0, rz1]) {
      const o = [sx * rx, yOut, sz];
      const d = [o[0] - cx, o[2] - cz];
      const l = Math.hypot(d[0], d[1]) || 1;
      const inn = [cx + (d[0] / l) * rIn, yIn, cz + (d[1] / l) * rIn];
      b.quad([o[0] - 0.14, o[1] + 0.02, o[2]], [o[0] + 0.14, o[1] + 0.02, o[2]], [inn[0] + 0.12, inn[1] + 0.02, inn[2]], [inn[0] - 0.12, inn[1] + 0.02, inn[2]], GOLD, PM.gold, [0, 1, 0]);
    }
  }
  // chimney stacks rising through the roof (visible from above)
  for (const sx of [-1, 1]) {
    for (const z of [166.5, 171.0]) {
      pBox(b, sx * 12.5, 54.6, z, 2.2, 5.2, 1.5, STONE, PM.stone, { topCol: STONE_HI });
      pBox(b, sx * 12.5, 57.35, z, 2.6, 0.4, 1.9, MARBLE, PM.stone);
      for (const du of [-0.6, 0.6]) {
        pAt(b, sx * 12.5 + du, 57.6, z, 0, () => cylinder(b, 6, 0.26, 0.21, 0.8, STONE_SH, PM.stone, { y0: 0, caps: true }));
      }
    }
  }
  pAt(b, 0, 0, FZ, Math.PI, () => crestTiles(b));
  void rng;
}
function crestTiles(b) {
  for (let i = 0; i < 30; i++) {
    const u = -19 + (i / 29) * 38;
    b.quad([u - 0.22, 52.34, 0.2], [u + 0.22, 52.34, 0.2], [u + 0.22, 52.58, 0.24], [u - 0.22, 52.58, 0.24], mixc(GOLD, MARBLE, 0.35), PM.gold, PS);
  }
}
function coreFront(b, rng) {
  const hx = CORE.hx, HB = CORE.baseTop, HT = CORE.cornice, AT = CORE.attic;
  const BAY = [6.525, 10.375, 14.225, 18.075];
  const PIL = [4.6, 8.45, 12.3, 16.15];
  const skip = [[-POR.hx, POR.hx], [12.3, 15.5], [-15.5, -12.3]];
  rusticated(b, -hx, hx, DECK, HB, 6, 0.03, STONE, STONE_SH, skip);
  for (const sx of [-1, 1]) {
    archWin(b, sx * BAY[0], 31.1, 2.05, 5.6, { seg: 5 });
    archWin(b, sx * BAY[1], 31.1, 2.05, 5.6, { seg: 5 });
    archWin(b, sx * BAY[3], 31.1, 2.05, 5.6, { seg: 5 });
  }
  quoins(b, -hx + 0.3, 30, HB, -1, 0);
  quoins(b, hx - 0.3, 30, HB, 1, 0);
  lbox(b, 0, HB + 0.18, 0.14, hx * 2, 0.36, 0.44, MARBLE, PM.stone, { topCol: MARBLE_HI });
  // main storey
  for (const sx of [-1, 1]) {
    for (const u of PIL) pilaster(b, sx * u, HB + 0.4, 49.4, 0.95, 0.42, MARBLE);
    pilaster(b, sx * 19.72, HB + 0.4, 49.4, 0.72, 0.34, MARBLE);
    for (let i = 0; i < 4; i++) {
      const u = sx * BAY[i];
      archWin(b, u, 39.5, 2.6, 8.8, { seg: 6 });
      if (i % 2 === 0) headTri(b, u, 48.42, 2.6);
      else headSeg(b, u, 48.42, 2.6);
      balcony(b, u, 39.34, 2.6);
    }
  }
  // entablature
  lbox(b, 0, 49.85, 0.22, hx * 2, 0.70, 0.44, MARBLE, PM.stone, { topCol: MARBLE_HI });
  lbox(b, 0, 50.34, 0.26, hx * 2 + 0.1, 0.30, 0.52, MARBLE_HI, PM.stone);
  lbox(b, 0, 50.88, 0.12, hx * 2 - 0.3, 0.78, 0.24, STONE, PM.stone);
  for (let i = 0; i < 12; i++) {
    const u = -18.3 + (i + 0.5) * 3.05;
    if (i % 2 === 0) swag(b, u, 50.98, 2.35, 0.26);
    else lbox(b, u, 50.88, 0.20, 1.9, 0.62, 0.18, STONE_HI, PM.stone);
  }
  pAt(b, 0, 0, 0, 0, () => cornice(b, hx * 2 + 0.2, 51.18, 1.0, MARBLE, true));
  // modillions under the main cornice + paterae on the attic
  for (let i = 0; i < 40; i++) {
    const u = -19.3 + i * 0.99;
    lbox(b, u, 51.02, 0.42, 0.30, 0.42, 0.86, MARBLE_HI, PM.stone);
  }
  for (const sx of [-1, 1]) {
    for (const u of [8.1, 17.6]) {
      b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, sx * u, 53.35, 0.20, 1]);
      ellipsoid(b, 0.24, 0.24, 0.09, 6, 3, GOLD, PM.gold);
      b.pop();
    }
  }
  // attic
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const u = sx * BAY[i];
      lbox(b, u, 53.35, 0.10, 0.92, 1.40, 0.14, GLASS_D, PM.glass);
      lbox(b, u - 0.53, 53.35, 0.14, 0.14, 1.62, 0.20, MARBLE_HI, PM.stone);
      lbox(b, u + 0.53, 53.35, 0.14, 0.14, 1.62, 0.20, MARBLE_HI, PM.stone);
      lbox(b, u, 54.10, 0.14, 1.20, 0.14, 0.22, MARBLE, PM.stone);
    }
  }
  // parapet + 14 statues / urns
  lbox(b, 0, 54.42, 0.10, hx * 2, 0.26, 0.86, MARBLE, PM.stone, { topCol: MARBLE_HI });
  pAt(b, 0, 54.52, 0.28, 0, () => balustrade(b, hx * 2 - 1.4, 1.04, MARBLE));
  lbox(b, 0, 55.58, 0.24, hx * 2 - 0.8, 0.22, 0.82, MARBLE_HI, PM.stone, { topCol: MARBLE_HI });
  for (let k = 0; k < 14; k++) {
    const u = -19 + k * (38 / 13);
    lbox(b, u, 55.82, 0.24, 0.92, 0.34, 0.92, MARBLE_HI, PM.stone, { topCol: MARBLE_HI });
    if (k % 2 === 0) {
      b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, u, 55.99, 0.24, 1]);
      urn(b, 1.0, MARBLE);
      b.pop();
    } else {
      pAt(b, u, 55.99, 0.24, Math.PI, () => statueL(b, 0.82));
    }
  }
  void rng;
}
function coreSide(b, halfL, rng) {
  rusticated(b, -halfL, halfL, DECK, 40, 6, 0.03, STONE, STONE_SH);
  lbox(b, 0, 40.2, 0.12, halfL * 2, 0.40, 0.40, MARBLE, PM.stone, { topCol: MARBLE_HI });
  for (const u of [-7.4, 0, 7.4]) pilaster(b, u, 40.6, 49.4, 0.82, 0.36, MARBLE);
  for (const u of [-3.7, 3.7]) {
    archWin(b, u, 41.2, 2.3, 6.8, { seg: 5 });
    headSeg(b, u, 48.0, 2.3);
  }
  pAt(b, 0, 0, 0, 0, () => cornice(b, halfL * 2 + 0.2, 51.18, 0.85, MARBLE, true));
  lbox(b, 0, 53.35, 0.10, halfL * 2, 2.10, 0.18, STONE, PM.stone);
  for (const u of [-6.5, -2.2, 2.2, 6.5]) lbox(b, u, 53.4, 0.16, 0.86, 1.20, 0.12, GLASS_D, PM.glass);
  void rng;
}
function coreBack(b, hx, rng) {
  rusticated(b, -hx, hx, DECK, 39, 6, 0.03, STONE, STONE_SH);
  lbox(b, 0, 39.2, 0.12, hx * 2, 0.40, 0.40, MARBLE, PM.stone, { topCol: MARBLE_HI });
  for (const u of [-15.5, -7.7, 0, 7.7, 15.5]) pilaster(b, u, 39.6, 49.4, 0.86, 0.38, MARBLE);
  for (const u of [-11.6, -3.9, 3.9, 11.6]) {
    archWin(b, u, 40.4, 2.4, 7.0, { seg: 5, mullions: false });
    headSeg(b, u, 47.4, 2.4);
  }
  pAt(b, 0, 0, 0, 0, () => cornice(b, hx * 2 + 0.2, 51.18, 0.9, MARBLE, true));
  lbox(b, 0, 53.35, 0.10, hx * 2, 2.10, 0.18, STONE, PM.stone);
  for (const u of [-14, -7, 0, 7, 14]) lbox(b, u, 53.4, 0.16, 1.0, 1.25, 0.12, GLASS_D, PM.glass);
  for (const u of [-17.2, -10.5, 10.5, 17.2]) {
    lbox(b, u, 53.35, 0.16, 2.4, 1.9, 0.10, STONE_SH, PM.stone);
    lbox(b, u, 53.35, 0.22, 2.7, 0.16, 0.18, MARBLE, PM.stone);
  }
  pAt(b, 0, 54.48, 0.2, 0, () => balustrade(b, hx * 2 - 1.6, 1.0, MARBLE));
  for (const u of [-16.5, -5.5, 5.5, 16.5]) {
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, u, 55.6, 0.22, 1]);
    urn(b, 1.0, MARBLE);
    b.pop();
  }
  crestTiles(b);
  void rng;
}

// ================================================================ 3. PORTAL
function buildPortal(b) {
  const hx = POR.hx, sy = POR.springY, apex = sy + hx;
  const zf = 123.86, zb = 124.10;
  const SEG = 10;
  for (let i = 0; i < SEG; i++) {
    const a0 = (Math.PI * i) / SEG, a1 = (Math.PI * (i + 1)) / SEG;
    const x0 = Math.cos(a0) * hx, y0 = sy + Math.sin(a0) * hx;
    const x1 = Math.cos(a1) * hx, y1 = sy + Math.sin(a1) * hx;
    b.quad([x0, y0, zf], [x1, y1, zf], [x1, apex, zf], [x0, apex, zf], STONE, PM.stone, NS);
    b.quad([x1, y1, zb], [x0, y0, zb], [x0, apex, zb], [x1, apex, zb], STONE_SH, PM.stone, PS);
    const am = (a0 + a1) * 0.5;
    b.quad([x0, y0, zf], [x0, y0, zb], [x1, y1, zb], [x1, y1, zf], STONE_SH, PM.stone, [-Math.cos(am), -Math.sin(am), 0]);
  }
  // tunnel: side walls + flat soffit, the passage itself stays clear
  for (const s of [-1, 1]) {
    lbox(b, s * 4.9, (DECK + 48.1) * 0.5, 127.0, 0.6, 18.1, 6.0, STONE, PM.stone);
    b.quad([s * 4.585, DECK + 0.02, 124.2], [s * 4.585, DECK + 0.02, 129.7], [s * 4.585, 32.2, 129.7], [s * 4.585, 32.2, 124.2], MARBLE_SH, PM.stone, [-s, 0, 0]);
    b.quad([s * 4.55, 32.4, 124.1], [s * 4.55, 32.4, 129.6], [s * 4.55, 33.0, 129.6], [s * 4.55, 33.0, 124.1], MARBLE, PM.stone, [-s, 0, 0]);
    // marble reveal at the hall mouth
    lbox(b, s * 4.78, (DECK + 43.5) * 0.5, 129.86, 0.72, 13.5, 0.30, MARBLE, PM.stone, { topCol: MARBLE_HI });
  }
  // barrel-vaulted tunnel. The profile is faceted on purpose: every vertex must stay
  // outside the walk-through clearance volumes (a dense semicircle would poke into them
  // at the arch shoulders, where the vault is necessarily below y=46).
  const vDeg = [0, 30, 65, 80, 90];
  const prof = vDeg.map((d) => {
    const a = (d * Math.PI) / 180;
    return [Math.cos(a) * hx, sy + Math.sin(a) * hx];
  });
  const zA = 124.02, zB = 130.0;
  for (let k = 0; k < prof.length - 1; k++) {
    const x0 = prof[k][0], y0 = prof[k][1], x1 = prof[k + 1][0], y1 = prof[k + 1][1];
    const am = (vDeg[k] + vDeg[k + 1]) * 0.5 * Math.PI / 180;
    const N = [-Math.cos(am), -Math.sin(am), 0];
    b.quad([x0, y0, zA], [x1, y1, zA], [x1, y1, zB], [x0, y0, zB], mulc(STONE, 0.96), PM.stone, N);
    b.quad([-x1, y1, zA], [-x0, y0, zA], [-x0, y0, zB], [-x1, y1, zB], mulc(STONE, 0.96), PM.stone, [Math.cos(am), -Math.sin(am), 0]);
  }
  // gilded longitudinal ribs along the vault
  const zRib = [124.02, 125.5, 127.0, 128.5, 130.0];
  for (const k of [1, 2, 3]) {
    const xr = prof[k][0], yr = prof[k][1];
    for (const sgn of [-1, 1]) {
      for (let i = 0; i < zRib.length - 1; i++) {
        const z0 = zRib[i], z1 = zRib[i + 1];
        b.quad([sgn * xr, yr - 0.01, z0], [sgn * (xr + 0.06), yr - 0.02, z0], [sgn * (xr + 0.06), yr - 0.02, z1], [sgn * xr, yr - 0.01, z1], GOLD, PM.gold, [0, -1, 0]);
      }
    }
  }
  // close the gap between the arch profile and the rectangular hole in the hall wall
  for (const s of [-1, 1]) {
    for (let k = 0; k < prof.length - 1; k++) {
      const xa = prof[k][0], ya = prof[k][1], xb = prof[k + 1][0], yb2 = prof[k + 1][1];
      b.quad([s * xa, ya, 129.70], [s * xb, yb2, 129.70], [s * xb, 48.1, 129.70], [s * xa, 48.1, 129.70], STONE_SH, PM.stone, NS);
      b.quad([s * xb, yb2, 129.92], [s * xa, ya, 129.92], [s * xa, 48.1, 129.92], [s * xb, 48.1, 129.92], STONE, PM.stone, PS);
    }
  }
  // gilded boss at the crown of the vault
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 48.06, 127.0, 1]);
  ellipsoid(b, 0.34, 0.16, 0.7, 8, 4, GOLD, PM.gold);
  b.pop();
  lbox(b, 0, 30.24, 129.86, 9.9, 0.34, 0.30, MARBLE_HI, PM.stone);
  b.quad([-4.6, 30.02, 122.9], [4.6, 30.02, 122.9], [4.6, 30.02, 129.9], [-4.6, 30.02, 129.9], FLR, PM.hallFloor, UP);
  // facade arch moulding
  const m0 = hx + 0.08, m1 = hx + 0.78;
  for (let i = 0; i < SEG; i++) {
    const a0 = (Math.PI * i) / SEG, a1 = (Math.PI * (i + 1)) / SEG;
    const q = (r, a) => [Math.cos(a) * r, sy + Math.sin(a) * r];
    const q0 = q(m0, a0), q1 = q(m1, a0), q2 = q(m1, a1), q3 = q(m0, a1);
    b.quad([q0[0], q0[1], 123.62], [q1[0], q1[1], 123.62], [q2[0], q2[1], 123.62], [q3[0], q3[1], 123.62], MARBLE, PM.stone, NS);
    b.quad([q0[0], q0[1], 123.62], [q3[0], q3[1], 123.62], [q3[0], q3[1], 123.90], [q0[0], q0[1], 123.90], MARBLE_HI, PM.stone, [Math.cos((a0 + a1) * 0.5), Math.sin((a0 + a1) * 0.5), 0]);
  }
  // voussoir joints across the arch moulding
  for (let i = 0; i <= 16; i++) {
    const a = (Math.PI * i) / 16;
    const ca = Math.cos(a), sa = Math.sin(a);
    const r0 = hx + 0.06, r1 = hx + 0.80;
    b.quad([ca * r0, sy + sa * r0, 123.60], [ca * r1, sy + sa * r1, 123.60], [ca * r1 - sa * 0.05, sy + sa * r1 + ca * 0.05, 123.60], [ca * r0 - sa * 0.05, sy + sa * r0 + ca * 0.05, 123.60], STONE_SH, PM.stone, NS);
  }
  for (const s of [-1, 1]) {
    lbox(b, s * (hx + 1.05), (DECK + 46.8) * 0.5, 123.72, 0.86, 16.8, 0.55, MARBLE, PM.stone, { topCol: MARBLE_HI });
    lbox(b, s * (hx + 1.05), 30.4, 123.70, 1.02, 0.6, 0.62, MARBLE_HI, PM.stone);
    lbox(b, s * (hx + 1.05), 46.4, 123.70, 1.06, 0.6, 0.66, MARBLE_HI, PM.stone);
    lbox(b, s * (hx + 1.05), 46.8, 123.74, 0.50, 0.16, 0.42, GOLD, PM.gold);
  }
  lbox(b, 0, apex + 0.34, 123.86, 0.78, 1.34, 0.46, MARBLE_HI, PM.stone, { topCol: MARBLE_HI });
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, apex + 0.30, 124.16, 1]);
  ellipsoid(b, 0.26, 0.34, 0.16, 6, 4, GOLD_HI, PM.gold);
  b.pop();
  lbox(b, 0, 30.05, 123.4, 9.6, 0.10, 0.7, MARBLE_HI, PM.stone, { topCol: MARBLE_HI });
}

// ================================================================ 4. SIDE DOORS
function buildSideDoors(b) {
  pAt(b, 0, 0, FZ, Math.PI, () => {
    for (const s of [-1, 1]) {
      const u = s * 13.9, w = 3.2, y0 = 30.6, y1 = 38.6;
      b.quad([u - w / 2, y0, 0.06], [u + w / 2, y0, 0.06], [u + w / 2, y1, 0.06], [u - w / 2, y1, 0.06], GLASS_D, PM.glass, PS);
      b.quad([u - w / 2, y1 - 2.2, 0.062], [u + w / 2, y1 - 2.2, 0.062], [u + w / 2, y1, 0.062], [u - w / 2, y1, 0.062], mixc(GLASS_D, GLASS_S, 0.5), PM.glass, PS);
      lbox(b, u, (y0 + y1) * 0.5, 0.11, 0.10, y1 - y0, 0.10, GOLD, PM.gold);
      lbox(b, u - w * 0.25, (y0 + y1) * 0.5, 0.10, 0.06, y1 - y0 - 0.2, 0.08, mixc(GOLD, STONE_DEEP, 0.4), PM.gold);
      lbox(b, u + w * 0.25, (y0 + y1) * 0.5, 0.10, 0.06, y1 - y0 - 0.2, 0.08, mixc(GOLD, STONE_DEEP, 0.4), PM.gold);
      for (const sx of [-1, 1]) lbox(b, u + sx * (w / 2 + 0.09), (y0 + y1) * 0.5, 0.10, 0.18, y1 - y0 + 0.3, 0.18, GOLD, PM.gold);
      lbox(b, u, y1 + 0.13, 0.10, w + 0.5, 0.26, 0.20, GOLD, PM.gold);
      for (const sx of [-1, 1]) lbox(b, u + sx * (w / 2 + 0.42), (y0 + y1) * 0.5 + 0.1, 0.14, 0.46, y1 - y0 + 0.8, 0.28, MARBLE_HI, PM.stone);
      lbox(b, u, y1 + 0.62, 0.16, w + 1.4, 0.44, 0.32, MARBLE_HI, PM.stone, { topCol: MARBLE_HI });
      lbox(b, u, 30.16, 0.18, w + 0.7, 0.22, 0.40, MARBLE, PM.stone, { topCol: MARBLE_HI });
      headTri(b, u, y1 + 0.86, w + 0.5);
    }
  });
}

// ================================================================ 5. PORTICO
function buildPortico(b, rng) {
  pAt(b, 0, 0, FZ, Math.PI, () => {
    for (const u of PORT.cols) {
      column(b, u, 5.4, DECK, PORT.h, PORT.r, mixc(MARBLE, C.cloudLit, 0.28));
      lbox(b, u, DECK + 0.14, 5.4 + PORT.r * 1.9, 2.5, 0.30, 0.9, MARBLE_HI, PM.stone, { topCol: MARBLE_HI });
    }
    lbox(b, 0, 46.5, 3.1, 36.9, 0.94, 7.0, MARBLE, PM.stone, { topCol: MARBLE_HI });
    lbox(b, 0, 47.16, 3.1, 36.7, 0.42, 6.8, MARBLE_HI, PM.stone);
    lbox(b, 0, 47.86, 3.1, 36.4, 1.0, 6.65, STONE, PM.stone);
    for (let i = 0; i < 10; i++) swag(b, -16.6 + i * 3.68, 47.9, 2.9, 6.28);
    for (let i = 0; i < 9; i++) {
      b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -14.9 + i * 3.72, 47.9, 6.30, 1]);
      ellipsoid(b, 0.17, 0.17, 0.08, 5, 3, GOLD_HI, PM.gold);
      b.pop();
    }
    pAt(b, 0, 0, 0, 0, () => cornice(b, 37.2, 48.4, 1.05, MARBLE, true));
    // coffered soffit: 5 bays x 3 panels with gilded bosses
    for (let i = 0; i < 5; i++) {
      const u0 = -18.4 + i * 7.36;
      for (let k = 0; k < 3; k++) {
        const u = u0 + (k + 0.5) * 2.45;
        const w = 2.05;
        b.quad([u - w / 2, 46.02, 1.1], [u + w / 2, 46.02, 1.1], [u + w / 2, 46.02, 4.9], [u - w / 2, 46.02, 4.9], MARBLE_SH, PM.stone, DN);
        for (const sx of [-1, 1]) b.quad([u + sx * w / 2, 46.02, 1.1], [u + sx * w / 2, 46.02, 4.9], [u + sx * w / 2, 46.36, 4.9], [u + sx * w / 2, 46.36, 1.1], MARBLE, PM.stone, [-sx, 0, 0]);
        b.quad([u - w / 2, 46.02, 1.1], [u - w / 2, 46.36, 1.1], [u + w / 2, 46.36, 1.1], [u + w / 2, 46.02, 1.1], MARBLE, PM.stone, NS);
        b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, u, 46.0, 3.0, 1]);
        ellipsoid(b, 0.26, 0.08, 0.26, 6, 2, GOLD, PM.gold);
        b.pop();
      }
    }
    // gilded medallions on the column pedestals
    for (const u of PORT.cols) {
      b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, u, 30.85, 5.4 + PORT.r * 1.45, 1]);
      ellipsoid(b, 0.26, 0.30, 0.10, 6, 4, GOLD, PM.gold);
      b.pop();
    }
    // niches with guardian statues between the portal and the side doors
    for (const s of [-1, 1]) {
      const u = s * 9.3;
      lbox(b, u, 34.2, 0.22, 1.9, 7.6, 0.5, STONE_SH, PM.stone, { topCol: STONE });
      lbox(b, u, 30.45, 0.30, 2.3, 0.9, 0.7, MARBLE, PM.stone, { topCol: MARBLE_HI });
      lbox(b, u, 38.2, 0.30, 2.3, 0.5, 0.7, MARBLE_HI, PM.stone);
      pAt(b, u, 30.9, 0.5, Math.PI, () => statueL(b, 0.72, mixc(MARBLE, C.cloudLit, 0.30)));
    }
    // pediment
    const py = 49.5, hw = PORT.pedHalfW - 0.4, ph = 5.35 - (py - 49.0);
    const pz = 5.72;
    lbox(b, 0, py + 0.16, 5.4, hw * 2 + 1.0, 0.4, 1.0, MARBLE_HI, PM.stone, { topCol: MARBLE_HI });
    lbox(b, 0, py + 0.40, 5.88, hw * 2 + 0.9, 0.10, 0.30, GOLD, PM.gold);
    b.tri([-hw, py + 0.32, pz], [hw, py + 0.32, pz], [0, py + 0.32 + ph, pz], mulc(MARBLE, 0.95), PM.stone, PS, PS, PS);
    const ang = Math.atan2(ph, hw);
    const len = Math.hypot(hw, ph) + 0.4;
    for (const s of [-1, 1]) {
      rotZ(b, (s * hw) / 2, py + 0.32 + ph / 2, pz + 0.06, s > 0 ? -ang : ang, () => {
        box(b, len, 0.30, 0.44, MARBLE_HI, PM.stone, { topCol: MARBLE_HI });
      });
    }
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, py + 0.32 + ph * 0.36, pz + 0.06, 1]);
    rosette(b, 1.18, 0, 20);
    b.pop();
    for (const s of [-1, 1]) {
      b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, s * 7.6, py + 0.32 + ph * 0.30, pz + 0.06, 1]);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        b.push([Math.cos(a), Math.sin(a), 0, 0, -Math.sin(a), Math.cos(a), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
        ellipsoid(b, 0.20, 0.12, 0.07, 4, 2, mixc(GOLD, MARBLE, 0.15), PM.gold);
        b.pop();
      }
      b.pop();
    }
    // gable roof behind the pediment
    for (const s of [-1, 1]) {
      b.quad([s * hw, py + 0.4, 5.62], [0, py + 0.4 + ph, 5.62], [0, py + 0.4 + ph, -0.3], [s * hw, py + 0.4, -0.3], mulc(SLATE, 0.98), PM.slate, [s * 0.25, 1, 0]);
    }
    pAt(b, 0, py + 0.45 + ph, 5.62, Math.PI, () => statueL(b, 1.0));
    for (const s of [-1, 1]) pAt(b, s * (hw - 0.4), py + 0.55, 5.6, Math.PI, () => statueL(b, 0.92));
    for (const u of PORT.cols) {
      for (const du of [-0.42, 0, 0.42]) {
        b.quad([u + du - 0.055, 32.4, 5.4 + PORT.r - 0.01], [u + du + 0.055, 32.4, 5.4 + PORT.r - 0.01], [u + du + 0.055, 44.4, 5.4 + PORT.r - 0.01], [u + du - 0.055, 44.4, 5.4 + PORT.r - 0.01], mixc(MARBLE, STONE_SH, 0.45), PM.stone, PS);
      }
    }
  });
  void rng;
}

// ================================================================ 6. WINGS
// round 6: a wing is no longer one solid block. The two luxury theme halls (east royal
// library / west banqueting hall, src/palace-rooms.js) are carved out of it: front wall
// (with the real arched entrance), inner wall toward the rotunda core, outer mass under
// the pavilion, back wall, floor and ceiling are rebuilt as blocks around ROOM. The
// outside silhouette, cornice, attic, mansard, dormers and chimneys are untouched.
function bxW(b, xa, xb, ya, yb, za, zb, col, mat, opts) {
  const x0 = Math.min(xa, xb), x1 = Math.max(xa, xb);
  const z0 = Math.min(za, zb), z1 = Math.max(za, zb);
  pBox(b, (x0 + x1) * 0.5, (ya + yb) * 0.5, (z0 + z1) * 0.5, x1 - x0, yb - ya, z1 - z0, col, mat, opts);
}
// wall between the semicircular arch head and the arch apex line; the arch itself stays a hole
function archSpandrel(b, dc, dh, ds, da, z0, z1) {
  const N = 12;
  for (let i = 0; i < N; i++) {
    const a0 = (Math.PI * i) / N, a1 = (Math.PI * (i + 1)) / N;
    const p0 = [dc + Math.cos(a0) * dh, ds + Math.sin(a0) * dh];
    const p1 = [dc + Math.cos(a1) * dh, ds + Math.sin(a1) * dh];
    b.quad([p0[0], p0[1], z0], [p1[0], p1[1], z0], [p1[0], da, z0], [p0[0], da, z0], STONE, PM.stone, NS);
    b.quad([p1[0], p1[1], z1], [p0[0], p0[1], z1], [p0[0], da, z1], [p1[0], da, z1], STONE_SH, PM.stone, PS);
    const am = (a0 + a1) * 0.5;
    b.quad([p0[0], p0[1], z0], [p0[0], p0[1], z1], [p1[0], p1[1], z1], [p1[0], p1[1], z0], MARBLE_SH, PM.stone, [-Math.cos(am), -Math.sin(am), 0]);
  }
}
function wingShell(b, s) {
  const Z0 = FZ, Z1 = WING.z1, COR = WING.cornice;
  const xi = s * ROOM.xIn, xo = s * ROOM.xOut;          // signed room side walls
  const zf = ROOM.zFront, zb = ROOM.zBack;
  const fy = ROOM.floorY, cy = ROOM.ceilY;
  const dc = s * ROOM.door.cx, dh = ROOM.door.hw;
  const ds = ROOM.door.springY, da = ROOM.door.apexY;
  // inner wall between the rotunda core and the hall
  bxW(b, s * WING.xInner, xi, DECK, COR, Z0, Z1, STONE, PM.stone, { topCol: STONE_HI });
  // outer mass: carries the corner pavilion and the wing's outer elevation
  bxW(b, xo, s * WING.xOuter, DECK, COR, Z0, Z1, STONE, PM.stone, { topCol: STONE_HI });
  // front wall: side panels + spandrel above the arch, the arch is a real hole.
  // the two panels are between the wing's two side walls and the two opening edges, so the
  // order has to be taken from the signed coordinates (the west wing mirrors them).
  const xa = Math.min(xi, xo), xb2 = Math.max(xi, xo);
  const d0 = Math.min(dc - dh, dc + dh), d1 = Math.max(dc - dh, dc + dh);
  bxW(b, xa, d0, DECK, COR, Z0, zf, STONE, PM.stone, { topCol: STONE_HI });
  bxW(b, d1, xb2, DECK, COR, Z0, zf, STONE, PM.stone, { topCol: STONE_HI });
  bxW(b, dc - dh, dc + dh, da, COR, Z0, zf, STONE, PM.stone, { topCol: STONE_HI });
  archSpandrel(b, dc, dh, ds, da, Z0, zf);
  // back wall + floor + ceiling (the visible room surfaces are lined by palace-rooms.js)
  bxW(b, xi, xo, DECK, COR, zb, Z1, STONE, PM.stone, { topCol: STONE_HI });
  bxW(b, xi, xo, DECK, fy, Z0, Z1, STONE, PM.stone);
  bxW(b, xi, xo, cy, COR, Z0, Z1, STONE, PM.stone, { topCol: STONE_HI });
}
function buildWing(b, s, rng) {
  const X0 = WING.xInner, X1 = WING.xOuter, Z1 = WING.z1;
  const COR = WING.cornice, ATT = WING.attic, MTOP = WING.mansardTop;
  const cx = s * (X0 + X1) * 0.5, cz = (FZ + Z1) * 0.5;
  wingShell(b, s);
  pBox(b, cx, (COR + ATT) * 0.5, cz, X1 - X0 - 1.4, ATT - COR, Z1 - FZ - 1.6, STONE, PM.stone, { topCol: STONE_HI });
  pAt(b, cx, ATT, cz, Math.PI, () => {
    mansard(b, X1 - X0 - 1.2, Z1 - FZ - 1.2, MTOP - ATT, SLATE);
    // extra dormers on the front slope
    for (const u of [-11.6, -6.3, -1.0, 4.3, 9.6]) {
      lbox(b, u, 1.45, 14.55, 1.65, 1.85, 0.85, MARBLE, PM.stone, { topCol: MARBLE_HI });
      b.tri([u - 0.86, 2.38, 14.98], [u + 0.86, 2.38, 14.98], [u, 3.12, 14.98], MARBLE_HI, PM.stone, PS, PS, PS);
      b.quad([u - 0.55, 0.85, 15.0], [u + 0.55, 0.85, 15.0], [u + 0.55, 1.95, 15.0], [u - 0.55, 1.95, 15.0], GLASS_D, PM.glass, PS);
      lbox(b, u, 3.22, 14.9, 0.16, 0.55, 0.16, GOLD, PM.stone);
    }
    // chimneys on the cresting platform
    for (const u of [-12.8, 0.4, 12.6]) {
      lbox(b, u, 6.2, 5.6, 2.1, 3.6, 1.4, STONE, PM.stone, { topCol: STONE_HI });
      lbox(b, u, 8.1, 5.6, 2.4, 0.34, 1.7, MARBLE, PM.stone);
      for (const du of [-0.55, 0.55]) {
        b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, u + du, 8.3, 5.6, 1]);
        cylinder(b, 6, 0.24, 0.20, 0.75, STONE_SH, PM.stone, { y0: 0, caps: true });
        b.pop();
      }
    }
    // gilded crest ornaments
    for (let i = 0; i < 7; i++) {
      const u = -13.2 + i * 4.4;
      lbox(b, u, 4.85, 7.4, 0.52, 0.5, 0.52, MARBLE_HI, PM.stone);
      b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, u, 5.32, 7.4, 1]);
      ellipsoid(b, 0.33, 0.42, 0.33, 6, 4, GOLD, PM.gold);
      b.pop();
    }
  });
  pAt(b, cx, 0, FZ, Math.PI, () => wingFront(b, s, rng));
  pAt(b, s * X1, 0, cz, s > 0 ? -D90 : D90, () => wingSide(b, s, (Z1 - FZ) * 0.5, rng));
  pAt(b, cx, 0, Z1, 0, () => wingBack(b, rng));
}
// round 6: the grand entrance carved into each wing front. The two central window bays
// (k=1,2) and the pilaster between them give way to a 7.6 m arched portal; the pilasters
// left at k=1 and k=3 become the archivolt's springers, so the facade rhythm survives.
function wingPortal(b, uC) {
  const D = ROOM.door, hw = D.hw, sy = D.springY, ap = D.apexY;
  // two shallow steps up to the 0.36 m hall floor (the deck outside is y = 30)
  lbox(b, uC, DECK + 0.09, 0.52, hw * 2 - 0.2, 0.18, 0.36, MARBLE, PM.stone, { topCol: MARBLE_HI });
  lbox(b, uC, DECK + 0.18, 0.17, hw * 2 - 0.2, 0.36, 0.34, MARBLE_HI, PM.stone, { topCol: MARBLE_HI });
  // marble lining of the door jambs inside the wall thickness
  for (const s of [-1, 1]) {
    lbox(b, uC + s * (hw - 0.07), (ROOM.floorY + sy) * 0.5, -0.5, 0.14, sy - ROOM.floorY, 1.0, MARBLE, PM.stone, { topCol: MARBLE_HI });
  }
  // projecting archivolt + soffit band
  const m0 = hw, m1 = hw + 0.54, SEG = 14, zF = 0.52, zW = 0.06;
  for (let i = 0; i < SEG; i++) {
    const a0 = (Math.PI * i) / SEG, a1 = (Math.PI * (i + 1)) / SEG;
    const q = (r, a) => [uC + Math.cos(a) * r, sy + Math.sin(a) * r];
    const p00 = q(m0, a0), p01 = q(m0, a1), p10 = q(m1, a1), p11 = q(m1, a0);
    const am = (a0 + a1) * 0.5, ca = Math.cos(am), sa = Math.sin(am);
    b.quad([p00[0], p00[1], zF], [p01[0], p01[1], zF], [p10[0], p10[1], zF], [p11[0], p11[1], zF], MARBLE_HI, PM.stone, PS);
    b.quad([p11[0], p11[1], zF], [p10[0], p10[1], zF], [p10[0], p10[1], zW], [p11[0], p11[1], zW], MARBLE, PM.stone, [ca, sa, 0]);
    b.quad([p00[0], p00[1], zW], [p01[0], p01[1], zW], [p01[0], p01[1], zF], [p00[0], p00[1], zF], MARBLE_SH, PM.stone, [-ca, -sa, 0]);
    // voussoir joints on the archivolt
    b.quad([p00[0], p00[1], zF + 0.012], [p11[0], p11[1], zF + 0.012], [p11[0] + ca * 0.05, p11[1] + sa * 0.05, zF + 0.012], [p00[0] + ca * 0.05, p00[1] + sa * 0.05, zF + 0.012], mixc(GOLD, STONE_DEEP, 0.4), PM.gold, PS);
  }
  // impost blocks at the springing + keystone at the crown
  for (const s of [-1, 1]) {
    lbox(b, uC + s * (hw + 0.30), sy - 0.42, 0.20, 0.78, 0.72, 0.50, MARBLE_HI, PM.stone, { topCol: MARBLE_HI });
    lbox(b, uC + s * (hw + 0.30), sy + 0.34, 0.22, 0.92, 0.18, 0.55, GOLD, PM.gold);
  }
  lbox(b, uC, ap + 0.36, 0.42, 0.86, 1.36, 0.40, MARBLE_HI, PM.stone, { topCol: MARBLE_HI });
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, uC, ap + 0.30, 0.64, 1]);
  rosette(b, 0.40, 0, 12);
  b.pop();
  // gilded sunburst + swags on the panel above the arch
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, uC, 42.55, 0.16, 1]);
  rosette(b, 0.92, 0, 18);
  b.pop();
  for (const s of [-1, 1]) swag(b, uC + s * 2.55, 43.35, 1.85, 0.24);
}
function wingFront(b, s, rng) {
  const HB = 36.0, COR = WING.cornice, ATT = WING.attic;
  const edge = s > 0 ? -3.0 : 3.0;
  const far = s > 0 ? 16.0 : -16.0;
  const dir = far > edge ? 1 : -1;
  const span = Math.abs(far - edge), pitch = span / 4;
  const at = (k) => edge + dir * (k + 0.5) * pitch;
  const pil = (k) => edge + dir * k * pitch;
  const uC = (edge + far) * 0.5;                 // portal centre (local)
  const DHW = ROOM.door.hw;
  const inDoor = (k) => k === 1 || k === 2;      // the two bays swallowed by the portal
  rusticated(b, Math.min(edge, far), Math.max(edge, far), DECK, HB, 4, 0.03, STONE, STONE_SH, [[uC - DHW, uC + DHW]]);
  for (let k = 0; k < 4; k++) if (!inDoor(k)) archWin(b, at(k), 31.0, 2.35, 5.35, { seg: 5 });
  quoins(b, far, DECK, HB, dir > 0 ? 1 : -1, 0);
  // base moulding interrupted by the portal
  for (const [a, c] of [[edge, uC - DHW], [uC + DHW, far]]) {
    lbox(b, (a + c) * 0.5, HB + 0.16, 0.14, Math.abs(c - a), 0.32, 0.42, MARBLE, PM.stone, { topCol: MARBLE_HI });
  }
  for (let k = 0; k <= 4; k++) if (k !== 2) pilaster(b, pil(k), HB + 0.35, COR - 0.55, 0.82, 0.36, MARBLE);
  for (let k = 0; k < 4; k++) {
    if (inDoor(k)) continue;
    const u = at(k);
    archWin(b, u, 37.4, 2.55, 5.6, { seg: 6 });
    if (k % 2 === 0) headTri(b, u, 43.02, 2.55);
    else headSeg(b, u, 43.02, 2.55);
    balcony(b, u, 37.24, 2.55);
  }
  wingPortal(b, uC);
  lbox(b, (edge + far) * 0.5, 44.42, 0.20, span, 0.52, 0.40, MARBLE, PM.stone, { topCol: MARBLE_HI });
  lbox(b, (edge + far) * 0.5, 44.92, 0.16, span, 0.48, 0.24, STONE, PM.stone);
  for (let i = 0; i < 4; i++) swag(b, at(i), 44.96, 2.2, 0.24);
  pAt(b, (edge + far) * 0.5, 0, 0, 0, () => cornice(b, span + 0.2, 45.18, 0.9, MARBLE, true));
  lbox(b, (edge + far) * 0.5, 47.1, 0.10, span, 2.0, 0.20, STONE, PM.stone);
  for (let k = 0; k < 4; k++) {
    const u = at(k);
    lbox(b, u, 47.15, 0.12, 0.86, 1.30, 0.14, GLASS_D, PM.glass);
    lbox(b, u, 47.85, 0.16, 1.10, 0.13, 0.20, MARBLE, PM.stone);
  }
  pAt(b, (edge + far) * 0.5, ATT - 0.02, 0.26, 0, () => balustrade(b, span - 0.8, 0.92, MARBLE));
  for (let k = 0; k < 4; k++) {
    const u = at(k);
    if (k % 2 === 0) {
      b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, u, ATT + 0.02, 0.26, 1]);
      urn(b, 0.85, MARBLE);
      b.pop();
    } else {
      pAt(b, u, ATT + 0.02, 0.26, Math.PI, () => statueL(b, 0.62));
    }
  }
  for (let i = 0; i < 3; i++) {
    const u = edge + dir * (0.9 + i * 2.2);
    lbox(b, u, ATT + 0.95, 0.9, 1.35, 1.5, 0.5, MARBLE, PM.stone, { topCol: MARBLE_HI });
    b.quad([u - 0.6, ATT + 1.72, 1.16], [u + 0.6, ATT + 1.72, 1.16], [u + 0.6, ATT + 2.30, 1.16], [u - 0.6, ATT + 2.30, 1.16], GLASS_D, PM.glass, PS);
    lbox(b, u, ATT + 2.42, 0.98, 1.05, 0.16, 0.6, MARBLE_HI, PM.stone);
  }
  void rng;
}
// inland elevation of a wing (large surface seen from the rear / aerial views)
function wingBack(b, rng) {
  const HB = 36.0, ATT = WING.attic;
  rusticated(b, -16, 16, DECK, HB, 4, 0.03, STONE, STONE_SH);
  lbox(b, 0, HB + 0.16, 0.14, 32, 0.32, 0.42, MARBLE, PM.stone, { topCol: MARBLE_HI });
  for (const u of [-15.4, -10.5, -5.4, 0, 5.4, 10.5, 15.4]) pilaster(b, u, HB + 0.4, 45.4, 0.8, 0.34, MARBLE);
  for (const u of [-13.0, -7.9, -2.7, 2.7, 7.9, 13.0]) {
    archWin(b, u, 37.6, 2.4, 5.9, { seg: 5, mullions: false });
    if (Math.abs(u) > 6) headSeg(b, u, 43.5, 2.4);
  }
  for (let i = 0; i < 5; i++) swag(b, -12 + i * 6, 44.9, 2.6, 0.24);
  lbox(b, 0, 44.42, 0.18, 32, 0.5, 0.4, MARBLE, PM.stone, { topCol: MARBLE_HI });
  pAt(b, 0, 0, 0, 0, () => cornice(b, 32.2, 45.18, 0.9, MARBLE, true));
  lbox(b, 0, 47.1, 0.10, 32, 2.0, 0.20, STONE, PM.stone);
  for (const u of [-9, 0, 9]) lbox(b, u, 47.2, 0.14, 1.1, 1.3, 0.12, GLASS_D, PM.glass);
  pAt(b, 0, ATT - 0.02, 0.24, 0, () => balustrade(b, 30.0, 0.92, MARBLE));
  for (const u of [-13, -4.4, 4.4, 13]) {
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, u, ATT + 0.02, 0.24, 1]);
    urn(b, 0.9, MARBLE);
    b.pop();
  }
  void rng;
}
function wingSide(b, s, halfL, rng) {
  const lo = s > 0 ? -halfL : 0.0;
  const hi = s > 0 ? -6.0 : 6.0;
  const a = Math.min(lo, hi), c = Math.max(lo, hi);
  rusticated(b, a, c, DECK, 36, 4, 0.03, STONE, STONE_SH);
  lbox(b, (a + c) * 0.5, 36.16, 0.12, c - a, 0.30, 0.36, MARBLE, PM.stone);
  for (const u of [a + 0.9, (a + c) * 0.5, c - 0.9]) {
    if (Math.abs(u) > halfL - 0.4) continue;
    pilaster(b, u, 36.4, 45.6, 0.8, 0.34, MARBLE);
  }
  for (const u of [a + (c - a) * 0.30, c - (c - a) * 0.30]) {
    archWin(b, u, 37.6, 2.4, 6.4, { seg: 5, mullions: false });
    headSeg(b, u, 44.0, 2.4);
  }
  pAt(b, 0, 0, 0, 0, () => cornice(b, c - a + 0.2, 45.18, 0.8, MARBLE, true));
  lbox(b, 0, 47.1, 0.0, c - a, 2.0, 0.16, STONE, PM.stone);
  for (const u of [a + (c - a) * 0.3, c - (c - a) * 0.3]) lbox(b, u, 47.2, 0.16, 0.9, 1.2, 0.12, GLASS_D, PM.glass);
  void rng;
}

// ================================================================ 7. PAVILIONS
function buildPavilion(b, s, rng) {
  const X0 = PAV.x0, X1 = PAV.x1, Z0 = PAV.z0, Z1 = PAV.z1;
  const COR = PAV.cornice, ATT = PAV.attic, MTOP = PAV.mansardTop;
  const cx = s * (X0 + X1) * 0.5, cz = (Z0 + Z1) * 0.5;
  pBox(b, cx, (DECK + COR) * 0.5, cz, X1 - X0, COR - DECK, Z1 - Z0, STONE, PM.stone, { topCol: STONE_HI });
  pBox(b, cx, (COR + ATT) * 0.5, cz, X1 - X0 - 1.0, ATT - COR, Z1 - Z0 - 1.0, STONE, PM.stone, { topCol: STONE_HI });
  pAt(b, cx, ATT, cz, Math.PI, () => {
    mansard(b, X1 - X0 - 0.9, Z1 - Z0 - 0.9, MTOP - ATT, SLATE);
    // dormers on the pavilion front slope
    for (const u of [-4.3, 0.2, 4.6]) {
      lbox(b, u, 1.55, 11.0, 1.55, 1.8, 0.8, MARBLE, PM.stone, { topCol: MARBLE_HI });
      b.tri([u - 0.82, 2.42, 11.4], [u + 0.82, 2.42, 11.4], [u, 3.14, 11.4], MARBLE_HI, PM.stone, PS, PS, PS);
      b.quad([u - 0.52, 0.95, 11.44], [u + 0.52, 0.95, 11.44], [u + 0.52, 2.02, 11.44], [u - 0.52, 2.02, 11.44], GLASS_D, PM.glass, PS);
      lbox(b, u, 3.24, 11.3, 0.15, 0.5, 0.15, GOLD, PM.stone);
    }
    // chimneys
    for (const u of [-4.6, 4.9]) {
      lbox(b, u, 6.6, 4.2, 1.9, 3.4, 1.3, STONE, PM.stone, { topCol: STONE_HI });
      lbox(b, u, 8.4, 4.2, 2.2, 0.34, 1.6, MARBLE, PM.stone);
      for (const du of [-0.5, 0.5]) {
        b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, u + du, 8.6, 4.2, 1]);
        cylinder(b, 6, 0.23, 0.19, 0.7, STONE_SH, PM.stone, { y0: 0, caps: true });
        b.pop();
      }
    }
    // crest finials + gold pinnacles
    for (let i = 0; i < 5; i++) {
      const u = -5.4 + i * 2.7;
      lbox(b, u, 5.25, 5.6, 0.48, 0.5, 0.48, MARBLE_HI, PM.stone);
      b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, u, 5.72, 5.6, 1]);
      ellipsoid(b, 0.30, 0.40, 0.30, 6, 4, GOLD, PM.gold);
      b.pop();
    }
  });
  pAt(b, cx, 0, Z0, Math.PI, () => pavFront(b, rng));
  pAt(b, s * X1, 0, cz, s > 0 ? -D90 : D90, () => pavSide(b, (Z1 - Z0) * 0.5, rng));
  pAt(b, s * X0, 0, (Z0 + FZ) * 0.5, s > 0 ? D90 : -D90, () => {
    rusticated(b, -1.25, 1.25, DECK, 46, 6, 0.03, STONE, STONE_SH);
    lbox(b, 0, 47.9, 0.05, 2.5, 3.4, 0.18, STONE, PM.stone);
    for (const u of [-1.05, 1.05]) lbox(b, u, 39.5, 0.12, 0.44, 17.0, 0.24, MARBLE_HI, PM.stone);
  });
  pAt(b, cx, MTOP, Z0 + 4.0, Math.PI, () => {
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0.3, 0, 1]);
    ellipsoid(b, 0.55, 0.5, 0.55, 7, 4, GOLD, PM.gold);
    b.pop();
    pAt(b, 0, 0.9, 0, Math.PI, () => statueL(b, 1.15));
  });
}
function pavFront(b, rng) {
  const HB = 36.0, COR = PAV.cornice, ATT = PAV.attic;
  rusticated(b, -7, 7, DECK, HB, 4, 0.03, STONE, STONE_SH);
  for (const u of [-4.5, 0, 4.5]) archWin(b, u, 31.0, 2.3, 5.35, { seg: 5 });
  quoins(b, -7, DECK, HB, -1, 0);
  quoins(b, 7, DECK, HB, 1, 0);
  lbox(b, 0, HB + 0.18, 0.14, 14, 0.34, 0.44, MARBLE, PM.stone, { topCol: MARBLE_HI });
  for (const u of [-6.55, -2.15, 2.15, 6.55]) engagedCol(b, u, 36.4, 10.1, 0.62);
  for (const u of [-4.35, 0, 4.35]) {
    archWin(b, u, 37.6, 2.5, 8.2, { seg: 6 });
    if (u === 0) headTri(b, u, 45.82, 2.5);
    else headSeg(b, u, 45.82, 2.5);
    balcony(b, u, 37.44, 2.5);
  }
  lbox(b, 0, 47.42, 0.22, 14.2, 0.72, 0.46, MARBLE, PM.stone, { topCol: MARBLE_HI });
  lbox(b, 0, 47.98, 0.16, 14.0, 0.42, 0.28, STONE, PM.stone);
  for (let i = 0; i < 4; i++) swag(b, -5.4 + i * 3.6, 48.0, 2.3, 0.28);
  pAt(b, 0, 0, 0, 0, () => cornice(b, 14.4, 48.18, 1.0, MARBLE, true));
  lbox(b, 0, 50.1, 0.05, 13.4, 2.0, 0.2, STONE, PM.stone);
  for (const u of [-4.5, 4.5]) lbox(b, u, 50.15, 0.14, 0.92, 1.30, 0.14, GLASS_D, PM.glass);
  pAt(b, 0, ATT - 0.02, 0.24, 0, () => balustrade(b, 12.0, 0.92, MARBLE));
  for (const u of [-6.2, 6.2]) {
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, u, ATT + 0.02, 0.24, 1]);
    urn(b, 1.0, MARBLE);
    b.pop();
  }
  const wy = 50.9, hw = 5.6, ph = 3.1, pz = 0.55;
  lbox(b, 0, wy + 0.15, pz - 0.15, hw * 2 + 0.7, 0.30, 0.66, MARBLE_HI, PM.stone, { topCol: MARBLE_HI });
  b.tri([-hw, wy + 0.30, pz], [hw, wy + 0.30, pz], [0, wy + 0.30 + ph, pz], mulc(MARBLE, 0.95), PM.stone, PS, PS, PS);
  const ang = Math.atan2(ph, hw), len = Math.hypot(hw, ph) + 0.3;
  for (const sx of [-1, 1]) {
    rotZ(b, (sx * hw) / 2, wy + 0.30 + ph / 2, pz + 0.06, sx > 0 ? -ang : ang, () => {
      box(b, len, 0.24, 0.36, MARBLE_HI, PM.stone, { topCol: MARBLE_HI });
    });
  }
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, wy + 0.30 + ph * 0.36, pz + 0.06, 1]);
  rosette(b, 0.62, 0, 14);
  b.pop();
  pAt(b, 0, wy + 0.30 + ph, pz, Math.PI, () => statueL(b, 0.75));
  for (const u of [-3.6, 2.2]) {
    lbox(b, u, ATT + 1.0, 0.85, 1.3, 1.6, 0.5, MARBLE, PM.stone, { topCol: MARBLE_HI });
    b.quad([u - 0.58, ATT + 1.8, 1.12], [u + 0.58, ATT + 1.8, 1.12], [u + 0.58, ATT + 2.36, 1.12], [u - 0.58, ATT + 2.36, 1.12], GLASS_D, PM.glass, PS);
    lbox(b, u, ATT + 2.48, 0.94, 1.0, 0.16, 0.58, MARBLE_HI, PM.stone);
  }
  void rng;
}
function pavSide(b, halfL, rng) {
  const HB = 36.0, COR = PAV.cornice, ATT = PAV.attic;
  const n = 3, pitch = (halfL * 2) / 3;
  const at = (k) => -halfL + (k + 0.5) * pitch;
  rusticated(b, -halfL, halfL, DECK, HB, 4, 0.03, STONE, STONE_SH);
  quoins(b, -halfL, DECK, HB, -1, 0);
  quoins(b, halfL, DECK, HB, 1, 0);
  for (let k = 0; k < n; k++) archWin(b, at(k), 31.0, 2.4, 5.35, { seg: 5, mullions: false });
  lbox(b, 0, HB + 0.18, 0.14, halfL * 2, 0.34, 0.44, MARBLE, PM.stone, { topCol: MARBLE_HI });
  for (let k = 0; k <= n; k++) pilaster(b, -halfL + k * pitch, HB + 0.4, COR - 0.6, 0.8, 0.34, MARBLE);
  for (let k = 0; k < n; k++) {
    archWin(b, at(k), 37.6, 2.5, 7.8, { seg: 5, mullions: false });
    if (k === 1) headTri(b, at(k), 45.42, 2.5);
    else headSeg(b, at(k), 45.42, 2.5);
  }
  lbox(b, 0, 47.42, 0.2, halfL * 2, 0.72, 0.42, MARBLE, PM.stone, { topCol: MARBLE_HI });
  for (let k = 0; k < n; k++) swag(b, at(k), 48.0, 2.2, 0.26);
  pAt(b, 0, 0, 0, 0, () => cornice(b, halfL * 2 + 0.2, 48.18, 0.95, MARBLE, true));
  lbox(b, 0, 50.1, 0.04, halfL * 2, 2.0, 0.16, STONE, PM.stone);
  for (let k = 0; k < n; k++) lbox(b, at(k), 50.15, 0.12, 0.9, 1.3, 0.14, GLASS_D, PM.glass);
  pAt(b, 0, ATT - 0.02, 0.22, 0, () => balustrade(b, halfL * 2 - 1.2, 0.92, MARBLE));
  for (const u of [-halfL + 0.9, halfL - 0.9]) {
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, u, ATT + 0.02, 0.22, 1]);
    urn(b, 0.95, MARBLE);
    b.pop();
  }
  void rng;
}

// ================================================================ 8. DRUM + DOME
// local frame on the drum circle (must be called inside the drum's centred frame)
function drumFrame(b, a, rad, fn) {
  const yaw = Math.atan2(-Math.cos(a), Math.sin(a));
  pAt(b, Math.cos(a) * rad, 0, Math.sin(a) * rad, yaw, fn);
}
function buildDrumDome(b) {
  const cz = HALL.cz, rD = DOME.rOuter;
  const y0 = CORE.drumY0, y1 = CORE.drumY1;
  pAt(b, 0, 0, cz, 0, () => {
    cylBand(b, rD, rD, y0, y1, 48, STONE, PM.stone, true);
    cylBand(b, rD - 0.35, rD + 0.30, y0 - 0.05, y0 + 0.42, 48, MARBLE, PM.stone, true);
    for (let i = 0; i < 16; i++) {
      const aw = (i / 16) * TAU;
      drumFrame(b, aw, rD + 0.02, () => {
        archWin(b, 0, 55.15, 2.15, 4.95, { seg: 5, mullions: false, face: 0.10 });
      });
      const ap = ((i + 0.5) / 16) * TAU;
      drumFrame(b, ap, rD + 0.04, () => {
        lbox(b, 0, 58.2, 0.16, 0.66, 6.3, 0.30, MARBLE, PM.stone, { topCol: MARBLE_HI });
        lbox(b, 0, 55.15, 0.20, 0.86, 0.34, 0.40, MARBLE_HI, PM.stone);
        lbox(b, 0, 61.2, 0.22, 0.98, 0.36, 0.44, MARBLE_HI, PM.stone);
        lbox(b, 0, 61.44, 0.26, 0.52, 0.12, 0.30, GOLD, PM.gold);
      });
    }
    for (let i = 0; i < 8; i++) {
      drumFrame(b, ((i + 0.5) / 8) * TAU, rD + 0.05, () => {
        b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 61.8, 0.22, 1]);
        ellipsoid(b, 0.26, 0.26, 0.10, 6, 3, GOLD, PM.gold);
        b.pop();
      });
    }
    // gilded cartouches on the drum base ledge
    for (let i = 0; i < 16; i++) {
      drumFrame(b, (i / 16) * TAU, rD + 0.03, () => {
        b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 54.95, 0.36, 1]);
        ellipsoid(b, 0.30, 0.22, 0.10, 6, 3, GOLD, PM.gold);
        b.pop();
      });
    }
    cylBand(b, rD, rD + 0.30, 61.55, 61.85, 48, MARBLE, PM.stone, true);
    cylBand(b, rD + 0.30, rD + 0.72, 61.85, 62.12, 48, MARBLE, PM.stone, true);
    cylBand(b, rD + 0.72, rD + 0.72, 62.12, 62.32, 48, MARBLE_HI, PM.stone, true);
    cylBand(b, rD + 0.72, rD + 0.10, 62.32, 62.55, 48, MARBLE_HI, PM.stone, true);
    cylBand(b, rD + 0.08, rD + 0.08, 62.5, 62.85, 48, GOLD, PM.gold, true);
    ringY(b, 15.0, rD + 0.1, 61.98, 48, STONE_SH, PM.stone, false);
  });
  // outer dome shell: sphere r=16.6 centred (0,62,144), open at y=76
  const vTop = Math.asin(Math.min(1, (DOME.oculusY - CORE.domeY0) / rD));
  const NSEG = 32, NB = 14;
  const TONES = [mixc(SLATE_HI, STONE_HI, 0.34), mixc(SLATE, STONE_HI, 0.30), mixc(SLATE_LO, STONE_HI, 0.26)];
  for (let j = 0; j < NB; j++) {
    const v0 = (j / NB) * vTop, v1 = ((j + 1) / NB) * vTop;
    const r0 = Math.cos(v0) * rD, yy0 = CORE.domeY0 + Math.sin(v0) * rD;
    const r1 = Math.cos(v1) * rD, yy1 = CORE.domeY0 + Math.sin(v1) * rD;
    for (let i = 0; i < NSEG; i++) {
      const a0 = (i / NSEG) * TAU, a1 = ((i + 1) / NSEG) * TAU;
      const base = TONES[(i + j) % 3];
      const cc = mulc(base, 0.94 + 0.10 * (j / (NB - 1)));
      const P = (r, yy, a) => [Math.cos(a) * r, yy, cz + Math.sin(a) * r];
      const nn = (a, v) => [Math.cos(a) * Math.cos(v), Math.sin(v), Math.sin(a) * Math.cos(v)];
      const p00 = P(r0, yy0, a0), p01 = P(r0, yy0, a1), p11 = P(r1, yy1, a1), p10 = P(r1, yy1, a0);
      b.tri(p00, p01, p11, cc, PM.slate, nn(a0, v0), nn(a1, v0), nn(a1, v1));
      b.tri(p00, p11, p10, cc, PM.slate, nn(a0, v0), nn(a1, v1), nn(a0, v1));
    }
  }
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * TAU;
    const d = 0.016;
    for (let j = 0; j < NB; j++) {
      const v0 = (j / NB) * vTop, v1 = ((j + 1) / NB) * vTop;
      const rr0 = Math.cos(v0) * (rD + 0.16), rr1 = Math.cos(v1) * (rD + 0.16);
      const yy0 = CORE.domeY0 + Math.sin(v0) * (rD + 0.16), yy1 = CORE.domeY0 + Math.sin(v1) * (rD + 0.16);
      const P = (rr, yy, aa) => [Math.cos(aa) * rr, yy, cz + Math.sin(aa) * rr];
      const nrm = (v) => [Math.cos(a) * Math.cos(v), Math.sin(v), Math.sin(a) * Math.cos(v)];
      b.quad(P(rr0, yy0, a - d), P(rr0, yy0, a + d), P(rr1, yy1, a + d), P(rr1, yy1, a - d), GOLD, PM.gold, nrm(v0));
    }
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, Math.cos(a) * (rD + 0.2), CORE.domeY0 + 0.55, cz + Math.sin(a) * (rD + 0.2), 1]);
    ellipsoid(b, 0.22, 0.34, 0.22, 6, 3, GOLD_HI, PM.gold);
    b.pop();
  }
  pAt(b, 0, DOME.oculusY, cz, 0, () => {
    ringY(b, 5.32, 8.95, 0, 48, GOLD, PM.gold, true);
    cylBand(b, 8.95, 9.22, -0.02, 0.40, 32, GOLD_HI, PM.gold, true);
    ringY(b, 8.95, 9.22, 0.40, 32, GOLD_HI, PM.gold, true);
    ringY(b, 5.32, 5.62, -0.03, 32, GOLD_HI, PM.gold, false);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, Math.cos(a) * 9.35, 0.52, Math.sin(a) * 9.35, 1]);
      ellipsoid(b, 0.20, 0.26, 0.20, 5, 3, GOLD_HI, PM.gold);
      b.pop();
    }
  });
}

// ================================================================ 9. INTERIOR SHELL
function buildInterior(b) {
  const cz = HALL.cz, r = HALL.rWall;
  const y0 = DECK, y1 = CORE.drumY1;
  const NSEG = 60;
  const rows = [30, 34, 38, 42, 46, 48.1, 50.5, 53.5, 56.5, 59.5, 62];
  for (let i = 0; i < NSEG; i++) {
    const a0 = (i / NSEG) * TAU, a1 = ((i + 1) / NSEG) * TAU;
    const am = (a0 + a1) * 0.5;
    const deg = (am * 180) / Math.PI;
    const inPortal = deg > 252 && deg < 288;
    const inApse = deg > 66 && deg < 114;
    const ca = Math.cos(am), sa = Math.sin(am);
    const N = [-sa, 0, -ca];
    for (let j = 0; j < rows.length - 1; j++) {
      const ya = rows[j], yb = rows[j + 1];
      if (inPortal && yb <= 48.11) continue;
      if (inApse && yb <= 46.01) continue;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const cc = mulc(HALLW, 0.90 + 0.12 * Math.max(0, ca * 0.4 + 0.6));
      b.tri([c0 * r, ya, cz + s0 * r], [c0 * r, yb, cz + s0 * r], [c1 * r, yb, cz + s1 * r], cc, PM.hall, N, N, N);
      b.tri([c0 * r, ya, cz + s0 * r], [c1 * r, yb, cz + s1 * r], [c1 * r, ya, cz + s1 * r], cc, PM.hall, N, N, N);
    }
  }
  pAt(b, 0, 0, cz, 0, () => {
    const D2R = Math.PI / 180;
    for (const [d0, d1] of [[288, 426], [114, 252]]) {
      arcBandIn(b, r - 0.06, y0 - 0.08, y0 + 0.92, d0 * D2R, d1 * D2R, 23, MARBLE_SH, PM.stone);
      arcBandIn(b, r - 0.02, y0 + 0.92, y0 + 1.06, d0 * D2R, d1 * D2R, 23, MARBLE, PM.stone);
    }
    cylBand(b, r, r - 0.48, 60.55, 61.0, NSEG, HALLHI, PM.hall, false);
    cylBand(b, r - 0.48, r - 0.48, 61.0, 61.55, NSEG, HALLHI, PM.hall, false);
    cylBand(b, r - 0.48, r, 61.55, 61.88, NSEG, HALLHI, PM.hall, false);
    disc(b, r, 60, FLR, PM.hallFloor, { center: [0, y0, 0] });
    disc(b, r - 0.9, 60, FLRB, PM.hallFloor, { inner: r - 1.6, center: [0, y0 + 0.004, 0] });
    disc(b, 2.2, 40, mixc(FLR, GOLD, 0.35), PM.hallFloor, { inner: 1.9, center: [0, y0 + 0.008, 0] });
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU;
      const w = i % 2 ? 0.018 : 0.035;
      b.quad([Math.cos(a) * 2.3, y0 + 0.007, Math.sin(a) * 2.3], [Math.cos(a) * (r - 1.7), y0 + 0.007, Math.sin(a) * (r - 1.7)],
        [Math.cos(a + w) * (r - 1.7), y0 + 0.007, Math.sin(a + w) * (r - 1.7)], [Math.cos(a + w) * 2.3, y0 + 0.007, Math.sin(a + w) * 2.3], mixc(MARBLE, STONE_SH, 0.5), PM.hallFloor, UP);
    }
    disc(b, r - 2.1, 60, mixc(FLRB, MARBLE, 0.4), PM.hallFloor, { inner: r - 2.5, center: [0, y0 + 0.006, 0] });
    disc(b, 5.4, 48, mixc(FLR, MARBLE_SH, 0.35), PM.hallFloor, { inner: 4.9, center: [0, y0 + 0.006, 0] });
  });
  buildApse(b);
  void y1;
}
function buildApse(b) {
  const cz = HALL.cz;
  const hx = 6.1;
  const zf = cz + Math.sqrt(225 - hx * hx);
  const zb = P.rearWindow.apseZ;
  const yTop = 46, yBack = 52;
  b.quad([-hx, DECK + 0.002, zf - 0.3], [hx, DECK + 0.002, zf - 0.3], [hx, DECK + 0.002, zb], [-hx, DECK + 0.002, zb], FLR, PM.hallFloor, UP);
  const NX = 8, NT = 4;
  const zfAt = (x) => cz + Math.sqrt(225 - x * x);
  const Pv = (x, t) => [x, yTop + (yBack - yTop) * Math.sin(t * Math.PI * 0.5), zfAt(x) + (zb - zfAt(x)) * t];
  // apse side walls: their top edge follows the vault springing so no sky can show at the corners
  for (const s of [-1, 1]) {
    for (let j = 0; j < NT; j++) {
      const t0 = j / NT, t1 = (j + 1) / NT;
      const z0 = zf + (zb - zf) * t0, z1 = zf + (zb - zf) * t1;
      const y0 = yTop + (yBack - yTop) * Math.sin(t0 * Math.PI * 0.5);
      const y1 = yTop + (yBack - yTop) * Math.sin(t1 * Math.PI * 0.5);
      b.quad([s * hx, DECK, z0], [s * hx, DECK, z1], [s * hx, y1, z1], [s * hx, y0, z0], HALLW, PM.hall, [-s, 0, 0]);
    }
  }
  for (let i = 0; i < NX; i++) {
    for (let j = 0; j < NT; j++) {
      const x0 = -hx + (2 * hx * i) / NX, x1 = -hx + (2 * hx * (i + 1)) / NX;
      const t0 = j / NT, t1 = (j + 1) / NT;
      const p00 = Pv(x0, t0), p01 = Pv(x1, t0), p11 = Pv(x1, t1), p10 = Pv(x0, t1);
      const N = [0, -1, 0.35];
      b.tri(p00, p01, p11, mulc(HALLW, 0.92), PM.hall, N, N, N);
      b.tri(p00, p11, p10, mulc(HALLW, 0.92), PM.hall, N, N, N);
    }
  }
  for (const s of [-1, 1]) {
    b.quad([s * (hx - 0.02), DECK, zf], [s * (hx - 0.02), yTop + 0.5, zf], [s * (hx + 0.42), yTop + 0.5, zf], [s * (hx + 0.42), DECK, zf], MARBLE, PM.stone, [-s, 0, 0]);
  }
  // gilded ribs across the apse vault
  for (const rx of [-4.2, -1.4, 1.4, 4.2]) {
    for (let j = 0; j < 4; j++) {
      const t0 = j / 4, t1 = (j + 1) / 4;
      const a0 = Pv(rx - 0.13, t0), b0 = Pv(rx + 0.13, t0), a1 = Pv(rx - 0.13, t1), b1 = Pv(rx + 0.13, t1);
      b.quad(a0, b0, b1, a1, mixc(GOLD, MARBLE, 0.3), PM.gold, [0, -1, 0.3]);
    }
  }
  const W = P.rearWindow;
  const zW = zb;
  const nz = [0, 0, -1];
  b.quad([-hx, DECK, zW], [hx, DECK, zW], [hx, W.y0, zW], [-hx, W.y0, zW], HALLW, PM.hall, nz);
  for (let i = 0; i < 8; i++) {
    const seg = 8;
    const a0 = (Math.PI * i) / seg, a1 = (Math.PI * (i + 1)) / seg;
    const yy0 = W.y1 - W.hx + Math.sin(a0) * W.hx, yy1 = W.y1 - W.hx + Math.sin(a1) * W.hx;
    b.quad([Math.cos(a0) * W.hx, yy0, zW], [Math.cos(a1) * W.hx, yy1, zW], [Math.cos(a1) * W.hx, yBack, zW], [Math.cos(a0) * W.hx, yBack, zW], HALLW, PM.hall, nz);
  }
  for (const s of [-1, 1]) {
    b.quad([s * hx, W.y0, zW], [s * W.hx, W.y0, zW], [s * W.hx, yBack, zW], [s * hx, yBack, zW], HALLW, PM.hall, nz);
    b.quad([s * W.hx, W.y0, zW], [s * W.hx, W.y0, zW + 0.4], [s * W.hx, W.y1 - W.hx, zW + 0.4], [s * W.hx, W.y1 - W.hx, zW], MARBLE_SH, PM.stone, [-s, 0, 0]);
  }
  const gz = zW + 0.42;
  const gcol = mixc(PC.glowSky, PC.glow, 0.30);
  b.quad([-W.hx, W.y0, gz], [W.hx, W.y0, gz], [W.hx, W.y1 - W.hx, gz], [-W.hx, W.y1 - W.hx, gz], gcol, PM.glow, nz);
  for (let i = 0; i < 8; i++) {
    const seg = 8;
    const a0 = (Math.PI * i) / seg, a1 = (Math.PI * (i + 1)) / seg;
    b.tri([0, W.y1 - W.hx, gz], [Math.cos(a0) * W.hx, W.y1 - W.hx + Math.sin(a0) * W.hx, gz], [Math.cos(a1) * W.hx, W.y1 - W.hx + Math.sin(a1) * W.hx, gz], gcol, PM.glow, nz, nz, nz);
  }
}

// ================================================================ 10. PAVING + LIGHTS
function paveY(b, x0, z0, x1, z1, y, nx, nz, col, mat) {
  const dx = (x1 - x0) / nx, dz = (z1 - z0) / nz;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const sh = 0.93 + 0.08 * (((i * 3 + j * 5) % 7) / 6);
      b.quad([x0 + i * dx, y, z0 + j * dz], [x0 + (i + 1) * dx, y, z0 + j * dz], [x0 + (i + 1) * dx, y, z0 + (j + 1) * dz], [x0 + i * dx, y, z0 + (j + 1) * dz], mulc(col, sh), mat, UP);
    }
  }
}
function buildApronPaving(b) {
  const HX = P.podium.hx;
  paveY(b, -HX, 122.42, HX, 123.99, DECK + 0.006, 20, 1, MARBLE, PM.marble);
  for (const s of [-1, 1]) paveY(b, s > 0 ? 46 : -HX, 96.2, s > 0 ? HX : -46, 122.4, DECK + 0.004, 3, 8, MARBLE_SH, PM.marble);
  for (const s of [-1, 1]) paveY(b, s > 0 ? 20.5 : -HX, WING.z1 + 0.3, s > 0 ? HX : -20.5, P.podium.z1 - 0.4, DECK + 0.004, 8, 6, STONE, PM.stone);
  paveY(b, -20.5, CORE.z1 + 0.3, 20.5, P.podium.z1 - 0.4, DECK + 0.004, 6, 2, STONE, PM.stone);
  // urns standing on the exposed side strips of the podium top
  for (const s of [-1, 1]) {
    for (const z of [101.5, 112.0, 118.2]) {
      b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, s * 49.4, DECK + 0.02, z, 1]);
      lbox(b, 0, 0.24, 0, 1.5, 0.48, 1.5, MARBLE_SH, PM.stone, { topCol: MARBLE });
      b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0.48, 0, 1]);
      urn(b, 1.15, MARBLE);
      b.pop();
      b.pop();
    }
  }
  // rear parapet urn pair
  for (const s of [-1, 1]) {
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, s * 44, DECK + 0.62, P.podium.z1 - 0.55, 1]);
    urn(b, 1.3, MARBLE);
    b.pop();
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, s * 40, DECK + 0.62, 160.0, 1]);
    urn(b, 1.2, MARBLE);
    b.pop();
  }
  for (const s of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const z = 166 + i * 2.6;
      b.quad([s * (HX - 0.55), 30.92, z], [s * (HX - 0.22), 30.92, z], [s * (HX - 0.22), 30.92, z + 1.2], [s * (HX - 0.55), 30.92, z + 1.2], GOLD, PM.gold, UP);
    }
  }
}
function addLights(ctx) {
  const col = mixc(C.sunGlow, C.goldBright, 0.40);
  const pts = [
    [-14, 34, 121.5, 55, 0.45], [14, 34, 121.5, 55, 0.45],
    [-30, 33.5, 121.5, 55, 0.42], [30, 33.5, 121.5, 55, 0.42],
    [-11, 36, 113.2, 48, 0.50], [11, 36, 113.2, 48, 0.50],
  ];
  for (const [x, y, z, range, int] of pts) ctx.points.push({ p: [x, y, z], col, range, int });
}

// ================================================================ entry point
export function buildPalace(b, ctx, rng) {
  b.note && b.note('palace');
  const depth = b.stack.length;
  try { buildPalaceInner(b, ctx, rng); } catch (e) {
    while (b.stack.length > depth) b.pop();
    throw e;
  }
}
function buildPalaceInner(b, ctx, rng) {
  buildPodium(b, rng);
  buildCore(b, rng);
  buildPortal(b);
  buildSideDoors(b);
  buildPortico(b, rng);
  for (const s of [-1, 1]) {
    buildWing(b, s, rng);
    buildPavilion(b, s, rng);
  }
  // round 6: dress the two halls carved out of the wings (palace-rooms.js, local rng)
  for (const s of [-1, 1]) buildWingRooms(b, ctx, s);
  buildDrumDome(b);
  buildInterior(b);
  buildApronPaving(b);
  if (ctx && ctx.points) addLights(ctx);
}
export const palaceParts = [
  ['podium', (b, c, r) => buildPodium(b, r)],
  ['core', (b, c, r) => buildCore(b, r)],
  ['portal', (b) => buildPortal(b)],
  ['doors', (b) => buildSideDoors(b)],
  ['portico', (b) => buildPortico(b)],
  ['wingL', (b) => buildWing(b, -1)],
  ['wingR', (b) => buildWing(b, 1)],
  ['libraryR', (b, c) => buildWingRooms(b, c, 1)],
  ['banquetL', (b, c) => buildWingRooms(b, c, -1)],
  ['pavL', (b) => buildPavilion(b, -1)],
  ['pavR', (b) => buildPavilion(b, 1)],
  ['drumDome', (b) => buildDrumDome(b)],
  ['interior', (b) => buildInterior(b)],
  ['paving', (b) => buildApronPaving(b)],
];
