// middleware/auth.js — who is making this request?
//
// Our app accepts TWO kinds of proof of identity:
//
//   1. OUR OWN JWT, in an httpOnly cookie.  Issued by /auth/signup and
//      /auth/login after we check the password with bcrypt. We sign it with
//      JWT_SECRET, so we can also verify it ourselves.
//
//   2. AN AUTH0 ACCESS TOKEN, in the Authorization: Bearer header. Issued by
//      Auth0 after an OAuth login (Google, GitHub, ...). We can't verify this
//      with a shared secret — Auth0 signs it with a PRIVATE key (RS256) and
//      publishes the matching PUBLIC key. express-oauth2-jwt-bearer fetches
//      that key and checks the signature for us.
//
// requireAuth accepts EITHER and resolves both to the same thing: req.user, a
// row from our own users table. Routes downstream never have to care which
// door the user came through.

const jwt = require('jsonwebtoken');
const { auth } = require('express-oauth2-jwt-bearer');
const { User } = require('../models');

// Custom claims (like the user's email) must be namespaced with a URL-like
// string, or Auth0 strips them from the token. This MUST match, character for
// character, the namespace used in your Auth0 Post-Login Action — see the
// README. It isn't a secret and it never has to resolve to a real website;
// it lives in .env only so you can change it without editing code.
const CLAIMS_NAMESPACE = process.env.AUTH0_CLAIMS_NAMESPACE || 'https://myapp.example.com';

// ---------- our own JWT settings ----------

// The secret used to SIGN and VERIFY our tokens. Anyone who knows it can forge
// a token for any user, so it is a real secret: it lives in .env, never in git.
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Fail loudly at startup rather than letting every login silently produce a
// token signed with "undefined".
if (!JWT_SECRET) {
  throw new Error('Missing JWT_SECRET — set it in .env (see .env.example).');
}

if (!process.env.AUTH0_DOMAIN || !process.env.AUTH0_AUDIENCE) {
  throw new Error(
    'Missing Auth0 env vars — set AUTH0_DOMAIN and AUTH0_AUDIENCE in .env.',
  );
}

// AUTH0_DOMAIN should be a bare host (dev-xxx.us.auth0.com). Tolerate a pasted
// https:// prefix instead of building a broken "https://https://..." issuer URL.
const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN.replace(
  /^https?:\/\//,
  '',
).replace(/\/$/, '');

// ---------- token helpers ----------

// Sign a token that says "this is user <id>". Notice what we DON'T put in it:
// no password, no hash. A JWT is signed, not encrypted — anyone holding it can
// read the payload but only with the secret. Only put in it what you'd be fine with the user seeing.
const signToken = (user) =>
  jwt.sign({ sub: user.id, username: user.username }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });

// In production the frontend is on a different domain than the API, so the
// cookie has to be marked SameSite=None (and therefore Secure) to be sent at
// all. In local dev both are on localhost, where Lax works fine.
const isProd = process.env.NODE_ENV === 'production';

const COOKIE_NAME = 'token';

const cookieOptions = {
  httpOnly: true, // JavaScript can't read it -> an XSS bug can't steal the token
  secure: isProd, // only sent over HTTPS in production
  sameSite: isProd ? 'none' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days, in milliseconds
};

// Put the freshly signed token in the response as an httpOnly cookie. The
// browser stores it and attaches it to every later request automatically —
// the frontend never touches the token itself.
const sendTokenCookie = (res, user) =>
  res.cookie(COOKIE_NAME, signToken(user), cookieOptions);

// Clearing must use the SAME options (minus maxAge) or the browser won't match
// the cookie it set, and logout silently does nothing.
const clearTokenCookie = (res) =>
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
  });

// ---------- Auth0 verification ----------

// jwtCheck is Auth0's middleware. On success it attaches the decoded token to
// req.auth.payload (req.auth.payload.sub is the Auth0 user id). Still exported
// on its own for routes that must be Auth0-only, like POST /auth/auth0.
const jwtCheck = auth({
  audience: process.env.AUTH0_AUDIENCE, // the API identifier you set in Auth0
  issuerBaseURL: `https://${AUTH0_DOMAIN}/`, // your Auth0 domain
  tokenSigningAlg: 'RS256',
});

// ---------- the unified guard ----------

// Put requireAuth on any route to demand a logged-in user:
//
//   router.use(requireAuth)                     // protect every route in a router
//   app.get('/secret', requireAuth, handler)    // protect a single route
//
// After it runs, req.user is a User row from our database. If the request has
// no valid credential of either kind, it 401s BEFORE your handler runs.
const requireAuth = async (req, res, next) => {
  const cookieToken = req.cookies?.[COOKIE_NAME];
  const bearer = req.headers.authorization?.startsWith('Bearer ');

  // --- door 1: our own cookie JWT ---
  if (cookieToken) {
    try {
      // verify() re-computes the signature with our secret and checks expiry.
      // It THROWS on a forged or expired token — that's the whole point.
      const payload = jwt.verify(cookieToken, JWT_SECRET);
      const user = await User.findByPk(payload.sub);

      // The token was valid but the user is gone (deleted account). Treat the
      // stale cookie as no credential at all.
      if (!user) {
        clearTokenCookie(res);
        return res.status(401).json({ error: 'Session no longer valid' });
      }

      req.user = user;
      return next();
    } catch {
      clearTokenCookie(res);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  }

  // --- door 2: an Auth0 Bearer token ---
  if (bearer) {
    // jwtCheck is ordinary Express middleware, so we can call it by hand and
    // pass it our own callback as `next`. It calls back with an error if the
    // token is bad, or with nothing if it verified.
    return jwtCheck(req, res, async (err) => {
      if (err) return next(err); // app.js turns this into a clean 401

      try {
        const user = await User.findOne({
          where: { auth0Id: req.auth.payload.sub },
        });

        // Verified by Auth0, but we've never stored them. The frontend fixes
        // this by calling POST /auth/auth0 once after login.
        if (!user) {
          return res.status(404).json({
            error: 'User not found. Sync first with POST /auth/auth0.',
          });
        }

        req.user = user;
        next();
      } catch (dbErr) {
        next(dbErr);
      }
    });
  }

  // --- no credential at all ---
  return res.status(401).json({ error: 'Authentication required' });
};

// Read the identity out of a VERIFIED Auth0 token. We never trust the client
// for these values, because Auth0 signed them.
//   - sub: the Auth0 user id (always present) -> stored as auth0Id
//   - email / name: CUSTOM CLAIMS added by our Auth0 Post-Login Action
const identityFromToken = (req) => {
  const claims = req.auth.payload;
  return {
    auth0Id: claims.sub,
    email: claims[`${CLAIMS_NAMESPACE}/email`] || null,
    name: claims[`${CLAIMS_NAMESPACE}/name`] || null,
  };
};

module.exports = {
  jwtCheck,
  requireAuth,
  identityFromToken,
  signToken,
  sendTokenCookie,
  clearTokenCookie,
  CLAIMS_NAMESPACE,
};
