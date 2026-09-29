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
import { WORLD_MAP_STYLE } from '../../components/world/worldMapStyle';
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
import { useAuth } from '../../store/AuthProvider';
import { color, ink, radius, space, typeScale } from '../../theme';
import { clusterWorldDrops, regionMovedSignificantly } from '../../utils/worldCluster';
import { tap as hapticTap } from '../../utils/haptics';

type WorldFilter = 'nearby' | 'recent' | 'mission';

const FILTERS: readonly { key: WorldFilter; label: string }[] = [
  { key: 'nearby', label: 'Nearby' },
  { key: 'recent', label: 'Recent' },
  { key: 'mission', label: 'Mission' },
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

/**
 * World map — CONTENT markers only.
 * One-shot location for camera/recenter. No live people. No continuous watch.
 */
export default function WorldScreen(): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const requireAuth = useRequireAuth();
  const { signedIn } = useAuth();
  const { dispatch, state } = useClash();
  const now = useClock(30_000);
  const mapRef = React.useRef<MapView | null>(null);

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

  return (
    <View style={styles.root}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={provider}
        initialRegion={FALLBACK_REGION}
        customMapStyle={WORLD_MAP_STYLE}
        userInterfaceStyle="dark"
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
              onPress={(drop) => {
                hapticTap();
                setSelectedId(drop.id);
              }}
            />
          );
        })}
        {viewerDot ? (
          <Circle
            center={viewerDot}
            radius={140}
            strokeWidth={1}
            strokeColor="rgba(255,255,255,0.28)"
            fillColor="rgba(255,255,255,0.07)"
          />
        ) : null}
      </MapView>

      <View style={[styles.topChrome, { paddingTop: insets.top + space.sm }]} pointerEvents="box-none">
        <View style={styles.topRow}>
          <Pressable
            onPress={() => {
              hapticTap();
              if (router.canGoBack()) router.back();
              else router.replace('/(tabs)/explore');
            }}
            style={styles.iconBtn}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <BackIcon size={20} color={ink.primary} />
          </Pressable>
          <Text allowFontScaling={false} style={styles.brand}>WORLD</Text>
          <Pressable
            onPress={() => {
              hapticTap();
              if (signedIn) router.push('/(tabs)/profile');
              else router.push('/auth');
            }}
            style={styles.avatar}
            accessibilityRole="button"
            accessibilityLabel="Profile"
          >
            <Text allowFontScaling={false} style={styles.avatarText}>
              {(state.viewer.name || state.viewer.handle || '?').slice(0, 1).toUpperCase()}
            </Text>
          </Pressable>
        </View>

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
          <Text allowFontScaling={false} style={styles.banner}>
            Location off — browse Recent or Search this area.
          </Text>
        ) : null}
      </View>

      <View style={[styles.midChrome, { bottom: (selected ? 280 : 108) + insets.bottom }]} pointerEvents="box-none">
        {showSearchArea && filter === 'nearby' ? (
          <Pressable
            onPress={() => void searchThisArea()}
            style={styles.searchArea}
            accessibilityRole="button"
            accessibilityLabel="Search this area"
          >
            <Text allowFontScaling={false} style={styles.searchAreaText}>
              {searching ? 'Searching…' : 'Search this area'}
            </Text>
          </Pressable>
        ) : null}

        {!loading && drops.length === 0 ? (
          <View style={styles.empty}>
            <Text allowFontScaling={false} style={styles.emptyTitle}>Nothing here yet.</Text>
            <Text allowFontScaling={false} style={styles.emptyBody}>
              Be the first to leave something worth finding.
            </Text>
            {primaryMission ? (
              <Pressable onPress={participate} style={styles.emptyCta} accessibilityRole="button">
                <Text allowFontScaling={false} style={styles.emptyCtaText}>
                  Join this week's Mission
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={[styles.bottomChrome, { paddingBottom: insets.bottom + space.sm }]} pointerEvents="box-none">
        {selected ? (
          <WorldDropPreview
            drop={selected}
            onView={openDrop}
            onDismiss={() => setSelectedId(null)}
          />
        ) : (
          <View style={styles.controls}>
            <View style={styles.filters}>
              {FILTERS.map((item) => {
                const active = filter === item.key;
                return (
                  <Pressable
                    key={item.key}
                    onPress={() => void onFilterChange(item.key)}
                    style={[styles.filter, active && styles.filterOn]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={item.label}
                  >
                    <Text allowFontScaling={false} style={[styles.filterText, active && styles.filterTextOn]}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.sideActions}>
              <Pressable
                onPress={() => {
                  hapticTap();
                  setPrivacyOpen((v) => !v);
                }}
                style={styles.iconBtn}
                accessibilityRole="button"
                accessibilityLabel="World privacy"
              >
                <WorldIcon size={18} color={ink.secondary} />
              </Pressable>
              <Pressable
                onPress={() => void recenter()}
                style={styles.iconBtn}
                accessibilityRole="button"
                accessibilityLabel="Recenter map"
              >
                <LocateIcon size={18} color={ink.primary} />
              </Pressable>
              <Pressable
                onPress={participate}
                style={styles.create}
                accessibilityRole="button"
                accessibilityLabel="Create World Drop"
              >
                <PlusIcon size={20} color={ink.inverse} strokeWidth={2.4} />
              </Pressable>
            </View>
          </View>
        )}

        {privacyOpen && !selected ? (
          <Text allowFontScaling={false} style={styles.privacy}>
            World shows approximate areas where content was posted. It does not show people's live locations.
          </Text>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.loading} pointerEvents="none">
          <ActivityIndicator color={ink.primary} />
        </View>
      ) : null}

      <Notice offset={0} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  topChrome: {
    position: 'absolute',
    left: space.md,
    right: space.md,
    gap: space.sm,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: { ...typeScale.caption, color: ink.primary, letterSpacing: 1 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(12,12,15,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(12,12,15,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  avatarText: { ...typeScale.label, color: ink.primary, fontWeight: '700' },
  banner: {
    ...typeScale.meta,
    color: ink.secondary,
    paddingHorizontal: space.sm,
    paddingVertical: 6,
    borderRadius: radius.md,
    backgroundColor: 'rgba(12,12,15,0.88)',
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
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(245,245,247,0.94)',
  },
  searchAreaText: { ...typeScale.label, color: ink.inverse, fontWeight: '700' },
  empty: {
    alignItems: 'center',
    gap: 6,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(12,12,15,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    maxWidth: 320,
  },
  emptyTitle: { ...typeScale.label, color: ink.primary, fontWeight: '700' },
  emptyBody: { ...typeScale.meta, color: ink.secondary, textAlign: 'center' },
  emptyCta: {
    marginTop: 4,
    paddingHorizontal: space.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  emptyCtaText: { ...typeScale.meta, color: ink.inverse, fontWeight: '700' },
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
    flexDirection: 'row',
    gap: 6,
    padding: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(12,12,15,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  filter: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  filterOn: { backgroundColor: 'rgba(255,255,255,0.12)' },
  filterText: { ...typeScale.meta, color: ink.tertiary },
  filterTextOn: { color: ink.primary, fontWeight: '700' },
  sideActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  create: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F5F7',
  },
  privacy: {
    ...typeScale.meta,
    color: ink.secondary,
    padding: space.sm,
    borderRadius: radius.md,
    backgroundColor: 'rgba(12,12,15,0.92)',
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(9,9,11,0.35)',
  },
});
