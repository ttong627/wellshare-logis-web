// zip 중앙 디렉토리에서 파일명 원시 바이트를 직접 읽는다(런타임 무관 — Uint8Array/DataView만 사용).
//   ⚠️ 2026-07-11 실제 사고: 일부 압축 도구가 CP949 바이트를 쓰면서 UTF-8 플래그 비트를 잘못
//   켜두는 경우가 있다. 이 경우 JSZip은 loadOptions.decodeFileName 훅을 아예 호출하지 않고
//   자체 UTF-8 디코더(손실, U+FFFD)로 처리한다 — zip을 재압축하면 그 상태로 영구 저장된다.
//   따라서 UTF-8 플래그 값과 무관하게 항상 이 파서로 원본 바이트를 얻어 직접 판별해야 한다.

function findEOCD(view: DataView): number {
  const sig = 0x06054b50;
  const start = Math.max(0, view.byteLength - 22 - 65557);
  for (let i = view.byteLength - 22; i >= start; i--) {
    if (view.byteLength - i >= 4 && view.getUint32(i, true) === sig) return i;
  }
  throw new Error('zip EOCD 레코드를 찾을 수 없습니다(손상된 zip일 수 있음)');
}

export interface RawZipEntry {
  nameBytes: Uint8Array;
  isDir: boolean;
}

// 중앙 디렉토리 순서대로 반환 — JSZip의 Object.keys(zip.files) 순서와 동일(둘 다 중앙 디렉토리를
// 순차 순회)하므로 위치 대응으로 정확한 이름을 매핑할 수 있다.
export function parseRawZipFilenames(bytes: Uint8Array): RawZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEOCD(view);
  const cdOffset = view.getUint32(eocd + 16, true);
  const entryCount = view.getUint16(eocd + 10, true);
  const out: RawZipEntry[] = [];
  let p = cdOffset;
  for (let i = 0; i < entryCount; i++) {
    const sig = view.getUint32(p, true);
    if (sig !== 0x02014b50) throw new Error(`zip 중앙 디렉토리 서명 불일치(오프셋 ${p})`);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const nameBytes = bytes.slice(p + 46, p + 46 + nameLen);
    out.push({ nameBytes, isDir: nameBytes[nameBytes.length - 1] === 0x2f /* '/' */ });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

// UTF-8 엄격 시도 → 실패 시 EUC-KR(CP949 상위호환, 브라우저는 TextDecoder가 기본 지원) → 손실 폴백.
export function decodeNameBytesBrowser(bytes: Uint8Array): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { /* fallthrough */ }
  try { return new TextDecoder('euc-kr').decode(bytes); } catch { /* fallthrough */ }
  return new TextDecoder('utf-8').decode(bytes); // 손실 폴백(마지막 수단)
}

// JSZip이 매긴 (잘못됐을 수 있는) key → 올바른 이름 매핑을 위치 대응으로 만든다.
export function buildCorrectedNameMap(bytes: Uint8Array, jszipKeys: string[]): Map<string, string> {
  const raw = parseRawZipFilenames(bytes);
  if (raw.length !== jszipKeys.length) {
    throw new Error(`zip 항목 수 불일치(원시 ${raw.length} vs JSZip ${jszipKeys.length}) — 매핑 신뢰 불가`);
  }
  const map = new Map<string, string>();
  jszipKeys.forEach((key, i) => { map.set(key, decodeNameBytesBrowser(raw[i].nameBytes)); });
  return map;
}
