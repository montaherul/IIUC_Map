-- 0003: PLAN2 search/map/navigation schema
-- Aliases for campus locations and markers (multi-name search).
CREATE TABLE IF NOT EXISTS campus_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('campus','marker')),
  entity_id INTEGER NOT NULL,
  alias TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  UNIQUE(entity_type, entity_id, alias)
);
CREATE INDEX IF NOT EXISTS idx_aliases_entity ON campus_aliases(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_aliases_alias ON campus_aliases(alias);

-- Verified campus boundaries (GeoJSON Polygon/MultiPolygon). Only verified rows are published.
CREATE TABLE IF NOT EXISTS campus_boundaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  geojson TEXT NOT NULL,
  is_verified INTEGER NOT NULL DEFAULT 0,
  verified_at TEXT,
  verified_by INTEGER REFERENCES users(id),
  source TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_boundaries_verified ON campus_boundaries(is_verified, is_active);

-- Configurable map settings (bounds, tile provider, feature flags).
CREATE TABLE IF NOT EXISTS map_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by INTEGER REFERENCES users(id)
);

INSERT OR IGNORE INTO map_settings(key, value, updated_at) VALUES
  ('map.center_lat', '22.4966', datetime('now')),
  ('map.center_lng', '91.7214', datetime('now')),
  ('map.zoom', '16', datetime('now')),
  ('map.max_zoom', '19', datetime('now')),
  ('map.bounds_sw_lat', '', datetime('now')),
  ('map.bounds_sw_lng', '', datetime('now')),
  ('map.bounds_ne_lat', '', datetime('now')),
  ('map.bounds_ne_lng', '', datetime('now')),
  ('map.bounds_strict', '0', datetime('now')),
  ('map.tile_url', 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', datetime('now')),
  ('map.tile_attribution', '&copy; OpenStreetMap contributors', datetime('now')),
  ('routing.enabled', '0', datetime('now')),
  ('routing.provider', 'osrm', datetime('now')),
  ('search.debounce_ms', '250', datetime('now')),
  ('search.max_results', '50', datetime('now'));
