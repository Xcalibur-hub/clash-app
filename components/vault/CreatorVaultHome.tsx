import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { User } from '../../store';
import { showNotice, useClash } from '../../store';
import { fetchViewerProfile } from '../../services/apiService';
import {
  createVault,
  deleteDrop,
  fetchMyVault,
  fetchStorefront,
  publishDrop,
  updateVault,
} from '../../services/vaultService';
import type { CreatorVault, StorefrontDrop } from '../../services/vaultMappers';
import { errorText } from '../../services/supabaseClient';
import { layout, space, typeScale, useThemeColors } from '../../theme';
import { dockBottomPadding } from '../navigation/dockConfig';
import { EmptyState } from '../shared/EmptyState';
import { GlowButton } from '../shared/GlowButton';
import { EditIcon, PlusIcon, VaultIcon } from '../shared/icons';
import { CreatorDropRow } from './CreatorDropRow';
import { VaultFormSheet } from './VaultFormSheet';

type Phase = 'loading' | 'ready';

/**
 * Creator Vault home (Drops tab) — intimate creator space, not a dashboard.
 * Ownership and expiry stay server-authoritative.
 */
export function CreatorVaultHome(): React.JSX.Element {
  const { dispatch } = useClash();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useThemeColors();

  const [phase, setPhase] = React.useState<Phase>('loading');
  const [profile, setProfile] = React.useState<User | null>(null);
  const [vault, setVault] = React.useState<CreatorVault | null>(null);
  const [drops, setDrops] = React.useState<StorefrontDrop[]>([]);
  const [formOpen, setFormOpen] = React.useState(false);
  const [formMode, setFormMode] = React.useState<'create' | 'edit'>('create');
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async (): Promise<void> => {
    try {
      const [mine, me] = await Promise.all([fetchMyVault(), fetchViewerProfile()]);
      setVault(mine);
      setProfile(me);
      if (mine) setDrops(await fetchStorefront(mine.id));
      else setDrops([]);
    } catch (error) {
      dispatch(showNotice(errorText(error)));
    } finally {
      setPhase('ready');
    }
  }, [dispatch]);

  React.useEffect(() => {
    setPhase('loading');
    void load();
  }, [load]);

  const submitVault = async (title: string, description: string): Promise<void> => {
    setBusy(true);
    try {
      if (formMode === 'create') {
        await createVault(title, description);
        dispatch(showNotice('Vault opened.'));
      } else if (vault) {
        await updateVault(vault.id, title, description);
        dispatch(showNotice('Vault updated.'));
      }
      setFormOpen(false);
      await load();
    } catch (error) {
      dispatch(showNotice(errorText(error)));
    } finally {
      setBusy(false);
    }
  };

  const publish = async (dropId: string): Promise<void> => {
    try {
      await publishDrop(dropId);
      dispatch(showNotice('Drop published.'));
      await load();
    } catch (error) {
      dispatch(showNotice(errorText(error)));
    }
  };

  const remove = async (dropId: string): Promise<void> => {
    try {
      await deleteDrop(dropId);
      dispatch(showNotice('Drop removed.'));
      await load();
    } catch (error) {
      dispatch(showNotice(errorText(error)));
    }
  };

  if (phase === 'loading') {
    return (
      <View style={[styles.screen, styles.centered, { backgroundColor: t.background, paddingTop: insets.top }]}>
        <ActivityIndicator color={t.textPrimary} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: t.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + space.md,
            paddingBottom: dockBottomPadding(insets.bottom),
          },
        ]}
      >
        <Text allowFontScaling={false} style={[styles.brand, { color: t.textPrimary }]}>
          Vault
        </Text>
        <Text allowFontScaling={false} style={[styles.tagline, { color: t.textSecondary }]}>
          Follow creators beyond the feed.
        </Text>

        {vault ? (
          <>
            <View
              style={[
                styles.spaceCard,
                {
                  backgroundColor: t.surface,
                  borderColor: t.border,
                  shadowColor: t.shadowColor,
                  shadowOpacity: t.scheme === 'light' ? 0.08 : 0,
                },
              ]}
            >
              <Text allowFontScaling={false} style={[styles.spaceKicker, { color: t.textMuted }]}>
                YOUR SPACE
              </Text>
              <Text allowFontScaling={false} style={[styles.spaceTitle, { color: t.textPrimary }]}>
                {vault.title}
              </Text>
              {vault.description ? (
                <Text allowFontScaling={false} style={[styles.spaceBody, { color: t.textSecondary }]}>
                  {vault.description}
                </Text>
              ) : null}

              <View style={styles.actions}>
                <GlowButton
                  label="New Drop"
                  icon={PlusIcon}
                  tone="light"
                  compact
                  onPress={() => router.push('/vault/compose')}
                />
                <GlowButton
                  label="Manage"
                  icon={EditIcon}
                  tone="ink"
                  compact
                  onPress={() => {
                    setFormMode('edit');
                    setFormOpen(true);
                  }}
                />
              </View>
            </View>

            {drops.length === 0 ? (
              <EmptyState
                icon={VaultIcon}
                title="Your Vault is ready"
                body={"Share something your followers won't find in Arena."}
                actionLabel="Create first Drop"
                onAction={() => router.push('/vault/compose')}
              />
            ) : (
              <View style={styles.list}>
                <Text allowFontScaling={false} style={[styles.sectionLabel, { color: t.textMuted }]}>
                  Drops · disappear after 7 days
                </Text>
                {drops.map((drop) => (
                  <CreatorDropRow
                    key={drop.id}
                    drop={drop}
                    onOpen={() => router.push(`/vault/drop/${drop.id}`)}
                    onPublish={drop.status === 'draft' ? () => void publish(drop.id) : undefined}
                    onRemove={() => void remove(drop.id)}
                  />
                ))}
              </View>
            )}
          </>
        ) : (
          <EmptyState
            icon={VaultIcon}
            title="Open your Vault"
            body={"A private space for free moments, subscriber Drops, and permanent Collections."}
            actionLabel="Create Vault"
            onAction={() => {
              setFormMode('create');
              setFormOpen(true);
            }}
          />
        )}

        {!vault && profile ? (
          <Text allowFontScaling={false} style={[styles.hint, { color: t.textMuted }]}>
            Visit creators from Explore or Profile to enter their Vaults.
          </Text>
        ) : null}
      </ScrollView>

      <VaultFormSheet
        visible={formOpen}
        mode={formMode}
        initialTitle={vault?.title ?? ''}
        initialDescription={vault?.description ?? ''}
        busy={busy}
        onClose={() => setFormOpen(false)}
        onSubmit={(title, description) => void submitVault(title, description)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { justifyContent: 'center', alignItems: 'center' },
  content: { paddingHorizontal: layout.screenX, gap: space.md },
  brand: { ...typeScale.display },
  tagline: { ...typeScale.body, marginTop: -4 },
  spaceCard: {
    gap: space.sm,
    padding: space.lg,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
    marginTop: space.sm,
  },
  spaceKicker: { ...typeScale.caption, letterSpacing: 0.8 },
  spaceTitle: { ...typeScale.title },
  spaceBody: { ...typeScale.body },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs },
  list: { gap: space.md, marginTop: space.sm },
  sectionLabel: { ...typeScale.meta },
  hint: { ...typeScale.meta, textAlign: 'center', marginTop: space.md },
});
