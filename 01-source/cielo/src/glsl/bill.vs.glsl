layout(location=0) in vec3 aPos;
layout(location=4) in vec3 aInstPos;
layout(location=5) in vec4 aInstA;
layout(location=6) in vec3 aInstCol;
uniform mat4 uProj, uView;
uniform vec3 uCamPos;
uniform float uTime;
uniform float uUp;
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
