export type Character = 'Asuka' | 'Rei';
export type Ammo = 'AP' | 'HE' | 'HESH';
export type Skill = 'heal' | 'speed' | 'special' | 'ultimate';
export type Slot = 'weapon' | 'armor' | 'module';
export interface Point {
  x: number;
  y: number;
}
export interface MapEnemy extends Point {
  type: number;
  boss?: boolean;
}
export interface GameMap {
  version: number;
  artSet: 'legacy' | 'new';
  name: string;
  width: number;
  height: number;
  tiles: number[][];
  spawns: Point[];
  enemies: MapEnemy[];
  cooperation?: { pads: Point[]; label: string };
  puzzle?: { redPad: Point; bluePad: Point };
}
export interface Loadout {
  ammo: Ammo;
  melee: 'blade' | 'spear';
}
export interface GearMods {
  damageMult: number;
  hpBonus: number;
  speedMult: number;
  cooldownMult: number;
}
export interface EffectConfig {
  doubleShot: boolean;
  mobileBarrage: boolean;
  tripleBarrage: boolean;
  pierce: number;
  speedMultiplier: number;
  boostShield: boolean;
  sharedBoost: boolean;
  extraHp: number;
  sharedShield: boolean;
  fortress: boolean;
  missileRadius: number;
  splashDamage: number;
  chainBlast: boolean;
  teleportExtra: number;
  phaseShield: boolean;
  phaseRescue: boolean;
  healBonus: number;
  healRadius: number;
  fastRescue: boolean;
  resurrection: boolean;
}
export interface Stats {
  shots: number;
  hits: number;
  damage: number;
  taken: number;
  rescues: number;
  healing: number;
  assists: number;
  moved: number;
  heals: number;
  skills: number;
  melee: number;
  meleeHits: number;
  skillUses: Record<Skill, number>;
}
export interface Actor extends Point {
  id: string;
  dir: number;
  r: number;
  hp: number;
  maxHp: number;
  team: 0 | 1;
  flash: number;
  moving: boolean;
  firePose: number;
  shield?: number;
  boss?: boolean;
  type?: number;
  stats?: Stats;
  config?: EffectConfig;
  gearMods?: GearMods;
  upgrades?: { power: number; mobility: number; support: number };
  armorBreakUntil?: number;
  exposedUntil?: number;
  slowUntil?: number;
  lastOwner?: string;
  lastHit?: number;
}
export interface Player extends Actor {
  team: 1;
  character: Character;
  cd: Record<Skill | 'fire' | 'melee' | 'item', number>;
  boost: number;
  heal: number;
  barrage: number;
  shield: number;
  revive: number;
  nodes: string[];
  config: EffectConfig;
  stats: Stats;
  upgrades: { power: number; mobility: number; support: number };
  gearMods: GearMods;
  loadout: Loadout;
  energy: number;
  maxEnergy: number;
  activeItem: boolean;
}
export interface Enemy extends Actor {
  team: 0;
  type: number;
  repair: number;
  warning: number;
  think: number;
  fire: number;
  boss: boolean;
}
export interface Projectile extends Point {
  id: string;
  dx: number;
  dy: number;
  r: number;
  team: 0 | 1;
  damage: number;
  speed: number;
  life: number;
  missile: boolean;
  ammo: Ammo | null;
  owner: string;
  pierce: number;
  hitIds: string[];
  boss?: boolean;
}
export interface Effect extends Point {
  kind: string;
  life: number;
  max: number;
  radius: number;
  dir: number;
  label?: string;
  amount?: number;
}
export interface InputState {
  dir?: number;
  fire?: boolean;
  heal?: boolean;
  speed?: boolean;
  special?: boolean;
  ultimate?: boolean;
  melee?: boolean;
  item?: boolean;
  ammo?: Ammo;
}
export interface Cooperation {
  pads: Point[];
  charge: number;
  openFor: number;
  required: number;
  label: string;
  puzzle?: {
    redPad: Point;
    bluePad: Point;
    powered: boolean;
    solved: boolean;
    charge: number;
    gates: Point[];
  };
}
export interface GameState {
  map: GameMap;
  practice: boolean;
  time: number;
  status: 'playing' | 'paused' | 'won' | 'lost';
  score: number;
  kills: number;
  players: Player[];
  enemies: Enemy[];
  bullets: Projectile[];
  effects: Effect[];
  events: string[];
  cooperation: Cooperation | null;
}
export interface GameOptions {
  coop?: boolean;
  character?: Character;
  seed?: number;
  difficulty?: 'relaxed' | 'normal' | 'hard';
  upgrades?: Partial<Record<Character, Partial<Player['upgrades']>>>;
  nodes?: string[] | Partial<Record<Character, string[]>>;
  characters?: Character[];
  practice?: boolean;
  gear?: Partial<Record<Character, string[]>>;
  loadouts?: Partial<Record<Character, Partial<Loadout>>>;
}
export interface Profile {
  characters: Record<Character, { xp: number; nodes: string[] }>;
  tickets: number;
  pity: number;
  drawHistory: unknown[];
  unlocked: number;
  records: { history: unknown[]; wins: number; losses: number };
  coins: number;
  inventory: string[];
  equipment: Record<Character, Record<Slot, string | null>>;
  loadouts: Record<Character, Loadout>;
  appearance: { pilot: Character; reducedMotion: boolean };
  tutorialComplete: boolean;
}
export interface SkillNode {
  id: string;
  name: string;
  description: string;
  branch: string;
  tier: number;
  requires: string[];
  level: number;
  cost: number;
  icon: string;
}
export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
