/* Shared filter operations. Page views own state and DOM; this service reads neither. */
(() => {
  'use strict';
  const OOP = (window.AVEVA_OOP = window.AVEVA_OOP || {});
  OOP.FilterService = class FilterService {
    constructor({ repository, config }) { Object.assign(this, { repository, config }); }
    defaultYear() { return new Date().getFullYear(); }
    pageDefaults() {
      return { company: '', department: '', user: '', year: String(this.defaultYear()), month: '', startDate: '', endDate: '' };
    }
    // Unfiltered report scope is independent of both page-local filter objects.
    get values() { return this.pageDefaults(); }
    validateDateRange({ startDate, endDate }) {
      if (Boolean(startDate) !== Boolean(endDate)) return 'Select both Start Date and End Date.';
      if (startDate && endDate && startDate > endDate) return 'Start Date must be on or before End Date.';
      return '';
    }
    buildDateScope(filters) {
      if (this.validateDateRange(filters)) return { mode: 'INVALID', start: null, end: null };
      const { startDate, endDate } = filters;
      if (startDate && endDate) return { mode: 'RANGE', start: new Date(`${startDate}T00:00:00`), end: new Date(`${endDate}T23:59:59.999`) };
      const year = Number(filters.year), month = Number(filters.month);
      if (!year) return { mode: 'ALL', start: null, end: null };
      if (!month) return { mode: 'YEAR', start: new Date(year, 0, 1), end: new Date(year, 11, 31, 23, 59, 59, 999) };
      return { mode: 'MONTH', start: new Date(year, month - 1, 1), end: new Date(year, month, 0, 23, 59, 59, 999) };
    }
    inScope(date, scope) {
      return scope.mode === 'ALL' || (scope.mode !== 'INVALID' && date instanceof Date && date >= scope.start && date <= scope.end);
    }
    filterUsage(rows, filters) {
      if (this.validateDateRange(filters)) return [];
      const scope = this.buildDateScope(filters);
      return rows.filter((row) => {
        const date = row.start instanceof Date ? row.start : new Date(row.start);
        return (!filters.company || row.company === filters.company) &&
          (!filters.department || row.department === filters.department) &&
          (!filters.user || row.name === filters.user) &&
          (scope.mode === 'RANGE' ? this.inScope(date, scope) :
            (!filters.year || String(row.year) === String(filters.year)) &&
            (!filters.month || String(row.month) === String(filters.month)));
      });
    }
    filterTransactionsByOrganization(rows, filters = this.values) {
      if (!(filters.company || filters.department || filters.user)) return rows.slice();
      return rows.filter((row) => {
        const employee = this.repository.findEmployee(row.user);
        return employee && (!filters.company || employee.company === filters.company) &&
          (!filters.department || employee.department === filters.department) &&
          (!filters.user || employee.name === filters.user);
      });
    }
    filterTransactions(rows, filters, { applyDate = true, agreementOnly = true } = {}) {
      let result = agreementOnly ? rows.filter((row) => row.agreementId === this.config.activeAgreement) : rows.slice();
      result = this.filterTransactionsByOrganization(result, filters);
      if (!applyDate) return result;
      const scope = this.buildDateScope(filters);
      return result.filter((row) => row.date instanceof Date && !Number.isNaN(row.date.getTime()) && this.inScope(row.date, scope));
    }
    getCompanies(rows) { return [...new Set(rows.map((row) => row.company))].filter(Boolean).sort(); }
    getDepartments(rows, company) {
      return [...new Set(rows.filter((row) => !company || row.company === company).map((row) => row.department))].filter(Boolean).sort();
    }
    getUsers(rows, company, department) {
      return [...new Set(rows.filter((row) => (!company || row.company === company) &&
        (!department || row.department === department)).map((row) => row.name))].filter(Boolean).sort();
    }
    // Read-only compatibility APIs for unchanged governance/forecast calculations.
    dateScope(filters = this.values) { return this.buildDateScope(filters); }
    usageRows(filters = this.values) { return this.filterUsage(this.repository.viewUsage, filters); }
    transactions({ rows = this.repository.transactions, ...options } = {}) {
      return this.filterTransactions(rows, this.values, options);
    }
    previousPeriod(period) {
      const [year, month] = period.split('-').map(Number), date = new Date(year, month - 2, 1);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }
  };
})();
