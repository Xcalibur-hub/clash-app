import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { HOOD_LABEL } from '../../data/hoods';
import type { ChallengerComment, Take, User } from '../../store';
import { layout, useThemeColors } from '../../theme';
import { compact, timeAgo } from '../../utils/format';
import { tap as hapticTap } from '../../utils/haptics';
import { resolveStillUrl } from '../../utils/mediaStill';
import { pulseLabel, takePulse } from '../../utils/takePulse';
import { Avatar } from '../shared/Avatar';
import { ArenaIcon, ArrowBigUpIcon, BookmarkIcon, CommentIcon, MoreIcon, PlayIcon, ShareIcon } from '../shared/icons';
import { ChallengeTakeButton } from './TakeChallenges';
import { TakeStoryBeat } from './TakeStoryBeat';
import { QuestionVotePanel } from './QuestionVotePanel';
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
  index?: number;
}
/** Editorial feed card. Media, copy and actions occupy their own space at every font size. */
function TakeFeedItemBase({
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
  index = 0
}: TakeFeedItemProps): React.JSX.Element {
  const t = useThemeColors(),
    router = useRouter(),
    reduced = useReducedMotion();
  const pulse = takePulse(take),
    still = take.media ? resolveStillUrl(take.media) : null;
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => setFailed(false), [still]);
  return <Animated.View entering={reduced || index > 4 ? undefined : FadeInDown.delay(index * 30).duration(220)} style={styles.wrap}>
    <View style={[styles.card, {
      backgroundColor: t.surface,
      borderColor: t.border
    }]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Open ${author.name}'s profile`} onPress={() => {
          hapticTap();
          router.push(`/profile/${author.id}`);
        }} style={styles.author}>
          <Avatar name={author.name} tint={author.tint} size={32} />
          <View style={styles.byline}><Text numberOfLines={1} style={[styles.name, {
              color: t.textPrimary
            }]}>{author.name}{isViewer ? ' · You' : ''}</Text>
            <Text numberOfLines={1} style={[styles.meta, {
              color: t.textMuted
            }]}>@{author.handle} · {timeAgo(take.createdAt)}</Text></View>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="More take actions" onPress={() => {
          hapticTap();
          onMore();
        }} style={styles.more}><MoreIcon size={20} color={t.textSecondary} /></Pressable>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Open take: ${take.text}`} onPress={onOpenDetail} style={styles.story}>
        <Text style={[styles.community, {
          color: t.textMuted
        }]}>{HOOD_LABEL[take.hood] ?? take.hood}{pulse ? ` · ${pulseLabel(pulse)}` : ''}</Text>
        <Text numberOfLines={6} style={[styles.headline, {
          color: t.textPrimary
        }]}>{take.text}</Text>
        {take.media ? <View style={[styles.media, {
          backgroundColor: t.surfaceElevated
        }]}>
          {still && !failed ? <Image source={{
            uri: still
          }} resizeMode="cover" style={StyleSheet.absoluteFill} onError={() => setFailed(true)} /> : <Text style={[styles.mediaFallback, {
            color: t.textMuted
          }]}>Preview unavailable · Open Take</Text>}
          {take.media.kind === 'video' ? <View style={styles.play}><PlayIcon size={20} color="#FFFFFF" /></View> : null}
          <View style={styles.mediaLabel}><Text style={styles.mediaKind}>{take.media.kind.toUpperCase()}</Text></View>
        </View> : null}
      </Pressable>
      <View style={styles.responses}>
        {topComment ? <TakeStoryBeat comment={topComment} author={topCommentAuthor} clashCount={take.clashes} pulse={pulse === 'clash' ? null : pulse} onOpen={onOpenDetail} /> : take.clashes > 0 ? <Text style={[styles.meta, {
          color: t.textMuted
        }]}>{compact(take.clashes)} {take.clashes === 1 ? 'Clash' : 'Clashes'} · View the discussion</Text> : null}
      </View>
      <View style={[styles.actions, {
        borderColor: t.border
      }]}>
        {[{
          Icon: ArrowBigUpIcon,
          label: compact(take.reactions),
          a11y: 'React to this take',
          onPress: onReact,
          selected: hasReacted
        }, {
          Icon: CommentIcon,
          label: commentCount > 0 ? compact(commentCount) : '',
          a11y: 'Open rebuttals',
          onPress: onOpenDetail
        }, {
          Icon: ArenaIcon,
          label: 'Clash',
          a11y: 'Clash on this take',
          onPress: onOpenClash,
          primary: true
        }, {
          Icon: ShareIcon,
          label: '',
          a11y: 'Share this take',
          onPress: onShare
        }, {
          Icon: BookmarkIcon,
          label: '',
          a11y: isSaved ? 'Remove from saved' : 'Save this take',
          onPress: onSave,
          selected: isSaved
        }].map(({
          Icon,
          label,
          a11y,
          onPress,
          selected,
          primary
        }) => <Pressable key={a11y} accessibilityRole="button" accessibilityLabel={a11y} accessibilityState={selected === undefined ? undefined : {
          selected
        }} onPress={() => {
          hapticTap();
          onPress();
        }} style={({
          pressed
        }) => [styles.actionButton, {
          backgroundColor: primary ? t.textPrimary : selected ? t.surfaceElevated : 'transparent',
          opacity: pressed ? 0.65 : 1
        }]}>
          <Icon size={17} color={primary ? t.background : selected ? t.textPrimary : t.textSecondary} />
          {label ? <Text style={[styles.actionLabel, {
            color: primary ? t.background : t.textSecondary
          }]}>{label}</Text> : null}
        </Pressable>)}
      </View>
      {take.question ? <QuestionVotePanel takeId={take.id} choices={take.question} /> : null}
      {!isViewer ? <ChallengeTakeButton takeId={take.id} /> : null}
    </View>
  </Animated.View>;
}
export const TakeFeedItem = React.memo(TakeFeedItemBase);
const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: layout.screenX,
    marginBottom: 16
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    overflow: 'hidden',
    paddingTop: 10,
    paddingBottom: 4
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 8,
    gap: 8
  },
  author: {
    minHeight: 44,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  byline: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  name: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700'
  },
  meta: {
    fontSize: 11,
    lineHeight: 17
  },
  more: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center'
  },
  story: {
    paddingTop: 12,
    gap: 12
  },
  community: {
    fontSize: 10,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 0.9,
    paddingHorizontal: 16,
    textTransform: 'uppercase'
  },
  headline: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '600',
    letterSpacing: -0.5,
    paddingHorizontal: 16
  },
  media: {
    aspectRatio: 1.6,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
    overflow: 'hidden'
  },
  mediaFallback: {
    padding: 20,
    fontSize: 12
  },
  play: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  mediaLabel: {
    position: 'absolute',
    bottom: 10,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingVertical: 4,
    paddingHorizontal: 7,
    borderRadius: 5
  },
  mediaKind: {
    color: '#FFFFFF',
    fontSize: 9,
    letterSpacing: 1,
    fontWeight: '700'
  },
  responses: {
    paddingHorizontal: 16,
    paddingTop: 12
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
    marginHorizontal: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 8,
    paddingVertical: 6
  },
  actionButton: {
    minHeight: 44,
    minWidth: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: 12,
    paddingHorizontal: 8
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: '600'
  }
});
