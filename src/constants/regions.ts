export const REGION_ORDER = [
  '부천시 소사구', '부천시 원미구', '부천시 오정구', '시흥시', '여주시',
  '중구', '종로구', '용산구', '동대문구',
];

export const SEOUL_REGIONS = ['중구', '종로구', '용산구', '동대문구'];
export const GYEONGGI_REGIONS = ['부천시 소사구', '부천시 원미구', '부천시 오정구', '시흥시', '여주시'];
export const ZONE_ORDER = ['1급지', '2급지', '3급지', '4급지', '5급지', '6급지', '7급지'];

export const INITIAL_ZONES: Record<string, { billing: number }> = {
  '1급지': { billing: 2780 },
  '2급지': { billing: 2810 },
  '3급지': { billing: 3000 },
  '4급지': { billing: 3200 },
  '5급지': { billing: 3490 },
  '6급지': { billing: 3820 },
  '7급지': { billing: 4170 },
};

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

// ── 지자체 시/도 그룹 + 색 테마 (서울/경기 시각 구분, 색맹 대비 라벨 동반) ──
export type RegionGroup = '서울' | '경기' | '기타';

export const getRegionGroup = (region: string): RegionGroup => {
  // 접두어 섞인 표기("서울 동대문구","경기도 시흥시")까지 견고하게 판정
  if (region.includes('서울') || SEOUL_REGIONS.some((r) => region.includes(r))) return '서울';
  if (region.includes('경기') || GYEONGGI_REGIONS.some((r) => region.includes(r))) return '경기';
  return '기타';
};

export interface RegionTheme {
  group: RegionGroup;
  bg: string;     // 연한 배경
  border: string; // 테두리
  text: string;   // 진한 텍스트/액센트
  dot: string;    // 포인트 컬러
}

export const getRegionTheme = (region: string): RegionTheme => {
  const group = getRegionGroup(region);
  if (group === '서울') return { group, bg: '#f5f3ff', border: '#ddd6fe', text: '#5b21b6', dot: '#8b5cf6' }; // violet
  if (group === '경기') return { group, bg: '#ecfdf5', border: '#a7f3d0', text: '#065f46', dot: '#10b981' }; // emerald
  return { group, bg: '#f8fafc', border: '#e2e8f0', text: '#475569', dot: '#94a3b8' }; // slate
};

// 표 셀 배경용 (서울=violet, 경기=emerald 그룹 통일)
export const getRegionBgColorClass = (region: string): string => {
  const group = getRegionGroup(region);
  if (group === '서울') return 'bg-violet-50';
  if (group === '경기') return 'bg-emerald-50';
  return 'bg-white';
};
