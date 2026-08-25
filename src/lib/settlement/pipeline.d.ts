import type { SettlementInput, SettlementOptions, SettlementResult } from './types';

export declare const DEFAULTS: SettlementOptions;

/** 오늘 날짜 'YYYY-MM-DD' (로컬 기준) */
export declare function todayISO(): string;

/**
 * 엑셀 파일들 → 대사 결과.
 * 계산서 파일(홈택스/이카운트) 최소 1개 + 은행 거래내역 1개가 필요하다.
 */
export declare function runSettlement(
  files: SettlementInput[],
  options?: Partial<SettlementOptions>,
): Promise<SettlementResult>;

/**
 * 사용자가 '확인 필요' 건을 승인/거절한 뒤 잔액·상태를 다시 계산한다.
 * rejected=true 인 매칭은 없는 것으로 친다.
 */
export declare function recompute<T extends Pick<SettlementResult, 'invoices' | 'payments' | 'matches'>>(
  state: T,
  options?: Partial<SettlementOptions>,
): T;
