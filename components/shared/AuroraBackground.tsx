import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useThemeColors } from '../../theme';

/** Reserved backdrop tone (kept for compatibility). */
export type GlowTone = 'arena';

/**
 * Plain theme canvas. Decorative aurora removed — content-first.
 * `tone` accepted for compatibility only.
 */
export function AuroraBackground({
  children,
}: {
  children: React.ReactNode;
  tone?: GlowTone;
}): React.JSX.Element {
  const t = useThemeColors();
  return <View style={[styles.root, { backgroundColor: t.background }]}>{children}</View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
