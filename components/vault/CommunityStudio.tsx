import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import {
  createCommunity,
  fetchMyCommunity,
  setCommunityStatus,
  updateCommunity,
} from '../../services/vaultCommunityService';
import type { CommunitySettings } from '../../services/vaultCommunityMappers';
import { errorText } from '../../services/supabaseClient';
import { showNotice, useClash } from '../../store';
import { space, useThemeColors } from '../../theme';
import { CommunitySettingsSheet } from './CommunitySettingsSheet';
import { CommunityStudioCard } from './CommunityStudioCard';

type Phase = 'loading' | 'ready';

/** Simple Community management for the Creator Studio (§24). */
export function CommunityStudio(): React.JSX.Element {
  const { dispatch } = useClash();
  const t = useThemeColors();

  const [phase, setPhase] = React.useState<Phase>('loading');
  const [community, setCommunity] = React.useState<CommunitySettings | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async (): Promise<void> => {
    try {
      setCommunity(await fetchMyCommunity());
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

  const submit = async (input: {
    name: string;
    description: string;
    accessType: CommunitySettings['accessType'];
    pseudonymousEnabled: boolean;
    rules: string;
  }): Promise<void> => {
    setBusy(true);
    try {
      if (community) {
        await updateCommunity(community.id, input);
        dispatch(showNotice('Community updated.'));
      } else {
        await createCommunity(input);
        dispatch(showNotice('Community enabled.'));
      }
      setSheetOpen(false);
      await load();
    } catch (error) {
      dispatch(showNotice(errorText(error)));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (): Promise<void> => {
    if (!community) return;
    setBusy(true);
    try {
      await setCommunityStatus(community.id, community.status === 'active' ? 'disabled' : 'active');
      dispatch(showNotice(community.status === 'active' ? 'Community disabled.' : 'Community enabled.'));
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
      <CommunityStudioCard
        community={community}
        busy={busy}
        onEdit={() => setSheetOpen(true)}
        onToggle={() => void toggle()}
      />

      <CommunitySettingsSheet
        visible={sheetOpen}
        initial={community}
        busy={busy}
        onClose={() => setSheetOpen(false)}
        onSubmit={(input) => void submit(input)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  center: { paddingVertical: space.xl, alignItems: 'center' },
});
