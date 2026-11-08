const { all, get, run } = require('../../db/sqlite');
const { nowIso } = require('../../utils/http');

const DEFAULTS = {
  'map.center_lat': '22.4966',
  'map.center_lng': '91.7214',
  'map.zoom': '16',
  'map.max_zoom': '19',
  'map.bounds_sw_lat': '',
  'map.bounds_sw_lng': '',
  'map.bounds_ne_lat': '',
  'map.bounds_ne_lng': '',
  'map.bounds_strict': '0',
  'map.tile_url': 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  'map.tile_attribution': '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
  'routing.enabled': '0',
  'routing.provider': 'osrm',
  'search.debounce_ms': '250',
  'search.max_results': '50',
};

async function allSettings() {
  const rows = await all('SELECT key, value FROM map_settings');
  const out = { ...DEFAULTS };
  for (const r of rows) out[r.key] = r.value;
  return out;
}

async function getMany(keys) {
  const out = {};
  for (const k of keys) out[k] = await getOne(k);
  return out;
}

async function getOne(key) {
  const row = await get('SELECT value FROM map_settings WHERE key = ?', [key]);
  return row ? row.value : DEFAULTS[key];
}

async function setOne(key, value, userId) {
  const now = nowIso();
  await run(
    `INSERT INTO map_settings(key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at, updated_by=excluded.updated_by`,
    [String(key), String(value ?? ''), now, userId == null ? null : Number(userId)]
  );
  return getOne(key);
}

async function setMany(pairs, userId) {
  const out = {};
  for (const [k, v] of Object.entries(pairs)) {
    out[k] = await setOne(k, v, userId);
  }
  return out;
}

// Configurable map bounds as [swLat, swLng, neLat, neLng] or null.
async function getBounds() {
  const swLat = await getOne('map.bounds_sw_lat');
  const swLng = await getOne('map.bounds_sw_lng');
  const neLat = await getOne('map.bounds_ne_lat');
  const neLng = await getOne('map.bounds_ne_lng');
  const strict = (await getOne('map.bounds_strict')) === '1';
  const has = [swLat, swLng, neLat, neLng].every((v) => v !== '' && v != null && Number.isFinite(Number(v)));
  if (!has) return { bounds: null, strict };
  return {
    bounds: [[Number(swLat), Number(swLng)], [Number(neLat), Number(neLng)]],
    strict,
  };
}

module.exports = { allSettings, getMany, getOne, setOne, setMany, getBounds, DEFAULTS };
