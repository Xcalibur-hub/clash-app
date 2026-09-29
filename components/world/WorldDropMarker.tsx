import React from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';
import type { WorldDrop } from '../../services/worldService';
import { ink } from '../../theme';
import { PlayIcon } from '../shared/icons';

export interface WorldDropMarkerProps {
  drop: WorldDrop;
  selected: boolean;
  onPress: (drop: WorldDrop) => void;
}

/**
 * Compact media thumbnail marker — CONTENT, not a person.
 * tracksViewChanges is briefly enabled so Android paints the custom view, then off.
 */
export const WorldDropMarker = React.memo(function WorldDropMarker({
  drop,
  selected,
  onPress,
}: WorldDropMarkerProps): React.JSX.Element {
  const [tracks, setTracks] = React.useState(true);
  const author = drop.author?.name ?? drop.author?.handle ?? 'someone';
  const distance = drop.distanceBand
    ? drop.distanceBand.replace('–', ' to ').replace('<', 'under ')
    : 'nearby';
  const label = `World Drop by ${author}, ${distance} away`;

  React.useEffect(() => {
    const timer = setTimeout(() => setTracks(false), Platform.OS === 'android' ? 900 : 400);
    return () => clearTimeout(timer);
  }, [drop.media?.url, selected]);

  return (
    <Marker
      coordinate={{ latitude: drop.approxLat, longitude: drop.approxLng }}
      onPress={(event) => {
        event.stopPropagation();
        onPress(drop);
      }}
      tracksViewChanges={tracks || selected}
      accessibilityLabel={label}
      anchor={{ x: 0.5, y: 0.5 }}
      zIndex={selected ? 20 : 1}
    >
      <View
        style={[styles.shell, selected && styles.shellSelected]}
        accessible
        accessibilityLabel={label}
      >
        {drop.media?.kind === 'image' && drop.media.url ? (
          <Image
            source={{ uri: drop.media.url }}
            style={styles.thumb}
            onLoadEnd={() => setTracks(false)}
          />
        ) : (
          <View style={[styles.thumb, styles.fallback]}>
            <PlayIcon size={14} color={ink.primary} strokeWidth={2.2} />
          </View>
        )}
        {drop.mission ? <View style={styles.missionDot} /> : null}
      </View>
    </Marker>
  );
});

export interface WorldClusterMarkerProps {
  id: string;
  latitude: number;
  longitude: number;
  count: number;
  onPress: () => void;
}

export const WorldClusterMarker = React.memo(function WorldClusterMarker({
  id,
  latitude,
  longitude,
  count,
  onPress,
}: WorldClusterMarkerProps): React.JSX.Element {
  const [tracks, setTracks] = React.useState(true);
  React.useEffect(() => {
    const timer = setTimeout(() => setTracks(false), 600);
    return () => clearTimeout(timer);
  }, [count, id]);

  return (
    <Marker
      coordinate={{ latitude, longitude }}
      onPress={(event) => {
        event.stopPropagation();
        onPress();
      }}
      tracksViewChanges={tracks}
      accessibilityLabel={`${count} World Drops`}
      anchor={{ x: 0.5, y: 0.5 }}
      zIndex={5}
    >
      <View style={styles.cluster} accessible accessibilityLabel={`${count} World Drops`}>
        <Text allowFontScaling={false} style={styles.clusterText}>
          {count > 99 ? '99+' : String(count)}
        </Text>
      </View>
    </Marker>
  );
});

const SIZE = 44;

const styles = StyleSheet.create({
  shell: {
    width: SIZE,
    height: SIZE,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: '#141418',
    overflow: 'hidden',
    transform: [{ scale: 1 }],
  },
  shellSelected: {
    borderColor: 'rgba(255,255,255,0.55)',
    transform: [{ scale: 1.04 }],
  },
  thumb: { width: '100%', height: '100%' },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  missionDot: {
    position: 'absolute',
    right: 3,
    bottom: 3,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  cluster: {
    minWidth: 36,
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(20,20,24,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  clusterText: {
    color: '#F5F5F7',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
