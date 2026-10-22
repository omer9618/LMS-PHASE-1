import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  // ── Layer rules (docs/BACKEND_STRUCTURE.md). Enforced here so CI catches violations. ──
  {
    files: ['src/**/controllers/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['**/dao/*'], message: 'Controllers call services, never DAOs.' },
            {
              group: ['**/prisma/prisma.service', '**/prisma/transaction.service'],
              message: 'Controllers never touch Prisma.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/**/services/**/*.ts'],
    ignores: ['**/*.spec.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'express', message: 'Services never see Request/Response.' },
            { name: '@nestjs/platform-express', message: 'Services never see Request/Response.' },
          ],
          patterns: [
            {
              group: ['**/prisma/prisma.service'],
              message: 'Services call DAOs; use TransactionService for transactions.',
            },
            {
              group: ['../../*/dao/*', '../../../modules/*/dao/*'],
              message: "Never import another module's DAO. Use its exported service.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/**/domain/**/*.ts'],
    ignores: ['**/*.spec.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@nestjs/*'], message: 'Domain rules are pure: no Nest.' },
            { group: ['@prisma/*', '**/prisma/*'], message: 'Domain rules are pure: no Prisma.' },
            { group: ['**/dao/*', '**/services/*'], message: 'Domain rules do no I/O.' },
          ],
        },
      ],
    },
  },
  {
    ignores: ['node_modules/', 'dist/', 'build/', 'coverage/', 'prisma/migrations/'],
  },
);
