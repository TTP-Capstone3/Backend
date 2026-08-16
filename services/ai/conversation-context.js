const MAX_CONTEXT_MESSAGES = 10;

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function formatProposal(proposal) {
  if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)) {
    return '';
  }

  const details = [];
  const title = cleanText(proposal.title);

  if (title) {
    details.push(`Title: ${title}`);
  }

  const dateFields = [
    ['Starts', proposal.startAt],
    ['Ends', proposal.endAt],
    ['Due', proposal.dueAt],
    ['Reminder', proposal.reminderAt],
  ];

  for (const [label, value] of dateFields) {
    const date = cleanText(value);
    if (date) {
      details.push(`${label}: ${date}`);
    }
  }

  return details.length > 0 ? `Proposal: ${details.join(', ')}` : '';
}

function formatAiItem(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return '';
  }

  if (item.kind === 'clarification') {
    return cleanText(item.question);
  }

  if (item.kind === 'proposal') {
    return formatProposal(item.proposal);
  }

  return '';
}

function formatMessage(message) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return '';
  }

  if (!['user', 'ai'].includes(message.sender)) {
    return '';
  }

  const parts = [];
  const text = cleanText(message.text);

  if (text) {
    parts.push(text);
  }

  if (message.sender === 'ai' && Array.isArray(message.items)) {
    for (const item of message.items) {
      const itemText = formatAiItem(item);
      if (itemText) {
        parts.push(itemText);
      }
    }
  }

  if (parts.length === 0) {
    return '';
  }

  const sender = message.sender === 'user' ? 'User' : 'Assistant';
  return `${sender}: ${parts.join(' | ')}`;
}

function buildConversationContext(messages) {
  if (!Array.isArray(messages)) {
    return '';
  }

  return messages
    .slice(-MAX_CONTEXT_MESSAGES)
    .map(formatMessage)
    .filter(Boolean)
    .join('\n');
}

module.exports = {
  MAX_CONTEXT_MESSAGES,
  buildConversationContext,
};
