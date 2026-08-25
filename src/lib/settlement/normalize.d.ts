/** 금액을 '1,234,567' 형태로 */
export declare function won(n: number): string;
export declare function normCompany(name: unknown): string;
export declare function normBizNo(value: unknown): string;
export declare function parseAmount(value: unknown): number;
export declare function parseDate(value: unknown): string | null;
export declare function daysBetween(a: string | null, b: string | null): number | null;
export declare function addDays(iso: string, days: number): string;
