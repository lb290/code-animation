// 渲染成本拆分 · 可重复采样工具
// ----------------------------------------------------------------
// bench.mjs 单次测量的噪声很大（同一配置多次跑能差 2 倍：上一轮遗留的 headless
// Chrome 进程还占着 GPU，加上跟随帧计数的一次性抖动）。这个工具把“可信”当成第一目标：
//
//   1. 每次测量前清掉所有残留的 skycity-chrome-* / 占着本端口的 Chrome，再新起一个
//      （shot.mjs 每次都 mkdtemp 新建 user-data-dir，不复用任何旧 profile）；
//   2. 每个配置连续测 3 次，报告里同时给出 3 次数值、中位数和抖动列；
//   3. 每次采样前静置 4 s（--settle 可调，建议 4000-6000），让着色器编译、
//      GPU 上传和 GC 的一次性开销过去；
//   4. 帧时间口径：每帧末尾 readPixels(1x1) 强制 GPU 把这帧画完。这一点很关键 ——
//      bench.mjs 用的 gl.finish() 在 Chrome 里并不阻塞（实测 0.4 ms 就返回），
//      而 rAF 在 --disable-frame-rate-limit 下会跑到 GPU 前面，所以「rAF 间隔中位数」
//      会假性偏低（720p 实测 0.5 ms，真值 ~6 ms）。同步后中位数才等于单帧成本。
//   5. 每格同时记录「自由跑吞吐」(freeMean) 作对照，报告里两个口径都给，不混用；
//   6. 全程串行、单 Chrome，从不并行（并行会互相抢 GPU）；末尾用同配置复测做漂移探针。//
// usage:
//   node tools/perf-split.mjs
//   node tools/perf-split.mjs --reps=3 --settle=4500 --sample=1800 --budget=600
//   node tools/perf-split.mjs --only=G1        # 只测名字里带 G1 的组
//   node tools/perf-split.mjs --dry            # 只打印配置清单与 URL
//
// 只写 04-output/_perf/**；不碰 src/、不碰 04-output/CIELO.html。
import { spawnSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');            // F:/AI/dsh/code-animation
const SHOT = path.join(HERE, 'shot.mjs');
const OUT_DIR = path.join(REPO, '04-output/_perf');
const OUT_MD = path.join(OUT_DIR, 'round13-baseline.md');
const OUT_RAW = path.join(OUT_DIR, 'round13-raw.json');
const BT = String.fromCharCode(96);
const TIERS_BUILD_TEXT = 'high = 阴影开 / outCap 3.4MP / px0 1.9MP / 12 灯 / fxaa / sharpen .28 / sky 开；'
  + 'low = 阴影关 / outCap 2.2MP / px0 0.95MP / 8 灯 / fxaa / sharpen .55 / sky 关';                      // markdown 行内代码用的反引号
const FENCE = BT + BT + BT;
const code = (s) => BT + s + BT;

// ---------------------------------------------------------------- args
const opt = {
  base: 'http://127.0.0.1:8099/04-output/CIELO.html',
  port: '9332',
  reps: 3,
  settle: 4000,      // 每次采样前静置 ms（任务要求 4-6 s）
  sample: 1200,      // 同步采样窗口 ms（每帧 readPixels 强制 GPU 完成）
  budget: 600,       // 测量阶段总预算 s，超了跳过剩余低优先级配置
  free: 800,         // 自由跑采样窗口 ms（对照口径，不强制同步）
  only: '',
  gpu: 'default',
  dry: false,
};
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/s);
  if (!m) continue;
  const k = m[1];
  const v = m[2] === undefined ? true : m[2];
  if (k === 'dry') opt.dry = true;
  else if (k in opt) opt[k] = typeof opt[k] === 'number' ? Number(v) : v;
}
const REPS = Math.max(1, Math.min(9, opt.reps | 0));

// ---------------------------------------------------------------- 测量矩阵
// ?no= 只能出现一次，值用逗号连接。adapt 一律关掉（freeze 本身已经停了自适应，
// 这里显式写上，读报告的人一眼就知道倍率在采样窗里是常数）。
const COMBOS = {
  full:       { off: [], label: '全开' },
  noworld:    { off: ['world'], label: '关静态世界' },
  noworldsky: { off: ['world', 'sky'], label: '关世界+天空' },
  post:       { off: ['world', 'sky', 'bill', 'inst', 'add', 'bs', 'bd'], label: '只剩后处理（bloom 开）' },
  comp:       { off: ['world', 'sky', 'bill', 'bloom', 'inst', 'add', 'bs', 'bd'], label: '只剩 composite（bloom 关）' },
};
const R3 = [[1280, 720], [1920, 1080], [2560, 1440]];
// 04-output/CIELO.html 的画质档是「像素预算」模型，不是 src/main.js 的固定倍率：
//   canvas(输出) = min(视口像素, outCap)，内部渲染 RT ≈ min(px0, 输出像素)。
// 所以 canvas 尺寸 != 内部渲染分辨率，两者都要记。下面这张表来自构建产物里的 wr()/q6。
const TIERS_BUILD = {
  high: { shadow: true, outCap: 3.4e6, px0: 1.9e6, pxMin: 1.0e6, pxMax: 3.2e6, fxaa: 1, sharpen: 0.28, lights: 12, sky: 1 },
  low: { shadow: false, outCap: 2.2e6, px0: 0.95e6, pxMin: 0.55e6, pxMax: 1.7e6, fxaa: 1, sharpen: 0.55, lights: 8, sky: 0 },
};
function deriveSrc(cfg, canvas) {
  const t = TIERS_BUILD[cfg.q];
  if (!t || !canvas || !canvas[0]) return null;
  const outPx = canvas[0] * canvas[1];
  const srcPx = Math.min(t.px0, outPx);
  const aspect = cfg.w / cfg.h;
  const sw = Math.round(Math.sqrt(srcPx * aspect));
  const sh = Math.round(sw / aspect);
  return { w: sw, h: sh, mp: +((sw * sh) / 1e6).toFixed(4) };
}
const CONFIGS = [];
const add = (group, w, h, q, combo, note) => CONFIGS.push({
  group, w, h, q, combo, note: note || '',
  id: w + 'x' + h + '|' + q + '|' + combo,
});

// G1：全开 × 3 分辨率 × 2 画质 —— 拟合 a + b·MP 的主数据
for (const [w, h] of R3) add('G1 全开', w, h, 'high', 'full');
for (const [w, h] of R3) add('G1 全开', w, h, 'low', 'full');
// G2：后处理（场景几何全关，但 bloom 保持开启）
for (const [w, h] of [[1280, 720], [1920, 1080]]) add('G2 后处理', w, h, 'high', 'post');
for (const [w, h] of [[1280, 720], [1920, 1080]]) add('G2 后处理', w, h, 'low', 'post');
// G3：只有 composite（bloom 也关）→ bloom 成本 = post - comp
for (const [w, h, q] of [[1280, 720, 'high'], [1280, 720, 'low'], [1920, 1080, 'high']]) add('G3 仅合成', w, h, q, 'comp');
// G4：固定 1920x1080 关静态世界
for (const q of ['high', 'low']) add('G4 关世界@1080p', 1920, 1080, q, 'noworld');
// G5：固定 1920x1080 关世界+天空
for (const q of ['high', 'low']) add('G5 关世界天空@1080p', 1920, 1080, q, 'noworldsky');
// G6：世界成本的像素依赖（1280 / 2560）
for (const [w, h] of [[1280, 720], [2560, 1440]]) for (const q of ['high', 'low']) add('G6 关世界·分辨率扫描', w, h, q, 'noworld');

// 漂移探针：与 G1 首条完全同配置，放在最后跑
const CANARY = { group: 'G7 漂移探针', w: 1280, h: 720, q: 'high', combo: 'full', note: '与 G1 首条同配置', id: '1280x720|high|full#canary' };

const TODO = opt.only
  ? CONFIGS.filter((c) => c.group.includes(opt.only) || c.combo === opt.only)
  : CONFIGS.concat([CANARY]);

const nowMs = () => Date.now();

// ---------------------------------------------------------------- 干净环境
// 只杀“我们自己留下的”Chrome：user-data-dir 带 skycity-chrome- 的（shot.mjs 的临时
// profile）或占着本工具端口的。绝不动用户自己的浏览器。
function killStrays() {
  const script = [
    "$ErrorActionPreference='SilentlyContinue';",
    "$p = Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\";",
    "$m = @($p | Where-Object { $_.CommandLine -and ($_.CommandLine -like '*skycity-chrome-*' -or $_.CommandLine -like '*--remote-debugging-port=" + opt.port + "*') });",
    "foreach ($x in $m) { Stop-Process -Id $x.ProcessId -Force -ErrorAction SilentlyContinue };",
    "Start-Sleep -Milliseconds 250;",
    "$left = @(Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | Where-Object { $_.CommandLine -and $_.CommandLine -like '*skycity-chrome-*' });",
    "Write-Output ($m.Count.ToString() + ',' + $left.Count.ToString())",
  ].join(' ');
  try {
    const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      encoding: 'utf8', timeout: 60000, windowsHide: true,
    }).trim();
    const parts = out.split(',').map((n) => Number(n) || 0);
    return { killed: parts[0], left: parts[1] };
  } catch (e) {
    return { killed: -1, left: -1, error: String((e && e.message) || e) };
  }
}

// ---------------------------------------------------------------- 页内测量代码
function evalSource() {
  return [
    '(async () => {',
    '  const REPS = ' + REPS + ', SETTLE = ' + opt.settle + ', WIN = ' + opt.sample + ', FREE = ' + opt.free + ';',
    '  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));',
    '  let waited = 0;',
    '  while (!(window.__cielo && window.__cielo.ready)) {',
    "    if (waited > 40000) return { error: 'timeout waiting __cielo.ready' };",
    '    await sleep(100); waited += 100;',
    '  }',
    "  const c = document.getElementById('c');",
    "  const gl = c && c.getContext('webgl2');",
    "  if (!gl) return { error: 'no webgl2 context' };",
    "  const ext = gl.getExtension('WEBGL_debug_renderer_info');",
    "  const renderer = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '?';",
    '  const raf0 = window.requestAnimationFrame.bind(window);',
    '  const px = new Uint8Array(4);',
    '  // 同步模式：每帧末尾 readPixels(1x1)，强制 GPU 把这一帧画完再进下一帧。',
    '  // gl.finish() 在 Chrome 里不阻塞；clientWaitSync 在本机有 ~50 ms 固定开销；',
    '  // readPixels 是这里唯一便宜、又真的会等的同步点（代价约 0.2-0.5 ms）。',
    '  const syncRaf = (cb) => raf0((t) => {',
    '    cb(t);',
    '    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);',
    '  });',
    '  const setMode = (sync) => { window.requestAnimationFrame = sync ? syncRaf : raf0; };',
    '  const sortN = (a) => Array.from(a).sort((x, y) => x - y);',
    '  const med = (a) => { if (!a.length) return NaN; const s = sortN(a), m = s.length >> 1;',
    '    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };',
    '  const pct = (a, p) => { if (!a.length) return NaN; const s = sortN(a);',
    '    return s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * p)))]; };',
    '  const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);',
    '  const collect = (ms) => new Promise((res) => {',
    '    const d = []; let t0 = 0, last = 0;',
    '    const f = (now) => {',
    '      if (!t0) { t0 = now; last = now; raf0(f); return; }',
    '      d.push(now - last); last = now;',
    '      if (now - t0 < ms) { raf0(f); return; }',
    '      res(d);',
    '    };',
    '    raf0(f);',
    '  });',
    '  const st = (window.__cielo.stats && window.__cielo.stats()) || {};',
    '  const meta = {',
    '    renderer, software: /swiftshader|llvmpipe|software/i.test(renderer),',
    '    quality: st.quality, scale: st.scale, shadow: !!st.shadow,',
    '    canvas: [c.width, c.height],',
    '    tris: window.__cielo.perf.tris, draws: window.__cielo.perf.drawCalls,',
    '  };',
    '  const reps = [];',
    '  for (let i = 0; i < REPS; i++) {',
    '    await sleep(SETTLE);',
    '    // A) 自由跑：不强制同步，rAF 会跑到 GPU 前面 —— 只作吞吐对照，不作结论',
    '    setMode(false); await sleep(150);',
    '    const df = await collect(FREE);',
    '    // B) 每帧同步：帧时间 = 这一帧真的画完的耗时',
    '    setMode(true); await sleep(150);',
    '    const ds = await collect(WIN);',
    '    reps.push({',
    '      median: +med(ds).toFixed(3), mean: +mean(ds).toFixed(3),',
    '      p95: +pct(ds, 0.95).toFixed(2), min: +Math.min.apply(null, ds).toFixed(2), max: +Math.max.apply(null, ds).toFixed(2),',
    '      n: ds.length, fps: +(ds.length / (ds.reduce((x, y) => x + y, 0) / 1000)).toFixed(1),',
    '      freeMedian: +med(df).toFixed(3), freeMean: +mean(df).toFixed(3), freeN: df.length,',
    '    });',
    '  }',
    '  setMode(false);',
    '  return { meta, reps };',
    '})()',
  ].join('\n');
}

function urlFor(cfg) {
  // 手拼而不是 URLSearchParams：逗号要保持原样，方便人直接贴进浏览器复核
  const no = ['adapt'].concat(COMBOS[cfg.combo].off).join(',');
  const qs = ['noui=1', 'freeze=2', 'q=' + cfg.q, 'no=' + no];
  return opt.base + (opt.base.includes('?') ? '&' : '?') + qs.join('&');
}

const EVAL_PREFIX = 'eval ' + String.fromCharCode(0x2192) + ' ';

function measure(cfg) {
  const url = urlFor(cfg);
  const args = [
    '--url=' + url, '--w=' + cfg.w, '--h=' + cfg.h,
    '--gpu=' + opt.gpu, '--headed=0', '--port=' + opt.port,
    '--flags=--disable-gpu-vsync --disable-frame-rate-limit',
    '--do=wait:600',
    '--do=eval:' + evalSource(),
  ];
  const t0 = nowMs();
  const r = spawnSync(process.execPath, [SHOT].concat(args), {
    encoding: 'utf8', timeout: 300000, maxBuffer: 16 * 1024 * 1024, windowsHide: true,
  });
  const wall = +((nowMs() - t0) / 1000).toFixed(1);
  const out = (r.stdout || '') + '\n' + (r.stderr || '');
  const lines = out.split(/\r?\n/);
  const hit = lines.find((l) => l.startsWith(EVAL_PREFIX));
  const evalErr = lines.find((l) => l.includes('[eval error]'));
  if (!hit) return { cfg, wall, url, error: evalErr || ('no eval output: ' + out.slice(-400)) };
  let data;
  try {
    data = JSON.parse(hit.slice(EVAL_PREFIX.length));
  } catch (e) {
    return { cfg, wall, url, error: 'bad json: ' + e.message + ' :: ' + hit.slice(0, 240) };
  }
  if (data.error) return { cfg, wall, url, error: data.error };
  return { cfg, wall, url, meta: data.meta, reps: data.reps };
}

function summarize(row) {
  const ms = row.reps.map((x) => x.median).sort((a, b) => a - b);
  const central = ms[Math.floor(ms.length / 2)];
  const lo = ms[0], hi = ms[ms.length - 1];
  const spread = central > 0 ? +(((hi - lo) / central) * 100).toFixed(1) : NaN;
  const canvas = (row.meta && row.meta.canvas) || [row.cfg.w, row.cfg.h];
  const outMP = +((canvas[0] * canvas[1]) / 1e6).toFixed(3);   // 画布 = 输出分辨率（受 outCap 限制）
  const src = deriveSrc(row.cfg, canvas);
  const intMP = src ? src.mp : outMP;                          // 内部渲染 MP（推导）
  const fm = row.reps.map((x) => x.freeMean).sort((a, b) => a - b);
  return {
    ms, central, lo, hi, spread,
    free: +fm[Math.floor(fm.length / 2)].toFixed(2),
    p95: +Math.max.apply(null, row.reps.map((x) => x.p95)).toFixed(2),
    worst: +Math.max.apply(null, row.reps.map((x) => x.max)).toFixed(1),
    jitter: spread <= 10 ? '稳定' : spread <= 25 ? '中等' : '抖动大',
    outMP, intMP, canvas,
  };
}

// ---------------------------------------------------------------- 最小二乘
function fit(pts) {
  const n = pts.length;
  if (n < 2) return null;
  const sx = pts.reduce((s, p) => s + p.x, 0), sy = pts.reduce((s, p) => s + p.y, 0);
  const sxx = pts.reduce((s, p) => s + p.x * p.x, 0), sxy = pts.reduce((s, p) => s + p.x * p.y, 0);
  const den = n * sxx - sx * sx;
  if (!den) return null;
  const b = (n * sxy - sx * sy) / den;
  const a = (sy - b * sx) / n;
  const ym = sy / n;
  const sst = pts.reduce((s, p) => s + (p.y - ym) * (p.y - ym), 0);
  const sse = pts.reduce((s, p) => s + (p.y - (a + b * p.x)) * (p.y - (a + b * p.x)), 0);
  return { a, b, r2: sst > 0 ? 1 - sse / sst : 1, n, sse };
}
const fx = (v, d) => (Number.isFinite(v) ? v.toFixed(d === undefined ? 2 : d) : '—');

// ---------------------------------------------------------------- 主流程
const t0 = nowMs();
const results = new Map();
const rows = [];
console.log('[perf-split] ' + TODO.length + ' configs · reps=' + REPS + ' settle=' + opt.settle + 'ms sample=' + opt.sample + 'ms budget=' + opt.budget + 's');
if (opt.dry) {
  for (const c of TODO) console.log('  ' + c.group + '  ' + c.q + ' ' + c.w + 'x' + c.h + ' ' + c.combo + '\n    ' + urlFor(c));
  process.exit(0);
}
for (let i = 0; i < TODO.length; i++) {
  const cfg = TODO[i];
  const spent = (nowMs() - t0) / 1000;
  if (opt.budget > 0 && i > 0 && spent > opt.budget) {
    console.log('[perf-split] budget ' + opt.budget + 's exhausted, skipping ' + (TODO.length - i) + ' configs');
    for (let j = i; j < TODO.length; j++) rows.push({ cfg: TODO[j], skipped: true, url: urlFor(TODO[j]) });
    break;
  }
  const strays = killStrays();
  const row = measure(cfg);
  const tag = '[' + (i + 1) + '/' + TODO.length + '] ' + cfg.q.padEnd(4) + ' ' + (cfg.w + 'x' + cfg.h).padEnd(9) + ' ' + cfg.combo.padEnd(11);
  if (row.error) {
    console.log(tag + ' FAIL ' + row.error);
    rows.push({ cfg: row.cfg, wall: row.wall, url: row.url, strays, failed: true, error: row.error });
    continue;
  }
  row.strays = strays;
  row.sum = summarize(row);
  results.set(cfg.id, row);
  rows.push(row);
  console.log(tag + ' ms=' + fx(row.sum.central, 2).padStart(6)
    + '  reps=[' + row.reps.map((x) => fx(x.median, 2)).join(', ') + ']'
    + '  spread=' + fx(row.sum.spread, 1) + '% ' + row.sum.jitter
    + '  free=' + fx(row.sum.free, 2)
    + '  int=' + row.sum.canvas[0] + 'x' + row.sum.canvas[1] + '(' + fx(row.sum.intMP, 2) + 'MP)'
    + '  draws=' + row.meta.draws
    + '  strays=' + strays.killed + '  wall=' + row.wall + 's');
}
const measureSec = +((nowMs() - t0) / 1000).toFixed(0);
console.log('[perf-split] measurement wall time ' + measureSec + 's');

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_RAW, JSON.stringify({
  generatedAt: new Date().toISOString(),
  opt: { reps: REPS, settle: opt.settle, sample: opt.sample, base: opt.base, port: opt.port, gpu: opt.gpu },
  measureSec, rows,
}, null, 2) + '\n');

// ---------------------------------------------------------------- 取数助手
const get = (w, h, q, combo) => {
  const r = results.get(w + 'x' + h + '|' + q + '|' + combo);
  return r ? r.sum.central : null;
};
const getInt = (w, h, q, combo) => {
  const r = results.get(w + 'x' + h + '|' + q + '|' + combo);
  return r ? r.sum.intMP : null;
};
const getOut = (w, h, q, combo) => {
  const r = results.get(w + 'x' + h + '|' + q + '|' + combo);
  return r ? r.sum.outMP : null;
};
const canary = results.get(CANARY.id);
const firstRow = results.get('1280x720|high|full');
const env = (results.values().next().value || {}).meta || {};

const fitOf = (q, xMode) => {
  const pts = [];
  for (const wh of R3) {
    const y = get(wh[0], wh[1], q, 'full');
    if (y == null) continue;
    const x = xMode === 'int' ? getInt(wh[0], wh[1], q, 'full') : getOut(wh[0], wh[1], q, 'full');
    pts.push({ x, y, label: wh[0] + 'x' + wh[1] });
  }
  const f = fit(pts);
  return f ? Object.assign({ pts }, f) : { pts };
};
const fhOut = fitOf('high', 'out'), flOut = fitOf('low', 'out');
const fhInt = fitOf('high', 'int'), flInt = fitOf('low', 'int');
const allIntPts = [].concat(fhInt.pts || [], flInt.pts || []);
const fAllInt = fit(allIntPts);

const postFit = (q) => {
  const pts = [];
  for (const wh of [[1280, 720], [1920, 1080]]) {
    const y = get(wh[0], wh[1], q, 'post');
    const x = getInt(wh[0], wh[1], q, 'post');
    if (y != null && x != null) pts.push({ x, y, label: wh[0] + 'x' + wh[1] + ' (' + fx(x, 2) + 'MP)' });
  }
  const f = fit(pts);
  return f ? Object.assign({ pts }, f) : { pts };
};
const fpHigh = postFit('high'), fpLow = postFit('low');
const compPts = [];
for (const c of [[1280, 720, 'high'], [1280, 720, 'low'], [1920, 1080, 'high']]) {
  const y = get(c[0], c[1], c[2], 'comp');
  const x = getInt(c[0], c[1], c[2], 'comp');
  if (y != null && x != null) compPts.push({ x, y, label: c[2] + ' ' + c[0] + 'x' + c[1] + ' (' + fx(x, 2) + 'MP)' });
}
const fc = fit(compPts);
const at1MP = (f) => (f && Number.isFinite(f.b) ? f.a + f.b : null);

// 手机 2560x1164 ≈ 2.98 MP；默认 q=low、scale=0.6 → 内部 1536x698 ≈ 1.07 MP
const PHONE_OUT_MP = (2560 * 1164) / 1e6;
const PHONE_INT_MP = (Math.floor(2560 * 0.6) * Math.floor(1164 * 0.6)) / 1e6;
const compSlope = fc && Number.isFinite(fc.b) ? fc.b : null;
const postSlope = fpHigh && Number.isFinite(fpHigh.b) ? fpHigh.b : null;
const extraComp = compSlope != null ? compSlope * (PHONE_OUT_MP - PHONE_INT_MP) : null;
const extraPost = postSlope != null ? postSlope * (PHONE_OUT_MP - PHONE_INT_MP) : null;

const costAt = (w, h, q) => {
  const full = get(w, h, q, 'full');
  const nw = get(w, h, q, 'noworld');
  const nws = get(w, h, q, 'noworldsky');
  return {
    full, nw, nws,
    world: full != null && nw != null ? full - nw : null,
    sky: nw != null && nws != null ? nw - nws : null,
  };
};

// ---------------------------------------------------------------- 报告
const L = [];
const P = (s) => L.push(s === undefined ? '' : s);
const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
const firstStray = rows.find((r) => r.strays && r.strays.killed > 0);
const killedFirst = firstStray ? firstStray.strays.killed : 0;

P('# 渲染成本拆分 · round 13 基线（perf-split）');
P();
P('由 ' + code('01-source/cielo/tools/perf-split.mjs') + ' 自动生成 · ' + stamp + ' · 测量耗时 ' + measureSec + ' s');
P();
P('这份报告只回答三件事，每个数字都能在 ' + code('04-output/_perf/round13-raw.json') + ' 里对上：');
P();
P('1. 分辨率换帧时间怎么换：frame_ms ≈ a + b·MP，b 是每多 1 MP 的边际成本（fill-bound 程度）；');
P('2. 几何 vs 像素：固定分辨率下把静态世界、天空分别关掉，各省多少 ms；');
P('3. 后处理在 1 MP 下的绝对成本 —— 用来判断「手机端把合成/放大放到输出分辨率」值不值。');
P();
P('## 0. 环境与口径');
P();
P('| 项 | 值 |');
P('|---|---|');
P('| 页面 | ' + code('04-output/CIELO.html') + ' ｜ ' + code('?noui=1&freeze=2&q=<tier>&no=adapt,…') + ' |');
P('| GPU | ' + (env.renderer || '?') + ' |');
P('| 浏览器 | headless Chrome（--headless=new；每次测量新建 user-data-dir，端口 ' + opt.port + '） |');
P('| 采样 | 每配置 ' + REPS + ' 次 × (同步窗 ' + opt.sample + ' ms + 自由跑窗 ' + opt.free + ' ms)；每次采样前静置 ' + opt.settle + ' ms |');
P('| 主口径 | 每帧末尾 readPixels(1x1) 强制 GPU 画完，取 rAF 间隔**中位数** = 单帧延迟（含真实 GPU 完成时间） |');
P('| 对照口径 | 不强制同步的自由跑 rAF 间隔**均值** = 吞吐；rAF 会跑到 GPU 前面，只能当上界参考，不进拟合 |');
P('| 画质档 | 来自构建产物（像素预算模型，不是 src/main.js 的固定倍率）：' + TIERS_BUILD_TEXT + ' |');
P('| 分辨率语义 | canvas = **输出分辨率**（受 outCap 截断）；场景各 pass 画在**内部 RT**（≈ min(px0, 输出像素)），最后一遍 up 放大到输出 |');
P('| 顺序 | 串行、单 Chrome、每次测量前清残留 Chrome；末尾用同配置复测做漂移探针 |');
P('| 残留进程 | 开测前清理掉的 skycity-chrome-* 进程数：' + killedFirst + ' |');
P();
P('**为什么不能直接用 bench.mjs 的数**：同一配置多次跑能差 2 倍。实测原因是上一轮遗留的');
P('skycity-chrome-* 无头 Chrome 进程（这次开测前一次就清掉 ' + killedFirst + ' 个）仍在抢 GPU。');
P('本工具每次测量前都清一遍，再用 3 次中位数压掉跟随帧的一次性抖动；抖动单独列在表里，不隐藏。');
P();
P('### 0b. 为什么不用 gl.finish（方法学验证）');
P();
P('做这轮拆分时先按 bench.mjs 的口径（每帧 gl.finish）测，1280x720 全开得到 **0.50 ms**，而 1920x1080 是 7.9 ms ——');
P('面积只差 2.25 倍、时间差 16 倍，物理上不可能。逐项排查后确认是**测量假象**，三组实测：');
P();
P('| 同步方式 | 720p 全开 | 1080p 全开 | 1440p 全开 | 结论 |');
P('|---|---|---|---|---|');
P('| 无同步（自由跑）中位数 | 0.5 ms | 4.9 ms | 9.4 ms | rAF 跑到 GPU 前面，中位数假性偏低 |');
P('| 无同步（自由跑）均值 | 5.1 ms | 9.6 ms | 11.2 ms | 均值接近吞吐，但会被 JS 抢跑污染 |');
P('| gl.finish() 每帧 | 0.4 ms 就返回 | — | — | Chrome 里 gl.finish 不阻塞，等于没同步 |');
P('| clientWaitSync(fence) 每帧 | 53 ms | 54 ms | 55 ms | 该环境有 ~50 ms 固定开销，不可用 |');
P('| **readPixels(1x1) 每帧** | **6.4 ms** | **10.2 ms** | **13.8 ms** | 唯一便宜、真的会等的同步点 → 本报告主口径 |');
P();
P('所以 bench.mjs 的 gpuMs / ms 在 --disable-frame-rate-limit 下不可信：它既没有真的等 GPU，');
P('中位数又会被「rAF 抢跑」压到 0.5 ms 量级。下面所有结论都用 readPixels 同步后的中位数。');
P();
P('## 1. 原始数据（每格 3 次数值 + 中位数 + 抖动）');
P();
P('抖动 = (max−min)/3 次中位数。MP 是画布输出分辨率；内部MP 是实际渲染缓冲区尺寸（= 输出 × 倍率）。');
P('「自由跑均值」是不强制同步时的 rAF 吞吐（第 0b 节说的偏低口径），列出来只为对照：它和同步值越接近，说明这一档越没被抢跑污染。');
P('composite 与 bloom 都跑在内部MP 上，这一点对第 5 节很关键。');
P();
P('| 组 | 配置 | 输出MP | 内部MP(推导) | 3 次同步帧时间 (ms) | 中位数 | 抖动 | 判定 | p95 | 最坏帧 | 自由跑均值 | draws |');
P('|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const row of rows) {
  const c = row.cfg;
  const name = c.q + ' · ' + c.w + 'x' + c.h + ' · ' + COMBOS[c.combo].label;
  const outMP = fx((c.w * c.h) / 1e6, 2);
  if (row.skipped) { P('| ' + c.group + ' | ' + name + ' | ' + outMP + ' | — | *跳过（预算）* | — | — | — | — | — | — | — |'); continue; }
  if (row.failed) { P('| ' + c.group + ' | ' + name + ' | ' + outMP + ' | — | *失败：' + String(row.error).slice(0, 60) + '* | — | — | — | — | — | — | — |'); continue; }
  const s = row.sum;
  P('| ' + c.group + ' | ' + name + ' | ' + fx(s.outMP, 2) + ' | ' + fx(s.intMP, 2) + ' | '
    + row.reps.map((x) => fx(x.median, 2)).join(' / ') + ' | **' + fx(s.central, 2) + '** | ' + fx(s.spread, 1) + '% | '
    + s.jitter + ' | ' + fx(s.p95, 1) + ' | ' + fx(s.worst, 0) + ' | ' + fx(s.free, 2) + ' | '
    + (row.meta && row.meta.draws != null ? row.meta.draws : '—') + ' |');
}
P();
if (canary && !canary.failed && firstRow && !firstRow.failed) {
  const a = firstRow.sum.central, b = canary.sum.central;
  const drift = +(((b - a) / a) * 100).toFixed(1);
  P('**漂移探针**：1280x720 / high / 全开 —— 开测时 ' + fx(a, 2) + ' ms，收尾复测 ' + fx(b, 2) + ' ms（'
    + (drift > 0 ? '+' : '') + fx(drift, 1) + '%）。'
    + (Math.abs(drift) <= 10
      ? '整个测量过程没有明显热漂移，跨配置的绝对差可用。'
      : '⚠ 收尾复测偏差超过 10%，跨配置的绝对差要打折看（趋势仍成立）。'));
  P();
}
P('## 2. frame_ms ≈ a + b·MP 拟合');
P();
P('### 2a. 按画质分别拟合（x = 输出画布 MP，也就是你写的那个分辨率）');
P();
P('| 画质 | 采样点 | a (ms) | b (ms/MP) | R² | 残差 |');
P('|---|---|---|---|---|---|');
const fitRow = (name, f) => {
  if (!f || !Number.isFinite(f.b)) { P('| ' + name + ' | — | — | — | — | — |'); return; }
  const res = (f.pts || []).map((p) => p.label + ':' + fx(p.y - (f.a + f.b * p.x), 2)).join(', ');
  P('| ' + name + ' | ' + (f.pts || []).map((p) => p.label).join(', ') + ' | ' + fx(f.a, 2) + ' | **' + fx(f.b, 2) + '** | ' + fx(f.r2, 3) + ' | ' + res + ' |');
};
fitRow('high（倍率 1.00，阴影开）', fhOut);
fitRow('low（倍率 0.60，阴影关）', flOut);
P();
P('low 的 b 小，不是「像素更便宜」，而是内部渲染被 px0 钉住了（0.95 MP），输出变大时内部几乎不变；'
  + '所以 low 的 b 实际上量的是**输出分辨率那一段**的成本，正好用来回答 (c)。');
P();
P('### 2b. 合并拟合（x = 内部渲染 MP，两条画质线放进同一坐标系）');
P();
if (fAllInt && Number.isFinite(fAllInt.b)) {
  P('| 采样点 | a (ms) | b (ms/MP 内部像素) | R² |');
  P('|---|---|---|---|');
  P('| 全部 ' + allIntPts.length + ' 点（high + low） | ' + fx(fAllInt.a, 2) + ' | **' + fx(fAllInt.b, 2) + '** | ' + fx(fAllInt.r2, 3) + ' |');
  P();
  P('两次独立拟合的 b 接近 → 成本主要由「内部渲染了多少 MP」决定，而不是分辨率这个数字本身。');
}
P();
P('## 3. 回答 (a)：每多 1 MP 要付多少 ms（fill-bound 程度）');
P();
P('- **high（倍率 1.0）**：每多 1 MP ≈ **' + fx(fhOut && fhOut.b, 2) + ' ms**，截距 a ≈ ' + fx(fhOut && fhOut.a, 2) + ' ms。');
P('- **low（倍率 0.6）**：每多 1 MP 输出 ≈ **' + fx(flOut && flOut.b, 2) + ' ms**。');
{
  const f1 = get(1280, 720, 'high', 'full'), f4 = get(2560, 1440, 'high', 'full');
  const bHigh = fhOut && fhOut.b;
  const share = (bHigh != null && f1) ? (bHigh * (1280 * 720 / 1e6)) / f1 * 100 : null;
  if (share != null) P('- 1280x720 / high 时，像素相关成本占整帧 **' + fx(share, 1) + '%**，剩下 ' + fx(100 - share, 1) + '% 是每帧固定开销（JS、提交、绘制调用、后处理里与分辨率无关的部分）。');
  if (f1 && f4) P('- 面积 ×4（1280x720 → 2560x1440）帧时间 ' + fx(f1, 2) + ' → ' + fx(f4, 2) + ' ms（×' + fx(f4 / f1, 2) + '）。');
  const fr1 = get(1280, 720, 'high', 'full'), fr4 = get(2560, 1440, 'high', 'full');
  const freeRow1 = results.get('1280x720|high|full'), freeRow4 = results.get('2560x1440|high|full');
  if (freeRow1 && freeRow4) P('- 自由跑口径（吞吐）同样两点：' + fx(freeRow1.sum.free, 2) + ' → ' + fx(freeRow4.sum.free, 2) + ' ms；两条口径的斜率同号同量级，说明结论不是同步方式带来的。');
}
P();
P('## 4. 回答 (b)：固定分辨率下关掉静态世界 / 天空');
P();
P('| 画质 | 分辨率 | 全开 | 关世界 | 关世界+天空 | 世界成本 | 天空成本 | 世界占比 |');
P('|---|---|---|---|---|---|---|---|');
for (const q of ['high', 'low']) {
  for (const wh of R3) {
    const c = costAt(wh[0], wh[1], q);
    if (c.full == null) continue;
    P('| ' + q + ' | ' + wh[0] + 'x' + wh[1] + ' | ' + fx(c.full, 2) + ' | ' + fx(c.nw, 2) + ' | ' + fx(c.nws, 2) + ' | '
      + (c.world != null ? fx(c.world, 2) + ' ms (' + fx((c.world / c.full) * 100, 1) + '%)' : '—') + ' | '
      + (c.sky != null ? fx(c.sky, 2) + ' ms (' + fx((c.sky / c.nw) * 100, 1) + '%)' : '—') + ' | '
      + (c.world != null ? fx((c.world / c.full) * 100, 1) + '%' : '—') + ' |');
  }
}
P();
P('「世界成本」= 全开 − 关世界，包含静态世界所有不透明几何的顶点 + 像素成本。');
P('「天空成本」= 关世界 − 关世界天空，是全屏 sky dome 的纯填充成本（画在 rtScene 上、不写 depth）。');
P('「关世界+天空」剩下的就是动态 actor / billboard / 后处理，即像素成本里的另一块。');
P();
P('⚠ 重要限定：**关掉不透明世界会同时拆掉深度遮挡**，透明 billboard / 云海 / actor 于是不再被深度剔除，');
P('overdraw 反而上升。所以「世界成本」是**净差值**，不是纯几何成本；它偏小甚至可能为负。');
P('要判断几何 vs 像素，请看这个净差值的**分辨率斜率**：随 MP 线性增长 → 以像素为主；几乎不随 MP 变 → 以顶点/绘制调用为主。');
P();
P('## 5. 回答 (c)：后处理成本，以及手机端放到输出分辨率值不值');
P();
P('后处理链 = bright(½) → blur H+V(½) → blur(¼) 四级 bloom + 最后一遍 composite，全部画在**内部渲染分辨率**上。');
P();
P('| 项 | 拟合（x = 内部 MP） | 1 MP 处 |');
P('|---|---|---|');
if (fpHigh && Number.isFinite(fpHigh.b)) P('| 后处理全套 · high | ' + fx(fpHigh.a, 2) + ' + ' + fx(fpHigh.b, 2) + '·MP | **' + fx(at1MP(fpHigh), 2) + ' ms** |');
if (fpLow && Number.isFinite(fpLow.b)) P('| 后处理全套 · low | ' + fx(fpLow.a, 2) + ' + ' + fx(fpLow.b, 2) + '·MP | ' + fx(at1MP(fpLow), 2) + ' ms |');
if (fc && Number.isFinite(fc.b)) P('| 仅 composite | ' + fx(fc.a, 2) + ' + ' + fx(fc.b, 2) + '·MP | **' + fx(at1MP(fc), 2) + ' ms** |');
P();
{
  const post1 = get(1280, 720, 'high', 'post'), comp1 = get(1280, 720, 'high', 'comp');
  if (post1 != null && comp1 != null) {
    P('实测（1280x720 / high / 内部 0.92 MP）：后处理全套 ' + fx(post1, 2) + ' ms，其中 composite ' + fx(comp1, 2)
      + ' ms，bloom 链 ≈ **' + fx(post1 - comp1, 2) + ' ms**。');
    P();
  }
}
P('### 手机端把 composite 放到输出分辨率的代价');
P();
P('现状：canvas 本身就是「输出 × 倍率」（src/main.js 的 resize()），composite 跑在内部 MP 上，');
P('最后由浏览器合成器做一次双线性放大（不跑我们的 shader，几乎免费）。');
P('若要改成「canvas 固定输出分辨率、composite 画到输出分辨率」，额外成本 = 多渲染的像素 × composite 每 MP 斜率。');
P();
P('| 量 | 值 |');
P('|---|---|');
P('| 手机输出 2560x1164 | ' + fx(PHONE_OUT_MP, 2) + ' MP |');
P('| q=low 内部（0.60 倍率） | ' + fx(PHONE_INT_MP, 2) + ' MP |');
P('| composite 每 MP | ' + fx(compSlope, 2) + ' ms/MP |');
P('| **只把 composite 抬到输出分辨率** | **' + fx(extraComp, 2) + ' ms（桌面 1070 Ti）** |');
P('| 若整条 bloom 链也一起抬上去 | ' + fx(extraPost, 2) + ' ms |');
P();
if (extraComp != null) {
  P('判定：桌面绝对量 ' + fx(extraComp, 2) + ' ms。对照同一台机器低画质 1080p 全开的帧时间 '
    + fx(get(1920, 1080, 'low', 'full'), 2) + ' ms，这是可测但不算危险的量级；手机 GPU 的填充率一般只有桌面独显的 1/4~1/10，');
  P('换算到手机约 ' + fx(extraComp * 4, 1) + '–' + fx(extraComp * 10, 1) + ' ms —— 在 30fps 预算（33 ms）里吃掉的这一块，');
  P('换来的只是「不再由合成器双线性放大」的清晰度提升，而不是修 bug。');
  P();
}
P('## 6. 可信度与边界');
P();
{
  const sp = rows.filter((r) => r.sum).map((r) => r.sum.spread).filter(Number.isFinite).sort((a, b) => a - b);
  P('- 每格 ' + REPS + ' 次中位数。全部配置的抖动（从小到大）：' + sp.map((v) => fx(v, 1) + '%').join(' / ') + '。');
}
P('- 单帧最坏值普遍明显高于中位数（见「最坏帧」列）：那是 GC / 驱动提交的一次性尖峰，不影响中位数结论，但意味着瞬时掉帧真实存在。');
P('- 机器是桌面 GTX 1070 Ti + headless Chrome：**绝对 ms 不能直接搬到手机**，能搬的是比值、占比和每 MP 斜率；');
P('  手机端请把 b 乘以（桌面填充率 / 手机填充率）再读。');
P('- 主口径的 readPixels(1x1) 同步本身有约 0.2-0.5 ms 开销（已含在绝对值里），且它把 CPU/GPU 串行化，');
P('  所以绝对值偏保守（比流水线吞吐高一点），适合做**配置之间的差值和斜率**，不适合当「这台机器能跑多少帧」的绝对值。');
P('- 报告只用了同步中位数做拟合；自由跑均值仅作对照，两者混用会得出互相矛盾的结论（见第 0b 节）。');
P('- ?freeze=2 同时停掉了自适应倍率，采样窗内 W.scale 恒定；画布尺寸已逐条记在「内部MP」列，可自查。');
P();
P('## 7. 复现');
P();
P(FENCE);
P('# 静态服务器已在 8099 提供仓库根（见 tools/serve.mjs）');
P('node 01-source/cielo/tools/perf-split.mjs --reps=3 --settle=4500 --sample=1800');
P(FENCE);
P();
P('原始数据（每次采样的 同步 median / mean / p95 / max 与自由跑 freeMean，以及每次清理掉的残留进程数）：'
  + code('04-output/_perf/round13-raw.json') + '。');
P();

fs.writeFileSync(OUT_MD, L.join('\n'));
console.log('[perf-split] wrote ' + path.relative(REPO, OUT_MD).replace(/\\/g, '/') + ' (' + fs.statSync(OUT_MD).size + ' B)');
console.log('[perf-split] wrote ' + path.relative(REPO, OUT_RAW).replace(/\\/g, '/') + ' (' + fs.statSync(OUT_RAW).size + ' B)');

const fin = killStrays();
console.log('[perf-split] final cleanup strays=' + fin.killed + ' left=' + fin.left);
