export const MIMO_PROFILES = [
  { id: 'hype', label: 'Hype', symbol: '⚡', tone: 'blue' },
  { id: 'cool', label: 'Cool', symbol: '✦', tone: 'navy' },
  { id: 'clever', label: 'Clever', symbol: '◎', tone: 'gold' },
  { id: 'bold', label: 'Bold', symbol: '●', tone: 'coral' },
] as const;

export type MimoProfileStyle = (typeof MIMO_PROFILES)[number]['id'];

export function isMimoProfileStyle(value: unknown): value is MimoProfileStyle {
  return MIMO_PROFILES.some((profile) => profile.id === value);
}
