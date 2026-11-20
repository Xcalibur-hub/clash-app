/**
 * Compact live-event backing — support during Clash, never judgement.
 * Visually distinct from official judging and private assists.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { ArenaDuel } from '../../utils/arenaDuelPayload';
import { duelActiveSpeakers } from '../../utils/duelPresentation';
import { spectatorSupportHint } from '../../utils/spectatorPresentation';
import { layout, space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';

export interface ClashBackingActionsProps {
  duel: ArenaDuel;
  backingSide: 'A' | 'B' | null;
  onBackSide: (side: 'A' | 'B') => void;
}

export function ClashBackingActions({
  duel,
  backingSide,
  onBackSide,
}: ClashBackingActionsProps): React.JSX.Element {
  const t = useThemeColors();
  const { width } = useWindowDimensions();
  const compact = width < 380;
  const [fighterA, fighterB] = duelActiveSpeakers(duel);

  return (
    <View style={styles.wrap} accessibilityLabel="Support a fighter during this visit">
      <Text style={[styles.hint, { color: t.textMuted }]}>{spectatorSupportHint()}</Text>
      <Text style={[styles.clarify, { color: t.textSecondary }]}>
        Shows who you are with. Not an official vote.
      </Text>
      <View style={styles.row} accessibilityLabel="Back a fighter">
        {([
          { side: 'A' as const, name: fighterA.name },
          { side: 'B' as const, name: fighterB.name },
        ]).map(({ side, name }) => {
          const on = backingSide === side;
          const short = compact && name.length > 10 ? `${name.slice(0, 9)}…` : name;
          return (
            <Pressable
              key={side}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={
                on
                  ? `Supporting ${name}. Support during the Clash, not a judgement.`
                  : `Support ${name}. Support during the Clash, not a judgement.`
              }
              accessibilityHint="Does not cast an official judgement"
              onPress={() => {
                hapticTap();
                onBackSide(side);
              }}
              style={[
                styles.btn,
                {
                  borderColor: on ? t.textPrimary : t.border,
                  backgroundColor: on ? t.textPrimary : 'transparent',
                },
              ]}
            >
              <Text
                numberOfLines={1}
                style={[styles.label, { color: on ? t.background : t.textPrimary }]}
              >
                {on ? `SUPPORTING ${short.toUpperCase()}` : `SUPPORT ${short.toUpperCase()}`}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4, paddingBottom: space.xs },
  hint: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.9,
    paddingHorizontal: layout.screenX,
  },
  clarify: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500',
    paddingHorizontal: layout.screenX,
    paddingBottom: 2,
  },
  row: {
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: layout.screenX,
  },
  btn: {
    flex: 1,
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
  },
  label: {
    ...typeScale.label,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.35,
  },
});
