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
  Folder, FolderOpen, FileText, Sparkles, SendHorizontal, Square, CheckSquare, Layers, X,
  Key, Mail,
} from 'lucide-react';
import { db, storage, APP_ID } from '../../firebase';
import { useApp } from '../../context/AppContext';
import { PARTNER_REGIONS } from '../../constants/members';
import { useConfirm } from '../shared/useConfirm';
import { listZipEntries, extractZipEntry, refineExcelDirect, sendToRefineSystem, type ZipEntryInfo } from '../../lib/rosterRefine';

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
  adminOnly?: boolean;  // true=본사 관리자 전용(회원사 비노출·다운로드 차단)
  allowedCompanies?: string[]; // 지정 시 이 회원사들(+관리자)만 노출. 미지정이면 지역(region) 매핑 사용
  uploadedAt: string;
  uploadedBy?: string;
  passwordFound?: string;      // 원본 메일에서 자동으로 찾아 이미 해제한 암호(감사·확인용 — 파일은 이미 평문)
  sourceMailSubject?: string;  // 원본 메일 제목(자동수집분만 — 있으면 "메일 보기" 버튼 노출)
  sourceMailBody?: string;     // 원본 메일 본문(태그 제거된 텍스트)
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

  // zip "폴더" 열람 — 파일별 펼침 상태·목록·원본 blob 캐시(재열람 시 재다운로드 방지)
  const [zipOpen, setZipOpen] = useState<Record<string, boolean>>({});
  const [zipEntries, setZipEntries] = useState<Record<string, ZipEntryInfo[]>>({});
  const [zipBlobs, setZipBlobs] = useState<Record<string, Blob>>({});
  const [zipLoading, setZipLoading] = useState<Record<string, boolean>>({});
  // 정제 액션(정제된 명단 받기/명단 정제하기) 진행 중 키 — fileId 또는 fileId::entryPath(::send)
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  // "메일 보기" — 원본 메일 제목·본문을 보는 모달(자동수집된 파일만 가능)
  const [viewingMail, setViewingMail] = useState<RosterFile | null>(null);

  // 엑셀 다중 선택(최대 2개) — "2개 파일 합쳐서 정제" 요청 대응. key로 토글, getFile은 지연 실행.
  interface SelectedItem { getFile: () => Promise<File>; label: string; region: string }
  const [selected, setSelected] = useState<Record<string, SelectedItem>>({});
  const selectedKeys = Object.keys(selected);
  const toggleSelect = (key: string, item: SelectedItem) => {
    setSelected((prev) => {
      if (prev[key]) { const next = { ...prev }; delete next[key]; return next; }
      if (Object.keys(prev).length >= 2) { showToast('한 번에 최대 2개까지 함께 정제할 수 있습니다.'); return prev; }
      return { ...prev, [key]: item };
    });
  };
  const clearSelection = () => setSelected({});

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
  //   관리자: 전체 · 회원사: ① 관리자전용 제외 ② allowedCompanies 지정 시 그 회사만,
  //   미지정이면 담당 지역(region) 매핑으로 노출.
  const grouped = useMemo(() => {
    const regionSet = new Set(myRegions);
    const canSee = (f: RosterFile) => {
      if (f.adminOnly) return false;
      if (Array.isArray(f.allowedCompanies) && f.allowedCompanies.length > 0)
        return !!partnerCompany && f.allowedCompanies.includes(partnerCompany);
      return regionSet.has(f.region);
    };
    const visible = isAdmin ? files : files.filter(canSee);
    const byRegion: Record<string, Record<string, RosterFile[]>> = {};
    for (const f of visible) {
      (byRegion[f.region] ||= {});
      (byRegion[f.region][f.month] ||= []).push(f);
    }
    return byRegion;
  }, [files, myRegions, isAdmin, partnerCompany]);

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

  // 원본 파일 전체를 File 객체로 받기(정제 액션의 입력용)
  const fetchAsFile = async (f: RosterFile): Promise<File> => {
    const url = await getDownloadURL(storageRef(storage, f.storagePath));
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    return new File([blob], f.fileName, { type: blob.type || f.contentType });
  };

  // zip "폴더" 펼치기 — 첫 펼침 시에만 다운로드+목록화, 이후는 캐시 재사용
  const toggleZip = async (f: RosterFile) => {
    setZipOpen((prev) => ({ ...prev, [f.id]: !prev[f.id] }));
    if (zipEntries[f.id]) return;
    setZipLoading((prev) => ({ ...prev, [f.id]: true }));
    try {
      const url = await getDownloadURL(storageRef(storage, f.storagePath));
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      setZipBlobs((prev) => ({ ...prev, [f.id]: blob }));
      const entries = await listZipEntries(blob);
      setZipEntries((prev) => ({ ...prev, [f.id]: entries }));
    } catch (e) {
      console.error('zip 열람 실패:', e);
      showToast('압축 파일을 열지 못했습니다.');
      setZipOpen((prev) => ({ ...prev, [f.id]: false }));
    } finally {
      setZipLoading((prev) => ({ ...prev, [f.id]: false }));
    }
  };

  // zip 안 파일 1개를 File 객체로 추출(blob 캐시 재사용)
  const extractAsFile = async (f: RosterFile, entry: ZipEntryInfo): Promise<File> => {
    let blob = zipBlobs[f.id];
    if (!blob) {
      const url = await getDownloadURL(storageRef(storage, f.storagePath));
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      blob = await res.blob();
      setZipBlobs((prev) => ({ ...prev, [f.id]: blob as Blob }));
    }
    const entryBlob = await extractZipEntry(blob, entry.jszipKey);
    const name = entry.path.split('/').pop() || entry.path;
    return new File([entryBlob], name, { type: entryBlob.type || 'application/octet-stream' });
  };

  // zip 안 파일 1개를 원본 그대로 다운로드(엑셀이 아닌 인수지시서 pdf 등)
  const handleExtractDownload = async (f: RosterFile, entry: ZipEntryInfo) => {
    const key = `${f.id}::${entry.path}::extract`;
    setActionBusy(key);
    try {
      const file = await extractAsFile(f, entry);
      const a = document.createElement('a');
      const objUrl = URL.createObjectURL(file);
      a.href = objUrl;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
    } catch (e) {
      console.error('추출 실패:', e);
      showToast('파일 추출에 실패했습니다.');
    } finally {
      setActionBusy(null);
    }
  };

  // "정제된 명단 받기" — 이 앱 안에서 바로 주소매칭 후 정제 엑셀 즉시 다운로드
  //   getFiles가 여러 개(선택모드 2개)면 한 결과로 합쳐서 정제한다.
  const handleRefineDirect = async (getFiles: Array<() => Promise<File>>, region: string, key: string) => {
    setActionBusy(key);
    try {
      const files = await Promise.all(getFiles.map((g) => g()));
      const { total, matched } = await refineExcelDirect(files, region);
      showToast(`정제 완료: ${matched}/${total}건 주소 매칭 · 파일이 다운로드됩니다`);
      clearSelection();
    } catch (e) {
      console.error('정제 실패:', e);
      showToast(e instanceof Error ? e.message : '정제 중 오류가 발생했습니다.');
    } finally {
      setActionBusy(null);
    }
  };

  // "명단 정제하기" — 명단정제시스템(nexus-pipeline)으로 파일을 인계해 새 탭에서 이어 작업
  //   (지자체/월 자동감지 · 2개 파일이면 정제시스템의 기존 2개 파일 합치기 기능으로 자동 병합 ·
  //   DB 저장까지 모두 그 시스템의 기존 기능을 그대로 사용 — 중복 구현 안 함)
  const handleSendToRefine = async (getFiles: Array<() => Promise<File>>, region: string, key: string) => {
    setActionBusy(key);
    try {
      const files = await Promise.all(getFiles.map((g) => g()));
      await sendToRefineSystem(files, region);
      showToast(files.length > 1
        ? '명단정제시스템으로 2개 파일을 전송했습니다. 새로 열린 탭에서 지자체·월을 확인해주세요.'
        : '명단정제시스템으로 전송했습니다. 새로 열린 탭을 확인해주세요.');
      clearSelection();
    } catch (e) {
      console.error('전송 실패:', e);
      showToast(e instanceof Error ? e.message : '전송 중 오류가 발생했습니다.');
    } finally {
      setActionBusy(null);
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

      {/* 선택 항목 액션바 — 체크박스로 고른 엑셀 1~2개를 한 번에 정제(2개면 합쳐서 작업) */}
      {selectedKeys.length > 0 && (
        <div className="sticky top-2 z-[3500] glass rounded-2xl p-4 border-2 border-indigo-200 shadow-lg">
          <div className="flex items-center gap-3 flex-wrap">
            <Layers size={18} className="text-indigo-500 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-black text-indigo-700">선택 {selectedKeys.length}개</div>
              <div className="text-[11px] font-bold text-slate-400 truncate">
                {selectedKeys.map((k) => selected[k].label).join(' + ')}
              </div>
            </div>
            <button
              onClick={() => handleRefineDirect(selectedKeys.map((k) => selected[k].getFile), selected[selectedKeys[0]].region, 'SEL')}
              disabled={actionBusy === 'SEL'}
              className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50">
              {actionBusy === 'SEL' ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {selectedKeys.length > 1 ? '2개 합쳐서 정제 받기' : '정제된 명단 받기'}
            </button>
            <button
              onClick={() => handleSendToRefine(selectedKeys.map((k) => selected[k].getFile), selected[selectedKeys[0]].region, 'SEL::send')}
              disabled={actionBusy === 'SEL::send'}
              className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-50">
              {actionBusy === 'SEL::send' ? <Loader2 size={14} className="animate-spin" /> : <SendHorizontal size={14} />}
              {selectedKeys.length > 1 ? '2개 함께 명단 정제하기' : '명단 정제하기'}
            </button>
            <button onClick={clearSelection} title="선택 해제"
              className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
              <X size={16} />
            </button>
          </div>
          {selectedKeys.length === 1 && (
            <p className="text-[10px] font-bold text-indigo-400 mt-1.5">파일을 하나 더 선택하면 2개를 합쳐서 정제할 수 있습니다.</p>
          )}
        </div>
      )}

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
                        .map((f) => {
                          const isZip = /\.zip$/i.test(f.fileName);
                          const isExcel = /\.(xlsx|xls)$/i.test(f.fileName);
                          const zipIsOpen = !!zipOpen[f.id];
                          const entries = zipEntries[f.id];
                          return (
                            <div key={f.id}>
                              <div className="flex items-center gap-3 bg-white/70 border border-sky-100 rounded-xl px-3 py-2.5">
                                {isZip ? (
                                  <button onClick={() => toggleZip(f)} title="폴더 열기/닫기"
                                    className="shrink-0 text-sky-500 hover:text-sky-700">
                                    {zipLoading[f.id]
                                      ? <Loader2 size={18} className="animate-spin" />
                                      : (zipIsOpen ? <FolderOpen size={18} /> : <Folder size={18} />)}
                                  </button>
                                ) : (
                                  <FileSpreadsheet size={18} className="text-emerald-500 shrink-0" />
                                )}
                                <div
                                  className={`min-w-0 flex-1 ${isZip ? 'cursor-pointer' : ''}`}
                                  onClick={isZip ? () => toggleZip(f) : undefined}
                                >
                                  <div className="text-sm font-bold text-slate-800 truncate">
                                    {f.fileName}
                                    {isZip && <span className="ml-1.5 text-[10px] text-sky-400 font-black align-middle">폴더</span>}
                                  </div>
                                  <div className="text-[10px] font-bold text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
                                    <span className="text-sky-500">{f.category}</span>
                                    <span>{fmtSize(f.size)}</span>
                                    {f.adminOnly && <span className="text-amber-600 font-black">🔒 관리자 전용</span>}
                                    {isAdmin && !f.adminOnly && f.allowedCompanies && f.allowedCompanies.length > 0 && (
                                      <span className="text-emerald-600 font-bold">🏢 {f.allowedCompanies.join('·')}</span>
                                    )}
                                    {f.note && <span className="text-amber-600">🔑 {f.note}</span>}
                                    {f.passwordFound && (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500 text-white font-black text-[10px] shadow-sm">
                                        <Key size={10} /> 원본 암호: {f.passwordFound} (자동 해제됨)
                                      </span>
                                    )}
                                    {f.sourceMailSubject && (
                                      <button onClick={(e) => { e.stopPropagation(); setViewingMail(f); }}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 hover:bg-sky-200 font-bold text-[10px]">
                                        <Mail size={10} /> 원본 메일 보기
                                      </button>
                                    )}
                                  </div>
                                </div>
                                {isExcel && !isZip && (
                                  <button
                                    onClick={() => toggleSelect(f.id, { getFile: () => fetchAsFile(f), label: f.fileName, region: f.region })}
                                    title="선택(최대 2개 함께 정제)"
                                    className={`shrink-0 ${selected[f.id] ? 'text-indigo-600' : 'text-slate-300 hover:text-slate-400'}`}>
                                    {selected[f.id] ? <CheckSquare size={18} /> : <Square size={18} />}
                                  </button>
                                )}
                                <button onClick={() => handleDownload(f)} disabled={busyId === f.id}
                                  className="btn-sky shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-50">
                                  {busyId === f.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                                  원본
                                </button>
                                {isExcel && !isZip && (
                                  <>
                                    <button
                                      onClick={() => handleRefineDirect([() => fetchAsFile(f)], f.region, f.id)}
                                      disabled={actionBusy === f.id}
                                      title="이 앱에서 바로 주소를 정제해 다운로드"
                                      className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50">
                                      {actionBusy === f.id ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                                      정제된 명단 받기
                                    </button>
                                    <button
                                      onClick={() => handleSendToRefine([() => fetchAsFile(f)], f.region, `${f.id}::send`)}
                                      disabled={actionBusy === `${f.id}::send`}
                                      title="명단정제시스템으로 보내 합치기·DB저장까지 이어서 작업"
                                      className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-50">
                                      {actionBusy === `${f.id}::send` ? <Loader2 size={14} className="animate-spin" /> : <SendHorizontal size={14} />}
                                      명단 정제하기
                                    </button>
                                  </>
                                )}
                                {isAdmin && (
                                  <button onClick={() => handleDelete(f)} disabled={busyId === f.id} title="삭제"
                                    className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50">
                                    <Trash2 size={15} />
                                  </button>
                                )}
                              </div>

                              {isZip && zipIsOpen && (
                                <div className="ml-8 mt-1.5 mb-1 space-y-1.5 border-l-2 border-sky-100 pl-3">
                                  {zipLoading[f.id] ? (
                                    <div className="text-xs text-sky-400 font-bold py-2 flex items-center gap-1.5">
                                      <Loader2 size={13} className="animate-spin" /> 압축 여는 중…
                                    </div>
                                  ) : !entries?.length ? (
                                    <div className="text-xs text-slate-400 py-2">압축 안에 파일이 없습니다.</div>
                                  ) : (
                                    entries.map((entry) => {
                                      const entryKey = `${f.id}::${entry.path}`;
                                      return (
                                        <div key={entry.path}
                                          className="flex items-center gap-2 bg-white/50 border border-sky-50 rounded-lg px-2.5 py-2">
                                          {entry.isExcel
                                            ? <FileSpreadsheet size={14} className="text-emerald-500 shrink-0" />
                                            : <FileText size={14} className="text-slate-400 shrink-0" />}
                                          <div className="min-w-0 flex-1 text-xs font-bold text-slate-700 truncate">{entry.path}</div>
                                          {entry.isExcel && (
                                            <button
                                              onClick={() => toggleSelect(entryKey, { getFile: () => extractAsFile(f, entry), label: entry.path.split('/').pop() || entry.path, region: f.region })}
                                              title="선택(최대 2개 함께 정제)"
                                              className={`shrink-0 ${selected[entryKey] ? 'text-indigo-600' : 'text-slate-300 hover:text-slate-400'}`}>
                                              {selected[entryKey] ? <CheckSquare size={15} /> : <Square size={15} />}
                                            </button>
                                          )}
                                          <button
                                            onClick={() => handleExtractDownload(f, entry)}
                                            disabled={actionBusy === `${entryKey}::extract`}
                                            className="shrink-0 flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-bold bg-sky-100 text-sky-700 hover:bg-sky-200 disabled:opacity-50">
                                            {actionBusy === `${entryKey}::extract` ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                                            원본
                                          </button>
                                          {entry.isExcel && (
                                            <>
                                              <button
                                                onClick={() => handleRefineDirect([() => extractAsFile(f, entry)], f.region, entryKey)}
                                                disabled={actionBusy === entryKey}
                                                title="이 앱에서 바로 주소를 정제해 다운로드"
                                                className="shrink-0 flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50">
                                                {actionBusy === entryKey ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                                                정제된 명단 받기
                                              </button>
                                              <button
                                                onClick={() => handleSendToRefine([() => extractAsFile(f, entry)], f.region, `${entryKey}::send`)}
                                                disabled={actionBusy === `${entryKey}::send`}
                                                title="명단정제시스템으로 보내 합치기·DB저장까지 이어서 작업"
                                                className="shrink-0 flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-bold bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-50">
                                                {actionBusy === `${entryKey}::send` ? <Loader2 size={12} className="animate-spin" /> : <SendHorizontal size={12} />}
                                                명단 정제하기
                                              </button>
                                            </>
                                          )}
                                        </div>
                                      );
                                    })
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}
      {dialog}

      {/* 원본 메일 보기 모달 — 자동수집 시 저장해둔 제목·본문(태그 제거) 열람 */}
      {viewingMail && (
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4"
          onClick={() => setViewingMail(null)}>
          <div className="glass rounded-2xl p-5 max-w-lg w-full max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <Mail size={18} className="text-sky-500 shrink-0" />
                <h3 className="font-black text-slate-800 text-sm truncate">원본 메일</h3>
              </div>
              <button onClick={() => setViewingMail(null)} className="shrink-0 text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            <div className="text-[11px] font-bold text-slate-400 mb-2">
              {viewingMail.region} · {viewingMail.fileName}
            </div>
            <div className="bg-white/70 border border-sky-100 rounded-xl p-3 mb-2">
              <div className="text-sm font-black text-slate-800">{viewingMail.sourceMailSubject}</div>
            </div>
            {viewingMail.passwordFound && (
              <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 mb-2">
                <Key size={14} className="text-emerald-600 shrink-0" />
                <span className="text-xs font-bold text-emerald-700">
                  이 메일에서 찾은 암호(<b>{viewingMail.passwordFound}</b>)로 파일이 이미 자동 해제되어 저장됐습니다.
                </span>
              </div>
            )}
            <div className="overflow-y-auto flex-1 bg-white/50 border border-sky-50 rounded-xl p-3">
              <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">
                {viewingMail.sourceMailBody || '(본문 없음)'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
