import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Layers that sit above a given layer and must not be imported by it (plan §3). */
const upperLayers = (...layers) => layers.map((layer) => `**/${layer}/**`);

const reactImports = [
  { name: 'react', message: 'This layer must stay framework-free.' },
  { name: 'react-dom', message: 'This layer must stay framework-free.' },
];

export default defineConfig([
  globalIgnores(['dist', 'coverage', 'playwright-report', 'test-results']),

  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2023 },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },

  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat['recommended-latest'], reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
  },

  {
    files: ['*.config.{js,ts}', 'tests/e2e/**/*.ts'],
    languageOptions: { globals: globals.node },
  },

  // Layer boundaries: engine depends on nothing in the app.
  {
    files: ['src/engine/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: reactImports,
          patterns: [
            {
              group: upperLayers('content', 'state', 'persistence', 'ui', 'app'),
              message: 'engine/ must not import from higher layers (plan §3).',
            },
          ],
        },
      ],
    },
  },

  // Layer boundaries: content depends only on engine.
  {
    files: ['src/content/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: reactImports,
          patterns: [
            {
              group: upperLayers('state', 'persistence', 'ui', 'app'),
              message: 'content/ may only import from engine/ (plan §3).',
            },
          ],
        },
      ],
    },
  },

  prettier,
]);
