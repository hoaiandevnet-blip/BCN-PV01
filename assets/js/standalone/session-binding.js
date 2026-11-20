(() => {
  let accountId = '';
  let generation = 0;
  let rotation = null;

  function clear() {
    accountId = '';
    generation += 1;
  }

  const stale = () => Object.assign(new Error('Phiên tài khoản đã thay đổi. Vui lòng đăng nhập lại.'), {
    status: 401,
    code: 'ACCOUNT_SESSION_CHANGED'
  });

  window.BcnSession = {
    setAccount(account) {
      accountId = String(account.id);
      generation += 1;
    },
    clear,
    async fetch(input, options = {}) {
      const expected = accountId;
      const requestGeneration = generation;
      const headers = new Headers(options.headers);
      if (expected) headers.set('X-BCN-Account-Id', expected);
      const pending = window.fetch(input, { ...options, headers });
      const rotatesSession = String(input) === '/api/change-password';
      if (rotatesSession) rotation = pending;
      let response;
      try {
        response = await pending;
      } finally {
        if (rotatesSession && rotation === pending) rotation = null;
      }
      const assertCurrent = () => {
        if (generation !== requestGeneration) throw stale();
      };
      assertCurrent();
      if (expected && response.status === 401) {
        // A password change replaces the cookie; a request already in flight can still use the old one.
        if (rotation) await rotation.catch(() => {});
        assertCurrent();
        const session = await window.fetch('/api/session', {
          credentials: 'same-origin', cache: 'no-store',
          headers: { 'X-BCN-Account-Id': expected }
        });
        assertCurrent();
        if (session.ok && String((await session.json()).account?.id) === expected) {
          assertCurrent();
          response = await window.fetch(input, { ...options, headers });
          assertCurrent();
        }
        if (!session.ok || response.status === 401) {
          clear();
          window.dispatchEvent(new CustomEvent('bcn-session-expired'));
          throw stale();
        }
      }
      const readJson = response.json.bind(response);
      response.json = async () => {
        const body = await readJson();
        assertCurrent();
        return body;
      };
      return response;
    }
  };
})();
