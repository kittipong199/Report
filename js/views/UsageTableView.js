/* User Usage Summary presentation and table-local filter owner. */
(() => {
  'use strict';
  const OOP = (window.AVEVA_OOP = window.AVEVA_OOP || {});
  OOP.UsageTableView = class UsageTableView {
    constructor({ repository, config, utils, filterService, documentRef = document }) {
      Object.assign(this, { repository, config, utils, filterService, document: documentRef });
      this.userSummaryFilters = { startDate: '', endDate: '' };
      this.appliedDateFilters = { ...this.userSummaryFilters };
      this.sortState = { key: null, direction: null };
      this.columnFilters = {};
      this.columns = [
        ['name', 'User', 'text'], ['department', 'Department', 'text'],
        ['company', 'Company', 'text'], ['serviceCount', 'Service Count', 'number'],
        ['services', 'Services Used', 'text'], ['period', 'Selected Period', 'text'],
        ['hours', 'Total Hours', 'number'], ['tokens', 'Tokens Consumed', 'number'],
        ['sessions', 'Sessions', 'number'], ['hoursPerSession', 'Hours / Session', 'number']
      ].map(([key, label, type]) => ({ key, label, type }));
    }
    syncDateInputs() {
      const message = this.filterService.validateDateRange(this.userSummaryFilters);
      for (const [id, key] of [['userSummaryStartDate', 'startDate'], ['userSummaryEndDate', 'endDate']]) {
        const input = this.document.getElementById(id);
        input.value = this.userSummaryFilters[key];
        input.setAttribute('aria-invalid', String(Boolean(message)));
      }
      const error = this.document.getElementById('userSummaryDateError');
      error.textContent = message; error.hidden = !message;
      return !message;
    }
    bindControls() {
      const panel = this.document.querySelector('[data-report-view="user-summary"]');
      if (!panel || this.controlsBound) return;
      this.controlsBound = true;
      for (const [id, key] of [['userSummaryStartDate', 'startDate'], ['userSummaryEndDate', 'endDate']]) {
        this.document.getElementById(id).addEventListener('change', (event) => {
          this.userSummaryFilters[key] = event.target.value;
          if (!this.syncDateInputs()) return;
          this.appliedDateFilters = { ...this.userSummaryFilters };
          this.render();
        });
      }
      const funnel = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M2 3h12L9.5 8v4l-3 1V8z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>';
      this.columns.forEach(({ key, label, type }) => {
        const header = panel.querySelector(`[data-sort-key="${key}"]`);
        const id = `user-summary-filter-${key}`;
        const inputs = type === 'number'
          ? `<label>Minimum<input type="number" step="any" data-bound="min" aria-label="${label} minimum" placeholder="No minimum"></label><label>Maximum<input type="number" step="any" data-bound="max" aria-label="${label} maximum" placeholder="No maximum"></label>`
          : `<label>Contains<input type="search" aria-label="${label} contains" placeholder="Type to filter…"></label>`;
        header.innerHTML = `<div class="user-summary-column-heading"><button type="button" class="user-summary-sort-button">${label}<span class="user-summary-sort-indicator" aria-hidden="true">↕</span></button><button type="button" class="user-summary-column-filter" popovertarget="${id}" aria-label="Filter ${label}" aria-expanded="false" aria-controls="${id}">${funnel}</button></div><div id="${id}" class="user-summary-filter-popover" popover="auto" role="group" aria-label="Filter ${label}"><strong>${label}</strong>${inputs}<div class="user-summary-popover-actions"><button type="button" data-clear-column>Clear</button><button type="button" data-close-filter>Done</button></div></div>`;
        header.querySelector('.user-summary-sort-button').addEventListener('click', () => {
          const next = this.sortState.key !== key || !this.sortState.direction ? 'ascending'
            : this.sortState.direction === 'ascending' ? 'descending' : null;
          this.sortState = { key: next ? key : null, direction: next };
          this.renderFromControls();
        });
        const button = header.querySelector('.user-summary-column-filter');
        const popover = header.querySelector('.user-summary-filter-popover');
        popover.addEventListener('beforetoggle', (event) => {
          button.setAttribute('aria-expanded', String(event.newState === 'open'));
          if (event.newState !== 'open') return;
          const bounds = button.getBoundingClientRect();
          this.filterAnchor = { button, left: bounds.left, top: bounds.top };
          const win = this.document.defaultView;
          popover.style.left = `${Math.max(8, Math.min(bounds.left, win.innerWidth - 232))}px`;
          popover.style.top = `${Math.max(8, Math.min(bounds.bottom + 6, win.innerHeight - (type === 'number' ? 230 : 170)))}px`;
        });
        popover.addEventListener('toggle', (event) => {
          if (event.newState === 'open') popover.querySelector('input').focus({ preventScroll: true });
        });
        popover.querySelectorAll('input').forEach((input) => {
          input.addEventListener('input', () => {
            if (type === 'number') this.columnFilters[key] = { ...this.columnFilters[key], [input.dataset.bound]: input.value };
            else this.columnFilters[key] = input.value;
            this.renderFromControls();
          });
        });
        popover.querySelector('[data-clear-column]').addEventListener('click', () => {
          delete this.columnFilters[key];
          popover.querySelectorAll('input').forEach((input) => { input.value = ''; });
          this.renderFromControls();
        });
        popover.querySelector('[data-close-filter]').addEventListener('click', () => { popover.hidePopover(); button.focus(); });
      });
      panel.querySelector('.user-summary-clear-filters').addEventListener('click', () => {
        this.columnFilters = {};
        this.sortState = { key: null, direction: null };
        panel.querySelectorAll('.user-summary-filter-popover input').forEach((input) => { input.value = ''; });
        this.renderFromControls();
      });
      const closePopovers = () => panel.querySelectorAll('.user-summary-filter-popover:popover-open').forEach((popover) => popover.hidePopover());
      panel.querySelector('.user-summary-table-scroll').addEventListener('scroll', () => {
        if (!this.filterAnchor) return;
        const bounds = this.filterAnchor.button.getBoundingClientRect();
        // Ignore a queued scroll from bringing the trigger into view before it opened.
        if (Math.abs(bounds.left - this.filterAnchor.left) > 1 || Math.abs(bounds.top - this.filterAnchor.top) > 1) closePopovers();
      });
      this.document.defaultView.addEventListener('resize', closePopovers);
      this.syncDateInputs();
      this.updateHeaderState();
    }
    renderFromControls() {
      const valid = this.syncDateInputs();
      this.updateHeaderState();
      if (valid) this.render();
    }
    updateHeaderState() {
      this.columns.forEach(({ key, label, type }) => {
        const header = this.document.querySelector(`[data-report-view="user-summary"] [data-sort-key="${key}"]`);
        if (!header) return;
        const direction = this.sortState.key === key ? this.sortState.direction : null;
        header.setAttribute('aria-sort', direction || 'none');
        const indicator = header.querySelector('.user-summary-sort-indicator');
        if (indicator) indicator.textContent = direction === 'ascending' ? '▲' : direction === 'descending' ? '▼' : '↕';
        const sort = header.querySelector('.user-summary-sort-button');
        const next = direction === 'ascending' ? 'descending' : direction === 'descending' ? 'default order' : 'ascending';
        if (sort) sort.setAttribute('aria-label', `${label}: ${direction || 'default order'}. Sort ${next}`);
        const filter = this.columnFilters[key];
        const active = type === 'number' ? Boolean(filter?.min || filter?.max) : Boolean(filter?.trim());
        const button = header.querySelector('.user-summary-column-filter');
        if (button) {
          button.classList.toggle('is-active', active);
          button.setAttribute('aria-label', `Filter ${label}${active ? ' (active)' : ''}`);
        }
      });
    }
    columnValues(row) {
      const services = [...row.services].filter(Boolean).sort((a, b) => String(a).localeCompare(String(b), 'en', { sensitivity: 'base' }));
      const periods = [...row.periods].sort();
      return {
        name: row.name, department: row.department, company: row.company,
        serviceCount: services.length, services: services.join(', '),
        period: periods.length > 1 ? `${periods[0]} to ${periods[periods.length - 1]}` : periods[0] || 'N/A',
        hours: row.hours, tokens: row.tokens, sessions: row.sessions,
        hoursPerSession: row.sessions ? row.hours / row.sessions : 0
      };
    }
    applyColumnControls(rows) {
      const entries = rows.map((row) => ({ row, values: this.columnValues(row) })).filter(({ values }) =>
        this.columns.every(({ key, type }) => {
          const filter = this.columnFilters[key];
          if (type === 'text') return !filter?.trim() || String(values[key] ?? '').toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase());
          return ['min', 'max'].every((bound) => {
            const raw = filter?.[bound];
            if (raw === undefined || raw === '' || !Number.isFinite(Number(raw))) return true;
            return bound === 'min' ? values[key] >= Number(raw) : values[key] <= Number(raw);
          });
        })
      );
      const defaultOrder = (a, b) => (Number(b.tokens) || 0) - (Number(a.tokens) || 0) ||
        (Number(b.hours) || 0) - (Number(a.hours) || 0) ||
        String(a.name).localeCompare(String(b.name), 'en', { sensitivity: 'base' });
      const column = this.columns.find(({ key }) => key === this.sortState.key);
      entries.sort((a, b) => {
        if (!column || !this.sortState.direction) return defaultOrder(a.row, b.row);
        const left = a.values[column.key], right = b.values[column.key];
        const comparison = column.type === 'number' ? left - right
          : String(left ?? '').localeCompare(String(right ?? ''), 'en', { sensitivity: 'base' });
        return (this.sortState.direction === 'descending' ? -comparison : comparison) || defaultOrder(a.row, b.row);
      });
      const result = entries.slice(0, 500).map(({ row }) => row);
      const status = this.document.querySelector('.user-summary-results');
      if (status) status.textContent = `${result.length} of ${rows.length} users${entries.length > 500 ? ` · showing first 500 of ${entries.length} matches` : ''}`;
      return result;
    }
    get filters() { return { ...this.filterService.pageDefaults(), ...this.appliedDateFilters }; }
    serviceTokenKey(value) {
      const text = String(value || '').normalize('NFKC').toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
      if (/unified\s+engineering|spectrum/.test(text)) return 'unified-engineering';
      if (/\be3d\b|everything\s*3d/.test(text)) return 'everything-3d';
      if (/\bengineering\b/.test(text)) return 'engineering';
      return `raw:${this.utils.normalize(text)}`;
    }
    render() {
      this.syncDateInputs();
      this.updateHeaderState();
      const filters = this.filters;
      const rows = this.filterService.filterUsage(this.repository.viewUsage, filters);
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
      this.filterService.filterTransactions(this.repository.transactions, filters).filter((row) => row.token < 0).forEach((row) => {
        const employee = this.repository.findEmployee(row.user);
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
      const summaries = this.applyColumnControls([...grouped.values()]);
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
