import React from 'react';
import { Truck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { PARTNER_REGIONS_INVERSE } from '../../constants/members';
import { formatNumber, parseNumber, safeRender } from '../../lib/utils';

interface ConflictModalProps {
  resolvingRegion: string;
  onClose: () => void;
}

export default function ConflictModal({ resolvingRegion, onClose }: ConflictModalProps) {
  const { orders, partnerInputs, setPartnerInputs, setOrders, partnerAggregatedOrders, showToast } = useApp();

  const o = orders[resolvingRegion] || {};
  const pSum = partnerAggregatedOrders[resolvingRegion] || { basicQty: 0, povertyQty: 0 };
  const partners = PARTNER_REGIONS_INVERSE[resolvingRegion] || [];

  const handlePartnerInputChange = (m: string, field: string, value: string) => {
    const numV = value === '' ? '' : parseNumber(value);
    setPartnerInputs(prev => ({
      ...prev,
      [m]: {
        ...(prev[m] || {}),
        [resolvingRegion]: {
          ...((prev[m] || {})[resolvingRegion] || {}),
          [field]: numV,
        },
      },
    }));
  };

  const isMatch =
    Number(o.povertyQty || 0) === pSum.povertyQty &&
    Number(o.basicQty || 0) === pSum.basicQty;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border-2 border-red-500 flex flex-col max-h-[90vh]">
        <div className="bg-red-50 px-6 py-4 border-b border-red-200 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-2xl animate-bounce">🚨</span>
            <h3 className="font-black text-red-800 text-lg sm:text-xl">수량 불일치 조정: {safeRender(resolvingRegion)}</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-red-500 font-bold p-2 text-xl">✕</button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <h4 className="font-bold text-slate-700 mb-3 flex items-center gap-2"><Truck size={16} /> 본사(지자체) 전체 할당 수량</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">차상위 수량</label>
                <input type="text" disabled value={formatNumber(Number(o.povertyQty || 0))} className="w-full p-2 bg-white border border-slate-300 rounded-lg text-right font-black text-lg" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">수급자 수량</label>
                <input type="text" disabled value={formatNumber(Number(o.basicQty || 0))} className="w-full p-2 bg-white border border-slate-300 rounded-lg text-right font-black text-lg" />
              </div>
            </div>
            <p className="text-xs text-red-500 font-bold mt-2">* 이 수량은 파트너사들이 입력한 수량의 합과 반드시 일치해야 합니다.</p>
          </div>

          <div className="space-y-3">
            <h4 className="font-bold text-slate-700 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1"><Truck size={16} /> 이 지역을 배송하는 파트너사 입력 수량</span>
              <span className="text-xs text-blue-600 font-black">아래 칸을 수정하여 합계를 맞추세요.</span>
            </h4>
            {partners.map(m => (
              <div key={m} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <span className="font-bold text-slate-800 text-sm">{safeRender(m)}</span>
                <div className="flex items-center gap-4 w-full sm:w-auto">
                  <div className="flex-1 sm:flex-none">
                    <label className="text-[10px] font-bold text-slate-500 block mb-1">차상위</label>
                    <input
                      type="text"
                      value={formatNumber(Number(partnerInputs[m]?.[resolvingRegion]?.povertyQty || 0))}
                      onChange={(e) => handlePartnerInputChange(m, 'povertyQty', e.target.value)}
                      onFocus={(e) => e.target.select()}
                      className="w-full sm:w-24 p-2 bg-blue-50 border border-blue-200 rounded-lg text-right font-black text-blue-800 outline-none focus:ring-2 focus:ring-blue-400"
                    />
                  </div>
                  <div className="flex-1 sm:flex-none">
                    <label className="text-[10px] font-bold text-slate-500 block mb-1">수급자</label>
                    <input
                      type="text"
                      value={formatNumber(Number(partnerInputs[m]?.[resolvingRegion]?.basicQty || 0))}
                      onChange={(e) => handlePartnerInputChange(m, 'basicQty', e.target.value)}
                      onFocus={(e) => e.target.select()}
                      className="w-full sm:w-24 p-2 bg-blue-50 border border-blue-200 rounded-lg text-right font-black text-blue-800 outline-none focus:ring-2 focus:ring-blue-400"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-slate-100 p-4 rounded-xl flex justify-between items-center border border-slate-200">
            <span className="font-bold text-slate-700">현재 파트너사 수량 총합</span>
            <span className="font-black text-xl text-slate-800">
              차상위: {formatNumber(pSum.povertyQty)} / 수급자: {formatNumber(pSum.basicQty)}
            </span>
          </div>

          {isMatch ? (
            <div className="bg-emerald-100 text-emerald-700 p-3 rounded-xl font-bold text-center border border-emerald-300 animate-pulse">
              ✅ 수량이 완벽하게 일치합니다!
            </div>
          ) : (
            <div className="bg-rose-100 text-rose-700 p-3 rounded-xl font-bold text-center border border-rose-300">
              ❌ 본사 수량과 파트너사 합계가 아직 다릅니다. 일치시켜 주세요.
            </div>
          )}
        </div>

        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-end gap-3 shrink-0">
          {partners.length === 1 && (
            <button
              onClick={() => {
                const pName = partners[0];
                setPartnerInputs(prev => ({
                  ...prev,
                  [pName]: {
                    ...(prev[pName] || {}),
                    [resolvingRegion]: { povertyQty: o.povertyQty || 0, basicQty: o.basicQty || 0 },
                  },
                }));
                onClose();
                showToast('회원사 수량이 본사 수량으로 덮어쓰기 되었습니다.');
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold text-sm transition-colors shadow-sm"
            >
              본사 수량으로 회원사 덮어쓰기
            </button>
          )}
          <button
            onClick={() => {
              setOrders(prev => {
                const newOrd = { ...prev };
                if (newOrd[resolvingRegion]) {
                  newOrd[resolvingRegion] = { ...newOrd[resolvingRegion] };
                  delete newOrd[resolvingRegion].basicQty;
                  delete newOrd[resolvingRegion].povertyQty;
                }
                return newOrd;
              });
              onClose();
              showToast('본사 수량을 삭제하여 파트너사 합계로 자동 동기화 되었습니다.');
            }}
            className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2 rounded-lg font-bold text-sm transition-colors"
          >
            본사 수량 삭제 (파트너 합계 허용)
          </button>
          <button onClick={onClose} className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg font-bold text-sm transition-colors shadow-sm">
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
