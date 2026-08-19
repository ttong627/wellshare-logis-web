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

      // 잔잔 원칙(형 피드백 2026-08-19): 낙하 위주, 잎 수는 적게, 바람결 베일은 없앴다.
      const kind: Kind = pick(['drop', 'drop', 'drop', 'drop', 'gust', 'whirl']);
      const power = pick(['gentle', 'gentle', 'strong', 'storm'] as const);
      const mul = power === 'storm' ? 1.8 : power === 'strong' ? 1.3 : 1;
      const fromLeft = Math.random() < 0.5;
      const base = kind === 'whirl'
        ? rand(isPhone ? 8 : 14, isPhone ? 14 : 24)
        : rand(isPhone ? 7 : 12, isPhone ? 12 : 22);
      const count = Math.round(base * mul);

      // 회오리는 화면 위 한 지점을 중심으로 감아 올라간다
      const originX = rand(10, 90);
      const originY = rand(15, 80);

      for (let i = 0; i < count; i++) {
        const p = document.createElement('span');
        p.className = `fall-p fall-${kind} ${pick(LEAVES)}`;

        // 크기 3계층 원근감 — 고만고만하면 티끌처럼 보인다(형 피드백 2026-08-19).
        //   가까운 큰 잎(주인공·소수) / 중간 잎 / 멀리 작은 잎으로 차이를 크게 벌린다.
        const tier = Math.random();
        const near = tier < 0.2;                       // 20% — 큰 잎
        const far = tier >= 0.65;                      // 35% — 먼 잎
        const size = near ? rand(32, 48) : far ? rand(10, 15) : rand(18, 28);
        // 세면 셀수록 빠르게 지나간다. 큰 잎은 느긋하게, 작은 잎은 가볍게.
        const speed = (power === 'storm' ? 0.7 : power === 'strong' ? 0.85 : 1)
          * (near ? 1.25 : far ? 0.85 : 1);
        const dur = (kind === 'drop' ? rand(7, 13) : kind === 'whirl' ? rand(3.2, 5.8) : rand(2.6, 5)) * speed;
        const delay = rand(0, kind === 'whirl' ? 2.2 : 3.4);

        p.style.setProperty('--size', `${size.toFixed(1)}px`);
        p.style.setProperty('--dur', `${dur.toFixed(2)}s`);
        p.style.setProperty('--delay', `${delay.toFixed(2)}s`);
        // 큰 잎은 묵직하게 덜 돌고, 작은 잎은 팔랑팔랑 많이 돈다
        p.style.setProperty('--spin', `${Math.round(near ? rand(100, 320) : far ? rand(280, 720) : rand(180, 520)) * (Math.random() < 0.5 ? -1 : 1)}deg`);
        p.style.setProperty('--a0', `${rand(0, 360).toFixed(0)}deg`);
        // 먼 잎은 옅게(거리 안개) — 큰 잎이 또렷한 주인공이 된다
        p.style.setProperty('--peak', (near ? rand(0.85, 1) : far ? rand(0.45, 0.65) : rand(0.65, 0.9)).toFixed(2));

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
