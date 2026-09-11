import { ASSET_PACKS, type AssetDefinition, type AssetPack } from './asset-manifest';

export interface AssetDriver {
  load(
    assets: readonly AssetDefinition[],
    loaded: (key: string) => void,
    signal: AbortSignal,
  ): Promise<void>;
}

export class AssetLoader {
  private loaded = new Set<string>();
  private pending = new Map<AssetPack, Promise<void>>();
  private queue: Promise<void> = Promise.resolve();
  private abort = new AbortController();
  private driver: AssetDriver;
  private progress: (value: number, pack: AssetPack) => void;

  constructor(driver: AssetDriver, progress: (value: number, pack: AssetPack) => void) {
    this.driver = driver;
    this.progress = progress;
  }

  isReady(pack: AssetPack) {
    return ASSET_PACKS[pack].every((asset) => this.loaded.has(asset.key));
  }

  prepare(pack: AssetPack): Promise<void> {
    const active = this.pending.get(pack);
    if (active) return active;
    const task = this.queue.then(async () => {
      this.abort.signal.throwIfAborted();
      const assets = ASSET_PACKS[pack];
      const report = () =>
        this.progress(
          assets.filter((asset) => this.loaded.has(asset.key)).length / assets.length,
          pack,
        );
      report();
      const missing = assets.filter((asset) => !this.loaded.has(asset.key));
      if (missing.length) {
        await this.driver.load(
          missing,
          (key) => {
            this.loaded.add(key);
            report();
          },
          this.abort.signal,
        );
      }
      this.abort.signal.throwIfAborted();
      if (!this.isReady(pack)) throw new Error('必需素材尚未全部载入，请重试。');
    });
    this.pending.set(pack, task);
    // A failed pack must not poison the queue or the next explicit retry.
    this.queue = task.then(
      () => {
        this.pending.delete(pack);
      },
      () => {
        this.pending.delete(pack);
      },
    );
    return task;
  }

  destroy() {
    this.abort.abort(new Error('素材加载已取消。'));
  }
}
