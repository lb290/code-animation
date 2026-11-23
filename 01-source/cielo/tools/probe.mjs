// Run one headless page, evaluate an expression, print the value.
// usage: node tools/probe.mjs <url> "<js>" [waitMs] [w] [h]
import { spawnSync } from 'node:child_process';
const [url, expr, wait = '5000', w = '1280', h = '720'] = process.argv.slice(2);
const r = spawnSync(process.execPath, ['tools/shot.mjs', '--url=' + url, '--w=' + w, '--h=' + h, '--gpu=default',
  '--do=wait:' + wait, '--do=eval:' + expr], { stdio: 'inherit', cwd: process.cwd() });
process.exit(r.status || 0);
