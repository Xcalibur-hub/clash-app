import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { LivePermissions } from '../../../services/creatorLiveMappers';
import {
  liveActionLabel,
  interactionTypeLabel,
  type LiveActionKind,
  type LiveInteractionType,
} from '../../../utils/creatorLiveState';
import { radius, space, typeScale, useThemeColors } from '../../../theme';
import { PillPicker } from '../PillPicker';
import { VaultActionButton } from '../VaultActionButton';

export interface LiveInteractionDraft {
  type: LiveInteractionType;
  prompt: string;
  options: { id: string; label: string }[] | null;
  actionKind: LiveActionKind | null;
  threshold: number | null;
  durationSeconds: number | null;
}

export interface LiveInteractionFormSheetProps {
  visible: boolean;
  busy?: boolean;
  permissions: LivePermissions;
  onClose: () => void;
  onSubmit: (draft: LiveInteractionDraft) => void;
}

const ACTION_KINDS: readonly LiveActionKind[] = [
  'LIGHTS_OFF',
  'LIGHTS_ON',
  'OPEN_LEFT_DOOR',
  'OPEN_RIGHT_DOOR',
  'FOG_BURST',
  'MUSIC_STING',
  'CAMERA_CUT',
  'HOLD_FRAME',
];

const DURATIONS: readonly number[] = [30, 60, 120];

/** Server-safe option id: [a-z0-9_] only — never a free-form payload. */
export function liveOptionId(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);
}

function allowedTypes(permissions: LivePermissions): LiveInteractionType[] {
  const out: LiveInteractionType[] = [];
  if (permissions.polls) out.push('POLL');
  if (permissions.choices) out.push('CHOICE');
  if (permissions.gameActions) out.push('GAME_ACTION');
  if (permissions.crowdActions) out.push('CROWD_ACTION');
  return out.length > 0 ? out : ['POLL'];
}

/** Opens one interaction. The creator decides everything that can happen. */
export function LiveInteractionFormSheet({
  visible,
  busy = false,
  permissions,
  onClose,
  onSubmit,
}: LiveInteractionFormSheetProps): React.JSX.Element {
  const t = useThemeColors();
  const types = allowedTypes(permissions);
  const [type, setType] = React.useState<LiveInteractionType>(types[0] ?? 'POLL');
  const [prompt, setPrompt] = React.useState('');
  const [labels, setLabels] = React.useState<string[]>(['', '']);
  const [actionKind, setActionKind] = React.useState<LiveActionKind>('LIGHTS_OFF');
  const [threshold, setThreshold] = React.useState('3');
  const [duration, setDuration] = React.useState<number | null>(null);

  const crowd = type === 'CROWD_ACTION';
  const options = labels
    .map((label) => label.trim())
    .filter((label) => label.length > 0)
    .map((label) => ({ id: liveOptionId(label), label: label.slice(0, 40) }));
  const thresholdValue = Number.parseInt(threshold, 10);
  const canSave =
    !busy &&
    prompt.trim().length > 0 &&
    (crowd
      ? Number.isFinite(thresholdValue) && thresholdValue >= 2
      : options.length >= 2 && options.length <= 4);

  const save = (): void => {
    if (!canSave) return;
    onSubmit({
      type,
      prompt: prompt.trim().slice(0, 160),
      options: crowd ? null : options,
      actionKind: crowd ? actionKind : null,
      threshold: crowd ? thresholdValue : null,
      durationSeconds: duration,
    });
  };

  const inputStyle = [
    styles.input,
    { color: t.textPrimary, borderColor: t.border, backgroundColor: t.inputBackground },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close">
        <Pressable style={[styles.sheet, { backgroundColor: t.surfaceElevated, borderColor: t.border }]}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
            <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
              Open an interaction
            </Text>
            <PillPicker
              label="Type"
              options={types.map((value) => ({ value, label: interactionTypeLabel(value) }))}
              value={type}
              onChange={setType}
            />
            <TextInput
              value={prompt}
              onChangeText={setPrompt}
              maxLength={160}
              placeholder={crowd ? 'Turn the lights off' : 'Where should we film next?'}
              placeholderTextColor={t.textMuted}
              style={inputStyle}
            />

            {crowd ? (
              <>
                <PillPicker
                  label="Approved action"
                  options={ACTION_KINDS.map((value) => ({ value, label: liveActionLabel(value) }))}
                  value={actionKind}
                  onChange={setActionKind}
                />
                <TextInput
                  value={threshold}
                  onChangeText={(next) => setThreshold(next.replace(/[^0-9]/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  placeholder="Supports needed"
                  placeholderTextColor={t.textMuted}
                  style={inputStyle}
                />
              </>
            ) : (
              <View style={styles.options}>
                <Text allowFontScaling={false} style={[styles.label, { color: t.textMuted }]}>
                  OPTIONS
                </Text>
                {labels.map((label, index) => (
                  <TextInput
                    key={`option-${index}`}
                    value={label}
                    onChangeText={(next) =>
                      setLabels((current) => current.map((entry, i) => (i === index ? next : entry)))
                    }
                    maxLength={40}
                    placeholder={index === 0 ? 'Basement' : index === 1 ? 'Attic' : 'Another option'}
                    placeholderTextColor={t.textMuted}
                    style={inputStyle}
                  />
                ))}
                {labels.length < 4 ? (
                  <VaultActionButton
                    label="Add option"
                    tone="quiet"
                    compact
                    onPress={() => setLabels((current) => [...current, ''])}
                  />
                ) : null}
              </View>
            )}

            <PillPicker
              label="Closes"
              options={[
                { value: 'none', label: 'When I close it' },
                ...DURATIONS.map((value) => ({ value: String(value), label: `${value}s` })),
              ]}
              value={duration == null ? 'none' : String(duration)}
              onChange={(value) => setDuration(value === 'none' ? null : Number(value))}
            />

            <VaultActionButton label={busy ? 'Opening…' : 'Open it'} onPress={save} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    maxHeight: '88%',
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  body: { gap: space.md, padding: space.xl },
  title: { ...typeScale.section },
  label: { ...typeScale.caption, fontWeight: '800', letterSpacing: 0.8 },
  options: { gap: space.sm },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    ...typeScale.body,
  },
});

