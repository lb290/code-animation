// Studio look-dev sheet: one lantern fish, several orbit angles.
// usage: node tools/studio.mjs <outPrefix> [angles...]   (env: extra query string via STUDIO_Q)
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const args = process.argv.slice(2);
const prefix = args[0] || 'F:/AI/dsh/code-animation/04-output/skycity/_studio';
const angles = args.slice(1).length ? args.slice(1).map(Number) : [0, 28, 55, 90, 130, 180];
const q = process.env.STUDIO_Q || '';
const node = process.execPath;
for (const a of angles) {
  const out = prefix + '-a' + a + '.png';
  const url = 'http://127.0.0.1:8099/CELESTIA.dev.html?studio=1&noui=1&angle=' + a + q;
  const r = spawnSync(node, ['tools/shot.mjs', '--url=' + url, '--w=1100', '--h=680', '--gpu=default',
    '--do=wait:4200', '--do=shot:' + out], { stdio: 'inherit', cwd: process.cwd() });
  if (r.status !== 0) console.error('failed angle ' + a);
}
