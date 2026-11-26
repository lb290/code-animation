in vec2 vUV;
uniform sampler2D uTex; uniform float uThreshold; uniform float uKnee;
out vec4 oCol;
void main(){
  vec3 c = texture(uTex, vUV).rgb;
  float l = max(max(c.r,c.g), c.b);
  float soft = clamp(l - uThreshold + uKnee, 0.0, 2.0*uKnee);
  soft = soft*soft/(4.0*uKnee + 1e-4);
  float contrib = max(soft, l - uThreshold)/max(l, 1e-4);
  // 单个像素再亮也限制在 8.0 以内：HDR 超亮面（太阳 / 行星晨昏线 / 舷窗）不该把整片
  // bloom 拉到饱和 —— Round 16 的「光污染」里有一部分就是这种超亮点贡献的。
  oCol = vec4(min(c*contrib, vec3(8.0)), 1.0);
}
