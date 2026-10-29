/** Full canonical positions, on demand; never inferred from the latest argument. */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ArenaDuel } from '../../utils/arenaDuelPayload';
import { layout, space, typeScale, useThemeColors } from '../../theme';
import { ArenaSheet } from '../arena/ui/ArenaSheet';

export function DuelPositions({ duel }: { duel: ArenaDuel }): React.JSX.Element {
  const t = useThemeColors();
  const [open, setOpen] = React.useState(false);
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="Compare both full positions"
      accessibilityHint="Opens the source Take and the challenger's counter-position"
      onPress={() => setOpen(true)} style={[styles.trigger, { borderBottomColor: t.border }]}>
      <Text style={[styles.label, { color: t.textSecondary }]}>THE TWO POSITIONS</Text>
      <Text style={[styles.action, { color: t.textPrimary }]}>Read both ↗</Text>
    </Pressable>
    {open ? <ArenaSheet title="The two positions" onClose={() => setOpen(false)}>
      {([
        { side: 'A', fighter: duel.fighterA, title: 'Source Take', body: duel.sourceText },
        { side: 'B', fighter: duel.fighterB, title: 'Counter-position', body: duel.counterPosition },
      ] as const).map(({ side, fighter, title, body }) => <View key={side} style={[styles.position, { borderColor: t.border }]}>
        <Text style={[styles.label, { color: t.textSecondary }]}>{title} · Fighter {side}</Text>
        <Text accessibilityRole="header" style={[styles.name, { color: t.textPrimary }]}>{fighter.name}</Text>
        <Text style={[styles.handle, { color: t.textMuted }]}>@{fighter.handle}</Text>
        <Text selectable style={[styles.body, { color: t.textPrimary }]}>
          {body?.trim() || `${title} unavailable. No position has been inferred.`}
        </Text>
      </View>)}
      <Text style={[styles.handle, { color: t.textMuted }]}>Read the official arguments before judging. Reactions and support are not ballots.</Text>
    </ArenaSheet> : null}
  </>;
}
const styles = StyleSheet.create({
  trigger: { marginHorizontal: layout.screenX, minHeight: 44, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 10 },
  label: { ...typeScale.caption, fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  action: { ...typeScale.label, fontSize: 13 },
  position: { borderLeftWidth: 2, paddingLeft: space.md, gap: space.sm, paddingVertical: space.sm },
  name: { ...typeScale.title, fontSize: 20, lineHeight: 28 },
  handle: { ...typeScale.caption, fontSize: 12, lineHeight: 18 },
  body: { ...typeScale.body, fontSize: 16, lineHeight: 25 },
});
