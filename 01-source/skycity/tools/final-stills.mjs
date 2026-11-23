// Render the final stills for the sky-city scene (8 viewpoints + 2 fish close-ups).
// usage: node tools/final-stills.mjs
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const OUT = 'F:/AI/dsh/code-animation/04-output/skycity';
const BASE = 'http://127.0.0.1:8099/CELESTIA.html';
const NAMES = ['01-hero', '02-street', '03-overlook', '04-bridge', '05-koi', '06-underside', '07-cloudsea', '08-tower'];

let port = 9600;
function shot(url, out, w = 1600, h = 900) {
  const r = spawnSync(process.execPath, ['tools/shot.mjs', '--url=' + url, '--w=' + w, '--h=' + h, '--gpu=default',
    '--port=' + (port++), '--do=wait:6500', '--do=shot:' + out], { stdio: 'inherit', cwd: process.cwd() });
  if (r.status !== 0) console.error('failed ' + out);
  return r.status === 0;
}

for (let v = 0; v < 8; v++) {
  // view 7 (高塔) is framed by an explicit camera: the preset angle puts one of
  // the town's unlit banner quads right across the tower
  if (v === 7) {
    shot(BASE + '?noui=1&cam=152,84,-126&look=0,20,0&fov=44', path.join(OUT, NAMES[7] + '.png'));
    continue;
  }
  shot(BASE + '?view=' + v + '&noui=1', path.join(OUT, NAMES[v] + '.png'));
}
// the lantern fish itself, frozen at a fixed moment so the framing is repeatable
const FISH = '76.5,27,29.5';
shot(BASE + '?freeze=6&noui=1&cam=112,32,43&look=' + FISH + '&fov=45', path.join(OUT, '09-fish-hero.png'));
shot(BASE + '?freeze=6&noui=1&cam=101,31,43&look=84,27,32&fov=34', path.join(OUT, '10-fish-detail.png'));
