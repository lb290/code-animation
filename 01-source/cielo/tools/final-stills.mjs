// Shoot every camera viewpoint of CIELO in one run (optionally per-shot query plan).
// usage: node tools/final-stills.mjs [prefix] [viewIndexes...]
//   CIELO_FILE=CIELO.html  port 8099 server must be running
//   VIEW_Q="freeze=3"      extra query (default freeze=9)
//   VIEW_PLAN=<json>       optional per-shot plan file (overrides the view list):
//     [{ v: 0, q: "freeze=9" },                       // a layout viewpoint
//      { v: 39, q: "freeze=9&tod=night", name: "night-terrace" },
//      { cam: "0,40,150", look: "0,40,0", fov: 60, q: "freeze=9&tod=night&fw=3", name: "fw" }]
//   name / file control the output file name when given.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');           // code-animation
const outDir = path.resolve(root, '04-output/cielo');
fs.mkdirSync(outDir, { recursive: true });

const args = process.argv.slice(2);
const prefix = args[0] || path.join(outDir, 'view');
const file = process.env.CIELO_FILE || 'CIELO.html';
const basePort = Number(process.env.SHOT_PORT || 9620);
const HIDE = 'document.getElementById("hud").style.display="none";document.getElementById("loading").style.display="none"';

let shots = null;
if (process.env.VIEW_PLAN) {
  const p = path.resolve(root, process.env.VIEW_PLAN);
  shots = JSON.parse(fs.readFileSync(p, 'utf8'));
} else {
  const all = ['0','1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17','18','19','20','21','22','23','24','25','26','27','28','29'];
  const list = args.slice(1).length ? args.slice(1) : all;
  const extra = process.env.VIEW_Q !== undefined ? process.env.VIEW_Q : 'freeze=9';
  shots = list.map((v) => ({ v: Number(v), q: extra }));
}

shots.forEach((s, i) => {
  const q = s.q !== undefined ? s.q : 'freeze=9';
  const tag = s.name || (s.cam ? 'cam' : 'v' + s.v);
  const out = s.file ? path.resolve(root, s.file) : prefix + '-' + String(i + 1).padStart(2, '0') + '-' + tag + '.png';
  let qs = 'noui=1&autostart=1';
  if (s.cam) {
    qs += '&cam=' + s.cam + '&look=' + s.look + '&fov=' + (s.fov || 60);
  } else {
    qs += '&view=' + s.v;
  }
  if (q) qs += '&' + q;
  const u = 'http://127.0.0.1:8099/' + file + '?' + qs;
  console.log('shooting', i + 1 + '/' + shots.length, u, '→', out);
  const r = spawnSync(process.execPath, [path.join(here, 'shot.mjs'), '--gpu=default',
    '--url=' + u, '--w=1600', '--h=900', '--port=' + (basePort + (i % 20)),
    '--do=wait:7000', '--do=eval:' + HIDE, '--do=wait:250', '--do=shot:' + out],
    { stdio: 'inherit', cwd: root });
  if (r.status !== 0) console.error('failed shot', i + 1, tag);
});
console.log('done →', outDir);
