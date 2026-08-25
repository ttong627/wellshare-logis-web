export interface RawSheet { name: string; rows: (string | number | boolean | null)[][]; }
export interface RawTable { format: 'xlsx' | 'html' | 'csv'; sheets: RawSheet[]; }

/** 파일 내용(매직바이트)으로 형식을 판별해 시트 배열로 읽는다 */
export declare function readTable(
  input: File | Blob | Uint8Array | ArrayBuffer,
  filename?: string,
): Promise<RawTable>;
