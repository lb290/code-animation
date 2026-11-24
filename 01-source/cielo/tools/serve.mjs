// Minimal static file server for the sky-city scene (no deps).
// usage: node tools/serve.mjs [--root=../../04-output] [--port=8099]
import http from 'node:http';
import os from 'node:os';
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
// round 11: --host=0.0.0.0 让同一局域网里的安卓手机能打开（真机联调用）；
// 默认仍然只监听回环，不把工程暴露到网络上。
const host = args.host || '127.0.0.1';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
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

server.listen(port, host, () => {
  console.log(`serving ${root} on http://${host}:${port}/`);
  console.log(`  CIELO: http://${host}:${port}/CIELO.html`);
  if (host === '0.0.0.0') {
    const nets = os.networkInterfaces();
    const addrs = [];
    for (const name of Object.keys(nets)) {
      for (const n of nets[name] || []) {
        if (n.family === 'IPv4' && !n.internal) addrs.push(n.address);
      }
    }
    for (const a of addrs) {
      console.log('');
      console.log('  安卓平板 / 手机（同一 WiFi）打开：');
      console.log(`    http://${a}:${port}/CIELO.html`);
    }
    console.log('');
    console.log('  提示：局域网是 http，浏览器不允许「添加到主屏幕 / 离线缓存」；');
    console.log('  要装到平板主屏幕离线玩，用 https 的 GitHub Pages 地址（README「平板怎么用」）。');
  }
});
