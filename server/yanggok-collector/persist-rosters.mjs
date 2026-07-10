// wellshare-logis 적재 모듈 — Works 첨부 → Storage 업로드 → rosters 메타 문서 생성.
//   멱등: 문서 ID = MAIL_{계정}_{mailId}_{attachmentId} (재실행해도 중복 0)
//       + 과거 수동적재분과의 중복은 (region|month|fileName) 키로 2차 차단.
//   보안: adminOnly 파일은 rosters_admin/ 경로(Storage 규칙상 관리자만 읽음).
import fs from 'node:fs';
import crypto from 'node:crypto';

const PROJECT = 'wellshare-logis';
const BUCKET = 'wellshare-logis.firebasestorage.app';
const APP_ID = 'wellshare-logis-v1-production-stable';
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const ROSTERS = `artifacts/${APP_ID}/public/data/rosters`;
const WORKS_API = 'https://www.worksapis.com/v1.0/users/me/mail';

export function saKeyPath() {
  const p = process.env.YANGGOK_SA_KEY;
  if (!p) throw new Error('YANGGOK_SA_KEY 환경변수 미설정 (wellshare-logis SA키 경로)');
  if (!fs.existsSync(p)) throw new Error(`SA키 파일 없음: ${p}`);
  return p;
}

// SA JWT → 액세스 토큰
export async function getGoogleToken(scope) {
  const sa = JSON.parse(fs.readFileSync(saKeyPath(), 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  const h = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const c = Buffer.from(JSON.stringify({
    iss: sa.client_email, scope, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  })).toString('base64url');
  const s = crypto.sign('RSA-SHA256', Buffer.from(`${h}.${c}`), sa.private_key).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${h}.${c}.${s}`,
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`구글 토큰 HTTP ${r.status}`);
  return (await r.json()).access_token;
}

// ── Works 첨부 ──────────────────────────────────────────────────
export async function listAttachments(worksToken, mailId) {
  const r = await fetch(`${WORKS_API}/${mailId}`, { headers: { Authorization: `Bearer ${worksToken}` }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`메일상세 ${mailId} HTTP ${r.status}`);
  const j = await r.json();
  return (j.attachments || [])
    .filter((a) => a.contentDisposition !== 'inline')
    .map((a) => ({
      attachmentId: a.attachmentId,
      filename: a.filename || `att_${a.attachmentId}`,
      contentType: a.contentType || 'application/octet-stream',
      size: Number(a.size || 0),
    }));
}

export async function downloadAttachment(worksToken, mailId, attachmentId) {
  const r = await fetch(`${WORKS_API}/${mailId}/attachments/${attachmentId}`, { headers: { Authorization: `Bearer ${worksToken}` }, signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`첨부 ${mailId}/${attachmentId} HTTP ${r.status}`);
  const j = await r.json();
  return Buffer.from(j.data || '', 'base64');
}

// ── 유틸 ────────────────────────────────────────────────────────
export const safeName = (name) => String(name || 'file').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120);
const dispositionFor = (filename) => `attachment; filename*=UTF-8''${encodeURIComponent(filename || 'file')}`;
export const extContentType = (name, fallback = 'application/octet-stream') => {
  const e = (String(name).split('.').pop() || '').toLowerCase();
  return {
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    pdf: 'application/pdf',
    zip: 'application/zip',
    hwp: 'application/x-hwp',
    hwpx: 'application/x-hwpx',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }[e] || fallback;
};

// ── Storage 업로드(다운로드 토큰 메타 → 앱 getDownloadURL 호환) ──
export async function uploadToStorage(gcsToken, objectPath, buffer, contentType, downloadName) {
  const downloadToken = crypto.randomUUID();
  const meta = JSON.stringify({
    name: objectPath,
    contentType,
    contentDisposition: dispositionFor(downloadName),
    metadata: { firebaseStorageDownloadTokens: downloadToken },
  });
  const boundary = `bnd_${crypto.randomBytes(8).toString('hex')}`;
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const r = await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${BUCKET}/o?uploadType=multipart`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${gcsToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) throw new Error(`Storage 업로드 HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return objectPath;
}

// ── Firestore ───────────────────────────────────────────────────
// 기존 문서 키 셋: ① 결정적 docId ② region|month|fileName ③ region|fileName
//   ③은 과거 수동적재분과 월 판정이 어긋나도 같은 문서를 재적재하지 않기 위한 보루.
//   (양곡 명단 파일명은 관행상 월·분기를 포함하므로 '다음 달 동명 신규 파일' 오차단 위험은 무시 가능)
export async function loadExistingKeys(fsToken) {
  const ids = new Set();
  const legacy = new Set();
  let pageToken = null;
  do {
    const q = new URLSearchParams({ pageSize: '300' });
    if (pageToken) q.set('pageToken', pageToken);
    const r = await fetch(`${FS_BASE}/${ROSTERS}?${q}`, { headers: { Authorization: `Bearer ${fsToken}` }, signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`rosters 나열 HTTP ${r.status}`);
    const j = await r.json();
    for (const doc of (j.documents || [])) {
      ids.add(doc.name.split('/').pop());
      const f = doc.fields || {};
      legacy.add(`${f.region?.stringValue}|${f.month?.stringValue}|${f.fileName?.stringValue}`);
      legacy.add(`${f.region?.stringValue}|${f.fileName?.stringValue}`);
    }
    pageToken = j.nextPageToken || null;
  } while (pageToken);
  return { ids, legacy };
}

// 모든 rosters 문서(필드 포함) — backfill-decrypt-existing.mjs가 사용
export async function listAllRosterDocs(fsToken) {
  const out = [];
  let pageToken = null;
  do {
    const q = new URLSearchParams({ pageSize: '300' });
    if (pageToken) q.set('pageToken', pageToken);
    const r = await fetch(`${FS_BASE}/${ROSTERS}?${q}`, { headers: { Authorization: `Bearer ${fsToken}` }, signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`rosters 나열 HTTP ${r.status}`);
    const j = await r.json();
    for (const doc of (j.documents || [])) {
      const f = doc.fields || {};
      out.push({
        id: doc.name.split('/').pop(),
        region: f.region?.stringValue || '', month: f.month?.stringValue || '',
        fileName: f.fileName?.stringValue || '', contentType: f.contentType?.stringValue || '',
        storagePath: f.storagePath?.stringValue || '', note: f.note?.stringValue || '',
      });
    }
    pageToken = j.nextPageToken || null;
  } while (pageToken);
  return out;
}

// GCS 객체 다운로드/업로드(같은 경로 덮어쓰기, 다운로드 토큰 새로 발급) — 복호화 재저장용
export async function downloadFromStorage(gcsToken, objectPath) {
  const r = await fetch(`https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encodeURIComponent(objectPath)}?alt=media`, {
    headers: { Authorization: `Bearer ${gcsToken}` }, signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) throw new Error(`Storage 다운로드 HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

// Firestore 문서 필드 부분 patch(updateMask) — note/size/decrypted 갱신용
export async function patchRosterDoc(fsToken, docId, fields) {
  const mask = Object.keys(fields).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
  const body = {};
  for (const [k, v] of Object.entries(fields)) {
    body[k] = typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? { integerValue: String(v) } : { stringValue: String(v) };
  }
  const r = await fetch(`${FS_BASE}/${ROSTERS}/${docId}?${mask}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${fsToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: body }),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`patch ${docId} HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

// 결정적 ID로 문서 생성(멱등) — 이미 있으면 409 → false 반환
export async function createRosterDoc(fsToken, docId, d) {
  const fields = {
    region: { stringValue: d.region },
    month: { stringValue: d.month },
    category: { stringValue: d.category },
    fileName: { stringValue: d.fileName },
    contentType: { stringValue: d.contentType },
    size: { integerValue: String(d.size) },
    storagePath: { stringValue: d.storagePath },
    note: { stringValue: d.note || '' },
    adminOnly: { booleanValue: !!d.adminOnly },
    uploadedAt: { stringValue: d.uploadedAt },
    uploadedBy: { stringValue: d.uploadedBy },
    sourceMailId: { stringValue: String(d.sourceMailId || '') },
    sourceAccount: { stringValue: String(d.sourceAccount || '') },
  };
  const r = await fetch(`${FS_BASE}/${ROSTERS}?documentId=${encodeURIComponent(docId)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${fsToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
    signal: AbortSignal.timeout(30000),
  });
  if (r.status === 409) return false; // 이미 존재 — 멱등 스킵
  if (!r.ok) throw new Error(`문서 생성 HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return true;
}
