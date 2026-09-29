import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { card, color, ink, radius, space, typeScale } from '../../theme';
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
      <View style={styles.scrim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.sheet} accessibilityViewIsModal>
          <Text allowFontScaling={false} style={styles.title}>Create Prediction</Text>
          <TextInput
            value={question}
            onChangeText={setQuestion}
            placeholder="Who scores first tonight?"
            placeholderTextColor={ink.quaternary}
            maxLength={140}
            style={styles.input}
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
              placeholderTextColor={ink.quaternary}
              maxLength={60}
              style={styles.input}
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
              >
                <Text allowFontScaling={false} style={styles.link}>Add option</Text>
              </Pressable>
            ) : <View />}
            {options.length > 2 ? (
              <Pressable
                onPress={() => {
                  hapticTap();
                  setOptions((prev) => prev.slice(0, -1));
                }}
                accessibilityRole="button"
                accessibilityLabel="Remove last option"
              >
                <Text allowFontScaling={false} style={styles.link}>Remove</Text>
              </Pressable>
            ) : null}
          </View>

          <Text allowFontScaling={false} style={styles.label}>Closes in</Text>
          <View style={styles.chips}>
            {CLOSE_CHOICES.map((choice) => (
              <Pressable
                key={choice.hours}
                onPress={() => {
                  hapticTap();
                  setClosesInHours(choice.hours);
                }}
                style={[styles.chip, closesInHours === choice.hours && styles.chipOn]}
                accessibilityRole="button"
                accessibilityState={{ selected: closesInHours === choice.hours }}
                accessibilityLabel={choice.label}
              >
                <Text allowFontScaling={false} style={[styles.chipText, closesInHours === choice.hours && styles.chipTextOn]}>
                  {choice.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <GlowButton
            label="Publish"
            tone="light"
            disabled={!canPublish || busy}
            onPress={() => onPublish(question.trim(), trimmed, closesInHours)}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: color.scrim,
  },
  sheet: {
    marginHorizontal: space.md,
    marginBottom: space.lg,
    padding: space.md,
    gap: space.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: card.border,
    backgroundColor: card.elevated,
  },
  title: { ...typeScale.label, color: ink.primary, fontWeight: '700' },
  input: {
    ...typeScale.body,
    color: ink.primary,
    borderWidth: 1,
    borderColor: card.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    backgroundColor: card.solid,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  link: { ...typeScale.meta, color: ink.secondary },
  label: { ...typeScale.caption, color: ink.tertiary, marginTop: space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  chip: {
    paddingHorizontal: space.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: card.border,
  },
  chipOn: { backgroundColor: 'rgba(255,255,255,0.10)' },
  chipText: { ...typeScale.meta, color: ink.tertiary },
  chipTextOn: { color: ink.primary },
});
