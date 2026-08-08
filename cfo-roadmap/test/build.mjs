// Builds the two bundles the test suite needs, using the esbuild JS API.
//
//  1. app.iife.js  — the real app (src/main.jsx), bundled for the browser and
//                    evaluated inside jsdom. Built in development mode on
//                    purpose: React's dev build is what emits the console.error
//                    warnings the console-hygiene checks look for.
//
//  2. data.mjs     — the roadmap DATA (IMPROVEMENTS, CATEGORIES, EFFORTS,
//                    PRIORITIES) re-exported as an ES module so the tests can
//                    compute their own expectations instead of hardcoding them.
//
// src/App.jsx declares those constants at module scope but does not export
// them, and this suite is not allowed to edit src/App.jsx. So bundle #2 uses an
// esbuild onLoad hook to append an export statement to the *in-memory* copy of
// the file. Nothing on disk is touched. React is swapped for a stub because we
// only ever read the data — the component is never rendered from this module.

import * as esbuild from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '..');
export const SRC = path.join(ROOT, 'src');
export const TMP = path.join(import.meta.dirname, '.tmp');

export const APP_BUNDLE = path.join(TMP, 'app.iife.js');
export const DATA_MODULE = path.join(TMP, 'data.mjs');

/** Names src/App.jsx keeps module-private that the tests need to read. */
const EXPOSED = ['IMPROVEMENTS', 'CATEGORIES', 'EFFORTS', 'PRIORITIES'];

/** Stand-in for react / react/jsx-runtime in the data-only bundle. */
const REACT_STUB = `
const noop = () => {};
export const useState = noop, useEffect = noop, useRef = noop, useMemo = noop, useCallback = noop;
export const Fragment = "Fragment", StrictMode = "StrictMode";
export const jsx = noop, jsxs = noop, jsxDEV = noop, createElement = noop;
export default { Fragment, createElement, useState, useEffect, useRef };
`;

const stubReactPlugin = {
  name: 'stub-react',
  setup(build) {
    build.onResolve({ filter: /^react(\/.*)?$/ }, () => ({ path: 'react', namespace: 'react-stub' }));
    build.onLoad({ filter: /.*/, namespace: 'react-stub' }, () => ({ contents: REACT_STUB, loader: 'js' }));
  },
};

const exposeDataPlugin = {
  name: 'expose-roadmap-data',
  setup(build) {
    build.onLoad({ filter: /App\.jsx$/ }, async (args) => {
      const source = await fs.readFile(args.path, 'utf8');
      const missing = EXPOSED.filter((n) => !new RegExp(`\\b(?:const|let|var)\\s+${n}\\b`).test(source));
      if (missing.length) {
        throw new Error(
          `test/build.mjs expected these top-level constants in ${path.relative(ROOT, args.path)} ` +
          `but could not find them: ${missing.join(', ')}. ` +
          `If they were renamed, update EXPOSED in test/build.mjs.`
        );
      }
      return { contents: `${source}\nexport { ${EXPOSED.join(', ')} };\n`, loader: 'jsx' };
    });
  },
};

const SHARED = {
  bundle: true,
  loader: { '.jsx': 'jsx' },
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"development"' },
  logLevel: 'warning',
};

export async function build() {
  await fs.mkdir(TMP, { recursive: true });

  await esbuild.build({
    ...SHARED,
    entryPoints: [path.join(SRC, 'main.jsx')],
    format: 'iife',
    outfile: APP_BUNDLE,
  });

  await esbuild.build({
    ...SHARED,
    entryPoints: [path.join(SRC, 'App.jsx')],
    format: 'esm',
    outfile: DATA_MODULE,
    plugins: [stubReactPlugin, exposeDataPlugin],
  });

  return { APP_BUNDLE, DATA_MODULE };
}
