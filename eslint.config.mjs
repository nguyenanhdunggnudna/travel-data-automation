import globals from 'globals';
import pluginJs from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintPluginPrettier from 'eslint-plugin-prettier';

export default [
  { files: ['**/*.{js,mjs,cjs,ts}'] },
  { languageOptions: { globals: globals.node } },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      prettier: eslintPluginPrettier
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      'prettier/prettier': [
        'warn',
        {
          arrowParens: 'always',
          semi: true,
          trailingComma: 'none',
          tabWidth: 2,
          endOfLine: 'auto',
          useTabs: false,
          singleQuote: true,
          printWidth: 80,
        }
      ],
      semi: 'error',
       'quotes': ['error', 'single'] ,
      'prefer-const': 'error',
      'no-console': 'warn',
      'no-promise-executor-return': 'error',
      'no-self-compare': 'error',
      'no-use-before-define': 'error',
      'block-scoped-var': 'error',
      'no-else-return': 'error',
      'no-var': 'error',
      'require-await': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/typedef': [
        'error',
        {
          arrowParameter: true,
        },
      ],


    },
    ignores: ['**/node_modules/', '**/dist/']
  }
];
