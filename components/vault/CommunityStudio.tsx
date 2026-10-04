import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import {
  createCommunity,
  fetchMyCommunity,
  setCommunityStatus,
  updateCommunity,
} from '../../services/vaultCommunityService';
import type { CommunitySettings } from '../../services/vaultCommunityMappers';
import { communityAccessLabel } from '../../utils/vaultCommunityAccess';
import { errorText } from '../../services/supabaseClient';
import { showNotice, useClash } from '../../store';
import { space, typeScale, useThemeColors } from '../../theme';
import { CreatorsIcon } from '../shared/icons';
import { CommunitySettingsSheet } from './CommunitySettingsSheet';
import { VaultActionButton } from './VaultActionButton';

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
      <Text allowFontScaling={false} style={[styles.section, { color: t.textMuted }]}>
        COMMUNITY
      </Text>
      <View style={[styles.card, { borderColor: t.border, backgroundColor: t.surface }]}>
        <View style={styles.head}>
          <CreatorsIcon size={18} color={t.textSecondary} strokeWidth={2.2} />
          <Text allowFontScaling={false} style={[styles.name, { color: t.textPrimary }]} numberOfLines={1}>
            {community ? community.name : 'No community yet'}
          </Text>
        </View>
        {community ? (
          <>
            <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]}>
              {`${communityAccessLabel(community.accessType)} · ${community.status === 'active' ? 'Live' : 'Disabled'}${
                community.pseudonymousEnabled ? ' · Pseudonymous' : ''
              }`}
            </Text>
            {community.description ? (
              <Text allowFontScaling={false} style={[styles.body, { color: t.textSecondary }]} numberOfLines={2}>
                {community.description}
              </Text>
            ) : null}
          </>
        ) : (
          <Text allowFontScaling={false} style={[styles.body, { color: t.textSecondary }]}>
            Give your fans a room inside your world — announcements and discussion.
          </Text>
        )}
        <View style={styles.actions}>
          <VaultActionButton
            label={community ? 'Edit' : 'Enable community'}
            onPress={() => setSheetOpen(true)}
          />
          {community ? (
            <VaultActionButton
              label={community.status === 'active' ? 'Disable' : 'Enable'}
              tone="quiet"
              onPress={() => void toggle()}
            />
          ) : null}
        </View>
      </View>

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
  section: { ...typeScale.caption, letterSpacing: 0.8 },
  card: { gap: space.sm, padding: space.md, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  name: { ...typeScale.cardTitle, flex: 1 },
  meta: { ...typeScale.meta },
  body: { ...typeScale.meta, fontSize: 13, lineHeight: 18 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs },
});
