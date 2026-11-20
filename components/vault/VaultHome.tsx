import React from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
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
  type VaultHomeModel,
  type VaultHomeOfferCard,
  type VaultHomeScope,
} from '../../services/vaultHomeService';
import { useAuth } from '../../store/AuthProvider';
import { useIsFocused } from '@react-navigation/native';
import { useOperationScope } from '../../hooks/useOperationScope';
import { analytics } from '../../services/analytics';
import { vaultExperienceHref } from '../../utils/vaultExperiences';
import { buildHomeRows, type HomeRow } from '../../utils/vaultHomeRows';
import { duration, layout, radius, space, typeScale, useThemeColors } from '../../theme';
import { EmptyState } from '../shared/EmptyState';
import { VaultIcon } from '../shared/icons';
import { VaultScopeControl } from './VaultScopeControl';
import { HomeRowView } from './world/HomeRowView';
import { StoryEntry } from './story/StoryEntry';
import { VaultPublishingAvailability } from './VaultAvailability';

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
  const { user } = useAuth();
  const focused = useIsFocused();
  const account = user?.id ?? 'guest';
  const identity = React.useRef({ account });
  if (identity.current.account !== account) identity.current = { account };
  const identityEpoch = identity.current;

  const [phase, setPhase] = React.useState<Phase>('loading');
  const [scope, setScope] = React.useState<VaultHomeScope>('discover');
  const isCurrent = useOperationScope(`${account}:${focused}:${scope}`);
  const [model, setModel] = React.useState<VaultHomeModel | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [readError, setReadError] = React.useState(false);
  const [modelAccount, setModelAccount] = React.useState(identityEpoch);
  const request = React.useRef(0);
  const refreshingRequest = React.useRef(false);

  const modelRef = React.useRef<VaultHomeModel | null>(null);
  const visibleModel = modelAccount === identityEpoch ? model : null;
  modelRef.current = visibleModel;

  const load = React.useCallback(
    async (nextScope: VaultHomeScope, opts?: { soft?: boolean }): Promise<void> => {
      if (!isCurrent() || !focused) return;
      const ticket = ++request.current;
      setReadError(false);
      try {
        const next = await fetchVaultHome(nextScope);
        if (!isCurrent() || ticket !== request.current) return;
        setModel(next);
        setModelAccount(identityEpoch);
        setPhase('ready');
        analytics.trackOnce(`vault_home:${nextScope}`, 'vault_opened', {
          realm: 'vault',
          is_guest: account === 'guest',
        });
      } catch (error: unknown) {
        if (!isCurrent() || ticket !== request.current) return;
        setReadError(true);
        const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : null;
        if (code === '42501' || code === 'PGRST301' || code === '401' || code === '403') {
          setModel(null);
          setPhase('error');
          return;
        }
        if (!opts?.soft || !modelRef.current) setPhase('error');
      }
    },
    [isCurrent, focused, account, identityEpoch],
  );

  useFocusEffect(
    React.useCallback(() => {
      refreshingRequest.current = false;
      setRefreshing(false);
      if (!modelRef.current) setPhase('loading');
      void load(scope, { soft: Boolean(modelRef.current) });
      return () => { request.current++; };
    }, [load, scope]),
  );

  const onRefresh = async (): Promise<void> => {
    if (!isCurrent() || refreshingRequest.current) return;
    refreshingRequest.current = true;
    setRefreshing(true);
    await load(scope, { soft: true });
    if (!isCurrent()) return;
    refreshingRequest.current = false;
    setRefreshing(false);
  };

  const openOffer = (offer: VaultHomeOfferCard): void => {
    if (!isCurrent()) return;
    const type =
      offer.kind === 'service' ? 'SERVICE' : offer.kind === 'course' ? 'COURSE' : 'PRODUCT';
    const href = vaultExperienceHref({ type, id: offer.id });
    if (href) router.push(href as never);
  };

  const rows = visibleModel ? buildHomeRows(visibleModel, scope) : [];

  const alternatives = <View>
    <Pressable accessibilityRole="button" onPress={() => { if (isCurrent()) router.push('/(tabs)'); }} style={{ minHeight: 48, justifyContent: 'center' }}>
      <Text style={{ ...typeScale.body, color: t.textPrimary }}>Explore Takes</Text>
    </Pressable>
    <Pressable accessibilityRole="button" onPress={() => { if (isCurrent()) router.push('/arena/challenges'); }} style={{ minHeight: 48, justifyContent: 'center' }}>
      <Text style={{ ...typeScale.body, color: t.textPrimary }}>View Challenge Inbox</Text>
    </Pressable>
  </View>;

  const renderItem = ({ item }: ListRenderItemInfo<HomeRow>): React.JSX.Element | null => {
    if (item.kind === 'masthead') {
      return (
        <Animated.View entering={reduced ? undefined : FadeIn.duration(duration.base)} style={styles.masthead}>
          <Text allowFontScaling={false} style={[styles.eyebrow, { color: t.textMuted }]}>
            VAULT
          </Text>
          <View style={styles.mastheadRow}>
            <Text allowFontScaling={false} style={[styles.headline, { color: t.textPrimary }]}>
              Enter their world
            </Text>
          </View>
          <VaultPublishingAvailability />
          {readError ? <Text accessibilityLiveRegion="polite" style={{ color: t.textSecondary }}>Refresh failed. Previously loaded content is shown; access is checked again when opened.</Text> : null}
          {visibleModel?.isEmpty || readError ? alternatives : null}
        </Animated.View>
      );
    }
    if (item.kind === 'scope') return <VaultScopeControl value={scope} onChange={setScope} />;
    return (
      <HomeRowView
        row={item}
        onEnterWorld={(id) => { if (isCurrent()) router.push(`/vault/${id}`); }}
        onOpenDrop={(id) => { if (isCurrent()) router.push(`/vault/drop/${id}`); }}
        onOpenOffer={openOffer}
        onDiscover={() => setScope('discover')}
      />
    );
  };
  if ((phase === 'loading' || (modelAccount !== identityEpoch && phase !== 'error')) && !visibleModel) {
    return (
      <ScrollView style={[styles.screen, { backgroundColor: t.background }]} contentContainerStyle={[styles.content, { paddingTop: insets.top + space.md, paddingBottom: space.lg }]}>
          <Text allowFontScaling={false} style={[styles.eyebrow, { color: t.textMuted }]}>
            VAULT
          </Text>
          <Text allowFontScaling={false} style={[styles.headline, { color: t.textPrimary }]}>
            Enter their world
          </Text>
          <VaultHomeSkeleton tint={t.surfaceMuted} />
          {alternatives}
          <StoryEntry />
      </ScrollView>
    );
  }

  if (phase === 'error' && !visibleModel) {
    return (
      <ScrollView style={[styles.screen, { backgroundColor: t.background }]} contentContainerStyle={[styles.content, { paddingTop: insets.top + space.md, paddingBottom: space.lg }]}>
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
          <VaultPublishingAvailability />
          {alternatives}
          <StoryEntry />
      </ScrollView>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: t.background }]}>
      <FlatList
        ListHeaderComponent={StoryEntry}
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
          { paddingTop: insets.top + space.md, paddingBottom: space.lg },
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
  eyebrow: { ...typeScale.caption, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  headline: { ...typeScale.display, fontSize: 30, lineHeight: 34, fontWeight: '800', letterSpacing: -1, flex: 1 },
  createLink: { ...typeScale.meta, fontWeight: '600' },
  skeletonWrap: { gap: space.xs, marginTop: space.md },
  skeletonHero: { height: 320, borderRadius: radius.xxl },
  skeletonRow: { flexDirection: 'row', gap: space.xs, minHeight: 200 },
  skeletonHalf: { flex: 1.2, borderRadius: radius.xxl },
  skeletonStack: { flex: 0.8, gap: space.xs },
  skeletonMini: { flex: 1, borderRadius: radius.xxl },
});
