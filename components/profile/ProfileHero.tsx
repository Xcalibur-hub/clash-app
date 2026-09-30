import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { User } from '../../store';
import { HOOD_LABEL } from '../../data/hoods';
import { space, typeScale, useThemeColors } from '../../theme';
import { Avatar } from '../shared/Avatar';
import { Underline } from '../shared/Doodles';

/**
 * Vault-realm identity — aligned with Arena Profile editorial treatment.
 */
export function ProfileHero({ viewer }: { viewer: User }): React.JSX.Element {
  const t = useThemeColors();
  return (
    <View style={styles.wrap}>
      <Avatar name={viewer.name} tint={viewer.tint} size={88} />
      <Text allowFontScaling={false} style={[styles.name, { color: t.textPrimary }]} numberOfLines={2}>
        {viewer.name}
      </Text>
      <View style={styles.handleRow}>
        <Text allowFontScaling={false} style={[styles.handle, { color: t.textMuted }]}>
          @{viewer.handle}
        </Text>
        <Underline size={64} opacity={0.22} color={t.textPrimary} style={styles.handleMark} />
      </View>
      {viewer.bio ? (
        <Text style={[styles.bio, { color: t.textPrimary }]}>{viewer.bio}</Text>
      ) : null}
      {viewer.hood !== 'for-you' ? (
        <Text allowFontScaling={false} style={[styles.hood, { color: t.textSecondary }]}>
          {HOOD_LABEL[viewer.hood]}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'flex-start', gap: space.sm, paddingTop: space.xs },
  name: {
    ...typeScale.title,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.6,
    marginTop: space.xs,
  },
  handleRow: { position: 'relative', alignSelf: 'flex-start', paddingBottom: 5 },
  handle: { ...typeScale.meta, fontSize: 15 },
  handleMark: { position: 'absolute', bottom: -1, left: 0 },
  bio: { ...typeScale.body },
  hood: { ...typeScale.meta },
});
