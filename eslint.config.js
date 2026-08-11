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
    // 인쇄용 HTML을 문자열로 만들면서 안에 </script>가 들어간다. 이스케이프 없이 그대로 두면
    // 이 문자열이 인라인 삽입될 때 파서가 스크립트를 조기 종료해 인쇄창이 깨진다.
    // 따라서 `<\/script>`는 의도된 방어 코드이고, no-useless-escape는 여기선 오탐이다.
    // (룰을 이 파일에만 끄고, 나머지 파일에서는 그대로 잡히게 둔다)
    files: ['src/components/tabs/ScheduleTab.tsx'],
    rules: { 'no-useless-escape': 'off' },
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
