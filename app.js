// app.js — the front door of the server.
// It creates the app, plugs in middleware, mounts routes, connects to the
// database, then starts listening. Read it top to bottom — that's roughly the
// order a request travels through the app.

require('dotenv').config();
const path = require('path');
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { rateLimit } = require('express-rate-limit');

const { db } = require('./models'); // the database connection
const { authRouter, scheduleItemRouter, categoryRouter } = require('./routes'); // our routers
const { requireAuth } = require('./middleware/auth'); // accepts our JWT or Auth0's

const app = express();
const PORT = process.env.PORT || 8080;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Deployed apps sit behind a proxy (Render, ...). This tells Express
// to trust it, so rate-limiting sees the real visitor IP and secure cookies work.
app.set('trust proxy', 1);

// Stop any one IP from spamming the server.
//
// The limit is deliberately loose in development. React's StrictMode runs every
// effect twice, and a single page refresh already costs you /auth/me plus a
// data fetch — so a tight limit means you hit 429 while debugging and think
// your auth broke. Production is where this actually has a job to do.
const isProd = process.env.NODE_ENV === 'production';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: isProd ? 100 : 1000, // max requests per IP in that window
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: '🛑 Too many requests, please try again later.' },
});

// ---------- middleware ----------
// Middleware runs IN ORDER on every request, before it reaches your routes.
app.use(helmet()); // sets safe HTTP headers
app.use(cookieParser());
app.use(
  cors({
    origin: FRONTEND_URL, // let your React app call this API
    credentials: true, // allow cookies (needed once you add login/auth)
  }),
);
app.use(morgan('dev')); // logs each request to the terminal (handy for debugging)
app.use(express.json({ limit: '10kb' })); // parse JSON bodies into req.body; cap the size
app.use(limiter);
app.use(express.static(path.join(__dirname, 'public'))); // serve the info page in /public

// ---------- health check ----------
// The first thing to hit when something seems broken. If this returns JSON,
// the server is up and the problem is further in (the database, a route, CORS).
app.get('/check', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ---------- public test route ----------
// A tiny endpoint to quickly confirm the server is up.
app.get('/api/public', (req, res) => {
  res.json({ message: '👋🏽 Hi, you found this public route!' });
});

// ---------- protected test route ----------
// A tiny PROTECTED endpoint used to prove auth works. requireAuth middleware runs first,
// so only a request carrying a valid credential reaches the handler —
// otherwise it gets a 401. It accepts EITHER our own JWT cookie (password
// login) or an Auth0 Bearer token (OAuth login), and either way hands us
// req.user: the row from our own users table.
app.get('/api/protected', requireAuth, (req, res) => {
  res.json({
    message: '🔒 Your token is valid — you reached a protected route!',
    userId: req.user.id,
    username: req.user.username,
    // How did they log in? Handy to see the two doors working.
    via: req.user.auth0Id ? 'auth0' : 'password',
  });
});

// ---------- API routes ----------
// Mount each resource router under /api. Add your own the same way:
//   app.use('/api/posts', postRouter)
// To make tasks private per user, add requireAuth middleware here:
//   app.use('/api/tasks', requireAuth, taskRouter)

// Auth routes: signup/login/logout with our own JWT, plus the Auth0 sync.
// This router applies the right guard to each route, so we just mount it here.
app.use('/auth', authRouter);
app.use('/schedule-items', scheduleItemRouter);
app.use('/categories', categoryRouter)

// ---------- 404 ----------
// Nothing above matched, so the thing doesn't exist. Send a clear JSON 404.
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ---------- error handler ----------
// Express knows this is the error handler because it takes FOUR arguments.
// Every next(err) from a route ends up here, so all errors funnel to one place.
app.use((err, req, res, next) => {
  console.error('ERROR:', err.message);
  // jwtCheck throws a 401 when a token is missing or invalid. Respect any
  // status the error already carries; anything else is a real server error.
  const status = err.status || err.statusCode || 500;
  const message =
    status === 401
      ? 'Invalid or missing token'
      : 'Something went wrong on the server';
  res.status(status).json({ error: message });
});

// ---------- start the server ----------
// Don't start listening until the database is reachable.
//   authenticate() — a quick "can I connect?" check.
//   sync()         — creates any missing tables from your models.
// Never use sync({ force: true }) here — it DROPS your tables on every boot.
const startServer = async () => {
  try {
    await db.authenticate();
    console.log('🐘 Database connection established.');

    // Creates any tables that don't exist yet from your models. Signup and
    // login both write to the users table, so this has to run for auth to work.
    //
    // Note what it does NOT do: change a table that already exists. When you
    // add or rename a column, run `npm run seed` to rebuild the tables.
    //
    // You'll see `sync({ alter: true })` suggested online for this. Avoid it
    // here: on Postgres it re-adds the unique constraints on username, email,
    // and auth0Id on EVERY boot, so with nodemon restarting all day you quietly
    // pile up users_username_key1, key2, key3... until Postgres refuses more.
    // And never `sync({ force: true })` in app.js — it DROPS your tables.
    await db.sync();
    console.log('🧩 Models synced.');

    const server = app.listen(PORT, () => {
      console.log(`🚀 Server is running on PORT: ${PORT}`);
    });

    // Graceful shutdown: hosts send SIGTERM on redeploy. Stop taking new
    // requests, then close the DB connection so nothing is left hanging.
    const shutdown = () => {
      console.log('\n👋 Shutting down...');
      server.close(async () => {
        await db.close();
        process.exit(0);
      });
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (err) {
    console.error('❌ Unable to start server:', err.message);
    process.exit(1); // stop the process so the problem is obvious
  }
};

startServer();
