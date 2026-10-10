import React from 'react';
import { Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { Camera, Map, Marker } from '@maplibre/maplibre-react-native';

import { ClusterMarkerView } from './src/ClusterMarkerView';
import { DropMarkerView } from './src/DropMarkerView';
import { DropPreview } from './src/DropPreview';
import { clusterExpansionZoom, clusterProbeDrops } from './src/probeCluster';
import { regionFromZoom, toMapLibreLngLat } from './src/probeCoordinates';
import { SYNTHETIC_DROPS } from './src/probeDrops';
import { closePreview, isDropSelected, selectProbeDrop } from './src/probeSelection';

// Public demo tiles are for development/prototype testing only; never ship this URL.
const DEMO_STYLE = 'https://demotiles.maplibre.org/style.json';
const GOA_CENTER = [73.83, 15.49];

export default function App() {
  const cameraRef = React.useRef(null);
  const [ready, setReady] = React.useState(false);
  const [mapError, setMapError] = React.useState(false);
  const [interactionCount, setInteractionCount] = React.useState(0);
  const [viewport, setViewport] = React.useState('Pan or zoom to test');
  const [zoom, setZoom] = React.useState(11);
  const [center, setCenter] = React.useState({ latitude: 15.49, longitude: 73.83 });
  const [selectedId, setSelectedId] = React.useState(/** @type {string | null} */ (null));
  const [preview, setPreview] = React.useState(/** @type {{ open: boolean; drop: any }} */ ({
    open: false,
    drop: null,
  }));

  // Ignore the first few region events after a programmatic cluster expand.
  const ignoreRegionUntil = React.useRef(0);

  const region = React.useMemo(
    () => regionFromZoom(center.latitude, center.longitude, zoom),
    [center.latitude, center.longitude, zoom],
  );

  const mapItems = React.useMemo(
    () => clusterProbeDrops(SYNTHETIC_DROPS, region),
    [region],
  );

  const onRegionDidChange = React.useCallback((event) => {
    const nextCenter = event.nativeEvent?.center;
    const nextZoom = event.nativeEvent?.zoom;
    if (!Array.isArray(nextCenter) || nextCenter.length < 2) return;
    if (!Number.isFinite(nextCenter[0]) || !Number.isFinite(nextCenter[1])) return;

    if (Date.now() < ignoreRegionUntil.current) {
      return;
    }

    setInteractionCount((count) => count + 1);
    const zoomValue = Number.isFinite(nextZoom) ? nextZoom : 11;
    setZoom(zoomValue);
    setCenter({ latitude: nextCenter[1], longitude: nextCenter[0] });
    setViewport(
      `Lat ${nextCenter[1].toFixed(4)} · Lng ${nextCenter[0].toFixed(4)} · Zoom ${zoomValue.toFixed(2)}`,
    );
  }, []);

  const onSelectDrop = React.useCallback((drop) => {
    const next = selectProbeDrop(selectedId, drop);
    setSelectedId(next.selectedId);
    setPreview(next.preview);
  }, [selectedId]);

  const onSelectCluster = React.useCallback(
    (item) => {
      const targetZoom = clusterExpansionZoom(zoom);
      ignoreRegionUntil.current = Date.now() + 450;
      cameraRef.current?.easeTo({
        center: toMapLibreLngLat({ latitude: item.latitude, longitude: item.longitude }),
        zoom: targetZoom,
        duration: 380,
        easing: 'ease',
      });
      // Optimistic cluster refresh; region callback will reconcile shortly after.
      setZoom(targetZoom);
      setCenter({ latitude: item.latitude, longitude: item.longitude });
      setSelectedId(null);
      setPreview({ open: false, drop: null });
    },
    [zoom],
  );

  const onClosePreview = React.useCallback(() => {
    setPreview((current) => closePreview(current));
    setSelectedId(null);
  }, []);

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
        onRegionDidChange={onRegionDidChange}
      >
        <Camera ref={cameraRef} initialViewState={{ center: GOA_CENTER, zoom: 11 }} />
        {mapItems.map((item) => {
          if (item.kind === 'cluster') {
            return (
              <Marker
                key={item.id}
                id={item.id}
                lngLat={toMapLibreLngLat(item)}
                anchor="center"
                onPress={() => onSelectCluster(item)}
              >
                <ClusterMarkerView count={item.count} onPress={() => onSelectCluster(item)} />
              </Marker>
            );
          }
          const selected = isDropSelected(selectedId, item.drop.id);
          return (
            <Marker
              key={item.id}
              id={item.id}
              lngLat={toMapLibreLngLat(item)}
              anchor="center"
              onPress={() => onSelectDrop(item.drop)}
            >
              <DropMarkerView
                drop={item.drop}
                selected={selected}
                onPress={() => onSelectDrop(item.drop)}
              />
            </Marker>
          );
        })}
      </Map>

      <View style={styles.panel} pointerEvents="box-none">
        <Text style={styles.eyebrow}>CLASH · MAP ENGINE PROBE</Text>
        <Text style={styles.heading}>Markers · Clusters · Preview</Text>
        <Text style={styles.subline}>
          {mapError
            ? 'Map load failed — inspect Metro/native logs'
            : ready
              ? 'Map loaded · synthetic Drops only'
              : 'Waiting for map tiles…'}
        </Text>
        <Text style={styles.subline}>{viewport}</Text>
        <Text style={styles.subline}>
          Items {mapItems.length} · Drops {SYNTHETIC_DROPS.length} · Camera events {interactionCount}
        </Text>
        <View style={styles.sampleRow}>
          <Pressable
            onPress={() => onSelectDrop(SYNTHETIC_DROPS[0])}
            accessibilityRole="button"
            accessibilityLabel="Select sample drop Riverfront mural"
            style={styles.sampleBtn}
          >
            <Text style={styles.sampleText}>Sample Drop</Text>
          </Pressable>
          {selectedId ? (
            <Pressable
              onPress={onClosePreview}
              accessibilityRole="button"
              accessibilityLabel="Clear selection"
              style={styles.sampleBtn}
            >
              <Text style={styles.sampleText}>Clear</Text>
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.footnote}>
          No GPS · No authentication · No Supabase · Demo tiles only · Not production-ready
        </Text>
      </View>

      {preview.open && preview.drop ? (
        <DropPreview drop={preview.drop} onClose={onClosePreview} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111115' },
  map: { flex: 1 },
  panel: {
    position: 'absolute',
    top: 52,
    left: 16,
    right: 16,
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(18,18,22,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  eyebrow: { color: '#AAAAAF', fontSize: 10, fontWeight: '700', letterSpacing: 1.4 },
  heading: { color: '#FFFFFF', fontSize: 19, fontWeight: '600', marginTop: 6 },
  subline: { color: '#D8D8DD', fontSize: 12, marginTop: 8 },
  sampleRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  sampleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#2A2A32',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  sampleText: { color: '#F5C451', fontSize: 12, fontWeight: '600' },
  footnote: { color: '#888890', fontSize: 10, marginTop: 12 },
});
