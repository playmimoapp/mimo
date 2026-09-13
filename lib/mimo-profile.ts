export const MIMO_PROFILES = [
  { id: 'hype', label: 'Hype', description: 'Big energy', tone: 'blue' },
  { id: 'cool', label: 'Cool', description: 'Calm focus', tone: 'navy' },
  { id: 'clever', label: 'Thinker', description: 'Curious mind', tone: 'gold' },
  { id: 'bold', label: 'Captain', description: 'Ready to lead', tone: 'coral' },
] as const;

export type MimoProfileStyle = (typeof MIMO_PROFILES)[number]['id'];

export function isMimoProfileStyle(value: unknown): value is MimoProfileStyle {
  return MIMO_PROFILES.some((profile) => profile.id === value);
}
