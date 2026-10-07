import React from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { HOOD_LABEL } from '../../data/hoods';
import type { ChallengerComment, Take, User } from '../../store';
import {
  arenaAccentForHood,
  layout,
  pulseAccent,
  radius,
  space,
  typeScale,
  useThemeColors,
} from '../../theme';
import { compact, timeAgo } from '../../utils/format';
import { tap as hapticTap } from '../../utils/haptics';
import { resolveStillUrl } from '../../utils/mediaStill';
import { pulseLabel, takePulse } from '../../utils/takePulse';
import { CrossedSwords } from '../clash/CrossedSwords';
import { Avatar } from '../shared/Avatar';
import { Squiggle } from '../shared/Doodles';
import {
  ArenaIcon,
  ArrowBigUpIcon,
  BookmarkIcon,
  CommentIcon,
  MoreIcon,
  PlayIcon,
  ShareIcon,
} from '../shared/icons';
import { PressableScale } from '../shared/PressableScale';
import { TakeActionRow } from './TakeActionRow';
import { ChallengeTakeButton } from './TakeChallenges';
import { TakeStoryBeat } from './TakeStoryBeat';

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
  /** Only the first few visible items should enter with motion. */
  index?: number;
}

/**
 * Immersive feed card — media fills the surface; text-only gets editorial poster.
 * Not a Reddit list row.
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
    index = 0,
  } = props;
  const reduced = useReducedMotion();
  const entering =
    reduced || index > 4
      ? undefined
      : FadeInDown.delay(index * 40)
          .springify()
          .damping(20)
          .stiffness(260);

  const hasMedia = Boolean(take.media);
  const body = hasMedia ? (
    <MediaFeedCard
      take={take}
      author={author}
      isViewer={isViewer}
      isSaved={isSaved}
      hasReacted={hasReacted}
      commentCount={commentCount}
      topComment={topComment}
      topCommentAuthor={topCommentAuthor}
      onOpenDetail={onOpenDetail}
      onOpenClash={onOpenClash}
      onReact={onReact}
      onSave={onSave}
      onShare={onShare}
      onMore={onMore}
    />
  ) : (
    <TextFeedCard
      take={take}
      author={author}
      isViewer={isViewer}
      isSaved={isSaved}
      hasReacted={hasReacted}
      commentCount={commentCount}
      topComment={topComment}
      topCommentAuthor={topCommentAuthor}
      onOpenDetail={onOpenDetail}
      onOpenClash={onOpenClash}
      onReact={onReact}
      onSave={onSave}
      onShare={onShare}
      onMore={onMore}
    />
  );

  return (
    <Animated.View entering={entering} style={styles.wrap}>
      {body}
      {!isViewer && <ChallengeTakeButton takeId={take.id} />}
    </Animated.View>
  );
}

export const TakeFeedItem = React.memo(TakeFeedItemBase);

function MediaFeedCard({
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
}: Omit<TakeFeedItemProps, 'index'>): React.JSX.Element {
  const t = useThemeColors();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const cardW = Math.round(width * 0.92);
  const media = take.media!;
  const still = resolveStillUrl(media);
  const isVideo = media.kind === 'video';
  const [failed, setFailed] = React.useState(false);
  const [swordKey, setSwordKey] = React.useState(0);
  const height = Math.min(560, Math.max(420, Math.round(width * 1.15)));
  const showImage = Boolean(still) && !failed;
  const hood = HOOD_LABEL[take.hood] ?? take.hood;
  const pulse = takePulse(take);

  React.useEffect(() => {
    setFailed(false);
  }, [still]);

  const clash = (): void => {
    setSwordKey((k) => k + 1);
    onOpenClash();
  };

  return (
    <PressableScale
      onPress={onOpenDetail}
      accessibilityRole="button"
      accessibilityLabel="Open take"
      style={[
        styles.card,
        {
          width: cardW,
          height,
          borderRadius: 28,
          shadowColor: t.shadowColor,
          backgroundColor: '#111113',
        },
      ]}
    >
      {showImage ? (
        <Image
          source={{ uri: still as string }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <LinearGradient
          colors={[...(media.colors.length >= 2 ? media.colors : (['#2A2A2E', '#111113'] as const))]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}

      <LinearGradient
        colors={['rgba(8,8,11,0.45)', 'transparent', 'transparent']}
        locations={[0, 0.28, 1]}
        style={styles.topVeil}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['transparent', 'rgba(8,8,11,0.35)', 'rgba(8,8,11,0.82)']}
        locations={[0.35, 0.62, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {isVideo ? (
        <View style={styles.playBadge} pointerEvents="none">
          <PlayIcon size={16} color="#FAFAF8" strokeWidth={2.4} />
        </View>
      ) : null}

      <View style={styles.mediaTop}>
        <Pressable
          onPress={() => {
            hapticTap();
            router.push(`/profile/${author.id}`);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Open ${author.name}'s profile`}
          style={styles.authorHit}
        >
          <Avatar name={author.name} tint={author.tint} size={28} />
          <View style={styles.authorMeta}>
            <Text allowFontScaling={false} style={styles.handleOnMedia} numberOfLines={1}>
              @{author.handle}
              {isViewer ? ' · You' : ''}
            </Text>
            <Text allowFontScaling={false} style={styles.hoodOnMedia} numberOfLines={1}>
              {hood} · {timeAgo(take.createdAt)}
              {pulse ? ` · ${pulseLabel(pulse)}` : ''}
            </Text>
          </View>
        </Pressable>
        <Pressable
          onPress={() => {
            hapticTap();
            onMore();
          }}
          accessibilityRole="button"
          accessibilityLabel="More take actions"
          hitSlop={8}
          style={styles.moreHit}
        >
          <MoreIcon size={18} color="#FAFAF8" strokeWidth={2.2} />
        </Pressable>
      </View>

      <View style={styles.mediaLower}>
        <Text allowFontScaling style={styles.mediaHeadline} numberOfLines={4}>
          {take.text}
        </Text>

        {topComment ? (
          <TakeStoryBeat
            comment={topComment}
            author={topCommentAuthor}
            clashCount={take.clashes}
            pulse={pulse}
            onOpen={onOpenDetail}
            onMedia
          />
        ) : take.clashes > 0 ? (
          <Text allowFontScaling={false} style={styles.clashHint}>
            {`⚔ CLASH ACTIVE · ${compact(take.clashes)} in the fight`}
          </Text>
        ) : null}

        <View style={styles.overlayActions}>
          <OverlayAction
            icon={ArrowBigUpIcon}
            label={compact(take.reactions)}
            active={hasReacted}
            onPress={onReact}
            a11y="React to this take"
          />
          <OverlayAction
            icon={CommentIcon}
            label={commentCount > 0 ? compact(commentCount) : ''}
            onPress={onOpenDetail}
            a11y="Open rebuttals"
          />
          <Pressable
            onPress={() => {
              hapticTap();
              clash();
            }}
            accessibilityRole="button"
            accessibilityLabel="Clash on this take"
            style={styles.clashOverlay}
          >
            <View style={styles.swordHit}>
              <CrossedSwords
                triggerKey={swordKey || null}
                size={28}
                color="#FAFAF8"
                cooldownMs={400}
                hapticOnImpact
              />
            </View>
            <ArenaIcon size={14} color="#111113" strokeWidth={2.6} />
            <Text allowFontScaling={false} style={styles.clashOverlayText}>
              CLASH
            </Text>
          </Pressable>
          <View style={{ flex: 1 }} />
          <OverlayAction
            icon={ShareIcon}
            label=""
            onPress={onShare}
            a11y="Share this take"
          />
          <OverlayAction
            icon={BookmarkIcon}
            label=""
            active={isSaved}
            onPress={onSave}
            a11y={isSaved ? 'Remove from saved' : 'Save this take'}
          />
        </View>
      </View>
    </PressableScale>
  );
}

function TextFeedCard({
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
}: Omit<TakeFeedItemProps, 'index'>): React.JSX.Element {
  const t = useThemeColors();
  const { width } = useWindowDimensions();
  const accent = arenaAccentForHood(take.hood, t.scheme, take.id);
  const cardW = Math.round(width * 0.92);
  const [swordKey, setSwordKey] = React.useState(0);
  const hood = HOOD_LABEL[take.hood] ?? take.hood;
  const pulse = takePulse(take);
  const clashTone = pulseAccent('clash', t.scheme);

  return (
    <PressableScale
      onPress={onOpenDetail}
      accessibilityRole="button"
      accessibilityLabel="Open take"
      style={[
        styles.textCard,
        {
          width: cardW,
          borderRadius: 26,
          backgroundColor: t.surface,
          shadowColor: t.shadowColor,
        },
      ]}
    >
      <View style={[styles.textBlob, { backgroundColor: accent.soft }]} />
      <View style={[styles.textEdge, { backgroundColor: accent.ink }]} />

      <View style={styles.textTop}>
        <Text allowFontScaling={false} style={[styles.hoodCaps, { color: accent.ink }]}>
          {hood.toUpperCase()}
          {pulse ? ` · ${pulseLabel(pulse)}` : ''}
        </Text>
        <Pressable
          onPress={() => {
            hapticTap();
            onMore();
          }}
          accessibilityRole="button"
          accessibilityLabel="More take actions"
          hitSlop={8}
        >
          <MoreIcon size={18} color={t.textMuted} strokeWidth={2.2} />
        </Pressable>
      </View>

      <Text
        allowFontScaling
        style={[styles.textHeadline, { color: t.textPrimary }]}
        numberOfLines={6}
      >
        {take.text}
      </Text>

      <Squiggle size={110} color={accent.ink} opacity={0.28} style={styles.textDoodle} />

      {topComment ? (
        <TakeStoryBeat
          comment={topComment}
          author={topCommentAuthor}
          clashCount={take.clashes}
          pulse={pulse}
          onOpen={onOpenDetail}
        />
      ) : take.clashes > 0 ? (
        <Text
          allowFontScaling={false}
          style={[styles.clashHintText, { color: clashTone?.ink ?? t.textMuted }]}
        >
          {`⚔ CLASH ACTIVE · ${compact(take.clashes)} in the fight`}
        </Text>
      ) : null}

      <View style={styles.textFooter}>
        <View style={styles.textAuthor}>
          <Avatar name={author.name} tint={author.tint} size={24} />
          <Text allowFontScaling={false} style={[styles.textHandle, { color: t.textMuted }]}>
            @{author.handle}
            {isViewer ? ' · You' : ''} · {timeAgo(take.createdAt)}
          </Text>
        </View>
        <View style={styles.textActions}>
          <TakeActionRow
            reactions={take.reactions}
            commentCount={commentCount}
            isSaved={isSaved}
            hasReacted={hasReacted}
            onReact={onReact}
            onComment={onOpenDetail}
            onClash={() => {
              setSwordKey((k) => k + 1);
              onOpenClash();
            }}
            onShare={onShare}
            onSave={onSave}
          />
          <View style={styles.swordAnchor} pointerEvents="none">
            <CrossedSwords
              triggerKey={swordKey || null}
              size={36}
              color={accent.ink}
              cooldownMs={400}
            />
          </View>
        </View>
      </View>
    </PressableScale>
  );
}

function OverlayAction({
  icon: Icon,
  label,
  active,
  onPress,
  a11y,
}: {
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  label: string;
  active?: boolean;
  onPress: () => void;
  a11y: string;
}): React.JSX.Element {
  const color = active ? '#FFFFFF' : 'rgba(250,250,248,0.88)';
  return (
    <Pressable
      onPress={() => {
        hapticTap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={active ? { selected: true } : undefined}
      style={styles.overlayAction}
      hitSlop={6}
    >
      <Icon size={17} color={color} strokeWidth={active ? 2.4 : 2.1} />
      {label ? (
        <Text allowFontScaling={false} style={[styles.overlayLabel, { color }]}>
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    marginBottom: space.lg,
  },
  card: {
    overflow: 'hidden',
    shadowOpacity: 0.14,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  topVeil: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 110,
  },
  playBadge: {
    position: 'absolute',
    top: '44%',
    left: '50%',
    marginLeft: -24,
    marginTop: -24,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(8,8,11,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaTop: {
    position: 'absolute',
    top: space.md,
    left: space.md,
    right: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 2,
  },
  authorHit: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  authorMeta: { flex: 1, gap: 1 },
  handleOnMedia: {
    ...typeScale.label,
    color: '#FAFAF8',
    fontSize: 13,
    fontWeight: '700',
  },
  hoodOnMedia: {
    ...typeScale.caption,
    color: 'rgba(250,250,248,0.72)',
    fontSize: 11,
    fontWeight: '600',
  },
  moreHit: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaLower: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    gap: space.md,
    zIndex: 2,
  },
  mediaHeadline: {
    ...typeScale.editorial,
    color: '#FAFAF8',
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  clashHint: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: 'rgba(250,250,248,0.72)',
  },
  clashHintText: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    marginTop: space.sm,
  },
  overlayActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  overlayAction: {
    minHeight: 40,
    minWidth: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 4,
  },
  overlayLabel: {
    ...typeScale.meta,
    fontSize: 13,
    fontWeight: '600',
  },
  clashOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FAFAF8',
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    minHeight: 34,
    position: 'relative',
  },
  clashOverlayText: {
    ...typeScale.label,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: '#111113',
  },
  swordHit: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCard: {
    overflow: 'hidden',
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.sm,
    minHeight: 280,
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  textBlob: {
    position: 'absolute',
    top: -40,
    right: -30,
    width: 160,
    height: 160,
    borderRadius: 80,
  },
  textEdge: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  textTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.md,
    zIndex: 1,
  },
  hoodCaps: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  textHeadline: {
    ...typeScale.editorial,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
    letterSpacing: -0.4,
    zIndex: 1,
    marginBottom: space.lg,
  },
  textDoodle: {
    marginBottom: space.md,
    opacity: 0.9,
  },
  textFooter: {
    marginTop: 'auto',
    gap: space.xs,
    zIndex: 1,
  },
  textAuthor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  textHandle: {
    ...typeScale.meta,
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  textActions: {
    position: 'relative',
  },
  swordAnchor: {
    position: 'absolute',
    left: '42%',
    top: -8,
  },
});
