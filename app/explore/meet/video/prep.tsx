/**
 * VIDEO MEET pre-call — camera preview + permissions + START queue.
 */
import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MeetButton } from '../../../../components/meet/MeetButton';
import { analytics } from '../../../../services/analytics';
import {
  joinMeetQueue,
  leaveMeetQueue,
  pollMeetQueue,
} from '../../../../services/meetService';
import { peekMeetVideoPrefs } from '../../../../services/meetVideoPrefs';
import { radius, space, typeScale, useThemeColors } from '../../../../theme';

export default function MeetVideoPrepScreen(): React.JSX.Element {
  const t = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [camPerm, requestCam] = useCameraPermissions();
  const [micPerm, requestMic] = useMicrophonePermissions();
  const [busy, setBusy] = React.useState(false);
  const [searching, setSearching] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const prefs = peekMeetVideoPrefs();

  const camOk = camPerm?.granted === true;
  const micOk = micPerm?.granted === true;

  React.useEffect(() => {
    analytics.track('meet_video_opened', { realm: 'explore', source: 'explore' });
  }, []);

  React.useEffect(() => {
    if (!searching) return;
    const id = setInterval(() => {
      void pollMeetQueue()
        .then((state) => {
          if (state.matched && state.session?.channel === 'VIDEO') {
            setSearching(false);
            analytics.track('meet_video_matched', { realm: 'explore', source: 'explore' });
            router.replace(`/explore/meet/video/${state.session.sessionId}` as never);
          }
        })
        .catch(() => undefined);
    }, 2000);
    return () => clearInterval(id);
  }, [router, searching]);

  const ensurePerms = async (): Promise<boolean> => {
    let cam = camPerm;
    let mic = micPerm;
    if (!cam?.granted) cam = await requestCam();
    if (!mic?.granted) mic = await requestMic();
    if (!cam?.granted || !mic?.granted) {
      setError(
        cam?.canAskAgain === false || mic?.canAskAgain === false
          ? 'Camera or microphone is blocked. Open Settings to enable.'
          : 'Camera and microphone are required for Video Meet.',
      );
      return false;
    }
    setError(null);
    return true;
  };

  const onStart = async () => {
    setBusy(true);
    setError(null);
    try {
      const ok = await ensurePerms();
      if (!ok) return;
      analytics.track('meet_video_queue_joined', { realm: 'explore', source: 'explore' });
      const state = await joinMeetQueue({
        mode: prefs.mode,
        channel: 'VIDEO',
        countryCode: prefs.countryCode,
        hood: prefs.hood,
        interests: prefs.interests,
      });
      if (state.matched && state.session) {
        analytics.track('meet_video_matched', { realm: 'explore', source: 'explore' });
        router.replace(`/explore/meet/video/${state.session.sessionId}` as never);
        return;
      }
      if (state.alreadyActive && state.session?.channel === 'VIDEO') {
        router.replace(`/explore/meet/video/${state.session.sessionId}` as never);
        return;
      }
      setSearching(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start');
    } finally {
      setBusy(false);
    }
  };

  if (searching) {
    return (
      <View style={[styles.root, { backgroundColor: '#0A0A0C', paddingTop: insets.top + 24 }]}>
        <Text allowFontScaling={false} style={styles.kicker}>
          VIDEO MEET
        </Text>
        <Text allowFontScaling={false} style={styles.title}>
          Finding someone…
        </Text>
        <Text allowFontScaling={false} style={styles.meta}>
          {prefs.mode === 'ANYWHERE' ? 'Anywhere' : prefs.mode}
        </Text>
        <MeetButton
          label="Cancel"
          tone="glass"
          onPress={() => {
            void leaveMeetQueue().finally(() => setSearching(false));
          }}
        />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: '#0A0A0C', paddingTop: insets.top + 12 }]}>
      <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
        <Text style={styles.back}>← Back</Text>
      </Pressable>
      <Text allowFontScaling={false} style={styles.kicker}>
        VIDEO MEET
      </Text>
      <Text allowFontScaling={false} style={styles.title}>
        Ready when you are
      </Text>
      <Text allowFontScaling={false} style={styles.meta}>
        You&apos;ll connect to someone new. Leave or Next anytime. Report and block are always
        available.
      </Text>

      <View style={styles.preview}>
        {camOk ? (
          <CameraView style={StyleSheet.absoluteFill} facing="front" />
        ) : (
          <View style={styles.previewPlaceholder}>
            <Text style={{ color: 'rgba(255,255,255,0.55)', textAlign: 'center' }}>
              Camera preview appears after permission
            </Text>
          </View>
        )}
      </View>

      <View style={styles.permRow}>
        <Text style={styles.perm}>Camera · {camOk ? 'ON' : 'OFF'}</Text>
        <Text style={styles.perm}>Microphone · {micOk ? 'ON' : 'OFF'}</Text>
      </View>

      <Text style={styles.meta}>
        {prefs.mode === 'COUNTRY' && prefs.countryCode
          ? prefs.countryCode
          : prefs.mode === 'INTERESTS' && prefs.interests[0]
            ? prefs.interests[0]
            : prefs.mode === 'HOOD' && prefs.hood
              ? prefs.hood
              : 'Anywhere'}
      </Text>

      {error ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: '#FF8A80' }}>{error}</Text>
          {error.includes('Settings') ? (
            <MeetButton label="Open Settings" tone="glass" compact onPress={() => void Linking.openSettings()} />
          ) : null}
        </View>
      ) : null}

      <MeetButton
        label={busy ? 'Starting…' : 'Start'}
        onPress={() => void onStart()}
        tone="light"
        disabled={busy}
      />
      <View style={{ height: insets.bottom + 8 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: 20,
    gap: space.sm,
  },
  back: { color: 'rgba(255,255,255,0.65)', fontWeight: '700', marginBottom: 4 },
  kicker: {
    ...typeScale.caption,
    color: 'rgba(255,255,255,0.45)',
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  title: {
    ...typeScale.editorial,
    color: '#FAFAF8',
    fontSize: 30,
    fontWeight: '800',
  },
  meta: { color: 'rgba(255,255,255,0.6)', lineHeight: 20, fontSize: 14 },
  preview: {
    marginTop: 8,
    height: 320,
    borderRadius: radius.xxl,
    overflow: 'hidden',
    backgroundColor: '#141418',
  },
  previewPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  permRow: { flexDirection: 'row', gap: 16 },
  perm: { color: 'rgba(255,255,255,0.75)', fontWeight: '700', fontSize: 13 },
});
