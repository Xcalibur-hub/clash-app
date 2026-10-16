import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Take } from '../../store';
import { layout, space, useThemeColors } from '../../theme';
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
 * Fresh Takes — editorial horizontal browse stage.
 * Distinct from Today's Arena asymmetric live deck; same accent system.
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
  const dark = t.scheme === 'dark';

  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <View style={styles.kickerRow}>
          <View style={[styles.kickerMark, { backgroundColor: dark ? '#E8A5AC' : '#CF6F81' }]} />
          <Text style={[styles.kicker, { color: t.textSecondary }]}>FRESH FROM THE ARENA</Text>
          <Text style={[styles.issue, { color: t.textMuted }]}>TODAY</Text>
        </View>
        <View style={styles.titleRow}>
          <Text allowFontScaling style={[styles.title, { color: t.textPrimary }]}>
            Fresh Takes<Text style={{ color: dark ? '#D6B9FA' : '#9968B5' }}>✳</Text>
          </Text>
          <View style={[styles.count, { backgroundColor: dark ? '#4C3A60' : '#EDDBFF' }]}>
            <Text style={[styles.countText, { color: dark ? '#FFF6FF' : '#603C7A' }]}>
              {String(items.length).padStart(2, '0')}
            </Text>
          </View>
        </View>
        <Text style={[styles.sub, { color: t.textSecondary }]}>
          The latest opinions, before the debate begins.
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
  section: { paddingTop: space.md, paddingBottom: space.sm, gap: space.sm },
  head: { paddingHorizontal: layout.screenX, paddingBottom: 2, gap: 5 },
  kickerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  kickerMark: { width: 9, height: 9, borderRadius: 3, transform: [{ rotate: '18deg' }] },
  kicker: { fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  issue: { fontSize: 10, fontWeight: '700', marginLeft: 'auto', letterSpacing: 0.6 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: {
    flexShrink: 1, fontSize: 27, lineHeight: 34, fontWeight: '800', letterSpacing: -1.1,
  },
  count: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  countText: { fontSize: 12, fontWeight: '800', letterSpacing: 0 },
  sub: { fontSize: 13, fontWeight: '500', lineHeight: 19 },
});
