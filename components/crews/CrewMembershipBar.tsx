import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ArenaCrew } from '../../services/arenaCrewService';
import { crewJoinAction, crewJoinLabel } from '../../utils/arenaCrewIdentity';
import { radius, space, typeScale, useThemeColors } from '../../theme';

export interface CrewMembershipBarProps {
  crew: ArenaCrew;
  activeCrewId: string | null;
  hasPendingRequest: boolean;
  signedIn: boolean;
  busy: boolean;
  onSignIn: () => void;
  onJoin: () => void;
  onRequest: () => void;
  onLeave: () => void;
  onFollow: () => void;
  onUnfollow: () => void;
}

/** Role-aware membership CTAs — never invent permissions the RPC will reject. */
export function CrewMembershipBar({
  crew,
  activeCrewId,
  hasPendingRequest,
  signedIn,
  busy,
  onSignIn,
  onJoin,
  onRequest,
  onLeave,
  onFollow,
  onUnfollow,
}: CrewMembershipBarProps): React.JSX.Element {
  const t = useThemeColors();
  const action = crewJoinAction(
    crew.joinMode,
    { isMember: crew.viewer.isMember, hasPendingRequest, activeCrewId },
    crew.id,
  );
  const label = crewJoinLabel(
    crew.joinMode,
    { isMember: crew.viewer.isMember, hasPendingRequest, activeCrewId },
    crew.id,
  );

  if (!signedIn) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Sign in to join Crews"
        disabled={busy}
        onPress={onSignIn}
        style={[styles.primary, { backgroundColor: t.textPrimary }]}
      >
        <Text style={[styles.primaryText, { color: t.background }]}>Sign in to join</Text>
      </Pressable>
    );
  }

  if (busy) {
    return (
      <View style={[styles.primary, { backgroundColor: t.surfaceMuted }]}>
        <ActivityIndicator color={t.textPrimary} />
      </View>
    );
  }

  if (action === 'member') {
    return (
      <View style={styles.row}>
        <View style={[styles.chip, { borderColor: t.border }]}>
          <Text style={[styles.chipText, { color: t.textPrimary }]}>
            {crew.viewer.role === 'OWNER'
              ? 'Owner'
              : crew.viewer.role === 'MODERATOR'
                ? 'Moderator'
                : 'Member'}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Leave Crew"
          onPress={onLeave}
          style={[styles.secondary, { borderColor: t.border }]}
        >
          <Text style={[styles.secondaryText, { color: t.textPrimary }]}>Leave</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.col}>
      {action === 'join' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={onJoin}
          style={[styles.primary, { backgroundColor: t.textPrimary }]}
        >
          <Text style={[styles.primaryText, { color: t.background }]}>{label}</Text>
        </Pressable>
      ) : null}
      {action === 'request' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={onRequest}
          style={[styles.primary, { backgroundColor: t.textPrimary }]}
        >
          <Text style={[styles.primaryText, { color: t.background }]}>{label}</Text>
        </Pressable>
      ) : null}
      {action === 'pending' ? (
        <View style={[styles.chip, { borderColor: t.border }]}>
          <Text style={[styles.chipText, { color: t.textPrimary }]}>Request pending</Text>
        </View>
      ) : null}
      {action === 'blocked_other' ? (
        <Text style={[styles.hint, { color: t.textMuted }]}>
          You already belong to another Crew. Leave it before joining this one.
        </Text>
      ) : null}
      {action === 'invite_only' ? (
        <Text style={[styles.hint, { color: t.textMuted }]}>
          Invite only — wait for an owner or moderator invite.
        </Text>
      ) : null}
      {!crew.viewer.isMember ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={crew.viewer.isFollowing ? 'Unfollow Crew' : 'Follow Crew'}
          onPress={crew.viewer.isFollowing ? onUnfollow : onFollow}
          style={[styles.secondary, { borderColor: t.border }]}
        >
          <Text style={[styles.secondaryText, { color: t.textPrimary }]}>
            {crew.viewer.isFollowing ? 'Unfollow' : 'Follow'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  col: { gap: space.sm },
  primary: {
    minHeight: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  primaryText: { ...typeScale.label, fontWeight: '700' },
  secondary: {
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  secondaryText: { ...typeScale.label, fontWeight: '600' },
  chip: {
    minHeight: 36,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    justifyContent: 'center',
  },
  chipText: { ...typeScale.caption, fontWeight: '600' },
  hint: { ...typeScale.caption, flex: 1 },
});
