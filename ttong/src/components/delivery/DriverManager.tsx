/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Search, Save, Download, RefreshCw, Loader2 } from 'lucide-react';
import { Driver } from '../../types';
import * as XLSX from 'xlsx';
import { firebaseService } from '../../lib/firebaseService';
import { useFirebase } from '../../hooks/useFirebase';
import { useRole } from '../../hooks/useRole';
import { writeBatch, doc, collection, FirestoreError } from 'firebase/firestore';
import { db } from '../../lib/firebase';

/*
  저장 오류 발생 시 Firebase 콘솔에서 확인할 사항:

  1. Firestore 보안 규칙 확인
     Firebase 콘솔 → Firestore Database → 규칙 탭
     drivers 컬렉션에 read/write 권한이 있는지 확인

  2. users/{uid} 문서에 role 필드 확인
     Firebase 콘솔 → Firestore Database → 데이터 탭
     users 컬렉션 → 본인 uid 문서 → role 필드가
     'ROLE_ADMIN' 또는 'ROLE_EDITOR'인지 확인

  3. 브라우저 콘솔(F12)에서 error.code 확인:
     permission-denied → 보안 규칙 문제
     unavailable       → 네트워크 또는 Firebase 설정 문제
     not-found         → 컬렉션/문서 경로 오류
*/

export default function DriverManager() {
  const { user } = useFirebase();
  const { canEdit } = useRole();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [search, setSearch] = useState('');
  const [newDriver, setNewDriver] = useState({ name: '', phone: '', emergency: '' });
  const [bulkInput, setBulkInput] = useState('');
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [parsePreview, setParsePreview] = useState<Omit<Driver, 'id'>[]>([]);
  const [failedItems, setFailedItems] = useState<Omit<Driver, 'id'>[]>([]);
  const [parsingErrors, setParsingErrors] = useState<number>(0);

  const showToast = (message: string) => {
    alert(message);
  };

  const handleFirestoreError = (error: unknown, context: string) => {
    const err = error as FirestoreError;
    console.error(`Firestore ${context} 오류 상세:`, {
      code: err.code,
      message: err.message,
      stack: err.stack
    });

    if (err.code === 'permission-denied') {
      showToast('권한이 없습니다. 관리자에게 문의하세요.');
    } else if (err.code === 'unavailable') {
      showToast('네트워크 연결을 확인해주세요.');
    } else if (error instanceof Error && error.message.includes('resource-exhausted')) {
      showToast('요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');
    } else {
      showToast(`${context} 오류: ${err.message || '알 수 없는 오류가 발생했습니다.'}`);
    }
  };

  // Sync drivers from Firebase real-time (Shared collection)
  useEffect(() => {
    const unsubscribe = firebaseService.subscribeToDrivers((driversData) => {
      setDrivers(driversData);
    });
    return () => unsubscribe();
  }, []);

  const handleAdd = async () => {
    if (!canEdit) return showToast('편집 권한이 없습니다.');
    if (!newDriver.name || !newDriver.phone) return showToast('이름과 연락처는 필수입니다.');
    if (!user) return showToast('로그인이 필요합니다.');

    setIsSaving(true);
    try {
      const driver: Driver = {
        id: Date.now().toString(),
        ...newDriver
      };
      await firebaseService.saveDriver(driver);
      setNewDriver({ name: '', phone: '', emergency: '' });
      showToast('기사가 등록되었습니다.');
    } catch (error) {
      handleFirestoreError(error, '기사 등록');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!canEdit) return showToast('편집 권한이 없습니다.');
    if (!user) return showToast('로그인이 필요합니다.');

    if (confirm('기사 정보를 삭제하시겠습니까?')) {
      setIsSaving(true);
      try {
        await firebaseService.deleteDriver(id);
        showToast('기사 정보가 삭제되었습니다.');
      } catch (error) {
        handleFirestoreError(error, '기사 삭제');
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleUpdate = async (id: string, field: keyof Driver, value: string) => {
    if (!canEdit || !user) return;
    try {
      await firebaseService.updateDriver(id, { [field]: value });
    } catch (error) {
      handleFirestoreError(error, '기사 정보 수정');
    }
  };

  const parseExcelPaste = (text: string) => {
    if (!text || !text.trim()) return [];

    // 줄바꿈 정규화 (\r\n, \r, \n 모두 처리)
    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // 빈 줄 제거 후 각 행 처리
    const lines = normalized
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    const result: Omit<Driver, 'id'>[] = [];
    const seen = new Set(); // 중복 제거용
    let errorCount = 0;

    lines.forEach((line) => {
      // 탭으로 먼저 분리 (엑셀 기본 구분자)
      let parts = line.split('\t').map(p => p.trim());

      // 탭 분리가 안 됐으면 2칸 이상 공백으로 분리
      if (parts.length < 2) {
        parts = line.split(/\s{2,}/).map(p => p.trim());
      }

      // 그래도 안 됐으면 단일 공백으로 분리 시도
      if (parts.length < 2) {
        parts = line.split(/\s+/).map(p => p.trim());
      }

      // 빈 값 제거
      parts = parts.filter(p => p.length > 0);

      if (parts.length >= 2) {
        const name = parts[0];
        const phone = parts[1];
        const emergency = parts[2] || '';

        // 전화번호 형식 검증 (유연하게)
        const phoneClean = phone.replace(/[\s-]/g, '');
        const isValidPhone = /^0\d{9,10}$/.test(phoneClean);

        // 이름 검증 (1자 이상, 숫자만으로 된 이름 제외)
        const isValidName = name.length >= 1 && !/^\d+$/.test(name);

        if (isValidName && isValidPhone) {
          // 전화번호 형식 통일 (010-1234-5678)
          const formattedPhone = phoneClean.replace(
            /^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3'
          );
          const formattedEmergency = emergency
            ? emergency.replace(/[\s-]/g, '')
                .replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3')
            : '';

          const key = `${name}_${formattedPhone}`;
          if (!seen.has(key)) {
            seen.add(key);
            result.push({
              name,
              phone: formattedPhone,
              emergency: formattedEmergency,
            });
          }
        } else {
          errorCount++;
        }
      } else {
        errorCount++;
      }
    });

    setParsingErrors(errorCount);
    return result;
  };

  const handleRefresh = async () => {
    setIsSaving(true);
    try {
      const cloudDrivers = await firebaseService.getDrivers();
      setDrivers(cloudDrivers);
      showToast('기사 명단을 서버에서 최신화했습니다.');
    } catch (error) {
      handleFirestoreError(error, '새로고침');
    } finally {
      setIsSaving(false);
    }
  };

  const handleManualSave = async () => {
    if (!canEdit || !user) return showToast('권한이 없습니다.');
    setIsSaving(true);
    try {
      await firebaseService.setDrivers(drivers);
      showToast('모든 기사 정보가 서버에 저장되었습니다.');
    } catch (error) {
      handleFirestoreError(error, '전체 저장');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTextChange = (text: string) => {
    setBulkInput(text);
    const parsed = parseExcelPaste(text);
    setParsePreview(parsed);
  };

  const bulkSaveDrivers = async (driverList: Omit<Driver, 'id'>[]) => {
    if (!driverList || driverList.length === 0) return { savedCount: 0, failedItems: [] };

    const BATCH_SIZE = 400; // 안전하게 400으로 설정
    const chunks: Omit<Driver, 'id'>[][] = [];

    for (let i = 0; i < driverList.length; i += BATCH_SIZE) {
      chunks.push(driverList.slice(i, i + BATCH_SIZE));
    }

    let savedCount = 0;
    const failedList: Omit<Driver, 'id'>[] = [];

    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunk = chunks[chunkIndex];
      try {
        const batch = writeBatch(db);
        chunk.forEach((driver) => {
          const newRef = doc(collection(db, 'drivers'));
          batch.set(newRef, {
            ...driver,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
        });
        await batch.commit();
        savedCount += chunk.length;

        // 진행률 업데이트
        const progress = Math.round((savedCount / driverList.length) * 100);
        setUploadProgress(progress);
      } catch (error) {
        console.error(`Batch ${chunkIndex + 1} 저장 실패:`, error);
        // 실패한 chunk는 개별 저장으로 재시도
        for (const driver of chunk) {
          try {
            const newRef = doc(collection(db, 'drivers'));
            await firebaseService.saveDriver({
              id: newRef.id,
              ...driver
            } as Driver);
            savedCount++;
            setUploadProgress(Math.round((savedCount / driverList.length) * 100));
          } catch (individualError) {
            console.error('개별 저장 실패:', driver, individualError);
            failedList.push(driver);
          }
        }
      }
    }

    return { savedCount, failedItems: failedList };
  };

  const handleBulkAdd = async () => {
    if (!canEdit) return showToast('편집 권한이 없습니다.');
    if (!user) return showToast('로그인이 필요합니다.');
    
    const parsed = parseExcelPaste(bulkInput);
    if (parsed.length === 0) {
      showToast('저장할 데이터가 없습니다.\n이름과 연락처가 올바르게 입력되었는지 확인해주세요.');
      return;
    }

    const confirmed = window.confirm(`총 ${parsed.length}명의 기사를 등록하시겠습니까?`);
    if (!confirmed) return;

    setIsSaving(true);
    setUploadProgress(0);
    setFailedItems([]);

    try {
      const { savedCount, failedItems: failed } = await bulkSaveDrivers(parsed);

      if (failed.length === 0) {
        showToast(`✅ ${savedCount}명 전원 저장 완료!`);
        setBulkInput('');
        setParsePreview([]);
        setIsBulkMode(false);
      } else {
        setFailedItems(failed);
        showToast(
          `⚠️ ${savedCount}명 저장 완료\n` +
          `❌ ${failed.length}명 저장 실패`
        );
      }
    } catch (error) {
      handleFirestoreError(error, '대량 등록');
    } finally {
      setIsSaving(false);
      setUploadProgress(0);
    }
  };

  const handleRetryFailed = async () => {
    if (failedItems.length === 0) return;
    
    setIsSaving(true);
    setUploadProgress(0);
    const toRetry = [...failedItems];
    
    try {
      const { savedCount, failedItems: stillFailed } = await bulkSaveDrivers(toRetry);
      setFailedItems(stillFailed);
      
      if (stillFailed.length === 0) {
        showToast(`✅ 재시도 결과 ${savedCount}명 추가 저장 완료!`);
      } else {
        showToast(`⚠️ 재시도 완료: ${savedCount}명 성공, ${stillFailed.length}명 여전히 실패`);
      }
    } catch (error) {
      handleFirestoreError(error, '재시도');
    } finally {
      setIsSaving(false);
      setUploadProgress(0);
    }
  };

  const downloadFailedItems = () => {
    const data = failedItems.map(d => ({
      '이름': d.name,
      '연락처': d.phone,
      '비상연락처': d.emergency
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '실패목록');
    XLSX.writeFile(workbook, '기사등록_실패목록.xlsx');
  };

  const exportToExcel = () => {
    const data = drivers.map(d => ({
      '이름': d.name,
      '연락처': d.phone,
      '비상연락처': d.emergency
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '기사목록');
    XLSX.writeFile(workbook, '기사목록.xlsx');
  };

  const filtered = drivers.filter(d => (d.name || '').includes(search));

  return (
    <div className="space-y-6">
      {canEdit && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-[#1a3a6b]">기사 등록</h3>
            <button 
              onClick={() => setIsBulkMode(!isBulkMode)}
              className="text-xs font-medium text-blue-600 hover:underline"
            >
              {isBulkMode ? '개별 등록으로 전환' : 'Excel 대량 등록'}
            </button>
          </div>

          {!isBulkMode ? (
            <div className="flex flex-wrap gap-3">
              <input
                placeholder="이름"
                value={newDriver.name}
                onChange={e => setNewDriver({ ...newDriver, name: e.target.value })}
                className="border p-2 rounded flex-1 min-w-[150px]"
              />
              <input
                placeholder="연락처"
                value={newDriver.phone}
                onChange={e => setNewDriver({ ...newDriver, phone: e.target.value })}
                className="border p-2 rounded flex-1 min-w-[150px]"
              />
              <input
                placeholder="비상연락처"
                value={newDriver.emergency}
                onChange={e => setNewDriver({ ...newDriver, emergency: e.target.value })}
                className="border p-2 rounded flex-1 min-w-[150px]"
              />
              <button
                onClick={handleAdd}
                disabled={isSaving}
                className={`bg-[#1a3a6b] text-white px-6 py-2 rounded font-bold transition-all flex items-center gap-2 ${isSaving ? 'opacity-60 cursor-not-allowed' : 'hover:bg-[#244b8a]'}`}
              >
                {isSaving ? <><Loader2 size={18} className="animate-spin" /> 저장 중...</> : <><Plus size={18} /> 등록</>}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <div className="text-xs text-gray-500">
                  Excel 등에서 [이름, 연락처, 비상연락처] 컬럼을 복사해서 붙여넣으세요.
                </div>
                {parsePreview.length > 0 && (
                  <div className="text-xs font-bold text-blue-600">
                    인식됨: {parsePreview.length}명 
                    {parsingErrors > 0 && <span className="ml-2 text-red-500">(실패: {parsingErrors}행)</span>}
                  </div>
                )}
              </div>
              
              <textarea
                placeholder="홍길동	010-1234-5678	010-0000-0000"
                value={bulkInput}
                onChange={e => handleTextChange(e.target.value)}
                className="w-full h-32 border p-3 rounded font-mono text-sm focus:ring-2 focus:ring-[#1a3a6b]/20 outline-none"
              />

              {parsePreview.length > 0 && (
                <div className="border rounded-lg overflow-hidden bg-gray-50">
                  <div className="px-3 py-1.5 bg-gray-100 text-[10px] font-bold text-gray-500 border-b">
                    파싱 미리보기 (상위 5명)
                  </div>
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-white">
                        <th className="px-3 py-1 border-b">이름</th>
                        <th className="px-3 py-1 border-b">연락처</th>
                        <th className="px-3 py-1 border-b">비상연락처</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsePreview.slice(0, 5).map((p, i) => (
                        <tr key={i}>
                          <td className="px-3 py-1 border-b">{p.name}</td>
                          <td className="px-3 py-1 border-b">{p.phone}</td>
                          <td className="px-3 py-1 border-b">{p.emergency}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {parsePreview.length > 5 && (
                    <div className="p-1 px-3 text-[10px] text-gray-400 text-center">
                      외 {parsePreview.length - 5}명 인식됨
                    </div>
                  )}
                </div>
              )}

              {isSaving && uploadProgress > 0 && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[10px] font-bold">
                    <span className="text-blue-600">저장 중...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                    <div 
                      className="bg-blue-600 h-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {failedItems.length > 0 && (
                <div className="p-3 bg-red-50 border border-red-100 rounded-lg space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-red-600">⚠️ {failedItems.length}명의 데이터가 저장되지 않았습니다.</span>
                    <div className="flex gap-2">
                      <button 
                        onClick={downloadFailedItems}
                        className="text-[10px] bg-white border border-red-200 text-red-600 px-2 py-1 rounded hover:bg-red-100 transition"
                      >
                        실패 목록 엑셀 다운로드
                      </button>
                      <button 
                        onClick={handleRetryFailed}
                        disabled={isSaving}
                        className="text-[10px] bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700 transition"
                      >
                        재시도
                      </button>
                    </div>
                  </div>
                  <div className="text-[10px] text-red-400 max-h-20 overflow-y-auto">
                    {failedItems.map((f, i) => (
                      <div key={i}>- {f.name} ({f.phone})</div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setIsBulkMode(false);
                    setBulkInput('');
                    setParsePreview([]);
                    setFailedItems([]);
                  }}
                  className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded"
                >
                  취소
                </button>
                <button
                  onClick={handleBulkAdd}
                  disabled={isSaving || parsePreview.length === 0}
                  className={`bg-blue-600 text-white px-6 py-2 rounded font-bold transition-all flex items-center gap-2 ${isSaving || parsePreview.length === 0 ? 'opacity-60 cursor-not-allowed' : 'hover:bg-blue-700'}`}
                >
                  {isSaving ? (
                    <><Loader2 size={18} className="animate-spin" /> 저장 중... ({uploadProgress}%)</>
                  ) : (
                    <><Save size={18} /> {parsePreview.length}명 등록하기</>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b flex justify-between items-center bg-gray-50/50">
          <div className="relative w-64">
            <Search className="absolute left-3 top-2.5 text-gray-400 font-bold" size={16} />
            <input
              placeholder="이름 검색..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10 pr-4 py-2 border rounded-full w-full text-sm outline-none focus:ring-2 focus:ring-[#1a3a6b]/20"
            />
          </div>
          <div className="flex gap-2">
            <button
               onClick={handleRefresh}
               disabled={isSaving}
               className={`text-sm bg-blue-600 text-white px-4 py-2 rounded flex items-center gap-2 transition ${isSaving ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-700'}`}
            >
              <RefreshCw size={16} className={isSaving ? 'animate-spin' : ''} /> 새로고침
            </button>
            {canEdit && (
              <button
                 onClick={handleManualSave}
                 disabled={isSaving}
                 className={`text-sm bg-green-600 text-white px-4 py-2 rounded flex items-center gap-2 transition ${isSaving ? 'opacity-50 cursor-not-allowed' : 'hover:bg-green-700'}`}
              >
                <Save size={16} /> {isSaving ? '저장 중...' : '저장'}
              </button>
            )}
            <button
              onClick={exportToExcel}
              className="text-sm bg-slate-600 text-white px-4 py-2 rounded flex items-center gap-2 hover:bg-slate-700 transition"
            >
              <Download size={16} /> 엑셀 저장
            </button>
          </div>
        </div>

        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-100 text-sm font-bold text-gray-600">
              <th className="p-4 w-12 text-center">#</th>
              <th className="p-4">이름</th>
              <th className="p-4">연락처</th>
              <th className="p-4">비상연락처</th>
              {canEdit && <th className="p-4 w-20 text-center">관리</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={canEdit ? 5 : 4} className="p-12 text-center text-gray-400 italic">
                  등록된 기사가 없습니다.
                </td>
              </tr>
            ) : (
              filtered.map((d, idx) => (
                <tr key={d.id} className="border-t hover:bg-gray-50/50 transition">
                  <td className="p-4 text-center text-gray-400 text-sm">{idx + 1}</td>
                  <td className="p-2">
                    <input
                      value={d.name}
                      readOnly={!canEdit}
                      onChange={e => handleUpdate(d.id, 'name', e.target.value)}
                      className={`w-full p-2 bg-transparent border-transparent rounded outline-none ${canEdit ? 'focus:bg-white focus:border-gray-200 border' : ''}`}
                    />
                  </td>
                  <td className="p-2">
                    <input
                      value={d.phone}
                      readOnly={!canEdit}
                      onChange={e => handleUpdate(d.id, 'phone', e.target.value)}
                      className={`w-full p-2 bg-transparent border-transparent rounded outline-none ${canEdit ? 'focus:bg-white focus:border-gray-200 border' : ''}`}
                    />
                  </td>
                  <td className="p-2">
                    <input
                      value={d.emergency}
                      readOnly={!canEdit}
                      onChange={e => handleUpdate(d.id, 'emergency', e.target.value)}
                      className={`w-full p-2 bg-transparent border-transparent rounded outline-none ${canEdit ? 'focus:bg-white focus:border-gray-200 border' : ''}`}
                    />
                  </td>
                  {canEdit && (
                    <td className="p-4 text-center">
                      <button
                        onClick={() => handleDelete(d.id)}
                        className="text-red-400 hover:text-red-600 p-2 transition"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
