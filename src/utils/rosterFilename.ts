// 정부양곡 명단 파일명 규격화 — 형 규칙(2026-07-26): 저장 파일명 = "지자체_YYYY년MM월_원본명".
//   ⚠️ 데몬판 server/yanggok-collector/standardize-filename.mjs 와 동일 규칙. 빌드 경계(node .mjs ↔ vite TS)가
//      달라 코드를 공유하지 못해 복제한다. 규칙 변경 시 반드시 양쪽을 함께 수정할 것.

const BAD = /[\\/:*?"<>|]+/g;
const clean = (s: string | null | undefined): string => String(s ?? '').replace(BAD, '_').trim();

/** "2026-06" | "2026-6" → "2026년06월". 빈값·이상값 → '' */
export function formatMonthLabel(month: string | null | undefined): string {
  const m = String(month ?? '').match(/(20\d{2})\D+(\d{1,2})/);
  if (!m) return '';
  const mm = Number(m[2]);
  if (mm < 1 || mm > 12) return '';
  return `${m[1]}년${String(mm).padStart(2, '0')}월`;
}

/** 명단 파일명을 "지자체_YYYY년MM월_원본명.ext"로 규격화(금지문자 치환·멱등). */
export function standardRosterFileName(region: string, month: string, originalName: string): string {
  const orig = clean(originalName) || 'file';
  const reg = clean(region);
  const monLabel = formatMonthLabel(month);
  const parts = [reg, monLabel].filter(Boolean);
  if (parts.length === 0) return orig;
  const prefix = parts.join('_');
  if (orig.startsWith(`${prefix}_`)) return orig; // 멱등
  return `${prefix}_${orig}`;
}
