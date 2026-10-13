import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';

/**
 * Arena V2 editorial Daily Drop masthead.
 * A visual entry into the real Clashes mode; never invents live counts or events.
 */
export function ArenaDailyDropBanner({
  liveCount,
  onExploreClashes,
}: {
  liveCount: number;
  onExploreClashes: () => void;
}): React.JSX.Element {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const dark = t.scheme === 'dark';
  const bg = dark ? '#342C3B' : '#F8D56D';
  const ink = dark ? '#F9F2E8' : '#221B23';
  const motif = dark ? '#B69BD8' : '#F16D54';
  const buttonBg = dark ? '#F3E5C9' : '#241D21';
  const buttonInk = dark ? '#231E24' : '#FFF8ED';
  const count = Math.max(0, liveCount);
  const label = count > 0 ? `${count} active ${count === 1 ? 'Clash' : 'Clashes'}` : 'Discover the debates';

  return (
    <Animated.View
      entering={reduced ? undefined : FadeInDown.duration(380).springify().damping(19)}
      style={styles.outer}
    >
      <Pressable
        onPress={() => {
          hapticTap();
          onExploreClashes();
        }}
        accessibilityRole="button"
        accessibilityLabel="Explore Arena Clashes"
        accessibilityHint="Opens the Clashes section"
        style={[styles.card, { backgroundColor: bg }]}
      >
        <View pointerEvents="none" style={[styles.orbit, { borderColor: motif }]} />
        <View pointerEvents="none" style={[styles.orbitInner, { backgroundColor: motif }]} />
        <Text pointerEvents="none" style={[styles.asterisk, { color: ink }]}>✳</Text>

        <View style={styles.content}>
          <View style={styles.eyebrowRow}>
            <View style={[styles.liveDot, { backgroundColor: motif }]} />
            <Text style={[styles.eyebrow, { color: ink }]}>THE DAILY DROP</Text>
          </View>
          <Text
            allowFontScaling
            maxFontSizeMultiplier={1.3}
            style={[styles.headline, { color: ink }]}
          >
            Opinions{'\n'}will fly.
          </Text>
          <View style={[styles.cta, { backgroundColor: buttonBg }]}>
            <Text style={[styles.ctaText, { color: buttonInk }]}>
              {label}  ↗
            </Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const systemFont = Platform.select({
  ios: 'System',
  android: 'sans-serif',
  default: 'System',
});

const styles = StyleSheet.create({
  outer: {
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 16,
  },
  card: {
    minHeight: 198,
    borderRadius: 26,
    overflow: 'hidden',
    position: 'relative',
  },
  content: {
    paddingTop: 22,
    paddingBottom: 22,
    paddingHorizontal: 21,
    minHeight: 198,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  eyebrow: {
    fontFamily: systemFont,
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 1.1,
  },
  headline: {
    fontFamily: systemFont,
    fontWeight: '900',
    fontSize: 37,
    lineHeight: 41,
    letterSpacing: -1.5,
    marginVertical: 12,
  },
  cta: { paddingHorizontal: 15, paddingVertical: 10, borderRadius: 18 },
  ctaText: { fontFamily: systemFont, fontSize: 12, fontWeight: '800' },
  orbit: {
    position: 'absolute',
    right: -41,
    top: -45,
    width: 196,
    height: 196,
    borderRadius: 98,
    borderWidth: 21,
    opacity: 0.62,
  },
  orbitInner: {
    position: 'absolute',
    right: 25,
    top: 20,
    width: 68,
    height: 68,
    borderRadius: 34,
    opacity: 0.5,
  },
  asterisk: {
    position: 'absolute',
    right: 4,
    top: 30,
    fontSize: 96,
    lineHeight: 108,
    opacity: 0.84,
  },
});
