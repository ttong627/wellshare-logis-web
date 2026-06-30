// 명단 탭 — 정부양곡 배송 명단(인수지시서·대상자 명단)을 회원사가 다운로드.
//   · 회원사: 자기 담당 지역(PARTNER_REGIONS)의 월별 명단 파일만 노출·다운로드
//   · 관리자(본사): 지역·월 선택 후 파일 업로드/삭제로 명단 배포 관리
//   보안: Storage 다운로드는 로그인 게이트(storage.rules), 메타는 인증 읽기·관리자 쓰기.
//   수급자 개인정보(PII)이므로 UI는 담당 지역만 보여주고, 파일은 클릭 시 즉시 받도록만 한다(미리보기 없음).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection, onSnapshot, addDoc, deleteDoc, doc, query, orderBy,
} from 'firebase/firestore';
import {
  ref as storageRef, uploadBytes, getDownloadURL, deleteObject,
} from 'firebase/storage';
import {
  ClipboardList, Download, Trash2, UploadCloud, Loader2, FileSpreadsheet, Lock,
} from 'lucide-react';
import { db, storage, APP_ID } from '../../firebase';
import { useApp } from '../../context/AppContext';
import { PARTNER_REGIONS } from '../../constants/members';
import { useConfirm } from '../shared/useConfirm';

// 명단 파일 메타(Firestore: artifacts/{APP_ID}/public/data/rosters)
interface RosterFile {
  id: string;
  region: string;       // 담당 지역 키 (PARTNER_REGIONS와 동일 문자열: 예 '동대문구','여주시')
  month: string;        // YYYY-MM
  category: string;     // 수급자 / 차상위 / 인수지시서 / 전체 등
  fileName: string;     // 원본 파일명(한글 유지)
  contentType: string;
  size: number;
  storagePath: string;  // Storage 경로
  note?: string;        // 비밀번호 등 안내(예: '엑셀 암호 2729')
  adminOnly?: boolean;  // true=본사 관리자 전용(회원사 비노출·다운로드 차단, 부천 메일함 명단 등)
  uploadedAt: string;
  uploadedBy?: string;
}

const ROSTERS_PATH = ['artifacts', APP_ID, 'public', 'data', 'rosters'] as const;
const ALL_REGIONS = Object.keys(PARTNER_REGIONS)
  .flatMap((c) => PARTNER_REGIONS[c])
  .filter((v, i, a) => a.indexOf(v) === i)
  .sort();

const fmtSize = (n: number) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`;

export default function RosterTab() {
  const { user, isAdmin, partnerCompany, currentMonth, showToast } = useApp();
  const { confirm, dialog } = useConfirm();

  const [files, setFiles] = useState<RosterFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  // 관리자 업로드 폼 상태
  const [upRegion, setUpRegion] = useState<string>(ALL_REGIONS[0] || '');
  const [upMonth, setUpMonth] = useState<string>(currentMonth);
  const [upCategory, setUpCategory] = useState<string>('전체');
  const [upNote, setUpNote] = useState<string>('');
  const [upAdminOnly, setUpAdminOnly] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { setUpMonth(currentMonth); }, [currentMonth]);

  // 실시간 구독 (월 내림차순)
  useEffect(() => {
    const q = query(collection(db, ...ROSTERS_PATH), orderBy('month', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setFiles(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<RosterFile, 'id'>) })));
        setLoading(false);
      },
      (err) => { console.error('명단 구독 오류:', err); setLoading(false); showToast('명단을 불러오지 못했습니다.'); },
    );
    return () => unsub();
  }, [showToast]);

  // 내가 볼 수 있는 지역 — 관리자는 전체, 회원사는 자기 담당 지역만
  const myRegions = useMemo<string[]>(
    () => (isAdmin ? ALL_REGIONS : (partnerCompany ? PARTNER_REGIONS[partnerCompany] || [] : [])),
    [isAdmin, partnerCompany],
  );

  // 지역 → 월 → 파일 그룹화
  //   관리자: 전체(관리자 전용 포함) · 회원사: 담당 지역의 '공유' 명단만(관리자 전용은 제외)
  const grouped = useMemo(() => {
    const regionSet = new Set(myRegions);
    const visible = isAdmin
      ? files
      : files.filter((f) => !f.adminOnly && regionSet.has(f.region));
    const byRegion: Record<string, Record<string, RosterFile[]>> = {};
    for (const f of visible) {
      (byRegion[f.region] ||= {});
      (byRegion[f.region][f.month] ||= []).push(f);
    }
    return byRegion;
  }, [files, myRegions, isAdmin]);

  // 다운로드 — 로그인 게이트(storage.rules) 통과 후 blob으로 받아 원본 파일명 강제
  const handleDownload = async (f: RosterFile) => {
    setBusyId(f.id);
    try {
      const url = await getDownloadURL(storageRef(storage, f.storagePath));
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const a = document.createElement('a');
      const objUrl = URL.createObjectURL(blob);
      a.href = objUrl;
      a.download = f.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
    } catch (e) {
      console.error('다운로드 실패:', e);
      showToast('다운로드에 실패했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setBusyId(null);
    }
  };

  // 관리자 업로드
  const handleUpload = async (file: File) => {
    if (!isAdmin || !upRegion || !upMonth) return;
    setUploading(true);
    try {
      const safe = file.name.replace(/[\\/:*?"<>|]+/g, '_');
      const base = upAdminOnly ? 'rosters_admin' : 'rosters';
      const path = `${base}/${upRegion}/${upMonth}/${Date.now()}_${safe}`;
      await uploadBytes(storageRef(storage, path), file, { contentType: file.type || 'application/octet-stream' });
      await addDoc(collection(db, ...ROSTERS_PATH), {
        region: upRegion,
        month: upMonth,
        category: upCategory || '전체',
        fileName: file.name,
        contentType: file.type || 'application/octet-stream',
        size: file.size,
        storagePath: path,
        note: upNote || '',
        adminOnly: upAdminOnly,
        uploadedAt: new Date().toISOString(),
        uploadedBy: user?.email || '',
      });
      setUpNote('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      showToast(`업로드 완료: ${file.name}`);
    } catch (e) {
      console.error('업로드 실패:', e);
      showToast('업로드에 실패했습니다. 권한/네트워크를 확인해주세요.');
    } finally {
      setUploading(false);
    }
  };

  // 관리자 삭제
  const handleDelete = async (f: RosterFile) => {
    const ok = await confirm({
      title: '명단 파일 삭제',
      message: `"${f.fileName}"\n(${f.region} · ${f.month})\n파일과 기록을 삭제합니다. 되돌릴 수 없습니다.`,
      confirmText: '삭제',
    });
    if (!ok) return;
    setBusyId(f.id);
    try {
      try { await deleteObject(storageRef(storage, f.storagePath)); } catch (e) { console.warn('Storage 객체 없음/삭제 스킵:', e); }
      await deleteDoc(doc(db, ...ROSTERS_PATH, f.id));
      showToast('삭제했습니다.');
    } catch (e) {
      console.error('삭제 실패:', e);
      showToast('삭제에 실패했습니다.');
    } finally {
      setBusyId(null);
    }
  };

  const regionList = Object.keys(grouped).sort();

  return (
    <div className="anim-in space-y-4">
      {/* 헤더 */}
      <div className="glass rounded-2xl p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg,#0ea5e9,#38bdf8)' }}>
            <ClipboardList size={22} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-black text-sky-800">정부양곡 배송 명단</h2>
            <p className="text-sky-500 text-xs font-bold mt-0.5">
              {isAdmin
                ? '본사 — 지역·월별 명단을 업로드하면 담당 회원사가 다운로드합니다.'
                : '담당 지역의 월별 배송 명단을 내려받으세요.'}
            </p>
          </div>
        </div>
        <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          <Lock size={14} className="text-amber-500 mt-0.5 shrink-0" />
          <p className="text-[11px] sm:text-xs font-bold text-amber-700">
            본 명단은 <b>수급자 개인정보</b>입니다. 배송 목적 외 사용·외부 유출을 금지하며, 다운로드·열람 기록이 관리됩니다.
          </p>
        </div>
      </div>

      {/* 관리자 업로드 패널 */}
      {isAdmin && (
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <UploadCloud size={18} className="text-sky-600" />
            <h3 className="font-black text-sky-800 text-sm">명단 업로드 (본사 전용)</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-sky-500 uppercase">지역</span>
              <input list="roster-regions" value={upRegion} onChange={(e) => setUpRegion(e.target.value)}
                placeholder="지역 선택/입력"
                className="bg-sky-50 border border-sky-200 rounded-xl px-3 py-2 text-sm font-bold text-sky-800 outline-none placeholder:text-sky-300" />
              <datalist id="roster-regions">
                {ALL_REGIONS.map((r) => <option key={r} value={r} />)}
              </datalist>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-sky-500 uppercase">월</span>
              <input type="month" value={upMonth} onChange={(e) => setUpMonth(e.target.value)}
                className="bg-sky-50 border border-sky-200 rounded-xl px-3 py-2 text-sm font-bold text-sky-800 outline-none" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-sky-500 uppercase">구분</span>
              <select value={upCategory} onChange={(e) => setUpCategory(e.target.value)}
                className="bg-sky-50 border border-sky-200 rounded-xl px-3 py-2 text-sm font-bold text-sky-800 outline-none">
                {['전체', '수급자', '차상위', '인수지시서'].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-sky-500 uppercase">안내(선택)</span>
              <input type="text" value={upNote} onChange={(e) => setUpNote(e.target.value)} placeholder="예: 엑셀 암호 2729"
                className="bg-sky-50 border border-sky-200 rounded-xl px-3 py-2 text-sm font-bold text-sky-800 outline-none placeholder:text-sky-300" />
            </label>
          </div>
          <label className="flex items-center gap-2 mb-2 cursor-pointer select-none">
            <input type="checkbox" checked={upAdminOnly} onChange={(e) => setUpAdminOnly(e.target.checked)}
              className="w-4 h-4 accent-amber-500" />
            <span className="text-xs font-bold text-amber-700">🔒 본사 관리자 전용 (회원사에 안 보임 · 부천 메일함 명단 등)</span>
          </label>
          <input ref={fileInputRef} type="file" disabled={uploading}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
            className="block w-full text-xs font-bold text-sky-700 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-sky-100 file:text-sky-700 file:font-bold hover:file:bg-sky-200" />
          {uploading && (
            <p className="mt-2 text-xs font-bold text-sky-500 flex items-center gap-1.5">
              <Loader2 size={14} className="animate-spin" /> 업로드 중…
            </p>
          )}
        </div>
      )}

      {/* 목록 */}
      {loading ? (
        <div className="glass rounded-2xl p-12 text-center text-sky-400 font-bold text-sm flex items-center justify-center gap-2">
          <Loader2 size={18} className="animate-spin" /> 명단 불러오는 중…
        </div>
      ) : regionList.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <FileSpreadsheet size={36} className="mx-auto text-sky-200 mb-3" />
          <p className="text-sky-500 font-bold text-sm">
            {myRegions.length === 0
              ? '담당 지역이 지정되지 않았습니다. 본사에 문의해주세요.'
              : '아직 등록된 명단이 없습니다.'}
          </p>
        </div>
      ) : (
        regionList.map((region) => {
          const months = Object.keys(grouped[region]).sort().reverse();
          return (
            <div key={region} className="glass rounded-2xl p-5">
              <h3 className="font-black text-sky-800 text-base mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-sky-500" /> {region}
              </h3>
              <div className="space-y-3">
                {months.map((month) => (
                  <div key={month}>
                    <div className="text-xs font-black text-sky-400 mb-1.5">{month}</div>
                    <div className="space-y-1.5">
                      {grouped[region][month]
                        .sort((a, b) => a.fileName.localeCompare(b.fileName))
                        .map((f) => (
                          <div key={f.id}
                            className="flex items-center gap-3 bg-white/70 border border-sky-100 rounded-xl px-3 py-2.5">
                            <FileSpreadsheet size={18} className="text-emerald-500 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-bold text-slate-800 truncate">{f.fileName}</div>
                              <div className="text-[10px] font-bold text-slate-400 flex flex-wrap items-center gap-x-2">
                                <span className="text-sky-500">{f.category}</span>
                                <span>{fmtSize(f.size)}</span>
                                {f.adminOnly && <span className="text-amber-600 font-black">🔒 관리자 전용</span>}
                                {f.note && <span className="text-amber-600">🔑 {f.note}</span>}
                              </div>
                            </div>
                            <button onClick={() => handleDownload(f)} disabled={busyId === f.id}
                              className="btn-sky shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-50">
                              {busyId === f.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                              받기
                            </button>
                            {isAdmin && (
                              <button onClick={() => handleDelete(f)} disabled={busyId === f.id} title="삭제"
                                className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50">
                                <Trash2 size={15} />
                              </button>
                            )}
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}
      {dialog}
    </div>
  );
}
