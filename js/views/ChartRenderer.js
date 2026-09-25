/* Canvas presentation boundary. Verified canvas primitives remain a temporary backend. */
(() => {
  'use strict';
  const OOP = (window.AVEVA_OOP = window.AVEVA_OOP || {});
  OOP.ChartRenderer = class ChartRenderer {
    constructor({ legacy, repository, filterService, documentRef = document }) {
      Object.assign(this, { legacy, repository, filterService, document: documentRef });
      this.departmentFilters = { startDate: '', endDate: '', company: '', department: '' };
      this.appliedDepartmentFilters = { ...this.departmentFilters };
      this.departmentSelection = null;
      this.tokenComparisonFilters = { startDate: '', endDate: '' };
      this.appliedTokenComparisonFilters = { ...this.tokenComparisonFilters };
    }
    bindTokenComparisonFilters() {
      const controls = { startDate: 'tokenComparisonStartDate', endDate: 'tokenComparisonEndDate' };
      Object.entries(controls).forEach(([key, id]) => {
        this.document.getElementById(id).addEventListener('change', (event) => {
          this.tokenComparisonFilters[key] = event.target.value;
          this.applyTokenComparisonFilters();
        });
      });
      this.document.getElementById('tokenComparisonReset').addEventListener('click', () => {
        Object.entries(controls).forEach(([key, id]) => {
          this.tokenComparisonFilters[key] = '';
          this.document.getElementById(id).value = '';
        });
        this.applyTokenComparisonFilters();
      });
    }
    applyTokenComparisonFilters() {
      const message = this.filterService.validateDateRange(this.tokenComparisonFilters);
      const error = this.document.getElementById('tokenComparisonDateError');
      error.textContent = message;
      error.hidden = !message;
      ['tokenComparisonStartDate', 'tokenComparisonEndDate'].forEach((id) => {
        this.document.getElementById(id).setAttribute('aria-invalid', String(Boolean(message)));
      });
      if (message) return false;
      this.appliedTokenComparisonFilters = { ...this.tokenComparisonFilters };
      this.renderTokenComparison();
      return true;
    }
    renderTokenComparison() {
      const filters = { ...this.filterService.pageDefaults(), ...this.appliedTokenComparisonFilters };
      const txRows = this.filterService.filterTransactions(this.repository.transactions, filters);
      const usageRows = this.filterService.filterUsage(this.repository.viewUsage, filters);
      this.legacy.drawTokenMonthComparison('overviewTokenChart', { filters, txRows, usageRows });
    }
    get departmentScope() {
      const { year, month } = this.filterService.pageDefaults();
      return { year, month, ...this.appliedDepartmentFilters };
    }
    bindDepartmentFilters() {
      this.document.querySelectorAll('[data-department-filter]').forEach((input) => {
        input.addEventListener('change', () => {
          this.departmentFilters[input.dataset.departmentFilter] = input.value;
          if (input.dataset.departmentFilter === 'company') this.fillDepartmentFilters();
          this.applyDepartmentFilters();
        });
      });
      this.document.getElementById('departmentFilterReset').addEventListener('click', () => {
        Object.keys(this.departmentFilters).forEach((key) => { this.departmentFilters[key] = ''; });
        this.fillDepartmentFilters();
        this.applyDepartmentFilters();
      });
    }
    fillDepartmentFilters() {
      const rows = this.repository.viewUsage;
      const setOptions = (id, key, values, label) => {
        const select = this.document.getElementById(id);
        select.replaceChildren(new Option(label, ''), ...values.map((value) => new Option(value, value)));
        if (!values.includes(this.departmentFilters[key])) this.departmentFilters[key] = '';
        select.value = this.departmentFilters[key];
      };
      setOptions('departmentCompany', 'company', this.filterService.getCompanies(rows), 'All Companies');
      setOptions('departmentDepartment', 'department', this.filterService.getDepartments(rows, this.departmentFilters.company), 'All Departments');
      this.document.getElementById('departmentStartDate').value = this.departmentFilters.startDate;
      this.document.getElementById('departmentEndDate').value = this.departmentFilters.endDate;
    }
    applyDepartmentFilters() {
      const message = this.filterService.validateDateRange(this.departmentFilters);
      const error = this.document.getElementById('departmentDateFilterError');
      error.textContent = message; error.hidden = !message;
      ['departmentStartDate', 'departmentEndDate'].forEach((id) => this.document.getElementById(id).setAttribute('aria-invalid', String(Boolean(message))));
      if (message) return false;
      this.appliedDepartmentFilters = { ...this.departmentFilters };
      this.departmentSelection = null;
      this.renderDepartment();
      return true;
    }
    refreshDepartmentFilters() {
      this.fillDepartmentFilters();
      // Drop drilldown snapshots when a new source dataset is loaded.
      this.departmentSelection = null;
      if (!this.filterService.validateDateRange(this.departmentFilters)) this.appliedDepartmentFilters = { ...this.departmentFilters };
    }
    renderDepartment() {
      const rows = this.filterService.filterUsage(this.repository.viewUsage, this.departmentScope);
      const data = this.legacy.groupUsage(rows, 'department');
      const canvas = this.document.getElementById('userChart');
      canvas.onclick = null;
      if (!data.length) canvas.setAttribute('aria-label', 'No data for the selected filters');
      this.legacy.drawCategoryColumns('userChart', data, ' h', (department) => {
        // Keep the exact rows used by this chart, including the date/organisation scope.
        this.departmentSelection = { department, rows };
        this.legacy.renderDepartmentDetail(rows, department);
        this.document.defaultView.location.hash = 'department-detail';
      });
      const latest = this.legacy.latestDate(rows.map((row) => row.start instanceof Date ? row.start : new Date(row.start)));
      this.document.getElementById('departmentLatestData').textContent = this.legacy.latestDataLabel(latest);
      if (this.document.defaultView.location.hash === '#department-detail') {
        this.legacy.renderDepartmentDetail(this.departmentSelection?.rows || [], this.departmentSelection?.department || '');
      }
    }
    setCreditSeriesVisibility(series, visible) { this.legacy.creditSeriesVisibility[series] = visible; }
    render(usageRows, governance) {
      this.renderDepartment();
      this.legacy.drawServiceMix('serviceChart', [...governance.serviceConsumption.entries()]);
      const serviceRows = this.filterService.transactions().filter((row) => row.token < 0);
      const latest = this.legacy.latestDate(serviceRows.map((row) => row.date));
      this.document.getElementById('serviceLatestData').textContent = this.legacy.latestDataLabel(latest);
      this.renderTokenComparison();
    }
    renderCreditsBurndown(daily, forecast, ideal, status) {
      return this.legacy.drawCreditsBurndown(daily, forecast, ideal, status);
    }
  };
})();
