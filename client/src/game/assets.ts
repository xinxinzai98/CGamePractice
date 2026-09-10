import Phaser from 'phaser';
import { AssetLoader } from './asset-loader';
import type { AssetPack } from './asset-manifest';

export function createAssetLoader(
  scene: Phaser.Scene,
  progress: (value: number, pack: AssetPack) => void,
) {
  return new AssetLoader(
    {
      load: (assets, loaded, signal) =>
        new Promise<void>((resolve, reject) => {
          const failures: string[] = [];
          const keys = new Set(assets.map((asset) => asset.key));
          const cleanup = () => {
            scene.load.off('filecomplete', onFile);
            scene.load.off('loaderror', onError);
            scene.load.off('complete', onComplete);
            signal.removeEventListener('abort', onAbort);
          };
          const onFile = (key: string) => {
            if (keys.has(key)) loaded(key);
          };
          const onError = (file: Phaser.Loader.File) => {
            if (keys.has(file.key)) failures.push(file.key);
          };
          const onComplete = () => {
            cleanup();
            if (failures.length)
              reject(new Error(`素材加载失败：${failures.join('、')}。请重试。`));
            else {
              createAnimations(scene);
              resolve();
            }
          };
          const onAbort = () => {
            cleanup();
            scene.load.reset();
            reject(signal.reason);
          };
          scene.load.on('filecomplete', onFile);
          scene.load.on('loaderror', onError);
          scene.load.once('complete', onComplete);
          signal.addEventListener('abort', onAbort, { once: true });
          for (const asset of assets) {
            const url = `/assets/${asset.file}`;
            if (asset.frame)
              scene.load.spritesheet(asset.key, url, {
                frameWidth: asset.frame.width,
                frameHeight: asset.frame.height,
              });
            else scene.load.image(asset.key, url);
          }
          scene.load.start();
        }),
    },
    progress,
  );
}

function createAnimations(scene: Phaser.Scene) {
  for (const key of scene.textures.getTextureKeys().filter((k) => k.startsWith('Tank'))) {
    const count = scene.textures.get(key).frameTotal - 1;
    if (count > 0 && !scene.anims.exists(key))
      scene.anims.create({
        key,
        frames: scene.anims.generateFrameNumbers(key, { start: 0, end: count - 1 }),
        frameRate: 8,
        repeat: -1,
      });
  }
}
