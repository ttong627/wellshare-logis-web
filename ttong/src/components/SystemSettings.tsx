/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Download, Upload, Shield, AlertTriangle, RefreshCw, User as UserIcon, Users, ImageIcon } from 'lucide-react';
import { firebaseService } from '../lib/firebaseService';
import { useFirebase } from '../hooks/useFirebase';
import { useRole } from '../hooks/useRole';
import UserManager from './delivery/UserManager';
import GlobalImageManager from './delivery/GlobalImageManager';

export default function SystemSettings() {
  const { user } = useFirebase();
  const { isAdmin, canEdit } = useRole();
  const [activeSubTab, setActiveSubTab] = useState<'INFO' | 'USERS' | 'IMAGES'>('INFO');
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const handleExport = async () => {
    if (!user) return alert('로그인이 필요합니다.');
    if (!isAdmin) return alert('관리자 권한이 필요합니다.');
    if (!confirm('현재 서버의 모든 데이터를 JSON 파일로 백업하시겠습니까?')) return;

    try {
      setIsExporting(true);
      const data = await firebaseService.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `wellshare_backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      alert('백업 파일이 생성되었습니다.');
    } catch (err) {
      console.error('Export failed:', err);
      alert('백업 중 오류가 발생했습니다.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!confirm('주의: 백업 파일을 업로드하면 서버의 기존 데이터와 병합되거나 덮어씌워질 수 있습니다. 진행하시겠습니까?')) {
      e.target.value = '';
      return;
    }

    try {
      setIsImporting(true);
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const json = JSON.parse(event.target?.result as string);
          await firebaseService.importData(json);
          alert('데이터 복구가 완료되었습니다. 페이지를 새로고침하여 반영된 데이터를 확인하세요.');
          window.location.reload();
        } catch (err) {
          console.error('Parse/Import error:', err);
          alert('파일 형식이 잘못되었거나 복구 중 오류가 발생했습니다.');
        } finally {
          setIsImporting(false);
        }
      };
      reader.readAsText(file);
    } catch (err) {
      console.error('Import failed:', err);
      alert('파일 읽기 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4">
      {/* Tab Navigation */}
      {isAdmin && (
        <div className="flex bg-white p-1 rounded-xl shadow-sm border border-gray-200">
          <button 
            onClick={() => setActiveSubTab('INFO')}
            className={`flex-1 py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all ${
              activeSubTab === 'INFO' ? 'bg-[#1a3a6b] text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            <Shield size={18} /> 시스템 설정
          </button>
          <button 
            onClick={() => setActiveSubTab('USERS')}
            className={`flex-1 py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all relative ${
              activeSubTab === 'USERS' ? 'bg-[#1a3a6b] text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            <Users size={18} /> 사용자 관리
          </button>
          {canEdit && (
            <button 
              onClick={() => setActiveSubTab('IMAGES')}
              className={`flex-1 py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all relative ${
                activeSubTab === 'IMAGES' ? 'bg-[#1a3a6b] text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              <ImageIcon size={18} /> 이미지 관리
            </button>
          )}
        </div>
      )}

      {activeSubTab === 'USERS' && isAdmin ? (
        <UserManager />
      ) : activeSubTab === 'IMAGES' && canEdit ? (
        <GlobalImageManager />
      ) : (
        <>
          {/* User Section */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="bg-[#1a3a6b]/5 px-6 py-4 border-b border-gray-200 flex items-center gap-3">
          <UserIcon className="text-[#1a3a6b]" size={20} />
          <h2 className="text-lg font-bold text-[#1a3a6b]">계정 정보</h2>
        </div>
        <div className="p-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center text-[#1a3a6b] font-bold text-2xl">
              {user?.email?.[0].toUpperCase() || 'U'}
            </div>
            <div>
              <div className="font-bold text-gray-900">{user?.displayName || '사용자'}</div>
              <div className="text-sm text-gray-500">{user?.email}</div>
              <div className="mt-1">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                  인증된 사용자
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Backup Section */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="bg-[#1a3a6b]/5 px-6 py-4 border-b border-gray-200 flex items-center gap-3">
          <Shield className="text-[#1a3a6b]" size={20} />
          <h2 className="text-lg font-bold text-[#1a3a6b]">데이터 관리 및 보안</h2>
        </div>
        <div className="p-6 space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Export */}
            <div className="p-5 border rounded-xl bg-gray-50 hover:border-blue-200 transition group">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                  <Download size={20} />
                </div>
                <div className="font-bold">데이터 백업</div>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                서버에 저장된 모든 데이터(기사, 일정, 공문 내역 등)를 JSON 파일로 다운로드합니다.
              </p>
              <button
                onClick={handleExport}
                disabled={isExporting}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-white border border-gray-200 rounded-lg text-sm font-bold text-gray-700 hover:bg-gray-50 hover:border-blue-400 transition"
              >
                {isExporting ? <RefreshCw className="animate-spin" size={16} /> : <Download size={16} />}
                백업 생성 (Export)
              </button>
            </div>

            {/* Import */}
            <div className="p-5 border rounded-xl bg-gray-50 hover:border-orange-200 transition group">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-orange-100 text-orange-600 rounded-lg">
                  <Upload size={20} />
                </div>
                <div className="font-bold">데이터 복구</div>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                이전에 백업된 JSON 파일을 서버에 업로드하여 데이터를 복구합니다.
              </p>
              <label className="w-full flex items-center justify-center gap-2 py-2.5 bg-white border border-gray-200 rounded-lg text-sm font-bold text-gray-700 hover:bg-gray-50 hover:border-orange-400 transition cursor-pointer">
                {isImporting ? <RefreshCw className="animate-spin" size={16} /> : <Upload size={16} />}
                백업 파일 업로드 (Import)
                <input type="file" accept=".json" onChange={handleImport} className="hidden" disabled={isImporting} />
              </label>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex gap-3 text-amber-800">
            <AlertTriangle className="flex-shrink-0" size={20} />
            <div className="text-sm">
              <p className="font-bold mb-1">주의사항</p>
              <ul className="list-disc list-inside space-y-1 opacity-90">
                <li>데이터 복구 시 동일한 ID를 가진 데이터는 덮어씌워집니다.</li>
                <li>대량의 데이터를 복구할 때는 네트워크 환경에 따라 시간이 소요될 수 있습니다.</li>
                <li>정기적인 백업을 통해 소중한 데이터를 안전하게 보관하세요.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Structure Information */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="bg-[#1a3a6b]/5 px-6 py-4 border-b border-gray-200 flex items-center gap-3">
          <RefreshCw className="text-[#1a3a6b]" size={20} />
          <h2 className="text-lg font-bold text-[#1a3a6b]">시스템 동기화 구조</h2>
        </div>
        <div className="p-6">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 mt-2 rounded-full bg-blue-500" />
              <div>
                <div className="font-bold text-gray-900 text-sm">실시간 동기화</div>
                <p className="text-xs text-gray-500">Firebase Real-time Listener를 사용하여 한 곳에서 수정한 내용이 모든 기기에서 즉시 반영됩니다.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 mt-2 rounded-full bg-green-500" />
              <div>
                <div className="font-bold text-gray-900 text-sm">중앙 집중형 공유 데이터</div>
                <p className="text-xs text-gray-500">모든 담당자가 동일한 기사 목록, 배송 일정, 설정을 공유하여 실시간으로 협업할 수 있습니다.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 mt-2 rounded-full bg-purple-500" />
              <div>
                <div className="font-bold text-gray-900 text-sm">모듈별 독립 저장소</div>
                <p className="text-xs text-gray-500 text-pretty">기사 관리, 배송 일정, 공문 내역은 각각 독립된 Firestore 컬렉션에 저장되어 관리 효율성을 높였습니다.</p>
              </div>
            </div>
          </div>
        </div>
      </section>
        </>
      )}
    </div>
  );
}
