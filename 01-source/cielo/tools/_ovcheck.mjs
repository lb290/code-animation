import { buildCity } from '../src/city.js';
import { B } from '../src/geo.js';
import { mulberry32 } from '../src/math.js';
const b = new B();
const ctx = { points: [], lanterns: [], dyn: [], bbDyn: [], props: {}, triLog: {}, footprints: [] };
buildCity(b, ctx, mulberry32(20261121));
// opera envelope from opera-check
const OX0 = 67.0, OX1 = 131.0, OZ0 = -94.0, OZ1 = -22.0;
let bad = 0;
for (const f of ctx.footprints) {
  const c = Math.abs(Math.cos(f.rot)), s = Math.abs(Math.sin(f.rot));
  const hx = (c * f.w + s * f.d) / 2, hz = (s * f.w + c * f.d) / 2;
  if (f.x + hx > OX0 && f.x - hx < OX1 && f.z + hz > OZ0 && f.z - hz < OZ1) {
    bad++;
    console.log('OVERLAP building', f.w.toFixed(1) + 'x' + f.d.toFixed(1), 'at', f.x.toFixed(1) + ',' + f.z.toFixed(1), 'rot', f.rot.toFixed(2));
  }
}
console.log('buildings overlapping the opera envelope:', bad);
