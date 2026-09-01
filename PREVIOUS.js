(() => {
  'use strict';

  /* ==========================================================
     PREVIOUS MONTH TOKEN ADD-ON

     หน้าที่:
     - เพิ่ม Logic สำหรับการ์ด "ใช้ Token เดือนที่แล้ว" เท่านั้น
     - ไม่แก้ไข governance-engine.js เดิม
     - ไม่แก้ไข 3 การ์ดที่ล็อกไว้:
       #totalTokens, #balance, #currentTokens

     Business Rule:
     - เมื่อเลือก Year + Month เช่น 2026 / 8
       Previous Period = 2026-07
     - Previous Token = COUNT(Column1.Token ของ Previous Period) x 13
     - รองรับการข้ามปี เช่น 2026 / 1 -> 2025-12

     Output ที่แก้เฉพาะ:
     - governance.prev -> #previousPeriod
     - governance.pv   -> #previousTokens
     - governance.mom  -> #mom
  ========================================================== */

  const AVEVA = window.AVEVA;
  const TOKEN_PER_TRANSACTION = 13;
  const ADDON_BUILD = 'V17-PREVIOUS-MONTH-COUNT-X13-20260831-01';

  if (!AVEVA || typeof AVEVA.calcGov !== 'function') {
    throw new Error(
      '[AVEVA] previous-month.js ต้องโหลดหลัง governance-engine.js'
    );
  }

  // เก็บ Governance Function เดิมไว้ โดยไม่แก้โค้ดภายในไฟล์เดิม
  const originalCalcGov = AVEVA.calcGov;

  /**
   * คืนค่า Year / Month ก่อนหน้าจาก Filter ปัจจุบัน
   * ตัวอย่าง:
   * 2026 / 8 -> 2026 / 7
   * 2026 / 1 -> 2025 / 12
   */
  const getPreviousYearMonth = (year, month) => {
    const previousDate = new Date(year, month - 2, 1, 12, 0, 0, 0);

    return {
      year: previousDate.getFullYear(),
      month: previousDate.getMonth() + 1,
      period: `${previousDate.getFullYear()}-${String(
        previousDate.getMonth() + 1
      ).padStart(2, '0')}`
    };
  };

  /**
   * นับ Row ของ Column1.Token ใน Previous Period
   * txMap ได้คัด Row ที่ token เป็น null ออกแล้ว
   * แต่ยังตรวจซ้ำเพื่อให้เงื่อนไขชัดเจน
   */
  const calculatePreviousMonthToken = (year, month) => {
    const previous = getPreviousYearMonth(year, month);

    const rows = AVEVA.data.tx.filter((row) => {
      return (
        row.agreementId === AVEVA.ACTIVE_AGREEMENT &&
        row.token !== null &&
        Number.isFinite(row.token) &&
        row.date instanceof Date &&
        !Number.isNaN(row.date.getTime()) &&
        row.date.getFullYear() === previous.year &&
        row.date.getMonth() + 1 === previous.month
      );
    });

    return {
      period: previous.period,
      count: rows.length,
      token: rows.length * TOKEN_PER_TRANSACTION
    };
  };

  /**
   * Wrapper ของ calcGov เดิม
   * เรียก Logic เดิมทั้งหมดก่อน แล้ว Override เฉพาะ prev, pv และ mom
   */
  AVEVA.calcGov = () => {
    const governance = originalCalcGov();
    const selectedYear = Number(AVEVA.$('fYear').value);
    const selectedMonth = Number(AVEVA.$('fMonth').value);

    // ใช้ Add-on เฉพาะเมื่อเลือกทั้ง Year และ Month
    if (!selectedYear || !selectedMonth) {
      return governance;
    }

    const previousMonth = calculatePreviousMonthToken(
      selectedYear,
      selectedMonth
    );

    // Current value ใช้ค่าที่ Governance เดิมคำนวณไว้
    // ห้ามคำนวณซ้ำหรือแก้ไข #currentTokens
    const currentValue = governance.cv;

    const monthOverMonth =
      previousMonth.token > 0 && currentValue !== null
        ? ((currentValue - previousMonth.token) / previousMonth.token) * 100
        : null;

    console.log('[AVEVA] Previous Month Token Add-on', {
      build: ADDON_BUILD,
      selectedYear,
      selectedMonth,
      previousPeriod: previousMonth.period,
      previousTokenRowCount: previousMonth.count,
      tokenPerTransaction: TOKEN_PER_TRANSACTION,
      previousMonthToken: previousMonth.token,
      currentMonthTokenUnchanged: currentValue,
      monthOverMonth
    });

    return {
      ...governance,

      // แก้เฉพาะการ์ดเดือนที่แล้วและเปอร์เซ็นต์เปรียบเทียบ
      prev: previousMonth.period,
      pv: previousMonth.token,
      mom: monthOverMonth
    };
  };

  console.info('[AVEVA] Previous Month Add-on', ADDON_BUILD);
})();
