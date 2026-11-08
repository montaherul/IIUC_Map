const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');

const config = require('./config/env');
const { toPublicTileConfig } = require('./config/mapTiles');
const { migrate } = require('./db/migrate');
const { attachUser, csrfGuard, requireAuth, requireRole } = require('./middleware/auth');
const { fail, ok } = require('./utils/http');
const healthRoutes = require('./routes/health');
const authRoutes = require('./modules/auth/routes');
const campusRoutes = require('./modules/campus/routes');
const categoryRoutes = require('./modules/categories/routes');
const markerRoutes = require('./modules/markers/routes');
const locationRoutes = require('./modules/locations/routes');
const adminRoutes = require('./modules/admin/routes');
const auditRoutes = require('./modules/audit/routes');
const { registerSockets } = require('./sockets');

function createSessionStore() {
  return new SQLiteStore({ db: path.basename(config.sessionDbPath), dir: path.dirname(config.sessionDbPath) });
}

function createServerApp({ sessionStore } = {}) {
  fs.mkdirSync(path.dirname(config.sessionDbPath), { recursive: true });
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: config.corsOrigin, credentials: true } });
  app.set('io', io);

  if (config.trustProxy) app.set('trust proxy', 1);
  // OSM tile servers reject tile requests that arrive without a Referer. Helmet's
  // default `no-referrer` policy removed it from every cross-origin tile request,
  // producing the "Access blocked" tiles. Keep CSRF protections, but send the
  // origin on cross-origin requests so the browser's normal Referer is preserved.
  app.use(helmet({
    contentSecurityPolicy: false,
    referrerPolicy: { policy: config.tiles.referrerPolicy },
  }));
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false }));

  const sessionMiddleware = session({
    store: sessionStore || createSessionStore(),
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.nodeEnv === 'production',
      maxAge: 1000 * 60 * 60 * 8,
    },
  });

  app.use(sessionMiddleware);
  app.use(attachUser);

  const authLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again later.' } },
  });
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }));
  app.use('/api', csrfGuard);
  app.use('/api/v1/auth/login', authLimiter);
  app.use('/api/v1/auth/register', authLimiter);

  app.get('/api/v1/config/public', (_req, res) => ok(res, {
    appName: config.appName,
    registrationEnabled: !!config.registrationEnabled,
    features: { publicMapPreview: true },
    tiles: toPublicTileConfig(config.tiles),
  }));

  app.use('/api/v1', healthRoutes);
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/campus', campusRoutes);
  app.use('/api/v1/categories', categoryRoutes);
  app.use('/api/v1/markers', markerRoutes);
  app.use('/api/v1/location', locationRoutes);
  app.use('/api/v1/admin', adminRoutes);
  app.use('/api/v1/audit', auditRoutes);

  app.use(express.static(path.join(config.root, 'public')));
  app.get('/', (_req, res) => res.sendFile(path.join(config.root, 'public', 'pages', 'index.html')));
  app.get('/login', (_req, res) => res.sendFile(path.join(config.root, 'public', 'pages', 'login.html')));
  app.get('/register', (_req, res) => {
    if (!config.registrationEnabled) return res.redirect('/login?registration=disabled');
    return res.sendFile(path.join(config.root, 'public', 'pages', 'register.html'));
  });
  app.get('/map', (_req, res) => res.sendFile(path.join(config.root, 'public', 'pages', 'map.html')));
  app.get('/dashboard', (_req, res) => res.sendFile(path.join(config.root, 'public', 'pages', 'map.html')));
  app.get('/live-location', (_req, res) => res.sendFile(path.join(config.root, 'public', 'pages', 'map.html')));
  app.get('/profile', (_req, res) => res.sendFile(path.join(config.root, 'public', 'pages', 'map.html')));
  app.get('/settings', (_req, res) => res.sendFile(path.join(config.root, 'public', 'pages', 'map.html')));
  app.get('/admin', (_req, res) => res.sendFile(path.join(config.root, 'public', 'pages', 'admin.html')));
  const adminPages = ['dashboard', 'users', 'campus', 'markers', 'categories', 'locations', 'logs', 'settings', 'system-health'];
  adminPages.forEach((page) => {
    app.get(`/admin/${page}`, requireAuth, requireRole('admin'), (_req, res) => {
      res.sendFile(path.join(config.root, 'public', 'pages', 'admin.html'));
    });
  });

  app.use((req, res) => fail(res, 404, 'NOT_FOUND', `No route: ${req.method} ${req.path}`));
  app.use((err, _req, res, _next) => {
    console.error(err);
    fail(res, err.status || 500, err.code || 'INTERNAL', config.nodeEnv === 'development' ? err.message : 'Internal server error');
  });

  registerSockets(io, sessionMiddleware);
  return { app, server, io, sessionMiddleware };
}

async function main() {
  await migrate();
  const { server } = createServerApp();
  server.listen(config.port, config.host, () => {
    console.log(`IIUC Live Campus Map listening on http://${config.host}:${config.port}`);
  });
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal startup error', err);
    process.exit(1);
  });
}

module.exports = { createServerApp, main };
