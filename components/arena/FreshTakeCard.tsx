/**
 * Fresh Takes — editorial discovery cards.
 * Pulse badges (IN A CLASH / HOT / RISING) come only from real metrics.
 */
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { HOOD_LABEL } from '../../data/hoods';
import type { Take, User } from '../../store';
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
import { pulseLabel, takePulse, type TakePulse } from '../../utils/takePulse';
import { Avatar } from '../shared/Avatar';
import { Squiggle } from '../shared/Doodles';
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

export type FreshTakeVariant = 'lead' | 'media' | 'compact' | 'text' | 'clash';

export interface FreshTakeCardProps {
  take: Take;
  author: User;
  commentCount: number;
  hasReacted: boolean;
  isSaved: boolean;
  variant: FreshTakeVariant;
  index: number;
  now: number;
  /** Compact grid cell — fills half width. */
  grid?: boolean;
  /** Inside a stage layer — no outer padding; fills parent. */
  embedded?: boolean;
  onOpen: () => void;
  onClash: () => void;
  onReact: () => void;
  onSave: () => void;
  onShare: () => void;
  onMore: () => void;
}

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
        setMode(r < 0.72 || r > 1.55 ? 'contain' : 'cover');
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

function PulseChip({ pulse }: { pulse: TakePulse }): React.JSX.Element | null {
  const t = useThemeColors();
  const accent = pulseAccent(pulse, t.scheme);
  if (!pulse || !accent) return null;
  const Icon = pulse === 'clash' ? ArenaIcon : pulse === 'hot' ? FlameIcon : ZapIcon;
  return (
    <View style={[styles.pulse, { backgroundColor: accent.soft }]}>
      <Icon size={10} color={accent.ink} strokeWidth={2.4} />
      <Text allowFontScaling={false} style={[styles.pulseText, { color: accent.ink }]}>
        {pulseLabel(pulse)}
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
  radiusPx,
}: {
  url: string;
  isVideo: boolean;
  height: number;
  overlay?: React.ReactNode;
  radiusPx?: number;
}): React.JSX.Element {
  const t = useThemeColors();
  const mode = useSafeHeroFit(url);

  return (
    <View
      style={[
        styles.heroFrame,
        { height, backgroundColor: t.surfaceMuted, borderRadius: radiusPx ?? radius.xl },
      ]}
    >
      {mode === 'contain' ? (
        <Image
          source={{ uri: url }}
          style={[StyleSheet.absoluteFill, { opacity: 0.32 }]}
          resizeMode="cover"
          blurRadius={28}
        />
      ) : null}
      <Image source={{ uri: url }} style={StyleSheet.absoluteFill} resizeMode={mode} />
      <LinearGradient
        colors={
          mode === 'cover'
            ? ['transparent', 'rgba(8,8,11,0.78)']
            : ['transparent', 'rgba(8,8,11,0.55)']
        }
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {isVideo ? (
        <View style={styles.playChip} pointerEvents="none">
          <PlayIcon size={18} color="#FAFAF8" strokeWidth={2.4} />
        </View>
      ) : null}
      {overlay}
    </View>
  );
}

/**
 * Full-bleed cinematic plate for embedded Fresh Takes.
 * Static image/poster only — never mounts a video player.
 */
function CinematicBackdrop({
  url,
  colors,
  isVideo,
}: {
  url?: string;
  colors: readonly [string, string, ...string[]];
  isVideo: boolean;
}): React.JSX.Element {
  const reduced = useReducedMotion();
  const drift = useSharedValue(0);
  const mode = useSafeHeroFit(url);

  React.useEffect(() => {
    if (reduced || !url) {
      drift.value = 0;
      return;
    }
    drift.value = withRepeat(
      withTiming(1, { duration: 4200, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [drift, reduced, url]);

  const mediaStyle = useAnimatedStyle(() => ({
    transform: reduced || !url ? [] : [{ translateX: drift.value * 3 }, { scale: 1.04 }],
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {url ? (
        <Animated.View style={[StyleSheet.absoluteFill, mediaStyle]}>
          {mode === 'contain' ? (
            <Image
              source={{ uri: url }}
              style={[StyleSheet.absoluteFill, { opacity: 0.4 }]}
              resizeMode="cover"
              blurRadius={32}
            />
          ) : null}
          <Image source={{ uri: url }} style={StyleSheet.absoluteFill} resizeMode={mode} />
        </Animated.View>
      ) : (
        <LinearGradient colors={[...colors]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      )}
      {/* Soft overall tint — faint, keeps photo recognizable */}
      <View style={styles.cinematicTint} />
      {/* Localized readability veil — denser near the text band */}
      <LinearGradient
        colors={['rgba(8,8,11,0.05)', 'rgba(8,8,11,0.28)', 'rgba(8,8,11,0.78)']}
        locations={[0, 0.42, 1]}
        style={StyleSheet.absoluteFill}
      />
      {isVideo ? (
        <View style={styles.videoBadge} pointerEvents="none">
          <PlayIcon size={12} color="#FAFAF8" strokeWidth={2.6} />
          <Text allowFontScaling={false} style={styles.videoBadgeText}>
            VIDEO
          </Text>
        </View>
      ) : null}
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
  grid = false,
  embedded = false,
  onOpen,
  onClash,
  onReact,
  onSave,
  onShare,
  onMore,
}: FreshTakeCardProps): React.JSX.Element {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const pulse = takePulse(take, now);
  const hoodAccent = arenaAccentForHood(take.hood, t.scheme, take.id);
  const entering =
    reduced || embedded
      ? undefined
      : FadeInDown.delay(Math.min(index, 6) * 36)
          .springify()
          .damping(20)
          .stiffness(240);
  const hood = HOOD_LABEL[take.hood] ?? take.hood;
  const hasMedia = Boolean(take.media?.url);
  const isVideo = take.media?.kind === 'video';
  const mediaUrl = take.media?.url;
  const wrapStyle = embedded
    ? styles.embeddedWrap
    : grid
      ? styles.gridCell
      : variant === 'lead'
        ? styles.leadWrap
        : styles.padX;

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
    const cinematic = Boolean(hasMedia);
    const posterUrl = take.media?.url;
    const mediaColors = take.media?.colors ?? (['#2A2A2E', '#111113'] as const);

    return (
      <Animated.View entering={entering} style={wrapStyle}>
        <PressableScale
          onPress={onOpen}
          accessibilityRole="button"
          accessibilityLabel="Open take"
          style={embedded ? styles.embeddedPress : undefined}
        >
          <View
            style={[
              styles.lead,
              embedded && styles.leadFill,
              {
                backgroundColor: cinematic ? '#111113' : t.surface,
                borderColor: t.border,
                shadowColor: t.shadowColor,
              },
            ]}
          >
            {cinematic ? (
              <>
                <CinematicBackdrop url={posterUrl} colors={mediaColors} isVideo={isVideo} />
                <View style={[styles.cinematicContent, embedded && styles.cinematicContentFill]}>
                  <PulseChip pulse={pulse} />
                  <Text allowFontScaling style={styles.cinematicHeadline} numberOfLines={5}>
                    {take.text}
                  </Text>
                  <View style={styles.metaRow}>
                    <Avatar name={author.name} tint={author.tint} size={22} />
                    <Text allowFontScaling={false} style={styles.leadMeta} numberOfLines={1}>
                      @{author.handle} · {hood} · {timeAgo(take.createdAt)}
                    </Text>
                  </View>
                </View>
              </>
            ) : (
              <View style={[styles.leadTextOnly, embedded && styles.leadTextFill]}>
                <View style={[styles.textAccentPanel, { backgroundColor: hoodAccent.soft }]} />
                <View style={[styles.leadAccentBlobLarge, { backgroundColor: hoodAccent.deep }]} />
                <View style={[styles.textAccentEdge, { backgroundColor: hoodAccent.ink }]} />
                <View style={styles.leadTextTop}>
                  <PulseChip pulse={pulse} />
                  <IconAction label="More take actions" onPress={onMore}>
                    <MoreIcon size={18} color={t.textMuted} strokeWidth={2.2} />
                  </IconAction>
                </View>
                <Text
                  allowFontScaling
                  style={[styles.leadHeadlineDark, { color: t.textPrimary }]}
                  numberOfLines={5}
                >
                  {take.text}
                </Text>
                <Squiggle size={96} color={hoodAccent.ink} opacity={0.35} style={styles.leadSquiggle} />
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
            <View style={[styles.leadActions, cinematic && styles.leadActionsOnMedia]}>
              <ActionStat
                label="React"
                onPress={onReact}
                icon={
                  <FlameIcon
                    size={14}
                    color={
                      hasReacted
                        ? cinematic
                          ? '#FAFAF8'
                          : hoodAccent.ink
                        : cinematic
                          ? 'rgba(250,250,248,0.7)'
                          : t.textMuted
                    }
                    strokeWidth={hasReacted ? 2.4 : 2}
                  />
                }
                value={compact(take.reactions)}
                color={
                  hasReacted
                    ? cinematic
                      ? '#FAFAF8'
                      : hoodAccent.ink
                    : cinematic
                      ? 'rgba(250,250,248,0.72)'
                      : t.textMuted
                }
              />
              <View style={styles.stat}>
                <CommentIcon
                  size={14}
                  color={cinematic ? 'rgba(250,250,248,0.7)' : t.textMuted}
                  strokeWidth={2}
                />
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.statText,
                    { color: cinematic ? 'rgba(250,250,248,0.72)' : t.textMuted },
                  ]}
                >
                  {compact(commentCount)}
                </Text>
              </View>
              <ClashAction take={take} onClash={onClash} onMedia={cinematic} />
              <View style={styles.spacer} />
              {cinematic ? (
                <View style={styles.metaActions}>
                  <IconAction label="Share this take" onPress={onShare}>
                    <ShareIcon size={15} color="rgba(250,250,248,0.75)" strokeWidth={2.1} />
                  </IconAction>
                  <IconAction
                    label={isSaved ? 'Remove from saved' : 'Save this take'}
                    onPress={onSave}
                    active={isSaved}
                  >
                    <BookmarkIcon
                      size={15}
                      color={isSaved ? '#FAFAF8' : 'rgba(250,250,248,0.75)'}
                      strokeWidth={isSaved ? 2.4 : 2.1}
                    />
                  </IconAction>
                  <IconAction label="More take actions" onPress={onMore}>
                    <MoreIcon size={16} color="rgba(250,250,248,0.75)" strokeWidth={2.2} />
                  </IconAction>
                </View>
              ) : (
                metaActions
              )}
            </View>
          </View>
        </PressableScale>
      </Animated.View>
    );
  }

  if (variant === 'clash') {
    const accent = pulseAccent('clash', t.scheme)!;
    const cinematic = Boolean(hasMedia);
    const posterUrl = take.media?.url;
    const mediaColors = take.media?.colors ?? (['#2A2A2E', '#111113'] as const);

    return (
      <Animated.View entering={entering} style={wrapStyle}>
        <PressableScale
          onPress={onOpen}
          accessibilityRole="button"
          accessibilityLabel="Open take in Clash"
          style={embedded ? styles.embeddedPress : undefined}
        >
          <View
            style={[
              styles.clashCard,
              embedded && styles.leadFill,
              cinematic && styles.clashCinematic,
              {
                backgroundColor: cinematic ? '#111113' : t.surface,
                borderColor: accent.ink,
                shadowColor: t.shadowColor,
              },
            ]}
          >
            {cinematic ? (
              <>
                <CinematicBackdrop url={posterUrl} colors={mediaColors} isVideo={isVideo} />
                <View style={[styles.clashStripTop, { backgroundColor: accent.ink }]} />
                <View style={[styles.clashBody, styles.clashBodyOnMedia]}>
                  <PulseChip pulse="clash" />
                  <Text allowFontScaling style={styles.cinematicHeadline} numberOfLines={4}>
                    {take.text}
                  </Text>
                  <Text allowFontScaling={false} style={styles.leadMeta} numberOfLines={1}>
                    @{author.handle} · {hood} · {take.clashes} active
                  </Text>
                  <View style={styles.leadActions}>
                    <Pressable
                      onPress={() => {
                        hapticTap();
                        onClash();
                      }}
                      style={[styles.clashPill, { backgroundColor: accent.soft }]}
                      accessibilityRole="button"
                      accessibilityLabel="Open Clash"
                    >
                      <ArenaIcon size={12} color={accent.ink} strokeWidth={2.6} />
                      <Text allowFontScaling={false} style={[styles.clashPillText, { color: accent.ink }]}>
                        Enter Clash
                      </Text>
                    </Pressable>
                    <View style={styles.spacer} />
                    {metaActions}
                  </View>
                </View>
              </>
            ) : (
              <>
                <View style={[styles.clashStrip, { backgroundColor: accent.ink }]} />
                <View style={styles.clashBody}>
                  <PulseChip pulse="clash" />
                  <Text
                    allowFontScaling
                    style={[styles.clashTitle, { color: t.textPrimary }]}
                    numberOfLines={3}
                  >
                    {take.text}
                  </Text>
                  <Text allowFontScaling={false} style={[styles.metaMuted, { color: t.textMuted }]} numberOfLines={1}>
                    @{author.handle} · {hood} · {take.clashes} active
                  </Text>
                  <View style={styles.leadActions}>
                    <Pressable
                      onPress={() => {
                        hapticTap();
                        onClash();
                      }}
                      style={[styles.clashPill, { backgroundColor: accent.soft }]}
                      accessibilityRole="button"
                      accessibilityLabel="Open Clash"
                    >
                      <ArenaIcon size={12} color={accent.ink} strokeWidth={2.6} />
                      <Text allowFontScaling={false} style={[styles.clashPillText, { color: accent.ink }]}>
                        Enter Clash
                      </Text>
                    </Pressable>
                    <View style={styles.spacer} />
                    {metaActions}
                  </View>
                </View>
              </>
            )}
          </View>
        </PressableScale>
      </Animated.View>
    );
  }

  if (variant === 'compact') {
    return (
      <Animated.View entering={entering} style={wrapStyle}>
        <PressableScale
          onPress={onOpen}
          accessibilityRole="button"
          accessibilityLabel="Open take"
          style={grid || embedded ? styles.gridPress : undefined}
        >
          <View
            style={[
              grid || embedded ? styles.compactGrid : styles.compact,
              {
                backgroundColor: t.surface,
                borderColor: t.border,
                shadowColor: t.shadowColor,
              },
            ]}
          >
            <View style={[styles.compactAccent, { backgroundColor: hoodAccent.soft }]} />
            {hasMedia && mediaUrl ? (
              <View style={[styles.compactThumb, (grid || embedded) && styles.compactThumbWide, { backgroundColor: t.surfaceMuted }]}>
                <CompactThumb url={mediaUrl} isVideo={isVideo} />
              </View>
            ) : null}
            <View style={styles.compactBody}>
              {pulse ? <PulseChip pulse={pulse} /> : null}
              <Text
                allowFontScaling
                style={[styles.compactText, { color: t.textPrimary }]}
                numberOfLines={grid || embedded ? 4 : 3}
              >
                {take.text}
              </Text>
              <Text allowFontScaling={false} style={[styles.metaMuted, { color: t.textMuted }]} numberOfLines={1}>
                @{author.handle} · {compact(take.reactions)}
              </Text>
            </View>
          </View>
        </PressableScale>
      </Animated.View>
    );
  }

  // media | text
  return (
    <Animated.View entering={entering} style={wrapStyle}>
      <PressableScale
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel="Open take"
        style={embedded ? styles.embeddedPress : undefined}
      >
        <View
          style={[
            styles.card,
            embedded && styles.leadFill,
            {
              backgroundColor: t.surface,
              borderColor: t.border,
              shadowColor: t.shadowColor,
            },
          ]}
        >
          <View style={[styles.cardAccent, { backgroundColor: hoodAccent.soft }]} />
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
            <PulseChip pulse={pulse} />
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
          {variant === 'text' ? (
            <Squiggle size={72} color={hoodAccent.ink} opacity={0.22} style={styles.textSquiggle} />
          ) : null}
          {variant === 'media' && hasMedia && mediaUrl ? (
            <FreshHeroMedia url={mediaUrl} isVideo={isVideo} height={embedded ? 140 : 180} radiusPx={radius.lg} />
          ) : null}
          <View style={styles.leadActions}>
            <ActionStat
              label="React"
              onPress={onReact}
              icon={
                <FlameIcon
                  size={13}
                  color={hasReacted ? hoodAccent.ink : t.textMuted}
                  strokeWidth={hasReacted ? 2.4 : 2}
                />
              }
              value={compact(take.reactions)}
              color={hasReacted ? hoodAccent.ink : t.textMuted}
            />
            <View style={styles.stat}>
              <CommentIcon size={13} color={t.textMuted} strokeWidth={2} />
              <Text allowFontScaling={false} style={[styles.statText, { color: t.textMuted }]}>
                {compact(commentCount)}
              </Text>
            </View>
            {take.clashes > 0 ? <ClashAction take={take} onClash={onClash} /> : null}
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

function ClashAction({
  take,
  onClash,
  onMedia = false,
}: {
  take: Take;
  onClash: () => void;
  onMedia?: boolean;
}): React.JSX.Element {
  const t = useThemeColors();
  const accent = pulseAccent('clash', t.scheme)!;
  if (take.clashes > 0) {
    return (
      <Pressable
        onPress={() => {
          hapticTap();
          onClash();
        }}
        style={[styles.clashPill, { backgroundColor: onMedia ? 'rgba(255,255,255,0.16)' : accent.soft }]}
        accessibilityRole="button"
        accessibilityLabel="Open Clash"
      >
        <ArenaIcon size={11} color={onMedia ? '#FAFAF8' : accent.ink} strokeWidth={2.6} />
        <Text
          allowFontScaling={false}
          style={[styles.clashPillText, { color: onMedia ? '#FAFAF8' : accent.ink }]}
        >
          CLASH · {take.clashes}
        </Text>
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={() => {
        hapticTap();
        onClash();
      }}
      style={styles.stat}
      accessibilityRole="button"
      accessibilityLabel="Clash"
    >
      <ArenaIcon
        size={13}
        color={onMedia ? 'rgba(250,250,248,0.7)' : t.textMuted}
        strokeWidth={2.2}
      />
      <Text
        allowFontScaling={false}
        style={[styles.statText, { color: onMedia ? 'rgba(250,250,248,0.72)' : t.textMuted }]}
      >
        Clash
      </Text>
    </Pressable>
  );
}

function ActionStat({
  label,
  onPress,
  icon,
  value,
  color,
}: {
  label: string;
  onPress: () => void;
  icon: React.ReactNode;
  value: string;
  color: string;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={() => {
        hapticTap();
        onPress();
      }}
      style={styles.stat}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {icon}
      <Text allowFontScaling={false} style={[styles.statText, { color }]}>
        {value}
      </Text>
    </Pressable>
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
  if (take.clashes > 0 && index === 3) return 'clash';
  if (take.media?.url) return index % 3 === 1 ? 'compact' : 'media';
  return index % 2 === 0 ? 'text' : 'compact';
}

const styles = StyleSheet.create({
  leadWrap: { paddingHorizontal: layout.screenX, marginBottom: space.md },
  padX: { paddingHorizontal: layout.screenX, marginBottom: space.md },
  gridCell: { flex: 1, marginBottom: space.md },
  gridPress: { flex: 1 },
  embeddedWrap: { flex: 1 },
  embeddedPress: { flex: 1 },
  lead: {
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  leadFill: { flex: 1 },
  leadTextFill: { flex: 1, minHeight: 0 },
  leadAccentBlob: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    top: -48,
    right: -36,
    zIndex: 0,
  },
  leadAccentBlobLarge: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    top: -70,
    right: -60,
    zIndex: 0,
  },
  textAccentPanel: {
    position: 'absolute',
    left: -8,
    top: '28%',
    width: '62%',
    height: '48%',
    borderRadius: 28,
    opacity: 0.9,
    zIndex: 0,
  },
  textAccentEdge: {
    position: 'absolute',
    left: 0,
    top: 24,
    bottom: 24,
    width: 5,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
    zIndex: 1,
  },
  cinematicTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,8,11,0.12)',
  },
  cinematicContent: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.sm,
    gap: space.sm,
    zIndex: 1,
    minHeight: 220,
  },
  cinematicContentFill: {
    minHeight: 0,
  },
  cinematicHeadline: {
    ...typeScale.takeText,
    color: '#FAFAF8',
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '800',
    letterSpacing: -0.45,
  },
  videoBadge: {
    position: 'absolute',
    top: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(8,8,11,0.45)',
  },
  videoBadgeText: {
    ...typeScale.caption,
    color: '#FAFAF8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  leadActionsOnMedia: {
    backgroundColor: 'rgba(8,8,11,0.28)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  heroFrame: {
    width: '100%',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  leadTextOnly: {
    padding: space.lg,
    gap: space.md,
    minHeight: 220,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  leadTextTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  leadSquiggle: { marginTop: -4 },
  textSquiggle: { marginTop: -2, marginBottom: 2 },
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
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
    letterSpacing: -0.35,
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
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.sm,
    minHeight: 88,
    overflow: 'hidden',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  compactGrid: {
    flex: 1,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.sm,
    minHeight: 168,
    overflow: 'hidden',
    gap: space.xs,
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  compactAccent: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
    top: -20,
    right: -16,
  },
  compactThumb: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  compactThumbWide: {
    width: '100%',
    height: 88,
    borderRadius: radius.lg,
  },
  compactBody: { flex: 1, gap: 4, minWidth: 0 },
  compactText: { ...typeScale.body, fontSize: 15, lineHeight: 20, fontWeight: '600' },
  card: {
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.md,
    gap: space.sm,
    overflow: 'hidden',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  cardAccent: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    top: -30,
    right: -24,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  cardHeadText: { flex: 1, minWidth: 0 },
  cardAuthor: { ...typeScale.label, fontSize: 13, fontWeight: '700' },
  cardText: { ...typeScale.takeText, fontSize: 17, lineHeight: 24, fontWeight: '600' },
  textHero: {
    ...typeScale.takeText,
    fontSize: 21,
    lineHeight: 28,
    fontWeight: '700',
    letterSpacing: -0.25,
  },
  clashCard: {
    flexDirection: 'row',
    borderRadius: 24,
    borderWidth: 1.5,
    overflow: 'hidden',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  clashCinematic: {
    flexDirection: 'column',
  },
  clashStrip: { width: 5 },
  clashStripTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    zIndex: 2,
  },
  clashBody: { flex: 1, padding: space.md, gap: space.sm },
  clashBodyOnMedia: {
    paddingTop: space.lg,
    justifyContent: 'flex-end',
    zIndex: 1,
  },
  clashTitle: {
    ...typeScale.takeText,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
});
