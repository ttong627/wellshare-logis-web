import React from 'react';
import { Settings, Truck } from 'lucide-react';
import { ZONE_ORDER, REGION_ORDER } from '../../constants/regions';
import { formatNumber, safeRender, CLOSED_MSG } from '../../lib/utils';
import { useApp } from '../../context/AppContext';
import { parseNumber } from '../../lib/utils';

export default function PricesTab() {
  const { zonePrices, setZonePrices, regions, setRegions, isClosed, showToast, handleSaveField } = useApp();

  const handleZonePriceChange = async (zone: string, field: string, value: string) => {
    if (isClosed) return showToast(CLOSED_MSG);
    const numV = parseNumber(value);
    const updated = { ...zonePrices, [zone]: { ...(zonePrices[zone] || {}), [field]: numV } };
    setZonePrices(updated);
    await handleSaveField('zonePrices', updated);
  };

  const handleRegionZoneChange = async (region: string, zone: string) => {
    if (isClosed) return showToast(CLOSED_MSG);
    const updated = { ...regions, [region]: zone };
    setRegions(updated);
    await handleSaveField('regions', updated);
  };

  return (
    <div className="anim-in space-y-5">
      {/* ── 히어로 ── */}
      <div className="sky-hero p-6 sm:p-8 text-white">
        <div className="relative z-10">
          <div className="text-sky-200 text-[10px] font-bold uppercase tracking-widest mb-1">Pricing</div>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight" style={{ textShadow: '0 2px 8px rgba(0,0,0,.2)' }}>단가 및 급지 설정</h2>
          <p className="text-sky-100 text-xs sm:text-sm mt-1 font-medium">급지별 청구 단가와 지역별 배송 급지를 설정합니다. 단가는 전 회원사 청구액에 즉시 반영됩니다.</p>
        </div>
      </div>

      {/* ── 급지별 청구 단가 ── */}
      <div className="glass rounded-2xl p-5 sm:p-6">
        <h2 className="text-sm sm:text-base font-black text-sky-700 flex items-center gap-2 sm:gap-3 mb-4 pb-3 border-b border-sky-100">
          <Settings size={18} className="text-sky-500" /> 급지별 10Kg 청구 단가 설정
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 sm:gap-4">
          {ZONE_ORDER.map(zone => {
            const p = zonePrices[zone] || { billing: 0 };
            return (
              <div key={zone} className="fin-card relative overflow-hidden p-3 sm:p-4 flex flex-col justify-center">
                <div className="absolute top-0 left-0 right-0 h-1" style={{ background: 'linear-gradient(90deg,#5CCBEE,#0E7FA8)' }} />
                <div className="font-bold text-center text-sky-600 mb-2 text-[10px] sm:text-xs uppercase tracking-widest">{safeRender(zone)}</div>
                <div className="relative flex items-baseline justify-center gap-1">
                  <input
                    type="text"
                    inputMode="numeric"
                    disabled={isClosed}
                    value={formatNumber(p.billing)}
                    onChange={(e) => handleZonePriceChange(zone, 'billing', e.target.value)}
                    onFocus={(e) => e.target.select()}
                    aria-label={`${zone} 청구 단가`}
                    className="fin-num w-full p-1.5 sm:p-2 bg-sky-50/60 rounded-lg text-center focus:bg-white outline-none font-black text-base sm:text-xl text-slate-800 border border-transparent focus:border-sky-300 disabled:opacity-50 transition-colors"
                  />
                  <span className="text-[10px] sm:text-xs font-bold text-slate-400 shrink-0">원</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 지역별 배송 급지 ── */}
      <div className="glass rounded-2xl p-5 sm:p-6">
        <h2 className="text-sm sm:text-base font-black text-sky-700 flex items-center gap-2 sm:gap-3 mb-4 pb-3 border-b border-sky-100">
          <Truck size={18} className="text-sky-500" /> 지역별 배송 급지 지정
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {REGION_ORDER.map(r => (
            <div key={r} className="flex items-center justify-between p-3 sm:p-4 border border-sky-100 rounded-xl bg-sky-50/40 hover:border-sky-300 hover:bg-sky-50 transition-all">
              <span className="font-bold text-slate-800 text-sm sm:text-base">{safeRender(r)}</span>
              <select
                disabled={isClosed}
                value={regions[r] || '2급지'}
                onChange={(e) => handleRegionZoneChange(r, e.target.value)}
                aria-label={`${r} 배송 급지`}
                className="bg-white text-sky-700 border border-sky-200 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg font-bold text-xs sm:text-sm outline-none cursor-pointer focus:border-sky-400 disabled:opacity-50"
              >
                {ZONE_ORDER.map(k => <option key={k} value={k}>{safeRender(k)}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
