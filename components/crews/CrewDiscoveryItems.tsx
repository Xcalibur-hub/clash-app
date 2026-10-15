import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import type { ArenaCrew } from '../../services/arenaCrewService';
import { layout, space, spring, typeScale, useTheme, useThemeColors } from '../../theme';
import { arenaAccentPalette } from '../../theme/arenaAccents';
import { crewAccentKeyFor, formatCrewMembers } from '../../utils/arenaCrewIdentity';
import { tap as hapticTap } from '../../utils/haptics';
import { CrewCrest } from './CrewCrest';

export interface CrewDiscoveryRowProps {
  crew: ArenaCrew;
  onPress: () => void;
  rising?: boolean;
}

/** Compact discovery row — crest, name, specialty, members. No card chrome. */
export function CrewDiscoveryRow({ crew, onPress, rising }: CrewDiscoveryRowProps): React.JSX.Element {
  const t = useThemeColors();
  const { scheme } = useTheme();
  const accent = arenaAccentPalette(scheme === 'light' ? 'light' : 'dark')[crewAccentKeyFor(crew)];
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const specialty = crew.specialties[0] ?? 'General';

  return (
    <Pressable
      onPress={() => {
        hapticTap();
        onPress();
      }}
      onPressIn={() => {
        if (!reduced) scale.value = withSpring(0.985, spring.press);
      }}
      onPressOut={() => {
        if (!reduced) scale.value = withSpring(1, spring.settle);
      }}
      accessibilityRole="button"
      accessibilityLabel={`${crew.name}, ${specialty}, ${formatCrewMembers(crew.memberCount)}`}
    >
      <Animated.View style={[styles.row, anim]}>
        <CrewCrest
          id={crew.id}
          name={crew.name}
          slug={crew.slug}
          specialties={crew.specialties}
          avatarUrl={crew.avatarUrl}
          size={48}
        />
        <View style={styles.meta}>
          <Text allowFontScaling={false} style={[styles.name, { color: t.textPrimary }]} numberOfLines={1}>
            {crew.name}
          </Text>
          <Text allowFontScaling={false} style={[styles.sub, { color: t.textMuted }]} numberOfLines={1}>
            {specialty}
            {' · '}
            {formatCrewMembers(crew.memberCount)}
            {rising ? ' · Rising' : ''}
            {crew.viewer.isMember ? ' · Yours' : ''}
          </Text>
        </View>
        {crew.streak >= 2 ? (
          <Text allowFontScaling={false} style={[styles.streak, { color: accent.ink }]}>
            {crew.streak} streak
          </Text>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

export interface CrewFeaturedProps {
  crew: ArenaCrew;
  onPress: () => void;
}

/** Prominent featured Crew — identity first, light stats. */
export function CrewFeatured({ crew, onPress }: CrewFeaturedProps): React.JSX.Element {
  const t = useThemeColors();
  const { scheme } = useTheme();
  const accent = arenaAccentPalette(scheme === 'light' ? 'light' : 'dark')[crewAccentKeyFor(crew)];
  const specialty = crew.specialties[0] ?? 'General';

  return (
    <Pressable
      onPress={() => {
        hapticTap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`Featured Crew ${crew.name}`}
      style={[styles.featured, { borderBottomColor: t.border }]}
    >
      <View style={[styles.featuredBleed, { backgroundColor: accent.soft }]} />
      <View style={styles.featuredBody}>
        <CrewCrest
          id={crew.id}
          name={crew.name}
          slug={crew.slug}
          specialties={crew.specialties}
          avatarUrl={crew.avatarUrl}
          size={72}
        />
        <View style={styles.featuredMeta}>
          <Text allowFontScaling={false} style={[styles.featuredEyebrow, { color: accent.ink }]}>
            MAKE YOUR CREW FAMOUS
          </Text>
          <Text allowFontScaling={false} style={[styles.featuredName, { color: t.textPrimary }]} numberOfLines={1}>
            {crew.name}
          </Text>
          <Text allowFontScaling={false} style={[styles.sub, { color: t.textSecondary }]} numberOfLines={2}>
            {crew.bio.trim() || `${specialty} Crew · ${formatCrewMembers(crew.memberCount)}`}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: layout.screenX,
    paddingVertical: 12,
  },
  meta: { flex: 1, gap: 2 },
  name: { ...typeScale.cardTitle, fontSize: 16, letterSpacing: -0.3 },
  sub: { ...typeScale.meta, fontSize: 13 },
  streak: { ...typeScale.meta, fontSize: 12, fontWeight: '700' },
  featured: {
    paddingHorizontal: layout.screenX,
    paddingTop: space.md,
    paddingBottom: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  featuredBleed: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.55,
  },
  featuredBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  featuredMeta: { flex: 1, gap: 4 },
  featuredEyebrow: {
    ...typeScale.meta,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  featuredName: {
    ...typeScale.title,
    fontSize: 22,
    letterSpacing: -0.6,
    fontWeight: '800',
  },
});
