'use strict';
const { get } = require('../db/sqlite');
const locService = require('../modules/locations/service');
const markerService = require('../modules/markers/service');
const { validateLatitude, validateLongitude, validateAccuracy, validateId, assertAuthenticated } = require('../utils/validation');

function roomFor(audience) { return `aud:${audience}`; }
function markerRoom(markerId) { return `marker:${Number(markerId)}`; }

function canJoinAudience(user, audience) {
  if (!user) return false;
  if (audience === 'all_authenticated' || audience === 'campus') return true;
  if (audience === 'students') return ['student', 'teacher', 'admin'].includes(user.role);
  if (audience === 'teachers') return ['teacher', 'admin'].includes(user.role);
  return false;
}

function registerSockets(io, sessionMiddleware) {
  io.use((socket, next) => sessionMiddleware(socket.request, {}, next));

  io.use((socket, next) => {
    const user = socket.request.session && socket.request.session.user;
    if (!user) return next(new Error('UNAUTHORIZED'));
    socket.user = user;
    next();
  });

  io.on('connection', async (socket) => {
    const user = socket.user;
    try { assertAuthenticated(user); } catch { socket.disconnect(true); return; }

    socket.join(roomFor('campus'));
    socket.join(roomFor('all_authenticated'));
    if (['student', 'teacher', 'admin'].includes(user.role)) socket.join(roomFor('students'));
    if (['teacher', 'admin'].includes(user.role)) socket.join(roomFor('teachers'));
    if (user.role === 'admin') socket.join('admin');

    try { socket.emit('location:snapshot', await locService.listVisible(user)); } catch {}

    socket.on('snapshot:request', async (_payload, ack) => {
      try { if (ack) ack({ ok: true, items: await locService.listVisible(user) }); }
      catch (e) { if (ack) ack({ ok: false, error: e.message }); }
    });

    socket.on('location:status', async (_payload, ack) => {
      try {
        const prefs = await locService.getPrefs(user.id);
        const live = await get('SELECT * FROM live_locations WHERE user_id = ?', [user.id]);
        const now = Date.now();
        const sharing = !!(prefs && prefs.is_sharing && live && (!live.expires_at || Date.parse(live.expires_at) > now));
        if (ack) ack({
          ok: true, sharing, audience: prefs ? prefs.audience : 'none',
          location: live ? { latitude: live.latitude, longitude: live.longitude, accuracy: live.accuracy, recordedAt: live.recorded_at, expiresAt: live.expires_at } : null,
        });
      } catch (e) { if (ack) ack({ ok: false, error: e.message }); }
    });

    socket.on('location:update', async (payload, ack) => {
      try {
        const lat = validateLatitude(payload && payload.latitude);
        const lng = validateLongitude(payload && payload.longitude);
        const accuracy = validateAccuracy(payload && payload.accuracy);
        const loc = await locService.upsertLive(user.id, { latitude: lat, longitude: lng, accuracy });
        const prefs = await locService.getPrefs(user.id);
        const audience = prefs && prefs.audience || 'none';
        if (!canJoinAudience(user, audience) && audience !== 'selected') throw Object.assign(new Error('Audience not permitted'), { status: 403, code: 'FORBIDDEN' });
        const event = {
          userId: user.id, displayName: user.display_name, role: user.role,
          latitude: loc.latitude, longitude: loc.longitude, accuracy: loc.accuracy, recordedAt: loc.recorded_at,
        };
        // server-controlled audience broadcast; never trust client audience
        io.to(roomFor(audience)).emit('location:updated', event);
        if (ack) ack({ ok: true });
      } catch (e) {
        if (ack) ack({ ok: false, error: e.message, code: e.code || 'ERROR' });
      }
    });

    socket.on('location:stop', async (_payload, ack) => {
      try {
        await locService.stop(user.id);
        io.emit('location:removed', { userId: user.id });
        if (ack) ack({ ok: true });
      } catch (e) { if (ack) ack({ ok: false, error: e.message }); }
    });

    socket.on('marker:join', async ({ markerId } = {}, ack) => {
      try {
        const id = validateId(markerId, 'markerId');
        if (!(await markerService.getById(id))) throw new Error('Marker not found');
        socket.join(markerRoom(id));
        if (ack) ack({ ok: true });
      } catch (e) { if (ack) ack({ ok: false, error: e.message }); }
    });

    socket.on('marker:leave', async ({ markerId } = {}, ack) => {
      try { socket.leave(markerRoom(validateId(markerId, 'markerId'))); if (ack) ack({ ok: true }); }
      catch (e) { if (ack) ack({ ok: false, error: e.message }); }
    });
  });
}

module.exports = { registerSockets, roomFor, markerRoom };
