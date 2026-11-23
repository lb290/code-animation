// Terrain height of the floating-island top surfaces. The island tops in
// world.js are built from radial rings t = (rad/r)^(1/0.9) with an fbm2 wobble
// and a downward sag toward the rim; this helper reproduces that exactly so the
// town, lamp posts and banners can sit ON the ground instead of floating above it.
import { fbm2 } from './math.js';

export function islandY(px, pz, cx, cz, r, seed) {
  const dx = px - cx, dz = pz - cz;
  const rad = Math.hypot(dx, dz);
  const t = Math.pow(Math.min(1, rad / r), 1 / 0.9);
  const a = Math.atan2(dz, dx);
  const n = fbm2(Math.cos(a) * 1.7 + seed * 0.7, Math.sin(a) * 1.7 + seed * 0.3, 3);
  return (n - 0.5) * 1.3 * (1 - t * 0.5) - Math.pow(t, 3) * 2.2;
}

// Main island (ISLANDS[0]: centre 0,0, radius 62, seed 1, top y = 0).
export function mainIslandY(px, pz) {
  return islandY(px, pz, 0, 0, 62, 1);
}
