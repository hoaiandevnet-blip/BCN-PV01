(() => {
  'use strict';

  const views = {
    input: { title: 'Nhập báo cáo ngày', panes: ['input'] },
    registry: { title: 'Tra cứu vụ việc', panes: ['intake'] },
    approval: { title: 'Phê duyệt vụ việc', panes: ['intake'] },
    legal: { title: 'Danh mục pháp luật', panes: ['legal'] },
    returned: { title: 'Báo cáo bị trả lại', panes: ['intake'] },
    updates: { title: 'Cập nhật / Bổ sung', panes: ['intake'] },
    unlock: { title: 'Lịch sử đề nghị', panes: ['unlock'] },
    duplicates: { title: 'Kiểm tra trùng', panes: ['duplicates'] },
    composer: { title: 'Tổng hợp báo cáo', panes: ['composer', 'leaders'] },
    permissions: { title: 'Phân quyền', panes: ['permissions', 'leaders'] },
    history: { title: 'Lịch sử xử lý', panes: ['notifications'] }
  };
  const viewOrder = Object.keys(views);
  const guidance = {
    approval: 'Xem hồ sơ, duyệt hoặc trả lại kèm yêu cầu bổ sung. Đơn vị sửa và gửi lại để duyệt.',
    registry: 'Tra cứu theo ngày, đơn vị, hệ nghiệp vụ và trạng thái. Mở Chi tiết để xem lịch sử hồ sơ.',
    returned: 'Mở Chi tiết để xem lý do trả lại, sửa nội dung và gửi lại hồ sơ.',
    updates: 'Lọc theo ngày ghi nhận hoặc ngày bổ sung. Hồ sơ cũ có diễn biến mới cũng hiện tại đây. Mở Chi tiết để xử lý.',
    duplicates: 'Chọn Kiểm tra trùng trên từng hồ sơ để đối chiếu các ngày và ghi quyết định xử lý.'
  };
  const descriptions = {
    approval: 'Duyệt, trả lại và theo dõi hồ sơ trong phạm vi được phân công.',
    input: 'Ghi nhận vụ việc, tình hình và kết quả công tác.',
    registry: 'Tìm hồ sơ, xem nội dung và tiến độ xử lý.',
    legal: 'Tra cứu phiên bản, điều luật và thẩm định danh mục.',
    returned: 'Xem lý do, chỉnh sửa và gửi lại báo cáo.',
    updates: 'Cập nhật diễn biến cho hồ sơ đã duyệt.',
    unlock: 'Theo dõi đề nghị đã gửi và kết quả xử lý. Tạo đề nghị tại Nhập báo cáo ngày.',
    duplicates: 'Đối chiếu vụ việc trùng giữa các ngày.',
    composer: 'Chọn nội dung, biên tập, thống kê và xuất Word.',
    permissions: 'Phân công, cấu hình chỉ tiêu và quản lý lãnh đạo.',
    history: 'Xem nhật ký được phân công. Mọi thông báo nghiệp vụ nằm tại quả cầu trên thanh hệ thống.'
  };

  window.DailyReportsNavigation = {
    mount(root, { getScope } = {}) {
      const restoreFilters = window.DailyReportsReview.filters(root);
      const entryTopbar = window.DailyReportsEntryTopbar.mount(root);
      const group = document.getElementById('dailyReportNavGroup');
      const buttons = [...(group?.querySelectorAll('[data-bcn-view]') || [])];
      let current = 'input';
      let allowed = {};
      let showFullCatalogue = false;
      const accessPane = document.createElement('section');
      accessPane.id = 'bcnAccessRequired';
      accessPane.dataset.bcnPane = 'access';
      accessPane.className = 'card daily-report-list-card';
      accessPane.hidden = true;
      accessPane.innerHTML = '<h3>Chưa được phân công quyền nghiệp vụ</h3>'
        + '<p id="bcnAccessExplanation"></p><p>Liên hệ quản trị viên để cấp vai trò, đơn vị'
        + ' và phạm vi phù hợp cho Báo cáo ngày.</p>'
        + '<div class="bcn-toolbar"><button class="primary" id="bcnOpenAssignments">'
        + 'Mở phân công quyền nghiệp vụ</button></div>';
      root.querySelector('.daily-report-workspace').append(accessPane);
      const openAssignments = accessPane.querySelector('button');
      openAssignments.onclick = () => {
        if (!allowed.permissions && !showFullCatalogue) return;
        window.DailyReports.navigate('permissions');
        const management = root.querySelector('#bcnRoleManagement');
        management.open = true;
        root.querySelector('#bcnRolesLoad').click();
        management.scrollIntoView({ block: 'start' });
      };

      function firstAllowedView() {
        return viewOrder.find(key => allowed[key]);
      }

      function formatReportDay(value) {
        if (!value) {
          value = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit'
          }).format(new Date());
        }
        const str = String(value).trim();
        const parts = str.split('-');
        if (parts.length === 3 && parts[0].length === 4) {
          return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        return str;
      }

      function updateContext() {
        const reportDay = getScope?.()?.reportDay;
        const formattedDay = formatReportDay(reportDay);
        if (current === 'input') {
          root.querySelector('.daily-report-heading h2').textContent = `Nhập báo cáo ngày ${formattedDay}`;
        }
        entryTopbar.update(current, { formattedDay, reportDay, granted: Boolean(allowed[current]) });
      }

      function select(key) {
        entryTopbar.reset();
        if (!views[key] || (!allowed[key] && !showFullCatalogue)) {
          key = firstAllowedView() || 'access';
        }
        restoreFilters(key);
        const dateBasis = root.querySelector('#bcnCaseFilters [name=date_basis]');
        dateBasis.disabled = key !== 'returned';
        dateBasis.closest('label').hidden = key !== 'returned';
        current = key;
        const view = views[key];
        const accessRequired = key === 'access' || !allowed[key];
        root.dataset.bcnActiveView = key;
        root.dataset.bcnAccess = accessRequired ? 'required' : 'granted';
        const formattedDay = formatReportDay(getScope?.()?.reportDay);
        const headingTitle = (key === 'input' && formattedDay)
          ? `${view?.title || 'Nhập báo cáo ngày'} ${formattedDay}`
          : (view?.title || 'Báo cáo ngày');
        root.querySelector('.daily-report-heading h2').textContent = headingTitle;
        const description = root.querySelector('#bcnPageDescription');
        if (description) {
          description.textContent = view
            ? descriptions[key]
            : 'Tài khoản chưa được cấp module nghiệp vụ Báo cáo ngày.';
        }
        root.querySelectorAll('[data-bcn-pane]').forEach(pane => {
          pane.hidden = accessRequired || !view?.panes.includes(pane.dataset.bcnPane);
        });
        accessPane.hidden = !accessRequired;
        openAssignments.hidden = !allowed.permissions && !showFullCatalogue;
        if (accessRequired) {
          const roles = ['approval', 'composer', 'duplicates'].includes(key)
            ? 'Cán bộ tổng hợp PV01'
            : 'Đơn vị nhập báo cáo hoặc Cán bộ tổng hợp PV01';
          root.querySelector('#bcnAccessExplanation').textContent = key === 'access'
            ? 'Tài khoản hiện chưa có module nghiệp vụ Báo cáo ngày nào được cấp.'
            : `Chức năng ${view.title} cần vai trò ${roles}. Tài khoản hiện tại chưa được phân công vai trò này.`;
        }
        buttons.forEach(button => {
          const selected = button.dataset.bcnView === key;
          button.classList.toggle('active', selected);
          if (selected) button.setAttribute('aria-current', 'page');
          else button.removeAttribute('aria-current');
        });
        group?.classList.toggle('has-active-page', Boolean(view));
        if (view && guidance[key]) {
          root.querySelector('#bcnCaseListTitle').textContent = view.title;
          root.querySelector('#bcnCaseListGuidance').textContent = guidance[key];
        }
        for (const field of [root.querySelector('#dailyReportStateFilter'),
          root.querySelector('#bcnCaseFilters [name="state"]')]) {
          if (field.disabled || view?.state) field.value = view?.state || '';
          field.disabled = Boolean(view?.state);
        }
        root.dispatchEvent(new CustomEvent('bcn:navigate', { detail: current }));
        updateContext();
        root.closest('.main')?.scrollTo({ top: 0, behavior: 'instant' });
        return current;
      }

      function configure(permissions, scope = {}) {
        const assignedViews = window.DailyReportPermissions?.views?.() || {};
        const isAdmin = Boolean(scope.isAdmin);
        showFullCatalogue = Boolean(permissions.permissions && assignedViews.permissions);
        allowed = {
          input: Boolean(assignedViews.input && permissions.sources),
          registry: Boolean(assignedViews.registry && permissions.intake),
          approval: Boolean(assignedViews.approval && permissions.composer),
          legal: Boolean(assignedViews.legal && permissions.legal),
          returned: Boolean(assignedViews.returned && permissions.intake),
          updates: Boolean(assignedViews.updates && permissions.intake),
          unlock: Boolean(assignedViews.unlock && permissions.intake),
          duplicates: Boolean(assignedViews.duplicates && permissions.composer),
          composer: Boolean(assignedViews.composer && permissions.composer),
          permissions: Boolean(assignedViews.permissions && permissions.permissions),
          history: Boolean(assignedViews.history && permissions.notifications)
        };
        if (!isAdmin && scope.roles?.includes('PV01_COMPILER') && Array.isArray(scope.compilerModules)) {
          const reporterViews = ['input', 'registry', 'returned', 'updates', 'unlock', 'history', 'legal'];
          for (const key of Object.keys(allowed)) {
            if (key === 'permissions') continue;
            const independent = scope.roles.includes('UNIT_REPORTER') && reporterViews.includes(key)
              || scope.roles.includes('LEGAL_REVIEWER') && key === 'legal'
              || scope.roles.includes('AUDITOR') && key === 'history';
            allowed[key] = Boolean(assignedViews[key]
              && (independent || scope.compilerModules.includes(key)));
          }
        }
        buttons.forEach(button => {
          const granted = Boolean(allowed[button.dataset.bcnView]);
          button.hidden = !granted && !showFullCatalogue;
          button.dataset.bcnAccess = granted ? 'granted' : 'required';
          if (!granted && showFullCatalogue) button.title = 'Chưa được phân công quyền nghiệp vụ BCN';
          else button.removeAttribute('title');
        });
        select(current);
        window.SidebarNavigation?.syncLayout();
      }

      return {
        select,
        configure,
        updateContext,
        allowed: key => Boolean(allowed[key]),
        current: () => current,
        forcedState: () => views[current]?.state || '',
        isCaseView: () => Boolean(views[current] && allowed[current])
          && views[current].panes.includes('intake'),
        deactivate() {
          entryTopbar.reset();
          buttons.forEach(button => {
            button.classList.remove('active');
            button.removeAttribute('aria-current');
          });
          group?.classList.remove('has-active-page');
        },
        reset() {
          configure({});
        }
      };
    }
  };
})();
