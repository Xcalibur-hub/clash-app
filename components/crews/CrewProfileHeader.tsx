import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import type { ArenaCrew, ArenaCrewMember } from '../../services/arenaCrewService';
import { Avatar } from '../shared/Avatar';
import { layout, space, typeScale, useTheme, useThemeColors } from '../../theme';
import { arenaAccentPalette } from '../../theme/arenaAccents';
import {
  crewAccentKeyFor,
  crewStatusChips,
  formatCrewMembers,
} from '../../utils/arenaCrewIdentity';
import { withAlpha } from '../../utils/color';
import { CrewCrest } from './CrewCrest';
import { CrewMembershipActions } from './CrewMembershipActions';

export const CREW_PROFILE_BANNER_H = 168;
export const CREW_PROFILE_HEADER_EXPAND = 280;

export interface CrewProfileHeaderProps {
  crew: ArenaCrew;
  members: ArenaCrewMember[];
  scrollY: SharedValue<number>;
  topInset: number;
  busy?: boolean;
  notice?: string | null;
  onJoin: () => void;
  onRequest: () => void;
  onFollowToggle: () => void;
  onOpenMember: (profileId: string) => void;
}

/** Large identity that collapses into a compact nav crest + name. */
export function CrewProfileHeader({
  crew,
  members,
  scrollY,
  topInset,
  busy,
  notice,
  onJoin,
  onRequest,
  onFollowToggle,
  onOpenMember,
}: CrewProfileHeaderProps): React.JSX.Element {
  const t = useThemeColors();
  const { scheme } = useTheme();
  const accent = arenaAccentPalette(scheme === 'light' ? 'light' : 'dark')[crewAccentKeyFor(crew)];
  const chips = crewStatusChips(crew);

  const heroStyle = useAnimatedStyle(() => {
    const y = scrollY.value;
    return {
      opacity: interpolate(y, [0, 120], [1, 0], Extrapolation.CLAMP),
      transform: [
        {
          translateY: interpolate(y, [0, 160], [0, -36], Extrapolation.CLAMP),
        },
      ],
    };
  });

  const compactStyle = useAnimatedStyle(() => {
    const y = scrollY.value;
    return {
      opacity: interpolate(y, [90, 140], [0, 1], Extrapolation.CLAMP),
      transform: [
        {
          translateY: interpolate(y, [90, 140], [8, 0], Extrapolation.CLAMP),
        },
      ],
    };
  });

  return (
    <View>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.compactBar,
          { paddingTop: topInset + 6, backgroundColor: withAlpha(t.background, 0.92) },
          compactStyle,
        ]}
      >
        <CrewCrest
          id={crew.id}
          name={crew.name}
          slug={crew.slug}
          specialties={crew.specialties}
          avatarUrl={crew.avatarUrl}
          size={28}
        />
        <Text allowFontScaling={false} style={[styles.compactName, { color: t.textPrimary }]} numberOfLines={1}>
          {crew.name}
        </Text>
      </Animated.View>

      <Animated.View style={heroStyle}>
        <View style={[styles.banner, { backgroundColor: accent.deep }]}>
          {crew.bannerUrl ? (
            <Image source={{ uri: crew.bannerUrl }} style={StyleSheet.absoluteFillObject} />
          ) : (
            <View style={[styles.bannerFallback, { backgroundColor: accent.soft }]} />
          )}
          <View style={[styles.bannerScrim, { backgroundColor: withAlpha(t.background, 0.35) }]} />
        </View>

        <View style={[styles.identity, { paddingHorizontal: layout.screenX }]}>
          <CrewCrest
            id={crew.id}
            name={crew.name}
            slug={crew.slug}
            specialties={crew.specialties}
            avatarUrl={crew.avatarUrl}
            size={88}
          />
          <Text allowFontScaling={false} style={[styles.name, { color: t.textPrimary }]}>
            {crew.name}
          </Text>
          <Text allowFontScaling={false} style={[styles.handle, { color: t.textMuted }]}>
            @{crew.slug}
          </Text>
          {crew.bio.trim() ? (
            <Text allowFontScaling={false} style={[styles.bio, { color: t.textSecondary }]}>
              {crew.bio.trim()}
            </Text>
          ) : null}

          <View style={styles.chips}>
            {chips.map((chip) => (
              <Text
                key={chip}
                allowFontScaling={false}
                style={[styles.chip, { color: t.textSecondary, borderColor: t.border }]}
              >
                {chip}
              </Text>
            ))}
          </View>

          <Text allowFontScaling={false} style={[styles.stats, { color: t.textMuted }]}>
            {formatCrewMembers(crew.memberCount)}
            {crew.wins + crew.losses > 0
              ? ` · ${crew.wins}–${crew.losses}`
              : ''}
            {crew.streak >= 2 ? ` · ${crew.streak}-win streak` : ''}
          </Text>

          <View style={styles.actions}>
            <CrewMembershipActions
              crew={crew}
              busy={busy}
              notice={notice}
              onJoin={onJoin}
              onRequest={onRequest}
              onFollowToggle={onFollowToggle}
            />
          </View>
        </View>
      </Animated.View>

      {members.length > 0 ? (
        <View style={[styles.members, { borderTopColor: t.border }]}>
          <Text allowFontScaling={false} style={[styles.membersTitle, { color: t.textSecondary }]}>
            MEMBERS
          </Text>
          {members.map((m) => (
            <Pressable
              key={m.profileId}
              onPress={() => onOpenMember(m.profileId)}
              accessibilityRole="button"
              accessibilityLabel={`${m.name}, ${m.role}`}
              style={styles.memberRow}
            >
              <Avatar name={m.name} tint={m.tint} size={40} />
              <View style={styles.memberMeta}>
                <Text allowFontScaling={false} style={[styles.memberName, { color: t.textPrimary }]} numberOfLines={1}>
                  {m.name}
                </Text>
                <Text allowFontScaling={false} style={[styles.memberHandle, { color: t.textMuted }]} numberOfLines={1}>
                  @{m.handle}
                  {m.role === 'OWNER' ? ' · Owner' : m.role === 'MODERATOR' ? ' · Mod' : ''}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  compactBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: layout.screenX,
    paddingBottom: 10,
  },
  compactName: {
    ...typeScale.cardTitle,
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  banner: {
    height: CREW_PROFILE_BANNER_H,
    overflow: 'hidden',
  },
  bannerFallback: {
    ...StyleSheet.absoluteFillObject,
  },
  bannerScrim: {
    ...StyleSheet.absoluteFillObject,
  },
  identity: {
    marginTop: -44,
    gap: space.sm,
    paddingBottom: space.lg,
  },
  name: {
    ...typeScale.title,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.8,
    marginTop: space.sm,
  },
  handle: { ...typeScale.meta, fontSize: 14 },
  bio: { ...typeScale.body, fontSize: 15, lineHeight: 22, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: space.xs },
  chip: {
    ...typeScale.meta,
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  stats: { ...typeScale.meta, fontSize: 13, marginTop: 2 },
  actions: { marginTop: space.sm },
  members: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: space.lg,
    paddingHorizontal: layout.screenX,
    gap: 4,
    paddingBottom: space.md,
  },
  membersTitle: {
    ...typeScale.meta,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    marginBottom: space.sm,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: 10,
  },
  memberMeta: { flex: 1, gap: 2 },
  memberName: { ...typeScale.cardTitle, fontSize: 15 },
  memberHandle: { ...typeScale.meta, fontSize: 13 },
});
