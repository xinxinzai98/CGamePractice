import type { CSSProperties } from 'react';
export type IconKind =
  'fire' | 'heal' | 'speed' | 'special' | 'ultimate' | 'blink' | 'missile' | 'melee' | 'item';
const cells: Record<IconKind, [number, number]> = {
  fire: [0, 0],
  heal: [1, 0],
  speed: [2, 0],
  special: [0, 1],
  ultimate: [1, 1],
  blink: [2, 1],
  missile: [0, 2],
  melee: [1, 2],
  item: [2, 2],
};
export function SkillIcon({ kind, size = 48 }: { kind: IconKind; size?: number }) {
  const [x, y] = cells[kind];
  return (
    <span
      className="skill-icon"
      aria-hidden="true"
      style={
        {
          width: size,
          height: size,
          backgroundImage: 'url(/assets/skill-icons.png)',
          backgroundSize: '300% 300%',
          backgroundPosition: `${x * 50}% ${y * 50}%`,
        } as CSSProperties
      }
    />
  );
}
