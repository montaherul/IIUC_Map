-- 0002_plan2_validation_enforcement
-- Server-generated timestamp discipline enforced in services; add optional boundary column for verified GeoJSON validation storage.

PRAGMA foreign_keys=OFF;

CREATE TABLE IF NOT EXISTS sharing_preferences_new (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  is_sharing INTEGER NOT NULL DEFAULT 0,
  audience TEXT NOT NULL DEFAULT 'none' CHECK (audience IN ('none','students','teachers','all_authenticated','campus','selected')),
  expires_at TEXT,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO sharing_preferences_new(user_id, is_sharing, audience, expires_at, updated_at)
SELECT user_id, is_sharing, CASE WHEN audience IN ('none','students','teachers','all_authenticated','campus','selected') THEN audience ELSE 'none' END, expires_at, updated_at
FROM sharing_preferences;

DROP TABLE IF EXISTS sharing_preferences;
ALTER TABLE sharing_preferences_new RENAME TO sharing_preferences;

PRAGMA foreign_keys=ON;

-- boundary_geojson: tolerated if exists by migrator
ALTER TABLE campus_locations ADD COLUMN boundary_geojson TEXT;
