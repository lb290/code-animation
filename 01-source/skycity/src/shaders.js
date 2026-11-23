// All GLSL programs for the scene.
const HEAD = `#version 300 es
precision highp float;
precision highp sampler2D;
`;

// ------------------------------------------------------------------ shared helpers
const NOISE = `
float hash11(float p){ p = fract(p*0.1031); p *= p+33.33; p *= p+p; return fract(p); }
float hash21(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash21(i), hash21(i+vec2(1,0)), u.x),
             mix(hash21(i+vec2(0,1)), hash21(i+vec2(1,1)), u.x), u.y);
}
float fbm2(vec2 p){
  float s = 0.0, a = 0.5;
  for(int i=0;i<5;i++){ s += a*vnoise(p); p = p*2.03 + 17.1; a *= 0.5; }
  return s;
}
float fbm3(vec2 p){
  float s = 0.0, a = 0.5;
  for(int i=0;i<3;i++){ s += a*vnoise(p); p = p*2.07 + 31.7; a *= 0.5; }
  return s;
}
// ---- 3D value noise: keeps stains on a curved surface free of UV seams
float hash13(vec3 p){
  p = fract(p*0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y)*p.z);
}
float vnoise3(vec3 p){
  vec3 i = floor(p), f = fract(p);
  f = f*f*(3.0 - 2.0*f);
  return mix(mix(mix(hash13(i), hash13(i+vec3(1,0,0)), f.x),
                 mix(hash13(i+vec3(0,1,0)), hash13(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i+vec3(0,0,1)), hash13(i+vec3(1,0,1)), f.x),
                 mix(hash13(i+vec3(0,1,1)), hash13(i+vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm3v(vec3 p){
  float s = 0.0, a = 0.5;
  for(int i=0;i<4;i++){ s += a*vnoise3(p); p = p*2.04 + vec3(7.1, 3.3, 5.7); a *= 0.5; }
  return s;
}
`;

// ------------------------------------------------------------------ lit geometry
export const LIT_VS = `${HEAD}
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec3 aColor;
layout(location=3) in vec2 aMat;
uniform mat4 uProj, uView, uModel;
uniform float uTime;
uniform float uSway;       // wind sway amount
uniform vec3 uSwayOrigin;
out vec3 vWorld; out vec3 vN; out vec3 vCol; out vec2 vMat; out float vHeight;
void main(){
  vec3 p = aPos;
  if (uSway > 0.0) {
    float h = max(0.0, p.y - uSwayOrigin.y);
    float ph = uTime*1.3 + p.x*0.15 + p.z*0.12;
    p.x += sin(ph)*uSway*h*0.06;
    p.z += cos(ph*0.8)*uSway*h*0.05;
  }
  vec4 wp = uModel * vec4(p, 1.0);
  vWorld = wp.xyz;
  vN = mat3(uModel) * aNormal;
  vCol = aColor;
  vMat = aMat;
  vHeight = p.y;
  gl_Position = uProj * uView * wp;
}
`;

export const LIT_FS = `${HEAD}
${NOISE}
in vec3 vWorld; in vec3 vN; in vec3 vCol; in vec2 vMat; in float vHeight;
uniform vec3 uCamPos;
uniform vec3 uKeyDir; uniform vec3 uKeyColor; uniform float uKeyInt;
uniform vec3 uSkyColor; uniform vec3 uGroundColor;
uniform vec3 uCityPos; uniform vec3 uCityColor; uniform float uCityRadius;
uniform vec3 uFogColor; uniform float uFogDensity; uniform float uFogHeight;
uniform vec3 uRimColor; uniform float uRim;
uniform vec4 uLPos[8];   // xyz pos, w range
uniform vec4 uLCol[8];   // rgb colour, w intensity
uniform float uTime;
uniform float uAmbMul, uCityMul, uPointMul, uSpecMul;
out vec4 oCol;

void main(){
  // guard degenerate normals (zero length): normalize() of those is undefined and
  // poisons the entire lighting sum, which shows up as black screen-space slabs
  vec3 N0 = normalize(vN);
  vec3 N = (dot(N0, N0) > 0.25) ? N0 : vec3(0.0, 1.0, 0.0);
  vec3 V = normalize(uCamPos - vWorld);
  float gloss = vMat.y;
  float emissive = vMat.x;
  vec3 albedo = vCol;

  // moon / key light (soft wrap so silhouettes keep some form)
  float ndl = dot(N, uKeyDir);
  float wrap = clamp((ndl + 0.42) / 1.42, 0.0, 1.0);
  vec3 key = uKeyColor * uKeyInt * wrap;

  // hemisphere ambient: cool from the sky, warm bounce from the lantern city below
  float up = 0.5 + 0.5*N.y;
  vec3 amb = mix(uGroundColor, uSkyColor, up) * uAmbMul;

  // warm glow of the city: an area light at uCityPos
  vec3 toCity = uCityPos - vWorld;
  float cityD = length(toCity);
  float cityAtt = exp(-cityD / uCityRadius);
  vec3 cityGlow = uCityColor * cityAtt * (0.35 + 0.65*max(0.0, -N.y*0.5 + 0.5)) * uCityMul;

  // point lights (lanterns, koi)
  vec3 pl = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    vec4 lp = uLPos[i];
    if (lp.w <= 0.0) continue;
    vec3 d = lp.xyz - vWorld;
    float dist = length(d);
    if (dist > lp.w) continue;
    float att = pow(clamp(1.0 - dist/lp.w, 0.0, 1.0), 2.0);
    float nl = max(dot(N, d/max(dist,0.001)), 0.0);
    pl += uLCol[i].rgb * uLCol[i].w * att * (0.25 + 0.75*nl) * uPointMul;
  }

  // specular (only where gloss > 0)
  vec3 H = normalize(uKeyDir + V);
  float spec = pow(max(dot(N,H), 0.0), mix(12.0, 120.0, gloss)) * gloss;
  vec3 specCol = uKeyColor * spec * 1.2 * uSpecMul;

  vec3 lit = albedo * (key + amb + cityGlow + pl) + specCol * albedo * 3.0;
  lit += albedo * emissive * 2.6;
  // warm core for emissive surfaces
  lit += vec3(1.0, 0.72, 0.42) * emissive * 0.55;

  // rim light: cold edge for silhouettes against the sky (scaled by albedo)
  float rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
  lit += uRimColor * rim * uRim * (0.15 + albedo * 3.0);

  // fog: distance + height
  float dist = length(uCamPos - vWorld);
  float hFog = exp(-max(0.0, vWorld.y - uFogHeight) * 0.004);
  float fog = 1.0 - exp(-pow(dist * uFogDensity, 1.35) * hFog);
  vec3 fogCol = uFogColor + uCityColor * cityAtt * 0.25;
  lit = mix(lit, fogCol, clamp(fog, 0.0, 0.92));

  oCol = vec4(lit, 1.0);
}
`;

// ------------------------------------------------------------------ koi lantern body
export const KOI_VS = `${HEAD}
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec3 aColor;
layout(location=3) in vec2 aMat;
uniform mat4 uProj, uView, uModel;
uniform float uTime;
uniform float uPhase;
uniform float uAmp;
out vec3 vWorld; out vec3 vN; out vec3 vCol; out vec2 vMat; out float vHeight;
void main(){
  vec3 p = aPos;
  float tail = clamp(0.55 - p.z, 0.0, 1.0);
  float wave = sin(p.z*4.2 - uTime*2.2 + uPhase);
  p.x += wave * uAmp * tail * tail;
  p.y += sin(p.z*3.1 - uTime*1.4 + uPhase*1.7) * uAmp * tail * 0.28;
  vec4 wp = uModel * vec4(p, 1.0);
  vWorld = wp.xyz;
  vN = mat3(uModel) * aNormal;
  vCol = aColor;
  vMat = aMat;
  vHeight = p.z;
  gl_Position = uProj * uView * wp;
}
`;

// ------------------------------------------------------------------ debug
export const DBG_FS = `${HEAD}
in vec3 vWorld; in vec3 vN; in vec3 vCol; in vec2 vMat; in float vHeight;
uniform int uMode;
out vec4 oCol;
void main(){
  if (uMode == 0) oCol = vec4(vCol, 1.0);
  else if (uMode == 1) oCol = vec4(normalize(vN)*0.5+0.5, 1.0);
  else if (uMode == 2) oCol = vec4(vMat, 1.0, 1.0);
  else oCol = vec4(fract(vWorld*0.05), 1.0);
}
`;

// ------------------------------------------------------------------ sky dome
export const SKY_VS = `${HEAD}
layout(location=0) in vec3 aPos;
out vec2 vUV;
void main(){ vUV = aPos.xy; gl_Position = vec4(aPos.xy, 0.999, 1.0); }
`;

export const SKY_FS = `${HEAD}
${NOISE}
in vec2 vUV;
uniform vec3 uCamPos;
uniform vec3 uRight; uniform vec3 uUp; uniform vec3 uFwd;
uniform float uTanFov; uniform float uAspect;
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uHaze; uniform vec3 uGlow;
uniform vec3 uSunDir; uniform vec3 uSunColor;
uniform vec3 uMoonDir; uniform vec3 uMoonColor;
uniform float uTime;
uniform float uStars;
out vec4 oCol;

void main(){
  vec2 uv = vUV;
  vec3 dir = normalize(uFwd + uRight*uv.x*uTanFov*uAspect + uUp*uv.y*uTanFov);
  float h = clamp(dir.y, -0.25, 1.0);

  // base gradient: deep indigo zenith -> teal horizon
  vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.55));
  // a warm band where the lantern city glows, low on the horizon
  float low = exp(-max(0.0, h) * 5.0);
  col += uGlow * low * 0.30;
  // haze near the horizon
  col = mix(col, uHaze, exp(-max(0.0, h) * 12.0) * 0.5);

  // stars
  if (uStars > 0.0) {
    vec3 sd = dir * 300.0;
    vec3 cell = floor(sd);
    float rnd = hash21(cell.xy + cell.z*17.13);
    vec3 f = fract(sd) - 0.5;
    float star = smoothstep(0.30, 0.0, length(f)) * step(0.988, rnd);
    float tw = 0.6 + 0.4*sin(uTime*1.7 + rnd*90.0);
    col += vec3(0.88, 0.92, 1.0) * star * tw * uStars * smoothstep(0.02, 0.30, h) * 1.3;
    // faint milky band
    float band = exp(-pow((dir.x*0.6 + dir.y*1.4 - 0.15)*2.8, 2.0));
    col += vec3(0.10,0.12,0.22) * band * 0.22 * uStars * smoothstep(0.0,0.35,h);
  }

  // moon: a warm disc with a soft halo
  float md = dot(dir, uMoonDir);
  float disc = smoothstep(0.99955, 0.99975, md);
  float halo = pow(max(md, 0.0), 2200.0)*0.9 + pow(max(md,0.0), 90.0)*0.22 + pow(max(md,0.0), 14.0)*0.05;
  col += uMoonColor * (disc * 2.6 + halo);
  // moonlit haze
  col += uMoonColor * pow(max(md,0.0), 5.0) * 0.035;

  // high thin clouds catching moonlight
  if (h > 0.02) {
    vec2 cp = dir.xz / (h + 0.18) * 1.6 + vec2(uTime*0.004, uTime*0.002);
    float c = fbm3(cp * 1.4);
    c = smoothstep(0.55, 0.88, c) * smoothstep(0.02, 0.3, h) * 0.4;
    col += uMoonColor * c * 0.22 + vec3(0.03,0.04,0.09) * c;
  }

  oCol = vec4(col, 1.0);
}
`;

// ------------------------------------------------------------------ cloud sea
export const CLOUD_VS = `${HEAD}
${NOISE}
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec3 aColor;
layout(location=3) in vec2 aMat;
uniform mat4 uProj, uView;
uniform float uTime;
uniform float uAmp;
out vec3 vWorld; out vec3 vN;
void main(){
  vec3 p = aPos;
  float w = fbm2(p.xz*0.006 + uTime*0.004);
  p.y += (w - 0.5) * uAmp;
  vWorld = p;
  vN = vec3(0.0,1.0,0.0);
  gl_Position = uProj * uView * vec4(p,1.0);
}
`;

export const CLOUD_FS = `${HEAD}
${NOISE}
in vec3 vWorld; in vec3 vN;
uniform vec3 uCamPos;
uniform vec3 uMoonColor; uniform vec3 uMoonDir;
uniform vec3 uSkyColor; uniform vec3 uCityColor; uniform vec3 uCityPos;
uniform vec3 uFogColor; uniform float uFogDensity;
uniform vec3 uGlow;
uniform float uTime;
out vec4 oCol;

float cloudDensity(vec2 p){
  vec2 q = p*0.0065;
  float w = fbm3(q*0.45 + vec2(3.1, 1.7));
  float f = fbm3(q + vec2(w*0.6, -w*0.45));
  return f;
}
void main(){
  vec2 p = vWorld.xz;
  float d = cloudDensity(p);
  float e = 7.0;
  float dx = cloudDensity(p + vec2(e, 0.0)) - cloudDensity(p - vec2(e, 0.0));
  float dz = cloudDensity(p + vec2(0.0, e)) - cloudDensity(p - vec2(0.0, e));
  vec3 N = normalize(vec3(-dx*3.4, 1.0, -dz*3.4));
  vec3 L = normalize(uMoonDir + vec3(0.0, 0.35, 0.0));
  float ndl = max(dot(N, L), 0.0);
  float top = smoothstep(0.30, 0.72, d);

  vec3 shadow = vec3(0.028, 0.038, 0.082);
  vec3 mid = vec3(0.095, 0.12, 0.21);
  vec3 litc = vec3(0.60, 0.64, 0.78);
  vec3 col = mix(shadow, mid, top);
  col = mix(col, litc, smoothstep(0.25, 1.0, ndl) * (0.35 + 0.65*top));
  // a cool rim on the moon-facing slopes
  col += vec3(0.10, 0.14, 0.24) * pow(ndl, 3.0) * top;

  // warm glow from the lantern city spilling onto the clouds below it
  float cd = length(p - uCityPos.xz);
  float glow = exp(-cd/330.0);
  col += uCityColor * glow * (0.08 + 0.30*top);

  // aerial perspective: blend into the sky at the horizon
  float dist = length(uCamPos - vWorld);
  float fog = 1.0 - exp(-pow(dist*uFogDensity*0.85, 1.05));
  vec3 far = uFogColor + uGlow * glow * 0.22;
  col = mix(col, far, clamp(fog, 0.0, 0.97));
  oCol = vec4(col, 1.0);
}
`;

// ------------------------------------------------------------------ additive glow (mesh)
export const ADD_VS = `${HEAD}
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec3 aColor;
layout(location=3) in vec2 aMat;
uniform mat4 uProj, uView, uModel;
uniform float uTime;
out vec3 vWorld; out vec3 vN; out vec3 vCol; out float vI;
void main(){
  vec4 wp = uModel * vec4(aPos, 1.0);
  vWorld = wp.xyz;
  vN = mat3(uModel)*aNormal;
  vCol = aColor;
  vI = aMat.x;
  gl_Position = uProj * uView * wp;
}
`;

export const ADD_FS = `${HEAD}
in vec3 vWorld; in vec3 vN; in vec3 vCol; in float vI;
uniform vec3 uCamPos;
uniform float uTime;
uniform float uSoft;   // 0 = hard, 1 = soft edge-on falloff
out vec4 oCol;
void main(){
  vec3 V = normalize(uCamPos - vWorld);
  float edge = 1.0 - abs(dot(normalize(vN), V));
  float a = mix(1.0, pow(edge, 1.6), uSoft);
  // gentle breathing so glows feel alive
  float pulse = 0.92 + 0.08*sin(uTime*1.7 + vWorld.x*0.05 + vWorld.z*0.04);
  oCol = vec4(vCol * vI * a * pulse, 1.0);
}
`;

// ------------------------------------------------------------------ billboards (instanced)
export const BILL_VS = `${HEAD}
layout(location=0) in vec3 aPos;      // quad corner in xy
layout(location=4) in vec3 aInstPos;
layout(location=5) in vec4 aInstA;    // size, rot, alpha, shape
layout(location=6) in vec3 aInstCol;
uniform mat4 uProj, uView;
uniform vec3 uCamPos;
uniform float uTime;
uniform float uUp;     // 1 = vertical billboard, 0 = screen aligned
out vec2 vUV; out vec4 vA; out vec3 vCol; out vec3 vWorld;
void main(){
  vec3 right, up;
  vec3 toCam = normalize(uCamPos - aInstPos);
  if (uUp > 0.5) {
    right = normalize(cross(vec3(0.0,1.0,0.0), toCam));
    up = vec3(0.0,1.0,0.0);
  } else {
    right = normalize(cross(vec3(0.0,1.0,0.0), toCam));
    up = normalize(cross(toCam, right));
  }
  float r = aInstA.y;
  float c = cos(r), s = sin(r);
  vec2 q = vec2(aPos.x*c - aPos.y*s, aPos.x*s + aPos.y*c);
  vec3 wp = aInstPos + right*q.x*aInstA.x + up*q.y*aInstA.x;
  vUV = aPos.xy;
  vA = aInstA;
  vCol = aInstCol;
  vWorld = wp;
  gl_Position = uProj * uView * vec4(wp, 1.0);
}
`;

export const BILL_FS = `${HEAD}
${NOISE}
in vec2 vUV; in vec4 vA; in vec3 vCol; in vec3 vWorld;
uniform float uTime;
uniform vec3 uCamPos;
out vec4 oCol;
void main(){
  float d = length(vUV);
  if (d > 1.0) discard;
  int shape = int(vA.w + 0.5);
  float a;
  if (shape == 0) {            // soft round spark / mote
    a = pow(max(0.0, 1.0 - d), 2.2);
    a *= 0.75 + 0.25*sin(uTime*3.0 + vWorld.x*3.0 + vWorld.z*2.0);
  } else if (shape == 1) {     // paper lantern: warm ellipse with a bright core
    vec2 q = vUV * vec2(0.82, 1.0);
    a = pow(max(0.0, 1.0 - length(q)), 1.35);
    a = a*0.8 + 0.55*pow(max(0.0, 1.0 - length(q*1.9)), 2.0);
    // paper ribs
    a *= 0.86 + 0.14*sin(vUV.y*22.0);
  } else if (shape == 2) {     // cumulus puff
    float n = fbm3(vUV*2.2 + vA.y*17.0);
    a = smoothstep(1.0, 0.25, d + (n-0.5)*0.55);
    a *= 0.9;
  } else {                     // soft glow halo
    a = pow(max(0.0, 1.0 - d), 3.0);
  }
  oCol = vec4(vCol * vA.z * a, a);
}
`;

// ------------------------------------------------------------------ waterfall
export const FALL_VS = `${HEAD}
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec3 aColor;
layout(location=3) in vec2 aMat;
uniform mat4 uProj, uView;
out vec3 vWorld; out vec3 vCol; out vec2 vUV;
void main(){
  vWorld = aPos; vCol = aColor;
  vUV = vec2(aPos.x*0.35 + aPos.z*0.2, aPos.y*0.25);
  gl_Position = uProj * uView * vec4(aPos,1.0);
}
`;

export const FALL_FS = `${HEAD}
${NOISE}
in vec3 vWorld; in vec3 vCol; in vec2 vUV;
uniform float uTime; uniform vec3 uCamPos; uniform vec3 uMoonColor; uniform vec3 uCityColor;
uniform float uSeed;
out vec4 oCol;
void main(){
  vec2 uv = vCol.xy;            // u across the curtain, v down the fall
  float n = fbm2(vec2(uv.x*5.0 + uSeed, uv.y*7.0 - uTime*2.4));
  float n2 = fbm2(vec2(uv.x*13.0 + 3.1 + uSeed, uv.y*17.0 - uTime*4.1));
  float streak = smoothstep(0.28, 0.72, n*0.6 + n2*0.4);
  float edge = smoothstep(0.0, 0.14, uv.x) * smoothstep(1.0, 0.86, uv.x);
  float top = smoothstep(0.0, 0.04, uv.y);
  float dissolve = smoothstep(1.0, 0.55, uv.y);   // turns to mist near the bottom
  float a = edge * top * (0.35 + 0.55*streak) * dissolve;
  vec3 col = mix(vec3(0.42, 0.52, 0.70), vec3(1.0, 1.0, 1.0), streak);
  col = mix(col, uCityColor*1.2 + 0.3, 0.18);
  oCol = vec4(col * 1.25, a);
}
`;

// ------------------------------------------------------------------ post processing
export const POST_VS = `${HEAD}
layout(location=0) in vec3 aPos;
out vec2 vUV;
void main(){ vUV = aPos.xy*0.5 + 0.5; gl_Position = vec4(aPos.xy, 0.0, 1.0); }
`;

export const BRIGHT_FS = `${HEAD}
in vec2 vUV;
uniform sampler2D uTex; uniform float uThreshold; uniform float uKnee;
out vec4 oCol;
void main(){
  vec3 c = texture(uTex, vUV).rgb;
  float l = max(max(c.r, c.g), c.b);
  float soft = clamp(l - uThreshold + uKnee, 0.0, 2.0*uKnee);
  soft = soft*soft/(4.0*uKnee + 1e-4);
  float contrib = max(soft, l - uThreshold) / max(l, 1e-4);
  oCol = vec4(c * contrib, 1.0);
}
`;

export const BLUR_FS = `${HEAD}
in vec2 vUV;
uniform sampler2D uTex; uniform vec2 uDir; uniform float uTexel;
out vec4 oCol;
void main(){
  vec2 d = uDir * uTexel;
  vec3 s = texture(uTex, vUV).rgb * 0.227027;
  s += texture(uTex, vUV + d*1.3846).rgb * 0.316216;
  s += texture(uTex, vUV - d*1.3846).rgb * 0.316216;
  s += texture(uTex, vUV + d*3.2307).rgb * 0.070270;
  s += texture(uTex, vUV - d*3.2307).rgb * 0.070270;
  oCol = vec4(s, 1.0);
}
`;

export const COMPOSITE_FS = `${HEAD}
${NOISE}
in vec2 vUV;
uniform sampler2D uScene, uBloom1, uBloom2, uBloom3;
uniform float uTime;
uniform vec2 uRes;
uniform float uExposure;
uniform vec3 uLift;      // shadow tint
uniform vec3 uGain;      // highlight tint
uniform float uVignette, uGrain, uCA, uBloom, uSaturation;
out vec4 oCol;

vec3 aces(vec3 x){
  const float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14;
  return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0);
}
void main(){
  vec2 uv = vUV;
  // chromatic aberration grows toward the edges
  vec2 d = (uv - 0.5);
  float r2 = dot(d,d);
  vec3 col;
  col.r = texture(uScene, uv + d*0.0016*uCA*r2).r;
  col.g = texture(uScene, uv).g;
  col.b = texture(uScene, uv - d*0.0016*uCA*r2).b;

  vec3 bloom = texture(uBloom1, uv).rgb * 0.55 + texture(uBloom2, uv).rgb * 0.85 + texture(uBloom3, uv).rgb * 1.1;
  col += bloom * uBloom;

  col *= uExposure;
  col = aces(col);

  // grade: lift the shadows toward indigo, keep the lanterns warm
  col = col * uGain + uLift * (1.0 - col);
  float l = dot(col, vec3(0.299,0.587,0.114));
  col = mix(vec3(l), col, uSaturation);

  // vignette
  float v = smoothstep(0.95, 0.25, length(d)*1.28);
  col *= mix(1.0, v, uVignette);

  // film grain
  float g = hash21(uv*uRes + fract(uTime)*137.0) - 0.5;
  col += g * uGrain * (0.55 + 0.45*(1.0-l));

  // subtle s-curve for punch
  col = clamp(col, 0.0, 1.0);
  col = col*col*(3.0-2.0*col)*0.35 + col*0.65;
  oCol = vec4(col, 1.0);
}
`;

// ------------------------------------------------------------------ fish lantern
// vertex shader shared by the body pass and the fin pass: swims the body,
// flutters the fin sheets along their own normals.
export const FISH_VS = `${HEAD}
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=4) in vec3 aParam;   // part, u, v
layout(location=5) in vec3 aTint;    // finId/eyeId, colour mix, hue seed
uniform mat4 uProj, uView, uModel;
uniform float uTime, uPhase, uSwim;
out vec3 vWorld; out vec3 vN; out vec3 vObj; out vec3 vParam; out vec3 vTint;
void main(){
  vec3 p = aPos;
  vec3 n = aNormal;
  float part = aParam.x;
  float u = aParam.y;
  float v = aParam.z;

  // swimming wave — grows toward the caudal peduncle, so the head stays steady
  float tail = clamp((0.20 - p.z) / 0.62, 0.0, 1.0);
  tail = tail * tail;
  float w1 = sin(p.z * 3.0 - uTime * 1.45 + uPhase);
  float w2 = sin(p.z * 2.2 - uTime * 1.05 + uPhase * 1.7);
  p.x += (w1 * 0.090 + w2 * 0.020) * tail * uSwim;
  p.y += w2 * 0.024 * tail * uSwim;

  // fins ripple along their own normal; the rim does most of the moving
  if (part > 0.5 && part < 1.5) {
    float finId = aTint.x;
    float fl = sin(uTime * 1.9 + uPhase * 1.3 + u * 4.2 + v * 5.0 + finId * 1.9);
    float fl2 = sin(uTime * 3.1 + uPhase + v * 9.0 + finId);
    p += n * (fl * 0.030 + fl2 * 0.011) * u * u * uSwim;
  }

  vec4 wp = uModel * vec4(p, 1.0);
  vWorld = wp.xyz;
  vObj = p;
  vN = mat3(uModel) * n;
  vParam = aParam;
  vTint = aTint;
  gl_Position = uProj * uView * wp;
}
`;

// Body / eyes / lips: torn-paper patchwork over a warm bamboo frame with a lamp
// burning inside the belly.
export const FISH_FS = `${HEAD}${NOISE}
in vec3 vWorld; in vec3 vN; in vec3 vObj; in vec3 vParam; in vec3 vTint;
uniform mat4 uModel;
uniform vec3 uCamPos;
uniform vec3 uBulb;              // object-space lamp position
uniform float uTime, uPhase, uSeed, uGlow;
uniform vec3 uKeyDir, uKeyColor; uniform float uKeyInt;
uniform vec3 uSkyColor, uGroundColor, uCityPos, uCityColor; uniform float uCityRadius;
uniform vec3 uFogColor; uniform float uFogDensity;
uniform vec4 uLPos[8]; uniform vec4 uLCol[8];
out vec4 oCol;

void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(uCamPos - vWorld);
  if (dot(N, V) < 0.0) N = -N;
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float part = vParam.x;
  float u = vParam.y;
  float v = vParam.z;
  float belly = vTint.y;
  float dist = length(uCamPos - vWorld);

  // ---------------------------------------------------------------- eyes, lips
  if (part > 1.5) {
    vec3 toB = uBulb - vObj;
    float dB = length(toB);
    vec3 Lb = toB / max(dB, 1e-3);
    vec3 Hh = normalize(Lb + V);
    float spec = pow(clamp(dot(N, Hh), 0.0, 1.0), 220.0);
    float fres = pow(1.0 - ndv, 3.0);
    vec3 col;
    if (part < 2.5) {
      // black lacquer pupil with the lamp's catchlight; the gold iris is
      // painted on the paper around it, so the eye reads from every angle
      col = vec3(0.012, 0.006, 0.004);
      col += vec3(1.0, 0.80, 0.52) * spec * 4.6;
      float glint = pow(clamp(dot(N, normalize(uKeyDir + V)), 0.0, 1.0), 160.0);
      col += vec3(1.0, 0.97, 0.90) * glint * 5.0;
      col += vec3(1.0, 0.36, 0.10) * pow(clamp(dot(N, Lb), 0.0, 1.0), 3.0) * 0.10;
      col += vec3(1.0, 0.50, 0.18) * fres * 0.30;
    } else if (part < 3.5) {
      // lacquered gold hoop: warm metal with a hammered, slightly worn sheen
      float gn = hash21(vec2(vParam.y * 34.0, vParam.z * 9.0));
      col = vec3(0.46, 0.20, 0.048) * (0.70 + 0.34 * gn);
      col += vec3(0.34, 0.13, 0.020) * pow(ndv, 2.0);
      col += vec3(1.0, 0.76, 0.42) * spec * 2.0;
      col *= 0.50 + 0.55 * ndv;
    } else if (part < 4.5) {
      // lips: gold-leafed vermilion, barely there
      col = vec3(0.82, 0.36, 0.09) * 0.80;
      col += vec3(1.0, 0.66, 0.34) * spec * 1.8;
      col *= 0.55 + 0.55 * ndv;
    } else {
      col = vec3(0.020, 0.004, 0.003);
    }
    float fog0 = 1.0 - exp(-pow(dist * uFogDensity, 1.35));
    col = mix(col, uFogColor, clamp(fog0, 0.0, 0.85));
    oCol = vec4(col, 1.0);
    return;
  }

  // ---------------------------------------------------------------- paper panels
  // Domain-warped noise cuts the surface into big hand-torn patches instead of
  // an even grid; the seams are contour lines of the same field, so the cut
  // edges always agree with the colour boundaries.
  vec3 op = vObj * 2.6 + vec3(uSeed * 5.3, uSeed * 2.1, uSeed * 3.7);
  float w1 = fbm3v(op * 0.55 + 3.1);
  float w2 = fbm3v(op * 0.55 + 9.7);
  vec3 pw = op + vec3(w1 - 0.5, w2 - 0.5, w1 + w2 - 1.0) * 1.35;
  float n1 = fbm3v(pw * 0.62);            // the patch plan
  float n2 = fbm3v(pw * 1.35 + 11.0);     // medium stains
  float n3 = fbm3v(pw * 2.60 + 31.0);     // fine grain

  vec3 cGold  = vec3(0.84, 0.28, 0.045);
  vec3 cRed   = vec3(0.66, 0.048, 0.012);
  vec3 cCream = vec3(0.98, 0.74, 0.40);
  vec3 cJade  = vec3(0.16, 0.50, 0.33);
  vec3 cAzure = vec3(0.12, 0.28, 0.58);
  vec3 cPlum  = vec3(0.60, 0.11, 0.28);

  // ---- base paper: vermilion sheet, gold where the lamp sits behind it
  vec3 paper = mix(cRed, cGold, smoothstep(0.40, 0.82, n1));
  paper = mix(paper, cGold * 1.06, smoothstep(0.20, 0.02, n1) * 0.35);
  // big pasted sheets of slightly different tone (no hue, just age)
  paper *= 0.86 + 0.26 * hash21(vec2(floor(n1 * 3.5), uSeed * 1.7));
  // stains and sun-fade across a sheet
  paper *= 0.86 + 0.26 * smoothstep(0.20, 0.80, n2);
  paper *= 0.95 + 0.10 * n3;

  // ---- collage accents: a handful of torn scraps of dyed glass paper
  float accRaw = n3 + 0.10 * (n2 - 0.5) + 0.05 * sin(v * 9.0 + u * 4.0);
  float accMask = smoothstep(0.605, 0.625, accRaw);
  float accEdge = smoothstep(0.010, 0.0, abs(accRaw - 0.615));
  float accId = hash21(vec2(floor(n2 * 8.0), floor(n1 * 5.0)));
  vec3 accCol = mix(cJade, cAzure, hash21(vec2(accId, 3.7)));
  accCol = mix(accCol, cPlum, step(0.72, hash21(vec2(accId, 9.1))));
  accCol = mix(accCol, cCream, step(0.93, hash21(vec2(accId, 5.3))));
  paper = mix(paper, accCol, accMask * 0.72);
  // dark torn edge with a lit sliver of exposed pulp beside it
  paper *= 1.0 - 0.30 * accEdge;
  paper += vec3(1.0, 0.66, 0.30) * smoothstep(0.004, 0.0, abs(accRaw - 0.633)) * 0.10;
  // cream scraps where the paper was sanded thin
  float creamRaw = n2 + 0.16 * (n1 - 0.5);
  paper = mix(paper, cCream, smoothstep(0.805, 0.835, creamRaw) * 0.55);

  // each pasted sheet is a slightly different thickness
  paper *= 0.86 + 0.26 * hash21(vec2(floor(n1 * 6.0), uSeed));
  // the head wears a vermilion cap, the belly runs pale and hot
  float headPatch = smoothstep(0.64, 0.86, u + 0.05 * (n1 - 0.5));
  paper = mix(paper, mix(cRed * 0.92, cGold, 0.18 + 0.26 * n3), headPatch * 0.78);
  paper = mix(paper, paper * vec3(1.16, 0.98, 0.66) + vec3(0.04, 0.024, 0.0), belly * 0.55);

  // paper grain: fine and isotropic, never a lattice
  float grain = fbm2(vec2(u * 60.0 + v * 23.0, v * 74.0 + u * 31.0) + uSeed * 13.0);
  paper *= 0.93 + 0.13 * grain;
  float fib = fbm2(vec2(u * 190.0, v * 260.0) + uSeed * 7.0);
  paper *= 0.95 + 0.08 * fib;
  float thick = 0.82 + 0.30 * hash21(vec2(floor(n1 * 9.0), floor(n2 * 9.0)));

  // ---- bamboo frame: a few hand-tied hoops, no machine wire net
  float ru = fract(u * 7.0 + 0.5);
  float ribAA = clamp(fwidth(u * 7.0) * 2.4, 0.0, 1.0);
  float wob = 0.0018 * sin(v * 12.0 + 1.3) + 0.0012 * sin(v * 27.0 + 4.1);
  float ringLine = smoothstep(0.030, 0.0, abs(min(ru, 1.0 - ru) + wob)) * (1.0 - ribAA) * (1.0 - smoothstep(0.92, 1.0, u));
  paper *= mix(1.0, 0.86, ringLine);
  paper += vec3(1.0, 0.60, 0.28) * ringLine * 0.05;

  // gill cover: a curved crease behind the eye with a lit lip on its front edge
  float gillU = 0.706 - 0.080 * pow(abs(sin((v - 0.02) * 3.14159)), 1.7);
  float gillD = u - gillU;
  float gill = smoothstep(0.026, 0.0, abs(gillD));
  paper *= mix(1.0, 0.60, gill);
  paper += vec3(1.0, 0.68, 0.36) * smoothstep(0.020, 0.0, abs(gillD - 0.028)) * 0.28;
  paper *= 1.0 + 0.14 * smoothstep(0.14, 0.0, abs(gillD + 0.06));

  // ---------------------------------------------------------------- painted eye
  // A gold iris ring with a dark socket, laid straight onto the paper.
  vec3 e0 = vec3(0.146, 0.058, 0.428);
  vec3 e1 = vec3(-0.146, 0.058, 0.428);
  float de = min(length(vObj - e0), length(vObj - e1));
  float goldDisk = smoothstep(0.0625, 0.0565, de);
  float socket = smoothstep(0.080, 0.064, de);
  paper = mix(paper, vec3(1.00, 0.56, 0.14) * 1.10, goldDisk * 0.95);
  paper *= 1.0 - 0.40 * (socket - goldDisk);

  // ---------------------------------------------------------------- the lamp
  vec3 toB = uBulb - vObj;
  float dB = length(toB);
  vec3 Lb = toB / max(dB, 1e-3);
  float lam = clamp(dot(-N, Lb), 0.0, 1.0);
  float d2 = dB * dB;
  float broad = 1.0 / (0.20 + d2 * 1.30);          // the whole paper glows
  float core  = 1.0 / (0.080 + d2 * 4.40);         // the lamp seen through it
  // panels differ in how much paper the lamp has to shine through
  float panelThick = 0.50 + 0.80 * smoothstep(0.28, 0.80, n1 + 0.35 * (n2 - 0.5));
  float lampM = (0.58 + 0.42 * lam) * thick * panelThick;
  float facing = pow(ndv, 0.45);
  vec3 lampCol = vec3(1.00, 0.78, 0.50);
  vec3 paperLit = paper * lampCol * broad * lampM * facing * uGlow * 0.130;
  vec3 hot = mix(paper, vec3(1.0, 0.82, 0.54), 0.22) * core * lampM * facing * uGlow * 0.048;
  vec3 emit = paperLit + hot;
  emit += vec3(1.0, 0.58, 0.16) * goldDisk * 0.24 * lampM * uGlow;
  // thin paper at the rim leaks a little more light
  emit += paper * vec3(1.05, 0.66, 0.30) * pow(1.0 - ndv, 1.6) * 0.15 * uGlow;

  // ---- outside light: only a cool sheen on top of the lamp glow
  float wrapKey = clamp(dot(N, uKeyDir) * 0.5 + 0.5, 0.0, 1.0);
  vec3 outer = uKeyColor * uKeyInt * wrapKey * 0.22;
  float up = 0.5 + 0.5 * N.y;
  outer += mix(uGroundColor, uSkyColor, up) * 0.26;
  float cityD = length(uCityPos - vWorld);
  outer += uCityColor * exp(-cityD / uCityRadius) * 0.40;
  vec3 pl = vec3(0.0);
  vec3 spec = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    vec4 lp = uLPos[i];
    if (lp.w <= 0.0) continue;
    vec3 d = lp.xyz - vWorld;
    float dl = length(d);
    if (dl > lp.w) continue;
    vec3 L = d / max(dl, 0.001);
    float att = pow(clamp(1.0 - dl / lp.w, 0.0, 1.0), 2.0);
    pl += uLCol[i].rgb * uLCol[i].w * att * (0.25 + 0.75 * max(dot(N, L), 0.0));
    vec3 Hh = normalize(L + V);
    spec += uLCol[i].rgb * uLCol[i].w * att * pow(clamp(dot(N, Hh), 0.0, 1.0), 34.0) * 0.55;
  }
  vec3 col = emit + paper * (outer + pl * 0.5) + spec * mix(vec3(1.0), paper, 0.5);

  // ---- lacquer sheen + thin-film iridescence
  float fres = pow(1.0 - ndv, 3.0);
  vec3 irid = 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.34, 0.67) + n3 * 1.6 + ndv * 0.9 + uSeed));
  col += irid * (fres * 0.20 + 0.035);
  col += vec3(1.0, 0.60, 0.26) * fres * 0.55 * (0.35 + 0.70 * paper);

  float fog = 1.0 - exp(-pow(dist * uFogDensity, 1.35));
  col = mix(col, uFogColor, clamp(fog, 0.0, 0.88));
  oCol = vec4(col, 1.0);
}
`;

// Fin membranes: silk paper thin enough to pass the lamp through, with
// radiating veins, soft folds and thin-film colour.
export const FISH_FIN_FS = `${HEAD}${NOISE}
in vec3 vWorld; in vec3 vN; in vec3 vObj; in vec3 vParam; in vec3 vTint;
uniform mat4 uModel;
uniform vec3 uCamPos;
uniform vec3 uBulb;
uniform float uTime, uPhase, uSeed, uGlow;
uniform vec3 uKeyDir, uKeyColor; uniform float uKeyInt;
uniform vec3 uCityPos, uCityColor; uniform float uCityRadius;
uniform vec3 uFogColor; uniform float uFogDensity;
out vec4 oCol;

void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(uCamPos - vWorld);
  if (dot(N, V) < 0.0) N = -N;
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float u = vParam.y;
  float v = vParam.z;
  float finId = vTint.x;
  float mixT = vTint.y;
  float dist = length(uCamPos - vWorld);

  vec3 bulbW = (uModel * vec4(uBulb, 1.0)).xyz;
  vec3 toB = bulbW - vWorld;
  float dB = length(toB);
  vec3 Lb = toB / max(dB, 1e-3);
  float att = 1.0 / (0.60 + dB * dB * 1.25);
  float back = min(pow(clamp(dot(-V, Lb), 0.0, 1.0), 1.8) * att, 1.15);

  // ---- radiating veins: fine threads, fading out toward the rim
  float rays = 27.0 + finId * 2.2;
  float warp = 0.030 * sin(u * 5.2 + v * 2.4 + finId) + 0.038 * u * u;
  float rv = fract(v * rays + warp + finId * 0.37);
  float vein = smoothstep(0.22, 0.015, min(rv, 1.0 - rv));
  float rv2 = fract(v * rays * 2.0 + warp * 1.5 + 0.5);
  float vein2 = smoothstep(0.26, 0.0, min(rv2, 1.0 - rv2)) * 0.22;
  float fade = 1.0 - 0.55 * smoothstep(0.40, 1.0, u);
  float vAA = clamp(fwidth(v * rays) * 1.8, 0.0, 1.0);
  vein *= fade * (1.0 - vAA);
  vein2 *= fade * (1.0 - vAA);
  // fold shading: a crease facing the lamp catches light, a crease facing away
  // goes dark — this is what makes the silk read as a crumpled sheet
  float ndl = dot(N, Lb);
  float foldLit = 0.55 + 0.45 * clamp(ndl * 0.5 + 0.5, 0.0, 1.0);
  float crease = smoothstep(0.10, 0.30, abs(ndl));
  // soft concentric growth rings
  float cu = fract(u * 4.5 + 0.25 * sin(v * 7.0 + finId));
  float arc = smoothstep(0.28, 0.0, min(cu, 1.0 - cu)) * 0.14 * (1.0 - clamp(fwidth(u * 4.5) * 3.0, 0.0, 1.0));
  // the membrane is crumpled silk: broad folds, not a net
  float wr = fbm2(vec2(u * 3.2 + finId * 2.0, v * 8.0));
  float fold = smoothstep(0.40, 0.66, wr);

  // ---- opacity: dense where it meets the body, tissue-thin at the rim
  float rootBand = smoothstep(0.085, 0.0, u);
  float a = mix(0.90, 0.30, pow(u, 0.82));
  a *= 0.90 + 0.10 * (vein + vein2);
  a *= smoothstep(1.0, 0.90, u);          // the hem dissolves into the air
  a = clamp(a + back * 0.12, 0.0, 0.98);
  a = max(a, rootBand * 0.96);

  // ---- colour: vermilion at the root -> coral silk -> pale rose at the rim.
  // Never bleach it toward white: the membrane is dyed paper, so the tips only
  // get lighter and pinker, they do not turn grey.
  vec3 cRoot = vec3(0.84, 0.085, 0.022);
  vec3 cMid  = vec3(0.94, 0.24, 0.14);
  vec3 cTip  = vec3(0.94, 0.46, 0.37);
  vec3 c = mix(cRoot, cMid, smoothstep(0.0, 0.30, u));
  c = mix(c, cTip, smoothstep(0.30, 0.92, u));
  // a rose wash through the outer half, like dyed silk held against the lamp
  c = mix(c, vec3(1.00, 0.50, 0.54), smoothstep(0.42, 1.0, u) * (0.15 + 0.07 * sin(finId * 2.1)));
  // pale veins catch the light; folds change how much dye the light passes
  c *= 0.93 + 0.16 * vein + 0.07 * arc;
  c += cTip * vein * 0.10;
  c *= mix(0.90, 1.06, foldLit) * mix(0.95, 1.03, crease);
  // gold thread binding the membrane to the body
  c = mix(c, vec3(1.00, 0.68, 0.24) * (0.75 + 0.55 * back), rootBand * 0.92);

  vec3 irid = 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.34, 0.67) + u * 1.15 + v * 0.70 + ndv * 1.45 + finId * 0.23));
  float fres = pow(1.0 - ndv, 2.2);
  c += irid * (0.018 + 0.15 * fres + 0.05 * back);

  float cityL = exp(-length(uCityPos - vWorld) / uCityRadius) * 0.5;
  float rim = smoothstep(0.90, 1.0, u);
  vec3 col = c * (0.56 + 0.40 * back + 0.14 * (1.0 - u) + 0.08 * vein + cityL * 0.45);
  col *= 0.96 + 0.07 * fold;
  col += cTip * fres * 0.10;
  // glassy rim: the last millimetre of silk catches the light
  col += vec3(1.0, 0.62, 0.36) * rim * (0.20 + 0.72 * back);
  col += cTip * smoothstep(0.35, 1.0, u) * 0.06;
  // warm the whole membrane: silk lit by lamplight, never grey
  col *= vec3(1.0, 0.90, 0.82);
  col *= uGlow;

  // additive pass: fade to black with distance instead of to fog grey
  float fog = 1.0 - exp(-pow(dist * uFogDensity, 1.35));
  col *= 1.0 - clamp(fog, 0.0, 0.90);
  oCol = vec4(col * a, a);
}
`;
