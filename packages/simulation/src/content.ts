import type { AttackPattern, BossId, Character, GameMap, MapEnemy, Point } from './types';

export interface BossAttack {
  pattern: AttackPattern;
  warning: number;
  cooldown: number;
  speed: number;
  damage: number;
}
export interface BossPhase {
  id: string;
  name: string;
  /** Enter this phase at or below the given fraction of maximum HP. */
  threshold: number;
  exposure: number;
  attacks: readonly BossAttack[];
}
export interface BossDefinition {
  id: BossId;
  name: string;
  hp: number;
  phases: readonly BossPhase[];
}
const fan = (warning = 1.1): BossAttack => ({
  pattern: 'fan',
  warning,
  cooldown: 3.4,
  speed: 220,
  damage: 14,
});
const cross = (warning = 1.15): BossAttack => ({
  pattern: 'cross',
  warning,
  cooldown: 4.2,
  speed: 230,
  damage: 16,
});
const ring = (warning = 1.3): BossAttack => ({
  pattern: 'ring',
  warning,
  cooldown: 4.5,
  speed: 175,
  damage: 12,
});
const beam = (warning = 1.4): BossAttack => ({
  pattern: 'beam',
  warning,
  cooldown: 4,
  speed: 430,
  damage: 22,
});
export const BOSSES: Record<BossId, BossDefinition> = {
  'dawn-prism': {
    id: 'dawn-prism',
    name: '棱镜 · 初鸣',
    hp: 540,
    phases: [
      {
        id: 'prism-observe',
        name: 'I · 观测 / 扇形弹',
        threshold: 1,
        exposure: 14,
        attacks: [fan()],
      },
      {
        id: 'prism-refract',
        name: 'II · 折射 / 十字交火',
        threshold: 2 / 3,
        exposure: 14,
        attacks: [cross(), fan()],
      },
      {
        id: 'prism-shatter',
        name: 'III · 碎光 / 环形脉冲',
        threshold: 1 / 3,
        exposure: 16,
        attacks: [ring(), fan(0.95)],
      },
    ],
  },
  'river-choir': {
    id: 'river-choir',
    name: '河界 · 鸣钟',
    hp: 680,
    phases: [
      {
        id: 'choir-tune',
        name: 'I · 调律 / 贯穿束',
        threshold: 1,
        exposure: 13,
        attacks: [beam()],
      },
      {
        id: 'choir-echo',
        name: 'II · 回响 / 双重奏',
        threshold: 0.65,
        exposure: 14,
        attacks: [beam(), cross()],
      },
      {
        id: 'choir-break',
        name: 'III · 断流 / 急奏',
        threshold: 0.3,
        exposure: 16,
        attacks: [cross(0.95), beam(1.1)],
      },
    ],
  },
  'void-weaver': {
    id: 'void-weaver',
    name: '虚空 · 织星',
    hp: 620,
    phases: [
      {
        id: 'weaver-orbit',
        name: 'I · 轨道 / 环形弹幕',
        threshold: 1,
        exposure: 13,
        attacks: [ring()],
      },
      {
        id: 'weaver-web',
        name: 'II · 星网 / 交错弹幕',
        threshold: 0.6,
        exposure: 14,
        attacks: [ring(1.1), fan()],
      },
      {
        id: 'weaver-collapse',
        name: 'III · 坍缩 / 线环交替',
        threshold: 0.25,
        exposure: 16,
        attacks: [beam(), ring(1)],
      },
    ],
  },
  'last-seraph': {
    id: 'last-seraph',
    name: '终末 · 晨星',
    hp: 820,
    phases: [
      {
        id: 'seraph-seal',
        name: 'I · 封印 / 十字封锁',
        threshold: 1,
        exposure: 14,
        attacks: [cross()],
      },
      {
        id: 'seraph-wings',
        name: 'II · 展翼 / 扇环交替',
        threshold: 0.7,
        exposure: 15,
        attacks: [fan(0.9), ring(1.1)],
      },
      {
        id: 'seraph-dawn',
        name: 'III · 黎明 / 三重奏',
        threshold: 0.35,
        exposure: 18,
        attacks: [beam(1.2), ring(1), cross(0.9)],
      },
    ],
  },
};

/** Existing playable characters only. Recruitment requires an explicit profile migration and assets. */
export const CHARACTERS: Record<Character, { id: Character; name: string; role: string }> = {
  Asuka: { id: 'Asuka', name: '明日香', role: '突击 / 持续火力' },
  Rei: { id: 'Rei', name: '绫波丽', role: '支援 / 机动爆发' },
};
interface TerrainStrip {
  tile: number;
  from: Point;
  to: Point;
}
export interface LevelDefinition {
  id: string;
  name: string;
  width: number;
  height: number;
  terrain: readonly TerrainStrip[];
  enemies: readonly MapEnemy[];
  entry?: { row: number; red: Point; blue: Point };
  corePads?: readonly Point[];
}
const strip = (tile: number, x: number, y: number, x2 = x, y2 = y): TerrainStrip => ({
  tile,
  from: { x, y },
  to: { x: x2, y: y2 },
});
const enemy = (x: number, y: number, type: number, encounterId?: BossId): MapEnemy => ({
  x,
  y,
  type,
  ...(encounterId ? { boss: true, encounterId } : {}),
});

/** Authored coordinates, objectives and enemy placements, independent from combat behavior. */
export const LEVELS: readonly LevelDefinition[] = [
  {
    id: 'dawn-1-1',
    name: '旧日清晨 · Round 1',
    width: 10,
    height: 10,
    terrain: [],
    enemies: [enemy(0, 3, 1), enemy(2, 0, 2), enemy(7, 0, 1), enemy(9, 3, 2)],
  },
  {
    id: 'dawn-1-2',
    name: '旧日清晨 · 河道变奏',
    width: 10,
    height: 10,
    terrain: [strip(1, 5, 1, 5, 8), strip(4, 5, 3), strip(4, 5, 6)],
    enemies: [enemy(0, 3, 1), enemy(2, 0, 2), enemy(7, 0, 1), enemy(9, 3, 2), enemy(7, 8, 2)],
  },
  {
    id: 'dawn-1-3',
    name: '旧日清晨 · 棱镜初鸣',
    width: 18,
    height: 18,
    terrain: [strip(3, 2, 13, 15, 15), strip(2, 2, 4, 3, 4), strip(2, 14, 4, 15, 4)],
    entry: { row: 11, red: { x: 3, y: 14 }, blue: { x: 14, y: 14 } },
    corePads: [
      { x: 4, y: 7 },
      { x: 13, y: 7 },
    ],
    enemies: [enemy(8, 3, 3, 'dawn-prism'), enemy(3, 9, 1), enemy(14, 9, 1)],
  },
  {
    id: 'river-2-1',
    name: '河岸防线 · 双桥突进',
    width: 22,
    height: 18,
    terrain: [
      strip(1, 10, 1, 10, 16),
      strip(4, 10, 5),
      strip(4, 10, 12),
      strip(2, 4, 7, 6, 7),
      strip(2, 15, 9, 17, 9),
    ],
    enemies: [
      enemy(4, 3, 1),
      enemy(7, 5, 2),
      enemy(15, 3, 3),
      enemy(18, 6, 2),
      enemy(14, 12, 4),
      enemy(18, 14, 1),
    ],
  },
  {
    id: 'river-2-2',
    name: '河岸防线 · 同步水闸',
    width: 22,
    height: 20,
    terrain: [strip(1, 10, 1, 10, 10), strip(4, 10, 5), strip(4, 10, 9), strip(3, 2, 15, 19, 17)],
    entry: { row: 12, red: { x: 4, y: 15 }, blue: { x: 17, y: 15 } },
    enemies: [enemy(4, 5, 2), enemy(7, 8, 1), enemy(16, 3, 3), enemy(17, 8, 4), enemy(14, 10, 1)],
  },
  {
    id: 'river-2-3',
    name: '河岸防线 · 河界鸣钟',
    width: 22,
    height: 20,
    terrain: [strip(1, 5, 3, 5, 5), strip(1, 16, 3, 16, 5), strip(2, 3, 9), strip(2, 18, 9)],
    entry: { row: 13, red: { x: 4, y: 16 }, blue: { x: 17, y: 16 } },
    corePads: [
      { x: 5, y: 9 },
      { x: 16, y: 9 },
    ],
    enemies: [enemy(10, 4, 3, 'river-choir'), enemy(3, 6, 2), enemy(18, 6, 2), enemy(10, 10, 1)],
  },
  {
    id: 'depth-3-1',
    name: '纵深行动 · 交叉火线',
    width: 24,
    height: 20,
    terrain: [
      strip(2, 5, 5, 8, 5),
      strip(2, 15, 5, 18, 5),
      strip(2, 10, 9, 13, 9),
      strip(5, 3, 13, 20, 13),
    ],
    enemies: [
      enemy(4, 3, 3),
      enemy(11, 3, 2),
      enemy(19, 3, 3),
      enemy(5, 8, 4),
      enemy(18, 8, 4),
      enemy(8, 13, 1),
      enemy(15, 13, 1),
    ],
  },
  {
    id: 'depth-3-2',
    name: '纵深行动 · 双极解锁',
    width: 24,
    height: 22,
    terrain: [strip(2, 5, 5, 5, 8), strip(2, 18, 5, 18, 8), strip(5, 7, 10, 16, 10)],
    entry: { row: 14, red: { x: 5, y: 17 }, blue: { x: 18, y: 17 } },
    enemies: [
      enemy(11, 3, 3),
      enemy(3, 7, 2),
      enemy(20, 7, 2),
      enemy(9, 9, 4),
      enemy(14, 9, 3),
      enemy(11, 12, 1),
    ],
  },
  {
    id: 'depth-3-3',
    name: '纵深行动 · 虚空织星',
    width: 24,
    height: 22,
    terrain: [strip(2, 4, 4), strip(2, 19, 4), strip(5, 3, 11, 20, 11)],
    entry: { row: 15, red: { x: 5, y: 18 }, blue: { x: 18, y: 18 } },
    corePads: [
      { x: 5, y: 10 },
      { x: 18, y: 10 },
    ],
    enemies: [enemy(11, 5, 3, 'void-weaver'), enemy(3, 8, 3), enemy(20, 8, 3), enemy(11, 12, 4)],
  },
  {
    id: 'final-4-1',
    name: '黎明之战 · 最后防线',
    width: 26,
    height: 22,
    terrain: [
      strip(2, 6, 5, 9, 5),
      strip(2, 16, 5, 19, 5),
      strip(1, 12, 7, 12, 16),
      strip(4, 12, 11),
      strip(4, 12, 15),
    ],
    enemies: [
      enemy(4, 3, 3),
      enemy(12, 3, 4),
      enemy(21, 3, 3),
      enemy(6, 8, 2),
      enemy(19, 8, 2),
      enemy(6, 13, 4),
      enemy(19, 13, 1),
      enemy(16, 17, 1),
    ],
  },
  {
    id: 'final-4-2',
    name: '黎明之战 · 曙光封印',
    width: 26,
    height: 24,
    terrain: [
      strip(2, 6, 4, 6, 7),
      strip(2, 19, 4, 19, 7),
      strip(2, 10, 10, 15, 10),
      strip(5, 3, 13, 22, 13),
    ],
    entry: { row: 16, red: { x: 5, y: 19 }, blue: { x: 20, y: 19 } },
    enemies: [
      enemy(12, 3, 3),
      enemy(4, 9, 3),
      enemy(21, 9, 3),
      enemy(9, 7, 4),
      enemy(16, 7, 4),
      enemy(9, 13, 2),
      enemy(16, 13, 2),
    ],
  },
  {
    id: 'final-4-3',
    name: '黎明之战 · 终末晨星',
    width: 26,
    height: 24,
    terrain: [
      strip(5, 4, 7, 21, 7),
      strip(2, 4, 4),
      strip(2, 21, 4),
      strip(2, 4, 13),
      strip(2, 21, 13),
    ],
    entry: { row: 17, red: { x: 5, y: 20 }, blue: { x: 20, y: 20 } },
    corePads: [
      { x: 6, y: 12 },
      { x: 19, y: 12 },
    ],
    enemies: [
      enemy(12, 6, 3, 'last-seraph'),
      enemy(5, 9, 3),
      enemy(20, 9, 3),
      enemy(9, 14, 2),
      enemy(16, 14, 2),
    ],
  },
];

export function campaignDefinition(index: number, stage: number): GameMap {
  const level = LEVELS[index * 3 + stage];
  if (index === 0 && stage < 2) {
    const tiles = Array.from({ length: 10 }, () => Array(10).fill(0));
    const enemies = level.enemies.map((e) => ({ ...e }));
    for (const region of level.terrain)
      for (let y = region.from.y; y <= region.to.y; y++)
        for (let x = region.from.x; x <= region.to.x; x++) tiles[y][x] = region.tile;
    return {
      version: 1,
      artSet: 'legacy',
      name: level.name,
      width: 10,
      height: 10,
      tiles,
      spawns: [
        { x: 2, y: 5 },
        { x: 9, y: 5 },
      ],
      enemies,
    };
  }
  const { width, height } = level;
  const tiles: number[][] = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) =>
      !x || !y || x === width - 1 || y === height - 1 ? 2 : 0,
    ),
  );
  for (const region of level.terrain)
    for (let y = region.from.y; y <= region.to.y; y++)
      for (let x = region.from.x; x <= region.to.x; x++) tiles[y][x] = region.tile;
  const gates = [];
  if (level.entry) {
    for (let x = 1; x < width - 1; x++) tiles[level.entry.row][x] = 2;
    for (const x of [Math.floor(width / 2) - 1, Math.floor(width / 2)]) {
      tiles[level.entry.row][x] = 0;
      gates.push({ id: `${level.id}-gate-${x}`, x, y: level.entry.row });
    }
  }
  return {
    version: 1,
    artSet: 'new',
    encounterId: level.id,
    name: level.name,
    width,
    height,
    tiles,
    spawns: [
      { x: Math.floor(width / 2) - 2, y: height - 2 },
      { x: Math.floor(width / 2) + 1, y: height - 2 },
    ],
    enemies: level.enemies.map((e) => ({ ...e })),
    ...(level.entry
      ? { puzzle: { redPad: { ...level.entry.red }, bluePad: { ...level.entry.blue }, gates } }
      : {}),
    ...(level.corePads
      ? {
          cooperation: {
            pads: level.corePads.map((p) => ({ ...p })),
            label: '两名驾驶员同时站位 · 打开核心输出窗口',
          },
        }
      : {}),
  };
}
