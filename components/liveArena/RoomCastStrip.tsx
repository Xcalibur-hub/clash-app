/**
 * Compact cast of important people from real Room Pulse leaders.
 * Sports-broadcast strip — not an RPG HUD.
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ArenaPulseLeader } from '../../services/liveArenaService';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { Avatar } from '../shared/Avatar';

const ROLE_LABEL: Record<ArenaPulseLeader['category'], string> = {
  TOP_ARGUMENT: 'Top case',
  BEST_EVIDENCE: 'Best proof',
  BEST_REBUTTAL: 'Best reply',
  FAST_RISING: 'Fast rising',
  CROWD_FAVORITE: 'Crowd fav',
};

export interface RoomCastStripProps {
  leaders: readonly ArenaPulseLeader[];
}

export function RoomCastStrip({ leaders }: RoomCastStripProps): React.JSX.Element | null {
  const t = useThemeColors();
  const cast = leaders.filter((l) => l.author).slice(0, 5);
  if (cast.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
        ON THE FLOOR
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {cast.map((leader) => {
          const author = leader.author!;
          return (
            <View
              key={`${leader.category}:${leader.messageId ?? leader.evidenceId ?? author.id}`}
              style={[styles.chip, { backgroundColor: t.surfaceElevated, borderColor: t.border }]}
            >
              <Avatar name={author.name} tint={author.avatarTint} size={28} />
              <View style={styles.copy}>
                <Text allowFontScaling={false} style={[styles.role, { color: t.textMuted }]} numberOfLines={1}>
                  {ROLE_LABEL[leader.category]}
                </Text>
                <Text allowFontScaling={false} style={[styles.name, { color: t.textPrimary }]} numberOfLines={1}>
                  @{author.handle || author.name}
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, paddingBottom: space.xs },
  kicker: {
    ...typeScale.caption,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    paddingHorizontal: 2,
  },
  row: { gap: 8, paddingRight: space.md },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 168,
  },
  copy: { flexShrink: 1, gap: 1 },
  role: { ...typeScale.caption, fontSize: 9, fontWeight: '700', letterSpacing: 0.4 },
  name: { ...typeScale.caption, fontSize: 12, fontWeight: '700' },
});
