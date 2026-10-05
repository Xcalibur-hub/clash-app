import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { CommunitySummary } from '../../../services/vaultCommunityMappers';
import { communityAccessLabel } from '../../../utils/vaultCommunityAccess';
import { communityActiveLabel, communityMemberLabel } from '../../../utils/vaultCommunityFeed';
import { space, typeScale, useThemeColors } from '../../../theme';
import { VaultActionButton } from '../VaultActionButton';
import { MemberConstellation } from '../world/MemberConstellation';

export interface CommunityChapterCardProps {
  summary: CommunitySummary;
  creatorName: string;
  tint?: string | null;
  onEnter: () => void;
}

/**
 * COMMUNITY chapter doorway — private room energy, no discussion-card chrome.
 */
export function CommunityChapterCard({
  summary,
  creatorName,
  tint,
  onEnter,
}: CommunityChapterCardProps): React.JSX.Element {
  const t = useThemeColors();
  const firstName = creatorName.trim().split(' ')[0] || creatorName;
  const note = summary.description?.trim() || `${firstName}'s private room.`;

  return (
    <View style={styles.wrap}>
      <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
        {communityAccessLabel(summary.accessType).toUpperCase()}
      </Text>
      <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]} numberOfLines={2}>
        {summary.name}
      </Text>

      <View style={styles.constellation}>
        <MemberConstellation
          anonymousCount={summary.memberCount}
          tint={tint}
          total={summary.memberCount}
          size={38}
        />
      </View>

      <View style={[styles.note, { borderLeftColor: t.borderStrong }]}>
        <Text allowFontScaling={false} style={[styles.noteLabel, { color: t.textMuted }]}>
          FROM {firstName.toUpperCase()}
        </Text>
        <Text allowFontScaling={false} style={[styles.noteBody, { color: t.textSecondary }]} numberOfLines={3}>
          {note}
        </Text>
      </View>

      <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]}>
        {`${communityMemberLabel(summary.memberCount)} · ${communityActiveLabel(summary.activeToday)}`}
      </Text>

      <View style={styles.action}>
        <VaultActionButton label="Enter conversation" compact onPress={onEnter} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, paddingTop: space.xs },
  kicker: { ...typeScale.caption, fontWeight: '800', letterSpacing: 1.2 },
  title: {
    ...typeScale.display,
    fontSize: 32,
    lineHeight: 34,
    fontWeight: '800',
    letterSpacing: -1,
  },
  constellation: { marginTop: space.md, marginBottom: space.sm },
  note: {
    borderLeftWidth: 2,
    paddingLeft: space.md,
    gap: 4,
    marginTop: space.xs,
  },
  noteLabel: {
    ...typeScale.caption,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  noteBody: { ...typeScale.meta, fontSize: 14, lineHeight: 20 },
  meta: { ...typeScale.meta, marginTop: space.xs },
  action: { marginTop: space.md },
});
