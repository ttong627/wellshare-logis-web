import React, { useState, useEffect, useRef } from 'react';
import {
  Plus, Trash2, Printer, History, X, Settings, Upload,
  ChevronDown, ChevronUp, Edit3, FileText, Save, RotateCcw,
  Code, Eye, Minus, Type, Palette, Layout, Layers, ClipboardPaste,
} from 'lucide-react';
import { doc, getDoc, setDoc, deleteDoc, runTransaction, collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, APP_ID } from '../../firebase';
import { useApp } from '../../context/AppContext';
import { sanitizeHtml } from '../../lib/sanitize';
import { DocType, DocTemplate, DocPageFormat, DocHistoryItem, DocFormatSettings } from '../../types';
import { safeRender } from '../../lib/utils';

// ── 글꼴 목록 ─────────────────────────────────────────────────────────────────

const FONT_OPTIONS = [
  { v: "'Malgun Gothic','Apple SD Gothic Neo',sans-serif", l: '맑은 고딕' },
  { v: "Batang,serif",                                      l: '바탕체'    },
  { v: "Gungsuh,serif",                                     l: '궁서체'    },
  { v: "Gulim,sans-serif",                                  l: '굴림체'    },
  { v: "Dotum,sans-serif",                                  l: '돋움체'    },
  { v: "'Times New Roman',Times,serif",                     l: 'Times New Roman' },
  { v: "Arial,Helvetica,sans-serif",                        l: 'Arial'     },
];

const DEFAULT_FONT = FONT_OPTIONS[0].v;

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_FORMAT: DocPageFormat = {
  // 페이지 여백
  marginTop: 20, marginRight: 22, marginBottom: 20, marginLeft: 22,

  // 머리말 전체
  headerYOffset: 0,
  headerLayout: 'centered',
  headerStyle: 'solid', headerBgColor: 'transparent',
  headerBorderWidth: 3, headerPaddingBottom: 6, headerMarginBottom: 7,

  // 로고
  logoHeight: 36, logoMarginBottom: 3, logoXOffset: 0, logoYOffset: 0,

  // 기관명
  orgNameFontFamily: DEFAULT_FONT,
  orgNameFontSize: 20, orgNameLetterSpacing: 6,
  orgNameColor: '', // '' → 템플릿 themeColor 사용
  orgNameAlign: 'center',
  orgNameXOffset: 0, orgNameYOffset: 0,

  // 슬로건
  showSlogan: true,
  sloganFontFamily: DEFAULT_FONT,
  sloganFontSize: 8.5,
  sloganColor: '#64748b',
  sloganAlign: 'center',
  sloganXOffset: 0, sloganYOffset: 0,

  // 연락처
  showContact: true,
  contactFontSize: 8,
  contactColor: '#64748b',
  contactAlign: 'center',
  contactXOffset: 0,

  // 본문 전체
  bodyYOffset: 0,

  // 메타정보
  metaStyle: 'table',
  metaFontSize: 9.5,

  // 제목
  subjectFontFamily: DEFAULT_FONT,
  subjectFontSize: 13,
  subjectAlign: 'center',
  subjectBold: true,
  subjectStyle: 'plain',

  // 본문 텍스트
  bodyFontFamily: DEFAULT_FONT,
  bodyFontSize: 10, bodyLineHeight: 2,
  bodyAlign: 'left',
  bodyXOffset: 0,

  // 첨부항목
  itemsFontFamily: DEFAULT_FONT,
  itemsFontSize: 10, itemsLineHeight: 2,
  itemsAlign: 'left',
  itemsXOffset: 0,

  // 구분선
  dividerStyle: 'solid', dividerColor: '#e2e8f0',

  // 꼬리말 전체
  footerYOffset: 0,
  footerStyle: 'simple',
  footerFontFamily: DEFAULT_FONT,
  footerFontSize: 9.5,
  footerAlign: 'right',
  footerXOffset: 0,

  // 심플 꼬리말 항목
  showFooterOrgName: true, showFooterRepresentative: true, showFooterManager: false,
  showFooterAddress: false, showFooterTel: false, showFooterFax: false, showFooterEmail: false,

  // 도장
  sealHeight: 28, sealRight: 0, sealBottom: -4, sealOpacity: 0.88,

  // 워터마크
  watermarkText: '', watermarkOpacity: 0.08,

  // 사용자 CSS
  customCss: '',
};

const BUILTIN_TEMPLATES: DocTemplate[] = [
  {
    id: DocType.A, name: '웰쉐어 사회적협동조합', docPrefix: '웰사협', isBuiltIn: true,
    orgName: '웰쉐어 사회적협동조합',
    orgSlogan: '"가치를 살리는 힘동, 행복을 키우는 나눔"',
    representative: '김기홍', representativeTitle: '이사장',
    address: '경기도 수원시 권선구 권선로 472, 6층 (세류동, 세지빌딩)',
    postalCode: '16591', tel: '070-7760-1077', fax: '031-225-1077',
    email: 'wssc@wssc.kr', themeColor: '#1a6bb5', publicStatus: '공개',
    logoUrl: '', sealUrl: '', format: { ...DEFAULT_FORMAT },
  },
  {
    id: DocType.B, name: '웰쉐어로지스(주)', docPrefix: '웰로지', isBuiltIn: true,
    orgName: '웰쉐어로지스(주)',
    orgSlogan: '행복을 키우는 물류네트워크',
    representative: '손한국', representativeTitle: '대표이사',
    address: '경기도 화성시 비봉면 주석로 457-15',
    postalCode: '18293', tel: '031-8043-5906', fax: '031-8043-5907',
    email: 'wsl@wssc.kr', themeColor: '#1e293b', publicStatus: '공개',
    logoUrl: '', sealUrl: '', format: { ...DEFAULT_FORMAT },
  },
];

// ── Format editor helper components ──────────────────────────────────────────

function FmtNum({ label, value, onChange, step = 1, min = -50, max = 200, unit = '' }: {
  label: string; value: number; onChange: (v: number) => void;
  step?: number; min?: number; max?: number; unit?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-bold text-sky-600 leading-tight">
        {label}{unit && <span className="text-sky-400 ml-0.5 font-normal">({unit})</span>}
      </label>
      <input type="number" value={value} step={step} min={min} max={max}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full border border-sky-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-800 outline-none bg-sky-50/50 focus:border-sky-400 focus:bg-white transition-colors"
      />
    </div>
  );
}

function FmtToggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-2 cursor-pointer" onClick={() => onChange(!value)}>
      <div className={`relative w-9 h-5 rounded-full transition-all flex-shrink-0 ${value ? 'bg-gradient-to-r from-sky-500 to-sky-400' : 'bg-slate-200'}`}
        style={value ? { boxShadow: '0 0 8px rgba(232,163,23,.6)' } : {}}>
        <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${value ? 'translate-x-4' : ''}`} />
      </div>
      <span className="text-xs font-bold text-sky-700 select-none">{label}</span>
    </div>
  );
}

function FmtSelect({ label, value, options, onChange }: {
  label: string; value: string;
  options: { v: string; l: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-bold text-sky-600">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="border border-sky-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-800 outline-none bg-sky-50/50 focus:border-sky-400 transition-colors">
        {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  );
}

function FmtColor({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-bold text-sky-600">{label}</label>
      <div className="flex items-center gap-2">
        <input type="color" value={value === 'transparent' ? '#ffffff' : value} onChange={e => onChange(e.target.value)}
          className="h-8 w-12 rounded-lg border border-sky-200 cursor-pointer p-0.5 bg-sky-50/50" />
        <input type="text" value={value} onChange={e => onChange(e.target.value)}
          className="flex-1 border border-sky-200 rounded-lg px-2 py-1 text-[10px] font-mono text-slate-700 outline-none bg-sky-50/50 focus:border-sky-400 transition-colors" />
      </div>
    </div>
  );
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="ws-grad w-6 h-6 rounded-lg flex items-center justify-center"
        style={{ boxShadow: '0 2px 8px rgba(232,163,23,.5)' }}>
        <span className="text-white" style={{ fontSize: 12 }}>{icon}</span>
      </div>
      <p className="text-[11px] font-black text-sky-700 uppercase tracking-widest">{title}</p>
    </div>
  );
}

// ── Form state ────────────────────────────────────────────────────────────────

interface DocForm {
  receiver: string; via: string; subject: string;
  body1: string; body2: string; body3: string; body4: string;
  items: string[]; date: string;
  docNumber: string; docNo: { year: number; num: number };
  htmlMode: boolean; htmlContent: string;
  // 붙여넣기: 머리말/본문/꼬리말 3구역
  pasteMode: boolean;
  pastedHeaderHtml: string;
  pastedBodyHtml: string;
  pastedFooterHtml: string;
  pasteZone: 'header' | 'body' | 'footer';
}

const emptyForm = (): DocForm => ({
  receiver: '', via: '', subject: '',
  body1: '귀 기관의 무궁한 발전을 기원합니다.',
  body2: '', body3: '', body4: '',
  items: [''],
  date: new Date().toISOString().slice(0, 10),
  docNumber: '', docNo: { year: new Date().getFullYear(), num: 1 },
  htmlMode: false, htmlContent: '',
  pasteMode: false,
  pastedHeaderHtml: '', pastedBodyHtml: '', pastedFooterHtml: '',
  pasteZone: 'body',
});

// ── Helper: generate HTML from structured content ─────────────────────────────

function buildDefaultHtml(form: DocForm): string {
  const bodies = [form.body1, form.body2, form.body3, form.body4].filter(Boolean);
  const items = form.items.filter(i => i.trim());
  return [
    `<div style="font-size:10pt; line-height:2; color:#000;">`,
    ...bodies.map((b, i) => `  <p style="${i === 0 ? 'text-indent:1em; ' : ''}margin-bottom:3mm;">${b}</p>`),
    items.length > 0 ? [
      `  <div style="margin-top:6mm; border-top:1px solid #e2e8f0; padding-top:4mm;">`,
      `    <div style="font-weight:700; text-align:center; margin-bottom:3mm;">- 다  음 -</div>`,
      `    <ol style="padding-left:6mm;">`,
      ...items.map((it, i) => `      <li style="margin-bottom:1.5mm;">${i + 1}. ${it}</li>`),
      `    </ol>`,
      `  </div>`,
    ].join('\n') : '',
    `</div>`,
  ].filter(Boolean).join('\n');
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DocsTab() {
  const { showToast, isSaving, setIsSaving, isAdmin } = useApp();

  const [templates, setTemplates] = useState<DocTemplate[]>(BUILTIN_TEMPLATES);
  const [selectedId, setSelectedId] = useState<string>(DocType.A);

  const [showHistory, setShowHistory] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showFormatEditor, setShowFormatEditor] = useState(false);
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const [historyTypeFilter, setHistoryTypeFilter] = useState<string>('ALL');
  // Format editor sections
  const [fmtSection, setFmtSection] = useState<string>('page');

  const [form, setForm] = useState<DocForm>(emptyForm());
  const [history, setHistory] = useState<DocHistoryItem[]>([]);
  const [nextDocNum, setNextDocNum] = useState(1);
  const [editingTmpl, setEditingTmpl] = useState<DocTemplate | null>(null);
  const [newTmpl, setNewTmpl] = useState<Partial<DocTemplate>>({});

  const logoRef = useRef<HTMLInputElement>(null);
  const sealRef = useRef<HTMLInputElement>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const pasteHeaderRef = useRef<HTMLDivElement>(null);
  const pasteBodyRef   = useRef<HTMLDivElement>(null);
  const pasteFooterRef = useRef<HTMLDivElement>(null);

  const makePasteHandler = (zone: 'header' | 'body' | 'footer', divRef: React.RefObject<HTMLDivElement | null>) =>
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      e.preventDefault();
      const html = e.clipboardData.getData('text/html');
      const text = e.clipboardData.getData('text/plain');
      const result = html || text.split('\n').filter(Boolean).map(l => `<p style="margin-bottom:2mm;">${l}</p>`).join('');
      const key = zone === 'header' ? 'pastedHeaderHtml' : zone === 'body' ? 'pastedBodyHtml' : 'pastedFooterHtml';
      setForm(f => ({ ...f, [key]: result }));
      if (divRef.current) divRef.current.innerHTML = '';
    };

  const template = templates.find(t => t.id === selectedId) || templates[0];
  const fmt = { ...DEFAULT_FORMAT, ...template.format };

  // ── Load ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        const tmplSnap = await getDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'settings', 'doc_templates'));
        let loaded: DocTemplate[] = BUILTIN_TEMPLATES.map(t => ({ ...t, format: { ...DEFAULT_FORMAT } }));
        if (tmplSnap.exists() && tmplSnap.data().templates) {
          const saved: DocTemplate[] = tmplSnap.data().templates;
          const savedMap = new Map(saved.map(t => [t.id, t]));
          const builtinIds = new Set(BUILTIN_TEMPLATES.map(t => t.id));
          loaded = BUILTIN_TEMPLATES.map(bt => {
            const s = savedMap.get(bt.id);
            return s ? { ...bt, ...s, isBuiltIn: true, format: { ...DEFAULT_FORMAT, ...s.format } } : bt;
          });
          saved.filter(t => !builtinIds.has(t.id)).forEach(t => loaded.push({ ...t, format: { ...DEFAULT_FORMAT, ...t.format } }));
        }
        const imgSnap = await getDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'settings', 'doc_format'));
        if (imgSnap.exists()) {
          const d = imgSnap.data();
          loaded = loaded.map(t => {
            if (t.id === DocType.A) return { ...t, logoUrl: t.logoUrl || d.formA_logoUrl || '', sealUrl: t.sealUrl || d.formA_sealUrl || '' };
            if (t.id === DocType.B) return { ...t, logoUrl: t.logoUrl || d.formB_logoUrl || '', sealUrl: t.sealUrl || d.formB_sealUrl || '' };
            return t;
          });
        }
        setTemplates(loaded);
      } catch (e) {
        console.error('서식 템플릿 로드 오류:', e);
        showToast('서식 템플릿을 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.');
      }
    })();
  }, []);

  // ⚠️ 2026-07-11 아카이빙 설계 반영: history가 official_docs/main 문서 안 배열로 무기한
  // 누적돼(당시 이미 1MB 한도의 35%) 서브컬렉션(official_docs/main/history/{id})으로 이전했다.
  // 조회도 배열 전체 대신 최신 300건만 가져온다 — 지금 규모(수십 건)에선 페이지네이션 없이도
  // 충분하고, 더 늘어나면 그때 "더보기" 커서 페이지네이션을 추가하면 된다(오버엔지니어링 방지).
  const HISTORY_LOAD_LIMIT = 300;
  useEffect(() => {
    (async () => {
      try {
        const historyCol = collection(db, 'artifacts', APP_ID, 'public', 'data', 'official_docs', 'main', 'history');
        const snap = await getDocs(query(historyCol, orderBy('timestamp', 'desc'), limit(HISTORY_LOAD_LIMIT)));
        setHistory(snap.docs.map(d => d.data() as DocHistoryItem));
      } catch (e) {
        console.error('공문 이력 로드 오류:', e);
        showToast('공문 이력을 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.');
      }
    })();
  }, []);

  // 문서번호 미리보기용 — 연도+유형별 카운터 문서 1개만 조회(전체 이력 스캔 안 함)
  useEffect(() => {
    (async () => {
      try {
        const year = new Date().getFullYear();
        const counterRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'official_docs', 'main', 'counters', `${year}_${selectedId}`);
        const snap = await getDoc(counterRef);
        setNextDocNum((snap.exists() ? (snap.data().lastNum as number) : 0) + 1);
      } catch (e) {
        console.error('문서번호 카운터 조회 오류:', e);
      }
    })();
  }, [selectedId]);

  // ── Persist ──────────────────────────────────────────────────────────────────

  const persistTemplates = async (updated: DocTemplate[]) => {
    await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'settings', 'doc_templates'),
      { templates: updated, updatedAt: new Date().toISOString() });
    setTemplates(updated);
  };

  // ── Format editor ────────────────────────────────────────────────────────────

  const updateFormat = async (key: keyof DocPageFormat, value: number | boolean | string) => {
    const updated = templates.map(t => t.id === selectedId ? { ...t, format: { ...fmt, [key]: value } } : t);
    setTemplates(updated);
    try {
      await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'settings', 'doc_templates'),
        { templates: updated, updatedAt: new Date().toISOString() });
    } catch (e) {
      console.error('서식 저장 오류:', e);
      showToast('서식 변경사항 저장에 실패했습니다. 다시 시도해주세요.');
    }
  };

  const resetFormat = async () => {
    if (!confirm('서식을 기본값으로 초기화하시겠습니까?')) return;
    await persistTemplates(templates.map(t => t.id === selectedId ? { ...t, format: { ...DEFAULT_FORMAT } } : t));
  };

  // ── Template editor ──────────────────────────────────────────────────────────

  const saveTemplateInfo = async () => {
    if (!editingTmpl) return;
    setIsSaving(true);
    try {
      await persistTemplates(templates.map(t => t.id === editingTmpl.id ? { ...editingTmpl, updatedAt: new Date().toISOString() } : t));
      setShowTemplateEditor(false);
      showToast('기관 정보가 저장되었습니다.');
    } catch (e) { showToast('저장 오류: ' + (e as Error).message); }
    finally { setIsSaving(false); }
  };

  const handleAddTemplate = async () => {
    if (!newTmpl.orgName?.trim()) return showToast('기관명을 입력해주세요.');
    if (!newTmpl.docPrefix?.trim()) return showToast('문서번호 접두사를 입력해주세요.');
    const id = `custom_${Date.now()}`;
    const created: DocTemplate = {
      id, name: newTmpl.orgName!, docPrefix: newTmpl.docPrefix!,
      orgName: newTmpl.orgName!, orgSlogan: newTmpl.orgSlogan || '',
      representative: newTmpl.representative || '',
      representativeTitle: newTmpl.representativeTitle || '대표',
      address: newTmpl.address || '', postalCode: newTmpl.postalCode || '',
      tel: newTmpl.tel || '', fax: newTmpl.fax || '', email: newTmpl.email || '',
      themeColor: newTmpl.themeColor || '#8A3D0A', publicStatus: '공개',
      logoUrl: '', sealUrl: '', format: { ...DEFAULT_FORMAT },
      createdAt: new Date().toISOString(),
    };
    setIsSaving(true);
    try {
      await persistTemplates([...templates, created]);
      setSelectedId(id);
      setShowAddTemplate(false);
      setNewTmpl({});
      showToast('새 공문 양식이 추가되었습니다.');
    } catch (e) { showToast('추가 오류: ' + (e as Error).message); }
    finally { setIsSaving(false); }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('이 공문 양식을 삭제하시겠습니까?')) return;
    const updated = templates.filter(t => t.id !== id);
    setIsSaving(true);
    try {
      await persistTemplates(updated);
      if (selectedId === id) setSelectedId(templates.find(t => t.id !== id)?.id || DocType.A);
      showToast('양식이 삭제되었습니다.');
    } catch (e) { showToast('삭제 오류: ' + (e as Error).message); }
    finally { setIsSaving(false); }
  };

  // ── Image upload ──────────────────────────────────────────────────────────────

  const handleImageUpload = async (field: 'logo' | 'seal', file: File) => {
    if (file.size > 3 * 1024 * 1024) { showToast('이미지 크기는 3MB 이하여야 합니다.'); return; }
    const ext = file.name.split('.').pop() || 'png';
    setIsSaving(true);
    try {
      const sRef = storageRef(storage, `doc_images/${selectedId}/${field}.${ext}`);
      await uploadBytes(sRef, file);
      const url = await getDownloadURL(sRef);
      await persistTemplates(templates.map(t => t.id === selectedId ? { ...t, [`${field}Url`]: url } : t));
      showToast(`${field === 'logo' ? '로고' : '도장'} 이미지가 저장되었습니다.`);
    } catch (e) { showToast('업로드 오류: ' + (e as Error).message); }
    finally { setIsSaving(false); }
  };

  const handleImageDelete = async (field: 'logo' | 'seal') => {
    setIsSaving(true);
    try {
      await persistTemplates(templates.map(t => t.id === selectedId ? { ...t, [`${field}Url`]: '' } : t));
      showToast('이미지가 삭제되었습니다.');
    } catch (e) { showToast('삭제 오류: ' + (e as Error).message); }
    finally { setIsSaving(false); }
  };

  // ── Document actions ──────────────────────────────────────────────────────────

  const docNumber = form.docNumber || `${template.docPrefix}-${new Date().getFullYear()}-${String(nextDocNum).padStart(3, '0')}`;

  const handleSend = async () => {
    if (!form.receiver.trim()) return showToast('수신처를 입력해주세요.');
    if (!form.subject.trim()) return showToast('제목을 입력해주세요.');
    if (!form.htmlMode && !form.pasteMode && !form.body1.trim()) return showToast('본문 내용을 입력해주세요.');
    if (form.htmlMode && !form.htmlContent.trim()) return showToast('HTML 내용을 입력해주세요.');
    if (form.pasteMode && !form.pastedHeaderHtml && !form.pastedBodyHtml && !form.pastedFooterHtml) return showToast('붙여넣기 내용을 입력해주세요.');
    setIsSaving(true);
    try {
      const year = new Date().getFullYear();
      // ⚠️ 2026-07-11: history를 official_docs/main 문서 안 배열로 무기한 append하던 구조를
      // 서브컬렉션(main/history/{id})으로 옮겼다(1MB 문서 한도 위험 제거). 문서번호는 별도
      // 카운터 문서(main/counters/{year}_{type})를 트랜잭션으로 원자적 +1 — Firestore 클라이언트
      // 트랜잭션은 특정 문서 read만 가능하고 쿼리는 못 하므로, "이 연도·유형 최신 이력을 스캔해
      // 최대값 찾기" 대신 "작은 카운터 문서 하나를 원자적으로 증가"시키는 표준 패턴을 쓴다.
      const counterRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'official_docs', 'main', 'counters', `${year}_${selectedId}`);
      const { item, dn } = await runTransaction(db, async (tx) => {
        const counterSnap = await tx.get(counterRef);
        const num = (counterSnap.exists() ? (counterSnap.data().lastNum as number) : 0) + 1;
        const dn = `${template.docPrefix}-${year}-${String(num).padStart(3, '0')}`;
        const item: DocHistoryItem = {
          id: `${Date.now()}`, timestamp: new Date().toISOString(),
          type: selectedId, receiver: form.receiver, subject: form.subject,
          docNo: { year, num },
          data: {
            type: selectedId, receiver: form.receiver, via: form.via,
            subject: form.subject, body1: form.htmlMode ? form.htmlContent : form.body1,
            body2: form.body2, body3: form.body3, body4: form.body4,
            items: form.items.filter(i => i.trim()),
            date: form.date, docNo: { year, num },
            docNumber: dn, settingsSnapshot: {} as DocFormatSettings,
          },
        };
        tx.set(counterRef, { lastNum: num });
        tx.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'official_docs', 'main', 'history', item.id), item);
        return { item, dn };
      });
      setHistory(h => [item, ...h]);
      setNextDocNum(item.docNo.num + 1);
      setForm(f => ({ ...f, docNumber: dn }));
      showToast(`공문이 저장되었습니다. (${dn})`);
      setShowPreview(true);
    } catch (e) { showToast('저장 오류: ' + (e as Error).message); }
    finally { setIsSaving(false); }
  };

  const handlePrint = () => {
    const content = printRef.current?.innerHTML;
    if (!content) return;
    const win = window.open('', '_blank');
    if (!win) return showToast('팝업이 차단되었습니다.');
    win.document.write(`<!DOCTYPE html><html><head><title>공문 - ${template.orgName}</title><style>
      @page{size:A4;margin:0}*{margin:0;padding:0;box-sizing:border-box}
      body{font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif}
      ${fmt.customCss}
    </style></head><body>${content}</body></html>`);
    win.document.close(); win.focus();
    setTimeout(() => { win.print(); win.close(); }, 500);
  };

  const handleLoadHistory = (item: DocHistoryItem) => {
    setSelectedId(item.type);
    setForm({
      receiver: item.data.receiver, via: item.data.via, subject: item.data.subject,
      body1: item.data.body1, body2: item.data.body2,
      body3: item.data.body3 || '', body4: item.data.body4 || '',
      pasteMode: false, pastedHeaderHtml: '', pastedBodyHtml: '', pastedFooterHtml: '', pasteZone: 'body',
      items: item.data.items.length > 0 ? item.data.items : [''],
      date: item.data.date, docNo: item.data.docNo,
      docNumber: item.data.docNumber || '',
      htmlMode: false, htmlContent: '',
    });
    setShowHistory(false); setShowPreview(false);
    showToast('이전 공문을 불러왔습니다. 수정 후 재저장하세요.');
  };

  const handleDeleteHistory = async (id: string) => {
    if (!confirm('이 공문 이력을 삭제하시겠습니까?')) return;
    try {
      // 서브컬렉션 단건 삭제 — 배열 전체를 다시 쓰지 않으므로 동시에 다른 이력이 추가/삭제돼도 안전.
      await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'official_docs', 'main', 'history', id));
      setHistory(h => h.filter(x => x.id !== id));
      showToast('이력이 삭제되었습니다.');
    } catch (e) { showToast('삭제 오류: ' + (e as Error).message); }
  };

  const filteredHistory = history.filter(h => historyTypeFilter === 'ALL' || h.type === historyTypeFilter);

  // ── Header border rendering helper ────────────────────────────────────────────

  const getHeaderBorder = () => {
    const c = template.themeColor;
    const w = fmt.headerBorderWidth;
    switch (fmt.headerStyle) {
      case 'double': return { borderBottom: `${w}px double ${c}`, paddingBottom: `${fmt.headerPaddingBottom}mm` };
      case 'gradient': return { borderBottom: 'none', paddingBottom: `${fmt.headerPaddingBottom}mm`, backgroundImage: `linear-gradient(135deg, ${c}22, transparent)`, borderRadius: '0 0 4px 4px' };
      case 'dashed': return { borderBottom: `${w}px dashed ${c}`, paddingBottom: `${fmt.headerPaddingBottom}mm` };
      case 'none': return { paddingBottom: `${fmt.headerPaddingBottom}mm` };
      default: return { borderBottom: `${w}px solid ${c}`, paddingBottom: `${fmt.headerPaddingBottom}mm` };
    }
  };

  const getSubjectStyle = (): React.CSSProperties => {
    const base: React.CSSProperties = { textAlign: 'center', fontSize: `${fmt.subjectFontSize}pt`, fontWeight: '900', margin: '8mm 0 6mm', letterSpacing: '1px' };
    switch (fmt.subjectStyle) {
      case 'box': return { ...base, background: `${template.themeColor}12`, border: `1px solid ${template.themeColor}30`, borderRadius: '4px', padding: '3mm 5mm' };
      case 'underline': return { ...base, borderBottom: `2px solid ${template.themeColor}`, paddingBottom: '3mm' };
      case 'gradient': return { ...base, background: `linear-gradient(90deg, transparent, ${template.themeColor}20, transparent)`, padding: '3mm 0', borderBottom: `1.5px solid ${template.themeColor}40` };
      default: return { ...base, borderBottom: '1px solid #e2e8f0', paddingBottom: '4mm' };
    }
  };

  const getDividerStyle = (): React.CSSProperties => {
    const c = fmt.dividerColor;
    const base = { marginTop: '6mm', paddingTop: '4mm' };
    switch (fmt.dividerStyle) {
      case 'dashed': return { ...base, borderTop: `1px dashed ${c}` };
      case 'dotted': return { ...base, borderTop: `1px dotted ${c}` };
      case 'double': return { ...base, borderTop: `3px double ${c}` };
      case 'none': return { ...base };
      default: return { ...base, borderTop: `1px solid ${c}` };
    }
  };

  // ── Preview document ───────────────────────────────────────────────────────────

  const PreviewDocument = () => (
    <div ref={printRef} style={{
      width: '210mm', minHeight: '297mm',
      padding: `${fmt.marginTop}mm ${fmt.marginRight}mm ${fmt.marginBottom}mm ${fmt.marginLeft}mm`,
      background: '#fff', fontFamily: "'Malgun Gothic','Apple SD Gothic Neo',sans-serif",
      fontSize: `${fmt.bodyFontSize}pt`, color: '#000', margin: '0 auto', position: 'relative',
    }}>
      {/* Watermark */}
      {fmt.watermarkText && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%,-50%) rotate(-35deg)',
          fontSize: '60pt', fontWeight: '900', color: template.themeColor,
          opacity: fmt.watermarkOpacity, pointerEvents: 'none', whiteSpace: 'nowrap',
          userSelect: 'none', zIndex: 0,
        }}>
          {fmt.watermarkText}
        </div>
      )}

      {/* Custom CSS */}
      {fmt.customCss && <style>{fmt.customCss}</style>}

      {/* Header */}
      {(() => {
        const layout = fmt.headerLayout || 'centered';
        const wrapStyle: React.CSSProperties = {
          background: fmt.headerBgColor !== 'transparent' ? fmt.headerBgColor : undefined,
          marginTop: fmt.headerYOffset ? `${fmt.headerYOffset}mm` : undefined,
          marginBottom: `${fmt.headerMarginBottom}mm`,
          ...getHeaderBorder(),
        };

        // 로고
        const logoEl = template.logoUrl ? (
          <img src={template.logoUrl} alt="로고" style={{
            height: `${fmt.logoHeight}px`, objectFit: 'contain', flexShrink: 0,
            marginTop: `${fmt.logoYOffset}px`,
            transform: fmt.logoXOffset !== 0 ? `translateX(${fmt.logoXOffset}px)` : undefined,
          }} />
        ) : null;

        // 기관명
        const orgNameStyle: React.CSSProperties = {
          fontFamily: fmt.orgNameFontFamily || DEFAULT_FONT,
          fontSize: `${fmt.orgNameFontSize}pt`,
          fontWeight: '900',
          letterSpacing: `${fmt.orgNameLetterSpacing}px`,
          color: fmt.orgNameColor || template.themeColor,
          textAlign: fmt.orgNameAlign || 'center',
          marginBottom: '2mm',
          position: 'relative',
          left: fmt.orgNameXOffset ? `${fmt.orgNameXOffset}px` : undefined,
          top: fmt.orgNameYOffset ? `${fmt.orgNameYOffset}px` : undefined,
        };

        // 슬로건
        const sloganEl = fmt.showSlogan && template.orgSlogan ? (
          <div style={{
            fontFamily: fmt.sloganFontFamily || DEFAULT_FONT,
            fontSize: `${fmt.sloganFontSize || 8.5}pt`,
            color: fmt.sloganColor || '#64748b',
            textAlign: fmt.sloganAlign || 'center',
            marginBottom: '1mm',
            position: 'relative',
            left: fmt.sloganXOffset ? `${fmt.sloganXOffset}px` : undefined,
            top: fmt.sloganYOffset ? `${fmt.sloganYOffset}px` : undefined,
          }}>{template.orgSlogan}</div>
        ) : null;

        // 연락처
        const contactStyle: React.CSSProperties = {
          fontFamily: fmt.bodyFontFamily || DEFAULT_FONT,
          fontSize: `${fmt.contactFontSize || 8}pt`,
          color: fmt.contactColor || '#64748b',
          textAlign: fmt.contactAlign || 'center',
          position: 'relative',
          left: fmt.contactXOffset ? `${fmt.contactXOffset}px` : undefined,
        };
        const contactEl = fmt.showContact ? (
          <div style={contactStyle}>
            <div>우) {template.postalCode} {template.address}</div>
            <div>TEL: {template.tel} | FAX: {template.fax} | {template.email}</div>
          </div>
        ) : null;

        // 머리말 붙여넣기 영역 (있을 경우 대체 표시)
        const pastedHeaderEl = form.pastedHeaderHtml ? (
          <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(form.pastedHeaderHtml)}} />
        ) : null;

        const extraLines = (template.headerExtraLines || []).map((line, i) => (
          <div key={i} style={{ fontSize: `${fmt.contactFontSize || 8}pt`, color: fmt.contactColor || '#64748b', marginTop: '1mm' }}>{line}</div>
        ));

        if (pastedHeaderEl) {
          return <div style={wrapStyle}>{pastedHeaderEl}</div>;
        }

        if (layout === 'side-by-side') {
          return (
            <div style={wrapStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5mm' }}>
                {logoEl}
                <div style={{ flex: 1 }}>
                  <div style={orgNameStyle}>{template.orgName}</div>
                  {sloganEl}
                </div>
              </div>
              {contactEl}{extraLines}
            </div>
          );
        }

        if (layout === 'logo-left') {
          return (
            <div style={wrapStyle}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '3mm', marginBottom: '1mm' }}>
                {logoEl}
                {fmt.showSlogan && template.orgSlogan && (
                  <div style={{ flex: 1, textAlign: 'right', fontFamily: fmt.sloganFontFamily || DEFAULT_FONT, fontSize: `${fmt.sloganFontSize || 8.5}pt`, color: fmt.sloganColor || '#64748b', paddingTop: '1mm' }}>
                    {template.orgSlogan}
                  </div>
                )}
              </div>
              <div style={orgNameStyle}>{template.orgName}</div>
              {contactEl}{extraLines}
            </div>
          );
        }

        // Default: centered
        return (
          <div style={{ ...wrapStyle }}>
            {template.logoUrl && (
              <img src={template.logoUrl} alt="로고" style={{
                height: `${fmt.logoHeight}px`, objectFit: 'contain', display: 'block',
                margin: `${fmt.logoYOffset}px auto ${fmt.logoMarginBottom}mm`,
                transform: fmt.logoXOffset !== 0 ? `translateX(${fmt.logoXOffset}px)` : undefined,
              }} />
            )}
            <div style={orgNameStyle}>{template.orgName}</div>
            {sloganEl}{contactEl}{extraLines}
          </div>
        );
      })()}

      {/* ── 본문 영역 ── */}
      <div style={{ fontFamily: fmt.bodyFontFamily || DEFAULT_FONT, marginTop: fmt.bodyYOffset ? `${fmt.bodyYOffset}mm` : undefined, position: 'relative', left: fmt.bodyXOffset ? `${fmt.bodyXOffset}px` : undefined }}>

        {/* Metadata */}
        {fmt.metaStyle === 'minimal' ? (
          <div style={{ marginBottom: '8mm', fontSize: `${fmt.metaFontSize || 9.5}pt`, borderBottom: `1px solid ${fmt.dividerColor}`, paddingBottom: '4mm' }}>
            <div style={{ display: 'flex', gap: '8mm', flexWrap: 'wrap' }}>
              <span><b>수신:</b> {form.receiver}</span>
              {form.via && <span><b>경유:</b> {form.via}</span>}
            </div>
          </div>
        ) : fmt.metaStyle === 'compact' ? (
          <div style={{ marginBottom: '8mm', fontSize: `${fmt.metaFontSize || 9.5}pt` }}>
            {[
              ['수 신', form.receiver],
              ...(form.via ? [['(경유)', form.via]] : []),
              ['제 목', form.subject],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', padding: '1.5mm 0' }}>
                <span style={{ width: '18mm', fontWeight: '700', flexShrink: 0 }}>{k}</span>
                <span style={{ marginLeft: '3mm' }}>{v}</span>
              </div>
            ))}
          </div>
        ) : (
          /* table 스타일 (기본) */
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '5mm', fontSize: `${fmt.metaFontSize || 9.5}pt` }}>
            <tbody>
              <tr>
                <td style={{ width: '16mm', padding: '2mm 3mm', border: '1px solid #ccc', background: '#f8fafc', fontWeight: '700' }}>수 신</td>
                <td colSpan={3} style={{ padding: '2mm 3mm', border: '1px solid #ccc' }}>{form.receiver}</td>
              </tr>
              {form.via && (
                <tr>
                  <td style={{ padding: '2mm 3mm', border: '1px solid #ccc', background: '#f8fafc', fontWeight: '700' }}>(경유)</td>
                  <td colSpan={3} style={{ padding: '2mm 3mm', border: '1px solid #ccc' }}>{form.via}</td>
                </tr>
              )}
              <tr>
                <td style={{ padding: '2mm 3mm', border: '1px solid #ccc', background: '#f8fafc', fontWeight: '700' }}>제 목</td>
                <td colSpan={3} style={{ padding: '2mm 3mm', border: '1px solid #ccc', fontWeight: fmt.subjectBold ? '700' : '400' }}>{form.subject}</td>
              </tr>
            </tbody>
          </table>
        )}

        {/* Subject (최소 스타일일 때만 별도 표시 — 컴팩트/테이블은 메타 블록에 이미 포함) */}
        {fmt.metaStyle === 'minimal' && (
          <div style={{ ...getSubjectStyle() }}>제목: {form.subject}</div>
        )}

        {/* Body content */}
        {form.pasteMode && form.pastedBodyHtml ? (
          <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(form.pastedBodyHtml) }}
            style={{ fontFamily: fmt.bodyFontFamily || DEFAULT_FONT, fontSize: `${fmt.bodyFontSize}pt`, lineHeight: fmt.bodyLineHeight }} />
        ) : form.htmlMode ? (
          <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(form.htmlContent) }} />
        ) : (
          <>
            <div style={{ fontFamily: fmt.bodyFontFamily || DEFAULT_FONT, fontSize: `${fmt.bodyFontSize}pt`, lineHeight: fmt.bodyLineHeight, textAlign: fmt.bodyAlign || 'left', marginBottom: '6mm' }}>
              {[form.body1, form.body2, form.body3, form.body4].filter(Boolean).map((b, i) => (
                <p key={i} style={{ marginBottom: '3mm', textIndent: i === 0 ? '1em' : '0' }}>{b}</p>
              ))}
            </div>
            {form.items.filter(i => i.trim()).length > 0 && (
              <div style={{ ...getDividerStyle(), position: 'relative', left: fmt.itemsXOffset ? `${fmt.itemsXOffset}px` : undefined }}>
                <div style={{ fontWeight: '700', textAlign: 'center', marginBottom: '3mm', fontFamily: fmt.itemsFontFamily || DEFAULT_FONT, fontSize: `${fmt.itemsFontSize || 10}pt` }}>- 다  음 -</div>
                <ol style={{ paddingLeft: '6mm', lineHeight: fmt.itemsLineHeight || 2, fontFamily: fmt.itemsFontFamily || DEFAULT_FONT, fontSize: `${fmt.itemsFontSize || 10}pt`, textAlign: fmt.itemsAlign || 'left' }}>
                  {form.items.filter(i => i.trim()).map((item, idx) => (
                    <li key={idx} style={{ marginBottom: '1.5mm' }}>{idx + 1}. {item}</li>
                  ))}
                </ol>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer — 절대 위치 고정 */}
      {(() => {
        const footerBase: React.CSSProperties = {
          position: 'absolute',
          bottom: `${fmt.marginBottom + (fmt.footerYOffset || 0)}mm`,
          left: `${fmt.marginLeft}mm`,
          right: `${fmt.marginRight}mm`,
        };
        const innerShift: React.CSSProperties = fmt.footerXOffset
          ? { position: 'relative', left: `${fmt.footerXOffset}px` }
          : {};

        if ((fmt.footerStyle || 'simple') === 'official') {
          return (
            <div style={footerBase}>
              <div style={{ textAlign: 'center', fontSize: `${fmt.orgNameFontSize * 0.75}pt`, fontWeight: '900', letterSpacing: `${fmt.orgNameLetterSpacing}px`, color: '#000', marginBottom: '6mm', ...innerShift }}>
                {template.orgName} {template.representativeTitle}
              </div>
              {template.sealUrl && (
                <img src={template.sealUrl} alt="도장" style={{ position: 'absolute', right: `${fmt.sealRight}mm`, top: `${fmt.sealBottom}mm`, height: `${fmt.sealHeight}mm`, opacity: fmt.sealOpacity, objectFit: 'contain' }} />
              )}
              <div style={{ borderTop: `${fmt.headerBorderWidth}px solid ${template.themeColor}`, paddingTop: '2mm', fontSize: `${fmt.footerFontSize}pt`, color: '#000', fontFamily: fmt.footerFontFamily || DEFAULT_FONT, ...innerShift }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>담당&emsp;{template.manager || ''}</span>
                  <span>{template.representativeTitle}&emsp;{template.representative}</span>
                </div>
                <div>협조자&emsp;{template.assistant || ''}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1mm' }}>
                  <span>시행&emsp;{template.docPrefix}-{form.docNo.year}-{String(form.docNo.num).padStart(3, '0')}({form.date})</span>
                  <span>접수</span>
                </div>
                <div style={{ marginTop: '1mm' }}>우) {template.postalCode} {template.address} /</div>
                <div>전화 {template.tel} / 전송 {template.fax} / 이메일 {template.email} / {template.publicStatus}</div>
                {(template.footerExtraLines || []).map((line, i) => <div key={i}>{line}</div>)}
              </div>
            </div>
          );
        }

        if (form.pasteMode && form.pastedFooterHtml) {
          return (
            <div style={{ ...footerBase, borderTop: `${fmt.headerBorderWidth}px solid ${template.themeColor}`, paddingTop: '3mm' }}>
              <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(form.pastedFooterHtml) }}
                style={{ fontFamily: fmt.footerFontFamily || DEFAULT_FONT, fontSize: `${fmt.footerFontSize}pt`, ...innerShift }} />
            </div>
          );
        }

        return (
          <div style={{ ...footerBase, borderTop: `${fmt.headerBorderWidth}px solid ${template.themeColor}`, paddingTop: '5mm' }}>
            <div style={{ fontFamily: fmt.footerFontFamily || DEFAULT_FONT, textAlign: fmt.footerAlign, fontSize: `${fmt.footerFontSize}pt`, ...innerShift }}>
              <div style={{ marginBottom: '1.5mm' }}>{form.date}</div>
              {fmt.showFooterOrgName && <div style={{ fontWeight: '900', fontSize: `${fmt.footerFontSize + 1.5}pt`, marginBottom: '1mm' }}>{template.orgName}</div>}
              {fmt.showFooterRepresentative && <div>{template.representativeTitle} {template.representative} (인)</div>}
              {fmt.showFooterManager && template.manager && <div>담당자: {template.manager}</div>}
              {fmt.showFooterAddress && (
                <div style={{ fontSize: `${fmt.footerFontSize - 1}pt`, color: '#475569' }}>
                  {template.postalCode && `우) ${template.postalCode} `}{template.address}
                </div>
              )}
              {(fmt.showFooterTel || fmt.showFooterFax) && (
                <div style={{ fontSize: `${fmt.footerFontSize - 1}pt`, color: '#475569' }}>
                  {fmt.showFooterTel && template.tel && `TEL: ${template.tel}`}
                  {fmt.showFooterTel && fmt.showFooterFax && template.tel && template.fax && ' | '}
                  {fmt.showFooterFax && template.fax && `FAX: ${template.fax}`}
                </div>
              )}
              {fmt.showFooterEmail && template.email && <div style={{ fontSize: `${fmt.footerFontSize - 1}pt`, color: '#475569' }}>{template.email}</div>}
              {(template.footerExtraLines || []).map((line, i) => <div key={i} style={{ fontSize: `${fmt.footerFontSize - 0.5}pt` }}>{line}</div>)}
            </div>
            {template.sealUrl && (
              <img src={template.sealUrl} alt="도장" style={{ position: 'absolute', right: `${fmt.sealRight}mm`, bottom: `${fmt.sealBottom}mm`, height: `${fmt.sealHeight}mm`, opacity: fmt.sealOpacity, objectFit: 'contain' }} />
            )}
          </div>
        );
      })()}
    </div>
  );

  // ── Format editor sections ────────────────────────────────────────────────────

  const fmtSections = [
    { id: 'page',    label: '여백',    icon: <Layout size={11} /> },
    { id: 'header',  label: '머리말',  icon: <Type size={11} /> },
    { id: 'body',    label: '본문',    icon: <FileText size={11} /> },
    { id: 'footer',  label: '꼬리말',  icon: <Layers size={11} /> },
    { id: 'seal',    label: '도장',    icon: <Layers size={11} /> },
    { id: 'image',   label: '이미지',  icon: <Upload size={11} /> },
    { id: 'extra',   label: '기타',    icon: <Palette size={11} /> },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────────

  return (
    <div className="anim-in space-y-5">

      {/* ── Hero bar ── */}
      <div className="sky-hero p-6 sm:p-8 text-white relative overflow-hidden"
        style={{
          boxShadow: '0 8px 40px rgba(14,127,168,.4)',
        }}>
        {/* shine line */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg,transparent,rgba(255,255,255,.6),transparent)' }} />
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative z-10">
          <div>
            <div className="text-sky-200 text-[10px] font-bold uppercase tracking-widest mb-1">Official Document</div>
            <div className="text-2xl sm:text-3xl font-black tracking-tight" style={{ textShadow: '0 2px 8px rgba(0,0,0,.2)' }}>
              공문 작성 및 발송
            </div>
            <p className="text-sky-200 text-xs sm:text-sm mt-2 font-medium">나라미 사업 관련 공문서를 작성하고 이력을 관리합니다.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {isAdmin && (
              <>
                <button onClick={() => { setShowFormatEditor(p => !p); setShowTemplateEditor(false); }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all border ${showFormatEditor ? 'bg-white text-sky-700 border-white shadow-md' : 'border-white/30 hover:border-white/60 text-white hover:bg-white/15'}`}>
                  <Settings size={15} /> 서식 편집
                </button>
                <button onClick={() => { if (showTemplateEditor) { setShowTemplateEditor(false); } else { setEditingTmpl({ ...template }); setShowTemplateEditor(true); setShowFormatEditor(false); } }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all border ${showTemplateEditor ? 'bg-white text-sky-700 border-white shadow-md' : 'border-white/30 hover:border-white/60 text-white hover:bg-white/15'}`}>
                  <Edit3 size={15} /> 기관 정보
                </button>
              </>
            )}
            <button onClick={() => setShowHistory(p => !p)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all border border-white/30 hover:border-white/60 text-white hover:bg-white/15">
              <History size={15} /> 이력 (최근 {history.length}건)
            </button>
          </div>
        </div>
      </div>

      {/* ── Template selector ── */}
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <label className="text-xs font-black text-sky-600 uppercase tracking-widest">공문 양식 선택</label>
          {isAdmin && (
            <button onClick={() => { setShowAddTemplate(true); setNewTmpl({ themeColor: '#8A3D0A', representativeTitle: '대표', publicStatus: '공개' }); }}
              className="flex items-center gap-1 text-sky-600 hover:text-sky-800 text-xs font-bold border border-sky-200 hover:border-sky-400 hover:bg-sky-50 px-3 py-1.5 rounded-xl transition-all">
              <Plus size={13} /> 새 양식 추가
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {templates.map(t => (
            <div key={t.id} className="flex items-center gap-1">
              <button onClick={() => setSelectedId(t.id)}
                className={`py-2 px-4 rounded-xl font-bold text-sm transition-all border-2 ${selectedId === t.id ? 'text-white shadow-lg border-transparent' : 'bg-white text-slate-600 border-sky-100 hover:border-sky-300'}`}
                style={selectedId === t.id ? { background: `linear-gradient(135deg,${t.themeColor},${t.themeColor}cc)`, boxShadow: `0 4px 16px ${t.themeColor}55` } : {}}>
                {t.name}
              </button>
              {isAdmin && !t.isBuiltIn && (
                <button onClick={() => handleDeleteTemplate(t.id)} className="text-slate-300 hover:text-red-500 p-1 transition-colors"><X size={13} /></button>
              )}
            </div>
          ))}
        </div>
        <div className="mt-3 p-3 rounded-xl text-[10px] text-sky-600 space-y-0.5 bg-sky-50/70 border border-sky-100">
          <div className="font-bold text-sky-700">{template.orgSlogan}</div>
          <div>우) {template.postalCode} {template.address}</div>
          <div>TEL {template.tel} | FAX {template.fax} | {template.email}</div>
          <div>{template.representativeTitle}: {template.representative}</div>
        </div>
      </div>

      {/* ── Add template ── */}
      {showAddTemplate && (
        <div className="glass rounded-2xl overflow-hidden border border-sky-200">
          <div className="bg-sky-50 px-5 py-3 border-b border-sky-200 flex items-center justify-between">
            <h4 className="font-black text-sky-700 text-sm flex items-center gap-2"><FileText size={15} /> 새 공문 양식 추가</h4>
            <button onClick={() => setShowAddTemplate(false)}><X size={16} className="text-sky-400" /></button>
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { label: '기관명 *', key: 'orgName', placeholder: '예: 웰쉐어복지재단' },
              { label: '문서번호 접두사 *', key: 'docPrefix', placeholder: '예: 웰복재' },
              { label: '슬로건', key: 'orgSlogan', placeholder: '기관 슬로건' },
              { label: '대표자 이름', key: 'representative', placeholder: '홍길동' },
              { label: '직책', key: 'representativeTitle', placeholder: '대표이사' },
              { label: '우편번호', key: 'postalCode', placeholder: '12345' },
              { label: '주소', key: 'address', placeholder: '주소 입력' },
              { label: '전화', key: 'tel', placeholder: '031-000-0000' },
              { label: '팩스', key: 'fax', placeholder: '031-000-0001' },
              { label: '이메일', key: 'email', placeholder: 'info@example.com' },
            ].map(({ label, key, placeholder }) => (
              <div key={key} className={key === 'address' || key === 'orgSlogan' ? 'sm:col-span-2' : ''}>
                <label className="text-[10px] font-bold text-sky-600 mb-1 block">{label}</label>
                <input type="text" value={String(newTmpl[key as keyof DocTemplate] ?? '')} placeholder={placeholder}
                  onChange={e => setNewTmpl(p => ({ ...p, [key]: e.target.value }))}
                  className="w-full border border-sky-200 rounded-xl px-3 py-2 text-sm font-medium outline-none bg-sky-50/50 focus:border-sky-400 transition-colors" />
              </div>
            ))}
            <div>
              <label className="text-[10px] font-bold text-sky-600 mb-1 block">테마 색상</label>
              <div className="flex items-center gap-2">
                <input type="color" value={newTmpl.themeColor || '#8A3D0A'}
                  onChange={e => setNewTmpl(p => ({ ...p, themeColor: e.target.value }))}
                  className="h-9 w-14 rounded-xl border border-sky-200 cursor-pointer p-0.5 bg-sky-50" />
                <span className="text-xs font-mono text-sky-600">{newTmpl.themeColor || '#8A3D0A'}</span>
              </div>
            </div>
          </div>
          <div className="px-5 pb-5 flex gap-3">
            <button onClick={() => setShowAddTemplate(false)} className="flex-1 py-2.5 rounded-xl font-bold text-sm bg-sky-50 text-sky-700 hover:bg-sky-100 transition-colors border border-sky-200">취소</button>
            <button onClick={handleAddTemplate} disabled={isSaving} className="flex-1 btn-sky py-2.5 rounded-xl font-bold text-sm disabled:opacity-50">추가하기</button>
          </div>
        </div>
      )}

      {/* ── Format Editor ── */}
      {showFormatEditor && (
        <div className="glass rounded-2xl overflow-hidden border border-sky-100">
          {/* Header */}
          <div className="px-5 py-3 border-b border-sky-100 flex items-center justify-between"
            style={{ background: 'linear-gradient(135deg, rgba(232,163,23,.10), rgba(212,122,26,.04))' }}>
            <h4 className="font-black text-sky-700 text-sm flex items-center gap-2">
              <Settings size={15} className="text-sky-500" /> 서식 편집 — <span style={{ color: template.themeColor }}>{template.name}</span>
            </h4>
            <div className="flex items-center gap-2">
              <button onClick={resetFormat} className="flex items-center gap-1 text-[11px] font-bold text-sky-500 hover:text-red-500 border border-sky-200 hover:border-red-300 px-2 py-1 rounded-lg transition-colors">
                <RotateCcw size={11} /> 초기화
              </button>
              <button onClick={() => setShowFormatEditor(false)}><X size={16} className="text-sky-400" /></button>
            </div>
          </div>

          {/* Section tabs */}
          <div className="flex overflow-x-auto border-b border-sky-100" style={{ scrollbarWidth: 'none' }}>
            {fmtSections.map(s => (
              <button key={s.id} onClick={() => setFmtSection(s.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold whitespace-nowrap transition-all border-b-2 ${fmtSection === s.id ? 'border-sky-500 text-sky-600 bg-sky-50' : 'border-transparent text-slate-500 hover:text-sky-600 hover:bg-sky-50/50'}`}>
                {s.icon} {s.label}
              </button>
            ))}
          </div>

          <div className="p-5">
            {/* Page */}
            {fmtSection === 'page' && (
              <div className="space-y-4">
                <SectionHeader icon={<Layout size={11} />} title="페이지 여백 (mm)" />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <FmtNum label="상단" value={fmt.marginTop} onChange={v => updateFormat('marginTop', v)} unit="mm" min={0} max={50} />
                  <FmtNum label="하단" value={fmt.marginBottom} onChange={v => updateFormat('marginBottom', v)} unit="mm" min={0} max={50} />
                  <FmtNum label="좌측" value={fmt.marginLeft} onChange={v => updateFormat('marginLeft', v)} unit="mm" min={0} max={50} />
                  <FmtNum label="우측" value={fmt.marginRight} onChange={v => updateFormat('marginRight', v)} unit="mm" min={0} max={50} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <FmtSelect label="메타정보 스타일" value={fmt.metaStyle}
                    options={[{ v: 'table', l: '테이블 (기본)' }, { v: 'compact', l: '컴팩트 (줄 구분)' }, { v: 'minimal', l: '최소 (인라인)' }]}
                    onChange={v => updateFormat('metaStyle', v)} />
                  <div>
                    <label className="text-[10px] font-bold text-sky-600 mb-1 block">구분선 스타일</label>
                    <div className="flex gap-2 flex-wrap">
                      {[{ v: 'solid', l: '실선' }, { v: 'dashed', l: '점선' }, { v: 'dotted', l: '점점' }, { v: 'double', l: '이중' }, { v: 'none', l: '없음' }].map(o => (
                        <button key={o.v} onClick={() => updateFormat('dividerStyle', o.v)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border ${fmt.dividerStyle === o.v ? 'bg-sky-500 text-white border-sky-500 shadow-sm' : 'bg-sky-50 text-sky-600 border-sky-200 hover:border-sky-400'}`}>
                          {o.l}
                        </button>
                      ))}
                    </div>
                  </div>
                  <FmtColor label="구분선 색상" value={fmt.dividerColor} onChange={v => updateFormat('dividerColor', v)} />
                </div>
              </div>
            )}

            {/* Header */}
            {fmtSection === 'header' && (
              <div className="space-y-5">
                <div>
                  <SectionHeader icon={<Layout size={11} />} title="머리말 전체 위치 / 레이아웃" />
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <FmtNum label="머리말 Y 위치" value={fmt.headerYOffset} onChange={v => updateFormat('headerYOffset', v)} unit="mm" min={-20} max={40} step={0.5} />
                    <FmtNum label="헤더 하단 여백" value={fmt.headerMarginBottom} onChange={v => updateFormat('headerMarginBottom', v)} unit="mm" min={0} max={30} step={0.5} />
                    <FmtNum label="구분선 두께" value={fmt.headerBorderWidth} onChange={v => updateFormat('headerBorderWidth', v)} unit="px" min={0} max={10} />
                    <FmtNum label="구분선 패딩" value={fmt.headerPaddingBottom} onChange={v => updateFormat('headerPaddingBottom', v)} unit="mm" min={0} max={20} step={0.5} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                    <FmtSelect label="머리말 레이아웃" value={fmt.headerLayout || 'centered'}
                      options={[
                        { v: 'centered', l: '중앙 정렬 (기본)' },
                        { v: 'logo-left', l: '로고 좌측 + 기관명 중앙' },
                        { v: 'side-by-side', l: '로고·기관명 나란히' },
                      ]}
                      onChange={v => updateFormat('headerLayout', v)} />
                    <FmtColor label="헤더 배경색" value={fmt.headerBgColor} onChange={v => updateFormat('headerBgColor', v)} />
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {[{ v: 'solid', l: '실선' }, { v: 'double', l: '이중선' }, { v: 'dashed', l: '점선' }, { v: 'gradient', l: '그라디언트' }, { v: 'none', l: '없음' }].map(o => (
                      <button key={o.v} onClick={() => updateFormat('headerStyle', o.v)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${fmt.headerStyle === o.v ? 'bg-sky-500 text-white border-sky-500 shadow-md' : 'bg-sky-50 text-sky-600 border-sky-200 hover:border-sky-400'}`}>
                        {o.l}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <SectionHeader icon={<Type size={11} />} title="기관명" />
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <FmtSelect label="글꼴" value={fmt.orgNameFontFamily || DEFAULT_FONT} options={FONT_OPTIONS} onChange={v => updateFormat('orgNameFontFamily', v)} />
                    <FmtNum label="크기" value={fmt.orgNameFontSize} onChange={v => updateFormat('orgNameFontSize', v)} unit="pt" min={10} max={36} />
                    <FmtNum label="자간" value={fmt.orgNameLetterSpacing} onChange={v => updateFormat('orgNameLetterSpacing', v)} unit="px" min={0} max={20} />
                    <FmtColor label="색상 (빈칸=테마색)" value={fmt.orgNameColor} onChange={v => updateFormat('orgNameColor', v)} />
                    <FmtSelect label="정렬" value={fmt.orgNameAlign || 'center'}
                      options={[{ v: 'left', l: '좌측' }, { v: 'center', l: '가운데' }, { v: 'right', l: '우측' }]}
                      onChange={v => updateFormat('orgNameAlign', v)} />
                    <FmtNum label="X 이동" value={fmt.orgNameXOffset} onChange={v => updateFormat('orgNameXOffset', v)} unit="px" min={-150} max={150} />
                    <FmtNum label="Y 이동" value={fmt.orgNameYOffset} onChange={v => updateFormat('orgNameYOffset', v)} unit="px" min={-30} max={60} />
                  </div>
                </div>

                <div>
                  <SectionHeader icon={<Upload size={11} />} title="로고" />
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <FmtNum label="높이" value={fmt.logoHeight} onChange={v => updateFormat('logoHeight', v)} unit="px" min={10} max={120} />
                    <FmtNum label="하단 여백" value={fmt.logoMarginBottom} onChange={v => updateFormat('logoMarginBottom', v)} unit="mm" min={0} max={20} step={0.5} />
                    <FmtNum label="X 이동" value={fmt.logoXOffset} onChange={v => updateFormat('logoXOffset', v)} unit="px" min={-100} max={100} />
                    <FmtNum label="Y 이동" value={fmt.logoYOffset} onChange={v => updateFormat('logoYOffset', v)} unit="px" min={-20} max={60} />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[11px] font-black text-sky-700 uppercase tracking-widest flex items-center gap-2">
                      <span className="ws-grad w-6 h-6 rounded-lg flex items-center justify-center text-white text-[12px]" style={{ boxShadow: '0 2px 8px rgba(232,163,23,.5)' }}><Type size={11} /></span>
                      슬로건
                    </p>
                    <FmtToggle label="슬로건 표시" value={fmt.showSlogan} onChange={v => updateFormat('showSlogan', v)} />
                  </div>
                  {fmt.showSlogan && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <FmtSelect label="글꼴" value={fmt.sloganFontFamily || DEFAULT_FONT} options={FONT_OPTIONS} onChange={v => updateFormat('sloganFontFamily', v)} />
                      <FmtNum label="크기" value={fmt.sloganFontSize} onChange={v => updateFormat('sloganFontSize', v)} unit="pt" min={7} max={18} step={0.5} />
                      <FmtColor label="색상" value={fmt.sloganColor} onChange={v => updateFormat('sloganColor', v)} />
                      <FmtSelect label="정렬" value={fmt.sloganAlign || 'center'}
                        options={[{ v: 'left', l: '좌측' }, { v: 'center', l: '가운데' }, { v: 'right', l: '우측' }]}
                        onChange={v => updateFormat('sloganAlign', v)} />
                      <FmtNum label="X 이동" value={fmt.sloganXOffset} onChange={v => updateFormat('sloganXOffset', v)} unit="px" min={-150} max={150} />
                      <FmtNum label="Y 이동" value={fmt.sloganYOffset} onChange={v => updateFormat('sloganYOffset', v)} unit="px" min={-20} max={40} />
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[11px] font-black text-sky-700 uppercase tracking-widest flex items-center gap-2">
                      <span className="ws-grad w-6 h-6 rounded-lg flex items-center justify-center text-white text-[12px]" style={{ boxShadow: '0 2px 8px rgba(232,163,23,.5)' }}><Type size={11} /></span>
                      연락처 (머리말)
                    </p>
                    <FmtToggle label="연락처 표시" value={fmt.showContact} onChange={v => updateFormat('showContact', v)} />
                  </div>
                  {fmt.showContact && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <FmtNum label="크기" value={fmt.contactFontSize} onChange={v => updateFormat('contactFontSize', v)} unit="pt" min={6} max={12} step={0.5} />
                      <FmtColor label="색상" value={fmt.contactColor} onChange={v => updateFormat('contactColor', v)} />
                      <FmtSelect label="정렬" value={fmt.contactAlign || 'center'}
                        options={[{ v: 'left', l: '좌측' }, { v: 'center', l: '가운데' }, { v: 'right', l: '우측' }]}
                        onChange={v => updateFormat('contactAlign', v)} />
                      <FmtNum label="X 이동" value={fmt.contactXOffset} onChange={v => updateFormat('contactXOffset', v)} unit="px" min={-150} max={150} />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Body */}
            {fmtSection === 'body' && (
              <div className="space-y-5">
                <div>
                  <SectionHeader icon={<FileText size={11} />} title="본문 전체 위치" />
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <FmtNum label="본문 Y 위치" value={fmt.bodyYOffset} onChange={v => updateFormat('bodyYOffset', v)} unit="mm" min={-20} max={40} step={0.5} />
                    <FmtNum label="메타정보 크기" value={fmt.metaFontSize} onChange={v => updateFormat('metaFontSize', v)} unit="pt" min={7} max={14} step={0.5} />
                    <FmtSelect label="메타정보 스타일" value={fmt.metaStyle}
                      options={[{ v: 'table', l: '테이블 (기본)' }, { v: 'compact', l: '컴팩트' }, { v: 'minimal', l: '최소' }]}
                      onChange={v => updateFormat('metaStyle', v)} />
                  </div>
                </div>
                <div>
                  <SectionHeader icon={<Type size={11} />} title="제목" />
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <FmtSelect label="글꼴" value={fmt.subjectFontFamily || DEFAULT_FONT} options={FONT_OPTIONS} onChange={v => updateFormat('subjectFontFamily', v)} />
                    <FmtNum label="크기" value={fmt.subjectFontSize} onChange={v => updateFormat('subjectFontSize', v)} unit="pt" min={10} max={24} step={0.5} />
                    <FmtSelect label="정렬" value={fmt.subjectAlign || 'center'}
                      options={[{ v: 'left', l: '좌측' }, { v: 'center', l: '가운데' }, { v: 'right', l: '우측' }]}
                      onChange={v => updateFormat('subjectAlign', v)} />
                    <FmtToggle label="제목 굵게" value={fmt.subjectBold} onChange={v => updateFormat('subjectBold', v)} />
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {[{ v: 'plain', l: '기본 (구분선)' }, { v: 'box', l: '박스형' }, { v: 'underline', l: '밑줄형' }, { v: 'gradient', l: '그라디언트' }].map(o => (
                      <button key={o.v} onClick={() => updateFormat('subjectStyle', o.v)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${fmt.subjectStyle === o.v ? 'bg-sky-500 text-white border-sky-500 shadow-md' : 'bg-sky-50 text-sky-600 border-sky-200 hover:border-sky-400'}`}>
                        {o.l}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <SectionHeader icon={<FileText size={11} />} title="본문 텍스트" />
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <FmtSelect label="글꼴" value={fmt.bodyFontFamily || DEFAULT_FONT} options={FONT_OPTIONS} onChange={v => updateFormat('bodyFontFamily', v)} />
                    <FmtNum label="크기" value={fmt.bodyFontSize} onChange={v => updateFormat('bodyFontSize', v)} unit="pt" min={7} max={16} step={0.5} />
                    <FmtNum label="행간" value={fmt.bodyLineHeight} onChange={v => updateFormat('bodyLineHeight', v)} min={1} max={4} step={0.1} />
                    <FmtSelect label="정렬" value={fmt.bodyAlign || 'left'}
                      options={[{ v: 'left', l: '좌측' }, { v: 'center', l: '가운데' }, { v: 'right', l: '우측' }]}
                      onChange={v => updateFormat('bodyAlign', v)} />
                    <FmtNum label="X 이동" value={fmt.bodyXOffset} onChange={v => updateFormat('bodyXOffset', v)} unit="px" min={-150} max={150} />
                  </div>
                </div>
                <div>
                  <SectionHeader icon={<FileText size={11} />} title="첨부항목 (다음 목록)" />
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <FmtSelect label="글꼴" value={fmt.itemsFontFamily || DEFAULT_FONT} options={FONT_OPTIONS} onChange={v => updateFormat('itemsFontFamily', v)} />
                    <FmtNum label="크기" value={fmt.itemsFontSize || 10} onChange={v => updateFormat('itemsFontSize', v)} unit="pt" min={7} max={16} step={0.5} />
                    <FmtNum label="행간" value={fmt.itemsLineHeight || 2} onChange={v => updateFormat('itemsLineHeight', v)} min={1} max={4} step={0.1} />
                    <FmtSelect label="정렬" value={fmt.itemsAlign || 'left'}
                      options={[{ v: 'left', l: '좌측' }, { v: 'center', l: '가운데' }, { v: 'right', l: '우측' }]}
                      onChange={v => updateFormat('itemsAlign', v)} />
                    <FmtNum label="X 이동" value={fmt.itemsXOffset || 0} onChange={v => updateFormat('itemsXOffset', v)} unit="px" min={-150} max={150} />
                  </div>
                </div>
                <div>
                  <SectionHeader icon={<Layers size={11} />} title="구분선 (다음 목록 위)" />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-sky-600 mb-1 block">구분선 스타일</label>
                      <div className="flex gap-2 flex-wrap">
                        {[{ v: 'solid', l: '실선' }, { v: 'dashed', l: '점선' }, { v: 'dotted', l: '점점' }, { v: 'double', l: '이중' }, { v: 'none', l: '없음' }].map(o => (
                          <button key={o.v} onClick={() => updateFormat('dividerStyle', o.v)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border ${fmt.dividerStyle === o.v ? 'bg-sky-500 text-white border-sky-500 shadow-sm' : 'bg-sky-50 text-sky-600 border-sky-200 hover:border-sky-400'}`}>
                            {o.l}
                          </button>
                        ))}
                      </div>
                    </div>
                    <FmtColor label="구분선 색상" value={fmt.dividerColor} onChange={v => updateFormat('dividerColor', v)} />
                  </div>
                </div>
              </div>
            )}

            {/* Footer */}
            {fmtSection === 'footer' && (
              <div className="space-y-5">
                <div>
                  <SectionHeader icon={<Layers size={11} />} title="꼬리말 전체 위치 / 스타일" />
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <FmtSelect label="꼬리말 스타일" value={fmt.footerStyle || 'simple'}
                      options={[
                        { v: 'simple', l: '심플 (기관명+대표자)' },
                        { v: 'official', l: '공식 (담당/시행/접수 블록)' },
                      ]}
                      onChange={v => updateFormat('footerStyle', v)} />
                    <FmtNum label="하단 여백" value={fmt.footerYOffset} onChange={v => updateFormat('footerYOffset', v)} unit="mm" min={0} max={100} step={0.5} />
                    <FmtSelect label="글꼴" value={fmt.footerFontFamily || DEFAULT_FONT} options={FONT_OPTIONS} onChange={v => updateFormat('footerFontFamily', v)} />
                    <FmtNum label="글자 크기" value={fmt.footerFontSize} onChange={v => updateFormat('footerFontSize', v)} unit="pt" min={7} max={14} step={0.5} />
                    <FmtSelect label="정렬 (심플)" value={fmt.footerAlign}
                      options={[{ v: 'left', l: '좌측' }, { v: 'center', l: '가운데' }, { v: 'right', l: '우측' }]}
                      onChange={v => updateFormat('footerAlign', v)} />
                    <FmtNum label="X 이동" value={fmt.footerXOffset} onChange={v => updateFormat('footerXOffset', v)} unit="px" min={-150} max={150} />
                  </div>
                  <p className="text-[10px] text-sky-400 mt-2 font-medium">
                    ※ 꼬리말은 본문 길이와 무관하게 페이지 하단에 고정됩니다. 하단 여백 = 페이지 하단 여백(marginBottom)에서 얼마나 위로 올릴지.
                  </p>
                  <p className="text-[10px] text-sky-400 font-medium">
                    ※ 공식 스타일: 담당·협조자·시행·접수·주소·전화 블록 자동 표시 — 담당자/협조자는 기관 정보에서 설정
                  </p>
                </div>
                <div>
                  <SectionHeader icon={<Type size={11} />} title="표시할 꼬리말 항목" />
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <FmtToggle label="기관명" value={fmt.showFooterOrgName} onChange={v => updateFormat('showFooterOrgName', v)} />
                    <FmtToggle label="대표자" value={fmt.showFooterRepresentative} onChange={v => updateFormat('showFooterRepresentative', v)} />
                    <FmtToggle label="담당자" value={fmt.showFooterManager} onChange={v => updateFormat('showFooterManager', v)} />
                    <FmtToggle label="주소" value={fmt.showFooterAddress} onChange={v => updateFormat('showFooterAddress', v)} />
                    <FmtToggle label="전화" value={fmt.showFooterTel} onChange={v => updateFormat('showFooterTel', v)} />
                    <FmtToggle label="팩스" value={fmt.showFooterFax} onChange={v => updateFormat('showFooterFax', v)} />
                    <FmtToggle label="이메일" value={fmt.showFooterEmail} onChange={v => updateFormat('showFooterEmail', v)} />
                  </div>
                  <p className="text-[10px] text-sky-400 mt-3 font-medium">
                    ※ 담당자·추가문구는 기관 정보 편집에서 설정합니다.
                  </p>
                </div>
              </div>
            )}

            {/* Seal */}
            {fmtSection === 'seal' && (
              <div className="space-y-3">
                <SectionHeader icon={<Layers size={11} />} title="도장 위치 / 크기" />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <FmtNum label="도장 높이" value={fmt.sealHeight} onChange={v => updateFormat('sealHeight', v)} unit="mm" min={10} max={60} />
                  <FmtNum label="우측 여백" value={fmt.sealRight} onChange={v => updateFormat('sealRight', v)} unit="mm" min={-30} max={50} step={0.5} />
                  <FmtNum label="하단 위치" value={fmt.sealBottom} onChange={v => updateFormat('sealBottom', v)} unit="mm" min={-30} max={50} step={0.5} />
                  <FmtNum label="투명도" value={fmt.sealOpacity} onChange={v => updateFormat('sealOpacity', v)} min={0} max={1} step={0.05} />
                </div>
              </div>
            )}

            {/* Image */}
            {fmtSection === 'image' && (
              <div className="space-y-4">
                <SectionHeader icon={<Upload size={11} />} title="로고 / 도장 이미지" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {(['logo', 'seal'] as const).map(field => {
                    const url = field === 'logo' ? template.logoUrl : template.sealUrl;
                    const ref = field === 'logo' ? logoRef : sealRef;
                    const label = field === 'logo' ? '로고' : '도장';
                    return (
                      <div key={field} className="space-y-2">
                        <p className="text-xs font-bold text-sky-600">{label} 이미지</p>
                        {url ? (
                          <div className="flex items-center gap-3 bg-sky-50 rounded-xl p-3 border border-sky-100">
                            <img src={url} alt={label} className="h-12 object-contain rounded-lg" />
                            <div className="flex gap-2 ml-auto">
                              <button onClick={() => ref.current?.click()} className="text-xs font-bold text-sky-600 hover:text-sky-800 px-2.5 py-1.5 border border-sky-200 rounded-lg hover:bg-sky-100 transition-colors">교체</button>
                              <button onClick={() => handleImageDelete(field)} className="text-xs font-bold text-red-500 hover:text-red-700 px-2.5 py-1.5 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">삭제</button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => ref.current?.click()} disabled={isSaving}
                            className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-sky-200 rounded-xl py-4 text-xs font-bold text-sky-400 hover:border-sky-400 hover:text-sky-600 hover:bg-sky-50 transition-all">
                            <Upload size={14} /> {label} 이미지 업로드
                          </button>
                        )}
                        <input ref={ref} type="file" accept="image/*" className="hidden"
                          onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(field, f); e.target.value = ''; }} />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Extra */}
            {fmtSection === 'extra' && (
              <div className="space-y-5">
                <div>
                  <SectionHeader icon={<Palette size={11} />} title="워터마크" />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className="text-[10px] font-bold text-sky-600 mb-1 block">워터마크 텍스트 (비워두면 없음)</label>
                      <input type="text" value={fmt.watermarkText} placeholder="예: 초안 / DRAFT / 기밀"
                        onChange={e => updateFormat('watermarkText', e.target.value)}
                        className="w-full border border-sky-200 rounded-xl px-3 py-2 text-sm font-medium outline-none bg-sky-50/50 focus:border-sky-400 transition-colors" />
                    </div>
                    <FmtNum label="워터마크 투명도" value={fmt.watermarkOpacity} onChange={v => updateFormat('watermarkOpacity', v)} min={0} max={0.5} step={0.01} />
                  </div>
                </div>
                <div>
                  <SectionHeader icon={<Code size={11} />} title="사용자 정의 CSS" />
                  <textarea value={fmt.customCss} onChange={e => updateFormat('customCss', e.target.value)}
                    rows={6} placeholder="/* 공문에 적용될 CSS를 직접 입력하세요 */&#10;/* 예: td { font-size: 9pt; } */"
                    className="code-editor w-full resize-y" />
                  <p className="text-[10px] text-sky-400 mt-1 font-medium">이 CSS는 인쇄 및 미리보기에 직접 적용됩니다.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Template info editor ── */}
      {showTemplateEditor && editingTmpl && (
        <div className="glass rounded-2xl overflow-hidden border border-orange-200">
          <div className="bg-orange-50 px-5 py-3 border-b border-orange-200 flex items-center justify-between">
            <h4 className="font-black text-orange-700 text-sm flex items-center gap-2"><Edit3 size={15} /> 기관 정보 편집 — {template.name}</h4>
            <button onClick={() => setShowTemplateEditor(false)}><X size={16} className="text-orange-400" /></button>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { label: '기관명', key: 'orgName' }, { label: '슬로건', key: 'orgSlogan' },
                { label: '문서번호 접두사', key: 'docPrefix' }, { label: '대표자 이름', key: 'representative' },
                { label: '직책', key: 'representativeTitle' }, { label: '담당자', key: 'manager' }, { label: '협조자', key: 'assistant' },
                { label: '우편번호', key: 'postalCode' }, { label: '주소', key: 'address' },
                { label: '전화', key: 'tel' }, { label: '팩스', key: 'fax' },
                { label: '이메일', key: 'email' }, { label: '공개여부', key: 'publicStatus' },
              ].map(({ label, key }) => (
                <div key={key} className={key === 'address' || key === 'orgSlogan' ? 'sm:col-span-2' : ''}>
                  <label className="text-[10px] font-bold text-sky-600 mb-1 block">{label}</label>
                  <input type="text" value={String(editingTmpl[key as keyof DocTemplate] ?? '')}
                    onChange={e => setEditingTmpl(p => p ? { ...p, [key]: e.target.value } : p)}
                    className="w-full border border-sky-200 rounded-xl px-3 py-2 text-sm font-medium outline-none bg-sky-50/50 focus:border-sky-400 transition-colors" />
                </div>
              ))}
              <div>
                <label className="text-[10px] font-bold text-sky-600 mb-1 block">테마 색상</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={editingTmpl.themeColor}
                    onChange={e => setEditingTmpl(p => p ? { ...p, themeColor: e.target.value } : p)}
                    className="h-9 w-14 rounded-xl border border-sky-200 cursor-pointer p-0.5 bg-sky-50" />
                  <span className="text-xs font-mono text-sky-600">{editingTmpl.themeColor}</span>
                </div>
              </div>
            </div>

            {/* Header extra lines */}
            <div className="bg-sky-50/70 rounded-xl p-3 border border-sky-100 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-sky-700">머리말 추가 문구 (계속 추가 가능)</label>
                <button onClick={() => setEditingTmpl(p => p ? { ...p, headerExtraLines: [...(p.headerExtraLines || []), ''] } : p)}
                  className="flex items-center gap-1 text-sky-600 hover:text-sky-800 text-xs font-bold px-2 py-1 border border-sky-200 rounded-lg hover:bg-sky-100 transition-colors">
                  <Plus size={11} /> 추가
                </button>
              </div>
              {(editingTmpl.headerExtraLines || []).map((line, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input type="text" value={line}
                    onChange={e => setEditingTmpl(p => p ? { ...p, headerExtraLines: (p.headerExtraLines || []).map((l, j) => j === i ? e.target.value : l) } : p)}
                    placeholder={`머리말 문구 ${i + 1}`}
                    className="flex-1 border border-sky-200 rounded-lg px-2 py-1.5 text-xs font-medium outline-none bg-white focus:border-sky-400 transition-colors" />
                  <button onClick={() => setEditingTmpl(p => p ? { ...p, headerExtraLines: (p.headerExtraLines || []).filter((_, j) => j !== i) } : p)}
                    className="text-sky-500 hover:text-red-600 transition-colors p-1"><Minus size={13} /></button>
                </div>
              ))}
              {!(editingTmpl.headerExtraLines?.length) && <p className="text-[10px] text-sky-400">머리말 하단에 표시할 추가 문구를 입력하세요.</p>}
            </div>

            {/* Footer extra lines */}
            <div className="bg-sky-50/70 rounded-xl p-3 border border-sky-100 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-sky-700">꼬리말 추가 문구 (계속 추가 가능)</label>
                <button onClick={() => setEditingTmpl(p => p ? { ...p, footerExtraLines: [...(p.footerExtraLines || []), ''] } : p)}
                  className="flex items-center gap-1 text-sky-600 hover:text-sky-800 text-xs font-bold px-2 py-1 border border-sky-200 rounded-lg hover:bg-sky-100 transition-colors">
                  <Plus size={11} /> 추가
                </button>
              </div>
              {(editingTmpl.footerExtraLines || []).map((line, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input type="text" value={line}
                    onChange={e => setEditingTmpl(p => p ? { ...p, footerExtraLines: (p.footerExtraLines || []).map((l, j) => j === i ? e.target.value : l) } : p)}
                    placeholder={`꼬리말 문구 ${i + 1}`}
                    className="flex-1 border border-sky-200 rounded-lg px-2 py-1.5 text-xs font-medium outline-none bg-white focus:border-sky-400 transition-colors" />
                  <button onClick={() => setEditingTmpl(p => p ? { ...p, footerExtraLines: (p.footerExtraLines || []).filter((_, j) => j !== i) } : p)}
                    className="text-sky-500 hover:text-red-600 transition-colors p-1"><Minus size={13} /></button>
                </div>
              ))}
              {!(editingTmpl.footerExtraLines?.length) && <p className="text-[10px] text-sky-400">꼬리말 하단에 표시할 추가 문구를 입력하세요.</p>}
            </div>
          </div>
          <div className="px-5 pb-5 flex gap-3">
            <button onClick={() => setShowTemplateEditor(false)} className="flex-1 py-2.5 rounded-xl font-bold text-sm bg-sky-50 text-sky-700 hover:bg-sky-100 transition-colors border border-sky-200">취소</button>
            <button onClick={saveTemplateInfo} disabled={isSaving}
              className="flex-1 py-2.5 rounded-xl font-bold text-sm bg-orange-500 hover:bg-orange-600 text-white transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-2">
              <Save size={14} /> 저장하기
            </button>
          </div>
        </div>
      )}

      {/* ── History panel ── */}
      {showHistory && (
        <div className="glass rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-sky-100 flex items-center justify-between gap-3"
            style={{ background: 'linear-gradient(135deg,rgba(232,163,23,.08),rgba(212,122,26,.04))' }}>
            <h4 className="font-black text-sky-700 text-sm">공문 발송 이력</h4>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex gap-1 text-xs font-bold flex-wrap">
                <button onClick={() => setHistoryTypeFilter('ALL')}
                  className={`px-3 py-1 rounded-full transition-all ${historyTypeFilter === 'ALL' ? 'bg-sky-600 text-white shadow-sm' : 'bg-sky-50 text-sky-500 hover:bg-sky-100 border border-sky-200'}`}>
                  전체
                </button>
                {templates.map(t => (
                  <button key={t.id} onClick={() => setHistoryTypeFilter(t.id)}
                    className={`px-3 py-1 rounded-full transition-all ${historyTypeFilter === t.id ? 'text-white shadow-sm' : 'bg-sky-50 text-sky-500 hover:bg-sky-100 border border-sky-200'}`}
                    style={historyTypeFilter === t.id ? { background: t.themeColor } : {}}>
                    {t.name.slice(0, 6)}
                  </button>
                ))}
              </div>
              <button onClick={() => setShowHistory(false)} className="text-sky-400 hover:text-sky-600"><X size={16} /></button>
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-sky-50">
            {filteredHistory.length === 0 && (
              <p className="text-center py-8 text-sky-300 text-sm font-bold">발송 이력이 없습니다.</p>
            )}
            {filteredHistory.map(h => {
              const tmpl = templates.find(t => t.id === h.type) || { name: h.type, themeColor: '#8A3D0A' };
              return (
                <div key={h.id} className="px-5 py-3 hover:bg-sky-50/60 transition-colors flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg"
                        style={{ color: tmpl.themeColor, background: tmpl.themeColor + '18' }}>
                        {tmpl.name.slice(0, 8)}
                      </span>
                      <span className="text-xs font-bold text-sky-500">{h.data.docNumber}</span>
                      <span className="text-[10px] text-sky-300">{new Date(h.timestamp).toLocaleDateString('ko-KR')}</span>
                    </div>
                    <p className="text-sm font-bold text-slate-700 mt-0.5 truncate">{safeRender(h.subject)}</p>
                    <p className="text-xs text-sky-400">수신: {safeRender(h.receiver)}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => handleLoadHistory(h)}
                      className="bg-sky-50 hover:bg-sky-100 text-sky-600 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors border border-sky-200">
                      불러오기
                    </button>
                    <button onClick={() => handleDeleteHistory(h.id)} className="text-sky-500 hover:text-red-600 p-1.5 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Form + Preview ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">

        {/* Form */}
        <div className="space-y-4">

          {/* Metadata */}
          <div className="glass rounded-2xl p-5 space-y-3">
            <label className="block text-xs font-black text-sky-600 uppercase tracking-widest">공문 기본 정보</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-sky-500 mb-1 block">발신일</label>
                <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full border border-sky-200 rounded-xl px-3 py-2 text-sm font-medium outline-none bg-sky-50/50 focus:border-sky-400 transition-colors" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-sky-500 mb-1 block">문서번호 (자동)</label>
                <input type="text" value={docNumber} readOnly
                  className="w-full border border-sky-100 rounded-xl px-3 py-2 text-sm font-black bg-sky-50/50 text-sky-700 outline-none" />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-sky-500 mb-1 block">수신 *</label>
              <input type="text" value={form.receiver} onChange={e => setForm(f => ({ ...f, receiver: e.target.value }))}
                placeholder="예: 부천시 소사구청 사회복지과장"
                className="w-full border border-sky-200 rounded-xl px-3 py-2 text-sm font-medium outline-none bg-sky-50/50 focus:border-sky-400 transition-colors" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-sky-500 mb-1 block">경유</label>
              <input type="text" value={form.via} onChange={e => setForm(f => ({ ...f, via: e.target.value }))}
                placeholder="경유 기관 (없으면 비워두세요)"
                className="w-full border border-sky-200 rounded-xl px-3 py-2 text-sm font-medium outline-none bg-sky-50/50 focus:border-sky-400 transition-colors" />
            </div>
          </div>

          {/* Subject & Body */}
          <div className="glass rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-sky-600 uppercase tracking-widest">제목 및 본문</label>
              {/* Mode toggle */}
              <div className="flex items-center gap-1 bg-sky-50 border border-sky-200 rounded-xl p-0.5">
                <button onClick={() => setForm(f => ({ ...f, htmlMode: false, pasteMode: false }))}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${!form.htmlMode && !form.pasteMode ? 'bg-white text-sky-700 shadow-sm border border-sky-100' : 'text-sky-400 hover:text-sky-600'}`}>
                  <Eye size={12} /> 일반
                </button>
                <button onClick={() => {
                  if (!form.htmlMode && !form.htmlContent) setForm(f => ({ ...f, htmlMode: true, pasteMode: false, htmlContent: buildDefaultHtml(f) }));
                  else setForm(f => ({ ...f, htmlMode: true, pasteMode: false }));
                }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${form.htmlMode ? 'bg-white text-sky-700 shadow-sm border border-sky-100' : 'text-sky-400 hover:text-sky-600'}`}>
                  <Code size={12} /> HTML
                </button>
                <button onClick={() => setForm(f => ({ ...f, pasteMode: true, htmlMode: false }))}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${form.pasteMode ? 'bg-white text-sky-700 shadow-sm border border-sky-100' : 'text-sky-400 hover:text-sky-600'}`}>
                  <ClipboardPaste size={12} /> 붙여넣기
                </button>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-sky-500 mb-1 block">제목 *</label>
              <input type="text" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                placeholder="예: 2025년 5월 양곡 배송 완료 보고"
                className="w-full border border-sky-200 rounded-xl px-3 py-2 text-sm font-medium outline-none bg-sky-50/50 focus:border-sky-400 transition-colors" />
            </div>

            {form.pasteMode ? (
              <div className="space-y-3">
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700 font-medium">
                  <b>사용법:</b> 한글·워드·PPT에서 복사(Ctrl+C) 후 각 영역을 클릭하고 Ctrl+V — 머리말/본문/꼬리말을 구분해서 붙여넣기 하세요.
                </div>

                {/* 머리말 영역 */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-sky-600">머리말 영역</label>
                    {form.pastedHeaderHtml && (
                      <button onClick={() => setForm(f => ({ ...f, pastedHeaderHtml: '' }))}
                        className="text-[10px] text-red-400 hover:text-red-600 font-bold transition-colors">지우기</button>
                    )}
                  </div>
                  <div ref={pasteHeaderRef} contentEditable suppressContentEditableWarning
                    onPaste={makePasteHandler('header', pasteHeaderRef)}
                    className="w-full border-2 border-dashed border-sky-200 rounded-xl p-3 outline-none focus:border-sky-400 focus:bg-sky-50/20 bg-sky-50/10 cursor-text transition-all text-sky-300 text-xs font-medium"
                    style={{ minHeight: '55px' }}>
                    {!form.pastedHeaderHtml && '여기 클릭 후 Ctrl+V (머리말 영역)'}
                  </div>
                  {form.pastedHeaderHtml && (
                    <div className="rounded-lg overflow-hidden border border-sky-100">
                      <div className="p-3 bg-white text-xs overflow-auto max-h-28" style={{ fontFamily: "'Malgun Gothic', sans-serif" }}
                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(form.pastedHeaderHtml)}} />
                    </div>
                  )}
                </div>

                {/* 본문 영역 */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-sky-600">본문 영역</label>
                    {form.pastedBodyHtml && (
                      <button onClick={() => setForm(f => ({ ...f, pastedBodyHtml: '' }))}
                        className="text-[10px] text-red-400 hover:text-red-600 font-bold transition-colors">지우기</button>
                    )}
                  </div>
                  <div ref={pasteBodyRef} contentEditable suppressContentEditableWarning
                    onPaste={makePasteHandler('body', pasteBodyRef)}
                    className="w-full border-2 border-dashed border-sky-200 rounded-xl p-3 outline-none focus:border-sky-400 focus:bg-sky-50/20 bg-sky-50/10 cursor-text transition-all text-sky-300 text-xs font-medium"
                    style={{ minHeight: '80px' }}>
                    {!form.pastedBodyHtml && '여기 클릭 후 Ctrl+V (본문 영역)'}
                  </div>
                  {form.pastedBodyHtml && (
                    <div className="rounded-lg overflow-hidden border border-sky-100">
                      <div className="p-3 bg-white text-xs overflow-auto max-h-32" style={{ fontFamily: "'Malgun Gothic', sans-serif" }}
                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(form.pastedBodyHtml) }} />
                    </div>
                  )}
                </div>

                {/* 꼬리말 영역 */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-sky-600">꼬리말 영역</label>
                    {form.pastedFooterHtml && (
                      <button onClick={() => setForm(f => ({ ...f, pastedFooterHtml: '' }))}
                        className="text-[10px] text-red-400 hover:text-red-600 font-bold transition-colors">지우기</button>
                    )}
                  </div>
                  <div ref={pasteFooterRef} contentEditable suppressContentEditableWarning
                    onPaste={makePasteHandler('footer', pasteFooterRef)}
                    className="w-full border-2 border-dashed border-sky-200 rounded-xl p-3 outline-none focus:border-sky-400 focus:bg-sky-50/20 bg-sky-50/10 cursor-text transition-all text-sky-300 text-xs font-medium"
                    style={{ minHeight: '55px' }}>
                    {!form.pastedFooterHtml && '여기 클릭 후 Ctrl+V (꼬리말 영역)'}
                  </div>
                  {form.pastedFooterHtml && (
                    <div className="rounded-lg overflow-hidden border border-sky-100">
                      <div className="p-3 bg-white text-xs overflow-auto max-h-28" style={{ fontFamily: "'Malgun Gothic', sans-serif" }}
                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(form.pastedFooterHtml) }} />
                    </div>
                  )}
                </div>
              </div>
            ) : form.htmlMode ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-sky-500">HTML 직접 편집 (본문 영역)</label>
                  <button onClick={() => setForm(f => ({ ...f, htmlContent: buildDefaultHtml(f) }))}
                    className="text-[10px] font-bold text-sky-500 hover:text-sky-700 flex items-center gap-1 px-2 py-1 rounded-lg border border-sky-200 hover:bg-sky-50 transition-colors">
                    <RotateCcw size={10} /> 기본 HTML로
                  </button>
                </div>
                <textarea value={form.htmlContent} onChange={e => setForm(f => ({ ...f, htmlContent: e.target.value }))}
                  rows={16} placeholder="<div style='font-size:10pt; line-height:2;'>&#10;  <p style='text-indent:1em;'>귀 기관의 무궁한 발전을 기원합니다.</p>&#10;  <p>본문 내용...</p>&#10;</div>"
                  className="code-editor w-full" />
                <p className="text-[10px] text-sky-400 font-medium">HTML 태그와 인라인 스타일을 사용해 자유롭게 꾸밀 수 있습니다. 표, 이미지, 색상 등을 직접 지정하세요.</p>
              </div>
            ) : (
              <>
                {(['body1', 'body2', 'body3', 'body4'] as const).map((field, idx) => (
                  <div key={field}>
                    <label className="text-[10px] font-bold text-sky-500 mb-1 block">
                      본문 {idx + 1}{idx === 0 ? ' *' : ' (선택)'}
                    </label>
                    <textarea value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                      placeholder={idx === 0 ? '귀 기관의 무궁한 발전을 기원합니다.' : `추가 본문 ${idx + 1}`}
                      rows={idx === 0 ? 3 : 2}
                      className="w-full border border-sky-200 rounded-xl px-3 py-2 text-sm font-medium outline-none bg-sky-50/50 focus:border-sky-400 transition-colors resize-none" />
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Items */}
          {!form.htmlMode && !form.pasteMode && (
            <div className="glass rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black text-sky-600 uppercase tracking-widest">첨부 항목 (다음 목록)</label>
                <button onClick={() => setForm(f => ({ ...f, items: [...f.items, ''] }))}
                  className="flex items-center gap-1 text-sky-600 hover:text-sky-800 text-xs font-bold">
                  <Plus size={13} /> 항목추가
                </button>
              </div>
              {form.items.map((item, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <span className="shrink-0 text-xs font-bold text-sky-400 w-5">{idx + 1}.</span>
                  <input type="text" value={item}
                    onChange={e => setForm(f => ({ ...f, items: f.items.map((v, i) => i === idx ? e.target.value : v) }))}
                    placeholder={`항목 ${idx + 1}`}
                    className="flex-1 border border-sky-200 rounded-xl px-3 py-2 text-sm font-medium outline-none bg-sky-50/50 focus:border-sky-400 transition-colors" />
                  {form.items.length > 1 && (
                    <button onClick={() => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))}
                      className="shrink-0 text-sky-500 hover:text-red-600 transition-colors p-1">
                      <Minus size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button onClick={() => setShowPreview(p => !p)}
              className="flex-1 flex items-center justify-center gap-2 glass text-sky-700 py-3 rounded-2xl font-bold text-sm transition-colors border border-sky-100 hover:bg-sky-50">
              {showPreview ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              {showPreview ? '미리보기 닫기' : '미리보기'}
            </button>
            <button onClick={handleSend} disabled={isSaving}
              className="flex-1 btn-sky py-3 rounded-2xl font-bold text-sm disabled:opacity-50">
              저장 및 기록
            </button>
            <button onClick={handlePrint}
              className="flex items-center justify-center gap-2 btn-sky px-5 py-3 rounded-2xl font-bold text-sm">
              <Printer size={16} /> 인쇄
            </button>
          </div>
        </div>

        {/* Preview */}
        <div className={showPreview ? 'block' : 'hidden xl:block'}>
          <div className="glass rounded-2xl p-4 sticky top-4" style={{ boxShadow: '0 8px 32px rgba(168,82,16,.15)' }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Eye size={15} className="text-sky-500" />
                <h4 className="font-black text-sky-700 text-sm">공문 미리보기</h4>
              </div>
              <button onClick={handlePrint}
                className="btn-sky flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold">
                <Printer size={12} /> 인쇄
              </button>
            </div>
            <div className="overflow-auto bg-white rounded-xl shadow-inner border border-sky-100" style={{ maxHeight: '72vh' }}>
              {/* ⚠️ <PreviewDocument />로 쓰면 안 된다. PreviewDocument는 DocsTab 안에서
                  매 렌더 새로 만들어지는 함수라, JSX 요소로 쓰면 React가 매번 "다른 컴포넌트"로
                  보고 미리보기 전체를 언마운트→재마운트한다(스크롤 위치가 튄다).
                  함수 호출로 결과만 끼워 넣으면 같은 화면을 그대로 그리면서 재마운트가 없다. */}
              <div style={{ transform: 'scale(0.62)', transformOrigin: 'top left', width: '162%' }}>
                {PreviewDocument()}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
