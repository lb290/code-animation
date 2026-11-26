// 跑完 ASTRA 的全部体检并汇总：node tools/checkall.mjs [--only=a,b]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
const here = path.dirname(url.fileURLToPath(import.meta.url));
const all = ['station-ring-check', 'station-core-check', 'space-props-check', 'astra-check'];
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const only = onlyArg ? onlyArg.slice(7).split(',').filter(Boolean) : null;
const names = all.filter((n) => (!only || only.includes(n)) && fs.existsSync(path.join(here, n + '.mjs')));
let bad = 0;
for (const n of names) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(here, n + '.mjs')], { encoding: 'utf8', cwd: path.join(here, '..') });
  const out = ((r.stdout || '') + (r.stderr || '')).trim();
  const lines = out.split(/\r?\n/).filter(Boolean);
  // 只看"以 FAIL 开头的行"，而不是全文里出现 FAIL 这个词：很多体检会打印「46 PASS / 0 FAIL」
  // 这类统计行，旧规则会把它误判成失败（props 第一次接入时就踩到了）。
  const badLine = out.split(/\r?\n/).some((l) => /^\s*(FAIL|FAILED)\b/.test(l));
  const pass = r.status === 0 && !badLine;
  if (!pass) bad++;
  console.log((pass ? 'PASS ' : 'FAIL ') + n.padEnd(24) + (Date.now() - t0) + 'ms  ' + (lines.slice(-1)[0] || '').slice(0, 170));
}
console.log('\n' + (names.length - bad) + '/' + names.length + ' checks PASS' + (bad ? '  (' + bad + ' FAIL)' : ''));
process.exit(bad ? 1 : 0);
