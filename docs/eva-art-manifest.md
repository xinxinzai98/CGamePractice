# EVA v3.1 美术资源清单

本批资源于 2026-09-10 生成并核对。新增 7 张独立 PNG、4 台机体战斗 SVG 与 12 个战术符号，均位于 `client/public/eva/`，浏览器 URL 使用 `/eva/` 前缀。本清单只记录资源交付；应用接入与战斗行为由客户端和共享模拟验收。

## 成员与机体卡

| 内容 ID | 浏览器路径 | 像素尺寸 | 区分特征 |
| --- | --- | --- | --- |
| `member.rebuild.shinji` | `/eva/portrait-shinji.png` | 1254 × 1254 | 短棕发，白与深蓝驾驶服 |
| `member.rebuild.mari` | `/eva/portrait-mari.png` | 1254 × 1254 | 棕色双马尾，红框眼镜，粉色驾驶服 |
| `member.rebuild.misato` | `/eva/portrait-misato.png` | 1254 × 1254 | 紫色长发，红色指挥夹克 |
| `member.rebuild.ritsuko` | `/eva/portrait-ritsuko.png` | 1254 × 1254 | 金色短发，白色实验外套 |
| `member.rebuild.maya` | `/eva/portrait-maya.png` | 1254 × 1254 | 棕色短发，白色作战人员制服 |
| `machine.rebuild.eva01.base` | `/eva/mecha-unit01.png` | 1024 × 1536 | 紫绿装甲，独角，修长肩部支架 |
| `machine.rebuild.eva08.alpha` | `/eva/mecha-unit08.png` | 1024 × 1536 | 粉白装甲，复数光学传感器，长步枪 |

头像采用暗石墨背景、柔和颜色光与细窄青色轮廓光。新头像使用 `object-fit: cover; object-position: center`；机体卡展示完整机体时使用 `object-fit: contain`。成员头像可圆形裁切，48 px 以下建议仅用于身份提示，详细选择使用至少 96 px。

明日香、绫波丽继续使用 `web/assets/pilot-asuka.png`、`pilot-rei.png`；零号机、二号机原卡继续使用 `mecha-rei.png`、`mecha-asuka.png`，由现有 `/assets/` 资源路由提供。这四张仅按原有对应身份复用，本批未复制改名为新人物。原长头像建议裁切位置 `50% 20%`。

## 战斗与战术符号

| 用途 | 浏览器路径 | 尺寸与特征 |
| --- | --- | --- |
| 零号机 | `/eva/battle-unit00.svg` | 128 × 128，独眼、浅蓝白护甲、宽防护臂 |
| 初号机 | `/eva/battle-unit01.svg` | 128 × 128，独角、紫绿装甲 |
| 二号机 | `/eva/battle-unit02.svg` | 128 × 128，双角四眼、双联炮、红橙装甲 |
| 八号机 α | `/eva/battle-unit08.svg` | 128 × 128，八目传感器、长步枪、粉白装甲 |
| 突击／限制器释放 | `/eva/skill-assault.svg` | 64 × 64，折线突击轨迹 |
| 防护／屏障 | `/eva/skill-barrier.svg` | 64 × 64，多层防护盾 |
| 反击／同步释放 | `/eva/skill-counter.svg` | 64 × 64，回转轨迹与放电 |
| 标记／弱点诊断 | `/eva/skill-mark.svg` | 64 × 64，目标瞄准 |
| 救援 | `/eva/skill-rescue.svg` | 64 × 64，救援十字 |
| 供能／同步中继 | `/eva/skill-energy.svg` | 64 × 64，储能单元 |
| 交叉火力 | `/eva/sync-crossfire.svg` | 64 × 64，两条独立射线汇合 |
| 屏障掩护 | `/eva/sync-cover.svg` | 64 × 64，两名成员位于共同屏障下 |
| Boss 武装部位 | `/eva/part-weapon.svg` | 64 × 64，炮塔与炮管 |
| Boss 防护部位 | `/eva/part-shield.svg` | 64 × 64，屏障发生器 |
| Boss 核心 | `/eva/part-core.svg` | 64 × 64，六角约束结构与核心 |
| 战场供能点 | `/eva/power-zone.svg` | 64 × 64，可连接供能站 |

战斗机体为固定单帧、朝上、中心锚点 `(0.5, 0.5)`。使用时按移动／瞄准方向旋转；SVG 不含动画骨架，不是 Live2D。Phaser 推荐 `scene.load.svg(key, url, {width: 128, height: 128})`。12 个符号适合深色背景，采用有语义的机件与动作图形，未依赖外部图标字体。机体持有的示意武装表现类型；实际弹道及技能仍由当前配置驱动。

## 来源、复现与验证

- 7 张 PNG 使用内置 `image_gen` 逐张生成，未调用 CLI/API fallback，未改名旧图冒充新角色。完整提示词、工具原始路径和项目路径记录在 `work/eva-art/generation.json`。项目 PNG 与工具原始输出逐字节相同，生成原件保留。
- SVG 为本批编写的原生矢量资源，可由 `node work/eva-art/build-vectors.cjs` 重建。图形带可读标题、透明背景、固定 `viewBox`，不包含外部图片、字体或脚本。
- 已目视检查全部 PNG 的人物／机体身份、服装、构图及边缘；角色脸部与机体身体均未被边界裁断。已用 macOS Quick Look 渲染四机型和代表性技能／部位／同步图标，输出保留在 `work/eva-art/`。
- `node work/eva-art/verify-assets.cjs` 检查 23 个资源的数量、PNG 尺寸与唯一 SHA-256、复制一致性、完整提示词，以及 SVG 尺寸、可读标题与依赖限制。结果见 `work/eva-art/verification.json`。
- 所有形象是本项目 EVA 改编视觉资源，不宣称官方授权素材或原作精确模型。单帧机体已经具备可辨识轮廓；多帧步行、动作演出和精细破损状态不包含于本批。
