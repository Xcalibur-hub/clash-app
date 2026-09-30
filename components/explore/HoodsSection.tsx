import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { fetchHoodSummaries, joinHood, leaveHood, type HoodSummary } from '../../services/hoodService';
import { analytics } from '../../services/analytics';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { compact } from '../../utils/format';
import { tap as hapticTap } from '../../utils/haptics';
import { PressableScale } from '../shared/PressableScale';
import { ExploreHeading } from './ExploreHeading';

export interface HoodsSectionProps {
  profileId: string | null;
  signedIn: boolean;
}

/** Hood discovery — community cards with real member/live counts. */
export function HoodsSection({ profileId, signedIn }: HoodsSectionProps): React.JSX.Element {
  const router = useRouter();
  const t = useThemeColors();
  const [summaries, setSummaries] = React.useState<HoodSummary[] | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);

  const load = React.useCallback(async (): Promise<void> => {
    try {
      setFailed(false);
      setSummaries(await fetchHoodSummaries(profileId));
    } catch {
      setSummaries([]);
      setFailed(true);
    }
  }, [profileId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const open = (hood: string): void => {
    hapticTap();
    router.push(`/(tabs)?hood=${hood}`);
  };

  const toggle = async (summary: HoodSummary): Promise<void> => {
    if (!signedIn) {
      hapticTap();
      router.push('/auth');
      return;
    }
    if (busy) return;
    setBusy(summary.hood.id);
    hapticTap();
    try {
      if (summary.joined) await leaveHood(summary.hood.id);
      else {
        await joinHood(summary.hood.id);
        analytics.track('hood_joined', { hood_id: summary.hood.id, realm: 'arena', source: 'explore' });
      }
      await load();
    } catch {
      /* leave shelf unchanged */
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.section}>
      <ExploreHeading title="Hoods to explore" />
      {summaries === null ? (
        <ActivityIndicator color={t.textMuted} style={styles.spinner} />
      ) : failed ? (
        <Pressable onPress={() => void load()} accessibilityRole="button" accessibilityLabel="Retry loading Hoods">
          <Text allowFontScaling={false} style={[styles.retry, { color: t.textSecondary }]}>
            Couldn’t load Hoods. Tap to retry.
          </Text>
        </Pressable>
      ) : (
        <View style={styles.list}>
          {summaries.map((summary) => (
            <PressableScale
              key={summary.hood.id}
              onPress={() => open(summary.hood.id)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${summary.hood.name}`}
              style={[
                styles.card,
                {
                  backgroundColor: t.surface,
                  borderColor: t.border,
                  shadowColor: t.shadowColor,
                  shadowOpacity: t.scheme === 'light' ? 0.08 : 0,
                },
              ]}
            >
              <View style={styles.info}>
                <Text allowFontScaling={false} numberOfLines={1} style={[styles.name, { color: t.textPrimary }]}>
                  {summary.hood.name}
                </Text>
                <Text allowFontScaling={false} numberOfLines={2} style={[styles.tagline, { color: t.textSecondary }]}>
                  {summary.hood.tagline}
                </Text>
                <Text allowFontScaling={false} numberOfLines={1} style={[styles.meta, { color: t.textMuted }]}>
                  {compact(summary.memberCount)} members · {summary.liveCount} live
                </Text>
              </View>
              <View style={styles.actions}>
                <Pressable
                  onPress={() => void toggle(summary)}
                  disabled={busy === summary.hood.id}
                  accessibilityRole="button"
                  accessibilityLabel={summary.joined ? `Leave ${summary.hood.name}` : `Join ${summary.hood.name}`}
                  style={[
                    styles.join,
                    {
                      backgroundColor: summary.joined ? t.surfaceMuted : t.pill,
                      borderColor: summary.joined ? t.border : t.pill,
                    },
                  ]}
                >
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.joinText,
                      { color: summary.joined ? t.textSecondary : t.pillText },
                    ]}
                  >
                    {summary.joined ? 'Joined' : 'Join'}
                  </Text>
                </Pressable>
                <Text allowFontScaling={false} style={[styles.enter, { color: t.textMuted }]}>
                  Enter →
                </Text>
              </View>
            </PressableScale>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.md },
  list: { gap: 10 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  info: { flex: 1, gap: 3 },
  name: { ...typeScale.label, fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  tagline: { ...typeScale.meta, fontSize: 13, lineHeight: 18 },
  meta: { ...typeScale.meta, fontSize: 12, marginTop: 2 },
  actions: { alignItems: 'flex-end', gap: 8 },
  join: {
    paddingHorizontal: 14,
    height: 34,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  joinText: { ...typeScale.label, fontSize: 12, fontWeight: '700' },
  enter: { ...typeScale.meta, fontSize: 11, fontWeight: '600' },
  spinner: { paddingVertical: space.lg },
  retry: { ...typeScale.meta, paddingVertical: space.sm },
});
