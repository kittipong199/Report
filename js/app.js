/* CONNECTS: Shared state receives loader.js data and coordinates filters, cards, charts, and tables. */
(() => {
  'use strict';

  /* ==========================================================
     APP CORE
     คงรูปแบบ DOM binding ของโค้ดเดิม: $('elementId')
  ========================================================== */

  const AVEVA = (window.AVEVA = window.AVEVA || {});

  AVEVA.BUILD_ID = 'V17-MGMT-REVIEW-20260921-100';
  AVEVA.ACTIVE_AGREEMENT = 'OPP-518671-EU-JPC-6955';

  AVEVA.data = AVEVA.data || {
    usage: [],
    tx: [],
    employees: [],
    engineerHours: [],
    planHours: [],
    burndown: [],
    viewUsage: []
  };

  // รูปแบบเดียวกับโค้ดเก่า: $('status'), $('totalTokens')
  AVEVA.$ = (id) => document.getElementById(id);

  AVEVA.text = (value) => String(value ?? '').trim();

  AVEVA.num = (value) => {
    const number = Number(String(value ?? '').replace(/,/g, ''));
    return Number.isFinite(number) ? number : 0;
  };

  AVEVA.nullableNum = (value) => {
    if (value === null || value === undefined || AVEVA.text(value) === '') {
      return null;
    }

    const number = Number(String(value).replace(/,/g, ''));
    return Number.isFinite(number) ? number : null;
  };

  AVEVA.fmt = (number, digits = 1) => {
    if (number === null || number === undefined || !Number.isFinite(number)) {
      return 'N/A';
    }

    return Number(number).toLocaleString(undefined, {
      maximumFractionDigits: digits
    });
  };

  AVEVA.dateFmt = (date) => {
    return date && !Number.isNaN(date.getTime())
      ? date
          .toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
          })
          .replace(/ /g, '-')
      : 'N/A';
  };



  AVEVA.latestDate = (dates) => {
    const valid = (dates || []).filter((date) => date instanceof Date && !Number.isNaN(date.getTime()));
    return valid.length ? new Date(Math.max(...valid.map((date) => date.getTime()))) : null;
  };

  AVEVA.latestDataLabel = (date) => date
    ? `Latest data: ${date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`
    : 'Latest data: N/A';

  AVEVA.setLoading = (visible, message = 'Loading Excel data…') => {
    const overlay = AVEVA.$('loadingOverlay');
    const text = AVEVA.$('loadingMessage');
    if (text) text.textContent = message;
    if (overlay) {
      overlay.hidden = !visible;
      overlay.setAttribute('aria-hidden', String(!visible));
    }
    document.body.classList.toggle('is-loading', Boolean(visible));
  };

  AVEVA.norm = (value) => {
    return AVEVA.text(value)
      .normalize('NFKC')
      .replace(/\s+/g, '')
      .toLowerCase();
  };

  AVEVA.buildDashboard = () => {
    AVEVA.data.viewUsage = AVEVA.enrichUsageData();
    AVEVA.fillFilters();
    AVEVA.fillChartFilters?.();
    AVEVA.fillTableFilters?.();
    AVEVA.renderDashboard();
  };

  /* ==========================================================
     RENDER DASHBOARD
     ย้าย Logic จาก render() เดิมมาโดยตรง
  ========================================================== */

  AVEVA.renderDashboard = () => {
    const $ = AVEVA.$;
    const governance = AVEVA.calcGov();
    const filteredUsage = AVEVA.filteredUsage();
    AVEVA.drawCharts(filteredUsage, governance);
    AVEVA.renderCreditsOverview?.(governance);
    AVEVA.renderUsageTable(filteredUsage);

    const scope = [
      $('fYear').value || AVEVA.t('allYears'),
      $('fMonth').value ? `${AVEVA.t('month')} ${$('fMonth').value}` : AVEVA.t('allMonths')
    ].join(' / ');

    $('sourceLine').textContent =
      `Source: ${AVEVA.data.burndown.length ? '6 Excel files' : '5 Excel files (Burndown optional)'} | ` +
      `Agreement ${AVEVA.ACTIVE_AGREEMENT} | ` +
      `Usage ${AVEVA.data.usage.length.toLocaleString()} | ` +
      `Transactions ${AVEVA.data.tx.length.toLocaleString()} ` +
      `(${governance.filteredCount.toLocaleString()} in filter) | ` +
      `AVEVA Users ${AVEVA.data.employees.length.toLocaleString()} | ` +
      `Scope ${scope}`;
  };

  console.info('[AVEVA] Build', AVEVA.BUILD_ID);
})();
