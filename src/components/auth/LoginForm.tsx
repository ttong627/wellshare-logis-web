import React, { useState } from 'react';
import { User } from 'lucide-react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from 'firebase/auth';
import { addDoc, collection } from 'firebase/firestore';
import { auth, db, APP_ID } from '../../firebase';
import { APP_VERSION } from '../../constants/version';

interface LoginFormProps {
  onPendingRegistered: (email: string) => void;
}

export default function LoginForm({ onPendingRegistered }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email, password);
        try {
          await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'notifications'), {
            message: `[✅가입요청] 회원사(${email}) 계정등록 승인대기 요청이 있습니다.`,
            target: 'ADMIN',
            timestamp: new Date().toISOString(),
          });
        } catch {}
        onPendingRegistered(email);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === 'auth/email-already-in-use') setError('이미 가입된 이메일 계정입니다.');
      else if (code === 'auth/weak-password') setError('비밀번호는 6자리 이상 설정해주세요.');
      else if (code === 'auth/invalid-email') setError('올바른 이메일 형식이 아닙니다.');
      else setError('인가되지 않은 계정이거나 정보가 일치하지 않습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ backgroundColor: '#f1f5f9' }} className="min-h-screen flex items-center justify-center p-4 font-sans">
      <div className="bg-white p-6 sm:p-10 rounded-2xl shadow-xl w-full max-w-md border border-gray-200">
        <div className="flex justify-center mb-6">
          <div className="bg-white p-2 sm:p-3 rounded-2xl shadow-sm border border-gray-100">
            <img src="/logo.png" alt="logo" className="w-16 h-16 sm:w-20 sm:h-20 object-contain" onError={(e) => (e.currentTarget.style.display = 'none')} />
          </div>
        </div>
        <div className="text-center mb-8">
          <h2 className="text-[10px] sm:text-xs font-bold text-blue-700 tracking-widest uppercase mb-1">(주)웰쉐어로지스 정산System</h2>
          <h1 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">나라미 정산포털</h1>
          <p className="text-slate-500 text-[10px] sm:text-sm mt-3 font-medium">관리자 및 인가된 협력사 전용 보안 시스템입니다.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
          <div>
            <label className="block text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 sm:mb-2">이메일 계정</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-3 sm:left-4 flex items-center pointer-events-none"><User size={18} /></span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="block w-full pl-10 sm:pl-12 pr-3 sm:pr-4 py-2.5 sm:py-3.5 bg-slate-50 border border-slate-200 rounded-lg sm:rounded-xl text-xs sm:text-sm font-bold text-slate-800 focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all outline-none" placeholder="partner@wellshare.com" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 sm:mb-2">비밀번호</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-3 sm:left-4 flex items-center pointer-events-none">🗝️</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="block w-full pl-10 sm:pl-12 pr-3 sm:pr-4 py-2.5 sm:py-3.5 bg-slate-50 border border-slate-200 rounded-lg sm:rounded-xl text-xs sm:text-sm font-bold text-slate-800 focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all outline-none" placeholder="••••••••" />
            </div>
          </div>
          {error && <p className="text-red-500 text-[10px] sm:text-sm font-bold text-center bg-red-50 py-2 rounded-lg">{error}</p>}
          <button type="submit" disabled={loading} className={`w-full flex items-center justify-center gap-2 font-bold py-3 sm:py-4 rounded-lg sm:rounded-xl shadow-md transition-all disabled:opacity-50 text-xs sm:text-base ${isSignUp ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-slate-800 hover:bg-slate-900 text-white'}`}>
            {loading ? <span className="animate-spin">🔄</span> : <span>{isSignUp ? '📝' : '🔑'}</span>}
            {isSignUp ? '신규 계정 생성하기' : '시스템 접속'}
          </button>
        </form>

        <div className="mt-5 sm:mt-6 text-center border-t border-slate-100 pt-5 sm:pt-6">
          <button onClick={() => { setIsSignUp(!isSignUp); setError(''); }} className="text-[10px] sm:text-sm font-bold text-slate-500 hover:text-blue-600 transition-colors">
            {isSignUp ? '이미 계정이 있으신가요? 로그인하기' : '처음 오셨나요? 파트너사 신규 계정 생성'}
          </button>
          <p className="mt-4 text-[10px] font-bold text-slate-300 tracking-wider">v{APP_VERSION}</p>
        </div>
      </div>
    </div>
  );
}
