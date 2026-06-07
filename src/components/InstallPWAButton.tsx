import React, { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * "홈 화면에 바로가기 추가"(PWA 설치) 버튼.
 * - Android/Chrome: beforeinstallprompt 캡처 → 네이티브 설치 프롬프트.
 * - iOS/Safari: 프롬프트 미지원 → 수동 추가 안내 모달.
 * - 이미 설치(standalone)됐거나 세션 내 닫으면 숨김.
 */
export default function InstallPWAButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(false);
  const [iosHelp, setIosHelp] = useState(false);

  const isStandalone =
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true);
  const isIos = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => {
    if (isStandalone) { setHidden(true); return; }
    try { if (sessionStorage.getItem('pwaInstallDismissed') === '1') { setHidden(true); return; } } catch {}
    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e as BeforeInstallPromptEvent); };
    const onInstalled = () => { setHidden(true); setDeferred(null); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [isStandalone]);

  const canShow = !hidden && (!!deferred || isIos);
  if (!canShow) return null;

  const handleInstall = async () => {
    if (deferred) {
      try {
        await deferred.prompt();
        const { outcome } = await deferred.userChoice;
        if (outcome === 'accepted') setHidden(true);
      } catch (e) {
        console.warn('설치 프롬프트 오류:', e);
      }
      setDeferred(null);
    } else if (isIos) {
      setIosHelp(true);
    }
  };

  const dismiss = () => {
    setHidden(true);
    try { sessionStorage.setItem('pwaInstallDismissed', '1'); } catch {}
  };

  return (
    <>
      {/* 하단 고정 배너 */}
      <div className="fixed left-1/2 -translate-x-1/2 bottom-4 z-[1000] w-[calc(100%-1.5rem)] max-w-md anim-in">
        <div className="glass rounded-2xl shadow-xl border border-sky-200/70 px-3.5 py-3 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-white shadow flex items-center justify-center shrink-0 overflow-hidden">
            <img src="/icon-192.png" alt="정부양곡정산" className="w-10 h-10" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sky-800 font-black text-sm leading-tight">홈 화면에 바로가기 추가</p>
            <p className="text-sky-500 text-[11px] font-bold truncate">앱처럼 한 번에 실행하세요</p>
          </div>
          <button
            onClick={handleInstall}
            className="btn-sky px-4 py-2 rounded-xl text-xs font-black whitespace-nowrap shrink-0"
          >
            바로가기 만들기
          </button>
          <button
            onClick={dismiss}
            aria-label="닫기"
            className="text-sky-300 hover:text-sky-500 text-lg leading-none px-1 shrink-0"
          >
            ✕
          </button>
        </div>
      </div>

      {/* iOS 수동 추가 안내 */}
      {iosHelp && (
        <div
          className="fixed inset-0 z-[1001] bg-black/45 flex items-end sm:items-center justify-center p-4"
          onClick={() => setIosHelp(false)}
        >
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full anim-in" onClick={(e) => e.stopPropagation()}>
            <div className="text-center mb-5">
              <img src="/icon-192.png" alt="" className="w-16 h-16 mx-auto rounded-2xl shadow mb-3" />
              <h3 className="text-lg font-black text-sky-800">홈 화면에 추가하기</h3>
              <p className="text-sky-500 text-xs font-bold mt-1">Safari 하단 메뉴에서 직접 추가합니다</p>
            </div>
            <ol className="space-y-3 mb-6">
              {[
                <>하단 <b className="text-sky-700">공유</b> 버튼(￪ 사각형+화살표)을 누르세요</>,
                <><b className="text-sky-700">홈 화면에 추가</b>를 선택하세요</>,
                <>우측 상단 <b className="text-sky-700">추가</b>를 누르면 완료!</>,
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-slate-700 font-bold">
                  <span className="w-6 h-6 rounded-full bg-sky-100 text-sky-700 font-black text-xs flex items-center justify-center shrink-0">{i + 1}</span>
                  <span className="pt-0.5 leading-snug">{step}</span>
                </li>
              ))}
            </ol>
            <button onClick={() => setIosHelp(false)} className="btn-sky w-full py-3 rounded-2xl text-sm">확인</button>
          </div>
        </div>
      )}
    </>
  );
}
