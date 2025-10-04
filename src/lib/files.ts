import type { Feature, Geometry, Polygon } from 'geojson';
import { rewind } from '@turf/rewind';
import { buffer } from '@turf/buffer';
import type { GeoJSONStoreFeatures } from 'terra-draw';

export interface TerraDrawReadyFeature extends Feature<Polygon> {
  properties: { mode: 'polygon'; [key: string]: any };
}

const uuid4 = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

const almostEqual = (a: number, b: number, eps = 1e-8) => Math.abs(a - b) < eps;

/**
 * Validates and normalizes a GeoJSON geometry or feature for TerraDraw.
 * - Fixes winding direction
 * - Buffers (0 distance) to force valid topology
 * - Converts MultiPolygon → Polygon array
 * - Deduplicates & closes polygon rings
 * - Rounds coordinates to fixed precision
 * Without doing all this, terra-draw sometimes doesn't render the polygon.
 */
export function validateAndNormalizeGeoJSON(
  input: Geometry | Feature,
  options?: { precision?: number }
): TerraDrawReadyFeature[] {
  const precision = options?.precision ?? 6;

  // Step 1: Extract geometry from wrappers
  const geometry: Geometry =
    'geometry' in input && input.geometry ? input.geometry : (input as Geometry);

  // Step 2: Normalize winding + force valid geometry with 0 buffer
  const rewound = rewind({ type: 'Feature', geometry, properties: {} }, { reverse: true });
  const buffered = buffer(rewound, 0);
  if (!buffered.geometry) throw new Error('Invalid geometry after buffering');

  const geom = buffered.geometry;
  const features: TerraDrawReadyFeature[] = [];

  // Step 3: Handle MultiPolygon to array of Polygon
  const polygons: Polygon[] =
    geom.type === 'MultiPolygon'
      ? geom.coordinates.map((coords) => ({ type: 'Polygon', coordinates: coords }) as Polygon)
      : geom.type === 'Polygon'
      ? [geom as Polygon]
      : [];

  if (!polygons.length) throw new Error(`Unsupported geometry type: ${geom.type}`);

  // Step 4: Normalize each polygon
  for (const poly of polygons) {
    let coords = [...poly.coordinates[0]]; // exterior ring
    if (coords.length < 4) continue;

    // Remove consecutive duplicates
    const deduped: number[][] = [];
    for (const pt of coords) {
      if (
        deduped.length === 0 ||
        !almostEqual(deduped.at(-1)![0], pt[0]) ||
        !almostEqual(deduped.at(-1)![1], pt[1])
      ) {
        deduped.push(pt);
      }
    }

    // Ensure ring closure
    const [firstX, firstY] = deduped[0];
    const [lastX, lastY] = deduped.at(-1)!;
    if (!almostEqual(firstX, lastX) || !almostEqual(firstY, lastY)) {
      deduped.push([firstX, firstY]);
    }

    // Round coordinates
    const rounded = deduped.map(([x, y]) => [
      Number(x.toFixed(precision)),
      Number(y.toFixed(precision)),
    ]);

    // Remove duplicates after rounding (preserve closure)
    const final: number[][] = [];
    for (const pt of rounded) {
      if (
        final.length === 0 ||
        final.at(-1)![0] !== pt[0] ||
        final.at(-1)![1] !== pt[1]
      ) {
        final.push(pt);
      }
    }
    const f = final[0];
    const l = final.at(-1)!;
    if (f[0] !== l[0] || f[1] !== l[1]) final.push([...f]);

    if (final.length < 4) continue;

    features.push({
      id: uuid4(),
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [final] },
      properties: { mode: 'polygon' },
    });
  }

  if (!features.length) throw new Error('No valid polygon geometries found');
  return features;
}

/**
 * Reads a GeoJSON file and returns normalized TerraDraw-ready features.
 */
export async function importGeoJSONFile(file: File): Promise<TerraDrawReadyFeature[]> {
  const text = await file.text();
  const data = JSON.parse(text);

  if (data.type === 'FeatureCollection' && data.features?.length > 0) {
    return validateAndNormalizeGeoJSON(data.features[0]) ?? [];
  }

  if (data.type === 'Feature') {
    return validateAndNormalizeGeoJSON(data);
  }

  if (data.type === 'Polygon' || data.type === 'MultiPolygon') {
    return validateAndNormalizeGeoJSON(data);
  }

  throw new Error('Invalid or unsupported GeoJSON format');
}

/**
 * Triggers a browser download of a GeoJSON object.
 */
export function downloadGeoJSON(data: unknown, filename = 'extract.geojson') {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/geo+json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
