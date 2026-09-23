/* Central policy for report-wide department exclusions. */
(() => {
  'use strict';
  const OOP = (window.AVEVA_OOP = window.AVEVA_OOP || {});
  OOP.DepartmentExclusionPolicy = class DepartmentExclusionPolicy {
    constructor(excludedDepartments = ['ICT'], utils) {
      this.utils = utils;
      this.excluded = new Set(excludedDepartments.map((value) => this.normalize(value)));
    }
    normalize(value) {
      return this.utils ? this.utils.normalize(value) : String(value || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();
    }
    isExcluded(department) { return this.excluded.has(this.normalize(department)); }
    apply(data) {
      const ictEmployees = data.employees.filter((employee) => this.isExcluded(employee.department));
      const identities = new Set();
      const names = new Set();
      ictEmployees.forEach((employee) => {
        [employee.email, employee.emailAD, employee.username]
          .map((value) => String(value || '').trim().toLowerCase()).filter(Boolean)
          .forEach((identity) => identities.add(identity));
        if (employee.name) names.add(this.normalize(employee.name));
      });
      return {
        ...data,
        usage: data.usage.filter((row) => !identities.has(String(row.email || '').trim().toLowerCase())),
        tx: data.tx.filter((row) => !identities.has(String(row.user || '').trim().toLowerCase())),
        employees: data.employees.filter((employee) => !this.isExcluded(employee.department)),
        planHours: data.planHours.filter((row) => !this.isExcluded(row.department)),
        engineerHours: data.engineerHours.filter((row) => !names.has(this.normalize(row.alphaName)))
      };
    }
  };
})();
