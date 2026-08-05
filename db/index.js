const { Sequelize } = require('sequelize');
const DB_CONNECTION_URL = process.env.DATABASE_URL || process.env.LOCAL_DATABASE_URL

const db = new Sequelize(DB_CONNECTION_URL, {
  dialect: 'postgres',
  logging: false,
  dialectOptions: process.env.DATABASE_URL
    ? { ssl: { require: true, rejectUnauthorized: false } }
    : {},
});

module.exports = db;
