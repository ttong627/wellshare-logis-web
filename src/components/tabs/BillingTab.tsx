import React from 'react';
import { useApp } from '../../context/AppContext';
import { formatNumber, formatCur } from '../../lib/utils';
import { getRegionBgColorClass } from '../../constants/regions';
import ExcelIcon from '../shared/ExcelIcon';

export default function BillingTab() {
  const { billingReport, formattedMonthStr, currentMonth, showToast } = useApp();

  const generateAdvancedBillingExcel = () => {
    if (!window.XLSX) return showToast('엑셀 엔진을 준비 중입니다. 잠시 후 다시 시도해주세요.');
    const wb = window.XLSX.utils.book_new();
    const wsData: any[][] = [];
    const merges: any[] = [];

    wsData.push([`${currentMonth.replace('-', '년 ')}월 웰쉐어 사회적협동조합 세금계산서 발행내역 (희망나르미 발행분)`, '', '', '', '', '', '', '', '', `${currentMonth}`]);
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } });

    wsData.push(['행정시', '행정구', '구분', '단위', '품명', '수량', '공급가', '세액', '합계', '비고']);

    let rIdx = 2;
    billingReport.report.forEach(item => {
      wsData.push([item.city, item.region, '차상위', '10Kg', '차상위 배송비', item.poverty.qty, item.poverty.sup, item.poverty.vat, item.poverty.tot, '']);
      wsData.push([item.city, item.region, '수급자', '10Kg', '수급자 배송비', item.basic.qty, item.basic.sup, item.basic.vat, item.basic.tot, '']);
      wsData.push([item.city, item.region, '합계', '', '', item.sum.qty, item.sum.supply, item.sum.vat, item.sum.amount, '']);
      merges.push({ s: { r: rIdx, c: 0 }, e: { r: rIdx + 2, c: 0 } });
      merges.push({ s: { r: rIdx, c: 1 }, e: { r: rIdx + 2, c: 1 } });
      merges.push({ s: { r: rIdx + 2, c: 0 }, e: { r: rIdx + 2, c: 2 } });
      rIdx += 3;
    });

    wsData.push(['경기도 합계', '', '', '', '', billingReport.gTotal.qty, billingReport.gTotal.supply, billingReport.gTotal.vat, billingReport.gTotal.amount, '']);
    merges.push({ s: { r: rIdx, c: 0 }, e: { r: rIdx, c: 4 } }); rIdx++;
    wsData.push(['서울시 합계', '', '', '', '', billingReport.sTotal.qty, billingReport.sTotal.supply, billingReport.sTotal.vat, billingReport.sTotal.amount, '']);
    merges.push({ s: { r: rIdx, c: 0 }, e: { r: rIdx, c: 4 } }); rIdx++;
    wsData.push(['전체 합계', '', '', '', '', billingReport.grandTotal.qty, billingReport.grandTotal.supply, billingReport.grandTotal.vat, billingReport.grandTotal.amount, '']);
    merges.push({ s: { r: rIdx, c: 0 }, e: { r: rIdx, c: 4 } });

    const ws = window.XLSX.utils.aoa_to_sheet(wsData);
    ws['!merges'] = merges;
    ws['!cols'] = [{ wpx: 60 }, { wpx: 100 }, { wpx: 50 }, { wpx: 40 }, { wpx: 120 }, { wpx: 60 }, { wpx: 90 }, { wpx: 70 }, { wpx: 90 }, { wpx: 160 }];
    window.XLSX.utils.book_append_sheet(wb, ws, '세금계산서내역');
    window.XLSX.writeFile(wb, `${currentMonth}_희망나르미_세금계산서발행내역.xlsx`);
    showToast('엑셀 파일이 생성되었습니다.');
  };

  return (
    <div className="animate-in fade-in duration-500 space-y-6 sm:space-y-8">
      <div className="sky-hero flex flex-col md:flex-row justify-between items-start md:items-center p-6 sm:p-8 text-white gap-4">
        <div className="relative z-10">
          <div className="text-sky-200 font-bold text-[10px] sm:text-xs uppercase tracking-widest mb-1">Monthly Billing Report</div>
          <div className="text-2xl sm:text-4xl font-black tracking-tight" style={{ textShadow: '0 2px 8px rgba(0,0,0,.2)' }}>{formatCur(billingReport.grandTotal.amount)}</div>
        </div>
        <button
          onClick={generateAdvancedBillingExcel}
          className="w-full md:w-auto bg-[#107C41] hover:bg-[#185C37] text-white px-3 sm:px-5 py-1.5 sm:py-2 rounded-md sm:rounded-lg font-bold text-[10px] sm:text-xs shadow-md transition-all flex items-center justify-center gap-1.5 whitespace-nowrap"
        >
          <ExcelIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> 엑셀
        </button>
      </div>

      <div className="w-full bg-white mb-6 p-1 border border-slate-300 rounded-lg shadow-sm overflow-x-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        <table className="w-full border-collapse text-[7.5px] sm:text-[9px] md:text-[11px] lg:text-xs font-sans text-center tracking-tighter sm:tracking-normal whitespace-nowrap" style={{ border: '1px solid #000' }}>
          <thead>
            <tr>
              <td colSpan={10} className="text-left font-black text-xs sm:text-sm md:text-base lg:text-lg p-2 sm:p-4 bg-white" style={{ borderBottom: 'none' }}>
                {currentMonth.replace('-', '년 ')}월 웰쉐어 사회적협동조합 세금계산서 발행내역 (희망나르미 발행분)
              </td>
            </tr>
            <tr>
              <td colSpan={9} className="bg-white border-none"></td>
              <td className="text-center font-bold p-1 sm:p-2 bg-[#BFBFBF] border border-slate-400 text-black text-[9px] sm:text-xs whitespace-nowrap">{formattedMonthStr}</td>
            </tr>
            <tr className="bg-[#BFBFBF] text-black">
              {['행정시','행정구','구분','단위','품명','수량','공급가','세액','합계','비고 (완료일/지체일)'].map((h, i) => (
                <th key={i} className="border border-slate-400 p-0.5 sm:p-1 font-bold break-keep">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="border-b-2 border-black">
            {billingReport.report.map((item, idx) => {
              const regionBg = getRegionBgColorClass(item.region);
              return (
                <React.Fragment key={idx}>
                  <tr>
                    <td rowSpan={3} className="border border-slate-400 p-0.5 sm:p-1 text-center font-bold bg-white align-middle text-black">{item.city}</td>
                    <td rowSpan={3} className={`border border-slate-400 p-0.5 sm:p-1 text-center font-bold align-middle text-black ${regionBg}`}>{item.region}</td>
                    <td className="border border-slate-400 p-0.5 sm:p-1 text-center font-bold text-[#b91c1c] bg-[#fdf4ff]">차상위</td>
                    <td className="border border-slate-400 p-0.5 sm:p-1 text-center bg-white text-black">10Kg</td>
                    <td className="border border-slate-400 p-0.5 sm:p-1 text-left bg-white text-black">차상위 배송비</td>
                    <td className="border border-slate-400 p-0.5 sm:p-1 text-right font-bold bg-white text-black">{formatNumber(item.poverty.qty)}</td>
                    <td className="border border-slate-400 p-0.5 sm:p-1 text-right bg-white text-black">{formatNumber(item.poverty.sup)}</td>
                    <td className="border border-slate-400 p-0.5 sm:p-1 text-right bg-white text-black">{formatNumber(item.poverty.vat)}</td>
                    <td className="border border-slate-400 p-0.5 sm:p-1 text-right font-bold bg-white text-blue-800">{formatNumber(item.poverty.tot)}</td>
                    <td className="border border-slate-400 p-0.5 sm:p-1 text-center bg-white"></td>
                  </tr>
                  <tr>
                    <td className="border border-slate-400 p-0.5 sm:p-1 text-center font-bold text-[#0369a1] bg-[#ecfeff]">수급자</td>
                    <td className="border border-slate-400 p-0.5 sm:p-1 text-center bg-white text-black">10Kg</td>
                    <td className="border border-slate-400 p-0.5 sm:p-1 text-left bg-white text-black">수급자 배송비</td>
                    <td className="border border-slate-400 p-0.5 sm:p-1 text-right font-bold bg-white text-black">{formatNumber(item.basic.qty)}</td>
                    <td className="border border-slate-400 p-0.5 sm:p-1 text-right bg-white text-black">{formatNumber(item.basic.sup)}</td>
                    <td className="border border-slate-400 p-0.5 sm:p-1 text-right bg-white text-black">{formatNumber(item.basic.vat)}</td>
                    <td className="border border-slate-400 p-0.5 sm:p-1 text-right font-bold bg-white text-blue-800">{formatNumber(item.basic.tot)}</td>
                    <td className="border border-slate-400 p-0.5 sm:p-1 text-center bg-white"></td>
                  </tr>
                  <tr className="border-b-2 border-blue-900">
                    <td colSpan={3} className="border border-slate-400 p-0.5 sm:p-1 text-center font-bold bg-[#92D050] text-black tracking-widest">합계</td>
                    <td className="border border-slate-400 p-0.5 sm:p-1 text-right font-bold bg-[#92D050] text-black">{formatNumber(item.sum.qty)}</td>
                    <td className="border border-slate-400 p-0.5 sm:p-1 text-right font-bold bg-[#92D050] text-black">{formatNumber(item.sum.supply)}</td>
                    <td className="border border-slate-400 p-0.5 sm:p-1 text-right font-bold bg-[#92D050] text-black">{formatNumber(item.sum.vat)}</td>
                    <td className="border border-slate-400 p-0.5 sm:p-1 text-right font-bold bg-[#92D050] text-blue-900">{formatNumber(item.sum.amount)}</td>
                    <td className="border border-slate-400 p-0.5 sm:p-1 bg-[#92D050]"></td>
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
          <tfoot>
            {[
              { label: '경기도 합계', data: billingReport.gTotal, bg: '#FFD966', textColor: 'text-black' },
              { label: '서울시 합계', data: billingReport.sTotal, bg: '#A9D08E', textColor: 'text-black' },
              { label: '전체 합계', data: billingReport.grandTotal, bg: '#00B0F0', textColor: 'text-white' },
            ].map(({ label, data, bg, textColor }) => (
              <tr key={label}>
                <td colSpan={3} className={`border border-slate-400 p-1 sm:p-2 text-left font-bold break-keep ${textColor}`} style={{ backgroundColor: bg }}>{label}</td>
                <td className={`border border-slate-400 p-1 sm:p-2 text-center font-bold ${textColor}`} style={{ backgroundColor: bg }}>10Kg</td>
                <td className={`border border-slate-400 p-1 sm:p-2 text-left font-bold ${textColor}`} style={{ backgroundColor: bg }}>배송비</td>
                <td className={`border border-slate-400 p-1 sm:p-2 text-right font-bold ${textColor}`} style={{ backgroundColor: bg }}>{formatNumber(data.qty)}</td>
                <td className={`border border-slate-400 p-1 sm:p-2 text-right font-bold ${textColor}`} style={{ backgroundColor: bg }}>{formatNumber(data.supply)}</td>
                <td className={`border border-slate-400 p-1 sm:p-2 text-right font-bold ${textColor}`} style={{ backgroundColor: bg }}>{formatNumber(data.vat)}</td>
                <td className={`border border-slate-400 p-1 sm:p-2 text-right font-bold ${textColor}`} style={{ backgroundColor: bg }}>{formatNumber(data.amount)}</td>
                <td className="border border-slate-400 p-1 sm:p-2" style={{ backgroundColor: bg }}></td>
              </tr>
            ))}
          </tfoot>
        </table>
      </div>
    </div>
  );
}
