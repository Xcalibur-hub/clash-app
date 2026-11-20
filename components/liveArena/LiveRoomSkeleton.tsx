/**
 * Lightweight room-entry skeleton — never a blank white spinner screen.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { layout, radius, space, useThemeColors } from '../../theme';
import { softFill } from './liveArenaStyles';

export interface LiveRoomSkeletonProps {
  paddingTop: number;
}

export function LiveRoomSkeleton({ paddingTop }: LiveRoomSkeletonProps): React.JSX.Element {
  const t = useThemeColors();
  const bone = softFill(t);

  return (
    <View style={[styles.root, { backgroundColor: t.background, paddingTop: paddingTop + space.xs }]}>
      <View style={styles.top}>
        <View style={[styles.back, { backgroundColor: bone }]} />
        <View style={[styles.chip, { backgroundColor: bone }]} />
      </View>
      <View style={[styles.title, { backgroundColor: bone }]} />
      <View style={[styles.meta, { backgroundColor: bone }]} />
      <View style={styles.avatars}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={[styles.avatar, { backgroundColor: bone, marginLeft: i > 0 ? -8 : 0 }]}
          />
        ))}
      </View>
      <View style={[styles.rail, { backgroundColor: bone }]} />
      <View style={styles.stage}>
        <View style={[styles.stageBlock, { backgroundColor: bone }]} />
        <View style={[styles.stageLine, { backgroundColor: bone }]} />
        <View style={[styles.stageLineShort, { backgroundColor: bone }]} />
      </View>
      <View style={[styles.composer, { backgroundColor: bone }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: layout.screenX,
    gap: space.sm,
  },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  back: { width: 36, height: 36, borderRadius: 18 },
  chip: { width: 72, height: 28, borderRadius: radius.pill },
  title: { height: 22, width: '78%', borderRadius: 8, marginTop: 4 },
  meta: { height: 14, width: '46%', borderRadius: 6 },
  avatars: { flexDirection: 'row', marginTop: space.sm },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  rail: { height: 10, width: '100%', borderRadius: 5, marginTop: space.xs },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingBottom: space.xxl,
  },
  stageBlock: { width: 160, height: 22, borderRadius: 8 },
  stageLine: { width: 200, height: 12, borderRadius: 6 },
  stageLineShort: { width: 120, height: 12, borderRadius: 6 },
  composer: {
    height: 64,
    borderRadius: 22,
    marginBottom: space.lg,
  },
});
