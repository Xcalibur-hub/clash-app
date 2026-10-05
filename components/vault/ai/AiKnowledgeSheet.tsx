import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { AddCreatorAiKnowledgeInput } from '../../../services/creatorAiMappers';
import { radius, space, typeScale, useThemeColors } from '../../../theme';
import { PillPicker } from '../PillPicker';
import { VaultActionButton } from '../VaultActionButton';

export interface AiKnowledgeSource {
  id: string;
  kind: 'VAULT_DROP' | 'COLLECTION' | 'COURSE';
  label: string;
}

export interface AiKnowledgeSheetProps {
  visible: boolean;
  busy?: boolean;
  /** Existing Vault items the creator may teach from, already bounded. */
  sources: readonly AiKnowledgeSource[];
  onClose: () => void;
  onSubmit: (input: AddCreatorAiKnowledgeInput) => void;
}

type Kind = 'NOTE' | 'VAULT_DROP' | 'COLLECTION' | 'COURSE';

/**
 * Teaching the AI is deliberate: a creator note, or a pointer at content they
 * already own. Nothing is ingested automatically, and member-only sources stay
 * member-only for the viewer too.
 */
export function AiKnowledgeSheet({
  visible,
  busy = false,
  sources,
  onClose,
  onSubmit,
}: AiKnowledgeSheetProps): React.JSX.Element {
  const t = useThemeColors();
  const [kind, setKind] = React.useState<Kind>('NOTE');
  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  const [access, setAccess] = React.useState<'FREE' | 'SUBSCRIBER'>('FREE');
  const [sourceId, setSourceId] = React.useState<string | null>(null);

  const options = sources.filter((source) => source.kind === kind).slice(0, 8);
  const needsSource = kind !== 'NOTE';
  const canSave =
    !busy &&
    (kind === 'NOTE'
      ? body.trim().length > 0
      : sourceId !== null && sourceId.length > 0);

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
              What should it know?
            </Text>
            <PillPicker
              label="Source"
              options={[
                { value: 'NOTE', label: 'A note you write' },
                { value: 'VAULT_DROP', label: 'A Vault Drop' },
                { value: 'COLLECTION', label: 'A Collection' },
                { value: 'COURSE', label: 'A course' },
              ]}
              value={kind}
              onChange={(next) => {
                setKind(next);
                setSourceId(null);
              }}
            />

            {kind === 'NOTE' ? (
              <>
                <TextInput
                  value={body}
                  onChangeText={setBody}
                  multiline
                  maxLength={4000}
                  placeholder="Hold the frame longer than is comfortable."
                  placeholderTextColor={t.textMuted}
                  style={[...inputStyle, styles.textareaTall]}
                />
                <PillPicker
                  label="Who may use it"
                  options={[
                    { value: 'FREE', label: 'Everyone' },
                    { value: 'SUBSCRIBER', label: 'Members' },
                  ]}
                  value={access}
                  onChange={setAccess}
                />
              </>
            ) : options.length === 0 ? (
              <Text allowFontScaling={false} style={[styles.hint, { color: t.textMuted }]}>
                {`You have no ${
                  kind === 'VAULT_DROP'
                    ? 'published Drops'
                    : kind === 'COLLECTION'
                      ? 'collections'
                      : 'courses'
                } to teach from yet.`}
              </Text>
            ) : (
              <PillPicker
                label="Which one"
                options={options.map((source) => ({ value: source.id, label: source.label }))}
                value={sourceId}
                onChange={setSourceId}
              />
            )}

            <TextInput
              value={title}
              onChangeText={setTitle}
              maxLength={120}
              placeholder="Title (optional)"
              placeholderTextColor={t.textMuted}
              style={inputStyle}
            />

            <VaultActionButton
              label={busy ? 'Adding…' : 'Add to knowledge'}
              onPress={() => {
                if (!canSave) return;
                onSubmit({
                  kind,
                  title: title.trim(),
                  body: kind === 'NOTE' ? body.trim() : null,
                  sourceId: needsSource ? sourceId : null,
                  access: kind === 'NOTE' ? access : 'FREE',
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
    maxHeight: '88%',
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  body: { gap: space.md, padding: space.xl },
  title: { ...typeScale.section },
  hint: { ...typeScale.meta },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    ...typeScale.body,
  },
  textareaTall: { minHeight: 96, textAlignVertical: 'top' },
});
