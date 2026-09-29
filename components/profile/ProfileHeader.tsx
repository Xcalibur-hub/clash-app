import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { User } from '../../store';
import { HOOD_LABEL } from '../../data/hoods';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { compact } from '../../utils/format';
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

/** Identity first: avatar, name, handle, reputation, Clash record, social counts. */
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
  const winRate =
    profile.clashes > 0 ? Math.round((profile.wins / profile.clashes) * 100) : null;

  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        <Avatar name={profile.name} tint={profile.tint} size={80} />
        <View style={styles.names}>
          <Text allowFontScaling={false} style={[styles.name, { color: t.textPrimary }]} numberOfLines={1}>
            {profile.name}
          </Text>
          <View style={styles.handleRow}>
            <Text allowFontScaling={false} style={[styles.handle, { color: t.textMuted }]} numberOfLines={1}>
              @{profile.handle}
            </Text>
            <Underline size={56} opacity={0.28} color={t.textPrimary} style={styles.handleMark} />
          </View>
          <Text allowFontScaling={false} style={[styles.rank, { color: t.accent }]}>
            {profile.rank}
            {profile.streak > 0 ? ` · ${profile.streak} streak` : ''}
          </Text>
        </View>
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

      {profile.bio ? <Text style={[styles.bio, { color: t.textPrimary }]}>{profile.bio}</Text> : null}
      {profile.hood !== 'for-you' ? (
        <Text style={[styles.hood, { color: t.textSecondary }]}>{HOOD_LABEL[profile.hood]}</Text>
      ) : null}

      <View style={[styles.record, { borderColor: t.border, backgroundColor: t.surfaceMuted }]}>
        <RecordCell label="Clashes" value={compact(profile.clashes)} valueColor={t.textPrimary} labelColor={t.textMuted} />
        <RecordCell label="Wins" value={compact(profile.wins)} valueColor={t.accent} labelColor={t.textMuted} />
        <RecordCell
          label="Win rate"
          value={winRate !== null ? `${winRate}%` : '—'}
          valueColor={t.textPrimary}
          labelColor={t.textMuted}
        />
        <RecordCell label="Rep" value={compact(profile.reputation)} valueColor={t.textPrimary} labelColor={t.textMuted} />
      </View>

      <ReputationBar reputation={profile.reputation} />

      <View style={styles.counts}>
        <Text allowFontScaling={false} style={[styles.count, { color: t.textMuted }]}>
          <Text style={[styles.countValue, { color: t.textPrimary }]}>{compact(followerCount)}</Text> followers
        </Text>
        <Text allowFontScaling={false} style={[styles.count, { color: t.textMuted }]}>
          <Text style={[styles.countValue, { color: t.textPrimary }]}>{compact(followingCount)}</Text> following
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

function RecordCell({
  label,
  value,
  valueColor,
  labelColor,
}: {
  label: string;
  value: string;
  valueColor: string;
  labelColor: string;
}): React.JSX.Element {
  return (
    <View style={styles.cell} accessibilityLabel={`${label} ${value}`}>
      <Text allowFontScaling={false} style={[styles.cellValue, { color: valueColor }]}>
        {value}
      </Text>
      <Text allowFontScaling={false} style={[styles.cellLabel, { color: labelColor }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  names: { flex: 1, gap: 3 },
  name: { ...typeScale.title, fontSize: 24, fontWeight: '800', letterSpacing: -0.4 },
  handleRow: { position: 'relative', alignSelf: 'flex-start', paddingBottom: 4 },
  handle: { ...typeScale.meta, fontSize: 14 },
  handleMark: { position: 'absolute', bottom: -2, left: 0 },
  rank: { ...typeScale.meta, fontSize: 13, fontWeight: '600' },
  more: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'flex-end' },
  bio: { ...typeScale.body },
  hood: { ...typeScale.meta },
  record: {
    flexDirection: 'row',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: space.md,
  },
  cell: { flex: 1, alignItems: 'center', gap: 2 },
  cellValue: { ...typeScale.label, fontSize: 17, fontWeight: '800' },
  cellLabel: { ...typeScale.caption, fontSize: 10, letterSpacing: 0.3 },
  counts: { flexDirection: 'row', gap: space.lg },
  count: { ...typeScale.meta },
  countValue: { ...typeScale.label, fontWeight: '700' },
  action: { alignSelf: 'flex-start', marginTop: space.xs },
});
