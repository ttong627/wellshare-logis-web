import React, { useState, useEffect } from 'react';
import { User, Lock, Bell } from 'lucide-react';
import { updatePassword } from 'firebase/auth';
import { auth } from '../../firebase';
import { safeRender } from '../../lib/utils';
import { useApp } from '../../context/AppContext';
import { isKakaoConnected, connectKakao, disconnectKakao } from '../../lib/kakao';

export default function AccountTab() {
  const { isAdmin, partnerCompany, user, showToast, signOut } = useApp();
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [kakaoConnected, setKakaoConnected] = useState(false);
  const [kakaoLoading, setKakaoLoading] = useState(false);
  const hasKakaoKey = !!import.meta.env.VITE_KAKAO_JS_KEY;

  useEffect(() => { setKakaoConnected(isKakaoConnected()); }, []);

  const handleConnectKakao = async () => {
    setKakaoLoading(true);
    try {
      await connectKakao();
      setKakaoConnected(true);
      showToast('카카오톡 알림이 연결되었습니다.');
    } catch (e) {
      showToast('카카오 연결 실패: ' + (e as Error).message);
    } finally { setKakaoLoading(false); }
  };

  const handleDisconnectKakao = () => {
    disconnectKakao();
    setKakaoConnected(false);
    showToast('카카오톡 알림 연결이 해제되었습니다.');
  };

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

      {/* Kakao */}
      {isAdmin && (
        <div className="glass rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-sky-100">
            <Bell size={16} className="text-sky-500" />
            <h3 className="font-black text-sky-700 text-sm">카카오톡 알림 연결</h3>
          </div>
          <p className="text-xs text-sky-500 font-medium">파트너사 실적 입력, 결제 요청 등 새 알림을 관리자 카카오톡으로 즉시 전송합니다.</p>

          {!hasKakaoKey ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-xs text-red-700 font-bold space-y-1">
              <p>⚠️ <code>VITE_KAKAO_JS_KEY</code> / <code>VITE_KAKAO_REST_KEY</code> 환경변수가 설정되지 않았습니다.</p>
            </div>
          ) : kakaoConnected ? (
            <div className="flex items-center justify-between bg-yellow-50 border border-yellow-200 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">✅</span>
                <div>
                  <p className="font-bold text-yellow-800 text-sm">카카오톡 연결됨</p>
                  <p className="text-xs text-yellow-600">새 알림을 카카오톡으로 수신 중</p>
                </div>
              </div>
              <button onClick={handleDisconnectKakao}
                className="text-xs font-bold text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-3 py-1.5 rounded-xl transition-colors">
                연결 해제
              </button>
            </div>
          ) : (
            <button onClick={handleConnectKakao} disabled={kakaoLoading}
              className="w-full bg-yellow-400 hover:bg-yellow-500 disabled:opacity-60 text-yellow-900 font-black py-3 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm shadow-sm"
              style={{ boxShadow: '0 6px 0 rgba(161,98,7,.4), 0 8px 20px rgba(234,179,8,.3)' }}>
              <span className="text-xl">💬</span>
              {kakaoLoading ? '연결 중...' : '카카오톡으로 알림 받기'}
            </button>
          )}

          <div className="bg-sky-50/70 rounded-xl p-3 border border-sky-100 text-xs text-sky-600 space-y-1">
            <p className="font-bold text-sky-700">설정 방법 (최초 1회)</p>
            <p>1. <a href="https://developers.kakao.com" target="_blank" rel="noreferrer" className="text-sky-500 underline">developers.kakao.com</a> → 내 애플리케이션 → 앱 선택</p>
            <p>2. 플랫폼 → Web → 사이트 도메인: <code>https://wellshare-logis.web.app</code></p>
            <p>3. 카카오 로그인 → 활성화 ON, Redirect URI 추가:</p>
            <p className="ml-3 font-bold text-sky-700 bg-sky-100 rounded-lg px-2 py-1 select-all">https://wellshare-logis.web.app/kakao-callback.html</p>
          </div>
        </div>
      )}
    </div>
  );
}
