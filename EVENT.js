(() => {
  'use strict';

  /* ==========================================================
     EVENT REGISTRATION

     หน้าที่:
     - เชื่อมปุ่มและ Filter ใน HTML กับ JavaScript

     HTML Controls:
     #loadBtn -> เปิด File Picker #files
     #files   -> โหลด Source 5 ไฟล์
     .filters select -> Render Dashboard เมื่อ Filter เปลี่ยน
     #reset   -> ล้าง Filter แล้ว Render ใหม่
  ========================================================== */

  const AVEVA = window.AVEVA;

  const registerEvents = () => {
    AVEVA.$('loadBtn').onclick = () => AVEVA.$('files').click();

    AVEVA.$('files').onchange = (event) => {
      AVEVA.loadFiles([...event.target.files]).catch((error) => {
        console.error('[AVEVA] LOAD FAILED', error);
        AVEVA.$('status').textContent =
          `ERROR ${AVEVA.BUILD_ID}: ${error.message}`;
      });
    };

    document.querySelectorAll('.filters select').forEach((element) => {
      element.onchange = () => {
        // Year เป็น parent scope ของ Month
        // ถ้าล้าง Year ให้ Month ถูกล้างและ disabled ก่อน render
        if (element.id === 'fYear' && typeof AVEVA.syncYearMonthFilter === 'function') {
          AVEVA.syncYearMonthFilter();
        }

        AVEVA.renderDashboard();
      };
    });

    AVEVA.$('reset').onclick = () => {
      document.querySelectorAll('.filters select').forEach((element) => {
        element.value = '';
      });

      if (typeof AVEVA.syncYearMonthFilter === 'function') {
        AVEVA.syncYearMonthFilter();
      }

      AVEVA.renderDashboard();
    };

    window.addEventListener('resize', () => {
      if (AVEVA.data.usage.length) {
        AVEVA.renderDashboard();
      }
    });
  };

  // events.js ต้องโหลดเป็นไฟล์สุดท้าย เพื่อให้ Function จากทุกไฟล์พร้อมใช้งาน
  registerEvents();
})();
