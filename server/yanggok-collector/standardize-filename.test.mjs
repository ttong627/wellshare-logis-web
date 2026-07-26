// standardize-filename 회귀 테스트 — node --test.
//   형 규칙(2026-07-26): 정부양곡 명단 저장 파일명 = "지자체_YYYY년MM월_원본명".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatMonthLabel, standardRosterFileName } from './standardize-filename.mjs';

test('formatMonthLabel — YYYY-MM → YYYY년MM월', () => {
  assert.equal(formatMonthLabel('2026-06'), '2026년06월');
  assert.equal(formatMonthLabel('2026-6'), '2026년06월');   // 한자리 월 패딩
  assert.equal(formatMonthLabel('2026-12'), '2026년12월');
});

test('formatMonthLabel — 빈값·이상값 → 빈 문자열', () => {
  assert.equal(formatMonthLabel(''), '');
  assert.equal(formatMonthLabel(null), '');
  assert.equal(formatMonthLabel('2026-13'), '');   // 월 범위 밖
  assert.equal(formatMonthLabel('abc'), '');
});

test('standardRosterFileName — 지자체+월 접두', () => {
  assert.equal(
    standardRosterFileName('동대문구', '2026-06', '수급자명단.xlsx'),
    '동대문구_2026년06월_수급자명단.xlsx',
  );
});

test('멱등 — 이미 규격화된 이름은 접두 재적용 안 함', () => {
  const once = standardRosterFileName('동대문구', '2026-06', '수급자명단.xlsx');
  const twice = standardRosterFileName('동대문구', '2026-06', once);
  assert.equal(twice, once);
});

test('월 없으면 지자체만, 지자체 없으면 월만', () => {
  assert.equal(standardRosterFileName('여주시', '', '명단.xlsx'), '여주시_명단.xlsx');
  assert.equal(standardRosterFileName('', '2026-06', '명단.xlsx'), '2026년06월_명단.xlsx');
  assert.equal(standardRosterFileName('', '', '명단.xlsx'), '명단.xlsx');
});

test('금지문자 치환 — 파일명 안전', () => {
  assert.equal(
    standardRosterFileName('중구', '2026-06', 'a/b:c.xlsx'),
    '중구_2026년06월_a_b_c.xlsx',
  );
});

test('공백 포함 지자체(부천시 원미구) 보존', () => {
  assert.equal(
    standardRosterFileName('부천시 원미구', '2026-07', '양곡명단.xlsx'),
    '부천시 원미구_2026년07월_양곡명단.xlsx',
  );
});

test('원본명 없으면 file 폴백', () => {
  assert.equal(standardRosterFileName('동대문구', '2026-06', ''), '동대문구_2026년06월_file');
});

test('zip·pdf 등 확장자 보존', () => {
  assert.equal(standardRosterFileName('동대문구', '2026-06', '수급자.zip'), '동대문구_2026년06월_수급자.zip');
  assert.equal(standardRosterFileName('중구', '2026-06', '인수지시서.pdf'), '중구_2026년06월_인수지시서.pdf');
});
