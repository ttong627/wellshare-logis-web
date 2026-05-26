/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Trash2, LayoutGrid, FileSpreadsheet, RotateCcw, UserPlus, Printer, Download, FileDown, Loader2, RefreshCw } from 'lucide-react';
import { ScheduleData, ScheduleItem, Driver, EmergencyContact } from '../../types';
import { SIDO_LIST, DONG_DATA } from '../../constants';
import DatePopup from './DatePopup';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { toJpeg } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { firebaseService } from '../../lib/firebaseService';
import { useFirebase } from '../../hooks/useFirebase';
import { useRole } from '../../hooks/useRole';
import debounce from 'lodash.debounce';

// Helper for unique IDs outside component to satisfy purity rules
const generateScheduleId = (prefix: string) => `${prefix}-${Math.random().toString(36).substring(2, 9)}`;

// --- Helper for Regional Emergency Fetch ---
const getRegionalEmergencyPhone = (contacts: Record<string, EmergencyContact>, sido: string, sigungu: string) => {
  if (!sido || !sigungu) return '';
  const id = `${sido}_${sigungu}`.replace(/\s/g, '_');
  return contacts[id]?.phone || '';
};

// --- Advanced Search Helpers ---

const CHOSUNG = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];

const getChosung = (char: string) => {
  const code = char.charCodeAt(0) - 0xAC00;
  if (code < 0 || code > 11171) return char;
  return CHOSUNG[Math.floor(code / 588)];
};

const matchChosung = (name: string, query: string) => {
  const nameChosung = name.split('').map(getChosung).join('');
  return nameChosung.includes(query);
};

interface SearchDriverResult extends Driver {
  score: number;
  matchType: 'exact' | 'startsWith' | 'includes' | 'phone' | 'chosung';
}

const searchDrivers = (query: string, drivers: Driver[]): SearchDriverResult[] => {
  if (!query || query.trim() === '') return [];

  const q = query.trim().toLowerCase();
  const queryPhone = q.replace(/[-]/g, '');

  const results = drivers
    .map(driver => {
      const name = (driver.name || '').toLowerCase();
      const phone = (driver.phone || '').replace(/[-]/g, '');

      let score = 0;
      let matchType: SearchDriverResult['matchType'] | null = null;

      // 1순위: 이름 완전 일치
      if (name === q) {
        score = 100;
        matchType = 'exact';
      }
      // 2순위: 이름 시작 일치
      else if (name.startsWith(q)) {
        score = 80;
        matchType = 'startsWith';
      }
      // 3순위: 이름 포함
      else if (name.includes(q)) {
        score = 60;
        matchType = 'includes';
      }
      // 4순위: 전화번호 포함 (4자리 이상일 때)
      else if (queryPhone.length >= 4 && phone.includes(queryPhone)) {
        score = 40;
        matchType = 'phone';
      }
      // 5순위: 초성 검색
      else if (q.length >= 1 && matchChosung(name, q)) {
        score = 30;
        matchType = 'chosung';
      }

      return (score > 0 && matchType) ? { ...driver, score, matchType } as SearchDriverResult : null;
    })
    .filter((d): d is SearchDriverResult => d !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  return results;
};

// --- DriverAutocomplete Component ---

interface DriverAutocompleteProps {
  value: string;
  rowId: string;
  onSelect: (result: { rowId: string; name: string; phone: string; emergency: string }) => void;
  defaultEmergency: string;
  canEdit: boolean;
  drivers: Driver[];
}

const DriverAutocomplete = ({
  value,
  rowId,
  onSelect,
  defaultEmergency,
  canEdit,
  drivers,
}: DriverAutocompleteProps) => {
  const [inputValue, setInputValue] = useState(value || '');
  const [prevValue, setPrevValue] = useState(value || '');
  const [suggestions, setSuggestions] = useState<SearchDriverResult[]>([]);

  // Adjust state when prop changes (Modern React pattern)
  if (value !== prevValue) {
    setInputValue(value || '');
    setPrevValue(value);
  }

  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    setActiveIndex(-1);

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    
    if (val.trim().length === 0) {
      setSuggestions([]);
      setIsOpen(false);
      onSelect({ rowId, name: '', phone: '', emergency: '' }); // Clear parent state if empty
      return;
    }

    setIsLoading(true);
    debounceTimer.current = setTimeout(() => {
      const results = searchDrivers(val, drivers);
      setSuggestions(results);
      setIsOpen(results.length > 0);
      setIsLoading(false);
    }, 150);
  };

  const handleSelect = (driver: Driver) => {
    setInputValue(driver.name);
    setIsOpen(false);
    setSuggestions([]);
    setActiveIndex(-1);
    onSelect({
      rowId,
      name: driver.name,
      phone: driver.phone || '',
      emergency: driver.emergency || defaultEmergency || '',
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex(i => Math.min(i + 1, suggestions.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (activeIndex >= 0) handleSelect(suggestions[activeIndex]);
        break;
      case 'Escape':
        setIsOpen(false);
        setActiveIndex(-1);
        break;
      case 'Tab':
        if (suggestions.length > 0) {
          e.preventDefault();
          handleSelect(suggestions[0]);
        }
        break;
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const highlightMatch = (text: string, query: string) => {
    if (!query) return text;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-[#fff3b0] text-[#1a3a6b] font-bold rounded px-[1px]">
          {text.slice(idx, idx + query.length)}
        </mark>
        {text.slice(idx + query.length)}
      </>
    );
  };

  return (
    <div className="relative w-full">
      <input
        ref={inputRef}
        value={inputValue}
        readOnly={!canEdit}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (suggestions.length > 0) setIsOpen(true);
        }}
        placeholder="기사명 또는 연락처"
        role="combobox"
        aria-expanded={isOpen}
        aria-autocomplete="list"
        aria-controls={`driver-listbox-${rowId}`}
        aria-activedescendant={activeIndex >= 0 ? `driver-option-${rowId}-${activeIndex}` : undefined}
        className={`w-full px-2 py-1.5 border-[1.5px] rounded-md text-[13px] outline-none transition-all placeholder:text-gray-300 font-bold ${
          isOpen ? 'border-[#1a3a6b] ring-2 ring-[#1a3a6b]/10' : 'border-[#d0d7e3]'
        } ${!canEdit ? 'bg-gray-50' : 'bg-white'}`}
      />

      {isLoading && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-blue-400 font-bold flex items-center gap-1">
          <Loader2 size={10} className="animate-spin" />
        </div>
      )}

      {isOpen && suggestions.length > 0 && (
        <div
          ref={dropdownRef}
          role="listbox"
          id={`driver-listbox-${rowId}`}
          className="absolute top-full left-0 right-0 z-[9999] bg-white border-[1.5px] border-[#d0d7e3] border-t-0 rounded-b-lg shadow-2xl overflow-hidden max-h-[300px] overflow-y-auto mt-[1px]"
        >
          <div className="px-3 py-1.5 bg-[#f8fafc] text-[10px] font-bold text-[#8a9ab8] border-b flex justify-between">
            <span>기사 {suggestions.length}명 검색됨</span>
            <span>↑↓ 이동 · Enter 선택</span>
          </div>

          {suggestions.map((driver, idx) => (
            <div
              key={driver.id}
              role="option"
              id={`driver-option-${rowId}-${idx}`}
              aria-selected={activeIndex === idx}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(driver);
              }}
              onMouseEnter={() => setActiveIndex(idx)}
              className={`px-3 py-2 cursor-pointer border-b border-[#f5f7fb] flex items-center justify-between transition-colors ${
                activeIndex === idx ? 'bg-[#eef2ff]' : 'bg-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 transition-colors ${
                  activeIndex === idx ? 'bg-[#1a3a6b] text-white' : 'bg-[#e8edf8] text-[#1a3a6b]'
                }`}>
                  {driver.name?.charAt(0)}
                </div>
                <div>
                  <div className="text-[13px] font-bold text-[#1a2a44]">
                    {highlightMatch(driver.name || '', inputValue)}
                  </div>
                  <div className="text-[10px] text-[#6b7fa0] flex items-center gap-2 mt-0.5">
                    <span>📞 {driver.phone || 'N/A'}</span>
                    {driver.emergency && <span className="opacity-60 text-red-400">🚨 {driver.emergency}</span>}
                  </div>
                </div>
              </div>

              <div className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase ${
                driver.matchType === 'exact' ? 'bg-green-100 text-green-700' :
                driver.matchType === 'startsWith' ? 'bg-blue-100 text-blue-700' :
                driver.matchType === 'phone' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
              }`}>
                {driver.matchType === 'exact' ? '일치' :
                 driver.matchType === 'startsWith' ? '이름' :
                 driver.matchType === 'phone' ? '번호' : 
                 driver.matchType === 'chosung' ? '초성' : '포함'}
              </div>
            </div>
          ))}
          <div className="px-3 py-2 text-[10px] text-[#aab4c8] text-center bg-[#fafbfc] border-t font-medium">
            찾는 기사가 없으면 기사 관리에서 등록하세요
          </div>
        </div>
      )}
    </div>
  );
};

export default function DeliverySchedule() {
  const { user } = useFirebase();
  const { canEdit } = useRole();
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const [sido, setSido] = useState('');
  const [sigungu, setSigungu] = useState('');
  
  const [data, setData] = useState<ScheduleData>({
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    sido: '',
    sigungu: '',
    items: []
  });

  const [isLoadingSchedule, setIsLoadingSchedule] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [savedMonths, setSavedMonths] = useState<number[]>([]);

  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [emergencyContacts, setEmergencyContacts] = useState<Record<string, EmergencyContact>>({});
  const [editingDateId, setEditingDateId] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>('asc');

  const lastSavedDataRef = useRef<string>('');
  const lastLocalEditTime = useRef<number>(0);
  const hasCloudSyncedRef = useRef<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<number>(0);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error' | 'pending'>('idle');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' | 'warning' } | null>(null);

  const driversCache = useRef<Driver[]>([]);
  const driversCacheTime = useRef<number | null>(null);

  const saveDebouncedRef = useRef<ReturnType<typeof debounce> | null>(null);

  const showToast = (message: string, type: 'success' | 'info' | 'error' | 'warning' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSettingChange = async (type: 'year' | 'month' | 'sido' | 'sigungu', newValue: string | number) => {
    if (hasUnsavedChanges && data.items.length > 0) {
      const confirmed = window.confirm(
        `저장하지 않은 변경사항이 있습니다.\n` +
        `다른 월/지역으로 이동하면 변경사항이 사라집니다.\n\n` +
        `계속하시겠습니까?`
      );
      if (!confirmed) return;
    }

    setHasUnsavedChanges(false);
    setIsLoadingSchedule(true);
    
    switch (type) {
      case 'year': setYear(Number(newValue)); break;
      case 'month': setMonth(Number(newValue)); break;
      case 'sido': {
        const sValue = String(newValue);
        setSido(sValue);
        setSigungu('');
        setData({ ...data, sido: sValue, sigungu: '', items: [] });
        break;
      }
      case 'sigungu': 
        handleSigunguChange(String(newValue));
        break;
    }
  };

  const forceSyncFromCloud = useCallback(async () => {
    if (!user) return;
    try {
      setSaveStatus('saving');
      const cloudData = await firebaseService.getSchedule(year, month, sido, sigungu);
      if (cloudData) {
        setData(cloudData);
        lastSavedDataRef.current = JSON.stringify(cloudData);
        setLastSyncTime(Date.now());
        setSaveStatus('idle');
        hasCloudSyncedRef.current = true;
      } else {
        setData({ year, month, sido, sigungu, items: [] });
        setSaveStatus('idle');
      }
    } catch (err) {
      console.error('Manual sync failed:', err);
      setSaveStatus('error');
    }
  }, [user, year, month, sido, sigungu]);

  // 1. Initialize Auto-save Debouncer
  useEffect(() => {
    if (!user) return;
    saveDebouncedRef.current = debounce(async (y: number, m: number, si: string, sg: string, d: ScheduleData, currentStr: string) => {
      try {
        setSaveStatus('saving');
        await firebaseService.saveSchedule(y, m, si, sg, d);
        lastSavedDataRef.current = currentStr;
        setSaveStatus('saved');
        setHasUnsavedChanges(false);
        setLastSyncTime(Date.now());
      } catch (err: unknown) {
        console.error('Schedule auto-save failed:', err);
        setSaveStatus('error');
        lastSavedDataRef.current = '';
      }
    }, 1500);
    
    return () => {
      saveDebouncedRef.current?.cancel();
    };
  }, [user]);

  // 2. Global Settings & Drivers Sync
  useEffect(() => {
    const unsubSettings = firebaseService.subscribeToGlobalSettings((settings) => {
      if (settings?.defaultSido && !sido) setSido(settings.defaultSido as string);
      if (settings?.defaultSigungu && !sigungu) setSigungu(settings.defaultSigungu as string);
    });

    const unsubDrivers = firebaseService.subscribeToDrivers((driversData) => {
      setDrivers(driversData);
      driversCache.current = driversData;
      driversCacheTime.current = Date.now();
    });

    const unsubContacts = firebaseService.subscribeToEmergencyContacts((contacts) => {
      setEmergencyContacts(contacts);
    });

    return () => {
      unsubSettings();
      unsubDrivers();
      unsubContacts();
    };
  }, [sido, sigungu]);

  // 3. Auto-save Trigger
  useEffect(() => {
    if (user && hasCloudSyncedRef.current && data) {
      if (data.year !== year || data.month !== month || data.sido !== sido || data.sigungu !== sigungu) {
        return;
      }
      if (data.items.length === 0 && !lastSavedDataRef.current) {
        return;
      }
      const dataStr = JSON.stringify(data);
      if (dataStr !== lastSavedDataRef.current) {
        setSaveStatus('pending');
        saveDebouncedRef.current?.(year, month, sido, sigungu, data, dataStr);
      }
    }
  }, [data, user, year, month, sido, sigungu]);

  // 4. Schedule Sync Effect
  useEffect(() => {
    if (!user || !year || !month || !sido || !sigungu) {
      setTimeout(() => {
        setSaveStatus('idle');
        setIsLoadingSchedule(false);
      }, 0);
      return;
    }
    
    setTimeout(() => {
      setSaveStatus('pending');
    }, 0);
    hasCloudSyncedRef.current = false;

    // Load saved months for the checkmark indicator
    firebaseService.getSavedMonths(year, sido, sigungu).then(months => {
      setSavedMonths(months);
    });
    
    const syncTimeout = setTimeout(() => {
      if (!hasCloudSyncedRef.current) {
        hasCloudSyncedRef.current = true;
        setSaveStatus('idle');
        setIsLoadingSchedule(false);
      }
    }, 5000);

    const unsubscribe = firebaseService.subscribeToSchedule(year, month, sido, sigungu, (cloudData) => {
      hasCloudSyncedRef.current = true;
      setIsLoadingSchedule(false);
      clearTimeout(syncTimeout);
      
      if (!cloudData) {
        setData({ year, month, sido, sigungu, items: [] });
        lastSavedDataRef.current = '';
        setSaveStatus('idle');
        setHasUnsavedChanges(false);
        showToast(`📋 ${year}년 ${month}월 ${sigungu} 저장된 일정이 없습니다.`, 'info');
        return;
      }

      if (Date.now() - lastLocalEditTime.current < 3000) return;

      setData(prev => {
        const cloudTime = cloudData.lastUpdated ? new Date(cloudData.lastUpdated).getTime() : 0;
        const localTime = prev.lastUpdated ? new Date(prev.lastUpdated).getTime() : 0;

        if (cloudTime > localTime || prev.items.length === 0 || prev.year !== year || prev.month !== month || prev.sigungu !== sigungu) {
          const sortedItems = [...(cloudData.items || [])].sort((a, b) => {
            const dongA = a.dong || '';
            const dongB = b.dong || '';
            if (dongA === dongB) return (a.no || 0) - (b.no || 0);
            return dongA.localeCompare(dongB, 'ko');
          });
          const processed = { ...cloudData, items: sortedItems };
          lastSavedDataRef.current = JSON.stringify(processed);
          setLastSyncTime(Date.now());
          setHasUnsavedChanges(false);
          showToast(`📂 ${year}년 ${month}월 ${sigungu} 일정을 불러왔습니다. (${cloudData.items?.length || 0}개 행)`, 'success');
          return processed;
        }
        return prev;
      });
      setSaveStatus('saved');
    });

    return () => {
      unsubscribe();
      clearTimeout(syncTimeout);
    };
  }, [user, year, month, sido, sigungu]);

  const save = (updated: ScheduleData) => {
    if (!canEdit) return;
    setHasUnsavedChanges(true);
    const now = new Date().getTime();
    lastLocalEditTime.current = now;
    const dataWithTime = { ...updated, lastUpdated: new Date().toISOString() };
    setData(dataWithTime);
  };

  const getEmergencyNumber = (): string => {
    return getRegionalEmergencyPhone(emergencyContacts, sido, sigungu);
  };

  const handleCopyPreviousMonth = async () => {
    if (!canEdit) return alert('편집 권한이 없습니다.');
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    
    setSaveStatus('pending');
    try {
      const previousData = await firebaseService.getSchedule(prevYear, prevMonth, sido, sigungu);
      
      if (previousData && previousData.items.length > 0) {
        if (window.confirm(`${prevYear}년 ${prevMonth}월 데이터를 현재 화면으로 가져오시겠습니까?\n(배송일과 완료여부는 초기화됩니다)`)) {
          // Sort alphabetically when copying
          const sortedPreviousItems = [...previousData.items].sort((a: ScheduleItem, b: ScheduleItem) => 
            (a.dong || '').localeCompare(b.dong || '', 'ko')
          );
          const copiedItems: ScheduleItem[] = sortedPreviousItems.map((item: ScheduleItem) => ({
            ...item,
            id: `copy-${Date.now()}-${item.id}`,
            deliveryDate: '',
            isCompleted: false
          }));
          save({ ...data, items: copiedItems });
          setSortDirection('asc');
        }
      } else {
        alert('가져올 이전 달 데이터가 서버에 존재하지 않습니다.');
      }
    } catch (err) {
      console.error('Failed to fetch previous month from cloud:', err);
      alert('데이터를 가져오는 중 오류가 발생했습니다.');
    } finally {
      setSaveStatus('idle');
    }
  };

  const handleToggleSort = () => {
    if (!data.items.length) return;
    
    const newDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    setSortDirection(newDirection);

    const sorted = [...data.items].sort((a, b) => {
      if (!a.dong) return 1;
      if (!b.dong) return -1;
      
      const comparison = a.dong.localeCompare(b.dong, 'ko');
      return newDirection === 'asc' ? comparison : -comparison;
    });
    save({ ...data, items: sorted });
  };

  const handleGenerateDongs = () => {
    if (!canEdit) return alert('편집 권한이 없습니다.');
    if (!sido || !sigungu) return;
    if (data.items.length > 0 && !window.confirm('기존 데이터를 초기화하고 행정동을 새로 생성하시겠습니까?')) return;

    // Sort alphabetically by default
    const dongs = [...(DONG_DATA[sido] ? (DONG_DATA[sido][sigungu] || []) : [])].sort((a, b) => a.localeCompare(b, 'ko'));
    const emergencyNum = getRegionalEmergencyPhone(emergencyContacts, sido, sigungu);

    const newItems: ScheduleItem[] = dongs.map((dong, idx) => ({
      id: `init-${idx}-${Date.now()}`,
      no: idx + 1,
      dong,
      driverName: '',
      driverPhone: '',
      emergencyPhone: emergencyNum,
      deliveryDate: '',
      isCompleted: false,
      notes: ''
    }));

    save({ ...data, items: newItems });
    setSortDirection('asc');
    
    if (emergencyNum) {
       showToast(`${sigungu} 비상연락처(${emergencyNum})가 자동 적용되었습니다.`, 'success');
    } else {
       showToast(`${sigungu}의 등록된 비상연락처가 없습니다. 설정 탭에서 등록해주세요.`, 'warning');
    }
  };

  const handleUpdateItem = (id: string, field: keyof ScheduleItem, value: string | number | boolean | null) => {
    if (!canEdit) return;
    const updatedItems = data.items.map(item => item.id === id ? { ...item, [field]: value } : item);
    
    // If the dong name changes, we should ideally re-sort to keep "strictly this order"
    if (field === 'dong') {
      updatedItems.sort((a, b) => {
        const dongA = a.dong || '';
        const dongB = b.dong || '';
        if (dongA === dongB) return (a.no || 0) - (b.no || 0);
        return dongA.localeCompare(dongB, 'ko');
      });
      setSortDirection('asc');
    }
    
    save({ ...data, items: updatedItems });
  };

  const addDriverRow = (dong: string, no: number) => {
    if (!canEdit) return alert('편집 권한이 없습니다.');
    const id = generateScheduleId('add');
    const newItem: ScheduleItem = {
      id,
      no: no + 0.1, // Offset slightly to stay after the original row for same dong
      dong,
      driverName: '',
      driverPhone: '',
      emergencyPhone: getEmergencyNumber(),
      deliveryDate: '',
      isCompleted: false,
      notes: ''
    };
    
    const nextItems = [...data.items, newItem].sort((a, b) => {
      const dongA = a.dong || '';
      const dongB = b.dong || '';
      if (dongA === dongB) return (a.no || 0) - (b.no || 0);
      return dongA.localeCompare(dongB, 'ko');
    });

    save({ ...data, items: nextItems });
    setSortDirection('asc');
  };

  const deleteRow = (id: string) => {
    if (!canEdit) return alert('편집 권한이 없습니다.');
    if (!window.confirm('이 항목을 삭제하시겠습니까?')) return;
    save({ ...data, items: data.items.filter(i => i.id !== id) });
  };

  const handleSigunguChange = (newSigungu: string) => {
    setSigungu(newSigungu);

    // 해당 지역 비상연락처 자동 조회
    const emergencyPhone = getRegionalEmergencyPhone(emergencyContacts, sido, newSigungu);

    // 현재 테이블의 모든 행 비상연락처 업데이트
    if (emergencyPhone && data.items.length > 0) {
      if (window.confirm(`${newSigungu} 비상연락처(${emergencyPhone})를 기존 모든 행에 일괄 적용하시겠습니까?`)) {
        const updatedItems = data.items.map(row => ({
          ...row,
          emergencyPhone: emergencyPhone,
        }));
        save({ ...data, sigungu: newSigungu, items: updatedItems });
        showToast(`${newSigungu} 비상연락처(${emergencyPhone})가 자동 적용됐습니다.`, 'success');
      } else {
        save({ ...data, sigungu: newSigungu });
      }
    } else {
      save({ ...data, sigungu: newSigungu });
      if (newSigungu && !emergencyPhone) {
        showToast(`${newSigungu} 비상연락처가 등록되지 않았습니다. 설정 탭에서 등록해주세요.`, 'warning');
      }
    }
  };

  const addEmptyRow = () => {
    if (!canEdit) return alert('편집 권한이 없습니다.');
    const id = generateScheduleId('empty');
     const newItem: ScheduleItem = {
      id,
      no: data.items.length + 1,
      dong: '',
      driverName: '',
      driverPhone: '',
      emergencyPhone: getEmergencyNumber(),
      deliveryDate: '',
      isCompleted: false,
      notes: ''
    };
    save({ ...data, items: [...data.items, newItem] });
  };

  const handleDriverSelect = ({ rowId, name, phone, emergency }: { rowId: string; name: string; phone: string; emergency: string }) => {
    if (!canEdit) return;
    const regionalEmergency = getRegionalEmergencyPhone(emergencyContacts, sido, sigungu);
    const updatedItems = data.items.map(row =>
      row.id === rowId
        ? {
            ...row,
            driverName: name,
            driverPhone: phone,
            emergencyPhone: emergency || regionalEmergency || '',
          }
        : row
    );
    save({ ...data, items: updatedItems });
  };

  const exportToExcel = async () => {
    if (!data.items.length) {
      alert('내보낼 데이터가 없습니다.');
      return;
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('배송일정');

    const titleStr = `${data.year}년 ${data.month}월 ${data.sido} ${data.sigungu} 배송일정안내`;
    
    // Add Title
    sheet.mergeCells('A1:H1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = titleStr;
    titleCell.font = { size: 16, bold: true };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    sheet.getRow(1).height = 40;

    // Header Setup
    const headers = ['순번', '행정동', '배송담당기사', '기사연락처', '비상연락처', '배송일', '배송완료', '비고'];
    sheet.getRow(3).values = headers;
    sheet.getRow(3).height = 25;
    
    // Style Header - Matches Screen Design (Blue #4472c4)
    sheet.getRow(3).eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' }
      };
      cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
        left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
        bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
        right: { style: 'thin', color: { argb: 'FFD9D9D9' } }
      };
    });

    // Add Data Rows
    data.items.forEach((item, idx) => {
      const row = sheet.addRow([
        idx + 1,
        item.dong,
        item.driverName,
        item.driverPhone,
        item.emergencyPhone,
        item.deliveryDate,
        item.isCompleted ? 'O' : '',
        item.notes
      ]);
      row.height = 22;

      // Zebra Styling - Matches Screen Design (#f2f2f2 for odd indices in data)
      const isZebra = idx % 2 !== 0;
      row.eachCell((cell, colNumber) => {
        if (isZebra) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF2F2F2' }
          };
        }
        cell.alignment = { 
          vertical: 'middle', 
          horizontal: colNumber === 8 ? 'left' : 'center',
          wrapText: true 
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
          left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
          bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
          right: { style: 'thin', color: { argb: 'FFD9D9D9' } }
        };
        
        // Custom font for driver name and phone
        if (colNumber === 3 || colNumber === 4) {
          cell.font = { bold: true };
        }
        // Custom color for delivery date
        if (colNumber === 6 && item.deliveryDate) {
          cell.font = { color: { argb: 'FF1D4ED8' }, bold: true };
        }
      });
    });

    // Set Column Widths
    sheet.columns = [
      { width: 8 },  // 순번
      { width: 18 }, // 행정동
      { width: 22 }, // 배송담당기사
      { width: 22 }, // 기사연락처
      { width: 22 }, // 비상연락처
      { width: 35 }, // 배송일
      { width: 12 }, // 배송완료
      { width: 40 }  // 비고
    ];

    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `${data.year}_${data.month.toString().padStart(2, '0')}_${data.sigungu || '지자체'}_배송일정_1.xlsx`;
    saveAs(new Blob([buffer]), fileName);
  };

  const [saveProgress, setSaveProgress] = useState('');

  const handlePrint = () => {
    // 1. Prepare for printing
    const table = document.querySelector('.delivery-print-container') as HTMLElement;
    if (!table) {
      window.print();
      return;
    }

    const originalStyles = {
      height: table.style.height,
      minHeight: table.style.minHeight,
      position: table.style.position,
      overflow: table.style.overflow
    };

    // Force visible and fit content
    table.style.height = 'auto';
    table.style.minHeight = 'auto';
    table.style.position = 'relative';
    table.style.overflow = 'visible';

    // 2. Trigger print
    setTimeout(() => {
      window.print();
      
      // 3. Restore
      table.style.height = originalStyles.height;
      table.style.minHeight = originalStyles.minHeight;
      table.style.position = originalStyles.position;
      table.style.overflow = originalStyles.overflow;
    }, 100);
  };

  const handleDownloadPDF = async () => {
    const element = document.querySelector('.delivery-print-container') as HTMLElement;
    
    if (!element) {
      showToast('PDF 생성 대상을 찾을 수 없습니다.', 'error');
      return;
    }

    const filename = `${data.year}_${data.month.toString().padStart(2, '0')}_${data.sigungu || '지자체'}_배송일정.pdf`;
    
    setIsGeneratingPDF(true);
    setSaveProgress('초기화 중...');

    const containerId = 'pdf-schedule-container';
    let container = document.getElementById(containerId);
    if (!container) {
      container = document.createElement('div');
      container.id = containerId;
      container.style.position = 'fixed';
      container.style.top = '-10000px';
      container.style.left = '-10000px';
      container.style.width = '210mm';
      container.style.zIndex = '-9999';
      document.body.appendChild(container);
    }
    
    try {
      setSaveProgress('데이터 구성 중...');
      
      // Clone for isolated rendering
      const clone = element.cloneNode(true) as HTMLElement;
      container.innerHTML = '';
      container.appendChild(clone);

      // Force proper styling on clone for A4
      clone.style.width = '210mm';
      clone.style.height = 'auto';
      clone.style.minHeight = '297mm';
      clone.style.margin = '0';
      clone.style.padding = '10mm';
      clone.style.boxSizing = 'border-box';
      clone.style.backgroundColor = '#ffffff';
      clone.style.display = 'block';
      clone.style.visibility = 'visible';
      clone.style.position = 'static';

      setSaveProgress('글꼴 대기 중...');
      await document.fonts.ready;
      await new Promise(resolve => setTimeout(resolve, 200));

      setSaveProgress('이미지 캡처 중...');
      const dataUrl = await toJpeg(clone, {
        quality: 0.95,
        pixelRatio: 2.0, 
        backgroundColor: '#ffffff',
        cacheBust: true,
      });

      setSaveProgress('PDF 변환 중...');

      // 3. Create PDF
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true
      });

      const imgProps = pdf.getImageProperties(dataUrl);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

      const pageHeight = pdf.internal.pageSize.getHeight();
      let heightLeft = pdfHeight;
      let position = 0;

      pdf.addImage(dataUrl, 'JPEG', 0, position, pdfWidth, pdfHeight, undefined, 'FAST');
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = heightLeft - pdfHeight;
        pdf.addPage();
        pdf.addImage(dataUrl, 'JPEG', 0, position, pdfWidth, pdfHeight, undefined, 'FAST');
        heightLeft -= pageHeight;
      }

      setSaveProgress('저장 중...');
      pdf.save(filename);

      showToast('PDF 파일이 저장되었습니다.', 'success');
    } catch (err) {
      console.error('PDF Error:', err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      showToast(`PDF 생성 중 오류가 발생했습니다: ${errorMsg}`, 'error');
    } finally {
      if (container) container.innerHTML = '';
      setIsGeneratingPDF(false);
      setSaveProgress('');
    }
  };

  const yearRange = Array.from({ length: 11 }, (_, i) => new Date().getFullYear() - 5 + i);

  return (
    <div className="space-y-6 relative">
      {/* Loading Overlay */}
      {isGeneratingPDF && (
        <div className="fixed inset-0 bg-black/50 z-[9999] flex flex-col items-center justify-center text-white backdrop-blur-sm">
          <Loader2 size={48} className="animate-spin mb-4" />
          <p className="text-xl font-bold">{saveProgress || 'PDF 파일 생성 중...'}</p>
          <p className="text-sm opacity-70">잠시만 기다려 주세요.</p>
        </div>
      )}
      
      {/* Top Filter Bar */}
      <div className="bg-[#1a3a6b] p-4 rounded-2xl shadow-xl flex flex-wrap items-center gap-4 text-white no-print relative">
        <div className="absolute -top-3 left-6 flex gap-2 z-10">
          {!user && (
            <div className="px-3 py-1 rounded-full bg-amber-900 border border-amber-600/50 text-[10px] flex items-center gap-2 shadow-lg text-amber-100">
              로그인 시 다른 컴퓨터와 자동 동기화됩니다
            </div>
          )}
          {user && (
            <div className="px-3 py-1 rounded-full bg-[#0d2142] border border-[#244b8a] text-[10px] flex items-center gap-2 shadow-lg">
              {saveStatus === 'pending' && (
                <>
                  <Loader2 size={12} className="animate-spin text-blue-400" />
                  <span className="text-blue-300">서버 확인 중...</span>
                </>
              )}
              {saveStatus === 'saving' && (
                <>
                  <Loader2 size={12} className="animate-spin text-blue-400" />
                  <span className="text-blue-300">서버 저장 중...</span>
                </>
              )}
              {saveStatus === 'saved' && (
                <>
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-green-400 opacity-70">
                    서버 저장됨 {lastSyncTime > 0 && `(${new Date(lastSyncTime).toLocaleTimeString()})`}
                  </span>
                </>
              )}
              {saveStatus === 'error' && (
                <>
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-red-400 font-bold">저장 실패</span>
                </>
              )}
              {saveStatus === 'idle' && (
                <div className="flex items-center gap-1.5 text-gray-400">
                  <div className="w-2 h-2 rounded-full bg-gray-500" />
                  <span>대기 중</span>
                </div>
              )}
            </div>
          )}
          
          {user && (
            <button 
              onClick={forceSyncFromCloud}
              className="px-3 py-1 rounded-full bg-blue-900/60 border border-blue-600/50 text-[10px] flex items-center gap-1.5 shadow-lg hover:bg-blue-800 transition-colors"
              title="서버에서 최신 데이터를 강제로 읽어옵니다"
            >
              <RefreshCw size={12} />
              <span className="text-blue-100 uppercase tracking-wider font-bold">데이터 새로고침</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-bold opacity-70">연도</label>
          <select 
            value={year}
            onChange={e => handleSettingChange('year', Number(e.target.value))}
            className="bg-[#244b8a] border-none rounded px-3 py-2 outline-none focus:ring-2 focus:ring-blue-400"
          >
            {yearRange.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold opacity-70">월</label>
          <select 
            value={month}
            onChange={e => handleSettingChange('month', Number(e.target.value))}
            className="bg-[#244b8a] border-none rounded px-3 py-2 outline-none focus:ring-2 focus:ring-blue-400"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
              <option key={m} value={m}>
                {m}월 {savedMonths.includes(m) ? '✅' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold opacity-70">지역</label>
          <select 
            value={sido}
            onChange={e => handleSettingChange('sido', e.target.value)}
            className="bg-[#244b8a] border-none rounded px-3 py-2 outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option value="">시/도 선택</option>
            {SIDO_LIST.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select 
            value={sigungu}
            onChange={e => handleSettingChange('sigungu', e.target.value)}
            className="bg-[#244b8a] border-none rounded px-3 py-2 outline-none focus:ring-2 focus:ring-blue-400 min-w-[120px]"
            disabled={!sido}
          >
            <option value="">시/군/구</option>
            {sido && Object.keys(DONG_DATA[sido] || {}).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex gap-2 ml-auto">
          {canEdit && (
            <button 
              onClick={handleCopyPreviousMonth}
              className="bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition shadow-lg"
              title="이전 달의 기사/행정동 정보를 가져옵니다"
            >
              <RotateCcw size={18} /> 전월 가져오기
            </button>
          )}
          {canEdit && (
            <button 
              onClick={handleToggleSort}
              className="bg-amber-600 hover:bg-amber-500 px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition shadow-lg"
              title="행정동을 오름차순/내림차순으로 정렬합니다"
            >
              <Download className={sortDirection === 'desc' ? 'rotate-180' : ''} size={18} /> 정렬하기
            </button>
          )}
          {canEdit && (
            <button 
              onClick={handleGenerateDongs}
              className="bg-blue-500 hover:bg-blue-400 px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition shadow-lg"
            >
              <LayoutGrid size={18} /> 행정동 자동생성
            </button>
          )}
          <button 
            onClick={handlePrint}
            className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition shadow-lg"
          >
            <Printer size={18} /> 인쇄하기
          </button>
          <button 
            onClick={exportToExcel}
            className="bg-green-600 hover:bg-green-500 px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition shadow-lg"
          >
            <Download size={18} /> 엑셀 저장
          </button>
          <button 
            disabled={isGeneratingPDF}
            onClick={handleDownloadPDF}
            className={`px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition shadow-lg active:scale-95 ${
              isGeneratingPDF ? 'bg-red-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-500'
            }`}
          >
            {isGeneratingPDF ? <Loader2 size={18} className="animate-spin" /> : <FileDown size={18} />}
            {isGeneratingPDF ? '생성 중...' : 'PDF 저장'}
          </button>
        </div>
      </div>

      {/* Print-Only Template (Matches Screenshot perfectly for A4) */}
      <div className="print-only print-container delivery-print-container font-sans text-black group flex flex-col items-start pt-0">
        <div className="text-center mb-2 w-full pt-1">
          <h1 className="text-2xl font-extrabold tracking-tighter border-b-2 border-black pb-1 inline-block px-10 whitespace-nowrap">
            {data.year}년 {data.month}월 {data.sido} {data.sigungu} 배송일정 안내
          </h1>
        </div>
        
        <table className="w-full border-collapse border-[1.2px] border-black text-[9.5pt]">
          <thead>
            <tr className="bg-gray-100 h-9">
              <th className="border-[1.2px] border-black font-bold w-[35px]">순번</th>
              <th className="border-[1.2px] border-black font-bold w-[110px]">행정동</th>
              <th className="border-[1.2px] border-black font-bold w-[90px]">배송담당</th>
              <th className="border-[1.2px] border-black font-bold w-[130px]">기사연락처</th>
              <th className="border-[1.2px] border-black font-bold w-[130px]">비상연락처</th>
              <th className="border-[1.2px] border-black font-bold w-[120px]">배송일</th>
              <th className="border-[1.2px] border-black font-bold w-[50px]">완료</th>
              <th className="border-[1.2px] border-black font-bold">비고</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item, idx) => (
              <tr key={item.id} className="h-9 text-center">
                <td className="border-[1.2px] border-black font-mono">{idx + 1}</td>
                <td className="border-[1.2px] border-black font-medium">{item.dong}</td>
                <td className="border-[1.2px] border-black font-bold text-[10pt]">{item.driverName}</td>
                <td className="border-[1.2px] border-black font-semibold text-[10pt] break-all">{item.driverPhone}</td>
                <td className="border-[1.2px] border-black text-gray-700 text-[9pt] break-all">{item.emergencyPhone}</td>
                <td className={`border-[1.2px] border-black font-bold text-[10pt] whitespace-pre-wrap ${item.deliveryDate ? 'bg-[#ffffcc]' : ''}`}>
                  {item.deliveryDate}
                </td>
                <td className="border-[1.2px] border-black text-lg">{item.isCompleted ? '✓' : ''}</td>
                <td className="border-[1.2px] border-black text-left px-2 text-[9pt] whitespace-pre-wrap">{item.notes}</td>
              </tr>
            ))}
            {/* Fill empty rows if data is small */}
            {data.items.length < 18 && Array.from({ length: 18 - data.items.length }).map((_, i) => (
              <tr key={`empty-${i}`} className="h-9">
                <td className="border-[1.2px] border-black text-gray-300">{data.items.length + i + 1}</td>
                <td className="border-[1.2px] border-black"></td>
                <td className="border-[1.2px] border-black"></td>
                <td className="border-[1.2px] border-black"></td>
                <td className="border-[1.2px] border-black"></td>
                <td className="border-[1.2px] border-black"></td>
                <td className="border-[1.2px] border-black"></td>
                <td className="border-[1.2px] border-black"></td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Footer for Page Numbering */}
        <div className="footer-print hidden group-print:block">
          <span className="page-number"></span>
        </div>
      </div>

      {/* Main Content Area (Screen View Only) */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden min-h-[600px] flex flex-col no-print">
        <div className="p-4 bg-white border-b flex items-center justify-between no-print px-8">
          <div className="text-xl font-bold text-[#1a3a6b]">
            {year}년 {month}월 {sigungu || '(지역선택)'} 배송일정안내
          </div>
          
          <div className="flex items-center gap-2">
            {isLoadingSchedule && (
              <span className="px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 text-[12px] font-bold flex items-center gap-2 animate-pulse border border-blue-100">
                <Loader2 size={14} className="animate-spin" />
                ⏳ 불러오는 중...
              </span>
            )}
            {hasUnsavedChanges && !isLoadingSchedule && (
              <span className="px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 text-[12px] font-bold flex items-center gap-2 border border-amber-100">
                <RefreshCw size={14} className="animate-spin" />
                ✏️ 저장 중...
              </span>
            )}
            {!hasUnsavedChanges && !isLoadingSchedule && data.items.length > 0 && (
              <span className="px-3 py-1.5 rounded-full bg-green-50 text-green-700 text-[12px] font-bold flex items-center gap-2 border border-green-100">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                ✅ 저장됨
              </span>
            )}
          </div>
        </div>

        <div className="overflow-x-auto print:overflow-visible">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#4472c4] text-white text-sm font-bold divide-x divide-white/20">
                <th className="p-3 w-16 text-center">순번</th>
                <th className="p-3 w-32">행정동</th>
                <th className="p-3 w-40">배송담당기사</th>
                <th className="p-3 w-44">기사연락처</th>
                <th className="p-3 w-44">비상연락처</th>
                <th className="p-3 w-56">배송일</th>
                <th className="p-3 w-28 text-center">배송완료</th>
                <th className="p-3 min-w-[150px]">비고</th>
                {canEdit && <th className="p-3 w-24 text-center no-print bg-slate-100 text-slate-500 border-none">관리</th>}
              </tr>
            </thead>
            <tbody className="text-sm divide-y">
              {data.items.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 9 : 8} className="p-20 text-center text-gray-300 italic text-lg">
                    지역을 선택하고 행정동을 자동 생성해주세요.
                  </td>
                </tr>
              ) : (
                data.items.map((item, idx) => (
                  <tr key={item.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-[#f2f2f2]'} divide-x divide-gray-200`}>
                    <td className="p-1 px-2 text-center text-gray-400 font-mono italic">
                      {idx + 1}
                    </td>
                    <td className="p-1 px-2 font-medium">
                      <input 
                        className={`w-full bg-transparent outline-none p-2 rounded ${canEdit ? 'focus:bg-white/50' : 'cursor-default'}`}
                        value={item.dong}
                        readOnly={!canEdit}
                        onChange={e => handleUpdateItem(item.id, 'dong', e.target.value)}
                      />
                    </td>
                    <td className="p-1 px-2 relative">
                      <DriverAutocomplete
                        value={item.driverName}
                        rowId={item.id}
                        onSelect={handleDriverSelect}
                        defaultEmergency={getEmergencyNumber()}
                        canEdit={canEdit}
                        drivers={drivers}
                      />
                    </td>
                    <td className="p-1 px-2">
                       <input 
                        className={`w-full bg-transparent outline-none p-2 rounded text-gray-600 ${canEdit ? 'focus:bg-white/50' : 'cursor-default'}`}
                        value={item.driverPhone}
                        readOnly={!canEdit}
                        onChange={e => handleUpdateItem(item.id, 'driverPhone', e.target.value)}
                      />
                    </td>
                    <td className="p-1 px-2">
                      <input 
                        className={`w-full bg-transparent outline-none p-2 rounded text-gray-600 ${canEdit ? 'focus:bg-white/50' : 'cursor-default'}`}
                        value={item.emergencyPhone}
                        readOnly={!canEdit}
                        onChange={e => handleUpdateItem(item.id, 'emergencyPhone', e.target.value)}
                      />
                    </td>
                    <td className="p-1 px-2">
                      <div className="flex items-start gap-1 group">
                        <textarea 
                          rows={1}
                          readOnly={!canEdit}
                          className={`w-full bg-transparent outline-none p-2 rounded transition-colors resize-none overflow-hidden whitespace-pre-wrap ${item.deliveryDate ? 'text-blue-700 font-bold' : 'text-gray-400'} ${canEdit ? 'focus:bg-white' : 'cursor-default'}`}
                          style={{ height: 'auto' }}
                          value={item.deliveryDate}
                          placeholder={canEdit ? "배송일 입력..." : ""}
                          onChange={e => {
                            handleUpdateItem(item.id, 'deliveryDate', e.target.value);
                            e.target.style.height = 'auto';
                            e.target.style.height = e.target.scrollHeight + 'px';
                          }}
                        />
                        {canEdit && (
                          <button 
                            onClick={() => setEditingDateId(item.id)}
                            className="p-1.5 mt-1 text-gray-300 hover:text-blue-600 hover:bg-blue-50 rounded transition-all opacity-0 group-hover:opacity-100"
                            title="달력 선택"
                          >
                            <FileSpreadsheet size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="p-1 px-2 text-center align-middle">
                      <input 
                        type="checkbox"
                        checked={item.isCompleted}
                        disabled={!canEdit}
                        onChange={e => handleUpdateItem(item.id, 'isCompleted', e.target.checked)}
                        className={`w-5 h-5 accent-blue-600 rounded ${canEdit ? 'cursor-pointer' : 'cursor-default'}`}
                      />
                    </td>
                    <td className="p-1 px-2">
                       <input 
                        className={`w-full bg-transparent outline-none p-2 rounded italic text-gray-500 ${canEdit ? 'focus:bg-white/50' : 'cursor-default'}`}
                        value={item.notes}
                        readOnly={!canEdit}
                        onChange={e => handleUpdateItem(item.id, 'notes', e.target.value)}
                      />
                    </td>
                    {canEdit && (
                      <td className="p-1 px-2 no-print align-middle">
                        <div className="flex gap-1 justify-center">
                          <button onClick={() => addDriverRow(item.dong, item.no)} className="text-blue-400 hover:text-blue-600 p-1.5 transition" title="기사 추가">
                            <UserPlus size={16} />
                          </button>
                          <button onClick={() => deleteRow(item.id)} className="text-red-400 hover:text-red-600 p-1.5 transition" title="삭제">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {canEdit && (
          <div className="p-4 bg-gray-50 flex justify-center no-print">
            <button 
              onClick={addEmptyRow}
              className="flex items-center gap-2 px-10 py-3 border-2 border-dashed border-gray-300 rounded-2xl text-gray-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all font-bold"
            >
              <Plus size={20} /> 빈 행 추가
            </button>
          </div>
        )}
      </div>

      {editingDateId && (
        <DatePopup 
          year={data.year}
          month={data.month}
          initialValue={data.items.find(i => i.id === editingDateId)?.deliveryDate || ''}
          onConfirm={(val) => {
            handleUpdateItem(editingDateId, 'deliveryDate', val);
            setEditingDateId(null);
          }}
          onCancel={() => setEditingDateId(null)}
        />
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-10 left-10 z-[100] animate-in slide-in-from-left-4 fade-in duration-300">
          <div className={`px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 border ${
            toast.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' :
            toast.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' :
            toast.type === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800' :
            'bg-blue-50 border-blue-200 text-blue-800'
          }`}>
            <span className="text-xl">
              {toast.type === 'success' ? '✅' : toast.type === 'info' ? 'ℹ️' : toast.type === 'warning' ? '⚠️' : '❌'}
            </span>
            <span className="font-bold text-sm whitespace-pre-line">{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
