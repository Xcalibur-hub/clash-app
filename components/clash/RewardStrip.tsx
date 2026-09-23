import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { accent, card, ink, radius, space, typeScale } from '../../theme';
import { CountUp } from '../shared/CountUp';
import { CoinIcon, FlameIcon } from '../shared/icons';

export interface RewardStripProps {
  reputation: number;
  coins: number;
}

/**
 * The reward line (reference screen 9): a flame with the reputation earned and the
 * gold coin with the clash coins — the two numbers the loop pays out.
 */
export function RewardStrip({ reputation, coins }: RewardStripProps): React.JSX.Element {
  return (
    <Animated.View entering={FadeInDown.delay(120).duration(360)} style={styles.strip}>
      <View style={styles.item}>
        <FlameIcon size={16} color={accent.a} strokeWidth={2.6} />
        <CountUp
          value={reputation}
          prefix="+"
          style={styles.value}
          accessibilityLabel={`plus ${reputation} reputation`}
        />
        <Text allowFontScaling={false} style={styles.label}>
          Reputation
        </Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.item}>
        <CoinIcon size={16} color={accent.gold} strokeWidth={2.6} />
        <CountUp
          value={coins}
          prefix="+"
          delayMs={140}
          durationMs={640}
          style={styles.value}
          accessibilityLabel={`plus ${coins} clash coins`}
        />
        <Text allowFontScaling={false} style={styles.label}>
          Clash Coins
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.lg,
    paddingHorizontal: space.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: card.border,
    backgroundColor: card.solid,
  },
  item: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs + 2,
    flexWrap: 'wrap',
  },
  divider: { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.12)' },
  value: { ...typeScale.dataLg, fontSize: 17, lineHeight: 22, color: ink.primary },
  label: { ...typeScale.meta, color: ink.tertiary },
});