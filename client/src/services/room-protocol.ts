import {
  ProtocolError,
  ValidationError,
  validateMap,
  type Character,
  type GameMap,
  type GameState,
} from '@dawn/simulation';

export interface Seat {
  character: Character;
  username: string | null;
  connected: boolean;
  ready: boolean;
}
export interface Lobby {
  code: string;
  mission: number;
  stage: number;
  difficulty: 'relaxed' | 'normal' | 'hard';
  map: string;
  unlocked: number;
  slots: (Seat | null)[];
}
export interface StartMessage {
  map: GameMap;
  mission: number;
  stage: number;
  difficulty: Lobby['difficulty'];
  characters: Character[];
  round: string;
}
export type NetworkState = Omit<GameState, 'map' | 'practice'>;
export type RoomMessage =
  | { type: 'joined'; code: string; token: string; slot: number; commandSeq: number }
  | ({ type: 'lobby' } & Lobby)
  | ({ type: 'start' } & StartMessage)
  | { type: 'state'; state: NetworkState; paused: boolean; waiting: boolean; rewardsSaved: boolean }
  | { type: 'events'; round: string; events: { seq: number; name: string }[] }
  | { type: 'input-ack'; round: string; seq: number }
  | { type: 'briefing' }
  | { type: 'pong'; stamp: number }
  | { type: 'error' | 'ended'; message: string };

function invalid(field: string): never {
  throw new ProtocolError(`房间服务返回格式错误：${field}。请重新加入小队。`);
}
function object(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return invalid(field);
  return value as Record<string, unknown>;
}
function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) return invalid(field);
  return value;
}
function number(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return invalid(field);
  return value;
}
function index(value: unknown, maximum: number, field: string): number {
  const result = number(value, field);
  if (!Number.isInteger(result) || result < 0 || result > maximum) return invalid(field);
  return result;
}
function bool(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') return invalid(field);
  return value;
}
function character(value: unknown): Character {
  if (value !== 'Asuka' && value !== 'Rei') return invalid('character');
  return value;
}
function difficulty(value: unknown): Lobby['difficulty'] {
  if (value !== 'relaxed' && value !== 'normal' && value !== 'hard') return invalid('difficulty');
  return value;
}
function seat(value: unknown): Seat | null {
  if (value === null) return null;
  const data = object(value, 'seat');
  return {
    character: character(data.character),
    username: data.username === null ? null : text(data.username, 'username'),
    connected: bool(data.connected, 'connected'),
    ready: bool(data.ready, 'ready'),
  };
}
function state(value: unknown): NetworkState {
  const data = object(value, 'state');
  number(data.time, 'state.time');
  number(data.score, 'state.score');
  number(data.kills, 'state.kills');
  if (
    data.status !== 'playing' &&
    data.status !== 'paused' &&
    data.status !== 'won' &&
    data.status !== 'lost'
  )
    invalid('state.status');
  // Snapshot collections originate in the shared simulation. Check their transport
  // envelope here; do not revalidate map topology or rebuild actors every frame.
  for (const key of ['players', 'enemies', 'bullets', 'effects']) {
    const collection = data[key];
    if (!Array.isArray(collection)) invalid(`state.${key}`);
    for (const item of collection) object(item, `state.${key}[]`);
  }
  if (!Array.isArray(data.events) || !data.events.every((event) => typeof event === 'string'))
    invalid('state.events');
  if (data.cooperation !== null) object(data.cooperation, 'state.cooperation');
  return data as unknown as NetworkState;
}

/** Parse once at the socket boundary. Unknown extension types are intentionally ignored. */
export function parseRoomMessage(raw: string): RoomMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    if (error instanceof SyntaxError) return invalid('JSON');
    throw error;
  }
  const data = object(value, 'message');
  const type = text(data.type, 'type');
  switch (type) {
    case 'joined':
      return {
        type,
        code: text(data.code, 'code'),
        token: text(data.token, 'token'),
        slot: index(data.slot, 1, 'slot'),
        commandSeq: index(data.commandSeq, Number.MAX_SAFE_INTEGER, 'commandSeq'),
      };
    case 'lobby':
      if (!Array.isArray(data.slots) || data.slots.length !== 2) return invalid('slots');
      return {
        type,
        code: text(data.code, 'code'),
        mission: index(data.mission, 3, 'mission'),
        stage: index(data.stage, 2, 'stage'),
        difficulty: difficulty(data.difficulty),
        map: text(data.map, 'map'),
        unlocked: index(data.unlocked, 12, 'unlocked') || invalid('unlocked'),
        slots: data.slots.map(seat),
      };
    case 'start': {
      if (!Array.isArray(data.characters) || data.characters.length !== 2)
        return invalid('characters');
      let map: GameMap;
      try {
        map = validateMap(data.map);
      } catch (error) {
        if (error instanceof ValidationError) return invalid('map');
        throw error;
      }
      return {
        type,
        map,
        mission: index(data.mission, 3, 'mission'),
        stage: index(data.stage, 2, 'stage'),
        difficulty: difficulty(data.difficulty),
        characters: data.characters.map(character),
        round: text(data.round, 'round'),
      };
    }
    case 'state':
      return {
        type,
        state: state(data.state),
        paused: bool(data.paused, 'paused'),
        waiting: bool(data.waiting, 'waiting'),
        rewardsSaved: bool(data.rewardsSaved, 'rewardsSaved'),
      };
    case 'input-ack':
      return {
        type,
        round: text(data.round, 'round'),
        seq: index(data.seq, Number.MAX_SAFE_INTEGER, 'seq'),
      };
    case 'events':
      if (!Array.isArray(data.events) || data.events.length > 256) return invalid('events');
      return {
        type,
        round: text(data.round, 'round'),
        events: data.events.map((item) => {
          const event = object(item, 'event');
          return {
            seq: index(event.seq, Number.MAX_SAFE_INTEGER, 'event.seq'),
            name: text(event.name, 'event.name'),
          };
        }),
      };
    case 'briefing':
      return { type };
    case 'pong':
      return { type, stamp: number(data.stamp, 'stamp') };
    case 'error':
    case 'ended':
      return { type, message: text(data.message, 'message') };
    default:
      return null;
  }
}
