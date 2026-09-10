import { ValidationError } from './errors';
import * as Progression from './progression';
import * as Equipment from './equipment';
import { BOSSES, campaignDefinition } from './content';
import type { BossAttack } from './content';
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
    }: GameOptions = {},
  ) {
    this.practice = !!practice;
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
    this.coop = coop;
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
    this.players = this.map.spawns.slice(0, coop ? 2 : 1).map(
      (p, i) =>
        ({
          id: `p${i}`,
          x: (p.x + 0.5) * TILE,
          y: (p.y + 0.5) * TILE,
          dir: 0,
          r: 18,
          hp: 100,
          maxHp: 100,
          character: characters[i] || (coop ? (i ? 'Rei' : 'Asuka') : character),
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
  shoot(a: Player | Enemy, missile = false, offset = 0) {
    if (a.team) a.stats.shots++;
    const ammo = a.team && !missile ? a.loadout.ammo : null,
      [dx, dy] = DIRS[a.dir],
      r = missile ? 7 : 4;
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
                : 20
            : a.type === 2
              ? 30
              : 20) *
        (a.team
          ? a.gearMods.damageMult
          : this.difficulty === 'relaxed'
            ? 0.5
            : this.difficulty === 'hard'
              ? 1.4
              : 1),
      speed: missile ? 300 : 380,
      life: 4,
      missile,
      ammo,
      owner: a.id,
      pierce: a.config?.pierce || 0,
      hitIds: [],
    });
    a.firePose = 0.22;
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
      (this.difficulty === 'hard' ? 0.85 : this.difficulty === 'relaxed' ? 1.2 : 1);
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
    encounter.shielded = !!this.cooperation?.pads.length && this.cooperation.openFor <= 0;
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
    this.warnBoss(e, phase.attacks[encounter.attackIndex % phase.attacks.length]);
  }
  advanceBossPhase(e: Enemy) {
    const encounter = e.encounter!;
    const next = BOSSES[encounter.id].phases[encounter.phaseIndex + 1];
    if (!next || e.hp > e.maxHp * next.threshold) return;
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
    this.damage(a, b.damage * (b.ammo === 'AP' && a.type === 3 ? 1.3 : 1) * multiplier, b.owner);
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
    const spear = p.loadout.melee === 'spear',
      reach = spear ? 145 : 85,
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
      this.damage(a, (spear ? 52 : 32) * p.gearMods.damageMult, p.id);
      p.stats.meleeHits++;
      if (spear) a.slowUntil = this.time + 1.2;
    }
    p.cd.melee = (spear ? 1.25 : 0.9) * p.gearMods.cooldownMult;
    p.stats.melee++;
    p.firePose = 0.25;
    this.effect(p.x, p.y, spear ? 'spear' : 'slash', reach, p.dir);
    this.events.push('skill');
  }
  useItem(p: Player) {
    if (!p || p.hp <= 0 || !p.activeItem || p.cd.item > 0) return;
    p.energy = Math.min(p.maxEnergy, p.energy + 30);
    p.shield = Math.max(p.shield, 1);
    p.cd.item = 30;
    this.effect(p.x, p.y, 'shield', 55, p.dir);
    this.events.push('skill');
  }
  skill(p: Player, name: Skill) {
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
        }
        const amount = Math.min(a.maxHp - a.hp, (a === p ? 20 : 10) + c.healBonus);
        a.hp += amount;
        p.stats.healing += amount;
        if (c.resurrection) a.shield = Math.max(a.shield, 2);
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
  damage(a: Actor, amount: number, owner: string | null = null) {
    const boss = a.boss ? (a as Enemy) : null;
    if (boss?.encounter?.shielded && !this.practice) return;
    if (
      a.hp <= 0 ||
      (a.shield ?? 0) > 0 ||
      (this.practice && a.team && this.practiceOptions.invincible)
    )
      return;
    if ((a.armorBreakUntil ?? 0) > this.time) amount *= 1.25;
    const p = this.players.find((p) => p.id === owner);
    if (
      p &&
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
    if (p) p.stats.damage += dealt;
    if (a.team && a.stats) a.stats.taken += dealt;
    a.hp = Math.max(0, a.hp - amount);
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
      }
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
        input = inputs[i] || {};
      p.moving = false;
      p.energy =
        this.practice && this.practiceOptions.noCooldown
          ? p.maxEnergy
          : Math.min(p.maxEnergy, p.energy + 8 * dt);
      if (input.ammo === 'AP' || input.ammo === 'HE' || input.ammo === 'HESH')
        p.loadout.ammo = input.ammo;
      for (const k of Object.keys(p.cd) as (keyof Player['cd'])[])
        p.cd[k] =
          this.practice && this.practiceOptions.noCooldown
            ? 0
            : Math.max(0, p.cd[k] - dt / (k === 'fire' ? p.gearMods.cooldownMult : 1));
      for (const k of ['boost', 'heal', 'barrage', 'shield', 'flash', 'firePose'] as const)
        p[k] = Math.max(0, p[k] - dt);
      if (p.hp <= 0) {
        const friend = this.players.find(
          (a) => a !== p && a.hp > 0 && Math.hypot(a.x - p.x, a.y - p.y) < 90,
        );
        p.revive = friend ? p.revive + dt : 0;
        if (friend && p.revive >= (friend.config.fastRescue ? 1.5 : 3)) {
          p.hp = 40;
          p.revive = 0;
          p.shield = 2;
          friend.stats.rescues++;
          this.events.push('heal');
        }
        continue;
      }
      if (input.item) this.useItem(p);
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
            p.gearMods.speedMult;
          this.move(p, DIRS[p.dir][0] * speed * dt, DIRS[p.dir][1] * speed * dt);
        }
      }
      if ((input.fire || p.barrage > 0) && p.cd.fire <= 0 && p.heal <= 0) {
        if (p.barrage > 0) {
          this.shoot(p, false, -14);
          this.shoot(p, false, 14);
          if (p.config.tripleBarrage) this.shoot(p, false, 0);
          p.cd.fire = 0.16;
        } else {
          if (p.config.doubleShot) {
            this.shoot(p, false, -10);
            this.shoot(p, false, 10);
          } else this.shoot(p);
          p.cd.fire = p.config.sharedBoost && p.boost > 0 ? 0.35 : 1;
          const [dx, dy] = DIRS[p.dir];
          this.move(p, -dx * 3, -dy * 3);
        }
      }
    }
    const alive = this.players.filter((p) => p.hp > 0);
    this.updateCooperation(alive, dt);

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
        for (const a of targets)
          if (
            a.hp > 0 &&
            !b.hitIds.includes(a.id) &&
            Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r
          ) {
            const shooter = this.players.find((p) => p.id === b.owner);
            if (shooter) shooter.stats.hits++;
            this.impactBullet(a, b);
            if (b.ammo === 'HESH' && a.hp > 0) {
              a.armorBreakUntil = this.time + 4;
              this.effect(a.x, a.y, 'armorbreak', 45);
            }
            if (b.ammo === 'HE') {
              this.effect(b.x, b.y, 'explosion', 80);
              for (const other of targets)
                if (other !== a && Math.hypot(other.x - b.x, other.y - b.y) < 80)
                  this.damage(other, 12 * (shooter?.gearMods.damageMult || 1), b.owner);
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
                  this.damage(other, c.splashDamage, b.owner);
              if (c.chainBlast) {
                this.effect(b.x, b.y, 'combo', 180);
                for (const other of targets)
                  if (Math.hypot(other.x - b.x, other.y - b.y) < 180)
                    this.damage(other, 35, b.owner);
              }
            }
            break;
          }
      }
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);
    for (const e of this.effects) e.life -= dt;
    this.effects = this.effects.filter((e) => e.life > 0);
    if (this.practice) {
      for (const e of this.enemies) if (e.hp <= 0) e.hp = e.maxHp;
      return;
    }
    if (this.players.every((p) => p.hp <= 0)) this.status = 'lost';
    else if (
      this.enemies.every((e) => e.hp <= 0) &&
      (!this.cooperation?.puzzle || this.cooperation.puzzle.solved)
    ) {
      this.status = 'won';
      if (this.cooperation?.objective) {
        this.cooperation.objective.state = 'complete';
        this.cooperation.objective.text = '任务完成';
      }
      this.score += Math.max(0, 600 - Math.floor(this.time)) * 2;
    }
  }
}
