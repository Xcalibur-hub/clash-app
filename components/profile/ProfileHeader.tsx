import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { User } from '../../store';
import { HOOD_LABEL } from '../../data/hoods';
import { space, typeScale, useThemeColors } from '../../theme';
import { compact, formatReputation } from '../../utils/format';
import { tap as hapticTap } from '../../utils/haptics';
import { Avatar } from '../shared/Avatar';
import { GlowButton } from '../shared/GlowButton';
import { Underline } from '../shared/Doodles';
import { MoreIcon } from '../shared/icons';
import { ReputationBar } from './ReputationBar';
import { AppText } from '../shared/AppText';
import { EditorialStat } from '../shared/Editorial';

export interface ProfileHeaderProps {
  profile: User;
  isSelf: boolean;
  following: boolean;
  followerCount: number;
  followingCount: number;
  onEdit?: () => void;
  onToggleFollow?: () => void;
  onMore?: () => void;
}

/**
 * Editorial identity header — avatar, name, bio, follow, then reputation.
 * Stats use only real social counts (followers / following).
 * Clash record lives in the Clashes tab (User.clashes/wins are not hydrated).
 */
export function ProfileHeader({
  profile,
  isSelf,
  following,
  followerCount,
  followingCount,
  onEdit,
  onToggleFollow,
  onMore,
}: ProfileHeaderProps): React.JSX.Element {
  const t = useThemeColors();

  return (
    <View style={styles.wrap}>
      <View style={styles.identity}>
        <View style={styles.avatarRow}>
          <Avatar name={profile.name} tint={profile.tint} size={88} />
          <Pressable
            onPress={onMore}
            accessibilityRole="button"
            accessibilityLabel="More profile actions"
            hitSlop={8}
            style={styles.more}
          >
            <MoreIcon size={20} color={t.textMuted} strokeWidth={2.2} />
          </Pressable>
        </View>

        <AppText
          style={[styles.name, { color: t.textPrimary }]}
          numberOfLines={2}
          accessibilityRole="header"
        >
          {profile.name}
        </AppText>

        <View style={styles.handleRow}>
          <AppText style={[styles.handle, { color: t.textMuted }]} numberOfLines={1}>
            @{profile.handle}
          </AppText>
          <Underline size={64} opacity={0.22} color={t.textPrimary} style={styles.handleMark} />
        </View>

        {profile.bio ? (
          <Text style={[styles.bio, { color: t.textPrimary }]}>{profile.bio}</Text>
        ) : null}

        {profile.hood !== 'for-you' ? (
          <AppText style={[styles.hood, { color: t.textSecondary }]}>
            {HOOD_LABEL[profile.hood]}
          </AppText>
        ) : null}

        <View style={styles.actionRow}>
          {isSelf ? (
            <GlowButton
              label="Edit profile"
              tone="ink"
              compact
              onPress={onEdit ?? (() => undefined)}
            />
          ) : (
            <GlowButton
              label={following ? 'Following' : 'Follow'}
              tone={following ? 'ink' : 'light'}
              compact
              onPress={() => {
                hapticTap();
                onToggleFollow?.();
              }}
            />
          )}
        </View>
      </View>

      <ReputationBar reputation={profile.reputation} rank={profile.rank} streak={profile.streak} />

      <View style={[styles.social, { borderTopColor: t.border }]}>
        <EditorialStat value={compact(followerCount)} label="FOLLOWERS" />
        <View style={[styles.socialSeam, { backgroundColor: t.divider }]} />
        <EditorialStat value={compact(followingCount)} label="FOLLOWING" />
        {profile.reputation > 0 ? (
          <>
            <View style={[styles.socialSeam, { backgroundColor: t.divider }]} />
            <EditorialStat
              value={formatReputation(profile.reputation)}
              label="REPUTATION"
              tone={t.gold}
            />
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.lg },
  identity: { gap: space.sm, alignItems: 'flex-start' },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    width: '100%',
  },
  more: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  name: {
    ...typeScale.editorialLg,
    marginTop: space.sm,
  },
  handleRow: {
    position: 'relative',
    alignSelf: 'flex-start',
    paddingBottom: 5,
  },
  handle: { ...typeScale.meta, fontSize: 14 },
  handleMark: { position: 'absolute', bottom: -1, left: 0 },
  bio: { ...typeScale.body, marginTop: 2 },
  hood: { ...typeScale.meta },
  actionRow: { marginTop: space.xs },
  social: {
    flexDirection: 'row',
    // Blocker 2: three stats plus two hairline seams overflowed a narrow screen
    // once a long reputation numeral met a large OS text size. Wrapping keeps
    // every stat visible; `rowGap` separates the wrapped line without doubling
    // the seam.
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: space.lg,
    rowGap: space.sm,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  socialSeam: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', marginTop: 4 },
});
