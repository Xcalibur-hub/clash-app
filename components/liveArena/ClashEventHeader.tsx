/**
 * Minimal event chrome — back · LIVE · watching · more.
 * Viewer count only when real; never fabricates scores or splits.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { layout, space, typeScale, useThemeColors } from '../../theme';
import { BackIcon } from '../shared/icons';
import { LivePulse } from './LivePulse';

export interface ClashEventHeaderProps {
  live: boolean;
  statusLabel: string;
  spectatorCount: number | null;
  paddingTop: number;
  onBack: () => void;
  onMore: () => void;
}

export function ClashEventHeader({
  live,
  statusLabel,
  spectatorCount,
  paddingTop,
  onBack,
  onMore,
}: ClashEventHeaderProps): React.JSX.Element {
  const t = useThemeColors();
  return (
    <View style={[styles.wrap, { paddingTop }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={styles.hit}
        onPress={onBack}
      >
        <BackIcon size={20} color={t.textPrimary} />
      </Pressable>

      <View
        style={styles.center}
        accessibilityLiveRegion="polite"
        accessibilityLabel={
          spectatorCount !== null
            ? `${statusLabel}. ${spectatorCount} spectators joined`
            : statusLabel
        }
      >
        {live ? <LivePulse dotOnly size={6} /> : null}
        <Text
          allowFontScaling={false}
          style={[styles.status, { color: live ? t.textPrimary : t.textSecondary }]}
        >
          {statusLabel}
        </Text>
        {spectatorCount !== null ? (
          <>
            <Text allowFontScaling={false} style={[styles.sep, { color: t.textMuted }]}>
              ·
            </Text>
            <Text allowFontScaling={false} style={[styles.watching, { color: t.textMuted }]}>
              {spectatorCount} joined
            </Text>
          </>
        ) : null}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="More Clash options"
        style={styles.hit}
        onPress={onMore}
      >
        <Text allowFontScaling={false} style={[styles.more, { color: t.textMuted }]}>
          •••
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.screenX,
    paddingBottom: space.xs,
    minHeight: 44,
  },
  hit: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minWidth: 0,
  },
  status: {
    ...typeScale.label,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  sep: { fontSize: 12 },
  watching: { ...typeScale.caption, fontSize: 12, fontWeight: '500' },
  more: { ...typeScale.label, fontSize: 16, fontWeight: '800', letterSpacing: 1 },
});
