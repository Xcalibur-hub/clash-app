/** Exactly two canonical speakers; latest argument attribution is never a turn timer. */
import React from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Avatar } from '../shared/Avatar';
import type { ArenaDuel } from '../../utils/arenaDuelPayload';
import { duelActiveSpeakers } from '../../utils/duelPresentation';
import { duelStageType } from '../../utils/duelStageLayout';
import { sidePlateBorder, sidePlateFill } from './liveArenaStyles';
import { layout, useThemeColors } from '../../theme';
import { arena } from '../../theme/arena';

export interface ClashFighterRailProps {
  duel: ArenaDuel;
  focusSide: 'A' | 'B' | null;
  condensed?: boolean;
  /** Dense modes omit positions visually but keep them in the accessible label. */
  showPositions?: boolean;
  onOpenProfile?: (id: string) => void;
}

export function ClashFighterRail({
  duel,
  focusSide,
  condensed = false,
  showPositions = true,
  onOpenProfile,
}: ClashFighterRailProps): React.JSX.Element {
  const t = useThemeColors();
  const { width, fontScale } = useWindowDimensions();
  const type = duelStageType({ width, fontScale });
  const speakers = duelActiveSpeakers(duel);
  // Accepted positions are canonical payload fields; a missing one stays absent.
  const sides = [
    { side: 'A' as const, fighter: speakers[0], position: duel.sourceText?.trim() ?? '' },
    { side: 'B' as const, fighter: speakers[1], position: duel.counterPosition?.trim() ?? '' },
  ];

  return (
    <View
      style={styles.row}
      accessibilityLabel={`Fighters. ${sides[0].fighter.name} versus ${sides[1].fighter.name}`}
    >
      {sides.map(({ side, fighter, position }) => {
        const focused = focusSide === side;
        const label = `${fighter.name}, Side ${side}${focused ? ', latest argument' : ''}${position ? `. Position: ${position}` : ''}`;
        return (
          <Pressable
            key={side}
            accessibilityRole="button"
            disabled={!onOpenProfile}
            accessibilityLabel={label}
            accessibilityState={{ selected: focused }}
            onPress={() => onOpenProfile?.(fighter.id)}
            style={[
              styles.fighter,
              {
                backgroundColor: sidePlateFill(fighter.tint ?? t.textMuted, t.scheme),
                borderColor: focused ? sidePlateBorder(fighter.tint ?? t.textMuted, t.scheme) : t.border,
              },
            ]}
          >
            <Avatar name={fighter.name} tint={fighter.tint ?? t.textMuted} size={condensed ? 24 : 32} />
            <View style={styles.identity}>
              <Text
                numberOfLines={1}
                style={[
                  arena.type.label,
                  { color: t.textPrimary, fontWeight: '600', fontSize: type.nameSize, lineHeight: type.nameLineHeight },
                ]}
              >
                {fighter.name}
              </Text>
              <Text allowFontScaling={false} style={[arena.type.eyebrow, { color: t.textSecondary, fontSize: 9 }]}>
                SIDE {side}{focused ? ' · LATEST' : ''}
              </Text>
              {showPositions && position ? (
                <Text
                  numberOfLines={type.positionLines}
                  ellipsizeMode="tail"
                  style={[styles.position, { color: t.textSecondary, fontSize: type.positionSize, lineHeight: type.positionLineHeight }]}
                >
                  {position}
                </Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, paddingHorizontal: layout.screenX },
  fighter: {
    flex: 1,
    minWidth: 0,
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
  },
  identity: { flex: 1, minWidth: 0, gap: 2 },
  position: { marginTop: 2, fontWeight: '400' },
});
