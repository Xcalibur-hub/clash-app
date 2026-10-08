/**
 * Intentional empty-room stage — “the floor is open”, not a blank chat.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ArenaRoomPresence } from '../../services/liveArenaService';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';
import { Avatar } from '../shared/Avatar';
import { softFill } from './liveArenaStyles';

export interface LiveRoomEmptyFloorProps {
  presence: readonly ArenaRoomPresence[];
  participantCount: number;
  isDebater: boolean;
  isSpectator: boolean;
  accepting: boolean;
  onStartArgument: () => void;
  onJoinDebate: () => void;
}

export function LiveRoomEmptyFloor({
  presence,
  participantCount,
  isDebater,
  isSpectator,
  accepting,
  onStartArgument,
  onJoinDebate,
}: LiveRoomEmptyFloorProps): React.JSX.Element {
  const t = useThemeColors();
  const shown = presence.slice(0, 6);

  return (
    <View style={styles.wrap}>
      {shown.length > 0 ? (
        <View style={styles.people}>
          {shown.map((person) => (
            <View key={person.id} style={styles.person}>
              <Avatar name={person.name} tint={person.avatarTint} size={36} />
              <Text
                allowFontScaling={false}
                style={[styles.initial, { color: t.textMuted }]}
                numberOfLines={1}
              >
                {person.isViewer ? 'YOU' : person.handle.slice(0, 2).toUpperCase()}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
        {participantCount > 0 ? `${participantCount} joined` : 'Live room'}
      </Text>
      <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
        The floor is open
      </Text>
      <Text allowFontScaling={false} style={[styles.body, { color: t.textSecondary }]}>
        {isDebater
          ? 'No arguments yet. Start the room.'
          : 'No arguments yet.'}
      </Text>

      {isDebater && accepting ? (
        <Pressable
          onPress={() => {
            hapticTap();
            onStartArgument();
          }}
          accessibilityRole="button"
          accessibilityLabel="Start an argument"
          style={[styles.cta, { backgroundColor: t.clashFill }]}
        >
          <Text allowFontScaling={false} style={[styles.ctaText, { color: t.clashText }]}>
            OPEN THE FLOOR
          </Text>
        </Pressable>
      ) : null}

      {isSpectator && accepting ? (
        <Pressable
          onPress={() => {
            hapticTap();
            onJoinDebate();
          }}
          accessibilityRole="button"
          accessibilityLabel="Pick a side"
          style={[styles.cta, { backgroundColor: softFill(t), borderColor: t.borderStrong, borderWidth: StyleSheet.hairlineWidth }]}
        >
          <Text allowFontScaling={false} style={[styles.ctaTextAlt, { color: t.textPrimary }]}>
            PICK A SIDE
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    gap: space.sm,
    minHeight: 280,
  },
  people: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: space.md,
    marginBottom: space.md,
  },
  person: { alignItems: 'center', gap: 4, width: 48 },
  initial: { ...typeScale.caption, fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  kicker: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.0,
    textTransform: 'uppercase',
  },
  title: {
    ...typeScale.editorial,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  body: { ...typeScale.meta, fontSize: 15, textAlign: 'center', lineHeight: 21 },
  cta: {
    marginTop: space.md,
    minHeight: 48,
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { ...typeScale.label, fontSize: 15, fontWeight: '800' },
  ctaTextAlt: { ...typeScale.label, fontSize: 15, fontWeight: '800' },
});
