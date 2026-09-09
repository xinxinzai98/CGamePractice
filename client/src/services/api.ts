import { Progression, type Profile } from '@dawn/simulation';
export interface User {
  username: string;
}
export interface Session {
  user: User | null;
  profile: Profile;
}
export interface Reward {
  itemId: string;
  rarity: 'rare' | 'standard';
  duplicate: boolean;
  coins: number;
  pityTriggered: boolean;
}
export interface ApiResponse extends Session {
  reward?: Reward;
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export async function request(
  action: string,
  body?: Record<string, unknown>,
): Promise<ApiResponse> {
  const response = await fetch(`/api/${action}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error('存档服务未响应，请确认游戏服务器正在运行。');
  }
  if (!object(data)) throw new Error('服务器返回格式错误。');
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : '操作未完成。');
  const user =
    object(data.user) && typeof data.user.username === 'string'
      ? { username: data.user.username }
      : null;
  const result: ApiResponse = { user, profile: Progression.normalizeProfile(data.profile) };
  if (object(data.reward) && typeof data.reward.itemId === 'string')
    result.reward = {
      itemId: data.reward.itemId,
      rarity: data.reward.rarity === 'rare' ? 'rare' : 'standard',
      duplicate: data.reward.duplicate === true,
      coins: Number(data.reward.coins) || 0,
      pityTriggered: data.reward.pityTriggered === true,
    };
  return result;
}
export interface PublicRoom {
  code: string;
  mission: number;
  stage: number;
  difficulty: string;
  playersCount: number;
}
export async function listRooms(): Promise<PublicRoom[]> {
  const response = await fetch('/api/rooms');
  const data: unknown = await response.json();
  if (!response.ok || !object(data) || !Array.isArray(data.rooms))
    throw new Error('暂时无法获取小队列表。');
  return data.rooms
    .filter(object)
    .filter((r) => typeof r.code === 'string')
    .map((r) => ({
      code: String(r.code),
      mission: Number(r.mission) || 0,
      stage: Number(r.stage) || 0,
      difficulty: String(r.difficulty),
      playersCount: Number(r.playersCount) || 1,
    }));
}
