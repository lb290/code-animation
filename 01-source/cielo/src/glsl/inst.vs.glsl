layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec3 aColor;
layout(location=3) in vec2 aMat;
layout(location=4) in vec4 iM0;
layout(location=5) in vec4 iM1;
layout(location=6) in vec4 iM2;
layout(location=7) in vec4 iM3;
layout(location=8) in vec4 iPr;   // x phase, y sway amp, z mode, w alpha
uniform mat4 uProj, uView;
uniform float uTime;
out vec3 vWorld; out vec3 vN; out vec3 vCol; out vec2 vMat; out float vAlpha;
void main(){
  mat4 M = mat4(iM0, iM1, iM2, iM3);
  vec3 p = aPos;
  float sw = iPr.y;
  float md = iPr.z;
  if (sw > 0.0) {
    float ph = iPr.x * 6.2831;
    if (md < 0.5) {
      // bird wing: the whole wing section lifts, both surfaces move together
      float k = abs(aPos.x);
      p.y += sin(uTime * 9.0 + ph + aPos.z * 1.5) * sw * k;
    } else if (md < 1.5) {
      // fish: a travelling lateral wave from nose (+z) to tail (-z),
      // plus a small pectoral flutter along the width
      float k = max(0.0, -aPos.z) * 0.85 + abs(aPos.x) * 0.22;
      p.x += sin(uTime * 5.2 + ph - aPos.z * 2.2) * sw * k;
    } else {
      // slow cloth / frond flutter along the surface normal
      float k = abs(aPos.x);
      p += aNormal * sin(uTime * 2.2 + ph + aPos.z * 1.7) * sw * k;
    }
  }
  vec4 wp = M * vec4(p, 1.0);
  vWorld = wp.xyz;
  vN = mat3(M) * aNormal;
  vCol = aColor;
  vMat = aMat;
  vAlpha = iPr.w;
  gl_Position = uProj * uView * wp;
}
