import React, { useRef } from 'react';
import { ReceiptText, Info } from 'lucide-react';
import { addDoc, collection } from 'firebase/firestore';
import { db, APP_ID } from '../../firebase';
import { useApp } from '../../context/AppContext';
import { MEMBERS } from '../../constants/members';
import { formatNumber, formatCur, safeRender, CLOSED_MSG } from '../../lib/utils';
import { getFullRegionName, getRegionTheme } from '../../constants/regions';
import ExcelIcon from '../shared/ExcelIcon';
import StatusBadge from '../shared/StatusBadge';
import { useConfirm } from '../shared/useConfirm';

export default function PartnerBillingTab() {
  const {
    billingSummary, formattedMonthStr, currentMonth,
    deliveryDates, publishRequests, publishDates, setPublishDates,
    selectedAdminViewCompany, setSelectedAdminViewCompany,
    isAdmin, partnerCompany, isClosed, isSaving, setIsSaving,
    showToast, user, saveField,
  } = useApp();

  const { confirm, dialog } = useConfirm();
  const pubDateRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const shortNameOf = (m: string) =>
    m.replace('사회적협동조합 ', '').replace(' 협동조합', '').replace('(주)', '');

  const filteredData = billingSummary.sorted.filter(m =>
    (isAdmin && selectedAdminViewCompany === '전체') ? true :
    (isAdmin ? m.member === selectedAdminViewCompany : m.member === partnerCompany)
  );
  const filteredTotal = filteredData.reduce((s, m) => s + m.totalAmount, 0);

  const handleIndividualPublishSave = async (company: string, region: string, dateVal: string) => {
    // 보안: 본인 회사 내역만 처리 (관리자는 전체 가능)
    if (!isAdmin && company !== partnerCompany) return showToast('본인 회사의 내역만 처리할 수 있습니다.');
    if (isClosed && !isAdmin) return showToast(CLOSED_MSG);
    if (!dateVal) return showToast('발행 일자를 선택해주세요.');
    const ok = await confirm({
      title: '세금계산서 발급 처리',
      message: `${shortNameOf(company)} · ${region}\n${dateVal} 일자로 세금계산서 발급을 완료 처리합니다.\n본사에 대금 결제 요청 알림이 전송됩니다.`,
      confirmText: '발급 완료',
    });
    if (!ok) return;
    setIsSaving(true);
    try {
      const newPublishDates = {
        ...publishDates,
        [company]: { ...(publishDates[company] || {}), [region]: dateVal },
      };
      setPublishDates(newPublishDates);
      const saved = await saveField('publishDates', newPublishDates, user?.email || '');
      if (saved) {
        const msgText = `[🧾발행완료] ${company} ${region} 세금계산서(${dateVal}) 발행이 완료되었습니다. 대금 결제 부탁드립니다.`;
        await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'notifications'), {
          message: msgText, target: 'ADMIN', timestamp: new Date().toISOString(),
        });
        showToast(`[${region}] 세금계산서 발급 처리가 완료되었습니다.`);
      }
    } catch (e) { showToast('저장 오류: ' + (e as Error).message); }
    finally { setIsSaving(false); }
  };

  const handleClearPublish = async (company: string, region: string) => {
    if (!isAdmin && company !== partnerCompany) return showToast('본인 회사의 내역만 처리할 수 있습니다.');
    if (isClosed && !isAdmin) return showToast(CLOSED_MSG);
    const ok = await confirm({
      title: '발급 취소 / 일자수정',
      message: `${shortNameOf(company)} · ${region}\n발급 완료 상태를 취소하고 일자수정 모드로 전환합니다.`,
      confirmText: '발급 취소',
      tone: 'danger',
    });
    if (!ok) return;
    setIsSaving(true);
    try {
      const newPublishDates = { ...publishDates };
      if (newPublishDates[company]) {
        newPublishDates[company] = { ...newPublishDates[company] };
        delete newPublishDates[company][region];
      }
      setPublishDates(newPublishDates);
      const saved = await saveField('publishDates', newPublishDates, user?.email || '');
      if (saved) showToast(`[${region}] 세금계산서 발행이 일자수정 모드로 전환되었습니다.`);
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

  // 발급 셀 — 모바일/데스크탑 공용
  const PublishCell = ({ company, region }: { company: string; region: string }) => {
    const reqDate = publishRequests[company]?.[region];
    const pubDate = publishDates[company]?.[region];
    const refKey = `${company}-${region}`;
    if (pubDate) {
      return (
        <div className="flex flex-col items-center gap-1">
          <StatusBadge variant="paid" label={`${pubDate} 발급완료`} />
          <button onClick={() => handleClearPublish(company, region)} disabled={isClosed || isSaving}
            className="text-[10px] font-bold text-slate-500 bg-slate-100 hover:bg-blue-50 hover:text-blue-600 border border-slate-200 px-2 py-0.5 rounded transition-colors disabled:opacity-50">일자수정</button>
        </div>
      );
    }
    if (reqDate) {
      return (
        <div className="flex flex-col items-center gap-1">
          <StatusBadge variant="requested" label={`${reqDate} 발급요청됨`} />
          <div className="flex items-center gap-1">
            <input type="date" ref={el => { pubDateRefs.current[refKey] = el; }} disabled={isClosed && !isAdmin}
              aria-label="세금계산서 발급 일자"
              className="border border-slate-300 rounded px-1 py-0.5 text-[11px] outline-none focus:border-blue-500 bg-white text-slate-700 font-bold w-[110px]" />
            <button
              onClick={() => {
                const d = pubDateRefs.current[refKey]?.value;
                if (d) handleIndividualPublishSave(company, region, d);
                else showToast('발급 일자를 선택해주세요.');
              }}
              disabled={(isClosed && !isAdmin) || isSaving}
              className="bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-0.5 rounded shadow-sm text-[11px] font-bold transition-colors disabled:opacity-50">발급</button>
          </div>
        </div>
      );
    }
    return <StatusBadge variant="wait" label="요청 대기" />;
  };

  return (
    <div className="anim-in space-y-4 sm:space-y-5 w-full">
      {dialog}

      {/* ── 히어로 (청구 예정액) ── */}
      <div className="sky-hero flex flex-col md:flex-row justify-between items-start md:items-center gap-3 sm:gap-4 p-5 sm:p-7 text-white">
        <div className="flex items-center gap-3 relative z-10">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,.18)', backdropFilter: 'blur(8px)' }}>
            <ReceiptText size={22} className="text-white" />
          </div>
          <div>
            <div className="text-sky-200 text-[10px] font-bold uppercase tracking-widest mb-0.5">Tax Invoice · {formattedMonthStr}</div>
            <h2 className="text-lg sm:text-xl font-black" style={{ textShadow: '0 2px 8px rgba(0,0,0,.2)' }}>세금계산서 내역확인</h2>
            <div className="fin-num text-2xl sm:text-3xl font-black mt-0.5" style={{ textShadow: '0 2px 8px rgba(0,0,0,.2)' }}>{formatCur(filteredTotal)}</div>
            <p className="text-[10px] sm:text-xs font-medium text-sky-100 mt-0.5">본사 요청에 따라 날짜를 지정하고 [발급]을 눌러주십시오.</p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto relative z-10">
          {isAdmin && (
            <select
              value={selectedAdminViewCompany}
              onChange={(e) => setSelectedAdminViewCompany(e.target.value)}
              aria-label="회원사 선택"
              className="w-full sm:w-auto border border-white/30 bg-white/15 text-white px-3 sm:px-4 py-2 rounded-xl font-bold text-xs sm:text-sm outline-none cursor-pointer"
            >
              <option value="전체" className="text-slate-800">전체 회원사 보기</option>
              {MEMBERS.map(m => <option key={m} value={m} className="text-slate-800">{safeRender(m)}</option>)}
            </select>
          )}
          <button onClick={generatePartnerAdvancedBillingExcel} className="w-full sm:w-auto bg-[#107C41] hover:bg-[#185C37] text-white px-3 sm:px-5 py-1.5 sm:py-2 rounded-xl font-bold text-[11px] sm:text-xs shadow-md transition-all flex items-center justify-center gap-1.5 whitespace-nowrap">
            <ExcelIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> 엑셀
          </button>
        </div>
      </div>

      {/* ── 수수료 산식 안내 ── */}
      <div className="flex items-start gap-2 px-4 py-2.5 rounded-xl bg-sky-50 border border-sky-100 text-sky-700">
        <Info size={15} className="flex-shrink-0 mt-0.5" />
        <p className="text-[11px] sm:text-xs font-medium leading-relaxed">
          청구액 = <b>단가 × 수량 × 97.5%</b> (정산 수수료 2.5% 차감, 100원 단위 절사)
        </p>
      </div>

      {filteredData.length === 0 ? (
        <div className="fin-card p-10 sm:p-12 text-center text-slate-400 font-bold text-sm sm:text-base">
          이번 달 배정된 세금계산서 내역이 없습니다.
        </div>
      ) : (
        <>
          {/* ── 모바일 카드뷰 (sm 미만) ── */}
          <div className="sm:hidden space-y-4">
            {filteredData.map(m => (
              <div key={m.member} className="fin-card overflow-hidden">
                <div className="px-4 py-3 flex items-center justify-between" style={{ background: 'linear-gradient(135deg,#0B6F94,#18A8D8)' }}>
                  <span className="text-white font-black text-sm break-keep">{shortNameOf(m.member)}</span>
                  <span className="fin-num text-white font-black text-base">{formatNumber(m.totalAmount)}<span className="text-[10px] font-bold ml-0.5">원</span></span>
                </div>
                <div className="divide-y divide-sky-50">
                  {m.regions.map(r => {
                    const dData = deliveryDates[m.member]?.[r.region] || {};
                    const isDelivered = !!dData.date;
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
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <StatusBadge variant={isDelivered ? 'done' : 'wait'} label={isDelivered ? '배송완료' : '배송전'} />
                          <PublishCell company={m.member} region={r.region} />
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

          {/* ── 데스크탑 표 (sm 이상) ── */}
          <div className="hidden sm:block glass rounded-2xl overflow-hidden overflow-x-auto" style={{ scrollbarWidth: 'thin' }}>
            <table className="w-full border-collapse text-[11px] md:text-xs font-sans text-center whitespace-nowrap" style={{ minWidth: '720px' }}>
              {filteredData.map(m => (
                <tbody key={m.member}>
                  <tr>
                    <td colSpan={9} className="text-left font-black p-2 px-4 bg-sky-100 border border-sky-200 text-sky-800">{shortNameOf(m.member)} — 조합사 → 웰쉐어 발행 내역</td>
                    <td className="text-center font-bold p-2 bg-sky-200 border border-sky-300 text-sky-900 whitespace-nowrap">{formattedMonthStr}</td>
                  </tr>
                  <tr className="text-white font-bold leading-tight" style={{ background: 'linear-gradient(135deg,#0B6F94,#18A8D8)' }}>
                    {['조합사','행정구','단위','품명','수량','공급가액','세액','합계','배송현황','계산서 (요청/발급)'].map((h, i) => (
                      <th key={i} className="border border-sky-300/40 p-1.5">{h}</th>
                    ))}
                  </tr>
                  {m.regions.map(r => {
                    const dData = deliveryDates[m.member]?.[r.region] || {};
                    const isDelivered = !!dData.date;
                    return (
                      <tr key={r.region} className="text-slate-700 border-b border-sky-50 hover:bg-sky-50/50 transition-colors">
                        {r === m.regions[0] && (
                          <td rowSpan={m.regions.length} className="border border-sky-100 p-1.5 bg-white font-black align-middle text-slate-800">{shortNameOf(m.member)}</td>
                        )}
                        <td className="border border-sky-100 p-1.5 bg-white text-center font-bold">
                          <span className="inline-flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: getRegionTheme(r.region).dot }} />
                            {safeRender(r.region.split(' ').pop() || r.region)}
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
                          <PublishCell company={m.member} region={r.region} />
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
        </>
      )}
    </div>
  );
}
