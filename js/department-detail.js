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

    body.innerHTML = tableRows.map((row) => `<tr>
      <td>${escapeHtml(row.costCentre)}</td>
      <td><strong>${escapeHtml(row.user)}</strong></td>
      <td>${escapeHtml(row.company)}</td>
      <td>${escapeHtml([...row.services].sort().join(', ') || 'N/A')}</td>
      <td>${row.sessions.toLocaleString()}</td>
      <td>${AVEVA.fmt(row.hours, 1)} h</td>
    </tr>`).join('');
  };

  const originalDrawCategoryColumns = AVEVA.drawCategoryColumns;
  AVEVA.drawCategoryColumns = (id, data, suffix = '', onSelect = null) => {
    if (id !== 'userChart' || typeof onSelect !== 'function') {
      return originalDrawCategoryColumns(id, data, suffix, onSelect);
    }
    return originalDrawCategoryColumns(id, data, suffix, (department, value) => {
      AVEVA.selectedDepartment = department;
      AVEVA.renderDepartmentDetail(AVEVA.chartUsageRows('users'), department);
      if (window.location.hash !== '#department-detail') window.location.hash = 'department-detail';
      return value;
    });
  };

  const originalDrawCharts = AVEVA.drawCharts;
  AVEVA.drawCharts = (usageRows, governance) => {
    const result = originalDrawCharts(usageRows, governance);
    if (window.location.hash === '#department-detail') {
      AVEVA.renderDepartmentDetail(AVEVA.chartUsageRows('users'), AVEVA.selectedDepartment || '');
    }
    return result;
  };
})();
