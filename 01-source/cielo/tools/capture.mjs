// capture.mjs — deterministic frame capture from the CIELO page over CDP.
// usage:
//   node tools/capture.mjs --url="http://127.0.0.1:8099/CIELO.html?noui=1&autostart=1" \
//     --w=1600 --h=900 --fps=24 --seconds=12 --mode=tour --start=0 \
//     --out=../../04-output/cielo/_video/tour --port=9450 --gpu=default
//   --mode=view --view=8 (static camera, animated world)
//   --mode=orbit --cx=.. --cy=.. --cz=.. --look=x,y,z --radius=.. --fov=..
// For every frame it sets __cielo.forceTime (deterministic world animation) and the
// camera for that frame, waits two rAFs, and grabs a JPEG screenshot.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = { w: 1280, h: 720, port: 9450, gpu: 'default', fps: 24, seconds: 12, mode: 'tour', view: 0, start: 0, quality: 92 };
for (const a of args) {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/s);
  if (m) opt[m[1]] = m[2] === undefined ? true : m[2];
}
const CHROME = opt.chrome || ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find((p) => fs.existsSync(p));

// optional camera path JSON: [{t, pos:[x,y,z], look:[x,y,z], fov}] (t in seconds, ascending)
let PATH = null;
if (opt.path) {
  PATH = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), String(opt.path)), 'utf8'));
  if (!Array.isArray(PATH) || PATH.length < 2) throw new Error('bad --path json');
}
const lerp = (a, b, k) => a + (b - a) * k;
const catmull1 = (p0, p1, p2, p3, k) => {
  const k2 = k * k, k3 = k2 * k;
  return 0.5 * ((2 * p1) + (-p0 + p2) * k + (2 * p0 - 5 * p1 + 4 * p2 - p3) * k2 + (-p0 + 3 * p1 - 3 * p2 + p3) * k3);
};
const catmull3 = (a, b, c, d, k) => [catmull1(a[0],b[0],c[0],d[0],k), catmull1(a[1],b[1],c[1],d[1],k), catmull1(a[2],b[2],c[2],d[2],k)];
function camAt(t) {
  let i = 0;
  while (i < PATH.length - 1 && t > PATH[i + 1].t) i++;
  const k0 = PATH[Math.max(0, i - 1)], k1 = PATH[i], k2 = PATH[Math.min(PATH.length - 1, i + 1)], k3 = PATH[Math.min(PATH.length - 1, i + 2)];
  const span = Math.max(1e-5, k2.t - k1.t);
  let u = Math.min(1, Math.max(0, (t - k1.t) / span));
  u = u * u * (3 - 2 * u);      // ease in/out per segment: no overshoot into walls
  const pos = [lerp(k1.pos[0], k2.pos[0], u), lerp(k1.pos[1], k2.pos[1], u), lerp(k1.pos[2], k2.pos[2], u)];
  const look = [lerp(k1.look[0], k2.look[0], u), lerp(k1.look[1], k2.look[1], u), lerp(k1.look[2], k2.look[2], u)];
  const fov = lerp(k1.fov ?? 50, k2.fov ?? 50, u);
  return { pos, look, fov };
}
if (!CHROME) { console.error('no chrome'); process.exit(2); }
const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cielo-cap-'));
const flags = [
  ...(opt.headed ? [] : ['--headless=new']),
  `--remote-debugging-port=${opt.port}`, `--user-data-dir=${userDir}`, '--no-first-run',
  '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', `--window-size=${opt.w},${opt.h}`,
  '--enable-unsafe-swiftshader', '--force-device-scale-factor=1',
  '--disable-gpu-vsync', '--disable-frame-rate-limit',
];
if (opt.gpu === 'swiftshader') flags.push('--use-gl=angle', '--use-angle=swiftshader');
const chrome = spawn(CHROME, flags, { stdio: ['ignore', 'ignore', 'ignore'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJSON(p, tries = 120) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`http://127.0.0.1:${opt.port}${p}`); if (r.ok) return await r.json(); } catch {}
    await sleep(150);
  }
  throw new Error('CDP did not come up');
}
const connect = (wsUrl) => new Promise((res, rej) => { const ws = new WebSocket(wsUrl); ws.onopen = () => res(ws); ws.onerror = () => rej(new Error('ws error')); });
let nextId = 1;
function send(ws, method, params = {}, sessionId) {
  const id = nextId++;
  const msg = { id, method, params };
  if (sessionId) msg.sessionId = sessionId;
  ws.send(JSON.stringify(msg));
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout ' + method)), 180000);
    const onMsg = (ev) => {
      let d; try { d = JSON.parse(ev.data); } catch { return; }
      if (d.id !== id) return;
      clearTimeout(t); ws.removeEventListener('message', onMsg);
      if (d.error) reject(new Error(method + ': ' + JSON.stringify(d.error))); else resolve(d.result);
    };
    ws.addEventListener('message', onMsg);
  });
}

async function evalJS(ws, sessionId, expression) {
  const r = await send(ws, 'Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result?.value;
}

async function main() {
  const version = await getJSON('/json/version');
  const r = await fetch(`http://127.0.0.1:${opt.port}/json/new?` + encodeURIComponent(opt.url), { method: 'PUT' });
  const tab = await r.json();
  const ws = await connect(version.webSocketDebuggerUrl);
  const { sessionId } = await send(ws, 'Target.attachToTarget', { targetId: tab.id, flatten: true });
  await send(ws, 'Page.enable', {}, sessionId);
  await send(ws, 'Runtime.enable', {}, sessionId);
  await send(ws, 'Emulation.setDeviceMetricsOverride', { width: Number(opt.w), height: Number(opt.h), deviceScaleFactor: 1, mobile: false }, sessionId);

  // wait for the scene
  for (let i = 0; i < 200; i++) {
    const ok = await evalJS(ws, sessionId, '!!(window.__cielo && window.__cielo.ready)').catch(() => false);
    if (ok) break;
    await sleep(250);
  }
  await evalJS(ws, sessionId, "document.getElementById('hud').style.display='none'; document.getElementById('loading')?.classList.add('hidden'); 1");
  await sleep(600);

  const outDir = path.isAbsolute(opt.out) ? opt.out : path.resolve(process.cwd(), opt.out);
  fs.mkdirSync(outDir, { recursive: true });
  const fps = Number(opt.fps), secs = Number(opt.seconds), start = Number(opt.start);
  const total = Math.round(fps * secs);
  const mode = opt.mode;
  let camExpr;
  if (mode === 'view') camExpr = `__cielo.cam.setView(${Number(opt.view)}, true)`;
  else if (mode === 'orbit') camExpr = `(()=>{const a=${start}+0.0;return 0})()`; // replaced per frame below
  const t0 = Date.now();
  for (let i = 0; i < total; i++) {
    const t = start + i / fps;
    if (mode === 'tour') {
      const u = i / total;
      camExpr = `__cielo.cam.tour=true; __cielo.cam.transition=null; __cielo.cam.tourT=${u.toFixed(6)}; __cielo.cam.update(0.00001)`;
    } else if (mode === 'orbit') {
      const a = (i / fps) * (Number(opt.orbitSpeed || 0.12));
      camExpr = `__cielo.setCam([${Number(opt.cx)}+Math.cos(${a.toFixed(5)})*${Number(opt.radius)}, ${Number(opt.cy)}, ${Number(opt.cz)}+Math.sin(${a.toFixed(5)})*${Number(opt.radius)}], [${opt.look}], ${Number(opt.fov || 45)})`;
    } else if (mode === 'path') {
      const c = camAt(t);
      camExpr = `__cielo.setCam([${c.pos.map(v=>v.toFixed(3)).join(',')}],[${c.look.map(v=>v.toFixed(3)).join(',')}],${c.fov.toFixed(2)})`;
    }
    await evalJS(ws, sessionId, `__cielo.forceTime=${t.toFixed(4)}; ${camExpr}; 1`);
    await evalJS(ws, sessionId, 'new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(1))))');
    const shot = await send(ws, 'Page.captureScreenshot', { format: 'jpeg', quality: Number(opt.quality), captureBeyondViewport: false }, sessionId);
    fs.writeFileSync(path.join(outDir, process.env.CAP_ABS === '0' ? ('f' + String(i).padStart(4, '0') + '.jpg') : ('f' + String(Math.round(t * fps)).padStart(4, '0') + '.jpg')), Buffer.from(shot.data, 'base64'));
    if (i % 24 === 0) process.stdout.write(`frame ${i}/${total}  ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
  }
  console.log('done ->', outDir, total, 'frames in', ((Date.now() - t0) / 1000).toFixed(1) + 's');
  ws.close(); chrome.kill();
}
main().catch((e) => { console.error('FAIL', e.message); chrome.kill(); process.exit(1); });
