// classify-yanggok 순수함수 테스트 — node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isYanggokRoster, extractRegion, extractMonth, extractCategory, planMail,
} from './classify-yanggok.mjs';

// ── 양곡 판정 (실측 제목 2026-06~07) ────────────────────────────
test('양곡 명단 메일 판정 — 실측 제목', () => {
  assert.equal(isYanggokRoster('FW: 2026년 7월 종로구 경로당 양곡배송목록'), true);
  assert.equal(isYanggokRoster('26.7월 양곡배송 요청드립니다.'), true);
  assert.equal(isYanggokRoster('FW: [서울시 중구]2026년 2분기 경로당 양곡 인수 및 배송 요청'), true);
  assert.equal(isYanggokRoster('2026. 6월 정부양곡 인수지시서 그린택배(주)'), true);
  assert.equal(isYanggokRoster('(최종)26년 6월 정부양곡 배송 명단(수급자 , 차상위) '), true);
  assert.equal(isYanggokRoster('FW: (양평군)(추가 2포) 복지미 정부양곡 수령 인수지시서 송부'), true);
});

test('비대상 제외 — 청구·결과보고·영플·일반', () => {
  assert.equal(isYanggokRoster('미소 여주시양곡배송비 청구입니다.'), false);
  assert.equal(isYanggokRoster('FW: 2026년 종로구 경로당 양곡 배송 결과 보고 드립니다~'), false);
  assert.equal(isYanggokRoster('7월 발주서 입니다.'), false);
  assert.equal(isYanggokRoster('[오산시보건소] 7월 발주서 수정본'), false);
  assert.equal(isYanggokRoster('세금계산서 발행 안내'), false);
  assert.equal(isYanggokRoster('희망2026-0163[공문] 2026년 충청북도 음성군 정부양곡배송 수행기관 선정심사 결과 안내'), false);
  assert.equal(isYanggokRoster('동대문구 정부양곡배송 수행기관 모집 신청서 제출'), false);
  assert.equal(isYanggokRoster(''), false);
});

// ── 지역 추출 ───────────────────────────────────────────────────
test('지역 — 제목 우선', () => {
  assert.equal(extractRegion('FW: 2026년 7월 종로구 경로당 양곡배송목록'), '종로구');
  assert.equal(extractRegion('FW: [서울시 중구]2026년 2분기 경로당 양곡 인수 및 배송 요청'), '중구');
  assert.equal(extractRegion('FW: 중원구 6월 양곡 배송 명단'), '중원구'); // 중구 오탐 금지
  assert.equal(extractRegion('양곡 명단(오정구)'), '부천시 오정구');
  assert.equal(extractRegion('[원미구청] 26.7월 양곡배송 명단 송부'), '부천시 원미구');
  assert.equal(extractRegion('2026년 6월 양곡대상자 명단(최종) 여주'), '여주시');
  assert.equal(extractRegion('X월정부양곡 신청현황(경기도 시흥시청)'), '시흥시');
  assert.equal(extractRegion('(수원시)2026년 7월 양곡 신청 경로당 현황'), '수원시');
});

test('지역 — 발신자 폴백·미분류', () => {
  assert.equal(extractRegion('(최종)26년 6월 정부양곡 배송 명단(수급자, 차상위)', 'mirnish@ddm.go.kr'), '동대문구');
  assert.equal(extractRegion('26.7월 양곡배송 요청드립니다.', 'yhr0304@korea.kr'), '수원시');
  assert.equal(extractRegion('양곡 명단입니다.', 'pmspage@korea.kr'), '여주시');
  assert.equal(extractRegion('정부양곡 인수지시서 그린택배(주)', 'social9@hanmail.net'), '미분류');
});

// ── 월 추출 ─────────────────────────────────────────────────────
test('월 — 제목 패턴', () => {
  assert.equal(extractMonth('FW: 2026년 7월 종로구 경로당 양곡배송목록', '2026-07-06T13:18'), '2026-07');
  assert.equal(extractMonth('26.7월 양곡배송 요청드립니다.', '2026-07-06T09:44'), '2026-07');
  assert.equal(extractMonth('(최종)26년 6월 정부양곡 배송 명단', '2026-06-26T10:00'), '2026-06');
  assert.equal(extractMonth('7월분 기초수급자 양곡 명단', '2026-07-02T08:00'), '2026-07');
});

test('월 — 패턴 없으면 수신월(KST 로컬부)', () => {
  assert.equal(extractMonth('FW: [서울시 중구]2026년 2분기 경로당 양곡 인수 및 배송 요청', '2026-06-30T09:55'), '2026-06');
  assert.equal(extractMonth('양곡 명단입니다.', '2026-07-03T10:00'), '2026-07');
});

test('월 — 연말·연초 경계 보정', () => {
  assert.equal(extractMonth('1월 양곡 명단', '2026-12-28T10:00'), '2027-01');
  assert.equal(extractMonth('12월 양곡 명단', '2027-01-03T10:00'), '2026-12');
});

// ── 구분 ────────────────────────────────────────────────────────
test('구분 추출', () => {
  assert.equal(extractCategory('2026. 6월 정부양곡 인수지시서 그린택배(주)'), '인수지시서');
  assert.equal(extractCategory('FW: 2026년 7월 종로구 경로당 양곡배포 명단'), '배송명단');
  assert.equal(extractCategory('26.7월 양곡배송 요청드립니다.', '(수원시)2026년 7월 양곡 신청 경로당 현황.xlsx'), '배송명단');
  assert.equal(extractCategory('양곡 배송 요청'), '전체');
});

// ── 종합 계획 ───────────────────────────────────────────────────
test('planMail — 회원사 지역은 공개, 미지정 지역은 관리자전용', () => {
  const jongno = planMail({ subject: 'FW: 2026년 7월 종로구 경로당 양곡배송목록', from: 'lhs3635@wssc.kr', date: '2026-07-06T13:18', attachments: 1 });
  assert.equal(jongno.register, true);
  assert.equal(jongno.region, '종로구');
  assert.equal(jongno.month, '2026-07');
  assert.equal(jongno.adminOnly, false);

  const suwon = planMail({ subject: '26.7월 양곡배송 요청드립니다.', from: 'yhr0304@korea.kr', date: '2026-07-06T09:44', attachments: 2 });
  assert.equal(suwon.register, true);
  assert.equal(suwon.region, '수원시');
  assert.equal(suwon.adminOnly, true);

  const noAtt = planMail({ subject: '26.7월 양곡배송 요청드립니다.', from: 'yhr0304@korea.kr', date: '2026-07-06', attachments: 0 });
  assert.equal(noAtt.register, false);

  const bill = planMail({ subject: '미소 여주시양곡배송비 청구입니다.', from: 'alth0093@daum.net', date: '2026-07-01', attachments: 1 });
  assert.equal(bill.register, false);
});
