// 第十二轮崩溃回归验收：受限堆（模拟安卓手机）+ 桌面零回归。
//
// 背景：第十一轮之后线上 CIELO 在安卓 Chrome 上渲染进程崩溃（sad tab），手机自带浏览器
// 缺教堂 / 火车站 / 大剧院。lead 定位为内存问题：桌面 usedJSHeapSize 1276 MB，而手机堆
// 上限只有 ~500 MB；第十二轮把世界几何改成「分块 TypedArray + 分批上传」。
// 这个脚本就是那一轮的验收：在真实 Chrome 里把堆压到手机大小，真跑一遍，确认
//   · 页面加载完成（window.__cielo 存在，且 __cielo.perf.buildMs > 0，说明世界构建跑完）
//   · 没有任何模块被 OOM 打断（页面 console 里没有 "[world] module ... failed" / "[city] stage ... failed"）
//   · 世界几何确实走了分块构建（__cielo.world.meshes 是多批，__cielo.ctx.failures 为空）
//   · 内容一份不少（静态三角面 ≥ 204.8 万（±0.5%）、观景 80 个、抄本 31 页）
//   · 构建后 JS 堆 < 300 MB（performance.memory.usedJSHeapSize，需要 --enable-precise-memory-info）
//   · 帧循环在跑（5 秒内 +30 帧以上），且没有 [exception]
// 另外用正常桌面（不压堆）再跑一遍，确认桌面零回归。
//
// 这是「第十二轮崩溃回归验收」：修复前这些断言必须 FAIL，修复后必须 PASS。
// 特别注意：受限堆下旧构建可能整个卡死（主线程一直 GC），此时 shot.mjs 的 eval 会超时；
// 脚本会记 FAIL，给出超时/退出码/页面日志片段作为证据，自己不会崩。
//
// usage:
//   node tools/mem-check.mjs                        # 默认：受限堆 350 MB（手机）+ 桌面，各跑一遍
//   node tools/mem-check.mjs --old-space=350        # 手机场景的 JS 堆上限（MiB，默认 350）
//   node tools/mem-check.mjs --gpu=default|swiftshader
//   node tools/mem-check.mjs --port=8134            # 静态服务器端口（shot.mjs 用 port+10 起调试口）
//   node tools/mem-check.mjs --only=mobile|desktop  # 只跑一个场景（排查用）
//   node tools/mem-check.mjs --mem=300              # 堆占用门槛（MB，默认 300）
//   node tools/mem-check.mjs --wait=18000           # 等待构建完成的毫秒数（默认 18000）
//   node tools/mem-check.mjs --shot-timeout=180000  # 单次 shot 子进程上限（默认 180000 ms）
//   node tools/mem-check.mjs --root=<dir> --page=/04-output/CIELO.html  # 测别的构建/目录（默认仓库根 + 正式构建）
//
// 退出码 0 = 全 PASS；1 = 有 FAIL；2 = 环境问题（找不到 Chrome / 静态服务器起不来）。
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const proj = path.resolve(here, '..');            // 01-source/cielo
const repoRoot = path.resolve(here, '../../..');  // 仓库根（GitHub Pages 的静态根）

// ------------------------------------------------------------------ 参数
const args = {};
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/s);
  if (m) args[m[1]] = m[2] === undefined ? true : m[2];
}
const OLD_SPACE = Number(args['old-space'] || 350);       // 手机场景 JS 堆上限（MiB）
const GPU = args.gpu || 'default';
const PORT = Number(args.port || 8134);
const ROOT = path.resolve(args.root || repoRoot);         // 静态服务器根
const PAGE = args.page ? (String(args.page).startsWith('/') ? String(args.page) : '/' + args.page) : '/04-output/CIELO.html';
const PAGE_URL = 'http://127.0.0.1:' + PORT + PAGE;
const MEM_LIMIT_MB = Number(args.mem || 300);             // JS 堆占用门槛
const WAIT_BUILD_MS = Number(args.wait || 18000);         // 等构建完成
const FRAME_WINDOW_MS = Number(args['frame-window'] || 5000); // 帧循环观测窗口
const MIN_FRAME_DELTA = Number(args['min-frames'] || 30); // 5 秒至少涨多少帧
const SHOT_TIMEOUT_MS = Number(args['shot-timeout'] || 180000); // 单次 shot 子进程上限
const ONLY = args.only || 'all';

// —— 内容门槛（第十一轮既有规模：204.8 万三角面 / 80 个观景点 / 31 页抄本）
const MIN_TRIS = 2048000;
const TRIS_TOL = 0.005;                                   // 允许 ±0.5%
const EXPECT_VIEWS = 80;
const EXPECT_LORE = 31;
const MIN_TRIS_EFFECTIVE = Math.round(MIN_TRIS * (1 - TRIS_TOL)); // 2,037,760

const startedAt = Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 中文按 2 列宽对齐
const w = (s) => [...String(s)].reduce((n, ch) => n + (/[\u2e80-\uffff]/.test(ch) ? 2 : 1), 0);
const pad = (s, n) => String(s) + ' '.repeat(Math.max(1, n - w(s)));

// 在页面里一次性取回所有读数（IIFE 返回 JSON 字符串，shot 的 log: 步骤会打印它）
const READ_EXPR = String.raw`(()=>{
  const c = window.__cielo;
  if (!c) return JSON.stringify({ hasCielo: false, href: location.href });
  const out = { hasCielo: true, ready: !!c.ready, href: location.href };
  try {
    out.build = c.build;
    out.buildMs = c.perf && c.perf.buildMs;
    out.frames = c.perf && c.perf.frames;
    out.drawCalls = c.perf && c.perf.drawCalls;
    out.tris = c.world && c.world.tris;
    out.guideTotal = c.guide && c.guide.total;
    out.meshes = c.world && c.world.meshes ? c.world.meshes.length : null;
    out.failures = c.ctx && Array.isArray(c.ctx.failures) ? c.ctx.failures.length : null;
    out.failNames = c.ctx && Array.isArray(c.ctx.failures) && c.ctx.failures.length
      ? c.ctx.failures.slice(0, 3).map((x) => (x && x.name ? x.name : '?') + ':' + String(x && x.msg).slice(0, 80)) : [];
  } catch (e) { out.err = String(e && e.message); }
  try {
    const m = performance.memory;
    out.memMB = m ? +(m.usedJSHeapSize / 1048576).toFixed(1) : null;
    out.memLimitMB = m ? +(m.jsHeapSizeLimit / 1048576).toFixed(1) : null;
  } catch (e) { out.memErr = String(e && e.message); }
  // 从诊断面板里取「观景 N / 抄本 N 页」（DOM 读法，不依赖 __cielo 额外字段）
  try {
    c.diag();
    const d = document.getElementById('diag');
    out.diag = d ? d.textContent : '';
    if (d) d.remove();
  } catch (e) { out.diag = 'ERR:' + String(e && e.message); }
  return JSON.stringify(out);
})()`;

// ------------------------------------------------------------------ 静态服务器
// 端口被占用时 Node 会打一整段堆栈，这里只取「Error: ...」那一行，汇总里干净一点
const errBrief = (s) => {
  const m = String(s || '').match(/Error: [^\r\n]+/);
  return m ? m[0] : String(s || '').trim().slice(0, 160);
};
function startServer() {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [path.join(here, 'serve.mjs'), '--port=' + PORT, '--root=' + ROOT], {
      cwd: proj, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '', err = '';
    const t = setTimeout(() => {
      try { p.kill(); } catch {}
      reject(new Error('静态服务器 8 秒内没有就绪（端口 ' + PORT + ' 被占用？）' + (err ? '：' + errBrief(err) : '')));
    }, 8000);
    p.stdout.on('data', (d) => {
      out += String(d);
      if (out.includes('serving')) { clearTimeout(t); resolve(p); }
    });
    p.stderr.on('data', (d) => { err += String(d); });
    p.on('error', (e) => { clearTimeout(t); reject(e); });
    p.on('exit', (code) => {
      if (code != null && code !== 0) { clearTimeout(t); reject(new Error('静态服务器退出 code=' + code + (err ? '：' + errBrief(err) : ''))); }
    });
  });
}

// ------------------------------------------------------------------ 跑一次 shot.mjs
// 返回 { status, signal, timedOut, elapsedMs, text, logs, pageLog, shotPort }，永远不抛异常。
function runShot(label, viewportArgs, steps, flags) {
  runShot.n = (runShot.n || 0) + 1;
  const shotPort = PORT + 10 + runShot.n; // 每次用新调试端口，避免上次残留的 Chrome 串台
  const argv = [
    'tools/shot.mjs',
    '--gpu=' + GPU,
    '--port=' + shotPort,
    ...viewportArgs,
    '--flags=' + flags,
    ...steps.map((s) => '--do=' + s),
  ];
  const began = Date.now();
  let r;
  try {
    r = spawnSync(process.execPath, argv, { cwd: proj, encoding: 'utf8', timeout: SHOT_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024 });
  } catch (e) {
    return { status: null, signal: null, timedOut: true, elapsedMs: Date.now() - began, text: '[spawn 失败] ' + e.message, logs: [], pageLog: [], shotPort };
  }
  const text = (r.stdout || '') + (r.stderr || '');
  const elapsedMs = Date.now() - began;
  const timedOut = r.status === null && r.signal != null;
  const logs = [], pageLog = [];
  let inPageLog = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^--- page log ---\s*$/.test(line)) { inPageLog = true; continue; }
    if (inPageLog) { pageLog.push(line); continue; }
    const m = line.match(/^log → (.*)$/s);
    if (m) {
      // shot.mjs 打印 JSON.stringify(返回值)；返回值本身又是 JSON 字符串 → 解两层
      let v = m[1];
      try { v = JSON.parse(v); } catch { /* keep raw */ }
      if (typeof v === 'string') { try { v = JSON.parse(v); } catch { /* keep string */ } }
      logs.push(v);
    }
  }
  return { status: r.status, signal: r.signal, timedOut, elapsedMs, text, logs, pageLog, shotPort };
}

// 超时/异常退出时，尽力关掉可能残留下来的 Chrome（避免下次串台、也避免吃内存）
async function closeBrowserOnPort(port) {
  try {
    const v = await (await fetch('http://127.0.0.1:' + port + '/json/version')).json();
    if (!v || !v.webSocketDebuggerUrl) return;
    const ws = new WebSocket(v.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('ws timeout')), 3000);
      ws.onopen = () => { clearTimeout(t); res(); };
      ws.onerror = () => { clearTimeout(t); rej(new Error('ws error')); };
    });
    ws.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
    await sleep(400);
    try { ws.close(); } catch {}
  } catch { /* 端口上已经没有 Chrome，正常情况 */ }
}

// ------------------------------------------------------------------ 解析页面读数
function parseDiagNumbers(diag) {
  const s = String(diag || '');
  const v = s.match(/观景\s*([\d,]+)/);
  const l = s.match(/抄本\s*([\d,]+)\s*页/);
  return {
    views: v ? Number(v[1].replace(/,/g, '')) : null,
    lore: l ? Number(l[1].replace(/,/g, '')) : null,
  };
}
function parseBuildLog(pageLog) {
  for (const line of pageLog) {
    const m = line.match(/\[main\] build (.+?) \| static tris ([\d,]+) \| views ([\d,]+) \| lore ([\d,]+)/);
    if (m) return { stamp: m[1], tris: Number(m[2].replace(/,/g, '')), views: Number(m[3]), lore: Number(m[4]) };
  }
  return null;
}
const isModuleFail = (line) => /\[(?:world|city)\]\s+(?:module|stage)\s+.+?\s+failed/.test(line);

// ------------------------------------------------------------------ 单个场景
// cfg: { key, n, mobile, heapMB }
async function runScenario(cfg) {
  const heapNote = cfg.heapMB ? '受限堆 ' + cfg.heapMB + ' MB（模拟安卓手机）' : '正常桌面（不压堆）';
  const viewportArgs = cfg.mobile
    ? ['--mobile', '--touch', '--dpr=2', '--w=1024', '--h=600']
    : ['--w=1280', '--h=720'];
  viewportArgs.push('--url=' + PAGE_URL);
  const flags = (cfg.heapMB ? '--js-flags=--max-old-space-size=' + cfg.heapMB + ' ' : '') + '--enable-precise-memory-info';

  process.stdout.write('\n[' + cfg.n + '] ' + heapNote + ' · ' + (cfg.mobile ? '1024×600 @2x 触屏' : '1280×720') + '\n');
  process.stdout.write('    页面 ' + PAGE_URL + '\n');
  process.stdout.write('    运行 shot.mjs（单次上限 ' + Math.round(SHOT_TIMEOUT_MS / 1000) + 's；受限堆下旧构建可能卡死，要等满超时）… ');

  const baseSteps = [
    'wait:' + WAIT_BUILD_MS,
    'log:' + READ_EXPR,
    'wait:' + FRAME_WINDOW_MS,
    'log:' + READ_EXPR,
    'wait:3000',
    'log:' + READ_EXPR,
  ];
  const run = runShot(cfg.key, viewportArgs, baseSteps, flags);

  // 主跑没拿到读数 → 再跑一次「只等、不 eval」的取证跑：页面卡死时 eval 会超时，
  // 但 wait 不需要页面主线程，shot.mjs 仍会把 console 日志打出来。
  let evidence = null;
  if (!run.logs.length) {
    process.stdout.write('\n    主跑没返回读数（exit=' + run.status + '，' + (run.elapsedMs / 1000).toFixed(1) + 's），再跑一次只取日志… ');
    evidence = runShot(cfg.key + '-evidence', viewportArgs, ['wait:' + Math.min(20000, WAIT_BUILD_MS)], flags);
  }
  process.stdout.write('完成（' + (run.elapsedMs / 1000).toFixed(1) + 's）\n');

  // 汇总两个 shot 的页面日志
  const pageLog = [...run.pageLog];
  if (evidence) for (const l of evidence.pageLog) if (!pageLog.includes(l)) pageLog.push(l);
  const moduleFails = [...new Set(pageLog.filter(isModuleFail))];
  const exceptions = [...new Set(pageLog.filter((l) => /^\[exception\]/.test(l)))];
  const evalErrors = [...new Set(pageLog.filter((l) => /^\[eval error\]/.test(l)))];
  const buildLog = parseBuildLog(pageLog);
  const read0 = (run.logs[0] && typeof run.logs[0] === 'object') ? run.logs[0] : null;
  const read1 = (run.logs[1] && typeof run.logs[1] === 'object') ? run.logs[1] : null;
  const read2 = (run.logs[2] && typeof run.logs[2] === 'object') ? run.logs[2] : null;
  const dn0 = parseDiagNumbers(read0 && read0.diag);
  const tris = (read0 && Number.isFinite(read0.tris)) ? read0.tris : (buildLog ? buildLog.tris : null);
  const views = dn0.views != null ? dn0.views : (buildLog ? buildLog.views : null);
  const lore = dn0.lore != null ? dn0.lore
    : (read0 && Number.isFinite(read0.guideTotal) ? read0.guideTotal : (buildLog ? buildLog.lore : null));
  // 堆读数会受 GC 时机影响（刚构建完可能还有没回收的垃圾），取多次读数里的最小值；
  // 真回归（几何常驻 1.2 GB）时每一次读数都会很大，不会被这个处理放过。
  const memSeq = [read0, read1, read2]
    .map((x) => (x && Number.isFinite(x.memMB) ? x.memMB : null))
    .filter((v) => v != null);
  const memMB = memSeq.length ? Math.min(...memSeq) : null;
  const memLimitMB = read0 && Number.isFinite(read0.memLimitMB) ? read0.memLimitMB : null;
  const buildStamp = (read0 && read0.build) || (buildLog && buildLog.stamp) || null;

  const noReading = !read0;
  const shotNote = noReading
    ? '无读数：shot.mjs ' + (run.timedOut ? '进程超时（' + Math.round(run.elapsedMs / 1000) + 's，上限 ' + Math.round(SHOT_TIMEOUT_MS / 1000) + 's）'
      : 'exit=' + run.status + (run.signal ? '/signal ' + run.signal : '')) + '，' + (run.elapsedMs / 1000).toFixed(1) + 's'
    : null;

  const A = [];
  const add = (name, ok, detail) => A.push({ name, ok, detail });

  // 1) 页面构建完成
  add('页面构建完成',
    !!read0 && read0.hasCielo === true && Number.isFinite(read0.buildMs) && read0.buildMs > 0,
    noReading ? shotNote : (!read0.hasCielo ? 'window.__cielo 不存在（页面脚本没跑到暴露 API 那一步）'
      : !(Number.isFinite(read0.buildMs) && read0.buildMs > 0) ? '__cielo.perf.buildMs=' + read0.buildMs + '（世界构建没有完成）'
        : 'buildMs=' + Math.round(read0.buildMs) + ' ms · ready=' + read0.ready));

  // 2) 没有任何模块失败
  add('无模块失败',
    moduleFails.length === 0,
    moduleFails.length === 0
      ? '0 条 "[world] module ... failed" / "[city] stage ... failed"' + (noReading ? '（但构建本身没完成 → 见上一条）' : '')
      : moduleFails.length + ' 条模块失败：' + moduleFails.slice(0, 3).map((l) => l.replace(/^\[[^\]]+\]\s*/, '').slice(0, 160)).join('；'));

  // 3) 分块构建生效（第十二轮修复的直接证据：多批 mesh + 页面自己收集的 failures 为空）
  const meshes = read0 && Number.isFinite(read0.meshes) ? read0.meshes : null;
  const failures = read0 && Number.isFinite(read0.failures) ? read0.failures : null;
  add('分块构建生效',
    meshes != null && meshes >= 2 && failures === 0,
    noReading ? shotNote
      : meshes == null ? '老构建没有 __cielo.world.meshes（世界几何还是单块构建）'
        : 'world.meshes ' + meshes + ' 批（要求 ≥ 2）· ctx.failures '
          + (failures == null ? '取不到（老构建没有 __cielo.ctx.failures）' : failures + ' 条'
            + (read0.failNames && read0.failNames.length ? '：' + read0.failNames.join('；') : '')) + '（要求 0 条）');

  // 4) 内容完整
  const trisOk = Number.isFinite(tris) && tris >= MIN_TRIS_EFFECTIVE;
  const viewsOk = views === EXPECT_VIEWS;
  const loreOk = lore === EXPECT_LORE;
  add('内容完整',
    trisOk && viewsOk && loreOk,
    noReading ? shotNote
      : '静态 tris ' + (Number.isFinite(tris) ? tris.toLocaleString('en-US') : '取不到') + '（要求 ≥ ' + MIN_TRIS_EFFECTIVE.toLocaleString('en-US') + '）'
        + ' · 观景 ' + (views == null ? '取不到' : views) + '（要求 ' + EXPECT_VIEWS + '）'
        + ' · 抄本 ' + (lore == null ? '取不到' : lore + ' 页') + '（要求 ' + EXPECT_LORE + ' 页）');

  // 5) 受限堆确实生效（只对手机场景；防止 --js-flags 没传进去导致「假 PASS」）
  if (cfg.heapMB) {
    add('受限堆生效',
      Number.isFinite(memLimitMB) && memLimitMB <= cfg.heapMB + 220,
      noReading ? shotNote
        : 'jsHeapSizeLimit ' + (memLimitMB == null ? '取不到（performance.memory 不可用）' : memLimitMB + ' MB')
          + '，要求 ≤ ' + (cfg.heapMB + 220) + ' MB（--max-old-space-size=' + cfg.heapMB + '）');
  }

  // 6) 构建后 JS 堆 < 门槛
  add('JS 堆 < ' + MEM_LIMIT_MB + ' MB',
    Number.isFinite(memMB) && memMB < MEM_LIMIT_MB,
    noReading ? shotNote
      : 'usedJSHeapSize ' + (memSeq.length ? memSeq.join(' / ') + ' MB（取最小）' : '取不到（performance.memory 不可用）')
        + ' / 堆上限 ' + (memLimitMB == null ? '?' : memLimitMB + ' MB') + '，要求 < ' + MEM_LIMIT_MB + ' MB');

  // 7) 帧循环在跑
  const f0 = read0 && Number.isFinite(read0.frames) ? read0.frames : null;
  const f1 = read1 && Number.isFinite(read1.frames) ? read1.frames : null;
  const dFrames = f0 != null && f1 != null ? f1 - f0 : null;
  add('帧循环在跑',
    dFrames != null && dFrames >= MIN_FRAME_DELTA,
    noReading ? shotNote
      : f0 == null ? '取不到 __cielo.perf.frames'
        : f1 == null ? f0 + ' 帧后没有第二次读数（页面在 ' + FRAME_WINDOW_MS / 1000 + 's 内失去响应）'
          : f0 + ' → ' + f1 + ' 帧（' + FRAME_WINDOW_MS / 1000 + 's，' + (dFrames >= 0 ? '+' : '') + dFrames + '，要求 ≥ +' + MIN_FRAME_DELTA + '）');

  // 8) 无页面异常
  add('无页面异常',
    exceptions.length === 0 && evalErrors.length === 0,
    exceptions.length === 0 && evalErrors.length === 0
      ? '0 条 [exception] / 0 条 [eval error]'
      : (exceptions.length + evalErrors.length) + ' 条：' + [...exceptions, ...evalErrors].slice(0, 2).map((l) => l.slice(0, 180)).join('；'));

  return {
    cfg, run, evidence, A, pageLog, moduleFails, exceptions, evalErrors,
    read0, read1, read2, tris, views, lore, memMB, memLimitMB, buildStamp, noReading, shotNote,
  };
}

// ------------------------------------------------------------------ 打印一个场景的结果
const EVIDENCE_LINES = 12;
const beforePageLog = (text) => String(text || '').split(/^--- page log ---\s*$/m)[0];
function printScenario(sc) {
  const { cfg, A } = sc;
  console.log('');
  console.log('  构建   ' + (sc.buildStamp || '读取失败'));
  for (const a of A) {
    console.log('  ' + (a.ok ? 'PASS' : 'FAIL') + '  ' + pad(a.name, 20) + ' ' + a.detail);
  }
  const fails = A.filter((a) => !a.ok);
  if (!fails.length) return;
  // FAIL 时给出证据：shot.mjs 输出尾部 + 页面日志尾部
  const shotLines = (t) => beforePageLog(t).split(/\r?\n/).filter((l) => l.trim() && !/^(?:log|eval|shot) →/.test(l));
  console.log('  证据  shot/页面日志：');
  const a1 = shotLines(sc.run.text).slice(-3);
  console.log('        shot.mjs：' + (a1.length ? a1.join(' | ').slice(0, 400) : '（无输出）'));
  if (sc.evidence) {
    const a2 = shotLines(sc.evidence.text).slice(-3);
    console.log('        取证跑：' + (a2.length ? a2.join(' | ').slice(0, 400) : '（只输出页面日志，见下）'));
  }
  const tail = sc.pageLog.filter((l) => l.trim()).slice(-EVIDENCE_LINES);
  if (tail.length) for (const line of tail) console.log('        ' + line.slice(0, 400));
  else console.log('        （页面日志为空：页面在打日志之前就卡死/崩溃了）');
}

// ------------------------------------------------------------------ main
console.log('=== CIELO 第十二轮崩溃回归验收 · 受限堆模拟安卓手机 + 桌面零回归 ===');
const pageDesc = (ROOT === repoRoot && PAGE === '/04-output/CIELO.html')
  ? '仓库里当前的 04-output/CIELO.html' : ROOT + PAGE;
console.log('构建：' + pageDesc + '（构建戳由页面自己报）');
console.log('门槛：静态 tris ≥ ' + MIN_TRIS_EFFECTIVE.toLocaleString('en-US') + '（204.8 万 −0.5%）· 观景 ' + EXPECT_VIEWS
  + ' · 抄本 ' + EXPECT_LORE + ' 页 · JS 堆 < ' + MEM_LIMIT_MB + ' MB · 5 秒 +' + MIN_FRAME_DELTA + ' 帧');
console.log('服务器根：' + ROOT);

const scenarios = [];
if (ONLY !== 'desktop') scenarios.push({ key: 'mobile', mobile: true, heapMB: OLD_SPACE });
if (ONLY !== 'mobile') scenarios.push({ key: 'desktop', mobile: false, heapMB: 0 });

let server = null;
const results = [];
let envError = null;
try {
  server = await startServer();
  for (const cfg of scenarios) {
    cfg.n = results.length + 1;
    const sc = await runScenario(cfg);
    if (sc.run.status !== 0) await closeBrowserOnPort(sc.run.shotPort);
    if (sc.evidence && sc.evidence.status !== 0) await closeBrowserOnPort(sc.evidence.shotPort);
    printScenario(sc);
    results.push(sc);
  }
} catch (e) {
  envError = envError || e;
} finally {
  if (server) { try { server.kill(); } catch {} }
}

// ------------------------------------------------------------------ 汇总
const all = results.flatMap((sc) => sc.A.map((a) => ({ ...a, label: sc.cfg.mobile ? '手机/受限堆' : '桌面' })));
const fails = all.filter((a) => !a.ok);
console.log('');
if (envError) {
  console.log('环境错误：' + envError.message);
  console.log('（找不到 Chrome 时 shot.mjs 会以 exit 2 退出；端口被占用时换个 --port=）');
  process.exit(2);
}
if (!all.length) {
  console.log('没有跑任何场景（--only 参数不对？）。');
  process.exit(2);
}
const nPass = all.length - fails.length;
if (fails.length) {
  console.log('=== 汇总：' + nPass + ' PASS / ' + fails.length + ' FAIL · 退出码 1 ===');
  for (const f of fails) console.log('  FAIL  ' + f.label + ' · ' + f.name + ' —— ' + f.detail);
  process.exit(1);
}
console.log('=== 汇总：' + nPass + ' PASS / 0 FAIL · 退出码 0 · 耗时 ' + ((Date.now() - startedAt) / 1000).toFixed(1) + 's ===');
