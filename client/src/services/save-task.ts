export type SaveStatus = 'idle' | 'pending' | 'saved' | 'failed';

/** One attempt at a time; a failed write is retried only on an explicit call. */
export class SaveTask {
  status: SaveStatus = 'idle';
  error = '';
  private generation = 0;
  private readonly notify: (status: SaveStatus, error: string) => void;
  constructor(notify: (status: SaveStatus, error: string) => void) {
    this.notify = notify;
  }
  reset(saved = false) {
    this.generation++;
    this.set(saved ? 'saved' : 'idle');
  }
  private set(status: SaveStatus, error = '') {
    this.status = status;
    this.error = error;
    this.notify(status, error);
  }
  async run(save: () => Promise<unknown>): Promise<boolean> {
    if (this.status === 'pending' || this.status === 'saved') return false;
    const generation = this.generation;
    this.set('pending');
    try {
      await save();
      if (generation !== this.generation) return false;
      this.set('saved');
      return true;
    } catch (error) {
      if (generation === this.generation)
        this.set('failed', error instanceof Error ? error.message : '档案同步失败');
      return false;
    }
  }
}
