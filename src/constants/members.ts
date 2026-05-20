export const MEMBERS = [
  '사회적협동조합 행복나눔', '참자연', '미소 협동조합',
  '웰쉐어 사회적협동조합', '부천희망나르미', '(주)한울',
];

export const ADMIN_EMAILS = ['ttong@wssc.kr', 'ttong627@gmail.com', 'goodp1@hanmail.net'];

export const FIXED_MAPPING: Record<string, string> = {
  '부천시 원미구': '사회적협동조합 행복나눔',
  '부천시 오정구': '사회적협동조합 행복나눔',
  '부천시 소사구': '부천희망나르미',
  '중구': '부천희망나르미',
  '종로구': '부천희망나르미',
  '용산구': '부천희망나르미',
  '여주시': '미소 협동조합',
};

export const PARTNER_REGIONS: Record<string, string[]> = {
  '사회적협동조합 행복나눔': ['부천시 원미구', '부천시 오정구', '시흥시', '동대문구'],
  '참자연': ['시흥시'],
  '미소 협동조합': ['여주시'],
  '웰쉐어 사회적협동조합': ['동대문구'],
  '부천희망나르미': ['부천시 소사구', '중구', '종로구', '용산구'],
  '(주)한울': ['동대문구'],
};

// region → [company, ...]
export const PARTNER_REGIONS_INVERSE: Record<string, string[]> = {};
Object.entries(PARTNER_REGIONS).forEach(([m, regions]) => {
  regions.forEach(r => {
    if (!PARTNER_REGIONS_INVERSE[r]) PARTNER_REGIONS_INVERSE[r] = [];
    PARTNER_REGIONS_INVERSE[r].push(m);
  });
});

export interface ContactInfo {
  agency: string;
  region: string;
  detail: string;
  manager: string;
  phone: string;
}

export const CONTACTS: ContactInfo[] = [
  { agency: '사회적협동조합 행복나눔', region: '시흥시', detail: '능곡동 제외 전체', manager: '전재형 이사장', phone: '010-4710-7460' },
  { agency: '사회적협동조합 행복나눔', region: '부천시 오정구', detail: '', manager: '조유라 팀장', phone: '010-4726-0437' },
  { agency: '사회적협동조합 행복나눔', region: '부천시 원미구', detail: '', manager: '사무실', phone: '070-7518-7362' },
  { agency: '사회적협동조합 행복나눔', region: '서울 동대문구', detail: '청량리동, 이문2동, 제기동, 회기동', manager: '', phone: '' },
  { agency: '참자연', region: '경기도 시흥시', detail: '능곡동', manager: '박경선 대표', phone: '010-7424-2477' },
  { agency: '미소 협동조합', region: '경기도 여주시', detail: '전체', manager: '김해승 대표 / 강성임 실장', phone: '010-7537-3447 / 010-6530-4211' },
  { agency: '웰쉐어 사회적협동조합', region: '서울 동대문구', detail: '답십리1동, 전농1동, 휘경1동', manager: '이진만 차장', phone: '010-6381-9205' },
  { agency: '부천희망나르미', region: '부천시 소사구', detail: '대산동, 범안동, 소사본동(소사구)', manager: '박한울 과장', phone: '010-3110-9426' },
  { agency: '부천희망나르미', region: '서울 중구', detail: '전체', manager: '김은선 과장', phone: '010-7152-8729' },
  { agency: '부천희망나르미', region: '서울 종로구', detail: '전체', manager: '사무실', phone: '032-713-4644' },
  { agency: '부천희망나르미', region: '서울 용산구', detail: '전체', manager: '', phone: '' },
  { agency: '(주)한울', region: '서울 동대문구', detail: '용신동, 전농2동, 휘경2동, 답십리2동, 이문1동, 장안1동, 장안2동', manager: '장영수 대표', phone: '010-9457-1617' },
];

export interface GovContact {
  region: string;
  order: string;
  manager: string;
  phone: string;
}

export const GOV_CONTACTS: GovContact[] = [
  { region: '종로구', order: '1차', manager: '-', phone: '02-2148-2553' },
  { region: '동대문구', order: '2차', manager: '심정영', phone: '02-2127-4569' },
  { region: '용산구', order: '2차', manager: '-', phone: '02-2199-7094' },
  { region: '여주시', order: '2차', manager: '강호연', phone: '031-887-2278' },
  { region: '중구', order: '1차', manager: '-', phone: '02-3396-5351' },
  { region: '부천시', order: '1차', manager: '-', phone: '032-625-2859' },
  { region: '시흥시', order: '1차', manager: '이채원', phone: '031-310-2269' },
];
