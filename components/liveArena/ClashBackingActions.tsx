/**
 * Compact live-event backing — support during Clash, never judgement.
 * Explanation lives in accessibility / first-time tooltip elsewhere.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
  const [fighterA, fighterB] = duelActiveSpeakers(duel);

  return (
    <View style={styles.row} accessibilityLabel="Back a fighter">
      {([
        { side: 'A' as const, name: fighterA.name },
        { side: 'B' as const, name: fighterB.name },
      ]).map(({ side, name }) => {
        const on = backingSide === side;
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
              allowFontScaling={false}
              numberOfLines={1}
              style={[styles.label, { color: on ? t.background : t.textPrimary }]}
            >
              {on ? `BACKING ${name.toUpperCase()}` : `BACK ${name.toUpperCase()}`}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: layout.screenX,
    paddingBottom: space.xs,
  },
  btn: {
    flex: 1,
    minHeight: 40,
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
    letterSpacing: 0.5,
  },
});
