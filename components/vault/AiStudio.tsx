import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  fetchMyCreatorAi,
  removeCreatorAiKnowledge,
  saveCreatorAiProfile,
  addCreatorAiKnowledge,
} from '../../services/creatorAiService';
import type { CreatorAiConfig } from '../../services/creatorAiMappers';
import { fetchMyVault } from '../../services/vaultService';
import { fetchCollections } from '../../services/vaultService';
import { fetchStorefront } from '../../services/vaultService';
import { fetchCreatorCourses } from '../../services/vaultCommerceService';
import { aiDisclosureLabel } from '../../utils/creatorAiState';
import { errorText } from '../../services/supabaseClient';
import {
  disconnectCreatorDigitalVersion,
  saveCreatorDigitalVersion,
} from '../../services/digitalCreatorService';
import type { SaveDigitalCreatorInput } from '../../services/digitalCreatorMappers';
import { showNotice, useClash } from '../../store';
import { space, typeScale, useThemeColors } from '../../theme';
import { SparklesIcon } from '../shared/icons';
import { VaultActionButton } from './VaultActionButton';
import { AiProfileFormSheet } from './ai/AiProfileFormSheet';
import { DigitalCreatorConnectSheet } from './ai/DigitalCreatorConnectSheet';
import { DigitalVersionPanel } from './ai/DigitalVersionPanel';
import { AiKnowledgeSheet, type AiKnowledgeSource } from './ai/AiKnowledgeSheet';

type Phase = 'loading' | 'ready';

/** Creator Studio → AI: one configuration, a short knowledge list, honest states. */
export function AiStudio(): React.JSX.Element {
  const { dispatch } = useClash();
  const router = useRouter();
  const t = useThemeColors();

  const [phase, setPhase] = React.useState<Phase>('loading');
  const [config, setConfig] = React.useState<CreatorAiConfig | null>(null);
  const [sources, setSources] = React.useState<AiKnowledgeSource[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [profileOpen, setProfileOpen] = React.useState(false);
  const [knowledgeOpen, setKnowledgeOpen] = React.useState(false);
  const [digitalOpen, setDigitalOpen] = React.useState(false);
  const [creatorId, setCreatorId] = React.useState<string | null>(null);

  const load = React.useCallback(async (): Promise<void> => {
    try {
      const [mine, vault] = await Promise.all([fetchMyCreatorAi(), fetchMyVault()]);
      setConfig(mine);
      if (!vault) {
        setSources([]);
        return;
      }
      setCreatorId(vault.creatorId);
      const [collections, courses, storefront] = await Promise.all([
        fetchCollections(vault.id),
        fetchCreatorCourses(vault.creatorId),
        fetchStorefront(vault.id),
      ]);
      setSources([
        ...storefront
          .filter((drop) => drop.status === 'published')
          .slice(0, 12)
          .map((drop) => ({ id: drop.id, kind: 'VAULT_DROP' as const, label: drop.caption })),
        ...collections.map((entry) => ({
          id: entry.id,
          kind: 'COLLECTION' as const,
          label: entry.title,
        })),
        ...courses.map((entry) => ({ id: entry.id, kind: 'COURSE' as const, label: entry.title })),
      ]);
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

  const run = async (work: () => Promise<unknown>, notice?: string): Promise<void> => {
    setBusy(true);
    try {
      await work();
      if (notice) dispatch(showNotice(notice));
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


  const enabled = config?.hasProfile === true && config.enabled;
  const knowledge = config?.knowledge ?? [];

  return (
    <View style={styles.wrap}>
      <Text allowFontScaling={false} style={[styles.section, { color: t.textMuted }]}>
        CREATOR AI
      </Text>
      <Text allowFontScaling={false} style={[styles.blurb, { color: t.textSecondary }]}>
        An AI version of you, built only from material you approve. Fans always see that it is an
        AI, and it never speaks as you.
      </Text>

      {config?.hasProfile ? (
        <View style={[styles.row, { borderColor: t.border, backgroundColor: t.surface }]}>
          <View style={styles.rowHead}>
            <SparklesIcon size={15} color={t.textSecondary} strokeWidth={2.2} />
            <Text allowFontScaling={false} style={[styles.rowTitle, { color: t.textPrimary }]}>
              {config.displayName}
            </Text>
          </View>
          <Text allowFontScaling={false} style={[styles.rowMeta, { color: t.textMuted }]}>
            {[
              enabled ? 'Live for fans' : 'Switched off',
              config.access === 'SUBSCRIBER' ? 'Members only' : 'Open to everyone',
              `${knowledge.length} knowledge ${knowledge.length === 1 ? 'entry' : 'entries'}`,
            ].join(' · ')}
          </Text>
          <View style={styles.rowActions}>
            <VaultActionButton
              label={busy ? 'Saving…' : enabled ? 'Switch off' : 'Switch on'}
              tone={enabled ? 'quiet' : 'solid'}
              compact
              onPress={() =>
                void run(
                  () =>
                    saveCreatorAiProfile({
                      displayName: config.displayName,
                      description: config.description,
                      welcomeMessage: config.welcomeMessage,
                      instructions: config.instructions,
                      access: config.access,
                      starters: config.starters,
                      enabled: !enabled,
                      artworkMediaObjectId: config.artworkMediaObjectId,
                    }),
                  enabled ? 'AI switched off.' : 'AI is live.',
                )
              }
            />
            {creatorId ? (
              <VaultActionButton
                label="Preview"
                tone="quiet"
                compact
                onPress={() => router.push(`/vault/ai/${creatorId}`)}
              />
            ) : null}
          </View>
        </View>
      ) : (
        <Text allowFontScaling={false} style={[styles.empty, { color: t.textMuted }]}>
          You have not created your AI yet.
        </Text>
      )}

      <View style={styles.rowActions}>
        <VaultActionButton
          label={config?.hasProfile ? 'Edit configuration' : 'Create your AI'}
          onPress={() => setProfileOpen(true)}
        />
        <VaultActionButton
          label="Add knowledge"
          tone="quiet"
          compact
          onPress={() => setKnowledgeOpen(true)}
        />
      </View>

      {config?.hasProfile ? (
        <DigitalVersionPanel
          config={config.digital}
          displayName={config.displayName}
          creatorName={config.displayName}
          busy={busy}
          onConnect={() => setDigitalOpen(true)}
          onPreview={() => {
            if (creatorId) router.push(`/vault/ai/${creatorId}`);
          }}
          onDisconnect={() =>
            void run(
              () => disconnectCreatorDigitalVersion(),
              'Digital version disconnected. Text AI still works.',
            )
          }
        />
      ) : null}

      {knowledge.length > 0 ? (
        <View style={styles.list}>
          {knowledge.map((entry) => (
            <View
              key={entry.id}
              style={[styles.knowledge, { borderColor: t.border, backgroundColor: t.surface }]}
            >
              <Text
                allowFontScaling={false}
                style={[styles.rowTitle, { color: t.textPrimary }]}
                numberOfLines={1}
              >
                {entry.title}
              </Text>
              <Text
                allowFontScaling={false}
                style={[styles.rowMeta, { color: t.textMuted }]}
                numberOfLines={2}
              >
                {[
                  entry.kind,
                  entry.access === 'SUBSCRIBER' ? 'Members' : 'Free',
                  (entry.body ?? 'From your Vault').slice(0, 120),
                ].join(' · ')}
              </Text>
              <VaultActionButton
                label="Remove"
                tone="quiet"
                compact
                onPress={() => void run(() => removeCreatorAiKnowledge(entry.id), 'Knowledge removed.')}
              />
            </View>
          ))}
        </View>
      ) : null}

      <AiProfileFormSheet
        visible={profileOpen}
        busy={busy}
        config={config}
        onClose={() => setProfileOpen(false)}
        onSubmit={(input) => {
          setProfileOpen(false);
          void run(() => saveCreatorAiProfile(input), 'AI saved.');
        }}
      />

      <AiKnowledgeSheet
        visible={knowledgeOpen}
        busy={busy}
        sources={sources}
        onClose={() => setKnowledgeOpen(false)}
        onSubmit={(input) => {
          setKnowledgeOpen(false);
          void run(() => addCreatorAiKnowledge(input), 'Knowledge added.');
        }}
      />

      {config?.hasProfile ? (
        <DigitalCreatorConnectSheet
          visible={digitalOpen}
          busy={busy}
          config={config.digital}
          displayName={config.displayName}
          onClose={() => setDigitalOpen(false)}
          onSubmit={(input: SaveDigitalCreatorInput) => {
            setDigitalOpen(false);
            void run(() => saveCreatorDigitalVersion(input), 'Digital version saved.');
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  center: { paddingVertical: space.xl, alignItems: 'center' },
  section: { ...typeScale.caption, letterSpacing: 0.8 },
  blurb: { ...typeScale.meta, fontSize: 13, lineHeight: 18 },
  empty: { ...typeScale.meta },
  row: { gap: space.sm, padding: space.md, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  rowTitle: { ...typeScale.cardTitle, flex: 1 },
  rowMeta: { ...typeScale.meta },
  rowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  list: { gap: space.sm },
  knowledge: { gap: 4, padding: space.md, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
});
