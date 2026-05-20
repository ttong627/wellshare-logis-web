import React, { useMemo } from 'react';
import { LayoutDashboard, TrendingUp } from 'lucide-react';
import { safeRender, formatNumber } from '../../lib/utils';
import { useApp } from '../../context/AppContext';
import { PARTNER_REGIONS } from '../../constants/members';

export default function ProfileTab() {
  const { partnerCompany, user, deliveryDates, getEffectiveOrder } = useApp();

  const partnerProgress = useMemo(() => {
    if (!partnerCompany) return { assigned: 0, completed: 0, percent: 0 };
    const regions = PARTNER_REGIONS[partnerCompany] || [];
    let assigned = 0;
    let completed = 0;
    regions.forEach(r => {
      const eff = getEffectiveOrder(r);
      const qty = eff.basicQty + eff.povertyQty;
      assigned += qty;
      if (deliveryDates[partnerCompany]?.[r]?.date) completed += qty;
    });
    const percent = assigned > 0 ? Math.round((completed / assigned) * 100) : 0;
    return { assigned, completed, percent };
  }, [partnerCompany, deliveryDates, getEffectiveOrder]);

  return (
    <div className="anim-in space-y-5">
      <div className="sky-hero p-6 sm:p-8 text-white">
        <div className="flex items-center gap-3 relative z-10">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(255,255,255,.18)', backdropFilter: 'blur(8px)' }}>
            <LayoutDashboard size={22} className="text-white" />
          </div>
          <div>
            <div className="text-sky-200 text-[10px] font-bold uppercase tracking-widest mb-0.5">Dashboard</div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight" style={{ textShadow: '0 2px 8px rgba(0,0,0,.2)' }}>
              내 계정 및 업무 대시보드
            </h2>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="glass rounded-2xl p-5 sm:p-6 flex flex-col justify-center">
          <div className="text-[10px] sm:text-xs font-bold text-sky-500 uppercase tracking-widest mb-1">소속 회원사</div>
          <div className="text-lg sm:text-xl font-black text-slate-800 mb-4">{safeRender(partnerCompany)}</div>
          <div className="text-[10px] sm:text-xs font-bold text-sky-500 uppercase tracking-widest mb-1">접속 이메일</div>
          <div className="text-sm sm:text-base font-bold text-sky-600">{safeRender(user?.email)}</div>
        </div>

        <div className="glass rounded-2xl p-5 sm:p-6">
          <div className="flex justify-between items-end mb-4">
            <div>
              <div className="text-[10px] sm:text-xs font-bold text-sky-500 uppercase tracking-widest mb-1">이번 달 배송 진척도</div>
              <div className="text-xl sm:text-3xl font-black text-slate-800">
                {formatNumber(partnerProgress.completed)}
                <small className="text-xs sm:text-sm text-sky-400 font-bold ml-1">/ {formatNumber(partnerProgress.assigned)} 포</small>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <TrendingUp size={16} className="text-emerald-500" />
              <span className="text-xl sm:text-2xl font-black text-emerald-500">{partnerProgress.percent}%</span>
            </div>
          </div>
          <div className="w-full rounded-full h-4 overflow-hidden shadow-inner" style={{ background: 'rgba(14,165,233,.12)' }}>
            <div className="h-4 rounded-full transition-all duration-1000"
              style={{
                width: `${partnerProgress.percent}%`,
                background: 'linear-gradient(90deg, #10b981, #34d399)',
                boxShadow: '0 2px 8px rgba(16,185,129,.4)',
              }} />
          </div>
          <div className="flex justify-between text-[10px] font-bold text-sky-400 mt-1.5">
            <span>0%</span><span>100%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
