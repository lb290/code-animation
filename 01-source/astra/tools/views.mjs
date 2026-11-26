// 拍下 ASTRA 的全部观景点：node tools/views.mjs <输出前缀> [viewIndexes...]
// 例：node tools/views.mjs ../../../04-output/_r16/astra
// 依赖：仓库根已经起了静态服务器（node 01-source/cielo/tools/serve.mjs --port=8099 --root=../../..）
// 说明：shot.mjs 每张图开一个独立 Chrome（端口按顺序错开），不要把 shot 放进管道。
import { spawnSync } from 'node:child_process';
const args = process.argv.slice(2);
const prefix = args[0] || '../../04-output/_r16/astra';
// Round 16：0..9 环站/穹顶，10..11 悬灯画廊，12..19 四间房的入门/回望
const list = args.slice(1).length ? args.slice(1)
  : ['0','1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17','18','19'];
const q = process.env.VIEW_Q || '';
const base = process.env.ASTRA_URL || 'http://127.0.0.1:8099/04-output/ASTRA.html';
const W = process.env.VIEW_W || '1600';
const H = process.env.VIEW_H || '900';
const port0 = Number(process.env.VIEW_PORT0 || 9410);
list.forEach((v, i) => {
  const out = prefix + '-v' + String(v).padStart(2, '0') + '.png';
  const url = base + '?view=' + v + '&noui=1&freeze=2' + q;
  const r = spawnSync(process.execPath, ['../cielo/tools/shot.mjs', '--url=' + url, '--w=' + W, '--h=' + H,
    '--gpu=default', '--port=' + (port0 + i), '--do=wait:4600', '--do=shot:' + out], { stdio: 'inherit', cwd: process.cwd() });
  if (r.status !== 0) console.error('failed view ' + v);
});
