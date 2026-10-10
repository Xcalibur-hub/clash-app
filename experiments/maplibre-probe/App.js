import React from 'react';
import { AppState, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { Camera, GeoJSONSource, Layer, Map, Marker } from '@maplibre/maplibre-react-native';

import { ClusterMarkerView } from './src/ClusterMarkerView';
import { DropMarkerView } from './src/DropMarkerView';
import { DropPreview } from './src/DropPreview';
import { clusterExpansionZoom } from './src/probeCluster';
import { regionFromZoom, toMapLibreLngLat } from './src/probeCoordinates';
import { DATASET_SIZES } from './src/probeDatasets';
import {
  formatHitLabel,
  isSelectionBlocked,
  resolvePressFeatures,
  selectionStillValid,
  shouldDismissPreviewOnEmptyTap,
} from './src/probeInteraction';
import {
  formatMs,
  itemsToGeoJson,
  prepareMapPipeline,
  shouldMountMarkerChrome,
} from './src/probePerf';
import { closePreview, isDropSelected, selectProbeDrop } from './src/probeSelection';

// Public demo tiles are for development/prototype testing only; never ship this URL.
const DEMO_STYLE = 'https://demotiles.maplibre.org/style.json';
const GOA_CENTER = [73.83, 15.49];
/** Expanded native source hitbox (default is ~44×44). */
const SOURCE_HITBOX = { top: 28, right: 28, bottom: 28, left: 28 };

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
  const [markerChrome, setMarkerChrome] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState(/** @type {string | null} */ (null));
  const [preview, setPreview] = React.useState(/** @type {{ open: boolean; drop: any }} */ ({
    open: false,
    drop: null,
  }));
  const [selectLatencyMs, setSelectLatencyMs] = React.useState(/** @type {number | null} */ (null));
  const [lastPipelineMs, setLastPipelineMs] = React.useState(/** @type {number | null} */ (null));
  const [lastHitLabel, setLastHitLabel] = React.useState('none');
  const [jsFpsSample, setJsFpsSample] = React.useState(/** @type {number | null} */ (null));
  const [appStateLabel, setAppStateLabel] = React.useState(AppState.currentState);
  const [stressCycles, setStressCycles] = React.useState(0);

  const ignoreRegionUntil = React.useRef(0);
  const selectionBlockedUntil = React.useRef(0);
  const datasetRef = React.useRef(/** @type {readonly any[]} */ ([]));
  const previewRef = React.useRef(preview);
  const selectedIdRef = React.useRef(selectedId);
  const fpsSampling = React.useRef(false);

  previewRef.current = preview;
  selectedIdRef.current = selectedId;

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

  React.useEffect(() => {
    if (!selectionStillValid(selectedId, pipeline.items)) {
      setSelectedId(null);
      setPreview({ open: false, drop: null });
    }
  }, [pipeline.items, selectedId]);

  React.useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      setAppStateLabel(next);
    });
    return () => sub.remove();
  }, []);

  const geojson = React.useMemo(
    () => itemsToGeoJson(pipeline.items),
    [pipeline.items],
  );

  const sampleJsFps = React.useCallback(() => {
    if (fpsSampling.current) return;
    fpsSampling.current = true;
    let frames = 0;
    const start = performance.now();
    const tick = () => {
      frames += 1;
      if (performance.now() - start < 1000) {
        requestAnimationFrame(tick);
        return;
      }
      setJsFpsSample(frames);
      fpsSampling.current = false;
    };
    requestAnimationFrame(tick);
  }, []);

  const onRegionWillChange = React.useCallback(() => {
    sampleJsFps();
  }, [sampleJsFps]);

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
    if (isSelectionBlocked(Date.now(), selectionBlockedUntil.current)) return;
    const t0 = performance.now();
    const next = selectProbeDrop(selectedIdRef.current, drop);
    setSelectedId(next.selectedId);
    setPreview(next.preview);
    setSelectLatencyMs(performance.now() - t0);
  }, []);

  const onSelectCluster = React.useCallback(
    (item) => {
      if (isSelectionBlocked(Date.now(), selectionBlockedUntil.current)) return;
      const targetZoom = clusterExpansionZoom(zoom);
      const settleUntil = Date.now() + 500;
      ignoreRegionUntil.current = settleUntil;
      selectionBlockedUntil.current = settleUntil;
      cameraRef.current?.easeTo({
        center: toMapLibreLngLat({ latitude: item.latitude, longitude: item.longitude }),
        zoom: targetZoom,
        duration: 380,
        easing: 'ease',
      });
      setZoom(targetZoom);
      setCenter({ latitude: item.latitude, longitude: item.longitude });
      setViewport(
        `Lat ${item.latitude.toFixed(4)} · Lng ${item.longitude.toFixed(4)} · Zoom ${targetZoom.toFixed(2)}`,
      );
      setSelectedId(null);
      setPreview({ open: false, drop: null });
    },
    [zoom],
  );

  const onClosePreview = React.useCallback(() => {
    setPreview((current) => closePreview(current));
    setSelectedId(null);
  }, []);

  const applyHit = React.useCallback(
    (hit, source) => {
      if (isSelectionBlocked(Date.now(), selectionBlockedUntil.current)) return;
      setLastHitLabel(formatHitLabel(hit, source));
      if (hit.kind === 'cluster') {
        onSelectCluster(hit);
        return;
      }
      if (hit.kind === 'drop') {
        onSelectDrop(hit.drop);
        return;
      }
      if (shouldDismissPreviewOnEmptyTap(previewRef.current, hit)) {
        onClosePreview();
      }
    },
    [onClosePreview, onSelectCluster, onSelectDrop],
  );

  const onGeoJsonPress = React.useCallback(
    (event) => {
      event?.stopPropagation?.();
      const features = event?.nativeEvent?.features ?? event?.features ?? [];
      applyHit(resolvePressFeatures(features, datasetRef.current), 'geojson');
    },
    [applyHit],
  );

  const onMapPress = React.useCallback(
    (event) => {
      const features = event?.nativeEvent?.features ?? event?.features ?? [];
      // Source presses stopPropagation; empty-map presses land here with no features.
      if (Array.isArray(features) && features.length > 0) {
        applyHit(resolvePressFeatures(features, datasetRef.current), 'map');
        return;
      }
      applyHit({ kind: 'empty' }, 'map');
    },
    [applyHit],
  );

  const resetCamera = React.useCallback(() => {
    const settleUntil = Date.now() + 450;
    ignoreRegionUntil.current = settleUntil;
    selectionBlockedUntil.current = settleUntil;
    cameraRef.current?.easeTo({
      center: GOA_CENTER,
      zoom: 11,
      duration: 280,
      easing: 'ease',
    });
    setZoom(11);
    setCenter({ latitude: 15.49, longitude: 73.83 });
    setViewport('Lat 15.4900 · Lng 73.8300 · Zoom 11.00');
    setLastHitLabel('reset:camera');
  }, []);

  /** Jump camera to a visible Drop without selecting — enables direct map-tap verification. */
  const aimFirstDrop = React.useCallback(() => {
    const dropItem = pipeline.renderItems.find((item) => item.kind === 'drop');
    const target = dropItem
      ? { latitude: dropItem.latitude, longitude: dropItem.longitude, zoom: Math.max(zoom, 14) }
      : pipeline.items.find((item) => item.kind === 'cluster')
        ? {
            latitude: pipeline.items.find((item) => item.kind === 'cluster').latitude,
            longitude: pipeline.items.find((item) => item.kind === 'cluster').longitude,
            zoom: clusterExpansionZoom(zoom),
          }
        : null;
    if (!target) return;
    const settleUntil = Date.now() + 450;
    ignoreRegionUntil.current = settleUntil;
    selectionBlockedUntil.current = settleUntil;
    cameraRef.current?.easeTo({
      center: toMapLibreLngLat(target),
      zoom: target.zoom,
      duration: 320,
      easing: 'ease',
    });
    setZoom(target.zoom);
    setCenter({ latitude: target.latitude, longitude: target.longitude });
    setLastHitLabel('aim:camera-only');
  }, [pipeline.items, pipeline.renderItems, zoom]);

  const runDatasetStress = React.useCallback(() => {
    const sequence = [50, 5000, 50, 1000, 250, 5000];
    let i = 0;
    const tick = () => {
      setDatasetSize(sequence[i % sequence.length]);
      setSelectedId(null);
      setPreview({ open: false, drop: null });
      setStressCycles((n) => n + 1);
      i += 1;
      if (i < sequence.length) setTimeout(tick, 350);
    };
    tick();
  }, []);

  const metrics = pipeline.metrics;
  const sampleDrop = pipeline.dataset[0];
  const showMarkerChrome = shouldMountMarkerChrome(datasetSize, markerChrome);

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
        onRegionWillChange={onRegionWillChange}
        onRegionDidChange={onRegionDidChange}
        onPress={onMapPress}
      >
        <Camera ref={cameraRef} initialViewState={{ center: GOA_CENTER, zoom: 11 }} />

        {/*
          Always mount GeoJSON for direct feature/cluster hit-testing.
          Marker strategy keeps RN Marker chrome on top; hit circles stay
          near-transparent so taps resolve through Source.onPress.
        */}
        <GeoJSONSource
          id="probe-drops"
          data={geojson}
          onPress={onGeoJsonPress}
          hitbox={SOURCE_HITBOX}
        >
          <Layer
            id="probe-clusters"
            type="circle"
            filter={['==', ['get', 'kind'], 'cluster']}
            paint={{
              'circle-color': '#1E3A5F',
              'circle-radius': 20,
              'circle-stroke-width': 2,
              'circle-stroke-color': '#8EC5FF',
              // Keep clusters fully paintable for hit-testing even under Marker chrome.
              'circle-opacity': showMarkerChrome ? 0.35 : 1,
              'circle-stroke-opacity': showMarkerChrome ? 0.5 : 1,
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
              visibility: showMarkerChrome ? 'none' : 'visible',
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
              'circle-radius': 16,
              'circle-stroke-width': 2,
              'circle-stroke-color': '#E8E8EE',
              'circle-opacity': showMarkerChrome ? 0.25 : 1,
              'circle-stroke-opacity': showMarkerChrome ? 0.35 : 1,
            }}
          />
        </GeoJSONSource>

        {showMarkerChrome
          ? pipeline.renderItems.map((item) => {
              // Optional visual chrome only — known to intercept touches on A50.
              if (item.kind === 'cluster') {
                return (
                  <Marker
                    key={item.id}
                    id={item.id}
                    lngLat={toMapLibreLngLat(item)}
                    anchor="center"
                  >
                    <View pointerEvents="none">
                      <ClusterMarkerView count={item.count} />
                    </View>
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
                >
                  <View pointerEvents="none">
                    <DropMarkerView drop={item.drop} selected={selected} />
                  </View>
                </Marker>
              );
            })
          : null}
      </Map>

      <View style={styles.panel} pointerEvents="box-none">
        <ScrollView style={styles.panelScroll} nestedScrollEnabled>
          <Text style={styles.eyebrow}>CLASH · MAP STABILITY PROBE</Text>
          <Text style={styles.heading}>Stability · Interactions</Text>
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
            Select {selectLatencyMs == null ? 'n/a' : formatMs(selectLatencyMs)} · Camera{' '}
            {interactionCount} · JS rAF FPS {jsFpsSample == null ? 'n/a' : `${jsFpsSample}`} · App{' '}
            {appStateLabel}
          </Text>
          <Text style={styles.subline} accessibilityLabel={`Last hit ${lastHitLabel}`}>
            Last hit · {lastHitLabel} · Stress cycles {stressCycles}
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
                  setLastHitLabel(`dataset:${size}`);
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

          <Text style={styles.section}>Marker chrome (visual only · blocks hits)</Text>
          <View style={styles.row}>
            <Pressable
              onPress={() => setMarkerChrome(false)}
              accessibilityRole="button"
              accessibilityLabel="Disable marker chrome"
              style={[styles.chip, !markerChrome && styles.chipActive]}
            >
              <Text style={styles.chipText}>GeoJSON hits</Text>
            </Pressable>
            <Pressable
              onPress={() => setMarkerChrome(true)}
              accessibilityRole="button"
              accessibilityLabel="Enable marker chrome visual only"
              style={[styles.chip, markerChrome && styles.chipActive]}
            >
              <Text style={styles.chipText}>RN Markers</Text>
            </Pressable>
          </View>

          <View style={styles.row}>
            <Pressable
              onPress={resetCamera}
              accessibilityRole="button"
              accessibilityLabel="Reset camera to Goa zoom 11"
              style={styles.sampleBtn}
            >
              <Text style={styles.sampleText}>Reset camera</Text>
            </Pressable>
            <Pressable
              onPress={aimFirstDrop}
              accessibilityRole="button"
              accessibilityLabel="Aim camera at first drop without selecting"
              style={styles.sampleBtn}
            >
              <Text style={styles.sampleText}>Aim (no select)</Text>
            </Pressable>
            <Pressable
              onPress={runDatasetStress}
              accessibilityRole="button"
              accessibilityLabel="Run dataset stress switch"
              style={styles.sampleBtn}
            >
              <Text style={styles.sampleText}>Stress switch</Text>
            </Pressable>
            {sampleDrop ? (
              <Pressable
                onPress={() => {
                  setLastHitLabel(`control:sample:${sampleDrop.id}`);
                  onSelectDrop(sampleDrop);
                }}
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
            Demo tiles only · Direct map taps required for Step 6 · No GPS · No Supabase · Not
            production-ready
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
