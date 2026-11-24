// Headless-Chrome screenshot / interaction harness over the Chrome DevTools
// Protocol. No dependencies (Node 22 global WebSocket + fetch).
//
// usage:
//   node tools/shot.mjs --url=http://127.0.0.1:8099/CELESTIA.html \
//        --w=1600 --h=900 --out=shot.png \
//        --do=wait:9000 --do=shot:first.png --do=eval:__sky.setView(3) --do=wait:1500 --do=shot:view3.png
//
// steps: wait:<ms> | eval:<js> | shot:<path> | key:<Key> | keydown:<Key> | keyup:<Key>
//        move:<dx>,<dy> | click | log:<js>
//        tdown:<x>,<y> | tmove:<x>,<y> | tup:<x>,<y> | tap:<x>,<y>   (touch, needs --touch)
//        t2down:<x1>,<y1>,<x2>,<y2> | t2move:<...> | t2up   (two-finger: joystick + look at once)
// flags: --chrome=<path> --keep (do not close the browser) --port=9333 --gpu=swiftshader|default
//        --mobile (mobile viewport + screen orientation) --touch (touch emulation) --dpr=2
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = { w: 1600, h: 900, port: 9333, gpu: 'swiftshader' };
const steps = [];
for (const a of args) {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/s);
  if (!m) continue;
  if (m[1] === 'do') steps.push(m[2] || '');
  else opt[m[1]] = m[2] === undefined ? true : m[2];
}

const CHROME =
  opt.chrome ||
  [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ].find((p) => fs.existsSync(p));

if (!CHROME) {
  console.error('no chrome found');
  process.exit(2);
}

const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skycity-chrome-'));
const flags = [
  ...(opt.headed ? [] : ['--headless=new']),
  `--remote-debugging-port=${opt.port}`,
  `--user-data-dir=${userDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--hide-scrollbars',
  '--mute-audio',
  '--autoplay-policy=no-user-gesture-required',
  `--window-size=${opt.w},${opt.h}`,
  '--enable-unsafe-swiftshader',
  '--force-device-scale-factor=1',
];
if (opt.gpu === 'swiftshader') flags.push('--use-gl=angle', '--use-angle=swiftshader');
if (opt.flags) flags.push(...String(opt.flags).split(' ').filter(Boolean));

const chrome = opt.attach ? null : spawn(CHROME, flags, { stdio: ['ignore', 'ignore', 'ignore'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJSON(p, tries = 100) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${opt.port}${p}`);
      if (r.ok) return await r.json();
    } catch {}
    await sleep(150);
  }
  throw new Error('CDP did not come up');
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => resolve(ws);
    ws.onerror = (e) => reject(new Error('ws error ' + (e.message || '')));
  });
}

let nextId = 1;
function send(ws, method, params = {}, sessionId) {
  const id = nextId++;
  const msg = { id, method, params };
  if (sessionId) msg.sessionId = sessionId;
  ws.send(JSON.stringify(msg));
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout ' + method)), 120000);
    const onMsg = (ev) => {
      let data;
      try {
        data = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (data.id !== id) return;
      clearTimeout(t);
      ws.removeEventListener('message', onMsg);
      if (data.error) reject(new Error(method + ': ' + JSON.stringify(data.error)));
      else resolve(data.result);
    };
    ws.addEventListener('message', onMsg);
  });
}

const outDir = (p) => (path.isAbsolute(p) ? p : path.resolve(process.cwd(), p));

async function main() {
  const version = await getJSON('/json/version');
  let tab;
  if (opt.url) {
    tab = await getJSON('/json/new?' + encodeURIComponent(opt.url), 'PUT').catch(async () => {
      const r = await fetch(`http://127.0.0.1:${opt.port}/json/new?${encodeURIComponent(opt.url)}`, { method: 'PUT' });
      return r.json();
    });
  } else {
    const list = await getJSON('/json/list');
    tab = list.find((t) => t.type === 'page' && (t.url || '').includes(opt.match || 'CELESTIA')) || list.find((t) => t.type === 'page');
  }
  const ws = await connect(version.webSocketDebuggerUrl);
  const targetId = tab.targetId || tab.id;
  const { sessionId } = await send(ws, 'Target.attachToTarget', { targetId, flatten: true });

  await send(ws, 'Page.enable', {}, sessionId);
  await send(ws, 'Runtime.enable', {}, sessionId);
  await send(ws, 'Log.enable', {}, sessionId).catch(() => {});
  await send(
    ws,
    'Emulation.setDeviceMetricsOverride',
    {
      width: Number(opt.w), height: Number(opt.h),
      deviceScaleFactor: opt.dpr ? Number(opt.dpr) : (opt.mobile ? 2 : 1),
      mobile: !!opt.mobile,
      ...(opt.mobile ? { screenOrientation: { type: 'landscapePrimary', angle: 90 } } : {}),
    },
    sessionId
  );
  if (opt.touch) {
    await send(ws, 'Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, sessionId);
  }
  if (opt.url) await send(ws, 'Page.navigate', { url: opt.url }, sessionId);

  const logs = [];
  ws.addEventListener('message', (ev) => {
    let d;
    try {
      d = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (d.method === 'Runtime.consoleAPICalled') {
      logs.push('[console.' + d.params.type + '] ' + d.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    } else if (d.method === 'Runtime.exceptionThrown') {
      logs.push('[exception] ' + (d.params.exceptionDetails?.exception?.description || d.params.exceptionDetails?.text));
    } else if (d.method === 'Log.entryAdded') {
      logs.push('[log.' + d.params.entry.level + '] ' + d.params.entry.text);
    }
  });

  for (const step of steps) {
    const i = step.indexOf(':');
    const kind = i < 0 ? step : step.slice(0, i);
    const rest = i < 0 ? '' : step.slice(i + 1);
    if (kind === 'wait') await sleep(Number(rest));
    else if (kind === 'eval') {
      const r = await send(ws, 'Runtime.evaluate', { expression: rest, awaitPromise: true, returnByValue: true }, sessionId);
      if (r.exceptionDetails) logs.push('[eval error] ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      else if (r.result && r.result.value !== undefined) console.log('eval →', JSON.stringify(r.result.value));
    } else if (kind === 'log') {
      const r = await send(ws, 'Runtime.evaluate', { expression: rest, awaitPromise: true, returnByValue: true }, sessionId);
      console.log('log →', JSON.stringify(r.result?.value));
    } else if (kind === 'shot') {
      const { data } = await send(ws, 'Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sessionId);
      const p = outDir(rest || 'shot.png');
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, Buffer.from(data, 'base64'));
      console.log('shot →', p);
    } else if (kind === 'key' || kind === 'keydown' || kind === 'keyup') {
      const type = kind === 'key' ? 'keyDown' : kind === 'keydown' ? 'keyDown' : 'keyUp';
      const code = rest || 'Space';
      await send(
        ws,
        'Input.dispatchKeyEvent',
        {
          type,
          key: code.replace(/^Key/, '').replace(/^Digit/, ''),
          code,
          windowsVirtualKeyCode: code === 'Space' ? 32 : code.startsWith('Key') ? code.charCodeAt(3) : 0,
        },
        sessionId
      );
      if (kind === 'key') await send(ws, 'Input.dispatchKeyEvent', { type: 'keyUp', key: code, code }, sessionId);
    } else if (kind === 'move') {
      const [dx, dy] = rest.split(',').map(Number);
      await send(ws, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: dx, y: dy, button: 'none' }, sessionId);
    } else if (kind === 'click') {
      const [x, y] = (rest || `${opt.w / 2},${opt.h / 2}`).split(',').map(Number);
      await send(ws, 'Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }, sessionId);
      await send(ws, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }, sessionId);
    } else if (kind === 't2down' || kind === 't2move' || kind === 't2up') {
      const n = rest ? rest.split(',').map(Number) : [];
      const pts = n.length >= 4
        ? [{ x: n[0], y: n[1], id: 1, radiusX: 2, radiusY: 2, force: 1 }, { x: n[2], y: n[3], id: 2, radiusX: 2, radiusY: 2, force: 1 }]
        : [];
      await send(ws, 'Input.dispatchTouchEvent', {
        type: kind === 't2down' ? 'touchStart' : kind === 't2move' ? 'touchMove' : 'touchEnd',
        touchPoints: kind === 't2up' ? [] : pts,
      }, sessionId);
    } else if (kind === 'tdown' || kind === 'tmove' || kind === 'tup' || kind === 'tap') {
      const [x, y] = (rest || `${opt.w / 2},${opt.h / 2}`).split(',').map(Number);
      const point = { x, y, id: 1, radiusX: 2, radiusY: 2, force: 1 };
      if (kind === 'tdown' || kind === 'tap') {
        await send(ws, 'Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] }, sessionId);
      }
      if (kind === 'tmove') {
        await send(ws, 'Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point] }, sessionId);
      }
      if (kind === 'tup' || kind === 'tap') {
        await send(ws, 'Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }, sessionId);
      }
    }
  }

  if (logs.length) {
    console.log('--- page log ---');
    for (const l of logs.slice(-60)) console.log(l);
  }
  if (!opt.keep) {
    ws.close();
    if (chrome) chrome.kill();
  }
}

main().catch((e) => {
  console.error('FAIL', e.message);
  if (chrome) chrome.kill();
  process.exit(1);
});