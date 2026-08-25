import type { Invoice, Payment, SourceKind } from './types';
import type { RawTable } from './xlsx_read';

/** kind 에 따라 invoices 또는 payments 중 한쪽만 채워진다 */
export interface ParsedFile {
  kind: SourceKind;
  invoices?: Invoice[];
  payments?: Payment[];
  ownBizNo?: string;
  sheetName: string;
  warnings: string[];
}

/** 시트 중 가장 그럴듯한 것을 골라 표준 레코드로 변환 */
export declare function parseFile(parsed: RawTable, filename: string, ownBizNo?: string): ParsedFile;
