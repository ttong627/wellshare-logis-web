/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Trash2, Printer, Download, RefreshCcw, Settings as SettingsIcon, FileText, FileDown, Loader2, RefreshCw } from 'lucide-react';
import { DocType, OfficialDoc, DocFormatSettings, DocHistoryItem } from '../types';
import { storage } from '../lib/storage';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { firebaseService } from '../lib/firebaseService';
import { useFirebase } from '../hooks/useFirebase';
import { useRole } from '../hooks/useRole';
import debounce from 'lodash.debounce';

const DEFAULT_SETTINGS: Record<DocType, DocFormatSettings> = {
  [DocType.A]: {
    orgName: '웰 쉐 어 사 회 적 협 동 조 합',
    slogan: '"가치를 살리는 힘동, 행복을 키우는 나눔"',
    representative: '김기홍',
    representativeTitle: '이사장',
    address: '우)16591 경기도 수원시 권선구 권선로 472, 6층 (세류동, 세지빌딩)',
    phone: '070-7760-1077',
    fax: '031-225-1077',
    email: 'wssc@wssc.kr',
    publicStatus: '공개',
    sealText: '직인',
    sealUrl: '',
    themeColor: '#1a6bb5',
    logoUrl: '',
    fontFamily: '"Noto Sans KR", sans-serif',
    orgNameSize: 22,
    orgNameLetterSpacing: 8,
    contentSize: 15,
    contentColor: '#1a6bb5',
    headerMarginTop: 0,
    headerLogoHeight: 16,
    showCenterLogo: true,
    footerMarginTop: 24,
    footerLineColor: '#1a6bb5',
    footerLineThickness: 1.5,
    footerFontSize: 11,
    sealShape: 'circle',
    sealSize: 16,
    sealRightOffset: 30,
    sealTopOffset: -3,
    orgNameColor: '#1e293b',
    orgNameFontFamily: '"Noto Sans KR", sans-serif',
    orgNameXOffset: 0,
    orgNameYOffset: 0,
    sloganColor: '#64748b',
    sloganSize: 10,
    sloganXOffset: 0,
    sloganYOffset: 0,
    sloganFontFamily: '"Noto Sans KR", sans-serif',
    metadataSize: 15,
    metadataXOffset: 0,
    metadataYOffset: 0,
    metadataPaddingX: 0,
    metadataLabelWidth: 80,
    signatureXOffset: 0,
    signatureYOffset: 0,
    lineThickness: 1.5,
    lineWidth: 100,
    lineYOffset: 0,
    lineColor: '#1a6bb5',
    bodyMarginTop: 0,
    bodySpacing: 1.5,
    contentXOffset: 0,
    contentYOffset: 0,
    body1Align: 'left',
    body2Align: 'left',
    body3Align: 'left',
    body4Align: 'left',
    itemsHeader: '- 다  음 -',
    itemsHeaderYOffset: 0,
    itemsAlign: 'left',
    itemsSize: 15,
    itemsLineHeight: 1.6,
    manager: '김기홍 상무',
    associate: ''
  },
  [DocType.B]: {
    orgName: '㈜ 웰 쉐 어 로 지 스',
    slogan: '행복을 키우는 물류네트워크',
    representative: '손한국',
    representativeTitle: '대표이사',
    address: '우)18293 경기도 화성시 비봉면 주석로 457-15',
    phone: '031-8043-5906',
    fax: '031-8043-5907',
    email: 'wsl@wssc.kr',
    publicStatus: '공개',
    sealText: '직인',
    sealUrl: '',
    themeColor: '#1e293b',
    logoUrl: '',
    fontFamily: '"Noto Sans KR", sans-serif',
    orgNameSize: 22,
    orgNameLetterSpacing: 8,
    contentSize: 15,
    contentColor: '#1e293b',
    headerMarginTop: 10,
    headerLogoHeight: 64,
    showCenterLogo: true,
    footerMarginTop: 24,
    footerLineColor: '#1e293b',
    footerLineThickness: 3,
    footerFontSize: 11,
    sealShape: 'square',
    sealSize: 14,
    sealRightOffset: 22,
    sealTopOffset: -4,
    orgNameColor: '#0f172a',
    orgNameFontFamily: '"Noto Sans KR", sans-serif',
    orgNameXOffset: 0,
    orgNameYOffset: 0,
    sloganColor: '#475569',
    sloganSize: 12,
    sloganXOffset: 0,
    sloganYOffset: 0,
    sloganFontFamily: '"Noto Sans KR", sans-serif',
    metadataSize: 15,
    metadataXOffset: 0,
    metadataYOffset: 0,
    metadataPaddingX: 0,
    metadataLabelWidth: 80,
    signatureXOffset: 0,
    signatureYOffset: 0,
    lineThickness: 1,
    lineWidth: 100,
    lineYOffset: 0,
    lineColor: '#94a3b8',
    bodyMarginTop: 0,
    bodySpacing: 2,
    contentXOffset: 0,
    contentYOffset: 0,
    body1Align: 'left',
    body2Align: 'left',
    body3Align: 'left',
    body4Align: 'left',
    itemsHeader: '- 다  음 -',
    itemsHeaderYOffset: 0,
    itemsAlign: 'left',
    itemsSize: 15,
    itemsLineHeight: 1.8,
    manager: '',
    associate: ''
  }
};

export default function OfficialDocTab() {
  const { user } = useFirebase();
  const { canEdit } = useRole();
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [saveProgress, setSaveProgress] = useState('');
  const [isMultiPage, setIsMultiPage] = useState(false);

  // 페이지 수 계산 함수
  const calcPageCount = () => {
    const paper = document.getElementById('a4-preview');
    if (!paper) return 1;

    // A4 한 페이지 높이 (픽셀 기준, 96dpi)
    // A4 = 297mm, 1mm = 3.7795px
    // 여백 20mm(상하 각 10mm) 제외 → 277mm
    const A4_HEIGHT_PX = 277 * 3.7795; // ≈ 1047px

    const contentHeight = paper.scrollHeight;
    const pageCount = Math.ceil(contentHeight / A4_HEIGHT_PX);
    return pageCount;
  };

  useEffect(() => {
    const handleBeforePrint = () => {
      // 공문 높이 최적화
      const targets = ['doc-paper', 'doc-paper-wrapper', 'a4-preview'];
      targets.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          el.style.minHeight = 'unset';
          el.style.height = 'fit-content';
        }
      });

      // 페이지 수 계산 및 번호 표시 여부 결정
      const pageCount = calcPageCount();
      setIsMultiPage(pageCount >= 2);
    };

    const handleAfterPrint = () => {
      // 인쇄 후 원복
      const targets = ['doc-paper', 'doc-paper-wrapper', 'a4-preview'];
      targets.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          el.style.minHeight = '296mm';
          el.style.height = '';
        }
      });
    };

    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);

    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, []);
  const [activeSubTab, setActiveSubTab] = useState<'INPUT' | 'HISTORY' | 'SETTINGS'>('INPUT');
  const [historyFilter, setHistoryFilter] = useState({
    text: '',
    type: 'ALL' as 'ALL' | 'A' | 'B',
    startDate: '',
    endDate: ''
  });
  const [cachedImages, setCachedImages] = useState<Record<string, string>>({});
  const cachedImagesRef = useRef<Record<string, string>>({});

  useEffect(() => {
    cachedImagesRef.current = cachedImages;
  }, [cachedImages]);

  const urlToBase64 = useCallback(async (url: string): Promise<string> => {
    if (!url || url.startsWith('data:')) return url;
    try {
      // Try fetch with CORS first
      const response = await fetch(url, { mode: 'cors' });
      if (!response.ok) throw new Error('Fetch failed');
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.warn('Fetch base64 failed, trying canvas fallback:', url, e);
      // Fallback to canvas method
      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0);
              resolve(canvas.toDataURL('image/png'));
              return;
            }
          } catch (err) {
            console.warn('Canvas conversion fallback failed:', err);
          }
          resolve(url);
        };
        img.onerror = () => resolve(url);
        // Add cache buster for fallback
        const separator = url.includes('?') ? '&' : '?';
        img.src = `${url}${separator}cb=${Date.now()}`;
      });
    }
  }, []);

  const preloadImages = useCallback(async (images: Record<string, string | null>) => {
    const entries = Object.entries(images);
    const results: Record<string, string> = {};
    
    await Promise.all(
      entries.map(async ([key, url]) => {
        // 이미 캐시되어 있거나, 데이터 URL이거나, URL이 없으면 스킵
        if (!url || url.startsWith('data:') || cachedImagesRef.current[key]) return;
        try {
          const base64 = await urlToBase64(url);
          if (base64) results[key] = base64;
        } catch (e) {
          console.warn(`이미지 프리로드 실패: ${key}`, e);
        }
      })
    );
    
    if (Object.keys(results).length > 0) {
      setCachedImages(prev => ({ ...prev, ...results }));
    }
  }, [urlToBase64]);
  const [doc, setDoc] = useState<OfficialDoc>(() => {
    const savedDoc = (storage.get('current_doc') || {}) as Partial<OfficialDoc>;
    return {
      type: DocType.A,
      receiver: '',
      via: '',
      subject: '',
      body1: '귀 기관의 무궁한 발전을 기원합니다.',
      body2: '',
      body3: '',
      body4: '',
      items: [''],
      date: new Date().toISOString().split('T')[0],
      docNo: {
        year: new Date().getFullYear(),
        num: 1
      },
      settings: DEFAULT_SETTINGS,
      history: [],
      ...savedDoc
    };
  });

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error' | 'pending'>('idle');
  const [globalImages, setGlobalImages] = useState<Record<string, string | null>>({});

  useEffect(() => {
    const fetchGlobal = async () => {
      const unsubscribe = firebaseService.subscribeToGlobalSettings((data) => {
        const images = {
          formA_logoUrl: (data.formA_logoUrl as string) || null,
          formA_stampUrl: (data.formA_stampUrl as string) || null,
          formB_logoUrl: (data.formB_logoUrl as string) || null,
          formB_stampUrl: (data.formB_stampUrl as string) || null
        };
        setGlobalImages(images);
      });
      return unsubscribe;
    };
    const unsubPromise = fetchGlobal();
    return () => { unsubPromise.then(unsub => unsub()); };
  }, [preloadImages]);

  const docTypeA = DocType.A;
  const docTypeB = DocType.B;
  const logoUrlA = doc.settings?.[docTypeA]?.logoUrl;
  const sealUrlA = doc.settings?.[docTypeA]?.sealUrl;
  const logoUrlB = doc.settings?.[docTypeB]?.logoUrl;
  const sealUrlB = doc.settings?.[docTypeB]?.sealUrl;

  useEffect(() => {
    // 설정에서 개별 URL들을 추출하여 사용
    const logoA = logoUrlA || globalImages.formA_logoUrl;
    const stampA = sealUrlA || globalImages.formA_stampUrl;
    const logoB = logoUrlB || globalImages.formB_logoUrl;
    const stampB = sealUrlB || globalImages.formB_stampUrl;

    const imagesToLoad: Record<string, string | null> = {
      formA_logoUrl: logoA || null,
      formA_stampUrl: stampA || null,
      formB_logoUrl: logoB || null,
      formB_stampUrl: stampB || null,
    };
    
    const triggerPreload = async () => {
      await preloadImages(imagesToLoad);
    };
    triggerPreload();
  }, [
    logoUrlA,
    sealUrlA,
    logoUrlB,
    sealUrlB,
    globalImages.formA_logoUrl,
    globalImages.formA_stampUrl,
    globalImages.formB_logoUrl,
    globalImages.formB_stampUrl,
    preloadImages
  ]);

  const lastLocalEditTime = useRef<number>(0);
  const lastSavedDraftRef = useRef<string>('');
  const hasCloudSyncedRef = useRef<boolean>(false);

  // Helper to compress image
  const compressImage = async (dataUrl: string, maxWidth = 800, maxHeight = 800, quality = 0.7): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(dataUrl); // Fallback to original
      img.src = dataUrl;
    });
  };

  // 1. Initial Data Sync & Real-time Subscription from Firebase
  useEffect(() => {
    if (!user) return;

    // Set status asynchronously to avoid cascading renders in effect
    setTimeout(() => {
      setSaveStatus('pending');
    }, 0);
    hasCloudSyncedRef.current = false;

    // Safety timeout for initial sync
    const syncTimeout = setTimeout(() => {
      if (hasCloudSyncedRef.current === false) {
        console.warn('Doc sync timed out, enabling save anyway');
        hasCloudSyncedRef.current = true;
        setSaveStatus('idle');
      }
    }, 10000);

    // Subscribe to real-time changes
    const unsubscribeDoc = firebaseService.subscribeToDocSettings<Partial<OfficialDoc>>('current_doc', (cloudDraft) => {
      clearTimeout(syncTimeout);
      
      // We got a response from cloud (even if null), so we are synchronized
      hasCloudSyncedRef.current = true;

      if (!cloudDraft) {
        setSaveStatus('idle');
        return;
      }

      // If we edited locally in the last 10 seconds, ignore cloud updates to prevent overwriting active local work
      if (Date.now() - lastLocalEditTime.current < 10000) {
        return;
      }

      setDoc(prev => {
        const cloudTime = cloudDraft.updatedAt || 0;
        const localTime = prev.updatedAt || 0;

        // If Cloud is definitively newer, OR if this is the first time we are syncing (localTime is 0), take cloud.
        if (cloudTime > localTime || (localTime === 0 && cloudTime > 0)) {
          const mergedDoc = {
            ...prev,
            ...cloudDraft,
            updatedAt: cloudTime
          };
          
          const draftToRef = { ...mergedDoc } as Partial<OfficialDoc>;
          delete draftToRef.history;
          lastSavedDraftRef.current = JSON.stringify(draftToRef);
          
          return mergedDoc;
        }
        return prev;
      });
      setSaveStatus('saved');
    });

    const unsubscribeSettings = firebaseService.subscribeToDocSettings<Record<DocType, DocFormatSettings>>('docFormatSettings', (cloudSettings) => {
      if (!cloudSettings) return;
      setDoc(prev => ({
        ...prev,
        settings: { ...prev.settings, ...cloudSettings }
      }));
    });

    return () => {
      unsubscribeDoc();
      unsubscribeSettings();
      clearTimeout(syncTimeout);
    };
  }, [user]);

  // 2. Real-time History Subscription
  useEffect(() => {
    const unsubscribeHistory = firebaseService.subscribeToDocHistory((cloudHistory) => {
      if (!cloudHistory || cloudHistory.length === 0) {
        setSaveStatus('saved');
        return;
      }

      setDoc(prev => {
        // MERGE: Keep unique IDs, prioritize Cloud for same IDs but UNION the lists
        // Since history is immutable (only delete/add), a simple merge works
        const localHistory = prev.history || [];
        const merged = [...cloudHistory];
        
        // Add local items that aren't in cloud yet (pending writes)
        const cloudIds = new Set(cloudHistory.map(h => h.id));
        localHistory.forEach(lh => {
          if (!cloudIds.has(lh.id)) {
            merged.push(lh);
          }
        });

        // Sort by timestamp desc
        merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        
        return {
          ...prev,
          history: merged.slice(0, 100)
        };
      });
      setSaveStatus('saved');
    });

    return () => unsubscribeHistory();
  }, [user]);

  const saveDebouncedRef = useRef<ReturnType<typeof debounce> | null>(null);

  useEffect(() => {
    if (!user) return;
    saveDebouncedRef.current = debounce(async (draft: Partial<OfficialDoc>, draftStr: string) => {
      try {
        setSaveStatus('saving');
        await firebaseService.setDocSetting('current_doc', draft);
        lastSavedDraftRef.current = draftStr;
        setSaveStatus('saved');
      } catch (err: unknown) {
        console.error('Auto-save failed:', err);
        setSaveStatus('error');
        // Reset ref to allow retry on next check
        lastSavedDraftRef.current = '';
      }
    }, 1500); // 1.5s delay
    
    return () => {
      saveDebouncedRef.current?.cancel();
    };
  }, [user]);

  const forceSyncFromCloud = async () => {
    if (!user) {
      alert('로그인이 필요합니다.');
      return;
    }
    try {
      setSaveStatus('pending');
      const [cloudDoc, cloudSettings] = await Promise.all([
        firebaseService.getDocSetting<Partial<OfficialDoc>>('current_doc', null),
        firebaseService.getDocSetting<Record<DocType, DocFormatSettings>>('docFormatSettings', null)
      ]);

      if (cloudDoc || cloudSettings) {
        setDoc(prev => {
          let merged = { ...prev };
          if (cloudDoc) {
             merged = { ...merged, ...cloudDoc };
          }
          if (cloudSettings) {
             merged = { ...merged, settings: { ...prev.settings, ...cloudSettings } };
          }
          
          const draftToRef = { ...merged } as Partial<OfficialDoc>;
          delete draftToRef.history;
          lastSavedDraftRef.current = JSON.stringify(draftToRef);
          storage.set('current_doc', merged);
          return merged;
        });
        setSaveStatus('saved');
        alert('서버 데이터를 성공적으로 불러왔습니다.');
      } else {
        setSaveStatus('idle');
        alert('서버에 저장된 데이터가 없습니다.');
      }
    } catch (err) {
      console.error('Manual sync failed:', err);
      setSaveStatus('error');
      alert('데이터 불러오기 중 오류가 발생했습니다.');
    }
  };

  useEffect(() => {
    // Sync to local storage for instant persistence
    storage.set('current_doc', doc);
    
    if (user && doc) {
      const comparisonDraft = { ...doc } as Partial<OfficialDoc>;
      delete comparisonDraft.history;
      
      const draftStr = JSON.stringify(comparisonDraft);
      
      // ONLY SAVE IF:
      // 1. Initial cloud sync check has completed
      // 2. Data has actually changed compared to what we last saved
      // 3. This is a legitimate user change (updatedAt > 0)
      if (hasCloudSyncedRef.current && draftStr !== lastSavedDraftRef.current && (doc.updatedAt || 0) > 0) {
        setSaveStatus('pending');
        saveDebouncedRef.current?.(comparisonDraft, draftStr);
      }
    }
  }, [doc, user]);

  const handleChange = (field: keyof OfficialDoc, value: string | number | { year: number; num: number } | Record<DocType, DocFormatSettings> | DocHistoryItem[]) => {
    if (!canEdit) return;
    const now = new Date().getTime();
    lastLocalEditTime.current = now;
    setDoc(prev => ({
      ...prev,
      [field]: value,
      updatedAt: now
    }));
  };

  const saveSettings = (newSettings: Record<DocType, DocFormatSettings>) => {
    if (!canEdit) return;
    lastLocalEditTime.current = Date.now();
    setDoc(prev => ({ ...prev, settings: newSettings, updatedAt: Date.now() }));
    // Limit history size to prevent slow sync
    setDoc(prev => {
      if (prev.history && prev.history.length > 50) {
        return { ...prev, history: prev.history.slice(0, 50) };
      }
      return prev;
    });
    storage.set('docFormatSettings', newSettings);
  };

  const handleSettingChange = async (type: DocType, field: keyof DocFormatSettings, value: string | number | boolean) => {
    if (!canEdit) return;
    let finalValue = value;
    
    // Auto-compress large images
    if (typeof value === 'string' && value.startsWith('data:image/') && value.length > 50000) {
      setSaveStatus('pending');
      finalValue = await compressImage(value);
    }

    const updated = {
      ...doc.settings,
      [type]: { ...doc.settings[type], [field]: finalValue }
    };
    saveSettings(updated);
  };

  const generateNewDocNo = async () => {
    if (!canEdit) return alert('편집 권한이 없습니다.');
    if (!confirm('새 문서번호를 발급할까요?')) return;
    try {
      setSaveStatus('pending');
      const newNo = await firebaseService.getNextDocNumber(doc.type === DocType.A ? 'A' : 'B');
      handleChange('docNumber', newNo);
      setSaveStatus('idle');
    } catch {
      alert('문서번호 발송 중 오류가 발생했습니다.');
      setSaveStatus('error');
    }
  };

  const handleFormatToggle = (type: DocType) => {
    if (!canEdit) return;
    lastLocalEditTime.current = Date.now();
    setDoc(prev => ({ ...prev, type, updatedAt: Date.now() }));
  };

  const handleSaveCloudSettings = async () => {
    if (!canEdit) return;
    try {
      setSaveStatus('saving');
      // Save full settings to both current_doc (via normal flow) AND the dedicated settings document
      await firebaseService.setDocSetting('docFormatSettings', doc.settings);
      setSaveStatus('saved');
      alert('설정이 클라우드에 성공적으로 저장되었습니다.');
    } catch (err) {
      console.error('Failed to save settings to cloud:', err);
      setSaveStatus('error');
      alert('설정 저장 중 오류가 발생했습니다.');
    }
  };

  const handleItemChange = (index: number, value: string) => {
    if (!canEdit) return;
    const now = new Date().getTime();
    lastLocalEditTime.current = now;
    const newItems = [...doc.items];
    newItems[index] = value;
    setDoc(prev => ({ ...prev, items: newItems, updatedAt: now }));
  };

  const addItem = () => {
    if (!canEdit) return;
    lastLocalEditTime.current = Date.now();
    setDoc(prev => ({ ...prev, items: [...prev.items, ''], updatedAt: Date.now() }));
  };

  const removeItem = (index: number) => {
    if (!canEdit) return;
    if (doc.items.length <= 1) return;
    lastLocalEditTime.current = Date.now();
    const newItems = doc.items.filter((_, i) => i !== index);
    setDoc(prev => ({ ...prev, items: newItems, updatedAt: Date.now() }));
  };

  const handlePrint = () => {
    saveToHistory();
    showPrintGuide();

    setTimeout(() => {
      // Optimization before printing
      const elementsToFix = ['doc-paper', 'doc-paper-wrapper', 'a4-preview'];
      const savedStyles: Record<string, { minHeight: string, height: string }> = {};

      elementsToFix.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          savedStyles[id] = {
            minHeight: el.style.minHeight,
            height: el.style.height,
          };
          el.style.minHeight = 'unset';
          el.style.height = 'fit-content';
        }
      });

      window.print();

      // Restore styles after print dialog opens
      setTimeout(() => {
        elementsToFix.forEach(id => {
          const el = document.getElementById(id);
          if (el && savedStyles[id]) {
            el.style.minHeight = savedStyles[id].minHeight || '';
            el.style.height = savedStyles[id].height || '';
          }
        });
      }, 500);
    }, 300);
  };

  const showPrintGuide = () => {
    alert(
      '💡 머리말/꼬리말 제거 안내:\n' +
      '인쇄 설정 창에서 [옵션 더보기] → [머리말과 꼬리말] 체크를 해제하시면 더욱 깔끔하게 출력됩니다.'
    );
  };

  const saveToHistory = async (manual = false) => {
    if (!canEdit) return;
    const settingsSnapshot = { ...doc.settings[doc.type] };
    const now = new Date();

    const historyItem: DocHistoryItem = {
      id: doc.docNumber || `${now.getTime()}`,
      timestamp: now.toISOString(),
      type: doc.type,
      receiver: doc.receiver,
      subject: doc.subject,
      docNo: { ...doc.docNo },
      data: {
        type: doc.type,
        receiver: doc.receiver,
        via: doc.via,
        subject: doc.subject,
        body1: doc.body1,
        body2: doc.body2,
        body3: doc.body3,
        body4: doc.body4,
        items: [...doc.items],
        date: doc.date,
        docNo: { ...doc.docNo },
        settingsSnapshot
      }
    };

    // Add extra fields requested by user to the stored object
    const extendedItem = {
      ...historyItem,
      docType: doc.type === DocType.A ? 'A' : 'B',
      docNumber: doc.docNumber || '(자동 생성 전)',
      recipient: doc.receiver,
      via: doc.via,
      attachments: [...doc.items],
      manager: doc.settings[doc.type].manager,
      assistant: doc.settings[doc.type].associate,
      issueDate: doc.date,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    if (user) {
      try {
        await firebaseService.saveDocHistoryItem(extendedItem as unknown as DocHistoryItem);
        if (manual) alert('공문이 기록에 저장되었습니다.');
      } catch (err) {
        console.error('History cloud save failed:', err);
      }
    }
  };

  const loadFromHistory = (item: DocHistoryItem) => {
    if (!item || !item.data) return;
    if (!window.confirm('현재 작업 중인 내용이 덮어씌워집니다. 계속하시겠습니까?')) return;
    
    const data = item.data;
    setDoc(prev => ({
      ...prev,
      type: data.type,
      receiver: data.receiver,
      via: data.via,
      subject: data.subject,
      body1: data.body1,
      body2: data.body2,
      body3: data.body3,
      body4: data.body4,
      items: Array.isArray(data.items) && data.items.length > 0 ? [...data.items] : [''],
      date: data.date,
      docNo: data.docNo || { year: new Date().getFullYear(), num: 1 },
      docNumber: (item as DocHistoryItem & { docNumber?: string }).docNumber || undefined,
      settings: {
        ...prev.settings,
        [data.type]: {
          ...(prev.settings[data.type as keyof typeof prev.settings]),
          ...Object.fromEntries(
            Object.entries(data.settingsSnapshot || {}).filter(([, v]) => v !== '(saved)') as [string, string | number | boolean][]
          )
        }
      },
      history: prev.history
    }));
    setActiveSubTab('INPUT');
  };

  const deleteHistoryItem = async (id: string, event: React.MouseEvent) => {
    event.stopPropagation();
    if (!canEdit) return alert('삭제 권한이 없습니다.');
    if (!window.confirm('이 기록을 삭제하시겠습니까?')) return;
    
    try {
      if (user) {
        await firebaseService.deleteDocHistoryItem(id);
      }
    } catch (err) {
      console.error('Delete history failed:', err);
      alert('기록 삭제 중 오류가 발생했습니다.');
    }
  };

  const handleDownloadPDF = async () => {
    const element = document.getElementById('a4-preview');
    if (!element) {
      alert('PDF 생성 대상을 찾을 수 없습니다.');
      return;
    }

    const filename = `${doc.type === DocType.A ? '웰쉐어사회적협동조합' : '(주)웰쉐어로지스'}_${doc.subject || '공문'}.pdf`;

    setIsGeneratingPDF(true);
    setSaveStatus('loading');
    
    try {
      setSaveProgress('풀컬러 고화질 렌더링 중...');
      await document.fonts.ready;
      
      const images = Array.from(element.querySelectorAll('img'));
      const originalSrcs = images.map(img => img.src);
      
      // 1. 모든 이미지를 Base64로 미리 변환
      for (const img of images) {
        try {
          const base64 = await urlToBase64(img.src);
          if (base64 && base64.startsWith('data:')) {
            img.src = base64;
            if (!img.complete) {
              await new Promise((resolve) => {
                img.onload = resolve;
                img.onerror = resolve;
              });
            }
          }
        } catch (e) {
          console.warn('Image optimization skipped:', img.src, e);
        }
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      const canvas = await html2canvas(element, {
        scale: 1.5, 
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
        logging: false,
        imageTimeout: 60000,
        onclone: (clonedDoc) => {
          const el = clonedDoc.getElementById('a4-preview');
          if (el) {
            el.style.boxShadow = 'none';
            el.style.transform = 'none';
            el.style.margin = '0';
            el.style.padding = '20mm'; // Restore original padding
            el.style.borderRadius = '0';
            el.style.overflow = 'visible';
            el.style.display = 'block';
            el.style.background = 'white';
            el.style.color = 'black'; 
            el.style.filter = 'none';
            el.style.width = '210mm';
            el.style.height = 'auto';
            el.style.minHeight = '297mm';
            
            const all = el.getElementsByTagName('*');
            for (let i = 0; i < all.length; i++) {
              const node = all[i] as HTMLElement;
              if (node.style) {
                node.style.setProperty('filter', 'none', 'important');
                node.style.setProperty('-webkit-filter', 'none', 'important');
                node.style.setProperty('color-adjust', 'exact', 'important');
                node.style.setProperty('-webkit-print-color-adjust', 'exact', 'important');
                node.style.setProperty('print-color-adjust', 'exact', 'important');
              }
            }
          }
        }
      });

      images.forEach((img, idx) => {
        img.src = originalSrcs[idx];
      });

      setSaveProgress('PDF 파일 구성 중...');
      
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true 
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      
      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;
      const pdfHeight = (canvasHeight * pdfWidth) / canvasWidth;
      
      const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
      
      const OVERFLOW_THRESHOLD = 30; 
      const isMultiPageNeeded = pdfHeight > (pageHeight + OVERFLOW_THRESHOLD);
      const totalPages = isMultiPageNeeded ? Math.ceil(pdfHeight / pageHeight) : 1;

      const imgType = 'JPEG';
      let heightLeft = pdfHeight;
      let position = 0;
      let currentPage = 1;
      
      const addPageNumber = (pageNumber: number, total: number) => {
        if (total < 2) return;
        pdf.setFontSize(9);
        pdf.setTextColor(150);
        pdf.text(`- ${pageNumber} / ${total} -`, pdfWidth / 2, pageHeight - 10, { align: 'center' });
      };

      if (!isMultiPageNeeded) {
        pdf.addImage(dataUrl, imgType, 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
      } else {
        pdf.addImage(dataUrl, imgType, 0, position, pdfWidth, pdfHeight, undefined, 'FAST');
        addPageNumber(currentPage, totalPages);
        heightLeft -= pageHeight;

        while (heightLeft > OVERFLOW_THRESHOLD && currentPage < totalPages) {
          position = heightLeft - pdfHeight;
          pdf.addPage();
          currentPage++;
          pdf.addImage(dataUrl, imgType, 0, position, pdfWidth, pdfHeight, undefined, 'FAST');
          addPageNumber(currentPage, totalPages);
          heightLeft -= pageHeight;
        }
      }
      
      setSaveProgress('파일 저장 중...');
      pdf.save(filename);
      setSaveProgress('완료');
      
      setTimeout(() => {
        setIsGeneratingPDF(false);
        setSaveProgress('');
        setSaveStatus('idle');
      }, 500);
      
    } catch (err) {
      console.error('PDF Generation error details:', {
        error: err,
        docType: doc.type,
        docSubject: doc.subject,
        elementExists: !!document.getElementById('a4-preview')
      });
      alert(`PDF 생성 실패: 브라우저 보안 혹은 메모리 한계\n\n상세원인: ${err instanceof Error ? err.message : String(err)}\n\n해결방법:\n1. 브라우저의 '인쇄(Ctrl+P) -> PDF로 저장'을 이용해 보세요.\n2. 로그인을 다시 하거나 페이지를 새로고침해 주세요.`);
      setIsGeneratingPDF(false);
      setSaveProgress('');
      setSaveStatus('error');
    }
  };

  const currentSettings = doc.settings[doc.type];

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-white font-sans print:h-auto print:bg-white print:overflow-visible relative">
      {/* Loading Overlay */}
      {isGeneratingPDF && (
        <div className="fixed inset-0 bg-black/50 z-[9999] flex flex-col items-center justify-center text-white backdrop-blur-sm no-print">
          <Loader2 size={48} className="animate-spin mb-4 text-blue-400" />
          <h2 className="text-2xl font-bold mb-2">PDF 생성 중...</h2>
          <p className="text-blue-200 animate-pulse">{saveProgress}</p>
        </div>
      )}

      {/* Left Input Panel */}
      <div className="w-[450px] bg-[#1a3a6b] text-white flex flex-col no-print shadow-xl z-20 print:hidden">
        {/* Toggle between Input, History, and Settings */}
        <div className="flex bg-[#0d2142] p-1 gap-1">
          <button
            onClick={() => setActiveSubTab('INPUT')}
            className={`flex-1 py-3 text-[11px] font-bold rounded flex items-center justify-center gap-1 transition-all ${activeSubTab === 'INPUT' ? 'bg-[#1a3a6b] text-white shadow-inner' : 'text-gray-400 hover:text-white'}`}
          >
            <FileText size={14} /> ✏️ 작성
          </button>
          <button
            onClick={() => setActiveSubTab('HISTORY')}
            className={`flex-1 py-3 text-[11px] font-bold rounded flex items-center justify-center gap-1 transition-all ${activeSubTab === 'HISTORY' ? 'bg-[#1a3a6b] text-white shadow-inner' : 'text-gray-400 hover:text-white'}`}
          >
            <RefreshCcw size={14} /> 📂 기록
          </button>
          <button
            onClick={() => setActiveSubTab('SETTINGS')}
            className={`flex-1 py-3 text-[11px] font-bold rounded flex items-center justify-center gap-1 transition-all ${activeSubTab === 'SETTINGS' ? 'bg-[#1a3a6b] text-white shadow-inner' : 'text-gray-400 hover:text-white'}`}
          >
            <SettingsIcon size={14} /> ⚙️ 설정
          </button>
        </div>

        {/* Save Status Indicator */}
        <div className="px-5 py-2 flex items-center justify-between text-[10px] bg-black/20 border-b border-white/5">
          <div className="flex items-center gap-2">
            {!user ? (
              <span className="text-amber-400 font-medium">로그인 필요</span>
            ) : (
              <>
                {saveStatus === 'pending' && (
                  <>
                    <Loader2 size={12} className="animate-spin text-gray-400" />
                    <span className="text-gray-400">변경됨</span>
                  </>
                )}
                {saveStatus === 'saving' && (
                  <>
                    <Loader2 size={12} className="animate-spin text-blue-400" />
                    <span className="text-blue-300">저장 중...</span>
                  </>
                )}
                {saveStatus === 'saved' && (
                  <>
                    <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]" />
                    <span className="text-green-400 opacity-70 font-medium">저장 완료</span>
                  </>
                )}
                {saveStatus === 'error' && (
                  <>
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    <span className="text-red-400 font-bold">에러</span>
                  </>
                )}
                {saveStatus === 'idle' && (
                  <span className="text-gray-500">대기</span>
                )}
              </>
            )}
          </div>
          
          <div className="flex gap-2">
            <button 
              onClick={forceSyncFromCloud}
              className="p-1 hover:bg-blue-500/20 rounded flex items-center gap-1 text-blue-400 transition-colors"
              title="서버에서 새로고침"
            >
              <RefreshCw size={10} className={saveStatus === 'pending' || saveStatus === 'saving' ? 'animate-spin' : ''} />
              <span>동기화</span>
            </button>
            {activeSubTab === 'SETTINGS' && (
              <button 
                onClick={handleSaveCloudSettings}
                disabled={!canEdit || saveStatus === 'saving'}
                className="p-1 bg-blue-600/50 hover:bg-blue-600 rounded flex items-center gap-1 text-white transition-all disabled:opacity-50"
              >
                <Download size={10} />
                <span>서식 저장</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {activeSubTab === 'INPUT' && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold border-b border-[#244b8a] pb-2">
                내용 입력 ({doc.type === DocType.A ? 'A형' : 'B형'})
              </h2>
              
              {/* Format Toggle */}
              <div className="flex bg-[#0d2142] p-1 rounded-lg">
                <button
                  disabled={!canEdit}
                  onClick={() => handleFormatToggle(DocType.A)}
                  className={`flex-1 py-2 text-xs font-bold rounded ${doc.type === DocType.A ? 'bg-[#1a6bb5] text-white shadow-md' : 'text-gray-400 hover:text-white transition-colors'} ${!canEdit ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  형식 A (협동조합)
                </button>
                <button
                  disabled={!canEdit}
                  onClick={() => handleFormatToggle(DocType.B)}
                  className={`flex-1 py-2 text-xs font-bold rounded ${doc.type === DocType.B ? 'bg-[#1a6bb5] text-white shadow-md' : 'text-gray-400 hover:text-white transition-colors'} ${!canEdit ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  형식 B (로지스)
                </button>
              </div>

      {/* Form Fields */}
      <div className="space-y-4 text-sm">
        <div className="space-y-1">
          <label className="text-blue-200 block text-xs font-medium">수신</label>
          <input readOnly={!canEdit} type="text" value={doc.receiver} onChange={e => handleChange('receiver', e.target.value)} className={`w-full bg-[#244b8a] border-none rounded p-2 focus:ring-2 focus:ring-blue-400 outline-none ${!canEdit ? 'opacity-70 cursor-default' : ''}`} />
        </div>
        <div className="space-y-1">
          <label className="text-blue-200 block text-xs font-medium">경유 (선택)</label>
          <input readOnly={!canEdit} type="text" value={doc.via} onChange={e => handleChange('via', e.target.value)} className={`w-full bg-[#244b8a] border-none rounded p-2 focus:ring-2 focus:ring-blue-400 outline-none ${!canEdit ? 'opacity-70 cursor-default' : ''}`} />
        </div>
        <div className="space-y-1">
          <label className="text-blue-200 block text-xs font-medium">제목</label>
          <input readOnly={!canEdit} type="text" value={doc.subject} onChange={e => handleChange('subject', e.target.value)} className={`w-full bg-[#244b8a] border-none rounded p-2 focus:ring-2 focus:ring-blue-400 font-bold outline-none ${!canEdit ? 'opacity-70 cursor-default' : ''}`} />
        </div>
        <div className="space-y-1">
          <label className="text-blue-200 block text-xs font-medium">본문 1번</label>
          <textarea readOnly={!canEdit} rows={2} value={doc.body1} onChange={e => handleChange('body1', e.target.value)} className={`w-full bg-[#244b8a] border-none rounded p-2 focus:ring-2 focus:ring-blue-400 outline-none resize-none ${!canEdit ? 'opacity-70 cursor-default' : ''}`} />
        </div>
        <div className="space-y-1">
          <label className="text-blue-200 block text-xs font-medium">본문 2번</label>
          <textarea readOnly={!canEdit} rows={2} value={doc.body2} onChange={e => handleChange('body2', e.target.value)} className={`w-full bg-[#244b8a] border-none rounded p-2 focus:ring-2 focus:ring-blue-400 outline-none resize-none ${!canEdit ? 'opacity-70 cursor-default' : ''}`} />
        </div>
        <div className="space-y-1">
          <label className="text-blue-200 block text-xs font-medium">본문 3번 (선택)</label>
          <textarea readOnly={!canEdit} rows={2} value={doc.body3} onChange={e => handleChange('body3', e.target.value)} className={`w-full bg-[#244b8a] border-none rounded p-2 focus:ring-2 focus:ring-blue-400 outline-none resize-none ${!canEdit ? 'opacity-70 cursor-default' : ''}`} />
        </div>
        <div className="space-y-1">
          <label className="text-blue-200 block text-xs font-medium">본문 4번 (선택)</label>
          <textarea readOnly={!canEdit} rows={2} value={doc.body4} onChange={e => handleChange('body4', e.target.value)} className={`w-full bg-[#244b8a] border-none rounded p-2 focus:ring-2 focus:ring-blue-400 outline-none resize-none ${!canEdit ? 'opacity-70 cursor-default' : ''}`} />
        </div>

        <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-blue-200 block text-xs font-medium">항목 목록</label>
                    {canEdit && (
                      <button onClick={addItem} className="text-[10px] bg-blue-600 hover:bg-blue-500 px-2 py-0.5 rounded flex items-center gap-1 transition-colors">
                        <Plus size={10} /> 추가
                      </button>
                    )}
                  </div>
                  {doc.items.map((item, idx) => (
                    <div key={idx} className="flex gap-1 group">
                      <span className="w-6 text-center pt-1.5 opacity-50 text-xs">{idx + 1}.</span>
                      <input readOnly={!canEdit} type="text" value={item} onChange={e => handleItemChange(idx, e.target.value)} className={`flex-1 bg-[#244b8a] border-none rounded p-1.5 text-xs focus:ring-1 focus:ring-blue-400 outline-none ${!canEdit ? 'opacity-70 cursor-default' : ''}`} />
                      {canEdit && (
                        <button onClick={() => removeItem(idx)} className="text-red-400 p-1 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={14} /></button>
                      )}
                    </div>
                  ))}
                </div>

                  <div className="space-y-1">
                    <label className="text-blue-200 block text-xs font-medium">시행일자</label>
                    <input readOnly={!canEdit} type="date" value={doc.date} onChange={e => handleChange('date', e.target.value)} className={`w-full bg-[#244b8a] border-none rounded p-2 focus:ring-2 focus:ring-blue-400 outline-none ${!canEdit ? 'opacity-70 cursor-default' : 'accent-blue-400'}`} />
                  </div>

                <div className="bg-[#0d2142] p-4 rounded-lg space-y-2 mt-4">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-blue-300 font-bold">문서번호</span>
                    {canEdit && (
                      <button onClick={generateNewDocNo} className="text-[10px] bg-green-700 hover:bg-green-600 px-2 py-0.5 rounded flex items-center gap-1 transition-colors">
                        <RefreshCcw size={10} /> 🔄 새 문서번호
                      </button>
                    )}
                  </div>
                  <p className="text-sm font-mono text-center py-2 bg-black/30 rounded border border-white/5 min-h-[36px] flex items-center justify-center">
                    {doc.docNumber || (doc.type === DocType.A 
                      ? `ws ${doc.docNo.year} - ${doc.docNo.num}`
                      : `wslos ${doc.docNo.year} - ${doc.date.split('-')[1]} - ${doc.docNo.num.toString().padStart(2, '0')}`
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeSubTab === 'HISTORY' && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold border-b border-[#244b8a] pb-2 flex items-center gap-2 justify-between">
                <span>📂 공문 기록 관리</span>
                <button 
                  onClick={() => {
                    if(confirm('모든 기록을 삭제할까요? (주의: 서버에서 영구 삭제됩니다)')) {
                       // This would need a bulk delete service method, typically users shouldn't do this easily
                       alert('개별 삭제를 이용해 주세요.');
                    }
                  }}
                  className="text-[10px] text-red-300 hover:text-red-200"
                >
                  기록 정리
                </button>
              </h2>

              {/* Filters */}
              <div className="bg-[#0d2142] p-3 rounded-lg space-y-3">
                <div className="flex gap-2">
                   <div className="flex-1">
                     <label className="text-[10px] text-blue-300">검색 (수신, 제목, 번호)</label>
                     <input 
                       type="text" 
                       value={historyFilter.text}
                       onChange={e => setHistoryFilter(prev => ({ ...prev, text: e.target.value }))}
                       placeholder="검색어 입력..."
                       className="w-full bg-[#244b8a] border-none rounded p-1.5 text-xs outline-none"
                     />
                   </div>
                   <div className="w-20">
                     <label className="text-[10px] text-blue-300">형식</label>
                     <select 
                       value={historyFilter.type}
                       onChange={e => setHistoryFilter(prev => ({ ...prev, type: e.target.value as 'ALL' | 'A' | 'B' }))}
                       className="w-full bg-[#244b8a] border-none rounded p-1.5 text-xs outline-none"
                     >
                       <option value="ALL">전체</option>
                       <option value="A">형식A</option>
                       <option value="B">형식B</option>
                     </select>
                   </div>
                </div>
                <div className="flex gap-2 items-end">
                   <div className="flex-1">
                     <label className="text-[10px] text-blue-300">날짜 범위</label>
                     <div className="flex items-center gap-1">
                       <input 
                         type="date" 
                         value={historyFilter.startDate}
                         onChange={e => setHistoryFilter(prev => ({ ...prev, startDate: e.target.value }))}
                         className="flex-1 bg-[#244b8a] border-none rounded p-1 text-[10px] outline-none"
                       />
                       <span className="text-gray-500">~</span>
                       <input 
                         type="date" 
                         value={historyFilter.endDate}
                         onChange={e => setHistoryFilter(prev => ({ ...prev, endDate: e.target.value }))}
                         className="flex-1 bg-[#244b8a] border-none rounded p-1 text-[10px] outline-none"
                       />
                     </div>
                   </div>
                   <button 
                     onClick={() => setHistoryFilter({ text: '', type: 'ALL', startDate: '', endDate: '' })}
                     className="bg-gray-700 p-1.5 rounded hover:bg-gray-600"
                     title="필터 초기화"
                   >
                     <RefreshCw size={12} />
                   </button>
                </div>
              </div>
              
              <div className="space-y-2">
                {(!doc.history || doc.history.length === 0) ? (
                  <div className="text-center py-10 text-gray-400 text-sm italic">
                    저장된 기록이 없습니다.<br/>
                    (인쇄/발송 시 자동으로 저장됩니다)
                  </div>
                ) : (
                  doc.history
                    .filter(item => {
                      // Text filter
                      const searchStr = (item.subject + item.receiver + (item.docNumber || '')).toLowerCase();
                      if (historyFilter.text && !searchStr.includes(historyFilter.text.toLowerCase())) return false;
                      
                      // Type filter
                      const itemType = ((item as DocHistoryItem & { docType?: string }).docType || (item.type === DocType.A ? 'A' : 'B')) as 'A' | 'B';
                      if (historyFilter.type !== 'ALL' && itemType !== historyFilter.type) return false;
                      
                      // Date filter
                      const itemDate = (item as DocHistoryItem & { createdAt?: string }).createdAt || item.timestamp;
                      if (historyFilter.startDate && itemDate < historyFilter.startDate) return false;
                      if (historyFilter.endDate && itemDate > (historyFilter.endDate + 'T23:59:59')) return false;
                      
                      return true;
                    })
                    .map((item) => (
                      <div 
                        key={item.id}
                        className="bg-[#0d2142] p-3 rounded-lg border border-white/5 hover:border-blue-400 transition-all group relative text-left"
                      >
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-[10px] text-blue-300 font-mono">
                            {(item as DocHistoryItem & { createdAt?: string }).createdAt ? new Date((item as DocHistoryItem & { createdAt?: string }).createdAt!).toLocaleString() : new Date(item.timestamp).toLocaleString()}
                          </span>
                          <button 
                            disabled={!canEdit}
                            onClick={(e) => deleteHistoryItem(item.id, e)}
                            className={`text-white/20 hover:text-red-400 p-1 transition-opacity ${!canEdit ? 'cursor-not-allowed opacity-0' : ''}`}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                        <div className="text-sm font-bold truncate pr-6 text-white">{item.subject || '(제목 없음)'}</div>
                        <div className="flex justify-between text-[11px] mt-1 text-gray-400">
                          <span className="truncate max-w-[150px]">To: {item.receiver || '-'}</span>
                          <span className="font-mono flex-shrink-0 ml-2">{(item as DocHistoryItem & { docNumber?: string }).docNumber || `${item.type === DocType.A ? 'A' : 'B'} No.${item.docNo.num}`}</span>
                        </div>
                        <div className="mt-3 flex gap-2">
                           <button 
                             onClick={() => loadFromHistory(item)}
                             className="flex-1 py-1 text-[10px] font-bold bg-blue-600/30 hover:bg-blue-600 text-blue-200 hover:text-white rounded transition-all"
                           >
                             불러오기
                           </button>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>
          )}

          {activeSubTab === 'SETTINGS' && (
            <div className="space-y-6">
              <div className="flex border-b border-[#244b8a] pb-2 items-center justify-between">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <SettingsIcon size={18} className="text-green-400" /> 상세 설정 ({doc.type === DocType.A ? 'A형' : 'B형'})
                </h2>
                <div className="flex gap-2 items-center">
                  <button 
                    onClick={handleSaveCloudSettings}
                    disabled={!canEdit || saveStatus === 'saving'}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-[11px] font-bold transition-all shadow-lg active:scale-95 disabled:opacity-50"
                  >
                    {saveStatus === 'saving' ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                    설정 클라우드 저장
                  </button>
                  {canEdit && (
                    <button 
                      onClick={() => {
                        if(confirm('이 페이지의 설정을 초기값으로 되돌릴까요?')) {
                          const updated = { ...doc.settings, [doc.type]: DEFAULT_SETTINGS[doc.type] };
                          saveSettings(updated);
                        }
                      }}
                      className="text-[10px] bg-slate-700 hover:bg-slate-600 px-2 py-1.5 rounded transition-colors"
                    >
                      기본값 복원
                    </button>
                  )}
                </div>
              </div>

              <div className={`space-y-8 text-xs ${!canEdit ? 'pointer-events-none opacity-80' : ''}`}>
                {/* 1. Header Section */}
                <section className="space-y-4">
                  <h3 className="text-blue-300 font-bold flex items-center gap-2 border-l-2 border-blue-400 pl-2">상단 머리말 (Header)</h3>
                  
                  <div className="space-y-3 p-3 bg-[#0d2142] rounded-lg">
                    <div className="space-y-1">
                      <label className="text-blue-200">상단 여유 여백: {currentSettings.headerMarginTop}mm</label>
                      <input disabled={!canEdit} type="range" min="0" max="50" value={currentSettings.headerMarginTop} onChange={e => handleSettingChange(doc.type, 'headerMarginTop', parseInt(e.target.value))} className="w-full h-1.5 bg-[#244b8a] rounded-lg appearance-none cursor-pointer accent-blue-400" />
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-blue-200 font-bold">로고 설정</label>
                      <div className="bg-[#244b8a] p-3 rounded flex flex-col gap-2">
                        {canEdit && (
                          <input 
                            type="file" 
                            accept="image/*"
                            onChange={e => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onloadend = () => handleSettingChange(doc.type, 'logoUrl', reader.result as string);
                                reader.readAsDataURL(file);
                              }
                            }}
                            className="text-[10px]"
                          />
                        )}
                        {currentSettings.logoUrl && (
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                              <img src={currentSettings.logoUrl} className="h-6 object-contain bg-white p-0.5 rounded" alt="logo" />
                              {canEdit && <button onClick={() => handleSettingChange(doc.type, 'logoUrl', '')} className="text-red-300">삭제</button>}
                            </div>
                            <div className="space-y-1">
                              <label className="text-gray-400">로고 높이: {currentSettings.headerLogoHeight}px</label>
                              <input disabled={!canEdit} type="range" min="8" max="100" value={currentSettings.headerLogoHeight} onChange={e => handleSettingChange(doc.type, 'headerLogoHeight', parseInt(e.target.value))} className="w-full h-1 bg-[#1a3a6b] rounded appearance-none cursor-pointer accent-blue-300" />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-2 bg-[#244b8a]/50 rounded">
                      <label className="text-blue-200">중앙 로고 표시</label>
                      <input disabled={!canEdit} type="checkbox" checked={currentSettings.showCenterLogo} onChange={e => handleSettingChange(doc.type, 'showCenterLogo', e.target.checked)} className="w-4 h-4 rounded accent-blue-400" />
                    </div>

                    <div className="space-y-1">
                      <label className="text-blue-200">기관명 (머리말 중앙)</label>
                      <input readOnly={!canEdit} type="text" value={currentSettings.orgName} onChange={e => handleSettingChange(doc.type, 'orgName', e.target.value)} className="w-full bg-[#244b8a] border-none rounded p-2 outline-none" />
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <div className="space-y-1">
                          <label className="text-blue-200">담당자</label>
                          <input readOnly={!canEdit} type="text" value={currentSettings.manager} onChange={e => handleSettingChange(doc.type, 'manager', e.target.value)} className="w-full bg-[#244b8a] border-none rounded p-2 outline-none" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-blue-200">협조자</label>
                          <input readOnly={!canEdit} type="text" value={currentSettings.associate} onChange={e => handleSettingChange(doc.type, 'associate', e.target.value)} className="w-full bg-[#244b8a] border-none rounded p-2 outline-none" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <div className="space-y-1">
                          <label className="text-gray-400 text-[10px]">기관명 색상</label>
                          <input disabled={!canEdit} type="color" value={currentSettings.orgNameColor} onChange={e => handleSettingChange(doc.type, 'orgNameColor', e.target.value)} className="w-full h-8 bg-transparent border-none cursor-pointer" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-gray-400 text-[10px]">글꼴</label>
                          <select disabled={!canEdit} value={currentSettings.orgNameFontFamily} onChange={e => handleSettingChange(doc.type, 'orgNameFontFamily', e.target.value)} className="w-full bg-[#244b8a] border-none rounded p-1 outline-none text-[10px]">
                            <option value='"Noto Sans KR", sans-serif'>본고딕</option>
                            <option value='"Nanum Gothic", sans-serif'>나눔고딕</option>
                            <option value='"Nanum Myeongjo", serif'>나눔명조</option>
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        <div className="space-y-1">
                          <label className="text-gray-400 text-[10px]">X 위치: {currentSettings.orgNameXOffset}mm</label>
                          <input disabled={!canEdit} type="range" min="-50" max="50" value={currentSettings.orgNameXOffset} onChange={e => handleSettingChange(doc.type, 'orgNameXOffset', parseInt(e.target.value))} className="w-full h-1 bg-blue-900 rounded appearance-none cursor-pointer" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-gray-400 text-[10px]">Y 위치: {currentSettings.orgNameYOffset}mm</label>
                          <input disabled={!canEdit} type="range" min="-50" max="50" value={currentSettings.orgNameYOffset} onChange={e => handleSettingChange(doc.type, 'orgNameYOffset', parseInt(e.target.value))} className="w-full h-1 bg-blue-900 rounded appearance-none cursor-pointer" />
                        </div>
                      </div>
                    </div>
                    
                    <div className="space-y-1">
                      <label className="text-blue-200">슬로건</label>
                      <input readOnly={!canEdit} type="text" value={currentSettings.slogan} onChange={e => handleSettingChange(doc.type, 'slogan', e.target.value)} className="w-full bg-[#244b8a] border-none rounded p-2 outline-none" />
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <div className="space-y-1">
                          <label className="text-gray-400 text-[10px]">슬로건 색상</label>
                          <input disabled={!canEdit} type="color" value={currentSettings.sloganColor} onChange={e => handleSettingChange(doc.type, 'sloganColor', e.target.value)} className="w-full h-8 bg-transparent border-none cursor-pointer" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-gray-400 text-[10px]">크기: {currentSettings.sloganSize}px</label>
                          <input disabled={!canEdit} type="range" min="6" max="20" value={currentSettings.sloganSize} onChange={e => handleSettingChange(doc.type, 'sloganSize', parseInt(e.target.value))} className="w-full h-1 bg-blue-900 rounded appearance-none cursor-pointer" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        <div className="space-y-1">
                          <label className="text-gray-400 text-[10px]">X 위치: {currentSettings.sloganXOffset}mm</label>
                          <input disabled={!canEdit} type="range" min="-50" max="50" value={currentSettings.sloganXOffset} onChange={e => handleSettingChange(doc.type, 'sloganXOffset', parseInt(e.target.value))} className="w-full h-1 bg-blue-900 rounded appearance-none cursor-pointer" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-gray-400 text-[10px]">Y 위치: {currentSettings.sloganYOffset}mm</label>
                          <input disabled={!canEdit} type="range" min="-50" max="50" value={currentSettings.sloganYOffset} onChange={e => handleSettingChange(doc.type, 'sloganYOffset', parseInt(e.target.value))} className="w-full h-1 bg-blue-900 rounded appearance-none cursor-pointer" />
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                {/* 2. Global Design */}
                <section className="space-y-4">
                  <h3 className="text-blue-300 font-bold flex items-center gap-2 border-l-2 border-blue-400 pl-2">전체 디자인 (Design)</h3>
                  
                  <div className="space-y-3 p-3 bg-[#0d2142] rounded-lg">
                    <div className="space-y-1">
                      <label className="text-blue-200">기본 글꼴</label>
                      <select value={currentSettings.fontFamily} onChange={e => handleSettingChange(doc.type, 'fontFamily', e.target.value)} className="w-full bg-[#244b8a] border-none rounded p-2 outline-none">
                        <option value='"Noto Sans KR", sans-serif'>본고딕 (Noto Sans)</option>
                        <option value='"Nanum Gothic", sans-serif'>나눔고딕</option>
                        <option value='"Nanum Myeongjo", serif'>나눔명조</option>
                        <option value='system-ui, sans-serif'>시스템 기본</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                       <div className="space-y-1">
                        <label className="text-blue-200">테마 색상</label>
                        <div className="flex gap-1">
                          <input type="color" value={currentSettings.themeColor} onChange={e => handleSettingChange(doc.type, 'themeColor', e.target.value)} className="w-8 h-8 bg-transparent border-none cursor-pointer" />
                          <input type="text" value={currentSettings.themeColor} onChange={e => handleSettingChange(doc.type, 'themeColor', e.target.value)} className="flex-1 bg-[#244b8a] border-none rounded p-1 font-mono text-[10px]" />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-blue-200">본문 색상</label>
                        <div className="flex gap-1">
                          <input type="color" value={currentSettings.contentColor} onChange={e => handleSettingChange(doc.type, 'contentColor', e.target.value)} className="w-8 h-8 bg-transparent border-none cursor-pointer" />
                          <input type="text" value={currentSettings.contentColor} onChange={e => handleSettingChange(doc.type, 'contentColor', e.target.value)} className="flex-1 bg-[#244b8a] border-none rounded p-1 font-mono text-[10px]" />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-blue-200">본문 글자 크기: {currentSettings.contentSize}px</label>
                      <input type="range" min="10" max="24" value={currentSettings.contentSize} onChange={e => handleSettingChange(doc.type, 'contentSize', parseInt(e.target.value))} className="w-full h-1.5 bg-[#244b8a] rounded-lg appearance-none cursor-pointer accent-blue-400" />
                    </div>

                    <div className="space-y-4 border-t border-white/5 pt-4">
                      <label className="text-blue-200 font-bold block">본문 정렬 및 간격</label>
                      <div className="space-y-1 mb-3">
                        <label className="text-gray-400 text-[10px]">단락 간 간격: {currentSettings.bodySpacing}rem</label>
                        <input type="range" min="0" max="10" step="0.5" value={currentSettings.bodySpacing} onChange={e => handleSettingChange(doc.type, 'bodySpacing', parseFloat(e.target.value))} className="w-full h-1 bg-blue-900 rounded appearance-none" />
                      </div>
                      <div className="grid grid-cols-1 gap-3">
                        {[1, 2, 3, 4].map(num => (
                          <div key={num} className="flex justify-between items-center text-[10px]">
                            <span>본문 {num}</span>
                            <div className="flex bg-[#244b8a] rounded overflow-hidden">
                              {(['left', 'center', 'right'] as const).map(a => (
                                <button 
                                  key={a} 
                                  onClick={() => handleSettingChange(doc.type, `body${num}Align` as keyof DocFormatSettings, a)} 
                                  className={`px-2 py-1 ${currentSettings[`body${num}Align` as keyof DocFormatSettings] === a ? 'bg-blue-600' : 'hover:bg-blue-800'}`}
                                >
                                  {a}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-blue-200">본문 전체 위치 조정 (X/Y mm)</label>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-gray-400 text-[10px]">X: {currentSettings.contentXOffset}mm</label>
                          <input type="range" min="-50" max="50" value={currentSettings.contentXOffset} onChange={e => handleSettingChange(doc.type, 'contentXOffset', parseInt(e.target.value))} className="w-full h-1 bg-blue-900 rounded appearance-none cursor-pointer" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-gray-400 text-[10px]">Y: {currentSettings.contentYOffset}mm</label>
                          <input type="range" min="-50" max="50" value={currentSettings.contentYOffset} onChange={e => handleSettingChange(doc.type, 'contentYOffset', parseInt(e.target.value))} className="w-full h-1 bg-blue-900 rounded appearance-none cursor-pointer" />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-blue-200">기본 본문 상단 여백: {currentSettings.bodyMarginTop}mm</label>
                      <input type="range" min="-20" max="100" value={currentSettings.bodyMarginTop} onChange={e => handleSettingChange(doc.type, 'bodyMarginTop', parseInt(e.target.value))} className="w-full h-1.5 bg-[#244b8a] rounded-lg appearance-none cursor-pointer accent-blue-400" />
                    </div>

                    <div className="space-y-1">
                      <label className="text-blue-200">기관명 크기: {currentSettings.orgNameSize}px</label>
                      <input type="range" min="16" max="36" value={currentSettings.orgNameSize} onChange={e => handleSettingChange(doc.type, 'orgNameSize', parseInt(e.target.value))} className="w-full h-1.5 bg-[#244b8a] rounded-lg appearance-none cursor-pointer accent-blue-400" />
                    </div>
                  </div>
                </section>

                {/* 4. Metadata & Line Design */}
                <section className="space-y-4">
                  <h3 className="text-blue-300 font-bold flex items-center gap-2 border-l-2 border-blue-400 pl-2">제목/수신 및 구분선 (Meta)</h3>
                  <div className="space-y-4 p-3 bg-[#0d2142] rounded-lg">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-blue-200">글자 크기: {currentSettings.metadataSize}px</label>
                        <input type="range" min="10" max="24" value={currentSettings.metadataSize} onChange={e => handleSettingChange(doc.type, 'metadataSize', parseInt(e.target.value))} className="w-full h-1 bg-[#244b8a] rounded appearance-none accent-blue-400" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-blue-200">내용 시작 위치: {currentSettings.metadataLabelWidth}px</label>
                        <input type="range" min="50" max="150" value={currentSettings.metadataLabelWidth} onChange={e => handleSettingChange(doc.type, 'metadataLabelWidth', parseInt(e.target.value))} className="w-full h-1 bg-[#244b8a] rounded appearance-none accent-blue-400" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-gray-400 text-[10px]">전체 X: {currentSettings.metadataXOffset}mm</label>
                        <input type="range" min="-50" max="50" value={currentSettings.metadataXOffset} onChange={e => handleSettingChange(doc.type, 'metadataXOffset', parseInt(e.target.value))} className="w-full h-1 bg-blue-900 rounded appearance-none" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-gray-400 text-[10px]">전체 Y: {currentSettings.metadataYOffset}mm</label>
                        <input type="range" min="-50" max="50" value={currentSettings.metadataYOffset} onChange={e => handleSettingChange(doc.type, 'metadataYOffset', parseInt(e.target.value))} className="w-full h-1 bg-blue-900 rounded appearance-none" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-gray-400 text-[10px]">양옆 간격 (Padding): {currentSettings.metadataPaddingX}mm</label>
                      <input type="range" min="0" max="50" value={currentSettings.metadataPaddingX} onChange={e => handleSettingChange(doc.type, 'metadataPaddingX', parseInt(e.target.value))} className="w-full h-1 bg-blue-900 rounded appearance-none" />
                    </div>
                    
                    <div className="border-t border-white/10 pt-3 space-y-2">
                      <label className="text-blue-200 font-bold flex justify-between">
                        상단 구분선 디자인
                        <input type="color" value={currentSettings.lineColor} onChange={e => handleSettingChange(doc.type, 'lineColor', e.target.value)} className="w-4 h-4 bg-transparent border-none cursor-pointer" />
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-gray-400 text-[10px]">선 두께: {currentSettings.lineThickness}px</label>
                          <input type="range" min="0" max="10" step="0.5" value={currentSettings.lineThickness} onChange={e => handleSettingChange(doc.type, 'lineThickness', parseFloat(e.target.value))} className="w-full h-1 bg-blue-900 rounded appearance-none" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-gray-400 text-[10px]">선 너비: {currentSettings.lineWidth}%</label>
                          <input type="range" min="10" max="100" value={currentSettings.lineWidth} onChange={e => handleSettingChange(doc.type, 'lineWidth', parseInt(e.target.value))} className="w-full h-1 bg-blue-900 rounded appearance-none" />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-gray-400 text-[10px]">선 상단 위치 (제목 기준): {currentSettings.lineYOffset}mm</label>
                        <input type="range" min="-30" max="50" value={currentSettings.lineYOffset} onChange={e => handleSettingChange(doc.type, 'lineYOffset', parseInt(e.target.value))} className="w-full h-1 bg-blue-900 rounded appearance-none" />
                      </div>
                    </div>
                  </div>
                </section>

                {/* 5. Items Styling */}
                <section className="space-y-4">
                  <h3 className="text-blue-300 font-bold flex items-center gap-2 border-l-2 border-blue-400 pl-2">항목 목록 설정 (Items)</h3>
                  <div className="space-y-4 p-3 bg-[#0d2142] rounded-lg">
                    <div className="space-y-1">
                      <label className="text-blue-200">구분 타이틀 (ex: - 다 음 -)</label>
                      <input type="text" value={currentSettings.itemsHeader} onChange={e => handleSettingChange(doc.type, 'itemsHeader', e.target.value)} className="w-full bg-[#244b8a] border-none rounded p-2 outline-none text-xs" />
                      <div className="space-y-1 mt-1">
                        <label className="text-gray-400 text-[10px]">타이틀 Y 위치: {currentSettings.itemsHeaderYOffset}mm</label>
                        <input type="range" min="-30" max="50" value={currentSettings.itemsHeaderYOffset} onChange={e => handleSettingChange(doc.type, 'itemsHeaderYOffset', parseInt(e.target.value))} className="w-full h-1 bg-blue-900 rounded appearance-none" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-blue-200 text-[10px]">항목 글자 크기: {currentSettings.itemsSize}px</label>
                        <input type="range" min="8" max="24" value={currentSettings.itemsSize} onChange={e => handleSettingChange(doc.type, 'itemsSize', parseInt(e.target.value))} className="w-full h-1 bg-[#244b8a] rounded appearance-none accent-blue-400" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-blue-200 text-[10px]">줄 간격: {currentSettings.itemsLineHeight}</label>
                        <input type="range" min="1" max="3" step="0.1" value={currentSettings.itemsLineHeight} onChange={e => handleSettingChange(doc.type, 'itemsLineHeight', parseFloat(e.target.value))} className="w-full h-1 bg-[#244b8a] rounded appearance-none accent-blue-400" />
                      </div>
                    </div>

                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-blue-200">항목 전체 정렬</span>
                      <div className="flex bg-[#244b8a] rounded overflow-hidden">
                        {(['left', 'center', 'right'] as const).map(a => (
                          <button key={a} onClick={() => handleSettingChange(doc.type, 'itemsAlign', a)} className={`px-2 py-1 ${currentSettings.itemsAlign === a ? 'bg-blue-600' : 'hover:bg-blue-800'}`}>{a}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>

                {/* 3. Footer Section */}
                <section className="space-y-4">
                  <h3 className="text-blue-300 font-bold flex items-center gap-2 border-l-2 border-blue-400 pl-2">하단 꼬리말 (Footer)</h3>
                  
                  <div className="space-y-3 p-3 bg-[#0d2142] rounded-lg">
                    <div className="space-y-1">
                      <label className="text-blue-200">꼬리말 위 여백: {currentSettings.footerMarginTop}mm</label>
                      <input type="range" min="0" max="100" value={currentSettings.footerMarginTop} onChange={e => handleSettingChange(doc.type, 'footerMarginTop', parseInt(e.target.value))} className="w-full h-1.5 bg-[#244b8a] rounded-lg appearance-none cursor-pointer accent-blue-400" />
                    </div>

                    <div className="space-y-2 border-t border-white/10 pt-3">
                      <label className="text-blue-200 font-bold flex justify-between">
                        하단 구분선 디자인
                        <input type="color" value={currentSettings.footerLineColor} onChange={e => handleSettingChange(doc.type, 'footerLineColor', e.target.value)} className="w-4 h-4 bg-transparent border-none cursor-pointer" />
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-blue-200 text-[10px]">구분선 두께: {currentSettings.footerLineThickness}px</label>
                          <input type="range" min="0" max="10" step="0.5" value={currentSettings.footerLineThickness} onChange={e => handleSettingChange(doc.type, 'footerLineThickness', parseFloat(e.target.value))} className="w-full h-1 bg-[#244b8a] rounded appearance-none cursor-pointer accent-blue-400" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-blue-200 text-[10px]">하단 글자 크기: {currentSettings.footerFontSize}px</label>
                          <input type="range" min="8" max="16" value={currentSettings.footerFontSize} onChange={e => handleSettingChange(doc.type, 'footerFontSize', parseInt(e.target.value))} className="w-full h-1 bg-[#244b8a] rounded appearance-none cursor-pointer accent-blue-400" />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <div className="space-y-1">
                          <label className="text-blue-200 text-[10px]">직합 전체 X: {currentSettings.signatureXOffset}mm</label>
                          <input type="range" min="-100" max="100" value={currentSettings.signatureXOffset} onChange={e => handleSettingChange(doc.type, 'signatureXOffset', parseInt(e.target.value))} className="w-full h-1 bg-[#244b8a] rounded appearance-none cursor-pointer accent-blue-400" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-blue-200 text-[10px]">직합 전체 Y: {currentSettings.signatureYOffset}mm</label>
                          <input type="range" min="-100" max="100" value={currentSettings.signatureYOffset} onChange={e => handleSettingChange(doc.type, 'signatureYOffset', parseInt(e.target.value))} className="w-full h-1 bg-[#244b8a] rounded appearance-none cursor-pointer accent-blue-400" />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-blue-200">직인 설정</label>
                      <div className="grid grid-cols-2 gap-2">
                        <select value={currentSettings.sealShape} onChange={e => handleSettingChange(doc.type, 'sealShape', e.target.value)} className="bg-[#244b8a] border-none rounded p-1 outline-none">
                          <option value="circle">원형 직인</option>
                          <option value="square">사각형 직인</option>
                        </select>
                        <input type="text" value={currentSettings.sealText} onChange={e => handleSettingChange(doc.type, 'sealText', e.target.value)} placeholder="직인 텍스트" className="bg-[#244b8a] border-none rounded p-1 outline-none" />
                      </div>
                      <div className="bg-[#244b8a] p-2 rounded mt-2 flex flex-col gap-2">
                        <label className="text-[10px] text-blue-200">직인 이미지 업로드 (선택)</label>
                        <input 
                          type="file" 
                          accept="image/*"
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onloadend = () => handleSettingChange(doc.type, 'sealUrl', reader.result as string);
                              reader.readAsDataURL(file);
                            }
                          }}
                          className="text-[10px]"
                        />
                        {currentSettings.sealUrl && (
                          <div className="flex items-center gap-2">
                            <img src={currentSettings.sealUrl} className="h-8 w-8 object-contain bg-white rounded" alt="seal preview" />
                            <button onClick={() => handleSettingChange(doc.type, 'sealUrl', '')} className="text-red-300 text-[10px]">삭제</button>
                          </div>
                        )}
                      </div>
                      <div className="space-y-1 mt-2">
                         <div className="flex justify-between text-[10px] text-gray-400">
                          <span>크기: {currentSettings.sealSize}</span>
                          <span>우측: {currentSettings.sealRightOffset}</span>
                          <span>상단: {currentSettings.sealTopOffset}</span>
                         </div>
                         <input type="range" min="10" max="30" value={currentSettings.sealSize} onChange={e => handleSettingChange(doc.type, 'sealSize', parseInt(e.target.value))} className="w-full h-1 bg-[#244b8a] rounded appearance-none accent-red-400" />
                         <input type="range" min="0" max="100" value={currentSettings.sealRightOffset} onChange={e => handleSettingChange(doc.type, 'sealRightOffset', parseInt(e.target.value))} className="w-full h-1 bg-[#244b8a] rounded appearance-none accent-red-400" />
                         <input type="range" min="-30" max="30" value={currentSettings.sealTopOffset} onChange={e => handleSettingChange(doc.type, 'sealTopOffset', parseInt(e.target.value))} className="w-full h-1 bg-[#244b8a] rounded appearance-none accent-red-400" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 border-t border-white/10 pt-3">
                      <div className="space-y-1">
                        <label className="text-blue-200">대표자 직위</label>
                        <input type="text" value={currentSettings.representativeTitle} onChange={e => handleSettingChange(doc.type, 'representativeTitle', e.target.value)} className="w-full bg-[#244b8a] border-none rounded p-1 outline-none" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-blue-200">대표자 성명</label>
                        <input type="text" value={currentSettings.representative} onChange={e => handleSettingChange(doc.type, 'representative', e.target.value)} className="w-full bg-[#244b8a] border-none rounded p-1 outline-none" />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-blue-200">주소</label>
                      <input type="text" value={currentSettings.address} onChange={e => handleSettingChange(doc.type, 'address', e.target.value)} className="w-full bg-[#244b8a] border-none rounded p-1 outline-none" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-blue-200">전화</label>
                        <input type="text" value={currentSettings.phone} onChange={e => handleSettingChange(doc.type, 'phone', e.target.value)} className="w-full bg-[#244b8a] border-none rounded p-1 outline-none text-[10px]" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-blue-200">전송</label>
                        <input type="text" value={currentSettings.fax} onChange={e => handleSettingChange(doc.type, 'fax', e.target.value)} className="w-full bg-[#244b8a] border-none rounded p-1 outline-none text-[10px]" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-blue-200">이메일</label>
                        <input type="text" value={currentSettings.email} onChange={e => handleSettingChange(doc.type, 'email', e.target.value)} className="w-full bg-[#244b8a] border-none rounded p-1 outline-none text-[10px]" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-blue-200">공개여부</label>
                        <input type="text" value={currentSettings.publicStatus} onChange={e => handleSettingChange(doc.type, 'publicStatus', e.target.value)} className="w-full bg-[#244b8a] border-none rounded p-1 outline-none text-[10px]" />
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 p-6 border-t border-[#244b8a]">
          <button onClick={handlePrint} className="bg-blue-500 hover:bg-blue-400 py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95">
            <Printer size={18} /> 인쇄
          </button>
          <button onClick={handleDownloadPDF} className="bg-red-600 hover:bg-red-500 py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95">
            <FileDown size={18} /> PDF 저장
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-12 bg-[#f8fafc] flex justify-center print:bg-white print:p-0 print:block">
        <div 
          id="a4-preview" 
          className="bg-white w-[210mm] shadow-2xl p-[20mm] box-border relative flex flex-col leading-relaxed print:shadow-none print:m-0 print:w-[210mm] mx-auto group official-doc-print overflow-hidden transition-all duration-500" 
          style={{ 
            color: '#0f172a',
            minHeight: '297mm',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15)'
          }}
        >
          {doc.type === DocType.A ? (
            <FormatA doc={doc} globalImages={globalImages} imageCache={cachedImages} />
          ) : (
            <FormatB doc={doc} globalImages={globalImages} imageCache={cachedImages} />
          )}
          
          {/* 페이지 번호 — 인쇄 시에만 표시, 2장 이상일 때만 */}
          <div
            className={`print-page-number ${isMultiPage ? 'multi-page' : ''}`}
            style={{ display: 'none' }}
          >
            - <span className="pageNumber"></span> -
          </div>
        </div>
      </div>
    </div>
  );
}

function RedSeal({ text = '직인', shape = 'circle', size = 16, rightOffset = 30, topOffset = -3, url = '' }: { text?: string, shape?: 'circle' | 'square', size?: number, rightOffset?: number, topOffset?: number, url?: string }) {
  const containerStyle = {
    width: `${size * 4}px`,
    height: `${size * 4}px`,
    right: `${rightOffset}mm`,
    top: `${topOffset}mm`
  };

  if (url) {
    return (
      <div className="absolute pointer-events-none" style={containerStyle}>
        <img src={url} className="w-full h-full object-contain opacity-90" alt="seal" />
      </div>
    );
  }

  if (shape === 'square') {
    // If text is long, split into a 2x2 or grid if possible for a more authentic look
    // For simplicity, we just use the text as is but style it better
    return (
      <div className="absolute pointer-events-none" style={containerStyle}>
        <svg viewBox="0 0 100 100" className="w-full h-full opacity-85">
          <rect x="5" y="5" width="90" height="90" fill="none" stroke="#ef4444" strokeWidth="4" />
          <rect x="12" y="12" width="76" height="76" fill="none" stroke="#ef4444" strokeWidth="1.5" />
          {text.length <= 2 ? (
            <text 
              x="50" y="50" 
              dominantBaseline="middle" 
              textAnchor="middle" 
              fill="#ef4444" 
              fontSize="38" 
              fontWeight="bold"
              style={{ letterSpacing: '4px', fontFamily: 'serif' }}
            >
              {text}
            </text>
          ) : (
            // Simple grid for longer text (up to 4 chars)
            <g fill="#ef4444" fontWeight="bold" style={{ fontFamily: 'serif' }}>
              {text.slice(0, 4).split('').map((char, i) => (
                <text 
                  key={i}
                  x={i % 2 === 0 ? 32 : 68} 
                  y={i < 2 ? 35 : 70}
                  dominantBaseline="middle" 
                  textAnchor="middle" 
                  fontSize="32"
                >
                  {char}
                </text>
              ))}
            </g>
          )}
        </svg>
      </div>
    );
  }

  return (
    <div className="absolute pointer-events-none" style={containerStyle}>
      <svg viewBox="0 0 100 100" className="w-full h-full opacity-80">
        <circle cx="50" cy="50" r="45" fill="none" stroke="#ef4444" strokeWidth="2.5" />
        <text 
          x="50" y="50" 
          dominantBaseline="middle" 
          textAnchor="middle" 
          fill="#ef4444" 
          fontSize={text.length > 2 ? "18" : "24"} 
          fontWeight="bold"
          style={{ letterSpacing: '1px' }}
        >
          {text}
        </text>
      </svg>
    </div>
  );
}

function FormatA({ doc, globalImages, imageCache }: { doc: OfficialDoc, globalImages: Record<string, string | null>, imageCache: Record<string, string> }) {
  const s = doc.settings[DocType.A];
  const logoUrl = imageCache.formA_logoUrl || doc.settings[DocType.A].logoUrl || globalImages.formA_logoUrl;
  const stampUrl = imageCache.formA_stampUrl || doc.settings[DocType.A].sealUrl || globalImages.formA_stampUrl;

  return (
    <div className="flex-1 flex flex-col" style={{ fontFamily: s.fontFamily, color: '#0f172a' }}>
      <div className="text-center mb-10 flex flex-col items-center" style={{ marginTop: `${s.headerMarginTop}mm` }}>
        <div className="flex items-center gap-2 mb-1" style={{ transform: `translate(${s.sloganXOffset}mm, ${s.sloganYOffset}mm)` }}>
          {logoUrl && s.showCenterLogo ? (
            <img src={logoUrl} style={{ height: `${s.headerLogoHeight}px`, maxHeight: '60px' }} className="object-contain" alt="logo icon" />
          ) : (
            <div className="font-bold border-r pr-2 py-0.5 leading-none" style={{ color: s.themeColor, borderRightColor: '#d1d5db' }}>{s.orgName.split(' ')[0]}</div>
          )}
          <p className="tracking-tighter" style={{ fontSize: `${s.sloganSize}px`, color: s.sloganColor || '#64748b', fontFamily: s.sloganFontFamily }}>{s.slogan}</p>
        </div>
        <h1 className="font-bold mt-2" style={{ 
          fontSize: `${s.orgNameSize}px`, 
          letterSpacing: `${s.orgNameLetterSpacing}px`, 
          color: s.orgNameColor || '#1e293b', 
          fontFamily: s.orgNameFontFamily,
          transform: `translate(${s.orgNameXOffset}mm, ${s.orgNameYOffset}mm)`
        }}>
          {s.orgName}
        </h1>
      </div>

      <div className="space-y-1 mb-6" style={{ 
        fontSize: `${s.metadataSize}px`,
        color: '#1e293b',
        transform: `translate(${s.metadataXOffset}mm, ${s.metadataYOffset}mm)`,
        paddingLeft: `${s.metadataPaddingX}mm`,
        paddingRight: `${s.metadataPaddingX}mm`
      }}>
        <div className="flex items-center">
          <span className="shrink-0" style={{ width: `${s.metadataLabelWidth}px`, color: '#64748b' }}>수 신 자</span>
          <span className="font-medium">{doc.receiver}</span>
        </div>
        <div className="flex h-6 items-center">
          <span className="shrink-0" style={{ width: `${s.metadataLabelWidth}px`, color: '#64748b' }}>(경 유)</span>
          <span>{doc.via}</span>
        </div>
        <div className="flex pt-4 items-center">
          <span className="shrink-0" style={{ width: `${s.metadataLabelWidth}px`, color: '#64748b' }}>제  목</span>
          <span className="font-bold">{doc.subject}</span>
        </div>
      </div>

      <div className="mx-auto" style={{ 
        borderTop: `${s.lineThickness}px solid ${s.lineColor}`, 
        width: `${s.lineWidth}%`,
        marginTop: `${s.lineYOffset}mm`,
        marginBottom: '0.4rem'
      }}></div>

      <div className="flex flex-col items-center" style={{ 
        color: s.contentColor, 
        fontSize: `${s.contentSize}px`,
        marginTop: `${s.bodyMarginTop}mm`,
        transform: `translate(${s.contentXOffset}mm, ${s.contentYOffset}mm)`
      }}>
        <div className="w-full whitespace-pre-wrap leading-relaxed" style={{ textAlign: s.body1Align, marginBottom: `${s.bodySpacing}rem` }}>
          1. {doc.body1}
        </div>
        {doc.body2 && (
          <div className="w-full whitespace-pre-wrap leading-relaxed" style={{ textAlign: s.body2Align, marginBottom: `${s.bodySpacing}rem` }}>
            2. {doc.body2}
          </div>
        )}
        {doc.body3 && (
          <div className="w-full whitespace-pre-wrap leading-relaxed" style={{ textAlign: s.body3Align, marginBottom: `${s.bodySpacing}rem` }}>
            3. {doc.body3}
          </div>
        )}
        {doc.body4 && (
          <div className="w-full whitespace-pre-wrap leading-relaxed" style={{ textAlign: s.body4Align, marginBottom: `${s.bodySpacing}rem` }}>
            4. {doc.body4}
          </div>
        )}

        <div className="py-8 container mx-auto flex flex-col items-center" style={{ transform: `translateY(${s.itemsHeaderYOffset}mm)` }}>
          {s.itemsHeader && <div className="font-bold mb-6 text-center">{s.itemsHeader}</div>}
          <div className="inline-block w-full" style={{ textAlign: s.itemsAlign, fontSize: `${s.itemsSize}px`, lineHeight: s.itemsLineHeight }}>
            {doc.items.map((item, idx) => (
              <div key={idx}>
                {idx + 1}. {item}{idx === doc.items.length - 1 ? ' 끝.' : ''}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-auto" style={{ paddingTop: `${s.footerMarginTop}mm` }}>
        <div className="w-full text-center mb-12 relative flex flex-col items-center" style={{ transform: `translate(${s.signatureXOffset}mm, ${s.signatureYOffset}mm)` }}>
          <h2 className="font-bold tracking-[4px]" style={{ fontSize: `${s.orgNameSize - 4}px` }}>{s.orgName} {s.representativeTitle}</h2>
          <RedSeal 
            text={s.sealText} 
            shape={s.sealShape} 
            size={s.sealSize} 
            rightOffset={s.sealRightOffset} 
            topOffset={s.sealTopOffset} 
            url={stampUrl || ''}
          />
        </div>

        <div className="border-t pt-4 leading-tight space-y-1" style={{ borderTopColor: s.footerLineColor, borderTopWidth: `${s.footerLineThickness}px`, fontSize: `${s.footerFontSize}px`, color: '#374151' }}>
          <div className="flex justify-between items-center mb-1">
            <div className="flex gap-4">
              <span>담당  {s.manager}</span>
              <span style={{ opacity: 0.6 }}>|</span>
              <span>협조자  {s.associate}</span>
            </div>
            <div>{s.representativeTitle}  {s.representative}</div>
          </div>
          <div className="flex justify-between pb-1 mb-1">
            <div className="flex gap-2">
              <span>시행  ws {doc.docNo.year}-{doc.docNo.num}</span>
              <span style={{ opacity: 0.7 }}>({doc.date})</span>
            </div>
            <span>접수</span>
          </div>
          <div className="pt-2 text-[0.85em] leading-tight space-y-1" style={{ opacity: 0.9 }}>
            <div className="font-medium whitespace-nowrap">{s.address}</div>
            <div className="flex flex-wrap gap-x-2 items-center whitespace-nowrap">
              <span>전화 {s.phone}</span>
              <span>/</span>
              <span>전송 {s.fax}</span>
              <span>/</span>
              <span>이메일 {s.email}</span>
              <span>/</span>
              <span>{s.publicStatus}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="footer-print hidden group-print:block">
        <span className="page-number"></span>
      </div>
    </div>
  );
}

function FormatB({ doc, globalImages, imageCache }: { doc: OfficialDoc, globalImages: Record<string, string | null>, imageCache: Record<string, string> }) {
  const s = doc.settings[DocType.B] || DEFAULT_SETTINGS[DocType.B];
  const logoUrl = imageCache.formB_logoUrl || s.logoUrl || globalImages.formB_logoUrl;
  const stampUrl = imageCache.formB_stampUrl || s.sealUrl || globalImages.formB_stampUrl;

  const docYear = doc.docNo?.year || new Date().getFullYear();
  const docNum = doc.docNo?.num || 1;
  const docMonth = (doc.date || '').split('-')[1] || '00';

  return (
    <div className="flex-1 flex flex-col" style={{ fontFamily: s.fontFamily, color: '#0f172a' }}>
      {/* Header section */}
      <div className="flex flex-col items-center mb-12" style={{ marginTop: `${s.headerMarginTop}mm` }}>
        <div className="w-full flex items-start justify-between mb-4">
          <div style={{ height: `${s.headerLogoHeight}px` }}>
            {logoUrl ? (
              <img src={logoUrl} style={{ height: '100%', maxHeight: '60px' }} className="object-contain" alt="main logo" />
            ) : (
              <div className="font-extrabold text-2xl" style={{ color: '#2563eb' }}>WS</div>
            )}
          </div>
          <div className="tracking-tight" style={{ 
            fontSize: `${s.sloganSize}px`, 
            color: s.sloganColor || '#475569', 
            fontFamily: (s.sloganFontFamily || '').split(',')[0].replace(/"/g, ''),
            transform: `translate(${s.sloganXOffset}mm, ${s.sloganYOffset}mm)`
          }}>
            {s.slogan}
          </div>
        </div>
        
        <h1 className="font-bold mb-6" style={{ 
          fontSize: `${s.orgNameSize}px`, 
          letterSpacing: `${s.orgNameLetterSpacing}px`, 
          color: s.orgNameColor || '#0f172a', 
          fontFamily: (s.orgNameFontFamily || '').split(',')[0].replace(/"/g, ''),
          transform: `translate(${s.orgNameXOffset}mm, ${s.orgNameYOffset}mm)`
        }}>
          {s.orgName}
        </h1>

        <div className="w-full space-y-2 mt-4" style={{ 
          fontSize: `${s.metadataSize}px`,
          color: '#1e293b',
          transform: `translate(${s.metadataXOffset}mm, ${s.metadataYOffset}mm)`,
          paddingLeft: `${s.metadataPaddingX}mm`,
          paddingRight: `${s.metadataPaddingX}mm`
        }}>
          <div className="flex items-center">
            <span className="shrink-0" style={{ width: `${s.metadataLabelWidth}px`, color: '#64748b' }}>수  신</span>
            <span className="font-medium">{doc.receiver}</span>
          </div>
          <div className="flex items-center">
            <span className="shrink-0" style={{ width: `${s.metadataLabelWidth}px`, color: '#64748b' }}>(경 유)</span>
            <span>{doc.via}</span>
          </div>
          <div className="flex items-center">
            <span className="shrink-0" style={{ width: `${s.metadataLabelWidth}px`, color: '#64748b' }}>제  목</span>
            <span className="font-bold">{doc.subject}</span>
          </div>
        </div>
      </div>

      <div className="mx-auto" style={{ 
        borderTop: `${s.lineThickness}px solid ${s.lineColor}`, 
        width: `${s.lineWidth}%`,
        marginTop: `${s.lineYOffset}mm`,
        marginBottom: '0.4rem'
      }}></div>

      <div className="" style={{ 
        fontSize: `${s.contentSize}px`, 
        color: s.contentColor || '#1e293b',
        marginTop: `${s.bodyMarginTop}mm`,
        transform: `translate(${s.contentXOffset}mm, ${s.contentYOffset}mm)`
      }}>
        <div className="whitespace-pre-wrap leading-relaxed" style={{ textAlign: s.body1Align || 'left', marginBottom: `${s.bodySpacing}rem` }}>
          1. {doc.body1}
        </div>
        {doc.body2 && (
          <div className="whitespace-pre-wrap leading-relaxed" style={{ textAlign: s.body2Align || 'left', marginBottom: `${s.bodySpacing}rem` }}>
            2. {doc.body2}
          </div>
        )}
        {doc.body3 && (
          <div className="whitespace-pre-wrap leading-relaxed" style={{ textAlign: s.body3Align || 'left', marginBottom: `${s.bodySpacing}rem` }}>
            3. {doc.body3}
          </div>
        )}
        {doc.body4 && (
          <div className="whitespace-pre-wrap leading-relaxed" style={{ textAlign: s.body4Align || 'left', marginBottom: `${s.bodySpacing}rem` }}>
            4. {doc.body4}
          </div>
        )}

        <div className="py-12 mt-4 container mx-auto flex flex-col items-center" style={{ transform: `translateY(${s.itemsHeaderYOffset}mm)` }}>
          {s.itemsHeader && <div className="font-bold mb-8 text-[1.1em] text-center w-full">{s.itemsHeader}</div>}
          <div className="inline-block w-full" style={{ textAlign: s.itemsAlign || 'left', fontSize: `${s.itemsSize}px`, lineHeight: s.itemsLineHeight }}>
            {(doc.items || []).map((item, idx) => (
              <div key={idx} className="mb-2">
                {idx + 1}. {item}{idx === doc.items.length - 1 ? ' 끝.' : ''}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-auto" style={{ paddingTop: `${s.footerMarginTop}mm` }}>
        {/* Signature Area */}
        <div className="w-full text-center mb-16 relative flex flex-col items-center" style={{ transform: `translate(${s.signatureXOffset}mm, ${s.signatureYOffset}mm)` }}>
          <h2 className="font-bold tracking-tight" style={{ fontSize: `${s.orgNameSize - 2}px`, color: '#0f172a' }}>
            {s.orgName} {s.representativeTitle}({s.sealText})
          </h2>
          <RedSeal 
            text={s.sealText} 
            shape={s.sealShape} 
            size={s.sealSize} 
            rightOffset={s.sealRightOffset} 
            topOffset={s.sealTopOffset} 
            url={stampUrl || ''}
          />
        </div>

        {/* Thick footer line matching PDF */}
        <div className="border-t pt-5 leading-normal mb-2" style={{ borderTopColor: s.footerLineColor, borderTopWidth: `${s.footerLineThickness}px`, fontSize: `${s.footerFontSize}px`, color: '#1f2937' }}>
          <div className="flex justify-between items-end mb-1">
             <div className="space-y-1">
                <div>담당  {s.manager}</div>
                <div>협조자  {s.associate}</div>
             </div>
             <div className="font-medium pr-10" style={{ fontSize: '1.2em' }}>
               {(s.representativeTitle || "").replace('이사', '')}  {s.representative}
             </div>
          </div>
          <div className="flex justify-between mb-1 pb-1">
            <div className="flex gap-2">
              <span>시행  wslos {docYear} – {docMonth} – {docNum.toString().padStart(2, '0')}</span>
            </div>
            <span>접수</span>
          </div>
          <div className="text-[0.95em] leading-tight space-y-1" style={{ color: '#334155', opacity: 0.95 }}>
            <div className="font-medium whitespace-nowrap text-[1.1em]">{s.address}</div>
            <div className="flex flex-wrap gap-x-2 items-center whitespace-nowrap">
              <span>전화 {s.phone}</span>
              <span>/ 전송 {s.fax}</span>
              <span>/ 이메일 <span className="font-medium underline" style={{ color: '#2563eb' }}>{s.email}</span></span>
              <span>/ {s.publicStatus}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="footer-print hidden group-print:block">
        <span className="page-number"></span>
      </div>
    </div>
  );
}


