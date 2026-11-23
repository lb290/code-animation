// world.js — assembles the city. Owned by the lead; content modules are called here.
import { B, cylinder, rgb, mulc } from './geo.js';
import { mesh } from './gl.js';
import { buildCity } from './city.js';
import { buildLandmarks } from './landmark.js';
import { buildWhale } from './whale.js';
import { buildRailway } from './rail.js';
import { buildTerrace } from './terrace.js';
import { buildHero } from './hero.js';
import { buildLife } from './life.js';
import { buildPalace } from './palace.js';
import { buildPalaceHall } from './palace-hall.js';
import { buildTerraceSet } from './terrace-set.js';
import { buildPalaceBase } from './palace-base.js';
import { buildPalaceSalon } from './palace-salon.js';
import { buildGlassHall } from './glass-hall.js';
import { buildPalaceForecourt } from './palace-forecourt.js';
import { buildCathedral } from './cathedral.js';
import { buildStation } from './station.js';
import { buildPalaceChambers } from './palace-chambers.js';
import { buildOpera } from './opera.js';
import { disc, MT } from './lib3d.js';
import { C, LOOK } from './palette.js';
import { L } from './layout.js';
import { mulberry32, TAU, noise2 } from './math.js';

export function buildWorld(gl) {
  const b = new B();
  const ctx = {
    gl,             // create your own meshes with mesh(ctx.gl, ...)
    points: [],     // light sources: {p:[x,y,z], col:[r,g,b], range, int}
    lanterns: [],   // static billboards: {p, size, rot, alpha, shape, col}
    dyn: [],        // dynamic actors (see actor.js); the renderer draws these every frame
    bbDyn: [],      // dynamic billboard systems: {fill(t, bb, dt){}, up:bool}
    props: {},      // hand-off data between modules (paths, anchors)
    triLog: {},
  };
  const rng = mulberry32(20261121);
  const OFF_MOD = new Set(((new URLSearchParams(location.search).get('nomod') || '')).split(',').filter(Boolean));
  const tag = (name, fn) => {
    if (OFF_MOD.has(name)) { ctx.triLog[name] = 0; return; }
    const i0 = b.i.length / 3;
    try {
      fn();
    } catch (e) {
      console.warn('[world] module ' + name + ' failed:', e && e.message, e && e.stack);
    }
    ctx.triLog[name] = (ctx.triLog[name] || 0) + (b.i.length / 3 - i0);
  };

  tag('ground', () => buildIsland(b, ctx, rng));
  tag('city', () => buildCity(b, ctx, rng));
  tag('landmarks', () => buildLandmarks(b, ctx, rng));
  tag('railway', () => buildRailway(b, ctx, rng));
  tag('terrace', () => buildTerrace(b, ctx, rng));
  tag('hero', () => buildHero(b, ctx, rng));
  tag('whale', () => buildWhale(b, ctx, rng));
  tag('life', () => buildLife(b, ctx, rng));
  tag('cloudsea', () => buildCloudSea(b, ctx, rng));
  // round 4: the enterable palace + the painter's corner (new modules, added last so
  // their rng draws do not shift the existing city / girl / creatures)
  tag('palace', () => buildPalace(b, ctx, rng));
  tag('palaceHall', () => buildPalaceHall(b, ctx, rng));
  tag('terraceSet', () => buildTerraceSet(b, ctx, rng));
  // round 5: the palace's ground-floor hall + the rotunda's luxury furnishing + the
  // glass palace interior. Appended last so their rng draws never shift earlier modules.
  tag('palaceBase', () => buildPalaceBase(b, ctx, rng));
  tag('palaceSalon', () => buildPalaceSalon(b, ctx, rng));
  tag('glassHall', () => buildGlassHall(b, ctx, rng));
  tag('palaceForecourt', () => buildPalaceForecourt(b, ctx, rng));
  // round 7: the rebuilt axis-aligned cathedral and the station the ring line runs
  // through. Appended last so their local rng draws can never shift earlier modules.
  tag('cathedral', () => buildCathedral(b, ctx, rng));
  tag('station', () => buildStation(b, ctx, rng));
  // round 8: the palace's first-floor rear suite (carved out of the podium behind the
  // entrance hall) and the new enterable opera house. Appended LAST so their local rng
  // draws never shift any earlier module's sequence.
  tag('palaceChambers', () => buildPalaceChambers(b, ctx, rng));
  tag('opera', () => buildOpera(b, ctx, rng));

  const built = b.build(gl);
  const m = mesh(gl, built.verts, built.indices);
  return {
    mesh: m,
    ctx,
    tris: built.indices.length / 3,
    verts: built.verts.length / 11,
  };
}

// ---------------------------------------------------------------- island
function buildIsland(b, ctx, rng) {
  const R = 560;
  // Top surface: pale plaza stone with concentric paving bands and a little
  // per-face tone noise so it does not read as one flat white disc.
  const seg = 108;
  const rows = 18;
  for (let r = 0; r < rows; r++) {
    const r0 = (r / rows) * R, r1 = ((r + 1) / rows) * R;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
      const band = ((r % 3) === 0) ? 0.90 : 1.0;             // darker paving ring
      const tile = ((i + r) % 2) ? 1.0 : 0.975;
      const n = noise2(i * 0.83 + 3.1, r * 1.7 + 7.7) * 0.05;
      const c = mulc(C.stone, band * tile * (0.94 + n));
      const p00 = [Math.cos(a0) * r0, 0, Math.sin(a0) * r0];
      const p10 = [Math.cos(a1) * r0, 0, Math.sin(a1) * r0];
      const p11 = [Math.cos(a1) * r1, 0, Math.sin(a1) * r1];
      const p01 = [Math.cos(a0) * r1, 0, Math.sin(a0) * r1];
      const N = [0, 1, 0];
      b.tri(p00, p01, p11, c, MT.stone, N, N, N);
      b.tri(p00, p11, p10, c, MT.stone, N, N, N);
    }
  }
  // the rim: a stone parapet all the way around, then the cliff
  const PR = R - 3.0;
  for (let i = 0; i < 96; i++) {
    const a0 = (i / 96) * TAU, a1 = ((i + 1) / 96) * TAU;
    const x0 = Math.cos(a0) * PR, z0 = Math.sin(a0) * PR;
    const x1 = Math.cos(a1) * PR, z1 = Math.sin(a1) * PR;
    const n0 = [Math.cos(a0), 0, Math.sin(a0)], n1 = [Math.cos(a1), 0, Math.sin(a1)];
    const N = [Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2)];
    // inner face
    b.quad([x0, 0, z0], [x1, 0, z1], [x1, 2.4, z1], [x0, 2.4, z0], mulc(C.stone, 0.92), MT.stone, [-N[0], 0, -N[2]]);
    // outer face
    b.quad([x1, 0, z1], [x0, 0, z0], [x0, 2.4, z0], [x1, 2.4, z1], mulc(C.stone, 0.82), MT.stone, N);
    // coping
    b.quad([x0, 2.4, z0], [x1, 2.4, z1], [x1, 2.4, z1 + 0], [x0, 2.4, z0], C.marble, MT.marble, [0, 1, 0]);
    // a top cap band
    const ox0 = x0 * 1.014, oz0 = z0 * 1.014, ox1 = x1 * 1.014, oz1 = z1 * 1.014;
    b.quad([x0, 2.4, z0], [x1, 2.4, z1], [ox1, 2.4, oz1], [ox0, 2.4, oz0], C.marble, MT.marble, [0, 1, 0]);
  }
  // cliff below the parapet, in strata
  const bands = [
    [0, -7, 1.0], [-7, -24, 0.93], [-24, -48, 0.85], [-48, -78, 0.77], [-78, -120, 0.69],
  ];
  for (const [y0, y1, sh] of bands) {
    const rr = R * (1 - Math.abs(y1) / 780);
    for (let i = 0; i < 96; i++) {
      const a0 = (i / 96) * TAU, a1 = ((i + 1) / 96) * TAU;
      const c = mulc(C.stoneDark, sh * (0.9 + 0.1 * ((i % 3) / 2)));
      const p00 = [Math.cos(a0) * R, y0, Math.sin(a0) * R];
      const p10 = [Math.cos(a1) * R, y0, Math.sin(a1) * R];
      const p11 = [Math.cos(a1) * rr, y1, Math.sin(a1) * rr];
      const p01 = [Math.cos(a0) * rr, y1, Math.sin(a0) * rr];
      const N = [Math.cos((a0 + a1) / 2), 0.15, Math.sin((a0 + a1) / 2)];
      if (y1 < y0) b.quad(p00, p01, p11, p10, c, MT.stone, N);
      else b.quad(p00, p10, p11, p01, c, MT.stone, N);
    }
  }
}


// ---------------------------------------------------------------- sky props
// Big painted cumulus clusters, the cloud sea below the island, and a few
// distant floating islands that give the horizon its depth.
function buildCloudSea(b, ctx, rng) {
  // --- the cloud sea under the island ------------------------------------
  const seaY = -240;
  for (let i = 0; i < 680; i++) {
    const a = rng() * TAU;
    const r = 300 + Math.sqrt(rng()) * 2500;
    ctx.lanterns.push({
      p: [Math.cos(a) * r, seaY + rng() * 120 - 60, Math.sin(a) * r],
      size: 240 + rng() * 560,
      rot: rng() * TAU,
      alpha: 0.55 + rng() * 0.35,
      shape: 2,
      col: rng() > 0.5 ? rgb('#ffffff') : rgb('#dfeefc'),
    });
  }

  // --- big cumulus clusters up in the sky --------------------------------
  // A cumulus is built bottom-up: a wide flat-ish base, then two shrinking
  // domed rows. That silhouette (flat base + puffy crown) is what reads as a
  // painted anime cloud instead of a soft blob.
  const puff = (x, y, z, size, white, a) =>
    ctx.lanterns.push({ p: [x, y, z], size, rot: rng() * TAU, alpha: a, shape: 2,
                        col: white ? rgb('#ffffff') : rgb('#e7f1fc') });

  for (let i = 0; i < 13; i++) {
    const a0 = (i / 13) * TAU + rng() * 0.26;
    const dist = 900 + rng() * 1300;
    const cx = Math.cos(a0) * dist, cz = Math.sin(a0) * dist;
    const cy = 330 + rng() * 420;
    const S = 150 + rng() * 170;            // cluster half-width
    const nBase = 3 + Math.floor(rng() * 3);
    // base row
    for (let k = 0; k < nBase; k++) {
      const t = nBase === 1 ? 0 : (k / (nBase - 1)) * 2 - 1;
      puff(cx + t * S * 0.85, cy + (rng() - 0.5) * S * 0.10, cz + (rng() - 0.5) * S * 0.5,
           S * (0.55 + rng() * 0.22), false, 0.95);
    }
    // mid dome
    const nMid = 2 + Math.floor(rng() * 3);
    for (let k = 0; k < nMid; k++) {
      const t = nMid === 1 ? 0 : (k / (nMid - 1)) * 2 - 1;
      puff(cx + t * S * 0.55, cy + S * (0.26 + rng() * 0.10), cz + (rng() - 0.5) * S * 0.42,
           S * (0.52 + rng() * 0.20), k % 2 === 0, 1.0);
    }
    // crown
    const nTop = 1 + Math.floor(rng() * 2.4);
    for (let k = 0; k < nTop; k++) {
      const t = nTop === 1 ? 0 : (k / (nTop - 1)) * 2 - 1;
      puff(cx + t * S * 0.28, cy + S * (0.52 + rng() * 0.14), cz + (rng() - 0.5) * S * 0.3,
           S * (0.40 + rng() * 0.16), true, 1.0);
    }
  }

  // a low, hazy band of cloud hugging the horizon
  for (let i = 0; i < 46; i++) {
    const a0 = (i / 46) * TAU + rng() * 0.1;
    const dist = 1500 + rng() * 900;
    puff(Math.cos(a0) * dist, -30 + rng() * 90, Math.sin(a0) * dist,
         320 + rng() * 380, rng() > 0.4, 0.55 + rng() * 0.3);
  }

  // --- distant floating islands -----------------------------------------
  // Craggy rock + a flat cap: radial noise keeps the silhouette from reading
  // as a smooth bowl. Built as rings from the cap down to a point.
  for (let i = 0; i < 9; i++) {
    const a0 = rng() * TAU;
    const dist = 800 + rng() * 1500;
    const x = Math.cos(a0) * dist, z = Math.sin(a0) * dist;
    const y = -70 + rng() * 240;
    const R = 55 + rng() * 95;
    const depth = R * (1.5 + rng() * 1.1);
    const fade = 0.68 + rng() * 0.24;
    const rockCol = mulc(C.stoneDark, fade);
    const capCol = mulc(rng() > 0.5 ? C.leaf : C.stonePale, fade);
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
    const rings = 7, seg = 16;
    const ringP = [];
    for (let k = 0; k <= rings; k++) {
      const t = k / rings;
      const yy = -depth * Math.pow(t, 1.35);
      const rr = R * Math.pow(1 - t, 0.62);
      const row = [];
      for (let j = 0; j <= seg; j++) {
        const a = (j / seg) * TAU;
        const n = 0.78 + 0.44 * noise2(Math.cos(a) * 2.1 + i * 3.7, Math.sin(a) * 2.1 + t * 4.3);
        row.push([Math.cos(a) * rr * n, yy + (t > 0.02 ? (noise2(a * 3.1 + i, t * 9.1) - 0.5) * R * 0.12 : 0), Math.sin(a) * rr * n]);
      }
      ringP.push(row);
    }
    for (let k = 0; k < rings; k++) {
      for (let j = 0; j < seg; j++) {
        const c = mulc(rockCol, 0.78 + 0.3 * (1 - k / rings));
        b.tri(ringP[k][j], ringP[k][j + 1], ringP[k + 1][j + 1], c, MT.stone);
        b.tri(ringP[k][j], ringP[k + 1][j + 1], ringP[k + 1][j], c, MT.stone);
      }
    }
    // flat grassy/stone cap
    disc(b, R * 0.97, 16, capCol, MT.stone, { y: 0.5 });
    // a pale tower or two so the far skyline has landmarks in it
    if (rng() > 0.25) {
      const h = R * (0.8 + rng() * 1.4);
      const tx = (rng() - 0.5) * R, tz = (rng() - 0.5) * R;
      b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, tx, h / 2, tz, 1]);
      cylinder(b, 7, R * 0.11, R * 0.08, h, mulc(C.stonePale, fade), MT.stone, { caps: true });
      b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, h / 2, 0, 1]);
      cylinder(b, 7, R * 0.10, 0.5, R * 0.7, mulc(C.slate, fade), MT.stone, { caps: true });
      b.pop();
      b.pop();
    }
    b.pop();
  }

}