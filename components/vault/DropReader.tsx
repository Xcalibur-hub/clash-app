import React from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { User } from '../../store';
import { fetchProfileById } from '../../services/profileService';
import { fetchDrop, requestPrivateMediaAccess } from '../../services/vaultService';
import type { StorefrontDrop } from '../../services/vaultMappers';
import { getPublicMediaUrl } from '../../services/mediaService';
import { errorText } from '../../services/supabaseClient';
import { card, color, ink, layout, radius, space, typeScale } from '../../theme';
import { timeLeftLabel } from '../../utils/format';
import { Avatar } from '../shared/Avatar';
import { Chip } from '../shared/Chip';
import { EmptyState } from '../shared/EmptyState';
import { GlowButton } from '../shared/GlowButton';
import { BackIcon, ClockIcon, LockIcon, PlayIcon, VaultIcon } from '../shared/icons';
import { SubscriptionInfoSheet } from './SubscriptionInfoSheet';

type Phase = 'loading' | 'ready' | 'missing' | 'locked' | 'error';

export interface DropReaderProps {
  dropId: string;
}

/**
 * The Drop reader. A free Drop renders its public media; a subscriber Drop
 * requests a short-lived signed URL only after the server says the caller may
 * read it, and re-requests on failure. Signed URLs are never cached or persisted,
 * and a locked Drop renders without ever touching Storage.
 */
export function DropReader({ dropId }: DropReaderProps): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();

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
    if (nextDrop.accessLevel === 'subscriber') {
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
        return;
      }
      setPhase('ready');
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
      <View style={[styles.screen, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator color="#FFFFFF" />
      </View>
    );
  }

  const isVideo = mediaKind === 'video';

  return (
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.md }]}
      >
        <BackButton onPress={() => router.back()} />

        {creator && drop ? (
          <View style={styles.headRow}>
            <Avatar name={creator.name} tint={creator.tint} size={44} />
            <View style={styles.headText}>
              <Text allowFontScaling={false} style={styles.name} numberOfLines={1}>{creator.name}</Text>
              <Text allowFontScaling={false} style={styles.handle} numberOfLines={1}>@{creator.handle}</Text>
            </View>
            {drop.accessLevel === 'subscriber' ? (
              <Chip label={drop.accessible ? 'MEMBERS' : 'SUBSCRIBER'} icon={drop.accessible ? VaultIcon : LockIcon} tone="violet" />
            ) : null}
          </View>
        ) : null}

        <Text allowFontScaling={false} style={styles.caption}>{drop?.caption}</Text>

        {phase === 'locked' ? (
          <View style={styles.locked}>
            <LockIcon size={30} color="#C4B5FD" strokeWidth={2} />
            <Text allowFontScaling={false} style={styles.lockedTitle}>Subscriber Drop</Text>
            <Text allowFontScaling={false} style={styles.lockedBody}>
              This content is for {creator?.name ?? 'the creator'}'s subscribers.
            </Text>
            <GlowButton label="Subscription options" onPress={() => setSubscribeOpen(true)} tone="light" compact />
          </View>
        ) : url ? (
          isVideo ? (
            <View style={styles.video}>
              <PlayIcon size={30} color="#FFFFFF" strokeWidth={2.2} />
              <Text allowFontScaling={false} style={styles.videoNote}>Video playback arrives with the media player.</Text>
            </View>
          ) : (
            <View style={styles.media} accessible accessibilityRole="image" accessibilityLabel={drop?.caption}>
              <Image
                source={{ uri: url }}
                resizeMode="contain"
                style={StyleSheet.absoluteFill}
                onError={() => {
                  setUrl(null);
                  setMediaError('The media failed to load.');
                }}
              />
            </View>
          )
        ) : mediaError ? (
          <View style={styles.locked}>
            <Text allowFontScaling={false} style={styles.lockedTitle}>{mediaError}</Text>
            <GlowButton label="Try again" onPress={() => drop && void resolveMedia(drop)} tone="light" compact />
          </View>
        ) : null}

        {drop?.expiresAt && phase !== 'locked' ? (
          <Chip label={timeLeftLabel(drop.expiresAt)} icon={ClockIcon} tone="neutral" data style={styles.expiry} />
        ) : null}
      </ScrollView>

      {creator ? (
        <SubscriptionInfoSheet visible={subscribeOpen} creatorName={creator.name} onClose={() => setSubscribeOpen(false)} />
      ) : null}
    </View>
  );
}

function BackButton({ onPress }: { onPress: () => void }): React.JSX.Element {
  return <GlowButton label="Back" icon={BackIcon} tone="ink" compact onPress={onPress} style={styles.back} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  centered: { justifyContent: 'center' },
  content: { paddingHorizontal: layout.screenX, gap: space.md, paddingBottom: space.xxl },
  back: { alignSelf: 'flex-start' },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  headText: { flex: 1, gap: 2 },
  name: { ...typeScale.cardTitle, color: ink.primary },
  handle: { ...typeScale.meta, color: ink.tertiary },
  caption: { ...typeScale.title, color: ink.primary },
  media: { aspectRatio: 4 / 3, width: '100%', borderRadius: radius.lg, overflow: 'hidden', backgroundColor: card.elevated },
  video: {
    aspectRatio: 16 / 9,
    width: '100%',
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    backgroundColor: card.elevated,
  },
  videoNote: { ...typeScale.meta, color: ink.tertiary },
  locked: { alignItems: 'center', gap: space.sm, paddingVertical: space.xl },
  lockedTitle: { ...typeScale.cardTitle, color: ink.primary, textAlign: 'center' },
  lockedBody: { ...typeScale.body, color: ink.secondary, textAlign: 'center' },
  expiry: { alignSelf: 'flex-start' },
});

