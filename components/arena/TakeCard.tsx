import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Take, User } from '../../store';
import { ink, layout, space, typeScale } from '../../theme';
import { TakeActions } from './TakeActions';
import { TakeCardHeader } from './TakeCardHeader';
import { TakeMedia } from './TakeMedia';

export interface TakeCardProps {
  take: Take;
  author: User;
  isViewer: boolean;
  isSaved: boolean;
  hasReacted: boolean;
  now: number;
  onOpenClash: () => void;
  onOpenDetail: () => void;
  onReact: () => void;
  onSave: () => void;
  onShare: () => void;
  onMore: () => void;
}

/**
 * The Arena's Take card with explicit interactions:
 * - Take text opens detail view
 * - CLASH button opens clash
 * - Other actions (react, save, share) have explicit handlers
 */
function TakeCardBase({
  take,
  author,
  isViewer,
  isSaved,
  hasReacted,
  now,
  onOpenClash,
  onOpenDetail,
  onReact,
  onSave,
  onShare,
  onMore,
}: TakeCardProps): React.JSX.Element {
  return (
    <View style={styles.card}>
      <TakeCardHeader author={author} take={take} isViewer={isViewer} now={now} />

      <Pressable
        onPress={onOpenDetail}
        accessibilityRole="button"
        accessibilityLabel={`Read full take by @${author.handle}`}
        style={styles.textContainer}
      >
        <Text allowFontScaling={false} style={styles.takeText}>
          {take.text}
        </Text>
      </Pressable>

      {take.media ? (
        <Pressable
          onPress={onOpenDetail}
          accessibilityRole="button"
          accessibilityLabel="Open take media and details"
          style={styles.media}
        >
          <TakeMedia media={take.media} />
        </Pressable>
      ) : null}
      
      <TakeActions
        take={take}
        isSaved={isSaved}
        hasReacted={hasReacted}
        onClash={onOpenClash}
        onReact={onReact}
        onSave={onSave}
        onShare={onShare}
        onMore={onMore}
        now={now}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.md,
    paddingHorizontal: layout.screenX,
  },
  textContainer: { paddingVertical: space.xs },
  takeText: { ...typeScale.takeText, color: ink.primary },
  media: { overflow: 'hidden', borderRadius: 16 },
});

/** Memoised so a single card action never re-renders the whole feed (§35). */
export const TakeCard = React.memo(TakeCardBase);
