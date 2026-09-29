import React, { createContext, useContext, useMemo } from 'react';
import { Appearance, useColorScheme } from 'react-native';
import { selectThemeMode, useClash, type ThemeMode } from '../store';
import { darkTheme, paletteFor, type ColorScheme, type SemanticTheme } from './palettes';

export interface ThemeContextValue {
  /** Resolved light | dark after applying System preference. */
  scheme: ColorScheme;
  /** User preference: system | light | dark. */
  preference: ThemeMode;
  /** Semantic tokens for the active scheme. */
  colors: SemanticTheme;
}

const ThemeContext = createContext<ThemeContextValue>({
  scheme: 'dark',
  preference: 'system',
  colors: darkTheme,
});

/**
 * Resolves System / Light / Dark into semantic tokens.
 * Must sit under ClashProvider so preference can be read from store.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { state } = useClash();
  const preference = selectThemeMode(state);
  const system = useColorScheme();

  const scheme: ColorScheme = React.useMemo(() => {
    if (preference === 'light') return 'light';
    if (preference === 'dark') return 'dark';
    return system === 'light' ? 'light' : 'dark';
  }, [preference, system]);

  React.useEffect(() => {
    Appearance.setColorScheme(preference === 'system' ? system : preference);
  }, [preference, system]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      scheme,
      preference,
      colors: paletteFor(scheme),
    }),
    [scheme, preference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Semantic theme tokens — prefer this over raw color/ink imports on new surfaces. */
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

/** Convenience: just the semantic colour object. */
export function useThemeColors(): SemanticTheme {
  return useContext(ThemeContext).colors;
}
