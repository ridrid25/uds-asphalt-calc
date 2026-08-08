// Shared test plumbing: a jsdom instance running the real bundled app, DOM
// query helpers expressed in terms of what the UI actually shows, and a small
// PASS/FAIL reporter.

import { JSDOM, VirtualConsole } from 'jsdom';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { APP_BUNDLE, DATA_MODULE } from './build.mjs';

// ─── UI constants ───────────────────────────────────────────────────────────
// These are properties of the *layout*, not of the data, so they are the one
// thing worth hardcoding. Everything else is derived from IMPROVEMENTS.

/** Matrix rows, in order. Mirrors the `[10,9,8,7,6]` literal in App.jsx.
 *  README "Как настроить" warns that an improvement whose impact falls outside
 *  this range renders in the cards but silently vanishes from the matrix — so
 *  the suite derives matrix expectations from this list and flags any drift. */
export const MATRIX_IMPACT_ROWS = [10, 9, 8, 7, 6];

/** Quick wins rule, mirrored from App.jsx / README "Quick wins". */
export const isQuickWin = (i) => (i.effort === 'XS' || i.effort === 'S') && i.impact >= 8;

export const VIEW_TOGGLE = { cards: '▦', matrix: '⊞' };
export const MATRIX_HEADING = 'Матрица: Импакт × Усилие';
export const DONE_STORAGE_KEY = 'cfo-roadmap-done';
export const SETTLE_MS = 200;   // React needs a tick after each dispatched click

// ─── data ───────────────────────────────────────────────────────────────────

export async function loadData() {
  const mod = await import(pathToFileURL(DATA_MODULE).href);
  const { IMPROVEMENTS, CATEGORIES, EFFORTS, PRIORITIES } = mod;
  if (!Array.isArray(IMPROVEMENTS) || IMPROVEMENTS.length === 0) {
    throw new Error('Could not read IMPROVEMENTS out of src/App.jsx — see test/build.mjs');
  }
  return {
    IMPROVEMENTS,
    CATEGORIES,
    EFFORTS,
    PRIORITIES,
    total: IMPROVEMENTS.length,
    titles: IMPROVEMENTS.map((i) => i.title),
    quickWins: IMPROVEMENTS.filter(isQuickWin),
    byCategory: (key) => IMPROVEMENTS.filter((i) => i.category === key),
    /** what the matrix can actually show, given its fixed impact rows */
    matrixVisible: IMPROVEMENTS.filter((i) => MATRIX_IMPACT_ROWS.includes(i.impact)),
    offMatrix: IMPROVEMENTS.filter((i) => !MATRIX_IMPACT_ROWS.includes(i.impact)),
  };
}

// ─── reporter ───────────────────────────────────────────────────────────────

export class Reporter {
  constructor(name) {
    this.name = name;
    this.passed = 0;
    this.failed = 0;
    console.log(`\n=== ${name} ===`);
  }
  check(desc, ok, detail) {
    if (ok) this.passed++; else this.failed++;
    console.log(`   ${ok ? '[ok]  ' : '[FAIL]'} ${desc}`);
    if (detail) console.log(`          ${detail}`);
    return ok;
  }
  info(msg) { console.log(`   ...   ${msg}`); }
  list(items) { for (const i of items) console.log(`   ...        · ${i}`); }
}

// ─── jsdom app instance ─────────────────────────────────────────────────────

const fmt = (a) => {
  if (typeof a === 'string') return a;
  if (a instanceof Error) return a.stack || a.message;
  try { return JSON.stringify(a); } catch { return String(a); }
};

/** Boot a fresh copy of the real app in jsdom. Each suite gets its own, so
 *  state (localStorage, filters, selection) never leaks between suites. */
export async function launchApp() {
  const consoleLogs = [];
  const uncaught = [];
  const ctx = { phase: 'boot' };   // stamped onto captures so failures are attributable

  const virtualConsole = new VirtualConsole();
  for (const level of ['error', 'warn', 'info', 'log', 'debug']) {
    virtualConsole.on(level, (...args) =>
      consoleLogs.push({ level, phase: ctx.phase, text: args.map(fmt).join(' ') }));
  }
  virtualConsole.on('jsdomError', (e) =>
    uncaught.push({ kind: 'jsdomError', phase: ctx.phase, text: (e && (e.stack || e.message)) || String(e) }));

  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'http://localhost/',
    virtualConsole,
  });
  const { window } = dom;

  window.addEventListener('error', (ev) =>
    uncaught.push({ kind: 'window.error', phase: ctx.phase, text: (ev.error && (ev.error.stack || ev.error.message)) || ev.message }));
  window.addEventListener('unhandledrejection', (ev) =>
    uncaught.push({ kind: 'unhandledrejection', phase: ctx.phase, text: (ev.reason && (ev.reason.stack || ev.reason.message)) || String(ev.reason) }));

  // jsdom gaps, shimmed so a missing browser API cannot masquerade as an app bug
  if (!window.matchMedia) {
    window.matchMedia = (q) => ({
      matches: false, media: q, onchange: null,
      addListener() {}, removeListener() {},
      addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; },
    });
  }
  if (!window.Element.prototype.scrollIntoView) window.Element.prototype.scrollIntoView = function () {};

  const script = window.document.createElement('script');
  script.textContent = fs.readFileSync(APP_BUNDLE, 'utf8');
  window.document.body.appendChild(script);
  await new Promise((r) => setTimeout(r, 600));   // let React mount + the anim effect fire

  const doc = window.document;
  const root = doc.querySelector('#root');

  const txt = (el) => (el && el.textContent) || '';
  const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
  const divs = () => Array.from(doc.querySelectorAll('div'));
  const buttons = () => Array.from(doc.querySelectorAll('button'));

  const api = {
    window, doc, root, consoleLogs, uncaught,

    /** label the interaction currently under way, so captured errors say where */
    phase(p) { ctx.phase = p; },

    text: () => txt(root),
    txt, norm,

    async settle(ms = SETTLE_MS) { await new Promise((r) => setTimeout(r, ms)); },

    /** dispatch a real MouseEvent so React's synthetic handler runs */
    async click(el, ms) {
      el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      await api.settle(ms);
    },

    button: (label) => buttons().find((b) => norm(txt(b)) === label),
    buttonContaining: (s) => buttons().find((b) => txt(b).includes(s)),

    /** the chip that clears the category filter, e.g. "Все · 19" */
    allChip: () => buttons().find((b) => /^Все ·/.test(norm(txt(b)))),
    categoryChip: (cat) => buttons().find((b) => norm(txt(b)).startsWith(`${cat.icon} ${cat.label} ·`)),

    /** container holding the whole matrix (parent of its heading) */
    matrix() {
      const heading = divs().find((d) => norm(txt(d)) === MATRIX_HEADING);
      return heading ? heading.parentElement : null;
    },

    /** the Quick wins grid.
     *  Match the heading exactly and require it be a leaf — every ancestor's
     *  textContent also *starts with* "⚡ Quick wins", and picking one of those
     *  silently yields the wrong element. */
    quickWinsGrid() {
      const heading = divs().find((d) => /^⚡ Quick wins/.test(norm(txt(d))) && d.children.length === 0);
      return heading ? heading.nextElementSibling : null;
    },

    /** which of the known improvements are rendered inside `el` */
    titlesIn(el, all) {
      const t = txt(el);
      return all.filter((i) => t.includes(i.title)).map((i) => i.title);
    },

    /** A card is the element whose child div is exactly an improvement title and
     *  which owns a button (the done checkbox). That shape excludes the detail
     *  panel header (title's parent holds no button) and Quick wins entries
     *  (same) without depending on inline styles. Cards view, panel closed. */
    card(title) {
      const hit = divs().find((d) => norm(txt(d)) === title && d.parentElement?.querySelector('button'));
      return hit ? hit.parentElement : null;
    },
    checkbox(title) {
      const c = api.card(title);
      return c ? c.querySelector('button') : null;
    },

    /** an improvement's tile inside the matrix, rendered as "<icon> <title>" */
    matrixCell(item, categories) {
      const m = api.matrix();
      if (!m) return null;
      const label = `${categories[item.category].icon} ${item.title}`;
      return Array.from(m.querySelectorAll('div')).find((d) => norm(txt(d)) === label);
    },

    doneStorage() {
      const raw = window.localStorage.getItem(DONE_STORAGE_KEY);
      let parsed = null;
      try { parsed = raw === null ? null : JSON.parse(raw); } catch { /* reported by caller */ }
      return { raw, parsed };
    },

    /** header progress counter, e.g. "3 / 19" */
    counterShows: (done, total) => txt(root).includes(`${done} / ${total}`),

    errors: () => consoleLogs.filter((l) => l.level === 'error'),
    warnings: () => consoleLogs.filter((l) => l.level === 'warn'),

    close() { window.close(); },
  };

  return api;
}

/** Shared final check: the app logged nothing to console.error and threw nothing. */
export function checkConsoleHygiene(t, app) {
  const errors = app.errors();
  const warns = app.warnings();
  t.check(`no console.error (count = ${errors.length})`, errors.length === 0);
  for (const [i, e] of errors.entries()) {
    console.log(`   [console.error #${i + 1}] (during "${e.phase}")\n${e.text}\n`);
  }
  t.check(`no uncaught errors (count = ${app.uncaught.length})`, app.uncaught.length === 0);
  for (const [i, e] of app.uncaught.entries()) {
    console.log(`   [${e.kind} #${i + 1}] (during "${e.phase}")\n${e.text}\n`);
  }
  if (warns.length) {
    t.info(`${warns.length} console.warn (not fatal):`);
    warns.forEach((w) => t.info(`  [warn during "${w.phase}"] ${w.text}`));
  }
}
