import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { getPublicMediaUrl } from '../../services/mediaService';
import { vaultCoverUrl } from '../../services/vaultCommerceService';
import { vaultOfferPriceLabel, type VaultOfferAccess } from '../../utils/vaultMoney';
import { creatorWorldChapterTitle, vaultAccessMeta, vaultTintWash } from '../../utils/vaultPresentation';
import { vaultDropDisplayAccess, vaultPublicVisualMedia } from '../../utils/vaultAccess';
import { buildWorldRows } from '../../utils/vaultWorldRows';
import { worldPersonality } from '../../utils/vaultWorldPersonality';
import { layout, space, useThemeColors } from '../../theme';
import { EmptyState } from '../shared/EmptyState';
import { BackIcon, VaultIcon } from '../shared/icons';
import { SubscriptionInfoSheet } from './SubscriptionInfoSheet';
import { WorldChapter } from './world/WorldChapter';
import { WorldHero } from './world/WorldHero';
import { useCreatorWorld } from './world/useCreatorWorld';

export interface VaultScreenProps {
  creatorId: string;
  hideSafeTop?: boolean;
}

/** Creator World — a place you enter, composed chapter by chapter. */
export function VaultScreen({ creatorId, hideSafeTop = false }: VaultScreenProps): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useThemeColors();
  const world = useCreatorWorld(creatorId);
  const [subscribeOpen, setSubscribeOpen] = React.useState(false);
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  const personality = React.useMemo(
    () =>
      worldPersonality({
        creatorId,
        handle: world.creator?.handle,
        name: world.creator?.name,
      }),
    [creatorId, world.creator?.handle, world.creator?.name],
  );

  const rows = React.useMemo(() => {
    if (world.phase !== 'ready') return [];
    return buildWorldRows(
      {
        modules: world.modules,
        drops: world.liveDrops,
        collections: world.collections,
        services: world.services,
        courses: world.courses,
        products: world.products,
        communityReady: world.community !== null,
        personality,
      },
      {
        creatorName: world.creator?.name ?? 'creator',
        chapterTitle: (module, name) => creatorWorldChapterTitle(module, name),
        dropMedia: (drop) => {
          const visual = vaultPublicVisualMedia({
            accessLevel: drop.accessLevel,
            accessible: drop.accessible,
            publicMedia: drop.publicMedia,
            previewMedia: drop.previewMedia,
          });
          return visual ? getPublicMediaUrl(visual.bucket, visual.path) : null;
        },
        dropAccess: (drop) =>
          vaultAccessMeta(
            vaultDropDisplayAccess({
              accessLevel: drop.accessLevel,
              accessible: drop.accessible,
              hasPreviewMedia: Boolean(drop.previewMedia),
            }),
          ),
        collectionDrops: (collection, all) =>
          all.filter((drop) => drop.collectionIds.includes(collection.id)),
        serviceMedia: (service) => vaultCoverUrl(service.coverMedia),
        courseMedia: (course) => vaultCoverUrl(course.coverMedia),
        productMedia: (product) => vaultCoverUrl(product.coverMedia),
        priceLabel: (input) =>
          vaultOfferPriceLabel({
            accessType: input.accessType as VaultOfferAccess,
            priceAmountMinor: input.priceAmountMinor,
            currency: input.currency,
            externalUrl: input.externalUrl,
          }),
      },
    );
  }, [world, personality]);

  const subscribeBenefits = React.useMemo(() => {
    if (world.phase !== 'ready') return [];
    return [
      'Subscriber Drops',
      ...(world.collections.length > 0 ? ['Complete Collections'] : []),
      ...(world.courses.some((c) => c.accessType === 'subscriber') ? ['Subscriber courses'] : []),
      ...(world.services.some((s) => s.accessType === 'subscriber') ? ['Subscriber services'] : []),
    ];
  }, [world]);

  const atmosphere = world.creator
    ? vaultTintWash(world.creator.tint, t.scheme === 'dark' ? 0.1 : 0.05)
    : 'transparent';

  if (world.phase === 'loading') {
    return (
      <View
        style={[
          styles.screen,
          styles.centered,
          { backgroundColor: t.background, paddingTop: hideSafeTop ? 0 : insets.top },
        ]}
      >
        <View style={[styles.loadBlock, { backgroundColor: t.surfaceMuted }]} />
        <View style={[styles.loadLine, { backgroundColor: t.surfaceMuted }]} />
      </View>
    );
  }

  if (world.phase !== 'ready' || !world.creator) {
    const isNone = world.phase === 'none';
    const isBlocked = world.phase === 'blocked';
    const mine = world.isSelf;
    return (
      <View style={[styles.screen, { backgroundColor: t.background, paddingTop: hideSafeTop ? 0 : insets.top }]}>
        <BackChip onPress={() => router.back()} />
        <EmptyState
          icon={VaultIcon}
          title={isBlocked ? 'Vault unavailable' : isNone && mine ? 'Your Vault is ready' : isNone ? 'Nothing inside yet' : 'Vault unavailable'}
          body={
            isBlocked
              ? 'You can not see this Vault right now.'
              : isNone && mine
                ? 'Share something your followers will not find in Arena.'
                : isNone
                  ? 'This creator has not opened their Vault yet.'
                  : 'This Vault could not be loaded.'
          }
          actionLabel={isNone && mine ? 'Create first Drop' : undefined}
          onAction={isNone && mine ? () => router.replace('/vault/studio') : undefined}
        />
      </View>
    );
  }

  const creator = world.creator;
  const vault = world.vault;

  return (
    <View style={[styles.screen, { backgroundColor: t.background }]}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: atmosphere }]} pointerEvents="none" />
      <Animated.FlatList
        data={rows}
        keyExtractor={(row, index) => {
          if (row.kind === 'chapter') return `chapter:${row.module}`;
          if (row.kind === 'drops') return 'drops';
          if (row.kind === 'collections') return `collections:${row.collections.map((c) => c.id).join(',')}`;
          return `${row.kind}:${index}`;
        }}
        renderItem={({ item }) => (
          <WorldChapter
            row={item}
            personality={personality}
            creatorName={creator.name}
            creatorTint={creator.tint}
            community={world.community}
            isSelf={world.isSelf}
            onOpenDrop={(id) => router.push(`/vault/drop/${id}`)}
            onOpenCollection={(id) => router.push(`/vault/collection/${id}`)}
            onOpenService={(id) => router.push(`/vault/service/${id}`)}
            onOpenCourse={(id) => router.push(`/vault/course/${id}`)}
            onOpenProduct={(id) => router.push(`/vault/product/${id}`)}
            onOpenCommunity={() => {
              if (world.community) router.push(`/vault/community/${world.community.id}`);
            }}
            onCreate={() => router.push('/vault/compose')}
          />
        )}
        ListHeaderComponent={
          <WorldHero
            creatorName={creator.name}
            identity={creator.bio ?? vault?.description ?? 'Creator'}
            accent={creator.tint}
            heroUrl={world.heroUrl}
            posterUrl={world.posterUrl}
            posterLabel={world.posterLabel}
            onPosterPress={() => {
              const first = world.liveDrops[0];
              if (first) router.push(`/vault/drop/${first.id}`);
            }}
            secondary={vault?.title ?? null}
            description={creator.bio ?? null}
            following={world.follow?.following ?? false}
            isSelf={world.isSelf}
            subscribed={world.subscription?.active === true}
            onToggleFollow={world.toggleFollow}
            onSubscribe={() => setSubscribeOpen(true)}
            onManage={() => router.push('/vault/studio')}
            onBack={() => router.back()}
            topInset={hideSafeTop ? space.sm : insets.top}
            scrollY={scrollY}
          />
        }
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xxxl }]}
      />

      <SubscriptionInfoSheet
        visible={subscribeOpen}
        creatorName={creator.name}
        benefits={subscribeBenefits}
        onClose={() => setSubscribeOpen(false)}
      />
    </View>
  );
}

function BackChip({ onPress }: { onPress: () => void }): React.JSX.Element {
  const t = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
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
  centered: { justifyContent: 'center', alignItems: 'center', gap: space.md },
  content: { paddingHorizontal: layout.screenX, gap: space.lg },
  back: {
    alignSelf: 'flex-start',
    margin: layout.screenX,
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  loadBlock: { width: '100%', height: 300, borderRadius: 12 },
  loadLine: { width: '40%', height: 12, borderRadius: 8 },
});