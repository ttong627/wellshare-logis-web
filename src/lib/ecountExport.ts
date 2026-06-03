// ECOUNT 판매입력 웹자료올리기 엑셀 생성
// billingReport(행정구별 운송비) → ECOUNT 판매입력 19열 서식으로 변환
import { BillingReport } from '../types';
import { getFullRegionName } from '../constants/regions';

// 급지 → ECOUNT 품목코드 (ECOUNT에 등록된 wsl_z1~z7)
export const ZONE_TO_PROD: Record<string, string> = {
  '1급지': 'wsl_z1', '2급지': 'wsl_z2', '3급지': 'wsl_z3', '4급지': 'wsl_z4',
  '5급지': 'wsl_z5', '6급지': 'wsl_z6', '7급지': 'wsl_z7',
};

// ECOUNT 판매입력 엑셀 헤더 (업로드 서식 열 순서 그대로)
const ECOUNT_SALE_HEADERS = [
  '일자', '순번', '거래처코드', '거래처명', '담당자', '출하창고', '거래유형', '통화', '환율',
  '품목코드', '품목명', '규격', '수량', '단가', '외화금액', '공급가액', '부가세', '적요', '생산전표생성',
];

export interface EcountExportOptions {
  custCode: string;   // 거래처코드 (예: 희망나르미 490-82-00102)
  custName: string;   // 거래처명
  warehouse: string;  // 출하창고 (예: 100)
  ioType: string;     // 거래유형(부가세유형). 비우면 ECOUNT 기본값 — 세금계산서 유형이어야 발행 가능
  ioDate: string;     // 일자 YYYYMMDD
  monthLabel: string; // 품목명용 (예: "5월")
  regions: Record<string, string>;                 // region → zone(급지)
  zonePrices: Record<string, { billing: number }>; // zone → 단가
}

// billingReport → ECOUNT 판매입력 행 배열 (행정구별 1전표, 순번 분리)
export function buildEcountSaleRows(report: BillingReport, opt: EcountExportOptions): (string | number)[][] {
  const rows: (string | number)[][] = [ECOUNT_SALE_HEADERS];
  report.report.forEach((item, idx) => {
    const zone = opt.regions[item.region] || '2급지';
    const prodCd = ZONE_TO_PROD[zone] || 'wsl_z2';
    const price = opt.zonePrices[zone]?.billing || 0;
    const prodName = `${getFullRegionName(item.region)} ${opt.monthLabel} 정부양곡배송비`;
    rows.push([
      opt.ioDate,        // 일자
      idx + 1,           // 순번 (행정구별 별도 전표)
      opt.custCode,      // 거래처코드
      opt.custName,      // 거래처명
      '',                // 담당자
      opt.warehouse,     // 출하창고
      opt.ioType,        // 거래유형
      '',                // 통화
      '',                // 환율
      prodCd,            // 품목코드
      prodName,          // 품목명
      '10kg',            // 규격
      item.sum.qty,      // 수량
      price,             // 단가
      '',                // 외화금액
      item.sum.supply,   // 공급가액
      item.sum.vat,      // 부가세
      '',                // 적요
      '',                // 생산전표생성
    ]);
  });
  return rows;
}

// 엑셀 다운로드 (window.XLSX 사용 — 기존 앱과 동일). 성공 시 true
export function downloadEcountSaleExcel(
  report: BillingReport,
  opt: EcountExportOptions,
  fileName: string,
): boolean {
  const XLSX = (window as unknown as { XLSX?: any }).XLSX;
  if (!XLSX) return false;
  const rows = buildEcountSaleRows(report, opt);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wpx: 70 }, { wpx: 40 }, { wpx: 90 }, { wpx: 140 }, { wpx: 60 }, { wpx: 70 },
    { wpx: 70 }, { wpx: 50 }, { wpx: 50 }, { wpx: 70 }, { wpx: 200 }, { wpx: 50 },
    { wpx: 60 }, { wpx: 70 }, { wpx: 70 }, { wpx: 90 }, { wpx: 80 }, { wpx: 80 }, { wpx: 80 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '판매입력');
  XLSX.writeFile(wb, fileName);
  return true;
}
