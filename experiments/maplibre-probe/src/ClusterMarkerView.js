import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

/**
 * Numbered cluster marker.
 *
 * @param {object} props
 * @param {number} props.count
 * @param {() => void} [props.onPress]
 */
export function ClusterMarkerView({ count, onPress }) {
  const label = count > 99 ? '99+' : String(count);
  return (
    <Pressable
      onPress={onPress}
      style={styles.wrap}
      accessibilityRole="button"
      accessibilityLabel={`Cluster of ${count} drops`}
    >
      <View style={styles.disk}>
        <Text style={styles.count}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disk: {
    minWidth: 36,
    height: 36,
    paddingHorizontal: 8,
    borderRadius: 18,
    backgroundColor: '#1E3A5F',
    borderWidth: 2,
    borderColor: '#8EC5FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: {
    color: '#F4F8FF',
    fontSize: 13,
    fontWeight: '700',
  },
});
