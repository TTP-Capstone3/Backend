const test = require('node:test');
const assert = require('node:assert/strict');

process.env.LOCAL_DATABASE_URL ||=
  'postgres://test:test@127.0.0.1:5432/capstone_test';

const {
  User,
  AiConversation,
  AiMessage,
} = require('../models');

test('AI conversations belong to one user', () => {
  const userId = AiConversation.rawAttributes.userId;

  assert.equal(userId.allowNull, false);
  assert.equal(Boolean(userId.unique), true);
  assert.equal(userId.onDelete, 'CASCADE');
  assert.equal(User.associations.aiConversation.target, AiConversation);
  assert.equal(AiConversation.associations.user.target, User);
});

test('AI messages store chat text and proposal items', () => {
  const sender = AiMessage.rawAttributes.sender;
  const text = AiMessage.rawAttributes.text;
  const items = AiMessage.rawAttributes.items;

  assert.deepEqual(sender.values, ['user', 'ai']);
  assert.equal(sender.allowNull, false);
  assert.equal(text.allowNull, false);
  assert.equal(text.defaultValue, '');
  assert.equal(items.allowNull, false);
  assert.deepEqual(items.defaultValue, []);
});

test('AI messages belong to a conversation', () => {
  const conversationId = AiMessage.rawAttributes.conversationId;

  assert.equal(conversationId.allowNull, false);
  assert.equal(conversationId.onDelete, 'CASCADE');
  assert.equal(AiConversation.associations.aiMessages.target, AiMessage);
  assert.equal(AiMessage.associations.aiConversation.target, AiConversation);
});
