/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FileText, Truck, LogIn, LogOut, User as UserIcon, Settings } from 'lucide-react';
import OfficialDocTab from './components/OfficialDocTab';
import DeliveryTab from './components/DeliveryTab';
import SystemSettings from './components/SystemSettings';
import { storage } from './lib/storage';
import { firebaseService } from './lib/firebaseService';
import { FirebaseProvider } from './lib/FirebaseContext';
import { useFirebase } from './hooks/useFirebase';
import { UserStatus } from './types';

enum MainTab {
  DOC = 'DOC',
  DELIVERY = 'DELIVERY',
  SETTINGS = 'SETTINGS'
}

function AppContent() {
  const [activeTab, setActiveTab] = useState<MainTab>(() => {
    return storage.get('activeMainTab') || MainTab.DOC;
  });
  const { user, login, logout, loading, userProfile, userLoading } = useFirebase();

  useEffect(() => {
    storage.set('activeMainTab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (user) {
      firebaseService.migrateDataV2();
    }
  }, [user]);

  if (loading || userLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#1a3a6b]"></div>
          <p className="text-sm text-gray-500 font-medium">사용자 정보를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  // Handle Unauthenticated or Pending/Disabled states
  if (user && userProfile) {
    if (userProfile.status === UserStatus.PENDING) {
      return (
        <div className="min-h-screen bg-[#0d2142] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[#1a3a6b] p-8 rounded-2xl shadow-2xl max-w-md w-full text-center border border-blue-400/30"
          >
            <div className="inline-flex p-4 rounded-full bg-blue-500/20 text-blue-300 mb-6 font-bold text-2xl">
               🕒
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">접근 대기 중</h1>
            <p className="text-blue-100 mb-6 leading-relaxed">
              관리자에게 접근 권한을 요청하세요.<br/>
              <span className="text-xs text-blue-300 mt-2 block">관리자 이메일: ttong627@gmail.com</span>
            </p>
            <button 
              onClick={logout}
              className="w-full py-3 bg-red-500 hover:bg-red-400 text-white rounded-lg font-bold transition-all flex items-center justify-center gap-2"
            >
              <LogOut size={18} /> 로그아웃
            </button>
          </motion.div>
        </div>
      );
    }

    if (userProfile.status === UserStatus.DISABLED) {
      return (
        <div className="min-h-screen bg-red-950 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#1a3a6b] p-8 rounded-2xl shadow-2xl max-w-md w-full text-center border border-red-500/30"
          >
            <div className="inline-flex p-4 rounded-full bg-red-500/20 text-red-300 mb-6 font-bold text-2xl">
               🚫
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">접근 비활성화</h1>
            <p className="text-red-100 mb-6 leading-relaxed">
              접근이 비활성화된 계정입니다.<br/>
              관리자에게 문의하시기 바랍니다.
            </p>
            <button 
              onClick={logout}
              className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-bold transition-all"
            >
              로그아웃
            </button>
          </motion.div>
        </div>
      );
    }
  }

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900 overflow-x-hidden">
      {/* Header Tabs */}
      <nav className="bg-[#1a3a6b] text-white shadow-md fixed top-0 left-0 right-0 z-50 no-print">
        <div className="max-w-7xl mx-auto flex items-center h-16 px-4">
          <div className="flex flex-1 h-full font-bold">
            <button
              id="tab-doc"
              onClick={() => setActiveTab(MainTab.DOC)}
              className={`flex-1 py-4 flex items-center justify-center gap-2 transition-all border-b-4 h-full ${
                activeTab === MainTab.DOC ? 'border-white bg-[#244b8a]' : 'border-transparent hover:bg-[#1e447d]'
              }`}
            >
              <FileText size={20} />
              <span className="tracking-wide">📋 공문 작성</span>
            </button>
            <button
              id="tab-delivery"
              onClick={() => setActiveTab(MainTab.DELIVERY)}
              className={`flex-1 py-4 flex items-center justify-center gap-2 transition-all border-b-4 h-full ${
                activeTab === MainTab.DELIVERY ? 'border-white bg-[#244b8a]' : 'border-transparent hover:bg-[#1e447d]'
              }`}
            >
              <Truck size={20} />
              <span className="tracking-wide">🚚 배송일정</span>
            </button>
            <button
              id="tab-settings"
              onClick={() => setActiveTab(MainTab.SETTINGS)}
              className={`flex-1 py-4 flex items-center justify-center gap-2 transition-all border-b-4 h-full ${
                activeTab === MainTab.SETTINGS ? 'border-white bg-[#244b8a]' : 'border-transparent hover:bg-[#1e447d]'
              }`}
            >
              <Settings size={20} />
              <span className="tracking-wide">⚙️ 설정</span>
            </button>
          </div>
          
          <div className="flex items-center gap-4 ml-8">
            {user ? (
              <div className="flex items-center gap-3 bg-[#244b8a] px-3 py-1.5 rounded-full border border-white/20">
                {user.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName || ''} className="w-6 h-6 rounded-full" />
                ) : (
                  <UserIcon size={16} />
                )}
                <div className="flex flex-col items-start leading-tight hidden sm:flex">
                  <span className="text-xs font-bold text-blue-300">
                    {userProfile?.role === 'ROLE_ADMIN' ? '관리자' : userProfile?.role === 'ROLE_EDITOR' ? '편집자' : '뷰어'}
                  </span>
                  <span className="text-sm font-medium">{user.displayName}</span>
                </div>
                <button 
                  onClick={logout}
                  className="hover:text-red-300 transition-colors p-1"
                  title="로그아웃"
                >
                  <LogOut size={18} />
                </button>
              </div>
            ) : (
              <button 
                onClick={login}
                className="flex items-center gap-2 bg-white text-[#1a3a6b] px-4 py-1.5 rounded-full font-bold hover:bg-gray-100 transition-all text-sm"
              >
                <LogIn size={18} />
                로그인하여 데이터 동기화
              </button>
            )}
          </div>
        </div>
      </nav>

      <main className="max-w-full mx-auto pt-20">
        <AnimatePresence mode="wait">
          {activeTab === MainTab.DOC ? (
            <motion.div
              key="doc-tab"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
            >
              <OfficialDocTab />
            </motion.div>
          ) : activeTab === MainTab.DELIVERY ? (
            <motion.div
              key="delivery-tab"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <DeliveryTab />
            </motion.div>
          ) : (
            <motion.div
              key="settings-tab"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
              className="px-4 py-6"
            >
              <SystemSettings />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

    </div>
  );
}

export default function App() {
  return (
    <FirebaseProvider>
      <AppContent />
    </FirebaseProvider>
  );
}

