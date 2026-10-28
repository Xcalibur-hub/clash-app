import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Take, User } from '../../store';
import { useThemeColors } from '../../theme';
import { arena, arenaColors } from '../../theme/arena';
import { HOOD_LABEL } from '../../data/hoods';
import { timeAgo, timeLeftLabel } from '../../utils/format';
import { ArenaBadge, ArenaIdentity } from './ui/ArenaPrimitives';
import { TakeDetailHero } from './TakeDetailHero';

/** Shared by the live route and isolated visual evidence; contains no fixture data. */
export function TakeEditorialHeader({ take, author, archived, isViewer, onOpenAuthor }: {
  take: Take; author: User; archived: boolean; isViewer: boolean; onOpenAuthor?: () => void;
}): React.JSX.Element {
  const c = arenaColors(useThemeColors());
  const identity = <ArenaIdentity name={author.name + (isViewer ? ' · You' : '')}
    detail={`@${author.handle} · ${timeAgo(take.createdAt)}`} />;
  return <View style={styles.hero}>
    <View style={styles.meta}>
      <Text style={[arena.type.eyebrow, { color: c.muted }]}>{HOOD_LABEL[take.hood]} / TAKE</Text>
      <ArenaBadge>{archived ? 'Archived' : 'Open discussion'}</ArenaBadge>
    </View>
    {onOpenAuthor ? <Pressable accessibilityRole="button" accessibilityLabel={`Open ${author.name}'s profile`}
      onPress={onOpenAuthor} style={{ minHeight: 44, justifyContent: 'center' }}>{identity}</Pressable> : identity}
    <Text accessibilityRole="header" style={[arena.type.statement, { color: c.ink }]}>{take.text}</Text>
    {take.media ? <TakeDetailHero take={take} author={author} isViewer={isViewer} compact /> : null}
    <Text style={[arena.type.meta, { color: c.muted }]}>
      {archived ? 'Archived discussion' : `${timeLeftLabel(take.expiresAt)} · Add your perspective`}
    </Text>
  </View>;
}

const styles = StyleSheet.create({
  hero: { gap: 16, paddingTop: 18, paddingBottom: 10 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
});
