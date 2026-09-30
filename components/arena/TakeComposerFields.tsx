import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { HoodId } from '../../store';
import { layout, radius, space, typeScale, useThemeColors } from '../../theme';
import { HoodSelector } from './HoodSelector';
import { MediaAttachRow } from './MediaAttachRow';

export interface TakeComposerFieldsProps {
  text: string;
  onChangeText: (next: string) => void;
  placeholder: string;
  charsLeft: number;
  maxChars: number;
  overLimit: boolean;
  hood: HoodId;
  onChangeHood: (hood: HoodId) => void;
  onAttach: (kind: 'image' | 'video') => void;
  /** Real hoods only on the create screen; feeds keep the default scopes. */
  hoods?: readonly HoodId[];
}

/** Take composer fields — theme-aware for Light/Dark. */
export function TakeComposerFields({
  text,
  onChangeText,
  placeholder,
  charsLeft,
  maxChars,
  overLimit,
  hood,
  onChangeHood,
  onAttach,
  hoods,
}: TakeComposerFieldsProps): React.JSX.Element {
  const t = useThemeColors();
  return (
    <>
      <View style={styles.inputWrap}>
        <TextInput
          style={[
            styles.input,
            {
              color: t.textPrimary,
              borderColor: overLimit ? t.danger : t.border,
              backgroundColor: t.inputBackground,
            },
          ]}
          value={text}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={t.textMuted}
          multiline
          textAlignVertical="top"
          accessibilityLabel="Your take text"
          accessibilityHint={`Type your take. ${charsLeft} of ${maxChars} characters left.`}
        />
        <View style={styles.counterRow}>
          <Text
            allowFontScaling={false}
            style={[styles.counter, { color: overLimit ? t.danger : t.textMuted }]}
            accessibilityLabel={`${charsLeft} of ${maxChars} characters left`}
          >
            {`${charsLeft} / ${maxChars}`}
          </Text>
        </View>
      </View>

      <MediaAttachRow onPick={onAttach} />

      <Text allowFontScaling={false} style={[styles.sectionLabel, { color: t.textMuted }]}>
        DROP INTO
      </Text>
      <HoodSelector value={hood} onChange={onChangeHood} hoods={hoods} />
    </>
  );
}

const styles = StyleSheet.create({
  inputWrap: { gap: space.xs, marginTop: space.sm },
  input: {
    ...typeScale.take,
    minHeight: 168,
    padding: layout.cardPadding,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    textAlignVertical: 'top',
    lineHeight: 26,
  },
  counterRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  counter: { ...typeScale.meta, fontSize: 12 },
  sectionLabel: { ...typeScale.eyebrow, marginTop: space.xs },
});
