/* Normalized data owner with indexes rebuilt only when state data changes. */
(() => {
  'use strict';
  const OOP = (window.AVEVA_OOP = window.AVEVA_OOP || {});

  OOP.DataRepository = class DataRepository {
    constructor(state, mapper, exclusionPolicy = null) {
      this.state = state;
      this.mapper = mapper;
      this.exclusionPolicy = exclusionPolicy;
      this.indexVersion = -1;
      this.indexes = {};
    }
    get usage() { return this.state.data.usage; }
    get transactions() { return this.state.data.tx; }
    get employees() { return this.state.data.employees; }
    get engineerHours() { return this.state.data.engineerHours; }
    get planHours() { return this.state.data.planHours; }
    get burndown() { return this.state.data.burndown; }
    get viewUsage() { return this.state.data.viewUsage; }
    replaceData(data) {
      const accepted = this.exclusionPolicy ? this.exclusionPolicy.apply(data) : data;
      this.state.replaceAll(accepted);
      this.refreshEnrichedUsage();
      this.rebuildIndexes(true);
      return this.state.data;
    }
    refreshEnrichedUsage() {
      const rows = this.mapper.enrichUsage(this.usage, this.employees);
      this.state.replaceData('viewUsage', rows);
      return rows;
    }
    rebuildIndexes(force = false) {
      if (!force && this.indexVersion === this.state.dataVersion) return this.indexes;
      const employeeByEmail = new Map();
      const employeeByUsername = new Map();
      const employeeByIdentity = new Map();
      this.employees.forEach((employee) => {
        if (employee.email) employeeByEmail.set(employee.email, employee);
        if (employee.username) employeeByUsername.set(employee.username, employee);
        [employee.email, employee.emailAD, employee.username].filter(Boolean)
          .forEach((identity) => employeeByIdentity.set(String(identity).toLowerCase(), employee));
      });
      const transactionsByUser = new Map();
      this.transactions.forEach((row) => {
        const key = String(row.user || '').toLowerCase();
        const rows = transactionsByUser.get(key) || [];
        rows.push(row);
        transactionsByUser.set(key, rows);
      });
      this.indexes = { employeeByEmail, employeeByUsername, employeeByIdentity, transactionsByUser };
      this.indexVersion = this.state.dataVersion;
      return this.indexes;
    }
    get employeeByEmail() { return this.rebuildIndexes().employeeByEmail; }
    get employeeByUsername() { return this.rebuildIndexes().employeeByUsername; }
    get employeeByIdentity() { return this.rebuildIndexes().employeeByIdentity; }
    get transactionsByUser() { return this.rebuildIndexes().transactionsByUser; }
    findEmployee(identity) {
      return this.employeeByIdentity.get(String(identity || '').trim().toLowerCase()) || null;
    }
  };
})();
