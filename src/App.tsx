import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import Navbar, { TabId } from './components/layout/Navbar';
import Toast from './components/layout/Toast';
import WorkflowGuide from './components/layout/WorkflowGuide';
import ConflictModal from './components/layout/ConflictModal';
import LoginForm from './components/auth/LoginForm';
import ErrorBoundary from './components/ErrorBoundary';
import InstallPWAButton from './components/InstallPWAButton';

// Tab components — 코드 스플리팅(탭별 청크 분리로 초기 번들 축소)
const ProfileTab = lazy(() => import('./components/tabs/ProfileTab'));
const AccountTab = lazy(() => import('./components/tabs/AccountTab'));
const PricesTab = lazy(() => import('./components/tabs/PricesTab'));
const OrdersTab = lazy(() => import('./components/tabs/OrdersTab'));
const PerformanceTab = lazy(() => import('./components/tabs/PerformanceTab'));
const DeliveryCompletionTab = lazy(() => import('./components/tabs/DeliveryCompletionTab'));
const BillingTab = lazy(() => import('./components/tabs/BillingTab'));
const PaymentTab = lazy(() => import('./components/tabs/PaymentTab'));
const PartnerBillingTab = lazy(() => import('./components/tabs/PartnerBillingTab'));
const StatisticsTab = lazy(() => import('./components/tabs/StatisticsTab'));
const ContactsTab = lazy(() => import('./components/tabs/ContactsTab'));
const UsersTab = lazy(() => import('./components/tabs/UsersTab'));
const BackupTab = lazy(() => import('./components/tabs/BackupTab'));
const ScheduleTab = lazy(() => import('./components/tabs/ScheduleTab'));
const DocsTab = lazy(() => import('./components/tabs/DocsTab'));
const RosterTab = lazy(() => import('./components/tabs/RosterTab'));

declare global {
  interface Window { XLSX: any; }
}

function AppContent() {
  const {
    user, isAdmin, partnerCompany, authLoading, isDbLoaded,
    pendingUsers, partnerAccountsDB, signOut,
    currentMonth, setCurrentMonth, savedMonths, isClosed,
    myNotifications, clearMyNotifications,
    toastMessage,
    handleToggleClose,
  } = useApp();

  const [activeTab, setActiveTab] = useState<TabId>('orders');
  const [showWorkflowGuide, setShowWorkflowGuide] = useState(false);
  const [loginCount, setLoginCount] = useState(0);
  const [resolvingRegion, setResolvingRegion] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  // Prevents default-tab routing from firing again on Firestore re-snapshots
  const [hasRouted, setHasRouted] = useState(false);

  // Load XLSX script once
  useEffect(() => {
    if (window.XLSX) return;
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    script.async = true;
    document.head.appendChild(script);
  }, []);

  // Reset routing flag on logout
  useEffect(() => {
    if (!user) setHasRouted(false);
  }, [user]);

  // Route to appropriate default tab once per login
  useEffect(() => {
    if (!user || !isDbLoaded || hasRouted) return;
    if (isAdmin) { setActiveTab('orders'); setHasRouted(true); }
    else if (partnerCompany) { setActiveTab('performance'); setHasRouted(true); }
  }, [isAdmin, partnerCompany, isDbLoaded, user, hasRouted]);

  // Show workflow guide once after login data loads
  useEffect(() => {
    if (!user || !isDbLoaded || hasRouted) return;
    const count = parseInt(localStorage.getItem('loginCount') || '0', 10) + 1;
    setLoginCount(count);
    localStorage.setItem('loginCount', String(count));
    const hide = localStorage.getItem('hideWorkflowGuide') === 'true';
    if (!hide) setShowWorkflowGuide(true);
  }, [user, isDbLoaded, hasRouted]);

  const handleReload = useCallback(() => {
    window.location.reload();
  }, []);

  const validPendingUsers = pendingUsers.filter(email => !partnerAccountsDB[email]);

  // ─── Auth states ─────────────────────────────────────────────────────
  const loadingScreen = (icon: string, msg: string, spin = false) => (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      <div className="glass rounded-3xl p-12 text-center max-w-sm mx-4 relative z-10 anim-in">
        <div className={`text-6xl mb-5 ${spin ? 'animate-spin' : 'animate-pulse'}`}>{icon}</div>
        <div className="w-12 h-1 rounded-full mx-auto mb-4"
          style={{ background: 'linear-gradient(90deg,#18A8D8,#5CCBEE)' }} />
        <p className="text-sky-700 font-black text-lg">{msg}</p>
      </div>
    </div>
  );

  if (authLoading) return loadingScreen('💧', '시스템 초기화 중...', true);

  if (!user) {
    if (pendingEmail) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
          <div className="glass rounded-3xl p-10 max-w-md w-full text-center relative z-10 anim-in">
            <div className="text-5xl mb-5">⏳</div>
            <h2 className="text-xl font-black text-sky-800 mb-3">승인 대기 중</h2>
            <p className="text-sky-600 font-bold text-sm mb-2">
              <span className="text-sky-500">{pendingEmail}</span> 계정이 생성되었습니다.
            </p>
            <p className="text-sky-400 text-xs mb-8">관리자 승인 후 로그인이 가능합니다. 잠시 기다려 주세요.</p>
            <button onClick={() => setPendingEmail(null)}
              className="btn-sky w-full py-3 px-6 rounded-2xl text-sm">
              로그인 화면으로 돌아가기
            </button>
          </div>
        </div>
      );
    }
    return <LoginForm onPendingRegistered={(email) => setPendingEmail(email)} />;
  }

  if (!isDbLoaded) return loadingScreen('🌊', '데이터 로딩 중...');

  if (!isAdmin && !partnerCompany) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
        <div className="glass rounded-3xl p-10 max-w-md w-full text-center relative z-10 anim-in">
          <div className="text-5xl mb-5">🔐</div>
          <h2 className="text-xl font-black text-sky-800 mb-3">접근 권한 없음</h2>
          <p className="text-sky-600 font-bold text-sm mb-2">
            <span className="text-sky-500">{user.email}</span> 계정은 아직 승인되지 않았습니다.
          </p>
          <p className="text-sky-400 text-xs mb-8">관리자에게 계정 승인을 요청해 주세요.</p>
          <button onClick={signOut} className="btn-sky w-full py-3 px-6 rounded-2xl text-sm">
            로그아웃
          </button>
        </div>
      </div>
    );
  }

  // ─── Main App ──────────────────────────────────────────────────────
  const renderTab = () => {
    switch (activeTab) {
      case 'profile': return <ProfileTab />;
      case 'account': return <AccountTab />;
      case 'prices': return <PricesTab />;
      case 'orders': return <OrdersTab onOpenConflict={setResolvingRegion} />;
      case 'performance': return <PerformanceTab />;
      case 'delivery': return <DeliveryCompletionTab />;
      case 'billing': return <BillingTab />;
      case 'payment': return <PaymentTab />;
      case 'partner_billing': return <PartnerBillingTab />;
      case 'roster': return <RosterTab />;
      case 'statistics': return <StatisticsTab />;
      case 'contacts': return <ContactsTab />;
      case 'users': return <UsersTab />;
      case 'backup': return <BackupTab />;

      case 'schedule': return <ScheduleTab />;
      case 'docs': return <DocsTab />;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen font-sans relative">
      <div className="relative z-10 py-4 sm:py-6 px-2 sm:px-4">
        <Navbar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isAdmin={isAdmin}
          partnerCompany={partnerCompany}
          user={{ email: user.email }}
          isClosed={isClosed}
          currentMonth={currentMonth}
          setCurrentMonth={setCurrentMonth}
          savedMonths={savedMonths}
          onReload={handleReload}
          onToggleClose={handleToggleClose}
          onShowGuide={() => setShowWorkflowGuide(true)}
          notifications={myNotifications}
          onClearNotifications={clearMyNotifications}
          validPendingUsers={validPendingUsers}
          onSignOut={signOut}
        />

        <div className="max-w-[1400px] mx-auto px-2 sm:px-4">
          <ErrorBoundary fallback="탭 로딩 중 오류가 발생했습니다. 다시 시도해주세요.">
            <Suspense fallback={<div className="text-center py-20 text-sky-400 font-bold text-sm anim-in">불러오는 중…</div>}>
              {renderTab()}
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>

      <Toast message={toastMessage} />

      {showWorkflowGuide && (
        <WorkflowGuide
          loginCount={loginCount}
          onClose={() => setShowWorkflowGuide(false)}
        />
      )}

      {resolvingRegion && (
        <ConflictModal
          resolvingRegion={resolvingRegion}
          onClose={() => setResolvingRegion(null)}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
      <InstallPWAButton />
    </AppProvider>
  );
}
