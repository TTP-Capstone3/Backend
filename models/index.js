// models/index.js — one place to collect all models and their relationships.
// Lets the rest of the app grab them from here: const { Task } = require('./models')

const db = require('../db');
const User = require('./user');
const ScheduleItem = require("./scheduleItem");
const Category = require("./category");
const AiConversation = require('./aiConversation');
const AiMessage = require('./aiMessage');

// ---------- associations ----------
// Describe how tables relate here. When you're ready to tie tasks to their
// owner, uncomment these (it adds a userId column to tasks):
//   User.hasMany(Task)     // one user has many tasks
//   Task.belongsTo(User)   // each task belongs to one user (adds a userId column)

// A user can create many categories 
// deleting a user should also delete their created categories.
User.hasMany(Category, {
  foreignKey: {
    name: 'userId',
    allowNull: false, // A category should always have a user attached.
  },
  onDelete: "CASCADE"
})
Category.belongsTo(User, {
  foreignKey: {
    name: 'userId',
    allowNull: false, // A category should always have a user attached.
  },
})

// A user can have many schedule items 
User.hasMany(ScheduleItem, {
  foreignKey: {
    name: 'userId',
    allowNull: false,   // An item should always have a userId attached.
  },
  onDelete: "CASCADE",
})
ScheduleItem.belongsTo(User, {
  foreignKey: {
    name: 'userId',
    allowNull: false,   // An item should always have a userId attached.
  },
  onDelete: 'CASCADE',
})

// A category can be added to many schedule items which makes filtering and sorting easier.
Category.hasMany(ScheduleItem, {
  foreignKey: {
    name: 'categoryId',
    allowNull: true,    // An item might not have a category even though it can sometimes be 'none'
  },
  onDelete: "SET NULL"
})
ScheduleItem.belongsTo(Category, {
  foreignKey: {
    name: 'categoryId',
    allowNull: true,    // An item might not have a category even though it can sometimes be 'none'
  },
  onDelete: 'SET NULL',
})

// Each user has one private AI conversation.
User.hasOne(AiConversation, {
  foreignKey: {
    name: 'userId',
    allowNull: false,
    unique: true,
  },
  onDelete: 'CASCADE',
});
AiConversation.belongsTo(User, {
  foreignKey: {
    name: 'userId',
    allowNull: false,
    unique: true,
  },
  onDelete: 'CASCADE',
});

// A conversation keeps all of its user and AI messages together.
AiConversation.hasMany(AiMessage, {
  foreignKey: {
    name: 'conversationId',
    allowNull: false,
  },
  onDelete: 'CASCADE',
});
AiMessage.belongsTo(AiConversation, {
  foreignKey: {
    name: 'conversationId',
    allowNull: false,
  },
  onDelete: 'CASCADE',
});

module.exports = {
  db, // exported too so seed.js can sync from one place
  User,
  ScheduleItem,
  Category,
  AiConversation,
  AiMessage,
};
