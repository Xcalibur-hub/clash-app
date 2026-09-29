import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { User } from '../../store';
import { currentViewerProfileId } from '../../services/apiService';
import { fetchProfileById } from '../../services/profileService';
import { fetchFollowState, followUser, unfollowUser, type FollowState } from '../../services/socialService';
import { fetchViewerSafetyState } from '../../services/safetyService';
import {
  fetchCollections,
  fetchStorefront,
  fetchSubscriptionState,
  fetchVault,
} from '../../services/vaultService';
import type { CreatorVault, StorefrontDrop, VaultCollection, VaultSubscriptionState } from '../../services/vaultMappers';
import { errorText } from '../../services/supabaseClient';
import { color, layout, space } from '../../theme';
import { SegmentedTabs } from '../shared/SegmentedTabs';
import { EmptyState } from '../shared/EmptyState';
import { GlowButton } from '../shared/GlowButton';
import { BackIcon, VaultIcon } from '../shared/icons';
import { VaultIdentityHeader } from './VaultIdentityHeader';
import { VaultDropCard } from './VaultDropCard';
import { VaultCollectionCard } from './VaultCollectionCard';
import { SubscriptionInfoSheet } from './SubscriptionInfoSheet';

type VaultTab = 'drops' | 'collections';

const TABS: readonly { key: VaultTab; label: string }[] = [
  { key: 'drops', label: 'Drops' },
  { key: 'collections', label: 'Collections' },
];

type Phase = 'loading' | 'ready' | 'none' | 'blocked' | 'error';

export interface VaultScreenProps {
  creatorId: string;
  /** The route pushes its own back button, so skip the top safe inset. */
  hideSafeTop?: boolean;
}

/** The public Vault — a creator's content space, media first, chrome-free. */
export function VaultScreen({ creatorId, hideSafeTop = false }: VaultScreenProps): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [phase, setPhase] = React.useState<Phase>('loading');
  const [creator, setCreator] = React.useState<User | null>(null);
  const [vault, setVault] = React.useState<CreatorVault | null>(null);
  const [follow, setFollow] = React.useState<FollowState | null>(null);
  const [subscription, setSubscription] = React.useState<VaultSubscriptionState | null>(null);
  const [storefront, setStorefront] = React.useState<StorefrontDrop[]>([]);
  const [collections, setCollections] = React.useState<VaultCollection[]>([]);
  const [isSelf, setIsSelf] = React.useState(false);
  const [tab, setTab] = React.useState<VaultTab>('drops');
  const [subscribeOpen, setSubscribeOpen] = React.useState(false);

  const load = React.useCallback(async (): Promise<void> => {
    try {
      const me = await currentViewerProfileId();
      const [profile, followState, safety, nextVault] = await Promise.all([
        fetchProfileById(creatorId),
        fetchFollowState(creatorId),
        fetchViewerSafetyState(me),
        fetchVault(creatorId),
      ]);
      if (!profile) {
        setCreator(null);
        setPhase('error');
        return;
      }
      setCreator(profile);
      setIsSelf(me === creatorId);

      if (!nextVault) {
        setVault(null);
        setPhase('none');
        return;
      }

      const blocked =
        safety.blockedProfileIds.includes(creatorId) || safety.blockingProfileIds.includes(creatorId);
      if (blocked) {
        setVault(nextVault);
        setPhase('blocked');
        return;
      }

      const [drops, cols, subs] = await Promise.all([
        fetchStorefront(nextVault.id),
        fetchCollections(nextVault.id),
        fetchSubscriptionState(nextVault.id),
      ]);
      setVault(nextVault);
      setFollow(followState);
      setSubscription(subs);
      setStorefront(drops);
      setCollections(cols);
      setPhase('ready');
    } catch (error) {
      void errorText(error);
      setPhase('error');
    }
  }, [creatorId]);

  React.useEffect(() => {
    setPhase('loading');
    void load();
  }, [load]);

  const toggleFollow = async (): Promise<void> => {
    if (!follow) return;
    if (follow.following) await unfollowUser(creatorId);
    else await followUser(creatorId);
    setFollow({ ...follow, following: !follow.following });
  };

  if (phase === 'loading') return <Spinner padTop={hideSafeTop ? 0 : insets.top} />;

  if (phase !== 'ready' || !creator || !vault) {
    const isNone = phase === 'none';
    const isBlocked = phase === 'blocked';
    return (
      <View style={[styles.screen, { paddingTop: hideSafeTop ? 0 : insets.top }]}>
        <BackButton onPress={() => router.back()} />
        <EmptyState
          icon={VaultIcon}
          title={isBlocked ? 'Vault unavailable' : isNone && isSelf ? 'You have no Vault yet' : isNone ? 'No Vault yet' : 'Vault unavailable'}
          body={
            isBlocked
              ? "You can't see this Vault right now."
              : isNone && isSelf
                ? 'Open your Vault to start dropping subscriber content.'
                : isNone
                  ? 'This creator has not opened a Vault.'
                  : 'This Vault could not be loaded.'
          }
          actionLabel={isNone && isSelf ? 'Start your Vault' : undefined}
          onAction={isNone && isSelf ? () => router.replace('/(vault)') : undefined}
        />
      </View>
    );
  }

  const collectedBy = (collectionId: string): StorefrontDrop[] =>
    storefront.filter((drop) => drop.collectionIds.includes(collectionId));

  return (
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingTop: (hideSafeTop ? 0 : insets.top) + space.md }]}
      >
        <BackButton onPress={() => router.back()} />

        <VaultIdentityHeader
          creator={creator}
          vault={vault}
          following={follow?.following ?? false}
          followerCount={follow?.followerCount ?? 0}
          isSelf={isSelf}
          subscription={subscription}
          onToggleFollow={() => void toggleFollow()}
          onManage={() => router.replace('/(vault)')}
        />

        <SegmentedTabs value={tab} items={TABS} onChange={setTab} label="Vault content" />

        {tab === 'drops' ? (
          storefront.length === 0 ? (
            <EmptyState icon={VaultIcon} title="No Drops yet" body="New Drops appear here when this creator publishes." />
          ) : (
            <View style={styles.list}>
              {storefront.map((drop) => (
                <VaultDropCard
                  key={drop.id}
                  drop={drop}
                  onOpen={() => router.push(`/vault/drop/${drop.id}`)}
                  onSubscribe={() => setSubscribeOpen(true)}
                />
              ))}
            </View>
          )
        ) : collections.length === 0 ? (
          <EmptyState icon={VaultIcon} title="No Collections yet" body="Permanent Collections appear here." />
        ) : (
          <View style={styles.list}>
            {collections.map((collection) => (
              <VaultCollectionCard
                key={collection.id}
                title={collection.title}
                description={collection.description}
                drops={collectedBy(collection.id)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <SubscriptionInfoSheet visible={subscribeOpen} creatorName={creator.name} onClose={() => setSubscribeOpen(false)} />
    </View>
  );
}

function BackButton({ onPress }: { onPress: () => void }): React.JSX.Element {
  return <GlowButton label="Back" icon={BackIcon} tone="ink" compact onPress={onPress} style={styles.back} />;
}

function Spinner({ padTop }: { padTop: number }): React.JSX.Element {
  return (
    <View style={[styles.screen, styles.centered, { paddingTop: padTop }]}>
      <ActivityIndicator color="#FFFFFF" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  centered: { justifyContent: 'center' },
  content: { paddingHorizontal: layout.screenX, gap: space.lg, paddingBottom: space.xxl },
  list: { gap: space.md },
  back: { alignSelf: 'flex-start' },
});

