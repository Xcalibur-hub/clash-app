import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Clash, Take, User } from '../../store';
import { card, ink, layout, radius, space, typeScale } from '../../theme';
import { TakeActions } from './TakeActions';
import { TakeCardHeader } from './TakeCardHeader';
import { TakeMedia } from './TakeMedia';

export interface TakeCardProps {
  take: Take;
  author: User;
  challenger: User | undefined;
  isViewer: boolean;
  isSaved: boolean;
  hasReacted: boolean;
  clash: Clash | undefined;
  now: number;
  onOpenClash: () => void;
  onReact: () => void;
  onSave: () => void;
  onShare: () => void;
  onMore: () => void;
}

/**
 * The Arena's Take card redesigned: native feel without heavy glass container.
 * Layout: author row, large take text, clean media, meta line, primary CTA, subtle actions.
 */
function TakeCardBase({
  take,
  author,
  challenger,
  isViewer,
  isSaved,
  hasReacted,
  clash,
  now,
  onOpenClash,
  onReact,
  onSave,
  onShare,
  onMore,
}: TakeCardProps): React.JSX.Element {
  return (
    <Pressable
      onPress={onOpenClash}
      accessibilityRole="button"
      accessibilityLabel={`Take by @${author.handle}: ${take.text}`}
      accessibilityHint={clash ? 'Opens the clash for this take' : 'Starts a clash on this take'}
      style={styles.card}
    >
      <TakeCardHeader author={author} take={take} isViewer={isViewer} now={now} />
      <Text allowFontScaling={false} style={styles.takeText}>
        {take.text}
      </Text>
      {take.media ? <TakeMedia media={take.media} /> : null}
      <TakeActions
        take={take}
        challengerHandle={challenger?.handle}
        isSaved={isSaved}
        hasReacted={hasReacted}
        onClash={onOpenClash}
        onReact={onReact}
        onSave={onSave}
        onShare={onShare}
        onMore={onMore}
        now={now}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.md,
    paddingHorizontal: layout.screenX,
    paddingVertical: space.md,
  },
  takeText: { ...typeScale.takeText, color: ink.primary },
});

/** Memoised so a single card action never re-renders the whole feed (§35). */
export const TakeCard = React.memo(TakeCardBase);
