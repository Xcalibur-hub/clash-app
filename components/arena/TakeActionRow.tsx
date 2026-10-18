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
import { arena, arenaColors } from '../../theme/arena';
import { compact } from '../../utils/format';
import { tap as hapticTap } from '../../utils/haptics';
import { ArenaIcon, ArrowBigUpIcon, BookmarkIcon, CommentIcon, ShareIcon } from '../shared/icons';
import { PressableScale } from '../shared/PressableScale';

export interface TakeActionRowProps {
  readOnly?: boolean;
  reactions: number;
  commentCount: number;
  isSaved: boolean;
  hasReacted: boolean;
  onReact: () => void;
  onComment: () => void;
  onClash: () => void;
  onShare: () => void;
  onSave: () => void;
  /** conversation = Take Detail — CLASH reads as the primary CTA. */
  prominence?: 'feed' | 'conversation';
}

interface MetaActionProps {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
  activeColor: string;
  idleColor: string;
}

function MetaAction({
  disabled = false,
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
            withSpring(1.035, { damping: 18, stiffness: 400 }),
            withSpring(1, { damping: 14, stiffness: 280 }),
          );
        }
        onPress();
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: active, disabled }}
      style={[styles.metaAction, disabled && { opacity: 0.5 }]}
    >
      <Animated.View style={animated}>
        <Icon size={18} color={active ? activeColor : idleColor} strokeWidth={active ? 2.4 : 2.1} />
      </Animated.View>
      {label ? (
        <Text
          allowFontScaling
          style={[styles.metaLabel, { color: active ? activeColor : idleColor, fontWeight: active ? '600' : '400' }]}
        >
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** Social actions — CLASH is the signature filled CTA. */
export function TakeActionRow(props: TakeActionRowProps): React.JSX.Element {
  const {
    reactions,
    commentCount,
    isSaved,
    hasReacted,
    onReact,
    onComment,
    onClash,
    onShare,
    onSave,
    prominence = 'feed',
  } = props;
  const t = useThemeColors();
  const c = arenaColors(t);
  const reduced = useReducedMotion();
  const clashPulse = useSharedValue(1);
  const clashAnim = useAnimatedStyle(() => ({
    transform: [{ scale: clashPulse.value }],
  }));
  const conversation = prominence === 'conversation';

  const clashButton = (
    <PressableScale
      onPress={() => {
        hapticTap();
        if (!reduced) {
          clashPulse.value = withSequence(
            withTiming(0.97, { duration: 90 }),
            withSpring(1, { damping: 14, stiffness: 320 }),
          );
        }
        onClash();
      }}
      accessibilityRole="button"
      accessibilityLabel={conversation ? 'View Clash history' : 'Clash on this take'}
      style={[styles.clash, conversation && styles.clashProminent, { backgroundColor: conversation ? c.inset : t.clashFill }]}
    >
      <Animated.View style={[styles.clashInner, clashAnim]}>
        <ArenaIcon size={conversation ? 16 : 13} color={conversation ? c.ink : t.clashText} strokeWidth={2} />
        <Text style={[styles.clashText, { color: conversation ? c.ink : t.clashText }]}>
          {conversation ? 'Duels' : 'CLASH'}
        </Text>
      </Animated.View>
    </PressableScale>
  );

  if (conversation) {
    return (
      <View style={[styles.row, styles.rowConversation]}>
        <MetaAction
          disabled={props.readOnly}
          icon={ArrowBigUpIcon}
          label={compact(reactions)}
          active={hasReacted}
          accessibilityLabel="React to this take"
          onPress={onReact}
          activeColor={t.textPrimary}
          idleColor={c.muted}
        />
        <MetaAction
          icon={CommentIcon}
          label={commentCount > 0 ? compact(commentCount) : ''}
          accessibilityLabel="Jump to replies"
          onPress={onComment}
          activeColor={t.textPrimary}
          idleColor={c.muted}
        />
        <MetaAction
          icon={ShareIcon}
          label=""
          accessibilityLabel="Share this take"
          onPress={onShare}
          activeColor={t.textPrimary}
          idleColor={c.muted}
        />
        <MetaAction
          icon={BookmarkIcon}
          label=""
          active={isSaved}
          accessibilityLabel={isSaved ? 'Remove from saved' : 'Save this take'}
          onPress={onSave}
          activeColor={t.textPrimary}
          idleColor={c.muted}
        />
        <View style={styles.spacer} />
        {clashButton}
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <MetaAction
        disabled={props.readOnly}
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
      {clashButton}
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
  rowConversation: {
    paddingVertical: 8,
    gap: 4,
    flexWrap: 'wrap',
  },
  metaAction: {
    minHeight: arena.hit,
    minWidth: arena.hit,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 2,
  },
  metaLabel: { ...typeScale.meta, fontSize: 13 },
  clash: {
    minHeight: 34,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    justifyContent: 'center',
  },
  clashProminent: {
    minHeight: arena.hit,
    paddingHorizontal: 10,
  },
  clashInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  clashText: {
    ...typeScale.label,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0,
  },
  spacer: { flex: 1 },
});
