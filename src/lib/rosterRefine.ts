// 명단 탭 ↔ 명단정제시스템(nexus-pipeline, logis-op) 연동.
//   ① listZipEntries/extractZipEntry — zip 안 엑셀을 "폴더처럼" 열람
//   ② refineExcelDirect — 이 앱 안에서 바로 주소매칭 API 호출 → 정제 엑셀 즉시 다운로드(DB 미사용)
//   ③ sendToRefineSystem — 명단정제시스템으로 파일 인계(Storage 임시경로 업로드 → 새 탭 오픈).
//      정제시스템은 이미 2개 파일 합치기·DB 저장 기능을 갖추고 있어 그대로 재사용한다(중복 구현 금지).
import JSZip from 'jszip';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';
import { buildCorrectedNameMap } from './zipRawFilenames';

const ADDRESS_API = String(import.meta.env.VITE_ADDRESS_MATCH_API_URL || '').replace(/\/+$/, '');
const REFINE_SYSTEM_URL = String(import.meta.env.VITE_REFINE_SYSTEM_URL || 'https://logis-op.web.app').replace(/\/+$/, '');

export interface ZipEntryInfo {
  path: string;       // 화면 표시용 — 항상 정정된 실제 파일명(원시 바이트 기준)
  jszipKey: string;    // JSZip 내부 키(잘못 디코딩됐을 수 있음) — 추출 시 이 키로 조회
  isExcel: boolean;
  size: number;
}

// ⚠️ JSZip의 decodeFileName 훅은 zip 항목의 UTF-8 플래그 비트가 켜져 있으면 아예 호출되지 않고
// JSZip 자체 UTF-8 디코더(손실, U+FFFD)가 쓰인다. 일부 압축 도구가 CP949 바이트를 쓰면서도 이
// 플래그를 잘못 켜두는 경우가 있어(2026-07-11 실측), 플래그 값과 무관하게 항상 zip 중앙 디렉토리의
// 원시 바이트를 직접 읽어(zipRawFilenames) 우리 디코더로 이름을 다시 정한다. 절대 되돌리지 말 것
// — JSZip 기본 경로로 재압축하면 원본 한글 파일명이 복구 불가능하게 손상된다(실제 사고 발생).
async function loadZipWithCorrectedNames(blob: Blob): Promise<{ zip: JSZip; nameMap: Map<string, string> }> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const zip = await JSZip.loadAsync(bytes);
  const nameMap = buildCorrectedNameMap(bytes, Object.keys(zip.files));
  return { zip, nameMap };
}

// ── ① zip 목록/추출 ──────────────────────────────────────────────
export async function listZipEntries(blob: Blob): Promise<ZipEntryInfo[]> {
  const { zip, nameMap } = await loadZipWithCorrectedNames(blob);
  const entries: ZipEntryInfo[] = [];
  zip.forEach((jszipKey, entry) => {
    if (entry.dir) return;
    const path = nameMap.get(jszipKey) ?? jszipKey;
    const lower = path.toLowerCase();
    entries.push({
      path,
      jszipKey,
      isExcel: lower.endsWith('.xlsx') || lower.endsWith('.xls'),
      size: (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize || 0,
    });
  });
  return entries.sort((a, b) => (b.isExcel ? 1 : 0) - (a.isExcel ? 1 : 0) || a.path.localeCompare(b.path, 'ko'));
}

export async function extractZipEntry(blob: Blob, jszipKey: string): Promise<Blob> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const zip = await JSZip.loadAsync(bytes);
  const entry = zip.file(jszipKey);
  if (!entry) throw new Error(`zip 안에서 파일을 찾을 수 없습니다: ${jszipKey}`);
  return entry.async('blob');
}

// ── window.XLSX(CDN, App.tsx에서 로드) 준비 대기 ──────────────────
async function waitForXLSX(timeoutMs = 8000): Promise<any> {
  const w = window as unknown as { XLSX?: any };
  if (w.XLSX) return w.XLSX;
  const start = Date.now();
  while (!w.XLSX) {
    if (Date.now() - start > timeoutMs) throw new Error('엑셀 라이브러리 로딩 실패 — 잠시 후 다시 시도해주세요.');
    await new Promise((r) => setTimeout(r, 150));
  }
  return w.XLSX;
}

// ── 주소 컬럼 자동 탐지 — 헤더에 "주소" 포함된 첫 컬럼 ─────────────
function findAddressColumn(headers: string[]): number {
  return headers.findIndex((h) => String(h || '').includes('주소'));
}

// 동시성 제한 실행(주소API 과호출 방지)
async function asyncPool<T, R>(limit: number, items: T[], fn: (item: T, idx: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

async function matchAddress(query: string, cityLabel: string): Promise<{ standardRoadAddress?: string } | null> {
  if (!ADDRESS_API || !query?.trim()) return null;
  try {
    const res = await fetch(`${ADDRESS_API}/v1/address/match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: query.trim(), cityLabel, allowJusoFallback: true }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const j = await res.json();
    return j?.data || null;
  } catch {
    return null;
  }
}

// 엑셀 1개를 [헤더, ...본문행] 배열로 파싱(내부 공용 — 단일/병합 정제에서 재사용)
async function readRows(file: File, XLSX: any): Promise<{ sheetName: string; headers: string[]; body: string[][] }> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
  if (!rows.length) throw new Error(`빈 엑셀 파일입니다: ${file.name}`);
  return { sheetName, headers: rows[0].map((h) => String(h || '')), body: rows.slice(1) };
}

// ── ② 명단정제시스템 안 거치고 이 앱에서 바로 정제 → 다운로드 ─────
//   주소 컬럼을 찾아 매칭 API로 정제하고, "정제주소"/"확인필요" 컬럼을 덧붙여 다운로드한다.
//   files 2개를 넘기면(예: 수급자+차상위) 같은 헤더 기준으로 세로로 합쳐 1개 정제 결과로 만든다
//   ("출처파일" 컬럼으로 원본 구분 — 2개 파일 합쳐서 작업 요청 반영).
export async function refineExcelDirect(
  files: File[],
  cityLabel: string,
  onProgress?: (done: number, total: number) => void,
): Promise<{ total: number; matched: number }> {
  if (!ADDRESS_API) throw new Error('주소매칭 서비스 주소가 설정되지 않았습니다(VITE_ADDRESS_MATCH_API_URL).');
  if (!files.length) throw new Error('정제할 파일이 없습니다.');
  const XLSX = await waitForXLSX();
  const parsed = await Promise.all(files.map((f) => readRows(f, XLSX)));

  const headers = parsed[0].headers;
  const addrCol = findAddressColumn(headers);
  if (addrCol < 0) throw new Error('주소 컬럼을 찾을 수 없습니다("주소"가 포함된 헤더가 없음). 명단정제시스템으로 보내서 처리해주세요.');

  const combined: { row: string[]; source: string }[] = [];
  parsed.forEach((p, i) => p.body.forEach((row) => combined.push({ row, source: files[i].name })));

  let matched = 0;
  const results = await asyncPool(8, combined, async ({ row }) => {
    const addr = String(row[addrCol] || '').trim();
    if (!addr) return { refined: '', ok: false };
    const r = await matchAddress(addr, cityLabel);
    onProgress?.(matched + 1, combined.length);
    if (r?.standardRoadAddress) { matched += 1; return { refined: r.standardRoadAddress, ok: true }; }
    return { refined: '', ok: false };
  });

  const outHeaders = files.length > 1 ? [...headers, '정제주소', '확인필요', '출처파일'] : [...headers, '정제주소', '확인필요'];
  const outRows = [outHeaders, ...combined.map((c, i) => {
    const r = [...c.row, results[i].refined, results[i].ok ? '' : 'Y'];
    if (files.length > 1) r.push(c.source);
    return r;
  })];
  const outSheet = XLSX.utils.aoa_to_sheet(outRows);
  const outWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(outWb, outSheet, parsed[0].sheetName || '정제명단');
  const baseName = files.length > 1 ? `${files[0].name.replace(/\.(xlsx|xls)$/i, '')}_외${files.length - 1}건` : files[0].name.replace(/\.(xlsx|xls)$/i, '');
  XLSX.writeFile(outWb, `${baseName}_정제.xlsx`);

  return { total: combined.length, matched };
}

// ── ③ 명단정제시스템으로 인계(임시 Storage 업로드 → 새 탭) ─────────
//   정제시스템은 URL의 importUrl(+import2Url)을 fetch해 로컬 업로드와 동일하게 처리
//   (지자체/월 자동감지, 2개 파일이면 기존 2개 파일 합치기 기능으로 자동 병합, DB 저장까지
//   전부 정제시스템 기존 기능을 그대로 사용 — 중복 구현 금지).
export async function sendToRefineSystem(files: File[], region: string): Promise<void> {
  if (!files.length) throw new Error('보낼 파일이 없습니다.');
  if (files.length > 2) throw new Error('한 번에 최대 2개까지 함께 정제할 수 있습니다.');
  const upload = async (file: File) => {
    const safe = file.name.replace(/[\\/:*?"<>|]+/g, '_');
    const path = `refine-handoff/${Date.now()}_${safe}`;
    await uploadBytes(storageRef(storage, path), file, { contentType: file.type || 'application/octet-stream' });
    return getDownloadURL(storageRef(storage, path));
  };
  const urls = await Promise.all(files.map(upload));
  const dest = new URL(REFINE_SYSTEM_URL);
  dest.searchParams.set('importUrl', urls[0]);
  dest.searchParams.set('importName', files[0].name);
  if (region) dest.searchParams.set('importCity', region);
  if (files[1]) {
    dest.searchParams.set('import2Url', urls[1]);
    dest.searchParams.set('import2Name', files[1].name);
  }
  window.open(dest.toString(), '_blank', 'noopener');
}
