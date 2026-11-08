'use strict';
/*
 * Build data/iiuc-campus.geojson from an OpenStreetMap API 0.6 XML map extract.
 *
 * Source extract (2026-11-08):
 *   https://api.openstreetmap.org/api/0.6/map?bbox=91.7182,22.4894,91.7305,22.5001
 *
 * Usage:
 *   node scripts/build-iiuc-campus-geojson.js [osmPath] [outPath]
 *
 * This script exists so the committed GeoJSON is reproducible from the same OSM
 * extract. It is not part of the server runtime.
 *
 * Data (c) OpenStreetMap contributors, ODbL 1.0.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_OSM = 'C:/Users/Montaherul/AppData/Local/Temp/iiuc_map.osm';
const DEFAULT_OUT = path.join(__dirname, '..', 'data', 'iiuc-campus.geojson');
const CAMPUS_WAY_ID = 276731950;

const osmPath = path.resolve(process.argv[2] || DEFAULT_OSM);
const outPath = path.resolve(process.argv[3] || DEFAULT_OUT);

function decodeXml(value) {
  return value.replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (match, entity) => {
    if (entity === 'amp') return '&';
    if (entity === 'lt') return '<';
    if (entity === 'gt') return '>';
    if (entity === 'quot') return '"';
    if (entity === 'apos') return "'";
    if (entity[0] === '#') {
      const code = entity[1] === 'x' || entity[1] === 'X'
        ? parseInt(entity.slice(2), 16)
        : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return match;
  });
}

function parseOsm(xml) {
  const nodes = new Map();
  const ways = new Map();
  let current = null;

  for (const line of xml.split(/\r?\n/)) {
    const text = line.trim();
    if (!text) continue;
    let match;

    if ((match = text.match(/^<node\s+([^>]*?)(\/?)>$/))) {
      const id = Number(match[1].match(/id="(\d+)"/)[1]);
      const lat = match[1].match(/lat="([-\d.]+)"/);
      const lon = match[1].match(/lon="([-\d.]+)"/);
      current = { type: 'node', id, lat: lat ? Number(lat[1]) : null, lon: lon ? Number(lon[1]) : null, tags: {} };
      nodes.set(id, current);
      if (match[2] === '/') current = null;
    } else if ((match = text.match(/^<way\s+([^>]*?)(\/?)>$/))) {
      const id = Number(match[1].match(/id="(\d+)"/)[1]);
      current = { type: 'way', id, nds: [], tags: {} };
      ways.set(id, current);
      if (match[2] === '/') current = null;
    } else if (text === '</node>' || text === '</way>' || text === '</relation>') {
      current = null;
    } else if (current && (match = text.match(/^<tag\s+k="([^"]*)"\s+v="([^"]*)"\s*\/>$/))) {
      current.tags[decodeXml(match[1])] = decodeXml(match[2]);
    } else if (current && current.type === 'way' && (match = text.match(/^<nd\s+ref="(\d+)"\s*\/>$/))) {
      current.nds.push(Number(match[1]));
    }
  }
  return { nodes, ways };
}

function wayPoints(way, nodes) {
  return way.nds
    .map((id) => nodes.get(id))
    .filter((node) => node && Number.isFinite(node.lat) && Number.isFinite(node.lon))
    .map((node) => [node.lon, node.lat]);
}

function pointInPolygon(point, polygon) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function areaCentroid(points) {
  let ox = 0;
  let oy = 0;
  for (const point of points) { ox += point[0]; oy += point[1]; }
  ox /= points.length;
  oy /= points.length;

  let area2 = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const x0 = points[j][0] - ox;
    const y0 = points[j][1] - oy;
    const x1 = points[i][0] - ox;
    const y1 = points[i][1] - oy;
    const cross = x0 * y1 - x1 * y0;
    area2 += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  if (Math.abs(area2) < 1e-14) return [ox, oy];
  return [cx / (3 * area2) + ox, cy / (3 * area2) + oy];
}

function lineMidpoint(points) {
  const scale = Math.cos((points[0][1] * Math.PI) / 180);
  const lengths = [];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const dx = (points[i][0] - points[i - 1][0]) * scale;
    const dy = points[i][1] - points[i - 1][1];
    const length = Math.hypot(dx, dy);
    lengths.push(length);
    total += length;
  }
  if (total === 0) return points[0];
  let remaining = total / 2;
  for (let i = 0; i < lengths.length; i += 1) {
    if (remaining <= lengths[i]) {
      const ratio = lengths[i] === 0 ? 0 : remaining / lengths[i];
      return [
        points[i][0] + (points[i + 1][0] - points[i][0]) * ratio,
        points[i][1] + (points[i + 1][1] - points[i][1]) * ratio,
      ];
    }
    remaining -= lengths[i];
  }
  return points[points.length - 1];
}

function isClosed(points) {
  if (points.length < 4) return false;
  const first = points[0];
  const last = points[points.length - 1];
  return Math.abs(first[0] - last[0]) < 1e-9 && Math.abs(first[1] - last[1]) < 1e-9;
}

function roundCoord(value) {
  return Math.round(value * 1e7) / 1e7;
}

function roundRing(points) {
  return points.map(([lon, lat]) => [roundCoord(lon), roundCoord(lat)]);
}

function describe(tags) {
  const parts = [];
  const ordered = [
    ['building', 'Building'],
    ['amenity', 'Amenity'],
    ['highway', 'Highway'],
    ['footway', 'Footway'],
    ['leisure', 'Leisure'],
    ['tourism', 'Tourism'],
    ['shop', 'Shop'],
    ['office', 'Office'],
    ['historic', 'Historic'],
    ['memorial', 'Memorial'],
    ['natural', 'Natural'],
    ['water', 'Water'],
    ['man_made', 'Man made'],
    ['power', 'Power'],
    ['landuse', 'Landuse'],
    ['education', 'Education'],
    ['religion', 'Religion'],
    ['sport', 'Sport'],
    ['surface', 'Surface'],
    ['building:levels', 'Levels'],
    ['operator', 'Operator'],
    ['operator:type', 'Operator type'],
    ['access', 'Access'],
    ['wheelchair', 'Wheelchair'],
  ];
  for (const [key, label] of ordered) {
    if (tags[key]) parts.push(`${label}: ${tags[key]}`);
  }
  return parts.join('; ');
}

function categoryFor(kind) {
  if (kind === 'building') return 'Buildings';
  if (kind === 'road') return 'Roads & Paths';
  return 'Campus Facilities';
}

function makeFeature(way, kind, geometry) {
  return {
    type: 'Feature',
    properties: {
      osmType: 'way',
      osmId: way.id,
      name: way.tags.name || null,
      kind,
      category: categoryFor(kind),
      source: `OpenStreetMap way/${way.id}`,
      description: describe(way.tags),
    },
    geometry,
  };
}

function main() {
  if (!fs.existsSync(osmPath)) {
    throw new Error(`OSM extract not found: ${osmPath}`);
  }
  const xml = fs.readFileSync(osmPath, 'utf8');
  const { nodes, ways } = parseOsm(xml);

  const campusWay = ways.get(CAMPUS_WAY_ID);
  if (!campusWay) throw new Error(`Campus boundary way ${CAMPUS_WAY_ID} not found in extract`);
  const campusPolygon = wayPoints(campusWay, nodes);
  if (!isClosed(campusPolygon)) throw new Error('Campus boundary way is not a closed ring');

  const zoneWays = [...ways.values()].filter(
    (way) => way.tags.landuse === 'education' && /academic zone/i.test(way.tags.name || '')
  );
  const zonePolygons = zoneWays.map((way) => wayPoints(way, nodes)).filter(isClosed);

  const features = [];
  const skipped = { buildingsWithoutValidRing: 0, offCampusBuildings: 0, offCampusRoads: 0, offCampusPois: 0 };
  const buildingIds = new Set();

  // Buildings: centroid inside the IIUC campus polygon, inside an IIUC academic-zone
  // polygon, or explicitly named IIUC / International Islamic University.
  for (const way of ways.values()) {
    if (!way.tags.building) continue;
    const points = wayPoints(way, nodes);
    if (!isClosed(points)) { skipped.buildingsWithoutValidRing += 1; continue; }
    const centroid = areaCentroid(points);
    const onCampus = pointInPolygon(centroid, campusPolygon)
      || zonePolygons.some((polygon) => pointInPolygon(centroid, polygon))
      || /^(IIUC|International Islamic University)\b/i.test(way.tags.name || '');
    if (!onCampus) { skipped.offCampusBuildings += 1; continue; }
    buildingIds.add(way.id);
    features.push(makeFeature(way, 'building', { type: 'Polygon', coordinates: [roundRing(points)] }));
  }

  // Roads: highway=* with any node inside campus, whose midpoint is on campus, or
  // explicitly named IIUC Road. Railway and the external N1 trunk highway are excluded.
  const roadIds = new Set();
  for (const way of ways.values()) {
    if (!way.tags.highway) continue;
    if (way.tags.railway || way.tags.highway === 'trunk' || way.tags.highway === 'motorway') continue;
    const points = wayPoints(way, nodes);
    if (points.length < 2) continue;
    const midpoint = lineMidpoint(points);
    const onCampus = pointInPolygon(midpoint, campusPolygon)
      || zonePolygons.some((polygon) => pointInPolygon(midpoint, polygon))
      || points.some((point) => pointInPolygon(point, campusPolygon))
      || /\bIIUC\b/i.test(way.tags.name || '');
    if (!onCampus) { skipped.offCampusRoads += 1; continue; }
    roadIds.add(way.id);
    features.push(makeFeature(way, 'road', {
      type: 'LineString',
      coordinates: points.map(([lon, lat]) => [roundCoord(lon), roundCoord(lat)]),
    }));
  }

  // POI ways: campus amenities, pitches, ponds, parking, landmark structures,
  // water treatment, substation, the two academic zones, and the campus polygon.
  for (const way of ways.values()) {
    if (way.tags.building || way.tags.highway) continue;
    const tags = way.tags;
    const points = wayPoints(way, nodes);
    if (!isClosed(points)) continue;
    const centroid = areaCentroid(points);
    if (!pointInPolygon(centroid, campusPolygon)) {
      if (way.id !== CAMPUS_WAY_ID) { skipped.offCampusPois += 1; continue; }
    }
    const isPoi = Boolean(
      tags.amenity
      || tags.tourism
      || tags.leisure
      || tags.historic
      || tags.shop
      || tags.office
      || tags.natural === 'water'
      || (tags.man_made === 'storage_tank' && tags.name)
      || (tags.power === 'substation' && tags.name)
      || (tags.landuse === 'education' && tags.name)
    );
    if (!isPoi) continue;
    // Do not seed a duplicate POI polygon for a feature already seeded as a building.
    if (buildingIds.has(way.id)) continue;
    features.push(makeFeature(way, 'poi', { type: 'Polygon', coordinates: [roundRing(points)] }));
  }

  // POI nodes: on-campus nodes with a facility/landmark tag and a real OSM name.
  for (const node of nodes.values()) {
    const tags = node.tags;
    const isPoi = Boolean(
      tags.amenity || tags.tourism || tags.leisure || tags.shop || tags.office || tags.historic
      || (tags.natural && tags.name)
    );
    if (!isPoi || !tags.name) continue;
    if (!pointInPolygon([node.lon, node.lat], campusPolygon)) { skipped.offCampusPois += 1; continue; }
    features.push({
      type: 'Feature',
      properties: {
        osmType: 'node',
        osmId: node.id,
        name: tags.name,
        kind: 'poi',
        category: categoryFor('poi'),
        source: `OpenStreetMap node/${node.id}`,
        description: describe(tags),
      },
      geometry: { type: 'Point', coordinates: [roundCoord(node.lon), roundCoord(node.lat)] },
    });
  }

  const kindOrder = { building: 0, road: 1, poi: 2 };
  features.sort((a, b) => kindOrder[a.properties.kind] - kindOrder[b.properties.kind]
    || a.properties.osmId - b.properties.osmId);

  const collection = {
    type: 'FeatureCollection',
    name: 'IIUC Campus (OpenStreetMap extract, ODbL)',
    features,
  };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(collection, null, 2)}\n`, 'utf8');

  const counts = features.reduce((acc, feature) => {
    acc[feature.properties.kind] = (acc[feature.properties.kind] || 0) + 1;
    return acc;
  }, {});
  console.log(`Wrote ${outPath}`);
  console.log(`Features: ${features.length} ${JSON.stringify(counts)}`);
  console.log(`Skipped: ${JSON.stringify(skipped)}`);
}

main();
