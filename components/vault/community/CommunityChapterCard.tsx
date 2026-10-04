import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { CommunitySummary } from '../../../services/vaultCommunityMappers';
import { communityAccessLabel } from '../../../utils/vaultCommunityAccess';
import { communityActiveLabel, communityMemberLabel } from '../../../utils/vaultCommunityFeed';
import { vaultTintWash } from '../../../utils/vaultPresentation';
import { space, typeScale, useThemeColors } from '../../../theme';
import { CreatorsIcon } from '../../shared/icons';
import { VaultActionButton } from '../VaultActionButton';
import { MemberConstellation } from '../world/MemberConstellation';

export interface CommunityChapterCardProps {
  summary: CommunitySummary;
  creatorName: string;
  tint?: string | null;
  onEnter: () => void;
}

/**
 * The COMMUNITY chapter inside a Creator World — a doorway into a private room,
 * not a dashboard tile.
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
    <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: vaultTintWash(tint, 0.08) }]} pointerEvents="none" />
      <View style={styles.head}>
        <CreatorsIcon size={15} color={t.textMuted} strokeWidth={2.2} />
        <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
          {communityAccessLabel(summary.accessType).toUpperCase()}
        </Text>
      </View>
      <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]} numberOfLines={2}>
        {summary.name}
      </Text>
      <Text allowFontScaling={false} style={[styles.sub, { color: t.textSecondary }]} numberOfLines={1}>
        {`${firstName}'s community`}
      </Text>
      <View style={styles.room}>
        <MemberConstellation anonymousCount={summary.memberCount} tint={tint} total={summary.memberCount} size={36} />
      </View>
      <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]}>
        {`${communityMemberLabel(summary.memberCount)} · ${communityActiveLabel(summary.activeToday)}`}
      </Text>
      <View style={styles.action}>
        <VaultActionButton label="Enter the conversation" compact onPress={onEnter} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden', gap: 6, padding: space.lg, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kicker: { ...typeScale.caption, fontWeight: '800', letterSpacing: 1.2 },
  title: { ...typeScale.display, fontSize: 28, lineHeight: 30, fontWeight: '800', letterSpacing: -0.8 },
  sub: { ...typeScale.label, fontSize: 14 },
  room: { marginTop: space.md, marginBottom: space.xs },
  meta: { ...typeScale.meta },
  action: { marginTop: space.sm },
});