/* CONNECTS: Builds the Credits Overview balance summary from the normalized Burndown Forecast dataset. */
(() => {
  'use strict';

  const AVEVA = window.AVEVA;
  const DAY_MS = 864e5;
  AVEVA.CREDIT_CONFIG = Object.freeze({
    initialCredits: 900001,
    contractEndDate: '2028-03-31',
    contractStartDate: '2025-04-01',
    criticalDate: '2026-09-30'
  });
  AVEVA.creditSeriesVisibility = AVEVA.creditSeriesVisibility || { actual: true, forecast: true, ideal: true };

  const validRows = () => (AVEVA.data.burndown || [])
    .filter((row) => row.date instanceof Date && !Number.isNaN(row.date.getTime()) && Number.isFinite(row.balance))
    .slice()
    .sort((a, b) => a.date - b.date || a.sourceOrder - b.sourceOrder);

  AVEVA.normalizeCreditRows = validRows;

  AVEVA.getLatestCreditBalance = (rows = validRows()) => {
    const latest = rows[rows.length - 1];
    return latest ? { date: latest.date, balance: latest.balance } : null;
  };

  AVEVA.calculateDailyBalance = (rows = validRows()) => {
    const daily = new Map();
    rows.forEach((row) => {
      const key = AVEVA.localDateKey(row.date);
      const current = daily.get(key);
      if (!current || row.date > current.date || (row.date.getTime() === current.date.getTime() && row.sourceOrder < current.sourceOrder)) {
        daily.set(key, { date: row.date, balance: row.balance, sourceOrder: row.sourceOrder });
      }
    });
    return [...daily.values()].sort((a, b) => a.date - b.date);
  };

  AVEVA.calculateAverageBurnRate = (daily = AVEVA.calculateDailyBalance()) => {
    if (daily.length < 2) return null;
    const first = daily[0];
    const last = daily[daily.length - 1];
    const elapsedDays = (last.date - first.date) / DAY_MS;
    if (!(elapsedDays > 0)) return null;
    return Math.max(0, (first.balance - last.balance) / elapsedDays);
  };

  const parseConfigDate = (value, endOfDay = false) => {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
  };

  AVEVA.calculateForecast = (daily = AVEVA.calculateDailyBalance(), burnRate = AVEVA.calculateAverageBurnRate(daily)) => {
    if (!daily.length || !(burnRate > 0)) return [];
    const latest = daily[daily.length - 1];
    const end = parseConfigDate(AVEVA.CREDIT_CONFIG.contractEndDate, true);
    const points = [{ date: latest.date, balance: latest.balance }];
    const cursor = new Date(latest.date.getFullYear(), latest.date.getMonth() + 1, 1);
    while (cursor < end) {
      points.push({ date: new Date(cursor), balance: latest.balance - burnRate * ((cursor - latest.date) / DAY_MS) });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    points.push({ date: end, balance: latest.balance - burnRate * ((end - latest.date) / DAY_MS) });
    return points;
  };

  AVEVA.calculateIdealBurndown = () => [
    { date: parseConfigDate(AVEVA.CREDIT_CONFIG.contractStartDate), balance: AVEVA.CREDIT_CONFIG.initialCredits },
    { date: parseConfigDate(AVEVA.CREDIT_CONFIG.contractEndDate, true), balance: 0 }
  ];

  AVEVA.calculateCreditStatus = (latest, burnRate) => {
    const contractEnd = parseConfigDate(AVEVA.CREDIT_CONFIG.contractEndDate, true);
    const criticalDate = parseConfigDate(AVEVA.CREDIT_CONFIG.criticalDate, true);
    const depletion = latest && burnRate > 0
      ? new Date(latest.date.getTime() + (latest.balance / burnRate) * DAY_MS)
      : null;
    const status = !latest ? 'N/A' : !depletion || depletion >= contractEnd ? 'GREEN' : depletion <= criticalDate ? 'RED' : 'YELLOW';
    return { status, depletion, contractEnd };
  };

  const setupCanvas = (id) => {
    const canvas = AVEVA.$(id);
    if (!canvas || canvas.offsetParent === null) return null;
    const box = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(box.width * ratio));
    canvas.height = Math.max(1, Math.round(box.height * ratio));
    const context = canvas.getContext('2d');
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { canvas, context, width: box.width, height: box.height };
  };

  const dateLabel = (date) => date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const compactNumber = (value) => Math.abs(value) >= 1000 ? `${(value / 1000).toFixed(Math.abs(value) >= 100000 ? 0 : 1)}k` : AVEVA.fmt(value, 0);

  const attachTooltip = (canvas, points, formatter) => {
    canvas.onmousemove = (event) => {
      if (!points.length) return;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const nearest = points.reduce((best, point) => Math.abs(point.x - x) < Math.abs(best.x - x) ? point : best, points[0]);
      let tooltip = document.querySelector('.chart-hover-tooltip');
      if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.className = 'chart-hover-tooltip';
        document.body.appendChild(tooltip);
      }
      tooltip.textContent = formatter(nearest);
      tooltip.style.left = `${Math.min(window.innerWidth - 250, event.clientX + 14)}px`;
      tooltip.style.top = `${Math.max(8, event.clientY - 54)}px`;
      tooltip.hidden = false;
    };
    canvas.onmouseleave = () => {
      const tooltip = document.querySelector('.chart-hover-tooltip');
      if (tooltip) tooltip.hidden = true;
    };
  };

  AVEVA.drawCreditsBurndown = (daily, forecast, ideal, status) => {
    const chart = setupCanvas('creditsBurndownChart');
    if (!chart) return;
    const { canvas, context, width, height } = chart;
    if (!daily.length) return AVEVA.drawNoData(context, width, height);
    const all = [...daily, ...forecast, ...ideal];
    const minDate = new Date(Math.min(...all.map((row) => row.date)));
    const maxDate = new Date(Math.max(...all.map((row) => row.date)));
    const minValue = Math.min(0, ...all.map((row) => row.balance));
    const maxValue = Math.max(AVEVA.CREDIT_CONFIG.initialCredits, ...all.map((row) => row.balance));
    const margin = { left: width < 600 ? 52 : 68, right: 22, top: 24, bottom: 50 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const xFor = (date) => margin.left + ((date - minDate) / Math.max(1, maxDate - minDate)) * plotWidth;
    const yFor = (value) => margin.top + ((maxValue - value) / Math.max(1, maxValue - minValue)) * plotHeight;

    context.font = '10px "Segoe UI", Arial';
    for (let index = 0; index <= 4; index += 1) {
      const value = minValue + (maxValue - minValue) * index / 4;
      const y = yFor(value);
      context.strokeStyle = value === 0 ? '#8799aa' : '#dbe4ec';
      context.beginPath();
      context.moveTo(margin.left, y);
      context.lineTo(width - margin.right, y);
      context.stroke();
      context.fillStyle = '#607386';
      context.textAlign = 'right';
      context.fillText(compactNumber(value), margin.left - 7, y + 3);
    }
    for (let index = 0; index <= 4; index += 1) {
      const date = new Date(minDate.getTime() + (maxDate - minDate) * index / 4);
      context.fillStyle = '#607386';
      context.textAlign = index === 0 ? 'left' : index === 4 ? 'right' : 'center';
      context.fillText(date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }), margin.left + plotWidth * index / 4, height - 18);
    }
    const drawLine = (points, color, dashed = false) => {
      if (!points.length) return;
      context.strokeStyle = color;
      context.lineWidth = 2.5;
      context.setLineDash(dashed ? [8, 5] : []);
      context.beginPath();
      points.forEach((row, index) => index ? context.lineTo(xFor(row.date), yFor(row.balance)) : context.moveTo(xFor(row.date), yFor(row.balance)));
      context.stroke();
      context.setLineDash([]);
    };
    if (AVEVA.creditSeriesVisibility.actual) {
      context.beginPath();
      daily.forEach((row, index) => index ? context.lineTo(xFor(row.date), yFor(row.balance)) : context.moveTo(xFor(row.date), yFor(row.balance)));
      context.lineTo(xFor(daily[daily.length - 1].date), yFor(0));
      context.lineTo(xFor(daily[0].date), yFor(0));
      context.closePath();
      context.fillStyle = '#0f57c9';
      context.fill();
      drawLine(daily, '#0b4fb8');
    }
    if (AVEVA.creditSeriesVisibility.forecast) drawLine(forecast, '#b75745', true);
    if (AVEVA.creditSeriesVisibility.ideal) drawLine(ideal, '#8a5dad');

    const zeroY = yFor(0);
    context.setLineDash([]);
    context.lineWidth = 1.5;
    context.strokeStyle = '#596f82';
    context.beginPath();
    context.moveTo(margin.left, zeroY);
    context.lineTo(width - margin.right, zeroY);
    context.stroke();
    context.fillStyle = '#40576b';
    context.font = 'bold 10px "Segoe UI", Arial';
    context.textAlign = 'right';
    context.fillText('0', margin.left - 7, zeroY + 3);

    const latest = daily[daily.length - 1];
    const burnRate = AVEVA.calculateAverageBurnRate(daily) || 0;
    const expectedStart = ideal[0];
    const hoverRows = [...daily, ...forecast].sort((a, b) => a.date - b.date);
    attachTooltip(canvas, hoverRows.map((row) => ({ x: xFor(row.date), row })), (point) => {
      const date = point.row.date;
      const actual = daily.reduce((best, row) => Math.abs(row.date - date) < Math.abs(best.date - date) ? row : best, daily[0]);
      const lines = [dateLabel(date)];
      if (Math.abs(actual.date - date) <= DAY_MS) lines.push(`Actual Balance: ${AVEVA.fmt(actual.balance, 0)} credits`);
      if (date >= latest.date) lines.push(`Forecast Balance: ${AVEVA.fmt(latest.balance - burnRate * ((date - latest.date) / DAY_MS), 0)} credits`);
      lines.push(`Expected Balance: ${AVEVA.fmt(AVEVA.CREDIT_CONFIG.initialCredits * Math.max(0, (status.contractEnd - date) / Math.max(1, status.contractEnd - expectedStart.date)), 0)} credits`);
      return lines.join('\n');
    });
    canvas.setAttribute('aria-label', `Credit balance forecast from ${dateLabel(daily[0].date)} to ${dateLabel(status.contractEnd)}. Latest actual balance ${AVEVA.fmt(latest.balance, 0)} credits.`);
  };

  AVEVA.renderCreditsOverview = (governance = AVEVA.calcGov()) => {
    const page = document.querySelector('[data-credits-overview]');
    if (!page || page.hidden) return;
    const allRows = validRows();
    const scope = AVEVA.dateScope();
    const rows = scope.mode === 'ALL' ? allRows : allRows.filter((row) => row.date <= scope.end);
    const daily = AVEVA.calculateDailyBalance(rows);
    const latest = AVEVA.getLatestCreditBalance(rows);
    const burnRate = AVEVA.calculateAverageBurnRate(daily);
    const forecast = AVEVA.calculateForecast(daily, burnRate);
    const ideal = AVEVA.calculateIdealBurndown();
    const status = AVEVA.calculateCreditStatus(latest, burnRate);

    AVEVA.$('creditsStatus').textContent = status.status;
    AVEVA.$('creditsStatusCard').className = `credits-inline-status credits-status-card ${status.status === 'N/A' ? 'status-unavailable' : `risk-${status.status.toLowerCase()}`}`;
    AVEVA.$('creditsDepletion').textContent = status.depletion ? dateLabel(status.depletion) : 'N/A';
    AVEVA.$('creditsContractEnd').textContent = dateLabel(status.contractEnd);
    const kpiBalance = AVEVA.$('kpiCreditBalance');
    const kpiCurrent = AVEVA.$('kpiCurrentTokens');
    const kpiTotal = AVEVA.$('kpiTotalTokens');
    if (kpiBalance) kpiBalance.textContent = latest ? AVEVA.fmt(latest.balance, 0) : 'N/A';
    if (kpiCurrent) kpiCurrent.textContent = governance.cv === null ? 'N/A' : AVEVA.fmt(governance.cv, 0);
    if (kpiTotal) kpiTotal.textContent = governance.total === null ? 'N/A' : AVEVA.fmt(governance.total, 0);
    const currentPeriod = AVEVA.$('kpiCurrentPeriod');
    if (currentPeriod) currentPeriod.textContent = governance.cur === 'N/A' ? 'No matching month' : `Month ${governance.cur}`;
    const overviewLatest = AVEVA.$('overviewLatestData');
    if (overviewLatest) overviewLatest.textContent = AVEVA.latestDataLabel(latest?.date || null);
    AVEVA.drawCreditsBurndown(daily, forecast, ideal, status);

    page.dataset.currentBalance = latest ? String(latest.balance) : '';
    page.dataset.firstDate = rows[0]?.date?.toISOString() || '';
    page.dataset.lastDate = latest?.date?.toISOString() || '';
    page.dataset.averageDailyBurn = burnRate === null ? '' : String(burnRate);
    page.dataset.estimatedDepletion = status.depletion?.toISOString() || '';
    page.dataset.forecastAtContractEnd = forecast.length ? String(forecast[forecast.length - 1].balance) : '';
  };

})();
