'use strict';

/**
 * Base-map tile provider registry.
 *
 * Only providers whose usage policies are compatible with this application are
 * listed by default. The map is an interactive, low-volume campus map: it must
 * not bulk-download tiles, prefetch tiles, or hide/alter attribution.
 *
 * Configuration:
 *   TILE_PROVIDER            default provider id (default: osm-standard)
 *   TILE_PROVIDERS_JSON      JSON object/array of extra or overriding providers
 *   TILE_URL_TEMPLATE        override the default provider URL template
 *   TILE_ATTRIBUTION         override the default provider attribution HTML
 *   TILE_MIN_ZOOM            override the default provider minimum zoom
 *   TILE_MAX_ZOOM            override the default provider maximum zoom
 *   TILE_ERROR_THRESHOLD     consecutive tile errors before the client falls back
 *
 * Custom provider object fields:
 *   id, label, urlTemplate, attribution, minZoom, maxZoom,
 *   policyUrl, policySummary, requiresReferer
 */

const DEFAULT_PROVIDER_ID = 'osm-standard';
const DEFAULT_REFERRER_POLICY = 'strict-origin-when-cross-origin';
const DEFAULT_ERROR_THRESHOLD = 6;
const DEFAULT_MAX_ZOOM = 19;

const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

const BUILTIN_PROVIDERS = {
  'osm-standard': {
    id: 'osm-standard',
    label: 'OpenStreetMap Standard',
    urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: OSM_ATTRIBUTION,
    minZoom: 0,
    maxZoom: 19,
    policyUrl: 'https://operations.osmfoundation.org/policies/tiles/',
    policySummary:
      'Best-effort interactive use only. Requires a valid browser Referer and visible attribution. No bulk download, offline prefetching, or cache busting.',
    requiresReferer: true,
  },
  'osm-de': {
    id: 'osm-de',
    label: 'OpenStreetMap Germany',
    urlTemplate: 'https://tile.openstreetmap.de/{z}/{x}/{y}.png',
    attribution: OSM_ATTRIBUTION,
    minZoom: 0,
    maxZoom: 19,
    policyUrl: 'https://www.openstreetmap.de/germanstyle/',
    policySummary:
      'Non-commercial embedding with per-IP rate limiting. Keep attribution visible and avoid bulk or automated tile requests.',
    requiresReferer: false,
  },
};

function envValue(env, name, fallback) {
  const value = env && env[name];
  if (value === undefined || value === null || value === '') return fallback;
  return value;
}

function normalizeId(value) {
  return String(value == null ? '' : value).trim().toLowerCase();
}

function parseInteger(value, fallback, min, max, label) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(`${label} must be an integer between ${min} and ${max}.`);
  }
  return number;
}

function isAllowedTemplate(urlTemplate) {
  if (/^https:\/\//i.test(urlTemplate)) return true;
  // Allow a local self-hosted tile server during development only.
  return /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\//i.test(urlTemplate);
}

function validateProvider(raw, source) {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Tile provider from ${source} must be an object.`);
  }

  const id = normalizeId(raw.id);
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(id)) {
    throw new Error(`Tile provider from ${source} has an invalid id: ${raw.id}`);
  }

  const urlTemplate = String(raw.urlTemplate || raw.url || '').trim();
  if (!urlTemplate) throw new Error(`Tile provider "${id}" is missing urlTemplate.`);
  if (/\{s\}/.test(urlTemplate)) {
    throw new Error(`Tile provider "${id}" must not use the legacy {s} subdomain token.`);
  }
  if (!isAllowedTemplate(urlTemplate)) {
    throw new Error(`Tile provider "${id}" must use HTTPS (HTTP is allowed only for localhost).`);
  }
  for (const token of ['{z}', '{x}', '{y}']) {
    if (!urlTemplate.includes(token)) {
      throw new Error(`Tile provider "${id}" urlTemplate is missing ${token}.`);
    }
  }

  const attribution = String(raw.attribution || '').trim();
  if (!attribution) throw new Error(`Tile provider "${id}" must include attribution.`);

  const minZoom = parseInteger(raw.minZoom, 0, 0, 22, `${id}.minZoom`);
  const maxZoom = parseInteger(raw.maxZoom, DEFAULT_MAX_ZOOM, minZoom, 24, `${id}.maxZoom`);

  const policyUrl = String(raw.policyUrl || '').trim();
  if (policyUrl && !/^https:\/\//i.test(policyUrl)) {
    throw new Error(`Tile provider "${id}" policyUrl must use HTTPS.`);
  }

  return Object.freeze({
    id,
    label: String(raw.label || id).trim() || id,
    urlTemplate,
    attribution,
    minZoom,
    maxZoom,
    policyUrl,
    policySummary: String(raw.policySummary || '').trim(),
    requiresReferer: raw.requiresReferer === true,
  });
}

function mergeProviderInputs(env) {
  const inputs = new Map();
  for (const [id, provider] of Object.entries(BUILTIN_PROVIDERS)) {
    inputs.set(id, { ...provider });
  }

  const rawProviders = envValue(env, 'TILE_PROVIDERS_JSON', '');
  if (!rawProviders) return inputs;

  let parsed;
  try {
    parsed = JSON.parse(rawProviders);
  } catch (error) {
    throw new Error(`TILE_PROVIDERS_JSON is not valid JSON: ${error.message}`);
  }

  let entries;
  if (Array.isArray(parsed)) {
    entries = parsed.map((provider) => [provider && provider.id, provider]);
  } else if (parsed && typeof parsed === 'object') {
    entries = Object.entries(parsed);
  } else {
    throw new Error('TILE_PROVIDERS_JSON must be a JSON object or array.');
  }

  for (const [key, value] of entries) {
    if (!value || typeof value !== 'object') {
      throw new Error('TILE_PROVIDERS_JSON entries must be objects.');
    }
    const input = { ...value };
    if (!input.id && key) input.id = key;
    const id = normalizeId(input.id);
    if (!id) throw new Error('TILE_PROVIDERS_JSON entry is missing id.');
    inputs.set(id, { ...(inputs.get(id) || {}), ...input, id });
  }

  return inputs;
}

function applyDefaultOverrides(env, inputs, defaultId) {
  const overrides = {};
  const urlTemplate = envValue(env, 'TILE_URL_TEMPLATE', '');
  const attribution = envValue(env, 'TILE_ATTRIBUTION', '');
  const minZoom = envValue(env, 'TILE_MIN_ZOOM', '');
  const maxZoom = envValue(env, 'TILE_MAX_ZOOM', '');
  if (urlTemplate) overrides.urlTemplate = urlTemplate;
  if (attribution) overrides.attribution = attribution;
  if (minZoom !== '') overrides.minZoom = minZoom;
  if (maxZoom !== '') overrides.maxZoom = maxZoom;
  if (!Object.keys(overrides).length) return;

  const current = inputs.get(defaultId);
  if (!current) return;
  inputs.set(defaultId, { ...current, ...overrides });
}

function buildTileConfig(env = process.env) {
  const inputs = mergeProviderInputs(env);

  let defaultId = normalizeId(envValue(env, 'TILE_PROVIDER', DEFAULT_PROVIDER_ID));
  if (!inputs.has(defaultId)) {
    const fallbackId = inputs.has(DEFAULT_PROVIDER_ID) ? DEFAULT_PROVIDER_ID : inputs.keys().next().value;
    // eslint-disable-next-line no-console
    console.warn(`[map-tiles] Unknown TILE_PROVIDER "${defaultId}"; using "${fallbackId}".`);
    defaultId = fallbackId;
  }

  applyDefaultOverrides(env, inputs, defaultId);

  const providers = [];
  for (const [id, raw] of inputs.entries()) {
    try {
      providers.push(validateProvider({ ...raw, id }, 'configuration'));
    } catch (error) {
      // Ignore an invalid custom provider rather than breaking the whole map.
      // The invalid provider is never exposed to clients.
      // eslint-disable-next-line no-console
      console.warn(`[map-tiles] ${error.message}`);
    }
  }

  if (!providers.length) {
    providers.push(validateProvider(BUILTIN_PROVIDERS[DEFAULT_PROVIDER_ID], 'built-in'));
  }

  const selected = providers.find((provider) => provider.id === defaultId) || providers[0];
  const errorThreshold = parseInteger(
    envValue(env, 'TILE_ERROR_THRESHOLD', DEFAULT_ERROR_THRESHOLD),
    DEFAULT_ERROR_THRESHOLD,
    1,
    50,
    'TILE_ERROR_THRESHOLD'
  );

  return Object.freeze({
    defaultProviderId: selected.id,
    providers: Object.freeze(providers),
    referrerPolicy: DEFAULT_REFERRER_POLICY,
    errorThreshold,
    offlineFallback: true,
  });
}

function toPublicTileConfig(tileConfig) {
  return {
    defaultProvider: tileConfig.defaultProviderId,
    referrerPolicy: tileConfig.referrerPolicy,
    errorThreshold: tileConfig.errorThreshold,
    offlineFallback: tileConfig.offlineFallback !== false,
    providers: tileConfig.providers.map((provider) => ({
      id: provider.id,
      label: provider.label,
      urlTemplate: provider.urlTemplate,
      attribution: provider.attribution,
      minZoom: provider.minZoom,
      maxZoom: provider.maxZoom,
      policyUrl: provider.policyUrl,
      policySummary: provider.policySummary,
      requiresReferer: provider.requiresReferer,
    })),
  };
}

module.exports = {
  DEFAULT_PROVIDER_ID,
  DEFAULT_REFERRER_POLICY,
  DEFAULT_ERROR_THRESHOLD,
  BUILTIN_PROVIDERS,
  buildTileConfig,
  toPublicTileConfig,
  validateProvider,
};
