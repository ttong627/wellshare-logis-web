// 네이버웍스 메일 — User OAuth 토큰으로 Works API 직접 호출 (전체 폴더 수집)
// ─────────────────────────────────────────────────────────────
//   nworks CLI의 `mail list`는 받은함(folder 0)만 읽어 → 보건소별 폴더로 분류된 메일을 놓침.
//   형이 보건소별 폴더(수원_장안구·용인시_기흥구 등)로 정리해두므로, "전체 메일함"을 읽으려면
//   모든 폴더를 순회해야 한다. 이 모듈이 그 역할(폴더목록 → 폴더별 메일 → 정규화).
//   토큰은 nworks가 저장한 user-token.json(프로필별)을 그대로 재사용한다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const API = 'https://www.worksapis.com/v1.0/users/me/mail';

// nworks 토큰 저장 위치(환경독립). 백업 프로필(본사/부천 통합수집)도 같은 파일을 가리킬 수 있음.
export function defaultTokenPath() {
  return path.join(os.homedir(), '.config', 'nworks', 'user-token.json');
}

// 토큰 로드 — tokenPath 파일의 profile 키(기본 default) accessToken
export function loadToken(tokenPath = defaultTokenPath(), profile = 'default') {
  const raw = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
  const p = raw[profile] || Object.values(raw)[0] || {};
  if (!p.accessToken) throw new Error(`User OAuth 토큰 없음: ${tokenPath} (${profile})`);
  return p.accessToken;
}

const pickAddr = (x) =>
  typeof x === 'string' ? x : (x?.email || x?.address || x?.mailAddress || x?.userId || '');

async function api(token, p) {
  const r = await fetch(`${API}${p}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`Works API ${r.status} ${p}: ${t.slice(0, 200)}`);
  }
  return r.json();
}

// 폴더 목록 [{id, name}]
export async function listFolders(token) {
  const j = await api(token, '/mailfolders?count=100');
  return (j.mailFolders || j.folders || j.elements || []).map((f) => ({
    id: f.folderId ?? f.id,
    name: f.folderName ?? f.name ?? '',
  }));
}

// 한 폴더의 메일 (페이지네이션, max 상한, since 이후만)
//   ⚠️ 커서는 responseMetaData.nextCursor에 있다(최상위 nextCursor 아님). 메일은 최신순 정렬.
//   since(YYYY-MM-DD): 최신순이므로 페이지 마지막(가장 오래된)이 since보다 과거면 더 안 읽고 중단.
export async function listFolderMails(token, folderId, { max = 5000, since = null } = {}) {
  const out = [];
  let cursor = null;
  while (out.length < max) {
    const q = new URLSearchParams({ count: '100' });
    if (cursor) q.set('cursor', cursor);
    const j = await api(token, `/mailfolders/${folderId}/children?${q}`);
    const mails = j.mails || [];
    out.push(...mails);
    cursor = j.responseMetaData?.nextCursor;
    if (!cursor || mails.length === 0) break;
    if (since) {
      const oldest = (mails[mails.length - 1]?.receivedTime || mails[mails.length - 1]?.sentTime || '').slice(0, 10);
      if (oldest && oldest < since) break; // 이 폴더는 since 구간 다 읽음
    }
  }
  return out;
}

// 메일 정규화 — classify.buildMailMessage가 기대하는 형태(from=문자열) + 출처 폴더명
export function normalizeMail(m, folderName) {
  return {
    mailId: m.mailId,
    from: pickAddr(m.from),
    subject: m.subject || '',
    date: m.receivedTime || m.sentTime || '',
    attachments: m.attachCount ?? 0,
    folderName: folderName || '',
  };
}

// 수집에서 보통 제외할 시스템 폴더(보낸/임시/수신확인/메모는 보건소 발주 아님)
const SKIP_FOLDERS = new Set(['보낸메일함', '임시보관함', '수신확인', '메모함']);

// 전체 폴더 순회 수집 → 정규화 메일 배열(folderName 포함)
//   includeSpamTrash: 스팸/휴지통도 읽음(형 요청 "스팸함도 확인"). 분류에서 보건소 매칭된 것만 업무로 추림.
export async function fetchAllMails(token, { perFolder = 5000, includeSpamTrash = true, since = null } = {}) {
  const folders = await listFolders(token);
  const all = [];
  const perFolderCount = [];
  for (const f of folders) {
    if (SKIP_FOLDERS.has(f.name)) continue;
    if (!includeSpamTrash && (f.name === '스팸메일함' || f.name === '휴지통')) continue;
    const mails = await listFolderMails(token, f.id, { max: perFolder, since });
    for (const m of mails) all.push(normalizeMail(m, f.name));
    perFolderCount.push({ folder: f.name, count: mails.length });
  }
  return { mails: all, folders: perFolderCount };
}
