/** A development JS bundle alone is insufficient: the native identity must be dev. */
export function arenaDemoAllowed(development: boolean, variant: unknown): boolean {
  return development === true && variant === 'development';
}
