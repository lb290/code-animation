// upscale.fs.glsl — round 13 · 输出分辨率收尾：双线性放大 + 4 tap unsharp + 晕影 + 颗粒/抖动
// 为什么单独一个 pass：场景内部按像素预算渲染（手机上通常 0.8–1.5 MP），画布是设备像素
// （2.0–2.6 MP）。旧版把合成结果直接写进小画布、再让浏览器双线性放大 2–4 倍 —— 那就是
// 用户说的「建筑非常粗糙」。现在放大发生在我们自己的 shader 里，并且顺手把边缘对比补回来。
in vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uSrc;          // 1.0 / 场景纹理尺寸（源纹素步长）
uniform vec2 uRes;          // 输出分辨率（颗粒/抖动要用像素坐标）
uniform float uSharp;       // 锐化强度 0..1（档位决定：内部像素越少，补偿越强）
uniform float uVignette, uGrain, uNight;
out vec4 oCol;

float luma3(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }

void main(){
  vec2 uv = vUV;
  vec3 c = texture(uTex, uv).rgb;

  // ---- 4 tap unsharp：以"源纹素"为步长取四邻域的均值，和中心做差值补偿。
  // 内部像素 = 输出像素时它是一个温和的锐化；内部像素更少时它专门抵消双线性的糊。
  vec3 n = 0.25 * (
      texture(uTex, uv + vec2(uSrc.x, 0.0)).rgb +
      texture(uTex, uv - vec2(uSrc.x, 0.0)).rgb +
      texture(uTex, uv + vec2(0.0, uSrc.y)).rgb +
      texture(uTex, uv - vec2(0.0, uSrc.y)).rgb);
  vec3 sh = c + (c - n) * uSharp;
  // 高光/暗部不要被锐化推出显示范围（否则金饰边缘会出现一圈黑边/白边）
  float lc = luma3(c);
  sh = mix(sh, c, smoothstep(0.84, 0.99, lc) * 0.85);
  sh = mix(sh, c, smoothstep(0.055, 0.0, lc) * 0.6);
  vec3 col = clamp(sh, 0.0, 1.0);

  // ---- 晕影（输出分辨率下做，不会被放大成色块）
  vec2 d = uv - 0.5;
  float v = smoothstep(1.06, 0.28, length(d) * 1.22);
  col *= mix(1.0, v, uVignette);

  // ---- 颗粒 + 抖动：输出分辨率下的细噪点，避免渐变出现色带、也弱化放大的塑料感
  float g = hash21(uv * uRes + fract(uNight * 3.7) * 91.0) - 0.5;
  col += g * uGrain * 0.5;
  col += (hash21(uv * uRes + 17.0) - 0.5) * (1.0 / 255.0);

  oCol = vec4(clamp(col, 0.0, 1.0), 1.0);
}
