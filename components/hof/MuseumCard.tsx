import React from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import type { HofEntry } from '../../data/hofTakes';
import { HOOD_LABEL } from '../../data/hoods';
import { card, ink, radius, space, typeScale } from '../../theme';
import { compact, formatReputation } from '../../utils/format';
import { press as hapticPress } from '../../utils/haptics';
import { Chip } from '../shared/Chip';
import { GlassCard } from '../shared/GlassCard';
import { GlowButton } from '../shared/GlowButton';
import { HashIcon, ShareIcon, TrophyIcon } from '../shared/icons';

export interface MuseumCardProps {
  entry: HofEntry;
  takeText: string;
  onOpen: () => void;
}

/**
 * One museum record (reference screen 14): the immortalized take, the jury score
 * that sealed it, the date it entered the archive, and a share trigger.
 */
export function MuseumCard({ entry, takeText, onOpen }: MuseumCardProps): React.JSX.Element {
  const share = (): void => {
    hapticPress();
    Share.share({
      title: 'Hall of Fame — Immortalized Take',
      message: `🏆 Hall of Fame — "${takeText}"\nScore: ${entry.scoreA}–${entry.scoreB} | ${entry.date}\n${formatReputation(entry.views)} views • ${compact(entry.shares)} shares`,
    }).catch(() => undefined);
  };

  return (
    <GlassCard
      level="soft"
      corner={radius.card}
      style={styles.card}
      onPress={onOpen}
      accessibilityLabel={`Open the clash for ${takeText}`}
    >
      <View style={styles.head}>
        <View style={styles.chips}>
          <Chip label={`${entry.scoreA}–${entry.scoreB}`} icon={TrophyIcon} tone="gold" data />
          <Chip label={HOOD_LABEL[entry.hood]} icon={HashIcon} tone="violet" />
        </View>
        <GlowButton
          label="SHARE"
          onPress={share}
          icon={ShareIcon}
          tone="glass"
          compact
          accessibilityLabel={`Share the Hall of Fame record for ${takeText}`}
        />
      </View>

      <Text allowFontScaling={false} style={styles.quote} numberOfLines={3}>
        {`“${takeText}”`}
      </Text>

      <View style={styles.metaRow}>
        <Text allowFontScaling={false} style={styles.date}>
          {entry.date}
        </Text>
        <Text allowFontScaling={false} style={styles.meta}>
          {`${formatReputation(entry.views)} views`}
        </Text>
        <Text allowFontScaling={false} style={styles.meta}>
          {`${compact(entry.shares)} shares`}
        </Text>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: space.md },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  chips: { flexDirection: 'row', gap: space.xs, flexShrink: 1, flexWrap: 'wrap' },
  quote: {
    ...typeScale.body,
    color: ink.primary,
    fontWeight: '600',
    lineHeight: 23,
    marginTop: space.md,
  },
  metaRow: { flexDirection: 'row', gap: space.md, marginTop: space.md, flexWrap: 'wrap' },
  date: { ...typeScale.data, fontSize: 11, color: card.border },
  meta: { ...typeScale.caption, color: ink.tertiary },
});
