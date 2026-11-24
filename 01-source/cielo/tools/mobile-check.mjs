// 第十一轮验收：安卓平板（触屏）形态 + 桌面零回归。
// 用 CDP 的移动视口 + 触摸模拟真跑一遍 CIELO：
//   · 触屏层是否启用、低画质档是否生效（关阴影 + 降分辨率）
//   · 左半屏摇杆能不能让相机移动、右半屏拖动能不能转视角
//   · 底部按钮能不能开导览抄本（有「景」段）、关闭
//   · 明信片工坊能否出片
//   · 同一份构建在桌面（非触摸）下触屏层不出现、高画质档不被改变
//
// usage: node tools/mobile-check.mjs [--gpu=default|swiftshader] [--port=8123] [--keep]
// 退出码 0 = 全 PASS。需要本机安装 Chrome（shot.mjs 自己找）。
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
const PORT = Number(args.port || 8123);
const OUT = path.resolve(here, '../../../04-output/_mobile');
fs.mkdirSync(OUT, { recursive: true });

const fail = [];
const ok = (cond, msg) => { if (!cond) fail.push(msg); };

function startServer() {
  return new Promise((resolve, reject) => {
    // 用仓库根做静态根：这样 manifest 里的 ../assets/pwa/* 图标与 service worker 都能按线上同样的
    // 相对路径解析（GitHub Pages 上 CIELO.html 就在 04-output/ 里）。
    const p = spawn(process.execPath, [path.join(here, 'serve.mjs'), '--port=' + PORT, '--root=../../..'], { cwd: path.join(here, '..'), stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const t = setTimeout(() => { p.kill(); reject(new Error('server did not start')); }, 8000);
    p.stdout.on('data', (d) => {
      out += String(d);
      if (out.includes('serving')) { clearTimeout(t); resolve(p); }
    });
    p.on('error', (e) => { clearTimeout(t); reject(e); });
  });
}

function runShot(label, extra, steps) {
  const argv = ['tools/shot.mjs', '--gpu=' + GPU, '--port=' + (PORT + 10), ...extra, ...steps.map((s) => '--do=' + s)];
  const r = spawnSync(process.execPath, argv, { cwd: path.join(here, '..'), encoding: 'utf8', timeout: 240000 });
  const text = (r.stdout || '') + (r.stderr || '');
  const logs = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^log → (.*)$/);
    if (m) {
      // shot.mjs 打印的是 JSON.stringify(返回值)，而我们的返回值本身是 JSON 字符串，
      // 所以这里要解两层；解不开就保留原文，方便报错时看到。
      let v = m[1];
      try { v = JSON.parse(v); } catch { /* keep raw */ }
      if (typeof v === 'string') { try { v = JSON.parse(v); } catch { /* keep string */ } }
      logs.push(v);
    }
    if (/^\[exception\]/.test(line)) fail.push(label + ': page exception → ' + line.slice(0, 220));
    if (/\[eval error\]/.test(line)) fail.push(label + ': eval error → ' + line.slice(0, 220));
  }
  if (!logs.length) fail.push(label + ': shot.mjs 没有返回任何 log（exit ' + r.status + '）→ ' + text.slice(0, 400));
  return { logs, text };
}

const PAGE = 'http://127.0.0.1:' + PORT + '/04-output/CIELO.html';
const png = (n) => path.join(OUT, n);

const server = await startServer();
try {
  // ================================================================ 平板（触屏）
  const M = await runShot('tablet', ['--mobile', '--touch', '--dpr=2', '--w=1280', '--h=800', '--url=' + PAGE + '?touch=1&noui=1&q=low'], [
    'wait:4200',
    'log:JSON.stringify({isTouch:__cielo.isTouch,q:__cielo.quality(),stats:__cielo.stats(),ui:getComputedStyle(document.getElementById("touchui")).display,buttons:document.querySelectorAll("#tu-actions button").length,pos:__cielo.cam.pos.map(v=>+v.toFixed(2)),yaw:+__cielo.cam.yaw.toFixed(3)})',
    // 左半屏摇杆：向下拖 = 前进
    'tdown:220,620',
    'tmove:220,540',
    'wait:1800',
    'tup:220,540',
    'log:JSON.stringify({pos:__cielo.cam.pos.map(v=>+v.toFixed(2)),touch:__cielo.cam.touch})',
    // 右半屏拖动 = 转视角
    'tdown:880,420',
    'tmove:1040,420',
    'wait:400',
    'tup:1040,420',
    'log:JSON.stringify({yaw:+__cielo.cam.yaw.toFixed(3)})',
    // 触屏按钮：导览 → 关闭
    'eval:document.querySelector(\'[data-act="guide"]\').click()',
    'wait:900',
    'log:JSON.stringify({guideOpen:__cielo.guide.isOpen(),sceneParas:document.querySelectorAll(".gb-art .a-sec.scene p").length,storyParas:document.querySelectorAll(".gb-art .a-sec.story p").length,title:(document.querySelector(".gb-art h2")||{}).textContent})',
    'shot:' + png('tablet-guide.png'),
    'eval:document.getElementById("gb-close").click()',
    'wait:500',
    'log:JSON.stringify({guideClosed:!__cielo.guide.isOpen()})',
    // 明信片工坊
    'eval:__cielo.postcard.open()',
    'wait:2600',
    'log:JSON.stringify({postcard:document.getElementById("postcard").classList.contains("show"),imgBytes:(document.getElementById("pc-img").src||"").length})',
    'shot:' + png('tablet-postcard.png'),
    'eval:document.getElementById("pc-close").click()',
    'wait:900',
    'log:JSON.stringify({postcardClosed:!document.getElementById("postcard").classList.contains("show")})',
    'shot:' + png('tablet-hud.png'),
    // PWA：manifest + service worker + 离线缓存（127.0.0.1 是安全上下文，可注册）
    'wait:1500',
    'log:(async()=>{const hasSW=!!navigator.serviceWorker;const reg=hasSW?await navigator.serviceWorker.getRegistration():null;const mf=await fetch("cielo.webmanifest").then(r=>r.json()).catch(()=>null);const keys=await caches.keys().catch(()=>[]);let hit=false;const k=keys.find(x=>x.startsWith("cielo-"));if(k){hit=!!(await caches.open(k).then(c=>c.match("./CIELO.html")).catch(()=>null));}return JSON.stringify({hasSW,sw:!!reg,manifest:!!mf,manifestLink:!!document.querySelector("link[rel=manifest]"),name:mf&&mf.name,icons:(mf&&mf.icons||[]).length,keys,offlineHit:hit});})()',
  ]);

  const m0 = M.logs[0] || {}, m1 = M.logs[1] || {}, m2 = M.logs[2] || {}, m3 = M.logs[3] || {}, m4 = M.logs[4] || {}, m5 = M.logs[5] || {}, m6 = M.logs[6] || {};
  ok(m0.isTouch === true, '平板：触屏层未启用（__cielo.isTouch 不是 true）');
  ok(m0.q === 'low', '平板：画质档不是 low，而是 ' + m0.q);
  ok(m0.stats && m0.stats.shadow === false, '平板：阴影没有关（low 档应关阴影）');
  ok(m0.stats && m0.stats.scale <= 0.7, '平板：渲染倍率没有降下来，scale=' + (m0.stats && m0.stats.scale));
  ok(m0.ui === 'block', '平板：触屏 UI 没有显示，display=' + m0.ui);
  ok(m0.buttons >= 10, '平板：动作条按钮只有 ' + m0.buttons + ' 个');
  const moved = m1.pos && m0.pos && Math.hypot(m1.pos[0] - m0.pos[0], m1.pos[1] - m0.pos[1], m1.pos[2] - m0.pos[2]);
  ok(moved > 3, '平板：摇杆没有让相机移动（位移 ' + (moved || 0).toFixed(1) + ' m）');
  ok(m2.yaw != null && Math.abs(m2.yaw - m0.yaw) > 0.15, '平板：右半屏拖动没有转视角（yaw ' + m0.yaw + ' → ' + m2.yaw + '）');
  ok(m3.guideOpen === true, '平板：点「导览」没有打开抄本');
  ok(m3.sceneParas >= 2, '平板：抄本没有渲染「景」段（scene 段数 ' + m3.sceneParas + '）');
  ok(m3.storyParas >= 1, '平板：抄本没有渲染「故事」段');
  ok(m4.guideClosed === true, '平板：✕ 没有关闭抄本');
  ok(m5.postcard === true, '平板：明信片没有打开');
  ok((m5.imgBytes || 0) > 50000, '平板：明信片图片数据太小（' + (m5.imgBytes || 0) + ' 字节）');
  ok(m6.postcardClosed === true, '平板：明信片关不掉');
  const pwa = M.logs[7] || {};
  ok(pwa.manifest === true, '平板：manifest 加载失败');
  ok(pwa.manifestLink === true, '平板：页面没有注入 manifest link（PWA 装不上）');
  ok(pwa.icons >= 3, '平板：manifest 图标少于 3 个');
  ok(pwa.sw === true, '平板：service worker 没有注册');
  ok(pwa.offlineHit === true, '平板：离线缓存里没有 CIELO.html');

  // ================================================================ 桌面（非触摸）
  const D = await runShot('desktop', ['--w=1280', '--h=720', '--url=' + PAGE + '?noui=1'], [
    'wait:4200',
    'log:JSON.stringify({isTouch:__cielo.isTouch,q:__cielo.quality(),stats:__cielo.stats(),ui:getComputedStyle(document.getElementById("touchui")).display,buttons:document.querySelectorAll("#tu-actions button").length})',
    'shot:' + png('desktop.png'),
  ]);
  const d0 = D.logs[0] || {};
  ok(d0.isTouch === false, '桌面：触屏层被误启用');
  ok(d0.q === 'high', '桌面：默认画质不是 high，而是 ' + d0.q);
  ok(d0.stats && d0.stats.shadow === true, '桌面：高画质下阴影被误关');
  ok(d0.ui === 'none', '桌面：触屏 UI 被显示出来，display=' + d0.ui);
  ok(d0.buttons >= 10, '桌面：触屏按钮 DOM 缺失（不影响显示，但应存在）');
} finally {
  server.kill();
}

console.log('\n=== mobile / tablet acceptance ===');
if (fail.length) {
  for (const f of fail) console.log('FAIL  ' + f);
  console.log('\n' + fail.length + ' FAIL');
  process.exit(1);
}
console.log('PASS  tablet touch / quality / guide / postcard  +  desktop regression');
console.log('shots → ' + OUT);
