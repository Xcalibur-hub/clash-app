import React from 'react';
import {
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
import type { StorefrontDrop } from '../../services/vaultMappers';
import { useAuth } from '../../store/AuthProvider';
import { useRetryableRead } from '../../hooks/useRetryableRead';
import { ReadFeedback } from '../shared/ReadFeedback';
import { layout, space, typeScale, useThemeColors } from '../../theme';
import { EmptyState } from '../shared/EmptyState';
import { VaultIcon } from '../shared/icons';
import { VaultDropCard } from './VaultDropCard';
import { SubscriptionInfoSheet } from './SubscriptionInfoSheet';
import { VaultBackButton } from './VaultBackButton';

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

  const { user } = useAuth();
  const [subscribeOpen, setSubscribeOpen] = React.useState(false);
  const load = React.useCallback(async () => {
    const collection = await fetchCollection(collectionId);
    if (!collection) return null;
    const creator = await fetchProfileById(collection.creatorId);
    const cards = await Promise.all(collection.drops.map(drop => fetchDrop(drop.id)));
    return { collection, creator, episodes: cards.filter((card): card is StorefrontDrop => Boolean(card)) };
  }, [collectionId]);
  const read = useRetryableRead(load, `${user?.id ?? 'guest'}:${collectionId}`);
  if (read.status !== 'ready' || !read.data) {
    return (
      <View style={[styles.screen, { backgroundColor: t.background, paddingTop: insets.top + space.md }]}>
        <VaultBackButton onPress={() => router.back()} />
        <ReadFeedback status={read.status} subject="Collection" retry={read.retry} />
      </View>
    );
  }
  const { collection, creator, episodes } = read.data;

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
            <VaultBackButton onPress={() => router.back()} />
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
});
