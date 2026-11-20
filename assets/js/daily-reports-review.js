(() => {
  'use strict';
  const pendingStates = ['SUBMITTED', 'RESUBMITTED', 'PENDING_REVIEW'];
  function allowed(scope, view) {
    return view === 'approval' && Boolean(scope?.isAdmin
      || scope?.roles?.includes('PV01_COMPILER') && scope.compilerModules?.includes('approval'));
  }
  function actions(scope, view, state) {
    const reviewer = allowed(scope, view);
    return {
      verify: reviewer && pendingStates.includes(state),
      supplement: reviewer && ['SUBMITTED', 'RESUBMITTED', 'PENDING_REVIEW', 'VERIFIED'].includes(state)
    };
  }
  // Each workspace retains its own filters even though the table renderer is shared.
  function filters(root) {
    const saved = new Map();
    const form = root.querySelector('#bcnCaseFilters');
    const state = root.querySelector('#dailyReportStateFilter');
    let previous = null;
    return view => {
      if (view === previous) return;
      if (previous) saved.set(previous, { values: [...new FormData(form)], state: state.value });
      form.reset();
      state.value = '';
      const snapshot = saved.get(view);
      for (const [key, value] of snapshot?.values || []) {
        const field = form.elements.namedItem(key);
        if (field) field.value = value;
      }
      if (snapshot) state.value = snapshot.state;
      previous = view;
      root.querySelector('#bcnTabCases')?.click();
    };
  }
  window.DailyReportsReview = { allowed, actions, filters };
})();
