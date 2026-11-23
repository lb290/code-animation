// Minimal static file server for the sky-city scene (no deps).
// usage: node tools/serve.mjs [--root=../../04-output] [--port=8099]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
  })
);
const root = path.resolve(here, args.root || '../../../04-output');
const port = Number(args.port || 8099);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.glsl': 'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
  const u = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = path.join(root, u === '/' ? '/index.html' : u);
  if (!file.startsWith(root)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  fs.stat(file, (err, st) => {
    if (!err && st.isDirectory()) file = path.join(file, 'index.html');
    fs.readFile(file, (e, buf) => {
      if (e) {
        res.writeHead(404, { 'content-type': 'text/plain' }).end('404 ' + u);
        return;
      }
      res.writeHead(200, {
        'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'cache-control': 'no-store',
        'access-control-allow-origin': '*',
      }).end(buf);
    });
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`serving ${root} on http://127.0.0.1:${port}/`);
});
