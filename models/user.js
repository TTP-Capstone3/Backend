// user.model.js — the User table.
//
// A user can now arrive in our app TWO different ways, and one table holds both:
//
//   1. LOCAL signup  — they gave us an email + password. We store a bcrypt HASH
//                      of that password in passwordHash. auth0Id stays null.
//   2. AUTH0 / OAuth — they logged in with Google/GitHub/etc. Auth0 owns the
//                      password (if there even is one), so passwordHash stays
//                      null and we store their Auth0 "sub" in auth0Id.
//
// That's why BOTH passwordHash and auth0Id are nullable: every row fills in one
// or the other. Neither is required on its own.
const { DataTypes } = require('sequelize');
const db = require('../db');

const User = db.define('user', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false,
  },
  // The user's full name. Comes from Auth0 for OAuth users; optional for everyone.
  name: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  // A display name the user picks in OUR app (sent from the frontend).
  username: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: { len: [3, 20] }, // must be 3–20 characters
  },
  // Required for local signup — it's how you log in. For Auth0 users it comes
  // from a custom claim, which is only present if the Post-Login Action is set
  // up, so the column itself stays nullable.
  email: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
    validate: { isEmail: true },
  },
  // NEVER the password itself — only bcrypt's one-way hash of it. Even if this
  // table leaked, the original passwords are not in it.
  passwordHash: {
    type: DataTypes.STRING,
    allowNull: true, // null for Auth0/OAuth users — Auth0 holds their credential
  },
  // The Auth0 user id — the token's "sub", e.g. "auth0|abc123". The stable link
  // between Auth0 and our database. We key on this, never on email (emails can
  // change; the sub never does). Null for users who signed up with a password.
  auth0Id: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
  },
});

// Express calls toJSON automatically whenever you res.json(user). Overriding it
// here means the password hash can NEVER leak out of an endpoint by accident —
// we don't have to remember to strip it at every call site.
User.prototype.toJSON = function () {
  const values = { ...this.get() };
  delete values.passwordHash;
  return values;
};

module.exports = User;
