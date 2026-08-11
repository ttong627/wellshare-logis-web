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
