import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import type { CommunityIdentity } from '../../../utils/vaultCommunityPseudonym';
import { communityIdentityPresentation } from '../../../utils/vaultCommunityPseudonym';
import { space, typeScale, useThemeColors } from '../../../theme';
import { timeAgo } from '../../../utils/format';
import { Avatar } from '../../shared/Avatar';

export interface CommunityIdentityRowProps {
  identity: CommunityIdentity;
  createdAt: number;
  onPressProfile?: () => void;
  trailing?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Identity line for a community post/reply. A pseudonymous author shows only
 * its alias — never a handle, and never a tappable profile link.
 */
export function CommunityIdentityRow({
  identity,
  createdAt,
  onPressProfile,
  trailing,
  style,
}: CommunityIdentityRowProps): React.JSX.Element {
  const t = useThemeColors();
  const view = communityIdentityPresentation(identity);
  const nameColor = view.pseudonymous ? t.textSecondary : t.textPrimary;

  const nameNode = (
    <Text allowFontScaling={false} style={[styles.name, { color: nameColor }]} numberOfLines={1}>
      {view.label}
    </Text>
  );

  return (
    <View style={[styles.row, style]}>
      <Avatar name={view.label} tint={identity.tint} size={34} />
      <View style={styles.body}>
        <View style={styles.nameRow}>
          {view.canOpenProfile && onPressProfile ? (
            <Pressable onPress={onPressProfile} accessibilityRole="button" accessibilityLabel={view.label}>
              {nameNode}
            </Pressable>
          ) : (
            nameNode
          )}
          {view.pseudonymous ? (
            <Text allowFontScaling={false} style={[styles.aliasTag, { color: t.textMuted }]}>
              alias
            </Text>
          ) : null}
        </View>
        <Text allowFontScaling={false} style={[styles.time, { color: t.textMuted }]}>
          {timeAgo(createdAt)}
        </Text>
      </View>
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  body: { flex: 1, gap: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  name: { ...typeScale.label, fontWeight: '700' },
  aliasTag: { ...typeScale.caption, fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase' },
  time: { ...typeScale.meta, fontSize: 12 },
});
