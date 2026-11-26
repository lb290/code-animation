// tools/screencast.mjs — 录制一段页面帧序列（CDP Page.startScreencast），用于诊断"一闪一闪"。
// usage: node tools/screencast.mjs --url=http://127.0.0.1:8099/04-output/ASTRA.html?noui=1 --w=1280 --h=720 \
//          --seconds=8 --out=../04-output/_probe/frames [--key=Space@3000] [--gpu=default]
// 产物：<out>/f0001.jpg ... + frames.json（每帧 CDP timestamp）
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const argv = process.argv.slice(2);
const opt = { w: 1280, h: 720, seconds: 8, out: '../04-output/_probe/frames', gpu: 'default', port: 9471 };
const keys = [];
for (const a of argv) {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/s);
  if (!m) continue;
  if (m[1] === 'key') keys.push(m[2]);
  else opt[m[1]] = m[2];
}
const CHROME = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find((p) => fs.existsSync(p));
if (!CHROME) { console.error('no chrome'); process.exit(2); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-cast-'));
const flags = ['--headless=new', '--remote-debugging-port=' + opt.port, '--user-data-dir=' + userDir,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars', '--mute-audio',
  '--force-device-scale-factor=1', '--window-size=' + opt.w + ',' + opt.h, '--enable-unsafe-swiftshader'];
if (opt.gpu === 'swiftshader') flags.push('--use-gl=angle', '--use-angle=swiftshader');
const chrome = spawn(CHROME, flags, { stdio: ['ignore', 'ignore', 'ignore'] });
async function getJSON(p, tries = 100) {
  for (let i = 0; i < tries; i++) { try { const r = await fetch('http://127.0.0.1:' + opt.port + p); if (r.ok) return await r.json(); } catch {} await sleep(150); }
  throw new Error('CDP did not come up');
}
let nextId = 1;
function connect(wsUrl) { return new Promise((res, rej) => { const ws = new WebSocket(wsUrl); ws.onopen = () => res(ws); ws.onerror = (e) => rej(new Error('ws ' + e.message)); }); }
function send(ws, method, params = {}, sessionId) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('timeout ' + method)), 60000);
    const onMsg = (ev) => { let d; try { d = JSON.parse(ev.data); } catch { return; } if (d.id !== id) return; clearTimeout(t); ws.removeEventListener('message', onMsg); d.error ? rej(new Error(method + ' ' + JSON.stringify(d.error))) : res(d.result); };
    ws.addEventListener('message', onMsg);
  });
}
const outDir = path.resolve(process.cwd(), opt.out);
fs.mkdirSync(outDir, { recursive: true });
const version = await getJSON('/json/version');
async function newTab(url) {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch('http://127.0.0.1:' + opt.port + '/json/new?' + encodeURIComponent(url), { method: 'PUT' });
      if (r.ok) return await r.json();
    } catch {}
    await sleep(200);
  }
  throw new Error('cannot open tab');
}
const tab = await newTab(opt.url);
const ws = await connect(version.webSocketDebuggerUrl);
const { sessionId } = await send(ws, 'Target.attachToTarget', { targetId: tab.targetId || tab.id, flatten: true });
await send(ws, 'Page.enable', {}, sessionId);
await send(ws, 'Runtime.enable', {}, sessionId);
await send(ws, 'Emulation.setDeviceMetricsOverride', { width: +opt.w, height: +opt.h, deviceScaleFactor: 1, mobile: false }, sessionId);
const frames = [];
let shotIdx = 0;
ws.addEventListener('message', async (ev) => {
  let d; try { d = JSON.parse(ev.data); } catch { return; }
  if (d.method === 'Page.screencastFrame') {
    const f = d.params;
    shotIdx++;
    const name = 'f' + String(shotIdx).padStart(4, '0') + '.jpg';
    fs.writeFileSync(path.join(outDir, name), Buffer.from(f.data, 'base64'));
    frames.push({ i: shotIdx, t: f.metadata.timestamp, file: name });
    try { await send(ws, 'Page.screencastFrameAck', { sessionId: f.sessionId }, sessionId); } catch {}
  } else if (d.method === 'Runtime.consoleAPICalled') {
    console.log('[console]', d.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
  }
});
await send(ws, 'Page.navigate', { url: opt.url }, sessionId);
await sleep(5500);
await send(ws, 'Page.startScreencast', { format: 'jpeg', quality: 68, maxWidth: +opt.w, maxHeight: +opt.h, everyNthFrame: 1 }, sessionId);
const t0 = Date.now();
for (const k of keys) {
  const [code, at] = k.split('@');
  const wait = Math.max(0, +at - (Date.now() - t0));
  if (wait) await sleep(wait);
  await send(ws, 'Input.dispatchKeyEvent', { type: 'keyDown', key: code === 'Space' ? ' ' : code, code, windowsVirtualKeyCode: code === 'Space' ? 32 : 0 }, sessionId);
  await send(ws, 'Input.dispatchKeyEvent', { type: 'keyUp', key: code === 'Space' ? ' ' : code, code }, sessionId);
  console.log('[key]', code, 'at', Date.now() - t0);
}
await sleep(Math.max(1000, +opt.seconds * 1000 - (Date.now() - t0)));
await send(ws, 'Page.stopScreencast', {}, sessionId).catch(() => {});
fs.writeFileSync(path.join(outDir, 'frames.json'), JSON.stringify(frames, null, 1));
console.log('frames', frames.length, '→', outDir);
ws.close();
chrome.kill();
