// CITY — the street grid, blocks, plaza, boulevards and the distant skyline.
// OWNER: agent "architect".
//
//   buildCity(b, ctx, rng) -> void      called once by world.js after the island
//
// Must fill the ring around the reserved anchors (see layout.js L): the grand
// boulevard, the central plaza + fountain, ~180 city blocks of Beaux-Arts
// buildings (built with arch.buildBuilding), sidewalk trees, lamp posts, a canal
// with two bridges, and the pale distant skyline ring that fades into the haze.
// Reserve the landmark/terrace zones — do not build inside them.
import { buildBuilding, balustrade, dome, spire, statue } from './arch.js';
import { C } from './palette.js';
import { MT, disc, ellipsoid, boxAt } from './lib3d.js';
import { box, cylinder, lathe, sphere, rgb, mulc, mixc } from './geo.js';
import { L } from './layout.js';
import { railRectDist } from './rail-path.js';
import { TAU, clamp, mulberry32 } from './math.js';

// ---------------------------------------------------------------- constants
const CROSS_Z = [68, 26, -14, -60, -104, -146, -186];   // cross-street centres
const XSTREET = [51, 105, 159, 213];                    // N-S street centres
const BLV = { x: 0, z0: 96, z1: -218, road: 7, walk: 13 };
const CANAL = { z: -232, half: 11, waterY: -3.0 };
const LX = {
  trunk: rgb('#7a6046'),
  hedge: C.leafDark,
  hedgeHi: C.leaf,
  road: mixc(C.stoneDark, C.stone, 0.5),
  walk: mulc(C.stonePale, 0.93),
  kerb: mulc(C.marble, 1.0),
  iron: C.iron,
  lamplight: C.goldBright,
  water: C.water,
  waterDp: C.waterDeep,
  gold: C.gold,
};

const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);

// ---------------------------------------------------------------- reserved tests
const RES_CIRCLES = () => [
  [L.cathedral.x, L.cathedral.z, 62],
  [L.glassPalace.x, L.glassPalace.z, 72],
  [L.ferris.x, L.ferris.z, 57],
  [L.plaza.x, L.plaza.z, 47],
];

// round 7: the two elongated landmarks are axis aligned now, so reserve their real
// rectangular footprints (a circle either ate a whole city block or left the apse
// sticking out into one). [cx, cz, w, d, margin]
const RES_RECTS = () => [
  // cathedral: local x +-29 / z +13..-88 around (-96,-24)
  [L.cathedral.x, L.cathedral.z - 37.5, 60, 103, 3],
  // station + its south forecourt: x 18..98 / z -168..-100
  [L.station.x, L.station.z + 8, 80, 70, 2],
  // round 8: the new opera house on the east side of the boulevard (x 67..141 / z -92..-36)
  // round 8: the opera house's real envelope is x 67..131 / z -94..-22 (opera-check);
  // the reserve is generous so nothing can ever be re-rolled into its steps or portico.
  [99, -58, 72, 82, 4],
];

// round 7: the rail distance now comes from rail-path.js, which samples the REAL
// Catmull-Rom curve the train runs on (the old local test used the control polygon,
// so the curve could bow into a building the polygon test called clear).

// exact overlap test: rotated box vs circle (keeps landmark plazas tight instead
// of the old conservative half-extent padding, which ate whole frontages)
function rectCircle(x, z, w, d, rot, cx, cz, r) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const dx = cx - x, dz = cz - z;
  const lx = c * dx - s * dz;    // circle centre in the box's local frame
  const lz = s * dx + c * dz;
  const qx = Math.max(-w / 2, Math.min(w / 2, lx));
  const qz = Math.max(-d / 2, Math.min(d / 2, lz));
  const ex = lx - qx, ez = lz - qz;
  return ex * ex + ez * ez < r * r;
}

// is a footprint (rotated box) clear of every reserved anchor / corridor?
function freeSpace(x, z, w, d, rot, margin = 0) {
  const c = Math.abs(Math.cos(rot)), s = Math.abs(Math.sin(rot));
  const hx = (c * w + s * d) / 2 + margin;
  const hz = (s * w + c * d) / 2 + margin;
  // terrace plateau + the palace complex behind it (terrace.js + palace.js)
  // round 8: the belvedere forecourt now reaches out to z=52 (the ring line used to run
  // across this band; with the track moved behind the palace the front of the terrace is
  // kept open as a parade ground instead of filling up with blocks).
  if (x + hx > -66 && x - hx < 66 && z + hz > 52 && z - hz < 188) return false;
  // boulevard corridor
  if (x + hx > -21 && x - hx < 21 && z + hz > -220 && z - hz < 100) return false;
  // canal corridor
  if (z + hz > CANAL.z - CANAL.half - 5 && z - hz < CANAL.z + CANAL.half + 5) return false;
  // landmark circles
  for (const [cx, cz, r] of RES_CIRCLES()) {
    if (rectCircle(x, z, w + margin * 2, d + margin * 2, rot, cx, cz, r)) return false;
  }
  // landmark rectangles (axis-aligned footprints; margin inside hx/hz already)
  for (const [cx, cz, rw, rd, m] of RES_RECTS()) {
    if (Math.abs(x - cx) < rw / 2 + hx + m && Math.abs(z - cz) < rd / 2 + hz + m) return false;
  }
  // elevated rail corridor: measure the REAL curve against the REAL footprint
  // (deck half width 3.3 m + 1.9 m clearance; +2 m for buildBuilding's plinth).
  // Negative margins (courtyard towers) must not shrink this test.
  const mRail = Math.max(margin, 0);
  if (railRectDist(x, z, w + mRail * 2 + 2.0, d + mRail * 2 + 2.0, rot) < 6.0) return false;
  // city disc
  if (Math.hypot(x, z) > 838 - Math.max(hx, hz)) return false;
  return true;
}

// ---------------------------------------------------------------- ground details
function paveX(b, xa, xb, za, zb, cA, cB, cell = 12) {
  const n = Math.max(1, Math.round(Math.abs(xb - xa) / cell));
  for (let i = 0; i < n; i++) {
    const x0 = xa + ((xb - xa) * i) / n, x1 = xa + ((xb - xa) * (i + 1)) / n;
    const c = i % 2 === 0 ? cA : cB;
    b.quad([x0, 0.025, za], [x1, 0.025, za], [x1, 0.025, zb], [x0, 0.025, zb], c, MT.stone, [0, 1, 0]);
  }
}
function paveZ(b, xa, xb, za, zb, cA, cB, cell = 12) {
  const n = Math.max(1, Math.round(Math.abs(zb - za) / cell));
  for (let i = 0; i < n; i++) {
    const z0 = za + ((zb - za) * i) / n, z1 = za + ((zb - za) * (i + 1)) / n;
    const c = i % 2 === 0 ? cA : cB;
    b.quad([xa, 0.025, z0], [xb, 0.025, z0], [xb, 0.025, z1], [xa, 0.025, z1], c, MT.stone, [0, 1, 0]);
  }
}

// near a reserved landmark? used to stop streets / allée trees running through it
function nearLandmark(x, z, extra) {
  for (const [cx, cz, r] of RES_CIRCLES()) {
    if (cx === 0 && cz === L.plaza.z) continue;
    const dx = x - cx, dz = z - cz;
    if (dx * dx + dz * dz < (r + extra) * (r + extra)) return true;
  }
  // round 7: the elongated landmarks are rectangles now — the station's footprint
  // used to get the z=-146 cross street and its avenue trees planted inside it.
  for (const [cx, cz, rw, rd, m] of RES_RECTS()) {
    if (Math.abs(x - cx) < rw / 2 + extra + m && Math.abs(z - cz) < rd / 2 + extra + m) return true;
  }
  return false;
}

function buildPaving(b, rng) {
  // ---- boulevard: carriageway + promenades + kerbs
  paveZ(b, -BLV.road, BLV.road, BLV.z0, BLV.z1, LX.road, mulc(LX.road, 0.94), 14);
  paveZ(b, -BLV.walk, -BLV.road, BLV.z0, BLV.z1, LX.walk, mulc(LX.walk, 0.97), 14);
  paveZ(b, BLV.road, BLV.walk, BLV.z0, BLV.z1, LX.walk, mulc(LX.walk, 0.97), 14);
  // building-front footway on both sides of the boulevard
  paveZ(b, -19.5, -BLV.walk, BLV.z0, BLV.z1, mulc(LX.walk, 0.95), LX.walk, 14);
  paveZ(b, BLV.walk, 19.5, BLV.z0, BLV.z1, mulc(LX.walk, 0.95), LX.walk, 14);
  // pale stone band down the middle + transverse paving joints (gives the
  // carriageway a readable scale instead of one flat grey ribbon)
  paveZ(b, -1.7, 1.7, BLV.z0, BLV.z1, mulc(LX.walk, 1.0), mulc(LX.walk, 0.95), 9);
  for (let z = 92; z > -214; z -= 9) {
    b.quad([-7, 0.04, z - 0.22], [7, 0.04, z - 0.22], [7, 0.04, z + 0.22], [-7, 0.04, z + 0.22], mulc(LX.road, 0.84), MT.stone, [0, 1, 0]);
  }
  // kerbs
  for (const kx of [-BLV.road, BLV.road, -BLV.walk, BLV.walk]) {
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, kx, 0.05, (BLV.z0 + BLV.z1) / 2, 1]);
    box(b, 0.34, 0.14, BLV.z0 - BLV.z1, LX.kerb, MT.stone, { topCol: mulc(LX.kerb, 1.06) });
    b.pop();
  }

  // ---- cross streets
  for (const cz of CROSS_Z) {
    const n = 34;
    for (let i = 0; i < n; i++) {
      const x0 = -252 + (504 * i) / n, x1 = -252 + (504 * (i + 1)) / n;
      const cx = (x0 + x1) / 2;
      if (nearLandmark(cx, cz, 4)) continue;
      if (cz > 86) continue;
      b.quad([x0, 0.02, cz - 7], [x1, 0.02, cz - 7], [x1, 0.02, cz + 7], [x0, 0.02, cz + 7], i % 2 ? LX.road : mulc(LX.road, 0.94), MT.stone, [0, 1, 0]);
      // kerb line
      b.quad([x0, 0.05, cz - 7.2], [x1, 0.05, cz - 7.2], [x1, 0.05, cz - 6.8], [x0, 0.05, cz - 6.8], LX.kerb, MT.stone, [0, 1, 0]);
      b.quad([x0, 0.05, cz + 6.8], [x1, 0.05, cz + 6.8], [x1, 0.05, cz + 7.2], [x0, 0.05, cz + 7.2], LX.kerb, MT.stone, [0, 1, 0]);
    }
  }
  // ---- N-S streets
  for (const sx of [-1, 1]) {
    for (const xc of XSTREET) {
      const cx0 = sx > 0 ? xc : -xc;
      const n = 16;
      for (let i = 0; i < n; i++) {
        const z0 = 96 - (314 * i) / n, z1 = 96 - (314 * (i + 1)) / n;
        const cz = (z0 + z1) / 2;
        if (nearLandmark(cx0, cz, 4)) continue;
        b.quad([cx0 - 7, 0.02, z0], [cx0 + 7, 0.02, z0], [cx0 + 7, 0.02, z1], [cx0 - 7, 0.02, z1], i % 2 ? LX.road : mulc(LX.road, 0.94), MT.stone, [0, 1, 0]);
      }
    }
  }
  // ---- plaza paving
  // round 9: the plaza is a raised paved terrace — every layer sits at y >= 0.075, i.e.
  // above the cross-street kerbs (y = 0.05) that used to poke up through the old floor
  // as stray white slivers. See plazaPaving() for the ring/avenue drawing.
  plazaPaving(b);

  // ---- canal water (painted before the quays)
  const cz = CANAL.z, hw = CANAL.half;
  const rows = 6;
  const wMat = [0.05, 0.34];
  for (let r = 0; r < rows; r++) {
    const z0 = cz - hw + (2 * hw * r) / rows, z1 = cz - hw + (2 * hw * (r + 1)) / rows;
    const t = Math.abs((r + 0.5) / rows - 0.5) * 2;
    const c = mixc(LX.waterDp, LX.water, 0.25 + 0.55 * t);
    b.quad([-252, CANAL.waterY, z0], [252, CANAL.waterY, z0], [252, CANAL.waterY, z1], [-252, CANAL.waterY, z1], c, wMat, [0, 1, 0]);
  }
  // ripple lines + glints (kept off the specular blow-out)
  const rip = mixc(LX.water, C.glass, 0.34);
  for (let i = 0; i < 40; i++) {
    const gx = -246 + rng() * 492;
    const gz = cz - hw + 1.2 + rng() * (2 * hw - 2.4);
    const gw = 2 + rng() * 6;
    b.quad([gx, CANAL.waterY + 0.02, gz - 0.26], [gx + gw, CANAL.waterY + 0.02, gz - 0.26], [gx + gw, CANAL.waterY + 0.02, gz + 0.26], [gx, CANAL.waterY + 0.02, gz + 0.26], mixc(rip, C.glassFrame, 0.25), wMat, [0, 1, 0]);
  }
}

// ---------------------------------------------------------------- props
function tree(b, rng, x, z, s) {
  const k = s || 1;
  const leaf = mixc(C.leaf, C.leafLight, 0.22 + rng() * 0.22);
  const leafHi = mixc(C.leafLight, C.bloomWhite, 0.22);
  const leafLo = mixc(C.leaf, C.leafDark, 0.42);
  const colFn = (v) => (v > 0.72 ? leafHi : v > 0.3 ? leaf : mixc(leaf, leafLo, 0.5 - v));
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, z, 1]);
  cylinder(b, 5, 0.22 * k, 0.14 * k, 3.4 * k, LX.trunk, MT.matte, { y0: 0, caps: false });
  b.pop();
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 4.8 * k, z, 1]);
  ellipsoid(b, 1.85 * k, 2.35 * k, 1.85 * k, 8, 6, leaf, MT.leaf, { colFn: (v) => colFn(v) });
  b.pop();
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x + 0.35 * k, 6.2 * k, z - 0.2 * k, 1]);
  ellipsoid(b, 1.05 * k, 1.0 * k, 1.05 * k, 6, 4, leafHi, MT.leaf, { colFn: () => leafHi });
  b.pop();
}

function lamp(b, rng, x, z, h) {
  const hh = h || 4.6;
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, z, 1]);
  box(b, 0.68, 0.34, 0.68, LX.iron, MT.metal, { topCol: mulc(LX.iron, 1.15) });
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0.17, 0, 1]);
  cylinder(b, 5, 0.14, 0.085, hh, LX.iron, MT.metal, { y0: 0, caps: false });
  b.pop();
  // scroll brackets
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, hh - 0.55, 0, 1]);
  box(b, 0.95, 0.1, 0.1, LX.iron, MT.metal);
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0.55, 0, 1]);
  // lantern
  box(b, 0.44, 0.72, 0.44, LX.iron, MT.metal, { topCol: mulc(LX.iron, 1.2) });
  box(b, 0.3, 0.5, 0.3, mixc(C.glassFrame, LX.lamplight, 0.4), MT.glass, { topCol: C.glassFrame });
  // cap
  box(b, 0.6, 0.1, 0.6, LX.iron, MT.metal);
  b.pop();
  b.pop();
  b.pop();
}

function planter(b, rng, x, z) {
  const cols = [
    mixc(C.bloomPink, C.bloomWhite, 0.42), mixc(C.bloomYellow, C.bloomWhite, 0.35),
    mixc(C.bloomRed, C.bloomPink, 0.5), mixc(C.bloomWhite, C.bloomYellow, 0.2), mixc(C.bloomBlue, C.bloomWhite, 0.5),
  ];
  const c = cols[Math.floor(rng() * cols.length)];
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, z, 1]);
  box(b, 1.9, 0.5, 1.9, C.marble, MT.stone, { topCol: mulc(C.marble, 1.04) });
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0.42, 0, 1]);
  box(b, 1.55, 0.34, 1.55, c, MT.cloth, { topCol: mixc(c, C.bloomWhite, 0.3) });
  b.pop();
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0.2, 0, 1]);
  box(b, 1.0, 0.5, 1.0, LX.hedge, MT.leaf, { topCol: LX.hedgeHi });
  b.pop();
  b.pop();
}

function bench(b, rng, x, z, rot) {
  const c = Math.cos(rot || 0), s = Math.sin(rot || 0);
  b.push([c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, x, 0, z, 1]);
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0.46, 0, 1]);
  box(b, 1.9, 0.1, 0.62, C.stonePale, MT.stone, { topCol: mulc(C.stonePale, 1.05) });
  b.pop();
  for (const sx2 of [-1, 1]) {
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, sx2 * 0.72, 0, 0, 1]);
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0.22, 0, 1]);
    box(b, 0.12, 0.44, 0.56, LX.iron, MT.metal);
    b.pop();
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0.66, -0.26, 1]);
    box(b, 1.9, 0.42, 0.08, C.stonePale, MT.stone, { topCol: mulc(C.stonePale, 1.05) });
    b.pop();
    b.pop();
  }
  b.pop();
}

function topiary(b, rng, x, z) {
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, z, 1]);
  box(b, 1.3, 0.5, 1.3, C.marble, MT.stone, { topCol: C.stonePale });
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0.5, 0, 1]);
  cylinder(b, 5, 0.34, 0.05, 1.9, mixc(C.leaf, C.leafLight, 0.35), MT.leaf, { y0: 0, caps: false });
  b.pop();
  b.pop();
}

function hedge(b, x, z, w, d, h) {
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, z, 1]);
  box(b, w, h, d, LX.hedge, MT.leaf, { topCol: LX.hedgeHi });
  b.pop();
}

function gardenWall(b, x, z, w, d, rot) {
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, z, 1]);
  box(b, w, 1.5, d, C.stoneWarm, MT.stone, { topCol: C.stonePale });
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1.5, 0, 1]);
  box(b, w + 0.3, 0.24, d + 0.3, C.stonePale, MT.stone);
  b.pop();
  b.pop();
}

// ---------------------------------------------------------------- boulevard frontage
function buildBoulevard(b, ctx, rng) {
  for (const side of [-1, 1]) {
    // z spans between cross streets
    const spans = [];
    let zTop = 86;
    for (const cz of CROSS_Z) {
      const hi = cz + 8, lo = cz - 8;
      if (zTop - hi > 9) spans.push([zTop, hi]);
      zTop = Math.min(zTop, lo);
    }
    if (zTop > -212) spans.push([zTop, -212]);
    for (const [za, zb] of spans) {
      let zz = za;
      let guard = 0;
      while (zz - zb > 9 && guard++ < 20) {
        const room = zz - zb;
        let bw = 19 + rng() * 15;
        if (room - bw < 11) bw = room;
        if (bw > room) bw = room;
        let dpt = 24 + rng() * 7;
        const rot = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        let cx = side * (19 + dpt / 2), ccz = zz - bw / 2;
        let bwUse = bw - 0.5;
        if (!freeSpace(cx, ccz, bwUse, dpt, rot)) {
          // pull the building back to a smaller footprint so the street wall stays
          dpt = 16 + rng() * 5;
          cx = side * (19 + dpt / 2);
          bwUse = Math.max(12, bw * 0.62);
          ccz = zz - bwUse / 2;
        }
        if (freeSpace(cx, ccz, bwUse, dpt, rot)) {
          const floors = 7 + Math.round(rng() * 1.6);
          const det = rng() < 0.45 ? 2 : 1;
          const roofs = ['mansard', 'mansard', 'mansard', 'balcony', 'dome', 'tower'];
          buildBuilding(b, ctx, rng, {
            x: cx, z: ccz, rot, w: bwUse, d: dpt, floors,
            tone: 0.3 + rng() * 0.4,
            detail: det,
            roof: roofs[Math.floor(rng() * roofs.length)],
            sides: det === 2 ? 4 : 4,
          });
        } else {
          // formal garden forecourt: balustrade, lawn, trees, flowers
          const gx = side * 19.6;
          b.push([0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, gx, 0.04, ccz, 1]);
          balustrade(b, bw - 2.4, 1.15, C.marble);
          b.pop();
          const lawnX0 = side > 0 ? 20.8 : -35.0, lawnX1 = side > 0 ? 35.0 : -20.8;
          b.quad([lawnX0, 0.042, ccz - bw / 2 + 1.4], [lawnX1, 0.042, ccz - bw / 2 + 1.4], [lawnX1, 0.042, ccz + bw / 2 - 1.4], [lawnX0, 0.042, ccz + bw / 2 - 1.4], mixc(C.lawn, C.leafDark, 0.42), MT.matte, [0, 1, 0]);
          // flower border on the street edge
          const bedCol = [
            mixc(C.bloomPink, C.bloomWhite, 0.45), mixc(C.bloomYellow, C.bloomWhite, 0.35),
            mixc(C.bloomRed, C.bloomPink, 0.5),
          ][Math.floor(rng() * 3)];
          b.quad([side > 0 ? 20.9 : -23.4, 0.06, ccz - bw / 2 + 1.6], [side > 0 ? 23.4 : -20.9, 0.06, ccz - bw / 2 + 1.6], [side > 0 ? 23.4 : -20.9, 0.06, ccz + bw / 2 - 1.6], [side > 0 ? 20.9 : -23.4, 0.06, ccz + bw / 2 - 1.6], bedCol, MT.matte, [0, 1, 0]);
          b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, side * 35.4, 0, ccz, 1]);
          box(b, 2.4, 1.3, bw - 3, LX.hedge, MT.leaf, { topCol: LX.hedgeHi });
          b.pop();
          const ntree = bw > 22 ? 3 : 2;
          for (let i = 0; i < ntree; i++) {
            tree(b, rng, side * (27 + rng() * 5), ccz - bw / 2 + 3 + ((bw - 6) * (i + 0.5)) / ntree, 1.05 + rng() * 0.2);
          }
        }
        zz -= bw;
      }
    }
  }
}

// ---------------------------------------------------------------- blocks
const XBANDS = [[58, 98], [112, 152], [166, 206], [220, 252]];
const ZBANDS = [[79, 36], [18, -6], [-22, -53], [-68, -97], [-112, -140], [-155, -179], [-194, -212]];

function buildingIn(b, ctx, rng, x, z, w, d, rot, opts) {
  let ww = w - 0.6, dd = d;
  if (!freeSpace(x, z, ww, dd, rot)) {
    // squeeze into the gap (landmark plazas, rail corridor, avenue corners)
    ww = w * 0.62; dd = d * 0.7;
    if (!freeSpace(x, z, ww, dd, rot)) return false;
  }
  w = ww + 0.6;
  const floors = num(opts && opts.floors, 5 + Math.round(rng() * 2.6));
  const det = num(opts && opts.detail, rng() < 0.2 ? 2 : rng() < 0.95 ? 1 : 0);
  const roofs = ['mansard', 'mansard', 'mansard', 'mansard', 'balcony', 'balcony', 'dome', 'tower', 'flat'];
  buildBuilding(b, ctx, rng, {
    x, z, rot, w: w - 0.6, d: dd, floors,
    tone: 0.28 + rng() * 0.45,
    detail: det,
    roof: (opts && opts.roof) || roofs[Math.floor(rng() * roofs.length)],
    sides: det === 2 ? 4 : 3,
  });
  return true;
}

function blockFill(b, ctx, rng, x0, x1, z0, z1, band) {
  const bw = x1 - x0, bd = z1 - z0;
  if (bw < 15 || bd < 15) return;
  const dep = clamp(Math.min(bw, bd) * 0.42, 13, 20);

  // --- row on the street-facing x edge (facades face +/-X)
  const west = band < 2;   // inner bands face the boulevard side (west for x>0 blocks handled below)
  const faceWest = rng() < 0.55;
  const rx = faceWest ? x0 : x1;
  const rotA = faceWest ? -Math.PI / 2 : Math.PI / 2;
  const ax = faceWest ? x0 + dep / 2 : x1 - dep / 2;
  const tall = band <= 1 ? 1 : 0;      // inner bands next to the boulevard stand taller
  const nA = Math.max(1, Math.round(bd / 22));
  for (let i = 0; i < nA; i++) {
    const wA = bd / nA;
    const az = z0 + wA * (i + 0.5);
    buildingIn(b, ctx, rng, ax, az, wA, dep, rotA, { floors: (tall ? 7 : 5) + Math.round(rng() * 1.6) });
  }
  // --- row on the z-facing edge (facades face +/-Z), offset so it does not overlap row A
  const faceSouth = rng() < 0.55;
  const rz = faceSouth ? z1 : z0;
  const rotB = faceSouth ? 0 : Math.PI;
  const bz = faceSouth ? z1 - dep / 2 : z0 + dep / 2;
  const remW = bw - dep;
  if (remW > 18) {
    const nB = Math.max(1, Math.round(remW / 23));
    for (let i = 0; i < nB; i++) {
      const wB = remW / nB;
      const bx = (faceWest ? x0 + dep : x1 - dep - remW) + wB * (i + 0.5);
      buildingIn(b, ctx, rng, bx, bz, wB, dep, rotB, { floors: (tall ? 6 : 5) + Math.round(rng() * 1.6) });
    }
  }
  // --- a grand block tower / dome rising out of the courtyard (secondary skyline)
  if (band <= 2 && rng() < 0.5) {
    const tx = (x0 + x1) / 2, tz = (z0 + z1) / 2;
    const tw = 14 + rng() * 5, td = 14 + rng() * 5;
    if (freeSpace(tx, tz, tw, td, 0, 0)) {   // round 7: no negative margin, keeps reserves honest
      const roofs = ['tower', 'dome', 'tower', 'dome', 'mansard'];
      buildBuilding(b, ctx, rng, {
        x: tx, z: tz, rot: 0, w: tw, d: td,
        floors: 8 + Math.round(rng() * 1.2),
        tone: 0.22 + rng() * 0.4,
        detail: 2,
        roof: roofs[Math.floor(rng() * roofs.length)],
        sides: 4,
      });
    }
  }
  // --- courtyard: lawn + low wing + trees
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const cw = Math.max(6, bw - dep - 6), cd = Math.max(6, bd - dep - 6);
  if (freeSpace(cx, cz, cw, cd, 0, -2)) {
    if (cw > 10 && cd > 10) {
      b.quad([cx - cw / 2, 0.04, cz - cd / 2], [cx + cw / 2, 0.04, cz - cd / 2], [cx + cw / 2, 0.04, cz + cd / 2], [cx - cw / 2, 0.04, cz + cd / 2], mixc(C.lawn, C.leafDark, 0.3), MT.matte, [0, 1, 0]);
      const n = 1 + Math.floor(rng() * 2);
      for (let i = 0; i < n; i++) {
        tree(b, rng, cx + (rng() - 0.5) * cw * 0.6, cz + (rng() - 0.5) * cd * 0.6, 0.8 + rng() * 0.4);
      }
      // low courtyard wing
      if (rng() > 0.45) {
        const ww = Math.min(cw * 0.6, 18), wd = Math.min(cd * 0.5, 12);
        b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, cx, 0, cz, 1]);
        box(b, ww, 9, wd, mixc(C.stone, C.stoneWarm, 0.4), MT.stone, { topCol: C.stonePale });
        box(b, ww + 0.6, 0.7, wd + 0.6, C.slate, MT.stone, { topCol: C.slateLight });
        b.pop();
      }
    }
  }
}

function buildBlocks(b, ctx, rng) {
  for (const sx of [-1, 1]) {
    for (let band = 0; band < XBANDS.length; band++) {
      const [xa, xb] = XBANDS[band];
      const x0 = sx > 0 ? xa : -xb, x1 = sx > 0 ? xb : -xa;
      for (const [zhi, zlo] of ZBANDS) {
        blockFill(b, ctx, rng, x0, x1, zlo, zhi, band);
      }
    }
    // north quarter framing the terrace
    for (const [xa, xb] of [[64, 104], [112, 152], [160, 208]]) {
      const x0 = sx > 0 ? xa : -xb, x1 = sx > 0 ? xb : -xa;
      for (const [zhi, zlo] of [[152, 116], [190, 158], [226, 196]]) {
        blockFill(b, ctx, rng, x0, x1, zlo, zhi, 1);
      }
    }
  }
}

// ---------------------------------------------------------------- plaza + fountain
function ringStep(b, cx, cz, rIn, rOut, y0, y1, col, seg) {
  const n = seg || 30;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU;
    const ca0 = Math.cos(a0), sa0 = Math.sin(a0), ca1 = Math.cos(a1), sa1 = Math.sin(a1);
    const p0 = [cx + ca0 * rOut, y0, cz + sa0 * rOut];
    const p1 = [cx + ca1 * rOut, y0, cz + sa1 * rOut];
    const p2 = [cx + ca1 * rOut, y1, cz + sa1 * rOut];
    const p3 = [cx + ca0 * rOut, y1, cz + sa0 * rOut];
    const nm = [(ca0 + ca1) / 2, 0, (sa0 + sa1) / 2];
    b.quad(p0, p1, p2, p3, mulc(col, 0.93), MT.stone, nm);
    // top annulus
    b.quad(
      [cx + ca0 * rIn, y1, cz + sa0 * rIn], [cx + ca1 * rIn, y1, cz + sa1 * rIn],
      [cx + ca1 * rOut, y1, cz + sa1 * rOut], [cx + ca0 * rOut, y1, cz + sa0 * rOut],
      mulc(col, 1.04), MT.stone, [0, 1, 0]
    );
    if (rIn > 0.2) {
      const p4 = [cx + ca0 * rIn, y0, cz + sa0 * rIn];
      const p5 = [cx + ca1 * rIn, y0, cz + sa1 * rIn];
      const p6 = [cx + ca1 * rIn, y1, cz + sa1 * rIn];
      const p7 = [cx + ca0 * rIn, y1, cz + sa0 * rIn];
      b.quad(p4, p5, p6, p7, mulc(col, 0.8), MT.stone, [-nm[0], 0, -nm[2]]);
    }
  }
}

// flat, correctly-positioned water disc (lib3d.disc lifts the rim but not the
// centre vertex, which turns a "water surface" into a cone — so do it here)
function waterDisc(b, cx, cy, cz, r, col, seg) {
  const n = seg || 28;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU;
    const p0 = [cx + Math.cos(a0) * r, cy, cz + Math.sin(a0) * r];
    const p1 = [cx + Math.cos(a1) * r, cy, cz + Math.sin(a1) * r];
    const shade = 0.9 + 0.1 * Math.cos(a0 - 0.6);
    b.tri([cx, cy, cz], p0, p1, mulc(col, shade), MT.glass, [0, 1, 0], [0, 1, 0], [0, 1, 0]);
  }
}

// thin flat ring on the water (ripple / foam line)
function waterRing(b, cx, cy, cz, r0, r1, col, seg) {
  const n = seg || 28;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU;
    b.quad(
      [cx + Math.cos(a0) * r0, cy, cz + Math.sin(a0) * r0], [cx + Math.cos(a1) * r0, cy, cz + Math.sin(a1) * r0],
      [cx + Math.cos(a1) * r1, cy, cz + Math.sin(a1) * r1], [cx + Math.cos(a0) * r1, cy, cz + Math.sin(a0) * r1],
      col, MT.glass, [0, 1, 0]
    );
  }
}

// low marble step ring that seats the basin on the raised plaza terrace
function fountainRing(b) {
  const cx = L.plaza.x, cz = L.plaza.z;
  ringStep(b, cx, cz, 16.7, 17.5, 0, 0.13, C.marbleShade, 48);
  ringStep(b, cx, cz, 15.9, 16.7, 0, 0.19, C.marbleShade, 48);
  ringStep(b, cx, cz, 14.8, 15.9, 0, 0.27, C.marble, 48);
}

function fountain(b, ctx) {
  const cx = L.plaza.x, cz = L.plaza.z;
  const water = mixc(LX.water, C.glass, 0.4);
  const foam = mixc(C.glassFrame, C.glass, 0.22);
  // stepped basin
  ringStep(b, cx, cz, 13.4, 14.8, 0, 0.42, C.marbleShade, 36);
  ringStep(b, cx, cz, 11.6, 13.4, 0, 0.95, C.marble, 36);
  // water surface + foam rings
  waterDisc(b, cx, 0.88, cz, 11.6, water, 36);
  waterRing(b, cx, 0.9, cz, 10.2, 10.5, foam, 36);
  waterRing(b, cx, 0.9, cz, 7.4, 7.6, foam, 36);
  // central pedestal
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, cx, 0.9, cz, 1]);
  lathe(b, [[2.9, 0], [2.6, 0.6], [1.9, 1.5], [1.3, 2.4], [1.2, 3.2], [1.7, 3.5], [3.9, 3.75], [4.3, 4.05], [4.0, 4.25]], 16, C.marble, MT.marble);
  b.pop();
  waterDisc(b, cx, 5.16, cz, 4.05, water, 24);
  // upper stem + small bowl
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, cx, 5.12, cz, 1]);
  lathe(b, [[0.85, 0], [0.72, 0.85], [0.62, 1.7], [2.3, 1.95], [2.6, 2.2], [2.3, 2.35]], 12, C.marble, MT.marble);
  b.pop();
  waterDisc(b, cx, 7.5, cz, 2.35, water, 18);
  // top figure
  statue(b, cx, 7.4, cz, 1.25, C.stonePale);
  // four river gods at the basin rim
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    const sx = cx + Math.cos(a) * 9.4, sz = cz + Math.sin(a) * 9.4;
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, sx, 0.95, sz, 1]);
    box(b, 2.2, 1.15, 2.2, C.stonePale, MT.stone, { topCol: mulc(C.stonePale, 1.06) });
    b.pop();
    statue(b, sx, 2.1, sz, 0.85, C.stonePale);
  }
  // tapered jets around the centre
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const jx = cx + Math.cos(a) * 6.4, jz = cz + Math.sin(a) * 6.4;
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, jx, 0.88, jz, 1]);
    cylinder(b, 4, 0.2, 0.03, 2.9 + (i % 2) * 1.0, mixc(C.glassFrame, C.glass, 0.35), MT.glass, { y0: 0, caps: false });
    b.pop();
  }
}

// ---------------------------------------------------------------- plaza (round 9)
// Client: "there are uneven railings lying on the ground in the central plaza — look
// at the famous squares of the world and make the central plaza properly."  The old
// plaza was 8 broken balustrade arcs at R=45.4 whose openings had nothing to do with
// the streets, plus 24 planters / 16 trees / 8 benches at hand-picked angles (crossed,
// wrong-facing, on the lawns), and — second source of the white slivers on the floor —
// the cross-street kerbs at y=0.05 poking up through the plaza paving at y=0.03..0.05.
//
// The plaza is now a formal Beaux-Arts round place (Place de la Concorde / Piazza del
// Popolo / Ringstrasse parterres, fused):
//   - a raised paved terrace, every paving layer at y >= 0.075 (above the 0.05 kerbs);
//   - ONE continuous stone balustrade ring at R=44, opened ONLY where a real street
//     crosses it (the N-S boulevard, and the z=-14 / z=-60 cross streets), with paired
//     gate posts on every opening;
//   - two concentric parterre rings (marble kerb + clipped hedge + lawn + flower bands);
//   - four long railing runs, each with one statue, paired lamp posts, four benches and
//     a six-tree allée, all at fixed, mirror-symmetric angles;
//   - sculpted pylon gates with statues framing the N-S boulevard axis.
// Mirror symmetry is about x=0 (the boulevard axis). Everything is deterministic: the
// layout is analytic, and buildPlaza burns exactly the 40 shared rng() draws the old
// code used (16 tree leaf tints + 24 planter colours) so no later city stage is
// re-rolled; any leftover variation comes from a local mulberry32.
const DEG = Math.PI / 180;
const PLZ = {
  R: 44,              // balustrade centre line
  PAVE_R: 46,         // paved terrace radius
  BLV_HALF: 13,       // N-S boulevard walk half-width, measured at the ring
  STREET_HALF: 8,     // cross-street corridor half-width, measured at the ring
  Y: { apron: 0.075, field: 0.080, ring: 0.086, band: 0.092, bed: 0.098, grass: 0.135, edge: 0.158 },
};

// what the plaza actually built (read by tools/plaza-check.mjs)
export const plazaLast = { elements: [], spec: null };

function rec(kind, x, z) {
  plazaLast.elements.push({ kind, x: +x.toFixed(4), z: +z.toFixed(4) });
}

// the openings in the balustrade ring are exactly where a real street cuts R=44
export function plazaSpec() {
  const cx = L.plaza.x, cz = L.plaza.z, R = PLZ.R;
  const gaps = [];
  // N-S boulevard (road + promenade): |x| <= BLV_HALF at the ring
  const hb = Math.asin(Math.min(1, PLZ.BLV_HALF / R));
  for (const base of [Math.PI * 0.5, Math.PI * 1.5]) gaps.push({ a0: base - hb, a1: base + hb, kind: 'boulevard' });
  // cross streets run along x, so each one cuts the ring twice (east + west mouth)
  for (const czs of CROSS_Z) {
    const dz = czs - cz, w = PLZ.STREET_HALF;
    if (Math.abs(dz) > R + w) continue;
    const sHi = (dz + w) / R, sLo = (dz - w) / R;
    if (sHi <= -1 || sLo >= 1) continue;
    const u0 = Math.asin(clamp(sHi, -1, 1)), u1 = Math.asin(clamp(sLo, -1, 1));
    gaps.push({ a0: u1, a1: u0, kind: 'street' });
    gaps.push({ a0: Math.PI - u0, a1: Math.PI - u1, kind: 'street' });
  }
  for (const g of gaps) {
    const w = g.a1 - g.a0;
    g.a0 = ((g.a0 % TAU) + TAU) % TAU;
    g.a1 = g.a0 + w;
    g.w = w;
  }
  gaps.sort((p, q) => p.a0 - q.a0);
  const segs = [];
  for (let i = 0; i < gaps.length; i++) {
    const g = gaps[i], nx = gaps[(i + 1) % gaps.length];
    const a0 = g.a1;
    const a1 = i === gaps.length - 1 ? nx.a0 + TAU : nx.a0;
    segs.push({ a0, a1, w: a1 - a0, k0: g.kind, k1: nx.kind });
  }
  return { cx, cz, R, gaps, segs };
}

const gateHalf = (kind) => (kind === 'boulevard' ? 1.70 : 1.00) / PLZ.R; // half footprint, rad

// local -> world yaw matrix (same convention as the rest of this file)
function yawXf(x, y, z, rot) {
  const c = Math.cos(rot), s = Math.sin(rot);
  return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, x, y, z, 1];
}

// flat annular-sector band (top face only)
function arcBand(b, cx, cz, r0, r1, a0, a1, y, col, mat) {
  const n = Math.max(1, Math.ceil((a1 - a0) / (4 * DEG)));
  for (let i = 0; i < n; i++) {
    const t0 = a0 + ((a1 - a0) * i) / n, t1 = a0 + ((a1 - a0) * (i + 1)) / n;
    const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
    b.quad([cx + c0 * r0, y, cz + s0 * r0], [cx + c1 * r0, y, cz + s1 * r0],
      [cx + c1 * r1, y, cz + s1 * r1], [cx + c0 * r1, y, cz + s0 * r1], col, mat, [0, 1, 0]);
  }
}

// raised annular-sector solid: top band + both vertical faces + end caps
function arcRaise(b, cx, cz, r0, r1, a0, a1, y0, y1, col, topCol, mat) {
  const n = Math.max(1, Math.ceil((a1 - a0) / (4 * DEG)));
  const side = mulc(col, 0.94), inside = mulc(col, 0.84);
  for (let i = 0; i < n; i++) {
    const t0 = a0 + ((a1 - a0) * i) / n, t1 = a0 + ((a1 - a0) * (i + 1)) / n;
    const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
    const x0 = cx + c0 * r0, z0 = cz + s0 * r0, X0 = cx + c0 * r1, Z0 = cz + s0 * r1;
    const x1 = cx + c1 * r0, z1 = cz + s1 * r0, X1 = cx + c1 * r1, Z1 = cz + s1 * r1;
    b.quad([x0, y1, z0], [x1, y1, z1], [X1, y1, Z1], [X0, y1, Z0], topCol, mat, [0, 1, 0]);
    b.quad([X0, y0, Z0], [X1, y0, Z1], [X1, y1, Z1], [X0, y1, Z0], side, mat, [(c0 + c1) / 2, 0, (s0 + s1) / 2]);
    b.quad([x1, y0, z1], [x0, y0, z0], [x0, y1, z0], [x1, y1, z1], inside, mat, [-(c0 + c1) / 2, 0, -(s0 + s1) / 2]);
  }
  const cap = (a, nn) => {
    const c = Math.cos(a), s = Math.sin(a);
    b.quad([cx + c * r0, y0, cz + s * r0], [cx + c * r1, y0, cz + s * r1],
      [cx + c * r1, y1, cz + s * r1], [cx + c * r0, y1, cz + s * r0], mulc(col, 0.9), mat, nn);
  };
  cap(a0, [Math.sin(a0), 0, -Math.cos(a0)]);
  cap(a1, [-Math.sin(a1), 0, Math.cos(a1)]);
}

// clipped hedge ribbon (top + both sides + end caps), same shape as arcRaise but leaf
function hedgeArc(b, cx, cz, r0, r1, a0, a1, y0, y1, col) {
  const n = Math.max(1, Math.ceil((a1 - a0) / (4 * DEG)));
  const hi = mixc(mixc(col, C.leafLight, 0.72), C.lawn, 0.10), lo = mulc(col, 0.82);
  for (let i = 0; i < n; i++) {
    const t0 = a0 + ((a1 - a0) * i) / n, t1 = a0 + ((a1 - a0) * (i + 1)) / n;
    const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
    const x0 = cx + c0 * r0, z0 = cz + s0 * r0, X0 = cx + c0 * r1, Z0 = cz + s0 * r1;
    const x1 = cx + c1 * r0, z1 = cz + s1 * r0, X1 = cx + c1 * r1, Z1 = cz + s1 * r1;
    const nm = [(c0 + c1) / 2, 0, (s0 + s1) / 2];
    b.quad([x0, y1, z0], [x1, y1, z1], [X1, y1, Z1], [X0, y1, Z0], hi, MT.leaf, [0, 1, 0]);
    b.quad([X0, y0, Z0], [X1, y0, Z1], [X1, y1, Z1], [X0, y1, Z0], mulc(col, 0.9), MT.leaf, nm);
    b.quad([x1, y0, z1], [x0, y0, z0], [x0, y1, z0], [x1, y1, z1], lo, MT.leaf, [-nm[0], 0, -nm[2]]);
  }
  const cap = (a, nn) => {
    const c = Math.cos(a), s = Math.sin(a);
    b.quad([cx + c * r0, y0, cz + s * r0], [cx + c * r1, y0, cz + s * r1],
      [cx + c * r1, y1, cz + s * r1], [cx + c * r0, y1, cz + s * r0], mulc(col, 0.86), MT.leaf, nn);
  };
  cap(a0, [Math.sin(a0), 0, -Math.cos(a0)]);
  cap(a1, [-Math.sin(a1), 0, Math.cos(a1)]);
}

// ---------------------------------------------------------------- plaza furniture
// trimmed bay/box shrub on a marble plinth (the shared topiary() sinks its box into the
// ground and reads as a green brick from eye level)
function plazaTopiary(b, x, z) {
  const Y = PLZ.Y.ring;
  const leaf = mixc(C.leaf, C.leafLight, 0.35), leafHi = mixc(C.leafLight, C.lawn, 0.25);
  b.push(yawXf(x, Y, z, 0));
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0.26, 0, 1]);
  box(b, 0.86, 0.52, 0.86, C.stone, MT.stone, { topCol: C.stonePale });
  b.pop();
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1.18, 0, 1]);
  ellipsoid(b, 0.66, 0.76, 0.66, 8, 6, leaf, MT.leaf, { colFn: (v) => (v > 0.6 ? leafHi : mixc(leaf, C.leafDark, 0.35 - v * 0.2)) });
  b.pop();
  b.pop();
}

// plaza lamp post: bronze stepped base + wide fluted shaft + a readable lantern head
// (the shared lamp() is a 0.1 m needle that disappears in daylight)
function plazaLamp(b, ctx, x, z) {
  const Y = PLZ.Y.ring;
  const dark = C.iron, brass = C.brass;
  b.push(yawXf(x, Y, z, 0));
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0.11, 0, 1]);
  box(b, 1.00, 0.22, 1.00, C.stone, MT.stone, { topCol: C.stonePale });
  b.pop();
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0.39, 0, 1]);
  box(b, 0.78, 0.34, 0.78, brass, MT.gold);
  b.pop();
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0.56, 0, 1]);
  cylinder(b, 8, 0.20, 0.14, 3.95, dark, MT.metal, { y0: 0, caps: false });
  b.pop();
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 4.58, 0, 1]);
  box(b, 1.15, 0.10, 0.10, dark, MT.metal);
  box(b, 0.10, 0.10, 1.15, dark, MT.metal);
  b.pop();
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 5.02, 0, 1]);
  box(b, 0.34, 0.22, 0.34, dark, MT.metal);
  box(b, 0.66, 0.86, 0.66, dark, MT.metal);
  box(b, 0.50, 0.66, 0.50, mixc(C.glassFrame, C.goldBright, 0.55), MT.glass, { topCol: C.glassFrame });
  box(b, 0.80, 0.12, 0.80, dark, MT.metal);
  b.pop();
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 5.55, 0, 1]);
  cylinder(b, 6, 0.10, 0.02, 0.34, brass, MT.gold, { y0: 0, caps: false });
  b.pop();
  b.pop();
  if (ctx.lanterns) ctx.lanterns.push({ p: [x, Y + 5.1, z], size: 2.6, rot: 0, alpha: 0.55, shape: 1, col: C.goldBright });
}

function plazaStatue(b, x, z) {
  const Y = PLZ.Y.ring;
  b.push(yawXf(x, Y, z, 0));
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0.21, 0, 1]);
  box(b, 2.6, 0.42, 2.6, C.stone, MT.stone, { topCol: C.stonePale });
  b.pop();
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1.30, 0, 1]);
  box(b, 1.95, 1.76, 1.95, C.marble, MT.marble, { topCol: C.stonePale });
  b.pop();
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 2.26, 0, 1]);
  box(b, 2.25, 0.16, 2.25, C.stonePale, MT.stone);
  b.pop();
  b.pop();
  statue(b, x, Y + 2.34, z, 1.5, C.stonePale);
}

function gatePost(b, ctx, x, z, rot) {
  const Y = PLZ.Y.ring;
  b.push(yawXf(x, Y, z, rot));
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0.20, 0, 1]);
  box(b, 2.0, 0.40, 2.0, C.stone, MT.stone, { topCol: C.stonePale });
  b.pop();
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1.425, 0, 1]);
  box(b, 1.32, 2.05, 1.32, C.marble, MT.marble, { topCol: C.stonePale });
  b.pop();
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 2.58, 0, 1]);
  box(b, 1.72, 0.26, 1.72, C.stonePale, MT.stone, { topCol: mulc(C.marble, 1.02) });
  b.pop();
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 2.71, 0, 1]);
  lathe(b, [[0.30, 0], [0.46, 0.18], [0.52, 0.42], [0.40, 0.62], [0.20, 0.80], [0.26, 0.96], [0.32, 1.04]], 8, C.stonePale, MT.stone);
  b.pop();
  b.pop();
  if (ctx.lanterns) ctx.lanterns.push({ p: [x, Y + 3.95, z], size: 1.9, rot: 0, alpha: 0.5, shape: 1, col: C.goldBright });
}

function pylonGate(b, ctx, x, z, rot) {
  const Y = PLZ.Y.ring;
  b.push(yawXf(x, Y, z, rot));
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0.25, 0, 1]);
  box(b, 3.4, 0.5, 3.4, C.stone, MT.stone, { topCol: C.stonePale });
  b.pop();
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 2.025, 0, 1]);
  box(b, 2.42, 3.05, 2.42, C.marble, MT.marble, { topCol: C.stonePale });
  b.pop();
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 3.72, 0, 1]);
  box(b, 2.86, 0.34, 2.86, C.stonePale, MT.stone, { topCol: C.marble });
  b.pop();
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 3.94, 0, 1]);
  box(b, 2.48, 0.10, 2.48, C.brass, MT.gold);
  b.pop();
  b.pop();
  statue(b, x, Y + 3.99, z, 1.38, C.stonePale);
}

function parterre(b, cx, cz, rIn, rOut, segs, cols) {
  const Y = PLZ.Y;
  const EDGE = 0.32;
  for (const sg of segs) {
    if (sg.w < 6 * DEG) continue;
    const a0 = sg.a0 + 0.018, a1 = sg.a1 - 0.018;
    if (a1 - a0 < 0.04) continue;
    // marble kerb edging both sides, one step above the paving
    arcRaise(b, cx, cz, rIn, rIn + EDGE, a0, a1, Y.ring, Y.edge, C.marble, C.stonePale, MT.marble);
    arcRaise(b, cx, cz, rOut - EDGE, rOut, a0, a1, Y.ring, Y.edge, C.marble, C.stonePale, MT.marble);
    // lawn
    arcBand(b, cx, cz, rIn + EDGE, rOut - EDGE, a0, a1, Y.grass, cols.grass, MT.matte);
    // marble corner piers so a bed end reads as built stonework, not a green brick
    // dropped on the walk (the ends face the radial avenues)
    for (const a of [a0, a1]) {
      for (const r of [rIn + EDGE * 0.5, rOut - EDGE * 0.5]) {
        b.push(yawXf(cx + Math.cos(a) * r, Y.ring, cz + Math.sin(a) * r, a + Math.PI / 2));
        b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0.30, 0, 1]);
        box(b, 0.62, 0.60, 0.62, C.stone, MT.stone, { topCol: C.stonePale });
        b.pop();
        b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0.72, 0, 1]);
        box(b, 0.74, 0.14, 0.74, C.stonePale, MT.stone, { topCol: mulc(C.marble, 1.03) });
        b.pop();
        b.pop();
      }
    }
    // clipped hedge ribbons inside both kerbs (inset from the ends so the pink flower
    // ribbon never shows as a loose strip on the avenue)
    const hb0 = a0 + 1.1 * DEG, hb1 = a1 - 1.1 * DEG;
    if (hb1 > hb0) {
      hedgeArc(b, cx, cz, rIn + EDGE + 0.02, rIn + EDGE + 0.86, hb0, hb1, Y.grass, Y.grass + 0.46, cols.hedge);
      hedgeArc(b, cx, cz, rOut - EDGE - 0.86, rOut - EDGE - 0.02, hb0, hb1, Y.grass, Y.grass + 0.46, cols.hedge);
    }
    // two continuous flower ribbons in the free middle (the first cut varied the colour
    // every 2.4 deg and read as broken white tiles from above)
    const u0 = rIn + EDGE + 0.94, u1 = rOut - EDGE - 0.94;
    if (u1 - u0 > 0.6) {
      for (let k = 0; k < 2; k++) {
        const rm = u0 + (u1 - u0) * (k ? 0.64 : 0.28);
        const rw = Math.min(0.82, (u1 - u0) * 0.30);
        arcBand(b, cx, cz, rm - rw / 2, rm + rw / 2, a0 + 1.1 * DEG, a1 - 1.1 * DEG, Y.grass + 0.007, cols.flowers[k], MT.cloth);
      }
    }
    // clipped topiary at both bed ends (kept clear of the short beds by the width test)
    if (sg.w >= 9 * DEG) {
      const rm = (rIn + rOut) / 2;
      for (const a of [a0 + 2.4 * DEG, a1 - 2.4 * DEG]) {
        const x = cx + Math.cos(a) * rm, z = cz + Math.sin(a) * rm;
        plazaTopiary(b, x, z);
        rec('topiary', x, z);
      }
    }
  }
}

// ---------------------------------------------------------------- plaza paving (called from buildPaving)
export function plazaPaving(b) {
  const cx = L.plaza.x, cz = L.plaza.z;
  const Y = PLZ.Y, Rp = PLZ.PAVE_R;
  const spec = plazaSpec();
  const Yf = Y.ring;                      // ONE flat floor height for the whole plaza
  // the avenue now tiles the FULL gate span: shrinking it by a fractional gate post
  // left a 0.5 m unlit sliver of bare ground along every radial avenue (read as a black
  // line on the floor from eye level).
  const aves = spec.gaps.map((g) => ({ a0: g.a0, a1: g.a1 }));
  // 1) terraced apron outside the balustrade (walkway between ring and street kerb).
  //    Annulus, not a full disc: lib3d.disc leaves its centre vertex at the base y, which
  //    would tilt the whole apron into a 7.5 cm cone.
  disc(b, Rp, 112, mulc(LX.walk, 0.99), MT.stone, { inner: 44.1, y: Y.apron, center: [cx, 0, cz] });
  // 2) terrace edge: low stone curb all the way round (the plaza reads as built, not floating)
  const nEdge = 144;
  for (let i = 0; i < nEdge; i++) {
    const t0 = (i / nEdge) * TAU, t1 = ((i + 1) / nEdge) * TAU;
    const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
    b.quad([cx + c0 * Rp, 0, cz + s0 * Rp], [cx + c1 * Rp, 0, cz + s1 * Rp],
      [cx + c1 * Rp, Y.apron, cz + s1 * Rp], [cx + c0 * Rp, Y.apron, cz + s0 * Rp],
      mulc(C.stone, 0.9), MT.stone, [c0, 0, s0]);
  }
  // 3) plaza floor: tiled by (concentric band x angular piece) so that NO two paving
  //    surfaces overlap. (The first cut stacked discs 5-12 mm apart like the old plaza;
  //    at eye level the depth buffer turned the overlaps into a white/grey checkerboard.)
  const BANDS = [
    [15.0, 21.2, 0],      // rond-point round the fountain
    [21.2, 26.4, 1],      // inner parterre band
    [26.4, 30.8, 0],      // middle walk
    [30.8, 37.4, 1],      // outer parterre band
    [37.4, 44.1, 0],      // promenade inside the balustrade
  ];
  for (const [r0, r1, bed] of BANDS) {
    const colField = bed ? mixc(C.marbleShade, C.stone, 0.42) : mulc(C.marble, 0.99);
    for (const sg of spec.segs) arcBand(b, cx, cz, r0, r1, sg.a0, sg.a1, Yf, colField, MT.stone);
    for (const av of aves) arcBand(b, cx, cz, r0, r1, av.a0, av.a1, Yf, mulc(C.marble, 1.02), MT.marble);
  }
  // 4) paving bands, 10 mm proud (thin strips only, so they cannot fight). Two dark
  //    stone belts give the white floor its rhythm, the gold hairlines keep it courtly.
  const DARK = mixc(mixc(C.stoneDark, C.ironLight, 0.32), C.slate, 0.14);
  const LIGHT = mulc(C.stonePale, 1.05);
  const GOLD = mixc(C.stonePale, C.gold, 0.55);
  const bands = [
    [19.5, 20.05, LIGHT],
    [20.05, 20.55, DARK],
    [20.55, 20.78, GOLD],
    [26.3, 26.9, DARK],
    [30.7, 31.25, LIGHT],
    [37.2, 37.8, DARK],
    [37.8, 38.05, GOLD],
    [42.4, 42.95, LIGHT],
  ];
  for (const [r0, r1, c] of bands) arcBand(b, cx, cz, r0, r1, 0, TAU, Yf + 0.010, c, MT.stone);
  // 5) dark stone margins along both sides of every radial avenue (frames the parterre
  //    ends instead of leaving the green beds to "float" on the white marble)
  for (const g of spec.gaps) {
    for (const [t0, t1] of [[g.a0, g.a0 + 0.015], [g.a1 - 0.015, g.a1]]) {
      arcBand(b, cx, cz, 15.0, 44.1, t0, t1, Yf + 0.011, DARK, MT.stone);
    }
  }
}

// ---------------------------------------------------------------- plaza ring + furniture
function plazaRing(b, ctx, lr, spec) {
  const { cx, cz, R } = spec;
  const Y = PLZ.Y;
  // readable order in the file: billing? no — build the plinth first, then the railing
  // ---- stepped plinth under the railing runs (clean end caps at every gate)
  for (const sg of spec.segs) {
    const a0 = sg.a0 + gateHalf(sg.k0) * 1.1, a1 = sg.a1 - gateHalf(sg.k1) * 1.1;
    if (a1 - a0 < 0.03) continue;
    arcRaise(b, cx, cz, R - 1.25, R + 0.85, a0, a1, Y.ring, Y.ring + 0.19,
      mulc(C.marble, 0.99), mulc(C.stonePale, 1.02), MT.stone);
  }
  // ---- continuous balustrade: chord segments follow the ring, ~5.4 m each
  for (const sg of spec.segs) {
    const a0 = sg.a0 + gateHalf(sg.k0) * 2.1, a1 = sg.a1 - gateHalf(sg.k1) * 2.1;
    if (a1 - a0 < 0.02) continue;
    const nseg = Math.max(1, Math.round((R * (a1 - a0)) / 5.4));
    for (let i = 0; i < nseg; i++) {
      const t0 = a0 + ((a1 - a0) * i) / nseg, t1 = a0 + ((a1 - a0) * (i + 1)) / nseg;
      const am = (t0 + t1) / 2;
      const chord = 2 * R * Math.sin((t1 - t0) / 2);
      b.push(yawXf(cx + Math.cos(am) * R, Y.ring + 0.19, cz + Math.sin(am) * R, am + Math.PI / 2));
      balustrade(b, chord + 0.18, 1.12, C.marble);
      b.pop();
    }
  }
  // ---- gate posts / pylons on both sides of every opening
  for (const g of spec.gaps) {
    for (const edge of [g.a0, g.a1]) {
      const dir = edge === g.a0 ? -1 : 1;
      const a = edge + dir * gateHalf(g.kind);
      const x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R;
      if (g.kind === 'boulevard') { pylonGate(b, ctx, x, z, a + Math.PI / 2); rec('pylon', x, z); }
      else { gatePost(b, ctx, x, z, a + Math.PI / 2); rec('post', x, z); }
    }
    // threshold step across the opening (the 收边 under the gate)
    arcRaise(b, cx, cz, R - 1.25, R + 0.85, g.a0 + gateHalf(g.kind) * 2.2, g.a1 - gateHalf(g.kind) * 2.2,
      Y.apron, Y.ring + 0.105, mulc(C.stone, 0.97), mixc(C.stonePale, C.gold, 0.16), MT.stone);
  }
  // ---- four statues on the fountain rond-point, in mirror pairs that frame both
  // boulevard axes (they were hidden behind the allée on the long runs; here they are the
  // first thing you see walking in along the main avenue)
  for (const a of [66, 114, 246, 294]) {
    const ar = a * DEG;
    const x = cx + Math.cos(ar) * 18.5, z = cz + Math.sin(ar) * 18.5;
    plazaStatue(b, x, z);
    rec('statue', x, z);
  }
  // ---- four long railing runs: paired lamps + benches + allée
  for (const sg of spec.segs) {
    if (sg.w < 30 * DEG) continue;
    const am = (sg.a0 + sg.a1) / 2;
    const at = (r, da) => {
      const a = am + da * DEG;
      return [cx + Math.cos(a) * r, cz + Math.sin(a) * r, a];
    };
    // paired bronze lamp posts on the railing side of the middle walk, readable in daylight
    for (const da of [-5.2, 5.2]) {
      const [x, z] = at(27.9, da);
      plazaLamp(b, ctx, x, z);
      rec('lamp', x, z);
    }
    // benches along the outer parterre kerb, backs to the bed, all facing the fountain
    for (const da of [-11, -16, 11, 16]) {
      const [x, z, a] = at(27.9, da);
      bench(b, lr, x, z, a + Math.PI / 2);
      rec('bench', x, z);
    }
    // formal allée: one row inside the promenade, canopies just touching
    for (const da of [-15, -11, -7, -3, 3, 7, 11, 15]) {
      const [x, z] = at(37.8, da);
      tree(b, lr, x, z, 1.0);
      rec('tree', x, z);
    }
  }
}

export function buildPlaza(b, ctx, rng) {
  // keep the shared-rng consumption EXACTLY at what the old plaza used (16 tree leaf
  // tints + 24 planter colours = 40 draws), so canal / streetlife / skyline are not
  // re-rolled. Everything below is either analytic or local-mulberry32.
  for (let i = 0; i < 40; i++) rng();
  const lr = mulberry32(0x51e2a9d3);
  const spec = plazaSpec();
  plazaLast.elements.length = 0;
  plazaLast.spec = spec;
  fountain(b, ctx);
  fountainRing(b);
  plazaRing(b, ctx, lr, spec);
  parterre(b, spec.cx, spec.cz, 21.2, 26.4, spec.segs, {
    grass: mixc(mixc(C.lawn, C.leafDark, 0.50), C.leaf, 0.18), hedge: LX.hedge,
    flowers: [mixc(C.bloomPink, C.marble, 0.34), mixc(C.bloomPink, C.bloomWhite, 0.6)],
  });
  parterre(b, spec.cx, spec.cz, 30.8, 37.4, spec.segs, {
    grass: mixc(mixc(C.lawn, C.leafDark, 0.58), C.leaf, 0.14), hedge: LX.hedge,
    flowers: [mixc(C.bloomYellow, C.marble, 0.42), mixc(C.bloomWhite, C.bloomPink, 0.35)],
  });
}

// ---------------------------------------------------------------- canal + bridges
// NOTE: world.js lays an opaque ground disc at y=0 over the whole island, so a
// sunken canal would be invisible. The canal is therefore built flush with the
// pavement (a grand reflecting basin) with marble quays and ornate bridges.
function bridge(b, rng, xc, width) {
  const zc = CANAL.z;
  const len = CANAL.half * 2 + 16;
  const yDeck = 0.3;
  // deck slab
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, xc, 0.0, zc, 1]);
  box(b, width, 0.6, len, mixc(C.stone, C.marble, 0.45), MT.stone, { topCol: mulc(C.marble, 1.02) });
  b.pop();
  // stone steps / ramps at both ends
  for (const sz of [-1, 1]) {
    for (let s = 0; s < 2; s++) {
      b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, xc, 0.06 + s * 0.1, zc + sz * (len / 2 - 0.2 + s * 0.5), 1]);
      box(b, width + 0.4, 0.3, 1.2, mixc(C.stone, C.marble, 0.5), MT.stone, { topCol: mulc(C.marble, 1.02) });
      b.pop();
    }
  }
  // parapets (balustrades along the two sides) + gold curb
  for (const sx of [-1, 1]) {
    const px = xc + sx * (width / 2 - 0.35);
    b.push([0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, px, yDeck, zc, 1]);
    balustrade(b, len - 3, 1.15, C.marble);
    b.pop();
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, px - sx * 0.22, yDeck + 0.02, zc, 1]);
    box(b, 0.16, 0.18, len - 2, mixc(C.gold, C.marble, 0.45), MT.stone);
    b.pop();
    // lamp standards at the four corners
    for (const sz of [-1, 1]) lamp(b, rng, px, zc + sz * (len / 2 - 1.6), 4.6);
  }
  // abutment piers where the bridge meets the quays
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) {
      b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, xc + sx * (width / 2 + 1.2), 0.45, zc + sz * (CANAL.half + 1.2), 1]);
      box(b, 3.0, 0.9, 2.6, mixc(C.stone, C.marble, 0.5), MT.stone, { topCol: mulc(C.marble, 1.02) });
      b.pop();
      b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, xc + sx * (width / 2 + 1.2), 1.05, zc + sz * (CANAL.half + 1.2), 1]);
      statue(b, 0, 0, 0, 0.62, C.stonePale);
      b.pop();
    }
  }
}

function buildCanal(b, ctx, rng) {
  const zc = CANAL.z, hw = CANAL.half;
  const wy = 0.035;
  // ---- water surface, flush with the pavement -------------------------------
  const wMat = [0.03, 0.42];
  const rows = 5;
  for (let r = 0; r < rows; r++) {
    const z0 = zc - hw + (2 * hw * r) / rows, z1 = zc - hw + (2 * hw * (r + 1)) / rows;
    const t = Math.abs((r + 0.5) / rows - 0.5) * 2;
    const c = mixc(LX.waterDp, LX.water, 0.22 + 0.5 * t);
    b.quad([-252, wy, z0], [252, wy, z0], [252, wy, z1], [-252, wy, z1], c, wMat, [0, 1, 0]);
  }
  // ripple / sparkle lines
  const rip = mixc(LX.water, C.glass, 0.3);
  for (let i = 0; i < 48; i++) {
    const gx = -246 + rng() * 492;
    const gz = zc - hw + 1.2 + rng() * (2 * hw - 2.4);
    const gw = 2 + rng() * 7;
    b.quad([gx, wy + 0.012, gz - 0.22], [gx + gw, wy + 0.012, gz - 0.22], [gx + gw, wy + 0.012, gz + 0.22], [gx, wy + 0.012, gz + 0.22], mixc(rip, C.glassFrame, 0.3), wMat, [0, 1, 0]);
  }
  // dark inner quay shadow line (fakes a little depth at the water's edge)
  for (const sz of [-1, 1]) {
    const ze = zc + sz * hw;
    b.quad([-252, wy - 0.004, Math.min(ze, ze + sz * 0.9)], [252, wy - 0.004, Math.min(ze, ze + sz * 0.9)],
           [252, wy - 0.004, Math.max(ze, ze + sz * 0.9)], [-252, wy - 0.004, Math.max(ze, ze + sz * 0.9)], mixc(C.stoneDark, LX.waterDp, 0.5), MT.stone, [0, 1, 0]);
  }

  // ---- marble quays ---------------------------------------------------------
  const quayGap = [[-252, -140], [-100, -22], [22, 252]];  // gaps where the bridges land
  for (const sz of [-1, 1]) {
    const qz = zc + sz * (hw + 1.9);
    // low quay wall with coping
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0.24, qz, 1]);
    box(b, 520, 0.48, 3.2, mixc(C.marble, C.stone, 0.35), MT.marble, { topCol: mulc(C.marble, 1.02) });
    b.pop();
    b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0.52, qz - sz * 0.9, 1]);
    box(b, 520, 0.16, 1.4, C.marble, MT.marble, { topCol: mulc(C.marble, 1.05) });
    b.pop();
    // balustrade runs on top of the quay
    for (const [ra, rb] of quayGap) {
      b.push([0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, (ra + rb) / 2, 0.6, qz, 1]);
      balustrade(b, rb - ra - 1.0, 1.15, C.marble);
      b.pop();
      // gold fillet along the quay balustrade
      b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, (ra + rb) / 2, 0.62, qz + sz * 0.3, 1]);
      box(b, rb - ra - 1.0, 0.12, 0.1, mixc(C.gold, C.marble, 0.45), MT.stone);
      b.pop();
      // statue niches / urns along the quay
      for (let x = ra + 12; x < rb - 8; x += 42) {
        if (Math.abs(x) < 24) continue;
        b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0.6, qz - sz * 3.4, 1]);
        box(b, 2.2, 1.3, 2.2, C.marble, MT.marble, { topCol: mulc(C.marble, 1.04) });
        b.pop();
        statue(b, x, 1.9, qz - sz * 3.4, 0.85, C.stonePale);
      }
    }
  }

  // ---- riverside promenades: lawn, flower border, tree row, lamps, benches ---
  const lawnSegs = [[-250, -142], [-98, -20], [20, 250]];
  const lawnCol = mixc(C.lawn, C.leafDark, 0.44);
  for (const sz of [-1, 1]) {
    const zIn = zc + sz * (hw + 7.4), zOut = zc + sz * (hw + 23);
    const z0 = Math.min(zIn, zOut), z1 = Math.max(zIn, zOut);
    for (const [xa, xb] of lawnSegs) {
      b.quad([xa, 0.04, z0], [xb, 0.04, z0], [xb, 0.04, z1], [xa, 0.04, z1], lawnCol, MT.matte, [0, 1, 0]);
      b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, (xa + xb) / 2, 0.05, zIn, 1]);
      box(b, xb - xa, 0.16, 0.4, LX.kerb, MT.stone);
      b.pop();
      for (let fx = xa + 4; fx < xb - 3; fx += 9) {
        const fc = [
          mixc(C.bloomPink, C.bloomWhite, 0.46), mixc(C.bloomYellow, C.bloomWhite, 0.38),
          mixc(C.bloomRed, C.bloomPink, 0.55), mixc(C.bloomBlue, C.bloomWhite, 0.55),
        ][Math.floor(rng() * 4)];
        const zb = Math.min(zIn + sz * 1.4, zIn + sz * 3.4), zb2 = Math.max(zIn + sz * 1.4, zIn + sz * 3.4);
        b.quad([fx, 0.06, zb], [fx + 5.5, 0.06, zb], [fx + 5.5, 0.06, zb2], [fx, 0.06, zb2], fc, MT.cloth, [0, 1, 0]);
      }
      for (let x = xa + 8; x < xb - 5; x += 15.5) {
        tree(b, rng, x, zc + sz * (hw + 15), 1.05 + rng() * 0.15);
        if (rng() > 0.55) bench(b, rng, x + 6, zc + sz * (hw + 10.4), sz > 0 ? Math.PI : 0);
      }
      for (let x = xa + 4; x < xb - 3; x += 31) {
        lamp(b, rng, x, zc + sz * (hw + 8.6), 4.6);
      }
    }
  }
  // the two bridges
  bridge(b, rng, 0, 34);
  bridge(b, rng, -120, 26);
}

// ---------------------------------------------------------------- distant skyline
function buildSkyline(b, ctx, rng) {
  // [inner r, outer r, count, floorsMin, floorsMax, fog-mix] — farther rings are
  // lower, smaller, cooler and more broken up, so the horizon reads as misted city.
  const rings = [
    [278, 330, 40, 4, 6, 0.15],
    [336, 396, 54, 3, 5, 0.3],
    [402, 462, 62, 3, 5, 0.48],
    [468, 520, 58, 2, 4, 0.62],
    [524, 556, 34, 2, 3, 0.72],
  ];
  for (const [r0, r1, n, f0, f1, fogT] of rings) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + (rng() - 0.5) * 0.16;
      const r = r0 + rng() * (r1 - r0);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const w = (14 + rng() * 16) * (1 - fogT * 0.25), d = (11 + rng() * 13) * (1 - fogT * 0.25);
      const rot = Math.atan2(-x, -z);
      const floors = f0 + Math.floor(rng() * (f1 - f0 + 1));
      const roll = rng();
      let roof = 'mansard';
      if (roll > 0.9) roof = 'tower';
      else if (roll > 0.76) roof = 'dome';
      else if (roll > 0.58) roof = 'flat';
      const base = mixc(C.stoneCool, C.fog, fogT * 0.75);
      buildBuilding(b, ctx, rng, {
        x, z, rot, w, d, floors,
        tone: 0.7 + rng() * 0.3,
        detail: 0,
        roof,
        sides: 1,
        color: mulc(mixc(base, C.stoneDark, rng() * 0.2), 0.94),
        slate: mixc(C.slate, C.fog, fogT * 0.6),
      });
    }
  }
  // broken fragments of city blocks beyond the last ring (silhouette only)
  for (let i = 0; i < 90; i++) {
    const a = rng() * TAU;
    const r = 430 + rng() * 120;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const rot = Math.atan2(-x, -z);
    const w = 8 + rng() * 14, d = 8 + rng() * 12;
    buildBuilding(b, ctx, rng, {
      x, z, rot, w, d,
      floors: 1 + Math.floor(rng() * 3),
      tone: 0.8,
      detail: 0,
      roof: rng() > 0.35 ? 'mansard' : 'flat',
      sides: 1,
      color: mulc(mixc(C.stoneCool, C.fog, 0.55 + rng() * 0.25), 0.92),
      slate: mixc(C.slate, C.fog, 0.55),
    });
  }
  // a few tall thin distant towers for the memorable horizon silhouette
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU + rng() * 0.25;
    const r = 400 + rng() * 140;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const rot = Math.atan2(-x, -z);
    const floors = 7 + Math.floor(rng() * 3);
    const w = 12 + rng() * 8, d = 12 + rng() * 8;
    buildBuilding(b, ctx, rng, {
      x, z, rot, w, d, floors,
      tone: 0.75,
      detail: 0,
      roof: rng() > 0.25 ? 'tower' : 'dome',
      sides: 1,
      color: mulc(mixc(C.stoneCool, C.fog, 0.35 + rng() * 0.3), 0.95),
      slate: mixc(C.slate, C.fog, 0.4),
    });
  }
}

// ---------------------------------------------------------------- sidewalk trees / lamps
function buildStreetLife(b, ctx, rng) {
  // promenade lawns with flower borders (both sides of the boulevard)
  for (const sx of [-1, 1]) {
    for (let z = 86; z > -210; z -= 14) {
      if (z - 12 > L.plaza.z - 48 && z < L.plaza.z + 48) continue;
      if (z < CANAL.z + 26) continue;
      const z1 = z - 13.2;
      b.quad([sx * 8.2, 0.042, z], [sx * 12.7, 0.042, z], [sx * 12.7, 0.042, z1], [sx * 8.2, 0.042, z1], mixc(C.lawn, C.leafDark, 0.46), MT.matte, [0, 1, 0]);
      // flower dots along the lawn
      for (let fz = z - 1.4; fz > z1 + 0.8; fz -= 3.4) {
        const fc = [
          mixc(C.bloomPink, C.bloomWhite, 0.5), mixc(C.bloomYellow, C.bloomWhite, 0.4),
          mixc(C.bloomRed, C.bloomPink, 0.55), mixc(C.bloomBlue, C.bloomWhite, 0.55),
        ][Math.floor(rng() * 4)];
        b.quad([sx * 8.6, 0.07, fz], [sx * 9.6, 0.07, fz], [sx * 9.6, 0.07, fz - 0.85], [sx * 8.6, 0.07, fz - 0.85], fc, MT.cloth, [0, 1, 0]);
      }
      // stone lawn edging
      b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, sx * 7.95, 0.05, z - 6.6, 1]);
      box(b, 0.34, 0.12, 13.2, LX.kerb, MT.stone);
      b.pop();
    }
  }
  // planters and benches along the promenades
  for (const sx of [-1, 1]) {
    for (let z = 78; z > -204; z -= 26) {
      if (Math.abs(z - L.plaza.z) < 50) continue;
      if (Math.abs(z - CANAL.z) < 26) continue;
      planter(b, rng, sx * 8.6, z);
      if (Math.abs(z - L.plaza.z) > 60) bench(b, rng, sx * 12.6, z - 13, sx > 0 ? Math.PI : 0);
    }
    for (let z = 70; z > -200; z -= 34) {
      if (Math.abs(z - L.plaza.z) < 52) continue;
      topiary(b, rng, sx * 14.8, z);
    }
  }
  // boulevard allée: two rows of trees, lamps between
  for (const sx of [-1, 1]) {
    for (let z = 84; z > -206; z -= 9.5) {
      const d2p = (z - L.plaza.z) * (z - L.plaza.z) + (10.4 - L.plaza.x) * (10.4 - L.plaza.x);
      if (d2p < 48 * 48) continue;
      if (Math.abs(z - CANAL.z) < 22) continue;
      tree(b, rng, sx * 10.4, z, 0.95 + rng() * 0.15);
    }
    for (let z = 82; z > -204; z -= 19) {
      if (Math.abs(z - L.plaza.z) < 30) continue;
      if (Math.abs(z - CANAL.z) < 24) continue;
      lamp(b, rng, sx * 12.2, z, 4.6);
    }
  }
  // avenue trees on the N-S streets
  for (const sx of [-1, 1]) {
    for (const xc of XSTREET) {
      const x = sx * xc;
      for (let z = 40; z > -196; z -= 26) {
        if (nearLandmark(x + 8.4, z, 4)) continue;
        tree(b, rng, x + (sx > 0 ? 8.4 : -8.4), z, 0.9);
      }
    }
  }
  // a couple of little city squares where the blocks left gardens
  const squares = [
    [-70, -120], [74, -86], [-160, -60], [168, 12], [-64, 62], [146, 96],
  ];
  for (const [qx, qz] of squares) {
    if (!freeSpace(qx, qz, 26, 26, 0, -6)) continue;
    disc(b, 12, 22, mixc(C.lawn, C.leafLight, 0.2), MT.matte, { y: 0.05, center: [qx, 0, qz] });
    ringStep(b, qx, qz, 12.0, 13.0, 0, 0.32, C.marble, 22);
    fountainSmall(b, rng, qx, qz);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.6;
      tree(b, rng, qx + Math.cos(a) * 15, qz + Math.sin(a) * 15, 0.9);
    }
    for (let i = 0; i < 2; i++) {
      const a = i * Math.PI + 0.4;
      lamp(b, rng, qx + Math.cos(a) * 10, qz + Math.sin(a) * 10, 4.4);
    }
  }
}

function fountainSmall(b, rng, cx, cz) {
  ringStep(b, cx, cz, 2.4, 3.2, 0, 0.6, C.marble, 18);
  waterDisc(b, cx, 0.55, cz, 2.4, mixc(LX.water, C.glass, 0.4), 18);
  b.push([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, cx, 0.55, cz, 1]);
  cylinder(b, 10, 0.5, 0.3, 2.2, C.marble, MT.marble, { y0: 0, caps: true });
  b.pop();
  statue(b, cx, 2.7, cz, 0.55, C.stonePale);
}

// ---------------------------------------------------------------- entry
export function buildCity(b, ctx, rng) {
  const t0 = b.i.length / 3;
  const rec = {};
  // debug: ?cstage=name builds only that stage (used to bisect visual artifacts)
  const ONLY = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('cstage') : null;
  const stage = (name, fn) => {
    const i0 = b.i.length / 3;
    if (ONLY && ONLY.split(',').indexOf(name) < 0) { rec[name] = 0; return; }
    try {
      fn();
    } catch (e) {
      console.warn('[city] stage ' + name + ' failed:', e && e.message, e && e.stack);
    }
    rec[name] = b.i.length / 3 - i0;
  };
  stage('paving', () => buildPaving(b, rng));
  stage('boulevard', () => buildBoulevard(b, ctx, rng));
  stage('blocks', () => buildBlocks(b, ctx, rng));
  stage('plaza', () => buildPlaza(b, ctx, rng));
  stage('canal', () => buildCanal(b, ctx, rng));
  stage('streetlife', () => buildStreetLife(b, ctx, rng));
  stage('skyline', () => buildSkyline(b, ctx, rng));
  const total = b.i.length / 3 - t0;
  console.log('[city] tris ' + JSON.stringify(rec) + ' total=' + total);
}