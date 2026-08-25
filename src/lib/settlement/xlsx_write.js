// -*- coding: utf-8 -*-
/**
 * 의존성 0 XLSX 작성기 — 시트 여러 개짜리 리포트를 만든다.
 *
 * 문자열은 inlineStr 로 넣어 sharedStrings 를 생략하고,
 * ZIP 은 CompressionStream 이 있으면 deflate, 없으면 무압축(STORE)으로 쓴다.
 * 둘 다 정식 ZIP 이라 엑셀·구글시트·이카운트 어디서든 열린다.
 */

// 스타일 인덱스 — buildStyles() 의 cellXfs 순서와 일치해야 한다
export const S = {
  PLAIN: 0,
  HEADER: 1,
  MONEY: 2,
  DATE: 3,
  BOLD: 4,
  MONEY_BOLD: 5,
  TITLE: 6,
  MUTED: 7,
  MONEY_RED: 8,
  CENTER: 9,
};

/**
 * @param {Array<{name: string, columns: Array<{header: string, width?: number}>, rows: Array<Array>}>} sheets
 *   각 셀은 원시값 또는 { v, s } (s = 스타일 인덱스).
 * @returns {Promise<Uint8Array>} 다운로드할 때 호출부에서 Blob 으로 감싼다.
 */
export async function writeXlsx(sheets) {
  if (!sheets.length) throw new Error('시트가 없습니다.');

  const files = [
    ['[Content_Types].xml', contentTypes(sheets.length)],
    ['_rels/.rels', ROOT_RELS],
    ['xl/workbook.xml', workbookXml(sheets)],
    ['xl/_rels/workbook.xml.rels', workbookRels(sheets.length)],
    ['xl/styles.xml', buildStyles()],
  ];
  sheets.forEach((sheet, i) => files.push([`xl/worksheets/sheet${i + 1}.xml`, sheetXml(sheet)]));

  return buildZip(files);
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// ══════════════════════════════════════════════════════════
//  워크시트 XML
// ══════════════════════════════════════════════════════════

function sheetXml(sheet) {
  const cols = sheet.columns || [];
  // 헤더 행이 없는 시트(요약 등)는 sheet.widths 로 열 너비를 지정한다
  const widths = cols.length ? cols.map((c) => c.width || 14) : (sheet.widths || []);
  const widthXml = widths.length
    ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : '';

  const rows = [];
  let r = 1;

  if (cols.length) {
    rows.push(rowXml(r++, cols.map((c) => ({ v: c.header, s: S.HEADER }))));
  }
  for (const row of sheet.rows) rows.push(rowXml(r++, row));

  const lastCol = colName(Math.max(1, cols.length || maxLen(sheet.rows)) - 1);
  const freeze = cols.length
    ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    : '';
  const autoFilter = cols.length ? `<autoFilter ref="A1:${lastCol}${Math.max(1, r - 1)}"/>` : '';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + freeze + widthXml
    + `<sheetData>${rows.join('')}</sheetData>`
    + autoFilter
    + `</worksheet>`;
}

function rowXml(r, cells) {
  const out = [];
  cells.forEach((cell, i) => {
    const { v, s } = normalizeCell(cell);
    if (v === null || v === undefined || v === '') {
      if (s) out.push(`<c r="${colName(i)}${r}" s="${s}"/>`);
      return;
    }
    const ref = `${colName(i)}${r}`;
    const style = s ? ` s="${s}"` : '';
    if (typeof v === 'number' && Number.isFinite(v)) {
      out.push(`<c r="${ref}"${style}><v>${v}</v></c>`);
    } else {
      out.push(`<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`);
    }
  });
  return `<row r="${r}">${out.join('')}</row>`;
}

function normalizeCell(cell) {
  if (cell !== null && typeof cell === 'object' && !(cell instanceof Date) && 'v' in cell) {
    return { v: cell.v, s: cell.s || 0 };
  }
  return { v: cell, s: 0 };
}

const maxLen = (rows) => rows.reduce((m, r) => Math.max(m, r.length), 1);

/** 0 → 'A', 26 → 'AA' */
function colName(idx) {
  let n = idx + 1;
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function esc(s) {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // 엑셀이 거부하는 제어문자 제거
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

// ══════════════════════════════════════════════════════════
//  워크북 / 스타일
// ══════════════════════════════════════════════════════════

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
  + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
  + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>`
  + `</Relationships>`;

function contentTypes(sheetCount) {
  const sheets = Array.from({ length: sheetCount }, (_, i) =>
    `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
    + `<Default Extension="xml" ContentType="application/xml"/>`
    + `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`
    + `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>`
    + sheets + `</Types>`;
}

function workbookXml(sheets) {
  const list = sheets.map((s, i) =>
    `<sheet name="${esc(safeSheetName(s.name, i))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" `
    + `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
    + `<sheets>${list}</sheets></workbook>`;
}

/** 엑셀 시트명 제약: 31자 이하, : \ / ? * [ ] 금지 */
function safeSheetName(name, i) {
  const s = String(name || `Sheet${i + 1}`).replace(/[:\\/?*[\]]/g, ' ').slice(0, 31).trim();
  return s || `Sheet${i + 1}`;
}

function workbookRels(sheetCount) {
  const sheets = Array.from({ length: sheetCount }, (_, i) =>
    `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + sheets
    + `<Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
    + `</Relationships>`;
}

function buildStyles() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + `<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0"/></numFmts>`
    + `<fonts count="5">`
    + `<font><sz val="10"/><name val="맑은 고딕"/></font>`
    + `<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="맑은 고딕"/></font>`
    + `<font><b/><sz val="10"/><name val="맑은 고딕"/></font>`
    + `<font><b/><sz val="13"/><name val="맑은 고딕"/></font>`
    + `<font><sz val="10"/><color rgb="FFC00000"/><name val="맑은 고딕"/></font>`
    + `</fonts>`
    + `<fills count="3">`
    + `<fill><patternFill patternType="none"/></fill>`
    + `<fill><patternFill patternType="gray125"/></fill>`
    + `<fill><patternFill patternType="solid"><fgColor rgb="FF1F3864"/><bgColor indexed="64"/></patternFill></fill>`
    + `</fills>`
    + `<borders count="2">`
    + `<border><left/><right/><top/><bottom/><diagonal/></border>`
    + `<border><left style="thin"><color rgb="FFD0D0D0"/></left><right style="thin"><color rgb="FFD0D0D0"/></right>`
    + `<top style="thin"><color rgb="FFD0D0D0"/></top><bottom style="thin"><color rgb="FFD0D0D0"/></bottom><diagonal/></border>`
    + `</borders>`
    + `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>`
    + `<cellXfs count="10">`
    + `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>`                                                     // 0 PLAIN
    + `<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>` // 1 HEADER
    + `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`                             // 2 MONEY
    + `<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`                              // 3 DATE
    + `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>`                                       // 4 BOLD
    + `<xf numFmtId="164" fontId="2" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>`               // 5 MONEY_BOLD
    + `<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>`                                       // 6 TITLE
    + `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="left"/></xf>` // 7 MUTED
    + `<xf numFmtId="164" fontId="4" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>`               // 8 MONEY_RED
    + `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center"/></xf>` // 9 CENTER
    + `</cellXfs>`
    + `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>`
    + `</styleSheet>`;
}

// ══════════════════════════════════════════════════════════
//  ZIP 쓰기
// ══════════════════════════════════════════════════════════

async function buildZip(files) {
  const encoder = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const [name, content] of files) {
    const nameBytes = encoder.encode(name);
    const raw = encoder.encode(content);
    const crc = crc32(raw);

    let data = raw;
    let method = 0;
    if (typeof CompressionStream !== 'undefined') {
      try {
        const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'));
        data = new Uint8Array(await new Response(stream).arrayBuffer());
        method = 8;
      } catch {
        data = raw; method = 0;                        // 압축 실패 시 무압축으로 저장
      }
    }

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);                     // 파일명 UTF-8
    lv.setUint16(8, method, true);
    lv.setUint16(10, 0, true);                         // 시각 (고정 — 재현 가능한 출력)
    lv.setUint16(12, 0x2821, true);                    // 날짜 2000-01-01
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);

    chunks.push(local, data);
    central.push({ nameBytes, crc, compSize: data.length, rawSize: raw.length, offset, method });
    offset += local.length + data.length;
  }

  const cdStart = offset;
  for (const e of central) {
    const rec = new Uint8Array(46 + e.nameBytes.length);
    const dv = new DataView(rec.buffer);
    dv.setUint32(0, 0x02014b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 20, true);
    dv.setUint16(8, 0x0800, true);
    dv.setUint16(10, e.method, true);
    dv.setUint16(12, 0, true);
    dv.setUint16(14, 0x2821, true);
    dv.setUint32(16, e.crc, true);
    dv.setUint32(20, e.compSize, true);
    dv.setUint32(24, e.rawSize, true);
    dv.setUint16(28, e.nameBytes.length, true);
    dv.setUint32(42, e.offset, true);
    rec.set(e.nameBytes, 46);
    chunks.push(rec);
    offset += rec.length;
  }

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, central.length, true);
  ev.setUint16(10, central.length, true);
  ev.setUint32(12, offset - cdStart, true);
  ev.setUint32(16, cdStart, true);
  chunks.push(eocd);

  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
