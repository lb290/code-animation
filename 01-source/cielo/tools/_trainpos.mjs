import { L } from '../src/layout.js';
import { catmullPts } from '../src/lib3d.js';
const raw = catmullPts(L.railLoop, 1500, true); raw.push(raw[0].slice());
const cum=[0];
for(let i=1;i<raw.length;i++) cum.push(cum[i-1]+Math.hypot(raw[i][0]-raw[i-1][0], raw[i][2]-raw[i-1][2]));
const total=cum[cum.length-1];
function at(s){ s=((s%total)+total)%total; let lo=0,hi=cum.length-1; while(hi-lo>1){const m=(lo+hi)>>1; if(cum[m]<=s) lo=m; else hi=m;} const f=(s-cum[lo])/(cum[hi]-cum[lo]||1); const a=raw[lo],b=raw[hi]; return [a[0]+(b[0]-a[0])*f, a[2]+(b[2]-a[2])*f]; }
const SPEED=8.4, S0=55-8*SPEED;
console.log('total', total.toFixed(1));
for (const fz of [6,15,30,50,70,77,90,120]) {
  const s=S0+SPEED*fz; console.log('freeze',fz,'s',s.toFixed(0),'loco',at(s).map(v=>v.toFixed(1)).join(','));
}
// find freeze where loco is on the south stretch z~200 x~60
for(let fz=60;fz<120;fz+=1){const p=at(S0+SPEED*fz); if(Math.abs(p[1]-200)<3 && p[0]>30 && p[0]<80) {console.log('south train freeze',fz,p.map(v=>v.toFixed(1))); break;}}
for(let fz=0;fz<200;fz+=1){const p=at(S0+SPEED*fz); if(Math.abs(p[1]+146)<3 && p[0]>30 && p[0]<80) {console.log('station train freeze',fz,p.map(v=>v.toFixed(1))); break;}}
