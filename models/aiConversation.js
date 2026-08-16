const { DataTypes } = require('sequelize');
const db = require('../db');

// Stores one private AI conversation for a user.
const AiConversation = db.define('aiConversation', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false,
  },
});

module.exports = AiConversation;
