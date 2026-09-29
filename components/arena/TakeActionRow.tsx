import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { compact } from '../../utils/format';
import { tap as hapticTap } from '../../utils/haptics';
import { ArenaIcon, ArrowBigUpIcon, BookmarkIcon, CommentIcon, ShareIcon } from '../shared/icons';
import { PressableScale } from '../shared/PressableScale';

export interface TakeActionRowProps {
  reactions: number;
  commentCount: number;
  isSaved: boolean;
  hasReacted: boolean;
  onReact: () => void;
  onComment: () => void;
  onClash: () => void;
  onShare: () => void;
  onSave: () => void;
}

interface MetaActionProps {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  accessibilityLabel: string;
  onPress: () => void;
  activeColor: string;
  idleColor: string;
}

function MetaAction({
  icon: Icon,
  label,
  active = false,
  accessibilityLabel,
  onPress,
  activeColor,
  idleColor,
}: MetaActionProps): React.JSX.Element {
  const reduced = useReducedMotion();
  const bounce = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: bounce.value }],
  }));

  return (
    <Pressable
      onPress={() => {
        hapticTap();
        if (!reduced) {
          bounce.value = withSequence(
            withSpring(1.18, { damping: 12, stiffness: 400 }),
            withSpring(1, { damping: 14, stiffness: 280 }),
          );
        }
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={active ? { selected: true } : undefined}
      style={styles.metaAction}
    >
      <Animated.View style={animated}>
        <Icon size={19} color={active ? activeColor : idleColor} strokeWidth={active ? 2.4 : 2.1} />
      </Animated.View>
      {label ? (
        <Text
          allowFontScaling={false}
          style={[styles.metaLabel, { color: active ? activeColor : idleColor, fontWeight: active ? '600' : '400' }]}
        >
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** Social action row — CLASH is the signature filled CTA (theme-aware). */
export function TakeActionRow(props: TakeActionRowProps): React.JSX.Element {
  const { reactions, commentCount, isSaved, hasReacted, onReact, onComment, onClash, onShare, onSave } =
    props;
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const clashPulse = useSharedValue(1);
  const clashAnim = useAnimatedStyle(() => ({
    transform: [{ scale: clashPulse.value }],
  }));

  return (
    <View style={styles.row}>
      <MetaAction
        icon={ArrowBigUpIcon}
        label={compact(reactions)}
        active={hasReacted}
        accessibilityLabel="React to this take"
        onPress={onReact}
        activeColor={t.textPrimary}
        idleColor={t.textMuted}
      />
      <MetaAction
        icon={CommentIcon}
        label={commentCount > 0 ? compact(commentCount) : 'Replies'}
        accessibilityLabel="Open rebuttals"
        onPress={onComment}
        activeColor={t.textPrimary}
        idleColor={t.textMuted}
      />
      <PressableScale
        onPress={() => {
          hapticTap();
          if (!reduced) {
            clashPulse.value = withSequence(
              withTiming(0.94, { duration: 90 }),
              withSpring(1, { damping: 14, stiffness: 320 }),
            );
          }
          onClash();
        }}
        accessibilityRole="button"
        accessibilityLabel="Clash on this take"
        style={[styles.clash, { backgroundColor: t.clashFill }]}
      >
        <Animated.View style={[styles.clashInner, clashAnim]}>
          <ArenaIcon size={14} color={t.clashText} strokeWidth={2.6} />
          <Text allowFontScaling={false} style={[styles.clashText, { color: t.clashText }]}>
            CLASH
          </Text>
        </Animated.View>
      </PressableScale>
      <View style={styles.spacer} />
      <MetaAction
        icon={ShareIcon}
        label=""
        accessibilityLabel="Share this take"
        onPress={onShare}
        activeColor={t.textPrimary}
        idleColor={t.textMuted}
      />
      <MetaAction
        icon={BookmarkIcon}
        label=""
        active={isSaved}
        accessibilityLabel={isSaved ? 'Remove from saved' : 'Save this take'}
        onPress={onSave}
        activeColor={t.textPrimary}
        idleColor={t.textMuted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingTop: space.sm,
  },
  metaAction: {
    minHeight: 40,
    minWidth: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 2,
  },
  metaLabel: { ...typeScale.meta, fontSize: 13 },
  clash: {
    minHeight: 34,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    justifyContent: 'center',
  },
  clashInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  clashText: {
    ...typeScale.label,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  spacer: { flex: 1 },
});
