import type { Character, Profile, SkillNode, EffectConfig, Slot } from './types';
import { record } from './types';
const branches: Record<Character, [string, string, [string, string, string][]][]> = {
  Asuka: [
    [
      'a-cannon',
      '重装爆发',
      [
        ['双联火控', '普通射击发射两束炮弹。', 'fire'],
        ['连续压制', '双炮齐射持续期间仍可移动。', 'special'],
        ['破晓弹幕', '弹幕期间发射三束炮弹，炮弹可贯穿一个额外目标。', 'ultimate'],
      ],
    ],
    [
      'a-mobility',
      '突击推进',
      [
        ['推进校准', '移动速度提高 15%。', 'speed'],
        ['冲锋屏障', '开启加速获得 1.5 秒 AT 力场。', 'speed'],
        ['同步突击', '推进期间普攻冷却缩短至 0.35 秒，并向近处队友共享推进。', 'ultimate'],
      ],
    ],
    [
      'a-guard',
      '同步守护',
      [
        ['坚韧装甲', '机体最大生命增加 25。', 'heal'],
        ['同步屏障', '终极 AT 力场同时保护 180 范围内队友。', 'special'],
        ['共鸣壁垒', 'AT 力场延长 3 秒并修复范围内双方机体 25 生命。', 'ultimate'],
      ],
    ],
  ],
  Rei: [
    [
      'r-missile',
      '精确打击',
      [
        ['高爆载荷', '导弹爆炸半径扩大至 130，溅射伤害提高至 70。', 'ultimate'],
        ['贯穿射线', '普通射击能贯穿一个额外目标。', 'fire'],
        ['连锁爆破', '导弹命中会发射一次额外 180 范围冲击波。', 'ultimate'],
      ],
    ],
    [
      'r-phase',
      '相位机动',
      [
        ['相位延伸', '瞬移距离增加 60。', 'special'],
        ['相位残响', '瞬移抵达后获得 2 秒同步屏障。', 'special'],
        ['空间救援', '瞬移后修复 180 范围内队友 25 生命，倒地队友立即起身。', 'ultimate'],
      ],
    ],
    [
      'r-rescue',
      '支援共鸣',
      [
        ['修复增幅', '治疗量提高 10，治疗半径扩大至 220。', 'heal'],
        ['救援链接', '近处队友倒地救援所需时间缩短至 1.5 秒。', 'heal'],
        ['生命共鸣', '治疗可直接救起范围内倒地队友，并给予双方 2 秒同步屏障。', 'ultimate'],
      ],
    ],
  ],
};
export const TREES = {} as Record<Character, SkillNode[]>;
for (const [character, list] of Object.entries(branches))
  TREES[character as Character] = list.flatMap(([id, branch, items]) =>
    items.map(([name, description, icon], i) => ({
      id: `${id}-${i + 1}`,
      name,
      description,
      branch,
      tier: i + 1,
      requires: i ? [`${id}-${i}`] : [],
      level: i + 1,
      cost: 1,
      icon,
    })),
  );
function safeXp(x: unknown) {
  return Math.max(0, Math.min(300000, Math.floor(Number(x) || 0)));
}
export function validateBuild(
  character: Character,
  nodes: unknown = [],
  xp: unknown = 0,
): string[] {
  if (!TREES[character]) throw Error('未知角色');
  if (!Array.isArray(nodes)) throw Error('技能配置必须为数组');
  const ids = [...new Set(nodes)];
  if (ids.some((id) => typeof id !== 'string')) throw Error('技能节点不存在');
  const level = 1 + Math.floor(safeXp(xp) / 300);
  if (ids.length > level) throw Error('技能点不足');
  const defs = ids.map((id) => TREES[character].find((n) => n.id === id));
  if (defs.some((n) => !n)) throw Error('技能节点不存在');
  if (defs.some((n) => n!.level > level)) throw Error('角色等级不足');
  if (defs.some((n) => n!.requires.some((id) => !ids.includes(id))))
    throw Error('需要先解锁前置技能');
  if (defs.filter((n) => n!.tier === 3).length > 1) throw Error('只能选择一条终极路线');
  return ids as string[];
}
export function normalizeProfile(value: unknown = {}): Profile {
  const raw = record(value),
    characters = {} as Profile['characters'],
    equipment = {} as Profile['equipment'],
    loadouts = {} as Profile['loadouts'];
  for (const c of ['Asuka', 'Rei'] as const) {
    const old = record(record(raw.characters)[c]),
      xp = safeXp(old.xp);
    let nodes: string[] = [];
    for (const def of TREES[c].slice().sort((a, b) => a.tier - b.tier))
      if (Array.isArray(old.nodes) && old.nodes.includes(def.id)) {
        try {
          nodes = validateBuild(c, [...nodes, def.id], xp);
        } catch {}
      }
    characters[c] = { xp, nodes };
    const eq = record(record(raw.equipment)[c]);
    equipment[c] = { weapon: null, armor: null, module: null };
    for (const slot of ['weapon', 'armor', 'module'] as Slot[])
      equipment[c][slot] = typeof eq[slot] === 'string' ? (eq[slot] as string) : null;
    const l = record(record(raw.loadouts)[c]);
    loadouts[c] = {
      ammo: l.ammo === 'HE' || l.ammo === 'HESH' ? l.ammo : 'AP',
      melee: l.melee === 'blade' || l.melee === 'spear' ? l.melee : c === 'Rei' ? 'spear' : 'blade',
    };
  }
  const records = record(raw.records),
    appearance = record(raw.appearance);
  return {
    characters,
    tickets: Math.max(0, Math.min(1000000, Math.floor(Number(raw.tickets) || 0))),
    pity: Math.max(0, Math.min(9, Math.floor(Number(raw.pity) || 0))),
    drawHistory: Array.isArray(raw.drawHistory) ? raw.drawHistory.slice(0, 30) : [],
    unlocked: Math.min(12, Math.max(1, Math.floor(Number(raw.unlocked) || 1))),
    records: {
      history: Array.isArray(records.history) ? records.history.slice(-100) : [],
      wins: Math.max(0, Math.floor(Number(records.wins) || 0)),
      losses: Math.max(0, Math.floor(Number(records.losses) || 0)),
    },
    coins: Math.max(0, Math.min(100000000, Math.floor(Number(raw.coins) || 0))),
    inventory: Array.isArray(raw.inventory)
      ? [
          ...new Set(
            raw.inventory.filter((id): id is string => typeof id === 'string' && id.length < 80),
          ),
        ]
      : [],
    equipment,
    loadouts,
    appearance: {
      pilot: appearance.pilot === 'Rei' ? 'Rei' : 'Asuka',
      reducedMotion: appearance.reducedMotion === true,
    },
    tutorialComplete: raw.tutorialComplete === true,
  };
}
export function effectConfig(character: Character, nodes: string[] = []): EffectConfig {
  const has = (id: string) => Array.isArray(nodes) && nodes.includes(id);
  return {
    doubleShot: has('a-cannon-1'),
    mobileBarrage: has('a-cannon-2'),
    tripleBarrage: has('a-cannon-3'),
    pierce: has('r-missile-2') || has('a-cannon-3') ? 1 : 0,
    speedMultiplier: has('a-mobility-1') ? 1.15 : 1,
    boostShield: has('a-mobility-2'),
    sharedBoost: has('a-mobility-3'),
    extraHp: has('a-guard-1') ? 25 : 0,
    sharedShield: has('a-guard-2'),
    fortress: has('a-guard-3'),
    missileRadius: has('r-missile-1') ? 130 : 80,
    splashDamage: has('r-missile-1') ? 70 : 50,
    chainBlast: has('r-missile-3'),
    teleportExtra: has('r-phase-1') ? 60 : 0,
    phaseShield: has('r-phase-2'),
    phaseRescue: has('r-phase-3'),
    healBonus: has('r-rescue-1') ? 10 : 0,
    healRadius: has('r-rescue-1') ? 220 : 150,
    fastRescue: has('r-rescue-2'),
    resurrection: has('r-rescue-3'),
  };
}
