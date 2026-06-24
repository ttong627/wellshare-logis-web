import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { BarChart3, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { formatNumber, formatCur } from '../../lib/utils';
import ExcelIcon from '../shared/ExcelIcon';
import { usePeriodStats } from '../../hooks/usePeriodStats';
import { MonthStats } from '../../lib/stats';

// 'YYYY-MM' → 'YY.MM' (월별 표 헤더용, 다년도 대비)
const monthLabel = (m: string) => { const [y, mo] = m.split('-'); return `${y.slice(2)}.${mo}`; };
const monthFull = (m: string) => { const [y, mo] = m.split('-'); return `${y}년 ${parseInt(mo, 10)}월`; };

const shiftMonth = (m: string, delta: number) => {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const shortNameOf = (m: string) =>
  m.replace('사회적협동조합 ', '').replace(' 협동조합', '').replace('(주)', '');

type SectionKey = 'qty' | 'billing' | 'payment';

export default function StatisticsTab() {
  const { isAdmin, partnerCompany, currentMonth, showToast } = useApp();
  const { state, run } = usePeriodStats();

  const isPartner = !isAdmin && !!partnerCompany;

  const [startMonth, setStartMonth] = useState(() => shiftMonth(currentMonth, -11));
  const [endMonth, setEndMonth] = useState(currentMonth);
  const [expanded, setExpanded] = useState<Record<SectionKey, boolean>>({ qty: false, billing: false, payment: false });

  // 마운트 시 1회 자동 조회 (무지연 UX)
  useEffect(() => {
    run(startMonth, endMonth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (k: SectionKey) => setExpanded(p => ({ ...p, [k]: !p[k] }));

  const handleQuickRange = (months: number) => {
    const s = shiftMonth(currentMonth, -(months - 1));
    setStartMonth(s);
    setEndMonth(currentMonth);
    run(s, currentMonth);
  };

  const data = state.data;
  const rangeLabel = state.range ? `${state.range.start} ~ ${state.range.end}` : '';

  // ── 권한 필터된 뷰 데이터 ──
  const view = useMemo(() => {
    if (!data) return null;
    if (isPartner) {
      const myQty = data.quantityTotal.byCompany.find(c => c.company === partnerCompany) || null;
      const myPay = data.billingSummaryTotal.sorted.find(m => m.member === partnerCompany) || null;
      return { myQty, myPay };
    }
    return null;
  }, [data, isPartner, partnerCompany]);

  // 미마감 월 수
  const openMonths = useMemo(
    () => (data ? data.months.filter(m => m.exists && !m.isClosed).length : 0),
    [data],
  );

  // 회원사 권한: 월별 본인 수량/결제 추출
  const partnerMonthQty = useCallback(
    (ms: MonthStats) => ms.quantity.byCompany.find(c => c.company === partnerCompany) || null,
    [partnerCompany],
  );
  const partnerMonthPay = useCallback(
    (ms: MonthStats) => ms.billingSummary.sorted.find(m => m.member === partnerCompany) || null,
    [partnerCompany],
  );

  // ─── 엑셀 다운로드 ──────────────────────────────────────────────────────────
  const handleExportExcel = () => {
    if (!window.XLSX) return showToast('엑셀 엔진을 준비 중입니다. 잠시 후 다시 시도해주세요.');
    if (!data || !state.range) return showToast('먼저 기간을 조회해주세요.');
    const XLSX = window.XLSX;
    const wb = XLSX.utils.book_new();
    const months = data.months;

    // ── 시트1: 수량 ──
    const qtyRows: any[][] = [];
    qtyRows.push([`수량 통계 (${state.range.start} ~ ${state.range.end})`]);
    qtyRows.push([]);
    if (isPartner) {
      const my = view?.myQty;
      qtyRows.push(['회원사', shortNameOf(partnerCompany || '')]);
      qtyRows.push([]);
      qtyRows.push(['지자체', '수급자', '차상위', '계']);
      (my?.regions || []).forEach(r => qtyRows.push([r.region, r.basicQty, r.povertyQty, r.basicQty + r.povertyQty]));
      qtyRows.push(['합계', my?.basicQty || 0, my?.povertyQty || 0, (my?.basicQty || 0) + (my?.povertyQty || 0)]);
    } else {
      qtyRows.push(['[회원사별]']);
      qtyRows.push(['회원사', '수급자', '차상위', '계']);
      data.quantityTotal.byCompany.forEach(c => qtyRows.push([shortNameOf(c.company), c.basicQty, c.povertyQty, c.basicQty + c.povertyQty]));
      qtyRows.push([]);
      qtyRows.push(['[지자체별]']);
      qtyRows.push(['지자체', '수급자', '차상위', '계']);
      data.quantityTotal.byRegion.forEach(r => qtyRows.push([r.region, r.basicQty, r.povertyQty, r.basicQty + r.povertyQty]));
      const gt = data.quantityTotal.grandTotal;
      qtyRows.push(['전체 합계', gt.basicQty, gt.povertyQty, gt.basicQty + gt.povertyQty]);
    }
    qtyRows.push([]);
    qtyRows.push(['[월별 추이]']);
    qtyRows.push(['월', '수급자', '차상위', '계', '마감']);
    months.forEach(ms => {
      if (isPartner) {
        const mq = partnerMonthQty(ms);
        const b = mq?.basicQty || 0, p = mq?.povertyQty || 0;
        qtyRows.push([monthFull(ms.month), b, p, b + p, ms.exists ? (ms.isClosed ? '마감' : '미마감') : '데이터없음']);
      } else {
        const gt = ms.quantity.grandTotal;
        qtyRows.push([monthFull(ms.month), gt.basicQty, gt.povertyQty, gt.basicQty + gt.povertyQty, ms.exists ? (ms.isClosed ? '마감' : '미마감') : '데이터없음']);
      }
    });
    const wsQty = XLSX.utils.aoa_to_sheet(qtyRows);
    wsQty['!cols'] = [{ wpx: 140 }, { wpx: 80 }, { wpx: 80 }, { wpx: 90 }, { wpx: 80 }];
    XLSX.utils.book_append_sheet(wb, wsQty, '수량');

    // ── 시트2: 계산서발급액 (관리자 전용) ──
    if (!isPartner) {
      const bRows: any[][] = [];
      bRows.push([`계산서발급액 통계 (${state.range.start} ~ ${state.range.end})`]);
      bRows.push([]);
      bRows.push(['[지자체별 기간합계]']);
      bRows.push(['행정시', '지자체', '수량', '공급가', '세액', '합계']);
      data.billingReportTotal.report.forEach(it => bRows.push([it.city, it.region, it.sum.qty, it.sum.supply, it.sum.vat, it.sum.amount]));
      const { gTotal, sTotal, grandTotal } = data.billingReportTotal;
      bRows.push(['경기도 합계', '', gTotal.qty, gTotal.supply, gTotal.vat, gTotal.amount]);
      bRows.push(['서울시 합계', '', sTotal.qty, sTotal.supply, sTotal.vat, sTotal.amount]);
      bRows.push(['전체 합계', '', grandTotal.qty, grandTotal.supply, grandTotal.vat, grandTotal.amount]);
      bRows.push([]);
      bRows.push(['[월별 추이]']);
      bRows.push(['월', '수량', '공급가', '세액', '합계', '마감']);
      months.forEach(ms => {
        const g = ms.billingReport.grandTotal;
        bRows.push([monthFull(ms.month), g.qty, g.supply, g.vat, g.amount, ms.exists ? (ms.isClosed ? '마감' : '미마감') : '데이터없음']);
      });
      const wsB = XLSX.utils.aoa_to_sheet(bRows);
      wsB['!cols'] = [{ wpx: 80 }, { wpx: 110 }, { wpx: 70 }, { wpx: 100 }, { wpx: 90 }, { wpx: 110 }];
      XLSX.utils.book_append_sheet(wb, wsB, '계산서발급액');
    }

    // ── 시트3: 결제내역 ──
    const pRows: any[][] = [];
    pRows.push([`결제내역 통계 (${state.range.start} ~ ${state.range.end})`]);
    pRows.push([]);
    if (isPartner) {
      const my = view?.myPay;
      pRows.push(['회원사', shortNameOf(partnerCompany || '')]);
      pRows.push([]);
      pRows.push(['지자체', '수량', '공급가', '세액', '합계']);
      (my?.regions || []).forEach(r => pRows.push([r.region, r.qty, r.supplyValue, r.vatValue, r.finalRowTotal]));
      pRows.push(['합계', my?.totalQty || 0, my?.totalSupply || 0, my?.totalVat || 0, my?.totalAmount || 0]);
    } else {
      pRows.push(['[회원사별 기간합계]']);
      pRows.push(['회원사', '수량', '공급가', '세액', '합계']);
      data.billingSummaryTotal.sorted.forEach(m => pRows.push([shortNameOf(m.member), m.totalQty, m.totalSupply, m.totalVat, m.totalAmount]));
      const bs = data.billingSummaryTotal;
      pRows.push(['전체 합계', bs.grandTotalQty, bs.grandTotalSupply, bs.grandTotalVat, bs.grandTotalAmount]);
    }
    pRows.push([]);
    pRows.push(['[월별 추이]']);
    pRows.push(['월', '수량', '합계', '마감']);
    months.forEach(ms => {
      if (isPartner) {
        const mp = partnerMonthPay(ms);
        pRows.push([monthFull(ms.month), mp?.totalQty || 0, mp?.totalAmount || 0, ms.exists ? (ms.isClosed ? '마감' : '미마감') : '데이터없음']);
      } else {
        pRows.push([monthFull(ms.month), ms.billingSummary.grandTotalQty, ms.billingSummary.grandTotalAmount, ms.exists ? (ms.isClosed ? '마감' : '미마감') : '데이터없음']);
      }
    });
    const wsP = XLSX.utils.aoa_to_sheet(pRows);
    wsP['!cols'] = [{ wpx: 140 }, { wpx: 70 }, { wpx: 100 }, { wpx: 90 }, { wpx: 110 }];
    XLSX.utils.book_append_sheet(wb, wsP, '결제내역');

    const who = isPartner ? `_${shortNameOf(partnerCompany || '')}` : '';
    XLSX.writeFile(wb, `${state.range.start}~${state.range.end}_통계자료${who}.xlsx`);
    showToast('통계 엑셀이 생성되었습니다.');
  };

  // ─── 합계 카드 값 ──
  const totalBasic = isPartner ? (view?.myQty?.basicQty || 0) : (data?.quantityTotal.grandTotal.basicQty || 0);
  const totalPoverty = isPartner ? (view?.myQty?.povertyQty || 0) : (data?.quantityTotal.grandTotal.povertyQty || 0);
  const totalBilling = data?.billingReportTotal.grandTotal.amount || 0;
  const totalPayment = isPartner ? (view?.myPay?.totalAmount || 0) : (data?.billingSummaryTotal.grandTotalAmount || 0);

  return (
    <div className="anim-in space-y-5">
      {/* ── 기간 선택 카드 ── */}
      <div className="glass rounded-2xl p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 size={18} className="text-sky-600" />
          <h2 className="text-base sm:text-lg font-black text-sky-800">기간별 통계자료</h2>
          {isPartner && <span className="text-[11px] font-bold text-sky-500 bg-sky-50 px-2 py-0.5 rounded-full">{shortNameOf(partnerCompany || '')}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="month" title="시작 월" value={startMonth} max={endMonth} onChange={e => setStartMonth(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold outline-none focus:border-sky-400" />
          <span className="font-black text-slate-400">~</span>
          <input type="month" title="종료 월" value={endMonth} min={startMonth} onChange={e => setEndMonth(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold outline-none focus:border-sky-400" />
          <button onClick={() => run(startMonth, endMonth)} disabled={state.loading}
            className="btn-sky px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1.5 disabled:opacity-50">
            <Search size={15} /> 조회
          </button>
          <div className="flex gap-1.5 ml-auto">
            {[3, 6, 12].map(n => (
              <button key={n} onClick={() => handleQuickRange(n)} disabled={state.loading}
                className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-sky-100 text-slate-600 transition-colors disabled:opacity-50">
                최근 {n}개월
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── 상태 ── */}
      {state.loading && (
        <div className="text-center py-16 text-sky-400 font-bold text-sm anim-in">통계 데이터를 불러오는 중…</div>
      )}
      {state.error && !state.loading && (
        <div className="rounded-xl bg-red-50 border border-red-200 text-red-600 font-bold text-sm px-4 py-3">{state.error}</div>
      )}

      {!state.loading && data && (
        <>
          {/* ── 기간합계 히어로 ── */}
          <div className="sky-hero p-6 sm:p-8 text-white">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="relative z-10">
                <div className="text-sky-200 font-bold text-[10px] sm:text-xs uppercase tracking-widest mb-1">기간 통계 · {rangeLabel}</div>
                <div className="flex flex-wrap gap-x-6 gap-y-2 mt-2">
                  <div>
                    <div className="text-sky-200 text-[11px] font-bold">수급자</div>
                    <div className="fin-num text-xl sm:text-3xl font-black">{formatNumber(totalBasic)}</div>
                  </div>
                  <div>
                    <div className="text-sky-200 text-[11px] font-bold">차상위</div>
                    <div className="fin-num text-xl sm:text-3xl font-black">{formatNumber(totalPoverty)}</div>
                  </div>
                  {!isPartner && (
                    <div>
                      <div className="text-sky-200 text-[11px] font-bold">계산서발급액</div>
                      <div className="fin-num text-xl sm:text-3xl font-black">{formatCur(totalBilling)}</div>
                    </div>
                  )}
                  <div>
                    <div className="text-sky-200 text-[11px] font-bold">결제액</div>
                    <div className="fin-num text-xl sm:text-3xl font-black">{formatCur(totalPayment)}</div>
                  </div>
                </div>
              </div>
              <button onClick={handleExportExcel}
                className="w-full md:w-auto relative z-10 bg-[#107C41] hover:bg-[#185C37] text-white px-3 sm:px-5 py-2 rounded-xl font-bold text-[11px] sm:text-xs shadow-md transition-all flex items-center justify-center gap-1.5 whitespace-nowrap">
                <ExcelIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> 엑셀 다운로드
              </button>
            </div>
            {openMonths > 0 && (
              <div className="relative z-10 mt-3 text-[11px] text-amber-100 bg-amber-500/30 rounded-lg px-3 py-1.5 inline-block">
                ⚠️ 미마감 {openMonths}개월 포함 — 잠정치입니다.
              </div>
            )}
          </div>

          {state.emptyMonths.length > 0 && (
            <div className="rounded-xl bg-slate-50 border border-slate-200 text-slate-500 font-bold text-xs px-4 py-2.5">
              데이터 없는 월: {state.emptyMonths.map(monthLabel).join(', ')}
            </div>
          )}

          {/* ── 섹션 A: 수량 ── */}
          <SectionCard title="수량 (수급자 · 차상위)" open={expanded.qty} onToggle={() => toggle('qty')}>
            {isPartner ? (
              <QtyTable
                rows={(view?.myQty?.regions || []).map(r => ({ name: r.region, basic: r.basicQty, poverty: r.povertyQty }))}
                firstHeader="지자체"
                totalRow={{ name: '합계', basic: view?.myQty?.basicQty || 0, poverty: view?.myQty?.povertyQty || 0 }}
              />
            ) : (
              <>
                <SubTitle>회원사별</SubTitle>
                <QtyTable
                  rows={data.quantityTotal.byCompany.map(c => ({ name: shortNameOf(c.company), basic: c.basicQty, poverty: c.povertyQty }))}
                  firstHeader="회원사"
                />
                <SubTitle className="mt-4">지자체별</SubTitle>
                <QtyTable
                  rows={data.quantityTotal.byRegion.map(r => ({ name: r.region, basic: r.basicQty, poverty: r.povertyQty }))}
                  firstHeader="지자체"
                  totalRow={{ name: '전체 합계', basic: data.quantityTotal.grandTotal.basicQty, poverty: data.quantityTotal.grandTotal.povertyQty }}
                />
              </>
            )}
            {expanded.qty && (
              <MonthlyBlock months={data.months} cols={['수급자', '차상위', '계']} rowOf={ms => {
                const src = isPartner ? partnerMonthQty(ms) : null;
                const b = isPartner ? (src?.basicQty || 0) : ms.quantity.grandTotal.basicQty;
                const p = isPartner ? (src?.povertyQty || 0) : ms.quantity.grandTotal.povertyQty;
                return [formatNumber(b), formatNumber(p), formatNumber(b + p)];
              }} />
            )}
          </SectionCard>

          {/* ── 섹션 B: 계산서발급액 (관리자 전용) ── */}
          {!isPartner && (
            <SectionCard title="계산서발급액 (지자체별)" open={expanded.billing} onToggle={() => toggle('billing')}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-500 text-xs border-b border-slate-200">
                      <th className="text-left py-2 px-2">행정시</th>
                      <th className="text-left py-2 px-2">지자체</th>
                      <th className="text-right py-2 px-2">수량</th>
                      <th className="text-right py-2 px-2">공급가</th>
                      <th className="text-right py-2 px-2">세액</th>
                      <th className="text-right py-2 px-2">합계</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.billingReportTotal.report.map(it => (
                      <tr key={it.region} className="border-b border-slate-50">
                        <td className="py-2 px-2 text-slate-400 text-xs">{it.city}</td>
                        <td className="py-2 px-2 font-bold text-slate-700">{it.region}</td>
                        <td className="py-2 px-2 text-right fin-num">{formatNumber(it.sum.qty)}</td>
                        <td className="py-2 px-2 text-right fin-num">{formatNumber(it.sum.supply)}</td>
                        <td className="py-2 px-2 text-right fin-num text-slate-500">{formatNumber(it.sum.vat)}</td>
                        <td className="py-2 px-2 text-right fin-num font-bold text-sky-700">{formatNumber(it.sum.amount)}</td>
                      </tr>
                    ))}
                    {[
                      { label: '경기도 합계', t: data.billingReportTotal.gTotal },
                      { label: '서울시 합계', t: data.billingReportTotal.sTotal },
                      { label: '전체 합계', t: data.billingReportTotal.grandTotal, strong: true },
                    ].map(({ label, t, strong }) => (
                      <tr key={label} className={strong ? 'bg-sky-50 font-black' : 'bg-slate-50 font-bold'}>
                        <td className="py-2 px-2" colSpan={2}>{label}</td>
                        <td className="py-2 px-2 text-right fin-num">{formatNumber(t.qty)}</td>
                        <td className="py-2 px-2 text-right fin-num">{formatNumber(t.supply)}</td>
                        <td className="py-2 px-2 text-right fin-num text-slate-500">{formatNumber(t.vat)}</td>
                        <td className="py-2 px-2 text-right fin-num text-sky-700">{formatNumber(t.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {expanded.billing && (
                <MonthlyBlock months={data.months} cols={['수량', '공급가', '합계']} rowOf={ms => {
                  const g = ms.billingReport.grandTotal;
                  return [formatNumber(g.qty), formatNumber(g.supply), formatNumber(g.amount)];
                }} />
              )}
            </SectionCard>
          )}

          {/* ── 섹션 C: 결제내역 ── */}
          <SectionCard title="결제내역 (회원사별)" open={expanded.payment} onToggle={() => toggle('payment')}>
            {isPartner ? (
              <PaymentTable rows={(view?.myPay?.regions || []).map(r => ({ name: r.region, qty: r.qty, supply: r.supplyValue, vat: r.vatValue, amount: r.finalRowTotal }))}
                firstHeader="지자체"
                totalRow={{ name: '합계', qty: view?.myPay?.totalQty || 0, supply: view?.myPay?.totalSupply || 0, vat: view?.myPay?.totalVat || 0, amount: view?.myPay?.totalAmount || 0 }} />
            ) : (
              <PaymentTable rows={data.billingSummaryTotal.sorted.map(m => ({ name: shortNameOf(m.member), qty: m.totalQty, supply: m.totalSupply, vat: m.totalVat, amount: m.totalAmount }))}
                firstHeader="회원사"
                totalRow={{ name: '전체 합계', qty: data.billingSummaryTotal.grandTotalQty, supply: data.billingSummaryTotal.grandTotalSupply, vat: data.billingSummaryTotal.grandTotalVat, amount: data.billingSummaryTotal.grandTotalAmount }} />
            )}
            {expanded.payment && (
              <MonthlyBlock months={data.months} cols={['수량', '결제액']} rowOf={ms => {
                if (isPartner) { const mp = partnerMonthPay(ms); return [formatNumber(mp?.totalQty || 0), formatNumber(mp?.totalAmount || 0)]; }
                return [formatNumber(ms.billingSummary.grandTotalQty), formatNumber(ms.billingSummary.grandTotalAmount)];
              }} />
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}

// ─── 하위 표현 컴포넌트 ─────────────────────────────────────────────────────────
function SectionCard({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: React.ReactNode; }) {
  return (
    <div className="fin-card p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-black text-slate-700 text-sm sm:text-base">{title}</h3>
        <button onClick={onToggle} className="flex items-center gap-1 text-xs font-bold text-sky-600 hover:text-sky-800">
          {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />} 월별내역
        </button>
      </div>
      {children}
    </div>
  );
}

function SubTitle({ children, className = '' }: { children: React.ReactNode; className?: string; }) {
  return <div className={`text-xs font-black text-sky-600 mb-1.5 ${className}`}>{children}</div>;
}

interface QtyRow { name: string; basic: number; poverty: number; }
function QtyTable({ rows, firstHeader, totalRow }: { rows: QtyRow[]; firstHeader: string; totalRow?: QtyRow; }) {
  if (rows.length === 0 && !totalRow) return <div className="text-xs text-slate-400 py-3">데이터가 없습니다.</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-slate-500 text-xs border-b border-slate-200">
            <th className="text-left py-2 px-2">{firstHeader}</th>
            <th className="text-right py-2 px-2">수급자</th>
            <th className="text-right py-2 px-2">차상위</th>
            <th className="text-right py-2 px-2">계</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.name} className="border-b border-slate-50">
              <td className="py-2 px-2 font-bold text-slate-700">{r.name}</td>
              <td className="py-2 px-2 text-right fin-num">{formatNumber(r.basic)}</td>
              <td className="py-2 px-2 text-right fin-num">{formatNumber(r.poverty)}</td>
              <td className="py-2 px-2 text-right fin-num font-bold text-sky-700">{formatNumber(r.basic + r.poverty)}</td>
            </tr>
          ))}
          {totalRow && (
            <tr className="bg-sky-50 font-black">
              <td className="py-2 px-2">{totalRow.name}</td>
              <td className="py-2 px-2 text-right fin-num">{formatNumber(totalRow.basic)}</td>
              <td className="py-2 px-2 text-right fin-num">{formatNumber(totalRow.poverty)}</td>
              <td className="py-2 px-2 text-right fin-num text-sky-700">{formatNumber(totalRow.basic + totalRow.poverty)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

interface PayRow { name: string; qty: number; supply: number; vat: number; amount: number; }
function PaymentTable({ rows, firstHeader, totalRow }: { rows: PayRow[]; firstHeader: string; totalRow?: PayRow; }) {
  if (rows.length === 0 && !totalRow) return <div className="text-xs text-slate-400 py-3">데이터가 없습니다.</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-slate-500 text-xs border-b border-slate-200">
            <th className="text-left py-2 px-2">{firstHeader}</th>
            <th className="text-right py-2 px-2">수량</th>
            <th className="text-right py-2 px-2">공급가</th>
            <th className="text-right py-2 px-2">세액</th>
            <th className="text-right py-2 px-2">합계</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.name} className="border-b border-slate-50">
              <td className="py-2 px-2 font-bold text-slate-700">{r.name}</td>
              <td className="py-2 px-2 text-right fin-num">{formatNumber(r.qty)}</td>
              <td className="py-2 px-2 text-right fin-num">{formatNumber(r.supply)}</td>
              <td className="py-2 px-2 text-right fin-num text-slate-500">{formatNumber(r.vat)}</td>
              <td className="py-2 px-2 text-right fin-num font-bold text-sky-700">{formatNumber(r.amount)}</td>
            </tr>
          ))}
          {totalRow && (
            <tr className="bg-sky-50 font-black">
              <td className="py-2 px-2">{totalRow.name}</td>
              <td className="py-2 px-2 text-right fin-num">{formatNumber(totalRow.qty)}</td>
              <td className="py-2 px-2 text-right fin-num">{formatNumber(totalRow.supply)}</td>
              <td className="py-2 px-2 text-right fin-num text-slate-500">{formatNumber(totalRow.vat)}</td>
              <td className="py-2 px-2 text-right fin-num text-sky-700">{formatNumber(totalRow.amount)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function MonthlyBlock({ months, cols, rowOf }: { months: MonthStats[]; cols: string[]; rowOf: (ms: MonthStats) => string[]; }) {
  return (
    <div className="mt-3 pt-3 border-t border-dashed border-slate-200 overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-slate-400 border-b border-slate-100">
            <th className="text-left py-1.5 px-2">월</th>
            {cols.map(c => <th key={c} className="text-right py-1.5 px-2">{c}</th>)}
            <th className="text-center py-1.5 px-2">상태</th>
          </tr>
        </thead>
        <tbody>
          {months.map(ms => {
            const vals = rowOf(ms);
            return (
              <tr key={ms.month} className="border-b border-slate-50">
                <td className="py-1.5 px-2 font-bold text-slate-600">{monthFull(ms.month)}</td>
                {vals.map((v, i) => <td key={i} className="py-1.5 px-2 text-right fin-num text-slate-600">{v}</td>)}
                <td className="py-1.5 px-2 text-center">
                  {!ms.exists ? <span className="text-slate-300">—</span>
                    : ms.isClosed ? <span className="text-emerald-500 font-bold">마감</span>
                    : <span className="text-amber-500 font-bold">미마감</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
