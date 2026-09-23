/* CONNECTS: Maps menu links and header shortcuts to focused report-page sections. */
(() => {
  'use strict';

  const buttons = [...document.querySelectorAll('[data-report-page]')];
  const links = [...document.querySelectorAll('[data-report-link]')];
  const pages = [...document.querySelectorAll('[data-report-view]')];
  const pageNames = new Set(pages.map((page) => page.dataset.reportView));
  const legacyRoutes = {
    'credit-risk': 'overview',
    'credits-overview': 'overview',
    usage: 'usage-department'
  };

  const showPage = (pageName) => {
    pageName = legacyRoutes[pageName] || pageName;
    if (!pageNames.has(pageName)) pageName = 'overview';

    buttons.forEach((button) => {
      const active = button.dataset.reportPage === pageName;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });

    links.forEach((link) => {
      const active = link.dataset.reportLink === pageName;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });

    pages.forEach((page) => {
      const active = page.dataset.reportView === pageName;
      page.hidden = !active;
      page.classList.toggle('active', active);
    });

    // Canvas elements inside hidden report pages measure 0px wide. Redraw only
    // after the newly selected page has become visible so its charts recover
    // their real responsive dimensions when navigating in either direction.
    if (window.AVEVA?.data?.usage?.length) {
      requestAnimationFrame(() => window.AVEVA.renderDashboard());
    }

    document.querySelector('.report-content')?.scrollIntoView({ block: 'start' });
  };

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset.reportPage;
      if (location.hash === `#${target}`) showPage(target);
      else location.hash = target;
    });
  });

  window.addEventListener('hashchange', () => showPage(location.hash.replace('#', '')));
  showPage(location.hash.replace('#', '') || 'overview');
})();
