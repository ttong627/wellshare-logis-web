import React, { useState, useEffect } from 'react';
import { FileSpreadsheet, Send, AlertTriangle, ReceiptText } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { formatNumber, formatCur } from '../../lib/utils';
import { getRegionBgColorClass } from '../../constants/regions';
import ExcelIcon from '../shared/ExcelIcon';
import StatusBadge, { BadgeVariant } from '../shared/StatusBadge';
import { useConfirm } from '../shared/useConfirm';
import { auth } from '../../firebase';
import { sendRegion, buildRegionPayload } from '../../lib/ecountGateway';

type EcountRegState = 'wait' | 'sending' | 'done' | 'cached' | 'error';
const ECOUNT_BADGE: Record<EcountRegState, { variant: BadgeVariant; label: string } | null> = {
  wait: { variant: 'wait', label: '대기' },
  sending: { variant: 'requested', label: '전송중' },
  done: { variant: 'issued', label: '등록완료' },
  cached: { variant: 'paid', label: '이미등록' },
  error: null,
};

export default function BillingTab() {
  const { billingReport, formattedMonthStr, currentMonth, showToast, regions, zonePrices } = useApp();
  const { confirm, dialog } = useConfirm();
  const [ecountSending, setEcountSending] = useState(false);
  const [ecountStatus, setEcountStatus] = useState<Record<string, { state: EcountRegState; info?: string }>>({});
  const [ecountSummary, setEcountSummary] = useState<{ done: number; cached: number; error: number } | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [selectedRegions, setSelectedRegions] = useState<Set<string>>(new Set());

  // 지자체 목록이 바뀌면(월 변경/로딩) 전체 선택으로 초기화 + 상태 리셋
  const regionKey = billingReport.report.map((it) => it.region).join('|');
  useEffect(() => {
    setSelectedRegions(new Set(billingReport.report.map((it) => it.region)));
    setEcountStatus({});
    setEcountSummary(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionKey]);

  const toggleRegion = (r: string) =>
    setSelectedRegions((s) => { const n = new Set(s); if (n.has(r)) n.delete(r); else n.add(r); return n; });

  const allRegionNames = billingReport.report.map((it) => it.region);
  const allSelected = allRegionNames.length > 0 && allRegionNames.every((r) => selectedRegions.has(r));
  const toggleAll = () => setSelectedRegions(allSelected ? new Set() : new Set(allRegionNames));
  const selectedSum = billingReport.report
    .filter((it) => selectedRegions.has(it.region))
    .reduce((s, it) => s + it.sum.amount, 0);

  const handleEcountSend = async (testOnly = false) => {
    const selected = billingReport.report.filter((it) => selectedRegions.has(it.region));
    const targets = testOnly ? selected.slice(0, 1) : selected;
    if (targets.length === 0) { showToast('선택된 지자체가 없습니다.'); return; }
    const ok = await confirm({
      title: testOnly ? 'ECOUNT 테스트 전송 (1건)' : 'ECOUNT 매출 전송',
      message: testOnly
        ? `테스트로 '${targets[0].region}' 1건만 ECOUNT에 등록합니다.\n비가역 — 등록 후 ECOUNT 화면에서 금액을 확인하세요.\n계속할까요?`
        : `운영 ECOUNT에 ${targets.length}개 행정구의 매출전표를 등록합니다.\n비가역 작업입니다 — 되돌리려면 ECOUNT 화면에서 직접 삭제해야 합니다.\n계속할까요?`,
      tone: 'danger',
      confirmText: testOnly ? '테스트 전송' : '전송',
    });
    if (!ok) return;
    const user = auth.currentUser;
    if (!user) { showToast('로그인이 필요합니다.'); return; }

    setEcountSending(true);
    setEcountSummary(null);
    setShowGuide(false);
    const month = Number(currentMonth.split('-')[1]);
    const init: Record<string, { state: EcountRegState }> = {};
    targets.forEach((it) => { init[it.region] = { state: 'wait' }; });
    setEcountStatus(init);

    let done = 0, cached = 0, error = 0;
    for (const item of targets) {
      setEcountStatus((s) => ({ ...s, [item.region]: { state: 'sending' } }));
      // 토큰은 행정구마다 재취득 — Firebase SDK가 유효시 캐시 반환, 만료 임박시에만 갱신(루프 중 만료 방지)
      let token: string;
      try { token = await user.getIdToken(); }
      catch { error++; setEcountStatus((s) => ({ ...s, [item.region]: { state: 'error', info: '인증 토큰 발급 실패' } })); continue; }
      const res = await sendRegion(token, buildRegionPayload(item, month, regions, zonePrices));
      if (res.ok && res.cached) {
        cached++;
        setEcountStatus((s) => ({ ...s, [item.region]: { state: 'cached', info: '이미 등록됨' } }));
      } else if (res.ok) {
        done++;
        setEcountStatus((s) => ({ ...s, [item.region]: { state: 'done', info: res.slipNos?.[0] } }));
      } else {
        error++;
        setEcountStatus((s) => ({ ...s, [item.region]: { state: 'error', info: res.message } }));
      }
    }
    setEcountSending(false);
    setEcountSummary({ done, cached, error });
    showToast(`ECOUNT 전송 완료 — 등록 ${done} · 중복 ${cached} · 실패 ${error}`);
    if (error === 0) setShowGuide(true);
  };

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

  const totalsFooter = [
    { label: '경기도 합계', data: billingReport.gTotal, strong: false },
    { label: '서울시 합계', data: billingReport.sTotal, strong: false },
    { label: '전체 합계', data: billingReport.grandTotal, strong: true },
  ];

  return (
    <div className="anim-in space-y-5">
      {/* ── 히어로 (발행 총액) ── */}
      <div className="sky-hero flex flex-col md:flex-row justify-between items-start md:items-center p-6 sm:p-8 text-white gap-4">
        <div className="relative z-10">
          <div className="text-sky-200 font-bold text-[10px] sm:text-xs uppercase tracking-widest mb-1">Monthly Billing · {formattedMonthStr}</div>
          <h2 className="text-base sm:text-lg font-black mb-1" style={{ textShadow: '0 2px 8px rgba(0,0,0,.2)' }}>웰쉐어 세금계산서 발행내역 (희망나르미 발행분)</h2>
          <div className="fin-num text-2xl sm:text-4xl font-black tracking-tight" style={{ textShadow: '0 2px 8px rgba(0,0,0,.2)' }}>{formatCur(billingReport.grandTotal.amount)}</div>
        </div>
        <button
          onClick={generateAdvancedBillingExcel}
          className="w-full md:w-auto relative z-10 bg-[#107C41] hover:bg-[#185C37] text-white px-3 sm:px-5 py-1.5 sm:py-2 rounded-xl font-bold text-[11px] sm:text-xs shadow-md transition-all flex items-center justify-center gap-1.5 whitespace-nowrap"
        >
          <ExcelIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> 엑셀
        </button>
      </div>

      {/* ── ECOUNT 매출 발행 (지자체 선택) ── */}
      {billingReport.report.length > 0 && (
        <div className="fin-card p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h3 className="font-black text-sm text-slate-700 flex items-center gap-1.5">
              <Send size={15} className="text-sky-500" /> ECOUNT 매출 발행 <span className="text-slate-400 font-bold">(지자체 선택)</span>
            </h3>
            <div className="flex items-center gap-1.5">
              <button
                onClick={toggleAll}
                disabled={ecountSending}
                className="px-2.5 py-1.5 rounded-lg font-bold text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors disabled:opacity-50"
              >
                {allSelected ? '전체 해제' : '전체 선택'}
              </button>
              <button
                onClick={() => handleEcountSend(true)}
                disabled={ecountSending || selectedRegions.size === 0}
                title="선택한 지자체 중 첫 1건만 시범 전송"
                className="px-2.5 py-1.5 rounded-lg font-bold text-[11px] bg-amber-50 hover:bg-amber-100 text-amber-700 ring-1 ring-amber-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                🧪 테스트
              </button>
              <button
                onClick={() => handleEcountSend(false)}
                disabled={ecountSending || selectedRegions.size === 0}
                className="px-3 py-1.5 rounded-lg font-bold text-[11px] text-white shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                style={{ background: 'linear-gradient(160deg,#38bdf8,#0284c7)' }}
              >
                <Send size={13} /> {ecountSending ? '전송중…' : `선택 전송 (${selectedRegions.size})`}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {billingReport.report.map((item) => {
              const checked = selectedRegions.has(item.region);
              const st = ecountStatus[item.region]?.state;
              const badge = st ? ECOUNT_BADGE[st] : null;
              return (
                <label
                  key={item.region}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 cursor-pointer transition-colors ${checked ? 'bg-sky-50 ring-1 ring-sky-200' : 'bg-slate-50 hover:bg-slate-100'}`}
                  title={ecountStatus[item.region]?.info || ''}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleRegion(item.region)}
                    disabled={ecountSending}
                    className="w-4 h-4 accent-sky-500 shrink-0"
                  />
                  <span className="text-[12px] font-bold text-slate-700 flex-1 truncate">{item.region}</span>
                  <span className="fin-num text-[11px] text-slate-500">{formatNumber(item.sum.amount)}원</span>
                  {st &&
                    (badge ? (
                      <StatusBadge variant={badge.variant} label={badge.label} />
                    ) : (
                      <span className="fin-badge" style={{ background: '#fef2f2', color: '#dc2626', borderColor: '#fecaca' }}>
                        <AlertTriangle size={12} /> 실패
                      </span>
                    ))}
                </label>
              );
            })}
          </div>

          <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <span className="font-bold text-slate-500">
              선택 {selectedRegions.size}개 · 합계 <span className="fin-num text-sky-700">{formatNumber(selectedSum)}원</span>
            </span>
            {ecountSummary && (
              <span className="font-bold text-slate-500">
                결과 — 등록 {ecountSummary.done} · 중복 {ecountSummary.cached} ·{' '}
                <span className={ecountSummary.error ? 'text-red-500' : ''}>실패 {ecountSummary.error}</span>
              </span>
            )}
          </div>
          {ecountSummary && ecountSummary.error > 0 && (
            <p className="mt-2 text-[11px] font-bold text-red-500">
              실패한 지자체는 다시 '선택 전송'을 누르면 재전송됩니다 (이미 등록된 곳은 자동 건너뜀).
            </p>
          )}
        </div>
      )}

      {billingReport.report.length === 0 ? (
        <div className="fin-card p-10 sm:p-12 text-center text-slate-400 font-bold text-sm sm:text-base flex flex-col items-center gap-3">
          <FileSpreadsheet size={36} className="text-slate-300" />
          이번 달 발행 내역이 없습니다.
        </div>
      ) : (
        <>
          {/* ── 모바일 카드뷰 (sm 미만) ── */}
          <div className="sm:hidden space-y-3">
            {billingReport.report.map((item, idx) => (
              <div key={idx} className="fin-card overflow-hidden">
                <div className="px-4 py-2.5 flex items-center justify-between" style={{ background: 'linear-gradient(135deg,#0369a1,#0ea5e9)' }}>
                  <span className="text-white font-black text-sm">{item.region}</span>
                  <span className="text-sky-100 text-[11px] font-bold">{item.city}</span>
                </div>
                <div className="divide-y divide-sky-50 text-[12px]">
                  <div className="flex items-center justify-between px-4 py-2">
                    <span className="font-bold text-rose-600">차상위 <span className="fin-num text-slate-400 font-medium">({formatNumber(item.poverty.qty)})</span></span>
                    <span className="fin-num font-black text-slate-700">{formatNumber(item.poverty.tot)}원</span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-2">
                    <span className="font-bold text-sky-700">수급자 <span className="fin-num text-slate-400 font-medium">({formatNumber(item.basic.qty)})</span></span>
                    <span className="fin-num font-black text-slate-700">{formatNumber(item.basic.tot)}원</span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-2.5 bg-sky-50">
                    <span className="font-black text-sky-800">합계 <span className="fin-num text-slate-400 font-medium">(수량 {formatNumber(item.sum.qty)})</span></span>
                    <span className="fin-num font-black text-sky-900 text-base">{formatNumber(item.sum.amount)}원</span>
                  </div>
                </div>
              </div>
            ))}
            {/* 합계 카드 */}
            <div className="grid grid-cols-1 gap-2">
              {totalsFooter.map(({ label, data, strong }) => (
                <div key={label} className={`fin-card flex items-center justify-between px-4 py-3 ${strong ? 'ring-2 ring-sky-300' : ''}`}>
                  <span className={`font-black ${strong ? 'text-sky-800 text-sm' : 'text-slate-600 text-[13px]'}`}>{label}</span>
                  <div className="text-right">
                    <span className={`fin-num font-black ${strong ? 'text-sky-900 text-lg' : 'text-slate-700 text-base'}`}>{formatNumber(data.amount)}원</span>
                    <div className="fin-num text-[11px] text-slate-400">수량 {formatNumber(data.qty)} · 공급 {formatNumber(data.supply)} · 세액 {formatNumber(data.vat)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── 데스크탑 표 (sm 이상) ── */}
          <div className="hidden sm:block glass rounded-2xl overflow-hidden overflow-x-auto" style={{ scrollbarWidth: 'thin' }}>
            <table className="w-full border-collapse text-[11px] md:text-xs font-sans text-center whitespace-nowrap">
              <thead>
                <tr className="text-white font-bold" style={{ background: 'linear-gradient(135deg,#0369a1,#0ea5e9)' }}>
                  {['행정시','행정구','구분','단위','품명','수량','공급가','세액','합계','비고'].map((h, i) => (
                    <th key={i} className="border border-sky-300/40 p-1.5 break-keep">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {billingReport.report.map((item, idx) => {
                  const regionBg = getRegionBgColorClass(item.region);
                  return (
                    <React.Fragment key={idx}>
                      <tr className="border-b border-sky-50 hover:bg-sky-50/40 transition-colors">
                        <td rowSpan={3} className="border border-sky-100 p-1.5 text-center font-black bg-white align-middle text-slate-800">{item.city}</td>
                        <td rowSpan={3} className={`border border-sky-100 p-1.5 text-center font-black align-middle text-slate-800 ${regionBg}`}>{item.region}</td>
                        <td className="border border-sky-100 p-1.5 text-center font-black text-rose-600 bg-rose-50/50">차상위</td>
                        <td className="border border-sky-100 p-1.5 text-center bg-white text-slate-500">10Kg</td>
                        <td className="border border-sky-100 p-1.5 text-left bg-white text-slate-500">차상위 배송비</td>
                        <td className="fin-num border border-sky-100 p-1.5 text-right font-bold bg-white text-slate-700">{formatNumber(item.poverty.qty)}</td>
                        <td className="fin-num border border-sky-100 p-1.5 text-right bg-white text-slate-600">{formatNumber(item.poverty.sup)}</td>
                        <td className="fin-num border border-sky-100 p-1.5 text-right bg-white text-slate-600">{formatNumber(item.poverty.vat)}</td>
                        <td className="fin-num border border-sky-100 p-1.5 text-right font-black bg-white text-sky-700">{formatNumber(item.poverty.tot)}</td>
                        <td className="border border-sky-100 p-1.5 text-center bg-white"></td>
                      </tr>
                      <tr className="border-b border-sky-50 hover:bg-sky-50/40 transition-colors">
                        <td className="border border-sky-100 p-1.5 text-center font-black text-sky-700 bg-sky-50/50">수급자</td>
                        <td className="border border-sky-100 p-1.5 text-center bg-white text-slate-500">10Kg</td>
                        <td className="border border-sky-100 p-1.5 text-left bg-white text-slate-500">수급자 배송비</td>
                        <td className="fin-num border border-sky-100 p-1.5 text-right font-bold bg-white text-slate-700">{formatNumber(item.basic.qty)}</td>
                        <td className="fin-num border border-sky-100 p-1.5 text-right bg-white text-slate-600">{formatNumber(item.basic.sup)}</td>
                        <td className="fin-num border border-sky-100 p-1.5 text-right bg-white text-slate-600">{formatNumber(item.basic.vat)}</td>
                        <td className="fin-num border border-sky-100 p-1.5 text-right font-black bg-white text-sky-700">{formatNumber(item.basic.tot)}</td>
                        <td className="border border-sky-100 p-1.5 text-center bg-white"></td>
                      </tr>
                      <tr className="border-b-2 border-sky-200">
                        <td colSpan={3} className="border border-sky-200 p-1.5 text-center font-black bg-sky-100 text-sky-800 tracking-widest">합계</td>
                        <td className="fin-num border border-sky-200 p-1.5 text-right font-black bg-sky-100 text-sky-800">{formatNumber(item.sum.qty)}</td>
                        <td className="fin-num border border-sky-200 p-1.5 text-right font-black bg-sky-100 text-sky-800">{formatNumber(item.sum.supply)}</td>
                        <td className="fin-num border border-sky-200 p-1.5 text-right font-black bg-sky-100 text-sky-800">{formatNumber(item.sum.vat)}</td>
                        <td className="fin-num border border-sky-200 p-1.5 text-right font-black bg-sky-100 text-sky-900">{formatNumber(item.sum.amount)}</td>
                        <td className="border border-sky-200 p-1.5 bg-sky-100"></td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                {totalsFooter.map(({ label, data, strong }) => (
                  <tr key={label} className={strong ? 'text-white' : 'text-sky-900'}
                      style={strong ? { background: 'linear-gradient(135deg,#0284c7,#0ea5e9)' } : { background: '#e0f2fe' }}>
                    <td colSpan={3} className="border border-sky-200 p-2 text-left font-black break-keep">{label}</td>
                    <td className="border border-sky-200 p-2 text-center font-bold">10Kg</td>
                    <td className="border border-sky-200 p-2 text-left font-bold">배송비</td>
                    <td className="fin-num border border-sky-200 p-2 text-right font-black">{formatNumber(data.qty)}</td>
                    <td className="fin-num border border-sky-200 p-2 text-right font-black">{formatNumber(data.supply)}</td>
                    <td className="fin-num border border-sky-200 p-2 text-right font-black">{formatNumber(data.vat)}</td>
                    <td className="fin-num border border-sky-200 p-2 text-right font-black">{formatNumber(data.amount)}</td>
                    <td className="border border-sky-200 p-2"></td>
                  </tr>
                ))}
              </tfoot>
            </table>
          </div>
        </>
      )}
      {/* ── ECOUNT 화면 작업 안내 ── */}
      {showGuide && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          style={{ background: 'rgba(2,23,49,0.5)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
          onClick={() => setShowGuide(false)}
        >
          <div className="glass rounded-3xl p-6 sm:p-7 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-black text-slate-800 mb-3 flex items-center gap-2">
              <ReceiptText size={20} className="text-sky-500" /> ECOUNT 화면 작업 안내
            </h3>
            <p className="text-sm font-medium text-slate-500 mb-4 break-keep leading-relaxed">
              매출 등록(판매입력)이 완료됐습니다. 세금계산서 발행은 ECOUNT 화면에서 마무리합니다:
            </p>
            <ol className="text-sm text-slate-600 space-y-2 mb-6 list-decimal pl-5 break-keep">
              <li>ECOUNT → <b>판매 → 판매일괄회계반영</b>에서 이번 달 전표를 <b>매출전표Ⅰ</b>로 회계반영</li>
              <li><b>회계 → 전자(세금)계산서 → 진행단계</b>에서 <b>발행</b> (국세청 전송)</li>
              <li>부가세유형이 <b>'세금계산서'</b>인지 확인</li>
            </ol>
            <button
              onClick={() => setShowGuide(false)}
              className="w-full py-3 rounded-2xl font-bold text-sm text-white shadow-md"
              style={{ background: 'linear-gradient(160deg,#38bdf8,#0284c7)' }}
            >
              확인
            </button>
          </div>
        </div>
      )}
      {dialog}
    </div>
  );
}
