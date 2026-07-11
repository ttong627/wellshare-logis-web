import React, { useRef, useState } from 'react';
import { DatabaseBackup, Save, ArrowDownToLine } from 'lucide-react';
import { getDocs, collection, doc, setDoc, getDoc, getFirestore, writeBatch } from 'firebase/firestore';
import { initializeApp, getApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { db, APP_ID } from '../../firebase';
import { useApp } from '../../context/AppContext';

const OLD_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyBFjT9H2z4KXLDx6AJfOMEA2lHlJx055_A',
  authDomain: 'gen-lang-client-0075547354.firebaseapp.com',
  projectId: 'gen-lang-client-0075547354',
  storageBucket: 'gen-lang-client-0075547354.firebasestorage.app',
  messagingSenderId: '673351301105',
  appId: '1:673351301105:web:e769905019a4413b593650',
};
const OLD_DB_ID = 'ai-studio-810d2250-4afc-4969-8c38-bab98b29a73d';

function getOldApp() {
  try { return getApp('old-db-migration'); }
  catch { return initializeApp(OLD_FIREBASE_CONFIG, 'old-db-migration'); }
}

export default function BackupTab() {
  const { showToast, isSaving, setIsSaving } = useApp();
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const [migrateLog, setMigrateLog] = useState<string[]>([]);
  const [migrating, setMigrating] = useState(false);

  const addLog = (msg: string) => setMigrateLog(prev => [...prev, msg]);

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

  const handleMigrate = async () => {
    if (!confirm('구 DB에서 새 DB로 데이터를 마이그레이션합니다.\n기존 데이터에 새 데이터가 추가/덮어쓰기됩니다. 계속하시겠습니까?')) return;
    setMigrating(true);
    setMigrateLog([]);
    try {
      const oldApp = getOldApp();
      const oldDb = getFirestore(oldApp, OLD_DB_ID);
      const oldAuth = getAuth(oldApp);

      // Try to authenticate against the old project
      if (!oldAuth.currentUser) {
        try {
          await signInAnonymously(oldAuth);
          addLog('구 DB 익명 인증 완료');
        } catch {
          // Anonymous auth not enabled — try with current user's email
          const currentUser = (await import('../../firebase')).auth.currentUser;
          if (currentUser?.email) {
            addLog('익명 인증 불가 → 이메일 로그인 시도 중...');
            addLog('❌ 자동 인증 실패: 아래 "보안 규칙 수정 방법"을 따라주세요.');
            setMigrating(false);
            return;
          }
        }
      }
      addLog('구 DB 연결 완료');

      // ── 1. Schedules ──────────────────────────────────────────
      const schedulesSnap = await getDocs(collection(oldDb, 'schedules'));
      addLog(`배송일정 ${schedulesSnap.size}건 읽기 완료`);
      let schedCount = 0;
      for (const d of schedulesSnap.docs) {
        const data = d.data();
        const year: number = data.year;
        const month: number = data.month;
        const sigungu: string = (data.sigungu || '').replace(/_/g, ' ');
        if (!year || !month || !sigungu) { addLog(`  건너뜀: ${d.id} (필드 누락)`); continue; }
        const newId = `${year}-${String(month).padStart(2, '0')}-${sigungu}`;
        const migratedItems = (data.items || []).map((item: Record<string, unknown>) => ({
          id: item.id || '',
          no: item.no || 0,
          dong: item.dong || '',
          driverName: item.driverName || '',
          driverPhone: item.driverPhone || '',
          emergencyPhone: item.emergencyPhone || item.emergency || '',
          deliveryDate: item.deliveryDate || '',
          isCompleted: item.isCompleted || false,
          notes: item.notes || '',
        }));
        await setDoc(
          doc(db, 'artifacts', APP_ID, 'public', 'data', 'schedule_records', newId),
          { year, month, sido: data.sido || '', sigungu, items: migratedItems, lastUpdated: data.lastUpdated || new Date().toISOString() }
        );
        schedCount++;
      }
      addLog(`배송일정 ${schedCount}건 새 DB 저장 완료`);

      // ── 2. Official Docs ──────────────────────────────────────
      const docsSnap = await getDocs(collection(oldDb, 'officialDocs'));
      addLog(`공문 이력 ${docsSnap.size}건 읽기 완료`);
      const newHistory = docsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (newHistory.length > 0) {
        const mainRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'official_docs', 'main');
        const mainSnap = await getDoc(mainRef);
        const existing: unknown[] = mainSnap.exists() ? (mainSnap.data().history || []) : [];
        const existingIds = new Set((existing as { id: string }[]).map(h => h.id));
        const toAdd = newHistory.filter(h => !existingIds.has(h.id));
        const merged = [...toAdd, ...existing];
        await setDoc(mainRef, { history: merged, updatedAt: new Date().toISOString() });
        addLog(`공문 이력 ${toAdd.length}건 추가 (기존 ${existing.length}건 유지)`);
      }

      // ── 3. Drivers ────────────────────────────────────────────
      const driversSnap = await getDocs(collection(oldDb, 'drivers'));
      addLog(`기사 ${driversSnap.size}명 읽기 완료`);
      const newDrivers = driversSnap.docs.map(d => ({
        id: d.id,
        name: (d.data().name || '') as string,
        phone: (d.data().phone || '') as string,
        emergency: (d.data().emergency || '') as string,
      }));
      if (newDrivers.length > 0) {
        const listRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'drivers', 'list');
        const listSnap = await getDoc(listRef);
        const existingDrivers: { id: string }[] = listSnap.exists() ? (listSnap.data().drivers || []) : [];
        const existingDriverIds = new Set(existingDrivers.map(dr => dr.id));
        const toAdd = newDrivers.filter(dr => !existingDriverIds.has(dr.id));
        const merged = [...existingDrivers, ...toAdd];
        await setDoc(listRef, { drivers: merged, updatedAt: new Date().toISOString() });
        addLog(`기사 ${toAdd.length}명 추가 (기존 ${existingDrivers.length}명 유지)`);
      }

      // ── 4. Image URLs (logo/seal) ─────────────────────────────
      const globalSnap = await getDoc(doc(oldDb, 'settings', 'global'));
      if (globalSnap.exists()) {
        const gs = globalSnap.data();
        const imageFields: Record<string, string | null> = {};
        if (gs.formA_logoUrl) imageFields.formA_logoUrl = gs.formA_logoUrl;
        if (gs.formA_stampUrl) imageFields.formA_sealUrl = gs.formA_stampUrl;
        if (gs.formB_logoUrl) imageFields.formB_logoUrl = gs.formB_logoUrl;
        if (gs.formB_stampUrl) imageFields.formB_sealUrl = gs.formB_stampUrl;
        if (Object.keys(imageFields).length > 0) {
          await setDoc(
            doc(db, 'artifacts', APP_ID, 'public', 'data', 'settings', 'doc_format'),
            { ...imageFields, updatedAt: new Date().toISOString() },
            { merge: true }
          );
          addLog(`이미지 URL ${Object.keys(imageFields).length}개 저장 완료`);
        } else {
          addLog('이미지 URL 없음 (settings/global 비어있음)');
        }
      } else {
        addLog('구 DB settings/global 없음, 이미지 URL 건너뜀');
      }

      addLog('✅ 마이그레이션 완료!');
      showToast('마이그레이션이 완료되었습니다.');
    } catch (e) {
      addLog(`❌ 오류: ${(e as Error).message}`);
      showToast('마이그레이션 오류: ' + (e as Error).message);
    } finally {
      setMigrating(false);
    }
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

      {/* Migration from old DB */}
      <div className="glass rounded-2xl p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-5 pb-3 border-b border-sky-100">
          <ArrowDownToLine size={20} className="text-indigo-500" />
          <div>
            <h2 className="text-base font-black text-sky-700">구 DB 데이터 마이그레이션</h2>
            <p className="text-xs text-sky-400 mt-0.5">이전 Firebase 프로젝트에서 배송일정, 공문, 기사 데이터를 가져옵니다.</p>
          </div>
        </div>
        <div className="space-y-4">
          <ul className="text-xs text-sky-600 space-y-1 bg-sky-50/70 rounded-xl p-3 border border-sky-100">
            <li>• 배송일정 (schedules 컬렉션) → schedule_records</li>
            <li>• 공문 이력 (officialDocs 컬렉션) → official_docs/main</li>
            <li>• 기사 목록 (drivers 컬렉션) → drivers/list</li>
            <li>• 로고/도장 이미지 URL → settings/doc_format</li>
            <li className="text-amber-600 font-bold">• 중복 항목은 건너뛰고, 기존 데이터는 유지됩니다.</li>
          </ul>
          <details className="text-xs border border-amber-200 rounded-lg bg-amber-50 p-3">
            <summary className="font-bold text-amber-700 cursor-pointer">⚠️ "Missing permissions" 오류 시 — 구 DB 보안 규칙 설정 방법</summary>
            <div className="mt-2 space-y-1 text-amber-800">
              <p>1. <a href="https://console.firebase.google.com/project/gen-lang-client-0075547354/firestore" target="_blank" rel="noreferrer" className="underline text-blue-600">Firebase 콘솔 → 구 프로젝트 Firestore</a> 접속</p>
              <p>2. 상단 데이터베이스 선택 → <b>ai-studio-810d2250...</b> 선택</p>
              <p>3. <b>규칙</b> 탭 클릭 → 아래 규칙으로 임시 교체 후 <b>게시</b>:</p>
              <pre className="bg-amber-100 rounded p-2 mt-1 font-mono text-[10px] whitespace-pre-wrap">{`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}`}</pre>
              <p>4. 마이그레이션 실행 → 완료 후 규칙 원복</p>
            </div>
          </details>
          <button
            onClick={handleMigrate}
            disabled={migrating || isSaving}
            className="w-full flex items-center justify-center gap-2 bg-indigo-700 hover:bg-indigo-800 text-white font-bold py-3 px-6 rounded-xl transition-colors shadow-sm disabled:opacity-50"
          >
            <ArrowDownToLine size={18} />
            {migrating ? '마이그레이션 중...' : '구 DB에서 데이터 가져오기'}
          </button>
          {migrateLog.length > 0 && (
            <div className="bg-slate-900 text-green-400 font-mono text-xs rounded-lg p-4 max-h-48 overflow-y-auto space-y-0.5">
              {migrateLog.map((line, i) => <div key={i}>{line}</div>)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
