layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec3 aColor;
layout(location=3) in vec2 aMat;
uniform mat4 uProj, uView, uModel;
out vec3 vWorld; out vec3 vN; out vec3 vCol; out vec2 vMat; out vec3 vObj;
void main(){
  vec4 wp = uModel * vec4(aPos, 1.0);
  vWorld = wp.xyz; vN = mat3(uModel)*aNormal; vCol = aColor; vMat = aMat; vObj = aPos;
  gl_Position = uProj * uView * wp;
}
