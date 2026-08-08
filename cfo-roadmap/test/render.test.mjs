// Render smoke test: the app mounts and puts every improvement on the page.

import { Reporter, launchApp, checkConsoleHygiene } from './harness.mjs';

export const name = 'RENDER — app mounts and renders the whole roadmap';

export default async function run(data) {
  const t = new Reporter(name);
  const app = await launchApp();
  app.phase('initial render');

  t.info(`rendered text: ${app.text().length} chars, #root children: ${app.root?.children.length ?? 'NO #root'}`);

  if (!t.check('app mounted (#root has children)', !!app.root && app.root.children.length > 0)) {
    app.close();
    return t;   // nothing below can mean anything if it never mounted
  }

  const text = app.text();

  // headline is "<N> улучшений для продукта", N derived from the data
  t.check(`headline shows the improvement count ("${data.total} улучшений для продукта")`,
    text.includes(`${data.total} улучшений для продукта`),
    text.includes('улучшений для продукта') ? '' : 'headline phrase not found at all');

  const missing = data.titles.filter((title) => !text.includes(title));
  t.check(`all ${data.total} improvement titles present (${data.total - missing.length}/${data.total})`,
    missing.length === 0,
    missing.length ? `missing: ${JSON.stringify(missing, null, 2)}` : '');
  t.list(data.titles.map((x) => `${text.includes(x) ? 'ok  ' : 'MISS'} ${x}`));

  t.check('progress counter starts empty', app.counterShows(0, data.total),
    app.counterShows(0, data.total) ? '' : `expected "0 / ${data.total}" in the header`);

  t.check('Quick wins banner rendered', text.includes('Quick wins'));

  // one filter chip per category, each showing that category's item count
  for (const [key, cat] of Object.entries(data.CATEGORIES)) {
    const n = data.byCategory(key).length;
    const chip = app.categoryChip(cat);
    t.check(`filter chip for "${cat.label}" shows its ${n} item(s)`,
      !!chip && app.norm(app.txt(chip)) === `${cat.icon} ${cat.label} · ${n}`,
      chip ? `chip reads "${app.norm(app.txt(chip))}"` : 'chip not found');
  }

  const allChip = app.allChip();
  t.check(`"Все" chip shows the full count (${data.total})`,
    !!allChip && app.norm(app.txt(allChip)) === `Все · ${data.total}`,
    allChip ? `chip reads "${app.norm(app.txt(allChip))}"` : 'chip not found');

  checkConsoleHygiene(t, app);
  app.close();
  return t;
}
