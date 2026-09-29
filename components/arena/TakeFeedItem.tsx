import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { ChallengerComment, Take, User } from '../../store';
import { layout, space } from '../../theme';
import { TakeActionRow } from './TakeActionRow';
import { TakeBody } from './TakeBody';
import { TakeHeader } from './TakeHeader';
import { TopRebuttalPreview } from './TopRebuttalPreview';

export interface TakeFeedItemProps {
  take: Take;
  author: User;
  isViewer: boolean;
  isSaved: boolean;
  hasReacted: boolean;
  commentCount: number;
  topComment: ChallengerComment | undefined;
  topCommentAuthor: User | undefined;
  onOpenDetail: () => void;
  onOpenClash: () => void;
  onReact: () => void;
  onSave: () => void;
  onShare: () => void;
  onMore: () => void;
}

/**
 * A single Arena post embedded flat in the feed — header → content → leading
 * rebuttal → actions. Media can bleed edge-to-edge; no card chrome.
 */
function TakeFeedItemBase(props: TakeFeedItemProps): React.JSX.Element {
  const {
    take,
    author,
    isViewer,
    isSaved,
    hasReacted,
    commentCount,
    topComment,
    topCommentAuthor,
    onOpenDetail,
    onOpenClash,
    onReact,
    onSave,
    onShare,
    onMore,
  } = props;
  return (
    <View style={styles.item}>
      <View style={styles.padded}>
        <TakeHeader author={author} take={take} isViewer={isViewer} onMore={onMore} />
      </View>
      <View style={styles.padded}>
        <TakeBody take={take} onOpen={onOpenDetail} edgeMedia={Boolean(take.media)} />
      </View>
      <View style={styles.padded}>
        <TopRebuttalPreview comment={topComment} author={topCommentAuthor} onOpen={onOpenDetail} />
        <TakeActionRow
          reactions={take.reactions}
          commentCount={commentCount}
          isSaved={isSaved}
          hasReacted={hasReacted}
          onReact={onReact}
          onComment={onOpenDetail}
          onClash={onOpenClash}
          onShare={onShare}
          onSave={onSave}
        />
      </View>
    </View>
  );
}

/** Memoised so a single card action never re-renders the whole feed. */
export const TakeFeedItem = React.memo(TakeFeedItemBase);

const styles = StyleSheet.create({
  item: {
    paddingVertical: space.md,
    gap: space.sm,
  },
  padded: {
    paddingHorizontal: layout.screenX,
    gap: space.sm,
  },
});
