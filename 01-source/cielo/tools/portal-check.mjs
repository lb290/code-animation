// 第十五轮验收：露台画架传送门（CIELO 侧）。
//
// 用无头 Chrome（复用 tools/shot.mjs 的 CDP 交互）真跑一遍构建后的 CIELO：
//   ① ?cam= 落在画架前、看向画布   → __cielo.portal.ready() === true
//   ② 把视线转开                    → ready() === false（不是"到处都能触发"）
//   ③ enter({dry:true}) 之前         → state() === 'idle'
//   ④ enter({dry:true})              → 状态进入过渡、target 指向 ASTRA.html，2.4 s 后跑完
//   ⑤ 默认 view 0（远处）+ 点画布    → ready() === false 且不触发过渡（桌面零回归）
//   ⑥ ?at=easel（从画中归来）        → 相机落在画布前 (0.229,31.39,87.651)、fov 46、已跳过标题页
//   ⑦ 热点激活时 click / Enter / 触屏 tap → 都进同一条过渡路径
// 跳转会让 CDP 会话断开，所以自动化一律用 enter({dry:true})（合同 §9.3）。
//
// usage: node tools/portal-check.mjs [--gpu=default|swiftshader] [--port=8153] [--page=CIELO.html]
// 退出码 0 = 全部 PASS。需要本机安装 Chrome（shot.mjs 自己找）。
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
const PORT = Number(args.port || 8153);
const PAGE_FILE = String(args.page || 'CIELO.html');
const OUT = path.resolve(here, '../../../04-output/_r15');
fs.mkdirSync(OUT, { recursive: true });

// 画布前落点（与 src/portal.js 的 RETURN_POSE 同一组数字，验收独立抄一份做交叉核对）
const RETURN_POS = [0.229, 31.39, 87.651];
const RETURN_FOV = 46;
const STATIC_TRIS = 2163136;   // 第十五轮基线：静态三角 2,163,136（几何零回归）

const fails = [];
const passed = [];
const ok = (cond, msg) => { if (cond) passed.push(msg); else fails.push(msg); };

function startServer() {
  return new Promise((resolve, reject) => {
    // 用仓库根做静态根：与 mobile-check 一致，manifest/service worker 的相对路径都能解析
    const p = spawn(process.execPath, [path.join(here, 'serve.mjs'), '--port=' + PORT, '--root=../../..'],
      { cwd: path.join(here, '..'), stdio: ['ignore', 'pipe', 'pipe'] });
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
  const argv = ['tools/shot.mjs', '--gpu=' + GPU, '--port=' + (PORT + 10), '--w=1280', '--h=720',
    ...extra, ...steps.map((s) => '--do=' + s)];
  const r = spawnSync(process.execPath, argv, { cwd: path.join(here, '..'), encoding: 'utf8', timeout: 300000 });
  const text = (r.stdout || '') + (r.stderr || '');
  const logs = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^log → (.*)$/);
    if (m) {
      // shot.mjs 打印的是 JSON.stringify(返回值)，我们的返回值本身常是 JSON 字符串：解两层
      let v = m[1];
      try { v = JSON.parse(v); } catch { /* keep raw */ }
      if (typeof v === 'string') { try { v = JSON.parse(v); } catch { /* keep string */ } }
      logs.push(v);
    }
    if (/^\[exception\]/.test(line)) fails.push(label + '：页面抛异常 → ' + line.slice(0, 260));
    if (/\[eval error\]/.test(line)) fails.push(label + '：页面 eval 报错 → ' + line.slice(0, 260));
  }
  if (!logs.length) fails.push(label + '：shot.mjs 没有返回任何 log（exit ' + r.status + '）→ ' + text.slice(0, 400));
  return { logs, text, status: r.status };
}

const PAGE = 'http://127.0.0.1:' + PORT + '/04-output/' + PAGE_FILE;
const png = (n) => path.join(OUT, n);

const server = await startServer();
try {
  // ================================================================ ① 画架前
  const A = await runShot('画架前', ['--url=' + PAGE + '?noui=1&freeze=2&cam=0.23,31.39,87.65&look=-1.86,31.24,88.82'], [
    'wait:8000',
    'log:JSON.stringify({ready:__cielo.portal.ready(),state:__cielo.portal.state(),probe:__cielo.portal.probe(),hint:document.getElementById("portal-hint").className,glow:document.getElementById("portal-glow").className,tris:__cielo.perf.tris})',
    'shot:' + png('portal-check-near.png'),
    // ② 把视线转开（同一机位、看相反方向）：ready 必须变 false
    'eval:__cielo.setCam([0.229,31.39,87.651],[8,31.39,80],46)',
    'wait:500',
    'log:JSON.stringify({readyTurned:__cielo.portal.ready(),probe:__cielo.portal.probe(),hint:document.getElementById("portal-hint").className})',
    // ④ 干跑过渡（不跳转）：状态机、目标 URL、真实的 2.4 s 时长
    'log:JSON.stringify(__cielo.portal.enter({dry:true}))',
    'wait:700',
    'log:JSON.stringify({enterState:__cielo.portal.state(),target:__cielo.portal.target(),prog:+__cielo.portal.progress().toFixed(3),veilOn:document.getElementById("portal-veil").classList.contains("on"),portalIn:document.documentElement.classList.contains("portal-in")})',
    'shot:' + png('portal-check-veil.png'),
    'wait:2200',
    'log:JSON.stringify({doneState:__cielo.portal.state(),prog:__cielo.portal.progress()})',
    // reset 必须把镜头/状态都还原（不留玩家在画布里）
    'log:JSON.stringify(__cielo.portal.reset())',
    'wait:300',
    'log:JSON.stringify({resetState:__cielo.portal.state(),cam:__cielo.cam.pos.map(v=>+v.toFixed(3)),fov:+__cielo.cam.fov.toFixed(2),portalIn:document.documentElement.classList.contains("portal-in")})',
    // ⑦ 热点激活时的三种输入：点击 / 回车 /（触屏 tap 在 D 段）。
    // 注意：上面做过"转开视线"实验，先把机位转回画布，热点才会重新激活。
    'eval:__cielo.setCam([0.229,31.39,87.651],[-1.865,31.24,88.824],46)',
    'wait:400',
    'click:640,360',
    'wait:500',
    'log:JSON.stringify({clickState:__cielo.portal.state(),veilOn:document.getElementById("portal-veil").classList.contains("on")})',
    'eval:__cielo.portal.reset()',
    'wait:200',
    'key:Enter',
    'wait:400',
    'log:JSON.stringify({keyState:__cielo.portal.state()})',
    'eval:__cielo.portal.reset()',
  ]);
  const a = A.logs;
  // 日志序号：0 ready / 1 转开 / 2 enter 结果 / 3 过渡中 / 4 过渡完成 / 5 reset 返回值 / 6 reset 后 / 7 点击 / 8 回车
  const a0 = a[0] || {}, a1 = a[1] || {}, a2 = a[2] || {}, a3 = a[3] || {}, a4 = a[4] || {};
  const a5 = a[6] || {}, a6 = a[7] || {}, a7 = a[8] || {};
  ok(a0.ready === true, '画架前：__cielo.portal.ready() 应为 true（probe dist=' + (a0.probe && a0.probe.dist && a0.probe.dist.toFixed(2)) +
    ' m / cos=' + (a0.probe && a0.probe.cos && a0.probe.cos.toFixed(3)) + '）');
  ok(a0.probe && a0.probe.dist <= 5.5 && a0.probe.cos >= 0.9, '画架前：近距判定应在阈值内（dist ≤ 5.5 m、cos ≥ 0.90）');
  ok(a0.hint && a0.hint.indexOf('show') >= 0, '画架前：应显示提示 #portal-hint（class 含 show）');
  ok(a0.tris === STATIC_TRIS, '几何零回归：静态三角应仍是 ' + STATIC_TRIS.toLocaleString() + '，实际 ' + a0.tris);
  ok(a1.readyTurned === false, '把视线转开后 ready() 应为 false（避免"到处都能触发"，cos=' +
    (a1.probe && a1.probe.cos && a1.probe.cos.toFixed(3)) + '）');
  ok(a1.hint && a1.hint.indexOf('show') < 0, '把视线转开后提示应隐藏');
  ok(a0.state === 'idle', 'enter 之前 state() 应为 idle，实际 ' + a0.state);
  ok(a2.ok === true && typeof a2.target === 'string' && a2.target.indexOf('ASTRA.html') >= 0,
    'enter({dry:true}) 应成功且 target 指向 ASTRA.html，实际 ' + JSON.stringify(a2));
  ok(a3.enterState === 'entering', 'enter({dry:true}) 后状态应进入 entering，实际 ' + a3.enterState);
  ok(a3.prog > 0.1, '过渡应按真实时间推进（0.7 s 后进度应 > 0.1，实际 ' + a3.prog + '）');
  ok(a3.veilOn === true, '过渡开始后应显示过渡层 #portal-veil（class 含 on）');
  ok(a3.portalIn === true, '过渡期间应给 <html> 加 portal-in（HUD 让位给画面）');
  ok(a4.doneState === 'done', 'dry 过渡 2.4 s 后应跑完并停在 done，实际 ' + a4.doneState);
  ok(a5.resetState === 'idle', 'reset() 后状态应回到 idle，实际 ' + a5.resetState);
  const dcam = a5.cam && Math.hypot(a5.cam[0] - 0.229, a5.cam[1] - 31.39, a5.cam[2] - 87.651);
  ok(dcam != null && dcam < 0.05, 'reset() 应把相机还原到进入前的位置（偏差 ' + (dcam && dcam.toFixed(3)) + ' m）');
  ok(Math.abs((a5.fov || 0) - 46) < 0.5, 'reset() 应把 fov 还原到 46，实际 ' + a5.fov);
  ok(a5.portalIn === false, 'reset() 后应移除 portal-in');
  ok(a6.clickState === 'entering', '热点激活时点击画布应开始坠入过渡，实际 ' + a6.clickState);
  ok(a6.veilOn === true, '热点激活时点击画布应显示过渡层');
  ok(a7.keyState === 'entering', '热点激活时按回车应开始坠入过渡，实际 ' + a7.keyState);

  // ================================================================ ⑤ 远处（桌面零回归）
  const B = await runShot('远处', ['--url=' + PAGE + '?noui=1&freeze=2'], [
    'wait:8000',
    'log:JSON.stringify({ready:__cielo.portal.ready(),state:__cielo.portal.state(),hint:document.getElementById("portal-hint").className,glow:document.getElementById("portal-glow").className,touchEnabled:__cielo.touch.enabled,tris:__cielo.perf.tris,cam:__cielo.cam.pos.map(v=>+v.toFixed(2))})',
    'shot:' + png('portal-check-far.png'),
    'click:640,360',
    'wait:600',
    'log:JSON.stringify({state:__cielo.portal.state(),veilOn:document.getElementById("portal-veil").classList.contains("on"),href:location.href})',
  ]);
  const b = B.logs;
  const b0 = b[0] || {}, b1 = b[1] || {};
  ok(b0.ready === false, '默认 view 0（露台全景区）ready() 应为 false，实际 cam=' + JSON.stringify(b0.cam));
  ok(b0.hint && b0.hint.indexOf('show') < 0, '远离画架时提示不应出现');
  ok(b0.touchEnabled === false, '桌面端触屏层应保持关闭（__cielo.touch.enabled === false）');
  ok(b0.tris === STATIC_TRIS, '几何零回归：默认机位静态三角仍是 ' + STATIC_TRIS.toLocaleString());
  ok(b1.state === 'idle' && b1.veilOn === false, '画架外点击画布不应触发过渡（桌面零回归），实际 state=' + b1.state);
  ok(typeof b1.href === 'string' && b1.href.indexOf('CIELO') >= 0 && b1.href.indexOf('ASTRA') < 0,
    '画架外点击后 URL 应仍在 CIELO.html（不跳转），实际 ' + b1.href);

  // ================================================================ ⑥ 从画中归来
  const C = await runShot('归来', ['--url=' + PAGE + '?at=easel&noui=1&freeze=2'], [
    'wait:8000',
    'log:JSON.stringify({cam:__cielo.cam.pos.map(v=>+v.toFixed(3)),fov:+__cielo.cam.fov.toFixed(2),ready:__cielo.portal.ready(),state:__cielo.portal.state(),started:__cielo.stats().started,hint:document.getElementById("portal-hint").className})',
    'shot:' + png('portal-check-return.png'),
  ]);
  const c = C.logs;
  const c0 = c[0] || {};
  const rp = c0.cam || [];
  const rpErr = rp.length === 3 ? Math.max(Math.abs(rp[0] - RETURN_POS[0]), Math.abs(rp[1] - RETURN_POS[1]), Math.abs(rp[2] - RETURN_POS[2])) : 9;
  ok(rpErr < 0.03, '?at=easel 应落在画布前 (' + RETURN_POS.join(', ') + ')，实际 ' + JSON.stringify(rp));
  ok(Math.abs((c0.fov || 0) - RETURN_FOV) < 0.01, '?at=easel 落位 fov 应为 ' + RETURN_FOV + '，实际 ' + c0.fov);
  ok(c0.ready === true, '?at=easel 开局就应可再次进入（ready()===true）');
  ok(c0.started === true, '?at=easel 应跳过标题页直接可玩（started===true）');
  ok(c0.hint && c0.hint.indexOf('show') >= 0, '?at=easel 归来后应看到画架提示（可以再次进画）');

  // ================================================================ ⑦ 触屏轻点
  const D = await runShot('触屏', ['--touch', '--url=' + PAGE + '?touch=1&noui=1&freeze=2&cam=0.23,31.39,87.65&look=-1.86,31.24,88.82'], [
    'wait:8000',
    'log:JSON.stringify({touch:__cielo.isTouch,ready:__cielo.portal.ready(),state:__cielo.portal.state()})',
    'tap:640,360',
    'wait:600',
    'log:JSON.stringify({state:__cielo.portal.state(),prog:+__cielo.portal.progress().toFixed(2)})',
    'eval:__cielo.portal.reset()',
  ]);
  const d = D.logs;
  const d0 = d[0] || {}, d1 = d[1] || {};
  ok(d0.touch === true, '?touch=1 应进入触屏形态（__cielo.isTouch === true）');
  ok(d0.ready === true, '触屏在画架前 ready() 应为 true');
  ok(d1.state === 'entering', '触屏轻点画布应进入同一条 onEnter 过渡路径，实际 ' + d1.state);
} finally {
  server.kill();
}

// ================================================================ 汇总
console.log('\n=== 第十五轮 · 画架传送门验收（CIELO 侧）===');
for (const p of passed) console.log('PASS  ' + p);
for (const f of fails) console.log('FAIL  ' + f);
console.log('\n' + passed.length + ' PASS / ' + fails.length + ' FAIL');
console.log('截图 → ' + OUT);
if (fails.length) process.exit(1);
console.log('PASS  露台画架传送门（就绪判定 / 干跑过渡 / 归来落位 / 触屏 / 桌面零回归）');
