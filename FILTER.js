(() => {
  'use strict';

  /* ==========================================================
     FILTER ENGINE

     หน้าที่:
     - เติม Dropdown ใน HTML
     - อ่าน Filter User / Email / Service / Department / Company
     - อ่าน Filter Year / Month
     - สร้าง Date Scope สำหรับ Governance Engine

     High-risk guard:
     - Month ใช้งานได้เฉพาะเมื่อเลือก Year แล้ว
     - ป้องกัน Usage กับ Governance ใช้คนละ Scope
     - ไม่แก้ Logic ของ #totalTokens, #balance, #currentTokens
  ========================================================== */

  const AVEVA = window.AVEVA;

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
    const usageFilters = [
      ['fUser', 'name'],
      ['fEmail', 'email'],
      ['fService', 'service'],
      ['fDept', 'department'],
      ['fCompany', 'company']
    ];

    for (const [elementId, key] of usageFilters) {
      const element = AVEVA.$(elementId);
      element.innerHTML = `<option value="">All ${key}</option>`;

      [...new Set(AVEVA.data.viewUsage.map((row) => row[key]))]
        .filter((value) => value !== null && value !== undefined && value !== '')
        .sort()
        .forEach((value) => element.add(new Option(value, value)));
    }

    const transactionDates = AVEVA.data.tx
      .map((row) => row.date)
      .filter((date) => date instanceof Date && !Number.isNaN(date.getTime()));

    const years = [
      ...new Set([
        ...AVEVA.data.viewUsage.map((row) => row.year),
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

    AVEVA.$('fYear').innerHTML = '<option value="">All year</option>';
    years.forEach((year) => AVEVA.$('fYear').add(new Option(year, year)));

    AVEVA.$('fMonth').innerHTML = '<option value="">All month</option>';
    months.forEach((month) => AVEVA.$('fMonth').add(new Option(month, month)));

    AVEVA.syncYearMonthFilter();
  };

  AVEVA.getFilters = () => {
    const year = AVEVA.$('fYear').value;

    return {
      name: AVEVA.$('fUser').value,
      email: AVEVA.$('fEmail').value,
      service: AVEVA.$('fService').value,
      department: AVEVA.$('fDept').value,
      company: AVEVA.$('fCompany').value,
      year,
      // Defense in depth: ถ้าไม่มี Year ให้ Month ไม่มีผลกับ Usage ด้วย
      month: year ? AVEVA.$('fMonth').value : ''
    };
  };

  AVEVA.filteredUsage = () => {
    const filters = AVEVA.getFilters();

    return AVEVA.data.viewUsage.filter((row) =>
      Object.entries(filters).every(
        ([key, value]) => !value || String(row[key]) === String(value)
      )
    );
  };

  AVEVA.dateScope = () => {
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
