import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { User } from '../../store';
import { HOOD_LABEL } from '../../data/hoods';
import { ink, space, typeScale } from '../../theme';
import { Avatar } from '../shared/Avatar';
import { Chip } from '../shared/Chip';
import { CrownIcon, HashIcon } from '../shared/icons';

/**
 * Profile identity (reference screen 13): a large avatar, the handle, and the rank
 * pill. Everything else on the screen is a number about this person.
 */
export function ProfileHero({ viewer }: { viewer: User }): React.JSX.Element {
  return (
    <View style={styles.wrap}>
      <Avatar name={viewer.name} tint={viewer.tint} size={92} />
      <Text allowFontScaling={false} style={styles.handle}>
        {`@${viewer.handle}`}
      </Text>
      <View style={styles.chips}>
        <Chip label={viewer.rank.toUpperCase()} icon={CrownIcon} tone="gold" />
        <Chip label={HOOD_LABEL[viewer.hood]} icon={HashIcon} tone="neutral" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: space.sm, paddingTop: space.xs },
  handle: { ...typeScale.title, fontSize: 24, color: ink.primary },
  chips: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap', justifyContent: 'center' },
});
