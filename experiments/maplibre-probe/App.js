import React from 'react';
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { Camera, GeoJSONSource, Layer, Map, Marker } from '@maplibre/maplibre-react-native';

import { ClusterMarkerView } from './src/ClusterMarkerView';
import { DropMarkerView } from './src/DropMarkerView';
import { DropPreview } from './src/DropPreview';
import { clusterExpansionZoom } from './src/probeCluster';
import { regionFromZoom, toMapLibreLngLat } from './src/probeCoordinates';
import { DATASET_SIZES } from './src/probeDatasets';
import {
  formatMs,
  itemsToGeoJson,
  prepareMapPipeline,
} from './src/probePerf';
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
  const [datasetSize, setDatasetSize] = React.useState(50);
  const [clusterMode, setClusterMode] = React.useState(/** @type {'grid' | 'hierarchical'} */ ('hierarchical'));
  const [selectedId, setSelectedId] = React.useState(/** @type {string | null} */ (null));
  const [preview, setPreview] = React.useState(/** @type {{ open: boolean; drop: any }} */ ({
    open: false,
    drop: null,
  }));
  const [selectLatencyMs, setSelectLatencyMs] = React.useState(/** @type {number | null} */ (null));
  const [lastPipelineMs, setLastPipelineMs] = React.useState(/** @type {number | null} */ (null));

  const ignoreRegionUntil = React.useRef(0);
  const datasetRef = React.useRef(/** @type {readonly any[]} */ ([]));

  const region = React.useMemo(
    () => regionFromZoom(center.latitude, center.longitude, zoom),
    [center.latitude, center.longitude, zoom],
  );

  const pipeline = React.useMemo(() => {
    const t0 = performance.now();
    const result = prepareMapPipeline({
      datasetSize,
      region,
      zoom,
      clusterMode,
      seed: 1,
    });
    return { ...result, wallMs: performance.now() - t0 };
  }, [datasetSize, region, zoom, clusterMode]);

  React.useEffect(() => {
    datasetRef.current = pipeline.dataset;
    setLastPipelineMs(pipeline.wallMs);
  }, [pipeline]);

  const geojson = React.useMemo(
    () => itemsToGeoJson(pipeline.items),
    [pipeline.items],
  );

  const onRegionDidChange = React.useCallback((event) => {
    const nextCenter = event.nativeEvent?.center;
    const nextZoom = event.nativeEvent?.zoom;
    if (!Array.isArray(nextCenter) || nextCenter.length < 2) return;
    if (!Number.isFinite(nextCenter[0]) || !Number.isFinite(nextCenter[1])) return;
    if (Date.now() < ignoreRegionUntil.current) return;

    setInteractionCount((count) => count + 1);
    const zoomValue = Number.isFinite(nextZoom) ? nextZoom : 11;
    setZoom(zoomValue);
    setCenter({ latitude: nextCenter[1], longitude: nextCenter[0] });
    setViewport(
      `Lat ${nextCenter[1].toFixed(4)} · Lng ${nextCenter[0].toFixed(4)} · Zoom ${zoomValue.toFixed(2)}`,
    );
  }, []);

  const onSelectDrop = React.useCallback((drop) => {
    const t0 = performance.now();
    const next = selectProbeDrop(selectedId, drop);
    setSelectedId(next.selectedId);
    setPreview(next.preview);
    setSelectLatencyMs(performance.now() - t0);
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

  const onGeoJsonPress = React.useCallback(
    (event) => {
      const features = event?.nativeEvent?.features ?? event?.features;
      const feature = Array.isArray(features) ? features[0] : null;
      if (!feature?.properties) return;
      const { kind, id, count } = feature.properties;
      if (kind === 'cluster') {
        const [longitude, latitude] = feature.geometry?.coordinates ?? [];
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
        onSelectCluster({
          kind: 'cluster',
          id: String(id),
          latitude,
          longitude,
          count: Number(count) || 0,
          drops: [],
        });
        return;
      }
      if (kind === 'drop' && id) {
        const drop = datasetRef.current.find((entry) => entry.id === id);
        if (drop) onSelectDrop(drop);
      }
    },
    [onSelectCluster, onSelectDrop],
  );

  const metrics = pipeline.metrics;
  const sampleDrop = pipeline.dataset[0];

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

        {pipeline.strategy === 'geojson-layers' ? (
          <GeoJSONSource id="probe-drops" data={geojson} onPress={onGeoJsonPress}>
            <Layer
              id="probe-clusters"
              type="circle"
              filter={['==', ['get', 'kind'], 'cluster']}
              paint={{
                'circle-color': '#1E3A5F',
                'circle-radius': 18,
                'circle-stroke-width': 2,
                'circle-stroke-color': '#8EC5FF',
              }}
            />
            <Layer
              id="probe-cluster-count"
              type="symbol"
              filter={['==', ['get', 'kind'], 'cluster']}
              layout={{
                'text-field': ['to-string', ['get', 'count']],
                'text-size': 12,
                'text-allow-overlap': true,
              }}
              paint={{ 'text-color': '#F4F8FF' }}
            />
            <Layer
              id="probe-drop-circles"
              type="circle"
              filter={['==', ['get', 'kind'], 'drop']}
              paint={{
                'circle-color': [
                  'case',
                  ['==', ['get', 'id'], selectedId ?? ''],
                  '#F5C451',
                  '#2A2A32',
                ],
                'circle-radius': 10,
                'circle-stroke-width': 2,
                'circle-stroke-color': '#E8E8EE',
              }}
            />
          </GeoJSONSource>
        ) : (
          pipeline.renderItems.map((item) => {
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
          })
        )}
      </Map>

      <View style={styles.panel} pointerEvents="box-none">
        <ScrollView style={styles.panelScroll} nestedScrollEnabled>
          <Text style={styles.eyebrow}>CLASH · MAP PERF PROBE</Text>
          <Text style={styles.heading}>Performance · Tiles eval</Text>
          <Text style={styles.subline}>
            {mapError
              ? 'Map load failed — inspect Metro/native logs'
              : ready
                ? `Map loaded · ${pipeline.strategy}`
                : 'Waiting for map tiles…'}
          </Text>
          <Text style={styles.subline}>{viewport}</Text>
          <Text style={styles.subline}>
            Visible {metrics.visibleCount}/{metrics.datasetSize} · Items {metrics.itemCount} (C
            {metrics.clusterCount}/D{metrics.dropCount}) · Render {metrics.renderItemCount}
          </Text>
          <Text style={styles.subline}>
            Prep {formatMs(metrics.prepareMs)} · Filter {formatMs(metrics.filterMs)} · Cluster{' '}
            {formatMs(metrics.clusterMs)} · Pipe {formatMs(lastPipelineMs ?? metrics.totalMs)}
          </Text>
          <Text style={styles.subline}>
            Select {selectLatencyMs == null ? 'n/a' : formatMs(selectLatencyMs)} · Camera events{' '}
            {interactionCount} · FPS/mem not measured
          </Text>

          <Text style={styles.section}>Dataset</Text>
          <View style={styles.row}>
            {DATASET_SIZES.map((size) => (
              <Pressable
                key={size}
                onPress={() => {
                  setDatasetSize(size);
                  setSelectedId(null);
                  setPreview({ open: false, drop: null });
                }}
                accessibilityRole="button"
                accessibilityLabel={`Load ${size} drops`}
                style={[styles.chip, datasetSize === size && styles.chipActive]}
              >
                <Text style={styles.chipText}>{size}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.section}>Cluster mode</Text>
          <View style={styles.row}>
            {(['hierarchical', 'grid']).map((mode) => (
              <Pressable
                key={mode}
                onPress={() => setClusterMode(/** @type {'grid' | 'hierarchical'} */ (mode))}
                accessibilityRole="button"
                accessibilityLabel={`Use ${mode} clustering`}
                style={[styles.chip, clusterMode === mode && styles.chipActive]}
              >
                <Text style={styles.chipText}>{mode === 'grid' ? 'World grid' : 'Hierarchical'}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.row}>
            {sampleDrop ? (
              <Pressable
                onPress={() => onSelectDrop(sampleDrop)}
                accessibilityRole="button"
                accessibilityLabel="Select sample drop"
                style={styles.sampleBtn}
              >
                <Text style={styles.sampleText}>Sample Drop</Text>
              </Pressable>
            ) : null}
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
            Demo tiles only · No GPS · No Supabase · No production keys · Not production-ready
          </Text>
        </ScrollView>
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
    top: 48,
    left: 12,
    right: 12,
    maxHeight: '46%',
    borderRadius: 16,
    backgroundColor: 'rgba(18,18,22,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    overflow: 'hidden',
  },
  panelScroll: { padding: 14 },
  eyebrow: { color: '#AAAAAF', fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  heading: { color: '#FFFFFF', fontSize: 18, fontWeight: '600', marginTop: 4 },
  subline: { color: '#D8D8DD', fontSize: 11, marginTop: 6 },
  section: { color: '#A0A0A8', fontSize: 11, fontWeight: '700', marginTop: 10, marginBottom: 4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#2A2A32',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  chipActive: { borderColor: '#F5C451', backgroundColor: '#3A3420' },
  chipText: { color: '#F2F2F6', fontSize: 12, fontWeight: '600' },
  sampleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#2A2A32',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    marginTop: 8,
  },
  sampleText: { color: '#F5C451', fontSize: 12, fontWeight: '600' },
  footnote: { color: '#888890', fontSize: 10, marginTop: 10, marginBottom: 4 },
});
