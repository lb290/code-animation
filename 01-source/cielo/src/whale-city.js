import { box as bx, cylinder as cyl, sphere as sph, lathe as lth, rockBlob as rb, bar3 as b3, archWall as aw, mixc as mx, mulc as ml, rgb, grid as gd } from './geo.js';
import { MT, disc as dsc, extrudeXY as exy } from './lib3d.js';
import { buildBuilding as bld, spire as spr, setWinCollect } from './arch.js';
import { C } from './palette.js';
import { TAU } from './math.js';
const GLASS = mx(C.glassDeep, C.slate, 0.42);
const GLASS_LIT = rgb('#ffd08a');
const TRUNK = rgb('#7a6046');
const COBBLE = mx(C.stoneWarm, C.stoneDark, 0.42);
const COBBLE2 = mx(C.stone, C.stonePale, 0.5);
const PAVE = mx(C.stonePale, C.marble, 0.5);
const ROCK = mx(C.stoneDark, C.stoneCool, 0.35);
const MOSS = mx(C.leafDark, C.leaf, 0.35);
const SLATE = mx(C.slate, C.slateDark, 0.3);
const SLATE_HI = mx(C.slateLight, C.slate, 0.4);
const SKYSTONE = mx(C.stoneCool, C.stone, 0.35);
const MS = [0.0, 0.10], MM = [0.0, 0.20], MSL = [0.0, 0.30], MG = MT.gold;
const MGL = [0.16, 0.90], MW = [0.72, 0.12], MGLOW = [0.95, 0.0];
const MLEAF = MT.leaf, MIRON = [0.04, 0.40], MCLOTH = MT.cloth, MMAT = MT.matte;
const STONE = C.stone, PALE = C.stonePale, WARMST = C.stoneWarm, MARB = C.marble;
const GOLD = C.gold, GOLDHI = C.goldBright;
const PI = Math.PI, HALF = PI / 2, SIDES = [-1, 1], NZ = [0, 0, 1];

// ---------------------------------------------------------------- night lights
// Round 6: warm window / lamp positions in CITY-SPACE (real metres, y = city
// ground). whale.js lifts them onto the whale and draws them as billboards.
// size: 1 = an ordinary window/lamp, ~2 = a big landmark light (gate, rose window).
export const WHALE_CITY_LIGHTS = [];
const WL = (x, y, z, size) => {
  if (WHALE_CITY_LIGHTS.length < 160) WHALE_CITY_LIGHTS.push({ p: [x, y, z], size: size || 1 });
};
const WALL_H = 7.4, WALL_T = 3.0, GATE_HALF = 13;
const PERIM = [
	[-50.0, 117.5], [-26.0, 118.0], [-13.0, 117.6], [13.0, 117.6],
	[26.0, 118.0], [50.0, 117.5], [58.5, 108.0], [61.5, 96.0],
	[61.5, 40.0], [61.5, -40.0], [61.5, -96.0], [58.5, -108.0],
	[50.0, -117.5], [25.0, -118.0], [0.0, -117.6], [-25.0, -118.0],
	[-50.0, -117.5], [-58.5, -108.0], [-61.5, -96.0], [-61.5, -40.0],
	[-61.5, 40.0], [-61.5, 96.0], [-58.5, 108.0],
];
const GATE_SEG = 2;
const STREETS = [
	{ x0: -7.5, x1: 7.5, z0: 98, z1: 110 },
	{ x0: -57, x1: 57, z0: -6, z1: 2 },
	{ x0: -57, x1: 57, z0: -64, z1: -54 },
	{ x0: -46, x1: -36, z0: -108, z1: 66 },
	{ x0: 36, x1: 46, z0: -108, z1: 66 },
];
const PLAZA = { x0: -18, x1: 18, z0: 66, z1: 98, fz: 82 };
const TR = (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
function RM(a) {
	const c = Math.cos(a), s = Math.sin(a);
	return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
}
function put(b, x, y, z, fn) { b.push(TR(x, y, z)); fn(); b.pop(); }
function putR(b, x, y, z, a, fn) { b.push(TR(x, y, z)); if (a) b.push(RM(a)); fn(); if (a) b.pop(); b.pop(); }
const UP = [0, 1, 0];
function quadUp(b, x0, z0, x1, z1, y, col, mat = MS) {
	b.quad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], col, mat, UP);
}
function lancet(b, w, h, gc, opt = {}) {
	const hw = w / 2, sh = h * 0.68, z = opt.z || 0, N = NZ;
	const gm = opt.gm || MGL, fm = opt.fm || MS, fc = opt.fc || PALE;
	b.quad([-hw, 0, z], [hw, 0, z], [hw, sh, z], [-hw, sh, z], gc, gm, N);
	b.tri([-hw, sh, z], [hw, sh, z], [0, h, z], gc, gm, N, N, N);
	if (opt.frame !== false) {
		b.quad([-hw - 0.2, -0.22, z + 0.02], [hw + 0.2, -0.22, z + 0.02], [hw + 0.2, 0.04, z + 0.02], [-hw - 0.2, 0.04, z + 0.02], fc, fm, N);
		b.quad([-hw - 0.2, 0, z + 0.02], [-hw, 0, z + 0.02], [-hw, sh, z + 0.02], [-hw - 0.2, sh, z + 0.02], fc, fm, N);
		b.quad([hw, 0, z + 0.02], [hw + 0.2, 0, z + 0.02], [hw + 0.2, sh, z + 0.02], [hw, sh, z + 0.02], fc, fm, N);
	}
}
function discZ(b, cx, cy, z, r, col, mat, seg = 12) {
	const N = NZ;
	for (let i = 0; i < seg; i++) {
		const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
		b.tri([cx, cy, z], [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, z], [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, z], col, mat, N, N, N);
	}
}
function ringZ(b, cx, cy, z, r0, r1, col, mat, seg = 16) {
	const N = NZ;
	for (let i = 0; i < seg; i++) {
		const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
		const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
		b.quad([cx + c0 * r0, cy + s0 * r0, z], [cx + c0 * r1, cy + s0 * r1, z], [cx + c1 * r1, cy + s1 * r1, z], [cx + c1 * r0, cy + s1 * r0, z], col, mat, N);
	}
}
function spike(b, x, y0, z, r, h, col, seg = 4) {
	put(b, x, y0, z, () => cyl(b, seg, r, 0.05, h, col, MS, { y0: 0, caps: false }));
}
function banner(b, x, y, z, w, h, col, a = 0) {
	putR(b, x, y, z, a, () => {
		b.quad([-w / 2, 0, 0], [w / 2, 0, 0], [w / 2, -h, 0], [-w / 2, -h, 0], col, MCLOTH, NZ);
		b.quad([w / 2, 0, 0], [-w / 2, 0, 0], [-w / 2, -h, 0], [w / 2, -h, 0], ml(col, 0.9), MCLOTH, [0, 0, -1]);
	});
}
function terrain(b, rng) {
	const cz = [0, -0.05, 0];
	const n = PERIM.length;
	for (let i = 0; i < n; i++) {
		const p = PERIM[i], q = PERIM[(i + 1) % n];
		const col = ml(mx(COBBLE, C.stoneDark, (i % 3) * 0.12), 0.9);
		b.tri(cz, [p[0], -0.05, p[1]], [q[0], -0.05, q[1]], col, MS, UP, UP, UP);
	}
	STREETS.forEach((s, i) => {
		quadUp(b, s.x0, s.z0, s.x1, s.z1, 0.015 + i * 0.004, mx(COBBLE, COBBLE2, 0.25 + (i % 3) * 0.2));
		const cxm = (s.x0 + s.x1) / 2, czm = (s.z0 + s.z1) / 2;
		if (s.x1 - s.x0 > s.z1 - s.z0) quadUp(b, s.x0 + 0.5, czm - 0.7, s.x1 - 0.5, czm + 0.7, 0.03 + i * 0.004, ml(COBBLE2, 1.04));
		else quadUp(b, cxm - 0.7, s.z0 + 0.5, cxm + 0.7, s.z1 - 0.5, 0.03 + i * 0.004, ml(COBBLE2, 1.04));
	});
	quadUp(b, PLAZA.x0, PLAZA.z0, PLAZA.x1, PLAZA.z1, 0.035, mx(PAVE, COBBLE2, 0.35));
	dsc(b, 17.4, 30, PAVE, MM, { y: 0.045, center: [0, 0, PLAZA.fz] });
	dsc(b, 12.6, 26, mx(PAVE, C.stoneCool, 0.18), MM, { y: 0.055, center: [0, 0, PLAZA.fz] });
	dsc(b, 7.2, 22, mx(PAVE, C.stonePale, 0.5), MM, { y: 0.065, center: [0, 0, PLAZA.fz] });
	for (let i = 0; i < 8; i++) {
		const a = (i / 8) * TAU + PI / 8;
		putR(b, Math.cos(a) * 10.2, 0.07, PLAZA.fz + Math.sin(a) * 10.2, -a, () => bx(b, 5.2, 0.02, 0.7, mx(C.stoneCool, PALE, 0.4), MS));
	}
	for (const g of [
		{ x: 0, z: -29, w: 33, d: 20 }, { x: -22, z: 112.2, w: 15, d: 4.2 },
		{ x: 22, z: 112.2, w: 15, d: 4.2 }, { x: 0, z: -83, w: 31, d: 33 },
		{ x: 27, z: -84, w: 13, d: 31 },
	]) {
		bx(b, g.w + 0.7, 0.55, g.d + 0.7, mx(C.stoneDark, C.stoneCool, 0.3), MS, { topCol: mx(COBBLE2, MARB, 0.3) });
		put(b, g.x, 0.44, g.z, () => gd(b, g.w, g.d, Math.max(3, Math.round(g.w / 4)), Math.max(2, Math.round(g.d / 4)),
			(x, z) => 0.1 + 0.12 * Math.sin(x * 1.7 + z * 2.3),
			(x, z) => mx(C.lawn, (x * 0.7 + z * 0.3) % 2 < 1 ? C.leafLight : C.leaf, 0.3 + 0.25 * Math.sin(x + z)), MLEAF));
	}
}
function underside(b, rng) {
	const n = PERIM.length, inward = [];
	for (let i = 0; i < n; i++) {
		const p = PERIM[(i + n - 1) % n], q = PERIM[(i + 1) % n];
		const dx = q[0] - p[0], dz = q[1] - p[1], L = Math.hypot(dx, dz) || 1;
		inward.push([-(-dz / L), -(dx / L)]);
	}
	for (let i = 0; i < n; i++) {
		const p = PERIM[(i + n - 1) % n], q = PERIM[(i + 1) % n];
		const dx = q[0] - p[0], dz = q[1] - p[1], L = Math.hypot(dx, dz) || 1;
		inward[i] = [dz / L, -dx / L];
	}
	for (let i = 0; i < n; i++) {
		if (i === GATE_SEG) continue;
		const p0 = PERIM[i], p1 = PERIM[(i + 1) % n];
		const dx = p1[0] - p0[0], dz = p1[1] - p0[1], L = Math.hypot(dx, dz) || 1;
		const ox = -dz / L, oz = dx / L;
		const a = [p0[0], -0.25, p0[1]], bq = [p1[0], -0.25, p1[1]];
		const c = [p1[0] + ox * 1.1, -6.2, p1[1] + oz * 1.1], d = [p0[0] + ox * 1.1, -6.2, p0[1] + oz * 1.1];
		const N = [ox * 0.86, 0.5, oz * 0.86];
		b.quad(a, bq, c, d, mx(ROCK, C.stoneDark, 0.35), MS, N);
	}
	const layers = [[-6.1, 1.4, 0], [-8.2, 3.4, 0], [-10.2, 6.2, 0]];
	const rings = [PERIM.map((p, i) => [p[0] + inward[i][0] * 1.1, -6.1, p[1] + inward[i][1] * 1.1])];
	for (const [y, inset] of layers) {
		rings.push(PERIM.map((p, i) => [
			p[0] + inward[i][0] * inset + (rng() - 0.5) * 1.4,
			y + (rng() - 0.5) * 0.9,
			p[1] + inward[i][1] * inset + (rng() - 0.5) * 1.4,
		]));
	}
	for (let r = 0; r < rings.length - 1; r++) {
		const A = rings[r], Bq = rings[r + 1];
		for (let i = 0; i < n; i++) {
			const j = (i + 1) % n;
			const a = A[i], b2 = A[j], c2 = Bq[j], d2 = Bq[i];
			const e1 = [b2[0] - a[0], b2[1] - a[1], b2[2] - a[2]];
			const e2 = [c2[0] - a[0], c2[1] - a[1], c2[2] - a[2]];
			let N = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
			const cxm = (a[0] + c2[0]) / 2, czm = (a[2] + c2[2]) / 2;
			if (N[0] * cxm + N[2] * czm < 0) N = [-N[0], -N[1], -N[2]];
			const L = Math.hypot(N[0], N[1], N[2]) || 1;
			N = [N[0] / L, N[1] / L, N[2] / L];
			const t = r / (rings.length - 1);
			const col = mx(mx(ROCK, SKYSTONE, 0.45), mx(ROCK, rgb('#2c3a52'), 0.55), t);
			b.quad(a, b2, c2, d2, ml(col, 0.9 + 0.1 * Math.cos(i * 1.7)), MS, N);
		}
	}
	const bottom = rings[rings.length - 1];
	const cy = -10.8;
	for (let i = 0; i < n; i++) {
		const p = bottom[i], q = bottom[(i + 1) % n];
		b.tri([0, cy, 0], [q[0], q[1], q[2]], [p[0], p[1], p[2]], mx(ROCK, rgb('#1f2a3e'), 0.5), MS, [0, -1, 0], [0, -1, 0], [0, -1, 0]);
	}
	const spots = [[-54, 90], [54, 90], [-56, 20], [56, 20], [-55, -70], [55, -70], [-42, -110], [42, -110], [0, -110.5], [-28, 112.5], [28, 112.5]];
	for (const [x, z] of spots) {
		put(b, x, 1.2, z, () => rb(b, 2.6 + rng() * 2.2, 4 + rng() * 3.4, 3 + rng() * 50, mx(ROCK, C.stoneCool, 0.3), mx(ROCK, rgb('#26334a'), 0.4), { rings: 5, seg: 9, amp: 0.5, spikes: 3 }));
		put(b, x, 1.4, z, () => dsc(b, 2.6 + rng() * 1.2, 9, MOSS, MLEAF, { y: 0.05 }));
	}
	for (let i = 0; i < n; i += 2) {
		if (i === GATE_SEG) continue;
		const p0 = PERIM[i], p1 = PERIM[(i + 1) % n];
		const dx = p1[0] - p0[0], dz = p1[1] - p0[1], L = Math.hypot(dx, dz) || 1;
		const ox = -dz / L, oz = dx / L;
		const t = 0.25 + rng() * 0.5;
		const cx = p0[0] + dx * t + ox * 0.12, cz = p0[1] + dz * t + oz * 0.12;
		const vh = 4 + rng() * 3.4, vw = 1.4 + rng() * 2.2;
		b.quad([cx - vw / 2, 0.2, cz], [cx + vw / 2, 0.2, cz], [cx + vw / 2, 0.2 - vh, cz], [cx - vw / 2, 0.2 - vh, cz], mx(MOSS, C.vine, 0.4), MLEAF, [ox, 0.1, oz]);
	}
}
function wallRun(b, p0, p1) {
	const dx = p1[0] - p0[0], dz = p1[1] - p0[1], L = Math.hypot(dx, dz);
	const ux = dx / L, uz = dz / L, nx = -uz, nz = ux;
	b.push([ux, 0, uz, 0, 0, 1, 0, 0, nx, 0, nz, 0, p0[0], 0, p0[1], 1]);
	const N = NZ, NI = [0, 0, -1], NU = [0, 1, 0];
	const H = WALL_H, t = WALL_T;
	const ys = [-0.4, 2.3, 4.9, H];
	for (let k = 0; k < 3; k++) {
		const col = ml(mx(WARMST, SKYSTONE, 0.12 + k * 0.1), 0.94 + k * 0.03);
		b.quad([0, ys[k], 0], [L, ys[k], 0], [L, ys[k + 1], 0], [0, ys[k + 1], 0], col, MS, N);
	}
	b.quad([0, H, 0], [L, H, 0], [L, H, -t], [0, H, -t], ml(COBBLE2, 0.92), MS, NU);
	b.quad([L, 0, -t], [0, 0, -t], [0, H, -t], [L, H, -t], ml(WARMST, 0.86), MS, NI);
	b.quad([0, H, -t + 0.1], [0, H + 1.0, -t + 0.1], [L, H + 1.0, -t + 0.1], [L, H, -t + 0.1], ml(WARMST, 0.9), MS, N);
	const nm = Math.max(1, Math.round(L / 3.2));
	for (let i = 0; i < nm; i++) {
		const cx = (i + 0.5) * L / nm, hw = 0.85;
		b.quad([cx - hw, H, 0.02], [cx + hw, H, 0.02], [cx + hw, H + 1.3, 0.02], [cx - hw, H + 1.3, 0.02], ml(WARMST, 1.02), MS, N);
		b.quad([cx - hw, H + 1.3, 0.02], [cx + hw, H + 1.3, 0.02], [cx + hw, H + 1.3, -0.75], [cx - hw, H + 1.3, -0.75], mx(PALE, WARMST, 0.5), MS, NU);
	}
	const nb = Math.max(0, Math.round(L / 21));
	for (let i = 0; i < nb; i++) {
		const cx = (i + 0.5) * L / nb;
		put(b, cx, 0, 0.9, () => {
			bx(b, 1.7, 5.2, 2.0, mx(WARMST, SKYSTONE, 0.2), MS, { topCol: mx(PALE, WARMST, 0.4) });
			put(b, 0, 2.6, 0, () => cyl(b, 4, 1.15, 0.05, 1.3, SLATE, MS, { y0: 0, caps: false }));
		});
	}
	if (L > 6) {
		for (let v = 0; v < 2; v++) {
			if ((p0[0] * 3 + p0[1] * 7 + v * 11) % 5 < 1.6) continue;
			const cx = (0.2 + 0.6 * ((v + 1) / 3)) * L, w = 1.2 + ((p0[0] + v) % 2) * 1.2;
			b.quad([cx - w / 2, H - 0.1, 0.06], [cx + w / 2, H - 0.1, 0.06], [cx + w / 2, H - 2.4, 0.06], [cx - w / 2, H - 2.4, 0.06], mx(MOSS, C.vine, 0.45), MLEAF, N);
		}
	}
	b.pop();
}
function wallTower(b, x, z, rng, s = 1, roofCol = SLATE) {
	const h = (12.5 + rng() * 3.5) * s;
	put(b, x, 0, z, () => {
		put(b, 0, 1.0, 0, () => bx(b, 8.2 * s, 2.0, 8.2 * s, mx(WARMST, SKYSTONE, 0.25), MS));
		put(b, 0, h / 2, 0, () => bx(b, 6.6 * s, h, 6.6 * s, mx(STONE, WARMST, 0.4), MS, { topCol: ml(PALE, 1.02) }));
		for (const sx of SIDES) for (const sz of SIDES) put(b, sx * 2.8 * s, h / 2, sz * 2.8 * s, () => bx(b, 1.5 * s, h, 1.5 * s, PALE, MS));
		for (const y of [h * 0.42, h - 1.3]) put(b, 0, y, 0, () => bx(b, 7.3 * s, 0.7, 7.3 * s, ml(PALE, 1.02), MM));
		for (let i = 0; i < 4; i++) {
			putR(b, 0, h, 0, (i * PI) / 2, () => {
				for (const cx of [-2.2 * s, 0, 2.2 * s]) put(b, cx, 0.6, 3.0 * s, () => bx(b, 1.3 * s, 1.2, 0.7 * s, PALE, MS));
			});
		}
		put(b, 0, h + 1.2, 0, () => cyl(b, 4, 4.9 * s, 0.1, 5.6 * s, roofCol, MSL, { y0: 0, caps: false }));
		put(b, 0, h + 1.2 + 5.6 * s, 0, () => bx(b, 0.18, 1.2, 0.18, GOLDHI, MG));
		for (const y of [h * 0.3, h * 0.55]) {
			putR(b, 0, y, 0, 0, () => bx(b, 0.4, 1.3, 0.4, mx(C.iron, C.slateDark, 0.4), MMAT));
		}
	});
	// night: a lit window band on the two faces the city can see
	WL(x, h * 0.62, z + 3.5 * s, 1.0);
	WL(x, h * 0.42, z - 3.5 * s, 1.0);
}
function cityWall(b, rng) {
	const n = PERIM.length;
	for (let i = 0; i < n; i++) {
		if (i === GATE_SEG) continue;
		wallRun(b, PERIM[i], PERIM[(i + 1) % n]);
	}
	const towers = [
		[-52, 110, 1], [52, 110, 1], [57.6, 58, 0.95], [-57.6, 58, 0.95],
		[57.6, -58, 0.95], [-57.6, -58, 0.95], [49, -112, 1], [-49, -112, 1], [0, -113.4, 1.05],
	];
	for (const [x, z, s] of towers) wallTower(b, x, z, rng, s);
}
function gatehouse(b, rng) {
	put(b, 0, 0, 114.1, () => aw(b, GATE_HALF * 2, 15, 5.0, 7.0, mx(WARMST, STONE, 0.45), MS, 14));
	put(b, 0, 16.2, 114.1, () => bx(b, 24, 2.4, 6.2, mx(STONE, WARMST, 0.5), MS, { topCol: ml(PALE, 1.03) }));
	for (let i = 0; i < 7; i++) {
		const cx = -10.5 + i * 3.5;
		put(b, cx, 17.95, 116.6, () => bx(b, 1.5, 1.5, 0.9, PALE, MS));
	}
	for (const sx of SIDES) {
		const tx = sx * 10.6;
		put(b, tx, 0, 113.2, () => {
			put(b, 0, 1.1, 0, () => bx(b, 9.4, 2.2, 9.4, mx(WARMST, SKYSTONE, 0.2), MS));
			put(b, 0, 13, 0, () => bx(b, 7.6, 24, 7.6, mx(STONE, WARMST, 0.35), MS));
			for (const cx of SIDES) for (const cz of SIDES) put(b, cx * 3.3, 13, cz * 3.3, () => bx(b, 1.6, 24, 1.6, PALE, MS));
			for (const y of [10, 22]) put(b, 0, y, 0, () => bx(b, 8.4, 0.9, 8.4, ml(PALE, 1.02), MM));
			put(b, 0, 25, 0, () => cyl(b, 4, 5.6, 0.12, 7.5, SLATE, MSL, { y0: 0, caps: false }));
			put(b, 0, 32.5, 0, () => bx(b, 0.2, 1.5, 0.2, GOLDHI, MG));
			for (const a of [0, PI, HALF, -HALF]) {
				putR(b, 0, 16.5, 0, a, () => {
					b.quad([-1.6, 0, 4.1], [1.6, 0, 4.1], [1.6, 5.5, 4.1], [-1.6, 5.5, 4.1], mx(GLASS_LIT, C.cityGlow, 0.4), MW, NZ);
				});
			}
		});
	}
	for (const x of [-3.4, -1.7, 0, 1.7, 3.4]) put(b, x, 4.2, 115.2, () => bx(b, 0.16, 8.4, 0.16, mx(C.iron, C.slateDark, 0.35), MIRON));
	for (const y of [2.0, 5.6, 8.6]) put(b, 0, y, 115.25, () => bx(b, 9.4, 0.14, 0.14, mx(C.iron, C.slateDark, 0.35), MIRON));
	b.quad([-4.2, 0.1, 112.4], [4.2, 0.1, 112.4], [4.2, 9.2, 112.4], [-4.2, 9.2, 112.4], mx(C.cityGlow, C.stonePale, 0.45), MW, [0, 0, -1]);
	for (let i = 0; i < 3; i++) put(b, 0, 0.15 + i * 0.15, 110.4 - i * 1.1, () => bx(b, 15 - i * 1.6, 0.3, 1.4, ml(PALE, 1.0 - i * 0.02), MS));
	for (const sx of SIDES) banner(b, sx * 7.2, 13.6, 117.62, 2.2, 5.2, sx < 0 ? C.ribbonBlue : mx(C.bloomRed, C.gold, 0.25));
	put(b, 0, 13.2, 117.66, () => {
		discZ(b, 0, 0, 0, 2.0, mx(C.slateDark, GLASS, 0.35), MGL, 12);
		ringZ(b, 0, 0, 0.05, 2.0, 2.5, GOLD, MG, 14);
		for (let i = 0; i < 8; i++) {
			const a = (i / 8) * TAU;
			b.quad([Math.cos(a) * 1.2 - 0.16, Math.sin(a) * 1.2, 0.07], [Math.cos(a) * 1.2 + 0.16, Math.sin(a) * 1.2, 0.07], [Math.cos(a) * 1.95 + 0.16, Math.sin(a) * 1.95, 0.07], [Math.cos(a) * 1.95 - 0.16, Math.sin(a) * 1.95, 0.07], GOLDHI, MG, NZ);
		}
	});
	for (const sx of SIDES) {
		put(b, sx * 14.6, 0, 110.8, () => {
			cyl(b, 4, 0.16, 0.1, 10, mx(C.iron, C.stoneDark, 0.3), MIRON, { y0: 0, caps: false });
			put(b, 0, 9.4, 0, () => bx(b, 2.6, 1.4, 0.1, sx < 0 ? C.ballSky : C.bloomPink, MCLOTH));
			put(b, 0, 10.9, 0, () => sph(b, 0.24, GOLDHI, MG, { rings: 3, seg: 6, jitter: 0.02 }));
		});
	}
	// night: gate lanterns, the lit gate mouth and the flanking-tower windows
	for (const sx of SIDES) {
		WL(sx * 10.6, 16.5, 117.4, 1.0);
		WL(sx * 10.6, 16.5, 108.9, 1.0);
		WL(sx * 14.6, 9.4, 110.8, 1.3);
		WL(sx * 7.2, 12.5, 117.7, 1.0);
	}
	WL(0, 6.6, 112.5, 1.5);
}
function archBand(b, hw, ys, yTop, e, z, steps, col, mat) {
	const N = NZ;
	const pt = (t, sx, w, h) => {
		const u = 1 - t;
		const x = sx * w * (u * u + 2 * u * t * 0.45);
		const y = ys + (h - ys) * (2 * u * t * 0.82 + t * t);
		return [x, y];
	};
	for (const sx of SIDES) {
		for (let i = 0; i < steps; i++) {
			const t0 = i / steps, t1 = (i + 1) / steps;
			const p0 = pt(t0, sx, hw, yTop), p1 = pt(t1, sx, hw, yTop);
			const q0 = pt(t0, sx, hw + e, yTop), q1 = pt(t1, sx, hw + e, yTop);
			b.quad([q0[0], q0[1], z], [p0[0], p0[1], z], [p1[0], p1[1], z], [q1[0], q1[1], z], col, mat, N);
		}
	}
}
function roseWindow(b, x, y, z, r) {
	discZ(b, x, y, z, r, mx(GLASS, C.glassDeep, 0.3), MGL, 16);
	ringZ(b, x, y, z + 0.04, r * 0.93, r * 1.16, PALE, MM, 16);
	ringZ(b, x, y, z + 0.08, r * 0.6, r * 0.68, GOLD, MG, 14);
	for (let i = 0; i < 10; i++) {
		const a = (i / 10) * TAU + 0.12;
		const c = Math.cos(a), s = Math.sin(a), hw = 0.19;
		b.quad([x + c * r * 0.3 - s * hw, y + s * r * 0.3 + c * hw, z + 0.07],
			[x + c * r * 0.3 + s * hw, y + s * r * 0.3 - c * hw, z + 0.07],
			[x + c * r * 0.88 + s * hw, y + s * r * 0.88 - c * hw, z + 0.07],
			[x + c * r * 0.88 - s * hw, y + s * r * 0.88 + c * hw, z + 0.07], GOLD, MG, NZ);
	}
	discZ(b, x, y, z + 0.1, r * 0.16, GOLDHI, MGLOW, 10);
}
function portal(b, x, z, hw, ht) {
	put(b, x, 0.7, z, () => {
		const ys = ht * 0.55;
		const dark = mx(C.slateDark, C.iron, 0.25);
		b.quad([-hw, 0, 0], [hw, 0, 0], [hw, ys, 0], [-hw, ys, 0], dark, MMAT, NZ);
		b.tri([-hw, ys, 0], [hw, ys, 0], [0, ht, 0], dark, MMAT, NZ, NZ, NZ);
		b.quad([-hw * 0.62, 0.02, 0.06], [hw * 0.62, 0.02, 0.06], [hw * 0.62, 2.6, 0.06], [-hw * 0.62, 2.6, 0.06], mx(C.cityGlow, C.stonePale, 0.3), MW, NZ);
		for (let o = 0; o < 2; o++) {
			const hw2 = hw * (1 + o * 0.14), ys2 = ys * (1 - o * 0.02);
			archBand(b, hw2, ys2, ht * (1 + o * 0.03), 0.55, 0.16 + o * 0.1, 4, o ? PALE : MARB, MS);
			for (const sx of SIDES) {
				b.quad([sx * hw2, 0, 0.18 + o * 0.1], [sx * (hw2 + 0.55), 0, 0.18 + o * 0.1], [sx * (hw2 + 0.55), ys2, 0.18 + o * 0.1], [sx * hw2, ys2, 0.18 + o * 0.1], o ? PALE : MARB, MS, NZ);
			}
		}
		b.quad([-0.22, 0, 0.3], [0.22, 0, 0.3], [0.22, 5.4, 0.3], [-0.22, 5.4, 0.3], MARB, MM, NZ);
		discZ(b, 0, 3.8, 0.34, 0.14, GOLDHI, MG, 8);
	});
}
function cathedral(b, rng) {
	put(b, 0, 0, 41, () => {
		const x = 0;
		for (let i = 0; i < 3; i++) put(b, 0, 0.28 + i * 0.18, 25.4 + i * 1.25, () => bx(b, 26 + i * 2, 0.56 - i * 0.12, 1.5, ml(PALE, 1.0 - i * 0.02), MS));
		put(b, 0, 20, 20, () => bx(b, 34, 40, 8, mx(PALE, WARMST, 0.35), MS, { topCol: ml(PALE, 1.04) }));
		for (const sx of SIDES) put(b, sx * 16.1, 20, 23.6, () => bx(b, 2.6, 40, 1.6, MARB, MS));
		for (const y of [12.5, 26.5, 38.5]) put(b, 0, y, 20, () => bx(b, 35, 0.9, 8.8, ml(PALE, 1.02), MM));
		for (const sx of SIDES) put(b, sx * 8.6, 20, 23.8, () => bx(b, 1.7, 40, 1.2, MARB, MS));
		put(b, 0, 40, 23.5, () => exy(b, [[-9, 0], [9, 0], [0, 10]], 2.0, PALE, MS, { z0: -1.0 }));
	put(b, 0, 40, 24.6, () => { b3(b, [-9, 0.1, 0], [0, 10.1, 0], 0.5, 0.5, mx(GOLD, PALE, 0.25), MG); b3(b, [9, 0.1, 0], [0, 10.1, 0], 0.5, 0.5, mx(GOLD, PALE, 0.25), MG); for (let i = 1; i < 5; i++) { const tt = i / 5; for (const sx of SIDES) put(b, sx * 9 * (1 - tt), 10 * tt, 0.1, () => bx(b, 0.42, 0.62, 0.42, GOLDHI, MG)); } });
		put(b, 0, 50, 24.62, () => { bx(b, 0.5, 4.0, 0.5, GOLD, MG); put(b, 0, 0.8, 0, () => bx(b, 2.8, 0.45, 0.45, GOLDHI, MG)); });
		roseWindow(b, 0, 30.5, 24.15, 6.3);
		portal(b, 0, 24.2, 4.6, 13.2);
		
		put(b, 0, 17.4, 24.4, () => bx(b, 34, 1.5, 0.9, MARB, MS));
		for (let i = -5; i <= 5; i++) {
			put(b, i * 2.7, 18.9, 24.5, () => bx(b, 0.9, 2.4, 0.5, ml(PALE, 0.96), MS));
		}
		for (const sx of SIDES) {
			put(b, sx * 13.0, 0, 21, () => {
				put(b, 0, 22, 0, () => bx(b, 10, 44, 10, mx(STONE, PALE, 0.35), MS));
				for (const cx of SIDES) for (const cz of SIDES) put(b, cx * 3.7, 22, cz * 3.7, () => bx(b, 1.8, 44, 1.8, PALE, MS));
				for (const y of [15, 30, 42]) put(b, 0, y, 0, () => bx(b, 10.8, 0.85, 10.8, ml(PALE, 1.03), MM));
				for (let f = 0; f < 4; f++) {
					const a = (f * PI) / 2;
					putR(b, 0, 0, 0, a, () => {
						portal(b, 0, 5.2, 1.9, 7.6);
			for (const cx of [-2.0, 2.0]) put(b, cx, 20, 5.08, () => lancet(b, 2.0, 9.5, GLASS));
						put(b, 0, 16.5, 5.02, () => lancet(b, 3.2, 6.0, GLASS, { frame: false }));
					});
				}
				put(b, 0, 34.5, 5.06, () => {
					discZ(b, 0, 0, 0, 2.6, mx(GLASS, C.slateDark, 0.4), MGL, 14);
					ringZ(b, 0, 0, 0.04, 2.35, 2.9, GOLD, MG, 16);
					for (let i = 0; i < 12; i++) {
						const a2 = (i / 12) * TAU;
						b.quad([Math.cos(a2) * 1.85 - 0.1, Math.sin(a2) * 1.85, 0.07], [Math.cos(a2) * 1.85 + 0.1, Math.sin(a2) * 1.85, 0.07], [Math.cos(a2) * 2.2 + 0.1, Math.sin(a2) * 2.2, 0.07], [Math.cos(a2) * 2.2 - 0.1, Math.sin(a2) * 2.2, 0.07], GOLDHI, MG, NZ);
					}
					discZ(b, 0, 0, 0.1, 0.3, GOLDHI, MGLOW, 8);
				});
				put(b, 0, 50, 0, () => bx(b, 8.4, 12, 8.4, mx(PALE, STONE, 0.4), MS));
				for (const cx of SIDES) for (const cz of SIDES) put(b, cx * 3.2, 50, cz * 3.2, () => bx(b, 1.4, 12, 1.4, MARB, MS));
				for (let f = 0; f < 4; f++) {
					putR(b, 0, 0, 0, (f * PI) / 2, () => {
						for (const cx of [-1.6, 1.6]) put(b, cx, 46, 4.28, () => lancet(b, 1.4, 7.0, mx(GLASS_LIT, C.cityGlow, 0.45), { frame: false, gm: MW }));
					});
				}
				put(b, 0, 56.4, 0, () => bx(b, 11, 1.2, 11, ml(PALE, 1.04), MM));
				for (const cx of SIDES) for (const cz of SIDES) spike(b, cx * 3.9, 57.0, cz * 3.9, 1.1, 4.6, SLATE);
				put(b, 0, 57.0, 0, () => spr(b, 5.0, 14.2, SLATE));
				put(b, 0, 71.6, 0, () => { bx(b, 0.34, 3.0, 0.34, GOLDHI, MG); put(b, 0, 0.7, 0, () => bx(b, 1.9, 0.36, 0.36, GOLD, MG)); });
				banner(b, sx * 3.2, 45, 5.2, 2.0, 6.5, sx < 0 ? mx(C.bloomRed, C.gold, 0.2) : C.ribbonBlue);
			});
		}
		put(b, 0, 17.5, -3, () => bx(b, 18, 35, 42, mx(PALE, WARMST, 0.4), MS));
		put(b, 0, 37.5, -3, () => bx(b, 18.4, 5, 42, mx(PALE, STONE, 0.4), MS, { topCol: ml(PALE, 1.05) }));
		for (const sx of SIDES) {
			put(b, sx * 12.75, 10, -4, () => bx(b, 7.5, 20, 40, mx(PALE, STONE, 0.45), MS, { topCol: ml(PALE, 1.03) }));
			put(b, sx * 16.4, 20.7, -4, () => bx(b, 0.8, 1.4, 40, MARB, MS));
			const a = [sx * 9, 27, -24], b2 = [sx * 16.5, 20, -24], c2 = [sx * 16.5, 20, 16], d2 = [sx * 9, 27, 16];
			b.quad(a, b2, c2, d2, SLATE, MSL, [sx * 0.68, 0.73, 0]);
		}
		const ry = 47;
		b.quad([-9.2, 40, -24], [-9.2, 40, 18], [0, ry, 18], [0, ry, -24], SLATE, MSL, [-0.61, 0.79, 0]);
		b.quad([9.2, 40, 18], [9.2, 40, -24], [0, ry, -24], [0, ry, 18], SLATE_HI, MSL, [0.61, 0.79, 0]);
		b.tri([-9.2, 40, 18], [9.2, 40, 18], [0, ry, 18], PALE, MS, NZ, NZ, NZ);
		b.tri([9.2, 40, -24], [-9.2, 40, -24], [0, ry, -24], PALE, MS, [0, 0, -1], [0, 0, -1], [0, 0, -1]);
		b3(b, [0, ry + 0.15, 18], [0, ry + 0.15, -24], 0.5, 0.42, mx(GOLD, C.slateDark, 0.3), MG);
		for (const sx of SIDES) {
			for (let i = 0; i < 8; i++) {
				const z = -21 + i * 5.1;
				putR(b, sx * 9.25, 0, z, sx * HALF, () => lancet(b, 1.8, 3.4, GLASS, { frame: false }));
				putR(b, sx * 16.55, 0, -21 + i * 5.4, sx * HALF, () => lancet(b, 2.3, 10.5, GLASS));
			}
			for (let i = 0; i < 3; i++) spike(b, sx * 9.7, 40.4, -18 + i * 12, 0.8, 3.6, SLATE);
		}
		for (const sx of SIDES) {
			for (let i = 0; i < 5; i++) {
				const z = -20 + i * 8;
				put(b, sx * 19.6, 0, z, () => {
					put(b, 0, 15, 0, () => bx(b, 2.6, 30, 2.6, mx(PALE, STONE, 0.4), MS, { topCol: ml(PALE, 1.05) }));
					spike(b, 0, 30.1, 0, 1.1, 4.4, SLATE);
				});
				b3(b, [sx * 19.4, 28.2, z], [sx * 9.4, 36.6, z], 1.4, 1.7, PALE, MS);
				b3(b, [sx * 19.3, 21.2, z], [sx * 9.4, 29.6, z], 0.9, 1.0, mx(PALE, STONE, 0.35), MS);
			}
		}
		put(b, 0, 17, -24, () => cyl(b, 12, 9, 9, 34, mx(PALE, STONE, 0.45), MS, { y0: 0, caps: false }));
		put(b, 0, 34, -24, () => cyl(b, 12, 9.4, 0.3, 8.6, SLATE, MSL, { y0: 0, caps: true }));
		put(b, 0, 34.1, -24, () => cyl(b, 12, 9.7, 9.7, 0.7, MARB, MS, { y0: 0, caps: false }));
		for (let i = 0; i < 5; i++) {
			const a = PI * 0.55 + i * 0.42;
			putR(b, Math.cos(a) * 9.02, 0, -24 + Math.sin(a) * 9.02, HALF - a, () => lancet(b, 2.2, 10, GLASS));
		}
		put(b, 0, 49, -4, () => bx(b, 12, 16, 12, mx(PALE, WARMST, 0.3), MS));
		for (const cx of SIDES) for (const cz of SIDES) put(b, cx * 5.2, 49, -4 + cz * 5.2, () => bx(b, 1.8, 16, 1.8, MARB, MS));
		for (const sz of SIDES) {
			putR(b, 0, 50, -4 + sz * 6.05, sz > 0 ? 0 : PI, () => {
				discZ(b, 0, 0, 0, 2.6, mx(GLASS, C.slateDark, 0.35), MGL, 14);
				ringZ(b, 0, 0, 0.05, 2.3, 2.9, GOLD, MG, 14);
			});
		}
		for (const cx of SIDES) for (const cz of SIDES) spike(b, cx * 5.4, 57.2, -4 + cz * 5.4, 1.0, 4.2, SLATE);
		put(b, 0, 57.2, -4, () => spr(b, 3.4, 12.4, SLATE));
		put(b, 0, 70.0, -4, () => { bx(b, 0.3, 2.6, 0.3, GOLDHI, MG); put(b, 0, 0.6, 0, () => bx(b, 1.6, 0.3, 0.3, GOLD, MG)); });
		// night: rose window, portal, tower lancets (the cathedral sits at city z=41)
		WL(0, 30.5, 65.2, 2.4);
		WL(0, 6.0, 65.5, 1.6);
		for (const sx of SIDES) {
			WL(sx * 13, 34.5, 67.1, 1.2);
			WL(sx * 13, 46.0, 67.1, 1.0);
			WL(sx * 19.6, 22.0, 62.0, 1.0);
		}
	});
}
function warmWindow(b, o, lx, lz, y, w, h) {
	const c = Math.cos(o.rot), s = Math.sin(o.rot);
	const P = (px, pz) => [o.x + c * px + s * pz, o.z - s * px + c * pz];
	const p0 = P(lx - w / 2, lz), p1 = P(lx + w / 2, lz);
	const n = [s, 0, c];
	b.quad([p0[0], y, p0[1]], [p1[0], y, p1[1]], [p1[0], y + h, p1[1]], [p0[0], y + h, p0[1]], mx(GLASS_LIT, C.cityGlow, 0.4), MW, n);
	WL((p0[0] + p1[0]) / 2, y + h / 2, (p0[1] + p1[1]) / 2, 1.0);
}
function blocks(b, rng, placements, issues) {
	const ctx = { lanterns: [], points: [] };
	const H = [
		[-14.5,102,1,9,10,3,1,'balcony',.42],[14.5,102,3,9,10,3,1,'balcony',.38],
		[-25.5,70.5,1,15,11,3,2,'tower',.55],[-25.5,88,1,13,11,3,1,'tower',.35],
		[25.5,70.5,3,15,11,3,2,'balcony',.5],[25.5,88.5,3,12,11,3,0,'tower',.3],
		[-27,18,1,13,9,3,1,'balcony',.45],[-27,39,1,14,9,3,0,'mansard',.5],[-27,54,1,11,9,2,0,'flat',.32],
		[27,17,3,12,9,3,1,'balcony',.4],[27,38,3,15,9,3,0,'mansard',.52],[27,54,3,11,9,2,0,'flat',.34],
		[-12.5,-13,0,10,11,3,1,'tower',.4],[0,-13,0,10,11,3,0,'flat',.55],[12.5,-13,0,10,11,3,0,'balcony',.3],
		[-8,-46.5,2,13,12,3,0,'mansard',.45],[8,-46.5,2,13,12,3,0,'tower',.5],
		[-52,30,1,15,9,3,1,'tower',.42],[-52,56,1,13,9,2,0,'mansard',.36],[-52,-20,1,14,9,3,0,'mansard',.48],
		[52,28,3,15,9,3,0,'balcony',.4],[52,56,3,13,9,2,0,'tower',.33],[52,-22,3,14,9,3,0,'mansard',.5],
		[29,-20,1,13,11,3,0,'flat',.38],[-29,-22,3,13,11,2,0,'mansard',.44],
	];
	for (const [x, z, q, w, d, floors, detail, roof, tone] of H) {
		const rot = q * HALF, swap = q % 2 === 1;
		const hx = (swap ? d : w) / 2 + 1.05, hz = (swap ? w : d) / 2 + 1.05;
		for (const p of placements) if (Math.abs(p.x - x) < p.hx + hx && Math.abs(p.z - z) < p.hz + hz) issues.push('house overlap ' + x + ',' + z);
		for (const s of STREETS) if (x + hx > s.x0 && x - hx < s.x1 && z + hz > s.z0 && z - hz < s.z1) issues.push('house in street ' + x + ',' + z);
		if (Math.abs(x) < 18 + hx && z < 67 + hz && z > 5 - hz) issues.push('house hits cathedral ' + x + ',' + z);
		placements.push({ x, z, hx, hz, detail });
		bld(b, ctx, rng, { x, z, rot, w, d, floors, detail, roof, tone, sides: detail >= 2 ? 3 : 2, slate: (Math.abs(x) + Math.abs(z)) % 7 === 0 ? mx(C.copper, SLATE_HI, 0.35) : undefined });
		const zf = d / 2 + 0.58;
		warmWindow(b, { x, z, rot, w, d }, -w * 0.2, zf, 2.4, 1.6, 2.2);
		if (detail >= 1) warmWindow(b, { x, z, rot, w, d }, w * 0.22, zf, 5.6, 1.4, 2.0);
	}
}

function fountain(b, x, z, s = 1) {
	put(b, x, 0, z, () => {
		cyl(b, 8, 5.0 * s, 5.0 * s, 0.85, mx(PALE, MARB, 0.4), MM, { y0: 0.05, caps: false });
		cyl(b, 8, 5.35 * s, 5.35 * s, 0.35, PALE, MS, { y0: 0.85, caps: false });
		dsc(b, 4.8 * s, 16, mx(C.water, C.waterDeep, 0.25), MGL, { y: 0.72, center: [0, 0, 0] });
		put(b, 0, 0.75, 0, () => lth(b, [[1.6, 0], [1.15, 0.7], [0.6, 1.5], [0.75, 2.1]], 8, MARB, MM));
		put(b, 0, 2.8, 0, () => lth(b, [[0.2, 0], [1.9, 0.35], [2.15, 0.75], [1.9, 0.95]], 10, PALE, MM));
		dsc(b, 1.75, 12, mx(C.water, C.glass, 0.4), MGL, { y: 3.62 });
		put(b, 0, 3.6, 0, () => { cyl(b, 6, 0.3, 0.18, 1.9, MARB, MM, { y0: 0, caps: false }); });
		put(b, 0, 5.6, 0, () => sph(b, 0.42, GOLDHI, MG, { rings: 3, seg: 8, jitter: 0.02 }));
		put(b, 0, 6.0, 0, () => { bx(b, 0.14, 1.4, 0.14, GOLD, MG); });
	});
}
function shed(b, x, z, w, d, h, q, col, roofCol) {
	putR(b, x, 0, z, q * HALF, () => {
		bx(b, w, h, d, col, MS, { topCol: ml(col, 1.05) });
		const hw = w / 2 + 0.3, hd = d / 2 + 0.3, rh = Math.min(3, w * 0.24), ry = h;
		b.quad([-hw, ry, hd], [hw, ry, hd], [hw, ry + rh, 0], [-hw, ry + rh, 0], roofCol, MSL, [0, 0.76, 0.65]);
		b.quad([hw, ry, -hd], [-hw, ry, -hd], [-hw, ry + rh, 0], [hw, ry + rh, 0], ml(roofCol, 0.9), MSL, [0, 0.76, -0.65]);
		b.tri([hw, ry, hd], [hw, ry, -hd], [hw, ry + rh, 0], col, MS, [1, 0, 0], [1, 0, 0], [1, 0, 0]);
		b.tri([-hw, ry, -hd], [-hw, ry, hd], [-hw, ry + rh, 0], col, MS, [-1, 0, 0], [-1, 0, 0], [-1, 0, 0]);
		b.quad([-w * 0.3, 0, d / 2 + 0.03], [w * 0.05, 0, d / 2 + 0.03], [w * 0.05, h * 0.55, d / 2 + 0.03], [-w * 0.3, h * 0.55, d / 2 + 0.03], mx(GLASS_LIT, C.cityGlow, 0.35), MW, NZ);
		b.quad([w * 0.2, h * 0.3, d / 2 + 0.03], [w * 0.42, h * 0.3, d / 2 + 0.03], [w * 0.42, h * 0.7, d / 2 + 0.03], [w * 0.2, h * 0.7, d / 2 + 0.03], GLASS, MGL, NZ);
		const yaw = q * HALF, cyw = Math.cos(yaw), syw = Math.sin(yaw);
		const wlz = d / 2 + 0.25;
		WL(x + cyw * (-w * 0.125) - syw * wlz, h * 0.28, z + syw * (-w * 0.125) + cyw * wlz, 1.0);
		WL(x + cyw * (w * 0.31) - syw * wlz, h * 0.5, z + syw * (w * 0.31) + cyw * wlz, 1.0);
	});
}
function lotWall(b, x0, z0, x1, z1, h, col) {
	const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = Math.abs(x1 - x0), d = Math.abs(z1 - z0);
	put(b, cx, h / 2, z0, () => bx(b, w, h, 0.5, col, MS, { topCol: ml(col, 1.06) }));
	put(b, cx, h / 2, z1, () => bx(b, w, h, 0.5, col, MS, { topCol: ml(col, 1.06) }));
	put(b, x0, h / 2, cz, () => bx(b, 0.5, h, d, col, MS, { topCol: ml(col, 1.06) }));
	put(b, x1, h / 2, cz, () => bx(b, 0.5, h, d, col, MS, { topCol: ml(col, 1.06) }));
}
function fillers(b, rng, placements, issues) {
	const F = [
		[-47, 88, 11, 8, 6, 0], [-47, 72, 9, 8, 5, 0], [-30, 104, 10, 7, 5, 1], [-44, 104, 10, 7, 6, 0],
		[47, 88, 11, 8, 6, 0], [47, 72, 9, 8, 5, 0], [30, 104, 10, 7, 5, 1], [44, 104, 10, 7, 6, 0],
		[-40, 111.4, 8, 3.4, 4, 0], [40, 111.4, 8, 3.4, 4, 0],
		[52, -74, 8, 8, 5, 0], [52, -90, 8, 8, 5, 0], [52, -104, 8, 7, 4, 0],
		[-52, -74, 8, 8, 5, 0], [-52, -90, 8, 8, 5, 0], [-52, -104, 8, 7, 4, 0],
		[-27, -102, 10, 7, 5, 0], [27, -102, 10, 7, 5, 0], [-52, -42, 8, 8, 5, 0],
	];
	const cols = [mx(PALE, WARMST, 0.4), mx(PALE, STONE, 0.35), mx(WARMST, SKYSTONE, 0.3)];
	const roofs = [SLATE, mx(C.copper, SLATE_HI, 0.3), SLATE_HI, mx(C.slateDark, C.slate, 0.5)];
	for (let i = 0; i < F.length; i++) {
		const [x, z, w, d, h, q] = F[i], swap = q % 2 === 1;
		const hx = (swap ? d : w) / 2 + 1.1, hz = (swap ? w : d) / 2 + 1.1;
		for (const pt of placements) if (Math.abs(pt.x - x) < pt.hx + hx && Math.abs(pt.z - z) < pt.hz + hz) issues.push('shed overlap ' + x + ',' + z);
		for (const st of STREETS) if (x + hx > st.x0 && x - hx < st.x1 && z + hz > st.z0 && z - hz < st.z1) issues.push('shed in street ' + x + ',' + z);
		placements.push({ x, z, hx, hz, detail: -1 });
		shed(b, x, z, w, d, h, q, cols[i % 3], roofs[i % 4]);
	}
	// walled kitchen gardens in the two front corners + a low arcade by the plaza
	for (const sx of SIDES) {
		lotWall(b, sx * 56, 68, sx * 34, 106, 1.7, mx(PALE, WARMST, 0.45));
		for (let i = 0; i < 4; i++) put(b, sx * (37 + (i % 2) * 7), 0.75, 76 + (i >> 1) * 12, () => bx(b, 5, 1.5, 1.4, C.leafDark, MLEAF, { topCol: C.leaf }));
	}
	for (const sx of SIDES) {
		for (let i = 0; i < 6; i++) put(b, sx * 19.2, 0, 69.5 + i * 5, () => {
			bx(b, 0.75, 4.8, 0.75, PALE, MM);
			bx(b, 1.1, 0.35, 1.1, MARB, MS);
		});
		put(b, sx * 19.2, 5.0, 82, () => bx(b, 0.9, 0.7, 25, PALE, MS, { topCol: ml(MARB, 1.02) }));
	}
}
function plazaProps(b, rng) {
	fountain(b, 0, PLAZA.fz, 1.0);
	for (const sx of SIDES) {
		put(b, sx * 15.2, 0, 95.2, () => {
			bx(b, 1.5, 1.2, 1.5, PALE, MS);
			put(b, 0, 1.2, 0, () => cyl(b, 4, 0.95, 0.34, 5.4, mx(PALE, C.stoneCool, 0.25), MM, { y0: 0, caps: true }));
			put(b, 0, 6.6, 0, () => sph(b, 0.3, GOLDHI, MG, { rings: 3, seg: 6, jitter: 0.02 }));
		});
	}
	const stallCols = [C.ballCream, C.ballSky, C.ballPink, C.ballMint];
	for (let i = 0; i < 4; i++) {
		const sx = i < 2 ? -1 : 1, z = 72 + (i % 2) * 12;
		put(b, sx * 14.6, 0, z, () => {
			for (const px of [-1.3, 1.3]) for (const pz of [-1.1, 1.1]) put(b, px, 1.2, pz, () => bx(b, 0.16, 2.4, 0.16, TRUNK, MS));
			put(b, 0, 1.15, 0, () => bx(b, 2.6, 0.3, 2.0, mx(C.stoneWarm, TRUNK, 0.4), MS));
			put(b, 0, 2.75, 0, () => bx(b, 3.2, 0.14, 2.6, stallCols[i], MCLOTH, { topCol: ml(stallCols[i], 1.08) }));
			for (const px of [-0.7, 0.3]) put(b, px, 1.5, 0.2, () => bx(b, 0.7, 0.4, 0.9, mx(C.bloomRed, C.ballCoral, 0.4), MMAT));
		});
	}
	const lamps = [[-8.8, 100], [8.8, 100], [-8.8, 106], [8.8, 106], [-16.4, 68.5], [16.4, 68.5], [-16.4, 95.5], [16.4, 95.5], [-16.4, 82], [16.4, 82], [-4, 64], [4, 64]];
	for (const [x, z] of lamps) {
		put(b, x, 0, z, () => {
			cyl(b, 4, 0.14, 0.1, 3.5, mx(C.iron, C.stoneDark, 0.35), MIRON, { y0: 0, caps: false });
			bx(b, 0.5, 0.16, 0.5, mx(C.iron, C.slateDark, 0.4), MIRON);
			put(b, 0, 3.55, 0, () => bx(b, 0.42, 0.62, 0.42, GLASS_LIT, MW));
		});
		WL(x, 3.95, z, 1.2);
	}
	for (const [x, z, col] of [[-17.2, 66.5, C.bloomRed], [17.2, 66.5, C.ribbonBlue], [-17.2, 97.2, C.ballMint], [17.2, 97.2, C.ballCoral]]) {
		banner(b, x, 7.4, z, 1.6, 4.6, col);
		put(b, x, 0, z, () => cyl(b, 4, 0.13, 0.09, 7.4, mx(C.iron, C.stoneDark, 0.3), MIRON, { y0: 0, caps: false }));
	}
}
function tree(b, x, z, rng, s = 1) {
	put(b, x, 0, z, () => {
		cyl(b, 5, 0.36 * s, 0.22 * s, 3.6 * s, TRUNK, MS, { y0: 0, caps: false });
		const cols = [C.leaf, C.leafLight, C.leafDark];
		const n = 2 + (rng() < 0.55 ? 1 : 0);
		for (let i = 0; i < n; i++) {
			const r = 1.75 * s * (1 - i * 0.2);
			put(b, (rng() - 0.5) * 1.5 * s, (3.4 + i * 1.35) * s, (rng() - 0.5) * 1.5 * s, () =>
				sph(b, r, cols[(i + Math.abs((x * 7 + z * 3) | 0)) % 3], MLEAF, { rings: 3, seg: 6, jitter: 0.22, seed: i + 2 }));
		}
	});
}
function greenery(b, rng) {
	const trees = [
		[-9, -24], [8, -31], [-2, -37], [11, -21],
		[-24, 112.2], [-16, 111.4], [24, 112.2], [16, 111.4],
		[-9, -74], [6, -80], [-3, -92], [10, -95],
		[27, -72], [22, -88], [31, -94],
		[-13.5, 68.4], [13.5, 68.4], [-42, 82], [42, 82], [0, -60],
	];
	for (const [x, z] of trees) tree(b, x, z, rng, 0.85 + rng() * 0.35);
	const beds = [[-13, 70.5, 3.4, 1.6, C.bloomPink], [13, 70.5, 3.4, 1.6, C.bloomYellow], [-13, 94, 3.2, 1.4, C.bloomBlue], [13, 94, 3.2, 1.4, C.bloomRed], [0, -36.5, 6, 1.5, C.bloomPink], [-6, -20.5, 4, 1.3, C.bloomYellow]];
	for (const [x, z, w, d, col] of beds) {
		bx(b, w, 0.5, d, mx(C.stoneDark, PALE, 0.35), MS, { topCol: ml(col, 1.0) });
		put(b, x, 0, z, () => {
			for (let i = 0; i < 3; i++) quadUp(b, -w / 2 + 0.2 + i * (w / 3), -d / 2 + 0.2, -w / 2 + 0.2 + (i + 1) * (w / 3) - 0.15, d / 2 - 0.2, 0.52, ml(col, 0.9 + i * 0.06), MLEAF);
		});
	}
	for (const sx of SIDES) {
		for (let i = 0; i < 5; i++) {
			put(b, sx * 20.5, 0, 12 + i * 10, () => {
				bx(b, 1.4, 1.5, 4.4, C.leafDark, MLEAF, { topCol: C.leaf });
			});
		}
	}
}
export function buildBackCity(b, rng, opts = {}) {
	const start = b.triCount;
	const sections = [];
	const placements = [];
	const issues = [];
	const sec = (name, fn) => {
		const a = b.triCount;
		b.note(name);
		fn();
		sections.push({ name, tris: b.triCount - a });
	};
	const ox = opts.x || 0, oz = opts.z || 0, orot = opts.rot || 0;
	const wrapped = !!(ox || oz || orot);
	if (wrapped) {
		b.push(TR(ox, 0, oz));
		if (orot) b.push(RM(orot));
	}
	// the whale-city windows live in the whale's local space, so arch.js must not
	// add them to the (world-space) city night-window layer; they get their own
	// billboard light layer in whale.js instead.
	WHALE_CITY_LIGHTS.length = 0;
	setWinCollect(false);
	try {
		sec('terrain', () => terrain(b, rng));
		sec('underside', () => underside(b, rng));
		sec('wall', () => cityWall(b, rng));
		sec('gate', () => gatehouse(b, rng));
		sec('cathedral', () => cathedral(b, rng));
		sec('blocks', () => blocks(b, rng, placements, issues));
	sec('details', () => fillers(b, rng, placements, issues));
		sec('plaza', () => plazaProps(b, rng));
		sec('greenery', () => greenery(b, rng));
	} finally {
		setWinCollect(true);
		if (wrapped) {
			if (orot) b.pop();
			b.pop();
		}
	}
	return { tris: b.triCount - start, sections, houses: placements.length, issues, placements };
}
