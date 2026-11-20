import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PredictionCard } from '../../../components/arena/PredictionCard';
import { EmptyState } from '../../../components/shared/EmptyState';
import { GlowButton } from '../../../components/shared/GlowButton';
import { Notice } from '../../../components/shared/Notice';
import { ArenaIcon, BackIcon } from '../../../components/shared/icons';
import { useClock } from '../../../hooks/useClock';
import { useRequireAuth } from '../../../hooks/useRequireAuth';
import {
  fetchHoodGameView,
  resolvePredictionGame,
  submitPrediction,
  type HoodGameView,
} from '../../../services/hoodGameService';
import { errorText } from '../../../services/supabaseClient';
import { showNotice, useClash } from '../../../store';
import { color, ink, space, typeScale } from '../../../theme';
import { tap as hapticTap } from '../../../utils/haptics';

/** Prediction detail — submit, lock, close, resolve, final percentages. */
export default function HoodGameScreen(): React.JSX.Element {
  const { gameId } = useLocalSearchParams<{ gameId: string | string[] }>();
  const id = Array.isArray(gameId) ? gameId[0] : gameId;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const requireAuth = useRequireAuth();
  const { dispatch } = useClash();
  const now = useClock(30_000);

  const [game, setGame] = React.useState<HoodGameView | null | undefined>(undefined);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async (): Promise<void> => {
    try {
      setGame(await fetchHoodGameView(id));
    } catch (error) {
      dispatch(showNotice(errorText(error)));
      setGame(null);
    }
  }, [id, dispatch]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const pick = async (optionId: string): Promise<void> => {
    if (!requireAuth() || busy) return;
    setBusy(true);
    try {
      await submitPrediction(id, optionId);
      await load();
    } catch (error) {
      dispatch(showNotice(errorText(error)));
    } finally {
      setBusy(false);
    }
  };

  const resolve = async (optionId: string): Promise<void> => {
    if (!requireAuth() || busy) return;
    setBusy(true);
    try {
      await resolvePredictionGame(id, optionId);
      await load();
    } catch (error) {
      dispatch(showNotice(errorText(error)));
    } finally {
      setBusy(false);
    }
  };

  if (game === undefined) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={ink.primary} />
      </View>
    );
  }

  if (game === null) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + space.md }]}>
        <EmptyState
          icon={ArenaIcon}
          title="Prediction not found"
          body="This game is no longer available."
          actionLabel="BACK"
          onAction={() => router.back()}
        />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topRow}>
          <Pressable
            onPress={() => {
              hapticTap();
              if (router.canGoBack()) router.back();
              else router.replace(`/hood/${game.hood}`);
            }}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={8}
            style={styles.backBtn}
          >
            <BackIcon size={20} color={ink.primary} />
          </Pressable>
          <Text allowFontScaling={false} style={styles.eyebrow}>PLAY</Text>
          <View style={styles.slot} />
        </View>

        <PredictionCard
          game={game}
          now={now}
          busy={busy}
          onPick={(optionId) => void pick(optionId)}
        />

        {game.mayResolve ? (
          <View style={styles.resolveBox}>
            <Text allowFontScaling={false} style={styles.resolveTitle}>Resolve outcome</Text>
            <Text allowFontScaling={false} style={styles.resolveBody}>
              Pick the correct option. This cannot be changed after publish.
            </Text>
            {game.options.map((option) => (
              <GlowButton
                key={option.id}
                label={option.label}
                tone="ink"
                compact
                disabled={busy}
                onPress={() => void resolve(option.id)}
                style={styles.resolveBtn}
              />
            ))}
          </View>
        ) : null}
      </ScrollView>
      <Notice offset={0} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: space.md, gap: space.md },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { minWidth: 44, minHeight: 44, justifyContent: 'center' },
  slot: { width: 44, height: 44 },
  eyebrow: { ...typeScale.caption, color: ink.tertiary },
  resolveBox: {
    gap: space.sm,
    padding: space.md,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  resolveTitle: { ...typeScale.label, color: ink.primary, fontWeight: '700' },
  resolveBody: { ...typeScale.meta, color: ink.tertiary },
  resolveBtn: { alignSelf: 'stretch' },
});
