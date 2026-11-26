// Bundle src/ into a single self-contained HTML file (ASTRA · 星鲸环).
// usage: node build.mjs [--dev] [--as=name]
//   --as=name  writes 04-output/ASTRA.<name>.html so parallel agents do not
//              overwrite each other's build (the lead integrates into ASTRA.html).
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { execFileSync } from 'node:child_process';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const dev = process.argv.includes('--dev');
const asArg = process.argv.find((a) => a.startsWith('--as='));
const suffix = asArg ? '.' + asArg.slice(5).replace(/[^a-zA-Z0-9_-]/g, '') : '';
const outDir = path.resolve(here, '../../04-output');
fs.mkdirSync(outDir, { recursive: true });

const res = await esbuild.build({
  entryPoints: [path.join(here, 'src/main.js')],
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  minify: !dev,
  write: false,
  legalComments: 'none',
  logLevel: 'warning',
  loader: { '.glsl': 'text' },
});
const js = res.outputFiles[0].text;
const tpl = fs.readFileSync(path.join(here, 'template.html'), 'utf8');
const hash = (() => { try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: here, encoding: 'utf8' }).trim(); } catch { return 'nogit'; } })();
const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' · ' + hash;
const html = tpl.replace('/*__SCRIPT__*/', () => js).replaceAll('__BUILD_STAMP__', stamp);

const name = 'ASTRA' + suffix + (dev ? '.dev' : '') + '.html';
const out = path.join(outDir, name);
fs.writeFileSync(out, html);
const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
console.log('built ' + out + '  (' + kb + ' KB' + (dev ? ', dev' : '') + ')');
