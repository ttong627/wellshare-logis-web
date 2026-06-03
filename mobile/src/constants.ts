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

// 지역 → 담당 회원사 역매핑(computedAllocations용)
export const PARTNER_REGIONS_INVERSE: Record<string, string[]> = (() => {
  const inv: Record<string, string[]> = {};
  Object.entries(PARTNER_REGIONS).forEach(([member, regions]) => {
    regions.forEach((r) => { (inv[r] ||= []).push(member); });
  });
  return inv;
})();

// ── 금액 계산 입력 상수(웹 src/constants/regions.ts와 동일) ──
export const REGION_ORDER = [
  '부천시 소사구', '부천시 원미구', '부천시 오정구', '시흥시', '여주시',
  '중구', '종로구', '용산구', '동대문구',
];
export const SEOUL_REGIONS = ['중구', '종로구', '용산구', '동대문구'];
export const GYEONGGI_REGIONS = ['부천시 소사구', '부천시 원미구', '부천시 오정구', '시흥시', '여주시'];

// 급지별 배송단가(원). billing_records.zonePrices로 덮어쓰기 가능.
export const INITIAL_ZONES: Record<string, { billing: number }> = {
  '1급지': { billing: 2780 }, '2급지': { billing: 2810 }, '3급지': { billing: 3000 },
  '4급지': { billing: 3200 }, '5급지': { billing: 3490 }, '6급지': { billing: 3820 }, '7급지': { billing: 4170 },
};
// 지역 → 급지. billing_records.regions로 덮어쓰기 가능.
export const INITIAL_REGIONS_DATA: Record<string, string> = {
  '부천시 소사구': '1급지', '부천시 원미구': '1급지', '부천시 오정구': '1급지',
  '시흥시': '2급지', '여주시': '4급지',
  '중구': '2급지', '종로구': '2급지', '용산구': '2급지', '동대문구': '2급지',
};

export const getFullRegionName = (region: string): string => {
  if (SEOUL_REGIONS.includes(region)) return `서울 ${region}`;
  if (GYEONGGI_REGIONS.includes(region)) return `경기 ${region}`;
  return region;
};
export const isSeoulRegion = (region: string): boolean =>
  region.includes('서울') || SEOUL_REGIONS.some((r) => region.includes(r));

// 금액 천단위 콤마
export const won = (n: number): string => Math.round(n || 0).toLocaleString('ko-KR');

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
