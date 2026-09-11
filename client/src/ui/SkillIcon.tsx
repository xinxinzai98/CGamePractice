import { TerminalIcon, type TerminalIconKind } from './TerminalIcon';
export type IconKind =
  'fire' | 'heal' | 'speed' | 'special' | 'ultimate' | 'blink' | 'missile' | 'melee' | 'item';
const icons: Record<IconKind, TerminalIconKind> = {
  fire: 'fire',
  heal: 'heal',
  speed: 'speed',
  special: 'special',
  ultimate: 'barrier',
  blink: 'resonance',
  missile: 'missile',
  melee: 'melee',
  item: 'energy',
};
export function SkillIcon({ kind, size = 48 }: { kind: IconKind; size?: number }) {
  return <TerminalIcon kind={icons[kind]} size={size} />;
}
