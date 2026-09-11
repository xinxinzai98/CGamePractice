import { appUrl } from '../app-url';
import { Eva, type EvaProfile, type EvaBattleRecord, type BattleReview } from '@dawn/simulation';
import { ApiError, type User } from './api';

export type EvaAction =
  | 'research'
  | 'upgrade'
  | 'preset'
  | 'purchase'
  | 'draw'
  | 'exchange'
  | 'repair'
  | 'settings'
  | 'redeem';
export interface EvaSession {
  user: User;
  profile: EvaProfile;
  result?: unknown;
}
export interface PendingEvaAction {
  username: string;
  action: EvaAction;
  body: Record<string, unknown>;
  operationId: string;
}
const pendingKey = (username: string) => `dawn.eva.pending.v3:${encodeURIComponent(username)}`;
const actions = new Set<EvaAction>([
  'research',
  'upgrade',
  'preset',
  'purchase',
  'draw',
  'exchange',
  'repair',
  'settings',
  'redeem',
]);
export interface EvaIdentity {
  username: string | null;
  revision: number;
  epoch: number;
}
/** Request responses are scoped to the identity which sent them, then ordered by revision. */
export function acceptsEvaResponse(current: EvaIdentity, request: EvaIdentity, result: EvaSession) {
  return (
    current.epoch === request.epoch &&
    current.username === request.username &&
    result.user.username === current.username &&
    result.user.revision >= current.revision
  );
}
async function decode(response: Response): Promise<Record<string, unknown>> {
  let data: Record<string, unknown>;
  try {
    data = await response.json();
  } catch {
    throw new Error('服务器响应中断，请核实同一笔操作。');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new Error('服务器档案响应无效，原操作仍保留。');
  if (!response.ok)
    throw new ApiError(typeof data.error === 'string' ? data.error : '操作未完成', response.status);
  return data;
}
function parse(data: Record<string, unknown>): EvaSession {
  const user = data.user as User;
  if (
    !user ||
    typeof user.username !== 'string' ||
    !user.username ||
    !Number.isSafeInteger(user.revision) ||
    user.revision < 0
  )
    throw new Error('档案连接已失效，请重新登录。');
  return { user, profile: Eva.parseProfile(data.profile), result: data.result };
}
export async function fetchEva(): Promise<EvaSession> {
  return parse(
    await decode(
      await fetch(appUrl('/api/eva'), {
        credentials: 'same-origin',
        headers: { 'x-dawn-protocol': '3' },
      }),
    ),
  );
}
export function pendingEva(username: string): PendingEvaAction | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(pendingKey(username)) ?? 'null');
    if (value === null) return null;
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      value.username !== username ||
      !actions.has(value.action) ||
      typeof value.operationId !== 'string' ||
      !/^[A-Za-z0-9_-]{8,128}$/.test(value.operationId) ||
      !value.body ||
      typeof value.body !== 'object' ||
      Array.isArray(value.body)
    )
      throw new Error('记录字段无效');
    return value;
  } catch {
    throw new Error(
      '待核实 EVA 操作缓存损坏，已暂停新操作；原始记录保留，请检查此设备的交易缓存。',
    );
  }
}
export function evaPendingState(username: string | null): {
  operation: PendingEvaAction | null;
  error: string;
} {
  if (!username) return { operation: null, error: '' };
  try {
    return { operation: pendingEva(username), error: '' };
  } catch (error) {
    return { operation: null, error: error instanceof Error ? error.message : '交易缓存不可读' };
  }
}
export async function mutateEva(
  username: string,
  revision: number,
  action: EvaAction,
  body: Record<string, unknown> = {},
  retry?: PendingEvaAction,
): Promise<EvaSession> {
  const existing = pendingEva(username);
  if (existing && !retry) throw new Error('上次操作的结果尚待核实，请先点击“核实待处理操作”。');
  if (
    retry &&
    (!existing ||
      retry.username !== username ||
      retry.operationId !== existing.operationId ||
      retry.action !== existing.action ||
      JSON.stringify(retry.body) !== JSON.stringify(existing.body))
  )
    throw new Error('待核实操作与当前账号的原始记录不匹配。');
  const operation = retry ?? {
    username,
    action,
    body: { ...body, revision },
    operationId: crypto.randomUUID(),
  };
  sessionStorage.setItem(pendingKey(username), JSON.stringify(operation));
  try {
    const response = await fetch(appUrl(`/api/eva/${operation.action}`), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'x-dawn-protocol': '3' },
      body: JSON.stringify({ ...operation.body, operationId: operation.operationId }),
    });
    const data = await decode(response);
    const session = parse(data);
    if (session.user.username !== username) throw new Error('响应账号已变化，原操作保留待核实。');
    sessionStorage.removeItem(pendingKey(username));
    return session;
  } catch (error) {
    // A definite application rejection did not leave an ambiguous transaction.
    if (error instanceof ApiError && error.status >= 400 && error.status < 500)
      sessionStorage.removeItem(pendingKey(username));
    throw error;
  }
}
export async function fetchEvaReview(
  round: string,
): Promise<{ record: EvaBattleRecord; review: BattleReview }> {
  const data = await decode(
    await fetch(appUrl(`/api/eva/review?round=${encodeURIComponent(round)}`), {
      credentials: 'same-origin',
    }),
  );
  return data.result as { record: EvaBattleRecord; review: BattleReview };
}
export interface EvaLedgerEntry {
  operation_id: string;
  kind: string;
  revision: number;
  at: string | number;
  delta: { eva?: { wallet?: Partial<EvaProfile['wallet']>; stock?: Record<string, number> } };
  balance: {
    before?: { eva?: { wallet?: EvaProfile['wallet'] } };
    after?: { eva?: { wallet?: EvaProfile['wallet'] } };
  };
}
export async function fetchEvaLedger(): Promise<EvaLedgerEntry[]> {
  const data = await decode(
    await fetch(appUrl('/api/eva/ledger'), {
      credentials: 'same-origin',
      headers: { 'x-dawn-protocol': '3' },
    }),
  );
  if (!Array.isArray(data.operations)) throw new Error('服务器缺少交易流水。');
  return data.operations.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object') throw new Error('交易流水格式无效。');
    const row = entry as EvaLedgerEntry;
    if (
      typeof row.operation_id !== 'string' ||
      typeof row.kind !== 'string' ||
      !Number.isSafeInteger(row.revision) ||
      !row.balance ||
      !row.delta
    )
      throw new Error('交易流水字段无效。');
    return row;
  });
}
