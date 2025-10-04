export function extractWithinGeometryQuery(
  geojson: GeoJSON.Geometry,
  types: { buildings?: boolean; roads?: boolean; water?: boolean }
) {
  const wkt = geometryToWkt(geojson);
  const queries: string[] = [];

  if (types.buildings) {
    queries.push(`
      SELECT
        'building' AS layer,
        tags->>'name' AS name,
        tags->>'building' AS subtype,
        geom
      FROM postpass_polygon
      WHERE
        tags ? 'building'
        AND ST_Intersects(
          geom,
          ST_GeomFromText('${wkt}', 4326)
        )
    `);
  }

  if (types.roads) {
    queries.push(`
      SELECT
        'road' AS layer,
        tags->>'name' AS name,
        tags->>'highway' AS subtype,
        geom
      FROM postpass_line
      WHERE
        tags ? 'highway'
        AND ST_Intersects(
          geom,
          ST_GeomFromText('${wkt}', 4326)
        )
    `);
  }

  if (types.water) {
    queries.push(`
      SELECT
        'water' AS layer,
        tags->>'name' AS name,
        tags->>'waterway' AS subtype,
        geom
      FROM postpass_polygon
      WHERE
        (tags ? 'water' OR tags ? 'waterway')
        AND ST_Intersects(
          geom,
          ST_GeomFromText('${wkt}', 4326)
        )
    `);
  }

  if (queries.length === 0) {
    throw new Error('No extract types selected');
  }

  // Combine all queries with UNION ALL
  return queries.join('\nUNION ALL\n');
}

// Utility to convert Polygon/MultiPolygon to WKT
function geometryToWkt(geometry: GeoJSON.Geometry): string {
  if (geometry.type === 'Polygon') {
    const coords = geometry.coordinates[0]
      .map(([lon, lat]) => `${lon} ${lat}`)
      .join(', ');
    return `POLYGON((${coords}))`;
  }

  if (geometry.type === 'MultiPolygon') {
    const polys = geometry.coordinates
      .map(
        (poly) =>
          '((' +
          poly[0].map(([lon, lat]) => `${lon} ${lat}`).join(', ') +
          '))'
      )
      .join(', ');
    return `MULTIPOLYGON(${polys})`;
  }

  throw new Error(`Unsupported geometry type: ${geometry.type}`);
}
