/* Owns report routing, active navigation state, and post-navigation redraws. */
(() => {
  'use strict';
  const OOP = (window.AVEVA_OOP = window.AVEVA_OOP || {});
  OOP.NavigationController = class NavigationController {
    constructor({ dashboard, state, documentRef = document, windowRef = window }) {
      Object.assign(this, { dashboard, state, document: documentRef, window: windowRef });
      this.legacyRoutes = { 'credit-risk': 'overview', 'credits-overview': 'overview', usage: 'usage-department' };
    }
    show(pageName) {
      const buttons = [...this.document.querySelectorAll('[data-report-page]')];
      const links = [...this.document.querySelectorAll('[data-report-link]')];
      const pages = [...this.document.querySelectorAll('[data-report-view]')];
      const names = new Set(pages.map((page) => page.dataset.reportView));
      pageName = this.legacyRoutes[pageName] || pageName;
      if (!names.has(pageName)) pageName = 'overview';
      const navigationPage = pageName === 'department-detail' ? 'usage-department' : pageName;
      buttons.forEach((button) => {
        const active = button.dataset.reportPage === navigationPage;
        button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active));
      });
      links.forEach((link) => {
        const active = link.dataset.reportLink === navigationPage;
        link.classList.toggle('active', active);
        if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
      });
      pages.forEach((page) => {
        const active = page.dataset.reportView === pageName;
        page.hidden = !active; page.classList.toggle('active', active);
      });
      if (this.state.data.usage.length) this.window.requestAnimationFrame(() => this.dashboard.render());
      this.document.querySelector('.report-content')?.scrollIntoView({ block: 'start' });
      return pageName;
    }
    bind() {
      this.document.querySelectorAll('[data-report-page]').forEach((button) => {
        button.addEventListener('click', () => {
          const target = button.dataset.reportPage;
          if (this.window.location.hash === `#${target}`) this.show(target); else this.window.location.hash = target;
        });
      });
      this.window.addEventListener('hashchange', () => this.show(this.window.location.hash.replace('#', '')));
      this.show(this.window.location.hash.replace('#', '') || 'overview');
    }
  };
})();
