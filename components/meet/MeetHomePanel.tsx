/**
 * Explore → MEET — matchmaking surface (text only).
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useReducedMotion } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { GlowButton } from '../shared/GlowButton';
import { useRequireAuth } from '../../hooks/useRequireAuth';
import { analytics } from '../../services/analytics';
import {
  joinMeetQueue,
  leaveMeetQueue,
  leaveMeetSession,
  MEET_INTERESTS,
  pollMeetQueue,
  type MeetHoodId,
  type MeetMatchMode,
  type MeetSession,
} from '../../services/meetService';
import { countryByCode } from '../../data/exploreCountries';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';

const MODES: { id: MeetMatchMode; label: string; hint: string }[] = [
  { id: 'ANYWHERE', label: 'Anywhere', hint: 'Meet someone new worldwide' },
  { id: 'COUNTRY', label: 'Country', hint: 'Same public country preference' },
  { id: 'INTERESTS', label: 'Interests', hint: 'Shared tastes' },
  { id: 'HOOD', label: 'Hood', hint: 'Same Hood community' },
];

export function MeetHomePanel(): React.JSX.Element {
  const t = useThemeColors();
  const router = useRouter();
  const requireAuth = useRequireAuth();
  const reduced = useReducedMotion();

  const [mode, setMode] = React.useState<MeetMatchMode>('ANYWHERE');
  const [countryCode, setCountryCode] = React.useState('IN');
  const [interest, setInterest] = React.useState<string>(MEET_INTERESTS[0]!);
  const [hood, setHood] = React.useState<MeetHoodId>('techtakes');
  const HOODS: MeetHoodId[] = ['techtakes', 'movies', 'gaming', 'startups'];
  const [searching, setSearching] = React.useState(false);
  const [matched, setMatched] = React.useState<MeetSession | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const pulse = useSharedValue(0.35);
  React.useEffect(() => {
    if (!searching || reduced) {
      pulse.value = 0.55;
      return;
    }
    pulse.value = withRepeat(
      withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [pulse, reduced, searching]);

  const orbStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + pulse.value * 0.45,
    transform: [{ scale: 0.85 + pulse.value * 0.2 }],
  }));

  React.useEffect(() => {
    analytics.track('meet_opened', { realm: 'explore', source: 'explore' });
  }, []);

  React.useEffect(() => {
    if (!searching) return;
    const id = setInterval(() => {
      void pollMeetQueue()
        .then((state) => {
          if (state.matched && state.session) {
            setSearching(false);
            setMatched(state.session);
            analytics.track('meet_matched', { realm: 'explore', source: 'explore' });
          }
        })
        .catch(() => undefined);
    }, 2200);
    return () => clearInterval(id);
  }, [searching]);

  const startSearch = async () => {
    if (!requireAuth()) return;
    setBusy(true);
    setError(null);
    setMatched(null);
    try {
      const state = await joinMeetQueue({
        mode,
        countryCode: mode === 'COUNTRY' ? countryCode : null,
        hood: mode === 'HOOD' ? hood : null,
        interests: mode === 'INTERESTS' ? [interest] : [],
      });
      analytics.track('meet_queue_joined', { realm: 'explore', source: 'explore' });
      if (state.matched && state.session) {
        setMatched(state.session);
        analytics.track('meet_matched', { realm: 'explore', source: 'explore' });
      } else if (state.alreadyActive && state.session) {
        setMatched(state.session);
      } else {
        setSearching(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start matching');
    } finally {
      setBusy(false);
    }
  };

  const cancelSearch = async () => {
    setBusy(true);
    try {
      await leaveMeetQueue();
      setSearching(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not cancel');
    } finally {
      setBusy(false);
    }
  };

  const openChat = () => {
    if (!matched) return;
    analytics.track('meet_chat_started', { realm: 'explore', source: 'explore' });
    router.push(`/explore/meet/${matched.sessionId}` as never);
  };

  if (matched && matched.status === 'active') {
    return (
      <View style={[styles.card, { backgroundColor: t.surfaceElevated, borderColor: t.border }]}>
        <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
          YOU&apos;RE CONNECTED
        </Text>
        <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
          {matched.peerAlias}
        </Text>
        {matched.sharedInterest ? (
          <Text allowFontScaling={false} style={{ color: t.textSecondary }}>
            Shared: {matched.sharedInterest}
          </Text>
        ) : matched.countryCode ? (
          <Text allowFontScaling={false} style={{ color: t.textSecondary }}>
            {countryByCode(matched.countryCode)?.name ?? matched.countryCode}
          </Text>
        ) : matched.hood ? (
          <Text allowFontScaling={false} style={{ color: t.textSecondary }}>
            Hood · {matched.hood}
          </Text>
        ) : (
          <Text allowFontScaling={false} style={{ color: t.textSecondary }}>
            Anywhere
          </Text>
        )}
        <GlowButton label="Start chat" onPress={openChat} tone="light" />
        <GlowButton
          label="Leave"
          onPress={() => {
            void (async () => {
              try {
                await leaveMeetSession(matched.sessionId, 'leave');
                analytics.track('meet_left', { realm: 'explore', source: 'explore' });
              } catch {
                /* still clear local UI */
              }
              setMatched(null);
              setSearching(false);
            })();
          }}
          tone="glass"
          compact
        />
      </View>
    );
  }

  if (searching) {
    return (
      <View style={[styles.card, { backgroundColor: t.surfaceElevated, borderColor: t.border }]}>
        <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
          MEET THE WORLD
        </Text>
        <Animated.View
          style={[
            styles.orb,
            orbStyle,
            { borderColor: t.borderStrong, backgroundColor: t.scheme === 'light' ? '#111113' : '#F5F5F5' },
          ]}
        />
        <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
          Finding someone…
        </Text>
        <Text allowFontScaling={false} style={{ color: t.textSecondary, textAlign: 'center' }}>
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
        <GlowButton
          label={busy ? 'Cancelling…' : 'Cancel'}
          onPress={() => void cancelSearch()}
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
                setSearching(false);
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

  return (
    <View style={styles.root}>
      <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
        MEET THE WORLD
      </Text>
      <Text allowFontScaling={false} style={[styles.hero, { color: t.textPrimary }]}>
        Talk to someone you don&apos;t know
      </Text>
      <Text allowFontScaling={false} style={{ color: t.textSecondary, lineHeight: 20 }}>
        Pseudonymous to each other. Authenticated for safety.
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
              accessibilityLabel={item.label}
            >
              <Text
                allowFontScaling={false}
                style={{ color: on ? t.background : t.textPrimary, fontWeight: '800' }}
              >
                {item.label}
              </Text>
              <Text
                allowFontScaling={false}
                style={{
                  color: on ? 'rgba(255,255,255,0.7)' : t.textMuted,
                  fontSize: 12,
                }}
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

      <View style={styles.availability}>
        <View style={[styles.availPill, { backgroundColor: t.textPrimary }]}>
          <Text style={{ color: t.background, fontWeight: '800', fontSize: 12 }}>TEXT · Available</Text>
        </View>
        <View style={[styles.availPill, { backgroundColor: t.surfaceMuted, opacity: 0.7 }]}>
          <Text style={{ color: t.textMuted, fontWeight: '700', fontSize: 12 }}>VIDEO · Coming later</Text>
        </View>
      </View>

      {error ? (
        <Text allowFontScaling={false} style={{ color: t.danger }}>
          {error}
        </Text>
      ) : null}

      <GlowButton
        label={busy ? 'Starting…' : 'Find someone'}
        onPress={() => void startSearch()}
        tone="light"
        disabled={busy}
      />
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
  availability: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  availPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
});
