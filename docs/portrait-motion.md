# 看板立绘的局部动态

`web/portrait-motion.js` 提供浏览器原生 WebGL 单图网格动画。现有立绘文件保持原样，画布只绘制原图和原图自身的透明度，没有额外背景。

## 接入

在使用前加载 `portrait-motion.js`，保留原 `<img>` 作为回退。画布内部为 512 × 768，CSS 也需保持 2:3 比例，不能拉伸。

```js
canvas.addEventListener('portraitmotionready', () => {
  canvas.hidden = false;
  fallbackImage.hidden = true;
});
canvas.addEventListener('portraitmotionerror', () => {
  canvas.hidden = true;
  fallbackImage.hidden = false;
});
const motion = window.PortraitMotion.create(canvas, {
  src: 'assets/pilot-asuka.png',
  reducedMotion: false
});
if (!motion) {
  canvas.hidden = true;
  fallbackImage.hidden = false;
}
// 切换角色时同步更新回退图片。
motion?.setSource('assets/pilot-rei.png');
// 离开主页或关闭立绘面板时暂停；再次出现时恢复。
motion?.setActive(false);
motion?.setActive(true);
// 用户设置与操作系统的减少动态效果偏好，两者任一开启即静态显示。
motion?.setReducedMotion(true);
// 页面组件销毁时清理监听器、动画和 GPU 资源。
motion?.destroy();
```

`setSource` 异步加载，旧图在新图成功加载前保留；连续切换只接纳最后一次结果。图片请求失败、纹理上传失败和 WebGL 上下文丢失会触发 `portraitmotionerror`，`detail.reason` 为故障类型。WebGL 创建或着色器初始化失败直接返回 `null`。上下文丢失后使用原图回退，不无限重试。

## 动作与性能

- 48 × 64 格网格，共 3,185 个顶点，6,144 个三角形；纹理仅在切换时上传。
- 胸肩约 6 秒呼吸周期，腰部与图像边界稳定；脸部中心采用统一的小幅位移，排除发梢和手臂的局部形变。
- 明日香外侧长发约 5 秒摆动周期，最大水平偏移约 10 个原图像素；绫波丽使用较小、较短的发梢区域。
- 手臂围绕肩部小角度摆动，约 6.5 秒周期；身体缓慢重心移动约 7.6 秒周期。
- 透明像素使用预乘 alpha 输出和 `ONE, ONE_MINUS_SRC_ALPHA` 混合，避免透明边缘暗边。
- 隐藏浏览器页面时停止动画帧；`setActive(false)` 停止连续绘制；系统或用户要求减少动态时只画静帧。

## 适用边界

这是单张立绘的分区网格动画，**不是 Live2D 骨骼模型**。它不能生成被手臂遮挡的躯干、背面头发、新表情或真正眨眼，也不能让互相重叠的头发与衣服完全独立运动。原图中存在的光晕或背景也属于纹理，会随对应网格轻微变形。要获得更大的手臂动作、独立发丝、视线和眨眼，需要额外分层素材与关节/表情设计。

目前区域针对 `pilot-asuka.png` 和 `pilot-rei.png` 的构图设置；来源文件名含 `rei` 或 `ayanami` 使用短发区域，其余使用长发区域。新增角色应单独配置区域，不能假设任意构图通用。

## 核对

`node --check web/portrait-motion.js` 通过。实际 GPU 着色器编译、视觉效果及主页回退接入仍需浏览器检查；JavaScript 语法检查不能替代视觉验收。
