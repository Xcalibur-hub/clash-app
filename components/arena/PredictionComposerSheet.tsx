import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { GlowButton } from '../shared/GlowButton';
import { tap as hapticTap } from '../../utils/haptics';

export interface PredictionComposerSheetProps {
  visible: boolean;
  busy?: boolean;
  onClose: () => void;
  onPublish: (question: string, options: string[], closesInHours: number) => void;
}

const CLOSE_CHOICES = [
  { hours: 1, label: '1 hour' },
  { hours: 2, label: '2 hours' },
  { hours: 6, label: '6 hours' },
  { hours: 24, label: '24 hours' },
] as const;

/** Simple moderator composer — question, 2–4 options, close window. */
export function PredictionComposerSheet({
  visible,
  busy = false,
  onClose,
  onPublish,
}: PredictionComposerSheetProps): React.JSX.Element | null {
  const t = useThemeColors();
  const [question, setQuestion] = React.useState('');
  const [options, setOptions] = React.useState<string[]>(['', '']);
  const [closesInHours, setClosesInHours] = React.useState(2);

  React.useEffect(() => {
    if (!visible) {
      setQuestion('');
      setOptions(['', '']);
      setClosesInHours(2);
    }
  }, [visible]);

  if (!visible) return null;

  const trimmed = options.map((o) => o.trim()).filter((o) => o.length > 0);
  const canPublish =
    question.trim().length > 0 &&
    trimmed.length >= 2 &&
    trimmed.length <= 4 &&
    new Set(trimmed.map((o) => o.toLowerCase())).size === trimmed.length;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.scrim, { backgroundColor: t.overlay }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
          <View
            style={[
              styles.sheet,
              {
                borderColor: t.border,
                backgroundColor: t.surfaceElevated,
              },
            ]}
            accessibilityViewIsModal
          >
            <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
              Create Prediction
            </Text>
            <TextInput
              value={question}
              onChangeText={setQuestion}
              placeholder="Who scores first tonight?"
              placeholderTextColor={t.textMuted}
              maxLength={140}
              style={[
                styles.input,
                {
                  color: t.textPrimary,
                  borderColor: t.border,
                  backgroundColor: t.inputBackground,
                },
              ]}
              accessibilityLabel="Prediction question"
            />
            {options.map((option, index) => (
              <TextInput
                key={`opt-${index}`}
                value={option}
                onChangeText={(text) => {
                  setOptions((prev) => prev.map((item, i) => (i === index ? text : item)));
                }}
                placeholder={`Option ${index + 1}`}
                placeholderTextColor={t.textMuted}
                maxLength={60}
                style={[
                  styles.input,
                  {
                    color: t.textPrimary,
                    borderColor: t.border,
                    backgroundColor: t.inputBackground,
                  },
                ]}
                accessibilityLabel={`Option ${index + 1}`}
              />
            ))}
            <View style={styles.row}>
              {options.length < 4 ? (
                <Pressable
                  onPress={() => {
                    hapticTap();
                    setOptions((prev) => [...prev, '']);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Add option"
                  hitSlop={8}
                >
                  <Text allowFontScaling={false} style={[styles.link, { color: t.textSecondary }]}>
                    Add option
                  </Text>
                </Pressable>
              ) : (
                <View />
              )}
              {options.length > 2 ? (
                <Pressable
                  onPress={() => {
                    hapticTap();
                    setOptions((prev) => prev.slice(0, -1));
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Remove last option"
                  hitSlop={8}
                >
                  <Text allowFontScaling={false} style={[styles.link, { color: t.textSecondary }]}>
                    Remove
                  </Text>
                </Pressable>
              ) : null}
            </View>

            <Text allowFontScaling={false} style={[styles.label, { color: t.textMuted }]}>
              Closes in
            </Text>
            <View style={styles.chips}>
              {CLOSE_CHOICES.map((choice) => {
                const active = closesInHours === choice.hours;
                return (
                  <Pressable
                    key={choice.hours}
                    onPress={() => {
                      hapticTap();
                      setClosesInHours(choice.hours);
                    }}
                    style={[
                      styles.chip,
                      {
                        borderColor: t.border,
                        backgroundColor: active
                          ? t.scheme === 'light'
                            ? t.textPrimary
                            : 'rgba(255,255,255,0.10)'
                          : 'transparent',
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={choice.label}
                  >
                    <Text
                      allowFontScaling={false}
                      style={[
                        styles.chipText,
                        {
                          color: active
                            ? t.scheme === 'light'
                              ? t.textInverse
                              : t.textPrimary
                            : t.textMuted,
                        },
                      ]}
                    >
                      {choice.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <GlowButton
              label="Publish"
              tone="light"
              disabled={!canPublish || busy}
              onPress={() => onPublish(question.trim(), trimmed, closesInHours)}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrim: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    marginHorizontal: space.md,
    marginBottom: space.lg,
    padding: space.md,
    gap: space.sm,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  title: { ...typeScale.label, fontWeight: '700' },
  input: {
    ...typeScale.body,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    minHeight: 48,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  link: { ...typeScale.meta },
  label: { ...typeScale.caption, marginTop: space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  chip: {
    paddingHorizontal: space.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 36,
    justifyContent: 'center',
  },
  chipText: { ...typeScale.meta },
});
