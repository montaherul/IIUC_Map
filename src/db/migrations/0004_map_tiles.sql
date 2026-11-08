-- 0004: align stored map tile defaults with the compliant HTTPS-only provider.
-- Only updates rows that still carry the legacy defaults, so an operator's
-- explicit custom tile URL is never overwritten.

UPDATE map_settings
SET value = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    updated_at = datetime('now')
WHERE key = 'map.tile_url'
  AND value = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

UPDATE map_settings
SET value = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    updated_at = datetime('now')
WHERE key = 'map.tile_attribution'
  AND value = '&copy; OpenStreetMap contributors';
