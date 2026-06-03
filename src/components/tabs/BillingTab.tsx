import React, { useState } from 'react';
import { FileSpreadsheet, Send, AlertTriangle, ReceiptText } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { formatNumber, formatCur } from '../../lib/utils';
import { getRegionBgColorClass, getRegionTheme } from '../../constants/regions';
import { BillingItem } from '../../types';
import ExcelIcon from '../shared/ExcelIcon';
import StatusBadge, { BadgeVariant } from '../shared/StatusBadge';
import { useConfirm } from '../shared/useConfirm';
import { auth } from '../../firebase';
import { sendRegion, buildRegionPayload, ECOUNT_COMPANIES, DEFAULT_COMCODE } from '../../lib/ecountGateway';

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
  const [ecountStatus, setEcountStatus] = useState<Record<string, { state: EcountRegState; info?: string }>>({});
  const [sendingRegion, setSendingRegion] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [selectedComCode, setSelectedComCode] = useState(DEFAULT_COMCODE);

  // 지자체별 개별 발행 — 담당자가 각 카드의 [발행] 버튼으로 하나씩 등록
  const handleSendRegion = async (item: BillingItem) => {
    const companyLabel = ECOUNT_COMPANIES.find((c) => c.comCode === selectedComCode)?.label ?? selectedComCode;
    const ok = await confirm({
      title: `${item.region} 매출 발행`,
      message: `[${companyLabel}] '${item.region}' 매출전표(${formatNumber(item.sum.amount)}원)를 ECOUNT에 등록합니다.\n비가역 작업 — 되돌리려면 ECOUNT 화면에서 직접 삭제해야 합니다.\n계속할까요?`,
      tone: 'danger',
      confirmText: '발행',
    });
    if (!ok) return;
    const user = auth.currentUser;
    if (!user) { showToast('로그인이 필요합니다.'); return; }

    setSendingRegion(item.region);
    setEcountStatus((s) => ({ ...s, [item.region]: { state: 'sending' } }));
    const month = Number(currentMonth.split('-')[1]);
    try {
      const token = await user.getIdToken();
      const res = await sendRegion(token, buildRegionPayload(item, month, regions, zonePrices, selectedComCode));
      if (res.ok && res.cached) {
        setEcountStatus((s) => ({ ...s, [item.region]: { state: 'cached', info: '이미 등록됨' } }));
        showToast(`${item.region} — 이미 등록되어 있습니다 (중복 차단)`);
      } else if (res.ok) {
        setEcountStatus((s) => ({ ...s, [item.region]: { state: 'done', info: res.slipNos?.[0] } }));
        showToast(`${item.region} 매출 등록 완료`);
        setShowGuide(true);
      } else {
        setEcountStatus((s) => ({ ...s, [item.region]: { state: 'error', info: res.message } }));
        showToast(`${item.region} 발행 실패: ${res.message}`);
      }
    } catch {
      setEcountStatus((s) => ({ ...s, [item.region]: { state: 'error', info: '인증 토큰 발급 실패' } }));
      showToast('인증 토큰 발급에 실패했습니다.');
    } finally {
      setSendingRegion(null);
    }
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

      {/* ── ECOUNT 매출 발행 (지자체별 개별 발행) ── */}
      {billingReport.report.length > 0 && (
        <div className="fin-card p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h3 className="font-black text-sm text-slate-700 flex items-center gap-1.5">
              <Send size={15} className="text-sky-500" /> ECOUNT 매출 발행 <span className="text-slate-400 font-bold">(지자체별)</span>
            </h3>
            <div className="flex items-center gap-2">
              <label className="text-[11px] font-bold text-slate-500 shrink-0">발행 회사</label>
              <select
                value={selectedComCode}
                onChange={(e) => setSelectedComCode(e.target.value)}
                disabled={!!sendingRegion}
                aria-label="발행 회사 선택"
                className="border border-slate-300 rounded-lg px-2 py-1.5 text-[11px] font-bold text-slate-700 outline-none focus:border-sky-500 bg-white disabled:opacity-50"
              >
                {ECOUNT_COMPANIES.map((c) => (
                  <option key={c.comCode} value={c.comCode}>{c.label} ({c.comCode})</option>
                ))}
              </select>
              <button
                onClick={() => setShowGuide(true)}
                className="text-[11px] font-bold text-sky-600 hover:text-sky-700 flex items-center gap-1 shrink-0"
              >
                <ReceiptText size={13} /> 작업 안내
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {billingReport.report.map((item) => {
              const theme = getRegionTheme(item.region);
              const st = ecountStatus[item.region]?.state;
              const badge = st ? ECOUNT_BADGE[st] : null;
              const isSending = sendingRegion === item.region;
              const finished = st === 'done' || st === 'cached';
              return (
                <div
                  key={item.region}
                  className="rounded-xl border bg-white p-3 flex flex-col gap-2 transition-shadow hover:shadow-md"
                  style={{ borderColor: theme.border, borderLeft: `4px solid ${theme.dot}` }}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className="text-[10px] font-black px-1.5 py-0.5 rounded-md shrink-0"
                      style={{ background: theme.bg, color: theme.text }}
                    >
                      {theme.group}
                    </span>
                    <span className="text-[13px] font-black text-slate-800 truncate">{item.region}</span>
                  </div>
                  <div className="fin-num text-lg font-black text-slate-700 leading-none">
                    {formatNumber(item.sum.amount)}
                    <span className="text-[11px] text-slate-400 font-bold ml-0.5">원</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 min-h-[28px]">
                    {st &&
                      (badge ? (
                        <StatusBadge variant={badge.variant} label={badge.label} />
                      ) : (
                        <span
                          className="fin-badge"
                          style={{ background: '#fef2f2', color: '#dc2626', borderColor: '#fecaca' }}
                          title={ecountStatus[item.region]?.info}
                        >
                          <AlertTriangle size={12} /> 실패
                        </span>
                      ))}
                    {!finished && (
                      <button
                        onClick={() => handleSendRegion(item)}
                        disabled={isSending}
                        className="ml-auto px-3 py-1.5 rounded-lg font-bold text-[11px] text-white shadow-sm transition-all disabled:cursor-wait flex items-center gap-1"
                        style={{ background: isSending ? '#94a3b8' : `linear-gradient(160deg, ${theme.dot}, ${theme.text})` }}
                      >
                        <Send size={12} /> {isSending ? '발행중…' : st === 'error' ? '재발행' : '발행'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="mt-3 text-[11px] text-slate-400 font-medium break-keep">
            ⓘ 지자체별로 [발행]을 누르면 ECOUNT에 매출전표가 등록됩니다. 비가역이며, 이미 등록된 곳은 다시 눌러도 중복되지 않습니다.
          </p>
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
