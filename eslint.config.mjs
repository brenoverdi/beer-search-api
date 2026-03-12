// @ts-check
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // Ignore build output and generated files
  {
    ignores: ['dist/**', 'node_modules/**', 'prisma/migrations/**'],
  },

  // Base TypeScript rules
  ...tseslint.configs.recommended,

  // Project-wide overrides
  {
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Errors
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',

      // Warnings
      'no-console': ['warn', { allow: ['error', 'warn', 'info', 'log'] }],
      '@typescript-eslint/no-floating-promises': 'warn',

      // Disabled — too noisy in Express/tsyringe patterns
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
);
