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

  AVEVA.empMap = (sourceRows) => {
    return sourceRows
      .map((row) => ({
        name: AVEVA.text(row['Full Name']),
        email: AVEVA.text(row.Email).toLowerCase(),
        emailAD: AVEVA.text(row['Email (AD)']).toLowerCase(),
        department: AVEVA.text(row.Department) || 'Unknown',
        company: AVEVA.text(row.Company) || 'Unknown'
      }))
      .filter((employee) => employee.email || employee.emailAD);
  };

  AVEVA.enrichUsageData = () => {
    const employeeMap = new Map();

    AVEVA.data.employees.forEach((employee) => {
      [employee.email, employee.emailAD]
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
        company: employee?.company || 'Unknown',
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        period: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      };
    });
  };
})();
