'use strict';

const { fail } = require('./http');

const LIMITS = {
  email: 254,
  passwordMin: 8,
  passwordMax: 128,
  displayName: 100,
  title: 120,
  description: 2000,
  categoryName: 80,
  campusName: 160,
  source: 300,
  reason: 500,
  audienceMax: 30,
  accuracyMaxMeters: 100000,
  expiryMaxDays: 1, // 24h default max; bounded sharing
  geoJsonMaxBytes: 200000,
};

const AUDIENCES = new Set(['none', 'students', 'teachers', 'all_authenticated', 'campus', 'selected']);
const SHARE_AUDIENCES = new Set(['students', 'teachers', 'all_authenticated', 'campus', 'selected']);

class ValidationError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
    this.code = 'VALIDATION';
    if (details) this.details = details;
  }
}

function vfail(res, message, details) {
  return fail(res, 400, 'VALIDATION', message, details);
}

function asString(v, field, { required = false, max, trim = true } = {}) {
  if (v == null || v === '') {
    if (required) throw new ValidationError(`${field} is required`);
    return null;
  }
  if (typeof v !== 'string') throw new ValidationError(`${field} must be a string`);
  const s = trim ? v.trim() : v;
  if (required && !s) throw new ValidationError(`${field} is required`);
  if (max && s.length > max) throw new ValidationError(`${field} exceeds maximum length`, { max });
  return s;
}

function normalizeEmail(v, { required = true } = {}) {
  const s = asString(v, 'email', { required, max: LIMITS.email });
  if (s == null) return null;
  const n = s.toLowerCase();
  // conservative format check; uniqueness enforced in DB
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(n)) throw new ValidationError('email is invalid');
  return n;
}

function validatePassword(v, { required = true } = {}) {
  if (v == null || v === '') {
    if (required) throw new ValidationError('password is required');
    return null;
  }
  if (typeof v !== 'string') throw new ValidationError('password must be a string');
  if (v.length < LIMITS.passwordMin) throw new ValidationError(`password must be at least ${LIMITS.passwordMin} characters`);
  if (v.length > LIMITS.passwordMax) throw new ValidationError('password exceeds maximum length');
  return v;
}

function toFiniteNumber(v, field) {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) throw new ValidationError(`${field} must be a finite number`);
  return n;
}

function validateLatitude(v, { required = true } = {}) {
  const n = toFiniteNumber(v, 'latitude');
  if (n == null) { if (required) throw new ValidationError('latitude is required'); return null; }
  if (n < -90 || n > 90) throw new ValidationError('latitude must be between -90 and 90');
  return n;
}

function validateLongitude(v, { required = true } = {}) {
  const n = toFiniteNumber(v, 'longitude');
  if (n == null) { if (required) throw new ValidationError('longitude is required'); return null; }
  if (n < -180 || n > 180) throw new ValidationError('longitude must be between -180 and 180');
  return n;
}

function validateAccuracy(v) {
  if (v == null || v === '') return null;
  const n = toFiniteNumber(v, 'accuracy');
  if (n == null) return null;
  if (n <= 0) throw new ValidationError('accuracy must be positive');
  if (n > LIMITS.accuracyMaxMeters) throw new ValidationError('accuracy exceeds maximum');
  return n;
}

function validateAudience(v, { allowNone = true, required = false } = {}) {
  if (v == null || v === '') {
    if (required) throw new ValidationError('audience is required');
    return null;
  }
  const s = String(v).trim().toLower();
  if (!AUDIENCES.has(s)) throw new ValidationError('audience is invalid');
  if (!allowNone && s === 'none') throw new ValidationError('audience is invalid');
  return s;
}

function parseFutureExpiry({ expiresAt, durationMinutes } = {}, { required = false, maxDays = LIMITS.expiryMaxDays } = {}) {
  const maxMs = maxDays * 24 * 60 * 60 * 1000;
  if (expiresAt != null && expiresAt !== '') {
    const s = String(expiresAt).trim();
    const ms = Date.parse(s);
    if (!Number.isFinite(ms)) throw new ValidationError('expiresAt must be a valid UTC/ISO timestamp');
    if (ms <= Date.now()) throw new ValidationError('expiresAt must be in the future');
    if (ms - Date.now() > maxMs) throw new ValidationError('expiresAt exceeds maximum duration');
    return new Date(ms).toISOString();
  }
  if (durationMinutes != null && durationMinutes !== '') {
    const mins = Number(durationMinutes);
    if (!Number.isFinite(mins) || !Number.isInteger(mins) || mins <= 0) throw new ValidationError('durationMinutes must be a positive integer');
    if (mins > maxDays * 24 * 60) throw new ValidationError('durationMinutes exceeds maximum duration');
    return new Date(Date.now() + mins * 60 * 1000).toISOString();
  }
  if (required) throw new ValidationError('expiry is required');
  return null;
}

function validateBool(v, field, def = undefined) {
  if (v == null) return def;
  if (typeof v === 'boolean') return v;
  if (v === 1 || v === '1' || v === 'true') return true;
  if (v === 0 || v === '0' || v === 'false') return false;
  throw new ValidationError(`${field} must be boolean`);
}

function validateId(v, field = 'id') {
  const n = toFiniteNumber(v, field);
  if (n == null || !Number.isInteger(n) || n <= 0) throw new ValidationError(`${field} is invalid`);
  return n;
}

function ensureObject(v, field) {
  if (v == null) return null;
  if (typeof v !== 'object' || Array.isArray(v)) throw new ValidationError(`${field} must be an object`);
  return v;
}

function isLngLatPair(p) {
  return Array.isArray(p) && p.length >= 2 && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1]))
    && Number(p[0]) >= -180 && Number(p[0]) <= 180 && Number(p[1]) >= -90 && Number(p[1]) <= 90;
}

function validateRing(ring, path) {
  if (!Array.isArray(ring) || ring.length < 4) throw new ValidationError(`GeoJSON ${path} must have >= 4 positions`);
  ring.forEach((p, i) => { if (!isLngLatPair(p)) throw new ValidationError(`GeoJSON ${path}[${i}] must be [lng,lat]`); });
  const a = ring[0], b = ring[ring.length - 1];
  if (Number(a[0]) !== Number(b[0]) || Number(a[1]) !== Number(b[1])) throw new ValidationError(`GeoJSON ${path} must be closed`);
}

function validatePolygonCoords(coords, path = 'coordinates') {
  if (!Array.isArray(coords) || coords.length < 1) throw new ValidationError(`GeoJSON ${path} must be a non-empty array`);
  coords.forEach((ring, i) => validateRing(ring, `${path}[${i}]`));
}

function validateGeoJson(v, { required = false } = {}) {
  if (v == null || v === '') {
    if (required) throw new ValidationError('boundary is required');
    return null;
  }
  let obj = v;
  if (typeof v === 'string') {
    if (Buffer.byteLength(v, 'utf8') > LIMITS.geoJsonMaxBytes) throw new ValidationError('boundary GeoJSON is too large');
    try { obj = JSON.parse(v); } catch { throw new ValidationError('boundary must be valid GeoJSON'); }
  }
  obj = ensureObject(obj, 'boundary');
  if (obj.type === 'Feature' && obj.geometry) obj = obj.geometry;
  if (!obj || (obj.type !== 'Polygon' && obj.type !== 'MultiPolygon')) {
    throw new ValidationError('boundary must be GeoJSON Polygon or MultiPolygon');
  }
  if (obj.type === 'Polygon') validatePolygonCoords(obj.coordinates);
  if (obj.type === 'MultiPolygon') {
    if (!Array.isArray(obj.coordinates) || !obj.coordinates.length) throw new ValidationError('GeoJSON MultiPolygon coordinates required');
    obj.coordinates.forEach((poly, i) => validatePolygonCoords(poly, `coordinates[${i}]`));
  }
  return JSON.stringify(obj.type === 'Feature' ? v : { type: obj.type, coordinates: obj.coordinates });
}

function assertRoleIn(user, roles) {
  if (!user) { const e = new Error('Authentication required'); e.status = 401; e.code = 'UNAUTHORIZED'; throw e; }
  if (!roles.includes(user.role)) { const e = new Error('Insufficient role'); e.status = 403; e.code = 'FORBIDDEN'; throw e; }
}

function assertAuthenticated(user) {
  if (!user) { const e = new Error('Authentication required'); e.status = 401; e.code = 'UNAUTHORIZED'; throw e; }
}

module.exports = {
  LIMITS, AUDIENCES, SHARE_AUDIENCES, ValidationError, vfail,
  asString, normalizeEmail, validatePassword, toFiniteNumber,
  validateLatitude, validateLongitude, validateAccuracy, validateAudience,
  parseFutureExpiry, validateBool, validateId, validateGeoJson,
  assertRoleIn, assertAuthenticated,
};
