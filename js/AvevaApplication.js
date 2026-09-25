/* Composition root: all OOP dependencies are created and injected here. */
(() => {
  'use strict';
  const OOP = (window.AVEVA_OOP = window.AVEVA_OOP || {});
  OOP.AvevaApplication = class AvevaApplication {
    constructor(legacy = window.AVEVA) {
      this.config = new OOP.AppConfig();
      this.state = new OOP.AppState(legacy.data);
      // One data object during migration: class owners and legacy renderers must
      // observe identical arrays until the remaining compatibility code is removed.
      legacy.data = this.state.data;
      this.utils = new OOP.Utils(legacy);
      this.exclusionPolicy = new OOP.DepartmentExclusionPolicy(this.config.excludedDepartments, this.utils);
      this.mapper = new OOP.DataMapper({ utils: this.utils, xlsx: window.XLSX });
      this.repository = new OOP.DataRepository(this.state, this.mapper, this.exclusionPolicy);
      this.loadingView = new OOP.LoadingView();
      this.filters = new OOP.FilterService({ repository: this.repository, config: this.config });
      this.governance = new OOP.GovernanceService({ repository: this.repository, filterService: this.filters, config: this.config });
      this.creditForecast = new OOP.CreditForecastService({ config: this.config, repository: this.repository, utils: this.utils });
      this.departmentDrilldown = new OOP.DepartmentDrilldownService(this.utils);
      this.charts = new OOP.ChartRenderer({ legacy, repository: this.repository, filterService: this.filters });
      this.credits = new OOP.CreditsOverviewView({ forecastService: this.creditForecast, filterService: this.filters, chartRenderer: this.charts, utils: this.utils });
      this.table = new OOP.UsageTableView({ repository: this.repository, config: this.config, utils: this.utils, filterService: this.filters });
      this.dashboard = new OOP.DashboardController({ legacy, repository: this.repository, filters: this.filters, governance: this.governance, charts: this.charts, credits: this.credits, table: this.table });
      this.navigation = new OOP.NavigationController({ dashboard: this.dashboard, state: this.state });
      this.loader = new OOP.ExcelLoader({
        repository: this.repository,
        mapper: this.mapper,
        loadingView: this.loadingView,
        config: this.config,
        utils: this.utils,
        onDataLoaded: () => this.dashboard.build()
      });
      this.events = new OOP.EventController({ loader: this.loader, state: this.state, loadingView: this.loadingView, dashboard: this.dashboard, table: this.table, charts: this.charts, config: this.config });

      // Compatibility API for unchanged renderers and legacy callers.
      legacy.buildDashboard = this.dashboard.build.bind(this.dashboard);
      legacy.renderDashboard = this.dashboard.render.bind(this.dashboard);
      legacy.loadFiles = this.loader.loadFiles.bind(this.loader);
      legacy.renderUsageTable = this.table.render.bind(this.table);
      legacy.renderCreditsOverview = this.credits.render.bind(this.credits);
      legacy.escapeHtml = this.utils.escapeHtml.bind(this.utils);
      // Canvas compatibility bridge: verified drawing primitives consume the
      // new services and never execute the retired procedural business layers.
      legacy.getFilters = () => this.filters.values;
      legacy.drawCharts = this.charts.render.bind(this.charts);
      legacy.filteredUsage = this.filters.usageRows.bind(this.filters);
      legacy.getFilteredTransactions = this.filters.transactions.bind(this.filters);
      legacy.filterTransactionsByOrganization = this.filters.filterTransactionsByOrganization.bind(this.filters);
      legacy.dateScope = this.filters.dateScope.bind(this.filters);
      legacy.inScope = this.filters.inScope.bind(this.filters);
      legacy.previousPeriod = this.filters.previousPeriod.bind(this.filters);
      legacy.calcGov = this.governance.calculate.bind(this.governance);
      legacy.application = this;
    }

    async start() { this.navigation.bind(); return this.events.start(); }
  };
})();
