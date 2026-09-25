import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import type { Take } from '../../store';
import { action, duel, ink, radius, space, typeScale } from '../../theme';
import { compact, timeLeftLabel } from '../../utils/format';
import { tap as hapticTap } from '../../utils/haptics';
import { BookmarkIcon, CommentIcon, FlameIcon, MoreIcon, ShareIcon, ZapIcon } from '../shared/icons';
import { UtilityAction } from './UtilityAction';

export interface TakeActionsProps {
  take: Take;
  challengerHandle?: string;
  commentCount?: number;
  isSaved: boolean;
  hasReacted: boolean;
  onClash: () => void;
  onReact: () => void;
  onSave: () => void;
  onShare: () => void;
  onMore: () => void;
  onComment?: () => void;
  now: number;
}

/** Explicit Take actions: one unmistakable CLASH target, then quiet utilities. */
export function TakeActions({
  take,
  commentCount = 0,
  isSaved,
  hasReacted,
  onClash,
  onReact,
  onSave,
  onShare,
  onMore,
  onComment,
  now,
}: TakeActionsProps): React.JSX.Element {
  const pressed = useSharedValue(0);
  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * 0.02 }],
  }));
  const withTap = (actionHandler: () => void): (() => void) => () => {
    hapticTap();
    actionHandler();
  };

  return (
    <View style={styles.wrap}>
      <Text allowFontScaling={false} style={styles.meta}>
        {`🔥 ${compact(take.clashes)} Clashes  ·  ${timeLeftLabel(take.expiresAt, now)} left`}
      </Text>

      <Animated.View style={pressStyle}>
        <Pressable
          onPress={onClash}
          onPressIn={() => {
            pressed.value = withTiming(1, { duration: 80 });
          }}
          onPressOut={() => {
            pressed.value = withTiming(0, { duration: 140 });
          }}
          style={styles.cta}
          accessibilityRole="button"
          accessibilityLabel="Clash on this take"
        >
          <ZapIcon size={17} color={duel.a} strokeWidth={2.6} />
          <Text allowFontScaling={false} style={styles.ctaText}>CLASH</Text>
          <ZapIcon size={17} color={duel.b} strokeWidth={2.6} />
        </Pressable>
      </Animated.View>

      <View style={styles.secondaryRow}>
        <UtilityAction
          icon={CommentIcon}
          label={commentCount > 0 ? `${compact(commentCount)}` : 'Replies'}
          color={ink.tertiary}
          selected={false}
          onPress={withTap(onComment ?? onMore)}
        />
        <UtilityAction
          icon={FlameIcon}
          label="React"
          color={hasReacted ? duel.b : ink.tertiary}
          selected={hasReacted}
          onPress={withTap(onReact)}
        />
        <UtilityAction
          icon={BookmarkIcon}
          label="Save"
          color={isSaved ? ink.primary : ink.tertiary}
          selected={isSaved}
          onPress={withTap(onSave)}
        />
        <UtilityAction
          icon={ShareIcon}
          label="Share"
          color={ink.tertiary}
          selected={false}
          onPress={withTap(onShare)}
        />
        <UtilityAction
          icon={MoreIcon}
          label=""
          color={ink.tertiary}
          selected={false}
          onPress={withTap(onMore)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  meta: { ...typeScale.meta, color: ink.secondary },
  cta: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    borderRadius: radius.sm,
    backgroundColor: action.darkFill,
    borderWidth: 1,
    borderColor: duel.aLine,
  },
  ctaText: { ...typeScale.button, color: action.darkText, letterSpacing: 1.6 },
  secondaryRow: { flexDirection: 'row', alignItems: 'center', gap: space.xl },
});
