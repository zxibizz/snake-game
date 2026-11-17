import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LANGS, LANG_ORDER, pickLang, t, has } from '../public/i18n.js';
import { SKINS, TYPES } from '../public/core.js';
import { EAT, BOOST, CRASH, MOLT, MUSIC } from '../public/sounds.js';
import { BACKDROPS } from '../public/backdrop.js';

test('i18n: language comes from the first supported locale, English otherwise', () => {
  assert.equal(pickLang(['ru-RU', 'en-US']), 'ru');
  assert.equal(pickLang(['kk-KZ', 'ru']), 'ru');
  assert.equal(pickLang(['de-DE', 'ru']), 'de');
  assert.equal(pickLang(['pt-PT']), 'pt');
  assert.equal(pickLang(['zh-TW']), 'zh');
  assert.equal(pickLang(['en-GB', 'ru']), 'en');
  assert.equal(pickLang(['RU_kz']), 'ru');
  assert.equal(pickLang(['sv-SE', 'fi']), 'en');
  assert.equal(pickLang([]), 'en');
  assert.equal(pickLang([undefined]), 'en');
});

test('i18n: the language picker lists every language once, each under its own name', () => {
  assert.deepEqual([...LANG_ORDER].sort(), Object.keys(LANGS).sort());
  const names = Object.values(LANGS).map((d) => d['lang.name']);
  assert.equal(new Set(names).size, names.length);
});

test('i18n: every language has exactly the keys of English, of the same kind', () => {
  const ref = LANGS.en;
  const optional = new Set(['bots']); // a language may keep the English bot names
  for (const [code, d] of Object.entries(LANGS)) {
    assert.deepEqual(Object.keys(d).filter((k) => !(k in ref)), [], `${code}: unknown keys`);
    assert.deepEqual(Object.keys(ref).filter((k) => !(k in d) && !optional.has(k)), [], `${code}: missing keys`);
    for (const k of Object.keys(d)) assert.equal(typeof d[k], typeof ref[k], `${code}: ${k}`);
  }
});

test('i18n: skins, snake types and sounds have a name in every language', () => {
  const keys = [...SKINS.map((s) => 'skin.' + s.id), ...BACKDROPS.map((k) => 'bg.' + k), 'bg.random', ...TYPES.map((x) => 'type.' + x.id),
    ...[['eat', EAT], ['boost', BOOST], ['crash', CRASH], ['molt', MOLT]].flatMap(([g, set]) => set.map((o) => `snd.${g}.${o.id}`)),
    'music.random', ...MUSIC.map((m) => 'music.' + m.id)];
  assert.equal(new Set(SKINS.map((s) => s.id)).size, SKINS.length, 'skin ids are unique');
  for (const [code, d] of Object.entries(LANGS)) {
    for (const k of keys) assert.ok(typeof d[k] === 'string' && d[k], `${code}: ${k}`);
    const bots = d.bots || LANGS.en.bots;
    assert.ok(Array.isArray(bots) && bots.length >= 60, `${code}: enough bot names for a full arena`);
    assert.equal(new Set(bots).size, bots.length, `${code}: bot names are unique`);
  }
});

test('i18n: English has no Cyrillic, and text with arguments renders them', () => {
  const src = JSON.stringify(Object.entries(LANGS.en).map(([k, v]) => [k, typeof v === 'function' ? v.toString() : v]));
  assert.ok(!/[\u0400-\u04FF]/.test(src));
  assert.equal(t('room.title', 1234), 'Room 1234');
  assert.equal(t('no.such.key'), 'no.such.key');
  assert.ok(has('err.p2p') && !has('err.nope'));
  for (const d of Object.values(LANGS)) assert.ok(d['unlock.got'](['A', 'B']).includes('B'));
});

test('i18n: manifests differ from the English one only in their texts', async () => {
  const read = async (f) => JSON.parse(await readFile(new URL('../public/' + f, import.meta.url), 'utf8'));
  const base = await read('manifest.webmanifest');
  const strip = (m) => { const { name, short_name: sn, description, lang, ...rest } = m; return rest; };
  for (const code of Object.keys(LANGS)) {
    if (code === 'en') continue;
    const m = await read(`manifest.${code}.webmanifest`);
    assert.equal(m.lang, code);
    assert.deepEqual(strip(m), strip(base), `manifest.${code}.webmanifest`);
  }
});

test('i18n: localized files are cached for offline play', async () => {
  const sw = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
  for (const code of Object.keys(LANGS)) {
    assert.ok(sw.includes(`'lang/${code}.js'`), `lang/${code}.js in sw.js`);
    if (code !== 'en') assert.ok(sw.includes(`'manifest.${code}.webmanifest'`), `manifest.${code} in sw.js`);
  }
});

test('i18n: Cyrillic lives only in the Russian dictionary and manifest — code, comments and docs are English', async () => {
  const { readdir } = await import('node:fs/promises');
  const root = new URL('../', import.meta.url);
  const allowed = new Set(['public/lang/ru.js', 'public/manifest.ru.webmanifest']);
  const text = /\.(js|mjs|html|css|json|webmanifest|md|yml|yaml)$|^Dockerfile$/;
  const bad = [];
  const walk = async (dir) => {
    for (const e of await readdir(new URL(dir, root), { withFileTypes: true })) {
      const p = dir + e.name;
      if (e.isDirectory()) { if (!['.git', 'node_modules'].includes(e.name)) await walk(p + '/'); continue; }
      if (!text.test(e.name) || allowed.has(p)) continue;
      if (/[\u0400-\u04FF]/.test(await readFile(new URL(p, root), 'utf8'))) bad.push(p);
    }
  };
  await walk('');
  assert.deepEqual(bad, []);
});

test('music: every track in the list has its file, and every file is in the list', async () => {
  const { readdir } = await import('node:fs/promises');
  const files = (await readdir(new URL('../public/music/', import.meta.url))).filter((f) => f.endsWith('.mp3')).sort();
  assert.deepEqual(files, MUSIC.map((m) => m.id + '.mp3').sort());
  assert.equal(new Set(MUSIC.map((m) => m.id)).size, MUSIC.length);
});
