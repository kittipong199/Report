/* CONNECTS: Converts Overview controls into scopes consumed by app.js and governance-engine.js. */
(() => {
  'use strict';

  /* ==========================================================
     FILTER ENGINE

     หน้าที่:
     - เติม Dropdown ใน HTML
     - อ่าน Filter ตามลำดับ Year / Month / Company / CDC
     - CDC เป็นชื่อใน UI ของ internal field `department`
     - สร้าง Date Scope สำหรับ Governance Engine

     High-risk guard:
     - Month ใช้งานได้เฉพาะเมื่อเลือก Year แล้ว
     - ป้องกัน Usage กับ Governance ใช้คนละ Scope
     - ไม่แก้ Logic ของ #totalTokens, #balance, #currentTokens
  ========================================================== */

  const AVEVA = window.AVEVA;
  AVEVA.currentYear = () => new Date().getFullYear();
  AVEVA.latestDataYear = () => {
    const years = [
      ...AVEVA.data.viewUsage.map((row) => row.year),
      ...AVEVA.data.planHours.map((row) => row.year),
      ...AVEVA.data.tx.map((row) => row.date instanceof Date ? row.date.getFullYear() : null)
    ].filter(Number.isFinite);
    return years.length ? Math.max(...years) : AVEVA.currentYear();
  };
  AVEVA.defaultYear = () => AVEVA.currentYear();

  AVEVA.syncYearMonthFilter = () => {
    const yearElement = AVEVA.$('fYear');
    const monthElement = AVEVA.$('fMonth');
    const hasYear = Boolean(yearElement.value);

    // Month ไม่มีความหมายใน Governance เมื่อไม่ได้เลือก Year
    // จึงล้างค่าและปิดการใช้งาน เพื่อให้ Usage/Governance ใช้ Scope เดียวกัน
    if (!hasYear) {
      monthElement.value = '';
    }

    monthElement.disabled = !hasYear;
  };

  AVEVA.fillFilters = () => {
    const selectedCompany = AVEVA.$('fCompany').value;
    const selectedDepartment = AVEVA.$('fDept').value;
    const selectedUser = AVEVA.$('fUser').value;
    const usageFilters = [
      ['fCompany', 'company', 'All Companies', AVEVA.data.viewUsage],
      ['fDept', 'department', 'All Department', AVEVA.data.viewUsage.filter((row) => !selectedCompany || row.company === selectedCompany)],
      ['fUser', 'name', 'All Users', AVEVA.data.viewUsage.filter((row) =>
        (!selectedCompany || row.company === selectedCompany) &&
        (!selectedDepartment || row.department === selectedDepartment)
      )]
    ];

    for (const [elementId, key, allLabel, rows] of usageFilters) {
      const element = AVEVA.$(elementId);
      const selectedValue = element.value;
      element.innerHTML = `<option value="">${allLabel}</option>`;

      [...new Set(rows.map((row) => row[key]))]
        .filter((value) => value !== null && value !== undefined && value !== '')
        .sort()
        .forEach((value) => element.add(new Option(value, value)));
      element.value = selectedValue;
    }
    if (selectedUser && [...AVEVA.$('fUser').options].some((option) => option.value === selectedUser)) {
      AVEVA.$('fUser').value = selectedUser;
    }

    const transactionDates = AVEVA.data.tx
      .map((row) => row.date)
      .filter((date) => date instanceof Date && !Number.isNaN(date.getTime()));

    const years = [
      ...new Set([
        AVEVA.currentYear(),
        AVEVA.defaultYear(),
        ...AVEVA.data.viewUsage.map((row) => row.year),
        ...AVEVA.data.planHours.map((row) => row.year),
        ...transactionDates.map((date) => date.getFullYear())
      ])
    ]
      .filter(Number.isFinite)
      .sort((a, b) => a - b);

    const months = [
      ...new Set([
        ...AVEVA.data.viewUsage.map((row) => row.month),
        ...transactionDates.map((date) => date.getMonth() + 1)
      ])
    ]
      .filter(Number.isFinite)
      .sort((a, b) => a - b);

    const selectedYear = AVEVA.$('fYear').value;
    const selectedMonth = AVEVA.$('fMonth').value;
    AVEVA.$('fYear').innerHTML = `<option value="">${AVEVA.t('allYear')}</option>`;
    years.forEach((year) => AVEVA.$('fYear').add(new Option(year, year)));

    AVEVA.$('fMonth').innerHTML = `<option value="">${AVEVA.t('allMonth')}</option>`;
    months.forEach((month) => AVEVA.$('fMonth').add(new Option(month, month)));
    const hasLoadedData = AVEVA.data.viewUsage.length ||
      AVEVA.data.planHours.length || AVEVA.data.tx.length;
    AVEVA.$('fYear').value = selectedYear ||
      (hasLoadedData ? String(AVEVA.defaultYear()) : '');
    AVEVA.$('fMonth').value = selectedMonth;

    AVEVA.syncYearMonthFilter();
  };

  AVEVA.getFilters = () => {
    const year = AVEVA.$('fYear').value;

    return {
      company: AVEVA.$('fCompany').value,
      department: AVEVA.$('fDept').value,
      user: AVEVA.$('fUser').value,
      year,
      // Defense in depth: ถ้าไม่มี Year ให้ Month ไม่มีผลกับ Usage ด้วย
      month: year ? AVEVA.$('fMonth').value : '',
      startDate: AVEVA.$('fStartDate').value,
      endDate: AVEVA.$('fEndDate').value
    };
  };


  AVEVA.employeeIdentityMap = () => {
    const identityMap = new Map();
    AVEVA.data.employees.forEach((employee) => {
      [employee.email, employee.emailAD, employee.username]
        .map((value) => AVEVA.text(value).toLowerCase())
        .filter(Boolean)
        .forEach((identity) => identityMap.set(identity, employee));
    });
    return identityMap;
  };

  AVEVA.filterTransactionsByOrganization = (rows, filters = AVEVA.getFilters()) => {
    const hasOrganizationFilter = Boolean(filters.company || filters.department || filters.user);
    if (!hasOrganizationFilter) return rows.slice();
    const identityMap = AVEVA.employeeIdentityMap();
    return rows.filter((row) => {
      const employee = identityMap.get(AVEVA.text(row.user).toLowerCase());
      if (!employee) return false;
      return (!filters.company || employee.company === filters.company) &&
        (!filters.department || employee.department === filters.department) &&
        (!filters.user || employee.name === filters.user);
    });
  };

  AVEVA.getFilteredTransactions = ({ rows = AVEVA.data.tx, applyDate = true, agreementOnly = true } = {}) => {
    const filters = AVEVA.getFilters();
    let result = agreementOnly
      ? rows.filter((row) => row.agreementId === AVEVA.ACTIVE_AGREEMENT)
      : rows.slice();
    result = AVEVA.filterTransactionsByOrganization(result, filters);
    if (!applyDate) return result;

    const hasRange = filters.startDate && filters.endDate;
    const start = hasRange ? new Date(`${filters.startDate}T00:00:00`) : null;
    const end = hasRange ? new Date(`${filters.endDate}T23:59:59.999`) : null;
    return result.filter((row) => row.date instanceof Date && !Number.isNaN(row.date.getTime()) &&
      (hasRange
        ? row.date >= start && row.date <= end
        : (!filters.year || String(row.date.getFullYear()) === String(filters.year)) &&
          (!filters.month || String(row.date.getMonth() + 1) === String(filters.month))));
  };

  AVEVA.validateDateRange = () => {
    const { startDate, endDate } = AVEVA.getFilters();
    const error = AVEVA.$('dateFilterError');
    let message = '';
    if (Boolean(startDate) !== Boolean(endDate)) {
      message = 'Select both Start Date and End Date.';
    } else if (startDate && endDate && startDate > endDate) {
      message = 'Start Date must be on or before End Date.';
    }
    error.textContent = message;
    error.hidden = !message;
    return !message;
  };

  AVEVA.filteredUsage = () => {
    const filters = AVEVA.getFilters();

    const hasRange = filters.startDate && filters.endDate;
    const start = hasRange ? new Date(`${filters.startDate}T00:00:00`) : null;
    const end = hasRange ? new Date(`${filters.endDate}T23:59:59.999`) : null;
    return AVEVA.data.viewUsage.filter((row) => {
      const date = row.start instanceof Date ? row.start : new Date(row.start);
      return (!filters.company || row.company === filters.company) &&
        (!filters.department || row.department === filters.department) &&
        (!filters.user || row.name === filters.user) &&
        (hasRange
          ? date >= start && date <= end
          : (!filters.year || String(row.year) === String(filters.year)) &&
            (!filters.month || String(row.month) === String(filters.month)));
    });
  };

  AVEVA.dateScope = () => {
    const startValue = AVEVA.$('fStartDate').value;
    const endValue = AVEVA.$('fEndDate').value;
    if (startValue && endValue) {
      return { mode: 'RANGE', start: new Date(`${startValue}T00:00:00`), end: new Date(`${endValue}T23:59:59.999`) };
    }
    const year = Number(AVEVA.$('fYear').value);
    const month = Number(AVEVA.$('fMonth').value);

    if (!year) {
      return { mode: 'ALL', start: null, end: null };
    }

    if (!month) {
      return {
        mode: 'YEAR',
        start: new Date(year, 0, 1, 0, 0, 0, 0),
        end: new Date(year, 11, 31, 23, 59, 59, 999)
      };
    }

    return {
      mode: 'MONTH',
      start: new Date(year, month - 1, 1, 0, 0, 0, 0),
      end: new Date(year, month, 0, 23, 59, 59, 999)
    };
  };

  AVEVA.inScope = (date, scope) => {
    return (
      scope.mode === 'ALL' ||
      (date instanceof Date && date >= scope.start && date <= scope.end)
    );
  };

  AVEVA.previousPeriod = (period) => {
    const [year, month] = period.split('-').map(Number);
    const date = new Date(year, month - 2, 1);

    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  };
})();
