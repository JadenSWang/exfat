import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

/**
 * Shared flat ESLint config for source-only TypeScript packages
 * (e.g. @workout/core, @workout/supabase). The Expo app uses
 * eslint-config-expo instead, since it needs React/RN-aware rules.
 */
export default tseslint.config(
  { ignores: ['dist/**', '.turbo/**', '.expo/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
)
