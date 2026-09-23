/* Immutable application configuration. Values mirror the verified legacy build. */
(() => {
  'use strict';
  const OOP = (window.AVEVA_OOP = window.AVEVA_OOP || {});

  OOP.AppConfig = class AppConfig {
    constructor(overrides = {}) {
      this.buildId = overrides.buildId || 'V17-OOP-20260921-101';
      this.activeAgreement = overrides.activeAgreement || 'OPP-518671-EU-JPC-6955';
      this.tokenPerTransaction = overrides.tokenPerTransaction ?? 13;
      this.filePatterns = Object.freeze(overrides.filePatterns || {
        credit2025: /data master source credit transactions\s+2025/i,
        credit2026: /data master source credit transactions\s+2026/i,
        usage2025: /data master source user usage 2025/i,
        usage2026: /data master source user usage 2026/i,
        mapping: /(?:aveva|aviva|roi)\s*mapping/i,
        burndown: /burndown\s*forecast/i
      });
      this.requiredFileKeys = Object.freeze(['credit2025', 'credit2026', 'usage2025', 'usage2026', 'mapping']);
      this.sourcePaths = Object.freeze(overrides.sourcePaths || {
        credit2025: ['Data/Data Master Source credit transactions  2025.xlsx'],
        credit2026: ['Data/Data Master Source credit transactions  2026.xlsx'],
        usage2025: ['Data/Data Master Source user usage 2025.xlsx'],
        usage2026: ['Data/Data Master Source user usage 2026.xlsx'],
        mapping: ['Data/AvevaMapping (2).xlsx', 'Data/AvevaMapping (1).xlsx', 'Data/AvevaMapping.xlsx'],
        burndown: ['Data/Burndown Forecast from 8_15_2026 to 9_15_2026 (Time period in UTC is August 15, 2026 9_03 AM to September 15, 2026 9_03 AM).xlsx']
      });
      this.credit = Object.freeze({
        initialCredits: 900001,
        contractStartDate: '2025-04-01',
        criticalDate: '2026-09-30',
        contractEndDate: '2028-03-31',
        ...(overrides.credit || {})
      });
      this.excludedDepartments = Object.freeze([...(overrides.excludedDepartments || ['ICT'])]);
      Object.freeze(this);
    }
  };
})();
