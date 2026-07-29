// Flat config (ESLint 9). The rule set is normative in docs/CODING_STANDARDS.md §12;
// every rule below exists because its absence caused a real class of bug there.
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import eslint from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import tseslint from 'typescript-eslint';

const tsconfigRootDir = dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'docs/**', '*.config.mjs'],
  },

  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  importPlugin.flatConfigs.recommended,
  importPlugin.flatConfigs.typescript,

  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir,
      },
      sourceType: 'module',
    },
    settings: {
      'import/resolver': {
        typescript: { alwaysTryTypes: true, project: './tsconfig.json' },
      },
    },
    rules: {
      // --- Type safety (CODING_STANDARDS §1) ---
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-definitions': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // --- Async (CODING_STANDARDS §7) ---
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/require-await': 'error',

      // --- Structure (PROJECT_RULES §4) ---
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 50, skipBlankLines: true, skipComments: true }],
      // CODING_STANDARDS §2 caps parameters at 4, but §3's own worked example injects
      // five dependencies — the limit is about arguments a caller has to assemble, not
      // about dependency injection. Neither `max-params` nor its typescript-eslint
      // counterpart can exempt a constructor, so the rule is expressed as a selector
      // that simply does not match one. Enforcing it on DI would push services to merge
      // collaborators to satisfy a linter.
      'max-params': 'off',
      complexity: ['error', 10],

      // --- Imports (CODING_STANDARDS §10, FOLDER_STRUCTURE §6) ---
      'import/no-cycle': ['error', { maxDepth: Infinity }],
      'import/no-unresolved': 'error',
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index']],
          pathGroups: [
            { pattern: '@common/**', group: 'internal' },
            { pattern: '@config/**', group: 'internal' },
            { pattern: '@modules/**', group: 'internal' },
            { pattern: '@shared/**', group: 'internal' },
            { pattern: '@prisma-lib/**', group: 'internal' },
            { pattern: '@/**', group: 'internal' },
          ],
          pathGroupsExcludedImportTypes: ['builtin'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      // A module boundary crossed by a relative path is a boundary crossed invisibly.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              // Three levels up from src/modules/<feature>/<dir>/<file>.ts already
              // leaves the feature, which is the boundary FOLDER_STRUCTURE.md §6 cares
              // about. Two levels is still inside it — dto/requests/ reaching
              // constants/ is a normal intra-module import, not a crossing.
              group: ['../../../*'],
              message:
                'Cross-module imports use a path alias (@common/*, @modules/*, …). Relative imports are permitted only within a module — see FOLDER_STRUCTURE.md §6.',
            },
          ],
        },
      ],

      // --- Prohibited practices (CODING_STANDARDS §11) ---
      'no-console': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'FunctionDeclaration[params.length>4]',
          message: 'More than 4 parameters — take an options object (CODING_STANDARDS.md §2).',
        },
        {
          selector: 'ArrowFunctionExpression[params.length>4]',
          message: 'More than 4 parameters — take an options object (CODING_STANDARDS.md §2).',
        },
        {
          selector: "MethodDefinition[kind!='constructor'] > FunctionExpression[params.length>4]",
          message: 'More than 4 parameters — take an options object (CODING_STANDARDS.md §2).',
        },
        {
          selector: "CallExpression[callee.property.name='$queryRawUnsafe']",
          message: 'Use Prisma.sql tagged templates — $queryRawUnsafe is an injection surface.',
        },
        {
          selector: "CallExpression[callee.property.name='$executeRawUnsafe']",
          message: 'Use Prisma.sql tagged templates — $executeRawUnsafe is an injection surface.',
        },
        {
          selector: 'TSEnumDeclaration[const=true]',
          message: 'const enums do not survive isolated transpilation. Use a union or an object.',
        },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message:
            'Read configuration through AppConfigService — process.env is untyped and unvalidated (CODING_STANDARDS.md §11).',
        },
      ],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      curly: ['error', 'multi-line'],
    },
  },

  // The config layer is the one place that may read the raw environment: it is what
  // validates it and hands out typed values to everyone else.
  {
    files: ['src/config/**/*.ts'],
    rules: { 'no-restricted-properties': 'off' },
  },

  // The CLI and the seed scripts write to the terminal by definition; that is their
  // transport, not stray logging.
  {
    files: ['src/cli/**/*.ts', 'prisma/seed/**/*.ts'],
    rules: { 'no-console': 'off' },
  },

  // Seeding is inherently sequential: each upsert must settle before the next, and
  // batching reference data would trade readability for milliseconds run once.
  {
    files: ['prisma/seed/**/*.ts'],
    rules: { 'no-await-in-loop': 'off' },
  },

  // Tests describe behaviour in long table-driven blocks. Length limits there would
  // push assertions out of the test that owns them.
  {
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts', 'test/**/*.ts'],
    rules: {
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/unbound-method': 'off',
      // Supertest types `response.body` and `getHttpServer()` as `any`, so every
      // assertion against a response body trips these. Casting each one would bury the
      // assertion — which is the only thing a reader of a test is looking for — under
      // type ceremony that proves nothing. `no-explicit-any` stays on: writing `any`
      // deliberately is still a decision to justify, and none of these do.
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      // An expectation reached through an optional chain is a real condition at runtime
      // even when the types say otherwise, because the row may not exist.
      '@typescript-eslint/no-unnecessary-condition': 'off',
    },
  },

  // The e2e bootstrap is the one place outside src/config that writes the environment:
  // it starts the containers and publishes their addresses, which the config layer then
  // validates exactly as it would in production.
  {
    files: ['test/setup/**/*.ts'],
    rules: { 'no-restricted-properties': 'off' },
  },

  // Root-level CommonJS config files are tooling, not application code: no TypeScript
  // program backs them, so the type-aware rules cannot run against them.
  {
    files: ['**/*.cjs', '**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { module: 'writable', require: 'readonly', process: 'readonly' },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  prettierConfig,
);
