(() => {
  'use strict';

  window.DailyReportEntryLock = {
    mount({ root, onStateChange }) {
      const regions = ['input', 'sources'].map(name => {
        const pane = root.querySelector(`[data-bcn-pane="${name}"]`);
        const region = document.createElement('fieldset');
        region.className = 'bcn-entry-lock-region';
        region.disabled = true;
        region.inert = true;
        region.dataset.entryLockRegion = name;
        region.setAttribute('aria-label', name === 'input' ? 'Nội dung nhập báo cáo ngày' : 'Dữ liệu báo cáo');
        for (const child of [...pane.children]) {
          if (!['bcnCutoffLockBanner', 'bcnUnlockedBanner', 'bcnSubmittedReportCard'].includes(child.id)) region.append(child);
        }
        pane.append(region);
        return region;
      });
      let scope = null;
      let receivedAt = 0;
      let locked = null;
      let timer = null;

      function sync() {
        const serverTime = Date.parse(scope?.serverNow);
        const now = Number.isFinite(serverTime) ? serverTime + Date.now() - receivedAt : Date.now();
        const cutoff = Date.parse(`${scope?.reportDay}T10:00:00+07:00`);
        const activeUnlock = scope?.activeUnlock && Date.parse(scope.activeUnlock.expiresAt) > now
          ? scope.activeUnlock : null;
        const closed = !scope || (!scope.isAdmin && (Number.isFinite(cutoff)
          ? now >= cutoff : scope.isLocked) && !activeUnlock);
        onStateChange(closed, activeUnlock, now);
        if (closed !== locked) {
          const hadFocus = regions.some(region => region.contains(document.activeElement));
          const editableDialog = 'dialog[open]:not(#bcnQuickUnlockDialog):not(#bcnCasePreview)';
          const dialog = root.querySelector(editableDialog);
          locked = closed;
          root.dataset.bcnEntryLocked = String(closed);
          for (const region of regions) {
            region.disabled = closed;
            region.inert = closed;
            region.setAttribute('aria-disabled', String(closed));
          }
          if (closed && root.dataset.bcnActiveView === 'input') {
            root.querySelectorAll(editableDialog).forEach(dialog => dialog.close());
            if ((hadFocus || dialog) && root.offsetParent !== null) {
              root.querySelector('#bcnUnlockTriggerBtn')?.focus();
            }
          }
        }
      }

      for (const region of regions) {
        for (const type of ['click', 'submit', 'keydown', 'beforeinput', 'drop']) {
          region.addEventListener(type, event => {
            sync();
            if (!locked) return;
            event.preventDefault();
            event.stopImmediatePropagation();
          }, true);
        }
      }
      document.addEventListener('visibilitychange', sync);
      return {
        configure(nextScope) {
          scope = nextScope;
          receivedAt = Date.now();
          sync();
          if (!timer) timer = setInterval(sync, 1000);
        },
        reset() {
          clearInterval(timer);
          timer = null;
          scope = null;
          sync();
        },
        sync
      };
    }
  };
})();
