/* Pure Department -> Cost Centre -> User aggregation used by the existing view. */
(() => {
  'use strict';
  const OOP = (window.AVEVA_OOP = window.AVEVA_OOP || {});
  OOP.DepartmentDrilldownService = class DepartmentDrilldownService {
    constructor(utils) { this.utils = utils; }
    aggregate(rows, department) {
      const selected = (rows || []).filter((row) => row.department === department);
      const costCentres = new Map();
      selected.forEach((row) => {
        const costCentre = this.utils.text(row.costCentre) || 'Unknown Cost Centre';
        const users = costCentres.get(costCentre) || new Map();
        const user = this.utils.text(row.name) || 'Unknown User';
        users.set(user, (users.get(user) || 0) + this.utils.number(row.hours));
        costCentres.set(costCentre, users);
      });
      return {
        department,
        rows: selected,
        costCentres,
        totalHours: selected.reduce((sum, row) => sum + this.utils.number(row.hours), 0)
      };
    }
  };
})();
