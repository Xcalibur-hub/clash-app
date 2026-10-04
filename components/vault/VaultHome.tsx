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
import {
  fetchVaultHome,
  type VaultCreatorWorldCard,
  type VaultHomeDropCard,
  type VaultHomeModel,
  type VaultHomeScope,
} from '../../services/vaultHomeService';
import { fetchMyVault } from '../../services/vaultService';
import { errorText } from '../../services/supabaseClient';
import { analytics } from '../../services/analytics';
import { layout, space, typeScale, useThemeColors } from '../../theme';
import { dockBottomPadding } from '../navigation/dockConfig';
import { SegmentedTabs } from '../shared/SegmentedTabs';
import { EmptyState } from '../shared/EmptyState';
import { VaultIcon } from '../shared/icons';
import { CreatorWorldCard } from './CreatorWorldCard';
import { TodaysDropCard } from './TodaysDropCard';
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
  | { kind: 'empty' };

const SCOPES: readonly { key: VaultHomeScope; label: string }[] = [
  { key: 'following', label: 'Following' },
  { key: 'discover', label: 'Discover' },
];

function buildRows(model: VaultHomeModel): HomeRow[] {
  const rows: HomeRow[] = [{ kind: 'header' }, { kind: 'scope' }];

  if (
    model.todaysDrops.length === 0 &&
    model.yourCreators.length === 0 &&
    model.discoverWorlds.length === 0
  ) {
    rows.push({ kind: 'empty' });
    return rows;
  }

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

  if (model.discoverWorlds.length > 0) {
    rows.push({ kind: 'section', title: 'DISCOVER WORLDS' });
    model.discoverWorlds.forEach((creator, index) => {
      rows.push({ kind: 'world', creator, featured: index === 0 });
    });
  }

  return rows;
}

/** Vault realm home — media-led Creator Worlds, not a creator dashboard. */
export function VaultHome(): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useThemeColors();

  const [phase, setPhase] = React.useState<Phase>('loading');
  const [scope, setScope] = React.useState<VaultHomeScope>('discover');
  const [model, setModel] = React.useState<VaultHomeModel | null>(null);

  const load = React.useCallback(async (nextScope: VaultHomeScope): Promise<void> => {
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
      setPhase('error');
    }
  }, []);

  React.useEffect(() => {
    setPhase('loading');
    void load(scope);
  }, [load, scope]);

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

  const rows = model ? buildRows(model) : [];

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
      case 'empty':
        return (
          <EmptyState
            icon={VaultIcon}
            title={scope === 'following' ? 'No worlds yet' : 'Worlds are quiet'}
            body={
              scope === 'following'
                ? 'Follow creators to see their Vaults here.'
                : 'Free and preview Drops from creators will appear as Worlds.'
            }
          />
        );
      default:
        return null;
    }
  };

  if (phase === 'loading' && !model) {
    return (
      <View style={[styles.screen, styles.centered, { backgroundColor: t.background, paddingTop: insets.top }]}>
        <ActivityIndicator color={t.textPrimary} />
      </View>
    );
  }

  if (phase === 'error' && !model) {
    return (
      <View style={[styles.screen, { backgroundColor: t.background, paddingTop: insets.top + space.md }]}>
        <EmptyState
          icon={VaultIcon}
          title="Vault unavailable"
          body="Could not load Creator Worlds."
          actionLabel="Try again"
          onAction={() => void load(scope)}
        />
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
          if (row.kind === 'section') return `section:${row.title}`;
          if (row.kind === 'creators') return 'creators';
          return `${row.kind}:${index}`;
        }}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
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
  centered: { justifyContent: 'center', alignItems: 'center' },
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
});
