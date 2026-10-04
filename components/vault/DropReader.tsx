import React from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { User } from '../../store';
import { fetchProfileById } from '../../services/profileService';
import { fetchDrop, requestPrivateMediaAccess } from '../../services/vaultService';
import type { StorefrontDrop } from '../../services/vaultMappers';
import { getPublicMediaUrl } from '../../services/mediaService';
import { errorText } from '../../services/supabaseClient';
import { analytics } from '../../services/analytics';
import {
  vaultDropAccessBadge,
  vaultDropDisplayAccess,
  vaultExpiryLabel,
} from '../../utils/vaultAccess';
import { layout, space, typeScale, useThemeColors } from '../../theme';
import { Avatar } from '../shared/Avatar';
import { BackIcon, PlayIcon } from '../shared/icons';
import { SubscriptionInfoSheet } from './SubscriptionInfoSheet';
import { VaultActionButton } from './VaultActionButton';
import { tap as hapticTap } from '../../utils/haptics';

type Phase = 'loading' | 'ready' | 'missing' | 'locked' | 'error';

export interface DropReaderProps {
  dropId: string;
}

/**
 * Drop detail — media dominates. Free → public URL; subscriber → signed URL only
 * after accessible. Locked Drops use intentional preview only — never private bytes.
 */
export function DropReader({ dropId }: DropReaderProps): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useThemeColors();

  const [phase, setPhase] = React.useState<Phase>('loading');
  const [drop, setDrop] = React.useState<StorefrontDrop | null>(null);
  const [creator, setCreator] = React.useState<User | null>(null);
  const [url, setUrl] = React.useState<string | null>(null);
  const [mediaKind, setMediaKind] = React.useState<string>('image');
  const [mediaError, setMediaError] = React.useState<string | null>(null);
  const [subscribeOpen, setSubscribeOpen] = React.useState(false);

  const resolveMedia = React.useCallback(async (nextDrop: StorefrontDrop): Promise<void> => {
    setMediaError(null);
    if (nextDrop.publicMedia) {
      setMediaKind(nextDrop.publicMedia.kind);
      setUrl(getPublicMediaUrl(nextDrop.publicMedia.bucket, nextDrop.publicMedia.path));
      return;
    }
    if (nextDrop.accessLevel === 'subscriber' && nextDrop.accessible) {
      try {
        const access = await requestPrivateMediaAccess(nextDrop.id);
        setMediaKind(access.mediaKind);
        setUrl(access.url);
      } catch (error) {
        setMediaError(errorText(error));
      }
    }
  }, []);

  const load = React.useCallback(async (): Promise<void> => {
    try {
      const nextDrop = await fetchDrop(dropId);
      if (!nextDrop) {
        setPhase('missing');
        return;
      }
      setDrop(nextDrop);
      const profile = await fetchProfileById(nextDrop.creatorId);
      setCreator(profile);

      if (!nextDrop.accessible) {
        setPhase('locked');
        const preview = nextDrop.previewMedia;
        if (preview) {
          setMediaKind(preview.kind);
          setUrl(getPublicMediaUrl(preview.bucket, preview.path));
        } else {
          setUrl(null);
        }
        analytics.trackOnce(`vault_drop_opened:${dropId}`, 'vault_drop_opened', {
          realm: 'vault',
          vault_access_type: nextDrop.accessLevel,
          accessible: false,
        });
        return;
      }
      setPhase('ready');
      analytics.trackOnce(`vault_drop_opened:${dropId}`, 'vault_drop_opened', {
        realm: 'vault',
        vault_access_type: nextDrop.accessLevel,
        accessible: true,
      });
      await resolveMedia(nextDrop);
    } catch {
      setPhase('error');
    }
  }, [dropId, resolveMedia]);

  React.useEffect(() => {
    setPhase('loading');
    void load();
  }, [load]);

  if (phase === 'loading') {
    return (
      <View style={[styles.screen, styles.centered, { backgroundColor: t.background, paddingTop: insets.top }]}>
        <ActivityIndicator color={t.textPrimary} />
      </View>
    );
  }

  if (phase === 'missing' || phase === 'error') {
    return (
      <View style={[styles.screen, { backgroundColor: t.background, paddingTop: insets.top + space.md }]}>
        <BackChip onPress={() => router.back()} />
        <View style={styles.missing}>
          <Text allowFontScaling={false} style={[styles.lockedTitle, { color: t.textPrimary }]}>
            Drop unavailable
          </Text>
          <Text allowFontScaling={false} style={[styles.lockedBody, { color: t.textSecondary }]}>
            This Drop may have expired or been removed.
          </Text>
        </View>
      </View>
    );
  }

  const display = drop
    ? vaultDropDisplayAccess({
        accessLevel: drop.accessLevel,
        accessible: drop.accessible,
        hasPreviewMedia: Boolean(drop.previewMedia),
      })
    : 'FREE';
  const badge = vaultDropAccessBadge(display);
  const isVideo = mediaKind === 'video';
  const expiry = drop?.expiresAt && phase !== 'locked' ? vaultExpiryLabel(drop.expiresAt) : null;
  const collectionHint =
    drop && drop.collectionIds.length > 0
      ? drop.collectionIds.length === 1
        ? 'In a Collection'
        : `In ${drop.collectionIds.length} Collections`
      : null;

  return (
    <View style={[styles.screen, { backgroundColor: t.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + space.md,
            paddingBottom: insets.bottom + space.xl,
          },
        ]}
      >
        <BackChip onPress={() => router.back()} />

        {phase === 'locked' ? (
          <View style={styles.lockedStack}>
            {url ? (
              <View style={[styles.mediaHero, { backgroundColor: t.surfaceMuted }]}>
                <Image source={{ uri: url }} resizeMode="cover" style={StyleSheet.absoluteFill} />
                <View style={styles.mediaScrim} />
              </View>
            ) : (
              <View style={[styles.lockedPlate, { backgroundColor: t.surfaceMuted, borderColor: t.border }]}>
                <Text allowFontScaling={false} style={[styles.lockedKicker, { color: t.textMuted }]}>
                  SUBSCRIBERS
                </Text>
              </View>
            )}
            <Text allowFontScaling={false} style={[styles.caption, { color: t.textPrimary }]}>
              {drop?.caption}
            </Text>
            <Text allowFontScaling={false} style={[styles.accessLine, { color: t.textMuted }]}>
              Subscribers
            </Text>
            <VaultActionButton label="Unlock" onPress={() => setSubscribeOpen(true)} />
          </View>
        ) : (
          <>
            {url ? (
              isVideo ? (
                <View style={[styles.mediaHero, styles.videoHero, { backgroundColor: t.surfaceMuted }]}>
                  <PlayIcon size={30} color={t.textPrimary} strokeWidth={2.2} />
                  <Text allowFontScaling={false} style={[styles.videoNote, { color: t.textMuted }]}>
                    Video playback arrives with the media player.
                  </Text>
                </View>
              ) : (
                <View
                  style={[styles.mediaHero, { backgroundColor: t.surfaceMuted }]}
                  accessible
                  accessibilityRole="image"
                  accessibilityLabel={drop?.caption}
                >
                  <Image
                    source={{ uri: url }}
                    resizeMode="cover"
                    style={StyleSheet.absoluteFill}
                    onError={() => {
                      setUrl(null);
                      setMediaError('The media failed to load.');
                    }}
                  />
                </View>
              )
            ) : mediaError ? (
              <View style={[styles.lockedPlate, { backgroundColor: t.surfaceMuted, borderColor: t.border }]}>
                <Text allowFontScaling={false} style={[styles.lockedTitle, { color: t.textPrimary }]}>
                  {mediaError}
                </Text>
                <VaultActionButton
                  label="Try again"
                  onPress={() => drop && void resolveMedia(drop)}
                  tone="quiet"
                  compact
                />
              </View>
            ) : null}

            {creator && drop ? (
              <Pressable
                style={styles.headRow}
                onPress={() => router.push(`/vault/${creator.id}`)}
                accessibilityRole="button"
                accessibilityLabel={`Open ${creator.name}'s Vault`}
              >
                <Avatar name={creator.name} tint={creator.tint} size={44} />
                <View style={styles.headText}>
                  <Text allowFontScaling={false} style={[styles.name, { color: t.textPrimary }]} numberOfLines={1}>
                    {creator.name}
                  </Text>
                  <Text allowFontScaling={false} style={[styles.handle, { color: t.textMuted }]} numberOfLines={1}>
                    @{creator.handle}
                  </Text>
                </View>
              </Pressable>
            ) : null}

            <Text allowFontScaling={false} style={[styles.caption, { color: t.textPrimary }]}>
              {drop?.caption}
            </Text>
            <Text allowFontScaling={false} style={[styles.accessLine, { color: t.textMuted }]}>
              {badge}
              {expiry ? ` · ${expiry}` : ''}
            </Text>
            {collectionHint ? (
              <Pressable
                onPress={() => {
                  const first = drop?.collectionIds[0];
                  if (first) router.push(`/vault/collection/${first}`);
                }}
              >
                <Text allowFontScaling={false} style={[styles.context, { color: t.textSecondary }]}>
                  {collectionHint}
                </Text>
              </Pressable>
            ) : null}
          </>
        )}
      </ScrollView>

      {creator ? (
        <SubscriptionInfoSheet
          visible={subscribeOpen}
          creatorName={creator.name}
          onClose={() => setSubscribeOpen(false)}
        />
      ) : null}
    </View>
  );
}

function BackChip({ onPress }: { onPress: () => void }): React.JSX.Element {
  const t = useThemeColors();
  return (
    <Pressable
      onPress={() => {
        hapticTap();
        onPress();
      }}
      style={[styles.back, { backgroundColor: t.surface, borderColor: t.border }]}
      accessibilityRole="button"
      accessibilityLabel="Back"
    >
      <BackIcon size={18} color={t.textPrimary} strokeWidth={2.2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { justifyContent: 'center', alignItems: 'center' },
  content: { paddingHorizontal: layout.screenX, gap: space.md },
  back: {
    alignSelf: 'flex-start',
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  mediaHero: {
    aspectRatio: 4 / 5,
    width: '100%',
    borderRadius: 28,
    overflow: 'hidden',
  },
  mediaScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(9,9,11,0.18)',
  },
  videoHero: {
    aspectRatio: 16 / 9,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
  },
  videoNote: { ...typeScale.meta, textAlign: 'center' },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  headText: { flex: 1, gap: 2 },
  name: { ...typeScale.cardTitle },
  handle: { ...typeScale.meta },
  caption: { ...typeScale.title },
  accessLine: { ...typeScale.caption, letterSpacing: 0.5 },
  context: { ...typeScale.meta },
  lockedStack: { gap: space.md },
  lockedPlate: {
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.xl,
    paddingHorizontal: space.lg,
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    aspectRatio: 16 / 10,
    justifyContent: 'center',
  },
  lockedKicker: { ...typeScale.caption, letterSpacing: 0.8 },
  lockedTitle: { ...typeScale.section, textAlign: 'center' },
  lockedBody: { ...typeScale.body, textAlign: 'center' },
  missing: { padding: space.xl, gap: space.sm, alignItems: 'center' },
});
