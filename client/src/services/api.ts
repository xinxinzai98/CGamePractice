import { Progression, ProtocolError, type Profile, type DrawReward } from '@dawn/simulation';
export interface User {
  username: string;
}
export interface Session {
  user: User | null;
  profile: Profile;
}
export type Reward = DrawReward;
export interface DrawResponse extends Session {
  reward: Reward;
}
export type SessionAction =
  | 'me'
  | 'register'
  | 'login'
  | 'logout'
  | 'build'
  | 'shop'
  | 'equip'
  | 'loadout'
  | 'appearance'
  | 'tutorial';
export type ApiResults = Record<SessionAction, Session> & { draw: DrawResponse };
export type ApiAction = keyof ApiResults;
export type ApiResponse = ApiResults[ApiAction];
export type RequestBody = Record<string, unknown>;
export type ApiClient = <A extends ApiAction>(
  action: A,
  body?: RequestBody,
) => Promise<ApiResults[A]>;

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ProtocolError('服务器响应必须是对象');
  }
  return value as Record<string, unknown>;
}
async function responseData(response: Response): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new ProtocolError(`服务器响应不是有效 JSON（HTTP ${response.status}）`);
  }
  const data = object(value);
  if (!response.ok)
    throw new Error(
      typeof data.error === 'string' ? data.error : `请求失败（HTTP ${response.status}）`,
    );
  return data;
}
function session(data: Record<string, unknown>): Session {
  if (data.user === null) return { user: null, profile: Progression.createProfile() };
  const user = object(data.user);
  if (typeof user.username !== 'string' || user.username.length === 0) {
    throw new ProtocolError('会话缺少有效的驾驶员代号');
  }
  return { user: { username: user.username }, profile: Progression.parseProfile(data.profile) };
}
export function request<A extends ApiAction>(action: A, body?: RequestBody): Promise<ApiResults[A]>;
export async function request(action: ApiAction, body?: RequestBody): Promise<ApiResponse> {
  const response = await fetch(
    `/api/${action}`,
    action === 'me'
      ? { credentials: 'same-origin' }
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body ?? {}),
          credentials: 'same-origin',
        },
  );
  const data = await responseData(response);
  if (data.user === null && action !== 'me' && action !== 'logout') {
    throw new ProtocolError('已登录接口缺少驾驶员档案');
  }
  const result = session(data);
  return action === 'draw'
    ? { ...result, reward: Progression.parseDrawReward(data.reward) }
    : result;
}
export interface PublicRoom {
  code: string;
  mission: number;
  stage: number;
  difficulty: 'relaxed' | 'normal' | 'hard';
  playersCount: number;
}
function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new ProtocolError('小队列表含有无效的任务或人数');
  }
  return value;
}
export async function listRooms(): Promise<PublicRoom[]> {
  const data = await responseData(await fetch('/api/rooms'));
  if (!Array.isArray(data.rooms)) throw new ProtocolError('服务器缺少小队列表');
  return data.rooms.map((entry: unknown) => {
    const row = object(entry);
    const code = row.code,
      difficulty = row.difficulty;
    if (typeof code !== 'string' || !/^[A-F0-9]{6}$/.test(code))
      throw new ProtocolError('小队房间码无效');
    if (difficulty !== 'relaxed' && difficulty !== 'normal' && difficulty !== 'hard')
      throw new ProtocolError('小队难度无效');
    return {
      code,
      mission: integer(row.mission, 0, 3),
      stage: integer(row.stage, 0, 2),
      difficulty,
      playersCount: integer(row.playersCount, 1, 2),
    };
  });
}
