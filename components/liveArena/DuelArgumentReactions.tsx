/** Uses the existing reaction callback/queue; never manufactures a count or ballot. */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ArenaMessage } from '../../services/liveArenaService';
import { layout, typeScale, useThemeColors } from '../../theme';
import { ArenaReactionPicker } from './ArenaReactionPicker';

export function DuelArgumentReactions({ message, canReact = false, onReact }: {
  message: ArenaMessage | null; canReact?: boolean;
  onReact?: (message: ArenaMessage, emoji: string) => void;
}): React.JSX.Element | null {
  const t = useThemeColors();
  const [open, setOpen] = React.useState(false);
  const allowed = canReact && Boolean(onReact) && Boolean(message && !message.pending && message.kind !== 'system');
  if (!message || message.pending || message.kind === 'system') return null;
  const reactions = message.reactions.filter(reaction => reaction.count > 0);
  if (!allowed && reactions.length === 0) return null;
  return <View style={styles.wrap} accessibilityLabel="Official argument reactions, not ballots">
    <View style={styles.row}>
      {reactions.map(reaction => <Text key={reaction.emoji}
        accessibilityLabel={`${reaction.emoji}, ${reaction.count} reactions${reaction.viewerReacted ? ', including yours' : ''}`}
        style={[styles.count, { color: t.textSecondary }]}>{reaction.emoji} {reaction.count}</Text>)}
      {allowed ? <Pressable accessibilityRole="button" accessibilityLabel="React to the current official argument"
        accessibilityHint="Opens reactions. This does not cast a judgement"
        onPress={() => setOpen(true)} style={[styles.action, { borderColor: t.border }]}>
        <Text style={[styles.label, { color: t.textPrimary }]}>React to argument</Text>
      </Pressable> : null}
    </View>
    <Text style={[styles.hint, { color: t.textMuted }]}>Reactions are not ballots.</Text>
    {allowed && open ? <ArenaReactionPicker visible activeEmojis={message.reactions.filter(r => r.viewerReacted).map(r => r.emoji)}
      onClose={() => setOpen(false)} onPick={emoji => { setOpen(false); if (allowed) onReact?.(message, emoji); }} /> : null}
  </View>;
}
const styles = StyleSheet.create({
  wrap: { paddingHorizontal: layout.screenX, gap: 4, paddingBottom: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' },
  action: { minHeight: 44, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, justifyContent: 'center', paddingHorizontal: 14 },
  label: { ...typeScale.label, fontSize: 13 },
  count: { ...typeScale.body, fontSize: 14 },
  hint: { ...typeScale.caption, fontSize: 11 },
});
