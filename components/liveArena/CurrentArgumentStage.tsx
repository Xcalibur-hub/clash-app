/**
 * Hero Stage moment — newest canonical fighter argument.
 * Typography-led; collapses long text without scrolling the whole canvas.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  FadeIn,
  useReducedMotion,
} from 'react-native-reanimated';
import type { ArenaDuel } from '../../utils/arenaDuelPayload';
import type { ArenaMessage } from '../../services/liveArenaService';
import { duelArgumentPreview, duelTimestamp } from '../../utils/duelPresentation';
import { duelStageType } from '../../utils/duelStageLayout';
import { sidePlateBorder } from './liveArenaStyles';
import { arena } from '../../theme/arena';
import { layout, space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';

export interface CurrentArgumentStageProps {
  duel: ArenaDuel;
  focusSide: 'A' | 'B' | null;
  message: ArenaMessage | null;
  condensed?: boolean;
  highlighted?: boolean;
  onOpenFull: () => void;
}

export function CurrentArgumentStage({
  duel,
  focusSide,
  message,
  condensed = false,
  highlighted = false,
  onOpenFull,
}: CurrentArgumentStageProps): React.JSX.Element {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const { width, fontScale } = useWindowDimensions();
  const type = duelStageType({ width, fontScale });
  const speaker =
    focusSide === 'A'
      ? duel.fighterA
      : focusSide === 'B'
        ? duel.fighterB
        : null;
  const accent = speaker?.tint ?? t.borderStrong;
  const body = message?.body?.trim() ?? '';
  const { preview, truncated } = duelArgumentPreview(
    body,
    condensed ? 120 : 220,
  );

  const content = !message || !speaker ? (
    <View style={styles.emptyWrap}>
      <Text style={[styles.emptyEyebrow, { color: t.textMuted }]}>STAGE</Text>
      <Text style={[styles.empty, { color: t.textSecondary }]}>
        Waiting for the opening official argument.
      </Text>
    </View>
  ) : (
    <>
      <Text style={[styles.attr, { color: t.textSecondary }]}>
        {highlighted ? 'LATEST OFFICIAL ARGUMENT' : 'OFFICIAL ARGUMENT'}
      </Text>
      <Text
        selectable
        style={[
          styles.argument,
          condensed && styles.argumentCondensed,
          {
            color: t.textPrimary,
            fontSize: type.argumentSize,
            lineHeight: type.argumentLineHeight,
          },
        ]}
      >
        {preview}
      </Text>
      <Text style={[styles.byline, { color: t.textSecondary }]}>
        {speaker.name}
        {duelTimestamp(message.createdAt) ? ` · ${duelTimestamp(message.createdAt)}` : ''}
      </Text>
      {truncated ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Read full argument"
          onPress={() => {
            hapticTap();
            onOpenFull();
          }}
          style={styles.readMoreHit}
        >
          <Text style={[styles.readMore, { color: t.textPrimary }]}>
            Read full argument
          </Text>
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open argument history"
          onPress={onOpenFull}
          style={styles.readMoreHit}
        >
          <Text style={[styles.historyCue, { color: t.textSecondary }]}>
            View argument history →
          </Text>
        </Pressable>
      )}
    </>
  );

  return (
    <View
      style={[
        styles.wrap,
        highlighted
          ? { borderLeftWidth: 2, borderLeftColor: sidePlateBorder(accent, t.scheme) }
          : null,
      ]}
      accessibilityLabel="Current argument"
    >
      {reduced || !message || !highlighted ? (
        content
      ) : (
        <Animated.View key={message.id} entering={FadeIn.duration(180)}>
          {content}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexShrink: 0,
    minHeight: 64,
    justifyContent: 'flex-start',
    paddingTop: space.sm,
    paddingBottom: space.xs,
    paddingHorizontal: layout.screenX,
    gap: space.sm,
  },
  argument: {
    ...arena.type.statement,
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '600',
    letterSpacing: -0.35,
    textAlign: 'left',
  },
  argumentCondensed: {
    fontSize: 16,
    lineHeight: 22,
  },
  attr: {
    ...typeScale.caption,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    textAlign: 'left',
  },
  byline: {
    ...typeScale.caption,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
    textAlign: 'left',
  },
  emptyWrap: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: space.md,
  },
  emptyEyebrow: {
    ...typeScale.caption,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  empty: {
    ...typeScale.body,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 280,
  },
  readMoreHit: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  readMore: {
    ...typeScale.label,
    fontSize: 13,
    fontWeight: '700',
  },
  historyCue: {
    ...typeScale.caption,
    fontSize: 12,
    fontWeight: '600',
  },
});
