// 메일 제목·본문에서 첨부파일 암호를 추출한다(순수함수, 네트워크 없음).
//   실측 패턴(2026-07-11, 실제 메일 본문 기준):
//     "(명단비번: 4569)"           — 동대문구청 mirnish@ddm.go.kr
//     "중원구 ...양곡배송명단(pw2026) 보내드립니다" — 성남 중원구 이상훈
//     "...발송용(pw2729).xlsx"     — 여주시 희망나르미(파일명에 직접 표기)
//   원칙: 오탐지보다 미탐지가 안전(누락 < 오적용). 3~8자리 숫자만 인정, 애매하면 null.
const PATTERNS = [
  /(?:명단\s*)?비번\s*[:：]?\s*(\d{3,8})/,          // 명단비번: 4569 / 비번:1234
  /\(pw\s*[:：]?\s*(\d{3,8})\)/i,                   // (pw2026) / (pw 2729)
  /비밀번호\s*(?:는|은)?\s*[:：]?\s*(\d{3,8})/,       // 비밀번호는 1234 / 비밀번호: 1234
  /암호\s*(?:는|은)?\s*[:：]?\s*(\d{3,8})/,           // 암호는 1234 / 압축 암호 1234
];

// 텍스트(제목+본문)에서 첫 매칭 암호를 반환. 못 찾으면 null.
export function extractPasswordFromText(text) {
  const t = String(text || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
  for (const re of PATTERNS) {
    const m = t.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

// 메일(subject+body) + 첨부 파일명에서 암호를 찾는다. 파일명 표기가 있으면 최우선(가장 확실).
export function extractPassword({ subject = '', body = '', fileName = '' } = {}) {
  return extractPasswordFromText(fileName) || extractPasswordFromText(subject) || extractPasswordFromText(body);
}
