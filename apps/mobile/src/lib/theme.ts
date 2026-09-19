/** Plain tokens, no UI library: the demo ships the shape, you pick the kit. */
export const colors = {
  background: "#fafafa",
  card: "#ffffff",
  border: "#e4e4e7",
  text: "#18181b",
  muted: "#71717a",
  primary: "#18181b",
  onPrimary: "#fafafa",
  danger: "#dc2626",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  md: 10,
  lg: 14,
} as const;
