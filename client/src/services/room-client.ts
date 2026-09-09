import type { Character, GameMap, GameState, InputState } from '@dawn/simulation';
export interface Seat {
  character: Character;
  username?: string;
  connected: boolean;
  ready: boolean;
}
export interface Lobby {
  code: string;
  mission: number;
  stage: number;
  difficulty: 'relaxed' | 'normal' | 'hard';
  map: string;
  slots: (Seat | null)[];
}
export interface StartMessage {
  map: GameMap;
  mission: number;
  stage: number;
  difficulty: string;
  characters: Character[];
  round: string;
}
export interface RoomCallbacks {
  joined: (code: string, slot: number) => void;
  lobby: (lobby: Lobby) => void;
  start: (message: StartMessage) => void;
  state: (state: GameState, paused: boolean, waiting: boolean, rewardsSaved: boolean) => void;
  error: (message: string) => void;
  ended: (message: string) => void;
  latency: (milliseconds: number) => void;
  connection: (status: 'connecting' | 'connected' | 'reconnecting' | 'closed') => void;
  briefing: () => void;
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
export class RoomClient {
  private ws: WebSocket | null = null;
  private token = '';
  private code = '';
  private closed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private pingTimer: ReturnType<typeof setInterval> | undefined;
  private attempts = 0;
  private resuming = false;
  private initial: Record<string, unknown>;
  readonly callbacks: RoomCallbacks;
  constructor(initial: Record<string, unknown>, callbacks: RoomCallbacks) {
    this.initial = initial;
    this.callbacks = callbacks;
    this.connect();
  }
  private connect() {
    if (this.closed) return;
    this.callbacks.connection(this.token ? 'reconnecting' : 'connecting');
    const ws = new WebSocket(
      `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`,
    );
    this.ws = ws;
    ws.onopen = () => {
      if (this.closed) return;
      this.resuming = !!this.token;
      this.send(this.token ? { type: 'resume', code: this.code, token: this.token } : this.initial);
    };
    ws.onmessage = (event) => {
      let data: unknown;
      try {
        data = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (!record(data) || typeof data.type !== 'string') return;
      switch (data.type) {
        case 'joined':
          if (typeof data.code !== 'string' || typeof data.token !== 'string') return;
          this.code = data.code;
          this.token = data.token;
          this.attempts = 0;
          this.resuming = false;
          this.callbacks.connection('connected');
          this.callbacks.joined(this.code, Number(data.slot) || 0);
          break;
        case 'lobby':
          if (!Array.isArray(data.slots)) return;
          this.callbacks.lobby(data as unknown as Lobby);
          break;
        case 'start':
          if (!record(data.map) || typeof data.round !== 'string') return;
          this.callbacks.start(data as unknown as StartMessage);
          break;
        case 'state':
          if (
            !record(data.state) ||
            !Array.isArray(data.state.players) ||
            !Array.isArray(data.state.enemies)
          )
            return;
          this.callbacks.state(
            data.state as unknown as GameState,
            data.paused === true,
            data.waiting === true,
            data.rewardsSaved === true,
          );
          break;
        case 'briefing':
          this.callbacks.briefing();
          break;
        case 'pong':
          this.callbacks.latency(Math.max(0, Date.now() - Number(data.stamp)));
          break;
        case 'error': {
          const message = String(data.message || '房间操作未完成');
          if (!this.token || this.resuming) {
            this.close(false);
            this.callbacks.ended(message);
          } else this.callbacks.error(message);
          break;
        }
        case 'ended':
          this.close(false);
          this.callbacks.ended(String(data.message || '小队已解散'));
          break;
      }
    };
    ws.onerror = () => {};
    ws.onclose = () => {
      if (this.closed) return;
      if (!this.token) {
        this.close(false);
        this.callbacks.ended('无法连接房间服务。');
        return;
      }
      if (++this.attempts > 15) {
        this.close(false);
        this.callbacks.ended('重连超时，请重新组队。');
        return;
      }
      this.callbacks.connection('reconnecting');
      this.reconnectTimer = setTimeout(() => this.connect(), 1200);
    };
    if (!this.pingTimer)
      this.pingTimer = setInterval(() => this.send({ type: 'ping', stamp: Date.now() }), 3000);
  }
  send(message: Record<string, unknown>) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
  }
  input(input: InputState) {
    this.send({ type: 'input', input });
  }
  close(notify = true) {
    if (this.closed) return;
    if (notify) this.send({ type: 'leave' });
    this.closed = true;
    clearInterval(this.pingTimer);
    clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.callbacks.connection('closed');
  }
}
