import React, { useState, useEffect, useMemo } from 'react';
import { ShieldCheck, KeyRound } from 'lucide-react';
import { doc, setDoc, deleteDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions, APP_ID } from '../../firebase';
import { MEMBERS } from '../../constants/members';
import { safeRender } from '../../lib/utils';
import { useApp } from '../../context/AppContext';

// 신규 가입요청(notifications의 signupEmail) → 이메일별 알림 문서ID 목록
interface SignupRequest { email: string; notifIds: string[]; timestamp: string; }

export default function UsersTab() {
  const { partnerAccountsDB, pendingUsers, showToast } = useApp();
  const [newEmail, setNewEmail] = useState('');
  const [newCompany, setNewCompany] = useState(MEMBERS[0]);
  const [signupRequests, setSignupRequests] = useState<SignupRequest[]>([]);
  const [pwTarget, setPwTarget] = useState<string | null>(null);

  // ── 신규 가입요청 알림 구독 (승인 대기 목록의 진짜 소스) ─────────────────
  // 신규 가입자는 rules상 pendingUsers(master_settings)에 직접 못 써서 가입요청을
  // ADMIN 알림(signupEmail)으로 남긴다. 이를 파싱해 승인 대기 목록을 복구한다.
  useEffect(() => {
    const q = query(
      collection(db, 'artifacts', APP_ID, 'public', 'data', 'notifications'),
      where('target', '==', 'ADMIN'),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const byEmail = new Map<string, SignupRequest>();
        snap.docs.forEach((d) => {
          const data = d.data() as { signupEmail?: string; message?: string; timestamp?: string };
          let email = (data.signupEmail || '').trim();
          // 배포(v2.16.0) 이전 가입요청 알림엔 signupEmail이 없다 →
          // 가입요청 메시지 본문("회원사(이메일)")에서 이메일을 추출해 목록에 복원한다.
          if (!email && typeof data.message === 'string' && data.message.includes('가입요청')) {
            const m = data.message.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
            if (m) email = m[0];
          }
          if (!email) return;
          const prev = byEmail.get(email);
          if (prev) {
            prev.notifIds.push(d.id);
            if ((data.timestamp || '') > prev.timestamp) prev.timestamp = data.timestamp || '';
          } else {
            byEmail.set(email, { email, notifIds: [d.id], timestamp: data.timestamp || '' });
          }
        });
        setSignupRequests(Array.from(byEmail.values()));
      },
      (err) => { console.error('가입요청 구독 오류:', err); setSignupRequests([]); },
    );
    return () => unsub();
  }, []);

  // 승인 대기 = pendingUsers(레거시) ∪ 가입요청 이메일 − 이미 승인된 계정
  const validPending = useMemo(() => {
    const set = new Set<string>();
    pendingUsers.forEach((e) => set.add(e));
    signupRequests.forEach((r) => set.add(r.email));
    return Array.from(set).filter((e) => !partnerAccountsDB[e]);
  }, [pendingUsers, signupRequests, partnerAccountsDB]);

  // 이메일의 가입요청 알림들을 정리(삭제) — 관리자만 삭제 가능(rules)
  const clearSignupNotifs = async (email: string) => {
    const req = signupRequests.find((r) => r.email === email);
    if (!req) return;
    await Promise.all(
      req.notifIds.map((id) =>
        deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'notifications', id)).catch(() => {}),
      ),
    );
  };

  const handleApprove = async (email: string, company: string) => {
    const updated = { ...partnerAccountsDB, [email]: company };
    const filtered = pendingUsers.filter((e) => e !== email);
    try {
      await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'settings', 'master_settings'), {
        partnerAccounts: updated, pendingUsers: filtered,
      }, { merge: true });
      await clearSignupNotifs(email);
      showToast(`[${email}] 계정이 승인되었습니다.`);
    } catch (e) { showToast('승인 실패: ' + (e as Error).message); }
  };

  const handleReject = async (email: string) => {
    const filtered = pendingUsers.filter((e) => e !== email);
    try {
      await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'settings', 'master_settings'), {
        pendingUsers: filtered,
      }, { merge: true });
      await clearSignupNotifs(email);
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
          style={{ background: 'linear-gradient(135deg,rgba(24,168,216,.07),rgba(92,203,238,.03))' }}>
          <ShieldCheck size={15} className="text-sky-500" />
          <h3 className="font-black text-sky-700 text-sm">승인 대기 중 신규 가입자</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm min-w-[500px]">
            <thead>
              <tr style={{ background: 'linear-gradient(135deg,rgba(24,168,216,.1),rgba(92,203,238,.05))' }}>
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
                <th className="p-3 sm:p-4 font-bold text-slate-500 text-center w-40">비번 / 해제</th>
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
                  <td className="p-2 sm:p-4 text-center whitespace-nowrap">
                    <button onClick={() => setPwTarget(email)} className="bg-sky-100 hover:bg-sky-500 hover:text-white text-sky-700 font-bold py-1.5 px-3 rounded-lg transition-colors shadow-sm text-xs mr-1 inline-flex items-center gap-1">
                      <KeyRound size={13} /> 비번설정
                    </button>
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

      {pwTarget && (
        <SetPasswordModal email={pwTarget} onClose={() => setPwTarget(null)} showToast={showToast} />
      )}
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

// ── 관리자가 회원사 비밀번호를 직접 설정하는 모달 ─────────────────────────
function SetPasswordModal({ email, onClose, showToast }: { email: string; onClose: () => void; showToast: (m: string) => void }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    setErr('');
    if (pw.length < 6) { setErr('비밀번호는 6자리 이상이어야 합니다.'); return; }
    if (pw !== pw2) { setErr('두 비밀번호가 일치하지 않습니다.'); return; }
    setLoading(true);
    try {
      const call = httpsCallable(functions, 'adminSetPassword');
      await call({ email, newPassword: pw });
      showToast(`[${email}] 비밀번호가 변경되었습니다. 회원사에 새 비밀번호를 전달하세요.`);
      onClose();
    } catch (e) {
      const msg = (e as { message?: string }).message || '비밀번호 변경에 실패했습니다.';
      setErr(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,.55)', backdropFilter: 'blur(3px)' }} onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 sm:p-8 anim-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-1">
          <KeyRound size={20} className="text-sky-600" />
          <h3 className="text-lg font-black text-slate-800">비밀번호 직접 설정</h3>
        </div>
        <p className="text-xs font-bold text-slate-500 mb-5">대상 계정: <span className="text-sky-600">{email}</span></p>
        <div className="space-y-3">
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="새 비밀번호 (6자리 이상)" className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm font-bold text-slate-800 outline-none focus:border-sky-500" />
          <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="새 비밀번호 확인" className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm font-bold text-slate-800 outline-none focus:border-sky-500" />
          {err && <p className="text-red-500 text-xs font-bold text-center bg-red-50 py-2 px-3 rounded-lg">{err}</p>}
        </div>
        <div className="flex gap-2 mt-6">
          <button onClick={onClose} disabled={loading} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-3 rounded-xl text-sm transition-colors disabled:opacity-50">취소</button>
          <button onClick={submit} disabled={loading} className="flex-1 btn-sky font-bold py-3 rounded-xl text-sm disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <span className="animate-spin">🔄</span> : <KeyRound size={15} />} 변경하기
          </button>
        </div>
        <p className="text-[10px] font-bold text-slate-400 mt-4 text-center leading-relaxed">
          ※ 변경 후 회원사에 새 비밀번호를 직접 전달해 주세요.<br />회원사는 로그인 후 프로필에서 다시 변경할 수 있습니다.
        </p>
      </div>
    </div>
  );
}
