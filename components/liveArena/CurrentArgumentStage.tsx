/**
 * Hero Stage moment — newest canonical fighter argument.
 * Typography-led; collapses long text without scrolling the whole canvas.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeInDown,
  useReducedMotion,
} from 'react-native-reanimated';
import type { ArenaDuel } from '../../utils/arenaDuelPayload';
import type { ArenaMessage } from '../../services/liveArenaService';
import { duelArgumentPreview } from '../../utils/duelPresentation';
import { arena } from '../../theme/arena';
import { layout, space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';

export interface CurrentArgumentStageProps {
  duel: ArenaDuel;
  focusSide: 'A' | 'B' | null;
  message: ArenaMessage | null;
  condensed?: boolean;
  onOpenFull: () => void;
}

export function CurrentArgumentStage({
  duel,
  focusSide,
  message,
  condensed = false,
  onOpenFull,
}: CurrentArgumentStageProps): React.JSX.Element {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const speaker =
    focusSide === 'A'
      ? duel.fighterA
      : focusSide === 'B'
        ? duel.fighterB
        : null;
  const body = message?.body?.trim() ?? '';
  const { preview, truncated } = duelArgumentPreview(
    body,
    condensed ? 120 : 220,
  );

  const content = !message || !speaker ? (
    <Text style={[styles.empty, { color: t.textMuted }]}>
      Awaiting the opening argument.
    </Text>
  ) : (
    <>
      <Text style={[styles.attr, { color: t.textSecondary }]}>OFFICIAL ARGUMENT</Text>
      <Text
        selectable
        style={[
          styles.argument,
          condensed && styles.argumentCondensed,
          { color: t.textPrimary },
        ]}
      >
        {preview}
      </Text>
      <Text style={[styles.attr, { color: t.textSecondary }]}>ARGUMENT BY {speaker.name}</Text>
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
          <Text style={[styles.historyCue, { color: t.textSecondary }]}>View argument history  →</Text>
        </Pressable>
      )}
    </>
  );

  return (
    <View style={styles.wrap} accessibilityLabel="Current argument">
      {reduced || !message ? (
        content
      ) : (
        <Animated.View
          key={message.id}
          entering={FadeInDown.duration(280).springify().damping(18)}
        >
          {content}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 64,
    justifyContent: 'flex-start',
    paddingTop: 12,
    paddingHorizontal: layout.screenX,
    gap: space.sm,
  },
  argument: {
    ...arena.type.statement,
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '600',
    letterSpacing: -0.25,
    textAlign: 'left',
  },
  argumentCondensed: {
    fontSize: 16,
    lineHeight: 22,
  },
  attr: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    textAlign: 'left',
  },
  empty: {
    ...typeScale.body,
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
  },
  readMoreHit: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'flex-start',
    paddingTop: 12,
    paddingHorizontal: space.sm,
  },
  readMore: {
    ...typeScale.label,
    fontSize: 13,
    fontWeight: '800',
  },
  historyCue: {
    ...typeScale.caption,
    fontSize: 12,
    fontWeight: '600',
  },
});
