import React from 'react';
import { StyleSheet, View } from 'react-native';
import { color } from '../../theme';

/** Reserved backdrop tone (kept for compatibility). */
export type GlowTone = 'arena';

/**
 * A plain neutral backdrop. The decorative drifting aurora was removed in
 * favour of a calm, content-first canvas; `tone` is accepted for compatibility
 * but no longer paints ambient colour or motion.
 */
export function AuroraBackground({
  children,
}: {
  children: React.ReactNode;
  tone?: GlowTone;
}): React.JSX.Element {
  return <View style={styles.root}>{children}</View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
});
