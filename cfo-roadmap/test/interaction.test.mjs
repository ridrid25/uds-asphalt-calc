// Interaction test for the three behaviours the README promises:
//   · "Фильтры действуют в обоих видах: матрица показывает только то, что
//      прошло фильтр."           → the matrix respects the active filter
//   · "Прогресс сохраняется в localStorage под ключом cfo-roadmap-done"
//   · Quick wins = "усилие XS или S И импакт ≥ 8"

import { Reporter, launchApp, checkConsoleHygiene, MATRIX_IMPACT_ROWS } from './harness.mjs';

export const name = 'INTERACTION — filters, done-toggle persistence, Quick wins rule';

export default async function run(data) {
  const t = new Reporter(name);
  const app = await launchApp();

  if (!t.check('app mounted', !!app.root && app.root.children.length > 0)) {
    app.close();
    return t;
  }

  // ── 1. matrix view respects the active category filter ────────────────────
  console.log('\n   -- matrix view respects active filters --');
  app.phase('switch to matrix view');

  if (data.offMatrix.length) {
    t.info(`NOTE: ${data.offMatrix.length} improvement(s) have an impact outside the matrix rows ` +
      `[${MATRIX_IMPACT_ROWS.join(', ')}] and cannot appear in the matrix by design: ` +
      data.offMatrix.map((i) => `"${i.title}" (impact ${i.impact})`).join(', '));
  }

  const matrixBtn = app.button('⊞');
  t.check('matrix view toggle "⊞" found', !!matrixBtn);
  if (matrixBtn) {
    await app.click(matrixBtn);
    t.check('matrix heading rendered', app.text().includes('Матрица: Импакт × Усилие'));

    const unfiltered = app.titlesIn(app.matrix(), data.IMPROVEMENTS);
    t.info(`matrix titles with no filter: ${unfiltered.length}`);
    t.list(unfiltered);
    const expectUnfiltered = data.matrixVisible.map((i) => i.title);
    t.check(`unfiltered matrix shows all ${expectUnfiltered.length} matrix-eligible improvements`,
      unfiltered.length === expectUnfiltered.length &&
      expectUnfiltered.every((x) => unfiltered.includes(x)),
      `missing: ${JSON.stringify(expectUnfiltered.filter((x) => !unfiltered.includes(x)))}`);

    // Every category, not just one: filter, assert the matrix shows exactly
    // that category's items, then click again to reset (README: repeat click
    // on the active category clears the filter).
    for (const [key, cat] of Object.entries(data.CATEGORIES)) {
      app.phase(`filter matrix by category "${cat.label}"`);
      const chip = app.categoryChip(cat);
      if (!t.check(`filter chip "${cat.icon} ${cat.label}" found`, !!chip)) continue;

      await app.click(chip);
      const shown = app.titlesIn(app.matrix(), data.IMPROVEMENTS);
      const expected = data.byCategory(key).filter((i) => MATRIX_IMPACT_ROWS.includes(i.impact)).map((i) => i.title);
      const leaked = shown.filter((x) => !expected.includes(x));
      const absent = expected.filter((x) => !shown.includes(x));

      t.check(`"${cat.label}": matrix shows exactly its ${expected.length} item(s), nothing else`,
        leaked.length === 0 && absent.length === 0,
        (leaked.length ? `LEAKED from other categories: ${JSON.stringify(leaked, null, 2)}\n          ` : '') +
        (absent.length ? `MISSING: ${JSON.stringify(absent, null, 2)}` : ''));
      if (leaked.length === 0 && absent.length === 0) t.list(shown);

      await app.click(chip);   // reset
      const reset = app.titlesIn(app.matrix(), data.IMPROVEMENTS);
      t.check(`"${cat.label}": clicking the active chip again restores all ${expectUnfiltered.length}`,
        reset.length === expectUnfiltered.length);
    }
  }

  // ── 2. marking an item done persists to localStorage ──────────────────────
  console.log('\n   -- done-toggle persists to localStorage --');
  app.phase('back to cards view');

  const cardsBtn = app.button('▦');
  t.check('cards view toggle "▦" found', !!cardsBtn);
  if (cardsBtn) await app.click(cardsBtn);

  const allChip = app.allChip();
  if (allChip) await app.click(allChip);   // make sure no filter is active

  t.check(`counter reads "0 / ${data.total}" before any toggle`, app.counterShows(0, data.total));

  const target = data.IMPROVEMENTS[0];
  app.phase(`toggle done on "${target.title}"`);
  const box = app.checkbox(target.title);
  t.check(`done checkbox found on card "${target.title}"`, !!box);

  if (box) {
    await app.click(box);

    const { raw, parsed } = app.doneStorage();
    t.info(`localStorage["cfo-roadmap-done"] = ${JSON.stringify(raw)}`);
    t.check('localStorage key "cfo-roadmap-done" written', raw !== null);
    t.check('value parses to a plain object',
      parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed));

    if (parsed && typeof parsed === 'object') {
      const trueKeys = Object.keys(parsed).filter((k) => parsed[k] === true);
      t.check(`exactly one improvement marked done (got ${trueKeys.length}: ${JSON.stringify(trueKeys)})`,
        trueKeys.length === 1);
      t.check(`the stored id is the one that was clicked ("${target.id}")`,
        trueKeys.length === 1 && trueKeys[0] === target.id,
        `stored: ${JSON.stringify(trueKeys)}`);
    }

    t.check(`counter moved to "1 / ${data.total}"`, app.counterShows(1, data.total));
    t.check(`counter no longer reads "0 / ${data.total}"`, !app.counterShows(0, data.total));

    app.phase('un-toggle done');
    await app.click(box);
    const after = app.doneStorage();
    t.check(`counter returns to "0 / ${data.total}" after un-toggling`, app.counterShows(0, data.total));
    t.check(`"${target.id}" is no longer truthy in storage`, !after.parsed?.[target.id],
      `storage now ${JSON.stringify(after.raw)}`);
  }

  // ── 3. Quick wins = (effort XS or S) AND impact >= 8 ──────────────────────
  console.log('\n   -- Quick wins rule --');
  app.phase('read Quick wins block');

  t.info(`expected from IMPROVEMENTS (${data.quickWins.length}):`);
  t.list(data.quickWins.map((i) => `${i.title} (${i.effort}, impact ${i.impact})`));

  const grid = app.quickWinsGrid();
  if (t.check('Quick wins grid located', !!grid)) {
    const cells = Array.from(grid.children);
    t.info(`Quick wins block renders ${cells.length} entr${cells.length === 1 ? 'y' : 'ies'}:`);
    t.list(cells.map((c) => app.norm(app.txt(c))));

    const shown = cells.map((c) => data.IMPROVEMENTS.find((i) => app.txt(c).includes(i.title))?.title
      ?? `(unrecognised: ${app.norm(app.txt(c))})`);
    const expected = data.quickWins.map((i) => i.title);
    const missing = expected.filter((x) => !shown.includes(x));
    const extra = shown.filter((x) => !expected.includes(x));

    t.check(`Quick wins count matches the rule (expected ${expected.length}, got ${cells.length})`,
      cells.length === expected.length);
    t.check(`no qualifying improvement missing (${missing.length})`, missing.length === 0,
      missing.length ? JSON.stringify(missing, null, 2) : '');
    t.check(`no non-qualifying improvement listed (${extra.length})`, extra.length === 0,
      extra.length ? JSON.stringify(extra, null, 2) : '');

    // guard against the block being trivially "right" by listing everything
    t.check('Quick wins is a strict subset of all improvements',
      cells.length < data.total, `${cells.length} of ${data.total} shown`);
  }

  console.log('');
  checkConsoleHygiene(t, app);
  app.close();
  return t;
}
