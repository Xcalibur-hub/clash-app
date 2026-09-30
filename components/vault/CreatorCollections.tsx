import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
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
import { duration, layout, radius, space, typeScale, useThemeColors } from '../../theme';
import { dockBottomPadding } from '../navigation/dockConfig';
import { EmptyState } from '../shared/EmptyState';
import { GlowButton } from '../shared/GlowButton';
import { PlusIcon, VaultIcon } from '../shared/icons';

type Phase = 'loading' | 'ready';

/**
 * Creator Collections — permanent chapters. Backend remains authoritative.
 */
export function CreatorCollections(): React.JSX.Element {
  const { dispatch } = useClash();
  const insets = useSafeAreaInsets();
  const t = useThemeColors();

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
      <View style={[styles.screen, styles.centered, { backgroundColor: t.background, paddingTop: insets.top }]}>
        <ActivityIndicator color={t.textPrimary} />
      </View>
    );
  }

  if (!vault) {
    return (
      <View style={[styles.screen, { backgroundColor: t.background, paddingTop: insets.top }]}>
        <EmptyState
          icon={VaultIcon}
          title="Open your Vault first"
          body="Collections are permanent chapters inside your Vault."
        />
      </View>
    );
  }

  const pickerCollection = collections.find((collection) => collection.id === pickerFor) ?? null;

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
          Collections
        </Text>
        <Text allowFontScaling={false} style={[styles.tagline, { color: t.textSecondary }]}>
          Permanent chapters. Drops expire — these stay.
        </Text>

        <View style={styles.newRow}>
          <TextInput
            value={newTitle}
            onChangeText={setNewTitle}
            maxLength={80}
            placeholder="New Collection title"
            placeholderTextColor={t.textMuted}
            accessibilityLabel="New Collection title"
            style={[
              styles.input,
              {
                color: t.textPrimary,
                borderColor: t.border,
                backgroundColor: t.inputBackground,
              },
            ]}
            onSubmitEditing={() => void create()}
          />
          <GlowButton label="Create" icon={PlusIcon} tone="light" compact onPress={() => void create()} />
        </View>

        {collections.length === 0 ? (
          <EmptyState
            icon={VaultIcon}
            title="No Collections yet"
            body="Group your best Drops into a lasting photo essay."
          />
        ) : (
          <View style={styles.list}>
            {collections.map((collection) => {
              const drops = dropsFor(collection.id);
              return (
                <View
                  key={collection.id}
                  style={[
                    styles.card,
                    {
                      backgroundColor: t.surface,
                      borderColor: t.border,
                      shadowColor: t.shadowColor,
                      shadowOpacity: t.scheme === 'light' ? 0.06 : 0,
                    },
                  ]}
                >
                  <View style={styles.cardHead}>
                    <View style={styles.cardHeadText}>
                      <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
                        COLLECTION
                      </Text>
                      <Text
                        allowFontScaling={false}
                        style={[styles.cardTitle, { color: t.textPrimary }]}
                        numberOfLines={1}
                      >
                        {collection.title}
                      </Text>
                      <Text allowFontScaling={false} style={[styles.cardMeta, { color: t.textMuted }]}>
                        {drops.length === 1 ? '1 moment' : `${drops.length} moments`}
                      </Text>
                    </View>
                    <GlowButton label="Add" tone="ink" compact onPress={() => setPickerFor(collection.id)} />
                  </View>

                  {drops.length > 0 ? (
                    <View style={styles.items}>
                      {drops.map((drop) => (
                        <View key={drop.id} style={styles.item}>
                          <Text
                            allowFontScaling={false}
                            style={[styles.itemText, { color: t.textSecondary }]}
                            numberOfLines={1}
                          >
                            {drop.caption}
                          </Text>
                          <Pressable
                            onPress={() => void remove(collection.id, drop.id)}
                            accessibilityRole="button"
                            accessibilityLabel="Remove from collection"
                            hitSlop={8}
                          >
                            <Text allowFontScaling={false} style={[styles.removeText, { color: t.danger }]}>
                              Remove
                            </Text>
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text allowFontScaling={false} style={[styles.empty, { color: t.textMuted }]}>
                      Nothing saved yet.
                    </Text>
                  )}
                </View>
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

function AddDropSheet({
  collectionTitle,
  drops,
  onAdd,
  onClose,
}: {
  collectionTitle: string;
  drops: readonly StorefrontDrop[];
  onAdd: (dropId: string) => void;
  onClose: () => void;
}): React.JSX.Element {
  const t = useThemeColors();
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(duration.fast)} style={[styles.scrim, { backgroundColor: t.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <Animated.View entering={FadeInUp.duration(duration.base)} style={styles.box}>
          <View
            style={[
              styles.sheetCard,
              {
                backgroundColor: t.surfaceElevated,
                borderColor: t.border,
              },
            ]}
          >
            <Text allowFontScaling={false} style={[styles.sheetTitle, { color: t.textPrimary }]}>
              Add to {collectionTitle}
            </Text>
            {drops.length === 0 ? (
              <Text allowFontScaling={false} style={[styles.empty, { color: t.textMuted }]}>
                No Drops left to add.
              </Text>
            ) : (
              drops.map((drop) => (
                <View key={drop.id} style={styles.item}>
                  <Text
                    allowFontScaling={false}
                    style={[styles.itemText, { color: t.textSecondary }]}
                    numberOfLines={1}
                  >
                    {drop.caption}
                  </Text>
                  <Pressable
                    onPress={() => {
                      onAdd(drop.id);
                      onClose();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${drop.caption}`}
                    hitSlop={8}
                  >
                    <Text allowFontScaling={false} style={[styles.addText, { color: t.textPrimary }]}>
                      Add
                    </Text>
                  </Pressable>
                </View>
              ))
            )}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { justifyContent: 'center', alignItems: 'center' },
  content: { paddingHorizontal: layout.screenX, gap: space.md },
  brand: { ...typeScale.display },
  tagline: { ...typeScale.body, marginTop: -4 },
  newRow: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  input: {
    flex: 1,
    ...typeScale.body,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  list: { gap: space.md },
  card: {
    gap: space.sm,
    padding: space.md,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 1,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  cardHeadText: { flex: 1, gap: 2 },
  kicker: { ...typeScale.caption, letterSpacing: 0.8 },
  cardTitle: { ...typeScale.section },
  cardMeta: { ...typeScale.meta },
  items: { gap: space.xs },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  itemText: { ...typeScale.meta, flex: 1 },
  removeText: { ...typeScale.label },
  addText: { ...typeScale.label, fontWeight: '600' },
  empty: { ...typeScale.meta },
  scrim: { flex: 1, justifyContent: 'flex-end' },
  box: { paddingHorizontal: space.md, paddingBottom: space.md },
  sheetCard: {
    gap: space.sm,
    padding: space.xl,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sheetTitle: { ...typeScale.section },
});
