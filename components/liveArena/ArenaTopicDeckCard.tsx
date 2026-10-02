import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { HOOD_LABEL } from '../../data/hoods';
import type {
  LiveArgumentExcerpt,
  LiveArenaTopic,
  LiveReactionSignal,
  LiveTopicPresence,
  Stance,
} from '../../services/liveArenaService';
import type { HoodId } from '../../store/types';
import {
  arenaAccentForHood,
  layout,
  radius,
  space,
  typeScale,
  useThemeColors,
  type SemanticTheme,
} from '../../theme';
import { plural } from '../../utils/format';
import { tap as hapticTap } from '../../utils/haptics';
import { CrossedSwords } from '../clash/CrossedSwords';
import { Avatar } from '../shared/Avatar';
import { PressableScale } from '../shared/PressableScale';
import { LiveArgumentPreview } from './LiveArgumentPreview';
import { LivePulse } from './LivePulse';
import { phaseLabel, secondsLabel, softFill, STANCE_LABEL } from './liveArenaStyles';

export type DeckCardTone = 0 | 1 | 2;

export interface ArenaTopicDeckCardProps {
  topic: LiveArenaTopic;
  /** Front card shows full CTAs; peeks stay editorial summaries. */
  active: boolean;
  /** Surface / shadow variation across the stack. */
  tone: DeckCardTone;
  /** Real live excerpts — only wired for the active card. */
  excerpts?: readonly LiveArgumentExcerpt[];
  presence?: readonly LiveTopicPresence[];
  signals?: readonly LiveReactionSignal[];
  burstText?: string | null;
  /** Changes when the active topic first appears / swaps — drives sword play. */
  swordKey?: string | number | null;
  onOpen: () => void;
  onChoose: (stance: Stance) => void;
  onWatch: () => void;
  onEnter: () => void;
  onJoinDebate: () => void;
  /** Peek cards only — bring this topic forward. */
  onBringForward?: () => void;
}

/**
 * Editorial surface inside the Arena topic deck.
 * Active card is a lightweight live window; peeks stay calm summaries.
 */
export function ArenaTopicDeckCard({
  topic,
  active,
  tone,
  excerpts = [],
  presence = [],
  signals = [],
  burstText = null,
  swordKey = null,
  onOpen,
  onChoose,
  onWatch,
  onEnter,
  onJoinDebate,
  onBringForward,
}: ArenaTopicDeckCardProps): React.JSX.Element {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const accent = arenaAccentForHood(topic.hood, t.scheme, topic.id);
  const surface = deckSurface(t, tone);
  const closed = topic.phase === 'closed';
  const settled = topic.viewerRoomStatus === 'SETTLED';
  const isSpectator = topic.viewerJoined && topic.viewerRole === 'spectator';
  const isDebater = topic.viewerJoined && !isSpectator;
  const canJoin = !topic.viewerJoined && !closed && topic.status === 'live';
  const stance = topic.viewerStance ?? topic.viewerFinalStance;
  const hood = hoodDisplayName(topic.hood);
  const corner = active ? 30 : 26;
  const enterOpacity = useSharedValue(reduced ? 1 : 0);

  React.useEffect(() => {
    if (!active || reduced) {
      enterOpacity.value = 1;
      return;
    }
    enterOpacity.value = 0;
    enterOpacity.value = withDelay(
      100,
      withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) }),
    );
  }, [active, enterOpacity, reduced, topic.id]);

  const enterStyle = useAnimatedStyle(() => ({
    opacity: 0.92 + enterOpacity.value * 0.08,
    transform: [
      { translateY: (1 - enterOpacity.value) * 8 },
      { scale: 0.985 + enterOpacity.value * 0.015 },
    ],
  }));

  if (!active) {
    return (
      <Pressable
        onPress={() => {
          hapticTap();
          onBringForward?.();
        }}
        accessibilityRole="button"
        accessibilityLabel={`Next: ${topic.title}. Bring forward.`}
        style={[
          styles.peek,
          {
            backgroundColor: surface,
            borderColor: 'transparent',
            shadowColor: t.shadowColor,
            borderRadius: corner,
            elevation: tone === 1 ? 3 : 2,
            borderWidth: 0,
          },
        ]}
      >
        <View style={[styles.accentStrip, { backgroundColor: accent.ink }]} />
        <View style={styles.peekHead}>
          {closed ? (
            <Text allowFontScaling={false} style={[styles.metaCaps, { color: t.textMuted }]}>
              Closed
            </Text>
          ) : (
            <LivePulse size={6} color={accent.ink} />
          )}
          {hood ? (
            <Text allowFontScaling={false} style={[styles.metaCaps, { color: accent.ink }]}>
              · {hood}
            </Text>
          ) : null}
        </View>
        <Text
          allowFontScaling={false}
          numberOfLines={3}
          style={[styles.peekTitle, { color: t.textPrimary }]}
        >
          {topic.title}
        </Text>
        <Text allowFontScaling={false} style={[styles.peekMeta, { color: t.textSecondary }]}>
          {plural(topic.participantCount, 'arguing now', 'arguing now')}
        </Text>
      </Pressable>
    );
  }

  return (
    <Animated.View style={[{ flex: 1 }, enterStyle]}>
      <Pressable
        onPress={() => {
          hapticTap();
          if (isDebater || settled || isSpectator) onEnter();
          else onOpen();
        }}
        accessibilityRole="button"
        accessibilityLabel={cardA11yLabel(topic)}
        style={[
          styles.active,
          {
            backgroundColor: surface,
            borderColor: 'transparent',
            shadowColor: t.shadowColor,
            borderRadius: corner,
            borderWidth: 0,
          },
        ]}
      >
        <AccentBlob color={accent.soft} />
        <CardDoodle color={accent.ink} />

        <View style={styles.swordSlot} pointerEvents="none">
          <CrossedSwords triggerKey={swordKey} size={48} color={accent.ink} cooldownMs={7000} />
        </View>

        <View style={styles.activeHead}>
          <View style={styles.peekHead}>
            {closed ? (
              <Text allowFontScaling={false} style={[styles.metaCaps, { color: t.textMuted }]}>
                Closed
              </Text>
            ) : (
              <LivePulse color={accent.ink} />
            )}
            {hood ? (
              <View style={[styles.hoodChip, { backgroundColor: accent.soft }]}>
                <Text allowFontScaling={false} style={[styles.hoodChipText, { color: accent.ink }]}>
                  {hood}
                </Text>
              </View>
            ) : null}
          </View>
          <Text allowFontScaling={false} style={[styles.timeMeta, { color: t.textSecondary }]}>
            {closed
              ? phaseLabel(topic.phase)
              : topic.phase === 'final_arguments'
                ? `Final arguments · ${secondsClock(topic.secondsRemaining)}`
                : secondsLabel(topic.secondsRemaining)}
          </Text>
        </View>

        <Animated.View entering={reduced ? undefined : FadeIn.delay(180).duration(320)}>
          <Text
            allowFontScaling={false}
            numberOfLines={3}
            style={[styles.activeTitle, { color: t.textPrimary }]}
          >
            {topic.title}
          </Text>
        </Animated.View>

        <Animated.View
          entering={reduced ? undefined : FadeIn.delay(420).duration(360)}
          style={styles.previewSlot}
        >
          <LiveArgumentPreview
            excerpts={excerpts}
            signals={signals}
            active={active && !closed}
            burstText={burstText}
            emptyLabel={closed ? 'The room has closed.' : 'Be the first argument.'}
          />
        </Animated.View>

        <View style={styles.presenceRow}>
          {presence.length > 0 ? (
            <View style={styles.avatars}>
              {presence.slice(0, 3).map((person, i) => (
                <Avatar
                  key={`${person.handle}-${i}`}
                  name={person.name}
                  tint={person.avatarTint}
                  size={22}
                  style={i > 0 ? { marginLeft: -8 } : undefined}
                />
              ))}
            </View>
          ) : null}
          <Text allowFontScaling={false} style={[styles.participant, { color: t.textSecondary }]}>
            {plural(topic.participantCount, 'arguing now', 'arguing now')}
          </Text>
        </View>

        <View style={styles.cta}>
          {settled ? (
            <PrimaryButton label="See result" onPress={onEnter} />
          ) : isDebater ? (
            <View style={styles.joinedBlock}>
              {stance ? (
                <Text allowFontScaling={false} style={[styles.youStance, { color: t.textMuted }]}>
                  You · {STANCE_LABEL[stance]}
                </Text>
              ) : null}
              <PrimaryButton label="Enter Arena" onPress={onEnter} />
            </View>
          ) : isSpectator ? (
            <View style={styles.joinedBlock}>
              <Text allowFontScaling={false} style={[styles.youStance, { color: t.textMuted }]}>
                Watching
              </Text>
              <PrimaryButton label="Join the debate" onPress={onJoinDebate} />
            </View>
          ) : canJoin ? (
            <View style={styles.gate}>
              <View style={[styles.stanceRow, { backgroundColor: softFill(t) }]}>
                <StancePill label="Agree" onPress={() => onChoose('AGREE')} />
                <View style={[styles.stanceDiv, { backgroundColor: t.borderStrong }]} />
                <StancePill label="Unsure" onPress={() => onChoose('UNSURE')} />
                <View style={[styles.stanceDiv, { backgroundColor: t.borderStrong }]} />
                <StancePill label="Disagree" onPress={() => onChoose('DISAGREE')} />
              </View>
              <Pressable
                onPress={() => {
                  hapticTap();
                  onWatch();
                }}
                accessibilityRole="button"
                accessibilityLabel="Watch live"
                hitSlop={10}
                style={styles.watchLink}
              >
                <Text allowFontScaling={false} style={[styles.watchText, { color: accent.ink }]}>
                  Watch →
                </Text>
              </Pressable>
            </View>
          ) : (
            <SecondaryButton label="See how it ended" onPress={onOpen} />
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

function secondsClock(total: number): string {
  const s = Math.max(0, Math.floor(total));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m.toString().padStart(2, '0')}:${r.toString().padStart(2, '0')}`;
}

function AccentBlob({ color }: { color: string }): React.JSX.Element {
  const reduced = useReducedMotion();
  const drift = useSharedValue(0);

  React.useEffect(() => {
    if (reduced) {
      drift.value = 0;
      return;
    }
    drift.value = withRepeat(
      withTiming(1, { duration: 3800, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [drift, reduced]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: drift.value * 3 },
      { translateY: drift.value * -2 },
      { scale: 1 + drift.value * 0.02 },
    ],
  }));

  return (
    <Animated.View pointerEvents="none" style={[styles.blob, { backgroundColor: color }, style]} />
  );
}

function CardDoodle({ color }: { color: string }): React.JSX.Element {
  const reduced = useReducedMotion();
  const drift = useSharedValue(0);

  React.useEffect(() => {
    if (reduced) {
      drift.value = 0;
      return;
    }
    drift.value = withRepeat(
      withTiming(1, { duration: 5200, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [drift, reduced]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: drift.value * 2 }, { rotate: `${drift.value * 1.5}deg` }],
    opacity: 0.18 + drift.value * 0.05,
  }));

  return (
    <Animated.View pointerEvents="none" style={[styles.doodleWrap, style]}>
      <Svg width={120} height={72} viewBox="0 0 120 72">
        <Path
          d="M14 48 C28 22 48 18 66 28 C84 38 98 18 112 24"
          stroke={color}
          strokeWidth={2.2}
          strokeLinecap="round"
          fill="none"
        />
        <Circle cx={22} cy={18} r={3.2} fill={color} opacity={0.55} />
        <Circle cx={98} cy={52} r={2.4} fill={color} opacity={0.4} />
      </Svg>
    </Animated.View>
  );
}

/** Theme-safe tonal plates so stack cards read as separate objects. */
export function deckSurface(t: SemanticTheme, tone: DeckCardTone): string {
  if (t.scheme === 'light') {
    if (tone === 0) return '#FFFEFA';
    if (tone === 1) return '#F1EFE8';
    return '#E8E9ED';
  }
  if (tone === 0) return '#141416';
  if (tone === 1) return '#1A1A1E';
  return '#101014';
}

function hoodDisplayName(hood: string | null): string | null {
  if (!hood?.trim()) return null;
  const short: Record<string, string> = {
    techtakes: 'TECH',
    campushustle: 'CAMPUS',
    goatalk: 'GOA',
    movies: 'MOVIES',
    gaming: 'GAMING',
    startups: 'STARTUPS',
    football: 'SPORT',
  };
  if (hood in short) return short[hood]!;
  if (hood in HOOD_LABEL) return HOOD_LABEL[hood as HoodId].toUpperCase();
  return hood.toUpperCase();
}

function cardA11yLabel(topic: LiveArenaTopic): string {
  const live = topic.phase === 'closed' ? 'Closed' : 'Live';
  return `${topic.title}. ${live}. ${plural(
    topic.participantCount,
    'person arguing',
    'people arguing',
  )}`;
}

function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }): React.JSX.Element {
  const t = useThemeColors();
  return (
    <PressableScale
      onPress={() => {
        hapticTap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.primary, { backgroundColor: t.pill }]}
    >
      <Text allowFontScaling={false} style={[styles.primaryText, { color: t.pillText }]}>
        {label}
      </Text>
    </PressableScale>
  );
}

function SecondaryButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}): React.JSX.Element {
  const t = useThemeColors();
  return (
    <PressableScale
      onPress={() => {
        hapticTap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.secondary, { borderColor: t.borderStrong }]}
    >
      <Text allowFontScaling={false} style={[styles.secondaryText, { color: t.textPrimary }]}>
        {label}
      </Text>
    </PressableScale>
  );
}

function StancePill({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}): React.JSX.Element {
  const t = useThemeColors();
  return (
    <PressableScale
      onPress={() => {
        hapticTap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.stancePill}
    >
      <Text allowFontScaling={false} style={[styles.stancePillText, { color: t.textPrimary }]}>
        {label}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  active: {
    flex: 1,
    overflow: 'hidden',
    paddingHorizontal: space.lg,
    paddingTop: space.md + 2,
    paddingBottom: space.md,
    borderWidth: 0,
    shadowOpacity: 0.16,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
  },
  peek: {
    flex: 1,
    overflow: 'hidden',
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    gap: 6,
    borderWidth: 0,
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    justifyContent: 'flex-start',
  },
  accentStrip: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  blob: {
    position: 'absolute',
    top: -36,
    right: -28,
    width: 168,
    height: 168,
    borderRadius: 84,
  },
  doodleWrap: {
    position: 'absolute',
    right: 8,
    top: 72,
  },
  swordSlot: {
    position: 'absolute',
    right: 14,
    top: 54,
    zIndex: 2,
  },
  activeHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.sm,
    zIndex: 1,
  },
  peekHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  hoodChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  hoodChipText: {
    ...typeScale.caption,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  metaCaps: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  timeMeta: {
    ...typeScale.caption,
    fontSize: 12,
    fontWeight: '600',
  },
  activeTitle: {
    ...typeScale.editorial,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    letterSpacing: -0.35,
    zIndex: 1,
  },
  previewSlot: {
    marginTop: space.sm,
    zIndex: 1,
    flexGrow: 1,
  },
  peekTitle: {
    ...typeScale.editorial,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  peekMeta: {
    ...typeScale.meta,
    fontSize: 12,
    marginTop: 'auto',
  },
  presenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: space.sm,
    zIndex: 1,
  },
  avatars: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  participant: {
    ...typeScale.meta,
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },
  cta: {
    marginTop: 'auto',
    paddingTop: space.md,
    zIndex: 1,
  },
  joinedBlock: { gap: space.sm },
  youStance: {
    ...typeScale.caption,
    fontSize: 13,
    fontWeight: '600',
  },
  gate: { gap: space.sm, alignItems: 'center' },
  stanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    borderRadius: radius.pill,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  stancePill: {
    flex: 1,
    minHeight: layout.hit,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xs,
  },
  stancePillText: {
    ...typeScale.button,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  stanceDiv: {
    width: StyleSheet.hairlineWidth,
    height: 18,
    opacity: 0.7,
  },
  watchLink: {
    paddingVertical: space.xs,
    minHeight: 36,
    justifyContent: 'center',
  },
  watchText: {
    ...typeScale.button,
    fontSize: 14,
    fontWeight: '700',
  },
  primary: {
    minHeight: layout.hit,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  primaryText: { ...typeScale.button, fontSize: 15, fontWeight: '700' },
  secondary: {
    minHeight: layout.hit,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  secondaryText: { ...typeScale.button, fontSize: 15, fontWeight: '600' },
});
