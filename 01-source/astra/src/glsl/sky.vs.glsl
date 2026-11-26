layout(location=0) in vec3 aPos;
out vec2 vUV;
// 第十三轮：z 用 1.0（正好是清屏深度）。天空改成在实体几何之后画、靠 LEQUAL 深度测试
// 只着色"没被建筑挡住"的像素 —— 之前它是全屏无条件着色一遍再让建筑盖上去，室内机位
// （几乎全是墙）等于白算一整屏最贵的云/星噪声。视觉结果逐像素不变。
void main(){ vUV = aPos.xy; gl_Position = vec4(aPos.xy, 1.0, 1.0); }
