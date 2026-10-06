/**
 * Bold typographic CLASH sticker plate — tray tiles + room message render.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { arenaAccentPalette } from '../../theme/arenaAccents';
import { family, radius, typeScale, useTheme, useThemeColors } from '../../theme';
import type { ClashNativeSticker } from '../../utils/clashNativeStickers';

export function ClashNativeStickerCard({
  sticker,
  size = 'md',
}: {
  sticker: ClashNativeSticker;
  size?: 'sm' | 'md' | 'lg';
}): React.JSX.Element {
  const t = useThemeColors();
  const { scheme } = useTheme();
  const accent = arenaAccentPalette(scheme)[sticker.accent];
  const tall = size === 'lg';
  const compact = size === 'sm';

  return (
    <View
      style={[
        styles.plate,
        compact && styles.plateSm,
        tall && styles.plateLg,
        {
          backgroundColor: accent.soft,
          borderColor: accent.ink,
        },
      ]}
      accessibilityRole="image"
      accessibilityLabel={`Sticker ${sticker.label}`}
    >
      <View style={[styles.glow, { backgroundColor: accent.deep }]} />
      {sticker.emoji ? (
        <Text allowFontScaling={false} style={[styles.emoji, compact && styles.emojiSm, tall && styles.emojiLg]}>
          {sticker.emoji}
        </Text>
      ) : null}
      <Text
        allowFontScaling={false}
        style={[
          styles.label,
          compact && styles.labelSm,
          tall && styles.labelLg,
          { color: accent.ink },
          sticker.label.length > 8 && styles.labelTight,
        ]}
        numberOfLines={sticker.label.includes(' ') ? 2 : 1}
      >
        {sticker.label}
      </Text>
      <Text allowFontScaling={false} style={[styles.brand, { color: t.textMuted }]}>
        CLASH
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  plate: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    overflow: 'hidden',
    gap: 2,
  },
  plateSm: { paddingHorizontal: 4, paddingVertical: 6 },
  plateLg: { borderRadius: radius.lg, paddingHorizontal: 12 },
  glow: {
    position: 'absolute',
    width: '70%',
    height: '55%',
    borderRadius: 999,
    opacity: 0.55,
    top: '18%',
  },
  emoji: { fontSize: 22, lineHeight: 26, zIndex: 1 },
  emojiSm: { fontSize: 16, lineHeight: 18 },
  emojiLg: { fontSize: 28, lineHeight: 32 },
  label: {
    fontFamily: family.bold,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.4,
    textAlign: 'center',
    zIndex: 1,
  },
  labelSm: { fontSize: 11, letterSpacing: 0.2 },
  labelLg: { fontSize: 18 },
  labelTight: { fontSize: 12, letterSpacing: 0.1, lineHeight: 14 },
  brand: {
    ...typeScale.caption,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginTop: 2,
    zIndex: 1,
  },
});
