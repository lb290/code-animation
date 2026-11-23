// GLASS GREENHOUSE — round 6: the tropical palm-house inside the glass palace drum.
// OWNER: agent "glass". Contract: 03-notes/cielo-round6-brief.md section 2 (A).
// landmark.js buildGlassPalace centres the glass drum + dome on the podium (local
// z = -25) and opens a grand glazed door in its front; this module is called by
// buildGlassPalace and fills the drum with a Victorian palm-house: a stone floor
// with the hall's glazed skylight ridge rising through a gilded well, palms, tree
// ferns, bananas, monstera, flower beds, vines, orchid baskets, a lily pool and a
// gold cast-iron arcade carrying a ring beam. Local frame of L.glassPalace, +Z is
// the street front, floor y = 21.2, drum centre local (0, 0, -25).
import { mulberry32, TAU, norm, m4 } from './math.js';
import { box, cylinder, torus, rgb, mulc, mixc, bar3, lathe, sphere, ribbon } from './geo.js';
import { MT, tubePath, star } from './lib3d.js';
import { C } from './palette.js';
import { L } from './layout.js';

const SEED = 20261123;
const Y = 21.2;              // greenhouse floor
const CZ = -25;              // drum centre (local z)
const RIN = 26.30;           // interior radius of the drum
const HOLE = { x: 9.2, z0: -44.4, z1: -11.6 };   // skylight-ridge well in the floor

// ---------------------------------------------------------------- local palette
const STONE_F = rgb('#c0ab84'), STONE_F2 = rgb('#a68f68'), STONE_L = rgb('#d8c7a4');
const GRAVEL = rgb('#a2937a'), MOSS = rgb('#4f8040'), MOSS_D = rgb('#38622f');
const GOLD = rgb('#e2b25e'), GOLD_B = rgb('#ffdda2'), GOLD_D = rgb('#a5792f');
const IRON = rgb('#4a5568'), IRON_L = rgb('#65707f');
const TRUNK = rgb('#8a6a42'), TRUNK_D = rgb('#6b5132');
const LEAF = rgb('#3f8a45'), LEAF_L = rgb('#6fbf5c'), LEAF_D = rgb('#2c6338'), LEAF_Y = rgb('#a8cf5a');
const FERN = rgb('#4f9a4e'), FERN_L = rgb('#83c46a');
const BANANA = rgb('#4c9a3f'), BANANA_L = rgb('#7cc157');
const WATER = rgb('#5fb0d8'), WATER_D = rgb('#2f7f9e');
const PINK = rgb('#f27a9c'), RED = rgb('#d94b59'), YELLOW = rgb('#f7c948'), WHITE_B = rgb('#fff6ea');
const VIOLET = rgb('#9a7ae0'), ORANGE = rgb('#f08a3c');
const STONE_WARM = rgb('#d6c8aa'), MARBLE = rgb('#efe8d8');

// ---------------------------------------------------------------- materials
const M_STONE = [0.15, 0.12];
const M_STONE_D = [0.10, 0.18];
const M_GOLD = [0.20, 0.86];
const M_GOLD_B = [0.30, 0.72];
const M_IRON = [0.10, 0.52];
const M_TRUNK = [0.10, 0.16];
const M_LEAF = [0.15, 0.10];
const M_LEAF_L = [0.19, 0.08];
const M_WATER = [0.16, 0.95];
const M_BLOOM = [0.24, 0.10];
const M_GLOW = [0.58, 0.06];
const M_MIST = [0.0, 0.0];

// ---------------------------------------------------------------- helpers
const T = (x, y, z) => m4.translate([x, y, z]);
const RY = (a) => m4.rotY(a);
function put(b, x, y, z, fn) { b.push(T(x, y, z)); fn(); b.pop(); }
function putR(b, x, y, z, yaw, fn) { b.push(T(x, y, z)); b.push(RY(yaw)); fn(); b.pop(); b.pop(); }

const A = L.glassPalace;
const ca = Math.cos(A.rot), sa = Math.sin(A.rot);
// inFrame convention (local +X -> (cos,0,sin), local +Z -> (-sin,0,cos)); this is the
// frame the geometry is built in, so ctx.points / ctx.lanterns must use it too.
const wp = (lx, ly, lz) => [A.x + ca * lx - sa * lz, ly, A.z + sa * lx + ca * lz];

// polar -> local xz around the drum centre; a = 0 is +X, PI/2 is the street front
const px = (a, r) => Math.cos(a) * r;
const pz = (a, r) => CZ + Math.sin(a) * r;

// flat disc / ring in the XZ plane
function discY(b, cx, cy, cz, r, seg, col, mat, ny = 1) {
  const N = [0, ny, 0];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    b.tri([cx, cy, cz], [cx + Math.cos(a1) * r, cy, cz + Math.sin(a1) * r],
      [cx + Math.cos(a0) * r, cy, cz + Math.sin(a0) * r], col, mat, N, N, N);
  }
}
function flatQuad(b, pts, col, mat, y) {
  const N = [0, 1, 0];
  b.quad([pts[0][0], y, pts[0][1]], [pts[1][0], y, pts[1][1]], [pts[2][0], y, pts[2][1]], [pts[3][0], y, pts[3][1]], col, mat, N);
}

// ---------------------------------------------------------------- floor
// Stone floor of the drum with the rectangular skylight well cut out.  Slices run
// across local z so the well edges are exact and the outer edge follows the drum.
function floorWithHole(b) {
  const R = RIN - 0.04;
  const zs = [];
  const step = 1.55;
  for (let z = CZ - R; z <= CZ + R; z += step) zs.push(z);
  zs.push(CZ + R);
  zs.push(HOLE.z0, HOLE.z1);
  zs.sort((p, q) => p - q);
  const hw = (z) => Math.sqrt(Math.max(0, R * R - (z - CZ) * (z - CZ)));
  for (let i = 0; i < zs.length - 1; i++) {
    const za = zs[i], zb = zs[i + 1];
    if (zb - za < 1e-4) continue;
    const wa = hw(za), wb = hw(zb);
    if (wa < 0.05 && wb < 0.05) continue;
    const inHole = za >= HOLE.z0 - 1e-4 && zb <= HOLE.z1 + 1e-4;
    const shade = 0.90 + 0.10 * Math.abs(Math.sin(i * 1.7));
    const col = mulc(STONE_F, shade);
    if (!inHole) {
      b.quad([-wa, Y, za], [wa, Y, za], [wb, Y, zb], [-wb, Y, zb], col, M_STONE, [0, 1, 0]);
    } else {
      if (wa > HOLE.x + 0.02) {
        b.quad([-wa, Y, za], [-HOLE.x, Y, za], [-HOLE.x, Y, zb], [-wb, Y, zb], mulc(col, 0.97), M_STONE, [0, 1, 0]);
        b.quad([HOLE.x, Y, za], [wa, Y, za], [wb, Y, zb], [HOLE.x, Y, zb], mulc(col, 0.99), M_STONE, [0, 1, 0]);
      } else {
        b.quad([-wa, Y, za], [wa, Y, za], [wb, Y, zb], [-wb, Y, zb], col, M_STONE, [0, 1, 0]);
      }
    }
    // stone tile joints across the floor
    if (!inHole) {
      const jc = mulc(STONE_F2, 0.62);
      b.quad([-wa, Y + 0.006, za - 0.05], [wa, Y + 0.006, za - 0.05], [wa, Y + 0.006, za + 0.05], [-wa, Y + 0.006, za + 0.05], jc, M_STONE_D, [0, 1, 0]);
    }
    // a thin warm side rail along the inner face of the drum (skirting)
    const sk = 0.10;
    b.quad([-wa, Y - sk, za], [-wb, Y - sk, zb], [-wb, Y, zb], [-wa, Y, za], mulc(STONE_L, 0.86), M_STONE_D, [-1, 0, 0]);
    b.quad([wa, Y - sk, za], [wa, Y, za], [wb, Y, zb], [wb, Y - sk, zb], mulc(STONE_L, 0.86), M_STONE_D, [1, 0, 0]);
  }
}

// inner plinth of the drum (covers the joint between the floor and the glass)
function innerPlinth(b) {
  const R = RIN + 0.05;
  const N = 48;
  const aDoor = Math.asin(3.8 / R);
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * TAU, a1 = ((i + 1) / N) * TAU;
    const am = (a0 + a1) / 2;
    const dd = Math.atan2(Math.sin(am - Math.PI / 2), Math.cos(am - Math.PI / 2));
    if (Math.abs(dd) < aDoor + 0.02) continue;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const p0 = [c0 * R, Y, CZ + s0 * R], p1 = [c1 * R, Y, CZ + s1 * R];
    const q0 = [c0 * R, Y + 1.85, CZ + s0 * R], q1 = [c1 * R, Y + 1.85, CZ + s1 * R];
    const n0 = [-c0, 0, -s0], n1 = [-c1, 0, -s1];
    b.quad(p0, q0, q1, p1, mulc(STONE_WARM, 0.92), M_STONE, n0);
    // gold moulding at the top of the plinth
    b.quad([c0 * (R - 0.16), Y + 1.85, CZ + s0 * (R - 0.16)], [c0 * (R - 0.16), Y + 1.72, CZ + s0 * (R - 0.16)],
      [c1 * (R - 0.16), Y + 1.72, CZ + s1 * (R - 0.16)], [c1 * (R - 0.16), Y + 1.85, CZ + s1 * (R - 0.16)],
      GOLD, M_GOLD, n0);
    // gold base moulding at floor level
    b.quad([c0 * (R - 0.05), Y, CZ + s0 * (R - 0.05)], [c1 * (R - 0.05), Y, CZ + s1 * (R - 0.05)],
      [c1 * (R - 0.05), Y + 0.22, CZ + s1 * (R - 0.05)], [c0 * (R - 0.05), Y + 0.22, CZ + s0 * (R - 0.05)],
      GOLD_B, M_GOLD_B, n0);
  }
}

// ---------------------------------------------------------------- skylight well
// cased opening around the hall's glazed ridge: stone curb, gold rail, gold posts
function wellCurb(b) {
  const X = HOLE.x, Z0 = HOLE.z0 - 0.15, Z1 = HOLE.z1 + 0.15;
  const wallH = 0.72, cw = 0.62;
  // stone curb on both long sides
  for (const sx of [-1, 1]) {
    put(b, sx * X, Y + wallH / 2, (Z0 + Z1) / 2, () => box(b, cw, wallH, Z1 - Z0, STONE_L, M_STONE));
    b.quad([sx * (X - cw / 2), Y + wallH, Z0], [sx * (X + cw / 2), Y + wallH, Z0],
      [sx * (X + cw / 2), Y + wallH, Z1], [sx * (X - cw / 2), Y + wallH, Z1], GOLD_B, M_GOLD_B, [0, 1, 0]);
    // gold rail above the curb
    const ry = Y + 0.95;
    b.quad([sx * X - 0.06, ry, Z0], [sx * X + 0.06, ry, Z0], [sx * X + 0.06, ry, Z1], [sx * X - 0.06, ry, Z1], GOLD, M_GOLD, [0, 1, 0]);
    for (let k = 0; k <= 12; k++) {
      const z = Z0 + ((Z1 - Z0) * k) / 12;
      put(b, sx * X, Y + wallH, z, () => box(b, 0.09, 0.72, 0.09, GOLD_D, M_GOLD));
    }
  }
  // end curbs
  for (const z of [Z0, Z1]) {
    for (const sx of [-1, 1]) put(b, sx * (X + cw) / 2, Y + wallH / 2, z, () => box(b, 2 * X - cw, wallH, cw, STONE_L, M_STONE));
    b.quad([-X + cw / 2, Y + wallH, z - cw / 2], [X - cw / 2, Y + wallH, z - cw / 2],
      [X - cw / 2, Y + wallH, z + cw / 2], [-X + cw / 2, Y + wallH, z + cw / 2], GOLD_B, M_GOLD_B, [0, 1, 0]);
    put(b, 0, Y + wallH + 0.36, z, () => box(b, 2 * X, 0.09, 0.09, GOLD, M_GOLD));
    for (const sx of [-1, 1]) put(b, sx * (X - 0.5), Y + wallH + 0.18, z, () => box(b, 0.09, 0.72, 0.09, GOLD_D, M_GOLD));
  }
  // four gold urn finials at the corners of the well
  for (const sx of [-1, 1]) for (const z of [Z0, Z1]) {
    put(b, sx * X, Y + wallH, z, () => {
      lathe(b, [[0.0, 0], [0.30, 0.10], [0.22, 0.36], [0.30, 0.62], [0.14, 0.78], [0.0, 0.82]], 8, GOLD, M_GOLD);
    });
  }
}

// ---------------------------------------------------------------- entrance vestibule
function vestibule(b) {
  // interior stone side walls framing the door, with gold panels and a flat head
  for (const sx of [-1, 1]) {
    put(b, sx * 5.05, Y + 3.4, -0.5, () => box(b, 1.1, 6.8, 5.2, STONE_WARM, M_STONE));
    put(b, sx * 4.45, Y + 4.4, -0.5, () => box(b, 0.12, 5.2, 3.4, GOLD_D, M_GOLD));
    put(b, sx * 4.44, Y + 4.4, -0.5, () => box(b, 0.10, 4.4, 2.6, mulc(GOLD_B, 0.9), M_GOLD_B));
    // pilaster capitals
    put(b, sx * 4.45, Y + 6.6, -0.5, () => box(b, 0.5, 0.5, 3.9, GOLD, M_GOLD));
    // stone planter against each wall, with a fern
    put(b, sx * 3.9, Y + 0.62, -1.9, () => box(b, 1.5, 1.24, 1.5, STONE_L, M_STONE));
    put(b, sx * 3.9, Y + 1.28, -1.9, () => box(b, 1.62, 0.16, 1.62, GOLD_B, M_GOLD_B));
  }
  // red carpet down the entrance axis
  b.quad([-2.4, Y + 0.035, 1.35], [2.4, Y + 0.035, 1.35], [2.4, Y + 0.035, -3.6], [-2.4, Y + 0.035, -3.6], mulc(RED, 0.62), [0.10, 0.06], [0, 1, 0]);
  for (const sx of [-1, 1]) b.quad([sx * 2.4, Y + 0.045, 1.35], [sx * 2.72, Y + 0.045, 1.35], [sx * 2.72, Y + 0.045, -3.6], [sx * 2.4, Y + 0.045, -3.6], GOLD, M_GOLD, [0, 1, 0]);
  // low step down from the door sill into the garden
  put(b, 0, Y - 0.01, 1.55, () => box(b, 8.4, 0.06, 0.5, STONE_L, M_STONE));
}

// ---------------------------------------------------------------- pool
function pool(b, cx, cz, r) {
  const cy = Y;
  // basin: shallow marble kerb
  put(b, cx, cy, cz, () => {
    lathe(b, [[r - 0.6, 0], [r, 0.06], [r + 0.32, 0.34], [r + 0.30, 0.52], [r - 0.5, 0.42], [r - 0.6, 0.26]], 24, STONE_L, M_STONE);
    for (let i = 0; i < 24; i++) {
      const a0 = (i / 24) * TAU, a1 = ((i + 1) / 24) * TAU;
      b.quad([Math.cos(a0) * (r + 0.30), 0.52, Math.sin(a0) * (r + 0.30)], [Math.cos(a1) * (r + 0.30), 0.52, Math.sin(a1) * (r + 0.30)],
        [Math.cos(a1) * (r + 0.12), 0.52, Math.sin(a1) * (r + 0.12)], [Math.cos(a0) * (r + 0.12), 0.52, Math.sin(a0) * (r + 0.12)], GOLD_B, M_GOLD_B, [0, 1, 0]);
    }
  });
  discY(b, cx, cy + 0.30, cz, r - 0.6, 24, WATER, M_WATER);
  // lily pads
  const rng = mulberry32(SEED + 11);
  for (let i = 0; i < 11; i++) {
    const a = rng() * TAU, rr = (0.9 + rng() * 2.6);
    const lx = cx + Math.cos(a) * rr, lz = cz + Math.sin(a) * rr;
    discY(b, lx, cy + 0.325 + rng() * 0.02, lz, 0.32 + rng() * 0.3, 7, mixc(LEAF, LEAF_L, rng() * 0.7), M_LEAF_L);
    if (rng() > 0.55) put(b, lx, cy + 0.34, lz, () => {
      cylinder(b, 6, 0.10, 0.20, 0.16, PINK, M_BLOOM, { y0: 0, caps: true });
    });
  }
  // small fountain: two gold bowls + a water jet + glow
  put(b, cx, cy + 0.30, cz, () => {
    cylinder(b, 10, 0.42, 0.26, 1.7, STONE_L, M_STONE, { y0: 0, caps: true });
    cylinder(b, 14, 1.02, 0.80, 0.24, GOLD, M_GOLD, { y0: 1.66, caps: true });
    discY(b, 0, 1.80, 0, 0.86, 14, WATER, M_WATER);
    cylinder(b, 8, 0.16, 0.12, 1.15, GOLD_D, M_GOLD, { y0: 1.80, caps: true });
    cylinder(b, 10, 0.62, 0.46, 0.20, GOLD, M_GOLD, { y0: 2.92, caps: true });
    discY(b, 0, 3.04, 0, 0.50, 10, WATER, M_WATER);
    put(b, 0, 3.10, 0, () => star(b, 0.34, 0.14, 6, 0.14, GOLD_B, M_GOLD_B));
    // four small side jets
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.4;
      cylinder(b, 3, 0.05, 0.03, 1.0, GOLD_D, M_GOLD, { y0: 1.80, caps: false, x: 0, z: 0 });
      void a;
    }
  });
  if (ctxLanterns) ctxLanterns.push({ p: wp(cx, cy + 4.2, cz), size: 5.0, rot: 0, alpha: 0.42, shape: 1, col: GOLD_B });
}
let ctxLanterns = null;

// ---------------------------------------------------------------- plants
// one palm frond: curved spine + two rows of leaflets
function frond(b, base, a, len, lift, droop, colA, colB, leafN = 6, wSc = 1) {
  const dx = Math.cos(a), dz = Math.sin(a);
  const pts = [];
  for (let i = 0; i <= 5; i++) {
    const t = i / 5, rr = len * t;
    // never let a drooping frond poke through the floor
    pts.push([base[0] + dx * rr, Math.max(Y + 0.18, base[1] + lift * t - droop * t * t), base[2] + dz * rr]);
  }
  tubePath(b, pts, 0.05 * wSc, 3, colA, M_LEAF, { caps: false });
  for (let i = 1; i <= 5; i++) {
    const p = pts[i], q = pts[i - 1];
    const ux = p[0] - q[0], uy = p[1] - q[1], uz = p[2] - q[2];
    const ul = Math.hypot(ux, uy, uz) || 1;
    const sx = -dz, sz = dx;      // sideways
    for (const s of [-1, 1]) {
      const ll = (0.62 + 0.55 * (1 - i / 6)) * wSc;
      const tip = [p[0] + sx * s * ll, p[1] - 0.30 * ll, p[2] + sz * s * ll];
      const tip2 = [tip[0] + ux * 0.32, tip[1] - 0.10, tip[2] + uz * 0.32];
      const b0 = [p[0] + ux * 0.22, p[1] + uy * 0.22, p[2] + uz * 0.22];
      const b1 = [p[0] + ux * 0.72, p[1] + uy * 0.72, p[2] + uz * 0.72];
      b.quad(b0, tip, tip2, b1, mixc(colA, colB, i / 6), M_LEAF_L);
      void ul; void leafN;
    }
  }
}

function palm(b, lx, lz, h, rng, lean = 1.4, opt = {}) {
  const n = 6, bendA = rng() * TAU;
  const pts = [], radii = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([lx + Math.cos(bendA) * lean * t * t, Y + h * 0.80 * t, lz + Math.sin(bendA) * lean * t * t]);
    radii.push(0.36 - 0.15 * t);
  }
  tubePath(b, pts, radii, 5, TRUNK, M_TRUNK);
  // ring scars on the trunk
  for (let i = 1; i < n; i++) {
    put(b, pts[i][0], pts[i][1], pts[i][2], () => cylinder(b, 5, radii[i] + 0.05, radii[i] + 0.05, 0.08, TRUNK_D, M_TRUNK, { caps: false, y0: -0.04 }));
  }
  const top = pts[n];
  // keep the crown inside the glass drum: cap the frond length by the free radius
  const rc = Math.hypot(top[0], top[2] - CZ);
  const room = opt.inner != null ? Math.max(1.2, rc - opt.inner) : Math.max(1.4, 25.9 - rc);
  const cap = Math.min(h * 0.52, room * 0.96, opt.capMax || 6.6);
  const nf = 12;
  for (let f = 0; f < nf; f++) {
    const a = (f / nf) * TAU + rng() * 0.30;
    frond(b, top, a, Math.min(cap, h * (0.36 + rng() * 0.16)), 1.0 + rng() * 0.8, 2.2 + rng() * 1.5, LEAF, LEAF_L, 6, 1.05 + rng() * 0.3);
  }
  // second, smaller crown layer for a fuller silhouette
  for (let f = 0; f < 6; f++) {
    const a = (f / 6) * TAU + 0.5;
    frond(b, top, a, Math.min(cap * 0.6, h * (0.20 + rng() * 0.08)), 1.5, 1.2 + rng() * 0.6, LEAF_L, LEAF_Y, 5, 0.8);
  }
  // a couple of hanging dead fronds
  for (let f = 0; f < 2; f++) {
    const a = rng() * TAU;
    frond(b, top, a, h * 0.24, -0.2, 2.2, mulc(LEAF, 0.7), mulc(LEAF_Y, 0.8), 4, 0.8);
  }
  put(b, top[0], top[1] - 0.1, top[2], () => sphere(b, 0.34, LEAF_D, M_LEAF, { rings: 3, seg: 6, jitter: 0.2 }));
  if (ctxLanterns && rng() > 0.4) ctxLanterns.push({ p: wp(top[0], top[1] + 0.4, top[2]), size: 3.0 + rng() * 2.0, rot: rng() * TAU, alpha: 0.30, shape: 5, col: LEAF_L });
}

function treeFern(b, lx, lz, h, rng, opt = {}) {
  put(b, lx, Y + h * 0.16, lz, () => cylinder(b, 6, 0.30, 0.24, h * 0.32, TRUNK_D, M_TRUNK, { y0: 0, caps: true }));
  const top = [lx, Y + h * 0.32, lz];
  put(b, lx, top[1], lz, () => sphere(b, 0.5, LEAF_D, M_LEAF, { rings: 3, seg: 7, jitter: 0.3 }));
  const nf = 10;
  const rcF = Math.hypot(lx, lz - CZ);
  const roomF = opt.inner != null ? Math.max(1.0, rcF - opt.inner) : Math.max(1.1, 25.9 - rcF);
  for (let f = 0; f < nf; f++) {
    const a = (f / nf) * TAU + rng() * 0.5;
    frond(b, top, a, Math.min(roomF * 0.9, h * (0.55 + rng() * 0.2)), 0.55 + rng() * 0.5, 1.5 + rng() * 1.0, FERN, FERN_L, 5, 0.72);
  }
}

function banana(b, lx, lz, h, rng, opt = {}) {
  put(b, lx, Y + h * 0.22, lz, () => cylinder(b, 6, 0.26, 0.20, h * 0.44, TRUNK, M_TRUNK, { y0: 0, caps: true }));
  const top = [lx, Y + h * 0.46, lz];
  const nl = 6;
  const rcB = Math.hypot(lx, lz - CZ);
  const roomB = opt.inner != null ? Math.max(0.9, rcB - opt.inner) * 0.9 : 99;
  for (let i = 0; i < nl; i++) {
    const a = (i / nl) * TAU + rng() * 0.4;
    const dx = Math.cos(a), dz = Math.sin(a);
    const len = Math.min(roomB, h * (0.5 + rng() * 0.22)), wid = 0.62 + rng() * 0.2;
    const lift = 1.1 + rng() * 0.6;
    const sx = -dz, sz = dx;
    const mid = [top[0] + dx * len * 0.5, top[1] + lift, top[2] + dz * len * 0.5];
    const tip = [top[0] + dx * len, top[1] + lift * 0.55, top[2] + dz * len];
    const c0 = mixc(BANANA, BANANA_L, 0.3), c1 = mixc(BANANA, BANANA_L, 0.8);
    b.quad([top[0], top[1], top[2]],
      [mid[0] + sx * wid, mid[1], mid[2] + sz * wid],
      [tip[0] + sx * wid * 0.35, tip[1], tip[2] + sz * wid * 0.35], [tip[0], tip[1] + 0.1, tip[2]], c0, M_LEAF_L);
    b.quad([top[0], top[1], top[2]],
      [tip[0], tip[1] + 0.1, tip[2]],
      [tip[0] - sx * wid * 0.35, tip[1], tip[2] - sz * wid * 0.35],
      [mid[0] - sx * wid, mid[1], mid[2] - sz * wid], c1, M_LEAF_L);
    // midrib
    put(b, mid[0], mid[1] + 0.03, mid[2], () => box(b, 0.07, 0.07, 0.07, LEAF_D, M_LEAF));
  }
}

function bush(b, lx, lz, r, rng, tall = 1.0) {
  const n = 14 + Math.floor(rng() * 8);
  for (let i = 0; i < n; i++) {
    const a = rng() * TAU, rr = rng() * r;
    const y0 = Y + rng() * 0.5 * tall;
    const len = 0.55 + rng() * 0.75;
    const tip = [lx + Math.cos(a) * (rr + len), y0 + 0.5 + rng() * 0.8 * tall, lz + Math.sin(a) * (rr + len)];
    const w = 0.30 + rng() * 0.26;
    const sx = -Math.sin(a), sz = Math.cos(a);
    const mid = [lx + Math.cos(a) * rr, y0 + 0.3, lz + Math.sin(a) * rr];
    const cc = mixc(LEAF_D, LEAF_Y, rng() * 0.75);
    b.quad(mid, [tip[0] + sx * w, tip[1], tip[2] + sz * w], tip, [tip[0] - sx * w, tip[1], tip[2] - sz * w], cc, M_LEAF_L);
    b.quad(mid, [tip[0] - sx * w, tip[1], tip[2] - sz * w], tip, [tip[0] + sx * w, tip[1] + 0.05, tip[2] + sz * w], mixc(cc, LEAF_L, 0.4), M_LEAF_L);
  }
}

function flowerBed(b, lx, lz, r, rng) {
  put(b, lx, Y + 0.26, lz, () => {
    cylinder(b, 10, r, r, 0.52, STONE_L, M_STONE, { y0: 0, caps: true });
  });
  b.quad([lx - r, Y + 0.52, lz - r], [lx + r, Y + 0.52, lz - r], [lx + r, Y + 0.52, lz + r], [lx - r, Y + 0.52, lz + r], mulc(GOLD_B, 0.9), M_GOLD_B, [0, 1, 0]);
  const n = 26;
  const cols = [PINK, RED, YELLOW, WHITE_B, VIOLET, ORANGE];
  for (let i = 0; i < n; i++) {
    const a = rng() * TAU, rr = Math.sqrt(rng()) * (r - 0.25);
    const h = 0.30 + rng() * 0.55;
    const fx = lx + Math.cos(a) * rr, fz = lz + Math.sin(a) * rr;
    put(b, fx, Y + 0.52, fz, () => {
      cylinder(b, 3, 0.03, 0.03, h, LEAF_D, M_LEAF, { y0: 0, caps: false });
      const col = cols[Math.floor(rng() * cols.length)];
      cylinder(b, 4, 0.10, 0.22, 0.18, col, M_BLOOM, { y0: h - 0.05, caps: true });
    });
  }
  // foliage under the flowers
  const nb = 8;
  for (let i = 0; i < nb; i++) {
    const a = rng() * TAU, rr = Math.sqrt(rng()) * r;
    const wy = Y + 0.58;
    const sx = Math.cos(a) * 0.45, sz = Math.sin(a) * 0.45;
    b.quad([lx + Math.cos(a) * rr - sz, wy, lz + Math.sin(a) * rr + sx], [lx + Math.cos(a) * rr + sz, wy, lz + Math.sin(a) * rr - sx],
      [lx + Math.cos(a) * rr + sx * 1.4 + sz, wy + 0.5, lz + Math.sin(a) * rr + sz * 1.4 - sx],
      [lx + Math.cos(a) * rr + sx * 1.4 - sz, wy + 0.5, lz + Math.sin(a) * rr + sz * 1.4 + sx], LEAF_D, M_LEAF_L);
  }
}

// hanging orchid basket: iron ring + chains + leaves + blooms
function basket(b, lx, ly, lz, hangTo, rng) {
  put(b, lx, ly, lz, () => {
    torus(b, 0.62, 0.07, 10, 3, GOLD_D, M_GOLD, 'y');
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU;
      bar3(b, [Math.cos(a) * 0.6, 0, Math.sin(a) * 0.6], [0, hangTo - ly, 0], 0.055, 0.055, GOLD_D, M_GOLD);
    }
    // coir basket
    lathe(b, [[0.62, 0], [0.5, -0.16], [0.42, -0.24]], 9, TRUNK_D, M_TRUNK);
  });
  for (let i = 0; i < 7; i++) {
    const a = rng() * TAU;
    const dx = Math.cos(a), dz = Math.sin(a);
    const len = 0.55 + rng() * 0.5;
    b.quad([lx, ly, lz], [lx + dx * len, ly - 0.30 - rng() * 0.25, lz + dz * len],
      [lx + dx * len + 0.12, ly - 0.32 - rng() * 0.2, lz + dz * len], [lx + dx * 0.2, ly + 0.02, lz + dz * 0.2], mixc(LEAF, LEAF_L, rng()), M_LEAF_L);
  }
  for (let i = 0; i < 2; i++) {
    const a = rng() * TAU;
    put(b, lx + Math.cos(a) * 0.4, ly - 0.1, lz + Math.sin(a) * 0.4, () => {
      cylinder(b, 4, 0.05, 0.03, 0.4, LEAF_D, M_LEAF, { y0: -0.4, caps: false });
      cylinder(b, 5, 0.14, 0.16, 0.14, rng() > 0.5 ? PINK : VIOLET, M_BLOOM, { y0: 0, caps: true });
    });
  }
}

// vine hanging down from the dome ribs
function vine(b, lx, lz, yTop, yBot, rng) {
  const pts = [];
  const sway = rng() * TAU, n = 6;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([lx + Math.cos(sway) * 0.5 * t + Math.sin(t * 5 + sway) * 0.35, yTop - (yTop - yBot) * t, lz + Math.sin(sway) * 0.5 * t + Math.cos(t * 4 + sway) * 0.3]);
  }
  tubePath(b, pts, (t) => 0.075 * (1 - t * 0.4), 3, LEAF_D, M_LEAF);
  for (let i = 0; i < 9; i++) {
    const t = 0.15 + rng() * 0.8;
    const p = pts[Math.min(n, Math.floor(t * n))];
    const a = rng() * TAU;
    const lw = 0.22 + rng() * 0.18;
    b.quad([p[0], p[1], p[2]], [p[0] + Math.cos(a) * lw, p[1] - 0.12, p[2] + Math.sin(a) * lw],
      [p[0] + Math.cos(a) * lw * 1.4 + 0.1, p[1] + 0.04, p[2] + Math.sin(a) * lw * 1.4], [p[0] + 0.1, p[1] + 0.1, p[2]], mixc(LEAF, LEAF_L, rng()), M_LEAF_L);
  }
  if (rng() > 0.6) put(b, pts[n][0], pts[n][1] - 0.1, pts[n][2], () => {
    cylinder(b, 5, 0.10, 0.13, 0.14, rng() > 0.5 ? PINK : WHITE_B, M_BLOOM, { y0: 0, caps: true });
  });
}

// ---------------------------------------------------------------- furniture
function bench(b, lx, lz, yaw) {
  putR(b, lx, Y, lz, yaw, () => {
    put(b, 0, 0.46, 0, () => box(b, 3.2, 0.14, 0.72, STONE_L, M_STONE));
    put(b, 0, 0.30, 0, () => box(b, 2.6, 0.30, 0.44, IRON, M_IRON));
    for (const sx of [-1, 1]) {
      put(b, sx * 1.42, 0.26, 0, () => box(b, 0.22, 0.52, 0.66, IRON, M_IRON));
      put(b, sx * 1.5, 0.72, -0.42, () => box(b, 0.16, 1.4, 0.16, IRON, M_IRON));
    }
    put(b, 0, 1.34, -0.42, () => box(b, 3.0, 0.20, 0.14, IRON, M_IRON));
    for (let i = -1; i <= 1; i++) put(b, i * 0.8, 1.0, -0.4, () => box(b, 0.1, 0.62, 0.1, IRON, M_IRON));
  });
}

function lamp(b, lx, lz, rng) {
  put(b, lx, Y, lz, () => {
    cylinder(b, 8, 0.30, 0.22, 0.30, STONE_L, M_STONE, { y0: 0, caps: true });
    cylinder(b, 6, 0.11, 0.09, 2.2, IRON, M_IRON, { y0: 0.30, caps: false });
    put(b, 0, 2.62, 0, () => {
      cylinder(b, 6, 0.34, 0.16, 0.5, GOLD_D, M_GOLD, { y0: 0, caps: true });
      cylinder(b, 6, 0.20, 0.26, 0.66, GOLD_B, M_GLOW, { y0: 0.5, caps: true });
      cylinder(b, 6, 0.30, 0.12, 0.16, GOLD, M_GOLD, { y0: 1.16, caps: true });
    });
  });
  if (ctxLanterns) ctxLanterns.push({ p: wp(lx, Y + 3.4, lz), size: 3.4 + rng() * 1.2, rot: rng() * TAU, alpha: 0.55, shape: 1, col: rng() > 0.5 ? GOLD_B : C.cityGlow });
}

function butterfly(b, lx, ly, lz, rng) {
  const s = 0.16 + rng() * 0.10;
  const col = [PINK, GOLD_B, WHITE_B, VIOLET, YELLOW][Math.floor(rng() * 5)];
  const fl = 0.5 + rng() * 0.8;
  for (const sx of [-1, 1]) {
    b.tri([lx, ly, lz], [lx + sx * s, ly + s * fl, lz + s * 0.4], [lx + sx * s * 0.7, ly - s * 0.3, lz + s * 0.5], col, M_BLOOM);
  }
}

// ---------------------------------------------------------------- iron arcade
function arcade(b) {
  const N = 16, R = 22.6, beamY = 36.0;
  const cols = [];
  for (let k = 0; k < N; k++) {
    const a = 0.196 + (k / N) * TAU;
    cols.push([px(a, R), pz(a, R), a]);
  }
  for (const c of cols) {
    put(b, c[0], Y, c[1], () => {
      put(b, 0, 0.30, 0, () => box(b, 0.86, 0.6, 0.86, STONE_L, M_STONE));
      cylinder(b, 10, 0.30, 0.24, beamY - Y - 0.9, GOLD_D, M_GOLD, { y0: 0.6, caps: false });
      // fluting
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        bar3(b, [Math.cos(a) * 0.27, 0.7, Math.sin(a) * 0.27], [Math.cos(a) * 0.22, beamY - Y - 0.5, Math.sin(a) * 0.22], 0.06, 0.05, GOLD, M_GOLD);
      }
      put(b, 0, beamY - Y - 0.2, 0, () => {
        cylinder(b, 10, 0.34, 0.5, 0.34, GOLD, M_GOLD, { y0: 0, caps: true });
        box(b, 1.1, 0.22, 1.1, GOLD_B, M_GOLD_B);
      });
      // scroll brackets
      for (const sx of [-1, 1]) put(b, sx * 0.42, beamY - Y - 0.5, 0, () => box(b, 0.5, 0.5, 0.2, GOLD, M_GOLD));
    });
  }
  // arches between neighbouring columns
  for (let k = 0; k < N; k++) {
    const c0 = cols[k], c1 = cols[(k + 1) % N];
    const mx = (c0[0] + c1[0]) / 2, mz = (c0[1] + c1[1]) / 2;
    const span = Math.hypot(c1[0] - c0[0], c1[1] - c0[1]);
    const yaw = Math.atan2(-(c1[1] - c0[1]), c1[0] - c0[0]);
    putR(b, mx, 0, mz, yaw, () => {
      const archY = beamY - 0.4, rr = span * 0.46, seg = 6;
      let prev = null;
      for (let i = 0; i <= seg; i++) {
        const t = i / seg;
        const ang = Math.PI * t;
        const xx = Math.cos(ang) * rr;
        const yy = archY - 1.35 + Math.sin(ang) * rr * 0.62;
        const pt = [xx, yy];
        if (prev) {
          bar3(b, [prev[0], prev[1], -0.09], [pt[0], pt[1], -0.09], 0.16, 0.22, GOLD, M_GOLD);
          bar3(b, [prev[0], prev[1], 0.09], [pt[0], pt[1], 0.09], 0.16, 0.22, GOLD, M_GOLD);
        }
        prev = pt;
      }
    });
  }
  // ring beam
  put(b, 0, beamY, 0, () => {
    for (let k = 0; k < N; k++) {
      const a0 = (k / N) * TAU, a1 = ((k + 1) / N) * TAU;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      b.quad([c0 * (R - 0.16), 0, CZ + s0 * (R - 0.16)], [c1 * (R - 0.16), 0, CZ + s1 * (R - 0.16)],
        [c1 * (R - 0.16), 0.5, CZ + s1 * (R - 0.16)], [c0 * (R - 0.16), 0.5, CZ + s0 * (R - 0.16)], GOLD, M_GOLD, [0, 0, -1]);
      b.quad([c0 * (R + 0.16), 0.5, CZ + s0 * (R + 0.16)], [c1 * (R + 0.16), 0.5, CZ + s1 * (R + 0.16)],
        [c1 * (R + 0.16), 0, CZ + s1 * (R + 0.16)], [c0 * (R + 0.16), 0, CZ + s0 * (R + 0.16)], GOLD, M_GOLD, [0, 0, 1]);
      b.quad([c0 * (R - 0.2), 0.5, CZ + s0 * (R - 0.2)], [c1 * (R - 0.2), 0.5, CZ + s1 * (R - 0.2)],
        [c1 * (R + 0.2), 0.5, CZ + s1 * (R + 0.2)], [c0 * (R + 0.2), 0.5, CZ + s0 * (R + 0.2)], GOLD_B, M_GOLD_B, [0, 1, 0]);
      // radial beams to the drum wall
      if (k % 2 === 0) {
        const am = (a0 + a1) / 2;
        bar3(b, [Math.cos(am) * R, 0.3, CZ + Math.sin(am) * R], [Math.cos(am) * (RIN - 0.1), 1.3, CZ + Math.sin(am) * (RIN - 0.1)], 0.20, 0.24, GOLD_D, M_GOLD);
      }
    }
  });
  // upper gallery ring at the drum top (y 56)
  const gy = 55.6;
  put(b, 0, gy, 0, () => {
    for (let k = 0; k < N; k++) {
      const a0 = (k / N) * TAU, a1 = ((k + 1) / N) * TAU;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const r0 = R + 1.2, r1 = RIN - 0.1;
      b.quad([c0 * r0, 0, CZ + s0 * r0], [c1 * r0, 0, CZ + s1 * r0], [c1 * r1, 0, CZ + s1 * r1], [c0 * r1, 0, CZ + s0 * r1], mulc(GOLD, 0.9), M_GOLD, [0, 1, 0]);
      b.quad([c0 * r0, -0.5, CZ + s0 * r0], [c1 * r0, -0.5, CZ + s1 * r0], [c1 * r0, 0, CZ + s1 * r0], [c0 * r0, 0, CZ + s0 * r0], GOLD_D, M_GOLD, [c0, 0, s0]);
    }
    // gold brackets under the gallery
    for (let k = 0; k < N; k++) {
      const a = (k / N) * TAU;
      bar3(b, [Math.cos(a) * (R + 1.1), -1.4, CZ + Math.sin(a) * (R + 1.1)], [Math.cos(a) * (R + 0.2), -0.1, CZ + Math.sin(a) * (R + 0.2)], 0.18, 0.2, GOLD, M_GOLD);
    }
  });
}


// ---------------------------------------------------------------- exterior band
// Round 6b: a dense tropical band on the podium roof around the drum plus hanging
// greenery on the drum base, so the palm house reads as a plant house from the
// terrace and the air instead of a pale blue glass cylinder.  Called by
// landmark.js buildGlassPalace (palace-local frame), uses its own rng.
export function buildGlassRoofGarden(b, ctx) {
  const rng = mulberry32(SEED + 771);
  const ROOF = 21.15;
  const INNER = 27.75;               // fronds may overhang the drum-base cornice a little
  const planter = (lx, lz, w, d) => {
    put(b, lx, ROOF + 0.55, lz, () => {
      box(b, w, 1.1, d, STONE_WARM, M_STONE);
      box(b, w + 0.20, 0.16, d + 0.20, GOLD_B, M_GOLD_B);
      box(b, w - 0.5, 0.10, d - 0.5, TRUNK_D, M_TRUNK);
    });
  };
  // tall palms: crowns rise 8-12 m above the roof, above the drum-base eave
  const palmSpots = [
    [-21.5, -2.5, 11.5], [21.5, -2.5, 12.0], [-27.0, -1.5, 10.0], [27.0, -1.5, 10.5],
    [-33.0, -9.0, 13.0], [33.0, -9.0, 12.5], [-35.0, -22.0, 11.0], [35.0, -22.0, 11.5],
    [-33.0, -34.0, 12.0], [33.0, -34.0, 11.5], [-24.0, -44.0, 10.0], [24.0, -44.0, 10.5],
    [-37.0, -4.0, 10.0], [37.0, -4.0, 10.5], [-36.0, -28.0, 12.0], [36.0, -28.0, 11.5],
    [-28.0, -47.0, 9.5], [28.0, -47.0, 10.0],
  ];
  for (const p of palmSpots) {
    planter(p[0], p[1], 2.7, 2.3);
    palm(b, p[0], p[1], p[2], rng, 0.7 + rng() * 1.5, { inner: INNER, capMax: 6.0 });
  }
  // tree ferns + bananas fill the gaps
  const fernSpots = [[-19, -2.0], [19, -2.0], [-31, -16], [31, -16], [-30, -38], [30, -38], [-26, -45], [26, -45],
    [-30, -5.5], [30, -5.5], [-34, -45], [34, -45], [-23, -11], [23, -11]];
  for (const p of fernSpots) treeFern(b, p[0], p[1], 3.4 + rng() * 2.2, rng, { inner: INNER });
  const bananaSpots = [[-18, -2.2], [18, -2.2], [-33, -4], [33, -4], [-36, -16], [36, -16], [-32, -30], [32, -30], [-27, -42], [27, -42],
    [-22, -6.5], [22, -6.5], [-38, -36], [38, -36]];
  for (const p of bananaSpots) banana(b, p[0], p[1], 2.8 + rng() * 1.6, rng, { inner: INNER });
  // low tropical undergrowth, the bulk of the green ring
  for (let i = 0; i < 44; i++) {
    const a = rng() * TAU;
    const rc = 29.2 + rng() * 8.0;
    const lx = Math.cos(a) * rc, lz = CZ + Math.sin(a) * rc;
    if (Math.abs(lx) > 37.5 || lz < -49.5 || lz > 1.0) continue;
    if (lz > -3.0 && Math.abs(lx) < 13.5) continue;        // keep the porch axis readable
    bush(b, lx, lz, 0.9 + rng() * 1.1, rng, 1.0 + rng() * 0.7);
  }
  // big flower beds at the front and on both flanks
  const beds = [[-22.5, -1.4, 2.4], [22.5, -1.4, 2.4], [-34, -12.5, 2.2], [34, -12.5, 2.2], [-33, -29, 2.2], [33, -29, 2.2], [-27, -43, 2.0], [27, -43, 2.0],
    [-26.0, -6.5, 1.9], [26.0, -6.5, 1.9], [-36.5, -18.0, 1.9], [36.5, -18.0, 1.9], [-31.0, -24.5, 1.8], [31.0, -24.5, 1.8]];
  for (const s of beds) flowerBed(b, s[0], s[1], s[2], rng);
  // ground cover on the podium roof between the beds
  const patch = (col, mat, n, rMin, rMax) => {
    for (let i = 0; i < n; i++) {
      const a = rng() * TAU, rc = rMin + rng() * (rMax - rMin);
      const lx = Math.cos(a) * rc, lz = CZ + Math.sin(a) * rc;
      if (Math.abs(lx) > 38 || lz < -50 || lz > 1.1) continue;
      discY(b, lx, ROOF + 0.012, lz, 1.0 + rng() * 2.3, 9, col, mat);
    }
  };
  for (let i = 0; i < 26; i++) {
    const a = rng() * TAU, rc = 28.9 + rng() * 9.6;
    const lx = Math.cos(a) * rc, lz = CZ + Math.sin(a) * rc;
    if (Math.abs(lx) > 38 || lz < -50 || lz > 1.1) continue;
    discY(b, lx, ROOF + 0.012, lz, 1.0 + rng() * 2.3, 9, mixc(MOSS_D, MOSS, rng()), [0.13, 0.08]);
  }
  for (let i = 0; i < 14; i++) {
    const a = rng() * TAU, rc = 29.0 + rng() * 9.2;
    const lx = Math.cos(a) * rc, lz = CZ + Math.sin(a) * rc;
    if (Math.abs(lx) > 38 || lz < -50 || lz > 1.1) continue;
    discY(b, lx, ROOF + 0.010, lz, 0.8 + rng() * 1.8, 8, mixc(GRAVEL, STONE_F2, rng()), [0.10, 0.10]);
  }
  void patch;
  // climbing / hanging greenery on the drum base wall (r 27.4-27.9, y 21.4-24.6)
  const aDoor = Math.asin(3.8 / 27.45);
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * TAU + 0.09;
    const dd = Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2));
    if (Math.abs(dd) < aDoor + 0.10) continue;
    const lx = Math.cos(a) * 27.55, lz = CZ + Math.sin(a) * 27.55;
    vine(b, lx, lz, 24.2 + rng() * 0.9, 21.4 + rng() * 0.6, rng);
    if (ctx && ctx.lanterns) {
      ctx.lanterns.push({ p: wp(lx, 24.15, lz), size: 2.5 + rng() * 1.3, rot: rng() * TAU, alpha: 0.92, shape: 5, col: rng() > 0.45 ? LEAF_L : LEAF });
    }
  }
  // hanging tufts under the loggia sills, visible from the terrace below
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU + 0.2;
    const dd = Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2));
    if (Math.abs(dd) < aDoor + 0.14) continue;
    const lx = Math.cos(a) * 27.9, lz = CZ + Math.sin(a) * 27.9;
    if (ctx && ctx.lanterns) {
      ctx.lanterns.push({ p: wp(lx, 23.6, lz), size: 3.0 + rng() * 1.6, rot: rng() * TAU, alpha: 0.95, shape: 5, col: rng() > 0.5 ? LEAF : LEAF_L });
    }
    if (rng() > 0.5) vine(b, lx, lz, 23.9, 21.8, rng);
  }
  // a couple of tall palms on the front edge of the roof to green the facade
  for (const sx of [-1, 1]) {
    planter(sx * 31.5, 0.0, 2.6, 2.2);
    palm(b, sx * 31.5, 0.0, 9.0, rng, 0.6 + rng(), { inner: INNER, capMax: 5.6 });
  }
  // painted foliage clumps between the modelled plants: volume at a distance
  if (ctx && ctx.lanterns) {
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * TAU + 0.07;
      const rc = 29.6 + ((i % 4) * 1.7) + rng() * 1.4;
      const lx = Math.cos(a) * rc, lz = CZ + Math.sin(a) * rc;
      if (Math.abs(lx) > 37.5 || lz < -49.5 || lz > 0.8) continue;
      ctx.lanterns.push({ p: wp(lx, 22.6 + rng() * 1.8, lz), size: 3.6 + rng() * 2.2, rot: rng() * TAU, alpha: 0.92, shape: 5, col: rng() > 0.45 ? LEAF_L : LEAF });
    }
  }
}

// ---------------------------------------------------------------- build
export function buildGlassGreenhouse(b, ctx) {
  const rng = mulberry32(SEED);
  ctxLanterns = (ctx && ctx.lanterns) || null;
  const L2 = { points: (ctx && ctx.points) || null };

  try {
    floorWithHole(b);
    innerPlinth(b);
    wellCurb(b);
    vestibule(b);
    // ferns and flowers spilling over the long edges of the glazed ridge well
    for (let i = 0; i < 8; i++) {
      const zz = HOLE.z1 - 1.6 - i * 4.1;
      for (const sx of [-1, 1]) {
        bush(b, sx * (HOLE.x + 1.75), zz, 0.55 + rng() * 0.35, rng, 0.8 + rng() * 0.5);
      }
    }
    for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) {
      flowerBed(b, sx * (HOLE.x + 1.5), HOLE.z1 - 2.6 - i * 8.2, 0.85, rng);
    }

    // stone kerb / planting borders around the drum inner wall
    const kerb = 1.15;
    const segK = 40;
    for (let i = 0; i < segK; i++) {
      const a0 = (i / segK) * TAU, a1 = ((i + 1) / segK) * TAU;
      const am = (a0 + a1) / 2;
      // skip the entrance sector
      if (Math.abs(Math.atan2(Math.sin(am - Math.PI / 2), Math.cos(am - Math.PI / 2))) < 0.19) continue;
      const r0 = RIN - kerb, r1 = RIN - 0.06;
      b.quad([Math.cos(a0) * r0, Y + 0.16, CZ + Math.sin(a0) * r0], [Math.cos(a1) * r0, Y + 0.16, CZ + Math.sin(a1) * r0],
        [Math.cos(a1) * r1, Y + 0.16, CZ + Math.sin(a1) * r1], [Math.cos(a0) * r1, Y + 0.16, CZ + Math.sin(a0) * r1], mulc(STONE_WARM, 0.95), M_STONE, [0, 1, 0]);
      const ra = Math.cos(a0) * r0, rb = Math.sin(a0) * r0, rc = Math.cos(a1) * r0, rd = Math.sin(a1) * r0;
      b.quad([ra, Y, CZ + rb], [rc, Y, CZ + rd], [rc, Y + 0.16, CZ + rd], [ra, Y + 0.16, CZ + rb], mulc(STONE_L, 0.9), M_STONE, [Math.cos(am), 0, Math.sin(am)]);
    }

    // moss / gravel patches on the side gardens
    for (let i = 0; i < 14; i++) {
      const a = rng() * TAU, rr = 12 + rng() * 12;
      const lx = px(a, rr), lz = pz(a, rr);
      if (Math.abs(lx) < HOLE.x + 1 && lz > HOLE.z0 - 1 && lz < HOLE.z1 + 1) continue;
      discY(b, lx, Y + 0.015, lz, 1.2 + rng() * 2.2, 9, mixc(MOSS, MOSS_D, rng() * 0.7), [0.13, 0.08]);
    }
    for (let i = 0; i < 10; i++) {
      const a = rng() * TAU, rr = 13 + rng() * 11;
      const lx = px(a, rr), lz = pz(a, rr);
      if (Math.abs(lx) < HOLE.x + 1 && lz > HOLE.z0 - 1 && lz < HOLE.z1 + 1) continue;
      discY(b, lx, Y + 0.012, lz, 0.9 + rng() * 1.8, 8, mixc(GRAVEL, STONE_F2, rng() * 0.6), [0.10, 0.12]);
    }

    // stone paths: entrance axis, a ring around the well, and side walks
    flatQuad(b, [[-2.2, 1.4], [2.2, 1.4], [2.2, -4.4], [-2.2, -4.4]], mulc(STONE_L, 1.02), [0.14, 0.30], Y + 0.03);
    for (let i = 0; i < 40; i++) {
      const a0 = (i / 40) * TAU, a1 = ((i + 1) / 40) * TAU;
      const r0 = 13.2, r1 = 15.0;
      b.quad([Math.cos(a0) * r0, Y + 0.028, CZ + Math.sin(a0) * r0], [Math.cos(a1) * r0, Y + 0.028, CZ + Math.sin(a1) * r0],
        [Math.cos(a1) * r1, Y + 0.028, CZ + Math.sin(a1) * r1], [Math.cos(a0) * r1, Y + 0.028, CZ + Math.sin(a0) * r1], mulc(STONE_L, 0.98), [0.13, 0.28], [0, 1, 0]);
    }
    for (const sx of [-1, 1]) {
      const w = 1.6;
      b.quad([sx * 2.4, Y + 0.03, -4.4], [sx * (2.4 + w), Y + 0.03, -4.4], [sx * (16.4 + w), Y + 0.03, -24], [sx * 16.4, Y + 0.03, -24], mulc(STONE_L, 0.99), [0.13, 0.28], [0, 1, 0]);
    }

    // central lily pool in the front garden
    pool(b, 0, -6.4, 4.3);

    // arcade + gallery
    arcade(b);

    // ---- planting -----------------------------------------------------
    // tall palms around the side gardens, a few framing the entrance
    const palmSpots = [
      [-15.0, -20.0, 17.5], [15.0, -20.0, 18.2], [-17.0, -32.0, 19.4], [17.0, -32.0, 18.6],
      [-12.0, -12.0, 14.2], [12.0, -12.0, 14.8], [-20.0, -24.0, 12.6], [20.0, -24.0, 13.0],
      [-10.0, -40.0, 15.4], [10.0, -40.0, 15.8], [-6.0, -16.0, 11.4], [6.0, -16.0, 11.8],
      [-13.0, -30.0, 13.9], [13.0, -30.0, 13.5], [-8.0, -44.0, 12.6], [8.0, -44.0, 12.2],
    ];
    for (const p of palmSpots) palm(b, p[0], p[1], p[2], rng, 1.0 + rng() * 1.6);
    // tree ferns + bananas in the understorey
    for (let i = 0; i < 14; i++) {
      const a = rng() * TAU, rr = 14 + rng() * 9;
      const lx = px(a, rr), lz = pz(a, rr);
      if (Math.abs(lx) < HOLE.x + 1.5 && lz > HOLE.z0 - 1.5 && lz < HOLE.z1 + 1.5) continue;
      treeFern(b, lx, lz, 3.2 + rng() * 2.4, rng);
    }
    for (let i = 0; i < 12; i++) {
      const a = rng() * TAU, rr = 13 + rng() * 10;
      const lx = px(a, rr), lz = pz(a, rr);
      if (Math.abs(lx) < HOLE.x + 1.5 && lz > HOLE.z0 - 1.5 && lz < HOLE.z1 + 1.5) continue;
      banana(b, lx, lz, 2.6 + rng() * 1.8, rng);
    }
    for (let i = 0; i < 20; i++) {
      const a = rng() * TAU, rr = 11 + rng() * 11;
      const lx = px(a, rr), lz = pz(a, rr);
      if (Math.abs(lx) < HOLE.x + 1.2 && lz > HOLE.z0 - 1.2 && lz < HOLE.z1 + 1.2) continue;
      bush(b, lx, lz, 0.8 + rng() * 0.9, rng, 1.0 + rng() * 0.8);
    }
    // flower beds on the front and side gardens
    const bedSpots = [[-7.6, -1.0, 1.5], [7.6, -1.0, 1.5], [-11.0, -10.4, 1.9], [11.0, -10.4, 1.9], [-17.2, -13.2, 1.7], [17.2, -13.2, 1.7], [-9.2, -46.2, 1.6], [9.2, -46.2, 1.6], [-24.0, -36.0, 1.5], [24.0, -36.0, 1.5]];
    for (const s of bedSpots) flowerBed(b, s[0], s[1], s[2], rng);

    // hanging orchid baskets under the gallery and from the arcade
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + 0.4;
      basket(b, px(a, 17.5), 33.8, pz(a, 17.5), 36.3, rng);
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.9;
      basket(b, px(a, 9.0), 48.5, pz(a, 9.0), 55.5, rng);
    }
    // vines hanging from the drum/ dome
    for (let i = 0; i < 10; i++) {
      const a = rng() * TAU, rr0 = 10 + rng() * 12;
      // round 9: steer the creepers clear of the observatory's star-gazing ring
      // (r 17.2..20.0 at y 53.4) so no vine pierces the deck; rng draws are unchanged
      const rr = (rr0 > 15.6 && rr0 < 21.5)
        ? (rr0 < 18.5 ? 14.4 - (rr0 - 15.6) * 0.4 : 22.3 + (rr0 - 18.5) * 0.5)
        : rr0;
      vine(b, px(a, rr), pz(a, rr), 46.0 + rng() * 8, 30 + rng() * 10, rng);
    }

    // benches + lamps
    bench(b, -13.0, -8.0, -0.4); bench(b, 13.0, -8.0, 0.4);
    bench(b, -6.0, -20.5, 1.2); bench(b, 6.0, -20.5, -1.2);
    bench(b, -13.5, -37.0, 2.4); bench(b, 13.5, -37.0, -2.4);
    const lamps = [[-5.2, -3.4], [5.2, -3.4], [-12.4, -16.4], [12.4, -16.4], [-9.8, -30.0], [9.8, -30.0], [-6.0, -41.0], [6.0, -41.0]];
    for (const p of lamps) lamp(b, p[0], p[1], rng);

    // butterflies
    for (let i = 0; i < 16; i++) {
      const a = rng() * TAU, rr = 6 + rng() * 16;
      butterfly(b, px(a, rr), Y + 3 + rng() * 12, pz(a, rr), rng);
    }

    // ---- lights ------------------------------------------------------
    if (ctx && ctx.points) {
      const pts = [
        [0, 24.4, -2.2, C.cityGlow, 26, 0.72],
        [0, 23.6, -6.4, GOLD_B, 28, 0.60],
        [-16.0, 25.2, -24.0, GOLD_B, 32, 0.55],
        [16.0, 25.2, -24.0, GOLD_B, 32, 0.55],
        [0, 26.0, -43.5, C.cityGlow, 30, 0.60],
      ];
      for (const p of pts) ctx.points.push({ p: wp(p[0], p[1], p[2]), col: p[3], range: p[4], int: p[5] });
    }
    // warm hanging lanterns + mist
    if (ctx && ctx.lanterns) {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU + 0.3;
        ctx.lanterns.push({ p: wp(px(a, 15.0), 32.0 + (i % 2) * 1.2, pz(a, 15.0)), size: 3.2, rot: 0, alpha: 0.5, shape: 1, col: i % 3 === 0 ? WHITE_B : GOLD_B });
      }
      for (let i = 0; i < 6; i++) {
        const a = rng() * TAU, rr = 8 + rng() * 15;
        ctx.lanterns.push({ p: wp(px(a, rr), Y + 1.6 + rng() * 3.0, pz(a, rr)), size: 6 + rng() * 4, rot: rng() * TAU, alpha: 0.055, shape: 6, col: rgb('#eaf6ff') });
      }
      for (let i = 0; i < 6; i++) {
        const a = rng() * TAU, rr = 10 + rng() * 12;
        ctx.lanterns.push({ p: wp(px(a, rr), Y + 6 + rng() * 10, pz(a, rr)), size: 2.2, rot: 0, alpha: 0.36, shape: 0, col: mixc(GOLD_B, WHITE_B, rng()) });
      }
    }
  } finally {
    void L2;
  }
}

// ---------------------------------------------------------------- stats hook
export const GH = { Y, CZ, RIN, HOLE, SEED };
