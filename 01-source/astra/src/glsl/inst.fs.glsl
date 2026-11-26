in vec3 vWorld; in vec3 vN; in vec3 vCol; in vec2 vMat; in float vAlpha;
uniform vec3 uCamPos;
uniform vec3 uKeyDir; uniform vec3 uKeyColor; uniform float uKeyInt;
uniform vec3 uSkyColor; uniform vec3 uGroundColor; uniform float uAmbMul;
uniform vec3 uRimColor; uniform float uRim;
uniform vec3 uFogColor; uniform float uFogDensity; uniform float uFogMax;
uniform vec3 uShadowTint;
out vec4 oCol;
void main(){
  vec3 N0 = normalize(vN);
  vec3 N = (dot(N0,N0) > 0.25) ? N0 : vec3(0.0,1.0,0.0);
  vec3 V = normalize(uCamPos - vWorld);
  float ndl = dot(N, uKeyDir);
  float band = smoothstep(-0.15, 0.20, ndl);
  float cap = smoothstep(0.6, 0.98, ndl);
  vec3 key = uKeyColor * uKeyInt * (band*0.88 + cap*0.28);
  float up = 0.5 + 0.5*N.y;
  vec3 amb = mix(uGroundColor, uSkyColor, up) * uAmbMul * 1.18;
  amb *= mix(mix(uShadowTint, vec3(1.0), band), vec3(1.0), 0.5);
  vec3 lit = vCol * (key + amb);
  lit += vCol * vMat.x * 3.0;
  float rim = pow(1.0 - clamp(dot(N,V),0.0,1.0), 2.2);
  lit += uRimColor * rim * uRim * (0.10 + vCol*2.0);
  float dist = length(uCamPos - vWorld);
  float fog = 1.0 - exp(-pow(dist * uFogDensity, 1.18));
  lit = mix(lit, uFogColor, clamp(fog, 0.0, uFogMax));
  oCol = vec4(lit, vAlpha);
}
