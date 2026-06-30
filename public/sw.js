// 정부양곡정산 PWA 서비스워커 — 설치가능 조건 충족 + 안전한 네트워크 우선 전략.
// 네트워크 우선이라 배포 후 stale(옛 화면) 문제가 없고, 오프라인일 때만 캐시 폴백.
// 배포(버전업)마다 캐시 이름을 올려 옛 캐시를 비운다 — package.json version과 맞춘다.
const CACHE = 'wellshare-pwa-v2.15.0';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // 옛 캐시 정리
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // 페이지 이동(navigate): 네트워크 우선, 실패 시 캐시 폴백(없으면 시작 페이지)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
          return res;
        })
        .catch(async () => (await caches.match(request)) || (await caches.match('/')) || Response.error()),
    );
    return;
  }

  // 정적 자원: 네트워크 우선, 실패 시 캐시
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(request)),
  );
});
