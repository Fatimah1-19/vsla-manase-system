require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { pool, warmUp } = require('./config/db');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { publicImpact } = require('./controllers/dashboardController');

const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL;

app.set('trust proxy', 1);
// In production the allowed website must be named; in development anything goes.
if (process.env.NODE_ENV === 'production' && !FRONTEND_URL) {
  console.error('\n  FRONTEND_URL must be set when NODE_ENV=production.\n');
  process.exit(1);
}
app.use(cors({ origin: FRONTEND_URL || true, credentials: true, exposedHeaders: ['X-Renewed-Token'] }));

// Say how long each slow request took, so a slow page can be traced to the request
// responsible. Requests slower than 600 ms are printed (set LOG_REQUESTS=true to see all).
app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Math.round(Number(process.hrtime.bigint() - start) / 1e6);
    if (req.originalUrl.startsWith('/api') && (ms > 600 || process.env.LOG_REQUESTS === 'true')) {
      console.log(`  ${req.method} ${req.originalUrl.split('?')[0]}  ${res.statusCode}  ${ms} ms`);
    }
  });
  next();
});

// Document uploads arrive as base64 text, so that one route needs a bigger body.
app.use('/api/profile', express.json({ limit: '3.5mb' }), require('./routes/profileRoutes'));
app.use(express.json({ limit: '1mb' }));

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/members', require('./routes/memberRoutes'));
app.use('/api/savings', require('./routes/savingsRoutes'));
app.use('/api/loans', require('./routes/loanRoutes'));
app.use('/api/fines', require('./routes/fineRoutes'));
app.use('/api/welfare', require('./routes/welfareRoutes'));
app.use('/api/meetings', require('./routes/meetingRoutes'));
app.use('/api/cycles', require('./routes/cycleRoutes'));
app.use('/api/shareout', require('./routes/shareOutRoutes'));
app.use('/api/join-requests', require('./routes/joinRequestRoutes'));
app.use('/api/sms', require('./routes/smsRoutes'));
app.use('/api/audit', require('./routes/auditRoutes'));
app.use('/api/settings', require('./routes/settingsRoutes'));
app.use('/api/dashboard', require('./routes/dashboardRoutes'));
app.use('/api/contributions', require('./routes/contributionRoutes'));
app.use('/api/analytics', require('./routes/analyticsRoutes'));

// Counts only, no money — this is what the public front page shows.
app.get('/api/public/impact', publicImpact);

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      ok: true,
      database: 'connected',
      sms: process.env.TEXTBEE_API_KEY ? 'configured' : 'not configured',
      dry_run: String(process.env.SMS_DRY_RUN).toLowerCase() === 'true',
    });
  } catch (err) {
    res.status(503).json({ ok: false, database: 'not connected', error: err.message });
  }
});

app.use(notFound);
app.use(errorHandler);

const server = app.listen(PORT, () => {
  console.log(`\n  Manase VSLA API on http://localhost:${PORT}`);
  console.log(`  Frontend expected at ${FRONTEND_URL || 'any origin'}`);
  console.log(`  Health check: http://localhost:${PORT}/api/health\n`);

  // Open the database connections now, in the background, so the first people
  // to log in do not each wait seconds for a new one.
  warmUp(8).then((ok) => console.log(ok ? '  Database connections ready.\n' : '  (The database could not be reached yet.)\n'));
});

const shutdown = (signal) => {
  console.log(`\n${signal} received, closing.`);
  server.close(() => pool.end().then(() => process.exit(0)));
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));