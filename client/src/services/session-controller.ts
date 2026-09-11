import {
  ApiError,
  type ApiAction,
  type ApiClient,
  type ApiResults,
  type RequestBody,
  type Session,
} from './api';

const identityActions = new Set<ApiAction>(['login', 'register', 'logout', 'password']);
const economicActions = new Set<ApiAction>(['shop', 'draw', 'tutorial']);
export class SupersededSessionError extends Error {
  constructor() {
    super('档案连接已切换，请在当前档案中重试。');
    this.name = 'SupersededSessionError';
  }
}
export interface PendingOperation {
  action: ApiAction;
  body: RequestBody;
  operationId: string;
}
export interface PendingState {
  records: PendingOperation[];
  error: string;
}
type OperationStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Orders mutations and accepts only responses belonging to the current identity and revision. */
export class SessionController {
  private epoch = 0;
  private tail: Promise<unknown> = Promise.resolve();
  private value: Session | null = null;
  private readonly client: ApiClient;
  private readonly onChange: (session: Session) => void;
  private readonly storage: OperationStorage;
  private readonly onPendingChange: () => void;
  private readonly newId: () => string;
  constructor(
    client: ApiClient,
    onChange: (session: Session) => void,
    storage: OperationStorage,
    onPendingChange: () => void = () => {},
    newId: () => string = () => crypto.randomUUID(),
  ) {
    this.client = client;
    this.onChange = onChange;
    this.storage = storage;
    this.onPendingChange = onPendingChange;
    this.newId = newId;
  }
  get identityEpoch() {
    return this.epoch;
  }
  get snapshot() {
    return this.value;
  }
  private key() {
    return `dawn.pending-operations:${this.value?.user?.username ?? ''}`;
  }
  pendingState(): PendingState {
    if (!this.value?.user) return { records: [], error: '' };
    try {
      const value: unknown = JSON.parse(this.storage.getItem(this.key()) ?? '[]');
      if (!Array.isArray(value)) throw new Error('记录不是列表');
      const ids = new Set<string>();
      for (const entry of value) {
        if (
          entry === null ||
          typeof entry !== 'object' ||
          Array.isArray(entry) ||
          !economicActions.has(entry.action) ||
          typeof entry.operationId !== 'string' ||
          !/^[A-Za-z0-9_-]{8,128}$/.test(entry.operationId) ||
          ids.has(entry.operationId) ||
          entry.body === null ||
          typeof entry.body !== 'object' ||
          Array.isArray(entry.body)
        )
          throw new Error('交易字段无效');
        ids.add(entry.operationId);
        const keys = Object.keys(entry.body);
        if (
          (entry.action === 'draw' && keys.length !== 0) ||
          (entry.action === 'shop' &&
            (keys.length !== 1 || typeof entry.body.itemId !== 'string')) ||
          (entry.action === 'tutorial' && (keys.length !== 1 || entry.body.complete !== true))
        )
          throw new Error('交易内容无效');
      }
      return { records: value as PendingOperation[], error: '' };
    } catch (error) {
      return {
        records: [],
        error: `待核实交易缓存无法读取：${error instanceof Error ? error.message : '未知错误'}。经济操作已暂停，原始记录仍保留，请检查此设备的交易缓存。`,
      };
    }
  }
  pending(): PendingOperation[] {
    const state = this.pendingState();
    if (state.error) throw new Error(state.error);
    return state.records;
  }
  private persist(pending: PendingOperation[]) {
    if (pending.length) this.storage.setItem(this.key(), JSON.stringify(pending));
    else this.storage.removeItem(this.key());
    this.onPendingChange();
  }
  private apply(result: Session, epoch: number) {
    if (epoch !== this.epoch) throw new SupersededSessionError();
    const previous = this.value?.user;
    if (
      previous &&
      result.user?.username === previous.username &&
      result.user.revision < previous.revision
    )
      return;
    this.value = result;
    this.onChange(result);
  }
  run = <A extends ApiAction>(action: A, body: RequestBody = {}): Promise<ApiResults[A]> => {
    const isIdentity = identityActions.has(action);
    const epoch = isIdentity ? ++this.epoch : this.epoch;
    const execute = async (): Promise<ApiResults[A]> => {
      if (epoch !== this.epoch) throw new SupersededSessionError();
      let operation: PendingOperation | undefined;
      if (economicActions.has(action)) {
        if (!this.value?.user) throw new Error('请先连接驾驶员档案。');
        const fingerprint = JSON.stringify(
          Object.entries(body)
            .filter(([key]) => key !== 'operationId')
            .sort(),
        );
        operation = this.pending().find(
          (entry) =>
            entry.action === action &&
            JSON.stringify(Object.entries(entry.body).sort()) === fingerprint,
        );
        if (!operation) {
          const operationBody = Object.fromEntries(
            Object.entries(body).filter(([key]) => key !== 'operationId'),
          );
          operation = { action, body: operationBody, operationId: this.newId() };
          this.persist([...this.pending(), operation]);
        }
      }
      try {
        const result = await this.client(
          action,
          operation ? { ...operation.body, operationId: operation.operationId } : body,
        );
        this.apply(result, epoch);
        if (operation)
          this.persist(
            this.pending().filter((entry) => entry.operationId !== operation.operationId),
          );
        return result;
      } catch (error) {
        // Only a definitive client rejection proves that the transaction did not succeed.
        if (
          operation &&
          epoch === this.epoch &&
          error instanceof ApiError &&
          error.status >= 400 &&
          error.status < 500
        )
          this.persist(
            this.pending().filter((entry) => entry.operationId !== operation.operationId),
          );
        throw error;
      }
    };
    if (action === 'me') return this.tail.then(execute, execute);
    const result = this.tail.then(execute, execute);
    this.tail = result.catch(() => {});
    return result;
  };
}
