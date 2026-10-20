/**
 * Minimal event chrome — back · LIVE · watching · more.
 * Viewer count only when real; never fabricates scores or splits.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { layout, space, typeScale, useThemeColors } from '../../theme';
import { crowdAudienceLabel } from '../../utils/crowdPresentation';
import { BackIcon } from '../shared/icons';
import { LivePulse } from './LivePulse';
import { chipFill } from './liveArenaStyles';

export interface ClashEventHeaderProps {
  live: boolean;
  statusLabel: string;
  spectatorCount: number | null;
  /** Short phase token, e.g. OPEN or FINAL. Omitted when the Clash is not live. */
  phaseLabel?: string;
  paddingTop: number;
  onBack: () => void;
  onMore: () => void;
}

export function ClashEventHeader({
  live,
  statusLabel,
  spectatorCount,
  phaseLabel,
  paddingTop,
  onBack,
  onMore,
}: ClashEventHeaderProps): React.JSX.Element {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  // Spectators are only claimed when the server supplied a spectator count;
  // the header never upgrades a membership number into a viewer number.
  const audienceLabel = spectatorCount !== null ? crowdAudienceLabel({ spectatorCount }) : null;
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
          audienceLabel
            ? `${statusLabel}${phaseLabel ? ` ${phaseLabel}` : ''}. ${audienceLabel}`
            : `${statusLabel}${phaseLabel ? ` ${phaseLabel}` : ''}`
        }
      >
        {live ? <LivePulse dotOnly size={6} /> : null}
        <Animated.View
          key={statusLabel}
          entering={reduced ? undefined : FadeIn.duration(180)}
          style={styles.statusGroup}
        >
        <Text
          allowFontScaling={false}
          style={[styles.status, { color: live ? t.textPrimary : t.textSecondary }]}
        >
          {statusLabel}
        </Text>
        {phaseLabel ? (
          <Animated.View
            key={phaseLabel}
            entering={reduced ? undefined : FadeIn.duration(180)}
          >
            <View
              style={[styles.phaseChip, { backgroundColor: chipFill(t), borderColor: t.border }]}
            >
              <Text
                allowFontScaling={false}
                style={[styles.phaseChipText, { color: t.textSecondary }]}
              >
                {phaseLabel}
              </Text>
            </View>
          </Animated.View>
        ) : null}
        {audienceLabel !== null ? (
          <>
            <Text allowFontScaling={false} style={[styles.sep, { color: t.textMuted }]}>
              ·
            </Text>
            <Text allowFontScaling={false} style={[styles.watching, { color: t.textMuted }]}>
              {audienceLabel}
            </Text>
          </>
        ) : null}
        </Animated.View>
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
  statusGroup: {
    flexShrink: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  status: {
    ...typeScale.label,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  phaseChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  phaseChipText: {
    ...typeScale.label,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  sep: { fontSize: 12 },
  watching: { ...typeScale.caption, fontSize: 12, fontWeight: '500' },
  more: { ...typeScale.label, fontSize: 16, fontWeight: '800', letterSpacing: 1 },
});
