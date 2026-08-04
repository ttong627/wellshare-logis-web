import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

const rootEl = document.getElementById('root')!;
createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// PWA 서비스워커 등록 + 자동 업데이트 — 새 버전 배포 시 사용자가 새로고침 안 해도 자동 반영.
//   ① 새 SW가 제어를 넘겨받으면(controllerchange) 페이지를 1회 자동 새로고침 → 최신 버전 표시.
//   ② 앱이 다시 보일 때마다 reg.update()로 새 버전 확인. (첫 설치 때는 새로고침하지 않음)
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || refreshing) return; // 첫 설치/중복 방지
    refreshing = true;
    window.location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      const check = () => { reg.update().catch(() => {}); };
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      check();
    }).catch((e) => console.warn('서비스워커 등록 실패:', e));
  });
}
