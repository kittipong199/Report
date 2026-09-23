(() => {
  'use strict';
  const OOP = (window.AVEVA_OOP = window.AVEVA_OOP || {});
  OOP.LoadingView = class LoadingView {
    constructor({ documentRef = document } = {}) { this.document = documentRef; }
    show(message = 'Loading Excel data…') {
      const overlay = this.document.getElementById('loadingOverlay');
      const target = this.document.getElementById('loadingMessage');
      if (target) target.textContent = message;
      if (overlay) { overlay.hidden = false; overlay.setAttribute('aria-hidden', 'false'); }
      this.document.body.classList.add('is-loading');
    }
    hide() {
      const overlay = this.document.getElementById('loadingOverlay');
      if (overlay) { overlay.hidden = true; overlay.setAttribute('aria-hidden', 'true'); }
      this.document.body.classList.remove('is-loading');
    }
  };
})();
