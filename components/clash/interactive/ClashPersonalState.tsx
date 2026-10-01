/**
 * Private post-judgement confirmation — no public ballot exposure.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Side } from '../../../store';
import { radius, space, typeScale, useThemeColors } from '../../../theme';
import { VerifiedIcon } from '../../shared/icons';
import { FadeRise } from '../../shared/PressableScale';
import { useDuelSurface } from './clashTheme';

export function ClashPersonalState({ side }: { side: Side }): React.JSX.Element {
  const t = useThemeColors();
  const { tone } = useDuelSurface(side);
  return (
    <FadeRise>
      <View
        style={[styles.wrap, { borderColor: tone, backgroundColor: t.surfaceMuted }]}
        accessibilityLabel={`You backed Side ${side}`}
      >
        <VerifiedIcon size={18} color={tone} strokeWidth={2.4} />
        <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
          You backed Side {side}
        </Text>
        <Text allowFontScaling={false} style={[styles.body, { color: t.textMuted }]}>
          Your judgement is locked. Results appear when judging closes.
        </Text>
      </View>
    </FadeRise>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: space.xs,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
  },
  title: { ...typeScale.label, fontWeight: '700' },
  body: { ...typeScale.meta },
});
