// Geometry-only checks for the round-9 steam express (no GL / no browser).
//   node tools/train-check.mjs
// Proves the contract in src/rail.js (TRAIN_METRICS) straight from the vertices:
// per-vehicle triangle budget, silhouette box, wheel/rail contact, coach gaps,
// the station train envelope, determinism, NaN / material / stack hygiene.
import { L } from '../src/layout.js';
import { TRAIN_METRICS, buildLocomotive, buildCarriage } from '../src/rail.js';

// ---- contract mirrors (kept in sync with src/rail.js) ----------------------
const RAIL_TOP = L.railY + 0.3;                 // 27.8 — world y of the rail head
const RAIL_HALF = 3.30;                         // viaduct deck half width
const STATION = L.station;                      // (58, -146)
const CHN = -150.02, CHS = -141.98;             // station track-channel walls
const ENV = { z0: -150, z1: -142, y0: 27, y1: 35.5 };   // station train envelope
const MAX_HALF_W = TRAIN_METRICS.maxHalfWidth;  // 1.62
const MAX_LOCAL_H = TRAIN_METRICS.maxLocalHeight; // 7.70
const FIRST = TRAIN_METRICS.spacing.first;      // loco centre -> coach 0 centre
const GAP = TRAIN_METRICS.spacing.gap;          // coach centre -> coach centre
const MIN_GAP = 0.40;                           // nearest faces between vehicles
// round-8 baseline (measured before the rebuild, for the report)
const R8 = { locoTris: 1496, carTris: 1404, locoZ: [-7.75, 8.52], carZ: [-8.0, 8.0] };

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

function stats(b) {
  const v = b.v;
  let nan = 0, far = 0, badMat = 0, dark = 0;
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let i = 0; i < v.length; i += 11) {
    for (let k = 0; k < 3; k++) {
      const x = v[i + k];
      if (!Number.isFinite(x)) nan++;
      if (x < mn[k]) mn[k] = x;
      if (x > mx[k]) mx[k] = x;
    }
    if (Math.abs(v[i]) > 3000 || Math.abs(v[i + 1]) > 3000 || Math.abs(v[i + 2]) > 3000) far++;
    const e = v[i + 9], g = v[i + 10];
    if (!Number.isFinite(e) || !Number.isFinite(g) || e < 0 || e > 1.2 || g < 0 || g > 1) badMat++;
    // the brief forbids pure black anywhere in the scene
    if (v[i + 6] + v[i + 7] + v[i + 8] <= 1e-6) dark++;
  }
  let h = 2166136261;
  for (let i = 0; i < v.length; i += 7) h = Math.imul(h ^ Math.round(v[i] * 1024), 16777619) >>> 0;
  return {
    tris: b.i.length / 3, verts: v.length / 11, nan, far, badMat, dark, hash: h,
    stack: b.stack.length, bad: b.bad || 0, badColor: b.badColor || 0, badNormal: b.badNormal || 0,
    min: mn, max: mx,
  };
}

// vertices of a vehicle, in its own frame (+Z forward, y = 0 at the rail head)
function verts(b) {
  const out = [];
  for (let i = 0; i < b.v.length; i += 11) out.push([b.v[i], b.v[i + 1], b.v[i + 2]]);
  return out;
}
// place a vehicle on the station straight (tangent = +X, so local +z -> +x and
// local +x -> -z), exactly like ctx.dyn's trs() does at z = -146.
function stationWorld(p) {
  return [p[2], RAIL_TOP + p[1], STATION.z - p[0]];
}

// ---------------------------------------------------------------- build once
const loco = buildLocomotive();
const car0 = buildCarriage(0);
const car1 = buildCarriage(1);
const SL = stats(loco), SC0 = stats(car0), SC1 = stats(car1);

for (const [name, s] of [['loco', SL], ['car0', SC0], ['car1', SC1]]) {
  ok(s.nan === 0, name + ' has non-finite vertices: ' + s.nan);
  ok(s.far === 0, name + ' has far vertices: ' + s.far);
  ok(s.bad === 0, name + ' pushed NaN vertices: ' + s.bad);
  ok(s.badColor === 0, name + ' has bad colours: ' + s.badColor);
  ok(s.badNormal === 0, name + ' has degenerate normals: ' + s.badNormal);
  ok(s.badMat === 0, name + ' has bad material arrays: ' + s.badMat);
  ok(s.dark === 0, name + ' has pure-black vertices (brief forbids 0,0,0)');
  ok(s.stack === 1, name + ' leaks the matrix stack: ' + s.stack);
}

// ---------------------------------------------------------------- tri budget
ok(SL.tris <= TRAIN_METRICS.maxTriLoco, 'locomotive over its ' + TRAIN_METRICS.maxTriLoco + ' tri budget: ' + SL.tris);
ok(SC0.tris <= TRAIN_METRICS.maxTriCar, 'coach 0 over its ' + TRAIN_METRICS.maxTriCar + ' tri budget: ' + SC0.tris);
ok(SC1.tris <= TRAIN_METRICS.maxTriCar, 'coach 1 over its ' + TRAIN_METRICS.maxTriCar + ' tri budget: ' + SC1.tris);
ok(SL.tris >= 4000, 'locomotive looks un-detailed, only ' + SL.tris + ' tris');
ok(SC0.tris >= 3500, 'coach looks un-detailed, only ' + SC0.tris + ' tris');
const drawn = SL.tris + SC0.tris * 2 + SC1.tris;   // 1 loco + 3 coaches on screen
ok(drawn <= 45000, 'train draws ' + drawn + ' dynamic tris (round budget 45000)');

// ---------------------------------------------------------------- silhouette
for (const [name, s] of [['loco', SL], ['car0', SC0], ['car1', SC1]]) {
  ok(Math.abs(s.min[0]) <= MAX_HALF_W + 1e-3, name + ' is wider than ' + MAX_HALF_W + ' m half width: ' + s.min[0]);
  ok(Math.abs(s.max[0]) <= MAX_HALF_W + 1e-3, name + ' is wider than ' + MAX_HALF_W + ' m half width: ' + s.max[0]);
  ok(Math.abs(s.max[0]) >= 1.50, name + ' looks too narrow: ' + s.max[0]);
  ok(s.min[1] >= -0.05, name + ' dips below the rail head: ' + s.min[1]);
  ok(s.max[1] <= MAX_LOCAL_H, name + ' is taller than the station arch allows: ' + s.max[1]);
  ok(s.max[1] >= 5.60, name + ' is shorter than a real vehicle: ' + s.max[1]);
  ok(Math.abs(s.max[2]) <= 8.60 && Math.abs(s.min[2]) <= 8.60, name + ' is longer than the actor envelope: z ' + s.min[2] + '..' + s.max[2]);
}
const locoLen = SL.max[2] - SL.min[2];
const carLen = SC0.max[2] - SC0.min[2];
ok(locoLen >= 14.0 && locoLen <= 17.0, 'locomotive length out of range: ' + locoLen.toFixed(2));
ok(carLen >= 14.0 && carLen <= 16.6, 'coach length out of range: ' + carLen.toFixed(2));

// ---------------------------------------------------------------- wheel contact
// every vehicle must touch the rail plane: a tyre contact patch within 0.05 m of y=0
for (const [name, b] of [['loco', loco], ['car0', car0], ['car1', car1]]) {
  let contact = 0, low = 1e9;
  for (let i = 0; i < b.v.length; i += 11) {
    if (Math.abs(b.v[i]) < 0.85) continue;          // only the wheel planes
    const y = b.v[i + 1];
    if (y < low) low = y;
    if (y < 0.05) contact++;
  }
  ok(contact >= 12, name + ' wheels never reach the rail head (' + contact + ' contact verts)');
  ok(low >= -0.05 && low <= 0.05, name + ' wheel tread is not on the rail plane: ' + low.toFixed(3));
}

// ---------------------------------------------------------------- platform alignment
// The coaches' door sills must line up with the station platform (PLY = 28.4).
const PLY = 28.4;
const sillWorld = RAIL_TOP + TRAIN_METRICS.carFloorY;
ok(Math.abs(sillWorld - PLY) < 0.10, 'coach floor does not line up with the platform: ' + sillWorld.toFixed(2) + ' vs ' + PLY);
const coachNet = SC0.max[1] - TRAIN_METRICS.carFloorY;
ok(coachNet >= TRAIN_METRICS.carBodyNetHeight[0] - 0.05, 'coach is lower than a double-decker: ' + coachNet.toFixed(2) + ' m above the sill');
ok(coachNet <= TRAIN_METRICS.carBodyNetHeight[1] + 0.70, 'coach body is too tall: ' + coachNet.toFixed(2) + ' m above the sill');

// ---------------------------------------------------------------- vehicle gaps
// all four vehicles are placed by actor.js at centre distances FIRST, FIRST+GAP, ...
// coach 0's centre sits at local z = -FIRST (behind the loco), so its face
// towards the locomotive is at -FIRST + max z.
const zFront = -FIRST + SC0.max[2];         // coach 0 front face (local z)
const zLocoRear = SL.min[2];
const gapLocoCar = zLocoRear - zFront > 0 ? zLocoRear - zFront : zFront - zLocoRear;
ok(gapLocoCar > MIN_GAP, 'loco -> coach 0 gap is too small: ' + gapLocoCar.toFixed(2) + ' m');
ok(gapLocoCar < 3.0, 'loco -> coach 0 gap is implausibly large: ' + gapLocoCar.toFixed(2) + ' m');
const gapCarCar = GAP - 2 * Math.max(SC0.max[2], SC1.max[2]);
ok(gapCarCar > MIN_GAP, 'coach -> coach gap is too small: ' + gapCarCar.toFixed(2) + ' m');
ok(gapCarCar < 3.5, 'coach -> coach gap is implausibly large: ' + gapCarCar.toFixed(2) + ' m');
// the coaches are strictly behind the locomotive (no overlap along z)
ok(SL.min[2] > zFront, 'locomotive overlaps coach 0: loco rear ' + SL.min[2] + ' vs coach front ' + zFront);
// the wake must sit on the last coach's rear face, not somewhere else
ok(Math.abs(TRAIN_METRICS.wakeLag - (FIRST + GAP * 2 - SC0.min[2])) < 0.02,
  'WAKE_LAG does not match the last coach rear: ' + TRAIN_METRICS.wakeLag);
ok(Math.abs(TRAIN_METRICS.carRearExtent + SC0.min[2]) < 0.30,
  'carRearExtent ' + TRAIN_METRICS.carRearExtent + ' vs measured rear ' + SC0.min[2]);
ok(Math.abs(TRAIN_METRICS.spacing.first - 17.0) < 6, 'unexpected first gap: ' + TRAIN_METRICS.spacing.first);

// ---------------------------------------------------------------- station envelope
// Place the whole train on the station straight and prove it clears both the
// platform channel and the station arch, i.e. no vehicle crosses z=-150.02 /
// z=-141.98 and nothing rises into the y<35.5 canopy zone.
let worstDz = 0, worstY = -1e9, worstLowY = 1e9, outside = 0;
for (const b of [loco, car0, car1]) {
  for (const p of verts(b)) {
    const w = stationWorld(p);
    worstDz = Math.max(worstDz, Math.abs(w[2] - STATION.z));
    worstY = Math.max(worstY, w[1]);
    worstLowY = Math.min(worstLowY, w[1]);
    if (w[2] < CHN + 0.02 || w[2] > CHS - 0.02) outside++;
    if (w[1] < 27.6 || w[1] > 35.5) outside++;
  }
}
ok(outside === 0, 'train intrudes into the station: ' + outside + ' vertices outside the track channel / arch envelope');
ok(worstDz <= 3.96, 'train is too wide for the platform channel: |dz| ' + worstDz.toFixed(3) + ' m (walls at +/-4.02)');
ok(worstY <= 35.50, 'train rises into the station canopy: ' + worstY.toFixed(2) + ' m');
ok(worstLowY >= 27.60, 'train dips below the rail head at the station: ' + worstLowY.toFixed(2));
// also against the documented station envelope box (station-check.mjs)
ok(worstDz <= Math.max(Math.abs(ENV.z0 - STATION.z), Math.abs(ENV.z1 - STATION.z)) - 0.02,
  'train crosses the documented station envelope: |dz| ' + worstDz.toFixed(3));
// the viaduct deck is 3.30 m half width; the train must stay well inside it
ok(MAX_HALF_W <= RAIL_HALF - 0.05, 'body half width ' + MAX_HALF_W + ' leaves no clearance on the deck');
// total train length fits between the station's two end portals (x 22..94)
const trainLen = FIRST + GAP * 2 - SC0.min[2] + SL.max[2];
ok(trainLen < 72.0, 'train is longer than the station between its portals: ' + trainLen.toFixed(1) + ' m');

// ---------------------------------------------------------------- determinism
const loco2 = buildLocomotive();
const car2 = buildCarriage(0);
const car3 = buildCarriage(1);
const SL2 = stats(loco2), SC2 = stats(car2), SC3 = stats(car3);
ok(SL2.tris === SL.tris && SL2.hash === SL.hash, 'locomotive geometry is not deterministic');
ok(SC2.tris === SC0.tris && SC2.hash === SC0.hash, 'coach 0 geometry is not deterministic');
ok(SC3.tris === SC1.tris && SC3.hash === SC1.hash, 'coach 1 geometry is not deterministic');
ok(SC0.tris !== SC1.tris || SC0.hash !== SC1.hash, 'the two coach variants are identical');

// ---------------------------------------------------------------- variants / livery
// both coaches must really be double-decked: two window rows per flank
function rowBands(b) {
  // count vertices sitting in the two window-height bands on the flank planes
  let lo = 0, hi = 0;
  for (let i = 0; i < b.v.length; i += 11) {
    if (Math.abs(b.v[i]) < 1.50) continue;
    const y = b.v[i + 1];
    if (y > 1.10 && y < 2.80) lo++;
    if (y > 3.24 && y < 4.80) hi++;
  }
  return [lo, hi];
}
const [lo0, hi0] = rowBands(car0);
ok(lo0 > 300 && hi0 > 250, 'coach 0 does not read as two window decks: ' + lo0 + '/' + hi0);
ok(Math.abs(lo0 - hi0) < lo0 * 0.9, 'coach 0 window rows are wildly unequal: ' + lo0 + '/' + hi0);

const report = {
  round8_baseline: {
    loco_tris: R8.locoTris, coach_tris: R8.carTris, loco_z: R8.locoZ, coach_z: R8.carZ,
  },
  loco: { tris: SL.tris, bbox: { min: SL.min.map((v) => +v.toFixed(3)), max: SL.max.map((v) => +v.toFixed(3)) }, len: +locoLen.toFixed(2) },
  coach0: { tris: SC0.tris, bbox: { min: SC0.min.map((v) => +v.toFixed(3)), max: SC0.max.map((v) => +v.toFixed(3)) }, len: +carLen.toFixed(2) },
  coach1: { tris: SC1.tris },
  drawn_tris: drawn,
  spacing: { first: FIRST, carGap: GAP, locoCarGap: +gapLocoCar.toFixed(2), carCarGap: +gapCarCar.toFixed(2), wakeLag: TRAIN_METRICS.wakeLag },
  station: { worst_dz: +worstDz.toFixed(3), worst_y: +worstY.toFixed(2), lowest_y: +worstLowY.toFixed(2), train_len: +trainLen.toFixed(1) },
  window_rows_coach0: [lo0, hi0],
  deterministic: SL2.hash === SL.hash && SC2.hash === SC0.hash && SC3.hash === SC1.hash,
};
console.log(JSON.stringify(report, null, 2));
if (fails.length) { console.log('FAIL\n - ' + fails.join('\n - ')); process.exit(1); }
console.log('PASS  train: loco ' + SL.tris + ' tri / coach ' + SC0.tris + '+' + SC1.tris + ' tri (' + drawn +
  ' drawn), 1 loco + 3 double-deckers, wheels on the rail plane, gaps ' + gapLocoCar.toFixed(2) + '/' +
  gapCarCar.toFixed(2) + ' m, station channel + arch clear (|dz| ' + worstDz.toFixed(2) + ', y<= ' + worstY.toFixed(2) + '), deterministic');
