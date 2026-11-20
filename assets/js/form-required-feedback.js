(() => {
  'use strict';

  const markerSelector = '.required-marker, .staff-required, .add-required, .bcn-required, .bcn-intake-required';

  function markLabels(root) {
    const labels = [];
    if (root.nodeType === Node.ELEMENT_NODE && root.matches('label')) labels.push(root);
    if (root.querySelectorAll) labels.push(...root.querySelectorAll('label'));
    for (const label of labels) {
      const walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!node.nodeValue.includes('*') || !parent || parent.closest(markerSelector)
            || parent.closest('select, textarea, option, script, style')) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      for (const node of nodes) {
        const parts = node.nodeValue.split('*');
        const fragment = document.createDocumentFragment();
        parts.forEach((part, index) => {
          if (index) {
            const star = document.createElement('span');
            star.className = 'required-marker';
            star.textContent = '*';
            fragment.append(star);
          }
          fragment.append(document.createTextNode(part));
        });
        node.replaceWith(fragment);
      }
      if (label.querySelector(markerSelector)) {
        const control = label.control || label.querySelector('input, select, textarea');
        if (control && control.type !== 'hidden') control.required = true;
      }
    }
  }

  function labelFor(control) {
    const label = control.labels?.[0] || control.closest('label');
    const heading = label?.querySelector('span, strong');
    return (heading?.textContent || label?.textContent || control.getAttribute('aria-label') || 'trường bắt buộc')
      .replace(/\*/g, '').trim().replace(/\s+/g, ' ').slice(0, 120);
  }

  document.addEventListener('invalid', event => {
    const control = event.target;
    if (!control.validity?.valueMissing || !control.required) return;
    globalThis.NotificationPopup?.getShared().notify(`Vui lòng nhập ${labelFor(control)}.`);
  }, true);

  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'characterData') {
        const label = record.target.parentElement?.closest('label');
        if (label) markLabels(label);
      } else {
        for (const node of record.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) markLabels(node);
          else if (node.nodeType === Node.TEXT_NODE) {
            const label = node.parentElement?.closest('label');
            if (label) markLabels(label);
          }
        }
      }
    }
  });
  markLabels(document.body);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
})();
