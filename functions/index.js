'use strict';

// 알림 문서 생성 시 같은 target(ADMIN/회사명)의 기기 토큰으로 FCM 푸시를 직접 발송한다.
// firebase-admin은 프로젝트 서비스계정으로 동작 → Expo 푸시서비스·FCM키 업로드 불필요.

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { setGlobalOptions } = require('firebase-functions/v2');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();
setGlobalOptions({ region: 'asia-northeast3', maxInstances: 10 });

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
