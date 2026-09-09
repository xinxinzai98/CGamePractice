import Phaser from 'phaser';
export const images = [
  'cover-dawn',
  'hangar-dawn',
  'enemy-stalker',
  'enemy-artillery',
  'enemy-support',
  'boss-core',
  'terrain-ash',
  'terrain-coolant',
  'terrain-bridge',
  'dawn-courtyard',
  'dawn-barricade',
  'map_1_18',
  'map_1_01',
  'map_1_14',
  'map_1_54',
];
export function loadAssets(scene: Phaser.Scene) {
  for (const key of images) scene.load.image(key, `/assets/${key}.png`);
  for (const pilot of ['asuka', 'rei'])
    scene.load.spritesheet(`combat-${pilot}`, `/assets/combat-${pilot}.png`, {
      frameWidth: 627,
      frameHeight: 627,
    });
  for (const pilot of ['Asuka', 'Rei'])
    for (const dir of ['W', 'S', 'A']) {
      const key = `TankPlayer${pilot}_M${dir}`;
      scene.load.spritesheet(key, `/assets/${key}.png`, { frameWidth: 60, frameHeight: 60 });
    }
  for (const kind of [1, 2, 3])
    for (const dir of ['W', 'S', 'A']) {
      const key = `TankEnemy_M${dir}_${kind}`;
      scene.load.spritesheet(key, `/assets/${key}.png`, { frameWidth: 60, frameHeight: 60 });
    }
}
export function createAnimations(scene: Phaser.Scene) {
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
