in vec2 vUV;
uniform sampler2D uTex; uniform float uThreshold; uniform float uKnee;
out vec4 oCol;
void main(){
  vec3 c = texture(uTex, vUV).rgb;
  float l = max(max(c.r,c.g), c.b);
  float soft = clamp(l - uThreshold + uKnee, 0.0, 2.0*uKnee);
  soft = soft*soft/(4.0*uKnee + 1e-4);
  float contrib = max(soft, l - uThreshold)/max(l, 1e-4);
  oCol = vec4(c*contrib, 1.0);
}
