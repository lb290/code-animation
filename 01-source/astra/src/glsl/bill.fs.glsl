in vec2 vUV; in vec4 vA; in vec3 vCol; in vec3 vWorld;
uniform float uTime;
uniform vec3 uCamPos;
uniform vec3 uFogColor; uniform float uFogDensity; uniform float uFogMax;
uniform vec3 uSunColor;
uniform float uAdditive;   // 1 = additive sprite pass (fireworks, night glow)
uniform float uAlphaMul;   // global alpha trim (sun glare fades out at night)
// round 6: the painted cumulus / smoke sprites are baked white; at night they
// are multiplied by this cool tint so the clouds turn dark blue (uNight=0 at
// day -> tint is exactly white, pixels unchanged).
uniform float uNight;
uniform vec3 uCloudNight;
out vec4 oCol;
void main(){
  float d = length(vUV);
  if (d > 1.0) discard;
  int shape = int(vA.w + 0.5);
  float a;
  vec3 col = vCol;
  if (shape == 0) {                 // soft spark / mote
    a = pow(max(0.0, 1.0-d), 2.4);
  } else if (shape == 1) {          // glow halo
    a = pow(max(0.0, 1.0-d), 2.8);
  } else if (shape == 2) {          // painted cumulus puff: crisp edge, top-lit
    float n = fbm2(vUV*1.9 + vA.y*11.0);
    float n2 = fbm2(vUV*4.4 - vA.y*7.0);
    float dd = d + (n-0.5)*0.44 + (n2-0.5)*0.16;
    a = smoothstep(1.00, 0.78, dd);
    float up = clamp(vUV.y*0.5 + 0.5, 0.0, 1.0);
    // billowy shading: bright sunlit crown, cooler blue-grey base
    col = mix(col*0.78, col*1.10, up);
    col += uSunColor * 0.12 * smoothstep(0.52, 1.0, up);
    a *= 0.90;
    col *= mix(vec3(1.0), uCloudNight, uNight);
  } else if (shape == 3) {          // confetti petal
    vec2 q = vUV*vec2(1.0, 1.9);
    a = smoothstep(1.0, 0.84, length(q)) * 0.95;
  } else if (shape == 4) {          // balloon body
    float e = length(vUV*vec2(1.0, 0.97));
    a = smoothstep(1.0, 0.94, e);
    a *= 0.85 + 0.4*pow(max(0.0, 1.0-length(vUV-vec2(-0.34,0.36))), 3.0);
  } else if (shape == 5) {          // foliage clump
    float n = fbm2(vUV*3.0 + vA.y*9.0);
    a = smoothstep(1.0, 0.52, d + (n-0.5)*0.75);
  } else if (shape == 6) {          // soft smoke puff
    float n = fbm2(vUV*2.4 + vA.y*7.0);
    a = smoothstep(1.0, 0.10, d + (n-0.5)*0.5) * 0.55;
    col *= mix(vec3(1.0), uCloudNight, uNight);
  } else {
    a = pow(max(0.0, 1.0-d), 3.0);
  }
  float dist = length(uCamPos - vWorld);
  // Round 16 · 近场淡出：镜头贴到 / 穿过 billboard 时把这张光斑淡掉。
  // 判据是「角半径」size/dist：一旦它占掉大半屏（角半径 > ~0.6 rad），它就不是光斑
  // 而是一层糊在镜头上的色雾（「光污染」），所以淡出；远处完全不受影响。
  float ang = vA.x / max(dist, 1e-3);
  float nearFade = 1.0 - smoothstep(0.22, 0.62, ang);
  float fog = 1.0 - exp(-pow(dist*uFogDensity, 1.18));
  if (uAdditive > 0.5) {
    // additive sprites must not tint the frame toward the fog colour; they just
    // fade with distance (fireworks, night window glow, moon-lit motes)
    a *= (1.0 - clamp(fog, 0.0, 0.85));
  } else {
    col = mix(col, uFogColor, clamp(fog*0.9, 0.0, uFogMax));
  }
  oCol = vec4(col, a * vA.z * uAlphaMul * nearFade);
}
