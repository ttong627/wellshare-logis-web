import React, { useRef } from 'react';
import { DatabaseBackup, Save } from 'lucide-react';
import { getDocs, collection, doc, writeBatch } from 'firebase/firestore';
import { db, APP_ID } from '../../firebase';
import { useApp } from '../../context/AppContext';

export default function BackupTab() {
  const { showToast, isSaving, setIsSaving } = useApp();
  const restoreInputRef = useRef<HTMLInputElement>(null);

  const handleBackup = async () => {
    setIsSaving(true);
    try {
      const billingSnap = await getDocs(collection(db, 'artifacts', APP_ID, 'public', 'data', 'billing_records'));
      const settingsSnap = await getDocs(collection(db, 'artifacts', APP_ID, 'public', 'data', 'settings'));
      const backupData: Record<string, Record<string, unknown>> = { billing_records: {}, settings: {} };
      billingSnap.forEach(d => { backupData.billing_records[d.id] = d.data(); });
      settingsSnap.forEach(d => { backupData.settings[d.id] = d.data(); });
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(backupData, null, 2));
      const a = document.createElement('a');
      a.setAttribute('href', dataStr);
      a.setAttribute('download', `wellshare_backup_${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(a);
      a.click();
      a.remove();
      showToast('전체 데이터 백업이 안전하게 완료되었습니다.');
    } catch (e) { showToast('백업 실패: ' + (e as Error).message); }
    finally { setIsSaving(false); }
  };

  // Firestore 배치는 500건 제한이라 안전하게 400건씩 끊어 커밋한다.
  const BATCH_CHUNK = 400;
  const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsSaving(true);
    let committed = 0;
    let total = 0;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const writes: Array<[string, string, Record<string, unknown>]> = [];
      if (data.billing_records) {
        for (const [id, val] of Object.entries(data.billing_records)) {
          writes.push(['billing_records', id, val as Record<string, unknown>]);
        }
      }
      if (data.settings) {
        for (const [id, val] of Object.entries(data.settings)) {
          writes.push(['settings', id, val as Record<string, unknown>]);
        }
      }
      total = writes.length;
      // ⚠️ 2026-07-11 점검 발견: 기존엔 문서를 하나씩 setDoc해서 중간에 실패하면 일부 월만
      // 복원된 채 멈췄다 — writeBatch로 묶어 청크 단위 원자성을 확보하고, 실패 시 몇 건까지
      // 반영됐는지 사용자에게 정확히 안내한다.
      for (let i = 0; i < writes.length; i += BATCH_CHUNK) {
        const chunk = writes.slice(i, i + BATCH_CHUNK);
        const batch = writeBatch(db);
        for (const [col, id, val] of chunk) {
          batch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', col, id), val);
        }
        await batch.commit();
        committed += chunk.length;
      }
      showToast(`데이터 복원이 완료되었습니다(${committed}/${total}건). 페이지를 새로고침 해주세요.`);
    } catch (err) {
      showToast(`복원 실패(${committed}/${total}건까지 반영됨): ${(err as Error).message}`);
    }
    finally { setIsSaving(false); if (e.target) e.target.value = ''; }
  };

  return (
    <div className="animate-in fade-in duration-500 space-y-6 sm:space-y-8 max-w-2xl mx-auto mt-4 sm:mt-10">
      <div className="glass rounded-2xl p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-5 pb-3 border-b border-sky-100">
          <DatabaseBackup size={20} className="text-sky-500" />
          <h2 className="text-base font-black text-sky-700">데이터 백업 / 복원</h2>
        </div>
        <div className="space-y-4">
          <button
            onClick={handleBackup}
            disabled={isSaving}
            className="w-full flex items-center justify-center gap-2 btn-sky py-3 px-6 rounded-xl font-bold disabled:opacity-50"
          >
            <Save size={18} /> 전체 데이터 백업 (JSON 다운로드)
          </button>
          <div className="border-t border-sky-100 pt-4">
            <p className="text-xs font-bold text-red-500 mb-3">⚠️ 복원 시 기존 데이터가 덮어써집니다. 신중하게 진행하세요.</p>
            <button
              onClick={() => restoreInputRef.current?.click()}
              disabled={isSaving}
              className="w-full flex items-center justify-center gap-2 text-white font-bold py-3 px-6 rounded-xl transition-colors shadow-sm disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg,#f97316,#ea580c)', boxShadow: '0 6px 0 rgba(154,52,18,.6), 0 8px 20px rgba(249,115,22,.35)' }}
            >
              <DatabaseBackup size={18} /> 백업 파일로 복원하기
            </button>
            <input ref={restoreInputRef} type="file" accept=".json" className="hidden" onChange={handleRestore} />
          </div>
        </div>
      </div>

    </div>
  );
}
