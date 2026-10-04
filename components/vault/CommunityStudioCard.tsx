import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { CommunitySettings } from '../../services/vaultCommunityMappers';
import { communityAccessLabel } from '../../utils/vaultCommunityAccess';
import { space, typeScale, useThemeColors } from '../../theme';
import { CreatorsIcon } from '../shared/icons';
import { VaultActionButton } from './VaultActionButton';

export interface CommunityStudioCardProps {
  community: CommunitySettings | null;
  busy: boolean;
  onEdit: () => void;
  onToggle: () => void;
}

/** Presentational card for the Studio's Community tab. */
export function CommunityStudioCard({
  community,
  busy,
  onEdit,
  onToggle,
}: CommunityStudioCardProps): React.JSX.Element {
  const t = useThemeColors();
  const meta = community
    ? `${communityAccessLabel(community.accessType)} · ${
        community.status === 'active' ? 'Live' : 'Disabled'
      }${community.pseudonymousEnabled ? ' · Pseudonymous' : ''}`
    : '';
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
              {meta}
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
            onPress={onEdit}
            style={busy ? styles.disabled : undefined}
          />
          {community ? (
            <VaultActionButton
              label={community.status === 'active' ? 'Disable' : 'Enable'}
              tone="quiet"
              onPress={onToggle}
              style={busy ? styles.disabled : undefined}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  section: { ...typeScale.caption, letterSpacing: 0.8 },
  card: { gap: space.sm, padding: space.md, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  name: { ...typeScale.cardTitle, flex: 1 },
  meta: { ...typeScale.meta },
  body: { ...typeScale.meta, fontSize: 13, lineHeight: 18 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs },
  disabled: { opacity: 0.5 },
});
