import React, { useState } from 'react';
import {
  User, KeyRound, LogIn, UserPlus, Mail, Loader2,
  AlertCircle, CheckCircle2, ArrowLeft,
} from 'lucide-react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { addDoc, collection } from 'firebase/firestore';
import { auth, db, APP_ID } from '../../firebase';
import { APP_VERSION } from '../../constants/version';

interface LoginFormProps {
  onPendingRegistered: (email: string) => void;
}

// 화면 모드: 로그인 / 신규가입 / 비밀번호 재설정
type Mode = 'login' | 'signup' | 'reset';

export default function LoginForm({ onPendingRegistered }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>('login');

  const isSignUp = mode === 'signup';
  const isReset = mode === 'reset';

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
    setInfo('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setInfo('');
    try {
      if (isReset) {
        // ── 비밀번호 재설정 메일 발송 ──────────────────────────────
        if (!email.includes('@')) { setError('올바른 이메일 형식이 아닙니다.'); return; }
        await sendPasswordResetEmail(auth, email);
        setInfo(`${email} 주소로 비밀번호 재설정 메일을 보냈습니다. 메일함(스팸함 포함)을 확인해 새 비밀번호를 설정한 뒤 로그인해 주세요.`);
        return;
      }
      if (isSignUp) {
        // ── 신규 가입: Auth 계정 생성 + 관리자 승인요청 알림 ─────────
        await createUserWithEmailAndPassword(auth, email, password);
        try {
          // signupEmail 필드로 구조화 → UsersTab이 승인 대기 목록으로 파싱(정상 승인 루트 복구)
          await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'notifications'), {
            message: `[✅가입요청] 회원사(${email}) 계정등록 승인대기 요청이 있습니다.`,
            target: 'ADMIN',
            signupEmail: email,
            timestamp: new Date().toISOString(),
          });
        } catch {}
        onPendingRegistered(email);
      } else {
        // ── 로그인 ──────────────────────────────────────────────────
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === 'auth/email-already-in-use') {
        // 이미 가입된 이메일로 재가입 시도 → 로그인 유도(예전 이메일 정상 루트)
        setError('이미 가입된 이메일입니다. 로그인해 주세요. 비밀번호가 기억나지 않으면 아래 "비밀번호 찾기"를 이용하세요.');
        setMode('login');
      }
      else if (code === 'auth/weak-password') setError('비밀번호는 6자리 이상 설정해주세요.');
      else if (code === 'auth/invalid-email') setError('올바른 이메일 형식이 아닙니다.');
      else if (code === 'auth/user-not-found') setError('가입되지 않은 이메일입니다. "신규 계정 생성"으로 가입해 주세요.');
      else if (code === 'auth/missing-email') setError('이메일을 입력해 주세요.');
      else setError('인가되지 않은 계정이거나 정보가 일치하지 않습니다.');
    } finally {
      setLoading(false);
    }
  };

  const SubmitIcon = isReset ? Mail : isSignUp ? UserPlus : LogIn;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 font-sans relative">
      <div className="glass w-full max-w-md rounded-3xl p-7 sm:p-10 anim-in relative z-10">

        {/* 로고 — 얼음판 위에 놓인 배지 */}
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl flex items-center justify-center ice-float"
            style={{
              background: 'linear-gradient(180deg,#FFFFFF,#EAF6FC)',
              border: '1px solid rgba(24,168,216,.22)',
              boxShadow: '0 10px 26px rgba(10,95,130,.18), inset 0 1px 0 #fff',
            }}>
            <img src="/logo.png" alt="웰쉐어로지스 로고" className="w-14 h-14 sm:w-16 sm:h-16 object-contain"
              onError={(e) => (e.currentTarget.style.display = 'none')} />
          </div>
        </div>

        <div className="text-center mb-8">
          <h2 className="text-[10px] sm:text-xs font-bold text-sky-600 tracking-[0.2em] uppercase mb-1.5">
            (주)웰쉐어로지스 정산 System
          </h2>
          <h1 className="text-2xl sm:text-3xl font-black text-sky-900 tracking-tight">나라미 정산포털</h1>
          <p className="text-slate-500 text-xs sm:text-sm mt-3 font-medium break-keep">
            {isReset ? '가입한 이메일로 재설정 링크를 보내드립니다.' : '관리자 및 인가된 협력사 전용 보안 시스템입니다.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
          <div>
            <label htmlFor="login-email" className="block text-[11px] sm:text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
              이메일 계정
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none text-sky-500">
                <User size={18} aria-hidden="true" />
              </span>
              <input
                id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                required autoComplete="email"
                className="block w-full pl-11 pr-4 py-3 sm:py-3.5 bg-white border border-sky-200 rounded-xl text-sm font-bold text-sky-900 transition-all outline-none"
                placeholder="partner@wellshare.com"
              />
            </div>
          </div>

          {!isReset && (
            <div>
              <label htmlFor="login-password" className="block text-[11px] sm:text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                비밀번호
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none text-sky-500">
                  <KeyRound size={18} aria-hidden="true" />
                </span>
                <input
                  id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  required autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  className="block w-full pl-11 pr-4 py-3 sm:py-3.5 bg-white border border-sky-200 rounded-xl text-sm font-bold text-sky-900 transition-all outline-none"
                  placeholder="••••••••"
                />
              </div>
              {!isSignUp && (
                <div className="text-right mt-2">
                  <button type="button" onClick={() => switchMode('reset')}
                    className="text-[11px] sm:text-xs font-bold text-slate-400 hover:text-sky-700 transition-colors">
                    비밀번호를 잊으셨나요? 비밀번호 찾기
                  </button>
                </div>
              )}
            </div>
          )}

          {error && (
            <p role="alert" className="flex items-start gap-2 text-red-600 text-xs sm:text-sm font-bold bg-red-50 border border-red-200 py-2.5 px-3 rounded-xl break-keep">
              <AlertCircle size={16} className="shrink-0 mt-px" aria-hidden="true" />{error}
            </p>
          )}
          {info && (
            <p role="status" className="flex items-start gap-2 text-emerald-700 text-xs sm:text-sm font-bold bg-emerald-50 border border-emerald-200 py-2.5 px-3 rounded-xl break-keep">
              <CheckCircle2 size={16} className="shrink-0 mt-px" aria-hidden="true" />{info}
            </p>
          )}

          <button type="submit" disabled={loading}
            className="btn-sky w-full flex items-center justify-center gap-2 py-3.5 sm:py-4 text-sm sm:text-base">
            {loading
              ? <Loader2 size={18} className="animate-spin" aria-hidden="true" />
              : <SubmitIcon size={18} aria-hidden="true" />}
            {loading ? '처리 중…' : isReset ? '재설정 메일 보내기' : isSignUp ? '신규 계정 생성하기' : '시스템 접속'}
          </button>
        </form>

        <div className="mt-6 text-center border-t border-sky-100 pt-6 space-y-2">
          {isReset ? (
            <button onClick={() => switchMode('login')}
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-slate-500 hover:text-sky-700 transition-colors">
              <ArrowLeft size={15} aria-hidden="true" /> 로그인 화면으로 돌아가기
            </button>
          ) : (
            <button onClick={() => switchMode(isSignUp ? 'login' : 'signup')}
              className="text-xs sm:text-sm font-bold text-slate-500 hover:text-sky-700 transition-colors">
              {isSignUp ? '이미 계정이 있으신가요? 로그인하기' : '처음 오셨나요? 파트너사 신규 계정 생성'}
            </button>
          )}
          <p className="mt-4 text-[11px] font-bold text-slate-400 tracking-wider">v{APP_VERSION}</p>
        </div>
      </div>
    </div>
  );
}
