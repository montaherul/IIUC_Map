'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const assert = require('assert');
const session = require('express-session');

const root = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'iiuc-map-test-'));
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = path.join(tmp, 'app.db');
process.env.SESSION_DB_PATH = path.join(tmp, 'sessions.db');
process.env.SESSION_SECRET = 'test-secret';
process.env.PORT = '0';
process.env.HOST = '127.0.0.1';
process.env.CORS_ORIGIN = 'http://localhost:3000';
process.env.REGISTRATION_ENABLED = '1';
process.env.APP_NAME = 'IIUC Live Campus Map Test';

const { migrate } = require(path.join(root, 'src/db/migrate'));
const { run, get, db } = require(path.join(root, 'src/db/sqlite'));
const { createServerApp } = require(path.join(root, 'src/server'));

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log('ok -', name);
  } catch (e) {
    results.push({ name, ok: false, error: e });
    console.error('not ok -', name);
    console.error(e && e.stack ? e.stack : e);
  }
}

function jsonReq(port, method, p, body, cookie) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', 'Accept': 'application/json' };
    if (cookie) headers.Cookie = cookie;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const req = http.request({ hostname: '127.0.0.1', port, path: p, method, headers }, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => {
        const set = res.headers['set-cookie'];
        let parsed = buf;
        try { parsed = buf ? JSON.parse(buf) : null; } catch {}
        resolve({ status: res.statusCode, headers: res.headers, body: parsed, cookie: Array.isArray(set) ? set.map((s) => s.split(';')[0]).join('; ') : set ? set.split(';')[0] : null });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function seedUser({ email, password = 'Password123!', display_name = 'User', role = 'student', is_active = 1 }) {
  const bcrypt = require('bcrypt');
  const roleRow = await get('SELECT id FROM roles WHERE name=?', [role]);
  const hash = await bcrypt.hash(password, 10);
  const now = new Date().toISOString();
  const r = await run('INSERT INTO users(email,password_hash,display_name,role_id,is_active,created_at,updated_at) VALUES (?,?,?,?,?,?,?)', [email.toLowerCase(), hash, display_name, roleRow.id, is_active ? 1 : 0, now, now]);
  await run('INSERT INTO sharing_preferences(user_id,is_sharing,audience,updated_at) VALUES (?,0,\'none\',?)', [r.lastID, now]);
  return r.lastID;
}

async function loginAs(port, email, password) {
  const r = await jsonReq(port, 'POST', '/api/v1/auth/login', { email, password });
  assert.strictEqual(r.status, 200, `login failed ${email}: ${JSON.stringify(r.body)}`);
  assert.ok(r.cookie, 'login cookie missing');
  return r.cookie;
}

(async () => {
  await migrate();
  const { server } = createServerApp({ sessionStore: new session.MemoryStore() });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  await seedUser({ email: 'admin@iiuc.test', display_name: 'Admin', role: 'admin' });
  await seedUser({ email: 'teacher@iiuc.test', display_name: 'Teacher', role: 'teacher' });
  await seedUser({ email: 'student@iiuc.test', display_name: 'Student', role: 'student' });

  await test('health endpoint works', async () => {
    const r = await jsonReq(port, 'GET', '/api/v1/health');
    assert.strictEqual(r.status, 200);
    assert.ok(r.body && r.body.ok);
  });

  await test('public config exposes compliant tile providers and Referer policy', async () => {
    const r = await jsonReq(port, 'GET', '/api/v1/config/public');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.headers['referrer-policy'], 'strict-origin-when-cross-origin');
    const tiles = r.body.data.tiles;
    assert.ok(tiles, 'tiles config missing');
    assert.ok(Array.isArray(tiles.providers) && tiles.providers.length >= 2, 'expected built-in providers');
    const osm = tiles.providers.find((p) => p.id === 'osm-standard');
    assert.ok(osm, 'osm-standard provider missing');
    assert.strictEqual(osm.urlTemplate, 'https://tile.openstreetmap.org/{z}/{x}/{y}.png');
    assert.ok(/OpenStreetMap/.test(osm.attribution), 'visible OSM attribution missing');
    assert.ok(!/\{s\}/.test(osm.urlTemplate), 'legacy {s} token should not be used');
  });

  await test('auth login success and /me', async () => {
    const cookie = await loginAs(port, 'student@iiuc.test', 'Password123!');
    const me = await jsonReq(port, 'GET', '/api/v1/auth/me', null, cookie);
    assert.strictEqual(me.status, 200);
    assert.strictEqual(me.body.data.user.role, 'student');
  });

  await test('auth invalid credentials rejected', async () => {
    const r = await jsonReq(port, 'POST', '/api/v1/auth/login', { email: 'student@iiuc.test', password: 'wrong' });
    assert.strictEqual(r.status, 401);
  });

  await test('authorization: non-admin cannot access admin stats', async () => {
    const cookie = await loginAs(port, 'student@iiuc.test', 'Password123!');
    const r = await jsonReq(port, 'GET', '/api/v1/admin/stats', null, cookie);
    assert.strictEqual(r.status, 403);
  });

  await test('admin can access stats and user list', async () => {
    const cookie = await loginAs(port, 'admin@iiuc.test', 'Password123!');
    const stats = await jsonReq(port, 'GET', '/api/v1/admin/stats', null, cookie);
    assert.strictEqual(stats.status, 200);
    assert.ok(stats.body.data.stats.users >= 3);
    const users = await jsonReq(port, 'GET', '/api/v1/admin/users', null, cookie);
    assert.strictEqual(users.status, 200);
    assert.ok(Array.isArray(users.body.data.items));
  });

  await test('campus/map data: admin creates campus location and authenticated list returns it', async () => {
    const cookie = await loginAs(port, 'admin@iiuc.test', 'Password123!');
    const cat = await get("SELECT id FROM categories WHERE kind='campus' LIMIT 1");
    const created = await jsonReq(port, 'POST', '/api/v1/campus', { name: 'CSE Building', latitude: 22.47, longitude: 91.79, categoryId: cat.id, isActive: true }, cookie);
    assert.strictEqual(created.status, 200);
    const list = await jsonReq(port, 'GET', '/api/v1/campus', null, cookie);
    assert.ok(list.body.data.items.some((i) => i.name === 'CSE Building'));
  });

  await test('markers: authenticated user can create; owner can update', async () => {
    const cookie = await loginAs(port, 'student@iiuc.test', 'Password123!');
    const created = await jsonReq(port, 'POST', '/api/v1/markers', { title: 'Study Spot', latitude: 22.471, longitude: 91.791 }, cookie);
    assert.strictEqual(created.status, 200);
    const id = created.body.data.item.id;
    const updated = await jsonReq(port, 'PATCH', `/api/v1/markers/${id}`, { title: 'Study Spot 2' }, cookie);
    assert.strictEqual(updated.status, 200);
  });

  await test('GPS/location: update requires sharing enabled and validates coords', async () => {
    const cookie = await loginAs(port, 'student@iiuc.test', 'Password123!');
    const bad = await jsonReq(port, 'POST', '/api/v1/location/update', { latitude: 999, longitude: 1 }, cookie);
    assert.ok([400, 403].includes(bad.status));
    const prefs = await jsonReq(port, 'POST', '/api/v1/location/prefs', { isSharing: true, audience: 'all_authenticated', durationMinutes: 30 }, cookie);
    assert.strictEqual(prefs.status, 200);
    const okUpd = await jsonReq(port, 'POST', '/api/v1/location/update', { latitude: 22.471, longitude: 91.791, accuracy: 12 }, cookie);
    assert.strictEqual(okUpd.status, 200);
    const stop = await jsonReq(port, 'POST', '/api/v1/location/stop', {}, cookie);
    assert.strictEqual(stop.status, 200);
  });

  await test('privacy: viewer audience filtering hides non-authorized live locations', async () => {
    const locSvc = require(path.join(root, 'src/modules/locations/service'));
    const sid = await seedUser({ email: 'sharer@iiuc.test', display_name: 'Sharer', role: 'student' });
    await run("UPDATE sharing_preferences SET is_sharing=1,audience='teachers',updated_at=? WHERE user_id=?", [new Date().toISOString(), sid]);
    const exp = new Date(Date.now() + 3600000).toISOString();
    await run('INSERT INTO live_locations(user_id,latitude,longitude,accuracy,recorded_at,expires_at) VALUES (?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET latitude=excluded.latitude,longitude=excluded.longitude,recorded_at=excluded.recorded_at,expires_at=excluded.expires_at', [sid, 22.47, 91.79, 5, new Date().toISOString(), exp]);
    const studentView = await locSvc.listVisible({ id: 999, role: 'student' });
    assert.ok(!studentView.some((r) => r.userId === sid), 'student should not see teachers-only location');
    const teacherView = await locSvc.listVisible({ id: 998, role: 'teacher' });
    assert.ok(teacherView.some((r) => r.userId === sid), 'teacher should see teachers-only location');
  });

  await test('socket contract: handlers register expected events (mock)', async () => {
    const { registerSockets } = require(path.join(root, 'src/sockets/index'));
    const handlers = {};
    const socket = {
      request: { session: { user: { id: 1, role: 'student', display_name: 'S' } } },
      user: null,
      join() {},
      emit() {},
      on(event, fn) { handlers[event] = fn; },
      disconnect() {},
    };
    const io = { to() { return { emit() {} }; }, emit() {}, use(fn) { if (fn.length === 2) fn(socket, () => {}); }, on(event, fn) { if (event === 'connection') Promise.resolve(fn(socket)).catch(() => {}); } };
    registerSockets(io, (req, _res, next) => next());
    await new Promise((r) => setTimeout(r, 80));
    ['snapshot:request','location:status','location:update','location:stop','location:pause','location:resume','marker:join','marker:leave'].forEach((ev) => {
      assert.strictEqual(typeof handlers[ev], 'function', `missing socket event ${ev}`);
    });
  });

  await test('admin: disabling user removes live location (privacy/safety)', async () => {
    const cookie = await loginAs(port, 'admin@iiuc.test', 'Password123!');
    const uid = await seedUser({ email: 'disable@iiuc.test', display_name: 'DisableMe', role: 'student' });
    await run("UPDATE sharing_preferences SET is_sharing=1,audience='all_authenticated',expires_at=?,updated_at=? WHERE user_id=?", [new Date(Date.now()+3600000).toISOString(), new Date().toISOString(), uid]);
    await run('INSERT INTO live_locations(user_id,latitude,longitude,recorded_at,expires_at) VALUES (?,?,?,?,?)', [uid, 22.47, 91.79, new Date().toISOString(), new Date(Date.now()+3600000).toISOString()]);
    const r = await jsonReq(port, 'PATCH', `/api/v1/admin/users/${uid}`, { isActive: false }, cookie);
    assert.strictEqual(r.status, 200);
    const loc = await get('SELECT * FROM live_locations WHERE user_id=?', [uid]);
    assert.ok(!loc, 'live location should be removed after disable');
  });

  await new Promise((resolve) => server.close(resolve));
  try { db.close(); } catch {}
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
