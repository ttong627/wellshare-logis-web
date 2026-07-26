// 정부양곡 명단 암호 폴백 후보 — 순수함수. 테스트: password-fallback.test.mjs
//   형 규칙 ②(2026-07-26): 본문/제목/파일명에 암호 없으면 저장된(지자체별) 암호로 복호.
//   후보 순서 = [메일에서 추출한 암호(있으면)] → [그 지자체의 과거 확인 암호들].
//   ⚠️ 추측 금지: 저장 암호는 과거 실제 복호에 성공한 값(passwordFound)만 — 임의 브루트포스 아님.

/**
 * 복호 시도 후보 목록 생성(중복 제거·문자열 일관).
 * @param {string|number|null} extracted 메일에서 추출한 암호(없으면 falsy)
 * @param {Set<string>|null} savedSet 해당 지자체의 과거 확인 암호 집합
 * @returns {string[]} 시도 순서대로의 암호 후보(둘 다 없으면 빈 배열 → 시도 안 함)
 */
export function pwCandidates(extracted, savedSet) {
  const out = [];
  const ex = extracted == null ? '' : String(extracted);
  if (ex) out.push(ex);
  if (savedSet) {
    for (const p of savedSet) {
      const s = p == null ? '' : String(p);
      if (s && !out.includes(s)) out.push(s);
    }
  }
  return out;
}
