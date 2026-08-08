#!/usr/bin/env node
// Test runner: bundles the real src/, then runs each suite against it in a
// fresh jsdom. Exits non-zero if any assertion fails.
//
//   npm test

import { build } from './build.mjs';
import { loadData } from './harness.mjs';

import * as render from './render.test.mjs';
import * as interaction from './interaction.test.mjs';
import * as detail from './detail.test.mjs';

const SUITES = [render, interaction, detail];

console.log('CFO Roadmap — test suite');
console.log('bundling src/ with esbuild ...');
await build();

const data = await loadData();
console.log(`roadmap data: ${data.total} improvements, ` +
  `${Object.keys(data.CATEGORIES).length} categories, ` +
  `${data.quickWins.length} quick win(s) — all expectations derived from src/App.jsx`);

const results = [];
for (const suite of SUITES) {
  results.push(await suite.default(data));
}

console.log('\n════════════════════ SUMMARY ════════════════════');
let passed = 0, failed = 0;
for (const r of results) {
  passed += r.passed;
  failed += r.failed;
  console.log(`${r.failed === 0 ? 'PASS' : 'FAIL'}  ${r.name}  (${r.passed} ok, ${r.failed} failed)`);
}
console.log(`\n${failed === 0 ? 'RESULT: ALL' : `RESULT: ${failed} of`} ${passed + failed} assertions ` +
  `${failed === 0 ? 'PASSED' : 'FAILED'} across ${results.length} suites`);

process.exit(failed === 0 ? 0 : 1);
