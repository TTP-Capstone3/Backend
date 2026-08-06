# Backend Boilerplate — PERN Capstone

An Express + Node backend that talks to Postgres via Sequelize and exposes a
JSON API for your React app. Ships with one example resource (`Task`) showing
the full CRUD pattern, and a complete auth setup with **two ways to log in** —
email + password that we handle ourselves, and social login via **Auth0**.

Copy the example, then delete it.

This is one half of a pair. The React app that talks to it lives here:

**→ [ttp-frontend-setup (`auth0` branch)](https://github.com/aghaffar570/ttp-frontend-setup/tree/auth0)**

Both need to be running for login to work, and a few settings have to match
across the two — they're called out where they come up below.

## Getting started

Use Node 24 for local development. If you use `nvm`, the checked-in `.nvmrc`
selects it for you; Node 22.1 or newer within the Node 22 release line is also
supported.

```bash
nvm use                    # optional if Node 24 is already active
npm install
createdb capstone_dev      # once — must match LOCAL_DATABASE_NAME in db/index.js
cp .env.example .env       # then fill in the values below
npm run seed               # drop + recreate tables, insert sample data
npm run dev                # start with auto-restart (npm start for no restart)
```

You should see:

```
🐘 Database connection established.
🧩 Models synced.
🚀 Server is running on PORT: 8080
```

Quick check: <http://localhost:8080/check> · the API: <http://localhost:8080/api/tasks>

### Filling in `.env`

The server **refuses to start** without these — that's on purpose, so you find
out now rather than after a login silently does the wrong thing.

| Variable | What it is |
|---|---|
| `JWT_SECRET` | Signs the tokens we issue. Generate with the command below. |
| `AUTH0_DOMAIN` | Your tenant domain, no `https://` (e.g. `dev-abc.us.auth0.com`). |
| `AUTH0_AUDIENCE` | Your API's Identifier in the Auth0 dashboard. **Must match the frontend's `VITE_AUTH0_AUDIENCE` exactly.** |

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`FRONTEND_URL`, `PORT`, `JWT_EXPIRES_IN`, and `AUTH0_CLAIMS_NAMESPACE` all have
sensible defaults for local development. See `.env.example` for the rest.

## Structure

```
app.js              entry point: middleware, routes, server start
db/index.js         Postgres connection (Sequelize)
db/seed.js          sample data          (npm run seed)
models/             model definitions + associations (models/index.js)
middleware/auth.js  requireAuth — accepts either credential
routes/             resource routers, incl. auth.routes.js (routes/index.js)
public/             static info page served at /
```

## Authentication

There are two doors into this app, and they meet in the same place.

**Door 1 — email + password (ours).** `POST /auth/signup` hashes the password
with bcrypt and stores only the hash; we never store the password itself.
`POST /auth/login` hashes the attempt and compares. On success we sign a JWT and
put it in an **httpOnly cookie**, which JavaScript cannot read — so an XSS bug
can't steal it. The browser attaches that cookie to every later request by
itself, which is why the frontend never touches a token.

**Door 2 — Auth0 (social login).** Auth0 collects the credential and hands the
frontend an **access token**, sent as `Authorization: Bearer <token>`. We can't
verify it with a shared secret: Auth0 signs it with a private key (RS256) and
publishes the matching public one. `express-oauth2-jwt-bearer` fetches that key
and checks the signature for us.

**`requireAuth` accepts either** and resolves both to the same thing: `req.user`,
a row from our own `users` table. Your route handlers never have to care which
door someone came through.

```js
app.get('/api/thing', requireAuth, handler)  // one route
router.use(requireAuth)                       // every route in a router
```

### The routes

| Method | Path | Needs | Does |
|---|---|---|---|
| POST | `/auth/signup` | — | create an account, set the cookie |
| POST | `/auth/login` | — | check the password, set the cookie |
| POST | `/auth/logout` | — | clear the cookie |
| POST | `/auth/auth0` | Auth0 token | after a social login, create the user if new |
| GET | `/auth/me` | either | the logged-in user's row |
| GET | `/api/protected` | either | a throwaway route for confirming auth works |

Logging out has to be a request to the server — an httpOnly cookie is exactly
the kind JavaScript can't delete. A JWT is stateless, so there's no session to
destroy; "logging out" just means throwing the cookie away.

### The `users` table

One table holds both kinds of user, which is why **both `passwordHash` and
`auth0Id` are nullable** — each row fills in one or the other:

- password signup → `passwordHash` set, `auth0Id` null
- Auth0 login → `auth0Id` set (the token's `sub`), `passwordHash` null

We key Auth0 users on `auth0Id`, never on email: emails change, the `sub` never
does. `User.prototype.toJSON` strips `passwordHash`, so it can't leak out of an
endpoint even if you forget to remove it.

### Post-Login Action (optional)

Auth0 access tokens don't carry `email` or `name` unless you ask. Without this,
login still works — those two columns are just `null`. To get them, add a
**Post-Login Action** in the Auth0 dashboard (Actions → Library → Build Custom):

```js
exports.onExecutePostLogin = async (event, api) => {
  const namespace = 'https://myapp.example.com'; // = AUTH0_CLAIMS_NAMESPACE
  api.accessToken.setCustomClaim(`${namespace}/email`, event.user.email);
  api.accessToken.setCustomClaim(`${namespace}/name`, event.user.name);
};
```

The namespace is required — Auth0 silently drops custom claims that aren't
namespaced — and it must match `AUTH0_CLAIMS_NAMESPACE` in your `.env`
character for character. Remember to drag the Action into the Login flow.

## The example API — `/api/tasks`

| Method | Path             | Does                          |
|--------|------------------|-------------------------------|
| GET    | `/api/tasks`     | list all tasks                |
| GET    | `/api/tasks/:id` | get one task                  |
| POST   | `/api/tasks`     | create a task                 |
| PUT    | `/api/tasks/:id` | replace a task (all fields)   |
| PATCH  | `/api/tasks/:id` | update part of a task         |
| DELETE | `/api/tasks/:id` | delete a task                 |

These are **public** on purpose, so you can play with them before auth exists.
To make tasks private per user, add the guard where the router is mounted in
`app.js` and uncomment the associations in `models/index.js`:

```js
app.use('/api/tasks', requireAuth, taskRouter);
```

## Add your own resource

1. **Model** — copy `models/task.model.js`, change the fields, export it from `models/index.js`.
2. **Router** — copy `routes/task.routes.js`, swap `Task` for your model, export it from `routes/index.js`.
3. **Mount it** — in `app.js`: `app.use('/api/posts', postRouter)`.
4. **Associations** — define relationships in `models/index.js`.

## Deploy

- Set `DATABASE_URL` (your host provides it) — `db/index.js` picks it up and enables SSL.
- Set `FRONTEND_URL` to your deployed React URL so CORS allows it.
- Set `NODE_ENV=production`. This tightens the rate limit and, importantly,
  switches the login cookie to `Secure` + `SameSite=None` — required once the
  frontend and API are on different domains, or the cookie is never sent.
- Set a **different** `JWT_SECRET` than the one on your laptop.
- Set `PORT` if your host requires a specific one (defaults to 8080).

## Common issues

| Symptom | Fix |
|---|---|
| `Missing JWT_SECRET` on startup | You skipped `cp .env.example .env`, or left `JWT_SECRET` blank. |
| `ECONNREFUSED ... 5432` | Postgres isn't running, or the db doesn't exist. Start Postgres, run `createdb capstone_dev`. |
| `database "capstone_dev" does not exist` | `createdb capstone_dev` (or change the name in `db/index.js` — and create *that* one). |
| Login works, then every request 401s | Two suspects: `AUTH0_AUDIENCE` doesn't match the frontend's `VITE_AUTH0_AUDIENCE`, or the frontend forgot `credentials: 'include'`. |
| Model changes don't appear | `app.js` only creates missing tables. Run `npm run seed` to rebuild them. |
| `429 Too many requests` while developing | You're running with `NODE_ENV=production` locally. Unset it. |
| `port 8080 already in use` | Stop the other server, or set `PORT` in `.env`. |
