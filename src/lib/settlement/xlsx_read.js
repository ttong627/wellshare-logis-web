// -*- coding: utf-8 -*-
/**
 * 의존성 0 스프레드시트 리더 — 브라우저/Node 양쪽에서 동작.
 *
 * 실제 업무 파일은 확장자를 믿을 수 없다. 그래서 내용(매직바이트)으로 판별한다.
 *   .xlsx        → ZIP + XML          (홈택스·이카운트 최신 다운로드)
 *   .xls (HTML)  → <table> 덩어리     ★은행·구형 ERP 다운로드가 이 형태인 경우가 매우 많다
 *   .csv / .txt  → 구분자 텍스트       (UTF-8 / CP949 자동 판별)
 *   .xls (BIFF)  → 구형 이진 포맷      → 지원 불가, 다시 저장하라고 명확히 안내
 *
 * 반환: { format, sheets: [{ name, rows: [[cell, ...], ...] }] }
 *   cell 은 string | number | null. 날짜서식 셀은 'YYYY-MM-DD' 문자열로 변환된다.
 */

const ZIP_SIG = 0x04034b50;
const EOCD_SIG = 0x06054b50;
const CD_SIG = 0x02014b50;
const OLE2_MAGIC = [0xd0, 0xcf, 0x11, 0xe0];

// 엑셀 내장 날짜 서식 ID (숫자 셀을 날짜로 해석해야 하는 것들)
const BUILTIN_DATE_IDS = new Set([
  14, 15, 16, 17, 18, 19, 20, 21, 22,
  27, 28, 29, 30, 31, 32, 33, 34, 35, 36,
  45, 46, 47,
  50, 51, 52, 53, 54, 55, 56, 57, 58,
]);

/**
 * 파일(File | Blob | ArrayBuffer | Uint8Array)을 읽어 시트 배열로.
 * @returns {Promise<{format: string, sheets: {name: string, rows: any[][]}[]}>}
 */
export async function readTable(input, filename = '') {
  const buf = await toUint8(input);
  if (buf.length === 0) throw new Error('빈 파일입니다.');

  if (startsWith(buf, OLE2_MAGIC)) {
    throw new Error(
      '구형 엑셀(.xls) 이진 파일은 읽을 수 없습니다. ' +
      '엑셀에서 열어 [다른 이름으로 저장 → Excel 통합 문서(.xlsx)] 로 바꾼 뒤 올려주세요.'
    );
  }

  if (readU32(buf, 0) === ZIP_SIG) {
    return { format: 'xlsx', sheets: await readXlsx(buf) };
  }

  const text = decodeText(buf);
  if (/<\s*table[\s>]/i.test(text.slice(0, 20000))) {
    return { format: 'html', sheets: readHtmlTables(text) };
  }
  return { format: 'csv', sheets: [{ name: filename || 'CSV', rows: readDelimited(text) }] };
}

// ══════════════════════════════════════════════════════════
//  XLSX (ZIP + XML)
// ══════════════════════════════════════════════════════════

async function readXlsx(buf) {
  const entries = readZipEntries(buf);
  const get = async (name) => {
    const e = entries.get(name);
    return e ? decodeUtf8(await inflateEntry(buf, e)) : null;
  };

  const sharedStrings = parseSharedStrings(await get('xl/sharedStrings.xml'));
  const dateStyles = parseStyles(await get('xl/styles.xml'));

  // workbook.xml 의 시트 순서·이름 → rels 로 실제 파일 경로 해석
  const workbook = await get('xl/workbook.xml');
  const rels = parseRels(await get('xl/_rels/workbook.xml.rels'));
  const sheetDefs = [];
  for (const tag of matchTags(workbook || '', 'sheet')) {
    const name = unescapeXml(attr(tag, 'name') || `Sheet${sheetDefs.length + 1}`);
    const rid = attr(tag, 'r:id') || attr(tag, 'id');
    const target = rels.get(rid);
    sheetDefs.push({ name, path: target ? normalizeSheetPath(target) : null });
  }
  if (sheetDefs.length === 0) {
    // workbook 을 못 읽으면 worksheets 폴더를 직접 훑는다
    for (const path of [...entries.keys()].filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()) {
      sheetDefs.push({ name: path.split('/').pop().replace('.xml', ''), path });
    }
  }

  const sheets = [];
  for (const def of sheetDefs) {
    if (!def.path || !entries.has(def.path)) continue;
    const xml = decodeUtf8(await inflateEntry(buf, entries.get(def.path)));
    sheets.push({ name: def.name, rows: parseSheet(xml, sharedStrings, dateStyles) });
  }
  if (sheets.length === 0) throw new Error('엑셀 파일에서 시트를 찾지 못했습니다.');
  return sheets;
}

function normalizeSheetPath(target) {
  let t = target.replace(/^\//, '');
  if (t.startsWith('xl/')) return t;
  return `xl/${t}`;
}

/** ZIP 중앙 디렉터리를 읽어 { 파일명 → 엔트리 } 맵 반환. */
function readZipEntries(buf) {
  // EOCD 는 파일 끝에서 최대 (22 + 65535) 바이트 안에 있다
  let eocd = -1;
  const from = Math.max(0, buf.length - 22 - 65535);
  for (let i = buf.length - 22; i >= from; i--) {
    if (readU32(buf, i) === EOCD_SIG) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('올바른 엑셀(.xlsx) 파일이 아닙니다 — ZIP 구조를 찾지 못했습니다.');

  let ptr = readU32(buf, eocd + 16);        // 중앙 디렉터리 시작 오프셋
  const count = readU16(buf, eocd + 10);    // 이 디스크의 엔트리 수
  const entries = new Map();

  for (let i = 0; i < count && ptr + 46 <= buf.length; i++) {
    if (readU32(buf, ptr) !== CD_SIG) break;
    const method = readU16(buf, ptr + 10);
    const compSize = readU32(buf, ptr + 20);
    const nameLen = readU16(buf, ptr + 28);
    const extraLen = readU16(buf, ptr + 30);
    const commentLen = readU16(buf, ptr + 32);
    const localOffset = readU32(buf, ptr + 42);
    const name = decodeUtf8(buf.subarray(ptr + 46, ptr + 46 + nameLen));
    entries.set(name, { method, compSize, localOffset });
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** 로컬 헤더를 건너뛰고 실제 데이터를 꺼내 압축 해제. */
async function inflateEntry(buf, entry) {
  const lo = entry.localOffset;
  if (readU32(buf, lo) !== ZIP_SIG) throw new Error('ZIP 로컬 헤더가 손상되었습니다.');
  const nameLen = readU16(buf, lo + 26);
  const extraLen = readU16(buf, lo + 28);
  const start = lo + 30 + nameLen + extraLen;
  const data = buf.subarray(start, start + entry.compSize);

  if (entry.method === 0) return data;                     // 무압축(STORE)
  if (entry.method !== 8) throw new Error(`지원하지 않는 압축 방식(${entry.method})입니다.`);

  if (typeof DecompressionStream === 'undefined') {
    throw new Error('이 브라우저는 압축 해제를 지원하지 않습니다. 최신 Chrome/Edge 를 사용해 주세요.');
  }
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** sharedStrings.xml → 문자열 배열. `<si>` 안의 모든 `<t>` 를 이어붙인다(서식 분할 대응). */
function parseSharedStrings(xml) {
  if (!xml) return [];
  const out = [];
  for (const si of matchBlocks(xml, 'si')) {
    let s = '';
    for (const t of matchBlocks(si, 't')) s += unescapeXml(innerText(t));
    out.push(s);
  }
  return out;
}

/** styles.xml → cellXfs 인덱스별 "날짜 서식인가" 불리언 배열. */
function parseStyles(xml) {
  if (!xml) return [];
  const custom = new Map();
  for (const tag of matchTags(xml, 'numFmt')) {
    custom.set(Number(attr(tag, 'numFmtId')), attr(tag, 'formatCode') || '');
  }

  // cellXfs 블록 안의 <xf> 만 사용 (cellStyleXfs 와 섞이면 안 된다)
  const block = matchBlocks(xml, 'cellXfs')[0];
  if (!block) return [];

  const out = [];
  for (const tag of matchTags(block, 'xf')) {
    const id = Number(attr(tag, 'numFmtId') || 0);
    out.push(isDateFormat(id, custom.get(id)));
  }
  return out;
}

function isDateFormat(numFmtId, formatCode) {
  if (BUILTIN_DATE_IDS.has(numFmtId)) return true;
  if (!formatCode) return false;
  // 리터럴([$-409], "원", \-)을 걷어낸 뒤 y 또는 (d 와 m) 이 남으면 날짜 서식
  const bare = formatCode
    .replace(/\[[^\]]*\]/g, '')
    .replace(/"[^"]*"/g, '')
    .replace(/\\./g, '');
  return /y/i.test(bare) || (/d/i.test(bare) && /m/i.test(bare));
}

function parseRels(xml) {
  const map = new Map();
  if (!xml) return map;
  for (const tag of matchTags(xml, 'Relationship')) {
    map.set(attr(tag, 'Id'), unescapeXml(attr(tag, 'Target') || ''));
  }
  return map;
}

/** worksheet XML → 2차원 배열. 비어 있는 셀·행도 자리를 지킨다. */
function parseSheet(xml, sharedStrings, dateStyles) {
  const rows = [];
  let maxCols = 0;

  for (const rowXml of matchBlocks(xml, 'row')) {
    const rowIdx = Number(attr(firstTag(rowXml, 'row'), 'r') || rows.length + 1) - 1;
    const cells = [];

    for (const cellXml of matchBlocks(rowXml, 'c', true)) {
      const tag = firstTag(cellXml, 'c');
      const ref = attr(tag, 'r');
      const type = attr(tag, 't') || 'n';
      const styleIdx = Number(attr(tag, 's') || -1);
      const colIdx = ref ? colToIndex(ref) : cells.length;

      let value = null;
      if (type === 'inlineStr') {
        let s = '';
        for (const t of matchBlocks(cellXml, 't')) s += unescapeXml(innerText(t));
        value = s;
      } else {
        const vBlock = matchBlocks(cellXml, 'v')[0];
        const raw = vBlock === undefined ? '' : unescapeXml(innerText(vBlock));
        if (raw === '') {
          value = null;
        } else if (type === 's') {
          value = sharedStrings[Number(raw)] ?? '';
        } else if (type === 'str') {
          value = raw;
        } else if (type === 'b') {
          value = raw === '1';
        } else if (type === 'e') {
          value = null;                                   // #N/A 등 오류셀은 빈 값 취급
        } else {
          const num = Number(raw);
          value = Number.isFinite(num) ? num : raw;
          if (typeof value === 'number' && dateStyles[styleIdx]) value = serialToISO(value);
        }
      }
      cells[colIdx] = value;
    }

    for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = null;
    maxCols = Math.max(maxCols, cells.length);
    rows[rowIdx] = cells;
  }

  for (let i = 0; i < rows.length; i++) {
    if (!rows[i]) rows[i] = [];
    while (rows[i].length < maxCols) rows[i].push(null);
  }
  return rows;
}

/** 엑셀 날짜 일련번호 → 'YYYY-MM-DD' (1900 체계, 윤년 버그 포함). */
function serialToISO(serial) {
  if (!Number.isFinite(serial) || serial <= 0 || serial > 2958465) return serial;
  const ms = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000;
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** 'BC12' → 54 (0-base 열 인덱스). */
function colToIndex(ref) {
  let n = 0;
  for (const ch of ref) {
    const c = ch.charCodeAt(0);
    if (c >= 65 && c <= 90) n = n * 26 + (c - 64);
    else if (c >= 97 && c <= 122) n = n * 26 + (c - 96);
    else break;
  }
  return Math.max(0, n - 1);
}

// ══════════════════════════════════════════════════════════
//  HTML <table> (은행·구형 ERP 가 .xls 로 위장해 내려주는 형태)
// ══════════════════════════════════════════════════════════

function readHtmlTables(html) {
  const sheets = [];
  const tableRe = /<table[\s\S]*?<\/table>/gi;
  let m;
  let idx = 0;
  while ((m = tableRe.exec(html)) !== null) {
    const rows = [];
    const trRe = /<tr[\s\S]*?<\/tr>/gi;
    let tr;
    while ((tr = trRe.exec(m[0])) !== null) {
      const cells = [];
      const tdRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
      let td;
      while ((td = tdRe.exec(tr[0])) !== null) cells.push(stripHtml(td[1]));
      if (cells.length) rows.push(cells);
    }
    if (rows.length) sheets.push({ name: `Table${++idx}`, rows });
  }
  if (!sheets.length) throw new Error('HTML 안에서 표를 찾지 못했습니다.');
  return sheets;
}

function stripHtml(s) {
  const text = unescapeXml(
    s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ')
  ).trim();
  return text === '' ? null : text;
}

// ══════════════════════════════════════════════════════════
//  CSV / TSV
// ══════════════════════════════════════════════════════════

function readDelimited(text) {
  const sample = text.slice(0, 5000);
  const delim = (sample.split('\t').length > sample.split(',').length) ? '\t' : ',';

  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === delim) { row.push(field.trim() || null); field = ''; continue; }
    if (ch === '\n') {
      row.push(field.trim() || null); field = '';
      rows.push(row); row = [];
      continue;
    }
    if (ch === '\r') continue;
    field += ch;
  }
  if (field !== '' || row.length) { row.push(field.trim() || null); rows.push(row); }
  return rows.filter((r) => r.some((c) => c !== null && c !== ''));
}

// ══════════════════════════════════════════════════════════
//  공통 유틸
// ══════════════════════════════════════════════════════════

async function toUint8(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (typeof Blob !== 'undefined' && input instanceof Blob) {
    return new Uint8Array(await input.arrayBuffer());
  }
  if (input && typeof input.arrayBuffer === 'function') {
    return new Uint8Array(await input.arrayBuffer());
  }
  throw new Error('읽을 수 없는 입력입니다.');
}

const readU16 = (b, i) => b[i] | (b[i + 1] << 8);
const readU32 = (b, i) => ((b[i] | (b[i + 1] << 8) | (b[i + 2] << 16)) + b[i + 3] * 0x1000000) >>> 0;
const startsWith = (b, sig) => sig.every((v, i) => b[i] === v);

function decodeUtf8(bytes) {
  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * 한국 은행·공공기관 CSV 는 CP949(EUC-KR)인 경우가 흔하다.
 * UTF-8 로 엄격 디코딩해 보고 실패하면 CP949 로 재시도.
 */
function decodeText(bytes) {
  // BOM 이 있으면 확실히 UTF-8
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    for (const enc of ['euc-kr', 'windows-949', 'cp949']) {
      try { return new TextDecoder(enc).decode(bytes); } catch { /* 다음 인코딩 시도 */ }
    }
    return new TextDecoder('utf-8').decode(bytes);   // 최후 수단: 깨진 문자 허용
  }
}

/**
 * `<name ...>` 여는 태그 문자열들 (self-closing 포함).
 * 제너레이터가 아니라 배열을 돌려준다 — 호출부에서 [0] 로 첫 요소를 집는 곳이 있다.
 */
function matchTags(xml, name) {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?/?>`, 'g');
  const out = [];
  let m;
  while ((m = re.exec(xml)) !== null) out.push(m[0]);
  return out;
}

function firstTag(xml, name) {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?/?>`));
  return m ? m[0] : '';
}

/**
 * `<name ...>...</name>` 블록들. self-closing 태그도 빈 블록으로 포함한다.
 * withOpenTag=true 면 여는 태그를 포함한 원본을, 아니면 내용만 반환.
 * 배열로 돌려주므로 for...of 와 [0] 둘 다 안전하다.
 */
function matchBlocks(xml, name, withOpenTag = false) {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?(?:/>|>([\\s\\S]*?)</${name}>)`, 'g');
  const out = [];
  let m;
  while ((m = re.exec(xml)) !== null) {
    out.push(withOpenTag ? m[0] : (m[1] ?? ''));
  }
  return out;
}

const innerText = (s) => s;

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\s${name.replace(':', '\\:')}\\s*=\\s*"([^"]*)"`))
    || tag.match(new RegExp(`\\s${name.replace(':', '\\:')}\\s*=\\s*'([^']*)'`));
  return m ? m[1] : null;
}

function unescapeXml(s) {
  if (!s || s.indexOf('&') === -1) return s || '';
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');
}
