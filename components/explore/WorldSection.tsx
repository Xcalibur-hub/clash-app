import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';
import { WorldIcon } from '../shared/icons';
import { PressableScale } from '../shared/PressableScale';
import { ExploreHeading } from './ExploreHeading';

/** Play / World missions entry — existing World navigation only. */
export function WorldSection(): React.JSX.Element {
  const router = useRouter();
  const t = useThemeColors();

  return (
    <View style={styles.section}>
      <ExploreHeading title="Play" />
      <PressableScale
        onPress={() => {
          hapticTap();
          router.push('/world');
        }}
        style={[
          styles.card,
          {
            backgroundColor: t.surface,
            borderColor: t.border,
            shadowColor: t.shadowColor,
            shadowOpacity: t.scheme === 'light' ? 0.08 : 0,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Open World missions"
      >
        <View style={[styles.iconWrap, { backgroundColor: t.surfaceMuted }]}>
          <WorldIcon size={20} color={t.textPrimary} strokeWidth={2.2} />
        </View>
        <View style={styles.copy}>
          <Text allowFontScaling={false} style={[styles.kicker, { color: t.accent }]}>
            MISSIONS
          </Text>
          <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
            This week’s missions
          </Text>
          <Text allowFontScaling={false} style={[styles.body, { color: t.textMuted }]}>
            Post a photo around an approximate area. No live tracking.
          </Text>
        </View>
        <Text allowFontScaling={false} style={[styles.cta, { color: t.textSecondary }]}>
          Explore →
        </Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.md },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, gap: 3 },
  kicker: {
    ...typeScale.caption,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.9,
  },
  title: { ...typeScale.label, fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  body: { ...typeScale.meta, fontSize: 12, lineHeight: 17 },
  cta: { ...typeScale.meta, fontSize: 12, fontWeight: '700' },
});
