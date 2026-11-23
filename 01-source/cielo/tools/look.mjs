// look.mjs — quick deterministic look-dev stills at arbitrary camera positions.
// usage: node tools/look.mjs <outDir> <name>=<x,y,z>|<lx,ly,lz>|<fov> [...more]
//        node tools/look.mjs out d1=3,31.8,90|3,38,124|60
// env: CIELO_FILE (default CIELO.html), LOOK_Q extra query, SHOT_PORT base port.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const outDir = path.resolve(root, process.argv[2] || '04-output/_tmp');
fs.mkdirSync(outDir, { recursive: true });
const specs = process.argv.slice(3);
const basePort = Number(process.env.SHOT_PORT || 9720);
const file = process.env.CIELO_FILE || 'CIELO.html';
const extra = process.env.LOOK_Q !== undefined ? process.env.LOOK_Q : 'freeze=3';
const HIDE = 'document.getElementById("hud").style.display="none";document.getElementById("loading").style.display="none"';
specs.forEach((spec, i) => {
  const eq = spec.indexOf('=');
  const name = spec.slice(0, eq);
  const parts = spec.slice(eq + 1).split('|');
  const out = path.join(outDir, name + '.png');
  const qs = 'noui=1&autostart=1&cam=' + parts[0] + '&look=' + parts[1] + '&fov=' + (parts[2] || 55) + (extra ? '&' + extra : '');
  const u = 'http://127.0.0.1:8099/' + file + '?' + qs;
  console.log('shooting', name, u);
  const r = spawnSync(process.execPath, [path.join(here, 'shot.mjs'), '--gpu=default',
    '--url=' + u, '--w=1600', '--h=900', '--port=' + (basePort + i),
    '--do=wait:7000', '--do=eval:' + HIDE, '--do=wait:250', '--do=shot:' + out],
    { stdio: ['ignore', 'pipe', 'pipe'], cwd: root, encoding: 'utf8' });
  if (r.status !== 0) { console.error('failed', name); console.error((r.stdout || '').slice(-1500)); console.error((r.stderr || '').slice(-1500)); }
  else console.log('  ok →', out);
});
