import type { MapStyleElement } from 'react-native-maps';

/**
 * Dark Google Maps style — subdued geography, readable labels.
 * Content (Drop media) supplies colour; the map stays quiet.
 */
export const WORLD_MAP_STYLE: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#121214' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8A8A93' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#121214' }] },
  {
    featureType: 'administrative',
    elementType: 'geometry',
    stylers: [{ color: '#2A2A30' }],
  },
  {
    featureType: 'poi',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#1C1C20' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#151518' }],
  },
  {
    featureType: 'road',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#6E6E76' }],
  },
  {
    featureType: 'transit',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#0B0B0E' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#4B4B52' }],
  },
];
