import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  createCreatorWorldDrop,
  fetchMyCreatorWorldDrops,
  setCreatorWorldDropStatus,
} from '../../services/creatorWorldDropService';
import type { CreatorWorldDrop } from '../../services/creatorWorldDropMappers';
import { fetchMyVault, fetchStorefront } from '../../services/vaultService';
import { dropTypeLabel, rewardTypeLabel } from '../../utils/creatorWorldDrops';
import { errorText } from '../../services/supabaseClient';
import { showNotice, useClash } from '../../store';
import { space, typeScale, useThemeColors } from '../../theme';
import { WorldIcon } from '../shared/icons';
import { VaultActionButton } from './VaultActionButton';
import { WorldDropFormSheet, type WorldDropTarget } from './WorldDropFormSheet';

type Phase = 'loading' | 'ready';

/** Simple World Drops management for the Creator Studio (Phase 15.3). */
export function WorldDropsStudio(): React.JSX.Element {
  const { dispatch } = useClash();
  const router = useRouter();
  const t = useThemeColors();

  const [phase, setPhase] = React.useState<Phase>('loading');
  const [drops, setDrops] = React.useState<CreatorWorldDrop[]>([]);
  const [targets, setTargets] = React.useState<WorldDropTarget[]>([]);
  const [formOpen, setFormOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async (): Promise<void> => {
    try {
      const [mine, vault] = await Promise.all([fetchMyCreatorWorldDrops(), fetchMyVault()]);
      setDrops(mine);
      if (vault) {
        const storefront = await fetchStorefront(vault.id);
        setTargets(
          storefront
            .filter((drop) => drop.status === 'published')
            .map((drop) => ({ id: drop.id, caption: drop.caption })),
        );
      } else {
        setTargets([]);
      }
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

  const submit = async (input: Parameters<typeof createCreatorWorldDrop>[0]): Promise<void> => {
    setBusy(true);
    try {
      await createCreatorWorldDrop(input);
      dispatch(showNotice('World Drop placed.'));
      setFormOpen(false);
      await load();
    } catch (error) {
      dispatch(showNotice(errorText(error)));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (drop: CreatorWorldDrop): Promise<void> => {
    setBusy(true);
    try {
      await setCreatorWorldDropStatus(drop.id, drop.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED');
      await load();
    } catch (error) {
      dispatch(showNotice(errorText(error)));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (drop: CreatorWorldDrop): Promise<void> => {
    setBusy(true);
    try {
      await setCreatorWorldDropStatus(drop.id, 'REMOVED');
      await load();
    } catch (error) {
      dispatch(showNotice(errorText(error)));
    } finally {
      setBusy(false);
    }
  };

  if (phase === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={t.textMuted} />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text allowFontScaling={false} style={[styles.section, { color: t.textMuted }]}>
        WORLD DROPS
      </Text>
      <Text allowFontScaling={false} style={[styles.blurb, { color: t.textSecondary }]}>
        Hide something in CLASH World. Fans discover it, claim it, and the reward leads back here.
      </Text>
      <VaultActionButton label="Place a World Drop" onPress={() => setFormOpen(true)} />

      {drops.length === 0 ? (
        <Text allowFontScaling={false} style={[styles.empty, { color: t.textMuted }]}>
          Nothing hidden yet.
        </Text>
      ) : (
        <View style={styles.list}>
          {drops.map((drop) => (
            <View key={drop.id} style={[styles.row, { borderColor: t.border, backgroundColor: t.surface }]}>
              <View style={styles.rowHead}>
                <WorldIcon size={15} color={t.textSecondary} strokeWidth={2.2} />
                <Text allowFontScaling={false} style={[styles.rowTitle, { color: t.textPrimary }]} numberOfLines={1}>
                  {drop.caption}
                </Text>
              </View>
              <Text allowFontScaling={false} style={[styles.rowMeta, { color: t.textMuted }]} numberOfLines={1}>
                {[
                  dropTypeLabel(drop.dropType),
                  rewardTypeLabel(drop.rewardType),
                  drop.locationLabel,
                  drop.status === 'PUBLISHED' ? 'Live' : drop.status === 'REMOVED' ? 'Removed' : 'Draft',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              <View style={styles.rowActions}>
                <VaultActionButton
                  label="Open"
                  tone="quiet"
                  compact
                  onPress={() => router.push(`/world/drop/${drop.id}`)}
                />
                {drop.status !== 'REMOVED' ? (
                  <VaultActionButton
                    label={drop.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}
                    tone="quiet"
                    compact
                    onPress={() => void toggle(drop)}
                  />
                ) : null}
                {drop.status !== 'REMOVED' ? (
                  <VaultActionButton
                    label="Remove"
                    tone="quiet"
                    compact
                    onPress={() => void remove(drop)}
                  />
                ) : null}
              </View>
            </View>
          ))}
        </View>
      )}

      <WorldDropFormSheet
        visible={formOpen}
        busy={busy}
        targets={targets}
        onClose={() => setFormOpen(false)}
        onSubmit={(input) => void submit(input)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  center: { paddingVertical: space.xl, alignItems: 'center' },
  section: { ...typeScale.caption, letterSpacing: 0.8 },
  blurb: { ...typeScale.meta, fontSize: 13, lineHeight: 18 },
  empty: { ...typeScale.meta, marginTop: space.sm },
  list: { gap: space.sm, marginTop: space.sm },
  row: { gap: space.sm, padding: space.md, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  rowTitle: { ...typeScale.cardTitle, flex: 1 },
  rowMeta: { ...typeScale.meta },
  rowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});