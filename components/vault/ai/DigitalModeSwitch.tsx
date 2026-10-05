import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { digitalRoomModeLabel, type DigitalRoomMode } from '../../../utils/digitalCreatorState';
import { radius, space, typeScale, useThemeColors } from '../../../theme';
import { tap as hapticTap } from '../../../utils/haptics';

export interface DigitalModeSwitchProps {
  modes: DigitalRoomMode[];
  active: DigitalRoomMode;
  onChange: (mode: DigitalRoomMode) => void;
}

/**
 * TEXT | TALK. Shown only when there is a real choice to make, so a text-only
 * room never pretends to offer a digital version it cannot render.
 */
export function DigitalModeSwitch({
  modes,
  active,
  onChange,
}: DigitalModeSwitchProps): React.JSX.Element | null {
  const t = useThemeColors();
  if (modes.length < 2) return null;

  return (
    <View style={[styles.row, { borderColor: t.border, backgroundColor: t.surfaceMuted }]}>
      {modes.map((mode) => {
        const on = mode === active;
        return (
          <Pressable
            key={mode}
            onPress={() => {
              if (on) return;
              hapticTap();
              onChange(mode);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${digitalRoomModeLabel(mode)} mode`}
            style={[styles.tab, on && { backgroundColor: t.surface, borderColor: t.border }]}
          >
            <Text
              allowFontScaling={false}
              style={[styles.label, { color: on ? t.textPrimary : t.textMuted }]}
            >
              {digitalRoomModeLabel(mode)}
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
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    padding: 3,
    gap: 3,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  label: { ...typeScale.caption, fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
  hint: { ...typeScale.meta, paddingTop: space.xs },
});
