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

      // ⚠️ 2026-08-11 판단 — 아래 4종은 React Compiler 도입을 대비한 신규 규칙이다.
      // 실제로 걸린 지점(App·AppContext·useAuth·useMonthData·RosterTab·InstallPWAButton)을
      // 전부 확인한 결과 로그인 후 라우팅, prop→state 동기화, localStorage 읽기 등
      // "외부 상태에 반응하는 정상 패턴"이었고 동작 결함은 없었다.
      // 이 프로젝트는 아직 React Compiler를 쓰지 않으므로, 핵심 상태 훅을 지금 뜯어고치는 쪽이
      // 회귀 위험이 훨씬 크다 → error가 아닌 warn으로 두어 빌드는 막지 않되 눈에는 남긴다.
      // (React Compiler 도입 시 이 경고 목록이 그대로 정리 대상이 된다)
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',            // ref 객체를 핸들러 팩토리에 넘기는 형태까지 잡는 오탐 포함
      'react-hooks/immutability': 'warn',    // 렌더마다 0으로 리셋되는 지역 누적 변수라 실제 문제 없음
      // context 파일이 Provider와 useApp 훅을 함께 내보내 걸린다. 파일 분리는 광범위한
      // import 변경을 부르므로 보류 — 영향은 개발 중 Fast Refresh 품질뿐이다.
      'react-refresh/only-export-components': 'warn',
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
