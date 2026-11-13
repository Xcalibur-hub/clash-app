import React from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import {
  fetchVaultHome,
  type VaultHomeModel,
  type VaultHomeOfferCard,
  type VaultHomeScope,
} from '../../services/vaultHomeService';
import { fetchMyVault } from '../../services/vaultService';
import { errorText } from '../../services/supabaseClient';
import { analytics } from '../../services/analytics';
import { vaultExperienceHref } from '../../utils/vaultExperiences';
import { buildHomeRows, type HomeRow } from '../../utils/vaultHomeRows';
import { duration, layout, radius, space, typeScale, useThemeColors } from '../../theme';
import { dockBottomPadding } from '../navigation/dockConfig';
import { EmptyState } from '../shared/EmptyState';
import { AppText } from '../shared/AppText';
import { VaultIcon } from '../shared/icons';
import { VaultScopeControl } from './VaultScopeControl';
import { HomeRowView } from './world/HomeRowView';
import { tap as hapticTap } from '../../utils/haptics';

type Phase = 'loading' | 'ready' | 'error';

function VaultHomeSkeleton({ tint }: { tint: string }): React.JSX.Element {
  return (
    <View style={styles.skeletonWrap} accessibilityLabel="Loading Vault">
      <View style={[styles.skeletonHero, { backgroundColor: tint }]} />
      <View style={styles.skeletonRow}>
        <View style={[styles.skeletonHalf, { backgroundColor: tint }]} />
        <View style={[styles.skeletonStack]}>
          <View style={[styles.skeletonMini, { backgroundColor: tint }]} />
          <View style={[styles.skeletonMini, { backgroundColor: tint }]} />
        </View>
      </View>
    </View>
  );
}

/** Vault home — enter different creator universes, not a shelf of cards. */
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

  const rows = model ? buildHomeRows(model, scope) : [];

  const renderItem = ({ item }: ListRenderItemInfo<HomeRow>): React.JSX.Element | null => {
    if (item.kind === 'masthead') {
      return (
        <Animated.View entering={reduced ? undefined : FadeIn.duration(duration.base)} style={styles.masthead}>
          <AppText style={[styles.eyebrow, { color: t.textMuted }]}>THE VAULT</AppText>
          <View style={styles.mastheadRow}>
            <AppText style={[styles.headline, { color: t.textPrimary }]} accessibilityRole="header">
              Enter their world
            </AppText>
            {model?.canCreate ? (
              <Pressable
                onPress={() => void onCreate()}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Create Drop"
                style={({ pressed }) => [
                  styles.createBtn,
                  { borderColor: t.borderStrong, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <AppText style={[styles.createLink, { color: t.textPrimary }]}>Create</AppText>
              </Pressable>
            ) : null}
          </View>
          <View style={[styles.mastheadRule, { backgroundColor: t.brand }]} />
        </Animated.View>
      );
    }
    if (item.kind === 'scope') return <VaultScopeControl value={scope} onChange={setScope} />;
    return (
      <HomeRowView
        row={item}
        onEnterWorld={(id) => router.push(`/vault/${id}`)}
        onOpenDrop={(id) => router.push(`/vault/drop/${id}`)}
        onOpenOffer={openOffer}
        onDiscover={() => setScope('discover')}
      />
    );
  };
  if (phase === 'loading' && !model) {
    return (
      <View style={[styles.screen, { backgroundColor: t.background, paddingTop: insets.top + space.md }]}>
        <View style={styles.content}>
          <AppText style={[styles.eyebrow, { color: t.textMuted }]}>THE VAULT</AppText>
          <AppText style={[styles.headline, { color: t.textPrimary }]} accessibilityRole="header">
            Enter their world
          </AppText>
          <VaultHomeSkeleton tint={t.surfaceMuted} />
        </View>
      </View>
    );
  }

  if (phase === 'error' && !model) {
    return (
      <View style={[styles.screen, { backgroundColor: t.background, paddingTop: insets.top + space.md }]}>
        <View style={styles.content}>
          <AppText style={[styles.eyebrow, { color: t.textMuted }]}>THE VAULT</AppText>
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
          if (row.kind === 'collage') return `collage:${row.worlds.map((w) => w.creatorId).join(',')}`;
          if (row.kind === 'today') return `today:${row.drop.dropId}`;
          if (row.kind === 'dropStrip') return `strip:${row.drops.map((d) => d.dropId).join(',')}`;
          if (row.kind === 'courses') return `courses:${row.offers.map((o) => o.id).join(',')}`;
          if (row.kind === 'services') return `services:${row.offers.map((o) => o.id).join(',')}`;
          if (row.kind === 'products') return `products:${row.offers.map((o) => o.id).join(',')}`;
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
          { paddingTop: insets.top + space.md, paddingBottom: dockBottomPadding(insets.bottom) },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: layout.screenX, gap: space.md },
  masthead: { gap: 4 },
  mastheadRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.md },
  eyebrow: { ...typeScale.kicker, color: '#8A8A93' },
  headline: { ...typeScale.editorialLg, flex: 1 },
  mastheadRule: { width: 26, height: 2, borderRadius: 1, marginTop: 10 },
  createBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  createLink: { ...typeScale.label },
  skeletonWrap: { gap: space.xs, marginTop: space.md },
  skeletonHero: { height: 320, borderRadius: radius.xxl },
  skeletonRow: { flexDirection: 'row', gap: space.xs, minHeight: 200 },
  skeletonHalf: { flex: 1.2, borderRadius: radius.xxl },
  skeletonStack: { flex: 0.8, gap: space.xs },
  skeletonMini: { flex: 1, borderRadius: radius.xxl },
});