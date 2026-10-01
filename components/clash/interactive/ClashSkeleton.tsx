/**
 * Skeleton matching Clash matchup composition.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { layout, radius, space, useThemeColors } from '../../../theme';

export function ClashSkeleton(): React.JSX.Element {
  const t = useThemeColors();
  const bone = t.surfaceMuted;
  return (
    <View style={[styles.root, { backgroundColor: t.background }]} accessibilityLabel="Loading Clash">
      <View style={[styles.pill, { backgroundColor: bone }]} />
      <View style={[styles.card, { backgroundColor: bone, borderColor: t.border }]} />
      <View style={[styles.card, { backgroundColor: bone, borderColor: t.border, transform: [{ rotate: '-1deg' }] }]} />
      <View style={[styles.row, { gap: space.sm }]}>
        <View style={[styles.btn, { backgroundColor: bone }]} />
        <View style={[styles.btn, { backgroundColor: bone }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: layout.screenX,
    paddingTop: 72,
    gap: space.md,
  },
  pill: { width: 120, height: 28, borderRadius: radius.pill },
  card: {
    height: 140,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  row: { flexDirection: 'row', marginTop: space.lg },
  btn: { flex: 1, height: 72, borderRadius: radius.lg },
});
