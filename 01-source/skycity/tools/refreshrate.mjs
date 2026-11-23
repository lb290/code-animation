// Measure the display/compositor refresh rate a *headed* Chrome sees.
// usage: node tools/refreshrate.mjs [seconds=3]
import { spawnSync } from 'node:child_process';
const secs = Number(process.argv[2] || 3);
const code = `(async()=>{
  const sample=(ms)=>new Promise(res=>{
    let n=0,t0=0,last=0;const dts=[];
    function f(now){ if(!t0){t0=now;last=now;requestAnimationFrame(f);return;}
      const dt=now-t0;n++;dts.push(+(now-last).toFixed(1));last=now;
      if(dt>ms){dts.sort((a,b)=>a-b);res({fps:+(n/(dt/1000)).toFixed(1), median:+dts[dts.length>>1].toFixed(1), p10:+dts[Math.floor(dts.length*0.1)].toFixed(1), p90:+dts[Math.floor(dts.length*0.9)].toFixed(1), n});}
      else requestAnimationFrame(f);} requestAnimationFrame(f);});
  return {screen:[screen.width,screen.height,devicePixelRatio], ...await sample(${secs*1000})};
})()`;
const r = spawnSync(process.execPath, ['tools/shot.mjs', '--url=data:text/html,<body style=background:%23123></body>',
  '--w=1440', '--h=900', '--headed=1', '--gpu=default', '--do=wait:2500', '--do=eval:' + code],
  { stdio: 'inherit', cwd: process.cwd() });
process.exit(r.status || 0);
