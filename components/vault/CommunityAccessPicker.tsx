import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CommunityAccessType } from '../../services/vaultCommunityMappers';
import { communityAccessLabel, communityAccessRule } from '../../utils/vaultCommunityAccess';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';

export const COMMUNITY_ACCESS_TYPES: readonly CommunityAccessType[] = [
  'public',
  'followers',
  'subscribers',
];

export interface CommunityAccessPickerProps {
  value: CommunityAccessType;
  onChange: (value: CommunityAccessType) => void;
}

/** Public / Followers / Subscribers selector for the Studio settings sheet. */
export function CommunityAccessPicker({
  value,
  onChange,
}: CommunityAccessPickerProps): React.JSX.Element {
  const t = useThemeColors();
  return (
    <>
      <Text allowFontScaling={false} style={[styles.label, { color: t.textMuted }]}>
        ACCESS
      </Text>
      <View style={styles.pills}>
        {COMMUNITY_ACCESS_TYPES.map((type) => (
          <Pressable
            key={type}
            onPress={() => {
              hapticTap();
              onChange(type);
            }}
            accessibilityRole="button"
            accessibilityLabel={communityAccessLabel(type)}
            style={[
              styles.pill,
              {
                borderColor: value === type ? t.textPrimary : t.border,
                backgroundColor: value === type ? t.surfaceMuted : 'transparent',
              },
            ]}
          >
            <Text allowFontScaling={false} style={[styles.pillLabel, { color: t.textPrimary }]}>
              {communityAccessLabel(type)}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text allowFontScaling={false} style={[styles.hint, { color: t.textMuted }]}>
        {communityAccessRule(value)}
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  label: { ...typeScale.caption, fontWeight: '800', letterSpacing: 0.8, marginTop: space.xs },
  pills: { flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' },
  pill: {
    paddingHorizontal: space.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pillLabel: { ...typeScale.label, fontWeight: '700' },
  hint: { ...typeScale.meta, fontSize: 12 },
});
