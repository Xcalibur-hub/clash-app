/** Return-to-Arena pill (§14): the Vault's always-visible escape hatch. */
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { REALM_ROUTES } from '../navigation/realmRoutes';
import { useRealmSwitch } from '../navigation/useRealmSwitch';
import { ArenaIcon } from '../shared/icons';

export function ArenaPill(): React.JSX.Element {
  const { shiftTo } = useRealmSwitch();
  return (
    <Pressable
      onPress={() => shiftTo('arena', REALM_ROUTES.arenaHome)}
      style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel="Return to Arena"
    >
      <ArenaIcon color="#FFF" size={14} strokeWidth={2.4} />
      <Text allowFontScaling={false} style={styles.label}>
        ARENA
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  pressed: { opacity: 0.72 },
  label: { color: '#FFF', fontSize: 12, fontWeight: '700', letterSpacing: 0.6 },
});
