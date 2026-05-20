import React, { useRef } from 'react';
import { ReceiptText } from 'lucide-react';
import { addDoc, collection, setDoc, doc } from 'firebase/firestore';
import { db, APP_ID } from '../../firebase';
import { useApp } from '../../context/AppContext';
import { MEMBERS } from '../../constants/members';
import { formatNumber, safeRender, CLOSED_MSG } from '../../lib/utils';
import { getFullRegionName } from '../../constants/regions';
import ExcelIcon from '../shared/ExcelIcon';

export default function PartnerBillingTab() {
  const {
    billingSummary, formattedMonthStr, currentMonth,
    deliveryDates, publishRequests, publishDates, setPublishDates,
    selectedAdminViewCompany, setSelectedAdminViewCompany,
    isAdmin, partnerCompany, isClosed, isSaving, setIsSaving,
    showToast, user,
  } = useApp();

  const pubDateRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const filteredData = billingSummary.sorted.filter(m =>
    (isAdmin && selectedAdminViewCompany === '전체') ? true :
    (isAdmin ? m.member === selectedAdminViewCompany : m.member === partnerCompany)
  );

  const handleIndividualPublishSave = async (company: string, region: string, dateVal: string) => {
    if (isClosed && !isAdmin) return showToast(CLOSED_MSG);
    if (!dateVal) return showToast('발행 일자를 선택해주세요.');
    setIsSaving(true);
    try {
      const newPublishDates = {
        ...publishDates,
        [company]: { ...(publishDates[company] || {}), [region]: dateVal },
      };
      setPublishDates(newPublishDates);
      const ref = doc(db, 'artifacts', APP_ID, 'public', 'data', 'billing_records', currentMonth);
      await setDoc(ref, { publishDates: newPublishDates, updatedAt: new Date().toISOString(), updatedBy: user?.email }, { merge: true });

      const msgText = `[🧾발행완료] ${company} ${region} 세금계산서(${dateVal}) 발행이 완료되었습니다. 대금 결제 부탁드립니다.`;
      await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'notifications'), {
        message: msgText, target: 'ADMIN', timestamp: new Date().toISOString(),
      });
      showToast(`[${region}] 세금계산서 발급 처리가 완료되었습니다.`);
    } catch (e) { showToast('저장 오류: ' + (e as Error).message); }
    finally { setIsSaving(false); }
  };

  const handleClearPublish = async (company: string, region: string) => {
    if (isClosed && !isAdmin) return showToast(CLOSED_MSG);
    setIsSaving(true);
    try {
      const newPublishDates = { ...publishDates };
      if (newPublishDates[company]) {
        newPublishDates[company] = { ...newPublishDates[company] };
        delete newPublishDates[company][region];
      }
      setPublishDates(newPublishDates);
      const ref = doc(db, 'artifacts', APP_ID, 'public', 'data', 'billing_records', currentMonth);
      await setDoc(ref, { publishDates: newPublishDates, updatedAt: new Date().toISOString(), updatedBy: user?.email }, { merge: true });
      showToast(`[${region}] 세금계산서 발행이 일자수정 모드로 전환되었습니다.`);
    } catch (e) { showToast('취소 오류: ' + (e as Error).message); }
    finally { setIsSaving(false); }
  };

  const generatePartnerAdvancedBillingExcel = () => {
    if (!window.XLSX) return showToast('엑셀 엔진을 준비 중입니다. 잠시 후 다시 시도해주세요.');
    if (filteredData.length === 0) return showToast('다운로드할 데이터가 없습니다.');
    const wb = window.XLSX.utils.book_new();
    const wsData: any[][] = [];
    const merges: any[] = [];
    let rIdx = 0;

    filteredData.forEach((m, mIdx) => {
      if (mIdx > 0) { wsData.push([]); rIdx++; }
      wsData.push(['조합사 -> 웰쉐어 발행 내역', '', '', '', '', '', '', '', '', `${currentMonth.replace('-', '년 ')}월`]);
      merges.push({ s: { r: rIdx, c: 0 }, e: { r: rIdx, c: 8 } }); rIdx++;
      wsData.push(['조합사', '행정구', '단위', '품명', '수량', '공급가', '세액', '합계', '배송현황', '계산서 현황']); rIdx++;

      const startRow = rIdx;
      m.regions.forEach((r, i) => {
        const dData = deliveryDates[m.member]?.[r.region] || {};
        const deliveryText = dData.date ? `${dData.date} 완료` : '배송전';
        const reqDate = publishRequests[m.member]?.[r.region];
        const pubDate = publishDates[m.member]?.[r.region];
        let publishText = '발급전';
        if (pubDate) publishText = `${pubDate} 발급완료`;
        else if (reqDate) publishText = `${reqDate} 요청됨`;
        wsData.push([i === 0 ? m.member : '', getFullRegionName(r.region), '10Kg', '배송비', r.qty, r.supplyValue, r.vatValue, r.finalRowTotal, deliveryText, publishText]);
        rIdx++;
      });
      if (m.regions.length > 1) merges.push({ s: { r: startRow, c: 0 }, e: { r: rIdx - 1, c: 0 } });
      wsData.push(['소 계', '', '', '', m.totalQty, m.totalSupply, m.totalVat, m.totalAmount, '', '']);
      merges.push({ s: { r: rIdx, c: 0 }, e: { r: rIdx, c: 3 } }); rIdx++;
    });

    const ws = window.XLSX.utils.aoa_to_sheet(wsData);
    ws['!merges'] = merges;
    ws['!cols'] = [{ wpx: 120 }, { wpx: 100 }, { wpx: 40 }, { wpx: 60 }, { wpx: 50 }, { wpx: 90 }, { wpx: 90 }, { wpx: 100 }, { wpx: 120 }, { wpx: 120 }];
    window.XLSX.utils.book_append_sheet(wb, ws, '세금계산서내역확인');
    const compName = isAdmin ? (selectedAdminViewCompany === '전체' ? '전체회원사' : selectedAdminViewCompany) : (partnerCompany || '');
    window.XLSX.writeFile(wb, `${currentMonth}_${compName}_세금계산서내역.xlsx`);
    showToast('회원사 세금계산서 엑셀이 생성되었습니다.');
  };

  return (
    <div className="animate-in fade-in duration-500 space-y-4 sm:space-y-6 w-full">
      <div className="sky-hero flex flex-col md:flex-row justify-between items-start md:items-center mb-4 sm:mb-6 gap-3 sm:gap-4 p-5 sm:p-7 text-white">
        <div className="flex items-center gap-3 relative z-10">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,.18)', backdropFilter: 'blur(8px)' }}>
            <ReceiptText size={22} className="text-white" />
          </div>
          <div>
            <div className="text-sky-200 text-[10px] font-bold uppercase tracking-widest mb-0.5">Tax Invoice</div>
            <h2 className="text-lg sm:text-xl font-black" style={{ textShadow: '0 2px 8px rgba(0,0,0,.2)' }}>세금계산서 내역확인</h2>
            <p className="text-[10px] sm:text-sm font-medium text-sky-200 mt-0.5">본사의 요청에 따라 날짜를 지정하고 [발급]을 눌러주십시오.</p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-2 w-full md:w-auto relative z-10">
          {isAdmin && (
            <select
              value={selectedAdminViewCompany}
              onChange={(e) => setSelectedAdminViewCompany(e.target.value)}
              className="w-full sm:w-auto border border-white/30 bg-white/15 text-white px-3 sm:px-4 py-2 rounded-xl font-bold text-xs sm:text-sm outline-none cursor-pointer"
            >
              <option value="전체" className="text-slate-800">전체 회원사 보기</option>
              {MEMBERS.map(m => <option key={m} value={m} className="text-slate-800">{safeRender(m)}</option>)}
            </select>
          )}
          <button onClick={generatePartnerAdvancedBillingExcel} className="w-full sm:w-auto bg-[#107C41] hover:bg-[#185C37] text-white px-3 sm:px-5 py-1.5 sm:py-2 rounded-md sm:rounded-lg font-bold text-[10px] sm:text-xs shadow-md transition-all flex items-center justify-center gap-1.5 whitespace-nowrap">
            <ExcelIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> 엑셀
          </button>
        </div>
      </div>

      <div className="w-full rounded-xl border border-slate-300 shadow-sm bg-white overflow-x-auto" style={{ scrollbarWidth: 'thin', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
        <table className="w-full border-collapse text-[7px] sm:text-[9px] md:text-[11px] lg:text-xs font-sans text-center tracking-tighter sm:tracking-normal whitespace-nowrap" style={{ minWidth: '700px' }}>
          {filteredData.length === 0 ? (
            <tbody>
              <tr><td colSpan={10} className="p-8 sm:p-12 text-center text-slate-400 font-bold bg-slate-50 text-xs sm:text-base border-none">이번 달 배정된 세금계산서 내역이 없습니다.</td></tr>
            </tbody>
          ) : (
            filteredData.map(m => (
              <tbody key={m.member}>
                <tr>
                  <td colSpan={9} className="text-left font-bold text-base p-1 sm:p-2 px-2 sm:px-4 bg-[#D9D9D9] border border-slate-400 text-black text-[9px] sm:text-xs">조합사 -&gt; 웰쉐어 발행 내역</td>
                  <td className="text-center font-bold p-1 sm:p-2 bg-[#BFBFBF] border border-slate-400 text-black text-[9px] sm:text-xs whitespace-nowrap">{formattedMonthStr}</td>
                </tr>
                <tr className="bg-[#bfbfbf] font-bold border border-slate-400 text-black leading-tight">
                  {['조합사','행정구','단위','품명','수량','공급가액','세액','합계','배송현황','계산서 현황 (요청/발급)'].map((h, i) => (
                    <th key={i} className="border border-slate-400 p-0.5 sm:p-1">{h}</th>
                  ))}
                </tr>
                {m.regions.map((r, i) => {
                  const dData = deliveryDates[m.member]?.[r.region] || {};
                  const isDelivered = !!dData.date;
                  const reqDate = publishRequests[m.member]?.[r.region];
                  const pubDate = publishDates[m.member]?.[r.region];
                  const shortName = m.member.replace('사회적협동조합 ', '').replace(' 협동조합', '').replace('(주)', '');
                  const refKey = `${m.member}-${r.region}`;

                  return (
                    <tr key={r.region} className="text-black border-b border-slate-200">
                      {i === 0 && (
                        <td rowSpan={m.regions.length} className="border border-slate-400 p-0.5 sm:p-1 bg-white font-bold align-middle">{safeRender(shortName)}</td>
                      )}
                      <td className="border border-slate-400 p-0.5 sm:p-1 bg-white text-center font-bold">{safeRender(r.region.split(' ').pop() || r.region)}</td>
                      <td className="border border-slate-400 p-0.5 sm:p-1 bg-white">10Kg</td>
                      <td className="border border-slate-400 p-0.5 sm:p-1 bg-white">배송비</td>
                      <td className="border border-slate-400 p-0.5 sm:p-1 bg-white text-right font-black text-blue-800">{formatNumber(r.qty)}</td>
                      <td className="border border-slate-400 p-0.5 sm:p-1 bg-white text-right">{formatNumber(r.supplyValue)}</td>
                      <td className="border border-slate-400 p-0.5 sm:p-1 bg-white text-right">{formatNumber(r.vatValue)}</td>
                      <td className="border border-slate-400 p-0.5 sm:p-1 bg-[#E6F2FF] text-[#000080] text-right font-black">{formatNumber(r.finalRowTotal)}</td>
                      <td className="border border-slate-400 p-0.5 sm:p-1 bg-[#F8FAFC] font-bold" style={{ color: !isDelivered ? '#64748b' : '#0369a1' }}>
                        {isDelivered ? '완료' : '배송전'}
                      </td>
                      <td className="border border-slate-400 p-0.5 sm:p-1 bg-white text-center font-bold">
                        {pubDate ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-blue-600 text-[7px] sm:text-[9px]">{pubDate}<br/>발급완료</span>
                            <button onClick={() => handleClearPublish(m.member, r.region)} disabled={isClosed || isSaving} className="bg-slate-100 hover:bg-blue-100 text-slate-500 hover:text-blue-600 border border-slate-200 px-1 py-0.5 rounded text-[7px] sm:text-[9px] font-bold transition-colors w-full mt-0.5">일자수정</button>
                          </div>
                        ) : reqDate ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-orange-600 text-[7px] sm:text-[9px]">{reqDate}<br/>발급요청됨</span>
                            <div className="flex items-center gap-1 w-full mt-0.5">
                              <input type="date" ref={el => { pubDateRefs.current[refKey] = el; }} disabled={isClosed} className="border border-slate-300 rounded px-0.5 py-0.5 text-[7px] sm:text-[9px] outline-none focus:border-blue-500 bg-white text-slate-700 font-bold w-full max-w-[70px] sm:max-w-none" />
                              <button
                                onClick={() => {
                                  const d = pubDateRefs.current[refKey]?.value;
                                  if (d) handleIndividualPublishSave(m.member, r.region, d);
                                  else showToast('날짜선택필요');
                                }}
                                disabled={isClosed || isSaving}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-1.5 py-0.5 rounded shadow-sm text-[8px] sm:text-[10px] font-bold transition-colors disabled:opacity-50 w-full"
                              >발급</button>
                            </div>
                          </div>
                        ) : (
                          <div className="text-slate-400 text-center">
                            <span className="text-[7px] sm:text-[9px]">⏳ 요청대기</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                <tr className="bg-[#FFFF00] font-bold text-black border-t-2 border-slate-400">
                  <td colSpan={2} className="border border-slate-400 p-1 text-center">소 계</td>
                  <td className="border border-slate-400 p-1 text-center">10Kg</td>
                  <td className="border border-slate-400 p-1 text-center">배송비</td>
                  <td className="border border-slate-400 p-1 text-right text-blue-900">{formatNumber(m.totalQty)}</td>
                  <td className="border border-slate-400 p-1 text-right">{formatNumber(m.totalSupply)}</td>
                  <td className="border border-slate-400 p-1 text-right">{formatNumber(m.totalVat)}</td>
                  <td className="border border-slate-400 p-1 text-right text-[#000080] text-[9px] sm:text-xs">{formatNumber(m.totalAmount)}</td>
                  <td colSpan={2} className="border border-slate-400 p-1 text-center"></td>
                </tr>
              </tbody>
            ))
          )}
        </table>
      </div>
    </div>
  );
}
