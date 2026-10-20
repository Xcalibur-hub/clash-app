/**
 * Compact live-event backing — support during Clash, never judgement.
 * Explanation lives in accessibility / first-time tooltip elsewhere.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { ArenaDuel } from '../../utils/arenaDuelPayload';
import { duelActiveSpeakers } from '../../utils/duelPresentation';
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
    <View style={styles.wrap}>
      <Text style={[styles.hint, { color: t.textMuted }]}>
        SUPPORT FOR THIS VISIT · NOT A JUDGEMENT
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
                  ? `Backing ${name}. Support during the Clash, not a judgement.`
                  : `Back ${name}. Support during the Clash, not a judgement.`
              }
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
                {on ? `BACKING ${short.toUpperCase()}` : `BACK ${short.toUpperCase()}`}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, paddingBottom: space.xs },
  hint: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.9,
    paddingHorizontal: layout.screenX,
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
    letterSpacing: 0.4,
  },
});
