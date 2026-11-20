export function createChatState() {
  return { owner: null, messages: [], model: '', ready: false, busy: false };
}

export function conversationHistory(messages) {
  const pairs = [];
  for (let index = 0; index < messages.length - 1; index += 1) {
    const question = messages[index];
    const answer = messages[index + 1];
    if (question.role === 'user' && answer.role === 'assistant' && answer.complete) {
      pairs.push([
        { role: 'user', content: question.historyContent || question.content },
        { role: 'assistant', content: answer.historyContent || answer.content }
      ]);
    }
  }
  const history = [];
  let remaining = 2400;
  for (const pair of pairs.slice(-4).reverse()) {
    const size = pair.reduce((sum, message) => sum + message.content.length, 0);
    if (size > remaining) break;
    remaining -= size;
    history.unshift(...pair);
  }
  return history;
}
