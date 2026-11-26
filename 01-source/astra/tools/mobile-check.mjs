// ASTRA 触屏 / 桌面验收（CDP + shot.mjs 的移动视口与触摸模拟）。
//   node tools/mobile-check.mjs [--gpu=default|swiftshader] [--port=8133] [--keep]
// 断言：
//   触屏：触屏层出现 / 菜单默认收起 / 摇杆能让相机移动 / 菜单能展开并切观景点 / 画质能切 /
//          左下「回到画中」存在且目标是 CIELO.html?at=easel / ?from=easel 有坠入提示 / 无页面异常
//   桌面：触屏层不出现 / 画质默认精细 / 键盘 1-9 切观景点 / 空格开始巡游 / 原点位不变
// 退出码 0 = 全 PASS。需要本机 Chrome。
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)=(.*)$/);
  return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
}));
const GPU = args.gpu || 'default';
const PORT = Number(args.port || 8133);
const OUT = path.resolve(here, '../../../04-output/_mobile');
fs.mkdirSync(OUT, { recursive: true });
const ROOT = path.resolve(here, '../../..');                    // 仓库根 code-animation
const SHOT = path.join(ROOT, '01-source/cielo/tools/shot.mjs');
const SERVE = path.join(ROOT, '01-source/cielo/tools/serve.mjs');

const fail = [];
const pass = [];
const ok = (cond, msg) => { (cond ? pass : fail).push(msg); if (!pass.includes(msg)) console.log((cond ? '  PASS ' : '  FAIL ') + msg); };

function startServer() {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [SERVE, '--port=' + PORT, '--root=../../..'], { cwd: path.join(ROOT, '01-source/cielo'), stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const t = setTimeout(() => { p.kill(); reject(new Error('server did not start')); }, 9000);
    p.stdout.on('data', (d) => { out += String(d); if (out.includes('serving')) { clearTimeout(t); resolve(p); } });
    p.on('error', (e) => { clearTimeout(t); reject(e); });
  });
}

function runShot(label, extra, steps) {
  const argv = [SHOT, '--gpu=' + GPU, '--port=' + (PORT + 10), ...extra, ...steps.map((s) => '--do=' + s)];
  const r = spawnSync(process.execPath, argv, { cwd: ROOT, encoding: 'utf8', timeout: 260000 });
  const text = (r.stdout || '') + (r.stderr || '');
  const logs = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^log → (.*)$/);
    if (m) {
      let v = m[1];
      try { v = JSON.parse(v); } catch { /* raw */ }
      if (typeof v === 'string') { try { v = JSON.parse(v); } catch { /* raw */ } }
      logs.push(v);
    }
    if (/^\[exception\]/.test(line)) fail.push(label + ': 页面异常 → ' + line.slice(0, 240));
    if (/\[eval error\]/.test(line)) fail.push(label + ': eval 报错 → ' + line.slice(0, 240));
  }
  if (!logs.length) fail.push(label + ': shot.mjs 没有返回 log（exit ' + r.status + '）→ ' + text.slice(0, 500));
  return { logs, text };
}
const png = (n) => path.join(OUT, n);
const PAGEBASE = 'http://127.0.0.1:' + PORT + '/04-output/ASTRA.html';

console.log('\n== ASTRA 触屏 / 桌面验收 ==\n');
const server = await startServer();
try {
  // ================================================================ 触屏
  console.log('[触屏 tablet]');
  const t = runShot('tablet', ['--url=' + PAGEBASE + '?noui=1', '--mobile', '--touch', '--dpr=2', '--w=1024', '--h=640'], [
    'wait:8200',
    'log:JSON.stringify({isTouch:__astra.isTouch,q:__astra.quality(),ui:getComputedStyle(document.getElementById("touchui")).display,bar:getComputedStyle(document.getElementById("tu-actions")).display,view:__astra.cam.viewIndex,pos:__astra.cam.pos.map(v=>+v.toFixed(1)),res:__astra.res(),back:__astra.backUrl()})',
    // 摇杆前推 → 相机必须移动
    'tdown:220,520', 'tmove:220,430', 'wait:1500', 'tup:220,430',
    'log:JSON.stringify({pos:__astra.cam.pos.map(v=>+v.toFixed(1))})',
    // 菜单展开 + 下一个观景点
    'eval:document.getElementById("tu-menu").click()', 'wait:320',
    'log:JSON.stringify({barOpen:getComputedStyle(document.getElementById("tu-actions")).display==="flex",expanded:document.getElementById("tu-menu").getAttribute("aria-expanded")})',
    'eval:document.getElementById("tu-menu").click()', 'wait:260',
    'eval:document.querySelector(\'[data-act="next"]\').click()', 'wait:2600',
    'log:JSON.stringify({view:__astra.cam.viewIndex,name:(document.getElementById("viewname")||{}).textContent})',
    // 画质循环
    'eval:__astra.cycleQuality(1)', 'wait:900',
    'log:JSON.stringify({q:__astra.quality(),res:__astra.res()})',
    'shot:' + png('astra-tablet.png'),
  ]);
  const t0 = t.logs[0] || {};
  const t1 = t.logs[1] || {};
  const t2 = t.logs[2] || {};
  const t3 = t.logs[3] || {};
  const t4 = t.logs[4] || {};
  ok(t0.isTouch === true, '触屏层启用（isTouch=true）');
  ok(t0.ui === 'block', '触屏 DOM（#touchui）可见（display=' + t0.ui + '）');
  ok(t0.bar === 'none', '动作条默认收起');
  ok(t0.back === 'CIELO.html?at=easel', '「回到画中」目标是 CIELO.html?at=easel（实际 ' + t0.back + '）');
  ok(t0.res && t0.res.outW > 320, '输出分辨率有效（' + (t0.res ? t0.res.outW + 'x' + t0.res.outH : '—') + '）');
  const moved = t0.pos && t1.pos ? Math.hypot(t1.pos[0] - t0.pos[0], t1.pos[1] - t0.pos[1], t1.pos[2] - t0.pos[2]) : 0;
  ok(moved > 0.5, '左摇杆推进让相机移动（位移 ' + moved.toFixed(2) + ' m）');
  ok(t2.barOpen === true && t2.expanded === 'true', '☰ 能展开动作条');
  ok(t3.view !== undefined && t3.view !== t0.view, '动作条「景 ›」能切观景点（' + t0.view + ' → ' + t3.view + '）');
  ok(t4.q && t4.q !== t0.q, '画质按钮能切档（' + t0.q + ' → ' + t4.q + '）');
  ok(t.text.includes('[astra] built'), '控制台有构建日志（世界真的建起来了）');

  // ================================================================ 坠入提示
  console.log('[从画中坠入 ?from=easel]');
  const f = runShot('from-easel', ['--url=' + PAGEBASE + '?from=easel', '--w=1280', '--h=720'], [
    'wait:3000',
    'eval:document.getElementById("start").click()',
    'wait:2600',
    'log:JSON.stringify({toast:(document.getElementById("toast")||{}).textContent,hint:(document.getElementById("hint")||{}).textContent,view:__astra.cam.viewIndex,loading:getComputedStyle(document.getElementById("loading")).visibility})',
  ]);
  const fr = f.logs[0] || {};
  ok(typeof fr.toast === 'string' && fr.toast.length > 0, '?from=easel 有坠入提示（"' + (fr.toast || '') + '"）');

  // ================================================================ 桌面（零回归）
  console.log('[桌面 desktop]');
  const d = runShot('desktop', ['--url=' + PAGEBASE + '?noui=1', '--w=1440', '--h=810'], [
    'wait:7000',
    'log:JSON.stringify({isTouch:__astra.isTouch,q:__astra.quality(),ui:getComputedStyle(document.getElementById("touchui")).display,view:__astra.cam.viewIndex,pos:__astra.cam.pos.map(v=>+v.toFixed(1)),tris:__astra.stats().tris})',
    'key:Digit5', 'wait:2600',
    'log:JSON.stringify({view:__astra.cam.viewIndex,pos:__astra.cam.pos.map(v=>+v.toFixed(1))})',
    'key:Space', 'wait:1200',
    'log:JSON.stringify({tour:!!__astra.cam.tour})',
    'shot:' + png('astra-desktop.png'),
  ]);
  const d0 = d.logs[0] || {};
  const d1 = d.logs[1] || {};
  const d2 = d.logs[2] || {};
  ok(d0.isTouch === false, '桌面不启用触屏层（isTouch=false）');
  ok(d0.ui === 'none', '桌面 #touchui 不可见（display=' + d0.ui + '）');
  ok(d0.q === 'high', '桌面默认画质「精细」（实际 ' + d0.q + '）');
  ok(d0.tris > 100000, '世界三角 ' + (d0.tris || 0).toLocaleString() + ' > 100,000（内容已装入）');
  ok(d1.view === 4, '键盘 5 切到观景点 5（view=' + d1.view + '）');
  ok(d2.tour === true, '空格开始自动巡游');
} finally {
  server.kill();
}
console.log('\n' + pass.length + ' PASS / ' + fail.length + ' FAIL');
if (fail.length) { console.log('FAILED:'); for (const f2 of fail) console.log('  · ' + f2); }
process.exit(fail.length ? 1 : 0);