import React from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import {
  fetchVaultHome,
  type VaultCreatorWorldCard,
  type VaultHomeDropCard,
  type VaultHomeModel,
  type VaultHomeOfferCard,
  type VaultHomeScope,
} from '../../services/vaultHomeService';
import { fetchMyVault } from '../../services/vaultService';
import { errorText } from '../../services/supabaseClient';
import { analytics } from '../../services/analytics';
import { vaultExperienceHref } from '../../utils/vaultExperiences';
import { worldStackLayout } from '../../utils/vaultPresentation';
import { duration, layout, space, typeScale, useThemeColors } from '../../theme';
import { dockBottomPadding } from '../navigation/dockConfig';
import { EmptyState } from '../shared/EmptyState';
import { VaultIcon } from '../shared/icons';
import { FeaturedWorld } from './FeaturedWorld';
import { EditorialWorldTile } from './EditorialWorldTile';
import { WorldRail } from './WorldRail';
import { VaultScopeControl } from './VaultScopeControl';
import { TodaysDropCard } from './TodaysDropCard';
import { CourseMasterclassCard } from './CourseMasterclassCard';
import { ServiceSessionCard } from './ServiceSessionCard';
import { ProductArtifactCard } from './ProductArtifactCard';
import { VaultActionButton } from './VaultActionButton';
import { tap as hapticTap } from '../../utils/haptics';

type Phase = 'loading' | 'ready' | 'error';

type HomeRow =
  | { kind: 'masthead' }
  | { kind: 'scope' }
  | { kind: 'chapter'; title: string }
  | { kind: 'featured'; creator: VaultCreatorWorldCard }
  | { kind: 'world'; creator: VaultCreatorWorldCard; layout: 'wide' | 'portrait' }
  | { kind: 'rail'; items: VaultCreatorWorldCard[] }
  | { kind: 'today'; drop: VaultHomeDropCard; large?: boolean }
  | { kind: 'course'; offer: VaultHomeOfferCard }
  | { kind: 'service'; offer: VaultHomeOfferCard }
  | { kind: 'product'; offer: VaultHomeOfferCard }
  | { kind: 'empty_following' }
  | { kind: 'empty_discover' };

function buildRows(model: VaultHomeModel, scope: VaultHomeScope): HomeRow[] {
  const rows: HomeRow[] = [{ kind: 'masthead' }, { kind: 'scope' }];

  if (model.isEmpty) {
    rows.push(scope === 'following' ? { kind: 'empty_following' } : { kind: 'empty_discover' });
    return rows;
  }

  if (scope === 'following') {
    if (model.yourCreators.length > 0) {
      rows.push({ kind: 'chapter', title: 'FROM YOUR WORLDS' });
      rows.push({ kind: 'rail', items: model.yourCreators });
    }
    if (model.todaysDrops.length > 0) {
      rows.push({ kind: 'chapter', title: 'TODAY' });
      model.todaysDrops.slice(0, 8).forEach((drop, index) => {
        rows.push({ kind: 'today', drop, large: index === 0 });
      });
    }
    if (model.continueItems.length > 0) {
      rows.push({ kind: 'chapter', title: 'CONTINUE' });
      for (const drop of model.continueItems.slice(0, 4)) {
        rows.push({ kind: 'today', drop, large: false });
      }
    }
    return rows;
  }

  // Discover — featured world + editorial stack + selective rails
  if (model.discoverWorlds.length > 0) {
    const [featured, ...rest] = model.discoverWorlds;
    if (featured) rows.push({ kind: 'featured', creator: featured });
    rest.forEach((creator, index) => {
      const layout = worldStackLayout(index + 1);
      if (layout === 'featured') return;
      rows.push({ kind: 'world', creator, layout });
    });
  }

  if (model.todaysDrops.length > 0) {
    rows.push({ kind: 'chapter', title: 'NEW DROPS' });
    for (const drop of model.todaysDrops.slice(0, 6)) {
      rows.push({ kind: 'today', drop, large: true });
    }
  }

  if (model.discoverCourses.length > 0) {
    rows.push({ kind: 'chapter', title: 'LEARN SOMETHING' });
    for (const offer of model.discoverCourses.slice(0, 4)) {
      rows.push({ kind: 'course', offer });
    }
  }

  if (model.discoverServices.length > 0) {
    rows.push({ kind: 'chapter', title: 'WORK WITH CREATORS' });
    for (const offer of model.discoverServices.slice(0, 4)) {
      rows.push({ kind: 'service', offer });
    }
  }

  if (model.discoverProducts.length > 0) {
    rows.push({ kind: 'chapter', title: 'CREATOR ARTIFACTS' });
    for (const offer of model.discoverProducts.slice(0, 4)) {
      rows.push({ kind: 'product', offer });
    }
  }

  return rows;
}

function VaultHomeSkeleton({ tint }: { tint: string }): React.JSX.Element {
  return (
    <View style={styles.skeletonWrap} accessibilityLabel="Loading Vault">
      <View style={[styles.skeletonHero, { backgroundColor: tint }]} />
      <View style={[styles.skeletonLine, { backgroundColor: tint, width: '55%' }]} />
      <View style={[styles.skeletonWide, { backgroundColor: tint }]} />
    </View>
  );
}

/** Vault realm home — worlds worth entering, not a marketplace feed. */
export function VaultHome(): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useThemeColors();
  const reduced = useReducedMotion();

  const [phase, setPhase] = React.useState<Phase>('loading');
  const [scope, setScope] = React.useState<VaultHomeScope>('discover');
  const [model, setModel] = React.useState<VaultHomeModel | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);

  const modelRef = React.useRef<VaultHomeModel | null>(null);
  modelRef.current = model;

  const load = React.useCallback(
    async (nextScope: VaultHomeScope, opts?: { soft?: boolean }): Promise<void> => {
      try {
        const next = await fetchVaultHome(nextScope);
        setModel(next);
        setPhase('ready');
        analytics.trackOnce(`vault_home:${nextScope}`, 'vault_opened', {
          realm: 'vault',
          is_creator: next.canCreate,
          is_guest: !next.canCreate,
        });
      } catch (error) {
        void errorText(error);
        if (!opts?.soft || !modelRef.current) setPhase('error');
      }
    },
    [],
  );

  useFocusEffect(
    React.useCallback(() => {
      if (!modelRef.current) setPhase('loading');
      void load(scope, { soft: Boolean(modelRef.current) });
    }, [load, scope]),
  );

  const onRefresh = async (): Promise<void> => {
    setRefreshing(true);
    await load(scope, { soft: true });
    setRefreshing(false);
  };

  const onCreate = async (): Promise<void> => {
    hapticTap();
    try {
      const mine = await fetchMyVault();
      if (mine) router.push('/vault/compose');
      else router.push('/vault/studio');
    } catch {
      router.push('/vault/studio');
    }
  };

  const openOffer = (offer: VaultHomeOfferCard): void => {
    const type =
      offer.kind === 'service' ? 'SERVICE' : offer.kind === 'course' ? 'COURSE' : 'PRODUCT';
    const href = vaultExperienceHref({ type, id: offer.id });
    if (href) router.push(href as never);
  };

  const rows = model ? buildRows(model, scope) : [];

  const renderItem = ({ item }: ListRenderItemInfo<HomeRow>): React.JSX.Element | null => {
    switch (item.kind) {
      case 'masthead':
        return (
          <Animated.View
            entering={reduced ? undefined : FadeIn.duration(duration.base)}
            style={styles.masthead}
          >
            <View style={styles.mastheadRow}>
              <Text allowFontScaling={false} style={[styles.brand, { color: t.textPrimary }]}>
                Vault
              </Text>
              {model?.canCreate ? (
                <Pressable onPress={() => void onCreate()} hitSlop={12} accessibilityLabel="Create Drop">
                  <Text allowFontScaling={false} style={[styles.createLink, { color: t.textMuted }]}>
                    Create
                  </Text>
                </Pressable>
              ) : null}
            </View>
            <Text allowFontScaling={false} style={[styles.tagline, { color: t.textSecondary }]}>
              Worlds worth entering.
            </Text>
          </Animated.View>
        );
      case 'scope':
        return <VaultScopeControl value={scope} onChange={setScope} />;
      case 'chapter':
        return (
          <Text allowFontScaling={false} style={[styles.chapter, { color: t.textMuted }]}>
            {item.title}
          </Text>
        );
      case 'featured':
        return (
          <FeaturedWorld
            creator={item.creator}
            onEnter={() => router.push(`/vault/${item.creator.creatorId}`)}
          />
        );
      case 'world':
        return (
          <EditorialWorldTile
            creator={item.creator}
            layout={item.layout}
            onEnter={() => router.push(`/vault/${item.creator.creatorId}`)}
          />
        );
      case 'rail':
        return (
          <WorldRail
            creators={item.items}
            onEnter={(creatorId) => router.push(`/vault/${creatorId}`)}
          />
        );
      case 'today':
        return (
          <TodaysDropCard
            drop={item.drop}
            large={item.large !== false}
            onOpen={() => router.push(`/vault/drop/${item.drop.dropId}`)}
          />
        );
      case 'course':
        return (
          <CourseMasterclassCard
            title={item.offer.title}
            coverUrl={item.offer.coverUrl}
            accessType={item.offer.accessType}
            priceAmountMinor={item.offer.priceAmountMinor}
            currency={item.offer.currency}
            creatorName={item.offer.authorName}
            onOpen={() => openOffer(item.offer)}
          />
        );
      case 'service':
        return (
          <ServiceSessionCard
            title={item.offer.title}
            subtitle={item.offer.subtitle}
            coverUrl={item.offer.coverUrl}
            accessType={item.offer.accessType}
            priceAmountMinor={item.offer.priceAmountMinor}
            currency={item.offer.currency}
            creatorName={item.offer.authorName}
            onOpen={() => openOffer(item.offer)}
          />
        );
      case 'product':
        return (
          <ProductArtifactCard
            title={item.offer.title}
            coverUrl={item.offer.coverUrl}
            accessType={item.offer.accessType}
            priceAmountMinor={item.offer.priceAmountMinor}
            currency={item.offer.currency}
            externalUrl={item.offer.externalUrl}
            creatorName={item.offer.authorName}
            onOpen={() => openOffer(item.offer)}
          />
        );
      case 'empty_following':
        return (
          <View style={styles.quietWrap}>
            <Text allowFontScaling={false} style={[styles.quietTitle, { color: t.textPrimary }]}>
              YOUR VAULT IS QUIET
            </Text>
            <Text allowFontScaling={false} style={[styles.quietBody, { color: t.textMuted }]}>
              Follow creators to see their Drops, Collections and experiences here.
            </Text>
            <VaultActionButton
              label="Discover Creators"
              onPress={() => {
                hapticTap();
                setScope('discover');
              }}
            />
          </View>
        );
      case 'empty_discover':
        return (
          <EmptyState
            icon={VaultIcon}
            title="Worlds are quiet"
            body="Published Creator Worlds will appear here when creators share free or preview work."
          />
        );
      default:
        return null;
    }
  };

  if (phase === 'loading' && !model) {
    return (
      <View style={[styles.screen, { backgroundColor: t.background, paddingTop: insets.top + space.md }]}>
        <View style={styles.content}>
          <Text allowFontScaling={false} style={[styles.brand, { color: t.textPrimary }]}>
            Vault
          </Text>
          <Text allowFontScaling={false} style={[styles.tagline, { color: t.textSecondary }]}>
            Worlds worth entering.
          </Text>
          <VaultHomeSkeleton tint={t.surfaceMuted} />
        </View>
      </View>
    );
  }

  if (phase === 'error' && !model) {
    return (
      <View style={[styles.screen, { backgroundColor: t.background, paddingTop: insets.top + space.md }]}>
        <View style={styles.content}>
          <Text allowFontScaling={false} style={[styles.brand, { color: t.textPrimary }]}>
            Vault
          </Text>
          <EmptyState
            icon={VaultIcon}
            title="Vault unavailable"
            body="Could not load Creator Worlds. Check your connection and try again."
            actionLabel="Try again"
            onAction={() => {
              setPhase('loading');
              void load(scope);
            }}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: t.background }]}>
      <FlatList
        data={rows}
        keyExtractor={(row, index) => {
          if (row.kind === 'featured') return `featured:${row.creator.creatorId}`;
          if (row.kind === 'world') return `world:${row.creator.creatorId}`;
          if (row.kind === 'today') return `today:${row.drop.dropId}:${row.large ? 'L' : 'S'}`;
          if (row.kind === 'course') return `course:${row.offer.id}`;
          if (row.kind === 'service') return `service:${row.offer.id}`;
          if (row.kind === 'product') return `product:${row.offer.id}`;
          if (row.kind === 'chapter') return `chapter:${row.title}`;
          if (row.kind === 'rail') return 'rail';
          return `${row.kind}:${index}`;
        }}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={t.textMuted} />
        }
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + space.md,
            paddingBottom: dockBottomPadding(insets.bottom),
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    paddingHorizontal: layout.screenX,
    gap: space.lg,
  },
  masthead: { gap: 6, marginBottom: 2 },
  mastheadRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  brand: { ...typeScale.display, fontSize: 28, lineHeight: 32 },
  tagline: { ...typeScale.body, fontSize: 15 },
  createLink: { ...typeScale.meta, letterSpacing: 0.3 },
  chapter: {
    ...typeScale.caption,
    letterSpacing: 1.2,
    marginTop: space.sm,
  },
  quietWrap: {
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.xxl,
    paddingHorizontal: space.lg,
  },
  quietTitle: {
    ...typeScale.cardTitle,
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  quietBody: {
    ...typeScale.body,
    textAlign: 'center',
    maxWidth: 300,
  },
  skeletonWrap: { gap: space.md, marginTop: space.lg },
  skeletonHero: { height: 360, borderRadius: 4 },
  skeletonLine: { height: 12, borderRadius: 4 },
  skeletonWide: { height: 160, borderRadius: 4 },
});
