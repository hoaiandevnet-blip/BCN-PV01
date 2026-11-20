import { highlightRanges } from './highlights.js';

function appendText(parent, content, { emphasize = false, names = [] }) {
  if (!emphasize) {
    parent.append(document.createTextNode(content));
    return;
  }
  let cursor = 0;
  for (const range of highlightRanges(content, names)) {
    parent.append(document.createTextNode(content.slice(cursor, range.start)));
    const highlight = document.createElement('strong');
    highlight.className = `seedy-ai-highlight seedy-ai-highlight-${range.kind}`;
    highlight.textContent = content.slice(range.start, range.end);
    parent.append(highlight);
    cursor = range.end;
  }
  parent.append(document.createTextNode(content.slice(cursor)));
}

// All highlights and inline markup are text nodes. Never interpret model output as HTML.
export function renderMessageText(element, content, options = {}) {
  const fragment = document.createDocumentFragment();
  const pattern = /\*\*([^*\n]+)\*\*|`([^`\n]+)`/g;
  let cursor = 0;
  for (const match of content.matchAll(pattern)) {
    appendText(fragment, content.slice(cursor, match.index), options);
    const span = document.createElement(match[1] === undefined ? 'code' : 'strong');
    if (match[1] === undefined) span.textContent = match[2];
    else appendText(span, match[1], options);
    fragment.append(span);
    cursor = match.index + match[0].length;
  }
  appendText(fragment, content.slice(cursor), options);
  element.replaceChildren(fragment);
}
