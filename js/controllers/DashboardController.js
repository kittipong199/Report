/* Coordinates services and views. No business formula is implemented in this controller. */
(() => {
  'use strict';
  const OOP = (window.AVEVA_OOP = window.AVEVA_OOP || {});
  OOP.DashboardController = class DashboardController {
    constructor({ legacy = window.AVEVA, repository, filters, governance, charts, credits, table }) {
      Object.assign(this, { legacy, repository, filters, governance, charts, credits, table });
    }

    build() {
      this.repository.refreshEnrichedUsage();
      this.charts.refreshDepartmentFilters();
      return this.render();
    }

    render() {
      const governanceResult = this.governance.calculate();
      const usageRows = this.filters.usageRows();
      this.charts.render(usageRows, governanceResult);
      this.credits.render(governanceResult);
      this.table.render();
      this.updateSourceLine(governanceResult);
      return governanceResult;
    }

    updateSourceLine(governanceResult) {
      const $ = this.legacy.$;
      const filters = this.filters.values;
      const scope = [filters.year || this.legacy.t('allYears'), filters.month ? `${this.legacy.t('month')} ${filters.month}` : this.legacy.t('allMonths')].join(' / ');
      $('sourceLine').textContent =
        `Source: ${this.repository.burndown.length ? '6 Excel files' : '5 Excel files (Burndown optional)'} | ` +
        `Agreement ${this.legacy.ACTIVE_AGREEMENT} | Usage ${this.repository.usage.length.toLocaleString()} | ` +
        `Transactions ${this.repository.transactions.length.toLocaleString()} (${governanceResult.filteredCount.toLocaleString()} in filter) | ` +
        `AVEVA Users ${this.repository.employees.length.toLocaleString()} | Scope ${scope}`;
    }
  };
})();
