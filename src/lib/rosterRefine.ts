// 명단 탭 ↔ 명단정제시스템(nexus-pipeline, logis-op) 연동.
//   ① listZipEntries/extractZipEntry — zip 안 엑셀을 "폴더처럼" 열람
//   ② refineExcelDirect — 이 앱 안에서 바로 주소매칭 API 호출 → 정제 엑셀 즉시 다운로드(DB 미사용)
//   ③ sendToRefineSystem — 명단정제시스템으로 파일 인계(Storage 임시경로 업로드 → 새 탭 오픈).
//      정제시스템은 이미 2개 파일 합치기·DB 저장 기능을 갖추고 있어 그대로 재사용한다(중복 구현 금지).
import JSZip from 'jszip';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';

const ADDRESS_API = String(import.meta.env.VITE_ADDRESS_MATCH_API_URL || '').replace(/\/+$/, '');
const REFINE_SYSTEM_URL = String(import.meta.env.VITE_REFINE_SYSTEM_URL || 'https://logis-op.web.app').replace(/\/+$/, '');

export interface ZipEntryInfo {
  path: string;
  isExcel: boolean;
  size: number;
}

// ── ① zip 목록/추출 ──────────────────────────────────────────────
export async function listZipEntries(blob: Blob): Promise<ZipEntryInfo[]> {
  const zip = await JSZip.loadAsync(blob);
  const entries: ZipEntryInfo[] = [];
  zip.forEach((path, entry) => {
    if (entry.dir) return;
    const lower = path.toLowerCase();
    entries.push({
      path,
      isExcel: lower.endsWith('.xlsx') || lower.endsWith('.xls'),
      size: (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize || 0,
    });
  });
  return entries.sort((a, b) => (b.isExcel ? 1 : 0) - (a.isExcel ? 1 : 0) || a.path.localeCompare(b.path, 'ko'));
}

export async function extractZipEntry(blob: Blob, path: string): Promise<Blob> {
  const zip = await JSZip.loadAsync(blob);
  const entry = zip.file(path);
  if (!entry) throw new Error(`zip 안에서 파일을 찾을 수 없습니다: ${path}`);
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

// ── ② 명단정제시스템 안 거치고 이 앱에서 바로 정제 → 다운로드 ─────
//   주소 컬럼을 찾아 매칭 API로 정제하고, "정제주소"/"확인필요" 컬럼을 덧붙여 다운로드한다.
export async function refineExcelDirect(
  file: File,
  cityLabel: string,
  onProgress?: (done: number, total: number) => void,
): Promise<{ total: number; matched: number }> {
  if (!ADDRESS_API) throw new Error('주소매칭 서비스 주소가 설정되지 않았습니다(VITE_ADDRESS_MATCH_API_URL).');
  const XLSX = await waitForXLSX();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
  if (!rows.length) throw new Error('빈 엑셀 파일입니다.');

  const headers = rows[0].map((h) => String(h || ''));
  const addrCol = findAddressColumn(headers);
  if (addrCol < 0) throw new Error('주소 컬럼을 찾을 수 없습니다("주소"가 포함된 헤더가 없음). 명단정제시스템으로 보내서 처리해주세요.');

  const body = rows.slice(1);
  let matched = 0;
  const results = await asyncPool(8, body, async (row) => {
    const addr = String(row[addrCol] || '').trim();
    if (!addr) return { refined: '', ok: false };
    const r = await matchAddress(addr, cityLabel);
    onProgress?.(matched + 1, body.length);
    if (r?.standardRoadAddress) { matched += 1; return { refined: r.standardRoadAddress, ok: true }; }
    return { refined: '', ok: false };
  });

  const outHeaders = [...headers, '정제주소', '확인필요'];
  const outRows = [outHeaders, ...body.map((row, i) => [...row, results[i].refined, results[i].ok ? '' : 'Y'])];
  const outSheet = XLSX.utils.aoa_to_sheet(outRows);
  const outWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(outWb, outSheet, sheetName || '정제명단');
  const outName = file.name.replace(/\.(xlsx|xls)$/i, '') + '_정제.xlsx';
  XLSX.writeFile(outWb, outName);

  return { total: body.length, matched };
}

// ── ③ 명단정제시스템으로 인계(임시 Storage 업로드 → 새 탭) ─────────
//   정제시스템은 URL의 importUrl을 fetch해 로컬 업로드와 동일하게 처리(지자체/월 자동감지,
//   2개 파일 합치기, DB 저장 모두 정제시스템 기존 기능 그대로 사용).
export async function sendToRefineSystem(file: File, region: string): Promise<void> {
  const safe = file.name.replace(/[\\/:*?"<>|]+/g, '_');
  const path = `refine-handoff/${Date.now()}_${safe}`;
  await uploadBytes(storageRef(storage, path), file, { contentType: file.type || 'application/octet-stream' });
  const url = await getDownloadURL(storageRef(storage, path));
  const dest = new URL(REFINE_SYSTEM_URL);
  dest.searchParams.set('importUrl', url);
  dest.searchParams.set('importName', file.name);
  if (region) dest.searchParams.set('importCity', region);
  window.open(dest.toString(), '_blank', 'noopener');
}
