import type { MapStyleElement } from 'react-native-maps';

/**
 * Dark Google Maps style — subdued geography, readable labels.
 * Content (Drop media) supplies colour; the map stays quiet.
 */
export const WORLD_MAP_STYLE_DARK: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#141416' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8E8E96' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#141416' }] },
  {
    featureType: 'administrative',
    elementType: 'geometry',
    stylers: [{ color: '#2A2A30' }],
  },
  {
    featureType: 'administrative.land_parcel',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'poi',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#1E1E22' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#16161A' }],
  },
  {
    featureType: 'road',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#6E6E76' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#26262C' }],
  },
  {
    featureType: 'transit',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#0C0C10' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#4B4B52' }],
  },
];

/**
 * Light Google Maps style — clean / lightly desaturated, POI noise off.
 */
export const WORLD_MAP_STYLE_LIGHT: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#EDEBE6' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#5C5C66' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#EDEBE6' }] },
  {
    featureType: 'administrative',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#C8C6C0' }],
  },
  {
    featureType: 'administrative.land_parcel',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'poi',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#F7F6F2' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#D8D6D0' }],
  },
  {
    featureType: 'road',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#6A6A72' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#E4E2DC' }],
  },
  {
    featureType: 'transit',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#C9D4DC' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#6E7A84' }],
  },
];

/** @deprecated Prefer WORLD_MAP_STYLE_DARK / LIGHT via scheme. */
export const WORLD_MAP_STYLE = WORLD_MAP_STYLE_DARK;
