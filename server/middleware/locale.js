const path = require('path');
const fs = require('fs');

const locales = {};
const supportedLocales = ['zh', 'en'];

function loadLocales() {
  const localesDir = path.join(__dirname, '..', 'locales');
  for (const locale of supportedLocales) {
    const filePath = path.join(localesDir, `${locale}.json`);
    if (fs.existsSync(filePath)) {
      locales[locale] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  }
}

loadLocales();

function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) =>
    current && current[key] !== undefined ? current[key] : null, obj);
}

function createTranslator(locale) {
  return function translate(key, defaultValue = '') {
    const translation = getNestedValue(locales[locale], key);
    return translation || defaultValue || key;
  };
}

function localeMiddleware(req, res, next) {
  const savedLocale = req.session?.locale || req.cookies?.locale;
  const acceptLang = req.headers['accept-language'];

  let locale = savedLocale || 'zh';

  if (!savedLocale && acceptLang) {
    if (acceptLang.includes('en')) locale = 'en';
  }

  if (!locales[locale]) {
    locale = 'zh';
  }

  res.locals.locale = locale;
  res.locals.t = createTranslator(locale);
  res.locals.supportedLocales = supportedLocales;

  next();
}

function setLocale(req, res, next) {
  const { locale } = req.body || req.query;

  if (locale && supportedLocales.includes(locale)) {
    if (req.session) req.session.locale = locale;
    res.cookie('locale', locale, {
      maxAge: 365 * 24 * 60 * 60 * 1000,
      httpOnly: false
    });
    res.locals.locale = locale;
    res.locals.t = createTranslator(locale);
  }

  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.json({ success: true, locale });
  }

  if (req.get('Referer')) {
    return res.redirect('back');
  }

  next();
}

module.exports = {
  localeMiddleware,
  setLocale,
  supportedLocales,
  loadLocales
};