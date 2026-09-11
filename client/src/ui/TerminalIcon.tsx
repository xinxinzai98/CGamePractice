import type { CSSProperties } from 'react';

export const terminalIcons = {
  lobby: 0,
  skills: 1,
  members: 2,
  shop: 3,
  supply: 4,
  records: 5,
  magi: 6,
  fire: 7,
  speed: 8,
  heal: 9,
  barrier: 10,
  melee: 11,
  special: 12,
  resonance: 13,
  energy: 14,
  missile: 15,
} as const;
export type TerminalIconKind = keyof typeof terminalIcons;

/** Decorative atlas art; the consuming button supplies its accessible name. */
export function TerminalIcon({ kind, size = 40 }: { kind: TerminalIconKind; size?: number }) {
  const cell = terminalIcons[kind];
  return (
    <span
      className="terminal-icon"
      aria-hidden="true"
      style={
        {
          width: size,
          height: size,
          backgroundPosition: `${([45, 335, 625, 915][cell % 4] * 100) / 954}% ${([65, 350, 635, 920][Math.floor(cell / 4)] * 100) / 954}%`,
        } as CSSProperties
      }
    />
  );
}
