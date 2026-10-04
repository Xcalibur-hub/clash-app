import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchProfileById } from '../../services/profileService';
import { fetchCollection, fetchDrop } from '../../services/vaultService';
import type { StorefrontDrop, VaultCollection } from '../../services/vaultMappers';
import type { User } from '../../store';
import { layout, space, typeScale, useThemeColors } from '../../theme';
import { EmptyState } from '../shared/EmptyState';
import { BackIcon, VaultIcon } from '../shared/icons';
import { VaultDropCard } from './VaultDropCard';
import { SubscriptionInfoSheet } from './SubscriptionInfoSheet';
import { tap as hapticTap } from '../../utils/haptics';

type Phase = 'loading' | 'ready' | 'missing' | 'error';

export interface CollectionWorldProps {
  collectionId: string;
}

/**
 * Collection as a mini-series — numbered episodes, not a database list.
 */
export function CollectionWorld({ collectionId }: CollectionWorldProps): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useThemeColors();

  const [phase, setPhase] = React.useState<Phase>('loading');
  const [collection, setCollection] = React.useState<VaultCollection | null>(null);
  const [creator, setCreator] = React.useState<User | null>(null);
  const [episodes, setEpisodes] = React.useState<StorefrontDrop[]>([]);
  const [subscribeOpen, setSubscribeOpen] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const next = await fetchCollection(collectionId);
        if (!next) {
          if (!cancelled) setPhase('missing');
          return;
        }
        const profile = await fetchProfileById(next.creatorId);
        const cards = await Promise.all(next.drops.map((drop) => fetchDrop(drop.id)));
        if (cancelled) return;
        setCollection(next);
        setCreator(profile);
        setEpisodes(cards.filter((card): card is StorefrontDrop => Boolean(card)));
        setPhase('ready');
      } catch {
        if (!cancelled) setPhase('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [collectionId]);

  if (phase === 'loading') {
    return (
      <View style={[styles.screen, styles.centered, { backgroundColor: t.background, paddingTop: insets.top }]}>
        <ActivityIndicator color={t.textPrimary} />
      </View>
    );
  }

  if (phase !== 'ready' || !collection) {
    return (
      <View style={[styles.screen, { backgroundColor: t.background, paddingTop: insets.top + space.md }]}>
        <BackChip onPress={() => router.back()} />
        <EmptyState
          icon={VaultIcon}
          title="Collection unavailable"
          body="This series could not be opened."
        />
      </View>
    );
  }

  const renderItem = ({ item, index }: ListRenderItemInfo<StorefrontDrop>): React.JSX.Element => {
    const n = String(index + 1).padStart(2, '0');
    return (
      <View style={styles.episode}>
        <Text allowFontScaling={false} style={[styles.episodeLabel, { color: t.textMuted }]}>
          {n} — {item.caption}
        </Text>
        <VaultDropCard
          drop={item}
          onOpen={() => router.push(`/vault/drop/${item.id}`)}
          onSubscribe={() => setSubscribeOpen(true)}
        />
      </View>
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: t.background }]}>
      <FlatList
        data={episodes}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.head}>
            <BackChip onPress={() => router.back()} />
            <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
              SERIES
            </Text>
            <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
              {collection.title}
            </Text>
            {collection.description ? (
              <Text allowFontScaling={false} style={[styles.body, { color: t.textSecondary }]}>
                {collection.description}
              </Text>
            ) : null}
            {creator ? (
              <Pressable onPress={() => router.push(`/vault/${creator.id}`)}>
                <Text allowFontScaling={false} style={[styles.creator, { color: t.textMuted }]}>
                  @{creator.handle}
                </Text>
              </Pressable>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <EmptyState icon={VaultIcon} title="Empty series" body="No episodes in this Collection yet." />
        }
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + space.md,
            paddingBottom: insets.bottom + space.xxl,
          },
        ]}
      />
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
  head: { gap: space.sm, marginBottom: space.sm },
  kicker: { ...typeScale.caption, letterSpacing: 0.9 },
  title: { ...typeScale.display },
  body: { ...typeScale.body },
  creator: { ...typeScale.meta },
  episode: { gap: space.sm },
  episodeLabel: { ...typeScale.meta },
  back: {
    alignSelf: 'flex-start',
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
