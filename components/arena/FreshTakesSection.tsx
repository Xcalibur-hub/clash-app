import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Take } from '../../store';
import { family, layout, space, useThemeColors } from '../../theme';
import { FreshTakesStage, type FreshTakeEntry } from './FreshTakesStage';

export type { FreshTakeEntry };

export interface FreshTakesSectionProps {
  items: FreshTakeEntry[];
  now: number;
  onOpen: (takeId: string) => void;
  onClash: (takeId: string) => void;
  onReact: (take: Take) => void;
  onSave: (takeId: string) => void;
  onShare: (take: Take, handle: string) => void;
  onMore: (take: Take) => void;
}

/**
 * Fresh Takes — content-first discovery stage above the main feed.
 * One quiet header; the cards carry the visual weight.
 */
export function FreshTakesSection({
  items,
  now,
  onOpen,
  onClash,
  onReact,
  onSave,
  onShare,
  onMore,
}: FreshTakesSectionProps): React.JSX.Element | null {
  const t = useThemeColors();
  if (items.length === 0) return null;

  return (
    <View style={styles.section} accessibilityLabel="Fresh Takes">
      <View style={styles.head}>
        <Text style={[styles.kicker, { color: t.textMuted }]}>FRESH TAKES</Text>
        <Text allowFontScaling style={[styles.title, { color: t.textPrimary }]}>
          What people are saying
        </Text>
        <Text style={[styles.sub, { color: t.textSecondary }]}>
          Opinions worth a closer look — swipe to browse, tap to open.
        </Text>
      </View>

      <FreshTakesStage
        items={items}
        now={now}
        onOpen={onOpen}
        onClash={onClash}
        onReact={onReact}
        onSave={onSave}
        onShare={onShare}
        onMore={onMore}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingTop: space.sm, paddingBottom: space.xs, gap: space.sm },
  head: { paddingHorizontal: layout.screenX, gap: 4 },
  kicker: {
    fontFamily: family.semibold,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.3,
  },
  title: {
    fontFamily: family.bold,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
    letterSpacing: -0.7,
  },
  sub: {
    fontFamily: family.regular,
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 18,
    maxWidth: 340,
  },
});
