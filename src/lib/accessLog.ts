// 명단(PII) 열람 기록 — 누가·무엇을·언제 받았는지 남긴다.
//
// ★왜 필요한가
//   개정 개인정보보호법(2026-09-11 시행)의 **72시간 유출 통지는 '인지한 때'부터** 센다.
//   변경(쓰기) 이력은 있어도 **열람(읽기) 기록이 없으면 유출을 인지할 수단 자체가 없다** —
//   통지 기한을 못 지키는 문제 이전에, 시계가 언제 시작됐는지도 모르는 상태가 된다.
//
// ★한계를 알고 쓴다
//   이 기록은 **클라이언트가 남긴다.** 악의적 사용자가 코드를 우회하면 안 남을 수 있다.
//   그래도 남기는 이유: ①정상 사용자의 이상 패턴(대량·심야·타지역)은 잡힌다
//   ②"기록이 아예 없다"와 "기록 체계는 있고 이 건이 우회됐다"는 대응 난이도가 다르다.
//   서버측 완전 기록이 필요하면 Storage 다운로드를 Cloud Function 프록시로 돌려야 한다(별건).
//
// ★기록에 개인정보를 담지 않는다
//   파일명·지역·월까지만 남긴다. 명단 **내용**은 절대 남기지 않는다.
//   (기록 자체가 또 하나의 유출 경로가 되면 안 된다)
import { addDoc, collection } from 'firebase/firestore';
import { db, APP_ID } from '../firebase';

export const ACCESS_LOGS_PATH = ['artifacts', APP_ID, 'public', 'data', 'access_logs'] as const;

export type RosterAccessAction = 'download' | 'refine' | 'preview';

export interface RosterAccessTarget {
  id: string;
  region?: string;
  month?: string;
  fileName?: string;
  adminOnly?: boolean;
}

export interface RosterAccessActor {
  uid?: string | null;
  email?: string | null;
  company?: string | null;
  isAdmin?: boolean;
}

/**
 * 명단 열람 1건을 기록한다.
 * ★기록 실패가 업무를 막으면 안 된다 — 조용히 삼키고 콘솔에만 남긴다.
 *   (다운로드가 로그 때문에 실패하면 현장이 선다. 보안 장치가 업무를 세우면 그게 더 큰 사고다)
 */
export async function logRosterAccess(
  actor: RosterAccessActor,
  target: RosterAccessTarget,
  action: RosterAccessAction,
): Promise<void> {
  try {
    await addDoc(collection(db, ...ACCESS_LOGS_PATH), {
      at: new Date().toISOString(),
      kind: 'roster',
      action,
      uid: actor.uid || '',
      email: actor.email || '',
      company: actor.company || (actor.isAdmin ? 'ADMIN' : ''),
      rosterId: target.id,
      region: target.region || '',
      month: target.month || '',
      fileName: target.fileName || '',
      adminOnly: target.adminOnly === true,
    });
  } catch (e) {
    console.warn('[access_logs] 열람 기록 실패(무시하고 계속):', (e as Error)?.message);
  }
}
