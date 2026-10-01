/**
 * Opposing side card — editorial argument surface with selection / verdict emphasis.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import type { Side, User } from '../../../store';
import { radius, space, spring, typeScale, useThemeColors } from '../../../theme';
import { Avatar } from '../../shared/Avatar';
import { useDuelSurface } from './clashTheme';

export interface ClashSideCardProps {
  side: Side;
  author: User | null;
  text: string;
  /** Emphasize after user judgement or on selection press. */
  emphasized?: boolean;
  /** Dim opposing side after judgement / verdict. */
  diminished?: boolean;
  winner?: boolean;
  enterDelay?: number;
  rotationDeg?: number;
}

export function ClashSideCard({
  side,
  author,
  text,
  emphasized = false,
  diminished = false,
  winner = false,
  enterDelay = 0,
  rotationDeg = 0,
}: ClashSideCardProps): React.JSX.Element {
  const t = useThemeColors();
  const { tone, soft, line, selectedFill } = useDuelSurface(side);
  const reduced = useReducedMotion();
  const progress = useSharedValue(reduced ? 1 : 0);
  const weight = useSharedValue(emphasized ? 1 : diminished ? -1 : 0);
  const reveal = useSharedValue(author ? 1 : 0);
  const hidden = author === null;

  React.useEffect(() => {
    if (reduced) {
      progress.value = 1;
      return;
    }
    const id = setTimeout(() => {
      progress.value = withTiming(1, { duration: 420 });
    }, enterDelay);
    return () => clearTimeout(id);
  }, [enterDelay, progress, reduced]);

  React.useEffect(() => {
    weight.value = withSpring(emphasized ? 1 : diminished ? -1 : 0, spring.press);
  }, [diminished, emphasized, weight]);

  React.useEffect(() => {
    if (reduced) {
      reveal.value = author ? 1 : 0;
      return;
    }
    reveal.value = withTiming(author ? 1 : 0, { duration: 380 });
  }, [author, reduced, reveal]);

  const cardStyle = useAnimatedStyle(() => {
    const w = weight.value;
    return {
      opacity: progress.value * (1 - Math.max(0, -w) * 0.35),
      transform: [
        { translateY: (1 - progress.value) * 14 },
        { translateX: w * (side === 'A' ? -4 : 4) },
        { scale: 1 + w * 0.02 - Math.max(0, -w) * 0.03 },
        { rotate: `${rotationDeg + w * (side === 'A' ? -0.6 : 0.6)}deg` },
      ],
    };
  });

  const identityStyle = useAnimatedStyle(() => ({
    opacity: 0.45 + reveal.value * 0.55,
  }));

  return (
    <Animated.View
      style={[
        styles.card,
        {
          borderColor: winner || emphasized ? tone : line,
          backgroundColor: emphasized ? selectedFill : soft,
          borderLeftColor: tone,
          shadowColor: t.shadowColor,
          shadowOpacity: emphasized ? t.shadowOpacity : 0,
          elevation: emphasized ? 2 : 0,
        },
        cardStyle,
      ]}
      accessibilityLabel={
        hidden
          ? `Side ${side}. Participant identities hidden. ${text}`
          : `Side ${side}. ${author.name}. ${text}`
      }
    >
      <View style={styles.head}>
        <Text allowFontScaling={false} style={[styles.sideLabel, { color: tone }]}>
          Side {side}
        </Text>
        {winner ? (
          <Text allowFontScaling={false} style={[styles.winner, { color: tone }]}>
            Wins
          </Text>
        ) : null}
      </View>

      <Animated.View style={identityStyle}>
        {hidden ? (
          <Text allowFontScaling={false} style={[styles.hiddenName, { color: t.textSecondary }]}>
            Participant {side}
          </Text>
        ) : (
          <View style={styles.identity}>
            <Avatar name={author.name} tint={author.tint} size={32} />
            <Text
              allowFontScaling={false}
              style={[styles.handle, { color: t.textPrimary }]}
              numberOfLines={1}
            >
              @{author.handle}
            </Text>
          </View>
        )}
      </Animated.View>

      <Text allowFontScaling style={[styles.text, { color: t.textPrimary }]}>
        {text}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderLeftWidth: 3,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sideLabel: { ...typeScale.caption, letterSpacing: 0.6, fontWeight: '700', fontSize: 11 },
  winner: { ...typeScale.caption, letterSpacing: 0.4, fontWeight: '700', fontSize: 11 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  handle: { ...typeScale.label, flexShrink: 1, fontWeight: '600' },
  hiddenName: { ...typeScale.label },
  text: { ...typeScale.takeText, fontSize: 17, lineHeight: 25 },
});
