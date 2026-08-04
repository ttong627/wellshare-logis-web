import React from 'react';
import { Save, Building2 } from 'lucide-react';
import { addDoc, collection, doc, updateDoc, deleteField } from 'firebase/firestore';
import { db, APP_ID } from '../../firebase';
import { useApp } from '../../context/AppContext';
import { MEMBERS, PARTNER_REGIONS } from '../../constants/members';
import { getRegionTheme } from '../../constants/regions';
import StatusBadge from '../shared/StatusBadge';
import { formatNumber, safeRender, CLOSED_MSG } from '../../lib/utils';

export default function DeliveryCompletionTab() {
  const {
    partnerInputs, deliveryDates, setDeliveryDates,
    localDeliveryInputs, setLocalDeliveryInputs,
    undeliveredPartners, selectedAdminViewCompany, setSelectedAdminViewCompany,
    isAdmin, partnerCompany, isClosed, isSaving, setIsSaving,
    showToast, currentMonth, user, saveField,
  } = useApp();

  const handleLocalDeliveryChange = (company: string, region: string, field: string, value: string) => {
    setLocalDeliveryInputs(prev => ({
      ...prev,
      [company]: {
        ...(prev[company] || {}),
        [region]: {
          ...((prev[company] || {})[region] || {}),
          [field]: value,
        },
      },
    }));
  };

  const handleIndividualDeliverySave = async (company: string, region: string) => {
    if (isClosed && !isAdmin) return showToast(CLOSED_MSG);
    if (!isAdmin && company !== partnerCompany) return showToast('권한이 없습니다.');

    const localData = localDeliveryInputs[company]?.[region] || {};
    const existingDbData = deliveryDates[company]?.[region] || {};
    const dateToSave = localData.date !== undefined ? localData.date : existingDbData.date;
    const rawDelay = localData.delayDays !== undefined ? localData.delayDays : existingDbData.delayDays;
    const delayToSave: number | '' = (rawDelay !== undefined && rawDelay !== '') ? Number(rawDelay) : '';

    if (!dateToSave) return showToast('완료 일자를 입력해주세요.');

    setIsSaving(true);
    try {
      const newDeliveryDates: typeof deliveryDates = {
        ...deliveryDates,
        [company]: {
          ...(deliveryDates[company] || {}),
          [region]: { date: dateToSave, delayDays: delayToSave },
        },
      };
      setDeliveryDates(newDeliveryDates);

      const ok = await saveField('deliveryDates', newDeliveryDates, user?.email || '');
      if (ok) {
        setLocalDeliveryInputs(prev => {
          const newLocal = { ...prev };
          if (newLocal[company]) {
            newLocal[company] = { ...newLocal[company] };
            delete newLocal[company][region];
          }
          return newLocal;
        });

        if (!isAdmin) {
          const msgText = `[📦배송완료] ${company} 해당지자체(${region}) 배송완료 하였습니다.`;
          await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'notifications'), {
            message: msgText, target: 'ADMIN', timestamp: new Date().toISOString(),
          });
        }

        showToast(`[${region}] 배송 상태가 저장되었습니다.`);
      }
    } catch (e) { showToast('저장 오류: ' + (e as Error).message); }
    finally { setIsSaving(false); }
  };

  const handleClearDelivery = async (company: string, region: string) => {
    if (isClosed && !isAdmin) return showToast(CLOSED_MSG);
    if (!isAdmin && company !== partnerCompany) return showToast('권한이 없습니다.');

    setIsSaving(true);
    try {
      const newDeliveryDates = { ...deliveryDates };
      if (newDeliveryDates[company]) {
        newDeliveryDates[company] = { ...newDeliveryDates[company] };
        delete newDeliveryDates[company][region];
      }
      setDeliveryDates(newDeliveryDates);

      // merge:true는 사라진 키를 삭제하지 못한다 → 해당 경로를 deleteField로 명시적 삭제해야 취소가 반영됨
      const ref = doc(db, 'artifacts', APP_ID, 'public', 'data', 'billing_records', currentMonth);
      await updateDoc(ref, {
        [`deliveryDates.${company}.${region}`]: deleteField(),
        updatedAt: new Date().toISOString(),
      });

      setLocalDeliveryInputs(prev => {
        const newLocal = { ...prev };
        if (newLocal[company]) {
          newLocal[company] = { ...newLocal[company] };
          delete newLocal[company][region];
        }
        return newLocal;
      });

      showToast(`[${region}] 배송 완료 내역이 취소되었습니다.`);
    } catch (e) { showToast('취소 오류: ' + (e as Error).message); }
    finally { setIsSaving(false); }
  };

  const targetCompanies = (isAdmin && selectedAdminViewCompany === '전체')
    ? MEMBERS
    : [isAdmin ? selectedAdminViewCompany : (partnerCompany || '')];

  const renderBlocks = targetCompanies
    .filter(company => (PARTNER_REGIONS[company] || []).length > 0)
    .map(company => {
      const assignedRegions = PARTNER_REGIONS[company] || [];

      const tableRows = assignedRegions.map(region => {
        const dbData = deliveryDates[company]?.[region] || {};
        const localData = localDeliveryInputs[company]?.[region] || {};
        const displayDate = localData.date !== undefined ? localData.date : (dbData.date || '');
        const displayDelay = localData.delayDays !== undefined ? String(localData.delayDays) : (dbData.delayDays ? String(dbData.delayDays) : '');
        const isSavedInDB = !!dbData.date;

        const pData = partnerInputs[company]?.[region] || {};
        const pQty = (Number(pData.basicQty) || 0) + (Number(pData.povertyQty) || 0);
        const canEdit = isAdmin || company === partnerCompany;

        return (
          <tr key={region} className="hover:bg-sky-50/50 transition-colors border-b border-sky-50">
            <td className="p-1 sm:p-2 font-bold text-slate-800 border-r border-sky-100 bg-sky-50/40 text-center whitespace-nowrap text-[10px] sm:text-sm">
              <span className="inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: getRegionTheme(region).dot }} />
                {safeRender(region)}
              </span>
            </td>
            <td className="p-1 sm:p-2 border-r border-sky-100 text-center font-black text-slate-700 whitespace-nowrap text-[10px] sm:text-sm">
              {formatNumber(pQty)} 포
            </td>
            <td className="p-1 sm:p-2 border-r border-sky-100 text-center whitespace-nowrap">
              {isSavedInDB ? (
                <StatusBadge variant="done" label={`${dbData.date}${dbData.delayDays ? ` 지체${dbData.delayDays}일` : ''}`} />
              ) : (
                <StatusBadge variant="wait" label="미완료" />
              )}
            </td>
            <td className="p-1 sm:p-2 bg-white text-center flex flex-col sm:flex-row items-center gap-1 justify-center">
              <input
                type="date"
                disabled={isClosed || !canEdit}
                value={displayDate}
                onChange={(e) => handleLocalDeliveryChange(company, region, 'date', e.target.value)}
                className="w-full sm:w-[140px] text-[9px] sm:text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200 p-0.5 sm:p-1.5 transition-all disabled:opacity-50 cursor-pointer"
              />
              <input
                type="number"
                placeholder="지체일"
                disabled={isClosed || !canEdit}
                value={displayDelay}
                onChange={(e) => handleLocalDeliveryChange(company, region, 'delayDays', e.target.value)}
                className="w-[50px] sm:w-[70px] text-[9px] sm:text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200 p-0.5 sm:p-1.5 transition-all disabled:opacity-50 text-center placeholder:text-slate-300"
              />
            </td>
            <td className="p-1 sm:p-2 border-l border-sky-100 text-center bg-white whitespace-nowrap w-[40px] sm:w-[15%]">
              <div className="flex flex-col sm:flex-row items-center justify-center gap-1">
                {!isSavedInDB ? (
                  <button
                    onClick={() => handleIndividualDeliverySave(company, region)}
                    disabled={isClosed || !canEdit || isSaving}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-1 sm:px-2 py-1 rounded shadow-sm text-[9px] sm:text-xs font-bold transition-colors disabled:opacity-50 flex items-center justify-center w-full sm:w-auto"
                  >
                    <Save size={12} className="mr-0.5" /> 저장
                  </button>
                ) : (
                  <div className="flex gap-1 w-full sm:w-auto justify-center">
                    <button
                      onClick={() => handleIndividualDeliverySave(company, region)}
                      disabled={isClosed || !canEdit || isSaving}
                      className="bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded shadow-sm text-[9px] sm:text-xs font-bold transition-colors disabled:opacity-50 flex items-center justify-center"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => handleClearDelivery(company, region)}
                      disabled={isClosed || !canEdit || isSaving}
                      className="bg-rose-500 hover:bg-rose-600 text-white px-2 py-1 rounded shadow-sm text-[9px] sm:text-xs font-bold transition-colors disabled:opacity-50 flex items-center justify-center"
                    >
                      취소
                    </button>
                  </div>
                )}
              </div>
            </td>
          </tr>
        );
      });

      return (
        <div key={company} className="glass rounded-2xl overflow-hidden mb-5 w-full">
          {isAdmin && selectedAdminViewCompany === '전체' && (
            <div className="ws-grad px-4 py-2.5 font-black text-white text-sm sm:text-base flex items-center gap-2">
              <Building2 size={16} /> {safeRender(company)}
            </div>
          )}
          <div className="w-full overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
            <table className="w-full text-left text-[9px] sm:text-sm border-collapse tracking-tighter sm:tracking-normal table-fixed sm:table-auto">
              <thead>
                <tr className="ws-grad text-white font-bold">
                  <th className="p-1.5 border border-sky-300/40 text-center break-keep w-[20%]">배정 지자체</th>
                  <th className="p-1.5 border border-sky-300/40 text-center break-keep w-[15%]">배정 수량</th>
                  <th className="p-1.5 border border-sky-300/40 text-center break-keep w-[20%]">배송 상태</th>
                  <th className="p-1.5 border border-sky-300/40 text-center break-keep w-[30%]">완료일자 및 지체일수</th>
                  <th className="p-1.5 border border-sky-300/40 text-center break-keep w-[15%]">조작</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sky-50">{tableRows}</tbody>
            </table>
          </div>
        </div>
      );
    });

  return (
    <div className="animate-in fade-in duration-500 space-y-6 sm:space-y-8">
      <div className="sky-hero flex flex-col md:flex-row justify-between items-start md:items-center p-6 sm:p-8 text-white gap-4">
        <div className="relative z-10">
          <div className="text-sky-200 font-bold text-[10px] sm:text-xs uppercase tracking-widest mb-1">Delivery Completion</div>
          <div className="text-lg sm:text-2xl font-black tracking-tight" style={{ textShadow: '0 2px 8px rgba(0,0,0,.2)' }}>
            {isAdmin ? '지자체 배송 완료 통제반' : '내 지자체 배송 완료 체크'}
          </div>
          <p className="text-xs sm:text-sm text-sky-200 mt-1 sm:mt-2 font-medium">배송 완료일을 입력하고 우측의 개별 [저장] 버튼을 클릭해 주십시오.</p>
        </div>
        {isAdmin && (
          <div className="w-full md:w-auto flex flex-col items-start md:items-end gap-2 sm:gap-3 relative z-10"
            style={{ background: 'rgba(255,255,255,.12)', backdropFilter: 'blur(8px)', borderRadius: 12, padding: '12px 16px', border: '1px solid rgba(255,255,255,.2)' }}>
            <span className="text-[10px] sm:text-xs font-bold text-sky-100">조회할 파트너사 선택</span>
            <select
              value={selectedAdminViewCompany}
              onChange={(e) => setSelectedAdminViewCompany(e.target.value)}
              className="w-full md:w-auto border border-white/30 bg-white/15 text-white px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl font-bold text-xs sm:text-sm outline-none cursor-pointer"
            >
              <option value="전체" className="text-slate-800">전체 회원사 현황</option>
              {MEMBERS.map(m => <option key={m} value={m} className="text-slate-800">{safeRender(m)}</option>)}
            </select>
          </div>
        )}
      </div>

      {isAdmin && undeliveredPartners.length > 0 && selectedAdminViewCompany === '전체' && (
        <div className="bg-red-50 border border-red-200 p-4 sm:p-6 rounded-xl sm:rounded-2xl">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-red-500 font-bold">⚠️</span>
            <h4 className="font-bold text-red-800 text-sm sm:text-base">아직 배송을 미완료한 회원사 ({undeliveredPartners.length}곳)</h4>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {undeliveredPartners.map(p => (
              <span key={p} className="bg-white border border-red-200 text-red-700 px-3 py-1 rounded-md text-xs font-bold shadow-sm">{safeRender(p)}</span>
            ))}
          </div>
        </div>
      )}

      {renderBlocks.length === 0 ? (
        <div className="text-center py-10 sm:py-20 text-slate-400 font-bold border-2 border-dashed border-slate-200 rounded-xl sm:rounded-2xl text-xs sm:text-base">
          본사로부터 배정받은 내역이 없습니다.
        </div>
      ) : (
        <div className="w-full">
          <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-2">
            <span className="text-[10px] sm:text-xs text-slate-500 font-bold">화면에 맞춰 자동으로 압축됩니다.</span>
          </div>
          {renderBlocks}
        </div>
      )}
    </div>
  );
}
