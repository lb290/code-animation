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
  const gl=__cielo.world && __cielo.world.mesh && __cielo.world.mesh.gl ? __cielo.world.mesh.gl : null;
  const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '?';
  const raf0=window.requestAnimationFrame.bind(window);
  let gpu=0;
  const SW = /swiftshader|llvmpipe/i.test(renderer);
  if (!SW && gl) window.requestAnimationFrame=(cb)=>raf0((t)=>{const a=performance.now();cb(t);gl.finish();gpu=performance.now()-a;});
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
  const worlds = __cielo.world;
  const out={renderer, tris: worlds ? worlds.tris : null, ctxPoints: worlds && worlds.ctx ? worlds.ctx.points.length : null, views:[]};
  await sample(1200);
  for(const v of ${JSON.stringify(views)}){
    __cielo.setView(v);
    await new Promise(r=>setTimeout(r,1500));
    const r=await sample(${ms});
    out.views.push({v, ...r, perf: {cpuMs:+__cielo.perf.cpuMs.toFixed(2), drawCalls:__cielo.perf.drawCalls, tris:__cielo.perf.tris}});
  }
  return out;
})()`;

const flags = headed ? [] : ['--flags=--disable-gpu-vsync --disable-frame-rate-limit'];
const r = spawnSync(process.execPath, ['tools/shot.mjs', '--url=' + url, '--w=' + w, '--h=' + h,
  `--gpu=${gpu}`, `--headed=${headed ? 1 : 0}`, `--port=${port}`, ...flags, '--do=wait:6000', '--do=eval:' + code], { stdio: 'inherit', cwd: process.cwd() });
process.exit(r.status || 0);
