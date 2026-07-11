import { useEffect } from 'react';

// 모달류 접근성 — ESC 키로 닫기(2026-07-11 점검: 프로젝트 전반 모달에 이 처리가 없었음).
// active가 true인 동안만 리스너를 등록/해제한다.
export function useEscToClose(active: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [active, onClose]);
}
