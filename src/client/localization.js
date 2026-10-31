export function createLocalization(translations) {
  let language = readSavedLanguage() || detectLanguage();

  function translate(key, values = {}) {
    return (translations[language][key] || key).replace(
      /\{(\w+)\}/g,
      (_, name) => values[name] ?? '',
    );
  }

  function apply() {
    document.documentElement.lang = language;
    document.title = translate('app.title');
    document.querySelectorAll('[data-i18n]').forEach(element => {
      element.textContent = translate(element.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-aria]').forEach(element => {
      element.setAttribute('aria-label', translate(element.dataset.i18nAria));
    });
    document.querySelector('#language').value = language;
  }

  function setLanguage(nextLanguage) {
    if (!translations[nextLanguage]) return;
    language = nextLanguage;
    try {
      localStorage.setItem('language', language);
    } catch {
      // The language still applies when browser storage is unavailable.
    }
    apply();
  }

  function readSavedLanguage() {
    try {
      const saved = localStorage.getItem('language');
      return translations[saved] ? saved : null;
    } catch {
      return null;
    }
  }

  function detectLanguage() {
    return navigator.language?.toLowerCase().startsWith('ca') ? 'ca' : 'es';
  }

  return {
    get language() { return language; },
    translate,
    apply,
    setLanguage,
  };
}
