import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';
import routes from './routes';
import terminalPairingRoutes from './routes/terminalPairing.routes';
import { errorHandler, notFound } from './middleware/error';
import { runMigrations } from './config/migrate';
import { checkAndRunDueBackups } from './services/backup.service';
import { initFromSavedSession as initWhatsapp } from './services/whatsapp.service';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const isElectron  = process.env.ELECTRON_APP === '1';
const isProduction = process.env.NODE_ENV === 'production';

// ── Security & middleware ───────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));

// Live POS data (stock, sales, etc.) must never be served stale from a browser
// or intermediate cache — disable ETag/conditional-GET caching on API responses.
app.disable('etag');
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

app.use(cors({
  origin: isElectron
    ? `http://localhost:${PORT}`
    : (process.env.FRONTEND_URL || (isProduction ? '*' : 'http://localhost:5173')),
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// ── Health check ────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── API routes ──────────────────────────────────────────────────────────────
// Terminal pairing is intentionally public (see terminalPairing.routes.ts) —
// mounted before the authenticated router so it's never accidentally
// shadowed by a stricter /api-wide guard added later.
app.use('/api/terminal', terminalPairingRoutes);
app.use('/api', routes);

// ── Installer downloads (Print Agent, etc.) ────────────────────────────────
// In production this can be intercepted by a reverse proxy serving the same
// repo-root downloads/ folder directly — this route exists so the same
// /downloads/* links work against the local dev server too, with no
// separate setup needed.
app.use('/downloads', express.static(path.join(__dirname, '..', '..', '..', '..', 'downloads')));

// ── Static frontend ─────────────────────────────────────────────────────────
// Served by backend in two cases:
//   1. Electron packaged app (ELECTRON_APP=1, path set by main.js via FRONTEND_DIST)
//   2. Self-hosted web app   (NODE_ENV=production, path relative to this file)
if (isElectron || isProduction) {
  const frontendDist = process.env.FRONTEND_DIST
    || path.join(__dirname, '..', '..', 'frontend', 'dist');
  app.use(express.static(frontendDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// ── Error handling ──────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── Start ───────────────────────────────────────────────────────────────────
// A 60s tick is cheap: it's a no-op unless the schedule configured in
// Settings is actually due right now (see checkAndRunDueBackups).
const BACKUP_SCHEDULE_CHECK_INTERVAL_MS = 60 * 1000;

const start = async () => {
  // Idempotent (every statement is `IF NOT EXISTS`) — safe to run on every
  // startup, whether that's this backend running directly (web app) or
  // forked as a child process by the Electron app.
  await runMigrations();

  if (!isElectron) {
    setInterval(() => {
      checkAndRunDueBackups().catch((err) => console.warn('[backup] Schedule check failed:', err.message));
    }, BACKUP_SCHEDULE_CHECK_INTERVAL_MS);
  }

  // Not awaited — resuming a previously-linked WhatsApp session can take a
  // moment (network round trip) and must never delay the server actually
  // starting to listen.
  initWhatsapp().catch((err) => console.warn('[whatsapp] Startup init failed:', err.message));

  app.listen(PORT, () => {
    console.log(`\n🚀 RetailPOS API running on port ${PORT}`);
    console.log(`   Mode: ${isElectron ? 'Electron' : (isProduction ? 'Production' : 'Development')}`);
    console.log(`   Health: http://localhost:${PORT}/health\n`);
  });
};

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

export default app;
