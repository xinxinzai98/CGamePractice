export * from './eva-types';
export * from './eva-content';
import { ValidationError, ProtocolError } from './errors';
import {
  IDS,
  MACHINES,
  MEMBERS,
  WEAPONS,
  EQUIPMENT,
  AMMO,
  CONSUMABLES,
  NODES,
  MISSIONS,
  OFFERS,
  CHALLENGES,
  COSMETICS,
  BALANCE,
  CAPACITIES,
  RULE_VERSION,
} from './eva-content';
import type {
  EvaProfile,
  LoadoutPreset,
  ResolvedLoadout,
  EvaLevel,
  MachineProgress,
  MemberProgress,
  EvaStats,
  ProgressionNode,
  RewardCategory,
  EvaDrawRecord,
  EvaBattleRecord,
  RewardBreakdown,
  BattleReview,
  BattleEvent,
  MachineType,
} from './eva-types';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const byId = <T extends { id: string }>(items: T[], id: string, what: string): T => {
  const value = items.find((item) => item.id === id);
  if (!value) throw new ValidationError(`未知${what}：${id}`);
  return value;
};
function fail(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ValidationError(message);
}
function unique(values: string[], label: string) {
  fail(
    Array.isArray(values) &&
      values.every((v) => typeof v === 'string') &&
      new Set(values).size === values.length,
    `${label}不能重复或包含无效值`,
  );
}
function integer(value: unknown, label: string, max = Number.MAX_SAFE_INTEGER): number {
  fail(
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max,
    `${label}必须是有效非负整数`,
  );
  return value;
}
function finite(value: unknown, label: string, max = Number.MAX_SAFE_INTEGER): number {
  fail(
    typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max,
    `${label}无效`,
  );
  return value;
}
function safeAdd(a: number, b: number): number {
  return integer(a + b, '累计值');
}
const machineProgress = (id: string): MachineProgress => ({
  level: 1,
  data: 0,
  totalData: 0,
  unlocked: [`${id}.M01`],
  damage: 0,
});
const memberProgress = (id: string): MemberProgress => ({
  data: 0,
  totalData: 0,
  unlocked: [`${id}.M01`],
  proficiency: { attack: 0, defense: 0, balance: 0, support: 0 },
  sorties: {},
});

export function defaultPreset(
  machineId: string = IDS.eva02,
  driverId?: string,
  supportId: string = IDS.misato,
): LoadoutPreset {
  const machine = byId(MACHINES, machineId, '机体');
  driverId ??= MEMBERS.find((m) => m.role === 'driver' && m.resonanceMachineId === machineId)!.id;
  return {
    id: `preset.${machineId}`,
    name: `${machine.name}基础配置`,
    machineId,
    driverId,
    supportId,
    branch: '',
    weaponId: 'weapon.rifle',
    meleeId: machine.melee[0],
    equipment: [],
    skills: [`${machineId}.M01`],
    driverSkills: [],
    supportSkills: [],
    ammo: {},
    consumables: {},
    cosmeticId: null,
  };
}
export function createProfile(): EvaProfile {
  const presets = [defaultPreset(IDS.eva02), defaultPreset(IDS.eva00)];
  return {
    wallet: {
      silver: BALANCE.initialSilver,
      gold: 0,
      generalData: 0,
      tickets: BALANCE.initialTickets,
      credentials: 0,
    },
    machines: { [IDS.eva00]: machineProgress(IDS.eva00), [IDS.eva02]: machineProgress(IDS.eva02) },
    members: {
      [IDS.rei]: memberProgress(IDS.rei),
      [IDS.asuka]: memberProgress(IDS.asuka),
      [IDS.misato]: memberProgress(IDS.misato),
    },
    owned: {
      machines: [IDS.eva00, IDS.eva02],
      members: [IDS.rei, IDS.asuka, IDS.misato],
      equipment: [],
      cosmetics: ['cosmetic.nerv-standard'],
    },
    stock: {
      'ammo.precision': 20,
      'ammo.high-explosive': 12,
      'ammo.resonance': 10,
      'consumable.repair': 2,
      'consumable.battery': 2,
      'consumable.barrier': 2,
    },
    presets,
    activePresetId: presets[0].id,
    pity: 0,
    draws: [],
    licenseExpiresAt: 0,
    autoRepair: false,
    autoSupply: false,
    service: { completed: [], routes: {}, rescues: 0, protection: 0 },
    battles: [],
  };
}
export function simulationProfile(): EvaProfile {
  const p = createProfile();
  for (const machine of MACHINES) {
    p.machines[machine.id] = {
      ...machineProgress(machine.id),
      level: 3,
      unlocked: NODES.filter((n) => n.ownerId === machine.id).map((n) => n.id),
    };
  }
  for (const member of MEMBERS) {
    p.members[member.id] = {
      ...memberProgress(member.id),
      unlocked: NODES.filter((n) => n.ownerId === member.id).map((n) => n.id),
      proficiency: { attack: 12000, defense: 12000, balance: 12000, support: 12000 },
      sorties: Object.fromEntries(MACHINES.map((m) => [m.id, 100])),
    };
  }
  p.owned = {
    machines: MACHINES.map((m) => m.id),
    members: MEMBERS.map((m) => m.id),
    equipment: EQUIPMENT.map((e) => e.id),
    cosmetics: COSMETICS.map((c) => c.id),
  };
  p.stock = Object.fromEntries([...AMMO, ...CONSUMABLES].map((s) => [s.id, s.carryLimit]));
  return p;
}
function ownedProgress(profile: EvaProfile, ownerId: string) {
  const machine = MACHINES.find((m) => m.id === ownerId),
    member = MEMBERS.find((m) => m.id === ownerId);
  fail(machine || member, '研究对象不存在');
  fail(
    machine ? profile.owned.machines.includes(ownerId) : profile.owned.members.includes(ownerId),
    '尚未拥有研究对象',
  );
  return {
    machine,
    member,
    progress: machine ? profile.machines[ownerId] : profile.members[ownerId],
  };
}
export function research(profile: EvaProfile, ownerId: string, nodeId: string) {
  const { machine, progress } = ownedProgress(profile, ownerId),
    n = byId(NODES, nodeId, '研究节点');
  fail(n.ownerId === ownerId, '节点不属于当前研究对象');
  if (progress.unlocked.includes(nodeId))
    return { nodeId, alreadyUnlocked: true, dataSpent: 0, generalDataSpent: 0 };
  fail(!n.migrationOnly, '该旧式能力只由历史档案迁移授予；MAGI 中可试用');
  fail(
    n.requires.every((id) => progress.unlocked.includes(id)) &&
      (!n.requiresAny.length || n.requiresAny.some((id) => progress.unlocked.includes(id))),
    '永久研究前置未满足',
  );
  if (machine)
    fail((progress as MachineProgress).level >= n.level, '需要先支付经费完成对应机体整备等级');
  if (n.machineId) {
    fail(profile.owned.machines.includes(n.machineId), '尚未拥有共鸣或精通目标机体');
    const mp = progress as MemberProgress,
      target = byId(MACHINES, n.machineId, '目标机体');
    fail((mp.sorties[n.machineId] || 0) >= (n.sorties || 0), '成员与目标机体的有效实战次数不足');
    fail(mp.proficiency[target.type] >= (n.proficiency || 0), '目标类型熟练度不足');
  }
  const dataSpent = Math.min(progress.data, n.cost),
    generalDataSpent = machine ? n.cost - dataSpent : 0;
  fail(
    machine ? generalDataSpent <= profile.wallet.generalData : progress.data >= n.cost,
    '可用培养数据不足',
  );
  progress.data -= machine ? dataSpent : n.cost;
  profile.wallet.generalData -= generalDataSpent;
  progress.unlocked.push(nodeId);
  return {
    nodeId,
    alreadyUnlocked: false,
    dataSpent: machine ? dataSpent : n.cost,
    generalDataSpent,
  };
}
export function upgrade(profile: EvaProfile, machineId: string) {
  const { machine, progress } = ownedProgress(profile, machineId);
  fail(machine, '只有机体可整备升级');
  const p = progress as MachineProgress;
  if (p.level === 3) return { machineId, level: p.level, cost: 0, alreadyUpgraded: true };
  const next = (p.level + 1) as 2 | 3;
  fail(
    NODES.some(
      (n) => n.ownerId === machineId && n.grantsLevel === next && p.unlocked.includes(n.id),
    ),
    '尚未研究本级整备资格',
  );
  const cost = BALANCE.upgrade[next];
  fail(profile.wallet.silver >= cost, '作战经费不足，晋阶资格保留');
  profile.wallet.silver -= cost;
  p.level = next;
  return { machineId, level: next, cost, alreadyUpgraded: false };
}
function addStats(stats: EvaStats, extra: Partial<EvaStats> | undefined) {
  if (!extra) return;
  for (const key of Object.keys(extra) as (keyof EvaStats)[]) {
    const value = extra[key]!;
    stats[key] = key === 'hp' || key === 'energyRegen' ? stats[key] + value : stats[key] * value;
  }
}
function supplyValidation(
  values: Record<string, number>,
  kind: 'ammo' | 'consumables',
  weaponId: string,
) {
  fail(values && typeof values === 'object' && !Array.isArray(values), '携行物资格式无效');
  const keys = Object.keys(values);
  fail(keys.length <= 2, kind === 'ammo' ? '最多携带两类特殊弹药' : '最多携带两类消耗品');
  for (const id of keys) {
    const def = byId(kind === 'ammo' ? AMMO : CONSUMABLES, id, '物资');
    integer(values[id], def.name, def.carryLimit);
    fail(values[id] > 0, '携行数量必须大于零');
    if (kind === 'ammo')
      fail(byId(WEAPONS, weaponId, '武器').ammo.includes(id), '主武器不兼容所选弹药');
  }
}
export function resolveLoadout(
  profile: EvaProfile,
  preset: LoadoutPreset,
  options: {
    entityId?: string;
    accountId?: string;
    levelCap?: EvaLevel;
    simulation?: boolean;
  } = {},
): ResolvedLoadout {
  fail(preset && typeof preset === 'object', '出战配置无效');
  const p = options.simulation ? simulationProfile() : profile;
  const machine = byId(MACHINES, preset.machineId, '机体'),
    driver = byId(MEMBERS, preset.driverId, '驾驶员'),
    support = byId(MEMBERS, preset.supportId, '支援成员');
  fail(!preset.target || options.simulation, '目标方案需要拥有并完成研究后才能正式出战');
  fail(
    p.owned.machines.includes(machine.id) &&
      p.owned.members.includes(driver.id) &&
      p.owned.members.includes(support.id),
    '编组包含尚未拥有的机体或成员',
  );
  fail(
    driver.role === 'driver' && support.role === 'support' && driver.id !== support.id,
    '成员岗位不合法',
  );
  const mp = p.machines[machine.id];
  fail(options.simulation || mp.damage < 1, '机体已击毁，需要维修或参加后勤整备试验');
  for (const cap of [options.levelCap, preset.levelCap])
    if (cap !== undefined) fail(cap === 1 || cap === 2 || cap === 3, '任务等级上限无效');
  const level = Math.min(mp.level, options.levelCap || 3, preset.levelCap || 3) as EvaLevel,
    caps = CAPACITIES[level];
  const lists = ['equipment', 'skills', 'driverSkills', 'supportSkills'] as const;
  for (const list of lists) {
    unique(preset[list], list);
    fail(preset[list].length <= caps[list], `${level} 级${list}容量不足，请选择对应低等级预设`);
  }
  fail(
    typeof preset.branch === 'string' &&
      (!preset.branch || machine.branches.includes(preset.branch)),
    '机体路线无效',
  );
  if (preset.branch)
    fail(
      NODES.some(
        (n) =>
          n.ownerId === machine.id &&
          n.branch === preset.branch &&
          n.level <= level &&
          mp.unlocked.includes(n.id),
      ),
      '当前等级尚未研究所选机体路线',
    );
  const weapon = byId(WEAPONS, preset.weaponId, '主武器'),
    melee = byId(WEAPONS, preset.meleeId, '近战武器');
  fail(weapon.kind === 'primary' && melee.kind === 'melee', '武器岗位不合法');
  for (const selected of [weapon, melee])
    fail(
      NODES.some(
        (n) =>
          n.ownerId === machine.id &&
          n.level <= level &&
          mp.unlocked.includes(n.id) &&
          n.weaponIds?.includes(selected.id),
      ),
      '机体尚未取得所选武器的有效等级授权',
    );
  supplyValidation(preset.ammo, 'ammo', weapon.id);
  supplyValidation(preset.consumables, 'consumables', weapon.id);
  fail(
    preset.cosmeticId === null || p.owned.cosmetics.includes(preset.cosmeticId),
    '尚未拥有所选外观',
  );
  const selectedNodes: ProgressionNode[] = [],
    groups = new Set<string>();
  for (const [key, ownerId, slot] of [
    ['skills', machine.id, 'tactical'],
    ['driverSkills', driver.id, 'driver'],
    ['supportSkills', support.id, 'support'],
  ] as const) {
    let resonanceCount = 0;
    const personalBranches = new Set<string>();
    for (const id of preset[key]) {
      const n = byId(NODES, id, '技能');
      fail(n.slot === slot, '技能占槽位置不合法');
      fail(
        n.ownerId === ownerId ||
          (slot === 'tactical' &&
            n.kind === 'resonance' &&
            [driver.id, support.id].includes(n.ownerId)),
        '技能不属于当前机体或岗位成员',
      );
      const progress = p.machines[n.ownerId] || p.members[n.ownerId];
      fail(progress?.unlocked.includes(id), '技能尚未永久解锁');
      fail(n.level <= level, '技能高于任务有效等级');
      if (n.ownerId === machine.id && n.branch)
        fail(n.branch === preset.branch, '机体技能与当前互斥路线不兼容');
      if (n.machineId) fail(n.machineId === machine.id, '共鸣或精通目标机体不匹配');
      fail(
        n.activationRequires.every((req) => {
          const required = byId(NODES, req, '激活前置');
          return (
            progress.unlocked.includes(req) &&
            required.level <= level &&
            (!required.branch || required.branch === preset.branch)
          );
        }),
        '当前技能激活前置未满足',
      );
      if (n.kind === 'resonance') {
        resonanceCount++;
        fail(resonanceCount <= 1, '每名成员最多装备一个共鸣');
      }
      if (n.ownerId !== machine.id && n.branch) personalBranches.add(n.branch);
      if (n.formGroup) {
        fail(!groups.has(n.formGroup), '同组技能形式不能重复装配');
        groups.add(n.formGroup);
      }
      selectedNodes.push(n);
    }
    fail(personalBranches.size <= 1, '成员的互斥分支不能同时装配');
  }
  const selectedEffects = selectedNodes.map((n) => n.effect);
  for (const forms of [
    ['barrage', 'arsenal'],
    ['barrier', 'fortress'],
    ['counter', 'retaliation'],
    ['awakening', 'awakening-burst'],
  ])
    fail(
      forms.filter((effect) => selectedEffects.includes(effect)).length <= 1,
      '基础技能与替换形式不能重复占槽',
    );
  const stats = { ...machine.stats };
  stats.hp += (level - 1) * 12;
  const passives = [driver.passive, support.passive];
  for (const n of NODES.filter(
    (n) =>
      n.ownerId === machine.id &&
      mp.unlocked.includes(n.id) &&
      n.level <= level &&
      !n.slot &&
      (n.kind === 'general' || (n.branch === preset.branch && n.kind === 'branch')),
  )) {
    addStats(stats, n.stats);
    if (n.effect) passives.push(n.effect);
  }
  for (const member of [driver, support]) {
    const progress = p.members[member.id],
      memberSelected = selectedNodes.filter((n) => n.ownerId === member.id),
      branch = memberSelected.find((n) => n.branch)?.branch;
    for (const n of NODES.filter(
      (n) =>
        n.ownerId === member.id &&
        progress.unlocked.includes(n.id) &&
        !n.slot &&
        (n.kind === 'general' ||
          (n.kind === 'mastery' && n.machineId === machine.id && n.branch === branch)),
    ))
      addStats(stats, n.stats);
    const tier = Math.min(
      4,
      Math.floor(progress.proficiency[machine.type] / BALANCE.proficiencyTier),
    );
    if (member.role === 'driver') stats.speedMult *= 1 + tier * 0.01;
    else stats.energyRegen += tier * 0.1;
  }
  const equipmentGroups = new Set<string>();
  for (const id of preset.equipment) {
    const e = byId(EQUIPMENT, id, '装备');
    fail(p.owned.equipment.includes(id), '尚未拥有装备');
    fail(!e.machineIds.length || e.machineIds.includes(machine.id), '精通装备与机体型号不兼容');
    fail(!e.types.length || e.types.includes(machine.type), '装备与机体类型不兼容');
    fail(!equipmentGroups.has(e.group), '同效果组装备互斥');
    equipmentGroups.add(e.group);
    addStats(stats, e.stats);
    if (e.passive) passives.push(e.passive);
  }
  for (const n of selectedNodes) if (n.slot !== 'tactical' && n.effect) passives.push(n.effect);
  stats.hp = Math.round(Math.min(stats.hp, machine.stats.hp + 80 + (level - 1) * 12));
  stats.damageMult = Math.min(stats.damageMult, 1.55);
  stats.speedMult = Math.min(stats.speedMult, 1.4);
  stats.cooldownMult = Math.max(0.65, stats.cooldownMult);
  stats.energyRegen = Math.min(10, stats.energyRegen);
  const legacyNodes = Object.entries(profile.migration?.nodes || {})
    .filter(([oldId, mapped]) => {
      if (
        (oldId.startsWith('a-') && machine.id !== IDS.eva02) ||
        (oldId.startsWith('r-') && machine.id !== IDS.eva00)
      )
        return false;
      if (oldId === 'a-cannon-1' && weapon.id !== 'weapon.twin') return false;
      if (oldId === 'r-missile-2' && weapon.id !== 'weapon.cannon') return false;
      return mapped.every((id) => {
        const n = NODES.find((n) => n.id === id);
        if (!n || n.level > level) return false;
        if (n.ownerId !== machine.id && n.ownerId !== driver.id && n.ownerId !== support.id)
          return false;
        const progress = p.machines[n.ownerId] || p.members[n.ownerId];
        if (!progress?.unlocked.includes(id)) return false;
        return n.slot
          ? selectedNodes.some((selected) => selected.id === id)
          : !n.branch || n.branch === preset.branch;
      });
    })
    .map(([id]) => id);
  // The legacy armor talent supplied +25 HP; G1 now supplies +8. Preserve the difference only for this valid migrated build.
  if (legacyNodes.includes('a-guard-1')) stats.hp += 17;
  return {
    entityId: options.entityId || 'p1',
    accountId: options.accountId || 'local',
    preset: clone(preset),
    machineId: machine.id,
    driverId: driver.id,
    supportId: support.id,
    level,
    type: machine.type,
    hpFraction: options.simulation ? 1 : 1 - mp.damage,
    stats,
    skills: selectedNodes.filter((n) => n.slot === 'tactical').map((n) => n.effect!),
    passives: [...new Set(passives)],
    legacyCharacter: machine.type === 'attack' || machine.type === 'balance' ? 'Asuka' : 'Rei',
    legacyNodes,
  };
}
export function savePreset(profile: EvaProfile, preset: LoadoutPreset) {
  fail(typeof preset.id === 'string' && /^[\w.-]{1,120}$/.test(preset.id), '预设 ID 无效');
  fail(
    typeof preset.name === 'string' && preset.name.trim().length > 0 && preset.name.length <= 60,
    '预设名称需为 1–60 字',
  );
  const validationProfile = clone(profile);
  if (validationProfile.machines[preset.machineId])
    validationProfile.machines[preset.machineId].damage = 0;
  resolveLoadout(validationProfile, preset, { simulation: preset.target === true });
  const index = profile.presets.findIndex((p) => p.id === preset.id);
  fail(index >= 0 || profile.presets.length < 32, '最多保存 32 份预设');
  if (index >= 0) profile.presets[index] = clone(preset);
  else profile.presets.push(clone(preset));
  profile.activePresetId = preset.id;
  return { preset: clone(preset), cost: 0 };
}

function rewardItems(category: RewardCategory): { id: string }[] {
  return category === 'machine'
    ? MACHINES
    : category === 'driver' || category === 'support'
      ? MEMBERS.filter((m) => m.role === category)
      : category === 'equipment'
        ? EQUIPMENT.filter((e) => e.category === 'ordinary')
        : category === 'ammo'
          ? AMMO
          : category === 'consumable'
            ? CONSUMABLES
            : COSMETICS.slice(0, 3);
}
function ownedArray(profile: EvaProfile, category: RewardCategory) {
  return category === 'machine'
    ? profile.owned.machines
    : category === 'driver' || category === 'support'
      ? profile.owned.members
      : category === 'equipment'
        ? profile.owned.equipment
        : category === 'cosmetic'
          ? profile.owned.cosmetics
          : null;
}
function grant(
  profile: EvaProfile,
  category: RewardCategory,
  itemId: string,
  quantity: number,
  duplicates: boolean,
) {
  const owned = ownedArray(profile, category),
    duplicate = !!owned?.includes(itemId);
  let credentials = 0;
  if (duplicate) {
    fail(duplicates, '永久内容已拥有，不能重复购买或调拨');
    credentials = BALANCE.duplicate[category];
    profile.wallet.credentials = safeAdd(profile.wallet.credentials, credentials);
  } else if (owned) {
    owned.push(itemId);
    if (category === 'machine') profile.machines[itemId] = machineProgress(itemId);
    else if (category === 'driver' || category === 'support')
      profile.members[itemId] = memberProgress(itemId);
  } else profile.stock[itemId] = safeAdd(profile.stock[itemId] || 0, quantity);
  return { duplicate, credentials };
}
export function purchase(profile: EvaProfile, offerId: string, quantity = 1, now = Date.now()) {
  const offer = byId(OFFERS, offerId, '商品');
  integer(quantity, '购买数量', 10000);
  fail(quantity > 0, '购买数量必须大于零');
  const stackable = ['ammo', 'consumable', 'license'].includes(offer.category);
  fail(stackable || quantity === 1, '永久内容只能购买一份');
  if (offer.category !== 'license') {
    const owned = ownedArray(profile, offer.category);
    fail(!owned?.includes(offer.itemId), '永久内容已拥有，不能重复购买');
  }
  const cost = integer(offer.price * quantity, '商品总价');
  fail(
    profile.wallet[offer.currency] >= cost,
    offer.currency === 'silver' ? '作战经费不足' : '特务配额不足',
  );
  if (offer.category === 'license') {
    integer(now, '当前时间');
    integer(
      Math.max(now, profile.licenseExpiresAt) + (offer.durationMs || 0) * quantity,
      '许可到期时间',
    );
  }
  if (offer.category === 'ammo' || offer.category === 'consumable')
    safeAdd(profile.stock[offer.itemId] || 0, quantity * offer.quantity);
  profile.wallet[offer.currency] -= cost;
  if (offer.category === 'license')
    profile.licenseExpiresAt =
      Math.max(now, profile.licenseExpiresAt) + (offer.durationMs || 0) * quantity;
  else grant(profile, offer.category, offer.itemId, quantity * offer.quantity, false);
  return {
    offerId,
    itemId: offer.itemId,
    quantity: quantity * offer.quantity,
    currency: offer.currency,
    cost,
    licenseExpiresAt: profile.licenseExpiresAt,
  };
}
export function draw(profile: EvaProfile, random: () => number): EvaDrawRecord {
  fail(profile.wallet.tickets >= 1, '补给申请券不足');
  const r = () => {
    const value = random();
    fail(
      typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 1,
      '随机源必须返回 [0, 1)',
    );
    return value;
  };
  const pityBefore = profile.pity,
    pityTriggered = pityBefore >= BALANCE.pityThreshold;
  const categories = (Object.keys(BALANCE.categoryProbability) as RewardCategory[]).filter(
    (c) => !pityTriggered || ['machine', 'driver', 'support'].includes(c),
  );
  const total = categories.reduce((n, c) => n + BALANCE.categoryProbability[c], 0),
    roll = r() * total;
  let cumulative = 0,
    category = categories.at(-1)!;
  for (const c of categories) {
    cumulative += BALANCE.categoryProbability[c];
    if (roll < cumulative) {
      category = c;
      break;
    }
  }
  const items = rewardItems(category),
    item = items[Math.floor(r() * items.length)],
    quantity =
      category === 'ammo' || category === 'consumable'
        ? byId(category === 'ammo' ? AMMO : CONSUMABLES, item.id, '物资').pack
        : 1;
  if (category === 'ammo' || category === 'consumable')
    safeAdd(profile.stock[item.id] || 0, quantity);
  const { duplicate, credentials } = grant(profile, category, item.id, quantity, true);
  profile.wallet.tickets--;
  profile.pity = ['machine', 'driver', 'support'].includes(category) ? 0 : pityBefore + 1;
  const result: EvaDrawRecord = {
    at: Date.now(),
    pool: `ordinary.${RULE_VERSION}`,
    category,
    itemId: item.id,
    quantity,
    duplicate,
    credentials,
    pityTriggered,
    pityBefore,
    pityAfter: profile.pity,
    categoryProbability: BALANCE.categoryProbability[category] / total,
    itemProbability: BALANCE.categoryProbability[category] / total / items.length,
  };
  profile.draws.unshift(result);
  profile.draws = profile.draws.slice(0, BALANCE.drawHistoryLimit);
  return clone(result);
}
export function exchange(
  profile: EvaProfile,
  category: RewardCategory,
  itemId: string,
  quantity = 1,
) {
  fail(Object.keys(BALANCE.exchange).includes(category), '调拨类别无效');
  byId(rewardItems(category), itemId, '可调拨物品');
  integer(quantity, '调拨数量', 10000);
  fail(quantity > 0, '调拨数量必须大于零');
  const owned = ownedArray(profile, category);
  fail(!owned?.includes(itemId), '永久内容已拥有');
  fail(!owned || quantity === 1, '永久内容只能调拨一份');
  const cost = integer(BALANCE.exchange[category] * quantity, '调拨价格');
  fail(profile.wallet.credentials >= cost, '调拨凭证不足');
  if (!owned) safeAdd(profile.stock[itemId] || 0, quantity);
  profile.wallet.credentials -= cost;
  grant(profile, category, itemId, quantity, false);
  return { category, itemId, quantity, cost };
}
export function repairPrice(profile: EvaProfile, machineId: string): number {
  const { machine, progress } = ownedProgress(profile, machineId);
  fail(machine, '维修对象必须为机体');
  const p = progress as MachineProgress;
  return p.damage === 0 ? 0 : (p.repairDue ?? Math.ceil(BALANCE.repairMaximum[p.level] * p.damage));
}
export function repair(profile: EvaProfile, machineId: string) {
  const cost = repairPrice(profile, machineId);
  fail(profile.wallet.silver >= cost, '作战经费不足，可参加后勤整备试验');
  profile.wallet.silver -= cost;
  profile.machines[machineId].damage = 0;
  profile.machines[machineId].repairDue = 0;
  return { machineId, cost };
}

function ownEvents(record: EvaBattleRecord): BattleEvent[] {
  const seen = new Set<string>();
  return record.events.filter((e) => {
    if (seen.has(e.id) || e.actorId !== record.entityId) return false;
    seen.add(e.id);
    return true;
  });
}
function sum(events: BattleEvent[], kind: string): number {
  return events.filter((e) => e.kind === kind).reduce((n, e) => n + Math.max(0, e.amount ?? 1), 0);
}
function emptyReward(): RewardBreakdown {
  return {
    eligible: false,
    reason: '没有满足条件的有效任务进展',
    score: 0,
    machineData: 0,
    driverData: 0,
    supportData: 0,
    generalData: 0,
    silverBase: 0,
    licenseBonus: 0,
    silverGross: 0,
    repairCost: 0,
    supplyCost: 0,
    silverNet: 0,
    tickets: 0,
    challenges: [],
    scoreParts: { objective: 0, output: 0, protection: 0, support: 0, participation: 0 },
    maintenanceShortfall: 0,
  };
}
export function scoreBattle(record: EvaBattleRecord): RewardBreakdown {
  const mission = byId(MISSIONS, record.missionId, '任务'),
    events = ownEvents(record),
    reward = emptyReward();
  const progress = Math.min(
    mission.stages,
    integer(record.completedStages, '已完成阶段数', mission.stages),
  );
  finite(record.elapsed, '战斗时长');
  const damage = sum(events, 'damage') + sum(events, 'part-damage'),
    protection = sum(events, 'protection'),
    support = sum(events, 'healing') + sum(events, 'support') + sum(events, 'rescue') * 50;
  const participation = sum(events, 'participation'),
    objective = sum(events, 'objective') + sum(events, 'coop');
  const active =
    record.elapsed > 0 &&
    damage + protection + support + objective > 0 &&
    (participation >= Math.min(5, record.elapsed) ||
      damage + protection + support >= 20 ||
      objective >= 1);
  if (record.mode === 'magi' || record.mode === 'tutorial') {
    reward.reason = '模拟与教学不发放正式收益';
    return reward;
  }
  if (!progress || !active) return reward;
  if (record.mode === 'recovery') {
    fail(record.missionId === 'mission.recovery', '后勤整备试验必须使用独立恢复任务');
    reward.eligible = true;
    reward.reason = '后勤整备试验只恢复作战经费';
    reward.silverBase = Math.floor((BALANCE.recoverySilver * progress) / mission.stages);
    reward.silverGross = reward.silverBase;
    reward.silverNet = reward.silverGross;
    return reward;
  }
  fail(
    record.mode === 'operation' && record.missionId !== 'mission.recovery',
    '任务与奖励模式不兼容',
  );
  const absolute = mission.scoring,
    capped = (value: number, goal: number) => Math.min(1, value / goal);
  const parts = {
    objective: capped(objective, absolute.objective),
    output: capped(damage, absolute.output),
    protection: capped(protection, absolute.protection),
    support: capped(support, absolute.support),
    participation: capped(participation, absolute.participation),
  };
  const S =
      0.4 * parts.objective +
      0.4 * Math.max(parts.output, parts.protection, parts.support) +
      0.2 * parts.participation,
    R = record.won ? BALANCE.winMultiplier : 1;
  const E = Math.floor(mission.dataPerStage * progress * R * (0.8 + 0.4 * S)),
    lic = record.license ? BALANCE.licenseMultiplier : 1;
  reward.eligible = true;
  reward.reason = record.won ? '完成任务，按有效贡献结算' : '按已经完成的阶段与有效贡献结算';
  reward.score = S;
  reward.scoreParts = parts;
  reward.machineData = Math.floor(E * lic);
  reward.driverData = reward.machineData;
  reward.supportData = Math.floor(E * BALANCE.supportRatio * lic);
  reward.generalData = Math.floor(reward.machineData * BALANCE.generalRatio);
  reward.silverBase = Math.floor(mission.silverPerStage * progress * R * (0.8 + 0.4 * S));
  reward.silverGross = Math.floor(reward.silverBase * lic);
  reward.licenseBonus = reward.silverGross - reward.silverBase;
  reward.silverNet = reward.silverGross;
  reward.tickets = record.won ? mission.ticketsPerWin || 0 : 0;
  return reward;
}
export function awardBattle(profile: EvaProfile, record: EvaBattleRecord): RewardBreakdown {
  fail(typeof record.round === 'string' && record.round.length > 0, '局次 ID 不可为空');
  const previous = profile.battles.find((r) => r.round === record.round);
  if (previous?.reward) return clone(previous.reward);
  const participant = record.participants.find((p) => p.entityId === record.entityId);
  fail(participant, '找不到结算参战实体');
  fail(
    new Set(record.participants.map((p) => p.entityId)).size === record.participants.length,
    '重复参战实体 ID',
  );
  finite(record.hpFraction, '结束耐久比例', 1);
  integer(record.at, '结算时间');
  for (const event of record.events) {
    fail(typeof event.id === 'string' && event.id.length > 0, '事件 ID 无效');
    finite(event.time, '事件时间');
    integer(event.seq, '事件序号');
    if (event.amount !== undefined) finite(event.amount, '有效事件数值');
  }
  const reward = scoreBattle(record);
  if (record.mode === 'magi' || record.mode === 'tutorial') return reward;
  const p = participant;
  if (record.mode === 'operation') {
    fail(
      profile.machines[p.machineId] && profile.members[p.driverId] && profile.members[p.supportId],
      '结算配置不是账号已拥有内容',
    );
    const machine = profile.machines[p.machineId];
    machine.damage = 1 - record.hpFraction;
    machine.repairDue = Math.ceil(BALANCE.repairMaximum[p.level] * machine.damage);
    if (reward.eligible) {
      machine.data = safeAdd(machine.data, reward.machineData);
      machine.totalData = safeAdd(machine.totalData, reward.machineData);
      for (const [memberId, amount] of [
        [p.driverId, reward.driverData],
        [p.supportId, reward.supportData],
      ] as const) {
        const member = profile.members[memberId],
          def = byId(MEMBERS, memberId, '成员');
        member.data = safeAdd(member.data, amount);
        member.totalData = safeAdd(member.totalData, amount);
        const unlicensed = record.license ? scoreBattle({ ...record, license: false }) : reward;
        const training = memberId === p.driverId ? unlicensed.driverData : unlicensed.supportData;
        member.proficiency[p.type] = Math.min(
          BALANCE.proficiencyMax,
          member.proficiency[p.type] +
            Math.floor(training * (def.familiarTypes.includes(p.type) ? 1.1 : 1)),
        );
        member.sorties[p.machineId] = safeAdd(member.sorties[p.machineId] || 0, 1);
      }
      profile.wallet.generalData = safeAdd(profile.wallet.generalData, reward.generalData);
      profile.wallet.tickets = safeAdd(profile.wallet.tickets, reward.tickets);
      const events = ownEvents(record);
      profile.service.rescues = safeAdd(profile.service.rescues, sum(events, 'rescue'));
      profile.service.protection = safeAdd(
        profile.service.protection,
        Math.floor(
          events
            .filter((e) => e.kind === 'protection' && e.targetId && e.targetId !== p.entityId)
            .reduce((n, e) => n + (e.amount || 0), 0),
        ),
      );
      if (record.won) {
        const validRouteEffects = NODES.filter(
          (n) => n.ownerId === p.machineId && n.branch === p.preset.branch,
        ).map((n) => n.effect);
        const routeEvidenced = p.preset.branch
          ? events.some(
              (e) =>
                validRouteEffects.includes(e.sourceId) &&
                ['skill', 'damage', 'passive-trigger'].includes(e.kind),
            )
          : events.some((e) => ['damage', 'part-damage', 'protection', 'support'].includes(e.kind));
        if (routeEvidenced) {
          const key = `${record.missionId}@${record.ruleVersion}`,
            routes = (profile.service.routes[key] ??= []);
          const signature = `${p.machineId}:${p.preset.branch || 'baseline'}`;
          if (!routes.includes(signature)) routes.push(signature);
        }
      }
      for (const challenge of CHALLENGES) {
        if (profile.service.completed.includes(challenge.id) || p.level < challenge.minLevel)
          continue;
        let done = false;
        if (challenge.kind === 'survival') {
          const standing = new Map(record.participants.map((player) => [player.entityId, true]));
          for (const event of record.events) {
            if (event.kind === 'downed') standing.set(event.actorId, false);
            if (event.kind === 'rescue' && event.targetId) standing.set(event.targetId, true);
          }
          done =
            record.won &&
            record.hpFraction > 0 &&
            record.participants.length >= 2 &&
            record.participants.every(
              (player) =>
                standing.get(player.entityId) &&
                record.events.some(
                  (e) =>
                    e.actorId === player.entityId &&
                    ['damage', 'protection', 'support', 'rescue', 'objective'].includes(e.kind),
                ),
            );
        } else if (challenge.kind === 'routes')
          done = Object.values(profile.service.routes).some(
            (routes) => routes.length >= challenge.target,
          );
        else if (challenge.kind === 'rescue') done = profile.service.rescues >= challenge.target;
        else done = profile.service.protection >= challenge.target;
        if (done) {
          profile.service.completed.push(challenge.id);
          if (!profile.owned.cosmetics.includes(challenge.rewardId))
            profile.owned.cosmetics.push(challenge.rewardId);
          reward.challenges.push(challenge.id);
        }
      }
    }
  }
  profile.wallet.silver = safeAdd(profile.wallet.silver, reward.silverGross);
  profile.battles.unshift({ ...clone(record), reward: clone(reward) });
  profile.battles = profile.battles.slice(0, BALANCE.battleHistoryLimit);
  return reward;
}
export function reviewBattle(record: EvaBattleRecord): BattleReview {
  const events = ownEvents(record),
    review: BattleReview = {
      round: record.round,
      ruleVersion: record.ruleVersion,
      condition: record.condition,
      ...(record.difficulty ? { difficulty: record.difficulty } : {}),
      metrics: {
        damage: sum(events, 'damage'),
        partDamage: sum(events, 'part-damage'),
        protection: sum(events, 'protection'),
        support: sum(events, 'support') + sum(events, 'healing'),
        rescues: sum(events, 'rescue'),
        energySpent: sum(events, 'energy-spent'),
        passiveTriggers: events.filter((e) => e.kind === 'passive-trigger').length,
        skills: events.filter((e) => e.kind === 'skill').length,
      },
      observations: [],
    };
  const protection = events.filter((e) => e.kind === 'protection' && (e.amount || 0) > 0);
  if (protection.length)
    review.observations.push({
      text: `本局屏障实际吸收 ${Math.round(review.metrics.protection)} 点伤害，已计入有效防护。`,
      eventIds: protection.slice(0, 5).map((e) => e.id),
      phaseId: protection[0].phaseId,
    });
  const windows = record.events.filter((e) => e.kind === 'core-exposed');
  const empty = windows.filter(
    (window) =>
      !events.some((e) => e.kind === 'skill' && e.time >= window.time && e.time <= window.time + 6),
  );
  if (empty.length)
    review.observations.push({
      text: `记录到 ${empty.length} 次核心暴露后的 6 秒内未使用战术技能；可从相应阶段复习。`,
      eventIds: empty.slice(0, 5).map((e) => e.id),
      phaseId: empty[0].phaseId,
    });
  if (review.observations.length < 2) {
    const usages = events.filter((e) => e.kind === 'ammo-used'),
      p = record.participants.find((p) => p.entityId === record.entityId),
      unused = Object.keys(p?.preset.ammo || {}).filter(
        (id) => !usages.some((e) => e.sourceId === id),
      );
    // Absence is grounded in the frozen loadout and complete round record, not invented event counts.
    if (unused.length && record.events.length)
      review.observations.push({
        text: `携带的${unused.map((id) => AMMO.find((a) => a.id === id)?.name || id).join('、')}未记录使用。`,
        eventIds: [record.events.at(-1)!.id],
      });
  }
  if (!review.observations.length && events.length) {
    const objective = events.find((e) => e.kind === 'objective' || e.kind === 'coop');
    const evidence =
      objective || events.find((e) => ['damage', 'support', 'healing', 'rescue'].includes(e.kind));
    if (evidence)
      review.observations.push({
        text: objective
          ? '该阶段记录到有效机制贡献，已用于按绝对目标评分。'
          : '有效战斗贡献已记录；可在 MAGI 中使用相同种子比较配置。',
        eventIds: [evidence.id],
        phaseId: evidence.phaseId,
      });
  }
  if (!review.observations.length) {
    const actions = events.filter((e) => e.kind === 'skill' || e.kind === 'energy-spent');
    if (actions.length)
      review.observations.push({
        text: `记录到 ${review.metrics.skills} 次战术技能使用、${Math.round(review.metrics.energySpent)} 点能量消耗，本次尚无有效命中或支援事件。`,
        eventIds: actions.slice(0, 5).map((e) => e.id),
        phaseId: actions[0].phaseId,
      });
  }
  review.observations = review.observations.slice(0, 2);
  return review;
}

/** Explicit ability preservation. Original source remains in the legacy profile envelope. */
export const LEGACY_NODE_MAP: Record<string, string[]> = {
  'a-cannon-1': [`${IDS.eva02}.M02`],
  'a-cannon-2': [`${IDS.eva02}.B2`],
  'a-cannon-3': [`${IDS.eva02}.B3`],
  'a-mobility-1': [`${IDS.eva02}.A1`],
  'a-mobility-2': [`${IDS.eva02}.A2`],
  'a-mobility-3': [`${IDS.asuka}.resonance`],
  'a-guard-1': [`${IDS.eva02}.G1`],
  'a-guard-2': [`${IDS.eva02}.legacy-guard`],
  'a-guard-3': [`${IDS.eva02}.legacy-fortress`],
  'r-missile-1': [`${IDS.eva00}.M02`, `${IDS.eva00}.legacy-missile`],
  'r-missile-2': [`${IDS.eva00}.M04`],
  'r-missile-3': [`${IDS.rei}.A3`, `${IDS.eva00}.legacy-missile`],
  'r-phase-1': [`${IDS.eva00}.B1`, `${IDS.eva00}.M04`],
  'r-phase-2': [`${IDS.eva00}.B2`, `${IDS.eva00}.M04`],
  'r-phase-3': [`${IDS.eva00}.B3`],
  'r-rescue-1': [`${IDS.rei}.G4`],
  'r-rescue-2': [`${IDS.rei}.B2`],
  'r-rescue-3': [`${IDS.rei}.resonance`],
};
export const LEGACY_EQUIPMENT_MAP: Record<string, string> = {
  'pulse-coil': 'equipment.pulse-coil',
  'resonance-core': 'equipment.resonance-core',
  'composite-armor': 'equipment.composite-armor',
  'at-lining': 'equipment.at-lining',
  'vector-thruster': 'equipment.vector-thruster',
  'sync-relay': 'equipment.sync-relay',
};
export function migrateProfile(legacy: unknown): EvaProfile {
  const raw = (
    legacy && typeof legacy === 'object' && !Array.isArray(legacy) ? legacy : {}
  ) as Record<string, any>;
  if (raw.eva) return parseProfile(raw.eva);
  if (raw.wallet && raw.machines) return parseProfile(raw);
  const p = createProfile(),
    numeric = (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : 0);
  p.wallet.silver = numeric(raw.coins);
  p.wallet.tickets = numeric(raw.tickets);
  p.wallet.gold = 0;
  p.pity = Math.min(BALANCE.pityThreshold, numeric(raw.pity));
  p.migration = {
    nodes: {},
    grants: [],
    legacyDraws: clone(Array.isArray(raw.drawHistory) ? raw.drawHistory : []),
    legacyBattles: clone(Array.isArray(raw.records?.history) ? raw.records.history : []),
    notes: [
      '旧 XP 全额保留为对应驾驶员累计值和可用预算；旧节点作为一次性迁移授予，不套用新成本扣除。',
      '新机体数据、通用战术数据和历史支援实战进度均从 0 开始；旧 coins 仅转作战经费。',
      '旧 0–9 保底计数按同值延续，旧稀有装备保底权益改为不晚于原剩余次数触发联合成员/机体保底。',
      '初始物资为新制明确赠送，不追扣历史消耗。',
    ],
  };
  for (const oldId of Array.isArray(raw.inventory) ? raw.inventory : [])
    if (LEGACY_EQUIPMENT_MAP[oldId] && !p.owned.equipment.includes(LEGACY_EQUIPMENT_MAP[oldId]))
      p.owned.equipment.push(LEGACY_EQUIPMENT_MAP[oldId]);
  const grantNode = (nodeId: string) => {
    const n = byId(NODES, nodeId, '迁移节点'),
      progress = p.machines[n.ownerId] || p.members[n.ownerId];
    if (progress.unlocked.includes(nodeId)) return;
    for (const req of n.requires) grantNode(req);
    if (n.requiresAny.length && !n.requiresAny.some((id) => progress.unlocked.includes(id)))
      grantNode(n.requiresAny[0]);
    if (p.machines[n.ownerId])
      p.machines[n.ownerId].level = Math.max(p.machines[n.ownerId].level, n.level) as EvaLevel;
    progress.unlocked.push(nodeId);
    p.migration!.grants.push(nodeId);
  };
  for (const [old, mid, driverId] of [
    ['Asuka', IDS.eva02, IDS.asuka],
    ['Rei', IDS.eva00, IDS.rei],
  ] as const) {
    const oldProgress = raw.characters?.[old] || {},
      xp = numeric(oldProgress.xp);
    p.members[driverId].data = xp;
    p.members[driverId].totalData = xp;
    const oldNodes = Array.isArray(oldProgress.nodes) ? oldProgress.nodes : [];
    for (const oldNode of oldNodes)
      if (LEGACY_NODE_MAP[oldNode]) {
        p.migration.nodes[oldNode] = LEGACY_NODE_MAP[oldNode];
        for (const id of LEGACY_NODE_MAP[oldNode]) grantNode(id);
      }
    const preset = p.presets.find((s) => s.machineId === mid)!;
    preset.id = `preset.legacy.${old.toLowerCase()}`;
    preset.name = `旧${old === 'Asuka' ? '明日香' : '绫波丽'}配置`;
    const oldEquipment = Object.values(raw.equipment?.[old] || {}).filter(
      (id): id is string =>
        typeof id === 'string' &&
        !!LEGACY_EQUIPMENT_MAP[id] &&
        p.owned.equipment.includes(LEGACY_EQUIPMENT_MAP[id]),
    );
    const groups = new Set<string>();
    preset.equipment = oldEquipment
      .map((id) => LEGACY_EQUIPMENT_MAP[id])
      .filter((id) => {
        const group = byId(EQUIPMENT, id, '装备').group;
        if (groups.has(group)) return false;
        groups.add(group);
        return true;
      });
    if (oldEquipment.includes('sync-relay')) grantNode(`${mid}.relay`);
    const mapped = NODES.filter(
        (n) => n.ownerId === mid && p.machines[mid].unlocked.includes(n.id) && n.branch,
      ),
      route =
        mapped.sort((a, b) => b.level - a.level).find((n) => n.slot === 'tactical')?.branch ||
        mapped[0]?.branch ||
        '';
    preset.branch = route;
    let requiredLevel = Math.max(p.machines[mid].level, preset.equipment.length || 1) as EvaLevel;
    for (const lev of [2, 3] as const)
      if (requiredLevel >= lev) {
        grantNode(`${mid}.${lev === 2 ? 'M03' : 'M05'}`);
        p.machines[mid].level = lev;
        p.migration.grants.push(`upgrade:${mid}:${lev}`);
      }
    const lv = p.machines[mid].level;
    const skills = NODES.filter(
      (n) =>
        n.ownerId === mid &&
        n.slot === 'tactical' &&
        p.machines[mid].unlocked.includes(n.id) &&
        n.level <= lv &&
        (!n.branch || n.branch === route),
    );
    const replaced = new Set<string>(),
      forms = new Set<string>();
    preset.skills = skills
      .sort((a, b) => b.level - a.level)
      .filter((n) => {
        if (replaced.has(n.effect!) || (n.formGroup && forms.has(n.formGroup))) return false;
        if (n.formGroup) forms.add(n.formGroup);
        const base: Record<string, string> = {
          arsenal: 'barrage',
          fortress: 'barrier',
          retaliation: 'counter',
          'awakening-burst': 'awakening',
        };
        if (base[n.effect!]) replaced.add(base[n.effect!]);
        return true;
      })
      .slice(0, CAPACITIES[lv].skills)
      .map((n) => n.id);
    const dskills = NODES.filter(
      (n) =>
        n.ownerId === driverId &&
        n.slot === 'driver' &&
        p.members[driverId].unlocked.includes(n.id),
    );
    const personal = dskills.filter((n) => n.kind === 'branch').sort((a, b) => b.cost - a.cost)[0],
      resonance = dskills.find((n) => n.kind === 'resonance');
    preset.driverSkills = [personal, resonance]
      .filter((n): n is ProgressionNode => !!n)
      .slice(0, CAPACITIES[lv].driverSkills)
      .map((n) => n.id);
    const authorized = NODES.filter(
      (n) => n.ownerId === mid && p.machines[mid].unlocked.includes(n.id),
    ).flatMap((n) => n.weaponIds || []);
    if (old === 'Asuka' && oldNodes.includes('a-cannon-1')) preset.weaponId = 'weapon.twin';
    else if (old === 'Rei' && oldNodes.includes('r-missile-2')) preset.weaponId = 'weapon.cannon';
    const oldMelee =
      raw.loadouts?.[old]?.melee === 'spear'
        ? 'melee.spear'
        : raw.loadouts?.[old]?.melee === 'blade'
          ? 'melee.blade'
          : byId(MACHINES, mid, '机体').melee[0];
    if (!authorized.includes(oldMelee)) grantNode(`${mid}.M04`);
    preset.meleeId = oldMelee;
    resolveLoadout(p, preset);
  }
  p.activePresetId = raw.appearance?.pilot === 'Rei' ? p.presets[1].id : p.presets[0].id;
  return parseProfile(p);
}

export function parseProfile(value: unknown): EvaProfile {
  try {
    fail(value && typeof value === 'object' && !Array.isArray(value), '档案必须为对象');
    const p = clone(value) as EvaProfile;
    fail(
      p.wallet && p.owned && p.machines && p.members && p.stock && p.service,
      '档案缺少必要数据',
    );
    for (const key of ['silver', 'gold', 'generalData', 'tickets', 'credentials'] as const)
      integer(p.wallet[key], `wallet.${key}`);
    for (const [kind, defs] of [
      ['machines', MACHINES],
      ['members', MEMBERS],
      ['equipment', EQUIPMENT],
      ['cosmetics', COSMETICS],
    ] as const) {
      unique(p.owned[kind], `owned.${kind}`);
      for (const id of p.owned[kind])
        fail(
          defs.some((d) => d.id === id),
          `所有权引用未知内容：${id}`,
        );
    }
    for (const [id, m] of Object.entries(p.machines)) {
      fail(p.owned.machines.includes(id), '机体进度缺少所有权');
      integer(m.data, '机体可用数据');
      integer(m.totalData, '机体累计数据');
      fail([1, 2, 3].includes(m.level), '机体等级无效');
      finite(m.damage, '机体损伤', 1);
      if (m.repairDue !== undefined) integer(m.repairDue, '冻结维修费');
      unique(m.unlocked, '机体研究');
      for (const nodeId of m.unlocked)
        fail(
          NODES.some((n) => n.id === nodeId && n.ownerId === id),
          '机体研究引用错误',
        );
    }
    for (const [id, m] of Object.entries(p.members)) {
      fail(p.owned.members.includes(id), '成员进度缺少所有权');
      integer(m.data, '成员可用数据');
      integer(m.totalData, '成员累计数据');
      unique(m.unlocked, '成员研究');
      for (const nodeId of m.unlocked)
        fail(
          NODES.some((n) => n.id === nodeId && n.ownerId === id),
          '成员研究引用错误',
        );
      for (const type of ['attack', 'defense', 'balance', 'support'] as const)
        integer(m.proficiency[type], '类型熟练度', BALANCE.proficiencyMax);
      for (const [machineId, n] of Object.entries(m.sorties)) {
        byId(MACHINES, machineId, '实战记录目标');
        integer(n, '有效出战次数');
      }
    }
    fail(
      p.owned.machines.every((id) => !!p.machines[id]) &&
        p.owned.members.every((id) => !!p.members[id]),
      '拥有内容缺少进度',
    );
    for (const [id, n] of Object.entries(p.stock)) {
      fail(
        [...AMMO, ...CONSUMABLES].some((s) => s.id === id),
        '库存物资不存在',
      );
      integer(n, '库存数量');
    }
    fail(
      Array.isArray(p.presets) && p.presets.length > 0 && p.presets.length <= 32,
      '预设数量无效',
    );
    unique(
      p.presets.map((s) => s.id),
      '预设 ID',
    );
    fail(
      p.presets.some((s) => s.id === p.activePresetId),
      '活动预设不存在',
    );
    // Damaged and superseded presets may remain saved; full deployment legality is checked by resolveLoadout.
    for (const preset of p.presets) {
      fail(typeof preset.id === 'string' && typeof preset.name === 'string', '预设标识无效');
      byId(MACHINES, preset.machineId, '预设机体');
      byId(MEMBERS, preset.driverId, '预设驾驶员');
      byId(MEMBERS, preset.supportId, '预设支援');
      for (const key of ['equipment', 'skills', 'driverSkills', 'supportSkills'] as const)
        unique(preset[key], `preset.${key}`);
      supplyValidation(preset.ammo, 'ammo', preset.weaponId);
      supplyValidation(preset.consumables, 'consumables', preset.weaponId);
    }
    integer(p.pity, '保底计数', BALANCE.pityThreshold);
    integer(p.licenseExpiresAt, '许可到期时间');
    fail(
      typeof p.autoRepair === 'boolean' && typeof p.autoSupply === 'boolean',
      '自动整备开关无效',
    );
    unique(p.service.completed, '资历奖励');
    for (const id of p.service.completed) byId(CHALLENGES, id, '资历');
    integer(p.service.rescues, '有效救援');
    integer(p.service.protection, '有效掩护');
    for (const routes of Object.values(p.service.routes)) unique(routes, '有效路线');
    fail(Array.isArray(p.draws) && p.draws.length <= BALANCE.drawHistoryLimit, '抽取记录无效');
    for (const d of p.draws) {
      byId(rewardItems(d.category), d.itemId, '抽取物品');
      integer(d.quantity, '抽取数量');
      integer(d.at, '抽取时间');
      integer(d.credentials, '重复转换');
      integer(d.pityAfter, '抽取后保底', BALANCE.pityThreshold);
    }
    fail(
      Array.isArray(p.battles) && p.battles.length <= BALANCE.battleHistoryLimit,
      '战绩记录无效',
    );
    unique(
      p.battles.map((b) => b.round),
      '战绩局次',
    );
    return p;
  } catch (error) {
    if (error instanceof ValidationError) throw new ProtocolError(`EVA 档案无效：${error.message}`);
    if (error instanceof TypeError) throw new ProtocolError('EVA 档案结构不完整');
    throw error;
  }
}
export function validateContent(): {
  valid: boolean;
  errors: string[];
  counts: Record<string, number>;
} {
  const errors: string[] = [],
    entries = [
      ...MACHINES,
      ...MEMBERS,
      ...WEAPONS,
      ...EQUIPMENT,
      ...AMMO,
      ...CONSUMABLES,
      ...NODES,
      ...MISSIONS,
      ...OFFERS,
      ...CHALLENGES,
      ...COSMETICS,
    ],
    ids = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.id)) errors.push(`重复内容 ID ${entry.id}`);
    ids.add(entry.id);
    if (!entry.name || !entry.description) errors.push(`缺少文案 ${entry.id}`);
  }
  const visited = new Set<string>(),
    visiting = new Set<string>();
  function visit(id: string) {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      errors.push(`研究图环 ${id}`);
      return;
    }
    visiting.add(id);
    const n = NODES.find((n) => n.id === id);
    if (!n) {
      errors.push(`研究引用不存在 ${id}`);
      return;
    }
    for (const req of [...n.requires, ...n.requiresAny, ...n.activationRequires]) {
      const def = NODES.find((x) => x.id === req);
      if (def && def.ownerId !== n.ownerId) errors.push(`跨钱包研究前置 ${n.id}`);
      visit(req);
    }
    visiting.delete(id);
    visited.add(id);
  }
  for (const n of NODES) {
    visit(n.id);
    if (!MACHINES.some((m) => m.id === n.ownerId) && !MEMBERS.some((m) => m.id === n.ownerId))
      errors.push(`研究所属对象不存在 ${n.id}`);
    for (const id of n.weaponIds || [])
      if (!WEAPONS.some((w) => w.id === id)) errors.push(`武器引用不存在 ${id}`);
    if (n.machineId && !MACHINES.some((m) => m.id === n.machineId))
      errors.push(`共鸣目标不存在 ${n.id}`);
  }
  if (Math.abs(Object.values(BALANCE.categoryProbability).reduce((a, b) => a + b, 0) - 1) > 1e-9)
    errors.push('奖池类别概率不为 1');
  for (const category of Object.keys(BALANCE.categoryProbability) as RewardCategory[])
    if (!rewardItems(category).length || BALANCE.categoryProbability[category] <= 0)
      errors.push(`奖池类别为空 ${category}`);
  for (const offer of OFFERS) {
    if (offer.price <= 0) errors.push(`价格无效 ${offer.id}`);
    if (offer.category === 'license') {
      if (offer.currency !== 'gold') errors.push('许可必须使用特务配额');
    } else if (offer.category === 'equipment') {
      const e = EQUIPMENT.find((e) => e.id === offer.itemId);
      if (!e || e.currency !== offer.currency) errors.push(`装备商品不匹配 ${offer.id}`);
    } else if (!rewardItems(offer.category).some((i) => i.id === offer.itemId))
      errors.push(`商品引用不存在 ${offer.id}`);
  }
  for (const c of CHALLENGES)
    if (!COSMETICS.some((cos) => cos.id === c.rewardId)) errors.push(`资历奖励不存在 ${c.id}`);
  try {
    const initial = createProfile();
    for (const preset of initial.presets) resolveLoadout(initial, preset);
  } catch (error) {
    errors.push(`初始配置无效：${String(error)}`);
  }
  return {
    valid: !errors.length,
    errors,
    counts: {
      machines: MACHINES.length,
      members: MEMBERS.length,
      nodes: NODES.length,
      weapons: WEAPONS.length,
      equipment: EQUIPMENT.length,
      missions: MISSIONS.length,
      baseCompositions: 4 * 4 * 3,
    },
  };
}
