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
import { duration, layout, radius, space, typeScale, useThemeColors } from '../../theme';
import { dockBottomPadding } from '../navigation/dockConfig';
import { ExploreHeading } from '../explore/ExploreHeading';
import { EmptyState } from '../shared/EmptyState';
import { VaultIcon } from '../shared/icons';
import { FeaturedWorld } from './FeaturedWorld';
import { VaultWorldMosaic } from './VaultWorldMosaic';
import { WorldRail } from './WorldRail';
import { VaultScopeControl } from './VaultScopeControl';
import { TodaysDropCard } from './TodaysDropCard';
import { VaultMediaTile } from './VaultMediaTile';
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
  | { kind: 'mosaic'; worlds: VaultCreatorWorldCard[] }
  | { kind: 'rail'; items: VaultCreatorWorldCard[] }
  | { kind: 'today'; drop: VaultHomeDropCard; large?: boolean }
  | { kind: 'dropRail'; drops: VaultHomeDropCard[] }
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
      rows.push({ kind: 'chapter', title: 'Your worlds' });
      rows.push({ kind: 'rail', items: model.yourCreators });
    }
    if (model.todaysDrops.length > 0) {
      rows.push({ kind: 'chapter', title: 'Today' });
      const [first, ...rest] = model.todaysDrops;
      if (first) rows.push({ kind: 'today', drop: first, large: true });
      if (rest.length > 0) rows.push({ kind: 'dropRail', drops: rest.slice(0, 6) });
    }
    if (model.continueItems.length > 0) {
      rows.push({ kind: 'chapter', title: 'Continue' });
      rows.push({ kind: 'dropRail', drops: model.continueItems.slice(0, 4) });
    }
    return rows;
  }

  if (model.discoverWorlds.length > 0) {
    const [featured, ...rest] = model.discoverWorlds;
    if (featured) rows.push({ kind: 'featured', creator: featured });
    if (rest.length > 0) {
      rows.push({ kind: 'chapter', title: 'Discover worlds' });
      rows.push({ kind: 'mosaic', worlds: rest });
    }
  }

  if (model.todaysDrops.length > 0) {
    rows.push({ kind: 'chapter', title: 'New drops' });
    const [first, ...rest] = model.todaysDrops;
    if (first) rows.push({ kind: 'today', drop: first, large: true });
    if (rest.length > 0) rows.push({ kind: 'dropRail', drops: rest.slice(0, 8) });
  }

  if (model.discoverCourses.length > 0) {
    rows.push({ kind: 'chapter', title: 'Learn' });
    for (const offer of model.discoverCourses.slice(0, 3)) {
      rows.push({ kind: 'course', offer });
    }
  }

  if (model.discoverServices.length > 0) {
    rows.push({ kind: 'chapter', title: 'Sessions' });
    for (const offer of model.discoverServices.slice(0, 3)) {
      rows.push({ kind: 'service', offer });
    }
  }

  if (model.discoverProducts.length > 0) {
    rows.push({ kind: 'chapter', title: 'Artifacts' });
    for (const offer of model.discoverProducts.slice(0, 3)) {
      rows.push({ kind: 'product', offer });
    }
  }

  return rows;
}

function VaultHomeSkeleton({ tint }: { tint: string }): React.JSX.Element {
  return (
    <View style={styles.skeletonWrap} accessibilityLabel="Loading Vault">
      <View style={[styles.skeletonHero, { backgroundColor: tint }]} />
      <View style={styles.skeletonRow}>
        <View style={[styles.skeletonHalf, { backgroundColor: tint }]} />
        <View style={styles.skeletonStack}>
          <View style={[styles.skeletonMini, { backgroundColor: tint }]} />
          <View style={[styles.skeletonMini, { backgroundColor: tint }]} />
        </View>
      </View>
    </View>
  );
}

/** Vault home — Explore visual language, creator-world purpose. */
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
            <Text allowFontScaling={false} style={[styles.eyebrow, { color: t.textMuted }]}>
              VAULT
            </Text>
            <View style={styles.mastheadRow}>
              <Text allowFontScaling={false} style={[styles.headline, { color: t.textPrimary }]}>
                Enter their world
              </Text>
              {model?.canCreate ? (
                <Pressable onPress={() => void onCreate()} hitSlop={12} accessibilityLabel="Create Drop">
                  <Text allowFontScaling={false} style={[styles.createLink, { color: t.textMuted }]}>
                    Create
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </Animated.View>
        );
      case 'scope':
        return <VaultScopeControl value={scope} onChange={setScope} />;
      case 'chapter':
        return <ExploreHeading title={item.title} style={styles.chapter} />;
      case 'featured':
        return (
          <FeaturedWorld
            creator={item.creator}
            onEnter={() => router.push(`/vault/${item.creator.creatorId}`)}
          />
        );
      case 'mosaic':
        return (
          <VaultWorldMosaic
            worlds={item.worlds}
            onEnter={(creatorId) => router.push(`/vault/${creatorId}`)}
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
      case 'dropRail':
        return (
          <FlatList
            horizontal
            data={item.drops}
            keyExtractor={(d) => d.dropId}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.hRail}
            renderItem={({ item: drop }) => (
              <VaultMediaTile
                kind={drop.accessLevel === 'preview' ? 'PREVIEW' : 'DROP'}
                title={drop.caption}
                subtitle={`@${drop.authorHandle}`}
                mediaUrl={drop.mediaUrl}
                accent={drop.authorTint}
                span="portrait"
                height={220}
                style={styles.hTile}
                onPress={() => router.push(`/vault/drop/${drop.dropId}`)}
              />
            )}
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
              Your Vault is quiet
            </Text>
            <Text allowFontScaling={false} style={[styles.quietBody, { color: t.textMuted }]}>
              Follow creators to see their Drops, Collections and experiences here.
            </Text>
            <VaultActionButton
              label="Discover creators"
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
          <Text allowFontScaling={false} style={[styles.eyebrow, { color: t.textMuted }]}>
            VAULT
          </Text>
          <Text allowFontScaling={false} style={[styles.headline, { color: t.textPrimary }]}>
            Enter their world
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
          <Text allowFontScaling={false} style={[styles.eyebrow, { color: t.textMuted }]}>
            VAULT
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
          if (row.kind === 'mosaic') return `mosaic:${row.worlds.map((w) => w.creatorId).join(',')}`;
          if (row.kind === 'today') return `today:${row.drop.dropId}`;
          if (row.kind === 'dropRail') return `rail:${row.drops.map((d) => d.dropId).join(',')}`;
          if (row.kind === 'course') return `course:${row.offer.id}`;
          if (row.kind === 'service') return `service:${row.offer.id}`;
          if (row.kind === 'product') return `product:${row.offer.id}`;
          if (row.kind === 'chapter') return `chapter:${row.title}`;
          if (row.kind === 'rail') return 'creators-rail';
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
    gap: space.md,
  },
  masthead: { gap: 4 },
  mastheadRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: space.md,
  },
  eyebrow: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  headline: {
    ...typeScale.display,
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '800',
    letterSpacing: -1,
    flex: 1,
  },
  createLink: { ...typeScale.meta, fontWeight: '600' },
  chapter: { marginTop: space.xs },
  hRail: { gap: space.xs, paddingRight: space.md },
  hTile: { width: 148 },
  quietWrap: {
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.xxl,
    paddingHorizontal: space.lg,
  },
  quietTitle: {
    ...typeScale.section,
    fontWeight: '800',
    textAlign: 'center',
  },
  quietBody: {
    ...typeScale.body,
    textAlign: 'center',
    maxWidth: 300,
  },
  skeletonWrap: { gap: space.xs, marginTop: space.md },
  skeletonHero: { height: 320, borderRadius: radius.xxl },
  skeletonRow: { flexDirection: 'row', gap: space.xs, minHeight: 200 },
  skeletonHalf: { flex: 1.2, borderRadius: radius.xxl },
  skeletonStack: { flex: 0.8, gap: space.xs },
  skeletonMini: { flex: 1, borderRadius: radius.xxl },
});
