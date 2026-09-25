import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import nextPlugin from '@next/eslint-plugin-next';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import globals from 'globals';

/**
 * §11 — one flat config for the whole workspace. Rules that the specification
 * makes non negotiable are errors, not warnings: no `any`, no stray
 * `console.log`, no unused code left behind.
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/.pgdata/**',
      '**/next-env.d.ts',
      'apps/api/src/generated/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      // §0.2 — `unknown` plus narrowing, never `any`.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // §14 — no debug output in committed code; warn and error stay.
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },

  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, '@next/next': nextPlugin, 'jsx-a11y': jsxA11y },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      // §11 — accessibility is a requirement, so the checks run in CI.
      ...jsxA11y.flatConfigs.recommended.rules,
      // Every autoFocus in this app is on a drill screen whose single input is
      // the entire point of the page — an exercise answer box, or the email
      // field of a login form. Moving focus there is what a learner expects
      // and saves a tab press on every question. The rule's real target is
      // autoFocus buried inside a long form, which does not occur here.
      'jsx-a11y/no-autofocus': 'off',
      // App Router only: there is no pages/ directory to check links against.
      '@next/next/no-html-link-for-pages': 'off',
    },
  },

  {
    // Seeds, scripts and tests talk to the console on purpose.
    files: [
      'apps/api/prisma/seed/**/*.ts',
      'apps/api/test/**/*.ts',
      'scripts/**/*.{ts,mjs,js}',
      '**/*.test.ts',
      '**/*.spec.ts',
      'eslint.config.mjs',
    ],
    rules: { 'no-console': 'off' },
  },
);
