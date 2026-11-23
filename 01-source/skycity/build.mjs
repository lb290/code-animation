// Bundle src/ into a single self-contained HTML file.
// usage: node build.mjs [--dev]
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const dev = process.argv.includes('--dev');
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
});
const js = res.outputFiles[0].text;
const tpl = fs.readFileSync(path.join(here, 'template.html'), 'utf8');
const html = tpl.replace('/*__SCRIPT__*/', () => js);

const name = dev ? 'CELESTIA.dev.html' : 'CELESTIA.html';
const out = path.join(outDir, name);
fs.writeFileSync(out, html);
const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
console.log(`built ${out}  (${kb} KB${dev ? ', dev' : ''})`);
