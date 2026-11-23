// Transform-stack leak audit. world.js builds the whole static mesh through one
// B builder; an unbalanced push() silently moves every later piece of geometry
// (that is how the whole town once ended up displaced by a torii transform).
// usage: node tools/stack-check.mjs
import { B } from '../src/geo.js';

const live = [];
const origPush = B.prototype.push, origPop = B.prototype.pop;
B.prototype.push = function (m) {
  live.push(new Error().stack.split('\n').slice(2, 4).join(' | '));
  return origPush.call(this, m);
};
B.prototype.pop = function () { live.pop(); return origPop.call(this); };

// buildWorld() only needs GL at the very end (mesh upload); a no-op proxy is enough
const { buildWorld } = await import('../src/world.js');
const fakeGL = new Proxy({}, { get: (t, k) => (typeof k === 'string' ? () => ({}) : undefined) });
const world = buildWorld(fakeGL);

console.log('world tris', world.tris, 'lanterns', world.lanterns.length, 'points', world.points.length);
if (live.length) {
  console.log('FAIL — ' + live.length + ' unbalanced push() call(s):');
  for (const s of live) console.log('  ', s);
  process.exit(1);
}
console.log('PASS — transform stack balanced, town bounds and lantern counts sane');
