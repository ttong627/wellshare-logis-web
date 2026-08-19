import { useEffect, useRef } from 'react';

/**
 * 배경 기상 효과 — 낙엽 낙하 · 가랑잎 돌풍 · 낙엽 회오리 (한가위 테마)
 *
 * 설계 원칙 (ICEBERG 눈보라의 원칙 계승)
 *  · 종종 한 번씩만 지나간다. 상시 재생하면 정산 화면의 숫자를 방해한다.
 *  · 형태(낙하/돌풍/회오리) · 잎 종류(단풍/은행/갈잎) · 방향 · 좌표 · 속도 · 크기 · 개수 모두 매번 랜덤.
 *  · transform/opacity만 애니메이션(레이아웃 리플로우 0). 파티클은 끝나면 스스로 제거된다.
 *  · 탭이 안 보이면 멈추고, prefers-reduced-motion이면 아예 실행하지 않는다.
 *  · pointer-events:none — 클릭을 절대 가로채지 않는다.
 */

type Kind = 'drop' | 'gust' | 'whirl';

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

// 잎 종류 — 단풍이 주인공, 은행·갈잎이 섞인다
const LEAVES = ['fall-maple', 'fall-maple', 'fall-ginkgo', 'fall-ginkgo', 'fall-oak'] as const;

export default function AutumnWeather() {
  const layerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const layer = document.createElement('div');
    layer.className = 'fall-weather';
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);
    layerRef.current = layer;

    const isPhone = window.matchMedia('(max-width: 640px)').matches;
    let timer: number | undefined;
    let stopped = false;

    /** 바람 1회 — 형태·세기·방향·좌표·잎 전부 랜덤 */
    const gust = () => {
      if (stopped || document.hidden) return;

      const kind: Kind = pick(['drop', 'drop', 'drop', 'gust', 'gust', 'whirl']);
      // 세기 — 가끔 화면을 통째로 휩쓰는 낙엽비가 온다
      const power = pick(['gentle', 'strong', 'strong', 'storm'] as const);
      const mul = power === 'storm' ? 2.6 : power === 'strong' ? 1.6 : 1;
      const fromLeft = Math.random() < 0.5;
      const base = kind === 'whirl'
        ? rand(isPhone ? 14 : 26, isPhone ? 22 : 44)
        : rand(isPhone ? 12 : 26, isPhone ? 20 : 48);
      const count = Math.round(base * mul);

      // 낙엽비·강풍이면 금빛 바람결이 화면을 스쳐 지나간다(풍요로운 연출)
      if (power !== 'gentle') {
        const veil = document.createElement('div');
        veil.className = `fall-veil ${fromLeft ? 'from-left' : 'from-right'}${power === 'storm' ? ' storm' : ''}`;
        veil.addEventListener('animationend', () => veil.remove(), { once: true });
        layer.appendChild(veil);
      }

      // 회오리는 화면 위 한 지점을 중심으로 감아 올라간다
      const originX = rand(10, 90);
      const originY = rand(15, 80);

      for (let i = 0; i < count; i++) {
        const p = document.createElement('span');
        p.className = `fall-p fall-${kind} ${pick(LEAVES)}`;

        // 낙엽은 눈송이보다 큼직하게 — 잎으로 보여야 한다
        const size = rand(8, kind === 'drop' ? 18 : 14) * (power === 'storm' ? 1.2 : 1);
        // 세면 셀수록 빠르게 지나간다
        const speed = power === 'storm' ? 0.62 : power === 'strong' ? 0.8 : 1;
        const dur = (kind === 'drop' ? rand(6.5, 12) : kind === 'whirl' ? rand(3, 5.6) : rand(2.2, 4.5)) * speed;
        const delay = rand(0, kind === 'whirl' ? 2.2 : 3.4);

        p.style.setProperty('--size', `${size.toFixed(1)}px`);
        p.style.setProperty('--dur', `${dur.toFixed(2)}s`);
        p.style.setProperty('--delay', `${delay.toFixed(2)}s`);
        p.style.setProperty('--spin', `${Math.round(rand(160, 720)) * (Math.random() < 0.5 ? -1 : 1)}deg`);
        p.style.setProperty('--a0', `${rand(0, 360).toFixed(0)}deg`);
        p.style.setProperty('--peak', rand(0.6, 1).toFixed(2));

        if (kind === 'whirl') {
          // 회오리: 중심에서 시작해 반경을 키우며 감아 돈다
          p.style.left = `${originX}%`;
          p.style.top = `${originY}%`;
          p.style.setProperty('--r', `${(rand(110, 420) * (power === 'storm' ? 1.3 : 1)).toFixed(0)}px`);
          p.style.setProperty('--lift', `${rand(-160, -40).toFixed(0)}px`);
        } else if (kind === 'drop') {
          // 낙하: 화면 위에서 놓여나 좌우로 몸을 뒤집으며 떨어진다
          p.style.top = '-8vh';
          p.style.left = `${rand(0, 100).toFixed(1)}%`;
          p.style.setProperty('--dx', `${rand(-18, 18).toFixed(0)}vw`);
          p.style.setProperty('--sway', `${rand(10, 34).toFixed(0)}px`);
        } else {
          // 돌풍: 화면 밖에서 들어와 반대편으로 빠진다
          const y = rand(-5, 100);
          p.style.top = `${y}%`;
          p.style.left = fromLeft ? '-6vw' : '106vw';
          p.style.setProperty('--dx', `${(fromLeft ? 1 : -1) * rand(112, 128)}vw`);
          p.style.setProperty('--dy', `${rand(-10, 34)}vh`);
          p.style.setProperty('--sway', `${rand(6, 26).toFixed(0)}px`);
        }

        p.addEventListener('animationend', () => p.remove(), { once: true });
        layer.appendChild(p);
      }
    };

    /** 다음 바람 예약 — 간격도 랜덤(가을바람은 눈보라보다 잦다) */
    const schedule = (first = false) => {
      const wait = first ? rand(900, 2600) : rand(6000, 16000);
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
