/* CONNECTS: Supplies English labels to data-i18n elements in index.html. */
(() => {
  'use strict';

  const AVEVA = window.AVEVA;
  const messages = {
    sourceWaiting: 'Source: Waiting for 5 core Excel files + optional Burndown Forecast', selectFiles: 'Select the folder or 5 core files and optional Burndown Forecast', loadFiles: 'Load / Refresh Excel',
    department: 'Department', company: 'Company', year: 'Year', month: 'Month', reset: 'Reset',
    allDepartment: 'All Department', allCompany: 'All Companies', allYear: 'All Years', allMonth: 'All Months',
    tokensUsed: 'Tokens Used', tokensUsedNote: 'All negative token transactions', tokensRemaining: 'Tokens Remaining', tokensRemainingNote: 'Credit additions - token consumption',
    currentTokens: 'Tokens Used This Month', previousTokens: 'Tokens Used Last Month', usageRatio: 'Token Usage Ratio', usageRatioNote: 'Used % | Current month vs previous month',
    forecast: 'Estimated Token Depletion', forecastNote: 'Latest transaction date + days remaining', currentMonth: 'Current month', previousMonth: 'Previous month', used: 'Used', thisMonth: 'This month',
    allYears: 'All years', allMonths: 'All months', loading: 'Reading 5 source files...', loaded: 'Loaded successfully',
    topUsersChart: 'Top Usage by Department', topServicesChart: 'Top Services by Usage Hours', monthlyUsageChart: 'Monthly Usage Trend', monthlyTokenChart: 'Monthly Token Consumption'
  };

  AVEVA.language = 'en';
  AVEVA.t = (key) => messages[key] || key;
  document.documentElement.lang = 'en';
  document.querySelectorAll('[data-i18n]').forEach((element) => {
    element.textContent = AVEVA.t(element.dataset.i18n);
  });
  const currentPeriod = AVEVA.$('currentPeriod');
  const previousPeriod = AVEVA.$('previousPeriod');
  if (currentPeriod) currentPeriod.textContent = AVEVA.t('currentMonth');
  if (previousPeriod) previousPeriod.textContent = AVEVA.t('previousMonth');
})();
