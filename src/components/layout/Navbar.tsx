import React, { useState, useRef, useEffect } from 'react';
import {
  LayoutDashboard, User, Settings, Truck, PenTool, CheckSquare,
  FileSignature, CreditCard, ReceiptText, Contact, ShieldCheck,
  DatabaseBackup, HelpCircle, FileText, Calendar, LogOut,
  Bell, Users, ChevronLeft, ChevronRight, BarChart3,
  ClipboardList, Lock, Unlock, FolderOpen, RotateCw,
} from 'lucide-react';
import { Notification } from '../../types';
import { safeRender } from '../../lib/utils';
import { useConfirm } from '../shared/useConfirm';
import { APP_VERSION } from '../../constants/version';

export type TabId =
  | 'profile' | 'account' | 'prices' | 'orders' | 'performance'
  | 'delivery' | 'billing' | 'payment' | 'partner_billing'
  | 'statistics' | 'contacts' | 'users' | 'backup' | 'schedule' | 'docs' | 'roster';

interface Tab { id: TabId; label: string; icon: React.ReactNode; visible: boolean; inGear?: boolean; }

interface NavbarProps {
  activeTab: TabId; setActiveTab: (tab: TabId) => void;
  isAdmin: boolean; partnerCompany: string | null; user: { email: string | null };
  isClosed: boolean; currentMonth: string; setCurrentMonth: (m: string) => void;
  savedMonths: string[]; onReload: () => void; onToggleClose: () => void;
  onShowGuide: () => void; notifications: Notification[]; onClearNotifications: () => void;
  validPendingUsers: string[]; onSignOut: () => void;
}

export default function Navbar({
  activeTab, setActiveTab, isAdmin, partnerCompany, user,
  isClosed, currentMonth, setCurrentMonth, savedMonths, onReload,
  onToggleClose, onShowGuide, notifications, onClearNotifications,
  validPendingUsers, onSignOut,
}: NavbarProps) {
  const [showNoti, setShowNoti] = useState(false);
  const [isGearOpen, setIsGearOpen] = useState(false);
  const { confirm, dialog } = useConfirm();
  const tabNavRef = useRef<HTMLElement | null>(null);
  const activeTabRef = useRef<HTMLButtonElement | null>(null);

  // 폰에서는 탭이 가로로 잘려 보인다 — 선택된 탭을 항상 화면 안으로 끌어와
  // "지금 어느 메뉴인지" 보이게 하고, 다음 탭으로 넘기기 쉽게 한다.
  useEffect(() => {
    const btn = activeTabRef.current;
    const nav = tabNavRef.current;
    if (!btn || !nav) return;
    const b = btn.getBoundingClientRect();
    const n = nav.getBoundingClientRect();
    if (b.left < n.left + 8 || b.right > n.right - 8) {
      nav.scrollTo({ left: btn.offsetLeft - nav.clientWidth / 2 + btn.clientWidth / 2, behavior: 'smooth' });
    }
  }, [activeTab]);

  // 마감 전에도 다음 달 작업이 가능하도록 — 관리자·회원사 모두 한 달 단위로 이동
  const shiftMonth = (m: string, delta: number) => {
    const [y, mo] = m.split('-').map(Number);
    const d = new Date(y, mo - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  const ALL_TABS: Tab[] = [
    { id: 'profile',        label: '내 정보',   icon: <LayoutDashboard size={16} />, visible: !isAdmin && partnerCompany !== null },
    { id: 'orders',         label: '포수입력',   icon: <Truck size={16} />,           visible: isAdmin },
    { id: 'performance',    label: '지역포수',   icon: <PenTool size={16} />,          visible: isAdmin || partnerCompany !== null },
    { id: 'delivery',       label: '배송완료',   icon: <CheckSquare size={16} />,      visible: isAdmin || partnerCompany !== null },
    { id: 'billing',        label: '계산서발급', icon: <FileSignature size={16} />,    visible: isAdmin },
    { id: 'payment',        label: '결제내역',   icon: <CreditCard size={16} />,       visible: isAdmin },
    { id: 'partner_billing',label: '내역확인',   icon: <ReceiptText size={16} />,      visible: isAdmin || partnerCompany !== null },
    { id: 'roster',         label: '명단',       icon: <ClipboardList size={16} />,    visible: isAdmin || partnerCompany !== null },
    { id: 'statistics',     label: '통계자료',   icon: <BarChart3 size={16} />,        visible: isAdmin || partnerCompany !== null },
    { id: 'schedule',       label: '배송일정',   icon: <Calendar size={16} />,         visible: true },
    { id: 'docs',           label: '공문작성',   icon: <FileText size={16} />,          visible: isAdmin },
    { id: 'contacts',       label: '주소록',     icon: <Contact size={16} />,           visible: isAdmin },
    { id: 'account',        label: '계정관리',   icon: <User size={16} />,              visible: true, inGear: true },
    { id: 'prices',         label: '단가관리',   icon: <Settings size={16} />,          visible: isAdmin, inGear: true },
    { id: 'users',          label: '권한관리',   icon: <ShieldCheck size={16} />,       visible: isAdmin, inGear: true },
    { id: 'backup',         label: '백업/복원',  icon: <DatabaseBackup size={16} />,    visible: isAdmin, inGear: true },
  ];

  const mainTabs = ALL_TABS.filter(t => !t.inGear && t.visible);
  const gearTabs = ALL_TABS.filter(t => t.inGear && t.visible);

  // ⚠️ 최상위 래퍼를 두지 않는다(Fragment).
  //    sticky 요소는 "부모의 높이 안에서만" 고정된다 — 래퍼가 헤더 높이(200px)뿐이면
  //    탭바도 그만큼만 붙어 있다가 풀린다. App의 본문 컨테이너를 부모로 삼아야
  //    페이지 끝까지 상단에 고정된다.
  return (
    <>
      {/* ── Hero header bar ─────────────────────────────── */}
      <div
        className="ws-grad relative z-[2000] rounded-2xl sm:rounded-3xl mb-2 overflow-visible"
        style={{ boxShadow: '0 10px 30px rgba(110,48,9,.30), 0 2px 10px rgba(58,29,11,.10)' }}
      >
        {/* 한가위 밤 파노라마 — 장식 레이어(클릭 통과·모서리 자체 클리핑, 본문은 z-[1] 위) */}
        <div className="nav-scene" aria-hidden="true">
          <div className="nav-night" />
          <div className="nav-moon" />
          <div className="nav-cloud nav-cloud-a" />
          <div className="nav-cloud nav-cloud-b" />
          <svg className="nav-ridge" viewBox="0 0 1200 96" preserveAspectRatio="none">
            {/* 먼 산 — 달빛에 젖은 능선 */}
            <path d="M0,96 L0,74 Q160,52 330,70 T680,66 T1000,76 T1200,62 L1200,96 Z" fill="rgba(38,18,6,.34)" />
            {/* 가까운 능선 */}
            <path d="M0,96 L0,84 Q220,66 460,80 T900,78 T1200,84 L1200,96 Z" fill="rgba(26,12,4,.48)" />
            {/* 억새 — 좌우 무리, 이삭이 달빛을 받는다 */}
            <g stroke="rgba(58,29,11,.75)" strokeWidth="1.6" fill="none" strokeLinecap="round">
              <path d="M46,96 Q44,74 40,62" /><path d="M58,96 Q58,70 62,58" /><path d="M72,96 Q70,76 66,66" />
              <path d="M1116,96 Q1114,72 1108,60" /><path d="M1130,96 Q1132,70 1136,56" /><path d="M1146,96 Q1144,76 1140,64" />
            </g>
            <g fill="rgba(233,196,138,.9)">
              <ellipse cx="40" cy="59" rx="3.4" ry="7" transform="rotate(-14 40 59)" />
              <ellipse cx="62" cy="55" rx="3.2" ry="7" transform="rotate(10 62 55)" />
              <ellipse cx="66" cy="63" rx="3" ry="6" transform="rotate(-8 66 63)" />
              <ellipse cx="1108" cy="57" rx="3.4" ry="7" transform="rotate(-12 1108 57)" />
              <ellipse cx="1136" cy="53" rx="3.2" ry="7" transform="rotate(12 1136 53)" />
              <ellipse cx="1140" cy="61" rx="3" ry="6" transform="rotate(-6 1140 61)" />
            </g>
            {/* 기러기 세 마리 */}
            <g stroke="rgba(30,16,8,.7)" strokeWidth="1.4" fill="none" strokeLinecap="round">
              <path d="M760,26 q5,-5 10,0 q5,-5 10,0" />
              <path d="M786,18 q4,-4 8,0 q4,-4 8,0" />
              <path d="M806,30 q4,-4 8,0 q4,-4 8,0" />
            </g>
          </svg>
          <span className="nav-leaf fall-maple" /><span className="nav-leaf fall-ginkgo" /><span className="nav-leaf fall-oak" />
          <span className="nav-leaf fall-maple" /><span className="nav-leaf fall-ginkgo" /><span className="nav-leaf fall-maple" />
        </div>

        {/* Top moonlight-shine line */}
        <div className="relative z-[1]" style={{ height: 2, background: 'linear-gradient(90deg, transparent, rgba(255,240,200,.65), transparent)' }} />

        <div className="relative z-[1] flex flex-col lg:flex-row lg:items-center justify-between gap-2 px-4 sm:px-6 py-2.5 sm:py-3">

          {/* Logo + Title */}
          <div className="flex items-center gap-3">
            {/* Logo bubble */}
            <div
              className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center shrink-0"
              style={{
                background: 'rgba(255,255,255,.18)',
                border: '1.5px solid rgba(255,255,255,.38)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,.5), 0 4px 12px rgba(0,0,0,.15)',
                backdropFilter: 'blur(8px)',
              }}
            >
              <img src="/logo.png" alt="logo" className="w-7 h-7 sm:w-9 sm:h-9 object-contain"
                onError={e => (e.currentTarget.style.display = 'none')} />
            </div>
            <div>
              <div className="text-sky-200 text-[9px] sm:text-[10px] font-bold tracking-widest uppercase mb-0.5">
                (주)웰쉐어로지스 정산 System
              </div>
              <h1 className="text-white text-lg sm:text-2xl font-black tracking-tight flex items-end gap-2"
                style={{ textShadow: '0 2px 8px rgba(0,0,0,.2)' }}>
                나라미 정산포털
                <span className="text-sky-200/90 text-[10px] sm:text-xs font-bold tracking-wider pb-0.5 sm:pb-1">v{APP_VERSION}</span>
              </h1>
            </div>
          </div>

          {/* User info + actions */}
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-end">

            {/* User card */}
            <div
              className="flex items-center gap-3 px-4 py-2.5 rounded-2xl"
              style={{
                background: 'rgba(255,255,255,.15)',
                border: '1px solid rgba(255,255,255,.25)',
                backdropFilter: 'blur(8px)',
              }}
            >
              <div className="text-right">
                <div className="text-sky-100 text-[9px] sm:text-[10px] font-bold truncate max-w-[160px]">
                  {safeRender(user.email)}
                </div>
                <div className="text-white text-[11px] sm:text-xs font-black">
                  {isAdmin ? '최고 관리자 (본사)' : safeRender(partnerCompany)}
                </div>
              </div>
              <span
                className="text-[9px] sm:text-[10px] font-black px-2 py-0.5 rounded-lg whitespace-nowrap"
                style={{
                  background: isAdmin ? 'rgba(255,255,255,.22)' : 'rgba(52,211,153,.3)',
                  border: `1px solid ${isAdmin ? 'rgba(255,255,255,.3)' : 'rgba(52,211,153,.5)'}`,
                  color: 'white',
                }}
              >
                {isAdmin ? '관리자' : '파트너'}
              </span>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1.5">
              {/* Guide */}
              <button onClick={onShowGuide} title="사용 안내"
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-all"
                style={{ background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.25)' }}
                onMouseOver={e => (e.currentTarget.style.background = 'rgba(255,255,255,.28)')}
                onMouseOut={e => (e.currentTarget.style.background = 'rgba(255,255,255,.15)')}
              >
                <HelpCircle size={18} className="text-white" />
              </button>

              {/* Notifications */}
              <div className="relative z-[3000]">
                <button onClick={() => setShowNoti(p => !p)} title="알림"
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-all relative"
                  style={{ background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.25)' }}
                  onMouseOver={e => (e.currentTarget.style.background = 'rgba(255,255,255,.28)')}
                  onMouseOut={e => (e.currentTarget.style.background = 'rgba(255,255,255,.15)')}
                >
                  <Bell size={18} className="text-white" />
                  {notifications.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center animate-bounce">
                      {notifications.length}
                    </span>
                  )}
                </button>
                {showNoti && (
                  <div className="glass absolute right-0 top-full mt-2 w-72 sm:w-80 rounded-2xl z-[100000] overflow-hidden shadow-2xl">
                    <div className="px-4 py-2.5 flex justify-between items-center border-b border-sky-100">
                      <span className="text-xs font-black text-sky-700">실시간 알림</span>
                      <button
                        onClick={async () => {
                          if (await confirm({ title: '알림 모두 읽음', message: '표시된 알림을 모두 읽음 처리합니다.', confirmText: '모두 읽음' })) {
                            onClearNotifications();
                            setShowNoti(false);
                          }
                        }}
                        className="text-[10px] font-bold text-sky-600 hover:text-sky-800 bg-sky-50 hover:bg-sky-100 px-2 py-1 rounded-lg border border-sky-200 transition-colors">
                        모두 읽음
                      </button>
                    </div>
                    <div className="max-h-60 overflow-y-auto p-2 space-y-1.5">
                      {notifications.length === 0 ? (
                        <div className="text-center text-slate-400 py-6 text-xs font-bold">새로운 알림이 없습니다.</div>
                      ) : notifications.map(n => (
                        <div key={n.id} className="p-3 bg-sky-50 rounded-xl border border-sky-100 text-xs">
                          <span className="block text-[9px] text-slate-400 mb-1 font-bold">{new Date(n.timestamp).toLocaleString()}</span>
                          <span className="font-bold text-sky-900">{safeRender(n.message)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {dialog}
              </div>

              {/* Pending users */}
              {isAdmin && validPendingUsers.length > 0 && (
                <button onClick={() => setActiveTab('users')} title="승인 대기"
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-all relative"
                  style={{ background: 'rgba(251,146,60,.25)', border: '1px solid rgba(251,146,60,.4)' }}>
                  <Users size={18} className="text-orange-200" />
                  <span className="absolute -top-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center animate-bounce">
                    {validPendingUsers.length}
                  </span>
                </button>
              )}

              {/* Logout */}
              <button onClick={onSignOut} title="로그아웃"
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-all"
                style={{ background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.2)' }}
                onMouseOver={e => (e.currentTarget.style.background = 'rgba(239,68,68,.3)')}
                onMouseOut={e => (e.currentTarget.style.background = 'rgba(255,255,255,.1)')}
              >
                <LogOut size={18} className="text-white" />
              </button>
            </div>
          </div>
        </div>

        {/* Bottom shine */}
        <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.25), transparent)' }} />
      </div>

      {/* ── Month + Close bar ────────────────────────────── */}
      <div className="glass relative z-10 rounded-2xl px-3 sm:px-4 py-2 mb-2 flex flex-col sm:flex-row justify-between items-center gap-2">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {isAdmin && (
            <button
              onClick={onToggleClose}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all whitespace-nowrap ${
                isClosed
                  ? 'bg-red-500 hover:bg-red-600 text-white shadow-md'
                  : 'bg-sky-100 hover:bg-sky-200 text-sky-700 border border-sky-200'
              }`}
            >
              {isClosed
                ? <><Unlock size={15} aria-hidden="true" /> 마감해제</>
                : <><Lock size={15} aria-hidden="true" /> 마감하기</>}
            </button>
          )}
          {isClosed && (
            <span className="bg-red-50 text-red-600 border border-red-200 px-3 py-2 rounded-xl font-black text-sm flex items-center gap-1.5 whitespace-nowrap">
              <Lock size={15} aria-hidden="true" /> 마감완료
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 justify-end w-full sm:w-auto">
          {/* Month picker + 이전/다음 달 이동 (마감 전에도 다음 달 작업 가능 — 모두 허용) */}
          <div className="flex items-center gap-1 bg-sky-50 border border-sky-200 pl-1.5 pr-2 py-1.5 rounded-xl">
            <button
              onClick={() => setCurrentMonth(shiftMonth(currentMonth, -1))}
              title="이전 달"
              className="w-7 h-7 flex items-center justify-center rounded-lg text-sky-600 hover:bg-sky-100 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <Calendar size={16} className="text-sky-600 shrink-0" aria-hidden="true" />
            <input
              type="month" value={currentMonth} aria-label="정산 월 선택"
              onChange={e => setCurrentMonth(e.target.value)}
              disabled={!isAdmin}
              className="border-none bg-transparent font-black text-sky-800 outline-none cursor-pointer text-sm w-24 sm:w-auto p-0"
            />
            <button
              onClick={() => setCurrentMonth(shiftMonth(currentMonth, 1))}
              title="다음 달로 이동"
              className="flex items-center gap-0.5 h-7 pl-2 pr-1.5 rounded-lg text-sky-700 bg-sky-100 hover:bg-sky-200 font-bold text-xs transition-colors whitespace-nowrap"
            >
              다음 달<ChevronRight size={14} />
            </button>
          </div>
          {/* Saved months */}
          <div className="flex items-center gap-1.5 bg-sky-50 border border-sky-200 px-3 py-2 rounded-xl">
            <FolderOpen size={16} className="text-sky-600 shrink-0" aria-hidden="true" />
            <select
              value="" onChange={e => setCurrentMonth(e.target.value)} aria-label="저장된 정산월 열기"
              className="border-none bg-transparent outline-none cursor-pointer text-sky-700 text-sm font-bold focus:ring-0 w-24 sm:w-32 p-0"
            >
              <option value="" disabled>열기</option>
              {savedMonths.map(m => <option key={m} value={m}>{safeRender(m)} 정산분</option>)}
            </select>
            <button onClick={onReload} aria-label="데이터 새로고침" title="새로고침"
              className="w-7 h-7 flex items-center justify-center rounded-lg text-sky-600 hover:bg-sky-100 transition-colors">
              <RotateCw size={15} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Main tab bar ───────────────────────────────────
          sticky: 스크롤을 내려도 탭이 화면 상단에 붙어 있어 메뉴 이동이 한 번에 된다.
          z-[2500] = 히어로(2000)보다 위 · 알림 드롭다운(3000+)보다 아래. */}
      <div className="glass ws-sticky z-[2500] rounded-2xl p-1.5 mb-3">
        <nav ref={tabNavRef} className="ws-tabnav flex flex-nowrap overflow-x-auto gap-1" style={{ scrollbarWidth: 'none' }}>
          {mainTabs.map(t => (
            <button
              key={t.id}
              data-tab={t.id}
              ref={t.id === activeTab ? activeTabRef : undefined}
              onClick={() => setActiveTab(t.id)}
              className={`shrink-0 flex items-center justify-center gap-1.5 py-2 px-2.5 sm:px-3 rounded-xl font-bold text-[12px] sm:text-[13px] transition-all duration-250 whitespace-nowrap ${
                activeTab === t.id
                  ? 'tab-active text-white'
                  : 'text-sky-700 hover:bg-sky-50 hover:text-sky-900'
              }`}
            >
              <span className={activeTab === t.id ? 'text-white' : 'text-sky-500'}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Gear FAB ─────────────────────────────────────── */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
        {isGearOpen && (
          <div
            className="glass rounded-2xl overflow-hidden mb-2"
            style={{ minWidth: 160, boxShadow: '0 12px 40px rgba(168,82,16,.3)' }}
          >
            {gearTabs.map(t => (
              <button
                key={t.id}
                onClick={() => { setActiveTab(t.id); setIsGearOpen(false); }}
                className={`w-full flex items-center gap-2 px-4 py-3 text-sm font-bold transition-colors ${
                  activeTab === t.id ? 'tab-active text-white' : 'text-sky-700 hover:bg-sky-50'
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => setIsGearOpen(p => !p)}
          className="btn-sky w-13 h-13 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-all"
          style={{ width: 52, height: 52 }}
        >
          <Settings
            size={22}
            className="transition-transform duration-300"
            style={{ transform: isGearOpen ? 'rotate(90deg)' : 'none' }}
          />
        </button>
      </div>
    </>
  );
}
