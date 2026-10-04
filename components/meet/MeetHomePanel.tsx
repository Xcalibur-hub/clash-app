/**
 * Explore → MEET — TEXT / VIDEO entry + matchmaking.
 */
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
import { useRouter } from 'expo-router';
import { MeetButton } from './MeetButton';
import { useRequireAuth } from '../../hooks/useRequireAuth';
import { analytics } from '../../services/analytics';
import {
  ackMeetVideoSafety,
  hasMeetVideoSafetyAck,
  joinMeetQueue,
  leaveMeetQueue,
  leaveMeetSession,
  MEET_INTERESTS,
  pollMeetQueue,
  type MeetChannel,
  type MeetHoodId,
  type MeetMatchMode,
  type MeetSession,
} from '../../services/meetService';
import { setMeetVideoPrefs } from '../../services/meetVideoPrefs';
import { countryByCode } from '../../data/exploreCountries';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';

const MODES: { id: MeetMatchMode; label: string; hint: string }[] = [
  { id: 'ANYWHERE', label: 'Anywhere', hint: 'Meet someone new worldwide' },
  { id: 'COUNTRY', label: 'Country', hint: 'Same public country preference' },
  { id: 'INTERESTS', label: 'Interests', hint: 'Shared tastes' },
  { id: 'HOOD', label: 'Hood', hint: 'Same Hood community' },
];

type Phase = 'pick' | 'prefs' | 'safety' | 'searching' | 'matched';

export function MeetHomePanel(): React.JSX.Element {
  const t = useThemeColors();
  const router = useRouter();
  const requireAuth = useRequireAuth();
  const reduced = useReducedMotion();

  const [phase, setPhase] = React.useState<Phase>('pick');
  const [channel, setChannel] = React.useState<MeetChannel>('TEXT');
  const [mode, setMode] = React.useState<MeetMatchMode>('ANYWHERE');
  const [countryCode, setCountryCode] = React.useState('IN');
  const [interest, setInterest] = React.useState<string>(MEET_INTERESTS[0]!);
  const [hood, setHood] = React.useState<MeetHoodId>('techtakes');
  const HOODS: MeetHoodId[] = ['techtakes', 'movies', 'gaming', 'startups'];
  const [matched, setMatched] = React.useState<MeetSession | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const pulse = useSharedValue(0.35);
  React.useEffect(() => {
    if (phase !== 'searching' || reduced) {
      pulse.value = 0.55;
      return;
    }
    pulse.value = withRepeat(
      withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [phase, pulse, reduced]);

  const orbStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + pulse.value * 0.45,
    transform: [{ scale: 0.85 + pulse.value * 0.2 }],
  }));

  React.useEffect(() => {
    analytics.track('meet_opened', { realm: 'explore', source: 'explore' });
  }, []);

  React.useEffect(() => {
    if (phase !== 'searching') return;
    const id = setInterval(() => {
      void pollMeetQueue()
        .then((state) => {
          if (state.matched && state.session) {
            setMatched(state.session);
            setPhase('matched');
            analytics.track(
              state.session.channel === 'VIDEO' ? 'meet_video_matched' : 'meet_matched',
              { realm: 'explore', source: 'explore' },
            );
          }
        })
        .catch(() => undefined);
    }, 2200);
    return () => clearInterval(id);
  }, [phase]);

  const startSearch = async () => {
    if (!requireAuth()) return;
    setBusy(true);
    setError(null);
    setMatched(null);
    try {
      if (channel === 'VIDEO') {
        analytics.track('meet_video_queue_joined', { realm: 'explore', source: 'explore' });
      } else {
        analytics.track('meet_queue_joined', { realm: 'explore', source: 'explore' });
      }
      const state = await joinMeetQueue({
        mode,
        channel,
        countryCode: mode === 'COUNTRY' ? countryCode : null,
        hood: mode === 'HOOD' ? hood : null,
        interests: mode === 'INTERESTS' ? [interest] : [],
      });
      if (state.matched && state.session) {
        setMatched(state.session);
        setPhase('matched');
        analytics.track(
          state.session.channel === 'VIDEO' ? 'meet_video_matched' : 'meet_matched',
          { realm: 'explore', source: 'explore' },
        );
      } else if (state.alreadyActive && state.session) {
        setMatched(state.session);
        setPhase('matched');
      } else {
        setPhase('searching');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start matching');
    } finally {
      setBusy(false);
    }
  };

  const chooseChannel = async (next: MeetChannel) => {
    hapticTap();
    if (!requireAuth()) return;
    setChannel(next);
    setError(null);
    if (next === 'VIDEO') {
      analytics.track('meet_video_opened', { realm: 'explore', source: 'explore' });
      try {
        const acked = await hasMeetVideoSafetyAck();
        setPhase(acked ? 'prefs' : 'safety');
      } catch {
        setPhase('safety');
      }
    } else {
      setPhase('prefs');
    }
  };

  const openMatched = () => {
    if (!matched) return;
    if (matched.channel === 'VIDEO') {
      router.push(`/explore/meet/video/${matched.sessionId}` as never);
    } else {
      analytics.track('meet_chat_started', { realm: 'explore', source: 'explore' });
      router.push(`/explore/meet/${matched.sessionId}` as never);
    }
  };

  if (phase === 'matched' && matched?.status === 'active') {
    return (
      <View style={[styles.card, { backgroundColor: t.surfaceElevated, borderColor: t.border }]}>
        <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
          YOU&apos;RE CONNECTED
        </Text>
        <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
          {matched.peerAlias}
        </Text>
        <Text allowFontScaling={false} style={{ color: t.textSecondary }}>
          {matched.channel === 'VIDEO' ? 'Video' : 'Text'}
          {matched.sharedInterest
            ? ` · ${matched.sharedInterest}`
            : matched.countryCode
              ? ` · ${countryByCode(matched.countryCode)?.name ?? matched.countryCode}`
              : matched.hood
                ? ` · ${matched.hood}`
                : ' · Anywhere'}
        </Text>
        <MeetButton
          label={matched.channel === 'VIDEO' ? 'Join call' : 'Start chat'}
          onPress={openMatched}
          tone="light"
        />
        <MeetButton
          label="Leave"
          onPress={() => {
            void (async () => {
              try {
                await leaveMeetSession(matched.sessionId, 'leave');
                analytics.track(
                  matched.channel === 'VIDEO' ? 'meet_video_left' : 'meet_left',
                  { realm: 'explore', source: 'explore' },
                );
              } catch {
                /* clear local UI anyway */
              }
              setMatched(null);
              setPhase('pick');
            })();
          }}
          tone="glass"
          compact
        />
      </View>
    );
  }

  if (phase === 'searching') {
    return (
      <View style={[styles.card, { backgroundColor: t.surfaceElevated, borderColor: t.border }]}>
        <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
          MEET THE WORLD
        </Text>
        <Animated.View
          style={[
            styles.orb,
            orbStyle,
            {
              borderColor: t.borderStrong,
              backgroundColor: t.scheme === 'light' ? '#111113' : '#F5F5F5',
            },
          ]}
        />
        <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
          Finding someone…
        </Text>
        <Text allowFontScaling={false} style={{ color: t.textSecondary, textAlign: 'center' }}>
          {channel === 'VIDEO' ? 'Video · ' : 'Text · '}
          {mode === 'INTERESTS' ? interest : MODES.find((m) => m.id === mode)?.label}
          {mode === 'COUNTRY'
            ? ` · ${countryByCode(countryCode)?.name ?? countryCode}`
            : mode === 'ANYWHERE'
              ? ' · Anywhere'
              : ''}
        </Text>
        <Text allowFontScaling={false} style={{ color: t.textMuted, textAlign: 'center', fontSize: 13 }}>
          Still looking… No bots. Real people only.
        </Text>
        <MeetButton
          label={busy ? 'Cancelling…' : 'Cancel'}
          onPress={() => {
            void (async () => {
              setBusy(true);
              try {
                await leaveMeetQueue();
                setPhase('prefs');
              } finally {
                setBusy(false);
              }
            })();
          }}
          tone="glass"
          disabled={busy}
        />
        {mode !== 'ANYWHERE' ? (
          <Pressable
            onPress={() => {
              hapticTap();
              setMode('ANYWHERE');
              void (async () => {
                await leaveMeetQueue();
                setMode('ANYWHERE');
                setPhase('prefs');
                await startSearch();
              })();
            }}
          >
            <Text allowFontScaling={false} style={{ color: t.textMuted, fontWeight: '700' }}>
              Try Anywhere
            </Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  if (phase === 'safety') {
    return (
      <View style={[styles.card, { backgroundColor: t.surfaceElevated, borderColor: t.border }]}>
        <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
          VIDEO MEET
        </Text>
        <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
          Be respectful
        </Text>
        <Text allowFontScaling={false} style={{ color: t.textSecondary, textAlign: 'center', lineHeight: 22 }}>
          No sexual or abusive content. You can leave, block, or report instantly. Connections are
          pseudonymous — not completely anonymous.
        </Text>
        {error ? <Text style={{ color: t.danger }}>{error}</Text> : null}
        <MeetButton
          label="I understand"
          onPress={() => {
            void (async () => {
              setBusy(true);
              try {
                await ackMeetVideoSafety();
                setPhase('prefs');
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Could not save');
              } finally {
                setBusy(false);
              }
            })();
          }}
          tone="light"
          disabled={busy}
        />
        <MeetButton label="Back" onPress={() => setPhase('pick')} tone="glass" compact />
      </View>
    );
  }

  if (phase === 'prefs') {
    return (
      <View style={styles.root}>
        <Pressable onPress={() => setPhase('pick')}>
          <Text allowFontScaling={false} style={{ color: t.textMuted, fontWeight: '700' }}>
            ← Back
          </Text>
        </Pressable>
        <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
          {channel === 'VIDEO' ? 'VIDEO MEET' : 'TEXT MEET'}
        </Text>
        <Text allowFontScaling={false} style={[styles.hero, { color: t.textPrimary }]}>
          {channel === 'VIDEO' ? 'How do you want to meet?' : 'How do you want to chat?'}
        </Text>

        <View style={styles.modeGrid}>
          {MODES.map((item) => {
            const on = mode === item.id;
            return (
              <Pressable
                key={item.id}
                onPress={() => {
                  hapticTap();
                  setMode(item.id);
                }}
                style={[
                  styles.modeCard,
                  {
                    backgroundColor: on ? t.textPrimary : t.surfaceElevated,
                    borderColor: t.border,
                  },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <Text
                  allowFontScaling={false}
                  style={{ color: on ? t.background : t.textPrimary, fontWeight: '800' }}
                >
                  {item.label}
                </Text>
                <Text
                  allowFontScaling={false}
                  style={{ color: on ? 'rgba(255,255,255,0.7)' : t.textMuted, fontSize: 12 }}
                >
                  {item.hint}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {mode === 'COUNTRY' ? (
          <View style={styles.chipRow}>
            {['IN', 'US', 'JP', 'GB', 'BR'].map((code) => {
              const on = countryCode === code;
              return (
                <Pressable
                  key={code}
                  onPress={() => setCountryCode(code)}
                  style={[styles.chip, on && { backgroundColor: t.textPrimary }]}
                >
                  <Text style={{ color: on ? t.background : t.textPrimary, fontWeight: '700' }}>
                    {code}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {mode === 'INTERESTS' ? (
          <View style={styles.chipRow}>
            {MEET_INTERESTS.map((item) => {
              const on = interest === item;
              return (
                <Pressable
                  key={item}
                  onPress={() => setInterest(item)}
                  style={[styles.chip, on && { backgroundColor: t.textPrimary }]}
                >
                  <Text style={{ color: on ? t.background : t.textPrimary, fontWeight: '700' }}>
                    {item}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {mode === 'HOOD' ? (
          <View style={styles.chipRow}>
            {HOODS.map((h) => {
              const on = hood === h;
              return (
                <Pressable
                  key={h}
                  onPress={() => setHood(h)}
                  style={[styles.chip, on && { backgroundColor: t.textPrimary }]}
                >
                  <Text style={{ color: on ? t.background : t.textPrimary, fontWeight: '700' }}>
                    {h}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {channel === 'VIDEO' ? (
          <MeetButton
            label="Continue"
            onPress={() => {
              setMeetVideoPrefs({
                mode,
                countryCode: mode === 'COUNTRY' ? countryCode : null,
                hood: mode === 'HOOD' ? hood : null,
                interests: mode === 'INTERESTS' ? [interest] : [],
              });
              router.push('/explore/meet/video/prep' as never);
            }}
            tone="light"
          />
        ) : (
          <MeetButton
            label={busy ? 'Starting…' : 'Find someone'}
            onPress={() => void startSearch()}
            tone="light"
            disabled={busy}
          />
        )}

        {error ? <Text style={{ color: t.danger }}>{error}</Text> : null}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
        MEET THE WORLD
      </Text>
      <Text allowFontScaling={false} style={[styles.hero, { color: t.textPrimary }]}>
        Talk to someone new
      </Text>
      <Text allowFontScaling={false} style={{ color: t.textSecondary, lineHeight: 20 }}>
        Pseudonymous to each other. Authenticated for safety.
      </Text>

      <Pressable
        onPress={() => void chooseChannel('TEXT')}
        style={[styles.entry, { backgroundColor: t.surfaceElevated, borderColor: t.border }]}
        accessibilityRole="button"
        accessibilityLabel="Text. Start a chat"
      >
        <View style={{ flex: 1, gap: 4 }}>
          <Text allowFontScaling={false} style={{ color: t.textPrimary, fontWeight: '800', fontSize: 18 }}>
            TEXT
          </Text>
          <Text allowFontScaling={false} style={{ color: t.textSecondary }}>
            Chat anonymously
          </Text>
        </View>
        <Text allowFontScaling={false} style={{ color: t.textMuted, fontWeight: '800' }}>
          →
        </Text>
      </Pressable>

      <Pressable
        onPress={() => void chooseChannel('VIDEO')}
        style={[styles.entry, { backgroundColor: t.surfaceElevated, borderColor: t.border }]}
        accessibilityRole="button"
        accessibilityLabel="Video. Meet someone"
      >
        <View style={{ flex: 1, gap: 4 }}>
          <Text allowFontScaling={false} style={{ color: t.textPrimary, fontWeight: '800', fontSize: 18 }}>
            VIDEO
          </Text>
          <Text allowFontScaling={false} style={{ color: t.textSecondary }}>
            Meet face to face
          </Text>
        </View>
        <Text allowFontScaling={false} style={{ color: t.textMuted, fontWeight: '800' }}>
          →
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.sm },
  card: {
    borderRadius: radius.xxl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
    gap: space.sm,
    alignItems: 'center',
    minHeight: 320,
    justifyContent: 'center',
  },
  kicker: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  hero: {
    ...typeScale.editorial,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  title: {
    ...typeScale.editorial,
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
  },
  orb: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    marginVertical: space.sm,
  },
  modeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  modeCard: {
    width: '48%',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.sm,
    gap: 4,
    minHeight: 72,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(127,127,127,0.12)',
  },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: radius.xxl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.md,
    minHeight: 88,
  },
});
