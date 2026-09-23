import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
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
 * The Arena's Take card (reference "Arena Home", screen 5): a matte obsidian plate
 * with 20px internal padding — author row, the take as a high-contrast quote, an
 * optional 16:9 preview, then the full-width CLASH pill.
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
      <Text allowFontScaling={false} style={styles.quote}>
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
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.lg,
    padding: layout.cardPadding,
    borderRadius: radius.card,
    borderWidth: 1,
    backgroundColor: card.solid,
    borderColor: card.border,
  },
  quote: { ...typeScale.quote, color: ink.primary },
});

/** Memoised so a single card action never re-renders the whole feed (§35). */
export const TakeCard = React.memo(TakeCardBase);
