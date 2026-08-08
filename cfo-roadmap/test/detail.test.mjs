// Detail-panel probe.
//
// Worth keeping separate: the panel is the only thing that re-renders the
// detail panel's style object, and none of the other suites ever open it —
// the card checkbox calls stopPropagation, so toggling done never selects.
// A regression in that style object would otherwise go unnoticed.

import { Reporter, launchApp, checkConsoleHygiene } from './harness.mjs';

export const name = 'DETAIL PANEL — open from card / Quick wins / matrix, toggle, close';

/** Text unique to a given improvement's expanded panel. */
const panelMarkers = (item) => [item.solution, item.psych, item.techNote];

export default async function run(data) {
  const t = new Reporter(name);
  const app = await launchApp();

  if (!t.check('app mounted', !!app.root && app.root.children.length > 0)) {
    app.close();
    return t;
  }

  const first = data.IMPROVEMENTS[0];

  // ── open from a card ──────────────────────────────────────────────────────
  console.log('\n   -- open the panel from a card --');
  app.phase(`open detail panel from card "${first.title}"`);

  const card = app.card(first.title);
  if (!t.check(`card "${first.title}" found`, !!card)) {
    app.close();
    return t;
  }
  await app.click(card);

  t.check('panel section headings rendered',
    ['Проблема сейчас', 'Решение', 'Психологический механизм', 'Техническая заметка']
      .every((h) => app.text().includes(h)),
    `missing: ${JSON.stringify(['Проблема сейчас', 'Решение', 'Психологический механизм', 'Техническая заметка'].filter((h) => !app.text().includes(h)))}`);
  t.check(`panel shows the full content of "${first.title}"`,
    panelMarkers(first).every((m) => app.text().includes(m)));

  // ── toggle done from inside the panel ─────────────────────────────────────
  console.log('\n   -- toggle done from inside the panel --');
  app.phase('toggle done via the panel button');

  const markBtn = app.button('Отметить выполненным');
  if (t.check('"Отметить выполненным" button found in the panel', !!markBtn)) {
    await app.click(markBtn);
    t.check('button flips to "✓ Выполнено"', !!app.button('✓ Выполнено'));
    t.check(`counter moves to "1 / ${data.total}"`, app.counterShows(1, data.total));
    const { parsed, raw } = app.doneStorage();
    t.check(`"${first.id}" stored as done`, parsed?.[first.id] === true, `storage: ${JSON.stringify(raw)}`);

    app.phase('un-toggle done via the panel button');
    const undo = app.button('✓ Выполнено');
    if (undo) {
      await app.click(undo);
      t.check(`counter returns to "0 / ${data.total}"`, app.counterShows(0, data.total));
    }
  }

  // ── switch to another item from the Quick wins block ──────────────────────
  console.log('\n   -- open a different item from a Quick wins entry --');
  app.phase('open detail panel from a Quick wins entry');

  const grid = app.quickWinsGrid();
  const qw = data.quickWins.find((i) => i.id !== first.id) ?? data.quickWins[0];
  if (t.check('Quick wins grid available', !!grid) && t.check('at least one Quick win to click', !!qw)) {
    const cell = Array.from(grid.children).find((c) => app.txt(c).includes(qw.title));
    if (t.check(`Quick wins entry "${qw.title}" found`, !!cell)) {
      t.info(`clicking: "${app.norm(app.txt(cell))}"`);
      await app.click(cell);
      t.check(`panel switched to "${qw.title}"`, panelMarkers(qw).every((m) => app.text().includes(m)));
    }
  }

  // ── select an item from within the matrix ─────────────────────────────────
  console.log('\n   -- open an item from the matrix --');
  app.phase('switch to matrix view');

  const matrixBtn = app.button('⊞');
  if (t.check('matrix view toggle "⊞" found', !!matrixBtn)) {
    await app.click(matrixBtn);
    t.check('matrix rendered', !!app.matrix());

    const pick = data.matrixVisible.find((i) => i.id !== qw?.id) ?? data.matrixVisible[0];
    const cell = app.matrixCell(pick, data.CATEGORIES);
    if (t.check(`matrix cell for "${pick.title}" found`, !!cell)) {
      await app.click(cell);
      t.check(`panel shows "${pick.title}" after a matrix click`,
        panelMarkers(pick).every((m) => app.text().includes(m)));
    }
  }

  // ── close ─────────────────────────────────────────────────────────────────
  console.log('\n   -- close the panel --');
  app.phase('close detail panel');

  const closeBtn = app.button('✕');
  if (t.check('close button "✕" found', !!closeBtn)) {
    await app.click(closeBtn);
    t.check('panel is gone', !app.text().includes('Техническая заметка'));
  }

  console.log('');
  checkConsoleHygiene(t, app);
  app.close();
  return t;
}
