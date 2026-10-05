import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { AI_MAX_DRAFT, aiSendBlockReason, sanitizeAiDraft } from '../../../utils/creatorAiState';
import { radius, space, typeScale, useThemeColors } from '../../../theme';
import { tap as hapticTap } from '../../../utils/haptics';

export interface AiComposerProps {
  value: string;
  onChange: (next: string) => void;
  onSend: () => void;
  gating: {
    canChat: boolean;
    viewerAccess: boolean;
    enabled: boolean;
    isOwner: boolean;
    providerReady: boolean;
    sending: boolean;
  };
  canSend: boolean;
}

/** A single restrained composer. The AI indicator lives above it, always. */
export function AiComposer({
  value,
  onChange,
  onSend,
  gating,
  canSend,
}: AiComposerProps): React.JSX.Element {
  const t = useThemeColors();
  const blocked = aiSendBlockReason({ ...gating, draft: value });

  return (
    <View style={styles.wrap}>
      <TextInput
        value={value}
        onChangeText={(next) => onChange(sanitizeAiDraft(next))}
        multiline
        maxLength={AI_MAX_DRAFT}
        editable={!gating.isOwner && gating.enabled}
        placeholder={blocked ?? 'Ask about the work…'}
        placeholderTextColor={t.textMuted}
        style={[
          styles.input,
          { color: t.textPrimary, borderColor: t.border, backgroundColor: t.inputBackground },
        ]}
      />
      <Pressable
        onPress={() => {
          if (!canSend) return;
          hapticTap();
          onSend();
        }}
        accessibilityRole="button"
        accessibilityLabel="Send message"
        accessibilityState={{ disabled: !canSend }}
        style={[
          styles.send,
          {
            borderColor: canSend ? t.textPrimary : t.border,
            backgroundColor: canSend ? (t.scheme === 'light' ? t.textPrimary : t.surfaceMuted) : 'transparent',
            opacity: canSend ? 1 : 0.5,
          },
        ]}
      >
        <Text
          allowFontScaling={false}
          style={[
            styles.sendLabel,
            { color: canSend && t.scheme === 'light' ? t.textInverse : t.textPrimary },
          ]}
        >
          {gating.sending ? '…' : 'SEND'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  input: {
    flex: 1,
    maxHeight: 120,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    ...typeScale.body,
  },
  send: {
    paddingHorizontal: space.md,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sendLabel: { ...typeScale.caption, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
});
