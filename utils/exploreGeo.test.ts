import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  countryCodeFromMapPoint,
  focusCountryByCentroid,
  mapPathForCountry,
  projectGlobe,
  projectMap,
  type ExploreGeoCountry,
} from './exploreGeo.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const geometry = JSON.parse(
  readFileSync(join(root, 'data', 'exploreWorldGeometry.json'), 'utf8'),
) as { countries: ExploreGeoCountry[] };

function byCode(code: string): ExploreGeoCountry | undefined {
  return geometry.countries.find((c) => c.code === code);
}

describe('explore geometry mapping', () => {
  it('loads ISO country geometry with polygons', () => {
    const jp = byCode('JP');
    assert.ok(jp);
    assert.equal(jp?.name, 'Japan');
    assert.ok((jp?.polygons.length ?? 0) >= 1);
    assert.ok(geometry.countries.length > 100);
  });

  it('projects map/globe coordinates stably', () => {
    const m = projectMap(0, 0, 360, 180);
    assert.equal(m.x, 180);
    assert.equal(m.y, 90);
    const g = projectGlobe(0, 0, 0, 100);
    assert.equal(g.visible, true);
  });

  it('builds map paths and focuses by centroid', () => {
    const india = byCode('IN');
    assert.ok(india);
    const path = mapPathForCountry(india!, 360, 180);
    assert.ok(path.startsWith('M'));
    const focus = focusCountryByCentroid(india!.lng, [
      { code: 'IN', lat: india!.lat, lng: india!.lng },
      { code: 'US', lat: 38.3, lng: -90.5 },
    ]);
    assert.equal(focus, 'IN');
  });

  it('hit-tests a point inside India on the map', () => {
    const india = byCode('IN');
    assert.ok(india);
    const { x, y } = projectMap(india!.lng, india!.lat, 1000, 500);
    const code = countryCodeFromMapPoint(x, y, [india!], 1000, 500);
    assert.equal(code, 'IN');
  });
});
