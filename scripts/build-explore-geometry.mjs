/**
 * Build simplified Explore country geometry from Natural Earth 110m (world-atlas).
 * Output: data/exploreWorldGeometry.json — ISO A2 keyed MultiPolygons (lng/lat rings).
 * No GPS. Public domain Natural Earth data redistributed via world-atlas.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { feature } from 'topojson-client';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'data', 'exploreWorldGeometry.json');

/** ISO 3166-1 numeric → alpha-2 (Natural Earth / world-atlas ids). */
const NUMERIC_TO_A2 = {
  '004': 'AF', '008': 'AL', '012': 'DZ', '020': 'AD', '024': 'AO', '028': 'AG',
  '032': 'AR', '051': 'AM', '036': 'AU', '040': 'AT', '031': 'AZ', '044': 'BS',
  '048': 'BH', '050': 'BD', '052': 'BB', '112': 'BY', '056': 'BE', '084': 'BZ',
  '204': 'BJ', '064': 'BT', '068': 'BO', '070': 'BA', '072': 'BW', '076': 'BR',
  '096': 'BN', '100': 'BG', '854': 'BF', '108': 'BI', '116': 'KH', '120': 'CM',
  '124': 'CA', '140': 'CF', '148': 'TD', '152': 'CL', '156': 'CN', '170': 'CO',
  '178': 'CG', '180': 'CD', '188': 'CR', '384': 'CI', '191': 'HR', '192': 'CU',
  '196': 'CY', '203': 'CZ', '208': 'DK', '262': 'DJ', '212': 'DM', '214': 'DO',
  '218': 'EC', '818': 'EG', '222': 'SV', '226': 'GQ', '232': 'ER', '233': 'EE',
  '231': 'ET', '242': 'FJ', '246': 'FI', '250': 'FR', '266': 'GA', '270': 'GM',
  '268': 'GE', '276': 'DE', '288': 'GH', '300': 'GR', '320': 'GT', '324': 'GN',
  '624': 'GW', '328': 'GY', '332': 'HT', '340': 'HN', '348': 'HU', '352': 'IS',
  '356': 'IN', '360': 'ID', '364': 'IR', '368': 'IQ', '372': 'IE', '376': 'IL',
  '380': 'IT', '388': 'JM', '392': 'JP', '400': 'JO', '398': 'KZ', '404': 'KE',
  '408': 'KP', '410': 'KR', '414': 'KW', '417': 'KG', '418': 'LA', '428': 'LV',
  '422': 'LB', '426': 'LS', '430': 'LR', '434': 'LY', '440': 'LT', '442': 'LU',
  '450': 'MG', '454': 'MW', '458': 'MY', '462': 'MV', '466': 'ML', '478': 'MR',
  '484': 'MX', '498': 'MD', '496': 'MN', '499': 'ME', '504': 'MA', '508': 'MZ',
  '104': 'MM', '516': 'NA', '524': 'NP', '528': 'NL', '554': 'NZ', '558': 'NI',
  '562': 'NE', '566': 'NG', '807': 'MK', '578': 'NO', '512': 'OM', '586': 'PK',
  '591': 'PA', '598': 'PG', '600': 'PY', '604': 'PE', '608': 'PH', '616': 'PL',
  '620': 'PT', '634': 'QA', '642': 'RO', '643': 'RU', '646': 'RW', '682': 'SA',
  '686': 'SN', '688': 'RS', '694': 'SL', '702': 'SG', '703': 'SK', '705': 'SI',
  '090': 'SB', '706': 'SO', '710': 'ZA', '728': 'SS', '724': 'ES', '144': 'LK',
  '729': 'SD', '740': 'SR', '752': 'SE', '756': 'CH', '760': 'SY', '158': 'TW',
  '762': 'TJ', '834': 'TZ', '764': 'TH', '626': 'TL', '768': 'TG', '780': 'TT',
  '788': 'TN', '792': 'TR', '795': 'TM', '800': 'UG', '804': 'UA', '784': 'AE',
  '826': 'GB', '840': 'US', '858': 'UY', '860': 'UZ', '862': 'VE', '704': 'VN',
  '887': 'YE', '894': 'ZM', '716': 'ZW', '304': 'GL', '238': 'FK', '732': 'EH',
  '010': 'AQ', '260': 'TF', '540': 'NC', '184': 'CK', '570': 'NU', '882': 'WS',
  '776': 'TO', '548': 'VU', '090': 'SB',
};

function simplifyRing(ring, step = 2) {
  if (ring.length <= 8) return ring;
  const out = [];
  for (let i = 0; i < ring.length; i += step) out.push(ring[i]);
  const first = out[0];
  const last = out[out.length - 1];
  if (!first || !last) return ring;
  if (first[0] !== last[0] || first[1] !== last[1]) out.push(first);
  return out;
}

function simplifyCoords(coords, depth) {
  if (depth === 0) return simplifyRing(coords, 2);
  return coords.map((c) => simplifyCoords(c, depth - 1));
}

function ringLength(ring) {
  return ring?.length ?? 0;
}

function centroid(polygons) {
  // Prefer the largest outer ring so Alaska/outliers don't pull the label.
  let best = null;
  let bestLen = 0;
  for (const poly of polygons) {
    const ring = poly[0];
    const len = ringLength(ring);
    if (len > bestLen) {
      best = ring;
      bestLen = len;
    }
  }
  if (!best || !bestLen) return { lng: 0, lat: 0 };
  let sx = 0;
  let sy = 0;
  for (const pt of best) {
    sx += pt[0];
    sy += pt[1];
  }
  return { lng: sx / bestLen, lat: sy / bestLen };
}

const url = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json';
const topo = await (await fetch(url)).json();
const fc = feature(topo, topo.objects.countries);

const countries = [];
for (const f of fc.features) {
  const id = String(f.id).padStart(3, '0');
  const code = NUMERIC_TO_A2[id];
  if (!code) continue;
  const geom = f.geometry;
  if (!geom) continue;
  let polygons;
  if (geom.type === 'Polygon') polygons = [geom.coordinates];
  else if (geom.type === 'MultiPolygon') polygons = geom.coordinates;
  else continue;
  const simplified = simplifyCoords(polygons, 2);
  const c = centroid(simplified);
  countries.push({
    code,
    name: f.properties?.name ?? code,
    lat: Math.round(c.lat * 1000) / 1000,
    lng: Math.round(c.lng * 1000) / 1000,
    polygons: simplified,
  });
}

countries.sort((a, b) => a.code.localeCompare(b.code));
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(
  OUT,
  JSON.stringify({
    source: 'Natural Earth 110m via world-atlas@2.0.2',
    note: 'ISO A2 polygons for Explore map/globe. Never GPS. Centroids are geometry-derived.',
    countries,
  }),
);
console.log(`Wrote ${countries.length} countries → ${OUT}`);
