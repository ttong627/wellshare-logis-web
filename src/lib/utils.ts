export const safeRender = (val: unknown): string => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') return '[Object Error]';
  return String(val);
};

export const parseNumber = (val: unknown): number => {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  return Number(String(val).replace(/[^0-9]/g, '')) || 0;
};

export const formatNumber = (num: number | undefined | null): string => {
  return (num || num === 0) ? num.toLocaleString('ko-KR') : '0';
};

export const formatCur = (num: number): string =>
  new Intl.NumberFormat('ko-KR').format(num) + '원';

export const copyToClipboard = (text: string): void => {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(() => {});
  }
};

export const CLOSED_MSG = '마감되어서 자료 변경이 불가합니다. 관리자에게 문의해주십시요.';
