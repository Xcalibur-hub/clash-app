import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

/**
 * Circular media marker chrome for a synthetic Drop.
 *
 * @param {object} props
 * @param {import('./probeDrops.js').ProbeDrop} props.drop
 * @param {boolean} props.selected
 * @param {() => void} [props.onPress]
 */
export function DropMarkerView({ drop, selected, onPress }) {
  const isVideo = drop.mediaType === 'video';
  const hasMission = Boolean(drop.missionId);

  return (
    <Pressable
      onPress={onPress}
      style={[styles.wrap, selected && styles.wrapSelected]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={[
        drop.title,
        isVideo ? 'video' : 'image',
        hasMission ? `mission ${drop.missionTitle ?? drop.missionId}` : null,
        selected ? 'selected' : 'not selected',
      ]
        .filter(Boolean)
        .join(', ')}
    >
      <View style={[styles.disk, selected && styles.diskSelected]}>
        <Text style={styles.thumb}>{drop.thumbnailLabel ?? (isVideo ? 'VID' : 'IMG')}</Text>
        {isVideo ? (
          <View style={styles.videoBadge} accessibilityElementsHidden>
            <Text style={styles.videoText}>▶</Text>
          </View>
        ) : null}
        {hasMission ? <View style={styles.missionDot} accessibilityElementsHidden /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 52,
    height: 52,
  },
  wrapSelected: {
    transform: [{ scale: 1.08 }],
  },
  disk: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2A2A32',
    borderWidth: 2,
    borderColor: '#E8E8EE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  diskSelected: {
    borderColor: '#F5C451',
    borderWidth: 3,
    backgroundColor: '#3A3420',
  },
  thumb: {
    color: '#F2F2F6',
    fontSize: 10,
    fontWeight: '700',
  },
  videoBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#111115',
    borderWidth: 1,
    borderColor: '#F2F2F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoText: {
    color: '#F2F2F6',
    fontSize: 8,
    marginLeft: 1,
  },
  missionDot: {
    position: 'absolute',
    top: -2,
    left: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#5B9DFF',
    borderWidth: 1,
    borderColor: '#111115',
  },
});
