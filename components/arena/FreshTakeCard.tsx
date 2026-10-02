/**
 * Fresh Takes card variants — editorial discovery, not identical stacked rows.
 * Pulse badges (CLASH LIVE / HOT / RISING) are derived only from real metrics.
 * Feed actions (save / share / more) stay available without cluttering the layout.
 */
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { HOOD_LABEL } from '../../data/hoods';
import type { Take, User } from '../../store';
import { layout, radius, space, typeScale, useThemeColors } from '../../theme';
import { compact, timeAgo } from '../../utils/format';
import { tap as hapticTap } from '../../utils/haptics';
import { takePulse, type TakePulse } from '../../utils/takePulse';
import { Avatar } from '../shared/Avatar';
import {
  ArenaIcon,
  BookmarkIcon,
  CommentIcon,
  FlameIcon,
  MoreIcon,
  PlayIcon,
  ShareIcon,
  ZapIcon,
} from '../shared/icons';
import { PressableScale } from '../shared/PressableScale';

export type FreshTakeVariant = 'lead' | 'media' | 'compact' | 'text';

export interface FreshTakeCardProps {
  take: Take;
  author: User;
  commentCount: number;
  hasReacted: boolean;
  isSaved: boolean;
  variant: FreshTakeVariant;
  index: number;
  now: number;
  onOpen: () => void;
  onClash: () => void;
  onReact: () => void;
  onSave: () => void;
  onShare: () => void;
  onMore: () => void;
}

/** Extreme ratios (docs / screenshots) stay contain; photo-like stay cover. */
function useSafeHeroFit(url: string | undefined): 'cover' | 'contain' {
  const [mode, setMode] = React.useState<'cover' | 'contain'>('cover');

  React.useEffect(() => {
    if (!url) {
      setMode('cover');
      return;
    }
    let cancelled = false;
    Image.getSize(
      url,
      (w, h) => {
        if (cancelled || w <= 0 || h <= 0) return;
        const r = w / h;
        // Match TakeMedia detail clamping intent: extreme tall/wide = documents.
        const documentLike = r < 0.72 || r > 1.55;
        setMode(documentLike ? 'contain' : 'cover');
      },
      () => {
        if (!cancelled) setMode('cover');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [url]);

  return mode;
}

function PulseChip({ pulse, tone }: { pulse: TakePulse; tone: string }): React.JSX.Element | null {
  if (!pulse) return null;
  const label = pulse === 'live' ? 'CLASH LIVE' : pulse === 'hot' ? 'HOT' : 'RISING';
  const Icon = pulse === 'live' ? ArenaIcon : pulse === 'hot' ? FlameIcon : ZapIcon;
  return (
    <View style={[styles.pulse, { backgroundColor: 'rgba(8,8,11,0.55)' }]}>
      <Icon size={10} color={tone} strokeWidth={2.4} />
      <Text allowFontScaling={false} style={[styles.pulseText, { color: tone }]}>
        {label}
      </Text>
    </View>
  );
}

function IconAction({
  label,
  onPress,
  children,
  active,
}: {
  label: string;
  onPress: () => void;
  children: React.ReactNode;
  active?: boolean;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={() => {
        hapticTap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={active ? { selected: true } : undefined}
      hitSlop={8}
      style={styles.iconHit}
    >
      {children}
    </Pressable>
  );
}

function FreshHeroMedia({
  url,
  isVideo,
  height,
  overlay,
}: {
  url: string;
  isVideo: boolean;
  height: number;
  overlay?: React.ReactNode;
}): React.JSX.Element {
  const t = useThemeColors();
  const mode = useSafeHeroFit(url);

  return (
    <View style={[styles.heroFrame, { height, backgroundColor: t.surfaceMuted }]}>
      {mode === 'contain' ? (
        <Image
          source={{ uri: url }}
          style={[StyleSheet.absoluteFill, { opacity: 0.32 }]}
          resizeMode="cover"
          blurRadius={28}
        />
      ) : null}
      <Image source={{ uri: url }} style={StyleSheet.absoluteFill} resizeMode={mode} />
      {mode === 'cover' ? (
        <LinearGradient
          colors={['transparent', 'rgba(8,8,11,0.78)']}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      ) : (
        <LinearGradient
          colors={['transparent', 'rgba(8,8,11,0.55)']}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      )}
      {isVideo ? (
        <View style={styles.playChip} pointerEvents="none">
          <PlayIcon size={18} color="#FAFAF8" strokeWidth={2.4} />
        </View>
      ) : null}
      {overlay}
    </View>
  );
}

export function FreshTakeCard({
  take,
  author,
  commentCount,
  hasReacted,
  isSaved,
  variant,
  index,
  now,
  onOpen,
  onClash,
  onReact,
  onSave,
  onShare,
  onMore,
}: FreshTakeCardProps): React.JSX.Element {
  const t = useThemeColors();
  const pulse = takePulse(take, now);
  const entering = FadeInDown.delay(Math.min(index, 6) * 40)
    .springify()
    .damping(18)
    .stiffness(210);
  const hood = HOOD_LABEL[take.hood] ?? take.hood;
  const hasMedia = Boolean(take.media?.url);
  const isVideo = take.media?.kind === 'video';
  const mediaUrl = take.media?.url;

  const metaActions = (
    <View style={styles.metaActions}>
      <IconAction label="Share this take" onPress={onShare}>
        <ShareIcon size={15} color={t.textMuted} strokeWidth={2.1} />
      </IconAction>
      <IconAction
        label={isSaved ? 'Remove from saved' : 'Save this take'}
        onPress={onSave}
        active={isSaved}
      >
        <BookmarkIcon
          size={15}
          color={isSaved ? t.textPrimary : t.textMuted}
          strokeWidth={isSaved ? 2.4 : 2.1}
        />
      </IconAction>
      <IconAction label="More take actions" onPress={onMore}>
        <MoreIcon size={16} color={t.textMuted} strokeWidth={2.2} />
      </IconAction>
    </View>
  );

  if (variant === 'lead') {
    return (
      <Animated.View entering={entering} style={styles.leadWrap}>
        <PressableScale onPress={onOpen} accessibilityRole="button" accessibilityLabel="Open take">
          <View style={[styles.lead, { backgroundColor: t.surface, borderColor: t.border }]}>
            {hasMedia && mediaUrl ? (
              <FreshHeroMedia
                url={mediaUrl}
                isVideo={isVideo}
                height={280}
                overlay={
                  <View style={styles.leadOverlay}>
                    <PulseChip pulse={pulse} tone="#FAFAF8" />
                    <Text allowFontScaling style={styles.leadHeadline} numberOfLines={3}>
                      {take.text}
                    </Text>
                    <View style={styles.metaRow}>
                      <Avatar name={author.name} tint={author.tint} size={22} />
                      <Text allowFontScaling={false} style={styles.leadMeta} numberOfLines={1}>
                        @{author.handle} · {hood} · {timeAgo(take.createdAt)}
                      </Text>
                    </View>
                  </View>
                }
              />
            ) : (
              <View style={[styles.leadTextOnly, { backgroundColor: t.surfaceMuted }]}>
                <View style={styles.leadTextTop}>
                  <PulseChip pulse={pulse} tone={t.clashText} />
                  <IconAction label="More take actions" onPress={onMore}>
                    <MoreIcon size={18} color={t.textMuted} strokeWidth={2.2} />
                  </IconAction>
                </View>
                <Text
                  allowFontScaling
                  style={[styles.leadHeadlineDark, { color: t.textPrimary }]}
                  numberOfLines={4}
                >
                  {take.text}
                </Text>
                <View style={styles.metaRow}>
                  <Avatar name={author.name} tint={author.tint} size={22} />
                  <Text
                    allowFontScaling={false}
                    style={[styles.metaMuted, { color: t.textMuted }]}
                    numberOfLines={1}
                  >
                    @{author.handle} · {hood} · {timeAgo(take.createdAt)}
                  </Text>
                </View>
              </View>
            )}
            <View style={styles.leadActions}>
              <Pressable
                onPress={() => {
                  hapticTap();
                  onReact();
                }}
                style={styles.stat}
                accessibilityRole="button"
                accessibilityLabel="React"
              >
                <FlameIcon
                  size={14}
                  color={hasReacted ? t.textPrimary : t.textMuted}
                  strokeWidth={hasReacted ? 2.4 : 2}
                />
                <Text
                  allowFontScaling={false}
                  style={[styles.statText, { color: hasReacted ? t.textPrimary : t.textMuted }]}
                >
                  {compact(take.reactions)}
                </Text>
              </Pressable>
              <View style={styles.stat}>
                <CommentIcon size={14} color={t.textMuted} strokeWidth={2} />
                <Text allowFontScaling={false} style={[styles.statText, { color: t.textMuted }]}>
                  {compact(commentCount)}
                </Text>
              </View>
              {take.clashes > 0 ? (
                <Pressable
                  onPress={() => {
                    hapticTap();
                    onClash();
                  }}
                  style={[styles.clashPill, { backgroundColor: t.clashFill }]}
                  accessibilityRole="button"
                  accessibilityLabel="Open Clash"
                >
                  <ArenaIcon size={11} color={t.clashText} strokeWidth={2.6} />
                  <Text allowFontScaling={false} style={[styles.clashPillText, { color: t.clashText }]}>
                    VS · {take.clashes}
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => {
                    hapticTap();
                    onClash();
                  }}
                  style={styles.stat}
                  accessibilityRole="button"
                  accessibilityLabel="Clash"
                >
                  <ArenaIcon size={13} color={t.textMuted} strokeWidth={2.2} />
                  <Text allowFontScaling={false} style={[styles.statText, { color: t.textMuted }]}>
                    Clash
                  </Text>
                </Pressable>
              )}
              <View style={styles.spacer} />
              {metaActions}
            </View>
          </View>
        </PressableScale>
      </Animated.View>
    );
  }

  if (variant === 'compact') {
    return (
      <Animated.View entering={entering} style={styles.padX}>
        <PressableScale onPress={onOpen} accessibilityRole="button" accessibilityLabel="Open take">
          <View style={[styles.compact, { backgroundColor: t.surface, borderColor: t.border }]}>
            {hasMedia && mediaUrl ? (
              <View style={[styles.compactThumb, { backgroundColor: t.surfaceMuted }]}>
                <CompactThumb url={mediaUrl} isVideo={isVideo} />
              </View>
            ) : (
              <View style={[styles.compactThumb, { backgroundColor: t.surfaceMuted }]} />
            )}
            <View style={styles.compactBody}>
              <Text
                allowFontScaling
                style={[styles.compactText, { color: t.textPrimary }]}
                numberOfLines={3}
              >
                {take.text}
              </Text>
              <Text allowFontScaling={false} style={[styles.metaMuted, { color: t.textMuted }]} numberOfLines={1}>
                @{author.handle} · {hood} · {compact(take.reactions)} reacts
                {take.clashes > 0 ? ` · ${take.clashes} clash` : ''}
              </Text>
            </View>
            <View style={styles.compactTrail}>
              {pulse === 'live' ? <PulseChip pulse={pulse} tone={t.clashText} /> : null}
              {metaActions}
            </View>
          </View>
        </PressableScale>
      </Animated.View>
    );
  }

  // media | text variants share a quieter editorial block
  return (
    <Animated.View entering={entering} style={styles.padX}>
      <PressableScale onPress={onOpen} accessibilityRole="button" accessibilityLabel="Open take">
        <View style={[styles.card, { borderColor: t.border }]}>
          <View style={styles.cardHead}>
            <Avatar name={author.name} tint={author.tint} size={28} />
            <View style={styles.cardHeadText}>
              <Text allowFontScaling={false} style={[styles.cardAuthor, { color: t.textPrimary }]} numberOfLines={1}>
                @{author.handle}
                <Text style={{ color: t.textMuted }}> · {hood}</Text>
              </Text>
              <Text allowFontScaling={false} style={[styles.metaMuted, { color: t.textMuted }]}>
                {timeAgo(take.createdAt)}
              </Text>
            </View>
            <PulseChip pulse={pulse} tone={t.clashText} />
            <IconAction label="More take actions" onPress={onMore}>
              <MoreIcon size={18} color={t.textMuted} strokeWidth={2.2} />
            </IconAction>
          </View>
          <Text
            allowFontScaling
            style={[
              variant === 'text' ? styles.textHero : styles.cardText,
              { color: t.textPrimary },
            ]}
            numberOfLines={variant === 'text' ? 5 : 3}
          >
            {take.text}
          </Text>
          {variant === 'media' && hasMedia && mediaUrl ? (
            <FreshHeroMedia url={mediaUrl} isVideo={isVideo} height={168} />
          ) : null}
          <View style={styles.leadActions}>
            <Pressable
              onPress={() => {
                hapticTap();
                onReact();
              }}
              style={styles.stat}
              accessibilityRole="button"
              accessibilityLabel="React"
            >
              <FlameIcon
                size={13}
                color={hasReacted ? t.textPrimary : t.textMuted}
                strokeWidth={hasReacted ? 2.4 : 2}
              />
              <Text
                allowFontScaling={false}
                style={[styles.statText, { color: hasReacted ? t.textPrimary : t.textMuted }]}
              >
                {compact(take.reactions)}
              </Text>
            </Pressable>
            <View style={styles.stat}>
              <CommentIcon size={13} color={t.textMuted} strokeWidth={2} />
              <Text allowFontScaling={false} style={[styles.statText, { color: t.textMuted }]}>
                {compact(commentCount)}
              </Text>
            </View>
            {take.clashes > 0 ? (
              <Pressable
                onPress={() => {
                  hapticTap();
                  onClash();
                }}
                style={[styles.clashPill, { backgroundColor: t.clashFill }]}
                accessibilityRole="button"
                accessibilityLabel="Open Clash"
              >
                <Text allowFontScaling={false} style={[styles.clashPillText, { color: t.clashText }]}>
                  CLASH LIVE
                </Text>
              </Pressable>
            ) : null}
            <View style={styles.spacer} />
            <View style={styles.metaActions}>
              <IconAction label="Share this take" onPress={onShare}>
                <ShareIcon size={15} color={t.textMuted} strokeWidth={2.1} />
              </IconAction>
              <IconAction
                label={isSaved ? 'Remove from saved' : 'Save this take'}
                onPress={onSave}
                active={isSaved}
              >
                <BookmarkIcon
                  size={15}
                  color={isSaved ? t.textPrimary : t.textMuted}
                  strokeWidth={isSaved ? 2.4 : 2.1}
                />
              </IconAction>
            </View>
          </View>
        </View>
      </PressableScale>
    </Animated.View>
  );
}

function CompactThumb({ url, isVideo }: { url: string; isVideo: boolean }): React.JSX.Element {
  const mode = useSafeHeroFit(url);
  return (
    <>
      <Image source={{ uri: url }} style={StyleSheet.absoluteFill} resizeMode={mode} />
      {isVideo ? (
        <View style={styles.playMini} pointerEvents="none">
          <PlayIcon size={12} color="#FAFAF8" strokeWidth={2.4} />
        </View>
      ) : null}
    </>
  );
}

/** Assign mixed layouts without inventing engagement numbers. */
export function freshTakeVariant(take: Take, index: number): FreshTakeVariant {
  if (index === 0) return 'lead';
  if (take.media?.url) return index % 3 === 1 ? 'compact' : 'media';
  return index % 2 === 0 ? 'text' : 'compact';
}

const styles = StyleSheet.create({
  leadWrap: { paddingHorizontal: layout.screenX, marginBottom: space.md },
  padX: { paddingHorizontal: layout.screenX, marginBottom: space.md },
  lead: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  heroFrame: {
    width: '100%',
    justifyContent: 'flex-end',
    overflow: 'hidden',
    borderRadius: radius.lg,
  },
  leadTextOnly: { padding: space.lg, gap: space.md, minHeight: 200, justifyContent: 'flex-end' },
  leadTextTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  leadOverlay: { padding: space.lg, gap: space.sm },
  leadHeadline: {
    ...typeScale.takeText,
    color: '#FAFAF8',
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  leadHeadlineDark: {
    ...typeScale.takeText,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  leadActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  leadMeta: { ...typeScale.caption, color: 'rgba(250,250,248,0.78)', flexShrink: 1, fontSize: 12 },
  metaMuted: { ...typeScale.caption, fontSize: 11, flexShrink: 1 },
  pulse: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  pulseText: { ...typeScale.caption, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  playChip: {
    position: 'absolute',
    top: '42%',
    alignSelf: 'center',
    left: '46%',
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,8,11,0.45)',
  },
  playMini: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,8,11,0.28)',
  },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText: { ...typeScale.meta, fontSize: 12 },
  clashPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  clashPillText: { ...typeScale.caption, fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  spacer: { flex: 1, minWidth: 4 },
  metaActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  iconHit: {
    minWidth: 32,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.sm,
    minHeight: 88,
  },
  compactThumb: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  compactBody: { flex: 1, gap: 4, minWidth: 0 },
  compactText: { ...typeScale.body, fontSize: 15, lineHeight: 20, fontWeight: '600' },
  compactTrail: { alignItems: 'flex-end', gap: 4 },
  card: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: space.md,
    gap: space.sm,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  cardHeadText: { flex: 1, minWidth: 0 },
  cardAuthor: { ...typeScale.label, fontSize: 13, fontWeight: '700' },
  cardText: { ...typeScale.takeText, fontSize: 17, lineHeight: 24, fontWeight: '600' },
  textHero: { ...typeScale.takeText, fontSize: 20, lineHeight: 28, fontWeight: '700', letterSpacing: -0.2 },
});
