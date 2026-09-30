import React from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';
import type { WorldDrop } from '../../services/worldService';
import { typeScale } from '../../theme';
import { PlayIcon } from '../shared/icons';

export interface WorldDropMarkerProps {
  drop: WorldDrop;
  selected: boolean;
  onPress: (drop: WorldDrop) => void;
}

/**
 * Compact circular media marker — CONTENT, not a person.
 * tracksViewChanges briefly so Android paints the custom view, then off.
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
  const isVideo = drop.media?.kind === 'video';
  const imageUrl = drop.media?.kind === 'image' ? drop.media.url : null;
  const size = selected ? SELECTED : BASE;

  React.useEffect(() => {
    setTracks(true);
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
      zIndex={selected ? 20 : drop.mission ? 4 : 1}
    >
      <View
        style={[
          styles.shell,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
          selected && styles.shellSelected,
          drop.mission ? styles.shellMission : null,
        ]}
        accessible
        accessibilityLabel={label}
      >
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.thumb}
            onLoadEnd={() => setTracks(false)}
          />
        ) : (
          <View style={[styles.thumb, styles.fallback]}>
            <PlayIcon size={selected ? 16 : 14} color="#F5F5F7" strokeWidth={2.2} />
          </View>
        )}
        {isVideo && imageUrl ? (
          <View style={styles.videoBadge}>
            <PlayIcon size={9} color="#F5F5F7" strokeWidth={2.4} />
          </View>
        ) : null}
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

const BASE = 40;
const SELECTED = 48;

const styles = StyleSheet.create({
  shell: {
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.88)',
    backgroundColor: '#1A1A1E',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.28,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 3 },
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  shellSelected: {
    borderColor: '#FFFFFF',
    ...Platform.select({
      ios: {
        shadowOpacity: 0.4,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 5 },
      },
      android: { elevation: 8 },
      default: {},
    }),
  },
  shellMission: {
    borderColor: 'rgba(255,255,255,0.95)',
  },
  thumb: { width: '100%', height: '100%' },
  fallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#222226' },
  videoBadge: {
    position: 'absolute',
    right: 3,
    bottom: 3,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  missionDot: {
    position: 'absolute',
    left: 3,
    top: 3,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F5F5F7',
    borderWidth: 1.5,
    borderColor: '#1A1A1E',
  },
  cluster: {
    minWidth: 38,
    height: 38,
    paddingHorizontal: 11,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(28,28,32,0.96)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.88)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.3,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 3 },
      },
      android: { elevation: 5 },
      default: {},
    }),
  },
  clusterText: {
    ...typeScale.label,
    color: '#F5F5F7',
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '600',
  },
});
