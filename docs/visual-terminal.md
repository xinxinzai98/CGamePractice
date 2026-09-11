# 工业作战终端视觉

视觉依据：工作区 `outputs/游戏界面参考-20260911/当前视觉方案.md`。深炭黑 #101619、象牙白 #E9E4D5、橙红 #E65032、青绿 #69BCB0；固定 1600×900 等比缩放。

全局主题在 `client/src/terminal-theme.css`，由 main.tsx 最后导入；EVA 面板在 `ui/eva-panels.css`，战斗局部主题在 `ui/battle-terminal.css`。修改时保持各自作用域，避免扩大到模拟、碰撞和存档层。

主导航：作战大厅、机甲研究、成员升级、后勤整备库、补给与配额、作战档案、MAGI 演习。`skills` 与 `members` 共用实际研究动作但独立显示所属对象。成员无新等级字段。

Phaser 战场 viewport 为 (280,70,1040,690)，保留原地图、实时输入和预警计算。地图加入正交网格并采用深灰地面；两侧是真实双人状态/目标，底栏保留原有技能及物资操作。

资源复用原插画和精灵，无整页 UI 位图覆盖。运行 `npm run dev:server` 与 `npm run dev`，浏览 http://127.0.0.1:5173 。验证见项目根 design-qa.md。

## 标题字与图标接入

已确认样式板落地为 `client/public/identity` 中的标题字及图标图集。封面、顶部品牌、战斗侧栏使用统一标题字；TerminalIcon.tsx 管理 7 个导航和 9 个战斗图标，SkillIcon 保持既有调用接口。冷却数字、禁用状态、ARIA 名称仍由代码驱动。资源说明与提示词要点见 identity/README.md。

本轮验证：TypeScript 与 build 通过；1280×720 浏览器检查封面、导航、训练战斗图标。点击推进后显示 15 秒冷却且能量变化，暂停和返回正常；浏览器 error 日志为空。截图位于 work/identity-qa/。未修改战斗规则，本轮不重复整套网络/存储回归。
