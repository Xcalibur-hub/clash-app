/** Tiny colour helper so tints can be re-used at different opacities. */

export function withAlpha(input: string, alpha: number): string {
  const hex = input.trim();
  if (!hex.startsWith('#')) return hex;
  const expanded =
    hex.length === 4
      ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
      : hex.slice(0, 7);
  const value = Number.parseInt(expanded.slice(1), 16);
  if (Number.isNaN(value)) return input;
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r},${g},${b},${a})`;
}
