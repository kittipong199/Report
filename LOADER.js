(() => {
  'use strict';

  /* ==========================================================
     EXCEL LOADER

     หน้าที่:
     - ตรวจชื่อ Source 5 ไฟล์
     - เปิด Workbook ด้วย XLSX
     - ตรวจชื่อ Sheet ตามเงื่อนไข V17 เดิม
     - เรียก mapper.js เพื่อแปลงข้อมูล
     - เก็บข้อมูลใน AVEVA.data
     - เรียก buildDashboard() เพื่อส่งผลไปยัง HTML

     HTML ที่ส่งสถานะไปแสดง:
     #status
  ========================================================== */

  const AVEVA = window.AVEVA;

  AVEVA.FILE_PATTERNS = {
    credit2025: /data master source credit transactions\s+2025/i,
    credit2026: /data master source credit transactions\s+2026/i,
    usage2025: /data master source user usage 2025/i,
    usage2026: /data master source user usage 2026/i,
    employees: /employees_2026/i
  };

  AVEVA.readWorkbook = async (file) => {
    return XLSX.read(await file.arrayBuffer(), {
      type: 'array',
      // เก็บ Excel Date เป็น Serial Number แล้วให้ mapper.js แปลงเอง
      // เพื่อป้องกันวันที่ 01 ของเดือนเลื่อนไปเดือนก่อนจาก Timezone
      cellDates: false
    });
  };

  AVEVA.readRows = (workbook, sheetName) => {
    return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      defval: '',
      raw: true
    });
  };

  AVEVA.findSheet = (workbook, expectedNames) => {
    for (const expectedName of expectedNames) {
      const actualName = workbook.SheetNames.find(
        (sheetName) => AVEVA.norm(sheetName) === AVEVA.norm(expectedName)
      );

      if (actualName) {
        return actualName;
      }
    }

    return null;
  };

  AVEVA.loadFiles = async (selectedFiles) => {
    AVEVA.$('status').textContent =
      `${AVEVA.BUILD_ID} | กำลังอ่าน Source 5 ไฟล์...`;

    const matchedFiles = {};

    // ตรวจและจับคู่ไฟล์จากชื่อไฟล์ โดยคง Pattern เดิม
    for (const file of selectedFiles) {
      for (const [key, pattern] of Object.entries(AVEVA.FILE_PATTERNS)) {
        if (pattern.test(file.name)) {
          matchedFiles[key] = file;
        }
      }
    }

    const missingFiles = Object.keys(AVEVA.FILE_PATTERNS).filter(
      (key) => !matchedFiles[key]
    );

    if (missingFiles.length) {
      throw new Error(`ไม่พบไฟล์: ${missingFiles.join(', ')}`);
    }

    const [credit2025, credit2026, usage2025, usage2026, employeeWorkbook] =
      await Promise.all([
        AVEVA.readWorkbook(matchedFiles.credit2025),
        AVEVA.readWorkbook(matchedFiles.credit2026),
        AVEVA.readWorkbook(matchedFiles.usage2025),
        AVEVA.readWorkbook(matchedFiles.usage2026),
        AVEVA.readWorkbook(matchedFiles.employees)
      ]);

    const credit2025Sheets = [
      'credit transactions2025-(1-6)',
      'credit transactions2025-(7-12)'
    ]
      .map((name) => AVEVA.findSheet(credit2025, [name]))
      .filter(Boolean);

    const credit2026Sheet = AVEVA.findSheet(credit2026, [
      'credit transactions2026-(1-8)'
    ]);

    const usage2025Sheets = [
      'Source user usage2025(1-6)',
      'Source user usage2025(7-12)'
    ]
      .map((name) => AVEVA.findSheet(usage2025, [name]))
      .filter(Boolean);

    const usage2026Sheet = AVEVA.findSheet(usage2026, [
      'Source user usage2026(1-7)'
    ]);

    const employeeSheet = AVEVA.findSheet(employeeWorkbook, ['Employees']);
    const validationErrors = [];

    if (credit2025Sheets.length !== 2) {
      validationErrors.push(
        'Credit 2025: ต้องมี "credit transactions2025-(1-6)" และ ' +
          '"credit transactions2025-(7-12)" | มี: ' +
          credit2025.SheetNames.join(' | ')
      );
    }

    if (!credit2026Sheet) {
      validationErrors.push(
        'Credit 2026: ไม่พบ "credit transactions2026-(1-8)" | มี: ' +
          credit2026.SheetNames.join(' | ')
      );
    }

    if (usage2025Sheets.length !== 2) {
      validationErrors.push(
        'Usage 2025: ต้องมี "Source user usage2025(1-6)" และ ' +
          '"Source user usage2025(7-12)" | มี: ' +
          usage2025.SheetNames.join(' | ')
      );
    }

    if (!usage2026Sheet) {
      validationErrors.push(
        'Usage 2026: ไม่พบ "Source user usage2026(1-7)" | มี: ' +
          usage2026.SheetNames.join(' | ')
      );
    }

    if (!employeeSheet) {
      validationErrors.push(
        'Employee: ไม่พบ "Employees" | มี: ' +
          employeeWorkbook.SheetNames.join(' | ')
      );
    }

    if (validationErrors.length) {
      throw new Error(
        `${AVEVA.BUILD_ID} | V17 Sheet validation failed | ` +
          validationErrors.join(' || ')
      );
    }

    // รวม Credit Transaction 2025 และ 2026 โดยคง sourceOrder เดิม
    AVEVA.data.tx = [];
    let transactionOffset = 0;

    for (const sheetName of credit2025Sheets) {
      const mapped = AVEVA.txMap(
        AVEVA.readRows(credit2025, sheetName),
        matchedFiles.credit2025.name,
        sheetName,
        transactionOffset
      );

      AVEVA.data.tx.push(...mapped);
      transactionOffset += mapped.length;
    }

    const credit2026Rows = AVEVA.txMap(
      AVEVA.readRows(credit2026, credit2026Sheet),
      matchedFiles.credit2026.name,
      credit2026Sheet,
      transactionOffset
    );

    AVEVA.data.tx.push(...credit2026Rows);

    // รวม Usage 2025 และ 2026
    AVEVA.data.usage = [
      ...usage2025Sheets.flatMap((sheetName) =>
        AVEVA.usageMap(
          AVEVA.readRows(usage2025, sheetName),
          matchedFiles.usage2025.name
        )
      ),
      ...AVEVA.usageMap(
        AVEVA.readRows(usage2026, usage2026Sheet),
        matchedFiles.usage2026.name
      )
    ];

    AVEVA.data.employees = AVEVA.empMap(
      AVEVA.readRows(employeeWorkbook, employeeSheet)
    );

    AVEVA.buildDashboard();

    AVEVA.$('status').textContent =
      `${AVEVA.BUILD_ID} | โหลดสำเร็จ: ` +
      `Usage ${AVEVA.data.usage.length.toLocaleString()} | ` +
      `Transactions ${AVEVA.data.tx.length.toLocaleString()} | ` +
      `Employees ${AVEVA.data.employees.length.toLocaleString()}`;
  };
})();
