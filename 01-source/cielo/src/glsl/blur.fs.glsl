in vec2 vUV;
uniform sampler2D uTex; uniform vec2 uDir; uniform float uTexel;
out vec4 oCol;
void main(){
  vec2 d = uDir*uTexel;
  vec3 c = texture(uTex, vUV).rgb*0.2270270270;
  c += texture(uTex, vUV + d*1.3846153846).rgb*0.3162162162;
  c += texture(uTex, vUV - d*1.3846153846).rgb*0.3162162162;
  c += texture(uTex, vUV + d*3.2307692308).rgb*0.0702702703;
  c += texture(uTex, vUV - d*3.2307692308).rgb*0.0702702703;
  oCol = vec4(c, 1.0);
}
