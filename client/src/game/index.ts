import Phaser from 'phaser';
import {
  Game as Simulation,
  Eva,
  blankMap,
  campaign,
  type GameState,
  type GameMap,
  type InputState,
} from '@dawn/simulation';
import { createAssetLoader } from './assets';
import type { AssetLoader } from './asset-loader';
import type { AssetPack } from './asset-manifest';
import { BattleScene } from './scene';
import type { GameRuntime, GameCallbacks, GameView, Pilot, PracticeOptions } from './types';
export type {
  GameRuntime,
  GameCallbacks,
  GameView,
  Pilot,
  PracticeOptions,
  AssetPack,
} from './types';
export interface Session {
  view: GameView;
  pilot: Pilot;
  reducedMotion: boolean;
  ready: boolean;
  state: GameState | null;
  map: GameMap | null;
  localIndex: number;
  round: string;
  simulation: Simulation | null;
  paused: boolean;
  blurred: boolean;
  input: InputState;
  callbacks: GameCallbacks;
  version: number;
}
export function createGame(container: HTMLElement, callbacks: GameCallbacks = {}): GameRuntime {
  let destroyed = false;
  let loader: AssetLoader | undefined;
  const loaderWaiters = new Set<{
    resolve(value: AssetLoader): void;
    reject(error: Error): void;
  }>();
  const session: Session = {
    view: 'cover',
    pilot: 'Asuka',
    reducedMotion: false,
    ready: false,
    state: null,
    map: null,
    localIndex: 0,
    round: '',
    simulation: null,
    paused: false,
    blurred: false,
    input: {},
    callbacks,
    version: 0,
  };
  class Boot extends Phaser.Scene {
    constructor() {
      super('Boot');
    }
    create() {
      loader = createAssetLoader(this, (value, pack) => callbacks.onProgress?.(value, pack));
      for (const waiter of loaderWaiters) waiter.resolve(loader);
      loaderWaiters.clear();
      void prepareAssets('cover').catch((error: Error) => {
        if (!destroyed) callbacks.onError?.(error.message);
      });
    }
  }
  class Backdrop extends Phaser.Scene {
    private background?: Phaser.GameObjects.Image;
    private last = '';
    constructor() {
      super('Backdrop');
    }
    create() {
      this.background = this.add.image(800, 450, 'cover-dawn').setDisplaySize(1600, 900);
      this.add.rectangle(800, 450, 1600, 900, 0x030a12, 0.2);
    }
    update() {
      if (!this.background) return;
      const visible = !['battle', 'practice'].includes(session.view);
      this.background.setVisible(visible);
      if (!visible) return;
      const key = session.view === 'cover' ? 'cover-dawn' : 'hangar-dawn';
      if (this.last !== key) {
        this.background.setTexture(key);
        this.last = key;
      }
    }
  }
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: container,
    width: 1600,
    height: 900,
    backgroundColor: '#080f19',
    scene: [Boot, Backdrop, new BattleScene(session)],
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: 1600,
      height: 900,
    },
    render: { antialias: true, roundPixels: false },
    input: { keyboard: true },
    audio: { noAudio: true },
  });
  async function prepareAssets(pack: AssetPack) {
    if (destroyed) throw new Error('游戏已关闭。');
    const assets =
      loader ??
      (await new Promise<AssetLoader>((resolve, reject) => {
        loaderWaiters.add({ resolve, reject });
      }));
    await assets.prepare('cover');
    if (destroyed) throw new Error('游戏已关闭。');
    if (!session.ready) {
      session.ready = true;
      // Keep Boot alive as the resource-loading scene for later packs.
      game.scene.start('Backdrop');
      game.scene.start('Battle');
      callbacks.onReady?.();
    }
    if (pack !== 'cover') await assets.prepare(pack);
  }
  const clear = () => {
    session.input = {};
    if (session.ready) (game.scene.getScene('Battle') as BattleScene).clearInput();
    callbacks.onInput?.({});
  };
  const blur = () => {
    session.blurred = true;
    clear();
  };
  const focus = () => {
    session.blurred = false;
  };
  const visibility = () => (document.hidden ? blur() : focus());
  window.addEventListener('blur', blur);
  window.addEventListener('focus', focus);
  document.addEventListener('visibilitychange', visibility);
  function startPractice(options: PracticeOptions) {
    const mission = Eva.MISSIONS.find((m) => m.id === options.missionId);
    const map = mission
      ? campaign(Math.floor(mission.campaignIndex / 3), mission.campaignIndex % 3)
      : options.tutorial
        ? campaign(0, 0)
        : blankMap(22, 16);
    map.name = mission?.name ?? (options.tutorial ? '同步训练 · 原作 Round 1' : '战术试验场');
    if (!options.tutorial && !mission) {
      map.artSet = 'new';
      map.enemies = [
        { x: 7, y: 5, type: 1 },
        { x: 12, y: 5, type: 2 },
        { x: 17, y: 5, type: 4 },
        { x: 12, y: 2, type: 3, boss: true },
      ];
      map.spawns = [
        { x: 9, y: 12 },
        { x: 11, y: 12 },
      ];
    }
    session.simulation = new Simulation(map, {
      character: options.character,
      nodes: options.nodes,
      gear: { [options.character]: options.gear || [] },
      loadouts: {
        [options.character]: options.loadout || {
          ammo: 'AP',
          melee: options.character === 'Asuka' ? 'blade' : 'spear',
        },
      },
      practice: true,
      participants: options.participants,
      mode: options.mode ?? (options.tutorial ? 'tutorial' : 'magi'),
      missionId: options.missionId,
      seed: options.seed,
      difficulty: options.difficulty,
      roundId: options.roundId,
      phaseId: options.phaseId,
      simulatedAlly: options.simulatedAlly,
    });
    session.simulation.setPracticeOptions({ noCooldown: !!options.noCooldown });
    if (options.tutorial) session.simulation.players[0].hp -= 30;
    session.state = session.simulation;
    session.map = map;
    session.localIndex = 0;
    session.round = options.roundId ?? 'practice';
    session.paused = false;
    session.view = 'practice';
    session.version++;
    clear();
  }
  return {
    prepareAssets,
    setView(view) {
      session.view = view;
      clear();
    },
    setPilot(pilot) {
      session.pilot = pilot;
    },
    setReducedMotion(value) {
      session.reducedMotion = value;
    },
    startPractice,
    applyNetworkState(state, map, index, round) {
      const changed = session.round !== round || session.map?.name !== map.name;
      session.simulation = null;
      session.state = state;
      session.map = map;
      session.localIndex = index;
      session.round = round;
      if (changed) session.version++;
    },
    pausePractice(value) {
      session.paused = value;
      clear();
    },
    resetPractice() {
      session.simulation?.resetPractice({ resetStats: true });
    },
    usePracticeSkill(key) {
      if (!session.simulation || session.paused || session.blurred) return;
      const allowed = [
        'fire',
        'heal',
        'speed',
        'special',
        'ultimate',
        'melee',
        'item',
        'tactical1',
        'tactical2',
        'tactical3',
        'consumable1',
        'consumable2',
      ];
      if (allowed.includes(key)) session.input = { ...session.input, [key]: true };
      if (key.startsWith('part:'))
        session.input = { ...session.input, targetPart: key.slice(5) as InputState['targetPart'] };
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      loader?.destroy();
      for (const waiter of loaderWaiters) waiter.reject(new Error('游戏已关闭。'));
      loaderWaiters.clear();
      clear();
      window.removeEventListener('blur', blur);
      window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', visibility);
      game.destroy(true);
    },
  };
}
