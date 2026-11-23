// Geometry-only checks for round 9 §A: the music salon's coloured cosmos ceiling and
// the west-wall "Cabinet of Cosmic Curiosities" (no GL / no browser).
//   node tools/salon-cosmos-check.mjs
// Asserts: triangle budget (<= +28k over the round-8 module), room envelope, no NaN /
// bad colour / bad material, the ceiling field covers the whole ceiling with coloured
// (multi-hue) paint, every display plinth stands on the floor (nothing floats), the
// vitrines stay inside the room and shallow enough to leave the walkway free, the wall
// band never leaks above the ceiling, the lighting budget, and determinism.
import { B } from '../src/geo.js';
import { mulberry32 } from '../src/math.js';
import { buildPalaceChambers, CHAMBER_METRICS as MC, SALON_COSMOS, SALON_CURIOS } from '../src/palace-chambers.js';

const SEED = 20261123;
const BASELINE = 132264;                 // round-8 palace-chambers triangle count
const BUDGET = 28000;
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

function stats(b) {
  const v = b.v;
  let nan = 0, far = 0, badMat = 0, emHi = 0, emMax = 0;
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let i = 0; i < v.length; i += 11) {
    for (let k = 0; k < 3; k++) {
      const x = v[i + k];
      if (!Number.isFinite(x)) nan++;
      mn[k] = Math.min(mn[k], x); mx[k] = Math.max(mx[k], x);
    }
    if (Math.abs(v[i]) > 3000 || Math.abs(v[i + 1]) > 3000 || Math.abs(v[i + 2]) > 3000) far++;
    const e = v[i + 9], g = v[i + 10];
    if (!Number.isFinite(e) || !Number.isFinite(g) || e < 0 || e > 1.2 || g < 0 || g > 1) badMat++;
    if (Number.isFinite(e)) { emMax = Math.max(emMax, e); if (e > 0.30) emHi++; }
  }
  let h = 2166136261;
  for (let i = 0; i < v.length; i += 7) h = Math.imul(h ^ Math.round(v[i] * 1024), 16777619) >>> 0;
  return {
    tris: b.i.length / 3, verts: v.length / 11, nan, far, badMat, emHi, emMax, hash: h,
    stack: b.stack.length, bad: b.bad || 0, badColor: b.badColor || 0, badNormal: b.badNormal || 0,
    bbox: { min: mn.map((x) => +x.toFixed(3)), max: mx.map((x) => +x.toFixed(3)) },
  };
}
// first triangle hit by the segment p0->p1 among the given triangle start indices
function hitList(b, list, p0, p1) {
  const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const V = b.v;
  let best = null;
  for (const t of list) {
    const ia = b.i[t] * 11, ib = b.i[t + 1] * 11, ic = b.i[t + 2] * 11;
    const ax = V[ia], ay = V[ia + 1], az = V[ia + 2];
    const bx = V[ib], by = V[ib + 1], bz = V[ib + 2];
    const cx = V[ic], cy = V[ic + 1], cz = V[ic + 2];
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-9) continue;
    const inv = 1 / det;
    const tvx = p0[0] - ax, tvy = p0[1] - ay, tvz = p0[2] - az;
    const u = (tvx * px + tvy * py + tvz * pz) * inv;
    if (u < -1e-6 || u > 1 + 1e-6) continue;
    const qx = tvy * e1z - tvz * e1y, qy = tvz * e1x - tvx * e1z, qz = tvx * e1y - tvy * e1x;
    const vv = (d[0] * qx + d[1] * qy + d[2] * qz) * inv;
    if (vv < -1e-6 || u + vv > 1 + 1e-6) continue;
    const tt = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (tt <= 1e-4 || tt >= 1 - 1e-4) continue;
    if (!best || tt < best.t) {
      const nn = Math.hypot(V[ia + 3], V[ia + 4], V[ia + 5]) || 1;
      best = { t: tt, N: [V[ia + 3] / nn, V[ia + 4] / nn, V[ia + 5] / nn],
        p: [p0[0] + d[0] * tt, p0[1] + d[1] * tt, p0[2] + d[2] * tt],
        col: [V[ia + 6], V[ia + 7], V[ia + 8]] };
    }
  }
  return best;
}
const rgbHue = (c) => {
  const mx2 = Math.max(c[0], c[1], c[2]), mn2 = Math.min(c[0], c[1], c[2]);
  const sat = mx2 > 1e-6 ? (mx2 - mn2) / mx2 : 0;
  if (sat < 0.06) return { sat, bin: -1 };
  let h;
  if (mx2 === c[0]) h = ((c[1] - c[2]) / (mx2 - mn2)) % 6;
  else if (mx2 === c[1]) h = (c[2] - c[0]) / (mx2 - mn2) + 2;
  else h = (c[0] - c[1]) / (mx2 - mn2) + 4;
  h *= 60; if (h < 0) h += 360;
  return { sat, bin: Math.floor(h / 60) % 6 };
};

// ------------------------------------------------------------------ build once
const cy = { points: [], lanterns: [] };
const cb = new B();
buildPalaceChambers(cb, cy, mulberry32(SEED));
const s = stats(cb);
const M = MC, COS = SALON_COSMOS;
const SAL = MC.rooms.salon;

// 1. budget + clean geometry
const delta = s.tris - BASELINE;
ok(delta >= 6000, 'the new ceiling / wall seems missing: delta ' + delta);
ok(delta <= BUDGET, 'triangle budget: +' + delta + ' > +' + BUDGET);
ok(s.stack === 1, 'matrix stack depth ' + s.stack + ' (expected 1)');
ok(s.nan === 0, 'non-finite vertices: ' + s.nan);
ok(s.far === 0, 'far vertices: ' + s.far);
ok(s.bad === 0, 'bad (NaN) verts: ' + s.bad);
ok(s.badColor === 0, 'bad colours: ' + s.badColor);
ok(s.badNormal === 0, 'degenerate (zero-area) normals: ' + s.badNormal);
ok(s.badMat === 0, 'bad material arrays: ' + s.badMat);
ok(s.emMax <= 1.0, 'material emissive over 1.0: ' + s.emMax);
ok(s.emHi <= 60000, 'too much bright emissive geometry (' + s.emHi + ' verts over 0.30)');

// 2. room envelope (the whole module must stay inside the podium suite)
ok(s.bbox.min[0] >= -44 && s.bbox.max[0] <= 44, 'x out of [-44,44]: ' + JSON.stringify(s.bbox));
ok(s.bbox.min[1] >= -0.6 && s.bbox.max[1] <= 28, 'y out of [-0.6,28]: ' + JSON.stringify(s.bbox));
ok(s.bbox.min[2] >= 122.1 && s.bbox.max[2] <= 181.5, 'z out of [122.1,181.5]: ' + JSON.stringify(s.bbox));

// 3. ceiling: collect the ceiling triangles and sample the painted field
const CEIL = COS.ceiling;
const ceilTris = [];
for (let t = 0; t < cb.i.length; t += 3) {
  let all = true, anyIn = false;
  for (const k of [0, 1, 2]) {
    const o = cb.i[t + k] * 11;
    if (cb.v[o + 1] < 13.4) { all = false; break; }
    if (cb.v[o] >= CEIL.x0 - 0.5 && cb.v[o] <= CEIL.x1 + 0.5 && cb.v[o + 2] >= CEIL.z0 - 0.5 && cb.v[o + 2] <= CEIL.z1 + 0.5) anyIn = true;
  }
  if (all && anyIn) ceilTris.push(t);
}
ok(ceilTris.length > 1500, 'too few ceiling triangles: ' + ceilTris.length);
const bins = [0, 0, 0, 0, 0, 0];
let cover = 0, coverBadDist = 0, coverBadNormal = 0, dark = 0, satSum = 0, samples = 0, achrom = 0;
const NX = 26, NZ = 30;
for (let j = 0; j < NZ; j++) {
  for (let i = 0; i < NX; i++) {
    const t = (i + 0.5) / NX, w = (j + 0.5) / NZ;
    const px = CEIL.x0 + (CEIL.x1 - CEIL.x0) * t, pz = CEIL.z0 + (CEIL.z1 - CEIL.z0) * w;
    const hit = hitList(cb, ceilTris, [px, 13.02, pz], [px, 14.4, pz]);
    samples++;
    if (!hit) continue;
    cover++;
    const dist = hit.p[1] - 13.02;
    if (dist > 1.2) coverBadDist++;
    if (hit.N[1] > -0.5) coverBadNormal++;
    const sum = hit.col[0] + hit.col[1] + hit.col[2];
    if (sum < 0.045) dark++;
    const hh = rgbHue(hit.col);
    satSum += hh.sat;
    if (hh.bin < 0) achrom++; else bins[hh.bin]++;
  }
}
ok(cover === samples, 'ceiling field does not cover the ceiling: ' + cover + '/' + samples + ' samples hit a surface');
ok(coverBadDist === 0, coverBadDist + ' ceiling samples hit a surface more than 1.2 m above the probe');
ok(coverBadNormal === 0, coverBadNormal + ' ceiling samples hit a face that does not face down');
ok(dark === 0, dark + ' ceiling samples are near-black (the cosmos must not read as black)');
ok(satSum / samples >= 0.14, 'mean ceiling saturation too low (' + (satSum / samples).toFixed(3) + '): still a monochrome sky?');
const hueBins = bins.filter((n) => n >= 8).length;
ok(hueBins >= 4, 'only ' + hueBins + ' hue families on the ceiling (want >= 4): ' + JSON.stringify(bins));
ok(achrom < samples * 0.5, 'most ceiling samples are achromatic (' + achrom + '/' + samples + ')');
ok(COS.ceiling.starCount >= 250, 'too few stars: ' + COS.ceiling.starCount);
ok(COS.ceiling.cloudCount >= 5, 'too few nebula clouds: ' + COS.ceiling.cloudCount);

// 4. the cabinet wall: exhibit plinths stand on the floor, nothing floats
const CUR = SALON_CURIOS;
ok(CUR.length >= 6, 'expected at least 6 exhibits, got ' + CUR.length);
ok(new Set(CUR.map((c) => c.kind)).size >= 6, 'expected at least 6 distinct exhibit kinds');
const FLOOR = MC.floorY;
const sorted = CUR.slice().sort((a, b) => a.z - b.z);
for (let i = 1; i < sorted.length; i++) {
  const gap = Math.abs(sorted[i].z - sorted[i - 1].z) - (sorted[i].w + sorted[i - 1].w) / 2;
  ok(gap > 0.15, 'exhibits overlap or touch: ' + sorted[i - 1].kind + ' / ' + sorted[i].kind + ' gap ' + gap.toFixed(2));
}
for (const c of CUR) {
  ok(Math.abs(c.baseY - FLOOR) < 1e-6, c.kind + ': plinth base y ' + c.baseY + ' != floor ' + FLOOR);
  ok(c.frontX <= SAL.x0 + 0.95, c.kind + ': vitrine reaches ' + c.frontX.toFixed(2) + ' (> x0 + 0.95)');
  ok(c.z > SAL.z0 + 0.5 && c.z < SAL.z1 - 0.5, c.kind + ': outside the wall: z ' + c.z);
  ok(c.deckY > FLOOR + 0.9 && c.deckY < FLOOR + 1.5, c.kind + ': odd deck height ' + c.deckY);
  // the plinth must actually stand on the salon floor: a short down-ray from just
  // inside the bottom course hits a floor-level face
  const near = [];
  for (let t = 0; t < cb.i.length; t += 3) {
    let inBox = true;
    for (const k of [0, 1, 2]) {
      const o = cb.i[t + k] * 11;
      if (cb.v[o] < SAL.x0 - 0.1 || cb.v[o] > SAL.x0 + 1.1) { inBox = false; break; }
      if (cb.v[o + 2] < c.z - c.w / 2 - 0.3 || cb.v[o + 2] > c.z + c.w / 2 + 0.3) { inBox = false; break; }
      if (cb.v[o + 1] < FLOOR - 0.3 || cb.v[o + 1] > FLOOR + 2.4) { inBox = false; break; }
    }
    if (inBox) near.push(t);
  }
  ok(near.length > 20, c.kind + ': no plinth geometry found near its base');
  const px = SAL.x0 + c.d * 0.5, pz = c.z;
  const hit = hitList(cb, near, [px, FLOOR + 0.06, pz], [px, FLOOR - 0.4, pz]);
  ok(hit !== null, c.kind + ': nothing under the plinth (it floats)');
  if (hit) ok(FLOOR + 0.06 - hit.p[1] <= 0.10, c.kind + ': plinth bottom is ' + (FLOOR + 0.06 - hit.p[1]).toFixed(3) + ' m above the floor');
}

// 5. the wall treatment stays in the wall band (never leaks above the ceiling)
// the walkway in front of the cabinet wall is x0 + 1.2 .. x1 (the suspended planet
// hangs 1.05 m off the wall, so the free zone starts at 1.2 m). Two z windows keep the
// round-8 side table (z ~ cz) and pot plant (z ~ 164.2) out of the sweep.
const WALKWAY = [[SAL.z0 + 10.65, SAL.z0 + 17.15], [SAL.z0 + 19.65, SAL.z1 - 10.0]];
let bandVerts = 0, bandHigh = 0, bandDeep = 0, bandLow = 0, bandEmHi = 0;
for (let i = 0; i < cb.v.length; i += 11) {
  const x = cb.v[i], y = cb.v[i + 1], z = cb.v[i + 2];
  if (x < SAL.x0 - 0.05 || x > SAL.x0 + 2.0) continue;
  if (z < SAL.z0 + 0.3 || z > SAL.z1 - 0.3) continue;
  if (y < FLOOR - 0.1 || y > SAL.ceil + 0.2) continue;
  bandVerts++;
  // the walkway strip: only asserted where no round-8 furniture stands against the wall
  // head/body height only: the suspended planet hangs above the walkway (y > 9 m)
  // the walkway strip, sampled only where no round-8 furniture stands against the wall
  if (x > SAL.x0 + 1.2 && y > FLOOR + 0.25 && y < FLOOR + 6.0) {
    for (const [za, zb] of WALKWAY) if (z > za && z < zb) { bandDeep++; break; }
  }
  if (y > SAL.ceil + 0.02) bandHigh++;
  if (y < FLOOR - 0.02) bandLow++;
  if (y > 13.4 && cb.v[i + 9] > 0.30) bandEmHi++;
}
ok(bandVerts > 20000, 'too few vertices in the salon band: ' + bandVerts);
ok(bandDeep === 0, bandDeep + ' geometry stands more than 1.2 m off the wall (walkway blocked)');
ok(bandHigh === 0, bandHigh + ' wall vertices poke above the salon ceiling');
ok(bandLow === 0, bandLow + ' wall vertices sink below the floor');
ok(bandEmHi <= 5000, 'too much bright emissive geometry on the ceiling: ' + bandEmHi + ' verts');

// 6. lighting budget
ok(cy.points.length === 18, 'point lights ' + cy.points.length + ' (existing 15 + 3 new)');
ok(cy.points.every((p) => p.p.every(Number.isFinite) && p.col.every(Number.isFinite) &&
  p.range > 0 && p.int > 0 && p.int <= 1), 'bad point light');
ok(cy.lanterns.length >= 45, 'expected more candle / case billboards, got ' + cy.lanterns.length);
ok(cy.lanterns.every((l) => l.p.every(Number.isFinite) && l.size > 0 && l.alpha > 0 && l.col.every(Number.isFinite)), 'bad lantern');

// 7. determinism (the module owns its local RNG)
const cb2 = new B();
buildPalaceChambers(cb2, { points: [], lanterns: [] }, mulberry32(SEED));
const s2 = stats(cb2);
ok(s2.tris === s.tris, 'non-deterministic triangle count: ' + s.tris + ' vs ' + s2.tris);
ok(s2.hash === s.hash, 'non-deterministic vertex hash');
ok(JSON.stringify(s2.bbox) === JSON.stringify(s.bbox), 'non-deterministic bbox');
const cb3 = new B();
buildPalaceChambers(cb3, { points: [], lanterns: [] }, mulberry32(7));
ok(stats(cb3).hash === s.hash, 'the module draws from the shared rng (hash changed with a different seed)');

const report = {
  tris_total: s.tris, trisDelta: delta, trisBudget: BUDGET, verts: s.verts,
  bbox: s.bbox, stack: s.stack, nan: s.nan, bad: s.bad, badColor: s.badColor, badNormal: s.badNormal,
  ceiling: { fieldTris: ceilTris.length, samples, coverage: cover + '/' + samples,
    hueBins: bins, meanSaturation: +(satSum / samples).toFixed(3), stars: COS.ceiling.starCount, clouds: COS.ceiling.cloudCount },
  wall: { exhibits: CUR.length, kinds: [...new Set(CUR.map((c) => c.kind))], bandVerts, maxDepth: COS.wall.maxDepth },
  lights: { points: cy.points.length, lanterns: cy.lanterns.length },
  deterministic: s2.hash === s.hash,
};
console.log(JSON.stringify(report, null, 2));
if (fails.length) { console.log('FAIL\n - ' + fails.join('\n - ')); process.exit(1); }
console.log('PASS  salon-cosmos: +' + delta + ' tris (' + s.tris + ' total), ceiling ' + cover + '/' + samples +
  ' covered, ' + hueBins + ' hue families, ' + CUR.length + ' grounded exhibits, deterministic');
