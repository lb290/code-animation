// Geometry-only checks for the round-9 glass-palace observatory (glass-orbital.js).
//   node tools/glass-orbital-check.mjs
// Asserts: every vertex inside the drum / dome interior with a 0.4 m keep-out, the whole
// instrument sits well above the palm-house planting band, every floating object is
// actually on a chain that reaches the painted dome shell, the wiring into landmark.js
// still leaves the existing glass-dome budget / light contract intact, determinism,
// no NaN, tri budget.  No GL, no browser.
import { mulberry32 } from '../src/math.js';
import { B, rgb } from '../src/geo.js';
import { L } from '../src/layout.js';
import { buildLandmarks } from '../src/landmark.js';
import {
  buildGlassOrbital, orbitalHangers, innerLimit, isletSpots, ornamentSpots,
  ORBITAL, MARGIN, ORB_POINTS,
} from '../src/glass-orbital.js';

const SEED = ORBITAL.SEED;
const CZ = ORBITAL.CZ;
const A = L.glassPalace;
const ca = Math.cos(A.rot), sa = Math.sin(A.rot);
const toL = (wx, wy, wz) => [ca * (wx - A.x) + sa * (wz - A.z), wy, -sa * (wx - A.x) + ca * (wz - A.z)];
const r3 = (v) => v.map((x) => +x.toFixed(3));

function stats(b) {
  const v = b.v;
  let nan = 0, far = 0, badMat = 0, minY = 1e9, maxY = -1e9, maxR = 0;
  for (let i = 0; i < v.length; i += 11) {
    let okv = true;
    for (let k = 0; k < 3; k++) if (!Number.isFinite(v[i + k])) { okv = false; nan++; }
    if (!okv) continue;
    minY = Math.min(minY, v[i + 1]); maxY = Math.max(maxY, v[i + 1]);
    maxR = Math.max(maxR, Math.hypot(v[i], v[i + 2] - CZ));
    if (Math.abs(v[i]) > 3000 || Math.abs(v[i + 1]) > 3000 || Math.abs(v[i + 2]) > 3000) far++;
    const e = v[i + 9], g = v[i + 10];
    if (!Number.isFinite(e) || !Number.isFinite(g) || e < 0 || e > 1.2 || g < 0 || g > 1) badMat++;
  }
  let h = 2166136261;
  for (let i = 0; i < v.length; i += 7) h = Math.imul(h ^ Math.round(v[i] * 1024), 16777619) >>> 0;
  return {
    tris: b.i.length / 3, verts: v.length / 11, nan, far, badMat, hash: h,
    stack: b.stack.length, bad: b.bad || 0, badColor: b.badColor || 0, badNormal: b.badNormal || 0,
    minY: +minY.toFixed(3), maxY: +maxY.toFixed(3), maxR: +maxR.toFixed(3),
  };
}
// nearest vertex distance to a 3D point
function nearest(b, p) {
  let best = 1e18;
  for (let i = 0; i < b.v.length; i += 11) {
    const dx = b.v[i] - p[0], dy = b.v[i + 1] - p[1], dz = b.v[i + 2] - p[2];
    const d = dx * dx + dy * dy + dz * dz;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}
// point -> triangle distance: project, else nearest of the three edges
const subv = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dotv = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const crv = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function segDist(p, a, b) {
  const ab = subv(b, a), ap = subv(p, a);
  const L2 = dotv(ab, ab);
  let t = L2 > 1e-12 ? dotv(ap, ab) / L2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const q = [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t];
  const d = subv(p, q);
  return Math.sqrt(dotv(d, d));
}
function triDist(p, a, b, c) {
  const ab = subv(b, a), ac = subv(c, a);
  let n = crv(ab, ac);
  const nl = Math.hypot(n[0], n[1], n[2]);
  if (nl > 1e-9) {
    n = [n[0] / nl, n[1] / nl, n[2] / nl];
    const h = dotv(subv(p, a), n);
    const q = [p[0] - n[0] * h, p[1] - n[1] * h, p[2] - n[2] * h];
    const d00 = dotv(crv(subv(b, a), subv(q, a)), n);
    const d11 = dotv(crv(subv(c, b), subv(q, b)), n);
    const d22 = dotv(crv(subv(a, c), subv(q, c)), n);
    if (d00 >= -1e-9 && d11 >= -1e-9 && d22 >= -1e-9) return Math.abs(h);
  }
  return Math.min(segDist(p, a, b), segDist(p, b, c), segDist(p, c, a));
}
function nearestTri(b, p) {
  let best = 1e18;
  const P = (i) => { const o = i * 11; return [b.v[o], b.v[o + 1], b.v[o + 2]]; };
  for (let t = 0; t < b.i.length; t += 3) {
    const a = P(b.i[t]), bb = P(b.i[t + 1]), c = P(b.i[t + 2]);
    const d = triDist(p, a, bb, c);
    if (d < best) { best = d; if (best < 1e-4) break; }
  }
  return best;
}
// implicit ellipsoid value (1 = on the dome shell, < 1 = inside)
function domeF(p) {
  const dx = p[0] / ORBITAL.DOME_RX, dy = (p[1] - ORBITAL.DOME_Y) / ORBITAL.DOME_RY, dz = (p[2] - CZ) / ORBITAL.DOME_RX;
  return dx * dx + dy * dy + dz * dz;
}

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

// ---------------------------------------------------------------- build it twice
const ctx1 = { points: [], lanterns: [] };
const b1 = new B();
const s1 = buildGlassOrbital(b1, ctx1);
const g1 = stats(b1);
const ctx2 = { points: [], lanterns: [] };
const b2 = new B();
const s2 = buildGlassOrbital(b2, ctx2);
const g2 = stats(b2);

ok(s1.tris === g1.tris, 'reported tri count differs from the built mesh');
ok(g1.tris >= 8000, 'observatory suspiciously small: ' + g1.tris + ' tris');
ok(g1.tris <= 70000, 'observatory over the 70k budget: ' + g1.tris + ' tris');
ok(g1.stack === 1, 'observatory leaks the matrix stack: ' + g1.stack);
ok(g1.nan === 0 && g1.bad === 0, 'observatory has NaN vertices: ' + JSON.stringify([g1.nan, g1.bad]));
ok(g1.badColor === 0 && g1.badMat === 0, 'observatory has bad colours / materials: ' + JSON.stringify([g1.badColor, g1.badMat]));
ok(g1.badNormal === 0, 'observatory has degenerate normals: ' + g1.badNormal);
ok(g2.hash === g1.hash && g2.tris === g1.tris, 'observatory is not deterministic (hash ' + g1.hash + ' vs ' + g2.hash + ')');
ok(ORBITAL.MARGIN === MARGIN && MARGIN >= 0.4, 'keep-out margin below 0.4 m');

// ---------------------------------------------------------------- interior envelope
let outside = 0, worst = null, tooLow = 0, aboveApex = 0;
for (let i = 0; i < b1.v.length; i += 11) {
  const p = [b1.v[i], b1.v[i + 1], b1.v[i + 2]];
  if (!p.every(Number.isFinite)) continue;
  if (p[1] < 46.0) tooLow++;
  if (p[1] > ORBITAL.DOME_Y + ORBITAL.DOME_RY - MARGIN + 0.05) aboveApex++;
  const r = Math.hypot(p[0], p[2] - CZ);
  const lim = innerLimit(p[1]);
  if (lim < 0 || r > lim + 1e-3) {
    outside++;
    if (!worst || r - lim > worst.over) worst = { r: +r.toFixed(3), y: +p[1].toFixed(3), lim: +lim.toFixed(3), over: +(r - lim).toFixed(3) };
  }
}
ok(outside === 0, 'observatory pokes through the drum / dome interior: ' + outside + ' vertices ' + JSON.stringify(worst));
ok(tooLow === 0, 'observatory drops into the palm-house band (y < 46): ' + tooLow + ' vertices');
ok(aboveApex === 0, 'observatory above the dome apex: ' + aboveApex + ' vertices');
ok(g1.maxY <= 105.05, 'observatory tops out at y ' + g1.maxY + ' (dome apex interior 105.4)');
ok(g1.maxR <= 28.8, 'observatory reaches r ' + g1.maxR + ' (dome interior shell 29.1)');

// ---------------------------------------------------------------- every float is on a chain
const H = orbitalHangers();
ok(H.length >= 30, 'hanger bookkeeping incomplete: ' + H.length);
let badChain = 0, badAnchor = 0, badFrom = 0;
const chainReport = [];
for (const h of H) {
  let miss = 0;
  for (let k = 0; k <= 6; k++) {
    const t = k / 6;
    const p = [h.from[0] + (h.to[0] - h.from[0]) * t, h.from[1] + (h.to[1] - h.from[1]) * t, h.from[2] + (h.to[2] - h.from[2]) * t];
    if (nearestTri(b1, p) > 0.22) miss++;
  }
  if (miss) { badChain++; chainReport.push(h.name + ': ' + miss + '/7 uncovered'); }
  if (h.kind === 'rod') {
    // the short cantilever rods land on the existing drum-top gallery ring
    const rc = Math.hypot(h.to[0], h.to[2] - CZ);
    if (!(rc > 23.2 && rc < 25.9 && h.to[1] > 54.2 && h.to[1] < 56.2) || domeF(h.to) > 1.0) {
      badAnchor++; chainReport.push(h.name + ': rod foot off the drum gallery rc=' + rc.toFixed(2));
    }
  } else {
    // every cable anchor must lie just inside the painted dome shell (0.4 m keep-out .. ~1 m gap)
    const f = domeF(h.to);
    if (!(f < 1.0 && f > 0.90)) { badAnchor++; chainReport.push(h.name + ': anchor F=' + f.toFixed(3)); }
  }
  // the hanging end must sit on real geometry
  if (nearestTri(b1, h.from) > 0.45) { badFrom++; chainReport.push(h.name + ': loose end'); }
}
ok(badChain === 0, 'hangers not drawn all the way: ' + badChain + ' ' + JSON.stringify(chainReport.slice(0, 6)));
ok(badAnchor === 0, 'hanger anchors not on the dome shell: ' + badAnchor + ' ' + JSON.stringify(chainReport.slice(0, 6)));
ok(badFrom === 0, 'hanger top ends float free of their object: ' + badFrom);

// ---------------------------------------------------------------- the pieces exist
let nearSun = 0, armRing = 0, deck = 0, starVerts = 0;
for (let i = 0; i < b1.v.length; i += 11) {
  const p = [b1.v[i], b1.v[i + 1], b1.v[i + 2]];
  const rc = Math.hypot(p[0], p[2] - CZ);
  if (Math.hypot(p[0], p[1] - 74, p[2] - CZ) < 2.2) nearSun++;
  if (Math.abs(p[1] - 74) < 0.6 && rc > 10.0 && rc < 12.9) armRing++;
  if (p[1] > 52.6 && p[1] < 54.2 && rc > 16.5 && rc < 20.1) deck++;
  if (p[1] > 62 && rc > 8) starVerts++;
}
ok(nearSun > 60, 'no glowing sun at the armillary centre: ' + nearSun + ' vertices');
ok(armRing > 400, 'armillary rings missing: ' + armRing + ' vertices in the ring band');
ok(deck > 800, 'star-gazing gallery deck missing: ' + deck + ' vertices');
ok(starVerts > 1400, 'painted sky too sparse: ' + starVerts + ' vertices above the gallery');
ok(s1.stars === ORBITAL.starCount, 'star count ' + s1.stars);
ok(s1.constellations === ORBITAL.constellationCount, 'constellation count ' + s1.constellations);
ok(s1.islets === isletSpots().length && s1.islets >= 3, 'floating islets: ' + s1.islets);
ok(s1.ornaments === ornamentSpots().length && s1.ornaments >= 4, 'hanging ornaments: ' + s1.ornaments);
ok(s1.telescopes >= 3, 'telescopes: ' + s1.telescopes);

// islets: three chains each, and the chain foot is over the islet top
for (const spot of isletSpots()) {
  const cx = Math.cos(spot.a) * spot.r, cz = CZ + Math.sin(spot.a) * spot.r;
  const mine = H.filter((h) => h.name.startsWith('islet-' + spot.a.toFixed(2) + '-'));
  ok(mine.length === 3, 'islet ' + spot.a + ' has ' + mine.length + ' chains (expect 3)');
  for (const h of mine) {
    const d = Math.hypot(h.from[0] - cx, h.from[2] - cz);
    ok(d <= 3.06 * spot.s + 0.2, 'islet chain foot off the islet top: d=' + d.toFixed(2));
    ok(Math.abs(h.from[1] - (spot.y + 0.20)) < 1e-6, 'islet chain foot height wrong');
  }
}

// ---------------------------------------------------------------- integration into landmark
const lc = { points: [], lanterns: [] };
const lb = new B();
buildLandmarks(lb, lc, mulberry32(20261123));
ok(!!lc.orbital, 'landmark did not call the observatory');
if (lc.orbital) {
  ok(lc.orbital.tris === s1.tris, 'landmark observatory tri count differs: ' + lc.orbital.tris + ' vs ' + s1.tris);
  ok(lc.orbital.stars === s1.stars, 'landmark observatory star count differs');
}
// point lights: 8 legacy + ORB_POINTS (the lead widens the glass-dome assertion to 8 + ORB_POINTS)
ok(ORB_POINTS <= 6, 'observatory point lights over the contract: ' + ORB_POINTS);
ok(lc.glassPointCount === 8 + ORB_POINTS, 'glass palace point lights: ' + lc.glassPointCount + ' (expect 8 + ' + ORB_POINTS + ')');
ok(ctx1.points.length === ORB_POINTS, 'observatory point lights: ' + ctx1.points.length + ' (expect ' + ORB_POINTS + ')');
for (const p of ctx1.points) {
  ok(p.p.every(Number.isFinite) && p.col.every(Number.isFinite) && p.range > 0 && p.int > 0 && p.int <= 1, 'bad observatory point light');
  const lp = toL(p.p[0], p.p[1], p.p[2]);
  ok(Math.hypot(lp[0], lp[2] - CZ) <= innerLimit(lp[1]) + 1e-3 && lp[1] > 50, 'observatory point light outside the dome: ' + JSON.stringify(lp.map((x) => +x.toFixed(2))));
}

// ---------------------------------------------------------------- billboards
ok(ctx1.lanterns.length >= 60 && ctx1.lanterns.length <= 260, 'observatory sprites: ' + ctx1.lanterns.length);
let badL = 0, outL = 0;
for (const it of ctx1.lanterns) {
  if (!it.p.every(Number.isFinite) || !it.col.every(Number.isFinite) || !(it.size > 0) || !(it.alpha > 0)) badL++;
  const lp = toL(it.p[0], it.p[1], it.p[2]);
  const r = Math.hypot(lp[0], lp[2] - CZ);
  if (r > innerLimit(lp[1]) + 1.8 || lp[1] < 48) outL++;
}
ok(badL === 0, 'bad observatory sprites: ' + badL);
ok(outL === 0, 'observatory sprites outside the dome: ' + outL);

// ---------------------------------------------------------------- report
const rep = {
  tris: g1.tris, verts: g1.verts,
  bbox: { minY: g1.minY, maxY: g1.maxY, maxR: g1.maxR },
  keepout: { margin_m: MARGIN, outside },
  pieces: { stars: s1.stars, constellations: s1.constellations, islets: s1.islets, telescopes: s1.telescopes, ornaments: s1.ornaments, hangers: H.length },
  lights: { point: ctx1.points.length, sprites: ctx1.lanterns.length, legacyPalacePoints: 8 },
  integration: { landmarkCalls: !!lc.orbital, glassPointCount: lc.glassPointCount },
  deterministic: g2.hash === g1.hash,
  hash: g1.hash,
};
console.log(JSON.stringify(rep, null, 2));
if (fails.length) { console.log('FAIL\n - ' + fails.join('\n - ')); process.exit(1); }
console.log('PASS  glass orbital: ' + g1.tris + ' tris, ' + s1.stars + ' stars / ' + s1.constellations + ' constellations, ' +
  s1.islets + ' floating islets, ' + H.length + ' hangers all connected, inside the drum+dome with ' +
  MARGIN + ' m keep-out, y ' + g1.minY + '..' + g1.maxY + ', deterministic');