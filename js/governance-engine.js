/* CONNECTS: Consumes mapper.js credit rows and returns token/risk KPIs to app.js and charts.js. */
(() => {
  'use strict';

  /* ==========================================================
     GOVERNANCE ENGINE

     หน้าที่:
     - คำนวณ Governance KPI จาก Credit Transaction จริง
     - คำนวณ Column1.Token ตาม Year / Month ที่เลือก
     - ไม่ใช้ค่าล็อกหรือ Baseline แทนข้อมูลจาก Excel
     - คืนผลให้ app.js นำไปแสดงบน Card และ Chart
  ========================================================== */

  const AVEVA = window.AVEVA;
  const GOVERNANCE_BUILD = 'V17-MGMT-FILTERS-20260921-100';
  const TOKEN_PER_TRANSACTION = 13;

  console.info('[AVEVA] Governance Engine', GOVERNANCE_BUILD);

  AVEVA.calcGov = () => {
    const scope = AVEVA.dateScope();

    // Balance/forecast use the complete agreement ledger. Usage KPIs use the same
    // Company / Department / User filters as the rest of the dashboard.
    const ledgerAll = AVEVA.data.tx.filter(
      (row) => row.agreementId === AVEVA.ACTIVE_AGREEMENT
    );
    const all = AVEVA.filterTransactionsByOrganization
      ? AVEVA.filterTransactionsByOrganization(ledgerAll, AVEVA.getFilters())
      : ledgerAll;
    const burndownAll = [...(AVEVA.data.burndown || [])].sort(
      (a, b) => a.date - b.date || b.sourceOrder - a.sourceOrder
    );

    // Transaction ภายใน Year / Month ที่ผู้ใช้เลือก
    const sourceTx = all.filter((row) => AVEVA.inScope(row.date, scope));

    // Token Usage ใช้เฉพาะค่าติดลบ แล้วแปลงเป็นค่าบวกด้วย Math.abs()
    const consumption = sourceTx.filter((row) => row.token < 0);

    // ยอด Token Usage ของช่วงที่เลือกจากค่าจริงใน Column1.Token
    const periodTokenUsed = consumption.reduce(
      (sum, row) => sum + Math.abs(row.token),
      0
    );

    // จำนวน Row ที่ Column1.Token มีค่าในช่วงที่เลือก
    const periodTokenRowCount = sourceTx.filter(
      (row) => row.token !== null && Number.isFinite(row.token)
    ).length;

    // ผลรวม Column1.Token แบบสุทธิ รวมทั้งค่าบวกและค่าลบ
    const periodTokenNet = sourceTx.reduce(
      (sum, row) => sum + row.token,
      0
    );

    const dates = [...ledgerAll.map((row) => row.date), ...burndownAll.map((row) => row.date)]
      .filter((date) => date instanceof Date && !Number.isNaN(date.getTime()));

    if (!dates.length) {
      return {
        total: null,
        balance: null,
        cur: 'N/A',
        prev: 'N/A',
        cv: null,
        pv: null,
        mom: null,
        burn: null,
        days: null,
        forecast: null,
        contractEndDate: null,
        actualBalanceSeries: [],
        forecastSource: 'Unavailable',
        risk: 'N/A',
        top: ['N/A', 0],
        high: 0,
        monthly: new Map(),
        monthlyTrend: new Map(),
        serviceConsumption: new Map(),
        filteredCount: 0,
        periodTokenUsed: 0,
        periodTokenRowCount: 0,
        periodTokenNet: 0
      };
    }

    // ถ้าไม่เลือกปี ใช้ Transaction ล่าสุดใน Dataset
    // ถ้าเลือกปีหรือเดือน ใช้วันสุดท้ายของช่วง Filter
    const cutoff =
      scope.mode === 'ALL'
        ? new Date(Math.max(...dates.map((date) => date.getTime())))
        : scope.end;

    const ledgerToCutoff = ledgerAll.filter((row) => row.date <= cutoff);

    // หา Balance Snapshot ล่าสุดก่อนหรือเท่ากับ Cutoff
    const snapshotCandidates = ledgerToCutoff.filter(
      (row) => row.balanceUniversal !== null
    );

    const latestTime = snapshotCandidates.length
      ? Math.max(...snapshotCandidates.map((row) => row.date.getTime()))
      : null;

    const sameTime =
      latestTime === null
        ? []
        : snapshotCandidates
            .filter((row) => row.date.getTime() === latestTime)
            .sort((a, b) => a.sourceOrder - b.sourceOrder);

    /*
     * AVEVA Export เป็น newest-first เมื่อหลาย Row แสดง Timestamp เดียวกัน
     * จึงใช้ Row แรกตาม sourceOrder เช่นเดียวกับ Logic เดิม
     */
    const transactionSnapshot = sameTime[0] || null;
    const burndownToCutoff = burndownAll.filter((row) => row.date <= cutoff);
    const burndownSnapshot = burndownToCutoff[burndownToCutoff.length - 1] || null;

    // Burndown is the authoritative exported balance snapshot. Credit
    // Transactions remain the fallback and supply consumption after export.
    const snapshotDate = burndownSnapshot?.date || transactionSnapshot?.date || null;
    const transactionsAfterSnapshot = snapshotDate
      ? ledgerAll.filter((row) => row.date > snapshotDate && row.date <= cutoff)
      : [];

    const balance = burndownSnapshot
      ? burndownSnapshot.balance + transactionsAfterSnapshot.reduce((sum, row) => sum + row.token, 0)
      : transactionSnapshot?.balanceUniversal ?? null;

    const creditsIssued = ledgerToCutoff
      .filter((row) => row.token > 0)
      .reduce((sum, row) => sum + row.token, 0);

    /*
     * การ์ด #totalTokens
     * Business Rule:
     * - YEAR filter: COUNT(Column1.Token ของปีนั้น) x 13
     * - YEAR + MONTH filter: COUNT(Column1.Token ของปีและเดือนนั้น) x 13
     * - ALL: COUNT(Column1.Token ทั้งหมด) x 13
     */
    const total = periodTokenRowCount * TOKEN_PER_TRANSACTION;

    // Debug reconciliation ของสูตร COUNT x 13
    const reconciliation = total - periodTokenRowCount * TOKEN_PER_TRANSACTION;

    // สร้างยอด Token Usage รายเดือนจากข้อมูลจริงทั้งหมด
    const allMonthly = new Map();

    all.filter((row) => row.token < 0).forEach((row) => {
      const period = `${row.date.getFullYear()}-${String(
        row.date.getMonth() + 1
      ).padStart(2, '0')}`;

      allMonthly.set(
        period,
        (allMonthly.get(period) || 0) + Math.abs(row.token)
      );
    });

    // ระบุ Current Period สำหรับ Current Token Card
    let currentPeriod;

    if (AVEVA.$('fYear').value && AVEVA.$('fMonth').value) {
      currentPeriod = `${AVEVA.$('fYear').value}-${String(
        AVEVA.$('fMonth').value
      ).padStart(2, '0')}`;
    } else {
      const candidates = AVEVA.$('fYear').value
        ? all.filter(
            (row) =>
              row.date.getFullYear() === Number(AVEVA.$('fYear').value)
          )
        : all;

      if (candidates.length) {
        const latestCandidateDate = new Date(
          Math.max(...candidates.map((row) => row.date.getTime()))
        );

        currentPeriod = `${latestCandidateDate.getFullYear()}-${String(
          latestCandidateDate.getMonth() + 1
        ).padStart(2, '0')}`;
      } else {
        currentPeriod = 'N/A';
      }
    }

    const previousPeriod =
      currentPeriod === 'N/A'
        ? 'N/A'
        : AVEVA.previousPeriod(currentPeriod);

    // Current Month Token ใช้ผลรวม ABS(Column1.Token < 0) ของเดือนนั้นจริง
    const currentValue = allMonthly.has(currentPeriod)
      ? allMonthly.get(currentPeriod)
      : null;

    const previousValue = allMonthly.has(previousPeriod)
      ? allMonthly.get(previousPeriod)
      : null;

    const monthOverMonth =
      previousValue && currentValue !== null
        ? ((currentValue - previousValue) / previousValue) * 100
        : null;

    // Burn Rate 30 วันย้อนหลัง: use Burndown Export when present, otherwise
    // fall back to Credit Transactions. Positive credit additions are excluded.
    const latest = transactionsAfterSnapshot.length
      ? new Date(Math.max(...transactionsAfterSnapshot.map((row) => row.date.getTime())))
      : snapshotDate;
    const start = latest ? new Date(latest) : null;

    if (start) {
      start.setDate(start.getDate() - 29);
      start.setHours(0, 0, 0, 0);
    }

    const burnSource = burndownToCutoff.length
      ? [...burndownToCutoff, ...transactionsAfterSnapshot]
      : ledgerAll;
    const last30 = latest
      ? burnSource
          .filter(
            (row) =>
              row.token < 0 && row.date >= start && row.date <= latest
          )
          .reduce((sum, row) => sum + Math.abs(row.token), 0)
      : 0;

    const burnRate = last30 > 0 ? last30 / 30 : null;

    const daysRemaining =
      balance !== null && balance >= 0 && burnRate > 0
        ? balance / burnRate
        : null;

    const forecast =
      daysRemaining !== null && latest
        ? new Date(latest.getTime() + daysRemaining * 864e5)
        : null;

    const dailyBalances = new Map();
    burndownToCutoff.forEach((row) => {
      const key = `${row.date.getFullYear()}-${String(row.date.getMonth() + 1).padStart(2, '0')}-${String(row.date.getDate()).padStart(2, '0')}`;
      dailyBalances.set(key, { date: row.date, balance: row.balance });
    });
    const actualBalanceSeries = [...dailyBalances.values()].sort((a, b) => a.date - b.date);

    // Annual contract cycle: 01-Apr through 31-Mar of the following year.
    // Derive the active cycle from the latest balance snapshot so the risk
    // never assumes that the current token balance carries into later renewals.
    const contractEndYear = latest
      ? latest.getFullYear() + (latest.getMonth() >= 3 ? 1 : 0)
      : null;
    const contractEndDate = contractEndYear === null
      ? null
      : new Date(contractEndYear, 2, 31, 23, 59, 59, 999);
    const octoberStart = contractEndYear === null
      ? null
      : new Date(contractEndYear - 1, 9, 1, 0, 0, 0, 0);
    const nextContractStart = contractEndYear === null
      ? null
      : new Date(contractEndYear, 3, 1, 0, 0, 0, 0);
    const risk =
      balance === null
        ? 'N/A'
        : burnRate === null
          ? 'GREEN'
          : forecast < octoberStart
          ? 'RED'
          : forecast < nextContractStart
            ? 'YELLOW'
            : 'GREEN';

    // Top Product/Service ของช่วง Filter
    const serviceConsumption = new Map();

    consumption.forEach((row) => {
      serviceConsumption.set(
        row.product,
        (serviceConsumption.get(row.product) || 0) + Math.abs(row.token)
      );
    });

    // Trend charts intentionally ignore the Month filter so a selected month
    // does not collapse a trend into one bar. Year remains the trend scope.
    const selectedTrendYear = AVEVA.$('fYear').value;
    const monthlyTrend = new Map(
      [...allMonthly.entries()].filter(([period]) =>
        !selectedTrendYear || period.startsWith(`${selectedTrendYear}-`)
      )
    );

    const topService = [...serviceConsumption.entries()].sort(
      (a, b) => b[1] - a[1]
    )[0] || ['N/A', 0];

    // Token Trend เฉพาะช่วง Filter
    const monthly = new Map();

    consumption.forEach((row) => {
      const period = `${row.date.getFullYear()}-${String(
        row.date.getMonth() + 1
      ).padStart(2, '0')}`;

      monthly.set(
        period,
        (monthly.get(period) || 0) + Math.abs(row.token)
      );
    });

    console.log('[AVEVA] Monthly Column1.Token debug', {
      build: GOVERNANCE_BUILD,
      scope,
      currentPeriod,
      periodTokenRowCount,
      periodTokenNet,
      periodTokenUsed,
      currentMonthTokenCard: currentValue,
      previousPeriod,
      previousMonthTokenCard: previousValue,
      filteredTransactions: sourceTx.length
    });

    console.log('[AVEVA] Dynamic ledger debug', {
      build: GOVERNANCE_BUILD,
      scope,
      cutoff,
      creditsIssued,
      balance,
      tokenTransactionCount: periodTokenRowCount,
      tokenPerTransaction: TOKEN_PER_TRANSACTION,
      totalTokenUsed: total,
      periodTokenUsed,
      reconciliation,
      latestTime: latestTime === null ? null : new Date(latestTime),
      snapshotCandidatesAtLatestTime: sameTime.map((row) => ({
        source: row.source,
        sourceSheet: row.sourceSheet,
        sourceRow: row.sourceRow,
        sourceOrder: row.sourceOrder,
        token: row.token,
        balanceTotal: row.balanceTotal,
        balanceUniversal: row.balanceUniversal
      })),
      selectedSnapshot: burndownSnapshot || transactionSnapshot
        ? {
            source: (burndownSnapshot || transactionSnapshot).source,
            sourceSheet: transactionSnapshot?.sourceSheet,
            sourceRow: transactionSnapshot?.sourceRow,
            sourceOrder: (burndownSnapshot || transactionSnapshot).sourceOrder,
            token: (burndownSnapshot || transactionSnapshot).token,
            balanceUniversal: balance
          }
        : null
    });

    return {
      total,
      balance,
      cur: currentPeriod,
      prev: previousPeriod,
      cv: currentValue,
      pv: previousValue,
      mom: monthOverMonth,
      burn: burnRate,
      days: daysRemaining,
      forecast,
      contractEndDate,
      actualBalanceSeries,
      startingTokens: actualBalanceSeries.length
        ? Math.max(...actualBalanceSeries.map((row) => row.balance))
        : null,
      forecastSource: burndownToCutoff.length
        ? 'Burndown snapshot + Credit Transactions after snapshot'
        : 'Credit Transactions fallback',
      risk,
      top: topService,
      high: consumption.filter((row) => Math.abs(row.token) > 100).length,
      monthly,
      monthlyTrend,
      serviceConsumption,
      filteredCount: sourceTx.length,

      // ค่า Debug สำหรับตรวจ Column1.Token ของเดือนที่เลือก
      periodTokenUsed,
      periodTokenRowCount,
      periodTokenNet
    };
  };
})();

