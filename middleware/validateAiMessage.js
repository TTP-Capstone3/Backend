const MAX_AI_MESSAGE_LENGTH = 2000;
const MAX_AI_MESSAGE_ITEMS = 10;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateAiItem(item, index) {
  const errors = [];
  const itemName = `Item ${index + 1}`;

  if (!isPlainObject(item)) {
    return [`${itemName} must be an object.`];
  }

  if (!['proposal', 'clarification'].includes(item.kind)) {
    errors.push(`${itemName} must have a valid kind.`);
  }

  if (item.kind === 'clarification') {
    if (typeof item.question !== 'string' || !item.question.trim()) {
      errors.push(`${itemName} must include a question.`);
    }
  }

  if (item.kind === 'proposal' && !isPlainObject(item.proposal)) {
    errors.push(`${itemName} must include a proposal.`);
  }

  if (item.isSaved !== undefined && typeof item.isSaved !== 'boolean') {
    errors.push(`${itemName} isSaved must be true or false.`);
  }

  return errors;
}

function validateAiMessage(data) {
  if (!isPlainObject(data)) {
    return ['Message data must be an object.'];
  }

  const errors = [];
  const items = data.items === undefined ? [] : data.items;

  if (!['user', 'ai'].includes(data.sender)) {
    errors.push('Sender must be user or ai.');
  }

  if (typeof data.text !== 'string') {
    errors.push('Text must be a string.');
  } else if (data.text.length > MAX_AI_MESSAGE_LENGTH) {
    errors.push(`Text must be ${MAX_AI_MESSAGE_LENGTH} characters or fewer.`);
  }

  if (!Array.isArray(items)) {
    errors.push('Items must be an array.');
    return errors;
  }

  if (items.length > MAX_AI_MESSAGE_ITEMS) {
    errors.push(`A message can have no more than ${MAX_AI_MESSAGE_ITEMS} items.`);
  }

  if (typeof data.text === 'string' && !data.text.trim() && items.length === 0) {
    errors.push('A message must include text or an item.');
  }

  if (data.sender === 'user' && items.length > 0) {
    errors.push('User messages cannot include AI items.');
  }

  if (data.sender === 'ai') {
    items.forEach((item, index) => {
      errors.push(...validateAiItem(item, index));
    });
  }

  return errors;
}

module.exports = validateAiMessage;
module.exports.MAX_AI_MESSAGE_LENGTH = MAX_AI_MESSAGE_LENGTH;
module.exports.MAX_AI_MESSAGE_ITEMS = MAX_AI_MESSAGE_ITEMS;
