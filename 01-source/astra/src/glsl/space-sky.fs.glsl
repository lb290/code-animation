in vec2 vUV;
// ASTRA · 太空天空（星鲸环）
// 环带巨行星 + 星云（云/丝/暗尘三层结构） + 银河带 + 三层星场 + 亮星星芒 + 远处恒星。
// 全解析计算、无贴图；只着色"没被几何挡住"的像素（与 CIELO 相同的 sky.vs z=1.0 契约）。
uniform vec3 uCamPos;
uniform vec3 uRight; uniform vec3 uUp; uniform vec3 uFwd;
uniform float uTanFov; uniform float uAspect;
uniform float uTime;
uniform vec3 uStarColor; uniform float uStarInt;
uniform vec3 uVoidHigh; uniform vec3 uVoidLow; uniform float uVoidInt;
uniform vec3 uNebA; uniform vec3 uNebB; uniform vec3 uNebC; uniform vec3 uNebD; uniform float uNebInt;
uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uSunInt;
uniform vec3 uPlanetDir; uniform vec3 uPlanetAxis; uniform float uPlanetAng;
uniform vec3 uPlanetColA; uniform vec3 uPlanetColB; uniform vec3 uPlanetAtm;
uniform float uPlanetInt; uniform float uPlanetGlow;
uniform vec3 uRingColA; uniform vec3 uRingColB; uniform float uRingInt; uniform float uRingTilt;
uniform vec3 uMoonDir; uniform float uMoonAng; uniform vec3 uMoonCol;
out vec4 oCol;

// ---------------------------------------------------------------- 星场
// 三维格点星场：直接在方向上取 3D 格胞，而不是等距圆柱投影 —— 后者在天顶/天底附近
// 会把格胞压缩成竖条纹（第十五轮集成截图里就是那些"天空幕布纹"）。
float starLayer(vec3 dir, float scale, float thr, float seed, float sizeMul, out float bright, out float halo){
  vec3 g = dir * scale;
  vec3 cell = floor(g);
  vec3 f = fract(g);
  bright = 0.0; halo = 0.0;
  float pick = hash13(cell + seed);
  if (pick < thr) return 0.0;
  vec3 c = vec3(hash13(cell + seed + 11.3), hash13(cell + seed + 19.1), hash13(cell + seed + 27.7)) * 0.70 + 0.15;
  float rad = (0.11 + 0.16 * hash13(cell + seed + 2.9)) * sizeMul;
  float d = length(f - c);
  float core = pow(max(0.0, 1.0 - d / rad), 4.2);
  halo = pow(max(0.0, 1.0 - d / (rad * 3.2)), 3.0) * 0.15;
  bright = 0.35 + 0.85 * hash13(cell + seed + 7.7);
  return core * bright;
}

// 少数亮星：细而长的四芒星芒（用屏幕垂直/水平方向做星芒，避免格点方向限制）
vec3 brightStars(vec3 dir, float scale, float seed){
  vec3 g = dir * scale;
  vec3 cell = floor(g);
  vec3 f = fract(g);
  if (hash13(cell + seed) < 0.93) return vec3(0.0);
  vec3 c = vec3(hash13(cell + seed + 31.7), hash13(cell + seed + 47.3), hash13(cell + seed + 53.1)) * 0.66 + 0.17;
  vec3 q3 = f - c;
  // 把格胞偏移投到"屏幕感"的两个正交方向：取 dir 的切向基
  vec3 t1 = normalize(cross(dir, abs(dir.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0)));
  vec3 t2 = cross(dir, t1);
  vec2 q = vec2(dot(q3, t1), dot(q3, t2));
  float d = length(q3);
  float core = pow(max(0.0, 1.0 - d / 0.085), 5.0);
  float crossX = pow(max(0.0, 1.0 - abs(q.x) / 0.42), 16.0) * pow(max(0.0, 1.0 - abs(q.y) / 0.045), 3.0);
  float crossY = pow(max(0.0, 1.0 - abs(q.y) / 0.38), 16.0) * pow(max(0.0, 1.0 - abs(q.x) / 0.045), 3.0);
  float halo = pow(max(0.0, 1.0 - d / 0.22), 3.2) * 0.20;
  float warm = hash13(cell + seed + 5.1);
  vec3 col = mix(vec3(0.74, 0.86, 1.0), vec3(1.0, 0.88, 0.70), warm);
  float amp = 0.9 + 1.1 * hash13(cell + seed + 9.9);
  return col * (core * 2.2 + (crossX + crossY) * 1.05 + halo) * amp;
}

// ---------------------------------------------------------------- 行星
vec3 planetShade(vec3 dir, vec3 C, vec3 T, vec3 B, float ang, float r){
  vec3 nrm = normalize(T * (dot(dir, T) / max(ang, 1e-4)) + B * (dot(dir, B) / max(ang, 1e-4)) - C * sqrt(max(0.0, 1.0 - r * r)));
  vec3 sun = normalize(uSunDir);
  float ndl = dot(nrm, sun);
  float lit = smoothstep(-0.04, 0.34, ndl);

  // 气态巨行星：纬向条带 + 湍流 + 极冠
  vec3 ax = normalize(uPlanetAxis);
  float lat = dot(nrm, ax);
  float swirl = fbm2(vec2(lat * 7.0, dot(nrm, T) * 2.6 + dot(nrm, B) * 1.5) * 3.1 + 4.7);
  float band = 0.5 + 0.5 * sin(lat * 12.0 + swirl * 2.8);
  vec3 base = mix(uPlanetColA, uPlanetColB, smoothstep(0.16, 0.84, band));
  base = mix(base, uPlanetColB, smoothstep(0.65, 0.98, fbm2(vec2(lat * 24.0, dot(nrm, T) * 10.0))) * 0.32);
  base *= 0.88 + 0.20 * smoothstep(0.30, 1.0, abs(lat));
  vec3 day = base * (0.08 + 1.62 * lit) * uPlanetInt;
  // 夜面不是死黑：极暗的冷蓝 + 一点点城市/雷电级别的微弱暖斑，球体才读得出体积
  vec3 night = base * vec3(0.085, 0.095, 0.175) * uPlanetInt;
  night += uPlanetAtm * 0.055 * uPlanetGlow;
  // 夜面被自己的环反射照亮（真实 Saturn 夜面就是这样可读的）
  night += mix(uRingColA, uRingColB, 0.4) * 0.020 * uPlanetInt;
  vec3 col = mix(night, day, lit);
  // 晨昏线内侧的一圈暖光（大气折射感）
  float term = exp(-pow((ndl + 0.03) / 0.10, 2.0));
  col += uPlanetAtm * term * 0.28 * uPlanetGlow;
  // 边缘大气
  float fres = pow(1.0 - sqrt(max(0.0, 1.0 - r * r)), 2.8);
  col += uPlanetAtm * fres * (0.16 + 0.95 * lit) * uPlanetGlow;
  return col;
}

// 行星环：赤道面求交 + 环带密度 + 行星在环上的投影
vec4 ringShade(vec3 dir, vec3 C, float ang){
  vec3 ax = normalize(uPlanetAxis);
  float den = dot(dir, ax);
  if (abs(den) < 1e-4) return vec4(0.0);
  float t = dot(C, ax) / den;
  if (t < 0.0) return vec4(0.0);
  vec3 P = dir * t;
  vec3 rel = P - C;
  float rr = length(rel) / max(ang, 1e-4);
  if (rr < 0.60 || rr > 3.2) return vec4(0.0);
  float g = 0.0;
  g += smoothstep(0.64, 0.76, rr) * (1.0 - smoothstep(1.40, 1.55, rr));
  g += 0.52 * smoothstep(1.64, 1.72, rr) * (1.0 - smoothstep(2.08, 2.20, rr));
  g += 0.32 * smoothstep(2.24, 2.32, rr) * (1.0 - smoothstep(2.70, 2.90, rr));
  g *= 0.5 + 0.6 * fbm2(vec2(rr * 26.0, 3.7));
  g = clamp(g, 0.0, 1.0);
  if (g < 0.004) return vec4(0.0);
  vec3 col = mix(uRingColA, uRingColB, smoothstep(0.7, 2.9, rr));
  float behind = step(1.0, t);
  float inDisc = 1.0 - smoothstep(0.97, 1.02, rr);
  float hidden = behind * inDisc;
  vec3 Pn = rel / max(length(rel), 1e-4);
  float lit = 0.5 + 0.5 * clamp(dot(Pn, normalize(uSunDir)) * 0.5 + 0.5, 0.0, 1.0);
  return vec4(col * lit, g * uRingInt * (1.0 - hidden));
}

void main(){
  vec3 dir = normalize(uFwd + uRight * vUV.x * uTanFov * uAspect + uUp * vUV.y * uTanFov);

  // ---- 虚空：极深的靛紫（不是纯黑）--------------------------------------
  vec3 col = mix(uVoidLow, uVoidHigh, smoothstep(-0.55, 0.85, dir.y)) * uVoidInt;

  // ---- 星云：大云 + 丝状 + 暗尘裂谷 --------------------------------------
  float t = uTime * 0.005;
  vec3 q = dir * 2.05 + vec3(t * 0.6, -t * 0.35, t * 0.5);
  float w = fbm3v(q * 0.55 + vec3(3.1, 1.7, 0.0));
  vec3 qw = q + vec3(w - 0.5, fbm3v(q * 0.55 - vec3(1.3, 4.2, 2.0)) - 0.5, w - 0.5) * 1.35;
  float d1 = fbm3v(qw * 0.85);
  float d2 = fbm3v(qw * 2.20 + vec3(7.3, 2.1, 4.4));
  float core = fbm3v(qw * 4.60 - vec3(2.7, 5.7, 3.3));
  float cloud = smoothstep(0.42, 0.80, d1 * 0.72 + d2 * 0.28);
  float fil = 1.0 - abs(2.0 * d2 - 1.0);
  float filament = pow(max(0.0, fil - 0.52) / 0.48, 2.4);
  float dense = pow(cloud, 2.6) * smoothstep(0.30, 0.90, d1);

  // 云的"瓣"：让星云有形状（左上一大团、右下一条），不是满屏紫雾
  vec3 lobeA = normalize(vec3(0.34, 0.46, -0.82));
  vec3 lobeB = normalize(vec3(-0.62, 0.20, -0.76));
  vec3 lobeC = normalize(vec3(0.86, 0.26, 0.44));
  float la = exp(-pow(acos(clamp(dot(dir, lobeA), -1.0, 1.0)) / 0.55, 2.0));
  float lb = exp(-pow(acos(clamp(dot(dir, lobeB), -1.0, 1.0)) / 0.38, 2.0));
  float lc = exp(-pow(acos(clamp(dot(dir, lobeC), -1.0, 1.0)) / 0.46, 2.0));
  float lobes = clamp(la * 0.85 + lb * 0.60 + lc * 0.50 + 0.16, 0.0, 1.35);

  vec3 neb = uNebB * cloud * 0.50 * lobes;
  neb += uNebA * dense * 1.15 * lobes;
  neb += uNebC * filament * cloud * 0.85 * (0.35 + la);
  neb += uNebD * pow(dense, 1.8) * 0.90 * (0.25 + lb + lc * 0.4);
  col += neb * uNebInt;

  // 暗尘：把星云切成"被撕开的云"，避免糊成一片
  float rift = smoothstep(0.52, 0.72, fbm3v(qw * 1.55 + 11.0));
  col *= 1.0 - rift * 0.50 * clamp(cloud + 0.25, 0.0, 1.0);

  // ---- 银河带：斜贯天空的暖白尘埃 + 暗尘线 ------------------------------
  vec3 gal = normalize(vec3(0.36, 0.44, -0.82));
  float band = exp(-pow(abs(dot(dir, gal)) / 0.085, 2.0));
  float mw = fbm2(vec2(atan(dir.z, dir.x) * 7.0, asin(clamp(dir.y, -1.0, 1.0)) * 24.0) + 2.3);
  float lane = smoothstep(0.44, 0.78, fbm2(vec2(atan(dir.z, dir.x) * 19.0, asin(clamp(dir.y, -1.0, 1.0)) * 55.0) + 7.1));
  col += mix(uNebD, uStarColor, 0.30) * band * smoothstep(0.34, 0.88, mw) * (1.0 - lane * 0.60) * 0.26;

  // ---- 星场 --------------------------------------------------------------
  float b0 = 0.0, b1 = 0.0, b2 = 0.0, h0 = 0.0, h1 = 0.0, h2 = 0.0;
  float s0 = starLayer(dir, 128.0, 0.982, 4.7, 1.55, b0, h0);
  float s1 = starLayer(dir, 240.0, 0.975, 21.3, 1.00, b1, h1);
  float s2 = starLayer(dir, 420.0, 0.962, 55.1, 0.70, b2, h2);
  vec3 sc1 = mix(vec3(0.76, 0.86, 1.0), vec3(1.0, 0.90, 0.74), b1);
  vec3 sc0 = mix(vec3(0.80, 0.90, 1.0), vec3(1.0, 0.94, 0.84), b0 * 0.6);
  col += sc0 * (s0 * 2.6 + h0 * 1.6) * uStarInt;
  col += sc1 * (s1 * 1.15 + h1 * 1.2) * uStarInt;
  col += mix(sc1, vec3(0.85, 0.9, 1.0), 0.5) * (s2 * 0.55) * uStarInt;
  col += brightStars(dir, 96.0, 71.3) * uStarInt;
  col += brightStars(dir, 190.0, 133.7) * 0.42 * uStarInt;

  // ---- 环带巨行星 --------------------------------------------------------
  vec3 C = normalize(uPlanetDir);
  vec3 T = normalize(cross(vec3(0.0, 1.0, 0.0), C));
  vec3 B = cross(C, T);
  float pang = acos(clamp(dot(dir, C), -1.0, 1.0));
  float rp = pang / max(uPlanetAng, 1e-4);
  vec4 ring = ringShade(dir, C, uPlanetAng);
  if (rp < 1.0) {
    vec3 pcol = planetShade(dir, C, T, B, uPlanetAng, rp);
    col = mix(col, pcol, smoothstep(1.0, 0.985, rp));
  }
  col = mix(col, ring.rgb, ring.a * 0.94);
  col += uPlanetAtm * pow(max(0.0, 1.0 - abs(rp - 1.0) / 0.26), 3.0) * 0.30 * uPlanetGlow;

  // ---- 小卫星 ------------------------------------------------------------
  vec3 M = normalize(uMoonDir);
  float mAng = acos(clamp(dot(dir, M), -1.0, 1.0));
  float mr = mAng / max(uMoonAng, 1e-4);
  if (mr < 1.0) {
    vec3 mn = normalize(T * (dot(dir, T) / uMoonAng) + B * (dot(dir, B) / uMoonAng) - M * sqrt(max(0.0, 1.0 - mr * mr)));
    float mlit = smoothstep(-0.12, 0.40, dot(mn, normalize(uSunDir)));
    vec3 mc = uMoonCol * (0.17 + 1.05 * mlit);
    mc *= 0.9 + 0.2 * fbm2(vec2(dot(mn, T), dot(mn, B)) * 9.0);
    col = mix(col, mc, smoothstep(1.0, 0.97, mr));
  }
  col += uMoonCol * pow(max(0.0, 1.0 - abs(mr - 1.0) / 0.16), 3.0) * 0.09;

  // ---- 远处的恒星 --------------------------------------------------------
  vec3 sun = normalize(uSunDir);
  float sd = max(dot(dir, sun), 0.0);
  col += uSunColor * smoothstep(0.99985, 0.99995, sd) * 3.6 * uSunInt;
  col += uSunColor * pow(sd, 420.0) * 1.5 * uSunInt;
  col += uSunColor * pow(sd, 30.0) * 0.17 * uSunInt;
  col += uSunColor * pow(sd, 7.0) * 0.040 * uSunInt;

  oCol = vec4(col, 1.0);
}