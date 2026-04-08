window.i18n = {
  currentLocale: 'zh',
  translations: {},

  async init() {
    const saved = localStorage.getItem('locale');
    const locale = saved || 'zh';
    await this.loadTranslations(locale);
    this.applyTranslations();
    this.updateToggleState();
  },

  async loadTranslations(locale) {
    try {
      const res = await fetch(`/locales/${locale}.json`);
      if (res.ok) {
        this.translations = await res.json();
        this.currentLocale = locale;
      }
    } catch (e) {
      console.error('Failed to load translations:', e);
    }
  },

  async setLocale(locale) {
    localStorage.setItem('locale', locale);
    await this.loadTranslations(locale);
    this.applyTranslations();
    this.updateToggleState();
  },

  t(key) {
    const keys = key.split('.');
    let value = this.translations;
    for (const k of keys) {
      if (value && typeof value === 'object') {
        value = value[k];
      } else {
        return key;
      }
    }
    return value || key;
  },

  getLocale() {
    return this.currentLocale;
  },

  applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const text = this.t(key);
      if (text !== key) {
        el.textContent = text;
      }
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      const text = this.t(key);
      if (text !== key) {
        el.placeholder = text;
      }
    });

    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      const text = this.t(key);
      if (text !== key) {
        el.title = text;
      }
    });
  },

  updateToggleState() {
    const singleBtn = document.querySelector('.locale-toggle-single');
    if (singleBtn) {
      singleBtn.querySelector('[data-i18n="nav.langSwitch"]').textContent = this.currentLocale === 'zh' ? 'EN' : '中';
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  i18n.init();
});