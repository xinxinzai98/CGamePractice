# 2026 战场新素材

使用内置 imagegen 逐张生成（2026-09-10），参考原始 `map_1_18.png` 的地面用途与 `hangar-dawn.png` 的工业机甲氛围；新设计不替换原始教学素材。所有采用文件均为生成器原 PNG 的直接副本，未做程序绘制、抠图或覆盖原文件。

| 文件 | 尺寸 | 格式 | 用途 |
|---|---|---|---|
| `web/assets/enemy-stalker.png` | 1254 × 1254 | RGBA | 朝上红黑双足追猎机，第二次生成纠正俯视 |
| `web/assets/enemy-artillery.png` | 1254 × 1254 | RGBA | 朝上锈金四足炮机 |
| `web/assets/enemy-support.png` | 1254 × 1254 | RGBA | 白青三环共鸣支援节点 |
| `web/assets/terrain-ash.png` | 1254 × 1254 | RGB | 灰绿工业荒原 |
| `web/assets/terrain-coolant.png` | 1254 × 1254 | RGB | 暗青蓝冷却液 |
| `web/assets/terrain-bridge.png` | 1254 × 1254 | RGB | 横向金属栈桥 |

逐张视觉检查：无文本水印，3 类敌人轮廓和颜色明确分开；追猎机重生成后改成上背/头顶俯视。地形低对比，无前景物体；生成器按无缝/横向平铺提示生成，尚未以数学边缘一致性证明无缝。运行时 60 px 的辨识度与平铺效果仍需主流程在游戏画面核验。

PNG 实际解码验证：三个敌人文件的 alpha 范围均为 0–255；完全透明像素占比：追猎机 49.83%、炮机 70.11%、支援节点 57.35%。三张地形为无 alpha 的 RGB 图。未对图像进行修改。

源目录（本机生成留档）：`/Users/hive/.codex/generated_images/01a08702-a77a-7303-965e-d34b9ff86c7f/`。

## stalker

源文件：`exec-6079ec32-7d16-4aec-9504-616714e48af0.png`

```text
Use case: stylized-concept. Production game sprite of one compact crimson black bipedal STALKER ROBOT viewed from EXACTLY STRAIGHT ABOVE ITS HEAD, looking down along gravity axis. Critical: only TOP of helmet, TOP of shoulders, broad upper back and small tops of bent feet are visible; face/chest/front of legs NOT visible. Deeply foreshortened torso, squat circular footprint, not tall humanoid portrait. Robot faces TOP edge; tiny head at top, broad shoulder armor left/right, short claw arms splayed forward, two feet just below pelvis. Bold dark crimson and black biomechanical armor shapes, 90s Japanese sci-fi anime painted finish with modern crisp details. Readable at 60px, no vertical perspective, no isometric. One centered robot fills 80% of square canvas, genuine transparent alpha background, no floor, no shadow, no checkerboard, no text/watermark/logos. True overhead strategy-game unit asset.
```

## artillery

源文件：`exec-56080f32-c9d8-4e10-b355-98f8db25cb70.png`

```text
Use case: stylized-concept. Single game sprite, enemy artillery walker for a top-down anime mecha shooter. TRUE VERTICAL OVERHEAD ORTHOGRAPHIC view of the upper surfaces, NOT frontal view. One compact four-legged low crab robot with a prominent cannon barrel pointing straight toward TOP edge, four short braced legs widely splayed in an X silhouette around squat body. Rust gold armor and charcoal metal, tiny amber core. Original 1990s Japanese biomechanical sci-fi anime aesthetic, clean painted edges and strong shapes readable when rendered at 60 pixels. Centered full subject, generous 8% transparent margins, square canvas. Genuinely transparent alpha background, no floor, no shadow, no checkerboard. No text, logos, watermarks or extra units.
```

## support

源文件：`exec-64a259a7-79eb-4a78-b9ad-42c61ed46f69.png`

```text
Use case: stylized-concept. Single top-down game sprite: a floating resonance repair node enemy, THREE chunky interlocking mechanical rings around a bright small turquoise core, triangular three-lobed silhouette. Cool blue-black machinery and porcelain white protective armor with cyan accents. The rings are viewed from directly overhead, TRUE VERTICAL ORTHOGRAPHIC TOP VIEW, no horizon, no perspective, small directional notch toward top of canvas. Original mysterious biomechanical 1990s Japanese anime sci-fi aesthetic with modern clean painted armor, readable distinct silhouette at 60px. One centered object with 8% clear margin. GENUINELY TRANSPARENT ALPHA background, no floor, no cast shadows, no fake transparency pattern, glow contained within the sprite. Square canvas. No text, logos, watermark or extras.
```

## ash

源文件：`exec-bcde0fc8-3651-47e5-9d55-c49b292417a6.png`

```text
Use case: stylized-concept. Production tileable square game ground texture, industrial ash wasteland of fine dusty gray-green earth with subdued charcoal silt and tiny eroded mineral details. Entire square filled edge to edge with flat ground. Seamlessly repeats on BOTH axes, equal illumination everywhere, no vignette, no large unique landmark. True orthographic top-down view, no horizon, no perspective. Low contrast, low saturation, readable as background beneath 60px robots and colored attacks. Restrained hand-painted 1990s Japanese sci-fi anime battleground texture with modern material finish. No objects, buildings, grass, plants, tracks, signs, markings, text, watermark, border, transparency, dramatic light or shadows. 1024x1024 square.
```

## coolant

源文件：`exec-b5c2d12e-fe93-4e14-9a68-79c42d13e216.png`

```text
Use case: stylized-concept. Production seamlessly tileable square TOP-DOWN game terrain texture of dark teal blue industrial coolant water. Fine subtle overlapping energy ripples, very low contrast dark blue turquoise, gentle even surface variation. Flat orthographic directly overhead, edge-to-edge water only, identical uniform lighting at all edges, seamless repeat on BOTH axes. Muted hand-painted sci-fi anime material texture, compatible with dark steel industrial mecha battleground. Keep surface quiet behind gameplay effects. No distinct circular focal point, no perspective, no horizon, no shore, no objects, no foam, no glowing lines, no shadows, no text, no markings, no watermark, no border, no transparency. Square 1024x1024.
```

## bridge

源文件：`exec-2c4539e6-49b7-4d87-afdc-394bb1754f6e.png`

```text
Use case: stylized-concept. A single square top-down game terrain tile of a HORIZONTAL industrial steel walkway deck, left-to-right travel direction. The metal decking fills the ENTIRE square image, no outside scenery or empty margins. Dark steel gray plates with restrained wear and shallow horizontal ribbing, narrow sparse amber safety lines along TOP and BOTTOM edges, no rails protruding from frame. Left and right edges match for horizontal tiling. TRUE VERTICAL ORTHOGRAPHIC TOP VIEW, perfectly parallel lines, flat uniform diffuse lighting, low contrast so gameplay is clear. Original hand-painted industrial Japanese anime mecha game texture matching dark gray dawn hangar/courtyard concrete and metal barricades. No perspective, no horizon, no shadows, no objects, no text, no logos, no watermark, no transparent regions. Square 1024x1024.
```
