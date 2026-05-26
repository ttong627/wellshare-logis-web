/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Save, AlertTriangle, RefreshCw, Plus, Trash2, Search, FileUp, FileDown, Edit2, FileSpreadsheet } from 'lucide-react';
import { storage } from '../../lib/storage';
import { SIDO_LIST, DONG_DATA } from '../../constants';
import { firebaseService } from '../../lib/firebaseService';
import { useFirebase } from '../../hooks/useFirebase';
import { EmergencyContact } from '../../types';
import * as XLSX from 'xlsx';

interface EmergencyExcelRow {
  '시도': string;
  '시군구': string;
  '비상연락처': string;
  '설명'?: string;
}

export default function SettingsManager() {
  const { user } = useFirebase();
  const [settings, setSettings] = useState({ 
    defaultSido: '', 
    defaultSigungu: '' 
  });
  
  const [contacts, setContacts] = useState<Record<string, EmergencyContact>>({});
  const [sido, setSido] = useState('');
  const [sigungu, setSigungu] = useState('');
  const [phone, setPhone] = useState('');
  const [description, setDescription] = useState('');
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const { defaultSido, defaultSigungu } = settings;

  // Migration Check
  useEffect(() => {
    const migrate = async () => {
      const flag = localStorage.getItem('emergency_migrated_v2');
      if (flag) return;

      const currentGlobal = await firebaseService.getGlobalSettings();
      if (currentGlobal.defaultEmergency) {
        alert('📢 알림\n기존 비상연락처가 지역별 관리 체계로 변경되었습니다.\n[설정] -> [지역별 비상연락처 관리]에서 지역별로 다시 등록해 주세요.');
      }
      localStorage.setItem('emergency_migrated_v2', 'true');
    };
    migrate();
  }, []);

  // Subscribe to global settings
  useEffect(() => {
    const unsub = firebaseService.subscribeToGlobalSettings((data) => {
      if (data) {
        setSettings({
          defaultSido: (data.defaultSido as string) || '',
          defaultSigungu: (data.defaultSigungu as string) || ''
        });
      }
    });

    return () => unsub();
  }, []);

  // Subscribe to emergency contacts
  useEffect(() => {
    const unsub = firebaseService.subscribeToEmergencyContacts((data) => {
      setContacts(data);
    });
    return () => unsub();
  }, []);

  const handleSaveSettings = async () => {
    if (!user) {
      alert('로그인이 필요합니다.');
      return;
    }
    
    try {
      await firebaseService.setGlobalSettings({
        defaultSido,
        defaultSigungu
      });
      alert('기본 지역 설정이 저장되었습니다.');
    } catch {
      alert('설정 저장 중 오류가 발생했습니다.');
    }
  };

  const handleSaveContact = async () => {
    if (!sido || !sigungu || !phone) {
      alert('시/도, 시/군/구, 비상연락처를 모두 입력해주세요.');
      return;
    }

    setIsSaving(true);
    try {
      await firebaseService.saveEmergencyContact(sido, sigungu, phone, description);
      setPhone('');
      setDescription('');
      setEditingId(null);
      alert(`${sigungu} 비상연락처가 저장되었습니다.`);
    } catch (error: unknown) {
      alert('저장 실패: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteContact = async (contact: EmergencyContact) => {
    if (!confirm(`${contact.sigungu} 비상연락처를 삭제하시겠습니까?`)) return;
    try {
      await firebaseService.deleteEmergencyContact(contact.sido, contact.sigungu);
    } catch (error: unknown) {
      alert('삭제 실패: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const handleEdit = (contact: EmergencyContact) => {
    setSido(contact.sido);
    setSigungu(contact.sigungu);
    setPhone(contact.phone);
    setDescription(contact.description || '');
    setEditingId(contact.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleResetAll = () => {
    if (confirm('모든 로컬 캐시 데이터를 초기화하시겠습니까?')) {
      storage.clear();
      window.location.reload();
    }
  };

  const downloadTemplate = () => {
    const template = [
      { '시도': '서울특별시', '시군구': '동대문구', '비상연락처': '010-0000-0000', '설명': '동대문구청 담당자' },
      { '시도': '경기도', '시군구': '시흥시', '비상연락처': '010-0000-0000', '설명': '시흥시청 담당자' },
    ];
    const ws = XLSX.utils.json_to_sheet(template);
    ws['!cols'] = [{ wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 25 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '비상연락처');
    XLSX.writeFile(wb, '비상연락처_등록양식.xlsx');
  };

  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const bstr = evt.target?.result as string;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws) as EmergencyExcelRow[];
      
      const list = data
        .filter(r => r['시도'] && r['시군구'] && r['비상연락처'])
        .map(r => ({
          sido: String(r['시도']).trim(),
          sigungu: String(r['시군구']).trim(),
          phone: String(r['비상연락처']).trim(),
          description: String(r['설명'] || '').trim(),
        }));

      if (list.length === 0) {
        alert('등록할 유효한 데이터가 없습니다.');
        return;
      }

      if (confirm(`총 ${list.length}개의 비상연락처를 일괄 등록하시겠습니까?`)) {
        setIsSaving(true);
        try {
          await firebaseService.bulkSaveEmergencyContacts(list);
          alert('일괄 등록 완료!');
        } catch (error: unknown) {
          alert('일괄 등록 실패: ' + (error instanceof Error ? error.message : String(error)));
        } finally {
          setIsSaving(false);
        }
      }
    };
    reader.readAsBinaryString(file);
  };

  const exportToExcel = () => {
    const data = (Object.values(contacts) as EmergencyContact[]).map(c => ({
      '시도': c.sido,
      '시군구': c.sigungu,
      '비상연락처': c.phone,
      '설명': c.description,
      '최종수정': c.updatedAt
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '비상연락처목록');
    XLSX.writeFile(wb, '지역별_비상연락처_목록.xlsx');
  };

  const sigunguOptions = sido ? Object.keys(DONG_DATA[sido] || {}) : [];
  const filtered = (Object.values(contacts) as EmergencyContact[]).filter(c => {
    const q = search.toLowerCase();
    return !q || 
           c.sido.toLowerCase().includes(q) || 
           c.sigungu.toLowerCase().includes(q) || 
           c.phone.includes(q) || 
           c.description.toLowerCase().includes(q);
  }).sort((a, b) => (a.sido + a.sigungu).localeCompare(b.sido + b.sigungu, 'ko'));

  return (
    <div className="max-w-4xl space-y-8 pb-20">
      {/* 1. Regional Emergency Contact Management */}
      <section className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-[#1a3a6b] flex items-center gap-2">
            📞 지역별 비상연락처 관리
          </h3>
          <div className="flex gap-2">
            <button 
              onClick={downloadTemplate}
              className="text-xs flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition"
            >
              <FileDown size={14} /> 양식 다운로드
            </button>
            <label className="text-xs flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition cursor-pointer">
              <FileUp size={14} /> 엑셀 일괄 등록
              <input type="file" className="hidden" accept=".xlsx, .xls" onChange={handleExcelUpload} />
            </label>
          </div>
        </div>

        {/* Input Form */}
        <div className="bg-gray-50 p-6 rounded-xl border border-gray-100 mb-8 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <select
              value={sido}
              onChange={e => { setSido(e.target.value); setSigungu(''); }}
              className="border p-2.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1a3a6b]/20 bg-white"
            >
              <option value="">시/도 선택</option>
              {SIDO_LIST.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              value={sigungu}
              onChange={e => setSigungu(e.target.value)}
              disabled={!sido}
              className="border p-2.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1a3a6b]/20 bg-white disabled:bg-gray-100"
            >
              <option value="">시/군/구 선택</option>
              {sigunguOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <input
              placeholder="비상연락처 (인터넷 전화/핸드폰)"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="border p-2.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1a3a6b]/20 bg-white"
            />
            <input
              placeholder="설명 (예: 담당자명)"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="border p-2.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1a3a6b]/20 bg-white"
            />
          </div>
          <div className="flex justify-end">
            <button
              onClick={handleSaveContact}
              disabled={isSaving}
              className="bg-[#1a3a6b] text-white px-8 py-2.5 rounded-lg font-bold hover:bg-[#244b8a] transition flex items-center gap-2 shadow-md shadow-[#1a3a6b]/20 disabled:opacity-50"
            >
              {editingId ? <><Edit2 size={16} /> 수정 완료</> : <><Plus size={18} /> 저장하기</>}
            </button>
          </div>
        </div>

        {/* List and Search */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-3 py-2 bg-white border rounded-lg focus-within:ring-2 focus-within:ring-blue-100 transition">
            <Search size={16} className="text-gray-400" />
            <input 
              placeholder="지역명 또는 번호로 검색..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 text-sm outline-none"
            />
          </div>

          <div className="max-h-[500px] overflow-y-auto border rounded-xl">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-500 font-bold sticky top-0">
                <tr>
                  <th className="px-4 py-3 border-b">지역 (시/도 시/군/구)</th>
                  <th className="px-4 py-3 border-b">비상연락처</th>
                  <th className="px-4 py-3 border-b">설명</th>
                  <th className="px-4 py-3 border-b text-center">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-blue-50/30 transition">
                    <td className="px-4 py-3 font-medium text-gray-700">{c.sido} {c.sigungu}</td>
                    <td className="px-4 py-3 text-blue-600 font-bold">{c.phone}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{c.description || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center gap-2">
                        <button 
                          onClick={() => handleEdit(c)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          onClick={() => handleDeleteContact(c)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-gray-400 font-medium bg-gray-50">
                      등록된 비상연락처가 없거나 검색 결과가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <button 
              onClick={exportToExcel}
              disabled={filtered.length === 0}
              className="text-xs font-bold text-[#1a3a6b] flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#1a3a6b]/20 hover:bg-gray-50 transition"
            >
              <FileSpreadsheet size={14} /> 현재 목록 엑셀 저장
            </button>
          </div>
        </div>
      </section>

      {/* 2. Global Default Region Settings */}
      <section className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200">
        <h3 className="text-xl font-bold mb-6 text-[#1a3a6b]">기본 지역 설정</h3>
        
        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-600">접속 시 기본 표시 지역</label>
            <div className="grid grid-cols-2 gap-3">
              <select
                value={defaultSido}
                onChange={e => setSettings(prev => ({ ...prev, defaultSido: e.target.value, defaultSigungu: '' }))}
                className="border p-3 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1a3a6b]/20"
              >
                <option value="">시/도 선택</option>
                {SIDO_LIST.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select
                value={defaultSigungu}
                onChange={e => setSettings(prev => ({ ...prev, defaultSigungu: e.target.value }))}
                className="border p-3 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1a3a6b]/20"
                disabled={!defaultSido}
              >
                <option value="">시/군/구 선택</option>
                {Object.keys(DONG_DATA[defaultSido] || {}).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <p className="text-xs text-gray-400">배송일정 페이지 최초 접속 시 보여줄 기본 지자체입니다. (모든 사용자 공유)</p>
          </div>

          <div className="flex justify-end pt-4 border-t border-gray-100">
            <button
              onClick={handleSaveSettings}
              className="bg-[#1a3a6b] text-white px-8 py-3 rounded-xl font-bold hover:bg-[#244b8a] transition flex items-center gap-2 shadow-lg shadow-[#1a3a6b]/20"
            >
              <Save size={20} /> 지역 설정 저장
            </button>
          </div>
        </div>
      </section>

      {/* 3. Cache Management */}
      <section className="bg-red-50 p-8 rounded-2xl border border-red-100">
        <h3 className="text-lg font-bold mb-4 text-red-700 flex items-center gap-2">
          <AlertTriangle size={20} /> 로컬 캐시 관리
        </h3>
        <p className="text-sm text-red-600 mb-6 font-medium">주의: 아래 버튼을 클릭하면 브라우저의 모든 캐시 데이터가 삭제됩니다. 서버 데이터는 유지됩니다.</p>
        <button
          onClick={handleResetAll}
          className="bg-red-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-red-700 shadow-lg shadow-red-200 transition flex items-center gap-2"
        >
          <RefreshCw size={18} /> 로컬 캐시 초기화
        </button>
      </section>
    </div>
  );
}

