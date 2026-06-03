export const MEMBERS = [
  '사회적협동조합 행복나눔', '참자연', '미소 협동조합',
  '웰쉐어 사회적협동조합', '부천희망나르미', '(주)한울',
];

export const PARTNER_REGIONS: Record<string, string[]> = {
  '사회적협동조합 행복나눔': ['부천시 원미구', '부천시 오정구', '시흥시', '동대문구'],
  '참자연': ['시흥시'],
  '미소 협동조합': ['여주시'],
  '웰쉐어 사회적협동조합': ['동대문구'],
  '부천희망나르미': ['부천시 소사구', '중구', '종로구', '용산구'],
  '(주)한울': ['동대문구'],
};

// 하드코딩 관리자 (웹 src/constants/members.ts와 일치)
export const ADMIN_EMAILS = ['ttong@wssc.kr', 'ttong627@gmail.com', 'goodp1@hanmail.net'];

// 웹앱과 동일한 sky-blue 브랜드 + 서울 violet / 경기 emerald 색 시스템.
// 모든 화면이 이 토큰만 사용한다(raw hex 금지). 흰 텍스트 대비 4.5:1 충족.
export const COLORS = {
  primary: '#0284c7',      // sky-600 — 헤더/로그인 배경(흰 텍스트 대비 4.5:1+)
  primaryLight: '#38bdf8', // sky-400
  brand: '#0ea5e9',        // sky-500 — 강조
  brandDark: '#0369a1',    // sky-700 — 본문 강조 텍스트
  accent: '#10b981',       // emerald — 보조 강조(= 경기)
  accentLight: '#d1fae5',
  success: '#16a34a',
  successLight: '#dcfce7',
  danger: '#dc2626',
  dangerLight: '#fee2e2',
  warning: '#d97706',
  warningLight: '#fef3c7',
  info: '#0284c7',
  infoLight: '#dbeafe',
  bg: '#f0f9ff',           // sky-50
  card: '#ffffff',
  surfaceAlt: '#f8fafc',
  border: '#e0f2fe',       // sky-100
  text: '#0c4a6e',         // sky-900
  textMuted: '#64748b',    // slate-500 — 흰 배경 대비 4.5:1
  white: '#ffffff',
  // 지역 색 시스템 (웹 getRegionTheme와 동일)
  seoul: '#8b5cf6',        // violet — 서울
  seoulBg: '#f5f3ff',
  gyeonggi: '#10b981',     // emerald — 경기
  gyeonggiBg: '#ecfdf5',
};
