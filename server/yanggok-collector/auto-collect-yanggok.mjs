// 정부양곡 명단 자동수집 오케스트레이터 — VM cron이 2시간 주기 실행 (yyplus 데몬 20분 뒤 오프셋).
//   ① 계정별 nworks 토큰을 '읽기전용'으로 사용 (갱신은 yyplus auto-collect 담당 — 이중갱신 회전충돌 방지)
//   ② 최근 N일 메일 수집 → 양곡 명단 분류(classify-yanggok) → 첨부 다운로드 → Storage/Firestore 멱등 적재
//   ③ 첨부(엑셀 직접 또는 zip 안 엑셀)가 암호화면 메일 제목·본문·파일명에서 암호를 찾아 자동 해제
//      후 평문으로 저장(원문 수급자 명단을 회원사가 암호 없이 바로 열 수 있게). 암호를 못 찾으면
//      암호화 상태 그대로 저장 + note에 "🔒 암호 확인 필요" 표시(추측 금지 — 실제 암호만 시도).
//   ④ 신규 적재·토큰 장애를 텔레그램 ops 채널로 알림(12h 중복방지)
//   사용: node auto-collect-yanggok.mjs                # dry-run(쓰기 없음)
//         node auto-collect-yanggok.mjs --commit       # 실제 적재
//         node auto-collect-yanggok.mjs --commit --days 45   # 수집 창 조정(기본 14일)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadToken, fetchAllMails, fetchMailBody } from './worksmail.mjs';
import { planMail, extractCategory } from './classify-yanggok.mjs';
import {
  getGoogleToken, listAttachments, downloadAttachment, uploadToStorage,
  loadExistingKeys, createRosterDoc, safeName, extContentType, cleanMailBodyForDisplay,
} from './persist-rosters.mjs';
import { sendTelegram } from './notify-telegram.mjs';
import { extractPassword } from './password-extract.mjs';
import { isXlsxEncrypted, decryptXlsx, decryptZipEntries, zipHasEncryptedXlsx } from './decrypt.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const NW = path.join(os.homedir(), '.config', 'nworks');
const LOG = path.join(DIR, 'yanggok-collect.log');
const ALERT_STATE = path.join(DIR, 'alert-state.json');
const ALERT_COOLDOWN_MS = 12 * 3600 * 1000;

// 계정 축약키는 문서 ID에 들어간다(멱등 키) — 변경 금지.
const ACCOUNTS = [
  { name: '본사A', key: 'A', token: 'user-token.json' },
  { name: '부천', key: 'B', token: 'user-token.bucheon.json' },
];

const COMMIT = process.argv.includes('--commit');
const argDays = (() => { const i = process.argv.indexOf('--days'); return i >= 0 ? parseInt(process.argv[i + 1], 10) : 14; })();

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG, line + '\n'); } catch { /* noop */ }
}
const kstNow = () => new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false });

// nworks 토큰 읽기전용 로드 — 만료면 null (갱신은 yyplus 데몬 몫)
function readWorksToken(file) {
  const p = path.join(NW, file);
  if (!fs.existsSync(p)) return { token: null, reason: '토큰 파일 없음' };
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    const key = Object.keys(raw).find((k) => raw[k]?.accessToken) || Object.keys(raw)[0];
    const tk = raw[key];
    const now = Math.floor(Date.now() / 1000);
    if (tk.expiresAt && tk.expiresAt <= now) return { token: null, reason: '토큰 만료(yyplus 데몬 갱신 대기)' };
    return { token: tk.accessToken, reason: null };
  } catch (e) { return { token: null, reason: `토큰 읽기 오류(${e.message})` }; }
}

const loadAlertState = () => { try { return JSON.parse(fs.readFileSync(ALERT_STATE, 'utf8')); } catch { return {}; } };
const saveAlertState = (s) => { try { fs.writeFileSync(ALERT_STATE, JSON.stringify(s, null, 2)); } catch { /* noop */ } };

async function handleAlerts(failures, okCount) {
  const state = loadAlertState();
  const now = Date.now();
  const due = (k) => !state[k] || (now - new Date(state[k]).getTime()) > ALERT_COOLDOWN_MS;
  const failNames = new Set(failures.map((f) => f.name));

  if (ACCOUNTS.length > 0 && okCount === 0) {
    if (due('__ALL__')) {
      if (await sendTelegram(`🚨🚨 [양곡 명단수집 전면중단]\n모든 메일함 접근 실패 — 명단 자동적재가 멈췄습니다.\n시각: ${kstNow()} (KST)\n조치: 안토니에게 "양곡 수집 살려줘"`)) {
        state.__ALL__ = new Date().toISOString(); log('  🚨 텔레그램: 전면중단');
      }
    }
  } else if (state.__ALL__) { delete state.__ALL__; }

  for (const f of failures) {
    if (!due(f.name)) continue;
    if (await sendTelegram(`🚨 [양곡 명단수집 장애]\n계정: ${f.name} — ${f.reason}\n시각: ${kstNow()} (KST)`)) {
      state[f.name] = new Date().toISOString(); log(`  🚨 텔레그램: ${f.name} 장애`);
    }
  }
  for (const k of Object.keys(state)) {
    if (k === '__ALL__') continue;
    if (!failNames.has(k)) {
      await sendTelegram(`✅ [양곡 명단수집 복구] ${k} 정상화.\n시각: ${kstNow()} (KST)`);
      delete state[k];
    }
  }
  saveAlertState(state);
}

async function main() {
  log(`=== 양곡 명단 자동수집 시작 (최근 ${argDays}일, ${COMMIT ? 'COMMIT' : 'DRY-RUN'}) ===`);
  const since = new Date(Date.now() - argDays * 86400000).toISOString().slice(0, 10);

  const fsToken = await getGoogleToken('https://www.googleapis.com/auth/datastore');
  const gcsToken = COMMIT ? await getGoogleToken('https://www.googleapis.com/auth/devstorage.read_write') : null;
  const { ids: existingIds, legacy: legacyKeys } = await loadExistingKeys(fsToken);
  log(`  기존 rosters ${existingIds.size}건`);

  const failures = [];
  let okAccounts = 0;
  const registered = [];

  for (const acc of ACCOUNTS) {
    const { token, reason } = readWorksToken(acc.token);
    if (!token) { log(`  ✗ ${acc.name}: ${reason}`); failures.push({ name: acc.name, reason }); continue; }

    let mails;
    try {
      ({ mails } = await fetchAllMails(loadToken(path.join(NW, acc.token)), { since, includeSpamTrash: false }));
      okAccounts += 1;
    } catch (e) {
      log(`  ✗ ${acc.name}: 메일 수집 실패 ${e.message.slice(0, 120)}`);
      failures.push({ name: acc.name, reason: `수집 실패(${e.message.slice(0, 60)})` });
      continue;
    }

    const recent = mails.filter((m) => (m.date || '').slice(0, 10) >= since);
    const targets = recent.map((m) => ({ m, plan: planMail(m) })).filter((x) => x.plan.register);
    log(`  ${acc.name}: 최근 ${recent.length}건 중 양곡 명단 ${targets.length}건`);

    for (const { m, plan } of targets) {
      let atts;
      try { atts = await listAttachments(token, m.mailId); } catch (e) { log(`    ✗ 첨부목록 실패 ${m.mailId}: ${e.message.slice(0, 80)}`); continue; }
      // 메일 본문 — 이 메일의 첨부 전체가 공유하므로 1회만 조회+캐시(암호 추출용 + 화면 열람용 저장).
      let bodyCache;
      const getBody = async () => {
        if (bodyCache === undefined) { try { bodyCache = await fetchMailBody(token, m.mailId); } catch { bodyCache = ''; } }
        return bodyCache;
      };
      for (const a of atts) {
        const docId = `MAIL_${acc.key}_${m.mailId}_${a.attachmentId}`;
        const legacyKey = `${plan.region}|${plan.month}|${a.filename}`;
        const regionFileKey = `${plan.region}|${a.filename}`;
        if (existingIds.has(docId) || legacyKeys.has(legacyKey) || legacyKeys.has(regionFileKey)) continue; // 멱등
        const contentType = a.contentType === 'application/octet-stream' ? extContentType(a.filename) : a.contentType;
        const base = plan.adminOnly ? 'rosters_admin' : 'rosters';
        const storagePath = `${base}/${plan.region}/${plan.month}/${docId}_${safeName(a.filename)}`;

        if (!COMMIT) {
          log(`    · [예정] ${plan.region} ${plan.month}${plan.adminOnly ? ' 🔒' : ''} ${a.filename} (${Math.round(a.size / 1024)}KB) ← ${m.subject.slice(0, 40)}`);
          registered.push({ ...plan, fileName: a.filename });
          continue;
        }
        try {
          let buf = await downloadAttachment(token, m.mailId, a.attachmentId);
          let note = plan.note;
          let passwordFound = '';
          const isXlsx = /\.xlsx?$/i.test(a.filename);
          const isZip = /\.zip$/i.test(a.filename);
          const rawBody = await getBody(); // 암호 유무와 무관하게 항상 저장(리스트에서 원문 열람용)

          if (isXlsx && await isXlsxEncrypted(buf)) {
            const pw = extractPassword({ subject: m.subject, body: rawBody, fileName: a.filename });
            const plain = pw ? await decryptXlsx(buf, pw) : null;
            if (plain) { buf = plain; passwordFound = pw; log(`    🔓 암호 해제(엑셀): ${a.filename} (pw=${pw})`); }
            else note = [note, '🔒 암호 확인 필요(메일에서 못 찾음) — 담당자 확인'].filter(Boolean).join(' · ');
          } else if (isZip && await zipHasEncryptedXlsx(buf)) {
            const pw = extractPassword({ subject: m.subject, body: rawBody, fileName: a.filename });
            const { changed, buf: outBuf, stillEncrypted } = await decryptZipEntries(buf, pw);
            if (changed) { buf = outBuf; passwordFound = pw; log(`    🔓 암호 해제(zip 안 엑셀): ${a.filename} (pw=${pw})`); }
            if (stillEncrypted) note = [note, '🔒 암호 확인 필요(메일에서 못 찾음) — 담당자 확인'].filter(Boolean).join(' · ');
          }

          await uploadToStorage(gcsToken, storagePath, buf, contentType, a.filename);
          const created = await createRosterDoc(fsToken, docId, {
            region: plan.region, month: plan.month,
            category: extractCategory(m.subject, a.filename),
            fileName: a.filename, contentType, size: buf.length, storagePath,
            note, adminOnly: plan.adminOnly,
            uploadedAt: new Date().toISOString(), uploadedBy: '양곡 자동수집',
            sourceMailId: m.mailId, sourceAccount: acc.name,
            sourceMailSubject: m.subject, sourceMailBody: cleanMailBodyForDisplay(rawBody),
            passwordFound,
          });
          if (created) {
            existingIds.add(docId); legacyKeys.add(legacyKey); legacyKeys.add(regionFileKey);
            registered.push({ ...plan, fileName: a.filename });
            log(`    ✓ 적재 ${plan.region} ${plan.month}${plan.adminOnly ? ' 🔒' : ''} ${a.filename} (${Math.round(buf.length / 1024)}KB)`);
          }
        } catch (e) {
          log(`    ✗ 적재 실패 ${a.filename}: ${e.message.slice(0, 120)}`);
          failures.push({ name: `${acc.name}/적재`, reason: `${a.filename.slice(0, 30)}: ${e.message.slice(0, 60)}` });
        }
      }
    }
  }

  // 신규 적재 알림(내용 알림 — 장애 알림과 별개, 파일명은 PII 아님)
  if (COMMIT && registered.length > 0) {
    const lines = registered.slice(0, 10).map((r) => `· ${r.region} ${r.month}${r.adminOnly ? '(관리자전용)' : ''} — ${r.fileName.slice(0, 40)}`);
    await sendTelegram(`📬 [양곡 명단 자동적재] ${registered.length}건\n${lines.join('\n')}${registered.length > 10 ? `\n…외 ${registered.length - 10}건` : ''}\n→ https://wellshare-logis.web.app 명단 탭`);
  }

  if (COMMIT) await handleAlerts(failures, okAccounts); // dry-run은 부수효과 0 (알림 미발송)
  log(`=== 완료 — 신규 ${registered.length}건 · 계정 정상 ${okAccounts}/${ACCOUNTS.length} · 실패 ${failures.length}건 ===`);
}

main().catch(async (e) => {
  log(`치명 오류: ${e.message}`);
  try { await sendTelegram(`🚨 [양곡 명단수집 치명 오류]\n${e.message.slice(0, 200)}\n시각: ${kstNow()} (KST)`); } catch { /* noop */ }
  process.exit(1);
});
