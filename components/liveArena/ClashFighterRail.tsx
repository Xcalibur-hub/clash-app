/** Exactly two canonical speakers; latest argument attribution is never a turn timer. */
import React from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { Avatar } from '../shared/Avatar';
import type { ArenaDuel } from '../../utils/arenaDuelPayload';
import { duelActiveSpeakers } from '../../utils/duelPresentation';
import { duelSpeakingCue } from '../../utils/duelStageMotion';
import { duelStageType } from '../../utils/duelStageLayout';
import { shouldPlayOnce } from '../../utils/motionOnce';
import { sidePlateBorder, sidePlateFill } from './liveArenaStyles';
import { layout, useThemeColors } from '../../theme';
import { arena } from '../../theme/arena';
import { duration } from '../../theme/motion';

export interface ClashFighterRailProps {
  duel: ArenaDuel;
  focusSide: 'A' | 'B' | null;
  condensed?: boolean;
  /** Dense modes omit positions visually but keep them in the accessible label. */
  showPositions?: boolean;
  /** Viewer support for this visit — presentation only, never a judgement. */
  backingSide?: 'A' | 'B' | null;
  onOpenProfile?: (id: string) => void;
  /** Live room only; terminal / history never show SPEAKING. */
  live?: boolean;
  terminal?: 'settled' | 'cancelled' | null;
  /** One-shot Stage entrance key; stable per Clash + viewer scope. */
  entranceKey?: string;
  /** Brief emphasis when a genuinely new official argument arrived. */
  arrivalSide?: 'A' | 'B' | null;
}

export function ClashFighterRail({
  duel,
  focusSide,
  condensed = false,
  showPositions = true,
  backingSide = null,
  onOpenProfile,
  live = true,
  terminal = null,
  entranceKey,
  arrivalSide = null,
}: ClashFighterRailProps): React.JSX.Element {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const { width, fontScale } = useWindowDimensions();
  const type = duelStageType({ width, fontScale });
  const speakers = duelActiveSpeakers(duel);
  const avatarSize = condensed ? (type.compact ? 28 : 32) : type.compact ? 36 : 44;
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
        const speaking = duelSpeakingCue({ live, terminal, focusSide, side });
        const focused = focusSide === side;
        const arrived = arrivalSide === side;
        const backed = backingSide === side;
        const tint = fighter.tint ?? t.textMuted;
        const label = `${fighter.name}, Side ${side}${speaking ? ', speaking' : focused ? ', latest argument' : ''}${backed ? ', you are backing' : ''}${position ? `. Position: ${position}` : ''}`;
        const dimOthers = Boolean(focusSide) && !focused && !speaking;
        return (
          <React.Fragment key={side}>
            {index === 1 ? (
              <View style={styles.vsSlot} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <Text allowFontScaling={false} style={[styles.vs, { color: t.textMuted }]}>
                  VS
                </Text>
              </View>
            ) : null}
            <FighterPlate
              side={side}
              label={label}
              speaking={speaking}
              focused={focused}
              arrived={arrived}
              backed={backed}
              dimmed={dimOthers}
              condensed={condensed}
              tint={tint}
              avatarSize={avatarSize}
              nameSize={type.nameSize}
              nameLineHeight={type.nameLineHeight}
              positionSize={type.positionSize}
              positionLineHeight={type.positionLineHeight}
              positionLines={type.positionLines}
              fighter={fighter}
              position={position}
              showPositions={showPositions}
              entranceKey={entranceKey}
              reduced={reduced}
              onOpenProfile={onOpenProfile}
            />
          </React.Fragment>
        );
      })}
    </View>
  );
}

function FighterPlate({
  side,
  label,
  speaking,
  focused,
  arrived,
  backed,
  dimmed,
  condensed,
  tint,
  avatarSize,
  nameSize,
  nameLineHeight,
  positionSize,
  positionLineHeight,
  positionLines,
  fighter,
  position,
  showPositions,
  entranceKey,
  reduced,
  onOpenProfile,
}: {
  side: 'A' | 'B';
  label: string;
  speaking: boolean;
  focused: boolean;
  arrived: boolean;
  backed: boolean;
  dimmed: boolean;
  condensed: boolean;
  tint: string;
  avatarSize: number;
  nameSize: number;
  nameLineHeight: number;
  positionSize: number;
  positionLineHeight: number;
  positionLines: number;
  fighter: ArenaDuel['fighterA'];
  position: string;
  showPositions: boolean;
  entranceKey?: string;
  reduced: boolean;
  onOpenProfile?: (id: string) => void;
}): React.JSX.Element {
  const t = useThemeColors();
  // Claim during the first render so remounts never restart the entrance, and so
  // the shared value starts hidden when this mount owns the one-shot.
  const playEntrance = React.useRef<boolean | null>(null);
  if (playEntrance.current === null) {
    playEntrance.current = Boolean(entranceKey) && !reduced && shouldPlayOnce(`${entranceKey}:${side}`);
  }
  const enter = useSharedValue(playEntrance.current ? 0 : 1);
  const pulse = useSharedValue(0);

  React.useEffect(() => {
    if (!playEntrance.current) return;
    playEntrance.current = false;
    enter.value = withDelay(
      side === 'A' ? 0 : 60,
      withTiming(1, { duration: duration.slow, easing: Easing.out(Easing.cubic) }),
    );
  }, [enter, side]);

  React.useEffect(() => {
    if (!arrived || reduced) {
      pulse.value = 0;
      return;
    }
    pulse.value = 0;
    pulse.value = withTiming(1, { duration: duration.fast, easing: Easing.out(Easing.cubic) }, (finished) => {
      if (finished) {
        pulse.value = withDelay(380, withTiming(0, { duration: duration.slow }));
      }
    });
  }, [arrived, pulse, reduced]);

  const plateStyle = useAnimatedStyle(() => {
    const fromX = side === 'A' ? -10 : 10;
    return {
      opacity: 0.42 + enter.value * 0.58,
      transform: [
        { translateX: (1 - enter.value) * fromX },
        { translateY: (1 - enter.value) * 8 },
        { scale: 1 + pulse.value * 0.025 },
      ],
    };
  });

  const activeBorder = speaking || arrived || focused;

  return (
    <Animated.View style={[{ flex: 1, minWidth: 0 }, plateStyle]}>
      <Pressable
        accessibilityRole="button"
        disabled={!onOpenProfile}
        accessibilityLabel={label}
        accessibilityState={{ selected: focused || speaking }}
        onPress={() => onOpenProfile?.(fighter.id)}
        style={[
          styles.fighter,
          condensed && styles.fighterCondensed,
          {
            backgroundColor: sidePlateFill(tint, t.scheme),
            borderColor: activeBorder ? sidePlateBorder(tint, t.scheme) : t.border,
            borderWidth: activeBorder ? 1.5 : StyleSheet.hairlineWidth,
            opacity: dimmed ? 0.78 : 1,
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
                fontSize: nameSize,
                lineHeight: nameLineHeight,
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
            {speaking ? ' · SPEAKING' : ''}
            {backed ? ' · YOUR SIDE' : ''}
          </Text>
          {showPositions && position ? (
            <Text
              numberOfLines={positionLines}
              ellipsizeMode="tail"
              style={[
                styles.position,
                {
                  color: t.textSecondary,
                  fontSize: positionSize,
                  lineHeight: positionLineHeight,
                },
              ]}
            >
              {position}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
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
