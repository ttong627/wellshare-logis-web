import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// ⚠️ 2026-07-11 점검에서 발견: 기존 files 패턴이 '**/*.{js,jsx}'뿐이라 앱 코드(46개 파일이
// 전부 .ts/.tsx)가 eslint 검사에서 완전히 빠져 있었다. src(.ts/.tsx)에 typescript-eslint를
// 적용하고, 이 저장소에 섞여있는 무관한 하위 프로젝트(agents/ecount-gateway/mobile/ttong/tools)는
// 각자 별도 lint 설정을 쓰므로 명시적으로 제외한다.
export default defineConfig([
  globalIgnores([
    'dist',
    'agents/**',
    'ecount-gateway/**',
    'mobile/**',
    'ttong/**',
    'tools/**',
    'functions/node_modules/**',
  ]),
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['functions/index.js', 'server/**/*.mjs'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' }],
    },
  },
])
