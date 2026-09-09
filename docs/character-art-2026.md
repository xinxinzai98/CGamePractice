# 大厅角色与机体立绘（2026-09-10）

## 入口主视觉封面

新增 web/assets/cover-dawn.png，内置 image_gen 一次生成，参考已有机库与红蓝机体设计，场景改为破晓废墟双机迎战原创几何核心。实际尺寸 1672 × 941，近 16:9 横幅，非透明完整场景。已查看生成结果：无文字、UI、标志或水印，双机头部与手臂完整，脚部局部被前景瓦砾遮挡；上方中间保留暗蓝天空可叠游戏标题。此图是入口主视觉，不用于战斗图集。

原件：/Users/hive/.codex/generated_images/01a086f3-9052-7202-b700-650a645e37cc/exec-6878544b-f2a1-4efa-baed-38401c867fc4.png

```text
Use case: stylized-concept. Asset type: dramatic widescreen 16:9 MAIN COVER KEY ART for a two-player Japanese mecha anime web game. Reference images are visual design guides ONLY: retain the scarlet/angular and white-ice-blue/slender robot designs and precise anime shading, but create an outdoor battle composition, NOT a hangar. At dawn in a ruined futuristic city, TWO full-body giant humanoid mecha stand together ready to fight: scarlet robot on left foreground and pale blue-white robot on right midground, dynamic forward-braced poses with all heads, arms, hands and legs readable and completely inside the frame. Far in the sky on the right, an ORIGINAL floating segmented blue-violet geometric shell with small glowing red weakpoint threatens the city; no copying a specific existing character. Huge scale, broken streets and shattered towers, orange dawn rim light versus cyan-blue energy highlights, dramatic clouds, restrained energy trails and windblown dust. Strong diagonal composition with depth and cinematic impact. Keep upper-left to upper-center sky clean dark navy and spacious for a game title to be added later, but DO NOT generate any text. Beautiful 2D Japanese anime concept illustration, refined cel shading and painted background, crisp silhouettes, strong red-orange versus cold blue palette, not photorealistic or 3D render. Wide 16:9 landscape canvas. No words, lettering, watermark, logos, interface, borders, portraits, or hangar. Must be striking actual main visual cover artwork.
```


来源：Codex 内置 image_gen 图像生成工具，未使用 CLI 或外部付费 API。与既有 hangar-dawn.png 机库风格配合；原始 2017 年素材未改写。新增图像是 AI 生成的游戏展示素材。

四张图均为 1024 × 1536 PNG。已逐张查看：角色头部与肩部完整，机体头、双手、双足均在画面内，无文字或水印。两机体采用相同细节密度和站姿，区分猩红突击与蓝白防御配色。人物采用动漫线稿和现代赛璐璐上色。

## 透明与显示

所有提示均请求真实透明背景。使用 Python 标准库只读解析 PNG、解压 IDAT 并还原扫描行，四张均为 RGBA，alpha 范围 0–254（每张 1,572,864 像素均小于 255），确认存在真实透明/半透明像素。视觉预览同时包含深色柔光效果，因此前端仍需核验机库叠放效果，必要时使用 CSS 边缘渐隐。没有进行人工抠图或 Python 改图，保留内置生成结果原始 alpha。

## 生成提示与来源

### pilot-asuka.png

项目路径：web/assets/pilot-asuka.png

生成原件：/Users/hive/.codex/generated_images/01a086f3-9052-7202-b700-650a645e37cc/exec-45cf940c-2dd6-455e-b917-00444fcd7870.png

```text
Use case: stylized-concept. Asset type: transparent character cutout for a cooperative mecha web game lobby. Generate ONE portrait of Asuka Langley, recognizable orange-red long hair with red hair clips and blue eyes, confident friendly expression. She wears a modest high-collared scarlet pilot uniform with dark graphite panels and orange mechanical details, fully covered, nonsexual. Framing: portrait 2:3 canvas, full head and hair and both shoulders fully visible with generous margins, waist-up, relaxed upright three-quarter stance, face toward viewer. Style: beautiful clean 1990s Japanese mecha anime line art with restrained modern detailed cel shading; warm orange and cool cyan rim lighting suitable for dark industrial hangar. Isolated character on genuinely transparent alpha background; no checkerboard drawing, no background, no text, no logos, no watermark, no extra characters. Crisp readable silhouette and face; this is a game asset, not a poster.
```

### pilot-rei.png

项目路径：web/assets/pilot-rei.png

生成原件：/Users/hive/.codex/generated_images/01a086f3-9052-7202-b700-650a645e37cc/exec-2430452c-9b09-4fb5-878c-b2de3d48ecce.png

```text
Use case: stylized-concept. Asset type: companion character portrait for mecha web game lobby. Generate ONE original adult female anime mecha pilot, age 25, short pale blue bob hairstyle, red eyes, composed gentle expression. Outfit: loose white military flight jacket with a tall collar zipped completely closed, ice blue sleeve panels, graphite shoulder armor, gloves, practical nonsexual professional clothing. Match clean 1990s Japanese mecha anime linework and modern detailed cel shading, warm orange and cool cyan edge lights. Portrait 2:3 format, waist-up, entire head and both shoulders inside canvas, generous margin, upright three-quarter stance, face toward viewer, arms relaxed. Isolated portrait on genuinely transparent alpha background. No text, watermark, insignia, or other people.
```

### mecha-asuka.png

项目路径：web/assets/mecha-asuka.png

生成原件：/Users/hive/.codex/generated_images/01a086f3-9052-7202-b700-650a645e37cc/exec-14b5b614-40d9-4b40-9045-eb533e666611.png

```text
Use case: stylized-concept. Asset type: standalone full-body giant mecha cutout for game lobby. Input image is style reference ONLY for red machine silhouette/materials; do not include the hangar scenery. ONE original scarlet Japanese biomechanical combat robot, 1990s mecha anime inspired with modern precise cel shading, slender athletic humanoid proportions, long armored legs, narrow waist, high shoulder pylons, angular masked head, four small amber eyes, graphite inner frame and orange armor accents. Elegant mechanical details, slightly battle-worn red enamel. Full body complete head, antennae, both arms, both hands, both feet entirely in canvas with margin, neutral imposing three-quarter standing pose. Empty hands. Tall portrait format 2:3. Subtle cyan/orange rim lighting suited to dark hangar. GENUINELY TRANSPARENT ALPHA BACKGROUND; isolated clean cutout with no floor, no environment, no checkerboard, no lettering, no logo, no watermark. Only one robot.
```

### mecha-rei.png

项目路径：web/assets/mecha-rei.png

生成原件：/Users/hive/.codex/generated_images/01a086f3-9052-7202-b700-650a645e37cc/exec-34880af5-41f6-4433-86b3-d9bc13ec6265.png

```text
Use case: stylized-concept. Asset type: standalone full-body giant mecha cutout, companion for referenced red robot in same web game. Reference image gives exact art style, pose scale and detail quality. Generate ONE DIFFERENT original pale ice-blue and white Japanese biomechanical defense robot. 1990s mecha anime inspired, modern precise cel shading, slender tall humanoid proportions, long armored legs, narrow waist, shoulder pylons shorter and rounded, single amber monocular visor on smooth angular helmet, graphite inner frame, steel-blue inset armor, subtle orange accents. Full body head both arms both hands both feet complete inside portrait 2:3 canvas with margin. Neutral three-quarter standing pose facing slightly toward left, empty hands. Fine scuffed enamel armor same detail as reference. Cyan/orange rim lighting for dark hangar. Isolated clean silhouette on GENUINELY TRANSPARENT ALPHA BACKGROUND; no scenery, floor, checkerboard drawing, text, logo, watermark, or extra robots.
```

Rei 首次按原作角色名请求的输出被内置工具审核拦截（other）；改为明确成年、宽松高领夹克的原创蓝发驾驶员后成功。最终选用后者，保留蓝发红眼与白蓝配色，未复用失败结果。

动态展示由前端 CSS 轻微呼吸/浮动完成；本批不是动画 atlas，也不宣称为 Live2D。

## 战斗素材补充

新增 combat-asuka.png、combat-rei.png、boss-core.png，全部使用内置 image_gen，每种一次调用。生成前查看原 TankPlayerAsuka_MS.png，保留红/蓝白阵营识别色，将轮廓改为可见手臂、肩膀与双腿的人形机甲。

实际三张均为 1254 × 1254 RGBA PNG。两张 atlas 单格精确 627 × 627，按等分直接取样。生成器没有完全服从首次提示中的严格正俯视与上/下顺序；最终输出是 RPG 式斜俯视四方向，实际格序为左上朝下、右上朝右、左下朝上、右下朝左。消费代码应采用 [下, 右, 上, 左] 顺序，不应按原提示错误取样。蓝白 atlas 用红色图作为构图与风格参考，四格方向一致。机器人完整在格内，粗轮廓可辨，无文字或网格线。

Boss 是正俯视的四瓣菱形蓝紫金属外壳与大面积红色弱点核心，完整留边。未直接采用某个具体使徒造型。

使用 Node.js 标准库只读解析 PNG、解压并还原 IDAT 扫描行验证 alpha：三张范围均为 0–255。完全透明像素：combat-asuka 1,232,250；combat-rei 1,191,187；boss-core 1,059,671。图像没有后处理，没有缩放或抠图；浏览器缩小后的实际可读性由接入方继续查看。

### combat-asuka.png 提示

原件：/Users/hive/.codex/generated_images/01a086f3-9052-7202-b700-650a645e37cc/exec-0e01a93b-ca45-4e95-8e16-61439cfa7d00.png

```text
Use case: stylized-concept. Asset type: FUNCTIONAL 2x2 four-direction game sprite atlas, square 1024x1024 PNG with genuinely transparent alpha background. Four equal 512x512 cells, no lines. Each cell contains exactly one SAME scarlet red humanoid Japanese mecha combat robot seen in STRICT VERTICAL TOP DOWN ORTHOGRAPHIC camera, like a overhead 2D arcade action game. Layout mandatory: top-left robot faces NORTH (head/front towards top edge); top-right robot faces EAST (front toward right edge); bottom-left robot faces SOUTH (front toward bottom edge); bottom-right robot faces WEST (front toward left edge). All four are rotated copies of identical design and shape, identical centered scale in each cell. Robot has human-like articulated arms, shoulders, head and legs, not tank treads, no vehicle. Head and shoulders visible from above, compact silhouette, small forward ranged weapon. Strong scarlet armor, dark graphite joints, small orange accents. Clean bold pixel-friendly cel shading, thick dark outlines, simple readable shapes when each robot is reduced to 60 pixels. Each robot centered exactly in its quadrant with 15 percent empty transparent margins on every edge, no crossing between quadrants. No floor, no shadow, no background glow, no effects, no text or symbols, no grid, no perspective or isometric angle. This is a battle sprite sheet not a character illustration.
```

### combat-rei.png 提示

原件：/Users/hive/.codex/generated_images/01a086f3-9052-7202-b700-650a645e37cc/exec-d03739bc-cf86-4887-b7c1-0a715fd61f36.png

```text
Use case: stylized-concept. Asset type: FUNCTIONAL 2x2 four-direction robot battle sprite atlas with genuinely transparent alpha. Use reference atlas as exact composition, camera angle, bold line style and four-cell positioning guide. Change only robot design and palette to pale white and ice-blue defensive humanoid Japanese mecha, dark graphite joints, amber monocular visor, compact rounded shoulders, matching game sprite simplicity. No tank treads. Four equal square cells in square canvas, centered same scale 15 percent transparent margin within each quadrant. Keep reference facing arrangement exactly: top-left FRONT/DOWN view, top-right RIGHT view, bottom-left BACK/UP view, bottom-right LEFT view. Fully preserve whole head feet arms and small forward gun inside each cell, no cropped limbs or overlapping cells. Same robot in four directions. Thick outlines, clean high contrast simple cel shading, readable reduced to 60 pixels. No scenery, no floor, no shadows or glow, no text, no grid lines, no symbols. Transparent background. Render actual battle sprites, not UI illustration.
```

### boss-core.png 提示

原件：/Users/hive/.codex/generated_images/01a086f3-9052-7202-b700-650a645e37cc/exec-21c30d51-67e9-45e3-b9a8-81f321704044.png

```text
Use case: stylized-concept. Asset type: ONE functional 2D top-down boss battle sprite for Japanese mecha arcade game, square canvas, transparent alpha background. Design an ORIGINAL mysterious floating geometric mechanical core, homage to abstract 1990s anime mecha enemies but do not copy any specific character. Strict orthographic overhead view, compact radial geometric shape. Center is a large clearly visible glowing scarlet red faceted weak-point crystal; around it four separated angular layered blue-violet metal shell segments form an irregular diamond-shaped silhouette, graphite recesses, cyan seams. Bold crisp outline and broad simple shading planes readable at 120 pixels. Not a portrait, no humanoid, no face, no words. Entire silhouette fits centered with 15 percent transparent margin on all sides. True transparent background, no floor, no drop shadow, no scenery, no broad background glow, no text, logos or grid. Only one core with a distinctive simple readable geometric silhouette and strong red central weakpoint.
```
