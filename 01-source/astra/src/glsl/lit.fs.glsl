in vec3 vWorld; in vec3 vN; in vec3 vCol; in vec2 vMat; in vec3 vObj;
uniform vec3 uCamPos;
uniform vec3 uKeyDir; uniform vec3 uKeyColor; uniform float uKeyInt;
uniform vec3 uSkyColor; uniform vec3 uGroundColor; uniform float uAmbMul;
uniform vec3 uRimColor; uniform float uRim;
uniform vec3 uFogColor; uniform float uFogDensity; uniform float uFogMax;
uniform vec3 uShadowTint;
uniform float uNight;   // round 6 · 0 at day (bit-identical output), 1 at night
uniform float uTime;
uniform vec4 uLPos[12];
uniform vec4 uLCol[12];
uniform sampler2D uShadowMap;
uniform mat4 uLightVP;
uniform float uShadowTexel;
uniform float uShadowOn;

// 3x3 PCF against the sun's depth map; returns 1 = fully lit
float sunShadow(vec3 wp, vec3 N, float ndl){
  if (uShadowOn < 0.5) return 1.0;
  // push the sample point along the normal to kill acne on curved stone
  vec3 sp = wp + N * (0.35 + 1.4 * (1.0 - clamp(ndl, 0.0, 1.0)));
  vec4 sc = uLightVP * vec4(sp, 1.0);
  vec3 p = sc.xyz / sc.w;
  p = p * 0.5 + 0.5;
  if (p.x < 0.002 || p.x > 0.998 || p.y < 0.002 || p.y > 0.998 || p.z > 0.9995) return 1.0;
  float bias = 0.0011;
  float sum = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      float d = texture(uShadowMap, p.xy + vec2(float(x), float(y)) * uShadowTexel * 1.35).r;
      sum += (p.z - bias > d) ? 0.0 : 1.0;
    }
  }
  return sum / 9.0;
}
out vec4 oCol;

void main(){
  vec3 N0 = normalize(vN);
  vec3 N = (dot(N0,N0) > 0.25) ? N0 : vec3(0.0,1.0,0.0);
  vec3 V = normalize(uCamPos - vWorld);
  float gloss = vMat.y;
  float emissive = vMat.x;
  vec3 albedo = vCol;

  float ndl = dot(N, uKeyDir);

  // cel key light: soft 3-band terminator (flat, illustration-like)
  float band = smoothstep(-0.12, 0.20, ndl);
  float cap  = smoothstep(0.55, 0.96, ndl);
  float sh = sunShadow(vWorld, N, ndl);
  // keep a little light in the shadow so the flat-shaded look never goes muddy
  float keyMul = mix(0.30, 1.0, sh);
  vec3 key = uKeyColor * uKeyInt * (band * 0.88 + cap * 0.28) * keyMul;

  // ambient: cool sky above, warm stone bounce below
  float up = 0.5 + 0.5*N.y;
  vec3 amb = mix(uGroundColor, uSkyColor, up) * uAmbMul;
  amb *= mix(0.74, 1.0, clamp(N.y*0.5+0.5, 0.0, 1.0));
  vec3 shadowMul = mix(uShadowTint, vec3(1.0), band);
  amb *= mix(shadowMul, vec3(1.0), 0.5);

  // point lights (lamps, magic glows)
  vec3 pl = vec3(0.0);
  for (int i=0;i<12;i++){
    vec4 lp = uLPos[i];
    if (lp.w <= 0.0) continue;
    vec3 d = lp.xyz - vWorld;
    float dist = length(d);
    if (dist > lp.w) continue;
    float att = pow(clamp(1.0 - dist/lp.w, 0.0, 1.0), 2.0);
    float nl = max(dot(N, d/max(dist,0.001)), 0.0);
    pl += uLCol[i].rgb * uLCol[i].w * att * (0.2 + 0.8*nl);
  }

  // specular
  vec3 H = normalize(uKeyDir + V);
  float spec = pow(max(dot(N,H),0.0), mix(18.0, 190.0, gloss)) * gloss;
  vec3 specCol = uKeyColor * spec * 2.2;

  // night: lamp/window/indoor emissive glows much brighter so the city reads
  // as lit windows instead of dark stone (uNight=0 -> identical to round 5)
  vec3 lit = albedo * (key + amb + pl * (1.0 + uNight * 0.55)) + specCol;
  // Night: strongly emissive surfaces (lit windows, lamps, indoor sconces) gain a
  // lot, weakly emissive stone loses a bit — so the city goes dark but every
  // window glows. uNight=0 -> exactly the old 3.0 * albedo * emissive term.
  lit += albedo * emissive * (3.0 + uNight * (-1.7 + 6.0 * emissive));

  // rim light: cold edge separating shapes from the sky
  float rim = pow(1.0 - clamp(dot(N,V),0.0,1.0), 2.6);
  lit += uRimColor * rim * uRim * (0.10 + albedo * 2.2) * (0.35 + 0.65*band);

  // aerial perspective
  float dist = length(uCamPos - vWorld);
  float fog = 1.0 - exp(-pow(dist * uFogDensity, 1.18));
  fog *= mix(1.0, 0.50, clamp(vWorld.y / 420.0, 0.0, 1.0));
  lit = mix(lit, uFogColor * (0.95 + 0.09*clamp(N.y,0.0,1.0)), clamp(fog, 0.0, uFogMax));

  oCol = vec4(lit, 1.0);
}
