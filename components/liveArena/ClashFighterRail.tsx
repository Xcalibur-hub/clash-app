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
  /** Viewer support for this visit — presentation only, never a judgement. */
  backingSide?: 'A' | 'B' | null;
  onOpenProfile?: (id: string) => void;
}

export function ClashFighterRail({
  duel,
  focusSide,
  condensed = false,
  showPositions = true,
  backingSide = null,
  onOpenProfile,
}: ClashFighterRailProps): React.JSX.Element {
  const t = useThemeColors();
  const { width, fontScale } = useWindowDimensions();
  const type = duelStageType({ width, fontScale });
  const speakers = duelActiveSpeakers(duel);
  const avatarSize = condensed ? (type.compact ? 28 : 32) : type.compact ? 36 : 44;
  // Accepted positions are canonical payload fields; a missing one stays absent.
  const sides = [
    { side: 'A' as const, fighter: speakers[0], position: duel.sourceText?.trim() ?? '' },
    { side: 'B' as const, fighter: speakers[1], position: duel.counterPosition?.trim() ?? '' },
  ];

  return (
    <View
      style={[styles.row, condensed && styles.rowCondensed]}
      accessibilityLabel={`Fighters. ${sides[0].fighter.name} versus ${sides[1].fighter.name}`}
    >
      {sides.map(({ side, fighter, position }, index) => {
        const focused = focusSide === side;
        const backed = backingSide === side;
        const tint = fighter.tint ?? t.textMuted;
        const label = `${fighter.name}, Side ${side}${focused ? ', latest argument' : ''}${backed ? ', you are backing' : ''}${position ? `. Position: ${position}` : ''}`;
        return (
          <React.Fragment key={side}>
            {index === 1 ? (
              <View style={styles.vsSlot} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <Text allowFontScaling={false} style={[styles.vs, { color: t.textMuted }]}>
                  VS
                </Text>
              </View>
            ) : null}
            <Pressable
              accessibilityRole="button"
              disabled={!onOpenProfile}
              accessibilityLabel={label}
              accessibilityState={{ selected: focused }}
              onPress={() => onOpenProfile?.(fighter.id)}
              style={[
                styles.fighter,
                condensed && styles.fighterCondensed,
                {
                  backgroundColor: sidePlateFill(tint, t.scheme),
                  borderColor: focused ? sidePlateBorder(tint, t.scheme) : t.border,
                  borderWidth: focused ? 1.5 : StyleSheet.hairlineWidth,
                  opacity: focusSide && !focused ? 0.78 : 1,
                },
              ]}
            >
              <Avatar name={fighter.name} tint={tint} size={avatarSize} />
              <View style={styles.identity}>
                <Text
                  numberOfLines={1}
                  style={[
                    arena.type.label,
                    {
                      color: t.textPrimary,
                      fontWeight: '600',
                      fontSize: type.nameSize,
                      lineHeight: type.nameLineHeight,
                    },
                  ]}
                >
                  {fighter.name}
                </Text>
                <Text
                  numberOfLines={1}
                  allowFontScaling={false}
                  style={[styles.handle, { color: t.textMuted }]}
                >
                  @{fighter.handle}
                </Text>
                <Text allowFontScaling={false} style={[arena.type.eyebrow, { color: t.textSecondary, fontSize: 9 }]}>
                  SIDE {side}
                  {focused ? ' · SPEAKING' : ''}
                  {backed ? ' · YOUR SIDE' : ''}
                </Text>
                {showPositions && position ? (
                  <Text
                    numberOfLines={type.positionLines}
                    ellipsizeMode="tail"
                    style={[
                      styles.position,
                      {
                        color: t.textSecondary,
                        fontSize: type.positionSize,
                        lineHeight: type.positionLineHeight,
                      },
                    ]}
                  >
                    {position}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          </React.Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 0,
    paddingHorizontal: layout.screenX,
  },
  rowCondensed: { paddingHorizontal: layout.screenX },
  vsSlot: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  vs: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  fighter: {
    flex: 1,
    minWidth: 0,
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
  },
  fighterCondensed: {
    minHeight: 48,
    paddingVertical: 8,
    paddingHorizontal: 8,
    gap: 8,
  },
  identity: { flex: 1, minWidth: 0, gap: 2 },
  handle: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.1,
  },
  position: { marginTop: 2, fontWeight: '400' },
});
