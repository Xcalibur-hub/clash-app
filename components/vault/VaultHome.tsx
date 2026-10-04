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
import { layout, space, typeScale, useThemeColors } from '../../theme';
import { dockBottomPadding } from '../navigation/dockConfig';
import { SegmentedTabs } from '../shared/SegmentedTabs';
import { EmptyState } from '../shared/EmptyState';
import { VaultIcon } from '../shared/icons';
import { CreatorWorldCard } from './CreatorWorldCard';
import { TodaysDropCard } from './TodaysDropCard';
import { OfferCard } from './OfferCard';
import { VaultActionButton } from './VaultActionButton';
import { tap as hapticTap } from '../../utils/haptics';

type Phase = 'loading' | 'ready' | 'error';

type HomeRow =
  | { kind: 'header' }
  | { kind: 'scope' }
  | { kind: 'section'; title: string }
  | { kind: 'today'; drop: VaultHomeDropCard }
  | { kind: 'creators'; items: VaultCreatorWorldCard[] }
  | { kind: 'continue'; drop: VaultHomeDropCard }
  | { kind: 'world'; creator: VaultCreatorWorldCard; featured?: boolean }
  | { kind: 'offer'; offer: VaultHomeOfferCard }
  | { kind: 'empty_following' }
  | { kind: 'empty_discover' };

const SCOPES: readonly { key: VaultHomeScope; label: string }[] = [
  { key: 'following', label: 'Following' },
  { key: 'discover', label: 'Discover' },
];

function buildRows(model: VaultHomeModel, scope: VaultHomeScope): HomeRow[] {
  const rows: HomeRow[] = [{ kind: 'header' }, { kind: 'scope' }];

  if (model.isEmpty) {
    rows.push(scope === 'following' ? { kind: 'empty_following' } : { kind: 'empty_discover' });
    return rows;
  }

  if (scope === 'following') {
    if (model.todaysDrops.length > 0) {
      rows.push({ kind: 'section', title: "TODAY'S DROPS" });
      for (const drop of model.todaysDrops.slice(0, 8)) {
        rows.push({ kind: 'today', drop });
      }
    }
    if (model.yourCreators.length > 0) {
      rows.push({ kind: 'section', title: 'YOUR CREATORS' });
      rows.push({ kind: 'creators', items: model.yourCreators });
    }
    if (model.continueItems.length > 0) {
      rows.push({ kind: 'section', title: 'CONTINUE' });
      for (const drop of model.continueItems.slice(0, 4)) {
        rows.push({ kind: 'continue', drop });
      }
    }
    return rows;
  }

  // Discover — editorial composition
  if (model.discoverWorlds.length > 0) {
    rows.push({ kind: 'section', title: 'DISCOVER WORLDS' });
    model.discoverWorlds.forEach((creator, index) => {
      rows.push({ kind: 'world', creator, featured: index === 0 });
    });
  }

  if (model.todaysDrops.length > 0) {
    rows.push({ kind: 'section', title: 'NEW DROPS' });
    for (const drop of model.todaysDrops.slice(0, 8)) {
      rows.push({ kind: 'today', drop });
    }
  }

  if (model.discoverCourses.length > 0) {
    rows.push({ kind: 'section', title: 'LEARN FROM CREATORS' });
    for (const offer of model.discoverCourses) {
      rows.push({ kind: 'offer', offer });
    }
  }

  if (model.discoverServices.length > 0) {
    rows.push({ kind: 'section', title: 'SERVICES' });
    for (const offer of model.discoverServices) {
      rows.push({ kind: 'offer', offer });
    }
  }

  if (model.discoverProducts.length > 0) {
    rows.push({ kind: 'section', title: 'FROM THE SHOP' });
    for (const offer of model.discoverProducts) {
      rows.push({ kind: 'offer', offer });
    }
  }

  return rows;
}

function VaultHomeSkeleton({ tint }: { tint: string }): React.JSX.Element {
  return (
    <View style={styles.skeletonWrap} accessibilityLabel="Loading Vault">
      <View style={[styles.skeletonBlock, styles.skeletonHero, { backgroundColor: tint }]} />
      <View style={[styles.skeletonBlock, { backgroundColor: tint, width: '70%' }]} />
      <View style={[styles.skeletonBlock, { backgroundColor: tint, width: '45%' }]} />
      <View style={[styles.skeletonBlock, styles.skeletonCard, { backgroundColor: tint }]} />
    </View>
  );
}

/** Vault realm home — media-led Creator Worlds, not a creator dashboard. */
export function VaultHome(): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useThemeColors();

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
      case 'header':
        return (
          <View style={styles.headerBlock}>
            <View style={styles.headerRow}>
              <Text allowFontScaling={false} style={[styles.brand, { color: t.textPrimary }]}>
                Vault
              </Text>
              {model?.canCreate ? (
                <Pressable
                  onPress={() => void onCreate()}
                  style={[styles.createChip, { borderColor: t.border, backgroundColor: t.surface }]}
                  accessibilityRole="button"
                  accessibilityLabel="Create Drop"
                >
                  <Text allowFontScaling={false} style={[styles.createText, { color: t.textPrimary }]}>
                    CREATE
                  </Text>
                </Pressable>
              ) : null}
            </View>
            <Text allowFontScaling={false} style={[styles.tagline, { color: t.textSecondary }]}>
              Enter creator worlds.
            </Text>
          </View>
        );
      case 'scope':
        return (
          <SegmentedTabs
            value={scope}
            items={SCOPES}
            onChange={setScope}
            label="Vault scope"
          />
        );
      case 'section':
        return (
          <Text allowFontScaling={false} style={[styles.section, { color: t.textMuted }]}>
            {item.title}
          </Text>
        );
      case 'today':
        return (
          <TodaysDropCard
            drop={item.drop}
            onOpen={() => router.push(`/vault/drop/${item.drop.dropId}`)}
          />
        );
      case 'continue':
        return (
          <TodaysDropCard
            drop={item.drop}
            large={false}
            onOpen={() => router.push(`/vault/drop/${item.drop.dropId}`)}
          />
        );
      case 'creators':
        return (
          <FlatList
            horizontal
            data={item.items}
            keyExtractor={(c) => c.creatorId}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.hList}
            renderItem={({ item: creator }) => (
              <View style={styles.hCard}>
                <CreatorWorldCard
                  creator={creator}
                  onEnter={() => router.push(`/vault/${creator.creatorId}`)}
                />
              </View>
            )}
          />
        );
      case 'world':
        return (
          <CreatorWorldCard
            creator={item.creator}
            featured={item.featured}
            onEnter={() => router.push(`/vault/${item.creator.creatorId}`)}
          />
        );
      case 'offer':
        return (
          <OfferCard
            kind={
              item.offer.kind === 'service'
                ? 'SERVICE'
                : item.offer.kind === 'course'
                  ? 'COURSE'
                  : 'PRODUCT'
            }
            title={item.offer.title}
            subtitle={item.offer.subtitle ?? `@${item.offer.authorHandle}`}
            coverUrl={item.offer.coverUrl}
            accessType={item.offer.accessType}
            priceAmountMinor={item.offer.priceAmountMinor}
            currency={item.offer.currency}
            externalUrl={item.offer.externalUrl}
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
          if (row.kind === 'today') return `today:${row.drop.dropId}`;
          if (row.kind === 'continue') return `continue:${row.drop.dropId}`;
          if (row.kind === 'world') return `world:${row.creator.creatorId}`;
          if (row.kind === 'offer') return `offer:${row.offer.kind}:${row.offer.id}`;
          if (row.kind === 'section') return `section:${row.title}`;
          if (row.kind === 'creators') return 'creators';
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
        ListFooterComponent={
          model?.canCreate ? (
            <View style={styles.footerCreate}>
              <VaultActionButton label="Create Drop" onPress={() => void onCreate()} tone="quiet" compact />
            </View>
          ) : null
        }
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
  headerBlock: { gap: 4, marginBottom: space.xs },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: { ...typeScale.display },
  tagline: { ...typeScale.body },
  createChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  createText: { ...typeScale.caption, letterSpacing: 0.8, fontWeight: '600' },
  section: {
    ...typeScale.caption,
    letterSpacing: 0.9,
    marginTop: space.sm,
  },
  hList: { gap: space.md, paddingRight: space.md },
  hCard: { width: 280 },
  footerCreate: { alignItems: 'center', paddingTop: space.md },
  quietWrap: {
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.xxl,
    paddingHorizontal: space.lg,
  },
  quietTitle: {
    ...typeScale.cardTitle,
    letterSpacing: 0.6,
    textAlign: 'center',
  },
  quietBody: {
    ...typeScale.body,
    textAlign: 'center',
    maxWidth: 300,
  },
  skeletonWrap: { gap: space.md, marginTop: space.lg },
  skeletonBlock: { height: 14, borderRadius: 8 },
  skeletonHero: { height: 18, width: '40%' },
  skeletonCard: { height: 220, marginTop: space.sm, borderRadius: 24 },
});
