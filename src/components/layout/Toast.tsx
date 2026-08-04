import React from 'react';
import { CheckCircle2 } from 'lucide-react';

interface ToastProps { message: string | null; }

export default function Toast({ message }: ToastProps) {
  if (!message) return null;
  return (
    <div
      className="ws-grad fixed bottom-10 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 px-7 py-4 rounded-2xl animate-in fade-in slide-in-from-bottom-4 duration-300"
      style={{
        boxShadow: '0 10px 30px rgba(14,127,168,.34), 0 2px 8px rgba(15,41,66,.10), inset 0 1px 0 rgba(255,255,255,.28)',
        border: '1px solid rgba(255,255,255,.28)',
      }}
    >
      <CheckCircle2 size={22} className="shrink-0" aria-hidden="true" />
      <span className="text-white font-black text-base" style={{ textShadow: '0 1px 4px rgba(0,0,0,.2)' }}>{message}</span>
    </div>
  );
}
