/**
 * __DEV__-only Clash diagnostics. No production exposure. No fake data writes.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ArenaRoom } from '../../services/liveArenaService';
import { space, typeScale, useThemeColors } from '../../theme';

export interface DuelDevPanelProps {
  room: ArenaRoom;
}

export function DuelDevPanel({ room }: DuelDevPanelProps): React.JSX.Element | null {
  const t = useThemeColors();
  const [open, setOpen] = React.useState(false);
  const isDev = typeof __DEV__ !== 'undefined' && __DEV__;
  if (!isDev || !room.duel) return null;
  const duel = room.duel;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Toggle Clash debug panel"
        onPress={() => setOpen((v) => !v)}
        style={[styles.toggle, { backgroundColor: t.surfaceElevated, borderColor: t.border }]}
      >
        <Text style={[styles.toggleText, { color: t.textMuted }]}>DEV</Text>
      </Pressable>
      {open ? (
        <View style={[styles.panel, { backgroundColor: t.surfaceElevated, borderColor: t.border }]}>
          <Text style={[styles.line, { color: t.textSecondary }]}>clash {duel.clashId}</Text>
          <Text style={[styles.line, { color: t.textSecondary }]}>phase {room.phase}</Text>
          <Text style={[styles.line, { color: t.textSecondary }]}>
            role {duel.viewerRelationship}
          </Text>
          <Text style={[styles.line, { color: t.textSecondary }]}>
            A {duel.fighterA.id.slice(0, 8)}
          </Text>
          <Text style={[styles.line, { color: t.textSecondary }]}>
            B {duel.fighterB.id.slice(0, 8)}
          </Text>
          <Text style={[styles.line, { color: t.textSecondary }]}>
            status {duel.status} · mayJudge {String(duel.mayJudge)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: space.sm,
    bottom: 88,
    zIndex: 20,
    maxWidth: 220,
  },
  toggle: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  toggleText: { ...typeScale.caption, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  panel: {
    marginTop: 6,
    padding: space.sm,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  line: { ...typeScale.caption, fontSize: 10, fontFamily: 'monospace' },
});
