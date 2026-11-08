'use strict';
/*
 * Seed IIUC campus buildings, roads and facilities from data/iiuc-campus.geojson.
 *
 * Source data: OpenStreetMap (c) OpenStreetMap contributors, ODbL 1.0.
 * See data/IIUC_CAMPUS_PROVENANCE.md.
 *
 * Usage: node scripts/seed-iiuc-campus.js
 *
 * Idempotent: deletes only rows whose source is 'OpenStreetMap ...' and reinserts
 * the committed GeoJSON. User-created and other rows are never touched.
 */

const fs = require('fs');
const path = require('path');
const { db, run, get, all } = require('../src/db/sqlite');

const GEOJSON_PATH = path.join(__dirname, '..', 'data', 'iiuc-campus.geojson');
const CATEGORY_NAMES = ['Buildings', 'Roads & Paths', 'Campus Facilities'];

function readGeoJson() {
  const raw = fs.readFileSync(GEOJSON_PATH, 'utf8');
  const data = JSON.parse(raw);
  if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
    throw new Error('data/iiuc-campus.geojson is not a GeoJSON FeatureCollection');
  }
  return data;
}

function validateFeature(feature, index) {
  const where = `feature #${index}`;
  if (!feature || feature.type !== 'Feature') throw new Error(`${where}: not a GeoJSON Feature`);
  const p = feature.properties || {};
  for (const key of ['osmType', 'osmId', 'kind', 'category', 'source', 'description']) {
    if (!(key in p)) throw new Error(`${where}: missing property ${key}`);
  }
  if (!['way', 'node', 'relation'].includes(p.osmType)) throw new Error(`${where}: bad osmType`);
  if (!Number.isInteger(p.osmId) || p.osmId <= 0) throw new Error(`${where}: bad osmId`);
  if (p.name !== null && typeof p.name !== 'string') throw new Error(`${where}: name must be string or null`);
  if (!['building', 'road', 'poi'].includes(p.kind)) throw new Error(`${where}: bad kind`);
  if (!CATEGORY_NAMES.includes(p.category)) throw new Error(`${where}: bad category`);
  if (typeof p.source !== 'string' || !p.source.startsWith('OpenStreetMap ')) throw new Error(`${where}: bad source`);
  if (!feature.geometry || typeof feature.geometry !== 'object' || !Array.isArray(feature.geometry.coordinates)) {
    throw new Error(`${where}: missing geometry`);
  }
  const expected = p.kind === 'building' ? ['Polygon', 'MultiPolygon']
    : p.kind === 'road' ? ['LineString', 'MultiLineString']
      : ['Point', 'Polygon', 'MultiPolygon'];
  if (!expected.includes(feature.geometry.type)) {
    throw new Error(`${where}: geometry ${feature.geometry.type} not allowed for ${p.kind}`);
  }
  checkCoordinates(feature.geometry.coordinates, where);
  return p;
}

function checkCoordinates(coords, where) {
  if (!Array.isArray(coords)) throw new Error(`${where}: coordinates must be arrays`);
  if (typeof coords[0] === 'number') {
    const [lon, lat] = coords;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) throw new Error(`${where}: non-finite coordinate`);
    if (lon < 91.7 || lon > 91.75 || lat < 22.48 || lat > 22.51) {
      throw new Error(`${where}: coordinate outside expected IIUC area (${lon}, ${lat})`);
    }
    return;
  }
  for (const part of coords) checkCoordinates(part, where);
}

function ringOf(geometry) {
  if (geometry.type === 'Polygon') return geometry.coordinates[0];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates[0][0];
  return null;
}

function areaCentroid(ring) {
  let ox = 0;
  let oy = 0;
  for (const [lon, lat] of ring) { ox += lon; oy += lat; }
  ox /= ring.length;
  oy /= ring.length;

  let area2 = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const x0 = ring[j][0] - ox;
    const y0 = ring[j][1] - oy;
    const x1 = ring[i][0] - ox;
    const y1 = ring[i][1] - oy;
    const cross = x0 * y1 - x1 * y0;
    area2 += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  if (Math.abs(area2) < 1e-14) return [ox, oy];
  return [cx / (3 * area2) + ox, cy / (3 * area2) + oy];
}

function lineMidpoint(line) {
  const scale = Math.cos((line[0][1] * Math.PI) / 180);
  const lengths = [];
  let total = 0;
  for (let i = 1; i < line.length; i += 1) {
    const dx = (line[i][0] - line[i - 1][0]) * scale;
    const dy = line[i][1] - line[i - 1][1];
    const length = Math.hypot(dx, dy);
    lengths.push(length);
    total += length;
  }
  if (total === 0) return line[0];
  let remaining = total / 2;
  for (let i = 0; i < lengths.length; i += 1) {
    if (remaining <= lengths[i]) {
      const ratio = lengths[i] === 0 ? 0 : remaining / lengths[i];
      return [
        line[i][0] + (line[i + 1][0] - line[i][0]) * ratio,
        line[i][1] + (line[i + 1][1] - line[i][1]) * ratio,
      ];
    }
    remaining -= lengths[i];
  }
  return line[line.length - 1];
}

function labelPosition(geometry) {
  if (geometry.type === 'Point') return geometry.coordinates;
  if (geometry.type === 'LineString') return lineMidpoint(geometry.coordinates);
  if (geometry.type === 'MultiLineString') return lineMidpoint(geometry.coordinates[0]);
  const ring = ringOf(geometry);
  if (!ring || ring.length < 3) throw new Error('polygon without a usable ring');
  return areaCentroid(ring);
}

function fallbackName(p) {
  const label = p.kind === 'building' ? 'building' : p.kind === 'road' ? 'road' : 'campus facility';
  return `Unnamed ${label} (OSM ${p.osmType}/${p.osmId})`;
}

async function main() {
  const data = readGeoJson();
  console.log(`Loaded ${data.features.length} features from ${path.relative(process.cwd(), GEOJSON_PATH)}`);

  const fk = await get('PRAGMA foreign_keys');
  if (!fk || fk.foreign_keys !== 1) {
    await run('PRAGMA foreign_keys = ON');
    const again = await get('PRAGMA foreign_keys');
    if (!again || again.foreign_keys !== 1) throw new Error('Could not enable PRAGMA foreign_keys');
  }

  // Make sure the three campus categories used by the map exist.
  for (const name of CATEGORY_NAMES) {
    await run('INSERT OR IGNORE INTO categories(name, kind, is_active) VALUES (?, ?, 1)', [name, 'campus']);
  }
  const categoryRows = await all(
    `SELECT id, name FROM categories WHERE kind = 'campus' AND name IN (${CATEGORY_NAMES.map(() => '?').join(',')})`,
    CATEGORY_NAMES
  );
  const categoryIds = new Map(categoryRows.map((row) => [row.name, row.id]));
  for (const name of CATEGORY_NAMES) {
    if (!categoryIds.has(name)) throw new Error(`Category not found after insert: ${name}`);
  }

  const admin = await get(
    `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
     WHERE r.name = 'admin' AND u.is_active = 1 ORDER BY u.id LIMIT 1`
  );
  const createdBy = admin ? admin.id : null;
  const now = new Date().toISOString();

  const insertSql = `INSERT INTO campus_locations
    (name, description, latitude, longitude, boundary_geojson, category_id, source,
     is_verified, is_active, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?)`;

  let deleted = 0;
  let inserted = 0;
  const kindCounts = { building: 0, road: 0, poi: 0 };
  await run('BEGIN IMMEDIATE');
  try {
    const del = await run("DELETE FROM campus_locations WHERE source LIKE 'OpenStreetMap %'");
    deleted = del.changes;

    for (let i = 0; i < data.features.length; i += 1) {
      const feature = data.features[i];
      const p = validateFeature(feature, i);
      const [lon, lat] = labelPosition(feature.geometry);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
        throw new Error(`feature #${i}: computed non-finite label position`);
      }
      const name = p.name || fallbackName(p);
      const boundary = JSON.stringify(feature.geometry);
      await run(insertSql, [
        name,
        p.description,
        lat,
        lon,
        boundary,
        categoryIds.get(p.category),
        p.source,
        createdBy,
        now,
        now,
      ]);
      inserted += 1;
      kindCounts[p.kind] += 1;
    }
    await run('COMMIT');
  } catch (error) {
    try { await run('ROLLBACK'); } catch (rollbackError) { /* already rolled back */ }
    throw error;
  }

  const byKind = await all(
    `SELECT c.name AS category, COUNT(*) AS count
     FROM campus_locations l JOIN categories c ON c.id = l.category_id
     WHERE l.source LIKE 'OpenStreetMap %'
     GROUP BY c.name ORDER BY c.name`
  );
  const total = await get("SELECT COUNT(*) AS count FROM campus_locations WHERE source LIKE 'OpenStreetMap %'");
  const parsed = await all(
    "SELECT id, name, boundary_geojson FROM campus_locations WHERE source LIKE 'OpenStreetMap %'"
  );
  for (const row of parsed) {
    const geometry = JSON.parse(row.boundary_geojson);
    if (!geometry || !geometry.type || !Array.isArray(geometry.coordinates)) {
      throw new Error(`Stored boundary for row ${row.id} is not valid GeoJSON geometry`);
    }
  }

  console.log(`Deleted previous OSM rows: ${deleted}`);
  console.log(`Inserted rows: ${inserted}`);
  console.log(`Counts by kind: ${JSON.stringify(kindCounts)}`);
  console.log(`Total OSM rows now: ${total.count}`);
  console.log('Counts by category:');
  for (const row of byKind) console.log(`  ${row.category}: ${row.count}`);
  console.log(`All ${parsed.length} stored boundary_geojson values parsed successfully.`);
  console.log(`created_by: ${createdBy === null ? 'NULL (no active admin user)' : createdBy}`);
}

main()
  .then(() => {
    db.close((error) => {
      if (error) {
        console.error(error);
        process.exit(1);
      }
      process.exit(0);
    });
  })
  .catch((error) => {
    console.error('Seed failed:', error);
    db.close(() => process.exit(1));
  });
