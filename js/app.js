(() => {
  'use strict';

  /* ==========================================================
     APP CORE
     คงรูปแบบ DOM binding ของโค้ดเดิม: $('elementId')
  ========================================================== */

  const AVEVA = (window.AVEVA = window.AVEVA || {});

  AVEVA.BUILD_ID = 'V17-DYNAMIC-LEDGER-20260828-08';
  AVEVA.ACTIVE_AGREEMENT = 'OPP-518671-EU-JPC-6955';

  AVEVA.data = AVEVA.data || {
    usage: [],
    tx: [],
    employees: [],
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

  AVEVA.norm = (value) => {
    return AVEVA.text(value)
      .normalize('NFKC')
      .replace(/\s+/g, '')
      .toLowerCase();
  };

  AVEVA.buildDashboard = () => {
    AVEVA.data.viewUsage = AVEVA.enrichUsageData();
    AVEVA.fillFilters();
    AVEVA.renderDashboard();
  };

  /* ==========================================================
     RENDER DASHBOARD
     ย้าย Logic จาก render() เดิมมาโดยตรง
  ========================================================== */

  AVEVA.renderDashboard = () => {
    const $ = AVEVA.$;
    const fmt = AVEVA.fmt;
    const dateFmt = AVEVA.dateFmt;
    const governance = AVEVA.calcGov();
    const filteredUsage = AVEVA.filteredUsage();

    // Cards 3-6 are LOCKED: do not change their source values or formulas.
    $('totalTokens').textContent = fmt(governance.total);
    $('balance').textContent = fmt(governance.balance);
    $('currentTokens').textContent = fmt(governance.cv);
    $('previousTokens').textContent = fmt(governance.pv);
    $('currentPeriod').textContent = `Current month ${governance.cur}`;
    $('previousPeriod').textContent = `Previous month ${governance.prev}`;

    /* ========================================================
       CARD 7 - PERCENTAGE SUMMARY FROM CARDS 3-6 ONLY

       Card 3 = governance.total   (จำนวน Token ที่ใช้)
       Card 4 = governance.balance (จำนวน Token ที่เหลือ)
       Card 5 = governance.cv      (ใช้ Token สะสมเดือนนี้)
       Card 6 = governance.pv      (ใช้ Token เดือนที่แล้ว)

       A) Used % = Card3 / (Card3 + Card4) * 100
       B) Month change % = (Card5 - Card6) / Card6 * 100

       Important: this block only reads Cards 3-6 values.
       It does not modify their calculations or displayed values.
    ======================================================== */
    const usedToken = governance.total;
    const remainingToken = governance.balance;
    const currentMonthToken = governance.cv;
    const previousMonthToken = governance.pv;

    const tokenBase =
      Number.isFinite(usedToken) && Number.isFinite(remainingToken)
        ? usedToken + remainingToken
        : null;

    const usedPercent =
      tokenBase !== null && tokenBase > 0
        ? (usedToken / tokenBase) * 100
        : null;

    const monthChangePercent =
      Number.isFinite(currentMonthToken) &&
      Number.isFinite(previousMonthToken) &&
      previousMonthToken !== 0
        ? ((currentMonthToken - previousMonthToken) / previousMonthToken) * 100
        : null;

    const usedPercentText =
      usedPercent === null ? 'N/A' : `${usedPercent.toFixed(1)}%`;
    const monthChangeText =
      monthChangePercent === null
        ? 'N/A'
        : `${monthChangePercent >= 0 ? '+' : ''}${monthChangePercent.toFixed(1)}%`;

    $('mom').textContent = `ใช้แล้ว ${usedPercentText} | เดือนนี้ ${monthChangeText}`;

    $('days').textContent =
      governance.days == null ? 'N/A' : fmt(governance.days, 0);
    $('burnNote').textContent =
      `Balance / ${fmt(governance.burn)} token/day`;
    $('risk').textContent = governance.risk;
    $('riskNote').textContent =
      governance.days == null
        ? 'Balance or 30-Day Burn Rate unavailable'
        : `${fmt(governance.days, 0)} days | ${dateFmt(governance.forecast)}`;
    $('riskCard').className =
      `widget ${
        governance.risk === 'N/A'
          ? ''
          : `risk-${governance.risk.toLowerCase()}`
      }`;
    $('topService').textContent = governance.top[0];
    $('topServiceTokens').textContent = fmt(governance.top[1]);
    $('forecast').textContent = dateFmt(governance.forecast);
    $('highCost').textContent = governance.high;

    AVEVA.drawCharts(filteredUsage, governance);
    AVEVA.renderUsageTable(filteredUsage);

    const scope = [
      $('fYear').value || 'All years',
      $('fMonth').value ? `Month ${$('fMonth').value}` : 'All months'
    ].join(' / ');

    $('sourceLine').textContent =
      `Source: 5 Excel files | ` +
      `Agreement ${AVEVA.ACTIVE_AGREEMENT} | ` +
      `Usage ${AVEVA.data.usage.length.toLocaleString()} | ` +
      `Transactions ${AVEVA.data.tx.length.toLocaleString()} ` +
      `(${governance.filteredCount.toLocaleString()} in filter) | ` +
      `Employees ${AVEVA.data.employees.length.toLocaleString()} | ` +
      `Scope ${scope}`;
  };

  console.info('[AVEVA] Build', AVEVA.BUILD_ID);
})();
