import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, useReducedMotion } from 'react-native-reanimated';
import { communityActiveLabel, communityMemberLabel } from '../../../utils/vaultCommunityFeed';
import { duration, radius, space, typeScale, useThemeColors } from '../../../theme';

export interface CommunityMetaCardProps {
  description: string;
  memberCount: number;
  activeToday: number;
}

/** Compact identity line under the community hero: description + activity. */
export function CommunityMetaCard({
  description,
  memberCount,
  activeToday,
}: CommunityMetaCardProps): React.JSX.Element {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  return (
    <Animated.View
      entering={reduced ? undefined : FadeInUp.duration(duration.base)}
      style={[
        styles.overlap,
        {
          backgroundColor: t.scheme === 'light' ? t.background : 'rgba(12,12,14,0.92)',
          borderColor: t.scheme === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)',
        },
      ]}
    >
      {description ? (
        <Text allowFontScaling={false} style={[styles.desc, { color: t.textSecondary }]} numberOfLines={3}>
          {description}
        </Text>
      ) : null}
      <View style={styles.metaRow}>
        <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]}>
          {communityMemberLabel(memberCount)}
        </Text>
        <Text allowFontScaling={false} style={[styles.dot, { color: t.textMuted }]}>
          ·
        </Text>
        <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]}>
          {communityActiveLabel(activeToday)}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlap: {
    gap: 6,
    marginTop: -space.md,
    marginHorizontal: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    borderRadius: radius.xxl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  desc: { ...typeScale.meta, fontSize: 13, lineHeight: 18 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { ...typeScale.caption, fontSize: 12, fontWeight: '600' },
  dot: { ...typeScale.caption, fontSize: 12 },
});
