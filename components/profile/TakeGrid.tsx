import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { HOOD_LABEL } from '../../data/hoods';
import type { Take, TakeMedia } from '../../store';
import { card, ink, radius, space, typeScale } from '../../theme';
import { timeLeftLabel } from '../../utils/format';
import { press as hapticPress } from '../../utils/haptics';
import { PlayIcon } from '../shared/icons';

export interface TakeGridProps {
  takes: readonly Take[];
  now: number;
  onPress: (takeId: string) => void;
}

const hasMedia = (take: Take): take is Take & { media: TakeMedia } => take.media != null;

/**
 * The viewer's Takes (PRD §19): media takes in an Instagram-like 3-column
 * grid, text-only takes as a clean list below it.
 */
export function TakeGrid({ takes, now, onPress }: TakeGridProps): React.JSX.Element {
  const media = takes.filter(hasMedia);
  const textOnly = takes.filter((take) => !hasMedia(take));

  const open = (takeId: string): void => {
    hapticPress();
    onPress(takeId);
  };

  return (
    <View style={s.wrap}>
      {media.length > 0 ? (
        <View style={s.grid}>
          {media.map((take) => (
            <Pressable
              key={take.id}
              onPress={() => open(take.id)}
              accessibilityRole="button"
              accessibilityLabel={`Your take: ${take.text}`}
              style={s.tile}
            >
              <LinearGradient
                colors={take.media.colors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <View style={s.veil} pointerEvents="none" />
              {take.media.kind === 'video' ? (
                <View style={s.play}>
                  <PlayIcon size={13} color={ink.primary} strokeWidth={2.6} />
                </View>
              ) : null}
              <Text allowFontScaling={false} numberOfLines={3} style={s.caption}>
                {take.text}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {textOnly.map((take) => (
        <Pressable
          key={take.id}
          onPress={() => open(take.id)}
          accessibilityRole="button"
          accessibilityLabel={`Your take: ${take.text}`}
          style={s.row}
        >
          <Text allowFontScaling={false} numberOfLines={2} style={s.rowText}>
            {take.text}
          </Text>
          <Text allowFontScaling={false} style={s.rowMeta}>
            {`${HOOD_LABEL[take.hood]} · ${timeLeftLabel(take.expiresAt, now)}`}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: space.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  tile: {
    minWidth: '31%',
    flexGrow: 1,
    aspectRatio: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    padding: space.sm,
  },
  veil: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(8,8,11,0.34)' },
  play: {
    position: 'absolute',
    top: space.sm,
    right: space.sm,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,8,11,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  caption: { ...typeScale.meta, color: ink.primary, fontWeight: '700' },
  row: {
    gap: space.xs,
    padding: space.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: card.border,
    backgroundColor: card.native,
  },
  rowText: { ...typeScale.body, color: ink.primary },
  rowMeta: { ...typeScale.meta, color: ink.tertiary },
});
