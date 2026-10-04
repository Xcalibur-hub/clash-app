import React from 'react';
import { Modal, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import type { CommunityAccessType, CommunitySettings } from '../../services/vaultCommunityMappers';
import { communityAccessLabel, communityAccessRule } from '../../utils/vaultCommunityAccess';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';
import { VaultActionButton } from './VaultActionButton';

const ACCESS_TYPES: readonly CommunityAccessType[] = ['public', 'followers', 'subscribers'];

export interface CommunitySettingsSheetProps {
  visible: boolean;
  initial: CommunitySettings | null;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (input: {
    name: string;
    description: string;
    accessType: CommunityAccessType;
    pseudonymousEnabled: boolean;
    rules: string;
  }) => void;
}

/** Create / edit form for a creator's community. */
export function CommunitySettingsSheet({
  visible,
  initial,
  busy = false,
  onClose,
  onSubmit,
}: CommunitySettingsSheetProps): React.JSX.Element {
  const t = useThemeColors();
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [accessType, setAccessType] = React.useState<CommunityAccessType>('public');
  const [pseudonymous, setPseudonymous] = React.useState(false);
  const [rules, setRules] = React.useState('');

  React.useEffect(() => {
    if (!visible) return;
    setName(initial?.name ?? '');
    setDescription(initial?.description ?? '');
    setAccessType(initial?.accessType ?? 'public');
    setPseudonymous(initial?.pseudonymousEnabled ?? false);
    setRules(initial?.rules ?? '');
  }, [visible, initial]);

  const canSave = name.trim().length > 0 && !busy;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close">
        <Animated.View entering={FadeIn.duration(120)} style={StyleSheet.absoluteFill}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]} />
        </Animated.View>
        <Animated.View entering={FadeInUp.duration(200)} style={styles.sheet}>
          <View style={[styles.card, { backgroundColor: t.surfaceElevated, borderColor: t.border }]}>
            <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
              {initial ? 'Community settings' : 'Open a community'}
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              maxLength={60}
              placeholder="Community name"
              placeholderTextColor={t.textMuted}
              style={[styles.input, { color: t.textPrimary, borderColor: t.border, backgroundColor: t.inputBackground }]}
            />
            <TextInput
              value={description}
              onChangeText={setDescription}
              maxLength={280}
              multiline
              placeholder="Short description"
              placeholderTextColor={t.textMuted}
              style={[
                styles.input,
                styles.textarea,
                { color: t.textPrimary, borderColor: t.border, backgroundColor: t.inputBackground },
              ]}
            />
            <Text allowFontScaling={false} style={[styles.label, { color: t.textMuted }]}>
              ACCESS
            </Text>
            <View style={styles.pills}>
              {ACCESS_TYPES.map((type) => (
                <Pressable
                  key={type}
                  onPress={() => {
                    hapticTap();
                    setAccessType(type);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={communityAccessLabel(type)}
                  style={[
                    styles.pill,
                    {
                      borderColor: accessType === type ? t.textPrimary : t.border,
                      backgroundColor: accessType === type ? t.surfaceMuted : 'transparent',
                    },
                  ]}
                >
                  <Text allowFontScaling={false} style={[styles.pillLabel, { color: t.textPrimary }]}>
                    {communityAccessLabel(type)}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text allowFontScaling={false} style={[styles.hint, { color: t.textMuted }]}>
              {communityAccessRule(accessType)}
            </Text>
            <View style={styles.switchRow}>
              <View style={styles.switchCopy}>
                <Text allowFontScaling={false} style={[styles.pillLabel, { color: t.textPrimary }]}>
                  Allow pseudonymous posting
                </Text>
                <Text allowFontScaling={false} style={[styles.hint, { color: t.textMuted }]}>
                  Members appear under a stable alias.
                </Text>
              </View>
              <Switch value={pseudonymous} onValueChange={setPseudonymous} />
            </View>
            <TextInput
              value={rules}
              onChangeText={setRules}
              maxLength={1000}
              multiline
              placeholder="House rules (optional)"
              placeholderTextColor={t.textMuted}
              style={[
                styles.input,
                styles.textarea,
                { color: t.textPrimary, borderColor: t.border, backgroundColor: t.inputBackground },
              ]}
            />
            <VaultActionButton
              label={busy ? 'Saving…' : initial ? 'Save changes' : 'Enable community'}
              onPress={() =>
                onSubmit({
                  name: name.trim(),
                  description: description.trim(),
                  accessType,
                  pseudonymousEnabled: pseudonymous,
                  rules: rules.trim(),
                })
              }
              style={canSave ? undefined : styles.disabled}
            />
          </View>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end' },
  sheet: { paddingHorizontal: space.md, paddingBottom: space.md },
  card: { gap: space.sm, padding: space.xl, borderRadius: radius.xxl, borderWidth: StyleSheet.hairlineWidth },
  title: { ...typeScale.section },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    ...typeScale.body,
  },
  textarea: { minHeight: 76, textAlignVertical: 'top' },
  label: { ...typeScale.caption, fontWeight: '800', letterSpacing: 0.8, marginTop: space.xs },
  pills: { flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' },
  pill: {
    paddingHorizontal: space.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pillLabel: { ...typeScale.label, fontWeight: '700' },
  hint: { ...typeScale.meta, fontSize: 12 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  switchCopy: { flex: 1, gap: 2 },
  disabled: { opacity: 0.5 },
});
