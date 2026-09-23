/* CONNECTS: Normalizes Excel rows for loader.js: usage, credit, name AD, and daily Plan Hour. */
(() => {
  'use strict';

  /* ==========================================================
     DATA MAPPER

     หน้าที่:
     - แปลง Excel Rows เป็น JavaScript Objects
     - ไม่ส่งค่าเข้า HTML โดยตรง
     - ผลลัพธ์ถูกส่งให้ loader.js แล้วเก็บใน AVEVA.data

     usageMap -> ใช้กับ Usage Chart และ Usage Table
     txMap    -> ใช้กับ Governance Cards และ Token Chart
     empMap   -> ใช้ผูก Name, Department และ Company กับ Usage
  ========================================================== */

  const AVEVA = window.AVEVA;

  /* ==========================================================
     EXCEL DATE PARSER

     แปลง Excel Serial Date โดยไม่ให้ Timezone เลื่อนวันที่
     เช่น 01/08/2026 ต้องคงเป็น 01/08/2026 ไม่ใช่ 31/07/2026
  ========================================================== */

  AVEVA.parseExcelDate = (value, dateOnly = false) => {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    // เมื่อ loader.js อ่าน raw:true และ cellDates:false วันที่จะเป็น Excel Serial
    if (typeof value === 'number' && Number.isFinite(value)) {
      const parsed = XLSX.SSF.parse_date_code(value);

      if (!parsed) {
        return null;
      }

      return new Date(
        parsed.y,
        parsed.m - 1,
        parsed.d,
        dateOnly ? 12 : parsed.H || 0,
        dateOnly ? 0 : parsed.M || 0,
        dateOnly ? 0 : Math.floor(parsed.S || 0),
        0
      );
    }

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return new Date(
        value.getFullYear(),
        value.getMonth(),
        value.getDate(),
        dateOnly ? 12 : value.getHours(),
        dateOnly ? 0 : value.getMinutes(),
        dateOnly ? 0 : value.getSeconds(),
        0
      );
    }

    const source = String(value).trim();
    const iso = source.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);

    if (iso) {
      return new Date(
        Number(iso[1]),
        Number(iso[2]) - 1,
        Number(iso[3]),
        dateOnly ? 12 : Number(iso[4] || 0),
        dateOnly ? 0 : Number(iso[5] || 0),
        dateOnly ? 0 : Number(iso[6] || 0),
        0
      );
    }

    const dmy = source.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);

    if (dmy) {
      let year = Number(dmy[3]);
      if (year < 100) year += 2000;

      return new Date(
        year,
        Number(dmy[2]) - 1,
        Number(dmy[1]),
        dateOnly ? 12 : Number(dmy[4] || 0),
        dateOnly ? 0 : Number(dmy[5] || 0),
        dateOnly ? 0 : Number(dmy[6] || 0),
        0
      );
    }

    const fallback = new Date(source);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  };

  AVEVA.usageMap = (sourceRows, sourceFile) => {
    return sourceRows
      .map((row) => ({
        email: AVEVA.text(row['Column1.user']).toLowerCase(),
        service: AVEVA.text(row['Column1.service']) || 'Unknown',
        start: AVEVA.parseExcelDate(row['Column1.session start time']),
        end: AVEVA.parseExcelDate(row['Column1.session end time']),
        minutes: AVEVA.num(row.Minutes || row.Minute),
        hours: AVEVA.num(row.Hour) || AVEVA.num(row.Minutes || row.Minute) / 60,
        source: sourceFile
      }))
      .filter((row) => row.email && row.service && row.start);
  };

  AVEVA.txMap = (sourceRows, sourceFile, sourceSheet, offset = 0) => {
    return sourceRows
      .map((row, index) => {
        const transactionDate = AVEVA.parseExcelDate(
          row['Column1.transaction date'],
          true
        );

        return {
          date: transactionDate,
          product: AVEVA.text(row['Column1.productName']) || 'Unknown',
          user: AVEVA.text(row['Column1.user']).toLowerCase(),
          units: AVEVA.num(row['Column1.units']),
          description: AVEVA.text(row['Column1.description']),
          token: AVEVA.nullableNum(
            row['Column1.Token'] ?? row['Column1.value']
          ),
          agreementId: AVEVA.text(row['Column1.creditsAgreementID']),
          balanceTotal: AVEVA.nullableNum(row['Column1.balance_Total']),
          balanceCloud: AVEVA.nullableNum(row['Column1.balance_cloud']),
          balanceOnPremises: AVEVA.nullableNum(
            row['Column1.balance_onpremises']
          ),
          balanceUniversal: AVEVA.nullableNum(
            row['Column1.balance_universal']
          ),
          source: sourceFile,
          sourceSheet,
          sourceRow: index + 2,
          sourceOrder: offset + index
        };
      })
      .filter(
        (row) =>
          row.date &&
          !Number.isNaN(row.date.getTime()) &&
          row.token !== null &&
          row.agreementId
      );
  };

  /* Burndown Export mixes US date strings with Excel serial dates that were
     locale-swapped during export. String dates are M/D/Y; serial dates need
     their parsed month/day reversed for this specific AVEVA export format. */
  AVEVA.parseBurndownDate = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      const parsed = XLSX.SSF.parse_date_code(value);
      if (!parsed || parsed.d > 12) return null;
      return new Date(parsed.y, parsed.d - 1, parsed.m, parsed.H || 0, parsed.M || 0, Math.floor(parsed.S || 0));
    }
    const match = AVEVA.text(value).match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i
    );
    if (!match) return AVEVA.parseExcelDate(value);
    let hour = Number(match[4]) % 12;
    if (match[6].toUpperCase() === 'PM') hour += 12;
    return new Date(Number(match[3]), Number(match[1]) - 1, Number(match[2]), hour, Number(match[5]), 0);
  };

  AVEVA.burndownMap = (sourceRows, sourceFile) => sourceRows
    .map((row, index) => ({
      date: AVEVA.parseBurndownDate(row.Date),
      service: AVEVA.text(row['Service / Transaction']) || 'Unknown',
      units: AVEVA.nullableNum(row.Units),
      description: AVEVA.text(row.Description),
      token: AVEVA.nullableNum(row.Value),
      balance: AVEVA.nullableNum(row.Balance),
      source: sourceFile,
      sourceOrder: index
    }))
    .filter((row) => row.date && !Number.isNaN(row.date.getTime()) && row.token !== null && row.balance !== null);

  AVEVA.empMap = (sourceRows) => {
    return sourceRows
      .map((row) => ({
        name: AVEVA.text(row.FullName),
        email: AVEVA.text(row['Aveva Connect ID']).toLowerCase(),
        emailAD: AVEVA.text(row['Aveva Connect ID']).toLowerCase(),
        username: AVEVA.text(row.User).toLowerCase(),
        // Management mapping: source Dept -> internal department -> UI label CDC.
        department: AVEVA.text(row.Dept) || 'Unknown',
        costCentre: AVEVA.text(row.CostCentre) || 'Unknown',
        company: AVEVA.text(row.Company) || 'Unknown'
      }))
      .filter((employee) => employee.email || employee.username);
  };


  AVEVA.engineerHourMap = (sourceRows) => {
    const monthNumbers = {
      jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
      apr: 4, april: 4, may: 5, jun: 6, june: 6,
      jul: 7, july: 7, aug: 8, august: 8, sep: 9, september: 9,
      oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12
    };

    const dayValue = (row, day) => {
      const candidates = [
        String(day),
        `${day}.0`,
        `Day ${day}`,
        `Day ${day}.0`
      ];
      for (const key of candidates) {
        if (Object.prototype.hasOwnProperty.call(row, key)) {
          return AVEVA.nullableNum(row[key]);
        }
      }
      return null;
    };

    return sourceRows
      .filter((row) => AVEVA.text(row['Record Type']).toLowerCase() === 'resource')
      .map((row) => {
        const year = AVEVA.nullableNum(row.Year);
        const monthText = AVEVA.text(row.Month).toLowerCase();
        let month = AVEVA.nullableNum(row.Month) || monthNumbers[monthText] || null;
        if ((!year || !month) && AVEVA.text(row['Month / Year'])) {
          const match = AVEVA.text(row['Month / Year']).match(/^([A-Za-z]+)\s+(\d{4})$/);
          if (match) month = month || monthNumbers[match[1].toLowerCase()] || null;
        }
        const parsedYear = year || (() => {
          const match = AVEVA.text(row['Month / Year']).match(/(\d{4})$/);
          return match ? Number(match[1]) : null;
        })();
        if (!parsedYear || !month || month < 1 || month > 12) return null;

        const daysInMonth = new Date(parsedYear, month, 0).getDate();
        const dailyHours = Array(32).fill(null);
        let monthHours = 0;
        let hasDailyData = false;
        for (let day = 1; day <= daysInMonth; day += 1) {
          const value = dayValue(row, day);
          dailyHours[day] = value;
          if (value !== null) {
            monthHours += value;
            hasDailyData = true;
          }
        }

        return {
          year: Number(parsedYear),
          month: Number(month),
          badgeCode: AVEVA.text(row['Badge Code']),
          alphaName: AVEVA.text(row['Alpha Name']),
          groupCode: AVEVA.text(row['Group Code']),
          groupName: AVEVA.text(row['Group Name']),
          recordType: 'Resource',
          dailyHours,
          monthHours: hasDailyData ? monthHours : 0
        };
      })
      .filter(Boolean);
  };

  AVEVA.planHourMap = (sourceRows) => {
    const monthNumbers = {
      jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
      apr: 4, april: 4, may: 5, jun: 6, june: 6,
      jul: 7, july: 7, aug: 8, august: 8, sep: 9, september: 9,
      oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12
    };
    const legacyMonths = [4, 5, 6, 7];

    return sourceRows.flatMap((row) => {
      const projectMonth = AVEVA.text(row['Project / Month']);
      const projectMonthMatch = projectMonth.match(/^(.+?)\s*-\s*([A-Za-z]+)\s+(\d{4})$/);
      if (projectMonthMatch) {
        const project = projectMonthMatch[1].trim().toUpperCase();
        const month = monthNumbers[projectMonthMatch[2].toLowerCase()] || null;
        const year = Number(projectMonthMatch[3]);
        const yearHours = AVEVA.nullableNum(row['Plan Hour / year (Team)']);
        const monthHours = AVEVA.nullableNum(row['Plan Hour / month (Team)']);
        if (!project || !month || !year || yearHours === null || monthHours === null) return [];

        const daysInMonth = new Date(year, month, 0).getDate();
        const dailyHours = Array(32).fill(null);
        for (let day = 1; day <= daysInMonth; day += 1) {
          // nullableNum preserves a real zero while keeping blank cells absent.
          dailyHours[day] = AVEVA.nullableNum(row[`Plan Hour / Day ${day}`]);
        }

        return [{
          project,
          year,
          month,
          yearHours,
          monthHours,
          dailyHours,
          hours: monthHours,
          company: '',
          department: '',
          dataType: 'Team Plan',
          planFormat: 'team-month'
        }];
      }

      const project = AVEVA.text(row.Project ?? row['Project ']);
      const hours = AVEVA.nullableNum(row['Plan Hour']);
      if (!project || hours === null || hours < 0) return [];

      const year = AVEVA.nullableNum(row.Year);
      const rawMonth = AVEVA.text(row.Month).toLowerCase();
      const month = AVEVA.nullableNum(row.Month) || monthNumbers[rawMonth] || null;
      const day = AVEVA.nullableNum(row.Day);
      const companyValue = AVEVA.text(row.Company);
      const departmentValue = AVEVA.text(row.Department ?? row.Dept);
      const company = /^all$/i.test(companyValue) ? '' : companyValue;
      const department = /^all$/i.test(departmentValue) ? '' : departmentValue;

      if (year && month >= 1 && month <= 12) {
        return [{ project, year, month, day, company, department, hours, dataType: AVEVA.text(row['Data Type']) || 'Plan', planFormat: 'legacy' }];
      }

      return legacyMonths.map((legacyMonth) => ({
        project,
        year: 2026,
        month: legacyMonth,
        company: '',
        department: '',
        hours: hours / legacyMonths.length,
        dataType: 'Dummy',
        planFormat: 'legacy'
      }));
    });
  };

  AVEVA.planHoursForFilters = (rows, filters) => {
    const matching = rows.filter((row) =>
      (!filters.year || String(row.year) === String(filters.year)) &&
      (!filters.month || String(row.month) === String(filters.month)) &&
      (!filters.company || row.company === filters.company) &&
      (!filters.department || row.department === filters.department)
    );
    const teamPlans = matching.filter((row) => row.planFormat === 'team-month');
    if (!teamPlans.length) {
      return matching.reduce((sum, row) => sum + AVEVA.num(row.hours), 0);
    }
    if (filters.month) {
      return teamPlans.reduce((sum, row) => sum + AVEVA.num(row.monthHours), 0);
    }

    // Year values repeat on all twelve monthly rows. Count each Project + Year once.
    const uniqueProjectYears = new Map();
    teamPlans.forEach((row) => {
      uniqueProjectYears.set(`${row.project}|${row.year}`, AVEVA.num(row.yearHours));
    });
    return [...uniqueProjectYears.values()].reduce((sum, hours) => sum + hours, 0);
  };

  AVEVA.enrichUsageData = () => {
    const employeeMap = new Map();

    AVEVA.data.employees.forEach((employee) => {
      [employee.email, employee.emailAD, employee.username]
        .filter(Boolean)
        .forEach((email) => {
          if (!employeeMap.has(email)) {
            employeeMap.set(email, employee);
          }
        });
    });

    return AVEVA.data.usage.map((row) => {
      const employee = employeeMap.get(row.email);
      const date = row.start instanceof Date ? row.start : new Date(row.start);

      return {
        ...row,
        name: employee?.name || row.email,
        department: employee?.department || 'Unknown',
        costCentre: employee?.costCentre || 'Unknown',
        company: employee?.company || 'Unknown',
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        period: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      };
    });
  };
})();
