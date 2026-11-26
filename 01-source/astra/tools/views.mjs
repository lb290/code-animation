// 拍下 ASTRA 的全部观景点：node tools/views.mjs <输出前缀> [viewIndexes...]
// 例：node tools/views.mjs ../04-output/_r15/astra
// 说明：shot.mjs 每张图开一个独立 Chrome（端口按顺序错开），不要把 shot 放进管道。
import { spawnSync } from 'node:child_process';
const args = process.argv.slice(2);
const prefix = args[0] || '../../../04-output/_r15/astra';
const list = args.slice(1).length ? args.slice(1) : ['0','1','2','3','4','5','6','7','8','9'];
const q = process.env.VIEW_Q || '';
const port0 = 9410;
list.forEach((v, i) => {
  const out = prefix + '-v' + v + '.png';
  const url = 'http://127.0.0.1:8099/ASTRA.html?view=' + v + '&noui=1&freeze=2' + q;
  const r = spawnSync(process.execPath, ['../cielo/tools/shot.mjs', '--url=' + url, '--w=1600', '--h=900',
    '--gpu=default', '--port=' + (port0 + i), '--do=wait:4200', '--do=shot:' + out], { stdio: 'inherit', cwd: process.cwd() });
  if (r.status !== 0) console.error('failed view ' + v);
});
