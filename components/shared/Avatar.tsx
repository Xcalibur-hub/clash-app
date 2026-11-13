import React from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { ink, radius } from '../../theme';
import { withAlpha } from '../../utils/color';
import { initials } from '../../utils/format';
import { AVATAR_MAX_TEXT_SCALE, avatarInitialsSize } from './avatarGeometry';

export interface AvatarProps {
  name: string;
  /** Accent hex from the user record — drives the avatar gradient. */
  tint: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Initials-on-accent avatar. No network images, so it never pops in.
 *
 * **Font scaling.** Phase 1 turned OS text scaling on by default, which is the
 * right call for the 99% of nodes that are body copy. An avatar is not one of
 * them: the glyph is sized as a fraction of a fixed circle, so scaling it up
 * pushes it past the circle's edge and `overflow: 'hidden'` shears the letters
 * in half. That is Phase 1 blocker 3.
 *
 * The fix is not to disable scaling — that would make the avatar the one place
 * in the app that ignores the accessibility setting, and the initials would
 * become unreadably small for exactly the users who asked for larger text.
 *
 * Instead the glyph is **capped and its line box sized to the cap**: the text
 * grows up to 1.6x, `lineHeight` is set explicitly so React Native reserves the
 * right vertical space instead of clipping the ascent, and the container keeps
 * the diameter the layout asked for. At the cap the glyph occupies 66% of the
 * circle, comfortably inside the rim. Geometry lives in `avatarGeometry.ts` so it
 * can be unit-tested.
 */

export function Avatar({ name, tint, size = 40, style }: AvatarProps): React.JSX.Element {
  const diameter = size;
  const glyphSize = avatarInitialsSize(size);

  return (
    <View
      style={[
        styles.wrap,
        {
          width: diameter,
          height: diameter,
          borderRadius: diameter / 2,
          borderColor: withAlpha(tint, 0.55),
        },
        style,
      ]}
      // The decorative gradient carries no meaning; the initials do.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <LinearGradient
        colors={[withAlpha(tint, 0.95), withAlpha(tint, 0.3)]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Text
        allowFontScaling
        maxFontSizeMultiplier={AVATAR_MAX_TEXT_SCALE}
        style={[styles.initials, { fontSize: glyphSize, lineHeight: Math.round(glyphSize * 1.16) }]}
      >
        {initials(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: radius.pill,
    // Kept as a safety net for the gradient, but with the container sized from
    // the glyph cap nothing the Text draws can reach the edge.
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  initials: {
    color: ink.inverse,
    fontWeight: '800',
    letterSpacing: 0.2,
    // A tight line box keeps two- and three-letter initials optically centred
    // instead of sitting low in the circle.
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
});
