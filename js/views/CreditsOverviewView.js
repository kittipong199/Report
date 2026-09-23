/* Credits overview DOM presentation. Forecast calculations stay in CreditForecastService. */
(() => {
  'use strict';
  const OOP = (window.AVEVA_OOP = window.AVEVA_OOP || {});
  OOP.CreditsOverviewView = class CreditsOverviewView {
    constructor({ forecastService, filterService, chartRenderer, utils, documentRef = document }) {
      Object.assign(this, { forecastService, filterService, chartRenderer, utils, document: documentRef });
    }
    dateLabel(date) { return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
    daysBetween(start, end) {
      if (!(start instanceof Date) || !(end instanceof Date) || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
      const startDay = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
      const endDay = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
      return Math.max(0, Math.ceil((endDay - startDay) / 864e5));
    }
    periodLabel(scope, filters) {
      if (scope.mode === 'RANGE') return `${this.dateLabel(scope.start)} – ${this.dateLabel(scope.end)}`;
      if (scope.mode === 'MONTH') {
        const period = `${filters.year}-${String(filters.month).padStart(2, '0')}`;
        return new Date(`${period}-01T12:00:00`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
      }
      return scope.mode === 'YEAR' ? filters.year : 'All available dates';
    }
    renderActiveFilters(scope, filters) {
      const target = this.document.getElementById('creditsActiveFilters');
      if (!target) return;
      const escape = (value) => this.utils.escapeHtml(value);
      const chips = ['<strong>Active Filters</strong>',
        `<span class="credits-filter-chip"><b>Period</b> ${escape(this.periodLabel(scope, filters))}</span>`,
        `<span class="credits-filter-chip"><b>Company</b> ${escape(filters.company || 'All Companies')}</span>`,
        `<span class="credits-filter-chip"><b>Department</b> ${escape(filters.department || 'All Departments')}</span>`];
      if (filters.user) chips.push(`<span class="credits-filter-chip"><b>User</b> ${escape(filters.user)}</span>`);
      if (scope.mode === 'RANGE') chips.push('<span class="credits-filter-chip credits-filter-priority"><b>Applied Filter</b> Date Range overrides Year and Month</span>');
      target.innerHTML = chips.join('');
    }
    setText(id, value) { const element = this.document.getElementById(id); if (element) element.textContent = value; }
    render(governance) {
      const page = this.document.querySelector('[data-credits-overview]');
      if (!page || page.hidden) return null;
      const filters = this.filterService.values;
      const scope = this.filterService.dateScope();
      const calculation = this.forecastService.calculate(scope);
      const { rows, daily, latest, burnRate, forecast, ideal, status } = calculation;
      const balance = latest ? this.utils.format(latest.balance, 0) : 'N/A';
      this.setText('creditsUniversal', balance);
      this.setText('creditsTotal', balance);
      this.setText('creditsLatestDate', latest ? `Latest balance: ${this.dateLabel(latest.date)}` : 'Waiting for Burndown Forecast data');
      this.setText('creditsStatus', status.status);
      const statusCard = this.document.getElementById('creditsStatusCard');
      if (statusCard) statusCard.className = `credits-inline-status credits-status-card ${status.status === 'N/A' ? 'status-unavailable' : `risk-${status.status.toLowerCase()}`}`;
      this.setText('creditsDepletion', status.depletion ? this.dateLabel(status.depletion) : 'N/A');
      const daysRemaining = latest && status.depletion ? this.daysBetween(latest.date, status.depletion) : null;
      this.setText('creditsDaysRemaining', daysRemaining === null ? 'Forecast unavailable' : `About ${this.utils.format(daysRemaining, 0)} days remaining from latest balance`);
      this.setText('creditsContractEnd', this.dateLabel(status.contractEnd));
      this.setText('kpiCreditBalance', balance);
      this.setText('kpiCurrentTokens', governance.cv === null ? 'N/A' : this.utils.format(governance.cv, 0));
      this.setText('kpiTotalTokens', governance.total === null ? 'N/A' : this.utils.format(governance.total, 0));
      this.setText('kpiCurrentPeriod', governance.cur === 'N/A' ? 'No matching month' : `Month ${governance.cur}`);
      this.setText('overviewLatestData', latest ? `Latest data: ${this.dateLabel(latest.date)}` : 'Latest data: N/A');
      this.renderActiveFilters(scope, filters);
      this.chartRenderer.renderCreditsBurndown(daily, forecast, ideal, status);
      page.dataset.currentBalance = latest ? String(latest.balance) : '';
      page.dataset.firstDate = rows[0]?.date?.toISOString() || '';
      page.dataset.lastDate = latest?.date?.toISOString() || '';
      page.dataset.averageDailyBurn = burnRate === null ? '' : String(burnRate);
      page.dataset.estimatedDepletion = status.depletion?.toISOString() || '';
      page.dataset.forecastAtContractEnd = forecast.length ? String(forecast[forecast.length - 1].balance) : '';
      return calculation;
    }
  };
})();
