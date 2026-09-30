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

        <Text allowFontScaling={false} style={[styles.name, { color: t.textPrimary }]} numberOfLines={2}>
          {profile.name}
        </Text>

        <View style={styles.handleRow}>
          <Text allowFontScaling={false} style={[styles.handle, { color: t.textMuted }]} numberOfLines={1}>
            @{profile.handle}
          </Text>
          <Underline size={64} opacity={0.22} color={t.textPrimary} style={styles.handleMark} />
        </View>

        {profile.bio ? (
          <Text style={[styles.bio, { color: t.textPrimary }]}>{profile.bio}</Text>
        ) : null}

        {profile.hood !== 'for-you' ? (
          <Text allowFontScaling={false} style={[styles.hood, { color: t.textSecondary }]}>
            {HOOD_LABEL[profile.hood]}
          </Text>
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
        <Text allowFontScaling={false} style={[styles.socialText, { color: t.textMuted }]}>
          <Text style={[styles.socialValue, { color: t.textPrimary }]}>{compact(followerCount)}</Text>
          {'  followers'}
        </Text>
        <Text allowFontScaling={false} style={[styles.socialDot, { color: t.textMuted }]}>
          ·
        </Text>
        <Text allowFontScaling={false} style={[styles.socialText, { color: t.textMuted }]}>
          <Text style={[styles.socialValue, { color: t.textPrimary }]}>{compact(followingCount)}</Text>
          {'  following'}
        </Text>
        {profile.reputation > 0 ? (
          <>
            <Text allowFontScaling={false} style={[styles.socialDot, { color: t.textMuted }]}>
              ·
            </Text>
            <Text allowFontScaling={false} style={[styles.socialText, { color: t.textMuted }]}>
              <Text style={[styles.socialValue, { color: t.textPrimary }]}>
                {formatReputation(profile.reputation)}
              </Text>
              {'  rep'}
            </Text>
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
    ...typeScale.title,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.6,
    marginTop: space.xs,
  },
  handleRow: {
    position: 'relative',
    alignSelf: 'flex-start',
    paddingBottom: 5,
  },
  handle: { ...typeScale.meta, fontSize: 15 },
  handleMark: { position: 'absolute', bottom: -1, left: 0 },
  bio: { ...typeScale.body, marginTop: 2 },
  hood: { ...typeScale.meta },
  actionRow: { marginTop: space.xs },
  social: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  socialText: { ...typeScale.meta },
  socialValue: { ...typeScale.label, fontWeight: '600' },
  socialDot: { ...typeScale.meta },
});
