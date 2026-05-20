import React, { useRef, useState } from 'react';
import { CreditCard } from 'lucide-react';
import { addDoc, collection, setDoc, doc } from 'firebase/firestore';
import { db, APP_ID } from '../../firebase';
import { useApp } from '../../context/AppContext';
import { formatNumber, safeRender, CLOSED_MSG } from '../../lib/utils';
import ExcelIcon from '../shared/ExcelIcon';

export default function PaymentTab() {
  const {
    billingSummary, formattedMonthStr, currentMonth,
    deliveryDates, publishRequests, setPublishRequests,
    isClosed, isSaving, setIsSaving, showToast, user,
  } = useApp();

  const reqDateRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [bulkReqDate, setBulkReqDate] = useState('');

  const handleDownloadOldExcel = () => {
    if (!window.XLSX) return showToast('엑셀 엔진을 준비 중입니다. 잠시 후 다시 시도해주세요.');
    const table = document.getElementById('payment-table-export');
    if (!table) return;
    const clone = table.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('button').forEach(b => b.remove());
    clone.querySelectorAll('input').forEach(i => i.remove());
    const ws = window.XLSX.utils.table_to_sheet(clone);
    ws['!cols'] = [{ wpx: 120 }, { wpx: 100 }, { wpx: 40 }, { wpx: 60 }, { wpx: 50 }, { wpx: 90 }, { wpx: 90 }, { wpx: 100 }, { wpx: 100 }, { wpx: 120 }];
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, '정산명세서');
    window.XLSX.writeFile(wb, `${currentMonth}_결제서(회원사).xlsx`);
  };

  const handleIndividualPublishRequestSave = async (company: string, region: string, dateVal: string) => {
    if (isClosed) return showToast(CLOSED_MSG);
    if (!dateVal) return showToast('발행 요청 일자를 선택해주세요.');
    setIsSaving(true);
    try {
      const newPublishRequests = {
        ...publishRequests,
        [company]: { ...(publishRequests[company] || {}), [region]: dateVal },
      };
      setPublishRequests(newPublishRequests);
      const ref = doc(db, 'artifacts', APP_ID, 'public', 'data', 'billing_records', currentMonth);
      await setDoc(ref, { publishRequests: newPublishRequests, updatedAt: new Date().toISOString(), updatedBy: user?.email }, { merge: true });

      const msgText = `[💰정산요청] ${company} ${region} 배송이 확인되었습니다. ${dateVal} 일자로 세금계산서를 발행해 주세요.`;
      await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'notifications'), {
        message: msgText, target: company, timestamp: new Date().toISOString(),
      });
      showToast(`[${region}] 세금계산서 발급 요청이 전송되었습니다.`);
    } catch (e) { showToast('저장 오류: ' + (e as Error).message); }
    finally { setIsSaving(false); }
  };

  const handleBulkRequest = async () => {
    if (isClosed) return showToast(CLOSED_MSG);
    if (!bulkReqDate) return showToast('일괄 발행 요청 날짜를 선택해주세요.');
    const targets: { company: string; region: string }[] = [];
    billingSummary.sorted.forEach(m => {
      m.regions.forEach(r => {
        const isDelivered = !!deliveryDates[m.member]?.[r.region]?.date;
        const hasRequest = !!publishRequests[m.member]?.[r.region];
        if (isDelivered && !hasRequest) targets.push({ company: m.member, region: r.region });
      });
    });
    if (targets.length === 0) return showToast('요청할 대상이 없습니다. (미요청 건이 없거나 배송 미완료)');
    setIsSaving(true);
    try {
      const newPublishRequests = { ...publishRequests };
      targets.forEach(({ company, region }) => {
        newPublishRequests[company] = { ...(newPublishRequests[company] || {}), [region]: bulkReqDate };
      });
      setPublishRequests(newPublishRequests);
      const ref = doc(db, 'artifacts', APP_ID, 'public', 'data', 'billing_records', currentMonth);
      await setDoc(ref, { publishRequests: newPublishRequests, updatedAt: new Date().toISOString(), updatedBy: user?.email }, { merge: true });
      for (const { company, region } of targets) {
        const msgText = `[💰정산요청] ${company} ${region} 배송이 확인되었습니다. ${bulkReqDate} 일자로 세금계산서를 발행해 주세요.`;
        await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'notifications'), {
          message: msgText, target: company, timestamp: new Date().toISOString(),
        });
      }
      showToast(`${targets.length}건의 세금계산서 발급 요청이 전송되었습니다.`);
    } catch (e) { showToast('저장 오류: ' + (e as Error).message); }
    finally { setIsSaving(false); }
  };

  const handleClearPublishRequest = async (company: string, region: string) => {
    if (isClosed) return showToast(CLOSED_MSG);
    setIsSaving(true);
    try {
      const newPublishRequests = { ...publishRequests };
      if (newPublishRequests[company]) {
        newPublishRequests[company] = { ...newPublishRequests[company] };
        delete newPublishRequests[company][region];
      }
      setPublishRequests(newPublishRequests);
      const ref = doc(db, 'artifacts', APP_ID, 'public', 'data', 'billing_records', currentMonth);
      await setDoc(ref, { publishRequests: newPublishRequests, updatedAt: new Date().toISOString(), updatedBy: user?.email }, { merge: true });
      showToast(`[${region}] 발급 요청이 취소되었습니다.`);
    } catch (e) { showToast('취소 오류: ' + (e as Error).message); }
    finally { setIsSaving(false); }
  };

  return (
    <div className="anim-in space-y-5">
      <div className="sky-hero p-6 sm:p-8 text-white">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(255,255,255,.18)', backdropFilter: 'blur(8px)' }}>
              <CreditCard size={22} className="text-white" />
            </div>
            <div>
              <div className="text-sky-200 text-[10px] font-bold uppercase tracking-widest mb-0.5">Payment</div>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight" style={{ textShadow: '0 2px 8px rgba(0,0,0,.2)' }}>전체 회원사 결제 명세서</h2>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl" style={{ background: 'rgba(255,255,255,.15)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,.25)' }}>
              <span className="text-[10px] sm:text-xs font-bold text-sky-100 whitespace-nowrap">일괄 발행요청</span>
              <input
                type="date"
                value={bulkReqDate}
                onChange={e => setBulkReqDate(e.target.value)}
                disabled={isClosed}
                className="border border-white/30 rounded-lg px-1.5 py-1 text-[10px] sm:text-xs font-bold text-slate-700 outline-none focus:border-white/60 bg-white disabled:opacity-50"
              />
              <button
                onClick={handleBulkRequest}
                disabled={isClosed || isSaving}
                className="bg-orange-500 hover:bg-orange-600 text-white px-2 sm:px-3 py-1 rounded-lg font-bold text-[10px] sm:text-xs shadow-sm transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                전체 요청
              </button>
            </div>
            <button
              onClick={handleDownloadOldExcel}
              className="w-full sm:w-auto bg-[#107C41] hover:bg-[#185C37] text-white px-3 sm:px-5 py-1.5 sm:py-2 rounded-xl font-bold text-[10px] sm:text-xs shadow-md flex items-center justify-center gap-1.5 whitespace-nowrap transition-all"
            >
              <ExcelIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> 엑셀
            </button>
          </div>
        </div>
      </div>

      <div className="glass rounded-2xl overflow-hidden overflow-x-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        <table id="payment-table-export" className="w-full border-collapse text-[7.5px] sm:text-[9px] md:text-[11px] lg:text-xs font-sans text-center tracking-tighter sm:tracking-normal whitespace-nowrap">
          {billingSummary.sorted.map((m, mIdx) => (
            <tbody key={m.member}>
              {mIdx > 0 && <tr><td colSpan={10} className="h-[10px] sm:h-[15px] bg-slate-50 border-none"></td></tr>}
              <tr>
                <td colSpan={9} className="bg-[#d9d9d9] font-bold border border-slate-400 text-left p-1 sm:p-2 px-2 sm:px-4 break-keep">조합사 -&gt; 웰쉐어 발행 내역</td>
                <td className="text-center font-bold p-1 sm:p-2 bg-[#BFBFBF] border border-slate-400 text-black text-[9px] sm:text-xs whitespace-nowrap">{formattedMonthStr}</td>
              </tr>
              <tr className="bg-[#bfbfbf] font-bold border border-slate-400 text-black leading-tight">
                {['조합사','행정구','단위','품명','수량','공급가','세액','합계','배송현황','계산서 현황 (요청/발급)'].map((h, i) => (
                  <th key={i} className={`border border-slate-400 p-0.5 sm:p-1 ${i === 0 ? 'w-[12%]' : i === 1 ? 'w-[10%]' : i === 4 ? 'w-[8%]' : i === 5 ? 'w-[12%]' : i === 6 ? 'w-[10%]' : i === 7 ? 'w-[12%]' : i === 8 ? 'w-[7%]' : i === 9 ? 'w-[15%]' : ''}`}>{h}</th>
                ))}
              </tr>
              {m.regions.map((r, i) => {
                const dData = deliveryDates[m.member]?.[r.region] || {};
                const isDelivered = !!dData.date;
                const reqDate = publishRequests[m.member]?.[r.region];
                const refKey = `${m.member}-${r.region}`;
                const shortName = m.member.replace('사회적협동조합 ', '').replace(' 협동조합', '').replace('(주)', '');

                return (
                  <tr key={r.region} className="text-black border-b border-slate-200">
                    {i === 0 && (
                      <td rowSpan={m.regions.length} className="border border-slate-400 p-0.5 sm:p-1 bg-white font-bold align-middle">
                        {safeRender(shortName)}
                      </td>
                    )}
                    <td className="border border-slate-400 p-0.5 sm:p-1 bg-white text-center font-bold">{safeRender(r.region.split(' ').pop() || r.region)}</td>
                    <td className="border border-slate-400 p-0.5 sm:p-1 bg-white">10Kg</td>
                    <td className="border border-slate-400 p-0.5 sm:p-1 bg-white">배송비</td>
                    <td className="border border-slate-400 p-0.5 sm:p-1 bg-white text-right font-black text-blue-800">{formatNumber(r.qty)}</td>
                    <td className="border border-slate-400 p-0.5 sm:p-1 bg-white text-right">{formatNumber(r.supplyValue)}</td>
                    <td className="border border-slate-400 p-0.5 sm:p-1 bg-white text-right">{formatNumber(r.vatValue)}</td>
                    <td className="border border-slate-400 p-0.5 sm:p-1 bg-[#e6f2ff] text-[#000080] text-right font-black">{formatNumber(r.finalRowTotal)}</td>
                    <td className="border border-slate-400 p-0.5 sm:p-1 bg-[#F8FAFC] font-bold" style={{ color: !isDelivered ? '#64748b' : '#0369a1' }}>
                      {isDelivered ? '완료' : '배송전'}
                    </td>
                    <td className="border border-slate-400 p-0.5 sm:p-1 bg-white text-center font-bold">
                      {reqDate ? (
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-orange-600 text-[7px] sm:text-[9px]">{reqDate}<br/>요청완료</span>
                          <button onClick={() => handleClearPublishRequest(m.member, r.region)} disabled={isClosed || isSaving} className="bg-slate-100 hover:bg-red-100 text-slate-400 hover:text-red-500 border border-slate-200 px-1 py-0.5 rounded text-[7px] sm:text-[9px] font-bold transition-colors w-full mt-0.5">요청취소</button>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-0.5">
                          <input
                            type="date"
                            ref={el => { reqDateRefs.current[refKey] = el; }}
                            disabled={isClosed}
                            className="border border-slate-300 rounded px-0.5 py-0.5 text-[7px] sm:text-[9px] outline-none focus:border-blue-500 bg-white text-slate-700 font-bold w-full"
                          />
                          <button
                            onClick={() => {
                              const d = reqDateRefs.current[refKey]?.value;
                              if (d) handleIndividualPublishRequestSave(m.member, r.region, d);
                              else showToast('날짜선택필요');
                            }}
                            disabled={isClosed || isSaving}
                            className="bg-orange-500 hover:bg-orange-600 text-white px-1.5 py-0.5 rounded shadow-sm text-[7px] sm:text-[9px] font-bold transition-colors disabled:opacity-50 w-full mt-0.5"
                          >
                            요청
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-[#ffff00] font-bold text-black border-t-2 border-slate-400">
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
          ))}
        </table>
      </div>
    </div>
  );
}
