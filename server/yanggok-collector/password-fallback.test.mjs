// password-fallback 회귀 테스트 — node --test.
//   형 규칙 ②(2026-07-26): 본문/파일명에 암호 없으면 저장된(지자체별) 암호로 복호.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pwCandidates } from './password-fallback.mjs';

test('추출 암호가 맨 앞, 저장 암호가 폴백으로 뒤에', () => {
  assert.deepEqual(pwCandidates('1234', new Set(['5678', '9999'])), ['1234', '5678', '9999']);
});

test('추출 암호 없으면 저장 암호만', () => {
  assert.deepEqual(pwCandidates(null, new Set(['5678'])), ['5678']);
  assert.deepEqual(pwCandidates('', new Set(['5678', '4321'])), ['5678', '4321']);
});

test('저장 암호 없으면 추출 암호만', () => {
  assert.deepEqual(pwCandidates('1234', null), ['1234']);
  assert.deepEqual(pwCandidates('1234', new Set()), ['1234']);
});

test('중복 제거 — 추출=저장 중 하나면 한 번만', () => {
  assert.deepEqual(pwCandidates('1234', new Set(['1234', '5678'])), ['1234', '5678']);
});

test('둘 다 없으면 빈 배열(추측 금지 — 시도 안 함)', () => {
  assert.deepEqual(pwCandidates(null, null), []);
  assert.deepEqual(pwCandidates('', new Set()), []);
});

test('숫자/문자 혼재도 문자열로 일관', () => {
  assert.deepEqual(pwCandidates(2026, new Set([4569])), ['2026', '4569']);
});
