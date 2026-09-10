import { ProtocolError, type InputState } from '@dawn/simulation';
import {
  parseRoomMessage,
  type Lobby,
  type StartMessage,
  type NetworkState,
} from './room-protocol';
export type { Seat, Lobby, StartMessage } from './room-protocol';
export interface RoomCallbacks {
  joined: (code: string, slot: number) => void;
  lobby: (lobby: Lobby) => void;
  start: (message: StartMessage) => void;
  state: (state: NetworkState, paused: boolean, waiting: boolean, rewardsSaved: boolean) => void;
  error: (message: string) => void;
  ended: (message: string) => void;
  latency: (milliseconds: number) => void;
  connection: (status: 'connecting' | 'connected' | 'reconnecting' | 'closed') => void;
  briefing: () => void;
  events?: (events: string[]) => void;
}
type CommandKey = 'fire' | 'heal' | 'speed' | 'special' | 'ultimate' | 'melee' | 'item' | 'ammo';
type InputCommand = { seq: number; key: CommandKey; value?: InputState['ammo'] };
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
  private round = '';
  private commandSeq = 0;
  private commands: InputCommand[] = [];
  private held: InputState = {};
  private lastInput: InputState = {};
  private eventSeq = 0;
  private joinedCommandSeq = 0;
  readonly callbacks: RoomCallbacks;
  constructor(initial: Record<string, unknown>, callbacks: RoomCallbacks) {
    this.initial = initial;
    if (initial.type === 'resume') {
      this.code = String(initial.code);
      this.token = String(initial.token);
    }
    this.callbacks = callbacks;
    this.connect();
  }
  static resume(room: { code: string; token: string }, callbacks: RoomCallbacks) {
    return new RoomClient({ type: 'resume', ...room }, callbacks);
  }
  private connect() {
    if (this.closed) return;
    this.callbacks.connection(this.token ? 'reconnecting' : 'connecting');
    const ws = new WebSocket(
      `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`,
    );
    this.ws = ws;
    ws.onopen = () => {
      if (this.closed || this.ws !== ws) return;
      this.resuming = !!this.token;
      this.send(this.token ? { type: 'resume', code: this.code, token: this.token } : this.initial);
    };
    ws.onmessage = (event) => {
      if (this.closed || this.ws !== ws) return;
      let data: ReturnType<typeof parseRoomMessage>;
      try {
        data = parseRoomMessage(event.data);
      } catch (error) {
        if (!(error instanceof ProtocolError)) throw error;
        this.close(false);
        this.callbacks.ended(error.message);
        return;
      }
      if (data === null) return;
      switch (data.type) {
        case 'joined':
          this.code = data.code;
          this.token = data.token;
          this.joinedCommandSeq = data.commandSeq;
          this.commandSeq = Math.max(this.commandSeq, data.commandSeq);
          this.attempts = 0;
          this.resuming = false;
          this.callbacks.connection('connected');
          this.callbacks.joined(this.code, data.slot);
          break;
        case 'lobby':
          this.callbacks.lobby(data);
          break;
        case 'start':
          if (this.round !== data.round) {
            this.round = data.round;
            this.commandSeq = this.joinedCommandSeq;
            this.commands = [];
            this.eventSeq = 0;
            this.held = {};
            this.lastInput = {};
          }
          this.joinedCommandSeq = 0;
          this.callbacks.start(data);
          break;
        case 'state':
          this.callbacks.state(data.state, data.paused, data.waiting, data.rewardsSaved);
          break;
        case 'input-ack':
          if (data.round === this.round)
            this.commands = this.commands.filter((command) => command.seq > data.seq);
          break;
        case 'events':
          if (data.round === this.round) {
            const fresh = data.events.filter((event) => event.seq > this.eventSeq);
            if (fresh.length) {
              this.eventSeq = Math.max(...fresh.map((event) => event.seq));
              this.callbacks.events?.(fresh.map((event) => event.name));
            }
          }
          break;
        case 'briefing':
          this.round = '';
          this.commands = [];
          this.commandSeq = 0;
          this.joinedCommandSeq = 0;
          this.callbacks.briefing();
          break;
        case 'pong':
          this.callbacks.latency(Math.max(0, Date.now() - data.stamp));
          break;
        case 'error': {
          const message = data.message;
          if (!this.token || this.resuming) {
            this.close(false);
            this.callbacks.ended(message);
          } else this.callbacks.error(message);
          break;
        }
        case 'ended':
          this.close(false);
          this.callbacks.ended(data.message);
          break;
      }
    };
    ws.onerror = () => {};
    ws.onclose = () => {
      if (this.closed || this.ws !== ws) return;
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
    if (!this.round || this.closed) return;
    for (const key of ['fire', 'heal', 'speed', 'special', 'ultimate', 'melee', 'item'] as const)
      if (input[key] === true && this.lastInput[key] !== true)
        this.commands.push({ seq: ++this.commandSeq, key });
    if (input.ammo && input.ammo !== this.lastInput.ammo)
      this.commands.push({ seq: ++this.commandSeq, key: 'ammo', value: input.ammo });
    this.lastInput = { ...input };
    this.held = { dir: input.dir ?? -1, fire: input.fire === true };
    this.send({
      type: 'input',
      round: this.round,
      input: this.held,
      commands: this.commands.slice(0, 64),
    });
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
