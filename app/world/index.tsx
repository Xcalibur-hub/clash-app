import React from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import MapView, {
  Circle,
  type Region,
  PROVIDER_DEFAULT,
  PROVIDER_GOOGLE,
} from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WorldDropMarker, WorldClusterMarker } from '../../components/world/WorldDropMarker';
import { WorldDropPreview } from '../../components/world/WorldDropPreview';
import { WorldMissionBeacon } from '../../components/world/WorldMissionBeacon';
import { Notice } from '../../components/shared/Notice';
import { BackIcon, LocateIcon, PlusIcon, WorldIcon } from '../../components/shared/icons';
import {
  WORLD_MAP_STYLE_DARK,
  WORLD_MAP_STYLE_LIGHT,
} from '../../components/world/worldMapStyle';
import { useClock } from '../../hooks/useClock';
import { useRequireAuth } from '../../hooks/useRequireAuth';
import {
  getForegroundPermission,
  getOneShotLocation,
  requestForegroundPermission,
} from '../../services/locationService';
import { errorText } from '../../services/supabaseClient';
import {
  fetchActiveMissions,
  fetchMissionDrops,
  fetchNearbyWorldDrops,
  fetchRecentWorldDrops,
  type WorldDrop,
  type WorldMission,
} from '../../services/worldService';
import { showNotice, useClash } from '../../store';
import { radius, space, typeScale, useTheme, useThemeColors } from '../../theme';
import { clusterWorldDrops, regionMovedSignificantly } from '../../utils/worldCluster';
import { tap as hapticTap } from '../../utils/haptics';

type WorldFilter = 'nearby' | 'recent' | 'mission';

const FILTERS: readonly { key: WorldFilter; label: string }[] = [
  { key: 'nearby', label: 'Nearby' },
  { key: 'recent', label: 'Recent' },
  { key: 'mission', label: 'Missions' },
];

/** Quiet default — coastal Goa — used when location is unavailable. */
const FALLBACK_REGION: Region = {
  latitude: 15.4909,
  longitude: 73.8278,
  latitudeDelta: 0.12,
  longitudeDelta: 0.12,
};

const NEARBY_ZOOM: Region = {
  ...FALLBACK_REGION,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

/** Estimated preview card height for gentle camera offset (not aggressive zoom). */
const PREVIEW_CAMERA_BIAS = 0.16;

/**
 * World map — CONTENT markers only.
 * One-shot location for camera/recenter. No live people. No continuous watch.
 */
export default function WorldScreen(): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const requireAuth = useRequireAuth();
  const { dispatch } = useClash();
  const { scheme } = useTheme();
  const t = useThemeColors();
  const now = useClock(30_000);
  const mapRef = React.useRef<MapView | null>(null);
  const light = scheme === 'light';

  const [missions, setMissions] = React.useState<WorldMission[]>([]);
  const [drops, setDrops] = React.useState<WorldDrop[]>([]);
  const [filter, setFilter] = React.useState<WorldFilter>('nearby');
  const [region, setRegion] = React.useState<Region>(FALLBACK_REGION);
  const [queryOrigin, setQueryOrigin] = React.useState<Region>(FALLBACK_REGION);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [searching, setSearching] = React.useState(false);
  const [showSearchArea, setShowSearchArea] = React.useState(false);
  const [locationDenied, setLocationDenied] = React.useState(false);
  const [privacyOpen, setPrivacyOpen] = React.useState(false);
  const [viewerDot, setViewerDot] = React.useState<{ latitude: number; longitude: number } | null>(null);

  const primaryMission = missions[0] ?? null;
  const selected = React.useMemo(
    () => (selectedId ? drops.find((d) => d.id === selectedId) ?? null : null),
    [drops, selectedId],
  );

  const floatBg = light ? 'rgba(255,255,255,0.94)' : 'rgba(30,30,34,0.94)';
  const floatBorder = light ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)';

  // Close preview if the selected Drop vanished after a refresh (expire/block).
  React.useEffect(() => {
    if (selectedId && !drops.some((d) => d.id === selectedId)) {
      setSelectedId(null);
    }
  }, [drops, selectedId]);

  const mapItems = React.useMemo(
    () => clusterWorldDrops(drops, region),
    [drops, region],
  );

  const loadMissions = React.useCallback(async (): Promise<void> => {
    setMissions(await fetchActiveMissions());
  }, []);

  const loadDropsFor = React.useCallback(
    async (mode: WorldFilter, centre: { latitude: number; longitude: number }): Promise<void> => {
      if (mode === 'recent') {
        setDrops(await fetchRecentWorldDrops(40));
        return;
      }
      if (mode === 'mission') {
        const active = (await fetchActiveMissions())[0];
        if (!active) {
          setDrops([]);
          return;
        }
        setDrops(await fetchMissionDrops(active.id, 40));
        return;
      }
      setDrops(
        await fetchNearbyWorldDrops(
          { latitude: centre.latitude, longitude: centre.longitude },
          25,
          40,
        ),
      );
    },
    [],
  );

  const bootstrap = React.useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      await loadMissions();
      let centre = { latitude: FALLBACK_REGION.latitude, longitude: FALLBACK_REGION.longitude };
      let permission = await getForegroundPermission();
      if (permission !== 'granted') {
        permission = await requestForegroundPermission();
      }
      if (permission === 'granted') {
        setLocationDenied(false);
        try {
          const point = await getOneShotLocation();
          centre = { latitude: point.latitude, longitude: point.longitude };
          setViewerDot(centre);
          const next: Region = {
            ...centre,
            latitudeDelta: NEARBY_ZOOM.latitudeDelta,
            longitudeDelta: NEARBY_ZOOM.longitudeDelta,
          };
          setRegion(next);
          setQueryOrigin(next);
          mapRef.current?.animateToRegion(next, 650);
        } catch {
          setLocationDenied(true);
        }
      } else {
        setLocationDenied(true);
        setFilter('recent');
      }
      await loadDropsFor(permission === 'granted' ? 'nearby' : 'recent', centre);
    } catch (error) {
      dispatch(showNotice(errorText(error)));
    } finally {
      setLoading(false);
    }
  }, [dispatch, loadMissions, loadDropsFor]);

  React.useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const onFilterChange = async (next: WorldFilter): Promise<void> => {
    hapticTap();
    setFilter(next);
    setSelectedId(null);
    setSearching(true);
    try {
      await loadDropsFor(next, { latitude: region.latitude, longitude: region.longitude });
      setQueryOrigin(region);
      setShowSearchArea(false);
    } catch (error) {
      dispatch(showNotice(errorText(error)));
    } finally {
      setSearching(false);
    }
  };

  const searchThisArea = async (): Promise<void> => {
    hapticTap();
    setFilter('nearby');
    setSearching(true);
    try {
      await loadDropsFor('nearby', { latitude: region.latitude, longitude: region.longitude });
      setQueryOrigin(region);
      setShowSearchArea(false);
      setSelectedId(null);
    } catch (error) {
      dispatch(showNotice(errorText(error)));
    } finally {
      setSearching(false);
    }
  };

  const recenter = async (): Promise<void> => {
    hapticTap();
    let permission = await getForegroundPermission();
    if (permission !== 'granted') {
      permission = await requestForegroundPermission();
    }
    if (permission !== 'granted') {
      setLocationDenied(true);
      dispatch(showNotice('Location permission is needed to recenter.'));
      return;
    }
    try {
      const point = await getOneShotLocation();
      const next: Region = {
        latitude: point.latitude,
        longitude: point.longitude,
        latitudeDelta: NEARBY_ZOOM.latitudeDelta,
        longitudeDelta: NEARBY_ZOOM.longitudeDelta,
      };
      setViewerDot({ latitude: point.latitude, longitude: point.longitude });
      setLocationDenied(false);
      setRegion(next);
      mapRef.current?.animateToRegion(next, 550);
      setFilter('nearby');
      setSearching(true);
      await loadDropsFor('nearby', point);
      setQueryOrigin(next);
      setShowSearchArea(false);
    } catch (error) {
      dispatch(showNotice(errorText(error)));
    } finally {
      setSearching(false);
    }
  };

  const zoomToCluster = (latitude: number, longitude: number): void => {
    hapticTap();
    const next: Region = {
      latitude,
      longitude,
      latitudeDelta: Math.max(region.latitudeDelta * 0.45, 0.02),
      longitudeDelta: Math.max(region.longitudeDelta * 0.45, 0.02),
    };
    setRegion(next);
    mapRef.current?.animateToRegion(next, 420);
  };

  const selectDrop = (drop: WorldDrop): void => {
    hapticTap();
    setSelectedId(drop.id);
    // Gentle bias so the marker sits above the floating preview — no aggressive zoom.
    const next: Region = {
      latitude: drop.approxLat - region.latitudeDelta * PREVIEW_CAMERA_BIAS,
      longitude: drop.approxLng,
      latitudeDelta: region.latitudeDelta,
      longitudeDelta: region.longitudeDelta,
    };
    mapRef.current?.animateToRegion(next, 280);
  };

  const participate = (): void => {
    if (!primaryMission) {
      dispatch(showNotice('No active Mission this week.'));
      return;
    }
    if (!requireAuth()) return;
    hapticTap();
    router.push(`/world/compose?missionId=${primaryMission.id}`);
  };

  const openDrop = (drop: WorldDrop): void => {
    router.push(`/world/drop/${drop.id}`);
  };

  const provider = Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT;
  const mapStyle = light ? WORLD_MAP_STYLE_LIGHT : WORLD_MAP_STYLE_DARK;
  const bottomPad = insets.bottom + space.md;
  const midBottom = (selected ? 300 : 120) + insets.bottom;

  return (
    <View style={[styles.root, { backgroundColor: t.background }]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={provider}
        initialRegion={FALLBACK_REGION}
        customMapStyle={mapStyle}
        userInterfaceStyle={light ? 'light' : 'dark'}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        showsPointsOfInterest={false}
        toolbarEnabled={false}
        moveOnMarkerPress={false}
        onRegionChangeComplete={(next) => {
          setRegion(next);
          setShowSearchArea(regionMovedSignificantly(queryOrigin, next));
        }}
        onPress={() => setSelectedId(null)}
      >
        {mapItems.map((item) => {
          if (item.kind === 'cluster') {
            return (
              <WorldClusterMarker
                key={item.id}
                id={item.id}
                latitude={item.latitude}
                longitude={item.longitude}
                count={item.count}
                onPress={() => zoomToCluster(item.latitude, item.longitude)}
              />
            );
          }
          return (
            <WorldDropMarker
              key={item.id}
              drop={item.drop}
              selected={item.drop.id === selectedId}
              onPress={selectDrop}
            />
          );
        })}
        {viewerDot ? (
          <Circle
            center={viewerDot}
            radius={140}
            strokeWidth={1}
            strokeColor={light ? 'rgba(17,17,19,0.22)' : 'rgba(255,255,255,0.28)'}
            fillColor={light ? 'rgba(17,17,19,0.06)' : 'rgba(255,255,255,0.07)'}
          />
        ) : null}
      </MapView>

      {/* Top floating World bar — not a conventional nav header */}
      <View style={[styles.topChrome, { paddingTop: insets.top + space.sm }]} pointerEvents="box-none">
        <View
          style={[
            styles.topBar,
            {
              backgroundColor: floatBg,
              borderColor: floatBorder,
              shadowColor: t.shadowColor,
            },
          ]}
        >
          <Pressable
            onPress={() => {
              hapticTap();
              if (router.canGoBack()) router.back();
              else router.replace('/(tabs)/explore');
            }}
            style={styles.barIcon}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={8}
          >
            <BackIcon size={20} color={t.textPrimary} />
          </Pressable>

          <Text allowFontScaling={false} style={[styles.brand, { color: t.textPrimary }]}>
            World
          </Text>

          <View style={styles.barActions}>
            <Pressable
              onPress={() => {
                hapticTap();
                setPrivacyOpen((v) => !v);
              }}
              style={styles.barIcon}
              accessibilityRole="button"
              accessibilityLabel="World privacy"
              hitSlop={8}
            >
              <WorldIcon size={18} color={t.textSecondary} />
            </Pressable>
            <Pressable
              onPress={() => void recenter()}
              style={styles.barIcon}
              accessibilityRole="button"
              accessibilityLabel="Recenter map"
              hitSlop={8}
            >
              <LocateIcon size={18} color={t.textPrimary} />
            </Pressable>
          </View>
        </View>

        {privacyOpen ? (
          <Text
            allowFontScaling={false}
            style={[
              styles.privacy,
              {
                color: t.textSecondary,
                backgroundColor: floatBg,
                borderColor: floatBorder,
              },
            ]}
          >
            World shows approximate areas where content was posted. It does not show people's live locations.
          </Text>
        ) : null}

        {primaryMission ? (
          <WorldMissionBeacon
            mission={primaryMission}
            now={now}
            onPress={() => {
              void onFilterChange('mission');
            }}
          />
        ) : null}

        {locationDenied ? (
          <Text
            allowFontScaling={false}
            style={[
              styles.banner,
              {
                color: t.textSecondary,
                backgroundColor: floatBg,
                borderColor: floatBorder,
              },
            ]}
          >
            Location off — browse Recent or Search this area.
          </Text>
        ) : null}
      </View>

      <View style={[styles.midChrome, { bottom: midBottom }]} pointerEvents="box-none">
        {showSearchArea && filter === 'nearby' ? (
          <Pressable
            onPress={() => void searchThisArea()}
            style={[
              styles.searchArea,
              {
                backgroundColor: light ? '#111113' : '#F5F5F7',
                shadowColor: t.shadowColor,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Search this area"
          >
            <Text
              allowFontScaling={false}
              style={[styles.searchAreaText, { color: light ? '#F5F5F7' : '#111113' }]}
            >
              {searching ? 'Searching…' : 'Search this area'}
            </Text>
          </Pressable>
        ) : null}

        {!loading && drops.length === 0 ? (
          <View
            style={[
              styles.empty,
              {
                backgroundColor: floatBg,
                borderColor: floatBorder,
                shadowColor: t.shadowColor,
              },
            ]}
          >
            <Text allowFontScaling={false} style={[styles.emptyTitle, { color: t.textPrimary }]}>
              Nothing here yet
            </Text>
            <Text allowFontScaling={false} style={[styles.emptyBody, { color: t.textSecondary }]}>
              Be the first to leave something worth finding.
            </Text>
            {primaryMission ? (
              <Pressable
                onPress={participate}
                style={[styles.emptyCta, { backgroundColor: light ? '#111113' : '#F5F5F7' }]}
                accessibilityRole="button"
              >
                <Text
                  allowFontScaling={false}
                  style={[styles.emptyCtaText, { color: light ? '#F5F5F7' : '#111113' }]}
                >
                  Join this week's Mission
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={[styles.bottomChrome, { paddingBottom: bottomPad }]} pointerEvents="box-none">
        {selected ? (
          <WorldDropPreview
            drop={selected}
            onView={openDrop}
            onDismiss={() => setSelectedId(null)}
          />
        ) : (
          <View style={styles.controls}>
            <View
              style={[
                styles.filters,
                {
                  backgroundColor: floatBg,
                  borderColor: floatBorder,
                  shadowColor: t.shadowColor,
                },
              ]}
            >
              {FILTERS.map((item) => {
                const active = filter === item.key;
                return (
                  <Pressable
                    key={item.key}
                    onPress={() => void onFilterChange(item.key)}
                    style={[
                      styles.filter,
                      active && {
                        backgroundColor: light ? '#111113' : 'rgba(255,255,255,0.14)',
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={item.label}
                  >
                    <Text
                      allowFontScaling={false}
                      style={[
                        styles.filterText,
                        { color: active ? (light ? '#F5F5F7' : t.textPrimary) : t.textMuted },
                        active && styles.filterTextOn,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              onPress={participate}
              style={[
                styles.create,
                {
                  backgroundColor: light ? '#111113' : '#F5F5F7',
                  shadowColor: t.shadowColor,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Create World Drop"
            >
              <PlusIcon size={20} color={light ? '#F5F5F7' : '#111113'} strokeWidth={2.4} />
            </Pressable>
          </View>
        )}
      </View>

      {loading ? (
        <View style={[styles.loading, { backgroundColor: light ? 'rgba(244,243,239,0.28)' : 'rgba(9,9,11,0.35)' }]} pointerEvents="none">
          <ActivityIndicator color={t.textPrimary} />
        </View>
      ) : null}

      <Notice offset={0} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topChrome: {
    position: 'absolute',
    left: space.md,
    right: space.md,
    gap: space.sm,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingHorizontal: 6,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  brand: {
    ...typeScale.section,
    flex: 1,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  barActions: { flexDirection: 'row', alignItems: 'center' },
  barIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  privacy: {
    ...typeScale.meta,
    padding: space.sm,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  banner: {
    ...typeScale.meta,
    paddingHorizontal: space.sm,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  midChrome: {
    position: 'absolute',
    left: space.md,
    right: space.md,
    alignItems: 'center',
    gap: space.sm,
  },
  searchArea: {
    paddingHorizontal: space.md,
    paddingVertical: 11,
    borderRadius: radius.pill,
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  searchAreaText: { ...typeScale.label, fontWeight: '600' },
  empty: {
    alignItems: 'center',
    gap: 6,
    padding: space.md,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 320,
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  emptyTitle: { ...typeScale.label, fontWeight: '600' },
  emptyBody: { ...typeScale.meta, textAlign: 'center' },
  emptyCta: {
    marginTop: 4,
    paddingHorizontal: space.md,
    paddingVertical: 9,
    borderRadius: radius.pill,
  },
  emptyCtaText: { ...typeScale.meta, fontWeight: '600' },
  bottomChrome: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.md,
    gap: space.sm,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  filters: {
    flex: 1,
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  filter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  filterText: { ...typeScale.meta },
  filterTextOn: { fontWeight: '600' },
  create: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
