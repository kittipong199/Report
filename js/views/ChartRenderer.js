/* Canvas presentation boundary. Verified canvas primitives remain a temporary backend. */
(() => {
  'use strict';
  const OOP = (window.AVEVA_OOP = window.AVEVA_OOP || {});
  OOP.ChartRenderer = class ChartRenderer {
    constructor(legacy = window.AVEVA) { this.legacy = legacy; }
    setCreditSeriesVisibility(series, visible) { this.legacy.creditSeriesVisibility[series] = visible; }
    fillFilters() { return this.legacy.fillChartFilters?.(); }
    render(usageRows, governance) { return this.legacy.drawCharts(usageRows, governance); }
    renderCreditsBurndown(daily, forecast, ideal, status) {
      return this.legacy.drawCreditsBurndown(daily, forecast, ideal, status);
    }
  };
})();
