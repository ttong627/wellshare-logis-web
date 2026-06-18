// 멱등성 상태머신 (Firestore: logis-TMS (default) DB).
// 운영 매출전표 중복 생성을 차단한다.
//  - 키는 서버가 생성: `${year}-${month}-${NFC정규화(region)}` (클라이언트 키 신뢰 안 함)
//  - 상태: pending → done(slipNos) | failed(재시도 가능)
//  - done + 동일 입력 → cached, done + 다른 입력 → conflict(409)
//  - 최근(<60s) pending → in_progress(409)
//  - 외부 HTTP(SaveSale)는 트랜잭션 밖에서 호출 (재시도 중복발행 방지)
import { Firestore } from '@google-cloud/firestore';
import { createHash } from 'crypto';

const COLLECTION = 'ecount_sales';

const db = new Firestore(); // ADC → logis-TMS (default)

export function normalizeRegion(region: string): string {
  return region.normalize('NFC').replace(/\s+/g, '').trim();
}

export function buildIdempotencyKey(comCode: string, year: number, month: number, region: string): string {
  return `${comCode}-${year}-${month}-${normalizeRegion(region)}`;
}

export function hashInput(input: unknown): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

export interface SaleRecord {
  status: 'pending' | 'done' | 'failed';
  inputHash: string;
  slipNos?: string[];
  total?: number;
  supply?: number;
  vat?: number;
  uid?: string;
  error?: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export type ClaimResult =
  | { action: 'proceed' }
  | { action: 'cached'; record: SaleRecord }
  | { action: 'conflict'; record: SaleRecord }
  | { action: 'in_progress'; record: SaleRecord };

// 트랜잭션으로 pending 클레임 또는 기존 상태 분기
// force=true: 관리자가 ECOUNT에서 기존 전표를 직접 삭제한 뒤 재발행하는 경우.
//   done 기록을 pending으로 덮어써 SaveSale 을 다시 호출(새 전표 생성)한다.
//   단, 동시에 처리중인 pending 은 force 라도 보호한다(중복 발행 방지).
export async function claim(key: string, inputHash: string, uid: string, force = false): Promise<ClaimResult> {
  const ref = db.collection(COLLECTION).doc(key);
  return db.runTransaction(async (tx): Promise<ClaimResult> => {
    const snap = await tx.get(ref);
    const now = Date.now();

    if (!snap.exists) {
      const rec: SaleRecord = { status: 'pending', inputHash, uid, createdAtMs: now, updatedAtMs: now };
      tx.set(ref, rec);
      return { action: 'proceed' };
    }

    const rec = snap.data() as SaleRecord;

    if (rec.status === 'done') {
      // 강제 재발행: 기존 done 을 pending 으로 재클레임 → 새 전표 발행 진행(동일/상이 입력 모두 허용)
      if (force) {
        tx.set(ref, { status: 'pending', inputHash, uid, createdAtMs: rec.createdAtMs ?? now, updatedAtMs: now });
        return { action: 'proceed' };
      }
      return rec.inputHash === inputHash ? { action: 'cached', record: rec } : { action: 'conflict', record: rec };
    }

    // pending(나이 무관) → in_progress. 비가역 매출전표라 자동 재시도(force 포함)로 중복발행하지 않는다.
    // 고아 pending(인스턴스 강제종료 등)은 ECOUNT 화면 확인 후 Firestore 문서 수동 삭제로 해제.
    if (rec.status === 'pending') {
      return { action: 'in_progress', record: rec };
    }

    // failed(SaveSale 예외로 전표 미생성 추정) → 재클레임 허용
    tx.set(ref, { status: 'pending', inputHash, uid, createdAtMs: rec.createdAtMs ?? now, updatedAtMs: now });
    return { action: 'proceed' };
  });
}

export async function markDone(
  key: string,
  data: { slipNos: string[]; total: number; supply: number; vat: number },
): Promise<void> {
  await db
    .collection(COLLECTION)
    .doc(key)
    .set({ status: 'done', ...data, updatedAtMs: Date.now() }, { merge: true });
}

export async function markFailed(key: string, error: string): Promise<void> {
  await db
    .collection(COLLECTION)
    .doc(key)
    .set({ status: 'failed', error: error.slice(0, 500), updatedAtMs: Date.now() }, { merge: true });
}
