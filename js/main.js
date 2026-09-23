/* Minimal application entry point. AvevaApplication is the sole public runtime object. */
(() => {
  'use strict';
  const boot = async () => {
    const legacy = window.AVEVA;
    const OOP = window.AVEVA_OOP;
    const application = new OOP.AvevaApplication(legacy);
    window.AvevaApp = application;
    try { await application.start(); }
    catch (error) {
      console.error('[AVEVA] Application startup failed', error);
      application.loadingView.hide();
    } finally {
      // Class instances retain the dependencies they need; remove migration globals.
      delete window.AVEVA_APPLICATION;
      delete window.AVEVA_OOP;
      delete window.AVEVA;
      delete window.AVEVA_EMBEDDED_DATA;
      // XLSX is a non-configurable third-party browser global from the CDN script.
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
