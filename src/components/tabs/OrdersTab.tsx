import React from 'react';
import { Truck, Save } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { REGION_ORDER, getRegionTheme } from '../../constants/regions';
import { PARTNER_REGIONS_INVERSE } from '../../constants/members';
import { parseNumber, formatNumber, CLOSED_MSG } from '../../lib/utils';
import ExcelIcon from '../shared/ExcelIcon';

declare global {
  interface Window { XLSX: any; }
}

interface OrdersTabProps {
  onOpenConflict: (region: string) => void;
}

export default function OrdersTab({ onOpenConflict }: OrdersTabProps) {
  const {
    orders, setOrders, partnerInputs, setPartnerInputs, partnerAggregatedOrders,
    getEffectiveOrder, orderSummaries, isClosed, isSaving,
    showToast, handleSaveField, currentMonth, setIsSaving,
  } = useApp();

  const handleOrderChange = (r: string, f: string, v: string) => {
    if (isClosed) return showToast(CLOSED_MSG);
    const numV = v === '' ? '' : parseNumber(v);
    setOrders(prev => ({ ...prev, [r]: { ...(prev[r] || { basicQty: 0, povertyQty: 0 }), [f]: numV } }));
  };

  const handleIndividualOrderSave = async (region: string) => {
    if (isClosed) return showToast(CLOSED_MSG);
    setIsSaving(true);
    try {
      const partners = PARTNER_REGIONS_INVERSE[region] || [];
      let nextPartnerInputs = partnerInputs;
      if (partners.length === 1) {
        const comp = partners[0];
        const o = orders[region] || {};
        nextPartnerInputs = {
          ...partnerInputs,
          [comp]: { ...(partnerInputs[comp] || {}), [region]: { basicQty: o.basicQty, povertyQty: o.povertyQty } },
        };
        setPartnerInputs(nextPartnerInputs);
        await handleSaveField('partnerInputs', nextPartnerInputs);
      }
      await handleSaveField('orders', orders);
      showToast(`[${region}] 포수 입력이 저장되었습니다.`);
    } catch (e) { showToast('저장 오류: ' + (e as Error).message); }
    finally { setIsSaving(false); }
  };

  const handleDownloadOrdersExcel = () => {
    if (!window.XLSX) return showToast('엑셀 엔진 준비 중입니다.');
    const wb = window.XLSX.utils.book_new();
    const wsData: (string | number)[][] = [['지역명', '차상위수량', '수급자수량', '합계']];
    REGION_ORDER.forEach(r => {
      const o = orders[r] || {};
      const pSum = partnerAggregatedOrders[r] || { basicQty: 0, povertyQty: 0 };
      const pov = (o.povertyQty === undefined || o.povertyQty === '') ? pSum.povertyQty : o.povertyQty;
      const bas = (o.basicQty === undefined || o.basicQty === '') ? pSum.basicQty : o.basicQty;
      wsData.push([r, pov as number, bas as number, (pov as number) + (bas as number)]);
    });
    const ws = window.XLSX.utils.aoa_to_sheet(wsData);
    window.XLSX.utils.book_append_sheet(wb, ws, '포수입력현황');
    window.XLSX.writeFile(wb, `${currentMonth}_본사_포수입력현황.xlsx`);
    showToast('포수입력 내역이 엑셀로 다운로드되었습니다.');
  };

  return (
    <div className="animate-in fade-in duration-500 space-y-6 sm:space-y-8">
      {/* Summary + Excel panel */}
      <div className="flex flex-col xl:flex-row gap-4 sm:gap-6 mb-6 sm:mb-10">
        <div className="flex-1 bg-white border border-slate-200 rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-sm flex flex-col justify-between gap-3 sm:gap-4">
          <div className="flex justify-between items-center pb-2 border-b border-slate-100">
            <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm sm:text-base">
              <Truck className="text-slate-700" size={20} /> 본사 지정 양곡 물량 현황
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className="flex flex-col items-center justify-center p-3 sm:p-4 bg-slate-50 rounded-lg sm:rounded-xl border border-slate-200">
              <span className="text-[10px] sm:text-xs font-bold text-slate-500 mb-0.5 sm:mb-1">차상위 배송 총합</span>
              <span className="text-xl sm:text-3xl font-black text-slate-800">{formatNumber(orderSummaries.povertyTotal)} <small className="text-[10px] sm:text-xs font-bold text-slate-400">포</small></span>
            </div>
            <div className="flex flex-col items-center justify-center p-3 sm:p-4 bg-slate-50 rounded-lg sm:rounded-xl border border-slate-200">
              <span className="text-[10px] sm:text-xs font-bold text-slate-500 mb-0.5 sm:mb-1">수급자 배송 총합</span>
              <span className="text-xl sm:text-3xl font-black text-slate-800">{formatNumber(orderSummaries.basicTotal)} <small className="text-[10px] sm:text-xs font-bold text-slate-400">포</small></span>
            </div>
            <div className="flex flex-col items-center justify-center p-3 sm:p-4 rounded-lg sm:rounded-xl text-white"
              style={{ background: 'linear-gradient(135deg,#0284c7,#38bdf8)', boxShadow: '0 4px 16px rgba(14,165,233,.4)' }}>
              <span className="text-[10px] sm:text-xs font-bold text-sky-100 mb-0.5 sm:mb-1">전체 배송량</span>
              <span className="text-xl sm:text-3xl font-black">{formatNumber(orderSummaries.overallTotal)}</span>
            </div>
          </div>
        </div>
        <div className="xl:w-80 glass rounded-xl p-3 sm:p-4 flex flex-col justify-center gap-2">
          <h4 className="text-sky-700 font-bold text-xs sm:text-sm flex items-center gap-1 sm:gap-2 mb-1">포수 데이터 다운로드</h4>
          <button onClick={handleDownloadOrdersExcel} className="w-full flex items-center justify-center gap-1 bg-[#107C41] hover:bg-[#185C37] text-white py-1.5 sm:py-2 rounded-md text-[10px] sm:text-xs font-bold transition-all whitespace-nowrap shadow-sm">
            <ExcelIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> 엑셀 다운로드
          </button>
        </div>
      </div>

      {/* Region cards */}
      <div className="grid grid-cols-1 gap-4 sm:gap-6">
        {REGION_ORDER.map(r => {
          const o = orders[r] || {};
          const theme = getRegionTheme(r);
          const pSum = partnerAggregatedOrders[r] || { basicQty: 0, povertyQty: 0 };
          const partnersInRegion = PARTNER_REGIONS_INVERSE[r] || [];

          const isSinglePartner = partnersInRegion.length === 1;
          const hasAdminInput = (o.povertyQty !== undefined && o.povertyQty !== '') || (o.basicQty !== undefined && o.basicQty !== '');
          const allPartnersHaveInput = partnersInRegion.length > 0 && partnersInRegion.every(m => {
            const pData = partnerInputs[m]?.[r] || {};
            return (pData.basicQty !== undefined && pData.basicQty !== '') || (pData.povertyQty !== undefined && pData.povertyQty !== '');
          });

          const isConflictP = !isSinglePartner && (o.povertyQty !== undefined && o.povertyQty !== '') && Number(o.povertyQty) !== pSum.povertyQty;
          const isConflictB = !isSinglePartner && (o.basicQty !== undefined && o.basicQty !== '') && Number(o.basicQty) !== pSum.basicQty;
          const hasConflict = hasAdminInput && allPartnersHaveInput && (isConflictP || isConflictB);
          const isWaiting = !isSinglePartner && hasAdminInput && !allPartnersHaveInput;

          const agg = getEffectiveOrder(r);
          const tr = agg.basicQty + agg.povertyQty;
          const isPovEmpty = o.povertyQty === undefined || o.povertyQty === '';
          const isBasEmpty = o.basicQty === undefined || o.basicQty === '';

          return (
            <div
              key={r}
              className={`border rounded-xl sm:rounded-2xl overflow-hidden transition-all shadow-sm ${hasConflict ? 'border-red-400 shadow-red-100' : 'border-slate-200'}`}
              style={{ borderLeftWidth: 4, borderLeftColor: hasConflict ? '#f87171' : theme.dot }}
            >
              <div
                className={`px-4 sm:px-6 py-3 sm:py-4 border-b flex justify-between items-center ${hasConflict ? 'bg-red-50 border-red-200' : 'border-slate-200'}`}
                style={hasConflict ? undefined : { background: theme.bg }}
              >
                <div className="flex items-center gap-2 sm:gap-3">
                  <span
                    className="text-[10px] font-black px-1.5 py-0.5 rounded-md shrink-0 bg-white"
                    style={{ color: theme.text, border: `1px solid ${theme.border}` }}
                  >
                    {theme.group}
                  </span>
                  <h3 className="font-bold text-slate-800 text-base sm:text-lg">{r}</h3>
                  <button onClick={() => handleIndividualOrderSave(r)} disabled={isClosed || isSaving} className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded shadow-sm text-[10px] sm:text-xs font-bold transition-colors disabled:opacity-50 ml-2">
                    <Save size={12} /> 포수저장
                  </button>
                </div>
                <div className="flex items-center gap-2 sm:gap-4 text-right">
                  {isSinglePartner && hasAdminInput ? (
                    <div className="flex items-center gap-1 sm:gap-2 font-bold px-2 sm:px-4 py-1 sm:py-1.5 rounded-md text-[10px] sm:text-xs border bg-emerald-50 text-emerald-700 border-emerald-200">
                      ✅ 자동 확인 (총 {formatNumber(tr)}포)
                    </div>
                  ) : !hasAdminInput ? (
                    <div className="flex items-center gap-1 sm:gap-2 font-bold px-2 sm:px-4 py-1 sm:py-1.5 rounded-md text-[10px] sm:text-xs border bg-slate-100 text-slate-500 border-slate-300">
                      ✅ 회원사 실적 합산중 (총 {formatNumber(tr)}포)
                    </div>
                  ) : isWaiting ? (
                    <div className="flex items-center gap-1 sm:gap-2 font-bold px-2 sm:px-4 py-1 sm:py-1.5 rounded-md text-[10px] sm:text-xs border bg-orange-50 text-orange-600 border-orange-200">
                      ⏳ 회원사 실적 대기중 (본사: {formatNumber(tr)}포)
                    </div>
                  ) : hasConflict ? (
                    <button onClick={() => onOpenConflict(r)} className="flex items-center gap-1 sm:gap-2 font-bold px-2 sm:px-4 py-1 sm:py-1.5 rounded-md text-[10px] sm:text-xs border bg-red-500 text-white border-red-600 shadow-sm animate-pulse hover:bg-red-600 transition-colors">
                      🚨 불일치 (조정 필요)
                    </button>
                  ) : (
                    <div className="flex items-center gap-1 sm:gap-2 font-bold px-2 sm:px-4 py-1 sm:py-1.5 rounded-md text-[10px] sm:text-xs border bg-blue-50 text-blue-700 border-blue-200">
                      ✅ 검증 완료 (총 {formatNumber(tr)}포)
                    </div>
                  )}
                </div>
              </div>
              <div className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-12 gap-4 sm:gap-8 bg-white">
                <div className="md:col-span-6 flex flex-col justify-between border-b border-slate-100 pb-4 md:border-none md:pb-0">
                  <div className="space-y-3 sm:space-y-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 sm:gap-4 p-1">
                      <span className="text-[10px] sm:text-xs font-bold text-slate-500 w-16">차상위용</span>
                      <div className="flex items-center gap-1 w-full sm:w-auto relative">
                        <input
                          type="text"
                          disabled={isClosed}
                          value={isPovEmpty ? '' : formatNumber(Number(o.povertyQty))}
                          onChange={(e) => handleOrderChange(r, 'povertyQty', e.target.value)}
                          onFocus={(e) => e.target.select()}
                          placeholder={formatNumber(pSum.povertyQty)}
                          title="본사 수량을 비우면 회원사 합계로 자동 대체됩니다."
                          className={`w-full sm:w-32 p-1.5 sm:p-2 border rounded-md sm:rounded-lg text-right text-sm sm:text-lg outline-none transition-colors ${
                            hasConflict && isConflictP ? 'bg-red-50 border-red-300 text-red-700 font-black' :
                            isPovEmpty ? 'bg-slate-50 border-slate-200 font-bold text-slate-400' :
                            'bg-white border-slate-400 text-black font-black shadow-sm disabled:opacity-50'
                          }`}
                        />
                        {isPovEmpty && <span className="absolute right-3 text-[10px] font-bold text-slate-400 pointer-events-none opacity-50">자동</span>}
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 sm:gap-4 p-1">
                      <span className="text-[10px] sm:text-xs font-bold text-slate-500 w-16">수급자용</span>
                      <div className="flex items-center gap-1 w-full sm:w-auto relative">
                        <input
                          type="text"
                          disabled={isClosed}
                          value={isBasEmpty ? '' : formatNumber(Number(o.basicQty))}
                          onChange={(e) => handleOrderChange(r, 'basicQty', e.target.value)}
                          onFocus={(e) => e.target.select()}
                          placeholder={formatNumber(pSum.basicQty)}
                          title="본사 수량을 비우면 회원사 합계로 자동 대체됩니다."
                          className={`w-full sm:w-32 p-1.5 sm:p-2 border rounded-md sm:rounded-lg text-right text-sm sm:text-lg outline-none transition-colors ${
                            hasConflict && isConflictB ? 'bg-red-50 border-red-300 text-red-700 font-black' :
                            isBasEmpty ? 'bg-slate-50 border-slate-200 font-bold text-slate-400' :
                            'bg-white border-slate-400 text-black font-black shadow-sm disabled:opacity-50'
                          }`}
                        />
                        {isBasEmpty && <span className="absolute right-3 text-[10px] font-bold text-slate-400 pointer-events-none opacity-50">자동</span>}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-200 flex justify-between items-center px-3 bg-slate-50 rounded-lg py-2 shadow-inner">
                    <span className="text-[10px] sm:text-xs font-bold text-slate-500">
                      본사(지자체) 입력 합계 {(isPovEmpty && isBasEmpty) && <span className="text-slate-400 font-normal ml-1">(자동)</span>}
                    </span>
                    <span className={`text-sm sm:text-lg transition-colors ${(isPovEmpty && isBasEmpty) ? 'text-slate-400 font-bold opacity-60' : 'text-black font-black'}`}>
                      {formatNumber(tr)} 포
                    </span>
                  </div>
                </div>
                <div className="md:col-span-6 flex flex-col justify-between">
                  <div className="space-y-1.5 sm:space-y-2 flex flex-col justify-center">
                    {PARTNER_REGIONS_INVERSE[r]?.map(m => {
                      const pData = partnerInputs[m]?.[r] || {};
                      const pQty = (Number(pData.basicQty) || 0) + (Number(pData.povertyQty) || 0);
                      return (
                        <div key={m} className="flex items-center justify-between px-3 sm:px-4 py-1.5 sm:py-2 rounded-md sm:rounded-lg border border-slate-100 bg-slate-50">
                          <div className="flex items-center gap-1 sm:gap-2 font-bold text-[10px] sm:text-xs text-slate-600 truncate">
                            <span className="text-xs sm:text-sm">🔒</span> {m}
                          </div>
                          <div className="w-20 sm:w-24 text-right shrink-0">
                            <span className="block font-black text-slate-800 text-sm sm:text-lg pr-1 sm:pr-2">{formatNumber(pQty)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-4 pt-3 border-t border-blue-200 flex justify-between items-center px-3 bg-blue-50 rounded-lg py-2 shadow-inner">
                    <span className="text-[10px] sm:text-xs font-bold text-blue-700">해당 지역 회원사 합계</span>
                    <span className="text-sm sm:text-lg font-black text-blue-800">{formatNumber((pSum.basicQty || 0) + (pSum.povertyQty || 0))} 포</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
