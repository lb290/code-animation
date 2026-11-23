// daynight.js — the three time-of-day looks (day / dusk / night) and the smooth
// cross-fade the renderer samples every frame.
//
//   const dn = new DayNight({ tod: 'day', freeze: false });
//   dn.update(dt)            // advance an in-flight transition (dt=0 when frozen)
//   const look = dn.state    // the composed LOOK fields used by main.js
//   dn.cycle()               // N key: day -> dusk -> night -> day
//   dn.setTod('night')       // ?tod= param: jump directly, no transition
//
// The DAY preset re-exports the old palette.LOOK values verbatim: at tod=day
// (and uNight=0) every branch of the renderer must produce the same pixels as
// the pre-round-6 build.
import { LOOK, C } from './palette.js';
import { rgb } from './geo.js';
import { clamp, norm } from './math.js';

// ---------------------------------------------------------------- globals
// A tiny mutable handle other modules (whale city lights, fireworks) read each
// frame without having to plumb a callback through ctx.
export const ENV = { night: 0, day: 1, tod: 'day', label: '白昼', shadowOn: 1 };

// field groups used by the cross-fade
const NUM_FIELDS = [
  'keyInt', 'ambMul', 'rimInt', 'fogDensity', 'fogMax',
  'exposure', 'bloomThreshold', 'bloomInt', 'saturation', 'contrast', 'vignette',
  'night', 'starInt', 'moonInt', 'moonSize', 'cloudCov',
];
const COL_FIELDS = [
  'skyZenith', 'skyMid', 'skyHorizon', 'haze', 'sunColor',
  'cloudLit', 'cloudShade', 'cloudDeep',
  'keyColor', 'ambSky', 'ambGround', 'rim', 'fogColor', 'shadowTint', 'moonColor',
  'cloudBillboardTint',   // multiplier for the baked-white cloud sprites
];
const DIR_FIELDS = ['sunDir', 'sunVisDir', 'keyDir', 'moonDir'];

// derived values the renderer reads directly (never interpolated as numbers)
function derive(o) {
  o.glow = clamp(o.night * 1.06, 0, 1.15);            // city night-window additive gain
  o.sunGlare = Math.max(0.05, 1 - o.night * 1.12);    // the baked sun-glare sprite
  o.shadowOn = o.night < 0.5 ? 1 : 0;                 // sun shadow map on by day / dusk
  o.fireworks = o.night > 0.42;                       // auto fireworks allowed
  return o;
}

const DAY_SUN = norm(LOOK.sunDir);
export const DAY = derive({
  ...LOOK,
  sunDir: DAY_SUN,          // main.js always used norm(LOOK.sunDir)
  sunVisDir: DAY_SUN,
  keyDir: DAY_SUN,
  keyColor: LOOK.sunColor,
  moonDir: norm([-0.62, 0.55, -0.42]),   // same faint daytime moon as before
  moonColor: C.moon,
  cloudBillboardTint: [1, 1, 1],   // exact white: day billboards unchanged
  night: 0,
  starInt: 0,
  moonInt: 0,
  moonSize: 0.014,
  cloudCov: 0.15,
  label: '白昼',
  key: 'day',
});

export const DUSK = derive({
  ...DAY,
  skyZenith: rgb('#28306e'),
  skyMid: rgb('#8a5f96'),
  skyHorizon: rgb('#f7b073'),
  haze: rgb('#ffd2a6'),
  sunColor: rgb('#ffb877'),
  cloudLit: rgb('#ffdcc0'),
  cloudShade: rgb('#b9869f'),
  cloudDeep: rgb('#7b628f'),
  keyColor: rgb('#ffbe86'),
  keyInt: 0.92,
  ambSky: rgb('#8d8fc9'),
  ambGround: rgb('#d0a074'),
  ambMul: 0.30,
  rim: rgb('#ffd8ad'),
  rimInt: 0.50,
  fogColor: rgb('#e5b394'),
  fogDensity: 0.00105,
  fogMax: 0.90,
  exposure: 1.02,
  bloomThreshold: 1.10,
  bloomInt: 0.30,
  saturation: 1.30,
  contrast: 1.10,
  vignette: 0.24,
  shadowTint: rgb('#b09acb'),
  cloudBillboardTint: rgb('#ffb98a'),
  sunVisDir: norm([-0.66, 0.18, 0.73]),
  night: 0.24,
  starInt: 0.06,
  moonInt: 0.18,
  moonSize: 0.020,
  cloudCov: 0.13,
  label: '黄昏',
  key: 'dusk',
});

export const NIGHT = derive({
  ...DAY,
  skyZenith: rgb('#050a22'),
  skyMid: rgb('#0e173c'),
  skyHorizon: rgb('#1d2a49'),
  haze: rgb('#222e50'),
  sunColor: rgb('#8798c0'),
  cloudLit: rgb('#4b5a84'),
  cloudShade: rgb('#232c4c'),
  cloudDeep: rgb('#161c33'),
  keyColor: rgb('#adc0ea'),
  keyInt: 0.46,
  ambSky: rgb('#40527a'),
  ambGround: rgb('#202535'),
  ambMul: 0.34,
  rim: rgb('#93aee2'),
  rimInt: 0.55,
  fogColor: rgb('#131c36'),
  fogDensity: 0.00102,
  fogMax: 0.92,
  exposure: 1.08,
  bloomThreshold: 0.80,
  bloomInt: 0.42,
  saturation: 1.10,
  contrast: 1.12,
  vignette: 0.30,
  shadowTint: rgb('#5b6b9c'),
  // the sun is gone; the sky glow follows the moon
  sunVisDir: norm([-0.62, 0.30, -0.60]),
  // moonlight fill from the visitor's side so the facades still read
  keyDir: norm([-0.22, 0.55, 0.80]),
  // a big painted moon on the +X side of the terrace view — deliberately away
  // from the whale's patrol (which sweeps the -X / -Z sky and would hide it)
  moonDir: norm([0.50, 0.56, -0.66]),
  moonColor: rgb('#eef3ff'),
  cloudBillboardTint: rgb('#4d5c80'),
  night: 1.0,
  starInt: 1.0,
  moonInt: 1.0,
  moonSize: 0.050,
  cloudCov: 0.02,   // a mostly clear night sky: stars + a big painted moon
  label: '夜晚',
  key: 'night',
});

export const PRESETS = { day: DAY, dusk: DUSK, night: NIGHT };
export const TOD_ORDER = ['day', 'dusk', 'night'];

// ---------------------------------------------------------------- cross-fade
// Returns a fresh LOOK-shaped object (or one of the presets verbatim at t=0/1).
export function compose(a, b, t) {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const o = { label: t < 0.5 ? a.label : b.label, key: t < 0.5 ? a.key : b.key };
  for (const k of NUM_FIELDS) o[k] = a[k] + (b[k] - a[k]) * t;
  for (const k of COL_FIELDS) {
    const ca = a[k], cb = b[k];
    o[k] = [ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t];
  }
  for (const k of DIR_FIELDS) {
    const da = a[k], db = b[k];
    o[k] = norm([da[0] + (db[0] - da[0]) * t, da[1] + (db[1] - da[1]) * t, da[2] + (db[2] - da[2]) * t]);
  }
  return derive(o);
}

export class DayNight {
  constructor(opts = {}) {
    this.order = TOD_ORDER.slice();
    this.dur = Math.max(0.2, num(opts.duration, 3.0));
    this.freeze = !!opts.freeze;
    const key = String(opts.tod == null ? 'day' : opts.tod).toLowerCase();
    const i = this.order.indexOf(key);
    if (i < 0 && key !== 'day') console.warn('[daynight] unknown tod "' + key + '"; using day');
    this.from = i < 0 ? 0 : i;
    this.to = this.from;
    this.k = 1;
    this.transitioning = false;
    this._rebuild();
  }
  _rebuild() {
    const A = PRESETS[this.order[this.from]];
    const B = PRESETS[this.order[this.to]];
    const s = this.k >= 1 ? B : this.k <= 0 ? A : compose(A, B, this.k);
    this._cur = s;
    ENV.night = s.night;
    ENV.day = 1 - s.night;
    ENV.tod = s.key;
    ENV.label = s.label;
    ENV.shadowOn = s.shadowOn;
    return s;
  }
  get state() { return this._cur; }
  get label() { return this._cur.label; }
  get tod() { return this._cur.key; }
  get night() { return this._cur.night; }
  get glow() { return this._cur.glow; }
  get isNight() { return this._cur.night > 0.5; }
  /** jump straight to a preset (also what ?tod= does) */
  setTod(key, instant = true) {
    const i = this.order.indexOf(String(key).toLowerCase());
    if (i < 0) { console.warn('[daynight] unknown tod "' + key + '"'); return false; }
    this.to = i;
    if (instant || this.from === i) { this.from = i; this.k = 1; this.transitioning = false; }
    else { this.from = this.to; this.k = 0; this.transitioning = true; }
    this._rebuild();
    return true;
  }
  /** N key: day -> dusk -> night -> day (3 s cross-fade) */
  cycle() {
    const next = (this.to + 1) % this.order.length;
    this.from = this.to;
    this.to = next;
    this.k = 0;
    this.transitioning = true;
    this._rebuild();
    return this.order[next];
  }
  /** advance the transition; dt=0 keeps the frozen frame bit-identical */
  update(dt) {
    if (!this.freeze && this.k < 1 && dt > 0) {
      this.k = Math.min(1, this.k + dt / this.dur);
      if (this.k >= 1) this.transitioning = false;
      this._rebuild();
    }
    return this._cur;
  }
}

function num(v, d) {
  return typeof v === 'number' && isFinite(v) ? v : d;
}

export default DayNight;
