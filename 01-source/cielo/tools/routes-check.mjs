// Data-only checks for the three themed guided routes (no GL / browser needed).
//   node tools/routes-check.mjs
// Validates src/routes.js against the real scene data: every stop's view index
// exists in L.views (src/layout.js), every lore id exists in LORE (src/lore.js),
// the stops are ordered sanely, and the three routes cover enough almanac pages.
import { L } from '../src/layout.js';
import { LORE } from '../src/lore.js';
import { ROUTES, routeById } from '../src/routes.js';

const VIEWS = L.views;
const VIEW_MAX = 83;                     // 84 viewpoints, 0-based (80-83 = round 14 云井塔)
const LORE_BY_ID = new Map(LORE.map((e) => [e.id, e]));
const REQUIRED_LORE = ['cathedral', 'station', 'opera', 'tea', 'whale', 'observatory'];
const EXPECTED_IDS = ['architecture', 'wonder', 'secret'];
const MIN_STOPS = 5, MAX_STOPS = 8;
const STAY_MIN = 8, STAY_MAX = 20;
const NOTE_MAX = 18;

let fails = 0;
function ok(name, cond, detail) {
  if (!cond) fails++;
  console.log((cond ? '  PASS ' : '  FAIL ') + name + (detail ? '  ' + detail : ''));
}
const chars = (s) => [...String(s)].length;

// ------------------------------------------------------------------ shapes
console.log('== scene data ==');
ok('layout.js exposes 84 viewpoints', VIEWS.length === 84, 'L.views=' + VIEWS.length);
ok('lore.js exposes 32 almanac pages', LORE.length === 32, 'LORE=' + LORE.length);

console.log('\n== route table ==');
ok('ROUTES is an array of three routes', Array.isArray(ROUTES) && ROUTES.length === 3, 'n=' + (ROUTES && ROUTES.length));
const ids = ROUTES.map((r) => r.id);
ok('route ids unique and non-empty',
  ids.every((id) => typeof id === 'string' && id.trim().length > 0) && new Set(ids).size === 3,
  ids.join(', '));
ok('route ids are exactly ' + EXPECTED_IDS.join(' / '),
  ids.slice().sort().join(',') === EXPECTED_IDS.slice().sort().join(','), ids.join(','));
for (const r of ROUTES) {
  ok(r.id + ' has name / en / blurb', [r.name, r.en, r.blurb].every((s) => typeof s === 'string' && s.trim().length > 0));
  ok(r.id + ' blurb is 16-24 chars', chars(r.blurb) >= 16 && chars(r.blurb) <= 24, chars(r.blurb) + ' 字');
}

// ------------------------------------------------------------------ stops
const usedViews = new Set();
const usedLore = new Set();
let totalStops = 0;
for (const r of ROUTES) {
  console.log('\n== ' + r.id + ' · ' + r.name + ' (' + (r.stops ? r.stops.length : 0) + ' stops) ==');
  const stops = Array.isArray(r.stops) ? r.stops : [];
  totalStops += stops.length;
  ok(r.id + ' has ' + MIN_STOPS + '-' + MAX_STOPS + ' stops',
    stops.length >= MIN_STOPS && stops.length <= MAX_STOPS, 'n=' + stops.length);

  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    const at = r.id + '[' + i + '] ';
    const viewOk = Number.isInteger(s.view) && s.view >= 0 && s.view <= VIEW_MAX && !!VIEWS[s.view];
    ok(at + 'view is a valid viewpoint index', viewOk, 'view=' + s.view + (viewOk ? ' 「' + VIEWS[s.view].name + '」' : ''));
    const loreOk = typeof s.lore === 'string' && LORE_BY_ID.has(s.lore);
    ok(at + 'lore is a real almanac page', loreOk, 'lore=' + s.lore + (loreOk ? ' 「' + LORE_BY_ID.get(s.lore).title + '」' : ''));
    ok(at + 'stay is an integer in ' + STAY_MIN + '..' + STAY_MAX,
      Number.isInteger(s.stay) && s.stay >= STAY_MIN && s.stay <= STAY_MAX, 'stay=' + s.stay + 's');
    ok(at + 'title and note are non-empty',
      typeof s.title === 'string' && s.title.trim().length > 0 &&
      typeof s.note === 'string' && s.note.trim().length > 0);
    ok(at + 'note <= ' + NOTE_MAX + ' chars', chars(s.note) <= NOTE_MAX, chars(s.note) + ' 字');
    if (i > 0) {
      ok(at + 'is a different camera from the previous stop', s.view !== stops[i - 1].view,
        'view ' + stops[i - 1].view + ' -> ' + s.view);
    }
    if (viewOk) usedViews.add(s.view);
    if (loreOk) usedLore.add(s.lore);
  }
  const views = stops.map((s) => s.view);
  ok(r.id + ' never repeats a viewpoint', new Set(views).size === views.length,
    new Set(views).size + '/' + views.length + ' distinct');
  const loreIds = stops.map((s) => s.lore);
  ok(r.id + ' opens at least ' + Math.min(4, stops.length) + ' distinct pages', new Set(loreIds).size >= Math.min(4, stops.length),
    new Set(loreIds).size + ' pages');
}

// ------------------------------------------------------------- coverage
console.log('\n== coverage ==');
ok('three routes total 20 stops', totalStops === 20, 'n=' + totalStops);
ok('at least 12 distinct almanac pages across the three routes', usedLore.size >= 12, 'n=' + usedLore.size);
const missing = REQUIRED_LORE.filter((id) => !usedLore.has(id));
ok('key pages visited (' + REQUIRED_LORE.join(', ') + ')', missing.length === 0,
  missing.length ? 'missing ' + missing.join(', ') : usedLore.size + ' pages');
ok('every used page is still a real LORE entry', [...usedLore].every((id) => LORE_BY_ID.has(id)));

// --------------------------------------------------------------- lookup
console.log('\n== routeById ==');
for (const id of EXPECTED_IDS) {
  const r = routeById(id);
  ok('routeById(' + id + ') finds the route', !!r && r.id === id, r ? r.stops.length + ' stops' : 'null');
}
ok('routeById of an unknown id returns null', routeById('no-such-route') === null);
ok('routeById of undefined returns null', routeById(undefined) === null);
ok('routeById of empty string returns null', routeById('') === null);

// ----------------------------------------------------------- stop listing
console.log('\n== stop list ==');
for (const r of ROUTES) {
  for (const [i, s] of r.stops.entries()) {
    const vn = VIEWS[s.view] ? VIEWS[s.view].name : '??';
    const ln = LORE_BY_ID.has(s.lore) ? LORE_BY_ID.get(s.lore).title : '??';
    console.log('  ' + r.id.padEnd(13) + String(i + 1).padStart(2) + '/' + r.stops.length +
      '  view ' + String(s.view).padStart(2) + ' 「' + vn + '」' +
      '  lore ' + String(s.lore).padEnd(12) + ' 「' + ln + '」' +
      '  ' + s.stay + 's');
  }
}

console.log('\n' + (fails === 0 ? 'ALL PASS' : fails + ' FAILED'));
process.exit(fails === 0 ? 0 : 1);
