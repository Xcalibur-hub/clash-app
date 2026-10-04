import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CommunityAccessType } from '../../../services/vaultCommunityMappers';
import { communityAccessLabel } from '../../../utils/vaultCommunityAccess';
import { layout, radius, space, typeScale, useThemeColors } from '../../../theme';
import { tap as hapticTap } from '../../../utils/haptics';
import { BackIcon } from '../../shared/icons';
import { CommunityMetaCard } from './CommunityMetaCard';

export interface CommunityHeroProps {
  name: string;
  description: string;
  accessType: CommunityAccessType;
  memberCount: number;
  activeToday: number;
  coverUrl?: string | null;
  tint?: string | null;
  onBack: () => void;
}

/** Immersive community header — creator atmosphere, name, access + activity. */
export function CommunityHero({
  name,
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
  const fallback = tint || (t.scheme === 'light' ? '#2C3340' : '#141418');

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
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.82)']} style={styles.scrim} />
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
            COMMUNITY
          </Text>
          <Text allowFontScaling={false} style={styles.name} numberOfLines={2}>
            {name}
          </Text>
          <Text allowFontScaling={false} style={styles.access}>
            {communityAccessLabel(accessType)}
          </Text>
        </View>
      </View>

      <CommunityMetaCard description={description} memberCount={memberCount} activeToday={activeToday} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 0 },
  hero: {
    aspectRatio: 16 / 11,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    borderBottomLeftRadius: radius.xxl,
    borderBottomRightRadius: radius.xxl,
    borderWidth: StyleSheet.hairlineWidth,
    borderTopWidth: 0,
  },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '70%' },
  back: {
    position: 'absolute',
    top: space.md,
    left: layout.screenX,
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(9,9,11,0.45)',
  },
  copy: { gap: 3, paddingBottom: space.lg, paddingHorizontal: layout.screenX + 2 },
  kind: { ...typeScale.caption, fontSize: 10, fontWeight: '800', letterSpacing: 1, color: 'rgba(255,255,255,0.78)' },
  name: { ...typeScale.display, fontSize: 32, lineHeight: 36, fontWeight: '800', letterSpacing: -1, color: '#FAFAF8' },
  access: { ...typeScale.caption, letterSpacing: 0.4, fontWeight: '600', color: 'rgba(250,250,248,0.72)' },
});
