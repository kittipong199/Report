/* Dedicated Department Detail route without changing the protected chart engine. */
(() => {
  'use strict';
  const AVEVA = window.AVEVA;
  if (!AVEVA || typeof AVEVA.drawCategoryColumns !== 'function') return;

  const escapeHtml = (value) => (AVEVA.escapeHtml
    ? AVEVA.escapeHtml(value)
    : String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
      }[char])));

  // Table-only state stays private to this Department Detail view.
  class DepartmentDetailTableView {
    constructor() { this.rows = []; this.filters = {}; this.department = null; this.bound = false; }
    bind() {
      if (this.bound) return;
      this.bound = true;
      const headers = document.querySelectorAll('.department-detail-table th');
      const columns = ['costCentre', 'user', 'company', 'services', 'sessions', 'hours'];
      const funnel = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M2 3h12L9 8v5l-2-1V8Z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
      headers.forEach((header, index) => {
        const key = columns[index], label = header.textContent, numeric = index >= 4;
        const id = 'department-filter-' + key;
        header.dataset.detailColumn = key;
        const inputs = numeric
          ? '<label>Minimum<input type="number" step="any" data-bound="min"></label><label>Maximum<input type="number" step="any" data-bound="max"></label>'
          : '<label>Contains<input type="search" data-bound="text"></label>';
        header.innerHTML = '<div class="department-column-heading"><span>' + label + '</span><button type="button" class="department-column-filter-button" popovertarget="' + id + '" aria-controls="' + id + '" aria-label="Filter ' + label + '" aria-pressed="false" aria-expanded="false">' + funnel + '</button></div><div id="' + id + '" class="department-filter-popover" popover="auto" role="group" aria-label="Filter ' + label + '"><strong>Filter ' + label + '</strong>' + inputs + '<button type="button" data-clear>Clear</button></div>';
        const button = header.querySelector('.department-column-filter-button');
        const popover = header.querySelector('.department-filter-popover');
        popover.addEventListener('beforetoggle', (event) => {
          button.setAttribute('aria-expanded', String(event.newState === 'open'));
          if (event.newState !== 'open') return;
          const rect = button.getBoundingClientRect();
          this.filterAnchor = { button, left: rect.left, top: rect.top };
          popover.style.left = Math.max(8, Math.min(rect.left, innerWidth - 240)) + 'px';
          popover.style.top = Math.max(8, Math.min(rect.bottom + 6, innerHeight - (numeric ? 225 : 175))) + 'px';
        });
        popover.addEventListener('keydown', (event) => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          event.stopPropagation();
          popover.hidePopover();
          button.focus({ preventScroll: true });
        });
        popover.addEventListener('toggle', (event) => {
          if (event.newState === 'open') popover.querySelector('input').focus({ preventScroll: true });
        });
        popover.querySelectorAll('input').forEach((input) => input.addEventListener('input', () => {
          this.filters[key] = { ...this.filters[key], [input.dataset.bound]: input.value };
          this.render();
        }));
        popover.querySelector('[data-clear]').addEventListener('click', () => {
          delete this.filters[key];
          popover.querySelectorAll('input').forEach((input) => { input.value = ''; });
          this.render();
        });
      });
      AVEVA.$('departmentClearColumnFilters').addEventListener('click', () => { this.clear(); this.render(); });
      window.addEventListener('hashchange', () => this.close());
      window.addEventListener('resize', () => this.close());
      document.querySelector('.department-detail-table').addEventListener('scroll', () => {
        if (!this.filterAnchor) return;
        const rect = this.filterAnchor.button.getBoundingClientRect();
        // Ignore queued scrolling that brought the trigger into view before opening.
        if (Math.abs(rect.left - this.filterAnchor.left) > 1 || Math.abs(rect.top - this.filterAnchor.top) > 1) this.close();
      });
    }
    close() { document.querySelectorAll('.department-filter-popover:popover-open').forEach((popover) => popover.hidePopover()); }
    clear() {
      this.filters = {};
      document.querySelectorAll('.department-filter-popover input').forEach((input) => { input.value = ''; });
      this.close();
    }
    setRows(rows, department) {
      this.bind();
      if (department !== this.department) this.clear();
      this.department = department;
      this.rows = rows;
      this.render();
    }
    render() {
      const normalized = (value) => String(value ?? '').trim().toLowerCase();
      const visibleRows = this.rows.filter((row) => Object.entries(this.filters).every(([key, filter]) => {
        if (key === 'sessions' || key === 'hours') {
          return (!filter.min || row[key] >= Number(filter.min)) && (!filter.max || row[key] <= Number(filter.max));
        }
        const value = key === 'services' ? [...row.services].join(', ') : row[key];
        return normalized(value).includes(normalized(filter.text));
      }));
      document.querySelectorAll('.department-detail-table th[data-detail-column]').forEach((header) => {
        const active = Object.values(this.filters[header.dataset.detailColumn] || {}).some((value) => String(value).trim() !== '');
        header.querySelector('button').setAttribute('aria-pressed', String(active));
      });
      AVEVA.$('departmentDetailBody').innerHTML = visibleRows.map((row) => `<tr>
      <td>${escapeHtml(row.costCentre)}</td>
      <td><strong>${escapeHtml(row.user)}</strong></td>
      <td>${escapeHtml(row.company)}</td>
      <td>${escapeHtml([...row.services].sort().join(', ') || 'N/A')}</td>
      <td>${row.sessions.toLocaleString()}</td>
      <td>${AVEVA.fmt(row.hours, 1)} h</td>
    </tr>`).join('');
      if (!visibleRows.length) AVEVA.$('departmentDetailBody').innerHTML = '<tr><td colspan="6">No Department Detail rows match the current column filters.</td></tr>';
    }
  }
  const tableView = new DepartmentDetailTableView();

  AVEVA.renderDepartmentDetail = (rows, department) => {
    const body = AVEVA.$('departmentDetailBody');
    if (!body) return;

    const heading = AVEVA.$('departmentDetailHeading');
    const title = AVEVA.$('departmentDetailTitle');
    const subtitle = AVEVA.$('departmentDetailSubtitle');
    const summary = AVEVA.$('departmentDetailSummary');
    const latestTarget = AVEVA.$('departmentDetailLatestData');
    const backButton = document.querySelector('[data-department-back]');
    if (backButton) backButton.onclick = () => { window.location.hash = 'usage-department'; };

    const selected = department
      ? (rows || []).filter((row) => row.department === department)
      : [];

    if (!department || !selected.length) {
      tableView.setRows([], department);
      if (heading) heading.textContent = department ? `${department} — Department Detail` : 'Department Detail';
      if (title) title.textContent = department || 'Department Detail';
      if (subtitle) subtitle.textContent = department
        ? 'No usage data matches the current report filters.'
        : 'Select a department from the Usage by Department chart.';
      if (summary) summary.innerHTML = '';
      body.innerHTML = '<tr><td colspan="6">No department usage data for the selected filters.</td></tr>';
      if (latestTarget) latestTarget.textContent = 'Latest data: N/A';
      return;
    }

    const grouped = new Map();
    selected.forEach((row) => {
      const costCentre = AVEVA.text(row.costCentre) || 'Unknown Cost Centre';
      const user = AVEVA.text(row.name) || 'Unknown User';
      const company = AVEVA.text(row.company) || 'Unknown';
      const key = JSON.stringify([costCentre, user, company]);
      const current = grouped.get(key) || {
        costCentre,
        user,
        company,
        services: new Set(),
        sessions: 0,
        hours: 0
      };
      if (row.service) current.services.add(AVEVA.text(row.service));
      current.sessions += 1;
      current.hours += AVEVA.num(row.hours);
      grouped.set(key, current);
    });

    const tableRows = [...grouped.values()].sort((a, b) =>
      a.costCentre.localeCompare(b.costCentre) ||
      b.hours - a.hours ||
      a.user.localeCompare(b.user)
    );
    const totalHours = selected.reduce((sum, row) => sum + AVEVA.num(row.hours), 0);
    const totalSessions = selected.length;
    const costCentres = new Set(selected.map((row) => AVEVA.text(row.costCentre) || 'Unknown Cost Centre')).size;
    const users = new Set(selected.map((row) => AVEVA.text(row.name) || 'Unknown User')).size;
    const latest = AVEVA.latestDate(selected.map((row) => row.start instanceof Date ? row.start : new Date(row.start)));

    if (heading) heading.textContent = `${department} — Department Detail`;
    if (title) title.textContent = department;
    if (subtitle) subtitle.textContent = 'Cost Centre and user usage for the same filters applied to the department chart.';
    if (latestTarget) latestTarget.textContent = AVEVA.latestDataLabel(latest);
    if (summary) {
      summary.innerHTML = [
        ['Usage Hours', AVEVA.fmt(totalHours, 1)],
        ['Users', users.toLocaleString()],
        ['Cost Centres', costCentres.toLocaleString()],
        ['Sessions', totalSessions.toLocaleString()]
      ].map(([label, value]) => `<article><span>${label}</span><strong>${value}</strong></article>`).join('');
    }

    tableView.setRows(tableRows, department);
  };

})();
