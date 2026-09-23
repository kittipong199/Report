/* Filter service facade. Date precedence and identity matching stay byte-for-byte in filters.js. */
(() => {
  'use strict';
  const OOP = (window.AVEVA_OOP = window.AVEVA_OOP || {});

  OOP.FilterManager = class FilterManager {
    constructor(legacy = window.AVEVA) { this.legacy = legacy; }
    fill() { return this.legacy.fillFilters(); }
    get values() { return this.legacy.getFilters(); }
    validateDateRange() { return this.legacy.validateDateRange(); }
    usageRows() { return this.legacy.filteredUsage(); }
    transactions(options) { return this.legacy.getFilteredTransactions(options); }
    dateScope() { return this.legacy.dateScope(); }
    inScope(date, scope) { return this.legacy.inScope(date, scope); }
    reset() {
      document.querySelectorAll('.filters select, .filters input').forEach((element) => { element.value = ''; });
      this.legacy.$('fYear').value = String(this.legacy.defaultYear());
      this.legacy.syncYearMonthFilter?.();
    }
  };
})();
