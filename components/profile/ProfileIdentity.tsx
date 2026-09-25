import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { User } from '../../store';
import { ink, space, typeScale } from '../../theme';
import { compact } from '../../utils/format';
import { Avatar } from '../shared/Avatar';
import { Chip } from '../shared/Chip';
import { GlowButton } from '../shared/GlowButton';
import { CrownIcon, EditIcon } from '../shared/icons';

interface Stat {
  key: string;
  value: string;
  label: string;
}

export interface ProfileIdentityProps {
  viewer: User;
  /** Total takes the viewer has dropped — the first number of the stat row. */
  takesCount: number;
  onEdit: () => void;
}

/**
 * Social identity first (PRD §18): avatar, @handle, bio, a clean 3-stat row
 * and one Edit Profile action — people before statistics, no dashboard box.
 */
export function ProfileIdentity({
  viewer,
  takesCount,
  onEdit,
}: ProfileIdentityProps): React.JSX.Element {
  const stats: readonly Stat[] = [
    { key: 'takes', value: compact(takesCount), label: 'Takes' },
    { key: 'wins', value: compact(viewer.wins), label: 'Wins' },
    { key: 'rep', value: compact(viewer.reputation), label: 'Reputation' },
  ];

  return (
    <View style={s.hero}>
      <Avatar name={viewer.name} tint={viewer.tint} size={88} />
      <Text allowFontScaling={false} style={s.handle}>
        {`@${viewer.handle}`}
      </Text>
      <Chip label={viewer.rank.toUpperCase()} icon={CrownIcon} tone="gold" />
      {viewer.bio ? (
        <Text allowFontScaling={false} style={s.bio}>
          {viewer.bio}
        </Text>
      ) : null}
      <View style={s.stats}>
        {stats.map((stat) => (
          <View key={stat.key} style={s.stat}>
            <Text allowFontScaling={false} style={s.statValue}>
              {stat.value}
            </Text>
            <Text allowFontScaling={false} style={s.statLabel}>
              {stat.label.toUpperCase()}
            </Text>
          </View>
        ))}
      </View>
      <GlowButton
        label="EDIT PROFILE"
        icon={EditIcon}
        tone="glass"
        pill
        onPress={onEdit}
        accessibilityLabel="Edit your profile"
        style={s.edit}
      />
    </View>
  );
}

const s = StyleSheet.create({
  hero: { alignItems: 'center', gap: space.sm, paddingVertical: space.sm },
  handle: { ...typeScale.title, color: ink.primary },
  bio: { ...typeScale.body, color: ink.secondary, textAlign: 'center' },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    paddingHorizontal: space.sm,
    paddingVertical: space.md,
  },
  stat: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  statValue: { ...typeScale.cardTitle, color: ink.primary, fontWeight: '800' },
  statLabel: { ...typeScale.meta, color: ink.tertiary },
  edit: { alignSelf: 'stretch', marginTop: space.xs },
});
