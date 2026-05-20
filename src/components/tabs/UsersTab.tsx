import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { db, APP_ID } from '../../firebase';
import { MEMBERS } from '../../constants/members';
import { safeRender } from '../../lib/utils';
import { useApp } from '../../context/AppContext';

export default function UsersTab() {
  const { partnerAccountsDB, pendingUsers, showToast } = useApp();
  const [newEmail, setNewEmail] = useState('');
  const [newCompany, setNewCompany] = useState(MEMBERS[0]);

  const validPending = pendingUsers.filter(e => !partnerAccountsDB[e]);

  const handleApprove = async (email: string, company: string) => {
    const updated = { ...partnerAccountsDB, [email]: company };
    const filtered = pendingUsers.filter(e => e !== email);
    try {
      await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'settings', 'master_settings'), {
        partnerAccounts: updated, pendingUsers: filtered,
      }, { merge: true });
      showToast(`[${email}] 계정이 승인되었습니다.`);
    } catch (e) { showToast('승인 실패: ' + (e as Error).message); }
  };

  const handleReject = async (email: string) => {
    const filtered = pendingUsers.filter(e => e !== email);
    try {
      await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'settings', 'master_settings'), {
        pendingUsers: filtered,
      }, { merge: true });
      showToast(`'${email}' 가입 요청이 삭제되었습니다.`);
    } catch (e) { showToast('삭제 실패: ' + (e as Error).message); }
  };

  const handleSaveAccount = async () => {
    if (!newEmail.includes('@')) return showToast('올바른 이메일 형식을 입력해주세요.');
    const updated = { ...partnerAccountsDB, [newEmail]: newCompany };
    try {
      await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'settings', 'master_settings'), {
        partnerAccounts: updated,
      }, { merge: true });
      showToast(`[${newEmail}] 계정이 등록되었습니다.`);
      setNewEmail('');
    } catch (e) { showToast('등록 실패: ' + (e as Error).message); }
  };

  const handleRemoveAccount = async (email: string) => {
    const updated = { ...partnerAccountsDB };
    delete updated[email];
    try {
      await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'settings', 'master_settings'), {
        partnerAccounts: updated,
      }, { merge: true });
      showToast(`[${email}] 권한이 해제되었습니다.`);
    } catch (e) { showToast('해제 실패: ' + (e as Error).message); }
  };

  return (
    <div className="anim-in space-y-5">
      <div className="sky-hero p-6 sm:p-8 text-white">
        <div className="flex items-center gap-3 relative z-10">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(255,255,255,.18)', backdropFilter: 'blur(8px)' }}>
            <ShieldCheck size={22} className="text-white" />
          </div>
          <div>
            <div className="text-sky-200 text-[10px] font-bold uppercase tracking-widest mb-0.5">User Management</div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight" style={{ textShadow: '0 2px 8px rgba(0,0,0,.2)' }}>계정 승인 및 권한 관리</h2>
          </div>
        </div>
      </div>
      <div className="glass rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-sky-100 flex items-center gap-2"
          style={{ background: 'linear-gradient(135deg,rgba(14,165,233,.07),rgba(56,189,248,.03))' }}>
          <ShieldCheck size={15} className="text-sky-500" />
          <h3 className="font-black text-sky-700 text-sm">승인 대기 중 신규 가입자</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm min-w-[500px]">
            <thead>
              <tr style={{ background: 'linear-gradient(135deg,rgba(14,165,233,.1),rgba(56,189,248,.05))' }}>
                <th className="p-3 sm:p-4 font-bold text-sky-700">가입한 이메일 계정</th>
                <th className="p-3 sm:p-4 font-bold text-sky-700">연결할 회원사 선택</th>
                <th className="p-3 sm:p-4 font-bold text-sky-700 text-center w-32">승인 처리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sky-50 bg-white">
              {validPending.length === 0 ? (
                <tr><td colSpan={3} className="p-8 text-center text-slate-400 font-bold">현재 대기 중인 신규 가입자가 없습니다.</td></tr>
              ) : validPending.map(email => (
                <PendingRow key={email} email={email} onApprove={handleApprove} onReject={handleReject} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="glass rounded-2xl p-5 sm:p-8">
        <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6 pb-3 sm:pb-4 border-b border-sky-100">
          <span className="text-sky-500"><ShieldCheck size={28} /></span>
          <h2 className="text-lg sm:text-xl font-black text-sky-700">기존 권한 부여 현황 (강제 맵핑)</h2>
        </div>
        <div className="flex flex-col md:flex-row gap-3 sm:gap-4 mb-6 bg-slate-50 p-4 sm:p-6 rounded-lg sm:rounded-xl border border-slate-200">
          <div className="flex-1">
            <label className="block text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 sm:mb-2">접속 허용 이메일</label>
            <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="예: partner@gmail.com" className="w-full px-3 sm:px-4 py-2 sm:py-2.5 rounded-md sm:rounded-lg border border-slate-300 text-xs sm:text-sm font-bold text-slate-800 outline-none focus:border-blue-500" />
          </div>
          <div className="flex-1">
            <label className="block text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 sm:mb-2">연결할 회원사(소속)</label>
            <select value={newCompany} onChange={(e) => setNewCompany(e.target.value)} className="w-full px-3 sm:px-4 py-2 sm:py-2.5 rounded-md sm:rounded-lg border border-slate-300 text-xs sm:text-sm font-bold text-slate-800 outline-none focus:border-blue-500 cursor-pointer bg-white">
              <option value="ADMIN">👑 최고 관리자 (본사)</option>
              {MEMBERS.map(m => <option key={m} value={m}>🏢 {safeRender(m)}</option>)}
            </select>
          </div>
          <div className="flex items-end mt-2 md:mt-0">
            <button onClick={handleSaveAccount} disabled={!newEmail} className="btn-sky w-full md:w-auto px-4 sm:px-6 py-2 sm:py-2.5 font-bold text-xs sm:text-sm disabled:opacity-50 whitespace-nowrap">
              강제 등록
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg sm:rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs sm:text-sm min-w-[500px]">
            <thead className="bg-slate-100 border-b border-slate-200">
              <tr>
                <th className="p-3 sm:p-4 font-bold text-slate-500">승인된 이메일 계정</th>
                <th className="p-3 sm:p-4 font-bold text-slate-500">부여된 권한</th>
                <th className="p-3 sm:p-4 font-bold text-slate-500 text-center w-24">강제 해제</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {Object.keys(partnerAccountsDB).length === 0 ? (
                <tr><td colSpan={3} className="p-8 text-center text-slate-400 font-bold">등록된 파트너사 계정이 없습니다.</td></tr>
              ) : Object.entries(partnerAccountsDB).map(([email, company]) => (
                <tr key={email} className="hover:bg-slate-50 transition-colors">
                  <td className="p-3 sm:p-4 font-bold text-slate-800">{safeRender(email)}</td>
                  <td className="p-3 sm:p-4 font-bold text-blue-600 bg-blue-50/50">
                    {company === 'ADMIN' ? <span className="text-orange-600">👑 최고 관리자 (본사)</span> : `🏢 ${safeRender(company)}`}
                  </td>
                  <td className="p-2 sm:p-4 text-center">
                    <button onClick={() => handleRemoveAccount(email)} className="bg-red-100 hover:bg-red-500 hover:text-white text-red-600 font-bold py-1.5 px-3 rounded-lg transition-colors shadow-sm text-xs">
                      해제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function PendingRow({ email, onApprove, onReject }: { email: string; onApprove: (e: string, c: string) => void; onReject: (e: string) => void }) {
  const [company, setCompany] = useState(MEMBERS[0]);
  return (
    <tr className="hover:bg-orange-50/50 transition-colors">
      <td className="p-3 sm:p-4 font-bold text-slate-800">{safeRender(email)}</td>
      <td className="p-2 sm:p-4">
        <select value={company} onChange={(e) => setCompany(e.target.value)} className="w-full px-2 sm:px-4 py-1.5 sm:py-2 rounded-md sm:rounded-lg border border-slate-300 text-xs sm:text-sm font-bold text-slate-800 outline-none focus:border-orange-500 cursor-pointer bg-white">
          <option value="ADMIN">👑 최고 관리자 (본사)</option>
          {MEMBERS.map(m => <option key={m} value={m}>🏢 {safeRender(m)}</option>)}
        </select>
      </td>
      <td className="p-2 sm:p-4 text-center flex items-center justify-center gap-2">
        <button onClick={() => onApprove(email, company)} className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-1.5 px-4 rounded-md transition-colors shadow-sm text-xs sm:text-sm">승인</button>
        <button onClick={() => onReject(email)} className="bg-slate-200 hover:bg-red-500 hover:text-white text-slate-600 font-bold py-1.5 px-4 rounded-md transition-colors shadow-sm text-xs sm:text-sm">삭제</button>
      </td>
    </tr>
  );
}
