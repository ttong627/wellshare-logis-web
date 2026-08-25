export declare const XLSX_MIME: string;

export interface XlsxCell { v: string | number | null; s?: number; }
export interface XlsxSheet {
  name: string;
  columns?: { header: string; width?: number }[];
  widths?: number[];
  rows: (XlsxCell | string | number | null)[][];
}

/** 의존성 0 xlsx 작성기 — 다운로드할 때 호출부에서 Blob 으로 감싼다 */
export declare function writeXlsx(sheets: XlsxSheet[]): Promise<Uint8Array>;
export declare const S: Record<string, number>;
