import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Take, User } from '../../store';
import { layout, space, typeScale, useThemeColors } from '../../theme';
import { Underline } from '../shared/Doodles';
import { FreshTakeCard, freshTakeVariant, type FreshTakeVariant } from './FreshTakeCard';

export interface FreshTakeEntry {
  take: Take;
  author: User;
  commentCount: number;
  hasReacted: boolean;
  isSaved: boolean;
}

export interface FreshTakesSectionProps {
  items: FreshTakeEntry[];
  now: number;
  onOpen: (takeId: string) => void;
  onClash: (takeId: string) => void;
  onReact: (take: Take) => void;
  onSave: (takeId: string) => void;
  onShare: (take: Take, handle: string) => void;
  onMore: (take: Take) => void;
}

/**
 * Magazine-style Fresh Takes block — lead, compact pair, then clash/media/text.
 * Complements Today's Arena without copying the deck.
 */
export function FreshTakesSection({
  items,
  now,
  onOpen,
  onClash,
  onReact,
  onSave,
  onShare,
  onMore,
}: FreshTakesSectionProps): React.JSX.Element | null {
  const t = useThemeColors();
  if (items.length === 0) return null;

  const lead = items[0]!;
  const pair = items.slice(1, 3);
  const rest = items.slice(3);

  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
          Fresh Takes
        </Text>
        <Text allowFontScaling={false} style={[styles.sub, { color: t.textMuted }]}>
          What people are arguing about now
        </Text>
        <Underline size={72} color={t.textPrimary} opacity={0.22} style={styles.mark} />
      </View>

      <Card
        entry={lead}
        variant="lead"
        index={0}
        now={now}
        onOpen={onOpen}
        onClash={onClash}
        onReact={onReact}
        onSave={onSave}
        onShare={onShare}
        onMore={onMore}
      />

      {pair.length > 0 ? (
        <View style={styles.pairRow}>
          {pair.map((entry, i) => (
            <Card
              key={entry.take.id}
              entry={entry}
              variant="compact"
              index={i + 1}
              now={now}
              grid
              onOpen={onOpen}
              onClash={onClash}
              onReact={onReact}
              onSave={onSave}
              onShare={onShare}
              onMore={onMore}
            />
          ))}
          {pair.length === 1 ? <View style={styles.pairSpacer} /> : null}
        </View>
      ) : null}

      {rest.map((entry, i) => {
        const index = i + 3;
        const variant: FreshTakeVariant =
          entry.take.clashes > 0 ? 'clash' : freshTakeVariant(entry.take, index);
        return (
          <Card
            key={entry.take.id}
            entry={entry}
            variant={variant === 'lead' ? 'media' : variant}
            index={index}
            now={now}
            onOpen={onOpen}
            onClash={onClash}
            onReact={onReact}
            onSave={onSave}
            onShare={onShare}
            onMore={onMore}
          />
        );
      })}
    </View>
  );
}

function Card({
  entry,
  variant,
  index,
  now,
  grid,
  onOpen,
  onClash,
  onReact,
  onSave,
  onShare,
  onMore,
}: {
  entry: FreshTakeEntry;
  variant: FreshTakeVariant;
  index: number;
  now: number;
  grid?: boolean;
  onOpen: (takeId: string) => void;
  onClash: (takeId: string) => void;
  onReact: (take: Take) => void;
  onSave: (takeId: string) => void;
  onShare: (take: Take, handle: string) => void;
  onMore: (take: Take) => void;
}): React.JSX.Element {
  return (
    <FreshTakeCard
      take={entry.take}
      author={entry.author}
      commentCount={entry.commentCount}
      hasReacted={entry.hasReacted}
      isSaved={entry.isSaved}
      variant={variant}
      index={index}
      now={now}
      grid={grid}
      onOpen={() => onOpen(entry.take.id)}
      onClash={() => onClash(entry.take.id)}
      onReact={() => onReact(entry.take)}
      onSave={() => onSave(entry.take.id)}
      onShare={() => onShare(entry.take, entry.author.handle)}
      onMore={() => onMore(entry.take)}
    />
  );
}

const styles = StyleSheet.create({
  section: {
    paddingTop: space.sm,
    paddingBottom: space.md,
    gap: 2,
  },
  head: {
    paddingHorizontal: layout.screenX,
    paddingBottom: space.sm,
    position: 'relative',
  },
  title: {
    ...typeScale.section,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  sub: {
    ...typeScale.meta,
    fontSize: 13,
    marginTop: 4,
  },
  mark: { marginTop: 4 },
  pairRow: {
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: layout.screenX,
  },
  pairSpacer: { flex: 1 },
});
