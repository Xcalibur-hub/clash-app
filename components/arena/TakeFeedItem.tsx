import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { ChallengerComment, Take, User } from '../../store';
import { layout, space, useThemeColors } from '../../theme';
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
 * Flat Fresh Take — typography + controlled media, no giant card chrome.
 * Visually subordinate to the featured deck.
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
  const t = useThemeColors();
  return (
    <View style={styles.item}>
      <View style={styles.padded}>
        <TakeHeader author={author} take={take} isViewer={isViewer} onMore={onMore} />
      </View>
      <View style={styles.padded}>
        <TakeBody take={take} onOpen={onOpenDetail} />
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
      <View style={[styles.rule, { backgroundColor: t.border }]} />
    </View>
  );
}

export const TakeFeedItem = React.memo(TakeFeedItemBase);

const styles = StyleSheet.create({
  item: {
    paddingTop: space.md,
    paddingBottom: space.sm,
    gap: space.sm,
  },
  padded: {
    paddingHorizontal: layout.screenX,
    gap: space.sm,
  },
  rule: {
    height: StyleSheet.hairlineWidth,
    marginTop: space.sm,
    marginHorizontal: layout.screenX,
  },
});
