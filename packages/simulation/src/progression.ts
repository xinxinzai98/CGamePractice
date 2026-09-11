import { ValidationError, ProtocolError } from './errors';
import { ITEMS } from './equipment';
import type { BattleRecord, DrawRecord, DrawReward, Stats } from './types';
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
export function validateBuild(character: Character, nodes: unknown = [], xp: number = 0): string[] {
  if (!TREES[character]) throw new ValidationError('未知角色');
  if (!Array.isArray(nodes)) throw new ValidationError('技能配置必须为数组');
  const ids = [...new Set(nodes)];
  if (ids.some((id) => typeof id !== 'string')) throw new ValidationError('技能节点不存在');
  const level = 1 + Math.floor(xp / 300);
  if (ids.length > level) throw new ValidationError('技能点不足');
  const defs = ids.map((id) => TREES[character].find((n) => n.id === id));
  if (defs.some((n) => !n)) throw new ValidationError('技能节点不存在');
  if (defs.some((n) => n!.level > level)) throw new ValidationError('角色等级不足');
  if (defs.some((n) => n!.requires.some((id) => !ids.includes(id))))
    throw new ValidationError('需要先解锁前置技能');
  if (defs.filter((n) => n!.tier === 3).length > 1)
    throw new ValidationError('只能选择一条终极路线');
  return ids as string[];
}
export function migrateLegacyProfile(
  value: unknown,
  onWarning: (message: string) => void = console.warn,
): Profile {
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
        } catch (error) {
          if (!(error instanceof ValidationError)) throw error;
        }
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
  const migrated: Profile = {
    characters,
    tickets: Math.max(0, Math.min(1000000, Math.floor(Number(raw.tickets) || 0))),
    pity: Math.max(0, Math.min(9, Math.floor(Number(raw.pity) || 0))),
    drawHistory: migrateHistory(raw.drawHistory, parseDrawRecord, 30, onWarning, 'drawHistory'),
    unlocked: Math.min(12, Math.max(1, Math.floor(Number(raw.unlocked) || 1))),
    records: {
      history: migrateHistory(
        records.history,
        parseBattleRecord,
        100,
        onWarning,
        'records.history',
      ),
      wins: Math.max(0, Math.floor(Number(records.wins) || 0)),
      losses: Math.max(0, Math.floor(Number(records.losses) || 0)),
    },
    coins: Math.max(0, Math.min(100000000, Math.floor(Number(raw.coins) || 0))),
    inventory: Array.isArray(raw.inventory)
      ? [
          ...new Set(
            raw.inventory.filter(
              (id): id is string => typeof id === 'string' && ITEMS.some((item) => item.id === id),
            ),
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
  for (const c of ['Asuka', 'Rei'] as const)
    for (const slot of ['weapon', 'armor', 'module'] as const) {
      const id = migrated.equipment[c][slot];
      if (
        id !== null &&
        (!migrated.inventory.includes(id) || !ITEMS.some((i) => i.id === id && i.slot === slot))
      ) {
        migrated.equipment[c][slot] = null;
        onWarning(`Migration equipment.${c}.${slot}: discarded invalid equipment`);
      }
    }
  return parseProfile(migrated);
}
export function effectConfig(character: Character, nodes: string[] = []): EffectConfig {
  const has = (id: string) => nodes.includes(id);
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

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ProtocolError(`${path}: expected object`);
  return value as Record<string, unknown>;
}
function number(
  value: unknown,
  path: string,
  max = Number.MAX_SAFE_INTEGER,
  integer = true,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > max ||
    (integer && !Number.isInteger(value))
  )
    throw new ProtocolError(`${path}: invalid number`);
  return value;
}
function boolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new ProtocolError(`${path}: expected boolean`);
  return value;
}
function string(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.length)
    throw new ProtocolError(`${path}: expected nonempty string`);
  return value;
}
function array(value: unknown, path: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max)
    throw new ProtocolError(`${path}: invalid array`);
  return value;
}
function timestamp(value: unknown, path: string): string {
  const at = string(value, path);
  if (!Number.isFinite(Date.parse(at))) throw new ProtocolError(`${path}: invalid ISO timestamp`);
  return at;
}
function character(value: unknown): Character {
  if (value !== 'Asuka' && value !== 'Rei') throw new ProtocolError('Unknown character');
  return value;
}
function parseStats(value: unknown): Stats {
  const raw = object(value, 'stats'),
    stats = {} as Stats;
  for (const key of [
    'shots',
    'hits',
    'damage',
    'taken',
    'rescues',
    'healing',
    'assists',
    'moved',
    'heals',
    'skills',
    'melee',
    'meleeHits',
  ] as const)
    stats[key] = number(raw[key], `stats.${key}`, Number.MAX_SAFE_INTEGER, false);
  const uses = object(raw.skillUses, 'stats.skillUses');
  stats.skillUses = {
    heal: number(uses.heal, 'skillUses.heal'),
    speed: number(uses.speed, 'skillUses.speed'),
    special: number(uses.special, 'skillUses.special'),
    ultimate: number(uses.ultimate, 'skillUses.ultimate'),
  };
  return stats;
}
export function parseBattleRecord(value: unknown): BattleRecord {
  const r = object(value, 'BattleRecord');
  return {
    round: string(r.round, 'round'),
    at: timestamp(r.at, 'at'),
    character: character(r.character),
    mission: number(r.mission, 'mission', 3),
    stage: number(r.stage, 'stage', 2),
    won: boolean(r.won, 'won'),
    xp: number(r.xp, 'xp'),
    score: number(r.score, 'score', Number.MAX_SAFE_INTEGER, false),
    time: number(r.time, 'time', Number.MAX_SAFE_INTEGER, false),
    stats: parseStats(r.stats),
  };
}
export function parseDrawReward(value: unknown): DrawReward {
  const r = object(value, 'DrawReward'),
    itemId = string(r.itemId, 'itemId'),
    item = ITEMS.find((i) => i.id === itemId);
  if (!item) throw new ProtocolError(`Unknown reward equipment: ${itemId}`);
  const rarity = r.rarity;
  if (rarity !== 'standard' && rarity !== 'rare') throw new ProtocolError('Invalid reward rarity');
  const duplicate = boolean(r.duplicate, 'duplicate'),
    coins = number(r.coins, 'coins'),
    pityTriggered = boolean(r.pityTriggered, 'pityTriggered');
  return { itemId, rarity, duplicate, coins, pityTriggered };
}
function parseDrawRecord(value: unknown): DrawRecord {
  const r = object(value, 'DrawRecord');
  return { ...parseDrawReward(r), at: timestamp(r.at, 'at') };
}
function migrateHistory<T>(
  value: unknown,
  parse: (value: unknown) => T,
  limit: number,
  warn: (message: string) => void,
  path: string,
): T[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    warn(`Migration ${path}: discarded malformed history`);
    return [];
  }
  const result: T[] = [];
  let discarded = 0;
  for (const entry of value) {
    try {
      const parsed = parse(entry);
      if (result.length < limit) result.push(parsed);
      else discarded++;
    } catch (error) {
      if (!(error instanceof ProtocolError)) throw error;
      discarded++;
    }
  }
  if (discarded) warn(`Migration ${path}: discarded ${discarded} invalid or excess record(s)`);
  return result;
}
export function createProfile(): Profile {
  return {
    characters: { Asuka: { xp: 0, nodes: [] }, Rei: { xp: 0, nodes: [] } },
    tickets: 0,
    pity: 0,
    drawHistory: [],
    unlocked: 1,
    records: { history: [], wins: 0, losses: 0 },
    coins: 0,
    inventory: [],
    equipment: {
      Asuka: { weapon: null, armor: null, module: null },
      Rei: { weapon: null, armor: null, module: null },
    },
    loadouts: { Asuka: { ammo: 'AP', melee: 'blade' }, Rei: { ammo: 'AP', melee: 'spear' } },
    appearance: { pilot: 'Asuka', reducedMotion: false },
    tutorialComplete: false,
  };
}
export function parseProfile(value: unknown): Profile {
  const raw = object(value, 'Profile'),
    chars = object(raw.characters, 'characters'),
    equipped = object(raw.equipment, 'equipment'),
    loads = object(raw.loadouts, 'loadouts');
  const characters = {} as Profile['characters'],
    equipment = {} as Profile['equipment'],
    loadouts = {} as Profile['loadouts'];
  const inventory = array(raw.inventory, 'inventory', ITEMS.length).map((v) => {
    const id = string(v, 'inventory');
    if (!ITEMS.some((i) => i.id === id))
      throw new ProtocolError(`Unknown inventory equipment: ${id}`);
    return id;
  });
  if (new Set(inventory).size !== inventory.length)
    throw new ProtocolError('Duplicate inventory equipment');
  for (const c of ['Asuka', 'Rei'] as const) {
    const r = object(chars[c], `characters.${c}`),
      xp = number(r.xp, 'xp', 300000),
      nodes = array(r.nodes, 'nodes', 9).map((v) => string(v, 'node'));
    if (new Set(nodes).size !== nodes.length) throw new ProtocolError('Duplicate skill nodes');
    try {
      validateBuild(c, nodes, xp);
    } catch (error) {
      if (!(error instanceof ValidationError)) throw error;
      throw new ProtocolError(`Invalid ${c} skill build: ${error.message}`);
    }
    characters[c] = { xp, nodes };
    const eq = object(equipped[c], `equipment.${c}`);
    equipment[c] = { weapon: null, armor: null, module: null };
    for (const slot of ['weapon', 'armor', 'module'] as const) {
      const id = eq[slot];
      if (
        id !== null &&
        (typeof id !== 'string' ||
          !inventory.includes(id) ||
          !ITEMS.some((i) => i.id === id && i.slot === slot))
      )
        throw new ProtocolError(`Invalid equipped ${c}.${slot}`);
      equipment[c][slot] = id;
    }
    const l = object(loads[c], `loadouts.${c}`);
    if (
      (l.ammo !== 'AP' && l.ammo !== 'HE' && l.ammo !== 'HESH') ||
      (l.melee !== 'blade' && l.melee !== 'spear')
    )
      throw new ProtocolError(`Invalid loadout ${c}`);
    loadouts[c] = { ammo: l.ammo, melee: l.melee };
  }
  const records = object(raw.records, 'records'),
    appearance = object(raw.appearance, 'appearance'),
    unlocked = number(raw.unlocked, 'unlocked', 12);
  if (unlocked < 1) throw new ProtocolError('Invalid unlocked stage');
  return {
    characters,
    equipment,
    loadouts,
    inventory,
    unlocked,
    coins: number(raw.coins, 'coins', 100000000),
    tickets: number(raw.tickets, 'tickets', 1000000),
    pity: number(raw.pity, 'pity', 9),
    drawHistory: array(raw.drawHistory, 'drawHistory', 30).map(parseDrawRecord),
    records: {
      history: array(records.history, 'records.history', 100).map(parseBattleRecord),
      wins: number(records.wins, 'wins'),
      losses: number(records.losses, 'losses'),
    },
    appearance: {
      pilot: character(appearance.pilot),
      reducedMotion: boolean(appearance.reducedMotion, 'reducedMotion'),
    },
    tutorialComplete: boolean(raw.tutorialComplete, 'tutorialComplete'),
  };
}
