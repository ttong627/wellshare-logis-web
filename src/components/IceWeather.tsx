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

    /** 돌풍 1회 — 형태·세기·방향·좌표·입자 전부 랜덤 */
    const gust = () => {
      if (stopped || document.hidden) return;

      const kind: Kind = pick(['blizzard', 'blizzard', 'blizzard', 'whirl', 'whirl', 'drift']);
      // 세기 — 가끔 화면을 통째로 휩쓰는 폭설이 온다
      const power = pick(['gentle', 'strong', 'strong', 'storm'] as const);
      const mul = power === 'storm' ? 2.6 : power === 'strong' ? 1.6 : 1;
      const fromLeft = Math.random() < 0.5;
      const base = kind === 'whirl'
        ? rand(isPhone ? 16 : 30, isPhone ? 26 : 52)
        : rand(isPhone ? 14 : 32, isPhone ? 24 : 58);
      const count = Math.round(base * mul);

      // 폭설·강풍이면 냉기 베일이 화면을 스쳐 지나간다(더위 날리는 연출)
      if (power !== 'gentle') {
        const veil = document.createElement('div');
        veil.className = `ice-veil ${fromLeft ? 'from-left' : 'from-right'}${power === 'storm' ? ' storm' : ''}`;
        veil.addEventListener('animationend', () => veil.remove(), { once: true });
        layer.appendChild(veil);
      }

      // 돌개바람은 화면 위 한 지점을 중심으로 감아 올라간다
      const originX = rand(10, 90);
      const originY = rand(15, 80);

      for (let i = 0; i < count; i++) {
        const p = document.createElement('span');
        p.className = `ice-p ice-${kind}`;

        const size = rand(4, kind === 'drift' ? 12 : 9) * (power === 'storm' ? 1.25 : 1);
        // 세면 셀수록 빠르게 지나간다
        const speed = power === 'storm' ? 0.62 : power === 'strong' ? 0.8 : 1;
        const dur = (kind === 'drift' ? rand(6, 10) : kind === 'whirl' ? rand(3, 5.6) : rand(1.9, 4.2)) * speed;
        const delay = rand(0, kind === 'whirl' ? 2.2 : 3.4);

        p.style.setProperty('--size', `${size.toFixed(1)}px`);
        p.style.setProperty('--dur', `${dur.toFixed(2)}s`);
        p.style.setProperty('--delay', `${delay.toFixed(2)}s`);
        p.style.setProperty('--spin', `${Math.round(rand(180, 900)) * (Math.random() < 0.5 ? -1 : 1)}deg`);
        p.style.setProperty('--peak', rand(0.55, 1).toFixed(2));

        if (kind === 'whirl') {
          // 소용돌이: 중심에서 시작해 반경을 키우며 감아 돈다
          p.style.left = `${originX}%`;
          p.style.top = `${originY}%`;
          p.style.setProperty('--r', `${(rand(110, 420) * (power === 'storm' ? 1.3 : 1)).toFixed(0)}px`);
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

    /** 다음 돌풍 예약 — 간격도 랜덤(자주 몰아친다) */
    const schedule = (first = false) => {
      const wait = first ? rand(1200, 3500) : rand(7000, 20000);
      timer = window.setTimeout(() => {
        gust();
        // 강풍은 종종 연달아 몰아친다
        if (Math.random() < 0.45) window.setTimeout(gust, rand(700, 2200));
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
