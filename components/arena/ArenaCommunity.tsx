/**
 * Arena Community surface — one membership allegiance (Crew).
 * Read-only presentation from existing listMyArenaCrews. No community-war UI.
 * Discovery routes for Crews are not wired in this phase (backend freeze / no new screens).
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { listMyArenaCrews, type ArenaCrew } from '../../services/arenaCrewService';
import { layout, radius, space, typeScale, useThemeColors } from '../../theme';
import { press as hapticPress } from '../../utils/haptics';

export interface ArenaCommunityProps {
  /** Soft exit back into Arena participation when the viewer has no membership. */
  onParticipate?: () => void;
}

export function ArenaCommunity({ onParticipate }: ArenaCommunityProps): React.JSX.Element {
  const t = useThemeColors();
  const [crew, setCrew] = React.useState<ArenaCrew | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  useFocusEffect(
    React.useCallback(() => {
      let cancelled = false;
      void (async () => {
        try {
          const mine = await listMyArenaCrews();
          if (cancelled) return;
          const joined =
            mine.find((c) => c.viewer.isMember) ??
            mine.find((c) => c.viewer.activeCrewId === c.id) ??
            null;
          setCrew(joined);
          setFailed(false);
        } catch {
          if (!cancelled) {
            setCrew(null);
            setFailed(true);
          }
        } finally {
          if (!cancelled) setLoaded(true);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  return (
    <View style={styles.wrap} accessibilityLabel="Community">
      <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
        COMMUNITY
      </Text>
      <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
        Your allegiance
      </Text>
      <Text style={[styles.sub, { color: t.textSecondary }]}>
        Belong to one Community. Follow others freely. Membership never forces a vote.
      </Text>

      {!loaded ? (
        <Text style={[styles.empty, { color: t.textMuted }]}>Loading…</Text>
      ) : failed ? (
        <Text style={[styles.empty, { color: t.textMuted }]}>
          Couldn't load Community right now.
        </Text>
      ) : crew ? (
        <View style={[styles.card, { borderColor: t.border }]}>
          <Text allowFontScaling style={[styles.name, { color: t.textPrimary }]}>
            {crew.name}
          </Text>
          {crew.specialties.length > 0 ? (
            <Text style={[styles.meta, { color: t.textMuted }]} numberOfLines={2}>
              {crew.specialties.join(' · ')}
            </Text>
          ) : null}
          <Text style={[styles.meta, { color: t.textSecondary }]}>
            {crew.memberCount} members
            {crew.followerCount > 0 ? ` · ${crew.followerCount} following` : ''}
          </Text>
          {crew.bio ? (
            <Text style={[styles.bio, { color: t.textSecondary }]} numberOfLines={3}>
              {crew.bio}
            </Text>
          ) : null}
          <Text style={[styles.note, { color: t.textMuted }]}>
            PING COMMUNITY will eventually call members into a Clash as spectators and
            supporters — never as Fighter C. Not enabled yet.
          </Text>
        </View>
      ) : (
        <View style={[styles.card, { borderColor: t.border }]}>
          <Text style={[styles.emptyTitle, { color: t.textPrimary }]}>
            No Community yet
          </Text>
          <Text style={[styles.empty, { color: t.textMuted }]}>
            Participate in Arena first. When you're ready, join one Community as your
            allegiance — people you can call on, not a forced opinion.
          </Text>
          {onParticipate ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to For You"
              onPress={() => {
                hapticPress();
                onParticipate();
              }}
              style={styles.linkHit}
            >
              <Text style={[styles.link, { color: t.textPrimary }]}>Enter Arena</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: layout.screenX,
    paddingTop: space.md,
    paddingBottom: space.xl,
    gap: space.sm,
  },
  kicker: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  title: {
    ...typeScale.section,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  sub: { ...typeScale.meta, fontSize: 14, lineHeight: 20, marginBottom: space.sm },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.sm,
    marginTop: space.sm,
  },
  name: { ...typeScale.label, fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  meta: { ...typeScale.caption, fontSize: 13, lineHeight: 18 },
  bio: { ...typeScale.body, fontSize: 15, lineHeight: 21 },
  note: { ...typeScale.caption, fontSize: 12, lineHeight: 17, marginTop: space.xs },
  emptyTitle: { ...typeScale.label, fontSize: 16, fontWeight: '800' },
  empty: { ...typeScale.meta, fontSize: 13, lineHeight: 19 },
  linkHit: { minHeight: 44, justifyContent: 'center' },
  link: { ...typeScale.label, fontSize: 14, fontWeight: '800' },
});
