import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { space, typeScale, useThemeColors } from '../../../theme';
import { withAlpha } from '../../../utils/color';
import { Avatar } from '../../shared/Avatar';

export interface ConstellationMember {
  name: string;
  tint: string;
}

export interface MemberConstellationProps {
  members?: readonly ConstellationMember[];
  /** Anonymous marks (honest: no invented identities) when faces are unknown. */
  anonymousCount?: number;
  tint?: string | null;
  total?: number;
  size?: number;
}

const SCATTER = [0, -8, 5, -4, 8, -6];

/** An organic cluster of members — a room, not an avatar list. */
export const MemberConstellation = React.memo(function MemberConstellation({
  members = [],
  anonymousCount = 0,
  tint,
  total,
  size = 40,
}: MemberConstellationProps): React.JSX.Element {
  const t = useThemeColors();
  const shown = members.slice(0, 6);
  const marks = shown.length === 0 ? Math.min(anonymousCount, 5) : 0;
  const count = shown.length > 0 ? shown.length : marks;
  const extraTotal = total != null ? total : anonymousCount;
  const extra = Math.max(0, extraTotal - count);

  return (
    <View style={styles.row}>
      {shown.map((member, index) => (
        <View
          key={`${member.name}-${index}`}
          style={[
            styles.slot,
            { marginLeft: index === 0 ? 0 : -size * 0.34, marginTop: SCATTER[index % SCATTER.length] },
          ]}
        >
          <View style={[styles.ring, { borderColor: t.background }]}>
            <Avatar name={member.name} tint={member.tint} size={size} />
          </View>
        </View>
      ))}
      {marks > 0
        ? Array.from({ length: marks }).map((_, index) => (
            <View
              key={`anon-${index}`}
              style={[
                styles.slot,
                { marginLeft: index === 0 ? 0 : -size * 0.34, marginTop: SCATTER[index % SCATTER.length] },
              ]}
            >
              <View style={[styles.ring, { borderColor: t.background }]}>
                <View style={[styles.dot, { width: size, height: size, borderRadius: size / 2 }]}>
                  <LinearGradient
                    colors={[
                      withAlpha(tint ?? t.textMuted, 0.85),
                      withAlpha(tint ?? t.textMuted, 0.25),
                    ]}
                    start={{ x: 0.1, y: 0 }}
                    end={{ x: 0.9, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                </View>
              </View>
            </View>
          ))
        : null}
      {extra > 0 && count > 0 ? (
        <View style={[styles.slot, { marginLeft: -size * 0.34 }]}>
          <View
            style={[
              styles.dot,
              styles.more,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                borderColor: t.border,
                backgroundColor: t.surfaceMuted,
              },
            ]}
          >
            <Text allowFontScaling={false} style={[styles.moreText, { color: t.textSecondary }]}>
              +{extra > 99 ? '99' : extra}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  slot: {},
  ring: { borderRadius: 999, borderWidth: 2 },
  dot: { overflow: 'hidden' },
  more: { alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  moreText: { ...typeScale.caption, fontSize: 11, fontWeight: '800' },
});

