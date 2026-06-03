import React, { useState } from 'react';
import { User, Lock } from 'lucide-react';
import { updatePassword } from 'firebase/auth';
import { auth } from '../../firebase';
import { safeRender } from '../../lib/utils';
import { useApp } from '../../context/AppContext';

export default function AccountTab() {
  const { isAdmin, partnerCompany, user, showToast, signOut } = useApp();
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) return showToast('비밀번호는 6자리 이상이어야 합니다.');
    if (newPassword !== newPasswordConfirm) return showToast('비밀번호 확인이 일치하지 않습니다.');
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    try {
      await updatePassword(currentUser, newPassword);
      showToast('비밀번호가 성공적으로 변경되었습니다.');
      setNewPassword(''); setNewPasswordConfirm('');
    } catch (error: unknown) {
      const code = (error as { code?: string }).code;
      if (code === 'auth/requires-recent-login') {
        showToast('보안을 위해 다시 로그인한 후 변경해주세요.');
        signOut();
      } else { showToast('변경 실패: ' + (error as Error).message); }
    }
  };

  const inputCls = "w-full border border-sky-200 rounded-xl px-3 py-2.5 text-sm font-medium outline-none bg-sky-50/50 focus:border-sky-400 transition-colors";

  return (
    <div className="anim-in space-y-5 max-w-2xl mx-auto">
      <div className="sky-hero p-6 sm:p-8 text-white">
        <div className="flex items-center gap-3 relative z-10">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(255,255,255,.18)', backdropFilter: 'blur(8px)' }}>
            <User size={22} className="text-white" />
          </div>
          <div>
            <div className="text-sky-200 text-[10px] font-bold uppercase tracking-widest mb-0.5">My Account</div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight" style={{ textShadow: '0 2px 8px rgba(0,0,0,.2)' }}>
              내 계정 관리
            </h2>
          </div>
        </div>
      </div>

      {/* Profile info */}
      <div className="glass rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-sky-100">
          <User size={16} className="text-sky-500" />
          <h3 className="font-black text-sky-700 text-sm">계정 정보</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-sky-50/70 rounded-xl p-4 border border-sky-100">
            <div className="text-[10px] font-bold text-sky-500 uppercase tracking-widest mb-1">소속 등급</div>
            <div className="text-base font-black text-slate-800">{isAdmin ? '최고 관리자 (본사)' : safeRender(partnerCompany)}</div>
          </div>
          <div className="bg-sky-50/70 rounded-xl p-4 border border-sky-100">
            <div className="text-[10px] font-bold text-sky-500 uppercase tracking-widest mb-1">로그인 이메일</div>
            <div className="text-sm font-bold text-sky-600 truncate">{safeRender(user?.email)}</div>
          </div>
        </div>
      </div>

      {/* Password change */}
      <div className="glass rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-sky-100">
          <Lock size={16} className="text-sky-500" />
          <h3 className="font-black text-sky-700 text-sm">비밀번호 변경</h3>
        </div>
        <form onSubmit={handlePasswordChange} className="space-y-3">
          <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
            placeholder="새 비밀번호 (6자리 이상)" className={inputCls} />
          <input type="password" value={newPasswordConfirm} onChange={e => setNewPasswordConfirm(e.target.value)}
            placeholder="새 비밀번호 확인" className={inputCls} />
          {newPassword && newPasswordConfirm && newPassword !== newPasswordConfirm && (
            <p className="text-red-500 text-xs font-bold px-1">비밀번호가 서로 일치하지 않습니다.</p>
          )}
          <button type="submit"
            disabled={!newPassword || newPassword.length < 6 || newPassword !== newPasswordConfirm}
            className="w-full btn-sky py-3 rounded-xl font-bold text-sm disabled:opacity-50">
            안전하게 변경하기
          </button>
        </form>
      </div>

    </div>
  );
}
