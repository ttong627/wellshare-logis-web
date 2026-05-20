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

export const getRegionBgColorClass = (region: string): string => {
  if (region.includes('여주시')) return 'bg-[#B4C6E7]';
  if (['부천시 소사구', '부천시 원미구', '부천시 오정구', '시흥시'].includes(region)) return 'bg-[#FFD966]';
  return 'bg-white';
};
