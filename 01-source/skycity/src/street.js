// Street-level festival dressing for the lantern town: yatai food stalls,
// cross-street lantern strings, nobori banners, vertical signboards, cloth
// awnings and the clutter that makes a night market read as inhabited.
//
// The ring road is a polar band: x = cos(a) * r, y = o.y + h, z = sin(a) * r.
// The two facades sit at r = faceIn (43.0) and r = faceOut (47.9); the walkable
// middle of the street is r in [44.8, 46.2] and must stay empty below y = 2.6.
// So: stalls hug the two facades (depth <= 1.55 m), banners stand in the side
// gutters, awnings/signs hang off the walls above head height, and the lantern
// strings cross the street at y > 4. The radial line at a = pi/2 (the stairway
// up to the upper terrace + the torii at (0, 0, 46)) is left clear at ground
// level.
//
// Deterministic: all variation comes from the rng handed in by buildTown.
//
// Measured (seed 7): 58 items / 16.2k triangles / 82 lantern billboards / 3 warm
// point lights; see tools/street-check.mjs for the corridor + budget self-test.
import { box, cylinder, bar3, ribbon, catenary, rgb, mixc, mulc } from './geo.js';
import { C } from './palette.js';
import { m4, TAU, lerp } from './math.js';

// material = [emissive, gloss] (see LIT_FS; emissive is multiplied by 2.6)
const M = {
  wood: [0, 0.12],
  woodDark: [0, 0.06],
  beam: [0, 0.1],
  stone: [0.0, 0.06],
  cloth: [0.02, 0.03],
  clothLit: [0.055, 0.03],
  paper: [0.42, 0],
  paperHot: [0.8, 0],
  paperSoft: [0.2, 0],
  glyph: [0.3, 0.05],
  gold: [0.18, 0.68],
  goldDim: [0.1, 0.45],
  coal: [0.7, 0],
  ember: [1.0, 0],
};

// Palette compatibility: the machiya pass renamed its palette block
// (03-notes/building-spec.md §4.2) while this file was being written, so resolve
// every colour through either key set. No new palette entries are introduced.
const K = {
  wood: C.wood, woodMid: C.woodMid, woodLight: C.woodLight,
  board: C.timberPale ?? C.board ?? C.woodLight,
  beam: C.timberDark ?? C.beam ?? rgb('#3b2a20'),
  beamWarm: C.timberPale ?? C.beamWarm ?? rgb('#4d3728'),
  plaster: C.plaster,
  paperGlow: C.paperWindow ?? C.paperGlow ?? rgb('#ffc078'),
  paperHot: C.paperWindowHot ?? C.paperHot ?? rgb('#ffe3b0'),
  paper: C.paper, paperCore: C.paperCore,
  gold: C.gold, goldDark: C.goldLeaf ?? C.goldDark ?? rgb('#9a6a2e'),
  red: C.red, redLight: C.redLight,
  redDeep: C.vermilion ?? C.redDeep ?? rgb('#8e2c22'),
  norenRed: C.norenRust ?? C.norenRed ?? rgb('#a83028'),
  norenIndigo: C.norenIndigo,
  signBoard: C.sootBlack ?? C.signBoard ?? rgb('#2a211a'),
  stone: C.stone, stoneDark: C.stoneDark,
  lanternSkin: C.lanternSkin ?? C.paper,
};

const HALF_PI = Math.PI / 2;
const STAIR_A = HALF_PI;   // stairway + torii radial line: no ground clutter near it
const STAIR_CLEAR = 0.17;  // ~7.5 m of arc on either side

const pick = (rng, arr) => arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))];

// ---------------------------------------------------------------- local space
// beginFrame() puts the builder at polar (a, r) at ground level. Local +Z points
// from the facade toward the street centre (dir = +1 inner row, -1 outer row),
// local +X runs along the street, +Y is up.
function beginFrame(b, a, r, o, dir) {
  b.push(m4.translate([Math.cos(a) * r, o.y, Math.sin(a) * r]));
  b.push(m4.rotY(dir > 0 ? HALF_PI - a : -HALF_PI - a));
}
function endFrame(b) {
  b.pop();
  b.pop();
}

// World-space position on the ring road.
function ringPos(a, r, o, h = 0) {
  return [Math.cos(a) * r, o.y + h, Math.sin(a) * r];
}

// Register a paper lantern billboard (world space, from the current frame).
function lanternAt(ctx, b, x, y, z, size, col, shape = 1) {
  ctx.lanterns.push({ p: b.tp([x, y, z]), size, col, alpha: 1, shape });
}
function warmPoint(ctx, b, x, y, z, range, int, col) {
  ctx.points.push({ p: b.tp([x, y, z]), col, range, int });
}

// =============================================================== yatai stall
// A wooden food stall: plank counter, four posts, striped awning, tray of wares,
// a lit paper panel behind the counter, a hanging cloth sign, side noren and two
// lanterns off the front edge. Local space, footprint z in [0, d + overhang].
function buildStall(b, ctx, rng, o, def) {
  const dir = def.dir;
  const inner = dir > 0;
  const r0 = inner ? o.faceIn + 0.06 : o.faceOut - 0.06;
  const d = inner ? 1.28 : 1.2;
  const over = inner ? 0.2 : 0.16;    // awning lip over the street
  const w = 2.15 + rng() * 0.5;
  const frontZ = d + over;
  const cz = d - 0.34;                // counter centre
  const topY = 2.58;

  const wood = mixc(K.wood, K.woodMid, 0.2 + rng() * 0.55);
  const board = mixc(K.board, K.woodLight, 0.1 + rng() * 0.5);
  const beam = mixc(K.beam, K.beamWarm, 0.1 + rng() * 0.6);
  const cream = mixc(K.plaster, K.paperCore, 0.1 + rng() * 0.14);
  const stripe = rng() < 0.62 ? mixc(K.red, K.redLight, rng() * 0.5) : K.norenIndigo;
  const stripeDark = mulc(stripe, 0.84);
  const norenCol = rng() < 0.55 ? K.norenRed : K.norenIndigo;

  beginFrame(b, def.a, r0, o, dir);

  // ---- footing + plank floor
  b.push(m4.translate([0, 0.08, d * 0.46]));
  box(b, w + 0.18, 0.16, d + 0.06, K.stoneDark, M.stone, { topCol: mulc(K.stone, 0.72) });
  b.pop();

  // ---- back wall against the facade, with a warm paper panel above the counter
  b.push(m4.translate([0, 1.24, 0.09]));
  box(b, w, 2.36, 0.14, mulc(wood, 0.58), M.woodDark);
  b.pop();
  b.push(m4.translate([0, 1.66, 0.18]));
  box(b, w * 0.66, 0.86, 0.04, mixc(K.paperGlow, K.paperHot, 0.3 + rng() * 0.3), M.paperSoft);
  b.pop();
  // two rear shelves of stock (bottles / jars)
  for (let sh = 0; sh < 2; sh++) {
    const sy = 0.98 + sh * 0.44;
    b.push(m4.translate([0, sy, 0.25]));
    box(b, w * 0.86, 0.05, 0.32, board, M.wood);
    b.pop();
    for (let k = 0; k < 2; k++) {
      const sx = -w * 0.24 + k * w * 0.36 + (rng() - 0.5) * 0.1;
      b.push(m4.translate([sx, sy + 0.03, 0.25]));
      cylinder(b, 5, 0.055, 0.05, 0.22, mixc(wood, K.plaster, rng() * 0.6), M.wood, { y0: 0.24 });
      b.pop();
    }
  }

  // ---- four posts + top rails + front corner poles that carry the awning edge
  for (const sx of [-1, 1]) {
    for (const sz of [0.18, d - 0.12]) {
      b.push(m4.translate([sx * (w / 2 - 0.08), topY / 2 + 0.06, sz]));
      box(b, 0.1, topY, 0.1, beam, M.beam);
      b.pop();
    }
    b.push(m4.translate([sx * w * 0.43, 1.24, frontZ - 0.06]));
    box(b, 0.08, 2.44, 0.08, beam, M.beam);
    b.pop();
  }
  b.push(m4.translate([0, topY, d - 0.12]));
  box(b, w, 0.09, 0.09, beam, M.beam);
  b.pop();
  b.push(m4.translate([0, topY, 0.18]));
  box(b, w, 0.09, 0.09, beam, M.beam);
  b.pop();

  // ---- striped awning: two rows of alternating stripe quads, sagging toward
  // the street, with a scalloped valance hanging off the front edge
  const cols = 9;
  const ridgeY = 2.96, sagY = 2.8, frontY = 2.42;
  for (let c = 0; c < cols; c++) {
    const x0 = -w / 2 + (c / cols) * w;
    const x1 = -w / 2 + ((c + 1) / cols) * w;
    const col = c % 2 === 0 ? stripe : cream;
    const cMat = c % 2 === 0 ? M.cloth : M.clothLit;
    b.quad([x0, ridgeY, 0.02], [x0, sagY, 0.7], [x1, sagY, 0.7], [x1, ridgeY, 0.02], col, cMat);
    b.quad([x0, sagY, 0.7], [x0, frontY, frontZ], [x1, frontY, frontZ], [x1, sagY, 0.7], col, cMat);
    b.quad([x0, frontY, frontZ], [x1, frontY, frontZ],
      [x1, frontY - 0.15, frontZ - 0.03], [x0, frontY - 0.13, frontZ - 0.03], stripeDark, M.cloth);
  }
  // side gussets close the awning profile
  for (const sx of [-1, 1]) {
    const x = sx * (w / 2 + 0.005);
    b.tri([x, ridgeY, 0.02], [x, sagY, 0.7], [x, frontY, frontZ], stripe, M.cloth, [sx, 0, 0]);
  }
  bar3(b, [-w / 2 - 0.05, ridgeY + 0.03, 0.02], [w / 2 + 0.05, ridgeY + 0.03, 0.02], 0.05, 0.06, beam, M.beam);
  bar3(b, [-w / 2, frontY + 0.02, frontZ], [w / 2, frontY + 0.02, frontZ], 0.045, 0.045, beam, M.beam);
  // warm glow trapped under the canvas
  b.quad([-w * 0.42, 2.32, 0.35], [w * 0.42, 2.32, 0.35],
    [w * 0.42, 2.32, 1.02], [-w * 0.42, 2.32, 1.02], mixc(K.paperGlow, K.paperHot, 0.25), [0.22, 0], [0, -1, 0]);

  // ---- counter
  b.push(m4.translate([0, 0.55, cz]));
  box(b, w - 0.12, 1.0, 0.46, wood, M.wood, { topCol: mulc(wood, 1.14) });
  b.pop();
  b.push(m4.translate([0, 1.09, cz]));
  box(b, w + 0.06, 0.1, 0.64, board, M.wood, { topCol: mulc(board, 1.18) });
  b.pop();
  const nSl = 5;
  for (let i = 0; i < nSl; i++) {
    const x = -w / 2 + 0.1 + (i / (nSl - 1)) * (w - 0.2);
    b.push(m4.translate([x, 0.5, cz + 0.24]));
    box(b, ((w - 0.2) / nSl) * 0.84, 0.84, 0.05, mulc(board, 0.78 + rng() * 0.36), M.wood);
    b.pop();
  }
  // two crates stacked behind the counter
  for (let i = 0; i < 2; i++) {
    b.push(m4.translate([w * 0.3 - i * 0.12, 0.26 + i * 0.36, 0.4 + i * 0.1]));
    box(b, 0.44, 0.34, 0.38, mulc(wood, 0.9), M.wood, { topCol: mulc(wood, 1.1) });
    b.pop();
  }
  // side panels: three vertical slats under the top rail on both flanks
  for (const sx of [-1, 1]) {
    const x = sx * (w / 2 - 0.02);
    for (let k = 0; k < 3; k++) {
      b.quad([x, 2.36, 0.26 + k * 0.28], [x, 1.32, 0.26 + k * 0.28],
        [x, 1.32, 0.46 + k * 0.28], [x, 2.36, 0.46 + k * 0.28], mulc(beam, 0.92), M.beam, [sx, 0, 0]);
    }
    b.quad([x, 1.34, 0.24], [x, 1.34, d - 0.12], [x, 1.2, d - 0.12], [x, 1.2, 0.24], mulc(beam, 0.8), M.beam, [sx, 0, 0]);
  }

  // ---- wares on the counter (trays, pots, baskets, bottles, skewers, a lamp)
  const cTop = 1.16;
  const nGoods = 9 + Math.floor(rng() * 3);
  for (let i = 0; i < nGoods; i++) {
    const gx = -w * 0.42 + (i / Math.max(1, nGoods - 1)) * w * 0.84 + (rng() - 0.5) * 0.08;
    const gz = cz - 0.1 + rng() * 0.3;
    const kind = Math.floor(rng() * 6);
    if (kind === 0 || kind === 5) {
      // tray of food cubes (食盒的暗示)
      b.push(m4.translate([gx, cTop + 0.03, gz]));
      box(b, 0.34, 0.05, 0.24, mulc(board, 0.92), M.wood);
      b.pop();
      const nc = 3 + Math.floor(rng() * 3);
      for (let k = 0; k < nc; k++) {
        b.push(m4.translate([gx + (rng() - 0.5) * 0.22, cTop + 0.1, gz + (rng() - 0.5) * 0.14]));
        box(b, 0.085, 0.08, 0.085, mixc(K.gold, K.redLight, rng()), [0.14 + rng() * 0.16, 0.2]);
        b.pop();
      }
    } else if (kind === 1) {
      b.push(m4.translate([gx, cTop, gz]));
      cylinder(b, 6, 0.1, 0.13, 0.17, mixc(K.goldDark, K.gold, rng()), M.gold, { y0: 0 });
      b.pop();
    } else if (kind === 2) {
      b.push(m4.translate([gx, cTop, gz]));
      cylinder(b, 6, 0.11, 0.15, 0.15, mixc(K.woodLight, K.plaster, rng() * 0.5), M.wood, { y0: 0 });
      b.pop();
    } else if (kind === 3) {
      for (let k = 0; k < 2; k++) {
        b.push(m4.translate([gx + k * 0.1, cTop, gz]));
        cylinder(b, 5, 0.042, 0.046, 0.22, mixc(K.norenIndigo, K.plaster, rng() * 0.6), [0.02, 0.4], { y0: 0 });
        b.pop();
      }
    } else {
      b.push(m4.translate([gx, cTop + 0.02, gz]));
      cylinder(b, 5, 0.06, 0.04, 0.09, K.goldDark, M.goldDim, { y0: 0 });
      b.pop();
      b.push(m4.translate([gx, cTop + 0.16, gz]));
      box(b, 0.13, 0.15, 0.13, K.paperCore, M.paperHot);
      b.pop();
    }
  }
  // ---- skewer rack at one end of the counter (竹签 + 烤台)
  {
    const rx = -w * 0.36;
    b.push(m4.translate([rx, cTop + 0.02, cz]));
    box(b, 0.5, 0.1, 0.34, mulc(beam, 0.7), M.woodDark);
    b.pop();
    const nSk = 6;
    for (let k = 0; k < nSk; k++) {
      const sx = rx - 0.2 + (k / (nSk - 1)) * 0.4;
      b.push(m4.translate([sx, cTop + 0.2, cz + (rng() - 0.5) * 0.1]));
      b.push(m4.rotX(1.2));
      box(b, 0.016, 0.3, 0.016, K.board, M.wood);
      b.pop();
      b.pop();
    }
    // ember glow in the grill
    b.push(m4.translate([rx, cTop + 0.09, cz]));
    box(b, 0.4, 0.03, 0.24, K.redLight, M.coal);
    b.pop();
  }

  // ---- hanging cloth sign with a lit panel, paper tags and a small menu board
  b.push(m4.translate([0, frontY - 0.34, frontZ - 0.03]));
  box(b, w * 0.5, 0.34, 0.04, K.signBoard, [0.05, 0.08]);
  b.pop();
  for (let k = 0; k < 3; k++) {
    b.push(m4.translate([(k - 1) * w * 0.14, frontY - 0.34, frontZ - 0.06]));
    box(b, w * 0.09, 0.2, 0.03, mixc(K.paperGlow, K.paperHot, 0.35 + rng() * 0.3), M.glyph);
    b.pop();
  }
  for (let k = 0; k < 3; k++) {
    const x = -w * 0.34 + k * w * 0.16;
    b.quad([x - 0.07, 2.12, frontZ - 0.05], [x + 0.07, 2.12, frontZ - 0.05],
      [x + 0.07, 1.92, frontZ - 0.05], [x - 0.07, 1.92, frontZ - 0.05], K.paper, M.paperSoft, [0, 0, 1]);
  }
  // menu board propped on the counter
  b.push(m4.translate([w * 0.34, cTop + 0.2, cz + 0.05]));
  b.push(m4.rotX(-0.22));
  box(b, 0.4, 0.28, 0.03, mulc(K.signBoard, 1.2), [0.05, 0.08]);
  b.pop();
  b.pop();
  for (let k = 0; k < 3; k++) {
    b.push(m4.translate([w * 0.34, cTop + 0.14 + k * 0.06, cz + 0.075]));
    b.push(m4.rotX(-0.22));
    box(b, 0.28, 0.022, 0.02, mixc(K.paperGlow, K.paperHot, 0.4), M.glyph);
    b.pop();
    b.pop();
  }

  // ---- side noren (short curtains on both flanks, under the top rail)
  for (const sx of [-1, 1]) {
    const x = sx * (w / 2 + 0.04);
    for (let k = 0; k < 2; k++) {
      const z0 = 0.86 + k * 0.3;
      b.quad([x, 2.3, z0], [x, 1.86, z0], [x, 1.88, z0 + 0.27], [x, 2.3, z0 + 0.27],
        mulc(norenCol, k ? 0.88 : 1), M.cloth, [sx, 0, 0]);
    }
  }

  // ---- one lantern hanging inside the stall, under the awning ridge
  b.quad([-0.012, 2.72, cz - 0.2], [0.012, 2.72, cz - 0.2],
    [0.012, 2.42, cz - 0.2], [-0.012, 2.42, cz - 0.2], K.beam, M.woodDark, [0, 0, 1]);
  lanternAt(ctx, b, 0, 2.26, cz - 0.2, 0.34 + rng() * 0.07, mixc(K.paper, K.paperHot, 0.3 + rng() * 0.5));

  // ---- two lanterns off the front edge
  for (const sx of [-1, 1]) {
    const lx = sx * w * 0.3;
    const lz = frontZ - 0.2;
    b.quad([lx - 0.012, 2.18, lz], [lx + 0.012, 2.18, lz],
      [lx + 0.012, 1.98, lz], [lx - 0.012, 1.98, lz], K.beam, M.woodDark, [0, 0, 1]);
    lanternAt(ctx, b, lx, 1.84, lz, 0.4 + rng() * 0.08, mixc(K.paper, K.paperHot, 0.2 + rng() * 0.55));
  }
  endFrame(b);
}

// =========================================================== lantern strings
// A catenary from the inner eave across to the outer eave, rope drawn with the
// ribbon primitive and a paper lantern hanging every other segment.
function buildLanternString(b, ctx, rng, o, a) {
  const rIn = o.faceIn + 0.34;
  const rOut = o.faceOut - 0.32;
  const yIn = o.y + 4.62 + rng() * 0.3;
  const yOut = o.y + 4.55 + rng() * 0.3;
  const p0 = [Math.cos(a) * rIn, yIn, Math.sin(a) * rIn];
  const p1 = [Math.cos(a) * rOut, yOut, Math.sin(a) * rOut];
  const sag = 0.4 + rng() * 0.22;
  const n = 8;
  const pts = catenary(p0, p1, sag, n);

  // rope
  ribbon(b, pts, pts.map(() => 0.055), K.wood, [0, 0.08]);
  // wooden arms bolted to both facades
  const wallIn = [Math.cos(a) * o.faceIn, yIn - 0.42, Math.sin(a) * o.faceIn];
  const wallOut = [Math.cos(a) * o.faceOut, yOut - 0.42, Math.sin(a) * o.faceOut];
  bar3(b, wallIn, p0, 0.08, 0.1, K.beam, M.beam);
  bar3(b, wallOut, p1, 0.08, 0.1, K.beam, M.beam);
  // small end posts so the rope does not end mid-air
  for (const p of [p0, p1]) {
    b.push(m4.translate(p));
    box(b, 0.09, 0.3, 0.09, K.beam, M.beam);
    b.pop();
  }

  // lanterns: every other segment, plus a dashed tie
  const col = mixc(K.paper, K.redLight, rng() * 0.28);
  for (let i = 1; i < n; i += 2) {
    const p = pts[i];
    const q = pts[i + 1] || pts[i - 1];
    const lx = (p[0] + q[0]) / 2, ly = (p[1] + q[1]) / 2, lz = (p[2] + q[2]) / 2;
    // tie line
    b.quad([lx - 0.012, ly, lz], [lx + 0.012, ly, lz],
      [lx + 0.012, ly - 0.42, lz], [lx - 0.012, ly - 0.42, lz], K.beam, M.woodDark, [0, 0, 1]);
    ctx.lanterns.push({
      p: [lx, ly - 0.68, lz], size: 0.44 + rng() * 0.09,
      col: mixc(col, K.paperHot, rng() * 0.5), alpha: 1, shape: 1,
    });
  }
}

// =============================================================== nobori banner
// A tall cloth banner on a plain pole, standing in the side gutter clear of the
// building eaves and of the walkable middle of the street.
function buildBanner(b, ctx, rng, o, a, dir) {
  const inner = dir > 0;
  const r0 = inner ? o.faceIn + 1.16 : o.faceOut - 1.16;
  const h = 4.5 + rng() * 1.2;
  beginFrame(b, a, r0, o, dir);
  // stone footing + pole + gold finial
  b.push(m4.translate([0, 0.1, 0]));
  box(b, 0.36, 0.2, 0.36, K.stoneDark, M.stone);
  b.pop();
  b.push(m4.translate([0, h / 2, 0]));
  box(b, 0.13, h, 0.13, mixc(K.wood, K.woodMid, rng() * 0.6), M.wood);
  b.pop();
  b.push(m4.translate([0, h + 0.12, 0]));
  box(b, 0.17, 0.22, 0.17, K.gold, M.gold);
  b.pop();
  // crossbar + cloth that hangs from it
  const cw = 0.68 + rng() * 0.08;
  const ch = 1.9 + rng() * 0.3;
  const topY = h - 0.14;
  bar3(b, [0.04, topY, 0], [cw + 0.14, topY - 0.03, 0], 0.06, 0.06, K.beam, M.beam);
  const main = pick(rng, [K.red, K.norenRed, K.norenIndigo, mulc(K.gold, 0.8), K.redDeep]);
  const alt = pick(rng, [K.norenIndigo, K.plaster, K.gold, K.red]);
  const bands = 2 + Math.floor(rng() * 2);
  const bandH = ch / bands;
  for (let k = 0; k < bands; k++) {
    const yTop = topY - k * bandH;
    const col = k === 0 ? main : (k === 1 ? alt : main);
    const sway = k * 0.02;
    // front and back faces of the cloth
    b.quad([cw + 0.1, yTop, 0.02 + sway], [0.08, yTop, 0.02 + sway],
      [0.08, yTop - bandH, 0.05 + sway], [cw + 0.1, yTop - bandH, 0.05 + sway], col, M.clothLit, [0, 0, 1]);
    b.quad([0.08, yTop, -0.02], [cw + 0.1, yTop, -0.02],
      [cw + 0.1, yTop - bandH, -0.045], [0.08, yTop - bandH, -0.045], mulc(col, 0.74), M.cloth, [0, 0, -1]);
  }
  // gold top trim + five fringe tails
  b.push(m4.translate([0.08 + cw / 2, topY + 0.02, 0.03]));
  box(b, cw + 0.12, 0.06, 0.06, K.gold, M.gold);
  b.pop();
  const botY = topY - ch;
  for (let k = 0; k < 5; k++) {
    const x = 0.1 + (k / 4) * cw;
    b.quad([x - 0.03, botY, 0.05], [x + 0.03, botY, 0.05],
      [x + 0.03, botY - 0.16, 0.05], [x - 0.03, botY - 0.16, 0.05], main, M.cloth, [0, 0, 1]);
  }
  endFrame(b);
}

// =========================================================== vertical signboard
// A dark board with a gold frame and a column of glowing "characters", hanging
// off the facade perpendicular to the wall so it reads from down the street.
function buildVSign(b, ctx, rng, o, a, dir) {
  const inner = dir > 0;
  const r0 = inner ? o.faceIn + 0.02 : o.faceOut - 0.02;
  const h = 1.0 + rng() * 0.2;
  const topY = 3.0;
  const zc = 1.29;             // board sits outside the 1F eave drip line
  const bw = 0.46;
  beginFrame(b, a, r0, o, dir);
  // bracket arm out over the eave + a short hanger down to the board
  bar3(b, [0, topY + 0.2, 0.02], [0, topY + 0.2, zc + 0.12], 0.08, 0.09, K.beam, M.beam);
  bar3(b, [0, topY + 0.2, zc + 0.06], [0, topY + 0.02, zc + 0.06], 0.05, 0.06, K.beam, M.beam);
  bar3(b, [0, topY + 0.2, 0.02], [0, topY + 0.02, 0.02], 0.06, 0.06, K.beam, M.beam);
  // board
  b.push(m4.translate([0, topY - h / 2, zc]));
  box(b, 0.09, h, bw, mulc(K.signBoard, 1.06), [0.05, 0.1]);
  b.pop();
  // gold frame + lit glyph strips on both faces
  for (const sx of [-1, 1]) {
    const x = sx * 0.058;
    b.push(m4.translate([x, topY - 0.045, zc]));
    box(b, 0.03, 0.07, bw + 0.06, K.goldDark, M.gold);
    b.pop();
    b.push(m4.translate([x, topY - h + 0.045, zc]));
    box(b, 0.03, 0.07, bw + 0.06, K.goldDark, M.gold);
    b.pop();
    for (const sz of [-1, 1]) {
      b.push(m4.translate([x, topY - h / 2, zc + sz * (bw / 2 - 0.035)]));
      box(b, 0.03, h, 0.07, K.goldDark, M.gold);
      b.pop();
    }
    const n = 3;
    for (let k = 0; k < n; k++) {
      b.push(m4.translate([x + sx * 0.012, topY - 0.3 - k * 0.3, zc]));
      box(b, 0.02, 0.17, bw * 0.56, mixc(K.paperGlow, K.paperHot, 0.3 + rng() * 0.35), M.glyph);
      b.pop();
    }
  }
  endFrame(b);
}

// ================================================================= cloth awning
// A stretched cloth sun-shade reaching from the facade over the shop front.
function buildClothAwning(b, ctx, rng, o, a, dir) {
  const inner = dir > 0;
  const r0 = inner ? o.faceIn + 0.03 : o.faceOut - 0.03;
  const w = 2.1 + rng() * 0.55;
  const out = inner ? 1.44 : 1.4;
  const yBack = 3.12 + rng() * 0.1;
  const yFront = 2.8 + rng() * 0.08;
  const col = pick(rng, [K.norenRed, K.norenIndigo, mixc(K.gold, K.plaster, 0.35), K.redDeep]);
  beginFrame(b, a, r0, o, dir);
  const P = (u, v) => {
    const x = -w / 2 + u * w;
    const z = 0.02 + v * out;
    const y = lerp(yBack, yFront, Math.pow(v, 1.2))
      - Math.sin(Math.PI * v) * 0.07 - Math.sin(Math.PI * u) * 0.05 * (0.4 + 0.6 * v);
    return [x, y, z];
  };
  const cols = 4, rows = 3;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const u0 = c / cols, u1 = (c + 1) / cols, v0 = r / rows, v1 = (r + 1) / rows;
      b.quad(P(u0, v0), P(u0, v1), P(u1, v1), P(u1, v0), mulc(col, 1 - 0.06 * r), M.clothLit);
    }
  }
  // scalloped edge + two wooden braces back to the wall
  for (let c = 0; c < cols; c++) {
    const u0 = c / cols, u1 = (c + 1) / cols;
    const p0 = P(u0, 1), p1 = P(u1, 1);
    b.quad([p0[0], p0[1], p0[2]], [p1[0], p1[1], p1[2]],
      [p1[0], p1[1] - 0.15, p1[2] + 0.02], [p0[0], p0[1] - 0.13, p0[2] + 0.02], mulc(col, 0.82), M.cloth);
  }
  for (const sx of [-1, 1]) {
    const x = sx * w * 0.42;
    bar3(b, [x, 2.6, 0.03], [x, yFront - 0.06, out - 0.05], 0.055, 0.06, K.beam, M.beam);
  }
  // two paper lanterns hanging off the front edge
  for (const u of [0.25, 0.75]) {
    const e = P(u, 1);
    const lx = e[0], lz = e[2] - 0.12, ly = e[1] - 0.26;
    b.quad([lx - 0.012, e[1], lz], [lx + 0.012, e[1], lz],
      [lx + 0.012, ly + 0.12, lz], [lx - 0.012, ly + 0.12, lz], K.beam, M.woodDark, [0, 0, 1]);
    lanternAt(ctx, b, lx, ly, lz, 0.36 + rng() * 0.06, mixc(K.paper, K.paperHot, 0.3 + rng() * 0.45));
  }
  endFrame(b);
}

// ==================================================================== clutter
function buildBench(b, ctx, rng, o, a, dir) {
  const inner = dir > 0;
  const r0 = inner ? o.faceIn + 0.3 : o.faceOut - 0.3;
  beginFrame(b, a, r0, o, dir);
  b.push(m4.translate([0, 0.24, 0.24]));
  box(b, 1.5, 0.09, 0.34, K.woodLight, M.wood, { topCol: mulc(K.woodLight, 1.08) });
  b.pop();
  for (const sx of [-0.58, 0.58]) {
    b.push(m4.translate([sx, 0.11, 0.24]));
    box(b, 0.1, 0.22, 0.3, K.wood, M.wood);
    b.pop();
  }
  b.push(m4.translate([0, 0.6, 0.04]));
  box(b, 1.5, 0.08, 0.08, K.wood, M.wood);
  b.pop();
  endFrame(b);
}

function buildBarrel(b, ctx, rng, o, a, r) {
  const p = ringPos(a, r, o);
  b.push(m4.translate(p));
  cylinder(b, 6, 0.25, 0.29, 0.6, mixc(K.woodMid, K.woodLight, rng() * 0.6), M.wood, { y0: 0 });
  for (const yy of [0.13, 0.47]) {
    b.push(m4.translate([0, yy, 0]));
    cylinder(b, 6, 0.285, 0.285, 0.05, K.beam, M.woodDark, { y0: 0, caps: false });
    b.pop();
  }
  b.push(m4.translate([0, 0.6, 0]));
  cylinder(b, 6, 0.27, 0.27, 0.05, K.woodLight, M.wood, { y0: 0 });
  b.pop();
  b.pop();
}

function buildCrates(b, ctx, rng, o, a, r) {
  const p = ringPos(a, r, o);
  b.push(m4.translate(p));
  b.push(m4.rotY(rng() * 0.7 - 0.35));
  const n = 2 + Math.floor(rng() * 2);
  let y = 0;
  for (let i = 0; i < n; i++) {
    const s = 0.4 + rng() * 0.16;
    b.push(m4.translate([(rng() - 0.5) * 0.1, y + s * 0.36, (rng() - 0.5) * 0.1]));
    b.push(m4.rotY((rng() - 0.5) * 0.35));
    box(b, s, s * 0.72, s, mixc(K.woodMid, K.woodLight, rng()), M.wood, { topCol: mulc(K.woodLight, 1.05) });
    b.pop();
    b.pop();
    y += s * 0.72;
  }
  b.pop();
  b.pop();
}

function buildFirePit(b, ctx, rng, o, a, r) {
  const p = ringPos(a, r, o);
  b.push(m4.translate(p));
  // stone basin + rim
  cylinder(b, 9, 0.64, 0.7, 0.44, K.stoneDark, M.stone, { y0: 0 });
  b.push(m4.translate([0, 0.4, 0]));
  cylinder(b, 9, 0.78, 0.72, 0.12, mixc(K.stone, K.stoneDark, 0.4), M.stone, { y0: 0, caps: false });
  b.pop();
  // coals
  for (let i = 0; i < 6; i++) {
    const aa = (i / 6) * TAU + rng() * 0.4;
    b.push(m4.translate([Math.cos(aa) * 0.34, 0.3, Math.sin(aa) * 0.34]));
    box(b, 0.18 + rng() * 0.12, 0.08, 0.18 + rng() * 0.12, mixc(K.redDeep, K.redLight, rng()), M.coal);
    b.pop();
  }
  // flame tongues
  for (let i = 0; i < 3; i++) {
    b.push(m4.translate([(rng() - 0.5) * 0.3, 0.34, (rng() - 0.5) * 0.3]));
    b.push(m4.rotZ((rng() - 0.5) * 0.24));
    cylinder(b, 6, 0.26 - i * 0.05, 0.02, 0.9 + rng() * 0.55,
      mixc(K.paper, K.paperCore, i * 0.22), M.ember, { y0: i * 0.16, caps: false });
    b.pop();
    b.pop();
  }
  warmPoint(ctx, b, 0, 1.15, 0, 24, 1.05, rgb('#ff9a40'));
  b.pop();
}

// A small stone lantern in the gutter between stalls.
function buildStoneLantern(b, ctx, rng, o, a, r) {
  const p = ringPos(a, r, o);
  b.push(m4.translate(p));
  b.push(m4.rotY(rng() * TAU));
  cylinder(b, 6, 0.3, 0.26, 0.18, K.stoneDark, M.stone, { y0: 0 });
  b.push(m4.translate([0, 0.18, 0]));
  cylinder(b, 6, 0.12, 0.1, 0.72, K.stone, M.stone, { y0: 0 });
  b.pop();
  b.push(m4.translate([0, 0.9, 0]));
  cylinder(b, 6, 0.3, 0.26, 0.1, mixc(K.stone, K.stoneDark, 0.35), M.stone, { y0: 0 });
  b.pop();
  // light box with a glowing paper core
  b.push(m4.translate([0, 1.24, 0]));
  box(b, 0.4, 0.36, 0.4, mixc(K.paperGlow, K.paperHot, 0.35), M.paperSoft);
  b.pop();
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      b.push(m4.translate([sx * 0.17, 1.24, sz * 0.17]));
      box(b, 0.07, 0.4, 0.07, K.stoneDark, M.stone);
      b.pop();
    }
  }
  b.push(m4.translate([0, 1.47, 0]));
  cylinder(b, 4, 0.34, 0.05, 0.24, K.stoneDark, M.stone, { y0: 0, caps: true });
  b.pop();
  b.push(m4.translate([0, 1.72, 0]));
  box(b, 0.09, 0.12, 0.09, K.goldDark, M.goldDim);
  b.pop();
  b.pop();
  b.pop();
}

// Stacked sake casks beside a stall.
function buildCasks(b, ctx, rng, o, a, r) {
  const p = ringPos(a, r, o);
  b.push(m4.translate(p));
  const n = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < n; i++) {
    const py = i < 2 ? 0 : 0.58;
    const px = i === 0 ? 0 : i === 1 ? 0.62 : 0.3;
    b.push(m4.translate([px, py, 0]));
    b.push(m4.rotY(rng() * TAU));
    cylinder(b, 6, 0.27, 0.24, 0.56, mixc(K.woodMid, K.board, rng() * 0.7), M.wood, { y0: 0 });
    for (const yy of [0.12, 0.42]) {
      b.push(m4.translate([0, yy, 0]));
      cylinder(b, 6, 0.276, 0.276, 0.045, K.beam, M.woodDark, { y0: 0, caps: false });
      b.pop();
    }
    b.push(m4.translate([0, 0.56, 0]));
    cylinder(b, 6, 0.25, 0.25, 0.04, K.board, M.wood, { y0: 0 });
    b.pop();
    b.pop();
    b.pop();
  }
  b.pop();
}

// ================================================================ entry point
export function buildStreetFestival(b, ctx, rng, o = {}) {
  const O = {
    a0: o.a0 ?? 0.12,
    a1: o.a1 ?? 2.78,
    roadR: o.roadR ?? 45.5,
    faceIn: o.faceIn ?? 43.0,
    faceOut: o.faceOut ?? 47.9,
    y: o.y ?? 0.2,
  };
  const startTris = b.triCount;
  const startLan = ctx.lanterns.length;
  const startPts = ctx.points.length;
  b.note('street');

  // Prop angles below were laid out for the current TOWN arc (0.12 .. 2.78).
  // Clamp keeps them inside the band if a0/a1 ever move.
  const A = (a) => Math.min(O.a1 - 0.06, Math.max(O.a0 + 0.06, a));
  const counts = { stalls: 0, strings: 0, banners: 0, signs: 0, awnings: 0, clutter: 0 };
  const trisBy = { stalls: 0, strings: 0, banners: 0, signs: 0, awnings: 0, clutter: 0 };
  const marks = {};
  const mark = (name, fn) => {
    const v0 = b.n, t0 = b.triCount, s0 = b.stack.length;
    fn();
    if (b.stack.length !== s0) {
      throw new Error('street: unbalanced transform stack in ' + name + ' (' + s0 + ' -> ' + b.stack.length + ')');
    }
    marks[name] = marks[name] || [];
    marks[name].push([v0, b.n]);
    trisBy[name] += b.triCount - t0;
  };

  // ---- yatai stalls: six clusters of two, hugging the two facades. The pairs
  // are spaced by arc length so they read as a market row rather than dots.
  const stallSpots = [
    [1, 0.300], [1, 0.375],
    [-1, 0.620], [-1, 0.692],
    [1, 0.980], [1, 1.052],
    [-1, 2.100], [-1, 2.172],
    [1, 2.420], [1, 2.492],
    [-1, 2.620], [-1, 2.692],
  ];
  for (const [dir, a] of stallSpots) {
    mark('stalls', () => buildStall(b, ctx, rng, O, { dir, a: A(a) }));
    counts.stalls++;
  }

  // ---- cross-street lantern strings (above the 2.6 m passage line)
  const stringAngles = [0.26, 0.56, 0.86, 1.16, 1.46, 1.76, 2.06, 2.36, 2.64];
  for (const a of stringAngles) {
    mark('strings', () => buildLanternString(b, ctx, rng, O, A(a)));
    counts.strings++;
  }

  // ---- nobori banners standing in the side gutters
  const bannerSpots = [[1, 0.53], [-1, 0.87], [1, 1.13], [-1, 1.40], [-1, 2.40], [1, 2.18], [1, 2.70]];
  for (const [dir, a] of bannerSpots) {
    if (Math.abs(a - STAIR_A) < STAIR_CLEAR * 0.6) continue;
    mark('banners', () => buildBanner(b, ctx, rng, O, A(a), dir));
    counts.banners++;
  }

  // ---- vertical signboards hanging off the facades
  const signSpots = [[1, 0.55], [-1, 0.93], [1, 2.28], [-1, 2.33]];
  for (const [dir, a] of signSpots) {
    mark('signs', () => buildVSign(b, ctx, rng, O, A(a), dir));
    counts.signs++;
  }

  // ---- cloth awnings stretched from the facades over the shop fronts
  const awningSpots = [[1, 0.17], [1, 0.63], [-1, 0.30], [1, 2.24], [-1, 2.31]];
  for (const [dir, a] of awningSpots) {
    if (Math.abs(a - STAIR_A) < STAIR_CLEAR) continue;
    mark('awnings', () => buildClothAwning(b, ctx, rng, O, A(a), dir));
    counts.awnings++;
  }

  // ---- benches, barrels, crate stacks, the brazier
  const benchSpots = [[1, 0.82], [-1, 0.54], [1, 1.18], [-1, 2.45], [1, 2.58]];
  for (const [dir, a] of benchSpots) {
    if (Math.abs(a - STAIR_A) < STAIR_CLEAR * 0.5) continue;
    mark('clutter', () => buildBench(b, ctx, rng, O, a, dir));
    counts.clutter++;
  }
  for (const [, a, r] of [[1, 0.44, 43.5], [1, 1.09, 43.55], [-1, 2.23, 47.4], [1, 2.57, 43.5]]) {
    mark('clutter', () => buildBarrel(b, ctx, rng, O, a, r));
    counts.clutter++;
  }
  for (const [, a, r] of [[1, 0.34, 43.6], [-1, 2.66, 47.35], [1, 2.46, 43.6], [-1, 0.66, 47.35]]) {
    mark('clutter', () => buildCrates(b, ctx, rng, O, a, r));
    counts.clutter++;
  }
  mark('clutter', () => buildFirePit(b, ctx, rng, O, 1.30, 43.76));
  counts.clutter++;
  for (const [, a, r] of [[1, 0.395, 43.7], [-1, 2.21, 47.3], [1, 2.53, 43.7]]) {
    mark('clutter', () => buildCasks(b, ctx, rng, O, a, r));
    counts.clutter++;
  }
  for (const [, a, r] of [[1, 0.24, 43.62], [-1, 0.74, 47.32], [1, 2.02, 43.62], [-1, 2.52, 47.32]]) {
    mark('clutter', () => buildStoneLantern(b, ctx, rng, O, a, r));
    counts.clutter++;
  }

  // ---- two hero point lights: the stall string by the main view and the far
  // cluster; the brazier already carries its own.
  warmPoint(ctx, b, Math.cos(0.34) * 43.8, O.y + 2.15, Math.sin(0.34) * 43.8, 13, 0.5, mixc(K.paper, K.paperGlow, 0.4));
  warmPoint(ctx, b, Math.cos(2.45) * 43.8, O.y + 2.15, Math.sin(2.45) * 43.8, 13, 0.45, mixc(K.paper, K.paperGlow, 0.4));

  const items = counts.stalls + counts.strings + counts.banners + counts.signs + counts.awnings + counts.clutter;
  const out = {
    items,
    tris: b.triCount - startTris,
    lanterns: ctx.lanterns.length - startLan,
    points: ctx.points.length - startPts,
    counts,
    trisBy,
  };
  // Per-category vertex ranges, for tools/street-check.mjs. Non-enumerable so
  // the build log (JSON.stringify) stays readable.
  Object.defineProperty(out, 'marks', { value: marks, enumerable: false });
  return out;
}
