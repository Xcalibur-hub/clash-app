import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Camera, Map } from '@maplibre/maplibre-react-native';
import { toMapLibreCoordinate, type WorldCameraRegion } from '../../utils/worldMapAdapter';

const FALLBACK: WorldCameraRegion = {
  latitude: 15.4909,
  longitude: 73.8278,
  latitudeDelta: 0.12,
  longitudeDelta: 0.12,
};

// DEMO TILES ONLY. No production SLA or complete provider attribution.
// This route must never be enabled as a user-facing production map.
const DEMO_STYLE = 'https://demotiles.maplibre.org/style.json';

export default function WorldMapLibreDevelopmentRoute(): React.JSX.Element {
  const router = useRouter();
  const [status, setStatus] = React.useState('Loading native map…');
  const [cameraText, setCameraText] = React.useState('Pan or zoom to test');
  const [events, setEvents] = React.useState(0);

  // A production app may include the JS bundle before a development native build
  // includes MapLibre. Do not mount any MapLibre view outside development.
  if (!__DEV__ || Platform.OS !== 'android') {
    return (
      <View style={styles.unavailable}>
        <Text style={styles.text}>Map engine laboratory is unavailable in this build.</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Map
        style={StyleSheet.absoluteFill}
        mapStyle={DEMO_STYLE}
        attribution
        logo
        compass
        onDidFinishLoadingMap={() => setStatus('Map loaded')}
        onDidFailLoadingMap={() => setStatus('Map load failed — check device logs')}
        onRegionDidChange={(event) => {
          const { center, zoom } = event.nativeEvent;
          if (!Array.isArray(center) || center.length !== 2) return;
          if (!Number.isFinite(center[0]) || !Number.isFinite(center[1])) return;
          setEvents((value) => value + 1);
          setCameraText(`${center[1].toFixed(4)}, ${center[0].toFixed(4)} · zoom ${Number.isFinite(zoom) ? zoom.toFixed(2) : 'n/a'}`);
        }}
      >
        <Camera initialViewState={{ center: [...toMapLibreCoordinate(FALLBACK)], zoom: 11 }} />
      </Map>
      <View pointerEvents="box-none" style={styles.panel}>
        <Text onPress={() => router.back()} accessibilityRole="button" style={styles.back}>‹ Back</Text>
        <Text style={styles.heading}>World · MapLibre Lab</Text>
        <Text style={styles.text}>{status}</Text>
        <Text style={styles.text}>{cameraText}</Text>
        <Text style={styles.text}>Camera events: {events}</Text>
        <Text style={styles.note}>Development only · no GPS · no Supabase reads · demo tiles</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#111115' },
  unavailable: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#111115' },
  panel: { position: 'absolute', top: 54, left: 16, right: 16, padding: 16, backgroundColor: 'rgba(24,24,28,0.94)', borderRadius: 14 },
  back: { color: '#FFFFFF', fontSize: 16, marginBottom: 10 },
  heading: { color: '#FFFFFF', fontWeight: '700', fontSize: 18, marginBottom: 8 },
  text: { color: '#EAEAEA', marginTop: 5, fontSize: 13 },
  note: { color: '#A0A0A0', marginTop: 10, fontSize: 11 },
});
