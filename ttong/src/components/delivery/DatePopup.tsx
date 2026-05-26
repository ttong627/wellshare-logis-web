/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, X, Check, Calendar as CalendarIcon, History, Plus } from 'lucide-react';
import { motion } from 'motion/react';

interface Props {
  year: number;
  month: number;
  initialValue: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export default function DatePopup({ year: initialYear, month: initialMonth, onConfirm, onCancel }: Props) {
  const [mode, setMode] = useState<'CALENDAR' | 'RANGE'>('CALENDAR');
  const [viewYear, setViewYear] = useState(initialYear);
  const [viewMonth, setViewMonth] = useState(initialMonth);
  const [selectedDates, setSelectedDates] = useState<string[]>([]); // Formatted as YYYY-MM-DD
  const [ranges, setRanges] = useState<{ start: string, end: string }[]>([]);

  useEffect(() => {
    // Attempt to parse existing selections if possible, though it's complex for "4/29~30, 5/6~7"
    // For now we start fresh for better UX, or just keep previous state if passed differently
  }, []);

  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
  const firstDay = new Date(viewYear, viewMonth - 1, 1).getDay();

  const toggleDate = (day: number) => {
    const dateStr = `${viewYear}-${String(viewMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setSelectedDates(prev => 
      prev.includes(dateStr) ? prev.filter(d => d !== dateStr) : [...prev, dateStr].sort()
    );
  };

  const changeMonth = (offset: number) => {
    let nextMonth = viewMonth + offset;
    let nextYear = viewYear;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear++;
    } else if (nextMonth < 1) {
      nextMonth = 12;
      nextYear--;
    }
    setViewMonth(nextMonth);
    setViewYear(nextYear);
  };

  const addRange = () => {
    setRanges([...ranges, { start: '', end: '' }]);
  };

  const removeRange = (idx: number) => {
    setRanges(ranges.filter((_, i) => i !== idx));
  };

  const updateRange = (idx: number, field: 'start' | 'end', val: string) => {
    const newRanges = [...ranges];
    newRanges[idx][field] = val;
    setRanges(newRanges);
  };

  const formatOutput = () => {
    if (mode === 'CALENDAR') {
      if (selectedDates.length === 0) return '';
      
      // Group by month
      const byMonth: Record<string, number[]> = {};
      selectedDates.forEach(dateStr => {
        const [y, m, d] = dateStr.split('-').map(Number);
        const key = `${y}-${m}`;
        if (!byMonth[key]) byMonth[key] = [];
        byMonth[key].push(d);
      });

      // Format each month
      return Object.entries(byMonth).map(([key, days]) => {
        const [, m] = key.split('-').map(Number);
        days.sort((a, b) => a - b);
        
        const groups: number[][] = [];
        let temp: number[] = [];
        days.forEach((d, i) => {
          if (i === 0 || d === days[i - 1] + 1) {
            temp.push(d);
          } else {
            groups.push(temp);
            temp = [d];
          }
        });
        groups.push(temp);

        return groups.map(g => {
          if (g.length === 1) return `${m}/${g[0]}`;
          return `${m}/${g[0]}~${g[g.length - 1]}`;
        }).join(', ');
      }).join(', ');
    } else {
      return ranges
        .filter(r => r.start && r.end)
        .map(r => {
          const s = new Date(r.start);
          const e = new Date(r.end);
          if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
            return `${s.getMonth() + 1}/${s.getDate()}~${e.getDate()}`;
          }
          return `${s.getMonth() + 1}/${s.getDate()}~${e.getMonth() + 1}/${e.getDate()}`;
        }).join(', ');
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
        <div className="bg-[#1a3a6b] text-white p-4 flex justify-between items-center">
          <h3 className="font-bold flex items-center gap-2 italic">
            <CalendarIcon size={18} /> 배송 일정 설정
          </h3>
          <button onClick={onCancel} className="hover:bg-white/10 p-1 rounded transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Mode Toggle */}
        <div className="flex p-2 bg-gray-100 mb-2">
          <button
            onClick={() => setMode('CALENDAR')}
            className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${mode === 'CALENDAR' ? 'bg-white shadow-sm text-[#1a3a6b]' : 'text-gray-500 hover:text-gray-700'}`}
          >
            📅 날짜 직접 선택
          </button>
          <button
            onClick={() => setMode('RANGE')}
            className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${mode === 'RANGE' ? 'bg-white shadow-sm text-[#1a3a6b]' : 'text-gray-500 hover:text-gray-700'}`}
          >
            📆 기간 범위 설정
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto min-h-[350px]">
          {mode === 'CALENDAR' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between font-bold text-lg text-gray-700 mb-2">
                <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-gray-100 rounded-full">
                  <ChevronLeft size={24} />
                </button>
                <div>{viewYear}년 {viewMonth}월</div>
                <button onClick={() => changeMonth(1)} className="p-2 hover:bg-gray-100 rounded-full">
                  <ChevronRight size={24} />
                </button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center font-bold text-xs text-gray-400 mb-2">
                <div className="text-red-500">일</div>
                {['월', '화', '수', '목', '금'].map(d => <div key={d}>{d}</div>)}
                <div className="text-blue-500">토</div>
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: firstDay }).map((_, i) => <div key={`empty-${i}`} />)}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const d = i + 1;
                  const dateStr = `${viewYear}-${String(viewMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                  const isSelected = selectedDates.includes(dateStr);
                  const isSunday = (firstDay + i) % 7 === 0;
                  const isSaturday = (firstDay + i) % 7 === 6;
                  
                  return (
                    <button
                      key={d}
                      onClick={() => toggleDate(d)}
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                        isSelected 
                          ? 'bg-blue-600 text-white shadow-md' 
                          : isSunday ? 'text-red-500 hover:bg-red-50' : isSaturday ? 'text-blue-500 hover:bg-blue-50' : 'hover:bg-blue-50 text-gray-600'
                      }`}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
              
              {selectedDates.length > 0 && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                  <div className="text-xs font-bold text-blue-600 mb-1 flex items-center gap-1">
                    <History size={12} /> 선택된 날짜 (미리보기)
                  </div>
                  <div className="text-sm text-blue-800 break-all">{formatOutput()}</div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {ranges.map((range, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-gray-50 p-3 rounded-xl border border-gray-100">
                  <input
                    type="date"
                    value={range.start}
                    onChange={e => updateRange(idx, 'start', e.target.value)}
                    className="flex-1 bg-white border p-1 rounded text-xs outline-none"
                  />
                  <span className="text-gray-400">~</span>
                  <input
                    type="date"
                    value={range.end}
                    onChange={e => updateRange(idx, 'end', e.target.value)}
                    className="flex-1 bg-white border p-1 rounded text-xs outline-none"
                  />
                  <button onClick={() => removeRange(idx)} className="text-red-400 hover:text-red-600 p-1">
                    <X size={16} />
                  </button>
                </div>
              ))}
              <button
                onClick={addRange}
                className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 hover:text-blue-500 hover:border-blue-200 text-sm font-bold flex items-center justify-center gap-2 transition-all"
              >
                <Plus size={16} /> 범위 추가
              </button>
            </div>
          )}
        </div>

        <div className="p-4 border-t bg-gray-50 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 text-gray-500 font-bold hover:bg-gray-100 rounded-xl transition-colors"
          >
            ✕ 취소
          </button>
          <button
            onClick={() => onConfirm(formatOutput())}
            className="flex-1 py-3 bg-[#1a3a6b] text-white font-bold rounded-xl shadow-lg hover:bg-[#244b8a] transition-all flex items-center justify-center gap-2"
          >
            <Check size={18} /> 확인
          </button>
        </div>
      </div>
    </motion.div>
  );
}
