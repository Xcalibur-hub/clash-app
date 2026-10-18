/**
 * Two active speakers always visible; latest moment side is emphasized.
 * Never invents typing / turn / timer state.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  useReducedMotion,
} from 'react-native-reanimated';
import { Avatar } from '../shared/Avatar';
import type { ArenaDuel } from '../../utils/arenaDuelPayload';
import { duelActiveSpeakers } from '../../utils/duelPresentation';
import { sidePlateBorder, sidePlateFill } from './liveArenaStyles';
import { layout, radius, space, typeScale, useThemeColors } from '../../theme';

export interface ClashFighterRailProps {
  duel: ArenaDuel;
  /** Newest canonical argument author — null when floor is open. */
  focusSide: 'A' | 'B' | null;
  condensed?: boolean;
  onOpenProfile?: (id: string) => void;
}

export function ClashFighterRail({
  duel,
  focusSide,
  condensed = false,
  onOpenProfile,
}: ClashFighterRailProps): React.JSX.Element {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const [fighterA, fighterB] = duelActiveSpeakers(duel);
  const avatar = condensed ? 40 : 56;

  return (
    <View
      style={[styles.row, condensed && styles.rowCondensed]}
      accessibilityLabel={`Fighters. ${fighterA.name} versus ${fighterB.name}${
        focusSide
          ? `. Latest argument from ${focusSide === 'A' ? fighterA.name : fighterB.name}`
          : ''
      }`}
    >
      {([
        { side: 'A' as const, fighter: fighterA },
        { side: 'B' as const, fighter: fighterB },
      ]).map(({ side, fighter }, index) => {
        const focused = focusSide === side;
        const waiting = focusSide !== null && !focused;
        const node = (
          <Pressable
            key={side}
            accessibilityRole="button"
            accessibilityLabel={`${fighter.name}, Side ${side}${
              focused ? ', latest argument' : waiting ? ', waiting' : ''
            }`}
            accessibilityState={{ selected: focused }}
            disabled={!onOpenProfile}
            onPress={() => onOpenProfile?.(fighter.id)}
            style={[
              styles.col,
              styles.plate,
              {
                // Real per-fighter tint: red and blue sides stay distinct.
                backgroundColor: sidePlateFill(fighter.tint ?? t.textMuted, t.scheme),
                borderColor: focused
                  ? sidePlateBorder(fighter.tint ?? t.textMuted, t.scheme)
                  : 'transparent',
              },
              waiting && styles.waiting,
            ]}
          >
            <Avatar
              name={fighter.name}
              tint={fighter.tint ?? t.textMuted}
              size={avatar}
            />
            <Text
              allowFontScaling
              numberOfLines={1}
              style={[
                styles.name,
                condensed && styles.nameCondensed,
                { color: t.textPrimary },
              ]}
            >
              {fighter.name}
            </Text>
            {focused ? <Text style={[styles.latest, { color: t.textSecondary }]}>LATEST ARGUMENT</Text> : null}
            {!condensed ? (
              <Text
                allowFontScaling={false}
                numberOfLines={1}
                style={[styles.handle, { color: t.textMuted }]}
              >
                @{fighter.handle}
              </Text>
            ) : null}
          </Pressable>
        );

        return (
          <React.Fragment key={side}>
            {index === 1 ? (
              <Text
                allowFontScaling={false}
                style={[styles.vs, { color: t.textMuted }]}
                accessibilityLabel="versus"
              >
                VS
              </Text>
            ) : null}
            {reduced || !focused ? (
              node
            ) : (
              <Animated.View entering={FadeIn.duration(220)} style={styles.colGrow}>
                {node}
              </Animated.View>
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: layout.screenX,
    gap: space.sm,
  },
  rowCondensed: { alignItems: 'center' },
  colGrow: { flex: 1, minWidth: 0 },
  col: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: 5,
  },
  plate: {
    borderRadius: radius.lg,
    paddingVertical: space.xs,
    borderWidth: StyleSheet.hairlineWidth,
  },
  waiting: { opacity: 0.72 },
  latest: { fontSize: 9, fontWeight: '800', letterSpacing: 0.6, textAlign: 'center' },
  name: {
    ...typeScale.label,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  nameCondensed: { fontSize: 13 },
  handle: {
    ...typeScale.caption,
    fontSize: 12,
    fontWeight: '600',
  },
  vs: {
    ...typeScale.label,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    alignSelf: 'center',
    paddingTop: 18,
    paddingHorizontal: 4,
  },
});
