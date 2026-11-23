
import { mulberry32 } from '../src/math.js';
import { B } from '../src/geo.js';
import { buildPalaceBase } from '../src/palace-base.js';
const b = new B(); buildPalaceBase(b, { points: [], lanterns: [] }, mulberry32(1));
const s = new Set();
for (let i = 0; i < b.v.length; i += 11) { const z = b.v[i+2]; if (z > 123.0) s.add([+b.v[i].toFixed(1), +b.v[i+1].toFixed(1), +z.toFixed(2)].join(' ')); }
console.log([...s].slice(0,10).join('\n'));
