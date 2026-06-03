import DOMPurify from 'dompurify';

// 공문 붙여넣기 HTML 정화 — XSS 방지 (script/on*/iframe 등 차단, 표·서식은 허용).
// dangerouslySetInnerHTML에 넣기 전 반드시 통과시킨다.
export function sanitizeHtml(html: string | undefined | null): string {
  if (!html) return '';
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}
