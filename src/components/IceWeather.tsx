import { useEffect, useRef } from 'react';

/**
 * 배경 기상 효과 — 눈보라 · 돌개바람 · 흩날림
 *
 * 설계 원칙
 *  · 종종(30~75초 간격) 한 번씩만 지나간다. 상시 재생하면 정산 화면의 숫자를 방해한다.
 *  · 형태(눈보라/돌개바람/흩날림) · 방향 · 시작 좌표 · 속도 · 크기 · 개수 모두 매번 랜덤.
 *  · transform/opacity만 애니메이션(레이아웃 리플로우 0). 파티클은 끝나면 스스로 제거된다.
 *  · 탭이 안 보이면 멈추고, prefers-reduced-motion이면 아예 실행하지 않는다.
 *  · pointer-events:none — 클릭을 절대 가로채지 않는다.
 */

type Kind = 'blizzard' | 'whirl' | 'drift';

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

export default function IceWeather() {
  const layerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const layer = document.createElement('div');
    layer.className = 'ice-weather';
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);
    layerRef.current = layer;

    const isPhone = window.matchMedia('(max-width: 640px)').matches;
    let timer: number | undefined;
    let stopped = false;

    /** 돌풍 1회 — 형태·방향·좌표·입자 전부 랜덤 */
    const gust = () => {
      if (stopped || document.hidden) return;

      const kind: Kind = pick(['blizzard', 'blizzard', 'whirl', 'drift']); // 눈보라가 조금 더 자주
      const fromLeft = Math.random() < 0.5;
      const count = kind === 'whirl'
        ? Math.round(rand(isPhone ? 8 : 14, isPhone ? 12 : 24))
        : Math.round(rand(isPhone ? 6 : 12, isPhone ? 10 : 22));

      // 돌개바람은 화면 위 한 지점을 중심으로 감아 올라간다
      const originX = rand(10, 90);
      const originY = rand(15, 80);

      for (let i = 0; i < count; i++) {
        const p = document.createElement('span');
        p.className = `ice-p ice-${kind}`;

        const size = rand(2, kind === 'drift' ? 7 : 5);
        const dur = kind === 'drift' ? rand(7, 12) : kind === 'whirl' ? rand(3.4, 6.5) : rand(2.6, 5.2);
        const delay = rand(0, kind === 'whirl' ? 1.6 : 2.4);

        p.style.setProperty('--size', `${size.toFixed(1)}px`);
        p.style.setProperty('--dur', `${dur.toFixed(2)}s`);
        p.style.setProperty('--delay', `${delay.toFixed(2)}s`);
        p.style.setProperty('--spin', `${Math.round(rand(180, 900)) * (Math.random() < 0.5 ? -1 : 1)}deg`);
        p.style.setProperty('--peak', rand(0.35, 0.9).toFixed(2));

        if (kind === 'whirl') {
          // 소용돌이: 중심에서 시작해 반경을 키우며 감아 돈다
          p.style.left = `${originX}%`;
          p.style.top = `${originY}%`;
          p.style.setProperty('--r', `${rand(60, 260).toFixed(0)}px`);
          p.style.setProperty('--a0', `${rand(0, 360).toFixed(0)}deg`);
          p.style.setProperty('--lift', `${rand(-160, -40).toFixed(0)}px`);
        } else {
          // 눈보라·흩날림: 화면 밖에서 들어와 반대편으로 빠진다
          const y = rand(-5, 100);
          p.style.top = `${y}%`;
          p.style.left = fromLeft ? '-6vw' : '106vw';
          p.style.setProperty('--dx', `${(fromLeft ? 1 : -1) * rand(112, 128)}vw`);
          p.style.setProperty('--dy', `${rand(kind === 'drift' ? 4 : -14, kind === 'drift' ? 42 : 26)}vh`);
          p.style.setProperty('--sway', `${rand(6, 26).toFixed(0)}px`);
        }

        p.addEventListener('animationend', () => p.remove(), { once: true });
        layer.appendChild(p);
      }
    };

    /** 다음 돌풍 예약 — 간격도 랜덤 */
    const schedule = (first = false) => {
      const wait = first ? rand(4000, 12000) : rand(30000, 75000);
      timer = window.setTimeout(() => {
        gust();
        schedule();
      }, wait);
    };

    const onVisibility = () => {
      if (document.hidden) {
        if (timer) clearTimeout(timer);
        layer.replaceChildren();      // 숨겨진 동안 남은 입자 정리
      } else if (!stopped) {
        schedule();
      }
    };

    schedule(true);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      layer.remove();
      layerRef.current = null;
    };
  }, []);

  return null;
}
