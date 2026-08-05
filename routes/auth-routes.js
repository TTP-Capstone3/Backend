/**
 * auth.routes.js — everything about WHO the user is.
 * app.js mounts this at /auth, so `.get('/me')` answers GET /auth/me.
 *
 *   PUBLIC (no token needed — this is how you GET a token):
 *     POST /auth/signup  ->  create an account with email + password
 *     POST /auth/login   ->  exchange email + password for a token cookie
 *     POST /auth/logout  ->  throw the cookie away
 *
 *   AUTH0 ONLY:
 *     POST /auth/auth0   ->  after an OAuth login, store that user in our db
 *
 *   EITHER CREDENTIAL (our cookie OR an Auth0 Bearer token):
 *     GET  /auth/me      ->  the logged-in user's row
 *
 * THE BIG IDEA — we never store passwords. bcrypt.hash turns a password into a
 * long string that CANNOT be turned back into the original (it is one-way, not
 * encryption — there is no "unhash"). To check a password later, we hash the
 * attempt the same way and compare the two hashes with bcrypt.compare.
 */

const express = require('express');
const bcrypt = require('bcrypt');
const { Op } = require('sequelize');
const { rateLimit } = require('express-rate-limit');

const { User } = require('../models');
const {
  jwtCheck,
  requireAuth,
  identityFromToken,
  sendTokenCookie,
  clearTokenCookie,
} = require('../middleware/auth');

const router = express.Router();

// How much work bcrypt does. Higher = slower to hash = slower for an attacker
// to guess millions of passwords. 10–12 is the normal range; 12 costs us a few
// hundred milliseconds per login, which a human never notices.
const SALT_ROUNDS = 12;

// Login is the one route worth guessing at, so it gets a much tighter limit
// than the app-wide one. This is what stops someone trying 10,000 passwords.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 20, // 20 attempts per IP per window
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: '🛑 Too many attempts, please try again later.' },
});

// Turn Sequelize's validation/uniqueness errors into a clean 400 instead of
// letting them fall through to the error handler as a confusing 500.
const handleDbError = (err, res, next) => {
  if (
    err.name === 'SequelizeValidationError' ||
    err.name === 'SequelizeUniqueConstraintError'
  ) {
    return res
      .status(400)
      .json({ error: err.errors?.[0]?.message || 'Invalid user data' });
  }
  return next(err);
};

// Our users table demands a username that is unique and 3–20 characters long.
// Auth0's nickname is neither guaranteed: two Google accounts can easily share
// "alex", and some are shorter than three characters. Without this, the second
// "alex" to log in would hit the unique constraint and never get a row —
// Auth0 would think they're logged in while our app showed them logged out.
//
// So: strip anything that isn't a letter/number/underscore, make sure it's long
// enough, then add a number if that name is already taken.
const uniqueUsername = async (preferred) => {
  const cleaned = (preferred || '').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 16);
  const base = cleaned.length >= 3 ? cleaned : 'user';

  let candidate = base;
  let suffix = 1;

  // Keep trying base, base1, base2... until we find one nobody has.
  while (await User.findOne({ where: { username: candidate } })) {
    candidate = `${base}${suffix}`;
    suffix += 1;
  }

  return candidate;
};

// ---------------------------------------------------------------------------
// SIGN UP — POST /auth/signup
// ---------------------------------------------------------------------------
router.post('/signup', authLimiter, async (req, res, next) => {
  try {
    const { username, email, password } = req.body;

    // Validate on the SERVER even though the React form also validates. The
    // frontend check is a convenience for honest users; anyone can skip it by
    // calling this endpoint directly. Server-side validation is the real one!!
    if (!username || !email || !password) {
      return res
        .status(400)
        .json({ error: 'Username, email, and password are all required' });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ error: 'Password must be at least 6 characters' });
    }

    // Check both columns at once so we can say WHICH one is taken.
    const existing = await User.findOne({
      where: { [Op.or]: [{ email }, { username }] },
    });

    if (existing) {
      // the frontend should handle the response appropriately
      return res.status(409).json({
        error:
          existing.email === email
            ? 'An account with that email already exists'
            : 'That username is taken',
      });
    }

    // Hash, THEN store. The plain password exists only inside this function and
    // is never written to the database or the logs.
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await User.create({ username, email, passwordHash });

    // Signing up logs you in
    // — no need to immediately type the password again.
    // - this will set the cookie
    sendTokenCookie(res, user);

    // res.json calls our toJSON override, so passwordHash is stripped here.
    res.status(201).json(user);
  } catch (err) {
    handleDbError(err, res, next);
  }
});

// ---------------------------------------------------------------------------
// LOG IN — POST /auth/login
// ---------------------------------------------------------------------------
router.post('/login', authLimiter, async (req, res, next) => {
  try {
    // `identifier` is whatever the user typed in the "Email or username" box.
    // We also accept a bare `email` or `username` key so the endpoint is easy
    // to call from Postman/curl while you're testing.
    const { identifier, email, username, password } = req.body;
    const login = identifier || email || username;

    if (!login || !password) {
      return res
        .status(400)
        .json({ error: 'Email/username and password are required' });
    }

    // One query, either column — the user shouldn't have to remember which
    // one they signed up with.
    const user = await User.findOne({
      where: { [Op.or]: [{ email: login }, { username: login }] },
    });

    // Deliberately vague, and identical for "no such account" and "wrong
    // password". A precise message like "no account with that email" tells an
    // attacker which emails ARE registered — that's a free list of targets.
    const invalid = () =>
      res.status(401).json({ error: 'Invalid email/username or password' });

    if (!user) return invalid();

    // An OAuth user has no passwordHash, so there is no password to check.
    // Point them at the button that actually works for their account.
    if (!user.passwordHash) {
      return res.status(400).json({
        error: 'This account uses social login — sign in with Auth0 instead.',
      });
    }

    // The heart of it: hash the attempt and compare. bcrypt reads the salt out
    // of the stored hash, so we never have to store or manage the salt ourselves.
    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) return invalid();

    sendTokenCookie(res, user);
    res.json(user);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// LOG OUT — POST /auth/logout
// ---------------------------------------------------------------------------
// There's no server-side session to destroy — a JWT is stateless. "Logging
// out" means deleting the cookie so the browser stops sending it.
router.post('/logout', (req, res) => {
  clearTokenCookie(res);
  res.json({ message: 'Logged out' });
});

// ---------------------------------------------------------------------------
// SYNC AN AUTH0 USER — POST /auth/auth0
// ---------------------------------------------------------------------------
// Auth0-only: jwtCheck runs first, so we KNOW the caller holds a valid Auth0
// token. We look for a row with this auth0Id and create one if it's missing,
// which makes this safe for the frontend to call on EVERY login: the first
// time it creates the user, every time after that it just returns them.
router.post('/auth0', jwtCheck, async (req, res, next) => {
  try {
    // Identity comes from the TOKEN, never the request body — Auth0 signed the
    // token, so we can trust it. A client could put anything in the body.
    const { auth0Id, email, name } = identityFromToken(req);

    // Already synced? Nothing to create — hand back the row we have.
    const existing = await User.findOne({ where: { auth0Id } });
    if (existing) return res.json(existing); // 200 = already existed

    // First social login for this person. The username is app-specific, so the
    // frontend suggests one — but we're the ones who have to make it fit our
    // table's rules, hence uniqueUsername().
    const username = await uniqueUsername(
      req.body.username || name || email?.split('@')[0],
    );

    // passwordHash is intentionally absent — Auth0 owns this user's credential.
    const user = await User.create({ auth0Id, username, email, name });

    res.status(201).json(user); // 201 = Created
  } catch (err) {
    handleDbError(err, res, next);
  }
});

// ---------------------------------------------------------------------------
// WHO AM I — GET /auth/me
// ---------------------------------------------------------------------------
// requireAuth accepts EITHER credential and hands us req.user either way, so
// this single route serves password users and OAuth users identically. The
// frontend calls it on page load to answer "am I still logged in?".
router.get('/me', requireAuth, (req, res) => {
  res.json(req.user);
});

module.exports = router;
