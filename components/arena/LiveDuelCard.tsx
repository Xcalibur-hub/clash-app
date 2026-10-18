import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { arena, arenaColors } from '../../theme/arena';
import { useThemeColors } from '../../theme';
import { Avatar } from '../shared/Avatar';

export interface LiveDuelCardProps {
  title: string;
  state: string;
  featured?: boolean;
  fighters?: readonly ({ name: string; tint: string } | null)[];
  identityHidden?: boolean;
  audience?: number | null;
  audienceLabel?: string;
  onOpen: () => void;
}
/** Pure presentation: identity/counts must come from an authorized caller or labeled demo. */
export const LiveDuelCard = React.memo(function LiveDuelCard({ title, state, featured, fighters, identityHidden, audience, audienceLabel = 'spectators joined', onOpen }: LiveDuelCardProps): React.JSX.Element {
  const c = arenaColors(useThemeColors()), live = state === 'LIVE';
  return <Pressable accessibilityRole="button" accessibilityLabel={`${live ? 'Watch Duel' : 'View Clash'}. ${state}. ${title}`} onPress={onOpen}
    style={({ pressed }) => [styles.card, { backgroundColor: c.surface, borderColor: c.line, opacity: pressed ? 0.8 : 1 }, featured && styles.featured]}>
    <View style={styles.meta}><Text style={[arena.type.eyebrow, { color: live ? '#B84D46' : c.muted }]}>{live ? '● LIVE · 1v1' : state.replaceAll('_', ' ')}</Text>{featured ? <Text style={[arena.type.meta, { color: c.muted }]}>On the stage</Text> : null}</View>
    <Text numberOfLines={featured ? 4 : 3} style={[featured ? arena.type.statement : arena.type.heading, { color: c.ink }]}>{title}</Text>
    <View style={styles.fighters}>{(['A', 'B'] as const).map((side, i) => <React.Fragment key={side}>{i === 1 ? <Text style={[arena.type.meta, { color: c.muted }]}>vs</Text> : null}<View style={[styles.fighter, { borderLeftColor: i ? '#6384AF' : '#B76B64' }]}>
      {fighters?.[i] ? <Avatar name={fighters[i]!.name} tint={fighters[i]!.tint} size={28} /> : null}<View style={{ flex: 1, minWidth: 0 }}><Text style={[arena.type.eyebrow, { color: c.muted }]}>FIGHTER {side}</Text><Text numberOfLines={2} style={[arena.type.label, { color: c.ink }]}>{fighters?.[i]?.name ?? (identityHidden ? 'Identity hidden' : 'View in room')}</Text></View>
    </View></React.Fragment>)}</View>
    <View style={[styles.footer, { borderTopColor: c.line }]}><Text style={[arena.type.meta, { color: c.muted }]}>{audience != null ? `${audience} ${audienceLabel}` : 'Two perspectives. Your ringside seat.'}</Text><Text style={[arena.type.label, { color: c.ink }]}>{live ? 'Watch Duel ↗' : state === 'SETTLED' || state === 'CANCELLED' ? 'View result ↗' : 'View ↗'}</Text></View>
  </Pressable>;
});
const styles = StyleSheet.create({ card: { padding: 16, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, gap: 16, minHeight: 44 }, featured: { padding: 20, gap: 20 }, meta: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }, fighters: { flexDirection: 'row', alignItems: 'center', gap: 8 }, fighter: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', borderLeftWidth: 2, paddingLeft: 8, gap: 8 }, footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, minHeight: 44, justifyContent: 'space-between', flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' } });
