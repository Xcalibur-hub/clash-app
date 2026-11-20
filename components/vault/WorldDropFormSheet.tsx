import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { CreateWorldDropInput } from '../../services/creatorWorldDropService';
import { dropTypeLabel, rewardTypeLabel } from '../../utils/creatorWorldDrops';
import {
  WORLD_DESTINATION_PRESETS,
  WORLD_DROP_EXPIRY_DAYS,
  worldDropExpiryLabel,
} from '../../utils/worldDestinations';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { VaultActionButton } from './VaultActionButton';
import { PillPicker } from './PillPicker';

export interface WorldDropTarget {
  id: string;
  caption: string;
}

export interface WorldDropFormSheetProps {
  visible: boolean;
  busy?: boolean;
  targets: readonly WorldDropTarget[];
  onClose: () => void;
  onSubmit: (input: CreateWorldDropInput) => void;
}

const TYPES = ['SECRET_DROP', 'CHALLENGE', 'COLLECTIBLE', 'CREATOR_UNLOCK'] as const;
const REWARDS = ['COLLECTIBLE', 'BADGE', 'CONTENT_UNLOCK', 'WORLD_ACCESS', 'CHALLENGE_STATUS'] as const;

/** Place a World Drop — one short, elegant composer. */
export function WorldDropFormSheet({
  visible,
  busy = false,
  targets,
  onClose,
  onSubmit,
}: WorldDropFormSheetProps): React.JSX.Element {
  const t = useThemeColors();
  const [title, setTitle] = React.useState('');
  const [clue, setClue] = React.useState('');
  const [dropType, setDropType] = React.useState<(typeof TYPES)[number]>('SECRET_DROP');
  const [rewardType, setRewardType] = React.useState<(typeof REWARDS)[number]>('COLLECTIBLE');
  const [rewardRef, setRewardRef] = React.useState('');
  const [destination, setDestination] = React.useState(WORLD_DESTINATION_PRESETS[0]?.id ?? 'mumbai');
  const [expiryDays, setExpiryDays] = React.useState<number | null>(14);

  const needsTarget = rewardType === 'CONTENT_UNLOCK';
  const canSave = title.trim().length > 0 && !busy && (!needsTarget || rewardRef.length > 0);

  const submit = (): void => {
    const preset = WORLD_DESTINATION_PRESETS.find((entry) => entry.id === destination);
    if (!preset) return;
    onSubmit({
      caption: title.trim(),
      clue: clue.trim(),
      dropType,
      rewardType,
      rewardRef: rewardRef || null,
      mediaObjectId: null,
      latitude: preset.latitude,
      longitude: preset.longitude,
      locationLabel: preset.label,
      expiresAt: expiryDays != null ? Date.now() + expiryDays * 86_400_000 : null,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close">
        <Pressable style={[styles.sheet, { backgroundColor: t.surfaceElevated, borderColor: t.border }]}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
            <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
              Place a World Drop
            </Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              maxLength={180}
              placeholder="Give it a name"
              placeholderTextColor={t.textMuted}
              style={[styles.input, { color: t.textPrimary, borderColor: t.border, backgroundColor: t.inputBackground }]}
            />
            <TextInput
              value={clue}
              onChangeText={setClue}
              maxLength={280}
              multiline
              placeholder="A clue (optional)"
              placeholderTextColor={t.textMuted}
              style={[
                styles.input,
                styles.textarea,
                { color: t.textPrimary, borderColor: t.border, backgroundColor: t.inputBackground },
              ]}
            />
            <PillPicker
              label="Type"
              options={TYPES.map((value) => ({ value, label: dropTypeLabel(value) }))}
              value={dropType}
              onChange={setDropType}
            />
            <PillPicker
              label="Reward"
              options={REWARDS.map((value) => ({ value, label: rewardTypeLabel(value) }))}
              value={rewardType}
              onChange={setRewardType}
            />
            {needsTarget ? (
              <PillPicker
                label="Unlocks"
                options={targets.slice(0, 6).map((target) => ({ value: target.id, label: target.caption }))}
                value={rewardRef || null}
                onChange={setRewardRef}
              />
            ) : (
              <TextInput
                value={rewardRef}
                onChangeText={(next) => setRewardRef(next.slice(0, 60))}
                maxLength={60}
                placeholder="Artifact name (optional)"
                placeholderTextColor={t.textMuted}
                style={[styles.input, { color: t.textPrimary, borderColor: t.border, backgroundColor: t.inputBackground }]}
              />
            )}
            <PillPicker
              label="Destination"
              options={WORLD_DESTINATION_PRESETS.map((preset) => ({ value: preset.id, label: preset.label }))}
              value={destination}
              onChange={setDestination}
            />
            <PillPicker
              label="Expiry"
              options={WORLD_DROP_EXPIRY_DAYS.map((days) => ({
                value: days == null ? 'none' : String(days),
                label: worldDropExpiryLabel(days),
              }))}
              value={expiryDays == null ? 'none' : String(expiryDays)}
              onChange={(value) => setExpiryDays(value === 'none' ? null : Number(value))}
            />
            <VaultActionButton
              label={busy ? 'Placing…' : 'Place it in the world'}
              onPress={submit}
              style={canSave ? undefined : styles.disabled}
            />
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
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    ...typeScale.body,
  },
  textarea: { minHeight: 76, textAlignVertical: 'top' },
  disabled: { opacity: 0.5 },
});