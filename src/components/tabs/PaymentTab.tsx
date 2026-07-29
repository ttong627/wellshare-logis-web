import React, { useRef, useState } from 'react';
import { CreditCard, Info } from 'lucide-react';
import { addDoc, collection, setDoc, doc } from 'firebase/firestore';
import { db, APP_ID } from '../../firebase';
import { useApp } from '../../context/AppContext';
import { formatNumber, formatCur, CLOSED_MSG } from '../../lib/utils';
import { getRegionTheme } from '../../constants/regions';
import ExcelIcon from '../shared/ExcelIcon';
import StatusBadge from '../shared/StatusBadge';
import { useConfirm } from '../shared/useConfirm';

export default function PaymentTab() {
  const {
    billingSummary, formattedMonthStr, currentMonth,
    deliveryDates, publishRequests, setPublishRequests,
    isClosed, isSaving, setIsSaving, showToast, user, isAdmin,
  } = useApp();

  const { confirm, dialog } = useConfirm();
  const reqDateRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [bulkReqDate, setBulkReqDate] = useState('');

  // 보안: 발행 요청은 관리자(본사) 전용 — 핸들러 레벨 권한 가드
  const guardAdmin = (): boolean => {
    if (!isAdmin) { showToast('발행 요청 권한이 없습니다.'); return false; }
    return true;
  };

  const shortNameOf = (m: string) =>
    m.replace('사회적협동조합 ', '').replace(' 협동조합', '').replace('(주)', '');

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
    if (!guardAdmin()) return;
    if (isClosed) return showToast(CLOSED_MSG);
    if (!dateVal) return showToast('발행 요청 일자를 선택해주세요.');
    const ok = await confirm({
      title: '세금계산서 발행 요청',
      message: `${shortNameOf(company)} · ${region}\n${dateVal} 일자로 세금계산서 발행을 요청합니다.\n회원사에 알림이 전송됩니다.`,
      confirmText: '요청 보내기',
    });
    if (!ok) return;
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
    if (!guardAdmin()) return;
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
    const ok = await confirm({
      title: `일괄 발행 요청 (${targets.length}건)`,
      message: `배송 완료된 미요청 ${targets.length}건에 대해\n${bulkReqDate} 일자로 세금계산서 발행을 일괄 요청합니다.\n각 회원사에 알림이 전송됩니다.`,
      confirmText: `${targets.length}건 요청`,
    });
    if (!ok) return;
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
    if (!guardAdmin()) return;
    if (isClosed) return showToast(CLOSED_MSG);
    const ok = await confirm({
      title: '발행 요청 취소',
      message: `${shortNameOf(company)} · ${region}\n세금계산서 발행 요청을 취소합니다.`,
      confirmText: '요청 취소',
      tone: 'danger',
    });
    if (!ok) return;
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
      {dialog}

      {/* ── 히어로 (총 청구 예정액) ── */}
      <div className="sky-hero p-6 sm:p-8 text-white">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(255,255,255,.18)', backdropFilter: 'blur(8px)' }}>
              <CreditCard size={22} className="text-white" />
            </div>
            <div>
              <div className="text-sky-200 text-[10px] font-bold uppercase tracking-widest mb-0.5">Payment · {formattedMonthStr}</div>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight" style={{ textShadow: '0 2px 8px rgba(0,0,0,.2)' }}>전체 회원사 결제 명세서</h2>
              <div className="fin-num text-2xl sm:text-3xl font-black mt-1" style={{ textShadow: '0 2px 8px rgba(0,0,0,.2)' }}>
                {formatCur(billingSummary.grandTotalAmount)}
              </div>
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
                aria-label="일괄 발행 요청 날짜"
                className="border border-white/30 rounded-lg px-1.5 py-1 text-[11px] sm:text-xs font-bold text-slate-700 outline-none focus:border-white/60 bg-white disabled:opacity-50"
              />
              <button
                onClick={handleBulkRequest}
                disabled={isClosed || isSaving}
                className="bg-orange-500 hover:bg-orange-600 text-white px-2 sm:px-3 py-1 rounded-lg font-bold text-[11px] sm:text-xs shadow-sm transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                전체 요청
              </button>
            </div>
            <button
              onClick={handleDownloadOldExcel}
              className="w-full sm:w-auto bg-[#107C41] hover:bg-[#185C37] text-white px-3 sm:px-5 py-1.5 sm:py-2 rounded-xl font-bold text-[11px] sm:text-xs shadow-md flex items-center justify-center gap-1.5 whitespace-nowrap transition-all"
            >
              <ExcelIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> 엑셀
            </button>
          </div>
        </div>
      </div>

      {/* ── 수수료 산식 안내 (투명성) ── */}
      <div className="flex items-start gap-2 px-4 py-2.5 rounded-xl bg-sky-50 border border-sky-100 text-sky-700">
        <Info size={15} className="flex-shrink-0 mt-0.5" />
        <p className="text-[11px] sm:text-xs font-medium leading-relaxed">
          회원사 청구액 = <b>단가 × 수량 × 97.5%</b> (웰쉐어 정산 수수료 2.5% 차감, 100원 단위 절사) · 공급가/세액은 합계 기준 역산입니다.
        </p>
      </div>

      {/* ── 모바일 카드뷰 (sm 미만) ── */}
      <div className="sm:hidden space-y-4">
        {billingSummary.sorted.length === 0 && (
          <div className="fin-card p-8 text-center text-slate-400 font-bold">이번 달 정산 내역이 없습니다.</div>
        )}
        {billingSummary.sorted.map(m => (
          <div key={m.member} className="fin-card overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between" style={{ background: 'linear-gradient(135deg,#0B6F94,#18A8D8)' }}>
              <span className="text-white font-black text-sm break-keep">{shortNameOf(m.member)}</span>
              <span className="fin-num text-white font-black text-base">{formatNumber(m.totalAmount)}<span className="text-[10px] font-bold ml-0.5">원</span></span>
            </div>
            <div className="divide-y divide-sky-50">
              {m.regions.map(r => {
                const dData = deliveryDates[m.member]?.[r.region] || {};
                const isDelivered = !!dData.date;
                const reqDate = publishRequests[m.member]?.[r.region];
                const refKey = `m-${m.member}-${r.region}`;
                return (
                  <div key={r.region} className="px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-black text-slate-800 text-sm flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: getRegionTheme(r.region).dot }} />
                        {r.region.split(' ').pop() || r.region}
                      </span>
                      <span className="fin-num font-black text-sky-800 text-base">{formatNumber(r.finalRowTotal)}<span className="text-[10px] font-bold text-slate-400 ml-0.5">원</span></span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 mb-2 fin-num">
                      <span>수량 {formatNumber(r.qty)}</span><span className="text-slate-300">·</span>
                      <span>공급 {formatNumber(r.supplyValue)}</span><span className="text-slate-300">·</span>
                      <span>세액 {formatNumber(r.vatValue)}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusBadge variant={isDelivered ? 'done' : 'wait'} label={isDelivered ? '배송완료' : '배송전'} />
                      {reqDate ? (
                        <>
                          <StatusBadge variant="requested" label={`${reqDate} 요청완료`} />
                          <button onClick={() => handleClearPublishRequest(m.member, r.region)} disabled={isClosed || isSaving}
                            className="ml-auto text-[11px] font-bold text-red-500 bg-red-50 hover:bg-red-100 border border-red-100 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                            요청취소
                          </button>
                        </>
                      ) : isDelivered ? (
                        <div className="ml-auto flex items-center gap-1.5">
                          <input type="date" ref={el => { reqDateRefs.current[refKey] = el; }} disabled={isClosed}
                            aria-label="발행 요청 날짜"
                            className="border border-slate-300 rounded-lg px-2 py-1.5 text-[11px] font-bold text-slate-700 outline-none focus:border-sky-500 bg-white" />
                          <button
                            onClick={() => {
                              const d = reqDateRefs.current[refKey]?.value;
                              if (d) handleIndividualPublishRequestSave(m.member, r.region, d);
                              else showToast('날짜를 선택해주세요.');
                            }}
                            disabled={isClosed || isSaving}
                            className="bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors disabled:opacity-50">
                            요청
                          </button>
                        </div>
                      ) : (
                        <span className="ml-auto text-[11px] font-bold text-slate-400">배송 완료 후 요청 가능</span>
                      )}
                    </div>
                  </div>
                );
              })}
              <div className="px-4 py-2.5 bg-sky-50 flex items-center justify-between">
                <span className="font-black text-sky-700 text-xs">소계 (수량 {formatNumber(m.totalQty)})</span>
                <span className="fin-num font-black text-sky-900 text-base">{formatNumber(m.totalAmount)}원</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── 데스크탑 표 (sm 이상) · 엑셀 출력 원본 ── */}
      <div className="hidden sm:block glass rounded-2xl overflow-hidden overflow-x-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        <table id="payment-table-export" className="w-full border-collapse text-[11px] md:text-xs font-sans text-center whitespace-nowrap">
          {billingSummary.sorted.map((m, mIdx) => (
            <tbody key={m.member}>
              {mIdx > 0 && <tr><td colSpan={10} className="h-3 bg-transparent border-none"></td></tr>}
              <tr>
                <td colSpan={9} className="bg-sky-100 font-black border border-sky-200 text-left p-2 px-4 text-sky-800 break-keep">{shortNameOf(m.member)} — 조합사 → 웰쉐어 발행 내역</td>
                <td className="text-center font-bold p-2 bg-sky-200 border border-sky-300 text-sky-900 text-xs whitespace-nowrap">{formattedMonthStr}</td>
              </tr>
              <tr className="text-white font-bold leading-tight" style={{ background: 'linear-gradient(135deg,#0B6F94,#18A8D8)' }}>
                {['조합사','행정구','단위','품명','수량','공급가','세액','합계','배송현황','계산서 (요청)'].map((h, i) => (
                  <th key={i} className="border border-sky-300/40 p-1.5">{h}</th>
                ))}
              </tr>
              {m.regions.map(r => {
                const dData = deliveryDates[m.member]?.[r.region] || {};
                const isDelivered = !!dData.date;
                const reqDate = publishRequests[m.member]?.[r.region];
                const refKey = `${m.member}-${r.region}`;
                const shortName = shortNameOf(m.member);

                return (
                  <tr key={r.region} className="text-slate-700 border-b border-sky-50 hover:bg-sky-50/50 transition-colors">
                    {r === m.regions[0] && (
                      <td rowSpan={m.regions.length} className="border border-sky-100 p-1.5 bg-white font-black align-middle text-slate-800">
                        {shortName}
                      </td>
                    )}
                    <td className="border border-sky-100 p-1.5 bg-white text-center font-bold">
                      <span className="inline-flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: getRegionTheme(r.region).dot }} />
                        {r.region.split(' ').pop() || r.region}
                      </span>
                    </td>
                    <td className="border border-sky-100 p-1.5 bg-white text-slate-500">10Kg</td>
                    <td className="border border-sky-100 p-1.5 bg-white text-slate-500">배송비</td>
                    <td className="fin-num border border-sky-100 p-1.5 bg-white text-right font-black text-sky-700">{formatNumber(r.qty)}</td>
                    <td className="fin-num border border-sky-100 p-1.5 bg-white text-right">{formatNumber(r.supplyValue)}</td>
                    <td className="fin-num border border-sky-100 p-1.5 bg-white text-right">{formatNumber(r.vatValue)}</td>
                    <td className="fin-num border border-sky-100 p-1.5 bg-sky-50 text-sky-900 text-right font-black">{formatNumber(r.finalRowTotal)}</td>
                    <td className="border border-sky-100 p-1.5 bg-white">
                      <StatusBadge variant={isDelivered ? 'done' : 'wait'} label={isDelivered ? '완료' : '배송전'} />
                    </td>
                    <td className="border border-sky-100 p-1.5 bg-white text-center">
                      {reqDate ? (
                        <div className="flex flex-col items-center gap-1">
                          <StatusBadge variant="requested" label={`${reqDate} 요청완료`} />
                          <button onClick={() => handleClearPublishRequest(m.member, r.region)} disabled={isClosed || isSaving} className="text-[10px] font-bold text-red-500 bg-red-50 hover:bg-red-100 border border-red-100 px-2 py-0.5 rounded transition-colors disabled:opacity-50">요청취소</button>
                        </div>
                      ) : isDelivered ? (
                        <div className="flex items-center justify-center gap-1">
                          <input
                            type="date"
                            ref={el => { reqDateRefs.current[refKey] = el; }}
                            disabled={isClosed}
                            aria-label="발행 요청 날짜"
                            className="border border-slate-300 rounded px-1 py-0.5 text-[11px] outline-none focus:border-sky-500 bg-white text-slate-700 font-bold"
                          />
                          <button
                            onClick={() => {
                              const d = reqDateRefs.current[refKey]?.value;
                              if (d) handleIndividualPublishRequestSave(m.member, r.region, d);
                              else showToast('날짜를 선택해주세요.');
                            }}
                            disabled={isClosed || isSaving}
                            className="bg-orange-500 hover:bg-orange-600 text-white px-2.5 py-0.5 rounded shadow-sm text-[11px] font-bold transition-colors disabled:opacity-50"
                          >
                            요청
                          </button>
                        </div>
                      ) : (
                        <span className="text-[10px] font-bold text-slate-400">배송 후 가능</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              <tr className="font-black text-sky-900 border-t-2 border-sky-300 bg-sky-100">
                <td colSpan={2} className="border border-sky-200 p-1.5 text-center">소 계</td>
                <td className="border border-sky-200 p-1.5 text-center">10Kg</td>
                <td className="border border-sky-200 p-1.5 text-center">배송비</td>
                <td className="fin-num border border-sky-200 p-1.5 text-right">{formatNumber(m.totalQty)}</td>
                <td className="fin-num border border-sky-200 p-1.5 text-right">{formatNumber(m.totalSupply)}</td>
                <td className="fin-num border border-sky-200 p-1.5 text-right">{formatNumber(m.totalVat)}</td>
                <td className="fin-num border border-sky-200 p-1.5 text-right text-sky-900">{formatNumber(m.totalAmount)}</td>
                <td colSpan={2} className="border border-sky-200 p-1.5 text-center"></td>
              </tr>
            </tbody>
          ))}
        </table>
      </div>
    </div>
  );
}
