/**
 * Shared design tokens — mirrors the web frontend's Tailwind theme
 * (night.start / night.end / amber.glow) so the app feels like the same product.
 */
export const colors = {
  nightStart: '#0B1530',
  nightEnd: '#16213E',
  amber: '#FFB347',
  amberDim: 'rgba(255,179,71,0.12)',
  amberBorder: 'rgba(255,179,71,0.3)',

  white: '#FFFFFF',
  text: '#E5E7EB',
  textMuted: '#9CA3AF',
  textFaint: '#6B7280',

  cardBg: 'rgba(11,21,48,0.55)',
  cardBorder: 'rgba(255,255,255,0.08)',
  inputBg: 'rgba(11,21,48,0.6)',

  green: '#34D399',
  red: '#F87171',
  blue: '#60A5FA',
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
} as const;
