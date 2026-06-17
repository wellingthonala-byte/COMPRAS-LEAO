const COLORS = ['#7C3AED', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#6366F1'];

export function colorFromInitials(initials: string): string {
  let hash = 0;
  for (let i = 0; i < initials.length; i++) hash = initials.charCodeAt(i) + hash * 31;
  return COLORS[Math.abs(hash) % COLORS.length];
}
