import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { radius, space, typeScale, useThemeColors } from '../../../theme';
import { tap as hapticTap } from '../../../utils/haptics';
import { VaultActionButton } from '../VaultActionButton';

export interface CommunityComposerProps {
  realName: string;
  pseudonymEnabled: boolean;
  pseudonym: string | null;
  busy?: boolean;
  placeholder?: string;
  compact?: boolean;
  onSubmit: (input: { body: string; pseudonymous: boolean }) => void;
}

/**
 * Minimal composer. When a community allows pseudonymous posting the identity
 * is an explicit choice — it is never silently switched.
 */
export function CommunityComposer({
  realName,
  pseudonymEnabled,
  pseudonym,
  busy = false,
  placeholder = 'Say something to the community…',
  compact = false,
  onSubmit,
}: CommunityComposerProps): React.JSX.Element {
  const t = useThemeColors();
  const [body, setBody] = React.useState('');
  const [pseudonymous, setPseudonymous] = React.useState(false);
  const canChooseIdentity = pseudonymEnabled && Boolean(pseudonym);
  const trimmed = body.trim();
  const canSend = trimmed.length > 0 && !busy;

  const send = (): void => {
    if (!canSend) return;
    onSubmit({ body: trimmed, pseudonymous: canChooseIdentity && pseudonymous });
    setBody('');
    setPseudonymous(false);
  };

  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: t.surface, borderColor: t.border },
        compact && styles.wrapCompact,
      ]}
    >
      {canChooseIdentity ? (
        <View style={styles.identityRow}>
          <IdentityPill
            label={`Post as ${realName.split(' ')[0] || realName}`}
            active={!pseudonymous}
            onPress={() => setPseudonymous(false)}
          />
          <IdentityPill
            label={`Post as ${pseudonym}`}
            active={pseudonymous}
            onPress={() => setPseudonymous(true)}
          />
        </View>
      ) : null}
      <TextInput
        value={body}
        onChangeText={setBody}
        multiline
        maxLength={2000}
        placeholder={placeholder}
        placeholderTextColor={t.textMuted}
        style={[
          styles.input,
          { color: t.textPrimary, borderColor: t.border, backgroundColor: t.inputBackground },
        ]}
      />
      <View style={styles.footer}>
        <VaultActionButton
          label={busy ? 'Posting…' : 'Post'}
          compact
          onPress={send}
          style={canSend ? undefined : styles.disabled}
        />
      </View>
    </View>
  );
}

function IdentityPill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const t = useThemeColors();
  return (
    <Pressable
      onPress={() => {
        hapticTap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        styles.pill,
        {
          backgroundColor: active ? (t.scheme === 'light' ? t.textPrimary : 'rgba(255,255,255,0.12)') : 'transparent',
          borderColor: t.border,
        },
      ]}
    >
      <Text
        allowFontScaling={false}
        style={[styles.pillLabel, { color: active ? (t.scheme === 'light' ? t.textInverse : t.textPrimary) : t.textSecondary }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.xxl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  wrapCompact: { padding: space.sm, borderRadius: radius.lg },
  identityRow: { flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' },
  pill: {
    paddingHorizontal: space.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: '100%',
  },
  pillLabel: { ...typeScale.caption, fontSize: 12, fontWeight: '700' },
  input: {
    minHeight: 46,
    maxHeight: 140,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    paddingHorizontal: space.sm,
    paddingVertical: 10,
    ...typeScale.body,
    textAlignVertical: 'top',
  },
  footer: { flexDirection: 'row', justifyContent: 'flex-end' },
  disabled: { opacity: 0.5 },
});
