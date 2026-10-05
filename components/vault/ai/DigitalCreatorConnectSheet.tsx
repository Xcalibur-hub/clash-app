import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type {
  DigitalCreatorConfig,
  SaveDigitalCreatorInput,
} from '../../../services/digitalCreatorMappers';
import {
  likenessConsentCopy,
  sanitizeModelReference,
  sanitizeProviderSlug,
} from '../../../utils/digitalCreatorState';
import { radius, space, typeScale, useThemeColors } from '../../../theme';
import { LiveCoverPicker } from '../live/LiveCoverPicker';
import { VaultActionButton } from '../VaultActionButton';

export interface DigitalCreatorConnectSheetProps {
  visible: boolean;
  busy?: boolean;
  config: DigitalCreatorConfig;
  displayName: string;
  onClose: () => void;
  onSubmit: (input: SaveDigitalCreatorInput) => void;
}

function Toggle({
  label,
  body,
  value,
  disabled,
  onPress,
}: {
  label: string;
  body: string;
  value: boolean;
  disabled?: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const t = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: disabled === true }}
      accessibilityLabel={label}
      style={[styles.toggle, { borderColor: t.border, opacity: disabled ? 0.5 : 1 }]}
    >
      <View style={styles.toggleCopy}>
        <Text allowFontScaling={false} style={[styles.toggleLabel, { color: t.textPrimary }]}>
          {label}
        </Text>
        <Text allowFontScaling={false} style={[styles.toggleBody, { color: t.textMuted }]}>
          {body}
        </Text>
      </View>
      <Text allowFontScaling={false} style={[styles.toggleValue, { color: t.textPrimary }]}>
        {value ? 'ON' : 'OFF'}
      </Text>
    </Pressable>
  );
}

/**
 * Connect the creator's OWN authorized model.
 *
 * There is no "clone anyone" path here by design: the form asks for a provider
 * reference the creator already owns and requires an explicit rights
 * confirmation before either capability can be switched on.
 */
export function DigitalCreatorConnectSheet({
  visible,
  busy = false,
  config,
  displayName,
  onClose,
  onSubmit,
}: DigitalCreatorConnectSheetProps): React.JSX.Element {
  const t = useThemeColors();
  const [provider, setProvider] = React.useState('');
  const [modelRef, setModelRef] = React.useState('');
  const [voiceRef, setVoiceRef] = React.useState('');
  const [digitalName, setDigitalName] = React.useState('');
  const [avatarOn, setAvatarOn] = React.useState(false);
  const [voiceOn, setVoiceOn] = React.useState(false);
  const [textOn, setTextOn] = React.useState(true);
  const [consent, setConsent] = React.useState(false);
  const [artwork, setArtwork] = React.useState<{
    mediaObjectId: string | null;
    previewUri: string | null;
  }>({ mediaObjectId: null, previewUri: null });

  React.useEffect(() => {
    if (!visible) return;
    setProvider(config.provider === 'none' ? '' : config.provider);
    setModelRef(config.avatarExternalId ?? '');
    setVoiceRef(config.voiceExternalId ?? '');
    setDigitalName(config.displayName ?? '');
    setAvatarOn(config.avatarEnabled);
    setVoiceOn(config.voiceEnabled);
    setTextOn(config.textFallbackEnabled);
    setConsent(config.consentAt !== null);
    setArtwork({ mediaObjectId: config.artworkMediaObjectId, previewUri: null });
  }, [visible, config]);

  const slug = sanitizeProviderSlug(provider);
  const wantsRendering = avatarOn || voiceOn;
  const canSave =
    !busy && slug.length > 0 && modelRef.trim().length > 0 && (!wantsRendering || consent);
  const inputStyle = [
    styles.input,
    { color: t.textPrimary, borderColor: t.border, backgroundColor: t.inputBackground },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: t.background, borderColor: t.border }]}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
              DIGITAL VERSION
            </Text>
            <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
              Connect your authorized model
            </Text>
            <Text allowFontScaling={false} style={[styles.body, { color: t.textSecondary }]}>
              CLASH never trains or clones a likeness. You authorize an avatar or voice with a
              provider you own, then paste that reference here. No provider key ever touches CLASH.
            </Text>

            <Text allowFontScaling={false} style={[styles.fieldLabel, { color: t.textMuted }]}>
              PROVIDER
            </Text>
            <TextInput
              value={provider}
              onChangeText={setProvider}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="provider_slug"
              placeholderTextColor={t.textMuted}
              style={inputStyle}
            />

            <Text allowFontScaling={false} style={[styles.fieldLabel, { color: t.textMuted }]}>
              MODEL REFERENCE
            </Text>
            <TextInput
              value={modelRef}
              onChangeText={(next) => setModelRef(sanitizeModelReference(next))}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="avatar-or-voice-model-id"
              placeholderTextColor={t.textMuted}
              style={inputStyle}
            />

            <Text allowFontScaling={false} style={[styles.fieldLabel, { color: t.textMuted }]}>
              VOICE REFERENCE (OPTIONAL)
            </Text>
            <TextInput
              value={voiceRef}
              onChangeText={(next) => setVoiceRef(sanitizeModelReference(next))}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="voice-model-id"
              placeholderTextColor={t.textMuted}
              style={inputStyle}
            />

            <Text allowFontScaling={false} style={[styles.fieldLabel, { color: t.textMuted }]}>
              DIGITAL NAME
            </Text>
            <TextInput
              value={digitalName}
              onChangeText={setDigitalName}
              placeholder={`Digital ${displayName}`}
              placeholderTextColor={t.textMuted}
              maxLength={40}
              style={inputStyle}
            />

            <LiveCoverPicker
              mediaObjectId={artwork.mediaObjectId}
              previewUri={artwork.previewUri}
              onChange={setArtwork}
            />

            <Toggle
              label="Avatar"
              body="Render replies as the authorized avatar."
              value={avatarOn}
              disabled={!consent}
              onPress={() => setAvatarOn((on) => !on)}
            />
            <Toggle
              label="Voice"
              body="Render replies in the authorized voice."
              value={voiceOn}
              disabled={!consent}
              onPress={() => setVoiceOn((on) => !on)}
            />
            <Toggle
              label="Text fallback"
              body="Keep text AI working when rendering is unavailable."
              value={textOn}
              onPress={() => setTextOn((on) => !on)}
            />

            <Pressable
              onPress={() => setConsent((on) => !on)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: consent }}
              accessibilityLabel="Likeness and voice rights confirmation"
              style={[styles.consent, { borderColor: t.border }]}
            >
              <Text allowFontScaling={false} style={[styles.consentMark, { color: t.textPrimary }]}>
                {consent ? '[x]' : '[ ]'}
              </Text>
              <Text allowFontScaling={false} style={[styles.body, { color: t.textSecondary }]}>
                {likenessConsentCopy()}
              </Text>
            </Pressable>

            <View style={styles.actions}>
              <VaultActionButton label="Cancel" tone="quiet" onPress={onClose} />
              <VaultActionButton
                label={busy ? 'Saving…' : 'Save'}
                onPress={() => {
                  if (!canSave) return;
                  onSubmit({
                    provider: slug,
                    avatarExternalId: modelRef.trim(),
                    voiceExternalId: voiceRef.trim().length > 0 ? voiceRef.trim() : null,
                    displayName: digitalName.trim().length > 0 ? digitalName.trim() : null,
                    avatarMediaObjectId: artwork.mediaObjectId,
                    avatarEnabled: avatarOn,
                    voiceEnabled: voiceOn,
                    textFallbackEnabled: textOn,
                    confirmLikenessConsent: consent,
                  });
                }}
              />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}


const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    maxHeight: '92%',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  content: { padding: space.lg, gap: space.sm },
  kicker: { ...typeScale.caption, fontSize: 10, fontWeight: '800', letterSpacing: 1.6 },
  title: { ...typeScale.display, fontSize: 22, fontWeight: '800' },
  body: { ...typeScale.meta, fontSize: 13, lineHeight: 18, flex: 1 },
  fieldLabel: { ...typeScale.caption, fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    ...typeScale.body,
    fontSize: 14,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: space.md,
  },
  toggleCopy: { flex: 1, gap: 2 },
  toggleLabel: { ...typeScale.label, fontSize: 14, fontWeight: '700' },
  toggleBody: { ...typeScale.meta, fontSize: 12, lineHeight: 16 },
  toggleValue: { ...typeScale.caption, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  consent: {
    flexDirection: 'row',
    gap: space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: space.md,
  },
  consentMark: { ...typeScale.body, fontSize: 14, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: space.sm, justifyContent: 'flex-end' },
});

