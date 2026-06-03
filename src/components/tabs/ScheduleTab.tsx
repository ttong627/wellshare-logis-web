import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Trash2, Search, RotateCcw, Printer, Download, FileDown,
  UserPlus, Calendar, Users, LayoutGrid,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, APP_ID } from '../../firebase';
import { useApp } from '../../context/AppContext';
import { REGION_ORDER, SEOUL_REGIONS, GYEONGGI_REGIONS } from '../../constants/regions';
import { ScheduleItem, ScheduleData, Driver } from '../../types';
import { safeRender } from '../../lib/utils';

const DONG_DATA: Record<string, string[]> = {
  '부천시 소사구': ['심곡본동', '심곡본1동', '소사본동', '소사본3동', '범박동', '괴안동', '역곡3동', '송내1동', '송내2동', '옥길동'],
  '부천시 오정구': ['성곡동', '고강본동', '고강1동', '원종1동', '원종2동', '오정동', '신흥동'],
  '부천시 원미구': ['심곡1동', '심곡2동', '심곡3동', '원미1동', '원미2동', '소사동', '역곡1동', '역곡2동', '춘의동', '도당동', '약대동', '중동', '중1동', '중2동', '중3동', '중4동', '상동', '상1동', '상2동', '상3동'],
  '시흥시': ['대야동', '신천동', '신현동', '은행동', '매화동', '과림동', '연성동', '목감동', '군자동', '월곶동', '정왕본동', '정왕1동', '정왕2동', '정왕3동', '정왕4동', '거북섬동', '배곧1동', '배곧2동', '장곡동', '능곡동'],
  '여주시': ['가남읍', '점동면', '능서면', '흥천면', '금사면', '산북면', '대신면', '북내면', '강천면', '중앙동', '오학동', '여흥동'],
  '중구': ['광희동', '다산동', '명동', '무학동', '신당1동', '신당2동', '신당3동', '신당4동', '신당5동', '약수동', '장충동', '청구동', '필동', '황학동', '회현동'],
  '종로구': ['가회동', '교남동', '교북동', '구기동', '무악동', '부암동', '삼청동', '사직동', '이화동', '종로1·2·3·4가동', '종로5·6가동', '창신1동', '창신2동', '창신3동', '청운효자동', '평창동', '혜화동'],
  '용산구': ['남영동', '동빙고동', '동자동', '보광동', '서빙고동', '이촌1동', '이촌2동', '이태원1동', '이태원2동', '청파동', '한강로동', '한남동', '효창동', '후암동'],
  '동대문구': ['답십리1동', '답십리2동', '신설동', '용두동', '이문1동', '이문2동', '장안1동', '장안2동', '전농1동', '전농2동', '제기동', '청량리동', '회기동', '휘경1동', '휘경2동'],
};

const SIDO_MAP: Record<string, string> = Object.fromEntries([
  ...SEOUL_REGIONS.map(r => [r, '서울특별시']),
  ...GYEONGGI_REGIONS.map(r => [r, '경기도']),
]);

// ─── Chosung search helpers ─────────────────────────────────────────────────
const CHOSUNG = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
const getChosung = (c: string) => {
  const code = c.charCodeAt(0) - 0xAC00;
  return (code < 0 || code > 11171) ? c : CHOSUNG[Math.floor(code / 588)];
};
const matchChosung = (name: string, q: string) =>
  name.split('').map(getChosung).join('').includes(q);

// ─── Date range formatter (달력 버튼 표시용: 5/12, 5/14~17) ─────────────────
function formatDateRanges(dates: string[]): string {
  if (!dates.length) return '';
  const sorted = [...dates].sort();
  const ranges: [string, string][] = [];
  let start = sorted[0], end = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const diffDays = (new Date(sorted[i]).getTime() - new Date(end).getTime()) / 86400000;
    if (diffDays === 1) { end = sorted[i]; }
    else { ranges.push([start, end]); start = sorted[i]; end = sorted[i]; }
  }
  ranges.push([start, end]);
  return ranges.map(([s, e]) => {
    const [, sm, sd] = s.split('-').map(Number);
    const [, , ed] = e.split('-').map(Number);
    if (s === e) return `${sm}/${sd}`;
    return `${sm}/${sd}~${ed}`;
  }).join(', ');
}

// ─── 인쇄/엑셀용: "20일", "20 ~ 22일", "20, 22일" 형식 ──────────────────────
function formatDatesKorean(dates: string[], legacyDate?: string): string {
  if (!dates.length) return legacyDate || '';
  const sorted = [...dates].sort();
  const days = sorted.map(d => parseInt(d.split('-')[2], 10)).filter(n => !isNaN(n));
  if (!days.length) return legacyDate || '';
  const groups: number[][] = [[days[0]]];
  for (let i = 1; i < days.length; i++) {
    const last = groups[groups.length - 1];
    if (days[i] === last[last.length - 1] + 1) { last.push(days[i]); }
    else { groups.push([days[i]]); }
  }
  const parts = groups.map(g => g.length === 1 ? `${g[0]}` : `${g[0]} ~ ${g[g.length - 1]}`);
  return parts.join(', ') + '일';
}

// ─── 완료일: 배송일 중 마지막 날 ────────────────────────────────────────────
function getCompletionDate(dates: string[], legacyDate?: string): string {
  if (dates.length > 0) {
    const last = [...dates].sort().pop()!;
    const day = parseInt(last.split('-')[2], 10);
    return isNaN(day) ? '' : `${day}일`;
  }
  if (legacyDate) {
    const nums = legacyDate.match(/\d+/g);
    return nums ? `${nums[nums.length - 1]}일` : legacyDate;
  }
  return '';
}

interface SearchResult extends Driver {
  score: number;
  matchType: 'exact' | 'startsWith' | 'includes' | 'phone' | 'chosung';
}

function searchDrivers(query: string, drivers: Driver[]): SearchResult[] {
  if (!query.trim()) return [];
  const q = query.trim().toLowerCase();
  const qPhone = q.replace(/[-]/g, '');
  return drivers
    .map(d => {
      const name = (d.name || '').toLowerCase();
      const phone = (d.phone || '').replace(/[-]/g, '');
      let score = 0;
      let matchType: SearchResult['matchType'] | null = null;
      if (name === q) { score = 100; matchType = 'exact'; }
      else if (name.startsWith(q)) { score = 80; matchType = 'startsWith'; }
      else if (name.includes(q)) { score = 60; matchType = 'includes'; }
      else if (qPhone.length >= 4 && phone.includes(qPhone)) { score = 40; matchType = 'phone'; }
      else if (q.length >= 1 && matchChosung(name, q)) { score = 30; matchType = 'chosung'; }
      return (score > 0 && matchType) ? { ...d, score, matchType } as SearchResult : null;
    })
    .filter((d): d is SearchResult => d !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

// ─── Driver Autocomplete ────────────────────────────────────────────────────
interface AutocompleteProps {
  value: string;
  rowId: string;
  onSelect: (r: { rowId: string; name: string; phone: string; emergency: string }) => void;
  drivers: Driver[];
  readOnly?: boolean;
}

function DriverAutocomplete({ value, rowId, onSelect, drivers, readOnly }: AutocompleteProps) {
  const [input, setInput] = useState(value);
  const [prevValue, setPrevValue] = useState(value);
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (value !== prevValue) { setInput(value); setPrevValue(value); }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInput(val);
    setActiveIdx(-1);
    if (timer.current) clearTimeout(timer.current);
    if (!val.trim()) {
      setSuggestions([]); setOpen(false);
      onSelect({ rowId, name: val, phone: '', emergency: '' });
      return;
    }
    timer.current = setTimeout(() => {
      const r = searchDrivers(val, drivers);
      setSuggestions(r);
      setOpen(r.length > 0);
    }, 100);
  };

  const handleBlur = () => {
    setTimeout(() => {
      if (!open) onSelect({ rowId, name: input, phone: '', emergency: '' });
    }, 150);
  };

  const handleSelect = (d: Driver) => {
    setInput(d.name);
    setOpen(false);
    setSuggestions([]);
    setActiveIdx(-1);
    onSelect({ rowId, name: d.name, phone: d.phone || '', emergency: d.emergency || '' });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, suggestions.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); handleSelect(suggestions[activeIdx]); }
    else if (e.key === 'Escape') { setOpen(false); }
    else if (e.key === 'Tab' && suggestions.length > 0) { e.preventDefault(); handleSelect(suggestions[0]); }
  };

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!dropRef.current?.contains(e.target as Node) && !inputRef.current?.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const highlight = (text: string, q: string) => {
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return <>{text}</>;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-yellow-200 font-bold rounded-sm">{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </>
    );
  };

  return (
    <div className="relative w-full">
      <input
        ref={inputRef}
        value={input}
        readOnly={readOnly}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={readOnly ? '' : '기사명 검색...'}
        className={`w-full px-2 py-1.5 border rounded text-xs outline-none transition-all ${
          open ? 'border-blue-400 ring-1 ring-blue-200' : 'border-transparent'
        } ${readOnly ? 'bg-transparent' : 'bg-white/50 hover:bg-white focus:bg-white focus:border-blue-300'}`}
      />
      {open && suggestions.length > 0 && (
        <div
          ref={dropRef}
          className="absolute top-full left-0 right-0 z-[9999] bg-white border border-slate-200 rounded-b-lg shadow-2xl mt-px max-h-56 overflow-y-auto"
        >
          <div className="px-3 py-1 bg-slate-50 border-b text-[10px] font-bold text-slate-500 flex justify-between">
            <span>{suggestions.length}명 검색됨</span>
            <span className="opacity-50">↑↓ 이동 · Enter 선택</span>
          </div>
          {suggestions.map((d, idx) => (
            <div
              key={d.id}
              onMouseDown={e => { e.preventDefault(); handleSelect(d); }}
              onMouseEnter={() => setActiveIdx(idx)}
              className={`px-3 py-2 cursor-pointer flex items-center gap-2 text-xs border-b border-slate-50 ${activeIdx === idx ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
            >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${activeIdx === idx ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                {d.name?.[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-slate-800">{highlight(d.name || '', input)}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  📞 {d.phone || 'N/A'}{d.emergency ? <span className="ml-2 text-red-400">🚨 {d.emergency}</span> : null}
                </div>
              </div>
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold whitespace-nowrap ${
                d.matchType === 'exact' ? 'bg-green-100 text-green-700' :
                d.matchType === 'phone' ? 'bg-amber-100 text-amber-700' :
                d.matchType === 'chosung' ? 'bg-purple-100 text-purple-700' :
                'bg-blue-50 text-blue-600'
              }`}>
                {d.matchType === 'exact' ? '일치' : d.matchType === 'phone' ? '번호' : d.matchType === 'chosung' ? '초성' : '이름'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Delivery Date Picker ────────────────────────────────────────────────────
interface DatePickerProps {
  value: string[];
  year: string;
  month: string;
  readOnly?: boolean;
  legacyDate?: string;
  onChange: (dates: string[]) => void;
}

function DeliveryDatePicker({ value, year, month, readOnly, legacyDate, onChange }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [viewYr, setViewYr] = useState(parseInt(year, 10));
  const [viewMo, setViewMo] = useState(parseInt(month, 10));
  const containerRef = useRef<HTMLDivElement>(null);

  const daysInMonth = new Date(viewYr, viewMo, 0).getDate();
  const firstDayOfWeek = new Date(viewYr, viewMo - 1, 1).getDay();
  const selected = new Set(value);

  const padded = (n: number) => String(n).padStart(2, '0');

  const goPrev = () => {
    if (viewMo === 1) { setViewYr(y => y - 1); setViewMo(12); }
    else { setViewMo(m => m - 1); }
  };

  const goNext = () => {
    if (viewMo === 12) { setViewYr(y => y + 1); setViewMo(1); }
    else { setViewMo(m => m + 1); }
  };

  const toggleDay = (day: number) => {
    const dateStr = `${viewYr}-${padded(viewMo)}-${padded(day)}`;
    const next = selected.has(dateStr)
      ? value.filter(d => d !== dateStr)
      : [...value, dateStr].sort();
    onChange(next);
  };

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const label = value.length ? formatDateRanges(value) : '';
  const displayText = label || legacyDate || '';
  const isLegacy = !label && !!legacyDate;

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        disabled={readOnly}
        onClick={() => !readOnly && setOpen(p => !p)}
        className={`w-full text-left px-2 py-1.5 rounded text-xs outline-none border border-transparent transition-all whitespace-nowrap overflow-hidden text-ellipsis ${
          label ? 'text-blue-700 font-bold' :
          isLegacy ? 'text-slate-500 font-medium' :
          'text-slate-400'
        } ${readOnly ? 'bg-transparent cursor-default' : 'hover:border-slate-200 hover:bg-white focus:border-blue-300 bg-transparent'}`}
      >
        {displayText || <span className="opacity-40">날짜 선택</span>}
      </button>

      {open && (
        <div className="absolute top-full left-0 z-[9999] mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl p-3 w-60">
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={goPrev}
              className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-500 font-bold text-sm transition-colors"
            >
              ‹
            </button>
            <span className="text-xs font-bold text-slate-700">{viewYr}년 {viewMo}월</span>
            <button
              type="button"
              onClick={goNext}
              className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-500 font-bold text-sm transition-colors"
            >
              ›
            </button>
          </div>
          <div className="grid grid-cols-7 gap-px text-center text-[10px] text-slate-400 font-bold mb-1">
            {['일','월','화','수','목','금','토'].map(d => <div key={d}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-px">
            {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`b${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${viewYr}-${padded(viewMo)}-${padded(day)}`;
              const isSel = selected.has(dateStr);
              const isSun = (firstDayOfWeek + i) % 7 === 0;
              const isSat = (firstDayOfWeek + i) % 7 === 6;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={`w-7 h-7 mx-auto flex items-center justify-center rounded-full text-[11px] font-bold transition-all ${
                    isSel ? 'bg-blue-600 text-white shadow-sm' :
                    isSun ? 'hover:bg-red-50 text-red-500' :
                    isSat ? 'hover:bg-blue-50 text-blue-500' :
                    'hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
          {value.length > 0 && (
            <div className="mt-2 px-1 py-1.5 bg-blue-50 rounded-lg text-[10px] font-bold text-blue-700 text-center leading-relaxed">
              {label}
            </div>
          )}
          <div className="mt-2 flex gap-1.5">
            <button
              type="button"
              onClick={() => onChange([])}
              className="flex-1 text-[10px] py-1.5 text-slate-500 hover:text-red-500 border border-slate-200 rounded-lg transition-colors font-bold"
            >
              초기화
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-1 text-[10px] py-1.5 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors"
            >
              확인
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────
export default function ScheduleTab() {
  const { isAdmin, currentMonth, showToast, isSaving, setIsSaving } = useApp();

  const [activeSubTab, setActiveSubTab] = useState<'schedule' | 'drivers'>('schedule');
  const [selectedRegion, setSelectedRegion] = useState(REGION_ORDER[0]);
  const [scheduleData, setScheduleData] = useState<ScheduleData | null>(null);
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [driverSearch, setDriverSearch] = useState('');
  const [newDriver, setNewDriver] = useState({ name: '', phone: '', emergency: '' });
  const [driverSaving, setDriverSaving] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkText, setBulkText] = useState('');

  const [yr, mo] = currentMonth.split('-');
  const docId = `${currentMonth}-${selectedRegion}`;
  const formattedMonth = `${yr}년 ${parseInt(mo, 10)}월`;
  const completedCount = items.filter(i => i.isCompleted).length;
  const pct = items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0;

  // ─── Load ─────────────────────────────────────────────────────────────────
  const loadSchedule = useCallback(async () => {
    setLoading(true);
    setHasChanges(false);
    try {
      const snap = await getDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'schedule_records', docId));
      if (snap.exists()) {
        const data = snap.data() as ScheduleData;
        setScheduleData(data);
        setItems([...(data.items || [])].map(item => ({
          ...item,
          deliveryDates: item.deliveryDates ?? [],
        })).sort((a, b) => (a.dong || '').localeCompare(b.dong || '', 'ko')));
      } else {
        const newData: ScheduleData = {
          year: Number(yr), month: Number(mo),
          sido: SIDO_MAP[selectedRegion] || '', sigungu: selectedRegion, items: [],
        };
        setScheduleData(newData);
        setItems([]);
      }
      const dSnap = await getDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'drivers', 'list'));
      if (dSnap.exists()) setDrivers((dSnap.data().drivers as Driver[]) || []);
    } finally {
      setLoading(false);
    }
  }, [docId, yr, mo, selectedRegion]);

  useEffect(() => { loadSchedule(); }, [loadSchedule]);

  // ─── Save ─────────────────────────────────────────────────────────────────
  const saveSchedule = async (newItems?: ScheduleItem[]) => {
    const toSave = newItems ?? items;
    const updated: ScheduleData = {
      year: Number(yr), month: Number(mo),
      sido: SIDO_MAP[selectedRegion] || '', sigungu: selectedRegion,
      items: toSave,
    };
    setIsSaving(true);
    try {
      await setDoc(
        doc(db, 'artifacts', APP_ID, 'public', 'data', 'schedule_records', docId),
        { ...updated, lastUpdated: new Date().toISOString() }
      );
      setScheduleData(updated);
      setItems(toSave);
      setHasChanges(false);
      showToast('배송일정이 저장되었습니다.');
    } catch (e) { showToast('저장 오류: ' + (e as Error).message); }
    finally { setIsSaving(false); }
  };

  // ─── Item handlers ────────────────────────────────────────────────────────
  const updateItem = (id: string, field: keyof ScheduleItem, value: string | number | boolean) => {
    if (!isAdmin) return;
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
    setHasChanges(true);
  };

  const updateItemDates = (id: string, dates: string[]) => {
    if (!isAdmin) return;
    setItems(prev => prev.map(i => i.id === id ? { ...i, deliveryDates: dates } : i));
    setHasChanges(true);
  };

  const toggleComplete = async (id: string) => {
    const newItems = items.map(i => i.id === id ? { ...i, isCompleted: !i.isCompleted } : i);
    setItems(newItems);
    setIsSaving(true);
    try {
      await setDoc(
        doc(db, 'artifacts', APP_ID, 'public', 'data', 'schedule_records', docId),
        { ...scheduleData!, items: newItems, lastUpdated: new Date().toISOString() }
      );
      setScheduleData(prev => prev ? { ...prev, items: newItems } : null);
    } catch (e) {
      showToast('오류: ' + (e as Error).message);
      setItems(items);
    } finally { setIsSaving(false); }
  };

  const handleDriverSelect = ({ rowId, name, phone, emergency }: { rowId: string; name: string; phone: string; emergency: string }) => {
    if (!isAdmin) return;
    setItems(prev => prev.map(i => i.id === rowId ? {
      ...i,
      driverName: name,
      driverPhone: phone || i.driverPhone,
      emergencyPhone: emergency || i.emergencyPhone,
    } : i));
    setHasChanges(true);
  };

  const addRow = () => {
    if (!isAdmin) return;
    const newItem: ScheduleItem = {
      id: `${Date.now()}`, no: items.length + 1, dong: '', driverName: '',
      driverPhone: '', emergencyPhone: '', deliveryDate: '', deliveryDates: [], isCompleted: false, notes: '',
    };
    setItems(prev => [...prev, newItem]);
    setHasChanges(true);
  };

  const addRowForDong = (dong: string, no: number) => {
    if (!isAdmin) return;
    const newItem: ScheduleItem = {
      id: `${Date.now()}`, no: no + 0.1, dong, driverName: '',
      driverPhone: '', emergencyPhone: '', deliveryDate: '', deliveryDates: [], isCompleted: false, notes: '',
    };
    setItems(prev =>
      [...prev, newItem].sort((a, b) => {
        if (a.dong === b.dong) return a.no - b.no;
        return (a.dong || '').localeCompare(b.dong || '', 'ko');
      })
    );
    setHasChanges(true);
  };

  const deleteRow = (id: string) => {
    if (!isAdmin || !confirm('이 항목을 삭제하시겠습니까?')) return;
    setItems(prev => prev.filter(i => i.id !== id));
    setHasChanges(true);
  };

  const handleSort = () => {
    if (!items.length) return;
    setItems([...items].sort((a, b) => (a.dong || '').localeCompare(b.dong || '', 'ko')));
    setHasChanges(true);
  };

  const handleGenerateDongs = () => {
    if (!isAdmin) return;
    const dongs = DONG_DATA[selectedRegion];
    if (!dongs) return showToast('이 지역의 행정동 데이터가 없습니다.');
    if (items.length > 0 && !confirm('기존 데이터를 초기화하고 행정동을 자동 생성하시겠습니까?')) return;
    const newItems: ScheduleItem[] = [...dongs]
      .sort((a, b) => a.localeCompare(b, 'ko'))
      .map((dong, idx) => ({
        id: `init-${idx}-${Date.now()}`, no: idx + 1, dong, driverName: '',
        driverPhone: '', emergencyPhone: '', deliveryDate: '', deliveryDates: [], isCompleted: false, notes: '',
      }));
    setItems(newItems);
    setHasChanges(true);
    showToast(`${selectedRegion} 행정동 ${newItems.length}개를 자동 생성했습니다.`);
  };

  const handleCopyPreviousMonth = async () => {
    if (!isAdmin) return;
    const moNum = Number(mo);
    const yrNum = Number(yr);
    const prevMo = moNum === 1 ? 12 : moNum - 1;
    const prevYr = moNum === 1 ? yrNum - 1 : yrNum;
    const prevDocId = `${prevYr}-${String(prevMo).padStart(2, '0')}-${selectedRegion}`;
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'schedule_records', prevDocId));
      if (!snap.exists() || !(snap.data()?.items?.length)) {
        return showToast(`${prevYr}년 ${prevMo}월 데이터가 없습니다.`);
      }
      if (!confirm(`${prevYr}년 ${prevMo}월 데이터를 가져오시겠습니까?\n(배송일자·완료여부는 초기화됩니다)`)) return;
      const prevItems: ScheduleItem[] = (snap.data().items as ScheduleItem[])
        .sort((a, b) => (a.dong || '').localeCompare(b.dong || '', 'ko'))
        .map(item => ({ ...item, id: `copy-${Date.now()}-${Math.random()}`, deliveryDate: '', deliveryDates: [], isCompleted: false }));
      setItems(prevItems);
      setHasChanges(true);
      showToast(`${prevYr}년 ${prevMo}월 ${prevItems.length}건을 가져왔습니다.`);
    } catch (e) { showToast('가져오기 오류: ' + (e as Error).message); }
    finally { setLoading(false); }
  };

  const buildReportHtml = (forPdf = false) => {
    const title = `${yr}년 ${parseInt(mo, 10)}월 ${selectedRegion} 배송담당자 안내`;
    const c = `border:1px solid #ccc;padding:${forPdf ? '2px 3px' : '1px 4px'};text-align:center;font-size:${forPdf ? '7pt' : '7.5pt'};vertical-align:middle;`;
    const rows = items.map((item, idx) => {
      const dateStr = formatDatesKorean(item.deliveryDates || [], item.deliveryDate);
      const completion = item.isCompleted ? getCompletionDate(item.deliveryDates || [], item.deliveryDate) : '';
      const dateBg = item.isCompleted ? '#FFB300' : (idx % 2 === 0 ? '#fff' : '#f5f7fa');
      const dateClr = item.isCompleted ? '#7a2900' : '#1a3a6b';
      const rowBg = item.isCompleted ? '#fffbe6' : (idx % 2 === 0 ? '#fff' : '#f5f7fa');
      return `<tr style="height:${forPdf ? 17 : 19}px;background:${rowBg};">
        <td style="${c}">${idx + 1}</td>
        <td style="${c}font-weight:600;">${item.dong || ''}</td>
        <td style="${c}font-weight:700;">${item.driverName || ''}</td>
        <td style="${c}">${item.driverPhone || ''}</td>
        <td style="${c}color:#c05000;">${item.emergencyPhone || ''}</td>
        <td style="${c}font-weight:700;background:${dateBg};color:${dateClr};">${dateStr}</td>
        <td style="${c}font-weight:700;background:${item.isCompleted ? '#FFB300' : dateBg};color:${dateClr};">${completion}</td>
        <td style="${c}color:#555;">${item.notes || ''}</td>
      </tr>`;
    }).join('');
    const emptyCount = Math.max(0, 35 - items.length);
    const emptyRows = Array.from({ length: emptyCount }).map((_, i) => {
      const bg = (items.length + i) % 2 === 0 ? '#fff' : '#f5f7fa';
      return `<tr style="height:${forPdf ? 17 : 19}px;background:${bg};">${Array.from({ length: 8 }).map(() => `<td style="border:1px solid #ccc;">&nbsp;</td>`).join('')}</tr>`;
    }).join('');
    const tableHtml = `<table style="width:100%;border-collapse:collapse;table-layout:fixed;font-family:'맑은 고딕','Malgun Gothic',AppleGothic,sans-serif;">
      <colgroup>
        <col style="width:26px"><col style="width:72px"><col style="width:58px">
        <col style="width:88px"><col style="width:88px"><col style="width:88px">
        <col style="width:50px"><col>
      </colgroup>
      <thead>
        <tr><th colspan="8" style="background:#1a3a6b;color:#fff;font-size:11pt;font-weight:800;padding:7px 12px;text-align:left;border:2px solid #1a3a6b;">${title}</th></tr>
        <tr>${['번호','배송 동명','담당자','연락처','비상연락처','배송일정','완료일','비고'].map(h =>
          `<th style="background:#1a3a6b;color:#fff;font-weight:700;border:1px solid #2a5a9b;padding:4px 5px;text-align:center;font-size:7.5pt;white-space:nowrap;">${h}</th>`).join('')}</tr>
      </thead>
      <tbody>${rows}${emptyRows}</tbody>
    </table>`;
    return { title, tableHtml };
  };

  const handlePrint = () => {
    if (!items.length) return showToast('인쇄할 데이터가 없습니다.');
    const { title, tableHtml } = buildReportHtml(false);
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title><style>
      @page { size: A4 portrait; margin: 8mm 10mm; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: '맑은 고딕','Malgun Gothic',AppleGothic,sans-serif; font-size: 8pt; color: #111; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    </style></head><body>${tableHtml}
    <script>window.onload=function(){window.focus();window.print();}<\/script>
    </body></html>`;
    const win = window.open('', '_blank', 'width=900,height=1100');
    if (!win) return showToast('팝업이 차단되었습니다. 브라우저에서 팝업을 허용해 주세요.');
    win.document.open(); win.document.write(html); win.document.close();
  };

  const handleExportPDF = async () => {
    if (!items.length) return showToast('내보낼 데이터가 없습니다.');
    setIsSaving(true);
    try {
      const { title, tableHtml } = buildReportHtml(true);
      const container = document.createElement('div');
      container.style.cssText = 'position:absolute;left:-9999px;top:0;width:780px;background:white;padding:10px 12px;';
      container.innerHTML = tableHtml;
      document.body.appendChild(container);
      const canvas = await html2canvas(container, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
      document.body.removeChild(container);
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const imgW = pageW - margin * 2;
      const imgH = (canvas.height / canvas.width) * imgW;
      if (imgH <= pageH - margin * 2) {
        pdf.addImage(imgData, 'JPEG', margin, margin, imgW, imgH);
      } else {
        const ratio = imgW / canvas.width;
        const pageImgPx = ((pageH - margin * 2) / ratio);
        let yOffset = 0;
        while (yOffset < canvas.height) {
          const slicePx = Math.min(pageImgPx, canvas.height - yOffset);
          const sliceCanvas = document.createElement('canvas');
          sliceCanvas.width = canvas.width; sliceCanvas.height = slicePx;
          const ctx = sliceCanvas.getContext('2d')!;
          ctx.drawImage(canvas, 0, -yOffset, canvas.width, canvas.height);
          const sliceData = sliceCanvas.toDataURL('image/jpeg', 0.95);
          if (yOffset > 0) pdf.addPage();
          pdf.addImage(sliceData, 'JPEG', margin, margin, imgW, slicePx * ratio);
          yOffset += slicePx;
        }
      }
      pdf.save(`${yr}_${mo}_${selectedRegion}_배송일정.pdf`);
      showToast(`📄 ${title} PDF 저장 완료!`);
    } catch (e) { showToast('PDF 오류: ' + (e as Error).message); }
    finally { setIsSaving(false); }
  };

  const handleReport = async () => {
    if (!items.length) return showToast('보고할 데이터가 없습니다.');
    await handleExportPDF();
    handleExportExcel();
  };

  const handleExportExcel = () => {
    if (!items.length) return showToast('내보낼 데이터가 없습니다.');
    const title = `${yr}년 ${parseInt(mo, 10)}월 ${selectedRegion} 배송담당자 안내`;
    const hSt = `background:#1a3a6b;color:white;font-weight:bold;border:1px solid #888;padding:6px 10px;text-align:center;white-space:nowrap;font-size:9pt;`;
    const cSt = `border:1px solid #ccc;padding:4px 8px;font-size:9pt;vertical-align:middle;text-align:center;`;
    const rows = items.map((item, idx) => {
      const dateStr = formatDatesKorean(item.deliveryDates || [], item.deliveryDate);
      const completion = item.isCompleted ? getCompletionDate(item.deliveryDates || [], item.deliveryDate) : '';
      const hlBg = item.isCompleted ? 'background:#FFB300;' : '';
      const hlClr = item.isCompleted ? 'color:#7a2900;font-weight:bold;' : 'color:#1a3a6b;font-weight:bold;';
      return `<tr>
        <td style="${cSt}">${idx + 1}</td>
        <td style="${cSt}font-weight:600;">${item.dong || ''}</td>
        <td style="${cSt}font-weight:700;">${item.driverName || ''}</td>
        <td style="${cSt}">${item.driverPhone || ''}</td>
        <td style="${cSt}color:#c05000;">${item.emergencyPhone || ''}</td>
        <td style="${cSt}${hlBg}${hlClr}">${dateStr}</td>
        <td style="${cSt}${hlBg}${hlClr}">${completion}</td>
        <td style="${cSt}color:#555;">${item.notes || ''}</td>
      </tr>`;
    }).join('');
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><meta charset="UTF-8"></head><body>
<table border="1" style="border-collapse:collapse;font-family:'맑은 고딕','Malgun Gothic',sans-serif;">
<thead>
  <tr><th colspan="8" style="background:#1a3a6b;color:white;font-size:13pt;font-weight:800;padding:10px 14px;text-align:left;border:2px solid #1a3a6b;">${title}</th></tr>
  <tr>${['번호','배송 동명','담당자','연락처','비상연락처','배송일정','완료일','비고'].map(h => `<th style="${hSt}">${h}</th>`).join('')}</tr>
</thead>
<tbody>${rows}</tbody>
</table></body></html>`;
    const blob = new Blob(['﻿' + html], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${yr}_${mo}_${selectedRegion}_배송일정.xls`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('배송일정이 엑셀로 다운로드되었습니다.');
  };

  // ─── Driver handlers ──────────────────────────────────────────────────────
  const addDriver = async () => {
    if (!newDriver.name || !newDriver.phone) return showToast('이름과 연락처를 입력해주세요.');
    const updated = [...drivers, { id: `${Date.now()}`, ...newDriver }];
    setDriverSaving(true);
    try {
      await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'drivers', 'list'), { drivers: updated });
      setDrivers(updated);
      setNewDriver({ name: '', phone: '', emergency: '' });
      showToast('기사가 등록되었습니다.');
    } catch (e) { showToast('오류: ' + (e as Error).message); }
    finally { setDriverSaving(false); }
  };

  const deleteDriver = async (id: string) => {
    if (!confirm('기사를 삭제하시겠습니까?')) return;
    const updated = drivers.filter(d => d.id !== id);
    try {
      await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'drivers', 'list'), { drivers: updated });
      setDrivers(updated);
      showToast('기사가 삭제되었습니다.');
    } catch (e) { showToast('오류: ' + (e as Error).message); }
  };

  const updateDriver = async (id: string, field: keyof Driver, value: string) => {
    const updated = drivers.map(d => d.id === id ? { ...d, [field]: value } : d);
    setDrivers(updated);
    try {
      await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'drivers', 'list'), { drivers: updated });
    } catch (e) { showToast('오류: ' + (e as Error).message); }
  };

  const filteredDrivers = drivers.filter(d =>
    !driverSearch || (d.name || '').includes(driverSearch) || (d.phone || '').includes(driverSearch)
  );

  const parsedBulkDrivers = bulkText
    .split(/\r?\n/)
    .filter(r => r.trim())
    .map(r => {
      const cols = r.split('\t');
      return { name: (cols[0] || '').trim(), phone: (cols[1] || '').trim(), emergency: (cols[2] || '').trim() };
    })
    .filter(d => d.name && d.phone);

  const handleBulkImport = async () => {
    if (!parsedBulkDrivers.length) return;
    setDriverSaving(true);
    try {
      const existingKeys = new Set(drivers.map(d => `${d.name}|${d.phone}`));
      const toAdd = parsedBulkDrivers
        .filter(d => !existingKeys.has(`${d.name}|${d.phone}`))
        .map(d => ({ id: `${Date.now()}_${Math.random().toString(36).slice(2)}`, ...d }));
      if (!toAdd.length) { showToast('모두 이미 등록된 기사입니다.'); return; }
      const updated = [...drivers, ...toAdd];
      await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'drivers', 'list'), { drivers: updated });
      setDrivers(updated);
      setBulkText('');
      setShowBulkImport(false);
      showToast(`${toAdd.length}명 일괄 등록 완료 (중복 ${parsedBulkDrivers.length - toAdd.length}명 제외)`);
    } catch (e) { showToast('오류: ' + (e as Error).message); }
    finally { setDriverSaving(false); }
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="animate-in fade-in duration-500 space-y-4">
      {/* Screen content */}
      <div className="print:hidden space-y-4">
        {/* Header */}
        <div className="sky-hero flex flex-col md:flex-row justify-between items-start md:items-center p-6 text-white gap-4">
          <div className="relative z-10">
            <div className="text-sky-200 font-bold text-xs uppercase tracking-widest mb-1">Delivery Schedule</div>
            <div className="text-2xl font-black tracking-tight" style={{ textShadow: '0 2px 8px rgba(0,0,0,.2)' }}>배송일정 관리</div>
            <p className="text-xs text-sky-200 mt-1.5 font-medium">{formattedMonth} · {safeRender(selectedRegion)}</p>
          </div>
          <div className="flex gap-5">
            <div className="text-center">
              <div className="text-3xl font-black text-white">{items.length}</div>
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">전체</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-black text-emerald-400">{completedCount}</div>
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">완료</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-black text-amber-400">{pct}%</div>
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">진행률</div>
            </div>
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveSubTab('schedule')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg font-bold text-sm transition-all ${
              activeSubTab === 'schedule' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Calendar size={15} /> 배송일정
          </button>
          <button
            onClick={() => setActiveSubTab('drivers')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg font-bold text-sm transition-all ${
              activeSubTab === 'drivers' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Users size={15} /> 기사 관리 ({drivers.length})
          </button>
        </div>

        {/* ─── Schedule Sub-tab ────────────────────────────────────────────── */}
        {activeSubTab === 'schedule' && (
          <div className="space-y-4">
            {/* Toolbar */}
            <div className="bg-[#1a3a6b] rounded-xl p-4 flex flex-wrap items-center gap-3 text-white shadow-lg">
              <select
                value={selectedRegion}
                onChange={e => setSelectedRegion(e.target.value)}
                className="bg-[#244b8a] border-none rounded-lg px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-400 cursor-pointer"
              >
                <optgroup label="경기도">
                  {GYEONGGI_REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </optgroup>
                <optgroup label="서울특별시">
                  {SEOUL_REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </optgroup>
              </select>

              {isAdmin && (
                <>
                  <button
                    onClick={handleCopyPreviousMonth}
                    disabled={loading}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 px-3 py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-50"
                  >
                    <RotateCcw size={15} /> 전월 가져오기
                  </button>
                  <button
                    onClick={handleSort}
                    className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 px-3 py-2 rounded-lg text-sm font-bold transition-colors"
                  >
                    ↕ 행정동 정렬
                  </button>
                  {DONG_DATA[selectedRegion] && (
                    <button
                      onClick={handleGenerateDongs}
                      className="flex items-center gap-2 bg-blue-500 hover:bg-blue-400 px-3 py-2 rounded-lg text-sm font-bold transition-colors"
                    >
                      <LayoutGrid size={15} /> 행정동 자동생성
                    </button>
                  )}
                </>
              )}

              <div className="flex gap-2 ml-auto">
                <button
                  onClick={handlePrint}
                  className="flex items-center gap-2 bg-slate-600 hover:bg-slate-500 px-3 py-2 rounded-lg text-sm font-bold transition-colors"
                >
                  <Printer size={15} /> 인쇄
                </button>
                <button
                  onClick={handleExportExcel}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 px-3 py-2 rounded-lg text-sm font-bold transition-colors"
                >
                  <Download size={15} /> 엑셀
                </button>
                <button
                  onClick={handleReport}
                  disabled={isSaving}
                  className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-bold transition-colors"
                >
                  <FileDown size={15} /> 보고하기
                </button>
              </div>
            </div>

            {/* Progress bar */}
            {items.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl px-5 py-3 shadow-sm flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex justify-between text-xs font-bold text-slate-500 mb-1.5">
                    <span>배송 진행률</span>
                    <span>{completedCount}/{items.length} 완료</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2.5">
                    <div
                      className="bg-emerald-500 h-2.5 rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <span className="text-2xl font-black text-emerald-600 shrink-0">{pct}%</span>
              </div>
            )}

            {/* Unsaved changes bar */}
            {hasChanges && (
              <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
                <span className="text-xs font-bold text-amber-700">✏️ 저장되지 않은 변경사항이 있습니다.</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => loadSchedule()}
                    className="text-xs font-bold text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    취소
                  </button>
                  <button
                    onClick={() => saveSchedule()}
                    disabled={isSaving}
                    className="flex items-center gap-1.5 btn-sky text-xs px-4 py-1.5 rounded-lg disabled:opacity-50"
                  >
                    저장하기
                  </button>
                </div>
              </div>
            )}

            {/* Schedule Table */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50">
                <h4 className="font-bold text-slate-700 text-sm">
                  {yr}년 {parseInt(mo, 10)}월 {safeRender(selectedRegion)} 배송일정
                  {loading && <span className="ml-2 text-xs text-blue-500 animate-pulse">로딩 중...</span>}
                </h4>
                {isAdmin && (
                  <button
                    onClick={addRow}
                    className="flex items-center gap-1 btn-sky px-3 py-1.5 rounded-lg text-xs"
                  >
                    <Plus size={13} /> 빈 행 추가
                  </button>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#4472c4] text-white font-bold divide-x divide-white/20">
                      <th className="px-3 py-2.5 text-center w-10">No</th>
                      <th className="px-3 py-2.5 w-28">행정동</th>
                      <th className="px-3 py-2.5 w-40">배송담당기사</th>
                      <th className="px-3 py-2.5 w-32">기사연락처</th>
                      <th className="px-3 py-2.5 w-32">비상연락처</th>
                      <th className="px-3 py-2.5 w-28">배송일자</th>
                      <th className="px-3 py-2.5 text-center w-16">완료</th>
                      <th className="px-3 py-2.5">비고</th>
                      {isAdmin && <th className="px-3 py-2.5 text-center w-20">관리</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {!loading && items.length === 0 && (
                      <tr>
                        <td colSpan={isAdmin ? 9 : 8} className="py-16 text-center text-slate-400 italic">
                          지역을 선택하고 행정동 자동생성 또는 빈 행 추가를 해주세요.
                        </td>
                      </tr>
                    )}
                    {items.map((item, idx) => (
                      <tr
                        key={item.id}
                        className={`${idx % 2 === 0 ? 'bg-white' : 'bg-[#f8f9fb]'} hover:bg-blue-50/30 transition-colors divide-x divide-slate-100`}
                      >
                        <td className="px-3 py-1 text-center text-slate-400 font-mono">{idx + 1}</td>
                        <td className="px-1 py-1">
                          <input
                            value={item.dong}
                            readOnly={!isAdmin}
                            onChange={e => updateItem(item.id, 'dong', e.target.value)}
                            className={`w-full px-2 py-1.5 rounded text-xs outline-none border border-transparent transition-all ${
                              isAdmin ? 'hover:border-slate-200 focus:border-blue-300 focus:bg-white bg-transparent' : 'bg-transparent cursor-default'
                            }`}
                          />
                        </td>
                        <td className="px-1 py-1 relative">
                          <DriverAutocomplete
                            value={item.driverName}
                            rowId={item.id}
                            onSelect={handleDriverSelect}
                            drivers={drivers}
                            readOnly={!isAdmin}
                          />
                        </td>
                        <td className="px-1 py-1">
                          <input
                            value={item.driverPhone}
                            readOnly={!isAdmin}
                            onChange={e => updateItem(item.id, 'driverPhone', e.target.value)}
                            placeholder={isAdmin ? '연락처' : ''}
                            className={`w-full px-2 py-1.5 rounded text-xs outline-none border border-transparent transition-all ${
                              isAdmin ? 'hover:border-slate-200 focus:border-blue-300 focus:bg-white bg-transparent' : 'bg-transparent cursor-default'
                            }`}
                          />
                        </td>
                        <td className="px-1 py-1">
                          <input
                            value={item.emergencyPhone}
                            readOnly={!isAdmin}
                            onChange={e => updateItem(item.id, 'emergencyPhone', e.target.value)}
                            placeholder={isAdmin ? '비상연락처' : ''}
                            className={`w-full px-2 py-1.5 rounded text-xs outline-none border border-transparent transition-all text-orange-600 ${
                              isAdmin ? 'hover:border-slate-200 focus:border-orange-300 focus:bg-white bg-transparent' : 'bg-transparent cursor-default'
                            }`}
                          />
                        </td>
                        <td className="px-1 py-1">
                          <DeliveryDatePicker
                            value={item.deliveryDates || []}
                            year={yr}
                            month={mo}
                            readOnly={!isAdmin}
                            legacyDate={item.deliveryDate}
                            onChange={(dates) => updateItemDates(item.id, dates)}
                          />
                        </td>
                        <td className="px-1 py-1 text-center align-middle">
                          <button
                            onClick={() => toggleComplete(item.id)}
                            className={`w-7 h-7 rounded-full mx-auto flex items-center justify-center transition-all ${
                              item.isCompleted
                                ? 'bg-emerald-500 text-white shadow-sm'
                                : 'bg-slate-100 hover:bg-emerald-100 text-slate-300 hover:text-emerald-500 border border-slate-200'
                            }`}
                          >
                            <span className="text-sm font-bold">✓</span>
                          </button>
                        </td>
                        <td className="px-1 py-1">
                          <input
                            value={item.notes}
                            readOnly={!isAdmin}
                            onChange={e => updateItem(item.id, 'notes', e.target.value)}
                            placeholder={isAdmin ? '비고...' : ''}
                            className={`w-full px-2 py-1.5 rounded text-xs outline-none border border-transparent transition-all text-slate-500 italic ${
                              isAdmin ? 'hover:border-slate-200 focus:border-slate-300 focus:bg-white bg-transparent' : 'bg-transparent cursor-default'
                            }`}
                          />
                        </td>
                        {isAdmin && (
                          <td className="px-2 py-1 text-center">
                            <div className="flex items-center justify-center gap-0.5">
                              <button
                                onClick={() => addRowForDong(item.dong, item.no)}
                                title="같은 행정동에 기사 추가"
                                className="text-blue-300 hover:text-blue-600 p-1 transition-colors"
                              >
                                <UserPlus size={13} />
                              </button>
                              <button
                                onClick={() => deleteRow(item.id)}
                                className="text-slate-300 hover:text-red-500 p-1 transition-colors"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {isAdmin && items.length > 0 && (
                <div className="p-3 border-t border-slate-100 bg-slate-50 flex justify-center">
                  <button
                    onClick={addRow}
                    className="flex items-center gap-2 px-8 py-2 border-2 border-dashed border-slate-300 rounded-xl text-slate-400 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all font-bold text-xs"
                  >
                    <Plus size={15} /> 빈 행 추가
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── Drivers Sub-tab ──────────────────────────────────────────────── */}
        {activeSubTab === 'drivers' && (
          <div className="space-y-4">
            {isAdmin && (
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-700 text-sm">기사 등록</h4>
                  <button
                    onClick={() => { setShowBulkImport(p => !p); setBulkText(''); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border ${
                      showBulkImport
                        ? 'bg-indigo-700 text-white border-indigo-700'
                        : 'bg-white text-indigo-700 border-indigo-300 hover:bg-indigo-50'
                    }`}
                  >
                    <Download size={13} /> 엑셀 일괄등록
                  </button>
                </div>

                {!showBulkImport ? (
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <input value={newDriver.name} onChange={e => setNewDriver(p => ({ ...p, name: e.target.value }))} onKeyDown={e => e.key === 'Enter' && addDriver()} placeholder="기사 이름 *" className="border border-slate-300 rounded-lg px-3 py-2.5 text-sm font-medium outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200" />
                    <input value={newDriver.phone} onChange={e => setNewDriver(p => ({ ...p, phone: e.target.value }))} onKeyDown={e => e.key === 'Enter' && addDriver()} placeholder="기사 연락처 *" className="border border-slate-300 rounded-lg px-3 py-2.5 text-sm font-medium outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200" />
                    <input value={newDriver.emergency} onChange={e => setNewDriver(p => ({ ...p, emergency: e.target.value }))} onKeyDown={e => e.key === 'Enter' && addDriver()} placeholder="비상 연락처" className="border border-slate-300 rounded-lg px-3 py-2.5 text-sm font-medium outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-100" />
                    <button onClick={addDriver} disabled={driverSaving || !newDriver.name || !newDriver.phone} className="btn-sky px-4 py-2.5 rounded-xl text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                      <Plus size={15} /> 등록
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3 text-xs text-indigo-700 space-y-1">
                      <p className="font-bold">엑셀 붙여넣기 방법:</p>
                      <p>1. 엑셀에서 <b>이름 | 연락처 | 비상연락처</b> 3열을 선택 후 복사 (Ctrl+C)</p>
                      <p>2. 아래 텍스트 박스 클릭 후 붙여넣기 (Ctrl+V)</p>
                      <p className="text-indigo-500">※ 비상연락처 열이 없어도 됩니다. 중복 기사는 자동으로 제외됩니다.</p>
                    </div>
                    <textarea
                      value={bulkText}
                      onChange={e => setBulkText(e.target.value)}
                      placeholder="여기에 엑셀 데이터를 붙여넣으세요..."
                      rows={6}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm font-mono resize-none outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
                    />
                    {parsedBulkDrivers.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-slate-600 mb-2">{parsedBulkDrivers.length}명 인식됨:</p>
                        <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                          {parsedBulkDrivers.map((d, i) => (
                            <div key={i} className="flex gap-4 text-xs px-3 py-2">
                              <span className="font-bold text-slate-800 w-20 shrink-0">{d.name}</span>
                              <span className="text-slate-600 w-32 shrink-0">{d.phone}</span>
                              <span className="text-orange-500">{d.emergency}</span>
                            </div>
                          ))}
                        </div>
                        <button onClick={handleBulkImport} disabled={driverSaving} className="mt-3 w-full bg-indigo-700 hover:bg-indigo-800 text-white py-2.5 rounded-lg text-sm font-bold transition-colors disabled:opacity-50">
                          {driverSaving ? '등록 중...' : `${parsedBulkDrivers.length}명 일괄 등록하기`}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="glass rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-sky-100 bg-sky-50/50 gap-3">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    value={driverSearch}
                    onChange={e => setDriverSearch(e.target.value)}
                    placeholder="이름 또는 연락처 검색..."
                    className="pl-9 pr-4 py-2 border border-slate-300 rounded-full text-sm outline-none focus:ring-2 focus:ring-slate-200 w-56"
                  />
                </div>
                <span className="text-xs font-bold text-slate-500">{filteredDrivers.length}명 등록됨</span>
              </div>

              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-white font-bold text-xs" style={{ background: 'linear-gradient(135deg,#0369a1,#0ea5e9)' }}>
                    <th className="px-4 py-2.5 text-center w-10">#</th>
                    <th className="px-4 py-2.5">이름</th>
                    <th className="px-4 py-2.5">연락처</th>
                    <th className="px-4 py-2.5">비상연락처</th>
                    {isAdmin && <th className="px-4 py-2.5 text-center w-16">삭제</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredDrivers.length === 0 && (
                    <tr>
                      <td colSpan={isAdmin ? 5 : 4} className="py-12 text-center text-slate-400 italic">
                        등록된 기사가 없습니다.
                      </td>
                    </tr>
                  )}
                  {filteredDrivers.map((d, idx) => (
                    <tr key={d.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-2 text-center text-slate-400 text-xs">{idx + 1}</td>
                      <td className="px-2 py-1.5">
                        <input
                          value={d.name}
                          readOnly={!isAdmin}
                          onChange={e => updateDriver(d.id, 'name', e.target.value)}
                          className={`w-full px-2 py-1.5 rounded text-sm font-bold text-slate-800 outline-none border border-transparent ${
                            isAdmin ? 'hover:border-slate-200 focus:border-blue-400 focus:bg-blue-50' : 'bg-transparent cursor-default'
                          }`}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          value={d.phone}
                          readOnly={!isAdmin}
                          onChange={e => updateDriver(d.id, 'phone', e.target.value)}
                          className={`w-full px-2 py-1.5 rounded text-sm text-slate-700 outline-none border border-transparent ${
                            isAdmin ? 'hover:border-slate-200 focus:border-blue-400 focus:bg-blue-50' : 'bg-transparent cursor-default'
                          }`}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          value={d.emergency}
                          readOnly={!isAdmin}
                          onChange={e => updateDriver(d.id, 'emergency', e.target.value)}
                          className={`w-full px-2 py-1.5 rounded text-sm text-orange-600 outline-none border border-transparent ${
                            isAdmin ? 'hover:border-slate-200 focus:border-orange-400 focus:bg-orange-50' : 'bg-transparent cursor-default'
                          }`}
                        />
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-2 text-center">
                          <button
                            onClick={() => deleteDriver(d.id)}
                            className="text-slate-300 hover:text-red-500 transition-colors p-1"
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
