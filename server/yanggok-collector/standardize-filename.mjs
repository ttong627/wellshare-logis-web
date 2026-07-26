// 정부양곡 명단 파일명 규격화 — 순수함수(네트워크 없음). 테스트: standardize-filename.test.mjs
//   형 규칙(2026-07-26): 저장 파일명 = "지자체_YYYY년MM월_원본명".
//   목적: region/month가 폴더·메타에만 있어 파일명만 봐선 식별 불가하던 문제 해결.
//   멱등: 이미 규격 접두가 붙은 이름은 재적용 안 함(소급 스크립트 재실행·재수집 안전).

const BAD = /[\\/:*?"<>|]+/g;
const clean = (s) => String(s ?? '').replace(BAD, '_').trim();

/** "2026-06" | "2026-6" → "2026년06월". 빈값·이상값 → '' */
export function formatMonthLabel(month) {
  const m = String(month ?? '').match(/(20\d{2})\D+(\d{1,2})/);
  if (!m) return '';
  const mm = Number(m[2]);
  if (mm < 1 || mm > 12) return '';
  return `${m[1]}년${String(mm).padStart(2, '0')}월`;
}

/**
 * 명단 파일명을 "지자체_YYYY년MM월_원본명.ext"로 규격화.
 * @param {string} region 지자체명(예: '동대문구', '부천시 원미구')
 * @param {string} month  'YYYY-MM' (classify extractMonth 출력)
 * @param {string} originalName 원본 첨부 파일명
 * @returns {string} 규격화된 파일명(금지문자 치환·멱등)
 */
export function standardRosterFileName(region, month, originalName) {
  const orig = clean(originalName) || 'file';
  const reg = clean(region);
  const monLabel = formatMonthLabel(month);
  const prefixParts = [reg, monLabel].filter(Boolean);
  if (prefixParts.length === 0) return orig;
  const prefix = prefixParts.join('_');
  if (orig.startsWith(`${prefix}_`)) return orig; // 멱등 — 이미 규격화됨
  return `${prefix}_${orig}`;
}
