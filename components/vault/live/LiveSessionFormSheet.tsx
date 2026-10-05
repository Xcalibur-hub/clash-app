import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { CreateLiveSessionInput } from '../../../services/creatorLiveService';
import { radius, space, typeScale, useThemeColors } from '../../../theme';
import { PillPicker } from '../PillPicker';
import { VaultActionButton } from '../VaultActionButton';
import { LiveCoverPicker } from './LiveCoverPicker';

export interface LiveSessionFormSheetProps {
  visible: boolean;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (input: CreateLiveSessionInput) => void;
}

type Schedule = 'now' | 'hour' | 'tomorrow';
type Provider = 'standby' | 'hls' | 'file' | 'embed';

const HOUR = 3_600_000;

function scheduledAtFor(schedule: Schedule): number | null {
  const now = Date.now();
  if (schedule === 'hour') return now + HOUR;
  if (schedule === 'tomorrow') {
    const tomorrow = new Date(now + 24 * HOUR);
    tomorrow.setHours(21, 0, 0, 0);
    return tomorrow.getTime();
  }
  return null;
}

function PermissionChip({
  label,
  on,
  onToggle,
}: {
  label: string;
  on: boolean;
  onToggle: () => void;
}): React.JSX.Element {
  const t = useThemeColors();
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      style={[
        styles.chip,
        {
          borderColor: on ? t.textPrimary : t.border,
          backgroundColor: on ? t.surfaceMuted : 'transparent',
        },
      ]}
    >
      <Text allowFontScaling={false} style={[styles.chipLabel, { color: t.textPrimary }]}>
        {on ? `✓ ${label}` : label}
      </Text>
    </Pressable>
  );
}

/** Create a session. The creator also decides what the crowd may influence. */
export function LiveSessionFormSheet({
  visible,
  busy = false,
  onClose,
  onSubmit,
}: LiveSessionFormSheetProps): React.JSX.Element {
  const t = useThemeColors();
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [access, setAccess] = React.useState<'FREE' | 'SUBSCRIBER'>('FREE');
  const [schedule, setSchedule] = React.useState<Schedule>('now');
  const [polls, setPolls] = React.useState(true);
  const [choices, setChoices] = React.useState(true);
  const [crowd, setCrowd] = React.useState(false);
  const [games, setGames] = React.useState(false);
  const [provider, setProvider] = React.useState<Provider>('standby');
  const [streamUrl, setStreamUrl] = React.useState('');
  const [cover, setCover] = React.useState<{
    mediaObjectId: string | null;
    previewUri: string | null;
  }>({ mediaObjectId: null, previewUri: null });

  const needsUrl = provider !== 'standby';
  const urlOk = streamUrl.trim().startsWith('https://');
  const canSave = !busy && title.trim().length > 0 && (!needsUrl || urlOk);

  const save = (): void => {
    if (!canSave) return;
    onSubmit({
      title: title.trim().slice(0, 120),
      description: description.trim().slice(0, 400),
      access,
      scheduledAt: scheduledAtFor(schedule),
      coverMediaObjectId: cover.mediaObjectId,
      allowPolls: polls,
      allowChoices: choices,
      allowCrowdActions: crowd,
      allowGameActions: games,
      streamUrl: needsUrl ? streamUrl.trim() : null,
      provider,
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
              Go live
            </Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              maxLength={120}
              placeholder="We are filming Episode 05"
              placeholderTextColor={t.textMuted}
              style={inputStyle}
            />
            <TextInput
              value={description}
              onChangeText={setDescription}
              maxLength={400}
              multiline
              placeholder="What is happening (optional)"
              placeholderTextColor={t.textMuted}
              style={[...inputStyle, styles.textarea]}
            />
            <PillPicker
              label="Who can watch"
              options={[
                { value: 'FREE', label: 'Everyone' },
                { value: 'SUBSCRIBER', label: 'Members' },
              ]}
              value={access}
              onChange={setAccess}
            />
            <PillPicker
              label="Starts"
              options={[
                { value: 'now', label: 'When I start' },
                { value: 'hour', label: 'In an hour' },
                { value: 'tomorrow', label: 'Tomorrow 9 PM' },
              ]}
              value={schedule}
              onChange={setSchedule}
            />


            <View style={styles.perms}>
              <Text allowFontScaling={false} style={[styles.label, { color: t.textMuted }]}>
                WHAT THEY CAN DO
              </Text>
              <View style={styles.chips}>
                <PermissionChip label="Polls" on={polls} onToggle={() => setPolls((v) => !v)} />
                <PermissionChip label="Choices" on={choices} onToggle={() => setChoices((v) => !v)} />
                <PermissionChip
                  label="Crowd actions"
                  on={crowd}
                  onToggle={() => setCrowd((v) => !v)}
                />
                <PermissionChip
                  label="Game actions"
                  on={games}
                  onToggle={() => setGames((v) => !v)}
                />
              </View>
            </View>

            <PillPicker
              label="Video source"
              options={[
                { value: 'standby', label: 'Standby poster' },
                { value: 'hls', label: 'HLS stream' },
                { value: 'file', label: 'MP4 stream' },
                { value: 'embed', label: 'Embed' },
              ]}
              value={provider}
              onChange={setProvider}
            />
            {needsUrl ? (
              <TextInput
                value={streamUrl}
                onChangeText={setStreamUrl}
                autoCapitalize="none"
                placeholder="https://…"
                placeholderTextColor={t.textMuted}
                style={inputStyle}
              />
            ) : (
              <Text allowFontScaling={false} style={[styles.hint, { color: t.textMuted }]}>
                No provider attached yet: the room shows the cover as a standby feed.
              </Text>
            )}

            <LiveCoverPicker
              mediaObjectId={cover.mediaObjectId}
              previewUri={cover.previewUri}
              onChange={setCover}
            />

            <VaultActionButton label={busy ? 'Creating…' : 'Create session'} onPress={save} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    maxHeight: '90%',
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  body: { gap: space.md, padding: space.xl },
  title: { ...typeScale.section },
  label: { ...typeScale.caption, fontWeight: '800', letterSpacing: 0.8 },
  hint: { ...typeScale.meta },
  perms: { gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipLabel: { ...typeScale.label, fontWeight: '700' },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    ...typeScale.body,
  },
  textarea: { minHeight: 76, textAlignVertical: 'top' },
});

