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
  const steps = [
    // 单文件 960 KB + 200 万三角面，无头软件渲染下首帧要 3–5 s；等久一点再断言
    'wait:7500',
    // 首屏：菜单收起、无自动抵达卡片、但抄本已经悄悄记下一条（菜单角标 = 1）
    'log:JSON.stringify({isTouch:__cielo.isTouch,q:__cielo.quality(),stats:__cielo.stats(),ui:getComputedStyle(document.getElementById("touchui")).display,menu:getComputedStyle(document.getElementById("tu-menu")).display,bar:getComputedStyle(document.getElementById("tu-actions")).display,badge:document.getElementById("tu-badge").textContent,menuHas:document.getElementById("tu-menu").classList.contains("has"),card:document.getElementById("placecard").classList.contains("show"),pos:__cielo.cam.pos.map(v=>+v.toFixed(2)),yaw:+__cielo.cam.yaw.toFixed(3)})',
    // 左半屏摇杆：向下拖 = 前进
    'tdown:220,620',
    'tmove:220,540',
    'wait:1600',
    'tup:220,540',
    'log:JSON.stringify({pos:__cielo.cam.pos.map(v=>+v.toFixed(2))})',
    // 双手同时：左摇杆前进 + 右半屏转视角
    't2down:220,620,880,400',
    't2move:220,540,1040,360',
    'wait:1000',
    't2up',
    'log:JSON.stringify({pos:__cielo.cam.pos.map(v=>+v.toFixed(2)),yaw:+__cielo.cam.yaw.toFixed(3)})',
    // 右下 ☰ 展开菜单，再点「导览」；菜单应自动收起
    'eval:document.getElementById("tu-menu").click()',
    'wait:300',
    'log:JSON.stringify({barOpen:getComputedStyle(document.getElementById("tu-actions")).display==="flex",expanded:document.getElementById("tu-menu").getAttribute("aria-expanded")})',
    'eval:document.querySelector(\'[data-act="guide"]\').click()',
    'wait:900',
    'log:JSON.stringify({guideOpen:__cielo.guide.isOpen(),sceneParas:document.querySelectorAll(".gb-art .a-sec.scene p").length,storyParas:document.querySelectorAll(".gb-art .a-sec.story p").length,barAfter:getComputedStyle(document.getElementById("tu-actions")).display,title:(document.querySelector(".gb-art h2")||{}).textContent})',
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
    // ---- 第十二轮：主题航线（数据 src/routes.js，UI 在抄本头部 + 航线条） ----
    'eval:__cielo.startRoute("architecture")',
    'wait:900',
    'log:JSON.stringify({st:__cielo.routeState(),bar:getComputedStyle(document.getElementById("routebar")).display,text:document.getElementById("rb-stop").textContent,view:__cielo.cam.viewIndex,pos:__cielo.cam.pos.map(v=>+v.toFixed(1))})',
    // 一站停留 10–18 s：等足够久确认真的会推进到第 2 站
    'wait:18500',
    'log:JSON.stringify({st:__cielo.routeState(),text:document.getElementById("rb-stop").textContent,view:__cielo.cam.viewIndex})',
    // 手动拖视角 → 应自动退出航线（用户优先）
    'tdown:900,400',
    'tmove:1120,372',
    'tup:1120,372',
    'wait:3800',
    'log:JSON.stringify({st:__cielo.routeState(),bar:getComputedStyle(document.getElementById("routebar")).display})',
    'shot:' + png('tablet-route.png'),
  ];
  const M = await runShot('tablet', ['--mobile', '--touch', '--dpr=2', '--w=1280', '--h=800', '--url=' + PAGE + '?touch=1&noui=1&q=low'], steps);

  const L = M.logs;
  const m0 = L[0] || {}, m1 = L[1] || {}, m2 = L[2] || {}, m3 = L[3] || {}, m4 = L[4] || {}, m5 = L[5] || {}, m6 = L[6] || {}, m7 = L[7] || {}, pwa = L[8] || {};
  const r0 = L[9] || {}, r1 = L[10] || {}, r2 = L[11] || {};
  ok(m0.isTouch === true, '平板：触屏层未启用（__cielo.isTouch 不是 true）');
  ok(m0.q === 'low', '平板：画质档不是 low，而是 ' + m0.q);
  ok(m0.stats && m0.stats.shadow === false, '平板：阴影没有关（low 档应关阴影）');
  ok(m0.stats && m0.stats.scale <= 0.7, '平板：渲染倍率没有降下来，scale=' + (m0.stats && m0.stats.scale));
  ok(m0.ui === 'block', '平板：触屏 UI 没有显示，display=' + m0.ui);
  ok(m0.menu !== 'none', '平板：右下 ☰ 菜单按钮没有显示');
  ok(m0.bar === 'none', '平板：动作条没有默认收起（display=' + m0.bar + '）');
  ok(m0.card === false, '平板：抵达卡片仍然自动弹出（应改为静默记入抄本）');
  ok(m0.menuHas === true && Number(m0.badge) >= 1, '平板：抵达后菜单没有「新记载」角标（badge=' + m0.badge + '）');
  const moved = m1.pos && m0.pos && Math.hypot(m1.pos[0] - m0.pos[0], m1.pos[1] - m0.pos[1], m1.pos[2] - m0.pos[2]);
  ok(moved > 3, '平板：摇杆没有让相机移动（位移 ' + (moved || 0).toFixed(1) + ' m）');
  const moved2 = m2.pos && m1.pos && Math.hypot(m2.pos[0] - m1.pos[0], m2.pos[1] - m1.pos[1], m2.pos[2] - m1.pos[2]);
  ok(moved2 > 3, '平板：两只手同时操作时相机没有继续前进（位移 ' + (moved2 || 0).toFixed(1) + ' m）');
  ok(m2.yaw != null && Math.abs(m2.yaw - m0.yaw) > 0.15, '平板：两手同时操作时右半屏没有转视角（yaw ' + m0.yaw + ' → ' + m2.yaw + '）');
  ok(m3.barOpen === true && m3.expanded === 'true', '平板：点 ☰ 没有展开动作条');
  ok(m4.guideOpen === true, '平板：点「导览」没有打开抄本');
  ok(m4.sceneParas >= 2, '平板：抄本没有渲染「景」段（scene 段数 ' + m4.sceneParas + '）');
  ok(m4.storyParas >= 1, '平板：抄本没有渲染「故事」段');
  ok(m4.barAfter === 'none', '平板：选完动作后菜单没有自动收起（display=' + m4.barAfter + '）');
  ok(m5.guideClosed === true, '平板：✕ 没有关闭抄本');
  ok(m6.postcard === true, '平板：明信片没有打开');
  ok((m6.imgBytes || 0) > 50000, '平板：明信片图片数据太小（' + (m6.imgBytes || 0) + ' 字节）');
  ok(m7.postcardClosed === true, '平板：明信片关不掉');
  ok(pwa.manifest === true, '平板：manifest 加载失败');
  ok(pwa.manifestLink === true, '平板：页面没有注入 manifest link（PWA 装不上）');
  ok(pwa.icons >= 3, '平板：manifest 图标少于 3 个');
  ok(pwa.sw === true, '平板：service worker 没有注册');
  ok(pwa.offlineHit === true, '平板：离线缓存里没有 CIELO.html');
  // ---- 主题航线（第十二轮产品改进 B）
  ok(r0.st && r0.st.id === 'architecture', '平板：航线没有启程（routeState=' + JSON.stringify(r0.st) + '）');
  ok(r0.bar === 'flex', '平板：航线条没有显示（display=' + r0.bar + '）');
  ok(/第\s*1\s*\/\s*\d+\s*站/.test(r0.text || ''), '平板：航线条没有显示第 1 站（' + r0.text + '）');
  ok(r1.st && r1.st.index >= 1, '平板：航线 18 秒后没有推进到下一站（index=' + (r1.st && r1.st.index) + '）');
  ok(/第\s*2\s*\//.test(r1.text || ''), '平板：航线条没有更新到第 2 站（' + r1.text + '）');
  ok(r2.st && r2.st.id === null, '平板：手动拖视角后航线没有自动退出（routeState=' + JSON.stringify(r2.st) + '）');
  ok(r2.bar === 'none', '平板：退出航线后航线条没有收起（display=' + r2.bar + '）');

  // ================================================================ 桌面（非触摸）
  const D = await runShot('desktop', ['--w=1280', '--h=720', '--url=' + PAGE + '?noui=1'], [
    'wait:7500',
    'log:JSON.stringify({isTouch:__cielo.isTouch,q:__cielo.quality(),stats:__cielo.stats(),ui:getComputedStyle(document.getElementById("touchui")).display,buttons:document.querySelectorAll("#tu-actions button").length,card:document.getElementById("placecard").classList.contains("show"),newbadge:getComputedStyle(document.getElementById("newbadge")).display,badgeText:document.getElementById("newbadge").textContent})',
    'shot:' + png('desktop.png'),
  ]);
  const d0 = D.logs[0] || {};
  ok(d0.isTouch === false, '桌面：触屏层被误启用');
  ok(d0.q === 'high', '桌面：默认画质不是 high，而是 ' + d0.q);
  ok(d0.stats && d0.stats.shadow === true, '桌面：高画质下阴影被误关');
  ok(d0.ui === 'none', '桌面：触屏 UI 被显示出来，display=' + d0.ui);
  ok(d0.buttons >= 10, '桌面：触屏按钮 DOM 缺失（不影响显示，但应存在）');
  ok(d0.card === false, '桌面：抵达卡片仍然自动弹出（应改为静默记入抄本）');
  ok(d0.newbadge !== 'none', '桌面：左下没有「新记载」提示');
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
