// tools/status.mjs — 刷新 STATUS.md 里的「事实块」，并打印项目现状摘要。
// 为什么：交接文档最容易过期。凡是能从仓库里读出来的事实（HEAD、工作树、成品大小、
// 体检项数、观景点数、抄本页数、最近日记），都由这个脚本生成，不靠人记。
//
// usage:
//   node tools/status.mjs            # 只打印
//   node tools/status.mjs --write    # 同时改写 STATUS.md 的 <!-- AUTO:START --> ... <!-- AUTO:END -->
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { execFileSync } from 'node:child_process';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const write = process.argv.includes('--write');

const git = (args) => {
  try { return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim(); } catch { return ''; }
};
const sizeKB = (rel) => {
  const p = path.join(root, rel);
  try { return (fs.statSync(p).size / 1024).toFixed(1) + ' KB'; } catch { return '—'; }
};
const readText = (rel) => { try { return fs.readFileSync(path.join(root, rel), 'utf8'); } catch { return ''; } };

// ---- git ----------------------------------------------------------------
const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']) || '?';
const head = git(['rev-parse', '--short', 'HEAD']) || '?';
const subject = git(['log', '-1', '--format=%s']) || '?';
const porcelain = git(['status', '--porcelain']).split(/\r?\n/).filter(Boolean);
const dirty = porcelain.filter((l) => !l.startsWith('!!'));

// ---- 成品 ---------------------------------------------------------------
const outputs = [
  ['天空鲸城', '04-output/CIELO.html'],
  ['天空之城 · 灯祭', '04-output/CELESTIA.html'],
  // Round 15：第二个可游览世界（从露台画架进入）
  ['星鲸环（画中世界）', '04-output/ASTRA.html'],
].map(([name, rel]) => ({ name, rel, size: sizeKB(rel) }));

// ---- 体检项数（checkall.mjs 是单一来源）----------------------------------
const countChecks = (rel) => {
  const src = readText(rel);
  const m = src.match(/const all = \[([\s\S]*?)\];/);
  const q = m ? (m[1].match(/["'][a-z0-9-]+["']/g) || []) : [];
  return q.map((s) => s.slice(1, -1));
};
const checks = countChecks('01-source/cielo/tools/checkall.mjs');
const astraChecks = countChecks('01-source/astra/tools/checkall.mjs');

// ---- 内容规模（源码常量）------------------------------------------------
const layout = readText('01-source/cielo/src/layout.js');
const viewsBlock = layout.match(/views:\s*\[([\s\S]*?)\n\s{2}\],/);
const views = viewsBlock ? (viewsBlock[1].match(/\{ name:/g) || []).length : 0;
const lore = readText('01-source/cielo/src/lore.js');
const loreEntries = (lore.match(/^\s{4}id:\s*'/gm) || []).length;
// ASTRA 的观景点：它是第二个世界，单独计数。
// Round 16 起观景点 = layout.js 的 BASE_VIEWS（0..9）+ interiors-plan.js 的 GAL_VIEWS（画廊 2 个）
// + 每间房 2 个机位（ROOMS × 2）。三项都在源码常量里，读出来加起来即可。
const astraLayout = readText('01-source/astra/src/layout.js');
const astraPlan = readText('01-source/astra/src/interiors-plan.js');
const cnt = (src, re) => { const m = src.match(re); return m ? (m[1].match(/\{ name:/g) || []).length : 0; };
let astraViews = cnt(astraLayout, /const BASE_VIEWS = \[([\s\S]*?)\n\];/);
astraViews += cnt(astraPlan, /export const GAL_VIEWS = \[([\s\S]*?)\n\];/);
{
  const rooms = astraPlan.match(/export const ROOMS = \[([\s\S]*?)\n\];/);
  astraViews += 2 * (rooms ? (rooms[1].match(/key: '/g) || []).length : 0);
}

// ---- 最近日记 -----------------------------------------------------------
const dailyDir = path.join(root, '05-daily');
let lastDaily = '—';
try {
  const files = fs.readdirSync(dailyDir).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort();
  if (files.length) lastDaily = `05-daily/${files[files.length - 1]}`;
} catch { /* ignore */ }

// ---- 渲染 ---------------------------------------------------------------
const now = new Date();
const stamp = (n) => String(n).padStart(2, '0');
const when = `${now.getFullYear()}-${stamp(now.getMonth() + 1)}-${stamp(now.getDate())} ${stamp(now.getHours())}:${stamp(now.getMinutes())}`;
const dirtyLine = dirty.length === 0 ? '干净' : dirty.length + ' 个改动（' + dirty.slice(0, 6).map((l) => l.slice(3).trim()).join('、') + (dirty.length > 6 ? ' …' : '') + '）';

const block = [
  '<!-- AUTO:START -->',
  `> 自动生成 · ${when} · 运行 \`node tools/status.mjs --write\` 刷新。下面每一行都是从仓库里读出来的，不靠人记。`,
  '',
  '| 项 | 值 |',
  '|---|---|',
  `| 分支 / HEAD（生成时） | \`${branch}\` @ \`${head}\` · ${subject} |`,
  `| 工作树 | ${dirtyLine} |`,
  outputs.map((o) => `| 成品 · ${o.name} | \`${o.rel}\` · ${o.size} |`).join('\n'),
  `| 几何体检 | CIELO ${checks.length} 项 · ASTRA ${astraChecks.length} 项 |`,
  `| 内容规模 | 观景点 天空鲸城 ${views} · 星鲸环 ${astraViews} ；抄本 ${loreEntries} 页 |`,
  `| 最近日记 | \`${lastDaily}\` |`,
  '<!-- AUTO:END -->',
].join('\n');

const target = path.join(root, 'STATUS.md');
if (write) {
  let md = '';
  try { md = fs.readFileSync(target, 'utf8'); } catch { md = '# STATUS · 天空鲸城 / code-animation\n\n<!-- AUTO:START -->\n<!-- AUTO:END -->\n'; }
  const re = /<!-- AUTO:START -->[\s\S]*?<!-- AUTO:END -->/;
  if (re.test(md)) md = md.replace(re, block);
  else md = md.replace(/(^# .*\n)/, '$1\n' + block + '\n');
  fs.writeFileSync(target, md);
  console.log('[status] wrote ' + path.relative(root, target));
}

console.log('\n===== 项目现状 =====');
console.log(`分支 ${branch} @ ${head} — ${subject}`);
console.log(`工作树: ${dirtyLine}`);
for (const o of outputs) console.log(`成品 ${o.rel}: ${o.size}`);
console.log(`体检: CIELO ${checks.length} 项 / ASTRA ${astraChecks.length} 项 | 观景点: CIELO ${views} / ASTRA ${astraViews} | 抄本: ${loreEntries} 页 | 最近日记: ${lastDaily}`);
if (!write) console.log('\n(只读模式；加 --write 会把上面这块写进 STATUS.md)');
