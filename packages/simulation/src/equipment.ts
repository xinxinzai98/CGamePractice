import type { GearMods, Slot } from './types';
export interface EquipmentItem {
  id: string;
  name: string;
  slot: Slot;
  price: number;
  icon: string;
  description: string;
  mods: Partial<GearMods>;
  rarity?: string;
}
export const ITEMS: EquipmentItem[] = [
  {
    id: 'pulse-coil',
    name: '脉冲增幅线圈',
    slot: 'weapon',
    price: 90,
    icon: 'fire',
    description: '主武器与技能直击伤害 +10%。',
    mods: { damageMult: 1.1 },
  },
  {
    id: 'resonance-core',
    name: '共振火控核心',
    slot: 'weapon',
    price: 220,
    icon: 'special',
    description: '主武器与技能直击伤害 +20%。',
    mods: { damageMult: 1.2 },
  },
  {
    id: 'composite-armor',
    name: '复合装甲片',
    slot: 'armor',
    price: 80,
    icon: 'ultimate',
    description: '机体生命上限 +15。',
    mods: { hpBonus: 15 },
  },
  {
    id: 'at-lining',
    name: 'A.T. 缓冲衬层',
    slot: 'armor',
    price: 200,
    icon: 'ultimate',
    description: '机体生命上限 +30。',
    mods: { hpBonus: 30 },
  },
  {
    id: 'vector-thruster',
    name: '矢量推进模组',
    slot: 'module',
    price: 120,
    icon: 'speed',
    description: '移动速度 +12%。',
    mods: { speedMult: 1.12 },
  },
  {
    id: 'sync-relay',
    name: '同步中继模块',
    slot: 'module',
    price: 180,
    icon: 'heal',
    description: '全部主动技能冷却 -12%；C 主动恢复同步能量并短暂获得护盾。',
    mods: { cooldownMult: 0.88 },
  },
];
export function modsFor(ids: unknown = []): GearMods {
  const mods: GearMods = { damageMult: 1, hpBonus: 0, speedMult: 1, cooldownMult: 1 },
    slots = new Set();
  for (const id of new Set(Array.isArray(ids) ? ids : [])) {
    const item = ITEMS.find((i) => i.id === id);
    if (!item || slots.has(item.slot)) continue;
    slots.add(item.slot);
    for (const [key, val] of Object.entries(item.mods))
      if (key === 'hpBonus') mods[key as keyof GearMods] += val;
      else mods[key as keyof GearMods] *= val;
  }
  return mods;
}
