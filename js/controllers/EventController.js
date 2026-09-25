/* Owns all dashboard DOM events and asynchronous load feedback. */
(() => {
  'use strict';
  const OOP = (window.AVEVA_OOP = window.AVEVA_OOP || {});
  OOP.EventController = class EventController {
    constructor({ loader, state, loadingView, dashboard, table, charts, config, documentRef = document, windowRef = window }) {
      Object.assign(this, { loader, state, loadingView, dashboard, table, charts, config, document: documentRef, window: windowRef });
      this.resizeFrame = null;
    }
    byId(id) { return this.document.getElementById(id); }
    setCreditSeries(visible) {
      this.document.querySelectorAll('[data-credit-series]').forEach((checkbox) => {
        checkbox.checked = visible;
        this.charts.setCreditSeriesVisibility(checkbox.dataset.creditSeries, visible);
      });
      this.dashboard.render();
    }
    bindCreditSeries() {
      this.document.querySelectorAll('[data-credit-series]').forEach((checkbox) => {
        checkbox.onchange = () => {
          this.charts.setCreditSeriesVisibility(checkbox.dataset.creditSeries, checkbox.checked);
          this.dashboard.render();
        };
      });
      const selectAll = this.byId('selectAllCreditSeries');
      const removeAll = this.byId('removeAllCreditSeries');
      if (selectAll) selectAll.onclick = () => this.setCreditSeries(true);
      if (removeAll) removeAll.onclick = () => this.setCreditSeries(false);
    }
    bindLoading() {
      const button = this.byId('loadBtn');
      const input = this.byId('files');
      if (button && input) button.onclick = () => { input.value = ''; input.click(); };
      if (input) input.onchange = async (event) => {
        this.loadingView.show('Loading selected Excel files…');
        try { await this.loader.loadFiles([...event.target.files]); }
        catch (error) {
          console.error('[AVEVA] LOAD FAILED', error);
          const status = this.byId('status');
          if (status) status.textContent = `ERROR ${this.config.buildId}: ${error.message}`;
        } finally { this.loadingView.hide(); }
      };
    }
    bindResize() {
      this.window.addEventListener('resize', () => {
        if (!this.state.data.usage.length) return;
        this.window.cancelAnimationFrame(this.resizeFrame);
        this.resizeFrame = this.window.requestAnimationFrame(() => this.dashboard.render());
      });
    }
    bind() { this.bindCreditSeries(); this.bindLoading(); this.charts.bindDepartmentFilters(); this.charts.bindTokenComparisonFilters(); this.table.bindControls(); this.bindResize(); }
    async start() {
      this.bind();
      this.charts.fillDepartmentFilters();
      this.state.setLoading(true); this.loadingView.show('Loading AVEVA report data…');
      try { await this.loader.autoLoad(); }
      catch (error) {
        this.state.setError(error);
        console.warn('[AVEVA] Automatic data load unavailable', error);
        const status = this.byId('status');
        if (status) status.textContent = `${this.config.buildId} | Automatic load unavailable. Use Reload Data to select the five source files.`;
      } finally { this.state.setLoading(false); this.loadingView.hide(); }
    }
  };
})();
