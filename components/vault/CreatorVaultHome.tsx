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
import { color, ink, layout, space, typeScale } from '../../theme';
import { EmptyState } from '../shared/EmptyState';
import { GlowButton } from '../shared/GlowButton';
import { EditIcon, PlusIcon, VaultIcon } from '../shared/icons';
import { CreatorDropRow } from './CreatorDropRow';
import { VaultFormSheet } from './VaultFormSheet';

type Phase = 'loading' | 'ready';

/**
 * The creator's own Vault (the "Drops" tab). No Vault yet → a Create CTA; a
 * Vault → its title, a New Drop entry, and the owner's list of Drops with
 * publish/remove actions. Ownership and expiry stay server-authoritative.
 */
export function CreatorVaultHome(): React.JSX.Element {
  const { dispatch } = useClash();
  const router = useRouter();
  const insets = useSafeAreaInsets();

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
      <View style={[styles.screen, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator color="#FFFFFF" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.md }]}
      >
        <Text allowFontScaling={false} style={styles.kicker}>YOUR VAULT</Text>
        <Text allowFontScaling={false} style={styles.title}>
          {vault ? vault.title : `Welcome, ${profile?.name ?? 'creator'}`}
        </Text>
        {vault?.description ? (
          <Text allowFontScaling={false} style={styles.description}>{vault.description}</Text>
        ) : null}

        {vault ? (
          <>
            <View style={styles.actions}>
              <GlowButton label="New Drop" icon={PlusIcon} tone="light" compact onPress={() => router.push('/vault/compose')} />
              <GlowButton
                label="Edit"
                icon={EditIcon}
                tone="ink"
                compact
                onPress={() => {
                  setFormMode('edit');
                  setFormOpen(true);
                }}
              />
            </View>

            {drops.length === 0 ? (
              <EmptyState icon={VaultIcon} title="No Drops yet" body="Create your first Drop to start your Vault." />
            ) : (
              <View style={styles.list}>
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
            body="A Vault is your own content space: free Drops, subscriber-only Drops, and permanent Collections."
            actionLabel="Create Vault"
            onAction={() => {
              setFormMode('create');
              setFormOpen(true);
            }}
          />
        )}
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
  screen: { flex: 1, backgroundColor: color.bg },
  centered: { justifyContent: 'center' },
  content: { paddingHorizontal: layout.screenX, gap: space.md, paddingBottom: space.xxl },
  kicker: { ...typeScale.eyebrow, color: ink.tertiary },
  title: { ...typeScale.title, color: ink.primary },
  description: { ...typeScale.body, color: ink.secondary },
  actions: { flexDirection: 'row', gap: space.sm },
  list: { gap: space.md },
});

