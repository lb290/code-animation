
import { B } from '../src/geo.js';
import { buildGlassGreenhouse } from '../src/glass-greenhouse.js';
const b = new B();
buildGlassGreenhouse(b, { points: [], lanterns: [] });
const CZ = -25;
let n=0, ex=[];
for (let i = 0; i < b.v.length; i += 11) {
  const x=b.v[i], y=b.v[i+1], z=b.v[i+2];
  const r = Math.hypot(x, z - CZ);
  if (r > 16.4 && r < 20.8 && y > 45 && y < 57) { n++; if (ex.length<8) ex.push([x,y,z].map(v=>+v.toFixed(2))); }
}
console.log('greenhouse verts in the upper annulus (r16.4..20.8, y45..57):', n, JSON.stringify(ex));
