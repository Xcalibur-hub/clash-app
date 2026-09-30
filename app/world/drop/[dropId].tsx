import React from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmptyState } from '../../../components/shared/EmptyState';
import { GlowButton } from '../../../components/shared/GlowButton';
import { Notice } from '../../../components/shared/Notice';
import { BackIcon, PlayIcon, WorldIcon } from '../../../components/shared/icons';
import { useClock } from '../../../hooks/useClock';
import { errorText } from '../../../services/supabaseClient';
import { analytics } from '../../../services/analytics';
import { fetchWorldDrop, type WorldDrop } from '../../../services/worldService';
import { showNotice, useClash } from '../../../store';
import { radius, space, typeScale, useThemeColors } from '../../../theme';
import { timeAgo, timeLeftLabel } from '../../../utils/format';
import { tap as hapticTap } from '../../../utils/haptics';

/**
 * Full World Drop — content around an approximate area.
 * Never shows exact coordinates or street addresses.
 * Light visual alignment only — map experience is the priority.
 */
export default function WorldDropDetailScreen(): React.JSX.Element {
  const { dropId } = useLocalSearchParams<{ dropId: string | string[] }>();
  const id = Array.isArray(dropId) ? dropId[0] : dropId;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { dispatch } = useClash();
  const t = useThemeColors();
  const now = useClock(30_000);

  const [drop, setDrop] = React.useState<WorldDrop | null | undefined>(undefined);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const next = await fetchWorldDrop(id);
        if (!cancelled) {
          setDrop(next);
          if (next) {
            analytics.trackOnce(`world_drop_opened:${next.id}`, 'world_drop_opened', {
              realm: 'world',
              world_distance_band: next.distanceBand ?? undefined,
              media_type: next.media?.kind === 'video' ? 'video' : next.media ? 'image' : 'none',
            });
          }
        }
      } catch (error) {
        if (!cancelled) {
          dispatch(showNotice(errorText(error)));
          setDrop(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, dispatch]);

  if (drop === undefined) {
    return (
      <View style={[styles.root, styles.center, { backgroundColor: t.background }]}>
        <ActivityIndicator color={t.textPrimary} />
      </View>
    );
  }

  if (drop === null) {
    return (
      <View style={[styles.root, { backgroundColor: t.background, paddingTop: insets.top + space.md }]}>
        <EmptyState
          icon={WorldIcon}
          title="Drop unavailable"
          body="This World Drop may have expired or been removed."
          actionLabel="BACK TO WORLD"
          onAction={() => router.replace('/world')}
        />
      </View>
    );
  }

  const authorName = drop.author?.name ?? 'Someone';
  const handle = drop.author ? `@${drop.author.handle}` : null;
  const distance = drop.distanceBand ?? null;
  const posted = drop.publishedAt ? timeAgo(drop.publishedAt, now) : null;
  const expiry = drop.expiresAt ? timeLeftLabel(drop.expiresAt, now) : null;
  const imageUrl = drop.media?.kind === 'image' ? drop.media.url : null;

  return (
    <View style={[styles.root, { backgroundColor: t.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, { backgroundColor: t.surfaceMuted }]}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.heroFallback]}>
              <PlayIcon size={36} color={t.textPrimary} strokeWidth={2.2} />
            </View>
          )}
          <Pressable
            onPress={() => {
              hapticTap();
              if (router.canGoBack()) router.back();
              else router.replace('/world');
            }}
            style={[
              styles.back,
              {
                top: insets.top + space.sm,
                backgroundColor: t.scheme === 'light' ? 'rgba(255,255,255,0.88)' : 'rgba(12,12,15,0.72)',
                borderColor: t.border,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <BackIcon size={20} color={t.textPrimary} />
          </Pressable>
        </View>

        <View style={styles.body}>
          <Text allowFontScaling={false} style={[styles.author, { color: t.textPrimary }]}>
            {authorName}
          </Text>
          <Text allowFontScaling={false} style={[styles.meta, { color: t.textSecondary }]}>
            {[handle, distance, posted ? `${posted} ago` : null].filter(Boolean).join(' · ')}
          </Text>
          {drop.mission ? (
            <Text allowFontScaling={false} style={[styles.mission, { color: t.textMuted }]}>
              Mission · {drop.mission.title}
            </Text>
          ) : null}
          {drop.caption ? (
            <Text allowFontScaling={false} style={[styles.caption, { color: t.textPrimary }]}>
              {drop.caption}
            </Text>
          ) : null}
          {drop.mission ? (
            <View
              style={[
                styles.context,
                { borderColor: t.border, backgroundColor: t.surfaceMuted },
              ]}
            >
              <Text allowFontScaling={false} style={[styles.contextEyebrow, { color: t.textMuted }]}>
                MISSION
              </Text>
              <Text allowFontScaling={false} style={[styles.contextPrompt, { color: t.textSecondary }]}>
                {drop.mission.prompt}
              </Text>
            </View>
          ) : null}
          {expiry ? (
            <Text allowFontScaling={false} style={[styles.expiry, { color: t.textMuted }]}>
              {expiry}
            </Text>
          ) : null}

          <View style={styles.actions}>
            {drop.author ? (
              <GlowButton
                label="View creator"
                tone="ink"
                compact
                onPress={() => {
                  hapticTap();
                  router.push(`/profile/${drop.author!.id}`);
                }}
              />
            ) : null}
            <GlowButton
              label="Explore nearby"
              tone="light"
              compact
              onPress={() => {
                hapticTap();
                router.replace('/world');
              }}
            />
          </View>
        </View>
      </ScrollView>
      <Notice offset={0} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  hero: {
    width: '100%',
    aspectRatio: 4 / 5,
  },
  heroFallback: { alignItems: 'center', justifyContent: 'center' },
  back: {
    position: 'absolute',
    left: space.md,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  body: { padding: space.md, gap: space.sm },
  author: { ...typeScale.title },
  meta: { ...typeScale.meta },
  mission: { ...typeScale.caption },
  caption: { ...typeScale.body, marginTop: space.xs },
  context: {
    marginTop: space.sm,
    gap: 4,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  contextEyebrow: { ...typeScale.caption, letterSpacing: 0.6 },
  contextPrompt: { ...typeScale.body },
  expiry: { ...typeScale.meta },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
});
