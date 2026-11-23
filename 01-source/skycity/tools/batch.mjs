// Batch screenshots: node tools/batch.mjs jobs.json
// jobs: [{ "url": "...", "out": "path.png", "wait": 2500, "eval": "js", "steps": [...] }]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const file = process.argv[2];
const jobs = JSON.parse(fs.readFileSync(file, 'utf8'));
const node = process.execPath;
let first = true;
for (const j of jobs) {
  const args = ['tools/shot.mjs', '--attach', '--port=9222'];
  if (first) {
    args.push('--url=' + j.url);
    first = false;
  } else {
    args.push("--do=eval:location.href='" + j.url + "'");
  }
  args.push('--do=wait:' + (j.wait || 2500));
  if (j.eval) args.push('--do=eval:' + j.eval);
  args.push('--do=shot:' + j.out);
  if (j.steps) for (const s of j.steps) args.push('--do=' + s);
  console.log('--- ' + path.basename(j.out));
  const r = spawnSync(node, args, { stdio: 'inherit', cwd: process.cwd() });
  if (r.status !== 0) console.error('failed: ' + j.out);
}
