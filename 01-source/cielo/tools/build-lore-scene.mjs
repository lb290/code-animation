// build-lore-scene.mjs — 把内容组写的「景」文案 JSON 合成 src/lore-scene.js。
//
// 单一事实源：03-notes/lore-scene/group-*.json（人写的，带出处）。
// 产物：01-source/cielo/src/lore-scene.js（只读生成物，不要手改）。
//
// usage:
//   node tools/build-lore-scene.mjs                # 31 条必须齐全，否则退出码 1
//   node tools/build-lore-scene.mjs --allow-missing # 允许缺条目（写下一半时用）
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { LORE } from '../src/lore.js';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dir = path.join(root, '../../03-notes/lore-scene');
const out = path.join(root, 'src/lore-scene.js');
const allowMissing = process.argv.includes('--allow-missing');

const order = LORE.map((e) => e.id);
const byId = new Map();
const problems = [];

for (const f of fs.readdirSync(dir).filter((n) => /^group-.*\.json$/.test(n)).sort()) {
  const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  for (const it of data.entries || []) {
    if (!order.includes(it.id)) { problems.push(f + ': unknown lore id "' + it.id + '"'); continue; }
    if (byId.has(it.id)) { problems.push(f + ': duplicate entry "' + it.id + '"'); continue; }
    const scene = it.scene;
    if (!Array.isArray(scene) || scene.length < 2 || scene.length > 4) {
      problems.push(f + ':' + it.id + ': scene must have 2-4 paragraphs, got ' + (Array.isArray(scene) ? scene.length : 'none'));
      continue;
    }
    for (const p of scene) {
      if (typeof p !== 'string' || p.trim().length < 40 || p.trim().length > 220) {
        problems.push(f + ':' + it.id + ': paragraph length ' + (typeof p === 'string' ? p.length : '?') + ' outside 40..220');
      }
    }
    const total = scene.join('').length;
    if (total < 150) problems.push(f + ':' + it.id + ': total scene text only ' + total + ' chars (need >=150)');
    byId.set(it.id, scene.map((p) => p.trim()));
  }
}

const missing = order.filter((id) => !byId.has(id));
if (problems.length) {
  for (const p of problems) console.error('FAIL  ' + p);
  process.exit(1);
}
if (missing.length && !allowMissing) {
  console.error('FAIL  missing scene text for: ' + missing.join(', '));
  process.exit(1);
}

const lines = [];
lines.push('// lore-scene.js — 第十一轮：《城市导览抄本》每一页的「景 · 建筑与场景」详细说明。');
lines.push('//');
lines.push('// ⚠ 自动生成，不要手改：单一事实源是 03-notes/lore-scene/group-*.json（人写、带源码出处）。');
lines.push('// 重新生成：node tools/build-lore-scene.mjs');
lines.push('//');
lines.push('// 为什么单独放一个文件：lore.js 存"故事"，这里存"导览册的建筑条目"——');
lines.push('// 结构 / 尺寸 / 材质 / 颜色 / 数量 / 方位，先讲清楚这座建筑是什么，再讲故事。');
lines.push('export const SCENE = {');
for (const id of order) {
  const scene = byId.get(id);
  if (!scene) continue;
  lines.push('  ' + id + ': [');
  for (const p of scene) lines.push('    ' + JSON.stringify(p) + ',');
  lines.push('  ],');
}
lines.push('};');
lines.push('');
fs.writeFileSync(out, lines.join('\n'));
const kb = (Buffer.byteLength(lines.join('\n')) / 1024).toFixed(1);
console.log('[lore-scene] ' + byId.size + '/' + order.length + ' entries → ' + path.relative(root, out) + '  (' + kb + ' KB)' +
  (missing.length ? '  missing: ' + missing.join(',') : ''));
