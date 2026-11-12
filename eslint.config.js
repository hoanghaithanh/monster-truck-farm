// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // core/ is the headless simulation: pure TypeScript that must never import
    // the renderer, audio, input or UI. That seam is what lets Vitest (and the
    // bot runs in core.test.ts) play whole games without a browser.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'three', message: 'core/ must not import three: keep rendering out of the simulation.' },
          ],
          patterns: [
            { group: ['three/*'], message: 'core/ must not import three.' },
            { group: ['**/render/**', '**/audio/**', '**/ui/**', '**/input/**'], message: 'core/ must not import presentation layers.' },
          ],
        },
      ],
    },
  },
);
