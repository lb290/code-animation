// node tools/night-check.mjs — round 6 · day/night + fireworks + night windows.
// Pure node (no GL / no browser):
//   * DayNight preset table: every renderer field present, finite, in range,
//     day preset identical to palette.LOOK, transition endpoints correct,
//     day -> dusk -> night -> day state machine.
//   * fireworks: analytic determinism (same shell + same age = same sprites),
//     auto cycle determinism, ?fw=0 / ?fw=N behaviour, sane world bounds.
//   * night windows: arch.js collection, deterministic 12000-window sampling,
//     finite additive quads, stable vertex hash.
import { mulberry32 } from '../src/math.js';
import { B } from '../src/geo.js';
import { LOOK } from '../src/palette.js';
import { DayNight, DAY, DUSK, NIGHT, PRESETS, TOD_ORDER, compose, ENV } from '../src/daynight.js';
import { buildShell, shellBillboards, smokeBillboards, buildAutoCycle, visibleAuto, makeFireworks, FW_LIMITS, FW_KIND, FW_PADS } from '../src/fireworks.js';
import { buildNightData, sampleWindows, lampPositions, NIGHT_LIMITS } from '../src/night-lights.js';
import { NIGHT_WIN, setWinCollect, clearWinCollect } from '../src/arch.js';

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };
const eq = (a, b, msg) => ok(a === b, msg + ' (got ' + a + ', want ' + b + ')');
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const hashArr = (a, stride = 1) => {
  let h = 2166136261;
  for (let i = 0; i < a.length; i += stride) h = Math.imul(h ^ Math.round((a[i] || 0) * 4096), 16777619) >>> 0;
  return h;
};
const NUM_FIELDS = ['keyInt', 'ambMul', 'rimInt', 'fogDensity', 'fogMax', 'exposure', 'bloomThreshold', 'bloomInt',
  'saturation', 'contrast', 'vignette', 'night', 'starInt', 'moonInt', 'moonSize', 'cloudCov'];
const COL_FIELDS = ['skyZenith', 'skyMid', 'skyHorizon', 'haze', 'sunColor', 'cloudLit', 'cloudShade', 'cloudDeep',
  'keyColor', 'ambSky', 'ambGround', 'rim', 'fogColor', 'shadowTint', 'moonColor'];
const DIR_FIELDS = ['sunDir', 'sunVisDir', 'keyDir', 'moonDir'];

// ---------------------------------------------------------------- 1. presets
console.log('== daynight presets ==');
for (const key of TOD_ORDER) {
  const p = PRESETS[key];
  for (const f of NUM_FIELDS) ok(num(p[f]), 'preset ' + key + ' numeric ' + f);
  for (const f of COL_FIELDS) {
    const c = p[f];
    ok(Array.isArray(c) && c.length === 3 && c.every(num), 'preset ' + key + ' colour ' + f);
    if (c) ok(c.every((v) => v >= 0 && v <= 1.05), 'preset ' + key + ' colour range ' + f);
  }
  for (const f of DIR_FIELDS) {
    const d = p[f];
    ok(Array.isArray(d) && d.length === 3 && d.every(num), 'preset ' + key + ' dir ' + f);
    if (d) ok(Math.abs(Math.hypot(d[0], d[1], d[2]) - 1) < 1e-6, 'preset ' + key + ' dir unit ' + f);
  }
  ok(typeof p.label === 'string' && p.label.length > 0, 'preset ' + key + ' label');
  ok(num(p.glow) && num(p.sunGlare) && (p.shadowOn === 0 || p.shadowOn === 1), 'preset ' + key + ' derived');
}
eq(DAY.night, 0, 'DAY night');
eq(NIGHT.night, 1, 'NIGHT night');
eq(DUSK.night > 0 && DUSK.night < 0.5, true, 'DUSK night is between day and night');
ok(DAY.glow === 0, 'DAY window glow is exactly 0 (no day-time regression)');
ok(DAY.starInt === 0 && DAY.moonInt === 0, 'DAY stars / moon discs off');
ok(DAY.shadowOn === 1 && NIGHT.shadowOn === 0, 'shadow map: day on, night off');
// day preset must be the old LOOK values verbatim
for (const k of Object.keys(LOOK)) {
  if (k === 'sunDir') continue;   // main.js always used norm(LOOK.sunDir); checked below
  const a = LOOK[k], b = DAY[k];
  if (Array.isArray(a)) {
    ok(Array.isArray(b) && a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-9), 'DAY == LOOK.' + k);
  } else {
    ok(Math.abs(a - b) < 1e-12, 'DAY == LOOK.' + k);
  }
}
ok(DAY.key === 'day' && NIGHT.key === 'night' && DUSK.key === 'dusk', 'preset keys');
ok(Math.abs(Math.hypot(...DAY.sunDir) - 1) < 1e-6 && DAY.sunDir.every((v, i) => Math.abs(v - LOOK.sunDir[i] / Math.hypot(...LOOK.sunDir)) < 1e-9), 'DAY.sunDir == norm(LOOK.sunDir)');

console.log('== cross-fade ==');
const mid = compose(DAY, NIGHT, 0.5);
ok(mid.night > 0.4 && mid.night < 0.6, 'midpoint night blends');
ok(compose(DAY, NIGHT, 0) === DAY && compose(DAY, NIGHT, 1) === NIGHT, 'fade endpoints are the presets');
for (const f of NUM_FIELDS) ok(num(mid[f]), 'mid numeric ' + f);
for (const f of COL_FIELDS) ok(mid[f].every(num), 'mid colour ' + f);
for (const f of DIR_FIELDS) ok(Math.abs(Math.hypot(...mid[f]) - 1) < 1e-6, 'mid dir unit ' + f);

console.log('== state machine ==');
const dn = new DayNight({ tod: 'day' });
eq(dn.state.key, 'day', 'start day');
eq(ENV.night, 0, 'ENV.night starts 0');
dn.cycle();
ok(dn.transitioning === true && dn.state.key === 'day', 'day -> dusk starts from the day preset');
dn.update(10);
eq(dn.state.key, 'dusk', 'day -> dusk completes');
ok(Math.abs(dn.state.night - DUSK.night) < 1e-9, 'dusk night value');
dn.cycle();
dn.update(1.5);
ok(dn.state.night > DUSK.night, 'dusk -> night mid blend');
dn.update(10);
eq(dn.state.key, 'night', 'dusk -> night completes');
eq(ENV.night, 1, 'ENV.night tracks night');
dn.cycle();
dn.update(10);
eq(dn.state.key, 'day', 'night -> day completes');
eq(ENV.night, 0, 'ENV.night back to 0');
dn.setTod('night');
eq(dn.state.night, 1, 'setTod(night) instant');
dn.setTod('bogus');
eq(dn.state.key, 'night', 'unknown tod is ignored');
const dnDay = new DayNight({ tod: 'day', freeze: true });
dnDay.cycle();
dnDay.update(10);
eq(dnDay.state.key, 'day', 'freeze holds the current look');
ok(new DayNight({ tod: 'night' }).state.starInt > 0.5, '?tod=night stars on');

// ---------------------------------------------------------------- 2. fireworks
console.log('== fireworks ==');
const spec = { t0: 2, seed: 424242, pad: FW_PADS[0], burstH: 104, kind: FW_KIND.SPHERE, colorIdx: 0, hasSecond: true };
const sh1 = buildShell(spec);
const sh2 = buildShell(spec);
eq(sh1.N, sh2.N, 'shell particle count stable');
eq(sh1.ta, sh2.ta, 'shell ascent time stable');
let sameTables = true;
for (const k of ['dir', 'speed', 'drag', 'life', 'size', 'phase', 'pcol', 'sDir', 'sSpeed', 'sLife', 'sCol']) {
  if (sh1[k].length !== sh2[k].length || hashArr(sh1[k]) !== hashArr(sh2[k])) sameTables = false;
}
ok(sameTables, 'shell tables deterministic for a seed');
ok(sh1.N >= 60 && sh1.N <= 200, 'burst particle count in 60..200 (' + sh1.N + ')');
ok(sh1.p1[1] > 80 && sh1.p1[1] < 200, 'burst height 80..200 (' + sh1.p1[1].toFixed(1) + ')');
ok(FW_PADS.every((p) => p[1] < 5), 'launch pads sit on the ground');

function collect(shell, age) {
  const out = [];
  const bb = { add: (x, y, z, size, rot, alpha, shape, col) => out.push([x, y, z, size, rot, alpha, shape, col[0], col[1], col[2]]) };
  // (shellBillboards takes a Billboards-like sink object)
  shellBillboards(shell, age, bb);
  return out;
}
function collectSmoke(shell, age) {
  const out = [];
  const bb = { add: (x, y, z, size, rot, alpha, shape, col) => out.push([x, y, z, size, rot, alpha, shape, col[0], col[1], col[2]]) };
  smokeBillboards(shell, age, bb);
  return out;
}
const ages = [0.2, sh1.ta * 0.5, sh1.ta - 0.05, sh1.ta + 0.01, sh1.ta + 0.5, sh1.ta + 1.5];
let maxSprites = 0, allFinite = true, inBounds = true;
for (const age of ages) {
  const a = collect(sh1, age);
  const b = collect(sh1, age);
  ok(a.length === b.length && hashArr(a.flat()) === hashArr(b.flat()), 'analytic: same age -> same sprites (' + age.toFixed(2) + 's)');
  maxSprites = Math.max(maxSprites, a.length);
  for (const s of a) {
    if (!s.every(num)) allFinite = false;
    if (Math.abs(s[0]) > 1200 || Math.abs(s[2]) > 1200 || s[1] < -80 || s[1] > 500) inBounds = false;
    if (s[5] < 0 || s[5] > 1) ok(false, 'sprite alpha in 0..1');
  }
}
ok(allFinite, 'all firework sprites finite');
ok(inBounds, 'all firework sprites inside the world bounds');
ok(maxSprites <= FW_LIMITS.perShell, 'one shell draws <= ' + FW_LIMITS.perShell + ' sprites (' + maxSprites + ')');
// C2: sparks stay small enough to read as grains, density carries the show,
// and only a handful of small glows are used for the flash / crown.
const burstA = collect(sh1, sh1.ta + 0.25);
const sparks = burstA.filter((s) => s[6] === 0);
const glows = burstA.filter((s) => s[6] === 1);
const readable = sparks.filter((s) => s[3] >= 2.2 && s[3] <= 5.0);
ok(sparks.length >= 100, 'burst has >= 100 individual sparks (' + sparks.length + ')');
ok(readable.length / Math.max(1, sparks.length) >= 0.9, '>= 90% of sparks are 2.2..5 m at 200-350 m (' + readable.length + '/' + sparks.length + ')');
ok(glows.length >= 1 && glows.length <= FW_LIMITS.glow, 'only 1..' + FW_LIMITS.glow + ' glow sprites per shell (' + glows.length + ')');
ok(glows.every((s) => s[3] <= 16), 'glows stay <= 16 m (no big wash)');
ok(sparks.every((s) => s[5] >= 0.5), 'sparks keep a strong alpha');
const trailA = collect(sh1, sh1.ta * 0.95);
ok(trailA.length >= 18, 'ascent trail has >= 18 sprites (' + trailA.length + ')');
const smokeA = collectSmoke(sh1, sh1.ta + 0.6);
const smokeB = collectSmoke(sh1, sh1.ta + 0.6);
ok(smokeA.length > 0 && hashArr(smokeA.flat()) === hashArr(smokeB.flat()), 'smoke sprites deterministic at a fixed age');
ok(smokeA.every((s) => s[6] === 6), 'smoke uses the soft-puff billboard shape (6)');
ok(smokeA.length <= FW_LIMITS.smoke, 'only ' + FW_LIMITS.smoke + ' smoke puffs per burst (' + smokeA.length + ')');
ok(smokeA.every((s) => s[3] >= 20 && s[3] <= 60 && s[5] <= 0.26), 'smoke puffs are 20..60 m with low alpha');
// colour mix must be gold / warm-white dominant (not a violet shell)
const dom = {};
for (const s of sparks) {
  const k = s[9] > s[7] * 1.25 && s[9] > s[8] * 1.15 ? 'cool' : s[7] >= s[9] * 1.25 ? 'warm' : 'other';
  dom[k] = (dom[k] || 0) + 1;
}
ok((dom.warm || 0) >= (dom.cool || 0), 'warm/gold sparks dominate a shell (' + JSON.stringify(dom) + ')');
ok(collectSmoke(sh1, -1).length === 0 && collectSmoke(sh1, 30).length === 0, 'no smoke outside the shell lifetime');
ok(maxSprites + smokeA.length <= FW_LIMITS.perShell, 'sparks + smoke stay under the per-shell cap');
ok(collect(sh1, -1).length === 0, 'no sprites before launch');
ok(collect(sh1, 30).length === 0, 'no sprites long after the show');

const cyc = buildAutoCycle(9151);
const cyc2 = buildAutoCycle(9151);
eq(cyc.shells.length, 48, 'auto cycle shell count');
eq(cyc.period, cyc2.period, 'auto cycle period deterministic');
eq(hashArr(cyc.shells.map((s) => s.t0)), hashArr(cyc2.shells.map((s) => s.t0)), 'auto cycle times deterministic');
let gapsOk = true;
for (let i = 1; i < cyc.shells.length; i++) {
  const g = cyc.shells[i].t0 - cyc.shells[i - 1].t0;
  if (g < FW_LIMITS.autoMinGap - 1e-6 || g > FW_LIMITS.autoMaxGap + 1e-6) gapsOk = false;
}
ok(gapsOk, 'automatic fireworks every ' + FW_LIMITS.autoMinGap + '..' + FW_LIMITS.autoMaxGap + ' s');
const vis = visibleAuto(cyc, 30);
ok(vis.length > 0 && vis.length <= 4, 'auto visible shells at t=30 (' + vis.length + ')');
eq(hashArr(vis.map((v) => v.age)), hashArr(visibleAuto(cyc, 30).map((v) => v.age)), 'visibleAuto deterministic');
ok(visibleAuto(cyc, 30).every((v) => v.age >= 0 && v.age < 10), 'visible ages sane');

// runtime systems
ENV.night = 1;
const fwOff = makeFireworks({ fw: 0 });
const bbA = { add: () => { bbA.n++; }, n: 0 };
fwOff.system.fill(30, bbA, 0);
eq(bbA.n, 0, '?fw=0 disables every firework');
const bbS = { add: () => { bbS.n++; }, n: 0 };
fwOff.smokeSystem.fill(30, bbS, 0);
eq(bbS.n, 0, '?fw=0 also disables the smoke layer');
eq(fwOff.volley(10).length, 0, '?fw=0 makes the F volley a no-op');
const fwOn = makeFireworks({ fw: 6 });
eq(fwOn.manual.length, 6, '?fw=6 preloads 6 shells');
const bbB = { add: () => { bbB.n++; }, n: 0 };
fwOn.system.fill(3, bbB, 0);
ok(bbB.n > 0, '?fw=6 shows shells at t=3 (' + bbB.n + ' sprites)');
const bbC = { add: () => { bbC.n++; }, n: 0 };
fwOn.system.fill(3, bbC, 0);
eq(bbB.n, bbC.n, 'frozen frame draws the same sprites every time');
ENV.night = 0;
const fwDay = makeFireworks({ fw: null });
const bbD = { add: () => { bbD.n++; }, n: 0 };
fwDay.system.fill(30, bbD, 0);
eq(bbD.n, 0, 'no automatic fireworks in daylight');
ok(fwOn.system.additive === true, 'sparks use the additive pass');
ok(fwOn.smokeSystem && fwOn.smokeSystem.additive === false, 'smoke uses the normal alpha pass');
ok(fwOn.systems.length === 2 && fwOn.systems[0] === fwOn.system && fwOn.systems[1] === fwOn.smokeSystem, 'systems array exposes both layers');
ok(fwOn.smokeSystem.fill(3, { add: () => {} }, 0) >= 0, 'smoke system fills without throwing');

// C2: F key volley — 2-3 shells, staggered 0.1..0.22 s, different pads/colours
const volA = makeFireworks({ fw: null, seed: 9151 });
const volB = makeFireworks({ fw: null, seed: 9151 });
const shotA = volA.volley(5);
const shotB = volB.volley(5);
ok(shotA.length >= FW_LIMITS.volleyMin && shotA.length <= FW_LIMITS.volleyMax, 'volley fires 2..3 shells (' + shotA.length + ')');
ok(shotA.length === shotB.length, 'volley shell count deterministic');
eq(hashArr(shotA.map((s) => s.t0 + s.p1[0] * 3 + s.p1[2] * 7)), hashArr(shotB.map((s) => s.t0 + s.p1[0] * 3 + s.p1[2] * 7)), 'volley shells deterministic (same seed)');
let staggerOk = true, padsOk = true;
for (let i = 1; i < shotA.length; i++) {
  const dt = shotA[i].t0 - shotA[i - 1].t0;
  if (!(dt >= 0.05 && dt <= 0.30)) staggerOk = false;
  if (shotA[i].pad[0] === shotA[i - 1].pad[0] && shotA[i].pad[2] === shotA[i - 1].pad[2]) padsOk = false;
}
ok(staggerOk, 'volley shells staggered 0.05..0.30 s');
ok(padsOk, 'volley shells launch from different pads');
ok(shotA.every((s) => s.p1[1] > 60 && s.p1[1] < 220), 'volley burst heights sane');
const burstT = shotA[0].t0 + shotA[0].ta + 0.30;
const bbVol = { n: 0, add: () => { bbVol.n++; } };
volA.system.fill(burstT, bbVol, 0);
ok(bbVol.n > 100, 'volley draws a lot of sparks at the first burst (' + bbVol.n + ' @t=' + burstT.toFixed(2) + ')');
// one frame never exceeds the frame budget
const bbCap = { n: 0, add: () => { bbCap.n++; } };
for (const tq of [burstT, burstT + 0.6, burstT + 1.2, burstT + 2.2]) {
  const bbOne = { n: 0, add: () => { bbOne.n++; } };
  volA.system.fill(tq, bbOne, 0);
  ok(bbOne.n <= FW_LIMITS.capacityPerFrame, 'frame sprite budget respected at t=' + tq + ' (' + bbOne.n + ')');
}
void bbCap;

// ---------------------------------------------------------------- 3. night windows
console.log('== night windows ==');
clearWinCollect();
setWinCollect(true);
const fake = [];
for (let i = 0; i < 20000; i++) {
  const a = (i / 20000) * Math.PI * 2;
  fake.push({ c: [Math.cos(a) * 200, 10 + (i % 40), Math.sin(a) * 200], n: [Math.cos(a), 0, Math.sin(a)], t: [-Math.sin(a), 0, Math.cos(a)], w: 1.6, h: 4.2 });
}
const s1 = sampleWindows(fake, NIGHT_LIMITS.windows);
const s2 = sampleWindows(fake, NIGHT_LIMITS.windows);
eq(s1.used, s2.used, 'sampling count deterministic');
eq(s1.stride, s2.stride, 'sampling stride deterministic');
ok(s1.used <= NIGHT_LIMITS.windows, 'night windows <= ' + NIGHT_LIMITS.windows + ' (' + s1.used + ')');
ok(s1.used >= 8000, 'sampling keeps a dense city (' + s1.used + ')');
const d1 = buildNightData({ windows: fake, seed: 7719 });
const d2 = buildNightData({ windows: fake, seed: 7719 });
eq(d1.stats.tris, d2.stats.tris, 'night mesh tri count deterministic');
eq(hashArr(d1.verts, 3), hashArr(d2.verts, 3), 'night mesh vertex hash deterministic');
ok(d1.stats.windows <= NIGHT_LIMITS.windows, 'lit windows capped');
let nwFinite = true, nwNormalOk = true;
for (let i = 0; i < d1.verts.length; i += 11) {
  const v = d1.verts;
  if (![0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].every((k) => Number.isFinite(v[i + k]))) nwFinite = false;
  if (Math.abs(Math.hypot(v[i + 3], v[i + 4], v[i + 5]) - 1) > 1e-3) nwNormalOk = false;
}
ok(nwFinite, 'night mesh vertices finite');
ok(nwNormalOk, 'night quad normals are unit length');
ok(d1.stats.tris === d1.stats.windows * 2 + d1.stats.lamps * 16, 'tri budget = 2/window + 16/lamp (' + d1.stats.tris + ')');
ok(d1.stats.lamps > 20 && d1.stats.lamps <= NIGHT_LIMITS.lamps, 'street lamp count (' + d1.stats.lamps + ')');
ok(lampPositions().length === d1.stats.lamps, 'lamp positions stable');
// zero-glow check: the shader multiplies by uNightGlow, at day that is 0 -> no change
ok(DAY.glow === 0, 'uNightGlow = 0 in daylight => additive layer invisible');

console.log('== arch window collection ==');
clearWinCollect();
setWinCollect(true);
// one hero block exercises every glassRect / glassArch code path
const archMod = await import('../src/arch.js');
const run = (seed) => {
  clearWinCollect();
  setWinCollect(true);
  const b = new B();
  archMod.buildBuilding(b, {}, mulberry32(seed), { x: 0, z: 0, rot: 0.2, w: 30, d: 24, floors: 5, detail: 2, tone: 0.4, roof: 'mansard', sides: 4 });
  return { n: NIGHT_WIN.list.length, hash: hashArr(NIGHT_WIN.list.map((w) => w.c[0] + w.c[1] * 3 + w.c[2] * 7 + w.w)), tris: b.i.length / 3 };
};
const r1 = run(20261122);
const r2 = run(20261122);
eq(r1.n, r2.n, 'arch window collection count deterministic');
eq(r1.hash, r2.hash, 'arch window collection hash deterministic');
ok(r1.n > 40, 'a hero block registers many windows (' + r1.n + ')');
let winOk = true;
for (const w of NIGHT_WIN.list) {
  if (!w.c.every(num) || !w.n.every(num) || !w.t.every(num) || !num(w.w) || !num(w.h)) winOk = false;
  if (Math.abs(Math.hypot(...w.n) - 1) > 1e-3) winOk = false;
}
ok(winOk, 'collected windows finite with unit normals');
// the whale-city build disables collection (its windows are whale-local)
setWinCollect(false);
clearWinCollect();
archMod.buildBuilding(new B(), {}, mulberry32(7), { x: 0, z: 0, rot: 0, w: 30, d: 24, floors: 5, detail: 2, tone: 0.4, roof: 'mansard', sides: 4 });
eq(NIGHT_WIN.list.length, 0, 'setWinCollect(false) stops collection');
setWinCollect(true);
clearWinCollect();

// ---------------------------------------------------------------- summary
const pass = fails.length === 0;
console.log('');
if (pass) {
  console.log('PASS  night-check — day/dusk/night presets, analytic fireworks, 12000-window night layer');
} else {
  console.log('FAIL  ' + fails.length + ' assertion(s):');
  for (const f of fails.slice(0, 40)) console.log('  - ' + f);
  process.exitCode = 1;
}
