// PALACE FORECOURT — round 5 (lead). The ceremonial approach on the belvedere deck:
// red carpet with a gold border from the terrace edge into the portico, four velvet
// banners hanging from the portico entablature, gilt braziers, marble halberdier guards
// flanking the portal, and flower urns along the facade. Purely additive dressing of the
// existing terrace level (y = 30); it makes the palace's first-floor entrance ceremonial.
import { C } from './palette.js';
import { PC, PM, pAt, pBox, YAW } from './palace-plan.js';
import { box, cylinder, mulc, mixc, bar3 } from './geo.js';
import { ellipsoid } from './lib3d.js';
import { mulberry32, TAU } from './math.js';

const DECK = 30;
const PORTZ = 118.6;          // portico column line
const FZ = 124;               // palace facade

const CARPET = mixc(C.bloomRed, C.stoneDark, 0.34);
const CARPET_D = mulc(CARPET, 0.78);
const VELVET = mixc(C.slateDark, C.zenith, 0.42);
const VELVET_HI = mixc(VELVET, C.slateLight, 0.22);
const GOLD = C.gold, GOLD_B = C.goldBright;

function at(b, x, y, z, yaw, fn) {
  pAt(b, x, y, z, yaw, fn);
}

// ------------------------------------------------------------------ carpet
function carpet(b) {
  const y = DECK + 0.06;
  const hw = 2.7, gold = 0.26;
  const z0 = 105.5, z1 = FZ - 0.4;
  // deep red field
  b.quad([-hw, y, z0], [hw, y, z0], [hw, y, z1], [-hw, y, z1], CARPET, PM.cloth, [0, 1, 0]);
  // darker inner border + gold outer border (flat strips)
  for (const s of [-1, 1]) {
    b.quad([s * (hw - 0.62), y + 0.004, z0], [s * (hw - 0.30), y + 0.004, z0],
      [s * (hw - 0.30), y + 0.004, z1], [s * (hw - 0.62), y + 0.004, z1], CARPET_D, PM.cloth, [0, 1, 0]);
    b.quad([s * (hw - gold), y + 0.008, z0], [s * hw, y + 0.008, z0],
      [s * hw, y + 0.008, z1], [s * (hw - gold), y + 0.008, z1], GOLD, PM.gold, [0, 1, 0]);
  }
  // end bands
  for (const z of [z0, z1]) {
    b.quad([-hw, y + 0.01, z - 0.20], [hw, y + 0.01, z - 0.20], [hw, y + 0.01, z + 0.20], [-hw, y + 0.01, z + 0.20], GOLD, PM.gold, [0, 1, 0]);
  }
  // central medallion (sunburst)
  at(b, 0, y + 0.012, 114.4, 0, () => {
    const seg = 20;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
      const col = i % 2 ? GOLD : CARPET_D;
      b.tri([0, 0, 0], [Math.cos(a0) * 2.0, 0, Math.sin(a0) * 2.0], [Math.cos(a1) * 2.0, 0, Math.sin(a1) * 2.0], col, i % 2 ? PM.gold : PM.cloth, [0, 1, 0], [0, 1, 0], [0, 1, 0]);
    }
    // inner dark ring + gold boss
    for (let i = 0; i < 16; i++) {
      const a0 = (i / 16) * TAU, a1 = ((i + 1) / 16) * TAU;
      b.tri([0, 0.004, 0], [Math.cos(a0) * 0.95, 0.004, Math.sin(a0) * 0.95], [Math.cos(a1) * 0.95, 0.004, Math.sin(a1) * 0.95], GOLD, PM.gold, [0, 1, 0], [0, 1, 0], [0, 1, 0]);
      b.tri([0, 0.006, 0], [Math.cos(a0) * 0.62, 0.006, Math.sin(a0) * 0.62], [Math.cos(a1) * 0.62, 0.006, Math.sin(a1) * 0.62], VELVET, PM.cloth, [0, 1, 0], [0, 1, 0], [0, 1, 0]);
    }
    b.tri([0, 0.009, 0], [Math.cos(0) * 0.30, 0.009, Math.sin(0) * 0.30], [Math.cos(2.1) * 0.30, 0.009, Math.sin(2.1) * 0.30], GOLD_B, PM.gold, [0, 1, 0], [0, 1, 0], [0, 1, 0]);
  });
}

// ------------------------------------------------------------------ banners
function banner(b, x) {
  // translate the whole banner to its bay; the body is written in world coords
  pAt(b, x, 0, 0, 0, () => {
  const top = 45.7, bot = 36.2;
  const z = PORTZ - 0.72;
  const hw = 1.25;
  const seg = 6;
  const sway = (t) => Math.sin(t * Math.PI) * 0.10;
  for (let i = 0; i < seg; i++) {
    const t0 = i / seg, t1 = (i + 1) / seg;
    const y0 = top + (bot - top) * t0, y1 = top + (bot - top) * t1;
    const p0 = [-hw + sway(t0), y0, z + 0.02 * Math.sin(t0 * 3)];
    const p1 = [hw + sway(t0), y0, z + 0.02 * Math.sin(t0 * 3)];
    const p2 = [hw + sway(t1), y1, z + 0.02 * Math.sin(t1 * 3)];
    const p3 = [-hw + sway(t1), y1, z + 0.02 * Math.sin(t1 * 3)];
    const cc = mixc(VELVET, VELVET_HI, i % 2 ? 0.18 : 0.0);
    b.quad(p0, p1, p2, p3, cc, PM.cloth, [0, 0, -1]);
  }
  // gold fringe along the bottom edge
  const yF = bot;
  for (let i = 0; i < 7; i++) {
    const fx = -hw + (i + 0.5) * (hw * 2 / 7);
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, fx, yF - 0.22, z, 1]);
    box(b, 0.12, 0.46, 0.10, GOLD_B, PM.gold);
    b.pop();
  }
  // gold rod + finials
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, top + 0.16, z, 1]);
  cylinder(b, 8, 0.09, 0.09, hw * 2 + 0.9, GOLD, PM.gold, { caps: true, y0: 0 });
  b.pop();
  for (const s of [-1, 1]) {
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, s * (hw + 0.5), top + 0.16, z, 1]);
    ellipsoid(b, 0.16, 0.2, 0.16, 6, 4, GOLD_B, PM.gold);
    b.pop();
  }
  // embroidered gold sun + fringe border down the sides
  at(b, 0, top - 3.4, z - 0.04, 0, () => {
    const seg = 12;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
      b.tri([0, 0, 0], [Math.cos(a0) * 0.62, Math.sin(a0) * 0.62, 0], [Math.cos(a1) * 0.62, Math.sin(a1) * 0.62, 0], GOLD, PM.gold, [0, 0, -1], [0, 0, -1], [0, 0, -1]);
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      b.quad([Math.cos(a) * 0.75, Math.sin(a) * 0.75, 0], [Math.cos(a + 0.16) * 0.75, Math.sin(a + 0.16) * 0.75, 0],
        [Math.cos(a + 0.16) * 1.45, Math.sin(a + 0.16) * 1.45, 0], [Math.cos(a) * 1.45, Math.sin(a) * 1.45, 0], GOLD_B, PM.gold, [0, 0, -1]);
    }
    b.tri([-0.22, 0, 0], [0.22, 0, 0], [0, -0.38, 0], GOLD_B, PM.gold, [0, 0, -1], [0, 0, -1], [0, 0, -1]);
  });
  for (const s of [-1, 1]) {
    b.quad([s * hw, top, z], [s * (hw - 0.14), top, z], [s * (hw - 0.14), bot, z], [s * hw, bot, z], GOLD, PM.gold, [0, 0, -1]);
  }
  });
}

// ------------------------------------------------------------------ braziers
function brazier(b, ctx, x, z) {
  at(b, x, DECK, z, 0, () => {
    // three gilt legs + basin
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU;
      bar3(b, [Math.cos(a) * 0.52, 0.1, Math.sin(a) * 0.52], [Math.cos(a) * 0.30, 1.15, Math.sin(a) * 0.30], 0.10, 0.10, GOLD, PM.gold);
    }
    cylinder(b, 10, 0.24, 0.62, 0.34, GOLD, PM.gold, { y0: 1.10, caps: true });
    cylinder(b, 10, 0.66, 0.70, 0.12, GOLD_B, PM.gold, { y0: 1.44, caps: true });
    // coals + flame
    cylinder(b, 10, 0.56, 0.40, 0.10, mixc(C.bloomRed, C.gold, 0.4), PM.glow, { y0: 1.50, caps: true });
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1.52, 0, 1]);
    ellipsoid(b, 0.26, 0.46, 0.26, 7, 4, mixc(C.bloomRed, C.gold, 0.55), PM.glow, { v0: 0.5, v1: 1 });
    b.pop();
  });
  ctx.points.push({ p: [x, DECK + 2.1, z], col: mixc(C.sunGlow, C.goldBright, 0.5), range: 20, int: 0.85 });
  ctx.lanterns.push({ p: [x, DECK + 2.15, z], size: 1.9, rot: 0, alpha: 0.55, shape: 1, col: mixc(C.sunGlow, C.goldBright, 0.55) });
}

// ------------------------------------------------------------------ halberdier
function guard(b, x, z, look) {
  at(b, x, DECK, z, look, () => {
    // plinth
    box(b, 1.5, 0.42, 1.5, PC.marbleSh, PM.stone, { topCol: PC.marble });
    box(b, 1.15, 0.18, 1.15, PC.marbleHi, PM.stone, { topCol: PC.marbleHi });
    const y0 = 0.60;
    // legs + boots
    for (const s of [-1, 1]) {
      b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, s * 0.26, y0 + 0.62, 0, 1]);
      box(b, 0.40, 1.24, 0.44, mixc(PC.marble, C.stoneCool, 0.25), PM.stone);
      b.pop();
      b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, s * 0.26, y0 + 0.12, 0.06, 1]);
      box(b, 0.46, 0.26, 0.62, mixc(C.iron, C.stoneCool, 0.4), PM.metal);
      b.pop();
    }
    // cuirass / torso
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, y0 + 1.66, 0, 1]);
    cylinder(b, 8, 0.52, 0.44, 1.0, mixc(PC.marbleHi, C.gold, 0.16), PM.stone, { y0: -0.5, caps: true });
    b.pop();
    // pauldrons + arms
    for (const s of [-1, 1]) {
      b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, s * 0.60, y0 + 2.02, 0, 1]);
      ellipsoid(b, 0.34, 0.26, 0.34, 6, 3, mixc(PC.marbleHi, C.gold, 0.24), PM.stone);
      b.pop();
      bar3(b, [s * 0.62, y0 + 1.9, 0.02], [s * 0.72, y0 + 1.15, 0.16], 0.20, 0.20, mixc(PC.marble, C.stoneCool, 0.2), PM.stone);
    }
    // gorget + head + helmet
    cylinder(b, 8, 0.30, 0.26, 0.22, mixc(C.gold, PC.marbleHi, 0.4), PM.gold, { y0: y0 + 2.16, caps: true });
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, y0 + 2.52, 0, 1]);
    ellipsoid(b, 0.26, 0.30, 0.26, 7, 4, PC.marbleHi, PM.stone);
    b.pop();
    // helmet dome + crest
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, y0 + 2.64, 0, 1]);
    ellipsoid(b, 0.34, 0.34, 0.34, 8, 4, mixc(C.gold, PC.marbleHi, 0.28), PM.gold, { v0: 0.5, v1: 1 });
    b.pop();
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, y0 + 2.86, -0.06, 1]);
    box(b, 0.10, 0.52, 0.46, GOLD_B, PM.gold);
    b.pop();
    // halberd: shaft, axe head, spike
    bar3(b, [0.92, y0 + 0.30, -0.02], [0.72, y0 + 3.4, 0.02], 0.075, 0.075, mixc(C.brass, C.gold, 0.3), PM.metal);
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.76, y0 + 3.28, 0.02, 1]);
    box(b, 0.62, 0.42, 0.10, mixc(C.gold, C.iron, 0.35), PM.gold);
    b.pop();
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.71, y0 + 3.62, 0.02, 1]);
    cylinder(b, 4, 0.10, 0.02, 0.34, GOLD_B, PM.gold, { y0: 0 });
    b.pop();
  });
}

// ------------------------------------------------------------------ flower urns
function goldUrn(b, x, z, s) {
  at(b, x, DECK, z, 0, () => {
    cylinder(b, 10, 0.34 * s, 0.26 * s, 0.16 * s, PC.marble, PM.stone, { y0: 0, caps: true });
    cylinder(b, 10, 0.30 * s, 0.52 * s, 0.62 * s, GOLD, PM.gold, { y0: 0.14 * s, caps: true });
    cylinder(b, 10, 0.52 * s, 0.30 * s, 0.16 * s, GOLD_B, PM.gold, { y0: 0.72 * s, caps: true });
    // clipped topiary ball + flowers
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1.16 * s, 0, 1]);
    ellipsoid(b, 0.62 * s, 0.52 * s, 0.62 * s, 8, 4, PC.leaf, PM.leaf);
    b.pop();
    const cols = [C.bloomPink, C.bloomRed, C.bloomYellow, C.bloomWhite, C.bloomBlue];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + 0.3;
      b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, Math.cos(a) * 0.5 * s, 1.5 * s, Math.sin(a) * 0.5 * s, 1]);
      ellipsoid(b, 0.12 * s, 0.10 * s, 0.12 * s, 5, 3, cols[i % cols.length], PM.leaf);
      b.pop();
    }
  });
}

export function buildPalaceForecourt(b, ctx, rng) {
  b.note && b.note('palaceForecourt');
  const R = mulberry32(0x0fc0a7e);   // local rng: does not shift the shared sequence
  try {
    carpet(b);
    for (const x of [-13.9, -7.9, 7.9, 13.9]) banner(b, x);
    for (const x of [-13.2, 13.2]) brazier(b, ctx, x, 111.5);
    for (const s of [-1, 1]) guard(b, s * 8.0, 120.9, s > 0 ? -0.35 : 0.35);
    for (const x of [-19.6, 19.6]) goldUrn(b, x, 119.6, 1.35);
    for (const x of [-24.5, -34.0, 34.0, 24.5]) goldUrn(b, x, 123.2, 1.05);
    // a pair of gilt lamp standards on the carpet's outer corners
    void R;
  } catch (e) {
    throw e;
  }
}
