import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowUpRight, Hash, Users } from 'lucide-react-native';
import type { ArenaCrew } from '../../../services/arenaCrewService';
import { crewCrestInitials, crewJoinModeLabel } from '../../../utils/arenaCrewIdentity';
import { useThemeColors } from '../../../theme';
export function GroupMark({
  crew,
  size = 52
}: {
  crew: ArenaCrew;
  size?: number;
}): React.JSX.Element {
  const t = useThemeColors();
  return <View style={[styles.mark, {
    width: size,
    height: size,
    backgroundColor: t.surfaceElevated,
    borderColor: t.border
  }]}>
    {crew.avatarUrl ? <Image source={{
      uri: crew.avatarUrl
    }} style={{
      width: size,
      height: size
    }} accessibilityIgnoresInvertColors /> : <Text style={{
      color: t.textPrimary,
      fontSize: size * 0.34,
      fontWeight: '800'
    }}>{crewCrestInitials(crew.name)}</Text>}
  </View>;
}
export function GroupSpecialties({
  crew
}: {
  crew: ArenaCrew;
}): React.JSX.Element {
  const t = useThemeColors();
  return <View style={styles.tags}>{crew.specialties.map(tag => <View key={tag} style={[styles.tag, {
      backgroundColor: t.surfaceElevated
    }]}>
    <Hash size={11} color={t.textMuted} /><Text style={[styles.tagText, {
        color: t.textSecondary
      }]}>{tag}</Text>
  </View>)}</View>;
}
export function GroupCard({
  crew,
  onPress,
  featured = false
}: {
  crew: ArenaCrew;
  onPress: () => void;
  featured?: boolean;
}): React.JSX.Element {
  const t = useThemeColors();
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open ${crew.name}`} onPress={onPress} style={({
    pressed
  }) => [styles.card, {
    backgroundColor: featured ? t.surfaceElevated : t.surface,
    borderColor: t.border,
    opacity: pressed ? 0.75 : 1
  }]}>
    <View style={styles.row}><GroupMark crew={crew} size={featured ? 60 : 48} /><View style={styles.flex}>
      <Text style={[styles.name, {
          color: t.textPrimary
        }]}>{crew.name}</Text><Text style={[styles.handle, {
          color: t.textMuted
        }]}>g/{crew.slug}</Text>
    </View><ArrowUpRight size={19} color={t.textMuted} /></View>
    {crew.viewer.isMember || crew.viewer.isFollowing ? <Text style={[styles.status, {
      color: t.textSecondary
    }]}>{crew.viewer.isMember ? 'JOINED' : 'FOLLOWING'}</Text> : null}
    {crew.bio ? <Text numberOfLines={featured ? 4 : 3} style={[styles.bio, {
      color: t.textSecondary
    }]}>{crew.bio}</Text> : null}
    <GroupSpecialties crew={crew} />
    <View style={[styles.footer, {
      borderColor: t.border
    }]}><Users size={14} color={t.textMuted} />
      <Text style={[styles.meta, {
        color: t.textSecondary
      }]}>{crew.memberCount.toLocaleString()} {crew.memberCount === 1 ? 'member' : 'members'}</Text>
      <View style={styles.flex} /><Text style={[styles.meta, {
        color: t.textMuted
      }]}>{crewJoinModeLabel(crew.joinMode)}</Text>
    </View>
  </Pressable>;
}
const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 24,
    padding: 20,
    gap: 14
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14
  },
  flex: {
    flex: 1,
    minWidth: 0
  },
  mark: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center'
  },
  name: {
    fontSize: 21,
    fontWeight: '700',
    letterSpacing: -0.6
  },
  handle: {
    fontSize: 12,
    marginTop: 4
  },
  status: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.6
  },
  bio: {
    fontSize: 14,
    lineHeight: 21
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8
  },
  tagText: {
    fontSize: 11,
    fontWeight: '500'
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 13
  },
  meta: {
    fontSize: 11
  }
});
