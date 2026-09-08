// ESLint — React-only rules (Biome handles all TS/JS linting + formatting)
// Only rules with no Biome equivalent are enforced here.
// See docs/Toolchain-Architecture.md for the full toolchain reference.
import babelParser from '@babel/eslint-parser';
import reactHooks from 'eslint-plugin-react-hooks';
import reactCompiler from 'eslint-plugin-react-compiler';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  { ignores: ['**/dist', '**/node_modules', '**/coverage', '**/storybook-static', '**/*.ts'] },
  {
    files: ['apps/web/src/**/*.tsx'],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          presets: ['@babel/preset-react', '@babel/preset-typescript'],
        },
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-compiler': reactCompiler,
      'react-refresh': reactRefresh,
    },
    rules: {
      // Keep the two stable React Hooks rules; the rest of the v7 recommended
      // rules are experimental and add several minutes to each lint run.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-compiler/react-compiler': 'error',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
];
