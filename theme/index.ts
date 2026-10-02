/**
 * CLASH 2.0 design tokens — single import surface for every screen.
 *
 *   import { color, ink, space, typeScale, glassSurface, ease } from '../../theme';
 */
export * from './colors';
export * from './glass';
export * from './layout';
export * from './motion';
export * from './typography';
export * from './palettes';
export * from './arenaAccents';
export { ThemeProvider, useTheme, useThemeColors } from './ThemeProvider';
export { FontBootstrap } from './FontBootstrap';

// Re-export commonly used tokens for convenience
export { card } from './colors';
