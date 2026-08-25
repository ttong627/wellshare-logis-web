import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Landmark, Upload, X, ShieldCheck, AlertTriangle, CheckCircle2,
  HelpCircle, Loader2, RefreshCw,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { formatNumber } from '../../lib/utils';
import ExcelIcon from '../shared/ExcelIcon';
import { runSettlement, recompute, todayISO } from '../../lib/settlement/pipeline.js';
import { buildReport } from '../../lib/settlement/report.js';
import { XLSX_MIME } from '../../lib/settlement/xlsx_write.js';
import { readTable } from '../../lib/settlement/xlsx_read.js';
import { parseFile } from '../../lib/settlement/parse.js';
import type {
  SettlementResult, SettlementSummary, Invoice, Match, SourceKind,
} from '../../lib/settlement/types';

// ── 업로드 목록에 올린 파일 한 줄 ───────────────────────────
interface Picked {
  name: string;
  file: File;
  kind: SourceKind | null;
  count: number;
  error: string | null;
  checking: boolean;
}

const KIND_LABEL: Record<SourceKind, string> = {
  hometax: '홈택스',
  ecount: '이카운트',
  bank: '은행',
};

const KIND_CHIP: Record<SourceKind, string> = {
  hometax: 'bg-sky-100 text-sky-700 border-sky-200',
  ecount: 'bg-violet-100 text-violet-700 border-violet-200',
  bank: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

const BUCKETS: { key: string; label: string; bar: string }[] = [
  { key: '기한전', label: '기한 전 (미도래)', bar: 'bg-slate-300' },
  { key: '30일', label: '연체 1~30일', bar: 'bg-sky-400' },
  { key: '60일', label: '연체 31~60일', bar: 'bg-amber-400' },
  { key: '90일', label: '연체 61~90일', bar: 'bg-orange-500' },
  { key: '90일초과', label: '연체 90일 초과', bar: 'bg-rose-500' },
];

type PaneId = 'outstanding' | 'review' | 'matched' | 'unknown' | 'invoices' | 'cross';

const STATUS_CHIP: Record<string, string> = {
  완납: 'bg-emerald-100 text-emerald-700',
  부분입금: 'bg-amber-100 text-amber-700',
  미입금: 'bg-rose-100 text-rose-700',
};

// Tailwind 는 소스에 그대로 적힌 클래스명만 만들어 낸다 —
// `text-${align}` 처럼 조립하면 CSS 가 생성되지 않으므로 반드시 완성형으로 적어 둔다.
const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' } as const;

const INPUT = 'w-full px-3 py-2 rounded-lg border border-slate-200 bg-white/80 text-[13px] '
  + 'font-bold text-slate-700 focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100';

export default function SettlementTab() {
  const { showToast } = useApp();

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [dragging, setDragging] = useState(false);
  const [running, setRunning] = useState(false);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<SettlementResult | null>(null);
  const [pane, setPane] = useState<PaneId>('outstanding');
  const [query, setQuery] = useState('');
  const [showHelp, setShowHelp] = useState(false);

  // 대사 조건 — 기본값 그대로 두어도 되고, 결제 조건만 회사 기준에 맞추면 연체일이 정확해진다
  const [direction, setDirection] = useState<'sale' | 'purchase'>('sale');
  const [asOf, setAsOf] = useState(todayISO());
  const [creditDays, setCreditDays] = useState(30);
  const [toleranceAbs, setToleranceAbs] = useState(1000);

  const isSale = direction !== 'purchase';

  // ── 파일 붙이기 ─────────────────────────────────────────
  const addFiles = useCallback(async (incoming: File[]) => {
    const fresh = incoming.filter((f) => !picked.some((p) => p.name === f.name));
    if (!fresh.length) return;

    setPicked((prev) => [
      ...prev,
      ...fresh.map((file) => ({
        name: file.name, file, kind: null, count: 0, error: null, checking: true,
      })),
    ]);

    // 올린 즉시 종류를 확인해 보여준다 — 잘못된 파일을 대사 전에 알아채기 위해서다
    for (const file of fresh) {
      let kind: SourceKind | null = null;
      let count = 0;
      let err: string | null = null;
      try {
        const table = await readTable(file, file.name);
        const parsed = parseFile(table, file.name, '');
        kind = parsed.kind;
        count = (parsed.kind === 'bank' ? parsed.payments : parsed.invoices)?.length ?? 0;
      } catch (e) {
        err = e instanceof Error ? e.message : '읽을 수 없는 파일입니다.';
      }
      setPicked((prev) => prev.map((p) =>
        p.name === file.name ? { ...p, kind, count, error: err, checking: false } : p));
    }
  }, [picked]);

  const removeFile = (name: string) => setPicked((prev) => prev.filter((p) => p.name !== name));

  const clearAll = () => {
    setPicked([]);
    setResult(null);
    setError('');
  };

  const ready = useMemo(() => {
    const ok = picked.filter((p) => !p.error && !p.checking);
    return ok.some((p) => p.kind === 'hometax' || p.kind === 'ecount') && ok.some((p) => p.kind === 'bank');
  }, [picked]);

  const readyHint = useMemo(() => {
    if (!picked.length) return '계산서 파일과 은행 파일이 각각 하나씩 필요합니다.';
    const ok = picked.filter((p) => !p.error && !p.checking);
    if (!ok.some((p) => p.kind === 'hometax' || p.kind === 'ecount')) return '세금계산서 파일(홈택스 또는 이카운트)이 더 필요합니다.';
    if (!ok.some((p) => p.kind === 'bank')) return '은행 거래내역 파일이 더 필요합니다.';
    return '준비됐습니다.';
  }, [picked]);

  // ── 실행 ───────────────────────────────────────────────
  const handleRun = async () => {
    setRunning(true);
    setError('');
    try {
      const res = await runSettlement(
        picked.filter((p) => !p.error).map((p) => ({ name: p.name, data: p.file })),
        { direction, asOf: asOf || todayISO(), creditDays, toleranceAbs },
      );
      setResult(res);
      setPane('outstanding');
      setQuery('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '대사에 실패했습니다.');
    } finally {
      setRunning(false);
    }
  };

  // ── '확인 필요' 판단 → 잔액 즉시 재계산 ──────────────────
  // recompute 는 넘긴 계산서·입금 객체를 제자리에서 고친다. state 를 직접 건드리지 않도록
  // 사본을 만들어 넘기고, 그 사본을 통째로 새 state 로 넣는다.
  const judge = (matchId: string, rejected: boolean, confirmIt: boolean) => {
    if (!result) return;

    const matches: Match[] = result.matches.map((m) => (
      m.id === matchId
        ? { ...m, rejected, status: confirmIt ? 'confirmed' : m.status }
        : m
    ));
    const next: SettlementResult = {
      ...result,
      matches,
      invoices: result.invoices.map((v) => ({ ...v })),
      payments: result.payments.map((p) => ({ ...p })),
    };

    recompute(next, next.options);
    next.summary = rebuildSummary(next);
    setResult(next);
  };

  // ── 엑셀 리포트 ────────────────────────────────────────
  const handleReport = async () => {
    if (!result) return;
    setBuilding(true);
    try {
      const bytes = await buildReport(result, {
        title: `정산 대사 리포트 (${isSale ? '매출·입금' : '매입·출금'})`,
        files: result.sources.map((s) => s.name),
        generatedAt: new Date().toLocaleString('ko-KR'),
      });
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: XLSX_MIME }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `정산대사_${result.summary.asOf}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      showToast('엑셀 리포트를 내려받았습니다.');
    } catch (e) {
      setError(e instanceof Error ? e.message : '리포트 생성에 실패했습니다.');
    } finally {
      setBuilding(false);
    }
  };

  const hit = useCallback((...fields: (string | null | undefined)[]) => {
    const q = query.trim().toLowerCase();
    return !q || fields.some((f) => String(f ?? '').toLowerCase().includes(q));
  }, [query]);

  const panes = useMemo(() => {
    if (!result) return [];
    const active = result.matches.filter((m) => !m.rejected);
    const list: { id: PaneId; label: string; n: number }[] = [
      { id: 'outstanding', label: isSale ? '미수금 현황' : '미지급 현황', n: result.partners.filter((p) => p.balance > 0).length },
      { id: 'review', label: '확인 필요', n: active.filter((m) => m.status === 'review').length },
      { id: 'matched', label: '매칭 내역', n: active.length },
      { id: 'unknown', label: isSale ? '미확인 입금' : '미확인 출금', n: result.payments.filter((p) => p.unmatched > 0).length },
      { id: 'invoices', label: '전체 계산서', n: result.invoices.length },
    ];
    if (result.crossCheck.ran) {
      list.push({
        id: 'cross',
        label: '홈택스↔이카운트 대조',
        n: result.crossCheck.onlyHometax.length + result.crossCheck.onlyEcount.length,
      });
    }
    return list;
  }, [result, isSale]);

  const s: SettlementSummary | null = result?.summary ?? null;

  return (
    <div className="space-y-3 anim-in">

      {/* ── 머리말 ───────────────────────────────────── */}
      <div className="glass rounded-2xl p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Landmark size={18} className="text-sky-600" />
            <h2 className="text-base sm:text-lg font-black text-sky-800">입금 대사</h2>
            <button onClick={() => setShowHelp((v) => !v)}
              className="text-sky-400 hover:text-sky-700" aria-label="사용법 보기">
              <HelpCircle size={15} />
            </button>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
            <ShieldCheck size={12} /> 파일은 이 브라우저 안에서만 처리 — 서버 전송 없음
          </span>
        </div>
        <p className="text-xs sm:text-[13px] text-sky-500 font-bold mt-2">
          세금계산서와 은행 입금을 맞춰 <b className="text-sky-700">입금 · 미입금</b>을 가려냅니다.
        </p>

        {showHelp && (
          <div className="mt-3 text-[12px] text-slate-600 leading-relaxed bg-sky-50/70 border border-sky-100 rounded-xl p-3 space-y-1.5">
            <p><b className="text-sky-700">홈택스</b> → 전자(세금)계산서 발급 → 발급목록조회 → 엑셀내려받기</p>
            <p><b className="text-violet-700">이카운트</b> → 판매현황 → 엑셀 저장</p>
            <p><b className="text-emerald-700">은행</b> → 인터넷뱅킹 거래내역조회 → 엑셀 다운로드</p>
            <p className="text-slate-500 pt-1">
              계산서는 홈택스·이카운트 중 하나만 넣어도 되고, <b>둘 다 넣으면</b> 중복을 지운 뒤
              한쪽에만 있는 건(장부 미입력 · 세금계산서 미발행 의심)까지 잡아줍니다.
              은행 파일은 반드시 하나 필요합니다.
            </p>
          </div>
        )}
      </div>

      {/* ── ①파일 ───────────────────────────────────── */}
      <div className="glass rounded-2xl p-4 sm:p-5">
        <h3 className="text-sm font-black text-sky-800 mb-2">1. 엑셀 올리기</h3>

        <div
          role="button" tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles([...e.dataTransfer.files]); }}
          className={`rounded-2xl border-2 border-dashed px-4 py-7 text-center cursor-pointer transition
            ${dragging ? 'border-sky-400 bg-sky-50' : 'border-slate-200 bg-slate-50/60 hover:border-sky-300'}`}
        >
          <Upload size={20} className="mx-auto text-sky-500 mb-1.5" />
          <p className="text-sm font-black text-slate-700">엑셀 파일을 끌어다 놓거나 클릭해서 선택</p>
          <p className="text-[11px] text-slate-400 font-bold mt-1">
            .xlsx · .csv · 은행이 내려주는 .xls(HTML) 지원 · 여러 개 한꺼번에 가능
          </p>
          <input ref={inputRef} type="file" multiple hidden
            accept=".xlsx,.xls,.csv,.txt"
            onChange={(e) => { addFiles([...(e.target.files ?? [])]); e.target.value = ''; }} />
        </div>

        {picked.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {picked.map((p) => (
              <li key={p.name}
                className="flex items-center gap-2 bg-white/70 border border-slate-200 rounded-xl px-3 py-2">
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border shrink-0 ${
                  p.checking ? 'bg-slate-100 text-slate-500 border-slate-200'
                    : p.error ? 'bg-rose-100 text-rose-700 border-rose-200'
                      : KIND_CHIP[p.kind as SourceKind]}`}>
                  {p.checking ? '확인 중' : p.error ? '인식 실패' : KIND_LABEL[p.kind as SourceKind]}
                </span>
                <span className="flex-1 min-w-0 truncate text-[12px] font-bold text-slate-700">{p.name}</span>
                {p.error
                  ? <span className="text-[11px] text-rose-600 font-bold truncate max-w-[45%]">{p.error}</span>
                  : !p.checking && <span className="text-[11px] text-slate-400 font-bold shrink-0">{formatNumber(p.count)}행</span>}
                <button onClick={() => removeFile(p.name)}
                  className="text-slate-300 hover:text-rose-500 shrink-0" aria-label={`${p.name} 빼기`}>
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── ②조건 + 실행 ─────────────────────────────── */}
      <div className="glass rounded-2xl p-4 sm:p-5">
        <h3 className="text-sm font-black text-sky-800 mb-2.5">2. 대사 조건</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <Field label="대사 방향">
            <select value={direction} onChange={(e) => setDirection(e.target.value as 'sale' | 'purchase')}
              className={INPUT}>
              <option value="sale">매출 · 받을 돈</option>
              <option value="purchase">매입 · 줄 돈</option>
            </select>
          </Field>
          <Field label="기준일">
            <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className={INPUT} />
          </Field>
          <Field label="결제 조건 (발행일 +일)">
            <input type="number" min={0} max={365} value={creditDays}
              onChange={(e) => setCreditDays(Number(e.target.value) || 0)} className={INPUT} />
          </Field>
          <Field label="허용 오차 (원)">
            <input type="number" min={0} step={100} value={toleranceAbs}
              onChange={(e) => setToleranceAbs(Number(e.target.value) || 0)} className={INPUT} />
          </Field>
        </div>

        <div className="flex items-center gap-2.5 mt-3.5 flex-wrap">
          <button onClick={handleRun} disabled={!ready || running}
            className="btn-sky px-5 py-2.5 rounded-xl text-sm font-black flex items-center gap-1.5 disabled:opacity-50">
            {running ? <><Loader2 size={15} className="animate-spin" /> 대사 중…</> : '대사 실행'}
          </button>
          {picked.length > 0 && (
            <button onClick={clearAll}
              className="px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-600 bg-white/85 border border-slate-200 hover:border-rose-300 hover:text-rose-600">
              비우기
            </button>
          )}
          <span className="text-[11px] font-bold text-slate-400">{readyHint}</span>
        </div>

        {error && (
          <div className="mt-3 flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2.5">
            <AlertTriangle size={15} className="text-rose-500 shrink-0 mt-0.5" />
            <p className="text-[12px] font-bold text-rose-700">{error}</p>
          </div>
        )}
      </div>

      {/* ── ③결과 ───────────────────────────────────── */}
      {result && s && (
        <>
          {result.warnings.length > 0 && (
            <div className="glass rounded-2xl p-4 border-l-4 border-amber-400">
              <p className="text-[12px] font-black text-amber-700 mb-1.5 flex items-center gap-1.5">
                <AlertTriangle size={14} /> 확인해 주세요
              </p>
              <ul className="list-disc pl-4 space-y-0.5">
                {result.warnings.map((w, i) => (
                  <li key={i} className="text-[12px] font-bold text-slate-600">{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* KPI */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            <Kpi label={isSale ? '청구액 (세금계산서)' : '매입액 (세금계산서)'}
              value={formatNumber(s.invoiceTotal)} sub={`${formatNumber(s.invoiceCount)}건`} />
            <Kpi label={isSale ? '입금 확인' : '지급 확인'} tone="good"
              value={formatNumber(s.paidTotal)}
              sub={`완납 ${s.settledCount}건 · 부분 ${s.partialCount}건${
                s.writeOffTotal ? ` · 수수료차감 ${formatNumber(s.writeOffTotal)}원` : ''}`} />
            <Kpi label={isSale ? '미수금' : '미지급금'} tone="bad"
              value={formatNumber(s.balanceTotal)}
              sub={`미입금 ${s.unpaidCount}건 · 부분입금 ${s.partialCount}건`} />
            <Kpi label={isSale ? '출처 미상 입금' : '용도 미상 출금'}
              value={formatNumber(s.unmatchedPaymentTotal)}
              sub={`${s.unmatchedPaymentCount}건 — 어느 건인지 못 찾음`} />
          </div>

          {/* Aging */}
          <div className="glass rounded-2xl p-4 sm:p-5">
            <h3 className="text-sm font-black text-sky-800 mb-0.5">연체 구간별 {isSale ? '미수금' : '미지급금'}</h3>
            <p className="text-[11px] text-slate-400 font-bold mb-3">
              결제 만기(발행일 + {creditDays}일)를 지난 일수 기준
            </p>
            <div className="space-y-1.5">
              {(() => {
                const max = Math.max(1, ...BUCKETS.map((b) => s.buckets[b.key]?.amount ?? 0));
                return BUCKETS.map((b) => {
                  const cell = s.buckets[b.key] ?? { count: 0, amount: 0 };
                  return (
                    <div key={b.key} className="flex items-center gap-2.5">
                      <span className="w-[104px] shrink-0 text-[11px] font-bold text-slate-600">{b.label}</span>
                      <span className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                        <span className={`block h-full rounded-full ${b.bar}`}
                          style={{ width: `${Math.round((cell.amount / max) * 100)}%` }} />
                      </span>
                      <span className="w-[104px] shrink-0 text-right text-[12px] font-black fin-num text-slate-700">
                        {formatNumber(cell.amount)}
                      </span>
                      <span className="w-[34px] shrink-0 text-right text-[11px] font-bold text-slate-400">{cell.count}건</span>
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          {/* 표 */}
          <div className="glass rounded-2xl p-4 sm:p-5">
            <div className="flex gap-1 flex-wrap border-b border-slate-200 mb-3">
              {panes.map((p) => (
                <button key={p.id} onClick={() => { setPane(p.id); setQuery(''); }}
                  className={`px-3 py-2 text-[12px] font-black border-b-2 -mb-px transition ${
                    pane === p.id ? 'text-sky-700 border-sky-500' : 'text-slate-400 border-transparent hover:text-slate-600'}`}>
                  {p.label}
                  <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${
                    pane === p.id ? 'bg-sky-500 text-white' : 'bg-slate-100 text-slate-500'}`}>{p.n}</span>
                </button>
              ))}
            </div>

            <input value={query} onChange={(e) => setQuery(e.target.value)} type="search"
              placeholder="거래처 · 적요 · 승인번호로 걸러보기"
              className={`${INPUT} mb-2.5`} />

            <div className="overflow-x-auto">
              {pane === 'outstanding' && <OutstandingTable result={result} hit={hit} />}
              {pane === 'review' && <MatchTable result={result} hit={hit} judgeable onJudge={judge} />}
              {pane === 'matched' && <MatchTable result={result} hit={hit} />}
              {pane === 'unknown' && <UnknownTable result={result} hit={hit} />}
              {pane === 'invoices' && <InvoiceTable result={result} hit={hit} />}
              {pane === 'cross' && <CrossTable result={result} hit={hit} />}
            </div>
          </div>

          <div className="flex gap-2.5 flex-wrap">
            <button onClick={handleReport} disabled={building}
              className="btn-sky px-5 py-2.5 rounded-xl text-sm font-black flex items-center gap-1.5 disabled:opacity-50">
              {building
                ? <><Loader2 size={15} className="animate-spin" /> 만드는 중…</>
                : <><ExcelIcon className="w-4 h-4" /> 엑셀 리포트 받기</>}
            </button>
            <button onClick={handleRun} disabled={running}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 bg-white/85 border border-slate-200 hover:border-sky-300 hover:text-sky-600 flex items-center gap-1.5 disabled:opacity-50">
              <RefreshCw size={13} /> 조건 바꿔 다시 대사
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
//  작은 조각들
// ══════════════════════════════════════════════════════════

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-black text-slate-500 mb-1">{label}</span>
      {children}
    </label>
  );
}

function Kpi({ label, value, sub, tone }: {
  label: string; value: string; sub: string; tone?: 'good' | 'bad';
}) {
  const color = tone === 'good' ? 'text-emerald-600' : tone === 'bad' ? 'text-rose-600' : 'text-slate-800';
  return (
    <div className="glass rounded-2xl px-4 py-3.5">
      <p className="text-[11px] font-black text-slate-500">{label}</p>
      <p className={`text-xl sm:text-2xl font-black fin-num mt-0.5 ${color}`}>{value}</p>
      <p className="text-[11px] font-bold text-slate-400 mt-0.5">{sub}</p>
    </div>
  );
}

type Hit = (...fields: (string | null | undefined)[]) => boolean;

const TH = ({ children, align = 'left' }: { children: React.ReactNode; align?: keyof typeof ALIGN }) => (
  <th className={`py-2 px-2 whitespace-nowrap ${ALIGN[align]}`}>{children}</th>
);

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-9 text-center text-[12px] font-bold text-slate-400">{children}</p>;
}

function Head({ children }: { children: React.ReactNode }) {
  return (
    <thead className="text-[11px] font-black text-slate-500 border-b border-slate-200">
      <tr>{children}</tr>
    </thead>
  );
}

// ── 미수금 현황 (거래처별) ──────────────────────────────────
function OutstandingTable({ result, hit }: { result: SettlementResult; hit: Hit }) {
  const rows = result.partners.filter((p) => p.balance > 0 && hit(p.name, p.bizNo));
  if (!rows.length) return <Empty>미수금이 있는 거래처가 없습니다 — 전부 회수됐습니다.</Empty>;
  return (
    <table className="w-full text-sm">
      <Head>
        <TH>거래처</TH><TH align="center">건수</TH><TH align="right">청구액</TH>
        <TH align="right">입금액</TH><TH align="right">미수금</TH>
        <TH align="center">최장 연체</TH><TH align="center">최초 미수 발행일</TH>
      </Head>
      <tbody>
        {rows.map((p) => (
          <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-sky-50/40">
            <td className="py-2 px-2 font-bold text-slate-700">{p.name}</td>
            <td className="py-2 px-2 text-center text-slate-400 text-xs">{p.count}</td>
            <td className="py-2 px-2 text-right fin-num text-slate-600">{formatNumber(p.invoiced)}</td>
            <td className="py-2 px-2 text-right fin-num text-slate-500">{formatNumber(p.paid)}</td>
            <td className="py-2 px-2 text-right fin-num font-black text-rose-600">{formatNumber(p.balance)}</td>
            <td className="py-2 px-2 text-center text-xs font-bold text-slate-500">
              {p.overdueMax > 0 ? `${p.overdueMax}일` : '-'}
            </td>
            <td className="py-2 px-2 text-center text-xs text-slate-400">{p.oldest ?? '-'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── 매칭 내역 / 확인 필요 ──────────────────────────────────
function MatchTable({ result, hit, judgeable, onJudge }: {
  result: SettlementResult; hit: Hit; judgeable?: boolean;
  onJudge?: (id: string, rejected: boolean, confirmIt: boolean) => void;
}) {
  const invById = new Map(result.invoices.map((v) => [v.id, v]));
  const payById = new Map(result.payments.map((p) => [p.id, p]));

  const rows: Match[] = result.matches
    .filter((m) => (judgeable ? (m.status === 'review' || m.rejected) : !m.rejected))
    .filter((m) => hit(m.partnerName, m.note, m.ruleLabel))
    .sort((a, b) => b.confidence - a.confidence);

  if (!rows.length) {
    return <Empty>{judgeable ? '사람이 볼 게 없습니다 — 전부 자동으로 확정됐습니다.' : '매칭된 건이 없습니다.'}</Empty>;
  }

  return (
    <table className="w-full text-sm">
      <Head>
        <TH align="center">판정</TH><TH align="center">근거</TH><TH align="center">신뢰도</TH>
        <TH>거래처</TH><TH align="center">계산서일</TH><TH align="center">입금일</TH>
        <TH align="right">대사금액</TH><TH align="right">차액</TH><TH>입금 적요</TH>
        {judgeable && <TH align="center">판단</TH>}
      </Head>
      <tbody>
        {rows.map((m) => {
          const inv = m.invoiceIds.map((id) => invById.get(id)).filter(Boolean);
          const pay = m.paymentIds.map((id) => payById.get(id)).filter(Boolean);
          const pct = Math.round(m.confidence * 100);
          return (
            <tr key={m.id}
              className={`border-b border-slate-100 last:border-0 hover:bg-sky-50/40 ${m.rejected ? 'opacity-40' : ''}`}>
              <td className="py-2 px-2 text-center">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                  m.rejected ? 'bg-slate-100 text-slate-500'
                    : m.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  {m.rejected ? '거절함' : m.status === 'confirmed' ? '확정' : '확인필요'}
                </span>
              </td>
              <td className="py-2 px-2 text-center text-[11px] font-bold text-slate-500 whitespace-nowrap">{m.ruleLabel}</td>
              <td className="py-2 px-2">
                <div className="flex items-center gap-1.5 justify-center">
                  <span className="w-9 h-1.5 rounded-full bg-slate-200 overflow-hidden shrink-0">
                    <span className="block h-full bg-sky-500 rounded-full" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="text-[11px] font-bold text-slate-500 fin-num">{pct}%</span>
                </div>
              </td>
              <td className="py-2 px-2 font-bold text-slate-700">{m.partnerName || '-'}</td>
              <td className="py-2 px-2 text-center text-xs text-slate-400">{inv[0]?.date ?? '-'}</td>
              <td className="py-2 px-2 text-center text-xs text-slate-400">{pay[0]?.date ?? '-'}</td>
              <td className="py-2 px-2 text-right fin-num font-bold text-slate-700">{formatNumber(m.amount)}</td>
              <td className="py-2 px-2 text-right fin-num text-slate-400">{m.diff ? formatNumber(m.diff) : '-'}</td>
              <td className="py-2 px-2 text-xs text-slate-500 max-w-[180px] truncate">
                {pay.map((p) => p?.depositor).filter(Boolean).join(', ') || '-'}
                {m.note && <span className="block text-[10px] text-slate-400">{m.note}</span>}
              </td>
              {judgeable && (
                <td className="py-2 px-2 text-center whitespace-nowrap">
                  {m.rejected ? (
                    <button onClick={() => onJudge?.(m.id, false, false)}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-slate-500 border border-slate-200 hover:border-sky-300">
                      되돌리기
                    </button>
                  ) : (
                    <span className="inline-flex gap-1">
                      <button onClick={() => onJudge?.(m.id, false, true)}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-black text-white bg-emerald-600 hover:bg-emerald-700">
                        맞음
                      </button>
                      <button onClick={() => onJudge?.(m.id, true, false)}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-rose-600 border border-rose-200 hover:bg-rose-50">
                        아님
                      </button>
                    </span>
                  )}
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── 미확인 입금 ────────────────────────────────────────────
function UnknownTable({ result, hit }: { result: SettlementResult; hit: Hit }) {
  const rows = result.payments
    .filter((p) => p.unmatched > 0 && hit(p.depositor, p.memo, p.branch))
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  if (!rows.length) {
    return (
      <Empty>
        <CheckCircle2 size={16} className="inline mr-1 text-emerald-500" />
        모든 입금이 계산서에 연결됐습니다.
      </Empty>
    );
  }
  return (
    <table className="w-full text-sm">
      <Head>
        <TH align="center">거래일</TH><TH>적요 · 입금자</TH><TH align="right">입금액</TH>
        <TH align="right">대사된 금액</TH><TH align="right">미대사 잔액</TH><TH align="center">거래점</TH>
      </Head>
      <tbody>
        {rows.map((p) => (
          <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-sky-50/40">
            <td className="py-2 px-2 text-center text-xs text-slate-400">{p.date ?? '-'}</td>
            <td className="py-2 px-2 font-bold text-slate-700">{p.depositor || '(적요 없음)'}</td>
            <td className="py-2 px-2 text-right fin-num text-slate-600">{formatNumber(p.amount)}</td>
            <td className="py-2 px-2 text-right fin-num text-slate-400">{formatNumber(p.matched)}</td>
            <td className="py-2 px-2 text-right fin-num font-black text-rose-600">{formatNumber(p.unmatched)}</td>
            <td className="py-2 px-2 text-center text-xs text-slate-400">{p.branch || '-'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── 전체 계산서 ────────────────────────────────────────────
function InvoiceTable({ result, hit }: { result: SettlementResult; hit: Hit }) {
  const rows = result.invoices
    .filter((v) => hit(v.partnerName, v.docNo, v.note))
    .slice()
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  if (!rows.length) return <Empty>계산서가 없습니다.</Empty>;
  return (
    <table className="w-full text-sm">
      <Head>
        <TH align="center">작성일자</TH><TH>거래처</TH><TH align="right">청구액</TH>
        <TH align="right">입금액</TH><TH align="right">잔액</TH><TH align="center">상태</TH>
        <TH align="center">만기일</TH><TH align="center">연체</TH><TH align="center">출처</TH>
      </Head>
      <tbody>
        {rows.map((v: Invoice) => (
          <tr key={v.id} className="border-b border-slate-100 last:border-0 hover:bg-sky-50/40">
            <td className="py-2 px-2 text-center text-xs text-slate-400">{v.date ?? '-'}</td>
            <td className="py-2 px-2 font-bold text-slate-700">{v.partnerName}</td>
            <td className="py-2 px-2 text-right fin-num text-slate-600">{formatNumber(v.amount)}</td>
            <td className="py-2 px-2 text-right fin-num text-slate-500">{formatNumber(v.paid)}</td>
            <td className={`py-2 px-2 text-right fin-num ${v.balance > 0 ? 'font-black text-rose-600' : 'text-slate-300'}`}>
              {formatNumber(v.balance)}
            </td>
            <td className="py-2 px-2 text-center">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${STATUS_CHIP[v.status] ?? ''}`}>
                {v.status}
              </span>
            </td>
            <td className="py-2 px-2 text-center text-xs text-slate-400">{v.dueDate ?? '-'}</td>
            <td className="py-2 px-2 text-center text-xs font-bold text-slate-500">
              {v.overdueDays > 0 ? `${v.overdueDays}일` : '-'}
            </td>
            <td className="py-2 px-2 text-center text-[10px] font-bold text-slate-400">
              {(v.sources ?? [v.kind]).map((k) => KIND_LABEL[k] ?? k).join('+')}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── 홈택스 ↔ 이카운트 대조 ─────────────────────────────────
function CrossTable({ result, hit }: { result: SettlementResult; hit: Hit }) {
  const { onlyHometax, onlyEcount } = result.crossCheck;

  const block = (title: string, desc: string, list: Invoice[], tone: 'warn' | 'bad') => {
    const rows = list.filter((v) => hit(v.partnerName, v.docNo));
    return (
      <div className="mb-5 last:mb-0">
        <div className={`rounded-xl px-3 py-2.5 mb-2 border ${
          tone === 'bad' ? 'bg-rose-50 border-rose-200' : 'bg-amber-50 border-amber-200'}`}>
          <p className={`text-[12px] font-black ${tone === 'bad' ? 'text-rose-700' : 'text-amber-700'}`}>{title}</p>
          <p className="text-[11px] font-bold text-slate-500 mt-0.5">{desc}</p>
        </div>
        {rows.length === 0 ? (
          <p className="py-4 text-center text-[12px] font-bold text-slate-400">해당 없음</p>
        ) : (
          <table className="w-full text-sm">
            <Head>
              <TH align="center">작성일자</TH><TH>거래처</TH><TH align="right">금액</TH><TH>승인번호 · 전표</TH>
            </Head>
            <tbody>
              {rows.map((v) => (
                <tr key={v.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 px-2 text-center text-xs text-slate-400">{v.date ?? '-'}</td>
                  <td className="py-2 px-2 font-bold text-slate-700">{v.partnerName}</td>
                  <td className="py-2 px-2 text-right fin-num text-slate-700">{formatNumber(v.amount)}</td>
                  <td className="py-2 px-2 text-xs text-slate-400">{v.docNo || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  };

  return (
    <div>
      {block(
        `이카운트에 없는 계산서 ${onlyHometax.length}건`,
        '홈택스에는 있는데 장부에 안 들어간 건입니다. 매출 누락이면 결산이 틀어집니다.',
        onlyHometax, 'warn',
      )}
      {block(
        `홈택스에 없는 매출 ${onlyEcount.length}건`,
        '이카운트에만 있습니다. 세금계산서 미발행이면 가산세 대상이 될 수 있습니다.',
        onlyEcount, 'bad',
      )}
    </div>
  );
}

/** recompute 는 건별 상태만 되돌린다 — 화면 상단 숫자는 여기서 다시 만든다 */
function rebuildSummary(result: SettlementResult): SettlementSummary {
  const s: SettlementSummary = { ...result.summary, buckets: { ...result.summary.buckets } };
  const sum = <T,>(arr: T[], f: (x: T) => number) => arr.reduce((a, x) => a + f(x), 0);
  const active = result.matches.filter((m) => !m.rejected);
  const unmatched = result.payments.filter((p) => p.unmatched > 0);

  s.paidTotal = sum(result.invoices, (v) => v.paid);
  s.balanceTotal = sum(result.invoices, (v) => v.balance);
  s.writeOffTotal = sum(result.invoices.filter((v) => v.status === '완납'), (v) => v.residual);
  s.settledCount = result.invoices.filter((v) => v.status === '완납').length;
  s.partialCount = result.invoices.filter((v) => v.status === '부분입금').length;
  s.unpaidCount = result.invoices.filter((v) => v.status === '미입금').length;
  s.unmatchedPaymentCount = unmatched.length;
  s.unmatchedPaymentTotal = sum(unmatched, (p) => p.unmatched);
  s.matchCount = active.length;
  s.confirmedCount = active.filter((m) => m.status === 'confirmed').length;
  s.reviewCount = active.filter((m) => m.status === 'review').length;

  for (const key of ['기한전', '30일', '60일', '90일', '90일초과']) s.buckets[key] = { count: 0, amount: 0 };
  for (const v of result.invoices) {
    if (v.status === '완납') continue;
    const b = s.buckets[v.agingBucket];
    if (b) { b.count += 1; b.amount += v.balance; }
  }
  return s;
}
