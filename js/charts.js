/* CONNECTS: Reads app/filter/mapper data and renders canvas elements declared in index.html. */
(() => {
  'use strict';

  /* ==========================================================
     CHART ENGINE

     หน้าที่:
     - วาดกราฟลง Canvas เดิมใน HTML

     HTML Canvas IDs:
     #userChart    -> Top Usage by Department (CDC; Dept -> internal department)
     #serviceChart -> Top Services by Usage Hours
  ========================================================== */

  const AVEVA = window.AVEVA;
  AVEVA.localDateKey = (date) => [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
  // Management feedback build 59: every supported chart consumes one global scope.
  AVEVA.getChartFilters = () => AVEVA.getFilters();

  AVEVA.fillChartFilters = () => {
    const setOptions = (scope, key, values, allLabel) => {
      const select = document.querySelector(
        `[data-chart-filters="${scope}"] [data-chart-filter="${key}"]`
      );
      if (!select) return;
      const selected = select.value;
      select.innerHTML = `<option value="">${allLabel}</option>`;
      [...new Set(values)]
        .filter((value) => value !== null && value !== undefined && value !== '')
        .sort((a, b) => typeof a === 'number' ? a - b : String(a).localeCompare(String(b)))
        .forEach((value) => select.add(new Option(value, value)));
      if (selected && [...select.options].some((option) => option.value === selected)) {
        select.value = selected;
      } else if (key === 'year' && values.length) {
        select.value = String(Math.max(...values.map(Number).filter(Number.isFinite)));
      }
    };
    const usage = AVEVA.data.viewUsage;
    ['users', 'services'].forEach((scope) => {
      setOptions(scope, 'year', [
        ...usage.map((row) => row.year),
        ...AVEVA.data.planHours.map((row) => row.year)
      ], 'All Years');
      setOptions(scope, 'month', [
        ...usage.map((row) => row.month),
        ...AVEVA.data.planHours.map((row) => row.month)
      ], 'All Months');
      setOptions(scope, 'company', usage.map((row) => row.company), 'All Companies');
      setOptions(scope, 'department', usage.map((row) => row.department), 'All Department');
    });
  };

  AVEVA.chartUsageRows = (scope) => {
    const filters = AVEVA.getChartFilters(scope);
    const range = filters.startDate && filters.endDate;
    const start = range ? new Date(`${filters.startDate}T00:00:00`) : null;
    const end = range ? new Date(`${filters.endDate}T23:59:59.999`) : null;
    return AVEVA.data.viewUsage.filter((row) =>
      (!filters.company || row.company === filters.company) &&
      (!filters.department || row.department === filters.department) &&
      (!filters.user || row.name === filters.user) &&
      (range
        ? row.start instanceof Date && row.start >= start && row.start <= end
        : (!filters.year || String(row.year) === String(filters.year)) &&
          (!filters.month || String(row.month) === String(filters.month)))
    );
  };

  AVEVA.groupUsage = (rows, labelKey, identityKey = labelKey) => {
    const grouped = new Map();

    rows.forEach((row) => {
      const identity = identityKey ? row[identityKey] : row;
      const label = labelKey ? row[labelKey] : row;
      const current = grouped.get(identity) || { label, value: 0 };
      current.value += row.hours;
      grouped.set(identity, current);
    });

    return [...grouped.values()]
      .map((item) => [item.label, item.value])
      .sort((a, b) => b[1] - a[1]);
  };

  AVEVA.prepareCanvas = (id) => {
    const canvas = AVEVA.$(id);
    const box = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const cssHeight = Math.max(220, Math.round(box.height) || 270);

    canvas.width = box.width * ratio;
    canvas.height = cssHeight * ratio;

    const context = canvas.getContext('2d');
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    return {
      context,
      width: box.width,
      height: cssHeight
    };
  };

  AVEVA.drawNoData = (context, width, height) => {
    context.fillStyle = '#687b8e';
    context.font = '13px "Segoe UI", Arial';
    context.textAlign = 'center';
    context.fillText('No data for the selected filters', width / 2, height / 2);
  };

  // Rounded columns improve visual scanability without changing chart values.
  AVEVA.fillRoundedColumn = (context, x, y, width, height, radius = 7) => {
    if (height <= 0 || width <= 0) return;
    const r = Math.max(0, Math.min(radius, width / 2, height / 2));
    context.beginPath();
    context.moveTo(x + r, y);
    context.lineTo(x + width - r, y);
    context.quadraticCurveTo(x + width, y, x + width, y + r);
    context.lineTo(x + width, y + height);
    context.lineTo(x, y + height);
    context.lineTo(x, y + r);
    context.quadraticCurveTo(x, y, x + r, y);
    context.closePath();
    context.fill();
  };

  AVEVA.drawBars = (id, data, suffix = '') => {
    const { context, width, height } = AVEVA.prepareCanvas(id);
    context.clearRect(0, 0, width, height);

    const topTen = data.slice(0, 10);
    if (!topTen.length) {
      AVEVA.drawNoData(context, width, height);
      return;
    }

    const maximum = Math.max(...topTen.map((item) => item[1]), 1);
    const left = Math.min(150, Math.max(72, width * 0.38));
    const right = Math.min(72, Math.max(44, width * 0.18));
    const chartWidth = Math.max(12, width - left - right);
    const maxLabelLength = Math.max(8, Math.floor(left / 7));

    context.font = '12px "Segoe UI", Arial';

    topTen.forEach((item, index) => {
      const y = 15 + index * 24;
      const barWidth = Math.max(1, (chartWidth * item[1]) / maximum);

      context.fillStyle = '#245783';
      context.fillRect(left, y, barWidth, 15);

      context.fillStyle = '#526579';
      context.textAlign = 'right';
      const rawLabel = String(item[0]);
      const label = rawLabel.length > maxLabelLength
        ? `${rawLabel.slice(0, maxLabelLength - 1)}…`
        : rawLabel;
      context.fillText(label, left - 5, y + 12);

      context.textAlign = 'left';
      context.fillText(`${AVEVA.fmt(item[1])}${suffix}`, Math.min(left + barWidth + 5, width - right + 5), y + 12);
    });

    const canvas = AVEVA.$(id);
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', topTen.map((item, index) => `${index + 1}. ${item[0]}: ${AVEVA.fmt(item[1])}${suffix}`).join('; '));
  };

  AVEVA.drawColumnBars = (id, data, suffix = '', labelFormatter = null) => {
    const { context, width, height } = AVEVA.prepareCanvas(id);
    context.clearRect(0, 0, width, height);

    if (!data.length) {
      AVEVA.drawNoData(context, width, height);
      return;
    }

    const maximum = Math.max(...data.map((item) => item[1]), 1);
    const left = 56;
    const right = 24;
    const top = 28;
    const bottom = 42;
    const plotHeight = height - top - bottom;
    const plotWidth = Math.max(20, width - left - right);
    context.font = '11px "Segoe UI", Arial';
    context.strokeStyle = '#dce6ef';
    context.fillStyle = '#687b8e';
    for (let tick = 0; tick <= 4; tick += 1) {
      const value = (maximum * tick) / 4;
      const y = top + plotHeight * (1 - tick / 4);
      context.beginPath();
      context.moveTo(left, y);
      context.lineTo(width - right, y);
      context.stroke();
      context.textAlign = 'right';
      context.fillText(AVEVA.fmt(value, 0), left - 6, y + 4);
    }

    const slotWidth = plotWidth / Math.max(data.length, 1);
    const barWidth = Math.max(12, Math.min(54, slotWidth * 0.58));
    const labelStep = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(plotWidth / 72))));

    data.forEach((item, index) => {
      const value = item[1];
      const barHeight = Math.max(1, (plotHeight * value) / maximum);
      const x = left + index * slotWidth + (slotWidth - barWidth) / 2;
      const y = top + plotHeight - barHeight;

      context.fillStyle = '#0877b9';
      context.fillRect(x, y, barWidth, barHeight);

      context.fillStyle = '#526579';
      context.font = '9px "Segoe UI", Arial';
      context.textAlign = 'center';
      context.fillText(`${AVEVA.fmt(value, 1)}${suffix}`, x + barWidth / 2, Math.max(13, y - 7));
      context.font = '11px "Segoe UI", Arial';

      if (index % labelStep !== 0 && index !== data.length - 1) return;
      context.textAlign = 'center';
      const axisLabel = labelFormatter
        ? labelFormatter(item[0])
        : `${String(item[0]).slice(5)}/${String(item[0]).slice(0, 4)}`;
      context.fillText(axisLabel, x + barWidth / 2, height - 16);
    });

    const canvas = AVEVA.$(id);
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', data.map((item) => `${item[0]}: ${AVEVA.fmt(item[1])}${suffix}`).join('; '));
  };

  AVEVA.drawCategoryColumns = (id, data, suffix = '', onSelect = null) => {
    const { context, width, height } = AVEVA.prepareCanvas(id);
    context.clearRect(0, 0, width, height);
    const topTen = data.slice(0, 10);
    if (!topTen.length) {
      AVEVA.drawNoData(context, width, height);
      return;
    }
    const maximum = Math.max(...topTen.map((item) => item[1]), 1);
    const left = 52;
    const right = 18;
    const top = 26;
    const bottom = 78;
    const plotHeight = height - top - bottom;
    const plotWidth = Math.max(30, width - left - right);
    context.font = '10px "Segoe UI", Arial';
    context.strokeStyle = '#dce6ef';
    for (let tick = 0; tick <= 4; tick += 1) {
      const y = top + plotHeight * (1 - tick / 4);
      context.beginPath();
      context.moveTo(left, y);
      context.lineTo(width - right, y);
      context.stroke();
      context.fillStyle = '#687b8e';
      context.textAlign = 'right';
      context.fillText(AVEVA.fmt(maximum * tick / 4, 0), left - 6, y + 4);
    }
    const slot = plotWidth / topTen.length;
    const barWidth = Math.max(10, Math.min(42, slot * 0.62));
    const hitAreas = [];
    topTen.forEach(([rawLabel, value], index) => {
      const barHeight = Math.max(1, plotHeight * value / maximum);
      const x = left + index * slot + (slot - barWidth) / 2;
      const y = top + plotHeight - barHeight;
      const gradient = context.createLinearGradient(0, y, 0, top + plotHeight);
      gradient.addColorStop(0, index === 0 ? '#075b8b' : '#2c86b9');
      gradient.addColorStop(1, index === 0 ? '#0b75ad' : '#78b6d6');
      context.save();
      if (index === 0) {
        context.shadowColor = 'rgba(8, 83, 128, .24)';
        context.shadowBlur = 8;
        context.shadowOffsetY = 3;
      }
      context.fillStyle = gradient;
      AVEVA.fillRoundedColumn(context, x, y, barWidth, barHeight, 7);
      context.restore();
      hitAreas.push({ x: left + index * slot, width: slot, label: rawLabel, value });
      context.fillStyle = '#526579';
      context.font = `${index === 0 ? '800' : '700'} 10px "Segoe UI", Arial`;
      context.textAlign = 'center';
      context.fillText(`${AVEVA.fmt(value)}${suffix}`, x + barWidth / 2, Math.max(12, y - 6));
      const label = String(rawLabel).length > 16
        ? `${String(rawLabel).slice(0, 15)}…`
        : String(rawLabel);
      context.save();
      context.translate(x + barWidth / 2, top + plotHeight + 9);
      context.rotate(-Math.PI / 4);
      context.textAlign = 'right';
      context.fillText(label, 0, 0);
      context.restore();
    });
    const canvas = AVEVA.$(id);
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', topTen.map((item, index) =>
      `${index + 1}. ${item[0]}: ${AVEVA.fmt(item[1])}${suffix}`
    ).join('; '));
    canvas.style.cursor = onSelect ? 'pointer' : 'default';
    canvas.onclick = onSelect ? (event) => {
      const bounds = canvas.getBoundingClientRect();
      const canvasX = (event.clientX - bounds.left) * width / Math.max(bounds.width, 1);
      const match = hitAreas.find((area) => canvasX >= area.x && canvasX <= area.x + area.width);
      if (match) onSelect(match.label, match.value);
    } : null;
  };

  AVEVA.drawServiceMix = (id, entries) => {
    const data = entries
      .filter((item) => item[1] > 0)
      .sort((a, b) => b[1] - a[1]);
    const { context, width, height } = AVEVA.prepareCanvas(id);
    context.clearRect(0, 0, width, height);
    const summary = AVEVA.$('serviceSummary');
    if (!data.length) {
      AVEVA.drawNoData(context, width, height);
      if (summary) summary.innerHTML = '<div class="service-empty">No credit consumption for the selected filters</div>';
      return;
    }

    const total = data.reduce((sum, item) => sum + item[1], 0);
    const colors = ['#0072b2', '#e69f00', '#009e73', '#cc79a7', '#d55e00', '#56b4e9', '#8b5cf6', '#84cc16', '#a16207', '#64748b'];
    const radius = Math.max(54, Math.min(118, width * 0.28, height * 0.38));
    const centerX = width / 2;
    const centerY = height / 2 + 4;
    let angle = -Math.PI / 2;
    data.forEach((item, index) => {
      const next = angle + Math.PI * 2 * item[1] / total;
      context.beginPath();
      context.moveTo(centerX, centerY);
      context.arc(centerX, centerY, radius, angle, next);
      context.closePath();
      context.fillStyle = colors[index % colors.length];
      context.fill();
      context.strokeStyle = '#ffffff';
      context.lineWidth = 2;
      context.stroke();
      const share = item[1] / total;
      if (share >= 0.08) {
        const mid = (angle + next) / 2;
        context.fillStyle = '#ffffff';
        context.font = '800 12px "Segoe UI", Arial';
        context.textAlign = 'center';
        context.fillText(`${(share * 100).toFixed(1)}%`, centerX + Math.cos(mid) * radius * .62, centerY + Math.sin(mid) * radius * .62 + 4);
      }
      angle = next;
    });

    if (summary) {
      const escape = AVEVA.escapeHtml || ((value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[char])));
      summary.innerHTML = data.map((item, index) => `
        <article class="service-summary-card">
          <i style="--service-color:${colors[index % colors.length]}"></i>
          <div><h3>${escape(item[0])}</h3><strong>${AVEVA.fmt(item[1], 0)} credits</strong><span>${(item[1] / total * 100).toFixed(1)}% of selected consumption</span></div>
        </article>`).join('');
    }

    const canvas = AVEVA.$(id);
    canvas.title = data.map((item) => `${item[0]}: ${AVEVA.fmt(item[1], 0)} credits (${(item[1] / total * 100).toFixed(1)}%)`).join('\n');
    canvas.setAttribute('aria-label', data.map((item) => `${item[0]} ${AVEVA.fmt(item[1], 0)} credits, ${(item[1] / total * 100).toFixed(1)} percent`).join('; '));
  };

  AVEVA.drawTokenMonthComparison = (id) => {
    const filters = AVEVA.getFilters();
    const txRows = AVEVA.getFilteredTransactions
      ? AVEVA.getFilteredTransactions()
      : AVEVA.data.tx.filter((row) => row.agreementId === AVEVA.ACTIVE_AGREEMENT && row.token < 0);
    const usageRows = AVEVA.filteredUsage();
    const tokenRows = txRows.filter((row) => row.token < 0 && row.date instanceof Date);
    const tokenByMonth = new Map();
    tokenRows.forEach((row) => {
      const period = `${row.date.getFullYear()}-${String(row.date.getMonth() + 1).padStart(2, '0')}`;
      tokenByMonth.set(period, (tokenByMonth.get(period) || 0) + Math.abs(row.token));
    });
    const hoursByMonth = new Map();
    usageRows.forEach((row) => {
      const date = row.start instanceof Date ? row.start : new Date(row.start);
      if (Number.isNaN(date.getTime())) return;
      const period = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      hoursByMonth.set(period, (hoursByMonth.get(period) || 0) + AVEVA.num(row.hours));
    });

    const periods = [...new Set([...tokenByMonth.keys(), ...hoursByMonth.keys()])].sort();
    const data = periods.map((period) => ({ period, tokens: tokenByMonth.get(period) ?? null, hours: hoursByMonth.get(period) ?? null }));
    const scopeLabel = AVEVA.$('tokenComparisonScope');
    if (scopeLabel) {
      const periodText = filters.startDate && filters.endDate
        ? `${filters.startDate} → ${filters.endDate}`
        : filters.year ? `${filters.year}${filters.month ? ` / Month ${filters.month}` : ''}` : 'All available dates';
      scopeLabel.textContent = `Filtered scope · ${periodText}`;
    }
    const latest = AVEVA.latestDate([
      ...tokenRows.map((row) => row.date),
      ...usageRows.map((row) => row.start instanceof Date ? row.start : new Date(row.start))
    ]);
    const latestTarget = AVEVA.$('tokenLatestData');
    if (latestTarget) latestTarget.textContent = AVEVA.latestDataLabel(latest);

    const { context, width, height } = AVEVA.prepareCanvas(id);
    context.clearRect(0, 0, width, height);
    if (!data.length) return AVEVA.drawNoData(context, width, height);

    const currentDate = new Date();
    const currentPeriod = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
    const maxTokens = Math.max(...data.map((row) => row.tokens || 0), 1) * 1.12;
    const maxHours = Math.max(...data.map((row) => row.hours || 0), 1) * 1.12;
    const compact = width < 620;
    const left = compact ? 52 : 66;
    const right = compact ? 52 : 66;
    const top = 42;
    const bottom = compact ? 62 : 54;
    const plotWidth = Math.max(40, width - left - right);
    const plotHeight = Math.max(80, height - top - bottom);
    const slot = plotWidth / data.length;
    const gap = Math.max(2, Math.min(6, slot * .08));
    const barWidth = Math.max(3, Math.min(24, (slot - gap * 3) / 2));
    context.font = `${compact ? 9 : 10}px "Segoe UI", Arial`;
    context.strokeStyle = '#dce6ef';
    for (let tick = 0; tick <= 4; tick += 1) {
      const y = top + plotHeight * (1 - tick / 4);
      context.beginPath(); context.moveTo(left, y); context.lineTo(width - right, y); context.stroke();
      context.fillStyle = '#526579';
      context.textAlign = 'right'; context.fillText(AVEVA.fmt(maxTokens * tick / 4, 0), left - 7, y + 4);
      context.textAlign = 'left'; context.fillText(AVEVA.fmt(maxHours * tick / 4, 0), width - right + 7, y + 4);
    }
    context.fillStyle = '#526579';
    context.textAlign = 'left'; context.fillText('Tokens Consumed', 4, top - 13);
    context.textAlign = 'right'; context.fillText('Usage Hours', width - 4, top - 13);

    const hitAreas = [];
    const barValueLabel = (value) => compact && Math.abs(value) >= 1000 ? `${(value / 1000).toFixed(1)}k` : AVEVA.fmt(value, 0);
    data.forEach((row, index) => {
      const center = left + slot * index + slot / 2;
      const tokenX = center - gap / 2 - barWidth;
      const hourX = center + gap / 2;
      if (row.tokens !== null) {
        const barHeight = Math.max(1, row.tokens / maxTokens * plotHeight);
        const barY = top + plotHeight - barHeight;
        context.fillStyle = '#0877b9';
        AVEVA.fillRoundedColumn(context, tokenX, barY, barWidth, barHeight, 4);
        context.fillStyle = '#075b8b'; context.font = `700 ${compact ? 8 : 9}px "Segoe UI", Arial`; context.textAlign = 'center';
        context.fillText(barValueLabel(row.tokens), tokenX + barWidth / 2, Math.max(top + 9, barY - 5));
      }
      if (row.hours !== null) {
        const barHeight = Math.max(1, row.hours / maxHours * plotHeight);
        const barY = top + plotHeight - barHeight;
        context.fillStyle = '#df8b24';
        AVEVA.fillRoundedColumn(context, hourX, barY, barWidth, barHeight, 4);
        context.fillStyle = '#a45b08'; context.font = `700 ${compact ? 8 : 9}px "Segoe UI", Arial`; context.textAlign = 'center';
        context.fillText(barValueLabel(row.hours), hourX + barWidth / 2, Math.max(top + 9, barY - 5));
      }
      hitAreas.push({ x: left + slot * index, width: slot, row });
    });

    const maxLabels = compact ? 4 : Math.max(6, Math.floor(plotWidth / 78));
    const labelStep = Math.max(1, Math.ceil(data.length / maxLabels));
    data.forEach((row, index) => {
      if (index % labelStep && index !== data.length - 1) return;
      const date = new Date(`${row.period}-01T12:00:00`);
      const label = date.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
      context.fillStyle = '#526579'; context.textAlign = 'center';
      context.fillText(`${label}${row.period === currentPeriod ? ' MTD' : ''}`, left + slot * index + slot / 2, height - 18);
    });

    context.fillStyle = '#0877b9'; context.fillRect(left, 9, 12, 12);
    context.fillStyle = '#526579'; context.textAlign = 'left'; context.fillText('Tokens Consumed (left axis)', left + 18, 20);
    const secondLegendX = Math.min(width - right - 135, left + 190);
    context.fillStyle = '#df8b24'; context.fillRect(secondLegendX, 9, 12, 12);
    context.fillStyle = '#526579'; context.fillText('Usage Hours (right axis)', secondLegendX + 18, 20);

    const canvas = AVEVA.$(id);
    canvas.onmousemove = (event) => {
      const bounds = canvas.getBoundingClientRect();
      const canvasX = (event.clientX - bounds.left) * width / Math.max(bounds.width, 1);
      const match = hitAreas.find((area) => canvasX >= area.x && canvasX <= area.x + area.width);
      let tooltip = document.querySelector('.chart-hover-tooltip');
      if (!match) { if (tooltip) tooltip.hidden = true; return; }
      if (!tooltip) { tooltip = document.createElement('div'); tooltip.className = 'chart-hover-tooltip'; document.body.appendChild(tooltip); }
      const date = new Date(`${match.row.period}-01T12:00:00`);
      const month = date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
      tooltip.textContent = [
        `${month}${match.row.period === currentPeriod ? ' (MTD)' : ''}`,
        `Tokens Consumed: ${match.row.tokens === null ? 'No recorded data' : `${AVEVA.fmt(match.row.tokens, 0)} tokens`}`,
        `Usage Hours: ${match.row.hours === null ? 'No recorded data' : `${AVEVA.fmt(match.row.hours, 1)} hours`}`
      ].join('\n');
      tooltip.style.left = `${Math.min(window.innerWidth - 250, event.clientX + 14)}px`;
      tooltip.style.top = `${Math.max(8, event.clientY - 58)}px`;
      tooltip.hidden = false;
    };
    canvas.onmouseleave = () => { const tooltip = document.querySelector('.chart-hover-tooltip'); if (tooltip) tooltip.hidden = true; };
    canvas.setAttribute('aria-label', data.map((row) => `${row.period}: ${row.tokens ?? 'no token data'} tokens, ${row.hours ?? 'no usage data'} hours`).join('; '));
  };

  AVEVA.renderDepartmentDrilldown = (rows, department) => {
    const target = AVEVA.$('departmentDrilldown');
    if (!target) return;
    if (!department) { target.hidden = true; target.innerHTML = ''; return; }
    const selected = rows.filter((row) => row.department === department);
    if (!selected.length) { target.hidden = true; target.innerHTML = ''; return; }
    const byCostCentre = new Map();
    selected.forEach((row) => {
      const costCentre = AVEVA.text(row.costCentre) || 'Unknown Cost Centre';
      const group = byCostCentre.get(costCentre) || new Map();
      const user = AVEVA.text(row.name) || 'Unknown User';
      group.set(user, (group.get(user) || 0) + AVEVA.num(row.hours));
      byCostCentre.set(costCentre, group);
    });
    const totalHours = selected.reduce((sum, row) => sum + AVEVA.num(row.hours), 0);
    const escape = AVEVA.escapeHtml || ((value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[char])));
    target.innerHTML = `
      <div class="department-drilldown-head"><div><span>Department detail</span><h3>${escape(department)}</h3><p>${AVEVA.fmt(totalHours, 1)} total usage hours · ${byCostCentre.size} cost centre${byCostCentre.size === 1 ? '' : 's'}</p></div><button type="button" data-close-department-drilldown aria-label="Close department detail">×</button></div>
      <div class="cost-centre-grid">${[...byCostCentre.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([costCentre, users]) => {
        const sortedUsers = [...users.entries()].sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0]));
        const hours = sortedUsers.reduce((sum, item) => sum + item[1], 0);
        return `<section class="cost-centre-card"><header><div><span>Cost Centre</span><h4>${escape(costCentre)}</h4></div><b>${AVEVA.fmt(hours,1)} h</b></header><ul>${sortedUsers.map(([name,userHours]) => `<li><strong>${escape(name)}</strong><span>${AVEVA.fmt(userHours,1)} h</span></li>`).join('')}</ul></section>`;
      }).join('')}</div>`;
    target.hidden = false;
    target.querySelector('[data-close-department-drilldown]')?.addEventListener('click', () => {
      AVEVA.selectedDepartment = '';
      AVEVA.renderDepartmentDrilldown(rows, '');
    });
  };

  AVEVA.drawCharts = (usageRows, governance) => {
    const userRows = AVEVA.chartUsageRows('users');
    const departmentData = AVEVA.groupUsage(userRows, 'department');
    if (AVEVA.selectedDepartment && !departmentData.some(([name]) => name === AVEVA.selectedDepartment)) AVEVA.selectedDepartment = '';
    AVEVA.drawCategoryColumns('userChart', departmentData, ' h', (department) => {
      AVEVA.selectedDepartment = department;
      AVEVA.renderDepartmentDrilldown(userRows, department);
    });
    AVEVA.renderDepartmentDrilldown(userRows, AVEVA.selectedDepartment || '');
    const deptLatest = AVEVA.latestDate(userRows.map((row) => row.start instanceof Date ? row.start : new Date(row.start)));
    const deptLatestTarget = AVEVA.$('departmentLatestData');
    if (deptLatestTarget) deptLatestTarget.textContent = AVEVA.latestDataLabel(deptLatest);

    AVEVA.drawServiceMix('serviceChart', [...governance.serviceConsumption.entries()]);
    const serviceRows = AVEVA.getFilteredTransactions ? AVEVA.getFilteredTransactions().filter((row) => row.token < 0) : [];
    const serviceLatest = AVEVA.latestDate(serviceRows.map((row) => row.date));
    const serviceLatestTarget = AVEVA.$('serviceLatestData');
    if (serviceLatestTarget) serviceLatestTarget.textContent = AVEVA.latestDataLabel(serviceLatest);

    AVEVA.drawTokenMonthComparison('overviewTokenChart');
  };
})();
