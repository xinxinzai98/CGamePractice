# 2026 新增环境素材

原始角色、坦克、草地、水面和桥等继续使用历史仓库里的图像。新增图像保留独立文件，不覆盖原作。使用内置 image_gen 工具生成；工具没有返回可核实的具体模型版本，因此不宣称某个模型编号。

| 文件 | 用途 | 参考 |
| --- | --- | --- |
| `web/assets/dawn-courtyard.png` | 可通行的庭院地砖；第 3、4 关及编辑器 | 原图 `map_1_18.png` |
| `web/assets/dawn-barricade.png` | 阻挡坦克与炮弹的墙体 | 原图 `map_1_18.png` |

按游戏实际 60×60 像素采样绘制，编辑器以 24×24 格预览。新增地形已进行游戏画面 / 编辑器视觉检查。未将新增素材冒充为 2017 年作品。

## 庭院地面提示词

Use case: stylized-concept. Asset type: a single seamless square terrain texture tile for a top-down 2D tank game, to be sampled at 60x60 pixels. Primary request: new dawn-era abandoned military courtyard ground for continuation of a 2017 Chinese amateur tank game. Visual reference attached is the original bright grass tile; keep its readable hand-painted 2D sprite character and strict orthographic top-down camera, but make this new tile weathered olive-grey square stone paving with tiny restrained moss seams and subtle amber highlights, modest richer surface detail for a contemporary feel. Entire canvas is the ground texture, uniformly lit, seamless tile edges, no horizon, no perspective, no objects, no tanks, no letters, no logos, no border, no cast shadows. Low contrast so original red and blue tank sprites remain clearly visible. This is new environment art, do not alter the original reference.

## 装甲路障提示词

Use case: stylized-concept. Game asset for Battle for the Dawn, continuation of a 2017 2D top-down tank game. Generate a single square obstacle terrain tile: mossy weathered dark olive armored concrete barricade block, strictly orthographic straight top-down, fills full canvas edge to edge and can be placed adjacent to itself on a square grid. Hand-painted 2D game sprite shading, restrained detail readable at 60x60 pixels, bold broad shapes, slate olive grey concrete slabs with a simple steel brace and tiny muted amber edge markings, subtle sunlit top rim, no perspective, no isometric sides, no grass border, no text, no logos, no letters, no tank, no people. Match the attached original grass tile's illustrated game texture style, with a subtle contemporary industrial design. Keep darkest borders and brighter center so this is clearly a solid obstacle, not walkable ground.
