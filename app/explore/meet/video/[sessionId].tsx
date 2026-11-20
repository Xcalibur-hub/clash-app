import { releaseAllows } from '../../../../utils/releaseScope';
/**
 * Immersive Meet VIDEO call UI.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MeetButton } from '../../../../components/meet/MeetButton';
import { MeetReportSheet } from '../../../../components/meet/MeetReportSheet';
import { useMeetVideoSession } from '../../../../hooks/useMeetVideoSession';
import { analytics } from '../../../../services/analytics';
import {
  blockMeetPeer,
  leaveMeetSession,
  nextMeet,
  reportMeetSession,
  type MeetReportReason,
} from '../../../../services/meetService';
import { peekMeetVideoPrefs } from '../../../../services/meetVideoPrefs';
import { SupabaseError } from '../../../../services/supabaseClient';
import { radius, space } from '../../../../theme';
import { tap as hapticTap } from '../../../../utils/haptics';

let RTCView: React.ComponentType<{
  streamURL: string;
  style?: object;
  mirror?: boolean;
  objectFit?: 'contain' | 'cover';
  zOrder?: number;
}> | null = null;

try {
  // Native-only view.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  RTCView = require('react-native-webrtc').RTCView;
} catch {
  RTCView = null;
}

export default function MeetVideoCallScreen(): React.JSX.Element {
  const { sessionId: raw } = useLocalSearchParams<{ sessionId: string }>();
  const sessionId = typeof raw === 'string' ? raw : '';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const video = useMeetVideoSession(sessionId);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [reportOpen, setReportOpen] = React.useState(false);
  /** Report failures must surface: a safety report silently dropped reads as sent. */
  const [reportError, setReportError] = React.useState<string | null>(null);
  const prefs = peekMeetVideoPrefs();
  const connectedTracked = React.useRef(false);
  const leftRef = React.useRef(false);

  React.useEffect(() => {
    void video.start();
    return () => video.cleanup();
    // intentionally once per session
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Back, swipe-back, or a tab switch must end the call. An orphaned session
  // keeps `meet_has_active_session` true for both people, so neither can match
  // again until someone explicitly leaves.
  React.useEffect(
    () => () => {
      if (leftRef.current) return;
      leftRef.current = true;
      void leaveMeetSession(sessionId, 'leave').catch(() => undefined);
    },
    [sessionId],
  );

  React.useEffect(() => {
    if (video.state === 'connected' && !connectedTracked.current) {
      connectedTracked.current = true;
      analytics.track('meet_video_connected', { realm: 'explore', source: 'explore' });
    }
    if (video.state === 'failed') {
      analytics.track('meet_video_connection_failed', { realm: 'explore', source: 'explore' });
    }
  }, [video.state]);

  const peerLeft =
    video.state === 'ended' ||
    video.session?.status === 'ended' ||
    video.session?.peerConnected === false;

  const onNext = async () => {
    setBusy(true);
    leftRef.current = true;
    try {
      video.cleanup();
      analytics.track('meet_video_next', { realm: 'explore', source: 'explore' });
      const state = await nextMeet(sessionId, {
        mode: video.session?.mode ?? prefs.mode,
        channel: 'VIDEO',
        countryCode: video.session?.countryCode ?? prefs.countryCode,
        hood: video.session?.hood ?? prefs.hood,
        interests: video.session?.sharedInterest
          ? [video.session.sharedInterest]
          : prefs.interests,
      });
      if (state.matched && state.session) {
        router.replace(`/explore/meet/video/${state.session.sessionId}` as never);
      } else {
        router.replace('/explore/meet/video/prep' as never);
      }
    } catch (e) {
      void e;
      router.replace('/explore/meet/video/prep' as never);
    } finally {
      setBusy(false);
    }
  };

  const onLeave = async () => {
    setBusy(true);
    leftRef.current = true;
    try {
      video.cleanup();
      await leaveMeetSession(sessionId, 'leave');
      analytics.track('meet_video_left', { realm: 'explore', source: 'explore' });
      router.replace('/(tabs)/explore' as never);
    } finally {
      setBusy(false);
    }
  };

  const onBlock = async () => {
    setBusy(true);
    leftRef.current = true;
    try {
      video.cleanup();
      await blockMeetPeer(sessionId);
      analytics.track('meet_video_blocked', { realm: 'explore', source: 'explore' });
      router.replace('/(tabs)/explore' as never);
    } finally {
      setBusy(false);
    }
  };

  // One reason list for text and video (utils/meetSafety), so a video report can
  // finally say "child safety" instead of folding it into "other" (E3.2).
  const onReport = async (reason: MeetReportReason): Promise<void> => {
    setReportOpen(false);
    setReportError(null);
    try {
      await reportMeetSession(sessionId, reason);
      analytics.track('meet_video_reported', { realm: 'explore', source: 'explore' });
      setMenuOpen(false);
    } catch (e) {
      // Say it failed, not why: the error text can name server internals.
      setReportError(
        e instanceof SupabaseError && e.code === 'P0001'
          ? 'Too many reports. Try again later.'
          : 'Report not sent. Check your connection and try again.',
      );
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.remote}>
        {video.remoteStreamUrl && RTCView && video.cameraOn !== undefined ? (
          <RTCView
            streamURL={video.remoteStreamUrl}
            style={StyleSheet.absoluteFill}
            objectFit="cover"
            zOrder={0}
          />
        ) : (
          <View style={styles.remotePlaceholder}>
            <Text style={styles.remoteLabel}>
              {peerLeft
                ? 'They left.'
                : video.state === 'connected'
                  ? 'Stranger'
                  : video.state === 'failed'
                    ? 'Connection failed'
                    : 'Connecting…'}
            </Text>
          </View>
        )}

        {video.localStreamUrl && RTCView ? (
          <View style={styles.localWrap}>
            {video.cameraOn ? (
              <RTCView
                streamURL={video.localStreamUrl}
                style={styles.local}
                mirror={video.facing === 'user'}
                objectFit="cover"
                zOrder={1}
              />
            ) : (
              <View style={[styles.local, styles.localOff]}>
                <Text style={{ color: 'rgba(255,255,255,0.55)', fontWeight: '700' }}>You</Text>
              </View>
            )}
          </View>
        ) : null}
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Text style={styles.meta}>
          {video.session?.peerAlias ?? 'Stranger'}
          {video.session?.sharedInterest
            ? ` · ${video.session.sharedInterest}`
            : video.session?.countryCode
              ? ` · ${video.session.countryCode}`
              : ' · Anywhere'}
        </Text>

        {peerLeft ? (
          <MeetButton label="New Meet sessions unavailable" onPress={() => void onNext()} tone="light" disabled={busy || !releaseAllows('meet', 'admit')} />
        ) : (
          <View style={styles.controls}>
            <RoundCtrl
              label={video.micOn ? 'Mic' : 'Muted'}
              onPress={video.toggleMic}
              active={video.micOn}
            />
            <RoundCtrl
              label={video.cameraOn ? 'Cam' : 'Off'}
              onPress={video.toggleCamera}
              active={video.cameraOn}
            />
            <RoundCtrl label="Flip" onPress={video.flipCamera} active />
            <Pressable
              onPress={() => {
                hapticTap();
                void onNext();
              }}
              style={[styles.next, busy && { opacity: 0.5 }]}
              accessibilityRole="button"
              accessibilityLabel="New Meet sessions unavailable"
              disabled={busy || !releaseAllows('meet', 'admit')}
            >
              <Text style={styles.nextText}>NEXT</Text>
            </Pressable>
            <RoundCtrl
              label="More"
              onPress={() => {
                hapticTap();
                setMenuOpen((v) => !v);
              }}
              active
            />
          </View>
        )}

        {menuOpen ? (
          <View style={styles.menu}>
            <MeetButton
              label="Report"
              onPress={() => {
                setMenuOpen(false);
                setReportOpen(true);
              }}
              tone="glass"
              compact
            />
            <MeetButton label="Block" onPress={() => void onBlock()} tone="ink" compact />
            <MeetButton label="Leave" onPress={() => void onLeave()} tone="glass" compact />
          </View>
        ) : null}

        <MeetReportSheet
          visible={reportOpen}
          title="Report this call"
          subtitle="Only the reason is sent. Moderators can read this conversation; the stranger is not told."
          onPick={(reason) => void onReport(reason)}
          onCancel={() => setReportOpen(false)}
        />

        {video.error ? <Text style={styles.err}>{video.error}</Text> : null}
        {reportError ? <Text style={styles.err}>{reportError}</Text> : null}
      </View>
    </View>
  );
}

function RoundCtrl({
  label,
  onPress,
  active,
}: {
  label: string;
  onPress: () => void;
  active: boolean;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={() => {
        hapticTap();
        onPress();
      }}
      style={[styles.round, !active && styles.roundOff]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={styles.roundText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#050507' },
  remote: { flex: 1, backgroundColor: '#0B0B0E' },
  remotePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  remoteLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 22, fontWeight: '700' },
  localWrap: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    width: 108,
    height: 144,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  local: { width: '100%', height: '100%' },
  localOff: {
    backgroundColor: '#1A1A1F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  meta: { color: 'rgba(255,255,255,0.65)', fontWeight: '600', fontSize: 13 },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  round: {
    minWidth: 52,
    minHeight: 52,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  roundOff: { backgroundColor: 'rgba(255,80,80,0.25)' },
  roundText: { color: '#FAFAF8', fontWeight: '800', fontSize: 11 },
  next: {
    minHeight: 52,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: '#FAFAF8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextText: { color: '#111113', fontWeight: '900', fontSize: 13, letterSpacing: 0.6 },
  menu: { gap: 8 },
  err: { color: '#FF8A80', fontSize: 13 },
});
