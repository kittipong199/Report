/* Single application-state owner. */
(() => {
  'use strict';
  const OOP = (window.AVEVA_OOP = window.AVEVA_OOP || {});

  OOP.AppState = class AppState {
    constructor(initialData = {}) {
      this.data = {
        usage: [], tx: [], employees: [], engineerHours: [], planHours: [],
        burndown: [], viewUsage: [],
        ...initialData
      };
      this.filters = { company: '', department: '', user: '', year: '', month: '', startDate: '', endDate: '' };
      this.chartVisibility = { actual: true, forecast: true, ideal: true };
      this.selectedDepartment = '';
      this.loading = false;
      this.lastError = null;
      this.dataVersion = 0;
    }

    replaceData(key, rows) {
      this.data[key] = Array.isArray(rows) ? rows : [];
      this.dataVersion += 1;
      return this.data[key];
    }

    replaceAll(nextData) {
      Object.keys(this.data).forEach((key) => {
        this.data[key] = Array.isArray(nextData[key]) ? nextData[key] : [];
      });
      this.dataVersion += 1;
      return this.data;
    }

    setLoading(value) {
      this.loading = Boolean(value);
    }

    setError(error) {
      this.lastError = error || null;
    }
  };
})();
