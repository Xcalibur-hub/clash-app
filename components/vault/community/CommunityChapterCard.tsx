import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { CommunitySummary } from '../../../services/vaultCommunityMappers';
import { communityAccessLabel } from '../../../utils/vaultCommunityAccess';
import { communityActiveLabel, communityMemberLabel } from '../../../utils/vaultCommunityFeed';
import { vaultTintWash } from '../../../utils/vaultPresentation';
import { radius, space, typeScale, useThemeColors } from '../../../theme';
import { CreatorsIcon } from '../../shared/icons';
import { VaultActionButton } from '../VaultActionButton';

export interface CommunityChapterCardProps {
  summary: CommunitySummary;
  creatorName: string;
  tint?: string | null;
  onEnter: () => void;
}

/**
 * The COMMUNITY chapter card inside a Creator World. Not a dashboard tile —
 * an invitation that sits within the creator's world.
 */
export function CommunityChapterCard({
  summary,
  creatorName,
  tint,
  onEnter,
}: CommunityChapterCardProps): React.JSX.Element {
  const t = useThemeColors();
  const firstName = creatorName.trim().split(' ')[0] || creatorName;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: t.surface,
          borderColor: t.border,
          shadowColor: t.scheme === 'light' ? '#000' : '#000',
        },
      ]}
    >
      <View style={[StyleSheet.absoluteFill, { backgroundColor: vaultTintWash(tint, 0.1) }]} pointerEvents="none" />
      <View style={styles.head}>
        <CreatorsIcon size={16} color={t.textMuted} strokeWidth={2.2} />
        <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
          {communityAccessLabel(summary.accessType).toUpperCase()}
        </Text>
      </View>
      <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]} numberOfLines={2}>
        {`JOIN ${summary.name.toUpperCase()}`}
      </Text>
      <Text allowFontScaling={false} style={[styles.sub, { color: t.textSecondary }]} numberOfLines={1}>
        {`${firstName}'s community`}
      </Text>
      <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]}>
        {`${communityMemberLabel(summary.memberCount)} · ${communityActiveLabel(summary.activeToday)}`}
      </Text>
      <View style={styles.action}>
        <VaultActionButton label="Enter" compact onPress={onEnter} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    gap: 4,
    padding: space.lg,
    borderRadius: radius.xxl,
    borderWidth: StyleSheet.hairlineWidth,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kicker: { ...typeScale.caption, fontWeight: '800', letterSpacing: 1 },
  title: { ...typeScale.title, fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  sub: { ...typeScale.label, fontSize: 14 },
  meta: { ...typeScale.meta, marginTop: 2 },
  action: { marginTop: space.sm },
});
