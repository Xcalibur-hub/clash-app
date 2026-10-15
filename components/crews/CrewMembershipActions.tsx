import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import type { ArenaCrew } from '../../services/arenaCrewService';
import { GlowButton } from '../shared/GlowButton';
import { space, typeScale, useThemeColors } from '../../theme';
import {
  crewJoinAction,
  crewJoinLabel,
} from '../../utils/arenaCrewIdentity';
import { tap as hapticTap } from '../../utils/haptics';

export interface CrewMembershipActionsProps {
  crew: ArenaCrew;
  busy?: boolean;
  onJoin: () => void;
  onRequest: () => void;
  onFollowToggle: () => void;
  notice?: string | null;
}

/**
 * JOIN is the hero action; FOLLOW stays secondary and never competes visually.
 */
export function CrewMembershipActions({
  crew,
  busy = false,
  onJoin,
  onRequest,
  onFollowToggle,
  notice,
}: CrewMembershipActionsProps): React.JSX.Element {
  const t = useThemeColors();
  const action = crewJoinAction(crew.joinMode, crew.viewer, crew.id);
  const label = crewJoinLabel(crew.joinMode, crew.viewer, crew.id);
  const following = crew.viewer.isFollowing;
  const reduced = useReducedMotion();
  const followScale = useSharedValue(1);
  const followAnim = useAnimatedStyle(() => ({ transform: [{ scale: followScale.value }] }));

  const primaryDisabled =
    busy || action === 'member' || action === 'pending' || action === 'blocked_other' || action === 'invite_only';

  const onPrimary = (): void => {
    if (action === 'join') onJoin();
    else if (action === 'request') onRequest();
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <GlowButton
          label={label}
          onPress={onPrimary}
          disabled={primaryDisabled}
          tone={action === 'member' ? 'glass' : 'light'}
          style={styles.join}
          accessibilityHint={
            action === 'blocked_other'
              ? 'You already belong to another competitive Crew'
              : action === 'invite_only'
                ? 'This Crew is invite only'
                : undefined
          }
        />
        {!crew.viewer.isMember ? (
          <Animated.View style={followAnim}>
            <Pressable
              onPress={() => {
                hapticTap();
                if (!reduced) {
                  followScale.value = withSequence(
                    withSpring(0.92, { damping: 14, stiffness: 420 }),
                    withSpring(1, { damping: 12, stiffness: 280 }),
                  );
                }
                onFollowToggle();
              }}
              disabled={busy}
              accessibilityRole="button"
              accessibilityState={{ selected: following }}
              accessibilityLabel={following ? 'Unfollow Crew' : 'Follow Crew'}
              style={[
                styles.follow,
                {
                  borderColor: t.borderStrong,
                  backgroundColor: following ? t.surfaceElevated : 'transparent',
                },
              ]}
            >
              <Text
                allowFontScaling={false}
                style={[styles.followLabel, { color: following ? t.textPrimary : t.textSecondary }]}
              >
                {following ? 'FOLLOWING' : 'FOLLOW'}
              </Text>
            </Pressable>
          </Animated.View>
        ) : null}
      </View>
      {notice ? (
        <Text allowFontScaling={false} style={[styles.notice, { color: t.textMuted }]}>
          {notice}
        </Text>
      ) : action === 'blocked_other' ? (
        <Text allowFontScaling={false} style={[styles.notice, { color: t.textMuted }]}>
          You already belong to a Crew. Leave it before joining another.
        </Text>
      ) : action === 'invite_only' ? (
        <Text allowFontScaling={false} style={[styles.notice, { color: t.textMuted }]}>
          Membership is by invitation — follow them while you wait.
        </Text>
      ) : action === 'pending' ? (
        <Text allowFontScaling={false} style={[styles.notice, { color: t.textMuted }]}>
          Request sent. Hang tight.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  join: { flex: 1 },
  follow: {
    minHeight: 48,
    paddingHorizontal: space.md,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followLabel: {
    ...typeScale.label,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  notice: { ...typeScale.meta, fontSize: 13, lineHeight: 18 },
});
