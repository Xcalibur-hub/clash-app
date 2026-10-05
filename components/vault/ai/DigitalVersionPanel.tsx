import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { DigitalCreatorConfig } from '../../../services/digitalCreatorMappers';
import { digitalCapabilityRows, digitalDisclosurePlate } from '../../../utils/digitalCreatorState';
import { radius, space, typeScale, useThemeColors } from '../../../theme';
import { VaultActionButton } from '../VaultActionButton';

export interface DigitalVersionPanelProps {
  config: DigitalCreatorConfig;
  displayName: string;
  creatorName: string | null;
  busy: boolean;
  onConnect: () => void;
  onPreview: () => void;
  onDisconnect: () => void;
}

/**
 * Creator Studio → DIGITAL VERSION.
 *
 * Deliberately not a provider dashboard: a connection line, three independent
 * capability rows, a preview and a disconnect. Disconnecting stops avatar
 * sessions immediately while text AI keeps working.
 */
export function DigitalVersionPanel({
  config,
  displayName,
  creatorName,
  busy,
  onConnect,
  onPreview,
  onDisconnect,
}: DigitalVersionPanelProps): React.JSX.Element {
  const t = useThemeColors();
  const rows = digitalCapabilityRows(config);
  const plate = digitalDisclosurePlate(config.displayName ?? displayName, creatorName);

  return (
    <View style={[styles.wrap, { borderColor: t.border }]}>
      <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
        DIGITAL VERSION
      </Text>

      {config.connected ? (
        <>
          <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
            {config.displayName ?? plate}
          </Text>
          <Text allowFontScaling={false} style={[styles.body, { color: t.textSecondary }]}>
            Provider connected. CLASH does not train or clone your likeness: rendering happens with
            the model you authorized.
          </Text>

          <View style={styles.rows}>
            {rows.map((row) => (
              <View key={row.key} style={styles.row}>
                <Text allowFontScaling={false} style={[styles.rowLabel, { color: t.textSecondary }]}>
                  {row.label}
                </Text>
                <Text
                  allowFontScaling={false}
                  style={[styles.rowValue, { color: row.on ? t.textPrimary : t.textMuted }]}
                >
                  {row.on ? 'ON' : 'OFF'}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.actions}>
            <VaultActionButton label="Preview" tone="quiet" compact onPress={onPreview} />
            <VaultActionButton label="Configure" tone="quiet" compact onPress={onConnect} />
            <VaultActionButton
              label={busy ? 'Disconnecting…' : 'Disconnect'}
              tone="quiet"
              compact
              onPress={onDisconnect}
            />
          </View>
        </>
      ) : (
        <>
          <Text allowFontScaling={false} style={[styles.body, { color: t.textSecondary }]}>
            Bring your AI to life with your authorized avatar and voice.
          </Text>
          <VaultActionButton label="Connect" compact onPress={onConnect} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: space.md },
  kicker: { ...typeScale.caption, fontSize: 10, fontWeight: '800', letterSpacing: 1.6 },
  title: { ...typeScale.section, fontSize: 18, fontWeight: '800' },
  body: { ...typeScale.meta, fontSize: 13, lineHeight: 18 },
  rows: { gap: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  rowLabel: { ...typeScale.meta, fontSize: 13 },
  rowValue: { ...typeScale.caption, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
