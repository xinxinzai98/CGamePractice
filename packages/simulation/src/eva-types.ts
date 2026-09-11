/** EVA v3.1 domain contracts. Account progression is never keyed by an in-round avatar. */
export type MachineType = 'attack' | 'defense' | 'balance' | 'support';
export type EvaLevel = 1 | 2 | 3;
export type BattleMode = 'operation' | 'magi' | 'tutorial' | 'recovery';
export type MemberRole = 'driver' | 'support';
export type RewardCategory =
  'machine' | 'driver' | 'support' | 'equipment' | 'consumable' | 'ammo' | 'cosmetic';
export interface ContentEntry {
  id: string;
  name: string;
  description: string;
}
export interface EvaStats {
  hp: number;
  damageMult: number;
  speedMult: number;
  cooldownMult: number;
  energyRegen: number;
}
export interface MachineDefinition extends ContentEntry {
  type: MachineType;
  tags: string[];
  stats: EvaStats;
  weapons: string[];
  melee: string[];
  branches: string[];
  asset: string;
  sourceContinuity: string;
  sourceRefs: string[];
  adaptationNote: string;
}
export interface MemberDefinition extends ContentEntry {
  role: MemberRole;
  familiarTypes: MachineType[];
  resonanceMachineId: string;
  passive: string;
  asset: string;
  sourceContinuity: string;
  sourceRefs: string[];
  adaptationNote: string;
}
export interface WeaponDefinition extends ContentEntry {
  kind: 'primary' | 'melee';
  ammo: string[];
  behavior: string;
  range: number;
  cooldown: number;
  damage: number;
}
export interface EquipmentDefinition extends ContentEntry {
  category: 'ordinary' | 'mastery';
  group: string;
  machineIds: string[];
  types: MachineType[];
  stats: Partial<EvaStats>;
  passive?: string;
  price: number;
  currency: 'silver' | 'gold';
}
export interface SupplyDefinition extends ContentEntry {
  price: number;
  pack: number;
  carryLimit: number;
  behavior: string;
  legacy?: string;
}
export interface ProgressionNode extends ContentEntry {
  ownerId: string;
  kind: 'main' | 'branch' | 'general' | 'resonance' | 'mastery';
  cost: number;
  requires: string[];
  requiresAny: string[];
  activationRequires: string[];
  level: EvaLevel;
  branch?: string;
  slot?: 'tactical' | 'driver' | 'support';
  effect?: string;
  stats?: Partial<EvaStats>;
  weaponIds?: string[];
  grantsLevel?: EvaLevel;
  formGroup?: string;
  machineId?: string;
  proficiency?: number;
  sorties?: number;
  migrationOnly?: boolean;
}
export interface MissionDefinition extends ContentEntry {
  campaignIndex: number;
  objective: 'assault' | 'escort' | 'defense';
  levelCap: EvaLevel;
  stages: number;
  dataPerStage: number;
  silverPerStage: number;
  condition: string | null;
  power: boolean;
  bossParts: boolean;
  scoring: {
    output: number;
    protection: number;
    support: number;
    objective: number;
    participation: number;
  };
  version: string;
  ticketsPerWin?: number;
}
export interface StoreOffer extends ContentEntry {
  currency: 'silver' | 'gold';
  price: number;
  category: RewardCategory | 'license';
  itemId: string;
  quantity: number;
  durationMs?: number;
}
export interface ServiceChallenge extends ContentEntry {
  kind: 'survival' | 'routes' | 'rescue' | 'protection';
  target: number;
  rewardId: string;
  minLevel: EvaLevel;
  archive: string;
}
export interface LoadoutPreset {
  id: string;
  name: string;
  machineId: string;
  driverId: string;
  supportId: string;
  branch: string;
  weaponId: string;
  meleeId: string;
  equipment: string[];
  skills: string[];
  driverSkills: string[];
  supportSkills: string[];
  ammo: Record<string, number>;
  consumables: Record<string, number>;
  cosmeticId: string | null;
  levelCap?: EvaLevel;
  /** An unowned MAGI design can be saved as a target but cannot deploy to an operation. */
  target?: boolean;
}
export interface ResolvedLoadout {
  entityId: string;
  accountId: string;
  preset: LoadoutPreset;
  machineId: string;
  driverId: string;
  supportId: string;
  level: EvaLevel;
  type: MachineType;
  hpFraction: number;
  stats: EvaStats;
  skills: string[];
  passives: string[];
  legacyCharacter: 'Asuka' | 'Rei';
  legacyNodes: string[];
}
export interface MachineProgress {
  level: EvaLevel;
  data: number;
  totalData: number;
  unlocked: string[];
  damage: number;
  /** Price is frozen at the effective level of the damage-producing round. */
  repairDue?: number;
}
export interface MemberProgress {
  data: number;
  totalData: number;
  unlocked: string[];
  proficiency: Record<MachineType, number>;
  sorties: Record<string, number>;
}
export interface BattleEvent {
  id: string;
  seq: number;
  time: number;
  kind: string;
  actorId: string;
  targetId?: string;
  sourceId?: string;
  amount?: number;
  phaseId?: string;
  partId?: string;
  detail?: Record<string, string | number | boolean>;
}
export interface EvaDrawRecord {
  at: number;
  pool: string;
  category: RewardCategory;
  itemId: string;
  quantity: number;
  duplicate: boolean;
  credentials: number;
  pityTriggered: boolean;
  pityBefore: number;
  pityAfter: number;
  categoryProbability: number;
  itemProbability: number;
}
export interface RewardBreakdown {
  eligible: boolean;
  reason: string;
  score: number;
  machineData: number;
  driverData: number;
  supportData: number;
  generalData: number;
  silverBase: number;
  licenseBonus: number;
  silverGross: number;
  repairCost: number;
  supplyCost: number;
  silverNet: number;
  tickets: number;
  challenges: string[];
  scoreParts: {
    objective: number;
    output: number;
    protection: number;
    support: number;
    participation: number;
  };
  maintenanceShortfall: number;
}
export interface EvaBattleRecord {
  round: string;
  at: number;
  mode: BattleMode;
  missionId: string;
  ruleVersion: string;
  seed: number;
  condition: string | null;
  won: boolean;
  elapsed: number;
  participants: ResolvedLoadout[];
  entityId: string;
  events: BattleEvent[];
  difficulty?: 'relaxed' | 'normal' | 'hard';
  hpFraction: number;
  used: Record<string, number>;
  license: boolean;
  completedStages: number;
  reward?: RewardBreakdown;
}
export interface BattleReview {
  round: string;
  ruleVersion: string;
  condition: string | null;
  difficulty?: 'relaxed' | 'normal' | 'hard';
  metrics: {
    damage: number;
    partDamage: number;
    protection: number;
    support: number;
    rescues: number;
    energySpent: number;
    passiveTriggers: number;
    skills: number;
  };
  observations: { text: string; eventIds: string[]; phaseId?: string }[];
}
export interface EvaProfile {
  wallet: {
    silver: number;
    gold: number;
    generalData: number;
    tickets: number;
    credentials: number;
  };
  machines: Record<string, MachineProgress>;
  members: Record<string, MemberProgress>;
  owned: { machines: string[]; members: string[]; equipment: string[]; cosmetics: string[] };
  stock: Record<string, number>;
  presets: LoadoutPreset[];
  activePresetId: string;
  pity: number;
  draws: EvaDrawRecord[];
  licenseExpiresAt: number;
  autoRepair: boolean;
  autoSupply: boolean;
  service: {
    completed: string[];
    routes: Record<string, string[]>;
    rescues: number;
    protection: number;
  };
  battles: EvaBattleRecord[];
  /** Explicit, non-spendable record of preserved legacy abilities and capacity. */
  migration?: {
    nodes: Record<string, string[]>;
    grants: string[];
    legacyDraws: unknown[];
    legacyBattles: unknown[];
    notes: string[];
  };
}
