import React from 'react';
import { Text, TextInput, View } from 'react-native';
import type { HoodId } from '../../store';
import { createTakeStyles as styles } from './createTakeStyles';
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
}

/**
 * The take composer (reference screen 11): the large input with its live
 * counter, the glass attachment buttons and the hood picker.
 */
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
}: TakeComposerFieldsProps): React.JSX.Element {
  return (
    <>
      <View style={styles.inputWrap}>
        <TextInput
          style={[styles.input, overLimit && styles.inputOver]}
          value={text}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="rgba(247,247,250,0.38)"
          multiline
          textAlignVertical="top"
          accessibilityLabel="Your take text"
          accessibilityHint={`Type your take. ${charsLeft} of ${maxChars} characters left.`}
        />
        <View style={styles.counterRow}>
          <Text
            allowFontScaling={false}
            style={[styles.counter, overLimit && styles.counterOver]}
            accessibilityLabel={`${charsLeft} of ${maxChars} characters left`}
          >
            {`${charsLeft} / ${maxChars}`}
          </Text>
        </View>
      </View>

      <MediaAttachRow onPick={onAttach} />

      <Text allowFontScaling={false} style={styles.sectionLabel}>
        DROP INTO
      </Text>
      <HoodSelector value={hood} onChange={onChangeHood} />
    </>
  );
}