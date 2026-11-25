// run every geometry check in sequence and summarise (lead integration tool)
// usage: node tools/checkall.mjs [--only=a,b]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
const here = path.dirname(url.fileURLToPath(import.meta.url));
const all = ["palace-check","palace-hall-check","palace-salon-check","palace-base-check","palace-rooms-check","palace-chambers-check","glass-hall-check","glass-dome-check","terrace-set-check","whale-check","backcity-check","hero-check","doves-check","fish-check","giraffe-check","balloons-check","night-check","rail-clear-check","cathedral-check","station-check","opera-check","salon-cosmos-check","station-stair-check","glass-orbital-check","train-check","plaza-check","lore-check","tea-check","geo-acc-check","routes-check","cloudwell-check"];
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const only = onlyArg ? onlyArg.slice(7).split(',').filter(Boolean) : null;
const names = all.filter((n) => (!only || only.includes(n)) && fs.existsSync(path.join(here, n + '.mjs')));
let bad = 0;
const rows = [];
for (const n of names) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(here, n + '.mjs')], { encoding: 'utf8', cwd: path.join(here, '..') });
  const out = ((r.stdout || '') + (r.stderr || '')).trim();
  const lines = out.split(/\r?\n/).filter(Boolean);
  const pass = r.status === 0 && !/\bFAIL(ED)?\b/.test(out);
  if (!pass) bad++;
  rows.push({ n, pass, ms: Date.now() - t0, tail: lines.slice(-2).join(' | ').slice(0, 200) });
  console.log((pass ? 'PASS ' : 'FAIL ') + n.padEnd(26) + (Date.now() - t0) + 'ms  ' + lines.slice(-1)[0]?.slice(0, 160));
}
console.log('\n' + (names.length - bad) + '/' + names.length + ' checks PASS' + (bad ? ('  (' + bad + ' FAIL)') : ''));
process.exit(bad ? 1 : 0);