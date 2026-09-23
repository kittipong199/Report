/* CONNECTS: Reads five core Excel files plus optional Burndown Forecast, calls mapper.js, then rebuilds the dashboard. */
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
    mapping: /(?:aveva|aviva|roi)\s*mapping/i,
    burndown: /burndown\s*forecast/i
  };
  AVEVA.REQUIRED_FILE_KEYS = ['credit2025', 'credit2026', 'usage2025', 'usage2026', 'mapping'];
  AVEVA.AUTO_SOURCE_PATHS = {
    credit2025: ['Data/Data Master Source credit transactions  2025.xlsx'],
    credit2026: ['Data/Data Master Source credit transactions  2026.xlsx'],
    usage2025: ['Data/Data Master Source user usage 2025.xlsx'],
    usage2026: ['Data/Data Master Source user usage 2026.xlsx'],
    mapping: ['Data/AvevaMapping (2).xlsx', 'Data/AvevaMapping (1).xlsx', 'Data/AvevaMapping.xlsx'],
    burndown: ['Data/Burndown Forecast from 8_15_2026 to 9_15_2026 (Time period in UTC is August 15, 2026 9_03 AM to September 15, 2026 9_03 AM).xlsx']
  };

  AVEVA.fetchSourceFile = async (path) => {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${response.status} ${path}`);
    const blob = await response.blob();
    return new File([blob], decodeURIComponent(path.split('/').pop()), {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
  };

  AVEVA.getEmbeddedSourceFiles = () => {
    const entries = window.AVEVA_EMBEDDED_DATA?.files;
    if (!Array.isArray(entries) || !entries.length) return [];

    return entries.map(({ name, base64 }) => {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return new File([bytes], name, {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
    });
  };

  AVEVA.loadEmbeddedData = async () => {
    const files = AVEVA.getEmbeddedSourceFiles();
    if (!files.length) throw new Error('Portable embedded Excel data is unavailable');
    await AVEVA.loadFiles(files);
    AVEVA.$('status').textContent = `AUTO EMBEDDED | ${AVEVA.$('status').textContent}`;
  };

  AVEVA.autoLoadData = async () => {
    const forceEmbedded = new URLSearchParams(location.search).get('dataSource') === 'embedded';
    if (location.protocol === 'file:' || forceEmbedded) {
      await AVEVA.loadEmbeddedData();
      return;
    }

    const files = [];
    for (const [key, candidates] of Object.entries(AVEVA.AUTO_SOURCE_PATHS)) {
      let loaded = null;
      for (const candidate of candidates) {
        try {
          loaded = await AVEVA.fetchSourceFile(candidate);
          break;
        } catch (error) {
          console.debug(`[AVEVA] Auto source candidate unavailable (${key})`, error);
        }
      }
      if (loaded) files.push(loaded);
      else if (AVEVA.REQUIRED_FILE_KEYS.includes(key)) break;
    }
    const matchedRequired = files.filter((file) =>
      AVEVA.REQUIRED_FILE_KEYS.some((key) => AVEVA.FILE_PATTERNS[key].test(file.name))
    );
    if (matchedRequired.length !== AVEVA.REQUIRED_FILE_KEYS.length) {
      console.info('[AVEVA] /Data/ sources unavailable; using portable embedded data');
      await AVEVA.loadEmbeddedData();
      return;
    }
    await AVEVA.loadFiles(files);
    AVEVA.$('status').textContent = `AUTO /Data/ | ${AVEVA.$('status').textContent}`;
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

  // ชื่อชีตรายเดือนจะเปลี่ยนจาก (1-7) เป็น (1-8), (1-9), ...
  // จึงจับคู่จากชนิดข้อมูลและปีแทนการล็อกเดือนสุดท้ายไว้ในโค้ด
  AVEVA.findPeriodSheets = (workbook, type, year) => {
    const prefix = type === 'credit'
      ? `credittransactions${year}-`
      : `sourceuserusage${year}`;
    const periodPattern = new RegExp(
      `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\((\\d{1,2})-(\\d{1,2})\\)$`
    );

    return workbook.SheetNames
      .map((sheetName) => {
        const match = AVEVA.norm(sheetName).match(periodPattern);
        if (!match) return null;

        const startMonth = Number(match[1]);
        const endMonth = Number(match[2]);
        if (
          startMonth < 1 ||
          startMonth > 12 ||
          endMonth < 1 ||
          endMonth > 12 ||
          startMonth > endMonth
        ) {
          return null;
        }

        return { sheetName, startMonth, endMonth };
      })
      .filter(Boolean)
      .sort(
        (a, b) =>
          a.startMonth - b.startMonth || a.endMonth - b.endMonth
      )
      .map(({ sheetName }) => sheetName);
  };

  AVEVA.loadFiles = async (selectedFiles) => {
    AVEVA.$('status').textContent =
      `${AVEVA.BUILD_ID} | ${AVEVA.t('loading')}`;

    const matchedFiles = {};

    // ตรวจและจับคู่ไฟล์จากชื่อไฟล์ โดยคง Pattern เดิม
    for (const file of selectedFiles) {
      for (const [key, pattern] of Object.entries(AVEVA.FILE_PATTERNS)) {
        if (pattern.test(file.name)) {
          if (matchedFiles[key]) {
            throw new Error(
              `Duplicate ${key} files: ${matchedFiles[key].name} | ${file.name}`
            );
          }
          matchedFiles[key] = file;
        }
      }
    }

    const missingFiles = AVEVA.REQUIRED_FILE_KEYS.filter(
      (key) => !matchedFiles[key]
    );

    if (missingFiles.length) {
      throw new Error(`Missing files: ${missingFiles.join(', ')}`);
    }

    const [credit2025, credit2026, usage2025, usage2026, mappingWorkbook, burndownWorkbook] =
      await Promise.all([
        AVEVA.readWorkbook(matchedFiles.credit2025),
        AVEVA.readWorkbook(matchedFiles.credit2026),
        AVEVA.readWorkbook(matchedFiles.usage2025),
        AVEVA.readWorkbook(matchedFiles.usage2026),
        AVEVA.readWorkbook(matchedFiles.mapping),
        matchedFiles.burndown ? AVEVA.readWorkbook(matchedFiles.burndown) : Promise.resolve(null)
      ]);

    const credit2025Sheets = AVEVA.findPeriodSheets(
      credit2025,
      'credit',
      2025
    );
    const credit2026Sheets = AVEVA.findPeriodSheets(
      credit2026,
      'credit',
      2026
    );
    const usage2025Sheets = AVEVA.findPeriodSheets(usage2025, 'usage', 2025);
    const usage2026Sheets = AVEVA.findPeriodSheets(usage2026, 'usage', 2026);

    const mappingUserSheet = AVEVA.findSheet(mappingWorkbook, ['name AD']);
    const mappingPlanHourSheet = AVEVA.findSheet(mappingWorkbook, ['Plan Hour']);
    const mappingEngineerHourSheet = AVEVA.findSheet(mappingWorkbook, ['H_Employee']);
    const validationErrors = [];

    if (!credit2025Sheets.length) {
      validationErrors.push(
        'Credit 2025: expected sheet "credit transactions2025-(start month-end month)" was not found | Available: ' +
          credit2025.SheetNames.join(' | ')
      );
    }

    if (!credit2026Sheets.length) {
      validationErrors.push(
        'Credit 2026: expected sheet "credit transactions2026-(start month-end month)" was not found | Available: ' +
          credit2026.SheetNames.join(' | ')
      );
    }

    if (!usage2025Sheets.length) {
      validationErrors.push(
        'Usage 2025: expected sheet "Source user usage2025(start month-end month)" was not found | Available: ' +
          usage2025.SheetNames.join(' | ')
      );
    }

    if (!usage2026Sheets.length) {
      validationErrors.push(
        'Usage 2026: expected sheet "Source user usage2026(start month-end month)" was not found | Available: ' +
          usage2026.SheetNames.join(' | ')
      );
    }

    if (!mappingUserSheet) {
      validationErrors.push(
        'AVEVA Mapping: required sheet "name AD" was not found | Available: ' +
          mappingWorkbook.SheetNames.join(' | ')
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

    for (const sheetName of credit2026Sheets) {
      const mapped = AVEVA.txMap(
        AVEVA.readRows(credit2026, sheetName),
        matchedFiles.credit2026.name,
        sheetName,
        transactionOffset
      );

      AVEVA.data.tx.push(...mapped);
      transactionOffset += mapped.length;
    }

    // รวม Usage 2025 และ 2026
    AVEVA.data.usage = [
      ...usage2025Sheets.flatMap((sheetName) =>
        AVEVA.usageMap(
          AVEVA.readRows(usage2025, sheetName),
          matchedFiles.usage2025.name
        )
      ),
      ...usage2026Sheets.flatMap((sheetName) =>
        AVEVA.usageMap(
          AVEVA.readRows(usage2026, sheetName),
          matchedFiles.usage2026.name
        )
      )
    ];

    AVEVA.data.employees = AVEVA.empMap(
      AVEVA.readRows(mappingWorkbook, mappingUserSheet)
    );
    AVEVA.data.planHours = mappingPlanHourSheet
      ? AVEVA.planHourMap(AVEVA.readRows(mappingWorkbook, mappingPlanHourSheet))
      : [];
    AVEVA.data.engineerHours = mappingEngineerHourSheet
      ? AVEVA.engineerHourMap(AVEVA.readRows(mappingWorkbook, mappingEngineerHourSheet))
      : [];

    // Global management rule: ICT must not appear in report-facing data.
    // Resolve ICT identities from the authoritative name AD mapping and remove
    // their usage/credit rows before any cards, charts, tables or filters build.
    const isICTDepartment = (value) => AVEVA.norm(value) === 'ict';
    const ictEmployees = AVEVA.data.employees.filter((employee) => isICTDepartment(employee.department));
    const ictIdentities = new Set();
    const ictNames = new Set();
    ictEmployees.forEach((employee) => {
      [employee.email, employee.emailAD, employee.username]
        .map((value) => AVEVA.text(value).toLowerCase())
        .filter(Boolean)
        .forEach((identity) => ictIdentities.add(identity));
      if (employee.name) ictNames.add(AVEVA.norm(employee.name));
    });

    if (ictEmployees.length) {
      const before = {
        usage: AVEVA.data.usage.length,
        tx: AVEVA.data.tx.length,
        employees: AVEVA.data.employees.length,
        planHours: AVEVA.data.planHours.length,
        engineerHours: AVEVA.data.engineerHours.length
      };
      AVEVA.data.usage = AVEVA.data.usage.filter((row) => !ictIdentities.has(AVEVA.text(row.email).toLowerCase()));
      AVEVA.data.tx = AVEVA.data.tx.filter((row) => !ictIdentities.has(AVEVA.text(row.user).toLowerCase()));
      AVEVA.data.employees = AVEVA.data.employees.filter((employee) => !isICTDepartment(employee.department));
      AVEVA.data.planHours = AVEVA.data.planHours.filter((row) => !isICTDepartment(row.department));
      AVEVA.data.engineerHours = AVEVA.data.engineerHours.filter((row) => !ictNames.has(AVEVA.norm(row.alphaName)));
      console.info('[AVEVA] ICT exclusion applied', {
        ictEmployees: ictEmployees.length,
        removedUsage: before.usage - AVEVA.data.usage.length,
        removedTransactions: before.tx - AVEVA.data.tx.length,
        removedEmployees: before.employees - AVEVA.data.employees.length,
        removedPlanRows: before.planHours - AVEVA.data.planHours.length,
        removedEngineerRows: before.engineerHours - AVEVA.data.engineerHours.length
      });
    }

    if (burndownWorkbook) {
      const burndownRows = AVEVA.readRows(burndownWorkbook, burndownWorkbook.SheetNames[0]);
      const requiredBurndownColumns = ['Date', 'Service / Transaction', 'Units', 'Description', 'Value', 'Balance'];
      const availableColumns = new Set(Object.keys(burndownRows[0] || {}));
      const missingBurndownColumns = requiredBurndownColumns.filter((column) => !availableColumns.has(column));
      if (missingBurndownColumns.length) {
        throw new Error(`Invalid Burndown Excel: missing column '${missingBurndownColumns.join("', '")}'`);
      }
      AVEVA.data.burndown = AVEVA.burndownMap(burndownRows, matchedFiles.burndown.name);
    } else {
      AVEVA.data.burndown = [];
    }

    AVEVA.buildDashboard();

    AVEVA.updateLoadedStatus = () => {
      AVEVA.$('status').textContent =
      `${AVEVA.BUILD_ID} | ${AVEVA.t('loaded')}: ` +
      `Usage ${AVEVA.data.usage.length.toLocaleString()} | ` +
      `Transactions ${AVEVA.data.tx.length.toLocaleString()} | ` +
      `AVEVA Users ${AVEVA.data.employees.length.toLocaleString()} | ` +
      `Plan Hours ${AVEVA.data.planHours.reduce((sum, row) => sum + row.hours, 0).toLocaleString()} | ` +
      `Engineer Resources ${AVEVA.data.engineerHours.length.toLocaleString()} | ` +
      `Burndown ${AVEVA.data.burndown.length.toLocaleString()}`;
    };

    AVEVA.updateLoadedStatus();
  };
})();
