// Frame-time benchmark: drives headless Chrome (real GPU) via shot.mjs and
// samples rAF deltas at several camera views / resolutions.
// usage: node tools/bench.mjs [url] [views=0,4,7] [w=1280] [h=720] [ms=2500]
//        [gpu=default|swiftshader] [headed]
// 每帧包装一次 gl.finish，所以 gpuMs/ms 是真实整帧 GPU+提交时间；headless 需传
// --disable-gpu-vsync（本工具已加）。自适应分辨率在测量前关闭，测量期间锁倍率 1。
import { spawnSync } from 'node:child_process';

const url = process.argv[2] || 'http://127.0.0.1:8099/CELESTIA.html?noui=1';
const views = (process.argv[3] || '0,4,7').split(',').map(Number);
const w = process.argv[4] || '1280';
const h = process.argv[5] || '720';
const ms = process.argv[6] || '2500';
const gpu = process.argv[7] || 'default';
const headed = process.argv[8] === 'headed';
const port = process.env.CHROME_PORT || '9333';

const code = `(async()=>{
  const gl=__sky.gl;
  const ext=gl.getExtension('WEBGL_debug_renderer_info');
  const renderer=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'?';
  // headless does not present, so rAF alone measures CPU submission. Wrap the
  // frame callback with gl.finish() so the sample covers real GPU time.
  const raf0=window.requestAnimationFrame.bind(window);
  let gpu=0;
  // SwiftShader 下 ANGLE 的 finish 在 rAF 回调内会严重失真（实测 ~19x），
  // 软件渲染只测 rAF 间隔（ms），gpuMs 无意义。
  const SW = /swiftshader|llvmpipe/i.test(renderer);
  if (!SW) window.requestAnimationFrame=(cb)=>raf0((t)=>{const a=performance.now();cb(t);__sky.gl.finish();gpu=performance.now()-a;});
  const sample=(ms)=>new Promise(res=>{
    let n=0,t0=0,last=0,worst=0,sumGpu=0;
    function f(now){
      if(!t0){t0=now;last=now;raf0(f);return;}
      const dt=now-t0; n++;
      worst=Math.max(worst,now-last); last=now; sumGpu+=gpu;
      if(dt>ms) res({fps:+(n/(dt/1000)).toFixed(1), ms:+(dt/n).toFixed(2), gpuMs:+(sumGpu/n).toFixed(2), worst:+worst.toFixed(1)});
      else raf0(f);
    }
    raf0(f);
  });
  const out={renderer, quality:__sky.state.quality,
    size:[__sky.rt.W,__sky.rt.H,__sky.rt.RW,__sky.rt.RH],
    tris:__sky.stats.tris, views:[]};
  // 自适应分辨率在测量时关闭：否则软件渲染的慢帧会让倍率自己往下掉，前后不可比
  __sky.perf?.setAdaptive?.(false);
  __sky.perf?.setQuality?.(1);
  // warm up ~1.2s first
  await sample(1200);
  for(const v of ${JSON.stringify(views)}){
    __sky.setView(v);
    await new Promise(r=>setTimeout(r,1500));
    __sky.perf?.setQuality?.(1);
    __sky.perf?.setAdaptive?.(false);
    const r=await sample(${ms});
    out.views.push({v, ...r, stats: __sky.stats, perf: __sky.perf?.snapshot ?? null});
  }
  return out;
})()`;

const flags = headed ? [] : ['--flags=--disable-gpu-vsync --disable-frame-rate-limit'];
const r = spawnSync(process.execPath, ['tools/shot.mjs', '--url=' + url, '--w=' + w, '--h=' + h,
  `--gpu=${gpu}`, `--headed=${headed ? 1 : 0}`, `--port=${port}`, ...flags, '--do=wait:6000', '--do=eval:' + code], { stdio: 'inherit', cwd: process.cwd() });
process.exit(r.status || 0);
