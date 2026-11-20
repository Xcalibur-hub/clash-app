/**
 * Arena home hero for a live / upcoming Topic — media-first, no fake fighters.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  ZoomIn,
  useReducedMotion,
} from 'react-native-reanimated';
import type { LiveArenaTopic } from '../../services/liveArenaService';
import { layout, space, typeScale, useThemeColors } from '../../theme';
import { topicAtmosphereMood } from '../../utils/arenaAtmosphere';
import { plural } from '../../utils/format';
import { press as hapticPress } from '../../utils/haptics';
import { PressableScale } from '../shared/PressableScale';
import { ArenaAtmosphere } from './ArenaAtmosphere';
import { LivePulse } from './LivePulse';
import { phaseLabel, secondsLabel } from './liveArenaStyles';

export interface LiveClashHeroProps {
  topic: LiveArenaTopic;
  onWatch: () => void;
  onEnter?: () => void;
}

export function LiveClashHero({ topic, onWatch, onEnter }: LiveClashHeroProps): React.JSX.Element {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const mood = topicAtmosphereMood(topic.status, topic.phase);
  const upcoming = mood === 'upcoming';
  const closed = topic.phase === 'closed';
  const joined = topic.viewerJoined && topic.viewerRoomId !== null;
  const live = topic.status === 'live' && (topic.phase === 'open' || topic.phase === 'final_arguments');

  const cta = (): void => {
    hapticPress();
    if (joined && onEnter) onEnter();
    else onWatch();
  };

  return (
    <View style={styles.wrap}>
      <ArenaAtmosphere mood={mood} energy={live ? 0.35 : upcoming ? 0.15 : 0.1} />
      <View style={styles.content}>
        <Animated.View entering={reduced ? undefined : FadeIn.duration(280)} style={styles.statusRow}>
          {live ? <LivePulse /> : null}
          {upcoming ? (
            <Text style={[styles.status, { color: t.textSecondary }]}>STARTS SOON</Text>
          ) : null}
          {!live && !upcoming ? (
            <Text style={[styles.status, { color: t.textMuted }]}>
              {phaseLabel(topic.phase).toUpperCase()}
            </Text>
          ) : null}
        </Animated.View>

        <Animated.Text
          entering={reduced ? undefined : FadeInDown.delay(40).springify().damping(18)}
          accessibilityRole="header"
          style={[styles.title, { color: t.textPrimary }]}
        >
          {topic.title}
        </Animated.Text>

        {topic.description ? (
          <Text numberOfLines={2} style={[styles.sub, { color: t.textSecondary }]}>
            {topic.description}
          </Text>
        ) : (
          <Text style={[styles.sub, { color: t.textMuted }]}>
            THE INTERNET IS FIGHTING ABOUT THIS
          </Text>
        )}

        <View style={styles.metaRow}>
          <Text style={[styles.meta, { color: t.textSecondary }]}>
            {plural(topic.participantCount, 'person joined', 'people joined')}
          </Text>
          {!closed && topic.secondsRemaining > 0 ? (
            <>
              <Text style={[styles.metaDot, { color: t.textMuted }]}>·</Text>
              <Text style={[styles.meta, { color: t.textSecondary }]}>
                {secondsLabel(topic.secondsRemaining)} left
              </Text>
            </>
          ) : null}
        </View>

        <Animated.View entering={reduced ? undefined : ZoomIn.delay(120).springify().damping(16)}>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={joined ? 'Enter Clash' : 'Watch Clash'}
            onPress={cta}
            style={[styles.cta, { borderColor: t.borderStrong, backgroundColor: t.surfaceElevated }]}
          >
            <Text style={[styles.ctaText, { color: t.textPrimary }]}>
              {joined ? 'ENTER CLASH' : 'WATCH CLASH'}
            </Text>
          </PressableScale>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: layout.screenX,
    marginTop: space.sm,
    marginBottom: space.md,
    minHeight: 220,
    borderRadius: 20,
    overflow: 'hidden',
  },
  content: {
    paddingHorizontal: space.lg,
    paddingVertical: space.lg,
    gap: space.sm,
    minHeight: 220,
    justifyContent: 'flex-end',
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  status: {
    ...typeScale.caption,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.1,
  },
  title: {
    ...typeScale.title,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  sub: {
    ...typeScale.body,
    fontSize: 14,
    lineHeight: 20,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  meta: { ...typeScale.caption, fontSize: 13, fontWeight: '500' },
  metaDot: { fontSize: 13 },
  cta: {
    marginTop: space.sm,
    alignSelf: 'flex-start',
    minHeight: 48,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm + 2,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
  ctaText: {
    ...typeScale.label,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
});
