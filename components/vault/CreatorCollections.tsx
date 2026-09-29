import React from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { showNotice, useClash } from '../../store';
import {
  addToCollection,
  createCollection,
  fetchCollections,
  fetchMyVault,
  fetchStorefront,
  removeFromCollection,
} from '../../services/vaultService';
import type { CreatorVault, StorefrontDrop, VaultCollection } from '../../services/vaultMappers';
import { errorText } from '../../services/supabaseClient';
import { color, ink, layout, radius, space, typeScale } from '../../theme';
import { EmptyState } from '../shared/EmptyState';
import { GlassCard } from '../shared/GlassCard';
import { GlowButton } from '../shared/GlowButton';
import { PlusIcon, VaultIcon } from '../shared/icons';

type Phase = 'loading' | 'ready';

/**
 * The creator's Collections tab: create a permanent Collection and curate Drops
 * into it. An expired Drop can be added on purpose — that is what permanence
 * means — and the backend remains the only authority.
 */
export function CreatorCollections(): React.JSX.Element {
  const { dispatch } = useClash();
  const insets = useSafeAreaInsets();

  const [phase, setPhase] = React.useState<Phase>('loading');
  const [vault, setVault] = React.useState<CreatorVault | null>(null);
  const [collections, setCollections] = React.useState<VaultCollection[]>([]);
  const [storefront, setStorefront] = React.useState<StorefrontDrop[]>([]);
  const [newTitle, setNewTitle] = React.useState('');
  const [pickerFor, setPickerFor] = React.useState<string | null>(null);

  const load = React.useCallback(async (): Promise<void> => {
    try {
      const mine = await fetchMyVault();
      setVault(mine);
      if (!mine) {
        setCollections([]);
        setStorefront([]);
        return;
      }
      const [cols, drops] = await Promise.all([fetchCollections(mine.id), fetchStorefront(mine.id)]);
      setCollections(cols);
      setStorefront(drops);
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

  const create = async (): Promise<void> => {
    if (!vault || newTitle.trim().length === 0) return;
    try {
      await createCollection(vault.id, newTitle.trim());
      setNewTitle('');
      dispatch(showNotice('Collection created.'));
      await load();
    } catch (error) {
      dispatch(showNotice(errorText(error)));
    }
  };

  const add = async (collectionId: string, dropId: string): Promise<void> => {
    try {
      await addToCollection(collectionId, dropId);
      await load();
    } catch (error) {
      dispatch(showNotice(errorText(error)));
    }
  };

  const remove = async (collectionId: string, dropId: string): Promise<void> => {
    try {
      await removeFromCollection(collectionId, dropId);
      dispatch(showNotice('Removed from Collection.'));
      await load();
    } catch (error) {
      dispatch(showNotice(errorText(error)));
    }
  };

  const dropsFor = (collectionId: string): StorefrontDrop[] =>
    storefront.filter((drop) => drop.collectionIds.includes(collectionId));

  if (phase === 'loading') {
    return (
      <View style={[styles.screen, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator color="#FFFFFF" />
      </View>
    );
  }

  if (!vault) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <EmptyState icon={VaultIcon} title="No Vault yet" body="Open your Vault before curating Collections." />
      </View>
    );
  }

  const pickerCollection = collections.find((collection) => collection.id === pickerFor) ?? null;

  return (
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.md }]}
      >
        <Text allowFontScaling={false} style={styles.kicker}>YOUR VAULT</Text>
        <Text allowFontScaling={false} style={styles.title}>Collections</Text>

        <View style={styles.newRow}>
          <TextInput
            value={newTitle}
            onChangeText={setNewTitle}
            maxLength={80}
            placeholder="New Collection title"
            placeholderTextColor={ink.quaternary}
            accessibilityLabel="New Collection title"
            style={styles.input}
            onSubmitEditing={() => void create()}
          />
          <GlowButton label="Create" icon={PlusIcon} tone="light" compact onPress={() => void create()} />
        </View>

        {collections.length === 0 ? (
          <EmptyState icon={VaultIcon} title="No Collections yet" body="Group your best Drops into permanent shelves." />
        ) : (
          <View style={styles.list}>
            {collections.map((collection) => {
              const drops = dropsFor(collection.id);
              return (
                <GlassCard key={collection.id} corner={radius.lg} contentStyle={styles.card}>
                  <View style={styles.cardHead}>
                    <View style={styles.cardHeadText}>
                      <Text allowFontScaling={false} style={styles.cardTitle} numberOfLines={1}>{collection.title}</Text>
                      <Text allowFontScaling={false} style={styles.cardMeta}>{drops.length} drop{drops.length === 1 ? '' : 's'}</Text>
                    </View>
                    <GlowButton label="Add Drop" tone="ink" compact onPress={() => setPickerFor(collection.id)} />
                  </View>

                  {drops.length > 0 ? (
                    <View style={styles.items}>
                      {drops.map((drop) => (
                        <View key={drop.id} style={styles.item}>
                          <Text allowFontScaling={false} style={styles.itemText} numberOfLines={1}>{drop.caption}</Text>
                          <Pressable
                            onPress={() => void remove(collection.id, drop.id)}
                            accessibilityRole="button"
                            accessibilityLabel="Remove from collection"
                            hitSlop={8}
                          >
                            <Text allowFontScaling={false} style={styles.removeText}>Remove</Text>
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text allowFontScaling={false} style={styles.empty}>Nothing saved yet.</Text>
                  )}
                </GlassCard>
              );
            })}
          </View>
        )}
      </ScrollView>

      {pickerCollection ? (
        <AddDropSheet
          collectionTitle={pickerCollection.title}
          drops={storefront.filter((drop) => !drop.collectionIds.includes(pickerCollection.id))}
          onAdd={(dropId) => void add(pickerCollection.id, dropId)}
          onClose={() => setPickerFor(null)}
        />
      ) : null}
    </View>
  );
}

function AddDropSheet({ collectionTitle, drops, onAdd, onClose }: {
  collectionTitle: string;
  drops: readonly StorefrontDrop[];
  onAdd: (dropId: string) => void;
  onClose: () => void;
}): React.JSX.Element {
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(160)} style={styles.scrim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <Animated.View entering={FadeInUp.duration(220)} style={styles.box}>
          <GlassCard corner={radius.xxl} contentStyle={styles.sheetCard}>
            <Text allowFontScaling={false} style={styles.sheetTitle}>Add to {collectionTitle}</Text>
            {drops.length === 0 ? (
              <Text allowFontScaling={false} style={styles.empty}>No Drops left to add.</Text>
            ) : (
              drops.map((drop) => (
                <View key={drop.id} style={styles.item}>
                  <Text allowFontScaling={false} style={styles.itemText} numberOfLines={1}>{drop.caption}</Text>
                  <Pressable
                    onPress={() => {
                      onAdd(drop.id);
                      onClose();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${drop.caption}`}
                    hitSlop={8}
                  >
                    <Text allowFontScaling={false} style={styles.addText}>Add</Text>
                  </Pressable>
                </View>
              ))
            )}
          </GlassCard>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  centered: { justifyContent: 'center' },
  content: { paddingHorizontal: layout.screenX, gap: space.md, paddingBottom: space.xxl },
  kicker: { ...typeScale.eyebrow, color: ink.tertiary },
  title: { ...typeScale.title, color: ink.primary },
  newRow: { flexDirection: 'row', gap: space.sm },
  input: {
    flex: 1,
    ...typeScale.body,
    color: ink.primary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  list: { gap: space.md },
  card: { gap: space.sm },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  cardHeadText: { flex: 1, gap: 2 },
  cardTitle: { ...typeScale.cardTitle, color: ink.primary },
  cardMeta: { ...typeScale.meta, color: ink.tertiary },
  items: { gap: space.xs },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  itemText: { ...typeScale.meta, color: ink.secondary, flex: 1 },
  removeText: { ...typeScale.label, color: '#F18A92' },
  addText: { ...typeScale.label, color: '#7BE3B8' },
  empty: { ...typeScale.meta, color: ink.quaternary },
  scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: color.scrim },
  box: { paddingHorizontal: space.md, paddingBottom: space.md },
  sheetCard: { gap: space.sm, padding: space.xl },
  sheetTitle: { ...typeScale.cardTitle, color: ink.primary },
});
