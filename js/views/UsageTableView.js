/* User Usage Summary presentation and table-local filter owner. */
(() => {
  'use strict';
  const OOP = (window.AVEVA_OOP = window.AVEVA_OOP || {});
  OOP.UsageTableView = class UsageTableView {
    constructor({ repository, config, utils, filterService, documentRef = document }) { Object.assign(this, { repository, config, utils, filterService, document: documentRef }); }
    serviceTokenKey(value) {
      const text = String(value || '').normalize('NFKC').toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
      if (/unified\s+engineering|spectrum/.test(text)) return 'unified-engineering';
      if (/\be3d\b|everything\s*3d/.test(text)) return 'everything-3d';
      if (/\bengineering\b/.test(text)) return 'engineering';
      return `raw:${this.utils.normalize(text)}`;
    }
    get filters() {
      const value = (key) => this.document.querySelector(`[data-table-filter="${key}"]`)?.value || '';
      const globalFilters = this.filterService.values;
      // The visible Report Filters define the page scope. Table-local filters are
      // retained as a fallback for compatibility if they are shown again later.
      return {
        name: globalFilters.user || value('name'),
        year: globalFilters.year || value('year'),
        month: globalFilters.month || value('month'),
        company: globalFilters.company || value('company'),
        department: globalFilters.department || value('department'),
        startDate: globalFilters.startDate,
        endDate: globalFilters.endDate
      };
    }
    fillFilters() {
      const rows = this.repository.viewUsage;
      const options = {
        name: [...new Set(rows.map((row) => row.name))].filter(Boolean).sort(),
        year: [...new Set(rows.map((row) => row.year))].filter(Number.isFinite).sort((a, b) => a - b),
        month: [...new Set(rows.map((row) => row.month))].filter(Number.isFinite).sort((a, b) => a - b),
        company: [...new Set(rows.map((row) => row.company))].filter(Boolean).sort(),
        department: [...new Set(rows.map((row) => row.department))].filter(Boolean).sort()
      };
      const labels = { name: 'All Users', year: 'All Years', month: 'All Months', company: 'All Companies', department: 'All Department' };
      Object.entries(options).forEach(([key, values]) => {
        const select = this.document.querySelector(`[data-table-filter="${key}"]`);
        if (!select) return;
        const selected = select.value;
        select.replaceChildren(new Option(labels[key], ''));
        values.forEach((value) => select.add(new Option(value, value)));
        if (selected && [...select.options].some((option) => option.value === selected)) select.value = selected;
        else if (key === 'year' && values.length) select.value = String(Math.max(...values.map(Number).filter(Number.isFinite)));
      });
    }
    render() {
      const filters = this.filters;
      const range = filters.startDate && filters.endDate;
      const start = range ? new Date(`${filters.startDate}T00:00:00`) : null;
      const end = range ? new Date(`${filters.endDate}T23:59:59.999`) : null;
      const rows = this.repository.viewUsage.filter((row) =>
        (!filters.name || row.name === filters.name) && (!filters.company || row.company === filters.company) &&
        (!filters.department || row.department === filters.department) && (range
          ? row.start instanceof Date && row.start >= start && row.start <= end
          : (!filters.year || String(row.year) === String(filters.year)) && (!filters.month || String(row.month) === String(filters.month))));
      const grouped = new Map();
      rows.forEach((row) => {
        const key = this.utils.normalize(row.name) || row.email;
        const summary = grouped.get(key) || { ...row, hours: 0, sessions: 0, services: new Set(), periods: new Set() };
        summary.hours += row.hours; summary.sessions += 1;
        if (row.service) summary.services.add(row.service);
        if (row.period) summary.periods.add(row.period);
        grouped.set(key, summary);
      });
      const tokenByUser = new Map();
      const tokenByUserService = new Map();
      this.repository.transactions.filter((row) => row.agreementId === this.config.activeAgreement && row.token < 0 && (range
        ? row.date instanceof Date && row.date >= start && row.date <= end
        : (!filters.year || String(row.date.getFullYear()) === String(filters.year)) &&
          (!filters.month || String(row.date.getMonth() + 1) === String(filters.month)))).forEach((row) => {
        const employee = this.repository.findEmployee(row.user);
        if ((filters.name && employee?.name !== filters.name) || (filters.company && employee?.company !== filters.company) ||
            (filters.department && employee?.department !== filters.department)) return;
        if ((filters.name || filters.company || filters.department) && !employee) return;
        const key = this.utils.normalize(employee?.name || row.user) || row.user;
        const token = Math.abs(row.token);
        tokenByUser.set(key, (tokenByUser.get(key) || 0) + token);
        const serviceKey = this.serviceTokenKey(row.product);
        const serviceTokens = tokenByUserService.get(key) || new Map();
        serviceTokens.set(serviceKey, (serviceTokens.get(serviceKey) || 0) + token);
        tokenByUserService.set(key, serviceTokens);
      });
      grouped.forEach((summary, key) => {
        summary.tokens = tokenByUser.get(key) || 0;
        summary.serviceTokens = tokenByUserService.get(key) || new Map();
      });
      const summaries = [...grouped.values()].sort((a, b) =>
        (Number(b.tokens) || 0) - (Number(a.tokens) || 0) ||
        (Number(b.hours) || 0) - (Number(a.hours) || 0) ||
        String(a.name).localeCompare(String(b.name), 'en', { sensitivity: 'base' })
      ).slice(0, 500);
      const body = this.document.getElementById('tbody');
      if (!body) return summaries;
      const escape = (value) => this.utils.escapeHtml(value);
      body.innerHTML = summaries.length ? summaries.map((row) => {
        const periods = [...row.periods].sort();
        const period = periods.length > 1 ? `${periods[0]} to ${periods[periods.length - 1]}` : periods[0] || 'N/A';
        const services = [...row.services].filter(Boolean).sort((a, b) => String(a).localeCompare(String(b), 'en', { sensitivity: 'base' }));
        const serviceList = services.length
          ? `<div class="user-service-list">${services.map((service) => {
              const tokens = row.serviceTokens?.get(this.serviceTokenKey(service)) || 0;
              return `<div class="user-service-line"><span class="user-service-name">${escape(service)}</span><span class="user-service-token">${this.utils.format(tokens, 0)} tokens</span></div>`;
            }).join('')}</div>`
          : '<span class="user-service-empty">N/A</span>';
        return `<tr><td>${escape(row.name)}</td><td>${escape(row.department)}</td><td>${escape(row.company)}</td>` +
          `<td class="user-service-count"><strong>${services.length}</strong></td><td>${serviceList}</td><td>${escape(period)}</td>` +
          `<td>${this.utils.format(row.hours)}</td><td>${this.utils.format(row.tokens, 0)}</td>` +
          `<td>${row.sessions}</td><td>${this.utils.format(row.sessions ? row.hours / row.sessions : 0)}</td></tr>`;
      }).join('') : '<tr><td colspan="10">No users found for the selected filters</td></tr>';
      return summaries;
    }
  };
})();
