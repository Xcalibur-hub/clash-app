import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Take } from '../../store';
import { layout, space, typeScale, useThemeColors } from '../../theme';
import { Underline } from '../shared/Doodles';
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

  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
          Fresh Takes
        </Text>
        <Text allowFontScaling={false} style={[styles.sub, { color: t.textMuted }]}>
          What people are arguing about now
        </Text>
        <Underline size={72} color={t.textPrimary} opacity={0.22} style={styles.mark} />
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
  section: {
    paddingTop: space.md,
    paddingBottom: space.lg,
    gap: space.sm,
  },
  head: {
    paddingHorizontal: layout.screenX,
    paddingBottom: space.xs,
    position: 'relative',
  },
  title: {
    ...typeScale.section,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  sub: {
    ...typeScale.meta,
    fontSize: 13,
    marginTop: 4,
  },
  mark: { marginTop: 4 },
});
