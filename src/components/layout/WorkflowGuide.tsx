import React, { useState } from 'react';
import { PenTool, CheckSquare, CreditCard, ReceiptText, XCircle } from 'lucide-react';
import { useEscToClose } from '../../hooks/useEscToClose';

interface WorkflowGuideProps {
  loginCount: number;
  onClose: () => void;
}

export default function WorkflowGuide({ loginCount, onClose }: WorkflowGuideProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const handleClose = () => {
    if (dontShowAgain) localStorage.setItem('hideWorkflowGuide', 'true');
    onClose();
  };
  useEscToClose(true, handleClose);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
        <div className="ws-grad px-6 py-4 flex justify-between items-center shrink-0">
          <h3 className="font-black text-white text-lg sm:text-xl flex items-center gap-2">🚀 웰쉐어 4단계 정산 핑퐁 가이드</h3>
          <button onClick={handleClose} className="text-blue-200 hover:text-white transition-colors"><XCircle size={24} /></button>
        </div>
        <div className="p-6 overflow-y-auto space-y-6">
          <p className="text-slate-600 font-bold text-sm">업무의 실수를 막고 정확한 정산을 위해 아래 순서대로 시스템을 조작해 주십시오.</p>
          <div className="space-y-4">
            <div className="flex items-start gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div className="bg-slate-800 text-white p-2 rounded-lg shrink-0"><PenTool size={20} /></div>
              <div>
                <h4 className="font-black text-slate-800 text-base mb-1">1단계: 지역포수 입력</h4>
                <p className="text-xs font-bold text-slate-500">배송할 수량을 입력하고 각 지자체 행에 있는 <span className="text-emerald-600">저장</span> 버튼을 누릅니다.</p>
              </div>
            </div>
            <div className="flex items-start gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div className="bg-slate-800 text-white p-2 rounded-lg shrink-0"><CheckSquare size={20} /></div>
              <div>
                <h4 className="font-black text-slate-800 text-base mb-1">2단계: 배송완료 처리</h4>
                <p className="text-xs font-bold text-slate-500">실제 배송이 끝나면 날짜와 지체일을 입력하고 <span className="text-emerald-600">저장</span> 버튼을 누릅니다.</p>
              </div>
            </div>
            <div className="flex items-start gap-4 p-4 bg-blue-50 rounded-xl border border-blue-200">
              <div className="bg-blue-600 text-white p-2 rounded-lg shrink-0"><CreditCard size={20} /></div>
              <div>
                <h4 className="font-black text-blue-900 text-base mb-1">3단계: 계산서 요청 <span className="text-[10px] bg-blue-200 text-blue-800 px-1.5 py-0.5 rounded ml-1">본사 전용</span></h4>
                <p className="text-xs font-bold text-blue-700">본사에서 배송 완료를 확인한 후, 결제내역 메뉴에서 파트너사에게 세금계산서 발행을 <span className="text-orange-600">요청</span>합니다.</p>
              </div>
            </div>
            <div className="flex items-start gap-4 p-4 bg-emerald-50 rounded-xl border border-emerald-200">
              <div className="bg-emerald-600 text-white p-2 rounded-lg shrink-0"><ReceiptText size={20} /></div>
              <div>
                <h4 className="font-black text-emerald-900 text-base mb-1">4단계: 내역확인 및 발급 <span className="text-[10px] bg-emerald-200 text-emerald-800 px-1.5 py-0.5 rounded ml-1">파트너 전용</span></h4>
                <p className="text-xs font-bold text-emerald-700">본사의 요청 알림을 확인하고, 내역확인 탭에서 실제 계산서 발행일을 지정한 뒤 <span className="text-blue-600">발급</span>을 누르면 핑퐁 완료!</p>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 shrink-0 flex flex-col gap-3">
          {loginCount >= 3 && (
            <label className="flex items-center gap-2 cursor-pointer w-max">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
              />
              <span className="text-sm font-bold text-slate-600">앞으로 팝업창 보지 않기</span>
            </label>
          )}
          <button onClick={handleClose} className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 rounded-xl transition-colors shadow-sm text-sm">
            확인했습니다 (닫기)
          </button>
        </div>
      </div>
    </div>
  );
}
