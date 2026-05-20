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
      <div className="sky-hero p-6 sm:p-8 text-white">
        <div className="relative z-10">
          <div className="text-sky-200 text-[10px] font-bold uppercase tracking-widest mb-1">Pricing</div>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight" style={{ textShadow: '0 2px 8px rgba(0,0,0,.2)' }}>단가 및 급지 설정</h2>
          <p className="text-sky-200 text-xs sm:text-sm mt-1 font-medium">급지별 청구 단가와 지역별 배송 급지를 설정합니다.</p>
        </div>
      </div>
      <div className="glass rounded-2xl p-5 sm:p-6">
        <h2 className="text-sm sm:text-base font-black text-sky-700 flex items-center gap-2 sm:gap-3 mb-4 pb-3 border-b border-sky-100">
          <Settings size={18} className="text-sky-500" /> 급지별 10Kg 청구 단가 설정
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 sm:gap-4">
          {ZONE_ORDER.map(zone => {
            const p = zonePrices[zone] || { billing: 0 };
            return (
              <div key={zone} className="border border-slate-200 rounded-lg sm:rounded-xl p-3 sm:p-5 bg-white shadow-sm flex flex-col justify-center transition-all hover:border-blue-300">
                <div className="font-bold text-center text-slate-400 mb-1 sm:mb-2 text-[10px] sm:text-xs uppercase tracking-widest">{safeRender(zone)}</div>
                <div className="relative">
                  <input
                    type="text"
                    disabled={isClosed}
                    value={formatNumber(p.billing)}
                    onChange={(e) => handleZonePriceChange(zone, 'billing', e.target.value)}
                    onFocus={(e) => e.target.select()}
                    className="w-full p-1.5 sm:p-2 bg-slate-50 rounded-md sm:rounded-lg text-center focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-50 outline-none font-black text-base sm:text-xl text-slate-800 border border-transparent disabled:opacity-50"
                  />
                  <span className="absolute -right-1 -bottom-1 text-[8px] sm:text-[10px] font-bold text-slate-400">원</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="glass rounded-2xl p-5 sm:p-6">
        <h2 className="text-sm sm:text-base font-black text-sky-700 flex items-center gap-2 sm:gap-3 mb-4 pb-3 border-b border-sky-100">
          <Truck size={18} className="text-sky-500" /> 지역별 배송 급지 지정
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {REGION_ORDER.map(r => (
            <div key={r} className="flex items-center justify-between p-3 sm:p-4 border border-sky-100 rounded-xl bg-sky-50/50 hover:border-sky-300 transition-all">
              <span className="font-bold text-slate-800 text-sm sm:text-base">{safeRender(r)}</span>
              <select
                disabled={isClosed}
                value={regions[r] || '2급지'}
                onChange={(e) => handleRegionZoneChange(r, e.target.value)}
                className="bg-slate-50 text-slate-700 border border-slate-200 px-2 sm:px-3 py-1 sm:py-1.5 rounded-md font-bold text-xs sm:text-sm outline-none cursor-pointer"
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
