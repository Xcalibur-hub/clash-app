import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { HOOD_LABEL } from '../../data/hoods';
import type { LiveArenaTopic, Stance } from '../../services/liveArenaService';
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
import { PressableScale } from '../shared/PressableScale';
import { LivePulse } from './LivePulse';
import { phaseLabel, secondsLabel, softFill, STANCE_LABEL } from './liveArenaStyles';

export type DeckCardTone = 0 | 1 | 2;

export interface ArenaTopicDeckCardProps {
  topic: LiveArenaTopic;
  /** Front card shows full CTAs; peeks stay editorial summaries. */
  active: boolean;
  /** Surface / shadow variation across the stack. */
  tone: DeckCardTone;
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
 * ~85% calm plate + ~15% hood-derived accent (blob, LIVE tint, doodle).
 */
export function ArenaTopicDeckCard({
  topic,
  active,
  tone,
  onOpen,
  onChoose,
  onWatch,
  onEnter,
  onJoinDebate,
  onBringForward,
}: ArenaTopicDeckCardProps): React.JSX.Element {
  const t = useThemeColors();
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
            borderColor: t.border,
            shadowColor: t.shadowColor,
            borderRadius: corner,
            elevation: tone === 1 ? 3 : 2,
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
          {plural(topic.participantCount, 'debating', 'debating')}
        </Text>
      </Pressable>
    );
  }

  return (
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
          borderColor: t.border,
          shadowColor: t.shadowColor,
          borderRadius: corner,
        },
      ]}
    >
      <AccentBlob color={accent.soft} />
      <CardDoodle color={accent.ink} />

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
          {closed ? phaseLabel(topic.phase) : secondsLabel(topic.secondsRemaining)}
        </Text>
      </View>

      <Text allowFontScaling={false} numberOfLines={5} style={[styles.activeTitle, { color: t.textPrimary }]}>
        {topic.title}
      </Text>

      <Text allowFontScaling={false} style={[styles.participant, { color: t.textSecondary }]}>
        {plural(topic.participantCount, 'participating', 'participating')}
      </Text>

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
            <PrimaryButton label="Enter your room" onPress={onEnter} />
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
  );
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
      { translateX: drift.value * 4 },
      { translateY: drift.value * -3 },
      { scale: 1 + drift.value * 0.03 },
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
    transform: [{ translateX: drift.value * 3 }, { rotate: `${drift.value * 2}deg` }],
    opacity: 0.22 + drift.value * 0.06,
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
    'person participating',
    'people participating',
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
    borderWidth: StyleSheet.hairlineWidth,
    shadowOpacity: 0.14,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  peek: {
    flex: 1,
    overflow: 'hidden',
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
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
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
    letterSpacing: -0.4,
    zIndex: 1,
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
  participant: {
    ...typeScale.meta,
    fontSize: 14,
    marginTop: space.md,
    zIndex: 1,
  },
  cta: {
    marginTop: 'auto',
    paddingTop: space.lg,
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
