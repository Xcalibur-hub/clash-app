import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { selectAuthor, useClash, type Take, type User } from '../../store';
import { apple, ink, radius, space, typeScale } from '../../theme';
import { RepliesSheet } from './RepliesSheet';
import { TakeActions } from './TakeActions';
import { TakeCardHeader } from './TakeCardHeader';
import { TakeMedia } from './TakeMedia';
import { TopChallengerSnippet } from './TopChallengerSnippet';

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
  const { state } = useClash();
  const [repliesOpen, setRepliesOpen] = React.useState(false);
  const comments = state.comments.filter((c) => c.takeId === take.id);
  const topComment = comments.length > 0
    ? comments.reduce((best, next) => (next.upvotes > best.upvotes ? next : best), comments[0] as (typeof comments)[number])
    : undefined;
  const topAuthor = topComment ? selectAuthor(state, topComment.authorId) : undefined;
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

      <TopChallengerSnippet
        topComment={topComment}
        author={topAuthor}
        onPress={() => setRepliesOpen(true)}
      />

      <TakeActions
        take={take}
        commentCount={comments.length}
        isSaved={isSaved}
        hasReacted={hasReacted}
        onClash={onOpenClash}
        onReact={onReact}
        onSave={onSave}
        onShare={onShare}
        onMore={onMore}
        onComment={() => setRepliesOpen(true)}
        now={now}
      />
      {repliesOpen ? <RepliesSheet takeId={take.id} onClose={() => setRepliesOpen(false)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.md,
    marginHorizontal: space.md,
    padding: space.lg,
    borderRadius: radius.xl,
    backgroundColor: apple.card,
    borderWidth: 1,
    borderColor: apple.cardBorder,
    overflow: 'hidden',
  },
  textContainer: { paddingVertical: space.xs },
  takeText: { ...typeScale.takeText, color: ink.primary },
  media: { overflow: 'hidden', borderRadius: 16 },
});

/** Memoised so a single card action never re-renders the whole feed (§35). */
export const TakeCard = React.memo(TakeCardBase);
