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
    // ADR 0001 boundary: core/ is pure TypeScript and must never import the
    // rendering or physics engines. This is the seam that keeps core/ unit
    // testable in Vitest without a browser or WASM context.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'three', message: 'core/ must not import three — keep rendering out of pure simulation code (see ADR 0001).' },
            { name: '@dimforge/rapier3d-compat', message: 'core/ must not import Rapier — keep physics out of pure simulation code (see ADR 0001).' },
          ],
          patterns: [
            { group: ['three/*'], message: 'core/ must not import three (see ADR 0001).' },
            { group: ['../physics/*', '../../physics/*', '**/physics/**'], message: 'core/ must not import the physics adapter (see ADR 0001).' },
            { group: ['../render/*', '../../render/*', '**/render/**'], message: 'core/ must not import the render layer (see ADR 0001).' },
          ],
        },
      ],
    },
  },
);
