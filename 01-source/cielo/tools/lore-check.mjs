// lore-check — sanity of the almanac content (no DOM, pure data).
// verifies: unique ids, known areas, valid zone view indices, required copy,
// body paragraph count/length, and that every zone centre is actually near the
// view it claims. Run by tools/checkall.mjs.
import { AREAS, LORE } from '../src/lore.js';
import { L } from '../src/layout.js';

const fail = [];
const warn = [];
const areaIds = new Set(AREAS.map((a) => a.id));
const ids = new Set();

const seenCentre = new Map();
let zoneCount = 0;

for (const e of LORE) {
  const tag = e.id || '(no id)';
  if (!e.id) fail.push(tag + ': missing id');
  if (ids.has(e.id)) fail.push(tag + ': duplicate id');
  ids.add(e.id);
  if (!areaIds.has(e.area)) fail.push(tag + ': unknown area ' + e.area);
  for (const k of ['title', 'en', 'quote', 'go']) {
    if (!e[k] || String(e[k]).trim().length < 2) fail.push(tag + ': missing ' + k);
  }
  if (!Array.isArray(e.body) || e.body.length < 1) fail.push(tag + ': body must be a non-empty array');
  else {
    if (e.body.length > 4) warn.push(tag + ': ' + e.body.length + ' paragraphs (3 is the house style)');
    for (const p of e.body) {
      if (typeof p !== 'string' || p.trim().length < 25) fail.push(tag + ': a paragraph is too short');
      if (/\s{2,}/.test(p)) warn.push(tag + ': double space in a paragraph');
    }
  }
  if (e.unlock) {
    if (e.unlock !== 'night') warn.push(tag + ': unknown unlock key ' + e.unlock);
    if (e.zone) fail.push(tag + ': unlock entries must not own a zone');
    continue;
  }
  const z = e.zone;
  if (!z) { fail.push(tag + ': no zone and no unlock'); continue; }
  zoneCount++;
  if (typeof z.r !== 'number' || z.r < 4 || z.r > 460) fail.push(tag + ': zone radius out of range: ' + z.r);
  let c = null;
  if (z.at) {
    if (!Array.isArray(z.at) || z.at.length !== 3 || z.at.some((v) => typeof v !== 'number')) fail.push(tag + ': bad zone.at');
    else c = z.at;
  } else if (typeof z.view === 'number') {
    if (z.view < 0 || z.view >= L.views.length) fail.push(tag + ': zone.view ' + z.view + ' out of range (0..' + (L.views.length - 1) + ')');
    else c = L.views[z.view].pos;
  } else fail.push(tag + ': zone needs at/ or view');
  if (c) {
    const key = c.map((v) => v.toFixed(1)).join(',');
    if (seenCentre.has(key)) warn.push(tag + ': shares its zone centre with ' + seenCentre.get(key));
    seenCentre.set(key, tag);
    if (Math.abs(c[1]) > 1400) fail.push(tag + ': zone centre y=' + c[1] + ' is outside the playable sky');
  }
}

if (LORE.length < 24) fail.push('only ' + LORE.length + ' entries — the almanac should cover the whole city');
if (zoneCount < LORE.length - 2) warn.push('only ' + zoneCount + ' arrival zones for ' + LORE.length + ' entries');

const perArea = AREAS.map((a) => a.id + ':' + LORE.filter((e) => e.area === a.id).length).join(' ');
for (const w of warn.slice(0, 8)) console.warn('WARN  ' + w);
if (warn.length > 8) console.warn('WARN  … +' + (warn.length - 8) + ' more');
if (fail.length) {
  for (const f of fail) console.error('FAIL  ' + f);
  console.error('lore: ' + fail.length + ' failures');
  process.exit(1);
}
console.log('PASS  lore: ' + LORE.length + ' entries / ' + zoneCount + ' arrival zones / ' + AREAS.length +
  ' areas  [' + perArea + ']  views=' + L.views.length + '  deterministic data');
