import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmptyState } from '../../../components/shared/EmptyState';
import { Notice } from '../../../components/shared/Notice';
import { WorldIcon } from '../../../components/shared/icons';
import { LiveControlPanel } from '../../../components/vault/live/LiveControlPanel';
import { LiveCrowdOverlay } from '../../../components/vault/live/LiveCrowdOverlay';
import { LiveInteractionPanel } from '../../../components/vault/live/LiveInteractionPanel';
import { LiveStage } from '../../../components/vault/live/LiveStage';
import { useCreatorLive } from '../../../hooks/useCreatorLive';
import { useCreatorLiveHost } from '../../../hooks/useCreatorLiveHost';
import { liveCoverUrl } from '../../../services/creatorLiveService';
import { worldPersonality } from '../../../utils/vaultWorldPersonality';
import { layout, space, typeScale, useThemeColors } from '../../../theme';
import { tap as hapticTap } from '../../../utils/haptics';
import { useClash } from '../../../store';

/**
 * The live room. A large event plane, then only the interactions the creator
 * opened — no comment wall, no dashboard chrome.
 */
export default function CreatorLiveScreen(): React.JSX.Element {
  const params = useLocalSearchParams<{ sessionId: string | string[] }>();
  const sessionId = Array.isArray(params.sessionId) ? params.sessionId[0] : params.sessionId;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useThemeColors();

  const clash = useClash();
  const live = useCreatorLive(sessionId);
  const signedIn = clash.state.viewer !== null;
  const host = useCreatorLiveHost(sessionId, live.refresh);
  const session = live.session;

  const personality = worldPersonality({
    creatorId: session?.creatorId ?? 'world',
    handle: session?.creatorHandle ?? null,
    name: session?.creatorName ?? null,
  });

  if (live.loading) {
    return (
      <View style={[styles.center, { backgroundColor: t.background }]}>
        <ActivityIndicator color={t.textPrimary} />
      </View>
    );
  }

  if (session === null) {
    return (
      <View style={[styles.center, { backgroundColor: t.background, paddingTop: insets.top }]}>
        <EmptyState
          icon={WorldIcon}
          title="Live unavailable"
          body={live.error ?? 'This session is members-only or has ended.'}
          actionLabel="BACK"
          onAction={() => router.back()}
        />
        <Notice offset={0} />
      </View>
    );
  }

  const others = live.interactions.filter(
    (item) => item.id !== live.featured?.id && item.status === 'OPEN',
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + space.sm,
          paddingHorizontal: layout.screenX,
          paddingBottom: insets.bottom + space.xxl,
          gap: space.md,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable
            onPress={() => {
              hapticTap();
              router.back();
            }}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Text allowFontScaling={false} style={[styles.back, { color: t.textMuted }]}>
              ← Back
            </Text>
          </Pressable>
          {!session.isOwner ? (
            <Pressable
              onPress={() => void live.report('spam')}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Report this session"
            >
              <Text allowFontScaling={false} style={[styles.back, { color: t.textMuted }]}>
                Report
              </Text>
            </Pressable>
          ) : null}
        </View>

        <LiveStage
          session={session}
          personality={personality}
          watching={live.watching}
          posterUrl={liveCoverUrl(session.coverMedia)}
        >
          <LiveCrowdOverlay banner={live.banner} />
        </LiveStage>

        {live.featured ? (
          <LiveInteractionPanel
            interaction={live.featured}
            busy={live.voting}
            blockedNote={signedIn ? undefined : 'Sign in to take part'}
            onVote={(optionId) => void live.vote(live.featured?.id ?? '', optionId)}
          />
        ) : (
          <Text allowFontScaling={false} style={[styles.quiet, { color: t.textMuted }]}>
            {session.status === 'LIVE'
              ? 'Waiting for the creator to open something.'
              : session.status === 'SCHEDULED'
                ? 'Not started yet.'
                : 'This session has ended.'}
          </Text>
        )}

        {others.map((item) => (
          <LiveInteractionPanel
            key={item.id}
            interaction={item}
            busy={live.voting}
            blockedNote={signedIn ? undefined : 'Sign in to take part'}
            onVote={(optionId) => void live.vote(item.id, optionId)}
          />
        ))}

        {session.isOwner ? (
          <LiveControlPanel
            session={session}
            interactions={live.interactions}
            busy={host.busy}
            onStart={() => void host.start()}
            onEnd={() => void host.end()}
            onOpenInteraction={(draft) =>
              void host.openInteraction({
                type: draft.type,
                prompt: draft.prompt,
                options: draft.options,
                actionKind: draft.actionKind,
                threshold: draft.threshold,
                durationSeconds: draft.durationSeconds,
              })
            }
            onCloseInteraction={(interactionId) => void host.closeInteraction(interactionId)}
          />
        ) : null}
      </ScrollView>
      <Notice offset={0} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { ...typeScale.label, fontWeight: '700' },
  quiet: { ...typeScale.meta },
});

