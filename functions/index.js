'use strict';

// 알림 문서 생성 시 같은 target(ADMIN/회사명)의 기기 토큰으로 FCM 푸시를 직접 발송한다.
// firebase-admin은 프로젝트 서비스계정으로 동작 → Expo 푸시서비스·FCM키 업로드 불필요.

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const { getAuth } = require('firebase-admin/auth');

initializeApp();
setGlobalOptions({ region: 'asia-northeast3', maxInstances: 10 });

// 하드코딩 관리자 이메일 (firestore.rules · src/constants/members.ts와 동일하게 유지)
const ADMIN_EMAILS = ['ttong@wssc.kr', 'ttong627@gmail.com', 'goodp1@hanmail.net'];
const APP_ID = 'wellshare-logis-v1-production-stable';

// 호출자가 관리자인지 검증: 하드코딩 관리자 이메일 OR partnerAccounts[email]==='ADMIN'(동적 관리자)
async function assertCallerIsAdmin(auth) {
  if (!auth) throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
  const email = auth.token && auth.token.email;
  if (email && ADMIN_EMAILS.includes(email)) return email;
  try {
    const snap = await getFirestore()
      .doc(`artifacts/${APP_ID}/public/data/settings/master_settings`)
      .get();
    const partnerAccounts = (snap.exists && snap.data() && snap.data().partnerAccounts) || {};
    if (email && partnerAccounts[email] === 'ADMIN') return email;
  } catch (e) {
    console.error('관리자 검증 중 설정 조회 실패:', e);
  }
  throw new HttpsError('permission-denied', '관리자만 사용할 수 있는 기능입니다.');
}

// ── 관리자가 회원사 계정의 비밀번호를 직접 설정 ─────────────────────────────
// 클라이언트 SDK로는 남의 비번을 바꿀 수 없어 admin SDK(updateUser)로만 가능하다.
exports.adminSetPassword = onCall(async (request) => {
  const callerEmail = await assertCallerIsAdmin(request.auth);

  const targetEmail = (request.data && request.data.email || '').toString().trim();
  const newPassword = (request.data && request.data.newPassword || '').toString();

  if (!targetEmail.includes('@')) {
    throw new HttpsError('invalid-argument', '대상 이메일이 올바르지 않습니다.');
  }
  if (newPassword.length < 6) {
    throw new HttpsError('invalid-argument', '비밀번호는 6자리 이상이어야 합니다.');
  }

  const adminAuth = getAuth();
  let userRecord;
  try {
    userRecord = await adminAuth.getUserByEmail(targetEmail);
  } catch {
    throw new HttpsError('not-found', '해당 이메일로 가입된 계정이 없습니다.');
  }

  try {
    await adminAuth.updateUser(userRecord.uid, { password: newPassword });
  } catch (e) {
    console.error('비밀번호 변경 실패:', e);
    throw new HttpsError('internal', '비밀번호 변경 중 오류가 발생했습니다.');
  }

  console.log(`관리자(${callerEmail})가 ${targetEmail} 비밀번호를 변경했습니다.`);
  return { ok: true, email: targetEmail };
});

exports.sendPushOnNotification = onDocumentCreated(
  'artifacts/{appId}/public/data/notifications/{notifId}',
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const data = snap.data() || {};
    const target = data.target;
    const message = (data.message || '').toString();
    if (!target || !message) return;

    const appId = event.params.appId;
    const db = getFirestore();

    let tokensSnap;
    try {
      tokensSnap = await db
        .collection(`artifacts/${appId}/public/data/pushTokens`)
        .where('target', '==', target)
        .get();
    } catch (e) {
      console.error('pushTokens 조회 실패:', e);
      return;
    }

    const docs = tokensSnap.docs;
    const tokens = docs.map((d) => (d.data() || {}).token).filter((t) => typeof t === 'string' && t.length > 0);
    if (tokens.length === 0) {
      console.log(`발송 대상 토큰 없음 (target=${target})`);
      return;
    }

    const title = target === 'ADMIN' ? '정부양곡정산 · 관리자' : '정부양곡정산';

    let resp;
    try {
      resp = await getMessaging().sendEachForMulticast({
        tokens,
        notification: { title, body: message },
        android: {
          priority: 'high',
          notification: { channelId: 'default', sound: 'default' },
        },
        data: { target: String(target) },
      });
    } catch (e) {
      console.error('FCM 발송 실패:', e);
      return;
    }

    console.log(`FCM 발송: 성공 ${resp.successCount} / 실패 ${resp.failureCount} (target=${target})`);

    // 무효(만료·미등록) 토큰은 자동 정리
    const invalidRefs = [];
    resp.responses.forEach((r, i) => {
      if (!r.success && r.error) {
        const code = r.error.code;
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token' ||
          code === 'messaging/invalid-argument'
        ) {
          invalidRefs.push(docs[i].ref);
        }
      }
    });
    await Promise.all(invalidRefs.map((ref) => ref.delete().catch(() => {})));
  }
);

// ══════════════════════════════════════════════════════════════════
//  명단(PII) 열람 감시 알림  (개인정보보호 대응 · 2026-08-14)
//
//  ★기록만 남기면 아무도 안 본다 — 기록이 들어오는 **즉시** 규칙을 돌리고 사람에게 보낸다.
//  ★개정 개인정보보호법(2026-09-11)의 72시간 통지는 '인지'가 전제다. 이 함수가 그 '인지'를 만든다.
//
//  설정(없으면 서버 로그에만 남는다 — 그래도 죽지 않는다):
//    TELEGRAM_BOT_TOKEN · TELEGRAM_CHAT_ID
//  ★v2 는 `secrets:` 로 **선언한 것만** process.env 에 주입한다. 선언을 빼면 값을 넣어도
//    영영 안 들어와 계속 `(미발송)` 이 찍힌다 — 배포는 성공하니 착각하기 딱 좋은 자리다.
//    (2026-08-13 nexus leakAlert 에서 실제로 데었다)
//  판정 규칙·임계값은 `./rosterWatch.js`(회귀 scripts/roster-watch.test.mjs) 참조.
// ══════════════════════════════════════════════════════════════════
const { defineSecret } = require('firebase-functions/params');
const { detectAnomalies, formatAlert, DEFAULTS } = require('./rosterWatch');

const TELEGRAM_BOT_TOKEN = defineSecret('TELEGRAM_BOT_TOKEN');
const TELEGRAM_CHAT_ID = defineSecret('TELEGRAM_CHAT_ID');

const sendTelegram = async (text) => {
  const tok = process.env.TELEGRAM_BOT_TOKEN || '';
  const chat = process.env.TELEGRAM_CHAT_ID || '';
  if (!tok || !chat) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text }),
    });
    return res.ok;
  } catch (e) {
    // ★발송 실패가 감시를 멈추면 안 된다. 조용히 넘기되 로그엔 남긴다.
    console.warn('[rosterAlert] 텔레그램 발송 실패:', e && e.message);
    return false;
  }
};

exports.rosterAlert = onDocumentCreated(
  {
    document: `artifacts/${APP_ID}/public/data/access_logs/{logId}`,
    memory: '256MiB',
    secrets: [TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID],
  },
  async (event) => {
    const cur = event.data && event.data.data();
    if (!cur || cur.kind !== 'roster') return;
    try {
      // 같은 행위자의 최근 기록만 모은다. uid 가 없으면(이례적) 이메일로 본다 —
      // ★"누구인지 모른다"고 감시를 건너뛰면 그 구간이 통째로 사각이 된다.
      const sinceIso = new Date(Date.now() - DEFAULTS.windowMin * 60 * 1000).toISOString();
      const col = getFirestore().collection(`artifacts/${APP_ID}/public/data/access_logs`);
      const key = cur.uid ? ['uid', cur.uid] : ['email', cur.email || ''];
      const snap = await col
        .where('at', '>=', sinceIso)
        .where(key[0], '==', key[1])
        .limit(500)
        .get();
      const rows = snap.docs.map((d) => d.data());

      const findings = detectAnomalies(rows, {});
      if (!findings.length) return;

      const text = formatAlert({ email: cur.email, uid: cur.uid, company: cur.company }, findings)
        + `\n최근 지역: ${[...new Set(rows.map((r) => r.region).filter(Boolean))].join('·') || '?'}`;
      const sent = await sendTelegram(text);
      // 채널이 없어도 최소한 서버 로그엔 남는다.
      console.warn(`[rosterAlert]${sent ? '' : '(미발송)'} ${text.replace(/\n/g, ' | ')}`);
    } catch (e) {
      console.error('[rosterAlert] 판정 실패:', e);
    }
  },
);
