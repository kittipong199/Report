(() => {
  'use strict';

  /* ==========================================================
     TABLE ENGINE

     หน้าที่:
     - รวม Usage ตาม Email + Service + Period
     - เรียงจาก Hours มากไปน้อย
     - แสดงสูงสุด 500 รายการ

     HTML Target:
     #tbody

     Columns:
     Name, Email, Service, Department, Company,
     Period, Hours, Sessions
  ========================================================== */

  const AVEVA = window.AVEVA;

  // Escape เพื่อป้องกันข้อความจาก Excel ถูกตีความเป็น HTML
  AVEVA.escapeHtml = (value) => {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  AVEVA.renderUsageTable = (rows) => {
    const grouped = new Map();

    rows.forEach((row) => {
      const key = [row.email, row.service, row.period].join('|');
      const summary = grouped.get(key) || {
        ...row,
        hours: 0,
        sessions: 0
      };

      summary.hours += row.hours;
      summary.sessions += 1;
      grouped.set(key, summary);
    });

    AVEVA.$('tbody').innerHTML = [...grouped.values()]
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 500)
      .map(
        (row) => `
          <tr>
            <td>${AVEVA.escapeHtml(row.name)}</td>
            <td>${AVEVA.escapeHtml(row.email)}</td>
            <td>${AVEVA.escapeHtml(row.service)}</td>
            <td>${AVEVA.escapeHtml(row.department)}</td>
            <td>${AVEVA.escapeHtml(row.company)}</td>
            <td>${AVEVA.escapeHtml(row.period)}</td>
            <td>${AVEVA.fmt(row.hours)}</td>
            <td>${row.sessions}</td>
          </tr>`
      )
      .join('');
  };
})();
