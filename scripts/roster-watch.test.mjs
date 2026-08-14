// 명단 열람 이상 판정 회귀 — functions/rosterWatch.js
//   실행: node scripts/roster-watch.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { detectAnomalies, formatAlert, kstHour, DEFAULTS } = require('../functions/rosterWatch.js');

// 기준시각을 고정한다 — "오늘 몇 시냐"에 따라 결과가 달라지면 회귀가 아니다.
const NOON_KST = '2026-08-14T03:00:00.000Z';   // KST 12:00
const NIGHT_KST = '2026-08-14T18:30:00.000Z';  // KST 03:30 (다음날)

const rows = (n, at, extra = {}) =>
  Array.from({ length: n }, (_, i) => ({ at, region: `지역${i}`, ...extra }));

test('창 밖의 기록은 세지 않는다', () => {
  const old = new Date(new Date(NOON_KST).getTime() - 60 * 60 * 1000).toISOString();
  const f = detectAnomalies(rows(20, old), { now: NOON_KST });
  assert.equal(f.length, 0);
});

test('대량 내려받기를 잡는다', () => {
  const f = detectAnomalies(rows(DEFAULTS.bulkDownloads, NOON_KST), { now: NOON_KST });
  assert.ok(f.some((x) => x.kind === 'bulk_download'));
});

test('임계 바로 아래는 안 잡는다', () => {
  const n = DEFAULTS.bulkDownloads - 1;
  const same = Array.from({ length: n }, () => ({ at: NOON_KST, region: '동대문구' }));
  const f = detectAnomalies(same, { now: NOON_KST });
  assert.equal(f.filter((x) => x.kind === 'bulk_download').length, 0);
});

test('여러 지역을 훑으면 잡는다', () => {
  const f = detectAnomalies(rows(DEFAULTS.distinctRegions, NOON_KST), { now: NOON_KST });
  assert.ok(f.some((x) => x.kind === 'many_regions'));
});

test('같은 지역만 여러 번은 지역 규칙에 안 걸린다', () => {
  const same = Array.from({ length: 6 }, () => ({ at: NOON_KST, region: '여주시' }));
  const f = detectAnomalies(same, { now: NOON_KST });
  assert.equal(f.filter((x) => x.kind === 'many_regions').length, 0);
});

test('심야 내려받기를 잡는다', () => {
  const night = Array.from({ length: DEFAULTS.nightDownloads },
    () => ({ at: NIGHT_KST, region: '동대문구' }));
  const f = detectAnomalies(night, { now: NIGHT_KST });
  assert.ok(f.some((x) => x.kind === 'night_download'));
});

test('낮에는 심야 규칙이 안 걸린다', () => {
  const day = Array.from({ length: 6 }, () => ({ at: NOON_KST, region: '동대문구' }));
  const f = detectAnomalies(day, { now: NOON_KST });
  assert.equal(f.filter((x) => x.kind === 'night_download').length, 0);
});

test('관리자 전용 명단 접근은 항상 알린다', () => {
  const f = detectAnomalies([{ at: NOON_KST, region: '수원시', adminOnly: true }], { now: NOON_KST });
  assert.ok(f.some((x) => x.kind === 'admin_only_access'));
});

test('KST 변환 — UTC 18:30 은 KST 03시', () => {
  assert.equal(kstHour(NIGHT_KST), 3);
});

test('잘못된 입력에 죽지 않는다', () => {
  assert.deepEqual(detectAnomalies(null), []);
  assert.deepEqual(detectAnomalies([{ at: 'not-a-date' }], { now: NOON_KST }), []);
  assert.deepEqual(detectAnomalies([{}], { now: NOON_KST }), []);
});

test('경보 문구에 누가·무엇·언제가 들어간다', () => {
  const t = formatAlert({ email: 'a@b.c', company: '참자연' },
    [{ message: '테스트 사유' }], NOON_KST);
  assert.match(t, /a@b\.c/);
  assert.match(t, /참자연/);
  assert.match(t, /테스트 사유/);
  assert.match(t, /2026-08-14 12:00/);   // KST 로 표기되는지
});
