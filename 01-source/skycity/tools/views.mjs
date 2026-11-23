// Shoot every camera viewpoint of the scene in one run.
// usage: node tools/views.mjs <prefix> [viewIndexes...]
import { spawnSync } from 'node:child_process';
const args = process.argv.slice(2);
const prefix = args[0] || 'F:/AI/dsh/code-animation/04-output/skycity/_view';
const list = args.slice(1).length ? args.slice(1) : ['0','1','2','3','4','5','6','7','8'];
const q = process.env.VIEW_Q || '';
const port = 9400;
list.forEach((v, i) => {
  const out = prefix + '-' + v + '.png';
  const url = 'http://127.0.0.1:8099/CELESTIA.dev.html?view=' + v + '&noui=1' + q;
  const r = spawnSync(process.execPath, ['tools/shot.mjs', '--url=' + url, '--w=1600', '--h=900', '--gpu=default',
    '--port=' + (port + i), '--do=wait:6000', '--do=shot:' + out], { stdio: 'inherit', cwd: process.cwd() });
  if (r.status !== 0) console.error('failed view ' + v);
});
