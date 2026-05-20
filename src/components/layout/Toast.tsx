import React from 'react';

interface ToastProps { message: string | null; }

export default function Toast({ message }: ToastProps) {
  if (!message) return null;
  return (
    <div
      className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 px-7 py-4 rounded-2xl animate-in fade-in slide-in-from-bottom-4 duration-300"
      style={{
        background: 'linear-gradient(135deg, #0284c7 0%, #0ea5e9 60%, #38bdf8 100%)',
        boxShadow: '0 8px 32px rgba(14,165,233,.55), 0 2px 8px rgba(0,0,0,.12), inset 0 1px 0 rgba(255,255,255,.25)',
        border: '1px solid rgba(255,255,255,.25)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <span className="text-xl">✅</span>
      <span className="text-white font-black text-base" style={{ textShadow: '0 1px 4px rgba(0,0,0,.2)' }}>{message}</span>
    </div>
  );
}
