import { ValidationError } from './errors';
import * as Progression from './progression';
import * as Equipment from './equipment';
import { BOSSES, campaignDefinition } from './content';
import type { BossAttack } from './content';
import { AMMO, CONSUMABLES, MISSIONS, WEAPONS } from './eva-content';
import type { BattleEvent, BattleMode, ResolvedLoadout } from './eva-types';
import type {
  Actor,
  BossId,
  Character,
  Cooperation,
  Effect,
  Enemy,
  GameMap,
  GameOptions,
  GameState,
  InputState,
  MapEnemy,
  Player,
  Point,
  Projectile,
  Skill,
  Stats,
  BossPartState,
  MissionObjective,
  PowerZone,
  CoopActionState,
} from './types';
import { record } from './types';
export const TILE = 60;
export const DIRS: number[][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
export const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export function validateMap(value: unknown): GameMap {
  const input = record(value);
  const { width: w, height: h } = input;
  if (typeof w !== 'number' || typeof h !== 'number') throw new ValidationError('地图尺寸无效');
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 10 || h < 10 || w > 48 || h > 48)
    throw new ValidationError('地图宽高必须为 10–48 格');
  if (
    !Array.isArray(input.tiles) ||
    input.tiles.length !== h ||
    !input.tiles.every(
      (r) =>
        Array.isArray(r) &&
        r.length === w &&
        r.every((t) => typeof t === 'number' && Number.isInteger(t) && t >= 0 && t <= 5),
    )
  )
    throw new ValidationError('地图地形数据不完整');
  const tiles = input.tiles as number[][];
  const parsePoint = (v: unknown): Point => {
    const p = record(v);
    if (typeof p.x !== 'number' || typeof p.y !== 'number')
      throw new ValidationError('地图坐标无效');
    return { x: p.x, y: p.y };
  };
  if (!Array.isArray(input.spawns) || !Array.isArray(input.enemies))
    throw new ValidationError('出生数据无效');
  const spawns = input.spawns.map(parsePoint),
    enemies: MapEnemy[] = input.enemies.map((v) => {
      const e = record(v);
      if (typeof e.type !== 'number') throw new ValidationError('敌人类型无效');
      if (
        e.encounterId !== undefined &&
        (typeof e.encounterId !== 'string' || !Object.hasOwn(BOSSES, e.encounterId) || !e.boss)
      )
        throw new ValidationError('首领定义无效');
      return {
        ...parsePoint(v),
        type: e.type,
        ...(e.boss ? { boss: true } : {}),
        ...(e.encounterId ? { encounterId: e.encounterId as BossId } : {}),
      };
    });
  const pass = (x: number, y: number) =>
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    x >= 0 &&
    y >= 0 &&
    x < w &&
    y < h &&
    ![1, 2].includes(tiles[y][x]);
  if (spawns.length !== 2 || spawns.some((p) => !pass(p.x, p.y)))
    throw new ValidationError('请在可通行地面放置两个玩家出生点');
  if (spawns[0].x === spawns[1].x && spawns[0].y === spawns[1].y)
    throw new ValidationError('两个玩家出生点不能重叠');
  if (
    enemies.length < 1 ||
    enemies.length > 80 ||
    enemies.some((e) => !pass(e.x, e.y) || ![1, 2, 3, 4].includes(e.type))
  )
    throw new ValidationError('需要 1–80 个位于可通行地面的敌人');
  const occupied = new Set(spawns.map((p) => `${p.x},${p.y}`));
  for (const e of enemies) {
    const k = `${e.x},${e.y}`;
    if (occupied.has(k)) throw new ValidationError('出生点和敌人不能重叠');
    occupied.add(k);
  }
  const seen = new Set([`${spawns[0].x},${spawns[0].y}`]),
    q = [spawns[0]];
  for (let i = 0; i < q.length; i++)
    for (const [dx, dy] of DIRS) {
      let x = q[i].x + dx,
        y = q[i].y + dy,
        k = `${x},${y}`;
      if (pass(x, y) && !seen.has(k)) {
        seen.add(k);
        q.push({ x, y });
      }
    }
  if ([...spawns, ...enemies].some((p) => !seen.has(`${p.x},${p.y}`)))
    throw new ValidationError('玩家或敌人被地形隔开了，请用道路或桥连接');
  const rawCoop = record(input.cooperation);
  const cooperation = input.cooperation
    ? { pads: Array.isArray(rawCoop.pads) ? rawCoop.pads.map(parsePoint) : [] }
    : undefined;
  if (
    cooperation &&
    (cooperation.pads.length !== 2 ||
      cooperation.pads.some((p) => !pass(p.x, p.y) || !seen.has(`${p.x},${p.y}`)) ||
      Math.hypot(
        cooperation.pads[0].x - cooperation.pads[1].x,
        cooperation.pads[0].y - cooperation.pads[1].y,
      ) < 1)
  )
    throw new ValidationError('同步机关需要两个独立且可到达的站位');
  const rawPuzzle = record(input.puzzle),
    puzzle = input.puzzle
      ? { redPad: parsePoint(rawPuzzle.redPad), bluePad: parsePoint(rawPuzzle.bluePad) }
      : undefined;
  const gates =
    rawPuzzle.gates === undefined
      ? undefined
      : (() => {
          if (!Array.isArray(rawPuzzle.gates)) throw new ValidationError('闸门数据无效');
          const ids = new Set<string>(),
            cells = new Set<string>();
          return rawPuzzle.gates.map((v) => {
            const gate = record(v),
              point = parsePoint(v),
              key = `${point.x},${point.y}`;
            if (
              typeof gate.id !== 'string' ||
              !/^[a-zA-Z0-9_-]{1,80}$/.test(gate.id) ||
              ids.has(gate.id) ||
              cells.has(key) ||
              !pass(point.x, point.y) ||
              occupied.has(key)
            )
              throw new ValidationError('闸门需要唯一标识与独立可通行位置');
            ids.add(gate.id);
            cells.add(key);
            return { id: gate.id, ...point };
          });
        })();
  if (
    puzzle &&
    ([puzzle.redPad, puzzle.bluePad].some((p) => !pass(p.x, p.y) || !seen.has(`${p.x},${p.y}`)) ||
      (puzzle.redPad.x === puzzle.bluePad.x && puzzle.redPad.y === puzzle.bluePad.y))
  )
    throw new ValidationError('解谜节点必须可到达');
  return {
    version: 1,
    ...(puzzle
      ? {
          puzzle: {
            redPad: { ...puzzle.redPad },
            bluePad: { ...puzzle.bluePad },
            ...(gates ? { gates } : {}),
          },
        }
      : {}),
    ...(typeof input.encounterId === 'string'
      ? { encounterId: input.encounterId.slice(0, 80) }
      : {}),
    artSet: input.artSet === 'new' ? 'new' : 'legacy',
    ...(cooperation
      ? {
          cooperation: {
            pads: cooperation.pads.map((p) => ({ x: p.x, y: p.y })),
            label: '双人同步 · 解除首领屏障',
          },
        }
      : {}),
    name: String(input.name || '未命名地图').slice(0, 40),
    width: w,
    height: h,
    tiles: tiles.map((r) => r.slice()),
    spawns: spawns.map((p) => ({ x: p.x, y: p.y })),
    enemies: enemies.map((e) => ({
      x: e.x,
      y: e.y,
      type: e.type,
      ...(e.boss ? { boss: true } : {}),
      ...(e.encounterId ? { encounterId: e.encounterId } : {}),
    })),
  };
}
export function campaign(index: number, stage = 0): GameMap {
  index = clamp(Math.floor(Number(index) || 0), 0, 3);
  stage = clamp(Math.floor(Number(stage) || 0), 0, 2);
  return campaignDefinition(index, stage);
}
export function blankMap(w = 26, h = 20): GameMap {
  const m = campaign(0);
  m.width = w;
  m.height = h;
  m.name = '我们的地图';
  m.tiles = Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => (!x || !y || x === w - 1 || y === h - 1 ? 2 : 0)),
  );
  m.spawns = [
    { x: 2, y: h - 3 },
    { x: 4, y: h - 3 },
  ];
  m.enemies = [{ x: w - 3, y: 2, type: 1 }];
  return m;
}
export class Game implements GameState {
  practice: boolean;
  practiceOptions: { invincible: boolean; noCooldown: boolean };
  map: GameMap;
  seed: number;
  time: number;
  status: GameState['status'];
  score: number;
  kills: number;
  bullets: Projectile[];
  bulletSeq: number;
  effects: Effect[];
  events: string[];
  difficulty: NonNullable<GameOptions['difficulty']>;
  coop: boolean;
  cooperation: Cooperation | null;
  players: Player[];
  enemies: Enemy[];
  mode: BattleMode;
  missionId: string;
  roundId: string;
  condition: string | null;
  battleEvents: BattleEvent[] = [];
  objective: MissionObjective | null = null;
  powerZones: PowerZone[] = [];
  coopActions: CoopActionState[] = [];
  participants: ResolvedLoadout[];
  simulatedAlly: boolean;
  completedStages = 0;
  private initialSeed: number;
  private objectivePath: Point[] = [];
  private objectiveWaypoint = 0;
  private participationAt: Record<string, number> = {};
  private lastDirectHit: Record<string, { actorId: string; at: number; dir: number }> = {};
  private exposureContributors = new Set<string>();
  private stageEventSent = false;
  private reinforcements = 0;
  private reviewPhaseId?: string;

  constructor(
    map: GameMap,
    {
      coop = false,
      character = 'Asuka',
      seed = 12345,
      difficulty = 'normal',
      nodes = {},
      characters = [],
      practice = false,
      gear = {},
      loadouts = {},
      participants = [],
      mode = 'operation',
      missionId = '',
      roundId = 'local',
      condition,
      phaseId,
      simulatedAlly = false,
    }: GameOptions = {},
  ) {
    if (mode === 'magi' && simulatedAlly && participants.length === 1)
      participants = [
        participants[0],
        {
          ...structuredClone(participants[0]),
          entityId: 'sim-ally',
          accountId: 'simulation',
          hpFraction: 1,
        },
      ];
    this.participants = structuredClone(participants);
    if (
      participants.length > 2 ||
      new Set(participants.map((p) => p.entityId)).size !== participants.length
    )
      throw new ValidationError('参战实体必须独立，人数最多为两名');
    this.mode = mode;
    this.missionId = missionId;
    this.roundId = roundId;
    this.simulatedAlly = mode === 'magi' && simulatedAlly;
    this.initialSeed = seed >>> 0;
    this.reviewPhaseId = mode === 'magi' ? phaseId : undefined;
    const mission = MISSIONS.find((m) => m.id === missionId);
    if (condition !== undefined && condition !== null && condition !== mission?.condition)
      throw new ValidationError('任务只允许战前公开的一个战场条件');
    this.condition = condition === undefined ? (mission?.condition ?? null) : condition;
    this.practice = !!practice && !participants.length;
    this.practiceOptions = { invincible: true, noCooldown: false };
    this.map = structuredClone(map);
    this.seed = seed >>> 0;
    this.time = 0;
    this.status = 'playing';
    this.score = 0;
    this.kills = 0;
    this.bullets = [];
    this.bulletSeq = 0;
    this.effects = [];
    this.events = [];
    this.difficulty = difficulty;
    this.coop = participants.length ? participants.length === 2 : coop;
    const pixels = (p: Point): Point => ({ x: (p.x + 0.5) * TILE, y: (p.y + 0.5) * TILE });
    const channel = this.map.cooperation;
    const puzzle = this.map.puzzle;
    this.cooperation =
      channel || puzzle
        ? {
            pads: channel ? channel.pads.map(pixels) : [],
            charge: 0,
            openFor: 0,
            required: 1.5,
            label: channel ? channel.label : '两名驾驶员分别站上双色节点 · 保持同步开启闸门',
            gates: (puzzle?.gates || []).map((g) => ({ ...g, open: this.practice })),
            objective: {
              id: `${this.map.encounterId || 'custom'}-${puzzle ? 'entry' : 'core'}`,
              text: puzzle
                ? '分别站上红蓝节点，保持同步开启闸门'
                : '两人分别站上同步节点，打开核心屏障',
              state: 'active',
            },
            ...(puzzle
              ? {
                  puzzle: {
                    redPad: pixels(puzzle.redPad),
                    bluePad: pixels(puzzle.bluePad),
                    powered: false,
                    solved: this.practice,
                    charge: 0,
                    gates: (puzzle.gates || []).map(({ x, y }) => ({ x, y })),
                  },
                }
              : {}),
          }
        : null;
    this.players = this.map.spawns.slice(0, participants.length || (coop ? 2 : 1)).map(
      (p, i) =>
        ({
          id: participants[i]?.entityId || `p${i}`,
          x: (p.x + 0.5) * TILE,
          y: (p.y + 0.5) * TILE,
          dir: 0,
          r: 18,
          hp: 100,
          maxHp: 100,
          character:
            participants[i]?.legacyCharacter ||
            characters[i] ||
            (coop ? (i ? 'Rei' : 'Asuka') : character),
          team: 1,
          cd: { fire: 0, heal: 0, speed: 0, special: 0, ultimate: 0, melee: 0, item: 0 },
          boost: 0,
          heal: 0,
          barrage: 0,
          shield: 0,
          flash: 0,
          moving: false,
          firePose: 0,
          revive: 0,
        }) as Player,
    );
    for (const p of this.players) {
      const l = loadouts[p.character] || {};
      p.loadout = {
        ammo: l.ammo === 'AP' || l.ammo === 'HE' || l.ammo === 'HESH' ? l.ammo : 'AP',
        melee:
          l.melee === 'blade' || l.melee === 'spear'
            ? l.melee
            : p.character === 'Rei'
              ? 'spear'
              : 'blade',
      };
      p.nodes = Array.isArray(nodes) ? nodes.slice() : (nodes[p.character] || []).slice();
      p.config = Progression.effectConfig(p.character, p.nodes);
      p.energy = p.maxEnergy = 100;
      p.activeItem = (gear[p.character] || []).includes('sync-relay');
      p.gearMods = Equipment.modsFor(gear[p.character] || []);
      p.maxHp = p.hp = 100 + p.config.extraHp + p.gearMods.hpBonus;
      p.stats = {
        shots: 0,
        hits: 0,
        damage: 0,
        taken: 0,
        rescues: 0,
        healing: 0,
        assists: 0,
        moved: 0,
        heals: 0,
        skills: 0,
        melee: 0,
        meleeHits: 0,
        skillUses: { heal: 0, speed: 0, special: 0, ultimate: 0 },
      };
      const snapshot = this.participants[this.players.indexOf(p)];
      for (const [key, value] of Object.entries({
        tacticalCd: [0, 0, 0],
        stock: {},
        used: {},
        passiveCooldowns: {},
      }))
        Object.defineProperty(p, key, {
          value,
          enumerable: !!snapshot,
          writable: true,
          configurable: true,
        });
      if (snapshot) {
        p.accountId = snapshot.accountId;
        p.machineId = snapshot.machineId;
        p.driverId = snapshot.driverId;
        p.supportId = snapshot.supportId;
        p.resolved = snapshot;
        p.nodes = snapshot.legacyNodes.slice();
        p.config = Progression.effectConfig(snapshot.legacyCharacter, snapshot.legacyNodes);
        p.gearMods = { ...snapshot.stats, hpBonus: 0 };
        p.maxHp = snapshot.stats.hp;
        p.hp = snapshot.stats.hp * clamp(snapshot.hpFraction, 0, 1);
        p.activeItem = false;
        p.targetPart = 'core';
        p.stock = { ...snapshot.preset.ammo, ...snapshot.preset.consumables };
        p.loadout = {
          ammo: 'AP',
          melee:
            WEAPONS.find((w) => w.id === snapshot.preset.meleeId)?.behavior === 'spear'
              ? 'spear'
              : 'blade',
        };
      }
    }
    this.enemies = this.map.enemies.map((e, i) => ({
      id: `e${i}`,
      x: (e.x + 0.5) * TILE,
      y: (e.y + 0.5) * TILE,
      dir: 2,
      r: 18,
      hp: e.boss
        ? BOSSES[e.encounterId || 'dawn-prism'].hp
        : e.type === 3
          ? 100
          : e.type === 4
            ? 70
            : 50,
      maxHp: e.boss
        ? BOSSES[e.encounterId || 'dawn-prism'].hp
        : e.type === 3
          ? 100
          : e.type === 4
            ? 70
            : 50,
      boss: !!e.boss,
      ...(e.boss
        ? {
            encounter: {
              id: e.encounterId || 'dawn-prism',
              phaseId: BOSSES[e.encounterId || 'dawn-prism'].phases[0].id,
              phaseIndex: 0,
              phaseName: BOSSES[e.encounterId || 'dawn-prism'].phases[0].name,
              shielded: !this.practice && !!channel,
              attackIndex: 0,
              telegraph: null,
            },
          }
        : {}),
      type: e.type,
      team: 0,
      repair: 6,
      warning: 0,
      think: 0,
      fire: 2 + i * 0.17,
      flash: 0,
      moving: false,
      firePose: 0,
    }));
    if (participants.length) {
      this.coopActions = ['crossfire', 'barrier-cover'].map((id) => ({
        id,
        state: 'ready',
        expiresAt: 0,
        cooldownUntil: 0,
      })) as CoopActionState[];
      for (const e of this.enemies) {
        if (e.encounter && mission?.bossParts) this.createBossParts(e);
        if (mode === 'magi' && phaseId && e.encounter) {
          const index = BOSSES[e.encounter.id].phases.findIndex((p) => p.id === phaseId);
          if (index >= 0) {
            const phase = BOSSES[e.encounter.id].phases[index];
            Object.assign(e.encounter, { phaseIndex: index, phaseId, phaseName: phase.name });
            e.hp = e.maxHp * phase.threshold;
          }
        }
      }
      if (this.condition === 'dense-enemies') {
        this.spawnReinforcement();
        this.spawnReinforcement();
      }
      const kind = mission?.objective || 'assault';
      const path = this.reachablePath(this.map.spawns[0], {
        x: this.map.enemies[0].x,
        y: this.map.enemies[0].y,
      });
      this.objectivePath = path.map(pixels);
      this.objective = {
        kind,
        label:
          kind === 'escort'
            ? '护送供给车至目标区域'
            : kind === 'defense'
              ? '在防御区域维持 45 秒'
              : '解除威胁并击破目标',
        progress: 0,
        required:
          kind === 'defense'
            ? 45
            : kind === 'escort'
              ? Math.max(1, path.length - 1)
              : this.enemies.length,
        state: 'active',
        hp: 300,
        maxHp: 300,
        ...(kind !== 'assault' ? { position: pixels(this.map.spawns[0]) } : {}),
      };
      if (mission?.power) {
        const backup = path[Math.max(1, Math.floor(path.length / 2))] || this.map.spawns[1];
        this.powerZones = [
          {
            id: 'umbilical-main',
            ...pixels(this.map.spawns[0]),
            radius: 145,
            active: true,
            backup: false,
            regen: 16,
          },
          {
            id: 'emergency-backup',
            ...pixels(backup),
            radius: 130,
            active: true,
            backup: true,
            regen: 12,
          },
        ];
      }
      this.emit('battle-start', 'system', undefined, undefined, {
        mode,
        missionId,
        condition: this.condition || '',
        seed: this.initialSeed,
      });
      for (const p of this.players)
        this.emit('deploy', p.id, p.machineId, undefined, {
          driverId: p.driverId!,
          supportId: p.supportId!,
          level: p.resolved!.level,
          route: p.resolved!.preset.branch,
        });
    }
  }
  /** Authoritative rule events. Audio remains a disposable per-frame projection. */
  emit(
    kind: string,
    actorId: string,
    targetId?: string,
    amount?: number,
    detail?: Record<string, string | number | boolean>,
    sourceId?: string,
    partId?: string,
  ) {
    if (!this.participants.length) return;
    const seq = this.battleEvents.length + 1;
    const phaseId = this.enemies.find((e) => e.encounter && e.hp > 0)?.encounter?.phaseId;
    this.battleEvents.push({
      id: `${this.roundId}:${seq}`,
      seq,
      time: this.time,
      kind,
      actorId,
      ...(targetId ? { targetId } : {}),
      ...(amount !== undefined ? { amount } : {}),
      ...(detail ? { detail } : {}),
      ...(sourceId ? { sourceId } : {}),
      ...(phaseId ? { phaseId } : {}),
      ...(partId ? { partId } : {}),
    });
  }
  private reachablePath(start: Point, target: Point): Point[] {
    const key = (p: Point) => `${p.x},${p.y}`;
    const queue = [start],
      parent = new Map<string, Point | null>([[key(start), null]]);
    let end = start;
    for (let i = 0; i < queue.length; i++) {
      const p = queue[i];
      end = p;
      if (p.x === target.x && p.y === target.y) break;
      for (const [dx, dy] of DIRS) {
        const next = { x: p.x + dx, y: p.y + dy };
        if (!parent.has(key(next)) && ![1, 2].includes(this.map.tiles[next.y]?.[next.x] ?? 2)) {
          parent.set(key(next), p);
          queue.push(next);
        }
      }
    }
    const path: Point[] = [];
    for (let p: Point | null = end; p; p = parent.get(key(p)) || null) path.unshift(p);
    return path;
  }
  private createBossParts(e: Enemy) {
    e.parts = [
      {
        id: 'weapon',
        x: e.x - 42,
        y: e.y,
        r: 19,
        hp: 90,
        maxHp: 90,
        state: 'active',
        disabledUntil: 0,
        immuneUntil: 0,
        contributors: [],
      },
      {
        id: 'generator',
        x: e.x + 42,
        y: e.y,
        r: 19,
        hp: 110,
        maxHp: 110,
        state: 'active',
        disabledUntil: 0,
        immuneUntil: 0,
        contributors: [],
      },
      {
        id: 'core',
        x: e.x,
        y: e.y,
        r: 19,
        hp: e.hp,
        maxHp: e.maxHp,
        state: e.encounter?.shielded ? 'protected' : 'active',
        disabledUntil: 0,
        immuneUntil: 0,
        contributors: [],
      },
    ];
  }
  damagePart(
    e: Enemy,
    part: BossPartState,
    amount: number,
    owner: string,
    sourceId = 'primary',
    direct = true,
    incomingAngle?: number,
  ) {
    if (e.hp <= 0 || amount <= 0) return;
    if (part.id === 'core') {
      this.damage(e, amount, owner, sourceId, direct, incomingAngle);
      part.hp = e.hp;
      return;
    }
    const p = this.players.find((p) => p.id === owner && p.hp > 0);
    if (!p || part.state === 'disabled' || part.immuneUntil > this.time) return;
    const dealt = Math.min(
      part.hp,
      amount * (1 + 0.04 * this.passiveStrength(p, 'ritsuko-efficiency-b')),
    );
    part.hp -= dealt;
    p.stats.damage += dealt;
    if (direct) {
      if (!part.contributors.includes(owner)) part.contributors.push(owner);
      this.exposureContributors.add(owner);
      this.directHit(p, e, sourceId, incomingAngle);
      this.onEffectiveHit(p, e, sourceId);
    }
    this.emit('part-damage', owner, e.id, dealt, undefined, sourceId, part.id);
    this.effect(part.x, part.y, 'armorbreak', 32);
    if (part.hp <= 0) {
      part.state = 'disabled';
      part.disabledUntil = this.time + (part.id === 'weapon' ? 12 : 10);
      part.immuneUntil = 0;
      this.emit(
        'part-disabled',
        owner,
        e.id,
        undefined,
        { recoverAt: part.disabledUntil },
        sourceId,
        part.id,
      );
      if (part.id === 'weapon') {
        e.fire = Math.max(e.fire, 2);
        if (e.encounter?.telegraph?.pattern === 'beam') {
          e.encounter.telegraph = null;
          e.warning = 0;
        }
      }
      if (part.id === 'generator' && this.exposureContributors.size >= 2) {
        if (this.cooperation) this.cooperation.openFor = Math.max(this.cooperation.openFor, 8);
        e.exposedUntil = this.time + 8;
        if (e.encounter) e.encounter.shielded = false;
        this.emit('core-exposed', owner, e.id, 8, { reason: 'two-entity-parts' });
      }
    }
  }
  private directHit(
    p: Player,
    target: Actor,
    sourceId: string,
    incomingAngle = Math.atan2(DIRS[p.dir][1], DIRS[p.dir][0]),
  ) {
    const action = this.coopActions.find((a) => a.id === 'crossfire');
    if (!action || action.cooldownUntil > this.time) return;
    const previous = this.lastDirectHit[target.id];
    if (
      previous &&
      previous.actorId !== p.id &&
      Math.acos(Math.cos(previous.dir - incomingAngle)) >= Math.PI / 3 &&
      this.time - previous.at <= 2.5
    ) {
      target.armorBreakUntil = Math.max(target.armorBreakUntil || 0, this.time + 3);
      p.stats.assists++;
      action.state = 'cooldown';
      action.cooldownUntil = this.time + 10;
      this.emit(
        'coop',
        p.id,
        target.id,
        1,
        { action: 'crossfire', partnerId: previous.actorId },
        sourceId,
      );
      this.emit('support', previous.actorId, p.id, 10, { action: 'crossfire' }, sourceId);
      this.effect(target.x, target.y, 'combo', 85);
    } else {
      this.lastDirectHit[target.id] = { actorId: p.id, at: this.time, dir: incomingAngle };
      Object.assign(action, {
        state: 'primed',
        actorId: p.id,
        targetId: target.id,
        expiresAt: this.time + 2.5,
      });
    }
  }
  private grantBarrier(source: Player, target: Player, duration: number) {
    target.shield = Math.max(target.shield, duration);
    // Same support group refreshes the duration; it never sums duplicate providers.
    if ((target.barrierUntil || 0) <= this.time + duration) {
      target.barrierOwner = source.id;
      target.barrierUntil = this.time + duration;
    }
    target.barrierCapacity = Math.max(
      target.barrierCapacity || 0,
      65 +
        this.passiveStrength(source, 'rei-precision-b') * 10 +
        (this.hasPassive(source, 'barrier-intercept') ? 20 : 0),
    );
    this.effect(target.x, target.y, 'shield', 70);
  }
  private restore(
    source: Player,
    target: Player,
    amount: number,
    sourceId: string,
    revive = false,
  ) {
    if (target.hp <= 0) {
      if (!revive) return;
      target.hp = Math.min(30, target.maxHp);
      source.stats.rescues++;
      this.emit('rescue', source.id, target.id, 1, { restoredHp: target.hp }, sourceId);
      this.onRescue(source, target);
    }
    const restored = Math.min(target.maxHp - target.hp, amount);
    if (restored <= 0) return;
    target.hp += restored;
    source.stats.healing += restored;
    this.emit('healing', source.id, target.id, restored, undefined, sourceId);
    this.effect(target.x, target.y, 'heal', 80);
  }
  consume(p: Player, id: string) {
    if (!p.resolved || (p.stock[id] || 0) < 1) return false;
    p.stock[id]--;
    p.used[id] = (p.used[id] || 0) + 1;
    return true;
  }
  useConsumable(p: Player, slot: number) {
    const id = Object.keys(p.resolved?.preset.consumables || {})[slot];
    const item = CONSUMABLES.find((c) => c.id === id);
    if (!item || p.hp <= 0 || p.cd.item > 0 || !this.consume(p, id)) return;
    if (item.behavior === 'repair') this.restore(p, p, 35, id);
    else if (item.behavior === 'battery') p.energy = Math.min(p.maxEnergy, p.energy + 40);
    else this.grantBarrier(p, p, 5);
    p.cd.item = 8;
    this.emit('consumable', p.id, p.id, 1, undefined, id);
  }
  tactical(p: Player, slot: number) {
    const name = p.resolved?.skills[slot];
    if (!name || p.hp <= 0 || p.tacticalCd[slot] > 0) return;
    const form = name === 'beast' || name === 'awakening' || name === 'awakening-burst';
    const cost =
      (name === 'sync-pulse'
        ? 0
        : form
          ? 45
          : ['fortress', 'rescue-wave', 'rescue-link', 'arsenal'].includes(name)
            ? 35
            : 25) *
      (1 -
        0.04 * this.passiveStrength(p, 'ritsuko-efficiency') -
        (this.hasPassive(p, 'resonance-ritsuko-efficiency') ? 0.04 : 0));
    if (p.energy < cost || (form && (p.formUntil || 0) > this.time)) return;
    p.energy -= cost;
    p.stats.skills++;
    p.tacticalCd[slot] = (form ? 35 : 12) * p.gearMods.cooldownMult;
    this.emit('skill', p.id, undefined, 1, { slot, skill: name }, name);
    this.emit('energy-spent', p.id, undefined, cost, undefined, name);
    const near = this.players.filter((a) => a.hp > 0 && Math.hypot(a.x - p.x, a.y - p.y) <= 180);
    if (name === 'barrage' || name === 'arsenal') {
      p.barrage =
        (name === 'arsenal' ? 4 : 2.5) +
        (this.hasPassive(p, 'artillery-sustain') ? 0.6 : 0) +
        0.15 * this.passiveStrength(p, 'asuka-drive-b');
      p.cd.fire = 0;
    } else if (name === 'assault' || name === 'phase') {
      const [dx, dy] = DIRS[p.dir];
      for (
        let i = 0;
        i <
        26 + Math.max(this.hasPassive(p, 'phase-extension') ? 12 : 0, p.config.teleportExtra / 4);
        i++
      )
        if (!this.move(p, dx * 4, dy * 4)) break;
      p.chargedUntil = this.time + 3;
      if (name === 'assault') p.boost = Math.max(p.boost, 3);
      if (name === 'phase') this.grantBarrier(p, p, 2);
      if (name === 'phase' && this.hasPassive(p, 'phase-rescue'))
        for (const a of this.players.filter((a) => Math.hypot(a.x - p.x, a.y - p.y) < 180))
          this.restore(p, a, p.config.phaseRescue ? 25 : 20, name, true);
    } else if (form) {
      p.formUntil = this.time + (name === 'awakening-burst' ? 10 : 8);
      p.chargedUntil = p.formUntil;
      this.emit('form-enter', p.id, undefined, 8, undefined, name);
    } else if (
      name === 'barrier' ||
      name === 'fortress' ||
      name === 'counter' ||
      name === 'retaliation'
    ) {
      for (const a of name === 'counter' || name === 'retaliation' ? [p] : near)
        this.grantBarrier(
          p,
          a,
          name === 'fortress' ? (p.config.fortress ? 8 : 6) : p.config.sharedShield ? 5 : 4,
        );
      if (name === 'fortress')
        for (const a of near) this.restore(p, a, p.config.fortress ? 25 : 15, name);
      if (name === 'counter' || name === 'retaliation') p.chargedUntil = this.time + 5;
    } else if (name === 'rescue-wave' || name === 'rescue-link') {
      for (const a of this.players.filter((a) => Math.hypot(a.x - p.x, a.y - p.y) < 210))
        this.restore(p, a, 35, name, true);
    } else if (name === 'energy-link') {
      for (const a of near) {
        const amount = Math.min(
          this.hasPassive(p, 'energy-transfer') ? 40 : 30,
          a.maxEnergy - a.energy,
        );
        a.energy += amount;
        // Energy becomes effective support only when the receiver subsequently spends it.
        if (a !== p && amount > 0) {
          a.passiveCooldowns!['energy-provider'] = this.players.indexOf(p) + 1;
          a.passiveCooldowns!['energy-credit'] = amount;
        }
      }
    } else if (name === 'mark') {
      const e = this.enemies
        .filter((e) => e.hp > 0)
        .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
      if (e) {
        e.armorBreakUntil = this.time + (this.hasPassive(p, 'mark-duration') ? 7 : 5);
        e.markOwner = p.id;
        e.markUntil = e.armorBreakUntil;
        this.emit('mark', p.id, e.id, 5, undefined, name);
        this.effect(e.x, e.y, 'armorbreak', 80);
      }
    } else if (name === 'precision-volley') {
      p.chargedUntil = this.time + 3;
      this.shoot(p, true);
    } else if (name === 'sync-pulse') {
      p.energy = Math.min(p.maxEnergy, p.energy + 30);
      this.grantBarrier(p, p, 1);
      p.tacticalCd[slot] = 30;
    }
    this.effect(p.x, p.y, form ? 'barrage' : 'combo', 80);
    this.events.push('skill');
    this.consumeEnergyCredit(p, cost);
    this.commandPulse(p);
    if (this.passiveStrength(p, 'maya-monitor-b'))
      this.trigger(p, 'maya-monitor-b', 10, () => {
        p.energy = Math.min(p.maxEnergy, p.energy + this.passiveStrength(p, 'maya-monitor-b') * 2);
      });
  }
  private consumeEnergyCredit(p: Player, cost: number) {
    const credit = p.passiveCooldowns?.['energy-credit'] || 0;
    const source = this.players[(p.passiveCooldowns?.['energy-provider'] || 0) - 1];
    if (credit <= 0 || !source) return;
    const used = Math.min(credit, cost);
    p.passiveCooldowns!['energy-credit'] -= used;
    this.emit('support', source.id, p.id, used, { action: 'energy-used' }, 'energy-link');
  }
  private simulatedInput(p: Player): InputState {
    if (
      (this.cooperation?.puzzle && !this.cooperation.puzzle.solved) ||
      (this.cooperation?.pads.length && this.cooperation.openFor <= 0)
    ) {
      const target =
        this.cooperation.puzzle && !this.cooperation.puzzle.solved
          ? this.cooperation.puzzle.bluePad
          : this.cooperation.pads[1];
      if (Math.hypot(target.x - p.x, target.y - p.y) < 20) return { fire: true };
      return { dir: this.pathDirection(p, target), fire: true };
    }
    const e = this.enemies.find((e) => e.hp > 0);
    if (!e) return {};
    const direction = this.lineOfFire(p, e);
    if (direction >= 0)
      return {
        fire: true,
        ...(p.dir !== direction ? { dir: direction } : {}),
        tactical1: Math.floor(this.time) % 8 === 0,
        targetPart: 'generator',
      };
    return {
      dir: this.pathDirection(p, e),
      fire: true,
      tactical1: Math.floor(this.time) % 8 === 0,
    };
  }
  private pathDirection(p: Point, target: Point) {
    const path = this.reachablePath(
      { x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) },
      { x: Math.floor(target.x / TILE), y: Math.floor(target.y / TILE) },
    );
    const next = path[1];
    const dx = (next ? (next.x + 0.5) * TILE : target.x) - p.x,
      dy = (next ? (next.y + 0.5) * TILE : target.y) - p.y;
    if (Math.hypot(dx, dy) < 5) return -1;
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0;
  }
  private hasPassive(p: Player, token: string) {
    return !!p.resolved?.passives.includes(token);
  }
  private passiveStrength(p: Player, token: string) {
    return (p.resolved?.passives || []).reduce((best, value) => {
      if (value === token) return Math.max(best, 1);
      if (!value.startsWith(token)) return best;
      const suffix = value.slice(token.length);
      // Family strength includes its inherent rank; an equipped first personal
      // tier must improve it. Branch-only effects have no inherent rank.
      if (/^-[ab]\d$/.test(suffix)) return Math.max(best, Number(suffix.at(-1)) + 1);
      if (/-[ab]$/.test(token) && /^\d$/.test(suffix)) return Math.max(best, Number(suffix));
      return best;
    }, 0);
  }
  private trigger(p: Player, token: string, cooldown: number, apply: () => void) {
    if (p.hp <= 0 || (p.passiveCooldowns?.[token] || 0) > this.time) return;
    p.passiveCooldowns![token] = this.time + cooldown;
    apply();
    this.emit('passive-trigger', p.id, undefined, 1, undefined, token);
  }
  private onRescue(source: Player, target: Player) {
    if (
      this.hasPassive(source, 'rescue-shield') ||
      this.hasPassive(source, 'rescue-network') ||
      this.passiveStrength(source, 'misato-command-b')
    )
      this.trigger(source, 'rescue-shield', 12, () => {
        this.grantBarrier(source, source, 3);
        this.grantBarrier(source, target, 3);
      });
  }
  private commandPulse(p: Player) {
    const strength = this.passiveStrength(p, 'misato-command');
    if (strength || this.hasPassive(p, 'resonance-misato-command'))
      this.trigger(p, 'misato-command', 10, () => {
        const resonance = this.hasPassive(p, 'resonance-misato-command');
        for (const a of this.players.filter(
          (a) => a.hp > 0 && Math.hypot(a.x - p.x, a.y - p.y) <= (resonance ? 200 : 160),
        )) {
          a.passiveCooldowns!['next-hit-bonus'] = Math.max(
            a.passiveCooldowns!['next-hit-bonus'] || 0,
            this.time + 3 + strength + (resonance ? 2 : 0),
          );
          a.passiveCooldowns!['next-hit-scale'] = Math.max(
            a.passiveCooldowns!['next-hit-scale'] || 0,
            resonance ? 1.25 : 1.15,
          );
        }
      });
  }
  private onEffectiveHit(p: Player, target: Actor, sourceId: string) {
    if (!p.resolved) return;
    p.passiveCooldowns!['hit-count'] = (p.passiveCooldowns!['hit-count'] || 0) + 1;
    if (this.hasPassive(p, 'steady-hit') && p.passiveCooldowns!['hit-count'] % 3 === 0)
      this.trigger(p, 'steady-hit', 5, () => {
        p.passiveCooldowns!['next-hit-bonus'] = this.time + 4;
      });
    const mari = this.passiveStrength(p, 'mari-mark');
    if (mari && p.passiveCooldowns!['hit-count'] % 4 === 0)
      this.trigger(p, 'mari-mark', 8, () => {
        target.armorBreakUntil = this.time + 2 + mari;
        target.markOwner = p.id;
        target.markUntil = target.armorBreakUntil;
      });
    if (sourceId.startsWith('melee.') && p.boost > 0 && this.passiveStrength(p, 'asuka-drive'))
      this.trigger(p, 'asuka-drive', 8, () => {
        p.chargedUntil = this.time + 2;
      });
  }
  private spawnReinforcement() {
    const template = this.enemies.find((e) => !e.boss) || this.enemies[0];
    if (!template) return;
    const cells: Point[] = [];
    for (let y = 1; y < this.map.height - 1; y++)
      for (let x = 1; x < this.map.width - 1; x++) {
        const px = (x + 0.5) * TILE,
          py = (y + 0.5) * TILE;
        if (
          this.pass(x, y) &&
          this.players.every((p) => Math.hypot(p.x - px, p.y - py) > 200) &&
          [...this.players, ...this.enemies].every((a) => Math.hypot(a.x - px, a.y - py) > 50)
        )
          cells.push({ x: px, y: py });
      }
    if (!cells.length) return;
    const position = cells[Math.floor(this.random() * cells.length)];
    this.enemies.push({
      ...structuredClone(template),
      ...position,
      id: `reinforcement-${++this.reinforcements}`,
      boss: false,
      encounter: undefined,
      parts: undefined,
      type: 1,
      hp: 50,
      maxHp: 50,
      fire: 2,
      think: 0,
    });
    this.emit('reinforcement', 'system', undefined, 1, { condition: this.condition || '' });
  }
  private updateV3(dt: number) {
    if (!this.participants.length) return;
    for (const action of this.coopActions) {
      if (
        (action.state === 'cooldown' && this.time >= action.cooldownUntil) ||
        (action.state === 'primed' && this.time >= action.expiresAt)
      )
        Object.assign(action, { state: 'ready', actorId: undefined, targetId: undefined });
    }
    if (
      this.condition === 'reinforcements' &&
      this.reinforcements < 3 &&
      this.time >= (this.reinforcements + 1) * 15
    )
      this.spawnReinforcement();
    for (const zone of this.powerZones) {
      const active = zone.backup || this.time % 45 < 18 || this.time % 45 >= 30;
      if (zone.active !== active) {
        zone.active = active;
        this.emit('power-state', 'system', zone.id, undefined, { active });
      }
    }
    const objective = this.objective;
    if (!objective || objective.state !== 'active') return;
    const alive = this.players.filter((p) => p.hp > 0);
    if (objective.kind === 'assault')
      objective.progress = this.enemies.filter((e) => e.hp <= 0).length;
    else {
      const position = objective.position!;
      const nearby = alive.filter((p) => Math.hypot(position.x - p.x, position.y - p.y) < 160);
      const attackers = this.enemies.filter(
        (e) => e.hp > 0 && Math.hypot(position.x - e.x, position.y - e.y) < 130,
      );
      if (objective.kind === 'defense') {
        if (nearby.length && !attackers.length)
          objective.progress = Math.min(objective.required, objective.progress + dt);
        if (attackers.length) objective.hp = Math.max(0, objective.hp - attackers.length * 4 * dt);
      } else if (nearby.length && !attackers.length) {
        const next = this.objectivePath[this.objectiveWaypoint + 1];
        if (next && this.pass(Math.floor(next.x / TILE), Math.floor(next.y / TILE))) {
          const distance = Math.hypot(next.x - position.x, next.y - position.y),
            step = 42 * dt;
          if (distance <= step) {
            Object.assign(position, next);
            this.objectiveWaypoint++;
          } else {
            position.x += ((next.x - position.x) * step) / distance;
            position.y += ((next.y - position.y) * step) / distance;
          }
          objective.progress = this.objectiveWaypoint;
        }
      }
      for (const p of nearby)
        if (
          (p.stats.moved >= 60 || this.effectiveParticipant(p)) &&
          Math.floor(this.time / 5) >
            Math.floor((this.participationAt[`objective:${p.id}`] || 0) / 5)
        ) {
          this.participationAt[`objective:${p.id}`] = this.time;
          this.emit('objective', p.id, objective.kind, 1);
        }
      if (objective.hp <= 0) objective.state = 'failed';
    }
    const mission = MISSIONS.find((m) => m.id === this.missionId);
    const stages = mission?.stages || 1;
    const boss = this.enemies.find((e) => e.encounter);
    const measured =
      objective.kind === 'assault' && boss && mission?.bossParts
        ? boss.encounter!.phaseIndex
        : Math.floor((objective.progress / objective.required) * stages);
    while (this.completedStages < Math.min(stages - 1, measured)) {
      this.completedStages++;
      for (const p of alive.filter((p) => this.effectiveParticipant(p)))
        this.emit('objective', p.id, this.missionId, 1, { stage: this.completedStages });
      this.emit('stage-complete', 'system', this.missionId, this.completedStages);
    }
  }
  private effectiveParticipant(p: Player) {
    return this.battleEvents.some(
      (event) =>
        event.actorId === p.id &&
        (event.amount || 0) > 0 &&
        [
          'damage',
          'part-damage',
          'protection',
          'healing',
          'rescue',
          'support',
          'objective',
        ].includes(event.kind),
    );
  }
  setPracticeOptions(options: Partial<{ invincible: boolean; noCooldown: boolean }> = {}) {
    if (!this.practice) return;
    for (const key of ['invincible', 'noCooldown'] as const)
      if (typeof options[key] === 'boolean') this.practiceOptions[key] = options[key];
  }
  resetPractice({ resetStats = false } = {}) {
    if (!this.practice) return;
    this.status = 'playing';
    this.bullets = [];
    this.effects = [];
    for (const a of [...this.players, ...this.enemies]) {
      a.hp = a.maxHp;
      if (a.team === 0 && a.encounter) {
        const first = BOSSES[a.encounter.id].phases[0];
        a.encounter.phaseIndex = 0;
        a.encounter.phaseId = first.id;
        a.encounter.phaseName = first.name;
        a.encounter.shielded = false;
        a.encounter.attackIndex = 0;
        a.encounter.telegraph = null;
        a.warning = 0;
      }
      a.armorBreakUntil = 0;
      a.slowUntil = 0;
      if (a.team === 1) {
        a.energy = a.maxEnergy;
        for (const k of Object.keys(a.cd) as (keyof Player['cd'])[]) a.cd[k] = 0;
      }
    }
    if (resetStats) {
      this.time = 0;
      this.kills = 0;
      this.score = 0;
      for (const p of this.players) {
        for (const k of Object.keys(p.stats) as (keyof Stats)[])
          if (k !== 'skillUses') p.stats[k] = 0;
        for (const k of Object.keys(p.stats.skillUses) as Skill[]) p.stats.skillUses[k] = 0;
      }
    }
  }
  random() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  tile(x: number, y: number) {
    if (this.cooperation?.gates?.some((g) => !g.open && g.x === x && g.y === y)) return 2;
    return this.map.tiles[y]?.[x] ?? 2;
  }
  pass(x: number, y: number) {
    return ![1, 2].includes(this.tile(x, y));
  }
  free(x: number, y: number, r = 18, actor: Actor | null = null) {
    for (let ty = Math.floor((y - r) / TILE); ty <= Math.floor((y + r) / TILE); ty++)
      for (let tx = Math.floor((x - r) / TILE); tx <= Math.floor((x + r) / TILE); tx++) {
        if (this.pass(tx, ty)) continue;
        const nx = clamp(x, tx * TILE, (tx + 1) * TILE),
          ny = clamp(y, ty * TILE, (ty + 1) * TILE);
        if ((x - nx) ** 2 + (y - ny) ** 2 < r * r) return false;
      }
    if (actor)
      for (const a of [...this.players, ...this.enemies]) {
        if (a === actor || a.hp <= 0) continue;
        const distance = Math.hypot(a.x - x, a.y - y),
          currentDistance = Math.hypot(a.x - actor.x, a.y - actor.y),
          separation = r + a.r - 2;
        // A revived actor may overlap their rescuer. Permit movement out of an
        // existing overlap, while still blocking entry into another actor.
        if (distance < separation && (currentDistance >= separation || distance <= currentDistance))
          return false;
      }
    return true;
  }
  move(a: Actor, dx: number, dy: number) {
    const ox = a.x,
      oy = a.y;
    let moved = false;
    if (this.free(a.x + dx, a.y, a.r, a)) {
      a.x += dx;
      moved ||= dx !== 0;
    }
    if (this.free(a.x, a.y + dy, a.r, a)) {
      a.y += dy;
      moved ||= dy !== 0;
    }
    a.moving = moved;
    if (a.stats) a.stats.moved += Math.hypot(a.x - ox, a.y - oy);
    return moved;
  }
  effect(x: number, y: number, kind = 'hit', radius = 40, dir = 0) {
    const life = ['boom', 'missile', 'shield', 'barrage', 'combo'].includes(kind) ? 0.65 : 0.45;
    this.effects.push({ x, y, kind, life, max: life, radius, dir });
  }
  shoot(a: Player | Enemy, missile = false, offset = 0, consumeRound = true) {
    let selectedAmmo = a.team && !missile ? a.loadout.ammo : null;
    let precision = false;
    if (a.team && a.resolved && a.selectedAmmoId && !missile) {
      const supply = AMMO.find((item) => item.id === a.selectedAmmoId);
      if (!supply || (consumeRound && !this.consume(a, supply.id))) {
        selectedAmmo = a.loadout.ammo = 'AP';
        a.selectedAmmoId = null;
      } else {
        precision = supply.behavior === 'precision';
        if (consumeRound) this.emit('ammo-used', a.id, undefined, 1, undefined, supply.id);
      }
    }
    if (a.team) a.stats.shots++;
    const ammo = selectedAmmo,
      r = missile ? 7 : 4;
    let [dx, dy] = DIRS[a.dir];
    const weapon =
      a.team && a.resolved ? WEAPONS.find((w) => w.id === a.resolved!.preset.weaponId) : null;
    if (a.team && a.resolved && a.targetPart) {
      const boss = this.enemies.find(
        (e) =>
          e.hp > 0 &&
          e.parts &&
          Math.hypot(e.x - a.x, e.y - a.y) < 550 &&
          (e.x - a.x) * dx + (e.y - a.y) * dy > 0,
      );
      const part = boss?.parts?.find((part) => part.id === a.targetPart);
      if (part) {
        const d = Math.hypot(part.x - a.x, part.y - a.y);
        dx = (part.x - a.x) / d;
        dy = (part.y - a.y) / d;
      }
    }
    const charged =
      !!a.team &&
      !!a.resolved &&
      (missile || (a.chargedUntil || 0) > this.time || weapon?.behavior === 'charge-cannon');
    let coverBonus = 1;
    let coverBy: string | undefined;
    if (a.team && charged) {
      const cover = this.coopActions.find((c) => c.id === 'barrier-cover');
      const provider = this.players.find((p) => p.id === cover?.actorId && p.hp > 0);
      if (
        cover?.state === 'primed' &&
        cover.expiresAt > this.time &&
        provider &&
        provider.id !== a.id &&
        Math.hypot(provider.x - a.x, provider.y - a.y) <= 180
      ) {
        coverBonus = 1.25;
        coverBy = provider.id;
      }
    }
    this.bullets.push({
      id: `b${++this.bulletSeq}`,
      x: a.x + dx * 26 - dy * offset,
      y: a.y + dy * 26 + dx * offset,
      dx,
      dy,
      r,
      team: a.team,
      damage:
        (missile
          ? 100
          : a.team
            ? ammo === 'HE'
              ? 14
              : ammo === 'HESH'
                ? 16
                : weapon?.damage || 20
            : a.type === 2
              ? 30
              : 20) *
        (a.team
          ? a.gearMods.damageMult *
            coverBonus *
            (precision ? 1.2 : 1) *
            (a.resolved && (a.formUntil || 0) > this.time ? 1.3 : 1) *
            (a.resolved && !a.moving ? 1 + 0.02 * this.passiveStrength(a, 'rei-precision') : 1) *
            (a.resolved && (a.passiveCooldowns?.['next-hit-bonus'] || 0) > this.time
              ? a.passiveCooldowns?.['next-hit-scale'] || 1.15
              : 1)
          : this.difficulty === 'relaxed'
            ? 0.5
            : this.difficulty === 'hard'
              ? 1.4
              : 1),
      speed: missile ? 300 : 380,
      life: weapon ? weapon.range / (missile ? 300 : 380) : 4,
      missile,
      ammo,
      owner: a.id,
      pierce: weapon?.behavior === 'charge-cannon' ? 1 : a.config?.pierce || 0,
      hitIds: [],
      ...(a.team && a.resolved
        ? {
            sourceId: missile ? 'precision-volley' : a.resolved.preset.weaponId,
            direct: true,
            charged,
            targetPart: a.targetPart,
            coverBy,
          }
        : {}),
    });
    a.firePose = 0.22;
    if (a.team && a.resolved && (a.passiveCooldowns?.['next-hit-bonus'] || 0) > this.time)
      a.passiveCooldowns!['next-hit-bonus'] = 0;
    this.events.push(missile ? 'missile' : 'fire');
  }
  fireBoss(e: Enemy) {
    const encounter = e.encounter!;
    const telegraph = encounter.telegraph!;
    const phase = BOSSES[encounter.id].phases[encounter.phaseIndex];
    const attack = phase.attacks[encounter.attackIndex % phase.attacks.length];
    const multiplier = this.difficulty === 'relaxed' ? 0.5 : this.difficulty === 'hard' ? 1.4 : 1;
    for (const angle of telegraph.angles) {
      const dx = Math.cos(angle),
        dy = Math.sin(angle);
      this.bullets.push({
        id: `b${++this.bulletSeq}`,
        x: telegraph.x + dx * 26,
        y: telegraph.y + dy * 26,
        dx,
        dy,
        r: telegraph.width / 2,
        team: 0,
        damage: attack.damage * multiplier,
        speed: attack.speed,
        life: (telegraph.radius - 26) / attack.speed,
        missile: false,
        ammo: null,
        owner: e.id,
        pierce: 0,
        hitIds: [],
        boss: true,
      });
    }
    encounter.telegraph = null;
    encounter.attackIndex++;
    e.firePose = 0.3;
    e.fire =
      attack.cooldown *
      (this.difficulty === 'hard' ? 0.85 : this.difficulty === 'relaxed' ? 1.2 : 1) *
      (e.parts?.some((part) => part.id === 'weapon' && part.state === 'disabled') ? 2 : 1);
    this.events.push('fire');
    this.effect(e.x, e.y, 'barrage', 90, e.dir);
  }
  warnBoss(e: Enemy, attack: BossAttack) {
    const encounter = e.encounter!;
    const angle = Math.atan2(DIRS[e.dir][1], DIRS[e.dir][0]);
    const angles =
      attack.pattern === 'fan'
        ? [-0.35, 0, 0.35].map((offset) => angle + offset)
        : attack.pattern === 'cross'
          ? [0, 1, 2, 3].map((i) => angle + (i * Math.PI) / 2)
          : attack.pattern === 'ring'
            ? Array.from(
                { length: 12 },
                (_, i) => ((i + (encounter.attackIndex % 2) / 2) * Math.PI) / 6,
              )
            : [angle];
    encounter.telegraph = {
      id: `${e.id}-${encounter.phaseId}-${encounter.attackIndex}`,
      pattern: attack.pattern,
      x: e.x,
      y: e.y,
      dir: e.dir,
      angles,
      width: attack.pattern === 'beam' ? 14 : 10,
      radius: 480,
      remaining: attack.warning,
      duration: attack.warning,
    };
    e.warning = attack.warning;
  }
  updateBoss(e: Enemy, alive: Player[], dt: number) {
    const encounter = e.encounter!;
    e.moving = false;
    encounter.shielded =
      !!this.cooperation?.pads.length &&
      this.cooperation.openFor <= 0 &&
      (!e.parts || (e.exposedUntil || 0) <= this.time);
    const weapon = e.parts?.find((part) => part.id === 'weapon');
    for (const part of e.parts || []) {
      if (part.id === 'core') {
        part.hp = e.hp;
        part.state = encounter.shielded ? 'protected' : 'active';
        continue;
      }
      if (part.state === 'disabled' && this.time >= part.disabledUntil) {
        part.state = 'active';
        part.hp = part.maxHp;
        part.immuneUntil = this.time + 5;
        part.contributors = [];
        this.emit(
          'part-restored',
          e.id,
          e.id,
          undefined,
          { immuneUntil: part.immuneUntil },
          undefined,
          part.id,
        );
      } else if (
        part.state === 'disabled' &&
        part.disabledUntil - this.time <= 2 &&
        part.immuneUntil === 0
      ) {
        part.immuneUntil = -1;
        this.emit('part-recovery-warning', e.id, e.id, 2, undefined, undefined, part.id);
      }
    }
    if (this.cooperation?.puzzle && !this.cooperation.puzzle.solved) return;
    if (encounter.telegraph) {
      e.warning = Math.max(0, e.warning - dt);
      encounter.telegraph.remaining = e.warning;
      if (e.warning === 0) this.fireBoss(e);
      return;
    }
    if (e.fire > 0) return;
    const target = alive.reduce((a, b) =>
      Math.hypot(a.x - e.x, a.y - e.y) < Math.hypot(b.x - e.x, b.y - e.y) ? a : b,
    );
    const dx = target.x - e.x,
      dy = target.y - e.y;
    e.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0;
    const phase = BOSSES[encounter.id].phases[encounter.phaseIndex];
    let attack = phase.attacks[encounter.attackIndex % phase.attacks.length];
    if (weapon?.state === 'disabled' && attack.pattern === 'beam') {
      encounter.attackIndex++;
      attack = phase.attacks[encounter.attackIndex % phase.attacks.length];
    }
    this.warnBoss(e, attack);
  }
  advanceBossPhase(e: Enemy) {
    const encounter = e.encounter!;
    const next = BOSSES[encounter.id].phases[encounter.phaseIndex + 1];
    if (!next || e.hp > e.maxHp * next.threshold) return;
    if (this.reviewPhaseId === encounter.phaseId) {
      this.status = 'won';
      this.emit('phase-practice-complete', 'system', e.id, 1, { phaseId: encounter.phaseId });
      return;
    }
    encounter.phaseIndex++;
    encounter.phaseId = next.id;
    encounter.phaseName = next.name;
    encounter.attackIndex = 0;
    encounter.telegraph = null;
    encounter.shielded = !this.practice && !!this.cooperation?.pads.length;
    e.warning = 0;
    e.fire = 1.5;
    if (this.cooperation) {
      this.cooperation.charge = 0;
      this.cooperation.openFor = 0;
    }
    this.bullets = this.bullets.filter((b) => b.owner !== e.id);
    this.effects.push({
      x: e.x,
      y: e.y,
      kind: 'phase',
      life: 1.5,
      max: 1.5,
      radius: 100,
      dir: 0,
      label: next.name,
    });
    this.events.push('skill');
    if (e.parts) {
      this.createBossParts(e);
      this.exposureContributors.clear();
      e.exposedUntil = 0;
    }
    this.emit('phase', e.id, e.id, encounter.phaseIndex, { name: next.name });
  }
  impactBullet(a: Actor, b: Projectile) {
    // Abstract facing armor: incoming direction opposite the defender is frontal.
    let multiplier = 1,
      label = b.ammo === 'HESH' ? '共振破甲' : '击穿';
    if (
      [2, 3].includes(a.type ?? 0) &&
      Number.isInteger(a.dir) &&
      DIRS[a.dir] &&
      !b.missile &&
      b.ammo !== 'HE'
    ) {
      const facing = DIRS[a.dir],
        dot = b.dx * facing[0] + b.dy * facing[1];
      if (dot < -0.5) {
        multiplier = b.ammo === 'AP' ? 0.95 : 0.75;
        label = b.ammo === 'HESH' ? '共振破甲' : '正面防护';
      } else if (dot > 0.5) {
        multiplier = 1.25;
        label = '背部命中';
      }
    }
    const before = a.hp;
    this.damage(
      a,
      b.damage * (b.ammo === 'AP' && a.type === 3 ? 1.3 : 1) * multiplier,
      b.owner,
      b.sourceId,
      b.direct !== false,
      Math.atan2(b.dy, b.dx),
    );
    const amount = Math.max(0, before - a.hp);
    if (b.team && amount > 0) {
      a.exposedUntil = this.time + 0.8;
      this.effects.push({
        x: a.x,
        y: a.y,
        kind: 'impact',
        life: 0.8,
        max: 0.8,
        radius: 32,
        dir: a.dir || 0,
        label,
        amount,
      });
    }
  }
  melee(p: Player) {
    if (!p || p.hp <= 0 || p.cd.melee > 0) return;
    const meleeWeapon = p.resolved
      ? WEAPONS.find((w) => w.id === p.resolved!.preset.meleeId)
      : null;
    const spear = p.loadout.melee === 'spear',
      reach = meleeWeapon?.range || (spear ? 145 : 85),
      [dx, dy] = DIRS[p.dir];
    const targets = this.enemies
      .filter((a) => {
        const x = a.x - p.x,
          y = a.y - p.y,
          d = Math.hypot(x, y);
        if (a.hp <= 0 || d > reach || d === 0 || (x * dx + y * dy) / d < (spear ? 0.94 : 0.5))
          return false;
        for (let step = 8; step < d; step += 8)
          if (
            this.tile(
              Math.floor((p.x + (x * step) / d) / TILE),
              Math.floor((p.y + (y * step) / d) / TILE),
            ) === 2
          )
            return false;
        return true;
      })
      .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
    for (const a of spear ? targets.slice(0, 1) : targets) {
      const weapon = p.resolved ? WEAPONS.find((w) => w.id === p.resolved!.preset.meleeId) : null;
      const amount =
        (weapon?.damage || (spear ? 52 : 32)) *
        p.gearMods.damageMult *
        (p.boost > 0
          ? 1 +
            0.04 * this.passiveStrength(p, 'asuka-drive') +
            (this.hasPassive(p, 'assault-chain') ? 0.15 : 0)
          : 1);
      const part = a.parts?.find((part) => part.id === (p.targetPart || 'core'));
      if (part) this.damagePart(a, part, amount, p.id, p.resolved?.preset.meleeId || 'melee');
      else this.damage(a, amount, p.id, p.resolved?.preset.meleeId || 'melee');
      p.stats.meleeHits++;
      if (
        p.resolved &&
        p.boost > 0 &&
        (this.hasPassive(p, 'assault-recycle') || this.hasPassive(p, 'resonance-asuka-drive'))
      )
        this.trigger(p, 'assault-recycle', 8, () => {
          p.energy = Math.min(p.maxEnergy, p.energy + 8);
        });
      if (spear) a.slowUntil = this.time + 1.2;
    }
    p.cd.melee = (meleeWeapon?.cooldown || (spear ? 1.25 : 0.9)) * p.gearMods.cooldownMult;
    p.stats.melee++;
    p.firePose = 0.25;
    this.effect(p.x, p.y, spear ? 'spear' : 'slash', reach, p.dir);
    this.events.push('skill');
  }
  useItem(p: Player) {
    if (p.resolved) return;
    if (!p || p.hp <= 0 || !p.activeItem || p.cd.item > 0) return;
    p.energy = Math.min(p.maxEnergy, p.energy + 30);
    p.shield = Math.max(p.shield, 1);
    p.cd.item = 30;
    this.effect(p.x, p.y, 'shield', 55, p.dir);
    this.events.push('skill');
  }
  skill(p: Player, name: Skill) {
    if (p.resolved && (name === 'special' || name === 'ultimate')) return;
    if (p.hp <= 0 || p.cd[name] > 0 || !['heal', 'speed', 'special', 'ultimate'].includes(name))
      return;
    const cost = { heal: 15, speed: 10, special: 25, ultimate: 40 }[name],
      unlimited = this.practice && this.practiceOptions.noCooldown;
    if (!unlimited && p.energy < cost) {
      if (!this.events.includes('noenergy')) this.events.push('noenergy');
      return;
    }
    const c = p.config;
    const use = () => {
      if (!unlimited) p.energy -= cost;
      this.emit('skill', p.id, undefined, 1, { skill: name }, name);
      this.emit('energy-spent', p.id, undefined, cost, undefined, name);
      this.consumeEnergyCredit(p, cost);
      p.stats.skills++;
      p.stats.skillUses[name]++;
      p.cd[name] *= p.gearMods.cooldownMult;
      if (name === 'heal') p.stats.heals++;
    };
    if (name === 'heal') {
      const nearby = this.players.filter(
        (a) =>
          a !== p &&
          Math.hypot(a.x - p.x, a.y - p.y) < c.healRadius &&
          (a.hp > 0 || c.resurrection),
      );
      if (p.hp >= p.maxHp && nearby.every((a) => a.hp >= a.maxHp)) return;
      for (const a of [p, ...nearby]) {
        if (a.hp <= 0) {
          a.hp = 30;
          p.stats.rescues++;
          this.emit('rescue', p.id, a.id, 1, { restoredHp: 30 }, name);
        }
        const amount = Math.min(a.maxHp - a.hp, (a === p ? 20 : 10) + c.healBonus);
        a.hp += amount;
        p.stats.healing += amount;
        if (amount > 0) this.emit('healing', p.id, a.id, amount, undefined, name);
        if (c.resurrection) {
          if (p.resolved) this.grantBarrier(p, a, 2);
          else a.shield = Math.max(a.shield, 2);
        }
        this.effect(a.x, a.y, 'heal', c.healRadius);
      }
      p.cd.heal = 20;
      p.heal = 1;
      p.flash = 0.15;
      this.events.push('heal');
      use();
    }
    if (name === 'speed') {
      p.boost = 10;
      p.cd.speed = 15;
      if (c.boostShield) {
        p.shield = Math.max(p.shield, 1.5);
        this.effect(p.x, p.y, 'shield', 55);
      }
      if (c.sharedBoost)
        for (const a of this.players)
          if (a !== p && a.hp > 0 && Math.hypot(a.x - p.x, a.y - p.y) < 180) a.boost = 10;
      this.events.push('skill');
      use();
    }
    if (name === 'special') {
      if (p.character === 'Asuka') {
        p.barrage = 2;
        p.cd.special = 5;
        p.cd.fire = 0;
        this.effect(p.x, p.y, 'barrage', 70);
      } else {
        this.effect(p.x, p.y, 'teleport', 45);
        const ox = p.x,
          oy = p.y,
          [dx, dy] = DIRS[p.dir];
        for (let step = 0; step < 15 + c.teleportExtra / 4; step++) {
          if (!this.free(p.x + dx * 4, p.y + dy * 4, p.r, p)) break;
          p.x += dx * 4;
          p.y += dy * 4;
        }
        p.stats.moved += Math.hypot(p.x - ox, p.y - oy);
        p.cd.special = 5;
        this.effect(p.x, p.y, 'teleport', 55);
        if (c.phaseShield) p.shield = Math.max(p.shield, 2);
        if (c.phaseRescue)
          for (const a of this.players)
            if (a !== p && Math.hypot(a.x - p.x, a.y - p.y) < 180) {
              if (a.hp <= 0) {
                a.hp = 30;
                p.stats.rescues++;
              }
              const amount = Math.min(a.maxHp - a.hp, 25);
              a.hp += amount;
              p.stats.healing += amount;
              this.effect(a.x, a.y, 'heal', 180);
            }
      }
      this.events.push('skill');
      use();
    }
    if (name === 'ultimate') {
      if (p.character === 'Asuka') {
        for (const a of this.players)
          if (a === p || (c.sharedShield && a.hp > 0 && Math.hypot(a.x - p.x, a.y - p.y) < 180)) {
            a.shield = 5 + (c.fortress ? 3 : 0);
            if (c.fortress) {
              const amount = Math.min(a.maxHp - a.hp, 25);
              a.hp += amount;
              p.stats.healing += amount;
            }
            this.effect(a.x, a.y, 'shield', 65);
          }
        p.cd.ultimate = 10;
      } else {
        this.shoot(p, true);
        p.cd.ultimate = 3;
        this.effect(p.x, p.y, 'missile', 35);
      }
      this.events.push('skill');
      use();
    }
  }
  damage(
    a: Actor,
    amount: number,
    owner: string | null = null,
    sourceId = 'primary',
    direct = true,
    incomingAngle?: number,
  ) {
    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      (this.participants.length && a.team && this.players.some((p) => p.id === owner))
    )
      return;
    const boss = a.boss ? (a as Enemy) : null;
    if (boss?.encounter?.shielded && !this.practice) {
      if (owner && this.players.some((p) => p.id === owner))
        this.emit('core-protected', owner, a.id, 0, undefined, sourceId, 'core');
      return;
    }
    if (a.team && a.hp > 0 && (a.shield || 0) > 0 && this.participants.length) {
      const target = a as Player;
      const provider =
        this.players.find(
          (p) => p.id === target.barrierOwner && (target.barrierUntil || 0) > this.time,
        ) || target;
      const absorbed = Math.min(Math.max(0, amount), target.barrierCapacity ?? target.maxHp);
      if (absorbed > 0)
        this.emit('protection', provider.id, target.id, absorbed, undefined, 'barrier');
      target.barrierCapacity = Math.max(0, (target.barrierCapacity ?? target.maxHp) - absorbed);
      amount -= absorbed;
      const cover = this.coopActions.find((c) => c.id === 'barrier-cover');
      if (
        absorbed > 0 &&
        cover &&
        cover.cooldownUntil <= this.time &&
        provider.hp > 0 &&
        (target.barrierUntil || 0) > this.time
      )
        Object.assign(cover, {
          state: 'primed',
          actorId: provider.id,
          targetId: target.id,
          expiresAt: this.time + 4,
        });
      if (absorbed > 0 && provider.id !== target.id && this.hasPassive(provider, 'barrier-recycle'))
        this.trigger(provider, 'barrier-recycle', 8, () => {
          provider.energy = Math.min(provider.maxEnergy, provider.energy + 8);
        });
      if (absorbed > 0 && this.hasPassive(provider, 'resonance-rei-precision'))
        this.trigger(provider, 'resonance-rei-precision', 12, () => {
          for (const ally of this.players.filter(
            (p) => p.hp > 0 && Math.hypot(p.x - provider.x, p.y - provider.y) < 180,
          ))
            this.grantBarrier(provider, ally, 2);
        });
      if (absorbed > 0 && this.hasPassive(provider, 'resonance-maya-monitor'))
        this.trigger(provider, 'resonance-maya-monitor', 10, () => {
          provider.energy = Math.min(provider.maxEnergy, provider.energy + 7);
        });
      if (absorbed > 0 && this.hasPassive(target, 'at-buffer')) {
        target.passiveCooldowns!['buffer-total'] =
          (target.passiveCooldowns!['buffer-total'] || 0) + absorbed;
        if (target.passiveCooldowns!['buffer-total'] >= 50)
          this.trigger(target, 'at-buffer', 15, () => {
            target.passiveCooldowns!['buffer-total'] = 0;
            target.passiveCooldowns!['buffer-until'] = this.time + 4;
          });
      }
      if (amount <= 0) return;
      target.shield = 0;
    }
    if (
      a.hp <= 0 ||
      (a.shield ?? 0) > 0 ||
      (this.practice && a.team && this.practiceOptions.invincible)
    )
      return;
    if ((a.armorBreakUntil ?? 0) > this.time) amount *= 1.25;
    const p = this.players.find((p) => p.id === owner);
    const markedBy = this.players.find((p) => p.id === a.markOwner);
    if (
      p &&
      markedBy &&
      p.id !== markedBy.id &&
      (a.markUntil || 0) > this.time &&
      direct &&
      this.participants.length
    ) {
      this.trigger(markedBy, 'mark-conversion', 3, () => {
        this.emit(
          'support',
          markedBy.id,
          p.id,
          Math.min(amount * 0.2, a.hp),
          { action: 'mark-conversion' },
          sourceId,
        );
        if (this.hasPassive(markedBy, 'mark-recycle'))
          markedBy.energy = Math.min(markedBy.maxEnergy, markedBy.energy + 6);
        if (this.hasPassive(markedBy, 'resonance-mari-mark')) p.chargedUntil = this.time + 2;
      });
    }
    if (p && this.hasPassive(p, 'marked-fire') && (a.markUntil || 0) > this.time) amount *= 1.08;
    if (
      a.team &&
      a.stats &&
      this.participants.length &&
      ((a as Player).passiveCooldowns?.['buffer-until'] || 0) > this.time
    )
      amount *= 0.8;
    if (
      p &&
      !this.participants.length &&
      !a.team &&
      a.lastOwner &&
      a.lastOwner !== owner &&
      this.time - (a.lastHit ?? -Infinity) < 1.5
    ) {
      amount += 10;
      p.stats.assists++;
      this.effect(a.x, a.y, 'combo', 70);
      this.events.push('skill');
    }
    if (p) {
      a.lastOwner = owner ?? undefined;
      a.lastHit = this.time;
    }
    if (boss?.encounter && !this.practice) {
      const next = BOSSES[boss.encounter.id].phases[boss.encounter.phaseIndex + 1];
      if (next) amount = Math.min(amount, Math.max(0, boss.hp - boss.maxHp * next.threshold));
    }
    const dealt = Math.min(a.hp, amount);
    if (dealt <= 0) return;
    if (p) p.stats.damage += dealt;
    if (a.team && a.stats) a.stats.taken += dealt;
    a.hp = Math.max(0, a.hp - amount);
    if (p && !a.team) {
      this.emit('damage', p.id, a.id, dealt, undefined, sourceId, boss?.parts ? 'core' : undefined);
      if (direct) {
        this.directHit(p, a, sourceId, incomingAngle);
        this.onEffectiveHit(p, a, sourceId);
      }
    }
    if (a.team) {
      this.emit('damage-taken', a.id, owner || 'enemy', dealt, undefined, sourceId);
      const target = a as Player;
      if (
        target.resolved &&
        (this.passiveStrength(target, 'shinji-counter') ||
          this.hasPassive(target, 'counter-focus') ||
          this.hasPassive(target, 'resonance-shinji-counter'))
      )
        this.trigger(target, 'counter-focus', 8, () => {
          target.passiveCooldowns!['next-hit-bonus'] = this.time + 4;
          target.passiveCooldowns!['next-hit-scale'] = this.hasPassive(
            target,
            'resonance-shinji-counter',
          )
            ? 1.3
            : Math.max(
                this.hasPassive(target, 'counter-focus') ? 1.22 : 1.15,
                1.12 + 0.03 * this.passiveStrength(target, 'shinji-counter'),
              );
          target.chargedUntil = this.time + 4;
        });
      if (this.hasPassive(target, 'counter-charge'))
        this.trigger(target, 'counter-charge', 6, () => {
          target.energy = Math.min(target.maxEnergy, target.energy + 8);
        });
    }
    if (boss?.encounter && a.hp > 0) this.advanceBossPhase(boss);
    a.flash = 0.18;
    this.effect(a.x, a.y);
    this.events.push('hit');
    if (a.hp === 0) {
      this.effect(a.x, a.y, 'boom');
      this.events.push('boom');
      if (!a.team) {
        this.kills++;
        this.score += a.type === 3 ? 250 : 100;
        this.emit('kill', owner || 'system', a.id, 1, undefined, sourceId);
      } else this.emit('downed', a.id, owner || 'enemy', 1);
    }
  }
  directionTo(enemy: Enemy, target: Player) {
    const sx = Math.floor(enemy.x / TILE),
      sy = Math.floor(enemy.y / TILE),
      tx = Math.floor(target.x / TILE),
      ty = Math.floor(target.y / TILE);
    const q = [{ x: sx, y: sy, first: -1 }],
      seen = new Set([`${sx},${sy}`]);
    for (let i = 0; i < q.length && i < 2304; i++) {
      const n = q[i];
      if (n.x === tx && n.y === ty) return n.first;
      for (let d = 0; d < 4; d++) {
        const x = n.x + DIRS[d][0],
          y = n.y + DIRS[d][1],
          key = `${x},${y}`;
        if (this.pass(x, y) && !seen.has(key)) {
          seen.add(key);
          q.push({ x, y, first: n.first < 0 ? d : n.first });
        }
      }
    }
    return -1;
  }
  lineOfFire(a: Actor, b: Actor) {
    const dx = b.x - a.x,
      dy = b.y - a.y;
    if (Math.abs(dx) > 20 && Math.abs(dy) > 20) return -1;
    const dir = Math.abs(dx) < Math.abs(dy) ? (dy > 0 ? 2 : 0) : dx > 0 ? 1 : 3;
    const n = Math.ceil(Math.hypot(dx, dy) / 12);
    for (let i = 1; i < n; i++)
      if (
        this.tile(
          Math.floor((a.x + (dx * i) / n) / TILE),
          Math.floor((a.y + (dy * i) / n) / TILE),
        ) === 2
      )
        return -1;
    return dir;
  }
  updateCooperation(alive: Player[], dt: number) {
    const c = this.cooperation;
    if (!c || this.practice) return;
    const paired = (first: Point, second: Point) =>
      alive.some(
        (a) =>
          Math.hypot(a.x - first.x, a.y - first.y) < 28 &&
          alive.some((b) => b !== a && Math.hypot(b.x - second.x, b.y - second.y) < 28),
      );
    if (c.puzzle && !c.puzzle.solved) {
      const p = c.puzzle;
      p.powered = alive.some((a) => Math.hypot(a.x - p.redPad.x, a.y - p.redPad.y) < 28);
      p.charge = paired(p.redPad, p.bluePad) ? Math.min(1, p.charge + dt / 1.5) : 0;
      if (p.charge < 1) return;
      p.solved = true;
      for (const player of alive.filter((a) =>
        [p.redPad, p.bluePad].some((pad) => Math.hypot(a.x - pad.x, a.y - pad.y) < 28),
      ))
        this.emit('objective', player.id, 'entry-mechanism', 1);
      for (const gate of c.gates || []) gate.open = true;
      this.effect(p.bluePad.x, p.bluePad.y, 'combo', 150);
      this.events.push('skill');
    }
    if (c.pads.length === 2) {
      if (c.openFor > 0) {
        c.openFor = Math.max(0, c.openFor - dt);
        c.charge = 0;
      } else {
        c.charge = paired(c.pads[0], c.pads[1]) ? Math.min(c.required, c.charge + dt) : 0;
        if (c.charge >= c.required) {
          const boss = this.enemies.find((e) => e.encounter && e.hp > 0);
          c.openFor = boss?.encounter
            ? BOSSES[boss.encounter.id].phases[boss.encounter.phaseIndex].exposure
            : 8;
          c.charge = 0;
          for (const player of alive.filter((a) =>
            c.pads.some((pad) => Math.hypot(a.x - pad.x, a.y - pad.y) < 28),
          ))
            this.emit('objective', player.id, boss?.id || 'core-mechanism', 1);
          this.emit('core-exposed', 'system', boss?.id, c.openFor, {
            reason: 'two-entity-mechanism',
          });
          this.effect(c.pads[0].x, c.pads[0].y, 'combo', 180);
          this.events.push('skill');
        }
      }
    }
    if (c.objective) {
      c.objective.id = `${this.map.encounterId || 'custom'}-${c.pads.length ? 'core' : 'clear'}`;
      c.objective.text = c.pads.length
        ? c.openFor > 0
          ? `核心暴露 ${Math.ceil(c.openFor)} 秒 · 集中火力；留意攻击预警`
          : '两人分别站上同步节点 · 重新打开核心屏障'
        : '闸门已开启 · 清除前方敌人';
    }
  }
  step(dt: number, inputs: InputState[] = []) {
    if (this.status !== 'playing') return;
    dt = clamp(dt, 0, 0.05);
    this.time += dt;
    this.events = [];
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i],
        input = this.simulatedAlly && i === 1 ? this.simulatedInput(p) : inputs[i] || {};
      p.moving = false;
      const power = this.powerZones.filter(
        (z) => z.active && Math.hypot(z.x - p.x, z.y - p.y) <= z.radius,
      );
      const regen = p.resolved
        ? (this.powerZones.length
            ? Math.max(0, ...power.map((z) => z.regen))
            : p.resolved.stats.energyRegen +
              (p.energy < 50
                ? 0.2 * this.passiveStrength(p, 'shinji-counter-b') +
                  (this.hasPassive(p, 'awakening-charge') ? 0.8 : 0)
                : 0)) * (p.shield > 0 ? 1 + 0.08 * this.passiveStrength(p, 'maya-monitor') : 1)
        : 8;
      p.energy =
        this.practice && this.practiceOptions.noCooldown
          ? p.maxEnergy
          : Math.min(p.maxEnergy, p.energy + regen * dt);
      if (
        input.targetPart === 'weapon' ||
        input.targetPart === 'generator' ||
        input.targetPart === 'core'
      )
        p.targetPart = input.targetPart;
      if (input.ammo === 'AP' || input.ammo === 'HE' || input.ammo === 'HESH') {
        p.loadout.ammo = input.ammo;
        if (p.resolved) {
          const item = AMMO.find((item) => item.legacy === input.ammo);
          const weapon = WEAPONS.find((w) => w.id === p.resolved!.preset.weaponId);
          p.selectedAmmoId =
            item && weapon?.ammo.includes(item.id) && (p.stock[item.id] || 0) > 0 ? item.id : null;
          if (!p.selectedAmmoId) p.loadout.ammo = 'AP';
        }
      }
      p.tacticalCd = p.tacticalCd.map((cd) => Math.max(0, cd - dt));
      if (p.formUntil && p.formUntil <= this.time) {
        p.formUntil = 0;
        this.emit('form-exit', p.id);
      }
      for (const k of Object.keys(p.cd) as (keyof Player['cd'])[])
        p.cd[k] =
          this.practice && this.practiceOptions.noCooldown
            ? 0
            : Math.max(
                0,
                p.cd[k] -
                  (dt *
                    (p.resolved && input.dir !== undefined
                      ? 1 + 0.03 * this.passiveStrength(p, 'mari-mark-b')
                      : 1)) /
                    (k === 'fire' ? p.gearMods.cooldownMult : 1),
              );
      for (const k of ['boost', 'heal', 'barrage', 'shield', 'flash', 'firePose'] as const)
        p[k] = Math.max(0, p[k] - dt);
      if (p.hp <= 0) {
        const friend = this.players.find(
          (a) => a !== p && a.hp > 0 && Math.hypot(a.x - p.x, a.y - p.y) < 90,
        );
        p.revive = friend ? p.revive + dt : 0;
        if (
          friend &&
          p.revive >=
            (friend.config.fastRescue || this.hasPassive(friend, 'rescue-network') ? 1.5 : 3)
        ) {
          p.hp = 40;
          p.revive = 0;
          p.shield = 2;
          friend.stats.rescues++;
          this.emit('rescue', friend.id, p.id, 1, { restoredHp: 40 }, 'basic-rescue');
          this.onRescue(friend, p);
          this.events.push('heal');
        }
        continue;
      }
      if (input.item) this.useItem(p);
      for (const slot of [0, 1, 2])
        if (input[`tactical${slot + 1}` as keyof InputState]) this.tactical(p, slot);
      if (input.consumable1) this.useConsumable(p, 0);
      if (input.consumable2) this.useConsumable(p, 1);
      if (input.melee) this.melee(p);
      for (const skill of ['heal', 'speed', 'special', 'ultimate'] as const)
        if (input[skill]) this.skill(p, skill);
      if (
        typeof input.dir === 'number' &&
        Number.isInteger(input.dir) &&
        input.dir >= 0 &&
        input.dir <= 3
      ) {
        p.dir = input.dir;
        if (p.heal <= 0 && (p.barrage <= 0 || p.config.mobileBarrage)) {
          const speed =
            (p.boost > 0 ? 160 : p.shield > 0 ? 120 : 80) *
            p.config.speedMultiplier *
            p.gearMods.speedMult *
            (p.resolved && p.boost > 0 && this.hasPassive(p, 'assault-drive') ? 1.1 : 1);
          this.move(p, DIRS[p.dir][0] * speed * dt, DIRS[p.dir][1] * speed * dt);
          if (p.moving && this.time - (this.participationAt[p.id] || 0) >= 5) {
            this.participationAt[p.id] = this.time;
            this.emit('participation', p.id, undefined, 5);
          }
        }
      }
      if ((input.fire || p.barrage > 0) && p.cd.fire <= 0 && p.heal <= 0) {
        if (p.barrage > 0) {
          this.shoot(p, false, -14);
          this.shoot(p, false, 14, false);
          if (p.config.tripleBarrage) this.shoot(p, false, 0, false);
          p.cd.fire = 0.16;
        } else {
          if (
            p.config.doubleShot ||
            (p.resolved &&
              WEAPONS.find((w) => w.id === p.resolved!.preset.weaponId)?.behavior === 'twin')
          ) {
            this.shoot(p, false, -10);
            this.shoot(p, false, 10, false);
          } else this.shoot(p);
          const weapon = p.resolved
            ? WEAPONS.find((w) => w.id === p.resolved!.preset.weaponId)
            : null;
          p.cd.fire =
            p.config.sharedBoost && p.boost > 0
              ? Math.min(weapon?.cooldown || 1, 0.35)
              : weapon?.cooldown || 1;
          if (p.resolved && weapon?.behavior === 'charge-cannon') p.heal = 0.16;
          const [dx, dy] = DIRS[p.dir];
          this.move(p, -dx * 3, -dy * 3);
        }
      }
    }
    const alive = this.players.filter((p) => p.hp > 0);
    this.updateCooperation(alive, dt);
    this.updateV3(dt);

    for (const e of this.enemies) {
      if (this.practice) {
        if (e.hp <= 0) e.hp = e.maxHp;
        e.moving = false;
        continue;
      }
      if (e.hp <= 0) continue;
      e.flash = Math.max(0, e.flash - dt);
      e.firePose = Math.max(0, e.firePose - dt);
      e.think -= dt;
      e.fire -= dt;
      if (!alive.length) break;
      if (e.encounter) {
        this.updateBoss(e, alive, dt);
        continue;
      }
      if (e.type === 4) {
        e.moving = false;
        e.repair -= dt;
        if (e.repair <= 0) {
          e.repair = 6;
          for (const a of this.enemies)
            if (
              a !== e &&
              a.hp > 0 &&
              a.hp < a.maxHp &&
              Math.hypot(a.x - e.x, a.y - e.y) < 220 &&
              (!a.boss || (this.cooperation?.openFor ?? 0) > 0)
            ) {
              a.hp = Math.min(a.maxHp, a.hp + 12);
              this.effect(a.x, a.y, 'heal', 55);
            }
          this.effect(e.x, e.y, 'heal', 220);
        }
        continue;
      }
      if (e.type === 2 && e.warning > 0) {
        e.warning = Math.max(0, e.warning - dt);
        e.moving = false;
        if (e.warning === 0) {
          this.shoot(e);
          e.fire =
            4 * (this.difficulty === 'hard' ? 0.7 : this.difficulty === 'relaxed' ? 1.25 : 1);
        }
        continue;
      }
      const target = alive.reduce((a, b) =>
        Math.hypot(a.x - e.x, a.y - e.y) < Math.hypot(b.x - e.x, b.y - e.y) ? a : b,
      );
      if (e.think <= 0) {
        const d = this.directionTo(e, target);
        e.dir = d < 0 ? Math.floor(this.random() * 4) : d;
        e.think = 0.7 + this.random() * 0.35;
      }
      const speed =
        (e.type === 3 ? 58 : e.type === 1 ? 90 : 60) * ((e.slowUntil ?? 0) > this.time ? 0.5 : 1);
      // Align with corridor centers before turning, avoiding diagonal corner trapping.
      const [dx, dy] = DIRS[e.dir];
      let mx = dx * speed * dt,
        my = dy * speed * dt;
      const cx = (Math.floor(e.x / TILE) + 0.5) * TILE,
        cy = (Math.floor(e.y / TILE) + 0.5) * TILE;
      if (dx && Math.abs(e.y - cy) > 2) {
        mx = 0;
        my = clamp(cy - e.y, -speed * dt, speed * dt);
      }
      if (dy && Math.abs(e.x - cx) > 2) {
        my = 0;
        mx = clamp(cx - e.x, -speed * dt, speed * dt);
      }
      if (!this.move(e, mx, my)) e.think = 0;
      if (e.fire <= 0) {
        const d = this.lineOfFire(e, target);
        if (d >= 0) e.dir = d;
        if (e.type === 2) {
          e.warning = 0.7;
          this.effects.push({
            x: e.x,
            y: e.y,
            kind: 'warning',
            life: 0.7,
            max: 0.7,
            radius: 160,
            dir: e.dir,
          });
          continue;
        }
        this.shoot(e);
        e.fire =
          ((e.type === 3 ? 2.7 : 4) + (this.difficulty === 'relaxed' ? 1 : 0)) *
          (this.difficulty === 'hard' ? 0.7 : 1);
      }
    }
    for (const b of this.bullets) {
      b.life -= dt;
      if (b.life <= 0) continue;
      const n = Math.ceil((b.speed * dt) / 6);
      for (let s = 0; s < n && b.life > 0; s++) {
        b.x += (b.dx * b.speed * dt) / n;
        b.y += (b.dy * b.speed * dt) / n;
        if (this.tile(Math.floor(b.x / TILE), Math.floor(b.y / TILE)) === 2) {
          b.life = 0;
          this.effect(b.x, b.y);
          break;
        }
        const targets = b.team ? this.enemies : this.players;
        if (
          !b.team &&
          this.objective?.position &&
          this.objective.state === 'active' &&
          Math.hypot(this.objective.position.x - b.x, this.objective.position.y - b.y) < 25 + b.r
        ) {
          const guard = this.players.find(
            (p) =>
              p.hp > 0 &&
              p.shield > 0 &&
              Math.hypot(p.x - this.objective!.position!.x, p.y - this.objective!.position!.y) <
                120,
          );
          if (guard) this.damage(guard, b.damage, b.owner, 'objective-barrier');
          else this.objective.hp = Math.max(0, this.objective.hp - b.damage);
          b.life = 0;
          break;
        }
        for (const a of targets)
          if (
            a.hp > 0 &&
            !b.hitIds.includes(a.id) &&
            (a.team === 0 && a.parts
              ? a.parts.some(
                  (part) =>
                    (!b.targetPart || part.id === b.targetPart) &&
                    Math.hypot(part.x - b.x, part.y - b.y) < part.r + b.r,
                )
              : Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r)
          ) {
            const shooter = this.players.find((p) => p.id === b.owner);
            if (shooter) shooter.stats.hits++;
            const part =
              a.team === 0
                ? a.parts?.find(
                    (part) =>
                      (!b.targetPart || part.id === b.targetPart) &&
                      Math.hypot(part.x - b.x, part.y - b.y) < part.r + b.r,
                  )
                : undefined;
            const hpBefore = part && part.id !== 'core' ? part.hp : a.hp;
            if (part && a.team === 0)
              this.damagePart(
                a,
                part,
                b.damage,
                b.owner,
                b.sourceId,
                b.direct !== false,
                Math.atan2(b.dy, b.dx),
              );
            else this.impactBullet(a, b);
            if (b.coverBy && shooter && hpBefore > (part && part.id !== 'core' ? part.hp : a.hp)) {
              const cover = this.coopActions.find((c) => c.id === 'barrier-cover');
              if (cover && cover.cooldownUntil <= this.time && cover.actorId === b.coverBy) {
                cover.state = 'cooldown';
                cover.cooldownUntil = this.time + 14;
                this.emit(
                  'coop',
                  shooter.id,
                  a.id,
                  1,
                  { action: 'barrier-cover', partnerId: b.coverBy },
                  b.sourceId,
                );
                this.emit('support', b.coverBy, shooter.id, 10, { action: 'barrier-cover' });
                this.effect(a.x, a.y, 'combo', 85);
              }
              b.coverBy = undefined;
            }
            if (b.ammo === 'HESH' && a.hp > 0) {
              a.armorBreakUntil = this.time + 4;
              this.effect(a.x, a.y, 'armorbreak', 45);
            }
            if (b.ammo === 'HE') {
              this.effect(b.x, b.y, 'explosion', 80);
              for (const other of targets)
                if (other !== a && Math.hypot(other.x - b.x, other.y - b.y) < 80)
                  this.damage(
                    other,
                    12 * (shooter?.gearMods.damageMult || 1),
                    b.owner,
                    'explosive-splash',
                    false,
                  );
            }
            b.hitIds.push(a.id);
            if (b.pierce > 0 && !b.missile) b.pierce--;
            else b.life = 0;
            if (b.missile) {
              const c = shooter?.config || {
                missileRadius: 80,
                splashDamage: 50,
                chainBlast: false,
              };
              this.effect(b.x, b.y, 'missile', c.missileRadius);
              for (const other of targets)
                if (other !== a && Math.hypot(other.x - b.x, other.y - b.y) < c.missileRadius)
                  this.damage(other, c.splashDamage, b.owner, 'missile-splash', false);
              if (c.chainBlast) {
                this.effect(b.x, b.y, 'combo', 180);
                for (const other of targets)
                  if (Math.hypot(other.x - b.x, other.y - b.y) < 180)
                    this.damage(other, 35, b.owner, 'chain-blast', false);
              }
            }
            break;
          }
      }
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);
    if (this.participants.length)
      for (const b of this.bullets.filter(
        (b) => !b.team && (b.boss || this.enemies.find((e) => e.id === b.owner)?.type === 2),
      )) {
        for (const p of this.players)
          if (
            p.hp > 0 &&
            p.boost > 0 &&
            this.hasPassive(p, 'dodge-recycle') &&
            Math.hypot(b.x - p.x, b.y - p.y) < 65 &&
            (b.x - p.x) * b.dx + (b.y - p.y) * b.dy > 0
          )
            this.trigger(p, 'dodge-recycle', 10, () => {
              p.energy = Math.min(p.maxEnergy, p.energy + 8);
            });
      }
    for (const e of this.effects) e.life -= dt;
    this.effects = this.effects.filter((e) => e.life > 0);
    if (this.practice) {
      for (const e of this.enemies) if (e.hp <= 0) e.hp = e.maxHp;
      return;
    }
    if (
      this.players.every((p) => p.hp <= 0) ||
      this.objective?.state === 'failed' ||
      (this.objective && this.objective.hp <= 0)
    )
      this.status = 'lost';
    else if (
      (this.objective?.kind === 'defense'
        ? this.objective.progress >= this.objective.required
        : this.enemies.every((e) => e.hp <= 0) &&
          (!this.objective ||
            this.objective.kind !== 'escort' ||
            this.objective.progress >= this.objective.required)) &&
      (!this.cooperation?.puzzle || this.cooperation.puzzle.solved)
    ) {
      this.status = 'won';
      if (this.cooperation?.objective) {
        this.cooperation.objective.state = 'complete';
        this.cooperation.objective.text = '任务完成';
      }
      this.score += Math.max(0, 600 - Math.floor(this.time)) * 2;
    }
    if (this.participants.length && this.status !== 'playing' && !this.stageEventSent) {
      this.stageEventSent = true;
      if (this.status === 'won') {
        if (this.objective) this.objective.state = 'complete';
        this.completedStages = this.reviewPhaseId
          ? 1
          : MISSIONS.find((m) => m.id === this.missionId)?.stages || 1;
        for (const p of this.players.filter((p) => this.effectiveParticipant(p)))
          this.emit('objective', p.id, this.missionId, 1, { complete: true });
        this.emit('stage-complete', 'system', this.missionId, this.completedStages);
      }
      this.emit('battle-end', 'system', this.missionId, undefined, {
        won: this.status === 'won',
        stages: this.completedStages,
      });
    }
  }
}
