import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CommunityAccessType } from '../../../services/vaultCommunityMappers';
import { communityAccessLabel } from '../../../utils/vaultCommunityAccess';
import { communityActiveLabel, communityMemberLabel } from '../../../utils/vaultCommunityFeed';
import { duration, layout, radius, space, typeScale, useThemeColors } from '../../../theme';
import { tap as hapticTap } from '../../../utils/haptics';
import { BackIcon } from '../../shared/icons';
import { MemberConstellation } from '../world/MemberConstellation';

export interface CommunityHeroProps {
  name: string;
  creatorName?: string | null;
  description: string;
  accessType: CommunityAccessType;
  memberCount: number;
  activeToday: number;
  coverUrl?: string | null;
  tint?: string | null;
  onBack: () => void;
}

/** The community as a private room: creator atmosphere, name, faces, activity. */
export function CommunityHero({
  name,
  creatorName,
  description,
  accessType,
  memberCount,
  activeToday,
  coverUrl,
  tint,
  onBack,
}: CommunityHeroProps): React.JSX.Element {
  const t = useThemeColors();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const fallback = tint || (t.scheme === 'light' ? '#2C3340' : '#141418');
  const firstName = creatorName ? creatorName.trim().split(' ')[0] : null;

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.hero,
          {
            marginHorizontal: -layout.screenX,
            backgroundColor: fallback,
            borderColor: t.scheme === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)',
          },
        ]}
      >
        {coverUrl ? (
          <Image source={{ uri: coverUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <LinearGradient
            colors={[fallback, t.scheme === 'light' ? '#D8D2C8' : '#0E0E12']}
            style={StyleSheet.absoluteFill}
          />
        )}
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.86)']} style={styles.scrim} />
        <Pressable
          onPress={() => {
            hapticTap();
            onBack();
          }}
          style={[styles.back, { top: insets.top + space.xs }]}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <BackIcon size={18} color="#FAFAF8" strokeWidth={2.2} />
        </Pressable>
        <View style={styles.copy}>
          <Text allowFontScaling={false} style={styles.kind}>
            {firstName ? `THE ROOM · ${firstName.toUpperCase()}` : 'COMMUNITY'}
          </Text>
          <Text allowFontScaling={false} style={styles.name} numberOfLines={2}>
            {name}
          </Text>
          <Text allowFontScaling={false} style={styles.access}>
            {communityAccessLabel(accessType)}
          </Text>
        </View>
      </View>

      <Animated.View entering={reduced ? undefined : FadeInUp.duration(duration.base)} style={styles.overlap}>
        {description ? (
          <Text allowFontScaling={false} style={[styles.desc, { color: t.textSecondary }]} numberOfLines={3}>
            {description}
          </Text>
        ) : null}
        <View style={styles.room}>
          <MemberConstellation anonymousCount={memberCount} tint={tint} total={memberCount} size={32} />
        </View>
        <View style={styles.metaRow}>
          <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]}>
            {communityMemberLabel(memberCount)}
          </Text>
          <Text allowFontScaling={false} style={[styles.dot, { color: t.textMuted }]}>
            ·
          </Text>
          <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]}>
            {communityActiveLabel(activeToday)}
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 0 },
  hero: { aspectRatio: 16 / 11, justifyContent: 'flex-end', overflow: 'hidden', borderBottomLeftRadius: 18, borderBottomRightRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderTopWidth: 0 },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '70%' },
  back: { position: 'absolute', left: layout.screenX, width: 40, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(9,9,11,0.45)' },
  copy: { gap: 3, paddingBottom: space.lg, paddingHorizontal: layout.screenX + 2 },
  kind: { ...typeScale.caption, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, color: 'rgba(255,255,255,0.8)' },
  name: { ...typeScale.display, fontSize: 32, lineHeight: 35, fontWeight: '800', letterSpacing: -1, color: '#FAFAF8' },
  access: { ...typeScale.caption, letterSpacing: 0.4, fontWeight: '600', color: 'rgba(250,250,248,0.72)' },
  overlap: { marginTop: space.md, paddingLeft: space.md, borderLeftWidth: 2, borderLeftColor: 'rgba(127,127,127,0.35)', gap: 6 },
  desc: { ...typeScale.meta, fontSize: 13, lineHeight: 18 },
  room: { marginTop: space.xs },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { ...typeScale.caption, fontSize: 12, fontWeight: '600' },
  dot: { ...typeScale.caption, fontSize: 12 },
});