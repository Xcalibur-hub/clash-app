import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInUp, ZoomIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { notify as hapticNotify } from '../../utils/haptics';

export function GiftReveal({
  label,
  rewardType,
  onClaim,
  claiming,
  claimed,
}: {
  label: string;
  rewardType: string;
  onClaim: () => void;
  claiming: boolean;
  claimed: boolean;
}): React.JSX.Element {
  const t = useThemeColors();

  React.useEffect(() => {
    hapticNotify('success');
  }, []);

  return (
    <Animated.View entering={FadeIn.duration(420)} style={styles.root}>
      <LinearGradient
        colors={['#1A1712', '#2A2418', '#121214']}
        style={StyleSheet.absoluteFill}
      />
      <Animated.Text entering={FadeInUp.delay(80)} allowFontScaling={false} style={styles.kicker}>
        YOU FOUND IT
      </Animated.Text>
      <Animated.View entering={ZoomIn.delay(160).springify()} style={styles.gift}>
        <LinearGradient colors={['#E8D5A3', '#B8954A']} style={styles.giftInner}>
          <Text allowFontScaling={false} style={styles.giftMark}>
            ✦
          </Text>
        </LinearGradient>
      </Animated.View>
      <Animated.Text entering={FadeInUp.delay(220)} allowFontScaling={false} style={styles.title}>
        {label}
      </Animated.Text>
      <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]}>
        {rewardType.replace(/_/g, ' ')}
      </Text>
      <Pressable
        onPress={onClaim}
        disabled={claiming || claimed}
        style={[styles.claim, { opacity: claiming ? 0.6 : 1 }]}
        accessibilityRole="button"
        accessibilityLabel={claimed ? 'Reward claimed' : 'Claim reward'}
      >
        <Text allowFontScaling={false} style={styles.claimLabel}>
          {claimed ? 'Claimed' : claiming ? 'Claiming…' : 'Claim'}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    paddingVertical: space.xl,
    paddingHorizontal: space.lg,
    alignItems: 'center',
    gap: space.sm,
    minHeight: 320,
    justifyContent: 'center',
  },
  kicker: {
    color: 'rgba(255,255,255,0.55)',
    fontFamily: typeScale.caption.fontFamily,
    fontSize: 12,
    letterSpacing: 2.4,
    fontWeight: '700',
  },
  gift: {
    marginVertical: space.md,
  },
  giftInner: {
    width: 96,
    height: 96,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  giftMark: {
    fontSize: 40,
    color: '#1A1510',
  },
  title: {
    color: '#F7F1E3',
    fontFamily: typeScale.title.fontFamily,
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
  },
  meta: {
    fontFamily: typeScale.caption.fontFamily,
    fontSize: typeScale.caption.fontSize,
    textTransform: 'capitalize',
  },
  claim: {
    marginTop: space.md,
    backgroundColor: '#F5F0E6',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 999,
  },
  claimLabel: {
    color: '#14110D',
    fontFamily: typeScale.body.fontFamily,
    fontSize: 15,
    fontWeight: '700',
  },
});
