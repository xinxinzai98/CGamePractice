export type AssetPack = 'cover' | 'hangar' | 'battle-legacy' | 'battle-new';
export interface AssetDefinition {
  key: string;
  file: string;
  frame?: { width: number; height: number };
}
const image = (key: string): AssetDefinition => ({ key, file: `${key}.png` });
const sheet = (key: string, size: number): AssetDefinition => ({
  ...image(key),
  frame: { width: size, height: size },
});
const combat = ['asuka', 'rei'].map((pilot) => sheet(`combat-${pilot}`, 627));
const sharedTerrain = ['dawn-barricade', 'dawn-courtyard'].map(image);
const legacyActors = [
  ...['Asuka', 'Rei'].flatMap((pilot) =>
    ['W', 'S', 'A'].map((dir) => sheet(`TankPlayer${pilot}_M${dir}`, 60)),
  ),
  ...[1, 2, 3].flatMap((kind) =>
    ['W', 'S', 'A'].map((dir) => sheet(`TankEnemy_M${dir}_${kind}`, 60)),
  ),
];

// Only the cover is required before the first screen. The lobby owns the images
// used by its DOM cards as well as the Phaser backdrop; battles load on entry.
export const ASSET_PACKS: Record<AssetPack, readonly AssetDefinition[]> = {
  cover: [image('cover-dawn')],
  hangar: [
    ...['hangar-dawn', 'pilot-asuka', 'pilot-rei', 'mecha-asuka', 'mecha-rei', 'skill-icons'].map(
      image,
    ),
    ...combat,
  ],
  'battle-legacy': [
    ...sharedTerrain,
    ...['map_1_18', 'map_1_01', 'map_1_14', 'map_1_54'].map(image),
    ...legacyActors,
    image('skill-icons'),
  ],
  'battle-new': [
    ...sharedTerrain,
    ...combat,
    ...[
      'enemy-stalker',
      'enemy-artillery',
      'enemy-support',
      'boss-core',
      'terrain-ash',
      'terrain-coolant',
      'terrain-bridge',
      'skill-icons',
    ].map(image),
  ],
};

// Gallery-only images are copied for their DOM consumers, without joining the
// startup download. Vite handles the portrait script imported with ?url itself.
export const ASSET_FILES = [
  ...new Set([
    ...Object.values(ASSET_PACKS)
      .flat()
      .map((asset) => asset.file),
    'Hello.png',
  ]),
];
