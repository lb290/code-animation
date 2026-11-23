in vec2 vUV;
uniform sampler2D uScene, uBloom1, uBloom2;
uniform float uTime;
uniform vec2 uRes;
uniform float uExposure, uBloom, uSaturation, uContrast, uVignette, uGrain, uFxaa;
out vec4 oCol;

vec3 tonemap(vec3 x){
  x = max(vec3(0.0), x);
  return clamp((x*(2.51*x + 0.03))/(x*(2.43*x + 0.59) + 0.14), 0.0, 1.0);
}
float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }

// compact FXAA (luma edge blend) — thin spires and railings need it badly
vec3 fxaa(vec2 uv, vec2 px){
  vec3 rgbNW = texture(uScene, uv + vec2(-1.0, -1.0)*px).rgb;
  vec3 rgbNE = texture(uScene, uv + vec2( 1.0, -1.0)*px).rgb;
  vec3 rgbSW = texture(uScene, uv + vec2(-1.0,  1.0)*px).rgb;
  vec3 rgbSE = texture(uScene, uv + vec2( 1.0,  1.0)*px).rgb;
  vec3 rgbM  = texture(uScene, uv).rgb;
  float lNW = luma(rgbNW), lNE = luma(rgbNE), lSW = luma(rgbSW), lSE = luma(rgbSE), lM = luma(rgbM);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  if (lMax - lMin < 0.055) return rgbM;
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
  float dirReduce = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);
  float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
  dir = clamp(dir * rcpDirMin, vec2(-8.0), vec2(8.0)) * px;
  vec3 a = 0.5*(texture(uScene, uv + dir*(1.0/3.0 - 0.5)).rgb + texture(uScene, uv + dir*(2.0/3.0 - 0.5)).rgb);
  vec3 b = a*0.5 + 0.25*(texture(uScene, uv + dir*-0.5).rgb + texture(uScene, uv + dir*0.5).rgb);
  float lb = luma(b);
  return (lb < lMin || lb > lMax) ? a : b;
}

void main(){
  vec2 uv = vUV;
  vec2 d = uv - 0.5;
  vec2 px = 1.0 / uRes;
  vec3 col = mix(texture(uScene, uv).rgb, fxaa(uv, px), uFxaa);
  vec3 bloom = texture(uBloom1, uv).rgb*0.65 + texture(uBloom2, uv).rgb*0.85;
  col += bloom * uBloom;
  col *= uExposure;
  col = tonemap(col);
  vec3 sh = vec3(0.010, 0.018, 0.042);
  col += sh * (1.0 - col);
  col = mix(vec3(luma(col)), col, uSaturation);
  col = clamp((col - 0.5)*uContrast + 0.5, 0.0, 1.0);
  float v = smoothstep(1.06, 0.28, length(d)*1.22);
  col *= mix(1.0, v, uVignette);
  float g = hash21(uv*uRes + fract(uTime)*91.0) - 0.5;
  col += g * uGrain * 0.5;
  oCol = vec4(clamp(col, 0.0, 1.0), 1.0);
}
