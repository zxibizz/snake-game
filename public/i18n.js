// Localization. By default the language follows the device (navigator.languages, first supported one wins);
// the player can pick another one with the globe on the home screen (setLang, remembered on the device), and
// `?lang=xx` in the URL does the same (`?lang=auto` goes back to the device language).
// English is the fallback for unknown locales and for keys a language lacks.
// A dictionary value is either a string or a function of the call's arguments (numbers, names).
// Adding a language: copy lang/en.js and manifest.webmanifest, translate them, register the language in LANGS
// and LANG_ORDER and add both files to ASSETS in sw.js (test/i18n.test.js checks all of that).
import en from './lang/en.js';
import de from './lang/de.js';
import es from './lang/es.js';
import fr from './lang/fr.js';
import it from './lang/it.js';
import ja from './lang/ja.js';
import ko from './lang/ko.js';
import nl from './lang/nl.js';
import pl from './lang/pl.js';
import pt from './lang/pt.js';
import ru from './lang/ru.js';
import tr from './lang/tr.js';
import zh from './lang/zh.js';

// Portuguese is Brazilian, Chinese is Simplified: other variants of these languages get them too
export const LANGS = { en, de, es, fr, it, ja, ko, nl, pl, pt, ru, tr, zh };
const STORE = 'snake-lang';

export function pickLang(wanted, langs = LANGS) {
  for (const tag of wanted) {
    const base = String(tag || '').toLowerCase().split(/[-_]/)[0];
    if (langs[base]) return base;
  }
  return 'en';
}

// the language list for the picker: Latin script alphabetically by native name, then the others
export const LANG_ORDER = ['de', 'en', 'es', 'fr', 'it', 'nl', 'pl', 'pt', 'tr', 'ru', 'ja', 'ko', 'zh'];

function chosen() {
  if (typeof location === 'undefined') return null;
  const q = new URLSearchParams(location.search).get('lang');
  try {
    if (q === 'auto') localStorage.removeItem(STORE);
    else if (q) localStorage.setItem(STORE, pickLang([q]));
    return localStorage.getItem(STORE);
  } catch { return q && q !== 'auto' ? q : null; } // no storage (private mode): the URL alone carries the choice
}
const fromBrowser = typeof navigator === 'undefined' ? [] : (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]);
export const pinned = chosen();            // the language picked by the player, or null — follow the device
export const deviceLang = pickLang(fromBrowser);
export const lang = pinned ? pickLang([pinned, ...fromBrowser]) : deviceLang;
const dict = LANGS[lang];

// pick a language (null — follow the device) and reload: every text is rendered from the dictionary at startup
export function setLang(code) {
  let stored = true;
  try { if (code) localStorage.setItem(STORE, code); else localStorage.removeItem(STORE); } catch { stored = false; }
  const q = new URLSearchParams(location.search);
  q.delete('lang');
  q.delete('room'); // an invite already answered shouldn't pop up again
  if (!stored && code) q.set('lang', code); // without storage the URL keeps the choice
  location.replace(location.pathname + (q.toString() ? '?' + q : ''));
}

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
