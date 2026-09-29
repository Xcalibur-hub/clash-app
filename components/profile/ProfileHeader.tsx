import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { User } from '../../store';
import { HOOD_LABEL } from '../../data/hoods';
import { ink, space, typeScale } from '../../theme';
import { compact } from '../../utils/format';
import { tap as hapticTap } from '../../utils/haptics';
import { Avatar } from '../shared/Avatar';
import { GlowButton } from '../shared/GlowButton';
import { MoreIcon } from '../shared/icons';

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

/** Identity first: avatar, name, handle, bio, home Hood, counts and one action. */
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
  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        <Avatar name={profile.name} tint={profile.tint} size={72} />
        <View style={styles.names}>
          <Text allowFontScaling={false} style={styles.name} numberOfLines={1}>
            {profile.name}
          </Text>
          <Text allowFontScaling={false} style={styles.handle} numberOfLines={1}>
            @{profile.handle}
          </Text>
          <Text allowFontScaling={false} style={styles.rank}>
            {profile.rank} · {compact(profile.reputation)} reputation
          </Text>
        </View>
        <Pressable onPress={onMore} accessibilityRole="button" accessibilityLabel="More profile actions" hitSlop={8} style={styles.more}>
          <MoreIcon size={20} color={ink.tertiary} strokeWidth={2.2} />
        </Pressable>
      </View>

      {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
      {profile.hood !== 'for-you' ? <Text style={styles.hood}>{HOOD_LABEL[profile.hood]}</Text> : null}

      <View style={styles.counts}>
        <Text allowFontScaling={false} style={styles.count}>
          <Text style={styles.countValue}>{compact(followerCount)}</Text> followers
        </Text>
        <Text allowFontScaling={false} style={styles.count}>
          <Text style={styles.countValue}>{compact(followingCount)}</Text> following
        </Text>
      </View>

      {isSelf ? (
        <GlowButton label="Edit profile" tone="ink" compact onPress={onEdit ?? (() => undefined)} style={styles.action} />
      ) : (
        <GlowButton
          label={following ? 'Following' : 'Follow'}
          tone={following ? 'ink' : 'light'}
          compact
          onPress={() => {
            hapticTap();
            onToggleFollow?.();
          }}
          style={styles.action}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  names: { flex: 1, gap: 1 },
  name: { ...typeScale.title, color: ink.primary },
  handle: { ...typeScale.meta, color: ink.tertiary },
  rank: { ...typeScale.meta, fontSize: 13, color: ink.secondary },
  more: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'flex-end' },
  bio: { ...typeScale.body, color: ink.primary },
  hood: { ...typeScale.meta, color: ink.secondary },
  counts: { flexDirection: 'row', gap: space.lg },
  count: { ...typeScale.meta, color: ink.tertiary },
  countValue: { ...typeScale.label, color: ink.primary, fontWeight: '700' },
  action: { alignSelf: 'flex-start', marginTop: space.xs },
});
