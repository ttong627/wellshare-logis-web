import React from 'react';
import { Save, Trash2, Building2 } from 'lucide-react';
import { setDoc, doc } from 'firebase/firestore';
import { db, APP_ID } from '../../firebase';
import { useApp } from '../../context/AppContext';
import { MEMBERS } from '../../constants/members';
import { PARTNER_REGIONS } from '../../constants/members';
import { getRegionTheme } from '../../constants/regions';
import { parseNumber, formatNumber, safeRender, CLOSED_MSG } from '../../lib/utils';

export default function PerformanceTab() {
  const {
    partnerInputs, setPartnerInputs, unsubmittedPartners,
    selectedAdminViewCompany, setSelectedAdminViewCompany,
    isAdmin, partnerCompany, isClosed, isSaving, setIsSaving,
    showToast, user, currentMonth,
  } = useApp();

  const handlePartnerInputChange = (company: string, region: string, field: string, value: string) => {
    if (isClosed && !isAdmin) return showToast(CLOSED_MSG);
    if (!isAdmin && company !== partnerCompany) return showToast('권한이 없습니다.');
    const numV = value === '' ? '' : parseNumber(value);

    setPartnerInputs(prev => ({
      ...prev,
      [company]: {
        ...(prev[company] || {}),
        [region]: {
          ...((prev[company] || {})[region] || {}),
          [field]: numV,
        },
      },
    }));
  };

  const handleIndividualPerformanceSave = async (company: string, region: string) => {
    if (isClosed && !isAdmin) return showToast(CLOSED_MSG);
    setIsSaving(true);
    try {
      const pData = partnerInputs[company]?.[region] || {};
      const ref = doc(db, 'artifacts', APP_ID, 'public', 'data', 'billing_records', currentMonth);
      await setDoc(ref, {
        partnerInputs: { [company]: { [region]: pData } },
        updatedAt: new Date().toISOString(),
        updatedBy: user?.email || '',
      }, { merge: true });
      showToast(`[${region}] 실적이 저장되었습니다.`);
    } catch (e) { showToast('저장 오류: ' + (e as Error).message); }
    finally { setIsSaving(false); }
  };

  const handleIndividualPerformanceDelete = async (company: string, region: string) => {
    if (isClosed && !isAdmin) return showToast(CLOSED_MSG);
    if (!isAdmin && company !== partnerCompany) return showToast('권한이 없습니다.');
    if (!window.confirm(`[${region}] 실적 데이터를 완전히 삭제하시겠습니까?`)) return;
    
    setIsSaving(true);
    try {
      const ref = doc(db, 'artifacts', APP_ID, 'public', 'data', 'billing_records', currentMonth);
      await setDoc(ref, {
        partnerInputs: { [company]: { [region]: { basicQty: '', povertyQty: '' } } },
        updatedAt: new Date().toISOString(),
        updatedBy: user?.email || '',
      }, { merge: true });
      
      setPartnerInputs(prev => ({
        ...prev,
        [company]: {
          ...(prev[company] || {}),
          [region]: {
            ...((prev[company] || {})[region] || {}),
            basicQty: '',
            povertyQty: '',
          },
        },
      }));
      showToast(`[${region}] 실적이 정상적으로 삭제되었습니다.`);
    } catch (e) { showToast('삭제 오류: ' + (e as Error).message); }
    finally { setIsSaving(false); }
  };

  const targetCompanies = (isAdmin && selectedAdminViewCompany === '전체')
    ? MEMBERS
    : [isAdmin ? selectedAdminViewCompany : (partnerCompany || '')];

  let grandTotalBasic = 0;
  let grandTotalPoverty = 0;

  const renderBlocks = targetCompanies
    .filter(company => (PARTNER_REGIONS[company] || []).length > 0)
    .map(company => {
      const assignedRegions = PARTNER_REGIONS[company] || [];
      let compBasic = 0;
      let compPoverty = 0;

      const tableRows = assignedRegions.map(region => {
        const pData = partnerInputs[company]?.[region] || {};
        const valPoverty = pData.povertyQty === undefined ? '' : pData.povertyQty;
        const valBasic = pData.basicQty === undefined ? '' : pData.basicQty;
        const rowTotal = (Number(pData.povertyQty) || 0) + (Number(pData.basicQty) || 0);

        compBasic += (Number(pData.basicQty) || 0);
        compPoverty += (Number(pData.povertyQty) || 0);

        const hasData = (valBasic !== undefined && valBasic !== '') || (valPoverty !== undefined && valPoverty !== '');
        const canEdit = isAdmin || company === partnerCompany;

        return (
          <tr key={region} className="hover:bg-sky-50/50 transition-colors border-b border-sky-50">
            <td className="p-1 sm:p-4 font-bold text-slate-800 border-r border-sky-100 bg-sky-50/40 text-center whitespace-nowrap">
              <span className="inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: getRegionTheme(region).dot }} />
                {safeRender(region)}
              </span>
            </td>
            <td className="p-0.5 sm:p-2 border-r border-sky-100 text-center bg-white w-[25%] sm:w-auto">
              <input
                type="text"
                disabled={isClosed || !canEdit}
                value={valPoverty === '' ? '' : formatNumber(Number(valPoverty))}
                onChange={(e) => handlePartnerInputChange(company, region, 'povertyQty', e.target.value)}
                onFocus={(e) => e.target.select()}
                className="w-full text-center font-black text-[10px] sm:text-lg text-slate-800 outline-none focus:border-b-2 focus:border-emerald-500 bg-transparent transition-all disabled:opacity-40"
                placeholder="0"
              />
            </td>
            <td className="p-0.5 sm:p-2 border-r border-sky-100 text-center bg-white w-[25%] sm:w-auto">
              <input
                type="text"
                disabled={isClosed || !canEdit}
                value={valBasic === '' ? '' : formatNumber(Number(valBasic))}
                onChange={(e) => handlePartnerInputChange(company, region, 'basicQty', e.target.value)}
                onFocus={(e) => e.target.select()}
                className="w-full text-center font-black text-[10px] sm:text-lg text-slate-800 outline-none focus:border-b-2 focus:border-emerald-500 bg-transparent transition-all disabled:opacity-40"
                placeholder="0"
              />
            </td>
            <td className="p-1 sm:p-4 font-black text-blue-700 border-l-2 border-blue-200 bg-blue-50 text-right whitespace-nowrap w-[20%] sm:w-auto">
              {formatNumber(rowTotal)}
            </td>
            <td className="p-1 sm:p-2 border-l-2 border-emerald-200 text-center bg-white whitespace-nowrap w-[60px] sm:w-[15%]">
              <div className="flex flex-col sm:flex-row gap-1">
                <button
                  onClick={() => handleIndividualPerformanceSave(company, region)}
                  disabled={isClosed || !canEdit || isSaving}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-1 sm:px-2 py-1 rounded shadow-sm text-[9px] sm:text-xs font-bold transition-colors disabled:opacity-50 w-full flex justify-center items-center gap-1"
                >
                  <Save size={12} /> 저장
                </button>
                {hasData && (
                  <button
                    onClick={() => handleIndividualPerformanceDelete(company, region)}
                    disabled={isClosed || !canEdit || isSaving}
                    className="bg-red-500 hover:bg-red-600 text-white px-1 sm:px-2 py-1 rounded shadow-sm text-[9px] sm:text-xs font-bold transition-colors disabled:opacity-50 w-full flex justify-center items-center gap-1"
                  >
                    <Trash2 size={12} /> 삭제
                  </button>
                )}
              </div>
            </td>
          </tr>
        );
      });

      grandTotalBasic += compBasic;
      grandTotalPoverty += compPoverty;

      return (
        <div key={company} className="glass rounded-2xl overflow-hidden mb-5 w-full">
          {isAdmin && selectedAdminViewCompany === '전체' && (
            <div className="px-4 py-2.5 font-black text-white text-sm sm:text-base flex items-center gap-2" style={{ background: 'linear-gradient(135deg,#0B6F94,#18A8D8)' }}>
              <Building2 size={16} /> {safeRender(company)}
            </div>
          )}
          <div className="w-full overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
            <table className="w-full text-left text-[9px] sm:text-sm border-collapse tracking-tighter sm:tracking-normal table-fixed sm:table-auto">
              <thead>
                <tr className="text-white font-bold" style={{ background: 'linear-gradient(135deg,#0B6F94,#18A8D8)' }}>
                  <th className="p-1.5 sm:p-3 border border-sky-300/40 text-center whitespace-nowrap">배정 지역</th>
                  <th className="p-1.5 sm:p-3 border border-sky-300/40 text-center whitespace-nowrap">차상위 포수</th>
                  <th className="p-1.5 sm:p-3 border border-sky-300/40 text-center whitespace-nowrap">수급자 포수</th>
                  <th className="p-1.5 sm:p-3 border border-sky-300/40 text-center whitespace-nowrap">지자체 합계</th>
                  <th className="p-1.5 sm:p-3 border border-sky-300/40 text-center whitespace-nowrap w-[15%]">조작</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sky-50">{tableRows}</tbody>
              <tfoot className="bg-sky-100 text-sky-900 border-t-2 border-sky-300">
                <tr>
                  <td className="p-1 sm:p-3 font-black text-center border border-sky-200 whitespace-nowrap">소계</td>
                  <td className="p-1 sm:p-3 font-black text-sm sm:text-xl text-center border border-sky-200 whitespace-nowrap">{formatNumber(compPoverty)}</td>
                  <td className="p-1 sm:p-3 font-black text-sm sm:text-xl text-center border border-sky-200 whitespace-nowrap">{formatNumber(compBasic)}</td>
                  <td className="p-1 sm:p-3 font-black text-lg sm:text-2xl text-right border border-sky-200 text-sky-800 whitespace-nowrap">{formatNumber(compBasic + compPoverty)}</td>
                  <td className="p-1 sm:p-3 border border-sky-200 whitespace-nowrap"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      );
    });

  return (
    <div className="animate-in fade-in duration-500 space-y-6 sm:space-y-8">
      <div className="sky-hero flex flex-col md:flex-row justify-between items-start md:items-center p-6 sm:p-8 text-white gap-4">
        <div className="relative z-10">
          <div className="text-sky-200 font-bold text-[10px] sm:text-xs uppercase tracking-widest mb-1">Partner Performance Report</div>
          <div className="text-lg sm:text-2xl font-black tracking-tight" style={{ textShadow: '0 2px 8px rgba(0,0,0,.2)' }}>
            {isAdmin ? '전체 지자체 포수 입력 모니터링' : `${safeRender(partnerCompany)} 지역포수 입력`}
          </div>
          <p className="text-xs sm:text-sm text-sky-200 mt-1 sm:mt-2 font-medium">배정된 지역의 배송 수량을 입력하고 개별 [저장]을 눌러 주십시오.</p>
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
              <option value="전체" className="text-slate-800">전체 회원사 보기</option>
              {MEMBERS.map(m => <option key={m} value={m} className="text-slate-800">{safeRender(m)}</option>)}
            </select>
          </div>
        )}
      </div>

      {isAdmin && unsubmittedPartners.length > 0 && selectedAdminViewCompany === '전체' && (
        <div className="bg-red-50 border border-red-200 p-4 sm:p-6 rounded-xl sm:rounded-2xl">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-red-500 font-bold">⚠️</span>
            <h4 className="font-bold text-red-800 text-sm sm:text-base">아직 이번 달 실적을 완전히 입력하지 않은 회원사 ({unsubmittedPartners.length}곳)</h4>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {unsubmittedPartners.map(p => (
              <span key={p} className="bg-white border border-red-200 text-red-700 px-3 py-1 rounded-md text-xs font-bold shadow-sm">{safeRender(p)}</span>
            ))}
          </div>
        </div>
      )}

      {renderBlocks.length === 0 ? (
        <div className="text-center py-10 sm:py-20 text-slate-400 font-bold border-2 border-dashed border-slate-200 rounded-xl sm:rounded-2xl text-xs sm:text-base">
          등록된 회원사 또는 지자체가 없습니다.
        </div>
      ) : (
        <div className="w-full">
          <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-2">
            <span className="text-[10px] sm:text-xs text-slate-500 font-bold animate-pulse">👈 화면에 맞춰 자동으로 압축됩니다.</span>
          </div>
          {renderBlocks}
          {isAdmin && selectedAdminViewCompany === '전체' && (
            <div className="mt-8 sky-hero text-white p-6 rounded-2xl flex justify-between items-center shadow-lg">
              <span className="font-black text-lg relative z-10">모든 회원사 전체 합계</span>
              <div className="text-right relative z-10">
                <p className="text-sky-100 text-sm">차상위 {formatNumber(grandTotalPoverty)} · 수급자 {formatNumber(grandTotalBasic)}</p>
                <p className="font-black text-3xl mt-1">{formatNumber(grandTotalPoverty + grandTotalBasic)} 포</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
