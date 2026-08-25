import type { ReportMeta, SettlementResult } from './types';

/** 대사 결과 → 엑셀 리포트(시트 6장) 바이트 */
export declare function buildReport(result: SettlementResult, meta?: ReportMeta): Promise<Uint8Array>;
