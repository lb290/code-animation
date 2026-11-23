// Find malformed triangles in the fish mesh (edge length outliers, non-finite).
import { buildFish, FISH_STRIDE } from '../src/fish.js';
for (const lod of ['high','low','tiny']) {
  const g = buildFish(7, lod);
  const V = g.verts;
  const check = (idx, label) => {
    let worst = 0, worstTri = null, bad = 0, nan = 0;
    const vx = (i) => [V[i*FISH_STRIDE], V[i*FISH_STRIDE+1], V[i*FISH_STRIDE+2]];
    const d = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
    for (let t=0;t<idx.length;t+=3) {
      const a = vx(idx[t]), b = vx(idx[t+1]), c = vx(idx[t+2]);
      for (const p of [a,b,c]) if (!Number.isFinite(p[0])||!Number.isFinite(p[1])||!Number.isFinite(p[2])) nan++;
      const e = Math.max(d(a,b), d(b,c), d(c,a));
      if (e > 0.4) bad++;
      if (e > worst) { worst = e; worstTri = [idx[t],idx[t+1],idx[t+2], e.toFixed(3)]; }
    }
    console.log(lod, label, 'tris', idx.length/3, 'nanVerts', nan, 'tris>0.4', bad, 'worst', worstTri && worstTri.join(','));
  };
  check(g.bodyIndices, 'body');
  check(g.finIndices, 'fin');
  console.log(lod, 'total tris', g.tris, 'verts', g.vertCount);
}
