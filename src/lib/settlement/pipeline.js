// -*- coding: utf-8 -*-
/**
 * 파이프라인 — 화면(웹 페이지·React)이 호출하는 단일 진입점.
 *   파일 읽기 → 종류 판별 → 표준화 → 홈택스/이카운트 병합 → 대사 → 집계
 */
import { readTable } from './xlsx_read.js';
import { parseFile } from './parse.js';
import { mergeInvoices, crossCheckWarnings } from './merge.js';
import { reconcile, recompute, DEFAULTS } from './match.js';

export { DEFAULTS, recompute };

const KIND_LABEL = { hometax: '홈택스 세금계산서', ecount: '이카운트 판매내역', bank: '은행 거래내역' };

/** 오늘 날짜 'YYYY-MM-DD' (로컬 기준) */
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * @param {Array<{name: string, data: Blob|File|Uint8Array|ArrayBuffer}>} files
 * @param {object} options match.js 의 DEFAULTS 참고 (+ ownBizNo, asOf)
 */
export async function runSettlement(files, options = {}) {
  if (!files || !files.length) throw new Error('파일을 올려주세요.');

  const opt = { ...DEFAULTS, asOf: options.asOf || todayISO(), ...options };
  const parsed = [];
  const warnings = [];
  const sources = [];

  for (const file of files) {
    const table = await readTable(file.data ?? file, file.name);
    const result = parseFile(table, file.name, opt.ownBizNo || '');
    parsed.push(result);
    warnings.push(...result.warnings);
    sources.push({
      name: file.name,
      kind: result.kind,
      kindLabel: KIND_LABEL[result.kind] || result.kind,
      sheetName: result.sheetName,
      format: table.format,
      count: result.kind === 'bank' ? result.payments.length : result.invoices.length,
    });
  }

  const invoiceSets = parsed.filter((p) => p.kind !== 'bank');
  const bankSets = parsed.filter((p) => p.kind === 'bank');

  if (!invoiceSets.length) throw new Error('세금계산서 파일(홈택스 또는 이카운트)이 없습니다.');
  if (!bankSets.length) throw new Error('은행 거래내역 파일이 없습니다.');

  // 홈택스 자료가 있으면 거기서 추론한 우리 사업자번호를 기준으로 삼는다
  const ownBizNo = opt.ownBizNo
    || (invoiceSets.find((s) => s.kind === 'hometax' && s.ownBizNo) || {}).ownBizNo
    || '';

  const { invoices, crossCheck } = mergeInvoices(invoiceSets);
  const payments = bankSets.flatMap((s) => s.payments);

  if (!invoices.length) throw new Error('세금계산서 행을 하나도 읽지 못했습니다. 파일 형식을 확인해 주세요.');

  const result = reconcile(invoices, payments, opt);
  result.crossCheck = crossCheck;
  result.sources = sources;
  result.ownBizNo = ownBizNo;
  result.warnings = [...warnings, ...result.warnings, ...crossCheckWarnings(crossCheck)];
  return result;
}
