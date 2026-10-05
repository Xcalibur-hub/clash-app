import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { CreatorAiConfig, SaveCreatorAiInput } from '../../../services/creatorAiMappers';
import { radius, space, typeScale, useThemeColors } from '../../../theme';
import { PillPicker } from '../PillPicker';
import { VaultActionButton } from '../VaultActionButton';
import { LiveCoverPicker } from '../live/LiveCoverPicker';

export interface AiProfileFormSheetProps {
  visible: boolean;
  busy?: boolean;
  config: CreatorAiConfig | null;
  onClose: () => void;
  onSubmit: (input: SaveCreatorAiInput) => void;
}

const MAX_STARTERS = 6;

/**
 * The whole Creator AI configuration in one sheet. `enabled` is preserved from
 * the current config, so editing copy never silently switches the AI on or off.
 */
export function AiProfileFormSheet({
  visible,
  busy = false,
  config,
  onClose,
  onSubmit,
}: AiProfileFormSheetProps): React.JSX.Element {
  const t = useThemeColors();
  const [displayName, setDisplayName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [welcome, setWelcome] = React.useState('');
  const [instructions, setInstructions] = React.useState('');
  const [access, setAccess] = React.useState<'FREE' | 'SUBSCRIBER'>('FREE');
  const [starters, setStarters] = React.useState<string[]>([]);
  const [cover, setCover] = React.useState<{
    mediaObjectId: string | null;
    previewUri: string | null;
  }>({ mediaObjectId: null, previewUri: null });

  React.useEffect(() => {
    if (!visible) return;
    setDisplayName(config?.displayName ?? '');
    setDescription(config?.description ?? '');
    setWelcome(config?.welcomeMessage ?? '');
    setInstructions(config?.instructions ?? '');
    setAccess(config?.access ?? 'FREE');
    setStarters(config?.starters ?? []);
    setCover({ mediaObjectId: config?.artworkMediaObjectId ?? null, previewUri: null });
  }, [visible, config]);

  const canSave = !busy && displayName.trim().length > 0;
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
              Your AI
            </Text>
            <Text allowFontScaling={false} style={[styles.hint, { color: t.textMuted }]}>
              Name it as an AI — for example “Maya AI”. It may never claim to be you.
            </Text>
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              maxLength={40}
              placeholder="Maya AI"
              placeholderTextColor={t.textMuted}
              style={inputStyle}
            />
            <TextInput
              value={description}
              onChangeText={setDescription}
              maxLength={300}
              placeholder="An AI version of Maya built from her filmmaking notes."
              placeholderTextColor={t.textMuted}
              style={[...inputStyle, styles.textarea]}
            />
            <TextInput
              value={welcome}
              onChangeText={setWelcome}
              maxLength={500}
              placeholder="A welcome note for the room"
              placeholderTextColor={t.textMuted}
              style={[...inputStyle, styles.textarea]}
            />
            <TextInput
              value={instructions}
              onChangeText={setInstructions}
              maxLength={4000}
              multiline
              placeholder="How it should sound (kept private, never shown to fans)"
              placeholderTextColor={t.textMuted}
              style={[...inputStyle, styles.textareaTall]}
            />
            <PillPicker
              label="Who can talk to it"
              options={[
                { value: 'FREE', label: 'Everyone' },
                { value: 'SUBSCRIBER', label: 'Members' },
              ]}
              value={access}
              onChange={setAccess}
            />

            <View style={styles.starters}>
              <Text allowFontScaling={false} style={[styles.label, { color: t.textMuted }]}>
                SUGGESTED PROMPTS
              </Text>
              {starters.map((starter, index) => (
                <TextInput
                  key={`starter-${index}`}
                  value={starter}
                  onChangeText={(next) =>
                    setStarters((current) => current.map((entry, i) => (i === index ? next : entry)))
                  }
                  maxLength={120}
                  placeholder="How do you build suspense?"
                  placeholderTextColor={t.textMuted}
                  style={inputStyle}
                />
              ))}
              {starters.length < MAX_STARTERS ? (
                <VaultActionButton
                  label="Add prompt"
                  tone="quiet"
                  compact
                  onPress={() => setStarters((current) => [...current, ''])}
                />
              ) : null}
            </View>

            <LiveCoverPicker
              mediaObjectId={cover.mediaObjectId}
              previewUri={cover.previewUri}
              onChange={setCover}
            />

            <VaultActionButton
              label={busy ? 'Saving…' : 'Save'}
              onPress={() => {
                if (!canSave) return;
                onSubmit({
                  displayName: displayName.trim(),
                  description: description.trim(),
                  welcomeMessage: welcome.trim(),
                  instructions: instructions.trim(),
                  access,
                  starters: starters
                    .map((entry) => entry.trim())
                    .filter((entry) => entry.length > 0),
                  enabled: config?.enabled ?? false,
                  artworkMediaObjectId: cover.mediaObjectId,
                });
              }}
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
    maxHeight: '90%',
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  body: { gap: space.md, padding: space.xl },
  title: { ...typeScale.section },
  hint: { ...typeScale.meta },
  label: { ...typeScale.caption, fontWeight: '800', letterSpacing: 0.8 },
  starters: { gap: space.sm },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    ...typeScale.body,
  },
  textarea: { minHeight: 64, textAlignVertical: 'top' },
  textareaTall: { minHeight: 96, textAlignVertical: 'top' },
});

