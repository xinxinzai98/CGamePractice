import type { GameState, GameMap, InputState, Loadout } from '@dawn/simulation';
export type Pilot = 'Asuka' | 'Rei';
export type GameView = 'cover' | 'lobby' | 'briefing' | 'battle' | 'practice';
export interface PracticeOptions {
  character: Pilot;
  nodes?: string[];
  gear?: string[];
  loadout?: Loadout;
  noCooldown?: boolean;
  tutorial?: boolean;
}
export interface GameCallbacks {
  onReady?(): void;
  onPauseRequest?(): void;
  onProgress?(value: number): void;
  onSnapshot?(snapshot: GameState): void;
  onInput?(input: InputState): void;
  onError?(message: string): void;
}
export interface GameRuntime {
  setView(view: GameView): void;
  setPilot(pilot: Pilot): void;
  setReducedMotion(value: boolean): void;
  startPractice(options: PracticeOptions): void;
  applyNetworkState(state: GameState, map: GameMap, localPlayerIndex: number, round: string): void;
  pausePractice(value: boolean): void;
  resetPractice(): void;
  usePracticeSkill(key: string): void;
  destroy(): void;
}
