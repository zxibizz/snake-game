// Localization. The language comes from the browser locale (navigator.languages, first supported one wins);
// `?lang=xx` in the URL overrides it and is remembered on the device (`?lang=auto` goes back to the browser locale).
// English is the fallback for unknown locales and for keys a language lacks.
// A dictionary value is either a string or a function of the call's arguments (numbers, names, plurals).
// Adding a language: copy lang/en.js and manifest.webmanifest, translate them, register the language in LANGS
// and add both files to ASSETS in sw.js (test/i18n.test.js checks all of that).
import en from './lang/en.js';
import ru from './lang/ru.js';

export const LANGS = { en, ru };
const STORE = 'snake-lang';

export function pickLang(wanted, langs = LANGS) {
  for (const tag of wanted) {
    const base = String(tag || '').toLowerCase().split(/[-_]/)[0];
    if (langs[base]) return base;
  }
  return 'en';
}

function chosen() {
  if (typeof location === 'undefined') return null;
  const q = new URLSearchParams(location.search).get('lang');
  try {
    if (q === 'auto') localStorage.removeItem(STORE);
    else if (q) localStorage.setItem(STORE, pickLang([q]));
    return localStorage.getItem(STORE);
  } catch { return q; } // private mode: the URL still works for this page
}
const fromBrowser = typeof navigator === 'undefined' ? [] : (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]);
const pinned = chosen();
export const lang = pickLang(pinned ? [pinned, ...fromBrowser] : fromBrowser);
const dict = LANGS[lang];

export const has = (key) => key in dict || key in en;

export function t(key, ...args) {
  const v = dict[key] ?? en[key];
  if (v === undefined) return key;
  return typeof v === 'function' ? v(...args) : v;
}

// static page text: data-t → text, data-t-aria → aria-label; also the title, the install name and <html lang>
// (set last: until then the page stays hidden, see index.html)
export function translatePage(doc = document) {
  doc.title = t('app.name');
  doc.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', t('app.name'));
  if (lang !== 'en') doc.querySelector('link[rel="manifest"]')?.setAttribute('href', `manifest.${lang}.webmanifest`);
  for (const el of doc.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t);
  for (const el of doc.querySelectorAll('[data-t-aria]')) el.setAttribute('aria-label', t(el.dataset.tAria));
  doc.documentElement.lang = lang;
}

if (typeof document !== 'undefined') translatePage();
