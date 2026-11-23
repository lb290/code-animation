in vec3 vWorld; in vec3 vN; in vec3 vCol; in vec2 vMat; in vec3 vObj;
uniform vec3 uCamPos;
uniform float uTime;
// round 6 · night window layer: uAddMode=1 draws flat additive quads whose
// brightness comes from uNightGlow (0 at day -> both terms are exactly 0).
uniform float uAddMode;
uniform float uNightGlow;
out vec4 oCol;
void main(){
  float a;
  if (uAddMode > 0.5) {
    a = vMat.x * uNightGlow;
  } else {
    vec3 V = normalize(uCamPos - vWorld);
    float face = pow(clamp(abs(dot(normalize(vN), V)), 0.0, 1.0), 1.6);
    a = face * vMat.x * vCol.r;
  }
  oCol = vec4(vCol * a, a);
}
