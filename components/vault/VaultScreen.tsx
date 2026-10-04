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
import type { User } from '../../store';
import { currentViewerProfileId } from '../../services/apiService';
import { fetchProfileById } from '../../services/profileService';
import { fetchFollowState, followUser, unfollowUser, type FollowState } from '../../services/socialService';
import { fetchViewerSafetyState } from '../../services/safetyService';
import { getPublicMediaUrl } from '../../services/mediaService';
import {
  fetchCollections,
  fetchStorefront,
  fetchSubscriptionState,
  fetchVault,
} from '../../services/vaultService';
import {
  fetchCreatorCourses,
  fetchCreatorProducts,
  fetchCreatorServices,
  vaultCoverUrl,
} from '../../services/vaultCommerceService';
import { fetchCreatorCommunity } from '../../services/vaultCommunityService';
import type { CommunitySummary } from '../../services/vaultCommunityMappers';
import type { CreatorVault, StorefrontDrop, VaultCollection, VaultSubscriptionState } from '../../services/vaultMappers';
import type { CreatorCourse, CreatorProduct, CreatorService } from '../../services/vaultCommerceMappers';
import { errorText } from '../../services/supabaseClient';
import { analytics } from '../../services/analytics';
import { resolveCreatorWorldModules, type CreatorModuleType } from '../../utils/vaultModules';
import { vaultExperienceHref } from '../../utils/vaultExperiences';
import { vaultPublicVisualMedia } from '../../utils/vaultAccess';
import { creatorWorldChapterTitle, vaultTintWash } from '../../utils/vaultPresentation';
import { layout, radius, space, useThemeColors } from '../../theme';
import { ExploreHeading } from '../explore/ExploreHeading';
import { EmptyState } from '../shared/EmptyState';
import { BackIcon, VaultIcon } from '../shared/icons';
import { VaultIdentityHeader } from './VaultIdentityHeader';
import { VaultDropCard } from './VaultDropCard';
import { VaultCollectionCard } from './VaultCollectionCard';
import { CourseMasterclassCard } from './CourseMasterclassCard';
import { ServiceSessionCard } from './ServiceSessionCard';
import { ProductArtifactCard } from './ProductArtifactCard';
import { CommunityChapterCard } from './community/CommunityChapterCard';
import { SubscriptionInfoSheet } from './SubscriptionInfoSheet';
import { tap as hapticTap } from '../../utils/haptics';

type Phase = 'loading' | 'ready' | 'none' | 'blocked' | 'error';

type WorldRow =
  | { kind: 'hero' }
  | { kind: 'section'; title: string; module: CreatorModuleType }
  | { kind: 'drop'; drop: StorefrontDrop; cinematic?: boolean }
  | { kind: 'collection'; collection: VaultCollection; drops: StorefrontDrop[] }
  | { kind: 'service'; service: CreatorService }
  | { kind: 'course'; course: CreatorCourse }
  | { kind: 'product'; product: CreatorProduct }
  | { kind: 'community' }
  | { kind: 'empty' };

export interface VaultScreenProps {
  creatorId: string;
  /** The route pushes its own back button, so skip the top safe inset. */
  hideSafeTop?: boolean;
}

/** Creator World — chapters of a personal universe, not a profile dashboard. */
export function VaultScreen({ creatorId, hideSafeTop = false }: VaultScreenProps): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useThemeColors();

  const [phase, setPhase] = React.useState<Phase>('loading');
  const [creator, setCreator] = React.useState<User | null>(null);
  const [vault, setVault] = React.useState<CreatorVault | null>(null);
  const [follow, setFollow] = React.useState<FollowState | null>(null);
  const [subscription, setSubscription] = React.useState<VaultSubscriptionState | null>(null);
  const [storefront, setStorefront] = React.useState<StorefrontDrop[]>([]);
  const [collections, setCollections] = React.useState<VaultCollection[]>([]);
  const [services, setServices] = React.useState<CreatorService[]>([]);
  const [courses, setCourses] = React.useState<CreatorCourse[]>([]);
  const [products, setProducts] = React.useState<CreatorProduct[]>([]);
  const [community, setCommunity] = React.useState<CommunitySummary | null>(null);
  const [isSelf, setIsSelf] = React.useState(false);
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

      const [drops, cols, subs, nextServices, nextCourses, nextProducts, nextCommunity] = await Promise.all([
        fetchStorefront(nextVault.id),
        fetchCollections(nextVault.id),
        fetchSubscriptionState(nextVault.id),
        fetchCreatorServices(creatorId),
        fetchCreatorCourses(creatorId),
        fetchCreatorProducts(creatorId),
        fetchCreatorCommunity(creatorId),
      ]);
      setVault(nextVault);
      setFollow(followState);
      setSubscription(subs);
      setStorefront(drops);
      setCollections(cols);
      setServices(nextServices);
      setCourses(nextCourses);
      setProducts(nextProducts);
      setCommunity(nextCommunity);
      setPhase('ready');
      analytics.trackOnce(`vault_opened:${creatorId}`, 'vault_opened', {
        realm: 'vault',
        is_creator: me === creatorId,
        is_guest: me === null,
      });
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

  const liveDrops = React.useMemo(
    () =>
      storefront.filter(
        (drop) => drop.status === 'published' || (drop.status === 'expired' && drop.collectionIds.length > 0),
      ),
    [storefront],
  );

  const modules = React.useMemo(
    () =>
      resolveCreatorWorldModules({
        contentCount: liveDrops.length,
        collectionCount: collections.length,
        serviceCount: services.length,
        courseCount: courses.length,
        storeCount: products.length,
        communityReady: community !== null,
      }),
    [liveDrops.length, collections.length, services.length, courses.length, products.length, community],
  );

  const heroUrl = React.useMemo(() => {
    for (const drop of liveDrops) {
      const visual = vaultPublicVisualMedia({
        accessLevel: drop.accessLevel,
        accessible: drop.accessible,
        publicMedia: drop.publicMedia,
        previewMedia: drop.previewMedia,
      });
      if (visual) return getPublicMediaUrl(visual.bucket, visual.path);
    }
    return null;
  }, [liveDrops]);

  const atmosphere = creator ? vaultTintWash(creator.tint, t.scheme === 'dark' ? 0.08 : 0.04) : 'transparent';

  const rows = React.useMemo((): WorldRow[] => {
    if (phase !== 'ready' || !creator || !vault) return [];
    const next: WorldRow[] = [{ kind: 'hero' }];
    if (modules.length === 0) {
      next.push({ kind: 'empty' });
      return next;
    }
    for (const mod of modules) {
      if (mod.type === 'CONTENT') {
        next.push({
          kind: 'section',
          title: creatorWorldChapterTitle('CONTENT', creator.name),
          module: 'CONTENT',
        });
        liveDrops.slice(0, 12).forEach((drop, index) => {
          next.push({ kind: 'drop', drop, cinematic: index === 0 });
        });
      }
      if (mod.type === 'COLLECTIONS') {
        next.push({
          kind: 'section',
          title: creatorWorldChapterTitle('COLLECTIONS', creator.name),
          module: 'COLLECTIONS',
        });
        for (const collection of collections) {
          next.push({
            kind: 'collection',
            collection,
            drops: storefront.filter((drop) => drop.collectionIds.includes(collection.id)),
          });
        }
      }
      if (mod.type === 'SERVICES') {
        next.push({
          kind: 'section',
          title: creatorWorldChapterTitle('SERVICES', creator.name),
          module: 'SERVICES',
        });
        for (const service of services) next.push({ kind: 'service', service });
      }
      if (mod.type === 'COURSES') {
        next.push({
          kind: 'section',
          title: creatorWorldChapterTitle('COURSES', creator.name),
          module: 'COURSES',
        });
        for (const course of courses) next.push({ kind: 'course', course });
      }
      if (mod.type === 'STORE') {
        next.push({
          kind: 'section',
          title: creatorWorldChapterTitle('STORE', creator.name),
          module: 'STORE',
        });
        for (const product of products) next.push({ kind: 'product', product });
      }
      if (mod.type === 'COMMUNITY' && community) {
        next.push({
          kind: 'section',
          title: creatorWorldChapterTitle('COMMUNITY', creator.name),
          module: 'COMMUNITY',
        });
        next.push({ kind: 'community' });
      }
    }
    return next;
  }, [phase, creator, vault, modules, liveDrops, collections, storefront, services, courses, products, community]);

  if (phase === 'loading') {
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

  if (phase !== 'ready' || !creator || !vault) {
    const isNone = phase === 'none';
    const isBlocked = phase === 'blocked';
    return (
      <View style={[styles.screen, { backgroundColor: t.background, paddingTop: hideSafeTop ? 0 : insets.top }]}>
        <BackChip onPress={() => router.back()} />
        <EmptyState
          icon={VaultIcon}
          title={
            isBlocked
              ? 'Vault unavailable'
              : isNone && isSelf
                ? 'Your Vault is ready'
                : isNone
                  ? 'Nothing inside yet'
                  : 'Vault unavailable'
          }
          body={
            isBlocked
              ? "You can't see this Vault right now."
              : isNone && isSelf
                ? "Share something your followers won't find in Arena."
                : isNone
                  ? `@${creator?.handle ?? 'creator'} hasn't opened this Vault yet.`
                  : 'This Vault could not be loaded.'
          }
          actionLabel={isNone && isSelf ? 'Create first Drop' : undefined}
          onAction={isNone && isSelf ? () => router.replace('/vault/studio') : undefined}
        />
      </View>
    );
  }

  const subscribeBenefits = [
    'Subscriber Drops',
    ...(collections.length > 0 ? ['Complete Collections'] : []),
    ...(courses.some((c) => c.accessType === 'subscriber') ? ['Subscriber courses'] : []),
    ...(services.some((s) => s.accessType === 'subscriber') ? ['Subscriber services'] : []),
  ];

  const renderItem = ({ item }: ListRenderItemInfo<WorldRow>): React.JSX.Element | null => {
    switch (item.kind) {
      case 'hero':
        return (
          <View style={styles.heroBlock}>
            <View style={[styles.backFloat, { top: hideSafeTop ? space.sm : 0 }]}>
              <BackChip onPress={() => router.back()} overMedia />
            </View>
            <VaultIdentityHeader
              creator={creator}
              vault={vault}
              following={follow?.following ?? false}
              followerCount={follow?.followerCount ?? 0}
              isSelf={isSelf}
              subscription={subscription}
              heroUrl={heroUrl}
              onToggleFollow={() => void toggleFollow()}
              onSubscribe={() => setSubscribeOpen(true)}
              onManage={() => router.push('/vault/studio')}
            />
          </View>
        );
      case 'section':
        return (
          <ExploreHeading
            title={item.title}
            style={[styles.section, item.module === 'CONTENT' || item.module === 'COLLECTIONS' ? styles.firstChapter : null]}
          />
        );
      case 'drop':
        return (
          <View style={item.cinematic ? styles.peekCard : undefined}>
            <VaultDropCard
              drop={item.drop}
              cinematic={item.cinematic === true}
              creatorHandle={creator.handle}
              onOpen={() => router.push(`/vault/drop/${item.drop.id}`)}
              onSubscribe={() => setSubscribeOpen(true)}
            />
          </View>
        );
      case 'collection':
        return (
          <VaultCollectionCard
            title={item.collection.title}
            description={item.collection.description}
            drops={item.drops}
            onOpen={() => router.push(`/vault/collection/${item.collection.id}`)}
          />
        );
      case 'service': {
        const href = vaultExperienceHref({ type: 'SERVICE', id: item.service.id });
        return (
          <ServiceSessionCard
            title={item.service.title}
            subtitle={item.service.description}
            coverUrl={vaultCoverUrl(item.service.coverMedia)}
            accessType={item.service.accessType}
            priceAmountMinor={item.service.priceAmountMinor}
            currency={item.service.currency}
            creatorName={creator.name}
            onOpen={() => href && router.push(href as never)}
          />
        );
      }
      case 'course': {
        const href = vaultExperienceHref({ type: 'COURSE', id: item.course.id });
        return (
          <CourseMasterclassCard
            title={item.course.title}
            lessonCount={item.course.lessonCount}
            coverUrl={vaultCoverUrl(item.course.coverMedia)}
            accessType={item.course.accessType}
            priceAmountMinor={item.course.priceAmountMinor}
            currency={item.course.currency}
            creatorName={creator.name}
            onOpen={() => href && router.push(href as never)}
          />
        );
      }
      case 'product': {
        const href = vaultExperienceHref({ type: 'PRODUCT', id: item.product.id });
        return (
          <ProductArtifactCard
            title={item.product.title}
            coverUrl={vaultCoverUrl(item.product.coverMedia)}
            accessType={item.product.accessType}
            priceAmountMinor={item.product.priceAmountMinor}
            currency={item.product.currency}
            externalUrl={item.product.externalUrl}
            creatorName={creator.name}
            onOpen={() => href && router.push(href as never)}
          />
        );
      }
      case 'community': {
        if (!community) return null;
        return (
          <CommunityChapterCard
            summary={community}
            creatorName={creator.name}
            tint={creator.tint}
            onEnter={() => router.push(`/vault/community/${community.id}`)}
          />
        );
      }
      case 'empty':
        return (
          <EmptyState
            icon={VaultIcon}
            title={isSelf ? 'Your Vault is ready' : 'Nothing inside yet'}
            body={
              isSelf
                ? "Share something your followers won't find in Arena."
                : `@${creator.handle} hasn't posted a Drop yet.`
            }
            actionLabel={isSelf ? 'Create first Drop' : undefined}
            onAction={isSelf ? () => router.push('/vault/compose') : undefined}
          />
        );
      default:
        return null;
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: t.background }]}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: atmosphere }]} pointerEvents="none" />
      <FlatList
        data={rows}
        keyExtractor={(row, index) => {
          if (row.kind === 'drop') return `drop:${row.drop.id}`;
          if (row.kind === 'collection') return `col:${row.collection.id}`;
          if (row.kind === 'service') return `svc:${row.service.id}`;
          if (row.kind === 'course') return `crs:${row.course.id}`;
          if (row.kind === 'product') return `prd:${row.product.id}`;
          if (row.kind === 'section') return `section:${row.module}:${row.title}`;
          return `${row.kind}:${index}`;
        }}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: hideSafeTop ? 0 : insets.top,
            paddingBottom: insets.bottom + space.xxl,
          },
        ]}
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

function BackChip({
  onPress,
  overMedia = false,
}: {
  onPress: () => void;
  overMedia?: boolean;
}): React.JSX.Element {
  const t = useThemeColors();
  return (
    <Pressable
      onPress={() => {
        hapticTap();
        onPress();
      }}
      style={[
        styles.back,
        {
          backgroundColor: overMedia ? 'rgba(9,9,11,0.45)' : t.surface,
          borderColor: overMedia ? 'transparent' : t.border,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel="Back"
    >
      <BackIcon size={18} color={overMedia ? '#FAFAF8' : t.textPrimary} strokeWidth={2.2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { justifyContent: 'center', alignItems: 'center', gap: space.md },
  content: { paddingHorizontal: layout.screenX, gap: space.sm },
  heroBlock: { gap: 0, marginBottom: -space.lg },
  backFloat: {
    position: 'absolute',
    left: 0,
    zIndex: 4,
  },
  section: {
    marginTop: space.xs,
  },
  firstChapter: {
    marginTop: space.sm,
  },
  peekCard: {
    marginTop: -space.xs,
  },
  back: {
    alignSelf: 'flex-start',
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    zIndex: 2,
  },
  loadBlock: { width: '100%', height: 280, borderRadius: radius.xxl },
  loadLine: { width: '40%', height: 12, borderRadius: radius.sm },
});
