import React, { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import { useEscToClose } from '../../hooks/useEscToClose';

// 금전 직결 액션(세금계산서 발급/취소 등)의 실수 방지용 확인 다이얼로그.
// AppContext를 건드리지 않도록 각 탭에서 로컬로 사용한다.
//   const { confirm, dialog } = useConfirm();
//   if (await confirm({ title: '...', tone: 'danger' })) { /* 실행 */ }
//   ... return ( <>{dialog} ...</> )

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: 'default' | 'danger';
}

interface ConfirmState extends ConfirmOptions {
  open: boolean;
}

export function useConfirm() {
  const [state, setState] = useState<ConfirmState>({ open: false, title: '' });
  const resolver = useRef<(v: boolean) => void>(() => {});

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    setState({ ...opts, open: true });
    return new Promise<boolean>((resolve) => { resolver.current = resolve; });
  }, []);

  const close = useCallback((result: boolean) => {
    setState((s) => ({ ...s, open: false }));
    resolver.current(result);
  }, []);

  const isDanger = state.tone === 'danger';

  useEscToClose(state.open, () => close(false));

  const dialog = state.open
    ? createPortal(
        <div
          className="confirm-scrim fixed inset-0 z-[9999] flex items-center justify-center p-4"
          style={{ background: 'rgba(2,23,49,0.5)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
          onClick={() => close(false)}
        >
          <div
            className="confirm-pop glass rounded-3xl p-6 sm:p-7 max-w-sm w-full text-center"
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: isDanger ? '#fef2f2' : '#eff6ff' }}
            >
              {isDanger
                ? <AlertTriangle size={28} className="text-red-500" />
                : <HelpCircle size={28} className="text-sky-500" />}
            </div>
            <h3 className="text-lg font-black text-slate-800 mb-2 break-keep">{state.title}</h3>
            {state.message && (
              <p className="text-sm font-medium text-slate-500 mb-6 whitespace-pre-line break-keep leading-relaxed">
                {state.message}
              </p>
            )}
            {!state.message && <div className="mb-6" />}
            <div className="flex gap-2">
              <button
                onClick={() => close(false)}
                className="flex-1 py-3 rounded-2xl font-bold text-sm bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
              >
                {state.cancelText || '취소'}
              </button>
              <button
                onClick={() => close(true)}
                className={`flex-1 py-3 rounded-2xl font-bold text-sm text-white transition-colors shadow-md hover:brightness-105 ${isDanger ? '' : 'ws-grad-soft'}`}
                style={isDanger ? { background: '#DC2626' } : undefined}
              >
                {state.confirmText || '확인'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )
    : null;

  return { confirm, dialog };
}
