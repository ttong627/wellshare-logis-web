// 양곡 메일 분류기 — 순수함수(네트워크 없음). 테스트: classify-yanggok.test.mjs
//   판정: 정부양곡 관련 + 첨부 있음 → 지역·월·구분 추출 → RosterTab 적재 대상으로 변환.
//   원칙: 애매하면 '미분류·관리자전용'으로 적재(누락 < 과노출 방지). 절대 임의 매칭 금지.

// ── 양곡 판정 ───────────────────────────────────────────────────
export const RE_YANGGOK = /정부양곡|양곡|복지미|나라미|인수지시서|인수도지시서|매출지시서/;
// 명단이 아닌 양곡 메일(청구서·결과보고·선정공문·단순회신) — 적재 제외
export const RE_EXCLUDE = /청구|결과\s*보고|명세서|반송|배송비|세금계산서|선정|모집|공모/;

export function isYanggokRoster(subject) {
  const s = subject || '';
  return RE_YANGGOK.test(s) && !RE_EXCLUDE.test(s);
}

// ── 지역 추출 ───────────────────────────────────────────────────
//   회원사 담당 지역(PARTNER_REGIONS in src/constants/members.ts와 동일 문자열) — 자동 노출 허용.
export const PARTNER_REGION_KEYS = [
  '부천시 원미구', '부천시 오정구', '부천시 소사구', '시흥시', '동대문구',
  '여주시', '중구', '종로구', '용산구',
];

// 제목 우선 매칭 — 구체적(구 단위) 패턴 먼저, 넓은 패턴 나중 (순서 중요)
const REGION_PATTERNS = [
  ['부천시 원미구', /원미구/],
  ['부천시 오정구', /오정구/],
  ['부천시 소사구', /소사구/],
  ['동대문구', /동대문/],
  ['종로구', /종로/],
  ['용산구', /용산/],
  ['서초구', /서초/],
  ['중원구', /중원구/],
  ['여주시', /여주/],
  ['시흥시', /시흥/],
  ['수원시', /수원/],
  ['양평군', /양평/],
  ['하남시', /하남/],
  ['중구', /중구/],           // ⚠️ 반드시 중원구 뒤 (부분문자열 오탐 방지)
  ['부천시', /부천/],          // 구 미상 부천 — 관리자 확인
];

// 발신자 → 지역 (제목에 지역이 없을 때 폴백. 실측 시드 2026-06~07)
const SENDER_REGIONS = [
  [/@ddm\.go\.kr$/, '동대문구'],
  [/@yongsan\.go\.kr$/, '용산구'],
  [/@mail\.jongno\.go\.kr$/, '종로구'],
  [/^pmspage@korea\.kr$/, '여주시'],
  [/^ksh627@korea\.kr$/, '부천시 원미구'],
  [/^jjswp77@korea\.kr$/, '부천시 오정구'],
  [/^koyoona@korea\.kr$/, '시흥시'],
  [/^yhr0304@korea\.kr$/, '수원시'],
];

export function extractRegion(subject, from = '') {
  const s = subject || '';
  for (const [region, re] of REGION_PATTERNS) if (re.test(s)) return region;
  const f = (from || '').toLowerCase().trim();
  for (const [re, region] of SENDER_REGIONS) if (re.test(f)) return region;
  return '미분류';
}

// ── 월 추출 ─────────────────────────────────────────────────────
//   "26.7월"·"2026년 7월"·"7월분"·"하반기(7월)" → YYYY-MM. 없으면 수신월(메일 date의 로컬부 슬라이스 = KST).
export function extractMonth(subject, receivedDate = '') {
  const s = subject || '';
  const recv = (receivedDate || '').slice(0, 7); // 'YYYY-MM'
  let year = null;
  let month = null;
  let m = s.match(/(20\d{2})\s*년?\s*(\d{1,2})\s*월/);          // 2026년 7월 / 2026.7월
  if (m) { year = Number(m[1]); month = Number(m[2]); }
  if (!month) {
    m = s.match(/(\d{2})\s*[.년]\s*(\d{1,2})\s*월/);             // 26.7월 / 26년 7월
    if (m) { year = 2000 + Number(m[1]); month = Number(m[2]); }
  }
  if (!month) {
    m = s.match(/(\d{1,2})\s*월/);                               // 7월 / 7월분
    if (m) month = Number(m[1]);
  }
  if (!month || month < 1 || month > 12) return recv || '';
  if (!year) {
    year = Number(recv.slice(0, 4)) || new Date().getFullYear();
    // 연말·연초 경계 보정: 12월 메일에 '1월' 명단 → 다음 해
    const rm = Number(recv.slice(5, 7));
    if (rm && month - rm <= -7) year += 1;
    if (rm && month - rm >= 7) year -= 1;
  }
  return `${year}-${String(month).padStart(2, '0')}`;
}

// ── 구분(category) ─────────────────────────────────────────────
export function extractCategory(subject, filename = '') {
  const t = `${subject || ''} ${filename || ''}`;
  if (/인수지시서|인수도지시서|매출지시서|인도지시서/.test(t)) return '인수지시서';
  if (/차상위/.test(t) && !/수급/.test(t)) return '차상위';
  if (/명단|현황|내역|목록/.test(t)) return '배송명단';
  return '전체';
}

// ── 종합: 메일 1건 → 적재 계획 ──────────────────────────────────
//   { register: bool, region, month, adminOnly, note } — adminOnly는 회원사 담당 지역이 아닐 때.
export function planMail(mail) {
  const { subject = '', from = '', date = '', attachments = 0 } = mail || {};
  if (!isYanggokRoster(subject)) return { register: false, reason: '양곡 명단 아님' };
  if (!attachments) return { register: false, reason: '첨부 없음' };
  const region = extractRegion(subject, from);
  const month = extractMonth(subject, date);
  const adminOnly = !PARTNER_REGION_KEYS.includes(region);
  return {
    register: true,
    region,
    month,
    adminOnly,
    note: adminOnly
      ? `담당 미지정(${region}) — 본사 확인 후 배포 · 메일 ${(date || '').slice(0, 10)}`
      : `메일 자동수집 (${(date || '').slice(0, 10)} ${from.slice(0, 40)})`,
  };
}
