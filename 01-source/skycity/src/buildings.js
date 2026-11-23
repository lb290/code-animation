// Procedural machiya (timber town-house) for the lantern town.
// Spec: 03-notes/building-spec.md. One building = stone plinth + half-timbered
// core + lit lattice facades + balcony + curved-eave tile roofs + festival trim.
// Built in local space: origin at ground centre, front = +Z, width along X.
//
// buildMachiya(b, ctx, rng, o) appends geometry and registers billboards/lights
// in ctx using WORLD coordinates (b.tp). Returns { w, d, h, floors }.
import { box, cylinder, rgb, mixc, mulc, fretGrid, railing, bar3, dougong, eaveRoof, roofGable } from './geo.js';
import { C } from './palette.js';
import { m4, clamp } from './math.js';

// material = [emissive, gloss] (see LIT_FS; emissive is multiplied by 2.6)
const M = {
  wood: [0, 0.12],
  beam: [0, 0.1],
  plaster: [0, 0.045],
  tile: [0, 0.14],
  gold: [0.18, 0.68],
  paper: [0.26, 0],
  paperHot: [0.55, 0],
  cloth: [0.02, 0.03],
  sign: [0.18, 0.05],
  vermilion: [0.03, 0.34],
  soot: [0, 0.04],
};

const pick = (rng, a) => a[Math.min(a.length - 1, Math.floor(rng() * a.length))];

// glowing paper panel + grille, centred on (x,y), facing +Z at plane z.
// mode: 'lattice' (big grid, ground floor) | 'insect' (dense vertical slats, upper
// floor) | 'open' (screen slid aside, warm room behind).
function litWindow(b, x, y, z, w, h, opts = {}) {
  const detail = opts.detail ?? 2;
  const mode = opts.mode ?? 'lattice';
  const paperCol = opts.col ?? C.paperWindow;
  const beamCol = opts.beam ?? C.timberDark;
  const paperMat = mode === 'hot' ? M.paperHot : M.paper;
  // dark reveal, recessed behind the paper: gives the window real depth
  b.push(m4.translate([x, y, z - 0.22]));
  box(b, w + 0.14, h + 0.14, 0.22, mulc(beamCol, 0.5), M.soot);
  b.pop();
  if (mode === 'open') {
    const pz = z - 0.13;
    b.quad([x - w / 2, y - h / 2, pz], [x + w / 2, y - h / 2, pz], [x + w / 2, y + h / 2, pz], [x - w / 2, y + h / 2, pz], mixc(paperCol, C.paperWindowHot, 0.3), [0.42, 0], [0, 0, 1]);
    b.push(m4.translate([x + w * 0.2, y, z]));
    fretGrid(b, w * 0.52, h, detail >= 2 ? 4 : 2, detail >= 2 ? 2 : 1, beamCol, M.wood);
    b.pop();
  } else {
    const pz = z - 0.06;
    b.quad([x - w / 2, y - h / 2, pz], [x + w / 2, y - h / 2, pz], [x + w / 2, y + h / 2, pz], [x - w / 2, y + h / 2, pz], paperCol, paperMat, [0, 0, 1]);
    if (detail >= 1) {
      // a single hotter cell where a lamp sits against the paper
      const hx = x + (opts.hotX ?? 0);
      b.quad([hx - w * 0.2, y - h * 0.34, pz + 0.012], [hx + w * 0.2, y - h * 0.34, pz + 0.012],
        [hx + w * 0.2, y + h * 0.16, pz + 0.012], [hx - w * 0.2, y + h * 0.16, pz + 0.012], C.paperWindowHot, M.paperHot, [0, 0, 1]);
    }
    const nx = opts.nx ?? (mode === 'insect' ? Math.max(6, Math.round(w / 0.1)) : Math.max(3, Math.round(w / 0.33)));
    const ny = opts.ny ?? (mode === 'insect' ? 0 : detail >= 2 ? 1 : 0);
    b.push(m4.translate([x, y, z]));
    fretGrid(b, w, h, nx, ny, beamCol, M.wood, { barW: mode === 'insect' ? 0.035 : Math.min(0.06, w * 0.05), frameW: 0.09 });
    b.pop();
  }
  // sill beam and head beam — the horizontal timber lines of a machiya facade
  b.push(m4.translate([x, y - h / 2 - 0.09, z + 0.05]));
  box(b, w + 0.3, 0.17, 0.18, mixc(beamCol, C.woodMid, 0.4), M.beam);
  b.pop();
  b.push(m4.translate([x, y + h / 2 + 0.07, z + 0.04]));
  box(b, w + 0.22, 0.12, 0.14, mulc(beamCol, 0.94), M.beam);
  b.pop();
}

// Noren curtain: hanging cloth strips under a beam, centred on (x,z).
function noren(b, x, y, z, w, h, col, rng, detail = 2) {
  const n = detail >= 2 ? 4 : 2;
  const gap = 0.07;
  const sw = (w - gap * (n - 1)) / n;
  for (let i = 0; i < n; i++) {
    const x0 = x - w / 2 + i * (sw + gap);
    const sag = 0.03 + rng() * 0.05;
    const c = i % 2 === 0 ? col : mulc(col, 0.9);
    b.quad([x0, y, z], [x0 + sw, y, z], [x0 + sw, y - h + sag, z + 0.02], [x0, y - h + sag, z + 0.02], c, M.cloth, [0, 0, 1]);
    if (detail >= 2) {
      b.quad([x0, y - h * 0.6, z + 0.01], [x0 + sw, y - h * 0.6, z + 0.01], [x0 + sw, y - h * 0.7, z + 0.01], [x0, y - h * 0.7, z + 0.01], C.signPaper, M.cloth, [0, 0, 1]);
    }
  }
  b.push(m4.translate([x, y + 0.03, z]));
  box(b, w + 0.24, 0.06, 0.06, C.wood, M.wood);
  b.pop();
}

// Vertical hanging signboard: dark board, gold frame, lit paper face.
function verticalSign(b, x, y, z, w, h, rng) {
  b.push(m4.translate([x, y - h / 2, z]));
  box(b, w, h, 0.1, C.sootBlack, M.sign, { topCol: mulc(C.sootBlack, 1.1) });
  b.pop();
  // lit paper face with abstract "characters"
  b.push(m4.translate([x, y - h / 2 + 0.06, z + 0.06]));
  box(b, w * 0.72, h * 0.9, 0.02, C.signPaper, [0.24, 0.05]);
  b.pop();
  const n = Math.max(2, Math.round(h / 0.44));
  for (let i = 0; i < n; i++) {
    const gy = y - h + 0.24 + i * ((h - 0.48) / Math.max(1, n - 1));
    b.push(m4.translate([x + (rng() - 0.5) * 0.04, gy, z + 0.08]));
    box(b, w * (0.4 + rng() * 0.2), 0.13, 0.02, C.sootBlack, M.sign);
    b.pop();
  }
  for (const [dx, dy, sw, sh] of [[0, h / 2 - 0.035, w + 0.07, 0.07], [0, -h / 2 + 0.035, w + 0.07, 0.07], [-w / 2 + 0.035, 0, 0.07, h], [w / 2 - 0.035, 0, 0.07, h]]) {
    b.push(m4.translate([x + dx, y - h / 2 + dy, z + 0.05]));
    box(b, sw, sh, 0.06, C.goldLeaf, M.gold);
    b.pop();
  }
}

// Horizontal shop sign above the ground floor.
function shopSign(b, x, y, z, w, h) {
  b.push(m4.translate([x, y, z]));
  box(b, w, h, 0.12, C.sootBlack, M.sign);
  b.pop();
  b.push(m4.translate([x, y, z + 0.07]));
  box(b, w * 0.82, h * 0.46, 0.03, C.signPaper, [0.26, 0.05]);
  b.pop();
  for (const s of [-1, 1]) {
    b.push(m4.translate([x + s * (w / 2 - 0.045), y, z + 0.04]));
    box(b, 0.08, h + 0.07, 0.1, C.goldLeaf, M.gold);
    b.pop();
  }
}

// Hanging banner (幟): tall cloth strip on a pole under the eave.
function bannerCloth(b, x, y, z, h, colA, colB, rng) {
  const w = 0.5;
  const bottom = y - h;
  b.quad([x - w / 2, y, z], [x + w / 2, y, z], [x + w / 2, bottom, z + 0.04], [x - w / 2, bottom, z + 0.04], colA, M.cloth, [0, 0, 1]);
  b.quad([x - w / 2, bottom + h * 0.62, z + 0.02], [x + w / 2, bottom + h * 0.62, z + 0.02],
    [x + w / 2, bottom + h * 0.3, z + 0.02], [x - w / 2, bottom + h * 0.3, z + 0.02], colB, M.cloth, [0, 0, 1]);
  bar3(b, [x + w * 0.64, y + 0.05, z], [x + w * 0.64, y + 0.5, z], 0.05, 0.05, C.wood, M.wood);
  bar3(b, [x - w / 2 - 0.08, y + 0.05, z], [x + w * 0.64, y + 0.05, z], 0.06, 0.06, C.wood, M.wood);
}

// Register a paper lantern billboard in world space.
function lantern(ctx, b, x, y, z, size, col, shape = 1) {
  ctx.lanterns.push({ p: b.tp([x, y, z]), size, col, alpha: 1, shape });
}

function warmPoint(ctx, b, x, y, z, range, int, col) {
  ctx.points.push({ p: b.tp([x, y, z]), col, range, int });
}

// ---------------------------------------------------------------------------
export function buildMachiya(b, ctx, rng, o = {}) {
  const detail = o.detail ?? 2;
  const floors = clamp(o.floors ?? (rng() < 0.2 ? 1 : rng() < 0.86 ? 2 : 3), 1, 3);
  const w = o.w ?? 5.4 + rng() * 1.6;
  const d = o.d ?? 4.5 + rng() * 1.1;
  const bays = o.bays ?? Math.max(2, Math.min(4, Math.round(w / 2.15)));
  const bayW = w / bays;
  const plinth = 0.48 + rng() * 0.08;
  const gH = 3.04 + rng() * 0.1;
  const upH = 2.88 + rng() * 0.12;
  const slab = 0.17;
  const yF1 = plinth + gH;
  const yTop = floors === 1 ? yF1 : floors === 2 ? yF1 + upH + slab : yF1 + 2 * (upH + slab);
  const balcony = floors >= 2 && rng() < 0.8;
  const hasNoren = rng() < 0.85;
  const hasSign = rng() < 0.82;
  const hasBanner = detail >= 1 && rng() < 0.5;

  // ---- palette per building (Y targets per spec §4.1)
  const beamCol = mixc(C.timberDark, C.wood, 0.15 + rng() * 0.55);
  const postCol = mixc(C.woodMid, C.timberPale, rng() * 0.3);
  const woodCol = mixc(C.wood, C.woodMid, rng() * 0.6);
  const plasterCol = mixc(C.plaster, C.plasterShade, rng() * 0.55);
  const tileCol = mixc(mixc(C.tileSlate, C.tileRidge, rng() * 0.6), C.roof, rng() * 0.28);
  const norenCol = pick(rng, [C.norenIndigo, C.norenIndigo, C.norenRust, C.norenRust, C.signPaper]);

  // ---------------------------------------------------------------- fare LOD
  if (detail === 0) {
    b.note('machiya-far');
    b.push(m4.translate([0, plinth / 2 - 0.3, 0]));
    box(b, w + 0.34, plinth + 0.6, d + 0.34, C.stoneDark, [0, 0.1]);
    b.pop();
    b.push(m4.translate([0, (plinth + yTop) / 2, 0]));
    box(b, w, yTop - plinth, d, mulc(plasterCol, 0.42), M.plaster);
    b.pop();
    for (const px of [-w / 2 + 0.1, w / 2 - 0.1]) {
      const pz = d / 2 - 0.1;
      b.push(m4.translate([px, (plinth + yTop) / 2, pz]));
      box(b, 0.24, yTop - plinth, 0.24, C.timberDark, M.beam);
      b.pop();
    }
    const roofHf = (d / 2 + 1.15) * 0.55;
    b.push(m4.translate([0, yTop, 0]));
    roofGable(b, w, d, roofHf, tileCol, M.tile, { over: 1.15, sideOver: 0.55, rows: 2, cols: 2, tiles: 0, rafters: 0, gableCol: mixc(plasterCol, C.plasterShade, 0.4) });
    b.pop();
    // two lit bands + a flat balcony slab read as "shop + balcony" at distance
    for (let i = 0; i < 2; i++) {
      const yy = plinth + 1.1 + i * Math.max(2.5, gH * 0.72);
      if (yy > yTop - 0.9) break;
      b.quad([-w * 0.42, yy, d / 2 + 0.03], [w * 0.42, yy, d / 2 + 0.03], [w * 0.42, yy + 0.8, d / 2 + 0.03], [-w * 0.42, yy + 0.8, d / 2 + 0.03], C.paperWindow, M.paper, [0, 0, 1]);
    }
    if (floors >= 2) {
      b.push(m4.translate([0, yF1 + 0.04, d / 2 + 0.24]));
      box(b, w + 0.1, 0.14, 0.5, mulc(woodCol, 1.1), M.wood);
      b.pop();
    }
    return { w, d, h: yTop + roofHf, floors };
  }

  // ---------------------------------------------------------------- plinth
  b.note('machiya');
  // stone footing buried 0.7 so it sits on the noisy island terrain
  b.push(m4.translate([0, plinth / 2 - 0.35, 0]));
  box(b, w + 0.4, plinth + 0.7, d + 0.4, C.stoneDark, [0, 0.1], { topCol: mixc(C.stone, C.stoneDark, 0.3) });
  b.pop();
  // three stone steps under the entrance bay
  const doorBay = Math.floor(bays / 2);
  const doorX = -w / 2 + (doorBay + 0.5) * bayW;
  for (let i = 0; i < 3; i++) {
    b.push(m4.translate([doorX, 0.075 + i * 0.15, d / 2 + 0.52 - i * 0.16]));
    box(b, Math.min(2.2, bayW * 0.95), 0.15, 0.3, mulc(C.stone, 0.92), [0, 0.08], { topCol: mixc(C.stone, C.plasterShade, 0.2) });
    b.pop();
  }

  // ---------------------------------------------------------------- core volume
  // half-timbered wall volume: plaster infill, dark timber laid over it
  // the core must sit behind the most recessed facade plane: with a balcony the
  // 2F wall is set back 0.34, so a shallow core would cover its windows
  const coreW = w - 0.28, coreD = d - (balcony ? 1.0 : 0.28);
  b.push(m4.translate([0, (plinth + yTop) / 2, 0]));
  box(b, coreW, yTop - plinth, coreD, mulc(plasterCol, 0.72), M.plaster);
  b.pop();

  // ---------------------------------------------------------------- post & beam
  const postZ = d / 2 - 0.02;
  const postXs = [];
  for (let i = 0; i <= bays; i++) postXs.push(-w / 2 + i * bayW);
  for (const px of postXs) {
    b.push(m4.translate([px, (plinth + yF1) / 2, postZ]));
    cylinder(b, 8, 0.15, 0.14, yF1 - plinth, postCol, M.beam, { caps: false, y0: -(yF1 - plinth) / 2 });
    b.pop();
    // stone column base
    b.push(m4.translate([px, plinth + 0.07, postZ]));
    box(b, 0.36, 0.14, 0.36, C.stoneDark, [0, 0.08]);
    b.pop();
  }
  // corner posts all the way to the roof
  for (const px of [-w / 2 + 0.13, w / 2 - 0.13]) {
    for (const pz of [d / 2 - 0.13, -d / 2 + 0.13]) {
      b.push(m4.translate([px, (plinth + yTop) / 2, pz]));
      box(b, 0.26, yTop - plinth, 0.26, mulc(postCol, 0.9), M.beam);
      b.pop();
    }
  }
  // horizontal beams at every floor line on the front (長押)
  for (const yy of [yF1 - 0.12, floors >= 2 ? yF1 + upH + slab - 0.14 : -1]) {
    if (yy < 0) continue;
    b.push(m4.translate([0, yy, postZ + 0.03]));
    box(b, w + 0.2, 0.24, 0.26, mulc(beamCol, 1.04), M.beam);
    b.pop();
  }
  // ground-floor lintel (the big beam above the shopfront)
  b.push(m4.translate([0, yF1 - 0.44, postZ + 0.06]));
  box(b, w + 0.14, 0.32, 0.28, mulc(beamCol, 0.92), M.beam);
  b.pop();
  // rafter tails under the 1F eave
  if (detail >= 2) {
    const n = Math.max(4, Math.round(w / 0.36));
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + ((i + 0.5) / n) * w;
      bar3(b, [x, yF1 - 0.6, postZ + 0.02], [x, yF1 - 0.82, d / 2 + 0.54], 0.1, 0.14, mulc(beamCol, 0.72), M.beam);
    }
  }

  // ---------------------------------------------------------------- 1F facade
  const winZ = d / 2 + 0.02;
  const winH = gH * 0.42;
  const winY = plinth + 1.02 + winH / 2;
  for (let i = 0; i < bays; i++) {
    const cx = -w / 2 + (i + 0.5) * bayW;
    if (i === doorBay) {
      const dw = Math.min(1.6, bayW * 0.76);
      b.push(m4.translate([cx, plinth + 1.14, winZ - 0.32]));
      box(b, dw, 2.28, 0.18, mulc(beamCol, 0.4), M.soot);
      b.pop();
      b.push(m4.translate([cx, plinth + 1.06, winZ - 0.25]));
      box(b, dw * 0.72, 1.9, 0.05, mixc(C.paperWindow, C.paperWindowHot, 0.2), [0.3, 0]);
      b.pop();
      if (hasNoren) noren(b, cx, yF1 - 0.58, winZ + 0.03, dw * 0.96, 0.58, norenCol, rng, detail);
      if (bayW > 2.0) {
        for (const s of [-1, 1]) {
          litWindow(b, cx + s * bayW * 0.37, winY, winZ, bayW * 0.2, winH * 0.8, { detail, mode: 'lattice', col: C.paperWindow, beam: beamCol, nx: 2 });
        }
      }
    } else {
      litWindow(b, cx, winY, winZ, bayW * 0.86, winH, {
        detail, mode: 'lattice', col: C.paperWindow, beam: beamCol,
        nx: Math.max(4, Math.round(bayW / 0.33)), ny: detail >= 2 ? 2 : 1,
        hotX: (rng() - 0.5) * bayW * 0.3,
      });
    }
  }
  // a plaster band (小壁) under the 1F eave
  if (detail >= 1) {
    b.push(m4.translate([0, yF1 - 0.2, postZ + 0.05]));
    box(b, w + 0.05, 0.3, 0.1, mulc(C.plasterShade, 0.8), M.plaster);
    b.pop();
  }
  // 1F eave (庇) over the shopfront
  const eave1Y = floors >= 2 ? yF1 - 0.68 : yTop - 1.0;
  b.push(m4.translate([0, eave1Y, d / 2]));
  eaveRoof(b, w + 0.55, 1.02, 0.36, tileCol, M.tile, {
    rows: detail >= 2 ? 3 : 2, cols: detail >= 2 ? 7 : 4, lift: 0.17,
    tiles: detail >= 2 ? 10 : 0, rafters: detail >= 2 ? 9 : 0,
  });
  b.pop();
  if (hasSign && detail >= 1) {
    shopSign(b, 0, yF1 - 0.92, d / 2 + 0.64, Math.min(2.5, w * 0.44), 0.46);
  }
  if (detail >= 2) {
    const sx = (rng() < 0.5 ? -1 : 1) * (w / 2 - 0.52);
    verticalSign(b, sx, yF1 - 0.54, d / 2 + 0.44, 0.44, 1.6 + rng() * 0.6, rng);
  }
  lantern(ctx, b, -w * 0.32, eave1Y - 0.44, d / 2 + 0.88, 0.42 + rng() * 0.08, C.lanternSkin);
  lantern(ctx, b, w * 0.32, eave1Y - 0.44, d / 2 + 0.88, 0.42 + rng() * 0.08, C.lanternSkin);
  if (detail >= 2 && rng() < 0.5) {
    lantern(ctx, b, 0, eave1Y - 0.74, d / 2 + 0.92, 0.58, mixc(C.lanternSkin, C.paper, 0.4), 0);
  }
  if (rng() < 0.28) warmPoint(ctx, b, 0, 2.1, d / 2 + 1.5, 12, 0.5, mixc(C.lanternSkin, C.paperWindow, 0.5));

  // ---------------------------------------------------------------- upper floors
  if (floors >= 2) {
    const upY = yF1 + slab;
    const f2z = balcony ? d / 2 - 0.34 : d / 2 - 0.1;
    if (balcony) {
      b.push(m4.translate([0, (upY + yTop) / 2, f2z - 0.2]));
      box(b, w - 0.1, yTop - upY, 0.14, mulc(plasterCol, 0.72), M.plaster);
      b.pop();
    }
    const ubH = upH * 0.46;
    const ubY = upY + upH * 0.5;
    for (let i = 0; i < bays; i++) {
      const cx = -w / 2 + (i + 0.5) * bayW;
      const mode = detail >= 2 && rng() < 0.12 ? 'open' : 'insect';
      litWindow(b, cx, ubY, f2z + 0.02, bayW * 0.84, ubH, {
        detail: Math.max(1, detail - 1), mode, col: C.paperWindow, beam: beamCol,
        nx: mode === 'insect' ? Math.max(6, Math.round(bayW / 0.11)) : 4,
        hotX: (rng() - 0.5) * bayW * 0.28,
      });
    }
    // exposed posts of the upper floor
    for (const px of postXs) {
      b.push(m4.translate([px, upY + upH / 2, f2z + 0.02]));
      box(b, 0.2, upH - 0.1, 0.2, beamCol, M.beam);
      b.pop();
    }
    if (balcony) {
      const bz = d / 2 + 0.56;
      b.push(m4.translate([0, yF1 + slab / 2, (d / 2 + bz) / 2]));
      box(b, w + 0.3, slab, bz - d / 2 + 0.32, mixc(woodCol, C.woodLight, 0.3), M.wood, { topCol: mulc(C.woodLight, 0.9) });
      b.pop();
      const rn = bays * 2;
      for (let i = 0; i <= rn; i++) {
        const x = -w / 2 + (i / rn) * w;
        bar3(b, [x, yF1 + slab, d / 2 + 0.06], [x, yF1 + slab, bz + 0.06], 0.07, 0.09, mulc(beamCol, 0.9), M.beam);
      }
      b.push(m4.translate([0, yF1 + slab + 0.02, bz + 0.02]));
      railing(b, w + 0.2, 0.9, C.vermilion, M.vermilion, {
        simple: detail < 2, n: Math.round((w + 0.2) / (detail >= 2 ? 0.26 : 0.42)), thick: 0.075,
      });
      b.pop();
      for (const sx of [-1, 1]) {
        b.push(m4.translate([sx * (w / 2 + 0.08), yF1 + slab + 0.02, (d / 2 + bz) / 2 + 0.1]));
        b.push(m4.rotY(Math.PI / 2));
        railing(b, bz - d / 2, 0.9, C.vermilion, M.vermilion, { simple: true, n: 3, thick: 0.075 });
        b.pop(); b.pop();
      }
      if (detail >= 2) {
        for (let i = 0; i <= bays; i++) {
          const x = -w / 2 + i * bayW;
          bar3(b, [x, yF1 - 0.74, d / 2 + 0.02], [x, yF1 + slab - 0.08, bz - 0.14], 0.1, 0.16, mulc(beamCol, 0.8), M.beam);
        }
      }
    }
    // plaster band (小壁) under the 2F eave
    if (detail >= 1) {
      b.push(m4.translate([0, yTop - 0.26, d / 2 - 0.03]));
      box(b, w + 0.05, 0.34, 0.1, mulc(C.plasterShade, 0.75), M.plaster);
      b.pop();
    }
    // 2F eave roof over the balcony / upper floor
    const eave2Y = yTop - 0.62;
    b.push(m4.translate([0, eave2Y, d / 2]));
    eaveRoof(b, w + 0.75, balcony ? 1.3 : 0.95, 0.44, tileCol, M.tile, {
      rows: detail >= 2 ? 3 : 2, cols: detail >= 2 ? 8 : 4, lift: 0.2,
      tiles: detail >= 2 ? 11 : 0, rafters: detail >= 2 ? 10 : 0,
    });
    b.pop();
    if (detail >= 2) {
      for (const sx of [-1, 1]) {
        b.push(m4.translate([sx * (w / 2 - 0.12), eave2Y - 0.2, d / 2 + 0.05]));
        dougong(b, C.timberDark, M.beam, { scale: 0.5 });
        b.pop();
      }
    }
    if (detail >= 1) {
      lantern(ctx, b, -(w / 2 - 0.62), eave2Y - 0.5, d / 2 + (balcony ? 1.32 : 1.0), 0.46, C.lanternSkin);
      lantern(ctx, b, w / 2 - 0.62, eave2Y - 0.5, d / 2 + (balcony ? 1.32 : 1.0), 0.46, C.lanternSkin);
    }
    if (rng() < 0.35) warmPoint(ctx, b, 0, yF1 + 1.6, d / 2 + 0.8, 10, 0.4, mixc(C.lanternSkin, C.paperWindow, 0.5));
  }

  // ---------------------------------------------------------------- 3F
  if (floors >= 3) {
    const y3 = yF1 + upH + slab;
    const ubH = upH * 0.44;
    for (let i = 0; i < bays; i++) {
      const cx = -w / 2 + (i + 0.5) * bayW;
      litWindow(b, cx, y3 + upH * 0.5, d / 2 - 0.05, bayW * 0.78, ubH, { detail: 1, mode: 'insect', col: C.paperWindow, beam: beamCol, nx: 8 });
    }
    b.push(m4.translate([0, y3 - 0.44, d / 2]));
    eaveRoof(b, w + 0.45, 0.85, 0.32, tileCol, M.tile, { rows: 2, cols: 5, lift: 0.15, tiles: detail >= 2 ? 8 : 0, rafters: detail >= 2 ? 7 : 0 });
    b.pop();
  }

  // ---------------------------------------------------------------- side walls
  for (const sx of [-1, 1]) {
    const wallX = sx * (w / 2 + 0.005);
    const nz = detail >= 2 ? 4 : 2;
    for (let i = 0; i <= nz; i++) {
      const z = -d / 2 + 0.2 + (i / nz) * (d - 0.4);
      b.push(m4.translate([wallX, (plinth + yTop) / 2, z]));
      box(b, 0.16, yTop - plinth, 0.18, mulc(beamCol, 0.84), M.beam);
      b.pop();
    }
    for (const yy of [yF1 - 0.12, floors >= 2 ? yF1 + upH * 0.52 : -1]) {
      if (yy < 0) continue;
      b.push(m4.translate([wallX, yy, 0]));
      box(b, 0.17, 0.22, d - 0.18, mulc(beamCol, 0.78), M.beam);
      b.pop();
    }
    if (detail >= 2 && floors >= 2) {
      bar3(b, [wallX + sx * 0.01, yF1 + 0.1, -d / 2 + 0.9], [wallX + sx * 0.01, yF1 + upH * 0.9, d / 2 - 0.9], 0.14, 0.12, mulc(beamCol, 0.8), M.beam);
    }
    // one small lit window on the side wall, facing outward
    b.push(m4.translate([wallX + sx * 0.1, yF1 - 1.5, 0]));
    b.push(m4.rotY(sx * Math.PI / 2));
    litWindow(b, 0, 0, 0, 0.7, 0.85, { detail: 1, mode: 'insect', col: C.paperWindow, beam: beamCol, nx: 6 });
    b.pop(); b.pop();
  }

  // ---------------------------------------------------------------- main roof
  const roofOver = 1.2 + rng() * 0.15;
  const roofH = (d / 2 + roofOver) * 0.55;
  b.push(m4.translate([0, yTop, 0]));
  roofGable(b, w + 0.2, d + 0.2, roofH, tileCol, M.tile, {
    over: roofOver, sideOver: 0.62,
    rows: detail >= 2 ? 8 : 3,
    cols: detail >= 2 ? 7 : 3,
    curve: 1.28 + rng() * 0.1,
    lift: 0.5 + rng() * 0.18,
    tiles: detail >= 2 ? 12 : 0,
    rafters: detail >= 2 ? 10 : 0,
    gableCol: mixc(plasterCol, C.plasterShade, 0.35),
    bargeCol: mixc(beamCol, C.woodMid, 0.5),
    ornamentCol: C.goldLeaf,
  });
  b.pop();
  if (detail >= 1) {
    for (const sx of [-1, 1]) {
      b.push(m4.translate([sx * (w / 2 + 0.78), yTop + roofH + 0.2, 0]));
      box(b, 0.2, 0.42, 0.28, C.goldLeaf, M.gold);
      b.pop();
    }
  }

  // ---------------------------------------------------------------- banners
  if (hasBanner) {
    const bx = (rng() < 0.5 ? -1 : 1) * (w / 2 - 0.3);
    bannerCloth(b, bx, eave1Y + 1.15, d / 2 + 0.86, 2.2 + rng() * 0.6,
      pick(rng, [C.norenIndigo, C.norenRust, C.goldLeaf, mixc(C.norenRust, C.norenIndigo, 0.5)]),
      C.signPaper, rng);
  }

  return { w, d, h: yTop + roofH, floors };
}
