import React from 'react';
import { StatusBar, StyleSheet, Text, View } from 'react-native';
import { Camera, Map } from '@maplibre/maplibre-react-native';

// Public demo tiles are for development/prototype testing only; never ship this URL.
const DEMO_STYLE = 'https://demotiles.maplibre.org/style.json';
const GOA_CENTER = [73.83, 15.27]; // MapLibre coordinates are [longitude, latitude].

export default function App() {
  const [ready, setReady] = React.useState(false);
  const [mapError, setMapError] = React.useState(false);
  const [interactionCount, setInteractionCount] = React.useState(0);
  const [viewport, setViewport] = React.useState('Pan or zoom to test');

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <Map
        style={styles.map}
        mapStyle={DEMO_STYLE}
        attribution
        logo
        compass
        onDidFinishLoadingMap={() => setReady(true)}
        onDidFailLoadingMap={() => setMapError(true)}
        onRegionDidChange={(event) => {
          const center = event.nativeEvent?.center;
          if (!Array.isArray(center) || center.length < 2) return;
          setInteractionCount((count) => count + 1);
          setViewport(`Lat ${center[1].toFixed(4)} · Lng ${center[0].toFixed(4)}`);
        }}
      >
        <Camera initialViewState={{ center: GOA_CENTER, zoom: 10 }} />
      </Map>
      <View style={styles.panel} pointerEvents="none">
        <Text style={styles.eyebrow}>CLASH · MAP ENGINE PROBE</Text>
        <Text style={styles.heading}>MapLibre on Android</Text>
        <Text style={styles.subline}>{mapError ? 'Map load failed — inspect Metro/native logs' : ready ? 'Map loaded' : 'Waiting for map tiles…'}</Text>
        <Text style={styles.subline}>{viewport}</Text>
        <Text style={styles.subline}>Camera change events: {interactionCount}</Text>
        <Text style={styles.footnote}>No GPS · No authentication · No Supabase · Demo tiles only</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111115' },
  map: { flex: 1 },
  panel: {
    position: 'absolute', top: 52, left: 16, right: 16,
    padding: 16, borderRadius: 16, backgroundColor: 'rgba(18,18,22,0.92)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)',
  },
  eyebrow: { color: '#AAAAAF', fontSize: 10, fontWeight: '700', letterSpacing: 1.4 },
  heading: { color: '#FFFFFF', fontSize: 19, fontWeight: '600', marginTop: 6 },
  subline: { color: '#D8D8DD', fontSize: 12, marginTop: 8 },
  footnote: { color: '#888890', fontSize: 10, marginTop: 12 },
});
