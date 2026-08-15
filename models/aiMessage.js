const { DataTypes } = require('sequelize');
const db = require('../db');

// Stores one user or AI message inside a conversation.
const AiMessage = db.define('aiMessage', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false,
  },

  sender: {
    type: DataTypes.ENUM('user', 'ai'),
    allowNull: false,
  },

  text: {
    type: DataTypes.TEXT,
    allowNull: false,
    defaultValue: '',
  },

  items: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: [],
  },
});

module.exports = AiMessage;
