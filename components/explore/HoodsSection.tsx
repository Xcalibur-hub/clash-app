import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { fetchHoodSummaries, joinHood, leaveHood, type HoodSummary } from '../../services/hoodService';
import { card, ink, radius, space, typeScale } from '../../theme';
import { compact } from '../../utils/format';
import { tap as hapticTap } from '../../utils/haptics';
import { SectionHeading } from '../shared/SectionHeading';
import { exploreStyles as s } from './exploreStyles';

export interface HoodsSectionProps {
  /** The signed-in viewer's profile id, or null for a guest. */
  profileId: string | null;
  signedIn: boolean;
}

/**
 * Hood discovery (PRD §15): every Hood with real member + live-Take counts and a
 * Join/Joined control backed by `hoodService`. No static "members" vanity numbers.
 */
export function HoodsSection({ profileId, signedIn }: HoodsSectionProps): React.JSX.Element {
  const router = useRouter();
  const [summaries, setSummaries] = React.useState<HoodSummary[] | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const load = React.useCallback(async (): Promise<void> => {
    try {
      setSummaries(await fetchHoodSummaries(profileId));
    } catch {
      setSummaries([]);
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
      else await joinHood(summary.hood.id);
      await load();
    } catch {
      // Refetch on next focus; leave the shelf unchanged rather than lying about it.
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={s.section}>
      <SectionHeading eyebrow="DISCOVER" title="Hoods" />
      {summaries === null ? (
        <ActivityIndicator color="#FFFFFF" style={styles.spinner} />
      ) : (
        <View style={styles.list}>
          {summaries.map((summary) => (
            <View key={summary.hood.id} style={styles.row}>
              <Pressable
                onPress={() => open(summary.hood.id)}
                accessibilityRole="button"
                accessibilityLabel={`Open ${summary.hood.name}`}
                style={styles.info}
              >
                <Text allowFontScaling={false} numberOfLines={1} style={styles.name}>
                  {summary.hood.name}
                </Text>
                <Text allowFontScaling={false} numberOfLines={1} style={styles.meta}>
                  {compact(summary.memberCount)} members · {summary.liveCount} live
                </Text>
              </Pressable>
              <Pressable
                onPress={() => void toggle(summary)}
                disabled={busy === summary.hood.id}
                accessibilityRole="button"
                accessibilityLabel={summary.joined ? `Leave ${summary.hood.name}` : `Join ${summary.hood.name}`}
                style={[styles.join, summary.joined && styles.joined]}
              >
                <Text allowFontScaling={false} style={[styles.joinText, summary.joined && styles.joinedText]}>
                  {summary.joined ? 'Joined' : 'Join'}
                </Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: card.border,
    backgroundColor: card.native,
  },
  info: { flex: 1, gap: 2 },
  name: { ...typeScale.label, color: ink.primary, fontWeight: '700' },
  meta: { ...typeScale.meta, color: ink.tertiary },
  join: {
    paddingHorizontal: space.lg,
    height: 36,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  joined: { backgroundColor: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.08)' },
  joinText: { ...typeScale.label, color: ink.primary, fontWeight: '700' },
  joinedText: { color: ink.secondary },
  spinner: { paddingVertical: space.xl },
});
