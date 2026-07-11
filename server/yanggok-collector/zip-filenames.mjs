// zip 안 파일명을 중앙 디렉토리에서 직접 읽어 정확히 디코딩한다.
//   2026-07-11 사고: 일부 압축 도구(윈도우 탐색기 등)가 CP949 바이트를 쓰면서도 UTF-8 플래그 비트를
//   잘못 켜 놓는 경우가 있다. 이 경우 JSZip은 loadOptions.decodeFileName 훅을 아예 호출하지 않고
//   자체 UTF-8 디코더로 처리해 U+FFFD(복구 불가능한 손실)로 뭉개버린다(zip.generateAsync() 재압축 시
//   그 상태로 영구 저장됨 — 실제로 한 번 사고 발생, 반드시 이 파서를 거쳐야 한다).
//   따라서 UTF-8 플래그 값과 무관하게 항상 원시 바이트를 직접 읽어 우리 디코더로 판별한다.

// UTF-8 엄격 시도 → 실패 시 CP949(EUC-KR 상위호환) → 최후 폴백.
// ⚠️ Node의 TextDecoder는 'euc-kr' 라벨을 지원하지 않는다(기본 small-icu 빌드) — 서버(VM)에서
// 조용히 손실 폴백으로 빠져 U+FFFD가 나가는 사고가 실제로 있었다(2026-07-11). iconv-lite로 고정.
import iconv from 'iconv-lite';

export function decodeNameBytes(bytes) {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { /* fallthrough */ }
  try { return iconv.decode(buf, 'cp949'); } catch { /* fallthrough */ }
  return new TextDecoder('utf-8').decode(buf); // 손실 폴백(마지막 수단 — 여기 도달하면 로그로 남길 것)
}

function findEOCD(buf) {
  const sig = 0x06054b50;
  const start = Math.max(0, buf.length - 22 - 65557);
  for (let i = buf.length - 22; i >= start; i--) {
    if (buf.length - i >= 4 && buf.readUInt32LE(i) === sig) return i;
  }
  throw new Error('zip EOCD 레코드를 찾을 수 없습니다(손상된 zip일 수 있음)');
}

// 중앙 디렉토리 순서대로 [{ nameBytes, isDir }] 반환. JSZip의 Object.keys(zip.files) 순서와
// 동일(둘 다 중앙 디렉토리를 순차 순회)하므로 위치 대응으로 정확한 이름을 매핑할 수 있다.
export function parseRawZipFilenames(buf) {
  const eocd = findEOCD(buf);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  const entryCount = buf.readUInt16LE(eocd + 10);
  const out = [];
  let p = cdOffset;
  for (let i = 0; i < entryCount; i++) {
    const sig = buf.readUInt32LE(p);
    if (sig !== 0x02014b50) throw new Error(`zip 중앙 디렉토리 서명 불일치(오프셋 ${p})`);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const nameBytes = Buffer.from(buf.subarray(p + 46, p + 46 + nameLen));
    out.push({ nameBytes, isDir: nameBytes[nameBytes.length - 1] === 0x2f /* '/' */ });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

// JSZip이 매긴 (잘못됐을 수 있는) key → 올바른 이름 매핑을 위치 대응으로 만든다.
//   jszipKeys: Object.keys(zip.files) — 로드 직후, 어떤 옵션으로 로드했든 무관(위치만 사용).
export function buildCorrectedNameMap(buf, jszipKeys) {
  const raw = parseRawZipFilenames(buf);
  if (raw.length !== jszipKeys.length) {
    throw new Error(`zip 항목 수 불일치(원시 ${raw.length} vs JSZip ${jszipKeys.length}) — 매핑 신뢰 불가`);
  }
  const map = new Map();
  jszipKeys.forEach((key, i) => { map.set(key, decodeNameBytes(raw[i].nameBytes)); });
  return map;
}
