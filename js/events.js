/* CONNECTS: Binds index.html controls to loading, filtering, navigation, and redraw functions. */
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
    document.querySelectorAll('[data-credit-series]').forEach((checkbox) => {
      checkbox.onchange = () => {
        AVEVA.creditSeriesVisibility[checkbox.dataset.creditSeries] = checkbox.checked;
        AVEVA.renderCreditsOverview?.();
      };
    });
    const setCreditSeries = (visible) => {
      document.querySelectorAll('[data-credit-series]').forEach((checkbox) => {
        checkbox.checked = visible;
        AVEVA.creditSeriesVisibility[checkbox.dataset.creditSeries] = visible;
      });
      AVEVA.renderCreditsOverview?.();
    };
    const selectAllCreditSeries = AVEVA.$('selectAllCreditSeries');
    if (selectAllCreditSeries) selectAllCreditSeries.onclick = () => setCreditSeries(true);
    const removeAllCreditSeries = AVEVA.$('removeAllCreditSeries');
    if (removeAllCreditSeries) removeAllCreditSeries.onclick = () => setCreditSeries(false);

    AVEVA.$('loadBtn').onclick = () => {
      AVEVA.$('files').value = '';
      AVEVA.$('files').click();
    };

    AVEVA.$('files').onchange = (event) => {
      AVEVA.setLoading?.(true, 'Loading selected Excel files…');
      AVEVA.loadFiles([...event.target.files]).catch((error) => {
        console.error('[AVEVA] LOAD FAILED', error);
        AVEVA.$('status').textContent =
          `ERROR ${AVEVA.BUILD_ID}: ${error.message}`;
      }).finally(() => AVEVA.setLoading?.(false));
    };

    document.querySelectorAll('.filters select, .filters input').forEach((element) => {
      element.onchange = () => {
        // Year เป็น parent scope ของ Month
        // ถ้าล้าง Year ให้ Month ถูกล้างและ disabled ก่อน render
        if (element.id === 'fYear' && typeof AVEVA.syncYearMonthFilter === 'function') {
          AVEVA.syncYearMonthFilter();
        }

        if (element.id === 'fCompany') {
          AVEVA.$('fDept').value = '';
          AVEVA.$('fUser').value = '';
          AVEVA.fillFilters();
        } else if (element.id === 'fDept') {
          AVEVA.$('fUser').value = '';
          AVEVA.fillFilters();
        }
        if (AVEVA.validateDateRange()) AVEVA.renderDashboard();
      };
    });

    document.querySelectorAll('[data-chart-filter]').forEach((element) => {
      element.onchange = () => {
        const container = element.closest('[data-chart-filters]');
        AVEVA.renderDashboard();
      };
    });

    document.querySelectorAll('[data-chart-reset]').forEach((button) => {
      button.onclick = () => {
        const container = document.querySelector(
          `[data-chart-filters="${button.dataset.chartReset}"]`
        );
        container?.querySelectorAll('[data-chart-filter]').forEach((element) => {
          element.value = element.dataset.chartFilter === 'year'
            ? [...element.options]
                .map((option) => Number(option.value))
                .filter(Number.isFinite)
                .reduce((latest, year) => Math.max(latest, year), 0) || ''
            : '';
        });
        AVEVA.renderDashboard();
      };
    });

    document.querySelectorAll('[data-table-filter]').forEach((element) => {
      element.onchange = () => AVEVA.renderUsageTable();
    });

    document.querySelectorAll('[data-table-reset]').forEach((button) => {
      button.onclick = () => {
        const container = document.querySelector(
          `[data-table-filters="${button.dataset.tableReset}"]`
        );
        container?.querySelectorAll('[data-table-filter]').forEach((element) => {
          element.value = element.dataset.tableFilter === 'year'
            ? [...element.options]
                .map((option) => Number(option.value))
                .filter(Number.isFinite)
                .reduce((latest, year) => Math.max(latest, year), 0) || ''
            : '';
        });
        AVEVA.renderUsageTable();
      };
    });

    AVEVA.$('reset').onclick = () => {
      document.querySelectorAll('.filters select, .filters input').forEach((element) => {
        element.value = '';
      });

      AVEVA.$('fYear').value = String(AVEVA.defaultYear());

      if (typeof AVEVA.syncYearMonthFilter === 'function') {
        AVEVA.syncYearMonthFilter();
      }

      AVEVA.renderDashboard();
    };

    let resizeFrame;
    window.addEventListener('resize', () => {
      if (AVEVA.data.usage.length) {
        cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(() => AVEVA.renderDashboard());
      }
    });
  };

  // Compatibility seam used by EventController during the incremental OOP migration.
  // Keeping the bindings here preserves the verified UI behavior while main.js owns startup.
  AVEVA.registerLegacyEvents = registerEvents;
})();
