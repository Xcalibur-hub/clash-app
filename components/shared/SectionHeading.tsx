import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { ink, space, typeScale } from '../../theme';
import { Underline } from './Doodles';

export interface SectionHeadingProps {
  eyebrow: string;
  title: string;
  /** Draws a hand-drawn underline beneath the title. */
  marked?: boolean;
  /** Renders the title in the editorial italic voice (reference design). */
  editorial?: boolean;
  accessory?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Eyebrow + title pair used to open every block of content. */
export function SectionHeading({
  eyebrow,
  title,
  marked = false,
  editorial = false,
  accessory,
  style,
}: SectionHeadingProps): React.JSX.Element {
  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.row}>
        <Text allowFontScaling={false} style={[styles.eyebrow, editorial && styles.eyebrowEditorial]}>
          {eyebrow}
        </Text>
        {accessory}
      </View>
      <View>
        <Text allowFontScaling={false} style={[styles.title, editorial && styles.editorialTitle]}>
          {title}
        </Text>
        {marked ? <Underline size={118} style={styles.mark} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs + 2 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { ...typeScale.caption, color: ink.tertiary },
  eyebrowEditorial: { ...typeScale.eyebrow },
  title: { ...typeScale.section, color: ink.primary },
  editorialTitle: { ...typeScale.editorial },
  mark: { position: 'absolute', bottom: -8, left: -4 },
});
