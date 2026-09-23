/* CONNECTS: Applies table filters to usage data and renders User Usage Summary in index.html. */
(() => {
  'use strict';

  /* ==========================================================
     TABLE ENGINE

     หน้าที่:
     - รวม Usage เป็นหนึ่งแถวต่อ User ภายในช่วง Filter
     - เรียงตามชื่อ User
     - แสดงสูงสุด 500 รายการ

     HTML Target:
     #tbody

     Columns:
     Name, CDC (internal department), Company, Services,
     Selected Period, Total Hours, Tokens Consumed, Sessions, Hours per Session
  ========================================================== */

  const AVEVA = window.AVEVA;

  // Escape เพื่อป้องกันข้อความจาก Excel ถูกตีความเป็น HTML
  AVEVA.escapeHtml = (value) => {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  AVEVA.getTableFilters = () => {
    const filters = AVEVA.getFilters();
    return {
      name: filters.user,
      year: filters.year,
      month: filters.month,
      company: filters.company,
      department: filters.department,
      startDate: filters.startDate,
      endDate: filters.endDate
    };
  };

  AVEVA.fillTableFilters = () => {
    const rows = AVEVA.data.viewUsage;
    const options = {
      name: [...new Set(rows.map((row) => row.name))].filter(Boolean).sort(),
      year: [...new Set(rows.map((row) => row.year))].filter(Number.isFinite).sort((a, b) => a - b),
      month: [...new Set(rows.map((row) => row.month))].filter(Number.isFinite).sort((a, b) => a - b),
      company: [...new Set(rows.map((row) => row.company))].filter(Boolean).sort(),
      department: [...new Set(rows.map((row) => row.department))].filter(Boolean).sort()
    };
    Object.entries(options).forEach(([key, values]) => {
      const select = document.querySelector(`[data-table-filter="${key}"]`);
      if (!select) return;
      const selected = select.value;
      const labels = {
        name: 'All Users', year: 'All Years', month: 'All Months',
        company: 'All Companies', department: 'All Department'
      };
      const label = labels[key];
      select.innerHTML = `<option value="">${label}</option>`;
      values.forEach((value) => select.add(new Option(value, value)));
      if (selected && [...select.options].some((option) => option.value === selected)) {
        select.value = selected;
      } else if (key === 'year' && values.length) {
        select.value = String(Math.max(...values.map(Number).filter(Number.isFinite)));
      }
    });
  };

  AVEVA.renderUsageTable = (rows) => {
    const filters = AVEVA.getTableFilters();
    const range = filters.startDate && filters.endDate;
    const start = range ? new Date(`${filters.startDate}T00:00:00`) : null;
    const end = range ? new Date(`${filters.endDate}T23:59:59.999`) : null;
    rows = AVEVA.data.viewUsage.filter((row) =>
      (!filters.name || row.name === filters.name) &&
      (!filters.company || row.company === filters.company) &&
      (!filters.department || row.department === filters.department) &&
      (range
        ? row.start instanceof Date && row.start >= start && row.start <= end
        : (!filters.year || String(row.year) === String(filters.year)) &&
          (!filters.month || String(row.month) === String(filters.month)))
    );
    const grouped = new Map();

    rows.forEach((row) => {
      const key = AVEVA.norm(row.name) || row.email;
      const summary = grouped.get(key) || {
        ...row,
        hours: 0,
        sessions: 0,
        services: new Set(),
        periods: new Set()
      };

      summary.hours += row.hours;
      summary.sessions += 1;
      if (row.service) summary.services.add(row.service);
      if (row.period) summary.periods.add(row.period);
      grouped.set(key, summary);
    });

    // Join consumed tokens to the same user identity and date scope used by
    // this table. Existing usage-hour and session calculations stay unchanged.
    const employeeByIdentity = new Map();
    AVEVA.data.employees.forEach((employee) => {
      [employee.email, employee.emailAD, employee.username]
        .map((value) => AVEVA.text(value).toLowerCase())
        .filter(Boolean)
        .forEach((identity) => employeeByIdentity.set(identity, employee));
    });
    const tokenByUser = new Map();
    AVEVA.data.tx
      .filter((row) => {
        if (row.agreementId !== AVEVA.ACTIVE_AGREEMENT || !(row.token < 0)) return false;
        if (range) return row.date instanceof Date && row.date >= start && row.date <= end;
        return (!filters.year || String(row.date.getFullYear()) === String(filters.year)) &&
          (!filters.month || String(row.date.getMonth() + 1) === String(filters.month));
      })
      .forEach((row) => {
        const employee = employeeByIdentity.get(AVEVA.text(row.user).toLowerCase());
        if ((filters.name && employee?.name !== filters.name) ||
            (filters.company && employee?.company !== filters.company) ||
            (filters.department && employee?.department !== filters.department)) return;
        if ((filters.name || filters.company || filters.department) && !employee) return;
        const key = AVEVA.norm(employee?.name || row.user) || row.user;
        tokenByUser.set(key, (tokenByUser.get(key) || 0) + Math.abs(row.token));
      });

    grouped.forEach((summary, key) => {
      summary.tokens = tokenByUser.get(key) || 0;
    });

    const summaries = [...grouped.values()]
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'en', { sensitivity: 'base' }))
      .slice(0, 500);
    AVEVA.$('tbody').innerHTML = summaries.length
      ? summaries.map(
        (row) => `
          <tr>
            <td>${AVEVA.escapeHtml(row.name)}</td>
            <td>${AVEVA.escapeHtml(row.department)}</td>
            <td>${AVEVA.escapeHtml(row.company)}</td>
            <td>${AVEVA.escapeHtml([...row.services].sort().join(', '))}</td>
            <td>${AVEVA.escapeHtml((() => {
              const periods = [...row.periods].sort();
              return periods.length > 1
                ? `${periods[0]} to ${periods[periods.length - 1]}`
                : periods[0] || 'N/A';
            })())}</td>
            <td>${AVEVA.fmt(row.hours)}</td>
            <td>${AVEVA.fmt(row.tokens, 0)}</td>
            <td>${row.sessions}</td>
            <td>${AVEVA.fmt(row.sessions ? row.hours / row.sessions : 0)}</td>
          </tr>`
      )
      .join('')
      : '<tr><td colspan="9">No users found for the selected filters</td></tr>';
  };
})();
