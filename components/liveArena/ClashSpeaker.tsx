/**
 * One Stage speaker column — avatar, name, current official argument.
 * Never renders Crowd jokes into this lane.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '../shared/Avatar';
import type { ArenaDuel } from '../../utils/arenaDuelPayload';
import type { ArenaMessage } from '../../services/liveArenaService';
import { space, typeScale, useThemeColors } from '../../theme';

export interface ClashSpeakerProps {
  fighter: ArenaDuel['fighterA'];
  side: 'A' | 'B';
  argument: ArenaMessage | null;
  condensed?: boolean;
  active?: boolean;
  onOpenProfile?: (id: string) => void;
}

export function ClashSpeaker({
  fighter,
  side,
  argument,
  condensed = false,
  active = false,
  onOpenProfile,
}: ClashSpeakerProps): React.JSX.Element {
  const t = useThemeColors();
  const body = argument?.body?.trim() ?? '';
  const avatarSize = condensed ? 40 : 64;

  return (
    <View
      style={[styles.col, condensed && styles.colCondensed, active && styles.active]}
      accessibilityLabel={`Fighter ${side}, ${fighter.name}${body ? `. ${body}` : ''}`}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${fighter.name}'s profile`}
        disabled={!onOpenProfile}
        onPress={() => onOpenProfile?.(fighter.id)}
        style={styles.identity}
      >
        <Avatar name={fighter.name} tint={fighter.tint ?? t.textMuted} size={avatarSize} />
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
        {!condensed ? (
          <Text allowFontScaling={false} style={[styles.side, { color: t.textMuted }]}>
            Side {side}
          </Text>
        ) : null}
      </Pressable>
      {!condensed ? (
        <Text
          selectable
          numberOfLines={5}
          style={[styles.argument, { color: t.textSecondary }]}
        >
          {body
            ? body
            : side === 'A'
              ? 'Waiting for Side A’s argument…'
              : 'Waiting for Side B’s argument…'}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  col: {
    flex: 1,
    minWidth: 0,
    gap: space.sm,
    alignItems: 'center',
  },
  colCondensed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  active: { opacity: 1 },
  identity: { alignItems: 'center', gap: 6, minWidth: 0 },
  name: {
    ...typeScale.label,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  nameCondensed: { fontSize: 14, textAlign: 'left' },
  side: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  argument: {
    ...typeScale.body,
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
    width: '100%',
  },
});
