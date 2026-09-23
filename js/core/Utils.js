/* Dependency-injectable facade over the verified utility functions in app.js. */
(() => {
  'use strict';
  const OOP = (window.AVEVA_OOP = window.AVEVA_OOP || {});

  OOP.Utils = class Utils {
    constructor(legacy = window.AVEVA) { this.legacy = legacy; }
    byId(id) { return this.legacy.$(id); }
    text(value) { return this.legacy.text(value); }
    number(value) { return this.legacy.num(value); }
    nullableNumber(value) { return this.legacy.nullableNum(value); }
    format(value, digits = 1) { return this.legacy.fmt(value, digits); }
    normalize(value) { return this.legacy.norm(value); }
    latestDate(values) { return this.legacy.latestDate(values); }
    escapeHtml(value) {
      return String(value ?? '').replace(/[&<>"']/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
      })[character]);
    }
  };
})();
