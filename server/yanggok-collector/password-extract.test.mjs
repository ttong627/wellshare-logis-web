// password-extract 회귀 테스트 — node --test. 실제 메일 본문 3건(2026-07-11 확인) 픽스처 포함.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractPasswordFromText, extractPassword } from './password-extract.mjs';

test('실측 — 동대문구청 메일(명단비번)', () => {
  const body = '안녕하세요? 동대문구 수급자 및 차상위 정부양곡 신청 명단 및 인수시지서 보내드립니다. (명단비번: 4569) -인수기한: 6.30.(화)';
  assert.equal(extractPasswordFromText(body), '4569');
});

test('실측 — 성남 중원구 메일(pw표기)', () => {
  const body = '중원구 2026년 6월 양곡배송명단(pw2026) 보내드립니다 중원구 사회복지과 이상훈';
  assert.equal(extractPasswordFromText(body), '2026');
});

test('실측 — 파일명 표기(여주시 희망나르미)', () => {
  const fileName = '2026년 6월 양곡대상자 명단(최종)_희망나르미 발송용(pw2729).xlsx';
  assert.equal(extractPasswordFromText(fileName), '2729');
});

test('비밀번호/암호 표기 변형', () => {
  assert.equal(extractPasswordFromText('첨부파일 비밀번호는 1234 입니다'), '1234');
  assert.equal(extractPasswordFromText('압축 암호 5678 확인해주세요'), '5678');
  assert.equal(extractPasswordFromText('암호: 9999'), '9999');
});

test('일반 메일(암호 언급 없음) → null', () => {
  assert.equal(extractPasswordFromText('안녕하세요, 7월 발주서 보내드립니다. 확인 부탁드립니다.'), null);
  assert.equal(extractPasswordFromText(''), null);
});

test('extractPassword — 파일명 최우선, 없으면 제목/본문 순', () => {
  assert.equal(extractPassword({ fileName: 'x(pw1111).xlsx', subject: '비번:2222', body: '비번:3333' }), '1111');
  assert.equal(extractPassword({ fileName: 'x.xlsx', subject: '비번:2222', body: '비번:3333' }), '2222');
  assert.equal(extractPassword({ fileName: 'x.xlsx', subject: '', body: '(명단비번: 4569)' }), '4569');
  assert.equal(extractPassword({ fileName: 'x.xlsx', subject: '', body: '' }), null);
});

test('오탐지 방지 — 2자리 이하 숫자는 무시', () => {
  assert.equal(extractPasswordFromText('비번12'), null); // 2자리 미달
});
