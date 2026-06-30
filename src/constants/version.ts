// 앱 버전 단일 진입점 — 소스 진실은 package.json, vite.config의 define(__APP_VERSION__)으로 주입된다.
//   화면 표시는 이 상수만 import해서 쓴다. 매 배포 시 package.json version만 올리면 전부 따라온다.
export const APP_VERSION: string =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';
