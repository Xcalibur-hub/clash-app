import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

/**
 * Compact bottom preview for a selected synthetic Drop.
 *
 * @param {object} props
 * @param {import('./probeDrops.js').ProbeDrop} props.drop
 * @param {() => void} props.onClose
 */
export function DropPreview({ drop, onClose }) {
  return (
    <View style={styles.sheet} accessibilityViewIsModal>
      <View style={styles.row}>
        <View style={styles.mediaChip}>
          <Text style={styles.mediaChipText}>
            {drop.mediaType === 'video' ? 'Video' : 'Image'}
            {drop.thumbnailLabel ? ` · ${drop.thumbnailLabel}` : ''}
          </Text>
        </View>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close drop preview"
          hitSlop={12}
          style={styles.close}
        >
          <Text style={styles.closeText}>Close</Text>
        </Pressable>
      </View>
      <Text style={styles.title}>{drop.title}</Text>
      <Text style={styles.summary}>{drop.summary}</Text>
      <Text style={styles.meta}>
        {drop.approxLat.toFixed(4)}, {drop.approxLng.toFixed(4)}
        {drop.missionTitle ? ` · Mission: ${drop.missionTitle}` : ''}
      </Text>
      <Text style={styles.footnote}>Synthetic preview · no playback · no World navigation</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 18,
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(18,18,22,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  mediaChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#2A2A32',
  },
  mediaChipText: {
    color: '#E8E8EE',
    fontSize: 11,
    fontWeight: '600',
  },
  close: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  closeText: {
    color: '#F5C451',
    fontSize: 13,
    fontWeight: '600',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  summary: {
    color: '#D0D0D6',
    fontSize: 13,
    marginTop: 6,
    lineHeight: 18,
  },
  meta: {
    color: '#A0A0A8',
    fontSize: 11,
    marginTop: 8,
  },
  footnote: {
    color: '#707078',
    fontSize: 10,
    marginTop: 8,
  },
});
