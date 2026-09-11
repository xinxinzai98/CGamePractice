# 技能图标图集

生成日期：2026-09-10。来源：内置 `image_gen` 生图工具，原创生成；仅以本项目 `web/assets/hangar-dawn.png` 作为机甲材质和色调参考，没有引用外部游戏贴图。工具未返回具体底层模型名称。

成品：`web/assets/skill-icons.png`，实际尺寸 **1254 × 1254 px**，PNG，不作二次拉伸处理。精确均分为 3 × 3，每格 **418 × 418 px**。生成请求尺寸为 1536 × 1536，但工具实际输出尺寸以上述读回值为准。

CSS 使用 `background-size: 300% 300%`，横纵位置分别使用 `0% / 50% / 100%`。图集无外部留白，细金属边框画在每格内部。所有技能主体及光效局限于自己的格子。部分武器与腿部使用近景裁切以保留小尺寸辨识度。

| 行 | 列 | Key | 内容 | 背景位置 |
|---|---|---|---|---|
| 1 | 1 | fire | 蓝白阳电子炮 | 0% 0% |
| 1 | 2 | heal | 青绿修复核心 | 50% 0% |
| 1 | 3 | speed | 青蓝矢量推进器 | 100% 0% |
| 2 | 1 | special | 红橙双联炮齐射 | 0% 50% |
| 2 | 2 | ultimate | 琥珀六边形屏障 | 50% 50% |
| 2 | 3 | blink | 紫蓝空间跃迁 | 100% 50% |
| 3 | 1 | missile | 赤金 N² 导弹 | 0% 100% |
| 3 | 2 | melee | 白金高振动刀 | 50% 100% |
| 3 | 3 | item | 青金同步电容 | 100% 100% |

## 视觉检查

已查看工具生成的整张图：9 格顺序、数量与主题正确，中心图形均可分辨，冷暖技能色彩明确，网格边缘对齐，没有文字、数字或水印。实际界面中的 48 px 可读性须结合应用渲染检查；此处不把整图预览代替浏览器验收。

## 生成提示词

```text
Use case: stylized-concept. Asset type: production game skill icon sprite atlas for an anime mecha cooperative web RPG. Generate ONE square 1536×1536 image, exactly 3 columns by 3 rows of equal square skill icons, edge to edge, no gaps, no outer margin, boundaries exactly at one third and two thirds. Each icon occupies its exact 512×512 cell. Use image 1 ONLY as palette and mecha material reference, do not recreate its scene. Art style: premium hand-painted anime RPG equipment/ability illustration, precise sculptural mechanical silhouettes, sophisticated painterly materials, luminous energy effects, strong readable central shape at tiny 48px UI size. Uniform very dark navy backgrounds, understated thin gunmetal inset square borders within each cell, small gold metal highlights. Keep every icon subject entirely inside its own cell with 12% safe padding. No cross-cell effects. No typography, numbers, letters, watermarks, logos, emoji, simplistic vector symbols. EXACT ROW MAJOR SUBJECTS: top left fire: a heavy positron cannon angled toward upper right, brilliant blue white muzzle energy beam; top center heal: a teal green mechanical repair reactor with a luminous medical cross core, clearly looks like a repair device; top right speed: a pair of cyan vector rocket thrusters with powerful rearward turquoise jets, readable propulsion. Middle left special: red orange twin barrel energy cannon firing two parallel bursts, readable double weapon silhouette; middle center ultimate: golden amber faceted hexagonal AT energy barrier with layered shield plates, frontal iconic shield silhouette; middle right blink: violet blue dimensional jump ring with a single mecha foot/leg passing through and luminous displaced afterimage, clearly teleportation. Bottom left missile: one red gold futuristic N2 missile arcing in front of a compact golden explosive bloom, no lettering; bottom center melee: diagonal long white gold high-frequency mecha combat blade, elegant blade silhouette with vibration energy highlights; bottom right item: teal gold synchronization capacitor battery, heavy industrial cylindrical canister with luminous cyan center, gold end caps. These nine highly distinct polished icons must be aligned precisely in an unbroken 3×3 atlas. No background scenery, no UI labels.
```
