in vec2 vUV;
uniform vec3 uCamPos;
uniform vec3 uRight; uniform vec3 uUp; uniform vec3 uFwd;
uniform float uTanFov; uniform float uAspect;
uniform vec3 uZenith; uniform vec3 uSkyMid; uniform vec3 uHorizon; uniform vec3 uHaze;
uniform vec3 uSunDir; uniform vec3 uSunColor;
uniform vec3 uMoonDir; uniform vec3 uMoonColor;
uniform vec3 uCloudLit; uniform vec3 uCloudShade; uniform vec3 uCloudDeep;
uniform float uTime; uniform float uCloudCov;
// round 6 · day/night. All the night-only terms are multiplied by uNight (or
// gated behind uStarInt), so at uNight=0 the shader is bit-identical to round 5.
uniform float uNight;
uniform float uStarInt;
uniform float uMoonInt;
uniform float uMoonSize;
out vec4 oCol;

// one deck of painted cumulus. Returns rgb + coverage in .a
vec4 cloudDeck(vec3 dir, vec3 sun, float scale, float bias, float seed, float soft){
  float h = max(dir.y, 0.015);
  vec2 q = dir.xz / h * scale;
  float t = uTime * 0.0035;
  // slow drift + domain warp for billowy, non-streaky shapes
  vec2 w = vec2(fbm2(q*0.16 + vec2(t*0.7, seed)), fbm2(q*0.16 + vec2(seed + 4.3, -t*0.5))) - 0.5;
  vec2 p = q + w*1.5;

  // large-scale mask: only some parts of the sky carry big cumulus
  float mask = smoothstep(0.32, 0.78, fbm2(p*0.11 + seed*2.7));
  float base = fbm2(p*0.34 + seed*3.1);
  float detail = fbm2(p*1.15 + seed*7.7);
  float dens = base*0.84 + detail*0.16;

  float edge = mix(0.014, 0.004, soft);
  float cov = smoothstep(0.560 - bias - edge - uCloudCov*0.10, 0.560 - bias + edge - uCloudCov*0.10, dens);
  cov *= mix(1.0, mask, 0.75);

  // fake normal from the density gradient -> sun-lit tops, darker bases
  float e = 0.035;
  float dx = fbm2((p + vec2(e,0.0))*0.55 + seed*3.1) - fbm2((p - vec2(e,0.0))*0.55 + seed*3.1);
  float dz = fbm2((p + vec2(0.0,e))*0.55 + seed*3.1) - fbm2((p - vec2(0.0,e))*0.55 + seed*3.1);
  vec3 N = normalize(vec3(-dx*9.0, 1.0, -dz*9.0));
  float ndl = clamp(dot(N, sun)*0.5 + 0.5, 0.0, 1.0);

  // thickness: puffy cores stay white, thin fringes pick up the lavender shadow
  float thick = smoothstep(0.30, 0.92, detail*0.5 + base*0.5);
  vec3 col = mix(uCloudShade, uCloudLit, smoothstep(0.34, 0.80, ndl));
  col = mix(uCloudDeep, col, 0.35 + 0.65*thick);
  // silver lining toward the sun
  float sd = max(dot(dir, sun), 0.0);
  col += uSunColor * pow(sd, 8.0) * 0.45 * thick * (1.0 - uNight * 0.75);
  // fade into the horizon haze so the deck does not read as a hard band
  col = mix(col, uHaze, smoothstep(0.22, 0.004, h) * 0.82);
  return vec4(col, cov);
}

// one layer of stable painted stars. No uTime term: the field must not shimmer
// when the camera moves, and a frozen frame has to be reproducible.
float starLayer(vec3 dir, float sx, float sy, float thr, float seed, float sizeMul){
  vec2 sp = vec2(atan(dir.z, dir.x) * 0.15915494, asin(clamp(dir.y, -1.0, 1.0)) * 0.31830989);
  vec2 g = sp * vec2(sx, sy);
  vec2 cell = floor(g);
  vec2 f = fract(g);
  float pick = hash21(cell + seed);
  if (pick < thr) return 0.0;
  vec2 c = vec2(hash21(cell + seed + 11.3), hash21(cell + seed + 19.1)) * 0.72 + 0.14;
  float rad = (0.045 + 0.075 * hash21(cell + seed + 2.9)) * sizeMul;
  float d = length(f - c);
  float star = pow(max(0.0, 1.0 - d / rad), 3.0);
  return star * (0.30 + 0.95 * hash21(cell + seed + 7.7));
}

void main(){
  vec3 dir = normalize(uFwd + uRight*vUV.x*uTanFov*uAspect + uUp*vUV.y*uTanFov);
  float h = clamp(dir.y, -0.45, 1.0);
  vec3 sun = normalize(uSunDir);

  // ---- base sky: cobalt zenith -> cyan mid -> pale horizon ----------------
  float hy = clamp(h, 0.0, 1.0);
  vec3 col = mix(uHorizon, uSkyMid, smoothstep(0.0, 0.30, hy));
  col = mix(col, uZenith, smoothstep(0.18, 1.05, hy));
  col = mix(col, uHaze, smoothstep(-0.02, -0.42, h));

  // ---- night sky: stars + milky way band (skipped entirely at uStarInt=0) --
  if (uStarInt > 0.002) {
    float hz = smoothstep(0.012, 0.22, h) * (1.0 - smoothstep(0.70, 1.0, h));
    float s1 = starLayer(dir, 340.0, 170.0, 0.52, 4.7, 1.0);
    float s2 = starLayer(dir, 150.0, 75.0, 0.72, 21.3, 1.7);
    vec2 sp2 = vec2(atan(dir.z, dir.x) * 0.15915494, asin(clamp(dir.y, -1.0, 1.0)) * 0.31830989);
    float warm = hash21(floor(sp2 * vec2(340.0, 170.0)) + 3.3);
    vec3 starCol = mix(vec3(0.82, 0.88, 1.0), vec3(1.0, 0.90, 0.72), warm);
    float stars = s1 * 1.35 + s2 * 2.30;
    col += starCol * stars * uStarInt * hz;
    // faint milky-way dust band
    float band = exp(-pow(abs(dot(dir, normalize(vec3(0.36, 0.44, -0.82)))) / 0.26, 2.0));
    float mw = fbm2(sp2 * vec2(46.0, 23.0) + 5.3);
    col += vec3(0.30, 0.34, 0.48) * band * smoothstep(0.34, 0.94, mw) * uStarInt * 0.20 * hz;
    // warm city light-pollution haze sitting on the horizon
    col += vec3(0.24, 0.16, 0.10) * uNight * smoothstep(0.14, -0.02, h) * 0.42;
  }

  // ---- sun glow (fades out as night comes on) ----------------------------
  float sd = max(dot(dir, sun), 0.0);
  col += uSunColor * pow(sd, 5.0) * 0.10 * (1.0 - uNight);
  col += uSunColor * pow(sd, 120.0) * 0.60 * (1.0 - uNight);

  // ---- pale daytime moon (unchanged at day, faded out at night) ----------
  float md = dot(dir, normalize(uMoonDir));
  if (md > 0.985) {
    float disc = smoothstep(0.9990, 0.9997, md);
    col = mix(col, uMoonColor, disc*0.85*(1.0 - uNight));
    col += uMoonColor * smoothstep(0.985, 0.999, md) * 0.10 * (1.0 - uNight);
  }

  // ---- night moon: big, low, haloed --------------------------------------
  if (uNight > 0.002) {
    float mrad = max(0.0015, uMoonSize);
    float ang = acos(clamp(md, -1.0, 1.0));
    float disc = 1.0 - smoothstep(mrad * 0.90, mrad * 1.02, ang);
    float halo = pow(max(0.0, 1.0 - ang / (mrad * 4.5)), 3.0);
    float halo2 = pow(max(0.0, 1.0 - ang / (mrad * 9.0)), 2.0);
    col = mix(col, uMoonColor * 1.30, clamp(disc * uMoonInt * 0.96, 0.0, 1.0));
    col += uMoonColor * (halo * 0.38 + halo2 * 0.05) * uMoonInt * uNight;
  }

  // ---- thin cirrus streaks high up --------------------------------------
  if (h > 0.06) {
    vec2 cq = dir.xz/(h+0.3)*2.2 + vec2(uTime*0.0015, 0.0);
    float cir = fbm2(vec2(cq.x*0.35, cq.y*1.7) + 11.0);
    cir = smoothstep(0.62, 0.90, cir) * smoothstep(0.06, 0.40, h) * 0.22;
    col = mix(col, uCloudLit, cir);
  }

  // ---- two cumulus decks: far/hazy + main -------------------------------
  if (h > 0.002) {
    vec4 far = cloudDeck(dir, sun, 0.80, 0.12, 17.0, 1.0);
    vec4 main1 = cloudDeck(dir, sun, 2.25, 0.02, 3.0, 0.0);
    col = mix(col, far.rgb, far.a * 0.75);
    col = mix(col, main1.rgb, main1.a);
  }

  oCol = vec4(col, 1.0);
}
